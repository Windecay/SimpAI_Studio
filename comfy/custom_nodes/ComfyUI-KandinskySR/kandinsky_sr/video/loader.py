"""Load the converted VSR DiT (tools/convert_vsr_dit.py) into a ModelPatcher; its settings come from the file's
metadata."""
import json
import logging
import os

import comfy.model_management
import comfy.model_patcher
import comfy.ops
import comfy.utils

from .model import KandinskyVSRDiT
from ..precision import dit_dtype

log = logging.getLogger("KandinskySR")


class _OpsConfig:
    def __init__(self, quant_config):
        self.quant_config = quant_config


class VSRDiT:
    """The DiT's patcher and the settings the pipeline reads: SR (noise, visual size, fps) and sampler."""

    def __init__(self, patcher, sr, sampler, name, dtype):
        self.patcher, self.sr, self.sampler, self.name = patcher, sr, sampler, name
        self.dtype = dtype


def load_dit(path, dtype=None, device=None):
    """device: the card it runs on (ComfyUI's default device when None); a second card needs its own copy."""
    state_dict, metadata = comfy.utils.load_torch_file(path, return_metadata=True)
    if not metadata or "architecture" not in metadata:
        raise ValueError(f"{os.path.basename(path)} has no Kandinsky VSR metadata; convert the Diffusers bundle with "
                         "tools/convert_vsr_dit.py")
    architecture = json.loads(metadata["architecture"])
    sampler = json.loads(metadata["sampler"])
    if sampler["type"] != "piflow":
        raise ValueError(f"{os.path.basename(path)}: sampler {sampler['type']} is not supported yet (pi-Flow checkpoints only)")
    load_device = device if device is not None else comfy.model_management.get_torch_device()
    dtype = dit_dtype(load_device) if dtype is None else dtype
    offload_device = comfy.model_management.unet_offload_device()
    operations = comfy.ops.manual_cast
    quant_config = comfy.utils.detect_layer_quantization(state_dict, "")
    if quant_config is not None:
        operations = comfy.ops.pick_operations(dtype, dtype, load_device=load_device, model_config=_OpsConfig(quant_config))
    attention = json.loads(metadata["attention"])
    model = KandinskyVSRDiT(**architecture, rope_scale=json.loads(metadata["rope_scale"]), attention=attention,
                            device=offload_device, dtype=dtype, operations=operations)
    comfy.model_management.archive_model_dtypes(model)
    # attribute access on purpose: main.py rebinds CoreModelPatcher to the dynamic patcher after the imports
    patcher = comfy.model_patcher.CoreModelPatcher(model, load_device=load_device, offload_device=offload_device)
    model.load_state_dict(state_dict, strict=True, assign=patcher.is_dynamic())
    log.info("Kandinsky VSR: loaded %s (%s, %s, %.2f GB)", os.path.basename(path), metadata.get("model"), dtype,
             sum(t.numel() * t.element_size() for t in state_dict.values()) / 2**30)
    return VSRDiT(patcher, json.loads(metadata["sr"]), sampler, metadata.get("model"), dtype)
