"""Validate the public MOSS Layout vocabulary without loading models."""
import json


def _object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f"Duplicate JSON field: {key}")
        value[key] = item
    return value


def _fields(value, allowed, required, location):
    if not isinstance(value, dict):
        raise ValueError(f"{location} must be an object")
    if value.keys() - allowed or required - value.keys():
        raise ValueError(f"{location} has unknown or missing fields")


def _text(value, location, *, allow_empty=False):
    if not isinstance(value, str):
        raise ValueError(f"{location} must be text")
    if not allow_empty and not value.strip():
        raise ValueError(f"{location} must be nonempty text")


def _strings(value, location):
    if not isinstance(value, list):
        raise ValueError(f"{location} must be a text array")
    for item in value:
        _text(item, location)


def validate_prompt(prompt, width=None, height=None):
    """Return a parsed compiled Layout, or None for an ordinary caption."""
    if not str(prompt).lstrip().startswith("{"):
        return None
    data = json.loads(prompt, object_pairs_hook=_object)
    keys = {"summary", "items", "bbox_coord_space", "bbox_format"}
    _fields(data, keys, keys, "Layout")
    if data["bbox_coord_space"] != "abs_centralized" or data["bbox_format"] != "yxyx":
        raise ValueError("Apply editable abs/xyxy drafts through the regional JSON editor before generation")
    summary = data["summary"]
    _fields(summary, {"caption", "meta", "canvas", "palette"}, {"caption"}, "summary")
    _text(summary["caption"], "summary.caption", allow_empty=True)
    if "canvas" in summary and summary["canvas"] not in ("single", "multi_panel", "collage"):
        raise ValueError("summary.canvas must be single, multi_panel or collage")
    for key in ("meta", "palette"):
        if key in summary:
            _strings(summary[key], f"summary.{key}")
    if not isinstance(data["items"], list) or not 1 <= len(data["items"]) <= 200:
        raise ValueError("Layout requires 1-200 flat items")
    for index, item in enumerate(data["items"]):
        location = f"items[{index}]"
        _fields(item, {"label", "caption", "bbox", "text", "tags", "palette"},
                {"label", "caption", "bbox"}, location)
        if item["label"] not in ("object", "character", "text"):
            raise ValueError(f"{location}.label must be object, character or text")
        _text(item["caption"], f"{location}.caption")
        if item["label"] == "text" or "text" in item:
            _text(item.get("text"), f"{location}.text")
        for key in ("tags", "palette"):
            if key in item:
                _strings(item[key], f"{location}.{key}")
        box = item["bbox"]
        if not isinstance(box, list) or len(box) != 4 or any(type(edge) is not int for edge in box):
            raise ValueError(f"{location}.bbox must contain four integer coordinates")
        y0, x0, y1, x1 = box
        if y0 >= y1 or x0 >= x1:
            raise ValueError(f"{location}.bbox must have positive width and height")
        if width and height and not (-width / 2 <= x0 < x1 <= width / 2 and -height / 2 <= y0 < y1 <= height / 2):
            raise ValueError(f"{location}.bbox exceeds the {width}x{height} output")
    return data
