import json
import math
import logging
import subprocess
import sys
import threading
import time
import queue
from collections import deque
from pathlib import Path

import gradio as gr

_preview_slot = threading.BoundedSemaphore(1)
_jobs = {}
_cancelled = {}
_jobs_lock = threading.Lock()


def _request(video, original_video, payload, state):
    if not isinstance(payload, str) or len(payload) > 2_100_000:
        raise ValueError("Invalid preview request.")
    request = json.loads(payload)
    if not isinstance(request, dict):
        raise ValueError("Invalid preview request.")
    start = float(request["start"])
    if not math.isfinite(start) or start < 0:
        raise ValueError("Invalid start time.")
    if state.get("__preset", state.get("preset")) != "MiniMax-H3(Region)":
        raise ValueError("Face preview is only available in the H3 Region preset.")
    mode = request.get("mode", "faces")
    if mode not in ("faces", "track", "track_rebase", "track_blank"):
        raise ValueError("Invalid face preview mode.")
    options = {}
    if mode == "faces" and len(payload) > 1024:
        raise ValueError("Invalid preview request.")
    if mode != "faces":
        end, factor = float(request["end"]), request["factor"]
        target_id, feather = request["target_id"], request["feather"]
        stored = request.get("track_json", "")
        if (not math.isfinite(end) or end <= start or type(factor) is not int or factor not in (1, 2, 3, 4)
                or type(target_id) is not int or not 0 <= target_id <= 99
                or type(feather) not in (int, float) or not math.isfinite(feather) or not 0 <= feather <= 64
                or not isinstance(stored, str) or len(stored) > 2_000_000
                or type(request.get("confirm_target", False)) is not bool):
            raise ValueError("Invalid face tracking interval or target.")
        options = dict(mode=mode, end=end, factor=factor, target_id=target_id, feather=feather,
                       track_json=stored, confirm_target=request.get("confirm_target", False))
    source = original_video or video
    if not isinstance(source, str) or not Path(source).is_file():
        raise ValueError("Upload a source video.")
    from modules import config
    roots, detection = config.paths_insightface, config.paths_detection
    return dict(video=source, start=start, roots=roots if isinstance(roots, list) else [roots],
                detection_roots=detection if isinstance(detection, list) else [detection], **options)


def _preview_faces(video, original_video, payload, state):
    request_id = ""
    try:
        request_id = str(json.loads(payload).get("id", ""))[:128]
        request = _request(video, original_video, payload, state)
        worker = Path(__file__).with_name("face_target_worker.py")
        result = subprocess.run(
            [sys.executable, str(worker)], input=json.dumps(request),
            capture_output=True, text=True, encoding="utf-8", timeout=600 if request.get("mode") in ("track", "track_rebase") else 60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode:
            raise RuntimeError(result.stderr[-1000:])
        response = json.loads(result.stdout.strip().splitlines()[-1])
        if not response.get("ok"):
            logging.warning("H3 target face preview worker failed: %s", result.stderr[-1000:])
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


def cancel_face_preview(payload, request: gr.Request):
    try:
        request_id = str(json.loads(payload).get("id", ""))[:128]
        with _jobs_lock:
            key = (request.session_hash, request_id)
            cancel = _jobs.get(key)
            if cancel is None:
                now = time.monotonic()
                for expired in [k for k, timestamp in _cancelled.items() if now - timestamp > 60]:
                    _cancelled.pop(expired, None)
                if len(_cancelled) >= 1024:
                    _cancelled.pop(next(iter(_cancelled)))
                _cancelled[key] = now
        if cancel:
            cancel.set()
    except (ValueError, AttributeError, TypeError):
        return


def stream_preview_faces(video, original_video, payload, state, request: gr.Request):
    request_id, process, readers, acquired = "", None, [], False
    key = None
    try:
        request_id = str(json.loads(payload).get("id", ""))[:128]
        job = _request(video, original_video, payload, state)
        acquired = _preview_slot.acquire(blocking=False)
        if not acquired:
            yield json.dumps(dict(ok=False, done=True, id=request_id, error="Face preview is busy"))
            return
        cancel = threading.Event()
        key = (request.session_hash, request_id)
        with _jobs_lock:
            _jobs[key] = cancel
            if _cancelled.pop(key, None) is not None:
                cancel.set()
        if job.get("mode", "").startswith("track"):
            yield json.dumps(dict(ok=True, done=False, id=request_id, progress=dict(
                stage="Face Track Reading Source", percent=0, completed=0, total=0)))
        if cancel.is_set():
            raise InterruptedError("Face Track Cancelled")
        process = subprocess.Popen(
            [sys.executable, "-u", str(Path(__file__).with_name("face_target_worker.py"))],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        lines, errors = queue.Queue(), deque(maxlen=80)

        def read_output():
            try:
                for line in process.stdout:
                    lines.put(line)
            finally:
                lines.put(None)

        def read_errors():
            for line in process.stderr:
                errors.append(line[-2000:])

        def write_input():
            try:
                process.stdin.write(json.dumps(job))
                process.stdin.close()
            except (BrokenPipeError, OSError, ValueError):
                pass

        readers = [threading.Thread(target=fn, daemon=True) for fn in (read_output, read_errors, write_input)]
        for reader in readers:
            reader.start()
        expires = time.monotonic() + (600 if job.get("mode") in ("track", "track_rebase") else 60)
        response = None
        while True:
            if cancel.is_set():
                raise InterruptedError("Face Track Cancelled")
            if time.monotonic() > expires:
                raise subprocess.TimeoutExpired(process.args, 600)
            try:
                line = lines.get(timeout=.2)
            except queue.Empty:
                continue
            if line is None:
                break
            try:
                value = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(value, dict) or "ok" not in value:
                continue
            if value.get("done") is False and isinstance(value.get("progress"), dict):
                value["progress"]["percent"] = min(99, max(0, int(value["progress"].get("percent", 0))))
                yield json.dumps(dict(value, id=request_id))
            else:
                response = value
        process.wait(timeout=5)
        if cancel.is_set():
            raise InterruptedError("Face Track Cancelled")
        if process.returncode or response is None:
            raise RuntimeError("".join(errors)[-2000:] or "Face preview worker returned no result.")
        if not response.get("ok"):
            logging.warning("H3 face track worker failed: %s", "".join(errors)[-2000:])
        terminal = dict(response, done=True, id=request_id)
        if terminal.get("ok") and "track" in terminal:
            terminal["progress"] = dict(stage="Face Track Complete", percent=100, completed=1, total=1)
    except (Exception, GeneratorExit) as error:
        if isinstance(error, GeneratorExit):
            raise
        logging.warning("H3 face preview stream failed: %s", error)
        message = ("Face Track Cancelled" if isinstance(error, InterruptedError) else
                   "Face preview timed out" if isinstance(error, subprocess.TimeoutExpired) else "Face preview failed")
        terminal = dict(ok=False, done=True, id=request_id, error=message)
    finally:
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            for reader in readers:
                reader.join(timeout=1)
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream:
                    stream.close()
        if key is not None:
            with _jobs_lock:
                _jobs.pop(key, None)
        if acquired:
            _preview_slot.release()
    yield json.dumps(terminal)
