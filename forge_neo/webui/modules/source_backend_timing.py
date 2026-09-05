from __future__ import annotations

import logging
import os
import time
from typing import Any

import torch

from backend.logging import setup_logger


logger = logging.getLogger("source_backend")
setup_logger(logger)


def stage_logs_enabled() -> bool:
    sampling_logs = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_SAMPLING_STAGE_LOGS") or "").strip().casefold()
    loader_logs = str(os.environ.get("FORGE_NEO_LOADER_STAGE_LOGS") or "").strip().casefold()
    enabled_values = {"1", "true", "yes", "on"}
    return sampling_logs in enabled_values or loader_logs in enabled_values


def _details(extra: dict[str, Any]) -> str:
    return " ".join(f"{key}={value}" for key, value in extra.items() if value is not None)


def log_marker(name: str, **extra) -> None:
    if not stage_logs_enabled():
        return

    details = _details(extra)
    suffix = f" {details}" if details else ""
    logger.info(f"[Forge source] stage={name} started{suffix}")


def log_stage(name: str, started: float, **extra) -> None:
    if not stage_logs_enabled():
        return

    elapsed = max(0.0, time.perf_counter() - started)
    details = _details(extra)
    suffix = f" {details}" if details else ""
    logger.info(f"[Forge source] stage={name} finished elapsed={elapsed:.3f}s{suffix}")


def _trace_step_limit() -> int:
    try:
        return max(0, int(os.environ.get("FORGE_NEO_SOURCE_BACKEND_DENOISER_TRACE_STEPS", "2")))
    except (TypeError, ValueError):
        return 2


def should_log_denoiser_step(step: int) -> bool:
    if not stage_logs_enabled():
        return False
    try:
        step = int(step)
    except (TypeError, ValueError):
        return False
    return 0 <= step < _trace_step_limit()


def tensor_stats_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_TENSOR_STATS", "0") or "").strip().casefold()
    return value in {"1", "true", "yes", "on"}


def log_tensor_stats(name: str, tensor: torch.Tensor, *, enabled: bool | None = None, channel_dim: int | None = None, **extra) -> None:
    """Log tensor statistics only with environment opt-in and no caller opt-out."""
    if not tensor_stats_enabled() or enabled is False or tensor is None:
        return

    try:
        value = tensor.detach()
        if not isinstance(value, torch.Tensor):
            return

        total = int(value.numel())
        finite = torch.isfinite(value) if (value.is_floating_point() or value.is_complex()) else torch.ones_like(value, dtype=torch.bool)
        finite_count = int(finite.sum().item())
        nan_count = int(torch.isnan(value).sum().item()) if (value.is_floating_point() or value.is_complex()) else 0
        inf_count = int(torch.isinf(value).sum().item()) if (value.is_floating_point() or value.is_complex()) else 0

        min_value = None
        max_value = None
        mean_value = None
        std_value = None
        channel_min = None
        channel_max = None
        channel_mean = None
        channel_std = None
        if finite_count > 0 and not value.is_complex():
            finite_values = value if finite_count == total else value.masked_select(finite)
            float_values = finite_values.float()
            min_value = float(finite_values.min().item())
            max_value = float(finite_values.max().item())
            mean_value = float(float_values.mean().item())
            std_value = float(float_values.std(unbiased=False).item()) if finite_values.numel() > 1 else 0.0

            if channel_dim is not None and value.ndim > 0:
                dim = int(channel_dim) % value.ndim
                channel_values = value.movedim(dim, 0).reshape(value.shape[dim], -1)
                channel_finite = finite.movedim(dim, 0).reshape(value.shape[dim], -1)
                channel_min_values = []
                channel_max_values = []
                channel_mean_values = []
                channel_std_values = []
                for values, values_finite in zip(channel_values, channel_finite):
                    finite_channel_values = values if bool(values_finite.all().item()) else values.masked_select(values_finite)
                    if finite_channel_values.numel() == 0:
                        channel_min_values.append(None)
                        channel_max_values.append(None)
                        channel_mean_values.append(None)
                        channel_std_values.append(None)
                        continue
                    finite_channel_float_values = finite_channel_values.float()
                    channel_min_values.append(float(finite_channel_values.min().item()))
                    channel_max_values.append(float(finite_channel_values.max().item()))
                    channel_mean_values.append(float(finite_channel_float_values.mean().item()))
                    channel_std_values.append(
                        float(finite_channel_float_values.std(unbiased=False).item())
                        if finite_channel_values.numel() > 1
                        else 0.0
                    )
                channel_min = tuple(channel_min_values)
                channel_max = tuple(channel_max_values)
                channel_mean = tuple(channel_mean_values)
                channel_std = tuple(channel_std_values)

        details = _details(
            {
                "dtype": value.dtype,
                "device": value.device,
                "shape": tuple(value.shape),
                "finite": f"{finite_count}/{total}",
                "nan": nan_count,
                "inf": inf_count,
                "min": min_value,
                "max": max_value,
                "mean": mean_value,
                "std": std_value,
                "channel_min": channel_min,
                "channel_max": channel_max,
                "channel_mean": channel_mean,
                "channel_std": channel_std,
                **extra,
            }
        )
        suffix = f" {details}" if details else ""
        logger.info(f"[Forge source] tensor={name}{suffix}")
    except Exception as error:
        logger.warning(f"[Forge source] tensor={name} stats_failed={error}")


log_source_stage_marker = log_marker
log_source_stage = log_stage
