"""Compatibility helpers for LoRA Block Weight (ForgeNeo / Anima)."""

from __future__ import annotations

from typing import Any


LORA_BLOCK_WEIGHT_EXTENSION = "sd-webui-lora-block-weight-forgeneo-anima"
LORA_BLOCK_WEIGHT_SCRIPT_NAME = "LoRA Block Weight"

LORA_BLOCK_WEIGHT_XYZ_MODES = (
    "Disable",
    "XYZ plot",
    "Effective Block Analyzer",
)
LORA_BLOCK_WEIGHT_ATYPES = (
    "none",
    "Block ID",
    "values",
    "seed",
    "Original Weights",
    "elements",
)
LORA_BLOCK_WEIGHT_DIFFCOLS = ("black", "white", "script")

LORA_BLOCK_WEIGHT_DEFAULT_PRESETS = """NONE:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
ALL:1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
INS:1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0
IND:1,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0
INALL:1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0
MIDD:1,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0
OUTD:1,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0
OUTS:1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1
OUTALL:1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1
ALL0.5:0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5
ANIMA_ALL:1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1
ANIMA_EARLY:1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
ANIMA_MID:0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0
ANIMA_LATE:0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1"""

# Exact 18 positional args of upstream scripts/lora_block_weight.py::Script.process()
# NOTE: `useblocks` (Active bool) is at index 1, NOT index 0!
LORA_BLOCK_WEIGHT_ARG_KEYS = (
    "loraratios",
    "useblocks",
    "xyzsetting",
    "xtype",
    "xmen",
    "ytype",
    "ymen",
    "ztype",
    "zmen",
    "exmen",
    "eymen",
    "ecount",
    "diffcol",
    "thresh",
    "revxy",
    "elemental",
    "elemsets",
    "debug",
)

LORA_BLOCK_WEIGHT_ARG_LABELS = {
    "loraratios": "Weight Presets",
    "useblocks": "Active",
    "xyzsetting": "XYZ / Analyzer Mode",
    "xtype": "X Types",
    "xmen": "X Values",
    "ytype": "Y Types",
    "ymen": "Y Values",
    "ztype": "Z Types",
    "zmen": "Z Values",
    "exmen": "Range",
    "eymen": "Blocks",
    "ecount": "Number of seed",
    "diffcol": "Diff image color",
    "thresh": "Difference threshold",
    "revxy": "Change X-Y",
    "elemental": "Elemental Weights",
    "elemsets": "Print change",
    "debug": "Debug",
}

LORA_BLOCK_WEIGHT_ARG_DEFAULTS: dict[str, Any] = {
    "loraratios": LORA_BLOCK_WEIGHT_DEFAULT_PRESETS,
    "useblocks": False,
    "xyzsetting": "Disable",
    "xtype": "values",
    "xmen": "0,0.25,0.5,0.75,1",
    "ytype": "Block ID",
    "ymen": "IN05-OUT05",
    "ztype": "none",
    "zmen": "",
    "exmen": "0.5,1",
    "eymen": "BASE,IN00,IN01,IN02,IN03,IN04,IN05,IN06,IN07,IN08,IN09,IN10,IN11,M00,OUT00,OUT01,OUT02,OUT03,OUT04,OUT05,OUT06,OUT07,OUT08,OUT09,OUT10,OUT11",
    "ecount": 1,
    "diffcol": "black",
    "thresh": "20",
    "revxy": False,
    "elemental": "",
    "elemsets": False,
    "debug": False,
}

LORA_BLOCK_WEIGHT_ARG_ALIASES = {
    "enabled": "useblocks",
    "enable": "useblocks",
    "active": "useblocks",
    "presets": "loraratios",
    "weight_presets": "loraratios",
    "mode": "xyzsetting",
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


def _as_int(value: Any, default: int, *, minimum: int = 1, maximum: int = 100) -> int:
    try:
        parsed = int(round(float(value)))
    except Exception:
        parsed = default
    return max(minimum, min(maximum, parsed))


def _coerce_choice(value: Any, choices: tuple[str, ...], default: str) -> str:
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
    return default


def _xyz_mode_index(value: Any) -> int:
    label = _coerce_choice(value, LORA_BLOCK_WEIGHT_XYZ_MODES, "Disable")
    try:
        return LORA_BLOCK_WEIGHT_XYZ_MODES.index(label)
    except ValueError:
        return 0


def lora_block_weight_arg_dict(raw: Any = None) -> dict[str, Any]:
    merged = dict(LORA_BLOCK_WEIGHT_ARG_DEFAULTS)
    if isinstance(raw, dict):
        for key, value in raw.items():
            raw_key = str(key or "").strip()
            canonical = LORA_BLOCK_WEIGHT_ARG_ALIASES.get(raw_key.lower(), raw_key)
            if canonical in merged:
                merged[canonical] = value
    elif isinstance(raw, (list, tuple)):
        for key, value in zip(LORA_BLOCK_WEIGHT_ARG_KEYS, raw):
            merged[key] = value

    return {
        "loraratios": str(merged["loraratios"] if merged["loraratios"] is not None else LORA_BLOCK_WEIGHT_DEFAULT_PRESETS),
        "useblocks": _as_bool(merged["useblocks"], False),
        "xyzsetting": _coerce_choice(merged["xyzsetting"], LORA_BLOCK_WEIGHT_XYZ_MODES, "Disable"),
        "xtype": _coerce_choice(merged["xtype"], LORA_BLOCK_WEIGHT_ATYPES, "values"),
        "xmen": str(merged["xmen"] or ""),
        "ytype": _coerce_choice(merged["ytype"], LORA_BLOCK_WEIGHT_ATYPES, "Block ID"),
        "ymen": str(merged["ymen"] or ""),
        "ztype": _coerce_choice(merged["ztype"], LORA_BLOCK_WEIGHT_ATYPES, "none"),
        "zmen": str(merged["zmen"] or ""),
        "exmen": str(merged["exmen"] or ""),
        "eymen": str(merged["eymen"] or ""),
        "ecount": _as_int(merged["ecount"], 1, minimum=1, maximum=100),
        "diffcol": _coerce_choice(merged["diffcol"], LORA_BLOCK_WEIGHT_DIFFCOLS, "black"),
        "thresh": str(merged["thresh"] if merged["thresh"] is not None else "20"),
        "revxy": _as_bool(merged["revxy"], False),
        "elemental": str(merged["elemental"] or ""),
        "elemsets": _as_bool(merged["elemsets"], False),
        "debug": _as_bool(merged["debug"], False),
    }


def lora_block_weight_args_active(raw: Any = None) -> bool:
    return bool(lora_block_weight_arg_dict(raw)["useblocks"])


def lora_block_weight_arg_list(raw: Any = None) -> list[Any]:
    """Return exact 18-element positional args expected by upstream `scripts/lora_block_weight.py`."""
    data = lora_block_weight_arg_dict(raw)
    out: list[Any] = []
    for key in LORA_BLOCK_WEIGHT_ARG_KEYS:
        if key == "xyzsetting":
            out.append(_xyz_mode_index(data[key]))
        else:
            out.append(data[key])
    return out


def lora_block_weight_default_args() -> list[Any]:
    return lora_block_weight_arg_list()


def lora_block_weight_script_arg_specs() -> list[dict[str, Any]]:
    data = lora_block_weight_arg_dict()
    choices_map = {
        "xyzsetting": list(LORA_BLOCK_WEIGHT_XYZ_MODES),
        "xtype": list(LORA_BLOCK_WEIGHT_ATYPES),
        "ytype": list(LORA_BLOCK_WEIGHT_ATYPES),
        "ztype": list(LORA_BLOCK_WEIGHT_ATYPES),
        "diffcol": list(LORA_BLOCK_WEIGHT_DIFFCOLS),
    }
    specs: list[dict[str, Any]] = []
    for key in LORA_BLOCK_WEIGHT_ARG_KEYS:
        specs.append(
            {
                "label": LORA_BLOCK_WEIGHT_ARG_LABELS[key],
                "value": _xyz_mode_index(data[key]) if key == "xyzsetting" else data[key],
                "minimum": 1 if key == "ecount" else None,
                "maximum": 100 if key == "ecount" else None,
                "step": 1 if key == "ecount" else None,
                "choices": choices_map.get(key),
            }
        )
    return specs


def lora_block_weight_schema_payload() -> dict[str, Any]:
    return {
        "extension": LORA_BLOCK_WEIGHT_EXTENSION,
        "script_name": LORA_BLOCK_WEIGHT_SCRIPT_NAME,
        "arg_keys": list(LORA_BLOCK_WEIGHT_ARG_KEYS),
        "defaults": lora_block_weight_arg_dict(),
        "source_defaults": lora_block_weight_default_args(),
        "xyz_modes": list(LORA_BLOCK_WEIGHT_XYZ_MODES),
        "atypes": list(LORA_BLOCK_WEIGHT_ATYPES),
        "diffcols": list(LORA_BLOCK_WEIGHT_DIFFCOLS),
    }


__all__ = [
    "LORA_BLOCK_WEIGHT_ARG_ALIASES",
    "LORA_BLOCK_WEIGHT_ARG_DEFAULTS",
    "LORA_BLOCK_WEIGHT_ARG_KEYS",
    "LORA_BLOCK_WEIGHT_ARG_LABELS",
    "LORA_BLOCK_WEIGHT_ATYPES",
    "LORA_BLOCK_WEIGHT_DEFAULT_PRESETS",
    "LORA_BLOCK_WEIGHT_DIFFCOLS",
    "LORA_BLOCK_WEIGHT_EXTENSION",
    "LORA_BLOCK_WEIGHT_SCRIPT_NAME",
    "LORA_BLOCK_WEIGHT_XYZ_MODES",
    "lora_block_weight_arg_dict",
    "lora_block_weight_arg_list",
    "lora_block_weight_args_active",
    "lora_block_weight_default_args",
    "lora_block_weight_schema_payload",
    "lora_block_weight_script_arg_specs",
]
