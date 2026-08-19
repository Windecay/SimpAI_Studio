import copy
import json
import os
import re
import struct
import threading
import time


CATALOG_SCHEMA = "simpai.vlm-model-catalog.v1"
GGUF_RUNTIME_CONTEXT_MAX = 16384
_CACHE_LOCK = threading.RLock()
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
        if isinstance(value, list) and len(value) == 1:
            value = value[0]
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


def read_gguf_metadata(path):
    result = {}
    try:
        from gguf import GGUFReader

        reader = GGUFReader(path)
        for key, field in reader.fields.items():
            lowered = str(key).lower()
            if lowered in {
                "general.architecture",
                "general.name",
                "general.basename",
                "tokenizer.chat_template",
            } or lowered.endswith((".context_length", ".block_count")):
                result[str(key)] = _gguf_value(field)
        del reader
    except Exception:
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
    if len(scored) > 1 and scored[0][0] == scored[1][0]:
        return None
    return scored[0][1]


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
    if backend == "llamacpp":
        model_name = str(config.get("model") or "")
        names = list((config.get("model_urls") or {}).keys())
        if not names and config.get("gguf_file"):
            names.append(config["gguf_file"])
        if config.get("mmproj_file") and config["mmproj_file"] not in names:
            names.append(config["mmproj_file"])
        for name in names:
            relative_path = os.path.join(model_name, str(name)).replace("\\", "/")
            expected_files.append(relative_path)
            found = _find_file(llm_roots, relative_path)
            if found:
                resolved_files.append(found)
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
        "expected_files": expected_files,
        "runtime_config": copy.deepcopy(config),
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
            metadata = _cached_gguf_metadata(absolute_path)
            detected = infer_gguf_handler(metadata, os.path.basename(absolute_path))
            if not detected:
                continue
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
            config = {
                "model": model_dir,
                "backend": "llamacpp",
                "is_llamacpp": True,
                "chat_handler": detected["handler"] if mmproj_path else "",
                "gguf_file": os.path.basename(relative_path),
                "model_file": relative_path,
                "mmproj_file": mmproj_relative,
                "n_ctx": context_window,
                "source_catalog": "LLM",
                "capabilities": capabilities,
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
    )
    now = time.monotonic()
    with _CACHE_LOCK:
        if not refresh and _CACHE["key"] == cache_key and now < _CACHE["expires_at"] and _CACHE["payload"]:
            return copy.deepcopy(_CACHE["payload"])

    items = [
        _curated_item(version, config, llm_roots, text_encoder_roots)
        for version, config in curated_configs.items()
    ]
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
