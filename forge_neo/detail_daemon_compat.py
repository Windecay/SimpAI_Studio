"""Compatibility helpers for Detail Daemon (sd-webui-detail-daemon)."""

from __future__ import annotations

from typing import Any


DETAIL_DAEMON_EXTENSION = "sd-webui-detail-daemon"
DETAIL_DAEMON_SCRIPT_NAME = "Detail Daemon"

DETAIL_DAEMON_MODES = ("both", "cond", "uncond")
DETAIL_DAEMON_TAB_PARAM_COUNT = 12
DETAIL_DAEMON_UI_SLOTS = 3
DETAIL_DAEMON_MAX_SLOTS = 6

# Exact 12 per-daemon parameters in upstream scripts/detail_daemon.py::Script.ui()
DETAIL_DAEMON_SLOT_KEYS = (
    "active",
    "hires",
    "mode",
    "start",
    "end",
    "bias",
    "amount",
    "exponent",
    "start_offset",
    "end_offset",
    "fade",
    "smooth",
)

DETAIL_DAEMON_SLOT_LABELS = {
    "active": "Active",
    "hires": "Hires Pass",
    "mode": "Mode",
    "start": "Start",
    "end": "End",
    "bias": "Bias",
    "amount": "Detail Amount",
    "exponent": "Exponent",
    "start_offset": "Start Offset",
    "end_offset": "End Offset",
    "fade": "Fade",
    "smooth": "Smooth",
}

DETAIL_DAEMON_SLOT_DEFAULTS: dict[str, Any] = {
    "active": False,
    "hires": False,
    "mode": "both",
    "start": 0.2,
    "end": 0.8,
    "bias": 0.5,
    "amount": 0.10,
    "exponent": 1.0,
    "start_offset": 0.0,
    "end_offset": 0.0,
    "fade": 0.0,
    "smooth": True,
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


def _coerce_mode(value: Any) -> str:
    text = str(value or "").strip().lower()
    if text in DETAIL_DAEMON_MODES:
        return text
    return "both"


def _coerce_slot(raw: Any, *, default_active: bool = False) -> dict[str, Any]:
    merged = dict(DETAIL_DAEMON_SLOT_DEFAULTS)
    merged["active"] = default_active
    if isinstance(raw, dict):
        for key in DETAIL_DAEMON_SLOT_KEYS:
            if key in raw:
                merged[key] = raw[key]
        if "detail_amount" in raw and "amount" not in raw:
            merged["amount"] = raw["detail_amount"]
        if "hires_pass" in raw and "hires" not in raw:
            merged["hires"] = raw["hires_pass"]
    elif isinstance(raw, (list, tuple)):
        for key, value in zip(DETAIL_DAEMON_SLOT_KEYS, raw):
            merged[key] = value
    return {
        "active": _as_bool(merged["active"], default_active),
        "hires": _as_bool(merged["hires"], False),
        "mode": _coerce_mode(merged["mode"]),
        "start": _as_float(merged["start"], 0.2, minimum=0.0, maximum=1.0),
        "end": _as_float(merged["end"], 0.8, minimum=0.0, maximum=1.0),
        "bias": _as_float(merged["bias"], 0.5, minimum=0.0, maximum=1.0),
        "amount": _as_float(merged["amount"], 0.10, minimum=-5.0, maximum=5.0),
        "exponent": _as_float(merged["exponent"], 1.0, minimum=0.0, maximum=10.0),
        "start_offset": _as_float(merged["start_offset"], 0.0, minimum=-5.0, maximum=5.0),
        "end_offset": _as_float(merged["end_offset"], 0.0, minimum=-5.0, maximum=5.0),
        "fade": _as_float(merged["fade"], 0.0, minimum=0.0, maximum=1.0),
        "smooth": _as_bool(merged["smooth"], True),
    }


def detail_daemon_arg_dict(raw: Any = None, *, slot_count: int = DETAIL_DAEMON_UI_SLOTS) -> dict[str, Any]:
    """Normalize Detail Daemon payload into `{enabled: bool, daemons: [dict, ...]}`."""
    enabled = False
    daemons: list[dict[str, Any]] = []
    if isinstance(raw, dict):
        enabled = _as_bool(raw.get("enabled", raw.get("enable")), False)
        raw_daemons = raw.get("daemons") or raw.get("slots")
        if isinstance(raw_daemons, (list, tuple)):
            for item in raw_daemons[:DETAIL_DAEMON_MAX_SLOTS]:
                daemons.append(_coerce_slot(item))
        elif any(key in raw for key in DETAIL_DAEMON_SLOT_KEYS):
            daemons.append(_coerce_slot(raw, default_active=enabled))
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
        if items:
            enabled = _as_bool(items[0], False)
            rest = items[1:]
            num = min(DETAIL_DAEMON_MAX_SLOTS, len(rest) // DETAIL_DAEMON_TAB_PARAM_COUNT)
            for idx in range(num):
                chunk = rest[idx * DETAIL_DAEMON_TAB_PARAM_COUNT : (idx + 1) * DETAIL_DAEMON_TAB_PARAM_COUNT]
                daemons.append(_coerce_slot(chunk))

    target_slots = max(slot_count, len(daemons))
    while len(daemons) < target_slots:
        # When no slots were provided at all, slot 0 defaults active=True in UI defaults
        # while enabled=False keeps the extension inactive until the user enables it.
        default_active = (len(daemons) == 0 and raw is None)
        daemons.append(_coerce_slot(None, default_active=default_active))

    return {"enabled": enabled, "daemons": daemons}


def detail_daemon_args_active(raw: Any = None) -> bool:
    data = detail_daemon_arg_dict(raw)
    if not data["enabled"]:
        return False
    return any(bool(slot.get("active")) for slot in data["daemons"])


def detail_daemon_arg_list(raw: Any = None, *, slot_count: int = DETAIL_DAEMON_UI_SLOTS) -> list[Any]:
    """Return exact positional args `[enabled, *(active, hires, mode, start, end, bias, amount, exponent, start_offset, end_offset, fade, smooth) * N]`."""
    data = detail_daemon_arg_dict(raw, slot_count=slot_count)
    out: list[Any] = [bool(data["enabled"])]
    for slot in data["daemons"]:
        for key in DETAIL_DAEMON_SLOT_KEYS:
            out.append(slot[key])
    return out


def detail_daemon_default_args(*, slot_count: int = DETAIL_DAEMON_UI_SLOTS) -> list[Any]:
    return detail_daemon_arg_list(None, slot_count=slot_count)


def detail_daemon_script_arg_specs(*, slot_count: int = DETAIL_DAEMON_UI_SLOTS) -> list[dict[str, Any]]:
    data = detail_daemon_arg_dict(None, slot_count=slot_count)
    specs: list[dict[str, Any]] = [
        {"label": "Enable Detail Daemon", "value": False, "minimum": None, "maximum": None, "step": None, "choices": None}
    ]
    bounds = {
        "start": (0.0, 1.0, 0.01),
        "end": (0.0, 1.0, 0.01),
        "bias": (0.0, 1.0, 0.01),
        "amount": (-1.0, 1.0, 0.01),
        "exponent": (0.0, 10.0, 0.05),
        "start_offset": (-1.0, 1.0, 0.01),
        "end_offset": (-1.0, 1.0, 0.01),
        "fade": (0.0, 1.0, 0.05),
    }
    for idx, slot in enumerate(data["daemons"], start=1):
        for key in DETAIL_DAEMON_SLOT_KEYS:
            minimum, maximum, step = bounds.get(key, (None, None, None))
            specs.append(
                {
                    "label": f"Daemon {idx} {DETAIL_DAEMON_SLOT_LABELS[key]}",
                    "value": slot[key],
                    "minimum": minimum,
                    "maximum": maximum,
                    "step": step,
                    "choices": list(DETAIL_DAEMON_MODES) if key == "mode" else None,
                }
            )
    return specs


def detail_daemon_schema_payload() -> dict[str, Any]:
    return {
        "extension": DETAIL_DAEMON_EXTENSION,
        "script_name": DETAIL_DAEMON_SCRIPT_NAME,
        "tab_param_count": DETAIL_DAEMON_TAB_PARAM_COUNT,
        "ui_slots": DETAIL_DAEMON_UI_SLOTS,
        "max_slots": DETAIL_DAEMON_MAX_SLOTS,
        "slot_keys": list(DETAIL_DAEMON_SLOT_KEYS),
        "modes": list(DETAIL_DAEMON_MODES),
        "defaults": detail_daemon_arg_dict(),
        "source_defaults": detail_daemon_default_args(),
    }


__all__ = [
    "DETAIL_DAEMON_EXTENSION",
    "DETAIL_DAEMON_MAX_SLOTS",
    "DETAIL_DAEMON_MODES",
    "DETAIL_DAEMON_SCRIPT_NAME",
    "DETAIL_DAEMON_SLOT_DEFAULTS",
    "DETAIL_DAEMON_SLOT_KEYS",
    "DETAIL_DAEMON_SLOT_LABELS",
    "DETAIL_DAEMON_TAB_PARAM_COUNT",
    "DETAIL_DAEMON_UI_SLOTS",
    "detail_daemon_arg_dict",
    "detail_daemon_arg_list",
    "detail_daemon_args_active",
    "detail_daemon_default_args",
    "detail_daemon_schema_payload",
    "detail_daemon_script_arg_specs",
]
