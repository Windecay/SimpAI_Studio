"""Native layout editor bridge, including Qwen Image 2.1 image annotations."""
from __future__ import annotations

import html
import json
import math
from dataclasses import replace
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
QWEN_BOX_COLORS = {
    "red": (255, 0, 0), "blue": (0, 80, 255), "green": (0, 180, 0), "yellow": (255, 212, 0),
    "magenta": (255, 0, 255), "orange": (255, 128, 0), "cyan": (0, 208, 255), "purple": (128, 0, 255),
}


def layout_config_html() -> str:
    # Use the shared UI dictionary without loading the Studio frontend into Forge.
    source = "\n".join((ROOT / "javascript" / name).read_text(encoding="utf-8")
                       for name in ("regional_json_prompt.js", "forge_neo_layout.js"))
    dictionary = json.loads((ROOT / "language" / "cn.json").read_text(encoding="utf-8"))
    translations = {key: value for key, value in dictionary.items() if key in source}
    payload = html.escape(json.dumps(translations, ensure_ascii=False), quote=True)
    return f'<div data-forge-layout-translations="{payload}" hidden></div>'


def layout_message(message: str, state) -> str:
    if (state or {}).get("__lang") == "en":
        return message
    dictionary = json.loads((ROOT / "language" / "cn.json").read_text(encoding="utf-8"))
    return dictionary.get(message, message)


def validate_qwen_boxes(boxes: list) -> list[tuple[str, list]]:
    if not isinstance(boxes, list) or not 1 <= len(boxes) <= len(QWEN_BOX_COLORS):
        raise ValueError("Qwen layouts support one to eight regions.")
    validated = []
    for box in boxes:
        if not isinstance(box, dict) or box.get("color") not in QWEN_BOX_COLORS:
            raise ValueError("Invalid Qwen box color.")
        coordinates = box.get("bbox")
        if (not isinstance(coordinates, list) or len(coordinates) != 4
                or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
                       for v in coordinates)):
            raise ValueError("Invalid Qwen box coordinates.")
        x0, y0, x1, y1 = coordinates
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError("Invalid Qwen box coordinates.")
        validated.append((box["color"], coordinates))
    return validated


def draw_qwen_boxes(image: Image.Image, boxes: list) -> Image.Image:
    """Draw validated normalized xyxy boxes onto a copy of the source image."""
    validated = validate_qwen_boxes(boxes)
    output = image.convert("RGBA" if "A" in image.getbands() else "RGB").copy()
    pen = ImageDraw.Draw(output)
    width, height = output.size
    thickness = max(3, round(min(width, height) / 128))
    for color, (x0, y0, x1, y1) in validated:
        color = QWEN_BOX_COLORS[color]
        left, top = min(width - 1, math.floor(x0 * width)), min(height - 1, math.floor(y0 * height))
        right, bottom = max(left, math.ceil(x1 * width) - 1), max(top, math.ceil(y1 * height) - 1)
        pen.rectangle((left, top, right, bottom), outline=(*color, 255) if output.mode == "RGBA" else color,
                      width=thickness)
    return output


def apply_qwen_layout(request, payload: str, source_prompt: str):
    """Apply only the annotation explicitly sent for this prompt and image."""
    if not payload:
        return request
    if not isinstance(payload, str) or len(payload) > 65536:
        raise ValueError("Invalid Qwen layout.")
    data = json.loads(payload)
    if not isinstance(data, dict) or data.get("format") != "qwen21-marks":
        raise ValueError("Invalid Qwen layout.")
    if request.preset != "qwen21" or request.mode != "img2img":
        raise ValueError("Qwen color boxes require the Qwen Image 2.1 preset and img2img.")
    if data.get("prompt") != source_prompt:
        raise ValueError("The prompt changed. Apply the layout again or clear the color boxes.")
    if not isinstance(request.init_image, Image.Image):
        raise ValueError("Add an img2img input image before using Qwen color boxes.")
    if data.get("source_size") != list(request.init_image.size):
        raise ValueError("The input image changed size. Apply the layout again.")
    if data.get("output_size") != [request.width, request.height]:
        raise ValueError("The output size changed. Apply the layout again or clear the color boxes.")
    from forge_neo.layout_plugin_compat import REGIONAL_BOXES_EXTENSION, active_layout_plugins, regional_boxes_data

    if REGIONAL_BOXES_EXTENSION in active_layout_plugins():
        script_args = dict(getattr(request, "script_args", None) or {})
        scripts = dict(script_args.get("alwayson_scripts") or {})
        for name in list(scripts):
            if str(name).strip().casefold() == "regional boxes":
                del scripts[name]
        scripts["Regional Boxes"] = {"args": [regional_boxes_data(data.get("boxes"))]}
        script_args["alwayson_scripts"] = scripts
        return replace(request, script_args=script_args)
    return replace(request, init_image=draw_qwen_boxes(request.init_image, data.get("boxes")))
