from __future__ import annotations

import csv
import datetime
import hashlib
import json
import os
import random
import re
import time
import zipfile
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Callable

import piexif
import piexif.helper
from PIL import Image, ImageDraw, PngImagePlugin

import args_manager
from forge_neo.adetailer_compat import adetailer_save_request_state
from forge_neo.bootstrap import ensure_config
from forge_neo.png_info import parse_generation_parameters
from forge_neo.settings import load_settings


ProgressCallback = Callable[[dict[str, object]], None]
ControlCallback = Callable[[], str | None]
LOCAL_EXTRAS_UPSCALERS = {"", "none", "nearest", "bilinear", "bicubic", "lanczos"}
SAVE_LOG_FIELDS = [
    "prompt",
    "seed",
    "width",
    "height",
    "sampler",
    "cfgs",
    "steps",
    "filename",
    "negative_prompt",
    "sd_model_name",
    "sd_model_hash",
]
FILENAME_PATTERN_RE = re.compile(r"(.*?)(?:\[([^\[\]]+)\]|$)")
FILENAME_PATTERN_ARG_RE = re.compile(r"(.*)<([^>]*)>$")
PROMPT_WORD_RE = re.compile(r"[\W_]+", re.UNICODE)
INVALID_FILENAME_CHARS = '#<>:"/\\|?*\n\r\t'


@dataclass
class ForgeNeoRequest:
    mode: str = "txt2img"
    prompt: str = ""
    negative_prompt: str = ""
    preset: str = "klein"
    checkpoint: str = "None"
    vae: str = "None"
    text_encoders: list[str] = field(default_factory=list)
    low_bit_dtype: str = "Automatic"
    override_settings: dict[str, object] = field(default_factory=dict)
    override_settings_restore_afterwards: bool = True
    comments: dict[str, object] = field(default_factory=dict)
    send_images: bool = True
    save_images: bool = False
    do_not_save_samples: bool = False
    do_not_save_grid: bool = False
    include_init_images: bool = False
    force_task_id: str = ""
    infotext: str = ""
    api_payload_fields: set[str] = field(default_factory=set)
    source_api_request: bool = False
    source_api_raw_fields: dict[str, object] = field(default_factory=dict)
    styles: list[str] = field(default_factory=list)
    sampler: str = "Euler"
    scheduler: str = "Beta"
    steps: int = 8
    width: int = 1152
    height: int = 896
    cfg_scale: float = 1.0
    distilled_cfg_scale: float = 3.0
    eta: float | None = None
    s_min_uncond: float | None = None
    s_churn: float | None = None
    s_tmax: float | None = None
    s_tmin: float | None = None
    s_noise: float | None = None
    image_cfg_scale: float | None = None
    rescale_cfg: float = 0.0
    denoising_strength: float = 0.0
    selected_scale_tab: int = 0
    resize_mode: str = "Crop and resize"
    resize_scale: float = 1.0
    mask_blur: int = 4
    mask_round: bool = True
    mask_alpha: float = 0.0
    inpainting_fill: str = "original"
    inpainting_mask_mode: str = "Inpaint masked"
    inpaint_area: str = "Only masked"
    inpaint_padding: int = 32
    initial_noise_multiplier: float | None = None
    soft_inpainting_enabled: bool = False
    soft_inpainting_schedule_bias: float = 1.0
    soft_inpainting_preservation_strength: float = 0.5
    soft_inpainting_transition_contrast_boost: float = 4.0
    soft_inpainting_mask_influence: float = 0.0
    soft_inpainting_difference_threshold: float = 0.5
    soft_inpainting_difference_contrast: float = 2.0
    seed: int = -1
    subseed: int | None = None
    subseed_strength: float | None = None
    seed_resize_from_w: int = -1
    seed_resize_from_h: int = -1
    seed_enable_extras: bool = True
    restore_faces: bool | None = None
    tiling: bool | None = None
    disable_extra_networks: bool = False
    batch_count: int = 1
    batch_size: int = 1
    hires_fix: bool = False
    hires_upscaler: str = "Latent"
    hires_steps: int = 0
    hires_denoising_strength: float = 0.6
    hires_scale: float = 2.0
    hires_resize_x: int = 0
    hires_resize_y: int = 0
    firstphase_width: int = 0
    firstphase_height: int = 0
    firstpass_image: str | None = None
    hires_checkpoint: str = "Use same checkpoint"
    hires_additional_modules: list[str] = field(default_factory=lambda: ["Use same choices"])
    hires_sampler: str = "Use same sampler"
    hires_scheduler: str = "Use same scheduler"
    hires_prompt: str = ""
    hires_negative_prompt: str = ""
    hires_cfg: float = 6.0
    hires_distilled_cfg: float = 3.0
    refiner: bool = False
    refiner_checkpoint: str = "None"
    refiner_switch_at: float = 0.875
    controlnet_units: list[dict[str, object]] = field(default_factory=list)
    controlnet_enabled: bool = False
    controlnet_module: str = "None"
    controlnet_model: str = "None"
    controlnet_weight: float = 1.0
    controlnet_resize_mode: str = "Crop and Resize"
    controlnet_guidance_start: float = 0.0
    controlnet_guidance_end: float = 1.0
    controlnet_pixel_perfect: bool = False
    controlnet_control_mode: str = "Balanced"
    controlnet_hr_option: str = "Both"
    controlnet_processor_res: int = 512
    controlnet_threshold_a: float = 0.5
    controlnet_threshold_b: float = 0.5
    multidiffusion_enabled: bool = False
    multidiffusion_method: str = "Mixture of Diffusers"
    multidiffusion_tile_width: int = 768
    multidiffusion_tile_height: int = 768
    multidiffusion_tile_overlap: int = 64
    multidiffusion_tile_batch_size: int = 1
    never_oom_unet: bool = False
    never_oom_vae: bool = False
    torch_compile_preset: str = "Automatic"
    image_stitch_enabled: bool = False
    image_stitch_references: list[object] = field(default_factory=list)
    image_stitch_reference_count: int = 0
    image_stitch_max_dim: int = 1024
    spectrum_enabled: bool = False
    spectrum_prediction_weighting: float = 0.25
    spectrum_polynomial_degree: int = 6
    spectrum_regularization: float = 0.5
    spectrum_cache_window: int = 2
    spectrum_window_growth: float = 0.0
    spectrum_warmup_steps: int = 6
    spectrum_stop_caching_step: float = 0.9
    modulated_guidance_enabled: bool = False
    modulated_guidance_clip: str = "None"
    modulated_guidance_positive: str = ""
    modulated_guidance_negative: str = ""
    modulated_guidance_weight: float = 3.0
    modulated_guidance_start_layer: int = 0
    modulated_guidance_end_layer: int = -1
    adetailer_enabled: bool = False
    adetailer_skip_img2img: bool = False
    adetailer_args: list[dict[str, object]] = field(default_factory=list)
    regional_prompter_enabled: bool = False
    regional_prompter_args: object = field(default_factory=dict)
    forge_couple_enabled: bool = False
    forge_couple_args: object = field(default_factory=dict)
    dynamic_prompts_enabled: bool = False
    dynamic_prompts_args: object = field(default_factory=dict)
    tipo_enabled: bool = False
    tipo_args: object = field(default_factory=dict)
    seed_variance_enabled: bool = False
    seed_variance_delta: int = 1
    seed_variance_strength: float = 0.25
    mahiro: bool = False
    script: str = "None"
    script_args: dict[str, object] = field(default_factory=dict)
    loras: list[str] = field(default_factory=list)
    lora_weights: dict[str, float] = field(default_factory=dict)
    init_image: object | None = None
    mask_image: object | None = None
    source_api_init_images: list[object] = field(default_factory=list)
    source_api_mask: object | None = None
    latent_mask: str | None = None
    batch_files: list[object] = field(default_factory=list)
    batch_source_type: str = "upload"
    batch_input_dir: str = ""
    batch_output_dir: str = ""
    batch_inpaint_mask_dir: str = ""
    batch_use_png_info: bool = False
    batch_png_info_props: list[str] = field(default_factory=list)
    batch_png_info_dir: str = ""


@dataclass
class ForgeNeoResult:
    images: list[object] = field(default_factory=list)
    infotext: str = ""
    seed: int = -1
    status: str = "finished"
    error: str = ""
    output_paths: list[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0
    debug_info: dict[str, object] = field(default_factory=dict)


@dataclass
class ForgeNeoExtrasRequest:
    mode: str = "single"
    image: object | None = None
    batch_files: list[object] = field(default_factory=list)
    input_dir: str = ""
    output_dir: str = ""
    video_path: str = ""
    show_results: bool = True
    resize_mode: str = "Scale by"
    resize_scale: float = 4.0
    max_side_length: int = 0
    resize_width: int = 1024
    resize_height: int = 1024
    crop_to_fit: bool = True
    upscaler_1: str = "None"
    upscaler_2: str = "None"
    upscaler_2_visibility: float = 0.0
    upscale_first: bool = False
    color_correction: bool = False
    gfpgan_visibility: float = 0.0
    codeformer_visibility: float = 0.0
    codeformer_weight: float = 0.5


@dataclass
class ForgeNeoBatchEditRequest:
    input_dir: str = ""
    output_dir: str = ""
    prompt: str = ""
    negative_prompt: str = ""
    max_edge_length: int = 1024
    steps: int = 30
    cfg_scale: float = 7.5
    seed: int = -1
    formats: list[str] = field(default_factory=lambda: ["png", "jpg", "jpeg", "webp", "bmp"])
    sort_method: str = "文件名升序"


@dataclass
class ForgeNeoBatchEditResult:
    status: str = "plan"
    progress: str = ""
    log: str = ""
    files: list[dict[str, object]] = field(default_factory=list)
    output_dir: str = ""
    error: str = ""


@dataclass
class ForgeNeoMergerRequest:
    primary_model_name: str = "None"
    secondary_model_name: str = "None"
    tertiary_model_name: str = "None"
    interp_method: str = "Weighted sum"
    interp_amount: float = 0.3
    save_as_half: bool = False
    custom_name: str = ""
    checkpoint_format: str = "safetensors"
    config_source: str = "A, B or C"
    bake_in_vae: str = "None"
    discard_weights: str = ""
    save_metadata: bool = True
    add_merge_recipe: bool = True
    copy_metadata_fields: bool = True
    metadata_json: str = "{}"
    output_dir: str = ""


@dataclass
class ForgeNeoCurrentModelSaveRequest:
    filename: str = "my_model.safetensors"
    kind: str = "checkpoint"
    checkpoint: str = "None"
    vae: str = "None"
    text_encoders: list[str] = field(default_factory=list)
    low_bit_dtype: str = "Automatic"
    output_dir: str = ""


@dataclass
class ForgeNeoMergerResult:
    recipe: dict[str, object] = field(default_factory=dict)
    recipe_json: str = ""
    recipe_path: str = ""
    status: str = "recipe"
    error: str = ""


@dataclass
class ForgeNeoCurrentModelSaveResult:
    plan: dict[str, object] = field(default_factory=dict)
    plan_json: str = ""
    plan_path: str = ""
    status: str = "plan"
    error: str = ""


def _emit(progress_callback: ProgressCallback | None, event: str, progress: float, message: str) -> None:
    if progress_callback is not None:
        progress_callback({"event": event, "progress": progress, "message": message})


def _control_status(control_callback: ControlCallback | None) -> str | None:
    if control_callback is None:
        return None
    status = control_callback()
    if status in {"stopped", "skipped"}:
        return status
    return None


def _active_settings(settings: dict[str, object] | None = None) -> dict[str, object]:
    return settings if settings is not None else load_settings()


def _image_extension(settings: dict[str, object]) -> str:
    extension = str(settings.get("samples_format", "png") or "png").strip().lower().lstrip(".")
    if extension == "jpeg":
        return "jpg"
    if extension not in {"png", "jpg", "webp"}:
        return "png"
    return extension


def _sanitize_filename_part(text: object, *, replace_spaces: bool = True, max_length: int = 160) -> str:
    value = str(text if text is not None else "")
    if replace_spaces:
        value = value.replace(" ", "_")
    value = value.translate({ord(char): "_" for char in INVALID_FILENAME_CHARS})
    value = value.strip(" .")
    if max_length > 0:
        value = value[:max_length].rstrip(" .")
    return value


def _prompt_words(prompt: object, limit: int = 8) -> str:
    words = [word for word in PROMPT_WORD_RE.split(str(prompt or "")) if word]
    if not words:
        words = ["empty"]
    return _sanitize_filename_part(" ".join(words[:limit]), replace_spaces=False)


def _datetime_token(*args: str) -> str:
    fmt = args[0] if args and args[0] else "%Y%m%d%H%M%S"
    try:
        return _sanitize_filename_part(datetime.datetime.now().strftime(fmt), replace_spaces=False)
    except Exception:
        return datetime.datetime.now().strftime("%Y%m%d%H%M%S")


def _filename_pattern_value(pattern: str, image: Image.Image, infotext: str, index: int, timestamp: str) -> str:
    parsed = parse_generation_parameters(infotext)
    prompt = str(parsed.get("prompt", "") or "")
    replacements = {
        "datetime": lambda *args: _datetime_token(*args),
        "date": lambda *args: _datetime_token("%Y-%m-%d"),
        "seed": lambda *args: parsed.get("seed", ""),
        "steps": lambda *args: parsed.get("steps", ""),
        "cfg": lambda *args: parsed.get("cfg_scale", ""),
        "sampler": lambda *args: _sanitize_filename_part(parsed.get("sampler", ""), replace_spaces=False),
        "scheduler": lambda *args: _sanitize_filename_part(parsed.get("scheduler", ""), replace_spaces=False),
        "width": lambda *args: parsed.get("width", image.width),
        "height": lambda *args: parsed.get("height", image.height),
        "model_name": lambda *args: _sanitize_filename_part(parsed.get("model", ""), replace_spaces=False),
        "model_hash": lambda *args: _sanitize_filename_part(parsed.get("model_hash", ""), replace_spaces=False),
        "prompt": lambda *args: _sanitize_filename_part(prompt),
        "prompt_spaces": lambda *args: _sanitize_filename_part(prompt, replace_spaces=False),
        "prompt_words": lambda *args: _prompt_words(prompt),
        "negative_prompt": lambda *args: _sanitize_filename_part(parsed.get("negative_prompt", "")),
        "index": lambda *args: index,
        "timestamp": lambda *args: timestamp,
        "none": lambda *args: "",
    }
    result = ""
    for match in FILENAME_PATTERN_RE.finditer(pattern):
        literal, token = match.groups()
        if token is None:
            result += literal
            continue
        args: list[str] = []
        while True:
            token_match = FILENAME_PATTERN_ARG_RE.match(token)
            if token_match is None:
                break
            token, arg = token_match.groups()
            args.insert(0, arg)
        replacement = replacements.get(token.lower())
        if replacement is None:
            result += f"{literal}[{token}]"
            continue
        result += f"{literal}{replacement(*args)}"
    return _sanitize_filename_part(result, replace_spaces=False, max_length=180)


def _output_stem(settings: dict[str, object], image: Image.Image, infotext: str, index: int, timestamp: str) -> str:
    pattern = str(settings.get("samples_filename_pattern", "") or "").strip()
    if pattern:
        stem = _filename_pattern_value(pattern, image, infotext, index, timestamp)
        if stem:
            return stem
    return f"{timestamp}-{index}"


def _zip_stem(settings: dict[str, object], image: Image.Image, infotext: str, timestamp: str) -> str:
    pattern = str(settings.get("grid_zip_filename_pattern", "") or "").strip()
    if pattern:
        stem = _filename_pattern_value(pattern, image, infotext, 0, timestamp)
        if stem:
            return stem
    return timestamp


def _unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 1
    while True:
        candidate = parent / f"{stem}-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def _image_save_kwargs(extension: str) -> dict[str, object]:
    if extension == "jpg":
        return {"format": "JPEG", "quality": 95}
    if extension == "webp":
        return {"format": "WEBP", "quality": 95}
    return {"format": "PNG"}


def _image_for_extension(image: Image.Image, extension: str) -> Image.Image:
    if extension in {"jpg", "webp"} and image.mode in {"RGBA", "LA", "P"}:
        return image.convert("RGB")
    return image


def _infotext_exif_bytes(infotext: str) -> bytes:
    return piexif.dump(
        {
            "Exif": {
                piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(str(infotext or ""), encoding="unicode")
            }
        }
    )


def outputs_dir(settings: dict[str, object] | None = None) -> Path:
    active = _active_settings(settings)
    output_dir = str(active.get("output_dir", "") or "").strip()
    if output_dir:
        path = Path(output_dir).expanduser()
        path.mkdir(parents=True, exist_ok=True)
        return path
    config = ensure_config()
    base = getattr(config, "path_userhome", "") or "."
    path = Path(base) / "ForgeNeo"
    path.mkdir(parents=True, exist_ok=True)
    return path


def extras_outputs_dir(request: ForgeNeoExtrasRequest) -> Path:
    if str(request.output_dir or "").strip():
        path = Path(str(request.output_dir)).expanduser()
    else:
        path = outputs_dir() / "extras"
    path.mkdir(parents=True, exist_ok=True)
    return path


def saved_outputs_dir(settings: dict[str, object] | None = None) -> Path:
    path = outputs_dir(settings) / "saved"
    path.mkdir(parents=True, exist_ok=True)
    return path


def saved_log_path(settings: dict[str, object] | None = None) -> Path:
    return saved_outputs_dir(settings) / "log.csv"


def merger_outputs_dir(request: ForgeNeoMergerRequest | None = None) -> Path:
    output_dir = str(getattr(request, "output_dir", "") or "").strip() if request is not None else ""
    if output_dir:
        path = Path(output_dir).expanduser()
    else:
        path = outputs_dir() / "merger"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _checkpoint_save_target_dir(current_checkpoint: str = "") -> Path:
    current_path = _model_path_for_name(str(current_checkpoint or ""), ("diffusion_models", "checkpoints"))
    if current_path:
        path = Path(current_path).expanduser().parent
        path.mkdir(parents=True, exist_ok=True)
        return path
    config = ensure_config()
    model_cata_map = getattr(config, "model_cata_map", {}) or {}
    roots: list[object] = []
    for catalog in ("checkpoints", "diffusion_models"):
        roots.extend(list(model_cata_map.get(catalog, []) or []))
    for root in roots:
        if root:
            path = Path(str(root)).expanduser()
            path.mkdir(parents=True, exist_ok=True)
            return path
    path = outputs_dir() / "models" / "Stable-diffusion"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _script_args_summary(script: str, args: dict[str, object]) -> str:
    name = str(script or "None").strip()
    if not args or name == "None":
        return ""
    if name == "Prompt Matrix":
        return (
            f", Prompt Matrix put at start: {bool(args.get('put_at_start'))}, "
            f"different seeds: {bool(args.get('different_seeds'))}, "
            f"prompt type: {args.get('prompt_type', 'positive')}, "
            f"joining: {args.get('variations_delimiter', 'comma')}, "
            f"grid margins: {args.get('margin_size', 0)}"
        )
    if name == "Prompts from File or Textbox":
        text = str(args.get("prompt_text", "") or "")
        line_count = len([line for line in text.splitlines() if line.strip()])
        return (
            f", Prompt lines: {line_count}, iterate seed: {bool(args.get('iterate_seed'))}, "
            f"same seed: {bool(args.get('same_seed'))}, insert at: {args.get('prompt_position', 'start')}"
        )
    if name == "X/Y/Z plot":
        x_values = _script_axis_values_text(args, "x")
        y_values = _script_axis_values_text(args, "y")
        z_values = _script_axis_values_text(args, "z")
        return (
            f", X type: {args.get('x_type', 'Seed')}, X values: {x_values}, "
            f"Y type: {args.get('y_type', 'Nothing')}, Y values: {y_values}, "
            f"Z type: {args.get('z_type', 'Nothing')}, Z values: {z_values}, "
            f"Row Count: {args.get('row_count', 0)}, Grid Margins: {args.get('margin_size', 0)}, "
            f"Draw legend: {bool(args.get('draw_legend', True))}, "
            f"Keep -1 for seeds: {bool(args.get('keep_minus_one'))}, "
            f"Vary seeds for X: {bool(args.get('vary_seed_x'))}, "
            f"Vary seeds for Y: {bool(args.get('vary_seed_y'))}, "
            f"Vary seeds for Z: {bool(args.get('vary_seed_z'))}, "
            f"Include Sub Images: {bool(args.get('include_sub_images'))}, "
            f"Include Sub Grids: {bool(args.get('include_sub_grids'))}, "
            f"Use text inputs instead of dropdowns: {bool(args.get('csv_mode'))}"
        )
    if name == "Loopback":
        return (
            f", Loopback loops: {args.get('loops', 1)}, "
            f"Final Denoising Strength: {args.get('final_denoising_strength', 0.0)}, "
            f"Denoising Strength Curve: {args.get('denoising_curve', 'Linear')}"
        )
    if name == "SD Upscale":
        return (
            f", SD Upscale upscaler: {args.get('upscaler', 'None')}, "
            f"Scale Factor: {args.get('scale_factor', 1.0)}, "
            f"Tile Overlap: {args.get('overlap', 0)}, "
            f"Save to Extras: {bool(args.get('save_to_extras'))}"
        )
    return f", Script parameters: {json.dumps(args, ensure_ascii=False, sort_keys=True)}"


def _script_axis_values_text(args: dict[str, object], axis: str) -> str:
    text = str(args.get(f"{axis}_values", "") or "").strip()
    if text:
        return text
    dropdown = args.get(f"{axis}_values_dropdown")
    if isinstance(dropdown, (list, tuple)):
        return ", ".join(str(item) for item in dropdown if str(item or "").strip())
    return ""


def build_infotext(request: ForgeNeoRequest, seed: int) -> str:
    text_encoder = ", ".join(request.text_encoders) if request.text_encoders else "None"
    loras = ", ".join(request.loras) if request.loras else "None"
    styles = ", ".join(request.styles) if request.styles else "None"
    script = str(request.script or "None").strip()
    script_params = f", Script: {script}{_script_args_summary(script, request.script_args)}" if script and script != "None" else ""
    negative_prompt = str(request.negative_prompt or "").strip()
    negative_line = f"Negative prompt: {negative_prompt}\n" if negative_prompt else ""
    mode_params = ""
    hires_params = ""
    if request.hires_fix:
        hires_modules = ", ".join(request.hires_additional_modules or []) or "Use same choices"
        hires_params = (
            f", Hires upscaler: {request.hires_upscaler}, Hires steps: {request.hires_steps}, "
            f"Hires denoising strength: {request.hires_denoising_strength}, Hires upscale: {request.hires_scale}, "
            f"Hires resize: {request.hires_resize_x}x{request.hires_resize_y}, "
            f"Hires checkpoint: {request.hires_checkpoint}, Hires VAE/TE: {hires_modules}, "
            f"Hires sampler: {request.hires_sampler}, Hires schedule type: {request.hires_scheduler}, "
            f"Hires CFG Scale: {request.hires_cfg}, Hires Distilled CFG Scale: {request.hires_distilled_cfg}"
        )
        if request.hires_prompt:
            hires_params += f", Hires prompt: {request.hires_prompt}"
        if request.hires_negative_prompt:
            hires_params += f", Hires negative prompt: {request.hires_negative_prompt}"
    refiner_params = ""
    if request.refiner and request.refiner_checkpoint not in (None, "", "None"):
        refiner_params = f", Refiner: {request.refiner_checkpoint}, Refiner switch at: {request.refiner_switch_at}"
    integrated_params = ""
    controlnet_units = list(request.controlnet_units or [])
    if not controlnet_units and request.controlnet_enabled:
        controlnet_units = [
            {
                "enabled": request.controlnet_enabled,
                "module": request.controlnet_module,
                "model": request.controlnet_model,
                "weight": request.controlnet_weight,
                "resize_mode": request.controlnet_resize_mode,
                "guidance_start": request.controlnet_guidance_start,
                "guidance_end": request.controlnet_guidance_end,
                "pixel_perfect": request.controlnet_pixel_perfect,
                "control_mode": request.controlnet_control_mode,
                "hr_option": request.controlnet_hr_option,
                "processor_res": request.controlnet_processor_res,
                "threshold_a": request.controlnet_threshold_a,
                "threshold_b": request.controlnet_threshold_b,
            }
        ]
    for index, unit in enumerate(controlnet_units):
        if not unit.get("enabled"):
            continue
        integrated_params += (
            f", ControlNet {index}: module={unit.get('module', 'None')}, model={unit.get('model', 'None')}, "
            f"weight={unit.get('weight', 1.0)}, resize={unit.get('resize_mode', 'Crop and Resize')}, "
            f"processor res={unit.get('processor_res', 512)}, thresholds={unit.get('threshold_a', 0.5)}/{unit.get('threshold_b', 0.5)}, "
            f"guidance={unit.get('guidance_start', 0.0)}-{unit.get('guidance_end', 1.0)}, "
            f"pixel perfect={unit.get('pixel_perfect', False)}, control mode={unit.get('control_mode', 'Balanced')}, "
            f"hr option={unit.get('hr_option', 'Both')}"
        )
    if request.multidiffusion_enabled:
        integrated_params += (
            f", MultiDiffusion: method={request.multidiffusion_method}, "
            f"tile={request.multidiffusion_tile_width}x{request.multidiffusion_tile_height}, "
            f"overlap={request.multidiffusion_tile_overlap}, batch={request.multidiffusion_tile_batch_size}"
        )
    if request.never_oom_unet or request.never_oom_vae:
        integrated_params += f", Never OOM: UNet={request.never_oom_unet}, VAE={request.never_oom_vae}"
    if request.torch_compile_preset != "Automatic":
        integrated_params += f", Torch Compile: {request.torch_compile_preset}"
    if request.image_stitch_enabled:
        integrated_params += (
            f", ImageStitch: references={request.image_stitch_reference_count}, max_dim={request.image_stitch_max_dim}"
        )
    if request.spectrum_enabled:
        integrated_params += (
            f", Spectrum: spec_w={request.spectrum_prediction_weighting}, "
            f"spec_m={request.spectrum_polynomial_degree}, spec_lam={request.spectrum_regularization}, "
            f"spec_window_size={request.spectrum_cache_window}, spec_flex_window={request.spectrum_window_growth}, "
            f"spec_warmup_steps={request.spectrum_warmup_steps}, "
            f"spec_stop_caching_step={request.spectrum_stop_caching_step}"
        )
    if request.modulated_guidance_enabled:
        mg_pos = str(request.modulated_guidance_positive or "").strip() or "None"
        mg_neg = str(request.modulated_guidance_negative or "").strip() or "None"
        integrated_params += (
            f", modulation_guidance=True, mg_clip={request.modulated_guidance_clip}, "
            f"mg_pos={mg_pos}, mg_neg={mg_neg}, mg_w={request.modulated_guidance_weight}, "
            f"mg_start={request.modulated_guidance_start_layer}, mg_end={request.modulated_guidance_end_layer}"
        )
    if request.adetailer_enabled:
        adetailer_items = [item for item in list(request.adetailer_args or []) if isinstance(item, dict)]
        adetailer_models = [str(item.get("ad_model") or "None") for item in adetailer_items]
        adetailer_model_text = ", ".join(adetailer_models) if adetailer_models else "None"
        integrated_params += (
            f", ADetailer: True, ADetailer models: {adetailer_model_text}, "
            f"ADetailer skip img2img: {bool(request.adetailer_skip_img2img)}"
        )
    if request.regional_prompter_enabled:
        regional_args = request.regional_prompter_args if isinstance(request.regional_prompter_args, dict) else {}
        regional_mode = str(regional_args.get("mode") or regional_args.get("rp_selected_tab") or "Matrix")
        regional_ratios = str(regional_args.get("ratios") or regional_args.get("aratios") or "1,1")
        integrated_params += f", Regional Prompter: True, mode={regional_mode}, ratios={regional_ratios}"
    if request.forge_couple_enabled:
        couple_args = request.forge_couple_args if isinstance(request.forge_couple_args, dict) else {}
        couple_mode = str(couple_args.get("mode") or "Basic")
        couple_mapping = couple_args.get("mapping")
        couple_regions = len(couple_mapping) if isinstance(couple_mapping, (list, tuple)) else 0
        integrated_params += f", Forge Couple: True, mode={couple_mode}, regions={couple_regions}"
        if bool(couple_args.get("tile_enabled")):
            integrated_params += (
                f", Forge Couple Tile: {couple_args.get('tile_columns', -1)}x{couple_args.get('tile_rows', -1)}, "
                f"threshold={couple_args.get('tile_threshold', 0.1)}"
            )
    if request.seed_variance_enabled:
        integrated_params += (
            f", SeedVarianceEnhancer: delta={request.seed_variance_delta}, strength={request.seed_variance_strength}"
        )
    if request.mahiro:
        integrated_params += ", MaHiRo: True"
    if request.mode != "txt2img":
        resize_tab = "Resize by" if int(request.selected_scale_tab or 0) == 1 else "Resize to"
        mode_params = (
            f", Resize mode: {request.resize_mode}, Resize tab: {resize_tab}, "
            f"Resize scale: {request.resize_scale}"
        )
        if request.mode in {"inpaint", "inpaint_sketch", "inpaint_upload"}:
            mode_params += (
                f", Mask blur: {request.mask_blur}, Mask mode: {request.inpainting_mask_mode}, "
                f"Masked content: {request.inpainting_fill}, Inpaint area: {request.inpaint_area}, "
                f"Inpaint padding: {request.inpaint_padding}"
            )
            if request.soft_inpainting_enabled:
                mode_params += (
                    f", Soft inpainting enabled: True, "
                    f"Soft inpainting schedule bias: {request.soft_inpainting_schedule_bias}, "
                    f"Soft inpainting preservation strength: {request.soft_inpainting_preservation_strength}, "
                    f"Soft inpainting transition contrast boost: {request.soft_inpainting_transition_contrast_boost}, "
                    f"Soft inpainting mask influence: {request.soft_inpainting_mask_influence}, "
                    f"Soft inpainting difference threshold: {request.soft_inpainting_difference_threshold}, "
                    f"Soft inpainting difference contrast: {request.soft_inpainting_difference_contrast}"
                )
            if request.mode == "inpaint_sketch":
                mode_params += f", Mask transparency: {request.mask_alpha}"
        if request.mode == "batch":
            batch_items = len(request.batch_files or [])
            mode_params += (
                f", Batch source: {request.batch_source_type}, Batch files: {batch_items}, "
                f"Batch PNG info: {request.batch_use_png_info}"
            )
    cfg_params = f"CFG scale: {request.cfg_scale}"
    if request.distilled_cfg_scale not in (None, 0, 3.0):
        cfg_params += f", Distilled CFG Scale: {request.distilled_cfg_scale}"
    if request.image_cfg_scale not in (None, 1.5):
        cfg_params += f", Image CFG scale: {request.image_cfg_scale}"
    if request.rescale_cfg:
        cfg_params += f", Rescale CFG: {request.rescale_cfg}"
    return (
        f"{request.prompt}\n"
        f"{negative_line}"
        f"Steps: {request.steps}, Sampler: {request.sampler}, Schedule type: {request.scheduler}, "
        f"{cfg_params}, Seed: {seed}, Size: {request.width}x{request.height}, "
        f"Model: {request.checkpoint}, VAE: {request.vae}, Text Encoder: {text_encoder}, "
        f"Low bits: {request.low_bit_dtype}, Mode: {request.mode}, Denoising strength: {request.denoising_strength}, "
        f"Styles: {styles}, LoRA: {loras}{script_params}{hires_params}{refiner_params}{integrated_params}{mode_params}, Version: neo"
    )


def _placeholder_image(request: ForgeNeoRequest, seed: int, label: str = "") -> Image.Image:
    width = max(256, min(int(request.width or 1024), 1536))
    height = max(256, min(int(request.height or 1024), 1536))
    image = Image.new("RGB", (width, height), (11, 16, 25))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        shade = int(20 + 35 * (y / max(1, height)))
        draw.line((0, y, width, y), fill=(shade, 24, 32))
    accent = (255, 111, 24)
    draw.rounded_rectangle((width * 0.13, height * 0.32, width * 0.87, height * 0.68), radius=24, outline=accent, width=6)
    draw.text((width * 0.18, height * 0.42), "Forge Neo", fill=(255, 235, 220))
    draw.text((width * 0.18, height * 0.52), f"{request.mode} / seed {seed}", fill=(190, 202, 220))
    if label:
        draw.text((width * 0.18, height * 0.61), str(label)[:96], fill=(255, 210, 155))
    return image


def _save_images(images: list[Image.Image], infotext: str, seed: int) -> list[str]:
    if getattr(args_manager.args, "disable_image_log", False):
        return []
    settings = load_settings()
    extension = _image_extension(settings)
    paths: list[str] = []
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    for index, image in enumerate(images):
        stem = _output_stem(settings, image, infotext, index, timestamp)
        path = outputs_dir(settings) / f"{stem}.{extension}"
        image_path = _save_image_with_settings(image, path, infotext, settings)
        paths.append(image_path)
    return paths


def _ensure_result_output_paths(result: ForgeNeoResult, fallback_seed: int) -> ForgeNeoResult:
    if result.status != "finished" or not result.images:
        return result
    if result.output_paths:
        return result
    try:
        result_seed = int(result.seed)
    except (TypeError, ValueError):
        result_seed = int(fallback_seed)
    save_seed = result_seed if result_seed >= 0 else int(fallback_seed)
    result.output_paths = _save_images(list(result.images), result.infotext, save_seed)
    return result


def _image_from_value(value: object) -> Image.Image | None:
    if value is None:
        return None
    if isinstance(value, (tuple, list)) and value:
        return _image_from_value(value[0])
    if isinstance(value, Image.Image):
        return value.convert("RGBA")
    if isinstance(value, dict):
        for key in ("image", "background", "composite", "path", "name"):
            image = _image_from_value(value.get(key))
            if image is not None:
                return image
        return None
    path = value if isinstance(value, (str, os.PathLike)) else None
    if path is None:
        path = getattr(value, "path", None) or getattr(value, "name", None)
    if path:
        try:
            return Image.open(path).convert("RGBA")
        except Exception:
            return None
    return None


def _gallery_values(gallery: object) -> list[object]:
    if gallery is None:
        return []
    if isinstance(gallery, (list, tuple)):
        return list(gallery)
    return [gallery]


def _selected_index(value: object) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return -1


def gallery_image_at(gallery: object, selected_index: object = -1) -> Image.Image | None:
    values = _gallery_values(gallery)
    index = _selected_index(selected_index)
    if 0 <= index < len(values):
        image = _image_from_value(values[index])
        if image is not None:
            return image
    for item in values:
        image = _image_from_value(item)
        if image is not None:
            return image
    return None


def first_gallery_image(gallery: object) -> Image.Image | None:
    return gallery_image_at(gallery, -1)


def _sync_save_log_header(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.reader(handle))
    if not rows or rows[0] == SAVE_LOG_FIELDS:
        return
    rows[0] = SAVE_LOG_FIELDS
    for row in rows[1:]:
        while len(row) < len(SAVE_LOG_FIELDS):
            row.append("")
        if len(row) > len(SAVE_LOG_FIELDS):
            del row[len(SAVE_LOG_FIELDS) :]
    with path.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerows(rows)


def _save_image_with_settings(image: Image.Image, path: Path, infotext: str, settings: dict[str, object]) -> str:
    extension = _image_extension(settings)
    path = _unique_path(path.with_suffix(f".{extension}"))
    image_to_save = _image_for_extension(image, extension)
    kwargs = _image_save_kwargs(extension)
    if extension == "png" and settings.get("enable_pnginfo", True) and infotext:
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("parameters", str(infotext))
        kwargs["pnginfo"] = metadata
    image_to_save.save(path, **kwargs)
    if extension in {"jpg", "webp"} and settings.get("enable_pnginfo", True) and infotext:
        piexif.insert(_infotext_exif_bytes(infotext), str(path))
    if settings.get("save_txt", False) and infotext:
        path.with_suffix(".txt").write_text(f"{infotext}\n", encoding="utf-8")
    return str(path)


def _sidecar_path(image_path: str) -> str:
    return str(Path(image_path).with_suffix(".txt"))


def _write_save_log(image_paths: list[str], infotext: str, settings: dict[str, object] | None = None) -> str:
    if not image_paths:
        return ""
    path = saved_log_path(settings)
    _sync_save_log_header(path)
    parsed = parse_generation_parameters(infotext)
    row = [
        str(parsed.get("prompt", "")),
        str(parsed.get("seed", "")),
        str(parsed.get("width", "")),
        str(parsed.get("height", "")),
        str(parsed.get("sampler", "")),
        str(parsed.get("cfg_scale", "")),
        str(parsed.get("steps", "")),
        Path(image_paths[0]).name,
        str(parsed.get("negative_prompt", "")),
        str(parsed.get("model", "")),
        str(parsed.get("model_hash", "")),
    ]
    at_start = not path.exists() or path.stat().st_size == 0
    with path.open("a", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        if at_start:
            writer.writerow(SAVE_LOG_FIELDS)
        writer.writerow(row)
    return str(path)


def save_output_images(gallery: object, infotext: str = "", *, make_zip: bool = False, selected_index: object = -1) -> list[str]:
    values = _gallery_values(gallery)
    index = _selected_index(selected_index)
    settings = load_settings()
    if settings.get("save_selected_only", True) and 0 <= index < len(values):
        values = [values[index]]
    images = []
    for value in values:
        image = _image_from_value(value)
        if image is not None:
            images.append(image)
    if not images:
        return []

    extension = _image_extension(settings)
    output_dir = saved_outputs_dir(settings)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    paths: list[str] = []
    sidecar_paths: list[str] = []
    for index, image in enumerate(images):
        stem = _output_stem(settings, image, str(infotext or ""), index, timestamp)
        path = output_dir / f"{stem}.{extension}"
        image_path = _save_image_with_settings(image, path, str(infotext or ""), settings)
        paths.append(image_path)
        sidecar_path = _sidecar_path(image_path)
        if Path(sidecar_path).exists():
            sidecar_paths.append(sidecar_path)

    if settings.get("save_write_log_csv", True):
        _write_save_log(paths, str(infotext or ""), settings)

    returned_paths = list(paths)
    if make_zip and paths:
        zip_source_image = images[0]
        zip_stem = _zip_stem(settings, zip_source_image, str(infotext or ""), timestamp)
        zip_path = _unique_path(output_dir / f"{zip_stem}.zip")
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in [*paths, *sidecar_paths]:
                archive.write(path, arcname=Path(path).name)
        returned_paths.insert(0, str(zip_path))
    returned_paths.extend(sidecar_paths)
    return returned_paths


def _file_label(value: object, fallback: str) -> str:
    path = None
    if isinstance(value, dict):
        path = value.get("name") or value.get("path")
    if path is None:
        path = getattr(value, "name", None) or getattr(value, "path", None)
    if path is None and isinstance(value, (str, os.PathLike)):
        path = value
    if path:
        return Path(str(path)).stem
    return fallback


def _directory_images(path: str) -> list[Path]:
    raw = str(path or "").strip()
    if not raw:
        return []
    root = Path(raw).expanduser()
    if not root.is_dir():
        return []
    allowed = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    return [item for item in sorted(root.iterdir()) if item.is_file() and item.suffix.lower() in allowed]


def _batch_edit_image_paths(input_dir: str, formats: list[str], sort_method: str) -> list[Path]:
    root = Path(str(input_dir or "")).expanduser()
    allowed = {"." + str(fmt or "").lower().lstrip(".") for fmt in formats if str(fmt or "").strip()}
    if not allowed:
        allowed = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
    files = [item for item in root.iterdir() if item.is_file() and item.suffix.lower() in allowed]
    method = str(sort_method or "文件名升序")
    if method == "文件名降序":
        return sorted(files, key=lambda item: item.name.lower(), reverse=True)
    if method == "修改时间升序":
        return sorted(files, key=lambda item: item.stat().st_mtime)
    if method == "修改时间降序":
        return sorted(files, key=lambda item: item.stat().st_mtime, reverse=True)
    return sorted(files, key=lambda item: item.name.lower())


def _batch_edit_target_size(width: int, height: int, max_edge_length: int) -> tuple[int, int, float]:
    max_edge = int(max_edge_length or 0)
    if max_edge > 0:
        scale = min(max_edge / max(1, width), max_edge / max(1, height))
        target_width = int(width * scale)
        target_height = int(height * scale)
    else:
        scale = 1.0
        target_width = width
        target_height = height
    target_width = max(64, (target_width // 16) * 16)
    target_height = max(64, (target_height // 16) * 16)
    return target_width, target_height, scale


def build_batch_edit_plan(request: ForgeNeoBatchEditRequest) -> ForgeNeoBatchEditResult:
    input_dir = Path(str(request.input_dir or "")).expanduser()
    if not str(request.input_dir or "").strip() or not input_dir.is_dir():
        return ForgeNeoBatchEditResult(
            status="error",
            progress="输入目录不存在",
            log=f"错误：输入目录 {request.input_dir or ''} 不存在",
            error="input directory does not exist",
        )
    if not str(request.output_dir or "").strip():
        return ForgeNeoBatchEditResult(
            status="error",
            progress="请指定输出目录",
            log="错误：输出目录不能为空",
            error="output directory is empty",
        )
    output_dir = Path(str(request.output_dir)).expanduser()
    output_dir.mkdir(parents=True, exist_ok=True)

    image_paths = _batch_edit_image_paths(str(input_dir), list(request.formats or []), str(request.sort_method or "文件名升序"))
    if not image_paths:
        return ForgeNeoBatchEditResult(
            status="empty",
            progress="未找到图片",
            log=f"警告：在 {input_dir} 中未找到支持的图片格式",
            output_dir=str(output_dir),
        )

    log_lines = [
        f"[批量处理] 已扫描 {len(image_paths)} 张图片",
        f"[批量处理] 输入目录: {input_dir}",
        f"[批量处理] 输出目录: {output_dir}",
        f"[批量处理] 提示词: {str(request.prompt or '')[:50]}...",
        "[批量处理] 当前为 Forge Neo 迁移计划模式；真实逐图编辑等待原生 Forge 后端接入。",
        "-" * 60,
    ]
    planned_files: list[dict[str, object]] = []
    failed = 0
    for index, image_path in enumerate(image_paths, 1):
        filename = image_path.name
        try:
            with Image.open(image_path) as image:
                original_width, original_height = image.size
            target_width, target_height, scale = _batch_edit_target_size(
                original_width,
                original_height,
                int(request.max_edge_length or 0),
            )
            output_filename = f"processed_{image_path.stem}.png"
            entry = {
                "index": index,
                "input": str(image_path),
                "filename": filename,
                "output": str(output_dir / output_filename),
                "output_filename": output_filename,
                "original_width": original_width,
                "original_height": original_height,
                "width": target_width,
                "height": target_height,
                "scale": scale,
                "seed": random.randint(0, 2**31 - 1) if int(request.seed or -1) == -1 else int(request.seed),
            }
            planned_files.append(entry)
            if scale > 1.0:
                size_note = f"放大{scale:.2f}倍"
            elif scale < 1.0:
                size_note = f"缩小{scale:.2f}倍"
            else:
                size_note = "保持原尺寸"
            log_lines.append(
                f"[{index}/{len(image_paths)}] {filename}: "
                f"{original_width}x{original_height} -> {target_width}x{target_height} ({size_note})"
            )
            log_lines.append(f"  计划输出: {output_filename}")
            if target_width > 2048 or target_height > 2048:
                log_lines.append(f"  警告: 尺寸过大 ({target_width}x{target_height})，建议降低目标最大边长")
        except Exception as error:
            failed += 1
            log_lines.append(f"[{index}/{len(image_paths)}] {filename}: 读取失败 - {str(error)[:200]}")

    status = "plan" if planned_files else "error"
    progress = f"计划就绪: {len(planned_files)}/{len(image_paths)} 张图片"
    if failed:
        progress += f"（失败 {failed}）"
    log_lines.append("=" * 60)
    log_lines.append(
        f"计划生成完成。采样步数: {int(request.steps or 0)} | CFG Scale: {float(request.cfg_scale or 0.0)} | 种子: {int(request.seed or -1)}"
    )
    return ForgeNeoBatchEditResult(
        status=status,
        progress=progress,
        log="\n".join(log_lines),
        files=planned_files,
        output_dir=str(output_dir),
        error="" if planned_files else "no readable image files",
    )


def _batch_edit_infotext(request: ForgeNeoBatchEditRequest, entry: dict[str, object]) -> str:
    negative = f"\nNegative prompt: {request.negative_prompt}" if str(request.negative_prompt or "").strip() else ""
    return (
        f"{request.prompt}{negative}\n"
        f"Steps: {int(request.steps or 0)}, CFG scale: {float(request.cfg_scale or 0.0)}, "
        f"Seed: {int(entry.get('seed') or -1)}, Size: {int(entry.get('width') or 0)}x{int(entry.get('height') or 0)}, "
        f"Batch edit input: {entry.get('filename')}, Version: neo"
    )


def _batch_edit_fallback_image(image: Image.Image, request: ForgeNeoBatchEditRequest, entry: dict[str, object]) -> Image.Image:
    width = max(1, int(entry.get("width") or image.width))
    height = max(1, int(entry.get("height") or image.height))
    result = image.convert("RGBA").resize((width, height), Image.Resampling.LANCZOS)
    overlay = Image.new("RGBA", result.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    banner_height = min(max(34, height // 8), 96)
    draw.rectangle((0, height - banner_height, width, height), fill=(18, 24, 35, 190))
    prompt = str(request.prompt or "").strip() or "Batch Edit"
    seed = int(entry.get("seed") or -1)
    text = f"{prompt[:72]} | seed {seed}"
    draw.text((12, height - banner_height + 10), text, fill=(235, 241, 255, 255))
    return Image.alpha_composite(result, overlay).convert("RGB")


def run_batch_edit(request: ForgeNeoBatchEditRequest) -> ForgeNeoBatchEditResult:
    plan = build_batch_edit_plan(request)
    if plan.status != "plan":
        return plan

    log_lines = [plan.log, "[批量处理] 开始 Forge Neo 轻量执行：读取输入图、调整尺寸并写出 PNG。"]
    written_files: list[dict[str, object]] = []
    failed = 0
    for entry in plan.files:
        input_path = Path(str(entry.get("input") or ""))
        output_path = Path(str(entry.get("output") or ""))
        try:
            with Image.open(input_path) as image:
                output_image = _batch_edit_fallback_image(image, request, entry)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            metadata = PngImagePlugin.PngInfo()
            metadata.add_text("parameters", _batch_edit_infotext(request, entry))
            output_image.save(output_path, pnginfo=metadata)
            updated = dict(entry)
            updated["written"] = True
            updated["output_size"] = output_path.stat().st_size
            written_files.append(updated)
            log_lines.append(f"[完成] {input_path.name} -> {output_path.name}")
        except Exception as error:
            failed += 1
            updated = dict(entry)
            updated["written"] = False
            updated["error"] = str(error)
            written_files.append(updated)
            log_lines.append(f"[失败] {input_path.name}: {str(error)[:200]}")

    total = len(plan.files)
    written = sum(1 for item in written_files if item.get("written"))
    status = "finished" if written else "error"
    progress = f"处理完成: {written}/{total} 张图片"
    if failed:
        progress += f"（失败 {failed}）"
    log_lines.append(f"[批量处理] {progress}")
    return ForgeNeoBatchEditResult(
        status=status,
        progress=progress,
        log="\n".join(log_lines),
        files=written_files,
        output_dir=plan.output_dir,
        error="" if written else "no image files were written",
    )


def _safe_recipe_name(value: str, fallback: str = "forge-neo-merge") -> str:
    raw = str(value or "").strip() or fallback
    stem = Path(raw).stem or fallback
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in stem)
    cleaned = cleaned.strip("._")
    return (cleaned or fallback)[:96]


def _model_path_for_name(name: str, catalogs: tuple[str, ...]) -> str:
    clean = str(name or "").strip()
    if not clean or clean == "None":
        return ""
    try:
        from forge_neo.models import find_model_path

        path = find_model_path(clean, *catalogs)
        if path:
            return path
    except Exception:
        pass
    config = ensure_config()
    modelsinfo = getattr(config, "modelsinfo", None)
    if modelsinfo is not None:
        for catalog in catalogs:
            try:
                path = modelsinfo.get_model_filepath(catalog, clean)
            except Exception:
                path = ""
            if path:
                return str(path)
    for catalog in catalogs:
        roots = list((getattr(config, "model_cata_map", {}) or {}).get(catalog, []) or [])
        for root in roots:
            candidate = Path(root) / clean
            if candidate.exists():
                return str(candidate)
    return ""


def _file_sha256_prefix(path: Path, max_bytes: int = 1024 * 1024) -> dict[str, object]:
    digest = hashlib.sha256()
    total = 0
    with path.open("rb") as handle:
        while total < max_bytes:
            chunk = handle.read(min(1024 * 1024, max_bytes - total))
            if not chunk:
                break
            digest.update(chunk)
            total += len(chunk)
    return {"sha256_first_1m": digest.hexdigest(), "hashed_bytes": total}


def _read_safetensors_header(path: Path, max_header_bytes: int = 64 * 1024 * 1024) -> dict[str, object]:
    with path.open("rb") as handle:
        raw_length = handle.read(8)
        if len(raw_length) != 8:
            raise ValueError("safetensors header length is missing")
        header_length = int.from_bytes(raw_length, "little", signed=False)
        if header_length <= 0:
            raise ValueError("safetensors header is empty")
        if header_length > max_header_bytes:
            raise ValueError(f"safetensors header is too large: {header_length} bytes")
        header = handle.read(header_length)
    if len(header) != header_length:
        raise ValueError("safetensors header is truncated")
    data = json.loads(header.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("safetensors header is not an object")
    metadata = data.get("__metadata__", {})
    tensors = [key for key in data if key != "__metadata__"]
    return {
        "format": "safetensors",
        "header_size": header_length,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "tensor_count": len(tensors),
        "tensor_names_sample": tensors[:24],
    }


def _checkpoint_file_metadata(path_text: str) -> dict[str, object]:
    if not path_text:
        return {"exists": False, "status": "not-resolved"}
    path = Path(path_text)
    if not path.is_file():
        return {"exists": False, "status": "missing", "path": str(path)}
    info: dict[str, object] = {
        "exists": True,
        "status": "read",
        "path": str(path),
        "suffix": path.suffix.lower(),
        "size_bytes": path.stat().st_size,
        "modified_at": datetime.datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
    }
    try:
        info.update(_file_sha256_prefix(path))
    except Exception as exc:
        info["hash_error"] = str(exc)
    if path.suffix.lower() == ".safetensors":
        try:
            info["safetensors"] = _read_safetensors_header(path)
        except Exception as exc:
            info["metadata_error"] = str(exc)
    else:
        info["metadata_note"] = "Lightweight metadata reading is available for safetensors headers; native checkpoint parsers are not loaded in this shell."
    return info


def _merger_model_entry(name: str) -> dict[str, object]:
    path = _model_path_for_name(str(name or ""), ("diffusion_models", "checkpoints"))
    return {
        "name": str(name or "None"),
        "path": path,
        "file": _checkpoint_file_metadata(path),
    }


def merger_formula(interp_method: str) -> str:
    method = str(interp_method or "Weighted sum")
    if method == "No interpolation":
        return "A"
    if method == "Add difference":
        return "A + (B - C) * M"
    return "A * (1 - M) + B * M"


def merger_interp_description(interp_method: str) -> str:
    method = str(interp_method or "Weighted sum")
    if method == "No interpolation":
        return "No interpolation will be used. Requires one model; A. Allows for format conversion and VAE baking."
    if method == "Add difference":
        return "The difference between the last two models will be added to the first. Requires three models; A, B and C. The result is calculated as A + (B - C) * M"
    return "A weighted sum will be used for interpolation. Requires two models; A and B. The result is calculated as A * (1 - M) + B * M"


def build_merger_metadata_json(primary: str, secondary: str, tertiary: str) -> str:
    data = {
        "models": {
            "A": _merger_model_entry(primary),
            "B": _merger_model_entry(secondary),
            "C": _merger_model_entry(tertiary),
        },
        "note": "Forge Neo Gradio 6 reads local file info and safetensors header metadata when available. Native checkpoint parsers and real weight merging remain part of the backend migration.",
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_merger_recipe(request: ForgeNeoMergerRequest) -> dict[str, object]:
    metadata: object
    metadata_error = ""
    try:
        metadata = json.loads(str(request.metadata_json or "{}"))
    except Exception as exc:
        metadata = {}
        metadata_error = str(exc)

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    base_name = _safe_recipe_name(request.custom_name or request.primary_model_name or "forge-neo-merge")
    checkpoint_format = str(request.checkpoint_format or "safetensors")
    if checkpoint_format not in {"ckpt", "safetensors"}:
        checkpoint_format = "safetensors"
    planned_path = merger_outputs_dir(request) / f"{base_name}.{checkpoint_format}"

    recipe: dict[str, object] = {
        "version": "forge-neo-merger-recipe-v1",
        "created_at": timestamp,
        "status": "recipe_only",
        "source": {
            "project": "Haoming02/sd-webui-forge-classic",
            "branch": "neo",
            "commit": "bfa6f820",
            "license": "AGPL-3.0",
        },
        "operation": {
            "method": str(request.interp_method or "Weighted sum"),
            "formula": merger_formula(request.interp_method),
            "multiplier": float(request.interp_amount or 0.0),
        },
        "models": {
            "A": _merger_model_entry(request.primary_model_name),
            "B": _merger_model_entry(request.secondary_model_name),
            "C": _merger_model_entry(request.tertiary_model_name),
        },
        "options": {
            "save_as_half": bool(request.save_as_half),
            "checkpoint_format": checkpoint_format,
            "copy_config_from": str(request.config_source or "A, B or C"),
            "bake_in_vae": str(request.bake_in_vae or "None"),
            "discard_weights": str(request.discard_weights or ""),
            "save_metadata": bool(request.save_metadata),
            "add_merge_recipe_metadata": bool(request.add_merge_recipe),
            "copy_metadata_fields": bool(request.copy_metadata_fields),
        },
        "metadata": metadata,
        "output": {
            "planned_checkpoint_path": str(planned_path),
            "recipe_directory": str(merger_outputs_dir(request)),
        },
        "notes": [
            "This file is a Forge Neo Gradio 6 dry-run recipe. It does not contain merged model weights.",
            "Native checkpoint merging will be enabled after the AGPL Forge backend adapter is vendored.",
        ],
    }
    if metadata_error:
        recipe["metadata_parse_error"] = metadata_error
    return recipe


def _safe_checkpoint_filename(filename: str, kind: str) -> str:
    fallback = "my_model.safetensors"
    raw = str(filename or "").strip() or fallback
    stem = _safe_recipe_name(raw, Path(fallback).stem)
    suffix = Path(raw).suffix.lower()
    if suffix not in {".ckpt", ".safetensors", ".gguf"}:
        suffix = ".safetensors"
    if kind == "unet" and not stem.lower().endswith("_unet"):
        stem = f"{stem}_unet"
    return f"{stem}{suffix}"


def build_current_model_save_plan(request: ForgeNeoCurrentModelSaveRequest) -> dict[str, object]:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    kind = "unet" if str(request.kind or "").lower() == "unet" else "checkpoint"
    filename = _safe_checkpoint_filename(request.filename, kind)
    target_path = _checkpoint_save_target_dir(request.checkpoint) / filename
    plan_dir = Path(str(request.output_dir)).expanduser() if str(request.output_dir or "").strip() else merger_outputs_dir(None)
    plan_dir.mkdir(parents=True, exist_ok=True)
    return {
        "version": "forge-neo-current-model-save-plan-v1",
        "created_at": timestamp,
        "status": "plan_only",
        "source": {
            "project": "Haoming02/sd-webui-forge-classic",
            "branch": "neo",
            "commit": "bfa6f820",
            "license": "AGPL-3.0",
        },
        "operation": {
            "kind": kind,
            "upstream_method": "shared.sd_model.save_unet" if kind == "unet" else "shared.sd_model.save_checkpoint",
        },
        "current_model": {
            "checkpoint": str(request.checkpoint or "None"),
            "checkpoint_path": _model_path_for_name(str(request.checkpoint or ""), ("diffusion_models", "checkpoints")),
            "vae": str(request.vae or "None"),
            "text_encoders": [str(item) for item in request.text_encoders or [] if str(item or "").strip()],
            "low_bit_dtype": str(request.low_bit_dtype or "Automatic"),
        },
        "output": {
            "planned_model_path": str(target_path),
            "plan_directory": str(plan_dir),
        },
        "notes": [
            "This file records the current-model save request from the Forge Neo Gradio 6 shell.",
            "It does not contain model weights. Native current-model saving requires the Forge backend adapter.",
        ],
    }


def run_current_model_save_plan(request: ForgeNeoCurrentModelSaveRequest) -> ForgeNeoCurrentModelSaveResult:
    try:
        plan = build_current_model_save_plan(request)
        plan_json = json.dumps(plan, ensure_ascii=False, indent=2)
        timestamp = str(plan.get("created_at") or time.strftime("%Y%m%d-%H%M%S"))
        kind = str((plan.get("operation") or {}).get("kind") or "checkpoint")
        filename = Path(str((plan.get("output") or {}).get("planned_model_path") or request.filename)).stem
        plan_dir = Path(str((plan.get("output") or {}).get("plan_directory") or merger_outputs_dir(None))).expanduser()
        plan_dir.mkdir(parents=True, exist_ok=True)
        path = plan_dir / f"{timestamp}-save-{kind}-{_safe_recipe_name(filename)}.json"
        path.write_text(plan_json, encoding="utf-8")
        return ForgeNeoCurrentModelSaveResult(plan=plan, plan_json=plan_json, plan_path=str(path))
    except Exception as exc:
        return ForgeNeoCurrentModelSaveResult(status="error", error=str(exc))


def run_merger_recipe(request: ForgeNeoMergerRequest) -> ForgeNeoMergerResult:
    try:
        recipe = build_merger_recipe(request)
        recipe_json = json.dumps(recipe, ensure_ascii=False, indent=2)
        timestamp = str(recipe.get("created_at") or time.strftime("%Y%m%d-%H%M%S"))
        name = _safe_recipe_name(str(request.custom_name or request.primary_model_name or "forge-neo-merge"))
        path = merger_outputs_dir(request) / f"{timestamp}-{name}.json"
        path.write_text(recipe_json, encoding="utf-8")
        return ForgeNeoMergerResult(recipe=recipe, recipe_json=recipe_json, recipe_path=str(path))
    except Exception as exc:
        return ForgeNeoMergerResult(status="error", error=str(exc))


def _resample_filter(name: str):
    key = str(name or "").lower()
    if "nearest" in key:
        return Image.Resampling.NEAREST
    if "bilinear" in key:
        return Image.Resampling.BILINEAR
    if "bicubic" in key:
        return Image.Resampling.BICUBIC
    return Image.Resampling.LANCZOS


def _extras_model_upscaler_requested(request: ForgeNeoExtrasRequest) -> bool:
    primary = str(request.upscaler_1 or "").strip().casefold()
    secondary = str(request.upscaler_2 or "").strip().casefold()
    if primary not in LOCAL_EXTRAS_UPSCALERS:
        return True
    return float(request.upscaler_2_visibility or 0.0) > 0 and secondary not in LOCAL_EXTRAS_UPSCALERS


def _run_source_backend_upscale(
    image: Image.Image,
    request: ForgeNeoExtrasRequest,
    progress_callback: ProgressCallback | None,
    control_callback: ControlCallback | None,
) -> ForgeNeoResult:
    from forge_neo.runtime_backend.source_runtime import run_source_backend_upscale

    return run_source_backend_upscale(image, request, progress_callback=progress_callback, control_callback=control_callback)


def _resize_image_with_source_backend(
    image: Image.Image,
    request: ForgeNeoExtrasRequest,
    progress_callback: ProgressCallback | None,
    control_callback: ControlCallback | None,
) -> Image.Image:
    result = _run_source_backend_upscale(image, request, progress_callback, control_callback)
    if result.status != "finished" or not result.images:
        detail = str(result.error or result.infotext or "Source backend upscaler returned no image.").strip()
        raise RuntimeError(detail)
    output = result.images[0]
    if not isinstance(output, Image.Image):
        raise RuntimeError("Source backend upscaler returned invalid image.")
    return output


def _resize_image(
    image: Image.Image,
    request: ForgeNeoExtrasRequest,
    progress_callback: ProgressCallback | None = None,
    control_callback: ControlCallback | None = None,
) -> Image.Image:
    if _extras_model_upscaler_requested(request):
        return _resize_image_with_source_backend(image, request, progress_callback, control_callback)

    source = image.convert("RGBA")
    if request.resize_mode == "Scale to":
        target_width = max(1, int(request.resize_width or source.width))
        target_height = max(1, int(request.resize_height or source.height))
    else:
        scale = max(0.05, float(request.resize_scale or 1.0))
        target_width = max(1, round(source.width * scale))
        target_height = max(1, round(source.height * scale))
        max_side_length = max(0, int(request.max_side_length or 0))
        if max_side_length > 0 and max(target_width, target_height) > max_side_length:
            ratio = max_side_length / max(target_width, target_height)
            target_width = max(1, round(target_width * ratio))
            target_height = max(1, round(target_height * ratio))

    if request.resize_mode == "Scale to" and request.crop_to_fit:
        ratio = max(target_width / source.width, target_height / source.height)
        intermediate = source.resize((max(1, round(source.width * ratio)), max(1, round(source.height * ratio))), _resample_filter(request.upscaler_1))
        left = max(0, (intermediate.width - target_width) // 2)
        top = max(0, (intermediate.height - target_height) // 2)
        return intermediate.crop((left, top, left + target_width, top + target_height))

    return source.resize((target_width, target_height), _resample_filter(request.upscaler_1))


def _video_rate(value: object) -> int:
    try:
        fps = int(round(float(value or 24)))
    except Exception:
        fps = 24
    return max(1, min(fps, 120))


def _video_frame_image(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    width = max(2, image.width - (image.width % 2))
    height = max(2, image.height - (image.height % 2))
    if image.size != (width, height):
        image = image.resize((width, height), Image.Resampling.LANCZOS)
    return image


def build_extras_infotext(request: ForgeNeoExtrasRequest, count: int) -> str:
    video = f", Video: {request.video_path}" if request.mode == "video" and request.video_path else ""
    return (
        f"Extras mode: {request.mode}, Images: {count}, Resize mode: {request.resize_mode}, "
        f"Scale: {request.resize_scale}, Max side length: {request.max_side_length}, "
        f"Size: {request.resize_width}x{request.resize_height}, "
        f"Crop to fit: {request.crop_to_fit}, Upscaler 1: {request.upscaler_1}, "
        f"Upscaler 2: {request.upscaler_2}, Upscaler 2 visibility: {request.upscaler_2_visibility}, "
        f"Upscale first: {request.upscale_first}, "
        f"Color correction: {request.color_correction}, "
        f"GFPGAN visibility: {request.gfpgan_visibility}, CodeFormer visibility: {request.codeformer_visibility}, "
        f"CodeFormer weight: {request.codeformer_weight}{video}, Version: neo"
    )


def _progress_ratio(value: object, default: float = 0.0) -> float:
    try:
        ratio = float(value)
    except (TypeError, ValueError):
        ratio = default
    if ratio != ratio:
        ratio = default
    return min(1.0, max(0.0, ratio))


def _progress_int(value: object, default: int = 0) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(0, number)


def _extras_item_progress_event(event: dict[str, object], *, index: int, total: int) -> dict[str, object]:
    safe_total = max(1, int(total or 1))
    safe_index = min(max(0, int(index or 0)), safe_total - 1)
    child_progress = _progress_ratio(event.get("progress", 0.0))
    aggregate_progress = min(0.99, max(0.0, (safe_index + child_progress) / safe_total))
    message_en = str(event.get("message_en") or event.get("message") or "Extras working")
    message_cn = str(event.get("message_cn") or message_en)
    mapped = dict(event)
    mapped.update(
        {
            "event": "progress",
            "progress": aggregate_progress,
            "message": f"Extras item {safe_index + 1}/{safe_total}: {message_en}",
            "message_en": f"Extras item {safe_index + 1}/{safe_total}: {message_en}",
            "message_cn": f"后期处理 {safe_index + 1}/{safe_total}: {message_cn}",
        }
    )
    child_steps = _progress_int(event.get("sampling_steps", 0))
    if child_steps > 0:
        child_step = min(child_steps, _progress_int(event.get("sampling_step", 0)))
        aggregate_steps = child_steps * safe_total
        mapped["sampling_step"] = min(aggregate_steps, safe_index * child_steps + child_step)
        mapped["sampling_steps"] = aggregate_steps
    return mapped


def _extras_item_progress_callback(
    progress_callback: ProgressCallback | None,
    *,
    index: int,
    total: int,
) -> ProgressCallback | None:
    if progress_callback is None:
        return None

    def callback(event: dict[str, object]) -> None:
        progress_callback(_extras_item_progress_event(event, index=index, total=total))

    return callback


def _extras_source_metadata(image: Image.Image) -> dict[str, object]:
    source_info = dict(getattr(image, "info", {}) or {})
    text: dict[str, str] = {}
    structured_keys = {"exif", "icc_profile", "dpi", "transparency"}
    for key, value in source_info.items():
        name = str(key or "")
        if not name or name in structured_keys:
            continue
        if isinstance(value, str):
            text[name] = value
            continue
        if isinstance(value, (bytes, bytearray)) and ("comment" in name.casefold() or "xmp" in name.casefold()):
            try:
                text[name] = bytes(value).decode("utf-8")
            except UnicodeDecodeError:
                pass

    exif_value = source_info.get("exif")
    if hasattr(exif_value, "tobytes"):
        try:
            exif_value = exif_value.tobytes()
        except Exception:
            exif_value = None
    if not isinstance(exif_value, (bytes, bytearray)) or not exif_value:
        try:
            source_exif = image.getexif()
            exif_value = source_exif.tobytes() if source_exif else None
        except Exception:
            exif_value = None

    icc_profile = source_info.get("icc_profile")
    if not isinstance(icc_profile, (bytes, bytearray)) or not icc_profile:
        icc_profile = None

    dpi = source_info.get("dpi")
    if not isinstance(dpi, (tuple, list)) or len(dpi) < 2:
        dpi = None

    return {
        "text": text,
        "exif": bytes(exif_value) if isinstance(exif_value, (bytes, bytearray)) else None,
        "icc_profile": bytes(icc_profile) if isinstance(icc_profile, (bytes, bytearray)) else None,
        "dpi": tuple(dpi[:2]) if dpi is not None else None,
    }


def _save_extras_image(
    image: Image.Image,
    path: Path,
    source_metadata: dict[str, object],
    postprocessing_info: str,
) -> None:
    text = dict(source_metadata.get("text") or {})
    previous_postprocessing = str(text.pop("postprocessing", "") or "").strip()
    current_postprocessing = str(postprocessing_info or "").strip()
    combined_postprocessing = "\n".join(item for item in (previous_postprocessing, current_postprocessing) if item)

    pnginfo = PngImagePlugin.PngInfo()
    for key, value in text.items():
        try:
            pnginfo.add_text(str(key), str(value))
        except (TypeError, ValueError, UnicodeError):
            continue
    if combined_postprocessing:
        pnginfo.add_text("postprocessing", combined_postprocessing)

    save_kwargs: dict[str, object] = {"format": "PNG", "pnginfo": pnginfo}
    exif_value = source_metadata.get("exif")
    if isinstance(exif_value, bytes) and exif_value:
        save_kwargs["exif"] = exif_value
    icc_profile = source_metadata.get("icc_profile")
    if isinstance(icc_profile, bytes) and icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    dpi = source_metadata.get("dpi")
    if isinstance(dpi, tuple) and len(dpi) >= 2:
        save_kwargs["dpi"] = (float(dpi[0]), float(dpi[1]))
    image.save(path, **save_kwargs)


def _run_extras_video(
    request: ForgeNeoExtrasRequest,
    start: float,
    progress_callback: ProgressCallback | None,
    control_callback: ControlCallback | None,
) -> ForgeNeoResult:
    source_text = str(request.video_path or "").strip().strip('"')
    infotext = build_extras_infotext(request, 0)
    if not source_text:
        _emit(progress_callback, "finish", 1.0, "error")
        return ForgeNeoResult(
            images=[],
            infotext=infotext,
            seed=-1,
            status="error",
            error="No input video found.",
            output_paths=[],
            elapsed_seconds=time.time() - start,
        )

    source_path = Path(source_text).expanduser()
    if not source_path.is_file():
        _emit(progress_callback, "finish", 1.0, "error")
        return ForgeNeoResult(
            images=[],
            infotext=infotext,
            seed=-1,
            status="error",
            error="No input video found.",
            output_paths=[],
            elapsed_seconds=time.time() - start,
        )

    try:
        import av
    except Exception as exc:
        _emit(progress_callback, "finish", 1.0, "error")
        return ForgeNeoResult(
            images=[],
            infotext=infotext,
            seed=-1,
            status="error",
            error=f"Video processing requires PyAV: {exc}",
            output_paths=[],
            elapsed_seconds=time.time() - start,
        )

    output_dir = extras_outputs_dir(request)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    safe_stem = _sanitize_filename_part(source_path.stem or "video", max_length=80)
    output_path = _unique_path(output_dir / f"{timestamp}-video-{safe_stem}.mp4")
    manifest_path = output_path.with_suffix(".json")
    input_container = None
    output_container = None
    output_stream = None
    last_image: Image.Image | None = None
    processed_count = 0
    total_frames = 0
    fps = 24

    try:
        input_container = av.open(str(source_path))
        video_stream = input_container.streams.best("video")
        if video_stream is None:
            raise ValueError("No video stream found.")
        total_frames = int(video_stream.frames or 0)
        fps = _video_rate(getattr(video_stream, "average_rate", None))
        output_container = av.open(str(output_path), mode="w")
        _emit(progress_callback, "progress", 0.05, "video queued")

        for frame in input_container.decode(video=0):
            control_status = _control_status(control_callback)
            if control_status:
                _emit(progress_callback, "finish", 0 if total_frames <= 0 else processed_count / total_frames, control_status)
                return ForgeNeoResult(
                    images=[last_image] if request.show_results and last_image is not None else [],
                    infotext=build_extras_infotext(request, processed_count),
                    seed=-1,
                    status=control_status,
                    output_paths=[],
                    elapsed_seconds=time.time() - start,
                )

            frame_progress_callback = _extras_item_progress_callback(
                progress_callback,
                index=processed_count,
                total=total_frames if total_frames > 0 else processed_count + 2,
            )
            image = _video_frame_image(_resize_image(frame.to_image(), request, frame_progress_callback, control_callback))
            if output_stream is None:
                output_stream = output_container.add_stream("mpeg4", rate=fps)
                output_stream.width = image.width
                output_stream.height = image.height
                output_stream.pix_fmt = "yuv420p"
            encoded = av.VideoFrame.from_image(image)
            for packet in output_stream.encode(encoded):
                output_container.mux(packet)
            last_image = image.copy()
            processed_count += 1
            progress = min(0.98, processed_count / total_frames) if total_frames > 0 else 0.5
            _emit(progress_callback, "progress", progress, f"video frame {processed_count}")

        if output_stream is None or processed_count <= 0:
            raise ValueError("No video frames decoded.")
        for packet in output_stream.encode():
            output_container.mux(packet)
    except Exception as exc:
        if output_container is not None:
            output_container.close()
            output_container = None
        if input_container is not None:
            input_container.close()
            input_container = None
        if output_path.exists():
            output_path.unlink()
        _emit(progress_callback, "finish", 1.0, "error")
        return ForgeNeoResult(
            images=[],
            infotext=infotext,
            seed=-1,
            status="error",
            error=f"Video processing failed: {exc}",
            output_paths=[],
            elapsed_seconds=time.time() - start,
        )
    finally:
        if output_container is not None:
            output_container.close()
        if input_container is not None:
            input_container.close()

    infotext = build_extras_infotext(request, processed_count)
    manifest = {
        "type": "extras_video",
        "source_path": str(source_path),
        "output_path": str(output_path),
        "frames": processed_count,
        "fps": fps,
        "size": [last_image.width, last_image.height] if last_image is not None else [0, 0],
        "infotext": infotext,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    _emit(progress_callback, "finish", 1.0, "finished")
    return ForgeNeoResult(
        images=[last_image] if request.show_results and last_image is not None else [],
        infotext=infotext,
        seed=-1,
        status="finished",
        error="",
        output_paths=[str(output_path), str(manifest_path)],
        elapsed_seconds=time.time() - start,
    )


def run_extras(
    request: ForgeNeoExtrasRequest,
    progress_callback: ProgressCallback | None = None,
    control_callback: ControlCallback | None = None,
) -> ForgeNeoResult:
    start = time.time()
    values: list[object] = []
    if request.mode == "video":
        return _run_extras_video(request, start, progress_callback, control_callback)
    if request.mode == "batch":
        values = list(request.batch_files or [])
    elif request.mode == "directory":
        values = list(_directory_images(request.input_dir))
    else:
        values = [request.image] if request.image is not None else []

    images: list[object] = []
    paths: list[str] = []
    processed_count = 0
    output_dir = extras_outputs_dir(request)
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    total = max(1, len(values))
    _emit(progress_callback, "progress", 0.05, "extras queued")
    for index, value in enumerate(values):
        control_status = _control_status(control_callback)
        if control_status:
            _emit(progress_callback, "finish", index / total, control_status)
            return ForgeNeoResult(
                images=images if request.show_results else [],
                infotext=f"Extras {control_status}",
                seed=-1,
                status=control_status,
                output_paths=paths,
                elapsed_seconds=time.time() - start,
            )
        image = _image_from_value(value)
        if image is None:
            continue
        source_metadata = _extras_source_metadata(image)
        try:
            item_progress_callback = _extras_item_progress_callback(progress_callback, index=index, total=total)
            resized = _resize_image(image, request, item_progress_callback, control_callback)
        except Exception as exc:
            _emit(progress_callback, "finish", index / total, "error")
            return ForgeNeoResult(
                images=images if request.show_results else [],
                infotext=build_extras_infotext(request, processed_count),
                seed=-1,
                status="error",
                error=f"Upscale failed: {type(exc).__name__}: {exc}",
                output_paths=paths,
                elapsed_seconds=time.time() - start,
            )
        label = _file_label(value, f"extras-{index}")
        name = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in label)[:80]
        path = _unique_path(output_dir / f"{timestamp}-{index}-{name}.png")
        item_infotext = build_extras_infotext(request, processed_count + 1)
        try:
            _save_extras_image(resized, path, source_metadata, item_infotext)
        except Exception as exc:
            _emit(progress_callback, "finish", index / total, "error")
            return ForgeNeoResult(
                images=images if request.show_results else [],
                infotext=build_extras_infotext(request, processed_count),
                seed=-1,
                status="error",
                error=f"Save failed: {type(exc).__name__}: {exc}",
                output_paths=paths,
                elapsed_seconds=time.time() - start,
            )
        paths.append(str(path))
        processed_count += 1
        if request.show_results:
            images.append(str(path) if request.mode in {"batch", "directory"} else resized)
        _emit(progress_callback, "progress", (index + 1) / total, f"extras {index + 1}")

    infotext = build_extras_infotext(request, processed_count)
    status = "finished" if processed_count else "error"
    error = "" if processed_count else "No input image found."
    _emit(progress_callback, "finish", 1.0, status)
    return ForgeNeoResult(
        images=images if request.show_results else [],
        infotext=infotext,
        seed=-1,
        status=status,
        error=error,
        output_paths=paths,
        elapsed_seconds=time.time() - start,
        debug_info={"processed_count": processed_count, "gallery_count": len(images)},
    )


def _split_script_values(value: object) -> list[str]:
    text = str(value or "").replace("\n", ",")
    return [part.strip() for part in text.split(",") if part.strip()]


def _csv_to_pair(value: str) -> tuple[str, str] | None:
    parts = _split_script_values(value)
    if len(parts) < 2:
        return None
    return parts[0], parts[1]


def _parse_size_value(value: str) -> tuple[int, int] | None:
    text = str(value or "").lower().replace(" ", "")
    match = re.match(r"^(\d+)x(\d+)$", text)
    if not match:
        return None
    return max(64, int(match.group(1))), max(64, int(match.group(2)))


def _apply_xyz_axis(request: ForgeNeoRequest, seed: int, axis_type: str, value: str) -> tuple[ForgeNeoRequest, int]:
    clean_type = str(axis_type or "Nothing")
    clean_value = str(value or "").strip()
    if clean_type == "Seed":
        try:
            return request, int(clean_value)
        except ValueError:
            return request, seed
    if clean_type == "Steps":
        try:
            return replace(request, steps=max(1, int(clean_value))), seed
        except ValueError:
            return request, seed
    if clean_type == "CFG Scale":
        try:
            return replace(request, cfg_scale=float(clean_value)), seed
        except ValueError:
            return request, seed
    if clean_type == "Distilled CFG Scale":
        try:
            return replace(request, distilled_cfg_scale=float(clean_value)), seed
        except ValueError:
            return request, seed
    if clean_type == "Denoising":
        try:
            return replace(request, denoising_strength=float(clean_value)), seed
        except ValueError:
            return request, seed
    if clean_type == "Size":
        size = _parse_size_value(clean_value)
        return (replace(request, width=size[0], height=size[1]), seed) if size else (request, seed)
    if clean_type == "Prompt S/R":
        pair = _csv_to_pair(clean_value)
        if pair is None:
            return request, seed
        old, new = pair
        return replace(request, prompt=str(request.prompt or "").replace(old, new), negative_prompt=str(request.negative_prompt or "").replace(old, new)), seed
    if clean_type == "Sampler":
        return replace(request, sampler=clean_value or request.sampler), seed
    if clean_type == "Schedule type":
        return replace(request, scheduler=clean_value or request.scheduler), seed
    if clean_type == "Checkpoint name":
        return replace(request, checkpoint=clean_value or request.checkpoint), seed
    if clean_type == "VAE":
        return replace(request, vae=clean_value or request.vae), seed
    return request, seed


def _prompt_matrix_requests(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    args = dict(request.script_args or {})
    prompt_type = str(args.get("prompt_type", "positive") or "positive")
    source = str(request.prompt if prompt_type == "positive" else request.negative_prompt or "")
    parts = [part.strip().strip(",") for part in source.split("|")]
    if len(parts) <= 1:
        return [(request, seed, "Prompt Matrix: base")]
    delimiter = ", " if str(args.get("variations_delimiter", "comma")) == "comma" else " "
    put_at_start = bool(args.get("put_at_start"))
    different_seeds = bool(args.get("different_seeds"))
    items: list[tuple[ForgeNeoRequest, int, str]] = []
    for index in range(2 ** (len(parts) - 1)):
        selected = [part for bit, part in enumerate(parts[1:]) if index & (1 << bit)]
        prompt_parts = selected + [parts[0]] if put_at_start else [parts[0]] + selected
        value = delimiter.join(part for part in prompt_parts if part)
        item_request = replace(request, prompt=value) if prompt_type == "positive" else replace(request, negative_prompt=value)
        items.append((item_request, seed + (index if different_seeds else 0), f"Prompt Matrix {index + 1}"))
    return items


def _prompts_from_text_requests(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    args = dict(request.script_args or {})
    lines = [line.strip() for line in str(args.get("prompt_text", "") or "").splitlines() if line.strip()]
    if not lines:
        return [(request, seed, "Prompts: base")]
    position = str(args.get("prompt_position", "start") or "start")
    iterate_seed = bool(args.get("iterate_seed"))
    same_seed = bool(args.get("same_seed"))
    items: list[tuple[ForgeNeoRequest, int, str]] = []
    for index, line in enumerate(lines):
        prompt = f"{line} {request.prompt}".strip() if position == "start" else f"{request.prompt} {line}".strip()
        item_seed = seed if same_seed or not iterate_seed else seed + index
        items.append((replace(request, prompt=prompt), item_seed, f"Prompt line {index + 1}"))
    return items


def _xyz_plot_requests(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    args = dict(request.script_args or {})
    axes: list[tuple[str, list[str]]] = []
    for key in ("x", "y", "z"):
        axis_type = str(args.get(f"{key}_type", "Nothing") or "Nothing")
        values = _split_script_values(_script_axis_values_text(args, key))
        axes.append((axis_type, values if axis_type != "Nothing" and values else [""]))
    items: list[tuple[ForgeNeoRequest, int, str]] = []
    for x_value in axes[0][1]:
        for y_value in axes[1][1]:
            for z_value in axes[2][1]:
                item_request = request
                item_seed = seed
                label_parts: list[str] = []
                for axis_type, axis_value in ((axes[0][0], x_value), (axes[1][0], y_value), (axes[2][0], z_value)):
                    if axis_type == "Nothing" or not axis_value:
                        continue
                    item_request, item_seed = _apply_xyz_axis(item_request, item_seed, axis_type, axis_value)
                    label_parts.append(f"{axis_type}: {axis_value}")
                label = " | ".join(label_parts) if label_parts else "X/Y/Z plot"
                items.append((item_request, item_seed, label))
    return items or [(request, seed, "X/Y/Z plot")]


def _loopback_requests(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    args = dict(request.script_args or {})
    loops = max(1, min(int(args.get("loops", 1) or 1), 32))
    final_strength = float(args.get("final_denoising_strength", request.denoising_strength) or 0.0)
    start_strength = float(request.denoising_strength or 0.0)
    items: list[tuple[ForgeNeoRequest, int, str]] = []
    for index in range(loops):
        ratio = 0.0 if loops == 1 else index / (loops - 1)
        strength = start_strength + (final_strength - start_strength) * ratio
        items.append((replace(request, denoising_strength=strength), seed, f"Loopback {index + 1}/{loops}"))
    return items


def _sd_upscale_requests(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    args = dict(request.script_args or {})
    scale = max(1.0, float(args.get("scale_factor", 1.0) or 1.0))
    width = max(64, int((request.width or 1024) * scale))
    height = max(64, int((request.height or 1024) * scale))
    return [(replace(request, width=width, height=height), seed, f"SD Upscale x{scale:g}")]


def _script_generation_items(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    script = str(request.script or "None").strip()
    if script == "Prompt Matrix":
        return _prompt_matrix_requests(request, seed)
    if script == "Prompts from File or Textbox":
        return _prompts_from_text_requests(request, seed)
    if script == "X/Y/Z plot":
        return _xyz_plot_requests(request, seed)
    if script == "Loopback":
        return _loopback_requests(request, seed)
    if script == "SD Upscale":
        return _sd_upscale_requests(request, seed)
    count = max(1, int(request.batch_count or 1)) * max(1, int(request.batch_size or 1))
    return [(request, seed + index, f"Batch {index + 1}") for index in range(count)]


def _placeholder_generation_items(request: ForgeNeoRequest, seed: int) -> list[tuple[ForgeNeoRequest, int, str]]:
    max_count = int(os.environ.get("FORGE_NEO_MAX_PLACEHOLDER_IMAGES", "16") or 16)
    return _script_generation_items(request, seed)[: max(1, max_count)]


def generate(
    request: ForgeNeoRequest,
    progress_callback: ProgressCallback | None = None,
    control_callback: ControlCallback | None = None,
) -> ForgeNeoResult:
    start = time.time()
    seed = int(request.seed if int(request.seed) >= 0 else random.randrange(0, 2**32 - 1))
    try:
        adetailer_save_request_state(request)
    except Exception:
        pass
    _emit(progress_callback, "progress", 0.05, "queued")
    backend_error = ""
    backend_disabled = bool(getattr(args_manager.args, "disable_backend", False))
    if backend_disabled:
        try:
            from forge_neo.style_grid import apply_style_grid_to_request

            request = apply_style_grid_to_request(request)
        except Exception:
            pass

    if not backend_disabled:
        try:
            from forge_neo.runtime_backend.adapter import run_backend_generation

            backend_result = run_backend_generation(
                request,
                progress_callback=progress_callback,
                control_callback=control_callback,
            )
            if backend_result.status != "backend_unavailable":
                return _ensure_result_output_paths(backend_result, seed)
            backend_error = backend_result.error
        except Exception as exc:
            backend_error = f"{type(exc).__name__}: {exc}"

    if not backend_disabled:
        error = backend_error or "Forge Neo backend adapter is unavailable."
        _emit(progress_callback, "finish", 1.0, "backend_unavailable")
        return ForgeNeoResult(
            images=[],
            infotext=build_infotext(request, seed),
            seed=seed,
            status="backend_unavailable",
            error=error,
            output_paths=[],
            elapsed_seconds=time.time() - start,
        )

    generation_items = _placeholder_generation_items(request, seed)
    image_count = len(generation_items)
    step_count = max(1, min(int(request.steps or 1), 150))
    total_steps = max(1, image_count * step_count)
    completed_steps = 0
    images: list[Image.Image] = []

    for image_index, (item_request, item_seed, item_label) in enumerate(generation_items):
        for step in range(step_count):
            control_status = _control_status(control_callback)
            if control_status:
                infotext = build_infotext(request, seed)
                paths = _save_images(images, infotext, seed) if images else []
                _emit(progress_callback, "finish", completed_steps / total_steps, control_status)
                return ForgeNeoResult(
                    images=images,
                    infotext=infotext,
                    seed=seed,
                    status=control_status,
                    output_paths=paths,
                    elapsed_seconds=time.time() - start,
                )
            time.sleep(0.01)
            completed_steps += 1
            _emit(
                progress_callback,
                "progress",
                completed_steps / total_steps,
                f"image {image_index + 1}/{image_count}, step {step + 1}",
            )
        images.append(_placeholder_image(item_request, item_seed, item_label))

    infotext = build_infotext(request, seed)
    paths = _save_images(images, infotext, seed)

    status = "finished"
    error = ""
    _emit(progress_callback, "finish", 1.0, status)
    return ForgeNeoResult(
        images=images,
        infotext=infotext,
        seed=seed,
        status=status,
        error=error,
        output_paths=paths,
        elapsed_seconds=time.time() - start,
    )
