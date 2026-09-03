import os
import re


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


def remap_anima_lora_key_map(lora, to_load):
    if not _enabled():
        return to_load, 0
    if _model_block_indices(to_load) != set(range(NUM_BLOCKS_29B)):
        return to_load, 0
    if _lora_block_indices(lora) != set(range(NUM_BLOCKS_BASE)):
        return to_load, 0

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
