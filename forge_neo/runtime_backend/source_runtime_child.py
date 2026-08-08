from __future__ import annotations

import argparse
import base64
import gc
import inspect
import importlib.util
import io
import json
import os
import random
import re
import shlex
import sys
import threading
import time
import traceback
import types
from datetime import datetime
from pathlib import Path
from typing import Any, Callable


SOURCE_EVENT_PREFIX = "__FORGE_NEO_SOURCE_EVENT__ "
SOURCE_RESULT_PREFIX = "__FORGE_NEO_SOURCE_RESULT__ "
_SOURCE_CHILD_STARTED = time.monotonic()
_CURRENT_JOB_ID = ""
_SOURCE_CONTEXT: dict[str, Any] | None = None
_SOURCE_BACKEND_ROOT: Path | None = None
_SOURCE_DATA_ROOT: Path | None = None
_SOURCE_ROOT: Path | None = None
_LOCAL_SOURCE_WEBUI_ROOT = Path(__file__).resolve().parents[1] / "webui"
_CONTROLNET_PREPROCESSORS_IMPORTED = False
_CONTROLNET_PREPROCESSOR_IMPORT_ERRORS: list[str] = []
_SOURCE_ADAPTER_SCRIPT_IMPORTS: set[str] = set()
_SOURCE_CONTROLNET_MODEL_EXTENSIONS = {".pt", ".pth", ".ckpt", ".safetensors", ".bin"}
_SOURCE_BACKEND_DEFAULT_PERFORMANCE_ARGS = [
    "--normalvram",
    "--cuda-stream",
    "--pin-shared-memory",
    "--disable-sage",
]
_SOURCE_BACKEND_DISABLED_VALUES = {"0", "false", "no", "off", "disabled", "none"}
_SOURCE_BACKEND_DEFAULT_VALUES = {"", "1", "true", "yes", "on", "default", "source", "source7890", "source_7890"}
_SOURCE_BACKEND_VRAM_FLAGS = {"--gpu-only", "--highvram", "--normalvram", "--lowvram", "--novram", "--cpu"}
_SOURCE_BACKEND_GPU_VENDOR_NVIDIA = "10DE"
_SOURCE_BACKEND_GPU_VENDOR_AMD = "1002"
_SOURCE_BACKEND_GPU_VENDOR_INTEL = "8086"
_SOURCE_DEFAULT_CUDA_MALLOC_DECISION_LOGGED = False
_SOURCE_DEFAULT_ACCEL_GUARDS_LOGGED = False
_SOURCE_BACKEND_PROGRESS_POLL_SECONDS = 1.0
_SOURCE_BACKEND_PREVIEW_INTERVAL_SECONDS = 2.0
_SOURCE_ADETAILER_PREVIEW_LIMIT = 8
_SOURCE_BACKEND_CONTROL_PAYLOAD_KEY = "__forge_neo_source_control_path"
_SOURCE_LORA_TOKEN_RE = re.compile(r"<lora:([^:>]+):([^>]*)>", re.IGNORECASE)


def _source_backend_progress_worker_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_PROGRESS_WORKER", "1") or "").strip().casefold()
    return value not in _SOURCE_BACKEND_DISABLED_VALUES


def _source_backend_progress_api_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_PROGRESS_API", "0") or "").strip().casefold()
    return value in {"1", "true", "yes", "on", "enabled", "api"}


def _source_backend_preview_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_PREVIEW", "1") or "").strip().casefold()
    return value not in _SOURCE_BACKEND_DISABLED_VALUES


def _write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def _source_dynamic_prompts_debug_path() -> Path:
    return Path(os.environ.get("TEMP") or os.environ.get("TMP") or ".") / "forge_neo_source_backend_dynamic_prompts_debug.json"


def _source_jsonable(value: Any) -> Any:
    try:
        json.dumps(value)
        return value
    except Exception:
        if isinstance(value, dict):
            return {str(key): _source_jsonable(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [_source_jsonable(item) for item in value]
        return str(value)


def _write_source_dynamic_prompts_debug(value: dict[str, Any]) -> None:
    try:
        _write_json(_source_dynamic_prompts_debug_path(), _source_jsonable(value))
    except Exception:
        pass


def _source_dynamic_prompts_debug_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_DYNAMIC_PROMPTS_DEBUG", "0") or "").strip().casefold()
    return value in {"1", "true", "yes", "on", "enabled", "debug"}


def _source_debug_should_record_dynamic_prompts(initial_payload: dict[str, Any], script_setup: dict[str, Any]) -> bool:
    if not _source_dynamic_prompts_debug_enabled():
        return False
    requested = set(script_setup.get("requested_scripts") or [])
    if "dynamic prompts" in requested:
        return True
    alwayson_scripts = initial_payload.get("alwayson_scripts")
    if isinstance(alwayson_scripts, dict):
        return any(str(name or "").strip().casefold().startswith("dynamic prompts") for name in alwayson_scripts)
    script_name = str(initial_payload.get("script_name") or "").strip().casefold()
    return script_name.startswith("dynamic prompts")


def _source_child_timestamp() -> str:
    return datetime.now().astimezone().isoformat(timespec="milliseconds")


def _source_child_monotonic_seconds() -> float:
    return round(time.monotonic() - _SOURCE_CHILD_STARTED, 3)


def _emit_event(value: dict[str, Any]) -> None:
    payload = dict(value)
    if _CURRENT_JOB_ID and "job_id" not in payload:
        payload["job_id"] = _CURRENT_JOB_ID
    if "message" not in payload and payload.get("message_en"):
        payload["message"] = payload["message_en"]
    payload.setdefault("timestamp", _source_child_timestamp())
    payload.setdefault("monotonic_seconds", _source_child_monotonic_seconds())
    print(SOURCE_EVENT_PREFIX + json.dumps(payload, ensure_ascii=True), flush=True)


def _emit_result(job_id: str, value: dict[str, Any]) -> None:
    payload = {
        "job_id": job_id,
        "result": value,
        "timestamp": _source_child_timestamp(),
        "monotonic_seconds": _source_child_monotonic_seconds(),
    }
    print(
        SOURCE_RESULT_PREFIX
        + json.dumps(payload, ensure_ascii=True),
        flush=True,
    )


def _stage_event(progress: float, en: str, cn: str, **extra: Any) -> dict[str, Any]:
    event = {
        "event": "progress",
        "progress": progress,
        "message": en,
        "message_en": en,
        "message_cn": cn,
    }
    event.update(extra)
    return event


def _stage_started(progress: float, en: str, cn: str, **extra: Any) -> float:
    _emit_event(_stage_event(progress, f"{en} started", f"{cn}开始", **extra))
    return time.monotonic()


def _stage_finished(progress: float, en: str, cn: str, started: float, **extra: Any) -> None:
    elapsed = time.monotonic() - started
    payload = {"elapsed_seconds": round(elapsed, 3)}
    payload.update(extra)
    _emit_event(
        _stage_event(
            progress,
            f"{en} finished in {elapsed:.1f}s",
            f"{cn}完成 {elapsed:.1f}s",
            **payload,
        )
    )


def _model_dump(value: object) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        data = value.model_dump()
    elif hasattr(value, "dict"):
        data = value.dict()
    else:
        data = {}
    return data if isinstance(data, dict) else {}


def _as_int(value: object, default: int = 0) -> int:
    try:
        return int(float(str(value)))
    except Exception:
        return default


def _as_float(value: object, default: float = 0.0) -> float:
    try:
        return float(str(value))
    except Exception:
        return default


def _payload_control_path(payload: dict[str, Any]) -> Path | None:
    value = str(payload.pop(_SOURCE_BACKEND_CONTROL_PAYLOAD_KEY, "") or "").strip()
    return Path(value) if value else None


def _source_lora_prompt_values(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(item or "") for item in value]
    return [str(value or "")]


def _source_lora_token_names(payload: dict[str, Any]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for key in ("prompt", "negative_prompt"):
        for text in _source_lora_prompt_values(payload.get(key)):
            for match in _SOURCE_LORA_TOKEN_RE.finditer(text):
                name = str(match.group(1) or "").strip()
                if not name:
                    continue
                normalized = name.casefold()
                if normalized in seen:
                    continue
                seen.add(normalized)
                names.append(name)
    return names


def _source_lora_entry(networks_module: object, name: str) -> object | None:
    available = getattr(networks_module, "available_networks", {}) or {}
    aliases = getattr(networks_module, "available_network_aliases", {}) or {}
    forbidden = {str(item).casefold() for item in (getattr(networks_module, "forbidden_network_aliases", set()) or set())}
    if name.casefold() in forbidden:
        return available.get(name)
    return aliases.get(name) or available.get(name)


def _source_lora_entry_info(name: str, entry: object | None) -> dict[str, Any] | None:
    if entry is None:
        return None
    filename = str(getattr(entry, "filename", "") or "")
    return {
        "token": name,
        "name": str(getattr(entry, "name", "") or name),
        "alias": str(getattr(entry, "alias", "") or ""),
        "filename": filename,
        "basename": os.path.basename(filename) if filename else "",
    }


def _source_extra_network_registry_state() -> dict[str, Any]:
    try:
        from modules import extra_networks
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
    registry = getattr(extra_networks, "extra_network_registry", {}) or {}
    names = sorted(str(name) for name in registry)
    return {
        "ok": True,
        "registered": names,
        "count": len(names),
        "lora_registered": "lora" in registry,
    }


def _ensure_source_lora_extra_network_registered() -> dict[str, Any]:
    state = _source_extra_network_registry_state()
    if state.get("lora_registered"):
        state["changed"] = False
        return state
    try:
        from modules import extra_networks
        import extra_networks_lora
        import networks

        networks.extra_network_lora = extra_networks_lora.ExtraNetworkLora()
        extra_networks.register_extra_network(networks.extra_network_lora)
    except Exception as exc:
        state["changed"] = False
        state["error"] = f"{type(exc).__name__}: {exc}"
        return state
    updated = _source_extra_network_registry_state()
    updated["changed"] = True
    return updated


def _refresh_source_loras_for_payload(payload: dict[str, Any]) -> dict[str, Any]:
    requested = _source_lora_token_names(payload)
    result: dict[str, Any] = {
        "requested": requested,
        "resolved": [],
        "missing": [],
        "refreshed_by_name": False,
        "refreshed_full_list": False,
        "extra_networks": _source_extra_network_registry_state(),
    }
    if not requested:
        return result

    try:
        import networks
    except Exception as exc:
        result["missing"] = requested
        result["error"] = f"{type(exc).__name__}: {exc}"
        _emit_event(
            _stage_event(
                0.18,
                "Source LoRA registry check failed",
                "源后端 LoRA 注册表检查失败",
                source_lora_registry=result,
            )
        )
        return result

    def collect() -> tuple[list[dict[str, Any]], list[str]]:
        resolved: list[dict[str, Any]] = []
        missing: list[str] = []
        for name in requested:
            info = _source_lora_entry_info(name, _source_lora_entry(networks, name))
            if info is None:
                missing.append(name)
            else:
                resolved.append(info)
        return resolved, missing

    resolved, missing = collect()
    if missing and hasattr(networks, "update_available_networks_by_names"):
        try:
            networks.update_available_networks_by_names(missing)
            result["refreshed_by_name"] = True
        except Exception as exc:
            result["refresh_by_name_error"] = f"{type(exc).__name__}: {exc}"
        resolved, missing = collect()
    if missing and hasattr(networks, "list_available_networks"):
        try:
            networks.list_available_networks()
            result["refreshed_full_list"] = True
        except Exception as exc:
            result["refresh_full_list_error"] = f"{type(exc).__name__}: {exc}"
        resolved, missing = collect()

    result["resolved"] = resolved
    result["missing"] = missing
    _emit_event(
        _stage_event(
            0.18,
            "Source LoRA registry checked",
            "源后端 LoRA 注册表已检查",
            source_lora_registry=result,
        )
    )
    return result


def _source_preview_interval_seconds() -> float:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_PREVIEW_INTERVAL", "") or "").strip()
    if value.casefold() in _SOURCE_BACKEND_DISABLED_VALUES:
        return 0.0
    if not value:
        return _SOURCE_BACKEND_PREVIEW_INTERVAL_SECONDS
    try:
        parsed = float(value)
        if parsed <= 0:
            return 0.0
        return max(0.5, parsed)
    except Exception:
        return _SOURCE_BACKEND_PREVIEW_INTERVAL_SECONDS


def _configure_live_preview() -> None:
    try:
        from modules import shared

        shared.opts.live_previews_enable = True
        every_n_steps = _as_int(getattr(shared.opts, "show_progress_every_n_steps", 1), 1)
        if every_n_steps < 1:
            shared.opts.show_progress_every_n_steps = 1
    except Exception:
        pass


def _progress_message(
    progress: float,
    step: int,
    steps: int,
    textinfo: object,
    *,
    active: bool,
    queued: bool,
    completed: bool,
) -> tuple[str, str]:
    text = str(textinfo or "").strip()
    if steps > 0:
        return f"Source backend sampling {step}/{steps}", f"源后端采样 {step}/{steps}"
    if queued:
        return "Source backend queued", "源后端排队中"
    if active:
        return "Source backend preparing sampler", "源后端准备采样"
    if completed:
        return "Source backend collecting output", "源后端收集输出"
    if text:
        return text, text
    if progress > 0:
        return "Source backend working", "源后端处理中"
    return "Source backend waiting", "源后端等待中"


def _source_live_preview(previous_preview_id: int = -1) -> tuple[str | None, int | None]:
    from modules import shared

    state = getattr(shared, "state", None)
    if state is None:
        return None, None

    set_current_image = getattr(state, "set_current_image", None)
    if callable(set_current_image):
        set_current_image()

    image = getattr(state, "current_image", None)
    preview_id = _as_int(getattr(state, "id_live_preview", -1), -1)
    if image is None:
        return None, preview_id
    if preview_id == previous_preview_id:
        return None, preview_id

    _video = bool(getattr(image, "is_animated", False))
    image_format = "gif" if _video else str(getattr(shared.opts, "live_previews_image_format", "jpeg") or "jpeg")
    image_format = image_format.lower()
    buffered = io.BytesIO()
    if image_format == "png":
        if max(*image.size) <= 256:
            save_kwargs = {"optimize": True}
        else:
            save_kwargs = {"optimize": False, "compress_level": 1}
    elif image_format == "gif":
        save_kwargs = {"save_all": True, "loop": 0}
    else:
        if getattr(image, "mode", None) != "RGB":
            image = image.convert("RGB")
        image_format = "jpeg"
        save_kwargs = {}

    image.save(buffered, format=image_format, **save_kwargs)
    base64_image = base64.b64encode(buffered.getvalue()).decode("ascii")
    return f"data:image/{image_format};base64,{base64_image}", preview_id


def _progress_worker(
    api: object,
    models: object,
    stop_event: threading.Event,
    *,
    requested_steps: int,
    requested_batches: int,
    task_id: str,
) -> None:
    if not _source_backend_progress_api_enabled():
        _progress_worker_passive(
            stop_event,
            requested_steps=requested_steps,
            requested_batches=requested_batches,
            task_id=task_id,
        )
        return

    from modules import shared
    from modules import progress as source_progress

    preview_id = -1
    preview_interval = _source_preview_interval_seconds()
    last_preview_monotonic = 0.0
    last_preview_step = -1
    last_key: tuple[object, ...] | None = None
    last_error = ""
    last_preview_error = ""
    while not stop_event.is_set():
        try:
            request = source_progress.ProgressRequest(id_task=task_id, id_live_preview=preview_id, live_preview=False)
            response = source_progress.progressapi(request)
            data = _model_dump(response)
            state = data.get("state") if isinstance(data.get("state"), dict) else {}
            active = bool(data.get("active"))
            queued = bool(data.get("queued"))
            completed = bool(data.get("completed"))
            if active:
                step = _as_int(state.get("sampling_step", getattr(shared.state, "sampling_step", 0)))
                steps = _as_int(state.get("sampling_steps", getattr(shared.state, "sampling_steps", requested_steps)))
                if step <= 0:
                    steps = 0
                elif requested_steps > 0 and steps > 0 and steps != requested_steps:
                    steps = requested_steps
                job_no = max(0, _as_int(getattr(shared.state, "job_no", 0)))
                job_count = _as_int(getattr(shared.state, "job_count", 0))
            else:
                step = 0
                steps = 0
                job_no = 0
                job_count = 0
            source_progress_value = max(0.0, min(1.0, _as_float(data.get("progress"), 0.0)))
            if steps > 0:
                total_jobs = max(job_count, requested_batches, 1)
                step_fraction = max(0.0, min(1.0, float(step) / max(steps, 1)))
                progress = 0.22 + 0.76 * max(0.0, min(1.0, (job_no + step_fraction) / total_jobs))
                progress = max(progress, source_progress_value)
            elif queued:
                progress = max(0.18, source_progress_value)
            elif active:
                progress = max(0.22, min(0.35, 0.22 + source_progress_value * 0.2))
            elif completed:
                progress = 0.98
            else:
                progress = max(0.16, source_progress_value)
            progress = max(0.0, min(0.99, progress))
            eta_relative = max(0.0, _as_float(data.get("eta"), _as_float(data.get("eta_relative"), 0.0)))
            current_image = data.get("live_preview") or data.get("current_image")
            next_preview_id = data.get("id_live_preview")
            if next_preview_id is not None:
                preview_id = _as_int(next_preview_id, preview_id)
            else:
                preview_id = _as_int(getattr(shared.state, "id_live_preview", preview_id), preview_id)
            preview_step = max(_as_int(getattr(shared.state, "preview_step", step), step), step)
            preview_due = (
                preview_interval > 0
                and active
                and steps > 0
                and preview_step > 0
                and preview_step > last_preview_step
                and time.monotonic() - last_preview_monotonic >= preview_interval
            )
            if preview_due:
                try:
                    preview_request = source_progress.ProgressRequest(
                        id_task=task_id,
                        id_live_preview=preview_id,
                        live_preview=True,
                    )
                    preview_response = source_progress.progressapi(preview_request)
                    preview_data = _model_dump(preview_response)
                    preview_image = preview_data.get("live_preview") or preview_data.get("current_image")
                    preview_next_id = preview_data.get("id_live_preview")
                    if preview_next_id is not None:
                        preview_id = _as_int(preview_next_id, preview_id)
                    else:
                        preview_id = _as_int(getattr(shared.state, "id_live_preview", preview_id), preview_id)
                    if preview_image:
                        current_image = preview_image
                    last_preview_step = preview_step
                    last_preview_monotonic = time.monotonic()
                    last_preview_error = ""
                except Exception as exc:
                    last_preview_monotonic = time.monotonic()
                    preview_error = f"{type(exc).__name__}: {exc}"
                    if preview_error != last_preview_error:
                        last_preview_error = preview_error
                        _emit_event(
                            _stage_event(
                                progress,
                                f"Source backend preview unavailable: {preview_error}",
                                f"源后端预览不可用：{preview_error}",
                            )
                        )
            message_en, message_cn = _progress_message(
                progress,
                step,
                steps,
                data.get("textinfo"),
                active=active,
                queued=queued,
                completed=completed,
            )
            key = (round(progress, 4), step, steps, preview_id, bool(current_image), message_en, message_cn)
            if key == last_key:
                continue
            last_key = key
            event: dict[str, Any] = {
                "event": "progress",
                "progress": progress,
                "message": message_en,
                "message_en": message_en,
                "message_cn": message_cn,
                "sampling_step": step,
                "sampling_steps": steps,
                "eta_relative": eta_relative,
                "id_live_preview": preview_id,
                "source_active": active,
                "source_queued": queued,
                "source_completed": completed,
            }
            if current_image:
                event["current_image"] = _to_text_image(current_image)
            _emit_event(event)
        except Exception as exc:
            error = f"{type(exc).__name__}: {exc}"
            if error != last_error:
                last_error = error
                _emit_event(
                    _stage_event(
                        0.18,
                        f"Source backend progress unavailable: {error}",
                        f"源后端进度不可用：{error}",
                    )
                )
        stop_event.wait(_SOURCE_BACKEND_PROGRESS_POLL_SECONDS)


def _progress_worker_passive(
    stop_event: threading.Event,
    *,
    requested_steps: int,
    requested_batches: int,
    task_id: str,
) -> None:
    from modules import shared

    preview_id = -1
    preview_interval = _source_preview_interval_seconds()
    preview_enabled = _source_backend_preview_enabled()
    last_preview_monotonic = 0.0
    last_preview_step = -1
    last_preview_error = ""
    last_key: tuple[object, ...] | None = None
    while not stop_event.is_set():
        state_obj = getattr(shared, "state", None)
        if state_obj is None:
            stop_event.wait(_SOURCE_BACKEND_PROGRESS_POLL_SECONDS)
            continue

        step = _as_int(getattr(state_obj, "sampling_step", 0))
        steps = _as_int(getattr(state_obj, "sampling_steps", requested_steps))
        if step <= 0:
            steps = 0
        elif requested_steps > 0 and steps > 0 and steps != requested_steps:
            steps = requested_steps

        job_no = max(0, _as_int(getattr(state_obj, "job_no", 0)))
        job_count = _as_int(getattr(state_obj, "job_count", requested_batches))
        total_jobs = max(job_count, requested_batches, 1)
        if steps > 0:
            step_fraction = max(0.0, min(1.0, float(step) / max(steps, 1)))
            progress = 0.22 + 0.76 * max(0.0, min(1.0, (job_no + step_fraction) / total_jobs))
        else:
            progress = 0.22
        progress = max(0.0, min(0.99, progress))

        textinfo = getattr(state_obj, "textinfo", None)
        preview_id = _as_int(getattr(state_obj, "id_live_preview", preview_id), preview_id)
        current_image = None
        preview_step = max(_as_int(getattr(state_obj, "preview_step", step), step), step)
        preview_due = (
            preview_enabled
            and preview_interval > 0
            and steps > 0
            and preview_step > 0
            and preview_step > last_preview_step
            and time.monotonic() - last_preview_monotonic >= preview_interval
        )
        if preview_due:
            try:
                preview_image, next_preview_id = _source_live_preview(preview_id)
                if next_preview_id is not None:
                    preview_id = _as_int(next_preview_id, preview_id)
                if preview_image:
                    current_image = preview_image
                last_preview_step = preview_step
                last_preview_monotonic = time.monotonic()
                last_preview_error = ""
            except Exception as exc:
                last_preview_monotonic = time.monotonic()
                preview_error = f"{type(exc).__name__}: {exc}"
                if preview_error != last_preview_error:
                    last_preview_error = preview_error
                    _emit_event(
                        _stage_event(
                            progress,
                            f"Source backend preview unavailable: {preview_error}",
                            f"源后端预览不可用：{preview_error}",
                        )
                    )

        eta_relative = max(0.0, _as_float(getattr(state_obj, "eta_relative", 0.0), 0.0))
        message_en, message_cn = _progress_message(
            progress,
            step,
            steps,
            textinfo,
            active=True,
            queued=False,
            completed=False,
        )
        key = (round(progress, 4), step, steps, preview_id, bool(current_image), message_en, message_cn)
        if key != last_key:
            last_key = key
            event = {
                "event": "progress",
                "progress": progress,
                "message": message_en,
                "message_en": message_en,
                "message_cn": message_cn,
                "sampling_step": step,
                "sampling_steps": steps,
                "eta_relative": eta_relative,
                "id_live_preview": preview_id,
                "source_active": True,
                "source_queued": False,
                "source_completed": False,
                "task_id": task_id,
            }
            if current_image:
                event["current_image"] = _to_text_image(current_image)
            _emit_event(event)
        stop_event.wait(_SOURCE_BACKEND_PROGRESS_POLL_SECONDS)


def _cuda_memory_snapshot() -> dict[str, Any]:
    try:
        import torch

        if not torch.cuda.is_available():
            return {"available": False}
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        return {
            "available": True,
            "allocated_mb": round(torch.cuda.memory_allocated() / 1048576, 1),
            "reserved_mb": round(torch.cuda.memory_reserved() / 1048576, 1),
            "free_mb": round(free_bytes / 1048576, 1),
            "total_mb": round(total_bytes / 1048576, 1),
        }
    except Exception as exc:
        return {"available": False, "error": f"{type(exc).__name__}: {exc}"}


def _source_state_snapshot() -> dict[str, Any]:
    try:
        from modules import shared

        state = getattr(shared, "state", None)
        if state is None:
            return {}
        return {
            "job": str(getattr(state, "job", "") or ""),
            "job_no": _as_int(getattr(state, "job_no", 0)),
            "job_count": _as_int(getattr(state, "job_count", 0)),
            "sampling_step": _as_int(getattr(state, "sampling_step", 0)),
            "sampling_steps": _as_int(getattr(state, "sampling_steps", 0)),
            "interrupted": bool(getattr(state, "interrupted", False)),
            "skipped": bool(getattr(state, "skipped", False)),
        }
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}"}


def _reset_source_progress_state(task_id: str, *, requested_steps: int, requested_batches: int) -> None:
    try:
        from modules import shared

        state = getattr(shared, "state", None)
        if state is None:
            return
        state.job = str(task_id or "")
        state.job_no = 0
        state.job_count = max(1, requested_batches)
        state.sampling_step = 0
        state.sampling_steps = 0
        state.preview_step = 0
        state.current_image_sampling_step = 0
        state.current_latent = None
        state.current_image = None
        state.id_live_preview = 0
        state.textinfo = None
        state.skipped = False
        state.interrupted = False
        state.stopping_generation = False
    except Exception:
        pass


def _source_control_action(control_path: Path | None) -> str:
    if control_path is None:
        return ""
    try:
        text = control_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""
    except Exception:
        return ""
    if not text:
        return ""
    try:
        value = json.loads(text)
        action = str(value.get("status") or value.get("action") or "").strip().casefold() if isinstance(value, dict) else str(value).strip().casefold()
    except Exception:
        action = text.strip().casefold()
    if action in {"skipped", "skip"}:
        return "skipped"
    if action in {"stopped", "stop", "interrupt", "interrupted"}:
        return "stopped"
    return ""


def _apply_source_control_action(action: str) -> None:
    try:
        from modules import shared

        if action == "skipped":
            shared.state.skip()
        else:
            shared.state.interrupt()
    except Exception:
        pass


def _request_watchdog_worker(stop_event: threading.Event, *, stage: str, progress: float, control_path: Path | None = None) -> None:
    last_control_action = ""
    while not stop_event.wait(0.5):
        control_action = _source_control_action(control_path)
        if control_action and control_action != last_control_action:
            last_control_action = control_action
            _apply_source_control_action(control_action)
            _emit_event(
                _stage_event(
                    progress,
                    f"Source backend {control_action} requested",
                    f"源后端已收到 {control_action} 请求",
                    source_control_status=control_action,
                    source_state=_source_state_snapshot(),
                    cuda_memory=_cuda_memory_snapshot(),
                )
            )


def _package_alias(name: str, path: Path) -> None:
    module = types.ModuleType(name)
    module.__file__ = str(path / "__init__.py")
    module.__path__ = [str(path)]
    module.__package__ = name
    sys.modules[name] = module


def _clear_source_modules() -> None:
    prefixes = ("backend.", "modules.", "modules_forge.", "k_diffusion.")
    names = {"backend", "modules", "modules_forge", "k_diffusion", "launch"}
    for name in list(sys.modules):
        if name in names or name.startswith(prefixes):
            del sys.modules[name]


def _remove_path_from_sys_path(path: Path) -> None:
    target = os.path.normcase(os.path.abspath(str(path)))
    sys.path[:] = [
        item
        for item in sys.path
        if os.path.normcase(os.path.abspath(item or os.getcwd())) != target
    ]


def _has_source_arg(tokens: list[str], name: str) -> bool:
    return any(token == name or token.startswith(f"{name}=") for token in tokens)


def _source_windows_display_vendor_ids() -> set[str]:
    if os.name != "nt":
        return set()

    try:
        import ctypes

        class DISPLAY_DEVICEA(ctypes.Structure):
            _fields_ = [
                ("cb", ctypes.c_ulong),
                ("DeviceName", ctypes.c_char * 32),
                ("DeviceString", ctypes.c_char * 128),
                ("StateFlags", ctypes.c_ulong),
                ("DeviceID", ctypes.c_char * 128),
                ("DeviceKey", ctypes.c_char * 128),
            ]

        user32 = ctypes.windll.user32
        vendor_ids: set[str] = set()
        device_info = DISPLAY_DEVICEA()
        device_info.cb = ctypes.sizeof(device_info)
        device_index = 0
        while user32.EnumDisplayDevicesA(None, device_index, ctypes.byref(device_info), 0):
            device_index += 1
            device_id = device_info.DeviceID.decode("utf-8", errors="ignore").upper()
            match = re.search(r"VEN_([0-9A-F]{4})", device_id)
            if match:
                vendor_ids.add(match.group(1))
        return vendor_ids
    except Exception:
        return set()


def _source_torch_runtime_backend_kind() -> str | None:
    try:
        import torch

        if getattr(torch.version, "hip", None):
            return "hip"
        if getattr(torch.version, "cuda", None):
            return "cuda"
        return "cpu"
    except Exception:
        pass

    try:
        torch_spec = importlib.util.find_spec("torch")
        search_locations = getattr(torch_spec, "submodule_search_locations", None) or []
        for folder in search_locations:
            version_file = os.path.join(folder, "version.py")
            if not os.path.isfile(version_file):
                continue
            spec = importlib.util.spec_from_file_location("forge_neo_source_torch_version_probe", version_file)
            if spec is None or spec.loader is None:
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if getattr(module, "hip", None):
                return "hip"
            if getattr(module, "cuda", None):
                return "cuda"
            return "cpu"
    except Exception:
        pass
    return None


def _log_source_default_cuda_malloc_decision(message: str) -> None:
    global _SOURCE_DEFAULT_CUDA_MALLOC_DECISION_LOGGED
    if _SOURCE_DEFAULT_CUDA_MALLOC_DECISION_LOGGED:
        return
    _SOURCE_DEFAULT_CUDA_MALLOC_DECISION_LOGGED = True
    print(f"[Forge Neo source_backend] {message}", flush=True)


def _log_source_default_accel_guard(message: str) -> None:
    global _SOURCE_DEFAULT_ACCEL_GUARDS_LOGGED
    if _SOURCE_DEFAULT_ACCEL_GUARDS_LOGGED:
        return
    _SOURCE_DEFAULT_ACCEL_GUARDS_LOGGED = True
    print(f"[Forge Neo source_backend] {message}", flush=True)


def _source_backend_default_cuda_malloc_arg() -> str | None:
    override = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_CUDA_MALLOC", "") or "").strip().casefold()
    if override in _SOURCE_BACKEND_DISABLED_VALUES:
        _log_source_default_cuda_malloc_decision(
            "Detected FORGE_NEO_SOURCE_BACKEND_CUDA_MALLOC override; defaulting to --disable-cuda-malloc."
        )
        return "--disable-cuda-malloc"
    if override in {"1", "true", "yes", "on", "enabled", "cuda", "cuda-malloc"}:
        _log_source_default_cuda_malloc_decision(
            "Detected FORGE_NEO_SOURCE_BACKEND_CUDA_MALLOC override; defaulting to --cuda-malloc."
        )
        return "--cuda-malloc"

    backend_kind = _source_torch_runtime_backend_kind()
    if backend_kind == "cuda":
        _log_source_default_cuda_malloc_decision(
            "Detected torch backend: cuda; leaving cuda-malloc to backend defaults."
        )
        return None
    if backend_kind in {"hip", "cpu"}:
        _log_source_default_cuda_malloc_decision(
            f"Detected torch backend: {backend_kind}; defaulting to --disable-cuda-malloc."
        )
        return "--disable-cuda-malloc"

    vendor_ids = _source_windows_display_vendor_ids()
    if vendor_ids and vendor_ids.issubset({_SOURCE_BACKEND_GPU_VENDOR_NVIDIA}):
        _log_source_default_cuda_malloc_decision(
            f"Detected Windows GPU vendor IDs: {sorted(vendor_ids)}; treating system as NVIDIA and leaving cuda-malloc to backend defaults."
        )
        return None
    if vendor_ids & {_SOURCE_BACKEND_GPU_VENDOR_AMD, _SOURCE_BACKEND_GPU_VENDOR_INTEL}:
        _log_source_default_cuda_malloc_decision(
            f"Detected Windows GPU vendor IDs: {sorted(vendor_ids)}; defaulting to --disable-cuda-malloc."
        )
        return "--disable-cuda-malloc"
    _log_source_default_cuda_malloc_decision(
        "Unable to confirm a CUDA/NVIDIA backend; defaulting to --disable-cuda-malloc."
    )
    return "--disable-cuda-malloc"


def _source_backend_default_accel_guard_args() -> list[str]:
    backend_kind = _source_torch_runtime_backend_kind()
    if backend_kind in {"hip", "cpu"}:
        _log_source_default_accel_guard(
            f"Detected torch backend: {backend_kind}; defaulting to compatibility guards: --disable-xformers --disable-flash."
        )
        return ["--disable-xformers", "--disable-flash"]

    vendor_ids = _source_windows_display_vendor_ids()
    if vendor_ids & {_SOURCE_BACKEND_GPU_VENDOR_AMD, _SOURCE_BACKEND_GPU_VENDOR_INTEL}:
        _log_source_default_accel_guard(
            f"Detected Windows GPU vendor IDs: {sorted(vendor_ids)}; defaulting to compatibility guards: --disable-xformers --disable-flash."
        )
        return ["--disable-xformers", "--disable-flash"]
    return []


def _source_backend_performance_args(extra_args: list[str]) -> list[str]:
    mode = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_PERFORMANCE_ARGS", "") or "").strip()
    lowered = mode.casefold()
    if lowered in _SOURCE_BACKEND_DISABLED_VALUES:
        return []
    if lowered in _SOURCE_BACKEND_DEFAULT_VALUES:
        args = list(_SOURCE_BACKEND_DEFAULT_PERFORMANCE_ARGS)
    else:
        args = shlex.split(mode)

    if any(_has_source_arg(extra_args, flag) for flag in _SOURCE_BACKEND_VRAM_FLAGS):
        args = [arg for arg in args if arg not in _SOURCE_BACKEND_VRAM_FLAGS]
    if _has_source_arg(extra_args, "--cuda-malloc"):
        args = [arg for arg in args if arg != "--cuda-malloc"]
    if _has_source_arg(extra_args, "--cuda-stream"):
        args = [arg for arg in args if arg != "--cuda-stream"]
    if _has_source_arg(extra_args, "--pin-shared-memory"):
        args = [arg for arg in args if arg != "--pin-shared-memory"]
    has_explicit_cuda_malloc = (
        _has_source_arg(extra_args, "--cuda-malloc")
        or _has_source_arg(extra_args, "--disable-cuda-malloc")
        or _has_source_arg(args, "--cuda-malloc")
        or _has_source_arg(args, "--disable-cuda-malloc")
    )
    if not has_explicit_cuda_malloc:
        default_cuda_malloc_arg = _source_backend_default_cuda_malloc_arg()
        if default_cuda_malloc_arg:
            args.append(default_cuda_malloc_arg)
    has_explicit_attention_override = any(
        _has_source_arg(extra_args, flag) or _has_source_arg(args, flag)
        for flag in ("--disable-xformers", "--disable-flash", "--use-pytorch-cross-attention")
    )
    if not has_explicit_attention_override:
        for guard_arg in _source_backend_default_accel_guard_args():
            if not _has_source_arg(extra_args, guard_arg) and not _has_source_arg(args, guard_arg):
                args.append(guard_arg)
    return args


def _ensure_source_backend_vram_arg(args: list[str]) -> list[str]:
    if any(_has_source_arg(args, flag) for flag in _SOURCE_BACKEND_VRAM_FLAGS):
        return args
    return [*args, "--normalvram"]


def _source_code_root(data_root: Path, backend_root: Path) -> Path:
    override = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_CODE_ROOT", "") or "").strip()
    if override:
        candidate = Path(override).expanduser()
        if (
            (candidate / "backend").is_dir()
            and (candidate / "modules").is_dir()
            and (candidate / "modules_forge").is_dir()
        ) or ((candidate / "modules").is_dir() and (candidate / "modules_forge").is_dir()):
            return candidate
    if (
        (backend_root / "modules").is_dir()
        and (backend_root / "modules_forge").is_dir()
    ):
        return backend_root
    if (
        (data_root / "backend").is_dir()
        and (data_root / "modules").is_dir()
        and (data_root / "modules_forge").is_dir()
    ):
        return data_root
    if (
        (_LOCAL_SOURCE_WEBUI_ROOT / "backend").is_dir()
        and (_LOCAL_SOURCE_WEBUI_ROOT / "modules").is_dir()
        and (_LOCAL_SOURCE_WEBUI_ROOT / "modules_forge").is_dir()
    ):
        return _LOCAL_SOURCE_WEBUI_ROOT
    return backend_root


def _source_package_roots(source_root: Path) -> tuple[Path, Path, Path]:
    if (source_root / "backend").is_dir():
        return source_root / "backend", source_root / "modules", source_root / "modules_forge"
    return source_root, source_root / "modules", source_root / "modules_forge"


def _setup_source_imports(backend_root: Path, data_root: Path, model_ref: Path | None = None) -> Path:
    global _SOURCE_BACKEND_ROOT, _SOURCE_DATA_ROOT, _SOURCE_ROOT
    source_root = _source_code_root(data_root, backend_root)
    _SOURCE_BACKEND_ROOT = backend_root
    _SOURCE_DATA_ROOT = data_root
    _SOURCE_ROOT = source_root
    repo_root = Path(__file__).resolve().parents[2]
    backend_package_root, modules_root, modules_forge_root = _source_package_roots(source_root)
    _clear_source_modules()
    _remove_path_from_sys_path(backend_root)
    _remove_path_from_sys_path(backend_package_root)
    _package_alias("backend", backend_package_root)
    _package_alias("modules", modules_root)
    _package_alias("modules_forge", modules_forge_root)

    source_site_packages = data_root.parent / "system" / "python" / "Lib" / "site-packages"
    for path in (source_site_packages, modules_forge_root / "packages", source_root, repo_root):
        text = str(path)
        if path.exists() and text not in sys.path:
            sys.path.append(text)

    disable_extensions = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_DISABLE_EXTENSIONS", "extra") or "").lower()
    args = [
        "--data-dir",
        str(data_root),
        "--skip-version-check",
        "--skip-prepare-environment",
        "--skip-install",
        "--api",
        "--disable-console-progressbars",
    ]
    hashing_enabled = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_HASHING", "0") or "").strip().casefold()
    if hashing_enabled not in {"1", "true", "yes", "on", "enabled"}:
        args.append("--no-hashing")
    extra_args = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_ARGS", "") or "").strip()
    extra_arg_tokens = shlex.split(extra_args) if extra_args else []
    args.extend(_source_backend_performance_args(extra_arg_tokens))
    if model_ref is not None:
        args.extend(["--model-ref", str(model_ref)])
    args.extend(_env_model_dir_args())
    controlnet_dirs = _env_existing_dirs("FORGE_NEO_SOURCE_BACKEND_CONTROLNET_DIRS")
    if controlnet_dirs:
        args.extend(["--controlnet-dir", controlnet_dirs[0]])
        for path in controlnet_dirs[1:]:
            args.extend(["--controlnet-dirs", path])
    if disable_extensions in {"all", "1", "true", "yes", "on"}:
        args.append("--disable-all-extensions")
    elif disable_extensions in {"extra", "builtin", "builtins", "builtin-only", "builtins-only"}:
        args.append("--disable-extra-extensions")
    if extra_arg_tokens:
        args.extend(extra_arg_tokens)
    args = _ensure_source_backend_vram_arg(args)

    def quote_arg(value: object) -> str:
        return '"' + str(value).replace('"', '\\"') + '"'

    commandline_args = " ".join(quote_arg(item) for item in args)
    os.environ["COMMANDLINE_ARGS"] = ""
    os.environ["FORGE_NEO_SOURCE_BACKEND_COMMANDLINE_ARGS"] = commandline_args
    os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")
    os.environ.setdefault("FORGE_NEO_LOADER_STAGE_LOGS", "1")
    os.environ.setdefault("FORGE_NEO_LOAD_STATE_DICT_ASSIGN", "0")
    os.environ.setdefault("FORGE_NEO_SOURCE_BACKEND_SAMPLING_STAGE_LOGS", "1")
    os.environ.setdefault("FORGE_NEO_SOURCE_BACKEND_DISABLE_CUDNN_SDPA", "0")
    os.environ.setdefault("FORGE_NEO_SOURCE_BACKEND_COMFY_KITCHEN_ROPE_BACKEND", "native")
    os.environ.setdefault("FORGE_NEO_SOURCE_BACKEND_DIRECT_FULL_LOAD", "0")
    os.environ.setdefault("FORGE_NEO_SOURCE_BACKEND_ANIMA_NO_INFERENCE_MODE", "0")
    sys.argv = [sys.argv[0], *args]
    _emit_event(
        _stage_event(
            0.025,
            "Source backend command line prepared",
            "源后端启动参数已准备",
            backend_root=str(backend_root),
            data_root=str(data_root),
            source_root=str(source_root),
            python_executable=str(Path(sys.executable)),
            commandline_args=commandline_args,
        )
    )
    return source_root


def _env_existing_dirs(name: str) -> list[str]:
    value = str(os.environ.get(name, "") or "").strip()
    if not value:
        return []
    dirs: list[str] = []
    seen: set[str] = set()
    for item in value.split(os.pathsep):
        text = str(item or "").strip()
        if not text:
            continue
        path = Path(text).expanduser()
        if not path.is_dir():
            continue
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        dirs.append(str(path))
    return dirs


def _env_model_dir_args() -> list[str]:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_DIR_ARGS_JSON", "") or "").strip()
    if not value:
        return []
    try:
        data = json.loads(value)
    except Exception:
        return []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    seen: set[tuple[str, str]] = set()
    index = 0
    while index + 1 < len(data):
        arg_name = str(data[index] or "").strip()
        path_text = str(data[index + 1] or "").strip()
        index += 2
        if not arg_name.startswith("--") or not path_text:
            continue
        path = Path(path_text).expanduser()
        if not path.is_dir():
            continue
        key = (arg_name, os.path.normcase(os.path.normpath(str(path))))
        if key in seen:
            continue
        seen.add(key)
        out.extend([arg_name, str(path)])
    return out


def _to_text_image(value: object) -> str:
    try:
        from PIL import Image

        if isinstance(value, Image.Image):
            image = value
            buffered = io.BytesIO()
            if getattr(image, "mode", None) not in {"RGB", "RGBA"}:
                image = image.convert("RGB")
            image.save(buffered, format="PNG")
            return base64.b64encode(buffered.getvalue()).decode("ascii")
    except Exception:
        pass
    if isinstance(value, bytes):
        return value.decode("ascii", errors="ignore")
    text = str(value or "")
    if text.startswith("data:") and "," in text:
        return text.split(",", 1)[1]
    return text


def _source_adetailer_preview_capture_enabled(payload: dict[str, Any]) -> bool:
    alwayson_scripts = payload.get("alwayson_scripts")
    if not isinstance(alwayson_scripts, dict):
        return False
    for name, value in alwayson_scripts.items():
        if "adetailer" not in str(name or "").casefold():
            continue
        if not isinstance(value, dict):
            return True
        args = value.get("args")
        if not isinstance(args, list):
            return True
        if args and isinstance(args[0], bool) and not args[0]:
            return False
        saw_unit = False
        for item in args[2:]:
            if not isinstance(item, dict):
                continue
            saw_unit = True
            if not bool(item.get("ad_tab_enable", True)):
                continue
            model = str(item.get("ad_model") or "").strip()
            if model and model.casefold() != "none":
                return True
        return bool(args and args[0] and not saw_unit)
    return False


def _source_adetailer_selected_models(payload: dict[str, Any]) -> list[str]:
    alwayson_scripts = payload.get("alwayson_scripts")
    if not isinstance(alwayson_scripts, dict):
        return []
    models: list[str] = []
    seen: set[str] = set()
    for name, value in alwayson_scripts.items():
        if "adetailer" not in str(name or "").casefold() or not isinstance(value, dict):
            continue
        args = value.get("args")
        if not isinstance(args, list):
            continue
        if args and isinstance(args[0], bool) and not args[0]:
            continue
        for item in args[2:]:
            if not isinstance(item, dict):
                continue
            if item.get("ad_tab_enable") is False:
                continue
            model = str(item.get("ad_model") or "").strip()
            if not model or model.casefold() == "none":
                continue
            key = model.casefold()
            if key in seen:
                continue
            seen.add(key)
            models.append(model)
    return models


def _ensure_source_adetailer_models(payload: dict[str, Any]) -> dict[str, Any]:
    selected = _source_adetailer_selected_models(payload)
    if not selected:
        return {"requested": [], "existing": [], "downloaded": [], "errors": []}
    from forge_neo.adetailer_compat import adetailer_ensure_model

    existing: list[str] = []
    downloaded: list[str] = []
    errors: list[dict[str, str]] = []
    for model in selected:
        try:
            result = adetailer_ensure_model(model)
        except Exception as exc:
            errors.append({"model": model, "error": f"{type(exc).__name__}: {exc}"})
            continue
        if result.get("ok"):
            if result.get("downloaded"):
                downloaded.append(str(result.get("model") or model))
            else:
                existing.append(str(result.get("model") or model))
        else:
            errors.append({"model": model, "error": str(result.get("error") or "download_failed")})
    if errors:
        detail = "; ".join(f"{item['model']}: {item['error']}" for item in errors)
        raise RuntimeError(f"ADetailer model download failed: {detail}")
    return {"requested": selected, "existing": existing, "downloaded": downloaded, "errors": []}


def _source_called_from_adetailer_script() -> bool:
    try:
        frames = inspect.stack(context=0)
    except Exception:
        return False
    for frame in frames[2:14]:
        path = str(getattr(frame, "filename", "") or "").replace("\\", "/").casefold()
        if path.endswith("/scripts/adetailer.py") and "/adetailer-neo/" in path:
            return True
    return False


class _SourceAdetailerPreviewCapture:
    def __init__(self, enabled: bool):
        self.enabled = bool(enabled)
        self.images: list[object] = []
        self._state: object | None = None
        self._original: object | None = None
        self._had_instance_assign: bool = False
        self._original_instance_assign: object | None = None

    def __enter__(self):
        if not self.enabled:
            return self
        try:
            from modules import shared

            state = getattr(shared, "state", None)
            original = getattr(state, "assign_current_image", None)
            if state is None or not callable(original):
                return self
            state_dict = getattr(state, "__dict__", None)
            if isinstance(state_dict, dict):
                self._had_instance_assign = "assign_current_image" in state_dict
                self._original_instance_assign = state_dict.get("assign_current_image")

            def wrapped_assign_current_image(image, *args, **kwargs):
                result = original(image, *args, **kwargs)
                if len(self.images) < _SOURCE_ADETAILER_PREVIEW_LIMIT and _source_called_from_adetailer_script():
                    try:
                        self.images.append(image.copy() if hasattr(image, "copy") else image)
                    except Exception:
                        self.images.append(image)
                    try:
                        preview_id = _as_int(getattr(state, "id_live_preview", 0), 0)
                        step = _as_int(getattr(state, "sampling_step", 0), 0)
                        steps = _as_int(getattr(state, "sampling_steps", 0), 0)
                        _emit_event(
                            {
                                "event": "progress",
                                "progress": 0.5,
                                "message": "ADetailer detection preview",
                                "message_en": "ADetailer detection preview",
                                "message_cn": "ADetailer 检测预览",
                                "sampling_step": step,
                                "sampling_steps": steps,
                                "eta_relative": max(0.0, _as_float(getattr(state, "eta_relative", 0.0), 0.0)),
                                "id_live_preview": preview_id,
                                "current_image": _to_text_image(image),
                            }
                        )
                    except Exception:
                        pass
                return result

            self._state = state
            self._original = original
            setattr(state, "assign_current_image", wrapped_assign_current_image)
        except Exception as exc:
            _emit_event(
                _stage_event(
                    0.21,
                    f"ADetailer preview capture unavailable: {type(exc).__name__}: {exc}",
                    f"ADetailer 预览采集不可用：{type(exc).__name__}: {exc}",
                )
            )
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        if self._state is not None and self._original is not None:
            try:
                if self._had_instance_assign:
                    setattr(self._state, "assign_current_image", self._original_instance_assign)
                elif isinstance(getattr(self._state, "__dict__", None), dict):
                    delattr(self._state, "assign_current_image")
                else:
                    setattr(self._state, "assign_current_image", self._original)
            except Exception:
                pass
        return False


def _source_file_module_name(index: int, path: Path) -> str:
    safe_name = "".join(ch if ch.isalnum() else "_" for ch in path.stem)
    return f"_forge_neo_source_ext_{index}_{safe_name}"


def _import_source_file(module_name: str, path: Path) -> types.ModuleType:
    extension_root = path.parents[1]
    root_text = str(extension_root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot import {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _source_path_key(path: str | os.PathLike[str]) -> str:
    try:
        return os.path.normcase(str(Path(path).resolve()))
    except Exception:
        return os.path.normcase(str(path))


def _source_adetailer_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_ADETAILER_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "ADetailer-Neo")
    add(backend_root / "extensions" / "adetailer")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "ADetailer-Neo")
        add(_SOURCE_DATA_ROOT / "extensions" / "adetailer")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "ADetailer-Neo")
        add(_SOURCE_ROOT / "extensions" / "adetailer")
    return roots


def _source_script_data_has_path(scripts_module: object, script_path: Path) -> bool:
    target = _source_path_key(script_path)
    for script_data in list(getattr(scripts_module, "scripts_data", []) or []):
        if _source_path_key(str(getattr(script_data, "path", "") or "")) == target:
            return True
    return False


def _ensure_gradio_rangeslider_compat() -> None:
    if "gradio_rangeslider" in sys.modules:
        return
    try:
        import gradio_rangeslider  # noqa: F401

        return
    except Exception:
        pass
    try:
        import gradio as gr

        module = types.ModuleType("gradio_rangeslider")
        module.RangeSlider = gr.Slider
        sys.modules["gradio_rangeslider"] = module
    except Exception:
        return


def _ensure_adetailer_neo_import_modules() -> None:
    try:
        from modules import shared

        cmd_opts = getattr(shared, "cmd_opts", None)
        if cmd_opts is not None and not hasattr(cmd_opts, "ad_no_huggingface"):
            setattr(cmd_opts, "ad_no_huggingface", True)
        opts = getattr(shared, "opts", None)
        data = getattr(opts, "data", None)
        if isinstance(data, dict):
            from forge_neo.adetailer_compat import adetailer_primary_model_dir

            model_dir = str(adetailer_primary_model_dir())
            current = str(data.get("ad_extra_models_dir") or "")
            parts = [item for item in current.split(os.pathsep) if item]
            keys = {os.path.normcase(os.path.normpath(item)) for item in parts}
            key = os.path.normcase(os.path.normpath(model_dir))
            if key not in keys:
                parts.append(model_dir)
                data["ad_extra_models_dir"] = os.pathsep.join(parts)
    except Exception:
        pass
    _ensure_gradio_rangeslider_compat()


def _ensure_source_adetailer_script() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    script_names = ("adetailer.py", "!adetailer.py")
    for extension_root in _source_adetailer_extension_roots():
        script_path = next((extension_root / "scripts" / name for name in script_names if (extension_root / "scripts" / name).is_file()), extension_root / "scripts" / "adetailer.py")
        searched.append(str(script_path))
        if not script_path.is_file():
            continue

        if _source_script_data_has_path(scripts, script_path):
            return {
                "loaded": False,
                "already_loaded": True,
                "path": str(script_path),
            }

        module_name = "_forge_neo_source_adapter_adetailer"
        try:
            if script_path.name == "adetailer.py":
                _ensure_adetailer_neo_import_modules()
            module = _import_source_file(module_name, script_path)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            sys.modules.pop(module_name, None)
            continue

        registered = 0
        base_class = getattr(scripts, "Script", None)
        for _name, script_class in inspect.getmembers(module, inspect.isclass):
            if base_class is None or script_class is base_class:
                continue
            if getattr(script_class, "__module__", "") != module.__name__:
                continue
            try:
                is_script = issubclass(script_class, base_class)
            except TypeError:
                is_script = False
            if not is_script:
                continue
            scripts.scripts_data.append(
                scripts.ScriptClassData(
                    script_class,
                    str(script_path),
                    str(extension_root),
                    module,
                )
            )
            registered += 1

        key = _source_path_key(script_path)
        _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(key)
        return {
            "loaded": registered > 0,
            "registered": registered,
            "path": str(script_path),
        }

    return {
        "loaded": False,
        "missing": True,
        "searched": searched,
        "errors": errors,
    }


def _source_regional_prompter_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_REGIONAL_PROMPTER_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "sd-neo-regional-prompter")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "sd-neo-regional-prompter")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "sd-neo-regional-prompter")
    return roots


def _source_forge_couple_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_FORGE_COUPLE_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "sd-forge-couple")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "sd-forge-couple")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "sd-forge-couple")
    return roots


def _source_style_grid_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_STYLE_GRID_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "sd-webui-style-organizer")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "sd-webui-style-organizer")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "sd-webui-style-organizer")
    return roots


def _source_dynamic_prompts_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_DYNAMIC_PROMPTS_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "sd-dynamic-prompts")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "sd-dynamic-prompts")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "sd-dynamic-prompts")
    return roots


def _source_tipo_extension_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()

    def add(value: str | os.PathLike[str] | None) -> None:
        if value is None:
            return
        text = str(value or "").strip()
        if not text:
            return
        path = Path(text).expanduser()
        key = _source_path_key(path)
        if key in seen:
            return
        seen.add(key)
        roots.append(path)

    add(os.environ.get("FORGE_NEO_SOURCE_BACKEND_TIPO_ROOT"))
    backend_root = _SOURCE_BACKEND_ROOT or _LOCAL_SOURCE_WEBUI_ROOT
    add(backend_root / "extensions" / "z-tipo-extension")
    if _SOURCE_DATA_ROOT is not None:
        add(_SOURCE_DATA_ROOT / "extensions" / "z-tipo-extension")
    if _SOURCE_ROOT is not None:
        add(_SOURCE_ROOT / "extensions" / "z-tipo-extension")
    return roots


def _register_source_script_classes(module: types.ModuleType, script_path: Path, extension_root: Path) -> int:
    from modules import scripts

    registered = 0
    base_class = getattr(scripts, "Script", None)
    for _name, script_class in inspect.getmembers(module, inspect.isclass):
        if base_class is None or script_class is base_class:
            continue
        if getattr(script_class, "__module__", "") != module.__name__:
            continue
        try:
            is_script = issubclass(script_class, base_class)
        except TypeError:
            is_script = False
        if not is_script:
            continue
        scripts.scripts_data.append(
            scripts.ScriptClassData(
                script_class,
                str(script_path),
                str(extension_root),
                module,
            )
        )
        registered += 1
    return registered


def _register_source_dynamic_prompts_adapter_script(extension_root: Path | None, searched: list[str], errors: list[str]) -> dict[str, Any]:
    from modules import scripts

    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "forge_neo" / "dynamic_prompts_compat.py"
    if _source_script_data_has_path(scripts, script_path):
        return {"loaded": False, "already_loaded": True, "path": str(script_path), "adapter": True}

    module_name = "_forge_neo_source_adapter_dynamic_prompts"
    module = types.ModuleType(module_name)

    class SourceDynamicPromptsScript(scripts.Script):
        def title(self):
            from forge_neo.dynamic_prompts_compat import dynamic_prompts_script_title

            return dynamic_prompts_script_title(extension_root)

        def show(self, is_img2img):
            return scripts.AlwaysVisible

        def process(self, p, *args):
            from forge_neo.dynamic_prompts_compat import apply_dynamic_prompts_to_processing

            return apply_dynamic_prompts_to_processing(p, *args, extension_root=extension_root)

    SourceDynamicPromptsScript.__module__ = module_name
    module.SourceDynamicPromptsScript = SourceDynamicPromptsScript
    sys.modules[module_name] = module
    scripts.scripts_data.append(
        scripts.ScriptClassData(
            SourceDynamicPromptsScript,
            str(script_path),
            str(repo_root),
            module,
        )
    )
    return {
        "loaded": True,
        "registered": 1,
        "path": str(script_path),
        "extension_root": str(extension_root) if extension_root is not None else "",
        "searched": searched,
        "errors": errors,
        "adapter": True,
    }


def _ensure_source_dynamic_prompts_script() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    first_extension_root: Path | None = None
    for extension_root in _source_dynamic_prompts_extension_roots():
        if first_extension_root is None and extension_root.is_dir():
            first_extension_root = extension_root
        script_path = extension_root / "scripts" / "dynamic_prompting.py"
        searched.append(str(script_path))
        if not script_path.is_file():
            continue
        if _source_script_data_has_path(scripts, script_path):
            return {"loaded": False, "already_loaded": True, "path": str(script_path)}
        if importlib.util.find_spec("dynamicprompts") is None:
            errors.append("dynamicprompts package is not installed; using Forge Neo adapter script")
            continue
        module_name = "_forge_neo_source_adapter_dynamic_prompts_source"
        try:
            module = _import_source_file(module_name, script_path)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            sys.modules.pop(module_name, None)
            continue
        registered = _register_source_script_classes(module, script_path, extension_root)
        if registered:
            _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(_source_path_key(script_path))
            return {"loaded": True, "registered": registered, "path": str(script_path)}

    return _register_source_dynamic_prompts_adapter_script(first_extension_root, searched, errors)


def _ensure_source_dynamic_prompts_adapter_script() -> dict[str, Any]:
    searched: list[str] = []
    first_extension_root: Path | None = None
    for extension_root in _source_dynamic_prompts_extension_roots():
        if first_extension_root is None and extension_root.is_dir():
            first_extension_root = extension_root
        searched.append(str(extension_root / "scripts" / "dynamic_prompting.py"))
    return _register_source_dynamic_prompts_adapter_script(
        first_extension_root,
        searched,
        ["source runner did not expose Dynamic Prompts; using Forge Neo adapter script"],
    )


def _ensure_source_tipo_script() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    for extension_root in _source_tipo_extension_roots():
        script_path = extension_root / "scripts" / "tipo.py"
        searched.append(str(script_path))
        if not script_path.is_file():
            continue
        if _source_script_data_has_path(scripts, script_path):
            return {
                "loaded": False,
                "already_loaded": True,
                "path": str(script_path),
            }

        module_name = "_forge_neo_source_adapter_tipo"
        try:
            module = _import_source_file(module_name, script_path)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            sys.modules.pop(module_name, None)
            continue
        registered = _register_source_script_classes(module, script_path, extension_root)
        if registered:
            _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(_source_path_key(script_path))
            return {
                "loaded": True,
                "registered": registered,
                "path": str(script_path),
                "extension_root": str(extension_root),
                "errors": errors,
            }

    return {
        "loaded": False,
        "missing": True,
        "searched": searched,
        "errors": errors,
    }


def _source_script_from_class_data(script_data: object, *, is_img2img: bool) -> object | None:
    try:
        script = script_data.script_class()
    except Exception:
        return None
    script.filename = getattr(script_data, "path", "")
    script.is_txt2img = not is_img2img
    script.is_img2img = is_img2img
    script.tabname = "img2img" if is_img2img else "txt2img"
    return script


def _source_dynamic_prompts_adapter_script_instance(extension_root: Path | None, *, is_img2img: bool) -> object:
    from modules import scripts

    class SourceDynamicPromptsScript(scripts.Script):
        def title(self):
            from forge_neo.dynamic_prompts_compat import dynamic_prompts_script_title

            return dynamic_prompts_script_title(extension_root)

        def show(self, is_img2img):
            return scripts.AlwaysVisible

        def process(self, p, *args):
            from forge_neo.dynamic_prompts_compat import apply_dynamic_prompts_to_processing

            return apply_dynamic_prompts_to_processing(p, *args, extension_root=extension_root)

    repo_root = Path(__file__).resolve().parents[2]
    script = SourceDynamicPromptsScript()
    script.filename = str(repo_root / "forge_neo" / "dynamic_prompts_compat.py")
    script.is_txt2img = not is_img2img
    script.is_img2img = is_img2img
    script.tabname = "img2img" if is_img2img else "txt2img"
    script.alwayson = True
    return script


def _append_source_script_to_runner(runner: object, script: object) -> None:
    scripts_list = list(getattr(runner, "scripts", []) or [])
    alwayson_scripts = list(getattr(runner, "alwayson_scripts", []) or [])
    selectable_scripts = list(getattr(runner, "selectable_scripts", []) or [])
    title = _source_script_title(script).strip().lower()

    def same_title(item: object) -> bool:
        return _source_script_title(item).strip().lower() == title

    if not any(same_title(item) for item in scripts_list):
        scripts_list.append(script)
    if bool(getattr(script, "alwayson", False)):
        if not any(same_title(item) for item in alwayson_scripts):
            alwayson_scripts.append(script)
    elif not any(same_title(item) for item in selectable_scripts):
        selectable_scripts.append(script)
    setattr(runner, "scripts", scripts_list)
    setattr(runner, "alwayson_scripts", alwayson_scripts)
    setattr(runner, "selectable_scripts", selectable_scripts)


def _ensure_source_runner_has_dynamic_prompts_script(runner: object, *, is_img2img: bool) -> dict[str, Any]:
    if _source_runner_has_requested_scripts(runner, {"dynamic prompts"}):
        return {"added": False, "reason": "already present"}

    from modules import scripts

    extension_roots = _source_dynamic_prompts_extension_roots()
    first_extension_root = next((root for root in extension_roots if root.is_dir()), None)
    adapter_result = _ensure_source_dynamic_prompts_adapter_script()
    for script_data in list(getattr(scripts, "scripts_data", []) or []):
        script = _source_script_from_class_data(script_data, is_img2img=is_img2img)
        if script is None:
            continue
        title = _source_script_title(script).strip()
        if not _source_script_matches_requested(title.lower(), "dynamic prompts"):
            continue
        try:
            visibility = script.show(script.is_img2img)
        except Exception as exc:
            return {
                "added": False,
                "adapter": adapter_result,
                "title": title,
                "error": f"{type(exc).__name__}: {exc}",
            }
        if visibility != scripts.AlwaysVisible:
            continue
        script.alwayson = True
        _append_source_script_to_runner(runner, script)
        return {
            "added": True,
            "adapter": adapter_result,
            "title": title,
            "path": str(getattr(script_data, "path", "") or ""),
        }
    script = _source_dynamic_prompts_adapter_script_instance(first_extension_root, is_img2img=is_img2img)
    _append_source_script_to_runner(runner, script)
    return {
        "added": True,
        "adapter": adapter_result,
        "title": _source_script_title(script).strip(),
        "path": str(getattr(script, "filename", "") or ""),
        "direct_instance": True,
    }


def _ensure_source_runner_has_tipo_script(runner: object, *, is_img2img: bool) -> dict[str, Any]:
    if _source_runner_has_requested_scripts(runner, {"tipo"}):
        return {"added": False, "reason": "already present"}

    from modules import scripts

    adapter_result = _ensure_source_tipo_script()
    for script_data in list(getattr(scripts, "scripts_data", []) or []):
        script = _source_script_from_class_data(script_data, is_img2img=is_img2img)
        if script is None or _source_script_title(script).strip().lower() != "tipo":
            continue
        try:
            visibility = script.show(script.is_img2img)
        except Exception as exc:
            return {
                "added": False,
                "adapter": adapter_result,
                "title": "TIPO",
                "error": f"{type(exc).__name__}: {exc}",
            }
        if visibility != scripts.AlwaysVisible:
            continue
        script.alwayson = True
        _append_source_script_to_runner(runner, script)
        return {
            "added": True,
            "adapter": adapter_result,
            "title": _source_script_title(script).strip(),
            "path": str(getattr(script_data, "path", "") or ""),
        }

    return {
        "added": False,
        "adapter": adapter_result,
        "missing": True,
    }


def _register_source_style_grid_adapter_script() -> dict[str, Any]:
    from modules import scripts

    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "forge_neo" / "style_grid.py"
    if _source_script_data_has_path(scripts, script_path):
        return {"loaded": False, "already_loaded": True, "path": str(script_path)}

    module_name = "_forge_neo_source_adapter_style_grid"
    module = types.ModuleType(module_name)

    class SourceStyleGridScript(scripts.Script):
        def title(self):
            return "Style Grid"

        def show(self, is_img2img):
            return scripts.AlwaysVisible

        def process(self, p, *args):
            from forge_neo.style_grid import apply_style_grid_to_processing

            apply_style_grid_to_processing(p, *args)

    SourceStyleGridScript.__module__ = module_name
    module.SourceStyleGridScript = SourceStyleGridScript
    sys.modules[module_name] = module
    scripts.scripts_data.append(
        scripts.ScriptClassData(
            SourceStyleGridScript,
            str(script_path),
            str(repo_root),
            module,
        )
    )
    return {"loaded": True, "registered": 1, "path": str(script_path), "adapter": True}


def _adapt_source_style_grid_script_module(module: types.ModuleType) -> bool:
    script_class = getattr(module, "StyleGridScript", None)
    if not isinstance(script_class, type):
        return False

    weighted_tag_re = re.compile(r"^\((.+?):\d+\.?\d*\)$")

    def map_lines(prompt: object, transform: Callable[[str], str]) -> str:
        parts = re.split(r"(\r\n|\r|\n)", str(prompt or ""))
        return "".join(part if index % 2 else transform(part) for index, part in enumerate(parts))

    def dedup_line(prompt: str) -> str:
        result: list[str] = []
        seen: set[str] = set()
        for part in prompt.split(","):
            item = part.strip()
            if not item:
                continue
            if item.upper() == "BREAK":
                result.append(item)
                continue
            match = weighted_tag_re.match(item)
            key = (match.group(1).strip() if match else item).lower()
            if key not in seen:
                seen.add(key)
                result.append(item)
        return ", ".join(result)

    def dedup_prompt(prompt: object) -> str:
        return map_lines(prompt, dedup_line)

    def append_unique(prompt: object, additions: list[str]) -> str:
        def append_to_line(line: str) -> str:
            current = [part.strip() for part in line.split(",") if part.strip()]
            seen = {part.lower() for part in current}
            result = list(current)
            for addition in additions:
                for token in addition.split(","):
                    item = token.strip()
                    if item and item.lower() not in seen:
                        seen.add(item.lower())
                        result.append(item)
            return ", ".join(result)

        return map_lines(prompt, append_to_line)

    def apply_template(prompt: object, template: str) -> str:
        return map_lines(prompt, lambda line: template.replace("{prompt}", line))

    def process(self, p, *args):
        all_styles = list(module.get_cached_styles())
        module.categorize_styles(all_styles)
        active_source = str((args[1] if len(args) >= 2 else "") or "")
        wildcard_pool = [
            style for style in all_styles if not active_source or str(style.get("source_file") or "") == active_source
        ]
        if not wildcard_pool:
            wildcard_pool = all_styles
        styles_by_category: dict[str, list[dict[str, Any]]] = {}
        for style in wildcard_pool:
            key = str(style.get("category") or "").lower()
            styles_by_category.setdefault(key, []).append(style)

        p.all_prompts = [
            dedup_prompt(module.resolve_sg_wildcards(prompt, styles_by_category)) for prompt in p.all_prompts
        ]
        p.all_negative_prompts = [
            dedup_prompt(module.resolve_sg_wildcards(prompt, styles_by_category)) for prompt in p.all_negative_prompts
        ]

        silent_json = args[0] if args else "[]"
        try:
            style_names = json.loads(silent_json) if silent_json else []
        except Exception:
            style_names = []
        if not isinstance(style_names, list) or not style_names:
            return

        style_map = {str(style.get("name") or ""): style for style in all_styles}
        positive_additions: list[str] = []
        negative_additions: list[str] = []
        for name in style_names:
            style = style_map.get(str(name))
            if not style:
                continue
            positive = str(style.get("prompt") or "")
            negative = str(style.get("negative_prompt") or "")
            if "{prompt}" in positive:
                p.all_prompts = [apply_template(prompt, positive) for prompt in p.all_prompts]
            elif positive:
                positive_additions.append(positive)
            if "{prompt}" in negative:
                p.all_negative_prompts = [apply_template(prompt, negative) for prompt in p.all_negative_prompts]
            elif negative:
                negative_additions.append(negative)
        if positive_additions:
            p.all_prompts = [append_unique(prompt, positive_additions) for prompt in p.all_prompts]
        if negative_additions:
            p.all_negative_prompts = [append_unique(prompt, negative_additions) for prompt in p.all_negative_prompts]

        p.extra_generation_params["Style Grid"] = ", ".join(str(name) for name in style_names)
        module.increment_usage(style_names)

    script_class.process = process
    return True


def _ensure_source_style_grid_script() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    for extension_root in _source_style_grid_extension_roots():
        script_path = extension_root / "scripts" / "style_grid.py"
        searched.append(str(script_path))
        if not script_path.is_file():
            continue
        if _source_script_data_has_path(scripts, script_path):
            return {"loaded": False, "already_loaded": True, "path": str(script_path)}
        module_name = "_forge_neo_source_adapter_style_grid_source"
        try:
            module = _import_source_file(module_name, script_path)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            sys.modules.pop(module_name, None)
            continue
        adapted = _adapt_source_style_grid_script_module(module)
        registered = _register_source_script_classes(module, script_path, extension_root)
        if registered:
            _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(_source_path_key(script_path))
            return {"loaded": True, "registered": registered, "path": str(script_path), "adapter": adapted}

    fallback = _register_source_style_grid_adapter_script()
    fallback["searched"] = searched
    fallback["errors"] = errors
    return fallback


def _ensure_source_regional_prompter_scripts() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    script_names = ("rp.py", "rps.py")
    for extension_root in _source_regional_prompter_extension_roots():
        rp_path = extension_root / "scripts" / "rp.py"
        searched.append(str(rp_path))
        if not rp_path.is_file():
            continue

        loaded_paths: list[str] = []
        already_loaded_paths: list[str] = []
        registered_total = 0
        for index, script_name in enumerate(script_names):
            script_path = extension_root / "scripts" / script_name
            if not script_path.is_file():
                errors.append(f"missing: {script_path}")
                continue
            if _source_script_data_has_path(scripts, script_path):
                already_loaded_paths.append(str(script_path))
                continue
            module_name = f"_forge_neo_source_adapter_regional_prompter_{index}"
            try:
                module = _import_source_file(module_name, script_path)
            except Exception as exc:
                errors.append(f"{script_name}: {type(exc).__name__}: {exc}")
                sys.modules.pop(module_name, None)
                continue
            registered = _register_source_script_classes(module, script_path, extension_root)
            registered_total += registered
            loaded_paths.append(str(script_path))
            _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(_source_path_key(script_path))

        return {
            "loaded": registered_total > 0,
            "registered": registered_total,
            "paths": loaded_paths,
            "already_loaded_paths": already_loaded_paths,
            "extension_root": str(extension_root),
            "errors": errors,
        }

    return {
        "loaded": False,
        "missing": True,
        "searched": searched,
        "errors": errors,
    }


def _patch_source_forge_couple_class(module: types.ModuleType) -> bool:
    script_class = getattr(module, "ForgeCouple", None)
    if script_class is None or bool(getattr(script_class, "_forge_neo_source_patched", False)):
        return False

    original_setup = script_class.setup
    calculate_tiles = getattr(original_setup, "__globals__", {}).get("calculate_tiles")
    if callable(calculate_tiles):
        try:
            from PIL import Image

            calculate_tiles.__globals__.setdefault("Image", Image)
        except Exception:
            pass

    def mask_mapping(value: object) -> list[dict[str, object]]:
        from PIL import Image

        normalized: list[dict[str, object]] = []
        for item in list(value or []):
            if not isinstance(item, dict):
                continue
            mask = item.get("mask")
            if isinstance(mask, Image.Image):
                image = mask.convert("L")
            else:
                try:
                    image = _decode_source_image(mask).convert("L")
                except Exception:
                    continue
            try:
                weight = float(item.get("weight", 1.0) or 1.0)
            except (TypeError, ValueError):
                weight = 1.0
            normalized.append({"mask": image, "weight": weight})
        return normalized

    def setup(self, p, *args, **kwargs):
        mode = str(args[2] if len(args) > 2 else "")
        mapping = args[7] if len(args) > 7 else None
        self._forge_neo_mask_mapping = mask_mapping(mapping) if mode == "Mask" else None
        return original_setup(self, p, *args, **kwargs)

    def get_mask(self):
        return getattr(self, "_forge_neo_mask_mapping", None)

    script_class.setup = setup
    script_class.get_mask = get_mask
    script_class._forge_neo_source_patched = True
    return True


def _ensure_source_forge_couple_opts(shared_module: object | None = None) -> None:
    try:
        if shared_module is None:
            from modules import shared as shared_module
        from forge_neo.forge_couple_compat import FORGE_COUPLE_SETTING_DEFAULTS

        opts = getattr(shared_module, "opts", None)
        if opts is None:
            return
        data_labels = getattr(opts, "data_labels", None)
        add_option = getattr(opts, "add_option", None)
        option_info = getattr(shared_module, "OptionInfo", None)
        if isinstance(data_labels, dict) and callable(add_option) and callable(option_info):
            for key, value in FORGE_COUPLE_SETTING_DEFAULTS.items():
                if key not in data_labels:
                    add_option(
                        key,
                        option_info(value, key, section=("forge_couple", "Forge Couple")),
                    )

        data = getattr(opts, "data", None)
        for key, value in FORGE_COUPLE_SETTING_DEFAULTS.items():
            if data is not None and hasattr(data, "setdefault"):
                data.setdefault(key, value)
    except Exception:
        pass


def _apply_source_forge_couple_settings(payload: dict[str, Any], shared_module: object | None = None) -> dict[str, bool]:
    from forge_neo.forge_couple_compat import FORGE_COUPLE_SETTING_DEFAULTS

    if shared_module is None:
        from modules import shared as shared_module

    settings = payload.get("override_settings") if isinstance(payload.get("override_settings"), dict) else {}
    opts = getattr(shared_module, "opts", None)
    if opts is None:
        return {}
    _ensure_source_forge_couple_opts(shared_module)
    data = getattr(opts, "data", None)
    data_labels = getattr(opts, "data_labels", None)
    applied: dict[str, bool] = {}
    for key, default in FORGE_COUPLE_SETTING_DEFAULTS.items():
        if key not in settings:
            continue
        raw = settings.get(key)
        if isinstance(raw, str):
            value = raw.strip().casefold() not in _SOURCE_BACKEND_DISABLED_VALUES
        else:
            value = bool(default if raw is None else raw)
        if data is not None and hasattr(data, "__setitem__"):
            data[key] = value
        if not isinstance(data_labels, dict) or key in data_labels:
            setattr(opts, key, value)
        applied[key] = value
    return applied


def _ensure_source_forge_couple_script() -> dict[str, Any]:
    from modules import scripts

    searched: list[str] = []
    errors: list[str] = []
    for extension_root in _source_forge_couple_extension_roots():
        script_path = extension_root / "scripts" / "forge_couple.py"
        searched.append(str(script_path))
        if not script_path.is_file():
            continue
        if _source_script_data_has_path(scripts, script_path):
            target = _source_path_key(script_path)
            patched = False
            for script_data in list(getattr(scripts, "scripts_data", []) or []):
                if _source_path_key(str(getattr(script_data, "path", "") or "")) != target:
                    continue
                module = getattr(script_data, "module", None)
                if module is not None:
                    patched = _patch_source_forge_couple_class(module) or patched
            _ensure_source_forge_couple_opts()
            return {
                "loaded": False,
                "already_loaded": True,
                "path": str(script_path),
                "mask_mapping_patch": patched,
            }

        module_name = "_forge_neo_source_adapter_forge_couple"
        try:
            _ensure_source_forge_couple_opts()
            module = _import_source_file(module_name, script_path)
            patched = _patch_source_forge_couple_class(module)
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
            sys.modules.pop(module_name, None)
            continue
        registered = _register_source_script_classes(module, script_path, extension_root)
        if registered:
            _SOURCE_ADAPTER_SCRIPT_IMPORTS.add(_source_path_key(script_path))
            return {
                "loaded": True,
                "registered": registered,
                "path": str(script_path),
                "extension_root": str(extension_root),
                "mask_mapping_patch": patched,
                "errors": errors,
            }

    return {
        "loaded": False,
        "missing": True,
        "searched": searched,
        "errors": errors,
    }


def _ensure_controlnet_preprocessors(source_root: Path) -> tuple[int, list[str]]:
    global _CONTROLNET_PREPROCESSORS_IMPORTED, _CONTROLNET_PREPROCESSOR_IMPORT_ERRORS
    if _CONTROLNET_PREPROCESSORS_IMPORTED:
        from modules_forge.shared import supported_preprocessors

        return len(supported_preprocessors), list(_CONTROLNET_PREPROCESSOR_IMPORT_ERRORS)

    started = _stage_started(0.06, "Source ControlNet preprocessors import", "源后端 ControlNet 预处理器导入")
    errors: list[str] = []
    import modules_forge.supported_preprocessor  # noqa: F401

    controlnet_root = source_root / "extensions-builtin" / "sd_forge_controlnet"
    if str(controlnet_root) not in sys.path:
        sys.path.insert(0, str(controlnet_root))

    script_paths = [
        source_root / "extensions-builtin" / "forge_legacy_preprocessors" / "scripts" / "legacy_preprocessors.py",
        source_root / "extensions-builtin" / "forge_preprocessor_tile" / "scripts" / "preprocessor_tile.py",
        source_root / "extensions-builtin" / "forge_preprocessor_reference" / "scripts" / "forge_reference.py",
        source_root / "extensions-builtin" / "forge_preprocessor_inpaint" / "scripts" / "preprocessor_inpaint.py",
        source_root / "extensions-builtin" / "sd_forge_ipadapter" / "scripts" / "forge_ipadapter.py",
    ]
    for index, path in enumerate(script_paths):
        if not path.is_file():
            continue
        try:
            _import_source_file(_source_file_module_name(index, path), path)
        except Exception as exc:
            errors.append(f"{path.parent.parent.name}: {type(exc).__name__}: {exc}")

    from modules_forge.shared import supported_preprocessors

    _CONTROLNET_PREPROCESSORS_IMPORTED = True
    _CONTROLNET_PREPROCESSOR_IMPORT_ERRORS = errors
    _stage_finished(
        0.075,
        "Source ControlNet preprocessors import",
        "源后端 ControlNet 预处理器导入",
        started,
        source_preprocessor_count=len(supported_preprocessors),
        failed_imports=errors,
    )
    return len(supported_preprocessors), list(errors)


def _decode_controlnet_input_image(value: object):
    from PIL import Image

    text = str(value or "").strip()
    if not text:
        raise ValueError("Invalid encoded image")
    if text.startswith("data:image/") and "," in text:
        text = text.split(",", 1)[1]
    raw = base64.b64decode(text, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _encode_controlnet_result_image(value: object) -> str:
    from PIL import Image
    import numpy as np

    if isinstance(value, str):
        return value
    if isinstance(value, np.ndarray):
        value = Image.fromarray(value)
    if isinstance(value, Image.Image):
        buffer = io.BytesIO()
        value.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("ascii")
    return "Detect result is not image"


_SOURCE_BASIC_UPSCALERS = {"", "none", "nearest", "bilinear", "bicubic", "lanczos"}


def _decode_source_image(value: object):
    from PIL import Image

    text = str(value or "").strip()
    if not text:
        raise ValueError("Invalid encoded image")
    if text.startswith("data:image/") and "," in text:
        text = text.split(",", 1)[1]
    raw = base64.b64decode(text, validate=False)
    return Image.open(io.BytesIO(raw)).convert("RGB")


def _source_resample_filter(name: str):
    from PIL import Image

    key = str(name or "").casefold()
    if "nearest" in key:
        return Image.Resampling.NEAREST
    if "bilinear" in key:
        return Image.Resampling.BILINEAR
    if "bicubic" in key:
        return Image.Resampling.BICUBIC
    return Image.Resampling.LANCZOS


def _source_upscale_target(image, payload: dict[str, Any]) -> tuple[int, int]:
    if str(payload.get("resize_mode") or "Scale by") == "Scale to":
        return (
            max(1, _as_int(payload.get("resize_width"), image.width)),
            max(1, _as_int(payload.get("resize_height"), image.height)),
        )
    scale = max(0.05, _as_float(payload.get("resize_scale"), 1.0))
    target_width = max(1, round(image.width * scale))
    target_height = max(1, round(image.height * scale))
    max_side_length = max(0, _as_int(payload.get("max_side_length"), 0))
    if max_side_length > 0 and max(target_width, target_height) > max_side_length:
        ratio = max_side_length / max(target_width, target_height)
        target_width = max(1, round(target_width * ratio))
        target_height = max(1, round(target_height * ratio))
    return target_width, target_height


def _source_basic_upscale(image, payload: dict[str, Any], upscaler_name: str):
    source = image.convert("RGBA")
    target_width, target_height = _source_upscale_target(source, payload)
    if str(payload.get("resize_mode") or "Scale by") == "Scale to" and bool(payload.get("crop_to_fit", True)):
        ratio = max(target_width / source.width, target_height / source.height)
        intermediate = source.resize(
            (max(1, round(source.width * ratio)), max(1, round(source.height * ratio))),
            _source_resample_filter(upscaler_name),
        )
        left = max(0, (intermediate.width - target_width) // 2)
        top = max(0, (intermediate.height - target_height) // 2)
        return intermediate.crop((left, top, left + target_width, top + target_height)).convert("RGB")
    return source.resize((target_width, target_height), _source_resample_filter(upscaler_name)).convert("RGB")


def _limit_size_by_one_dimension(width: float, height: float, limit: int) -> tuple[int, int]:
    if limit <= 0:
        return int(width), int(height)
    if height > width and height > limit:
        width = limit * width // height
        height = limit
    elif width > limit:
        height = limit * height // width
        width = limit
    return int(width), int(height)


def _source_model_upscale_args(image, payload: dict[str, Any]) -> tuple[int, float, int, int, bool]:
    resize_mode = str(payload.get("resize_mode") or "Scale by")
    resize_width = max(1, _as_int(payload.get("resize_width"), image.width))
    resize_height = max(1, _as_int(payload.get("resize_height"), image.height))
    crop_to_fit = bool(payload.get("crop_to_fit", True))
    if resize_mode == "Scale to":
        upscale_by = max(resize_width / image.width, resize_height / image.height)
        return 1, max(0.05, upscale_by), resize_width, resize_height, crop_to_fit

    upscale_by = max(0.05, _as_float(payload.get("resize_scale"), 1.0))
    max_side_length = max(0, _as_int(payload.get("max_side_length"), 0))
    if max_side_length and max(*image.size) * upscale_by > max_side_length:
        resize_width, resize_height = _limit_size_by_one_dimension(image.width * upscale_by, image.height * upscale_by, max_side_length)
        upscale_by = max(resize_width / image.width, resize_height / image.height)
        return 1, max(0.05, upscale_by), resize_width, resize_height, False
    return 0, upscale_by, resize_width, resize_height, False


def _source_refresh_upscalers() -> list:
    from modules import modelloader, shared

    modelloader.load_upscalers()
    return list(getattr(shared, "sd_upscalers", []) or [])


def _source_named_upscaler(name: str):
    selected = str(name or "").strip()
    if not selected or selected.casefold() == "none":
        return None
    scalers = _source_refresh_upscalers()
    for scaler in scalers:
        if str(getattr(scaler, "name", "") or "") == selected:
            return scaler
    selected_key = selected.casefold()
    for scaler in scalers:
        if str(getattr(scaler, "name", "") or "").casefold() == selected_key:
            return scaler
    available = ", ".join(str(getattr(scaler, "name", "") or "") for scaler in scalers)
    raise ValueError(f"could not find upscaler named {selected!r}; available: {available}")


def _source_model_upscale(image, payload: dict[str, Any], upscaler_name: str):
    from PIL import Image

    upscaler = _source_named_upscaler(upscaler_name)
    if upscaler is None:
        return _source_basic_upscale(image, payload, upscaler_name)
    upscale_mode, upscale_by, resize_width, resize_height, crop_to_fit = _source_model_upscale_args(image, payload)
    output = upscaler.scaler.upscale(image.convert("RGB"), upscale_by, upscaler.data_path)
    if upscale_mode == 1 and crop_to_fit:
        cropped = Image.new("RGB", (resize_width, resize_height))
        cropped.paste(output, box=(resize_width // 2 - output.width // 2, resize_height // 2 - output.height // 2))
        output = cropped
    return output.convert("RGB")


def _source_upscale_one(image, payload: dict[str, Any], upscaler_name: str):
    name = str(upscaler_name or "").strip()
    if name.casefold() in _SOURCE_BASIC_UPSCALERS:
        return _source_basic_upscale(image, payload, name)
    return _source_model_upscale(image, payload, name)


def _run_upscale(payload: dict[str, Any], data_root: Path) -> dict[str, Any]:
    from PIL import Image

    started = time.monotonic()
    _get_source_context(data_root)
    control_path = _payload_control_path(payload)
    control_action = _source_control_action(control_path)
    if control_action:
        return {"ok": False, "error": f"Source backend upscaler was {control_action}.", "status": control_action}

    image = _decode_source_image(payload.get("image"))
    upscaler_1 = str(payload.get("upscaler_1") or "None")
    upscaler_2 = str(payload.get("upscaler_2") or "None")
    upscaler_2_visibility = max(0.0, min(1.0, _as_float(payload.get("upscaler_2_visibility"), 0.0)))

    _emit_event(_stage_event(0.2, f"Source upscaler loading {upscaler_1}", f"源后端放大器加载 {upscaler_1}"))
    output = _source_upscale_one(image, payload, upscaler_1)
    if upscaler_2_visibility > 0 and upscaler_2.strip().casefold() != "none":
        control_action = _source_control_action(control_path)
        if control_action:
            return {"ok": False, "error": f"Source backend upscaler was {control_action}.", "status": control_action}
        _emit_event(_stage_event(0.62, f"Source upscaler loading {upscaler_2}", f"源后端放大器加载 {upscaler_2}"))
        second = _source_upscale_one(image, payload, upscaler_2)
        if second.mode != output.mode:
            second = second.convert(output.mode)
        if second.size != output.size:
            second = second.resize(output.size, _source_resample_filter("Lanczos"))
        output = Image.blend(output, second, upscaler_2_visibility)

    if bool(payload.get("color_correction", False)):
        try:
            from modules.processing import apply_color_correction, setup_color_correction

            output = apply_color_correction(setup_color_correction(image), output)
        except Exception as exc:
            _emit_event(_stage_event(0.88, f"Source upscaler color correction skipped: {type(exc).__name__}: {exc}", f"源后端颜色校正已跳过：{type(exc).__name__}: {exc}"))

    try:
        from modules import devices

        devices.torch_gc()
    except Exception:
        pass
    _emit_event(_stage_event(1.0, "Source upscaler finished", "源后端放大器完成"))
    return {
        "ok": True,
        "images": [_to_text_image(output)],
        "info": f"Source upscaler: {upscaler_1}, upscaler 2: {upscaler_2}, visibility: {upscaler_2_visibility}",
        "parameters": {
            "upscaler_1": upscaler_1,
            "upscaler_2": upscaler_2,
            "upscaler_2_visibility": upscaler_2_visibility,
            "size": [output.width, output.height],
        },
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def _run_controlnet_detect(payload: dict[str, Any], data_root: Path, source_root: Path) -> dict[str, Any]:
    import numpy as np

    started = time.monotonic()
    images = payload.get("controlnet_input_images") or payload.get("images") or []
    if not isinstance(images, list):
        images = [images]
    if not images:
        return {"ok": False, "status_code": 422, "error": "No image selected"}

    module_name = str(payload.get("controlnet_module") or payload.get("module") or "None")
    if module_name.strip().lower() == "none":
        module_name = "None"
    processor_res = _as_int(payload.get("controlnet_processor_res") or payload.get("processor_res"), 512)
    threshold_a = _as_float(payload.get("controlnet_threshold_a") or payload.get("threshold_a"), 64.0)
    threshold_b = _as_float(payload.get("controlnet_threshold_b") or payload.get("threshold_b"), 64.0)

    _get_source_context(data_root)
    preprocessor_count, import_errors = _ensure_controlnet_preprocessors(source_root)
    from lib_controlnet.global_state import get_preprocessor

    try:
        processor_module = get_preprocessor(module_name)
    except Exception:
        processor_module = None
    if processor_module is None:
        return {
            "ok": False,
            "status_code": 422,
            "error": "Module not available",
            "source_preprocessor_count": preprocessor_count,
            "source_preprocessor_import_errors": import_errors,
        }

    results = []
    poses = []
    for input_image in images:
        img = np.array(_decode_controlnet_input_image(input_image)).astype("uint8")

        class JsonAcceptor:
            def __init__(self) -> None:
                self.value = None

            def accept(self, json_dict: dict) -> None:
                self.value = json_dict

        json_acceptor = JsonAcceptor()
        results.append(
            processor_module(
                img,
                resolution=processor_res,
                slider_1=threshold_a,
                slider_2=threshold_b,
                json_pose_callback=json_acceptor.accept,
            )
        )
        if "openpose" in module_name:
            if json_acceptor.value is not None:
                poses.append(json_acceptor.value)

    output = {
        "ok": True,
        "images": [_encode_controlnet_result_image(image) for image in results],
        "info": "Success",
        "source_preprocessor_count": preprocessor_count,
        "source_preprocessor_import_errors": import_errors,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }
    if poses:
        output["poses"] = poses
    return output


def _refresh_requested_module_paths(payload: dict[str, Any], data_root: Path, main_entry: object) -> list[str]:
    settings = payload.get("override_settings") if isinstance(payload.get("override_settings"), dict) else {}
    values = list(settings.get("forge_additional_modules") or []) if isinstance(settings, dict) else []
    resolved: list[str] = []
    module_list = getattr(main_entry, "module_list", {})
    for value in values:
        filename = Path(str(value or "")).name
        if not filename:
            continue
        candidates = (
            data_root / "models" / "text_encoder" / filename,
            data_root / "models" / "vae" / filename,
            data_root / "models" / "VAE" / filename,
        )
        for candidate in candidates:
            if candidate.is_file():
                module_list[filename] = str(candidate)
                resolved.append(str(candidate))
                break
    return resolved


def _apply_source_model_settings(payload: dict[str, Any], main_entry: object) -> dict[str, Any]:
    from modules import sd_models, shared

    settings = payload.get("override_settings") if isinstance(payload.get("override_settings"), dict) else {}
    if len(sd_models.checkpoints_list) == 0:
        sd_models.list_models()

    preset = str(settings.get("forge_preset") or getattr(shared.opts, "forge_preset", "") or "").strip()
    preset_arg = preset or None
    checkpoint = str(settings.get("sd_model_checkpoint") or getattr(shared.opts, "sd_model_checkpoint", "") or "").strip()
    additional_modules = list(settings.get("forge_additional_modules") or []) if "forge_additional_modules" in settings else None
    dtype = str(settings.get("forge_unet_storage_dtype") or "").strip()

    loading_parameters_before = getattr(sd_models.model_data, "forge_loading_parameters", {}) or {}
    loading_parameters_empty = not bool(loading_parameters_before)
    checkpoint_changed = False
    modules_changed = False
    dtype_changed = False
    if checkpoint:
        checkpoint_changed = bool(main_entry.checkpoint_change(checkpoint, preset_arg, save=False, refresh=False))
    if additional_modules is not None:
        modules_changed = bool(main_entry.modules_change(additional_modules, preset_arg, save=False, refresh=False))
    if dtype and dtype != str(getattr(shared.opts, "forge_unet_storage_dtype", "") or ""):
        dtype_changed = bool(main_entry.dtype_change(dtype, preset_arg, save=False, refresh=False))

    loading_parameters_refreshed = bool(loading_parameters_empty or checkpoint_changed or modules_changed or dtype_changed)
    if loading_parameters_refreshed:
        main_entry.refresh_model_loading_parameters(refresh=True)
    loading_parameters = getattr(sd_models.model_data, "forge_loading_parameters", {}) or {}
    checkpoint_info = loading_parameters.get("checkpoint_info") if isinstance(loading_parameters, dict) else None
    loaded_checkpoint = str(getattr(checkpoint_info, "name", "") or getattr(checkpoint_info, "title", "") or "")
    loaded_modules = list(loading_parameters.get("additional_modules") or []) if isinstance(loading_parameters, dict) else []
    result = {
        "checkpoint_count": len(sd_models.checkpoints_list),
        "requested_checkpoint": checkpoint,
        "loaded_checkpoint": loaded_checkpoint,
        "preset": preset,
        "module_count": len(loaded_modules),
        "checkpoint_changed": checkpoint_changed,
        "modules_changed": modules_changed,
        "dtype_changed": dtype_changed,
        "loading_parameters_refreshed": loading_parameters_refreshed,
    }
    _emit_event(
        _stage_event(
            0.19,
            f"Source model settings applied: {loaded_checkpoint or 'none'}",
            f"源后端模型参数已应用：{loaded_checkpoint or 'none'}",
            **result,
        )
    )
    return result


def _payload_uses_source_scripts(payload: dict[str, Any]) -> bool:
    alwayson_scripts = payload.get("alwayson_scripts")
    if isinstance(alwayson_scripts, dict) and bool(alwayson_scripts):
        return True
    script_name = str(payload.get("script_name") or "").strip()
    if script_name and script_name != "None":
        return True
    script_args = payload.get("script_args")
    return bool(script_args)


def _requested_source_script_names(payload: dict[str, Any]) -> set[str]:
    names: set[str] = set()
    alwayson_scripts = payload.get("alwayson_scripts")
    if isinstance(alwayson_scripts, dict):
        for name in alwayson_scripts:
            text = str(name or "").strip().lower()
            if text:
                names.add(text)
                if text.startswith("dynamic prompts"):
                    names.add("dynamic prompts")
    script_name = str(payload.get("script_name") or "").strip()
    if script_name and script_name != "None":
        names.add(script_name.lower())
        if script_name.lower().startswith("dynamic prompts"):
            names.add("dynamic prompts")
    if "differential regional prompter" in names:
        names.add("regional prompter")
    return names


def _source_script_runner_ready(runner: object) -> bool:
    scripts = list(getattr(runner, "scripts", []) or [])
    if not scripts:
        return False
    for script in scripts:
        if getattr(script, "args_from", None) is None or getattr(script, "args_to", None) is None:
            return False
    return True


def _source_script_matches_requested(title: str, requested_name: str) -> bool:
    if requested_name == "dynamic prompts":
        try:
            from forge_neo.dynamic_prompts_compat import dynamic_prompts_script_name_matches

            return dynamic_prompts_script_name_matches(title)
        except Exception:
            return title.startswith("dynamic prompts")
    return title == requested_name


def _source_runner_has_requested_scripts(runner: object, requested_names: set[str]) -> bool:
    if not requested_names:
        return True
    titles = {_source_script_title(script).strip().lower() for script in list(getattr(runner, "scripts", []) or [])}
    return all(any(_source_script_matches_requested(title, requested_name) for title in titles) for requested_name in requested_names)


def _prepare_source_script_opts(requested_names: set[str]) -> dict[str, Any]:
    changes: dict[str, Any] = {}
    option_map = {
        "mahiro": "show_mahiro",
        "rescalecfg": "show_rescale_cfg",
    }
    for script_name, option_name in option_map.items():
        if script_name not in requested_names:
            continue
        try:
            from modules import shared

            current = bool(getattr(shared.opts, option_name, False))
            if not current:
                setattr(shared.opts, option_name, True)
                changes[option_name] = True
        except Exception as exc:
            changes[f"{option_name}_error"] = f"{type(exc).__name__}: {exc}"
    return changes


def _ensure_source_adapter_scripts(requested_names: set[str], runner: object) -> dict[str, Any]:
    adapter_scripts: dict[str, Any] = {}
    if "tipo" in requested_names and not _source_runner_has_requested_scripts(runner, {"tipo"}):
        adapter_scripts["tipo"] = _ensure_source_tipo_script()
    if "dynamic prompts" in requested_names and not _source_runner_has_requested_scripts(runner, {"dynamic prompts"}):
        adapter_scripts["dynamic_prompts"] = _ensure_source_dynamic_prompts_script()
    if "adetailer" in requested_names and not _source_runner_has_requested_scripts(runner, {"adetailer"}):
        adapter_scripts["adetailer"] = _ensure_source_adetailer_script()
    regional_names = {"regional prompter", "differential regional prompter"} & requested_names
    if regional_names and not _source_runner_has_requested_scripts(runner, regional_names):
        adapter_scripts["regional_prompter"] = _ensure_source_regional_prompter_scripts()
    if "forge couple" in requested_names and not _source_runner_has_requested_scripts(runner, {"forge couple"}):
        adapter_scripts["forge_couple"] = _ensure_source_forge_couple_script()
    if "style grid" in requested_names and not _source_runner_has_requested_scripts(runner, {"style grid"}):
        adapter_scripts["style_grid"] = _ensure_source_style_grid_script()
    return adapter_scripts


def _source_script_title(script: object) -> str:
    title = getattr(script, "title", None)
    if callable(title):
        try:
            return str(title() or getattr(script, "filename", "") or "")
        except Exception:
            pass
    return str(getattr(script, "name", None) or getattr(script, "filename", "") or "")


def _source_controlnet_default_unit() -> dict[str, Any]:
    return {
        "use_preview_as_input": False,
        "generated_image": None,
        "mask_image": None,
        "mask_image_fg": None,
        "hr_option": "Both",
        "enabled": False,
        "module": "None",
        "model": "None",
        "weight": 1,
        "image": None,
        "image_fg": None,
        "resize_mode": "Crop and Resize",
        "processor_res": -1,
        "threshold_a": -1,
        "threshold_b": -1,
        "guidance_start": 0,
        "guidance_end": 1,
        "pixel_perfect": False,
        "control_mode": "Balanced",
        "type_filter": "All",
        "save_detected_map": True,
        "_idx": -1,
    }


def _source_controlnet_model_key(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.casefold() == "none":
        return "None"
    filename = text.replace("\\", "/").rsplit("/", 1)[-1]
    suffix = Path(filename).suffix.lower()
    if suffix in _SOURCE_CONTROLNET_MODEL_EXTENSIONS:
        return Path(filename).stem
    return text


def _source_controlnet_type_filter(unit: dict[str, Any]) -> str:
    explicit = str(unit.get("type_filter") or unit.get("type") or unit.get("control_type") or "").strip()
    if explicit and explicit.casefold() not in {"all", "none", "default"}:
        return explicit
    probe = " ".join(
        str(unit.get(key) or "")
        for key in ("module", "model", "preprocessor", "controlnet_module", "controlnet_model")
    ).casefold()
    if "openpose" in probe or "dwpose" in probe:
        return "OpenPose"
    if "depth" in probe:
        return "Depth"
    if "canny" in probe or "lineart" in probe or "mlsd" in probe:
        return "Canny"
    if "scribble" in probe or "softedge" in probe or "sketch" in probe:
        return "Scribble/SoftEdge/Sketch"
    if "normal" in probe:
        return "NormalMap"
    if "seg" in probe:
        return "Segmentation"
    if "tile" in probe:
        return "Tile"
    if "inpaint" in probe:
        return "Inpaint"
    return explicit or "All"


def _normalize_source_controlnet_payload(payload: dict[str, Any]) -> dict[str, Any]:
    alwayson_scripts = payload.get("alwayson_scripts")
    if not isinstance(alwayson_scripts, dict):
        return {"normalized": 0, "models": []}
    controlnet = None
    for name, value in alwayson_scripts.items():
        if str(name or "").strip().lower() == "controlnet":
            controlnet = value
            break
    if not isinstance(controlnet, dict):
        return {"normalized": 0, "models": []}
    args = controlnet.get("args")
    if not isinstance(args, list):
        return {"normalized": 0, "models": []}
    changes: list[dict[str, str]] = []
    type_changes: list[dict[str, str]] = []
    for unit in args:
        if not isinstance(unit, dict):
            continue
        raw_model = str(unit.get("model") or "").strip()
        normalized_model = _source_controlnet_model_key(raw_model)
        if raw_model and normalized_model != raw_model:
            unit["model"] = normalized_model
            changes.append({"from": raw_model, "to": normalized_model})
        raw_type = str(unit.get("type_filter") or unit.get("type") or unit.get("control_type") or "All").strip() or "All"
        normalized_type = _source_controlnet_type_filter(unit)
        if normalized_type != raw_type:
            unit["type_filter"] = normalized_type
            type_changes.append({"from": raw_type, "to": normalized_type})
        else:
            unit["type_filter"] = normalized_type
    return {"normalized": len(changes) + len(type_changes), "models": changes, "type_filters": type_changes}


def _source_script_api_defaults(script: object) -> list[Any]:
    title = _source_script_title(script).strip().lower()
    if title == "tipo":
        try:
            from kgen import models
            from kgen.metainfo import TIPO_DEFAULT_FORMAT

            model_choices = [
                f"{model_name} | {file}"
                for model_name, ggufs in models.tipo_model_list
                for file in ggufs
            ] + [item[0] for item in models.tipo_model_list]
            model = model_choices[0] if model_choices else ""
            format_choices = list(TIPO_DEFAULT_FORMAT)
            format_name = format_choices[0] if format_choices else "custom"
            format_value = TIPO_DEFAULT_FORMAT.get(format_name, "")
        except Exception:
            model = ""
            format_name = "custom"
            format_value = ""
        return [
            False,
            "After applying other prompt processings",
            -1,
            False,
            "long",
            "long",
            "",
            format_name,
            format_value,
            0.5,
            0.95,
            80,
            model,
            False,
            False,
            "",
            "",
        ]
    if _source_script_matches_requested(title, "dynamic prompts"):
        from forge_neo.dynamic_prompts_compat import dynamic_prompts_arg_list

        return dynamic_prompts_arg_list()
    if title == "prompt matrix":
        return [False, False, "positive", "comma", 0]
    if title == "prompts from file or textbox":
        return [False, False, "start", ""]
    if title == "x/y/z plot":
        return [0, "", [], 0, "", [], 0, "", [], True, False, False, False, False, False, False, 0, 0, False]
    if title == "loopback":
        return [2, 0.5, "Linear"]
    if title == "sd upscale":
        return [64, 0, 2.0, False]
    if title == "controlnet":
        try:
            from modules import shared

            count = int(getattr(shared.opts, "data", {}).get("control_net_unit_count", 3) or 3)
        except Exception:
            count = 3
        count = max(1, min(count, 10))
        return [_source_controlnet_default_unit() for _ in range(count)]
    if title == "adetailer":
        try:
            from forge_neo.adetailer_compat import adetailer_default_args

            return [False, False, *[adetailer_default_args(ad_tab_enable=index == 0) for index in range(4)]]
        except Exception:
            return [
                False,
                False,
                *[
                    {"ad_model": "None", "ad_tab_enable": index == 0, "ad_denoising_strength": 0.5, "is_api": True}
                    for index in range(4)
                ],
            ]
    if title == "regional prompter":
        try:
            from forge_neo.regional_prompter_compat import regional_prompter_default_args

            return regional_prompter_default_args()
        except Exception:
            return [False, False, "Matrix", "Columns", "Mask", "Prompt", "1,1", "0.2", False, False, False, "Attention", [], "0", "0", "0.4", "", "0", "0", False]
    if title == "forge couple":
        try:
            from forge_neo.forge_couple_compat import forge_couple_default_args

            return forge_couple_default_args(is_img2img=bool(getattr(script, "is_img2img", False)))
        except Exception:
            return [False, True, "Basic", "", "Horizontal", "None", 0.5, [[0.0, 0.5, 0.0, 1.0, 1.0], [0.5, 1.0, 0.0, 1.0, 1.0]], "{ }", False, True, False, -1, -1, 0.1, "", False]
    if title == "differential regional prompter":
        return [[], 30, "", 4, [], 1, "", "", "", "", ""]
    if title == "style grid":
        return ["[]", ""]
    if title == "multidiffusion integrated":
        return [False, "Mixture of Diffusers", 768, 768, 64, 1]
    if title == "rescalecfg":
        return [0.0]
    if title == "never oom integrated":
        return [False, False]
    if title == "torch compile integrated":
        return ["Automatic"]
    if title == "spectrum integrated":
        return [False, 0.25, 6, 0.5, 2, 0.0, 6, 0.9]
    if title == "soft inpainting":
        return [False, 1.0, 0.5, 4.0, 0.0, 0.5, 2.0]
    if title == "多图拼接参考":
        return [False, [], 1024]
    if title == "调制引导控制":
        return [False, "None", "", "", 3.0, 0, -1]
    if title == "mahiro":
        return [False]
    return []


def _assign_source_script_api_ranges(runner: object) -> None:
    inputs = [None]
    title_map: dict[str, object] = {}
    selectable_titles: list[str] = []
    for script in list(getattr(runner, "scripts", []) or []):
        title = _source_script_title(script)
        name = title.strip().lower()
        if name:
            setattr(script, "name", name)
            title_map[name] = script
        setattr(script, "args_from", len(inputs))
        defaults = _source_script_api_defaults(script)
        controls = [types.SimpleNamespace(value=value) for value in defaults]
        setattr(script, "controls", controls)
        inputs.extend(controls)
        setattr(script, "args_to", len(inputs))
        if not bool(getattr(script, "alwayson", False)) and title:
            selectable_titles.append(title)
    setattr(runner, "inputs", inputs)
    setattr(runner, "title_map", title_map)
    setattr(runner, "titles", selectable_titles)


def _filter_source_runner_scripts(runner: object, requested_names: set[str]) -> None:
    if not requested_names:
        return

    def keep(script: object) -> bool:
        title = _source_script_title(script).strip().lower()
        return any(_source_script_matches_requested(title, requested_name) for requested_name in requested_names)

    scripts_list = [script for script in list(getattr(runner, "scripts", []) or []) if keep(script)]
    alwayson_scripts = [script for script in list(getattr(runner, "alwayson_scripts", []) or []) if keep(script)]
    selectable_scripts = [script for script in list(getattr(runner, "selectable_scripts", []) or []) if keep(script)]
    setattr(runner, "scripts", scripts_list)
    setattr(runner, "alwayson_scripts", alwayson_scripts)
    setattr(runner, "selectable_scripts", selectable_scripts)


def _default_source_script_args(runner: object) -> list[Any]:
    scripts = list(getattr(runner, "scripts", []) or [])
    last_arg_index = 1
    for script in scripts:
        args_to = getattr(script, "args_to", None)
        if isinstance(args_to, int) and args_to > last_arg_index:
            last_arg_index = args_to
    script_args: list[Any] = [None] * last_arg_index
    script_args[0] = 0
    for script in scripts:
        args_from = getattr(script, "args_from", None)
        if not isinstance(args_from, int):
            continue
        controls = list(getattr(script, "controls", []) or [])
        for offset, control in enumerate(controls):
            index = args_from + offset
            if 0 <= index < len(script_args):
                script_args[index] = getattr(control, "value", None)
    return script_args


def _normalize_source_alwayson_script_names(payload: dict[str, Any], runner: object) -> dict[str, int]:
    alwayson_scripts = payload.get("alwayson_scripts")
    if not isinstance(alwayson_scripts, dict):
        return {"renamed": 0}
    dynamic_title = ""
    for script in list(getattr(runner, "scripts", []) or []):
        title = _source_script_title(script).strip()
        if _source_script_matches_requested(title.lower(), "dynamic prompts"):
            dynamic_title = title
            break
    if not dynamic_title:
        return {"renamed": 0}
    renamed = 0
    normalized: dict[str, Any] = {}
    dynamic_alias_seen = False
    for name, value in alwayson_scripts.items():
        text = str(name or "").strip()
        if text.casefold().startswith("dynamic prompts") and text != dynamic_title:
            normalized[dynamic_title] = value
            dynamic_alias_seen = True
            renamed += 1
        elif text == dynamic_title and dynamic_alias_seen:
            continue
        else:
            normalized[name] = value
    if renamed:
        payload["alwayson_scripts"] = normalized
    return {"renamed": renamed}


def _normalize_source_dynamic_prompts_selectable_script(payload: dict[str, Any]) -> dict[str, Any]:
    script_name = str(payload.get("script_name") or "").strip()
    if not script_name or script_name == "None" or not _source_script_matches_requested(script_name.lower(), "dynamic prompts"):
        return {"converted": False}

    alwayson_scripts = payload.get("alwayson_scripts")
    if not isinstance(alwayson_scripts, dict):
        alwayson_scripts = {}
    else:
        alwayson_scripts = dict(alwayson_scripts)

    has_dynamic_prompts = any(
        _source_script_matches_requested(str(name or "").strip().lower(), "dynamic prompts")
        for name in alwayson_scripts
    )
    if not has_dynamic_prompts:
        raw_args = payload.get("script_args")
        try:
            from forge_neo.dynamic_prompts_compat import DYNAMIC_PROMPTS_SCRIPT_BASE_NAME, dynamic_prompts_arg_list

            args = dynamic_prompts_arg_list(list(raw_args) if isinstance(raw_args, (list, tuple)) else [], enabled=True)
            alwayson_scripts[DYNAMIC_PROMPTS_SCRIPT_BASE_NAME] = {"args": args}
        except Exception:
            alwayson_scripts["Dynamic Prompts"] = {"args": list(raw_args) if isinstance(raw_args, (list, tuple)) else []}

    payload["alwayson_scripts"] = alwayson_scripts
    payload["script_name"] = None
    payload["script_args"] = []
    return {"converted": True, "added_alwayson": not has_dynamic_prompts}


def _ensure_source_api_dynamic_prompts_lookup(api: object) -> dict[str, Any]:
    if bool(getattr(api, "_forge_neo_dynamic_prompts_lookup", False)):
        return {"patched": False, "reason": "already patched"}

    original_get_script = getattr(api, "get_script", None)
    if not callable(original_get_script):
        return {"patched": False, "reason": "get_script unavailable"}

    def get_script(script_name: object, script_runner: object) -> object:
        try:
            return original_get_script(script_name, script_runner)
        except Exception:
            if not _source_script_matches_requested(str(script_name or "").strip().lower(), "dynamic prompts"):
                raise
            for script in list(getattr(script_runner, "scripts", []) or []):
                title = _source_script_title(script).strip().lower()
                if _source_script_matches_requested(title, "dynamic prompts"):
                    return script
            raise

    setattr(api, "get_script", get_script)
    setattr(api, "_forge_neo_dynamic_prompts_lookup", True)
    return {"patched": True}


def _ensure_source_api_script_name_aliases() -> dict[str, Any]:
    try:
        from modules.api import api as api_module
    except Exception as exc:
        return {"patched": False, "reason": f"{type(exc).__name__}: {exc}"}

    if bool(getattr(api_module, "_forge_neo_dynamic_prompts_aliases", False)):
        return {"patched": False, "reason": "already patched"}

    original_script_name_to_index = getattr(api_module, "script_name_to_index", None)
    if not callable(original_script_name_to_index):
        return {"patched": False, "reason": "script_name_to_index unavailable"}

    def script_name_to_index(name: object, scripts: object) -> int:
        try:
            return original_script_name_to_index(name, scripts)
        except Exception:
            if not _source_script_matches_requested(str(name or "").strip().lower(), "dynamic prompts"):
                raise
            for index, script in enumerate(list(scripts or [])):
                title = _source_script_title(script).strip().lower()
                if _source_script_matches_requested(title, "dynamic prompts"):
                    return index
            raise

    setattr(api_module, "script_name_to_index", script_name_to_index)
    setattr(api_module, "_forge_neo_dynamic_prompts_aliases", True)
    return {"patched": True}


class _SourcePasteComponent:
    def __init__(self, value: Any = None):
        self.value = value


def _source_paste_component(value: Any = None) -> object:
    return _SourcePasteComponent(value)


def _source_mask_mode_from_infotext(params: dict[str, Any]) -> int:
    text = str(params.get("Mask mode", "") or "").strip().lower()
    return 1 if text == "inpaint not masked" else 0


def _source_inpaint_full_res_from_infotext(params: dict[str, Any]) -> bool:
    return str(params.get("Inpaint area", "") or "").strip().lower() == "only masked"


def _source_inpainting_fill_from_infotext(params: dict[str, Any]) -> int:
    text = str(params.get("Masked content", "") or "").strip().lower()
    values = {
        "fill": 0,
        "original": 1,
        "latent noise": 2,
        "latent nothing": 3,
    }
    return values.get(text, 1)


def _source_enable_hr_from_infotext(params: dict[str, Any]) -> bool:
    return "Denoising strength" in params and (
        "Hires upscale" in params
        or "Hires upscaler" in params
        or "Hires resize-1" in params
    )


def _ensure_source_infotext_paste_fields() -> dict[str, int]:
    from modules import infotext_utils, sd_samplers
    from modules.infotext_utils import PasteField

    string_component = _source_paste_component("")
    number_component = _source_paste_component(0)
    float_component = _source_paste_component(0.0)
    bool_component = _source_paste_component(False)
    list_component = _source_paste_component([])

    common_fields = [
        PasteField(string_component, "Prompt", api="prompt"),
        PasteField(string_component, "Negative prompt", api="negative_prompt"),
        PasteField(number_component, "Steps", api="steps"),
        PasteField(string_component, sd_samplers.get_sampler_from_infotext, api="sampler_name"),
        PasteField(string_component, sd_samplers.get_scheduler_from_infotext, api="scheduler"),
        PasteField(float_component, "CFG scale", api="cfg_scale"),
        PasteField(float_component, "Distilled CFG Scale", api="distilled_cfg_scale"),
        PasteField(number_component, "Size-1", api="width"),
        PasteField(number_component, "Size-2", api="height"),
        PasteField(number_component, "Batch size", api="batch_size"),
        PasteField(number_component, "Seed", api="seed"),
        PasteField(number_component, "Variation seed", api="subseed"),
        PasteField(float_component, "Variation seed strength", api="subseed_strength"),
        PasteField(number_component, "Seed resize from-1", api="seed_resize_from_w"),
        PasteField(number_component, "Seed resize from-2", api="seed_resize_from_h"),
    ]
    txt2img_fields = [
        *common_fields,
        PasteField(float_component, "Denoising strength", api="denoising_strength"),
        PasteField(bool_component, _source_enable_hr_from_infotext, api="enable_hr"),
        PasteField(float_component, "Hires upscale", api="hr_scale"),
        PasteField(string_component, "Hires upscaler", api="hr_upscaler"),
        PasteField(number_component, "Hires steps", api="hr_second_pass_steps"),
        PasteField(number_component, "Hires resize-1", api="hr_resize_x"),
        PasteField(number_component, "Hires resize-2", api="hr_resize_y"),
        PasteField(string_component, "Hires checkpoint", api="hr_checkpoint_name"),
        PasteField(list_component, "Hires VAE/TE", api="hr_additional_modules"),
        PasteField(string_component, sd_samplers.get_hr_sampler_from_infotext, api="hr_sampler_name"),
        PasteField(string_component, sd_samplers.get_hr_scheduler_from_infotext, api="hr_scheduler"),
        PasteField(string_component, "Hires prompt", api="hr_prompt"),
        PasteField(string_component, "Hires negative prompt", api="hr_negative_prompt"),
        PasteField(float_component, "Hires CFG Scale", api="hr_cfg"),
        PasteField(float_component, "Hires Distilled CFG Scale", api="hr_distilled_cfg"),
    ]
    img2img_fields = [
        *common_fields,
        PasteField(float_component, "Image CFG scale", api="image_cfg_scale"),
        PasteField(float_component, "Denoising strength", api="denoising_strength"),
        PasteField(number_component, "Mask blur", api="mask_blur"),
        PasteField(number_component, _source_mask_mode_from_infotext, api="inpainting_mask_invert"),
        PasteField(number_component, _source_inpainting_fill_from_infotext, api="inpainting_fill"),
        PasteField(bool_component, _source_inpaint_full_res_from_infotext, api="inpaint_full_res"),
        PasteField(number_component, "Masked area padding", api="inpaint_full_res_padding"),
        PasteField(float_component, "Noise multiplier", api="initial_noise_multiplier"),
    ]
    infotext_utils.paste_fields["txt2img"] = {"init_img": None, "fields": txt2img_fields, "override_settings_component": None}
    infotext_utils.paste_fields["img2img"] = {"init_img": None, "fields": img2img_fields, "override_settings_component": None}
    infotext_utils.paste_fields["inpaint"] = {"init_img": None, "fields": img2img_fields, "override_settings_component": None}
    return {"txt2img": len(txt2img_fields), "img2img": len(img2img_fields)}


def _ensure_source_api_script_defaults(api: object, *, mode: str, payload: dict[str, Any]) -> dict[str, Any]:
    if not _payload_uses_source_scripts(payload):
        return {"initialized": False, "reason": "no source scripts requested"}

    from modules import scripts

    is_img2img = mode == "img2img"
    runner = scripts.scripts_img2img if is_img2img else scripts.scripts_txt2img
    dynamic_selectable = _normalize_source_dynamic_prompts_selectable_script(payload)
    requested_names = _requested_source_script_names(payload)
    script_opts = _prepare_source_script_opts(requested_names)
    adetailer_models = _ensure_source_adetailer_models(payload) if "adetailer" in requested_names else {}
    adapter_scripts = _ensure_source_adapter_scripts(requested_names, runner)
    initialized_ranges = False
    if not _source_script_runner_ready(runner) or not _source_runner_has_requested_scripts(runner, requested_names):
        runner.initialize_scripts(is_img2img=is_img2img)
        _filter_source_runner_scripts(runner, requested_names)
        _assign_source_script_api_ranges(runner)
        initialized_ranges = True
    if "tipo" in requested_names and not _source_runner_has_requested_scripts(runner, {"tipo"}):
        adapter_scripts["tipo_runner"] = _ensure_source_runner_has_tipo_script(runner, is_img2img=is_img2img)
        _filter_source_runner_scripts(runner, requested_names)
        _assign_source_script_api_ranges(runner)
        initialized_ranges = True
    if "dynamic prompts" in requested_names and not _source_runner_has_requested_scripts(runner, {"dynamic prompts"}):
        adapter_scripts["dynamic_prompts_adapter"] = _ensure_source_dynamic_prompts_adapter_script()
        runner.initialize_scripts(is_img2img=is_img2img)
        _filter_source_runner_scripts(runner, requested_names)
        _assign_source_script_api_ranges(runner)
        initialized_ranges = True
    if "dynamic prompts" in requested_names and not _source_runner_has_requested_scripts(runner, {"dynamic prompts"}):
        adapter_scripts["dynamic_prompts_runner"] = _ensure_source_runner_has_dynamic_prompts_script(runner, is_img2img=is_img2img)
        _filter_source_runner_scripts(runner, requested_names)
        _assign_source_script_api_ranges(runner)
        initialized_ranges = True

    normalized_script_names = _normalize_source_alwayson_script_names(payload, runner)
    default_args = _default_source_script_args(runner)
    if is_img2img:
        api.default_script_arg_img2img = default_args
    else:
        api.default_script_arg_txt2img = default_args
    dynamic_lookup = _ensure_source_api_dynamic_prompts_lookup(api) if "dynamic prompts" in requested_names else {"patched": False, "reason": "not requested"}

    return {
        "initialized": True,
        "mode": mode,
        "script_count": len(list(getattr(runner, "scripts", []) or [])),
        "alwayson_count": len(list(getattr(runner, "alwayson_scripts", []) or [])),
        "requested_scripts": sorted(requested_names),
        "default_arg_count": len(default_args),
        "initialized_ranges": initialized_ranges,
        "script_opts": script_opts,
        "adetailer_models": adetailer_models,
        "adapter_scripts": adapter_scripts,
        "normalized_script_names": normalized_script_names,
        "dynamic_prompts_lookup": dynamic_lookup,
        "dynamic_prompts_selectable": dynamic_selectable,
    }


def _get_source_context(data_root: Path) -> dict[str, Any]:
    global _SOURCE_CONTEXT
    if _SOURCE_CONTEXT is not None:
        return _SOURCE_CONTEXT

    stage_started = _stage_started(0.04, "Source initialize modules import", "源后端初始化模块导入")
    from modules import initialize
    from modules_forge.initialization import initialize_forge
    _stage_finished(0.045, "Source initialize modules import", "源后端初始化模块导入", stage_started)

    _emit_event(_stage_event(0.05, "Source backend initializing", "源后端初始化"))
    stage_started = _stage_started(0.055, "Source initialize.shush", "源后端 initialize.shush")
    initialize.shush()
    _stage_finished(0.06, "Source initialize.shush", "源后端 initialize.shush", stage_started)
    stage_started = _stage_started(0.065, "Source initialize_forge", "源后端 initialize_forge")
    initialize_forge()
    _stage_finished(0.075, "Source initialize_forge", "源后端 initialize_forge", stage_started)
    stage_started = _stage_started(0.08, "Source initialize.imports", "源后端 initialize.imports")
    initialize.imports()
    _stage_finished(0.09, "Source initialize.imports", "源后端 initialize.imports", stage_started)
    stage_started = _stage_started(0.095, "Source initialize.check_versions", "源后端 initialize.check_versions")
    initialize.check_versions()
    _stage_finished(0.105, "Source initialize.check_versions", "源后端 initialize.check_versions", stage_started)
    stage_started = _stage_started(0.11, "Source initialize.initialize", "源后端 initialize.initialize")
    _ensure_gradio_rangeslider_compat()
    initialize.initialize()
    _stage_finished(0.12, "Source initialize.initialize", "源后端 initialize.initialize", stage_started)
    source_extra_networks = _ensure_source_lora_extra_network_registered()
    _emit_event(
        _stage_event(
            0.122,
            "Source extra networks registered",
            "源后端 Extra Networks 已注册",
            source_extra_networks=source_extra_networks,
        )
    )
    _emit_event(_stage_event(0.123, "Source backend initialized", "源后端已初始化"))

    stage_started = _stage_started(0.125, "Source API context import", "源后端 API 上下文导入")
    from modules.api import models
    from modules.api.api import Api
    from modules.call_queue import queue_lock
    from modules_forge import main_entry
    _stage_finished(0.135, "Source API context import", "源后端 API 上下文导入", stage_started)

    _configure_live_preview()

    api = Api.__new__(Api)
    api.queue_lock = queue_lock
    api.default_script_arg_txt2img = [0]
    api.default_script_arg_img2img = [0]
    paste_field_counts = _ensure_source_infotext_paste_fields()
    script_name_aliases = _ensure_source_api_script_name_aliases()

    _SOURCE_CONTEXT = {
        "api": api,
        "models": models,
        "main_entry": main_entry,
        "paste_field_counts": paste_field_counts,
        "script_name_aliases": script_name_aliases,
        "source_extra_networks": source_extra_networks,
    }
    return _SOURCE_CONTEXT


def _run_tipo_prompt(payload: dict[str, Any], data_root: Path, source_root: Path) -> dict[str, Any]:
    started = time.monotonic()
    _get_source_context(data_root)
    adapter_result = _ensure_source_tipo_script()
    if adapter_result.get("missing"):
        return {
            "ok": False,
            "error": "TIPO extension script is not available.",
            "source_script_setup": adapter_result,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }

    from forge_neo.tipo_compat import tipo_arg_dict
    from modules import scripts

    script = None
    for script_data in list(getattr(scripts, "scripts_data", []) or []):
        candidate = _source_script_from_class_data(script_data, is_img2img=False)
        if candidate is not None and _source_script_title(candidate).strip().lower() == "tipo":
            script = candidate
            break
    if script is None:
        return {
            "ok": False,
            "error": "TIPO script could not be initialized.",
            "source_script_setup": adapter_result,
            "elapsed_seconds": round(time.monotonic() - started, 3),
        }

    values = tipo_arg_dict(payload)
    format_select = str(values.get("format_select") or "custom")
    if format_select != "custom":
        try:
            from kgen.metainfo import TIPO_DEFAULT_FORMAT

            values["format"] = TIPO_DEFAULT_FORMAT.get(format_select, values.get("format", ""))
        except Exception:
            pass
    seed = int(values.get("seed", -1) or -1)
    if seed == -1:
        seed = random.randrange(2**31 - 1)

    result = script._process(
        str(values.get("tag_prompt") or ""),
        str(values.get("nl_prompt") or ""),
        float(payload.get("aspect_ratio") or 1.0),
        seed,
        str(values.get("tag_length") or "long").replace(" ", "_"),
        str(values.get("nl_length") or "long").replace(" ", "_"),
        str(values.get("ban_tags") or ""),
        format_select,
        str(values.get("format") or ""),
        float(values.get("temperature", 0.5) or 0.5),
        float(values.get("top_p", 0.95) or 0.95),
        int(values.get("top_k", 80) or 80),
        str(values.get("model") or ""),
        bool(values.get("gguf_cpu", False)),
        bool(values.get("no_formatting", False)),
        str(values.get("tag_prompt") or ""),
    )
    _emit_event(_stage_event(1.0, "TIPO prompt generated", "TIPO 提示词已生成"))
    return {
        "ok": True,
        "info": str(result or ""),
        "prompt": str(result or ""),
        "source_script_setup": adapter_result,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def _run_txt2img(payload: dict[str, Any], data_root: Path) -> dict[str, Any]:
    started = time.monotonic()
    context = _get_source_context(data_root)
    api = context["api"]
    models = context["models"]
    main_entry = context["main_entry"]

    _configure_live_preview()
    stage_started = _stage_started(0.15, "Source refresh_models", "源后端 refresh_models")
    _checkpoints, modules = main_entry.refresh_models()
    _stage_finished(0.16, "Source refresh_models", "源后端 refresh_models", stage_started)
    stage_started = _stage_started(0.165, "Source additional modules resolve", "源后端附加模块解析")
    resolved_modules = _refresh_requested_module_paths(payload, data_root, main_entry)
    _stage_finished(
        0.17,
        "Source additional modules resolve",
        "源后端附加模块解析",
        stage_started,
        resolved_module_count=len(resolved_modules),
    )
    model_settings = _apply_source_model_settings(payload, main_entry)
    forge_couple_settings = _apply_source_forge_couple_settings(payload)

    payload = dict(payload)
    source_debug_initial_payload = _source_jsonable(payload)
    control_path = _payload_control_path(payload)
    payload.setdefault("send_images", True)
    payload.setdefault("save_images", False)
    payload.setdefault("alwayson_scripts", {})
    payload.setdefault("script_name", None)
    payload.setdefault("script_args", [])
    controlnet_normalization = _normalize_source_controlnet_payload(payload)
    script_setup = _ensure_source_api_script_defaults(api, mode="txt2img", payload=payload)
    lora_registry = _refresh_source_loras_for_payload(payload)
    if lora_registry.get("requested"):
        script_setup["source_lora_registry"] = lora_registry
    if _source_debug_should_record_dynamic_prompts(source_debug_initial_payload, script_setup):
        _write_source_dynamic_prompts_debug(
            {
                "timestamp": _source_child_timestamp(),
                "job_id": _CURRENT_JOB_ID,
                "mode": "txt2img",
                "initial_payload": source_debug_initial_payload,
                "normalized_payload": _source_jsonable(payload),
                "script_setup": _source_jsonable(script_setup),
            }
        )
    if controlnet_normalization.get("normalized"):
        script_setup["controlnet_model_normalization"] = controlnet_normalization
    adetailer_preview_capture = _SourceAdetailerPreviewCapture(_source_adetailer_preview_capture_enabled(payload))

    stop_event = threading.Event()
    task_id = str(payload.get("force_task_id") or "forge-neo-source-backend-txt2img")
    requested_steps = _as_int(payload.get("steps"), 1)
    requested_batches = _as_int(payload.get("n_iter"), 1)
    _reset_source_progress_state(task_id, requested_steps=requested_steps, requested_batches=requested_batches)
    progress_thread = None
    if _source_backend_progress_worker_enabled():
        progress_thread = threading.Thread(
            target=_progress_worker,
            args=(api, models, stop_event),
            kwargs={
                "requested_steps": requested_steps,
                "requested_batches": requested_batches,
                "task_id": task_id,
            },
            daemon=True,
        )
        progress_thread.start()
    watchdog_thread = threading.Thread(
        target=_request_watchdog_worker,
        args=(stop_event,),
        kwargs={"stage": "Source text2img request", "progress": 0.22, "control_path": control_path},
        daemon=True,
    )
    watchdog_thread.start()
    try:
        stage_started = _stage_started(0.2, "Source text2img request", "源后端 text2img 请求")
        with adetailer_preview_capture:
            response = api.text2imgapi(models.StableDiffusionTxt2ImgProcessingAPI(**payload))
        _stage_finished(0.99, "Source text2img request", "源后端 text2img 请求", stage_started)
    finally:
        stop_event.set()
        if progress_thread is not None:
            progress_thread.join(timeout=2.0)
        watchdog_thread.join(timeout=2.0)
    images = [_to_text_image(image) for image in list(getattr(response, "images", []) or [])]
    ok = bool(images) or not bool(payload.get("send_images", True))
    _emit_event(
        {
            "event": "finish",
            "progress": 1.0,
            "message": "Source backend finished",
            "message_en": "Source backend finished",
            "message_cn": "源后端完成",
        }
    )
    return {
        "ok": ok,
        "images": images,
        "info": str(getattr(response, "info", "") or ""),
        "parameters": getattr(response, "parameters", {}) or {},
        "source_module_choices": modules,
        "resolved_source_modules": resolved_modules,
        "source_model_settings": model_settings,
        "source_forge_couple_settings": forge_couple_settings,
        "source_script_setup": script_setup,
        "source_lora_registry": lora_registry,
        "source_extra_networks": context.get("source_extra_networks"),
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def _run_img2img(payload: dict[str, Any], data_root: Path) -> dict[str, Any]:
    started = time.monotonic()
    context = _get_source_context(data_root)
    api = context["api"]
    models = context["models"]
    main_entry = context["main_entry"]

    _configure_live_preview()
    stage_started = _stage_started(0.15, "Source refresh_models", "源后端 refresh_models")
    _checkpoints, modules = main_entry.refresh_models()
    _stage_finished(0.16, "Source refresh_models", "源后端 refresh_models", stage_started)
    stage_started = _stage_started(0.165, "Source additional modules resolve", "源后端附加模块解析")
    resolved_modules = _refresh_requested_module_paths(payload, data_root, main_entry)
    _stage_finished(
        0.17,
        "Source additional modules resolve",
        "源后端附加模块解析",
        stage_started,
        resolved_module_count=len(resolved_modules),
    )
    model_settings = _apply_source_model_settings(payload, main_entry)
    forge_couple_settings = _apply_source_forge_couple_settings(payload)

    payload = dict(payload)
    source_debug_initial_payload = _source_jsonable(payload)
    control_path = _payload_control_path(payload)
    payload.setdefault("send_images", True)
    payload.setdefault("save_images", False)
    payload.setdefault("alwayson_scripts", {})
    payload.setdefault("script_name", None)
    payload.setdefault("script_args", [])
    payload.setdefault("include_init_images", False)
    controlnet_normalization = _normalize_source_controlnet_payload(payload)
    script_setup = _ensure_source_api_script_defaults(api, mode="img2img", payload=payload)
    lora_registry = _refresh_source_loras_for_payload(payload)
    if lora_registry.get("requested"):
        script_setup["source_lora_registry"] = lora_registry
    if _source_debug_should_record_dynamic_prompts(source_debug_initial_payload, script_setup):
        _write_source_dynamic_prompts_debug(
            {
                "timestamp": _source_child_timestamp(),
                "job_id": _CURRENT_JOB_ID,
                "mode": "img2img",
                "initial_payload": source_debug_initial_payload,
                "normalized_payload": _source_jsonable(payload),
                "script_setup": _source_jsonable(script_setup),
            }
        )
    if controlnet_normalization.get("normalized"):
        script_setup["controlnet_model_normalization"] = controlnet_normalization
    adetailer_preview_capture = _SourceAdetailerPreviewCapture(_source_adetailer_preview_capture_enabled(payload))

    stop_event = threading.Event()
    task_id = str(payload.get("force_task_id") or "forge-neo-source-backend-img2img")
    requested_steps = _as_int(payload.get("steps"), 1)
    requested_batches = _as_int(payload.get("n_iter"), 1)
    _reset_source_progress_state(task_id, requested_steps=requested_steps, requested_batches=requested_batches)
    progress_thread = None
    if _source_backend_progress_worker_enabled():
        progress_thread = threading.Thread(
            target=_progress_worker,
            args=(api, models, stop_event),
            kwargs={
                "requested_steps": requested_steps,
                "requested_batches": requested_batches,
                "task_id": task_id,
            },
            daemon=True,
        )
        progress_thread.start()
    watchdog_thread = threading.Thread(
        target=_request_watchdog_worker,
        args=(stop_event,),
        kwargs={"stage": "Source img2img request", "progress": 0.22, "control_path": control_path},
        daemon=True,
    )
    watchdog_thread.start()
    try:
        stage_started = _stage_started(0.2, "Source img2img request", "源后端 img2img 请求")
        with adetailer_preview_capture:
            response = api.img2imgapi(models.StableDiffusionImg2ImgProcessingAPI(**payload))
        _stage_finished(0.99, "Source img2img request", "源后端 img2img 请求", stage_started)
    finally:
        stop_event.set()
        if progress_thread is not None:
            progress_thread.join(timeout=2.0)
        watchdog_thread.join(timeout=2.0)
    images = [_to_text_image(image) for image in list(getattr(response, "images", []) or [])]
    ok = bool(images) or not bool(payload.get("send_images", True))
    _emit_event(
        {
            "event": "finish",
            "progress": 1.0,
            "message": "Source backend finished",
            "message_en": "Source backend finished",
            "message_cn": "源后端完成",
        }
    )
    return {
        "ok": ok,
        "images": images,
        "info": str(getattr(response, "info", "") or ""),
        "parameters": getattr(response, "parameters", {}) or {},
        "source_module_choices": modules,
        "resolved_source_modules": resolved_modules,
        "source_model_settings": model_settings,
        "source_forge_couple_settings": forge_couple_settings,
        "source_script_setup": script_setup,
        "source_lora_registry": lora_registry,
        "source_extra_networks": context.get("source_extra_networks"),
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def _run_unload_models() -> dict[str, Any]:
    started = time.monotonic()
    from backend import memory_management
    from modules import sd_models

    loaded_before = len(getattr(memory_management, "current_loaded_models", []) or [])
    unload_model_weights = getattr(sd_models, "unload_model_weights", None)
    unload_model_weights_called = False
    if callable(unload_model_weights):
        unload_model_weights()
        unload_model_weights_called = True
    else:
        unload_all_models = getattr(memory_management, "unload_all_models", None)
        if callable(unload_all_models):
            unload_all_models()
    soft_empty_cache = getattr(memory_management, "soft_empty_cache", None)
    if callable(soft_empty_cache):
        soft_empty_cache()
    gc_collected = gc.collect()
    loaded_after = len(getattr(memory_management, "current_loaded_models", []) or [])
    _emit_event(_stage_event(1.0, "Source backend models unloaded", "源后端模型已卸载"))
    return {
        "ok": True,
        "status": "unloaded",
        "loaded_models_before": loaded_before,
        "loaded_models_after": loaded_after,
        "unload_model_weights_called": unload_model_weights_called,
        "gc_collected": gc_collected,
        "elapsed_seconds": round(time.monotonic() - started, 3),
    }


def _serve_loop(data_root: Path, source_root: Path) -> int:
    global _CURRENT_JOB_ID
    _emit_event(_stage_event(0.03, "Source backend process ready", "源后端进程已就绪"))
    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue
        job_id = ""
        try:
            request = json.loads(line)
            job_id = str(request.get("job_id") or "")
            if not job_id:
                raise ValueError("missing job_id")
            mode = str(request.get("mode") or "txt2img")
            payload = dict(request.get("payload") or {})
            _CURRENT_JOB_ID = job_id
            if mode == "controlnet_detect":
                result = _run_controlnet_detect(payload, data_root, source_root)
            elif mode == "upscale":
                result = _run_upscale(payload, data_root)
            elif mode == "tipo_prompt":
                result = _run_tipo_prompt(payload, data_root, source_root)
            elif mode == "unload_models":
                result = _run_unload_models()
            elif mode == "txt2img":
                result = _run_txt2img(payload, data_root)
            elif mode == "img2img":
                result = _run_img2img(payload, data_root)
            else:
                raise ValueError(f"unsupported source backend mode: {mode}")
            _emit_result(job_id, result)
        except Exception as exc:
            if job_id:
                _emit_result(
                    job_id,
                    {
                        "ok": False,
                        "error": f"{type(exc).__name__}: {exc}",
                        "traceback": traceback.format_exc(),
                    },
                )
            else:
                _emit_event(
                    _stage_event(
                        0.02,
                        f"Source backend request decode failed: {type(exc).__name__}: {exc}",
                        f"源后端请求解析失败：{type(exc).__name__}: {exc}",
                    )
                )
        finally:
            _CURRENT_JOB_ID = ""
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Run copied Forge source backend in an isolated process.")
    parser.add_argument("--request", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--backend-root", type=Path)
    parser.add_argument("--data-root", type=Path)
    parser.add_argument("--model-ref", type=Path)
    args = parser.parse_args()

    try:
        repo_root = Path(__file__).resolve().parents[2]
        if str(repo_root) not in sys.path:
            sys.path.insert(0, str(repo_root))
        from forge_neo.tipo_runtime import ensure_tipo_kgen_startup

        ensure_tipo_kgen_startup(python_executable=sys.executable)

        if args.serve:
            if args.backend_root is None or args.data_root is None:
                raise ValueError("--serve requires --backend-root and --data-root")
            backend_root = args.backend_root.resolve()
            data_root = args.data_root.resolve()
            model_ref = args.model_ref.resolve() if args.model_ref is not None else None
            source_root = _setup_source_imports(backend_root, data_root, model_ref)
            return _serve_loop(data_root, source_root)

        if args.request is None or args.output is None:
            raise ValueError("--request and --output are required outside --serve")
        request = json.loads(args.request.read_text(encoding="utf-8"))
        backend_root = Path(request["backend_root"]).resolve()
        data_root = Path(request["data_root"]).resolve()
        model_ref = Path(request["model_ref"]).resolve() if request.get("model_ref") else None
        mode = str(request.get("mode") or "txt2img")
        payload = dict(request.get("payload") or {})

        source_root = _setup_source_imports(backend_root, data_root, model_ref)
        if mode == "controlnet_detect":
            result = _run_controlnet_detect(payload, data_root, source_root)
        elif mode == "upscale":
            result = _run_upscale(payload, data_root)
        elif mode == "tipo_prompt":
            result = _run_tipo_prompt(payload, data_root, source_root)
        elif mode == "unload_models":
            result = _run_unload_models()
        elif mode == "txt2img":
            result = _run_txt2img(payload, data_root)
        elif mode == "img2img":
            result = _run_img2img(payload, data_root)
        else:
            raise ValueError(f"unsupported source backend mode: {mode}")
        _write_json(args.output, result)
        return 0 if result.get("ok") else 2
    except Exception as exc:
        if args.output is not None:
            _write_json(
                args.output,
                {
                    "ok": False,
                    "error": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(),
                },
            )
        else:
            print(f"{type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
