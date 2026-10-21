from __future__ import annotations

import ast
import base64
import html as html_lib
import io
import ipaddress
import json
import math
import os
import socket
import sys
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import args_manager
import piexif
import piexif.helper
from fastapi import HTTPException
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, PlainTextResponse, RedirectResponse, Response
from PIL import Image, PngImagePlugin

from forge_neo.adetailer_compat import adetailer_default_args, adetailer_model_names
from forge_neo.dynamic_prompts_compat import dynamic_prompts_arg_dict, dynamic_prompts_script_arg_specs, dynamic_prompts_script_name_matches
from forge_neo.forge_couple_compat import (
    forge_couple_args_active,
    forge_couple_script_arg_specs,
)
from forge_neo.regional_prompter_compat import (
    regional_prompter_args_active,
    regional_prompter_script_arg_specs,
)
from forge_neo.runtime_backend import (
    backend_capabilities,
    build_simpai_async_preview,
    native_processing_availability,
    native_processing_context,
    native_processing_payload,
)
from forge_neo.extensions import list_extensions
from forge_neo.models import (
    UI_PRESETS,
    find_model_path,
    find_upscale_model_path,
    initial_model_choices,
    model_roots_for_catalog,
    refresh_model_choices,
    sampling_methods,
    scheduler_types,
    save_forge_neo_config_values,
    source_config_value,
    split_module_selection,
    upscale_model_names,
)
from forge_neo.png_info import parse_generation_parameters, parse_generation_parameters_source_api, png_info_items, png_info_items_source_api
from forge_neo.restart import ensure_server_state
from forge_neo.runtime import ForgeNeoExtrasRequest, ForgeNeoRequest, generate, run_extras
from forge_neo.settings import SETTINGS_SCHEMA, load_settings, save_settings, sysinfo_snapshot
from forge_neo.styles import load_styles
from forge_neo.worker import skip_current, stop_current, unload_runtime_state, worker


_STARTED_AT = time.perf_counter()
_SOURCE_CMD_FLAG_DEFAULTS_CACHE: dict[str, Any] | None = None
LATENT_UPSCALE_MODES = {
    "Latent": {"mode": "bilinear", "antialias": False},
    "Latent (antialiased)": {"mode": "bilinear", "antialias": True},
    "Latent (bicubic)": {"mode": "bicubic", "antialias": False},
    "Latent (bicubic antialiased)": {"mode": "bicubic", "antialias": True},
    "Latent (nearest)": {"mode": "nearest", "antialias": False},
    "Latent (nearest-exact)": {"mode": "nearest-exact", "antialias": False},
}
SOURCE_SAMPLER_API_METADATA: dict[str, dict[str, Any]] = {
    "DPM++ 2M": {"aliases": ["k_dpmpp_2m"], "options": {"scheduler": "karras"}},
    "DPM++ SDE": {
        "aliases": ["k_dpmpp_sde"],
        "options": {"scheduler": "karras", "second_order": True, "brownian_noise": True},
    },
    "DPM++ 2M SDE": {
        "aliases": ["k_dpmpp_2m_sde"],
        "options": {"scheduler": "exponential", "brownian_noise": True},
    },
    "DPM++ 3M SDE": {
        "aliases": ["k_dpmpp_3m_sde"],
        "options": {"scheduler": "exponential", "discard_next_to_last_sigma": True, "brownian_noise": True},
    },
    "DPM++ 2s a RF": {"aliases": ["sample_dpmpp_2s_ancestral_RF"], "options": {}},
    "Flux Realistic": {"aliases": ["sample_dpmpp_2s_ancestral_RF"], "options": {}},
    "Euler a": {"aliases": ["k_euler_a", "k_euler_ancestral"], "options": {"uses_ensd": True}},
    "Euler": {"aliases": ["k_euler"], "options": {}},
    "ER SDE": {"aliases": ["er_sde"], "options": {}},
    "LCM": {"aliases": ["k_lcm"], "options": {}},
    "LMS": {"aliases": ["k_lms"], "options": {}},
    "Heun": {"aliases": ["k_heun"], "options": {"second_order": True}},
    "DPM2": {
        "aliases": ["k_dpm_2"],
        "options": {"scheduler": "karras", "discard_next_to_last_sigma": True, "second_order": True},
    },
    "Res Multistep": {"aliases": ["res_multistep"], "options": {}},
    "Kohaku LoNyu Yog": {"aliases": ["Kohaku_LoNyu_Yog"], "options": {}},
    "Restart": {"aliases": ["restart"], "options": {"scheduler": "karras", "second_order": True}},
    "UniPC": {"aliases": ["unipc"], "options": {"discard_next_to_last_sigma": True}},
    "DDIM": {"aliases": ["ddim"], "options": {}},
    "PLMS": {"aliases": ["plms"], "options": {}},
    "DPM++ 2M CFG++": {"aliases": ["dpmpp_2m_cfg_pp"], "options": {"scheduler": "karras"}},
    "Euler a CFG++": {"aliases": ["euler_ancestral_cfg_pp"], "options": {"uses_ensd": True}},
    "Euler CFG++": {"aliases": ["euler_cfg_pp"], "options": {}},
}
SOURCE_SCHEDULER_API_ROWS: tuple[dict[str, Any], ...] = (
    {"name": "automatic", "label": "Automatic", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "karras", "label": "Karras", "aliases": None, "default_rho": 7.0, "need_inner_model": False},
    {"name": "exponential", "label": "Exponential", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "polyexponential", "label": "Polyexponential", "aliases": None, "default_rho": 1.0, "need_inner_model": False},
    {"name": "normal", "label": "Normal", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "simple", "label": "Simple", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "uniform", "label": "Uniform", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "sgm_uniform", "label": "SGM Uniform", "aliases": ["SGMUniform"], "default_rho": -1.0, "need_inner_model": True},
    {"name": "linear_quadratic", "label": "Linear Quadratic", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "kl_optimal", "label": "KL Optimal", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "ddim", "label": "DDIM", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "align_your_steps", "label": "Align Your Steps", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "beta", "label": "Beta", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "turbo", "label": "Turbo", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "bong_tangent", "label": "Bong Tangent", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
    {"name": "flow_match", "label": "FlowMatchEulerDiscrete", "aliases": None, "default_rho": -1.0, "need_inner_model": True},
    {"name": "flux2", "label": "Flux2", "aliases": None, "default_rho": -1.0, "need_inner_model": False},
)
SOURCE_OPTION_ALIASES: dict[str, str] = {
    "samples_save": "save_samples",
    "outdir_samples": "output_dir",
    "outdir_videos": "outdir_video",
    "save_images_replace_action": "save_images_existing_action",
    "save_images_before_face_restoration": "save_before_face_restoration",
    "save_images_before_highres_fix": "save_before_highres_fix",
    "save_images_before_color_correction": "save_before_color_correction",
    "grid_text_active_color": "grid_text_color",
    "grid_text_inactive_color": "grid_inactive_text_color",
    "use_save_to_dirs_for_ui": "save_to_dirs_for_ui",
}
SOURCE_OPTION_DEFAULTS: dict[str, Any] = {
    "n_rows": -1.0,
    "export_for_4chan": False,
    "img_downscale_threshold": 4.0,
    "target_side_length": 4096.0,
    "img_max_size_mp": 100.0,
    "use_original_name_batch": True,
    "notification_audio": False,
    "notification_volume": 100.0,
    "video_player_auto": True,
    "video_player_loop": False,
    "video_container": "mp4",
    "video_explanation": "Parameters for encoding videos using FFmpeg.",
    "profiling_explanation": "These settings allow PyTorch profiling during generation.",
    "sd_vae_explanation": "VAE transforms images to and from latent space.",
    "token_merging_explanation": "Token Merging speeds up diffusion by merging redundant tokens.",
    "refiner_lora_explanation": "Use Lora replacements to load different LoRAs between the normal pass and refiner pass.",
    "infotext_explanation": "Infotext contains generation parameters and can be reused to restore settings.",
    "prevent_screen_sleep_during_generation": True,
    "ddim_discretize": "uniform",
    "svdq_flux_exp": "Flux",
    "svdq_qwen_exp": "Qwen",
    "VERSION_UID": "PY313",
    "settings_in_ui": "This page allows you to add some settings to the main interface of txt2img and img2img tabs.",
    "temp_dir": "tmp",
    "clean_temp_dir_at_start": True,
    "save_incomplete_images": False,
    "sd_vae_overrides_per_model_preferences": True,
    "extra_networks_tree_view_style": "Dirs",
    "extra_networks_hidden_models": "When searched",
    "extra_networks_card_text_scale": 1.0,
    "extra_networks_card_show_desc": True,
    "extra_networks_card_description_is_html": False,
    "extra_networks_card_order_field": "Path",
    "extra_networks_card_order": "Ascending",
    "extra_networks_add_text_separator": " ",
    "ui_extra_networks_tab_reorder": "",
    "extra_networks_tree_view_default_enabled": True,
    "extra_networks_tree_view_default_width": 180.0,
    "extra_networks_show_hidden_directories": True,
    "extra_networks_dir_button_function": False,
    "live_previews_image_format": "jpeg",
    "show_progress_grid": True,
    "show_progress_type": "RGB",
    "live_preview_fast_interrupt": False,
    "js_live_preview_in_modal_lightbox": False,
    "show_progress_every_n_steps": 1.0,
    "eta_ddim": 0.0,
    "eta_ancestral": 1.0,
    "s_churn": 0.0,
    "s_tmin": 0.0,
    "s_tmax": 0.0,
    "s_noise": 1.0,
    "sigma_min": 0.0,
    "sigma_max": 0.0,
    "rho": 0.0,
    "eta_noise_seed_delta": 0,
    "always_discard_next_to_last_sigma": False,
    "sgm_noise_multiplier": False,
    "beta_dist_alpha": 0.6,
    "beta_dist_beta": 0.6,
    "use_dynamic_shifting": False,
    "invert_sigmas": False,
    "use_karras_sigmas": False,
    "use_exponential_sigmas": False,
    "use_beta_sigmas": False,
    "stochastic_sampling": False,
    "disabled_extensions": [],
    "disable_all_extensions": "none",
}
SOURCE_OPTION_EMPTY_DEFAULTS: tuple[str, ...] = (
    "div00",
    "div01",
    "divxl",
    "sdxl_01",
    "sdxl_00",
    "sdxl_11",
    "sdxl_10",
    "divlumina",
    "divmisc",
    "div_tome",
    "extra_tree_div",
    "extra_dirs_div",
    "div_prompt",
    "div_classic",
    "restore_config_state_file",
)
SOURCE_PRESET_EMPTY_OPTION_SUFFIXES: tuple[str, ...] = (
    "t2i_ss1",
    "t2i_ss0",
    "i2i_ss1",
    "i2i_ss0",
    "steps1",
    "steps0",
    "cfg1",
    "cfg0",
    "dcfg1",
    "dcfg0",
    "batch1",
    "batch0",
    "t2i_dim1",
    "t2i_dim0",
    "i2i_dim1",
    "i2i_dim0",
)
SOURCE_PRESET_DCFG_EMPTY_OPTIONS: set[str] = {"xl", "flux", "krea2", "lumina", "zit", "anima"}
_MISSING_SOURCE_OPTION = object()
_SIMPLEMODELS_INFO_CACHE: tuple[str, int, dict[str, Any]] | None = None
_SIMPLEMODELS_INFO_CATALOG_ALIASES: dict[str, tuple[str, ...]] = {
    "checkpoints": ("checkpoints", "diffusion_models", "unet", "Stable-diffusion"),
    "diffusion_models": ("diffusion_models", "unet", "checkpoints", "Stable-diffusion"),
    "vae": ("vae", "VAE"),
    "clip": ("text_encoders", "clip"),
    "text_encoders": ("text_encoders", "clip"),
    "loras": ("loras", "Lora"),
    "embeddings": ("embeddings",),
    "controlnet": ("controlnet", "ControlNet"),
}
_SDAPI_COMMON_PARAMETER_DEFAULTS: dict[str, Any] = {
    "prompt": "",
    "negative_prompt": "",
    "styles": None,
    "seed": -1,
    "subseed": -1,
    "subseed_strength": 0.0,
    "seed_resize_from_h": -1,
    "seed_resize_from_w": -1,
    "seed_enable_extras": True,
    "sampler_name": None,
    "scheduler": None,
    "batch_size": 1,
    "n_iter": 1,
    "steps": 50,
    "cfg_scale": 7.0,
    "distilled_cfg_scale": 3.5,
    "width": 512,
    "height": 512,
    "restore_faces": None,
    "tiling": None,
    "do_not_save_samples": False,
    "do_not_save_grid": False,
    "eta": None,
    "denoising_strength": None,
    "s_min_uncond": None,
    "s_churn": None,
    "s_tmax": None,
    "s_tmin": None,
    "s_noise": None,
    "override_settings": None,
    "override_settings_restore_afterwards": True,
    "refiner_checkpoint": None,
    "refiner_switch_at": None,
    "disable_extra_networks": False,
    "firstpass_image": None,
    "comments": None,
    "sampler_index": "Euler",
    "script_name": None,
    "script_args": [],
    "send_images": True,
    "save_images": False,
    "alwayson_scripts": {},
    "force_task_id": None,
    "infotext": None,
}
_SDAPI_GENERATION_API_NOT_ALLOWED_FIELDS = {"seed_enable_extras"}
_SDAPI_TXT2IMG_PARAMETER_DEFAULTS: dict[str, Any] = {
    "enable_hr": False,
    "denoising_strength": 0.75,
    "firstphase_width": 0,
    "firstphase_height": 0,
    "hr_scale": 2.0,
    "hr_upscaler": None,
    "hr_second_pass_steps": 0,
    "hr_resize_x": 0,
    "hr_resize_y": 0,
    "hr_checkpoint_name": None,
    "hr_additional_modules": None,
    "hr_sampler_name": None,
    "hr_scheduler": None,
    "hr_prompt": "",
    "hr_negative_prompt": "",
    "hr_cfg": 1.0,
    "hr_distilled_cfg": 3.5,
}
_SDAPI_IMG2IMG_PARAMETER_DEFAULTS: dict[str, Any] = {
    "init_images": None,
    "resize_mode": 0,
    "denoising_strength": 0.75,
    "image_cfg_scale": None,
    "mask": None,
    "mask_blur": 4,
    "mask_round": True,
    "inpainting_fill": 0,
    "inpaint_full_res": True,
    "inpaint_full_res_padding": 0,
    "inpainting_mask_invert": 0,
    "initial_noise_multiplier": None,
    "latent_mask": None,
    "include_init_images": False,
}
_SDAPI_COMMON_SOURCE_REQUEST_FIELDS = set(_SDAPI_COMMON_PARAMETER_DEFAULTS) - _SDAPI_GENERATION_API_NOT_ALLOWED_FIELDS
_SDAPI_TXT2IMG_SOURCE_REQUEST_FIELDS = _SDAPI_COMMON_SOURCE_REQUEST_FIELDS | set(_SDAPI_TXT2IMG_PARAMETER_DEFAULTS)
_SDAPI_IMG2IMG_SOURCE_REQUEST_FIELDS = _SDAPI_COMMON_SOURCE_REQUEST_FIELDS | set(_SDAPI_IMG2IMG_PARAMETER_DEFAULTS)


def _sdapi_generation_source_request_fields(mode: str) -> set[str]:
    return _SDAPI_IMG2IMG_SOURCE_REQUEST_FIELDS if mode == "img2img" else _SDAPI_TXT2IMG_SOURCE_REQUEST_FIELDS


def _sdapi_generation_source_schema_payload(payload: dict[str, Any], *, mode: str) -> dict[str, Any]:
    fields = _sdapi_generation_source_request_fields(mode)
    return {
        str(key): value
        for key, value in (payload or {}).items()
        if str(key) in fields
    }


def startup_profile_payload() -> dict[str, Any]:
    elapsed = max(0.0, time.perf_counter() - _STARTED_AT)
    snapshot = worker.snapshot()
    records = {
        "forge_neo/api/import": 0.0,
        "forge_neo/api/routes": 0.0,
        "forge_neo/runtime/status": 0.0,
        "forge_neo/uptime": elapsed,
    }
    if snapshot.get("status") == "running":
        records["forge_neo/worker/running"] = float(snapshot.get("progress", 0.0) or 0.0)
    return {
        "total": elapsed,
        "records": records,
        "entry": "webui-forge-neo.py",
        "current_task": "forge_neo",
        "mode": "forge-neo-startup-profile",
        "status": snapshot.get("status", "idle"),
    }


def quicksettings_hint_payload() -> list[dict[str, str]]:
    rows = [
        {"name": "forge_neo_preset", "label": "UI Preset"},
        {"name": "forge_neo_checkpoint", "label": "Checkpoint"},
        {"name": "forge_neo_text_encoders", "label": "VAE / Text Encoder"},
        {"name": "forge_neo_low_bits", "label": "Diffusion in Low Bits"},
    ]
    rows.extend({"name": item.key, "label": item.label_en} for item in SETTINGS_SCHEMA)
    return rows


def _runtime_sysinfo_module() -> Any:
    return sys.modules.get("modules.sysinfo") or sys.modules.get("forge_neo.runtime_backend.modules.sysinfo")


def options_payload() -> Any:
    runtime_sysinfo = _runtime_sysinfo_module()
    get_config = getattr(runtime_sysinfo, "get_config", None) if runtime_sysinfo is not None else None
    if callable(get_config):
        values = _jsonable(get_config())
        if isinstance(values, dict):
            raw_preset = str(source_config_value("forge_preset", "klein") or "klein").strip().lower()
            values = dict(values)
            values["forge_preset"] = raw_preset if raw_preset in UI_PRESETS else "klein"
        return values

    values = dict(load_settings())
    for source_key, target_key in SOURCE_OPTION_ALIASES.items():
        if source_key not in values and target_key in values:
            values[source_key] = values[target_key]
    for source_key, default in SOURCE_OPTION_DEFAULTS.items():
        if source_key not in values:
            values[source_key] = source_config_value(source_key, list(default) if isinstance(default, list) else default)
    for source_key in SOURCE_OPTION_EMPTY_DEFAULTS:
        values.setdefault(source_key, source_config_value(source_key, ""))
    for preset_key in UI_PRESETS:
        for suffix in SOURCE_PRESET_EMPTY_OPTION_SUFFIXES:
            if suffix in {"dcfg1", "dcfg0"} and preset_key not in SOURCE_PRESET_DCFG_EMPTY_OPTIONS:
                continue
            source_key = f"{preset_key}_{suffix}"
            values.setdefault(source_key, source_config_value(source_key, ""))
    values.update(_source_model_options_payload())
    values["sd_checkpoint_hash"] = _sd_checkpoint_hash_option(values)
    if "CLIP_stop_at_last_layers" in values:
        values["CLIP_stop_at_last_layers"] = float(values.get("CLIP_stop_at_last_layers") or 0)
    return values


def _source_option_list(value: object) -> list[Any]:
    if value is _MISSING_SOURCE_OPTION or value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [item for item in value if str(item or "").strip()]
    text = str(value or "").strip()
    return [text] if text else []


def _source_model_options_payload() -> dict[str, Any]:
    raw_preset = str(source_config_value("forge_preset", "klein") or "klein").strip().lower()
    preset = raw_preset if raw_preset in UI_PRESETS else "klein"
    dtype = source_config_value("forge_unet_storage_dtype", "Automatic") or "Automatic"
    checkpoint = source_config_value("sd_model_checkpoint", _MISSING_SOURCE_OPTION)
    modules = source_config_value("forge_additional_modules", _MISSING_SOURCE_OPTION)

    values: dict[str, Any] = {
        "forge_preset": preset,
        "forge_unet_storage_dtype": dtype,
        "forge_additional_modules": _source_option_list(modules),
    }
    if checkpoint is not _MISSING_SOURCE_OPTION:
        values["sd_model_checkpoint"] = checkpoint

    for preset_key in UI_PRESETS:
        values[f"forge_checkpoint_{preset_key}"] = source_config_value(f"forge_checkpoint_{preset_key}", None)
        values[f"forge_additional_modules_{preset_key}"] = _source_option_list(
            source_config_value(f"forge_additional_modules_{preset_key}", [])
        )
        values[f"forge_unet_storage_dtype_{preset_key}"] = (
            source_config_value(f"forge_unet_storage_dtype_{preset_key}", "Automatic") or "Automatic"
        )
    return values


def _sd_checkpoint_hash_option(values: dict[str, Any]) -> str:
    checkpoint = values.get("sd_model_checkpoint", _MISSING_SOURCE_OPTION)
    if checkpoint is _MISSING_SOURCE_OPTION or checkpoint is None:
        preset = str(values.get("forge_preset") or "klein").strip().lower()
        checkpoint = values.get(f"forge_checkpoint_{preset}")
    text = str(checkpoint or "").strip()
    if not text or text == "None":
        return ""
    filename = find_model_path(text, "diffusion_models", "checkpoints")
    short_hash, sha256 = _model_info_hash_values(text, filename, ("diffusion_models", "checkpoints"))
    return sha256 or short_hash


def _settings_update_from_api_values(values: dict[str, Any]) -> dict[str, Any]:
    raw = dict(values or {})
    update = dict(raw)
    for source_key, target_key in SOURCE_OPTION_ALIASES.items():
        if source_key in raw and target_key not in raw:
            update[target_key] = raw[source_key]
        update.pop(source_key, None)
    return update


def set_options_payload(values: dict[str, Any] | None) -> None:
    update_values = dict(values or {})
    if "forge_preset" in update_values:
        save_forge_neo_config_values({"forge_preset": update_values.pop("forge_preset")})
    if not update_values:
        return None

    runtime_sysinfo = _runtime_sysinfo_module()
    set_config = getattr(runtime_sysinfo, "set_config", None) if runtime_sysinfo is not None else None
    if callable(set_config):
        set_config(update_values)
        return None
    current = load_settings()
    current.update(_settings_update_from_api_values(update_values))
    save_settings(current)
    return None


def sysinfo_text() -> str:
    return json.dumps(sysinfo_snapshot(), ensure_ascii=False, indent=2)


def _sysinfo_response(*, attachment: bool = False) -> PlainTextResponse:
    filename = f"sysinfo-{datetime.now(timezone.utc).strftime('%Y-%m-%d-%H-%M')}.json"
    disposition = "attachment" if attachment else "inline"
    return PlainTextResponse(
        sysinfo_text(),
        headers={"Content-Disposition": f'{disposition}; filename="{filename}"'},
        media_type="application/json",
    )


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(item) for item in value]
    return str(value)


def _copy_sdapi_parameter_defaults(defaults: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in defaults.items():
        if isinstance(value, dict):
            result[key] = dict(value)
        elif isinstance(value, list):
            result[key] = list(value)
        else:
            result[key] = value
    return result


def _to_int(value: Any, default: int, *, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        result = int(float(str(value).strip()))
    except Exception:
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _to_float(value: Any, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        result = float(str(value).strip())
    except Exception:
        result = default
    if minimum is not None:
        result = max(minimum, result)
    if maximum is not None:
        result = min(maximum, result)
    return result


def _to_optional_float(value: Any, *, minimum: float | None = None, maximum: float | None = None) -> float | None:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return _to_float(value, 0.0, minimum=minimum, maximum=maximum)


def _to_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def _to_optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    return _to_bool(value, False)


def _as_strings(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item or "").strip()]
    text = str(value).strip()
    return [text] if text else []


def _sdapi_request_image_options() -> tuple[bool, bool, str]:
    shared_module = _runtime_shared_module()
    opts = getattr(shared_module, "opts", None) if shared_module is not None else None
    if opts is not None:
        return (
            bool(getattr(opts, "api_enable_requests", True)),
            bool(getattr(opts, "api_forbid_local_requests", True)),
            str(getattr(opts, "api_useragent", "") or ""),
        )
    settings = load_settings()
    return (
        _to_bool(settings.get("api_enable_requests"), True),
        _to_bool(settings.get("api_forbid_local_requests"), True),
        str(settings.get("api_useragent") or ""),
    )


def _sdapi_verify_url(url: str) -> bool:
    try:
        parsed_url = urllib.parse.urlparse(url)
        domain_name = parsed_url.netloc
        host = socket.gethostbyname_ex(domain_name)
        for ip in host[2]:
            ip_addr = ipaddress.ip_address(ip)
            if not ip_addr.is_global:
                return False
    except Exception:
        return False
    return True


def _decode_sdapi_url_image(url: str) -> Image.Image:
    enable_requests, forbid_local_requests, useragent = _sdapi_request_image_options()
    if not enable_requests:
        raise HTTPException(status_code=500, detail="Requests not allowed")
    if forbid_local_requests and not _sdapi_verify_url(url):
        raise HTTPException(status_code=500, detail="Request to local resource not allowed")

    import requests

    headers = {"user-agent": useragent} if useragent else {}
    response = requests.get(url, timeout=30, headers=headers)
    try:
        return Image.open(io.BytesIO(response.content)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Invalid image url") from exc


def _decode_base64_image(value: Any) -> Image.Image:
    if isinstance(value, Image.Image):
        return value.convert("RGB")
    text = str(value or "").strip()
    if not text:
        raise HTTPException(status_code=500, detail="Invalid encoded image")
    if text.startswith("http://") or text.startswith("https://"):
        return _decode_sdapi_url_image(text)
    if text.startswith("data:image/") and "," in text:
        text = text.split(",", 1)[1]
    try:
        raw = base64.b64decode(text, validate=False)
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Invalid encoded image") from exc


def _sdapi_image_encode_options() -> tuple[str, int, bool]:
    shared_module = _runtime_shared_module()
    opts = getattr(shared_module, "opts", None) if shared_module is not None else None
    if opts is not None:
        samples_format = str(getattr(opts, "samples_format", "png") or "png").lower()
        jpeg_quality = _to_int(getattr(opts, "jpeg_quality", 80), 80, minimum=1, maximum=100)
        webp_lossless = bool(getattr(opts, "webp_lossless", False))
        return samples_format, jpeg_quality, webp_lossless

    settings = load_settings()
    samples_format = str(settings.get("samples_format", "png") or "png").lower()
    jpeg_quality = _to_int(settings.get("jpeg_quality", 80), 80, minimum=1, maximum=100)
    webp_lossless = bool(settings.get("webp_lossless", False))
    return samples_format, jpeg_quality, webp_lossless


def _sdapi_exif_bytes(parameters: str) -> bytes:
    return piexif.dump(
        {"Exif": {piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(str(parameters or ""), encoding="unicode")}}
    )


def _encode_base64_image(image: Image.Image, infotext: str = "") -> str:
    samples_format, jpeg_quality, webp_lossless = _sdapi_image_encode_options()
    parameters = str(infotext or getattr(image, "info", {}).get("parameters", "") or "")
    buffer = io.BytesIO()

    if samples_format == "png":
        metadata = PngImagePlugin.PngInfo()
        use_metadata = False
        for key, value in (getattr(image, "info", {}) or {}).items():
            if isinstance(key, str) and isinstance(value, str):
                metadata.add_text(key, value)
                use_metadata = True
        if parameters:
            metadata.add_text("parameters", parameters)
            use_metadata = True
        image.save(buffer, format="PNG", pnginfo=metadata if use_metadata else None, quality=jpeg_quality)
    elif samples_format in {"jpg", "jpeg", "webp"}:
        encoded_image = image.convert("RGB") if image.mode in {"RGBA", "P"} else image
        exif_bytes = _sdapi_exif_bytes(parameters)
        if samples_format in {"jpg", "jpeg"}:
            encoded_image.save(buffer, format="JPEG", exif=exif_bytes, quality=jpeg_quality)
        else:
            encoded_image.save(buffer, format="WEBP", exif=exif_bytes, quality=jpeg_quality, lossless=webp_lossless)
    else:
        raise HTTPException(status_code=500, detail="Invalid image format")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _base64_image_data_uri(encoded: str) -> str:
    text = str(encoded or "")
    if text.startswith("/9j/"):
        mime = "image/jpeg"
    elif text.startswith("UklGR"):
        mime = "image/webp"
    elif text.startswith("R0lG"):
        mime = "image/gif"
    else:
        mime = "image/png"
    return f"data:{mime};base64,{text}"


_SOURCE_GENERATION_INFO_KEYS = {"all_prompts", "all_seeds", "infotexts", "index_of_first_image"}


def _coerce_source_generation_info(value: Any) -> dict[str, Any] | None:
    data = value
    if not isinstance(data, dict):
        text = str(value or "").strip()
        if not text:
            return None
        try:
            data = json.loads(text)
        except Exception:
            return None
    if not isinstance(data, dict):
        return None
    if not any(key in data for key in _SOURCE_GENERATION_INFO_KEYS):
        return None
    return dict(data)


def _source_generation_info_from_result(result: Any) -> dict[str, Any] | None:
    debug_info = getattr(result, "debug_info", {}) or {}
    candidates: list[Any] = []
    result_js = getattr(result, "js", None)
    if callable(result_js):
        try:
            candidates.append(result_js())
        except Exception:
            pass
    if isinstance(debug_info, dict):
        candidates.append(debug_info.get("source_info"))
        source_backend = debug_info.get("source_backend")
        if isinstance(source_backend, dict):
            candidates.append(source_backend.get("source_info"))
    candidates.append(getattr(result, "infotext", ""))
    for candidate in candidates:
        source_info = _coerce_source_generation_info(candidate)
        if source_info is not None:
            return source_info
    return None


def _sdapi_source_info_infotexts(source_info: dict[str, Any] | None) -> list[str]:
    if not isinstance(source_info, dict):
        return []
    values = source_info.get("infotexts")
    if not isinstance(values, list):
        return []
    return [str(item or "") for item in values]


def _image_generation_parameters(image: Image.Image) -> str:
    info = getattr(image, "info", {}) or {}
    if not isinstance(info, dict):
        return ""
    for key in ("parameters", "prompt", "Description"):
        value = info.get(key)
        if value:
            return str(value)
    return ""


def _sdapi_result_count(result: Any, request: ForgeNeoRequest) -> int:
    image_count = len(_sdapi_result_images(result))
    expected_count = max(1, int(getattr(request, "batch_count", 1) or 1) * int(getattr(request, "batch_size", 1) or 1))
    return max(1, image_count, expected_count)


def _sdapi_result_images(result: Any) -> list[Any]:
    return list(getattr(result, "images", []) or []) + list(getattr(result, "extra_images", []) or [])


def _sdapi_result_infotexts(result: Any, request: ForgeNeoRequest) -> list[str]:
    source_texts = _sdapi_source_info_infotexts(_source_generation_info_from_result(result))
    if source_texts:
        return source_texts

    images = _sdapi_result_images(result)
    image_texts = [_image_generation_parameters(image) for image in images if isinstance(image, Image.Image)]
    result_text = str(getattr(result, "infotext", "") or "")
    count = max(_sdapi_result_count(result, request), len(image_texts))
    texts: list[str] = []
    for index in range(count):
        image_text = image_texts[index] if index < len(image_texts) else ""
        texts.append(image_text or result_text)
    return texts if any(texts) else []


def _encode_sdapi_result_images(result: Any, request: ForgeNeoRequest) -> list[str]:
    infotexts = _sdapi_result_infotexts(result, request)
    fallback = str(getattr(result, "infotext", "") or "")
    encoded: list[str] = []
    for index, image in enumerate(_sdapi_result_images(result)):
        if isinstance(image, str):
            encoded.append(image.split(",", 1)[1] if image.startswith("data:image/") and "," in image else image)
            continue
        infotext = infotexts[index] if index < len(infotexts) else ""
        encoded.append(_encode_base64_image(image, infotext or fallback))
    return encoded


def _sdapi_model_display_name(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.casefold() == "none":
        return ""
    return Path(text.replace("\\", "/")).stem


def _sdapi_generation_info_object(result: Any, request: ForgeNeoRequest) -> dict[str, Any]:
    infotexts = _sdapi_result_infotexts(result, request)
    count = max(_sdapi_result_count(result, request), len(infotexts))
    seed = _to_int(getattr(result, "seed", getattr(request, "seed", -1)), -1)
    subseed = getattr(request, "subseed", None)
    subseed_value = _to_int(subseed, -1) if subseed is not None else -1
    infotext = next((text for text in infotexts if text), str(getattr(result, "infotext", "") or ""))
    parsed = parse_generation_parameters_source_api(infotext)
    extra_generation_params: dict[str, Any] = {}
    schedule = parsed.get("Schedule type") or getattr(request, "scheduler", None)
    if schedule and str(schedule) != "Automatic":
        extra_generation_params["Schedule type"] = schedule
    for key in ("RNG", "Hires sampler", "Hires schedule type", "Hires checkpoint", "Hires VAE/TE"):
        if key in parsed:
            extra_generation_params[key] = parsed[key]
    shared_module = _runtime_shared_module()
    opts = getattr(shared_module, "opts", None) if shared_module is not None else None
    face_restoration_model = getattr(opts, "face_restoration_model", None) if request.restore_faces else None
    clip_skip = _to_int(getattr(opts, "CLIP_stop_at_last_layers", 1), 1, minimum=1, maximum=100)

    return {
        "prompt": request.prompt,
        "all_prompts": [request.prompt for _index in range(count)],
        "negative_prompt": request.negative_prompt,
        "all_negative_prompts": [request.negative_prompt for _index in range(count)],
        "seed": seed,
        "all_seeds": [seed + index if seed >= 0 else seed for index in range(count)],
        "subseed": subseed_value,
        "all_subseeds": [subseed_value + index if subseed_value >= 0 else subseed_value for index in range(count)],
        "subseed_strength": request.subseed_strength if request.subseed_strength is not None else 0.0,
        "width": request.width,
        "height": request.height,
        "sampler_name": request.sampler,
        "cfg_scale": request.cfg_scale,
        "steps": request.steps,
        "batch_size": request.batch_size,
        "restore_faces": request.restore_faces,
        "face_restoration_model": face_restoration_model,
        "sd_model_name": parsed.get("Model") or _sdapi_model_display_name(request.checkpoint),
        "sd_model_hash": parsed.get("Model hash") or "",
        "sd_vae_name": parsed.get("VAE") or _sdapi_model_display_name(request.vae) or None,
        "sd_vae_hash": parsed.get("VAE hash") or "",
        "seed_resize_from_w": request.seed_resize_from_w,
        "seed_resize_from_h": request.seed_resize_from_h,
        "denoising_strength": request.denoising_strength if request.mode == "img2img" else request.hires_denoising_strength,
        "extra_generation_params": extra_generation_params,
        "index_of_first_image": 0,
        "infotexts": infotexts[:count],
        "styles": list(request.styles or []),
        "job_timestamp": "",
        "clip_skip": clip_skip,
        "is_using_inpainting_conditioning": bool(request.mode == "img2img" and request.mask_image is not None),
        "version": "forge-neo-api",
    }


def _sdapi_generation_info(result: Any, request: ForgeNeoRequest) -> str:
    source_info = _source_generation_info_from_result(result)
    if source_info is not None:
        return json.dumps(_jsonable(source_info), ensure_ascii=False)
    return json.dumps(_sdapi_generation_info_object(result, request), ensure_ascii=False)


def _source_cmd_flag_call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _source_cmd_flag_call_name(node.value)
        return f"{base}.{node.attr}" if base else node.attr
    return ""


def _source_cmd_flag_literal(node: ast.AST | None, names: dict[str, Any]) -> Any:
    if node is None:
        return None
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return names.get(node.id)
    if isinstance(node, ast.List):
        return [_source_cmd_flag_literal(item, names) for item in node.elts]
    if isinstance(node, ast.Tuple):
        return tuple(_source_cmd_flag_literal(item, names) for item in node.elts)
    if isinstance(node, ast.Dict):
        return {
            _source_cmd_flag_literal(key, names): _source_cmd_flag_literal(value, names)
            for key, value in zip(node.keys, node.values)
        }
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        value = _source_cmd_flag_literal(node.operand, names)
        if isinstance(value, (int, float)):
            return -value
    if isinstance(node, ast.Call):
        call_name = _source_cmd_flag_call_name(node.func)
        args = [_source_cmd_flag_literal(arg, names) for arg in node.args]
        if call_name == "dict":
            return {}
        if call_name == "Path" and args:
            return str(Path(args[0]))
        if call_name == "os.path.join":
            return os.path.join(*(str(arg) for arg in args))
        if call_name == "os.path.dirname" and args:
            return os.path.dirname(str(args[0]))
        if call_name == "os.path.realpath" and args:
            return os.path.realpath(str(args[0]))
    return None


def _source_cmd_flag_dest(option_names: list[str], explicit_dest: Any) -> str:
    if isinstance(explicit_dest, str) and explicit_dest:
        return explicit_dest
    long_names = [name for name in option_names if name.startswith("--")]
    selected = max(long_names or option_names, key=len, default="")
    if not selected:
        return ""
    return selected.lstrip("-").replace("-", "_")


def _source_cmd_flag_defaults() -> dict[str, Any]:
    global _SOURCE_CMD_FLAG_DEFAULTS_CACHE
    if _SOURCE_CMD_FLAG_DEFAULTS_CACHE is not None:
        return dict(_SOURCE_CMD_FLAG_DEFAULTS_CACHE)

    source_modules_path = Path(__file__).resolve().parent / "webui" / "modules"
    source_script_path = source_modules_path.parent
    source_data_path = str(source_script_path)
    source_models_path = str(source_script_path / "models")
    names = {
        "modules_path": str(source_modules_path),
        "script_path": str(source_script_path),
        "data_path": source_data_path,
        "models_path": source_models_path,
    }
    defaults: dict[str, Any] = {}

    for source_path in (source_modules_path / "paths_internal.py", source_modules_path / "cmd_args.py"):
        try:
            tree = ast.parse(source_path.read_text(encoding="utf-8"))
        except (OSError, SyntaxError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute) or node.func.attr != "add_argument":
                continue
            option_names = [
                arg.value
                for arg in node.args
                if isinstance(arg, ast.Constant) and isinstance(arg.value, str) and arg.value.startswith("-")
            ]
            if not option_names:
                continue
            keywords = {keyword.arg: keyword.value for keyword in node.keywords if keyword.arg}
            dest = _source_cmd_flag_dest(option_names, _source_cmd_flag_literal(keywords.get("dest"), names))
            if not dest or dest == "help" or dest.startswith("_"):
                continue
            if "default" in keywords:
                default_value = _source_cmd_flag_literal(keywords["default"], names)
            else:
                action = _source_cmd_flag_literal(keywords.get("action"), names)
                default_value = True if action == "store_false" else False if action == "store_true" else None
            defaults[dest] = _jsonable(default_value)

    _SOURCE_CMD_FLAG_DEFAULTS_CACHE = dict(defaults)
    return dict(defaults)


def _source_cmd_flag_accepts_runtime_value(source_value: Any, runtime_value: Any) -> bool:
    if source_value is None:
        return True
    if isinstance(source_value, bool):
        return isinstance(runtime_value, bool)
    return isinstance(runtime_value, type(source_value))


def cmd_flags_payload() -> dict[str, Any]:
    shared_module = _runtime_shared_module()
    cmd_opts = getattr(shared_module, "cmd_opts", None) if shared_module is not None else None
    if cmd_opts is not None:
        try:
            return {key: _jsonable(value) for key, value in vars(cmd_opts).items()}
        except TypeError:
            pass

    values = _source_cmd_flag_defaults()
    args = getattr(args_manager, "args", None)
    try:
        runtime_values = vars(args)
    except TypeError:
        runtime_values = {}
    for key, value in runtime_values.items():
        if key in values and not _source_cmd_flag_accepts_runtime_value(values[key], value):
            continue
        values[key] = value
    return {key: _jsonable(value) for key, value in sorted(values.items()) if not key.startswith("_")}


def source_api_server_stop_enabled() -> bool:
    return bool(cmd_flags_payload().get("api_server_stop", False))


def _runtime_restart_module() -> Any:
    return sys.modules.get("modules.restart") or sys.modules.get("forge_neo.runtime_backend.modules.restart")


def source_server_restart_response() -> Response:
    runtime_restart = _runtime_restart_module()
    is_restartable = getattr(runtime_restart, "is_restartable", None) if runtime_restart is not None else None
    restart_program = getattr(runtime_restart, "restart_program", None) if runtime_restart is not None else None
    if callable(is_restartable) and callable(restart_program):
        if is_restartable():
            restart_program()
        return Response(status_code=501)
    if not os.environ.get("SD_WEBUI_RESTART"):
        return Response(status_code=501)
    ensure_server_state().request_restart()
    return Response(status_code=204)


def source_server_stop_response() -> Response:
    shared_module = _runtime_shared_module()
    state = getattr(shared_module, "state", None) if shared_module is not None else None
    if state is not None:
        setattr(state, "server_command", "stop")
    else:
        ensure_server_state().request_stop()
    return Response("Stopping.")


def source_server_kill_payload() -> None:
    runtime_restart = _runtime_restart_module()
    stop_program = getattr(runtime_restart, "stop_program", None) if runtime_restart is not None else None
    if callable(stop_program):
        stop_program()
        return None
    ensure_server_state().request_kill()
    return None


def _runtime_sd_samplers_module() -> Any:
    return sys.modules.get("modules.sd_samplers") or sys.modules.get("forge_neo.runtime_backend.modules.sd_samplers")


def _runtime_sd_schedulers_module() -> Any:
    return sys.modules.get("modules.sd_schedulers") or sys.modules.get("forge_neo.runtime_backend.modules.sd_schedulers")


def samplers_payload() -> list[dict[str, Any]]:
    runtime_samplers = _runtime_sd_samplers_module()
    all_samplers = getattr(runtime_samplers, "all_samplers", None) if runtime_samplers is not None else None
    if all_samplers is not None:
        return [
            {
                "name": _jsonable(sampler[0]),
                "aliases": _jsonable(sampler[2]),
                "options": _jsonable(sampler[3]),
            }
            for sampler in all_samplers
        ]

    rows: list[dict[str, Any]] = []
    for name in sampling_methods(include_hidden=True):
        metadata = SOURCE_SAMPLER_API_METADATA.get(name, {"aliases": [], "options": {}})
        rows.append(
            {
                "name": name,
                "aliases": list(metadata.get("aliases") or []),
                "options": dict(metadata.get("options") or {}),
            }
        )
    return rows


def schedulers_payload() -> list[dict[str, Any]]:
    runtime_schedulers = _runtime_sd_schedulers_module()
    schedulers = getattr(runtime_schedulers, "schedulers", None) if runtime_schedulers is not None else None
    if schedulers is not None:
        return [
            {
                "name": _jsonable(getattr(scheduler, "name", None)),
                "label": _jsonable(getattr(scheduler, "label", None)),
                "aliases": _jsonable(getattr(scheduler, "aliases", None)),
                "default_rho": _jsonable(getattr(scheduler, "default_rho", None)),
                "need_inner_model": _jsonable(getattr(scheduler, "need_inner_model", None)),
            }
            for scheduler in schedulers
        ]

    by_label = {str(row["label"]): row for row in SOURCE_SCHEDULER_API_ROWS}
    by_label["MOSS"] = {
        "name": "moss", "label": "MOSS", "aliases": ["MOSS-Image", "moss_image"],
        "default_rho": -1.0, "need_inner_model": False,
    }
    rows: list[dict[str, Any]] = []
    for label in scheduler_types():
        source_row = by_label.get(label)
        if source_row is None:
            rows.append({"name": label, "label": label, "aliases": None, "default_rho": -1.0, "need_inner_model": True})
            continue
        aliases = source_row.get("aliases")
        rows.append({**source_row, "aliases": list(aliases) if isinstance(aliases, list) else aliases})
    return rows


def _runtime_shared_module() -> Any:
    return sys.modules.get("modules.shared") or sys.modules.get("forge_neo.runtime_backend.modules.shared")


def upscalers_payload() -> list[dict[str, Any]]:
    shared_module = _runtime_shared_module()
    upscalers = getattr(shared_module, "sd_upscalers", None) if shared_module is not None else None
    if upscalers is not None:
        rows: list[dict[str, Any]] = []
        for upscaler in upscalers:
            scaler = getattr(upscaler, "scaler", None)
            rows.append(
                {
                    "name": getattr(upscaler, "name", None),
                    "model_name": getattr(scaler, "model_name", None),
                    "model_path": getattr(upscaler, "data_path", None),
                    "model_url": None,
                    "scale": getattr(upscaler, "scale", None),
                }
            )
        return rows
    rows = [
        {"name": "None", "model_name": None, "model_path": None, "model_url": None, "scale": 4.0},
        {"name": "Lanczos", "model_name": None, "model_path": None, "model_url": None, "scale": 4.0},
        {"name": "Nearest", "model_name": None, "model_path": None, "model_url": None, "scale": 4.0},
        {
            "name": "ESRGAN",
            "model_name": "ESRGAN",
            "model_path": "https://github.com/cszn/KAIR/releases/download/v1.0/ESRGAN.pth",
            "model_url": None,
            "scale": 4.0,
        },
    ]
    existing = {str(row.get("name") or "") for row in rows}
    for name in upscale_model_names():
        if name in existing:
            continue
        rows.append(
            {
                "name": name,
                "model_name": name,
                "model_path": find_upscale_model_path(name) or None,
                "model_url": None,
                "scale": 4.0,
            }
        )
        existing.add(name)
    return rows


def latent_upscale_modes_payload() -> list[dict[str, str]]:
    shared_module = _runtime_shared_module()
    modes = getattr(shared_module, "latent_upscale_modes", None) if shared_module is not None else None
    if modes is None:
        names = list(LATENT_UPSCALE_MODES)
    elif isinstance(modes, dict):
        names = list(modes)
    else:
        names = list(modes or [])
    return [{"name": str(name)} for name in names]


def face_restorers_payload() -> list[dict[str, Any]]:
    shared_module = _runtime_shared_module()
    restorers = getattr(shared_module, "face_restorers", None) if shared_module is not None else None
    if restorers is None:
        return [{"name": "CodeFormer", "cmd_dir": None}, {"name": "GFPGAN", "cmd_dir": None}]
    rows: list[dict[str, Any]] = []
    for restorer in restorers:
        name_value = getattr(restorer, "name", None)
        try:
            name = str(name_value() if callable(name_value) else name_value)
        except Exception:
            name = str(name_value or "")
        if not name:
            continue
        rows.append({"name": name, "cmd_dir": getattr(restorer, "cmd_dir", None)})
    return rows


def _model_entry_hash(entry: object) -> tuple[str, str]:
    if not isinstance(entry, dict):
        return "", ""
    sha256 = str(entry.get("sha256") or entry.get("hash") or "").strip().lower()
    short = ""
    if len(sha256) >= 10:
        short = sha256[:10]
    elif len(sha256) > 0:
        short = sha256
        sha256 = ""
    if not short:
        muid = str(entry.get("muid") or "").strip().lower()
        short = muid[:10] if len(muid) >= 10 else ""
    return short, sha256 if len(sha256) >= 64 else ""


def _info_path_values(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(item).strip() for item in value if str(item or "").strip()]
    text = str(value or "").strip()
    return [text] if text else []


def _abs_info_path(value: object, base: Path | None = None) -> Path:
    text = os.path.expandvars(os.path.expanduser(str(value or "").strip()))
    if not text:
        return Path()
    path = Path(text)
    if not path.is_absolute():
        path = (base or Path.cwd()) / path
    return path.resolve()


def _simplemodels_info_paths(config: object | None = None) -> list[Path]:
    direct_paths: list[str] = []
    direct_env = os.environ.get("FORGE_NEO_SIMPLEMODELS_INFO_PATH")
    if direct_env:
        direct_paths.extend([item for item in direct_env.split(os.pathsep) if item.strip()])

    root_values: list[str] = []
    roots_env = os.environ.get("FORGE_NEO_SIMPLEMODELS_ROOTS")
    if roots_env:
        root_values.extend([item for item in roots_env.split(os.pathsep) if item.strip()])
    config_dict = getattr(config, "config_dict", {}) if config is not None else {}
    if isinstance(config_dict, dict):
        direct_paths.extend(_info_path_values(config_dict.get("forge_neo_simplemodels_info_path")))
        root_values.extend(_info_path_values(config_dict.get("forge_neo_simplemodels_roots")))
    if os.environ.get("FORGE_NEO_AUTO_SIMPLEMODELS_ROOTS", "1") != "0":
        base_values: list[Path] = []
        for base in (Path.cwd().resolve(), Path(__file__).resolve().parents[1]):
            for candidate in (base, *base.parents[:2]):
                base_values.append(candidate)
        root_values.extend(str(base / "SimpleModels") for base in base_values)

    paths: list[Path] = []
    seen: set[str] = set()
    for value in direct_paths:
        path = _abs_info_path(value)
        if not str(path):
            continue
        if path.is_dir():
            path = path / "models_info.json"
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        paths.append(path)
    for value in root_values:
        root = _abs_info_path(value)
        if not str(root):
            continue
        path = root / "models_info.json"
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        paths.append(path)
    return paths


def _simplemodels_info_data(config: object | None = None) -> dict[str, Any]:
    global _SIMPLEMODELS_INFO_CACHE
    for path in _simplemodels_info_paths(config):
        try:
            stat = path.stat()
        except OSError:
            continue
        key = os.path.normcase(os.path.normpath(str(path)))
        cached = _SIMPLEMODELS_INFO_CACHE
        if cached is not None and cached[0] == key and cached[1] == stat.st_mtime_ns:
            return cached[2]
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        _SIMPLEMODELS_INFO_CACHE = (key, stat.st_mtime_ns, data)
        return data
    return {}


def _hash_from_file_list(entry: object, filename_key: str) -> tuple[str, str]:
    if not isinstance(entry, dict) or not filename_key:
        return "", ""
    files = entry.get("file") or []
    if isinstance(files, str):
        files = [files]
    if not isinstance(files, list):
        return "", ""
    for item in files:
        item_key = os.path.normcase(os.path.abspath(str(item))) if item else ""
        if item_key and item_key == filename_key:
            return _model_entry_hash(entry)
    return "", ""


def _simplemodels_info_hash_values(
    name: str,
    filename: str,
    catalogs: tuple[str, ...],
    config: object | None = None,
) -> tuple[str, str]:
    data = _simplemodels_info_data(config)
    if not data:
        return "", ""

    normalized_name = str(name or "").replace("\\", "/").lstrip("/")
    basename = Path(normalized_name).name
    name_candidates = [candidate for candidate in (normalized_name, basename) if candidate]
    catalog_candidates: list[str] = []
    seen_catalogs: set[str] = set()
    for catalog in catalogs:
        for candidate in _SIMPLEMODELS_INFO_CATALOG_ALIASES.get(catalog, (catalog,)):
            if candidate in seen_catalogs:
                continue
            seen_catalogs.add(candidate)
            catalog_candidates.append(candidate)

    for candidate in name_candidates:
        short, sha256 = _model_entry_hash(data.get(candidate))
        if short or sha256:
            return short, sha256
    for catalog in catalog_candidates:
        for candidate in name_candidates:
            short, sha256 = _model_entry_hash(data.get(f"{catalog}/{candidate}"))
            if short or sha256:
                return short, sha256

    filename_key = os.path.normcase(os.path.abspath(str(filename or ""))) if filename else ""
    if not filename_key:
        return "", ""
    for entry in data.values():
        short, sha256 = _hash_from_file_list(entry, filename_key)
        if short or sha256:
            return short, sha256
    return "", ""


def _model_info_hash_values(name: str, filename: str, catalogs: tuple[str, ...]) -> tuple[str, str]:
    config = None
    try:
        from forge_neo.bootstrap import ensure_config

        config = ensure_config()
    except Exception:
        config = None
    modelsinfo = getattr(config, "modelsinfo", None) if config is not None else None

    normalized_name = str(name or "").replace("\\", "/").lstrip("/")
    basename = Path(normalized_name).name
    filename_key = os.path.normcase(os.path.abspath(str(filename or ""))) if filename else ""

    if modelsinfo is not None:
        for catalog in catalogs:
            for candidate in (normalized_name, basename):
                if not candidate:
                    continue
                try:
                    short, sha256 = _model_entry_hash(modelsinfo.get_model_info(catalog, candidate))
                except Exception:
                    short, sha256 = "", ""
                if short or sha256:
                    return short, sha256
                try:
                    short, sha256 = _model_entry_hash(modelsinfo.get_model_key_info(f"{catalog}/{candidate}"))
                except Exception:
                    short, sha256 = "", ""
                if short or sha256:
                    return short, sha256

        m_info = getattr(modelsinfo, "m_info", None)
        if isinstance(m_info, dict) and filename_key:
            for entry in m_info.values():
                short, sha256 = _hash_from_file_list(entry, filename_key)
                if short or sha256:
                    return short, sha256

    return _simplemodels_info_hash_values(name, filename, catalogs, config)


def _model_item(name: str, *catalogs: str) -> dict[str, Any]:
    filename = find_model_path(name, *catalogs)
    model_name = Path(str(name).replace("\\", "/")).stem
    short_hash, sha256 = _model_info_hash_values(str(name), filename, tuple(catalogs))
    title = str(name)
    if short_hash:
        title = f"{title} [{short_hash}]"
    return {
        "title": title,
        "model_name": model_name,
        "hash": short_hash,
        "sha256": sha256,
        "filename": filename,
        "config": None,
    }


def sd_models_payload(preset: str = "klein") -> list[dict[str, Any]]:
    runtime_sd_models = sys.modules.get("modules.sd_models") or sys.modules.get("forge_neo.runtime_backend.modules.sd_models")
    checkpoints_list = getattr(runtime_sd_models, "checkpoints_list", None) if runtime_sd_models is not None else None
    if checkpoints_list is not None:
        return [
            {
                "title": getattr(item, "title", None),
                "model_name": getattr(item, "model_name", None),
                "hash": getattr(item, "shorthash", None),
                "sha256": getattr(item, "sha256", None),
                "filename": getattr(item, "filename", None),
                "config": getattr(item, "config", None),
            }
            for item in checkpoints_list.values()
        ]
    choices = initial_model_choices(preset)
    return [_model_item(name, "diffusion_models", "checkpoints") for name in choices.checkpoints]


def sd_modules_payload(preset: str = "klein") -> list[dict[str, Any]]:
    runtime_main_entry = sys.modules.get("modules_forge.main_entry") or sys.modules.get("forge_neo.runtime_backend.modules_forge.main_entry")
    module_list = getattr(runtime_main_entry, "module_list", None) if runtime_main_entry is not None else None
    if module_list is not None:
        return [{"model_name": name, "filename": module_list[name]} for name in module_list.keys()]
    choices = initial_model_choices(preset)
    rows: list[dict[str, Any]] = []
    for name in choices.vae:
        rows.append({"model_name": str(name), "filename": find_model_path(name, "vae")})
    for name in choices.text_encoders:
        rows.append({"model_name": str(name), "filename": find_model_path(name, "text_encoders", "clip")})
    return rows


def _source_safetensors_metadata(filename: str) -> dict[str, Any]:
    path = Path(str(filename or ""))
    if path.suffix.lower() != ".safetensors":
        return {}
    try:
        with path.open("rb") as file:
            metadata_len = int.from_bytes(file.read(8), "little")
            json_start = file.read(2)
            if metadata_len <= 2 or json_start not in (b'{"', b"{'"):
                return {}
            data = json.loads(json_start + file.read(metadata_len - 2))
    except Exception:
        return {}

    metadata: dict[str, Any] = {}
    raw_metadata = data.get("__metadata__", {}) if isinstance(data, dict) else {}
    if not isinstance(raw_metadata, dict):
        return metadata
    for key, value in raw_metadata.items():
        if isinstance(value, str) and value.startswith("{"):
            try:
                metadata[str(key)] = json.loads(value)
                continue
            except Exception:
                pass
        metadata[str(key)] = value
    return metadata


def loras_payload(preset: str = "klein") -> list[dict[str, Any]]:
    runtime_networks = sys.modules.get("networks")
    available_networks = getattr(runtime_networks, "available_networks", None) if runtime_networks is not None else None
    if available_networks is not None:
        return [
            {
                "name": getattr(item, "name", None),
                "alias": getattr(item, "alias", None),
                "path": getattr(item, "filename", None),
                "metadata": getattr(item, "metadata", None),
            }
            for item in available_networks.values()
        ]
    choices = initial_model_choices(preset)
    rows = []
    for name in choices.loras:
        stem = Path(str(name).replace("\\", "/")).stem
        path = find_model_path(name, "loras")
        metadata = _source_safetensors_metadata(path)
        alias = str(metadata.get("ss_output_name") or stem)
        rows.append({"name": stem, "alias": alias, "path": path, "metadata": metadata})
    return rows


def _runtime_embedding_database() -> Any:
    for module_name in (
        "modules.ui_extra_networks_textual_inversion",
        "forge_neo.runtime_backend.modules.ui_extra_networks_textual_inversion",
        "modules.textual_inversion.textual_inversion",
        "forge_neo.runtime_backend.modules.textual_inversion.textual_inversion",
    ):
        module = sys.modules.get(module_name)
        database = getattr(module, "embedding_db", None) if module is not None else None
        if database is not None:
            return database
    return None


def _embedding_item_payload(embedding: Any) -> dict[str, Any]:
    return {
        "step": getattr(embedding, "step", None),
        "sd_checkpoint": getattr(embedding, "sd_checkpoint", None),
        "sd_checkpoint_name": getattr(embedding, "sd_checkpoint_name", None),
        "shape": getattr(embedding, "shape", None),
        "vectors": getattr(embedding, "vectors", None),
    }


def _embedding_collection_payload(embeddings: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(embeddings, dict):
        return {}
    return {
        str(getattr(embedding, "name", name)): _embedding_item_payload(embedding)
        for name, embedding in embeddings.items()
    }


def embeddings_payload(preset: str = "klein") -> dict[str, Any]:
    runtime_database = _runtime_embedding_database()
    if runtime_database is not None:
        return {
            "loaded": _embedding_collection_payload(getattr(runtime_database, "word_embeddings", {})),
            "skipped": _embedding_collection_payload(getattr(runtime_database, "skipped_embeddings", {})),
        }

    choices = initial_model_choices(preset)
    loaded = {}
    for name in choices.embeddings:
        key = Path(str(name).replace("\\", "/")).stem
        loaded[key] = {
            "step": None,
            "sd_checkpoint": None,
            "sd_checkpoint_name": None,
            "shape": None,
            "vectors": None,
        }
    return {"loaded": loaded, "skipped": {}}


def prompt_styles_payload() -> list[dict[str, str]]:
    shared_module = _runtime_shared_module()
    prompt_styles = getattr(shared_module, "prompt_styles", None) if shared_module is not None else None
    runtime_styles = getattr(prompt_styles, "styles", None) if prompt_styles is not None else None
    if runtime_styles is not None:
        rows: list[dict[str, str]] = []
        for style in runtime_styles.values():
            rows.append({"name": style[0], "prompt": style[1], "negative_prompt": style[2]})
        return rows

    rows = [{"name": "None", "prompt": "", "negative_prompt": ""}]
    seen = {"none"}
    for style in load_styles().values():
        key = style.name.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append({"name": style.name, "prompt": style.prompt, "negative_prompt": style.negative_prompt})
    return rows


_TXT2IMG_SCRIPT_FALLBACKS = [
    "dynamic prompts",
    "prompt matrix",
    "prompts from file or textbox",
    "x/y/z plot",
    "extra options",
    "torch compile integrated",
    "controlnet",
    "adetailer",
    "regional prompter",
    "forge couple",
    "differential regional prompter",
    "多图拼接参考",
    "调制引导控制",
    "never oom integrated",
    "spectrum integrated",
    "refiner",
    "sampler",
    "seed",
]
_IMG2IMG_SCRIPT_FALLBACKS = [
    "dynamic prompts",
    "loopback",
    "prompt matrix",
    "prompts from file or textbox",
    "sd upscale",
    "x/y/z plot",
    "extra options",
    "torch compile integrated",
    "controlnet",
    "adetailer",
    "regional prompter",
    "forge couple",
    "differential regional prompter",
    "多图拼接参考",
    "调制引导控制",
    "multidiffusion integrated",
    "never oom integrated",
    "spectrum integrated",
    "soft inpainting",
    "refiner",
    "sampler",
    "seed",
]
_ALWAYSON_SCRIPT_NAMES = {
    "dynamic prompts",
    "extra options",
    "torch compile integrated",
    "controlnet",
    "adetailer",
    "regional prompter",
    "forge couple",
    "多图拼接参考",
    "调制引导控制",
    "multidiffusion integrated",
    "never oom integrated",
    "spectrum integrated",
    "soft inpainting",
    "refiner",
    "sampler",
    "seed",
}


def _unique_script_names(names: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for name in names:
        clean = str(name or "").strip().lower()
        if not clean or clean == "none" or clean in seen:
            continue
        seen.add(clean)
        out.append(clean)
    return out


def _runtime_scripts_module() -> Any:
    return sys.modules.get("modules.scripts") or sys.modules.get("forge_neo.runtime_backend.modules.scripts")


def _runtime_script_lists() -> tuple[list[Any], list[Any]] | None:
    runtime_scripts = _runtime_scripts_module()
    if runtime_scripts is None:
        return None
    txt_runner = getattr(runtime_scripts, "scripts_txt2img", None)
    img_runner = getattr(runtime_scripts, "scripts_img2img", None)
    txt_scripts = getattr(txt_runner, "scripts", None)
    img_scripts = getattr(img_runner, "scripts", None)
    if txt_scripts is None or img_scripts is None:
        return None
    return list(txt_scripts), list(img_scripts)


def _api_info_row(value: Any) -> Any:
    if isinstance(value, dict):
        return dict(value)
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return model_dump()
    dict_method = getattr(value, "dict", None)
    if callable(dict_method):
        return dict_method()
    return value


def scripts_payload() -> dict[str, list[str]]:
    runtime_lists = _runtime_script_lists()
    if runtime_lists is not None:
        txt_scripts, img_scripts = runtime_lists
        return {
            "txt2img": [script.name for script in txt_scripts if getattr(script, "name", None) is not None],
            "img2img": [script.name for script in img_scripts if getattr(script, "name", None) is not None],
        }
    return {
        "txt2img": _unique_script_names(_TXT2IMG_SCRIPT_FALLBACKS),
        "img2img": _unique_script_names(_IMG2IMG_SCRIPT_FALLBACKS),
    }


def _script_arg(
    label: str,
    value: Any = None,
    *,
    minimum: Any = None,
    maximum: Any = None,
    step: Any = None,
    choices: list[Any] | None = None,
) -> dict[str, Any]:
    return {"label": label, "value": value, "minimum": minimum, "maximum": maximum, "step": step, "choices": choices}


_TORCH_COMPILE_PRESETS = [
    "Automatic",
    "Disable",
    "guard_filter_fn",
    "dynamic",
    "max-autotune",
    "max-autotune-no-cudagraphs",
    "reduce-overhead",
]
_SAMPLER_SCRIPT_CHOICES = [
    "DPM++ 2M",
    "DPM++ SDE",
    "DPM++ 2M SDE",
    "DPM++ 3M SDE",
    "DPM++ 2s a RF",
    "Euler a",
    "Euler",
    "ER SDE",
    "LCM",
    "LMS",
    "Heun",
    "DPM2",
    "Res Multistep",
    "Kohaku LoNyu Yog",
    "Restart",
    "UniPC",
    "DDIM",
    "PLMS",
    "DPM++ 2M CFG++",
    "Euler a CFG++",
    "Euler CFG++",
]
_SCHEDULER_SCRIPT_CHOICES = [
    "Automatic",
    "Karras",
    "Exponential",
    "Polyexponential",
    "Normal",
    "Simple",
    "Uniform",
    "SGM Uniform",
    "Linear Quadratic",
    "KL Optimal",
    "DDIM",
    "Align Your Steps",
    "Beta",
    "Turbo",
    "Bong Tangent",
    "FlowMatchEulerDiscrete",
    "Flux2",
]
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


def _xyz_axis_choices(*, is_img2img: bool) -> list[str]:
    if is_img2img:
        return list(_XYZ_COMMON_AXIS_CHOICES)
    return [
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


def _controlnet_default_unit() -> dict[str, Any]:
    return {
        "use_preview_as_input": False,
        "generated_image": None,
        "mask_image": None,
        "mask_image_fg": None,
        "hr_option": "Both",
        "enabled": False,
        "module": "None",
        "model": "None",
        "weight": 1.0,
        "image": None,
        "image_fg": None,
        "resize_mode": "Crop and Resize",
        "processor_res": -1,
        "threshold_a": -1,
        "threshold_b": -1,
        "guidance_start": 0.0,
        "guidance_end": 1.0,
        "pixel_perfect": False,
        "control_mode": "Balanced",
        "type_filter": "All",
        "save_detected_map": True,
        "_idx": -1,
    }


def _script_model_choices() -> list[str]:
    names = ["None"]
    for row in sd_models_payload():
        title = str(row.get("title") or "").strip()
        if title and title not in names:
            names.append(title)
    return names


def _script_module_choices() -> list[str]:
    names: list[str] = []
    for row in sd_modules_payload():
        title = str(row.get("title") or row.get("model_name") or "").strip()
        if title and title not in names:
            names.append(title)
    return names or ["None"]


def _known_script_args(name: str, *, is_img2img: bool = False) -> list[dict[str, Any]]:
    if dynamic_prompts_script_name_matches(name):
        return [
            _script_arg(
                spec["label"],
                spec["value"],
                minimum=spec.get("minimum"),
                maximum=spec.get("maximum"),
                step=spec.get("step"),
                choices=spec.get("choices"),
            )
            for spec in dynamic_prompts_script_arg_specs()
        ]
    if name == "prompt matrix":
        return [
            _script_arg("Put the variable parts at the start of prompt", False),
            _script_arg("Use different seeds for each image", False),
            _script_arg("Prompt", "positive", choices=["positive", "negative"]),
            _script_arg("Joining Char.", "comma", choices=["comma", "space"]),
            _script_arg("Grid Margins (px)", 0, minimum=0, maximum=256, step=2),
        ]
    if name == "prompts from file or textbox":
        return [
            _script_arg("Iterate seed every line", False),
            _script_arg("Use same random seed for all lines", False),
            _script_arg("Insert prompts at the", "start", choices=["start", "end"]),
            _script_arg("List of prompt inputs", None),
        ]
    if name == "x/y/z plot":
        axis_choices = _xyz_axis_choices(is_img2img=is_img2img)
        return [
            _script_arg("X type", "Nothing", choices=axis_choices),
            _script_arg("X values", None),
            _script_arg("X values", None, choices=[]),
            _script_arg("Y type", "Nothing", choices=axis_choices),
            _script_arg("Y values", None),
            _script_arg("Y values", None, choices=[]),
            _script_arg("Z type", "Nothing", choices=axis_choices),
            _script_arg("Z values", None),
            _script_arg("Z values", None, choices=[]),
            _script_arg("Draw legend", True),
            _script_arg("Include Sub Images", False),
            _script_arg("Include Sub Grids", False),
            _script_arg("Keep -1 for seeds", False),
            _script_arg("Vary seeds for X", False),
            _script_arg("Vary seeds for Y", False),
            _script_arg("Vary seeds for Z", False),
            _script_arg("Row Count", 0, minimum=0, maximum=8, step=1),
            _script_arg("Grid Margins", 0, minimum=0, maximum=500, step=2),
            _script_arg("Use text inputs instead of dropdowns", False),
        ]
    if name == "loopback":
        return [
            _script_arg("Loops", 2, minimum=1, maximum=8, step=1),
            _script_arg("Final Denoising Strength", 0.5, minimum=0.0, maximum=1.0, step=0.05),
            _script_arg("Denoising Strength Curve", "Linear", choices=["Aggressive", "Linear", "Lazy"]),
        ]
    if name == "sd upscale":
        return [
            _script_arg("Tile Overlap", 64, minimum=0, maximum=256, step=16),
            _script_arg("Upscaler", "None", choices=list(dict.fromkeys(["None", "Lanczos", "Nearest", "ESRGAN", *upscale_model_names()]))),
            _script_arg("Scale Factor", 2.0, minimum=1.0, maximum=8.0, step=0.05),
            _script_arg("Save to Extras folder instead", False),
        ]
    if name == "torch compile integrated":
        return [_script_arg("Preset", "Automatic", choices=_TORCH_COMPILE_PRESETS)]
    if name == "controlnet":
        return [_script_arg("", _controlnet_default_unit()) for _ in range(3)]
    if name == "adetailer":
        return [
            _script_arg("Enable ADetailer", False),
            _script_arg("Skip img2img", False),
            *[
                _script_arg(
                    f"ADetailer args {index + 1}",
                    adetailer_default_args(ad_tab_enable=index == 0),
                    choices=adetailer_model_names(include_none=True),
                )
                for index in range(4)
            ],
        ]
    if name == "regional prompter":
        return [
            _script_arg(
                spec["label"],
                spec["value"],
                choices=spec.get("choices"),
            )
            for spec in regional_prompter_script_arg_specs()
        ]
    if name == "forge couple":
        return [
            _script_arg(
                spec["label"],
                spec["value"],
                minimum=spec.get("minimum"),
                maximum=spec.get("maximum"),
                step=spec.get("step"),
                choices=spec.get("choices"),
            )
            for spec in forge_couple_script_arg_specs(is_img2img=is_img2img)
        ]
    if name == "differential regional prompter":
        return [
            _script_arg("Options", [], choices=["Reverse"]),
            _script_arg("FPS", 30, minimum=1, maximum=100, step=1),
            _script_arg("Schedule", ""),
            _script_arg("Step", 4, minimum=0, maximum=150, step=1),
            _script_arg("Additional Output", [], choices=["mp4", "Anime Gif"]),
            _script_arg("Batch Size", 1, minimum=1, maximum=8, step=1),
            _script_arg("mp4 output directory", ""),
            _script_arg("mp4 output filename", ""),
            _script_arg("Anime gif output directory", ""),
            _script_arg("Anime gif output filename", ""),
            _script_arg("Add text to filename", ""),
        ]
    if name == "多图拼接参考":
        return [
            _script_arg("多图拼接参考", False),
            _script_arg("参考潜空间", []),
            _script_arg("最大边长限制", 1024, minimum=0, maximum=2048, step=256),
        ]
    if name == "调制引导控制":
        module_choices = _script_module_choices()
        clip_value = "qwen_image_vae.safetensors" if "qwen_image_vae.safetensors" in module_choices else module_choices[0]
        return [
            _script_arg("调制引导控制", False),
            _script_arg("Clip-L", clip_value, choices=module_choices),
            _script_arg("正向条件", None),
            _script_arg("负向条件", None),
            _script_arg("权重", 3.0, minimum=-20.0, maximum=20.0, step=0.5),
            _script_arg("起始层", 0, minimum=0, maximum=64, step=1),
            _script_arg("结束层", -1, minimum=-1, maximum=64, step=1),
        ]
    if name == "multidiffusion integrated":
        return [
            _script_arg("MultiDiffusion Integrated", False),
            _script_arg("Method", "Mixture of Diffusers", choices=["MultiDiffusion", "Mixture of Diffusers"]),
            _script_arg("Tile Width", 768, minimum=256, maximum=2048, step=64),
            _script_arg("Tile Height", 768, minimum=256, maximum=2048, step=64),
            _script_arg("Tile Overlap", 64, minimum=0, maximum=1024, step=16),
            _script_arg("Tile Batch Size", 1, minimum=1, maximum=8, step=1),
        ]
    if name == "never oom integrated":
        return [
            _script_arg("Enabled for UNet (always offload)", False),
            _script_arg("Enabled for VAE (always tiled)", False),
        ]
    if name == "spectrum integrated":
        return [
            _script_arg("Spectrum Integrated", False),
            _script_arg("Prediction Weighting", 0.25, minimum=0.0, maximum=1.0, step=0.05),
            _script_arg("Polynomial Degree", 6, minimum=1, maximum=8, step=1),
            _script_arg("Regularization", 0.5, minimum=0.0, maximum=2.0, step=0.05),
            _script_arg("Cache Window", 2, minimum=1, maximum=10, step=1),
            _script_arg("Window Growth", 0.0, minimum=0.0, maximum=2.0, step=0.05),
            _script_arg("Warmup Steps", 6, minimum=0, maximum=20, step=1),
            _script_arg("Stop Caching Step", 0.9, minimum=0.0, maximum=1.0, step=0.05),
        ]
    if name == "soft inpainting":
        return [
            _script_arg("Soft inpainting", False),
            _script_arg("Schedule bias", 1, minimum=0, maximum=8, step=0.1),
            _script_arg("Preservation strength", 0.5, minimum=0, maximum=8, step=0.05),
            _script_arg("Transition contrast boost", 4, minimum=1, maximum=32, step=0.5),
            _script_arg("Mask influence", 0, minimum=0, maximum=1, step=0.05),
            _script_arg("Difference threshold", 0.5, minimum=0, maximum=8, step=0.25),
            _script_arg("Difference contrast", 2, minimum=0, maximum=8, step=0.25),
        ]
    if name == "refiner":
        return [
            _script_arg("Refiner", False),
            _script_arg("Checkpoint", "None", choices=_script_model_choices()),
            _script_arg("Switch at", 0.875, minimum=0.0, maximum=1.0, step=0.025),
        ]
    if name == "sampler":
        return [
            _script_arg("Sampling Steps", 20, minimum=1, maximum=150, step=1),
            _script_arg("Sampling Method", "DPM++ 2M", choices=_SAMPLER_SCRIPT_CHOICES),
            _script_arg("Schedule Type", "Automatic", choices=_SCHEDULER_SCRIPT_CHOICES),
        ]
    if name == "seed":
        return [
            _script_arg("Seed", -1, step=1),
            _script_arg("Extra", False),
            _script_arg("Variation seed", -1, step=1),
            _script_arg("Variation strength", 0.0, minimum=0, maximum=1, step=0.01),
            _script_arg("Resize seed from width", 0, minimum=0, maximum=2048, step=8),
            _script_arg("Resize seed from height", 0, minimum=0, maximum=2048, step=8),
        ]
    return []


def script_info_payload() -> list[dict[str, Any]]:
    runtime_lists = _runtime_script_lists()
    if runtime_lists is not None:
        rows: list[Any] = []
        for script_list in runtime_lists:
            for script in script_list:
                api_info = getattr(script, "api_info", None)
                if api_info is not None:
                    rows.append(_api_info_row(api_info))
        return rows

    payload = scripts_payload()
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, bool]] = set()

    def add(name: str, is_img2img: bool) -> None:
        key = (name, is_img2img)
        if key in seen:
            return
        seen.add(key)
        rows.append(
            {
                "name": name,
                "is_alwayson": name in _ALWAYSON_SCRIPT_NAMES,
                "is_img2img": is_img2img,
                "args": _known_script_args(name, is_img2img=is_img2img),
            }
        )

    for name in payload["txt2img"]:
        add(name, False)
    for name in payload["img2img"]:
        add(name, True)
    return rows


def controlnet_module_list_payload() -> dict[str, list[str]]:
    from forge_neo.ui import CONTROLNET_PREPROCESSORS_BY_TYPE

    modules: list[str] = []
    seen: set[str] = set()
    for choices in CONTROLNET_PREPROCESSORS_BY_TYPE.values():
        for value in choices:
            clean = str(value or "").strip()
            key = clean.casefold()
            if clean and key not in seen:
                modules.append(clean)
                seen.add(key)
    return {"module_list": modules}


_CONTROLNET_MODEL_EXTENSIONS = {".pt", ".pth", ".ckpt", ".safetensors", ".bin"}
_CONTROLNET_AUX_PATH_PARTS = {
    "annotators",
    "facerestore_models",
    "rife",
    "torch",
    "depth-anything",
    "anime-seg",
    "checkpoints",
}
_CONTROLNET_AUX_NAME_PARTS = {
    "body_pose",
    "hand_pose",
    "dw-ll_ucoco",
    "yolox",
    "facenet",
    "parsing_",
    "bisenet",
    "parsenet",
    "detection_",
    "mobilenet",
    "codeformer",
    "gfpgan",
    "sk_model",
    "zoed",
    "isnetis",
}
_CONTROLNET_MODEL_NAME_PARTS = {
    "control",
    "controlnet",
    "ip-adapter",
    "ip_adapter",
    "t2ia",
    "t2i_adapter",
    "lllite",
    "union",
    "unicontrol",
    "uni3c",
    "instantx",
    "xinsir",
    "tile",
    "canny",
    "openpose",
    "inpaint",
    "lineart",
    "scribble",
    "softedge",
    "normal",
    "seg",
}
_CONTROLNET_UNION_MODEL_PARTS = {"union", "unicontrol", "uni3c", "xinsir"}
_CONTROLNET_SOURCE_DEFAULT_MODEL_KEY = "xinsir_cn_union_sdxl_1.0_promax"


def _controlnet_model_key(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.casefold() == "none":
        return "None"
    filename = text.replace("\\", "/").rsplit("/", 1)[-1]
    suffix = Path(filename).suffix.lower()
    if suffix in _CONTROLNET_MODEL_EXTENSIONS:
        return Path(filename).stem
    return filename or text


def _is_controlnet_model_entry(value: object) -> bool:
    text = str(value or "").strip()
    if not text or text.casefold() == "none":
        return False
    normalized = text.replace("\\", "/")
    parts = [part.casefold() for part in normalized.split("/")[:-1]]
    if any(part in _CONTROLNET_AUX_PATH_PARTS for part in parts):
        return False
    filename = normalized.rsplit("/", 1)[-1]
    stem = Path(filename).stem.casefold()
    if any(part in stem for part in _CONTROLNET_AUX_NAME_PARTS):
        return False
    suffix = Path(filename).suffix.lower()
    if suffix and suffix not in _CONTROLNET_MODEL_EXTENSIONS:
        return False
    return any(part in stem for part in _CONTROLNET_MODEL_NAME_PARTS)


def controlnet_model_list_payload(preset: str = "klein") -> dict[str, list[str]]:
    choices = refresh_model_choices(preset or "klein")
    models = ["None"]
    seen = {"none"}
    for value in list(getattr(choices, "controlnet", []) or []):
        if not _is_controlnet_model_entry(value):
            continue
        clean = _controlnet_model_key(value)
        key = clean.casefold()
        if clean and key not in seen:
            models.append(clean)
            seen.add(key)
    return {"model_list": models}


def _filter_controlnet_models_for_type(model_list: list[str], control_type: str) -> list[str]:
    key = str(control_type or "All")
    if key == "All":
        return list(model_list)
    needles = [key.lower().replace("-", ""), key.lower().replace("-", "_")]
    if key == "IP-Adapter":
        needles.extend(["ipadapter", "ip_adapter"])
    elif key == "T2I-Adapter":
        needles.extend(["t2iadapter", "t2i_adapter", "t2ia"])
    elif key == "NormalMap":
        needles.extend(["normal", "normalmap"])
    elif key == "SoftEdge":
        needles.extend(["softedge", "hed", "pidinet", "teed"])
    filtered = ["None"]
    for name in model_list:
        clean = str(name or "").strip()
        if not clean or clean.casefold() == "none":
            continue
        haystack = clean.lower().replace("-", "").replace(" ", "")
        is_union_model = any(part in haystack for part in _CONTROLNET_UNION_MODEL_PARTS)
        if is_union_model or any(needle in haystack for needle in needles):
            filtered.append(clean)
    return filtered if len(filtered) > 1 else ["None"]


def _controlnet_default_option(module_list: list[str], control_type: str) -> str:
    if control_type != "All" and len(module_list) > 1:
        return module_list[1]
    return "none"


def _controlnet_default_model(model_list: list[str], control_type: str) -> str:
    if control_type != "All" and len(model_list) > 1:
        for model in model_list:
            if str(model or "").casefold() == _CONTROLNET_SOURCE_DEFAULT_MODEL_KEY:
                return str(model)
        return model_list[1]
    return "None"


def controlnet_control_types_payload(preset: str = "klein") -> dict[str, dict[str, dict[str, Any]]]:
    from forge_neo.ui import CONTROLNET_PREPROCESSORS, CONTROLNET_PREPROCESSORS_BY_TYPE, CONTROLNET_TYPES

    all_models = controlnet_model_list_payload(preset)["model_list"]
    control_types: dict[str, dict[str, Any]] = {}
    for control_type, _label_cn in CONTROLNET_TYPES:
        module_list = list(CONTROLNET_PREPROCESSORS_BY_TYPE.get(control_type, CONTROLNET_PREPROCESSORS))
        model_list = _filter_controlnet_models_for_type(all_models, control_type)
        control_types[control_type] = {
            "module_list": module_list,
            "model_list": model_list,
            "default_option": _controlnet_default_option(module_list, control_type),
            "default_model": _controlnet_default_model(model_list, control_type),
        }
    return {"control_types": control_types}


def _source_controlnet_detect_payload(values: dict[str, Any]) -> dict[str, Any]:
    from forge_neo.runtime_backend.source_runtime import run_source_controlnet_detect

    return run_source_controlnet_detect(values)


def controlnet_detect_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = values or {}
    images = payload.get("controlnet_input_images") or payload.get("images") or []
    if not isinstance(images, list):
        images = [images]
    if not images:
        raise HTTPException(status_code=422, detail="No image selected")
    result = _source_controlnet_detect_payload(payload)
    if not result.get("ok", True):
        status_code = _to_int(result.get("status_code"), 500, minimum=400, maximum=599)
        raise HTTPException(status_code=status_code, detail=str(result.get("error") or "ControlNet detect failed"))
    response: dict[str, Any] = {"images": list(result.get("images") or [])}
    if "info" in result:
        response["info"] = result.get("info")
    if "poses" in result:
        response["poses"] = result.get("poses")
    return response


_EXTRA_NETWORK_PAGE_CATALOGS: dict[str, tuple[str, ...]] = {
    "lora": ("loras",),
    "loras": ("loras",),
    "checkpoints": ("diffusion_models", "checkpoints"),
    "checkpoint": ("diffusion_models", "checkpoints"),
    "textual inversion": ("embeddings",),
    "textual_inversion": ("embeddings",),
    "embeddings": ("embeddings",),
    "embedding": ("embeddings",),
}
_EXTRA_NETWORK_PREVIEW_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


def _extra_network_page_key(page: str) -> str:
    text = str(page or "").strip().lower()
    if text in _EXTRA_NETWORK_PAGE_CATALOGS:
        return text
    underscored = text.replace(" ", "_")
    if underscored in _EXTRA_NETWORK_PAGE_CATALOGS:
        return underscored
    spaced = text.replace("_", " ")
    if spaced in _EXTRA_NETWORK_PAGE_CATALOGS:
        return spaced
    return text


def _extra_network_allowed_roots() -> list[Path]:
    roots: list[Path] = []
    seen: set[str] = set()
    for catalog in ("loras", "diffusion_models", "checkpoints", "embeddings"):
        for value in model_roots_for_catalog(catalog):
            path = Path(value).resolve()
            try:
                if not path.is_dir():
                    continue
            except OSError:
                continue
            key = os.path.normcase(os.path.normpath(str(path)))
            if key in seen:
                continue
            seen.add(key)
            roots.append(path)
    return roots


def _path_is_under(path: Path, roots: list[Path]) -> bool:
    resolved = path.resolve()
    for root in roots:
        try:
            resolved.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def _resolve_extra_network_file(page: str, name: str) -> Path | None:
    page_key = _extra_network_page_key(page)
    catalogs = _EXTRA_NETWORK_PAGE_CATALOGS.get(page_key)
    if not catalogs:
        return None
    text = str(name or "").strip()
    if not text:
        return None
    direct = Path(text)
    if direct.is_absolute():
        roots = _extra_network_allowed_roots()
        if direct.is_file() and _path_is_under(direct, roots):
            return direct.resolve()
    path = find_model_path(text, *catalogs)
    if path:
        return Path(path).resolve()

    normalized = text.replace("\\", "/")
    stem = Path(normalized).stem.casefold()
    choices = refresh_model_choices()
    if page_key in {"lora", "loras"}:
        names = list(choices.loras or [])
    elif page_key in {"textual inversion", "textual_inversion", "embeddings", "embedding"}:
        names = list(choices.embeddings or [])
    else:
        names = list(choices.checkpoints or [])
    for candidate in names:
        candidate_path = Path(str(candidate).replace("\\", "/"))
        if str(candidate).casefold() == text.casefold() or candidate_path.stem.casefold() == stem:
            path = find_model_path(str(candidate), *catalogs)
            if path:
                return Path(path).resolve()
    return None


def _extra_network_preview_path(model_path: Path) -> Path | None:
    base = model_path.with_suffix("")
    candidates: list[Path] = []
    for ext in _EXTRA_NETWORK_PREVIEW_EXTENSIONS:
        candidates.append(Path(str(base) + ext))
        candidates.append(Path(str(base) + ".preview" + ext))
    for candidate in candidates:
        try:
            if candidate.is_file():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _extra_network_prompt(page_key: str, model_path: Path, name: str) -> str:
    clean_name = Path(str(name or model_path.stem).replace("\\", "/")).stem
    if page_key in {"lora", "loras"}:
        return f"<lora:{clean_name}:1>"
    if page_key in {"textual inversion", "textual_inversion", "embeddings", "embedding"}:
        return clean_name
    return ""


def _extra_network_user_metadata_path(model_path: Path) -> Path:
    return Path(str(model_path.with_suffix("")) + ".json")


def _extra_network_user_metadata_for_path(model_path: Path) -> dict[str, Any]:
    target = _extra_network_user_metadata_path(model_path)
    try:
        if target.is_file():
            loaded = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                return loaded
    except Exception:
        return {}
    return {}


def _extra_network_metadata_for_path(model_path: Path) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for candidate in (Path(str(model_path.with_suffix("")) + ".json"), Path(str(model_path) + ".json")):
        try:
            if candidate.is_file():
                loaded = json.loads(candidate.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    metadata.update(loaded)
        except Exception:
            continue
    try:
        stat = model_path.stat()
        metadata.setdefault("filename", str(model_path))
        metadata.setdefault("size_bytes", int(stat.st_size))
        metadata.setdefault("modified_time", int(stat.st_mtime))
    except OSError:
        metadata.setdefault("filename", str(model_path))
    return metadata


def _extra_network_internal_metadata_for_path(page: str, model_path: Path) -> dict[str, Any]:
    if _extra_network_page_key(page) in {"lora", "loras"}:
        return _source_safetensors_metadata(str(model_path))
    return {}


def _pretty_extra_network_size(size: int) -> str:
    value = float(max(0, int(size)))
    units = ("B", "KB", "MB", "GB", "TB")
    unit = units[0]
    for unit in units:
        if value < 1024 or unit == units[-1]:
            break
        value /= 1024
    if unit == "B":
        return f"{int(value)}B"
    if value >= 10:
        return f"{value:.0f}{unit}"
    number = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{number}{unit}"


def _extra_network_relative_filename(model_path: Path) -> str:
    roots = _extra_network_allowed_roots()
    for root in roots:
        try:
            return str(model_path.resolve().relative_to(root)).replace("\\", "/")
        except ValueError:
            continue
    return model_path.name


def _extra_network_base_model(user_metadata: dict[str, Any]) -> str:
    version = (
        user_metadata.get("sd_version_str")
        or user_metadata.get("sd version")
        or user_metadata.get("sd_version")
        or user_metadata.get("base_model")
        or "Unknown"
    )
    clean = str(version or "Unknown").replace("SdVersion.", "")
    return clean if clean in {"SD1", "SDXL", "Flux", "Unknown"} else "Unknown"


def _extra_network_vae_te(user_metadata: dict[str, Any]) -> list[str]:
    value = user_metadata.get("vae_te", None)
    if value is None:
        value = user_metadata.get("vae", None)
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item or "").strip()]
    return [str(value)]


def _extra_network_module_choices() -> list[str]:
    choices = ["Built in"]
    try:
        for row in sd_modules_payload():
            name = str(row.get("model_name") or "").strip()
            if name and name not in choices:
                choices.append(name)
    except Exception:
        pass
    return choices


def sd_extra_networks_metadata_payload(page: str = "", item: str = "") -> dict[str, Any]:
    model_path = _resolve_extra_network_file(page, item)
    if model_path is None:
        return {}
    metadata = _extra_network_metadata_for_path(model_path)
    internal_metadata = _extra_network_internal_metadata_for_path(page, model_path)
    metadata.pop("ssmd_cover_images", None)
    user_metadata = _extra_network_user_metadata_for_path(model_path)
    preview = _extra_network_preview_path(model_path)
    preview_url = ""
    if preview is not None:
        preview_url = "./sd_extra_networks/thumb?filename=" + urllib.parse.quote(str(preview).replace("\\", "/"))
    file_size = int(metadata.get("size_bytes") or 0)
    modified_time = int(metadata.get("modified_time") or 0)
    modified_text = datetime.fromtimestamp(modified_time).strftime("%Y-%m-%d %H:%M") if modified_time else ""
    return {
        "metadata": json.dumps(metadata, ensure_ascii=False, indent=4),
        "internal_metadata": internal_metadata,
        "user_metadata": user_metadata,
        "name": model_path.stem,
        "filename": str(model_path),
        "display_filename": _extra_network_relative_filename(model_path),
        "file_size": file_size,
        "file_size_text": _pretty_extra_network_size(file_size),
        "modified_time": modified_time,
        "modified_text": modified_text,
        "preview_url": preview_url,
        "base_model": _extra_network_base_model(user_metadata),
        "vae_te": _extra_network_vae_te(user_metadata),
        "vae_te_choices": _extra_network_module_choices(),
    }


def sd_extra_networks_metadata_save_payload(values: dict[str, Any]) -> dict[str, str]:
    page = str(values.get("page") or "")
    item = str(values.get("item") or "")
    model_path = _resolve_extra_network_file(page, item)
    if model_path is None:
        raise HTTPException(status_code=404, detail="File not found")

    raw_metadata = values.get("metadata", {})
    if isinstance(raw_metadata, str):
        try:
            metadata = json.loads(raw_metadata or "{}")
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Metadata must be a JSON object") from exc
    else:
        metadata = raw_metadata
    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="Metadata must be a JSON object")

    user_metadata = dict(metadata)
    for key in ("filename", "size_bytes", "modified_time"):
        user_metadata.pop(key, None)
    page_key = _extra_network_page_key(page)
    if page_key in {"lora", "loras"}:
        for key in ("sd_version_str", "vae_te"):
            user_metadata.pop(key, None)
    else:
        for key in ("activation text", "negative text", "preferred weight", "sd version"):
            user_metadata.pop(key, None)
    target = _extra_network_user_metadata_path(model_path)
    try:
        target.write_text(json.dumps(user_metadata, ensure_ascii=False, indent=4), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"status": "ok", "filename": str(target), "metadata": json.dumps(user_metadata, ensure_ascii=False, indent=4)}


def sd_extra_networks_preview_save_payload(values: dict[str, Any]) -> dict[str, str]:
    page = str(values.get("page") or "")
    item = str(values.get("item") or "")
    model_path = _resolve_extra_network_file(page, item)
    if model_path is None:
        raise HTTPException(status_code=404, detail="File not found")

    image_data = str(values.get("image_data") or "")
    if "," in image_data and image_data.lower().startswith("data:"):
        image_data = image_data.split(",", 1)[1]
    try:
        raw = base64.b64decode(image_data, validate=False)
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Preview must be an image") from exc

    existing_preview = _extra_network_preview_path(model_path)
    target = existing_preview if existing_preview is not None else Path(str(model_path.with_suffix("")) + ".preview.png")
    suffix = target.suffix.lower()
    image_format = {
        ".jpg": "JPEG",
        ".jpeg": "JPEG",
        ".png": "PNG",
        ".webp": "WEBP",
        ".gif": "GIF",
    }.get(suffix, "PNG")
    if image_format == "JPEG" and image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    try:
        image.save(target, format=image_format)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    preview_url = "./sd_extra_networks/thumb?filename=" + urllib.parse.quote(str(target.resolve()).replace("\\", "/"))
    return {"status": "ok", "filename": str(target), "preview_url": preview_url}


def sd_extra_networks_thumb_response(filename: str = "") -> FileResponse:
    path = Path(str(filename or "")).resolve()
    roots = _extra_network_allowed_roots()
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    if path.suffix.lower() not in _EXTRA_NETWORK_PREVIEW_EXTENSIONS:
        raise HTTPException(status_code=404, detail="File not found")
    if not _path_is_under(path, roots):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), headers={"Accept-Ranges": "bytes"})


def sd_extra_networks_cover_images_response(page: str = "", item: str = "", index: int = 0) -> Response:
    model_path = _resolve_extra_network_file(page, item)
    if model_path is None:
        raise HTTPException(status_code=404, detail="File not found")
    metadata = _extra_network_metadata_for_path(model_path)
    cover_images = metadata.get("ssmd_cover_images")
    if isinstance(cover_images, str):
        try:
            cover_images = json.loads(cover_images)
        except json.JSONDecodeError:
            cover_images = []
    if not isinstance(cover_images, list) or index >= len(cover_images):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        raw = base64.b64decode(str(cover_images[index] or ""), validate=False)
        image = Image.open(io.BytesIO(raw))
        buffer = io.BytesIO()
        image.save(buffer, format=image.format or "PNG")
        return Response(content=buffer.getvalue(), media_type=image.get_format_mimetype())
    except Exception as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc


def sd_extra_networks_single_card_payload(page: str = "", tabname: str = "", name: str = "") -> dict[str, str]:
    page_key = _extra_network_page_key(page)
    if page_key not in _EXTRA_NETWORK_PAGE_CATALOGS:
        raise HTTPException(status_code=500, detail="'NoneType' object has no attribute 'items'")
    model_path = _resolve_extra_network_file(page, name)
    if model_path is None:
        return {"html": ""}
    preview = _extra_network_preview_path(model_path)
    preview_attr = ""
    if preview is not None:
        preview_url = "./sd_extra_networks/thumb?filename=" + urllib.parse.quote(str(preview).replace("\\", "/"))
        preview_attr = f" data-preview=\"{preview_url}\""
    safe_name = html_lib.escape(str(name or model_path.stem), quote=True)
    safe_title = html_lib.escape(Path(str(name or model_path.stem).replace("\\", "/")).stem)
    safe_filename = html_lib.escape(str(model_path), quote=True)
    prompt = html_lib.escape(_extra_network_prompt(page_key, model_path, name), quote=True)
    html = (
        f"<div class=\"card\" data-name=\"{safe_name}\" data-filename=\"{safe_filename}\""
        f" data-prompt=\"{prompt}\"{preview_attr}>"
        f"<div class=\"actions\"></div><span class=\"name\">{safe_title}</span>"
        "</div>"
    )
    return {"html": html}


def _runtime_extensions_module() -> Any:
    return sys.modules.get("modules.extensions") or sys.modules.get("forge_neo.runtime_backend.modules.extensions")


def _runtime_extensions_payload() -> list[dict[str, Any]] | None:
    runtime_extensions = _runtime_extensions_module()
    if runtime_extensions is None:
        return None
    list_runtime_extensions = getattr(runtime_extensions, "list_extensions", None)
    if callable(list_runtime_extensions):
        list_runtime_extensions()
    extension_items = getattr(runtime_extensions, "extensions", None)
    if extension_items is None:
        return None
    rows = []
    for item in extension_items:
        read_info_from_repo = getattr(item, "read_info_from_repo", None)
        if callable(read_info_from_repo):
            read_info_from_repo()
        if getattr(item, "remote", None) is None:
            continue
        rows.append(
            {
                "name": _jsonable(getattr(item, "name", None)),
                "remote": _jsonable(getattr(item, "remote", None)),
                "branch": _jsonable(getattr(item, "branch", None)),
                "commit_hash": _jsonable(getattr(item, "commit_hash", None)),
                "version": _jsonable(getattr(item, "version", None)),
                "commit_date": _jsonable(getattr(item, "commit_date", None)),
                "enabled": _jsonable(getattr(item, "enabled", None)),
            }
        )
    return rows


_SDAPI_PROFILE_EXTENSION_NAMES = (
    "Auto-Photoshop-StableDiffusion-Plugin",
    "adetailer",
    "sd-forge-couple",
    "sd-webui-prompt-all-in-one-forgeneo",
    "stable-diffusion-webui-wd14-tagger",
)


def _profile_extension_name_map() -> dict[str, Any]:
    try:
        from forge_neo.extension_adapter import EXTENSION_PROFILE_BY_NAME
    except Exception:
        return {}
    rows: dict[str, Any] = {}
    for name in _SDAPI_PROFILE_EXTENSION_NAMES:
        profile = EXTENSION_PROFILE_BY_NAME.get(name)
        if profile is None:
            continue
        rows[profile.name.lower()] = profile
        dirname = str(profile.extension_dirname or profile.name).lower()
        rows[dirname] = profile
    return rows


def _profile_extensions_payload(items: list[Any], existing_names: set[str]) -> list[dict[str, Any]]:
    profiles = _profile_extension_name_map()
    if not profiles:
        return []
    rows = []
    for item in items:
        profile = profiles.get(str(getattr(item, "name", "") or "").lower())
        if profile is None:
            continue
        if profile.name.lower() in existing_names:
            continue
        remote = str(getattr(profile, "remote_url", "") or "")
        if not remote:
            continue
        try:
            commit_date = int(Path(item.path).stat().st_mtime)
        except OSError:
            commit_date = 0
        commit_hash = str(getattr(item, "version", "") or getattr(profile, "source_commit", "") or "")
        rows.append(
            {
                "name": profile.name,
                "remote": remote,
                "branch": str(getattr(item, "branch", "") or getattr(profile, "source_branch", "") or ""),
                "commit_hash": commit_hash,
                "version": commit_hash,
                "commit_date": commit_date,
                "enabled": bool(getattr(item, "enabled", False)),
            }
        )
        existing_names.add(profile.name.lower())
    return rows


def extensions_payload() -> list[dict[str, Any]]:
    runtime_payload = _runtime_extensions_payload()
    if runtime_payload is not None:
        return runtime_payload

    rows = []
    items = list_extensions()
    existing_names: set[str] = set()
    for item in items:
        remote = getattr(item, "remote", None)
        if not remote or getattr(item, "source", "") == "built-in" or remote == "built-in":
            continue
        try:
            commit_date = int(Path(item.path).stat().st_mtime)
        except OSError:
            commit_date = 0
        rows.append(
            {
                "name": item.name,
                "remote": remote,
                "branch": item.branch,
                "commit_hash": item.version,
                "version": item.version,
                "commit_date": commit_date,
                "enabled": bool(item.enabled),
            }
        )
        existing_names.add(str(item.name).lower())
    rows.extend(_profile_extensions_payload(items, existing_names))
    return rows


def memory_payload() -> dict[str, Any]:
    try:
        import os as os_module

        import psutil

        process = psutil.Process(os_module.getpid())
        res = process.memory_info()
        memory_percent = float(process.memory_percent() or 0.0)
        ram_total = 100.0 * float(res.rss) / memory_percent if memory_percent else float(res.rss)
        ram = {"free": ram_total - float(res.rss), "used": res.rss, "total": ram_total}
    except Exception as err:
        ram = {"error": f"{err}"}

    try:
        import torch

        if torch.cuda.is_available():
            backend = torch.cuda
            device_type = "cuda"
        elif hasattr(torch, "xpu") and torch.xpu.is_available():
            backend = torch.xpu
            device_type = "xpu"
        else:
            backend = None
            device_type = ""

        if backend is not None:
            try:
                device_index = backend.current_device()
                device = torch.device(device_type, device_index)
            except Exception:
                device = device_type
            free, total = backend.mem_get_info()
            stats = dict(backend.memory_stats(device))
            cuda = {
                "device": str(device),
                "system": {"free": int(free), "used": int(total - free), "total": int(total)},
                "active": {
                    "current": int(stats.get("active_bytes.all.current", 0)),
                    "peak": int(stats.get("active_bytes.all.peak", 0)),
                },
                "allocated": {
                    "current": int(stats.get("allocated_bytes.all.current", 0)),
                    "peak": int(stats.get("allocated_bytes.all.peak", 0)),
                },
                "reserved": {
                    "current": int(stats.get("reserved_bytes.all.current", 0)),
                    "peak": int(stats.get("reserved_bytes.all.peak", 0)),
                },
                "inactive": {
                    "current": int(stats.get("inactive_split_bytes.all.current", 0)),
                    "peak": int(stats.get("inactive_split_bytes.all.peak", 0)),
                },
                "events": {
                    "retries": int(stats.get("num_alloc_retries", 0)),
                    "oom": int(stats.get("num_ooms", 0)),
                },
            }
        else:
            cuda = {"error": "unavailable"}
    except Exception as err:
        cuda = {"error": f"{err}"}
    return {"ram": ram, "cuda": cuda}


def refresh_catalog_payload(preset: str = "klein") -> None:
    refresh_model_choices(preset)
    return None


def refresh_checkpoints_payload(preset: str = "klein") -> None:
    shared_module = _runtime_shared_module()
    refresh_checkpoints = getattr(shared_module, "refresh_checkpoints", None) if shared_module is not None else None
    if callable(refresh_checkpoints):
        refresh_checkpoints()
        return None
    return refresh_catalog_payload(preset)


def refresh_vae_payload(preset: str = "klein") -> None:
    shared_items_module = sys.modules.get("modules.shared_items") or sys.modules.get("forge_neo.runtime_backend.modules.shared_items")
    refresh_vae_list = getattr(shared_items_module, "refresh_vae_list", None) if shared_items_module is not None else None
    if callable(refresh_vae_list):
        refresh_vae_list()
        return None
    return refresh_catalog_payload(preset)


def refresh_loras_payload(preset: str = "klein") -> Any:
    runtime_networks = sys.modules.get("networks")
    list_available_networks = getattr(runtime_networks, "list_available_networks", None) if runtime_networks is not None else None
    if callable(list_available_networks):
        return list_available_networks()
    return refresh_catalog_payload(preset)


def refresh_embeddings_payload(preset: str = "klein") -> None:
    runtime_database = _runtime_embedding_database()
    load_embeddings = getattr(runtime_database, "load_textual_inversion_embeddings", None) if runtime_database is not None else None
    if callable(load_embeddings):
        load_embeddings(force_reload=True, sync_with_sd_model=False)
        return None
    return refresh_catalog_payload(preset)


def unload_checkpoint_payload() -> dict[str, Any]:
    runtime_sd_models = sys.modules.get("modules.sd_models") or sys.modules.get("forge_neo.runtime_backend.modules.sd_models")
    unload_model_weights = getattr(runtime_sd_models, "unload_model_weights", None) if runtime_sd_models is not None else None
    if callable(unload_model_weights):
        unload_model_weights()
    else:
        unload_runtime_state()
    return {}


def interrupt_payload() -> dict[str, Any]:
    shared_module = _runtime_shared_module()
    state = getattr(shared_module, "state", None) if shared_module is not None else None
    interrupt = getattr(state, "interrupt", None) if state is not None else None
    if callable(interrupt):
        interrupt()
    else:
        stop_current({"__lang": "en"})
    return {}


def skip_payload() -> None:
    shared_module = _runtime_shared_module()
    state = getattr(shared_module, "state", None) if shared_module is not None else None
    skip = getattr(state, "skip", None) if state is not None else None
    if callable(skip):
        skip()
    else:
        skip_current({"__lang": "en"})
    return None


def _sdapi_payload_with_infotext_defaults(values: dict[str, Any]) -> dict[str, Any]:
    payload = dict(values or {})
    infotext = str(payload.get("infotext") or "").strip()
    if not infotext:
        return payload

    params = parse_generation_parameters_source_api(infotext)

    def fill(target: str, source: str) -> None:
        value = params.get(source)
        if target not in payload and value not in (None, ""):
            payload[target] = value

    fill("prompt", "Prompt")
    fill("negative_prompt", "Negative prompt")
    fill("steps", "Steps")
    fill("sampler_name", "Sampler")
    fill("scheduler", "Schedule type")
    fill("cfg_scale", "CFG scale")
    fill("distilled_cfg_scale", "Distilled CFG Scale")
    fill("seed", "Seed")
    fill("denoising_strength", "Denoising strength")
    fill("width", "Size-1")
    fill("height", "Size-2")
    return payload


def _sdapi_generation_int_value(
    payload: dict[str, Any],
    field: str,
    default: int,
    *,
    source_api: bool,
    minimum: int,
    maximum: int,
) -> int:
    if source_api and field in payload:
        value = _sdapi_source_optional_int_field(payload, field)
        return default if value is None else value
    return _to_int(payload.get(field), default, minimum=minimum, maximum=maximum)


def _sdapi_generation_float_value(
    payload: dict[str, Any],
    field: str,
    default: float,
    *,
    source_api: bool,
    minimum: float,
    maximum: float,
) -> float:
    if source_api and field in payload:
        value = _sdapi_source_optional_float_field(payload, field)
        return default if value is None else value
    return _to_float(payload.get(field), default, minimum=minimum, maximum=maximum)


def _sdapi_generation_optional_float_value(
    payload: dict[str, Any],
    field: str,
    *,
    source_api: bool,
    minimum: float,
    maximum: float,
) -> float | None:
    if source_api and field in payload:
        return _sdapi_source_optional_float_field(payload, field)
    return _to_optional_float(payload.get(field), minimum=minimum, maximum=maximum)


def _sdapi_generation_bool_value(payload: dict[str, Any], field: str, default: bool, *, source_api: bool) -> bool:
    if source_api and field in payload:
        value = _sdapi_source_optional_bool_field(payload, field)
        return default if value is None else value
    return _to_bool(payload.get(field), default)


def _sdapi_generation_optional_bool_value(payload: dict[str, Any], field: str, *, source_api: bool) -> bool | None:
    if source_api and field in payload:
        return _sdapi_source_optional_bool_field(payload, field)
    return _to_optional_bool(payload.get(field))


def _request_from_generation_payload(values: dict[str, Any], *, mode: str, source_api: bool = False) -> ForgeNeoRequest:
    raw_payload = values or {}
    if source_api:
        _sdapi_validate_generation_source_payload(raw_payload, mode=mode)
    raw_payload_fields = {str(key) for key in raw_payload.keys()}
    explicit_payload_fields = (
        raw_payload_fields & _sdapi_generation_source_request_fields(mode)
        if source_api
        else raw_payload_fields
    )
    request_payload = _sdapi_generation_source_schema_payload(raw_payload, mode=mode) if source_api else raw_payload
    payload = _sdapi_payload_with_infotext_defaults(request_payload)
    source_api_raw_fields = dict(request_payload) if source_api else {}
    override_settings = payload.get("override_settings") if isinstance(payload.get("override_settings"), dict) else {}
    checkpoint = (
        payload.get("forge_neo_checkpoint")
        or payload.get("checkpoint")
        or override_settings.get("sd_model_checkpoint")
        or payload.get("sd_model_checkpoint")
        or "None"
    )
    raw_modules = (
        payload.get("text_encoders")
        or payload.get("additional_modules")
        or override_settings.get("forge_additional_modules")
    )
    vae = payload.get("vae") or payload.get("sd_vae") or override_settings.get("sd_vae") or "None"
    module_values = _as_strings(raw_modules)
    if module_values:
        vae, text_encoders = split_module_selection(module_values, fallback_vae=str(vae or "None"))
    else:
        text_encoders = []
    script_args = payload.get("script_args")
    if not isinstance(script_args, dict):
        script_args = {"api_script_args": list(script_args or [])} if script_args else {}
    if isinstance(payload.get("alwayson_scripts"), dict):
        script_args = {**script_args, "alwayson_scripts": payload.get("alwayson_scripts")}
    inpaint_mask_mode = str(payload.get("inpainting_mask_mode") or "").strip()
    if not inpaint_mask_mode:
        inpaint_mask_mode = (
            "Inpaint not masked"
            if _to_int(payload.get("inpainting_mask_invert"), 0, minimum=0, maximum=1) == 1
            else "Inpaint masked"
        )
    inpaint_full_res_value = _sdapi_generation_bool_value(payload, "inpaint_full_res", True, source_api=source_api)
    inpaint_area = str(payload.get("inpaint_area") or "").strip()
    if not inpaint_area:
        inpaint_area = "Only masked" if inpaint_full_res_value else "Whole picture"
    inpaint_padding_value = payload.get("inpaint_full_res_padding")
    if inpaint_padding_value is None:
        inpaint_padding_value = payload.get("inpaint_padding")
    hires_enabled = _sdapi_generation_bool_value(payload, "enable_hr", False, source_api=source_api) or _to_bool(payload.get("hires_fix"), False)
    hires_denoising_value = payload.get("hr_denoising_strength")
    if hires_denoising_value is None and hires_enabled:
        hires_denoising_value = payload.get("denoising_strength")
    seed_value = _sdapi_generation_int_value(payload, "seed", -1, source_api=source_api, minimum=-1, maximum=2**32 - 1)
    subseed_raw = payload.get("subseed")
    if subseed_raw is None:
        subseed_raw = payload.get("variation_seed")
    subseed_value = (
        _sdapi_generation_int_value(payload, "subseed", -1, source_api=source_api, minimum=-1, maximum=2**32 - 1)
        if source_api and "subseed" in payload
        else _to_int(subseed_raw, -1)
    )
    subseed_strength_raw = payload.get("subseed_strength")
    if subseed_strength_raw is None:
        subseed_strength_raw = payload.get("variation_seed_strength")
    subseed_strength = (
        _sdapi_generation_float_value(payload, "subseed_strength", 0.0, source_api=source_api, minimum=0.0, maximum=1.0)
        if source_api and "subseed_strength" in payload
        else _to_float(subseed_strength_raw, 0.0, minimum=0.0, maximum=1.0)
    )
    source_api_init_images = list(payload.get("init_images") or []) if source_api and isinstance(payload.get("init_images"), list) else []
    source_api_mask = payload.get("mask") if source_api and "mask" in payload else None
    firstpass_image_value = (
        payload.get("firstpass_image")
        if source_api and "firstpass_image" in payload
        else str(payload.get("firstpass_image") or "") or None
    )
    latent_mask_value = (
        payload.get("latent_mask")
        if source_api and "latent_mask" in payload
        else str(payload.get("latent_mask") or "") or None
    )
    adetailer_payload = payload.get("adetailer_args")
    if isinstance(adetailer_payload, dict):
        adetailer_args = [dict(adetailer_payload)]
    elif isinstance(adetailer_payload, list):
        adetailer_args = [dict(item) for item in adetailer_payload if isinstance(item, dict)]
    else:
        adetailer_args = []
    adetailer_enabled = _to_bool(payload.get("adetailer_enabled"), bool(adetailer_args))
    regional_prompter_payload = payload.get("regional_prompter_args")
    if isinstance(regional_prompter_payload, dict):
        regional_prompter_args: object = dict(regional_prompter_payload)
    elif isinstance(regional_prompter_payload, list):
        regional_prompter_args = list(regional_prompter_payload)
    else:
        regional_prompter_args = {}
    regional_prompter_enabled = _to_bool(
        payload.get("regional_prompter_enabled"),
        regional_prompter_args_active(regional_prompter_args),
    )
    forge_couple_payload = payload.get("forge_couple_args")
    if isinstance(forge_couple_payload, dict):
        forge_couple_args: object = dict(forge_couple_payload)
    elif isinstance(forge_couple_payload, list):
        forge_couple_args = list(forge_couple_payload)
    else:
        forge_couple_args = {}
    forge_couple_enabled = _to_bool(
        payload.get("forge_couple_enabled"),
        forge_couple_args_active(forge_couple_args),
    )
    dynamic_prompts_payload = payload.get("dynamic_prompts_args")
    if isinstance(dynamic_prompts_payload, dict):
        dynamic_prompts_args: object = dict(dynamic_prompts_payload)
    elif isinstance(dynamic_prompts_payload, list):
        dynamic_prompts_args = list(dynamic_prompts_payload)
    else:
        dynamic_prompts_args = {}
    dynamic_prompts_default_enabled = bool(dynamic_prompts_payload)
    if isinstance(dynamic_prompts_payload, dict) and any(
        str(key) in {"is_enabled", "enabled", "active", "dynamic_prompts_enabled"}
        for key in dynamic_prompts_payload
    ):
        dynamic_prompts_default_enabled = bool(dynamic_prompts_arg_dict(dynamic_prompts_payload).get("is_enabled"))
    dynamic_prompts_enabled = _to_bool(
        payload.get("dynamic_prompts_enabled"),
        dynamic_prompts_default_enabled,
    )
    seed_variance_delta = subseed_value - seed_value if seed_value >= 0 and subseed_value >= 0 else 0
    return ForgeNeoRequest(
        mode=mode,
        prompt=str(payload.get("prompt") or ""),
        negative_prompt=str(payload.get("negative_prompt") or ""),
        preset=str(payload.get("preset") or override_settings.get("forge_preset") or "klein"),
        checkpoint=str(checkpoint or "None"),
        vae=str(vae or "None"),
        text_encoders=text_encoders,
        low_bit_dtype=str(payload.get("low_bit_dtype") or override_settings.get("forge_unet_storage_dtype") or "Automatic"),
        override_settings=dict(override_settings),
        override_settings_restore_afterwards=_sdapi_generation_bool_value(payload, "override_settings_restore_afterwards", True, source_api=source_api),
        comments=dict(payload.get("comments") or {}) if isinstance(payload.get("comments"), dict) else {},
        send_images=_sdapi_generation_bool_value(payload, "send_images", True, source_api=source_api),
        save_images=_sdapi_generation_bool_value(payload, "save_images", False, source_api=source_api),
        do_not_save_samples=_sdapi_generation_bool_value(payload, "do_not_save_samples", False, source_api=source_api),
        do_not_save_grid=_sdapi_generation_bool_value(payload, "do_not_save_grid", False, source_api=source_api),
        include_init_images=_sdapi_generation_bool_value(payload, "include_init_images", False, source_api=source_api),
        force_task_id=str(payload.get("force_task_id") or ""),
        infotext=str(payload.get("infotext") or ""),
        api_payload_fields=explicit_payload_fields,
        source_api_request=source_api,
        source_api_raw_fields=source_api_raw_fields,
        styles=_as_strings(payload.get("styles") or payload.get("prompt_styles")),
        sampler=str(payload.get("sampler_name") or payload.get("sampler") or payload.get("sampler_index") or "Euler"),
        scheduler=str(payload.get("scheduler") or payload.get("schedule_type") or "Automatic"),
        steps=_sdapi_generation_int_value(payload, "steps", 50, source_api=source_api, minimum=1, maximum=150),
        width=_sdapi_generation_int_value(payload, "width", 512, source_api=source_api, minimum=64, maximum=4096),
        height=_sdapi_generation_int_value(payload, "height", 512, source_api=source_api, minimum=64, maximum=4096),
        cfg_scale=_sdapi_generation_float_value(payload, "cfg_scale", 7.0, source_api=source_api, minimum=0.0, maximum=100.0),
        distilled_cfg_scale=_sdapi_generation_float_value(payload, "distilled_cfg_scale", 3.5, source_api=source_api, minimum=0.0, maximum=100.0),
        eta=_sdapi_generation_optional_float_value(payload, "eta", source_api=source_api, minimum=0.0, maximum=1.0),
        s_min_uncond=_sdapi_generation_optional_float_value(payload, "s_min_uncond", source_api=source_api, minimum=0.0, maximum=8.0),
        s_churn=_sdapi_generation_optional_float_value(payload, "s_churn", source_api=source_api, minimum=0.0, maximum=100.0),
        s_tmax=_sdapi_generation_optional_float_value(payload, "s_tmax", source_api=source_api, minimum=0.0, maximum=999.0),
        s_tmin=_sdapi_generation_optional_float_value(payload, "s_tmin", source_api=source_api, minimum=0.0, maximum=10.0),
        s_noise=_sdapi_generation_optional_float_value(payload, "s_noise", source_api=source_api, minimum=0.0, maximum=1.1),
        image_cfg_scale=(
            _sdapi_generation_float_value(payload, "image_cfg_scale", 1.5, source_api=source_api, minimum=0.0, maximum=100.0)
            if payload.get("image_cfg_scale") is not None
            else None
        ),
        rescale_cfg=_to_float(payload.get("rescale_cfg"), 0.0, minimum=0.0, maximum=1.0),
        denoising_strength=_sdapi_generation_float_value(payload, "denoising_strength", 0.75, source_api=source_api, minimum=0.0, maximum=1.0),
        selected_scale_tab=_to_int(payload.get("selected_scale_tab"), 0, minimum=0, maximum=3),
        resize_mode=payload.get("resize_mode", 0),
        resize_scale=_to_float(payload.get("resize_scale"), 1.0, minimum=0.05, maximum=16.0),
        mask_blur=_sdapi_generation_int_value(payload, "mask_blur", 4, source_api=source_api, minimum=0, maximum=256),
        mask_round=_sdapi_generation_bool_value(payload, "mask_round", True, source_api=source_api),
        mask_alpha=_to_float(payload.get("mask_alpha"), 0.0, minimum=0.0, maximum=1.0),
        inpainting_fill=payload.get("inpainting_fill", payload.get("masked_content", 0)),
        inpainting_mask_mode=inpaint_mask_mode,
        inpaint_area=inpaint_area,
        inpaint_padding=(
            _sdapi_generation_int_value(payload, "inpaint_full_res_padding", 0, source_api=source_api, minimum=0, maximum=512)
            if "inpaint_full_res_padding" in payload
            else _to_int(inpaint_padding_value, 0, minimum=0, maximum=512)
        ),
        initial_noise_multiplier=_sdapi_generation_optional_float_value(payload, "initial_noise_multiplier", source_api=source_api, minimum=0.0, maximum=100.0),
        seed=seed_value,
        subseed=subseed_value if subseed_raw is not None else None,
        subseed_strength=subseed_strength if subseed_strength_raw is not None else None,
        seed_resize_from_w=_sdapi_generation_int_value(payload, "seed_resize_from_w", -1, source_api=source_api, minimum=-1, maximum=8192),
        seed_resize_from_h=_sdapi_generation_int_value(payload, "seed_resize_from_h", -1, source_api=source_api, minimum=-1, maximum=8192),
        seed_enable_extras=True if source_api else _sdapi_generation_bool_value(payload, "seed_enable_extras", True, source_api=source_api),
        restore_faces=_sdapi_generation_optional_bool_value(payload, "restore_faces", source_api=source_api),
        tiling=_sdapi_generation_optional_bool_value(payload, "tiling", source_api=source_api),
        disable_extra_networks=_sdapi_generation_bool_value(payload, "disable_extra_networks", False, source_api=source_api),
        seed_variance_enabled=subseed_strength > 0,
        seed_variance_delta=seed_variance_delta,
        seed_variance_strength=subseed_strength,
        batch_count=(
            _sdapi_generation_int_value(payload, "n_iter", 1, source_api=source_api, minimum=1, maximum=999)
            if "n_iter" in payload
            else _to_int(payload.get("batch_count"), 1, minimum=1, maximum=999)
        ),
        batch_size=_sdapi_generation_int_value(payload, "batch_size", 1, source_api=source_api, minimum=1, maximum=64),
        hires_fix=hires_enabled,
        hires_scale=_sdapi_generation_float_value(payload, "hr_scale", 2.0, source_api=source_api, minimum=1.0, maximum=8.0),
        hires_steps=_sdapi_generation_int_value(payload, "hr_second_pass_steps", 0, source_api=source_api, minimum=0, maximum=150),
        hires_denoising_strength=(
            _sdapi_generation_float_value(payload, "denoising_strength", 0.75, source_api=source_api, minimum=0.0, maximum=1.0)
            if source_api and "denoising_strength" in payload and hires_denoising_value is not None
            else _to_float(hires_denoising_value, 0.75, minimum=0.0, maximum=1.0)
        ),
        hires_upscaler=str(payload.get("hr_upscaler") or "Latent"),
        hires_resize_x=_sdapi_generation_int_value(payload, "hr_resize_x", 0, source_api=source_api, minimum=0, maximum=8192),
        hires_resize_y=_sdapi_generation_int_value(payload, "hr_resize_y", 0, source_api=source_api, minimum=0, maximum=8192),
        firstphase_width=_sdapi_generation_int_value(payload, "firstphase_width", 0, source_api=source_api, minimum=0, maximum=8192),
        firstphase_height=_sdapi_generation_int_value(payload, "firstphase_height", 0, source_api=source_api, minimum=0, maximum=8192),
        firstpass_image=firstpass_image_value,
        hires_checkpoint=str(payload.get("hr_checkpoint_name") or payload.get("hr_checkpoint") or "Use same checkpoint"),
        hires_additional_modules=_as_strings(payload.get("hr_additional_modules") or ["Use same choices"]),
        hires_sampler=str(payload.get("hr_sampler_name") or payload.get("hr_sampler") or "Use same sampler"),
        hires_scheduler=str(payload.get("hr_scheduler") or "Use same scheduler"),
        hires_prompt=str(payload.get("hr_prompt") or ""),
        hires_negative_prompt=str(payload.get("hr_negative_prompt") or ""),
        hires_cfg=_sdapi_generation_float_value(payload, "hr_cfg", 1.0, source_api=source_api, minimum=0.0, maximum=100.0),
        hires_distilled_cfg=_sdapi_generation_float_value(payload, "hr_distilled_cfg", 3.5, source_api=source_api, minimum=0.0, maximum=100.0),
        refiner=bool(payload.get("refiner") or payload.get("refiner_checkpoint")),
        refiner_checkpoint=str(payload.get("refiner_checkpoint") or "None"),
        refiner_switch_at=_sdapi_generation_float_value(payload, "refiner_switch_at", 0.875, source_api=source_api, minimum=0.0, maximum=1.0),
        adetailer_enabled=adetailer_enabled,
        adetailer_skip_img2img=_to_bool(payload.get("adetailer_skip_img2img"), False),
        adetailer_args=adetailer_args,
        regional_prompter_enabled=regional_prompter_enabled,
        regional_prompter_args=regional_prompter_args,
        forge_couple_enabled=forge_couple_enabled,
        forge_couple_args=forge_couple_args,
        dynamic_prompts_enabled=dynamic_prompts_enabled,
        dynamic_prompts_args=dynamic_prompts_args,
        script=str(payload.get("script_name") or payload.get("script") or "None"),
        script_args=script_args,
        init_image=_decode_base64_image(payload["init_images"][0]) if mode == "img2img" and payload.get("init_images") else None,
        mask_image=_decode_base64_image(payload["mask"]) if mode == "img2img" and payload.get("mask") else None,
        source_api_init_images=source_api_init_images,
        source_api_mask=source_api_mask,
        latent_mask=latent_mask_value,
        batch_files=[item for item in payload.get("imageList", []) if item] if mode == "img2img" else [],
        batch_source_type=str(payload.get("batch_source_type") or payload.get("batch_mode") or "upload"),
        batch_input_dir=str(payload.get("batch_input_dir") or ""),
        batch_output_dir=str(payload.get("batch_output_dir") or ""),
        batch_inpaint_mask_dir=str(payload.get("batch_inpaint_mask_dir") or ""),
        batch_use_png_info=_to_bool(payload.get("batch_use_png_info"), False),
        batch_png_info_props=_as_strings(payload.get("batch_png_info_props")),
        batch_png_info_dir=str(payload.get("batch_png_info_dir") or ""),
    )


def _sdapi_resize_mode_parameter(value: object) -> int:
    if isinstance(value, (int, float)):
        return _to_int(value, 0, minimum=0, maximum=3)
    text = str(value or "").strip().lower()
    return {
        "just resize": 0,
        "resize and fill": 1,
        "crop and resize": 2,
        "just resize (latent upscale)": 3,
    }.get(text, _to_int(value, 0, minimum=0, maximum=3))


def _sdapi_inpainting_fill_parameter(value: object) -> int:
    if isinstance(value, (int, float)):
        return _to_int(value, 0, minimum=0, maximum=3)
    text = str(value or "").strip().lower()
    return {
        "fill": 0,
        "original": 1,
        "latent noise": 2,
        "latent nothing": 3,
    }.get(text, _to_int(value, 0, minimum=0, maximum=3))


def _sdapi_preserve_explicit_source_parameters(params: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    infotext_sets_override_settings = bool((payload or {}).get("infotext"))
    for key, value in (payload or {}).items():
        if key == "override_settings" and value is None and infotext_sets_override_settings:
            continue
        if (value is None or value == "") and key in params:
            params[key] = value
    return params


def _sdapi_source_response_parameters(payload: dict[str, Any], request: ForgeNeoRequest, *, mode: str) -> dict[str, Any]:
    params = _copy_sdapi_parameter_defaults(_SDAPI_COMMON_PARAMETER_DEFAULTS)
    params.update(
        _copy_sdapi_parameter_defaults(
            _SDAPI_IMG2IMG_PARAMETER_DEFAULTS if mode == "img2img" else _SDAPI_TXT2IMG_PARAMETER_DEFAULTS
        )
    )
    for key in list(params):
        if key in payload:
            params[key] = _jsonable(payload[key])

    params.update(
        {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "seed": request.seed,
            "subseed": request.subseed if request.subseed is not None else -1,
            "subseed_strength": request.subseed_strength if request.subseed_strength is not None else 0.0,
            "seed_resize_from_w": request.seed_resize_from_w,
            "seed_resize_from_h": request.seed_resize_from_h,
            "seed_enable_extras": request.seed_enable_extras,
            "batch_size": request.batch_size,
            "n_iter": request.batch_count,
            "steps": request.steps,
            "cfg_scale": request.cfg_scale,
            "distilled_cfg_scale": request.distilled_cfg_scale,
            "width": request.width,
            "height": request.height,
            "restore_faces": request.restore_faces,
            "tiling": request.tiling,
            "do_not_save_samples": request.do_not_save_samples,
            "do_not_save_grid": request.do_not_save_grid,
            "eta": request.eta,
            "s_min_uncond": request.s_min_uncond,
            "s_churn": request.s_churn,
            "s_tmax": request.s_tmax,
            "s_tmin": request.s_tmin,
            "s_noise": request.s_noise,
            "disable_extra_networks": request.disable_extra_networks,
            "override_settings_restore_afterwards": request.override_settings_restore_afterwards,
            "firstpass_image": request.firstpass_image,
            "send_images": request.send_images,
            "save_images": request.save_images,
        }
    )
    if "styles" in payload or "prompt_styles" in payload:
        params["styles"] = list(request.styles or [])
    if "sampler_name" in payload or "sampler" in payload:
        params["sampler_name"] = request.sampler
    if "sampler_index" in payload:
        params["sampler_index"] = request.sampler
    if "scheduler" in payload or "schedule_type" in payload:
        params["scheduler"] = request.scheduler
    if "override_settings" in payload:
        params["override_settings"] = dict(request.override_settings or {})
    if payload.get("infotext") and params.get("override_settings") is None:
        params["override_settings"] = {}
    if "comments" in payload:
        params["comments"] = dict(request.comments or {})
    if "script_name" in payload:
        params["script_name"] = _jsonable(payload.get("script_name"))
    if "force_task_id" in payload:
        params["force_task_id"] = _jsonable(payload.get("force_task_id"))
    if "infotext" in payload:
        params["infotext"] = _jsonable(payload.get("infotext"))

    if mode == "txt2img":
        params.update(
            {
                "enable_hr": request.hires_fix,
                "denoising_strength": request.hires_denoising_strength,
                "firstphase_width": request.firstphase_width,
                "firstphase_height": request.firstphase_height,
                "hr_scale": request.hires_scale,
                "hr_second_pass_steps": request.hires_steps,
                "hr_resize_x": request.hires_resize_x,
                "hr_resize_y": request.hires_resize_y,
                "hr_prompt": request.hires_prompt,
                "hr_negative_prompt": request.hires_negative_prompt,
                "hr_cfg": request.hires_cfg,
                "hr_distilled_cfg": request.hires_distilled_cfg,
            }
        )
        if "hr_upscaler" in payload:
            params["hr_upscaler"] = request.hires_upscaler
        if "hr_checkpoint_name" in payload or "hr_checkpoint" in payload:
            params["hr_checkpoint_name"] = request.hires_checkpoint
        if "hr_additional_modules" in payload:
            params["hr_additional_modules"] = list(request.hires_additional_modules or [])
        if "hr_sampler_name" in payload or "hr_sampler" in payload:
            params["hr_sampler_name"] = request.hires_sampler
        if "hr_scheduler" in payload:
            params["hr_scheduler"] = request.hires_scheduler
        params = _sdapi_preserve_explicit_source_parameters(params, payload)
        for field in _SDAPI_GENERATION_API_NOT_ALLOWED_FIELDS:
            params.pop(field, None)
        return _jsonable(params)

    params.update(
        {
            "resize_mode": _sdapi_resize_mode_parameter(request.resize_mode),
            "denoising_strength": request.denoising_strength,
            "image_cfg_scale": request.image_cfg_scale,
            "mask_blur": request.mask_blur,
            "mask_round": request.mask_round,
            "inpainting_fill": _sdapi_inpainting_fill_parameter(request.inpainting_fill),
            "inpaint_full_res": str(request.inpaint_area or "").lower() == "only masked",
            "inpaint_full_res_padding": request.inpaint_padding,
            "inpainting_mask_invert": 1 if str(request.inpainting_mask_mode or "").lower() == "inpaint not masked" else 0,
            "initial_noise_multiplier": request.initial_noise_multiplier,
            "latent_mask": request.latent_mask,
            "include_init_images": request.include_init_images,
        }
    )
    if not request.include_init_images:
        params["init_images"] = None
        params["mask"] = None
    params = _sdapi_preserve_explicit_source_parameters(params, payload)
    for field in _SDAPI_GENERATION_API_NOT_ALLOWED_FIELDS:
        params.pop(field, None)
    return _jsonable(params)


def text2img_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = values or {}
    request = _request_from_generation_payload(payload, mode="txt2img", source_api=True)
    result = generate(request)
    images = _encode_sdapi_result_images(result, request) if request.send_images else []
    source_payload = _sdapi_generation_source_schema_payload(payload, mode="txt2img")
    return {"images": images, "parameters": _sdapi_source_response_parameters(source_payload, request, mode="txt2img"), "info": _sdapi_generation_info(result, request)}


def img2img_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = values or {}
    request = _request_from_generation_payload(payload, mode="img2img", source_api=True)
    source_payload = _sdapi_generation_source_schema_payload(payload, mode="img2img")
    if "init_images" not in source_payload or source_payload.get("init_images") is None:
        raise HTTPException(status_code=404, detail="Init image not found")
    result = generate(request)
    images = _encode_sdapi_result_images(result, request) if request.send_images else []
    parameters = _sdapi_source_response_parameters(source_payload, request, mode="img2img")
    return {"images": images, "parameters": parameters, "info": _sdapi_generation_info(result, request)}


def _sdapi_missing_field_detail(*path: Any) -> list[dict[str, Any]]:
    return [{"loc": ["body", *path], "msg": "Field required", "type": "missing"}]


def _sdapi_list_type_detail(*path: Any) -> list[dict[str, Any]]:
    return [{"loc": ["body", *path], "msg": "Input should be a valid list", "type": "list_type"}]


def _sdapi_dict_type_detail(*path: Any) -> list[dict[str, Any]]:
    return [{"loc": ["body", *path], "msg": "Input should be a valid dictionary", "type": "dict_type"}]


def _sdapi_model_type_detail(*path: Any) -> list[dict[str, Any]]:
    return [
        {
            "loc": ["body", *path],
            "msg": "Input should be a valid dictionary or instance of FileData",
            "type": "model_type",
        }
    ]


def _sdapi_string_type_detail(*path: Any) -> list[dict[str, Any]]:
    return [{"loc": ["body", *path], "msg": "Input should be a valid string", "type": "string_type"}]


def _sdapi_literal_resize_mode_detail() -> list[dict[str, Any]]:
    return [
        {
            "loc": ["body", "resize_mode"],
            "msg": "Input should be 0 or 1",
            "type": "literal_error",
            "ctx": {"expected": "0 or 1"},
        }
    ]


def _sdapi_validation_detail(field: str, message: str, error_type: str, ctx: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    detail: dict[str, Any] = {"loc": ["body", field], "msg": message, "type": error_type}
    if ctx is not None:
        detail["ctx"] = ctx
    return [detail]


def _sdapi_source_float_field(
    payload: dict[str, Any],
    field: str,
    default: float,
    *,
    gt: float | None = None,
    ge: float | None = None,
    le: float | None = None,
    finite: bool = False,
) -> float:
    if field not in payload:
        return default
    value = payload.get(field)
    if value is None:
        raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid number", "float_type"))
    if isinstance(value, (bool, int, float)):
        result = float(value)
    elif isinstance(value, str):
        try:
            result = float(value)
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid number, unable to parse string as a number", "float_parsing"),
            )
    elif isinstance(value, bytes):
        try:
            result = float(value.decode())
        except Exception:
            raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid number", "float_type"))
    else:
        raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid number", "float_type"))
    if finite and not math.isfinite(result):
        raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a finite number", "finite_number"))
    if gt is not None and not result > gt:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, f"Input should be greater than {gt:g}", "greater_than", {"gt": float(gt)}),
        )
    if ge is not None and not result >= ge:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, f"Input should be greater than or equal to {ge:g}", "greater_than_equal", {"ge": float(ge)}),
        )
    if le is not None and not result <= le:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, f"Input should be less than or equal to {le:g}", "less_than_equal", {"le": float(le)}),
        )
    return result


def _sdapi_source_parse_int_string(value: str, field: str) -> int:
    text = value.strip()
    signless = text[1:] if text[:1] in {"+", "-"} else text
    parts = signless.split(".")
    valid_decimal = len(parts) == 1 and parts[0].isdecimal()
    valid_zero_fraction = len(parts) == 2 and parts[0].isdecimal() and bool(parts[1]) and all(char == "0" for char in parts[1])
    if not valid_decimal and not valid_zero_fraction:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, "Input should be a valid integer, unable to parse string as an integer", "int_parsing"),
        )
    number_text = parts[0]
    sign = -1 if text.startswith("-") else 1
    return sign * int(number_text)


def _sdapi_source_int_field(payload: dict[str, Any], field: str, default: int, *, ge: int | None = None) -> int:
    if field not in payload:
        return default
    value = payload.get(field)
    if value is None:
        raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid integer", "int_type"))
    if isinstance(value, bool):
        result = int(value)
    elif isinstance(value, int):
        result = value
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a finite number", "finite_number"))
        if not value.is_integer():
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid integer, got a number with a fractional part", "int_from_float"),
            )
        result = int(value)
    elif isinstance(value, str):
        result = _sdapi_source_parse_int_string(value, field)
    else:
        try:
            result = int(value)
        except Exception:
            raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid integer", "int_type"))
    if ge is not None and result < ge:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, f"Input should be greater than or equal to {ge}", "greater_than_equal", {"ge": ge}),
        )
    return result


def _sdapi_source_string_field(payload: dict[str, Any], field: str, default: str) -> str:
    if field not in payload:
        return default
    value = payload.get(field)
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=_sdapi_string_type_detail(field))
    return value


def _sdapi_source_nullable_string_field(payload: dict[str, Any], field: str) -> str | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        raise HTTPException(status_code=422, detail=_sdapi_string_type_detail(field))
    return value


def _sdapi_source_list_field(payload: dict[str, Any], field: str, *, nullable: bool = False) -> list[Any] | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None and nullable:
        return None
    if not isinstance(value, (list, tuple, set)):
        raise HTTPException(status_code=422, detail=_sdapi_list_type_detail(field))
    return list(value)


def _sdapi_source_optional_list_field(payload: dict[str, Any], field: str) -> list[Any] | None:
    return _sdapi_source_list_field(payload, field, nullable=True)


def _sdapi_source_optional_string_list_field(payload: dict[str, Any], field: str) -> list[str] | None:
    values = _sdapi_source_optional_list_field(payload, field)
    if values is None:
        return None
    for index, item in enumerate(values):
        if not isinstance(item, str):
            raise HTTPException(status_code=422, detail=_sdapi_string_type_detail(field, index))
    return list(values)


def _sdapi_source_dict_field(payload: dict[str, Any], field: str, default: dict[str, Any] | None = None) -> dict[str, Any]:
    if field not in payload:
        return dict(default or {})
    value = payload.get(field)
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail=_sdapi_dict_type_detail(field))
    return value


def _sdapi_source_optional_dict_field(payload: dict[str, Any], field: str) -> dict[str, Any] | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None:
        return None
    if not isinstance(value, dict):
        raise HTTPException(status_code=422, detail=_sdapi_dict_type_detail(field))
    return value


def _sdapi_source_optional_int_field(payload: dict[str, Any], field: str) -> int | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a finite number", "finite_number"))
        if not value.is_integer():
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid integer, got a number with a fractional part", "int_from_float"),
            )
        return int(value)
    if isinstance(value, str):
        return _sdapi_source_parse_int_string(value, field)
    raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid integer", "int_type"))


def _sdapi_source_optional_float_field(payload: dict[str, Any], field: str) -> float | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None:
        return None
    if isinstance(value, (bool, int, float)):
        return float(value)
    if isinstance(value, bytes):
        try:
            value = value.decode()
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid number", "float_type"),
            )
    if isinstance(value, str):
        try:
            return float(value.strip())
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid number, unable to parse string as a number", "float_parsing"),
            )
    raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid number", "float_type"))


def _sdapi_source_bool_field(payload: dict[str, Any], field: str, default: bool) -> bool:
    if field not in payload:
        return default
    value = payload.get(field)
    if value is None:
        raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid boolean", "bool_type"))
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        if value == 0:
            return False
        if value == 1:
            return True
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, "Input should be a valid boolean, unable to interpret input", "bool_parsing"),
        )
    if isinstance(value, float):
        if not math.isfinite(value) or not value.is_integer():
            raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid boolean", "bool_type"))
        if value == 0:
            return False
        if value == 1:
            return True
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, "Input should be a valid boolean, unable to interpret input", "bool_parsing"),
        )
    if isinstance(value, bytes):
        try:
            value = value.decode()
        except Exception:
            raise HTTPException(
                status_code=422,
                detail=_sdapi_validation_detail(field, "Input should be a valid boolean, unable to interpret input", "bool_parsing"),
            )
    if isinstance(value, str):
        text = value.lower()
        if text in {"1", "true", "t", "yes", "y", "on"}:
            return True
        if text in {"0", "false", "f", "no", "n", "off"}:
            return False
        raise HTTPException(
            status_code=422,
            detail=_sdapi_validation_detail(field, "Input should be a valid boolean, unable to interpret input", "bool_parsing"),
        )
    raise HTTPException(status_code=422, detail=_sdapi_validation_detail(field, "Input should be a valid boolean", "bool_type"))


def _sdapi_source_optional_bool_field(payload: dict[str, Any], field: str) -> bool | None:
    if field not in payload:
        return None
    value = payload.get(field)
    if value is None:
        return None
    return _sdapi_source_bool_field(payload, field, False)


def _sdapi_validate_generation_source_payload(payload: dict[str, Any], *, mode: str) -> None:
    for field in ("prompt", "negative_prompt", "sampler_name", "scheduler", "firstpass_image", "refiner_checkpoint"):
        _sdapi_source_nullable_string_field(payload, field)
    _sdapi_source_string_field(payload, "sampler_index", "Euler")
    _sdapi_source_optional_string_list_field(payload, "styles")
    _sdapi_source_optional_dict_field(payload, "override_settings")
    _sdapi_source_optional_dict_field(payload, "comments")
    for field in ("seed", "subseed", "seed_resize_from_h", "seed_resize_from_w", "batch_size", "n_iter", "steps", "width", "height"):
        _sdapi_source_optional_int_field(payload, field)
    for field in (
        "subseed_strength",
        "cfg_scale",
        "distilled_cfg_scale",
        "eta",
        "s_min_uncond",
        "s_churn",
        "s_tmax",
        "s_tmin",
        "s_noise",
        "refiner_switch_at",
    ):
        _sdapi_source_optional_float_field(payload, field)
    for field in (
        "restore_faces",
        "tiling",
        "do_not_save_samples",
        "do_not_save_grid",
        "disable_extra_networks",
        "override_settings_restore_afterwards",
    ):
        _sdapi_source_optional_bool_field(payload, field)
    for field in ("script_name", "force_task_id", "infotext"):
        _sdapi_source_nullable_string_field(payload, field)
    _sdapi_source_list_field(payload, "script_args")
    _sdapi_source_dict_field(payload, "alwayson_scripts")
    _sdapi_source_bool_field(payload, "send_images", True)
    _sdapi_source_bool_field(payload, "save_images", False)
    if mode == "txt2img":
        for field in ("hr_upscaler", "hr_checkpoint_name", "hr_sampler_name", "hr_scheduler", "hr_prompt", "hr_negative_prompt"):
            _sdapi_source_nullable_string_field(payload, field)
        _sdapi_source_optional_list_field(payload, "hr_additional_modules")
        for field in ("firstphase_width", "firstphase_height", "hr_second_pass_steps", "hr_resize_x", "hr_resize_y"):
            _sdapi_source_optional_int_field(payload, field)
        for field in ("denoising_strength", "hr_scale", "hr_cfg", "hr_distilled_cfg"):
            _sdapi_source_optional_float_field(payload, field)
        _sdapi_source_optional_bool_field(payload, "enable_hr")
    if mode == "img2img":
        _sdapi_source_list_field(payload, "init_images", nullable=True)
        _sdapi_source_nullable_string_field(payload, "mask")
        _sdapi_source_nullable_string_field(payload, "latent_mask")
        for field in ("resize_mode", "mask_blur", "inpainting_fill", "inpaint_full_res_padding", "inpainting_mask_invert"):
            _sdapi_source_optional_int_field(payload, field)
        _sdapi_source_float_field(payload, "denoising_strength", 0.75)
        for field in ("image_cfg_scale", "initial_noise_multiplier"):
            _sdapi_source_optional_float_field(payload, field)
        for field in ("mask_round", "inpaint_full_res"):
            _sdapi_source_optional_bool_field(payload, field)
        _sdapi_source_bool_field(payload, "include_init_images", False)


def _extras_request_from_payload(values: dict[str, Any], *, mode: str) -> ForgeNeoExtrasRequest:
    payload = values or {}
    image_value = _sdapi_source_string_field(payload, "image", "") if mode == "single" else ""
    resize_mode = payload.get("resize_mode", 0)
    if resize_mode == 0:
        resize_mode = "Scale by"
    elif resize_mode == 1:
        resize_mode = "Scale to"
    else:
        raise HTTPException(status_code=422, detail=_sdapi_literal_resize_mode_detail())
    if mode == "batch" and "imageList" not in payload and "images" not in payload:
        raise HTTPException(
            status_code=422,
            detail=_sdapi_missing_field_detail("imageList"),
        )
    images = payload.get("imageList") if "imageList" in payload else payload.get("images") or []
    if mode == "batch" and "imageList" in payload:
        if not isinstance(images, list):
            raise HTTPException(status_code=422, detail=_sdapi_list_type_detail("imageList"))
        for index, item in enumerate(images):
            if not isinstance(item, dict):
                raise HTTPException(status_code=422, detail=_sdapi_model_type_detail("imageList", index))
            if "data" not in item:
                raise HTTPException(status_code=422, detail=_sdapi_missing_field_detail("imageList", index, "data"))
            if "name" not in item:
                raise HTTPException(status_code=422, detail=_sdapi_missing_field_detail("imageList", index, "name"))
            if not isinstance(item.get("data"), str):
                raise HTTPException(status_code=422, detail=_sdapi_string_type_detail("imageList", index, "data"))
            if not isinstance(item.get("name"), str):
                raise HTTPException(status_code=422, detail=_sdapi_string_type_detail("imageList", index, "name"))
    batch_files: list[Image.Image] = []
    for item in images:
        data = item.get("data") if isinstance(item, dict) else item
        if isinstance(item, dict) and "imageList" in payload:
            batch_files.append(_decode_base64_image(data))
        elif data:
            batch_files.append(_decode_base64_image(data))
    resize_scale = _sdapi_source_float_field(payload, "upscaling_resize", 2.0, gt=0.0)
    resize_width = _sdapi_source_int_field(payload, "upscaling_resize_w", 512, ge=1)
    resize_height = _sdapi_source_int_field(payload, "upscaling_resize_h", 512, ge=1)
    upscaler_2_visibility = _sdapi_source_float_field(payload, "extras_upscaler_2_visibility", 0.0, ge=0.0, le=1.0, finite=True)
    gfpgan_visibility = _sdapi_source_float_field(payload, "gfpgan_visibility", 0.0, ge=0.0, le=1.0, finite=True)
    codeformer_visibility = _sdapi_source_float_field(payload, "codeformer_visibility", 0.0, ge=0.0, le=1.0, finite=True)
    codeformer_weight = _sdapi_source_float_field(payload, "codeformer_weight", 0.0, ge=0.0, le=1.0, finite=True)
    upscaler_1 = _sdapi_source_string_field(payload, "upscaler_1", "None")
    upscaler_2 = _sdapi_source_string_field(payload, "upscaler_2", "None")
    show_results = (
        _sdapi_source_bool_field(payload, "show_extras_results", True)
        if "show_extras_results" in payload
        else _to_bool(payload.get("show_results"), True)
    )
    crop_to_fit = (
        _sdapi_source_bool_field(payload, "upscaling_crop", True)
        if "upscaling_crop" in payload
        else _to_bool(payload.get("crop_to_fit"), True)
    )
    upscale_first = _sdapi_source_bool_field(payload, "upscale_first", False)
    if "upscaling_resize" not in payload:
        resize_scale = _to_float(payload.get("resize_scale"), 2.0, minimum=0.05, maximum=16.0)
    if "upscaling_resize_w" not in payload:
        resize_width = _to_int(payload.get("resize_width"), 512, minimum=1, maximum=8192)
    if "upscaling_resize_h" not in payload:
        resize_height = _to_int(payload.get("resize_height"), 512, minimum=1, maximum=8192)
    return ForgeNeoExtrasRequest(
        mode=mode,
        image=_decode_base64_image(image_value) if mode == "single" else None,
        batch_files=batch_files,
        show_results=show_results,
        resize_mode=str(resize_mode),
        resize_scale=resize_scale,
        max_side_length=_to_int(payload.get("upscale_max_side_length") or payload.get("max_side_length"), 0, minimum=0, maximum=8192),
        resize_width=resize_width,
        resize_height=resize_height,
        crop_to_fit=crop_to_fit,
        upscaler_1=upscaler_1,
        upscaler_2=upscaler_2,
        upscaler_2_visibility=upscaler_2_visibility,
        upscale_first=upscale_first,
        color_correction=_to_bool(payload.get("upscale_cc", payload.get("color_correction")), False),
        gfpgan_visibility=gfpgan_visibility,
        codeformer_visibility=codeformer_visibility,
        codeformer_weight=codeformer_weight,
    )


def extras_single_image_payload(values: dict[str, Any]) -> dict[str, Any]:
    result = run_extras(_extras_request_from_payload(values or {}, mode="single"))
    image = _encode_base64_image(result.images[0], result.infotext) if result.images else ""
    return {"image": image, "html_info": result.infotext or result.error}


def extras_batch_images_payload(values: dict[str, Any]) -> dict[str, Any]:
    result = run_extras(_extras_request_from_payload(values or {}, mode="batch"))
    return {"images": [_encode_base64_image(image, result.infotext) for image in result.images], "html_info": result.infotext or result.error}


def _runtime_script_callbacks_module() -> Any:
    return sys.modules.get("modules.script_callbacks") or sys.modules.get("forge_neo.runtime_backend.modules.script_callbacks")


def png_info_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = values or {}
    if "image" not in payload:
        raise HTTPException(status_code=422, detail=_sdapi_missing_field_detail("image"))
    image = _decode_base64_image(_sdapi_source_string_field(payload, "image", ""))
    info, items = png_info_items_source_api(image)
    parameters = parse_generation_parameters_source_api(info)
    script_callbacks = _runtime_script_callbacks_module()
    infotext_pasted_callback = getattr(script_callbacks, "infotext_pasted_callback", None) if script_callbacks is not None else None
    if callable(infotext_pasted_callback):
        infotext_pasted_callback(info, parameters)
    return {"info": info, "items": items, "parameters": parameters}


def backend_preview_payload(values: dict[str, Any]) -> dict[str, Any]:
    request = _request_from_generation_payload(dict(values or {}), mode="txt2img")
    return build_simpai_async_preview(request)


def native_processing_preview_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = dict(values or {})
    mode = "img2img" if payload.get("init_images") or payload.get("mode") == "img2img" else "txt2img"
    request = _request_from_generation_payload(payload, mode=mode)
    return native_processing_payload(request)


def native_processing_context_payload(values: dict[str, Any]) -> dict[str, Any]:
    payload = dict(values or {})
    mode = "img2img" if payload.get("init_images") or payload.get("mode") == "img2img" else "txt2img"
    request = _request_from_generation_payload(payload, mode=mode)
    return native_processing_context(request)


def _live_preview_refresh_period() -> int:
    try:
        settings = load_settings()
        value = settings.get("live_preview_refresh_period", 500) if isinstance(settings, dict) else 500
        return max(100, int(value or 500))
    except Exception:
        return 500


def _progress_current_image(snapshot: dict[str, Any], id_live_preview: int | None = None) -> tuple[str | None, int]:
    current_preview_id = int(snapshot.get("id_live_preview", 0) or 0)
    current_image = snapshot.get("current_image")
    encoded = None
    if id_live_preview is not None and current_preview_id == int(id_live_preview):
        current_image = None
    if isinstance(current_image, Image.Image):
        encoded = _encode_base64_image(current_image)
    elif isinstance(current_image, str) and current_image:
        encoded = current_image.split(",", 1)[1] if current_image.startswith("data:image/") and "," in current_image else current_image
    return encoded, current_preview_id


def progress_payload(*, skip_current_image: bool = False, id_live_preview: int | None = None) -> dict[str, Any]:
    snapshot = worker.snapshot()
    status = str(snapshot.get("status", "idle") or "idle")
    sampling_step = int(snapshot.get("sampling_step", 0) or 0)
    sampling_steps = int(snapshot.get("sampling_steps", 0) or 0)
    live_preview_refresh_period = _live_preview_refresh_period()
    state = {
        "skipped": bool(snapshot.get("skip_requested")),
        "interrupted": bool(snapshot.get("stop_requested")),
        "stopping_generation": bool(snapshot.get("stop_requested")),
        "job": "forge_neo",
        "job_count": 1 if status == "running" else 0,
        "job_no": 0,
        "job_timestamp": str(snapshot.get("job_timestamp") or ""),
        "sampling_step": sampling_step,
        "sampling_steps": sampling_steps,
        "status": status,
    }
    payload: dict[str, Any] = {
        "progress": float(snapshot.get("progress", 0.0) or 0.0),
        "eta_relative": float(snapshot.get("eta_relative", 0.0) or 0.0),
        "state": state,
        "textinfo": snapshot.get("message") or snapshot.get("status") or "",
        "textinfo_en": snapshot.get("message_en") or snapshot.get("message") or snapshot.get("status") or "",
        "textinfo_cn": snapshot.get("message_cn") or snapshot.get("message") or snapshot.get("status") or "",
        "current_task": "forge_neo",
        "live_preview_refresh_period": live_preview_refresh_period,
        "current_image": None,
    }
    if skip_current_image:
        return payload

    encoded, current_preview_id = _progress_current_image(snapshot, id_live_preview)
    payload["current_image"] = encoded
    if encoded:
        payload["live_preview"] = _base64_image_data_uri(encoded)
    payload["id_live_preview"] = current_preview_id
    return payload


def _runtime_state_dict(state: Any) -> dict[str, Any]:
    as_dict = getattr(state, "dict", None)
    if callable(as_dict):
        value = as_dict()
    else:
        try:
            value = vars(state)
        except TypeError:
            value = {}
    return _jsonable(value) if isinstance(value, dict) else {}


def _runtime_sdapi_progress_payload(*, skip_current_image: bool = False) -> dict[str, Any] | None:
    shared_module = _runtime_shared_module()
    state = getattr(shared_module, "state", None) if shared_module is not None else None
    if state is None:
        return None

    job_count = int(getattr(state, "job_count", 0) or 0)
    if job_count == 0:
        return {
            "progress": 0,
            "eta_relative": 0,
            "state": _runtime_state_dict(state),
            "current_image": None,
            "textinfo": getattr(state, "textinfo", None),
        }

    progress = 0.01
    job_no = int(getattr(state, "job_no", 0) or 0)
    sampling_steps = int(getattr(state, "sampling_steps", 0) or 0)
    sampling_step = int(getattr(state, "sampling_step", 0) or 0)
    if job_count > 0:
        progress += job_no / job_count
    if sampling_steps > 0:
        progress += 1 / job_count * sampling_step / sampling_steps

    time_start = float(getattr(state, "time_start", time.time()) or time.time())
    time_since_start = max(0.0, time.time() - time_start)
    eta = time_since_start / progress if progress else 0.0
    eta_relative = eta - time_since_start
    progress = min(progress, 1)

    set_current_image = getattr(state, "set_current_image", None)
    if callable(set_current_image):
        set_current_image()

    current_image = None
    if not skip_current_image:
        state_image = getattr(state, "current_image", None)
        if isinstance(state_image, Image.Image):
            current_image = _encode_base64_image(state_image)
        elif isinstance(state_image, str) and state_image:
            current_image = state_image.split(",", 1)[1] if state_image.startswith("data:image/") and "," in state_image else state_image

    return {
        "progress": progress,
        "eta_relative": eta_relative,
        "state": _runtime_state_dict(state),
        "current_image": current_image,
        "textinfo": getattr(state, "textinfo", None),
    }


def sdapi_progress_payload(*, skip_current_image: bool = False, id_live_preview: int | None = None) -> dict[str, Any]:
    runtime_payload = _runtime_sdapi_progress_payload(skip_current_image=skip_current_image)
    if runtime_payload is not None:
        return runtime_payload

    snapshot = worker.snapshot()
    status = str(snapshot.get("status", "idle") or "idle")
    is_running = status == "running"
    message = str(snapshot.get("message") or "")
    state = {
        "skipped": bool(snapshot.get("skip_requested")),
        "interrupted": bool(snapshot.get("stop_requested")),
        "stopping_generation": bool(snapshot.get("stop_requested")),
        "job": "forge_neo" if is_running else "",
        "job_count": 1 if is_running else 0,
        "job_timestamp": str(snapshot.get("job_timestamp") or ""),
        "job_no": int(snapshot.get("job_no", 0 if is_running else 1) or (0 if is_running else 1)),
        "sampling_step": int(snapshot.get("sampling_step", 0) or 0),
        "sampling_steps": int(snapshot.get("sampling_steps", 0) or 0),
    }
    payload: dict[str, Any] = {
        "progress": float(snapshot.get("progress", 0.0) or 0.0),
        "eta_relative": float(snapshot.get("eta_relative", 0.0) or 0.0),
        "state": state,
        "current_image": None,
        "textinfo": message or None,
    }
    if skip_current_image:
        return payload
    encoded, _current_preview_id = _progress_current_image(snapshot, id_live_preview)
    payload["current_image"] = encoded
    return payload


def install_api_routes(app: Any) -> Any:
    if getattr(app, "_forge_neo_api_installed", False):
        return app

    @app.get("/docs", include_in_schema=False)
    def forge_neo_swagger_docs():
        return get_swagger_ui_html(openapi_url="/openapi.json", title="Forge Neo API")

    @app.get("/internal/ping", include_in_schema=False)
    def forge_neo_internal_ping():
        return {}

    @app.get("/file={path:path}", include_in_schema=False)
    async def forge_neo_legacy_file_redirect(path: str):
        return RedirectResponse(url=f"/gradio_api/file={path}", status_code=307)

    @app.get("/internal/quicksettings-hint")
    def forge_neo_quicksettings_hint():
        return quicksettings_hint_payload()

    @app.get("/internal/profile-startup", include_in_schema=False)
    def forge_neo_startup_profile():
        return startup_profile_payload()

    @app.get("/internal/sysinfo")
    def forge_neo_internal_sysinfo():
        return _sysinfo_response(attachment=False)

    @app.get("/internal/sysinfo-download")
    def forge_neo_internal_sysinfo_download():
        return _sysinfo_response(attachment=True)

    @app.get("/forge-neo/api/backend-capabilities")
    def forge_neo_backend_capabilities():
        return backend_capabilities()

    @app.post("/forge-neo/api/backend-preview")
    def forge_neo_backend_preview(values: dict[str, Any]):
        return backend_preview_payload(values)

    @app.post("/forge-neo/api/native-processing-preview")
    def forge_neo_native_processing_preview(values: dict[str, Any]):
        return native_processing_preview_payload(values)

    @app.get("/forge-neo/api/native-processing-capabilities")
    def forge_neo_native_processing_capabilities():
        return native_processing_availability()

    @app.post("/forge-neo/api/native-processing-context")
    def forge_neo_native_processing_context(values: dict[str, Any]):
        return native_processing_context_payload(values)

    @app.post("/sdapi/v1/txt2img")
    def forge_neo_text2img(values: dict[str, Any]):
        return text2img_payload(values)

    @app.post("/sdapi/v1/img2img")
    def forge_neo_img2img(values: dict[str, Any]):
        return img2img_payload(values)

    @app.post("/sdapi/v1/extra-single-image")
    def forge_neo_extra_single_image(values: dict[str, Any]):
        return extras_single_image_payload(values)

    @app.post("/sdapi/v1/extra-batch-images")
    def forge_neo_extra_batch_images(values: dict[str, Any]):
        return extras_batch_images_payload(values)

    @app.post("/sdapi/v1/png-info")
    def forge_neo_png_info(values: dict[str, Any]):
        return png_info_payload(values)

    @app.get("/sdapi/v1/cmd-flags")
    def forge_neo_cmd_flags():
        return cmd_flags_payload()

    @app.get("/sdapi/v1/samplers")
    def forge_neo_samplers():
        return samplers_payload()

    @app.get("/sdapi/v1/schedulers")
    def forge_neo_schedulers():
        return schedulers_payload()

    @app.get("/sdapi/v1/upscalers")
    def forge_neo_upscalers():
        return upscalers_payload()

    @app.get("/sdapi/v1/latent-upscale-modes")
    def forge_neo_latent_upscale_modes():
        return latent_upscale_modes_payload()

    @app.get("/sdapi/v1/face-restorers")
    def forge_neo_face_restorers():
        return face_restorers_payload()

    @app.get("/sdapi/v1/sd-models")
    def forge_neo_sd_models(preset: str = "klein"):
        return sd_models_payload(preset)

    @app.get("/sdapi/v1/sd-modules")
    def forge_neo_sd_modules(preset: str = "klein"):
        return sd_modules_payload(preset)

    @app.get("/sdapi/v1/loras")
    def forge_neo_loras(preset: str = "klein"):
        return loras_payload(preset)

    @app.get("/sdapi/v1/embeddings")
    def forge_neo_embeddings(preset: str = "klein"):
        return embeddings_payload(preset)

    @app.get("/sdapi/v1/prompt-styles")
    def forge_neo_prompt_styles():
        return prompt_styles_payload()

    @app.get("/sdapi/v1/scripts")
    def forge_neo_scripts():
        return scripts_payload()

    @app.get("/sdapi/v1/script-info")
    def forge_neo_script_info():
        return script_info_payload()

    @app.get("/controlnet/module_list")
    def forge_neo_controlnet_module_list():
        return controlnet_module_list_payload()

    @app.get("/controlnet/model_list")
    def forge_neo_controlnet_model_list(preset: str = "klein"):
        return controlnet_model_list_payload(preset)

    @app.get("/controlnet/control_types")
    def forge_neo_controlnet_control_types(preset: str = "klein"):
        return controlnet_control_types_payload(preset)

    @app.post("/controlnet/detect")
    def forge_neo_controlnet_detect(values: dict[str, Any]):
        return controlnet_detect_payload(values)

    @app.get("/sd_extra_networks/thumb")
    def forge_neo_sd_extra_networks_thumb(filename: str = ""):
        return sd_extra_networks_thumb_response(filename)

    @app.get("/sd_extra_networks/cover-images")
    def forge_neo_sd_extra_networks_cover_images(page: str = "", item: str = "", index: int = 0):
        return sd_extra_networks_cover_images_response(page, item, index)

    @app.get("/sd_extra_networks/metadata")
    def forge_neo_sd_extra_networks_metadata(page: str = "", item: str = ""):
        return sd_extra_networks_metadata_payload(page, item)

    @app.post("/sd_extra_networks/metadata")
    def forge_neo_sd_extra_networks_metadata_save(values: dict[str, Any]):
        return sd_extra_networks_metadata_save_payload(values)

    @app.post("/sd_extra_networks/preview")
    def forge_neo_sd_extra_networks_preview_save(values: dict[str, Any]):
        return sd_extra_networks_preview_save_payload(values)

    @app.get("/sd_extra_networks/get-single-card")
    def forge_neo_sd_extra_networks_get_single_card(page: str = "", tabname: str = "", name: str = ""):
        return sd_extra_networks_single_card_payload(page, tabname, name)

    @app.get("/sdapi/v1/extensions")
    def forge_neo_extensions():
        return extensions_payload()

    @app.get("/sdapi/v1/memory")
    def forge_neo_memory():
        return memory_payload()

    @app.post("/sdapi/v1/refresh-checkpoints")
    def forge_neo_refresh_checkpoints(preset: str = "klein"):
        return refresh_checkpoints_payload(preset)

    @app.post("/sdapi/v1/refresh-vae")
    def forge_neo_refresh_vae(preset: str = "klein"):
        return refresh_vae_payload(preset)

    @app.post("/sdapi/v1/refresh-loras")
    def forge_neo_refresh_loras(preset: str = "klein"):
        return refresh_loras_payload(preset)

    @app.post("/sdapi/v1/refresh-embeddings")
    def forge_neo_refresh_embeddings(preset: str = "klein"):
        return refresh_embeddings_payload(preset)

    @app.post("/sdapi/v1/unload-checkpoint")
    def forge_neo_unload_checkpoint():
        return unload_checkpoint_payload()

    @app.get("/sdapi/v1/progress")
    def forge_neo_progress(skip_current_image: bool = False, id_live_preview: int | None = None):
        return sdapi_progress_payload(skip_current_image=skip_current_image, id_live_preview=id_live_preview)

    @app.post("/sdapi/v1/interrupt")
    def forge_neo_interrupt():
        return interrupt_payload()

    @app.post("/sdapi/v1/skip")
    def forge_neo_skip():
        return skip_payload()

    @app.get("/sdapi/v1/options")
    def forge_neo_options():
        return options_payload()

    @app.post("/sdapi/v1/options")
    def forge_neo_set_options(values: dict[str, Any]):
        return set_options_payload(values)

    if source_api_server_stop_enabled():
        @app.post("/sdapi/v1/server-restart")
        def forge_neo_server_restart():
            return source_server_restart_response()

        @app.post("/sdapi/v1/server-stop")
        def forge_neo_server_stop():
            return source_server_stop_response()

        @app.post("/sdapi/v1/server-kill")
        def forge_neo_server_kill():
            return source_server_kill_payload()

    @app.get("/forge-neo/api/progress")
    def forge_neo_namespaced_progress(skip_current_image: bool = False, id_live_preview: int | None = None):
        return progress_payload(skip_current_image=skip_current_image, id_live_preview=id_live_preview)

    @app.post("/forge-neo/api/interrupt")
    def forge_neo_namespaced_interrupt():
        stop_current({"__lang": "en"})
        return {}

    @app.post("/forge-neo/api/skip")
    def forge_neo_namespaced_skip():
        skip_current({"__lang": "en"})
        return {}

    @app.get("/forge-neo/api/options")
    def forge_neo_namespaced_options():
        return options_payload()

    @app.post("/forge-neo/api/options")
    def forge_neo_namespaced_set_options(values: dict[str, Any]):
        set_options_payload(values)
        return {}

    @app.get("/forge-neo/api/quicksettings-hint")
    def forge_neo_namespaced_quicksettings_hint():
        return quicksettings_hint_payload()

    @app.get("/forge-neo/api/sysinfo")
    def forge_neo_namespaced_sysinfo():
        return sysinfo_snapshot()

    @app.post("/forge-neo/api/reload-ui")
    def forge_neo_reload_ui():
        ensure_server_state().request_restart()
        return {"status": "restart-requested"}

    @app.post("/forge-neo/api/server-restart")
    def forge_neo_server_restart_namespaced():
        ensure_server_state().request_restart()
        return {"status": "restart-requested"}

    @app.post("/forge-neo/api/server-stop")
    def forge_neo_server_stop_namespaced():
        ensure_server_state().request_stop()
        return {"status": "stop-requested"}

    @app.post("/forge-neo/api/server-kill")
    def forge_neo_server_kill_namespaced():
        ensure_server_state().request_kill()
        return {"status": "kill-requested"}

    @app.get("/forge-neo/api/profile-startup")
    def forge_neo_startup_profile_namespaced():
        return startup_profile_payload()

    setattr(app, "_forge_neo_api_installed", True)
    return app
