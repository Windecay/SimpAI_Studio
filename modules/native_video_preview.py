"""Source-frame previews for Studio-native video tasks."""

from __future__ import annotations

import logging
import math
import os
import time
from collections.abc import Callable
from typing import Any


logger = logging.getLogger(__name__)

DEFAULT_PREVIEW_MAX_SIDE = 256
DEFAULT_PREVIEW_INTERVAL = 0.35
DEFAULT_BLUR_SIGMA = 1.8

ProgressSink = Callable[[int, str, Any], None]


def _load_cv2() -> Any:
    import cv2

    return cv2


def _load_image_module() -> Any:
    from PIL import Image

    return Image


def _safe_positive_int(value: Any) -> int:
    try:
        result = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return 0
    return result if result > 0 else 0


def _clamp_percentage(value: Any) -> float:
    try:
        percentage = float(value)
    except (TypeError, ValueError, OverflowError):
        percentage = 0.0
    if not math.isfinite(percentage):
        percentage = 0.0
    return max(0.0, min(100.0, percentage))


def prepare_source_frame_preview(
    frame_bgr: Any,
    *,
    cv2_module: Any = None,
    image_module: Any = None,
    max_side: int = DEFAULT_PREVIEW_MAX_SIDE,
    blur_sigma: float = DEFAULT_BLUR_SIGMA,
) -> Any:
    """Convert one OpenCV frame into a small, deliberately soft RGB preview."""

    if frame_bgr is None:
        return None
    cv2_module = cv2_module or _load_cv2()
    image_module = image_module or _load_image_module()
    frame_shape = getattr(frame_bgr, "shape", ())
    if len(frame_shape) < 2:
        return None

    if len(frame_shape) == 2:
        frame_rgb = cv2_module.cvtColor(frame_bgr, cv2_module.COLOR_GRAY2RGB)
    else:
        frame_rgb = cv2_module.cvtColor(frame_bgr, cv2_module.COLOR_BGR2RGB)

    height, width = int(frame_rgb.shape[0]), int(frame_rgb.shape[1])
    if height <= 0 or width <= 0:
        return None
    target_side = max(64, int(max_side))
    scale = min(1.0, target_side / max(height, width))
    if scale < 1.0:
        target_width = max(1, int(round(width * scale)))
        target_height = max(1, int(round(height * scale)))
        frame_rgb = cv2_module.resize(
            frame_rgb,
            (target_width, target_height),
            interpolation=cv2_module.INTER_AREA,
        )

    sigma = max(0.1, float(blur_sigma))
    frame_rgb = cv2_module.GaussianBlur(frame_rgb, (0, 0), sigmaX=sigma, sigmaY=sigma)
    return image_module.fromarray(frame_rgb).convert("RGB")


class NativeVideoPreview:
    """Read sparse source frames without affecting the native video pipeline."""

    def __init__(
        self,
        source_path: str,
        *,
        enabled: bool = True,
        max_side: int = DEFAULT_PREVIEW_MAX_SIDE,
        min_interval: float = DEFAULT_PREVIEW_INTERVAL,
    ) -> None:
        self.source_path = os.path.abspath(os.fspath(source_path))
        self.enabled = bool(enabled)
        self.max_side = max(64, int(max_side))
        self.min_interval = max(0.0, float(min_interval))
        self._capture = None
        self._cv2 = None
        self._image_module = None
        self._frame_count = 0
        self._last_frame_index = None
        self._last_image = None
        self._last_render_time = 0.0
        self._disabled = not self.enabled
        self._warning_emitted = False

    def _warn_once(self, message: str, *args: Any) -> None:
        if self._warning_emitted:
            return
        self._warning_emitted = True
        logger.debug(message, *args)

    def _disable(self, reason: str, *args: Any) -> None:
        self._disabled = True
        self._warn_once("Native source-frame preview disabled: " + reason, *args)

    def _ensure_capture(self) -> bool:
        if self._disabled:
            return False
        if self._capture is not None:
            return True
        if not os.path.isfile(self.source_path):
            self._disable("source video is unavailable: %s", self.source_path)
            return False
        try:
            self._cv2 = _load_cv2()
            self._image_module = _load_image_module()
            capture = self._cv2.VideoCapture(self.source_path)
            if not capture.isOpened():
                capture.release()
                self._disable("OpenCV could not open %s", self.source_path)
                return False
            self._capture = capture
            self._frame_count = _safe_positive_int(capture.get(self._cv2.CAP_PROP_FRAME_COUNT)) or 1
            return True
        except Exception as exc:
            self._disable("video reader initialization failed: %s", exc)
            self.close()
            return False

    def _frame_index_for_progress(self, percentage: Any) -> int:
        return max(
            0,
            min(
                self._frame_count - 1,
                int(round((self._frame_count - 1) * _clamp_percentage(percentage) / 100.0)),
            ),
        )

    def render(self, percentage: Any) -> Any:
        """Return a cached or newly sampled source-frame preview."""

        if not self._ensure_capture():
            return None
        frame_index = self._frame_index_for_progress(percentage)
        if frame_index == self._last_frame_index and self._last_image is not None:
            return self._last_image

        now = time.monotonic()
        is_final = _clamp_percentage(percentage) >= 100.0
        if self._last_image is not None and not is_final and now - self._last_render_time < self.min_interval:
            return self._last_image

        try:
            self._capture.set(self._cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, frame = self._capture.read()
            if not ok or frame is None:
                self._warn_once("Native source-frame preview could not read frame %s from %s", frame_index, self.source_path)
                return self._last_image
            image = prepare_source_frame_preview(
                frame,
                cv2_module=self._cv2,
                image_module=self._image_module,
                max_side=self.max_side,
            )
            if image is None:
                return self._last_image
            self._last_frame_index = frame_index
            self._last_image = image
            self._last_render_time = now
            return image
        except Exception as exc:
            self._warn_once("Native source-frame preview failed for %s: %s", self.source_path, exc)
            return self._last_image

    def close(self) -> None:
        capture = self._capture
        self._capture = None
        if capture is not None:
            try:
                capture.release()
            except Exception:
                pass


def create_native_video_progress_callback(
    source_path: str,
    *,
    language: Any,
    progress_sink: ProgressSink,
    enabled: bool = True,
    max_side: int = DEFAULT_PREVIEW_MAX_SIDE,
    min_interval: float = DEFAULT_PREVIEW_INTERVAL,
    ) -> tuple[Callable[[int, str], None], NativeVideoPreview]:
    """Create a native progress callback and its reader lifecycle object."""

    preview = NativeVideoPreview(
        source_path,
        enabled=enabled,
        max_side=max_side,
        min_interval=min_interval,
    )

    def report_progress(percentage: int, title: str) -> None:
        image = preview.render(percentage)
        progress_sink(percentage, title, image)

    return report_progress, preview
