"""Generation provenance shared by output metadata and the media index."""

import json
import logging
import math
import os
import time


logger = logging.getLogger(__name__)
TIMING_FIELDS = ("generation_duration_ms", "generation_batch_duration_ms", "generation_task_duration_ms", "generation_batch_size")


def _object(value):
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except (ValueError, TypeError):
            pass
    return {}


def generation_details(metadata):
    """Read explicit provenance only; never infer timing from file timestamps."""
    data = _object(metadata)
    sources = [data, _object(data.get("parameters")), _object(data.get("raw"))]
    preset = ""
    for source in sources:
        for key in ("simpleai_regen_manifest", "SimpleAI Regen Manifest"):
            manifest = _object(source.get(key))
            name = manifest.get("preset_name")
            if isinstance(name, str) and name.strip():
                preset = name.strip()[:200]
                break
        if preset:
            break
        for key in ("preset_id", "preset_name", "preset", "Preset", "Preset Name"):
            name = source.get(key)
            if isinstance(name, str) and name.strip():
                preset = name.strip()[:200]
                break
        if preset:
            break
    result = {"preset_id": preset, "generation_task_id": "", **dict.fromkeys(TIMING_FIELDS)}
    for source in sources:
        task_id = source.get("generation_task_id")
        if not result["generation_task_id"] and isinstance(task_id, str):
            result["generation_task_id"] = task_id.strip()[:200]
        for field in TIMING_FIELDS:
            duration = source.get(field)
            if duration is None or isinstance(duration, bool):
                continue
            try:
                duration = float(duration)
                if field == "generation_batch_size" and (duration < 1 or not duration.is_integer()):
                    continue
                if math.isfinite(duration) and 0 <= duration < 2**63 and result[field] is None:
                    result[field] = int(duration)
            except (ValueError, TypeError, OverflowError):
                pass
    return result


def start_generation_task(task):
    task.media_generation_started = time.perf_counter()
    task.media_generation_outputs = []
    task.media_generation_timings = {}


def track_generation_output(task, path):
    outputs = getattr(task, "media_generation_outputs", None)
    if isinstance(outputs, list) and isinstance(path, (str, os.PathLike)):
        outputs.append(os.fspath(path))


def _queue_output_timing(task, path, timing):
    record = {
        "preset_id": str(getattr(task, "task_name", "") or ""),
        "generation_task_id": str(getattr(task, "task_id", "") or ""),
        **timing,
    }
    try:
        from modules.media_library import queue_media_file_index

        queue_media_file_index(path, user_did=task.user_did, generation=record)
    except Exception:
        logger.exception("Unable to record media generation timing")


def record_generation_batch(task, paths, duration_ms, *, output_count=None):
    """Record one completed backend operation without averaging a multi-output batch."""
    timings = getattr(task, "media_generation_timings", None)
    if not isinstance(timings, dict):
        return
    paths = list(dict.fromkeys(os.fspath(path) for path in paths if isinstance(path, (str, os.PathLike))))
    if not paths:
        return
    count = max(len(paths), int(output_count or len(paths)))
    timing = {
        "generation_duration_ms": duration_ms if count == 1 else None,
        "generation_batch_duration_ms": duration_ms if count > 1 else None,
        "generation_batch_size": count,
    }
    for path in paths:
        timings[path] = timing.copy()
        _queue_output_timing(task, path, timing)


def finish_generation_task(task, status="Finished"):
    started = getattr(task, "media_generation_started", None)
    if started is None:
        return
    task.media_generation_started = None
    duration = max(0, round((time.perf_counter() - started) * 1000))
    if (status != "Finished" or getattr(task, "backend_error", None)
            or getattr(task, "cloud_error", None) or getattr(task, "user_cancel_action", None)
            or getattr(task, "simpleai_workflow_error", None)
            or getattr(task, "last_stop", None) in ("stop", "skip")):
        return
    paths = []
    for key in ("media_generation_outputs", "results", "img_paths"):
        values = getattr(task, key, None)
        if isinstance(values, (list, tuple)):
            paths.extend(os.fspath(path) for path in values if isinstance(path, (str, os.PathLike)))
    if not paths:
        return
    timings = getattr(task, "media_generation_timings", {})
    for path in dict.fromkeys(paths):
        _queue_output_timing(task, path, {
            **timings.get(path, {}), "generation_task_duration_ms": duration,
        })
