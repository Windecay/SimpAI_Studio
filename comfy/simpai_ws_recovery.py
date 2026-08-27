from io import BytesIO
import logging
import os
import threading
import time
import uuid


RECOVERY_SUBFOLDER = "simpai_ws_results"


def _env_int(name, default, minimum, maximum):
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        logging.warning("Invalid %s=%r; using %s", name, raw, default)
        return default
    return max(minimum, min(maximum, value))


MAX_FILES = _env_int("SIMPLEAI_WS_RECOVERY_MAX_FILES", 64, 1, 10000)
MAX_BYTES = _env_int(
    "SIMPLEAI_WS_RECOVERY_MAX_BYTES",
    512 * 1024 * 1024,
    1024 * 1024,
    1024 * 1024 * 1024 * 1024,
)
MAX_AGE_SECONDS = _env_int("SIMPLEAI_WS_RECOVERY_MAX_AGE_SECONDS", 3600, 60, 7 * 24 * 3600)
MIN_RETENTION_SECONDS = _env_int("SIMPLEAI_WS_RECOVERY_MIN_RETENTION_SECONDS", 300, 0, 3600)
CLEANUP_INTERVAL_SECONDS = _env_int("SIMPLEAI_WS_RECOVERY_CLEANUP_INTERVAL_SECONDS", 60, 10, 3600)
_STALE_TEMP_AGE_SECONDS = 300
_LOCK = threading.RLock()
_PENDING_FILES = {}
_REGISTERED_TEMP_DIRECTORIES = set()
_CLEANER_STARTED = False
_CLEANER_WAKE = threading.Event()


def recovery_directory(temp_directory):
    return os.path.join(temp_directory, RECOVERY_SUBFOLDER)


def _remove_file(path):
    try:
        os.remove(path)
        return True
    except FileNotFoundError:
        return True
    except OSError as exc:
        logging.warning("Failed to remove websocket recovery file %s: %s", path, exc)
        return False


def _cleanup_loop():
    while not _CLEANER_WAKE.wait(CLEANUP_INTERVAL_SECONDS):
        with _LOCK:
            temp_directories = list(_REGISTERED_TEMP_DIRECTORIES)
        for temp_directory in temp_directories:
            try:
                prune_recovery_directory(temp_directory)
            except Exception as exc:
                logging.warning("Websocket recovery cleanup failed for %s: %s", temp_directory, exc)


def _register_temp_directory(temp_directory):
    global _CLEANER_STARTED
    normalized = os.path.abspath(str(temp_directory))
    with _LOCK:
        _REGISTERED_TEMP_DIRECTORIES.add(normalized)
        if _CLEANER_STARTED:
            return
        cleaner = threading.Thread(
            target=_cleanup_loop,
            name="simpai-ws-recovery-cleaner",
            daemon=True,
        )
        cleaner.start()
        _CLEANER_STARTED = True


def prune_recovery_directory(
    temp_directory,
    preserve_filenames=(),
    incoming_bytes=0,
    incoming_files=0,
    max_files=None,
    max_bytes=None,
    max_age_seconds=None,
    min_retention_seconds=None,
):
    output_dir = recovery_directory(temp_directory)
    if not os.path.isdir(output_dir):
        return

    preserve = {os.path.basename(str(name)) for name in preserve_filenames if name}
    file_limit = MAX_FILES if max_files is None else max(1, int(max_files))
    byte_limit = MAX_BYTES if max_bytes is None else max(1, int(max_bytes))
    age_limit = MAX_AGE_SECONDS if max_age_seconds is None else max(1, int(max_age_seconds))
    retention = MIN_RETENTION_SECONDS if min_retention_seconds is None else max(0, int(min_retention_seconds))
    incoming_bytes = max(0, int(incoming_bytes))
    incoming_files = max(0, int(incoming_files))

    with _LOCK:
        now = time.time()
        expired_pending = [
            filename
            for filename, created_at in _PENDING_FILES.items()
            if now - created_at >= age_limit
        ]
        for filename in expired_pending:
            _PENDING_FILES.pop(filename, None)
        preserve.update(_PENDING_FILES)
        records = []
        try:
            entries = list(os.scandir(output_dir))
        except OSError as exc:
            logging.warning("Failed to inspect websocket recovery directory %s: %s", output_dir, exc)
            return

        for entry in entries:
            try:
                if not entry.is_file(follow_symlinks=False):
                    continue
                stat = entry.stat(follow_symlinks=False)
            except OSError:
                continue

            age = max(0.0, now - stat.st_mtime)
            if entry.name.endswith(".tmp"):
                if age >= _STALE_TEMP_AGE_SECONDS:
                    _remove_file(entry.path)
                continue

            records.append(
                {
                    "name": entry.name,
                    "path": entry.path,
                    "mtime": stat.st_mtime,
                    "size": stat.st_size,
                }
            )

        records.sort(key=lambda item: (item["mtime"], item["name"]))
        retained = []
        for record in records:
            if record["name"] not in preserve and now - record["mtime"] >= age_limit:
                if _remove_file(record["path"]):
                    continue
            retained.append(record)
        records = retained

        total_bytes = sum(record["size"] for record in records)
        removable = [
            record
            for record in records
            if record["name"] not in preserve and now - record["mtime"] >= retention
        ]
        while removable and (
            len(records) + incoming_files > file_limit
            or total_bytes + incoming_bytes > byte_limit
        ):
            record = removable.pop(0)
            if not _remove_file(record["path"]):
                continue
            records.remove(record)
            total_bytes -= record["size"]


def save_bytes(temp_directory, data, extension):
    temp_path = None
    try:
        payload = bytes(data)
        safe_extension = "".join(ch for ch in str(extension).lower() if ch.isalnum()) or "bin"
        output_dir = recovery_directory(temp_directory)
        os.makedirs(output_dir, exist_ok=True)
        filename = f"{uuid.uuid4().hex}.{safe_extension}"
        final_path = os.path.join(output_dir, filename)
        temp_path = f"{final_path}.tmp"

        with _LOCK:
            with open(temp_path, "wb") as handle:
                handle.write(payload)
            os.replace(temp_path, final_path)
            temp_path = None
            _PENDING_FILES[filename] = time.time()
            _register_temp_directory(temp_directory)

        return {"filename": filename, "subfolder": RECOVERY_SUBFOLDER, "type": "temp"}
    except Exception as exc:
        logging.warning("Failed to save websocket recovery output; continuing without history media: %s", exc)
        if temp_path:
            _remove_file(temp_path)
        return None


def save_image(temp_directory, image):
    try:
        buffer = BytesIO()
        image.save(buffer, format="PNG", compress_level=1)
        return save_bytes(temp_directory, buffer.getvalue(), "png")
    except Exception as exc:
        logging.warning("Failed to encode websocket recovery image; continuing without history media: %s", exc)
        return None


def history_filenames(history_item):
    outputs = history_item.get("outputs") if isinstance(history_item, dict) else None
    if not isinstance(outputs, dict):
        return set()

    filenames = set()
    for node_outputs in outputs.values():
        if not isinstance(node_outputs, dict):
            continue
        for items in node_outputs.values():
            if not isinstance(items, list):
                continue
            for item in items:
                if not isinstance(item, dict):
                    continue
                if item.get("type") != "temp" or item.get("subfolder") != RECOVERY_SUBFOLDER:
                    continue
                filename = item.get("filename")
                if isinstance(filename, str) and filename:
                    filenames.add(os.path.basename(filename))
    return filenames


def finalize_history_output_files(temp_directory, history_item):
    filenames = history_filenames(history_item)
    with _LOCK:
        for filename in filenames:
            _PENDING_FILES.pop(filename, None)
        _register_temp_directory(temp_directory)
    prune_recovery_directory(temp_directory, preserve_filenames=filenames)


def delete_history_output_files(temp_directory, history_item):
    filenames = history_filenames(history_item)
    if not filenames:
        return

    output_dir = recovery_directory(temp_directory)
    with _LOCK:
        for filename in filenames:
            _PENDING_FILES.pop(filename, None)
            _remove_file(os.path.join(output_dir, filename))
