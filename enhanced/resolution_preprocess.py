import logging
import math
import os
import json
import shutil
import subprocess
import tempfile
import threading

import numpy as np
from PIL import Image

import modules.flags as flags

logger = logging.getLogger(__name__)

_VIDEO_PREPROCESS_CACHE = {}
_VIDEO_PREPROCESS_CACHE_ORDER = []
_VIDEO_PREPROCESS_CACHE_LOCK = threading.Lock()
_VIDEO_PREPROCESS_CACHE_MAX = 32
_VIDEO_PREPROCESS_CACHE_VERSION = 2


def bool_value(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in ("0", "false", "no", "off", "")
    return bool(value)


def normalize_edit_mode(value):
    mode = str(value or "").strip().lower()
    if mode in ("proportional", "keep", "keep_ratio"):
        return "proportional"
    if mode in ("crop", "cover"):
        return "crop"
    if mode in ("pad", "padding", "letterbox", "contain"):
        return "pad"
    return "scale"


def normalize_edit_mode_override(value):
    mode = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if mode in ("proportional", "keep", "keep_ratio"):
        return "proportional"
    if mode in ("crop", "cover"):
        return "crop"
    if mode in ("scale", "fill", "stretch"):
        return "scale"
    if mode in ("pad", "padding", "letterbox", "contain"):
        return "pad"
    return None


def resolve_preprocess_mode(profile, resolution_edit_mode=None):
    ui_mode = normalize_edit_mode_override(resolution_edit_mode)
    if ui_mode:
        return ui_mode
    profile_fit = profile.get("preprocess_fit") if isinstance(profile, dict) else None
    return normalize_edit_mode(profile_fit)


def get_resolution_profile(state_params, scene_theme=None):
    if not isinstance(state_params, dict):
        return {}
    scene_frontend = state_params.get("scene_frontend", {})
    if not isinstance(scene_frontend, dict):
        return {}
    profile = scene_frontend.get("resolution_control", {})
    if not isinstance(profile, dict):
        return {}
    return dict(profile)


def should_preprocess(profile):
    if not isinstance(profile, dict):
        return False
    if profile.get("mode") == "input_passthrough":
        return False
    return bool(profile.get("frontend_preprocess", False))


def quantize(value, step):
    try:
        step = int(step)
    except Exception:
        step = flags.default_resolution_quantize_step
    if step not in getattr(flags, "resolution_quantize_steps", [1, 8, 16, 32, 64]):
        step = flags.default_resolution_quantize_step
    if step <= 1:
        return max(1, int(round(float(value))))
    return max(step, int(round(float(value) / float(step))) * step)


def _positive_size_pair(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    try:
        w = int(float(value[0]))
        h = int(float(value[1]))
    except Exception:
        return None
    if w > 0 and h > 0:
        return w, h
    return None


def profile_uses_projected_choices(profile):
    if not isinstance(profile, dict):
        return False
    mode = str(profile.get("mode") or "").strip()
    return mode in ("image_keep_input_area", "video_keep_input_area")


def _profile_quantize_step(profile, resolution_quantize_step=None):
    raw = profile.get("quantize") if isinstance(profile, dict) else None
    if raw in (None, ""):
        raw = resolution_quantize_step
    try:
        step = int(raw)
    except Exception:
        step = flags.default_resolution_quantize_step
    if step not in getattr(flags, "resolution_quantize_steps", [1, 8, 16, 32, 64]):
        step = flags.default_resolution_quantize_step
    return step


def _parse_projected_base(value):
    if isinstance(value, dict):
        if value.get("origin"):
            return {"origin": True, "label": str(value.get("label") or "origin")}
        pair = _positive_size_pair((value.get("width"), value.get("height")))
        if pair:
            return {"width": pair[0], "height": pair[1], "label": str(value.get("label") or pair[0])}
        return None
    text = str(value or "").split(",", 1)[0].strip()
    if not text:
        return None
    marker_text = text.lower().replace("-", "_").replace(" ", "_")
    if any(marker in marker_text for marker in ("|origin", "|original", "[origin]", "[original]", "(origin)", "(original)")):
        return {"origin": True, "label": "Original" if "original" in marker_text else "origin"}
    parts = [part.strip() for part in text.split("|") if part.strip()]
    candidates = parts[1:] + parts[:1] if len(parts) > 1 else parts

    for candidate in candidates:
        raw = str(candidate or "").strip()
        if not raw:
            continue
        key = raw.lower().replace("-", "_").replace(" ", "_")
        if key in ("origin", "original", "source", "no_resize", "noresize"):
            return {"origin": True, "label": raw}
        normalized = raw.replace("*", "x").replace("X", "x").replace("×", "x")
        if "x" in normalized:
            left, right = normalized.split("x", 1)
            try:
                w = int(float(left.strip()))
                h = int(float(right.strip()))
                if w > 0 and h > 0:
                    return {"width": w, "height": h, "label": raw}
            except Exception:
                pass
        if raw.isdigit():
            size = int(raw)
            if size > 0:
                return {"width": size, "height": size, "label": raw}
    return None


def project_keep_input_area_size(source_size, base_width, base_height, step=None):
    source_size = _positive_size_pair(source_size)
    if not source_size:
        return None
    try:
        base_width = int(float(base_width))
        base_height = int(float(base_height))
    except Exception:
        return None
    if base_width <= 0 or base_height <= 0:
        return None
    source_width, source_height = source_size
    area = base_width * base_height
    ratio = source_width / max(1, source_height)
    return quantize(math.sqrt(area * ratio), step), quantize(math.sqrt(area / ratio), step)


def project_keep_input_pixel_area_size(source_size, area, step=None):
    source_size = _positive_size_pair(source_size)
    if not source_size:
        return None
    try:
        area = float(area)
    except Exception:
        return None
    if area <= 0:
        return None
    source_width, source_height = source_size
    ratio = source_width / max(1, source_height)
    return quantize(math.sqrt(area * ratio), step), quantize(math.sqrt(area / ratio), step)


def _project_size_for_base(source_size, base, step):
    source_size = _positive_size_pair(source_size)
    if not source_size or not isinstance(base, dict):
        return None
    if base.get("origin"):
        return source_size
    return project_keep_input_area_size(source_size, base.get("width"), base.get("height"), step)


def _profile_projected_bases(profile):
    if not isinstance(profile, dict):
        return []
    result = []
    values = profile.get("aspect_ratios")
    if isinstance(values, str):
        values = [values]
    if isinstance(values, (list, tuple)):
        for item in values:
            base = _parse_projected_base(item)
            if base:
                result.append(base)
    if result:
        return result
    try:
        width = int(profile.get("base_width") or 0)
        height = int(profile.get("base_height") or 0)
    except Exception:
        width, height = 0, 0
    if width > 0 and height > 0:
        return [{"width": width, "height": height, "label": str(width)}]
    return []


def infer_projected_profile_base(profile, current_source_size, current_target_size, resolution_quantize_step=None):
    if not profile_uses_projected_choices(profile):
        return None
    current_source_size = _positive_size_pair(current_source_size)
    current_target_size = _positive_size_pair(current_target_size)
    if not current_source_size or not current_target_size:
        return None
    step = _profile_quantize_step(profile, resolution_quantize_step)
    best_base = None
    best_score = None
    for base in _profile_projected_bases(profile):
        projected = _project_size_for_base(current_source_size, base, step)
        if not projected:
            continue
        score = abs(projected[0] - current_target_size[0]) + abs(projected[1] - current_target_size[1])
        if best_score is None or score < best_score:
            best_base = base
            best_score = score
    if best_base is not None and best_score is not None and best_score <= max(2, step):
        return best_base
    return None


def infer_projected_profile_base_from_target(profile, current_target_size):
    if not profile_uses_projected_choices(profile):
        return None
    current_target_size = _positive_size_pair(current_target_size)
    if not current_target_size:
        return None
    for base in _profile_projected_bases(profile):
        if base.get("origin"):
            continue
        pair = _positive_size_pair((base.get("width"), base.get("height")))
        if pair and pair == current_target_size:
            return base
    return None


def resolve_projected_profile_base(
    profile,
    selected_value=None,
    current_source_size=None,
    current_target_size=None,
    resolution_quantize_step=None,
):
    if not profile_uses_projected_choices(profile):
        return None
    parsed = _parse_projected_base(selected_value)
    if parsed and parsed.get("origin"):
        return parsed
    inferred = infer_projected_profile_base(profile, current_source_size, current_target_size, resolution_quantize_step)
    if inferred:
        return inferred
    if not _positive_size_pair(current_source_size):
        inferred = infer_projected_profile_base_from_target(profile, current_target_size)
        if inferred:
            return inferred
    if _positive_size_pair(current_source_size) and _positive_size_pair(current_target_size):
        return None
    if parsed:
        return parsed
    bases = _profile_projected_bases(profile)
    return bases[0] if bases else None


def resolve_projected_profile_size(
    source_size,
    profile,
    selected_value=None,
    current_source_size=None,
    current_target_size=None,
    resolution_quantize_step=None,
):
    base = resolve_projected_profile_base(
        profile,
        selected_value=selected_value,
        current_source_size=current_source_size,
        current_target_size=current_target_size,
        resolution_quantize_step=resolution_quantize_step,
    )
    if not base:
        return None
    step = _profile_quantize_step(profile, resolution_quantize_step)
    return _project_size_for_base(source_size, base, step)


def parse_resolution(value):
    text = str(value or "").strip()
    if not text:
        return None
    text = text.split("|", 1)[0]
    text = text.split(",", 1)[0]
    for sep in ("x", "X", "*", "×", "脳"):
        if sep in text:
            left, right = text.split(sep, 1)
            try:
                w = int(float(left.strip()))
                h = int(float(right.strip()))
                if w > 0 and h > 0:
                    return w, h
            except Exception:
                return None
    return None


def resolve_target_size(
    overwrite_width=None,
    overwrite_height=None,
    scene_aspect_ratio=None,
    resolution_multiplier=1.0,
    resolution_quantize_step=None,
):
    try:
        w = int(float(overwrite_width))
        h = int(float(overwrite_height))
    except Exception:
        w, h = -1, -1
    if w <= 0 or h <= 0:
        parsed = parse_resolution(scene_aspect_ratio)
        if parsed:
            w, h = parsed
    if w <= 0 or h <= 0:
        return None
    try:
        multiplier = float(resolution_multiplier)
    except Exception:
        multiplier = 1.0
    multiplier = max(1.0, min(2.0, multiplier))
    if multiplier > 1.0:
        w = quantize(float(w) * multiplier, resolution_quantize_step)
        h = quantize(float(h) * multiplier, resolution_quantize_step)
    return int(w), int(h)


def _image_from_value(value):
    if value is None:
        return None
    if isinstance(value, dict):
        img = value.get("image")
        if img is None:
            img = value.get("background")
        if img is None:
            img = value.get("composite")
        return img
    return value


def _image_value_size(value):
    image = _image_from_value(value)
    if isinstance(image, Image.Image):
        return _positive_size_pair(image.size)
    if isinstance(image, np.ndarray) and image.ndim >= 2:
        return _positive_size_pair((image.shape[1], image.shape[0]))
    return None


def is_original_resolution_selection(value):
    base = _parse_projected_base(value)
    return bool(isinstance(base, dict) and base.get("origin"))


def resolve_effective_original_input(
    resolution_original_input,
    scene_aspect_ratio,
    target_size,
    profile,
    scene_canvas_image=None,
    scene_input_image1=None,
    scene_input_image2=None,
    scene_input_image3=None,
    scene_input_image4=None,
    scene_input_image5=None,
    scene_input_image6=None,
    scene_input_image7=None,
    scene_input_image8=None,
):
    if bool_value(resolution_original_input):
        return True
    if not is_original_resolution_selection(scene_aspect_ratio):
        return False

    source_key = str(profile.get("source") or "scene_input_image1").strip() if isinstance(profile, dict) else "scene_input_image1"
    source_value = {
        "scene_canvas": scene_canvas_image,
        "scene_canvas_image": scene_canvas_image,
        "scene_input_image1": scene_input_image1,
        "scene_input_image2": scene_input_image2,
        "scene_input_image3": scene_input_image3,
        "scene_input_image4": scene_input_image4,
        "scene_input_image5": scene_input_image5,
        "scene_input_image6": scene_input_image6,
        "scene_input_image7": scene_input_image7,
        "scene_input_image8": scene_input_image8,
    }.get(source_key)
    source_size = _image_value_size(source_value)
    target_size = _positive_size_pair(target_size)
    return bool(source_size and target_size and source_size == target_size)


def _pil_from_image(value):
    img = _image_from_value(value)
    if img is None:
        return None
    if isinstance(img, Image.Image):
        return img
    if isinstance(img, np.ndarray):
        return Image.fromarray(img)
    if isinstance(img, str) and os.path.exists(img):
        return Image.open(img)
    return None


def _pil_to_numpy_like(pil_img, original):
    src = _image_from_value(original)
    if isinstance(src, np.ndarray):
        return np.array(pil_img)
    return pil_img


def _fit_rect(src_w, src_h, target_w, target_h, mode):
    if mode in ("proportional", "scale"):
        return 0, 0, target_w, target_h
    scale = max(target_w / src_w, target_h / src_h) if mode == "crop" else min(target_w / src_w, target_h / src_h)
    draw_w = max(1, int(round(src_w * scale)))
    draw_h = max(1, int(round(src_h * scale)))
    return int(round((target_w - draw_w) / 2)), int(round((target_h - draw_h) / 2)), draw_w, draw_h


def preprocess_image_value(value, target_size, mode):
    pil_img = _pil_from_image(value)
    if pil_img is None:
        return value, False
    target_w, target_h = target_size
    mode = normalize_edit_mode(mode)
    src_w, src_h = pil_img.size
    if src_w == target_w and src_h == target_h:
        return value, False

    has_alpha = pil_img.mode in ("RGBA", "LA") or (pil_img.mode == "P" and "transparency" in pil_img.info)
    work = pil_img.convert("RGBA" if has_alpha else "RGB")
    background = (0, 0, 0, 0) if has_alpha else (0, 0, 0)
    canvas = Image.new(work.mode, (target_w, target_h), background)
    dx, dy, dw, dh = _fit_rect(src_w, src_h, target_w, target_h, mode)
    resized = work.resize((dw, dh), Image.Resampling.LANCZOS)
    canvas.paste(resized, (dx, dy))

    if isinstance(value, dict):
        out = dict(value)
        out["image"] = _pil_to_numpy_like(canvas, value)
        if value.get("mask") is not None:
            mask = value.get("mask")
            try:
                mask_img = Image.fromarray(mask) if isinstance(mask, np.ndarray) else mask
                if isinstance(mask_img, Image.Image):
                    mask_canvas = Image.new(mask_img.mode, (target_w, target_h), 0)
                    mask_resized = mask_img.resize((dw, dh), Image.Resampling.NEAREST)
                    mask_canvas.paste(mask_resized, (dx, dy))
                    out["mask"] = np.array(mask_canvas) if isinstance(mask, np.ndarray) else mask_canvas
            except Exception:
                pass
        return out, True
    return _pil_to_numpy_like(canvas, value), True


def _get_ffmpeg_exe():
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if isinstance(exe, str) and exe.strip() and os.path.exists(exe.strip()):
            return exe.strip()
    except Exception:
        pass
    try:
        return shutil.which("ffmpeg")
    except Exception:
        return None


def _get_ffprobe_exe(ffmpeg_exe=None):
    try:
        exe = shutil.which("ffprobe")
        if exe:
            return exe
    except Exception:
        pass
    if isinstance(ffmpeg_exe, str) and ffmpeg_exe:
        candidate = os.path.join(os.path.dirname(ffmpeg_exe), "ffprobe.exe" if os.name == "nt" else "ffprobe")
        if os.path.exists(candidate):
            return candidate
    return None


def _probe_video_cv2(path):
    try:
        import cv2

        capture = cv2.VideoCapture(path)
        if not capture.isOpened():
            return None
        try:
            width = int(round(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0))
            height = int(round(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0))
            fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
            frame_count = int(round(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0))
        finally:
            capture.release()
        if width <= 0 or height <= 0:
            return None
        duration = frame_count / fps if fps > 0.0 and frame_count > 0 else None
        return {"size": (width, height), "duration": duration}
    except Exception:
        return None


def _probe_video_size(path, ffmpeg_exe=None):
    ffprobe_exe = _get_ffprobe_exe(ffmpeg_exe)
    if not ffprobe_exe:
        fallback = _probe_video_cv2(path)
        return fallback.get("size") if fallback else None
    cmd = [
        ffprobe_exe,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        os.path.abspath(path),
    ]
    try:
        completed = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            timeout=8,
        )
        if completed.returncode != 0:
            fallback = _probe_video_cv2(path)
            return fallback.get("size") if fallback else None
        payload = json.loads(completed.stdout or "{}")
        streams = payload.get("streams") or []
        if not streams:
            return None
        width = int(streams[0].get("width") or 0)
        height = int(streams[0].get("height") or 0)
        if width > 0 and height > 0:
            return width, height
    except Exception:
        fallback = _probe_video_cv2(path)
        return fallback.get("size") if fallback else None
    fallback = _probe_video_cv2(path)
    return fallback.get("size") if fallback else None


def _probe_video_duration(path, ffmpeg_exe=None):
    ffprobe_exe = _get_ffprobe_exe(ffmpeg_exe)
    if not ffprobe_exe:
        fallback = _probe_video_cv2(path)
        return fallback.get("duration") if fallback else None
    cmd = [
        ffprobe_exe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        os.path.abspath(path),
    ]
    try:
        completed = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            timeout=8,
        )
        if completed.returncode != 0:
            fallback = _probe_video_cv2(path)
            return fallback.get("duration") if fallback else None
        value = float(str(completed.stdout or "").strip())
        if math.isfinite(value) and value > 0:
            return value
    except Exception:
        fallback = _probe_video_cv2(path)
        return fallback.get("duration") if fallback else None
    fallback = _probe_video_cv2(path)
    return fallback.get("duration") if fallback else None


def _duration_limit_with_padding(duration_limit, reserve_seconds=0.5):
    try:
        limit = float(duration_limit)
    except Exception:
        return None
    if not math.isfinite(limit) or limit <= 0:
        return None
    try:
        reserve = float(reserve_seconds)
    except Exception:
        reserve = 0.5
    if not math.isfinite(reserve):
        reserve = 0.5
    return limit + max(0.0, reserve)


def _video_preprocess_source_signature(path):
    try:
        abs_path = os.path.abspath(path)
        stat = os.stat(abs_path)
        return abs_path, int(stat.st_mtime_ns), int(stat.st_size)
    except Exception:
        return None


def _round_optional_number(value):
    if value is None:
        return None
    try:
        number = float(value)
        if math.isfinite(number):
            return round(number, 3)
    except Exception:
        return None
    return None


def _video_preprocess_cache_key(
    path,
    ffmpeg_exe,
    target_w,
    target_h,
    mode,
    preserve_audio,
    is_mask,
    duration_limit,
    duration_padding,
    clip_duration,
    should_clip_duration,
    downscale_only,
):
    source_signature = _video_preprocess_source_signature(path)
    if not source_signature:
        return None
    try:
        normalized_ffmpeg = os.path.abspath(ffmpeg_exe) if isinstance(ffmpeg_exe, str) else str(ffmpeg_exe)
    except Exception:
        normalized_ffmpeg = str(ffmpeg_exe)
    return (
        _VIDEO_PREPROCESS_CACHE_VERSION,
        source_signature,
        normalized_ffmpeg,
        int(target_w),
        int(target_h),
        str(mode or ""),
        bool(preserve_audio),
        bool(is_mask),
        _round_optional_number(duration_limit),
        _round_optional_number(duration_padding),
        _round_optional_number(clip_duration),
        bool(should_clip_duration),
        bool(downscale_only),
    )


def _video_preprocess_cache_get(cache_key):
    if cache_key is None:
        return None
    with _VIDEO_PREPROCESS_CACHE_LOCK:
        cached = _VIDEO_PREPROCESS_CACHE.get(cache_key)
        if not cached:
            return None
        out_path = cached.get("path") if isinstance(cached, dict) else None
        try:
            cache_valid = isinstance(out_path, str) and os.path.exists(out_path) and os.path.getsize(out_path) > 0
        except Exception:
            cache_valid = False
        if not cache_valid:
            _VIDEO_PREPROCESS_CACHE.pop(cache_key, None)
            try:
                _VIDEO_PREPROCESS_CACHE_ORDER.remove(cache_key)
            except ValueError:
                pass
            return None
        if cache_key in _VIDEO_PREPROCESS_CACHE_ORDER:
            try:
                _VIDEO_PREPROCESS_CACHE_ORDER.remove(cache_key)
            except ValueError:
                pass
        _VIDEO_PREPROCESS_CACHE_ORDER.append(cache_key)
        return out_path


def _video_preprocess_cache_put(cache_key, out_path):
    if cache_key is None:
        return
    try:
        cache_valid = isinstance(out_path, str) and os.path.exists(out_path) and os.path.getsize(out_path) > 0
    except Exception:
        cache_valid = False
    if not cache_valid:
        return
    with _VIDEO_PREPROCESS_CACHE_LOCK:
        _VIDEO_PREPROCESS_CACHE[cache_key] = {"path": os.path.abspath(out_path)}
        if cache_key in _VIDEO_PREPROCESS_CACHE_ORDER:
            try:
                _VIDEO_PREPROCESS_CACHE_ORDER.remove(cache_key)
            except ValueError:
                pass
        _VIDEO_PREPROCESS_CACHE_ORDER.append(cache_key)
        while len(_VIDEO_PREPROCESS_CACHE_ORDER) > _VIDEO_PREPROCESS_CACHE_MAX:
            old_key = _VIDEO_PREPROCESS_CACHE_ORDER.pop(0)
            _VIDEO_PREPROCESS_CACHE.pop(old_key, None)


def preprocess_video_file(
    path,
    target_size,
    mode,
    preserve_audio=True,
    is_mask=False,
    duration_limit=None,
    duration_padding=0.5,
    downscale_only=False,
):
    if not isinstance(path, str) or not path.strip() or not os.path.exists(path):
        return path, False
    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        logger.warning("Resolution video preprocess skipped: ffmpeg not found.")
        return path, False

    target_w, target_h = target_size
    source_size = _probe_video_size(path, ffmpeg_exe)
    clip_duration = _duration_limit_with_padding(duration_limit, duration_padding)
    source_duration = _probe_video_duration(path, ffmpeg_exe) if clip_duration else None
    should_clip_duration = bool(clip_duration and (source_duration is None or source_duration > clip_duration + 0.01))
    should_resize = not (source_size and source_size[0] == target_w and source_size[1] == target_h)
    if downscale_only:
        should_resize = bool(
            source_size
            and int(source_size[0]) * int(source_size[1]) > int(target_w) * int(target_h)
        )
    if not should_resize and not should_clip_duration:
        return path, False

    mode = normalize_edit_mode(mode)
    cache_key = _video_preprocess_cache_key(
        path,
        ffmpeg_exe,
        target_w,
        target_h,
        mode,
        preserve_audio,
        is_mask,
        duration_limit,
        duration_padding,
        clip_duration,
        should_clip_duration,
        downscale_only,
    )
    cached_out = _video_preprocess_cache_get(cache_key)
    if cached_out:
        logger.info("Resolution video preprocess cache hit: %s -> %s (%sx%s, %s)", path, cached_out, target_w, target_h, mode)
        return cached_out, True

    scale_flags = ":flags=neighbor" if is_mask else ""
    if mode == "proportional":
        vf = f"scale={target_w}:{target_h}{scale_flags},setsar=1"
    elif mode == "crop":
        vf = f"scale={target_w}:{target_h}:force_original_aspect_ratio=increase{scale_flags},crop={target_w}:{target_h},setsar=1"
    elif mode == "pad":
        vf = (
            f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease{scale_flags},"
            f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1"
        )
    else:
        vf = f"scale={target_w}:{target_h}{scale_flags},setsar=1"

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4", prefix="simpai_resolution_video_") as tmp:
            out_path = os.path.abspath(tmp.name)
    except Exception:
        return path, False

    cmd = [
        ffmpeg_exe,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        os.path.abspath(path),
    ]
    if should_clip_duration:
        cmd += ["-t", f"{clip_duration:.3f}"]
    if should_resize:
        cmd += ["-vf", vf]
    cmd += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "12" if is_mask else "18",
        "-pix_fmt",
        "yuv420p",
    ]
    if preserve_audio:
        cmd += ["-map", "0:v:0", "-map", "0:a?", "-c:a", "aac", "-b:a", "128k"]
    else:
        cmd += ["-an"]
    cmd.append(out_path)

    try:
        duration_for_timeout = clip_duration or source_duration or 30.0
        timeout_seconds = max(120, min(1800, int(math.ceil(float(duration_for_timeout) * 12.0 + 60.0))))
        completed = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            timeout=timeout_seconds,
        )
        if completed.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 0:
            duration_label = f"{clip_duration:.3f}s" if should_clip_duration else "full"
            output_width, output_height = (
                (target_w, target_h)
                if should_resize or not source_size
                else (source_size[0], source_size[1])
            )
            logger.info(
                "Resolution video preprocess: %s -> %s (%sx%s, %s, duration=%s)",
                path,
                out_path,
                output_width,
                output_height,
                mode,
                duration_label,
            )
            _video_preprocess_cache_put(cache_key, out_path)
            return out_path, True
        logger.warning("Resolution video preprocess failed: %s", (completed.stderr or "").strip())
    except Exception as exc:
        logger.warning("Resolution video preprocess failed: %s", exc)

    try:
        if os.path.exists(out_path):
            os.remove(out_path)
    except Exception:
        pass
    return path, False


def apply_scene_resolution_preprocess(
    state_params,
    scene_theme,
    scene_canvas_image,
    scene_input_image1,
    scene_input_image2,
    scene_input_image3,
    scene_input_image4,
    scene_video,
    scene_original_video_path,
    active_video_source,
    sam3_input_video,
    sam3_original_video_path,
    sam3_mask_video,
    scene_aspect_ratio,
    overwrite_width,
    overwrite_height,
    resolution_multiplier,
    resolution_quantize_step,
    resolution_edit_mode,
    resolution_original_input=False,
    sam3_trim_payload=None,
    scene_video_duration=None,
    scene_input_image5=None,
    scene_input_image6=None,
    scene_input_image7=None,
    scene_input_image8=None,
):
    profile = get_resolution_profile(state_params, scene_theme)
    if bool_value(resolution_original_input) or not should_preprocess(profile):
        return {
            "scene_canvas_image": scene_canvas_image,
            "scene_input_image1": scene_input_image1,
            "scene_input_image2": scene_input_image2,
            "scene_input_image3": scene_input_image3,
            "scene_input_image4": scene_input_image4,
            "scene_input_image5": scene_input_image5,
            "scene_input_image6": scene_input_image6,
            "scene_input_image7": scene_input_image7,
            "scene_input_image8": scene_input_image8,
            "scene_video": scene_video,
            "scene_original_video_path": scene_original_video_path,
            "sam3_input_video": sam3_input_video,
            "sam3_original_video_path": sam3_original_video_path,
            "sam3_mask_video": sam3_mask_video,
            "sam3_trim_payload": sam3_trim_payload,
            "changed": False,
        }

    target_size = resolve_target_size(
        overwrite_width=overwrite_width,
        overwrite_height=overwrite_height,
        scene_aspect_ratio=scene_aspect_ratio,
        resolution_multiplier=resolution_multiplier,
        resolution_quantize_step=resolution_quantize_step,
    )
    if not target_size:
        return {
            "scene_canvas_image": scene_canvas_image,
            "scene_input_image1": scene_input_image1,
            "scene_input_image2": scene_input_image2,
            "scene_input_image3": scene_input_image3,
            "scene_input_image4": scene_input_image4,
            "scene_input_image5": scene_input_image5,
            "scene_input_image6": scene_input_image6,
            "scene_input_image7": scene_input_image7,
            "scene_input_image8": scene_input_image8,
            "scene_video": scene_video,
            "scene_original_video_path": scene_original_video_path,
            "sam3_input_video": sam3_input_video,
            "sam3_original_video_path": sam3_original_video_path,
            "sam3_mask_video": sam3_mask_video,
            "sam3_trim_payload": sam3_trim_payload,
            "changed": False,
        }

    mode = resolve_preprocess_mode(profile, resolution_edit_mode)
    target = str(profile.get("preprocess_target") or "").strip().lower()
    source = str(profile.get("source") or "").strip()
    profile_mode = str(profile.get("mode") or "")
    duration_limit = (
        scene_video_duration
        if bool_value(profile.get("preprocess_duration_limit"), True)
        else None
    )
    changed = False

    if target == "video" or profile_mode.startswith("video_") or source in ("video_first_frame", "scene_video_first_frame", "scene_video", "sam3_input_video"):
        if active_video_source == "scene":
            src = scene_original_video_path or scene_video
            out, did = preprocess_video_file(
                src,
                target_size,
                mode,
                preserve_audio=bool(profile.get("preserve_audio", True)),
                duration_limit=duration_limit,
            )
            if did:
                scene_original_video_path = out
                scene_video = out
                changed = True
        else:
            sam3_trim_used = False
            try:
                from enhanced import sam3_video_mask as _sam3_video_mask

                src = _sam3_video_mask.trim_original_video_for_sam3(sam3_original_video_path, sam3_trim_payload)
                sam3_trim_used = bool(src)
                if not src:
                    src = _sam3_video_mask.prefer_current_sam3_video_path(sam3_input_video, sam3_original_video_path)
            except Exception:
                src = sam3_input_video or sam3_original_video_path
            src = src or scene_original_video_path or scene_video
            out, did = preprocess_video_file(
                src,
                target_size,
                mode,
                preserve_audio=bool(profile.get("preserve_audio", True)),
                duration_limit=duration_limit,
            )
            if did:
                sam3_original_video_path = out
                sam3_input_video = out
                if sam3_trim_used:
                    sam3_trim_payload = ""
                changed = True
        if sam3_mask_video is not None:
            mask_out, mask_did = preprocess_video_file(
                sam3_mask_video,
                target_size,
                mode,
                preserve_audio=False,
                is_mask=True,
                duration_limit=duration_limit,
            )
            if mask_did:
                sam3_mask_video = mask_out
                changed = True
    else:
        source_key = source or "scene_input_image1"
        if source_key == "scene_canvas":
            scene_canvas_image, did = preprocess_image_value(scene_canvas_image, target_size, mode)
        elif source_key == "scene_input_image2":
            scene_input_image2, did = preprocess_image_value(scene_input_image2, target_size, mode)
        elif source_key == "scene_input_image3":
            scene_input_image3, did = preprocess_image_value(scene_input_image3, target_size, mode)
        elif source_key == "scene_input_image4":
            scene_input_image4, did = preprocess_image_value(scene_input_image4, target_size, mode)
        elif source_key == "scene_input_image5":
            scene_input_image5, did = preprocess_image_value(scene_input_image5, target_size, mode)
        elif source_key == "scene_input_image6":
            scene_input_image6, did = preprocess_image_value(scene_input_image6, target_size, mode)
        elif source_key == "scene_input_image7":
            scene_input_image7, did = preprocess_image_value(scene_input_image7, target_size, mode)
        elif source_key == "scene_input_image8":
            scene_input_image8, did = preprocess_image_value(scene_input_image8, target_size, mode)
        else:
            scene_input_image1, did = preprocess_image_value(scene_input_image1, target_size, mode)
        changed = changed or did

    if changed:
        logger.info(
            "Resolution preprocess applied: preset=%s theme=%s target=%s size=%sx%s mode=%s",
            state_params.get("__preset") if isinstance(state_params, dict) else None,
            scene_theme,
            target or source or profile_mode,
            target_size[0],
            target_size[1],
            mode,
        )

    return {
        "scene_canvas_image": scene_canvas_image,
        "scene_input_image1": scene_input_image1,
        "scene_input_image2": scene_input_image2,
        "scene_input_image3": scene_input_image3,
        "scene_input_image4": scene_input_image4,
        "scene_input_image5": scene_input_image5,
        "scene_input_image6": scene_input_image6,
        "scene_input_image7": scene_input_image7,
        "scene_input_image8": scene_input_image8,
        "scene_video": scene_video,
        "scene_original_video_path": scene_original_video_path,
        "sam3_input_video": sam3_input_video,
        "sam3_original_video_path": sam3_original_video_path,
        "sam3_mask_video": sam3_mask_video,
        "sam3_trim_payload": sam3_trim_payload,
        "changed": changed,
    }
