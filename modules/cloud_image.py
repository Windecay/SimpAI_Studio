import base64
import io
import json
import logging
import mimetypes
import os
import random
import re
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
import requests
from PIL import Image

import modules.config as config
from modules.access_mode import is_local_mode
import modules.regen_manifest as regen_manifest
import shared
from modules.util import generate_temp_filename
from modules.private_logger import log as private_log
from modules.meta_parser import get_metadata_parser
from enhanced import version
from enhanced.simpleai import get_path_in_user_dir

logger = logging.getLogger(__name__)

CONFIG_FILENAME = ".cloud_image_configs.json"
PROTOCOLS = ("auto", "openai_images", "openai_chat", "openrouter_images", "siliconflow", "nano_banana")


def _resolve_config_user_did(user_did=None):
    value = str(user_did or "").strip()
    if value and value != "Unknown":
        return value
    try:
        token = getattr(shared, "token", None)
        if token is None:
            return None
        if is_local_mode():
            for method_name in ("get_default_workspace_did", "get_local_did", "get_guest_did"):
                if hasattr(token, method_name):
                    did = str(getattr(token, method_name)() or "").strip()
                    if did and did != "Unknown":
                        return did
        if hasattr(token, "get_guest_did"):
            did = str(token.get_guest_did() or "").strip()
            if did and did != "Unknown":
                return did
    except Exception:
        pass
    return None


def _config_path(user_did=None):
    return Path(get_path_in_user_dir(CONFIG_FILENAME, _resolve_config_user_did(user_did)))


def load_configs(user_did=None):
    path = _config_path(user_did)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data
    except (OSError, ValueError, TypeError):
        pass
    return {"default_id": "", "items": []}


def save_configs(data, user_did=None):
    path = _config_path(user_did)
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = {"default_id": str(data.get("default_id") or ""), "items": []}
    for item in data.get("items") or []:
        if not isinstance(item, dict):
            continue
        normalized["items"].append({
            "id": str(item.get("id") or uuid.uuid4().hex),
            "name": str(item.get("name") or "未命名接口").strip(),
            "protocol": str(item.get("protocol") or "auto") if str(item.get("protocol") or "auto") in PROTOCOLS else "auto",
            "base_url": str(item.get("base_url") or "").strip().rstrip("/"),
            "api_key": str(item.get("api_key") or "").strip(),
            "model": str(item.get("model") or "").strip(),
            "defaults": item.get("defaults") if isinstance(item.get("defaults"), dict) else {},
        })
    path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return normalized


def upsert_config(name, protocol, base_url, api_key, model, user_did=None, config_id=None):
    data = load_configs(user_did)
    item_id = str(config_id or uuid.uuid4().hex)
    item = {
        "id": item_id,
        "name": name,
        "protocol": protocol if protocol in PROTOCOLS else "auto",
        "base_url": base_url,
        "api_key": api_key,
        "model": model,
    }
    items = [item if str(x.get("id")) == item_id else x for x in data["items"]]
    if not any(str(x.get("id")) == item_id for x in data["items"]):
        items.append(item)
    data["items"] = items
    data["default_id"] = item_id
    return save_configs(data, user_did)


def delete_config(config_id, user_did=None):
    item_id = str(config_id or "").strip()
    if not item_id:
        return save_configs(load_configs(user_did), user_did)
    data = load_configs(user_did)
    items = [item for item in data.get("items") or [] if str(item.get("id") or "") != item_id]
    data["items"] = items
    if str(data.get("default_id") or "") == item_id:
        data["default_id"] = str(items[0].get("id") or "") if items else ""
    elif data.get("default_id") and not any(str(item.get("id") or "") == str(data.get("default_id") or "") for item in items):
        data["default_id"] = str(items[0].get("id") or "") if items else ""
    return save_configs(data, user_did)


def config_by_id(config_id, user_did=None):
    data = load_configs(user_did)
    for item in data["items"]:
        if str(item.get("id")) == str(config_id):
            return item
    if data.get("default_id"):
        for item in data["items"]:
            if str(item.get("id")) == str(data["default_id"]):
                return item
    return data["items"][0] if data["items"] else None


def config_choices(user_did=None):
    data = load_configs(user_did)
    choices = []
    for item in data.get("items") or []:
        if not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        item_name = str(item.get("name") or "My Image API").strip() or "My Image API"
        choices.append((item_name, item_id))
    return choices


def _resolve_task_cloud_params(task):
    params = getattr(task, "params_backend", None)
    if not isinstance(params, dict):
        params = {}
        task.params_backend = params
    required = ("cloud_base_url", "cloud_api_key", "cloud_model")
    if all(str(params.get(key) or "").strip() for key in required):
        return params

    saved = config_by_id(params.get("cloud_config_id"), getattr(task, "user_did", None))
    if not isinstance(saved, dict):
        return params
    mapping = {
        "cloud_config_name": "name",
        "cloud_protocol": "protocol",
        "cloud_base_url": "base_url",
        "cloud_api_key": "api_key",
        "cloud_model": "model",
    }
    for target, source in mapping.items():
        if not str(params.get(target) or "").strip():
            params[target] = str(saved.get(source) or "").strip()
    logger.info(
        "Loaded saved Cloud Image API configuration for task: name=%s model=%s user=%s",
        params.get("cloud_config_name") or "",
        params.get("cloud_model") or "",
        getattr(task, "user_did", None),
    )
    return params


def _save_temp_image(value, prefix):
    image = None
    if isinstance(value, dict):
        image = value.get("image")
        if image is None:
            image = value.get("path")
        if image is None:
            image = value.get("name")
    else:
        image = value
    if isinstance(image, str) and os.path.isfile(image):
        return image
    if image is None:
        return None
    if isinstance(image, Image.Image):
        pil_image = image.copy()
    else:
        try:
            array = np.asarray(image)
        except Exception:
            return None
        if array.size == 0:
            return None
        if array.ndim == 2:
            pil_image = Image.fromarray(array.astype(np.uint8), mode="L")
        else:
            pil_image = Image.fromarray(array.astype(np.uint8))
    if pil_image.mode not in ("RGB", "RGBA", "L", "LA"):
        pil_image = pil_image.convert("RGBA")
    has_transparency = False
    if pil_image.mode in ("RGBA", "LA"):
        alpha = np.asarray(pil_image.getchannel("A"))
        has_transparency = bool(alpha.size and np.any(alpha < 255))
    if has_transparency:
        extension = "png"
        save_image = pil_image.convert("RGBA")
        save_kwargs = {"format": "PNG"}
    else:
        extension = "jpg"
        save_image = pil_image.convert("RGB")
        save_kwargs = {"format": "JPEG", "quality": 92, "optimize": True}
    _, temp_file_path, _ = generate_temp_filename(folder=config.temp_path, extension=extension)
    temp_path = Path(temp_file_path)
    temp_path.parent.mkdir(parents=True, exist_ok=True)
    save_image.save(temp_path, **save_kwargs)
    return str(temp_path)


def _image_paths(task):
    paths = []
    for slot_name in (
        "scene_canvas_image",
        "scene_input_image1",
        "scene_input_image2",
        "scene_input_image3",
        "scene_input_image4",
        "scene_input_image5",
        "scene_input_image6",
        "scene_input_image7",
        "scene_input_image8",
    ):
        value = getattr(task, slot_name, None)
        path = _save_temp_image(value, f"cloud_edit_{slot_name}")
        if path and os.path.isfile(path):
            paths.append(path)
    return paths


def _size(task):
    width = getattr(task, "overwrite_width", None)
    height = getattr(task, "overwrite_height", None)
    if width and height and int(width) > 0 and int(height) > 0:
        return f"{int(width)}x{int(height)}"
    value = task.params_backend.get("cloud_size") or task.aspect_ratios_selection
    if "|" in str(value):
        value = str(value).split("|", 1)[0]
    text = str(value or "1024*1024").replace("×", "*").replace("x", "*")
    parts = text.split("*")
    try:
        return f"{int(float(parts[0]))}x{int(float(parts[1]))}"
    except (ValueError, IndexError):
        return "1024x1024"


def _extract_images(data):
    result = []

    def collect(value, key=""):
        if isinstance(value, list):
            for item in value:
                collect(item, key)
            return
        if not isinstance(value, dict):
            return
        for field in ("b64_json", "base64"):
            encoded = value.get(field)
            if isinstance(encoded, str) and encoded:
                raw = _decode_data_url(encoded)
                try:
                    result.append(("bytes", raw or base64.b64decode(encoded)))
                except (ValueError, TypeError):
                    pass
                break
        else:
            for field in ("url", "image_url"):
                candidate = value.get(field)
                if isinstance(candidate, dict):
                    candidate = candidate.get("url")
                raw = _decode_data_url(candidate)
                if raw:
                    result.append(("bytes", raw))
                    break
                if isinstance(candidate, str) and candidate.startswith(("http://", "https://")):
                    result.append(("url", candidate))
                    break
        for child_key in ("data", "images", "results", "output"):
            if child_key in value:
                collect(value[child_key], child_key)

    collect(data)
    return list(dict.fromkeys(result))


def _decode_data_url(value):
    if not isinstance(value, str) or not value.startswith("data:image/") or "," not in value:
        return None
    return base64.b64decode(value.split(",", 1)[1])


def _extract_chat_images(data):
    result = []
    choices = data.get("choices") if isinstance(data, dict) else None
    for choice in choices or []:
        message = choice.get("message") if isinstance(choice, dict) else None
        if not isinstance(message, dict):
            continue
        candidates = []
        content = message.get("content")
        if isinstance(content, str):
            candidates.extend(re.findall(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+|https?://[^\s)\]>'\"]+", content))
        elif isinstance(content, list):
            candidates.extend(content)
        candidates.extend(message.get("images") or [])
        for candidate in candidates:
            if isinstance(candidate, dict):
                image_url = candidate.get("image_url") or candidate.get("url") or candidate.get("data")
                candidate = image_url.get("url") if isinstance(image_url, dict) else image_url
            raw = _decode_data_url(candidate)
            if raw:
                result.append(("bytes", raw))
            elif isinstance(candidate, str) and candidate.startswith(("http://", "https://")):
                result.append(("url", candidate))
    return list(dict.fromkeys(result))


def _protocol(protocol, base_url, model):
    value = str(protocol or "auto")
    if value != "auto":
        return value
    lowered_url = base_url.lower()
    lowered_model = model.lower()
    if "openrouter.ai/api/v1" in lowered_url:
        return "openrouter_images"
    if "api.siliconflow.cn" in lowered_url:
        return "siliconflow"
    if lowered_url.rstrip("/").endswith("/chat/completions"):
        return "openai_chat"
    if "nano-banana" in lowered_model or "nano_banana" in lowered_model or lowered_url.rstrip("/").endswith("/api/generate"):
        return "nano_banana"
    return "openai_images"


def _endpoint(base_url, protocol, editing=False):
    value = base_url.rstrip("/")
    path = urlsplit(value).path.rstrip("/")
    if protocol == "openai_chat":
        return value if path.endswith("/chat/completions") else f"{value}/chat/completions"
    if protocol == "openrouter_images":
        return value if path.endswith("/images") else f"{value}/images"
    if protocol == "nano_banana":
        return value if path.endswith("/api/generate") else f"{value}/api/generate"
    suffix = "/images/edits" if editing and protocol == "openai_images" else "/images/generations"
    if path.endswith(("/images/generations", "/images/edits")):
        root = value.rsplit("/images/", 1)[0]
        return f"{root}{suffix}"
    return f"{value}{suffix}"


def _models_endpoint(base_url):
    value = str(base_url or "").strip().rstrip("/")
    path = urlsplit(value).path.rstrip("/")
    for suffix in ("/chat/completions", "/images/generations", "/images/edits", "/images", "/api/generate"):
        if path.endswith(suffix):
            return f"{value[:-len(suffix)]}/models"
    return f"{value}/models"


def _extract_model_ids(payload):
    rows = payload.get("data") if isinstance(payload, dict) else payload if isinstance(payload, list) else []
    models = []
    for item in rows or []:
        candidate = ""
        if isinstance(item, dict):
            candidate = item.get("id") or item.get("name") or item.get("model") or ""
        elif isinstance(item, str):
            candidate = item
        text = str(candidate or "").strip()
        if text:
            models.append(text)
    return list(dict.fromkeys(models))


def _filter_image_models(models, protocol=None):
    image_hints = (
        "gpt-image",
        "image",
        "flux",
        "stable-diffusion",
        "sdxl",
        "sd3",
        "kolors",
        "seedream",
        "recraft",
        "ideogram",
        "qwen-image",
        "nano-banana",
        "nanobanana",
    )
    excluded_hints = (
        "embedding",
        "rerank",
        "moderation",
        "whisper",
        "transcribe",
        "tts",
        "audio",
        "realtime",
    )
    visible = []
    fallback = []
    for model in models or []:
        text = str(model or "").strip()
        if not text:
            continue
        lowered = text.lower()
        if any(hint in lowered for hint in excluded_hints):
            continue
        fallback.append(text)
        if any(hint in lowered for hint in image_hints):
            visible.append(text)
    if visible:
        return list(dict.fromkeys(visible))
    if protocol in ("siliconflow", "nano_banana"):
        return list(dict.fromkeys(fallback))
    return list(dict.fromkeys(fallback[:50]))


def list_models(protocol, base_url, api_key, current_model=""):
    base_value = str(base_url or "").strip().rstrip("/")
    api_key_value = str(api_key or "").strip()
    current_model_value = str(current_model or "").strip()
    if not base_value:
        return {"ok": False, "error": "API Base URL is required."}
    resolved_protocol = _protocol(protocol, base_value, current_model_value)
    headers = {"Authorization": f"Bearer {api_key_value}"} if api_key_value else {}
    models_url = _models_endpoint(base_value)
    session = requests.Session()
    try:
        response = session.get(models_url, headers=headers, timeout=30)
    except requests.RequestException as error:
        return {"ok": False, "error": _request_exception_message(error)}
    if not response.ok:
        return {"ok": False, "error": _error_message(response)}
    try:
        payload = response.json()
    except ValueError:
        return {"ok": False, "error": "API 返回了非 JSON 内容"}
    models = _extract_model_ids(payload)
    visible_models = _filter_image_models(models, resolved_protocol)
    return {
        "ok": True,
        "models": visible_models,
        "raw_count": len(models),
        "visible_count": len(visible_models),
        "protocol": resolved_protocol,
        "endpoint": models_url,
    }


def _mime_type(path):
    detected = mimetypes.guess_type(path)[0]
    return detected if detected and detected.startswith("image/") else "application/octet-stream"


def _openrouter_input_references(image_paths):
    references = []
    for path in image_paths:
        raw = Path(path).read_bytes()
        encoded = base64.b64encode(raw).decode("ascii")
        references.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{_mime_type(path)};base64,{encoded}",
            },
        })
    return references


def _error_message(response):
    trace_id = response.headers.get("x-siliconcloud-trace-id")
    trace_suffix = f"，Trace ID: {trace_id}" if trace_id else ""
    text = str(response.text or "").strip()
    detail = ""
    try:
        payload = response.json()
        error = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error, dict):
            detail = str(error.get("message") or "")
        if not detail and isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("detail") or "")
    except (ValueError, TypeError):
        detail = re.sub(r"<[^>]+>", " ", text).strip()
    if "cannot unmarshal string into Go struct field Alias.n of type uint" in (detail or text):
        return "API 服务商的模型别名配置错误：字段 n 被配置成了字符串，服务端要求整数。请联系服务商修复模型配置，或更换模型/接口。"
    normalized = f"{detail}\n{text}".lower()
    if response.status_code == 429 and "no available image quota" in normalized:
        return f"当前接口没有可用图片额度。请检查图片模型权限、套餐或余额是否已开通{trace_suffix}。"
    if response.status_code in (522, 524, 504) or "timeout occurred" in normalized or "timed out" in normalized:
        return f"服务端处理超时，可能是模型排队、网关过慢或该接口不适合同步长耗时生图。请稍后重试或更换服务商{trace_suffix}。"
    if response.status_code == 401 or "invalid api key" in normalized or "unauthorized" in normalized:
        return f"API Key 无效，或当前账号没有该接口/模型的访问权限{trace_suffix}。"
    if response.status_code == 404 or "model not found" in normalized or "not found" in normalized:
        return f"接口地址或模型不存在。请检查 API Base URL、Protocol 和 Model 是否填写正确{trace_suffix}。"
    if text and "<html" in text.lower():
        return f"服务商网关返回了错误页面而不是标准 API JSON。请检查接口地址、协议类型，或稍后重试{trace_suffix}。"
    detail = (detail or text or "服务端未返回错误详情")[:500]
    return f"API 请求失败 ({response.status_code}){trace_suffix}: {detail}"


def _request_exception_message(error):
    if isinstance(error, requests.Timeout):
        return "请求超时。服务端处理过慢、网络不稳定，或该接口不适合同步长耗时生图。"
    if isinstance(error, requests.ConnectionError):
        detail = str(error).strip()
        return f"无法连接到 API 服务。请检查 API Base URL、网络连接或代理设置。{f' 详细原因: {detail}' if detail else ''}"
    return str(error)


def _request_timeout(protocol, image_paths):
    has_input_references = bool(image_paths)
    if protocol == "openrouter_images" and has_input_references:
        return (15, 600)
    return (15, 180)


def _save_bytes(raw, output_dir, index):
    image = Image.open(io.BytesIO(raw))
    image.verify()
    extension = "png" if image.format == "PNG" else "jpg"
    _, path, _ = generate_temp_filename(folder=output_dir, extension=extension)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(raw)
    return str(path)


def _download(url, output_dir, index, session):
    response = session.get(url, timeout=(15, 180))
    response.raise_for_status()
    return _save_bytes(response.content, output_dir, index)


def _download_bytes(url, session):
    response = session.get(url, timeout=(15, 180))
    response.raise_for_status()
    return response.content


def _raw_to_array(raw):
    with Image.open(io.BytesIO(raw)) as image:
        return np.array(image.convert("RGBA" if image.mode == "RGBA" else "RGB"))


def _build_metadata_entries(task, model, protocol, prompt, size, source_image_count):
    entries = [
        ("Prompt", "prompt", prompt),
        ("Negative Prompt", "negative_prompt", str(getattr(task, "rendered_negative_prompt", getattr(task, "negative_prompt", "")) or "")),
        ("Resolution", "resolution", size),
        ("Image Number", "image_number", str(getattr(task, "image_number", 1) or 1)),
        ("Cloud Model", "cloud_model", model),
        ("Cloud Protocol", "cloud_protocol", protocol),
        ("Source Images", "source_images", str(source_image_count)),
        ("Backend Engine", "backend_engine", f"Cloud API:{getattr(task, 'task_method', '') or 'cloud_image_generate'}"),
        ("Metadata Scheme", "metadata_scheme", getattr(task, "metadata_scheme", None).value if getattr(task, "save_metadata_to_images", False) else False),
    ]
    if not getattr(task, "user_did", None) is None:
        entries.append(("User", "created_by", str(task.user_did)))
    if getattr(task, "simpleai_regen_manifest", None):
        entries.append((regen_manifest.LABEL, regen_manifest.KEY, regen_manifest.dumps(task.simpleai_regen_manifest)))
    entries.append(("Version", "version", f"{version.branch}_{version.get_simpai_ver()}"))
    return entries


def _build_metadata_parser(task, prompt, negative_prompt=None):
    if not getattr(task, "save_metadata_to_images", False):
        return None
    negative_prompt = str(
        getattr(
            task,
            "rendered_negative_prompt",
            negative_prompt if negative_prompt is not None else getattr(task, "negative_prompt", ""),
        ) or ""
    )
    parser = get_metadata_parser(task.metadata_scheme)
    parser.set_data(
        prompt,
        [prompt] if prompt else [],
        negative_prompt,
        [negative_prompt] if negative_prompt else [],
        int(getattr(task, "steps", 1) or 1),
        "None",
        "None",
        [],
        str(getattr(task, "vae_name", "") or ""),
        {},
    )
    return parser


def _save_with_metadata(task, raw, metadata, metadata_parser):
    path, _image_bytes, _log_item = private_log(
        _raw_to_array(raw),
        metadata,
        metadata_parser=metadata_parser,
        output_format=getattr(task, "output_format", None),
        task=None,
        persist_image=True,
        user_did=task.user_did,
        remote_task=getattr(task, "remote_task", None),
    )
    return path


def _build_prompt_requests(task, count):
    import modules.constants as constants

    base_prompt = str(getattr(task, "prompt", "") or "").strip()
    additional_prompt = str(getattr(task, "scene_additional_prompt", "") or "").strip()
    negative_prompt = str(getattr(task, "negative_prompt", "") or "").strip()
    seed = int(getattr(task, "seed", 0) or 0)
    disable_seed_increment = bool(getattr(task, "disable_seed_increment", False))
    user_did = getattr(task, "user_did", None)
    try:
        import enhanced.wildcards as wildcards
    except ModuleNotFoundError:
        prompt = f"{base_prompt}, {additional_prompt}" if base_prompt and additional_prompt else (base_prompt or additional_prompt)
        return [
            {
                "prompt": prompt,
                "negative_prompt": negative_prompt,
                "seed": (seed + index) % (constants.MAX_SEED + 1),
            }
            for index in range(count)
        ]

    initial_rng = random.Random(seed % (constants.MAX_SEED + 1))
    compiled_prompt, wildcards_arrays, arrays_mult, seed_fixed = wildcards.compile_arrays(
        base_prompt,
        initial_rng,
        user_did=user_did,
    )
    total_requests = count if arrays_mult == 0 else arrays_mult
    requests = []

    for index in range(total_requests):
        if arrays_mult == 0 or not seed_fixed or not disable_seed_increment:
            request_seed = (seed + index) % (constants.MAX_SEED + 1)
        else:
            request_seed = seed % (constants.MAX_SEED + 1)

        request_rng = random.Random(request_seed)
        rendered_prompt = wildcards.apply_arrays(compiled_prompt, index, wildcards_arrays, arrays_mult)
        rendered_prompt = wildcards.replace_wildcard(rendered_prompt, request_rng, user_did=user_did).strip()
        rendered_negative_prompt = wildcards.apply_wildcards(negative_prompt, request_rng, user_did=user_did).strip()
        rendered_additional_prompt = wildcards.apply_wildcards(additional_prompt, request_rng, user_did=user_did).strip()
        if rendered_additional_prompt:
            rendered_prompt = f"{rendered_prompt}, {rendered_additional_prompt}" if rendered_prompt else rendered_additional_prompt

        requests.append({
            "prompt": rendered_prompt,
            "negative_prompt": rendered_negative_prompt,
            "seed": request_seed,
        })

    return requests


def generate(task, progressbar, yield_result, stop_processing, started_at):
    task.simpleai_generation_had_output = False
    task.cloud_error = ""
    params = _resolve_task_cloud_params(task)
    base_url = str(params.get("cloud_base_url") or "").strip().rstrip("/")
    api_key = str(params.get("cloud_api_key") or "").strip()
    model = str(params.get("cloud_model") or "").strip()
    if not base_url or not api_key or not model:
        raise ValueError("请先配置 API 地址、API Key 和模型")
    protocol = _protocol(params.get("cloud_protocol"), base_url, model)
    count = max(1, min(int(getattr(task, "image_number", 1) or 1), 8))
    prompt_requests = _build_prompt_requests(task, count)
    image_paths = _image_paths(task)
    size = _size(task)
    session = requests.Session()
    headers = {"Authorization": f"Bearer {api_key}"}
    input_image_bytes = sum(Path(path).stat().st_size for path in image_paths if os.path.isfile(path))
    request_timeout = _request_timeout(protocol, image_paths)
    logger.info(
        "Cloud image request prepared: task_id=%s protocol=%s model=%s size=%s overwrite_width=%s overwrite_height=%s aspect_ratios_selection=%s image_count=%s request_count=%s input_images=%s input_image_bytes=%s request_timeout=%s scene_canvas=%s scene_input1=%s scene_input2=%s scene_input3=%s scene_input4=%s scene_input5=%s scene_input6=%s scene_input7=%s scene_input8=%s",
        getattr(task, "task_id", None),
        protocol,
        model,
        size,
        getattr(task, "overwrite_width", None),
        getattr(task, "overwrite_height", None),
        getattr(task, "aspect_ratios_selection", None),
        count,
        len(prompt_requests),
        len(image_paths),
        input_image_bytes,
        request_timeout,
        getattr(task, "scene_canvas_image", None) is not None,
        getattr(task, "scene_input_image1", None) is not None,
        getattr(task, "scene_input_image2", None) is not None,
        getattr(task, "scene_input_image3", None) is not None,
        getattr(task, "scene_input_image4", None) is not None,
        getattr(task, "scene_input_image5", None) is not None,
        getattr(task, "scene_input_image6", None) is not None,
        getattr(task, "scene_input_image7", None) is not None,
        getattr(task, "scene_input_image8", None) is not None,
    )
    results = []
    result_prompts = []
    result_negative_prompts = []
    request_errors = []
    try:
        progressbar(task, 10, "提交云端生图任务 ...")
        for request_index, prompt_request in enumerate(prompt_requests, 1):
            if task.user_cancel_action == "stop":
                break
            progressbar(task, 10 + int(request_index * 25 / len(prompt_requests)), f"提交第 {request_index} 个云端请求 ...")
            prompt = prompt_request["prompt"]
            rendered_negative_prompt = prompt_request["negative_prompt"]
            logger.info(
                "Cloud image final prompt: task_id=%s request_index=%s request_total=%s protocol=%s model=%s prompt=%r negative_prompt=%r",
                getattr(task, "task_id", None),
                request_index,
                len(prompt_requests),
                protocol,
                model,
                prompt,
                rendered_negative_prompt,
            )
            try:
                endpoint = _endpoint(base_url, protocol, bool(image_paths))
                if protocol == "openai_chat":
                    content = [{"type": "text", "text": prompt}]
                    for path in image_paths:
                        encoded = base64.b64encode(Path(path).read_bytes()).decode("ascii")
                        content.append({"type": "image_url", "image_url": {"url": f"data:{_mime_type(path)};base64,{encoded}"}})
                    payload = {"model": model, "messages": [{"role": "user", "content": content}], "n": 1, "size": size, "response_format": "url"}
                    response = session.post(endpoint, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=request_timeout)
                    is_chat_response = True
                elif protocol == "openrouter_images":
                    payload = {
                        "model": model,
                        "prompt": prompt,
                        "n": 1,
                        "size": size,
                    }
                    if image_paths:
                        payload["input_references"] = _openrouter_input_references(image_paths)
                    response = session.post(endpoint, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=request_timeout)
                    is_chat_response = False
                elif protocol == "siliconflow":
                    payload = {"model": model, "prompt": prompt, "image_size": size}
                    if model == "Kwai-Kolors/Kolors":
                        payload["batch_size"] = 1
                    if image_paths:
                        path = image_paths[0]
                        encoded = base64.b64encode(Path(path).read_bytes()).decode("ascii")
                        payload["image"] = f"data:{_mime_type(path)};base64,{encoded}"
                    response = session.post(endpoint, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=request_timeout)
                    is_chat_response = False
                elif protocol == "nano_banana":
                    ratio = str(getattr(task, "aspect_ratios_selection", None) or "auto").split("|", 1)[0].strip()
                    payload = {"model": model, "prompt": prompt, "replyType": "json", "aspectRatio": ratio}
                    if "lite" not in model.lower():
                        max_side = max(int(part) for part in size.split("x"))
                        payload["imageSize"] = "4K" if max_side >= 3072 else "2K" if max_side >= 1536 else "1K"
                    if image_paths:
                        payload["images"] = [base64.b64encode(Path(path).read_bytes()).decode("ascii") for path in image_paths]
                    response = session.post(endpoint, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=request_timeout)
                    is_chat_response = False
                elif image_paths:
                    handles = [open(path, "rb") for path in image_paths]
                    try:
                        field = "image" if len(handles) == 1 else "image[]"
                        files = [(field, (os.path.basename(path), handle, _mime_type(path))) for path, handle in zip(image_paths, handles)]
                        data = {"model": model, "prompt": prompt, "n": 1, "size": size, "response_format": "b64_json"}
                        response = session.post(endpoint, headers=headers, data=data, files=files, timeout=request_timeout)
                    finally:
                        for handle in handles:
                            handle.close()
                    is_chat_response = False
                else:
                    payload = {"model": model, "prompt": prompt, "n": 1, "size": size, "response_format": "b64_json"}
                    response = session.post(endpoint, headers={**headers, "Content-Type": "application/json"}, json=payload, timeout=request_timeout)
                    is_chat_response = False
            except requests.RequestException as error:
                request_errors.append(f"请求 {request_index}: {_request_exception_message(error)}")
                continue
            if not response.ok:
                request_errors.append(_error_message(response))
                continue
            try:
                response_data = response.json()
            except ValueError:
                request_errors.append(f"请求 {request_index}: API 返回了非 JSON 内容")
                continue
            extracted = _extract_chat_images(response_data) if is_chat_response else _extract_images(response_data)
            if extracted:
                results.extend(extracted)
                result_prompts.extend([prompt] * len(extracted))
                result_negative_prompts.extend([rendered_negative_prompt] * len(extracted))
            else:
                request_errors.append(f"请求 {request_index}: API 返回中没有可识别的图片")
        if not results:
            raise RuntimeError("；".join(request_errors) if request_errors else "API 返回中没有可识别的图片")
        output_dir = config.get_user_path_outputs(task.user_did)
        paths = []
        download_errors = []
        for index, (kind, value) in enumerate(results, 1):
            if task.user_cancel_action == "stop":
                break
            progressbar(task, 35 + int(index * 60 / len(results)), f"保存第 {index} 张图片 ...")
            try:
                raw = value if kind == "bytes" else _download_bytes(value, session)
                rendered_prompt = result_prompts[index - 1] if index - 1 < len(result_prompts) else ""
                rendered_negative_prompt = result_negative_prompts[index - 1] if index - 1 < len(result_negative_prompts) else ""
                task.rendered_negative_prompt = rendered_negative_prompt
                metadata = _build_metadata_entries(task, model, protocol, rendered_prompt, size, len(image_paths))
                metadata_parser = _build_metadata_parser(task, rendered_prompt, rendered_negative_prompt)
                paths.append(_save_with_metadata(task, raw, metadata, metadata_parser))
            except (OSError, ValueError, requests.RequestException) as error:
                download_errors.append(f"第 {index} 张: {error}")
        task.simpleai_generation_had_output = bool(paths)
        if paths:
            yield_result(task, paths, 100, False, censor=False)
        if not paths:
            raise RuntimeError("；".join(download_errors) if download_errors else "生成结果未能保存到本地")
        if request_errors or download_errors:
            logger.warning("Cloud image task completed partially: %s", "；".join(request_errors + download_errors))
    finally:
        if hasattr(task, "rendered_negative_prompt"):
            delattr(task, "rendered_negative_prompt")
        stop_processing(task, started_at, "Finished" if task.simpleai_generation_had_output else "Stopped")
