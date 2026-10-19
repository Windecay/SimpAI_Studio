"""Tensor-index inspection and bounded GPU expert-cache plans for qwen4exp."""

import copy
import functools
import math
import os
import re
import struct

from modules.llama_cpp_runtime import llama_cpp_batch_plan

from modules.vlm_model_catalog import (
    GGUF_ARRAY_TYPE, GGUF_SCALAR_FORMATS, GGUF_SUPPORTED_VERSIONS,
    _gguf_read_exact, _gguf_read_string, _gguf_read_uint, _gguf_read_value,
    _gguf_skip_value, gguf_split_paths, read_gguf_metadata,
)

GIB = 1024 ** 3
_EXPERT = re.compile(r"^blk\.(\d+)\.ffn_(?:gate|up|down|gate_up)_exps\.weight$")


def _read_index(path):
    """Read headers only. Byte spans include alignment, independently of quant enums."""
    with open(path, "rb") as handle:
        size = os.fstat(handle.fileno()).st_size
        if _gguf_read_exact(handle, 4) != b"GGUF":
            raise ValueError("Invalid GGUF magic")
        raw = _gguf_read_exact(handle, 4)
        endian = "<" if struct.unpack("<I", raw)[0] in GGUF_SUPPORTED_VERSIONS else ">"
        if struct.unpack(endian + "I", raw)[0] not in GGUF_SUPPORTED_VERSIONS:
            raise ValueError("Unsupported GGUF version")
        count = _gguf_read_uint(handle, endian, "Q")
        fields = _gguf_read_uint(handle, endian, "Q")
        if not 0 < count <= 1_000_000 or fields > 1_000_000:
            raise ValueError("Invalid GGUF index counts")
        metadata = {}
        for _ in range(fields):
            key = _gguf_read_string(handle, endian, size, capture=True, max_bytes=4096)
            kind = _gguf_read_uint(handle, endian, "I")
            if key.startswith("qwen4exp.") or key in ("general.architecture", "general.alignment"):
                if kind == GGUF_ARRAY_TYPE:
                    subtype = _gguf_read_uint(handle, endian, "I")
                    length = _gguf_read_uint(handle, endian, "Q")
                    if subtype not in GGUF_SCALAR_FORMATS or length > 4096:
                        raise ValueError("Unsupported GGUF runtime metadata array")
                    metadata[key] = [_gguf_read_value(handle, endian, size, subtype) for _ in range(length)]
                else:
                    metadata[key] = _gguf_read_value(handle, endian, size, kind)
            else:
                _gguf_skip_value(handle, endian, size, kind)
        tensors = []
        names = set()
        for _ in range(count):
            name = _gguf_read_string(handle, endian, size, capture=True, max_bytes=4096)
            dims = _gguf_read_uint(handle, endian, "I")
            if not name or name in names or not 1 <= dims <= 4:
                raise ValueError("Invalid or duplicate GGUF tensor")
            names.add(name)
            shape = [_gguf_read_uint(handle, endian, "Q") for _ in range(dims)]
            if not all(0 < dim <= 2**40 for dim in shape):
                raise ValueError("Invalid GGUF tensor dimensions")
            kind = _gguf_read_uint(handle, endian, "I")
            offset = _gguf_read_uint(handle, endian, "Q")
            tensors.append({"name": name, "offset": offset, "type": kind, "shape": shape})
        alignment = int(metadata.get("general.alignment", 32))
        if alignment <= 0 or alignment > 65536 or alignment & (alignment - 1):
            raise ValueError("Invalid GGUF alignment")
        data_start = (handle.tell() + alignment - 1) // alignment * alignment
        ordered = sorted(tensors, key=lambda tensor: tensor["offset"])
        for index, tensor in enumerate(ordered):
            end = ordered[index + 1]["offset"] if index + 1 < count else size - data_start
            start = tensor["offset"]
            if start % alignment or not 0 <= start < end <= size - data_start:
                raise ValueError("Invalid GGUF tensor offsets")
            tensor["n_bytes"] = end - start
        return metadata, tensors


@functools.lru_cache(maxsize=8)
def _layout_from_signatures(signatures):
    first, first_tensors = _read_index(signatures[0][0])
    layers = int(first.get("qwen4exp.block_count", 0))
    experts = int(first.get("qwen4exp.expert_count", 0))
    if first.get("general.architecture") != "qwen4exp" or not 1 <= layers <= 4096 or experts <= 0:
        return None
    blocks, expert_blocks = [0] * layers, [0] * layers
    dense = ple = other = 0
    names = set()
    quant_types = set()
    for path, _, _ in signatures:
        metadata, tensors = (first, first_tensors) if path == signatures[0][0] else _read_index(path)
        if metadata.get("general.architecture", "qwen4exp") != "qwen4exp":
            raise ValueError("GGUF shard architectures differ")
        if int(metadata.get("qwen4exp.block_count", layers)) != layers:
            raise ValueError("GGUF shard block counts differ")
        for tensor in tensors:
            name, size = tensor["name"], tensor["n_bytes"]
            if name in names:
                raise ValueError("Duplicate GGUF tensor across shards")
            names.add(name)
            quant_types.add(tensor["type"])
            if name == "per_layer_token_embd.weight":
                ple += size
            elif name != "token_embd.weight":
                match = _EXPERT.fullmatch(name)
                if match:
                    index = int(match[1])
                    if index >= layers:
                        raise ValueError("GGUF expert layer exceeds block count")
                    expert_blocks[index] += size
                else:
                    dense += size
                if name.startswith("blk."):
                    parts = name.split(".", 2)
                    if len(parts) != 3 or not parts[1].isdigit() or int(parts[1]) >= layers:
                        raise ValueError("Invalid GGUF block name")
                    blocks[int(parts[1])] += size
                else:
                    other += size
    if not ple or not all(blocks) or not all(expert_blocks):
        raise ValueError("Incomplete qwen4exp dense/expert tensor layout")
    return {
        "gguf_architecture": "qwen4exp", "total_layers": layers,
        "embedding_length": first.get("qwen4exp.embedding_length"),
        "head_count": first.get("qwen4exp.attention.head_count"),
        "head_count_kv": first.get("qwen4exp.attention.head_count_kv"),
        "block_weight_bytes": blocks, "ple_bytes": ple, "other_gpu_bytes": other,
        "moe_dense_gpu_bytes": dense, "moe_expert_bytes": sum(expert_blocks),
        "moe_expert_block_bytes": expert_blocks, "moe_expert_count": experts,
        "moe_quant_types": sorted(quant_types), "moe_metadata": first,
        "moe_model_bytes": sum(size for _, size, _ in signatures),
        "tensor_size_method": "GGUF offsets including alignment; no weight data read",
    }


def read_qwen_moe_layout(path):
    if read_gguf_metadata(path).get("general.architecture") != "qwen4exp":
        return None
    paths = gguf_split_paths(path)
    signatures = tuple((os.path.abspath(p), os.stat(p).st_size, os.stat(p).st_mtime_ns) for p in paths)
    return copy.deepcopy(_layout_from_signatures(signatures))


def available_host_memory_gb():
    import psutil
    return psutil.virtual_memory().available / GIB


def qwen_moe_cache_plan(hparams, budget, n_ctx, kv_cache_type, mmproj_bytes=0, mtp_bytes=0, available_ram_gb=None):
    """Conservative 8K-32K budget. Unknown models keep the ordinary layer path."""
    if (hparams.get("gguf_architecture") != "qwen4exp"
            or not hparams.get("moe_dense_gpu_bytes") or budget.get("policy") == "cpu"
            or not 512 <= int(n_ctx) <= 32768):
        return None
    # Reserve persistent recurrent/KV state, graphs and host-expert upload buffers.
    # Q8 is measured separately; FP16 needs more space at longer context lengths.
    kv_scale = 1.0 if kv_cache_type == "q8_0" else 2.0
    runtime_gb = 2.25 + (int(n_ctx) / 8192) * 0.25 * kv_scale
    dense_gb = hparams["moe_dense_gpu_bytes"] / GIB * 1.05
    projector_gb = max(0, mmproj_bytes) / GIB * 1.15
    # Vision encoding has separate transient activations in addition to its weights.
    vision_gb = 1.0 if mmproj_bytes else 0.0
    draft_gb = max(0, mtp_bytes) / GIB * 1.10 + (0.5 if mtp_bytes else 0.0)
    reserve_gb = max(1.5, float(budget["reserve_gb"]))
    usable_gb = float(budget["capped_vram_gb"]) - reserve_gb
    expert_gb = hparams["moe_expert_bytes"] / GIB
    expert_budget = usable_gb - dense_gb - runtime_gb - projector_gb - vision_gb - draft_gb
    cache_gb = min(math.floor(expert_budget * 2) / 2, expert_gb)
    # Full residency needs only non-offloaded weights in RAM. A cache requires
    # the complete host model. Evaluate these separately on large GPUs.
    model_gb = float(hparams.get("moe_model_bytes", 0)) / GIB
    host_reserve = max(0, mtp_bytes) / GIB + 12
    cache_host_ok = available_ram_gb is None or available_ram_gb >= model_gb + host_reserve
    resident_host_gb = max(0, model_gb - expert_gb - hparams["moe_dense_gpu_bytes"] / GIB) + host_reserve
    resident = expert_budget >= expert_gb * 1.05 and (
        available_ram_gb is None or available_ram_gb >= resident_host_gb
    )
    if not resident and (cache_gb < 2 or not cache_host_ok):
        return None
    fallback_cache_gb = min(cache_gb, math.floor(expert_gb * .75 * 2) / 2) if resident else cache_gb
    if not cache_host_ok or fallback_cache_gb < 2:
        fallback_cache_gb = 0
    return {
        "moe_mode": "resident" if resident else "cache",
        "moe_resident": resident, "moe_expert_gpu_gb": expert_gb * 1.05 if resident else 0,
        "moe_cache_active": not resident, "moe_cache_gb": 0 if resident else cache_gb,
        "moe_cache_size": 0 if resident else int(cache_gb * GIB),
        "moe_fallback_cache_size": int(fallback_cache_gb * GIB),
        "n_cpu_moe": 0 if resident else hparams["total_layers"],
        "moe_dense_gpu_gb": dense_gb, "moe_runtime_reserve_gb": runtime_gb,
        "moe_mtp_reserve_gb": draft_gb, "moe_vision_reserve_gb": projector_gb + vision_gb,
        "moe_reserve_gb": reserve_gb,
        **llama_cpp_batch_plan(budget, n_ctx, expert_cache=True),
        "load_mode": 0, "lazy_mode": 0,
    }
