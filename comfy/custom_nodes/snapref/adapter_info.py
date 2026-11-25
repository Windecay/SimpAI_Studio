"""Read-only adapter facts for the simple node's front end (GET /snapref/adapters).

Only the safetensors header is read (8-byte little-endian length + JSON), never the tensors, and each answer is
cached until the file's mtime or size changes. A file that cannot be read (still downloading, damaged) becomes an
{"error": ...} entry; the front end then treats its modes as unknown and the node reports any problem when it runs.
"""
from __future__ import annotations

import json
import os
import struct
from typing import Callable

MAX_HEADER = 100 * 1024 * 1024   # bytes; real adapter headers are well under 1 MB
_cache: dict[tuple, dict] = {}   # (path, mtime_ns, size) -> {"modes", "style"}


def read_meta(path: str) -> dict:
    """The adapter's own metadata (__metadata__["snapref"] or ["anima_ref_kv"], JSON) from the header alone."""
    with open(path, "rb") as handle:
        head = handle.read(8)
        if len(head) != 8:
            raise ValueError("not a safetensors file (no header)")
        (size,) = struct.unpack("<Q", head)
        if size > MAX_HEADER:
            raise ValueError(f"header too large ({size} bytes)")
        raw = handle.read(size)
    if len(raw) != size:
        raise ValueError("header cut short (file incomplete)")
    header = json.loads(raw)
    meta = (header.get("__metadata__") or {}) if isinstance(header, dict) else {}
    out = json.loads(meta.get("snapref") or meta.get("anima_ref_kv") or "{}")
    if not isinstance(out, dict):
        raise ValueError("adapter metadata is not an object")
    return out


def _summary(meta: dict) -> dict:
    modes = [str(m) for m in meta.get("modes", ["cs"])]   # as _Adapter: no list = a cs-only adapter
    branches = meta.get("branches") or {}
    style = "style" in modes and isinstance(branches, dict) and any(
        isinstance(b, dict) and "style" in (b.get("modes") or []) for b in branches.values())
    return {"modes": modes, "style": bool(style)}


def describe(names: list[str], resolve: Callable[[str], str | None]) -> dict[str, dict]:
    """{name: {"modes": [...], "style": bool} or {"error": str}} for each adapter file name, in order."""
    out = {}
    for name in names:
        try:
            path = resolve(name)
            if not path:
                raise FileNotFoundError("file not found")
            stat = os.stat(path)
            key = (path, stat.st_mtime_ns, stat.st_size)
            if key not in _cache:
                summary = _summary(read_meta(path))
                for old in [k for k in _cache if k[0] == path]:
                    del _cache[old]
                _cache[key] = summary
            out[name] = dict(_cache[key])
        except Exception as exc:   # noqa: BLE001 - a bad file must never break the route
            out[name] = {"error": f"{type(exc).__name__}: {exc}"[:300]}
    return out
