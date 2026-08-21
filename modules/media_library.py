"""Persistent index and management helpers for the standalone media library.

The existing Gradio gallery keeps its own UI state. This module is deliberately
independent: it indexes user output files, keeps user-editable metadata in
SQLite, and never exposes absolute filesystem paths to callers.
"""

from __future__ import annotations

import base64
from contextlib import contextmanager
from concurrent.futures import ThreadPoolExecutor
import datetime as _datetime
from functools import wraps
import hashlib
import html
import json
import logging
import mimetypes
import os
import re
import shutil
import sqlite3
import threading
import time
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import unquote, urlparse

import shared


DATE_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SCHEMA_VERSION = 2

IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp"})
VIDEO_EXTENSIONS = frozenset({".mp4", ".webm", ".mov", ".mkv"})
AUDIO_EXTENSIONS = frozenset({".wav", ".mp3", ".flac", ".ogg", ".opus", ".m4a", ".aac"})
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | AUDIO_EXTENSIONS

_CURSOR_VERSION = 1
_SEARCH_MAX_CHARS = 4000
_MAX_PAGE_SIZE = 120
_LEGACY_READ_CHUNK = 64 * 1024
_SQLITE_TIMEOUT_SECONDS = 30
_INITIALIZE_FILE_LOCK_TIMEOUT_SECONDS = 60
_INDEX_BATCH_SIZE = 64
_SUMMARY_CACHE_LOCK = threading.RLock()
_SUMMARY_CACHE: dict[tuple[str, bool, bool], tuple[int, list[dict[str, Any]]]] = {}
_FILESYSTEM_CHECK_CACHE_LOCK = threading.RLock()
_FILESYSTEM_CHECK_CACHE: dict[str, tuple[float, bool]] = {}
_FILESYSTEM_CHECK_INTERVAL_SECONDS = 2.0
_INITIALIZE_LOCKS_LOCK = threading.RLock()
_INITIALIZE_LOCKS: dict[str, threading.RLock] = {}
_MEDIA_WRITE_LOCKS_LOCK = threading.RLock()
_MEDIA_WRITE_LOCKS: dict[str, threading.RLock] = {}
_LOGGER = logging.getLogger(__name__)
_INDEX_EXECUTOR = ThreadPoolExecutor(max_workers=2, thread_name_prefix="media-library-index")


def _initialize_lock_for(db_path: str) -> threading.RLock:
    with _INITIALIZE_LOCKS_LOCK:
        lock = _INITIALIZE_LOCKS.get(db_path)
        if lock is None:
            lock = threading.RLock()
            _INITIALIZE_LOCKS[db_path] = lock
        return lock


def _media_write_lock_for(db_path: str) -> threading.RLock:
    with _MEDIA_WRITE_LOCKS_LOCK:
        lock = _MEDIA_WRITE_LOCKS.get(db_path)
        if lock is None:
            lock = threading.RLock()
            _MEDIA_WRITE_LOCKS[db_path] = lock
        return lock


def _serialize_media_write(method):
    @wraps(method)
    def wrapped(self, *args, **kwargs):
        with _media_write_lock_for(self.db_path):
            return method(self, *args, **kwargs)

    return wrapped


def _clear_filesystem_change_cache(db_path: str) -> None:
    with _FILESYSTEM_CHECK_CACHE_LOCK:
        _FILESYSTEM_CHECK_CACHE.pop(db_path, None)


@contextmanager
def _database_process_lock(db_path: str) -> Iterator[None]:
    """Serialize first-time schema setup across separate Studio processes."""

    lock_path = f"{db_path}.init.lock"
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)
    handle = open(lock_path, "a+b")
    try:
        if os.path.getsize(lock_path) == 0:
            handle.write(b"0")
            handle.flush()
        deadline = time.monotonic() + _INITIALIZE_FILE_LOCK_TIMEOUT_SECONDS
        if os.name == "nt":
            import msvcrt

            while True:
                try:
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                    break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError(f"Timed out waiting for media library lock: {lock_path}")
                    time.sleep(0.05)
            try:
                yield
            finally:
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            while True:
                try:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                    break
                except BlockingIOError:
                    if time.monotonic() >= deadline:
                        raise TimeoutError(f"Timed out waiting for media library lock: {lock_path}")
                    time.sleep(0.05)
            try:
                yield
            finally:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        handle.close()


class _ClosableConnection(sqlite3.Connection):
    """Make ``with connection`` close SQLite handles on Windows as well."""

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def _safe_text(value: Any, limit: int = _SEARCH_MAX_CHARS) -> str:
    text = "" if value is None else str(value)
    return text[:limit]


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(value: Any, fallback: Any) -> Any:
    try:
        parsed = json.loads(value or "")
    except Exception:
        return fallback
    return parsed


def _normalise_did(user_did: Any) -> str:
    value = str(user_did or "").strip()
    if value:
        return value
    try:
        if shared.token is not None and hasattr(shared.token, "get_guest_did"):
            value = str(shared.token.get_guest_did() or "").strip()
    except Exception:
        pass
    return value or "guest"


def resolve_user_did(user_did: Any = None, state_params: dict[str, Any] | None = None) -> str:
    """Resolve a server-side user id without accepting an arbitrary path."""

    if user_did:
        return _normalise_did(user_did)
    if isinstance(state_params, dict):
        user = state_params.get("user")
        try:
            if user is not None and hasattr(user, "get_did"):
                value = user.get_did()
                if value:
                    return _normalise_did(value)
        except Exception:
            pass
        for key in ("user_did", "__user_did"):
            if state_params.get(key):
                return _normalise_did(state_params[key])
    return _normalise_did()


def _default_outputs_root(user_did: str) -> str:
    import modules.config as config

    return os.path.abspath(config.get_user_path_outputs(user_did))


def _default_gallery_root(user_did: str) -> str:
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            return os.path.abspath(shared.token.get_path_in_user_dir(user_did, "gallery"))
    except Exception:
        pass
    import modules.config as config

    userhome = str(getattr(config, "path_userhome", "") or getattr(shared, "path_userhome", "") or "users")
    return os.path.abspath(os.path.join(userhome, user_did, "gallery"))


def _normalise_relative_path(value: Any) -> str:
    text = str(value or "").strip().replace("\\", "/")
    if not text or text.startswith("/") or text.startswith("//") or re.match(r"^[A-Za-z]:/", text):
        return ""
    parts = [part for part in text.split("/") if part not in {"", "."}]
    if not parts or any(part == ".." for part in parts):
        return ""
    return "/".join(parts)


def _path_under(root: str, relative_path: str) -> str:
    relative_path = _normalise_relative_path(relative_path)
    if not relative_path:
        return ""
    root_abs = os.path.realpath(os.path.abspath(root))
    candidate = os.path.realpath(os.path.abspath(os.path.join(root_abs, relative_path.replace("/", os.sep))))
    try:
        if os.path.commonpath([root_abs, candidate]) != root_abs:
            return ""
    except Exception:
        return ""
    return candidate


def invalidate_legacy_gallery_cache(user_did: Any = None) -> None:
    """Invalidate the legacy Gradio gallery catalog after filesystem changes."""

    try:
        from enhanced import gallery as gallery_util

        invalidate = getattr(gallery_util, "invalidate_output_list_cache", None)
        if callable(invalidate):
            invalidate(_normalise_did(user_did), clear_directory_cache=True)
    except (Exception, SystemExit) as exc:
        _LOGGER.debug("Legacy gallery cache invalidation skipped: %s", exc)


def _media_type_for_path(path: str) -> str:
    extension = os.path.splitext(path)[1].lower()
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    return "image"


def _mime_for_path(path: str, media_type: str) -> str:
    mime = mimetypes.guess_type(path)[0]
    if mime:
        return mime
    return {"video": "video/mp4", "audio": "audio/mpeg"}.get(media_type, "image/png")


def _media_id(relative_path: str) -> str:
    digest = hashlib.sha256(relative_path.encode("utf-8")).hexdigest()[:32]
    return f"media_{digest}"


def _date_for_path(relative_path: str, mtime: float) -> str:
    first = relative_path.split("/", 1)[0]
    if DATE_DIR_RE.match(first):
        return first
    return _datetime.datetime.fromtimestamp(mtime).date().isoformat()


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _encode_cursor(created_at: float, media_id: str, sort: str) -> str:
    payload = {"v": _CURSOR_VERSION, "created_at": created_at, "id": media_id, "sort": sort}
    raw = _json_dumps(payload).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_cursor(value: Any) -> dict[str, Any] | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        padded = text + "=" * ((4 - len(text) % 4) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict) or payload.get("v") != _CURSOR_VERSION:
        return None
    try:
        return {
            "created_at": float(payload["created_at"]),
            "id": str(payload["id"]),
            "sort": str(payload.get("sort") or "newest"),
        }
    except Exception:
        return None


def _image_dimensions(path: str) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(path) as image:
            width, height = image.size
        return int(width), int(height)
    except Exception:
        return None, None


def _video_dimensions(path: str, mime: str) -> tuple[int | None, int | None]:
    try:
        from modules import canvas_workbench_assets

        metadata = canvas_workbench_assets._probe_media_metadata(path, mime or "video/mp4")
        width = int(metadata.get("width") or 0)
        height = int(metadata.get("height") or 0)
        if width > 0 and height > 0:
            return width, height
    except Exception:
        pass
    return None, None


def _media_dimensions(path: str, media_type: str, mime: str) -> tuple[int | None, int | None]:
    if media_type == "image":
        return _image_dimensions(path)
    if media_type == "video":
        return _video_dimensions(path, mime)
    return None, None


def _extract_embedded_metadata(path: str, mime: str) -> dict[str, Any]:
    try:
        from modules.canvas_media_metadata import extract_media_metadata

        metadata = extract_media_metadata(path, mime=mime)
        return metadata if isinstance(metadata, dict) else {}
    except Exception:
        return {}


def _metadata_search_text(metadata: dict[str, Any]) -> str:
    if not isinstance(metadata, dict):
        return ""
    values: list[str] = []
    for key in ("prompt", "negative_prompt", "source", "scheme", "raw_text"):
        value = metadata.get(key)
        if value not in (None, ""):
            values.append(_safe_text(value))
    parameters = metadata.get("parameters")
    if isinstance(parameters, dict):
        values.extend(_safe_text(f"{key} {value}") for key, value in parameters.items())
    return " ".join(values)[:_SEARCH_MAX_CHARS]


def _metadata_needs_refresh(metadata: Any) -> bool:
    if not isinstance(metadata, dict) or not metadata.get("raw_keys"):
        return False
    return not any(
        metadata.get(key) not in (None, "", {}, [])
        for key in ("source", "scheme", "prompt", "negative_prompt", "parameters", "raw_text", "workflow")
    )


class _LegacyLogParser(HTMLParser):
    """Extract filename and metadata cells from old private logger HTML."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.current: dict[str, Any] | None = None
        self.container_depth = 0
        self.field: str | None = None
        self.field_parts: list[str] = []
        self.display_parts: list[str] = []
        self.items: dict[str, dict[str, str]] = {}

    @staticmethod
    def _class_set(attrs: list[tuple[str, str | None]]) -> set[str]:
        classes = next((value for key, value in attrs if key == "class"), "") or ""
        return {part for part in classes.split() if part}

    @staticmethod
    def _filename_from_url(value: str | None) -> str:
        if not value:
            return ""
        raw = unquote(str(value).replace("\\", "/"))
        parsed = urlparse(raw)
        path = parsed.path or raw
        return os.path.basename(path)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = dict(attrs)
        classes = self._class_set(attrs)
        if tag == "div" and "image-container" in classes:
            self.current = {"filename": "", "metadata": {}}
            self.container_depth = 1
            self.field = None
            self.field_parts = []
            self.display_parts = []
            return
        if self.current is None:
            return
        if tag == "div":
            self.container_depth += 1
        if tag in {"img", "video", "audio"}:
            filename = self._filename_from_url(attr_map.get("src"))
            if filename:
                self.current["filename"] = filename
        elif tag == "a":
            filename = self._filename_from_url(attr_map.get("href"))
            if filename and not self.current.get("filename"):
                self.current["filename"] = filename
        if tag == "td":
            if "label" in classes:
                self.field = "label"
                self.field_parts = []
            elif "value" in classes:
                self.field = "value"
                self.field_parts = []

    def handle_endtag(self, tag: str) -> None:
        if self.current is None:
            return
        if tag == "td" and self.field:
            text = " ".join("".join(self.field_parts).split())
            if self.field == "label":
                self.current["pending_label"] = text
            elif self.field == "value":
                label = str(self.current.pop("pending_label", "") or "").strip()
                if label and text:
                    self.current["metadata"][label] = text
            self.field = None
            self.field_parts = []
        if tag == "div":
            self.container_depth -= 1
            if self.container_depth <= 0:
                filename = str(self.current.get("filename") or "").strip()
                if filename:
                    self.items[filename] = dict(self.current.get("metadata") or {})
                self.current = None
                self.container_depth = 0

    def handle_data(self, data: str) -> None:
        if self.current is None:
            return
        if self.field:
            self.field_parts.append(data)
        else:
            self.display_parts.append(data)


def _legacy_metadata_for_folder(folder_path: str) -> dict[str, dict[str, str]]:
    html_paths: list[str] = []
    try:
        for entry in os.scandir(folder_path):
            if not entry.is_file():
                continue
            name = entry.name.lower()
            if name == "log.html" or (name.startswith("log_") and name.endswith(".html")):
                html_paths.append(entry.path)
    except OSError:
        return {}
    merged: dict[str, dict[str, str]] = {}
    for html_path in sorted(html_paths):
        try:
            parser = _LegacyLogParser()
            with open(html_path, "r", encoding="utf-8", errors="replace") as handle:
                while True:
                    chunk = handle.read(_LEGACY_READ_CHUNK)
                    if not chunk:
                        break
                    parser.feed(chunk)
                parser.close()
            for filename, metadata in parser.items.items():
                current = merged.setdefault(filename, {})
                for key, value in metadata.items():
                    if value and not current.get(key):
                        current[key] = value
        except (OSError, ValueError):
            continue
    return merged


class MediaLibrary:
    """SQLite-backed index for one user's persisted media."""

    def __init__(self, outputs_root: str, gallery_root: str, user_did: str = "guest") -> None:
        self.outputs_root = os.path.realpath(os.path.abspath(outputs_root))
        self.gallery_root = os.path.realpath(os.path.abspath(gallery_root))
        self.user_did = _normalise_did(user_did)
        self.db_path = os.path.join(self.gallery_root, "media_library.sqlite3")
        self.trash_root = os.path.join(self.gallery_root, "trash")
        os.makedirs(self.outputs_root, exist_ok=True)
        os.makedirs(self.gallery_root, exist_ok=True)
        os.makedirs(self.trash_root, exist_ok=True)
        self._initialized = False
        self._initialize_lock = _initialize_lock_for(self.db_path)

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.db_path,
            timeout=_SQLITE_TIMEOUT_SECONDS,
            factory=_ClosableConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.execute(f"PRAGMA busy_timeout = {_SQLITE_TIMEOUT_SECONDS * 1000}")
        return connection

    @staticmethod
    def _schema_ready(connection: sqlite3.Connection) -> bool:
        tables = {
            str(row[0])
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('library_meta', 'media')"
            ).fetchall()
        }
        if tables != {"library_meta", "media"}:
            return False
        rows = connection.execute(
            "SELECT key, value FROM library_meta WHERE key IN ('schema_version', 'index_revision')"
        ).fetchall()
        values = {str(row[0]): str(row[1]) for row in rows}
        try:
            return int(values.get("schema_version", "0")) >= SCHEMA_VERSION and "index_revision" in values
        except (TypeError, ValueError):
            return False

    def initialize(self) -> None:
        if self._initialized and os.path.exists(self.db_path):
            return
        with self._initialize_lock:
            if self._initialized and os.path.exists(self.db_path):
                return
            with _database_process_lock(self.db_path):
                with self._connect() as connection:
                    journal_mode = connection.execute("PRAGMA journal_mode").fetchone()
                    if str(journal_mode[0] if journal_mode else "").lower() != "wal":
                        connection.execute("PRAGMA journal_mode = WAL")
                    if not self._schema_ready(connection):
                        connection.executescript(
                            """
                            CREATE TABLE IF NOT EXISTS library_meta (
                                key TEXT PRIMARY KEY,
                                value TEXT NOT NULL
                            );
                            CREATE TABLE IF NOT EXISTS media (
                                media_id TEXT PRIMARY KEY,
                                user_did TEXT NOT NULL,
                                relative_path TEXT NOT NULL UNIQUE,
                                date_key TEXT NOT NULL,
                                name TEXT NOT NULL,
                                media_type TEXT NOT NULL,
                                mime TEXT NOT NULL,
                                size INTEGER NOT NULL DEFAULT 0,
                                mtime_ns INTEGER NOT NULL DEFAULT 0,
                                created_at REAL NOT NULL DEFAULT 0,
                                width INTEGER,
                                height INTEGER,
                                duration_ms INTEGER,
                                generation_metadata_json TEXT NOT NULL DEFAULT '{}',
                                generation_text TEXT NOT NULL DEFAULT '',
                                title TEXT NOT NULL DEFAULT '',
                                tags_json TEXT NOT NULL DEFAULT '[]',
                                rating INTEGER NOT NULL DEFAULT 0,
                                favorite INTEGER NOT NULL DEFAULT 0,
                                notes TEXT NOT NULL DEFAULT '',
                                missing_at REAL,
                                trashed_at REAL,
                                trash_path TEXT,
                                original_relative_path TEXT,
                                indexed_at REAL NOT NULL DEFAULT 0
                            );
                            CREATE INDEX IF NOT EXISTS idx_media_active_date
                                ON media(trashed_at, missing_at, date_key, created_at DESC, media_id DESC);
                            CREATE INDEX IF NOT EXISTS idx_media_active_type
                                ON media(trashed_at, missing_at, media_type, created_at DESC, media_id DESC);
                            CREATE INDEX IF NOT EXISTS idx_media_active_created
                                ON media(trashed_at, missing_at, created_at DESC, media_id DESC);
                            CREATE INDEX IF NOT EXISTS idx_media_generation_text
                                ON media(generation_text);
                            """
                        )
                        connection.execute(
                            "INSERT OR IGNORE INTO library_meta(key, value) VALUES('schema_version', ?)",
                            (str(SCHEMA_VERSION),),
                        )
                        connection.execute(
                            "UPDATE library_meta SET value = ? WHERE key = 'schema_version' AND CAST(value AS INTEGER) < ?",
                            (str(SCHEMA_VERSION), SCHEMA_VERSION),
                        )
                        connection.execute(
                            "INSERT OR IGNORE INTO library_meta(key, value) VALUES('index_revision', '0')"
                        )
                self._initialized = True

    @staticmethod
    def _revision(connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT value FROM library_meta WHERE key = 'index_revision'"
        ).fetchone()
        try:
            return int(row[0]) if row else 0
        except (TypeError, ValueError):
            return 0

    @classmethod
    def _bump_revision(cls, connection: sqlite3.Connection) -> None:
        connection.execute(
            "UPDATE library_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'index_revision'"
        )

    def _clear_summary_cache(self) -> None:
        with _SUMMARY_CACHE_LOCK:
            for key in tuple(_SUMMARY_CACHE):
                if key[0] == self.db_path:
                    _SUMMARY_CACHE.pop(key, None)

    def _row_to_item(self, row: sqlite3.Row, *, include_generation_metadata: bool = True) -> dict[str, Any]:
        item = dict(row)
        generation_metadata_json = item.pop("generation_metadata_json", "{}")
        if include_generation_metadata:
            item["generation_metadata"] = _json_loads(generation_metadata_json, {})
        item["tags"] = _json_loads(item.pop("tags_json", "[]"), [])
        item["favorite"] = bool(item.get("favorite"))
        item["is_trashed"] = bool(item.get("trashed_at"))
        item["is_missing"] = bool(item.get("missing_at"))
        item["updated_at_iso"] = _datetime.datetime.fromtimestamp(float(item.get("created_at") or 0)).isoformat(timespec="seconds") if item.get("created_at") else ""
        item.pop("user_did", None)
        item.pop("generation_text", None)
        return item

    @_serialize_media_write
    def _refresh_stale_embedded_metadata(self, row: sqlite3.Row, item: dict[str, Any]) -> dict[str, Any]:
        if not _metadata_needs_refresh(item.get("generation_metadata")):
            return item
        relative_path = str(row["relative_path"] or "")
        absolute_path = _path_under(self.outputs_root, relative_path)
        if not os.path.isfile(absolute_path):
            return item
        metadata = _extract_embedded_metadata(absolute_path, str(row["mime"] or ""))
        if not metadata or _metadata_needs_refresh(metadata):
            return item
        generation_text = _metadata_search_text(metadata)
        with _media_write_lock_for(self.db_path):
            with self._connect() as connection:
                connection.execute(
                    "UPDATE media SET generation_metadata_json=?, generation_text=?, indexed_at=? WHERE media_id=?",
                    (_json_dumps(metadata), generation_text, time.time(), str(row["media_id"])),
                )
                self._bump_revision(connection)
        self._clear_summary_cache()
        item["generation_metadata"] = metadata
        return item

    def _legacy_for_date(self, date_key: str, cache: dict[str, dict[str, dict[str, str]]]) -> dict[str, dict[str, str]]:
        if date_key not in cache:
            cache[date_key] = _legacy_metadata_for_folder(os.path.join(self.outputs_root, date_key))
        return cache[date_key]

    def _index_file(
        self,
        connection: sqlite3.Connection,
        absolute_path: str,
        legacy_cache: dict[str, dict[str, dict[str, str]]] | None = None,
    ) -> dict[str, Any]:
        try:
            absolute_path = os.path.realpath(os.path.abspath(absolute_path))
            stat = os.stat(absolute_path)
        except OSError:
            return {"ok": False, "indexed": False, "reason": "missing"}
        relative_path = os.path.relpath(absolute_path, self.outputs_root).replace(os.sep, "/")
        if not _path_under(self.outputs_root, relative_path):
            return {"ok": False, "indexed": False, "reason": "outside_outputs"}
        if os.path.splitext(relative_path)[1].lower() not in SUPPORTED_EXTENSIONS:
            return {"ok": False, "indexed": False, "reason": "unsupported"}

        folder_name = relative_path.split("/", 1)[0]
        media_type = _media_type_for_path(absolute_path)
        mime = _mime_for_path(absolute_path, media_type)
        media_id = _media_id(relative_path)
        row = connection.execute(
            "SELECT media_id, size, mtime_ns, missing_at, trashed_at, media_type, width, height FROM media WHERE relative_path = ?",
            (relative_path,),
        ).fetchone()
        signature_same = bool(
            row
            and int(row["size"] or 0) == int(stat.st_size)
            and int(row["mtime_ns"] or 0) == int(stat.st_mtime_ns)
            and str(row["media_type"] or "") == media_type
        )
        if signature_same:
            dimensions = (row["width"], row["height"])
            if media_type in {"image", "video"} and (
                int(row["width"] or 0) <= 0 or int(row["height"] or 0) <= 0
            ):
                dimensions = _media_dimensions(absolute_path, media_type, mime)
            needs_update = bool(
                row["missing_at"] is not None
                or row["trashed_at"] is not None
                or dimensions != (row["width"], row["height"])
            )
            if needs_update:
                connection.execute(
                    """
                    UPDATE media
                    SET missing_at = NULL, trashed_at = NULL, trash_path = NULL,
                        original_relative_path = COALESCE(original_relative_path, relative_path),
                        width = ?, height = ?, indexed_at = ?
                    WHERE relative_path = ?
                    """,
                    (dimensions[0], dimensions[1], time.time(), relative_path),
                )
            return {
                "ok": True,
                "indexed": True,
                "added": False,
                "changed": needs_update,
                "summary_changed": bool(row["missing_at"] is not None or row["trashed_at"] is not None),
                "media_id": media_id,
            }

        metadata = _extract_embedded_metadata(absolute_path, mime)
        if not metadata and legacy_cache is not None:
            legacy = self._legacy_for_date(folder_name, legacy_cache)
            legacy_metadata = legacy.get(os.path.basename(absolute_path)) or {}
            if legacy_metadata:
                metadata = {"source": "legacy_log", "raw": legacy_metadata}
                for key, value in legacy_metadata.items():
                    lower = key.lower()
                    if lower in {"prompt", "positive", "positive prompt", "raw prompt"}:
                        metadata["prompt"] = value
                    elif lower in {"negative", "negative prompt", "raw negative prompt"}:
                        metadata["negative_prompt"] = value
                    elif lower in {"model", "base model"}:
                        metadata.setdefault("parameters", {})["model"] = value
        width, height = _media_dimensions(absolute_path, media_type, mime)
        generation_text = _metadata_search_text(metadata)
        now = time.time()
        if row:
            connection.execute(
                """
                UPDATE media
                SET user_did=?, date_key=?, name=?, media_type=?, mime=?, size=?, mtime_ns=?,
                    created_at=?, width=?, height=?, generation_metadata_json=?, generation_text=?,
                    missing_at=NULL, trashed_at=NULL, trash_path=NULL,
                    original_relative_path=COALESCE(original_relative_path, relative_path), indexed_at=?
                WHERE relative_path=?
                """,
                (
                    self.user_did,
                    _date_for_path(relative_path, stat.st_mtime),
                    os.path.basename(absolute_path),
                    media_type,
                    mime,
                    stat.st_size,
                    stat.st_mtime_ns,
                    stat.st_mtime,
                    width,
                    height,
                    _json_dumps(metadata),
                    generation_text,
                    now,
                    relative_path,
                ),
            )
            return {"ok": True, "indexed": True, "added": False, "changed": True, "summary_changed": True, "media_id": media_id}

        connection.execute(
            """
            INSERT INTO media(
                media_id, user_did, relative_path, date_key, name, media_type, mime,
                size, mtime_ns, created_at, width, height,
                generation_metadata_json, generation_text, original_relative_path, indexed_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                media_id,
                self.user_did,
                relative_path,
                _date_for_path(relative_path, stat.st_mtime),
                os.path.basename(absolute_path),
                media_type,
                mime,
                stat.st_size,
                stat.st_mtime_ns,
                stat.st_mtime,
                width,
                height,
                _json_dumps(metadata),
                generation_text,
                relative_path,
                now,
            ),
        )
        return {"ok": True, "indexed": True, "added": True, "changed": True, "summary_changed": True, "media_id": media_id}

    def index_file(self, absolute_path: str) -> dict[str, Any]:
        """Index one completed output without walking the whole outputs tree."""

        self.initialize()
        legacy_cache: dict[str, dict[str, dict[str, str]]] = {}
        with _media_write_lock_for(self.db_path):
            with self._connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                result = self._index_file(connection, absolute_path, legacy_cache)
                if result.get("summary_changed"):
                    self._bump_revision(connection)
                if result.get("indexed"):
                    connection.execute(
                        "INSERT OR REPLACE INTO library_meta(key, value) VALUES('last_scan_at', ?)",
                        (str(time.time()),),
                    )
                connection.commit()
        if result.get("summary_changed"):
            self._clear_summary_cache()
        _clear_filesystem_change_cache(self.db_path)
        return result

    def has_filesystem_changes(self) -> bool:
        """Return whether a dated output folder changed after the last index pass."""

        self.initialize()
        latest_folder_mtime = 0.0
        try:
            for entry in os.scandir(self.outputs_root):
                if not entry.is_dir() or not DATE_DIR_RE.match(entry.name):
                    continue
                try:
                    latest_folder_mtime = max(latest_folder_mtime, entry.stat().st_mtime)
                except OSError:
                    continue
        except OSError:
            return False
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value FROM library_meta WHERE key = 'last_scan_at'"
            ).fetchone()
        try:
            last_scan_at = float(row[0]) if row else 0.0
        except (TypeError, ValueError):
            last_scan_at = 0.0

        if latest_folder_mtime > last_scan_at + 1e-6:
            with _FILESYSTEM_CHECK_CACHE_LOCK:
                _FILESYSTEM_CHECK_CACHE[self.db_path] = (time.monotonic(), True)
            return True

        checked_at = time.monotonic()
        with _FILESYSTEM_CHECK_CACHE_LOCK:
            cached = _FILESYSTEM_CHECK_CACHE.get(self.db_path)
            if cached and checked_at - cached[0] < _FILESYSTEM_CHECK_INTERVAL_SECONDS:
                return cached[1]

        with self._connect() as connection:
            rows = connection.execute(
                "SELECT relative_path FROM media WHERE trashed_at IS NULL AND missing_at IS NULL"
            ).fetchall()
        missing = any(
            not os.path.isfile(_path_under(self.outputs_root, str(row["relative_path"])))
            for row in rows
        )
        with _FILESYSTEM_CHECK_CACHE_LOCK:
            _FILESYSTEM_CHECK_CACHE[self.db_path] = (checked_at, missing)
        return missing

    @_serialize_media_write
    def reconcile_missing(self, max_seconds: float | None = 30.0) -> dict[str, Any]:
        """Mark indexed files that disappeared without waiting for a full scan."""

        self.initialize()
        started = time.perf_counter()
        deadline = started + float(max_seconds) if max_seconds else None
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT media_id, relative_path FROM media WHERE trashed_at IS NULL AND missing_at IS NULL"
            ).fetchall()

        checked = 0
        missing = 0
        truncated = False
        now = time.time()
        transaction_open = False
        batch_count = 0
        summary_changed = False
        with self._connect() as connection:
            def begin_batch() -> None:
                nonlocal transaction_open
                if not transaction_open:
                    connection.execute("BEGIN IMMEDIATE")
                    transaction_open = True

            def commit_batch() -> None:
                nonlocal transaction_open, batch_count, summary_changed
                if not transaction_open:
                    return
                self._bump_revision(connection)
                connection.commit()
                transaction_open = False
                batch_count = 0
                summary_changed = True

            for row in rows:
                if deadline and time.perf_counter() >= deadline:
                    truncated = True
                    break
                checked += 1
                if os.path.isfile(_path_under(self.outputs_root, str(row["relative_path"]))):
                    continue
                begin_batch()
                connection.execute(
                    "UPDATE media SET missing_at = ? WHERE media_id = ? AND missing_at IS NULL",
                    (now, str(row["media_id"])),
                )
                missing += 1
                batch_count += 1
                if batch_count >= _INDEX_BATCH_SIZE:
                    commit_batch()
            commit_batch()

        if summary_changed:
            self._clear_summary_cache()
        _clear_filesystem_change_cache(self.db_path)
        return {
            "ok": True,
            "checked": checked,
            "missing": missing,
            "truncated": truncated,
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
        }

    def scan(self, max_seconds: float | None = 20.0) -> dict[str, Any]:
        """Index persisted media and mark externally missing files."""

        self.initialize()
        started = time.perf_counter()
        missing_result = self.reconcile_missing(max_seconds=30.0)
        deadline = started + float(max_seconds) if max_seconds else None
        visited: set[str] = set()
        legacy_cache: dict[str, dict[str, dict[str, str]]] = {}
        scanned = 0
        added = 0
        changed = 0
        truncated = False
        summary_changed = False

        try:
            folder_names = [
                entry.name
                for entry in os.scandir(self.outputs_root)
                if entry.is_dir() and DATE_DIR_RE.match(entry.name)
            ]
        except OSError:
            folder_names = []

        with _media_write_lock_for(self.db_path):
            with self._connect() as connection:
                batch_count = 0
                batch_changed = False
                transaction_open = False

                def begin_batch() -> None:
                    nonlocal transaction_open
                    if not transaction_open:
                        connection.execute("BEGIN IMMEDIATE")
                        transaction_open = True

                def commit_batch() -> None:
                    nonlocal batch_count, batch_changed, summary_changed, transaction_open
                    if not transaction_open:
                        return
                    if batch_changed:
                        self._bump_revision(connection)
                        summary_changed = True
                    connection.commit()
                    batch_count = 0
                    batch_changed = False
                    transaction_open = False

                for folder_name in sorted(folder_names, reverse=True):
                    folder_path = os.path.join(self.outputs_root, folder_name)
                    legacy: dict[str, dict[str, str]] | None = None
                    for root, directories, filenames in os.walk(folder_path):
                        directories.sort(reverse=True)
                        for filename in sorted(filenames, reverse=True):
                            if deadline and time.perf_counter() >= deadline:
                                truncated = True
                                break
                            extension = os.path.splitext(filename)[1].lower()
                            if extension not in SUPPORTED_EXTENSIONS:
                                continue
                            absolute_path = os.path.abspath(os.path.join(root, filename))
                            try:
                                os.stat(absolute_path)
                            except OSError:
                                continue
                            relative_path = os.path.relpath(absolute_path, self.outputs_root).replace(os.sep, "/")
                            if not _path_under(self.outputs_root, relative_path):
                                continue
                            visited.add(relative_path)
                            scanned += 1
                            begin_batch()
                            result = self._index_file(connection, absolute_path, legacy_cache)
                            if not result.get("indexed"):
                                continue
                            added += int(bool(result.get("added")))
                            changed += int(bool(result.get("changed")))
                            batch_count += 1
                            batch_changed = batch_changed or bool(result.get("summary_changed"))
                            if batch_count >= _INDEX_BATCH_SIZE:
                                commit_batch()
                        if truncated:
                            break
                    if truncated:
                        break

                if not truncated:
                    now = time.time()
                    rows = connection.execute(
                        "SELECT relative_path FROM media WHERE trashed_at IS NULL AND missing_at IS NULL"
                    ).fetchall()
                    for row in rows:
                        relative_path = str(row["relative_path"])
                        if relative_path not in visited and not os.path.isfile(_path_under(self.outputs_root, relative_path)):
                            begin_batch()
                            connection.execute(
                                "UPDATE media SET missing_at = ? WHERE relative_path = ?",
                                (now, relative_path),
                            )
                            batch_count += 1
                            batch_changed = True
                            if batch_count >= _INDEX_BATCH_SIZE:
                                commit_batch()

                commit_batch()
                if not truncated:
                    connection.execute("BEGIN IMMEDIATE")
                    connection.execute(
                        "INSERT OR REPLACE INTO library_meta(key, value) VALUES('last_scan_at', ?)",
                        (str(time.time()),),
                    )
                    connection.commit()

        if summary_changed:
            self._clear_summary_cache()
        _clear_filesystem_change_cache(self.db_path)
        return {
            "ok": True,
            "scanned": scanned,
            "added": added,
            "changed": changed,
            "missing_reconciled": int(missing_result.get("missing") or 0),
            "missing_reconcile_truncated": bool(missing_result.get("truncated")),
            "truncated": truncated,
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
        }

    def date_summary(self, include_empty: bool = False, include_trashed: bool = False) -> list[dict[str, Any]]:
        self.initialize()
        with self._connect() as connection:
            revision = self._revision(connection)
            cache_key = (self.db_path, bool(include_empty), bool(include_trashed))
            with _SUMMARY_CACHE_LOCK:
                cached = _SUMMARY_CACHE.get(cache_key)
                if cached and cached[0] == revision:
                    return [dict(row) for row in cached[1]]
            rows = connection.execute(
                """
                SELECT date_key,
                       COUNT(*) AS total,
                       SUM(CASE WHEN media_type='image' THEN 1 ELSE 0 END) AS images,
                       SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) AS videos,
                       SUM(CASE WHEN media_type='audio' THEN 1 ELSE 0 END) AS audios
                FROM media
                WHERE trashed_at IS NOT NULL
                  AND missing_at IS NULL
                GROUP BY date_key
                ORDER BY date_key DESC
                """ if include_trashed else """
                SELECT date_key,
                       COUNT(*) AS total,
                       SUM(CASE WHEN media_type='image' THEN 1 ELSE 0 END) AS images,
                       SUM(CASE WHEN media_type='video' THEN 1 ELSE 0 END) AS videos,
                       SUM(CASE WHEN media_type='audio' THEN 1 ELSE 0 END) AS audios
                FROM media
                WHERE trashed_at IS NULL AND missing_at IS NULL
                GROUP BY date_key
                ORDER BY date_key DESC
                """
            ).fetchall()
        result = [dict(row) for row in rows]
        if include_empty:
            filtered = result
        else:
            filtered = [row for row in result if int(row.get("total") or 0) > 0]
        with _SUMMARY_CACHE_LOCK:
            _SUMMARY_CACHE[cache_key] = (revision, [dict(row) for row in filtered])
        return filtered

    def has_video_items(self) -> bool:
        self.initialize()
        with self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM media WHERE media_type = 'video' AND missing_at IS NULL LIMIT 1"
            ).fetchone()
        return row is not None

    def list_items(
        self,
        *,
        date_key: str | None = None,
        media_type: str | None = None,
        query: str | None = None,
        favorite: bool | None = None,
        cursor: str | None = None,
        limit: int = 48,
        sort: str = "newest",
        include_date_summary: bool = True,
        include_trashed: bool = False,
    ) -> dict[str, Any]:
        self.initialize()
        limit = max(1, min(int(limit or 48), _MAX_PAGE_SIZE))
        sort = "oldest" if str(sort or "").lower() == "oldest" else "newest"
        clauses = ["trashed_at IS NOT NULL"] if include_trashed else ["trashed_at IS NULL", "missing_at IS NULL"]
        params: list[Any] = []
        if date_key:
            date_key = str(date_key).strip()
            if not DATE_DIR_RE.match(date_key):
                date_key = ""
            if date_key:
                clauses.append("date_key = ?")
                params.append(date_key)
        if media_type in {"image", "video", "audio"}:
            clauses.append("media_type = ?")
            params.append(media_type)
        if favorite is not None:
            clauses.append("favorite = ?")
            params.append(1 if favorite else 0)
        if query:
            pattern = f"%{_escape_like(str(query).strip())[:200]}%"
            clauses.append("(name LIKE ? ESCAPE '\\' OR relative_path LIKE ? ESCAPE '\\' OR generation_text LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR tags_json LIKE ? ESCAPE '\\')")
            params.extend([pattern] * 6)

        decoded = _decode_cursor(cursor)
        if decoded and decoded.get("sort") == sort:
            if sort == "newest":
                clauses.append("(created_at < ? OR (created_at = ? AND media_id < ?))")
            else:
                clauses.append("(created_at > ? OR (created_at = ? AND media_id > ?))")
            params.extend([decoded["created_at"], decoded["created_at"], decoded["id"]])

        order = "created_at DESC, media_id DESC" if sort == "newest" else "created_at ASC, media_id ASC"
        sql = f"SELECT media_id, relative_path, date_key, name, media_type, mime, size, mtime_ns, created_at, width, height, duration_ms, title, tags_json, rating, favorite, notes, missing_at, trashed_at, trash_path, original_relative_path, indexed_at FROM media WHERE {' AND '.join(clauses)} ORDER BY {order} LIMIT ?"
        params.append(limit + 1)
        with self._connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._row_to_item(row, include_generation_metadata=False) for row in rows]
        next_cursor = _encode_cursor(float(rows[-1]["created_at"]), str(rows[-1]["media_id"]), sort) if has_more and rows else None
        return {
            "ok": True,
            "items": items,
            "next_cursor": next_cursor,
            "has_more": has_more,
            "date_summary": self.date_summary(include_trashed=include_trashed) if include_date_summary else [],
            "date_key": date_key or "",
            "media_type": media_type or "all",
            "sort": sort,
            "trash": bool(include_trashed),
        }

    def get_item(
        self,
        media_id: str,
        include_trashed: bool = False,
        *,
        include_generation_metadata: bool = True,
    ) -> dict[str, Any] | None:
        self.initialize()
        clauses = ["media_id = ?"]
        params: list[Any] = [str(media_id or "")]
        if not include_trashed:
            clauses.extend(["trashed_at IS NULL", "missing_at IS NULL"])
        with self._connect() as connection:
            row = connection.execute(f"SELECT * FROM media WHERE {' AND '.join(clauses)}", params).fetchone()
        if not row:
            return None
        item = self._row_to_item(row, include_generation_metadata=include_generation_metadata)
        if include_generation_metadata:
            item = self._refresh_stale_embedded_metadata(row, item)
        return item

    @_serialize_media_write
    def update_user_metadata(
        self,
        media_id: str,
        *,
        title: str | None = None,
        tags: Iterable[Any] | None = None,
        rating: int | None = None,
        favorite: bool | None = None,
        notes: str | None = None,
    ) -> dict[str, Any] | None:
        self.initialize()
        updates: list[str] = []
        params: list[Any] = []
        if title is not None:
            updates.append("title = ?")
            params.append(_safe_text(title, 240).strip())
        if tags is not None:
            clean_tags = []
            seen = set()
            for value in tags:
                tag = _safe_text(value, 80).strip()
                if tag and tag.casefold() not in seen:
                    clean_tags.append(tag)
                    seen.add(tag.casefold())
            updates.append("tags_json = ?")
            params.append(_json_dumps(clean_tags[:80]))
        if rating is not None:
            updates.append("rating = ?")
            params.append(max(0, min(int(rating), 5)))
        if favorite is not None:
            updates.append("favorite = ?")
            params.append(1 if favorite else 0)
        if notes is not None:
            updates.append("notes = ?")
            params.append(_safe_text(notes, 4000))
        if not updates:
            return self.get_item(media_id, include_trashed=True)
        params.append(str(media_id or ""))
        with self._connect() as connection:
            connection.execute(f"UPDATE media SET {', '.join(updates)} WHERE media_id = ?", params)
        return self.get_item(media_id, include_trashed=True)

    @_serialize_media_write
    def trash_items(self, media_ids: Iterable[Any]) -> dict[str, Any]:
        self.initialize()
        deleted: list[str] = []
        errors: list[dict[str, str]] = []
        now = time.time()
        ids = list(dict.fromkeys(str(value or "") for value in media_ids))[:120]
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            summary_changed = False
            for media_id in ids:
                row = connection.execute("SELECT * FROM media WHERE media_id = ? AND trashed_at IS NULL", (media_id,)).fetchone()
                if not row:
                    errors.append({"id": media_id, "error": "Media item not found."})
                    continue
                source = _path_under(self.outputs_root, row["relative_path"])
                if not source or not os.path.isfile(source):
                    errors.append({"id": media_id, "error": "Media file is missing."})
                    continue
                trash_name = f"{int(now * 1000)}_{media_id}_{os.path.basename(source)}"
                trash_path = os.path.join(self.trash_root, trash_name)
                try:
                    shutil.move(source, trash_path)
                except OSError as exc:
                    errors.append({"id": media_id, "error": str(exc)})
                    continue
                trash_relative = os.path.relpath(trash_path, self.gallery_root).replace(os.sep, "/")
                connection.execute(
                    "UPDATE media SET trashed_at = ?, trash_path = ?, original_relative_path = COALESCE(original_relative_path, relative_path), missing_at = NULL WHERE media_id = ?",
                    (now, trash_relative, media_id),
                )
                deleted.append(media_id)
                summary_changed = True
            if summary_changed:
                self._bump_revision(connection)
        if summary_changed:
            self._clear_summary_cache()
            invalidate_legacy_gallery_cache(self.user_did)
        return {"ok": bool(deleted) and not errors, "trashed": deleted, "errors": errors}

    @_serialize_media_write
    def restore_items(self, media_ids: Iterable[Any]) -> dict[str, Any]:
        self.initialize()
        restored: list[str] = []
        errors: list[dict[str, str]] = []
        ids = list(dict.fromkeys(str(value or "") for value in media_ids))[:120]
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            summary_changed = False
            for media_id in ids:
                row = connection.execute("SELECT * FROM media WHERE media_id = ? AND trashed_at IS NOT NULL", (media_id,)).fetchone()
                if not row:
                    errors.append({"id": media_id, "error": "Trashed media item not found."})
                    continue
                trash_path = _path_under(self.gallery_root, row["trash_path"] or "")
                target = _path_under(self.outputs_root, row["original_relative_path"] or row["relative_path"])
                if not trash_path or not os.path.isfile(trash_path):
                    errors.append({"id": media_id, "error": "Trash file is missing."})
                    continue
                if not target:
                    errors.append({"id": media_id, "error": "Original output path is invalid."})
                    continue
                if os.path.exists(target):
                    errors.append({"id": media_id, "error": "Original output path already exists."})
                    continue
                try:
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    shutil.move(trash_path, target)
                except OSError as exc:
                    errors.append({"id": media_id, "error": str(exc)})
                    continue
                connection.execute(
                    "UPDATE media SET trashed_at = NULL, trash_path = NULL, missing_at = NULL WHERE media_id = ?",
                    (media_id,),
                )
                restored.append(media_id)
                summary_changed = True
            if summary_changed:
                self._bump_revision(connection)
        if summary_changed:
            self._clear_summary_cache()
            invalidate_legacy_gallery_cache(self.user_did)
        return {"ok": bool(restored) and not errors, "restored": restored, "errors": errors}

    @_serialize_media_write
    def purge_trash(self, media_ids: Iterable[Any] | None = None) -> dict[str, Any]:
        self.initialize()
        ids = list(dict.fromkeys(str(value or "") for value in (media_ids or [])))[:120]
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            if ids:
                placeholders = ",".join("?" for _ in ids)
                rows = connection.execute(f"SELECT * FROM media WHERE trashed_at IS NOT NULL AND media_id IN ({placeholders})", ids).fetchall()
            else:
                rows = connection.execute("SELECT * FROM media WHERE trashed_at IS NOT NULL").fetchall()
            purged: list[str] = []
            errors: list[dict[str, str]] = []
            thumbnail_root = os.path.join(self.gallery_root, "thumbnails")
            for row in rows:
                trash_path = _path_under(self.gallery_root, row["trash_path"] or "")
                try:
                    if trash_path and os.path.exists(trash_path):
                        os.remove(trash_path)
                    media_id = str(row["media_id"])
                    try:
                        for entry in os.scandir(thumbnail_root):
                            if entry.is_file() and entry.name.startswith(f"{media_id}_") and entry.name.lower().endswith(".jpg"):
                                try:
                                    os.remove(entry.path)
                                except OSError:
                                    pass
                    except OSError:
                        pass
                    connection.execute("DELETE FROM media WHERE media_id = ?", (row["media_id"],))
                    purged.append(str(row["media_id"]))
                except OSError as exc:
                    errors.append({"id": str(row["media_id"]), "error": str(exc)})
            if purged:
                self._bump_revision(connection)
        if purged:
            self._clear_summary_cache()
            invalidate_legacy_gallery_cache(self.user_did)
        return {"ok": not errors, "purged": purged, "errors": errors}

    @staticmethod
    def _thumbnail_target(gallery_root: str, media_id: str, max_size: int) -> str:
        return os.path.join(gallery_root, "thumbnails", f"{media_id}_{int(max_size)}.jpg")

    def media_path(self, media_id: str, include_trashed: bool = False) -> str:
        item = self.get_item(media_id, include_trashed=include_trashed, include_generation_metadata=False)
        if not item:
            return ""
        relative_path = item.get("trash_path") if item.get("is_trashed") else item.get("relative_path")
        root = self.gallery_root if item.get("is_trashed") else self.outputs_root
        path = _path_under(root, relative_path or "")
        return path if path and os.path.isfile(path) else ""

    def thumbnail_path(self, media_id: str, max_size: int = 640, include_trashed: bool = False) -> str:
        """Return a cached image thumbnail; video cards use the Gradio poster route."""

        item = self.get_item(media_id, include_trashed=include_trashed, include_generation_metadata=False)
        if not item or item.get("media_type") != "image":
            return ""
        if item.get("is_trashed") and not include_trashed:
            return ""
        source_root = self.gallery_root if item.get("is_trashed") else self.outputs_root
        source_relative = item.get("trash_path") if item.get("is_trashed") else item.get("relative_path")
        source = _path_under(source_root, source_relative or "")
        if not source or not os.path.isfile(source):
            return ""
        if not source:
            return ""
        try:
            source_stat = os.stat(source)
        except OSError:
            return ""
        thumbnail_root = os.path.join(self.gallery_root, "thumbnails")
        os.makedirs(thumbnail_root, exist_ok=True)
        target = self._thumbnail_target(self.gallery_root, str(media_id), max_size)
        try:
            if os.path.isfile(target) and os.stat(target).st_mtime_ns >= source_stat.st_mtime_ns:
                return target
        except OSError:
            pass
        try:
            temporary = f"{target}.{os.getpid()}.{threading.get_ident()}.tmp"
            from PIL import Image

            with Image.open(source) as image:
                image = image.convert("RGB")
                image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                image.save(temporary, format="JPEG", quality=84, optimize=True)
            os.replace(temporary, target)
            return target
        except Exception:
            try:
                if "temporary" in locals() and os.path.exists(temporary):
                    os.remove(temporary)
            except OSError:
                pass
            return ""


def get_user_media_library(user_did: Any = None, state_params: dict[str, Any] | None = None) -> MediaLibrary:
    did = resolve_user_did(user_did, state_params)
    return MediaLibrary(_default_outputs_root(did), _default_gallery_root(did), did)


def queue_media_file_index(absolute_path: str, user_did: Any = None) -> bool:
    """Queue a completed output for indexing without blocking generation."""

    path = os.path.abspath(os.fspath(absolute_path)) if absolute_path else ""
    if not path or os.path.splitext(path)[1].lower() not in SUPPORTED_EXTENSIONS:
        return False
    did = resolve_user_did(user_did)
    output_root = _default_outputs_root(did)
    try:
        if os.path.commonpath([output_root, path]) != output_root:
            return False
    except ValueError:
        return False

    def worker() -> None:
        try:
            library = get_user_media_library(did)
            result = library.index_file(path)
            if result.get("indexed"):
                _LOGGER.debug(
                    "Queued media index completed: user_did=%s path=%s added=%s changed=%s",
                    did,
                    path,
                    result.get("added"),
                    result.get("changed"),
                )
        except Exception:
            _LOGGER.exception("Queued media index failed: user_did=%s path=%s", did, path)

    try:
        _INDEX_EXECUTOR.submit(worker)
    except RuntimeError:
        return False
    return True


def scan_user_media(user_did: Any = None, state_params: dict[str, Any] | None = None, max_seconds: float | None = 20.0) -> dict[str, Any]:
    return get_user_media_library(user_did, state_params).scan(max_seconds=max_seconds)
