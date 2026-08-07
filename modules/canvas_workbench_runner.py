import copy
import base64
import io
import json
import logging
import mimetypes
import os
import random
import threading
import time
from urllib.parse import quote

import modules.config as config
import modules.constants as constants
import modules.flags as flags
from modules import canvas_workbench_assets
from modules import canvas_workbench_director
from modules import minimax_h3_prompt_compiler
from enhanced import parameter_profiles
from modules.access_mode import user_can_generate

try:
    import simpleai_base.api_params as api_params
except Exception:
    api_params = None

CANVAS_EXTRA_BACKEND_ARGS = (
    "upscale_model",
    "keep_vlm_model_loaded",
    "cloud_config_name",
    "cloud_protocol",
    "cloud_base_url",
    "cloud_api_key",
    "cloud_model",
    "simpleai_regen_manifest",
    "scene_video_duration",
)


def _ensure_canvas_backend_args():
    if api_params is None:
        return
    backend_args = getattr(api_params, "backend_args", None)
    if not isinstance(backend_args, list):
        return
    for name in CANVAS_EXTRA_BACKEND_ARGS:
        if name not in backend_args:
            backend_args.append(name)


_ensure_canvas_backend_args()

try:
    import numpy as np
    from PIL import Image
except Exception:
    np = None
    Image = None


UPLOAD_ORDER_WITH_CANVAS = ["scene_canvas_image", "scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4", "scene_video", "scene_reference_video", "sam3_input_video", "sam3_mask_video", "scene_audio"]
UPLOAD_ORDER_NO_CANVAS = ["scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4", "scene_canvas_image", "scene_video", "scene_reference_video", "sam3_input_video", "sam3_mask_video", "scene_audio"]
SCENE_MEDIA_BACKEND_KEYS = tuple(dict.fromkeys(UPLOAD_ORDER_WITH_CANVAS + UPLOAD_ORDER_NO_CANVAS))
SCENE_MEDIA_ALIAS_KEYS = ("scene_original_video_path", "sam3_original_video_path", "video", "reference_video", "audio", "mask_video")
CANVAS_RUNS = {}
CANVAS_RUNS_LOCK = threading.Lock()
CANVAS_RUN_RETENTION_SECONDS = 60 * 60 * 6
TERMINAL_RUN_STATES = ("finished", "failed", "canceled", "skipped")
PREVIEW_STREAM_MAX_FRAMES = 128
PREVIEW_STREAM_DELTA_MAX_FRAMES = 64
PREVIEW_STREAM_FPS = 8


def _normalize_client_context(value):
    source = value if isinstance(value, dict) else {}
    result = {}
    limits = {
        "surface": 80,
        "conversation_id": 240,
        "message_id": 240,
        "tool_call_id": 240,
        "source_message_id": 240,
        "scene_key": 160,
        "offer_reason": 80,
    }
    for key, limit in limits.items():
        text = str(source.get(key) or "").strip()
        if text:
            result[key] = text[:limit]
    return result


def _run_record_owner(record):
    if not isinstance(record, dict):
        return ""
    owner = str(record.get("owner_user_did") or "").strip()
    if owner:
        return owner
    task = record.get("task")
    return str(getattr(task, "user_did", None) or "").strip()


def _run_record_owned_by(record, identity):
    owner = _run_record_owner(record)
    user_did = str((identity or {}).get("user_did") or "").strip()
    return bool(owner and user_did and owner == user_did)


def _iso_from_ts(value):
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(float(value)))
    except Exception:
        return ""


def _compact_asset(asset):
    if not isinstance(asset, dict):
        return {}
    result = {}
    for key in ("kind", "asset_id", "mime", "size", "width", "height", "path", "output_path", "preview_url"):
        if asset.get(key) not in (None, ""):
            result[key] = asset.get(key)
    result["has_data_url"] = bool(asset.get("data_url"))
    result["has_thumb"] = bool(asset.get("thumb"))
    return result


def _compact_node(node):
    if not isinstance(node, dict):
        return {}
    return {
        "id": node.get("id"),
        "type": node.get("type"),
        "title": node.get("title"),
        "asset": _compact_asset(node.get("asset")),
        "has_mask": bool(isinstance(node.get("mask"), dict) and node.get("mask", {}).get("data_url")),
    }


def _add_run_event(record, level, message, data=None):
    if not isinstance(record, dict):
        return
    events = record.setdefault("events", [])
    item = {
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": str(level or "info"),
        "message": str(message or ""),
    }
    if data is not None:
        item["data"] = data
    events.append(item)
    if len(events) > 80:
        del events[:-80]


def _ordered_upload_slots(asset_sources):
    has_canvas = bool(asset_sources.get("scene_canvas_image"))
    order = UPLOAD_ORDER_WITH_CANVAS if has_canvas else UPLOAD_ORDER_NO_CANVAS
    ordered = [slot for slot in order if asset_sources.get(slot)]
    # Also include classic-specific upload slots
    classic_slots = [
        "ip_image_0", "ip_image_1", "ip_image_2", "ip_image_3",
        "uov_image", "inpaint_image", "inpaint_mask", "enhance_image"
    ]
    for slot in classic_slots:
        if slot not in ordered and asset_sources.get(slot):
            ordered.append(slot)
    for slot in asset_sources:
        if slot not in ordered:
            ordered.append(slot)
    return ordered


def _model_config(preset_node):
    config = preset_node.get("models_config") if isinstance(preset_node.get("models_config"), dict) else {}
    return {
        "mode": config.get("mode", "preset_default"),
        "defaults": copy.deepcopy(config.get("defaults") or {}),
        "overrides": copy.deepcopy(config.get("overrides") or {}),
        "source_node_id": config.get("source_node_id"),
    }


def _resolution_config(preset_node):
    config = preset_node.get("resolution_config") if isinstance(preset_node.get("resolution_config"), dict) else {}
    return {
        "mode": config.get("mode", "preset_default"),
        "defaults": copy.deepcopy(config.get("defaults") or {}),
        "overrides": copy.deepcopy(config.get("overrides") or {}),
        "source_node_id": config.get("source_node_id"),
    }


def _generation_config(preset_node):
    config = preset_node.get("generation_config") if isinstance(preset_node.get("generation_config"), dict) else {}
    return {
        "mode": config.get("mode", "preset_default"),
        "defaults": copy.deepcopy(config.get("defaults") or {}),
        "overrides": copy.deepcopy(config.get("overrides") or {}),
        "source_node_id": config.get("source_node_id"),
    }


def _styles_config(preset_node):
    config = preset_node.get("styles_config") if isinstance(preset_node.get("styles_config"), dict) else {}
    return {
        "mode": config.get("mode", "preset_default"),
        "defaults": copy.deepcopy(config.get("defaults") or {}),
        "overrides": copy.deepcopy(config.get("overrides") or {}),
        "source_node_id": config.get("source_node_id"),
    }


def _merged_config_values(config):
    defaults = config.get("defaults") if isinstance(config.get("defaults"), dict) else {}
    overrides = config.get("overrides") if isinstance(config.get("overrides"), dict) else {}
    merged = copy.deepcopy(defaults)
    merged.update(copy.deepcopy(overrides))
    return merged


def _style_list(value):
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value.replace("'", '"'))
        except Exception:
            parsed = None
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
        return [item.strip().strip("[]'\"") for item in value.split(",") if item.strip().strip("[]'\"")]
    return []


def _style_config_selection(values):
    if not isinstance(values, dict):
        return None
    for key in ("style_selections", "styles", "default_styles"):
        if key in values:
            return _style_list(values.get(key))
    return None


def _preset_prompt_defaults(preset_node):
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    snapshot = preset.get("snapshot") if isinstance(preset.get("snapshot"), dict) else {}
    defaults = preset.get("defaults") if isinstance(preset.get("defaults"), dict) else {}
    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    schema = preset_node.get("schema") if isinstance(preset_node.get("schema"), dict) else {}
    scene_theme = runtime.get("scene_theme") or schema.get("default_theme") or ""
    per_theme = schema.get("per_theme") if isinstance(schema.get("per_theme"), dict) else {}
    theme_info = per_theme.get(scene_theme) if isinstance(per_theme.get(scene_theme), dict) else {}
    theme_defaults = theme_info.get("defaults") if isinstance(theme_info.get("defaults"), dict) else {}
    styles = (
        _style_list(snapshot.get("default_styles"))
        or _style_list(defaults.get("default_styles"))
        or _style_list(preset.get("default_styles"))
    )
    prompt = (
        snapshot.get("default_prompt")
        or snapshot.get("prompt")
        or defaults.get("default_prompt")
        or defaults.get("prompt")
        or preset.get("default_prompt")
        or preset.get("prompt")
        or theme_defaults.get("prompt")
        or theme_defaults.get("default_prompt")
        or ""
    )
    negative = (
        snapshot.get("default_prompt_negative")
        or defaults.get("default_prompt_negative")
        or preset.get("default_prompt_negative")
        or theme_defaults.get("negative_prompt")
        or theme_defaults.get("default_prompt_negative")
        or ""
    )
    return {
        "default_styles": styles,
        "default_prompt": str(prompt or "").strip(),
        "default_prompt_negative": str(negative or "").strip(),
    }


def _scene_theme_defaults(preset_node, runtime):
    schema = preset_node.get("schema") if isinstance(preset_node.get("schema"), dict) else {}
    per_theme = schema.get("per_theme") if isinstance(schema.get("per_theme"), dict) else {}
    scene_theme = runtime.get("scene_theme") if isinstance(runtime, dict) else ""
    theme_info = per_theme.get(scene_theme) if isinstance(per_theme.get(scene_theme), dict) else {}
    defaults = theme_info.get("defaults") if isinstance(theme_info.get("defaults"), dict) else {}
    return copy.deepcopy(defaults)


def _scene_param(params, defaults, key, fallback=None):
    if isinstance(params, dict) and key in params:
        return params.get(key)
    if isinstance(defaults, dict) and key in defaults:
        return defaults.get(key)
    return fallback


def _combined_scene_additional_prompt(params, defaults):
    first = _scene_param(params, defaults, "scene_additional_prompt", "")
    second = _scene_param(params, defaults, "scene_additional_prompt_2", "")
    return f"{first or ''}{second or ''}"


def _enabled_loras(model_values):
    raw = model_values.get("loras") if isinstance(model_values, dict) else []
    if not isinstance(raw, list):
        return []
    loras = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            continue
        if item.get("enabled") is False:
            continue
        model = item.get("model") or "None"
        if str(model or "").strip().lower() in ("", "none"):
            continue
        try:
            weight = float(item.get("weight", 1.0))
        except Exception:
            weight = 1.0
        loras.append({"index": index, "model": model, "weight": weight})
    return loras


def _scene_lora_backend_params(enabled_loras):
    result = {
        "use_lora": bool(enabled_loras),
        "loras": [[item["model"], item["weight"]] for item in enabled_loras],
    }
    for item in enabled_loras:
        try:
            index = int(item.get("index") or 0)
        except Exception:
            index = 0
        if index <= 0:
            continue
        result[f"lora_{index}"] = item["model"]
        result[f"lora_{index}_strength"] = item["weight"]
    return result


def _positive_int(value):
    try:
        number = int(float(value))
    except Exception:
        return None
    return number if number > 0 else None


def _number_value(value):
    if isinstance(value, bool) or value is None:
        return value
    try:
        number = float(value)
    except Exception:
        return value
    if number.is_integer():
        return int(number)
    return number


def _generation_api_overrides(generation):
    if not isinstance(generation, dict):
        return {}
    aliases = {
        "guidance_scale": ("guidance_scale", "cfg_scale"),
        "sharpness": ("sharpness", "sample_sharpness"),
        "sampler_name": ("sampler_name", "sampler"),
        "scheduler_name": ("scheduler_name", "scheduler"),
        "performance_selection": ("performance_selection", "performance"),
        "image_number": ("image_number",),
        "output_format": ("output_format",),
        "refiner_switch": ("refiner_switch",),
        "adaptive_cfg": ("adaptive_cfg", "cfg_tsnr"),
        "overwrite_step": ("overwrite_step", "steps"),
        "overwrite_switch": ("overwrite_switch",),
        "save_metadata_to_images": ("save_metadata_to_images",),
    }
    numeric_keys = {
        "guidance_scale",
        "sharpness",
        "image_number",
        "refiner_switch",
        "adaptive_cfg",
        "overwrite_step",
        "overwrite_switch",
    }
    result = {}
    for api_key, candidates in aliases.items():
        value = None
        for candidate in candidates:
            if candidate in generation:
                value = generation.get(candidate)
                break
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        result[api_key] = _number_value(value) if api_key in numeric_keys else value
    return result


def _bool_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().lower()
        if text in ("1", "true", "yes", "on", "enabled"):
            return True
        if text in ("0", "false", "no", "off", "disabled"):
            return False
        return default
    return bool(value)


def _float_value(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return float(default)


def _int_value(value, default=0):
    try:
        return int(float(value))
    except Exception:
        return int(default)


def _resolve_inpaint_task_method(task_method, backend_engine=""):
    task_method = str(task_method or "").strip()
    if task_method in getattr(flags, "inpaint_engine_versions", {}):
        return task_method
    backend_engine = str(backend_engine or "").strip()
    task_lower = task_method.lower()
    if "z_image" in task_lower or "z-image" in task_lower or backend_engine in ("Z-image", "Zimage"):
        return "z_image_turbo_aio_cn"
    if "wan" in task_lower or backend_engine == "Wan":
        return "wan_aio_cn"
    if "qwen" in task_lower or backend_engine == "Qwen":
        return "qwen_aio_cn"
    if "flux" in task_lower or backend_engine == "Flux":
        return "flux_aio"
    return "SDXL"


def _resolve_inpaint_engine_value(value, task_method, backend_engine="", prefer_none=False):
    resolved_method = _resolve_inpaint_task_method(task_method, backend_engine)
    choices = list(getattr(flags, "inpaint_engine_versions", {}).get(
        resolved_method,
        getattr(flags, "inpaint_engine_versions", {}).get("SDXL", [])
    ))
    if value in choices:
        return value
    if prefer_none and "None" in choices:
        return "None"
    return choices[0] if choices else value


def _is_inpaint_detail_mode(value):
    text = str(value or "").strip()
    detail = str(getattr(flags, "inpaint_option_detail", "Improve Detail") or "Improve Detail")
    return text == detail or text.startswith("Improve Detail")


def _resolve_seed(params):
    seed_random = _bool_value(params.get("seed_random"), True)
    if seed_random:
        return random.randint(constants.MIN_SEED, constants.MAX_SEED)
    try:
        seed = int(float(params.get("image_seed")))
        if constants.MIN_SEED <= seed <= constants.MAX_SEED:
            return seed
    except Exception:
        pass
    return random.randint(constants.MIN_SEED, constants.MAX_SEED)


def _split_size_text(value):
    text = str(value or "").strip()
    if not text:
        return None
    head = text.split("|", 1)[0].strip()
    normalized = head.replace("×", " ").replace("脳", " ").replace("*", " ").lower().replace("x", " ")
    parts = normalized.split()
    if len(parts) < 2:
        return None
    width = _positive_int(parts[0])
    height = _positive_int(parts[1])
    if not width or not height:
        return None
    return width, height


def _ratio_suffix(width, height):
    try:
        import math

        gcd = math.gcd(int(width), int(height))
        return f"{int(width) // gcd}:{int(height) // gcd}"
    except Exception:
        return "1:1"


def _format_backend_aspect(width, height):
    return f"{int(width)}×{int(height)} | {_ratio_suffix(width, height)}"


def _asset_size_from_materialized_inputs(materialized_inputs):
    for item in materialized_inputs:
        ref = item.get("asset_ref") if isinstance(item, dict) else {}
        width = _positive_int(ref.get("width")) if isinstance(ref, dict) else None
        height = _positive_int(ref.get("height")) if isinstance(ref, dict) else None
        if width and height:
            return width, height
        path = ref.get("path") if isinstance(ref, dict) else None
        if Image is not None and path and os.path.exists(path):
            try:
                with Image.open(path) as image:
                    return image.size
            except Exception:
                pass
    return None


def _default_backend_aspect():
    value = getattr(config, "default_aspect_ratio", "") or ""
    size = _split_size_text(value)
    if size:
        return _format_backend_aspect(*size)
    value = getattr(flags, "default_aspect_ratios", {}).get("SDXL", "") if isinstance(getattr(flags, "default_aspect_ratios", None), dict) else ""
    size = _split_size_text(value)
    if size:
        return _format_backend_aspect(*size)
    return "1024×1024 | 1:1"


def _resolution_random_aspect_enabled(resolution):
    if not isinstance(resolution, dict):
        return False
    return _bool_value(resolution.get("random_aspect_ratio"), False) or _bool_value(resolution.get("random_aspect_ratio_checkbox"), False)


def _resolution_aspect_candidates(resolution):
    if not isinstance(resolution, dict):
        return []
    profile = resolution.get("profile") if isinstance(resolution.get("profile"), dict) else {}
    template = str(
        resolution.get("template")
        or resolution.get("available_aspect_ratios_selection")
        or resolution.get("default_template")
        or ""
    ).strip()
    profile_ratios = []
    for source in (profile.get("aspect_ratios"), resolution.get("aspect_ratios")):
        if isinstance(source, list):
            profile_ratios.extend(str(item).strip() for item in source if str(item).strip())
    if template.lower() == "preset" and profile_ratios:
        candidates = profile_ratios
    else:
        ratio_map = getattr(flags, "available_aspect_ratios_list", {}) if isinstance(getattr(flags, "available_aspect_ratios_list", None), dict) else {}
        candidates = list(ratio_map.get(template) or [])
        if not candidates and profile_ratios:
            candidates = profile_ratios
        if not candidates:
            candidates = list(ratio_map.get("SDXL") or [])
    return [candidate for candidate in candidates if _split_size_text(candidate)]


def _choose_random_backend_aspect_ratio(resolution):
    candidates = _resolution_aspect_candidates(resolution)
    if not candidates:
        return _default_backend_aspect()
    size = _split_size_text(random.choice(candidates))
    return _format_backend_aspect(*size) if size else _default_backend_aspect()


def _resolve_backend_aspect_ratio(resolution, params, materialized_inputs, skip_asset_fallback=False):
    if _resolution_random_aspect_enabled(resolution):
        return _choose_random_backend_aspect_ratio(resolution)

    if isinstance(resolution, dict) and resolution.get("use_input_aspect") and not skip_asset_fallback:
        size = _asset_size_from_materialized_inputs(materialized_inputs)
        if size:
            return _format_backend_aspect(*size)

    width = _positive_int(resolution.get("width")) if isinstance(resolution, dict) else None
    height = _positive_int(resolution.get("height")) if isinstance(resolution, dict) else None
    if width and height:
        effective = _effective_resolution_values(resolution)
        return _format_backend_aspect(effective["width"], effective["height"])

    candidates = []
    if isinstance(resolution, dict):
        candidates.append(resolution.get("aspect_ratio"))
    if isinstance(params, dict):
        candidates.extend([params.get("scene_aspect_ratio"), params.get("aspect_ratios_selection")])
    for candidate in candidates:
        size = _split_size_text(candidate)
        if size:
            return _format_backend_aspect(*size)
        mapped = getattr(flags, "scene_aspect_ratios_size", {}).get(str(candidate or "").strip())
        size = _split_size_text(mapped)
        if size:
            return _format_backend_aspect(*size)

    # For classic mode, don't fall back to materialized image sizes (IP images etc.)
    # Use default aspect ratio instead
    if not skip_asset_fallback:
        size = _asset_size_from_materialized_inputs(materialized_inputs)
        if size:
            return _format_backend_aspect(*size)
    return _default_backend_aspect()


def _quantize_resolution_value(value, step):
    try:
        step = int(step or getattr(flags, "default_resolution_quantize_step", 8) or 8)
    except Exception:
        step = getattr(flags, "default_resolution_quantize_step", 8)
    if step not in getattr(flags, "resolution_quantize_steps", [1, 8, 16, 32, 64]):
        step = getattr(flags, "default_resolution_quantize_step", 8)
    try:
        number = float(value)
    except Exception:
        number = 0
    return max(step, int(round(number / step) * step))


def _resolution_multiplier(resolution):
    try:
        value = float((resolution or {}).get("multiplier", 1.0))
    except Exception:
        value = 1.0
    return max(1.0, min(2.0, value))


def _resolution_edit_mode(resolution):
    resolution = resolution or {}
    profile = resolution.get("profile") if isinstance(resolution.get("profile"), dict) else resolution
    return (
        resolution.get("edit_mode")
        or (profile.get("preprocess_fit") if isinstance(profile, dict) else None)
        or getattr(flags, "default_resolution_edit_mode", "scale")
    )


def _effective_resolution_values(resolution):
    width = _positive_int((resolution or {}).get("width")) or 1024
    height = _positive_int((resolution or {}).get("height")) or 1024
    step = (resolution or {}).get("quantize") or getattr(flags, "default_resolution_quantize_step", 8)
    multiplier = _resolution_multiplier(resolution)
    return {
        "base_width": width,
        "base_height": height,
        "width": _quantize_resolution_value(width * multiplier, step),
        "height": _quantize_resolution_value(height * multiplier, step),
        "multiplier": multiplier,
        "quantize": step,
    }


def _scene_frontend_value(preset_node, runtime):
    value = runtime.get("scene_frontend") if isinstance(runtime, dict) else ""
    schema = preset_node.get("schema") if isinstance(preset_node.get("schema"), dict) else {}
    version = schema.get("version") or ""
    if value is True or str(value or "").strip().lower() in ("scene", "true", "1"):
        return version or "scene"
    return value or version


def _scene_task_method(runtime, scene_frontend):
    task_method = str((runtime or {}).get("task_method") or "").strip()
    if scene_frontend and task_method and not task_method.startswith("scene_"):
        return f"scene_{task_method}"
    return task_method


def _input_backend_value(item):
    asset_ref = item.get("asset_ref") if isinstance(item, dict) else {}
    mask_ref = item.get("mask_ref") if isinstance(item, dict) else {}
    slot = str(item.get("slot") or "")
    if "video" in slot or "audio" in slot:
        return asset_ref.get("path") if isinstance(asset_ref, dict) else None
    if item.get("slot") == "scene_canvas_image":
        return {
            "kind": "canvas_image_with_optional_mask",
            "image_path": asset_ref.get("path") if isinstance(asset_ref, dict) else None,
            "mask_path": mask_ref.get("path") if isinstance(mask_ref, dict) else None,
            "asset_id": asset_ref.get("asset_id") if isinstance(asset_ref, dict) else None,
            "mask_asset_id": mask_ref.get("asset_id") if isinstance(mask_ref, dict) else None,
        }
    return {
        "kind": "image",
        "path": asset_ref.get("path") if isinstance(asset_ref, dict) else None,
        "asset_id": asset_ref.get("asset_id") if isinstance(asset_ref, dict) else None,
    }


def _normalization_backend_value(item):
    value = _input_backend_value(item)
    slot = str(item.get("slot") or "")
    if "video" in slot or "audio" in slot:
        return value
    if item.get("slot") == "scene_canvas_image":
        return {
            "image": value.get("image_path") or value.get("asset_id"),
            "mask": value.get("mask_path") or value.get("mask_asset_id"),
        }
    return value.get("path") or value.get("asset_id")


def _materialized_input_slots(materialized_inputs):
    slots = set()
    for item in materialized_inputs or []:
        if isinstance(item, dict) and item.get("slot"):
            slots.add(str(item.get("slot")))
    return slots


def _clear_unmaterialized_scene_media_params(params_backend, materialized_inputs):
    if not isinstance(params_backend, dict):
        return params_backend
    connected_slots = _materialized_input_slots(materialized_inputs)
    for key in SCENE_MEDIA_BACKEND_KEYS:
        if key not in connected_slots:
            params_backend.pop(key, None)
    for key in SCENE_MEDIA_ALIAS_KEYS:
        params_backend.pop(key, None)
    params_backend.pop("active_video_source", None)
    return params_backend


def _apply_scene_media_backend_aliases(params_backend):
    if not isinstance(params_backend, dict):
        return params_backend
    scene_video_effective = params_backend.get("scene_original_video_path") or params_backend.get("scene_video")
    sam3_video_effective = params_backend.get("sam3_original_video_path") or params_backend.get("sam3_input_video")
    active_video_source = params_backend.get("active_video_source")
    if active_video_source == "scene":
        video_effective = scene_video_effective or sam3_video_effective
    elif active_video_source == "sam3":
        video_effective = sam3_video_effective or scene_video_effective
    else:
        video_effective = sam3_video_effective or scene_video_effective
    if video_effective:
        params_backend["video"] = video_effective
    if params_backend.get("scene_reference_video") is not None:
        params_backend["reference_video"] = params_backend.get("scene_reference_video")
    if params_backend.get("scene_audio") is not None:
        params_backend["audio"] = params_backend.get("scene_audio")
    if params_backend.get("sam3_mask_video") is not None:
        params_backend["mask_video"] = params_backend.get("sam3_mask_video")
    return params_backend


def _director_runtime_from_params(params):
    if not isinstance(params, dict):
        return None
    payload = params.get("director_timeline") if isinstance(params.get("director_timeline"), dict) else None
    prompt_override = str(params.get("prompt_override") or "").strip()
    if payload:
        runtime = canvas_workbench_director.prepare_director_runtime(payload)
        if prompt_override:
            runtime["prompt_override"] = prompt_override
        return runtime
    if prompt_override:
        return {
            "schema": canvas_workbench_director.SCHEMA,
            "prompt_override": prompt_override,
            "segments": [],
            "media_refs": {"images": [], "audio": [], "video": []},
        }
    return None


def _load_image_array(path, mode="RGB"):
    if Image is None or np is None:
        raise RuntimeError("PIL/numpy is not available for canvas task image loading")
    if not path or not os.path.exists(path):
        raise FileNotFoundError(path or "missing image path")
    with Image.open(path) as image:
        if mode:
            image = image.convert(mode)
        return np.array(image)


def _resize_mask_to_image(mask, image):
    if mask is None or image is None or Image is None or np is None:
        return mask
    try:
        target_h, target_w = image.shape[:2]
        mask_h, mask_w = mask.shape[:2]
        if int(target_h) == int(mask_h) and int(target_w) == int(mask_w):
            return mask
        pil_mask = Image.fromarray(mask)
        pil_mask = pil_mask.resize((int(target_w), int(target_h)), Image.Resampling.NEAREST)
        return np.array(pil_mask)
    except Exception:
        return mask


def _task_backend_value(item):
    slot = str(item.get("slot") or "")
    if "video" in slot or "audio" in slot:
        return _input_backend_value(item)
    value = _input_backend_value(item)
    if item.get("slot") == "scene_canvas_image":
        image_path = value.get("image_path")
        image = _load_image_array(image_path, "RGB")
        mask_path = value.get("mask_path")
        if mask_path:
            mask = _load_image_array(mask_path, "L")
        else:
            mask = np.zeros(image.shape[:2], dtype=np.uint8)
        mask = _resize_mask_to_image(mask, image)
        return {"image": image, "mask": mask}
    return _load_image_array(value.get("path"), "RGB")


def _has_preprocessor_method(methods, name):
    if not isinstance(methods, list):
        return False
    for item in methods:
        if isinstance(item, (list, tuple, set)) and name in item:
            return True
        if item == name:
            return True
    return False


def _schema_value_for_theme(schema, key, theme=None, default=None):
    if not isinstance(schema, dict):
        return default
    value = schema.get(key, default)
    if isinstance(value, dict):
        if theme is not None and theme in value:
            return value.get(theme)
        if value:
            return next(iter(value.values()))
        return default
    return value


def _scene_canvas_mask_disabled_from_schema(schema, theme=None):
    value = _schema_value_for_theme(schema, "disable_canvas_mask", theme, None)
    if value is None:
        value = _schema_value_for_theme(schema, "disable_scene_canvas_mask", theme, False)
    return _bool_value(value)


def _clear_workbench_scene_canvas_mask(params_backend):
    if not isinstance(params_backend, dict) or np is None:
        return params_backend
    canvas = params_backend.get("scene_canvas_image")
    if isinstance(canvas, dict) and canvas.get("mask") is not None:
        canvas["mask"] = np.zeros_like(canvas.get("mask"), dtype=np.uint8)
        params_backend["scene_canvas_image"] = canvas
    return params_backend


def _resize_workbench_scene_images_by_max_area(params_backend):
    try:
        import modules.util as util
    except Exception:
        return params_backend

    for key in ("scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4"):
        if params_backend.get(key) is not None:
            params_backend[key] = util.resize_image_by_max_area(params_backend.get(key), max_area=1024 * 1024)

    canvas = params_backend.get("scene_canvas_image")
    if isinstance(canvas, dict) and canvas.get("image") is not None:
        image = canvas.get("image")
        mask = canvas.get("mask")
        canvas["image"] = util.resize_image_by_max_area(image, max_area=1024 * 1024)
        if mask is not None:
            canvas["mask"] = util.resize_image_by_max_area(util.HWC3(mask), max_area=1024 * 1024)
            canvas["mask"] = _resize_mask_to_image(canvas["mask"], canvas["image"])
        params_backend["scene_canvas_image"] = canvas
    return params_backend


def _apply_workbench_scene_preprocess(params_backend, defaults):
    schema = params_backend.pop("canvas_scene_schema", {})
    if not isinstance(schema, dict):
        schema = {}
    resolution_info = params_backend.get("canvas_resolution") if isinstance(params_backend.get("canvas_resolution"), dict) else {}
    profile = resolution_info.get("profile") if isinstance(resolution_info.get("profile"), dict) else {}
    methods = schema.get("image_preprocessor_method", [])
    resize_image_flag = not _has_preprocessor_method(methods, "-normalization")
    canvas_mask_disabled = _scene_canvas_mask_disabled_from_schema(schema, params_backend.get("scene_theme"))
    if canvas_mask_disabled:
        params_backend = _clear_workbench_scene_canvas_mask(params_backend)

    try:
        from enhanced import resolution_preprocess

        preprocess_result = resolution_preprocess.apply_scene_resolution_preprocess(
            state_params={
                "__preset": params_backend.get("preset"),
                "scene_frontend": {"resolution_control": profile},
            },
            scene_theme=params_backend.get("scene_theme"),
            scene_canvas_image=params_backend.get("scene_canvas_image"),
            scene_input_image1=params_backend.get("scene_input_image1"),
            scene_input_image2=params_backend.get("scene_input_image2"),
            scene_input_image3=params_backend.get("scene_input_image3"),
            scene_input_image4=params_backend.get("scene_input_image4"),
            scene_video=params_backend.get("scene_video"),
            scene_original_video_path=params_backend.get("scene_original_video_path"),
            active_video_source=params_backend.get("active_video_source") or "scene",
            sam3_input_video=params_backend.get("sam3_input_video"),
            sam3_original_video_path=params_backend.get("sam3_original_video_path"),
            sam3_mask_video=params_backend.get("sam3_mask_video"),
            scene_aspect_ratio=params_backend.get("scene_aspect_ratio"),
            overwrite_width=defaults.get("overwrite_width"),
            overwrite_height=defaults.get("overwrite_height"),
            resolution_multiplier=defaults.get("resolution_multiplier"),
            resolution_quantize_step=defaults.get("resolution_quantize_step"),
            resolution_edit_mode=defaults.get("resolution_edit_mode"),
        )
        if preprocess_result.get("changed"):
            params_backend["scene_canvas_image"] = preprocess_result.get("scene_canvas_image")
            params_backend["scene_input_image1"] = preprocess_result.get("scene_input_image1")
            params_backend["scene_input_image2"] = preprocess_result.get("scene_input_image2")
            params_backend["scene_input_image3"] = preprocess_result.get("scene_input_image3")
            params_backend["scene_input_image4"] = preprocess_result.get("scene_input_image4")
            params_backend["scene_video"] = preprocess_result.get("scene_video")
            params_backend["scene_original_video_path"] = preprocess_result.get("scene_original_video_path")
            params_backend["sam3_input_video"] = preprocess_result.get("sam3_input_video")
            params_backend["sam3_original_video_path"] = preprocess_result.get("sam3_original_video_path")
            params_backend["sam3_mask_video"] = preprocess_result.get("sam3_mask_video")
            resize_image_flag = False
    except Exception:
        pass

    if canvas_mask_disabled:
        params_backend = _clear_workbench_scene_canvas_mask(params_backend)
    if resize_image_flag:
        params_backend = _resize_workbench_scene_images_by_max_area(params_backend)
    return params_backend


def _state_identity(payload, state_params):
    user_context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    nickname = user_context.get("nickname") or user_context.get("user_name") or ""
    user_did = user_context.get("user_did") or user_context.get("owner") or ""
    if isinstance(state_params, dict):
        nickname = nickname or state_params.get("nickname") or state_params.get("user_name") or ""
        user_did = user_did or state_params.get("user_did") or ""
        try:
            user = state_params.get("user")
            if not user_did and user is not None and hasattr(user, "get_did"):
                user_did = user.get_did()
        except Exception:
            pass
    return {
        "nickname": str(nickname or "Canvas"),
        "user_did": str(user_did or "guest"),
    }


def _payload_with_parameter_profile(payload, state_params):
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    identity = _state_identity(payload, state_params)
    context = dict(state_params) if isinstance(state_params, dict) else {}
    context["user_did"] = identity.get("user_did") or "guest"
    applied = parameter_profiles.apply_profile_to_canvas_node(preset_node, context)
    if not applied.get("ok"):
        return None, applied
    normalized = copy.deepcopy(payload)
    normalized["preset_node"] = applied.get("preset_node")
    return normalized, None


def _default_api_args():
    if api_params is None:
        return None
    defaults = {key: None for key in api_params.all_args}
    defaults.update({
        "generate_image_grid": False,
        "prompt": "",
        "negative_prompt": "",
        "style_selections": list(getattr(config, "default_styles", []) or []),
        "performance_selection": getattr(config, "default_performance", "Speed"),
        "aspect_ratios_selection": getattr(config, "default_aspect_ratio", "1024*1024"),
        "image_number": 1,
        "output_format": getattr(config, "default_output_format", "png"),
        "image_seed": -1,
        "read_wildcards_in_order": False,
        "sharpness": getattr(config, "default_sample_sharpness", getattr(config, "default_sharpness", 2.0)),
        "guidance_scale": getattr(config, "default_cfg_scale", getattr(config, "default_guidance_scale", 4.0)),
        "base_model": getattr(config, "default_base_model_name", getattr(config, "default_model", "")),
        "refiner_model": getattr(config, "default_refiner_model_name", getattr(config, "default_refiner", "None")),
        "refiner_switch": getattr(config, "default_refiner_switch", 0.5),
        "input_image_checkbox": False,
        "current_tab": "uov",
        "uov_method": getattr(flags, "disabled", "Disabled"),
        "uov_input_image": None,
        "outpaint_selections": [],
        "inpaint_input_image": None,
        "inpaint_additional_prompt": "",
        "inpaint_mask_image": None,
        "layer_methon": "",
        "layer_input_image": None,
        "iclight_enable": False,
        "iclight_source_radio": "",
        "disable_preview": False,
        "disable_intermediate_results": False,
        "disable_seed_increment": False,
        "black_out_nsfw": False,
        "adm_scaler_positive": getattr(config, "default_cfg_positive", 1.5),
        "adm_scaler_negative": getattr(config, "default_cfg_negative", 0.8),
        "adm_scaler_end": getattr(config, "default_cfg_end", 0.3),
        "adaptive_cfg": getattr(config, "default_cfg_tsnr", 7.0),
        "clip_skip": getattr(config, "default_clip_skip", 2),
        "sampler_name": getattr(config, "default_sampler", "dpmpp_2m_sde_gpu"),
        "scheduler_name": getattr(config, "default_scheduler", "karras"),
        "vae_name": getattr(config, "default_vae", getattr(flags, "default_vae", "Default (model)")),
        "overwrite_step": -1,
        "overwrite_switch": -1,
        "overwrite_width": -1,
        "overwrite_height": -1,
        "overwrite_vary_strength": -1,
        "overwrite_upscale_strength": -1,
        "mixing_image_prompt_and_vary_upscale": False,
        "mixing_image_prompt_and_inpaint": False,
        "debugging_cn_preprocessor": False,
        "skipping_cn_preprocessor": False,
        "canny_low_threshold": 64,
        "canny_high_threshold": 128,
        "refiner_swap_method": "joint",
        "controlnet_softness": 0.25,
        "freeu_enabled": False,
        "freeu_b1": 1.01,
        "freeu_b2": 1.02,
        "freeu_s1": 0.99,
        "freeu_s2": 0.95,
        "debugging_inpaint_preprocessor": False,
        "inpaint_disable_initial_latent": False,
        "inpaint_engine": "",
        "inpaint_strength": 1.0,
        "inpaint_respective_field": 1.0,
        "inpaint_advanced_masking_checkbox": False,
        "invert_mask_checkbox": False,
        "inpaint_erode_or_dilate": 0,
        "params_backend": {},
        "save_final_enhanced_image_only": False,
        "save_metadata_to_images": True,
        "metadata_scheme": "fooocus",
        "ip_ctrls": [],
        "debugging_dino": False,
        "dino_erode_or_dilate": 0,
        "debugging_enhance_masks_checkbox": False,
        "enhance_input_image": None,
        "enhance_checkbox": False,
        "enhance_uov_method": getattr(flags, "disabled", "Disabled"),
        "enhance_uov_strength": 0.5,
        "enhance_uov_processing_order": "",
        "enhance_uov_prompt_type": "",
        "enhance_ctrls": [],
    })
    return defaults


def _default_lora_controls(enabled_loras):
    controls = []
    by_index = {item.get("index"): item for item in enabled_loras if isinstance(item, dict)}
    for index in range(1, getattr(config, "default_max_lora_number", 10) + 1):
        item = by_index.get(index, {})
        model = item.get("model", "None")
        weight = item.get("weight", 1.0)
        enabled = str(model or "").strip().lower() not in ("", "none")
        controls.extend([enabled, model if enabled else "None", weight])
    return controls


def _args_list_from_defaults(defaults):
    args = [defaults.get(key) for key in api_params.all_args[:15]]
    args.extend(defaults.get("loras") or [])
    args.extend(defaults.get(key) for key in api_params.all_args[16:67])
    args.append(defaults.get("params_backend") or {})
    args.extend(defaults.get(key) for key in api_params.all_args[68:71])
    args.extend(defaults.get("ip_ctrls") or [])
    args.extend(defaults.get(key) for key in api_params.all_args[72:81])
    args.extend(defaults.get("enhance_ctrls") or [])
    return args


def _summarize_normalized_args(args_norm):
    summary = {
        "normalized_length": len(args_norm),
        "params_backend_type": None,
        "loras_count": None,
        "ip_ctrls_count": None,
        "enhance_ctrls_count": None,
    }
    try:
        params_index = api_params.all_args.index("params_backend")
        summary["params_backend_type"] = type(args_norm[params_index]).__name__
    except Exception:
        pass
    try:
        lora_index = api_params.all_args.index("loras")
        summary["loras_count"] = len(args_norm[lora_index] or [])
    except Exception:
        pass
    try:
        ip_index = api_params.all_args.index("ip_ctrls")
        summary["ip_ctrls_count"] = len(args_norm[ip_index] or [])
    except Exception:
        pass
    try:
        enhance_index = api_params.all_args.index("enhance_ctrls")
        summary["enhance_ctrls_count"] = len(args_norm[enhance_index] or [])
    except Exception:
        pass
    return summary


def build_canvas_async_args_dry_run(api_arg_overrides, enabled_loras, materialized_inputs):
    if api_params is None:
        return {"ok": False, "error": "simpleai_base.api_params is not available"}
    try:
        args = build_canvas_async_task_args(api_arg_overrides, enabled_loras, materialized_inputs)
        validation = validate_canvas_async_task_args(args)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}
    return {
        "ok": bool(validation.get("ok")),
        "error": validation.get("error"),
        "mode": "normalized_args_preview_no_async_task",
        "args_length": len(args),
        "normalized_arg_names_count": len(api_params.all_args),
        "normalized_summary": _summarize_normalized_args(args),
        "task_object_preview": validation.get("task_object_preview"),
        "arg_names": list(api_params.all_args),
    }


def build_canvas_async_task_args(api_arg_overrides, enabled_loras, materialized_inputs, load_images=False):
    if api_params is None:
        raise RuntimeError("simpleai_base.api_params is not available")
    defaults = _default_api_args()
    defaults.update(copy.deepcopy(api_arg_overrides))
    defaults["loras"] = _default_lora_controls(enabled_loras)
    # Only set ip_ctrls/enhance_ctrls defaults if not already provided by classic node
    if "ip_ctrls" not in api_arg_overrides:
        defaults["ip_ctrls"] = [None, 0.5, 0.6, "ImagePrompt"] * getattr(config, "default_controlnet_image_count", 4)
    if "enhance_ctrls" not in api_arg_overrides:
        defaults["enhance_ctrls"] = [False, "", "", "", "", "", 0.5, 0.5, 0, False, "", 0.5, 0.5, 0, False, ""] * getattr(config, "default_enhance_tabs", 3)

    # Load ip_ctrls images from paths if load_images=True
    if load_images and "ip_ctrls" in defaults:
        raw_ctrls = defaults["ip_ctrls"]
        if isinstance(raw_ctrls, list):
            loaded_ctrls = []
            ip_group_size = 4  # [image, stop, weight, type]
            for i in range(0, len(raw_ctrls), ip_group_size):
                group = raw_ctrls[i:i + ip_group_size]
                if len(group) < 4:
                    loaded_ctrls.extend(group)
                    continue
                image_ref = group[0]
                if isinstance(image_ref, str) and image_ref and os.path.exists(image_ref):
                    try:
                        group[0] = _load_image_array(image_ref, "RGB")
                    except Exception:
                        group[0] = None
                loaded_ctrls.extend(group)
            defaults["ip_ctrls"] = loaded_ctrls

    # Load uov/inpaint/enhance images from paths if load_images=True
    if load_images:
        materialized_by_slot = {item.get("slot"): item for item in materialized_inputs if isinstance(item, dict)}
        for img_key in ("uov_input_image", "inpaint_input_image", "inpaint_mask_image", "enhance_input_image"):
            val = defaults.get(img_key)
            if isinstance(val, str) and val and os.path.exists(val):
                try:
                    mode = "RGB"
                    image_array = _load_image_array(val, mode)
                    if img_key == "inpaint_input_image":
                        mask_ref = materialized_by_slot.get("inpaint_image", {}).get("mask_ref") or {}
                        mask_path = mask_ref.get("path") if isinstance(mask_ref, dict) else ""
                        if mask_path and os.path.exists(mask_path):
                            mask_array = _load_image_array(mask_path, "RGB")
                        else:
                            mask_array = np.zeros_like(image_array) if np is not None else image_array
                        defaults[img_key] = {"image": image_array, "mask": mask_array}
                    else:
                        defaults[img_key] = image_array
                except Exception:
                    defaults[img_key] = None

    params_backend = copy.deepcopy(defaults.get("params_backend") or {})
    params_backend = _clear_unmaterialized_scene_media_params(params_backend, materialized_inputs)
    for item in materialized_inputs:
        slot = item.get("slot")
        if slot:
            legacy_classic_enhance_source = (
                defaults.get("current_tab") == "enhance"
                and defaults.get("enhance_input_image") is not None
                and slot == "scene_canvas_image"
                and not params_backend.get("scene_frontend")
            )
            if legacy_classic_enhance_source:
                continue
            params_backend[slot] = _task_backend_value(item) if load_images else _normalization_backend_value(item)
            if slot == "scene_video":
                params_backend["scene_original_video_path"] = params_backend[slot]
                params_backend["active_video_source"] = "scene"
            elif slot == "sam3_input_video":
                params_backend["sam3_original_video_path"] = params_backend[slot]
                params_backend["active_video_source"] = "sam3"
    params_backend = _apply_scene_media_backend_aliases(params_backend)
    if load_images and params_backend.get("scene_frontend"):
        params_backend = _apply_workbench_scene_preprocess(params_backend, defaults)
        params_backend = _apply_scene_media_backend_aliases(params_backend)
    else:
        params_backend.pop("canvas_scene_schema", None)
    defaults["params_backend"] = params_backend

    raw_args = _args_list_from_defaults(defaults)
    return api_params.normalization(
        raw_args,
        getattr(config, "default_max_lora_number", 10),
        getattr(config, "default_controlnet_image_count", 4),
        getattr(config, "default_enhance_tabs", 3),
    )


def validate_canvas_async_task_args(args):
    try:
        import modules.async_worker as worker

        task = worker.AsyncTask(args=copy.deepcopy(args), task_id="canvas-dry-run-validation")
        return {
            "ok": True,
            "task_object_preview": {
                "task_id": task.task_id,
                "task_class": getattr(task, "task_class", None),
                "task_name": getattr(task, "task_name", None),
                "task_method": getattr(task, "task_method", None),
                "content_type": getattr(task, "content_type", None),
                "image_number": getattr(task, "image_number", None),
                "steps": getattr(task, "steps", None),
                "base_model_name": getattr(task, "base_model_name", None),
                "refiner_model_name": getattr(task, "refiner_model_name", None),
                "loras_count": len(getattr(task, "loras", []) or []),
                "scene_frontend": getattr(task, "scene_frontend", None),
                "has_scene_canvas_image": getattr(task, "scene_canvas_image", None) is not None,
                "has_scene_input_image1": getattr(task, "scene_input_image1", None) is not None,
                "has_scene_input_image2": getattr(task, "scene_input_image2", None) is not None,
                "has_scene_input_image3": getattr(task, "scene_input_image3", None) is not None,
                "has_scene_input_image4": getattr(task, "scene_input_image4", None) is not None,
            },
        }
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}


def _resolve_uov_denoise(uov_method, role):
    """Mirror main UI update_size_and_hires_fix logic.
    role='vary' returns overwrite_vary_strength, role='upscale' returns overwrite_upscale_strength.
    """
    method = uov_method or ""
    if role == "vary":
        if "Vary" in method or "Hires.fix" in method:
            return 0.85 if "Strong" in method or "Hires.fix" in method else 0.5
        return -1
    if role == "upscale":
        if "Upscale" in method and "Fast" not in method:
            return 0.2
        return -1
    return -1


def build_classic_task_args_preview(payload, materialized_inputs, state_params):
    """Build args preview for a classic (non-scene) preset node."""
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    params = preset_node.get("params") if isinstance(preset_node.get("params"), dict) else {}
    preset_defaults = _preset_prompt_defaults(preset_node)
    ip_params = preset_node.get("ip_params") if isinstance(preset_node.get("ip_params"), dict) else {}
    uov_params_node = preset_node.get("uov_params") if isinstance(preset_node.get("uov_params"), dict) else {}
    inpaint_params_node = preset_node.get("inpaint_params") if isinstance(preset_node.get("inpaint_params"), dict) else {}
    enhance_params_node = preset_node.get("enhance_params") if isinstance(preset_node.get("enhance_params"), dict) else {}
    models = _merged_config_values(_model_config(preset_node))
    resolution = _merged_config_values(_resolution_config(preset_node))
    generation = _merged_config_values(_generation_config(preset_node))
    styles_config = _merged_config_values(_styles_config(preset_node))
    identity = _state_identity(payload, state_params)

    def _classic_param(key, default=None, source=None):
        if source and isinstance(source, dict) and key in source:
            return source.get(key)
        if key in params:
            return params.get(key)
        for _src in (ip_params, uov_params_node, inpaint_params_node, enhance_params_node):
            if isinstance(_src, dict) and key in _src:
                return _src.get(key)
        return default

    enabled_loras = _enabled_loras(models)
    task_method = str(runtime.get("task_method") or "").strip()
    backend_engine_name = str(runtime.get("backend_engine") or "").strip()
    # Fallback: if task_method is empty, try to resolve from preset file
    if not task_method:
        try:
            preset_name = preset.get("name") or preset_node.get("title") or ""
            if preset_name:
                _content = config.try_get_preset_content(preset_name)
                if isinstance(_content, dict):
                    _de = _content.get("default_engine", {})
                    if isinstance(_de, dict):
                        _bp = _de.get("backend_params", {})
                        if isinstance(_bp, dict):
                            task_method = str(_bp.get("task_method") or "").strip()
                            logging.getLogger("canvas_classic").info(
                                f"task_method fallback resolved: {task_method!r} for {preset_name}")
        except Exception as _fb_err:
            logging.getLogger("canvas_classic").warning(f"task_method fallback failed: {_fb_err}")
    classic_mode = str(preset_node.get("classic_mode") or "t2i").strip()
    # Map classic mode to main UI current_tab
    mode_to_tab = {"t2i": "ip", "ip": "ip", "uov": "uov", "inpaint": "inpaint", "enhance": "enhance"}
    current_tab = mode_to_tab.get(classic_mode, "ip")

    # Resolve allowed IP control types matching main UI logic in topbar.update_after_identity_sub
    _engine = str(runtime.get("backend_engine") or "").lower()
    _tm_lower = task_method.lower() if task_method else ""
    if _engine in ('wan', 'qwen', 'z-image', 'zimage'):
        _default_ip_type = 'PyraCanny'
    elif _tm_lower in ('il_v_pre_aio', 'chenkin_noob_aio'):
        _default_ip_type = 'ImagePrompt'
    else:
        _default_ip_type = 'ImagePrompt'

    # Classic mode: skip asset fallback to avoid IP image dimensions overriding resolution
    aspect_ratio = _resolve_backend_aspect_ratio(resolution, params, materialized_inputs, skip_asset_fallback=True)
    aspect_size = _split_size_text(aspect_ratio)
    random_resolution = _resolution_random_aspect_enabled(resolution)
    image_seed = _resolve_seed(params)

    # Build params_backend for classic mode
    params_backend = {
        "backend_engine": runtime.get("backend_engine") or "",
        "preset": preset.get("name") or preset_node.get("title") or "",
        "task_method": task_method,
        "clip_model": models.get("clip_model") or models.get("clip") or "",
        "upscale_model": models.get("upscale_model") or "default",
        "keep_vlm_model_loaded": bool(payload.get("keep_vlm_model_loaded")),
        "nickname": identity["nickname"],
        "user_did": identity["user_did"],
        "engine_type": runtime.get("engine_type") or "image",
        "image_seed": image_seed,
        "random_aspect_ratio_checkbox": random_resolution,
    }
    logging.getLogger("canvas_workbench").info(
        "[VLM KeepLoaded] runner params classic run_id=%s task_method=%s keep_vlm_model_loaded=%s",
        payload.get("run_id"),
        task_method,
        params_backend.get("keep_vlm_model_loaded"),
    )
    params_backend.update(_scene_lora_backend_params(enabled_loras))
    director_runtime = _director_runtime_from_params(params)
    if director_runtime:
        params_backend["director_timeline"] = director_runtime
        params_backend["prompt_override"] = director_runtime.get("prompt_override", "")
        params_backend["director_prompt_override"] = director_runtime.get("prompt_override", "")

    # Materialize classic-specific inputs into params_backend
    materialized_by_slot = {item.get("slot"): item for item in materialized_inputs if isinstance(item, dict)}

    # Build ip_ctrls for IP/T2I mode
    # NOTE: Don't load numpy arrays here - use paths for preview, load in build_canvas_async_task_args(load_images=True)
    ip_count = int(preset_node.get("classic_ip_count") or ip_params.get("count") or 1)
    ip_ctrls = []
    # For T2I mode (no input images), input_image_checkbox should be False
    has_input_images = classic_mode != "t2i" and bool(ip_count) and any(
        materialized_by_slot.get(f"ip_image_{i}") for i in range(ip_count)
    )
    for i in range(getattr(config, "default_controlnet_image_count", 4)):
        if current_tab == "ip" and i < ip_count:
            slot_key = f"ip_image_{i}"
            item = materialized_by_slot.get(slot_key)
            image_path = None
            if item and item.get("asset_ref"):
                image_path = item["asset_ref"].get("path") or None
            ip_type = _classic_param(f"ip_type_{i}", _default_ip_type)
            ip_stop = float(_classic_param(f"ip_stop_{i}", 0.5))
            ip_weight = float(_classic_param(f"ip_weight_{i}", 1.0))
            ip_ctrls.extend([image_path, ip_stop, ip_weight, ip_type])
        else:
            ip_ctrls.extend([None, 0.5, 0.6, _default_ip_type])

    # Build UOV params
    uov_method = "Disabled"
    uov_input_image = None
    if current_tab == "uov":
        uov_method = _classic_param("uov_method", "Disabled") or uov_params_node.get("method") or "Disabled"
        item = materialized_by_slot.get("uov_image")
        if item and item.get("asset_ref") and item["asset_ref"].get("path"):
            uov_input_image = item["asset_ref"]["path"]  # path for preview

    # Build Inpaint params
    inpaint_input_image = None
    inpaint_mask_image = None
    outpaint_selections = []
    inpaint_strength = 1.0
    inpaint_respective_field = 0.618
    inpaint_engine = "None"
    inpaint_disable_initial_latent = False
    invert_mask_checkbox = False
    if current_tab == "inpaint":
        item = materialized_by_slot.get("inpaint_image")
        if item and item.get("asset_ref") and item["asset_ref"].get("path"):
            inpaint_input_image = item["asset_ref"]["path"]  # path for preview
        mask_item = materialized_by_slot.get("inpaint_mask")
        if mask_item and mask_item.get("asset_ref") and mask_item["asset_ref"].get("path"):
            inpaint_mask_image = mask_item["asset_ref"]["path"]  # path for preview
        outpaint_selections = _classic_param("outpaint_selections", []) or inpaint_params_node.get("outpaint") or []
        inpaint_strength = float(_classic_param("inpaint_denoising_strength", None) or _classic_param("inpaint_strength", 1.0) or inpaint_params_node.get("denoising_strength") or inpaint_params_node.get("strength") or 1.0)
        inpaint_respective_field = float(_classic_param("inpaint_respective_field", 0.618) or inpaint_params_node.get("respective_field") or 0.618)
        inpaint_mode_value = _classic_param("inpaint_mode", None) or inpaint_params_node.get("mode") or ""
        inpaint_engine_raw = _classic_param("inpaint_engine", None) or inpaint_params_node.get("engine") or None
        if _is_inpaint_detail_mode(inpaint_mode_value):
            inpaint_engine = "None"
        elif inpaint_engine_raw and inpaint_engine_raw != "None":
            inpaint_engine = _resolve_inpaint_engine_value(inpaint_engine_raw, task_method, backend_engine_name)
        else:
            inpaint_engine = _resolve_inpaint_engine_value(inpaint_engine_raw, task_method, backend_engine_name)
        inpaint_disable_initial_latent = _bool_value(_classic_param("inpaint_disable_initial_latent", None) or inpaint_params_node.get("disable_initial_latent"), False)
        invert_mask_checkbox = _bool_value(_classic_param("invert_mask", None) or inpaint_params_node.get("invert_mask"), False)

    # Build Enhance params
    enhance_input_image = None
    enhance_checkbox = False
    enhance_uov_method = getattr(flags, "disabled", "Disabled")
    enhance_uov_strength = 0.5
    enhance_uov_processing_order = getattr(flags, "enhancement_uov_before", "Before First Enhancement")
    enhance_uov_prompt_type = getattr(flags, "enhancement_uov_prompt_type_original", "Original Prompts")
    enhance_ctrls = None
    if current_tab == "enhance":
        enhance_checkbox = True
        item = materialized_by_slot.get("enhance_image") or materialized_by_slot.get("scene_canvas_image")
        if item and item.get("asset_ref") and item["asset_ref"].get("path"):
            enhance_input_image = item["asset_ref"]["path"]  # path for preview
        enhance_uov_method = (
            _classic_param("enhance_uov_method", None)
            or enhance_params_node.get("uov_method")
            or enhance_params_node.get("method")
            or getattr(flags, "disabled", "Disabled")
        )
        enhance_uov_strength = _float_value(
            _classic_param("enhance_uov_strength", None)
            or enhance_params_node.get("uov_strength")
            or enhance_params_node.get("strength")
            or 0.5,
            0.5
        )
        enhance_uov_processing_order = (
            _classic_param("enhance_uov_processing_order", None)
            or enhance_params_node.get("uov_processing_order")
            or getattr(flags, "enhancement_uov_before", "Before First Enhancement")
        )
        enhance_uov_prompt_type = (
            _classic_param("enhance_uov_prompt_type", None)
            or enhance_params_node.get("uov_prompt_type")
            or getattr(flags, "enhancement_uov_prompt_type_original", "Original Prompts")
        )

        region_defaults = [
            {"enabled": True, "dino_prompt": "face"},
            {"enabled": True, "dino_prompt": "hand"},
            {"enabled": True, "dino_prompt": "eye"},
        ]
        region_sources = enhance_params_node.get("regions") if isinstance(enhance_params_node.get("regions"), list) else []

        def _region_value(index, key, default=None):
            prefix = f"enhance_region_{index + 1}_{key}"
            source = region_sources[index] if index < len(region_sources) and isinstance(region_sources[index], dict) else {}
            if prefix in params:
                return params.get(prefix)
            if key in source:
                return source.get(key)
            return default

        enhance_ctrls = []
        for index in range(getattr(config, "default_enhance_tabs", 3)):
            defaults_region = region_defaults[index] if index < len(region_defaults) else {"enabled": False, "dino_prompt": ""}
            enabled = _bool_value(_region_value(index, "enabled", defaults_region.get("enabled", False)), False)
            enhance_ctrls.extend([
                enabled,
                str(_region_value(index, "dino_prompt", defaults_region.get("dino_prompt", "")) or ""),
                str(_region_value(index, "prompt", "") or ""),
                str(_region_value(index, "negative_prompt", "") or ""),
                str(_region_value(index, "mask_model", "sam") or "sam"),
                str(_region_value(index, "mask_cloth_category", "full") or "full"),
                str(_region_value(index, "mask_sam_model", "vit_b") or "vit_b"),
                _float_value(_region_value(index, "mask_text_threshold", 0.25), 0.25),
                _float_value(_region_value(index, "mask_box_threshold", 0.3), 0.3),
                _int_value(_region_value(index, "mask_sam_max_detections", 0), 0),
                _bool_value(_region_value(index, "inpaint_disable_initial_latent", False), False),
                _resolve_inpaint_engine_value(
                    str(_region_value(index, "inpaint_engine", "None") or "None"),
                    task_method,
                    backend_engine_name,
                    prefer_none=True,
                ),
                _float_value(_region_value(index, "inpaint_strength", 0.5), 0.5),
                _float_value(_region_value(index, "inpaint_respective_field", 0.2), 0.2),
                _int_value(_region_value(index, "inpaint_erode_or_dilate", 0), 0),
                _bool_value(_region_value(index, "mask_invert", False), False),
            ])

    classic_image_number = _positive_int(_classic_param("image_number", generation.get("image_number") or 1)) or 1
    if current_tab == "ip":
        classic_input_image_checkbox = bool(has_input_images)
    elif current_tab == "uov":
        classic_input_image_checkbox = bool(uov_input_image)
    elif current_tab == "inpaint":
        classic_input_image_checkbox = bool(inpaint_input_image)
    elif current_tab == "enhance":
        classic_input_image_checkbox = bool(enhance_input_image)
    else:
        classic_input_image_checkbox = False
    params_backend["current_tab"] = current_tab
    params_backend["input_image_checkbox"] = classic_input_image_checkbox
    configured_styles = _style_config_selection(styles_config)
    classic_styles = _style_list(_classic_param("style_selections", None))
    if not classic_styles:
        classic_styles = configured_styles if configured_styles is not None else (
            _style_list(generation.get("style_selections"))
            or preset_defaults["default_styles"]
            or list(getattr(config, "default_styles", []) or [])
        )
    classic_negative_prompt = _classic_param("negative_prompt", "")
    if not str(classic_negative_prompt or "").strip():
        classic_negative_prompt = preset_defaults["default_prompt_negative"]
    classic_prompt = _classic_param("prompt", "")
    if not str(classic_prompt or "").strip():
        classic_prompt = preset_defaults["default_prompt"]
    if director_runtime and director_runtime.get("prompt_override"):
        classic_prompt = director_runtime.get("prompt_override")

    api_arg_overrides = {
        "prompt": classic_prompt,
        "negative_prompt": classic_negative_prompt,
        "style_selections": classic_styles,
        "current_tab": current_tab,
        "input_image_checkbox": classic_input_image_checkbox,
        "aspect_ratios_selection": aspect_ratio,
        "image_number": classic_image_number,
        "image_seed": image_seed,
        "base_model": models.get("base_model") or "",
        "refiner_model": models.get("refiner_model") or "None",
        "vae_name": models.get("vae") or "Default (model)",
        "overwrite_step": int(float(generation.get("overwrite_step") or -1)) if generation.get("overwrite_step") is not None else -1,
        "overwrite_width": -1 if random_resolution else (_effective_resolution_values(resolution)["width"] if _positive_int(resolution.get("width")) else -1),
        "overwrite_height": -1 if random_resolution else (_effective_resolution_values(resolution)["height"] if _positive_int(resolution.get("height")) else -1),
        "random_aspect_ratio_checkbox": random_resolution,
        "resolution_quantize_step": resolution.get("quantize") or getattr(flags, "default_resolution_quantize_step", 8),
        "resolution_multiplier": _resolution_multiplier(resolution),
        "resolution_edit_mode": _resolution_edit_mode(resolution),
        "ip_ctrls": ip_ctrls,
        "uov_method": uov_method,
        "uov_input_image": uov_input_image,
        "overwrite_vary_strength": _resolve_uov_denoise(uov_method, "vary"),
        "overwrite_upscale_strength": _resolve_uov_denoise(uov_method, "upscale"),
        "hires_fix_stop": float(_classic_param("hires_fix_stop", 0.8)),
        "hires_fix_weight": float(_classic_param("hires_fix_weight", 0.5)),
        "hires_fix_blurred": float(_classic_param("hires_fix_blurred", 0.0)),
        "inpaint_input_image": inpaint_input_image,
        "inpaint_mask_image": inpaint_mask_image,
        "outpaint_selections": outpaint_selections,
        "inpaint_strength": inpaint_strength,
        "inpaint_respective_field": inpaint_respective_field,
        "inpaint_engine": inpaint_engine,
        "inpaint_disable_initial_latent": inpaint_disable_initial_latent,
        "inpaint_advanced_masking_checkbox": bool(inpaint_mask_image) or _bool_value(_classic_param("inpaint_advanced_masking_checkbox"), False),
        "invert_mask_checkbox": invert_mask_checkbox,
        "inpaint_additional_prompt": _classic_param("inpaint_additional_prompt", ""),
        "enhance_input_image": enhance_input_image,
        "enhance_checkbox": enhance_checkbox,
        "enhance_uov_method": enhance_uov_method,
        "enhance_uov_strength": enhance_uov_strength,
        "enhance_uov_processing_order": enhance_uov_processing_order,
        "enhance_uov_prompt_type": enhance_uov_prompt_type,
        "mixing_image_prompt_and_vary_upscale": _bool_value(_classic_param("mixing_image_prompt_and_vary_upscale"), False),
        "mixing_image_prompt_and_inpaint": _bool_value(_classic_param("mixing_image_prompt_and_inpaint"), False),
        "params_backend": params_backend,
    }
    if enhance_ctrls is not None:
        api_arg_overrides["enhance_ctrls"] = enhance_ctrls
    api_arg_overrides.update(_generation_api_overrides(generation))
    api_arg_overrides["current_tab"] = current_tab
    api_arg_overrides["input_image_checkbox"] = classic_input_image_checkbox

    # Debug: log key classic params
    _dbg = logging.getLogger("canvas_classic")
    _dbg.info(f"classic_run: task_method={task_method!r}, backend_engine={runtime.get('backend_engine')!r}, "
              f"current_tab={current_tab!r}, preset={preset.get('name')!r}, "
              f"params_backend_keys={list(params_backend.keys())}")

    async_args_preview = build_canvas_async_args_dry_run(api_arg_overrides, enabled_loras, materialized_inputs)

    warnings = []
    if not task_method:
        warnings.append("task_method is empty")
    if current_tab == "ip" and ip_count > 0:
        connected_ip = sum(1 for i in range(ip_count) if materialized_by_slot.get(f"ip_image_{i}"))
        if connected_ip == 0:
            warnings.append(f"IP mode: {ip_count} slot(s) declared but none connected")
    if current_tab == "uov" and not materialized_by_slot.get("uov_image"):
        warnings.append("UOV mode: no source image connected")
    if current_tab == "inpaint" and not materialized_by_slot.get("inpaint_image"):
        warnings.append("Inpaint mode: no source image connected")
    if current_tab == "enhance" and not (
        materialized_by_slot.get("enhance_image") or materialized_by_slot.get("scene_canvas_image")
    ):
        warnings.append("Enhance mode: no source image connected")
    if director_runtime and not director_runtime.get("prompt_override"):
        warnings.append("director prompt_override is empty")

    effective_resolution_preview = (
        _effective_resolution_values(resolution)
        if resolution and not random_resolution and _positive_int(resolution.get("width")) and _positive_int(resolution.get("height"))
        else {}
    )

    return {
        "contract": {
            "api_all_args_count": len(api_params.all_args) if api_params is not None else None,
            "api_backend_args_count": len(api_params.backend_args) if api_params is not None else None,
            "params_backend_index": api_params.all_args.index("params_backend") if api_params is not None and "params_backend" in api_params.all_args else None,
            "mode": "classic_preview",
        },
        "node_type": "classic",
        "classic_mode": classic_mode,
        "current_tab": current_tab,
        "api_arg_overrides": api_arg_overrides,
        "async_args_preview": async_args_preview,
        "params_backend_preview": params_backend,
        "models_preview": {
            "base_model": models.get("base_model") or "",
            "refiner_model": models.get("refiner_model") or "None",
            "clip_model": models.get("clip_model") or models.get("clip") or "",
            "vae": models.get("vae") or "Default (model)",
            "upscale_model": models.get("upscale_model") or "default",
            "enabled_loras": enabled_loras,
        },
        "resolution_preview": copy.deepcopy(resolution),
        "generation_preview": copy.deepcopy(generation),
        "director_preview": copy.deepcopy(director_runtime),
        "effective_resolution_preview": effective_resolution_preview,
        "resolved_aspect_ratio": aspect_ratio,
        "resolved_seed": image_seed,
        "resolved_size": {
            "width": aspect_size[0] if aspect_size else None,
            "height": aspect_size[1] if aspect_size else None,
        },
        "warnings": warnings,
    }


def build_canvas_task_args_preview(payload, materialized_inputs, state_params):
    payload, profile_error = _payload_with_parameter_profile(payload, state_params)
    if profile_error:
        raise ValueError(profile_error.get("error") or "parameter profile is unavailable")
    # Dispatch to classic builder if node_type is classic
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    if str(preset_node.get("node_type") or "").strip() == "classic" or str(preset_node.get("type") or "").strip() == "classic":
        return build_classic_task_args_preview(payload, materialized_inputs, state_params)

    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    params = preset_node.get("params") if isinstance(preset_node.get("params"), dict) else {}
    preset_defaults = _preset_prompt_defaults(preset_node)
    models = _merged_config_values(_model_config(preset_node))
    resolution = _merged_config_values(_resolution_config(preset_node))
    generation = _merged_config_values(_generation_config(preset_node))
    generation_api_overrides = _generation_api_overrides(generation)
    styles_config = _merged_config_values(_styles_config(preset_node))
    scene_defaults = _scene_theme_defaults(preset_node, runtime)
    scene_params = {**scene_defaults, **params}
    identity = _state_identity(payload, state_params)

    enabled_loras = _enabled_loras(models)
    scene_frontend = _scene_frontend_value(preset_node, runtime)
    task_method = _scene_task_method(runtime, scene_frontend)
    scene_theme = runtime.get("scene_theme") or ""
    aspect_ratio = _resolve_backend_aspect_ratio(resolution, scene_params, materialized_inputs)
    random_resolution = _resolution_random_aspect_enabled(resolution)
    scene_image_number = _positive_int(generation_api_overrides.get("image_number")) or _positive_int(_scene_param(params, scene_defaults, "scene_image_number")) or 1
    scene_steps = _positive_int(generation_api_overrides.get("overwrite_step"))
    if scene_steps is None:
        scene_steps = _positive_int(_scene_param(params, scene_defaults, "overwrite_step"))
    if scene_steps is None:
        scene_steps = _positive_int(_scene_param(params, scene_defaults, "scene_steps"))
    image_seed = _resolve_seed(scene_params)

    params_backend = {
        "backend_engine": runtime.get("backend_engine") or "",
        "preset": preset.get("name") or preset_node.get("title") or "",
        "task_method": task_method,
        "upscale_model": models.get("upscale_model") or "default",
        "keep_vlm_model_loaded": bool(payload.get("keep_vlm_model_loaded")),
        "nickname": identity["nickname"],
        "user_did": identity["user_did"],
        "engine_type": runtime.get("engine_type") or "image",
        "scene_frontend": scene_frontend,
        "scene_theme": scene_theme,
        "scene_aspect_ratio": aspect_ratio,
        "random_aspect_ratio_checkbox": random_resolution,
        "scene_image_number": scene_image_number,
        "scene_steps": scene_steps,
        "image_seed": image_seed,
        "scene_additional_prompt": _combined_scene_additional_prompt(params, scene_defaults),
        "scene_additional_prompt_2": _scene_param(params, scene_defaults, "scene_additional_prompt_2", ""),
        "clip_model": models.get("clip_model") or models.get("clip") or "",
        "scene_base_model": models.get("base_model") or "",
        "scene_refiner_model": models.get("refiner_model") or "",
        "canvas_scene_schema": copy.deepcopy(preset_node.get("schema") or {}),
    }
    logging.getLogger("canvas_workbench").info(
        "[VLM KeepLoaded] runner params scene run_id=%s task_method=%s keep_vlm_model_loaded=%s",
        payload.get("run_id"),
        task_method,
        params_backend.get("keep_vlm_model_loaded"),
    )
    params_backend.update(_scene_lora_backend_params(enabled_loras))
    if scene_steps is not None:
        params_backend["steps"] = scene_steps
    if generation_api_overrides.get("guidance_scale") is not None:
        params_backend["cfg"] = generation_api_overrides.get("guidance_scale")
    if generation_api_overrides.get("sampler_name") is not None:
        params_backend["sampler"] = generation_api_overrides.get("sampler_name")
    if generation_api_overrides.get("scheduler_name") is not None:
        params_backend["scheduler"] = generation_api_overrides.get("scheduler_name")
    aspect_size = _split_size_text(aspect_ratio)

    for index in range(1, 11):
        suffix = "" if index == 1 else str(index)
        key = f"scene_var_number{suffix}"
        if key in scene_params:
            value = scene_params.get(key)
            params_backend[key] = _number_value(value)
    if "scene_video_duration" in scene_params:
        params_backend["scene_video_duration"] = _number_value(scene_params.get("scene_video_duration"))
    for index in range(1, 5):
        key = f"scene_switch_option{index}"
        if key in scene_params:
            params_backend[key] = scene_params.get(key)

    params_backend = _clear_unmaterialized_scene_media_params(params_backend, materialized_inputs)
    input_backend = {}
    for item in materialized_inputs:
        slot = item.get("slot")
        if slot:
            input_backend[slot] = _input_backend_value(item)
            params_backend[slot] = input_backend[slot]
            if slot == "scene_video":
                params_backend["scene_original_video_path"] = input_backend[slot]
                params_backend["active_video_source"] = "scene"
            elif slot == "sam3_input_video":
                params_backend["sam3_original_video_path"] = input_backend[slot]
                params_backend["active_video_source"] = "sam3"
    params_backend = _apply_scene_media_backend_aliases(params_backend)
    director_runtime = _director_runtime_from_params(params)
    if director_runtime:
        params_backend["director_timeline"] = director_runtime
        params_backend["prompt_override"] = director_runtime.get("prompt_override", "")
        params_backend["director_prompt_override"] = director_runtime.get("prompt_override", "")

    if resolution:
        resolution_size = _split_size_text(aspect_ratio)
        effective_resolution = _effective_resolution_values({
            **resolution,
            "width": (resolution_size[0] if random_resolution and resolution_size else resolution.get("width") if _positive_int(resolution.get("width")) else (resolution_size[0] if resolution_size else None)),
            "height": (resolution_size[1] if random_resolution and resolution_size else resolution.get("height") if _positive_int(resolution.get("height")) else (resolution_size[1] if resolution_size else None)),
        })
        params_backend["canvas_resolution"] = {
            "template": resolution.get("template"),
            "aspect_ratio": resolution.get("aspect_ratio"),
            "random_aspect_ratio": random_resolution,
            "resolved_aspect_ratio": aspect_ratio,
            "width": effective_resolution["base_width"],
            "height": effective_resolution["base_height"],
            "effective_width": effective_resolution["width"],
            "effective_height": effective_resolution["height"],
            "quantize": resolution.get("quantize"),
            "multiplier": effective_resolution["multiplier"],
            "edit_mode": resolution.get("edit_mode"),
            "ratio_lock": resolution.get("ratio_lock"),
            "ratio_lock_value": resolution.get("ratio_lock_value"),
            "ratio_lock_custom": resolution.get("ratio_lock_custom"),
            "profile": {
                key: copy.deepcopy((resolution.get("profile") if isinstance(resolution.get("profile"), dict) else resolution).get(key))
                for key in (
                    "mode",
                    "source",
                    "frontend_preprocess",
                    "preprocess_target",
                    "preprocess_fit",
                    "preserve_audio",
                )
                if key in resolution
            },
        }

    configured_styles = _style_config_selection(styles_config)
    scene_styles = _style_list(params.get("style_selections"))
    if not scene_styles:
        scene_styles = configured_styles if configured_styles is not None else (
            _style_list(generation.get("style_selections"))
            or preset_defaults["default_styles"]
            or list(getattr(config, "default_styles", []) or [])
        )
    scene_negative_prompt = params.get("negative_prompt", "")
    if not str(scene_negative_prompt or "").strip():
        scene_negative_prompt = preset_defaults["default_prompt_negative"]
    params_backend["negative_prompt"] = scene_negative_prompt
    scene_prompt = params.get("prompt", "")
    if not str(scene_prompt or "").strip():
        scene_prompt = preset_defaults["default_prompt"]
    if director_runtime and director_runtime.get("prompt_override"):
        scene_prompt = director_runtime.get("prompt_override")

    api_arg_overrides = {
        "prompt": scene_prompt,
        "negative_prompt": scene_negative_prompt,
        "style_selections": scene_styles,
        "aspect_ratios_selection": aspect_ratio,
        "image_number": scene_image_number,
        "image_seed": image_seed,
        "base_model": models.get("base_model") or "",
        "refiner_model": models.get("refiner_model") or "None",
        "vae_name": models.get("vae") or "Default (model)",
        "overwrite_step": scene_steps if scene_steps is not None else -1,
        "overwrite_width": -1 if random_resolution else (_effective_resolution_values(resolution)["width"] if _positive_int(resolution.get("width")) else -1),
        "overwrite_height": -1 if random_resolution else (_effective_resolution_values(resolution)["height"] if _positive_int(resolution.get("height")) else -1),
        "random_aspect_ratio_checkbox": random_resolution,
        "resolution_quantize_step": resolution.get("quantize") or getattr(flags, "default_resolution_quantize_step", 8),
        "resolution_multiplier": _resolution_multiplier(resolution),
        "resolution_edit_mode": _resolution_edit_mode(resolution),
        "params_backend": params_backend,
    }
    api_arg_overrides.update(generation_api_overrides)
    if scene_image_number:
        api_arg_overrides["image_number"] = scene_image_number
    if scene_steps is not None:
        api_arg_overrides["overwrite_step"] = scene_steps
    async_args_preview = build_canvas_async_args_dry_run(api_arg_overrides, enabled_loras, materialized_inputs)

    warnings = []
    if not params_backend["task_method"]:
        warnings.append("task_method is empty")
    if scene_frontend and not aspect_ratio:
        warnings.append("scene_aspect_ratio is empty")
    if not materialized_inputs:
        warnings.append("no upload inputs connected")
    if director_runtime and not director_runtime.get("prompt_override"):
        warnings.append("director prompt_override is empty")

    effective_resolution_preview = (
        _effective_resolution_values(resolution)
        if resolution and not random_resolution and _positive_int(resolution.get("width")) and _positive_int(resolution.get("height"))
        else {}
    )

    return {
        "contract": {
            "api_all_args_count": len(api_params.all_args) if api_params is not None else None,
            "api_backend_args_count": len(api_params.backend_args) if api_params is not None else None,
            "params_backend_index": api_params.all_args.index("params_backend") if api_params is not None and "params_backend" in api_params.all_args else None,
            "mode": "preview_only_no_async_task",
        },
        "api_arg_overrides": api_arg_overrides,
        "async_args_preview": async_args_preview,
        "params_backend_preview": params_backend,
        "input_backend_preview": input_backend,
        "models_preview": {
            "base_model": models.get("base_model") or "",
            "refiner_model": models.get("refiner_model") or "None",
            "clip_model": models.get("clip_model") or models.get("clip") or "",
            "vae": models.get("vae") or "Default (model)",
            "upscale_model": models.get("upscale_model") or "default",
            "enabled_loras": enabled_loras,
        },
        "resolution_preview": copy.deepcopy(resolution),
        "generation_preview": copy.deepcopy(generation),
        "director_preview": copy.deepcopy(director_runtime),
        "effective_resolution_preview": effective_resolution_preview,
        "resolved_aspect_ratio": aspect_ratio,
        "resolved_seed": image_seed,
        "resolved_size": {
            "width": aspect_size[0] if aspect_size else None,
            "height": aspect_size[1] if aspect_size else None,
        },
        "warnings": warnings,
    }


def _materialize_run_inputs(payload, state_params):
    project_id = payload.get("project_id") or "default"
    asset_sources = payload.get("asset_sources") if isinstance(payload.get("asset_sources"), dict) else {}
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    embedded_sources = preset_node.get("upload_slot_sources") if isinstance(preset_node.get("upload_slot_sources"), dict) else {}
    if embedded_sources:
        asset_sources = {**embedded_sources, **asset_sources}
    materialized_inputs = []
    errors = []
    for index, slot in enumerate(_ordered_upload_slots(asset_sources), start=1):
        source = asset_sources.get(slot)
        resolved = canvas_workbench_assets.materialize_node_asset(project_id, state_params, source)
        if not resolved.get("ok"):
            errors.append({"slot": slot, "node_id": resolved.get("node_id"), "error": resolved.get("error")})
        materialized_inputs.append({
            "slot": slot,
            "backend_field": slot,
            "image_order": index,
            "source_node": _compact_node(source),
            "asset_ref": resolved.get("asset_ref"),
            "mask_ref": resolved.get("mask_ref"),
        })
    return materialized_inputs, errors


def _build_task_preview(preset_node, materialized_inputs):
    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    params = preset_node.get("params") if isinstance(preset_node.get("params"), dict) else {}
    preset_defaults = _preset_prompt_defaults(preset_node)
    prompt = params.get("prompt", "")
    if not str(prompt or "").strip():
        prompt = preset_defaults["default_prompt"]
    negative_prompt = params.get("negative_prompt", "")
    if not str(negative_prompt or "").strip():
        negative_prompt = preset_defaults["default_prompt_negative"]
    scene_frontend = _scene_frontend_value(preset_node, runtime)
    task_method = _scene_task_method(runtime, scene_frontend)
    return {
        "preset": preset.get("name") or preset_node.get("title") or "",
        "display_name": preset.get("display_name") or preset_node.get("title") or "",
        "backend_engine": runtime.get("backend_engine") or "",
        "engine_type": runtime.get("engine_type") or "image",
        "scene_frontend": scene_frontend,
        "scene_theme": runtime.get("scene_theme") or "",
        "task_method": task_method,
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "scene_steps": params.get("scene_steps"),
        "scene_image_number": params.get("scene_image_number"),
        "upload_fields": [item["backend_field"] for item in materialized_inputs],
    }


def dry_run_node(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    payload, profile_error = _payload_with_parameter_profile(payload, state_params)
    if profile_error:
        return profile_error

    run_id = payload.get("run_id") or ""
    placeholder_node_id = payload.get("placeholder_node_id") or ""
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    materialized_inputs, errors = _materialize_run_inputs(payload, state_params)

    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    params = preset_node.get("params") if isinstance(preset_node.get("params"), dict) else {}

    task_preview = _build_task_preview(preset_node, materialized_inputs)
    task_args_preview = build_canvas_task_args_preview(payload, materialized_inputs, state_params)
    async_args_preview = task_args_preview.get("async_args_preview") if isinstance(task_args_preview, dict) else {}
    if isinstance(async_args_preview, dict) and not async_args_preview.get("ok"):
        errors.append({"slot": "async_task_args", "node_id": preset_node.get("id"), "error": async_args_preview.get("error") or "AsyncTask args validation failed"})

    return {
        "ok": not errors,
        "dry_run": True,
        "run_id": run_id,
        "placeholder_node_id": placeholder_node_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "task_preview": task_preview,
        "task_args_preview": task_args_preview,
        "materialized_inputs": materialized_inputs,
        "models_config": _model_config(preset_node),
        "styles_config": _styles_config(preset_node),
        "resolution_config": _resolution_config(preset_node),
        "generation_config": _generation_config(preset_node),
        "params": copy.deepcopy(params),
        "errors": errors,
    }


def _cleanup_runs(now=None):
    now = now or time.time()
    with CANVAS_RUNS_LOCK:
        stale = [
            run_id for run_id, record in CANVAS_RUNS.items()
            if now - float(record.get("updated_ts") or record.get("created_ts") or now) > CANVAS_RUN_RETENTION_SECONDS
        ]
        for run_id in stale:
            CANVAS_RUNS.pop(run_id, None)


def _image_like_to_pil_image(value):
    if Image is None or np is None:
        return None
    try:
        if isinstance(value, str):
            if os.path.exists(value):
                image = Image.open(value)
            else:
                return None
        elif isinstance(value, Image.Image):
            image = value
        else:
            if hasattr(value, "detach") and hasattr(value, "cpu"):
                array = np.asarray(value.detach().cpu().numpy())
            elif hasattr(value, "shape"):
                array = np.asarray(value)
            else:
                return None
            while array.ndim > 3:
                array = array[0]
            if array.ndim == 3 and array.shape[0] in (1, 3, 4) and array.shape[-1] not in (1, 3, 4):
                array = np.moveaxis(array, 0, -1)
            if array.ndim == 3 and array.shape[-1] == 1:
                array = array[..., 0]
            if array.ndim == 3 and array.shape[-1] > 4:
                array = array[..., :3]
            if array.ndim not in (2, 3):
                return None
            if np.issubdtype(array.dtype, np.floating):
                finite = array[np.isfinite(array)]
                max_value = float(finite.max()) if finite.size else 1.0
                min_value = float(finite.min()) if finite.size else 0.0
                if min_value < 0.0:
                    array = (array + 1.0) * 0.5
                    max_value = 1.0
                if max_value <= 1.0:
                    array = array * 255.0
                array = np.clip(array, 0, 255).astype("uint8")
            elif array.dtype != np.uint8:
                array = np.clip(array, 0, 255).astype("uint8")
            image = Image.fromarray(array)
        return image.convert("RGB")
    except Exception:
        return None


def _image_like_to_preview_frame(value, max_side=768):
    image = _image_like_to_pil_image(value)
    if image is None:
        return None
    try:
        source_width, source_height = image.size
        resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", None) or getattr(Image, "LANCZOS", 1)
        image.thumbnail((max_side, max_side), resample)
        width, height = image.size
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=82)
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        data_url = f"data:image/jpeg;base64,{encoded}"
        return {
            "kind": "sampling_preview",
            "data_url": data_url,
            "thumb": data_url,
            "width": width,
            "height": height,
            "source_width": source_width,
            "source_height": source_height,
        }
    except Exception:
        return None


def _image_like_to_data_url(value, max_side=768):
    frame = _image_like_to_preview_frame(value, max_side=max_side)
    return frame.get("data_url") if isinstance(frame, dict) else None


def _output_asset_mime(value, record=None):
    mime = str(mimetypes.guess_type(str(value or ""))[0] or "").strip().lower()
    if mime:
        return mime
    task = record.get("task") if isinstance(record, dict) else None
    content_type = str(getattr(task, "content_type", "") or "").strip().lower()
    if content_type == "video":
        return "video/mp4"
    if content_type == "image":
        return "image/png"
    return ""


def _output_asset(value, record=None):
    if isinstance(value, str):
        name = os.path.basename(value)
        mime = _output_asset_mime(value, record)
        is_video = mime.startswith("video/")
        asset_ref = None
        if not (isinstance(record, dict) and record.get("result_asset_scope") == "gallery"):
            try:
                task = record.get("task") if isinstance(record, dict) else None
                asset_ref = canvas_workbench_assets.register_existing_file_asset(
                    value,
                    (record or {}).get("project_id") or "default",
                    (record or {}).get("state_params") if isinstance((record or {}).get("state_params"), dict) else {},
                    node_id=(record or {}).get("placeholder_node_id") or "",
                    role="output",
                    metadata={"owner": getattr(task, "user_did", None) or ""},
                )
                if asset_ref and isinstance(record, dict) and asset_ref.get("copied_to_assets"):
                    _add_run_event(record, "info", "Output copied into canvas asset directory.", {
                        "asset_id": asset_ref.get("asset_id"),
                        "path": asset_ref.get("path"),
                        "output_path": asset_ref.get("output_path"),
                    })
            except Exception:
                asset_ref = None
        if not asset_ref:
            asset_ref = {
                "kind": "video" if is_video else "generated_file",
                "asset_id": value,
                "path": value,
                "output_path": value,
                "name": name,
            }
        if mime and not asset_ref.get("mime"):
            asset_ref["mime"] = mime
        if is_video and not asset_ref.get("kind"):
            asset_ref["kind"] = "video"
        preview_path = asset_ref.get("path") or value
        asset_ref["preview_url"] = f"/gradio_api/file={quote(preview_path, safe=':/')}" if os.path.exists(preview_path) else ""
        asset_ref["name"] = asset_ref.get("name") or name
        return asset_ref
    data_url = _image_like_to_data_url(value)
    if data_url:
        return {"kind": "generated_preview", "data_url": data_url, "thumb": data_url}
    return None


def _normalize_percent(value):
    try:
        number = float(value)
    except Exception:
        return None
    if number > 1:
        number = number / 100.0
    return max(0.0, min(1.0, number))


def _preview_batch_key(message):
    text = str(message or "").strip()
    try:
        from modules import html

        status = html.parse_generation_progress_text(text)
    except Exception:
        status = {}
    step = status.get("step")
    if step is not None:
        total_steps = status.get("total_steps") or ""
        image_index = status.get("image_index")
        image_count = status.get("image_count")
        image_key = f"|image:{image_index}/{image_count}" if image_index is not None and image_count is not None else ""
        return f"sampling:{step}/{total_steps}{image_key}"
    return text


def _preview_from_product(product):
    try:
        percentage, title, image = product
    except Exception:
        return {}
    preview = _image_like_to_preview_frame(image) if image is not None else None
    message = str(title or "")
    return {
        "percent": _normalize_percent(percentage),
        "message": message,
        "step_key": _preview_batch_key(message),
        "preview": preview,
    }


def _is_video_preview_record(record):
    task = record.get("task") if isinstance(record, dict) else None
    if getattr(task, "content_type", None) == "video":
        return True
    task_preview = record.get("task_preview") if isinstance(record.get("task_preview"), dict) else {}
    engine_type = str(task_preview.get("engine_type") or task_preview.get("content_type") or "").lower()
    return engine_type == "video"


def _append_preview_stream_frame(record, preview_payload):
    if not isinstance(record, dict) or not isinstance(preview_payload, dict):
        return
    frame = preview_payload.get("preview")
    if not isinstance(frame, dict):
        return
    src = frame.get("data_url") or frame.get("thumb")
    if not src:
        return

    message = str(preview_payload.get("message") or "")
    step_key = str(preview_payload.get("step_key") or _preview_batch_key(message) or message)
    previous_step_key = str(record.get("preview_step_key") or "")
    if step_key and step_key != previous_step_key:
        record["preview_frames"] = []
        record["preview_step_key"] = step_key
    elif not previous_step_key:
        record["preview_step_key"] = step_key

    try:
        serial = int(record.get("preview_serial") or 0) + 1
    except Exception:
        serial = 1

    next_frame = copy.deepcopy(frame)
    next_frame["serial"] = serial
    next_frame["step_key"] = record.get("preview_step_key") or step_key or message
    if preview_payload.get("percent") is not None:
        next_frame["percent"] = preview_payload.get("percent")
    next_frame["created_at"] = _iso_from_ts(time.time())

    frames = record.setdefault("preview_frames", [])
    if not isinstance(frames, list):
        frames = []
        record["preview_frames"] = frames
    frames.append(next_frame)
    if len(frames) > PREVIEW_STREAM_MAX_FRAMES:
        del frames[:-PREVIEW_STREAM_MAX_FRAMES]
    record["preview_serial"] = serial


def _public_preview_stream(record, after_preview_serial=None):
    if not isinstance(record, dict):
        return None
    frames = record.get("preview_frames")
    if not isinstance(frames, list):
        frames = []
    try:
        after_serial = int(after_preview_serial or 0)
    except Exception:
        after_serial = 0
    try:
        latest_serial = int(record.get("preview_serial") or 0)
    except Exception:
        latest_serial = 0
    delta = []
    for frame in frames:
        if not isinstance(frame, dict):
            continue
        try:
            frame_serial = int(frame.get("serial") or 0)
        except Exception:
            frame_serial = 0
        if frame_serial > after_serial:
            delta.append(copy.deepcopy(frame))
    if len(delta) > PREVIEW_STREAM_DELTA_MAX_FRAMES:
        delta = delta[-PREVIEW_STREAM_DELTA_MAX_FRAMES:]
    if not latest_serial and not delta:
        return None
    return {
        "kind": "frame_stream",
        "media_type": "video_sampling" if _is_video_preview_record(record) else "image_sampling",
        "fps": PREVIEW_STREAM_FPS,
        "step_key": record.get("preview_step_key") or "",
        "latest_serial": latest_serial,
        "frames_delta": delta,
        "frame_count": len(frames),
    }


def _apply_task_yields(record):
    task = record.get("task")
    if task is None:
        return
    while getattr(task, "yields", None):
        flag, product = task.yields.pop(0)
        record["last_yield"] = flag
        record["updated_ts"] = time.time()
        _add_run_event(record, "debug", f"Yield: {flag}")
        if flag == "status":
            record["state"] = "running"
            record["message"] = str(product or "Running")
        elif flag == "preview":
            preview = _preview_from_product(product)
            record["state"] = "running"
            if preview.get("percent") is not None:
                record["percent"] = preview["percent"]
            if preview.get("message"):
                record["message"] = preview["message"]
            if preview.get("preview"):
                record["preview"] = preview["preview"]
                _append_preview_stream_frame(record, preview)
        elif flag == "results":
            assets = [_output_asset(item, record) for item in (product or [])]
            assets = [item for item in assets if item]
            if assets:
                record["assets"] = assets
                record["asset"] = assets[-1]
                record["percent"] = max(float(record.get("percent") or 0), 0.95)
                record["message"] = f"Received {len(assets)} result(s)."
                _add_run_event(record, "info", record["message"], {"outputs": len(assets)})
        elif flag == "finish":
            assets = [_output_asset(item, record) for item in (product or [])]
            assets = [item for item in assets if item]
            record["assets"] = assets
            cancel_action = getattr(task, "user_cancel_action", None) or getattr(task, "last_stop", None)
            if cancel_action == "stop":
                record["state"] = "canceled"
                record["percent"] = max(float(record.get("percent") or 0), 0.01)
                record["message"] = "Stopped by user."
                record["finished_ts"] = time.time()
                _add_run_event(record, "warn", record["message"])
            elif cancel_action == "skip" and not assets:
                record["state"] = "skipped"
                record["percent"] = max(float(record.get("percent") or 0), 0.01)
                record["message"] = "Skipped by user."
                record["finished_ts"] = time.time()
                _add_run_event(record, "warn", record["message"])
            elif assets:
                record["asset"] = assets[-1]
                record["state"] = "finished"
                record["percent"] = 1.0
                record["message"] = f"Finished: {len(assets)} result(s)."
                record["gallery"] = _build_gallery_refresh_info(record)
                record["finished_ts"] = time.time()
                _add_run_event(record, "info", record["message"], {"outputs": len(assets)})
            else:
                record["state"] = "failed"
                record["percent"] = 0.0
                record["message"] = "Finished without output. Check backend console."
                record["finished_ts"] = time.time()
                _add_run_event(record, "error", record["message"])


def _public_run_record(record, after_preview_serial=None):
    result = {
        "ok": True,
        "run_id": record.get("run_id"),
        "task_id": record.get("task_id"),
        "placeholder_node_id": record.get("placeholder_node_id"),
        "preset_node_id": record.get("preset_node_id"),
        "state": record.get("state"),
        "percent": float(record.get("percent") or 0),
        "message": record.get("message") or "",
        "queue_size": record.get("queue_size"),
        "processing_id": record.get("processing_id"),
        "preview": record.get("preview"),
        "asset": record.get("asset"),
        "assets": record.get("assets") or [],
        "task_preview": record.get("task_preview") or {},
        "wildcard_preview": record.get("wildcard_preview") or {},
        "resolved_seed": record.get("resolved_seed"),
        "input_count": record.get("input_count"),
        "output_count": len(record.get("assets") or []),
        "events": record.get("events") or [],
        "result_asset_scope": record.get("result_asset_scope") or "canvas",
        "client_context": copy.deepcopy(record.get("client_context") or {}),
        "created_at": _iso_from_ts(record.get("created_ts")),
        "updated_at": _iso_from_ts(record.get("updated_ts")),
        "finished_at": _iso_from_ts(record.get("finished_ts")),
    }
    preview_stream = _public_preview_stream(record, after_preview_serial=after_preview_serial)
    if preview_stream:
        result["preview_stream"] = preview_stream
    task = record.get("task")
    if task is not None:
        result["user_cancel_action"] = getattr(task, "user_cancel_action", None) or getattr(task, "last_stop", None)
    if record.get("gallery"):
        result["gallery"] = record.get("gallery")
    return result


def _build_gallery_refresh_info(record):
    task = record.get("task")
    user_did = getattr(task, "user_did", None) or "guest"
    engine_type = "video" if getattr(task, "content_type", "image") == "video" else "image"
    try:
        import enhanced.gallery as gallery_util

        max_per_page = 18
        max_catalog = getattr(config, "default_image_catalog_max_number", 100)
        gallery_util.invalidate_output_list_cache(user_did, engine_type)
        output_list, finished_nums, finished_pages = gallery_util.refresh_output_list(
            max_per_page,
            max_catalog,
            user_did,
            engine_type,
        )
        return {
            "engine_type": engine_type,
            "stat": f"{finished_nums},{finished_pages}",
            "output_count": len(output_list or []),
            "latest": output_list[0] if output_list else None,
        }
    except Exception as err:
        return {
            "engine_type": engine_type,
            "error": f"{type(err).__name__}: {err}",
        }


def run_node(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    _cleanup_runs()
    identity = _state_identity(payload, state_params)
    if not user_can_generate(identity.get("user_did") or ""):
        return {
            "ok": False,
            "error": "generation_not_allowed",
            "details": "Current identity is not allowed to generate images.",
        }
    payload, profile_error = _payload_with_parameter_profile(payload, state_params)
    if profile_error:
        return profile_error

    run_id = str(payload.get("run_id") or f"canvas-run-{time.time_ns()}").strip()[:240]
    if not run_id:
        return {"ok": False, "error": "run_id is empty"}
    result_asset_scope = "gallery" if str(payload.get("result_asset_scope") or "").strip().lower() == "gallery" else "canvas"
    client_context = _normalize_client_context(payload.get("client_context"))
    now = time.time()
    reservation = {
        "run_id": run_id,
        "project_id": payload.get("project_id") or "default",
        "placeholder_node_id": payload.get("placeholder_node_id") or "",
        "preset_node_id": "",
        "state": "preparing",
        "percent": 0.01,
        "message": "Preparing AsyncTask.",
        "result_asset_scope": result_asset_scope,
        "client_context": client_context,
        "owner_user_did": identity.get("user_did") or "guest",
        "created_ts": now,
        "updated_ts": now,
    }
    with CANVAS_RUNS_LOCK:
        existing = CANVAS_RUNS.get(run_id)
        if existing:
            if not _run_record_owned_by(existing, identity):
                return {
                    "ok": False,
                    "error": "run_id_conflict",
                    "details": "The run_id is already used by another identity.",
                }
            response = _public_run_record(existing)
            response["idempotent_replay"] = True
            return response
        CANVAS_RUNS[run_id] = reservation

    def discard_reservation():
        with CANVAS_RUNS_LOCK:
            if CANVAS_RUNS.get(run_id) is reservation:
                CANVAS_RUNS.pop(run_id, None)

    try:
        import modules.async_worker as worker

        placeholder_node_id = payload.get("placeholder_node_id") or ""
        preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
        materialized_inputs, errors = _materialize_run_inputs(payload, state_params)
        task_preview = _build_task_preview(preset_node, materialized_inputs)
        task_args_preview = build_canvas_task_args_preview(payload, materialized_inputs, state_params)
        async_args_preview = task_args_preview.get("async_args_preview") if isinstance(task_args_preview, dict) else {}
        if errors:
            discard_reservation()
            return {"ok": False, "error": "input materialization failed", "errors": errors}
        if not async_args_preview.get("ok"):
            discard_reservation()
            return {"ok": False, "error": async_args_preview.get("error") or "AsyncTask args validation failed", "task_args_preview": task_args_preview}

        models = _merged_config_values(_model_config(preset_node))
        enabled_loras = _enabled_loras(models)
        api_arg_overrides = task_args_preview.get("api_arg_overrides") or {}
        args = build_canvas_async_task_args(api_arg_overrides, enabled_loras, materialized_inputs, load_images=True)
        task = worker.AsyncTask(args=args)
        h3_validation = minimax_h3_prompt_compiler.validate_task_prompt(task)
        if h3_validation and not h3_validation.get("ok"):
            logger.warning(
                "MiniMax H3 canvas prompt validation warning; submission continues: mode=%s errors=%s",
                h3_validation.get("mode"),
                h3_validation.get("errors") or [],
            )
        record = reservation
        record.update({
            "task_id": task.task_id,
            "task": task,
            "preset_node_id": preset_node.get("id"),
            "placeholder_node_id": placeholder_node_id,
            "state": "queued",
            "percent": 0.02,
            "message": "Queued in AsyncTask.",
            "queue_size": None,
            "processing_id": worker.get_processing_id(),
            "task_preview": task_preview,
            "wildcard_preview": payload.get("wildcard_preview") if isinstance(payload.get("wildcard_preview"), dict) else {},
            "resolved_seed": task_args_preview.get("resolved_seed") if isinstance(task_args_preview, dict) else None,
            "input_count": len(materialized_inputs),
            "state_params": copy.deepcopy(state_params) if isinstance(state_params, dict) else {},
            "updated_ts": now,
            **({"prompt_compiler": h3_validation} if h3_validation else {}),
        })
        if h3_validation and not h3_validation.get("ok"):
            _add_run_event(record, "warning", "MiniMax H3 prompt structure warning; submission continued.", {
                "mode": h3_validation.get("mode"),
                "errors": h3_validation.get("errors") or [],
            })
        _add_run_event(record, "info", "Queued in AsyncTask.", {
            "task_id": task.task_id,
            "preset_node_id": preset_node.get("id"),
            "placeholder_node_id": placeholder_node_id,
            "client_context": client_context,
        })
        with CANVAS_RUNS_LOCK:
            CANVAS_RUNS[run_id] = record
        try:
            worker.add_task(task)
        except Exception:
            discard_reservation()
            raise
        try:
            record["queue_size"] = worker.get_task_size()
        except Exception:
            record["queue_size"] = None
        record["updated_ts"] = time.time()
        return _public_run_record(record)
    except Exception as err:
        discard_reservation()
        return {"ok": False, "error": f"{type(err).__name__}: {err}"}


def poll_run(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    run_id = payload.get("run_id") or ""
    after_preview_serial = payload.get("after_preview_serial")
    identity = _state_identity(payload, state_params)
    try:
        import modules.async_worker as worker

        with CANVAS_RUNS_LOCK:
            record = CANVAS_RUNS.get(run_id)
        if not record:
            return {"ok": False, "error": "run not found", "run_id": run_id}
        if not _run_record_owned_by(record, identity):
            return {"ok": False, "error": "run not found", "run_id": run_id}

        _apply_task_yields(record)
        task = record.get("task")
        processing_id = worker.get_processing_id()
        queue_size = worker.get_task_size()
        record["processing_id"] = processing_id
        record["queue_size"] = queue_size
        if record.get("state") not in TERMINAL_RUN_STATES:
            if task is None or not record.get("task_id"):
                record["state"] = "preparing"
                record["message"] = "Preparing AsyncTask."
            else:
                cancel_action = getattr(task, "user_cancel_action", None) or getattr(task, "last_stop", None)
                if cancel_action == "stop":
                    record["state"] = "cancelling"
                    record["message"] = "Stop requested. Waiting for backend interruption."
                elif cancel_action == "skip":
                    record["state"] = "skipping"
                    record["message"] = "Skip requested. Waiting for backend interruption."
                if processing_id == record.get("task_id") or getattr(task, "processing", False):
                    if record.get("state") not in ("cancelling", "skipping"):
                        record["state"] = "running"
                    record["percent"] = max(float(record.get("percent") or 0), 0.06)
                    if not record.get("message") or record.get("message") == "Queued in AsyncTask.":
                        record["message"] = "Running in AsyncTask."
                elif record.get("state") not in ("cancelling", "skipping"):
                    record["state"] = "queued"
                    record["message"] = f"Queued in AsyncTask. Queue size: {queue_size}"
        record["updated_ts"] = time.time()
        with CANVAS_RUNS_LOCK:
            CANVAS_RUNS[run_id] = record
        return _public_run_record(record, after_preview_serial=after_preview_serial)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}", "run_id": run_id}


def control_run(payload, state_params):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    run_id = payload.get("run_id") or ""
    action = str(payload.get("action") or "").strip().lower()
    identity = _state_identity(payload, state_params)
    if action not in ("stop", "skip"):
        return {"ok": False, "error": "unsupported control action", "run_id": run_id}
    try:
        with CANVAS_RUNS_LOCK:
            record = CANVAS_RUNS.get(run_id)
        if not record:
            return {"ok": False, "error": "run not found", "run_id": run_id}
        if not _run_record_owned_by(record, identity):
            return {"ok": False, "error": "run not found", "run_id": run_id}

        # A finish yield may already be waiting when the stop request arrives.
        # Publish that completed result before marking the task for interruption.
        _apply_task_yields(record)
        if record.get("state") in TERMINAL_RUN_STATES:
            with CANVAS_RUNS_LOCK:
                CANVAS_RUNS[run_id] = record
            return _public_run_record(record)

        task = record.get("task")
        if task is None:
            return {"ok": False, "error": "run task is missing", "run_id": run_id}
        task.last_stop = action
        task.user_cancel_action = action
        try:
            import modules.async_worker as worker
            if action == "stop" and hasattr(worker.worker, "stop_processing"):
                worker.worker.stop_processing(task, 0, "Canvas stop requested")
            if hasattr(worker.worker, "interrupt_processing"):
                worker.worker.interrupt_processing()
        except Exception:
            pass
        record["state"] = "cancelling" if action == "stop" else "skipping"
        record["message"] = (
            "Stop requested. Waiting for backend interruption."
            if action == "stop"
            else "Skip requested. Waiting for backend interruption."
        )
        _add_run_event(record, "warn", record["message"], {"action": action})
        record["updated_ts"] = time.time()
        with CANVAS_RUNS_LOCK:
            CANVAS_RUNS[run_id] = record
        return _public_run_record(record)
    except Exception as err:
        return {"ok": False, "error": f"{type(err).__name__}: {err}", "run_id": run_id}
