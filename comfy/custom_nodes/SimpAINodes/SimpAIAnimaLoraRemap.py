"""Automatically align 28-block Anima LoRAs with Anima-2.9B."""

import logging
import os
import re

import comfy.lora


LOG_PREFIX = "[Anima 2.9B LoRA Patch]"

# The 2.9B expansion inserted these 12 blocks into the original 28-block layout.
INSERTED_BLOCKS = (2, 5, 8, 11, 14, 17, 21, 24, 27, 30, 33, 36)
NUM_BLOCKS_29B = 40
NUM_BLOCKS_BASE = 28

MODEL_BLOCK_RE = re.compile(r"^(diffusion_model\.blocks\.)(\d+)(\..*)$")
LORA_BLOCK_RES = (
    re.compile(r"^lora_unet_(?:net_)?blocks_(\d+)_"),
    re.compile(r"^(?:diffusion_model\.)?blocks\.(\d+)\."),
    re.compile(r"^net\.blocks\.(\d+)\."),
)


def _build_block_map():
    kept = [index for index in range(NUM_BLOCKS_29B) if index not in INSERTED_BLOCKS]
    return {base_index: target_index for base_index, target_index in enumerate(kept)}


BASE_TO_29B = _build_block_map()


def _enabled():
    return os.environ.get("ANIMA_LORA_REMAP", "1").strip().lower() not in {
        "0",
        "off",
        "false",
        "no",
    }


def _model_block_indices(to_load):
    indices = set()
    for value in to_load.values():
        if not isinstance(value, str):
            continue
        match = MODEL_BLOCK_RE.match(value)
        if match:
            indices.add(int(match.group(2)))
    return indices


def _lora_block_indices(lora):
    indices = set()
    for key in lora.keys():
        if not isinstance(key, str):
            continue
        for pattern in LORA_BLOCK_RES:
            match = pattern.match(key)
            if match:
                indices.add(int(match.group(1)))
                break
    return indices


def _is_anima(to_load):
    return any(
        isinstance(value, str) and value.startswith("diffusion_model.llm_adapter.")
        for value in to_load.values()
    )


def _needs_remap(lora, to_load):
    if not _enabled() or not _is_anima(to_load):
        return False
    if _model_block_indices(to_load) != set(range(NUM_BLOCKS_29B)):
        return False
    return _lora_block_indices(lora) == set(range(NUM_BLOCKS_BASE))


def _remap_key_map(to_load):
    remapped = {}
    changed = 0
    for lora_key, model_key in to_load.items():
        match = MODEL_BLOCK_RE.match(model_key) if isinstance(model_key, str) else None
        if match is None:
            remapped[lora_key] = model_key
            continue

        base_index = int(match.group(2))
        target_index = BASE_TO_29B.get(base_index)
        if target_index is None:
            continue

        remapped[lora_key] = "{}{}{}".format(
            match.group(1),
            target_index,
            match.group(3),
        )
        if target_index != base_index:
            changed += 1
    return remapped, changed


_ORIGINAL_LOAD_LORA = getattr(comfy.lora, "load_lora", None)


def patched_load_lora(lora, to_load, *args, **kwargs):
    if _needs_remap(lora, to_load):
        to_load, changed = _remap_key_map(to_load)
        logging.info(
            "{} 28-block LoRA on 40-block Anima-2.9B: remapped {} target keys.".format(
                LOG_PREFIX,
                changed,
            )
        )
    return _ORIGINAL_LOAD_LORA(lora, to_load, *args, **kwargs)


patched_load_lora._anima29b_lora_patch = True

if _ORIGINAL_LOAD_LORA is None:
    logging.warning("{} comfy.lora.load_lora is unavailable; patch not installed.".format(LOG_PREFIX))
elif getattr(_ORIGINAL_LOAD_LORA, "_anima29b_lora_patch", False):
    logging.info("{} already installed; skipping.".format(LOG_PREFIX))
else:
    comfy.lora.load_lora = patched_load_lora
    logging.info(
        "{} installed (base block map: {}). Set ANIMA_LORA_REMAP=0 to disable.".format(
            LOG_PREFIX,
            [BASE_TO_29B[index] for index in range(6)],
        )
    )


# This is a startup-only patch; it intentionally adds no workflow node.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
