from __future__ import annotations

import base64
import hashlib
import inspect
import json
import os
import re
import tempfile
import threading
import time
from collections import OrderedDict
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from typing import Any

from modules import access_mode


_DATA_URL_RE = re.compile(r"^data:(?P<mime>image/[^;,]+)(?:;[^,]*)?;base64,(?P<data>.*)$", re.IGNORECASE | re.DOTALL)
_REF_PREFIX = "simpai-sketch-cache:"
_DIGEST_RE = re.compile(r"^[0-9a-f]{64}$")
_MAX_ENTRY_BYTES = 32 * 1024 * 1024
_MAX_TOTAL_BYTES = 192 * 1024 * 1024
_MAX_ENTRIES = 96
_CACHE_ROOT = Path(os.getenv("LOCALAPPDATA") or (Path.home() / ".cache")) / "SimpAI" / "sketch-cache"

_lock = threading.RLock()
_cache: OrderedDict[str, dict[str, Any]] = OrderedDict()
_total_bytes = 0
_disk_index_loaded = False
_request_scope = ContextVar("sketch_cache_request", default=None)
_request_owner_resolver = None


def install_request_scope(blocks, request_owner_resolver) -> None:
    """Keep Studio's request available while Gradio preprocesses sketch refs."""
    global _request_owner_resolver
    _request_owner_resolver = request_owner_resolver
    if getattr(blocks, "_sketch_cache_request_scope_installed", False):
        return
    process_api = blocks.process_api
    preprocess_data = blocks.preprocess_data
    signature = inspect.signature(process_api)

    @wraps(preprocess_data)
    async def scoped_preprocess(*args, **kwargs):
        scope = _request_scope.get()
        if scope is None or scope[1] is None:
            return await preprocess_data(*args, **kwargs)
        token = _request_scope.set((next(scope[1], None), None))
        try:
            return await preprocess_data(*args, **kwargs)
        finally:
            _request_scope.reset(token)

    @wraps(process_api)
    async def scoped_process_api(*args, **kwargs):
        request = signature.bind_partial(*args, **kwargs).arguments.get("request")
        token = _request_scope.set((request, iter(request) if isinstance(request, list) else None))
        try:
            return await process_api(*args, **kwargs)
        finally:
            _request_scope.reset(token)

    blocks.preprocess_data = scoped_preprocess
    blocks.process_api = scoped_process_api
    blocks._sketch_cache_request_scope_installed = True


def _cache_owner(owner=None):
    if access_mode.is_local_mode():
        return None
    if owner is None:
        scope = _request_scope.get()
        request = scope[0] if scope is not None else None
        if request is None or _request_owner_resolver is None:
            raise PermissionError("Studio identity session is required for sketch cache references.")
        requests = request if isinstance(request, list) else [request]
        owners = {str(_request_owner_resolver(item) or "").strip() for item in requests}
        if len(owners) != 1:
            raise PermissionError("Sketch cache references require one current identity.")
        owner = owners.pop()
    owner = str(owner or "").strip()
    if not owner:
        raise PermissionError("Studio identity session is required for sketch cache references.")
    return hashlib.sha256(owner.encode("utf-8")).hexdigest()


def _decode_data_url(data_url: str) -> tuple[str, bytes]:
    if not isinstance(data_url, str):
        raise ValueError("Sketch cache payload must be a data URL string.")
    match = _DATA_URL_RE.match(data_url.strip())
    if not match:
        raise ValueError("Sketch cache payload must be an image data URL.")
    mime = (match.group("mime") or "image/png").lower()
    raw = base64.b64decode(match.group("data") or "", validate=False)
    if not raw:
        raise ValueError("Sketch cache payload is empty.")
    if len(raw) > _MAX_ENTRY_BYTES:
        raise ValueError("Sketch cache payload is too large.")
    return mime, raw


def _cache_paths(digest: str) -> tuple[Path, Path]:
    return _CACHE_ROOT / f"{digest}.bin", _CACHE_ROOT / f"{digest}.json"


def _atomic_write(path: Path, data: bytes) -> None:
    temp_path = path.with_name(f"{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    try:
        with open(temp_path, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass


def _remove_entry_files(entry: dict[str, Any]) -> None:
    for key in ("data_path", "meta_path"):
        path = entry.get(key)
        if not path:
            continue
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            pass


def _ensure_disk_index_locked() -> None:
    global _disk_index_loaded, _total_bytes
    if _disk_index_loaded:
        return
    _disk_index_loaded = True
    _CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    entries = []
    for meta_path in _CACHE_ROOT.glob("*.json"):
        digest = meta_path.stem.lower()
        if not _DIGEST_RE.fullmatch(digest):
            continue
        data_path, expected_meta_path = _cache_paths(digest)
        try:
            metadata = json.loads(expected_meta_path.read_text(encoding="utf-8"))
            size = data_path.stat().st_size
            mime = str(metadata.get("mime") or "")
            updated_at = max(
                float(metadata.get("updated_at") or 0.0),
                data_path.stat().st_mtime,
                expected_meta_path.stat().st_mtime,
            )
            if size <= 0 or size > _MAX_ENTRY_BYTES or not mime.startswith("image/"):
                raise ValueError("invalid sketch cache metadata")
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            _remove_entry_files({"data_path": data_path, "meta_path": expected_meta_path})
            continue
        owners = metadata.get("owners")
        owners = [value for value in owners if isinstance(value, str) and _DIGEST_RE.fullmatch(value)] if isinstance(owners, list) else []
        entries.append((updated_at, digest, mime, size, data_path, expected_meta_path, owners))

    for updated_at, digest, mime, size, data_path, meta_path, owners in sorted(entries):
        ref = f"{_REF_PREFIX}{digest}"
        _cache[ref] = {
            "mime": mime,
            "bytes": size,
            "sha256": digest,
            "updated_at": updated_at,
            "data_path": str(data_path),
            "meta_path": str(meta_path),
            "owners": owners,
        }
        _total_bytes += size
    _prune_locked()


def _prune_locked() -> None:
    global _total_bytes
    _ensure_disk_index_locked()
    while len(_cache) > _MAX_ENTRIES or _total_bytes > _MAX_TOTAL_BYTES:
        _, entry = _cache.popitem(last=False)
        _total_bytes -= int(entry.get("bytes") or 0)
        _remove_entry_files(entry)
    if _total_bytes < 0:
        _total_bytes = 0


def is_ref(value: Any) -> bool:
    return isinstance(value, str) and value.startswith(_REF_PREFIX)


def _read_verified_cache_content(ref: str, *, owner=None) -> tuple[str, bytes] | None:
    if not is_ref(ref):
        return None
    owner = _cache_owner(owner)
    global _total_bytes
    with _lock:
        _ensure_disk_index_locked()
        entry = _cache.get(ref)
        if entry is None or (owner is not None and owner not in entry.get("owners", [])):
            return None
        try:
            raw = Path(entry["data_path"]).read_bytes()
        except OSError:
            _cache.pop(ref, None)
            _total_bytes -= int(entry.get("bytes") or 0)
            return None
        digest = str(entry.get("sha256") or "")
        if not raw or hashlib.sha256(raw).hexdigest() != digest:
            _cache.pop(ref, None)
            _total_bytes -= int(entry.get("bytes") or 0)
            _remove_entry_files(entry)
            return None
        _cache.move_to_end(ref)
        now = time.time()
        entry["updated_at"] = now
        try:
            os.utime(entry["data_path"], (now, now))
            os.utime(entry["meta_path"], (now, now))
        except OSError:
            pass
        return str(entry["mime"]), raw


def store_data_url(data_url: str, *, role: str = "image", owner=None) -> dict[str, Any]:
    global _total_bytes
    owner = _cache_owner(owner)
    mime, raw = _decode_data_url(data_url)
    digest = hashlib.sha256(raw).hexdigest()
    ref = f"{_REF_PREFIX}{digest}"
    now = time.time()
    with _lock:
        _ensure_disk_index_locked()
        data_path, meta_path = _cache_paths(digest)
        owners = set((_cache.get(ref) or {}).get("owners", []))
        if owner is not None:
            owners.add(owner)
        _CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        _atomic_write(data_path, raw)
        metadata = json.dumps({
            "sha256": digest,
            "mime": mime,
            "bytes": len(raw),
            "role": role,
            "updated_at": now,
            "owners": sorted(owners),
        }, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
        _atomic_write(meta_path, metadata)
        old = _cache.pop(ref, None)
        if old is not None:
            _total_bytes -= int(old.get("bytes") or 0)
        entry = {
            "mime": mime,
            "bytes": len(raw),
            "sha256": digest,
            "role": role,
            "updated_at": now,
            "data_path": str(data_path),
            "meta_path": str(meta_path),
            "owners": sorted(owners),
        }
        _cache[ref] = entry
        _total_bytes += len(raw)
        _prune_locked()
    return {
        "ref": ref,
        "sha256": digest,
        "bytes": len(raw),
        "mime": mime,
    }


def resolve_data_url(value: Any, *, owner=None) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.lower().startswith("data:image/"):
        return text
    verified = _read_verified_cache_content(text, owner=owner)
    if verified is None:
        return None
    mime, raw = verified
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def resolve_payload_source(payload: dict[str, Any], role: str, *, owner=None) -> str | None:
    direct = resolve_data_url(payload.get(role), owner=owner)
    if direct:
        return direct
    return resolve_data_url(payload.get(f"{role}_ref"), owner=owner)


def store_payload(payload: dict[str, Any], *, owner=None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Sketch cache payload must be an object.")
    result: dict[str, Any] = {"ok": True}
    for role in ("image", "mask"):
        source = payload.get(role)
        if isinstance(source, str) and source.strip():
            stored = store_data_url(source, role=role, owner=owner)
            result[f"{role}_ref"] = stored["ref"]
            result[f"{role}_sha256"] = stored["sha256"]
            result[f"{role}_bytes"] = stored["bytes"]
            result[f"{role}_mime"] = stored["mime"]
        elif is_ref(payload.get(f"{role}_ref")):
            if _read_verified_cache_content(payload[f"{role}_ref"], owner=owner) is None:
                raise ValueError(f"Sketch cache reference is unavailable: {role}")
            result[f"{role}_ref"] = payload.get(f"{role}_ref")
    return result


def check_payload(payload: dict[str, Any], *, owner=None) -> dict[str, Any]:
    """Validate cached content without transferring image data to the browser."""
    result: dict[str, Any] = {"ok": True}
    for role in ("image", "mask"):
        ref = payload.get(f"{role}_ref")
        if not is_ref(ref):
            continue
        digest = ref[len(_REF_PREFIX):]
        expected = payload.get(f"{role}_sha256")
        if not _DIGEST_RE.fullmatch(digest) or (expected and expected != digest):
            continue
        if _read_verified_cache_content(ref, owner=owner) is not None:
            result[f"{role}_ref"] = ref
            result[f"{role}_sha256"] = digest
    return result


def resolve_payload(payload: dict[str, Any], *, owner=None) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Sketch cache resolve payload must be an object.")
    result: dict[str, Any] = {
        "ok": True,
        "width": payload.get("width"),
        "height": payload.get("height"),
    }
    for role in ("image", "mask"):
        source = resolve_payload_source(payload, role, owner=owner)
        if source:
            result[role] = source
        elif is_ref(payload.get(f"{role}_ref")):
            raise ValueError(f"Sketch cache reference is unavailable: {role}")
    if not result.get("image") and not result.get("mask"):
        raise ValueError("Sketch cache payload has no resolvable image data.")
    return result


def clear_cache_for_tests() -> None:
    global _CACHE_ROOT, _total_bytes, _disk_index_loaded
    with _lock:
        _CACHE_ROOT = Path(tempfile.gettempdir()) / "simpai-sketch-cache-tests" / str(os.getpid())
        _cache.clear()
        _total_bytes = 0
        _disk_index_loaded = False
        _ensure_disk_index_locked()
        for entry in _cache.values():
            _remove_entry_files(entry)
        _cache.clear()
        _total_bytes = 0
        _disk_index_loaded = True
