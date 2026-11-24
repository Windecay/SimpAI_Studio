"""Compatibility helpers for NegPiP Forge Neo (flyfront/sd-forge-negpip)."""

from __future__ import annotations

from typing import Any


NEGPIP_EXTENSION = "sd-forge-negpip"
NEGPIP_SCRIPT_NAME = "NegPiP"

# UI/Studio keys include `enabled` so users explicitly opt in to NegPiP in Gradio 6.
# Upstream `scripts/negpip.py::process(self, p, v_scaling, v_strength)` takes 2 args.
NEGPIP_ARG_KEYS = (
    "enabled",
    "v_scaling",
    "v_strength",
)

NEGPIP_ARG_LABELS = {
    "enabled": "Enable NegPiP",
    "v_scaling": "NegPiP V-Scaling (Krea 2 / MOSS-Image)",
    "v_strength": "V-Scaling Strength",
}

NEGPIP_ARG_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "v_scaling": False,
    "v_strength": 1.0,
}

NEGPIP_ARG_ALIASES = {
    "enable": "enabled",
    "active": "enabled",
    "strength": "v_strength",
    "vscaling": "v_scaling",
    "v_scale": "v_scaling",
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


def _as_float(value: Any, default: float, *, minimum: float = 0.0, maximum: float = 2.0) -> float:
    try:
        parsed = float(value)
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def negpip_arg_dict(raw: Any = None) -> dict[str, Any]:
    merged = dict(NEGPIP_ARG_DEFAULTS)
    if isinstance(raw, dict):
        has_explicit_enabled = any(k in raw for k in ("enabled", "enable", "active"))
        for key, value in raw.items():
            canonical = NEGPIP_ARG_ALIASES.get(str(key or "").strip().lower(), str(key or "").strip())
            if canonical in merged:
                merged[canonical] = value
        if not has_explicit_enabled and ("v_scaling" in raw or "v_strength" in raw or "strength" in raw):
            merged["enabled"] = True
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
        if len(items) == 2:
            # Exact upstream 2-arg API format: [v_scaling, v_strength]
            merged["enabled"] = True
            merged["v_scaling"] = items[0]
            merged["v_strength"] = items[1]
        elif len(items) >= 3:
            merged["enabled"] = items[0]
            merged["v_scaling"] = items[1]
            merged["v_strength"] = items[2]
        elif len(items) == 1:
            merged["enabled"] = items[0]

    return {
        "enabled": _as_bool(merged["enabled"], False),
        "v_scaling": _as_bool(merged["v_scaling"], False),
        "v_strength": _as_float(merged["v_strength"], 1.0, minimum=0.0, maximum=2.0),
    }


def negpip_args_active(raw: Any = None) -> bool:
    return bool(negpip_arg_dict(raw)["enabled"])


def negpip_arg_list(raw: Any = None) -> list[Any]:
    """Return UI/normalized 3-element list `[enabled, v_scaling, v_strength]`."""
    data = negpip_arg_dict(raw)
    return [data["enabled"], data["v_scaling"], data["v_strength"]]


def negpip_source_args(raw: Any = None) -> list[Any]:
    """Return exact 2-element upstream list `[v_scaling, v_strength]` for `scripts/negpip.py`."""
    data = negpip_arg_dict(raw)
    return [bool(data["v_scaling"]), float(data["v_strength"])]


def negpip_default_args() -> list[Any]:
    return negpip_source_args()


def negpip_script_arg_specs() -> list[dict[str, Any]]:
    return [
        {"label": NEGPIP_ARG_LABELS["v_scaling"], "value": False, "minimum": None, "maximum": None, "step": None, "choices": None},
        {"label": NEGPIP_ARG_LABELS["v_strength"], "value": 1.0, "minimum": 0.0, "maximum": 2.0, "step": 0.05, "choices": None},
    ]


def negpip_schema_payload() -> dict[str, Any]:
    return {
        "extension": NEGPIP_EXTENSION,
        "script_name": NEGPIP_SCRIPT_NAME,
        "arg_keys": list(NEGPIP_ARG_KEYS),
        "defaults": negpip_arg_dict(),
        "source_defaults": negpip_default_args(),
    }


__all__ = [
    "NEGPIP_ARG_ALIASES",
    "NEGPIP_ARG_DEFAULTS",
    "NEGPIP_ARG_KEYS",
    "NEGPIP_ARG_LABELS",
    "NEGPIP_EXTENSION",
    "NEGPIP_SCRIPT_NAME",
    "negpip_arg_dict",
    "negpip_arg_list",
    "negpip_args_active",
    "negpip_default_args",
    "negpip_schema_payload",
    "negpip_script_arg_specs",
    "negpip_source_args",
]
