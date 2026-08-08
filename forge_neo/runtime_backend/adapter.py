from __future__ import annotations

import base64
import io
import json
import os
import re
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import args_manager
from PIL import Image

from forge_neo.adetailer_compat import adetailer_default_args, adetailer_normalized_args
from forge_neo.bootstrap import ensure_shared_token
from forge_neo.dynamic_prompts_compat import DYNAMIC_PROMPTS_SCRIPT_BASE_NAME, dynamic_prompts_arg_dict, dynamic_prompts_arg_list
from forge_neo.forge_couple_compat import FORGE_COUPLE_SETTING_KEYS, forge_couple_arg_dict, forge_couple_arg_list
from forge_neo.regional_prompter_compat import regional_prompter_arg_dict, regional_prompter_arg_list
from forge_neo.tipo_compat import tipo_arg_list


ROOT = Path(__file__).resolve().parents[2]
NATIVE_PROCESSING_REMOVED_MESSAGE = (
    "Forge Neo native sampling has been removed. Use source_backend, source_api, or simpai."
)

SOURCE_BACKEND_IMG2IMG_MODES = {"img2img", "sketch", "inpaint", "inpaint_sketch", "inpaint_upload"}
NATIVE_REAL_MODEL_ENV = "FORGE_NEO_NATIVE_REAL_MODEL"
NATIVE_MODEL_LOADER_ENV = "FORGE_NEO_NATIVE_MODEL_LOADER"
SOURCE_SAVED_OVERRIDE_SETTING_KEYS = (
    "CLIP_stop_at_last_layers",
    "tiling",
    "face_restoration",
    "face_restoration_model",
    "code_former_weight",
    "face_restoration_unload",
    "inpainting_mask_weight",
    "s_min_uncond_all",
    "eta_noise_seed_delta",
    "token_merging_ratio",
    "token_merging_ratio_img2img",
    "token_merging_ratio_hr",
    "token_merging_stride",
    "token_merging_downsample",
    "token_merging_no_rand",
    *FORGE_COUPLE_SETTING_KEYS,
)
_XYZ_COMMON_AXIS_CHOICES = [
    "Nothing",
    "Seed",
    "Steps",
    "Size",
    "CFG Scale",
    "Distilled CFG Scale",
    "Shift",
    "Rescale CFG",
    "MaHiRo",
    "Prompt S/R",
    "Prompt order",
    "Sampler",
    "Schedule type",
    "Checkpoint name",
    "VAE",
    "Clip skip",
    "Denoising",
    "Initial noise multiplier",
    "Extra noise",
    "Styles",
    "Face restore",
    "Negative Guidance minimum sigma",
    "Token merging ratio",
    "Token merging ratio high-res",
    "Refiner checkpoint",
    "Refiner switch at",
    "RNG source",
]
_XYZ_TXT2IMG_AXIS_CHOICES = [
    "Nothing",
    "Seed",
    "Steps",
    "Hires steps",
    "Size",
    "CFG Scale",
    "Distilled CFG Scale",
    "Shift",
    "Rescale CFG",
    "MaHiRo",
    "Prompt S/R",
    "Prompt order",
    "Sampler",
    "Hires sampler",
    "Schedule type",
    "Checkpoint name",
    "VAE",
    "Clip skip",
    "Denoising",
    "Initial noise multiplier",
    "Extra noise",
    "Hires upscaler",
    "Styles",
    "Face restore",
    "Negative Guidance minimum sigma",
    "Token merging ratio",
    "Token merging ratio high-res",
    "Refiner checkpoint",
    "Refiner switch at",
    "RNG source",
    "批量提示词文件",
]
SOURCE_REQUEST_MODEL_OVERRIDE_KEYS = {
    "sd_model_checkpoint",
    "sd_vae",
    "forge_additional_modules",
    "forge_preset",
    "forge_unet_storage_dtype",
}
SOURCE_INFOTEXT_PAYLOAD_FIELD_ALIASES: dict[str, set[str]] = {
    "prompt": {"prompt"},
    "negative_prompt": {"negative_prompt"},
    "styles": {"styles", "prompt_styles"},
    "seed": {"seed"},
    "subseed": {"subseed", "variation_seed"},
    "subseed_strength": {"subseed_strength", "variation_seed_strength"},
    "seed_resize_from_w": {"seed_resize_from_w"},
    "seed_resize_from_h": {"seed_resize_from_h"},
    "sampler_name": {"sampler_name", "sampler", "sampler_index"},
    "scheduler": {"scheduler", "schedule_type"},
    "batch_size": {"batch_size"},
    "n_iter": {"n_iter", "batch_count"},
    "steps": {"steps"},
    "cfg_scale": {"cfg_scale"},
    "distilled_cfg_scale": {"distilled_cfg_scale"},
    "eta": {"eta"},
    "s_min_uncond": {"s_min_uncond"},
    "s_churn": {"s_churn"},
    "s_tmax": {"s_tmax"},
    "s_tmin": {"s_tmin"},
    "s_noise": {"s_noise"},
    "width": {"width"},
    "height": {"height"},
    "rescale_cfg": {"rescale_cfg"},
    "restore_faces": {"restore_faces"},
    "tiling": {"tiling"},
    "do_not_save_samples": {"do_not_save_samples"},
    "do_not_save_grid": {"do_not_save_grid"},
    "disable_extra_networks": {"disable_extra_networks"},
    "comments": {"comments"},
    "enable_hr": {"enable_hr", "hires_fix"},
    "denoising_strength": {"denoising_strength", "hr_denoising_strength"},
    "hr_scale": {"hr_scale"},
    "hr_upscaler": {"hr_upscaler"},
    "hr_second_pass_steps": {"hr_second_pass_steps"},
    "hr_resize_x": {"hr_resize_x"},
    "hr_resize_y": {"hr_resize_y"},
    "firstphase_width": {"firstphase_width"},
    "firstphase_height": {"firstphase_height"},
    "firstpass_image": {"firstpass_image"},
    "hr_checkpoint_name": {"hr_checkpoint_name", "hr_checkpoint", "hires_checkpoint"},
    "hr_additional_modules": {"hr_additional_modules"},
    "hr_sampler_name": {"hr_sampler_name", "hr_sampler"},
    "hr_scheduler": {"hr_scheduler"},
    "hr_prompt": {"hr_prompt"},
    "hr_negative_prompt": {"hr_negative_prompt"},
    "hr_cfg": {"hr_cfg"},
    "hr_distilled_cfg": {"hr_distilled_cfg"},
    "refiner_checkpoint": {"refiner_checkpoint"},
    "refiner_switch_at": {"refiner_switch_at"},
    "image_cfg_scale": {"image_cfg_scale"},
    "resize_mode": {"resize_mode"},
    "mask_blur": {"mask_blur"},
    "mask_round": {"mask_round"},
    "inpainting_fill": {"inpainting_fill", "masked_content"},
    "inpaint_full_res": {"inpaint_full_res", "inpaint_area"},
    "inpaint_full_res_padding": {"inpaint_full_res_padding", "inpaint_padding"},
    "inpainting_mask_invert": {"inpainting_mask_invert", "inpainting_mask_mode"},
    "initial_noise_multiplier": {"initial_noise_multiplier"},
    "latent_mask": {"latent_mask"},
}
SOURCE_GENERATION_API_NOT_ALLOWED_FIELDS = {"seed_enable_extras"}
FALLBACK_TASK_METHODS = {
    "Fooocus": "text2image",
    "Comfy": "sd15_aio",
    "SDXL": "sd15_aio",
    "Flux": "flux_aio",
    "Qwen": "qwen_aio_cn",
    "Z-image": "z_image_turbo_aio_cn",
}
RESIZE_MODE_TO_INT = {
    "Just resize": 0,
    "Crop and resize": 1,
    "Resize and fill": 2,
    "Just resize (latent upscale)": 3,
}
INPAINTING_FILL_TO_INT = {
    "fill": 0,
    "original": 1,
    "latent noise": 2,
    "latent nothing": 3,
}
LOW_BIT_DTYPE_TO_SOURCE = {
    "automatic": "Automatic",
    "automatic (fp16 lora)": "Automatic (fp16 LoRA)",
    "float8 e4m3fn": "float8-e4m3fn",
    "float8-e4m3fn": "float8-e4m3fn",
    "float8_e4m3fn": "float8-e4m3fn",
    "float8 e4m3fn (fp16 lora)": "float8-e4m3fn (fp16 LoRA)",
    "float8-e4m3fn (fp16 lora)": "float8-e4m3fn (fp16 LoRA)",
    "float8 e5m2": "float8-e5m2",
    "float8-e5m2": "float8-e5m2",
    "float8_e5m2": "float8-e5m2",
    "float8 e5m2 (fp16 lora)": "float8-e5m2 (fp16 LoRA)",
    "float8-e5m2 (fp16 lora)": "float8-e5m2 (fp16 LoRA)",
    "int8": "Automatic",
    "int8 (fp16 lora)": "Automatic",
    "nf4": "bnb-nf4",
    "bnb-nf4": "bnb-nf4",
    "bnb-nf4 (fp16 lora)": "bnb-nf4 (fp16 LoRA)",
    "fp4": "bnb-fp4",
    "bnb-fp4": "bnb-fp4",
    "bnb-fp4 (fp16 lora)": "bnb-fp4 (fp16 LoRA)",
    "none": "Automatic",
}


def reference_backend_map() -> dict[str, Any]:
    return {"roots": [], "entrypoints": []}


def target_backend_map() -> dict[str, Any]:
    native = {
        "modules/processing.py": (ROOT / "modules" / "processing.py").is_file(),
        "modules/txt2img.py": (ROOT / "modules" / "txt2img.py").is_file(),
        "modules/img2img.py": (ROOT / "modules" / "img2img.py").is_file(),
        "modules/scripts.py": (ROOT / "modules" / "scripts.py").is_file(),
        "modules/api/api.py": (ROOT / "modules" / "api" / "api.py").is_file(),
    }
    simpai = {
        "modules/async_worker.py": (ROOT / "modules" / "async_worker.py").is_file(),
        "modules/default_pipeline.py": (ROOT / "modules" / "default_pipeline.py").is_file(),
        "modules/canvas_workbench_runner.py": (ROOT / "modules" / "canvas_workbench_runner.py").is_file(),
    }
    native_availability = native_processing_availability()
    namespaced = {
        row["import_path"]: bool(row.get("available"))
        for row in native_availability.get("modules", {}).values()
    }
    return {
        "native_forge_processing": native,
        "native_forge_ready": all(native.values()),
        "namespaced_native_forge_processing": namespaced,
        "namespaced_native_forge_ready": bool(native_availability.get("ready")),
        "namespaced_native_forge_status": native_availability,
        "simpai_async_worker": simpai,
        "simpai_async_worker_ready": all(simpai.values()),
    }


def backend_capabilities() -> dict[str, Any]:
    target = target_backend_map()
    reference = reference_backend_map()
    return {
        "mode": "forge-neo-backend-adapter",
        "adapter": "source_backend_runtime",
        "backend_disabled": bool(getattr(args_manager.args, "disable_backend", False)),
        "target": target,
        "reference": reference,
        "source_api_bridge": {
            "adapter": "source_api",
            "url": _source_api_base_url(),
            "env": "FORGE_NEO_BACKEND_ADAPTER=source_api",
            "auto_env": "FORGE_NEO_BACKEND_ADAPTER=auto",
            "auto_presets_env": "FORGE_NEO_AUTO_SOURCE_API_PRESETS",
            "auto_presets": sorted(_auto_source_api_presets()),
            "route": "modules/api/api.py -> modules/processing.py -> process_images",
        },
        "source_backend_runtime": {
            "adapter": "source_backend",
            "env": "FORGE_NEO_BACKEND_ADAPTER=source_backend",
            "auto_presets_env": "FORGE_NEO_AUTO_SOURCE_BACKEND_PRESETS",
            "auto_presets": sorted(_auto_source_backend_presets()),
            "root": str(Path(__file__).resolve().parent),
            "route": "forge_neo/runtime_backend/source_runtime_child.py -> modules/api/api.py::text2imgapi/img2imgapi -> modules/processing.py::process_images",
        },
        "next_processing_chain": [
            "modules/api/api.py::text2imgapi/img2imgapi",
            "modules/txt2img.py::txt2img_create_processing",
            "modules/img2img.py::img2img_function",
            "modules/processing.py::StableDiffusionProcessing*",
            "modules/processing.py::process_images",
            "modules/scripts.py::ScriptRunner",
        ],
    }


def native_processing_availability() -> dict[str, Any]:
    return {
        "mode": "forge-neo-native-processing",
        "ready": False,
        "namespace": "removed",
        "modules": {},
        "missing": [NATIVE_PROCESSING_REMOVED_MESSAGE],
        "execution_chain": [],
    }


def _refresh_native_real_model_ready() -> None:
    return None


def _is_anima_native_request(request: object) -> bool:
    preset = str(getattr(request, "preset", "") or "").strip().casefold()
    checkpoint = str(getattr(request, "checkpoint", "") or "").strip().casefold()
    return preset == "anima" or "anima" in checkpoint


def _auto_source_api_presets() -> set[str]:
    text = str(os.environ.get("FORGE_NEO_AUTO_SOURCE_API_PRESETS", "") or "").strip()
    if not text:
        return set()
    return {item.strip().casefold() for item in re.split(r"[,;\s]+", text) if item.strip()}


def _auto_source_backend_presets() -> set[str]:
    text = str(os.environ.get("FORGE_NEO_AUTO_SOURCE_BACKEND_PRESETS", "*") or "").strip()
    if not text:
        return set()
    return {item.strip().casefold() for item in re.split(r"[,;\s]+", text) if item.strip()}


def _request_matches_auto_presets(request: object, presets: set[str]) -> bool:
    if not presets:
        return False
    if "*" in presets or "all" in presets:
        return True
    preset = str(getattr(request, "preset", "") or "").strip().casefold()
    checkpoint = str(getattr(request, "checkpoint", "") or "").strip().casefold()
    if preset in presets:
        return True
    return any(name and name in checkpoint for name in presets)


def _source_backend_mode(request: object) -> str:
    mode = str(getattr(request, "mode", "txt2img") or "txt2img").strip().casefold()
    if mode in SOURCE_BACKEND_IMG2IMG_MODES:
        return "img2img"
    return mode


def auto_source_api_preferred(request: object) -> bool:
    return _request_matches_auto_presets(request, _auto_source_api_presets())


def auto_source_backend_preferred(request: object) -> bool:
    mode = _source_backend_mode(request)
    if mode not in {"txt2img", "img2img", "batch"}:
        return False
    return _request_matches_auto_presets(request, _auto_source_backend_presets())


def native_runtime_env_for_request(request: object) -> dict[str, str]:
    if not _is_anima_native_request(request):
        return {}
    env: dict[str, str] = {}
    if NATIVE_REAL_MODEL_ENV not in os.environ:
        env[NATIVE_REAL_MODEL_ENV] = "1"
    if NATIVE_MODEL_LOADER_ENV not in os.environ:
        env[NATIVE_MODEL_LOADER_ENV] = "source_forge"
    return env


@contextmanager
def native_runtime_env(request: object):
    env = native_runtime_env_for_request(request)
    old_values = {key: os.environ.get(key) for key in env}
    try:
        for key, value in env.items():
            os.environ[key] = value
        if env:
            _refresh_native_real_model_ready()
        yield env
    finally:
        for key, old_value in old_values.items():
            if old_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = old_value
        if env:
            _refresh_native_real_model_ready()


def _clean_model_name(value: object, fallback: str) -> str:
    text = str(value or "").replace("\\", os.sep).replace("/", os.sep).strip()
    if not text or text.lower() in {"none", "automatic", "default (model)", "use same checkpoint"}:
        return fallback
    while text.startswith(os.sep):
        text = text[1:]
    return text


def _optional_model_name(value: object, *, none_values: set[str] | None = None) -> str | None:
    text = str(value or "").replace("\\", os.sep).replace("/", os.sep).strip()
    lowered = text.lower()
    blocked = {"", "none", "automatic", "default (model)"}
    if none_values:
        blocked.update(item.lower() for item in none_values)
    if lowered in blocked:
        return None
    while text.startswith(os.sep):
        text = text[1:]
    return text


def _dedupe_text(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = str(value).casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _source_low_bit_dtype(value: object) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    return LOW_BIT_DTYPE_TO_SOURCE.get(text.casefold(), text)


def _resolved_model_path(name: str, *catalogs: str) -> str:
    try:
        from forge_neo.models import find_model_path

        path = find_model_path(name, *catalogs)
    except Exception:
        path = ""
    return str(Path(path)) if path else name


def _native_additional_modules(request: object) -> list[str]:
    modules: list[str] = []
    for value in list(getattr(request, "text_encoders", []) or []):
        text_encoder = _optional_model_name(value)
        if text_encoder is not None:
            modules.append(_resolved_model_path(text_encoder, "text_encoders", "clip"))
    vae = _optional_model_name(getattr(request, "vae", None))
    if vae is not None:
        modules.append(_resolved_model_path(vae, "vae"))
    return _dedupe_text(modules)


def _clamped_int(value: object, default: int, *, minimum: int, maximum: int) -> int:
    try:
        result = int(float(str(value).strip()))
    except Exception:
        result = default
    return max(minimum, min(maximum, result))


def _clamped_float(value: object, default: float, *, minimum: float, maximum: float) -> float:
    try:
        result = float(str(value).strip())
    except Exception:
        result = default
    return max(minimum, min(maximum, result))


def _bool_value(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().casefold()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off"}:
        return False
    return default


def _optional_clamped_float(value: object, *, minimum: float, maximum: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return _clamped_float(value, 0.0, minimum=minimum, maximum=maximum)


def _source_api_payload_fields(request: object) -> set[str]:
    fields = getattr(request, "api_payload_fields", set()) or set()
    return {str(field) for field in fields}


def _source_api_has_field(request: object, field: str) -> bool:
    return field in _source_api_payload_fields(request)


def _source_payload_without_ignored_api_fields(args: dict[str, Any], request: object) -> dict[str, Any]:
    if not bool(getattr(request, "source_api_request", False)):
        return args
    for field in SOURCE_GENERATION_API_NOT_ALLOWED_FIELDS:
        args.pop(field, None)
    return args


def _source_api_raw_field(request: object, field: str) -> tuple[bool, Any]:
    if not bool(getattr(request, "source_api_request", False)):
        return False, None
    raw = getattr(request, "source_api_raw_fields", None)
    if not isinstance(raw, dict) or field not in raw:
        return False, None
    return True, raw.get(field)


SOURCE_RAW_EMPTY_STRING_FIELDS = {
    "prompt",
    "negative_prompt",
    "sampler_name",
    "sampler_index",
    "scheduler",
    "firstpass_image",
    "refiner_checkpoint",
    "hr_upscaler",
    "hr_checkpoint_name",
    "hr_sampler_name",
    "hr_scheduler",
    "hr_prompt",
    "hr_negative_prompt",
    "mask",
    "latent_mask",
    "script_name",
    "force_task_id",
    "infotext",
}


def _source_apply_raw_request_model_values(args: dict[str, Any], request: object) -> dict[str, Any]:
    if not bool(getattr(request, "source_api_request", False)):
        return args
    raw = getattr(request, "source_api_raw_fields", None)
    if not isinstance(raw, dict):
        return args
    for field, value in raw.items():
        if value is None and field in args:
            args[field] = value
        elif value == "" and (field in args or field in SOURCE_RAW_EMPTY_STRING_FIELDS):
            args[field] = value
    return args


def _source_request_int_arg(
    request: object,
    attr: str,
    default: int,
    *,
    field: str | None = None,
    minimum: int,
    maximum: int,
) -> int | None:
    value = getattr(request, attr, default)
    if field and _source_api_has_field(request, field):
        return value
    return _clamped_int(value, default, minimum=minimum, maximum=maximum)


def _source_request_float_arg(
    request: object,
    attr: str,
    default: float,
    *,
    field: str | None = None,
    minimum: float,
    maximum: float,
) -> float | None:
    value = getattr(request, attr, default)
    if field and _source_api_has_field(request, field):
        return value
    return _clamped_float(value, default, minimum=minimum, maximum=maximum)


def _source_request_optional_float_arg(
    request: object,
    attr: str,
    *,
    field: str | None = None,
    minimum: float,
    maximum: float,
) -> float | None:
    value = getattr(request, attr, None)
    if field and _source_api_has_field(request, field):
        return value
    return _optional_clamped_float(value, minimum=minimum, maximum=maximum)


def _resize_mode_index(value: object) -> int:
    try:
        numeric = int(float(str(value).strip()))
    except Exception:
        numeric = None
    if numeric in {0, 1, 2, 3}:
        return numeric
    text = str(value or "").strip()
    return RESIZE_MODE_TO_INT.get(text, RESIZE_MODE_TO_INT.get(text.capitalize(), 1))


def _inpainting_fill_index(value: object) -> int:
    try:
        numeric = int(float(str(value).strip()))
    except Exception:
        numeric = None
    if numeric in {0, 1, 2, 3}:
        return numeric
    text = str(value or "").strip().lower()
    return INPAINTING_FILL_TO_INT.get(text, 1)


def _source_entrypoint(entry_id: str) -> dict[str, Any]:
    for row in reference_backend_map().get("entrypoints", []):
        if row.get("id") == entry_id and row.get("exists"):
            return {
                "id": row.get("id"),
                "relative_path": row.get("relative_path"),
                "line": row.get("line"),
                "root": row.get("root"),
            }
    return {"id": entry_id, "relative_path": None, "line": None, "root": None}


def _source_api_base_url() -> str:
    return str(os.environ.get("FORGE_NEO_SOURCE_API_URL", "http://127.0.0.1:7890") or "").rstrip("/")


def _aspect_label(width: int, height: int) -> str:
    return f"{max(64, int(width or 1024))}x{max(64, int(height or 1024))}"


def _backend_defaults() -> tuple[object, object]:
    ensure_shared_token(test_stub=os.environ.get("FORGE_NEO_TEST_TOKEN_STUB") == "1")
    from forge_neo.bootstrap import ensure_config
    import modules.flags as flags

    return ensure_config(test_stub=os.environ.get("FORGE_NEO_TEST_TOKEN_STUB") == "1"), flags


def _task_method_for(engine: str, flags: object) -> str:
    try:
        params = flags.get_engine_default_backend_params(engine)
    except Exception:
        params = {}
    method = params.get("task_method") if isinstance(params, dict) else None
    return str(method or FALLBACK_TASK_METHODS.get(engine, "z_image_turbo_aio_cn"))


def _lora_weight_for_request(value: object, request: object) -> float:
    raw = str(value or "").strip()
    token_match = _SOURCE_LORA_TOKEN_RE.search(raw)
    if token_match:
        try:
            return float(token_match.group(2))
        except Exception:
            return 1.0
    weights = getattr(request, "lora_weights", {}) or {}
    if not isinstance(weights, dict):
        return 1.0
    normalized = raw.replace("\\", "/").strip("/")
    basename = Path(normalized).name
    stem = Path(normalized).stem
    for key in (raw, normalized, basename, stem):
        if key in weights:
            try:
                return float(weights[key])
            except Exception:
                return 1.0
    return 1.0


def _format_lora_weight(value: float) -> str:
    return f"{float(value):.6g}"


def _enabled_loras(request: object) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, value in enumerate(list(getattr(request, "loras", []) or [])[:10], start=1):
        name = str(value or "").strip()
        if not name or name.lower() == "none":
            continue
        rows.append({"index": index, "model": name, "weight": _lora_weight_for_request(name, request)})
    return rows


_SOURCE_LORA_TOKEN_RE = re.compile(r"<lora:([^:>]+):([^>]*)>", re.IGNORECASE)


def _source_lora_prompt_token(value: object, *, weight: float = 1.0) -> tuple[str, str]:
    raw = str(value or "").strip()
    if not raw or raw.casefold() == "none":
        return "", ""
    if raw.startswith("<lora:") and raw.endswith(">"):
        match = _SOURCE_LORA_TOKEN_RE.search(raw)
        return (raw, match.group(1)) if match else (raw, raw)
    token_name = Path(raw.replace("\\", "/")).stem or raw
    return f"<lora:{token_name}:{_format_lora_weight(weight)}>", token_name


def _source_prompt_with_loras(prompt: object, request: object) -> str:
    text = str(prompt or "").strip()
    existing = {match.group(1).casefold() for match in _SOURCE_LORA_TOKEN_RE.finditer(text)}
    tokens: list[str] = []
    for value in list(getattr(request, "loras", []) or []):
        token, token_name = _source_lora_prompt_token(value, weight=_lora_weight_for_request(value, request))
        if not token or not token_name:
            continue
        key = token_name.casefold()
        if key in existing:
            continue
        existing.add(key)
        tokens.append(token)
    if not tokens:
        return text
    return " ".join([part for part in [text, *tokens] if part]).strip()


def _api_overrides_from_request(request: object) -> dict[str, Any]:
    config, flags = _backend_defaults()
    engine = str(getattr(config, "backend_engine", "") or "").strip()
    if not engine or engine == "Remote":
        engine = "Z-image"
    default_base = str(getattr(config, "default_base_model_name", "") or "")
    default_refiner = str(getattr(config, "default_refiner_model_name", "None") or "None")
    default_vae = str(getattr(config, "default_vae", "Default (model)") or "Default (model)")
    base_model = _clean_model_name(getattr(request, "checkpoint", ""), default_base)
    refiner_model = _clean_model_name(getattr(request, "refiner_checkpoint", ""), default_refiner)
    vae_name = _clean_model_name(getattr(request, "vae", ""), default_vae)
    batch_count = max(1, int(getattr(request, "batch_count", 1) or 1))
    batch_size = max(1, int(getattr(request, "batch_size", 1) or 1))
    width = max(64, int(getattr(request, "width", 1024) or 1024))
    height = max(64, int(getattr(request, "height", 1024) or 1024))
    steps = max(1, int(getattr(request, "steps", 1) or 1))
    params_backend = {
        "backend_engine": engine,
        "preset": f"forge-neo-{getattr(request, 'preset', 'default') or 'default'}",
        "task_method": _task_method_for(engine, flags),
        "nickname": "Forge Neo",
        "user_did": "forge_neo_api",
        "engine_type": "image",
        "display_steps": steps,
    }
    return {
        "generate_image_grid": False,
        "prompt": str(getattr(request, "prompt", "") or ""),
        "negative_prompt": str(getattr(request, "negative_prompt", "") or ""),
        "style_selections": list(getattr(request, "styles", []) or []),
        "performance_selection": str(getattr(config, "default_performance", "Speed") or "Speed"),
        "aspect_ratios_selection": _aspect_label(width, height),
        "image_number": min(64, batch_count * batch_size),
        "output_format": "png",
        "image_seed": int(getattr(request, "seed", -1) or -1),
        "sharpness": float(getattr(config, "default_sample_sharpness", 2.0) or 2.0),
        "guidance_scale": float(getattr(request, "cfg_scale", getattr(config, "default_cfg_scale", 1.0)) or 1.0),
        "base_model": base_model,
        "refiner_model": refiner_model,
        "refiner_switch": float(getattr(request, "refiner_switch_at", getattr(config, "default_refiner_switch", 0.5)) or 0.5),
        "input_image_checkbox": bool(getattr(request, "mode", "") == "img2img" and getattr(request, "init_image", None) is not None),
        "current_tab": "uov" if getattr(request, "mode", "") == "img2img" else "none",
        "uov_input_image": getattr(request, "init_image", None),
        "uov_method": getattr(flags, "disabled", "Disabled"),
        "sampler_name": str(getattr(request, "sampler", getattr(config, "default_sampler", "euler_ancestral")) or "euler_ancestral"),
        "scheduler_name": str(getattr(request, "scheduler", getattr(config, "default_scheduler", "beta")) or "beta"),
        "vae_name": vae_name,
        "overwrite_step": steps,
        "overwrite_width": width,
        "overwrite_height": height,
        "overwrite_vary_strength": float(getattr(request, "denoising_strength", -1) or -1),
        "overwrite_upscale_strength": -1,
        "disable_preview": False,
        "disable_intermediate_results": False,
        "disable_seed_increment": False,
        "params_backend": params_backend,
    }


def _light_task_preview(overrides: dict[str, Any], enabled_loras: list[dict[str, Any]]) -> dict[str, Any]:
    params_backend = dict(overrides.get("params_backend") or {})
    return {
        "ok": True,
        "mode": "lightweight_args_preview_no_async_worker",
        "task_object_preview": {
            "task_class": params_backend.get("backend_engine"),
            "task_name": params_backend.get("preset"),
            "task_method": params_backend.get("task_method"),
            "content_type": params_backend.get("engine_type", "image"),
            "image_number": overrides.get("image_number"),
            "steps": overrides.get("overwrite_step"),
            "base_model_name": overrides.get("base_model"),
            "refiner_model_name": overrides.get("refiner_model"),
            "loras_count": len(enabled_loras),
            "scene_frontend": params_backend.get("scene_frontend"),
            "has_scene_canvas_image": params_backend.get("scene_canvas_image") is not None,
            "has_scene_input_image1": params_backend.get("scene_input_image1") is not None,
            "has_scene_input_image2": params_backend.get("scene_input_image2") is not None,
        },
        "normalized_summary": {
            "params_backend_type": "dict",
            "loras_count": len(enabled_loras),
            "ip_ctrls_count": 0,
            "enhance_ctrls_count": 0,
        },
    }


def build_simpai_async_preview(request: object, *, validate: bool = False) -> dict[str, Any]:
    try:
        overrides = _api_overrides_from_request(request)
        enabled_loras = _enabled_loras(request)
        if validate:
            import modules.canvas_workbench_runner as runner

            preview = runner.build_canvas_async_args_dry_run(overrides, enabled_loras, {})
        else:
            preview = _light_task_preview(overrides, enabled_loras)
        return {
            "ok": bool(preview.get("ok")),
            "adapter": "simpai_async_worker",
            "validated": bool(validate),
            "preview": preview,
            "api_overrides": {
                key: value
                for key, value in overrides.items()
                if key not in {"uov_input_image"}
            },
        }
    except Exception as exc:
        return {"ok": False, "adapter": "simpai_async_worker", "error": f"{type(exc).__name__}: {exc}"}


def native_override_settings(request: object) -> dict[str, Any]:
    settings: dict[str, Any] = _source_saved_override_settings()
    settings.update(_source_request_override_settings(request))
    preset = str(getattr(request, "preset", "") or "").strip()
    if preset:
        settings["forge_preset"] = preset
    checkpoint = _optional_model_name(getattr(request, "checkpoint", None))
    if checkpoint is not None:
        settings["sd_model_checkpoint"] = checkpoint
    additional_modules = _native_additional_modules(request)
    settings["forge_additional_modules"] = additional_modules
    low_bit_dtype = _source_low_bit_dtype(getattr(request, "low_bit_dtype", None))
    if low_bit_dtype is not None:
        settings["forge_unet_storage_dtype"] = low_bit_dtype
    return settings


def _source_saved_override_settings() -> dict[str, Any]:
    try:
        from forge_neo.settings import load_settings

        saved = load_settings()
    except Exception:
        return {}
    if not isinstance(saved, dict):
        return {}
    return {
        key: saved[key]
        for key in SOURCE_SAVED_OVERRIDE_SETTING_KEYS
        if key in saved
    }


def _source_request_override_settings(request: object) -> dict[str, Any]:
    raw = getattr(request, "override_settings", None)
    if not isinstance(raw, dict):
        return {}
    return {
        str(key): value
        for key, value in raw.items()
        if str(key) not in SOURCE_REQUEST_MODEL_OVERRIDE_KEYS
    }


def _source_payload_with_infotext_unset_fields(args: dict[str, Any], request: object) -> dict[str, Any]:
    infotext = str(getattr(request, "infotext", "") or "")
    if not infotext:
        return args
    explicit = getattr(request, "api_payload_fields", None)
    if not explicit:
        return args
    explicit_fields = {str(key) for key in explicit}
    for field, aliases in SOURCE_INFOTEXT_PAYLOAD_FIELD_ALIASES.items():
        if field not in args:
            continue
        if explicit_fields.isdisjoint(aliases):
            args.pop(field, None)
    return args


def _source_seed_value(request: object) -> int:
    value = getattr(request, "seed", -1)
    if value is None:
        return -1
    text = str(value).strip()
    if not text:
        return -1
    try:
        return int(float(text))
    except Exception:
        return -1


def _source_optional_int(value: object) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except Exception:
        return None


def _source_seed_variance_args(request: object) -> dict[str, object]:
    explicit_strength = getattr(request, "subseed_strength", None)
    if explicit_strength is not None:
        strength = _clamped_float(explicit_strength, 0.0, minimum=0.0, maximum=1.0)
        if strength <= 0.0:
            return {"subseed": -1, "subseed_strength": 0.0}
        explicit_subseed = _source_optional_int(getattr(request, "subseed", None))
        return {"subseed": explicit_subseed if explicit_subseed is not None else -1, "subseed_strength": strength}
    if not bool(getattr(request, "seed_variance_enabled", False)):
        return {"subseed": -1, "subseed_strength": 0.0}
    strength = _clamped_float(getattr(request, "seed_variance_strength", 0.25), 0.25, minimum=0.0, maximum=1.0)
    if strength <= 0.0:
        return {"subseed": -1, "subseed_strength": 0.0}
    seed = _source_seed_value(request)
    delta = _clamped_int(getattr(request, "seed_variance_delta", 1), 1, minimum=-2147483648, maximum=2147483647)
    subseed = seed + delta if seed >= 0 else -1
    return {"subseed": subseed, "subseed_strength": strength}


def native_processing_payload(request: object) -> dict[str, Any]:
    mode = "img2img" if _source_backend_mode(request) == "img2img" else "txt2img"
    width = _source_request_int_arg(request, "width", 512, field="width", minimum=64, maximum=8192)
    height = _source_request_int_arg(request, "height", 512, field="height", minimum=64, maximum=8192)
    steps = _source_request_int_arg(request, "steps", 1, field="steps", minimum=1, maximum=150)
    batch_size = _source_request_int_arg(request, "batch_size", 1, field="batch_size", minimum=1, maximum=64)
    n_iter = _source_request_int_arg(request, "batch_count", 1, field="n_iter", minimum=1, maximum=999)
    override_settings = native_override_settings(request)
    seed = _source_seed_value(request)
    common = {
        "prompt": str(getattr(request, "prompt", "") or ""),
        "negative_prompt": str(getattr(request, "negative_prompt", "") or ""),
        "styles": list(getattr(request, "styles", []) or []),
        "seed": seed,
        **_source_seed_variance_args(request),
        "seed_resize_from_w": _source_request_int_arg(request, "seed_resize_from_w", -1, field="seed_resize_from_w", minimum=-1, maximum=8192),
        "seed_resize_from_h": _source_request_int_arg(request, "seed_resize_from_h", -1, field="seed_resize_from_h", minimum=-1, maximum=8192),
        "seed_enable_extras": bool(getattr(request, "seed_enable_extras", True)),
        "sampler_name": str(getattr(request, "sampler", "") or "Euler"),
        "scheduler": str(getattr(request, "scheduler", "") or "Beta"),
        "batch_size": batch_size,
        "n_iter": n_iter,
        "steps": steps,
        "cfg_scale": _source_request_float_arg(request, "cfg_scale", 7.0, field="cfg_scale", minimum=0.0, maximum=100.0),
        "distilled_cfg_scale": _source_request_float_arg(request, "distilled_cfg_scale", 3.5, field="distilled_cfg_scale", minimum=0.0, maximum=100.0),
        "eta": _source_request_optional_float_arg(request, "eta", field="eta", minimum=0.0, maximum=1.0),
        "s_min_uncond": _source_request_optional_float_arg(request, "s_min_uncond", field="s_min_uncond", minimum=0.0, maximum=8.0),
        "s_churn": _source_request_optional_float_arg(request, "s_churn", field="s_churn", minimum=0.0, maximum=100.0),
        "s_tmax": _source_request_optional_float_arg(request, "s_tmax", field="s_tmax", minimum=0.0, maximum=999.0),
        "s_tmin": _source_request_optional_float_arg(request, "s_tmin", field="s_tmin", minimum=0.0, maximum=10.0),
        "s_noise": _source_request_optional_float_arg(request, "s_noise", field="s_noise", minimum=0.0, maximum=1.1),
        "width": width,
        "height": height,
        "restore_faces": getattr(request, "restore_faces", None),
        "tiling": getattr(request, "tiling", None),
        "disable_extra_networks": bool(getattr(request, "disable_extra_networks", False)),
        "override_settings": override_settings,
        "override_settings_restore_afterwards": bool(getattr(request, "override_settings_restore_afterwards", True)),
        "comments": dict(getattr(request, "comments", {}) or {}),
        "firstpass_image": getattr(request, "firstpass_image", None),
        "refiner_checkpoint": _optional_model_name(getattr(request, "refiner_checkpoint", None)),
        "refiner_switch_at": _source_request_float_arg(request, "refiner_switch_at", 0.875, field="refiner_switch_at", minimum=0.0, maximum=1.0),
        "do_not_save_samples": bool(getattr(request, "do_not_save_samples", False)),
        "do_not_save_grid": bool(getattr(request, "do_not_save_grid", False)),
        "forge_neo_preset": str(getattr(request, "preset", "") or ""),
    }
    if common["refiner_checkpoint"] is None or not bool(getattr(request, "refiner", False)):
        common["refiner_checkpoint"] = None
        common["refiner_switch_at"] = None

    script_name = str(getattr(request, "script", "") or "None")
    raw_script_args = getattr(request, "script_args", None)
    if isinstance(raw_script_args, dict):
        script_args = dict(raw_script_args)
    elif isinstance(raw_script_args, (list, tuple)):
        script_args = {"api_script_args": list(raw_script_args)}
    elif raw_script_args is None:
        script_args = {}
    else:
        script_args = {"api_script_args": [raw_script_args]}
    payload: dict[str, Any] = {
        "mode": mode,
        "source": {
            "api": _source_entrypoint("api_img2img" if mode == "img2img" else "api_txt2img"),
            "ui_processing": _source_entrypoint("ui_img2img_processing" if mode == "img2img" else "ui_txt2img_processing"),
            "processing_core": _source_entrypoint("processing_core"),
        },
        "script_runner": "scripts_img2img" if mode == "img2img" else "scripts_txt2img",
        "script_name": script_name,
        "script_args": script_args,
        "alwayson_scripts": {},
        "post_init": {
            "is_api": True,
            "outpath_samples": "opts.outdir_img2img_samples" if mode == "img2img" else "opts.outdir_txt2img_samples",
            "outpath_grids": "opts.outdir_img2img_grids" if mode == "img2img" else "opts.outdir_txt2img_grids",
        },
    }

    if mode == "txt2img":
        enable_hr = bool(getattr(request, "hires_fix", False))
        constructor_args = {
            **common,
            "enable_hr": enable_hr,
            "denoising_strength": _source_request_float_arg(request, "hires_denoising_strength", 0.75, field="denoising_strength", minimum=0.0, maximum=1.0) if enable_hr else None,
            "hr_scale": _source_request_float_arg(request, "hires_scale", 2.0, field="hr_scale", minimum=1.0, maximum=16.0),
            "hr_upscaler": str(getattr(request, "hires_upscaler", "") or "Latent"),
            "hr_second_pass_steps": _source_request_int_arg(request, "hires_steps", 0, field="hr_second_pass_steps", minimum=0, maximum=150),
            "hr_resize_x": _source_request_int_arg(request, "hires_resize_x", 0, field="hr_resize_x", minimum=0, maximum=8192),
            "hr_resize_y": _source_request_int_arg(request, "hires_resize_y", 0, field="hr_resize_y", minimum=0, maximum=8192),
            "firstphase_width": _source_request_int_arg(request, "firstphase_width", 0, field="firstphase_width", minimum=0, maximum=8192),
            "firstphase_height": _source_request_int_arg(request, "firstphase_height", 0, field="firstphase_height", minimum=0, maximum=8192),
            "hr_checkpoint_name": _optional_model_name(
                getattr(request, "hires_checkpoint", None),
                none_values={"Use same checkpoint"},
            ),
            "hr_additional_modules": list(getattr(request, "hires_additional_modules", []) or ["Use same choices"]),
            "hr_sampler_name": _optional_model_name(
                getattr(request, "hires_sampler", None),
                none_values={"Use same sampler"},
            ),
            "hr_scheduler": _optional_model_name(
                getattr(request, "hires_scheduler", None),
                none_values={"Use same scheduler"},
            ),
            "hr_prompt": str(getattr(request, "hires_prompt", "") or ""),
            "hr_negative_prompt": str(getattr(request, "hires_negative_prompt", "") or ""),
            "hr_cfg": _source_request_float_arg(request, "hires_cfg", 1.0, field="hr_cfg", minimum=0.0, maximum=100.0),
            "hr_distilled_cfg": _source_request_float_arg(request, "hires_distilled_cfg", 3.5, field="hr_distilled_cfg", minimum=0.0, maximum=100.0),
        }
        payload["processing_class"] = "StableDiffusionProcessingTxt2Img"
        payload["constructor_args"] = constructor_args
        return payload

    init_image = getattr(request, "init_image", None)
    mask_image = getattr(request, "mask_image", None)
    constructor_args = {
        **common,
        "init_images": ["<PIL.Image>"] if init_image is not None else [],
        "init_images_count": 1 if init_image is not None else 0,
        "resize_mode": getattr(request, "resize_mode") if _source_api_has_field(request, "resize_mode") else _resize_mode_index(getattr(request, "resize_mode", "Crop and resize")),
        "denoising_strength": _source_request_float_arg(request, "denoising_strength", 0.75, field="denoising_strength", minimum=0.0, maximum=1.0),
        "image_cfg_scale": getattr(request, "image_cfg_scale", None),
        "mask": "<PIL.Image>" if mask_image is not None else None,
        "mask_present": mask_image is not None,
        "mask_blur": _source_request_int_arg(request, "mask_blur", 4, field="mask_blur", minimum=0, maximum=256),
        "mask_round": bool(getattr(request, "mask_round", True)),
        "inpainting_fill": getattr(request, "inpainting_fill") if _source_api_has_field(request, "inpainting_fill") else _inpainting_fill_index(getattr(request, "inpainting_fill", "original")),
        "inpaint_full_res": str(getattr(request, "inpaint_area", "") or "Only masked").lower() == "only masked",
        "inpaint_full_res_padding": _source_request_int_arg(request, "inpaint_padding", 32, field="inpaint_full_res_padding", minimum=0, maximum=512),
        "inpainting_mask_invert": 1
        if str(getattr(request, "inpainting_mask_mode", "") or "").lower() == "inpaint not masked"
        else 0,
        "initial_noise_multiplier": _source_request_optional_float_arg(request, "initial_noise_multiplier", field="initial_noise_multiplier", minimum=0.0, maximum=100.0),
        "latent_mask": getattr(request, "latent_mask", None),
    }
    payload["processing_class"] = "StableDiffusionProcessingImg2Img"
    payload["constructor_args"] = constructor_args
    payload["batch"] = {
        "source_type": str(getattr(request, "batch_source_type", "upload") or "upload"),
        "upload_count": len(list(getattr(request, "batch_files", []) or [])),
        "input_dir": str(getattr(request, "batch_input_dir", "") or ""),
        "output_dir": str(getattr(request, "batch_output_dir", "") or ""),
        "inpaint_mask_dir": str(getattr(request, "batch_inpaint_mask_dir", "") or ""),
        "use_png_info": bool(getattr(request, "batch_use_png_info", False)),
        "png_info_props": list(getattr(request, "batch_png_info_props", []) or []),
        "png_info_dir": str(getattr(request, "batch_png_info_dir", "") or ""),
    }
    return payload


def _encode_api_image(image: object) -> str:
    if not isinstance(image, Image.Image):
        image = _image_from_any_value(image)
    if not isinstance(image, Image.Image):
        return ""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _image_from_any_value(value: object) -> Image.Image | None:
    if value is None:
        return None
    if isinstance(value, Image.Image):
        return value.convert("RGBA")
    if isinstance(value, (tuple, list)) and value:
        return _image_from_any_value(value[0])
    if isinstance(value, dict):
        for key in ("image", "background", "composite", "name", "path"):
            image = _image_from_any_value(value.get(key))
            if image is not None:
                return image
        return None
    path = getattr(value, "name", None) or getattr(value, "path", None)
    if path is None and isinstance(value, (str, os.PathLike)):
        path = value
    if path:
        try:
            with Image.open(path) as image:
                return image.convert("RGBA").copy()
        except Exception:
            return None
    return None


def _encode_source_controlnet_image(value: object) -> str:
    image = _image_from_any_value(value)
    return _encode_api_image(image) if image is not None else ""


def _source_image_stitch_reference_values(value: object) -> list[object]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [item for item in value if item is not None]
    return [value]


def _source_image_stitch_references(request: object) -> list[str]:
    references: list[str] = []
    for value in _source_image_stitch_reference_values(getattr(request, "image_stitch_references", None)):
        image = _image_from_any_value(value)
        if image is None:
            continue
        encoded = _encode_api_image(image.convert("RGB"))
        if encoded:
            references.append(encoded)
    return references


def _script_arg_bool(args: dict[str, object], key: str, default: bool = False, *aliases: str) -> bool:
    for name in (key, *aliases):
        if name in args:
            return bool(args.get(name))
    return default


def _script_arg_str(args: dict[str, object], key: str, default: str = "", *aliases: str) -> str:
    for name in (key, *aliases):
        if name in args:
            return str(args.get(name) or "")
    return default


def _script_arg_list(args: dict[str, object], key: str) -> list[object]:
    value = args.get(key)
    if isinstance(value, list):
        return list(value)
    if isinstance(value, tuple):
        return list(value)
    return []


def _source_script_name_key(script: object) -> str:
    return str(script or "").strip().casefold()


def _source_xyz_axis_index(value: object, *, is_img2img: bool) -> int:
    if isinstance(value, int):
        return max(0, value)
    if isinstance(value, float) and value.is_integer():
        return max(0, int(value))
    text = str(value or "Nothing").strip()
    choices = _XYZ_COMMON_AXIS_CHOICES if is_img2img else _XYZ_TXT2IMG_AXIS_CHOICES
    for index, label in enumerate(choices):
        if label.casefold() == text.casefold():
            return index
    return 0


def _source_xyz_axis_payload(args: dict[str, object], key: str, *, is_img2img: bool, default: str = "Nothing") -> tuple[int, str, list[object]]:
    axis_type = args.get(f"{key}_type", default)
    values = _script_arg_str(args, f"{key}_values")
    dropdown_values = _script_arg_list(args, f"{key}_values_dropdown")
    axis_index = _source_xyz_axis_index(axis_type, is_img2img=is_img2img)
    if axis_index and not values.strip() and not any(str(item or "").strip() for item in dropdown_values):
        axis_index = 0
    if not axis_index:
        return 0, "", []
    return axis_index, values, dropdown_values


def _source_xyz_script_args_tuple(args: dict[str, object], *, is_img2img: bool) -> tuple[object, ...]:
    x_type, x_values, x_values_dropdown = _source_xyz_axis_payload(args, "x", is_img2img=is_img2img, default="Seed")
    y_type, y_values, y_values_dropdown = _source_xyz_axis_payload(args, "y", is_img2img=is_img2img)
    z_type, z_values, z_values_dropdown = _source_xyz_axis_payload(args, "z", is_img2img=is_img2img)
    return (
        x_type,
        x_values,
        x_values_dropdown,
        y_type,
        y_values,
        y_values_dropdown,
        z_type,
        z_values,
        z_values_dropdown,
        _script_arg_bool(args, "draw_legend", True),
        _script_arg_bool(args, "include_lone_images", False, "include_sub_images"),
        _script_arg_bool(args, "include_sub_grids", False),
        _script_arg_bool(args, "no_fixed_seeds", False, "keep_minus_one"),
        _script_arg_bool(args, "vary_seeds_x", False, "vary_seed_x"),
        _script_arg_bool(args, "vary_seeds_y", False, "vary_seed_y"),
        _script_arg_bool(args, "vary_seeds_z", False, "vary_seed_z"),
        _clamped_int(args.get("row_count"), 0, minimum=0, maximum=8),
        _clamped_int(args.get("margin_size"), 0, minimum=0, maximum=500),
        _script_arg_bool(args, "csv_mode", False),
    )


def _source_named_script_args_tuple(value: dict[str, object], *, script: object, mode: object) -> tuple[object, ...] | None:
    name = _source_script_name_key(script)
    if name == "prompt matrix":
        return (
            _script_arg_bool(value, "put_at_start"),
            _script_arg_bool(value, "different_seeds"),
            _script_arg_str(value, "prompt_type", "positive"),
            _script_arg_str(value, "variations_delimiter", "comma"),
            _clamped_int(value.get("margin_size"), 0, minimum=0, maximum=256),
        )
    if name == "prompts from file or textbox":
        return (
            _script_arg_bool(value, "iterate_seed", False, "checkbox_iterate"),
            _script_arg_bool(value, "same_seed", False, "checkbox_iterate_batch"),
            _script_arg_str(value, "prompt_position", "start"),
            _script_arg_str(value, "prompt_text", "", "prompt_txt"),
        )
    if name == "x/y/z plot":
        return _source_xyz_script_args_tuple(value, is_img2img=str(mode or "").strip().casefold() == "img2img")
    if name == "loopback":
        return (
            _clamped_int(value.get("loops"), 2, minimum=1, maximum=32),
            _clamped_float(value.get("final_denoising_strength"), 0.5, minimum=0.0, maximum=1.0),
            _script_arg_str(value, "denoising_curve", "Linear"),
        )
    if name == "sd upscale":
        return (
            _clamped_int(value.get("overlap"), 64, minimum=0, maximum=256),
            _script_arg_str(value, "upscaler", "None", "upscaler_index"),
            _clamped_float(value.get("scale_factor"), 2.0, minimum=1.0, maximum=8.0),
            _script_arg_bool(value, "save_to_extras", False, "override"),
        )
    return None


def _source_script_args_tuple(value: object, *, script: object = None, mode: object = None) -> tuple[object, ...]:
    if value is None:
        return ()
    if isinstance(value, tuple):
        return value
    if isinstance(value, list):
        return tuple(value)
    if isinstance(value, dict):
        api_values = value.get("api_script_args")
        if isinstance(api_values, (list, tuple)):
            return tuple(api_values)
        named_values = _source_named_script_args_tuple(value, script=script, mode=mode)
        if named_values is not None:
            return named_values
        return tuple(item for key, item in value.items() if key != "alwayson_scripts")
    return (value,)


def _source_passed_alwayson_scripts(request: object) -> dict[str, Any]:
    script_args = getattr(request, "script_args", None)
    if not isinstance(script_args, dict):
        return {}
    value = script_args.get("alwayson_scripts")
    if isinstance(value, dict):
        return {str(key): item for key, item in value.items()}
    return {}


def _source_alwayson_args(*args: object) -> dict[str, list[object]]:
    return {"args": list(args)}


def _source_set_alwayson_default(scripts: dict[str, Any], name: str, value: dict[str, Any]) -> None:
    target = name.strip().casefold()
    if any(str(key or "").strip().casefold() == target for key in scripts):
        return
    scripts[name] = value


def _source_adetailer_arg_dict(value: object) -> dict[str, object]:
    return adetailer_normalized_args(value)


def _source_adetailer_args(request: object) -> list[object]:
    if not bool(getattr(request, "adetailer_enabled", False)):
        return []
    raw_args = getattr(request, "adetailer_args", None)
    if isinstance(raw_args, dict):
        items = [raw_args]
    elif isinstance(raw_args, (list, tuple)):
        items = [item for item in raw_args if isinstance(item, dict)]
    else:
        items = []
    if not items:
        items = [{"ad_model": "None"}]
    args = [_source_adetailer_arg_dict(item) for item in items]
    return [True, bool(getattr(request, "adetailer_skip_img2img", False)), *args]


def _source_regional_prompter_args(request: object) -> list[object]:
    if not bool(getattr(request, "regional_prompter_enabled", False)):
        return []
    raw_args = getattr(request, "regional_prompter_args", None)
    normalized_args = regional_prompter_arg_dict(raw_args, enabled=True)
    mask_image = _image_from_any_value(normalized_args.get("mask"))
    if mask_image is not None:
        normalized_args["mask"] = "data:image/png;base64," + _encode_api_image(mask_image)
    return regional_prompter_arg_list(normalized_args, enabled=True)


def _source_forge_couple_mask_value(value: object) -> str:
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("data:") and "," in text:
            text = text.split(",", 1)[1]
        if text:
            try:
                base64.b64decode(text, validate=True)
                return text
            except Exception:
                pass
    image = _image_from_any_value(value)
    if image is None:
        return ""
    return _encode_api_image(image.convert("L"))


def _source_forge_couple_args(request: object) -> list[object]:
    if not bool(getattr(request, "forge_couple_enabled", False)):
        return []
    raw_args = getattr(request, "forge_couple_args", None)
    is_img2img = _source_backend_mode(request) == "img2img"
    normalized_args = forge_couple_arg_dict(raw_args, enabled=True, is_img2img=is_img2img)
    if normalized_args.get("mode") == "Mask":
        mappings: list[dict[str, object]] = []
        for item in list(normalized_args.get("mapping") or []):
            if not isinstance(item, dict):
                continue
            mask = _source_forge_couple_mask_value(item.get("mask"))
            if not mask:
                continue
            mappings.append({"mask": mask, "weight": float(item.get("weight", 1.0) or 1.0)})
        normalized_args["mapping"] = mappings
    return forge_couple_arg_list(normalized_args, enabled=True, is_img2img=is_img2img)


def _source_dynamic_prompts_args(request: object) -> list[object]:
    if not bool(getattr(request, "dynamic_prompts_enabled", False)):
        return []
    raw_args = getattr(request, "dynamic_prompts_args", None)
    normalized_args = dynamic_prompts_arg_dict(raw_args, enabled=True)
    return dynamic_prompts_arg_list(normalized_args)


def _source_tipo_args(request: object) -> list[object]:
    if not bool(getattr(request, "tipo_enabled", False)):
        return []
    return tipo_arg_list(getattr(request, "tipo_args", None))


def _source_integrated_alwayson_scripts(request: object) -> dict[str, Any]:
    scripts: dict[str, Any] = {}
    mode = _source_backend_mode(request)
    if mode == "img2img" and bool(getattr(request, "multidiffusion_enabled", False)):
        scripts["MultiDiffusion Integrated"] = _source_alwayson_args(
            True,
            str(getattr(request, "multidiffusion_method", "Mixture of Diffusers") or "Mixture of Diffusers"),
            _clamped_int(getattr(request, "multidiffusion_tile_width", 768), 768, minimum=256, maximum=2048),
            _clamped_int(getattr(request, "multidiffusion_tile_height", 768), 768, minimum=256, maximum=2048),
            _clamped_int(getattr(request, "multidiffusion_tile_overlap", 64), 64, minimum=0, maximum=1024),
            _clamped_int(getattr(request, "multidiffusion_tile_batch_size", 1), 1, minimum=1, maximum=8),
        )
    rescale_cfg = _clamped_float(getattr(request, "rescale_cfg", 0.0), 0.0, minimum=0.0, maximum=1.0)
    if rescale_cfg >= 0.05:
        scripts["RescaleCFG"] = _source_alwayson_args(rescale_cfg)
    if bool(getattr(request, "never_oom_unet", False)) or bool(getattr(request, "never_oom_vae", False)):
        scripts["never oom integrated"] = _source_alwayson_args(
            bool(getattr(request, "never_oom_unet", False)),
            bool(getattr(request, "never_oom_vae", False)),
        )

    torch_compile_preset = str(getattr(request, "torch_compile_preset", "Automatic") or "Automatic").strip()
    if torch_compile_preset and torch_compile_preset.casefold() != "automatic":
        scripts["torch compile integrated"] = _source_alwayson_args(torch_compile_preset)

    if bool(getattr(request, "spectrum_enabled", False)):
        scripts["spectrum integrated"] = _source_alwayson_args(
            True,
            _clamped_float(getattr(request, "spectrum_prediction_weighting", 0.25), 0.25, minimum=0.0, maximum=1.0),
            _clamped_int(getattr(request, "spectrum_polynomial_degree", 6), 6, minimum=1, maximum=8),
            _clamped_float(getattr(request, "spectrum_regularization", 0.5), 0.5, minimum=0.0, maximum=2.0),
            _clamped_int(getattr(request, "spectrum_cache_window", 2), 2, minimum=1, maximum=10),
            _clamped_float(getattr(request, "spectrum_window_growth", 0.0), 0.0, minimum=0.0, maximum=2.0),
            _clamped_int(getattr(request, "spectrum_warmup_steps", 6), 6, minimum=0, maximum=20),
            _clamped_float(getattr(request, "spectrum_stop_caching_step", 0.9), 0.9, minimum=0.0, maximum=1.0),
        )

    if mode == "img2img" and bool(getattr(request, "soft_inpainting_enabled", False)):
        scripts["soft inpainting"] = _source_alwayson_args(
            True,
            _clamped_float(getattr(request, "soft_inpainting_schedule_bias", 1.0), 1.0, minimum=0.0, maximum=8.0),
            _clamped_float(getattr(request, "soft_inpainting_preservation_strength", 0.5), 0.5, minimum=0.0, maximum=8.0),
            _clamped_float(getattr(request, "soft_inpainting_transition_contrast_boost", 4.0), 4.0, minimum=1.0, maximum=32.0),
            _clamped_float(getattr(request, "soft_inpainting_mask_influence", 0.0), 0.0, minimum=0.0, maximum=1.0),
            _clamped_float(getattr(request, "soft_inpainting_difference_threshold", 0.5), 0.5, minimum=0.0, maximum=8.0),
            _clamped_float(getattr(request, "soft_inpainting_difference_contrast", 2.0), 2.0, minimum=0.0, maximum=8.0),
        )

    if bool(getattr(request, "image_stitch_enabled", False)):
        references = _source_image_stitch_references(request)
        if references:
            scripts["多图拼接参考"] = _source_alwayson_args(
                True,
                references,
                _clamped_int(getattr(request, "image_stitch_max_dim", 1024), 1024, minimum=0, maximum=2048),
            )

    if bool(getattr(request, "modulated_guidance_enabled", False)):
        clip_name = _optional_model_name(getattr(request, "modulated_guidance_clip", None))
        if clip_name is not None:
            scripts["调制引导控制"] = _source_alwayson_args(
                True,
                clip_name,
                str(getattr(request, "modulated_guidance_positive", "") or ""),
                str(getattr(request, "modulated_guidance_negative", "") or ""),
                _clamped_float(getattr(request, "modulated_guidance_weight", 3.0), 3.0, minimum=-20.0, maximum=20.0),
                _clamped_int(getattr(request, "modulated_guidance_start_layer", 0), 0, minimum=0, maximum=64),
                _clamped_int(getattr(request, "modulated_guidance_end_layer", -1), -1, minimum=-1, maximum=64),
            )

    if bool(getattr(request, "mahiro", False)):
        scripts["mahiro"] = _source_alwayson_args(True)

    adetailer_args = _source_adetailer_args(request)
    if adetailer_args:
        scripts["ADetailer"] = {"args": adetailer_args}
    regional_prompter_args = _source_regional_prompter_args(request)
    if regional_prompter_args:
        scripts["Regional Prompter"] = {"args": regional_prompter_args}
    forge_couple_args = _source_forge_couple_args(request)
    if forge_couple_args:
        scripts["Forge Couple"] = {"args": forge_couple_args}
    dynamic_prompts_args = _source_dynamic_prompts_args(request)
    if dynamic_prompts_args:
        scripts[DYNAMIC_PROMPTS_SCRIPT_BASE_NAME] = {"args": dynamic_prompts_args}
    tipo_args = _source_tipo_args(request)
    if tipo_args:
        scripts["TIPO"] = {"args": tipo_args}

    return scripts


def _source_controlnet_units(request: object) -> list[dict[str, object]]:
    units = list(getattr(request, "controlnet_units", []) or [])
    if not units and bool(getattr(request, "controlnet_enabled", False)):
        units = [
            {
                "enabled": bool(getattr(request, "controlnet_enabled", False)),
                "module": getattr(request, "controlnet_module", "None"),
                "model": getattr(request, "controlnet_model", "None"),
                "weight": getattr(request, "controlnet_weight", 1.0),
                "resize_mode": getattr(request, "controlnet_resize_mode", "Crop and Resize"),
                "guidance_start": getattr(request, "controlnet_guidance_start", 0.0),
                "guidance_end": getattr(request, "controlnet_guidance_end", 1.0),
                "pixel_perfect": getattr(request, "controlnet_pixel_perfect", False),
                "control_mode": getattr(request, "controlnet_control_mode", "Balanced"),
                "hr_option": getattr(request, "controlnet_hr_option", "Both"),
                "processor_res": getattr(request, "controlnet_processor_res", 512),
                "threshold_a": getattr(request, "controlnet_threshold_a", 0.5),
                "threshold_b": getattr(request, "controlnet_threshold_b", 0.5),
                "type_filter": getattr(request, "controlnet_type", getattr(request, "controlnet_type_filter", "All")),
            }
        ]
    return [unit for unit in units if isinstance(unit, dict)]


def _source_controlnet_unit_args(request: object) -> list[dict[str, object]]:
    args: list[dict[str, object]] = []
    for index, unit in enumerate(_source_controlnet_units(request)):
        if not bool(unit.get("enabled")):
            continue
        generated_image = _encode_source_controlnet_image(unit.get("generated_image"))
        image = _encode_source_controlnet_image(unit.get("image"))
        if bool(unit.get("preview_as_input")) and generated_image:
            image = image or generated_image
        if not image:
            continue
        use_mask = bool(unit.get("use_mask"))
        args.append(
            {
                "use_preview_as_input": bool(unit.get("preview_as_input")) and bool(generated_image),
                "generated_image": generated_image or None,
                "mask_image": _encode_source_controlnet_image(unit.get("mask_image")) if use_mask else None,
                "mask_image_fg": _encode_source_controlnet_image(unit.get("mask_image_fg")) if use_mask else None,
                "hr_option": str(unit.get("hr_option") or "Both"),
                "enabled": True,
                "module": str(unit.get("module") or "None"),
                "model": str(unit.get("model") or "None"),
                "weight": _clamped_float(unit.get("weight", 1.0), 1.0, minimum=0.0, maximum=2.0),
                "image": image,
                "image_fg": _encode_source_controlnet_image(unit.get("image_fg")) or None,
                "resize_mode": str(unit.get("resize_mode") or "Crop and Resize"),
                "processor_res": _clamped_int(unit.get("processor_res", 512), 512, minimum=-1, maximum=4096),
                "threshold_a": _clamped_float(unit.get("threshold_a", 0.5), 0.5, minimum=-1.0, maximum=4096.0),
                "threshold_b": _clamped_float(unit.get("threshold_b", 0.5), 0.5, minimum=-1.0, maximum=4096.0),
                "guidance_start": _clamped_float(unit.get("guidance_start", 0.0), 0.0, minimum=0.0, maximum=1.0),
                "guidance_end": _clamped_float(unit.get("guidance_end", 1.0), 1.0, minimum=0.0, maximum=1.0),
                "pixel_perfect": bool(unit.get("pixel_perfect")),
                "control_mode": str(unit.get("control_mode") or "Balanced"),
                "type_filter": str(unit.get("type_filter") or unit.get("type") or "All"),
                "save_detected_map": True,
                "_idx": index,
            }
        )
    return args


def source_alwayson_scripts(request: object) -> dict[str, Any]:
    scripts = _source_passed_alwayson_scripts(request)
    for name, value in _source_integrated_alwayson_scripts(request).items():
        _source_set_alwayson_default(scripts, name, value)
    controlnet_args = _source_controlnet_unit_args(request)
    if controlnet_args:
        scripts["controlnet"] = {"args": controlnet_args}
    return scripts


def _decode_api_image(value: object) -> Image.Image | None:
    text = str(value or "").strip()
    if not text:
        return None
    if text.startswith("data:") and "," in text:
        text = text.split(",", 1)[1]
    try:
        raw = base64.b64decode(text)
        with Image.open(io.BytesIO(raw)) as image:
            return image.convert("RGB").copy()
    except Exception:
        return None


def source_api_payload(request: object) -> dict[str, Any]:
    native_payload = native_processing_payload(request)
    args = dict(native_payload.get("constructor_args") or {})
    mode = str(native_payload.get("mode") or "txt2img")
    args["prompt"] = _source_prompt_with_loras(args.get("prompt"), request)
    args["send_images"] = bool(getattr(request, "send_images", True))
    args["save_images"] = bool(getattr(request, "save_images", False))
    args["alwayson_scripts"] = source_alwayson_scripts(request)
    args["script_name"] = None if str(native_payload.get("script_name") or "None") == "None" else native_payload.get("script_name")
    args["script_args"] = list(_source_script_args_tuple(native_payload.get("script_args"), script=args["script_name"], mode=mode))
    args["force_task_id"] = str(getattr(request, "force_task_id", "") or f"forge-neo-source-api-{mode}")
    args["override_settings_restore_afterwards"] = bool(getattr(request, "override_settings_restore_afterwards", True))
    has_raw_script_name, raw_script_name = _source_api_raw_field(request, "script_name")
    if has_raw_script_name:
        args["script_name"] = raw_script_name
    has_raw_force_task_id, raw_force_task_id = _source_api_raw_field(request, "force_task_id")
    if has_raw_force_task_id:
        args["force_task_id"] = raw_force_task_id
    has_raw_infotext, raw_infotext = _source_api_raw_field(request, "infotext")
    if has_raw_infotext:
        args["infotext"] = raw_infotext
    else:
        infotext = str(getattr(request, "infotext", "") or "")
        if infotext:
            args["infotext"] = infotext
    if mode == "img2img":
        args.pop("init_images_count", None)
        args.pop("mask_present", None)
        if bool(getattr(request, "source_api_request", False)) and _source_api_has_field(request, "init_images"):
            args["init_images"] = list(getattr(request, "source_api_init_images", []) or [])
        else:
            init_image = _encode_api_image(getattr(request, "init_image", None))
            args["init_images"] = [init_image] if init_image else []
        if bool(getattr(request, "source_api_request", False)) and _source_api_has_field(request, "mask"):
            args["mask"] = getattr(request, "source_api_mask", None)
        else:
            mask_image = _encode_api_image(getattr(request, "mask_image", None))
            args["mask"] = mask_image or None
        args["include_init_images"] = bool(getattr(request, "include_init_images", False))
    args = _source_apply_raw_request_model_values(args, request)
    args = _source_payload_without_ignored_api_fields(args, request)
    args = _source_payload_with_infotext_unset_fields(args, request)
    return {
        "mode": mode,
        "endpoint": "/sdapi/v1/img2img" if mode == "img2img" else "/sdapi/v1/txt2img",
        "url": _source_api_base_url(),
        "payload": args,
        "source": native_payload.get("source"),
    }


def native_processing_context(request: object) -> dict[str, Any]:
    with native_runtime_env(request):
        availability = native_processing_availability()
        payload = native_processing_payload(request)
    return {
        "mode": "forge-neo-native-processing-context",
        "ready": bool(availability.get("ready")),
        "availability": availability,
        "payload": payload,
        "runnable": bool(availability.get("ready")) and payload.get("processing_class") is not None,
    }


def _load_native_processing_modules() -> dict[str, Any]:
    availability = native_processing_availability()
    raise RuntimeError("Native Forge processing modules are not available: " + ", ".join(availability.get("missing") or []))


def _script_args_tuple(value: object) -> tuple[object, ...]:
    if value is None:
        return ()
    if isinstance(value, tuple):
        return value
    if isinstance(value, list):
        return tuple(value)
    if isinstance(value, dict):
        return tuple(value.values())
    return (value,)


def _constructor_args_for_native(request: object, payload: dict[str, Any], modules: dict[str, Any]) -> dict[str, Any]:
    args = dict(payload.get("constructor_args") or {})
    shared = modules.get("shared")
    if shared is not None and hasattr(shared, "sd_model"):
        args.setdefault("sd_model", getattr(shared, "sd_model"))
    if payload.get("mode") == "img2img":
        init_image = getattr(request, "init_image", None)
        mask_image = getattr(request, "mask_image", None)
        args["init_images"] = [init_image] if init_image is not None else []
        args["mask"] = mask_image
    return args


def _processed_to_result(processed: object, request: object, *, elapsed_seconds: float):
    from forge_neo.runtime import ForgeNeoResult, build_infotext

    images, paths = _images_and_paths(
        list(getattr(processed, "images", []) or [])
        + list(getattr(processed, "extra_images", []) or [])
    )
    info = ""
    infotexts = list(getattr(processed, "infotexts", []) or [])
    info = str(infotexts[0] if infotexts else "")
    if not info:
        info = str(getattr(processed, "info", "") or "")
    if hasattr(processed, "js"):
        try:
            js_info = str(processed.js() or "")
        except Exception:
            js_info = ""
        if not info:
            info = js_info
    if not info:
        info = build_infotext(request, int(getattr(request, "seed", -1) or -1))
    seed = int(getattr(processed, "seed", getattr(request, "seed", -1)) or -1)
    debug_info = {}
    native_sampling_trace = list(getattr(processed, "native_sampling_trace", []) or [])
    if native_sampling_trace:
        debug_info["native_sampling_trace"] = native_sampling_trace
    return ForgeNeoResult(
        images=images,
        infotext=info,
        seed=seed,
        status="finished" if images or paths else "error",
        error="" if images or paths else "Native Forge processing finished without output.",
        output_paths=paths,
        elapsed_seconds=elapsed_seconds,
        debug_info=debug_info,
    )


def run_native_processing(request: object, progress_callback=None, control_callback=None, *, modules_override: dict[str, Any] | None = None):
    from forge_neo.runtime import ForgeNeoResult

    started = time.monotonic()
    if modules_override:
        return ForgeNeoResult(
            status="backend_unavailable",
            error=NATIVE_PROCESSING_REMOVED_MESSAGE,
            elapsed_seconds=time.monotonic() - started,
        )
    try:
        with native_runtime_env(request):
            payload = native_processing_payload(request)
            return ForgeNeoResult(
                status="backend_unavailable",
                error=NATIVE_PROCESSING_REMOVED_MESSAGE,
                elapsed_seconds=time.monotonic() - started,
                debug_info={"payload_mode": payload.get("mode"), "processing_class": payload.get("processing_class")},
            )
    except Exception as exc:
        return ForgeNeoResult(
            status="backend_unavailable",
            error=f"{type(exc).__name__}: {exc}",
            elapsed_seconds=time.monotonic() - started,
        )


def _post_source_api_json(endpoint: str, payload: dict[str, Any], *, timeout: float) -> dict[str, Any]:
    url = _source_api_base_url() + endpoint
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"source API HTTP {exc.code}: {body[:500]}") from exc
    return json.loads(body or "{}")


def run_source_api_processing(request: object, progress_callback=None, control_callback=None):
    from forge_neo.runtime import ForgeNeoResult

    started = time.monotonic()
    if control_callback is not None and control_callback() in {"stopped", "skipped"}:
        return ForgeNeoResult(status="stopped", error="Source API processing was interrupted before start.")
    source_payload = source_api_payload(request)
    if progress_callback is not None:
        progress_callback({"event": "progress", "progress": 0.05, "message": "source api processing started"})
    try:
        timeout = float(os.environ.get("FORGE_NEO_SOURCE_API_TIMEOUT", "1800") or 1800)
        response = _post_source_api_json(str(source_payload["endpoint"]), dict(source_payload["payload"]), timeout=timeout)
        images = [
            image
            for image in (_decode_api_image(value) for value in list(response.get("images") or []))
            if image is not None
        ]
        finished_without_images = not bool(getattr(request, "send_images", True))
        info = str(response.get("info") or "")
        if progress_callback is not None:
            progress_callback({"event": "finish", "progress": 1.0, "message": "source api processing finished"})
        return ForgeNeoResult(
            images=images,
            infotext=info,
            seed=int(getattr(request, "seed", -1) or -1),
            status="finished" if images or finished_without_images else "error",
            error="" if images or finished_without_images else "Source API finished without returned images.",
            elapsed_seconds=time.monotonic() - started,
            debug_info={"source_info": info},
        )
    except Exception as exc:
        return ForgeNeoResult(
            status="backend_unavailable",
            error=f"{type(exc).__name__}: {exc}",
            elapsed_seconds=time.monotonic() - started,
        )


def run_source_backend_processing(request: object, progress_callback=None, control_callback=None):
    from forge_neo.runtime_backend.source_runtime import run_source_backend_processing as run

    return run(request, progress_callback=progress_callback, control_callback=control_callback)


def _flatten_results(values: object) -> list[object]:
    if values is None:
        return []
    if isinstance(values, (str, Path, Image.Image)):
        return [values]
    if isinstance(values, (list, tuple)):
        rows: list[object] = []
        for item in values:
            rows.extend(_flatten_results(item))
        return rows
    return [values]


def _images_and_paths(values: object) -> tuple[list[Image.Image], list[str]]:
    images: list[Image.Image] = []
    paths: list[str] = []
    for item in _flatten_results(values):
        if isinstance(item, Image.Image):
            saved_as = str(getattr(item, "already_saved_as", "") or "").strip()
            if saved_as and Path(saved_as).is_file():
                paths.append(saved_as)
            images.append(item.copy())
            continue
        text = str(item or "").strip()
        if not text:
            continue
        path = Path(text)
        if path.is_file() and path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
            try:
                with Image.open(path) as image:
                    images.append(image.convert("RGB").copy())
                paths.append(str(path))
            except OSError:
                paths.append(str(path))
        elif path.exists():
            paths.append(str(path))
    return images, paths


def run_simpai_async_worker(
    request: object,
    progress_callback=None,
    control_callback=None,
    *,
    timeout_seconds: float | None = None,
):
    from forge_neo.runtime import ForgeNeoResult, build_infotext

    try:
        import modules.canvas_workbench_runner as runner
        import modules.async_worker as worker

        overrides = _api_overrides_from_request(request)
        args = runner.build_canvas_async_task_args(overrides, _enabled_loras(request), [], load_images=True)
        task = worker.AsyncTask(args=args)
        worker.add_task(task)
    except Exception as exc:
        return ForgeNeoResult(status="backend_unavailable", error=f"{type(exc).__name__}: {exc}")

    timeout = float(timeout_seconds or os.environ.get("FORGE_NEO_BACKEND_TIMEOUT", "1800") or 1800)
    started = time.monotonic()
    last_message = "queued"
    status = "finished"
    if progress_callback is not None:
        progress_callback({"event": "progress", "progress": 0.02, "message": "backend queued"})

    while time.monotonic() - started < timeout:
        if control_callback is not None:
            control_status = control_callback()
            if control_status in {"stopped", "skipped"}:
                task.last_stop = "stop" if control_status == "stopped" else "skip"
                status = control_status
                break
        while getattr(task, "yields", None):
            flag, product = task.yields.pop(0)
            if flag == "preview":
                try:
                    number, text, _image = product
                    progress = max(0.0, min(1.0, float(number) / 100.0))
                except Exception:
                    progress = 0.1
                    text = "backend preview"
                last_message = str(text or "backend preview")
                if progress_callback is not None:
                    progress_callback({"event": "progress", "progress": progress, "message": last_message})
            elif flag == "status":
                last_message = str(product or "backend status")
                if progress_callback is not None:
                    progress_callback({"event": "progress", "progress": 0.08, "message": last_message})
            elif flag in {"results", "finish"}:
                if flag == "finish":
                    images, paths = _images_and_paths(product)
                    if not images and not paths:
                        images, paths = _images_and_paths(getattr(task, "results", []))
                    if progress_callback is not None:
                        progress_callback({"event": "finish", "progress": 1.0, "message": "finished"})
                    return ForgeNeoResult(
                        images=images,
                        infotext=build_infotext(request, int(getattr(request, "seed", -1) or -1)),
                        seed=int(getattr(request, "seed", -1) or -1),
                        status="finished" if images or paths else "error",
                        error="" if images or paths else "Backend finished without output.",
                        output_paths=paths,
                        elapsed_seconds=time.monotonic() - started,
                    )
        if getattr(task, "last_stop", None) in {"stop", "skip"}:
            status = "stopped" if task.last_stop == "stop" else "skipped"
            break
        time.sleep(0.1)

    images, paths = _images_and_paths(getattr(task, "results", []))
    if not images and not paths and status == "finished":
        status = "timeout"
    if progress_callback is not None:
        progress_callback({"event": "finish", "progress": 1.0 if images or paths else 0.0, "message": status})
    return ForgeNeoResult(
        images=images,
        infotext=build_infotext(request, int(getattr(request, "seed", -1) or -1)),
        seed=int(getattr(request, "seed", -1) or -1),
        status=status,
        error="" if images or paths else f"Backend {status}: {last_message}",
        output_paths=paths,
        elapsed_seconds=time.monotonic() - started,
    )


def run_backend_generation(request: object, progress_callback=None, control_callback=None):
    from forge_neo.runtime import ForgeNeoResult

    adapter_mode = os.environ.get("FORGE_NEO_BACKEND_ADAPTER", "auto").strip().lower()
    if bool(getattr(args_manager.args, "disable_backend", False)):
        return ForgeNeoResult(
            status="backend_unavailable",
            error="Backend adapter is disabled by --disable-backend.",
        )
    if adapter_mode in {"0", "off", "none", "disabled"}:
        return ForgeNeoResult(
            status="backend_unavailable",
            error="Backend adapter disabled by FORGE_NEO_BACKEND_ADAPTER.",
        )
    if adapter_mode in {"auto", ""}:
        if auto_source_backend_preferred(request):
            return run_source_backend_processing(request, progress_callback=progress_callback, control_callback=control_callback)
        if auto_source_api_preferred(request):
            return run_source_api_processing(request, progress_callback=progress_callback, control_callback=control_callback)
        return run_native_processing(request, progress_callback=progress_callback, control_callback=control_callback)
    if adapter_mode in {"native", "forge", "processing"}:
        return run_native_processing(request, progress_callback=progress_callback, control_callback=control_callback)
    if adapter_mode in {"source", "source_api", "source-api", "reference", "reference_api"}:
        return run_source_api_processing(request, progress_callback=progress_callback, control_callback=control_callback)
    if adapter_mode in {"source_backend", "source-backend", "copied_source", "source_runtime", "source-runtime"}:
        return run_source_backend_processing(request, progress_callback=progress_callback, control_callback=control_callback)
    if adapter_mode in {"simpai", "async", "async_worker"}:
        preview = build_simpai_async_preview(request)
        if not preview.get("ok"):
            return ForgeNeoResult(
                status="backend_unavailable",
                error=str(preview.get("error") or (preview.get("preview") or {}).get("error") or "SimpAI backend preview failed."),
            )
        return run_simpai_async_worker(request, progress_callback=progress_callback, control_callback=control_callback)
    return ForgeNeoResult(
        status="backend_unavailable",
        error=f"Unsupported FORGE_NEO_BACKEND_ADAPTER={adapter_mode!r}. Use auto, native, source_api, source_backend, or simpai.",
    )
