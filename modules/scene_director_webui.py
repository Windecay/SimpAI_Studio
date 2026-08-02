import base64
import copy
import html
import io
import json
import logging
import mimetypes
import os
import re
import tempfile
from urllib.parse import quote

import gradio as gr
import numpy as np
from PIL import Image

import args_manager
import modules.canvas_workbench_director as canvas_workbench_director
import modules.html as html_module
import simpleai_base.api_params as api_params
from ui.update_helpers import gr_update

logger = logging.getLogger(__name__)

SCENE_DIRECTOR_MAX_IMAGE_REFS = 5
SCENE_DIRECTOR_TABLE_HEADERS = ["Start", "End", "Prompt", "Image ref 1", "Image ref 2", "Image ref 3", "Image ref 4", "Image ref 5", "Audio ref", "Video ref"]
SCENE_DIRECTOR_DEFAULT_ROWS = [
    [0, 5, "A slow camera move across a neon street.", "image_1", "", "", "", "", "", ""],
    [5, 10, "The subject turns toward the light.", "", "", "", "", "", "", ""],
]
SCENE_DIRECTOR_MEDIA_RULES = "0 image = Text-to-Video | 1 image = Image-to-Video / first frame | 2 images = First/last frame | 3-5 images = Reference set | previous_segment_last_frame = previous shot last frame | audio_1-5 / video_1-5 = media refs | previous_segment = previous shot result"
SCENE_DIRECTOR_README_LABEL = "Director README"
SCENE_DIRECTOR_README_PATH = os.path.join("docs", "director-workspace", "README.md")
SCENE_DIRECTOR_IMAGE_SLOTS = [
    ("image_1", "Director image 1"),
    ("image_2", "Director image 2"),
    ("image_3", "Director image 3"),
    ("image_4", "Director image 4"),
    ("image_5", "Director image 5"),
]
SCENE_DIRECTOR_AUDIO_SLOTS = [
    ("audio_1", "Director audio 1"),
    ("audio_2", "Director audio 2"),
    ("audio_3", "Director audio 3"),
    ("audio_4", "Director audio 4"),
    ("audio_5", "Director audio 5"),
]
SCENE_DIRECTOR_VIDEO_SLOTS = [
    ("video_1", "Director video 1"),
    ("video_2", "Director video 2"),
    ("video_3", "Director video 3"),
    ("video_4", "Director video 4"),
    ("video_5", "Director video 5"),
]
SCENE_DIRECTOR_PREVIOUS_VIDEO_REF = "previous_segment"
SCENE_DIRECTOR_PREVIOUS_IMAGE_REF = "previous_segment_last_frame"
SCENE_DIRECTOR_IMAGE_REFS = {ref for ref, _label in SCENE_DIRECTOR_IMAGE_SLOTS}
SCENE_DIRECTOR_AUDIO_REFS = {ref for ref, _label in SCENE_DIRECTOR_AUDIO_SLOTS}
SCENE_DIRECTOR_VIDEO_REFS = {ref for ref, _label in SCENE_DIRECTOR_VIDEO_SLOTS}
SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS = [
    "scene_canvas_image",
    "scene_input_image1",
    "scene_input_image2",
    "scene_input_image3",
    "scene_input_image4",
]
SCENE_DIRECTOR_FORMATS = ["Wan", "LTXV", "Mochi", "Hunyuan", "Cosmos", "AnimateDiff", "None"]
SCENE_DIRECTOR_FORMAT_ALIASES = {
    "": "",
    "none": "None",
    "wan": "Wan",
    "wan2": "Wan",
    "wan2.1": "Wan",
    "wan2.2": "Wan",
    "dasiwa": "Wan",
    "ltx": "LTXV",
    "ltxv": "LTXV",
    "ltxv ta2v": "LTXV",
    "ltxv_ta2v": "LTXV",
    "ltxv-ta2v": "LTXV",
    "ta2v": "LTXV",
    "mochi": "Mochi",
    "hunyuan": "Hunyuan",
    "cosmos": "Cosmos",
    "animatediff": "AnimateDiff",
    "animate_diff": "AnimateDiff",
    "animate-diff": "AnimateDiff",
}
SCENE_DIRECTOR_LEGACY_METHOD_ALIASES = {
    "t2v": "wan2.2_t2v_cn",
    "flf": "wan2.2_cn",
    "fmlf": "wan2.2_cn",
    "ref": "wan2.2_cn",
}
SCENE_DIRECTOR_COMPAT_TYPES = set(SCENE_DIRECTOR_LEGACY_METHOD_ALIASES)
SCENE_DIRECTOR_IMAGE_POLICIES = {"optional", "required", "forbidden"}
SCENE_DIRECTOR_MEDIA_POLICIES = {"optional", "required", "forbidden"}
SCENE_DIRECTOR_DEFAULT_SEGMENT_DURATION_PARAM = "scene_video_duration"
SCENE_DIRECTOR_DURATION_STRATEGIES = {"shot", "audio_min", "video_min"}
SCENE_DIRECTOR_AUDIO_OUTPUT_MODES = {"silent", "generated", "input_audio", "source_audio"}
SCENE_DIRECTOR_DURATION_PARAM_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
SCENE_DIRECTOR_DEFAULT_CAPABILITY = {
    "image_policy": "optional",
    "audio_policy": "optional",
    "video_policy": "optional",
    "timeline_format": "Wan",
    "max_images": SCENE_DIRECTOR_MAX_IMAGE_REFS,
    "min_images": 0,
    "image_modes": ["none", "first_frame", "first_last", "reference_set"],
    "video_modes": ["explicit"],
    "chain_output": "timeline",
    "requires_sequential": False,
    "mixed_segments": True,
    "director_supported": True,
    "segment_duration_param": SCENE_DIRECTOR_DEFAULT_SEGMENT_DURATION_PARAM,
    "duration_strategy": "shot",
    "audio_output": "silent",
    "min_segment_duration": 0.1,
    "max_segment_duration": 10.0,
    "source": "inferred",
}


def _scene_director_rows(value):
    def _first_media_ref(item, key, ref_key):
        direct = item.get(ref_key)
        if direct:
            return direct
        media = item.get(key)
        if isinstance(media, list):
            for media_item in media:
                if isinstance(media_item, dict):
                    ref = media_item.get("source_ref") or media_item.get("source_node_id")
                    if ref:
                        return ref
        if isinstance(media, dict):
            return media.get("source_ref") or media.get("source_node_id") or ""
        return media or ""

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except Exception:
            return []
        if isinstance(parsed, dict):
            parsed = parsed.get("shots") or parsed.get("rows") or []
        if isinstance(parsed, list):
            rows = []
            for item in parsed:
                if isinstance(item, dict):
                    image_values = []
                    images = item.get("images")
                    if isinstance(images, list):
                        for image_item in images[:SCENE_DIRECTOR_MAX_IMAGE_REFS]:
                            if isinstance(image_item, dict):
                                image_values.append(image_item.get("source_ref", ""))
                    for image_index in range(1, SCENE_DIRECTOR_MAX_IMAGE_REFS + 1):
                        key = f"image_ref_{image_index}"
                        if len(image_values) < image_index:
                            image_values.append(item.get(key, item.get(f"image{image_index}", "")))
                    image_values = (image_values + [""] * SCENE_DIRECTOR_MAX_IMAGE_REFS)[:SCENE_DIRECTOR_MAX_IMAGE_REFS]
                    rows.append([
                        item.get("start", 0),
                        item.get("end", 0),
                        item.get("prompt", ""),
                        *image_values,
                        _first_media_ref(item, "audio", "audio_ref"),
                        _first_media_ref(item, "video", "video_ref"),
                    ])
                else:
                    rows.append(item)
            return rows
        return []
    if value is None:
        return []
    if hasattr(value, "values"):
        try:
            return value.values.tolist()
        except Exception:
            return []
    if hasattr(value, "tolist"):
        try:
            return value.tolist()
        except Exception:
            return []
    return value if isinstance(value, list) else []


def _scene_director_active_row_index(value):
    parsed = value
    if isinstance(value, str):
        try:
            parsed = json.loads(value.strip()) if value.strip() else {}
        except Exception:
            parsed = {}
    if not isinstance(parsed, dict):
        return 0
    for key in ("active_index", "active_segment_index", "selected_segment_index"):
        try:
            return max(0, int(parsed.get(key)))
        except Exception:
            continue
    return 0


def scene_director_default_editor_json():
    return json.dumps(SCENE_DIRECTOR_DEFAULT_ROWS, ensure_ascii=False)


def render_scene_director_editor_shell():
    return (
        '<div class="scene-director-editor" id="scene_director_editor_root" data-scene-director-editor>'
        '<div class="scene-director-editor-head">'
        '<span data-scene-director-title>Shots</span>'
        '<button type="button" data-scene-director-action="add">Add shot</button>'
        '</div>'
        '<div class="scene-director-shot-list" data-scene-director-shot-list></div>'
        '<div class="scene-director-timeline-preview" data-scene-director-timeline-preview>'
        '<div class="scene-director-timeline-preview-head">'
        '<span data-scene-director-timeline-title>Timeline preview</span>'
        '<small data-scene-director-timeline-meta></small>'
        '</div>'
        '<div class="scene-director-timeline-ruler" data-scene-director-timeline-ruler></div>'
        '<div class="scene-director-timeline-video-track" data-scene-director-timeline-video-track></div>'
        '<div class="scene-director-timeline-audio-track" data-scene-director-timeline-audio-track></div>'
        '<div class="scene-director-timeline-prompt-track" data-scene-director-timeline-prompt-track></div>'
        '</div>'
        '</div>'
    )


def _scene_director_image_data_uri(value):
    try:
        from modules.meta_parser import extract_scene_image

        image = extract_scene_image(value)
    except Exception:
        image = value
    if image is None:
        return ""
    try:
        if isinstance(image, Image.Image):
            pil = image
        else:
            array = np.asarray(image)
            if array.size == 0:
                return ""
            if array.dtype != np.uint8:
                array = np.clip(array, 0, 255).astype(np.uint8)
            if array.ndim == 2:
                pil = Image.fromarray(array, mode="L")
            else:
                pil = Image.fromarray(array)
        if pil.mode not in ("RGB", "RGBA"):
            pil = pil.convert("RGBA")
        pil = pil.copy()
        pil.thumbnail((160, 120))
        buffer = io.BytesIO()
        pil.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return ""


def _scene_director_pil_thumb_data_uri(image):
    try:
        if not isinstance(image, Image.Image):
            return ""
        pil = image.copy()
        if pil.mode not in ("RGB", "RGBA"):
            pil = pil.convert("RGB")
        pil.thumbnail((240, 135))
        buffer = io.BytesIO()
        pil.save(buffer, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")
    except Exception:
        return ""


def _scene_director_video_thumb_data_uri(path):
    if not isinstance(path, str) or not path or not os.path.exists(path):
        return ""
    try:
        import cv2
    except Exception:
        return ""
    capture = None
    try:
        capture = cv2.VideoCapture(path)
        if not capture or not capture.isOpened():
            return ""
        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        candidates = []
        if frame_count > 0:
            if fps > 0:
                candidates.append(min(frame_count - 1, max(0, int(fps * 0.5))))
                candidates.append(min(frame_count - 1, max(0, int(fps * 1.0))))
            candidates.extend([max(0, int(frame_count * 0.1)), max(0, frame_count // 2), 0])
        else:
            candidates.append(0)
        best_frame = None
        best_score = -1.0
        for frame_index in dict.fromkeys(candidates):
            try:
                capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
                ok, frame = capture.read()
            except Exception:
                ok, frame = False, None
            if not ok or frame is None:
                continue
            try:
                score = float(frame.mean())
            except Exception:
                score = 0.0
            if score > best_score:
                best_frame = frame
                best_score = score
            if score > 8.0:
                break
        if best_frame is None:
            return ""
        rgb = cv2.cvtColor(best_frame, cv2.COLOR_BGR2RGB)
        return _scene_director_pil_thumb_data_uri(Image.fromarray(rgb))
    except Exception:
        return ""
    finally:
        try:
            if capture is not None:
                capture.release()
        except Exception:
            pass


def _scene_director_media_state(value):
    groups = _scene_director_media_state_groups(value)
    merged = {}
    for key in ("images", "audio", "video"):
        merged.update(groups.get(key) or {})
    return merged


def _scene_director_slot_kind(ref):
    text = str(ref or "").strip().lower()
    if text in SCENE_DIRECTOR_IMAGE_REFS:
        return "images"
    if text in SCENE_DIRECTOR_AUDIO_REFS:
        return "audio"
    if text in SCENE_DIRECTOR_VIDEO_REFS:
        return "video"
    return ""


def _scene_director_media_state_groups(value):
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return {"images": {}, "audio": {}, "video": {}}
        try:
            parsed = json.loads(text)
        except Exception:
            return {"images": {}, "audio": {}, "video": {}}
    else:
        parsed = value if isinstance(value, dict) else {}
    result = {"images": {}, "audio": {}, "video": {}}
    for group_key in result:
        group = parsed.get(group_key) if isinstance(parsed.get(group_key), dict) else {}
        for ref, item in group.items():
            if isinstance(item, dict):
                result[group_key][str(ref)] = item
    if not any(result.values()):
        for ref, item in parsed.items() if isinstance(parsed, dict) else []:
            kind = _scene_director_slot_kind(ref)
            if kind and isinstance(item, dict):
                result[kind][str(ref)] = item
    return result


def _scene_director_media_state_json(groups):
    safe = {"images": {}, "audio": {}, "video": {}}
    for key in safe:
        group = groups.get(key) if isinstance(groups, dict) else {}
        safe[key] = group if isinstance(group, dict) else {}
    return json.dumps(safe, ensure_ascii=False)


def _scene_director_static_file_url(path):
    web_path = path.replace(os.sep, "/").lstrip("/")
    return f"/file={quote(web_path, safe=':/')}"


def render_scene_director_media_rules():
    readme_url = _scene_director_static_file_url(SCENE_DIRECTOR_README_PATH)
    return (
        '<div class="scene-director-media-rules">'
        f'<span class="scene-director-media-rules-text" data-scene-director-rules-text="1" '
        f'data-original-text="{html.escape(SCENE_DIRECTOR_MEDIA_RULES, quote=True)}">'
        f'{html.escape(SCENE_DIRECTOR_MEDIA_RULES)}'
        '</span>'
        f'<a class="scene-director-readme-link" data-scene-director-readme-link="1" '
        f'data-original-text="{html.escape(SCENE_DIRECTOR_README_LABEL, quote=True)}" '
        f'href="{html.escape(readme_url, quote=True)}" target="_blank" rel="noopener noreferrer">'
        f'{html.escape(SCENE_DIRECTOR_README_LABEL)}'
        '</a>'
        '</div>'
    )


def render_scene_director_media_preview(media_state=None):
    media = _scene_director_media_state(media_state)

    def _tile(ref, label, kind):
        item = media.get(ref) if isinstance(media.get(ref), dict) else {}
        src = str(item.get("thumb") or item.get("data_url") or item.get("src") or "")
        path = str(item.get("path") or item.get("output_path") or item.get("original_output_path") or "")
        name = str(item.get("name") or item.get("title") or label)
        has_media = bool(src or path)
        if kind == "image" and src:
            body = f'<img src="{html.escape(src, quote=True)}" alt="">' if src else '<span class="scene-director-empty-image">Drop</span>'
        elif kind == "video" and src:
            body = f'<img src="{html.escape(src, quote=True)}" alt="">'
        else:
            icon = "♪" if kind == "audio" else "▶"
            empty_text = "Click or drop" if not has_media else icon
            body = f'<span class="scene-director-empty-image">{html.escape(empty_text)}</span>'
        classes = "scene-director-media-tile"
        if has_media:
            classes += " has-image has-media"
        return (
            f'<div class="{classes}"'
            f' data-scene-director-ref="{html.escape(ref, quote=True)}"'
            f' data-scene-director-kind="{html.escape(kind, quote=True)}"'
            f' data-scene-director-src="{html.escape(src, quote=True)}"'
            f' data-scene-director-path="{html.escape(path, quote=True)}"'
            f' data-scene-director-label="{html.escape(name, quote=True)}">'
            '<button type="button" class="scene-director-media-drop" data-scene-director-media-drop>'
            f'{body}'
            '</button>'
            '<button type="button" class="scene-director-media-clear" data-scene-director-media-clear title="Clear">×</button>'
            f'<b>{html.escape(ref)}</b><small>{html.escape(name)}</small>'
            '</div>'
        )

    groups = (
        ("Images", "images", "image", SCENE_DIRECTOR_IMAGE_SLOTS),
        ("Audio", "audio", "audio", SCENE_DIRECTOR_AUDIO_SLOTS),
        ("Video", "video", "video", SCENE_DIRECTOR_VIDEO_SLOTS),
    )
    sections = []
    for title, group_key, kind, slots in groups:
        tiles = []
        for ref, label in slots:
            tiles.append(_tile(ref, label, kind))
        sections.append(
            '<section class="scene-director-media-group"'
            f' data-scene-director-kind-group="{html.escape(group_key, quote=True)}">'
            '<div class="scene-director-media-group-head">'
            f'<strong data-scene-director-media-group-title="{html.escape(title, quote=True)}" data-original-text="{html.escape(title, quote=True)}">{html.escape(title)}</strong>'
            '<span class="scene-director-media-upload-hint" data-original-text="Click or drop">Click or drop</span>'
            '</div>'
            '<div class="scene-director-media-grid">'
            + ''.join(tiles)
            + '</div></section>'
        )
    return '<div class="scene-director-media-preview">' + ''.join(sections) + '</div>'


def _scene_director_file_list(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        candidates = value
    else:
        candidates = [value]
    results = []
    for item in candidates:
        path = None
        if isinstance(item, str):
            path = item
        elif isinstance(item, dict):
            for key in ("path", "name", "orig_name", "filename", "file"):
                if isinstance(item.get(key), str) and item.get(key).strip():
                    path = item.get(key).strip()
                    break
        elif hasattr(item, "name"):
            try:
                path = str(item.name)
            except Exception:
                path = None
        if isinstance(path, str) and path.strip():
            results.append(path.strip())
    return results


def _scene_director_file_record(path, kind, ref):
    title = os.path.basename(path) if isinstance(path, str) and path else ref
    mime = mimetypes.guess_type(path)[0] if isinstance(path, str) else None
    try:
        size = os.path.getsize(path) if isinstance(path, str) and os.path.exists(path) else None
    except Exception:
        size = None
    record = {
        "type": kind,
        "name": title,
        "title": title,
        "mime": mime or ("audio/wav" if kind == "audio" else "video/mp4"),
        "size": size,
        "path": path,
    }
    if kind == "video":
        thumb = _scene_director_video_thumb_data_uri(path)
        if thumb:
            record["thumb"] = thumb
    return record


def update_scene_director_media_files(media_state=None, audio_files=None, video_files=None):
    groups = _scene_director_media_state_groups(media_state)
    images = groups.get("images") if isinstance(groups.get("images"), dict) else {}
    audio = {}
    video = {}
    for index, path in enumerate(_scene_director_file_list(audio_files)[:len(SCENE_DIRECTOR_AUDIO_SLOTS)]):
        ref = SCENE_DIRECTOR_AUDIO_SLOTS[index][0]
        audio[ref] = _scene_director_file_record(path, "audio", ref)
    for index, path in enumerate(_scene_director_file_list(video_files)[:len(SCENE_DIRECTOR_VIDEO_SLOTS)]):
        ref = SCENE_DIRECTOR_VIDEO_SLOTS[index][0]
        video[ref] = _scene_director_file_record(path, "video", ref)
    next_groups = {"images": images, "audio": audio, "video": video}
    next_state = _scene_director_media_state_json(next_groups)
    return next_state, render_scene_director_media_preview(next_state)


def _scene_director_float(value, default=0.0, minimum=0.0, maximum=86400.0):
    try:
        result = float(value)
    except Exception:
        result = float(default)
    return max(float(minimum), min(float(maximum), result))


def _scene_director_int(value, default=0, minimum=0, maximum=8192):
    return int(round(_scene_director_float(value, default, minimum, maximum)))


def _scene_director_bool(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in ("0", "false", "no", "off", "")
    return bool(value)


def _scene_director_ref(value, kind):
    text = str(value or "").strip()
    if not text:
        return ""
    compact = text.lower().replace("@", "").replace("-", "_").replace(" ", "_")
    image_aliases = {
        "scene_canvas_image": "image_1",
        "canvas": "image_1",
        "main": "image_1",
        "scene_input_image1": "image_2",
        "scene_input_image2": "image_3",
        "scene_input_image3": "image_4",
        "scene_input_image4": "image_5",
    }
    audio_aliases = {
        "scene_audio": "audio_1",
        "audio": "audio_1",
        "qwen": "audio_1",
        "tts": "audio_1",
    }
    video_aliases = {
        "scene_video": "video_1",
        "video": "video_1",
        "reference_video": "video_1",
        "ref_video": "video_1",
    }
    if kind == "image" and compact in image_aliases:
        return image_aliases[compact]
    if kind == "audio" and compact in audio_aliases:
        return audio_aliases[compact]
    if kind == "video" and compact in video_aliases:
        return video_aliases[compact]
    if kind == "image":
        if compact in (
            "previous_segment_last_frame",
            "previous_last_frame",
            "previous_tail",
            "prev_tail",
            "上一段尾帧",
            "继承上段尾帧",
        ):
            return SCENE_DIRECTOR_PREVIOUS_IMAGE_REF
        match = re.match(r"^(?:image_?|img_?)(\d+)$", compact)
        if match:
            return f"image_{match.group(1)}"
    if kind == "audio":
        match = re.match(r"^(?:audio_?|aud_?)(\d+)$", compact)
        if match:
            return f"audio_{match.group(1)}"
    if kind == "video":
        if compact in ("previous_segment", "previous", "prev", "last_result", "上一段", "上一段结果"):
            return SCENE_DIRECTOR_PREVIOUS_VIDEO_REF
        match = re.match(r"^(?:video_?|vid_?)(\d+)$", compact)
        if match:
            return f"video_{match.group(1)}"
    return compact if compact.startswith(f"{kind}_") else ""


def _scene_director_image_refs(*values):
    refs = []
    for value in values:
        ref = _scene_director_ref(value, "image")
        if ref and ref not in refs:
            refs.append(ref)
    return refs[:SCENE_DIRECTOR_MAX_IMAGE_REFS]


def _scene_director_image_ref_limit(capability=None):
    capability = capability if isinstance(capability, dict) else {}
    image_policy = str(capability.get("image_policy") or "").lower()
    if image_policy == "forbidden":
        return 0
    return _scene_director_int_capability_value(
        capability.get("max_images"),
        SCENE_DIRECTOR_MAX_IMAGE_REFS,
        0,
        SCENE_DIRECTOR_MAX_IMAGE_REFS,
    )


def _scene_director_previous_image_supported(capability=None):
    capability = capability if isinstance(capability, dict) else {}
    if str(capability.get("image_policy") or "optional").lower() == "forbidden":
        return False
    modes = {str(item or "").strip().lower() for item in (capability.get("image_modes") or [])}
    if not modes:
        return True
    return bool(modes.intersection({"first_frame", "first_last", "ordered_keyframes"}))


def _scene_director_method_alias_key(value):
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _scene_director_task_method(value, default=""):
    text = str(value or "").strip()
    if not text:
        return default
    return SCENE_DIRECTOR_LEGACY_METHOD_ALIASES.get(_scene_director_method_alias_key(text), text)


def _scene_director_segment_type(task_method="", image_refs=None, audio_ref="", video_ref=""):
    refs = [str(item or "").strip() for item in (image_refs or []) if str(item or "").strip()]
    if len(refs) >= 3:
        return "ref"
    if len(refs) == 2:
        return "fmlf"
    if len(refs) == 1:
        return "flf"
    if not refs and not audio_ref and not video_ref:
        return "t2v"
    key = _scene_director_method_alias_key(task_method)
    if key in SCENE_DIRECTOR_COMPAT_TYPES:
        return key
    lower = str(task_method or "").strip().lower()
    if "t2v" in lower and not refs and not audio_ref and not video_ref:
        return "t2v"
    if refs and ("extent" in lower or "last" in lower):
        return "fmlf"
    if refs and ("i2v" in lower or lower in ("wan2.2_cn", "wan2.2")):
        return "flf"
    if refs or audio_ref or video_ref:
        return "ref"
    return "t2v"


def _scene_director_scene_frontend(state_params):
    if not isinstance(state_params, dict):
        return {}
    scenes = state_params.get("scene_frontend", {})
    if isinstance(scenes, dict) and scenes:
        return scenes
    default_engine = state_params.get("default_engine", {})
    default_scenes = default_engine.get("scene_frontend", {}) if isinstance(default_engine, dict) else {}
    if isinstance(default_scenes, dict) and default_scenes:
        return default_scenes
    if isinstance(scenes, dict):
        return scenes
    preset_prepared = state_params.get("__preset_prepared", {})
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    scenes = engine.get("scene_frontend", {}) if isinstance(engine, dict) else {}
    return scenes if isinstance(scenes, dict) else {}


def _scene_director_theme_from_state(state_params, scene_theme=None):
    text = str(scene_theme or "").strip()
    if text:
        return text
    if isinstance(state_params, dict):
        text = str(state_params.get("scene_theme") or "").strip()
        if text:
            return text
    scenes = _scene_director_scene_frontend(state_params)
    themes = scenes.get("theme", [])
    if isinstance(themes, str):
        return themes
    if isinstance(themes, (list, tuple)):
        for theme in themes:
            text = str(theme or "").strip()
            if text:
                return text
    return ""


def _scene_director_task_method_from_state(state_params=None, scene_theme=None, fallback="wan2.2_t2v_cn"):
    theme = _scene_director_theme_from_state(state_params, scene_theme)
    scenes = _scene_director_scene_frontend(state_params)
    try:
        import modules.meta_parser as meta_parser

        task_method = meta_parser.get_scene_task_method(scenes, theme)
    except Exception:
        task_method = ""
    if not task_method and isinstance(state_params, dict):
        raw = state_params.get("task_method", "")
        if isinstance(raw, dict):
            task_method = raw.get(theme, "") or (next(iter(raw.values()), "") if raw else "")
        elif isinstance(raw, list):
            task_method = raw[0] if raw else ""
        else:
            task_method = raw
    if not task_method and isinstance(state_params, dict):
        preset_prepared = state_params.get("__preset_prepared", {})
        engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
        backend = engine.get("backend_params", {}) if isinstance(engine, dict) else {}
        task_method = backend.get("task_method", "") if isinstance(backend, dict) else ""
    return str(task_method or fallback).strip()


def _scene_director_normalize_timeline_format(value):
    text = str(value or "").strip()
    key = _scene_director_method_alias_key(text)
    if key in SCENE_DIRECTOR_FORMAT_ALIASES:
        return SCENE_DIRECTOR_FORMAT_ALIASES[key]
    for item in SCENE_DIRECTOR_FORMATS:
        if text.lower() == item.lower():
            return item
    return ""


def _scene_director_timeline_format_from_state(state_params=None, scene_theme=None, fallback="Wan"):
    theme = _scene_director_theme_from_state(state_params, scene_theme)
    scenes = _scene_director_scene_frontend(state_params)
    explicit = _scene_director_explicit_capability(state_params, scene_theme)
    candidates = [
        _scene_director_theme_value(explicit.get("timeline_format"), theme) if isinstance(explicit, dict) else None,
        _scene_director_theme_value(explicit.get("target_format"), theme) if isinstance(explicit, dict) else None,
        _scene_director_theme_value(scenes.get("director_timeline_format"), theme) if isinstance(scenes, dict) else None,
        _scene_director_theme_value(scenes.get("timeline_format"), theme) if isinstance(scenes, dict) else None,
    ]
    if isinstance(state_params, dict):
        candidates.extend([
            _scene_director_theme_value(state_params.get("director_timeline_format"), theme),
            _scene_director_theme_value(state_params.get("timeline_format"), theme),
        ])
    for candidate in candidates:
        normalized = _scene_director_normalize_timeline_format(candidate)
        if normalized:
            return normalized

    task_method = _scene_director_task_method_from_state(state_params, scene_theme, "")
    preset = str(state_params.get("__preset") or "") if isinstance(state_params, dict) else ""
    lookup_text = " ".join(str(item or "").lower() for item in (task_method, preset, theme))
    if "ltx" in lookup_text or "ta2v" in lookup_text:
        return "LTXV"
    if "mochi" in lookup_text:
        return "Mochi"
    if "hunyuan" in lookup_text:
        return "Hunyuan"
    if "cosmos" in lookup_text:
        return "Cosmos"
    if "animatediff" in lookup_text or "animate_diff" in lookup_text or "animate-diff" in lookup_text:
        return "AnimateDiff"
    if "wan" in lookup_text or "dasiwa" in lookup_text:
        return "Wan"

    normalized_fallback = _scene_director_normalize_timeline_format(fallback)
    return normalized_fallback or SCENE_DIRECTOR_DEFAULT_CAPABILITY["timeline_format"]


def _scene_director_lang(state_params=None):
    lang = state_params.get("__lang") if isinstance(state_params, dict) else None
    try:
        import enhanced.simpleai as simpleai

        return simpleai.normalize_ui_lang(lang or args_manager.args.language)
    except Exception:
        text = str(lang or getattr(args_manager.args, "language", "") or "").lower()
        return "en" if text.startswith("en") else "zh"


def _scene_director_text(state_params, en, cn):
    return en if _scene_director_lang(state_params) == "en" else (cn or en)


def _scene_director_theme_value(value, theme=None, default=None):
    if isinstance(value, dict):
        if theme and theme in value:
            return value.get(theme)
        if "default" in value:
            return value.get("default")
        if value:
            return next(iter(value.values()))
        return default
    return value if value is not None else default


def _scene_director_capability_candidate(value, theme=None):
    if not isinstance(value, dict):
        return {}
    known = {
        "image_policy",
        "audio_policy",
        "video_policy",
        "max_images",
        "min_images",
        "image_modes",
        "video_modes",
        "timeline_format",
        "target_format",
        "chain_output",
        "requires_sequential",
        "mixed_segments",
        "director_supported",
        "segment_duration_param",
        "duration_strategy",
        "audio_output",
        "min_segment_duration",
        "max_segment_duration",
    }
    if known.intersection(value.keys()):
        return value
    themed = value.get(theme) if theme and isinstance(value.get(theme), dict) else None
    if themed is not None:
        return themed
    default = value.get("default") if isinstance(value.get("default"), dict) else None
    if default is not None:
        return default
    return {}


def _scene_director_engine_type_from_state(state_params=None):
    if not isinstance(state_params, dict):
        return ""
    preset_prepared = state_params.get("__preset_prepared", {})
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    default_engine = state_params.get("default_engine", {})
    return str(
        state_params.get("engine_type")
        or (default_engine.get("engine_type") if isinstance(default_engine, dict) else "")
        or (engine.get("engine_type") if isinstance(engine, dict) else "")
        or ""
    ).strip().lower()


def _scene_director_explicit_capability(state_params=None, scene_theme=None):
    if not isinstance(state_params, dict):
        return {}
    theme = _scene_director_theme_from_state(state_params, scene_theme)
    scenes = _scene_director_scene_frontend(state_params)
    default_engine = state_params.get("default_engine", {})
    default_scenes = default_engine.get("scene_frontend", {}) if isinstance(default_engine, dict) else {}
    preset_prepared = state_params.get("__preset_prepared", {})
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    engine_scenes = engine.get("scene_frontend", {}) if isinstance(engine, dict) else {}
    candidates = [
        state_params.get("director_capability"),
        state_params.get("__director_capability"),
        scenes.get("director_capability") if isinstance(scenes, dict) else None,
        default_engine.get("director_capability") if isinstance(default_engine, dict) else None,
        default_scenes.get("director_capability") if isinstance(default_scenes, dict) else None,
        engine.get("director_capability") if isinstance(engine, dict) else None,
        engine_scenes.get("director_capability") if isinstance(engine_scenes, dict) else None,
    ]
    for candidate in candidates:
        capability = _scene_director_capability_candidate(candidate, theme)
        if capability:
            return capability
    return {}


def _scene_director_int_capability_value(value, default, minimum=0, maximum=SCENE_DIRECTOR_MAX_IMAGE_REFS):
    try:
        result = int(value)
    except Exception:
        result = int(default)
    return max(int(minimum), min(int(maximum), result))


def _scene_director_number_capability_value(value, default, minimum=0.05, maximum=86400.0):
    try:
        result = float(value)
    except Exception:
        result = float(default)
    return max(float(minimum), min(float(maximum), result))


def _scene_director_segment_duration_param(value, default=SCENE_DIRECTOR_DEFAULT_SEGMENT_DURATION_PARAM):
    text = str(value or default or "").strip()
    if not text:
        return ""
    return text if SCENE_DIRECTOR_DURATION_PARAM_RE.match(text) else str(default or "").strip()


def _scene_director_duration_strategy(value, default="shot"):
    text = str(value or default or "").strip().lower().replace("-", "_")
    return text if text in SCENE_DIRECTOR_DURATION_STRATEGIES else default


def _scene_director_audio_output_mode(value, default="silent"):
    text = str(value or default or "").strip().lower().replace("-", "_")
    return text if text in SCENE_DIRECTOR_AUDIO_OUTPUT_MODES else default


def _scene_director_policy_value(value, allowed, default):
    text = str(value or "").strip().lower()
    return text if text in allowed else default


def _scene_director_infer_image_policy(state_params=None, scene_theme=None):
    if _scene_director_engine_type_from_state(state_params) and _scene_director_engine_type_from_state(state_params) != "video":
        return "forbidden"
    scenes = _scene_director_scene_frontend(state_params)
    disvisible = scenes.get("disvisible", []) if isinstance(scenes, dict) else []
    if not isinstance(disvisible, list):
        disvisible = []
    hidden = {str(item) for item in disvisible}
    task_method = _scene_director_task_method_from_state(state_params, scene_theme, "")
    task_lower = str(task_method or "").strip().lower()
    if "t2v" in task_lower:
        return "forbidden"
    if "i2v" in task_lower or "ia2v" in task_lower or task_lower in ("wan2.2_cn", "wan2.2"):
        return "required"
    resolution_control = scenes.get("resolution_control", {}) if isinstance(scenes, dict) else {}
    if isinstance(resolution_control, dict):
        source = str(_scene_director_theme_value(resolution_control.get("source"), scene_theme, "") or "").lower()
        if source in ("scene_canvas", "scene_canvas_image"):
            return "required"
    if "scene_canvas_image" in hidden and "scene_input_image1" in hidden:
        return "forbidden"
    return "optional"


def _scene_director_visible_image_slot_count(state_params=None):
    scenes = _scene_director_scene_frontend(state_params)
    disvisible = scenes.get("disvisible", []) if isinstance(scenes, dict) else []
    hidden = {str(item) for item in disvisible} if isinstance(disvisible, list) else set()
    count = sum(1 for slot in SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS if slot not in hidden)
    return max(0, min(SCENE_DIRECTOR_MAX_IMAGE_REFS, count))


def _scene_director_capability_from_state(state_params=None, scene_theme=None):
    explicit = _scene_director_explicit_capability(state_params, scene_theme)
    scenes = _scene_director_scene_frontend(state_params)
    theme = _scene_director_theme_from_state(state_params, scene_theme)
    inferred_policy = _scene_director_infer_image_policy(state_params, scene_theme)
    image_policy = _scene_director_policy_value(
        explicit.get("image_policy"),
        SCENE_DIRECTOR_IMAGE_POLICIES,
        inferred_policy,
    )
    audio_policy = _scene_director_policy_value(
        explicit.get("audio_policy"),
        SCENE_DIRECTOR_MEDIA_POLICIES,
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["audio_policy"],
    )
    video_policy = _scene_director_policy_value(
        explicit.get("video_policy"),
        SCENE_DIRECTOR_MEDIA_POLICIES,
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["video_policy"],
    )
    visible_images = _scene_director_visible_image_slot_count(state_params)
    default_max_images = 0 if image_policy == "forbidden" else (visible_images or SCENE_DIRECTOR_MAX_IMAGE_REFS)
    max_images = _scene_director_int_capability_value(explicit.get("max_images"), default_max_images)
    if image_policy == "forbidden":
        max_images = 0
    min_default = 1 if image_policy == "required" else 0
    min_images = _scene_director_int_capability_value(explicit.get("min_images"), min_default, 0, max(0, max_images))
    image_modes = explicit.get("image_modes")
    if not isinstance(image_modes, list) or not image_modes:
        if image_policy == "forbidden":
            image_modes = ["none"]
        elif max_images >= 3:
            image_modes = ["none", "first_frame", "first_last", "reference_set"]
        elif max_images >= 2:
            image_modes = ["none", "first_frame", "first_last"]
        else:
            image_modes = ["none", "first_frame"]
    mixed_segments = explicit.get("mixed_segments")
    if mixed_segments is None:
        mixed_segments = image_policy == "optional"
    video_modes = explicit.get("video_modes")
    if not isinstance(video_modes, list) or not video_modes:
        video_modes = ["none"] if video_policy == "forbidden" else ["explicit"]
    timeline_format = _scene_director_timeline_format_from_state(state_params, scene_theme)
    chain_output = str(explicit.get("chain_output") or SCENE_DIRECTOR_DEFAULT_CAPABILITY["chain_output"]).strip()
    if chain_output not in ("timeline", "last_result"):
        chain_output = SCENE_DIRECTOR_DEFAULT_CAPABILITY["chain_output"]
    requires_sequential = explicit.get("requires_sequential")
    if requires_sequential is None:
        requires_sequential = chain_output == "last_result"
    default_duration_param = _scene_director_segment_duration_param(
        _scene_director_theme_value(scenes.get("director_segment_duration_param"), theme, SCENE_DIRECTOR_DEFAULT_SEGMENT_DURATION_PARAM)
        if isinstance(scenes, dict)
        else SCENE_DIRECTOR_DEFAULT_SEGMENT_DURATION_PARAM
    )
    segment_duration_param = _scene_director_segment_duration_param(
        explicit.get("segment_duration_param"),
        default_duration_param,
    )
    duration_strategy = _scene_director_duration_strategy(
        explicit.get("duration_strategy"),
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["duration_strategy"],
    )
    audio_output = _scene_director_audio_output_mode(
        explicit.get("audio_output"),
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["audio_output"],
    )
    min_duration_floor = 0.0 if duration_strategy in ("audio_min", "video_min") else 0.05
    default_min_segment_duration = _scene_director_number_capability_value(
        _scene_director_theme_value(scenes.get("video_duration_min", scenes.get("var_number_min")), theme, SCENE_DIRECTOR_DEFAULT_CAPABILITY["min_segment_duration"])
        if isinstance(scenes, dict)
        else SCENE_DIRECTOR_DEFAULT_CAPABILITY["min_segment_duration"],
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["min_segment_duration"],
        min_duration_floor,
        86400.0,
    )
    default_max_segment_duration = _scene_director_number_capability_value(
        _scene_director_theme_value(scenes.get("video_duration_max", scenes.get("var_number_max")), theme, SCENE_DIRECTOR_DEFAULT_CAPABILITY["max_segment_duration"])
        if isinstance(scenes, dict)
        else SCENE_DIRECTOR_DEFAULT_CAPABILITY["max_segment_duration"],
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["max_segment_duration"],
        default_min_segment_duration,
        86400.0,
    )
    min_segment_duration = _scene_director_number_capability_value(
        explicit.get("min_segment_duration"),
        default_min_segment_duration,
        min_duration_floor,
        86400.0,
    )
    max_segment_duration = _scene_director_number_capability_value(
        explicit.get("max_segment_duration"),
        default_max_segment_duration,
        min_segment_duration,
        86400.0,
    )
    return {
        **SCENE_DIRECTOR_DEFAULT_CAPABILITY,
        "image_policy": image_policy,
        "audio_policy": audio_policy,
        "video_policy": video_policy,
        "max_images": max_images,
        "min_images": min_images,
        "image_modes": [str(item) for item in image_modes],
        "video_modes": [str(item) for item in video_modes],
        "timeline_format": timeline_format,
        "chain_output": chain_output,
        "requires_sequential": bool(requires_sequential),
        "mixed_segments": bool(mixed_segments),
        "director_supported": bool(explicit.get("director_supported", SCENE_DIRECTOR_DEFAULT_CAPABILITY["director_supported"])),
        "segment_duration_param": segment_duration_param,
        "duration_strategy": duration_strategy,
        "audio_output": audio_output,
        "min_segment_duration": min_segment_duration,
        "max_segment_duration": max_segment_duration,
        "source": "explicit" if explicit else "inferred",
    }


def _scene_director_available_from_state(state_params=None, scene_theme=None, capability=None):
    resolved = capability if isinstance(capability, dict) else _scene_director_capability_from_state(state_params, scene_theme)
    if resolved.get("director_supported") is False:
        return False
    engine_type = _scene_director_engine_type_from_state(state_params)
    return not engine_type or engine_type == "video"


def _scene_director_first_segment_ref(segment, key):
    items = segment.get(key) if isinstance(segment, dict) else []
    if not isinstance(items, list) or not items:
        return ""
    first = items[0] if isinstance(items[0], dict) else {}
    return str(first.get("source_ref") or "").strip()


def _scene_director_segment_image_refs(segment):
    items = segment.get("images") if isinstance(segment, dict) else []
    refs = []
    if isinstance(items, list):
        for item in items:
            ref = str(item.get("source_ref") or "").strip() if isinstance(item, dict) else ""
            if ref and ref not in refs:
                refs.append(ref)
    return refs[:SCENE_DIRECTOR_MAX_IMAGE_REFS]


def _scene_director_image_role(shot_type, index, capability=None):
    if shot_type == "fmlf":
        return "last_frame" if index == 1 else "first_frame"
    if shot_type == "ref":
        return "reference"
    modes = capability.get("image_modes") if isinstance(capability, dict) else []
    modes = {str(item or "").strip().lower() for item in (modes or [])}
    if index == 0 and "last_frame" in modes and "first_frame" not in modes:
        return "last_frame"
    return "first_frame"


def _scene_director_row_media_refs(row, cells, has_legacy_method_column):
    if has_legacy_method_column:
        image_values = cells[4:4 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        audio_value = cells[4 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        video_value = cells[5 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        if len(row) <= 6:
            image_values = [cells[4]]
            audio_value = cells[5]
            video_value = ""
    elif len(row) >= 10:
        image_values = cells[3:3 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        audio_value = cells[3 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        video_value = cells[4 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
    elif len(row) >= 9:
        image_values = cells[3:3 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        audio_value = cells[3 + SCENE_DIRECTOR_MAX_IMAGE_REFS]
        video_value = ""
    elif len(row) >= 6:
        image_values = [cells[3], cells[4]]
        audio_value = cells[5]
        video_value = ""
    else:
        image_values = [cells[3]]
        audio_value = cells[4]
        video_value = ""
    return _scene_director_image_refs(*image_values), _scene_director_ref(audio_value, "audio"), _scene_director_ref(video_value, "video")


def _scene_director_media_sources(media_state=None):
    groups = _scene_director_media_state_groups(media_state)
    sources = {}

    def _add_source(ref, label, kind):
        group_key = "images" if kind == "image" else kind
        item = groups.get(group_key, {}).get(ref) if isinstance(groups.get(group_key, {}), dict) else {}
        item = item if isinstance(item, dict) else {}
        data_url = str(item.get("data_url") or item.get("src") or "")
        path = str(item.get("path") or item.get("output_path") or item.get("original_output_path") or "")
        title = str(item.get("name") or item.get("title") or label)
        record = {
            "node_id": "",
            "type": kind,
            "title": title,
            "source": "director_pool",
        }
        if data_url:
            record["asset"] = {
                "data_url": data_url,
                "thumb": str(item.get("thumb") or data_url),
                "mime": str(item.get("mime") or "image/png"),
                "name": title,
                "size": item.get("size"),
            }
        elif path:
            record["asset"] = {
                "path": path,
                "mime": str(item.get("mime") or mimetypes.guess_type(path)[0] or ""),
                "name": title,
                "size": item.get("size"),
            }
        sources[ref] = record

    for ref, label in SCENE_DIRECTOR_IMAGE_SLOTS:
        _add_source(ref, label, "image")
    for ref, label in SCENE_DIRECTOR_AUDIO_SLOTS:
        _add_source(ref, label, "audio")
    for ref, label in SCENE_DIRECTOR_VIDEO_SLOTS:
        _add_source(ref, label, "video")
    return sources


def _scene_director_used_image_refs(runtime):
    refs = []

    def add_ref(value):
        ref = _scene_director_ref(value, "image")
        if ref and ref in SCENE_DIRECTOR_IMAGE_REFS and ref not in refs:
            refs.append(ref)

    segments = runtime.get("segments") if isinstance(runtime, dict) else []
    if isinstance(segments, list):
        for segment in segments:
            images = segment.get("images") if isinstance(segment, dict) else []
            if not isinstance(images, list):
                continue
            for item in images:
                add_ref(item.get("source_ref") if isinstance(item, dict) else item)

    prompt_override = str(runtime.get("prompt_override") or "") if isinstance(runtime, dict) else ""
    for match in re.finditer(r"(?<!\w)@(?:image|img|图像|图片|图)(\d+)(?!\w)", prompt_override, re.IGNORECASE):
        add_ref(f"image_{match.group(1)}")
    return refs[:SCENE_DIRECTOR_MAX_IMAGE_REFS]


def _scene_director_media_value(runtime, ref):
    media_sources = runtime.get("media_sources") if isinstance(runtime, dict) else {}
    source = media_sources.get(ref) if isinstance(media_sources, dict) else {}
    if not isinstance(source, dict):
        return None
    asset = source.get("asset") if isinstance(source.get("asset"), dict) else {}
    for holder in (asset, source):
        if not isinstance(holder, dict):
            continue
        for key in ("data_url", "src", "path", "output_path", "original_output_path"):
            value = holder.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _scene_director_data_url_available(value):
    text = str(value or "").strip()
    if not text.startswith("data:") or "," not in text:
        return False
    try:
        payload = text.split(",", 1)[1]
        return bool(base64.b64decode(payload, validate=False))
    except Exception:
        return False


def _scene_director_video_path_available(path):
    text = str(path or "").strip()
    if not text or not os.path.exists(text):
        return False
    try:
        import cv2
    except Exception:
        return True
    capture = None
    try:
        capture = cv2.VideoCapture(text)
        return bool(capture and capture.isOpened())
    except Exception:
        return False
    finally:
        try:
            if capture is not None:
                capture.release()
        except Exception:
            pass


def _scene_director_media_text_available(text, kind=None):
    value = str(text or "").strip()
    if not value:
        return False
    if value.startswith("data:"):
        if not _scene_director_data_url_available(value):
            return False
        if kind == "image":
            return _scene_director_backend_image(value) is not None
        return True
    if re.match(r"^https?://", value, re.IGNORECASE):
        return True
    if not os.path.exists(value):
        return False
    if kind == "image":
        return _scene_director_backend_image(value) is not None
    if kind == "video":
        return _scene_director_video_path_available(value)
    return True


def _scene_director_media_available(runtime, ref, kind=None):
    ref = str(ref or "").strip()
    if not ref or ref == SCENE_DIRECTOR_PREVIOUS_VIDEO_REF:
        return False
    media_sources = runtime.get("media_sources") if isinstance(runtime, dict) else {}
    source = media_sources.get(ref) if isinstance(media_sources, dict) else {}
    if not isinstance(source, dict):
        return False
    asset = source.get("asset") if isinstance(source.get("asset"), dict) else {}
    for holder in (asset, source):
        if not isinstance(holder, dict):
            continue
        for key in ("data_url", "data"):
            value = holder.get(key)
            if isinstance(value, str) and value.strip() and (
                _scene_director_media_text_available(value, kind) or
                (key == "data" and not value.strip().startswith("data:"))
            ):
                return True
        for key in ("path", "output_path", "original_output_path", "src"):
            value = holder.get(key)
            if not isinstance(value, str) or not value.strip():
                continue
            if _scene_director_media_text_available(value, kind):
                return True
    return False


def _scene_director_backend_image(value):
    import modules.util as util

    image = util.normalize_gradio_image_value(value, image_mode="RGBA")
    if image is None:
        return None
    try:
        return util.resize_image_by_max_area(image, max_area=1024 * 1024)
    except Exception:
        return image


def _scene_director_canvas_value(image):
    if image is None:
        return None
    try:
        h, w = image.shape[:2]
        mask = np.zeros((h, w, 3), dtype=np.uint8)
    except Exception:
        return None
    return {"image": image, "mask": mask}


def _scene_director_apply_media_to_backend(next_backend, runtime):
    applied = []
    for ref_index, ref in enumerate(_scene_director_used_image_refs(runtime)):
        if ref_index >= len(SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS):
            break
        slot = SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS[ref_index]
        image = _scene_director_backend_image(_scene_director_media_value(runtime, ref))
        if image is None:
            continue
        value = _scene_director_canvas_value(image) if slot == "scene_canvas_image" else image
        if value is None:
            continue
        next_backend[slot] = value
        applied.append({"ref": ref, "slot": slot})
    if applied:
        try:
            import modules.util as util

            util.log_ui_trace(logger, "[UI-TRACE] scene_director_media_backend_input | bindings=%s", applied)
        except Exception:
            logger.info("[UI-TRACE] scene_director_media_backend_input | bindings=%s", applied)
    return applied


def _scene_director_apply_capability_to_payload(payload, capability):
    if not isinstance(payload, dict):
        return payload
    if not isinstance(capability, dict):
        return payload
    next_payload = copy.deepcopy(payload)
    image_policy = str(capability.get("image_policy") or "").lower()
    audio_policy = str(capability.get("audio_policy") or "").lower()
    video_policy = str(capability.get("video_policy") or "").lower()
    max_images = _scene_director_image_ref_limit(capability)
    default_audio_ref = _scene_director_first_available_media_ref(next_payload, "audio") if audio_policy == "required" else ""
    for segment in next_payload.get("segments", []):
        if not isinstance(segment, dict):
            continue
        if image_policy == "forbidden":
            segment["images"] = []
        elif isinstance(segment.get("images"), list):
            segment["images"] = segment["images"][:max_images]
        if audio_policy == "forbidden":
            segment["audio"] = []
        elif audio_policy == "required" and default_audio_ref and not _scene_director_first_segment_ref(segment, "audio"):
            segment["audio"] = [{"source_ref": default_audio_ref, "role": "voice"}]
        if video_policy == "forbidden":
            segment["video"] = []
        image_refs = _scene_director_segment_image_refs(segment)
        audio_ref = _scene_director_first_segment_ref(segment, "audio")
        video_ref = _scene_director_first_segment_ref(segment, "video")
        if image_policy == "forbidden" and video_policy == "forbidden" and str(segment.get("type") or "").lower() in ("flf", "fmlf", "ref"):
            segment["type"] = "t2v"
        else:
            segment["type"] = _scene_director_segment_type(segment.get("task_method"), image_refs, audio_ref, video_ref)
    return next_payload


def _scene_director_first_available_media_ref(runtime, kind):
    if kind == "audio":
        refs = [ref for ref, _label in SCENE_DIRECTOR_AUDIO_SLOTS]
    elif kind == "video":
        refs = [ref for ref, _label in SCENE_DIRECTOR_VIDEO_SLOTS]
    else:
        refs = [ref for ref, _label in SCENE_DIRECTOR_IMAGE_SLOTS]
    for ref in refs:
        if _scene_director_media_available(runtime, ref, kind):
            return ref
    return ""


def _scene_director_validation_message(state_params, key, **kwargs):
    templates = {
        "image_required": (
            "Director shot {index} requires a first-frame image.",
            "分镜 {index} 需要首帧图片。",
        ),
        "image_missing": (
            "Director shot {index} uses {ref}, but no image is loaded in that slot.",
            "分镜 {index} 选择了 {ref}，但这个素材位没有图片。",
        ),
        "audio_required": (
            "Director shot {index} requires an audio reference.",
            "分镜 {index} 需要音频引用。",
        ),
        "audio_missing": (
            "Director shot {index} uses {ref}, but no audio is loaded in that slot.",
            "分镜 {index} 选择了 {ref}，但这个素材位没有音频。",
        ),
        "video_missing": (
            "Director shot {index} uses {ref}, but no video is loaded in that slot.",
            "分镜 {index} 选择了 {ref}，但这个素材位没有视频。",
        ),
        "too_many_images": (
            "Director shot {index} uses {count} images, but this preset accepts up to {max_images}.",
            "分镜 {index} 选择了 {count} 张图，当前 preset 最多支持 {max_images} 张。",
        ),
        "images_ignored": (
            "Director shot {index} image refs are disabled for the current text-to-video preset.",
            "当前文生视频 preset 不使用分镜 {index} 的图片引用。",
        ),
        "previous_first": (
            "Director shot 1 cannot use the previous shot result.",
            "分镜 1 不能使用上一段结果。",
        ),
        "previous_image_first": (
            "Director shot 1 cannot inherit a previous-shot last frame.",
            "分镜 1 不能继承上一段尾帧。",
        ),
        "previous_image_unsupported": (
            "Current preset does not support inheriting the previous-shot last frame as an image input.",
            "当前 preset 不支持将上一段尾帧作为图片输入。",
        ),
        "previous_unsupported": (
            "Current preset does not support previous-shot video chaining.",
            "当前 preset 不支持上一段视频继承。",
        ),
        "video_required": (
            "Director shot {index} requires a video reference.",
            "分镜 {index} 需要视频引用。",
        ),
        "duration_too_short": (
            "Director shot {index} is {duration}s, but this preset requires at least {min_duration}s per shot.",
            "分镜 {index} 时长为 {duration} 秒，当前 preset 单段至少 {min_duration} 秒。",
        ),
        "duration_too_long": (
            "Director shot {index} is {duration}s, but this preset accepts up to {max_duration}s per shot.",
            "分镜 {index} 时长为 {duration} 秒，当前 preset 单段最多 {max_duration} 秒。",
        ),
        "director_unsupported": (
            "Current preset cannot be used from Director Workspace.",
            "当前 preset 不能在导演工作台中使用。",
        ),
    }
    en, cn = templates.get(key, ("Director setting is invalid.", "导演设置无效。"))
    text = _scene_director_text(state_params, en, cn)
    try:
        return text.format(**kwargs)
    except Exception:
        return text


def _scene_director_format_seconds(value):
    try:
        number = round(float(value), 3)
    except Exception:
        return str(value)
    return f"{number:g}"


def _scene_director_duration_bounds_from_capability(capability):
    capability = capability if isinstance(capability, dict) else {}
    duration_strategy = _scene_director_duration_strategy(capability.get("duration_strategy"))
    min_floor = 0.0 if duration_strategy in ("audio_min", "video_min") else 0.05
    min_duration = _scene_director_number_capability_value(
        capability.get("min_segment_duration"),
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["min_segment_duration"],
        min_floor,
        86400.0,
    )
    max_duration = _scene_director_number_capability_value(
        capability.get("max_segment_duration"),
        SCENE_DIRECTOR_DEFAULT_CAPABILITY["max_segment_duration"],
        min_duration,
        86400.0,
    )
    return min_duration, max_duration


def _scene_director_validate_runtime(runtime, capability=None, state_params=None):
    capability = capability if isinstance(capability, dict) else {}
    image_policy = str(capability.get("image_policy") or "optional").lower()
    audio_policy = str(capability.get("audio_policy") or "optional").lower()
    video_policy = str(capability.get("video_policy") or "optional").lower()
    video_modes = [str(item) for item in (capability.get("video_modes") or []) if str(item)]
    min_images = _scene_director_int_capability_value(capability.get("min_images"), 1 if image_policy == "required" else 0)
    max_images = _scene_director_int_capability_value(
        capability.get("max_images"),
        0 if image_policy == "forbidden" else SCENE_DIRECTOR_MAX_IMAGE_REFS,
    )
    min_duration, max_duration = _scene_director_duration_bounds_from_capability(capability)
    errors = []
    warnings = []
    if capability.get("director_supported") is False:
        errors.append(_scene_director_validation_message(state_params, "director_unsupported"))
    segments = runtime.get("segments") if isinstance(runtime, dict) else []
    for index, segment in enumerate(segments if isinstance(segments, list) else [], start=1):
        segment_duration = _scene_director_segment_duration(segment, 1.0)
        if segment_duration < min_duration - 0.0001:
            errors.append(_scene_director_validation_message(
                state_params,
                "duration_too_short",
                index=index,
                duration=_scene_director_format_seconds(segment_duration),
                min_duration=_scene_director_format_seconds(min_duration),
            ))
        if segment_duration > max_duration + 0.0001:
            errors.append(_scene_director_validation_message(
                state_params,
                "duration_too_long",
                index=index,
                duration=_scene_director_format_seconds(segment_duration),
                max_duration=_scene_director_format_seconds(max_duration),
            ))
        refs = _scene_director_segment_image_refs(segment)
        count = len(refs)
        if image_policy == "required" and count < min_images:
            errors.append(_scene_director_validation_message(state_params, "image_required", index=index))
            continue
        if max_images >= 0 and count > max_images:
            errors.append(_scene_director_validation_message(state_params, "too_many_images", index=index, count=count, max_images=max_images))
        if image_policy == "forbidden" and count:
            warnings.append(_scene_director_validation_message(state_params, "images_ignored", index=index))
        for ref in refs:
            if ref == SCENE_DIRECTOR_PREVIOUS_IMAGE_REF:
                if index == 1:
                    errors.append(_scene_director_validation_message(state_params, "previous_image_first"))
                if not _scene_director_previous_image_supported(capability):
                    errors.append(_scene_director_validation_message(state_params, "previous_image_unsupported"))
            elif not _scene_director_media_available(runtime, ref, "image"):
                errors.append(_scene_director_validation_message(state_params, "image_missing", index=index, ref=ref))
        audio_ref = _scene_director_first_segment_ref(segment, "audio")
        if audio_policy == "required" and not audio_ref:
            errors.append(_scene_director_validation_message(state_params, "audio_required", index=index))
        if audio_ref and not _scene_director_media_available(runtime, audio_ref, "audio"):
            errors.append(_scene_director_validation_message(state_params, "audio_missing", index=index, ref=audio_ref))
        video_ref = _scene_director_first_segment_ref(segment, "video")
        if video_policy == "required" and not video_ref:
            errors.append(_scene_director_validation_message(state_params, "video_required", index=index))
        if video_ref == SCENE_DIRECTOR_PREVIOUS_VIDEO_REF:
            if index == 1:
                errors.append(_scene_director_validation_message(state_params, "previous_first"))
            if SCENE_DIRECTOR_PREVIOUS_VIDEO_REF not in video_modes:
                errors.append(_scene_director_validation_message(state_params, "previous_unsupported"))
        elif video_ref and not _scene_director_media_available(runtime, video_ref, "video"):
            errors.append(_scene_director_validation_message(state_params, "video_missing", index=index, ref=video_ref))
    return {"ok": not errors, "errors": errors, "warnings": warnings}


def _scene_director_runtime_with_capability(payload, capability, state_params=None):
    prepared = canvas_workbench_director.prepare_director_runtime(_scene_director_apply_capability_to_payload(payload, capability))
    for key in ("target_preset", "target_theme", "compose_timeline", "active_segment_index"):
        if isinstance(payload, dict) and key in payload:
            prepared[key] = copy.deepcopy(payload.get(key))
    prepared["director_capability"] = copy.deepcopy(capability)
    prepared["validation"] = _scene_director_validate_runtime(prepared, capability, state_params)
    return prepared


def _scene_director_compose_timeline_enabled(runtime):
    runtime = runtime if isinstance(runtime, dict) else {}
    capability = runtime.get("director_capability") if isinstance(runtime.get("director_capability"), dict) else {}
    chain_output = str(capability.get("chain_output") or "timeline").strip().lower()
    if chain_output != "timeline":
        return False
    return _scene_director_bool(runtime.get("compose_timeline"), False)


def _scene_director_looks_like_method(value):
    text = str(value or "").strip()
    if not text:
        return False
    key = _scene_director_method_alias_key(text)
    if key in SCENE_DIRECTOR_COMPAT_TYPES:
        return True
    if not re.match(r"^[A-Za-z0-9_.-]+$", text):
        return False
    lower = text.lower()
    return any(token in lower for token in ("wan", "ltx", "t2v", "i2v", "ta2v", "flux", "qwen", "hunyuan"))


def _scene_director_apply_target_method(runtime, state_params=None, scene_theme=None):
    if not isinstance(runtime, dict):
        return runtime
    task_method = _scene_director_task_method_from_state(state_params, scene_theme, "")
    if not task_method:
        return runtime
    target_theme = _scene_director_theme_from_state(state_params, scene_theme)
    target_preset = str(state_params.get("__preset") or "") if isinstance(state_params, dict) else ""
    capability = _scene_director_capability_from_state(state_params, scene_theme)
    payload = copy.deepcopy(runtime)
    payload["target_theme"] = target_theme
    payload["target_preset"] = target_preset
    payload["format"] = _scene_director_timeline_format_from_state(state_params, scene_theme, payload.get("format"))
    for segment in payload.get("segments", []):
        if not isinstance(segment, dict):
            continue
        image_refs = _scene_director_segment_image_refs(segment)
        audio_ref = _scene_director_first_segment_ref(segment, "audio")
        video_ref = _scene_director_first_segment_ref(segment, "video")
        segment["task_method"] = task_method
        segment["type"] = _scene_director_segment_type(task_method, image_refs, audio_ref, video_ref)
    return _scene_director_runtime_with_capability(payload, capability, state_params)


def build_scene_director_payload(rows, width=1280, height=720, fps=24, duration=10, target_format="Wan", media_state=None, state_params=None, scene_theme=None, compose_timeline=None):
    active_row_index = _scene_director_active_row_index(rows)
    normalized_rows = _scene_director_rows(rows)
    segments = []
    segment_row_indices = []
    previous_end = 0.0
    resolved_task_method = _scene_director_task_method_from_state(state_params, scene_theme)
    target_theme = _scene_director_theme_from_state(state_params, scene_theme)
    target_preset = str(state_params.get("__preset") or "") if isinstance(state_params, dict) else ""
    capability = _scene_director_capability_from_state(state_params, scene_theme)
    timeline_format = _scene_director_timeline_format_from_state(state_params, scene_theme, target_format)
    max_image_refs = _scene_director_image_ref_limit(capability)
    capability_chain_output = str(capability.get("chain_output") or "timeline").strip().lower()
    can_compose_timeline = capability_chain_output == "timeline"
    compose_enabled = can_compose_timeline and _scene_director_bool(compose_timeline, False)
    for index, row in enumerate(normalized_rows):
        if not isinstance(row, (list, tuple)):
            continue
        cells = list(row) + [""] * 10
        has_legacy_method_column = len(row) >= 6 and _scene_director_looks_like_method(cells[2])
        legacy_task_method = _scene_director_task_method(cells[2]) if has_legacy_method_column else ""
        prompt_text = str((cells[3] if has_legacy_method_column else cells[2]) or "").strip()
        image_refs, audio_ref, video_ref = _scene_director_row_media_refs(row, cells, has_legacy_method_column)
        image_refs = image_refs[:max_image_refs]
        if not prompt_text and not image_refs and not audio_ref and not video_ref:
            continue
        start = _scene_director_float(cells[0], previous_end, 0, 86400)
        end = max(start, _scene_director_float(cells[1], start + 1, 0, 86400))
        previous_end = end
        task_method = resolved_task_method or legacy_task_method or "wan2.2_t2v_cn"
        shot_type = _scene_director_segment_type(task_method, image_refs, audio_ref, video_ref)
        segment = {
            "id": f"shot_{len(segments) + 1}",
            "start": start,
            "end": end,
            "unit": "seconds",
            "type": shot_type,
            "task_method": task_method,
            "prompt": prompt_text,
            "images": [
                {"source_ref": ref, "role": _scene_director_image_role(shot_type, ref_index, capability)}
                for ref_index, ref in enumerate(image_refs)
            ],
            "audio": [{"source_ref": audio_ref, "role": "voice"}] if audio_ref else [],
            "video": [{"source_ref": video_ref, "role": "reference"}] if video_ref else [],
        }
        segments.append(segment)
        segment_row_indices.append(index)
    active_segment_index = 0
    if segment_row_indices:
        active_segment_index = min(
            range(len(segment_row_indices)),
            key=lambda segment_index: (abs(segment_row_indices[segment_index] - active_row_index), segment_index),
        )
    payload = {
        "schema": canvas_workbench_director.SCHEMA,
        "width": _scene_director_int(width, 1280, 64, 8192),
        "height": _scene_director_int(height, 720, 64, 8192),
        "fps": _scene_director_float(fps, 24, 1, 240),
        "duration": _scene_director_float(duration, max((item["end"] for item in segments), default=10), 0.1, 86400),
        "format": timeline_format,
        "target_preset": target_preset,
        "target_theme": target_theme,
        "compose_timeline": compose_enabled,
        "active_segment_index": active_segment_index,
        "director_capability": copy.deepcopy(capability),
        "segments": segments,
        "media_sources": _scene_director_media_sources(media_state),
    }
    return _scene_director_runtime_with_capability(payload, capability, state_params)


def update_scene_director_preview(enabled, compose_timeline, rows, width, height, fps, duration, target_format, media_state=None, state_params=None, scene_theme=None):
    runtime = build_scene_director_payload(rows, width, height, fps, duration, target_format, media_state, state_params, scene_theme, compose_timeline)
    capability = _scene_director_capability_from_state(state_params, scene_theme)
    if not enabled or not _scene_director_available_from_state(state_params, scene_theme, capability):
        return "", runtime
    return runtime.get("prompt_override", ""), runtime


def apply_scene_director_prompt_for_generation(prompt_text, backend_params, enabled, director_runtime, state_params=None, scene_theme=None):
    next_backend = dict(backend_params or {})
    capability = _scene_director_capability_from_state(state_params, scene_theme)
    if not enabled or not _scene_director_available_from_state(state_params, scene_theme, capability):
        for key in ("director_timeline", "prompt_override", "director_prompt_override"):
            next_backend.pop(key, None)
        return prompt_text, next_backend
    runtime = director_runtime if isinstance(director_runtime, dict) else {}
    if not runtime.get("schema"):
        runtime = build_scene_director_payload(SCENE_DIRECTOR_DEFAULT_ROWS, state_params=state_params, scene_theme=scene_theme)
    else:
        runtime = _scene_director_apply_target_method(runtime, state_params, scene_theme)
    validation = runtime.get("validation") if isinstance(runtime.get("validation"), dict) else {}
    errors = validation.get("errors") if isinstance(validation.get("errors"), list) else []
    if errors:
        raise gr.Error(str(errors[0]))
    prompt_override = str(runtime.get("prompt_override") or "").strip()
    if not prompt_override:
        return prompt_text, next_backend
    next_backend["director_timeline"] = runtime
    next_backend["prompt_override"] = prompt_override
    next_backend["director_prompt_override"] = prompt_override
    _scene_director_apply_media_to_backend(next_backend, runtime)
    return prompt_override, next_backend


def _scene_director_backend_dict(value):
    try:
        if isinstance(value, dict):
            return copy.deepcopy(value)
        return api_params.convert_dict(copy.deepcopy(value))
    except Exception:
        return {}


def _scene_director_data_url_to_temp(value, kind):
    text = str(value or "").strip()
    if not text.startswith("data:") or "," not in text:
        return None
    header, payload = text.split(",", 1)
    mime = ""
    try:
        mime = header[5:].split(";", 1)[0]
    except Exception:
        mime = ""
    suffix = mimetypes.guess_extension(mime) if mime else None
    if not suffix:
        suffix = ".wav" if kind == "audio" else ".mp4"
    try:
        raw = base64.b64decode(payload, validate=False)
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(raw)
            return os.path.abspath(temp_file.name)
    except Exception:
        return None


def _scene_director_media_file_value(runtime, ref, kind, fallback=None):
    ref = str(ref or "").strip()
    if not ref or ref == SCENE_DIRECTOR_PREVIOUS_VIDEO_REF:
        return None
    media_sources = runtime.get("media_sources") if isinstance(runtime, dict) else {}
    source = media_sources.get(ref) if isinstance(media_sources, dict) else {}
    asset = source.get("asset") if isinstance(source, dict) and isinstance(source.get("asset"), dict) else {}
    for holder in (asset, source):
        if not isinstance(holder, dict):
            continue
        for key in ("path", "output_path", "original_output_path", "src"):
            value = holder.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for key in ("data_url", "data"):
            value = holder.get(key)
            if isinstance(value, str) and value.strip():
                temp_path = _scene_director_data_url_to_temp(value, kind)
                if temp_path:
                    return temp_path
    return fallback


def _scene_director_clear_segment_media_backend(backend):
    for slot in SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS:
        backend.pop(slot, None)
    for key in ("video", "audio", "reference_video"):
        backend.pop(key, None)


def _scene_director_build_segment_task(base_task, runtime, segment, index, previous_video=None, state_params=None):
    import modules.async_worker as worker

    base_args = list(getattr(base_task, "args", []) or [])
    if not base_args:
        return worker.AsyncTask(args=[])
    params_backend_index = api_params.all_args.index("params_backend")
    prompt_index = api_params.all_args.index("prompt")
    backend = _scene_director_backend_dict(base_args[params_backend_index] if len(base_args) > params_backend_index else {})
    base_audio = backend.get("audio")
    base_video = backend.get("video")
    next_backend = copy.deepcopy(backend)
    _scene_director_clear_segment_media_backend(next_backend)

    image_refs = _scene_director_segment_image_refs(segment)
    for ref_index, ref in enumerate(image_refs):
        if ref_index >= len(SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS):
            break
        if ref == SCENE_DIRECTOR_PREVIOUS_IMAGE_REF:
            import modules.util as util

            last_frame_path = util.extract_video_last_frame(previous_video)
            image = _scene_director_backend_image(last_frame_path)
            if image is None:
                raise gr.Error(_scene_director_text(
                    state_params,
                    f"Director shot {int(index) + 1} could not read the previous shot's last frame.",
                    f"分镜 {int(index) + 1} 无法读取上一段尾帧。",
                ))
        else:
            image = _scene_director_backend_image(_scene_director_media_value(runtime, ref))
        if image is None:
            continue
        slot = SCENE_DIRECTOR_IMAGE_BACKEND_SLOTS[ref_index]
        value = _scene_director_canvas_value(image) if slot == "scene_canvas_image" else image
        if value is not None:
            next_backend[slot] = value

    audio_ref = _scene_director_first_segment_ref(segment, "audio")
    audio_fallback = base_audio if audio_ref == "audio_1" else None
    audio_value = _scene_director_media_file_value(runtime, audio_ref, "audio", audio_fallback)
    if audio_value:
        next_backend["audio"] = audio_value

    video_ref = _scene_director_first_segment_ref(segment, "video")
    if video_ref == SCENE_DIRECTOR_PREVIOUS_VIDEO_REF:
        video_value = previous_video
    else:
        video_fallback = base_video if video_ref == "video_1" else None
        video_value = _scene_director_media_file_value(runtime, video_ref, "video", video_fallback)
    if video_value:
        next_backend["video"] = video_value

    segment_prompt = str(segment.get("prompt") or "").strip()
    segment_duration = _scene_director_segment_generation_duration(runtime, segment, 1.0)
    runtime_capability = runtime.get("director_capability") if isinstance(runtime, dict) and isinstance(runtime.get("director_capability"), dict) else {}
    duration_strategy = _scene_director_duration_strategy(runtime_capability.get("duration_strategy"))
    shot_duration = _scene_director_segment_duration(segment, 1.0)
    segment_duration_param = _scene_director_segment_duration_param(
        runtime_capability.get("segment_duration_param")
    )
    if segment_duration_param:
        next_backend[segment_duration_param] = round(segment_duration, 3)
    next_backend.pop("director_timeline", None)
    next_backend["prompt_override"] = segment_prompt
    next_backend["director_prompt_override"] = segment_prompt
    next_backend["director_segment"] = {
        "schema": "simpai.director_segment.v1",
        "index": int(index),
        "id": segment.get("id") or f"shot_{int(index) + 1}",
        "start": segment.get("start"),
        "end": segment.get("end"),
        "duration": round(segment_duration, 3),
        "shot_duration": round(shot_duration, 3),
        "duration_strategy": duration_strategy,
        "audio_output": _scene_director_audio_output_mode(runtime_capability.get("audio_output")),
        "duration_param": segment_duration_param,
        "image_refs": image_refs,
        "previous_image": previous_video if SCENE_DIRECTOR_PREVIOUS_IMAGE_REF in image_refs else "",
        "audio_ref": audio_ref,
        "video_ref": video_ref,
        "previous_video": previous_video if video_ref == SCENE_DIRECTOR_PREVIOUS_VIDEO_REF else "",
    }

    args_i = copy.deepcopy(base_args)
    if len(args_i) > prompt_index:
        args_i[prompt_index] = segment_prompt
    if len(args_i) > params_backend_index:
        args_i[params_backend_index] = api_params.normalization_backend(next_backend)
    return worker.AsyncTask(args=args_i)


def _scene_director_first_video_result(results):
    for item in reversed(list(results or [])):
        if isinstance(item, str) and item.lower().endswith((".mp4", ".webm", ".mov", ".mkv", ".avi")):
            return item
    return list(results or [])[-1] if results else None


def _scene_director_video_path(value):
    if isinstance(value, str) and value.lower().endswith((".mp4", ".webm", ".mov", ".mkv", ".avi")):
        return value if os.path.exists(value) else ""
    return ""


def _scene_director_segment_duration(segment, fallback=1.0):
    if not isinstance(segment, dict):
        return max(0.05, float(fallback or 1.0))
    start = _scene_director_float(segment.get("start"), 0, 0, 86400)
    end = _scene_director_float(segment.get("end"), start + fallback, 0, 86400)
    return max(0.05, end - start)


def _scene_director_segment_generation_duration(runtime, segment, fallback=1.0):
    capability = runtime.get("director_capability") if isinstance(runtime, dict) else {}
    capability = capability if isinstance(capability, dict) else {}
    duration_strategy = _scene_director_duration_strategy(capability.get("duration_strategy"))
    min_duration, max_duration = _scene_director_duration_bounds_from_capability(capability)
    duration = _scene_director_segment_duration(segment, fallback)
    if duration_strategy in ("audio_min", "video_min"):
        return max(0.0, min(max_duration, duration))
    return max(min_duration, min(max_duration, duration))


def _scene_director_asset_duration(asset):
    if not isinstance(asset, dict):
        return 0.0
    for key in ("duration", "duration_seconds"):
        value = asset.get(key)
        try:
            duration = float(value)
        except Exception:
            duration = 0.0
        if duration > 0:
            return min(86400.0, duration)
    metadata = asset.get("metadata")
    if isinstance(metadata, dict):
        return _scene_director_asset_duration(metadata)
    return 0.0


def _scene_director_segment_timeline_duration(runtime, segment, asset=None, fallback=1.0):
    capability = runtime.get("director_capability") if isinstance(runtime, dict) else {}
    capability = capability if isinstance(capability, dict) else {}
    duration_strategy = _scene_director_duration_strategy(capability.get("duration_strategy"))
    if duration_strategy in ("audio_min", "video_min"):
        asset_duration = _scene_director_asset_duration(asset)
        if asset_duration > 0:
            return asset_duration
        return _scene_director_segment_duration(segment, fallback)
    return _scene_director_segment_generation_duration(runtime, segment, fallback)


def _scene_director_project_id(state_params=None):
    user_did = ""
    if isinstance(state_params, dict):
        user_did = str(state_params.get("user_did") or state_params.get("__user_did") or "").strip()
    return "webui_director" + (f"_{user_did}" if user_did else "")


def _scene_director_video_has_audio(path):
    if not _scene_director_video_path(path):
        return False
    try:
        from modules import canvas_workbench_assets
        import subprocess

        ffprobe = canvas_workbench_assets._get_ffprobe_exe()
        if not ffprobe:
            return False
        completed = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "json",
                path,
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=8,
        )
        if completed.returncode != 0:
            return False
        data = json.loads(completed.stdout or "{}")
        streams = data.get("streams") if isinstance(data, dict) else []
        return any(isinstance(item, dict) and item.get("codec_type") == "audio" for item in streams)
    except Exception:
        return False


def _scene_director_register_timeline_asset(path, project_id, state_params, index):
    try:
        from modules import canvas_workbench_assets

        return canvas_workbench_assets.register_existing_file_asset(
            path,
            project_id,
            state_params,
            node_id=f"webui_director_shot_{int(index) + 1}",
            role="director_segment",
            metadata={"mime": mimetypes.guess_type(path)[0] or "video/mp4"},
            copy_to_assets=False,
        )
    except Exception:
        return None


def _scene_director_timeline_asset(path, project_id, state_params, index):
    asset = _scene_director_register_timeline_asset(path, project_id, state_params, index)
    if isinstance(asset, dict) and (asset.get("path") or asset.get("output_path")):
        return asset
    return {
        "kind": "director_segment_file",
        "asset_id": f"director_segment_{int(index) + 1}",
        "project_id": project_id,
        "node_id": f"webui_director_shot_{int(index) + 1}",
        "role": "director_segment",
        "mime": mimetypes.guess_type(path)[0] or "video/mp4",
        "path": path,
        "output_path": path,
        "original_output_path": path,
        "name": os.path.basename(path),
    }


def _scene_director_build_final_timeline_payload(runtime, segment_videos, state_params=None):
    runtime = runtime if isinstance(runtime, dict) else {}
    project_id = _scene_director_project_id(state_params)
    width = _scene_director_int(runtime.get("width"), 1280, 16, 8192)
    height = _scene_director_int(runtime.get("height"), 720, 16, 8192)
    fps = _scene_director_float(runtime.get("fps"), 24, 1, 120)
    layers = []
    audio = []
    source_clips = []
    timeline_end = 0.0
    for item in segment_videos or []:
        if not isinstance(item, dict):
            continue
        path = _scene_director_video_path(item.get("path"))
        segment = item.get("segment") if isinstance(item.get("segment"), dict) else {}
        index = _scene_director_int(item.get("index"), len(layers), 0, 100000)
        if not path:
            continue
        start = _scene_director_float(segment.get("start"), timeline_end, 0, 86400)
        asset = _scene_director_timeline_asset(path, project_id, state_params, index)
        duration = _scene_director_segment_timeline_duration(runtime, segment, asset, 1.0)
        end = start + duration
        timeline_end = max(timeline_end, end)
        clip_id = f"director_shot_{index + 1}"
        timing = {"start": start, "duration": duration, "in": 0, "out": duration}
        layer = {
            "clip_id": clip_id,
            "track_id": "v1",
            "source_node_id": clip_id,
            "kind": "video",
            "z_index": 100 + index,
            "timing": timing,
            "transform": {
                "x_percent": 0,
                "y_percent": 0,
                "scale": 1,
                "rotate_degrees": 0,
                "fit": "contain",
                "opacity": 1,
            },
            "keyframes": [],
            "crop_percent": {"left": 0, "right": 0, "top": 0, "bottom": 0},
            "mask": {},
            "asset": asset,
        }
        layers.append(layer)
        source_clips.append({
            "id": clip_id,
            "track_id": "v1",
            "kind": "video",
            "start": start,
            "duration": duration,
            "in": 0,
            "out": duration,
            "asset": asset,
        })
        if _scene_director_video_has_audio(path):
            audio.append({
                "clip_id": f"{clip_id}_audio",
                "track_id": "a1",
                "source_node_id": clip_id,
                "timing": timing,
                "volume": 1,
                "asset": asset,
            })
    duration = timeline_end if timeline_end > 0 else _scene_director_float(runtime.get("duration"), 1, 0.05, 86400)
    render_payload = {
        "schema": "simpai.timeline.render_payload.v1",
        "title": "Director Final Timeline",
        "canvas": {
            "width": width,
            "height": height,
            "fps": fps,
            "duration": duration,
            "background": "#000000",
        },
        "tracks": [
            {"id": "v1", "type": "video", "name": "Director Video"},
            {"id": "a1", "type": "audio", "name": "Director Audio"},
        ],
        "layers": layers,
        "audio": audio,
        "source_timeline": {
            "schema": "simpai.timeline.v1",
            "title": "Director Final Timeline",
            "params": {
                "width": width,
                "height": height,
                "fps": fps,
                "duration": duration,
                "background": "#000000",
            },
            "tracks": [
                {"id": "v1", "type": "video", "name": "Director Video"},
                {"id": "a1", "type": "audio", "name": "Director Audio"},
            ],
            "clips": source_clips,
        },
    }
    return {
        "project_id": project_id,
        "node_id": "webui_director_final",
        "publish_gallery": True,
        "payload": render_payload,
    }


def _scene_director_render_final_timeline(runtime, segment_videos, state_params=None):
    payload = _scene_director_build_final_timeline_payload(runtime, segment_videos, state_params)
    if not payload.get("payload", {}).get("layers"):
        return ""
    try:
        from modules import canvas_workbench_timeline

        result = canvas_workbench_timeline.render_timeline(payload, state_params)
    except Exception as err:
        logger.warning("[SceneDirector] final timeline render failed: %s", err)
        return ""
    if not isinstance(result, dict) or not result.get("ok"):
        logger.warning("[SceneDirector] final timeline render failed: %s", result.get("error") if isinstance(result, dict) else result)
        return ""
    gallery = result.get("gallery") if isinstance(result.get("gallery"), dict) else {}
    gallery_path = str(gallery.get("path") or "")
    if gallery_path and os.path.exists(gallery_path):
        return gallery_path
    if payload.get("publish_gallery"):
        logger.warning("[SceneDirector] final timeline gallery publish missing or unavailable: %s", gallery or None)
    path = str(result.get("path") or "")
    return path if path and os.path.exists(path) else ""


def generate_clicked_or_director(
    generation_task,
    state_params,
    director_enabled,
    director_runtime,
    generate_clicked_fn,
    compare_button_update_fn,
):
    capability = _scene_director_capability_from_state(state_params)
    if not director_enabled or not _scene_director_available_from_state(state_params, capability=capability):
        yield from generate_clicked_fn(generation_task, state_params)
        return

    runtime = director_runtime if isinstance(director_runtime, dict) else {}
    if not runtime.get("schema"):
        runtime = build_scene_director_payload(SCENE_DIRECTOR_DEFAULT_ROWS, state_params=state_params)
    runtime = _scene_director_apply_target_method(runtime, state_params)
    validation = runtime.get("validation") if isinstance(runtime.get("validation"), dict) else {}
    errors = validation.get("errors") if isinstance(validation.get("errors"), list) else []
    if errors:
        raise gr.Error(str(errors[0]))

    segments = runtime.get("segments") if isinstance(runtime.get("segments"), list) else []
    if not segments:
        raise gr.Error(_scene_director_text(state_params, "Director has no valid shots.", "导演台没有可生成的分镜。"))

    final_results = []
    segment_videos = []
    previous_video = None
    try:
        generation_task.processing = True
        generation_task.content_type = "video"
        generation_task.results = []
    except Exception:
        pass

    total = len(segments)
    yield (
        gr_update(visible=True, value=html_module.make_progress_html(1, f"Director: 0/{total}")),
        gr_update(),
        gr_update(visible="hidden", value=None),
        gr_update(visible=False, value=None),
        gr_update(visible=False),
        False,
        gr_update(visible=False),
        compare_button_update_fn(visible=False, ready=False),
        gr_update(visible=True, interactive=True),
        gr_update(visible=True, interactive=True),
    )

    for index, segment in enumerate(segments):
        if getattr(generation_task, "last_stop", False) in ("stop", "skip"):
            break
        segment_task = _scene_director_build_segment_task(
            generation_task,
            runtime,
            segment,
            index,
            previous_video,
            state_params,
        )
        for out in generate_clicked_fn(segment_task, state_params):
            yield out
        segment_results = list(getattr(segment_task, "results", []) or [])
        if segment_results:
            final_results.extend(segment_results)
            segment_video = _scene_director_video_path(_scene_director_first_video_result(segment_results))
            if segment_video:
                segment_videos.append({"index": index, "segment": segment, "path": segment_video})
                previous_video = segment_video
            else:
                previous_video = _scene_director_first_video_result(segment_results) or previous_video
        if getattr(generation_task, "last_stop", False) in ("stop", "skip"):
            break

    chain_output = str((runtime.get("director_capability") or {}).get("chain_output") or "timeline").strip().lower()
    compose_timeline = _scene_director_compose_timeline_enabled(runtime)
    if chain_output == "last_result" and final_results:
        last_video = _scene_director_first_video_result(final_results)
        final_results = [last_video or final_results[-1]]
    elif (
        compose_timeline
        and final_results
        and len(segment_videos) == len(segments)
        and getattr(generation_task, "last_stop", False) not in ("stop", "skip")
    ):
        yield (
            gr_update(visible=True, value=html_module.make_progress_html(1, "Director: composing final video")),
            gr_update(),
            gr_update(visible="hidden", value=None),
            gr_update(visible=False, value=None),
            gr_update(visible=False),
            False,
            gr_update(visible=False),
            compare_button_update_fn(visible=False, ready=False),
            gr_update(visible=True, interactive=True),
            gr_update(visible=True, interactive=True),
        )
        timeline_video = _scene_director_render_final_timeline(runtime, segment_videos, state_params)
        if timeline_video:
            final_results.append(timeline_video)

    try:
        generation_task.processing = False
        generation_task.results = final_results
        generation_task.simpleai_generation_had_output = bool(final_results)
        generation_task.image_number = max(1, len(final_results))
    except Exception:
        pass

    if not final_results:
        yield (
            gr_update(visible=False),
            gr_update(),
            gr_update(visible=False, value=None),
            gr_update(visible=False, value=None),
            gr_update(visible=False),
            False,
            gr_update(visible=False),
            compare_button_update_fn(visible=False, ready=False),
            gr_update(visible=False, interactive=False),
            gr_update(visible=False, interactive=False),
        )
        return

    has_video = any(isinstance(item, str) and item.lower().endswith((".mp4", ".webm", ".mov", ".mkv", ".avi")) for item in final_results)
    yield (
        gr_update(visible=False),
        gr_update(visible=False),
        gr_update(
            visible=True,
            value=final_results,
            label="Finished Videos" if has_video else "Finished Images",
            allow_preview=True,
            preview=False,
            selected_index=None,
            fit_columns=False,
        ),
        gr_update(visible=False, value=None),
        gr_update(visible=False),
        False,
        gr_update(visible=False),
        compare_button_update_fn(visible=False, ready=False),
        gr_update(visible=False, interactive=False),
        gr_update(visible=False, interactive=False),
    )
