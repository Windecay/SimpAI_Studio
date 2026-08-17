import platform
import sys


LLAMA_CPP_RUNTIME_VERSION = "0.3.46"
# Keep a small Windows/allocator margin while allowing 24 GB cards to reach
# roughly 22 GB of llama.cpp allocations when the rest of the GPU is free.
LLAMA_CPP_GPU_USAGE_CAP = 0.99
LLAMA_CPP_VRAM_RESERVE_RATIO = 0.05
LLAMA_CPP_MIN_VRAM_RESERVE_GB = 1.0
LLAMA_CPP_UNKNOWN_KV_GB_AT_16K = 4.0
LLAMA_CPP_N_CTX_MIN = 512
LLAMA_CPP_N_CTX_MAX = 131072
_GIB = float(1024 ** 3)

# llama.cpp uses ggml type ids for the optional KV cache quantization fields.
# Keep FP16 as the default because Q8_0 remains an experimental path for some
# multimodal and hybrid model families.
LLAMA_CPP_KV_CACHE_TYPES = {
    "f16": {
        "type_k": 1,  # GGML_TYPE_F16
        "type_v": 1,
        "bytes_per_element": 2.0,
        "label": "FP16",
        "experimental": False,
    },
    "q8_0": {
        "type_k": 8,  # GGML_TYPE_Q8_0
        "type_v": 8,
        "bytes_per_element": 34.0 / 32.0,
        "label": "Q8_0",
        "experimental": True,
    },
}

LLAMA_CPP_VRAM_POLICIES = {
    "relaxed": {
        "gpu_usage_cap": 0.90,
        "reserve_ratio": 0.15,
        "min_reserve_gb": 2.0,
        "reserve_kv_cache": True,
    },
    "standard": {
        "gpu_usage_cap": 0.95,
        "reserve_ratio": 0.10,
        "min_reserve_gb": 1.5,
        "reserve_kv_cache": True,
    },
    "extreme": {
        "gpu_usage_cap": LLAMA_CPP_GPU_USAGE_CAP,
        "reserve_ratio": LLAMA_CPP_VRAM_RESERVE_RATIO,
        "min_reserve_gb": LLAMA_CPP_MIN_VRAM_RESERVE_GB,
        "reserve_kv_cache": False,
    },
}


def normalize_llama_cpp_vram_policy(policy):
    value = str(policy or "extreme").strip().lower().replace("-", "_")
    return value if value in LLAMA_CPP_VRAM_POLICIES else "extreme"


def llama_cpp_vram_policy_config(policy="extreme"):
    name = normalize_llama_cpp_vram_policy(policy)
    return name, dict(LLAMA_CPP_VRAM_POLICIES[name])


def normalize_llama_cpp_kv_cache_type(value):
    name = str(value or "f16").strip().lower().replace("-", "_")
    return name if name in LLAMA_CPP_KV_CACHE_TYPES else "f16"


def normalize_llama_cpp_n_ctx(value, default=8192, maximum=None):
    try:
        fallback = int(default or 8192)
    except (TypeError, ValueError):
        fallback = 8192
    fallback = max(LLAMA_CPP_N_CTX_MIN, min(fallback, LLAMA_CPP_N_CTX_MAX))
    try:
        upper = int(maximum) if maximum is not None else LLAMA_CPP_N_CTX_MAX
    except (TypeError, ValueError):
        upper = LLAMA_CPP_N_CTX_MAX
    upper = max(LLAMA_CPP_N_CTX_MIN, min(upper, LLAMA_CPP_N_CTX_MAX))
    upper = max(upper, fallback)
    try:
        requested = int(value)
    except (TypeError, ValueError):
        requested = fallback
    if requested <= 0:
        requested = fallback
    return max(LLAMA_CPP_N_CTX_MIN, min(requested, upper))


def llama_cpp_kv_cache_type_config(value="f16"):
    name = normalize_llama_cpp_kv_cache_type(value)
    return name, dict(LLAMA_CPP_KV_CACHE_TYPES[name])


LLAMA_CPP_MODELSCOPE_BASE = (
    "https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/libs/llama"
)


_WHEEL_HASHES = {
    ("Linux", 11): "e1a6c7b2085207bb2c6feae67b4c3a9d231ca4c6d31bee6ac874480705139cd8",
    ("Linux", 12): "f037677db6f120e55d31e0a31a0fdaa6885406a06f0c3a9fd5cc5e79950642ec",
    ("Linux", 13): "b4e9f923e6199a3ac61b129f5032c12b22b87bd20c2b3111669570702dbb5cfe",
    ("Linux", 14): "c1fc35e0bf98ed2dc3938a5e605d4e46a95c13d39e87dd841ee8ac7083b86844",
    ("Windows", 11): "8c5fc54ec3d4a44602fa5d4a9b19a3c971b02ac39b2993a4805adebee84fd07b",
    ("Windows", 12): "3dbe2d390690e735588ded8f3629ce54489055d2767857f6823c19b42634b4a7",
    ("Windows", 13): "46d9d7351b3af3ed798baa2eeef45fbfdf5ad1689df33867afe4bb9fd6854c7f",
    ("Windows", 14): "17b52164d2e486587de8417b4134e00a6e167cb6e3f02579bcc2f72da13ed217",
}


def llama_cpp_gpu_budget(free_vram_bytes, total_vram_bytes, reclaimable_gb=0.0, policy="extreme"):
    policy_name, policy_config = llama_cpp_vram_policy_config(policy)
    usage_cap = float(policy_config["gpu_usage_cap"])
    reserve_ratio = float(policy_config["reserve_ratio"])
    min_reserve_gb = float(policy_config["min_reserve_gb"])
    free_vram_gb = max(0.0, float(free_vram_bytes or 0) / _GIB)
    total_vram_gb = max(0.0, float(total_vram_bytes or 0) / _GIB)
    reclaimable_gb = max(0.0, float(reclaimable_gb or 0.0))
    effective_free_gb = free_vram_gb + reclaimable_gb

    if total_vram_gb > 0:
        capped_vram_gb = min(effective_free_gb, total_vram_gb * usage_cap)
        reserve_gb = max(min_reserve_gb, total_vram_gb * reserve_ratio)
    else:
        capped_vram_gb = effective_free_gb * usage_cap
        reserve_gb = min_reserve_gb

    return {
        "policy": policy_name,
        "gpu_usage_cap": usage_cap,
        "reserve_ratio": reserve_ratio,
        "reserve_kv_cache": bool(policy_config["reserve_kv_cache"]),
        "free_vram_gb": effective_free_gb,
        "total_vram_gb": total_vram_gb,
        "capped_vram_gb": capped_vram_gb,
        "reserve_gb": reserve_gb,
        "gpu_budget_gb": max(0.0, capped_vram_gb - reserve_gb),
        "reclaimable_gb": reclaimable_gb,
    }


def estimate_llama_cpp_kv_cache_gb(
    n_ctx,
    total_layers,
    embedding_length,
    head_count,
    head_count_kv,
    kv_cache_type="f16",
):
    _, kv_type_config = llama_cpp_kv_cache_type_config(kv_cache_type)
    try:
        context_tokens = max(1, int(n_ctx))
        layer_count = max(1, int(total_layers))
        embedding_length = int(embedding_length)
        head_count = int(head_count)
        if embedding_length <= 0 or head_count <= 0:
            raise ValueError

        head_dim = embedding_length // head_count
        if head_dim <= 0:
            raise ValueError
        if isinstance(head_count_kv, (list, tuple)):
            per_layer_heads = [max(0, int(value)) for value in head_count_kv[:layer_count]]
            if not per_layer_heads or not any(per_layer_heads):
                raise ValueError
            if len(per_layer_heads) < layer_count:
                per_layer_heads.extend([per_layer_heads[-1]] * (layer_count - len(per_layer_heads)))
            kv_head_layers = sum(per_layer_heads)
        else:
            kv_heads = int(head_count_kv)
            if kv_heads <= 0:
                raise ValueError
            kv_head_layers = layer_count * kv_heads

        # K and V use the selected ggml type. Keep 20% for allocator and graph overhead.
        kv_bytes = (
            context_tokens
            * kv_head_layers
            * head_dim
            * float(kv_type_config["bytes_per_element"])
            * 2
        )
        return (kv_bytes / _GIB) * 1.2, True
    except (TypeError, ValueError, OverflowError):
        context_scale = max(1, int(n_ctx or 1)) / 16384.0
        fallback_gb = (
            LLAMA_CPP_UNKNOWN_KV_GB_AT_16K
            * context_scale
            * float(kv_type_config["bytes_per_element"])
            / 2.0
        )
        return max(0.5, fallback_gb), False


def llama_cpp_gpu_layer_attempts(target_layers, total_layers=None):
    target_layers = int(target_layers)
    if target_layers == -1:
        base_layers = max(0, int(total_layers or 0))
        attempts = [-1]
    else:
        base_layers = max(0, target_layers)
        attempts = [base_layers]

    for ratio in (0.75, 0.5, 0.25):
        candidate = max(0, int(base_layers * ratio))
        if candidate not in attempts:
            attempts.append(candidate)
    if 0 not in attempts:
        attempts.append(0)
    return attempts


def is_llama_cpp_memory_error(exc, oom_exception_type=None):
    if isinstance(exc, MemoryError):
        return True
    if oom_exception_type not in (None, Exception):
        try:
            if isinstance(exc, oom_exception_type):
                return True
        except TypeError:
            pass

    messages = []
    pending = [exc]
    visited = set()
    while pending:
        current = pending.pop()
        if current is None or id(current) in visited:
            continue
        visited.add(id(current))
        messages.append(str(current).lower())
        pending.extend((getattr(current, "__cause__", None), getattr(current, "__context__", None)))

    text = " ".join(messages)
    markers = (
        "out of memory",
        "failed to allocate",
        "unable to allocate",
        "not enough memory",
        "cudamalloc",
        "cuda_error_out_of_memory",
        "failed to create llama_context",
        "llama_new_context_with_model: failed",
        "paging file is too small",
        "winerror 1455",
        "页面文件太小",
    )
    return any(marker in text for marker in markers)


def _machine_supported(machine):
    return str(machine or "").strip().lower() in {"amd64", "x86_64"}


def select_llama_cpp_wheel(system=None, python_version=None, machine=None):
    system = str(system or platform.system())
    machine = str(machine or platform.machine())
    python_version = python_version or sys.version_info[:2]
    try:
        major, minor = int(python_version[0]), int(python_version[1])
    except Exception:
        return None
    if major != 3 or minor not in (11, 12, 13, 14) or not _machine_supported(machine):
        return None
    if system == "Windows":
        cuda_tag = "cu130"
        platform_tag = "win_amd64"
    elif system == "Linux":
        cuda_tag = "cu128"
        platform_tag = "linux_x86_64"
    else:
        return None
    python_tag = f"cp{major}{minor}"
    filename = (
        f"llama_cpp_python-{LLAMA_CPP_RUNTIME_VERSION}+{cuda_tag}-"
        f"{python_tag}-{python_tag}-{platform_tag}.whl"
    )
    return {
        "version": f"{LLAMA_CPP_RUNTIME_VERSION}+{cuda_tag}",
        "base_version": LLAMA_CPP_RUNTIME_VERSION,
        "cuda_tag": cuda_tag,
        "python_tag": python_tag,
        "filename": filename,
        "url": f"{LLAMA_CPP_MODELSCOPE_BASE}/{filename}",
        "sha256": _WHEEL_HASHES[(system, minor)],
        "system": system,
        "machine": machine,
    }


def llama_cpp_version_matches(installed_version, artifact):
    if not artifact:
        return False
    installed = str(installed_version or "").strip().lower()
    accepted = {
        str(artifact.get("version") or "").strip().lower(),
        str(artifact.get("base_version") or "").strip().lower(),
    }
    accepted.discard("")
    return installed in accepted


def supported_llama_cpp_wheels():
    result = []
    for system in ("Windows", "Linux"):
        for minor in (11, 12, 13, 14):
            result.append(select_llama_cpp_wheel(system, (3, minor), "x86_64"))
    return result
