"""Generate neutral 3D camera-motion references for Uni3C.

The rendered scene is intentionally synthetic. It contains only geometric
markers, a floor grid, and depth cues, so the reference carries camera
structure without copying content from a user's input image.
"""

from __future__ import annotations

import math
import json
import os
import tempfile
import uuid
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np


MOTION_TYPES = (
    ("Orbit", "orbit"),
    ("Pan", "pan"),
    ("Dolly", "dolly"),
    ("Truck", "truck"),
    ("Crane", "crane"),
    ("Roll", "roll"),
    ("Orbit + Dolly", "orbit_dolly"),
)

DIRECTIONS = (
    ("Forward", "forward"),
    ("Reverse", "reverse"),
)

_MOTION_REFERENCE_DIR = "camera_motion_references"
_CN_LANGUAGE_PATH = Path(__file__).resolve().parents[1] / "language" / "cn.json"


@lru_cache(maxsize=1)
def _load_cn_translation():
    try:
        with _CN_LANGUAGE_PATH.open(encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def localized_text(state, english_text):
    """Return an English source string or its cn.json translation."""
    text = str(english_text or "")
    lang = str((state or {}).get("__lang") or "en").lower() if isinstance(state, dict) else "en"
    if not (lang.startswith("cn") or lang.startswith("zh")):
        return text
    return str(_load_cn_translation().get(text, text))


def _number(value, default, minimum=None, maximum=None):
    try:
        result = float(value)
    except (TypeError, ValueError):
        result = float(default)
    if minimum is not None:
        result = max(float(minimum), result)
    if maximum is not None:
        result = min(float(maximum), result)
    return result


def _parse_frame_size(value=None, width=None, height=None):
    def _positive_int(raw):
        try:
            result = int(float(raw))
        except (TypeError, ValueError):
            return None
        return result if result > 0 else None

    parsed_width = _positive_int(width)
    parsed_height = _positive_int(height)
    if parsed_width is None or parsed_height is None:
        text = str(value or "640x640").lower().replace(" ", "")
        parsed_width = parsed_height = None
        if "|" in text and ":" in text:
            width_text, ratio_text = text.split("|", 1)
            try:
                ratio_width, ratio_height = ratio_text.split(":", 1)
                parsed_width = _positive_int(width_text)
                ratio_width = float(ratio_width)
                ratio_height = float(ratio_height)
                if parsed_width and ratio_width > 0 and ratio_height > 0:
                    parsed_height = int(round(parsed_width * ratio_height / ratio_width))
            except (TypeError, ValueError):
                parsed_width = parsed_height = None
        if parsed_width is None or parsed_height is None:
            for separator in ("x", "*", "×"):
                if separator not in text:
                    continue
                width_text, height_text = text.split(separator, 1)
                parsed_width = _positive_int(width_text)
                parsed_height = _positive_int(height_text)
                break
        if parsed_width is None or parsed_height is None:
            parsed_width, parsed_height = 640, 640

    parsed_width = max(64, min(4096, parsed_width))
    parsed_height = max(64, min(4096, parsed_height))
    parsed_width -= parsed_width % 2
    parsed_height -= parsed_height % 2
    return parsed_width, parsed_height


def normalize_camera_motion_settings(
    motion_type="orbit",
    direction="forward",
    speed=1.0,
    amplitude=1.0,
    duration=5.0,
    fps=16,
    frame_size=None,
    width=None,
    height=None,
):
    """Return the effective settings used by the renderer."""
    width, height = _parse_frame_size(frame_size, width, height)
    return {
        "motion_type": str(motion_type or "orbit").lower(),
        "direction": str(direction or "forward").lower(),
        "speed": _number(speed, 1.0, 0.1, 2.0),
        "amplitude": _number(amplitude, 1.0, 0.0, 2.0),
        "duration": _number(duration, 5.0, 0.1, 60.0),
        "fps": _number(fps, 16.0, 4.0, 120.0),
        "width": width,
        "height": height,
    }


def _output_directory(output_dir=None):
    if output_dir:
        root = str(output_dir)
    else:
        try:
            import modules.config as config

            root = str(getattr(config, "temp_path", "") or "")
        except Exception:
            root = ""
    if not root:
        root = os.path.join(tempfile.gettempdir(), "simpai")
    target = os.path.abspath(os.path.join(root, _MOTION_REFERENCE_DIR))
    os.makedirs(target, exist_ok=True)
    return target


def camera_motion_frame_count(settings):
    return max(2, int(round(float(settings["duration"]) * float(settings["fps"]))))


def inspect_camera_motion_video(path, expected_frames=None):
    capture = cv2.VideoCapture(str(path))
    try:
        ok, frame = capture.read() if capture.isOpened() else (False, None)
        if not ok or frame is None or frame.size == 0:
            raise RuntimeError("The generated camera-motion video has no readable frames.")
        fps = float(capture.get(cv2.CAP_PROP_FPS))
        count = float(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        if not math.isfinite(fps) or fps <= 0 or not math.isfinite(count) or count < 1:
            raise RuntimeError("The generated camera-motion video has invalid timing metadata.")
        frame_count = int(count)
        if expected_frames is not None and frame_count != expected_frames:
            raise RuntimeError("The generated camera-motion video is incomplete.")
        height, width = frame.shape[:2]
        return {"width": width, "height": height, "fps": fps,
                "frame_count": frame_count, "duration": frame_count / fps}
    finally:
        capture.release()


def _unit(vector):
    vector = np.asarray(vector, dtype=np.float32)
    length = float(np.linalg.norm(vector))
    if length <= 1e-7:
        return np.array([0.0, 0.0, 1.0], dtype=np.float32)
    return vector / length


def _rotate_y(vector, angle):
    cosine = math.cos(angle)
    sine = math.sin(angle)
    x, y, z = np.asarray(vector, dtype=np.float32)
    return np.array(
        [cosine * x + sine * z, y, -sine * x + cosine * z],
        dtype=np.float32,
    )


def _camera_pose(motion_type, direction, speed, amplitude, progress):
    """Return camera position, target, and roll for a normalized timeline."""
    sign = -1.0 if str(direction or "").lower() in {"reverse", "backward", "right"} else 1.0
    speed = _number(speed, 1.0, 0.1, 2.0)
    amplitude = _number(amplitude, 1.0, 0.0, 2.0)
    progress = _number(progress, 0.0, 0.0, 1.0)
    # Smooth the endpoints so the reference starts and ends like a camera rig.
    travel = (0.5 - 0.5 * math.cos(math.pi * progress) - 0.5) * 2.0
    travel *= sign * speed * amplitude

    base_position = np.array([0.0, 1.45, 8.0], dtype=np.float32)
    target = np.array([0.0, 0.0, 0.0], dtype=np.float32)
    roll = 0.0
    motion = str(motion_type or "orbit").lower()

    orbit_angle = travel * math.radians(55.0)
    if motion in {"orbit", "orbit_dolly"}:
        orbit_position = _rotate_y(base_position, orbit_angle)
        position = orbit_position
    else:
        position = base_position.copy()

    if motion == "pan":
        view_vector = target - base_position
        target = base_position + _rotate_y(view_vector, orbit_angle)
    elif motion == "dolly":
        position = base_position.copy()
        position[2] -= travel * 2.8
    elif motion == "truck":
        position = base_position.copy()
        position[0] += travel * 2.6
    elif motion == "crane":
        position = base_position.copy()
        position[1] += travel * 2.2
    elif motion == "roll":
        roll = travel * math.radians(38.0)
    elif motion == "orbit_dolly":
        position[2] -= travel * 1.5

    return position, target, roll


def _camera_basis(position, target, roll):
    forward = _unit(np.asarray(target, dtype=np.float32) - np.asarray(position, dtype=np.float32))
    world_up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    right = np.cross(forward, world_up)
    if float(np.linalg.norm(right)) <= 1e-7:
        right = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    right = _unit(right)
    up = _unit(np.cross(right, forward))
    if abs(float(roll)) > 1e-7:
        cosine = math.cos(roll)
        sine = math.sin(roll)
        rolled_right = right * cosine + up * sine
        rolled_up = -right * sine + up * cosine
        right, up = _unit(rolled_right), _unit(rolled_up)
    return forward, right, up


def _project(points, position, target, roll, width, height):
    points = np.asarray(points, dtype=np.float32)
    forward, right, up = _camera_basis(position, target, roll)
    relative = points - np.asarray(position, dtype=np.float32)
    depth = relative @ forward
    visible = depth > 0.08
    safe_depth = np.maximum(depth, 0.08)
    focal = min(width, height) * 0.92
    projected_x = width * 0.5 + (relative @ right) * focal / safe_depth
    projected_y = height * 0.53 - (relative @ up) * focal / safe_depth
    projected = np.stack([projected_x, projected_y], axis=1)
    return projected, visible


def _cube_segments(center, size):
    center = np.asarray(center, dtype=np.float32)
    half = float(size) * 0.5
    vertices = np.array(
        [
            [x, y, z]
            for x in (-half, half)
            for y in (-half, half)
            for z in (-half, half)
        ],
        dtype=np.float32,
    ) + center
    edges = (
        (0, 1), (0, 2), (0, 4),
        (1, 3), (1, 5),
        (2, 3), (2, 6),
        (3, 7),
        (4, 5), (4, 6),
        (5, 7),
        (6, 7),
    )
    return [(vertices[[start, end]], (115, 190, 255)) for start, end in edges]


def _scene_segments():
    segments = []
    grid_color = (62, 70, 88)
    for coordinate in np.arange(-6.0, 6.01, 0.75):
        segments.append((np.array([[coordinate, -1.2, -6.0], [coordinate, -1.2, 6.0]], dtype=np.float32), grid_color))
        segments.append((np.array([[-6.0, -1.2, coordinate], [6.0, -1.2, coordinate]], dtype=np.float32), grid_color))

    # Coordinate axes keep the reference readable while remaining content-neutral.
    segments.extend(
        [
            (np.array([[0, -1.2, 0], [3.5, -1.2, 0]], dtype=np.float32), (65, 90, 235)),
            (np.array([[0, -1.2, 0], [0, 2.8, 0]], dtype=np.float32), (75, 210, 120)),
            (np.array([[0, -1.2, 0], [0, -1.2, 3.5]], dtype=np.float32), (235, 150, 70)),
        ]
    )

    for center, size in (
        ((0.0, -0.05, 0.0), 1.3),
        ((-2.4, 0.0, -1.8), 1.0),
        ((2.8, 0.15, -3.2), 1.6),
        ((-3.8, 0.35, 2.1), 0.75),
    ):
        segments.extend(_cube_segments(center, size))

    for radius, y, color in ((1.8, 0.0, (185, 105, 220)), (2.8, 0.55, (220, 175, 85))):
        points = []
        for index in range(49):
            angle = 2.0 * math.pi * index / 48.0
            points.append([radius * math.cos(angle), y, radius * math.sin(angle)])
        for start, end in zip(points, points[1:]):
            segments.append((np.array([start, end], dtype=np.float32), color))

    # A tall depth marker makes forward and backward motion visible at a glance.
    segments.append((np.array([[-4.5, -1.2, -4.5], [-4.5, 2.8, -4.5]], dtype=np.float32), (80, 180, 220)))
    segments.append((np.array([[4.5, -1.2, 4.5], [4.5, 3.8, 4.5]], dtype=np.float32), (220, 120, 90)))
    return segments


def _draw_segment(frame, segment, color, position, target, roll, width, height):
    projected, visible = _project(segment, position, target, roll, width, height)
    if not bool(np.all(visible)):
        return
    start = tuple(np.round(projected[0]).astype(int))
    end = tuple(np.round(projected[1]).astype(int))
    margin = max(width, height) * 2
    if max(start[0], end[0]) < -margin or min(start[0], end[0]) > width + margin:
        return
    if max(start[1], end[1]) < -margin or min(start[1], end[1]) > height + margin:
        return
    cv2.line(frame, start, end, color, 1, cv2.LINE_AA)


def _draw_target_marker(frame, position, target, roll, width, height):
    projected, visible = _project(np.asarray([target], dtype=np.float32), position, target, roll, width, height)
    if not bool(visible[0]):
        return
    x, y = np.round(projected[0]).astype(int)
    length = max(6, int(min(width, height) * 0.025))
    color = (220, 235, 245)
    cv2.line(frame, (x - length, y), (x + length, y), color, 1, cv2.LINE_AA)
    cv2.line(frame, (x, y - length), (x, y + length), color, 1, cv2.LINE_AA)
    cv2.circle(frame, (x, y), max(2, length // 4), (70, 200, 245), 1, cv2.LINE_AA)


def generate_camera_motion_video(
    motion_type="orbit",
    direction="forward",
    speed=1.0,
    amplitude=1.0,
    duration=5.0,
    fps=16,
    frame_size=None,
    width=None,
    height=None,
    output_dir=None,
    metadata=None,
):
    """Return a local MP4 path, optionally populating validated media metadata."""
    settings = normalize_camera_motion_settings(
        motion_type=motion_type,
        direction=direction,
        speed=speed,
        amplitude=amplitude,
        duration=duration,
        fps=fps,
        frame_size=frame_size,
        width=width,
        height=height,
    )
    motion_type = settings["motion_type"]
    direction = settings["direction"]
    speed = settings["speed"]
    amplitude = settings["amplitude"]
    fps = settings["fps"]
    width = settings["width"]
    height = settings["height"]
    frame_count = camera_motion_frame_count(settings)
    output_path = Path(_output_directory(output_dir)) / f"camera_motion_{uuid.uuid4().hex}.mp4"
    writer = None
    try:
        for codec in ("mp4v", "avc1"):
            candidate = cv2.VideoWriter(
                str(output_path),
                cv2.VideoWriter_fourcc(*codec),
                float(fps),
                (width, height),
            )
            if candidate.isOpened():
                writer = candidate
                break
            candidate.release()
        if writer is None:
            raise RuntimeError("OpenCV could not open an MP4 video writer.")

        segments = _scene_segments()
        for frame_index in range(frame_count):
            progress = frame_index / float(frame_count - 1)
            position, target, roll = _camera_pose(
                motion_type,
                direction,
                speed,
                amplitude,
                progress,
            )
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[:, :] = (13, 17, 25)
            for segment, color in segments:
                _draw_segment(frame, segment, color, position, target, roll, width, height)
            _draw_target_marker(frame, position, target, roll, width, height)
            writer.write(frame)
        writer.release()
        writer = None
        if not output_path.is_file() or output_path.stat().st_size <= 0:
            raise RuntimeError("The generated camera-motion video is empty.")
        media = inspect_camera_motion_video(output_path, expected_frames=frame_count)
        if isinstance(metadata, dict):
            metadata.update(media)
        return str(output_path)
    except Exception:
        if writer is not None:
            writer.release()
        try:
            output_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise
