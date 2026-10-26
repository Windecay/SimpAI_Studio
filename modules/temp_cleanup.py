"""Periodic, age-based cleanup of the Studio-owned temporary directory."""

from __future__ import annotations

import json
import logging
import math
import os
import stat
import tempfile
import time
import uuid
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":
    import msvcrt
else:
    import fcntl

logger = logging.getLogger(__name__)
STATE_PREFIX = ".simpai-temp-cleanup"
STATE_NAME = STATE_PREFIX + ".json"
LOCK_NAME = STATE_PREFIX + ".lock"
DEFAULT_INTERVAL_DAYS = 7
DAY_SECONDS = 86400


def _is_redirect(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


@contextmanager
def _cleanup_lock(root: Path):
    path = root / LOCK_NAME
    try:
        info = path.lstat()
    except FileNotFoundError:
        info = None
    if info is not None and _is_redirect(info):
        raise OSError("Cleanup lock must not be a link")
    with path.open("a+b") as handle:
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        try:
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            yield False
            return
        try:
            yield True
        finally:
            handle.seek(0)
            if os.name == "nt":
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _read_last_check(root: Path) -> float | None:
    path = root / STATE_NAME
    try:
        info = path.lstat()
    except FileNotFoundError:
        return None
    if _is_redirect(info):
        raise OSError("Cleanup state must not be a link")
    if info.st_size > 4096:
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError):
        return None
    if not isinstance(data, dict) or data.get("version") != 1:
        return None
    timestamp = data.get("last_check_at")
    if type(timestamp) not in (int, float) or not math.isfinite(timestamp) or timestamp < 0:
        return None
    return float(timestamp)


def _write_last_check(root: Path, now: float) -> None:
    temporary = root / f"{STATE_PREFIX}.{uuid.uuid4().hex}.tmp"
    try:
        with temporary.open("x", encoding="utf-8") as handle:
            json.dump({"version": 1, "last_check_at": now}, handle)
        temporary.replace(root / STATE_NAME)
    finally:
        temporary.unlink(missing_ok=True)


def _remove_old_entries(root: Path, cutoff: float, result: dict) -> None:
    directories = []

    def failed(error):
        result["errors"] += 1
        logger.warning("[Cleanup] Could not clean a temporary entry: %s", error)

    for directory, names, files in os.walk(root, topdown=True, followlinks=False, onerror=failed):
        current = Path(directory)
        try:
            if _is_redirect(current.lstat()) or not current.resolve().is_relative_to(root):
                names[:] = []
                result["skipped_links"] += 1
                continue
        except OSError as error:
            names[:] = []
            failed(error)
            continue
        retained_directories = []
        for name in names:
            path = current / name
            try:
                if _is_redirect(path.lstat()) or not path.resolve().is_relative_to(root):
                    result["skipped_links"] += 1
                    continue
                retained_directories.append(name)
                directories.append(path)
            except OSError as error:
                failed(error)
        names[:] = retained_directories
        for name in files:
            if current == root and name.startswith(STATE_PREFIX):
                continue
            path = current / name
            try:
                info = path.lstat()
                if _is_redirect(info) or not path.resolve().is_relative_to(root):
                    result["skipped_links"] += 1
                    continue
                if not stat.S_ISREG(info.st_mode):
                    continue
                last_use = max(info.st_mtime, info.st_atime, info.st_ctime,
                               getattr(info, "st_birthtime", 0))
                if last_use >= cutoff:
                    result["retained_files"] += 1
                    continue
                path.unlink()
                result["deleted_files"] += 1
                result["deleted_bytes"] += info.st_size
            except FileNotFoundError:
                continue
            except OSError as error:
                failed(error)
    for path in reversed(directories):
        try:
            info = path.lstat()
            if not _is_redirect(info) and path.resolve().is_relative_to(root) and info.st_mtime < cutoff:
                path.rmdir()  # Only empty directories; never recursively remove a subtree.
        except OSError:
            pass


def cleanup_temp_directory_on_launch(temp_path, interval_days=DEFAULT_INTERVAL_DAYS, *, now=None):
    if type(interval_days) is not int or interval_days < 1:
        raise ValueError("Temporary cleanup interval must be a positive integer in days")
    now = time.time() if now is None else float(now)
    if not math.isfinite(now) or now < 0:
        raise ValueError("Invalid cleanup time")
    try:
        interval = float(interval_days) * DAY_SECONDS
    except OverflowError as error:
        raise ValueError("Temporary cleanup interval is too large") from error
    if not math.isfinite(interval):
        raise ValueError("Temporary cleanup interval is too large")
    result = {"status": "unavailable", "deleted_files": 0, "deleted_bytes": 0,
              "retained_files": 0, "skipped_links": 0, "errors": 0, "next_check_at": None}
    try:
        supplied = Path(temp_path).absolute()
        try:
            supplied_info = supplied.lstat()
        except FileNotFoundError:
            supplied_info = None
        if supplied_info is not None and _is_redirect(supplied_info):
            result["status"] = "unsafe_root"
            return result
        root = supplied.resolve()
        if (root in (Path(root.anchor), Path(tempfile.gettempdir()).resolve(), Path.home().resolve())
                or Path.cwd().resolve().is_relative_to(root)):
            result["status"] = "unsafe_root"
            return result
        root.mkdir(parents=True, exist_ok=True)
        with _cleanup_lock(root) as acquired:
            if not acquired:
                result["status"] = "busy"
                return result
            previous = _read_last_check(root)
            if previous is None or previous > now:
                _write_last_check(root, now)
                result.update(status="initialized", next_check_at=now + interval)
                return result
            if now - previous < interval:
                result.update(status="not_due", next_check_at=previous + interval)
                return result
            # Record the attempt before deleting. If the process is interrupted,
            # another launch will not repeat a partially completed cleanup.
            _write_last_check(root, now)
            _remove_old_entries(root, now - interval, result)
            result.update(status="partial" if result["errors"] else "cleaned", next_check_at=now + interval)
    except OSError as error:
        result["errors"] += 1
        logger.warning("[Cleanup] Temporary cleanup skipped: %s", error)
    return result
