import copy
import json
from datetime import datetime


SCHEMA = "simpleai.regen.v1"
KEY = "simpleai_regen_manifest"
LABEL = "SimpleAI Regen Manifest"
VIDEO_DURATION_KEY = "scene_video_duration"
EXTRA_BACKEND_ARGS = (KEY, VIDEO_DURATION_KEY)


def ensure_api_params_backend_arg(api_params_module):
    backend_args = getattr(api_params_module, "backend_args", None)
    if isinstance(backend_args, list):
        for key in EXTRA_BACKEND_ARGS:
            if key not in backend_args:
                backend_args.append(key)


def sync_lora_backend_params(manifest, backend_params, max_lora_number):
    if not isinstance(manifest, dict) or not isinstance(backend_params, dict):
        return manifest

    try:
        max_lora_number = max(0, int(max_lora_number))
    except (TypeError, ValueError):
        max_lora_number = 0

    snapshot = manifest.get("backend_params")
    if not isinstance(snapshot, dict):
        snapshot = {}
        manifest["backend_params"] = snapshot

    for index in range(1, max_lora_number + 1):
        for suffix in ("", "_strength"):
            key = f"lora_{index}{suffix}"
            if key in backend_params:
                snapshot[key] = json_safe(backend_params.get(key))
            else:
                snapshot.pop(key, None)

    for key in ("loras", "use_lora"):
        if key in backend_params:
            snapshot[key] = json_safe(backend_params.get(key))
        else:
            snapshot.pop(key, None)
    return manifest


def _is_data_url(value):
    return isinstance(value, str) and value.lstrip().startswith("data:")


def _contains_data_url(value, depth=0):
    if depth > 20:
        return False
    if _is_data_url(value):
        return True
    if isinstance(value, str):
        text = value.strip()
        if not text or text[0] not in "{[":
            return False
        try:
            value = json.loads(text)
        except Exception:
            return False
    if isinstance(value, dict):
        return any(_contains_data_url(item, depth + 1) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_contains_data_url(item, depth + 1) for item in value)
    return False


def json_safe(value, depth=0):
    if depth > 20:
        return None
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        if _is_data_url(value):
            return None
        text = value.strip()
        if text and text[0] in "{[":
            try:
                parsed = json.loads(text)
            except Exception:
                return value
            if _contains_data_url(parsed, depth + 1):
                return json_safe(parsed, depth + 1)
        return value
    if isinstance(value, tuple):
        value = list(value)
    if isinstance(value, list):
        return [json_safe(item, depth + 1) for item in value]
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if not isinstance(key, str):
                key = str(key)
            if key in {"image", "mask", "samples", "pixels", "latent"}:
                continue
            safe_item = json_safe(item, depth + 1)
            if safe_item is not None:
                result[key] = safe_item
        return result
    return str(value)


def dumps(value):
    return json.dumps(json_safe(value), ensure_ascii=False, sort_keys=True)


def loads(value):
    if isinstance(value, dict):
        return copy.deepcopy(value)
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if not isinstance(value, str):
        return None

    current = value.strip()
    for _ in range(3):
        if not current:
            return None
        try:
            parsed = json.loads(current)
        except Exception:
            return None
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, str):
            current = parsed.strip()
            continue
        return None
    return None


def extract(metadata):
    parsed = loads(metadata)
    if isinstance(parsed, dict) and parsed.get("schema") == SCHEMA:
        return parsed

    if isinstance(metadata, str):
        metadata = loads(metadata)
    if not isinstance(metadata, dict):
        return None

    for key in (KEY, LABEL, "SimpleAI Regen Manifest"):
        if key in metadata:
            manifest = loads(metadata.get(key))
            if isinstance(manifest, dict) and manifest.get("schema") == SCHEMA:
                return manifest
    return None


def make_manifest(
    *,
    preset_name,
    preset_json,
    preset_prepared,
    ui_values,
    backend_params,
    asset_refs=None,
    workflow=None,
):
    return {
        "schema": SCHEMA,
        "created_at": datetime.now().isoformat(timespec="seconds"),
        "preset_name": preset_name,
        "preset_json": json_safe(preset_json or {}),
        "preset_prepared": json_safe(preset_prepared or {}),
        "ui_values": json_safe(ui_values or {}),
        "backend_params": json_safe(backend_params or {}),
        "asset_refs": json_safe(asset_refs or {}),
        "workflow": json_safe(workflow or {}),
    }
