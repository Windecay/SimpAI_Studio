"""Compatibility helpers for Ultimate SD Upscale (ultimate-upscale-for-automatic1111)."""

from __future__ import annotations

from typing import Any


ULTIMATE_SD_UPSCALE_EXTENSION = "ultimate-upscale-for-automatic1111"
ULTIMATE_SD_UPSCALE_SCRIPT_NAME = "Ultimate SD upscale"

ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES = (
    "From img2img2 settings",
    "Custom size",
    "Scale from image size",
)
ULTIMATE_SD_UPSCALE_REDRAW_MODES = (
    "Linear",
    "Chess",
    "None",
)
ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES = (
    "None",
    "Band pass",
    "Half tile offset pass",
    "Half tile offset pass + intersections",
)

# 17 real parameters in upstream scripts/ultimate-upscale.py::Script.run()
# (upstream index 0 is a dummy `gr.HTML` info component passed as `None`).
ULTIMATE_SD_UPSCALE_ARG_KEYS = (
    "tile_width",
    "tile_height",
    "mask_blur",
    "padding",
    "seams_fix_width",
    "seams_fix_denoise",
    "seams_fix_padding",
    "upscaler_index",
    "save_upscaled_image",
    "redraw_mode",
    "save_seams_fix_image",
    "seams_fix_mask_blur",
    "seams_fix_type",
    "target_size_type",
    "custom_width",
    "custom_height",
    "custom_scale",
)

ULTIMATE_SD_UPSCALE_ARG_LABELS = {
    "tile_width": "Tile width",
    "tile_height": "Tile height",
    "mask_blur": "Mask blur",
    "padding": "Padding",
    "seams_fix_width": "Seams fix width",
    "seams_fix_denoise": "Seams fix denoise",
    "seams_fix_padding": "Seams fix padding",
    "upscaler_index": "Upscaler",
    "save_upscaled_image": "Save upscaled image",
    "redraw_mode": "Redraw type",
    "save_seams_fix_image": "Save seams fix image",
    "seams_fix_mask_blur": "Seams fix mask blur",
    "seams_fix_type": "Seams fix type",
    "target_size_type": "Target size type",
    "custom_width": "Custom width",
    "custom_height": "Custom height",
    "custom_scale": "Scale",
}

ULTIMATE_SD_UPSCALE_ARG_DEFAULTS: dict[str, Any] = {
    "tile_width": 512,
    "tile_height": 0,
    "mask_blur": 8,
    "padding": 32,
    "seams_fix_width": 64,
    "seams_fix_denoise": 0.35,
    "seams_fix_padding": 16,
    "upscaler_index": "None",
    "save_upscaled_image": True,
    "redraw_mode": "Linear",
    "save_seams_fix_image": False,
    "seams_fix_mask_blur": 4,
    "seams_fix_type": "None",
    "target_size_type": "From img2img2 settings",
    "custom_width": 2048,
    "custom_height": 2048,
    "custom_scale": 2.0,
}

ULTIMATE_SD_UPSCALE_ARG_ALIASES = {
    "upscaler": "upscaler_index",
    "upscaler_name": "upscaler_index",
    "redraw_type": "redraw_mode",
    "type": "redraw_mode",
    "scale": "custom_scale",
    "width": "custom_width",
    "height": "custom_height",
    "save_upscaled": "save_upscaled_image",
    "save_seams_fix": "save_seams_fix_image",
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


def _as_int(value: Any, default: int, *, minimum: int | None = None, maximum: int | None = None) -> int:
    try:
        parsed = int(round(float(value)))
    except Exception:
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _as_float(value: Any, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = default
    if minimum is not None:
        parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


def _choice_label(value: Any, choices: tuple[str, ...], default: str) -> str:
    if isinstance(value, int) and not isinstance(value, bool):
        if 0 <= value < len(choices):
            return choices[value]
        return default
    text = str(value or "").strip()
    if not text:
        return default
    try:
        idx = int(text)
    except Exception:
        idx = -1
    if 0 <= idx < len(choices):
        return choices[idx]
    lowered = text.lower()
    for item in choices:
        if item.lower() == lowered:
            return item
    if lowered in {"from img2img settings", "img2img"} and choices is ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES:
        return choices[0]
    return default


def _choice_index(value: Any, choices: tuple[str, ...], default_index: int = 0) -> int:
    label = _choice_label(value, choices, choices[default_index])
    try:
        return choices.index(label)
    except ValueError:
        return default_index


def _coerce_upscaler(value: Any) -> int | str:
    if isinstance(value, int) and not isinstance(value, bool):
        return max(0, value)
    text = str(value or "").strip()
    if not text:
        return "None"
    try:
        idx = int(text)
    except Exception:
        return text
    return max(0, idx)


def ultimate_sd_upscale_arg_dict(raw: Any = None) -> dict[str, Any]:
    merged = dict(ULTIMATE_SD_UPSCALE_ARG_DEFAULTS)
    if isinstance(raw, dict):
        for key, value in raw.items():
            canonical = ULTIMATE_SD_UPSCALE_ARG_ALIASES.get(str(key or "").strip().lower(), str(key or "").strip())
            if canonical in merged:
                merged[canonical] = value
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
        if len(items) == len(ULTIMATE_SD_UPSCALE_ARG_KEYS) + 1:
            # Upstream 18-arg form: [None, tile_width, ...]
            items = items[1:]
        for key, value in zip(ULTIMATE_SD_UPSCALE_ARG_KEYS, items):
            merged[key] = value

    return {
        "tile_width": _as_int(merged["tile_width"], 512, minimum=0, maximum=2048),
        "tile_height": _as_int(merged["tile_height"], 0, minimum=0, maximum=2048),
        "mask_blur": _as_int(merged["mask_blur"], 8, minimum=0, maximum=64),
        "padding": _as_int(merged["padding"], 32, minimum=0, maximum=128),
        "seams_fix_width": _as_int(merged["seams_fix_width"], 64, minimum=0, maximum=128),
        "seams_fix_denoise": _as_float(merged["seams_fix_denoise"], 0.35, minimum=0.0, maximum=1.0),
        "seams_fix_padding": _as_int(merged["seams_fix_padding"], 16, minimum=0, maximum=128),
        "upscaler_index": _coerce_upscaler(merged["upscaler_index"]),
        "save_upscaled_image": _as_bool(merged["save_upscaled_image"], True),
        "redraw_mode": _choice_label(merged["redraw_mode"], ULTIMATE_SD_UPSCALE_REDRAW_MODES, "Linear"),
        "save_seams_fix_image": _as_bool(merged["save_seams_fix_image"], False),
        "seams_fix_mask_blur": _as_int(merged["seams_fix_mask_blur"], 4, minimum=0, maximum=64),
        "seams_fix_type": _choice_label(merged["seams_fix_type"], ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES, "None"),
        "target_size_type": _choice_label(
            merged["target_size_type"], ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES, "From img2img2 settings"
        ),
        "custom_width": _as_int(merged["custom_width"], 2048, minimum=64, maximum=8192),
        "custom_height": _as_int(merged["custom_height"], 2048, minimum=64, maximum=8192),
        "custom_scale": _as_float(merged["custom_scale"], 2.0, minimum=1.0, maximum=16.0),
    }


def ultimate_sd_upscale_arg_list(raw: Any = None) -> list[Any]:
    """Return the exact 18-element positional tuple expected by upstream `Script.run`."""
    data = ultimate_sd_upscale_arg_dict(raw)
    return [
        None,
        data["tile_width"],
        data["tile_height"],
        data["mask_blur"],
        data["padding"],
        data["seams_fix_width"],
        data["seams_fix_denoise"],
        data["seams_fix_padding"],
        data["upscaler_index"],
        data["save_upscaled_image"],
        _choice_index(data["redraw_mode"], ULTIMATE_SD_UPSCALE_REDRAW_MODES, 0),
        data["save_seams_fix_image"],
        data["seams_fix_mask_blur"],
        _choice_index(data["seams_fix_type"], ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES, 0),
        _choice_index(data["target_size_type"], ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES, 0),
        data["custom_width"],
        data["custom_height"],
        data["custom_scale"],
    ]


def ultimate_sd_upscale_default_args() -> list[Any]:
    return ultimate_sd_upscale_arg_list()


def ultimate_sd_upscale_script_arg_specs() -> list[dict[str, Any]]:
    data = ultimate_sd_upscale_arg_dict()
    specs: list[dict[str, Any]] = [
        {"label": "Info", "value": None, "minimum": None, "maximum": None, "step": None, "choices": None}
    ]
    choices_map = {
        "redraw_mode": list(ULTIMATE_SD_UPSCALE_REDRAW_MODES),
        "seams_fix_type": list(ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES),
        "target_size_type": list(ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES),
    }
    bounds_map = {
        "tile_width": (0, 2048, 64),
        "tile_height": (0, 2048, 64),
        "mask_blur": (0, 64, 1),
        "padding": (0, 128, 8),
        "seams_fix_width": (0, 128, 8),
        "seams_fix_denoise": (0.0, 1.0, 0.01),
        "seams_fix_padding": (0, 128, 8),
        "seams_fix_mask_blur": (0, 64, 1),
        "custom_width": (64, 8192, 64),
        "custom_height": (64, 8192, 64),
        "custom_scale": (1.0, 16.0, 0.01),
    }
    for key in ULTIMATE_SD_UPSCALE_ARG_KEYS:
        minimum, maximum, step = bounds_map.get(key, (None, None, None))
        specs.append(
            {
                "label": ULTIMATE_SD_UPSCALE_ARG_LABELS[key],
                "value": data[key],
                "minimum": minimum,
                "maximum": maximum,
                "step": step,
                "choices": choices_map.get(key),
            }
        )
    return specs


def ultimate_sd_upscale_schema_payload() -> dict[str, Any]:
    return {
        "extension": ULTIMATE_SD_UPSCALE_EXTENSION,
        "script_name": ULTIMATE_SD_UPSCALE_SCRIPT_NAME,
        "img2img_only": True,
        "arg_keys": list(ULTIMATE_SD_UPSCALE_ARG_KEYS),
        "defaults": ultimate_sd_upscale_arg_dict(),
        "source_defaults": ultimate_sd_upscale_default_args(),
        "target_size_types": list(ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES),
        "redraw_modes": list(ULTIMATE_SD_UPSCALE_REDRAW_MODES),
        "seams_fix_types": list(ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES),
    }


__all__ = [
    "ULTIMATE_SD_UPSCALE_ARG_ALIASES",
    "ULTIMATE_SD_UPSCALE_ARG_DEFAULTS",
    "ULTIMATE_SD_UPSCALE_ARG_KEYS",
    "ULTIMATE_SD_UPSCALE_ARG_LABELS",
    "ULTIMATE_SD_UPSCALE_EXTENSION",
    "ULTIMATE_SD_UPSCALE_REDRAW_MODES",
    "ULTIMATE_SD_UPSCALE_SCRIPT_NAME",
    "ULTIMATE_SD_UPSCALE_SEAMS_FIX_TYPES",
    "ULTIMATE_SD_UPSCALE_TARGET_SIZE_TYPES",
    "ultimate_sd_upscale_arg_dict",
    "ultimate_sd_upscale_arg_list",
    "ultimate_sd_upscale_default_args",
    "ultimate_sd_upscale_schema_payload",
    "ultimate_sd_upscale_script_arg_specs",
]
