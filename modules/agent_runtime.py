"""Read-only node telemetry without importing or starting a model worker."""

import copy
import csv
import hashlib
import io
import math
import os
import socket
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone


NODE_ID = (os.environ.get("SIMPAI_AGENT_NODE_ID") or
           "studio-" + hashlib.sha256(socket.gethostname().encode()).hexdigest()[:16])[:160]
INSTANCE_ID = uuid.uuid4().hex
RESOURCE_CACHE_SECONDS = 2.0
_RESOURCE_LOCK = threading.Lock()
_RESOURCE_CACHE = None
_RESOURCE_CACHE_TS = 0.0
_RESOURCE_SAMPLE_TS = 0.0


def _now():
    return datetime.now(timezone.utc).isoformat()


def queue_snapshot():
    worker = sys.modules.get("modules.async_worker")
    snapshot = {
        "node_id": NODE_ID, "instance_id": INSTANCE_ID, "sampled_at": _now(),
        "available": False, "reason": "worker_not_initialized",
        "worker": {"alive": False, "ready": False}, "items": [],
        "counts": {"queued": None, "running": None, "preparing": 0, "total": None},
        "gpu_task_busy": None,
    }
    if worker is not None and callable(getattr(worker, "get_queue_snapshot", None)):
        snapshot.update(worker.get_queue_snapshot())
        snapshot["available"] = True
        snapshot.pop("reason", None)

    runner = sys.modules.get("modules.canvas_workbench_runner")
    records = []
    if runner is not None:
        with runner.CANVAS_RUNS_LOCK:
            records = [
                {key: record.get(key) for key in ("run_id", "task_id", "owner_user_did", "project_id", "state")}
                for record in runner.CANVAS_RUNS.values()
            ]
    runs = {record["task_id"]: record for record in records if record.get("task_id")}
    for item in snapshot["items"]:
        record = runs.get(item.get("task_id"))
        item["source"] = "ui"
        if record:
            item["source"] = "agent_api" if record.get("project_id") == "agent_api" else "canvas"
            item["run_id"] = record.get("run_id")
    preparing = [record for record in records if not record.get("task_id") and record.get("state") == "preparing"]
    snapshot["items"].extend({
        "run_id": record["run_id"], "owner_user_did": record["owner_user_did"], "state": "preparing",
        "queue_position": None, "source": "agent_api" if record.get("project_id") == "agent_api" else "canvas",
    } for record in preparing)
    snapshot["counts"]["preparing"] = len(preparing)
    if snapshot["counts"]["total"] is not None:
        snapshot["counts"]["total"] += len(preparing)
    return snapshot


def _numeric(value, scale=1, integer=False):
    try:
        number = float(value) * scale
        if not math.isfinite(number) or number < 0:
            return None
        return int(number) if integer else number
    except (ValueError, TypeError):
        return None


def _gpu_snapshot():
    fields = "index,uuid,name,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory"
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=" + fields, "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=3, check=False, **options,
        )
    except FileNotFoundError:
        return {"available": False, "provider": "nvidia-smi", "devices": [], "reason": "provider_not_installed"}
    except subprocess.TimeoutExpired:
        return {"available": False, "provider": "nvidia-smi", "devices": [], "reason": "query_timeout"}
    except OSError:
        return {"available": False, "provider": "nvidia-smi", "devices": [], "reason": "query_failed"}
    if result.returncode:
        return {"available": False, "provider": "nvidia-smi", "devices": [], "reason": "query_failed"}
    devices = []
    for row in csv.reader(io.StringIO(result.stdout), skipinitialspace=True):
        if len(row) != 8:
            return {"available": False, "provider": "nvidia-smi", "devices": [], "reason": "invalid_provider_response"}
        index, gpu_id, name, total, used, free, gpu_use, memory_use = [value.strip() for value in row]
        devices.append({
            "index": _numeric(index, integer=True), "uuid": gpu_id, "name": name,
            "memory_total_bytes": _numeric(total, 1024**2, integer=True),
            "memory_used_bytes": _numeric(used, 1024**2, integer=True),
            "memory_free_bytes": _numeric(free, 1024**2, integer=True),
            "utilization_percent": _numeric(gpu_use), "memory_utilization_percent": _numeric(memory_use),
        })
    return {"available": True, "provider": "nvidia-smi", "devices": devices}


def _host_snapshot():
    try:
        import psutil
        memory = psutil.virtual_memory()
        return {"available": True, "cpu_count": psutil.cpu_count(),
                "cpu_utilization_percent": psutil.cpu_percent(interval=0.1),
                "memory_total_bytes": memory.total, "memory_available_bytes": memory.available,
                "memory_used_bytes": memory.used}
    except (ImportError, OSError):
        return {"available": False, "reason": "host_metrics_unavailable"}


def resource_snapshot():
    global _RESOURCE_CACHE, _RESOURCE_CACHE_TS, _RESOURCE_SAMPLE_TS
    with _RESOURCE_LOCK:
        now = time.monotonic()
        if _RESOURCE_CACHE is None or now - _RESOURCE_CACHE_TS >= RESOURCE_CACHE_SECONDS:
            _RESOURCE_SAMPLE_TS = now
            _RESOURCE_CACHE = {
                "sampled_at": _now(), "scope": "studio_host",
                "host": _host_snapshot(), "gpu": _gpu_snapshot(),
                "refresh_interval_seconds": RESOURCE_CACHE_SECONDS,
            }
            _RESOURCE_CACHE_TS = time.monotonic()
        return {**copy.deepcopy(_RESOURCE_CACHE), "age_seconds": max(0.0, time.monotonic() - _RESOURCE_SAMPLE_TS)}
