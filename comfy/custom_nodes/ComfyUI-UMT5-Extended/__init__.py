"""
ComfyUI-UMT5-Extended — Wan 2.2 UMT5-XXL vocab extension loader.

Drop extended encoders in models/text_encoders/UMT5_extended/ and load them
with the normal CLIPLoader (type: wan). Stock Wan encoders keep working
without any ComfyUI config edits.
"""
from __future__ import annotations

import logging

import comfy.sd

STOCK_UMT5_VOCAB = 256384
NODE_NAME = "ComfyUI-UMT5-Extended"

_orig_load_text_encoder_state_dicts = comfy.sd.load_text_encoder_state_dicts


def _extended_vocab_from_state_dicts(state_dicts) -> int | None:
    for sd in state_dicts:
        shared = sd.get("shared.weight")
        if shared is None:
            continue
        vocab = int(shared.shape[0])
        if vocab != STOCK_UMT5_VOCAB:
            return vocab
    return None


def _patched_load_text_encoder_state_dicts(
    state_dicts=None,
    embedding_directory=None,
    clip_type=comfy.sd.CLIPType.STABLE_DIFFUSION,
    model_options=None,
    disable_dynamic=False,
    **kwargs,
):
    if state_dicts is None:
        state_dicts = []
    if model_options is None:
        model_options = {}

    vocab = _extended_vocab_from_state_dicts(state_dicts)
    if vocab is not None:
        model_options = dict(model_options)
        te_cfg = dict(model_options.get("umt5xxl_model_config", {}))
        te_cfg["vocab_size"] = vocab
        model_options["umt5xxl_model_config"] = te_cfg
        logging.info(
            "[%s] Extended UMT5 detected — vocab_size %d (stock %d)",
            NODE_NAME,
            vocab,
            STOCK_UMT5_VOCAB,
        )

    return _orig_load_text_encoder_state_dicts(
        state_dicts,
        embedding_directory=embedding_directory,
        clip_type=clip_type,
        model_options=model_options,
        disable_dynamic=disable_dynamic,
        **kwargs,
    )


comfy.sd.load_text_encoder_state_dicts = _patched_load_text_encoder_state_dicts

logging.info("[%s] Loaded — extended Wan UMT5 encoders supported", NODE_NAME)

# Init-only extension (no graph nodes) — required by ComfyUI loader.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
