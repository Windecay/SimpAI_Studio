import copy
import math
import os
import re
import threading
from collections import OrderedDict

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from modules import tag_separator


PROMPT_ACTION_VIDEO_FRAMES = 8
PROMPT_ACTION_VIDEO_TILE_WIDTH = 422
PROMPT_ACTION_VIDEO_TILE_HEIGHT = 384
PROMPT_ACTION_VIDEO_LABEL_HEIGHT = 32
PROMPT_ACTION_VIDEO_MULTI_FRAME_MAX_SIDE = 512
PROMPT_ACTION_VIDEO_CACHE_SIZE = 8
PROMPT_ACTION_SCENE_IMAGE_SLOTS = (
    "scene_canvas_image",
    "scene_input_image1",
    "scene_input_image2",
    "scene_input_image3",
    "scene_input_image4",
    "scene_input_image5",
    "scene_input_image6",
    "scene_input_image7",
    "scene_input_image8",
)
PROMPT_ACTION_OPTIONAL_IMAGE_SLOTS = tuple(f"scene_input_image{index}" for index in range(3, 9))
PROMPT_ACTION_CAPABILITY_KEYS = (
    "image_policy",
    "min_images",
    "max_images",
    "max_audios",
    "max_videos",
    "image_modes",
    "video_policy",
    "video_modes",
    "audio_policy",
    "duration_strategy",
    "audio_output",
    "chain_output",
    "requires_sequential",
    "mixed_segments",
    "segment_duration_param",
    "min_segment_duration",
    "max_segment_duration",
)


_ACTION_LOCK = threading.RLock()
_ACTIONS = OrderedDict()
_VIDEO_CACHE_LOCK = threading.RLock()
_VIDEO_CONTEXT_CACHE = OrderedDict()


def register_prompt_action(spec, *, replace=False):
    data = copy.deepcopy(spec if isinstance(spec, dict) else {})
    action_id = str(data.get("id") or "").strip()
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,63}", action_id):
        raise ValueError(f"Invalid prompt action id: {action_id!r}")
    handler = str(data.get("handler") or "").strip()
    if not handler:
        raise ValueError(f"Prompt action {action_id!r} has no handler")
    data["id"] = action_id
    data["handler"] = handler
    data["modes"] = list(data.get("modes") or ["classic", "scene"])
    data["media_policy"] = str(data.get("media_policy") or "none")
    data["service_kind"] = str(
        data.get("service_kind")
        or ("local_script" if handler == "tag_separator_toggle" else "agent")
    ).strip()
    with _ACTION_LOCK:
        if action_id in _ACTIONS and not replace:
            raise ValueError(f"Prompt action already registered: {action_id}")
        _ACTIONS[action_id] = data
    return copy.deepcopy(data)


def get_prompt_action(action_id):
    key = str(action_id or "").strip()
    with _ACTION_LOCK:
        action = _ACTIONS.get(key)
        return copy.deepcopy(action) if isinstance(action, dict) else None


def prompt_action_catalog():
    public_keys = (
        "id",
        "label_en",
        "label_cn",
        "description_en",
        "description_cn",
        "icon",
        "group",
        "modes",
        "requires_vlm",
        "requires_vlm_scene",
        "media_policy",
        "service_kind",
        "featured",
    )
    with _ACTION_LOCK:
        return [
            {key: copy.deepcopy(action.get(key)) for key in public_keys if key in action}
            for action in _ACTIONS.values()
        ]


def normalize_prompt_action_options(value):
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str) and value.strip():
        try:
            import json

            parsed = json.loads(value)
            return dict(parsed) if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


def prompt_action_option_bool(options, key, default=False):
    value = normalize_prompt_action_options(options).get(key, default)
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "no", "off"}
    return bool(value)


def transform_prompt_tag_separators(value, direction="auto"):
    return tag_separator.convert_tag_separators(value, direction)


def prompt_tags_with_spaces(value):
    return tag_separator.tag_underscores_to_spaces(value)


def prompt_action_mode(state):
    data = state if isinstance(state, dict) else {}
    if "__is_scene_frontend" in data:
        return "scene" if bool(data.get("__is_scene_frontend")) else "classic"
    return "scene" if isinstance(data.get("scene_frontend"), dict) else "classic"


def prompt_action_scene_frontend_from_state(state):
    data = state if isinstance(state, dict) else {}
    scene = data.get("scene_frontend")
    prepared = data.get("__preset_prepared")
    prepared_engine = prepared.get("engine") if isinstance(prepared, dict) else None
    prepared_scene = prepared_engine.get("scene_frontend") if isinstance(prepared_engine, dict) else None
    if not isinstance(prepared_scene, dict):
        return scene if isinstance(scene, dict) else {}

    current_preset = str(data.get("__preset") or "").strip()
    prepared_preset = str(prepared.get("preset") or "").strip() if isinstance(prepared, dict) else ""
    if current_preset and prepared_preset and current_preset == prepared_preset:
        return prepared_scene
    return scene if isinstance(scene, dict) else prepared_scene


def _prompt_action_scene_frontend(state):
    return prompt_action_scene_frontend_from_state(state)


def _prompt_action_scene_theme(state, scene_frontend=None):
    data = state if isinstance(state, dict) else {}
    scene = scene_frontend if isinstance(scene_frontend, dict) else _prompt_action_scene_frontend(data)
    for value in (data.get("scene_theme"), data.get("__scene_theme")):
        if isinstance(value, str) and value.strip():
            return value.strip()
    themes = scene.get("theme")
    if isinstance(themes, str):
        return themes.strip()
    if isinstance(themes, (list, tuple)):
        return next((str(item).strip() for item in themes if str(item or "").strip()), "")
    return ""


def _prompt_action_theme_value(value, theme):
    if isinstance(value, dict) and theme and theme in value:
        return value.get(theme)
    return value


def prompt_action_capability_from_state(state):
    scene = _prompt_action_scene_frontend(state)
    theme = _prompt_action_scene_theme(state, scene)
    raw = _prompt_action_theme_value(scene.get("director_capability"), theme)
    if not isinstance(raw, dict):
        return {}
    return {
        key: copy.deepcopy(raw.get(key))
        for key in PROMPT_ACTION_CAPABILITY_KEYS
        if key in raw
    }


def _prompt_action_media_profile(state):
    scene = _prompt_action_scene_frontend(state)
    theme = _prompt_action_scene_theme(state, scene)
    raw = _prompt_action_theme_value(scene.get("prompt_action_media"), theme)
    return copy.deepcopy(raw) if isinstance(raw, dict) else {}


def _prompt_action_h3_reference_mode(state):
    data = state if isinstance(state, dict) else {}
    scene = _prompt_action_scene_frontend(data)
    theme = _prompt_action_scene_theme(data, scene)
    try:
        from modules import minimax_h3_prompt_compiler

        compiler = minimax_h3_prompt_compiler.scene_compiler(scene, theme)
        if isinstance(compiler, dict):
            return str(compiler.get("route") or "").lower() in {"reference", "image_reference"}
    except Exception:
        pass
    task_method = _prompt_action_theme_value(scene.get("task_method"), theme)
    haystack = " ".join(
        str(value or "")
        for value in (
            task_method,
            data.get("task_method"),
            data.get("__preset"),
            data.get("preset"),
            scene.get("theme_title"),
        )
    ).lower()
    return (
        "minimax" in haystack
        and "h3" in haystack
        and ("r2v" in haystack or "r2i" in haystack or "r2c" in haystack)
    )


def _prompt_action_reconcile_h3_reference_capability(state, capability, declared_capability=None):
    resolved = copy.deepcopy(capability if isinstance(capability, dict) else {})
    if not _prompt_action_h3_reference_mode(state):
        return resolved

    declared = declared_capability if isinstance(declared_capability, dict) else {}
    for key in PROMPT_ACTION_CAPABILITY_KEYS:
        if key in declared:
            resolved[key] = copy.deepcopy(declared.get(key))

    declared_policy = str(declared.get("image_policy") or "").strip().lower()
    if declared_policy in {"optional", "required"}:
        resolved["image_policy"] = declared_policy
    elif str(resolved.get("image_policy") or "").strip().lower() in {"", "forbidden"}:
        resolved["image_policy"] = "optional"

    try:
        declared_max = int(declared.get("max_images"))
    except Exception:
        declared_max = 0
    try:
        resolved_max = int(resolved.get("max_images"))
    except Exception:
        resolved_max = 0
    resolved["max_images"] = declared_max if declared_max > 0 else (
        resolved_max if resolved_max > 0 else len(PROMPT_ACTION_SCENE_IMAGE_SLOTS)
    )
    if "min_images" in declared:
        resolved["min_images"] = copy.deepcopy(declared.get("min_images"))
    elif "min_images" not in resolved:
        resolved["min_images"] = 0

    declared_modes = declared.get("image_modes")
    modes = list(declared_modes) if isinstance(declared_modes, (list, tuple)) else list(resolved.get("image_modes") or [])
    if "reference_set" not in {str(item or "").strip().lower() for item in modes}:
        modes.append("reference_set")
    resolved["image_modes"] = modes

    for kind in ("audio", "video"):
        policy_key = f"{kind}_policy"
        max_key = f"max_{kind}s"
        policy = str(resolved.get(policy_key) or "optional").strip().lower()
        if policy not in {"optional", "required", "forbidden"}:
            policy = "optional"
        resolved[policy_key] = policy
        if policy == "forbidden":
            resolved[max_key] = 0
            continue
        if max_key in declared:
            raw_max = declared.get(max_key)
        elif policy_key in declared:
            raw_max = 1
        else:
            raw_max = resolved.get(max_key, 1)
        try:
            max_refs = int(raw_max)
        except Exception:
            max_refs = 1
        resolved[max_key] = max(0, min(3, max_refs))
    return resolved


def _prompt_action_hidden_scene_slots(state):
    data = state if isinstance(state, dict) else {}
    scene = _prompt_action_scene_frontend(state)
    raw_hidden = data.get("__scene_disvisible") if "__scene_disvisible" in data else scene.get("disvisible", [])
    if isinstance(raw_hidden, str):
        hidden = [item.strip() for item in raw_hidden.split(",") if item.strip()]
    elif isinstance(raw_hidden, (list, tuple, set)):
        hidden = [str(item).strip() for item in raw_hidden if str(item or "").strip()]
    else:
        hidden = []
    raw_enabled = scene.get("divisible", [])
    enabled = {
        str(item).strip()
        for item in raw_enabled
    } if isinstance(raw_enabled, (list, tuple, set)) else set()
    for slot in PROMPT_ACTION_OPTIONAL_IMAGE_SLOTS:
        if slot not in hidden and slot not in enabled:
            hidden.append(slot)
    return set(hidden)


def _prompt_action_image_map(input_images):
    if isinstance(input_images, dict):
        return {slot: input_images.get(slot) for slot in PROMPT_ACTION_SCENE_IMAGE_SLOTS}
    values = list(input_images or []) if isinstance(input_images, (list, tuple)) else [input_images]
    return {
        slot: values[index] if index < len(values) else None
        for index, slot in enumerate(PROMPT_ACTION_SCENE_IMAGE_SLOTS)
    }


def _prompt_action_image_roles(entries, capability, explicit_roles=None):
    count = len(entries)
    modes = capability.get("image_modes") if isinstance(capability, dict) else []
    modes = {str(item or "").strip().lower() for item in (modes or [])}
    if count >= 3 and "ordered_keyframes" in modes:
        roles = ["first_frame", *[f"middle_frame_{index}" for index in range(1, count - 1)], "last_frame"]
    elif count >= 3 and "reference_set" in modes:
        roles = [f"reference_image_{index}" for index in range(1, count + 1)]
    elif count == 2 and "first_last" in modes:
        roles = ["first_frame", "last_frame"]
    elif count == 1 and "last_frame" in modes:
        roles = ["last_frame"]
    elif count == 1 and "first_frame" in modes:
        roles = ["first_frame"]
    elif "reference_set" in modes:
        roles = [f"reference_image_{index}" for index in range(1, count + 1)]
    else:
        roles = []
        reference_index = 1
        for slot, _image in entries:
            if slot == "scene_canvas_image":
                roles.append("source_image")
            else:
                roles.append(f"reference_image_{reference_index}")
                reference_index += 1

    configured = [
        str(item or "").strip()
        for item in (explicit_roles or [])
        if str(item or "").strip()
    ]
    if configured:
        roles = [configured[index] if index < len(configured) else roles[index] for index in range(count)]
    return roles


def _prompt_action_existing_path(value):
    path = normalize_media_path(value)
    return path if path and os.path.exists(path) else ""


def _prompt_action_director_segments(runtime):
    segments = runtime.get("segments") if isinstance(runtime, dict) else []
    return [item for item in segments if isinstance(item, dict)] if isinstance(segments, list) else []


def _prompt_action_director_segment(runtime, input_text=""):
    segments = _prompt_action_director_segments(runtime)
    if not segments:
        return -1, None
    index = None
    for key in ("active_segment_index", "selected_segment_index", "current_segment_index"):
        try:
            candidate = int(runtime.get(key))
        except Exception:
            continue
        if 0 <= candidate < len(segments):
            index = candidate
            break
    if index is None:
        active_id = str(runtime.get("active_segment_id") or runtime.get("selected_segment_id") or "").strip()
        if active_id:
            index = next((i for i, item in enumerate(segments) if str(item.get("id") or "").strip() == active_id), None)
    if index is None and str(input_text or "").strip():
        expected = str(input_text).strip()
        matches = [i for i, item in enumerate(segments) if str(item.get("prompt") or "").strip() == expected]
        if len(matches) == 1:
            index = matches[0]
    if index is None:
        index = 0
    return index, segments[index]


def _prompt_action_media_ref(items):
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return ""
    for item in items:
        if isinstance(item, dict):
            ref = str(item.get("source_ref") or item.get("source_node_id") or "").strip()
        else:
            ref = str(item or "").strip()
        if ref:
            return ref
    return ""


def _prompt_action_media_refs(items):
    if isinstance(items, dict):
        items = [items]
    refs = []
    for item in items if isinstance(items, list) else []:
        ref = _prompt_action_media_ref([item])
        if ref and ref not in refs:
            refs.append(ref)
    return refs


def _prompt_action_director_media_value(runtime, ref):
    sources = runtime.get("media_sources") if isinstance(runtime, dict) else {}
    source = sources.get(ref) if isinstance(sources, dict) else {}
    if not isinstance(source, dict):
        return None
    asset = source.get("asset") if isinstance(source.get("asset"), dict) else {}
    for holder in (asset, source):
        for key in ("data_url", "src", "path", "output_path", "original_output_path"):
            value = holder.get(key) if isinstance(holder, dict) else None
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _prompt_action_director_image_entries(runtime, segment, max_images=None):
    entries = []
    refs = _prompt_action_media_refs(segment.get("images") if isinstance(segment, dict) else [])
    if max_images is not None:
        refs = refs[:max(0, int(max_images))]
    if not refs:
        return entries, refs
    try:
        from modules.util import normalize_gradio_image_value
    except Exception:
        normalize_gradio_image_value = None
    for ref in refs:
        value = _prompt_action_director_media_value(runtime, ref)
        image = normalize_gradio_image_value(value) if normalize_gradio_image_value is not None else None
        if image is not None:
            entries.append((ref, image))
    return entries, refs


def _prompt_action_normalize_image_entries(entries):
    try:
        from modules.util import normalize_gradio_image_value, normalize_gradio_sketch_value
    except Exception:
        normalize_gradio_image_value = None
        normalize_gradio_sketch_value = None

    def fallback_image(value):
        if isinstance(value, np.ndarray):
            return value
        if isinstance(value, Image.Image):
            return np.asarray(value.convert("RGB"))
        if isinstance(value, dict):
            for key in ("image", "background", "composite", "data", "path", "name"):
                image = fallback_image(value.get(key))
                if image is not None:
                    return image
            return None
        if isinstance(value, str) and os.path.exists(value):
            try:
                with Image.open(value) as source:
                    return np.asarray(source.convert("RGB"))
            except Exception:
                return None
        return None

    normalized = []
    unresolved = []
    for slot, value in entries:
        image = None
        if slot == "scene_canvas_image" and normalize_gradio_sketch_value is not None:
            sketch = normalize_gradio_sketch_value(
                value,
                image_mode="RGB",
                preserve_mask_color=True,
            )
            if isinstance(sketch, dict):
                image = sketch.get("image")
        if image is None and normalize_gradio_image_value is not None:
            image = normalize_gradio_image_value(value, image_mode="RGB")
        if image is None:
            image = fallback_image(value)
        if image is not None:
            normalized.append((slot, image))
        else:
            unresolved.append(slot)
    return normalized, unresolved


def _prompt_action_duration(value):
    try:
        result = float(value)
    except Exception:
        return None
    return round(max(0.0, min(86400.0, result)), 3)


def _prompt_action_visual_analysis_intent(input_text):
    text = str(input_text or "").strip()
    if re.search(
        r"(?:story\s*board|shot\s*(?:board|sheet)|"
        r"\u5206\u955c(?:\u7a3f|\u56fe|\u677f|\u811a\u672c)|\u6545\u4e8b\u677f|\u955c\u5934\u8868|"
        r"(?:\u6839\u636e|\u53c2\u8003|\u6309\u7167|\u8bfb\u53d6|\u5206\u6790).{0,12}\u5206\u955c)",
        text,
        flags=re.IGNORECASE,
    ):
        return "storyboard"
    return ""


def prepare_prompt_action_resources(state, input_images, scene_resources=None, input_text="", options=None):
    data = state if isinstance(state, dict) else {}
    resources = dict(scene_resources or {})
    opts = normalize_prompt_action_options(options)
    scene_mode = prompt_action_mode(data) == "scene"
    declared_capability = prompt_action_capability_from_state(data) if scene_mode else {}
    capability = copy.deepcopy(declared_capability)
    media_profile = _prompt_action_media_profile(data) if scene_mode else {}
    hidden = _prompt_action_hidden_scene_slots(data) if scene_mode else set()
    image_map = _prompt_action_image_map(input_images)
    raw_entries = [
        (slot, image_map.get(slot))
        for slot in PROMPT_ACTION_SCENE_IMAGE_SLOTS
        if image_map.get(slot) is not None
    ]
    visible_entries = [
        (slot, image_map.get(slot))
        for slot in PROMPT_ACTION_SCENE_IMAGE_SLOTS
        if image_map.get(slot) is not None and (not scene_mode or slot not in hidden)
    ]

    director_runtime = resources.get("director_state") if isinstance(resources.get("director_state"), dict) else {}
    director_enabled = bool(resources.get("director_enabled")) and bool(director_runtime)
    if director_enabled and isinstance(director_runtime.get("director_capability"), dict):
        capability = {
            key: copy.deepcopy(director_runtime["director_capability"].get(key))
            for key in PROMPT_ACTION_CAPABILITY_KEYS
            if key in director_runtime["director_capability"]
        }
    capability = _prompt_action_reconcile_h3_reference_capability(
        data,
        capability,
        declared_capability,
    )
    visual_analysis_intent = _prompt_action_visual_analysis_intent(input_text)
    image_policy = str(capability.get("image_policy") or "").lower()
    analysis_only_images = bool(visual_analysis_intent and raw_entries and image_policy == "forbidden")
    entries = list(raw_entries if analysis_only_images else visible_entries)
    try:
        max_images = int(capability.get("max_images")) if capability.get("max_images") is not None else len(entries)
    except Exception:
        max_images = len(entries)
    if capability and not analysis_only_images:
        entries = entries[:max(0, max_images)]
    director_index, director_segment = _prompt_action_director_segment(director_runtime, input_text) if director_enabled else (-1, None)
    director_context = {}
    if director_segment is not None:
        if image_policy == "forbidden":
            director_entries, director_image_refs = [], []
        else:
            director_entries, director_image_refs = _prompt_action_director_image_entries(
                director_runtime,
                director_segment,
                max_images=max_images if capability else None,
            )
        if not analysis_only_images:
            entries = director_entries
        start = _prompt_action_duration(director_segment.get("start")) or 0.0
        end = _prompt_action_duration(director_segment.get("end"))
        segment_duration = round(max(0.0, (end if end is not None else start) - start), 3)
        audio_refs = _prompt_action_media_refs(director_segment.get("audio"))
        video_refs = _prompt_action_media_refs(director_segment.get("video"))
        if str(capability.get("audio_policy") or "").lower() == "forbidden":
            audio_refs = []
        if str(capability.get("video_policy") or "").lower() == "forbidden":
            video_refs = []
        try:
            audio_refs = audio_refs[:max(0, min(3, int(capability.get("max_audios", 1))))]
        except Exception:
            audio_refs = audio_refs[:1]
        try:
            video_refs = video_refs[:max(0, min(3, int(capability.get("max_videos", 1))))]
        except Exception:
            video_refs = video_refs[:1]
        director_context = {
            "enabled": True,
            "segment_index": director_index,
            "segment_id": str(director_segment.get("id") or f"shot_{director_index + 1}"),
            "start_seconds": start,
            "end_seconds": end,
            "duration_seconds": segment_duration,
            "prompt": str(director_segment.get("prompt") or "").strip(),
            "image_refs": director_image_refs,
            "audio_refs": audio_refs,
            "video_refs": video_refs,
            "audio_ref": audio_refs[0] if audio_refs else "",
            "video_ref": video_refs[0] if video_refs else "",
        }

    entries, unresolved_image_slots = _prompt_action_normalize_image_entries(entries)
    roles = ["storyboard"] * len(entries) if analysis_only_images else _prompt_action_image_roles(
        entries,
        capability,
        media_profile.get("image_roles"),
    )
    image_descriptors = [
        {
            "slot": slot,
            "role": roles[index],
            "index": index + 1,
            "analysis_only": analysis_only_images,
        }
        for index, (slot, _image) in enumerate(entries)
    ]
    images = [image for _slot, image in entries]

    video_component = _prompt_action_existing_path(resources.get("scene_video"))
    reference_video_component = _prompt_action_existing_path(resources.get("scene_reference_video"))
    reference_video2_component = _prompt_action_existing_path(resources.get("scene_reference_video2"))
    reference_original_video = _prompt_action_existing_path(
        resources.get("scene_reference_video_original_path")
        or resources.get("reference_video_original_path")
    )
    reference_original_video2 = _prompt_action_existing_path(
        resources.get("scene_reference_video2_original_path")
        or resources.get("reference_video2_original_path")
    )
    original_video = _prompt_action_existing_path(resources.get("scene_original_video_path") or resources.get("video_path"))
    first_frame = _prompt_action_existing_path(resources.get("video_first_frame_path"))
    video_path = ""
    video_source = ""
    video_reference_index = 0
    video_descriptors = []
    video_policy = str(capability.get("video_policy") or "").lower()
    main_video_allowed = (
        video_policy != "forbidden"
        and (not scene_mode or "scene_video" not in hidden)
    )
    reference_video_allowed = (
        video_policy != "forbidden"
        and (not scene_mode or "scene_reference_video" not in hidden)
    )
    reference_video2_allowed = (
        video_policy != "forbidden"
        and (not scene_mode or "scene_reference_video2" not in hidden)
    )
    main_video_path = (original_video or video_component) if main_video_allowed and video_component else ""
    reference_video_path = (
        reference_original_video or reference_video_component
        if reference_video_allowed and reference_video_component
        else ""
    )
    reference_video2_path = (
        reference_original_video2 or reference_video2_component
        if reference_video2_allowed and reference_video2_component
        else ""
    )
    if main_video_path:
        video_descriptors.append({
            "slot": "scene_video",
            "index": len(video_descriptors) + 1,
            "role": "video reference",
        })
    if reference_video_path:
        video_descriptors.append({
            "slot": "scene_reference_video",
            "index": len(video_descriptors) + 1,
            "role": "motion/timing reference video",
        })
    if reference_video2_path:
        video_descriptors.append({
            "slot": "scene_reference_video2",
            "index": len(video_descriptors) + 1,
            "role": "motion/timing reference video",
        })

    descriptor_by_slot = {
        item["slot"]: item
        for item in video_descriptors
    }
    director_video_paths = []
    if director_segment is not None:
        fallback_video_paths = {
            "video_1": original_video if video_component else "",
            "video_2": reference_video_path,
            "video_3": reference_video2_path,
        }
        for video_ref in director_context.get("video_refs") or []:
            if video_ref == "previous_segment":
                resolved_path = ""
                for key in ("previous_segment_path", "previous_video", "last_result_video"):
                    resolved_path = _prompt_action_existing_path(director_runtime.get(key))
                    if resolved_path:
                        break
                source = "director_previous_segment" if resolved_path else "director_previous_segment_pending"
            else:
                resolved_path = _prompt_action_existing_path(_prompt_action_director_media_value(director_runtime, video_ref))
                if not resolved_path:
                    resolved_path = fallback_video_paths.get(video_ref, "")
                source = "director_explicit_video" if resolved_path else "director_video_unavailable"
            if resolved_path:
                director_video_paths.append((video_ref, resolved_path, source))
        if director_video_paths:
            video_path = director_video_paths[0][1]
            video_source = director_video_paths[0][2]
            video_reference_index = 1
            video_descriptors = [
                {
                    "slot": f"director_segment_video_{item_index}",
                    "index": item_index,
                    "role": "director segment video reference",
                    "source_ref": video_ref,
                }
                for item_index, (video_ref, _path, _source) in enumerate(director_video_paths, start=1)
            ]
        elif director_context.get("video_refs"):
            first_video_ref = director_context["video_refs"][0]
            video_source = "director_previous_segment_pending" if first_video_ref == "previous_segment" else "director_video_unavailable"
        first_frame = ""
    elif scene_mode:
        preferred_video_slot = str(opts.get("preferred_video_slot") or "").strip()
        if preferred_video_slot not in descriptor_by_slot:
            if _prompt_action_h3_reference_mode(data) and reference_video2_path:
                preferred_video_slot = "scene_reference_video2"
            elif _prompt_action_h3_reference_mode(data) and reference_video_path:
                preferred_video_slot = "scene_reference_video"
            elif main_video_path:
                preferred_video_slot = "scene_video"
            elif reference_video_path:
                preferred_video_slot = "scene_reference_video"
            elif reference_video2_path:
                preferred_video_slot = "scene_reference_video2"
        if preferred_video_slot == "scene_reference_video2" and reference_video2_path:
            video_path = reference_video2_path
            video_source = "reference_video2"
            video_reference_index = int(descriptor_by_slot[preferred_video_slot]["index"])
            first_frame = ""
        elif preferred_video_slot == "scene_reference_video" and reference_video_path:
            video_path = reference_video_path
            video_source = "reference_video"
            video_reference_index = int(descriptor_by_slot[preferred_video_slot]["index"])
            first_frame = ""
        elif preferred_video_slot == "scene_video" and main_video_path:
            video_path = main_video_path
            video_source = "main_video"
            video_reference_index = int(descriptor_by_slot[preferred_video_slot]["index"])
        else:
            first_frame = ""
    else:
        if main_video_path:
            video_path = main_video_path
            video_source = "main_video"
            video_reference_index = 1
        else:
            first_frame = ""

    if resources.get("legacy_video_direct") and original_video:
        video_path = original_video
        video_source = "main_video"
        video_reference_index = 1
        if not video_descriptors:
            video_descriptors = [{
                "slot": "scene_video",
                "index": 1,
                "role": "video reference",
            }]

    selected_video_descriptor = next(
        (
            item for item in video_descriptors
            if int(item.get("index") or 0) == int(video_reference_index or 0)
        ),
        None,
    )
    if selected_video_descriptor and not director_context.get("enabled"):
        selected_slot = str(selected_video_descriptor.get("slot") or "").strip()
        for descriptor in video_descriptors:
            slot = str(descriptor.get("slot") or "").strip()
            if slot == selected_slot:
                descriptor["role"] = "motion/timing reference video"
            elif slot in ("scene_reference_video", "scene_reference_video2"):
                descriptor["role"] = "scene/composition video reference"
            elif slot == "scene_video":
                descriptor["role"] = "scene/composition video reference"

    duration_visible = not scene_mode or "scene_video_duration" not in hidden
    target_duration = _prompt_action_duration(resources.get("scene_video_duration")) if duration_visible else None
    if director_context.get("duration_seconds") is not None:
        target_duration = director_context.get("duration_seconds")
    additional_prompts = [
        str(resources.get(key) or "").strip()
        for key in ("scene_additional_prompt", "scene_additional_prompt_2")
        if (not scene_mode or key not in hidden) and str(resources.get(key) or "").strip()
    ]
    audio_allowed = str(capability.get("audio_policy") or "").lower() != "forbidden"
    audio_slots = [
        slot
        for slot in ("scene_audio", "scene_audio2", "scene_audio3")
        if (not scene_mode or slot not in hidden) and bool(resources.get(slot))
    ]
    audio_present = audio_allowed and bool(audio_slots)
    audio_count = len(audio_slots)
    if audio_allowed and director_context.get("audio_refs"):
        available_audio_refs = [
            ref
            for ref in director_context["audio_refs"]
            if _prompt_action_director_media_value(director_runtime, ref)
        ]
        audio_present = bool(available_audio_refs)
        audio_count = len(available_audio_refs)
    reference_video_present = bool(reference_video_path or reference_video2_path or director_video_paths)

    requested_motion_picture_index = 0
    try:
        requested_motion_picture_index = max(0, int(opts.get("motion_picture_index") or 0))
    except (TypeError, ValueError):
        requested_motion_picture_index = 0
    if requested_motion_picture_index > len(image_descriptors):
        requested_motion_picture_index = 0
    if selected_video_descriptor and len(image_descriptors) == 1 and not requested_motion_picture_index:
        requested_motion_picture_index = 1

    context = {
        "scene_mode": scene_mode,
        "theme": _prompt_action_scene_theme(data),
        "capability": capability,
        "image_descriptors": image_descriptors,
        "unresolved_image_slots": unresolved_image_slots,
        "generation_image_count": 0 if analysis_only_images else len(entries),
        "analysis_only_image_count": len(entries) if analysis_only_images else 0,
        "visual_analysis_intent": visual_analysis_intent if analysis_only_images else "",
        "video_path": video_path,
        "video_first_frame_path": first_frame,
        "video_source": video_source,
        "video_count": len(video_descriptors),
        "video_descriptors": video_descriptors,
        "video_reference_index": video_reference_index,
        "video_visual_position": (
            "after_images"
            if str(media_profile.get("video_visual_position") or "").strip().lower() == "after_images"
            else "before_images"
        ),
        "video_frame_mode": (
            str(media_profile.get("video_frame_mode") or "").strip().lower()
            if str(media_profile.get("video_frame_mode") or "").strip().lower() in {"contact_sheet", "multi_frame"}
            else ""
        ),
        "video_role": str(media_profile.get("video_role") or "").strip().lower(),
        # With multiple pictures, leave the target unknown until the existing
        # storyboard shot explicitly pairs the motion video with a Picture token.
        # A guessed Picture 1 here would override that later inference.
        "motion_picture_index": requested_motion_picture_index if selected_video_descriptor else 0,
        "motion_video_slot": selected_video_descriptor.get("slot") if selected_video_descriptor else "",
        "target_duration_seconds": target_duration,
        "audio_present": audio_present,
        "audio_count": audio_count,
        "audio_content_available": False,
        "reference_video_present": reference_video_present,
        "additional_prompts": additional_prompts,
        "director": director_context,
    }
    return images, context


def normalize_media_path(value):
    if isinstance(value, (list, tuple)):
        value = next((item for item in value if item), "")
    if isinstance(value, dict):
        for key in ("path", "video", "name", "orig_name"):
            if value.get(key):
                value = value.get(key)
                break
    path_attr = getattr(value, "path", None)
    if path_attr:
        value = path_attr
    text = str(value or "").strip()
    if text.startswith("/file="):
        try:
            from urllib.parse import unquote

            text = unquote(text[len("/file="):])
        except Exception:
            text = text[len("/file="):]
    return os.path.abspath(text) if text else ""


def _video_cache_key(path, max_frames, visual_mode):
    try:
        stat = os.stat(path)
        return (
            os.path.abspath(path),
            int(stat.st_mtime_ns),
            int(stat.st_size),
            int(max_frames),
            str(visual_mode or "contact_sheet"),
        )
    except Exception:
        return None


def _copy_video_visual(value):
    if isinstance(value, (list, tuple)):
        return [np.array(item, copy=True) for item in value]
    return np.array(value, copy=True)


def _video_cache_get(key):
    if key is None:
        return None
    with _VIDEO_CACHE_LOCK:
        cached = _VIDEO_CONTEXT_CACHE.get(key)
        if cached is None:
            return None
        _VIDEO_CONTEXT_CACHE.move_to_end(key)
        visual, meta = cached
        next_meta = copy.deepcopy(meta)
        next_meta["cache_hit"] = True
        return _copy_video_visual(visual), next_meta


def _video_cache_put(key, visual, meta):
    if key is None or visual is None:
        return
    with _VIDEO_CACHE_LOCK:
        _VIDEO_CONTEXT_CACHE[key] = (_copy_video_visual(visual), copy.deepcopy(meta))
        _VIDEO_CONTEXT_CACHE.move_to_end(key)
        while len(_VIDEO_CONTEXT_CACHE) > PROMPT_ACTION_VIDEO_CACHE_SIZE:
            _VIDEO_CONTEXT_CACHE.popitem(last=False)


def clear_prompt_action_video_cache():
    with _VIDEO_CACHE_LOCK:
        _VIDEO_CONTEXT_CACHE.clear()


def _format_timestamp(seconds):
    value = max(0.0, float(seconds or 0.0))
    minutes = int(value // 60)
    remaining = value - minutes * 60
    return f"{minutes:02d}:{remaining:05.2f}"


def _frame_to_pil(frame):
    if isinstance(frame, Image.Image):
        return frame.convert("RGB")
    array = np.asarray(frame)
    if array.ndim == 2:
        return Image.fromarray(array.astype(np.uint8, copy=False)).convert("RGB")
    if array.ndim == 3 and array.shape[2] >= 3:
        return Image.fromarray(array[:, :, :3].astype(np.uint8, copy=False)).convert("RGB")
    raise ValueError("Unsupported video frame")


def _contact_sheet_font():
    for name in ("DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, 18)
        except Exception:
            continue
    return ImageFont.load_default()


def _build_contact_sheet(frames, timestamps):
    count = len(frames)
    if count <= 0:
        return None
    columns = min(4, count)
    rows = int(math.ceil(count / columns))
    width = columns * PROMPT_ACTION_VIDEO_TILE_WIDTH
    height = rows * PROMPT_ACTION_VIDEO_TILE_HEIGHT
    sheet = Image.new("RGB", (width, height), (13, 17, 23))
    draw = ImageDraw.Draw(sheet)
    font = _contact_sheet_font()
    content_height = PROMPT_ACTION_VIDEO_TILE_HEIGHT - PROMPT_ACTION_VIDEO_LABEL_HEIGHT
    resampling = getattr(Image, "Resampling", Image).LANCZOS

    for index, frame in enumerate(frames):
        row = index // columns
        column = index % columns
        left = column * PROMPT_ACTION_VIDEO_TILE_WIDTH
        top = row * PROMPT_ACTION_VIDEO_TILE_HEIGHT
        image = _frame_to_pil(frame)
        image.thumbnail(
            (PROMPT_ACTION_VIDEO_TILE_WIDTH - 8, content_height - 8),
            resampling,
        )
        image_left = left + (PROMPT_ACTION_VIDEO_TILE_WIDTH - image.width) // 2
        image_top = top + (content_height - image.height) // 2
        sheet.paste(image, (image_left, image_top))
        label_top = top + content_height
        draw.rectangle(
            (left, label_top, left + PROMPT_ACTION_VIDEO_TILE_WIDTH, top + PROMPT_ACTION_VIDEO_TILE_HEIGHT),
            fill=(24, 31, 42),
        )
        label = f"Frame {index + 1}  {_format_timestamp(timestamps[index] if index < len(timestamps) else 0)}"
        draw.text((left + 12, label_top + 6), label, fill=(235, 241, 248), font=font)
        draw.rectangle(
            (left, top, left + PROMPT_ACTION_VIDEO_TILE_WIDTH - 1, top + PROMPT_ACTION_VIDEO_TILE_HEIGHT - 1),
            outline=(58, 70, 86),
            width=1,
        )
    return np.array(sheet, dtype=np.uint8)


def _load_first_frame(path):
    source = normalize_media_path(path)
    if not source or not os.path.exists(source):
        return None
    try:
        with Image.open(source) as image:
            return np.array(image.convert("RGB"), dtype=np.uint8)
    except Exception:
        return None


def _read_video_frames(video_path, first_frame_path, max_frames):
    source = normalize_media_path(video_path)
    max_frames = max(1, min(int(max_frames or PROMPT_ACTION_VIDEO_FRAMES), 16))
    meta = {
        "ok": False,
        "source": source,
        "sampled_frames": 0,
        "timestamps": [],
        "duration_seconds": 0.0,
        "used_first_frame_only": False,
        "cache_hit": False,
    }
    frames = []
    timestamps = []
    if source and os.path.exists(source):
        capture = None
        try:
            import cv2

            capture = cv2.VideoCapture(source)
            if capture is not None and capture.isOpened():
                frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
                if frame_count > 0:
                    requested = min(max_frames, frame_count)
                    indices = sorted({
                        int(round(value))
                        for value in np.linspace(0, max(0, frame_count - 1), requested)
                    })
                    for frame_index in indices:
                        capture.set(cv2.CAP_PROP_POS_FRAMES, int(frame_index))
                        ok, frame = capture.read()
                        if not ok or frame is None:
                            continue
                        rgb = np.asarray(frame)[:, :, :3][:, :, ::-1].copy()
                        frames.append(rgb)
                        timestamps.append(float(frame_index) / fps if fps > 0 else float(len(frames) - 1))
                    if fps > 0:
                        meta["duration_seconds"] = max(0.0, float(frame_count - 1) / fps)
                else:
                    for index in range(max_frames):
                        ok, frame = capture.read()
                        if not ok or frame is None:
                            break
                        rgb = np.asarray(frame)[:, :, :3][:, :, ::-1].copy()
                        frames.append(rgb)
                        timestamps.append(float(index) / fps if fps > 0 else float(index))
        except Exception as exc:
            meta["error"] = f"{type(exc).__name__}: {exc}"
        finally:
            try:
                if capture is not None:
                    capture.release()
            except Exception:
                pass

    if not frames:
        first_frame = _load_first_frame(first_frame_path)
        if first_frame is not None:
            frames = [first_frame]
            timestamps = [0.0]
            meta["used_first_frame_only"] = True

    meta.update({
        "ok": bool(frames),
        "sampled_frames": len(frames),
        "timestamps": [round(float(value), 3) for value in timestamps],
    })
    return frames, timestamps, meta


def _resize_video_frame(frame, max_side=PROMPT_ACTION_VIDEO_MULTI_FRAME_MAX_SIDE):
    image = _frame_to_pil(frame)
    longest_side = max(image.size)
    if longest_side > max_side:
        scale = max_side / float(longest_side)
        target = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        resampling = getattr(Image, "Resampling", Image).LANCZOS
        image = image.resize(target, resampling)
    return np.array(image, dtype=np.uint8)


def build_video_frame_sequence(video_path, first_frame_path="", max_frames=PROMPT_ACTION_VIDEO_FRAMES):
    source = normalize_media_path(video_path)
    max_frames = max(1, min(int(max_frames or PROMPT_ACTION_VIDEO_FRAMES), 16))
    cache_key = _video_cache_key(source, max_frames, "multi_frame") if source and os.path.exists(source) else None
    cached = _video_cache_get(cache_key)
    if cached is not None:
        return cached

    frames, _timestamps, meta = _read_video_frames(source, first_frame_path, max_frames)
    prepared = [_resize_video_frame(frame) for frame in frames]
    meta["video_visual_mode"] = "multi_frame"
    meta["video_visual_count"] = len(prepared)
    if prepared:
        _video_cache_put(cache_key, prepared, meta)
    return prepared, meta


def build_video_contact_sheet(video_path, first_frame_path="", max_frames=PROMPT_ACTION_VIDEO_FRAMES):
    source = normalize_media_path(video_path)
    max_frames = max(1, min(int(max_frames or PROMPT_ACTION_VIDEO_FRAMES), 16))
    cache_key = _video_cache_key(source, max_frames, "contact_sheet") if source and os.path.exists(source) else None
    cached = _video_cache_get(cache_key)
    if cached is not None:
        return cached

    frames, timestamps, meta = _read_video_frames(source, first_frame_path, max_frames)

    sheet = _build_contact_sheet(frames, timestamps)
    if sheet is None:
        return None, meta

    meta["video_visual_mode"] = "contact_sheet"
    meta["video_visual_count"] = 1
    _video_cache_put(cache_key, sheet, meta)
    return sheet, meta


def prepare_prompt_action_media(
    action_id,
    input_images,
    video_path="",
    first_frame_path="",
    options=None,
    resource_context=None,
):
    action = get_prompt_action(action_id) or {}
    opts = normalize_prompt_action_options(options)
    media_policy = str(action.get("media_policy") or "none")
    images = [image for image in (input_images or []) if image is not None] if media_policy != "none" else []
    use_video = prompt_action_option_bool(opts, "use_video", True) and media_policy in {"main_video_auto", "main_video_required"}
    media_meta = copy.deepcopy(resource_context) if isinstance(resource_context, dict) else {}
    media_meta.update({
        "policy": media_policy,
        "video_requested": use_video,
        "video_used": False,
        "sampled_frames": 0,
    })
    if not use_video:
        return images, media_meta

    visual_mode = str(opts.get("video_frame_mode") or media_meta.get("video_frame_mode") or "contact_sheet").strip().lower()
    if visual_mode == "multi_frame":
        video_visuals, video_meta = build_video_frame_sequence(video_path, first_frame_path)
    else:
        sheet, video_meta = build_video_contact_sheet(video_path, first_frame_path)
        video_visuals = [sheet] if sheet is not None else []
    media_meta.update(video_meta or {})
    media_meta["video_used"] = bool(video_visuals)
    media_meta["reference_video_content_available"] = bool(
        video_visuals and media_meta.get("video_source") == "reference_video"
    )
    if video_visuals:
        if str(media_meta.get("video_visual_position") or "").strip().lower() == "after_images":
            media_meta["video_visual_start_index"] = len(images) + 1
            images.extend(video_visuals)
        else:
            media_meta["video_visual_start_index"] = 1
            images[0:0] = video_visuals
    return images, media_meta


def _prompt_action_role_label(role):
    key = str(role or "").strip().lower()
    if key == "storyboard":
        return "analysis-only storyboard"
    if key == "source_image":
        return "source image"
    if key == "first_frame":
        return "first frame"
    if key == "last_frame":
        return "last frame"
    if key == "character_reference":
        return (
            "character appearance reference; the only source for identity, face, hair, body proportions, "
            "clothing, accessories, and visual style"
        )
    match = re.match(r"^reference_image_(\d+)$", key)
    if match:
        return f"reference image {match.group(1)}"
    return key.replace("_", " ") or "image"


def prompt_action_media_note(media_meta):
    meta = media_meta if isinstance(media_meta, dict) else {}
    video_parts = []
    image_parts = []
    descriptors = meta.get("image_descriptors") if isinstance(meta.get("image_descriptors"), list) else []
    video_visual_count = int(meta.get("video_visual_count") or 1) if meta.get("video_used") else 0
    video_after_images = str(meta.get("video_visual_position") or "").strip().lower() == "after_images"
    video_start_index = int(meta.get("video_visual_start_index") or (len(descriptors) + 1 if video_after_images else 1))
    if meta.get("video_used"):
        frame_count = int(meta.get("sampled_frames") or 0)
        video_source = str(meta.get("video_source") or "")
        if video_source.startswith("director_"):
            source_label = "current Director segment video"
        elif video_source == "describe_upload":
            source_label = "uploaded video"
        elif video_source == "reference_video":
            reference_index = int(meta.get("video_reference_index") or 0)
            source_label = f"reference video <Video {reference_index}>" if reference_index > 0 else "reference video"
        else:
            source_label = "main input video"
        if meta.get("used_first_frame_only") or frame_count <= 1:
            first_frame_note = (
                f"Visual input {video_start_index} is the first decodable frame from the main input video. "
                "Use it for visible subject and setting details, but do not infer motion that is not visible."
            )
            video_parts.append(first_frame_note.replace("main input video", source_label))
        elif str(meta.get("video_visual_mode") or "") == "multi_frame":
            timestamps = meta.get("timestamps") if isinstance(meta.get("timestamps"), list) else []
            labels = [
                f"visual input {video_start_index + index} = frame {index + 1} at {_format_timestamp(timestamps[index] if index < len(timestamps) else 0)}"
                for index in range(frame_count)
            ]
            visual_range = (
                f"The first {frame_count} visual inputs"
                if video_start_index == 1
                else f"Visual inputs {video_start_index}-{video_start_index + frame_count - 1}"
            )
            video_parts.append(
                f"{visual_range} are chronological frames sampled from the {source_label}. "
                + "; ".join(labels)
                + ". Compare them in order for visible subject motion, scene development, and camera movement; "
                "do not invent audio, dialogue, or events between sampled frames."
            )
        else:
            duration = float(meta.get("duration_seconds") or 0.0)
            duration_text = f" across approximately {duration:.2f} seconds" if duration > 0 else ""
            video_parts.append(
                f"Visual input {video_start_index} is a chronological contact sheet sampled from the {source_label} "
                f"({frame_count} frames{duration_text}). "
                "Read panels left-to-right and top-to-bottom. Timestamps are printed below each panel. "
                "Use visible changes as evidence for subject motion, scene development, and camera movement; "
                "do not invent audio, dialogue, or events between sampled frames."
            )
        if str(meta.get("video_role") or "").strip().lower() == "motion_only":
            video_parts.append(
                "The video visuals are motion-only evidence. Extract the chronological action, pose changes, limb and "
                "torso movement, body orientation, timing, camera movement, and scene motion. Ignore the video person's "
                "identity, face, hair, skin tone, body shape, clothing, accessories, and visual style; none of those "
                "appearance traits may enter the final prompt."
            )
    image_offset = 0 if video_after_images else video_visual_count
    analysis_only_count = int(meta.get("analysis_only_image_count") or 0)
    if analysis_only_count and meta.get("visual_analysis_intent") == "storyboard":
        first_index = image_offset + 1
        last_index = image_offset + analysis_only_count
        visual_range = f"visual input {first_index}" if first_index == last_index else f"visual inputs {first_index}-{last_index}"
        image_parts.append(
            f"The {visual_range} contain analysis-only storyboard sheets. Read every panel in its visible order, "
            "including shot composition, subject continuity, action progression, camera direction, captions, dialogue, "
            "and timing notes. Use that evidence to design the H3 shot sequence. These images are not H3 endpoint frames "
            "or generation references: never label them as <Picture N> and never describe them as uploaded media in the "
            "final prompt."
        )
    elif descriptors:
        labels = []
        for index, item in enumerate(descriptors):
            if not isinstance(item, dict):
                continue
            visual_index = image_offset + index + 1
            labels.append(f"visual input {visual_index} = {_prompt_action_role_label(item.get('role'))}")
        if labels:
            image_parts.append(
                "Visual input roles for the current preset: " + "; ".join(labels) + ". "
                "Use each image only for its stated role."
            )
    parts = image_parts + video_parts if video_after_images else video_parts + image_parts
    return "\n\n".join(parts)


def prompt_action_resource_contract_note(media_meta):
    meta = media_meta if isinstance(media_meta, dict) else {}
    capability = meta.get("capability") if isinstance(meta.get("capability"), dict) else {}
    director = meta.get("director") if isinstance(meta.get("director"), dict) else {}
    if not capability and not director and not meta.get("scene_mode"):
        return ""
    lines = ["Trusted current preset resource contract:"]
    for key in (
        "image_policy",
        "min_images",
        "max_images",
        "max_audios",
        "max_videos",
        "image_modes",
        "video_policy",
        "video_modes",
        "audio_policy",
        "duration_strategy",
        "audio_output",
        "chain_output",
        "requires_sequential",
    ):
        if key not in capability:
            continue
        value = capability.get(key)
        if isinstance(value, (list, tuple)):
            value = ", ".join(str(item) for item in value)
        lines.append(f"- {key}: {value}")
    duration = meta.get("target_duration_seconds")
    if duration is not None:
        lines.append(f"- target_duration_seconds: {duration}")
    analysis_only_count = int(meta.get("analysis_only_image_count") or 0)
    if analysis_only_count:
        lines.append(f"- analysis_only_storyboard_images: {analysis_only_count}")
        lines.append(
            "- The storyboard visuals may be read to design shots, but they are not generation images, endpoint frames, "
            "or numbered H3 references."
        )
    lines.append(f"- audio_uploaded_or_referenced: {bool(meta.get('audio_present'))}")
    lines.append("- audio_content_available_to_agent: false")
    lines.append(f"- reference_video_uploaded: {bool(meta.get('reference_video_present'))}")
    lines.append(
        "- reference_video_content_available_to_agent: "
        f"{str(bool(meta.get('reference_video_content_available'))).lower()}"
    )
    if meta.get("video_role"):
        lines.append(f"- video_evidence_role: {meta.get('video_role')}")
    if director:
        lines.extend([
            f"- director_current_segment: {int(director.get('segment_index') or 0) + 1}",
            f"- director_segment_id: {director.get('segment_id') or ''}",
            f"- director_segment_time: {director.get('start_seconds')} to {director.get('end_seconds')} seconds",
            f"- director_audio_refs_in_order: {', '.join(director.get('audio_refs') or []) or 'none'}",
            f"- director_video_refs_in_order: {', '.join(director.get('video_refs') or []) or 'none'}",
            f"- director_video_ref: {director.get('video_ref') or 'none'}",
        ])
        if str(meta.get("video_source") or "") == "director_previous_segment_pending":
            lines.append("- previous_segment_visual_status: unavailable before the previous shot has generated")
    if analysis_only_count:
        lines.append("Do not use hidden, stale, unavailable, or role-incompatible media beyond the declared storyboard analysis visuals.")
    else:
        lines.append("Do not use hidden, stale, unavailable, or role-incompatible media.")
    return "\n".join(lines)


def prompt_action_text_context_note(media_meta, input_text=""):
    meta = media_meta if isinstance(media_meta, dict) else {}
    parts = []
    additional = meta.get("additional_prompts") if isinstance(meta.get("additional_prompts"), list) else []
    additional = [str(item).strip() for item in additional if str(item or "").strip()]
    if additional:
        parts.append("Additional user prompt fields:\n" + "\n".join(f"- {item}" for item in additional))
    director = meta.get("director") if isinstance(meta.get("director"), dict) else {}
    director_prompt = str(director.get("prompt") or "").strip()
    if director_prompt and director_prompt != str(input_text or "").strip():
        parts.append(
            f"Current Director segment prompt (shot {int(director.get('segment_index') or 0) + 1}):\n{director_prompt}"
        )
    return "\n\n".join(parts)


def _register_builtin_actions():
    builtins = [
        {
            "id": "smart_expand",
            "label_en": "Smart Expand",
            "label_cn": "智能扩写",
            "description_en": "Rewrite for the current preset, model, and scene agent.",
            "description_cn": "按当前预设、模型和场景智能体规则改写。",
            "icon": "fa-wand-magic-sparkles",
            "group": "expand",
            "modes": ["classic", "scene"],
            "requires_vlm": False,
            "requires_vlm_scene": True,
            "media_policy": "main_video_auto",
            "use_scene_agent_prompt": True,
            "handler": "smart_expand",
            "featured": True,
        },
        {
            "id": "detailed_expand",
            "label_en": "Detailed Expand",
            "label_cn": "详细扩写",
            "description_en": "Add concrete subject, action, setting, camera, lighting, and style details.",
            "description_cn": "增加主体、动作、环境、镜头、光影和风格细节。",
            "icon": "fa-align-left",
            "group": "expand",
            "modes": ["classic", "scene"],
            "requires_vlm": True,
            "media_policy": "main_video_auto",
            "use_scene_agent_prompt": True,
            "handler": "agent_rewrite",
            "instruction": (
                "Expand the input substantially while preserving its intent. Add concrete visible details for the subject, "
                "action or pose, environment, spatial relationships, composition and camera, lighting, mood, materials, "
                "and style. Keep the final result generator-ready and obey the current target prompt format."
            ),
        },
        {
            "id": "tags_to_natural",
            "label_en": "Tags to Natural Language",
            "label_cn": "Tags 转自然语言",
            "description_en": "Turn comma-separated tags into one coherent generator prompt.",
            "description_cn": "将逗号分隔的 Tags 改写为连贯的生成提示词。",
            "icon": "fa-message",
            "group": "convert",
            "modes": ["classic", "scene"],
            "requires_vlm": True,
            "media_policy": "none",
            "use_scene_agent_prompt": False,
            "handler": "agent_rewrite",
            "target_kind": "natural",
            "instruction": (
                "Convert the input tags into one coherent natural-language generator prompt. Preserve every meaningful "
                "subject, attribute, action, composition, style, and weighting cue. Do not add unrelated content."
            ),
        },
        {
            "id": "natural_to_tags",
            "label_en": "Natural Language to Tags",
            "label_cn": "自然语言转 Tags",
            "description_en": "Convert prose into canonical comma-separated English tags.",
            "description_cn": "将自然语言转换为规范的英文逗号 Tags。",
            "icon": "fa-tags",
            "group": "convert",
            "modes": ["classic", "scene"],
            "requires_vlm": True,
            "media_policy": "none",
            "use_scene_agent_prompt": False,
            "handler": "agent_rewrite",
            "target_kind": "danbooru",
            "instruction": (
                "Convert the input natural-language prompt into concise canonical Danbooru-style English tags. "
                "Use comma-separated tags only, preserve all meaningful visible details, and do not add prose or explanations."
            ),
        },
        {
            "id": "ai_translate",
            "label_en": "AI Translate",
            "label_cn": "AI 翻译",
            "description_en": "Use the current LLM to translate Chinese and English while preserving format.",
            "description_cn": "使用当前 LLM 自动判断中英文并互译，保持原意和格式。",
            "icon": "fa-language",
            "group": "convert",
            "modes": ["classic", "scene"],
            "requires_vlm": True,
            "media_policy": "none",
            "use_scene_agent_prompt": False,
            "handler": "translate",
        },
        {
            "id": "toggle_tag_separators",
            "label_en": "Tag Spaces ⇄ Underscores",
            "label_cn": "Tag 空格 ⇄ 下划线",
            "description_en": "Switch valid tag separators locally without calling AI.",
            "description_cn": "脚本切换合法 Tag 内的空格与下划线，不调用 AI。",
            "icon": "fa-arrow-right-arrow-left",
            "group": "convert",
            "modes": ["classic", "scene"],
            "requires_vlm": False,
            "media_policy": "none",
            "use_scene_agent_prompt": False,
            "handler": "tag_separator_toggle",
        },
    ]
    for action in builtins:
        register_prompt_action(action)


_register_builtin_actions()
