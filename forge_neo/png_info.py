from __future__ import annotations

import html
import re
from collections.abc import Mapping

import piexif
import piexif.helper
from PIL import Image

from forge_neo.i18n import t


GENINFO_KEYS = ("parameters", "prompt", "Description")
IGNORED_INFO_KEYS = {
    "jfif",
    "jfif_version",
    "jfif_unit",
    "jfif_density",
    "dpi",
    "exif",
    "loop",
    "background",
    "timestamp",
    "duration",
    "progressive",
    "progression",
    "icc_profile",
    "chromaticity",
    "photoshop",
}

PARAM_ALIASES = {
    "steps": "steps",
    "sampler": "sampler",
    "schedule type": "scheduler",
    "cfg scale": "cfg_scale",
    "shift": "distilled_cfg_scale",
    "distilled cfg scale": "distilled_cfg_scale",
    "seed": "seed",
    "size": "size",
    "model": "model",
    "model hash": "model_hash",
    "vae": "vae",
    "denoising strength": "denoising_strength",
    "script": "script",
    "prompt matrix put at start": "script_prompt_matrix_put_at_start",
    "different seeds": "script_prompt_matrix_different_seeds",
    "prompt type": "script_prompt_matrix_prompt_type",
    "joining": "script_prompt_matrix_delimiter",
    "grid margins": "grid_margins",
    "iterate seed": "script_prompts_iterate_seed",
    "same seed": "script_prompts_same_seed",
    "insert at": "script_prompts_position",
    "prompt text": "script_prompts_text",
    "x type": "script_xyz_x_type",
    "x values": "script_xyz_x_values",
    "y type": "script_xyz_y_type",
    "y values": "script_xyz_y_values",
    "z type": "script_xyz_z_type",
    "z values": "script_xyz_z_values",
    "row count": "script_xyz_row_count",
    "draw legend": "script_xyz_draw_legend",
    "keep -1 for seeds": "script_xyz_keep_minus_one",
    "vary seeds for x": "script_xyz_vary_x",
    "vary seeds for y": "script_xyz_vary_y",
    "vary seeds for z": "script_xyz_vary_z",
    "include sub images": "script_xyz_include_sub_images",
    "include sub grids": "script_xyz_include_sub_grids",
    "use text inputs instead of dropdowns": "script_xyz_csv_mode",
    "loopback loops": "script_loopback_loops",
    "final denoising strength": "script_loopback_final_denoising",
    "denoising strength curve": "script_loopback_curve",
    "sd upscale upscaler": "script_sd_upscale_upscaler",
    "scale factor": "script_sd_upscale_scale",
    "tile overlap": "script_sd_upscale_overlap",
    "save to extras": "script_sd_upscale_override",
}


def read_png_info(image: Image.Image | None, state: Mapping[str, object] | None = None) -> str:
    if image is None:
        return t(state, "Drop an image to read metadata.", "放入图片后读取元数据。")
    info = getattr(image, "info", {}) or {}
    params = _generation_info(info) or _exif_user_comment(image)
    if params:
        return str(params)
    lines = [f"{key}: {value}" for key, value in _readable_items(info).items()]
    if lines:
        return "\n".join(lines)
    return t(state, "No readable image metadata was found.", "没有读取到图片元数据。")


def png_info_items(image: Image.Image | None) -> tuple[str, dict[str, str]]:
    if image is None:
        return "", {}
    info = getattr(image, "info", {}) or {}
    params = str(_generation_info(info) or _exif_user_comment(image) or "")
    items = _readable_items(info)
    if params or items:
        items = {"parameters": params, **items}
    return params, items


def png_info_items_source_api(image: Image.Image | None) -> tuple[str, dict[str, str]]:
    if image is None:
        return "", {}
    info = getattr(image, "info", {}) or {}
    params = str(_generation_info(info) or _exif_user_comment(image) or "")
    return params, _readable_items(info)


def png_info_html(image: Image.Image | None, state: Mapping[str, object] | None = None) -> str:
    params, items = png_info_items(image)
    if image is None:
        message = t(state, "Drop an image to read metadata.", "放入图片后读取元数据。")
        return f'<div class="forge-neo-pnginfo-empty">{html.escape(message)}</div>'
    if not params and not items:
        message = t(state, "Nothing found in the image.", "图片里没有找到可读取的 metadata。")
        return f'<div class="forge-neo-pnginfo-empty">{html.escape(message)}</div>'
    blocks = []
    for key, value in items.items():
        blocks.append(
            '<div class="forge-neo-pnginfo-item">'
            f"<p><b>{html.escape(str(key))}</b></p>"
            f"<p>{html.escape(str(value))}</p>"
            "</div>"
        )
    return "".join(blocks)


def _generation_info(info: Mapping[str, object]) -> str:
    for key in GENINFO_KEYS:
        value = info.get(key)
        if value:
            return str(value)
    return ""


def _readable_items(info: Mapping[str, object]) -> dict[str, str]:
    items: dict[str, str] = {}
    for key, value in info.items():
        key_text = str(key)
        if key_text in GENINFO_KEYS or key_text.lower() in IGNORED_INFO_KEYS:
            continue
        items[key_text] = str(value)
    return items


def _exif_user_comment(image: Image.Image) -> str:
    info = getattr(image, "info", {}) or {}
    comment = _exif_user_comment_from_source(info.get("exif") or info.get("Exif"))
    if comment:
        return comment
    try:
        exif = image.getexif()
    except Exception:
        return ""
    raw = exif.get(piexif.ExifIFD.UserComment) if exif else None
    return _decode_user_comment(raw)


def _exif_user_comment_from_source(source: object) -> str:
    if not source:
        return ""
    try:
        loaded = piexif.load(source)
    except Exception:
        return ""
    raw = loaded.get("Exif", {}).get(piexif.ExifIFD.UserComment)
    return _decode_user_comment(raw)


def _decode_user_comment(raw: object) -> str:
    if not raw:
        return ""
    try:
        return str(piexif.helper.UserComment.load(raw)).strip()
    except Exception:
        if isinstance(raw, bytes):
            return raw.decode("utf-8", "ignore").strip("\x00").strip()
        return str(raw).strip()


def parse_generation_parameters(text: str | None) -> dict[str, object]:
    raw = str(text or "").strip()
    if not raw:
        return {}
    lines = raw.splitlines()
    param_line_index = next((index for index, line in enumerate(lines) if line.strip().startswith("Steps:")), -1)
    negative_index = next((index for index, line in enumerate(lines) if line.strip().startswith("Negative prompt:")), -1)

    if negative_index >= 0:
        prompt_lines = lines[:negative_index]
        negative_lines = lines[negative_index:param_line_index if param_line_index >= 0 else len(lines)]
        negative = "\n".join(negative_lines).strip()
        negative = re.sub(r"^Negative prompt:\s*", "", negative, count=1)
    elif param_line_index >= 0:
        prompt_lines = lines[:param_line_index]
        negative = ""
    else:
        prompt_lines = lines
        negative = ""

    params_text = lines[param_line_index] if param_line_index >= 0 else ""
    parsed: dict[str, object] = {
        "prompt": "\n".join(prompt_lines).strip(),
        "negative_prompt": negative.strip(),
    }
    for key, value in _parse_parameter_items(params_text).items():
        normalized = PARAM_ALIASES.get(key)
        if normalized:
            parsed[normalized] = value

    if "steps" in parsed:
        parsed["steps"] = _to_int(parsed["steps"], 8)
    if "seed" in parsed:
        parsed["seed"] = _to_int(parsed["seed"], -1)
    if "cfg_scale" in parsed:
        parsed["cfg_scale"] = _to_float(parsed["cfg_scale"], 1.0)
    if "distilled_cfg_scale" in parsed:
        parsed["distilled_cfg_scale"] = _to_float(parsed["distilled_cfg_scale"], 3.0)
    if "denoising_strength" in parsed:
        parsed["denoising_strength"] = _to_float(parsed["denoising_strength"], 0.0)
    if "size" in parsed:
        size_match = re.match(r"(\d+)\s*x\s*(\d+)", str(parsed["size"]))
        if size_match:
            parsed["width"] = int(size_match.group(1))
            parsed["height"] = int(size_match.group(2))
    return parsed


def _parse_parameter_items(params_text: str) -> dict[str, str]:
    text = str(params_text or "").strip()
    if not text:
        return {}
    key_pattern = "|".join(re.escape(key) for key in sorted(PARAM_ALIASES, key=len, reverse=True))
    matches = list(re.finditer(rf"(?:^|,\s*)({key_pattern}):\s*", text, flags=re.IGNORECASE))
    if not matches:
        return {}
    items: dict[str, str] = {}
    for index, match in enumerate(matches):
        value_start = match.end()
        value_end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        key = match.group(1).strip().lower()
        value = text[value_start:value_end].strip()
        if value.endswith(","):
            value = value[:-1].strip()
        items[key] = value
    return items


def parse_generation_parameters_source_api(text: str | None) -> dict[str, object]:
    raw = str(text or "").strip()
    if not raw:
        return {}
    lines = raw.splitlines()
    lastline = lines[-1].strip() if lines else ""
    prompt_lines = lines[:-1]
    if len(re.findall(r"([^:,]+):\s*([^,]+)(?:,\s*|$)", lastline)) < 3:
        prompt_lines = lines
        lastline = ""

    positive_lines: list[str] = []
    negative_lines: list[str] = []
    reading_negative = False
    for line in prompt_lines:
        clean = line.strip()
        if clean.startswith("Negative prompt:"):
            clean = clean.replace("Negative prompt:", "", 1).strip()
            reading_negative = True
        (negative_lines if reading_negative else positive_lines).append(clean)

    params: dict[str, object] = {}
    normalized_lastline = lastline.replace("Sampler: Undefined,", "Sampler: Euler, Schedule type: Simple,")
    normalized_lastline = normalized_lastline.replace(", width:", ", Size-1:").replace(", height:", ", Size-2:")
    for key, value in re.findall(r"([^:,]+):\s*([^,]+)(?:,\s*|$)", normalized_lastline):
        clean_key = key.strip()
        clean_value = value.strip()
        size_match = re.match(r"(\d+)\s*x\s*(\d+)", clean_value)
        if size_match:
            params[f"{clean_key}-1"] = size_match.group(1)
            params[f"{clean_key}-2"] = size_match.group(2)
        else:
            params[clean_key] = clean_value

    params["Prompt"] = "\n".join(positive_lines).strip()
    params["Negative prompt"] = "\n".join(negative_lines).strip()
    params.setdefault("Sampler", "Euler")
    params.setdefault("Schedule type", "Simple")
    params.setdefault("RNG", "CPU")
    params.setdefault("Hires resize-1", 0)
    params.setdefault("Hires resize-2", 0)
    params.setdefault("Hires sampler", "Use same sampler")
    params.setdefault("Hires schedule type", "Use same scheduler")
    params.setdefault("Hires checkpoint", "Use same checkpoint")
    params.setdefault("Hires prompt", "")
    params.setdefault("Hires negative prompt", "")
    params.setdefault("MaHiRo", False)
    params.setdefault("Rescale CFG", 0.0)
    params.setdefault("Hires VAE/TE", ["Use same choices"])
    if "Shift" in params:
        params["Distilled CFG Scale"] = params.pop("Shift")
    if "Hires Shift" in params:
        params["Hires Distilled CFG Scale"] = params.pop("Hires Shift")
    if "sd_model_name" in params:
        params["Model"] = params.pop("sd_model_name")
    return params


def _to_int(value: object, default: int) -> int:
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default


def _to_float(value: object, default: float) -> float:
    try:
        return float(str(value).strip())
    except Exception:
        return default
