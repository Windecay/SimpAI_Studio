import logging
import math
import os

from enhanced import resolution_preprocess
from modules import minimax_h3_reference_plan as reference_plan


logger = logging.getLogger(__name__)


def is_h3_reference_video_task(task_method):
    return "minimax_h3_r2v" in str(task_method or "").strip().lower()


def _clean_path(value):
    if isinstance(value, dict):
        value = value.get("path") or value.get("name") or value.get("video")
    path = str(value or "").strip().strip('"')
    if not path or path.lower() in ("none", "null"):
        return ""
    return os.path.abspath(path) if os.path.isfile(path) else path


def _image_size(value):
    if isinstance(value, dict):
        value = value.get("image")
    shape = getattr(value, "shape", None)
    if shape is None or len(shape) < 2:
        return None
    try:
        height = int(shape[0])
        width = int(shape[1])
    except Exception:
        return None
    if width > 0 and height > 0:
        return width, height
    return None


def _total_vram_gib():
    try:
        from ldm_patched.modules import model_management

        device = model_management.get_torch_device()
        if getattr(device, "type", None) in ("cpu", "mps"):
            return None
        return float(model_management.get_total_memory(device)) / 1024**3
    except Exception as err:
        logger.debug("Unable to query total VRAM for H3 reference preprocess: %s", err)
        return None


def _probe_video(path):
    ffmpeg_exe = resolution_preprocess._get_ffmpeg_exe()
    size = resolution_preprocess._probe_video_size(path, ffmpeg_exe)
    duration = resolution_preprocess._probe_video_duration(path, ffmpeg_exe)
    if size:
        return {
            "width": int(size[0]),
            "height": int(size[1]),
            "duration": duration,
        }

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
        if duration is None and fps > 0.0 and frame_count > 0:
            duration = frame_count / fps
        return {"width": width, "height": height, "duration": duration}
    except Exception:
        return None


def _requested_frame_count(duration):
    try:
        seconds = float(duration)
    except Exception:
        seconds = 5.0
    if not math.isfinite(seconds) or seconds <= 0.0:
        seconds = 5.0
    return reference_plan.align_frame_count(max(5, round(seconds * reference_plan.FPS)))


def build_frontend_reference_plan(
    task_method,
    params_backend,
    width,
    height,
    duration,
    reference_images=None,
    total_vram_gib=None,
):
    if not is_h3_reference_video_task(task_method) or not isinstance(params_backend, dict):
        return None

    frame_count = _requested_frame_count(duration)
    video_sources = []
    for name, param_key in (("ref_video_0", "video"), ("ref_video_1", "reference_video")):
        path = _clean_path(params_backend.get(param_key))
        if not path or not os.path.isfile(path):
            continue
        metadata = _probe_video(path)
        if not metadata:
            logger.warning("H3 reference preprocess skipped metadata probe: %s", path)
            continue
        source_duration = metadata.get("duration")
        available_frames = frame_count
        if source_duration is not None:
            available_frames = min(
                frame_count,
                max(1, int(round(float(source_duration) * reference_plan.FPS))),
            )
        video_sources.append(
            {
                "name": name,
                "param_key": param_key,
                "path": path,
                "width": metadata["width"],
                "height": metadata["height"],
                "available_frames": available_frames,
            }
        )
    if not video_sources:
        return None

    image_items = []
    for index, image in enumerate(reference_images or []):
        size = _image_size(image)
        if size:
            image_items.append(
                {"name": f"ref_image_{index}", "width": size[0], "height": size[1]}
            )

    if total_vram_gib is None:
        total_vram_gib = _total_vram_gib()
    plan = reference_plan.plan_references(
        width,
        height,
        frame_count,
        image_items=image_items,
        video_items=video_sources,
        max_image_long_edge=reference_plan.DEFAULT_MAX_IMAGE_LONG_EDGE,
        reference_token_budget=0,
        total_vram_gib=total_vram_gib,
    )
    item_map = {
        item["name"]: item
        for item in plan["items"]
        if item.get("kind") == "video"
    }
    two_pass = "_2_pass" in str(task_method or "").lower()
    final_width = reference_plan.align_dimension(width)
    final_height = reference_plan.align_dimension(height)
    planned_videos = []
    for source in video_sources:
        item = item_map.get(source["name"])
        if not item:
            continue
        target_width = final_width if two_pass else int(item["width"])
        target_height = final_height if two_pass else int(item["height"])
        planned_videos.append(
            {
                **source,
                "target_width": target_width,
                "target_height": target_height,
                "estimated_tokens": int(item["cost"]),
                "item_budget": int(item["budget"]),
            }
        )
    return {
        "plan": plan,
        "videos": planned_videos,
        "frame_count": frame_count,
        "aligned_duration": frame_count / reference_plan.FPS,
        "two_pass": two_pass,
    }


def prepare_h3_reference_videos(
    task_method,
    params_backend,
    width,
    height,
    duration,
    reference_images=None,
    total_vram_gib=None,
):
    result = dict(params_backend or {})
    frontend_plan = build_frontend_reference_plan(
        task_method,
        result,
        width,
        height,
        duration,
        reference_images=reference_images,
        total_vram_gib=total_vram_gib,
    )
    if not frontend_plan:
        return result

    plan = frontend_plan["plan"]
    profile = plan["profile"]
    logger.info(
        "H3 reference frontend plan: task=%s profile=%s total_vram=%.2f GiB budget=%d refs=%d two_pass=%s",
        task_method,
        profile["name"],
        profile["total_vram_gib"] if profile["total_vram_gib"] is not None else -1.0,
        plan["budget"],
        len(plan["items"]),
        frontend_plan["two_pass"],
    )
    for video in frontend_plan["videos"]:
        output, changed = resolution_preprocess.preprocess_video_file(
            video["path"],
            (video["target_width"], video["target_height"]),
            "proportional",
            preserve_audio=True,
            duration_limit=frontend_plan["aligned_duration"],
            duration_padding=0.5,
            downscale_only=True,
        )
        if changed:
            result[video["param_key"]] = output
        logger.info(
            "H3 reference frontend video: slot=%s source=%dx%d target=%dx%d frames=%d changed=%s",
            video["param_key"],
            video["width"],
            video["height"],
            video["target_width"],
            video["target_height"],
            video["available_frames"],
            changed,
        )
    return result
