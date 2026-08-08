import asyncio
from functools import lru_cache
import hashlib
import logging
import os
from pathlib import Path
import re
import threading
import uuid

import torch

import comfy.model_management as model_management
import comfy.nested_tensor
from comfy.cli_args import args
from comfy_execution import cache_provider
from comfy_execution.cache_provider import CacheContext, CacheProvider, CacheValue
import comfy_version
import folder_paths


log = logging.getLogger(__name__)

CACHE_SCHEMA_VERSION = 2
DEFAULT_CACHE_SIZE_BYTES = 4 * 1024 ** 3
MODEL_FOLDERS = ("checkpoints", "text_encoders", "loras", "embeddings", "vae")
TEXT_ENCODE_NAME_MARKERS = ("textencode", "encodeprompt", "promptencode")
TEXT_ENCODE_NAME_EXCLUDES = ("loader", "saver")
EXPLICIT_TEXT_CACHE_NODE_TYPES = frozenset({
    "MiniMaxH3ImageToVideo",
    "MiniMaxH3ReferenceToVideo",
    "MiniMaxH3ReferenceToImage",
    "PainterFluxImageEdit",
    "PainterQwenImageEditPlus",
    "TextImageEncodeQwenVL",
})
_PROVIDER_ATTRIBUTE = "_simpai_text_embedding_cache_provider"


def _normalize_name(value):
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _looks_like_text_encode_node(class_type):
    normalized = _normalize_name(class_type)
    if _is_excluded_node_name(normalized):
        return False
    return any(marker in normalized for marker in TEXT_ENCODE_NAME_MARKERS)


def _is_excluded_node_name(normalized_name):
    return any(excluded in normalized_name for excluded in TEXT_ENCODE_NAME_EXCLUDES)


def _is_text_embedding_output(output_type):
    normalized = _normalize_name(getattr(output_type, "value", output_type))
    return normalized == "conditioning" or ("text" in normalized and "embed" in normalized)


def _is_allowed_text_cache_output(output_type):
    normalized = _normalize_name(getattr(output_type, "value", output_type))
    return _is_text_embedding_output(output_type) or normalized == "string"


def _has_text_encode_inputs(class_def):
    try:
        input_types = class_def.INPUT_TYPES()
    except Exception:
        return False
    if not isinstance(input_types, dict):
        return False

    has_prompt = False
    has_encoder = False
    for group_name in ("required", "optional"):
        inputs = input_types.get(group_name, {})
        if not isinstance(inputs, dict):
            continue
        for input_name, input_spec in inputs.items():
            if not isinstance(input_spec, (list, tuple)) or not input_spec:
                continue
            normalized_name = _normalize_name(input_name)
            normalized_type = _normalize_name(getattr(input_spec[0], "value", input_spec[0]))
            if normalized_type == "string" and ("text" in normalized_name or "prompt" in normalized_name):
                has_prompt = True
            if "clip" in normalized_type or ("text" in normalized_type and "encoder" in normalized_type):
                has_encoder = True
    return has_prompt and has_encoder


@lru_cache(maxsize=None)
def _is_cacheable_text_encode_node(class_type):
    normalized_name = _normalize_name(class_type)
    if _is_excluded_node_name(normalized_name):
        return False

    # SimpAINodes is imported while nodes.py is loading custom nodes, so defer
    # access to NODE_CLASS_MAPPINGS until workflow execution.
    import nodes

    class_def = nodes.NODE_CLASS_MAPPINGS.get(class_type)
    if class_def is None:
        return False
    if class_type in EXPLICIT_TEXT_CACHE_NODE_TYPES:
        return True
    try:
        return_types = getattr(class_def, "RETURN_TYPES", ())
    except Exception:
        return False
    if not isinstance(return_types, (list, tuple)):
        return False
    if not any(_is_text_embedding_output(output_type) for output_type in return_types):
        return False
    if not all(_is_allowed_text_cache_output(output_type) for output_type in return_types):
        return False
    return _looks_like_text_encode_node(class_type) or _has_text_encode_inputs(class_def)


def _default_cache_directory():
    configured = os.environ.get("SIMPAI_TEXT_EMBED_CACHE_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path(folder_paths.base_path).resolve().parent / "cache" / "text_embeddings")


def _default_cache_size_bytes():
    configured = os.environ.get("SIMPAI_TEXT_EMBED_CACHE_GB")
    if configured is None:
        return DEFAULT_CACHE_SIZE_BYTES
    try:
        return max(0, int(float(configured) * 1024 ** 3))
    except ValueError:
        log.warning("Invalid SIMPAI_TEXT_EMBED_CACHE_GB value: %s", configured)
        return DEFAULT_CACHE_SIZE_BYTES


def _model_inventory_digest():
    digest = hashlib.sha256()
    seen_roots = set()

    for folder_name in MODEL_FOLDERS:
        folder_config = folder_paths.folder_names_and_paths.get(folder_name)
        if folder_config is None:
            continue
        roots, extensions = folder_config
        for root_value in sorted(roots):
            root = Path(root_value).resolve()
            root_key = (folder_name, str(root).casefold())
            if root_key in seen_roots or not root.is_dir():
                continue
            seen_roots.add(root_key)

            for current_root, directory_names, file_names in os.walk(root):
                directory_names.sort()
                file_names.sort()
                current_path = Path(current_root)
                for file_name in file_names:
                    path = current_path / file_name
                    if extensions and path.suffix.casefold() not in extensions:
                        continue
                    try:
                        stat = path.stat()
                    except OSError:
                        continue
                    relative_path = path.relative_to(root).as_posix()
                    digest.update(folder_name.encode("utf-8"))
                    digest.update(relative_path.encode("utf-8"))
                    digest.update(str(stat.st_size).encode("ascii"))
                    digest.update(str(stat.st_mtime_ns).encode("ascii"))

    return digest.hexdigest()


def _build_cache_namespace():
    digest = hashlib.sha256()
    digest.update(f"schema={CACHE_SCHEMA_VERSION}".encode("ascii"))
    digest.update(f"comfy={comfy_version.version}".encode("utf-8"))
    digest.update(f"torch={torch.__version__}".encode("utf-8"))
    for argument_name in (
        "gpu_only",
        "fp8_e4m3fn_text_enc",
        "fp8_e5m2_text_enc",
        "fp16_text_enc",
        "bf16_text_enc",
        "fp32_text_enc",
    ):
        digest.update(f"{argument_name}={getattr(args, argument_name, None)}".encode("ascii"))
    digest.update(_model_inventory_digest().encode("ascii"))
    return digest.hexdigest()[:24]


def _pack_value(value):
    if isinstance(value, comfy.nested_tensor.NestedTensor):
        return ("nested_tensor", [_pack_value(tensor) for tensor in value.unbind()])
    if isinstance(value, torch.Tensor):
        if value.device.type == "meta":
            raise TypeError("Meta tensors cannot be cached")
        device_kind = "cpu" if value.device.type == "cpu" else "accelerator"
        tensor = value.detach().to(device="cpu", copy=True).contiguous()
        return ("tensor", device_kind, tensor)
    if value is None or isinstance(value, (bool, int, float, str, bytes)):
        return ("value", value)
    if isinstance(value, list):
        return ("list", [_pack_value(item) for item in value])
    if isinstance(value, tuple):
        return ("tuple", [_pack_value(item) for item in value])
    if isinstance(value, dict):
        return ("dict", [(_pack_value(key), _pack_value(item)) for key, item in value.items()])
    raise TypeError(f"Unsupported cache value type: {type(value).__name__}")


def _unpack_value(value):
    if not isinstance(value, (list, tuple)) or not value:
        raise ValueError("Invalid text embedding cache payload")
    value_type = value[0]
    if value_type == "nested_tensor":
        if len(value) != 2 or not isinstance(value[1], (list, tuple)):
            raise ValueError("Invalid cached nested tensor")
        tensors = [_unpack_value(item) for item in value[1]]
        if not tensors or not all(isinstance(tensor, torch.Tensor) for tensor in tensors):
            raise ValueError("Invalid cached nested tensor contents")
        return comfy.nested_tensor.NestedTensor(tensors)
    if value_type == "tensor":
        if len(value) != 3 or not isinstance(value[2], torch.Tensor):
            raise ValueError("Invalid cached tensor")
        tensor = value[2]
        if value[1] == "accelerator":
            tensor = tensor.to(model_management.get_torch_device())
        elif value[1] != "cpu":
            raise ValueError("Invalid cached tensor device")
        return tensor
    if value_type == "value":
        if len(value) != 2:
            raise ValueError("Invalid cached value")
        return value[1]
    if value_type == "list":
        return [_unpack_value(item) for item in value[1]]
    if value_type == "tuple":
        return tuple(_unpack_value(item) for item in value[1])
    if value_type == "dict":
        return {_unpack_value(key): _unpack_value(item) for key, item in value[1]}
    raise ValueError(f"Unknown text embedding cache value type: {value_type}")


class TextEmbeddingDiskCacheProvider(CacheProvider):
    def __init__(self, cache_dir=None, max_size_bytes=None, namespace=None, node_types=None):
        self.cache_dir = Path(cache_dir) if cache_dir is not None else _default_cache_directory()
        self.max_size_bytes = _default_cache_size_bytes() if max_size_bytes is None else max(0, int(max_size_bytes))
        self.namespace = namespace or _build_cache_namespace()
        self.node_types = frozenset(node_types) if node_types is not None else None
        self._size_lock = threading.Lock()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._current_size_bytes = self._measure_cache_size()

    def should_cache(self, context: CacheContext, value: CacheValue = None) -> bool:
        if self.max_size_bytes <= 0:
            return False
        if self.node_types is not None:
            return context.class_type in self.node_types
        return _is_cacheable_text_encode_node(context.class_type)

    async def on_lookup(self, context: CacheContext):
        path = self._entry_path(context)
        if not path.is_file():
            return None
        try:
            payload = await asyncio.to_thread(self._load_payload, path)
            if payload.get("class_type") != context.class_type or payload.get("cache_key_hash") != context.cache_key_hash:
                raise ValueError("Cache entry identity does not match")
            outputs = _unpack_value(payload["outputs"])
            ui = _unpack_value(payload["ui"])
        except Exception as error:
            log.warning("Ignoring invalid text embedding cache entry %s: %s", path, error)
            await asyncio.to_thread(self._remove_entry, path)
            return None

        log.info("Text embedding cache hit: %s", context.class_type)
        return CacheValue(outputs=outputs, ui=ui)

    async def on_store(self, context: CacheContext, value: CacheValue) -> None:
        try:
            payload = {
                "schema": CACHE_SCHEMA_VERSION,
                "class_type": context.class_type,
                "cache_key_hash": context.cache_key_hash,
                "outputs": _pack_value(value.outputs),
                "ui": _pack_value(value.ui),
            }
        except TypeError as error:
            log.debug("Skipping text embedding cache for %s: %s", context.class_type, error)
            return

        path = self._entry_path(context)
        await asyncio.to_thread(self._write_payload, path, payload)

    def _entry_path(self, context):
        class_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", context.class_type)[:96] or "unknown"
        cache_key_hash = context.cache_key_hash.casefold()
        if re.fullmatch(r"[0-9a-f]{64}", cache_key_hash) is None:
            cache_key_hash = hashlib.sha256(cache_key_hash.encode("utf-8")).hexdigest()
        return self.cache_dir / self.namespace / class_name / cache_key_hash[:2] / f"{cache_key_hash}.pt"

    def _load_payload(self, path):
        payload = torch.load(path, map_location="cpu", weights_only=True)
        if not isinstance(payload, dict):
            raise ValueError("Cache payload is not a dictionary")
        if payload.get("schema") != CACHE_SCHEMA_VERSION:
            raise ValueError("Cache schema does not match")
        os.utime(path, None)
        return payload

    def _write_payload(self, path, payload):
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
        try:
            torch.save(payload, temporary_path)
            new_size = temporary_path.stat().st_size
            with self._size_lock:
                try:
                    old_size = path.stat().st_size
                except OSError:
                    old_size = 0
                os.replace(temporary_path, path)
                self._current_size_bytes += new_size - old_size
                if self._current_size_bytes > self.max_size_bytes:
                    self._prune_locked()
        finally:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass

    def _remove_entry(self, path):
        with self._size_lock:
            try:
                size = path.stat().st_size
                path.unlink()
                self._current_size_bytes = max(0, self._current_size_bytes - size)
            except FileNotFoundError:
                pass

    def _measure_cache_size(self):
        total_size = 0
        for path in self.cache_dir.rglob("*.pt"):
            try:
                total_size += path.stat().st_size
            except OSError:
                continue
        return total_size

    def _prune_locked(self):
        entries = []
        total_size = 0
        for path in self.cache_dir.rglob("*.pt"):
            try:
                stat = path.stat()
            except OSError:
                continue
            entries.append((stat.st_mtime_ns, stat.st_size, path))
            total_size += stat.st_size

        if total_size <= self.max_size_bytes:
            self._current_size_bytes = total_size
            return

        entries.sort(key=lambda entry: entry[0])
        for _, size, path in entries:
            try:
                path.unlink()
            except OSError:
                continue
            total_size -= size
            if total_size <= self.max_size_bytes:
                break
        self._current_size_bytes = total_size


def register_text_embedding_cache_provider():
    existing = getattr(cache_provider, _PROVIDER_ATTRIBUTE, None)
    if existing is not None:
        return existing

    provider = TextEmbeddingDiskCacheProvider()
    cache_provider.register_cache_provider(provider)
    setattr(cache_provider, _PROVIDER_ATTRIBUTE, provider)
    log.info(
        "SimpAI text embedding disk cache enabled: %s (%.1f GiB)",
        provider.cache_dir,
        provider.max_size_bytes / 1024 ** 3,
    )
    return provider
