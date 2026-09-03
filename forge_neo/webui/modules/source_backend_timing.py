from __future__ import annotations

import logging
import os
import time
from typing import Any

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


log_source_stage_marker = log_marker
log_source_stage = log_stage
