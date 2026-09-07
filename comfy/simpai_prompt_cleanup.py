"""Task-end adapters for plugin-owned caches; never change node execution."""

import logging
import sys
import time
from contextlib import contextmanager, nullcontext

import numpy as np
import psutil
import torch
import torch.nn.functional as F

from comfy_execution.graph import DynamicPrompt


_METADATA_REGISTRIES = (
    "/comfyui-lora-manager/py/metadata_collector/metadata_registry.py",
    "/comfyui-danbooru-gallery/py/metadata_collector/metadata_registry.py",
)
_PREVIEW_MAX_SIZE = 512


def _metadata_snapshot(value, memo):
    if value is None or type(value) in (str, bool, int, float):
        return value
    key = id(value)
    if key in memo:
        return memo[key]

    if isinstance(value, DynamicPrompt):
        result = DynamicPrompt({})
        memo[key] = result
        result.original_prompt = _metadata_snapshot(value.original_prompt, memo)
        result.ephemeral_prompt = _metadata_snapshot(value.ephemeral_prompt, memo)
        result.ephemeral_parents = value.ephemeral_parents.copy()
        result.ephemeral_display = value.ephemeral_display.copy()
    elif isinstance(value, dict):
        result = {}
        memo[key] = result
        for name, item in value.items():
            result[_metadata_snapshot(name, memo)] = _metadata_snapshot(item, memo)
    elif isinstance(value, (list, tuple)):
        result = []
        memo[key] = result
        result.extend(_metadata_snapshot(item, memo) for item in value)
    elif isinstance(value, np.generic):
        result = value.item()
    else:
        # Processors compare conditioning identity, not tensor contents. Unique
        # placeholders preserve these relationships without retaining payloads.
        result = object()
    memo[key] = result
    return result


def _image_preview(outputs):
    while isinstance(outputs, (list, tuple)):
        if not outputs:
            return None
        outputs = outputs[0]
    if isinstance(outputs, np.ndarray):
        outputs = torch.from_numpy(outputs)
    if not isinstance(outputs, torch.Tensor):
        return None
    while outputs.ndim > 3:
        if outputs.shape[0] == 0:
            return None
        outputs = outputs[0]
    if outputs.ndim != 3 or outputs.shape[-1] not in (1, 3, 4) or outputs.numel() == 0:
        return None

    # A slice/contiguous() alone can still own the entire video batch storage.
    image = outputs.detach().to(device="cpu", dtype=torch.float32, copy=True)
    if outputs.dtype == torch.uint8:
        image.div_(255)
    height, width = image.shape[:2]
    if max(height, width) > _PREVIEW_MAX_SIZE:
        scale = _PREVIEW_MAX_SIZE / max(height, width)
        size = (max(1, round(height * scale)), max(1, round(width * scale)))
        image = F.interpolate(
            image.movedim(-1, 0).unsqueeze(0), size=size,
            mode="bilinear", align_corners=False,
        )[0].movedim(0, -1).contiguous()
    return image


def _compact_metadata_registry(registry):
    # Danbooru uses an RLock; LoRA Manager has no registry lock.
    with getattr(registry, "_lock", nullcontext()):
        registry.clear_unused_cache()
        source = {
            name: getattr(registry, name)
            for name in ("prompt_metadata", "node_cache", "metadata", "current_prompt")
        }
        memo = {}
        metadata_entries = [
            *registry.prompt_metadata.values(), *registry.node_cache.values(),
            registry.metadata,
        ]
        for metadata in metadata_entries:
            for record in metadata.get("images", {}).values():
                if id(record) in memo:
                    continue
                snapshot = {}
                memo[id(record)] = snapshot
                for name, value in record.items():
                    snapshot[name] = (
                        _image_preview(value) if name == "image"
                        else _metadata_snapshot(value, memo)
                    )

        snapshot = _metadata_snapshot(source, memo)
        # Publish complete snapshots; leave node results and caller-owned graphs alone.
        vars(registry).update(snapshot)


def _clear_easyuse_module(module, cleared):
    # Older aliases can survive replacement of Easy-Use's cache singleton.
    for name in ("cache", "cache_count", "easyCache", "sampler"):
        obj = vars(module).get(name)
        if obj is None or id(obj) in cleared:
            continue
        cleared.add(id(obj))
        try:
            if name == "easyCache":
                for category in obj.loaded_objects.values():
                    category.clear()
            elif name == "sampler":
                for values in obj.last_helds.values():
                    values.clear()
            else:
                obj.clear()
        except Exception:
            logging.warning("Could not clear Easy-Use %s in %s", name, module.__file__, exc_info=True)


def clear_plugin_caches():
    cleared = set()
    for module in tuple(sys.modules.values()):
        module_file = getattr(module, "__file__", None)
        if not isinstance(module_file, str):
            continue
        path = module_file.lower().replace("\\", "/")
        while "//" in path:
            path = path.replace("//", "/")
        if "/comfyui-easy-use/py/" in path:
            _clear_easyuse_module(module, cleared)
        elif path.endswith(_METADATA_REGISTRIES):
            registry_class = vars(module).get("MetadataRegistry")
            registry = getattr(registry_class, "_instance", None)
            if registry is None or id(registry) in cleared:
                continue
            cleared.add(id(registry))
            try:
                _compact_metadata_registry(registry)
            except Exception:
                # Plugin upgrades must not prevent other cleanup or lose a result.
                logging.warning("Could not compact metadata in %s", module_file, exc_info=True)


def _process_memory():
    try:
        info = psutil.Process().memory_info()
        return getattr(info, "private", None), info.rss
    except (psutil.Error, OSError):
        return None


@contextmanager
def log_cleanup_memory(prompt_id):
    before = _process_memory()
    started = time.monotonic()
    try:
        yield
    finally:
        after = _process_memory()
        if before is not None and after is not None:
            gib = 1024 ** 3
            private = (
                "private %.2f -> %.2f GiB; " % (before[0] / gib, after[0] / gib)
                if before[0] is not None and after[0] is not None else ""
            )
            logging.info(
                "[Cache clear] prompt=%s RAM %sworking_set %.2f -> %.2f GiB; %.2fs",
                prompt_id, private, before[1] / gib, after[1] / gib,
                time.monotonic() - started,
            )
