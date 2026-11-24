"""Compatibility helpers for Visage Face Swap (eduardoabreu81/visage-forge-neo)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any


VISAGE_EXTENSION = "visage-forge-neo"
VISAGE_SCRIPT_NAME = "Visage"

VISAGE_SOURCE_TYPES = ("Image", "Multiple images", "Face model")
VISAGE_SORT_ORDERS = (
    "large-small",
    "small-large",
    "left-right",
    "right-left",
    "top-bottom",
    "bottom-top",
    "best-worst",
)
VISAGE_GENDERS = ("any", "female", "male")
VISAGE_SWAPPERS = (
    "hyperswap_1a_256",
    "hyperswap_1b_256",
    "hyperswap_1c_256",
    "inswapper_128",
    "inswapper_128_fp16",
    "reswapper_128",
    "reswapper_256",
    "simswap_256",
    "simswap_unofficial_512",
    "ghost_1_256",
    "ghost_2_256",
    "ghost_3_256",
    "hififace_unofficial_256",
    "alphaface_256",
)
VISAGE_PIXEL_BOOSTS = ("off", "256", "512", "768", "1024")
VISAGE_COLOR_MATCHES = ("none", "reinhard", "mkl", "hm", "hm-mkl-hm")
VISAGE_DETECTORS = ("retinaface_10g", "scrfd_2.5g", "yoloface_8n")
VISAGE_DET_SIZES = (320, 512, 640, 1024)
VISAGE_OCCLUDERS = ("xseg_1", "xseg_2")
VISAGE_REGIONS = (
    "skin",
    "nose",
    "left-eyebrow",
    "right-eyebrow",
    "left-eye",
    "right-eye",
    "eye-glasses",
    "mouth",
    "upper-lip",
    "lower-lip",
    "hair",
    "left-ear",
    "right-ear",
    "neck",
    "hat",
)
VISAGE_DEFAULT_REGIONS = (
    "skin",
    "nose",
    "left-eyebrow",
    "right-eyebrow",
    "left-eye",
    "right-eye",
    "mouth",
    "upper-lip",
    "lower-lip",
)
VISAGE_RESTORERS = (
    "none",
    "gfpgan_1.4",
    "codeformer",
    "gpen_bfr_256",
    "gpen_bfr_512",
    "gpen_bfr_1024",
    "gpen_bfr_2048",
    "restoreformer_plus_plus",
)

# Exact 47 positional args from upstream lib_visage/panel.py::ARG_KEYS
VISAGE_ARG_KEYS = (
    "enabled",
    "source_type",
    "source_image",
    "source_files",
    "face_model",
    "source_indexes",
    "target_indexes",
    "sort_order",
    "gender",
    "swap_generated",
    "swap_init",
    "swapper",
    "strength",
    "pixel_boost",
    "color_match",
    "detector",
    "det_threshold",
    "det_size",
    "try_rotations",
    "min_face_size",
    "mask_box",
    "mask_blur",
    "pad_top",
    "pad_right",
    "pad_bottom",
    "pad_left",
    "mask_model",
    "mask_occlusion",
    "occluder",
    "mask_region",
    "regions",
    "region_dilate",
    "keep_mouth",
    "restorer",
    "restorer_visibility",
    "codeformer_weight",
    "face_boost",
    "refine",
    "refine_denoise",
    "refine_steps",
    "refine_padding",
    "refine_prompt",
    "refine_negative",
    "refine_reswap",
    "refine_extend_down",
    "restore_guard",
    "refine_texture",
)

VISAGE_ARG_LABELS = {
    "enabled": "Enable Visage",
    "source_type": "Source",
    "source_image": "Source face",
    "source_files": "Source face photos",
    "face_model": "Face model",
    "source_indexes": "Source faces",
    "target_indexes": "Target faces",
    "sort_order": "Face order",
    "gender": "Gender filter",
    "swap_generated": "Swap generated image",
    "swap_init": "Also swap input image (before img2img)",
    "swapper": "Swapper",
    "strength": "Strength",
    "pixel_boost": "Pixel boost",
    "color_match": "Color match",
    "detector": "Detector",
    "det_threshold": "Score threshold",
    "det_size": "Detection size",
    "try_rotations": "Detect rotated faces",
    "min_face_size": "Min face size (px)",
    "mask_box": "Box mask",
    "mask_blur": "Blur",
    "pad_top": "Pad top %",
    "pad_right": "Pad right %",
    "pad_bottom": "Pad bottom %",
    "pad_left": "Pad left %",
    "mask_model": "Swapper mask",
    "mask_occlusion": "Occlusion mask",
    "occluder": "Occluder",
    "mask_region": "Region mask",
    "regions": "Regions to swap",
    "region_dilate": "Region margin (px)",
    "keep_mouth": "Keep target mouth",
    "restorer": "Face restorer",
    "restorer_visibility": "Restorer visibility",
    "codeformer_weight": "CodeFormer fidelity",
    "face_boost": "Face boost",
    "refine": "Refine swapped face with diffusion",
    "refine_denoise": "Denoising",
    "refine_steps": "Steps",
    "refine_padding": "Crop padding",
    "refine_prompt": "Prompt",
    "refine_negative": "Negative prompt",
    "refine_reswap": "Identity re-swap",
    "refine_extend_down": "Extend mask down",
    "restore_guard": "Likeness guard",
    "refine_texture": "Texture pass",
}

VISAGE_ARG_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "source_type": "Image",
    "source_image": None,
    "source_files": None,
    "face_model": "",
    "source_indexes": "0",
    "target_indexes": "0",
    "sort_order": "large-small",
    "gender": "any",
    "swap_generated": True,
    "swap_init": False,
    "swapper": "hyperswap_1a_256",
    "strength": 1.0,
    "pixel_boost": "512",
    "color_match": "hm-mkl-hm",
    "detector": "retinaface_10g",
    "det_threshold": 0.5,
    "det_size": 640,
    "try_rotations": False,
    "min_face_size": 0,
    "mask_box": True,
    "mask_blur": 0.3,
    "pad_top": 0,
    "pad_right": 0,
    "pad_bottom": 0,
    "pad_left": 0,
    "mask_model": True,
    "mask_occlusion": True,
    "occluder": "xseg_1",
    "mask_region": False,
    "regions": list(VISAGE_DEFAULT_REGIONS),
    "region_dilate": 0,
    "keep_mouth": False,
    "restorer": "gfpgan_1.4",
    "restorer_visibility": 0.75,
    "codeformer_weight": 0.5,
    "face_boost": False,
    "refine": False,
    "refine_denoise": 0.25,
    "refine_steps": 10,
    "refine_padding": 0.5,
    "refine_prompt": "",
    "refine_negative": "",
    "refine_reswap": 0.0,
    "refine_extend_down": 0.0,
    "restore_guard": 0.65,
    "refine_texture": 0.0,
}

VISAGE_ARG_ALIASES = {
    "enable": "enabled",
    "active": "enabled",
    "source": "source_image",
    "model": "swapper",
}


def _as_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on", "y"}:
        return True
    if text in {"0", "false", "no", "off", "n", ""}:
        return False
    return default


def _as_int(value: Any, default: int, *, minimum: int, maximum: int) -> int:
    try:
        parsed = int(round(float(value)))
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def _as_float(value: Any, default: float, *, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def _coerce_choice(value: Any, choices: tuple[Any, ...], default: Any) -> Any:
    if value in choices:
        return value
    text = str(value or "").strip()
    if not text:
        return default
    lowered = text.lower()
    for item in choices:
        if str(item).lower() == lowered:
            return item
    return default


def _coerce_regions(value: Any) -> list[str]:
    if isinstance(value, (list, tuple, set)):
        valid = [str(item).strip() for item in value if str(item).strip() in VISAGE_REGIONS]
        return valid or list(VISAGE_DEFAULT_REGIONS)
    if isinstance(value, str) and value.strip():
        parts = [part.strip() for part in value.split(",") if part.strip() in VISAGE_REGIONS]
        return parts or list(VISAGE_DEFAULT_REGIONS)
    return list(VISAGE_DEFAULT_REGIONS)


def visage_face_model_choices(models_root: str | Path | None = None) -> list[str]:
    """List locally saved Visage face models (`.safetensors`/`.npz`), returning `['']` if absent."""
    candidates: list[Path] = []
    if models_root is not None:
        candidates.append(Path(models_root))
    else:
        for env_key in ("SIMPAI_FORGE_NEO_MODELS_DIR", "FORGE_NEO_MODELS_DIR"):
            raw = os.environ.get(env_key, "").strip()
            if raw:
                candidates.append(Path(raw) / "visage" / "face_models")
        candidates.append(Path.cwd() / "models" / "visage" / "face_models")
    names: list[str] = []
    for folder in candidates:
        if not folder.is_dir():
            continue
        try:
            for item in sorted(folder.iterdir()):
                if item.is_file() and item.suffix.lower() in {".safetensors", ".npz", ".npy"}:
                    if item.stem not in names:
                        names.append(item.stem)
        except OSError:
            continue
    return [""] + names


def visage_arg_dict(raw: Any = None) -> dict[str, Any]:
    merged = dict(VISAGE_ARG_DEFAULTS)
    if isinstance(raw, dict):
        for key, value in raw.items():
            raw_key = str(key or "").strip()
            canonical = VISAGE_ARG_ALIASES.get(raw_key.lower(), raw_key)
            if canonical in merged:
                merged[canonical] = value
    elif isinstance(raw, (list, tuple)):
        for key, value in zip(VISAGE_ARG_KEYS, raw):
            merged[key] = value

    source_files = merged["source_files"]
    if isinstance(source_files, tuple):
        source_files = list(source_files)
    elif source_files is not None and not isinstance(source_files, list):
        source_files = [source_files]

    return {
        "enabled": _as_bool(merged["enabled"], False),
        "source_type": _coerce_choice(merged["source_type"], VISAGE_SOURCE_TYPES, "Image"),
        "source_image": merged["source_image"],
        "source_files": source_files,
        "face_model": str(merged["face_model"] or "").strip(),
        "source_indexes": str(merged["source_indexes"] if merged["source_indexes"] is not None else "0").strip(),
        "target_indexes": str(merged["target_indexes"] if merged["target_indexes"] is not None else "0").strip(),
        "sort_order": _coerce_choice(merged["sort_order"], VISAGE_SORT_ORDERS, "large-small"),
        "gender": _coerce_choice(merged["gender"], VISAGE_GENDERS, "any"),
        "swap_generated": _as_bool(merged["swap_generated"], True),
        "swap_init": _as_bool(merged["swap_init"], False),
        "swapper": _coerce_choice(merged["swapper"], VISAGE_SWAPPERS, "hyperswap_1a_256"),
        "strength": _as_float(merged["strength"], 1.0, minimum=0.0, maximum=1.0),
        "pixel_boost": _coerce_choice(str(merged["pixel_boost"] or "512"), VISAGE_PIXEL_BOOSTS, "512"),
        "color_match": _coerce_choice(merged["color_match"], VISAGE_COLOR_MATCHES, "hm-mkl-hm"),
        "detector": _coerce_choice(merged["detector"], VISAGE_DETECTORS, "retinaface_10g"),
        "det_threshold": _as_float(merged["det_threshold"], 0.5, minimum=0.1, maximum=0.95),
        "det_size": _coerce_choice(merged["det_size"], VISAGE_DET_SIZES, 640),
        "try_rotations": _as_bool(merged["try_rotations"], False),
        "min_face_size": _as_int(merged["min_face_size"], 0, minimum=0, maximum=512),
        "mask_box": _as_bool(merged["mask_box"], True),
        "mask_blur": _as_float(merged["mask_blur"], 0.3, minimum=0.0, maximum=1.0),
        "pad_top": _as_int(merged["pad_top"], 0, minimum=0, maximum=100),
        "pad_right": _as_int(merged["pad_right"], 0, minimum=0, maximum=100),
        "pad_bottom": _as_int(merged["pad_bottom"], 0, minimum=0, maximum=100),
        "pad_left": _as_int(merged["pad_left"], 0, minimum=0, maximum=100),
        "mask_model": _as_bool(merged["mask_model"], True),
        "mask_occlusion": _as_bool(merged["mask_occlusion"], True),
        "occluder": _coerce_choice(merged["occluder"], VISAGE_OCCLUDERS, "xseg_1"),
        "mask_region": _as_bool(merged["mask_region"], False),
        "regions": _coerce_regions(merged["regions"]),
        "region_dilate": _as_int(merged["region_dilate"], 0, minimum=-30, maximum=40),
        "keep_mouth": _as_bool(merged["keep_mouth"], False),
        "restorer": _coerce_choice(merged["restorer"], VISAGE_RESTORERS, "gfpgan_1.4"),
        "restorer_visibility": _as_float(merged["restorer_visibility"], 0.75, minimum=0.0, maximum=1.0),
        "codeformer_weight": _as_float(merged["codeformer_weight"], 0.5, minimum=0.0, maximum=1.0),
        "face_boost": _as_bool(merged["face_boost"], False),
        "refine": _as_bool(merged["refine"], False),
        "refine_denoise": _as_float(merged["refine_denoise"], 0.25, minimum=0.05, maximum=0.7),
        "refine_steps": _as_int(merged["refine_steps"], 10, minimum=0, maximum=60),
        "refine_padding": _as_float(merged["refine_padding"], 0.5, minimum=0.1, maximum=1.5),
        "refine_prompt": str(merged["refine_prompt"] or ""),
        "refine_negative": str(merged["refine_negative"] or ""),
        "refine_reswap": _as_float(merged["refine_reswap"], 0.0, minimum=0.0, maximum=1.0),
        "refine_extend_down": _as_float(merged["refine_extend_down"], 0.0, minimum=0.0, maximum=1.0),
        "restore_guard": _as_float(merged["restore_guard"], 0.65, minimum=0.0, maximum=1.0),
        "refine_texture": _as_float(merged["refine_texture"], 0.0, minimum=0.0, maximum=1.0),
    }


def visage_args_active(raw: Any = None) -> bool:
    return bool(visage_arg_dict(raw)["enabled"])


def visage_arg_list(raw: Any = None) -> list[Any]:
    data = visage_arg_dict(raw)
    return [data[key] for key in VISAGE_ARG_KEYS]


def visage_default_args() -> list[Any]:
    return visage_arg_list()


def visage_script_arg_specs() -> list[dict[str, Any]]:
    data = visage_arg_dict()
    choices_map = {
        "source_type": list(VISAGE_SOURCE_TYPES),
        "sort_order": list(VISAGE_SORT_ORDERS),
        "gender": list(VISAGE_GENDERS),
        "swapper": list(VISAGE_SWAPPERS),
        "pixel_boost": list(VISAGE_PIXEL_BOOSTS),
        "color_match": list(VISAGE_COLOR_MATCHES),
        "detector": list(VISAGE_DETECTORS),
        "det_size": list(VISAGE_DET_SIZES),
        "occluder": list(VISAGE_OCCLUDERS),
        "regions": list(VISAGE_REGIONS),
        "restorer": list(VISAGE_RESTORERS),
    }
    specs: list[dict[str, Any]] = []
    for key in VISAGE_ARG_KEYS:
        specs.append(
            {
                "label": VISAGE_ARG_LABELS[key],
                "value": data[key],
                "minimum": None,
                "maximum": None,
                "step": None,
                "choices": choices_map.get(key),
            }
        )
    return specs


def visage_schema_payload() -> dict[str, Any]:
    return {
        "extension": VISAGE_EXTENSION,
        "script_name": VISAGE_SCRIPT_NAME,
        "arg_keys": list(VISAGE_ARG_KEYS),
        "defaults": visage_arg_dict(),
        "source_defaults": visage_default_args(),
        "source_types": list(VISAGE_SOURCE_TYPES),
        "sort_orders": list(VISAGE_SORT_ORDERS),
        "genders": list(VISAGE_GENDERS),
        "swappers": list(VISAGE_SWAPPERS),
        "pixel_boosts": list(VISAGE_PIXEL_BOOSTS),
        "color_matches": list(VISAGE_COLOR_MATCHES),
        "detectors": list(VISAGE_DETECTORS),
        "det_sizes": list(VISAGE_DET_SIZES),
        "occluders": list(VISAGE_OCCLUDERS),
        "regions": list(VISAGE_REGIONS),
        "restorers": list(VISAGE_RESTORERS),
    }


__all__ = [
    "VISAGE_ARG_ALIASES",
    "VISAGE_ARG_DEFAULTS",
    "VISAGE_ARG_KEYS",
    "VISAGE_ARG_LABELS",
    "VISAGE_COLOR_MATCHES",
    "VISAGE_DEFAULT_REGIONS",
    "VISAGE_DETECTORS",
    "VISAGE_DET_SIZES",
    "VISAGE_EXTENSION",
    "VISAGE_GENDERS",
    "VISAGE_OCCLUDERS",
    "VISAGE_PIXEL_BOOSTS",
    "VISAGE_REGIONS",
    "VISAGE_RESTORERS",
    "VISAGE_SCRIPT_NAME",
    "VISAGE_SORT_ORDERS",
    "VISAGE_SOURCE_TYPES",
    "VISAGE_SWAPPERS",
    "visage_arg_dict",
    "visage_arg_list",
    "visage_args_active",
    "visage_default_args",
    "visage_face_model_choices",
    "visage_schema_payload",
    "visage_script_arg_specs",
]
