import json
import logging
import os

import comfy.model_management
import comfy.model_patcher
import comfy.ops
import comfy.utils

from .model import KandinskyImageSR
from ..precision import dit_dtype

log = logging.getLogger("KandinskySR")


class _OpsConfig:
    def __init__(self, quant_config):
        self.quant_config = quant_config


class ImageSR:
    """The loaded transformer in its patcher, with the release settings read from the file's metadata."""

    def __init__(self, patcher, metadata):
        self.patcher = patcher
        self.baked_timesteps = json.loads(metadata["baked_timesteps"])
        self.default_timesteps = {int(k): v for k, v in json.loads(metadata["default_timesteps"]).items()}
        self.tile_size = int(metadata["tile_size"])
        self.overlap = float(metadata["overlap"])
        self.scaling_factor = float(metadata["vae_scaling_factor"])

    def timestep_index(self, timestep):
        for i, t in enumerate(self.baked_timesteps):
            if abs(t - timestep) <= 1e-6:
                return i
        raise ValueError(f"timestep {timestep} is not baked into this model; available: {self.baked_timesteps}")


def load(path, dtype=None, state_dict=None, metadata=None):
    """path: a converted file (tools/convert_image_sr.py). state_dict/metadata: load other weights into the same
    model (the parity tests use the original float32 modulation this way)."""
    load_device = comfy.model_management.get_torch_device()
    dtype = dit_dtype(load_device) if dtype is None else dtype
    offload_device = comfy.model_management.unet_offload_device()
    if state_dict is None:
        state_dict, metadata = comfy.utils.load_torch_file(path, return_metadata=True)
    if not metadata or metadata.get("model") != "kandinsky_image_sr_2.0":
        raise ValueError(f"{os.path.basename(path)} is not a Kandinsky ImageSR 2.0 file from tools/convert_image_sr.py")
    arch = json.loads(metadata["architecture"])
    if arch.pop("visual_cond"):
        raise ValueError("visual_cond checkpoints are not supported")
    arch.pop("baked_latent_size")

    # the norms run in float32 over bf16 weights, so the ops cast per call
    operations = comfy.ops.manual_cast
    quant_config = comfy.utils.detect_layer_quantization(state_dict, "")
    if quant_config is not None:
        operations = comfy.ops.pick_operations(dtype, dtype, load_device=load_device, model_config=_OpsConfig(quant_config))
    model = KandinskyImageSR(**arch, num_timesteps=len(json.loads(metadata["baked_timesteps"])),
                             device=offload_device, dtype=dtype, operations=operations)
    comfy.model_management.archive_model_dtypes(model)
    # attribute access on purpose: main.py rebinds CoreModelPatcher to the dynamic patcher after imports
    patcher = comfy.model_patcher.CoreModelPatcher(model, load_device=load_device, offload_device=offload_device)
    model.load_state_dict(state_dict, strict=True, assign=patcher.is_dynamic())
    log.info("Kandinsky ImageSR: loaded %s (%s, %.1f GB)", os.path.basename(path), dtype,
             sum(t.numel() * t.element_size() for t in state_dict.values()) / 2**30)
    return ImageSR(patcher, metadata)
