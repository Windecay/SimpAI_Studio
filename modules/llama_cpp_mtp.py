"""Inspect embedded MTP weights before entering native speculative decoding."""

import functools
import os
import struct

from modules.vlm_model_catalog import (
    GGUF_MAX_METADATA_ENTRIES,
    GGUF_SUPPORTED_VERSIONS,
    _gguf_read_exact,
    _gguf_read_string,
    _gguf_read_uint,
    _gguf_skip_value,
    gguf_split_paths,
)


_NEXTN_SUFFIXES = (
    "nextn.eh_proj.weight",
    "nextn.enorm.weight",
    "nextn.hnorm.weight",
)


def embedded_mtp_availability(model_path):
    """Return availability and a diagnostic without mapping or loading weights."""
    try:
        signature = []
        for path in gguf_split_paths(model_path):
            path = os.path.abspath(path)
            stat = os.stat(path)
            signature.append((path, stat.st_size, stat.st_mtime_ns))
        return _embedded_mtp_availability(tuple(signature))
    except (OSError, EOFError, ValueError, struct.error, UnicodeError) as error:
        return False, f"Cannot inspect embedded MTP weights: {error}"


@functools.lru_cache(maxsize=32)
def _embedded_mtp_availability(signature):
    nextn_names = set()
    for path, size, _mtime in signature:
        with open(path, "rb") as handle:
            if _gguf_read_exact(handle, 4) != b"GGUF":
                raise ValueError("Invalid GGUF magic")
            version = _gguf_read_exact(handle, 4)
            endian = "<" if struct.unpack("<I", version)[0] in GGUF_SUPPORTED_VERSIONS else ">"
            if struct.unpack(endian + "I", version)[0] not in GGUF_SUPPORTED_VERSIONS:
                raise ValueError("Unsupported GGUF version")
            count = _gguf_read_uint(handle, endian, "Q")
            fields = _gguf_read_uint(handle, endian, "Q")
            if not 0 < count <= 1_000_000 or fields > GGUF_MAX_METADATA_ENTRIES:
                raise ValueError("Invalid GGUF index counts")
            for _ in range(fields):
                _gguf_read_string(handle, endian, size)
                kind = _gguf_read_uint(handle, endian, "I")
                _gguf_skip_value(handle, endian, size, kind)
            for _ in range(count):
                name = _gguf_read_string(handle, endian, size, capture=True, max_bytes=4096)
                dims = _gguf_read_uint(handle, endian, "I")
                if not name or not 1 <= dims <= 4:
                    raise ValueError("Invalid GGUF tensor")
                for _ in range(dims):
                    if not 0 < _gguf_read_uint(handle, endian, "Q") <= 2**40:
                        raise ValueError("Invalid GGUF tensor dimensions")
                _gguf_read_uint(handle, endian, "I")  # Quantization type need not be decoded.
                offset = _gguf_read_uint(handle, endian, "Q")
                if offset >= size:
                    raise ValueError("Invalid GGUF tensor offset")
                if name.endswith(_NEXTN_SUFFIXES):
                    nextn_names.add(name)
    for name in nextn_names:
        if name.endswith(_NEXTN_SUFFIXES[0]):
            prefix = name[:-len(_NEXTN_SUFFIXES[0])]
            if all(prefix + suffix in nextn_names for suffix in _NEXTN_SUFFIXES):
                return True, ""
    # Metadata can advertise NextN layers even when conversion omitted their weights.
    return False, "No external MTP draft selected and embedded MTP weights are missing or incomplete."
