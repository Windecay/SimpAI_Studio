"""Studio-native Depth Anything V2 relative-depth video processing."""

from __future__ import annotations

import os
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any, Callable

from enhanced.nvidia_vsr import (
    _RawVideoWriter,
    _ffmpeg_executable,
    _inspect_video,
    _iter_video_frames,
    _mux_source_audio,
    localized_text,
)


DEPTH_ANYTHING_V2_VIDEO_METHOD = "depth_anything_v2_video"
NATIVE_PROCESS = "studio"
DEPTH_MODEL_NAME = "depth_anything_v2_vitl.pth"

ProgressCallback = Callable[[int, str], None]
CancelCallback = Callable[[], bool]


class DepthAnythingV2VideoCancelled(RuntimeError):
    """Raised when the Studio task is stopped by the user."""


class DepthAnythingV2VideoDependencyError(RuntimeError):
    """Raised when a native depth-video dependency is unavailable."""


def _value(source: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(source, Mapping):
            if name in source and source[name] is not None:
                return source[name]
        else:
            candidate = getattr(source, name, None)
            if candidate is not None:
                return candidate
    return default


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        result = int(round(float(value)))
    except (TypeError, ValueError):
        result = default
    return max(minimum, min(maximum, result))


def normalize_depth_video_params(source: Any) -> dict[str, Any]:
    """Normalize scene values without importing the depth model or video libraries."""

    return {
        "crf": _bounded_int(
            _value(source, "scene_var_number2", "var_number2", default=19),
            19,
            5,
            45,
        ),
        "duration_limit": max(
            0.0,
            _number(
                _value(
                    source,
                    "scene_video_duration",
                    "video_duration",
                    "scene_var_number",
                    "var_number",
                    default=0,
                ),
                0.0,
            ),
        ),
    }


def is_native_depth_anything_v2_video_task(task: Any) -> bool:
    method = str(getattr(task, "task_method", "") or "").strip().casefold().removeprefix("scene_")
    if method != DEPTH_ANYTHING_V2_VIDEO_METHOD:
        return False
    backend_params = getattr(task, "params_backend", None)
    native_process = _value(backend_params, "native_process", default="")
    task_name = (
        str(getattr(task, "task_name", "") or "")
        .strip()
        .casefold()
        .replace("_", "-")
        .replace(" ", "-")
    )
    return str(native_process or "").strip().casefold() == NATIVE_PROCESS or task_name in {
        "depth-video",
        "depth-anything-v2-video",
    }


def _load_video_dependencies():
    try:
        import cv2
        import numpy as np
        import torch
        import av
    except Exception as exc:
        raise DepthAnythingV2VideoDependencyError(
            f"Depth Anything V2 video requires av, cv2, numpy, and torch: {type(exc).__name__}: {exc}"
        ) from exc
    return av, cv2, np, torch


def _controlnet_aux_source_path() -> Path:
    return (
        Path(__file__).resolve().parents[1]
        / "comfy"
        / "custom_nodes"
        / "comfyui_controlnet_aux"
        / "src"
    )


def _ensure_controlnet_aux_import_path() -> Path:
    project_root = Path(__file__).resolve().parents[1]
    comfy_root = project_root / "comfy"
    source_root = _controlnet_aux_source_path()
    for path in (project_root, comfy_root, source_root):
        path_text = str(path)
        if path.is_dir() and path_text not in sys.path:
            sys.path.insert(0, path_text)
    return source_root


def _load_depth_detector():
    try:
        _ensure_controlnet_aux_import_path()
        from custom_controlnet_aux.depth_anything_v2 import DepthAnythingV2Detector
        import comfy.model_management as model_management
    except Exception as exc:
        raise DepthAnythingV2VideoDependencyError(
            f"Depth Anything V2 preprocessor is unavailable: {type(exc).__name__}: {exc}"
        ) from exc

    try:
        detector = DepthAnythingV2Detector.from_pretrained(filename=DEPTH_MODEL_NAME)
        return detector.to(model_management.get_torch_device())
    except Exception as exc:
        raise DepthAnythingV2VideoDependencyError(
            f"Depth Anything V2 model '{DEPTH_MODEL_NAME}' could not be loaded: {exc}"
        ) from exc


def _even_dimension(value: int) -> int:
    return max(2, int(value) + int(value) % 2)


def _depth_frame(detector: Any, frame: Any, width: int, height: int, detect_resolution: int, cv2: Any, np: Any) -> Any:
    depth = detector(
        frame,
        detect_resolution=max(64, int(detect_resolution)),
        output_type="np",
        max_depth=1,
    )
    depth = np.asarray(depth, dtype=np.uint8)
    if depth.ndim == 2:
        depth = np.repeat(depth[:, :, None], 3, axis=2)
    elif depth.ndim == 3 and depth.shape[2] == 1:
        depth = np.repeat(depth, 3, axis=2)
    if depth.ndim != 3 or depth.shape[2] < 3:
        raise ValueError(f"Depth Anything V2 returned an invalid frame shape: {depth.shape}")
    if depth.shape[:2] != (height, width):
        depth = cv2.resize(depth[:, :, :3], (width, height), interpolation=cv2.INTER_CUBIC)
    return np.ascontiguousarray(depth[:, :, :3], dtype=np.uint8)


def run_depth_anything_v2_video(
    input_path: str,
    output_path: str,
    params: Any = None,
    *,
    language: Any = None,
    progress_callback: ProgressCallback | None = None,
    cancel_callback: CancelCallback | None = None,
) -> dict[str, Any]:
    """Run relative-depth extraction directly in the Studio worker."""

    config = normalize_depth_video_params(params or {})
    input_path = os.path.abspath(os.fspath(input_path))
    output_path = os.path.abspath(os.fspath(output_path))
    if not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    av, cv2, np, torch = _load_video_dependencies()
    ffmpeg = _ffmpeg_executable()
    if ffmpeg is None:
        raise DepthAnythingV2VideoDependencyError("FFmpeg is required to encode the depth video output.")

    info = _inspect_video(input_path, av, None)
    if config["duration_limit"] > 0:
        max_source_frames = max(1, int(config["duration_limit"] * info.source_fps))
        if max_source_frames < info.frame_count:
            info = _inspect_video(input_path, av, max_source_frames)

    output_width = _even_dimension(info.width)
    output_height = _even_dimension(info.height)
    detect_resolution = min(info.width, info.height)
    detector = None
    writer = None
    writer_closed = False
    success = False
    processed_frames = 0
    audio_muxed = False

    try:
        if cancel_callback and cancel_callback():
            raise DepthAnythingV2VideoCancelled()
        if progress_callback is not None:
            progress_callback(0, localized_text(language, "Loading Depth Anything V2...", "正在加载 Depth Anything V2..."))
        detector = _load_depth_detector()
        writer = _RawVideoWriter(output_path, output_width, output_height, info.source_fps, config["crf"], ffmpeg, torch)

        frame_iter = _iter_video_frames(input_path, 1, info.frame_count, av, np, torch)
        for source_frame in frame_iter:
            if cancel_callback and cancel_callback():
                raise DepthAnythingV2VideoCancelled()
            frame = source_frame.mul(255.0).clamp(0.0, 255.0).byte().numpy()
            depth = _depth_frame(detector, frame, info.width, info.height, detect_resolution, cv2, np)
            if output_width != info.width or output_height != info.height:
                depth = np.pad(
                    depth,
                    ((0, output_height - info.height), (0, output_width - info.width), (0, 0)),
                    mode="edge",
                )
            writer.write(depth)
            processed_frames += 1
            if progress_callback is not None:
                percentage = 5.0 + 90.0 * processed_frames / max(1, info.frame_count)
                progress_callback(
                    max(0, min(95, int(round(percentage)))),
                    localized_text(
                        language,
                        f"Generating depth video {processed_frames}/{info.frame_count}...",
                        f"正在生成深度视频 {processed_frames}/{info.frame_count}...",
                    ),
                )

        writer.close()
        writer_closed = True
        if info.has_audio:
            if progress_callback is not None:
                progress_callback(
                    98,
                    localized_text(language, "Muxing source audio...", "正在复用源音频..."),
                )
            audio_muxed = _mux_source_audio(output_path, input_path, ffmpeg)
        success = True
        if progress_callback is not None:
            progress_callback(100, localized_text(language, "Depth video finished", "深度视频已完成"))
        return {
            "output_path": output_path,
            "source_fps": info.source_fps,
            "output_fps": info.source_fps,
            "source_frames": processed_frames,
            "output_frames": processed_frames,
            "source_width": info.width,
            "source_height": info.height,
            "output_width": output_width,
            "output_height": output_height,
            "audio_muxed": audio_muxed,
            "encoder": writer.encoder,
        }
    finally:
        if not writer_closed and writer is not None:
            writer.abort()
        if detector is not None:
            del detector
        if not success:
            try:
                if os.path.exists(output_path):
                    os.remove(output_path)
            except OSError:
                pass
