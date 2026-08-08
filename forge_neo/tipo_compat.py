from __future__ import annotations

from collections.abc import Mapping
from typing import Any


TIPO_ARG_KEYS = (
    "enabled",
    "timing",
    "seed",
    "follow_generation_seed",
    "tag_length",
    "nl_length",
    "ban_tags",
    "format_select",
    "format",
    "temperature",
    "top_p",
    "top_k",
    "model",
    "gguf_cpu",
    "no_formatting",
    "tag_prompt",
    "nl_prompt",
)
TIPO_TIMING_BEFORE = "Before applying other prompt processings"
TIPO_TIMING_AFTER = "After applying other prompt processings"
TIPO_LENGTH_CHOICES = ("very short", "short", "long", "very long")
TIPO_FALLBACK_FORMAT = """<|special|>,
<|characters|>, <|copyrights|>,
<|artist|>,

<|general|>,

<|quality|>, <|meta|>, <|rating|>"""


def tipo_model_choices() -> list[str]:
    try:
        from kgen import models

        return [
            f"{model_name} | {file}"
            for model_name, ggufs in models.tipo_model_list
            for file in ggufs
        ] + [item[0] for item in models.tipo_model_list]
    except Exception:
        return []


def tipo_format_choices() -> tuple[list[str], dict[str, str]]:
    try:
        from kgen.metainfo import TIPO_DEFAULT_FORMAT

        formats = dict(TIPO_DEFAULT_FORMAT)
    except Exception:
        formats = {"custom": TIPO_FALLBACK_FORMAT}
    return [*formats.keys(), "custom"] if "custom" not in formats else list(formats), formats


def tipo_default_values() -> dict[str, Any]:
    format_choices, formats = tipo_format_choices()
    format_select = next((item for item in format_choices if item != "custom"), "custom")
    return {
        "enabled": False,
        "timing": TIPO_TIMING_AFTER,
        "seed": -1,
        "follow_generation_seed": False,
        "tag_length": "long",
        "nl_length": "long",
        "ban_tags": "",
        "format_select": format_select,
        "format": formats.get(format_select, TIPO_FALLBACK_FORMAT),
        "temperature": 0.5,
        "top_p": 0.95,
        "top_k": 80,
        "model": (tipo_model_choices() or [""])[0],
        "gguf_cpu": False,
        "no_formatting": False,
        "tag_prompt": "",
        "nl_prompt": "",
    }


def tipo_arg_dict(value: object) -> dict[str, Any]:
    defaults = tipo_default_values()
    if isinstance(value, Mapping):
        values = dict(defaults)
        values.update({key: value[key] for key in TIPO_ARG_KEYS if key in value})
        return values
    if isinstance(value, (list, tuple)):
        values = dict(defaults)
        for index, key in enumerate(TIPO_ARG_KEYS):
            if index < len(value):
                values[key] = value[index]
        return values
    return defaults


def tipo_arg_list(value: object) -> list[Any]:
    values = tipo_arg_dict(value)
    return [values[key] for key in TIPO_ARG_KEYS]
