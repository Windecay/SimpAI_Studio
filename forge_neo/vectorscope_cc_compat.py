"""Compatibility helpers for Vectorscope CC (Haoming02/sd-webui-vectorscope-cc)."""

from __future__ import annotations

from typing import Any


VECTORSCOPE_CC_EXTENSION = "sd-webui-vectorscope-cc"
VECTORSCOPE_CC_SCRIPT_NAME = "Vectorscope CC"

VECTORSCOPE_CC_METHODS = (
    "Straight",
    "Straight Abs.",
    "Cross",
    "Cross Abs.",
    "Ones",
    "N.Random",
    "U.Random",
    "Multi-Res",
    "Multi-Res Abs.",
)
VECTORSCOPE_CC_SCALINGS = (
    "Flat",
    "Cos",
    "Sin",
    "1 - Cos",
    "1 - Sin",
)

# Exact 13 positional args of upstream scripts/cc.py::Script.process()
VECTORSCOPE_CC_ARG_KEYS = (
    "enable",
    "latent",
    "bri",
    "con",
    "sat",
    "r",
    "g",
    "b",
    "doHR",
    "doAD",
    "doRN",
    "method",
    "scaling",
)

VECTORSCOPE_CC_ARG_LABELS = {
    "enable": "Enable",
    "latent": "Alt",
    "bri": "Brightness",
    "con": "Contrast",
    "sat": "Saturation",
    "r": "R",
    "g": "G",
    "b": "B",
    "doHR": "Process Hires. fix",
    "doAD": "Process ADetailer",
    "doRN": "Randomize using Seed",
    "method": "Noise Settings",
    "scaling": "Scaling Settings",
}

VECTORSCOPE_CC_ARG_DEFAULTS: dict[str, Any] = {
    "enable": False,
    "latent": False,
    "bri": 0.0,
    "con": 0.0,
    "sat": 1.0,
    "r": 0.0,
    "g": 0.0,
    "b": 0.0,
    "doHR": False,
    "doAD": False,
    "doRN": False,
    "method": "Straight Abs.",
    "scaling": "Flat",
}

VECTORSCOPE_CC_ARG_ALIASES = {
    "enabled": "enable",
    "alt": "latent",
    "brightness": "bri",
    "contrast": "con",
    "saturation": "sat",
    "red": "r",
    "green": "g",
    "blue": "b",
    "dohr": "doHR",
    "do_hr": "doHR",
    "process_hr": "doHR",
    "doad": "doAD",
    "do_ad": "doAD",
    "process_ad": "doAD",
    "dorn": "doRN",
    "do_rn": "doRN",
    "randomize": "doRN",
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


def _as_float(value: Any, default: float, *, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def _coerce_choice(value: Any, choices: tuple[str, ...], default: str) -> str:
    text = str(value or "").strip()
    if not text:
        return default
    lowered = text.lower()
    for item in choices:
        if item.lower() == lowered:
            return item
    return default


def vectorscope_cc_arg_dict(raw: Any = None) -> dict[str, Any]:
    merged = dict(VECTORSCOPE_CC_ARG_DEFAULTS)
    if isinstance(raw, dict):
        for key, value in raw.items():
            raw_key = str(key or "").strip()
            canonical = VECTORSCOPE_CC_ARG_ALIASES.get(raw_key.lower(), raw_key)
            if canonical in merged:
                merged[canonical] = value
    elif isinstance(raw, (list, tuple)):
        for key, value in zip(VECTORSCOPE_CC_ARG_KEYS, raw):
            merged[key] = value

    return {
        "enable": _as_bool(merged["enable"], False),
        "latent": _as_bool(merged["latent"], False),
        "bri": _as_float(merged["bri"], 0.0, minimum=-5.0, maximum=5.0),
        "con": _as_float(merged["con"], 0.0, minimum=-5.0, maximum=5.0),
        "sat": _as_float(merged["sat"], 1.0, minimum=0.25, maximum=1.75),
        "r": _as_float(merged["r"], 0.0, minimum=-4.0, maximum=4.0),
        "g": _as_float(merged["g"], 0.0, minimum=-4.0, maximum=4.0),
        "b": _as_float(merged["b"], 0.0, minimum=-4.0, maximum=4.0),
        "doHR": _as_bool(merged["doHR"], False),
        "doAD": _as_bool(merged["doAD"], False),
        "doRN": _as_bool(merged["doRN"], False),
        "method": _coerce_choice(merged["method"], VECTORSCOPE_CC_METHODS, "Straight Abs."),
        "scaling": _coerce_choice(merged["scaling"], VECTORSCOPE_CC_SCALINGS, "Flat"),
    }


def vectorscope_cc_args_active(raw: Any = None) -> bool:
    return bool(vectorscope_cc_arg_dict(raw)["enable"])


def vectorscope_cc_arg_list(raw: Any = None) -> list[Any]:
    data = vectorscope_cc_arg_dict(raw)
    return [data[key] for key in VECTORSCOPE_CC_ARG_KEYS]


def vectorscope_cc_default_args() -> list[Any]:
    return vectorscope_cc_arg_list()


def vectorscope_cc_script_arg_specs() -> list[dict[str, Any]]:
    data = vectorscope_cc_arg_dict()
    bounds = {
        "bri": (-5.0, 5.0, 0.05),
        "con": (-5.0, 5.0, 0.05),
        "sat": (0.25, 1.75, 0.05),
        "r": (-4.0, 4.0, 0.05),
        "g": (-4.0, 4.0, 0.05),
        "b": (-4.0, 4.0, 0.05),
    }
    choices = {
        "method": list(VECTORSCOPE_CC_METHODS),
        "scaling": list(VECTORSCOPE_CC_SCALINGS),
    }
    specs: list[dict[str, Any]] = []
    for key in VECTORSCOPE_CC_ARG_KEYS:
        minimum, maximum, step = bounds.get(key, (None, None, None))
        specs.append(
            {
                "label": VECTORSCOPE_CC_ARG_LABELS[key],
                "value": data[key],
                "minimum": minimum,
                "maximum": maximum,
                "step": step,
                "choices": choices.get(key),
            }
        )
    return specs


def vectorscope_cc_schema_payload() -> dict[str, Any]:
    return {
        "extension": VECTORSCOPE_CC_EXTENSION,
        "script_name": VECTORSCOPE_CC_SCRIPT_NAME,
        "arg_keys": list(VECTORSCOPE_CC_ARG_KEYS),
        "defaults": vectorscope_cc_arg_dict(),
        "source_defaults": vectorscope_cc_default_args(),
        "methods": list(VECTORSCOPE_CC_METHODS),
        "scalings": list(VECTORSCOPE_CC_SCALINGS),
    }


__all__ = [
    "VECTORSCOPE_CC_ARG_ALIASES",
    "VECTORSCOPE_CC_ARG_DEFAULTS",
    "VECTORSCOPE_CC_ARG_KEYS",
    "VECTORSCOPE_CC_ARG_LABELS",
    "VECTORSCOPE_CC_EXTENSION",
    "VECTORSCOPE_CC_METHODS",
    "VECTORSCOPE_CC_SCALINGS",
    "VECTORSCOPE_CC_SCRIPT_NAME",
    "vectorscope_cc_arg_dict",
    "vectorscope_cc_arg_list",
    "vectorscope_cc_args_active",
    "vectorscope_cc_default_args",
    "vectorscope_cc_schema_payload",
    "vectorscope_cc_script_arg_specs",
]
