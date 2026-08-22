"""Model-free scene-cut detection shared by the RIFE processing paths."""

from __future__ import annotations

from collections import deque
from statistics import median
from typing import Any

import torch
from torch.nn import functional


class SceneChangeDetector:
    """Detect hard cuts from low-resolution frame differences without a model."""

    def __init__(
        self,
        threshold: float = 0.15,
        *,
        sample_width: int = 96,
        sample_height: int = 54,
        history_size: int = 8,
        adaptive_ratio: float = 2.0,
    ):
        self.threshold = max(0.05, min(0.95, float(threshold)))
        self.sample_width = max(16, int(sample_width))
        self.sample_height = max(16, int(sample_height))
        self.history = deque(maxlen=max(3, int(history_size)))
        self.adaptive_ratio = max(1.0, float(adaptive_ratio))

    @staticmethod
    def _as_float_frame(frame: Any) -> torch.Tensor:
        tensor = frame.detach() if hasattr(frame, "detach") else torch.as_tensor(frame)
        tensor = tensor.float()
        if tensor.ndim == 4 and tensor.shape[0] == 1:
            tensor = tensor[0]
        if tensor.ndim != 3 or tensor.shape[-1] != 3:
            raise ValueError(f"Scene detection expects an image [H, W, 3], got {tuple(tensor.shape)}")
        if tensor.numel() and float(tensor.detach().amax().cpu()) > 1.0:
            tensor = tensor / 255.0
        return tensor.clamp(0.0, 1.0)

    def score(self, frame0: Any, frame1: Any) -> float:
        """Return a normalized cut score in the range [0, 1]."""

        with torch.inference_mode():
            pair = torch.stack((self._as_float_frame(frame0), self._as_float_frame(frame1)), dim=0)
            small = functional.interpolate(
                pair.permute(0, 3, 1, 2),
                size=(self.sample_height, self.sample_width),
                mode="area",
            )
            color_difference = (small[0] - small[1]).abs().mean()
            luma = (
                small[:, 0] * 0.299
                + small[:, 1] * 0.587
                + small[:, 2] * 0.114
            )
            histogram0 = torch.histc(luma[0], bins=32, min=0.0, max=1.0)
            histogram1 = torch.histc(luma[1], bins=32, min=0.0, max=1.0)
            histogram0 = histogram0 / histogram0.sum().clamp_min(1.0)
            histogram1 = histogram1 / histogram1.sum().clamp_min(1.0)
            histogram_difference = 0.5 * (histogram0 - histogram1).abs().sum()
            score = 0.75 * color_difference + 0.25 * histogram_difference
            return max(0.0, min(1.0, float(score.cpu())))

    def is_cut(self, frame0: Any, frame1: Any) -> bool:
        score = self.score(frame0, frame1)
        baseline = median(self.history) if self.history else 0.0
        self.history.append(score)
        adaptive_threshold = max(self.threshold, baseline * self.adaptive_ratio)
        return score >= adaptive_threshold


def choose_scene_boundary_frame(frame0: Any, frame1: Any, factor: float) -> Any:
    """Keep a real source frame when interpolation would cross a scene cut."""

    del frame1, factor
    return frame0
