import base64
import copy
import io
import json
import logging
import mimetypes
import os
import threading
import time

import numpy as np
from PIL import Image

import modules.config
import modules.canvas_danbooru_prompt_review as canvas_danbooru_prompt_review
import modules.canvas_vlm_agent as canvas_vlm_agent
import modules.canvas_workbench_assets as canvas_workbench_assets
import modules.describe_media as describe_media
import modules.model_loader as model_loader
import modules.util as util
import modules.vlm_api_profiles as vlm_api_profiles
import shared
from enhanced.vlm import VLM, vlm
from enhanced.llamacpp_vlm import llamacpp_vlm
from modules.access_mode import user_can_download_models
from modules.custom_llm_api import (
    api_format_supported,
    custom_llm_url,
    extract_response_metadata,
    extract_response_text,
    models_url,
    prepare_completion_request,
    request_json,
)
from modules.model_path_utils import find_model_in_dirs

logger = logging.getLogger(__name__)
_CANVAS_VLM_CANCEL_TTL_SECONDS = 1800
_CANVAS_VLM_CANCELLED_REQUESTS = {}
_CANVAS_VLM_CANCELLED_REQUESTS_LOCK = threading.Lock()


def _canvas_vlm_cancel_key(project_id="", node_id="", conversation_id="", request_id=""):
    return (
        str(project_id or "").strip(),
        str(node_id or "").strip(),
        str(conversation_id or "").strip(),
        str(request_id or "").strip(),
    )


def _canvas_vlm_prune_cancelled_requests(now=None):
    current = time.monotonic() if now is None else now
    expired = [
        key
        for key, stamp in _CANVAS_VLM_CANCELLED_REQUESTS.items()
        if current - stamp > _CANVAS_VLM_CANCEL_TTL_SECONDS
    ]
    for key in expired:
        _CANVAS_VLM_CANCELLED_REQUESTS.pop(key, None)


def request_canvas_vlm_cancel(project_id="", node_id="", conversation_id="", request_id=""):
    key = _canvas_vlm_cancel_key(project_id, node_id, conversation_id, request_id)
    if not any(key):
        return {"ok": True, "cancelled": True, "project_id": "", "node_id": "", "conversation_id": "", "request_id": ""}
    with _CANVAS_VLM_CANCELLED_REQUESTS_LOCK:
        _canvas_vlm_prune_cancelled_requests()
        _CANVAS_VLM_CANCELLED_REQUESTS[key] = time.monotonic()
    return {
        "ok": True,
        "cancelled": True,
        "project_id": key[0],
        "node_id": key[1],
        "conversation_id": key[2],
        "request_id": key[3],
    }


def clear_canvas_vlm_cancel(project_id="", node_id="", conversation_id="", request_id=""):
    key = _canvas_vlm_cancel_key(project_id, node_id, conversation_id, request_id)
    node_key = (key[0], key[1], "", "")
    conversation_key = (key[0], key[1], key[2], "")
    with _CANVAS_VLM_CANCELLED_REQUESTS_LOCK:
        for candidate in {key, node_key, conversation_key}:
            _CANVAS_VLM_CANCELLED_REQUESTS.pop(candidate, None)


def is_canvas_vlm_cancelled(project_id="", node_id="", conversation_id="", request_id=""):
    key = _canvas_vlm_cancel_key(project_id, node_id, conversation_id, request_id)
    node_key = (key[0], key[1], "", "")
    conversation_key = (key[0], key[1], key[2], "")
    with _CANVAS_VLM_CANCELLED_REQUESTS_LOCK:
        _canvas_vlm_prune_cancelled_requests()
        return (
            key in _CANVAS_VLM_CANCELLED_REQUESTS
            or (bool(key[1]) and node_key in _CANVAS_VLM_CANCELLED_REQUESTS)
            or (bool(key[2]) and conversation_key in _CANVAS_VLM_CANCELLED_REQUESTS)
        )


def _canvas_vlm_cancelled_response(project_id="", node_id="", conversation_id="", request_id="", mode="chat"):
    clear_canvas_vlm_cancel(project_id, node_id, conversation_id, request_id)
    return {
        "ok": False,
        "cancelled": True,
        "project_id": str(project_id or "").strip(),
        "node_id": str(node_id or "").strip(),
        "conversation_id": str(conversation_id or "").strip() if mode == "chat" else None,
        "request_id": str(request_id or "").strip(),
        "error": "Stopped.",
        "details": "Stopped by user.",
        "mode": mode,
    }

def _canvas_vlm_resolve_version(value):
    text = str(value or "").strip()
    profile_version = vlm_api_profiles.resolve_profile_version(text)
    if profile_version:
        return profile_version
    if text == "Custom" or "Custom" in text.split():
        return "Custom"
    if text in VLM.VERSIONS:
        return text
    item = VLM.get_version_catalog_item(text) if text else None
    if item:
        return str(item.get("id") or text)
    if text.endswith("-Thinking"):
        base_version = text[:-len("-Thinking")]
        if base_version in VLM.VERSIONS:
            return base_version
    catalog_items = VLM.get_model_catalog().get("items") or []
    for catalog_item in sorted(catalog_items, key=lambda row: len(str(row.get("id") or "")), reverse=True):
        version = str(catalog_item.get("id") or "")
        label = str(catalog_item.get("display_label") or catalog_item.get("label") or "")
        if version and (version in text or (label and label in text)):
            return version
    return text or VLM.DEFAULT_VERSION

def _canvas_vlm_runtime_timings(params):
    if not isinstance(params, dict):
        return {}
    timings = params.get("_runtime_timings")
    if not isinstance(timings, dict):
        timings = {}
        params["_runtime_timings"] = timings
    return timings


def _canvas_vlm_add_timing(params, name, elapsed):
    timings = _canvas_vlm_runtime_timings(params)
    timings[str(name)] = timings.get(str(name), 0.0) + max(0.0, float(elapsed or 0.0))


def _canvas_vlm_timing_snapshot(params):
    timings = params.get("_runtime_timings") if isinstance(params, dict) else {}
    if not isinstance(timings, dict):
        return {}
    return {key: round(float(value or 0.0), 3) for key, value in timings.items()}


def _canvas_vlm_store_two_stage_meta(params, meta):
    if not isinstance(params, dict) or not isinstance(meta, dict) or not meta.get("valid"):
        return False
    params["_two_stage_intent"] = meta
    params["_two_stage_intent_locks"] = meta.get("locks") or {}
    return True


def _canvas_vlm_apply_two_stage_meta(params, payload, prompt, meta):
    if not _canvas_vlm_store_two_stage_meta(params, meta):
        return False
    started = time.monotonic()
    params["system_prompt"] = canvas_vlm_agent.build_vlm_agent_system_prompt(params, payload, prompt)
    _canvas_vlm_add_timing(params, "two_stage_system_prompt_prepare", time.monotonic() - started)
    return True

def canvas_vlm_model_status(payload):
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    user_context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    version_name = _canvas_vlm_resolve_version(params.get("version") or VLM.current_version or VLM.DEFAULT_VERSION)
    profile = vlm_api_profiles.apply_profile_to_params(params, version_name)
    if vlm_api_profiles.is_profile_version(version_name) and not profile:
        return {
            "ok": False,
            "ready": False,
            "state": "error",
            "version": version_name,
            "error": "Unknown VLM API profile",
            "message": "The selected VLM API profile no longer exists.",
        }
    if version_name == "Custom" or profile:
        base_url = str(params.get("custom_base_url") or "").strip()
        model = str(params.get("custom_model") or "").strip()
        api_format = str(params.get("custom_api_format") or "openai_compatible").strip()
        missing = []
        if not base_url:
            missing.append("API Base URL")
        if not model:
            missing.append("Model")
        if not api_format_supported(api_format):
            missing.append(f"Unsupported API format: {api_format}")
        ready = not missing
        return {
            "ok": True,
            "ready": ready,
            "state": "ready" if ready else "custom",
            "version": version_name,
            "backend": "custom_api",
            "model": model,
            "missing_count": 0,
            "missing_models": [],
            "can_download": False,
            "message": (
                f"API profile {profile.get('name')} is ready."
                if ready and profile
                else "Custom API is ready."
                if ready
                else f"Custom API settings incomplete: {', '.join(missing)}."
            ),
        }
    config_data = VLM.get_version_config(version_name)
    if not config_data:
        return {
            "ok": False,
            "ready": False,
            "state": "error",
            "version": version_name,
            "error": "Unknown VLM model version",
            "message": f"Unknown VLM model version: {version_name}",
        }

    model_name = config_data.get("model") or version_name
    backend = str(config_data.get("backend") or ("llamacpp" if config_data.get("is_llamacpp") else "transformers"))
    missing = []

    def add_missing(cata, path_file, url="", size=0):
        task_key = f"{cata}/{str(path_file).strip('[]')}".replace("\\", "/").strip("/")
        missing.append({
            "cata": cata,
            "path_file": path_file,
            "human_size": "" if not size else util.get_filesize(size) if hasattr(util, "get_filesize") else str(size),
            "url": url or "",
            "size": int(size or 0),
            "download_status": copy.deepcopy(model_loader.get_download_status(task_key) or {}),
        })

    model_urls = config_data.get("model_urls") or {}
    if backend == "comfy_textgen":
        clip_name = str(config_data.get("clip_name") or config_data.get("model_file") or model_name)
        if not find_model_in_dirs(VLM._text_encoder_roots(), clip_name):
            add_missing(
                "text_encoders",
                clip_name.replace("\\", "/"),
                url=config_data.get("model_url") or "",
                size=config_data.get("model_size") or 0,
            )
    elif model_urls:
        for file_name, url in model_urls.items():
            rel = os.path.join(model_name, file_name)
            if not find_model_in_dirs(modules.config.paths_LLM, rel):
                add_missing("LLM", rel.replace("\\", "/"), url=url)
    else:
        model_file_name = config_data.get("model_file")
        rel = os.path.join(model_name, model_file_name) if model_file_name else os.path.join(model_name, model_name)
        search_dirs = modules.config.paths_LLM if backend == "llamacpp" else modules.config.paths_llms
        if backend == "llamacpp" and model_file_name:
            rel = str(model_file_name)
        if not find_model_in_dirs(search_dirs, rel):
            if config_data.get("model_url") and str(config_data.get("model_url")).endswith(".zip"):
                add_missing("llms", f"[{model_name}]", url=config_data.get("model_url"))
            else:
                add_missing("LLM" if backend == "llamacpp" else "llms", rel.replace("\\", "/"), url=config_data.get("model_url") or "")
        mmproj_file = str(config_data.get("mmproj_file") or "").strip()
        if backend == "llamacpp" and mmproj_file and not find_model_in_dirs(search_dirs, mmproj_file):
            add_missing("LLM", mmproj_file.replace("\\", "/"))

    user_did = user_context.get("user_did") or payload.get("user_did")
    can_download = (
        user_can_download_models(user_did)
        and not bool(getattr(shared.args, "disable_backend", False))
        and all(str(item.get("url") or "").strip() for item in missing)
    )
    ready = len(missing) == 0
    runtime_status = None
    if backend == "llamacpp":
        runtime_status = llamacpp_vlm.get_runtime_status(params.get("vram_policy"))
    return {
        "ok": True,
        "ready": ready,
        "state": "ready" if ready else "missing",
        "version": version_name,
        "backend": backend,
        "model": model_name,
        "missing_count": len(missing),
        "missing_models": missing,
        "can_download": bool(can_download),
        "download_disabled": not bool(can_download),
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": "VLM model files are ready." if ready else f"{len(missing)} VLM model file(s) are missing. Download before running.",
        "vram_policy": (runtime_status or {}).get("policy") or str(params.get("vram_policy") or "extreme"),
        "runtime_status": runtime_status,
    }

def canvas_queue_vlm_model_downloads(payload):
    status = canvas_vlm_model_status(payload)
    if not status.get("ok") or status.get("ready"):
        return status
    if not status.get("can_download"):
        return dict(status, ok=False, error="model download is not allowed for the current user or backend mode")
    single = payload.get("missing_model") if isinstance(payload.get("missing_model"), dict) else None
    rows = [single] if single else list(status.get("missing_models") or [])
    user_context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    user_did = user_context.get("user_did") or payload.get("user_did")
    queued = []
    for item in rows:
        if not isinstance(item, dict):
            continue
        task_id = model_loader.download_model_entry(
            item.get("cata") or "LLM",
            item.get("path_file") or "",
            size=item.get("size") or 0,
            url=item.get("url") or None,
            user_did=user_did,
            async_task=True,
        )
        if task_id:
            queued.append(task_id)
    refreshed = canvas_vlm_model_status(payload)
    return dict(refreshed, ok=True, state="queued", queued_count=len(queued), queued=queued, message=f"Queued {len(queued)} VLM model download task(s).")


def canvas_custom_llm_url(base_url, suffix):
    return custom_llm_url(base_url, suffix)

def canvas_custom_llm_request_json(url, payload=None, api_key="", method="POST", timeout=120):
    return request_json(url, payload, api_key=api_key, method=method, timeout=timeout)


def canvas_custom_llm_completion_request(base_url, api_key, api_format, payload, timeout=120):
    url, request_payload = prepare_completion_request(base_url, api_format, payload)
    return canvas_custom_llm_request_json(
        url,
        request_payload,
        api_key=api_key,
        method="POST",
        timeout=timeout,
    )

def canvas_image_to_data_url(image, max_side=0, jpeg_quality=85):
    pil_image = image.copy() if isinstance(image, Image.Image) else Image.fromarray(np.asarray(image).astype(np.uint8, copy=False))
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")
    try:
        max_side = int(max_side or 0)
    except Exception:
        max_side = 0
    if max_side > 0:
        width, height = pil_image.size
        longest = max(width, height)
        if longest > max_side:
            scale = max_side / float(longest)
            target = (max(1, round(width * scale)), max(1, round(height * scale)))
            resampling = getattr(Image, "Resampling", Image).LANCZOS
            pil_image = pil_image.resize(target, resampling)
    try:
        jpeg_quality = max(1, min(int(jpeg_quality), 95))
    except Exception:
        jpeg_quality = 85
    output = io.BytesIO()
    pil_image.save(output, format="JPEG", quality=jpeg_quality, optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def canvas_file_to_data_url(path, mime="", max_side=0, jpeg_quality=85):
    import mimetypes

    mime = mime or mimetypes.guess_type(str(path or ""))[0] or "image/png"
    try:
        max_side = int(max_side or 0)
    except Exception:
        max_side = 0
    if max_side > 0 and (mime.startswith("image/") or describe_media.media_type(path) == "image"):
        try:
            with Image.open(path) as image:
                return canvas_image_to_data_url(image, max_side=max_side, jpeg_quality=jpeg_quality)
        except Exception as exc:
            logger.warning("Canvas VLM image compression skipped; sending original asset: %s", exc)
    with open(path, "rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    return f"data:{mime};base64,{encoded}"

def canvas_extract_openai_text(response):
    return extract_response_text(response)

def canvas_custom_llm_models(payload):
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    base_url = str(params.get("custom_base_url") or "").strip()
    api_key = str(payload.get("api_key") or params.get("custom_api_key") or "").strip()
    api_format = str(params.get("custom_api_format") or "openai_compatible").strip()
    if not api_format_supported(api_format):
        return {"ok": False, "error": f"Unsupported Custom API format: {api_format}"}
    if not base_url:
        return {"ok": False, "error": "API Base URL is required."}
    try:
        data = canvas_custom_llm_request_json(models_url(base_url), None, api_key=api_key, method="GET", timeout=30)
        rows = data.get("data") if isinstance(data, dict) else []
        models = []
        for item in rows or []:
            if isinstance(item, dict) and item.get("id"):
                models.append(str(item.get("id")))
            elif isinstance(item, str):
                models.append(item)
        return {"ok": True, "models": sorted(list(dict.fromkeys(models))), "raw_count": len(rows or [])}
    except Exception as exc:
        return {"ok": False, "error": "Custom LLM model list failed", "details": str(exc)}


def canvas_custom_llm_run(payload, params, prompt, asset_refs, conversation_id, mode):
    custom_started = time.monotonic()
    base_url = str(params.get("custom_base_url") or "").strip()
    api_key = str(params.get("custom_api_key") or payload.get("api_key") or "").strip()
    model = str(params.get("custom_model") or "").strip()
    api_format = str(params.get("custom_api_format") or "openai_compatible").strip()
    supports_images = bool(params.get("custom_supports_images", True))
    disable_thinking = bool(params.get("disable_thinking"))
    try:
        h3_visual_reference_max_side = max(0, min(int(params.get("h3_visual_reference_max_side") or 0), 4096))
    except Exception:
        h3_visual_reference_max_side = 0
    if not api_format_supported(api_format):
        return {"ok": False, "error": f"Unsupported Custom API format: {api_format}"}
    if not base_url or not model:
        return {"ok": False, "error": "Custom API settings are incomplete.", "details": "API Base URL and Model are required."}

    def prepare_custom_request(request):
        prepared = dict(request or {})
        if disable_thinking:
            prepared["chat_template_kwargs"] = {"enable_thinking": False}
        return prepared

    two_stage_intent_meta = None
    two_stage_requested = canvas_vlm_agent.two_stage_intent_enabled(payload, params, prompt)
    if two_stage_requested:
        local_stage_started = time.monotonic()
        two_stage_intent_meta = canvas_vlm_agent.local_two_stage_intent_response(payload, params, prompt)
        _canvas_vlm_add_timing(params, "two_stage_local_fast_path", time.monotonic() - local_stage_started)
        if _canvas_vlm_apply_two_stage_meta(params, payload, prompt, two_stage_intent_meta):
            logger.info("Custom VLM two-stage intent satisfied by local deterministic locks; skipping Stage1 API call.")
        else:
            two_stage_intent_meta = None
    if two_stage_requested and not isinstance(two_stage_intent_meta, dict):
        try:
            stage_started = time.monotonic()
            intent_prompt = canvas_vlm_agent.build_two_stage_intent_prompt(payload, params, prompt)
            intent_request = prepare_custom_request({
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You extract concise image intent as JSON only. Do not write final prompts.",
                    },
                    {"role": "user", "content": intent_prompt},
                ],
                "temperature": 0.0,
                "top_p": 0.5,
                "max_tokens": max(128, min(int(params.get("two_stage_intent_max_tokens") or 256), 1024)),
            })
            if int(params.get("seed", -1)) >= 0:
                intent_request["seed"] = int(params.get("seed"))
            intent_response = canvas_custom_llm_completion_request(
                base_url,
                api_key,
                api_format,
                intent_request,
                timeout=120,
            )
            intent_text = canvas_extract_openai_text(intent_response).strip()
            two_stage_intent_meta = canvas_vlm_agent.parse_two_stage_intent_response(intent_text, payload, params, prompt)
            _canvas_vlm_apply_two_stage_meta(params, payload, prompt, two_stage_intent_meta)
            _canvas_vlm_add_timing(params, "two_stage_api_call", time.monotonic() - stage_started)
        except Exception as exc:
            logger.warning("Custom VLM two-stage intent extraction skipped: %s", exc)

    messages = []
    system_prompt = str(params.get("system_prompt") or "").strip()
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    history_stats = {"omitted": 0, "chars": 0, "max_history": 0, "budget": 0}
    if mode == "chat":
        history, history_stats = canvas_vlm_agent.vlm_rolling_history(payload, params, "Custom")
        for item in history:
            role = "assistant" if item.get("role") == "assistant" else "user"
            content = str(item.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})

    image_parts = []
    if supports_images:
        for ref in asset_refs or []:
            if not isinstance(ref, dict):
                continue
            path = ref.get("path")
            mime = str(ref.get("mime") or "")
            if not path or not os.path.exists(path):
                continue
            try:
                if mime.startswith("video/") or describe_media.media_type(path) == "video":
                    contact_sheet, _ = describe_media.prepare_visual_input(path, use_multi_frame=False)
                    image_parts.append({
                        "type": "image_url",
                        "image_url": {"url": canvas_image_to_data_url(
                            contact_sheet,
                            max_side=h3_visual_reference_max_side,
                            jpeg_quality=86,
                        )},
                    })
                    continue
                if mime and not mime.startswith("image/"):
                    continue
                image_parts.append({
                    "type": "image_url",
                    "image_url": {"url": canvas_file_to_data_url(
                        path,
                        mime,
                        max_side=h3_visual_reference_max_side,
                        jpeg_quality=85,
                    )}
                })
            except Exception as exc:
                logger.warning("Custom VLM image encode skipped: %s", exc)

    if image_parts:
        messages.append({"role": "user", "content": [{"type": "text", "text": prompt}] + image_parts})
    else:
        messages.append({"role": "user", "content": prompt})

    max_tokens = int(params.get("max_tokens", 1024))
    request_payload = prepare_custom_request({
        "model": model,
        "messages": messages,
        "temperature": float(params.get("temperature", 0.8)),
        "top_p": float(params.get("top_p", 0.9)),
        "max_tokens": max_tokens,
    })
    if int(params.get("seed", -1)) >= 0:
        request_payload["seed"] = int(params.get("seed"))
    main_started = time.monotonic()
    response = canvas_custom_llm_completion_request(
        base_url,
        api_key,
        api_format,
        request_payload,
        timeout=180,
    )
    _canvas_vlm_add_timing(params, "custom_main_api_call", time.monotonic() - main_started)
    completion = extract_response_metadata(response)
    completion.update({"api_format": api_format, "max_tokens": max_tokens})
    text = canvas_extract_openai_text(response).strip()

    def review_llm_fn(messages, review_payload):
        review_request = prepare_custom_request({
            "model": str(params.get("danbooru_review_model") or model),
            "messages": messages,
            "temperature": 0.1,
            "top_p": 0.8,
            "max_tokens": int(params.get("danbooru_review_max_tokens") or 800),
        })
        review_response = canvas_custom_llm_completion_request(
            base_url,
            api_key,
            api_format,
            review_request,
            timeout=120,
        )
        return canvas_extract_openai_text(review_response).strip()

    draft_retry_meta = None
    draft_repair_meta = None
    agent_actions = [] if canvas_vlm_agent.vlm_agent_mode(params) == "raw" else canvas_vlm_agent.extract_vlm_agent_actions(text)
    draft_validation = canvas_vlm_agent.validate_llm_draft_response(text, agent_actions, payload, params, prompt)
    if draft_validation.get("retry_required") and not bool(params.get("disable_llm_draft_retry")):
        retry_started = time.monotonic()
        retry_prompt = canvas_vlm_agent.build_llm_draft_retry_prompt(payload, params, prompt, text, draft_validation)
        retry_messages = []
        if system_prompt:
            retry_messages.append({"role": "system", "content": system_prompt})
        if image_parts:
            retry_messages.append({"role": "user", "content": [{"type": "text", "text": retry_prompt}] + image_parts})
        else:
            retry_messages.append({"role": "user", "content": retry_prompt})
        retry_max_tokens = max(max_tokens, 1024)
        retry_request = prepare_custom_request({
            "model": model,
            "messages": retry_messages,
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": retry_max_tokens,
        })
        retry_response = canvas_custom_llm_completion_request(
            base_url,
            api_key,
            api_format,
            retry_request,
            timeout=180,
        )
        _canvas_vlm_add_timing(params, "custom_draft_retry_api_call", time.monotonic() - retry_started)
        retry_text = canvas_extract_openai_text(retry_response).strip()
        retry_completion = extract_response_metadata(retry_response)
        retry_completion.update({"api_format": api_format, "max_tokens": retry_max_tokens})
        retry_actions = canvas_vlm_agent.extract_vlm_agent_actions(retry_text)
        retry_validation = canvas_vlm_agent.validate_llm_draft_response(retry_text, retry_actions, payload, params, prompt)
        draft_retry_meta = {
            "attempted": True,
            "initial_issues": draft_validation.get("issues") or [],
            "retry_issues": retry_validation.get("issues") or [],
            "retry_valid": bool(retry_validation.get("valid")),
            "retry_required": True,
        }
        if retry_text:
            text = retry_text
            completion = retry_completion
        agent_actions = retry_actions if retry_validation.get("valid") else []
    elif draft_validation.get("issues"):
        draft_repair_meta = {
            "issues": draft_validation.get("issues") or [],
            "retry_required": False,
        }
    repair_started = time.monotonic()
    agent_actions = canvas_vlm_agent.repair_vlm_agent_actions(
        agent_actions,
        payload,
        params,
        prompt,
        review_llm_fn=review_llm_fn if (params.get("enable_prompt_review") or params.get("enable_danbooru_review")) else None,
        assistant_text=text,
    )
    _canvas_vlm_add_timing(params, "repair_actions", time.monotonic() - repair_started)
    if two_stage_requested and not (isinstance(two_stage_intent_meta, dict) and two_stage_intent_meta.get("valid")):
        backfill_started = time.monotonic()
        backfilled_meta = canvas_vlm_agent.backfill_two_stage_intent_response(payload, params, prompt, agent_actions)
        _canvas_vlm_add_timing(params, "two_stage_contract_backfill", time.monotonic() - backfill_started)
        if _canvas_vlm_store_two_stage_meta(params, backfilled_meta):
            two_stage_intent_meta = backfilled_meta
            logger.info("Custom VLM two-stage intent contract backfilled from repaired image action.")
    if draft_retry_meta:
        for action in agent_actions or []:
            if isinstance(action, dict) and action.get("action") in {"generate_image", "text_to_image"}:
                action["llm_draft_retry"] = "true"
                action["retry_reason"] = "; ".join(draft_retry_meta.get("initial_issues") or [])[:500]
                action["draft_validation_issues"] = draft_retry_meta.get("retry_issues") or draft_retry_meta.get("initial_issues") or []
    elif draft_repair_meta:
        for action in agent_actions or []:
            if isinstance(action, dict) and action.get("action") in {"generate_image", "text_to_image"}:
                action["llm_draft_repair_issues"] = draft_repair_meta.get("issues") or []
                action["llm_draft_retry_required"] = False
    display_text = canvas_vlm_agent.vlm_agent_display_text(text, agent_actions, params)
    if not display_text and isinstance(two_stage_intent_meta, dict):
        display_text = str(two_stage_intent_meta.get("understanding") or "").strip()
    response_params = {
        "prompt": prompt,
        "model": model,
        "supports_images": supports_images,
        "max_tokens": max_tokens,
        "rolling_context": history_stats,
    }
    if params.get("custom_profile_id"):
        response_params["profile_id"] = str(params.get("custom_profile_id") or "")
        response_params["profile_name"] = str(params.get("custom_api_name") or "")
    else:
        response_params["base_url"] = base_url
    usage = completion.get("usage") if isinstance(completion.get("usage"), dict) else {}
    logger.info(
        "Custom VLM completion: status=%s, finish_reason=%s, reason=%s, output_limited=%s, max_tokens=%s, result_chars=%s, input_tokens=%s, output_tokens=%s, total_tokens=%s",
        completion.get("status"),
        completion.get("finish_reason"),
        completion.get("reason"),
        bool(completion.get("output_limited")),
        completion.get("max_tokens"),
        len(text),
        usage.get("input_tokens", usage.get("prompt_tokens")),
        usage.get("output_tokens", usage.get("completion_tokens")),
        usage.get("total_tokens"),
    )
    _canvas_vlm_add_timing(params, "custom_total", time.monotonic() - custom_started)
    timings = _canvas_vlm_timing_snapshot(params)
    if timings:
        response_params["timings"] = timings
    if isinstance(two_stage_intent_meta, dict):
        response_params["two_stage_intent"] = {
            "valid": bool(two_stage_intent_meta.get("valid")),
            "issues": two_stage_intent_meta.get("issues") or [],
            "understanding": two_stage_intent_meta.get("understanding") or "",
            "contract": two_stage_intent_meta.get("contract") or {},
            "contract_issues": two_stage_intent_meta.get("contract_issues") or [],
            "confidence": two_stage_intent_meta.get("confidence"),
            "local_fast_path": bool(two_stage_intent_meta.get("local_fast_path")),
            "local_signal_level": two_stage_intent_meta.get("local_signal_level") or "",
            "locks": two_stage_intent_meta.get("locks") or {},
        }

    return {
        "ok": True,
        "text": display_text,
        "raw_text": text if display_text != text else "",
        "agent_actions": agent_actions,
        "version": str(params.get("custom_profile_version") or "Custom"),
        "provider": params.get("custom_provider") or "custom",
        "model": model,
        "asset_refs": asset_refs,
        "used_images": len(image_parts),
        "mode": mode,
        "conversation_id": conversation_id if mode == "chat" else None,
        "completion": completion,
        "params": response_params,
    }

def canvas_vlm_run(payload):
    run_started = time.monotonic()

    def clamp_number(value, default, min_value=None, max_value=None):
        try:
            number = float(value)
        except Exception:
            number = float(default)
        if min_value is not None:
            number = max(float(min_value), number)
        if max_value is not None:
            number = min(float(max_value), number)
        return number

    def clamp_int(value, default, min_value=None, max_value=None):
        return int(round(clamp_number(value, default, min_value, max_value)))

    payload = payload if isinstance(payload, dict) else {}
    params = dict(payload.get("params") if isinstance(payload.get("params"), dict) else {})
    project_id = str(payload.get("project_id") or "default").strip() or "default"
    node_id = str(payload.get("node_id") or params.get("node_id") or "vlm").strip() or "vlm"
    request_id = str(params.get("request_id") or payload.get("request_id") or "").strip()
    params["request_id"] = request_id
    _canvas_vlm_runtime_timings(params)
    stage_started = time.monotonic()
    version_name = _canvas_vlm_resolve_version(params.get("version") or VLM.current_version or VLM.DEFAULT_VERSION)
    profile = vlm_api_profiles.apply_profile_to_params(params, version_name)
    if vlm_api_profiles.is_profile_version(version_name) and not profile:
        return {
            "ok": False,
            "error": "Unknown VLM API profile",
            "details": "The selected VLM API profile no longer exists.",
        }
    is_custom_api = version_name == "Custom" or bool(profile)
    model_status = canvas_vlm_model_status(payload)
    _canvas_vlm_add_timing(params, "model_status_gate", time.monotonic() - stage_started)
    if not model_status.get("ready"):
        return {
            "ok": False,
            "error": "VLM model files are missing",
            "details": model_status.get("message") or "Download the VLM model before running.",
            "model_status": model_status,
        }

    stage_started = time.monotonic()
    prompt = str(params.get("prompt") or VLM.prompt_i2t).strip() or VLM.prompt_i2t
    if bool(params.get("output_chinese")):
        prompt = f"{prompt}, {VLM.output_chinese}"
    mode = str(params.get("mode") or "single").strip().lower()
    conversation_id = str(
        params.get("conversation_id")
        or payload.get("conversation_id")
        or f"{project_id}:{node_id}"
    )
    if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
        return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
    raw_user_system_prompt = str(params.get("user_system_prompt") or params.get("system_prompt") or "").strip()
    params["user_system_prompt"] = raw_user_system_prompt
    two_stage_requested = canvas_vlm_agent.two_stage_intent_enabled(payload, params, prompt)
    _canvas_vlm_add_timing(params, "prompt_mode_and_two_stage_gate", time.monotonic() - stage_started)
    agent_system_prompt_built = False
    stage_started = time.monotonic()
    if two_stage_requested:
        params["system_prompt"] = raw_user_system_prompt
    else:
        params["system_prompt"] = canvas_vlm_agent.build_vlm_agent_system_prompt(params, payload, prompt)
        agent_system_prompt_built = True
    _canvas_vlm_add_timing(params, "initial_system_prompt_prepare", time.monotonic() - stage_started)

    stage_started = time.monotonic()
    sources = payload.get("asset_sources")
    if isinstance(payload.get("asset_source"), dict):
        sources = [payload.get("asset_source")]
    if not isinstance(sources, list):
        sources = []
    _canvas_vlm_add_timing(params, "asset_source_collect", time.monotonic() - stage_started)

    def is_video_path(path, mime=""):
        ext = os.path.splitext(str(path or ""))[1].lower()
        return str(mime or "").startswith("video/") or ext in [".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"]

    def is_llama_cpp_vlm_version():
        return bool((VLM.get_version_config(version_name) or {}).get("is_llamacpp"))

    def prepare_vlm_image_array(image_array):
        if image_array is None:
            return image_array
        if not is_llama_cpp_vlm_version():
            return image_array
        try:
            h, w = image_array.shape[:2]
            max_side = 512
            max_pixels = max_side * max_side
            scale = min(1.0, max_side / max(1, h, w), (max_pixels / max(1, h * w)) ** 0.5)
            if scale >= 0.999:
                return image_array
            next_w = max(1, int(round(w * scale)))
            next_h = max(1, int(round(h * scale)))
            pil = Image.fromarray(image_array.astype(np.uint8, copy=False))
            return np.array(pil.resize((next_w, next_h), Image.Resampling.LANCZOS))
        except Exception as exc:
            logger.warning("Canvas VLM image resize failed; using original image: %s", exc)
            return image_array

    def extract_video_frames(path, max_frames=8):
        frames = []
        try:
            import cv2
            cap = cv2.VideoCapture(str(path))
            if not cap.isOpened():
                return frames
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            if frame_count <= 0:
                sample_indices = list(range(max(1, int(max_frames))))
            else:
                sample_indices = np.linspace(0, max(0, frame_count - 1), max(1, int(max_frames)), dtype=int).tolist()
            for index in sample_indices:
                if frame_count > 0:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, int(index))
                ok, frame = cap.read()
                if not ok or frame is None:
                    continue
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(prepare_vlm_image_array(frame))
            cap.release()
        except Exception as exc:
            logger.warning("Canvas VLM video frame extraction failed: %s", exc)
        return frames

    def llama_cpp_video_frame_budget(requested_frames):
        if not bool((VLM.get_version_config(version_name) or {}).get("is_llamacpp")):
            return int(requested_frames)
        version_cfg = VLM.get_version_config(version_name) or {}
        n_ctx = int(version_cfg.get("n_ctx", 8192) or 8192)
        image_tokens = int(version_cfg.get("image_min_tokens", 0) or version_cfg.get("image_max_tokens", 0) or 0)
        if image_tokens <= 0:
            return int(requested_frames)
        text_reserve = 4096
        budget = max(1, (n_ctx - text_reserve) // image_tokens)
        return max(1, min(int(requested_frames), int(budget)))

    stage_started = time.monotonic()
    images = []
    asset_refs = []
    video_frames = 0
    video_assets = 0
    for source in sources:
        if not isinstance(source, dict):
            continue
        resolved = canvas_workbench_assets.materialize_node_asset(payload.get("project_id") or "default", {}, source)
        asset_ref = resolved.get("asset_ref") if isinstance(resolved, dict) else None
        image_path = asset_ref.get("path") if isinstance(asset_ref, dict) else ""
        if not image_path or not os.path.exists(image_path):
            continue
        asset_refs.append(asset_ref)
        source_is_video = is_video_path(image_path, asset_ref.get("mime") if isinstance(asset_ref, dict) else "")
        if source_is_video:
            video_assets += 1
        if is_custom_api:
            continue
        if source_is_video:
            requested_frames = clamp_int(params.get("video_frames", 8), 8, 1, 32)
            if is_llama_cpp_vlm_version():
                frames = extract_video_frames(image_path, llama_cpp_video_frame_budget(requested_frames))
                images.extend(frames)
                video_frames += len(frames)
            else:
                contact_sheet, video_meta = describe_media.prepare_visual_input(
                    image_path,
                    use_multi_frame=False,
                    max_frames=requested_frames,
                )
                images.append(prepare_vlm_image_array(np.asarray(contact_sheet)))
                video_frames += max(1, int(video_meta.get("sampled_frames") or 1))
        else:
            with Image.open(image_path) as image:
                images.append(prepare_vlm_image_array(np.array(image.convert("RGB"))))
    _canvas_vlm_add_timing(params, "asset_materialize_decode", time.monotonic() - stage_started)

    if video_assets:
        prompt = (
            f"{prompt}\n\n"
            "The attached video visuals are chronological samples from the referenced video. "
            "Treat them as ordered frames, describe visible motion and continuity, and do not infer audio."
        ).strip()
        params["prompt"] = prompt

    if is_custom_api:
        if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
            return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
        result = canvas_custom_llm_run(payload, params, prompt, asset_refs, conversation_id, mode)
        if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
            return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
        return result

    stage_started = time.monotonic()
    VLM.set_version(version_name)
    params["vram_policy"] = VLM.set_vram_policy(params.get("vram_policy"))
    _canvas_vlm_add_timing(params, "set_version", time.monotonic() - stage_started)

    image_input = None
    if images:
        image_input = images if (VLM.is_llamacpp or VLM.backend == "comfy_textgen") and len(images) > 1 else images[0]

    stage_started = time.monotonic()
    max_tokens = clamp_int(params.get("max_tokens", 1024), 1024, 64, 8192)
    temperature = clamp_number(params.get("temperature", 0.8), 0.8, 0, 2)
    top_p = clamp_number(params.get("top_p", 0.9), 0.9, 0, 1)
    top_k = clamp_int(params.get("top_k", 40), 40, 0, 200)
    repetition_penalty = clamp_number(params.get("repetition_penalty", 1.1), 1.1, 0.1, 3)
    seed = clamp_int(params.get("seed", -1), -1, -1, 2147483647)
    _canvas_vlm_add_timing(params, "sampling_params", time.monotonic() - stage_started)

    two_stage_intent_meta = None
    if two_stage_requested:
        local_stage_started = time.monotonic()
        two_stage_intent_meta = canvas_vlm_agent.local_two_stage_intent_response(payload, params, prompt)
        _canvas_vlm_add_timing(params, "two_stage_local_fast_path", time.monotonic() - local_stage_started)
        if _canvas_vlm_apply_two_stage_meta(params, payload, prompt, two_stage_intent_meta):
            agent_system_prompt_built = True
            logger.info("Canvas VLM two-stage intent satisfied by local deterministic locks; skipping Stage1 model call.")
        else:
            two_stage_intent_meta = None
    if two_stage_requested and not isinstance(two_stage_intent_meta, dict):
        try:
            stage_started = time.monotonic()
            intent_prompt = canvas_vlm_agent.build_two_stage_intent_prompt(payload, params, prompt)
            if VLM.is_llamacpp:
                logger.info("Canvas VLM two-stage intent uses isolated one-shot inference; clearing runtime context before intent extraction.")
                vlm.reset_runtime_context()
            intent_text = vlm.inference(
                None,
                intent_prompt,
                max_tokens=clamp_int(params.get("two_stage_intent_max_tokens", 256), 256, 128, 1024),
                temperature=0.0,
                top_p=0.5,
                top_k=20,
                repetition_penalty=1.02,
                seed=seed,
                system_prompt="You extract concise image intent as JSON only. Do not write final prompts.",
            )
            intent_text = str(intent_text or "").strip()
            for prefix in VLM.remove_prefixs:
                if intent_text.startswith(prefix):
                    intent_text = intent_text[len(prefix):]
            if intent_text.endswith('"'):
                intent_text = intent_text[:-1]
            two_stage_intent_meta = canvas_vlm_agent.parse_two_stage_intent_response(intent_text, payload, params, prompt)
            if _canvas_vlm_apply_two_stage_meta(params, payload, prompt, two_stage_intent_meta):
                agent_system_prompt_built = True
            _canvas_vlm_add_timing(params, "two_stage_model_call", time.monotonic() - stage_started)
        except Exception as exc:
            logger.warning("Canvas VLM two-stage intent extraction skipped: %s", exc)
        finally:
            if VLM.is_llamacpp:
                vlm.reset_runtime_context()
    if not agent_system_prompt_built:
        stage_started = time.monotonic()
        params["system_prompt"] = canvas_vlm_agent.build_vlm_agent_system_prompt(params, payload, prompt)
        _canvas_vlm_add_timing(params, "final_system_prompt_prepare", time.monotonic() - stage_started)

    def build_stateless_llamacpp_chat_prompt(base_prompt, history_budget=None):
        isolate_history = canvas_vlm_agent.vlm_isolate_rolling_history_for_prompt(payload, params, base_prompt)
        if isolate_history:
            client_history = payload.get("chat_messages") if isinstance(payload.get("chat_messages"), list) else []
            client_full_history = payload.get("chat_messages_full") if isinstance(payload.get("chat_messages_full"), list) else []
            history = []
            stats = {"omitted": len(client_history) + len(client_full_history), "chars": 0, "max_history": 0, "budget": 0}
        else:
            history, stats = canvas_vlm_agent.vlm_rolling_history(
                payload,
                dict(params, context_chars=history_budget or params.get("context_chars") or params.get("rolling_context_chars")),
                version_name,
            )
        lines = []
        for message in history:
            role = str(message.get("role") or "").strip().lower()
            if role not in ("user", "assistant", "system"):
                role = "user"
            content = str(message.get("content") or "").strip()
            if not content:
                continue
            label = {"user": "User", "assistant": "Assistant", "system": "System"}.get(role, "User")
            lines.append(f"{label}: {content}")
        text_budget = int(stats.get("budget") or canvas_vlm_agent.vlm_text_budget(params, version_name))
        current_prompt = str(base_prompt or "").strip()
        if len(current_prompt) > max(800, text_budget // 3):
            current_prompt = current_prompt[-max(800, text_budget // 3):].lstrip()
        sections = []
        system_text = ""
        system_prompt = params.get("system_prompt")
        if system_prompt is not None and str(system_prompt).strip():
            system_text = str(system_prompt).strip()
            max_system = max(1200, min(5000, text_budget // 2))
            if len(system_text) > max_system:
                system_text = system_text[:max_system].rstrip() + "\n... system prompt truncated for context window"
        if isolate_history:
            sections.append(
                "This is a standalone current image-generation request. Ignore earlier chat visual traits, old prompt tags, "
                "and prior generated character appearances unless the current request explicitly says to continue or reuse them."
            )
        else:
            sections.append(
                "Use the rolling conversation context below. It may omit older turns to fit the local model context window. "
                "If an image is attached, it is visible only for the current turn; do not assume older images are still visible."
            )
        if stats.get("omitted"):
            sections.append(f"[Context manager omitted {stats.get('omitted')} older turn(s) to avoid overflowing n_ctx.]")
        if lines:
            sections.append("\n".join(lines))
        sections.append(f"Current user request:\n{current_prompt}")
        return "\n\n".join(sections), bool(lines), stats, system_text

    stateless_llamacpp_chat = bool(
        mode == "chat"
        and VLM.is_llamacpp
        and not bool(params.get("force_stateful_chat"))
        and not bool(params.get("force_stateful_image_chat"))
    )
    stateless_prompt_includes_text_history = False
    stateless_system_prompt = ""
    rolling_context_stats = {"omitted": 0, "chars": 0, "max_history": 0, "budget": 0}
    stage_started = time.monotonic()
    if mode == "chat" and not stateless_llamacpp_chat:
        if bool(params.get("reset_context")):
            vlm.clear_conversation(conversation_id)
        system_prompt = params.get("system_prompt")
        system_prompt = str(system_prompt) if system_prompt is not None else ""
        text = vlm.chat(
            image_input,
            prompt,
            conversation_id=conversation_id,
            system_prompt=system_prompt,
            save_state=bool(params.get("save_context", True)),
            max_history=clamp_int(params.get("max_history", 24), 24, 1, 80),
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            repetition_penalty=repetition_penalty,
            seed=seed,
        )
    else:
        inference_prompt = prompt
        if stateless_llamacpp_chat:
            stateless_started = time.monotonic()
            inference_prompt, stateless_prompt_includes_text_history, rolling_context_stats, stateless_system_prompt = build_stateless_llamacpp_chat_prompt(prompt)
            _canvas_vlm_add_timing(params, "stateless_prompt_prepare", time.monotonic() - stateless_started)
            logger.warning(
                "Canvas VLM llama.cpp chat is using rolling stateless inference to avoid context-shift failures: version=%s, conversation_id=%s, context=%s",
                version_name,
                conversation_id,
                rolling_context_stats,
            )
        text = vlm.inference(
            image_input,
            inference_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            repetition_penalty=repetition_penalty,
            seed=seed,
            system_prompt=stateless_system_prompt if stateless_llamacpp_chat else None,
        )
        if (
            stateless_llamacpp_chat
            and isinstance(text, str)
            and ("Context Shift is explicitly disabled" in text or ("n_ctx" in text and "fit the dialogue" in text))
            and int(rolling_context_stats.get("budget") or 0) > 1600
        ):
            retry_budget = max(1200, int((rolling_context_stats.get("budget") or 2400) * 0.45))
            inference_prompt, stateless_prompt_includes_text_history, rolling_context_stats, stateless_system_prompt = build_stateless_llamacpp_chat_prompt(prompt, retry_budget)
            logger.warning("Retrying Canvas VLM llama.cpp chat with smaller rolling context: %s", rolling_context_stats)
            text = vlm.inference(
                image_input,
                inference_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                repetition_penalty=repetition_penalty,
                seed=seed,
                system_prompt=stateless_system_prompt,
            )
    if text is None:
        text = ""
    _canvas_vlm_add_timing(params, "main_vlm_inference", time.monotonic() - stage_started)
    if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
        return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
    text = str(text).strip()
    for prefix in VLM.remove_prefixs:
        if text.startswith(prefix):
            text = text[len(prefix):]
    if text.endswith('"'):
        text = text[:-1]

    if text.lower().startswith("error:") or text.lower().startswith("error during inference"):
        return {
            "ok": False,
            "error": "VLM inference failed",
            "details": text,
            "version": VLM.current_version,
            "asset_refs": asset_refs,
        }

    def review_llm_fn(messages, review_payload):
        review_schema = str((review_payload or {}).get("schema") or "").strip()
        review_messages = (
            messages
            if review_schema == "simpai.natural_prompt_refine.v1" and isinstance(messages, list) and messages
            else canvas_danbooru_prompt_review.build_compact_review_messages(review_payload)
        )
        system_prompt = str(review_messages[0].get("content") or "") if review_messages else ""
        user_prompt = str(review_messages[1].get("content") or "") if len(review_messages) > 1 else json.dumps(review_payload or {}, ensure_ascii=False)
        if VLM.is_llamacpp:
            logger.info("Canvas VLM prompt review/refine uses isolated llama.cpp one-shot inference; clearing runtime context before review.")
            vlm.reset_runtime_context()
        try:
            result = vlm.inference(
                None,
                user_prompt,
                max_tokens=clamp_int(params.get("danbooru_review_max_tokens", 640), 640, 128, 1024),
                temperature=0.1,
                top_p=0.8,
                top_k=40,
                repetition_penalty=1.05,
                seed=seed,
                system_prompt=system_prompt,
            )
            if isinstance(result, str) and ("Context Shift is explicitly disabled" in result or ("n_ctx" in result and "fit the dialogue" in result)):
                raise RuntimeError(result.strip()[:500])
            return result
        finally:
            if VLM.is_llamacpp:
                vlm.reset_runtime_context()

    draft_retry_meta = None
    draft_repair_meta = None
    stage_started = time.monotonic()
    agent_actions = [] if canvas_vlm_agent.vlm_agent_mode(params) == "raw" else canvas_vlm_agent.extract_vlm_agent_actions(text)
    draft_validation = canvas_vlm_agent.validate_llm_draft_response(text, agent_actions, payload, params, prompt)
    _canvas_vlm_add_timing(params, "draft_validation", time.monotonic() - stage_started)
    if draft_validation.get("retry_required") and not bool(params.get("disable_llm_draft_retry")):
        retry_started = time.monotonic()
        retry_prompt = canvas_vlm_agent.build_llm_draft_retry_prompt(payload, params, prompt, text, draft_validation)
        retry_skip_reason = ""
        if VLM.is_llamacpp:
            try:
                retry_max_chars = int(params.get("llamacpp_draft_retry_max_chars") or 10000)
            except Exception:
                retry_max_chars = 10000
            if retry_max_chars > 0 and len(retry_prompt) > retry_max_chars:
                retry_skip_reason = f"retry prompt too large for llama.cpp n_ctx guard: chars={len(retry_prompt)}, limit={retry_max_chars}"
        if retry_skip_reason:
            logger.warning("Canvas VLM draft retry skipped: %s", retry_skip_reason)
            _canvas_vlm_add_timing(params, "draft_retry_skipped", time.monotonic() - retry_started)
            draft_repair_meta = {
                "issues": draft_validation.get("issues") or [],
                "retry_skipped": retry_skip_reason,
                "repair_reason_type": draft_validation.get("retry_reason_type") or "local_repair",
            }
        else:
            if VLM.is_llamacpp:
                logger.info("Canvas VLM draft retry uses isolated one-shot inference; clearing runtime context before retry.")
                vlm.reset_runtime_context()
            retry_text = vlm.inference(
                image_input,
                retry_prompt,
                max_tokens=max(max_tokens, 1024),
                temperature=0.2,
                top_p=0.8,
                top_k=top_k,
                repetition_penalty=repetition_penalty,
                seed=(seed + 1 if seed >= 0 else seed),
                system_prompt=str(params.get("system_prompt") or ""),
            )
            retry_text = str(retry_text or "").strip()
            if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
                return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
            for prefix in VLM.remove_prefixs:
                if retry_text.startswith(prefix):
                    retry_text = retry_text[len(prefix):]
            if retry_text.endswith('"'):
                retry_text = retry_text[:-1]
            retry_actions = canvas_vlm_agent.extract_vlm_agent_actions(retry_text)
            retry_validation = canvas_vlm_agent.validate_llm_draft_response(retry_text, retry_actions, payload, params, prompt)
            _canvas_vlm_add_timing(params, "draft_retry_model_call", time.monotonic() - retry_started)
            draft_retry_meta = {
                "attempted": True,
                "initial_issues": draft_validation.get("issues") or [],
                "retry_issues": retry_validation.get("issues") or [],
                "retry_valid": bool(retry_validation.get("valid")),
                "retry_required": True,
            }
            text = retry_text or text
            agent_actions = retry_actions if retry_validation.get("valid") else []
    elif draft_validation.get("issues"):
        draft_repair_meta = {
            "issues": draft_validation.get("issues") or [],
            "retry_required": False,
        }
    repair_started = time.monotonic()
    agent_actions = canvas_vlm_agent.repair_vlm_agent_actions(
        agent_actions,
        payload,
        params,
        prompt,
        review_llm_fn=review_llm_fn if (params.get("enable_prompt_review") or params.get("enable_danbooru_review")) else None,
        assistant_text=text,
    )
    if is_canvas_vlm_cancelled(project_id, node_id, conversation_id, request_id):
        return _canvas_vlm_cancelled_response(project_id, node_id, conversation_id, request_id, mode)
    logger.info(
        "Canvas VLM agent action repair completed: elapsed=%.3fs, actions=%s",
        time.monotonic() - repair_started,
        len(agent_actions or []),
    )
    _canvas_vlm_add_timing(params, "repair_actions", time.monotonic() - repair_started)
    if two_stage_requested and not (isinstance(two_stage_intent_meta, dict) and two_stage_intent_meta.get("valid")):
        backfill_started = time.monotonic()
        backfilled_meta = canvas_vlm_agent.backfill_two_stage_intent_response(payload, params, prompt, agent_actions)
        _canvas_vlm_add_timing(params, "two_stage_contract_backfill", time.monotonic() - backfill_started)
        if _canvas_vlm_store_two_stage_meta(params, backfilled_meta):
            two_stage_intent_meta = backfilled_meta
            logger.info("Canvas VLM two-stage intent contract backfilled from repaired image action.")
    if draft_retry_meta:
        for action in agent_actions or []:
            if isinstance(action, dict) and action.get("action") in {"generate_image", "text_to_image"}:
                action["llm_draft_retry"] = "true"
                action["retry_reason"] = "; ".join(draft_retry_meta.get("initial_issues") or [])[:500]
                action["draft_validation_issues"] = draft_retry_meta.get("retry_issues") or draft_retry_meta.get("initial_issues") or []
    elif draft_repair_meta:
        for action in agent_actions or []:
            if isinstance(action, dict) and action.get("action") in {"generate_image", "text_to_image"}:
                action["llm_draft_repair_issues"] = draft_repair_meta.get("issues") or []
                action["llm_draft_retry_required"] = False
    display_text = canvas_vlm_agent.vlm_agent_display_text(text, agent_actions, params)
    if not display_text and isinstance(two_stage_intent_meta, dict):
        display_text = str(two_stage_intent_meta.get("understanding") or "").strip()
    response_params = {
        "prompt": prompt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "top_k": top_k,
        "repetition_penalty": repetition_penalty,
        "seed": seed,
        "save_context": bool(params.get("save_context", True)) if mode == "chat" and not stateless_llamacpp_chat else False,
        "stateless_llamacpp_chat": stateless_llamacpp_chat,
        "stateless_llamacpp_image_chat": bool(stateless_llamacpp_chat and image_input is not None),
        "stateless_prompt_includes_text_history": bool(
            stateless_llamacpp_chat and stateless_prompt_includes_text_history
        ),
        "rolling_context": rolling_context_stats,
    }
    if isinstance(two_stage_intent_meta, dict):
        response_params["two_stage_intent"] = {
            "valid": bool(two_stage_intent_meta.get("valid")),
            "issues": two_stage_intent_meta.get("issues") or [],
            "understanding": two_stage_intent_meta.get("understanding") or "",
            "contract": two_stage_intent_meta.get("contract") or {},
            "contract_issues": two_stage_intent_meta.get("contract_issues") or [],
            "confidence": two_stage_intent_meta.get("confidence"),
            "local_fast_path": bool(two_stage_intent_meta.get("local_fast_path")),
            "local_signal_level": two_stage_intent_meta.get("local_signal_level") or "",
            "locks": two_stage_intent_meta.get("locks") or {},
        }

    free_after = bool(params.get("free_after"))
    if "keep_model_loaded" in params:
        free_after = not bool(params.get("keep_model_loaded"))
    if free_after:
        logger.info(
            "[VLM KeepLoaded] vlm-run free_model node_id=%s conversation_id=%s keep_model_loaded=%s free_after=%s source=webui.canvas_workbench_vlm_run",
            params.get("node_id"),
            params.get("conversation_id"),
            params.get("keep_model_loaded"),
            free_after,
        )
        vlm.free_model()
    _canvas_vlm_add_timing(params, "total", time.monotonic() - run_started)
    timings = _canvas_vlm_timing_snapshot(params)
    if timings:
        response_params["timings"] = timings

    result = {
        "ok": True,
        "text": display_text,
        "raw_text": text if display_text != text else "",
        "agent_actions": agent_actions,
        "version": VLM.current_version,
        "asset_refs": asset_refs,
        "used_images": len(images),
        "video_frames": video_frames,
        "mode": mode,
        "conversation_id": conversation_id if mode == "chat" else None,
        "params": response_params,
    }
    logger.info(
        "Canvas VLM run completed: elapsed=%.3fs, actions=%s, review_enabled=%s, timings=%s",
        time.monotonic() - run_started,
        len(agent_actions or []),
        bool(params.get("enable_prompt_review") or params.get("enable_danbooru_review")),
        timings,
    )
    return result
