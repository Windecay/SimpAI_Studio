"""Adapters for self-installed Regional Boxes and MOSS-Image extensions.

The Regional Boxes wire format and MOSS scheduler follow eduardoabreu81's
AGPL-3.0 extensions. Model loading stays with the built-in Forge backend.
"""
from __future__ import annotations

import json
import math
import re


REGIONAL_BOXES_EXTENSION = "sd-regional-boxes-neo"
MOSS_IMAGE_EXTENSION = "moss-image-forge-neo"
NATIVE_LAYOUT_EXTENSION_PROFILES = (REGIONAL_BOXES_EXTENSION, MOSS_IMAGE_EXTENSION)
LAYOUT_PLUGIN_PAYLOAD_KEY = "__forge_neo_layout_plugins"
MOSS_SCHEDULER_ALIASES = ("MOSS", "moss", "MOSS-Image", "moss_image")


def active_layout_plugins() -> list[str]:
    from forge_neo.extension_adapter import extension_profile_available

    return [name for name in NATIVE_LAYOUT_EXTENSION_PROFILES if extension_profile_available(name)]


def block_original_layout_plugins(opts) -> list[str]:
    """Exclude original import-time hooks before the managed backend loads scripts."""
    disabled = list(getattr(opts, "disabled_extensions", []) or [])
    for name in NATIVE_LAYOUT_EXTENSION_PROFILES:
        if name not in disabled:
            disabled.append(name)
    opts.data["disabled_extensions"] = disabled
    return list(NATIVE_LAYOUT_EXTENSION_PROFILES)


def regional_boxes_data(boxes: list) -> str:
    from forge_neo.layout_tools import validate_qwen_boxes

    items = []
    for color, (left, top, right, bottom) in validate_qwen_boxes(boxes):
        items.append({"color": color, "bbox": [top * 1000, left * 1000, bottom * 1000, right * 1000]})
    return json.dumps({"format": "marks", "draw": True, "boxes": items})


def regional_boxes_args(data: object) -> list[dict]:
    from forge_neo.layout_tools import validate_qwen_boxes

    if not data:
        return []
    if not isinstance(data, str) or len(data) > 65536:
        raise ValueError("Invalid Regional Boxes data.")
    try:
        value = json.loads(data)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid Regional Boxes data.") from exc
    if not isinstance(value, dict):
        raise ValueError("Invalid Regional Boxes data.")
    if value.get("format") != "marks" or not value.get("draw"):
        return []
    source = value.get("boxes", [])
    if source is None or source == []:
        return []
    if not isinstance(source, list):
        raise ValueError("Invalid Regional Boxes data.")
    boxes = []
    for item in source:
        coords = item.get("bbox") if isinstance(item, dict) else None
        if (not isinstance(coords, list) or len(coords) != 4
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                       for v in coords)):
            raise ValueError("Invalid Regional Boxes data.")
        top, left, bottom, right = coords
        boxes.append({"color": item.get("color"), "bbox": [left / 1000, top / 1000, right / 1000, bottom / 1000]})
    validate_qwen_boxes(boxes)
    return boxes


def prepare_layout_plugin_payload(args: dict, request) -> dict:
    """Attach trusted discovery state and translate the old MOSS option."""
    result = dict(args)
    active = active_layout_plugins()
    # Never forward a caller-supplied discovery flag.
    result.pop(LAYOUT_PLUGIN_PAYLOAD_KEY, None)
    if active:
        result[LAYOUT_PLUGIN_PAYLOAD_KEY] = active
    schedulers = (result.get("scheduler"), result.get("hr_scheduler"))
    if any(name in MOSS_SCHEDULER_ALIASES for name in schedulers) and MOSS_IMAGE_EXTENSION not in active:
        raise ValueError("The MOSS-Image extension is not installed or enabled.")
    overrides = dict(result.get("override_settings") or {})
    if "moss_uncond_skip_layers" in overrides:
        if MOSS_IMAGE_EXTENSION not in active:
            raise ValueError("The MOSS-Image extension is not installed or enabled.")
        text = str(overrides.pop("moss_uncond_skip_layers") or "")
        layers = sorted({int(part) for part in re.split(r"[,;\s]+", text)
                         if part.isdigit()})
        explicit = getattr(request, "override_settings", {}) or {}
        is_moss = str(getattr(request, "preset", "")).lower() == "moss"
        if is_moss and "slg_single_layers" not in explicit:
            overrides["slg_single_layers"] = ", ".join(map(str, layers))
        if is_moss and "slg_enable" not in explicit:
            overrides["slg_enable"] = bool(layers)
        result["override_settings"] = overrides
    for name, value in (result.get("alwayson_scripts") or {}).items():
        if str(name).strip().casefold() != "regional boxes":
            continue
        if REGIONAL_BOXES_EXTENSION not in active:
            raise ValueError("The Regional Boxes extension is not installed or enabled.")
        values = value.get("args", []) if isinstance(value, dict) else None
        if not isinstance(values, list) or len(values) > 1:
            raise ValueError("Invalid Regional Boxes data.")
        boxes = regional_boxes_args(values[0] if values else "")
        if boxes and (str(getattr(request, "preset", "")).lower() != "qwen21"
                      or str(getattr(request, "mode", "")) != "img2img"):
            raise ValueError("Qwen color boxes require the Qwen Image 2.1 preset and img2img.")
    if MOSS_IMAGE_EXTENSION in active and str(getattr(request, "preset", "")).lower() == "moss":
        prompt = re.sub(r"<(?:lora|lyco|hypernet):[^<>]+>", "", str(result.get("prompt") or "")).strip()
        try:
            layout = json.loads(prompt)
        except ValueError:
            layout = None
        if isinstance(layout, dict) and isinstance(layout.get("summary"), dict) and isinstance(layout.get("items"), list):
            from forge_neo.dynamic_prompts_compat import dynamic_prompts_script_name_matches

            # A layout is literal JSON; variant expansion would remove its structural braces.
            scripts = dict(result.get("alwayson_scripts") or {})
            for name, value in scripts.items():
                if dynamic_prompts_script_name_matches(name) and isinstance(value, dict):
                    values = value.get("args")
                    if isinstance(values, list) and values:
                        scripts[name] = {**value, "args": [False, *values[1:]]}
            result["alwayson_scripts"] = scripts
    return result


def apply_regional_boxes(p, data: object) -> bool:
    from forge_neo.layout_tools import draw_qwen_boxes

    boxes = regional_boxes_args(data)
    images = getattr(p, "init_images", None)
    model = getattr(p, "sd_model", None)
    is_qwen = any(cls.__name__ in {"QwenImage21", "QwenImage21Engine"} for cls in type(model).__mro__)
    if not boxes or not images or not is_qwen:
        return False
    p.init_images = [draw_qwen_boxes(image, boxes) for image in images]
    p.extra_generation_params["Regional boxes"] = "marks (" + ", ".join(box["color"] for box in boxes) + ")"
    return True


def moss_sigmas(n, sigma_min=None, sigma_max=None, inner_model=None, device="cpu", **kwargs):
    # MOSS-Image 0.1.2: shift 5, nearest 1000-point training grid, duplicates removed.
    import torch

    if n < 1:
        raise ValueError("MOSS needs at least one step")
    values = torch.linspace(1, 5 / 1004, n)
    sigmas = 5 * values / (1 + 4 * values)
    training = torch.linspace(1, 1 / 1000, 1000).flip(0)
    upper = torch.searchsorted(training, sigmas).clamp(max=999)
    lower = (upper - 1).clamp(min=0)
    nearest = torch.where((sigmas - training[lower]).abs() <= (training[upper] - sigmas).abs(), lower, upper)
    return torch.cat((torch.unique_consecutive(training[nearest]), torch.zeros(1))).to(device)


def register_moss_scheduler(schedulers, shared) -> bool:
    if "MOSS" in schedulers.schedulers_map:
        return False
    entry = schedulers.Scheduler("moss", "MOSS", moss_sigmas, aliases=["MOSS-Image", "moss_image"])
    schedulers.all_schedulers.append(entry)
    if "MOSS" not in getattr(shared.opts, "hide_schedulers", []):
        schedulers.schedulers.append(entry)
    schedulers.schedulers_map.update({key: entry for key in MOSS_SCHEDULER_ALIASES})
    return True
