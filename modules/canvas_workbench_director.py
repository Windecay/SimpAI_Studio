import copy
import os
import re


SCHEMA = "simpai.director_timeline.v1"
IMAGE_REF_RE = re.compile(r"^image_(\d+)$")
AUDIO_REF_RE = re.compile(r"^audio_(\d+)$")
VIDEO_REF_RE = re.compile(r"^video_(\d+)$")
SEGMENT_TYPES = {"t2v", "flf", "fmlf", "ref"}
SEGMENT_IMAGE_LIMITS = {
    "t2v": 0,
    "flf": 1,
    "fmlf": 2,
    "ref": 9,
}
TASK_METHOD_ALIASES = {
    "t2v": "wan2.2_t2v_cn",
    "flf": "wan2.2_cn",
    "fmlf": "wan2.2_cn",
    "ref": "wan2.2_cn",
}


def _number(value, default=0.0, minimum=None, maximum=None):
    try:
        result = float(value)
    except Exception:
        result = float(default)
    if minimum is not None:
        result = max(float(minimum), result)
    if maximum is not None:
        result = min(float(maximum), result)
    return result


def _int(value, default=0, minimum=None, maximum=None):
    return int(round(_number(value, default, minimum, maximum)))


def _text(value):
    return str(value or "").strip()


def _task_method_key(value):
    return _text(value).lower().replace("-", "_").replace(" ", "_")


def _normalize_task_method(value, default=""):
    text = _text(value)
    if not text:
        return default
    return TASK_METHOD_ALIASES.get(_task_method_key(text), text)


def _segment_type_from_task_method(task_method, images=None, audio=None, video=None):
    key = _task_method_key(task_method)
    if key in SEGMENT_TYPES:
        return key
    lower = _text(task_method).lower()
    image_count = len(images) if isinstance(images, list) else 0
    has_images = image_count > 0
    has_audio = bool(audio)
    has_video = bool(video)
    if has_video:
        return "ref"
    if image_count >= 3:
        return "ref"
    if image_count == 2:
        return "fmlf"
    if image_count == 1:
        return "flf"
    if "t2v" in lower and not has_images and not has_audio and not has_video:
        return "t2v"
    if has_images and ("extent" in lower or "last" in lower):
        return "fmlf"
    if has_images and ("i2v" in lower or lower in ("wan2.2_cn", "wan2.2")):
        return "flf"
    if has_images or has_audio or has_video:
        return "ref"
    return "t2v"


def _first_ref(items):
    if not isinstance(items, list) or not items:
        return ""
    item = items[0] if isinstance(items[0], dict) else {}
    return _text(item.get("source_ref") or item.get("source_node_id"))


def _normalize_media_items(items, kind):
    if isinstance(items, dict):
        items = [items]
    if not isinstance(items, list):
        return []
    result = []
    seen = set()
    for item in items:
        source_ref = _text(item.get("source_ref") or item.get("source_node_id")) if isinstance(item, dict) else _text(item)
        if not source_ref or source_ref in seen:
            continue
        seen.add(source_ref)
        result.append(
            {
                "source_ref": source_ref,
                "source_node_id": _text(item.get("source_node_id")) if isinstance(item, dict) else "",
                "role": (_text(item.get("role")) if isinstance(item, dict) else "") or ("voice" if kind == "audio" else "reference" if kind == "video" else "first_frame"),
            }
        )
    return result


def _media_limit(capability, kind):
    policy = _text(capability.get(f"{kind}_policy")).lower() if isinstance(capability, dict) else ""
    if policy == "forbidden":
        return 0
    hard_limit = 3
    return _int(capability.get(f"max_{kind}s") if isinstance(capability, dict) else None, 1, 0, hard_limit)


def _image_role_for_type(shot_type, index, image_modes=None):
    if shot_type == "fmlf":
        return "last_frame" if index == 1 else "first_frame"
    if shot_type == "ref":
        return "reference"
    modes = {_text(item).lower() for item in (image_modes or [])}
    if index == 0 and "last_frame" in modes and "first_frame" not in modes:
        return "last_frame"
    return "first_frame"


def _limit_segment_images(shot_type, images, image_modes=None):
    limit = SEGMENT_IMAGE_LIMITS.get(shot_type, 1)
    result = []
    for index, item in enumerate((images or [])[:limit]):
        next_item = dict(item)
        next_item["role"] = _image_role_for_type(shot_type, index, image_modes)
        result.append(next_item)
    return result


def normalize_segment(segment, index=0, previous_end=0.0, image_modes=None, capability=None):
    raw = segment if isinstance(segment, dict) else {}
    start = _number(raw.get("start"), previous_end, 0, 86400)
    end = max(start, _number(raw.get("end"), start + 1, 0, 86400))
    images = _normalize_media_items(raw.get("images"), "image")
    image_seen = {_text(item.get("source_ref")) for item in images if isinstance(item, dict)}
    for key in ["image_ref", *[f"image_ref_{index}" for index in range(1, 10)], *[f"image{index}" for index in range(1, 10)]]:
        source_ref = _text(raw.get(key))
        if source_ref and source_ref not in image_seen:
            image_seen.add(source_ref)
            images.append({"source_ref": source_ref, "source_node_id": "", "role": "first_frame"})
    audio = _normalize_media_items(raw.get("audio"), "audio")
    for audio_ref in _normalize_media_items(raw.get("audio_refs"), "audio"):
        if not any(_text(item.get("source_ref")) == _text(audio_ref.get("source_ref")) for item in audio):
            audio.append(audio_ref)
    direct_audio_ref = _text(raw.get("audio_ref"))
    if direct_audio_ref and not any(_text(item.get("source_ref")) == direct_audio_ref for item in audio):
        audio.append({"source_ref": direct_audio_ref, "source_node_id": "", "role": "voice"})
    video = _normalize_media_items(raw.get("video") or raw.get("videos"), "video")
    for extra_video in _normalize_media_items(raw.get("video_refs"), "video"):
        if not any(_text(item.get("source_ref")) == _text(extra_video.get("source_ref")) for item in video):
            video.append(extra_video)
    video_ref = _text(raw.get("video_ref") or raw.get("video1"))
    if video_ref and not any(_text(item.get("source_ref")) == video_ref for item in video):
        video.append({"source_ref": video_ref, "source_node_id": "", "role": "reference"})
    raw_type = _task_method_key(raw.get("type"))
    task_method = _normalize_task_method(raw.get("task_method") or raw.get("method"))
    if not task_method and raw_type not in SEGMENT_TYPES:
        task_method = _normalize_task_method(raw.get("type"))
    shot_type = (
        raw_type
        if raw_type in SEGMENT_TYPES
        else _segment_type_from_task_method(task_method, images, audio, video)
    )
    images = _limit_segment_images(shot_type, images, image_modes)
    audio = audio[:_media_limit(capability or {}, "audio")]
    video = video[:_media_limit(capability or {}, "video")]
    return {
        "id": _text(raw.get("id")) or f"shot_{index + 1}",
        "start": start,
        "end": end,
        "unit": "seconds",
        "type": shot_type,
        "task_method": task_method,
        "prompt": str(raw.get("prompt") or "").strip(),
        "images": images,
        "audio": audio,
        "video": video,
    }


def normalize_director_payload(payload):
    raw = payload if isinstance(payload, dict) else {}
    capability = raw.get("director_capability") if isinstance(raw.get("director_capability"), dict) else {}
    image_modes = capability.get("image_modes") if isinstance(capability.get("image_modes"), list) else []
    segments = []
    previous_end = 0.0
    for index, segment in enumerate(raw.get("segments") if isinstance(raw.get("segments"), list) else []):
        normalized = normalize_segment(segment, index, previous_end, image_modes, capability)
        previous_end = normalized["end"]
        segments.append(normalized)
    if not segments:
        segments = [normalize_segment({}, 0, 0, image_modes, capability)]
    return {
        "schema": SCHEMA,
        "width": _int(raw.get("width"), 1280, 64, 8192),
        "height": _int(raw.get("height"), 720, 64, 8192),
        "fps": _number(raw.get("fps"), 24, 1, 240),
        "duration": _number(raw.get("duration"), max((item["end"] for item in segments), default=1), 0.1, 86400),
        "format": _text(raw.get("format")) or "Wan",
        "segments": segments,
        "media_sources": copy.deepcopy(raw.get("media_sources") if isinstance(raw.get("media_sources"), dict) else {}),
        "director_capability": copy.deepcopy(raw.get("director_capability") if isinstance(raw.get("director_capability"), dict) else {}),
    }


def _compact_time(value):
    number = _number(value, 0)
    if abs(number - round(number)) < 0.0001:
        return str(int(round(number)))
    return str(round(number, 3)).rstrip("0").rstrip(".")


def _token_for_ref(ref, kind):
    text = _text(ref)
    pattern = IMAGE_REF_RE if kind == "image" else AUDIO_REF_RE if kind == "audio" else VIDEO_REF_RE
    match = pattern.match(text)
    if not match:
        return ""
    return f"@{kind}{match.group(1)}"


def build_prompt_override(payload):
    director = normalize_director_payload(payload)
    parts = []
    for segment in director["segments"]:
        tokens = []
        for item in segment.get("images") or []:
            image_token = _token_for_ref(_text(item.get("source_ref")), "image") if isinstance(item, dict) else ""
            if image_token:
                tokens.append(image_token)
        for item in segment.get("audio") or []:
            audio_token = _token_for_ref(_text(item.get("source_ref")) if isinstance(item, dict) else item, "audio")
            if audio_token:
                tokens.append(audio_token)
        for item in segment.get("video") or []:
            video_token = _token_for_ref(_text(item.get("source_ref")) if isinstance(item, dict) else item, "video")
            if video_token:
                tokens.append(video_token)
        prompt = _text(segment.get("prompt"))
        if prompt:
            tokens.append(prompt)
        tokens.append(f"[{_compact_time(segment['start'])}-{_compact_time(segment['end'])}s]")
        item = " ".join(token for token in tokens if token).strip()
        if item:
            parts.append(item)
    return " | ".join(parts)


def _source_asset_path(source):
    if not isinstance(source, dict):
        return ""
    asset = source.get("asset") if isinstance(source.get("asset"), dict) else source
    for key in ("path", "output_path", "original_output_path"):
        value = _text(asset.get(key))
        if value:
            return os.path.abspath(value) if os.path.isabs(value) else value
    return ""


def _media_ref_record(ref, media_sources):
    source = media_sources.get(ref) if isinstance(media_sources, dict) else {}
    asset = source.get("asset") if isinstance(source, dict) and isinstance(source.get("asset"), dict) else {}
    return {
        "ref": ref,
        "node_id": _text(source.get("node_id")) if isinstance(source, dict) else "",
        "type": _text(source.get("type")) if isinstance(source, dict) else "",
        "title": _text(source.get("title")) if isinstance(source, dict) else "",
        "path": _source_asset_path(source),
        "mime": _text(asset.get("mime")) if isinstance(asset, dict) else "",
    }


def collect_media_refs(payload):
    director = normalize_director_payload(payload)
    media_sources = director.get("media_sources") or {}
    image_refs = []
    audio_refs = []
    video_refs = []
    seen = {"image": set(), "audio": set(), "video": set()}

    def add(kind, ref):
        if not ref or ref in seen[kind]:
            return
        seen[kind].add(ref)
        target = image_refs if kind == "image" else audio_refs if kind == "audio" else video_refs
        target.append(_media_ref_record(ref, media_sources))

    for segment in director["segments"]:
        for item in segment.get("images") or []:
            ref = _text(item.get("source_ref"))
            if IMAGE_REF_RE.match(ref):
                add("image", ref)
        for item in segment.get("audio") or []:
            ref = _text(item.get("source_ref"))
            if AUDIO_REF_RE.match(ref):
                add("audio", ref)
        for item in segment.get("video") or []:
            ref = _text(item.get("source_ref"))
            if VIDEO_REF_RE.match(ref):
                add("video", ref)
    for ref in media_sources:
        if VIDEO_REF_RE.match(ref):
            add("video", ref)
    return {
        "images": image_refs,
        "audio": audio_refs,
        "video": video_refs,
    }


def prepare_director_runtime(payload):
    director = normalize_director_payload(payload)
    prompt_override = build_prompt_override(director)
    media_refs = collect_media_refs(director)
    return {
        **director,
        "prompt_override": prompt_override,
        "media_refs": media_refs,
    }
