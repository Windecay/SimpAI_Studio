import copy
import json
import os
import re
import struct
import threading
import time

from modules.llama_cpp_runtime import LLAMA_CPP_N_CTX_MAX


CATALOG_SCHEMA = "simpai.vlm-model-catalog.v1"
GGUF_RUNTIME_CONTEXT_DEFAULT = 8192
GGUF_RUNTIME_CONTEXT_MAX = LLAMA_CPP_N_CTX_MAX
CHAT_CATALOG_TEXT_ENCODER_ARCHITECTURES = frozenset({"qwen3vl_4b", "qwen3vl_8b"})
GGUF_SUPPORTED_VERSIONS = frozenset({2, 3})
GGUF_METADATA_KEYS = frozenset({
    "general.architecture",
    "general.name",
    "general.basename",
})
GGUF_VISION_HANDLERS = frozenset({
    "Qwen3.5",
    "Qwen3.6",
    "Qwen3.8",
    "Qwen3-VL",
    "Gemma3",
    "Gemma4",
    "MiniCPM-v4.5",
    "MiniCPM-v4.6",
    "GLM-4.6V",
    "GLM-4.1V-Thinking",
    "LFM2.5-VL",
    "LFM2-VL",
})
VISION_STATUS_READY = "ready"
VISION_STATUS_MISSING = "missing"
VISION_STATUS_TEXT_ONLY = "text_only"
GGUF_SCALAR_FORMATS = {
    0: ("B", 1),   # UINT8
    1: ("b", 1),   # INT8
    2: ("H", 2),   # UINT16
    3: ("h", 2),   # INT16
    4: ("I", 4),   # UINT32
    5: ("i", 4),   # INT32
    6: ("f", 4),   # FLOAT32
    7: ("?", 1),   # BOOL
    10: ("Q", 8),  # UINT64
    11: ("q", 8),  # INT64
    12: ("d", 8),  # FLOAT64
}
GGUF_STRING_TYPE = 8
GGUF_ARRAY_TYPE = 9
GGUF_MAX_KEY_BYTES = 1024 * 1024
GGUF_MAX_CAPTURED_STRING_BYTES = 8 * 1024 * 1024
GGUF_MAX_METADATA_ENTRIES = 1_000_000
_CACHE_LOCK = threading.RLock()
_BUILD_LOCK = threading.Lock()
_CACHE = {"key": None, "expires_at": 0.0, "payload": None}
_FILE_CACHE = {"gguf": {}, "safetensors": {}}


def _paths(value):
    if not value:
        return []
    values = value if isinstance(value, (list, tuple, set)) else [value]
    result = []
    seen = set()
    for item in values:
        path = os.path.abspath(os.path.expanduser(str(item)))
        key = os.path.normcase(path)
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def _find_file(roots, relative_path):
    relative_path = str(relative_path or "").replace("/", os.sep).replace("\\", os.sep)
    for root in _paths(roots):
        candidate = os.path.abspath(os.path.join(root, relative_path))
        try:
            if os.path.commonpath((root, candidate)) != root:
                continue
        except Exception:
            continue
        if os.path.isfile(candidate):
            return candidate
    return None


def _iter_model_files(roots, extensions):
    extensions = {str(extension).lower() for extension in extensions}
    seen = set()
    for root in _paths(roots):
        if not os.path.isdir(root):
            continue
        try:
            walker = os.walk(root)
            for current, directory_names, file_names in walker:
                directory_names[:] = sorted(
                    name for name in directory_names if not name.startswith(".")
                )
                for file_name in sorted(file_names, key=str.lower):
                    if os.path.splitext(file_name)[1].lower() not in extensions:
                        continue
                    absolute_path = os.path.abspath(os.path.join(current, file_name))
                    key = os.path.normcase(absolute_path)
                    if key in seen:
                        continue
                    seen.add(key)
                    relative_path = os.path.relpath(absolute_path, root).replace("\\", "/")
                    yield root, relative_path, absolute_path
        except (OSError, PermissionError):
            continue


def _gguf_value(field):
    try:
        part_index = field.data[-1]
        value = field.parts[part_index]
    except Exception:
        value = None
    try:
        if hasattr(value, "tolist"):
            value = value.tolist()
        if isinstance(value, (list, tuple)):
            if len(value) == 1:
                value = value[0]
            elif value and all(isinstance(item, int) and 0 <= item <= 255 for item in value):
                try:
                    value = bytes(value).decode("utf-8")
                except UnicodeDecodeError:
                    pass
        if hasattr(value, "item"):
            value = value.item()
        if isinstance(value, bytes):
            value = value.decode("utf-8", errors="replace")
        return value
    except Exception:
        return value


def gguf_int_values(field):
    values = []
    for part_index in getattr(field, "data", []) or []:
        try:
            value = field.parts[part_index]
            if hasattr(value, "tolist"):
                value = value.tolist()
            if isinstance(value, list):
                if len(value) != 1:
                    continue
                value = value[0]
            if hasattr(value, "item"):
                value = value.item()
            values.append(int(value))
        except Exception:
            continue
    return values


def _gguf_read_exact(handle, size):
    size = int(size)
    if size < 0:
        raise ValueError("negative GGUF read size")
    data = handle.read(size)
    if len(data) != size:
        raise EOFError("truncated GGUF header")
    return data


def _gguf_read_uint(handle, endian, fmt):
    size = struct.calcsize(fmt)
    return struct.unpack(f"{endian}{fmt}", _gguf_read_exact(handle, size))[0]


def _gguf_skip_bytes(handle, size, file_size):
    size = int(size)
    if size < 0 or handle.tell() + size > file_size:
        raise ValueError("invalid GGUF metadata length")
    handle.seek(size, os.SEEK_CUR)


def _gguf_read_string(handle, endian, file_size, capture=False, max_bytes=GGUF_MAX_CAPTURED_STRING_BYTES):
    length = int(_gguf_read_uint(handle, endian, "Q"))
    if length > file_size - handle.tell():
        raise ValueError("invalid GGUF string length")
    if not capture or length > int(max_bytes):
        _gguf_skip_bytes(handle, length, file_size)
        return ""
    return _gguf_read_exact(handle, length).decode("utf-8", errors="replace")


def _gguf_skip_value(handle, endian, file_size, value_type, depth=0):
    if depth > 8:
        raise ValueError("GGUF metadata nesting is too deep")
    scalar = GGUF_SCALAR_FORMATS.get(int(value_type))
    if scalar:
        _gguf_skip_bytes(handle, scalar[1], file_size)
        return
    if int(value_type) == GGUF_STRING_TYPE:
        _gguf_read_string(handle, endian, file_size, capture=False)
        return
    if int(value_type) != GGUF_ARRAY_TYPE:
        raise ValueError(f"unknown GGUF metadata type: {value_type}")

    element_type = int(_gguf_read_uint(handle, endian, "I"))
    count = int(_gguf_read_uint(handle, endian, "Q"))
    element_scalar = GGUF_SCALAR_FORMATS.get(element_type)
    if element_scalar:
        _gguf_skip_bytes(handle, element_scalar[1] * count, file_size)
        return
    for _ in range(count):
        _gguf_skip_value(handle, endian, file_size, element_type, depth + 1)


def _gguf_read_value(handle, endian, file_size, value_type):
    scalar = GGUF_SCALAR_FORMATS.get(int(value_type))
    if scalar:
        return _gguf_read_uint(handle, endian, scalar[0]) if scalar[0] != "f" and scalar[0] != "d" else struct.unpack(
            f"{endian}{scalar[0]}", _gguf_read_exact(handle, scalar[1])
        )[0]
    if int(value_type) == GGUF_STRING_TYPE:
        return _gguf_read_string(handle, endian, file_size, capture=True)
    _gguf_skip_value(handle, endian, file_size, value_type)
    return None


def _gguf_metadata_key_needed(key):
    lowered = str(key or "").lower()
    return lowered in GGUF_METADATA_KEYS or lowered.endswith((".context_length", ".block_count"))


def _gguf_detection_metadata_ready(metadata):
    keys = {str(key).lower() for key in (metadata or {})}
    has_architecture = "general.architecture" in keys
    has_identity = bool(keys & {"general.name", "general.basename"})
    has_context = any(key.endswith(".context_length") for key in keys)
    return has_architecture and has_identity and has_context


def read_gguf_metadata(path):
    """Read only GGUF header metadata; do not build tensor indexes or map weights."""
    result = {}
    try:
        with open(path, "rb") as handle:
            file_size = os.fstat(handle.fileno()).st_size
            if _gguf_read_exact(handle, 4) != b"GGUF":
                return {}
            version_bytes = _gguf_read_exact(handle, 4)
            version = struct.unpack("<I", version_bytes)[0]
            endian = "<"
            if version not in GGUF_SUPPORTED_VERSIONS:
                version = struct.unpack(">I", version_bytes)[0]
                endian = ">"
            if version not in GGUF_SUPPORTED_VERSIONS:
                return {}

            _gguf_read_uint(handle, endian, "Q")  # tensor_count; tensor info is intentionally not read
            kv_count = int(_gguf_read_uint(handle, endian, "Q"))
            if kv_count < 0 or kv_count > GGUF_MAX_METADATA_ENTRIES:
                return {}
            for _ in range(kv_count):
                key = _gguf_read_string(
                    handle,
                    endian,
                    file_size,
                    capture=True,
                    max_bytes=GGUF_MAX_KEY_BYTES,
                )
                value_type = int(_gguf_read_uint(handle, endian, "I"))
                needed = _gguf_metadata_key_needed(key)
                value = _gguf_read_value(handle, endian, file_size, value_type) if needed else None
                if value is None and not needed:
                    if _gguf_detection_metadata_ready(result) and str(key).lower().startswith("tokenizer."):
                        break
                    _gguf_skip_value(handle, endian, file_size, value_type)
                elif value is not None:
                    result[key] = value
                if _gguf_detection_metadata_ready(result):
                    break
    except (OSError, EOFError, ValueError, struct.error, UnicodeError):
        return {}
    return result


def _file_signature(path):
    stat = os.stat(path)
    return stat.st_mtime_ns, stat.st_size


def _cached_gguf_metadata(path):
    cache_key = os.path.normcase(os.path.abspath(path))
    try:
        signature = _file_signature(path)
    except OSError:
        return {}
    with _CACHE_LOCK:
        cached = _FILE_CACHE["gguf"].get(cache_key)
        if cached and cached[0] == signature:
            return copy.deepcopy(cached[1])
    metadata = read_gguf_metadata(path)
    with _CACHE_LOCK:
        _FILE_CACHE["gguf"][cache_key] = (signature, copy.deepcopy(metadata))
    return metadata


def _metadata_text(metadata, filename):
    values = [filename]
    for key, value in (metadata or {}).items():
        if str(key).lower() in {"general.architecture", "general.name", "general.basename"}:
            values.append(str(value or ""))
    return " ".join(values).lower().replace("_", "-")


def infer_gguf_handler(metadata, filename):
    text = _metadata_text(metadata, filename)
    mappings = (
        (("qwen3.8", "qwen38", "qwen-3.8"), "Qwen3.8", "Qwen 3.8"),
        (("qwen3.6", "qwen36", "qwen-3.6"), "Qwen3.6", "Qwen 3.6"),
        (("qwen3.5", "qwen35", "qwen-3.5"), "Qwen3.5", "Qwen 3.5"),
        (("qwen3-vl", "qwen3vl", "qwen-3-vl"), "Qwen3-VL", "Qwen 3 VL"),
        (("gemma-4", "gemma4"), "Gemma4", "Gemma 4"),
        (("gemma-3", "gemma3"), "Gemma3", "Gemma 3"),
        (("minicpm-v-4.6", "minicpmv4.6", "minicpm-v4.6"), "MiniCPM-v4.6", "MiniCPM V 4.6"),
        (("minicpm-v-4.5", "minicpmv4.5", "minicpm-v4.5"), "MiniCPM-v4.5", "MiniCPM V 4.5"),
        (("glm-4.6v", "glm46v"), "GLM-4.6V", "GLM 4.6V"),
        (("glm-4.1v", "glm41v"), "GLM-4.1V-Thinking", "GLM 4.1V"),
        (("lfm2.5-vl", "lfm2.5vl"), "LFM2.5-VL", "LFM 2.5 VL"),
        (("lfm2-vl", "lfm2vl"), "LFM2-VL", "LFM 2 VL"),
    )
    for needles, handler, family in mappings:
        if any(needle in text for needle in needles):
            return {"handler": handler, "family": family}
    return None


TEXT_ONLY_QWEN_CHAT_HANDLERS = frozenset({"Qwen3.5", "Qwen3.6", "Qwen3.8"})


def runtime_chat_handler_name(handler, has_mmproj):
    handler = str(handler or "")
    if has_mmproj or handler in TEXT_ONLY_QWEN_CHAT_HANDLERS:
        return handler
    return ""


def gguf_vision_expected(handler):
    return str(handler or "").strip() in GGUF_VISION_HANDLERS


def gguf_vision_status(handler, has_mmproj, vision_expected=None):
    expected = gguf_vision_expected(handler) if vision_expected is None else bool(vision_expected)
    if has_mmproj:
        return VISION_STATUS_READY
    return VISION_STATUS_MISSING if expected else VISION_STATUS_TEXT_ONLY


def _gguf_context_window(metadata, default=8192):
    for key, value in (metadata or {}).items():
        if not str(key).lower().endswith(".context_length"):
            continue
        try:
            parsed = int(value)
            if parsed > 0:
                return min(parsed, GGUF_RUNTIME_CONTEXT_MAX)
        except Exception:
            continue
    return int(default)


def _stem_tokens(path):
    stem = os.path.basename(path)
    stem = re.sub(r"\.(?:gguf|safetensors|bin|pt|pth|ckpt)$", "", stem, flags=re.IGNORECASE).lower()
    stem = re.sub(r"mmproj|projector|vision", " ", stem)
    stem = re.sub(r"\b(?:q\d+(?:_[a-z0-9]+)*|f16|f32|bf16|fp16|fp8|int\d+)\b", " ", stem)
    return {
        token
        for token in re.split(r"[^a-z0-9.]+", stem)
        if len(token) > 2 and token not in {"gguf", "model", "instruct"}
    }


def is_visual_component_filename(filename):
    name = os.path.basename(str(filename or "")).lower()
    if "mmproj" in name or "projector" in name:
        return True
    return bool(re.search(r"(?<![a-z0-9])vision(?![a-z0-9])", name))


def _mmproj_precision_rank(path):
    name = os.path.basename(str(path or "")).lower()
    if re.search(r"(?<![a-z0-9])q8(?:[_-]?[a-z0-9]+)?(?=[._-]|$)", name):
        return 2
    if re.search(r"(?<![a-z0-9])(?:f16|fp16|bf16)(?=[._-]|$)", name):
        return 1
    return 0


def select_mmproj_for_model(model_path, candidates):
    candidates = sorted({os.path.abspath(path) for path in candidates}, key=str.lower)
    if len(candidates) == 1:
        return candidates[0]
    model_tokens = _stem_tokens(model_path) | _stem_tokens(os.path.dirname(model_path))
    scored = []
    for candidate in candidates:
        candidate_tokens = _stem_tokens(candidate) | _stem_tokens(os.path.dirname(candidate))
        score = len(model_tokens & candidate_tokens)
        scored.append((score, candidate))
    scored.sort(key=lambda item: (-item[0], item[1].lower()))
    if not scored or scored[0][0] <= 0:
        return None
    best_score = scored[0][0]
    best_candidates = [path for score, path in scored if score == best_score]
    if len(best_candidates) == 1:
        return best_candidates[0]
    ranked = sorted(
        best_candidates,
        key=lambda path: (-_mmproj_precision_rank(path), path.lower()),
    )
    best_rank = _mmproj_precision_rank(ranked[0])
    if best_rank > _mmproj_precision_rank(ranked[1]):
        return ranked[0]
    return None


def read_safetensors_header(path, max_header_bytes=64 * 1024 * 1024):
    with open(path, "rb") as handle:
        raw_length = handle.read(8)
        if len(raw_length) != 8:
            return {}
        header_length = struct.unpack("<Q", raw_length)[0]
        if header_length <= 0 or header_length > int(max_header_bytes):
            return {}
        raw_header = handle.read(header_length)
    try:
        data = json.loads(raw_header.decode("utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _tensor_shape(header, key):
    value = header.get(key) if isinstance(header, dict) else None
    shape = value.get("shape") if isinstance(value, dict) else None
    return tuple(int(item) for item in shape) if isinstance(shape, list) else ()


def infer_text_encoder_recipe(header, filename=""):
    keys = set(header.keys()) if isinstance(header, dict) else set()
    lower_name = str(filename or "").lower()
    if "model.visual.deepstack_merger_list.0.norm.weight" in keys:
        output_shape = _tensor_shape(header, "model.visual.merger.linear_fc2.weight")
        is_4b = bool(output_shape and output_shape[0] == 2560)
        if "krea" in lower_name:
            clip_type = "krea2"
        elif "joy" in lower_name:
            clip_type = "joyimage"
        elif "ideogram" in lower_name:
            clip_type = "ideogram4"
        elif "boogu" in lower_name:
            clip_type = "boogu"
        else:
            clip_type = "stable_diffusion"
        return {
            "architecture": "qwen3vl_4b" if is_4b else "qwen3vl_8b",
            "family": "Qwen 3 VL 4B" if is_4b else "Qwen 3 VL 8B",
            "clip_type": clip_type,
            "capabilities": ["text", "image"],
            "context_window": 32768,
        }
    if "model.language_model.layers.0.linear_attn.A_log" in keys:
        shape = _tensor_shape(header, "model.language_model.layers.0.input_layernorm.weight")
        size = {1024: "0.8B", 2560: "4B", 4096: "9B", 5120: "27B"}.get(shape[0] if shape else 0, "2B")
        has_vision = any(key.startswith("model.visual.") for key in keys)
        return {
            "architecture": f"qwen35_{size.lower()}",
            "family": f"Qwen 3.5 {size}",
            "clip_type": "stable_diffusion",
            "capabilities": ["text", "image"] if has_vision else ["text"],
            "context_window": 32768,
        }
    if "model.layers.0.post_feedforward_layernorm.weight" in keys:
        if "model.layers.59.self_attn.q_norm.weight" in keys:
            family, architecture = "Gemma 4 31B", "gemma4_31b"
        elif "model.layers.47.self_attn.q_norm.weight" in keys and "model.layers.5.self_attn.v_proj.weight" not in keys:
            family, architecture = "Gemma 4 12B", "gemma4_12b"
        elif "model.layers.41.self_attn.q_norm.weight" in keys and "model.layers.47.self_attn.q_norm.weight" not in keys:
            family, architecture = "Gemma 4 E4B", "gemma4_e4b"
        elif "model.layers.34.self_attn.q_norm.weight" in keys and "model.layers.41.self_attn.q_norm.weight" not in keys:
            family, architecture = "Gemma 4 E2B", "gemma4_e2b"
        elif "model.layers.47.self_attn.q_norm.weight" in keys:
            has_vision = any("vision" in key.lower() or "multi_modal_projector" in key.lower() for key in keys)
            return {
                "architecture": "gemma3_12b",
                "family": "Gemma 3 12B",
                "clip_type": "ltxv",
                "capabilities": ["text", "image"] if has_vision else ["text"],
                "context_window": 32768,
            }
        elif "model.layers.0.self_attn.q_norm.weight" in keys:
            has_vision = "vision_model.embeddings.patch_embedding.weight" in keys
            return {
                "architecture": "gemma3_4b_vision" if has_vision else "gemma3_4b",
                "family": "Gemma 3 4B Vision" if has_vision else "Gemma 3 4B",
                "clip_type": "lumina2",
                "capabilities": ["text", "image"] if has_vision else ["text"],
                "context_window": 32768,
            }
        else:
            return None
        has_vision = any("vision" in key.lower() or "multimodal" in key.lower() for key in keys)
        return {
            "architecture": architecture,
            "family": family,
            "clip_type": "stable_diffusion",
            "capabilities": ["text", "image"] if has_vision else ["text"],
            "context_window": 32768,
        }
    if "model.layers.0.post_attention_layernorm.weight" in keys and "model.layers.0.self_attn.q_norm.weight" in keys:
        shape = _tensor_shape(header, "model.layers.0.post_attention_layernorm.weight")
        sizes = {1024: "0.6B", 2048: "2B", 2560: "4B", 4096: "8B"}
        size = sizes.get(shape[0] if shape else 0)
        if size:
            if size == "8B" and "model.lm_head.weight" not in keys:
                return None
            return {
                "architecture": f"qwen3_{size.lower()}",
                "family": f"Qwen 3 {size}",
                "clip_type": "stable_diffusion",
                "capabilities": ["text"],
                "context_window": 32768,
            }
    return None


def _cached_text_encoder_recipe(path):
    cache_key = os.path.normcase(os.path.abspath(path))
    try:
        signature = _file_signature(path)
    except OSError:
        return None
    with _CACHE_LOCK:
        cached = _FILE_CACHE["safetensors"].get(cache_key)
        if cached and cached[0] == signature:
            return copy.deepcopy(cached[1])
    try:
        header = read_safetensors_header(path)
    except (OSError, PermissionError):
        recipe = None
    else:
        recipe = infer_text_encoder_recipe(header, os.path.basename(path))
    with _CACHE_LOCK:
        _FILE_CACHE["safetensors"][cache_key] = (signature, copy.deepcopy(recipe))
    return recipe


def _display_label(group, label):
    return f"[{group}] {label}"


def _curated_item(version, config, llm_roots, text_encoder_roots):
    backend = str(config.get("backend") or ("llamacpp" if config.get("is_llamacpp") else "transformers"))
    source_catalog = str(config.get("source_catalog") or ("LLM" if backend == "llamacpp" else "llms"))
    capabilities = list(config.get("capabilities") or (["text", "image"] if backend == "llamacpp" else ["text"]))
    resolved_files = []
    expected_files = []
    vision_available = False
    if backend == "llamacpp":
        model_name = str(config.get("model") or "")
        names = list((config.get("model_urls") or {}).keys())
        if not names and config.get("gguf_file"):
            names.append(config["gguf_file"])
        if config.get("mmproj_file") and config["mmproj_file"] not in names:
            names.append(config["mmproj_file"])
        mmproj_name = str(config.get("mmproj_file") or "").replace("\\", "/")
        for name in names:
            relative_path = os.path.join(model_name, str(name)).replace("\\", "/")
            expected_files.append(relative_path)
            found = _find_file(llm_roots, relative_path)
            if found:
                resolved_files.append(found)
                normalized_name = str(name).replace("\\", "/")
                if mmproj_name and (normalized_name == mmproj_name or normalized_name.endswith(f"/{mmproj_name}")):
                    vision_available = True
    elif backend == "comfy_textgen":
        clip_name = str(config.get("clip_name") or config.get("model_file") or config.get("model") or "")
        expected_files.append(clip_name.replace("\\", "/"))
        found = _find_file(text_encoder_roots, clip_name)
        if found:
            resolved_files.append(found)
    else:
        model_name = str(config.get("model") or "")
        model_file = str(config.get("model_file") or model_name)
        expected_files.append(os.path.join(model_name, model_file).replace("\\", "/"))
    installed = bool(expected_files) and len(resolved_files) == len(expected_files)
    group = "推荐" if config.get("recommended", True) else ("LLM/GGUF" if backend == "llamacpp" else "Text Encoder")
    label = str(config.get("label") or version)
    urls = config.get("model_urls") or ({config.get("clip_name") or config.get("model_file"): config.get("model_url")} if config.get("model_url") else {})
    if backend == "llamacpp":
        handler = str(config.get("chat_handler") or config.get("architecture") or "")
        vision_expected = bool(config["vision_expected"]) if "vision_expected" in config else bool(
            config.get("mmproj_file") or "image" in capabilities or gguf_vision_expected(handler)
        )
        vision_status = gguf_vision_status(
            handler,
            vision_available,
            vision_expected=vision_expected,
        )
    else:
        vision_expected = "image" in capabilities
        vision_available = vision_expected
        vision_status = VISION_STATUS_READY if vision_available else VISION_STATUS_TEXT_ONLY
    runtime_config = copy.deepcopy(config)
    runtime_config.update({
        "vision_expected": vision_expected,
        "vision_available": vision_available,
        "vision_status": vision_status,
    })
    return {
        "id": version,
        "label": label,
        "display_label": _display_label(group, label),
        "group": group,
        "backend": backend,
        "source_catalog": source_catalog,
        "architecture": str(config.get("architecture") or config.get("chat_handler") or ""),
        "capabilities": capabilities,
        "context_window": int(config.get("n_ctx") or 8192),
        "installed": installed,
        "downloadable": bool(urls),
        "recommended": bool(config.get("recommended", True)),
        "vision_expected": vision_expected,
        "vision_available": vision_available,
        "vision_status": vision_status,
        "expected_files": expected_files,
        "runtime_config": runtime_config,
        "aliases": list(config.get("aliases") or []),
        "resolved_files": [os.path.normcase(path) for path in resolved_files],
    }


def _scan_gguf_items(llm_roots, claimed_paths):
    rows = []
    grouped = {}
    projectors_by_root = {}
    for root, relative_path, absolute_path in _iter_model_files(llm_roots, {".gguf"}):
        grouped.setdefault(os.path.dirname(absolute_path), []).append((root, relative_path, absolute_path))
        if is_visual_component_filename(absolute_path):
            root_key = os.path.normcase(os.path.abspath(root))
            projectors_by_root.setdefault(root_key, []).append(absolute_path)
    for directory, entries in grouped.items():
        for root, relative_path, absolute_path in entries:
            if (
                is_visual_component_filename(absolute_path)
                or os.path.normcase(absolute_path) in claimed_paths
            ):
                continue
            filename = os.path.basename(absolute_path)
            metadata = {}
            detected = infer_gguf_handler(metadata, filename)
            if not detected:
                metadata = _cached_gguf_metadata(absolute_path)
                detected = infer_gguf_handler(metadata, filename)
            if not detected:
                continue
            if not metadata:
                metadata = _cached_gguf_metadata(absolute_path)
            projectors = [
                absolute
                for _, _, absolute in entries
                if is_visual_component_filename(absolute)
            ]
            if not projectors:
                model_tokens = _stem_tokens(absolute_path) | _stem_tokens(directory)
                projectors = [
                    candidate
                    for candidate in projectors_by_root.get(
                        os.path.normcase(os.path.abspath(root)), []
                    )
                    if model_tokens & _stem_tokens(os.path.dirname(candidate))
                ]
            mmproj_path = select_mmproj_for_model(absolute_path, projectors)
            mmproj_relative = os.path.relpath(mmproj_path, root).replace("\\", "/") if mmproj_path else ""
            context_window = _gguf_context_window(metadata)
            model_dir = os.path.dirname(relative_path).replace("\\", "/")
            if model_dir == ".":
                model_dir = ""
            version_id = f"llamacpp:LLM:{relative_path}"
            capabilities = ["text", "image"] if mmproj_path else ["text"]
            group = "VLM/GGUF" if mmproj_path else "LLM/GGUF"
            vision_expected = gguf_vision_expected(detected["handler"])
            vision_available = bool(mmproj_path)
            vision_status = gguf_vision_status(
                detected["handler"],
                vision_available,
                vision_expected=vision_expected,
            )
            config = {
                "model": model_dir,
                "backend": "llamacpp",
                "is_llamacpp": True,
                "chat_handler": runtime_chat_handler_name(detected["handler"], bool(mmproj_path)),
                "gguf_file": os.path.basename(relative_path),
                "model_file": relative_path,
                "mmproj_file": mmproj_relative,
                "n_ctx": min(context_window, GGUF_RUNTIME_CONTEXT_DEFAULT),
                "context_window": context_window,
                "source_catalog": "LLM",
                "capabilities": capabilities,
                "vision_expected": vision_expected,
                "vision_available": vision_available,
                "vision_status": vision_status,
                "recommended": False,
            }
            label = f"{detected['family']} · {os.path.basename(relative_path)}"
            rows.append({
                "id": version_id,
                "label": label,
                "display_label": _display_label(group, label),
                "group": group,
                "backend": "llamacpp",
                "source_catalog": "LLM",
                "architecture": detected["handler"],
                "capabilities": capabilities,
                "context_window": context_window,
                "installed": True,
                "downloadable": False,
                "recommended": False,
                "vision_expected": vision_expected,
                "vision_available": vision_available,
                "vision_status": vision_status,
                "expected_files": [relative_path] + ([mmproj_relative] if mmproj_relative else []),
                "runtime_config": config,
                "aliases": [],
                "resolved_files": [os.path.normcase(absolute_path)] + ([os.path.normcase(mmproj_path)] if mmproj_path else []),
            })
    return rows


def _scan_text_encoder_items(text_encoder_roots, claimed_paths):
    rows = []
    for _, relative_path, absolute_path in _iter_model_files(text_encoder_roots, {".safetensors"}):
        if os.path.normcase(absolute_path) in claimed_paths:
            continue
        recipe = _cached_text_encoder_recipe(absolute_path)
        if not recipe:
            continue
        if recipe.get("architecture") not in CHAT_CATALOG_TEXT_ENCODER_ARCHITECTURES:
            continue
        version_id = f"comfy:text_encoders:{relative_path}"
        capabilities = list(recipe["capabilities"])
        config = {
            "model": relative_path,
            "model_file": relative_path,
            "clip_name": relative_path,
            "clip_type": recipe["clip_type"],
            "backend": "comfy_textgen",
            "is_llamacpp": False,
            "source_catalog": "text_encoders",
            "architecture": recipe["architecture"],
            "capabilities": capabilities,
            "vision_expected": "image" in capabilities,
            "vision_available": "image" in capabilities,
            "vision_status": VISION_STATUS_READY if "image" in capabilities else VISION_STATUS_TEXT_ONLY,
            "n_ctx": int(recipe["context_window"]),
            "recommended": False,
        }
        label = f"{recipe['family']} · {os.path.basename(relative_path)}"
        rows.append({
            "id": version_id,
            "label": label,
            "display_label": _display_label("Text Encoder", label),
            "group": "Text Encoder",
            "backend": "comfy_textgen",
            "source_catalog": "text_encoders",
            "architecture": recipe["architecture"],
            "capabilities": capabilities,
            "context_window": int(recipe["context_window"]),
            "installed": True,
            "downloadable": False,
            "recommended": False,
            "vision_expected": "image" in capabilities,
            "vision_available": "image" in capabilities,
            "vision_status": VISION_STATUS_READY if "image" in capabilities else VISION_STATUS_TEXT_ONLY,
            "expected_files": [relative_path],
            "runtime_config": config,
            "aliases": [],
            "resolved_files": [os.path.normcase(absolute_path)],
        })
    return rows


def build_model_catalog(
    curated_configs,
    default_version,
    custom_version,
    llm_roots,
    text_encoder_roots,
    refresh=False,
    include_dynamic=True,
):
    llm_roots = _paths(llm_roots)
    text_encoder_roots = _paths(text_encoder_roots)
    curated_configs = curated_configs if isinstance(curated_configs, dict) else {}
    cache_key = (
        tuple(curated_configs.keys()),
        tuple(os.path.normcase(path) for path in llm_roots),
        tuple(os.path.normcase(path) for path in text_encoder_roots),
        str(default_version),
        str(custom_version),
        bool(include_dynamic),
    )
    now = time.monotonic()
    with _CACHE_LOCK:
        if not refresh and _CACHE["key"] == cache_key and now < _CACHE["expires_at"] and _CACHE["payload"]:
            return copy.deepcopy(_CACHE["payload"])

    with _BUILD_LOCK:
        with _CACHE_LOCK:
            now = time.monotonic()
            if not refresh and _CACHE["key"] == cache_key and now < _CACHE["expires_at"] and _CACHE["payload"]:
                return copy.deepcopy(_CACHE["payload"])

        items = [
            _curated_item(version, config, llm_roots, text_encoder_roots)
            for version, config in curated_configs.items()
        ]
        if include_dynamic:
            claimed_paths = {
                path
                for item in items
                for path in item.get("resolved_files") or []
            }
            items.extend(_scan_gguf_items(llm_roots, claimed_paths))
            claimed_paths.update(
                path
                for item in items
                for path in item.get("resolved_files") or []
            )
            items.extend(_scan_text_encoder_items(text_encoder_roots, claimed_paths))
        deduplicated = []
        seen_ids = set()
        for item in items:
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                continue
            seen_ids.add(item_id)
            deduplicated.append(item)
        items = deduplicated
        items.append({
            "id": custom_version,
            "label": custom_version,
            "display_label": _display_label("API", custom_version),
            "group": "API",
            "backend": "custom_api",
            "source_catalog": "custom",
            "architecture": "",
            "capabilities": ["text", "image"],
            "vision_expected": True,
            "vision_available": True,
            "vision_status": VISION_STATUS_READY,
            "context_window": 32768,
            "installed": True,
            "downloadable": False,
            "recommended": False,
            "expected_files": [],
            "runtime_config": {},
            "aliases": [],
            "resolved_files": [],
        })
        static_count = len(curated_configs)
        head = items[:static_count]
        dynamic = sorted(items[static_count:-1], key=lambda item: (item["group"], item["label"].lower(), item["id"]))
        items = head + dynamic + [items[-1]]
        public_items = []
        for item in items:
            public_item = copy.deepcopy(item)
            public_item.pop("resolved_files", None)
            public_items.append(public_item)
        payload = {
            "ok": True,
            "schema": CATALOG_SCHEMA,
            "default": default_version,
            "custom": custom_version,
            "items": public_items,
            "choices": [item["id"] for item in public_items],
            "labels": {item["id"]: item["display_label"] for item in public_items},
            "context_windows": {item["id"]: int(item["context_window"]) for item in public_items},
            "include_dynamic": bool(include_dynamic),
            "generated_at": time.time(),
        }
        with _CACHE_LOCK:
            _CACHE.update({"key": cache_key, "expires_at": now + 5.0, "payload": copy.deepcopy(payload)})
        return payload


def catalog_item(payload, version):
    target = str(version or "").strip()
    for item in (payload or {}).get("items") or []:
        if item.get("id") == target or target in (item.get("aliases") or []):
            return item
    return None
