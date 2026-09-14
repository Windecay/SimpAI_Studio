import json
import math
import logging
import subprocess
import sys
import threading
from pathlib import Path

_preview_slot = threading.BoundedSemaphore(1)


def _preview_faces(video, original_video, payload, state):
    request_id = ""
    try:
        if not isinstance(payload, str) or len(payload) > 1024:
            raise ValueError("Invalid preview request.")
        request = json.loads(payload)
        request_id = str(request.get("id", ""))[:128]
        start = float(request["start"])
        if not math.isfinite(start) or start < 0:
            raise ValueError("Invalid start time.")
        if state.get("__preset", state.get("preset")) != "MiniMax-H3(Region)":
            raise ValueError("Face preview is only available in the H3 Region preset.")
        source = original_video or video
        if not isinstance(source, str) or not Path(source).is_file():
            raise ValueError("Upload a source video.")
        from modules import config

        roots = config.paths_insightface
        worker = Path(__file__).resolve().parents[1] / "comfy/custom_nodes/SimpAINodes/SimpAIFaceIdentityTrack.py"
        result = subprocess.run(
            [sys.executable, str(worker)], input=json.dumps(dict(
                video=source, start=start, roots=roots if isinstance(roots, list) else [roots])),
            capture_output=True, text=True, encoding="utf-8", timeout=60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            raise RuntimeError(result.stderr[-1000:])
        response = json.loads(result.stdout.strip().splitlines()[-1])
    except subprocess.TimeoutExpired:
        response = dict(ok=False, error="Face preview timed out")
    except Exception as error:
        logging.warning("H3 target face preview failed: %s", error)
        response = dict(ok=False, error="Face preview failed")
    return json.dumps(dict(response, id=request_id))


def preview_faces(video, original_video, payload, state):
    if not _preview_slot.acquire(blocking=False):
        try:
            request_id = str(json.loads(payload[:1024]).get("id", ""))[:128]
        except (ValueError, AttributeError, TypeError):
            request_id = ""
        return json.dumps(dict(ok=False, id=request_id, error="Face preview is busy"))
    try:
        return _preview_faces(video, original_video, payload, state)
    finally:
        _preview_slot.release()
