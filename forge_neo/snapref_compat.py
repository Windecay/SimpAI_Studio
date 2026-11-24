from __future__ import annotations

import copy
import math
import os
from pathlib import Path
from typing import Any


SNAPREF_EXTENSION = "SnapRef-Forge-Neo"
SNAPREF_EXTENSION_ALIASES = (SNAPREF_EXTENSION, "snapref")
SNAPREF_SCRIPT_NAME = "SnapRef"
SNAPREF_MAX_REFERENCES = 8

SNAPREF_RELEASES: dict[str, str] = {
    "snapref_v2a.safetensors": "0ppxnhximxr/snapref-v2a",
    "snapref_v2a_fp8.safetensors": "0ppxnhximxr/snapref-v2a",
    "snapref_v1a.safetensors": "0ppxnhximxr/snapref-v1a",
    "snapref_v1a_fp8.safetensors": "0ppxnhximxr/snapref-v1a",
    "snapref_v1b.safetensors": "0ppxnhximxr/snapref-v1b",
    "snapref_v1b_fp8.safetensors": "0ppxnhximxr/snapref-v1b",
}

SNAPREF_DEFAULT_ADAPTER = "snapref_v2a_fp8.safetensors"
SNAPREF_MODES = ("Character & Style", "Character")
SNAPREF_LAYOUTS = ("Separate references", "Side by side")
SNAPREF_CORRECTIONS = ("apg", "rescale", "none")

# Exact positional argument order expected by SnapRefScript.process_before_every_sampling:
# slots 5-8 come after the advanced options so 4-reference API payloads stay compatible.
SNAPREF_ARG_KEYS = (
    "enabled",
    "adapter",
    "mode",
    "layout",
    "fidelity",
    "mp",
    "ref1",
    "w1",
    "ref2",
    "w2",
    "ref3",
    "w3",
    "ref4",
    "w4",
    "caption",
    "in_uncond",
    "rg_on",
    "rg",
    "end",
    "correction",
    "phi",
    "ref5",
    "w5",
    "ref6",
    "w6",
    "ref7",
    "w7",
    "ref8",
    "w8",
)

SNAPREF_IMAGE_KEYS = tuple(f"ref{index}" for index in range(1, SNAPREF_MAX_REFERENCES + 1))
SNAPREF_WEIGHT_KEYS = tuple(f"w{index}" for index in range(1, SNAPREF_MAX_REFERENCES + 1))

SNAPREF_ARG_LABELS = {
    "enabled": "SnapRef",
    "adapter": "SnapRef adapter",
    "mode": "Mode",
    "layout": "Combine references",
    "fidelity": "Fidelity",
    "mp": "Reference size (MP)",
    "ref1": "Reference 1",
    "w1": "Strength 1",
    "ref2": "Reference 2",
    "w2": "Strength 2",
    "ref3": "Reference 3",
    "w3": "Strength 3",
    "ref4": "Reference 4",
    "w4": "Strength 4",
    "caption": "Reference caption",
    "in_uncond": "Reference in negative branch",
    "rg_on": "Extra reference guidance",
    "rg": "Reference guidance",
    "end": "Guidance end",
    "correction": "Guidance correction",
    "phi": "Rescale phi",
    "ref5": "Reference 5",
    "w5": "Strength 5",
    "ref6": "Reference 6",
    "w6": "Strength 6",
    "ref7": "Reference 7",
    "w7": "Strength 7",
    "ref8": "Reference 8",
    "w8": "Strength 8",
}

SNAPREF_ARG_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "adapter": SNAPREF_DEFAULT_ADAPTER,
    "mode": "Character & Style",
    "layout": "Separate references",
    "fidelity": 1.0,
    "mp": 1.0,
    "ref1": None,
    "w1": 1.0,
    "ref2": None,
    "w2": 1.0,
    "ref3": None,
    "w3": 1.0,
    "ref4": None,
    "w4": 1.0,
    "caption": "",
    "in_uncond": False,
    "rg_on": False,
    "rg": 4.5,
    "end": 1.0,
    "correction": "apg",
    "phi": 0.5,
    "ref5": None,
    "w5": 1.0,
    "ref6": None,
    "w6": 1.0,
    "ref7": None,
    "w7": 1.0,
    "ref8": None,
    "w8": 1.0,
}

SNAPREF_ARG_ALIASES = {
    "enable": "enabled",
    "active": "enabled",
    "snapref_adapter": "adapter",
    "model": "adapter",
    "combine_references": "layout",
    "reference_mp": "mp",
    "reference_size": "mp",
    "reference_size_mp": "mp",
    "reference_caption": "caption",
    "reference_in_negative": "in_uncond",
    "reference_in_negative_branch": "in_uncond",
    "extra_guidance": "rg_on",
    "extra_reference_guidance": "rg_on",
    "guidance": "rg",
    "reference_guidance": "rg",
    "guidance_end": "end",
    "guidance_correction": "correction",
    "rescale_phi": "phi",
    **{f"reference_{index}": f"ref{index}" for index in range(1, SNAPREF_MAX_REFERENCES + 1)},
    **{f"strength_{index}": f"w{index}" for index in range(1, SNAPREF_MAX_REFERENCES + 1)},
    **{f"weight_{index}": f"w{index}" for index in range(1, SNAPREF_MAX_REFERENCES + 1)},
}

_MODE_ALIASES = {
    "character & style": "Character & Style",
    "character and style": "Character & Style",
    "cs": "Character & Style",
    "character": "Character",
    "char": "Character",
}

_LAYOUT_ALIASES = {
    "separate references": "Separate references",
    "separate": "Separate references",
    "side by side": "Side by side",
    "side-by-side": "Side by side",
    "composite": "Side by side",
}

_ROOT = Path(__file__).resolve().parents[1]
_WEBUI_ROOT = _ROOT / "forge_neo" / "webui"
_USER_EXTENSIONS_DIR = _WEBUI_ROOT / "extensions"


def _bool_value(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        text = value.strip().casefold()
        if text in {"1", "true", "yes", "on", "enabled"}:
            return True
        if text in {"0", "false", "no", "off", "disabled"}:
            return False
    return bool(value)


def _float_value(value: Any, default: float, *, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    if not math.isfinite(number):
        number = default
    return max(minimum, min(number, maximum))


def snapref_args_active(value: Any) -> bool:
    if isinstance(value, dict):
        for key in ("enabled", "enable", "active"):
            if key in value:
                return _bool_value(value.get(key), False)
        return bool(value)
    if isinstance(value, (list, tuple)):
        return _bool_value(value[0], False) if value else False
    return False


def snapref_arg_dict(value: Any = None, *, enabled: bool | None = None) -> dict[str, Any]:
    data = copy.deepcopy(SNAPREF_ARG_DEFAULTS)
    if isinstance(value, dict):
        for raw_key, item in value.items():
            key_text = str(raw_key).strip()
            key = SNAPREF_ARG_ALIASES.get(key_text.casefold(), key_text)
            if key in data:
                data[key] = item
        images = value.get("references") or value.get("images")
        if isinstance(images, (list, tuple)):
            for index, image in enumerate(images[:SNAPREF_MAX_REFERENCES], start=1):
                if data.get(f"ref{index}") is None:
                    data[f"ref{index}"] = image
        strengths = value.get("strengths") or value.get("weights")
        if isinstance(strengths, (list, tuple)):
            for index, weight in enumerate(strengths[:SNAPREF_MAX_REFERENCES], start=1):
                data[f"w{index}"] = weight
    elif isinstance(value, (list, tuple)):
        for key, item in zip(SNAPREF_ARG_KEYS, value):
            data[key] = item

    if enabled is not None:
        data["enabled"] = bool(enabled)
    data["enabled"] = _bool_value(data.get("enabled"), False)

    adapter = str(data.get("adapter") or "").strip()
    data["adapter"] = adapter or SNAPREF_DEFAULT_ADAPTER

    raw_mode = str(data.get("mode") or "Character & Style").strip()
    data["mode"] = _MODE_ALIASES.get(raw_mode.casefold(), "Character & Style")

    raw_layout = str(data.get("layout") or "Separate references").strip()
    data["layout"] = _LAYOUT_ALIASES.get(raw_layout.casefold(), "Separate references")

    data["fidelity"] = _float_value(data.get("fidelity"), 1.0, minimum=0.0, maximum=1.0)
    data["mp"] = _float_value(data.get("mp"), 1.0, minimum=0.1, maximum=2.0)

    for index in range(1, SNAPREF_MAX_REFERENCES + 1):
        ref_key = f"ref{index}"
        weight_key = f"w{index}"
        ref_value = data.get(ref_key)
        if isinstance(ref_value, str) and not ref_value.strip():
            data[ref_key] = None
        data[weight_key] = _float_value(data.get(weight_key), 1.0, minimum=0.0, maximum=2.0)

    data["caption"] = str(data.get("caption") or "")
    data["in_uncond"] = _bool_value(data.get("in_uncond"), False)
    data["rg_on"] = _bool_value(data.get("rg_on"), False)
    data["rg"] = _float_value(data.get("rg"), 4.5, minimum=1.0, maximum=10.0)
    data["end"] = _float_value(data.get("end"), 1.0, minimum=0.0, maximum=1.0)

    raw_correction = str(data.get("correction") or "apg").strip().casefold()
    data["correction"] = raw_correction if raw_correction in SNAPREF_CORRECTIONS else "apg"
    data["phi"] = _float_value(data.get("phi"), 0.5, minimum=0.0, maximum=1.0)
    return data


def snapref_arg_list(value: Any = None, *, enabled: bool | None = None) -> list[Any]:
    data = snapref_arg_dict(value, enabled=enabled)
    return [data[key] for key in SNAPREF_ARG_KEYS]


def snapref_default_args(*, enabled: bool = False) -> list[Any]:
    return snapref_arg_list(enabled=enabled)


def snapref_reference_count(value: Any) -> int:
    data = snapref_arg_dict(value)
    return sum(
        1
        for index in range(1, SNAPREF_MAX_REFERENCES + 1)
        if data.get(f"ref{index}") is not None and float(data.get(f"w{index}", 0.0) or 0.0) > 0.0
    )


def snapref_extension_root(extensions_dir: Path | None = None) -> Path:
    base = Path(extensions_dir) if extensions_dir is not None else _USER_EXTENSIONS_DIR
    for dirname in SNAPREF_EXTENSION_ALIASES:
        candidate = base / dirname
        if (candidate / "scripts" / "snapref.py").is_file():
            return candidate
    for dirname in SNAPREF_EXTENSION_ALIASES:
        candidate = base / dirname
        if candidate.is_dir():
            return candidate
    return base / SNAPREF_EXTENSION


def snapref_model_dirs(
    *,
    extension_root: Path | None = None,
    extra_dirs: list[str | os.PathLike[str]] | tuple[str | os.PathLike[str], ...] | None = None,
) -> list[Path]:
    dirs: list[Path] = []
    seen: set[str] = set()

    def add(path_value: str | os.PathLike[str] | None) -> None:
        if not path_value:
            return
        path = Path(path_value).expanduser()
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            return
        seen.add(key)
        dirs.append(path)

    ext_root = Path(extension_root) if extension_root is not None else snapref_extension_root()
    add(ext_root / "models")
    if extension_root is None:
        for dirname in SNAPREF_EXTENSION_ALIASES:
            add(_USER_EXTENSIONS_DIR / dirname / "models")

    if extra_dirs is not None:
        for item in extra_dirs:
            add(item)
    else:
        try:
            from forge_neo.models import model_roots_for_catalog

            for root_dir in model_roots_for_catalog("loras"):
                add(root_dir)
        except Exception:
            pass
        add(_WEBUI_ROOT / "models" / "Lora")
    return dirs


def snapref_model_files(
    *,
    extension_root: Path | None = None,
    extra_dirs: list[str | os.PathLike[str]] | tuple[str | os.PathLike[str], ...] | None = None,
) -> dict[str, Path]:
    found: dict[str, Path] = {}
    for folder in snapref_model_dirs(extension_root=extension_root, extra_dirs=extra_dirs):
        if not folder.is_dir():
            continue
        try:
            candidates = sorted(folder.rglob("*.safetensors"))
        except OSError:
            continue
        for path in candidates:
            if "snapref" in path.name.lower():
                found.setdefault(path.name, path)
    return found


def snapref_adapter_choices(
    *,
    extension_root: Path | None = None,
    extra_dirs: list[str | os.PathLike[str]] | tuple[str | os.PathLike[str], ...] | None = None,
) -> list[str]:
    found = snapref_model_files(extension_root=extension_root, extra_dirs=extra_dirs)
    return list(dict.fromkeys([*found.keys(), *SNAPREF_RELEASES.keys()]))


def snapref_download_adapter(
    name: str,
    *,
    extension_root: Path | None = None,
    downloader: Any | None = None,
) -> tuple[Path, list[str]]:
    selected = str(name or "").strip()
    if selected not in SNAPREF_RELEASES:
        raise ValueError("Choose a released SnapRef filename to download.")
    ext_root = Path(extension_root) if extension_root is not None else snapref_extension_root()
    models_dir = ext_root / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    if downloader is None:
        from huggingface_hub import hf_hub_download

        downloader = hf_hub_download
    downloaded = downloader(SNAPREF_RELEASES[selected], selected, local_dir=str(models_dir))
    target_path = Path(downloaded) if downloaded else (models_dir / selected)
    return target_path, snapref_adapter_choices(extension_root=ext_root)


def snapref_script_arg_specs(
    *,
    extension_root: Path | None = None,
    extra_dirs: list[str | os.PathLike[str]] | tuple[str | os.PathLike[str], ...] | None = None,
) -> list[dict[str, Any]]:
    values = snapref_default_args()
    adapter_choices = snapref_adapter_choices(extension_root=extension_root, extra_dirs=extra_dirs)
    specs: list[dict[str, Any]] = []
    for key, value in zip(SNAPREF_ARG_KEYS, values):
        choices: list[Any] | None = None
        minimum: float | int | None = None
        maximum: float | int | None = None
        step: float | int | None = None
        if key == "adapter":
            choices = adapter_choices
        elif key == "mode":
            choices = list(SNAPREF_MODES)
        elif key == "layout":
            choices = list(SNAPREF_LAYOUTS)
        elif key == "correction":
            choices = list(SNAPREF_CORRECTIONS)
        elif key in {"fidelity", "end", "phi"}:
            minimum, maximum, step = 0.0, 1.0, 0.05
        elif key == "mp":
            minimum, maximum, step = 0.1, 2.0, 0.1
        elif key == "rg":
            minimum, maximum, step = 1.0, 10.0, 0.1
        elif key in SNAPREF_WEIGHT_KEYS:
            minimum, maximum, step = 0.0, 2.0, 0.05
        specs.append(
            {
                "label": SNAPREF_ARG_LABELS[key],
                "value": value,
                "choices": choices,
                "minimum": minimum,
                "maximum": maximum,
                "step": step,
            }
        )
    return specs


def snapref_schema_payload(
    *,
    extension_root: Path | None = None,
    extra_dirs: list[str | os.PathLike[str]] | tuple[str | os.PathLike[str], ...] | None = None,
) -> dict[str, Any]:
    properties: dict[str, Any] = {}
    for key, value in snapref_arg_dict().items():
        prop: dict[str, Any] = {
            "title": SNAPREF_ARG_LABELS[key],
            "default": value,
            "type": _json_schema_type(value),
        }
        if key == "adapter":
            prop["enum"] = snapref_adapter_choices(extension_root=extension_root, extra_dirs=extra_dirs)
        elif key == "mode":
            prop["enum"] = list(SNAPREF_MODES)
        elif key == "layout":
            prop["enum"] = list(SNAPREF_LAYOUTS)
        elif key == "correction":
            prop["enum"] = list(SNAPREF_CORRECTIONS)
        properties[key] = prop
    return {
        "title": "SnapRefArgs",
        "type": "object",
        "additionalProperties": True,
        "properties": properties,
        "args_order": list(SNAPREF_ARG_KEYS),
        "releases": dict(SNAPREF_RELEASES),
        "max_references": SNAPREF_MAX_REFERENCES,
    }


def _json_schema_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    if value is None:
        return "string"
    return "string"
