"""Latent upscaler of Kandinsky 6.0 VSR: a 3D conv net that upscales a KVAE latent tile x2 or x4 before denoising.

Ported from kandinskylab/kandinsky-video-sr, src/kandinsky_sr/core/components/latent_upscaler/. The release bank holds
two models; tools/convert_latent_upscaler.py writes each to its own file in one layout: stem, pre blocks, a first PXS
stage (nearest x2 for the x4 model, the same convs without the resize for the x2 model's "finisher"), mid blocks, a
nearest-x2 PXS stage, post blocks and a modulated output head. Every norm is an RMSNorm modulated by the input latent.
The reference runs it under bf16 autocast: norms in float32, convolutions and the residual stream in bf16; the code
below does the same explicitly.
"""
import json
import logging

import torch
import torch.nn as nn
import torch.nn.functional as F

import comfy.model_management
import comfy.model_patcher
import comfy.ops
import comfy.utils

log = logging.getLogger("KandinskySR")
ops = comfy.ops.disable_weight_init


class Conv3d(ops.Conv3d):
    # replicate padding in time, zero padding in space (conv_ops.py:22-79); casts its input to the compute dtype
    def __init__(self, chan_in, chan_out, kernel_size, dtype=None, device=None):
        super().__init__(chan_in, chan_out, kernel_size, padding=(0, kernel_size // 2, kernel_size // 2), dtype=dtype, device=device)
        self.time_pad = kernel_size // 2
        self.compute_dtype = dtype

    def forward(self, x):
        x = x.to(self.compute_dtype)
        if self.time_pad:
            x = F.pad(x, (0, 0, 0, 0, self.time_pad, self.time_pad), mode="replicate")
        return super().forward(x)


class RMSNorm(nn.Module):
    # in float32, as bf16 autocast computes it (blocks.py:171-193)
    def __init__(self, channels, dtype=None, device=None):
        super().__init__()
        self.scale = channels ** 0.5
        self.gamma = nn.Parameter(torch.empty((channels, 1, 1, 1), dtype=dtype, device=device))

    def forward(self, x):
        x = x.float()
        return F.normalize(x, dim=1) * self.scale * comfy.ops.cast_to_input(self.gamma, x)


class ModulatedRMSNorm(nn.Module):
    # RMSNorm(x) * conv_y(zq) + conv_b(zq), zq resized to x by nearest (blocks.py:196-233)
    def __init__(self, channels, zq_channels, dtype=None, device=None):
        super().__init__()
        self.norm = RMSNorm(channels, dtype=dtype, device=device)
        self.conv_y = ops.Conv3d(zq_channels, channels, kernel_size=1, dtype=dtype, device=device)
        self.conv_b = ops.Conv3d(zq_channels, channels, kernel_size=1, dtype=dtype, device=device)

    def forward(self, x, zq):
        if zq.shape[2:] != x.shape[2:]:
            zq = F.interpolate(zq, size=x.shape[2:], mode="nearest")
        return self.norm(x) * self.conv_y(zq) + self.conv_b(zq)


class ResidualBlock(nn.Module):
    def __init__(self, in_channels, out_channels, zq_channels, dtype=None, device=None):
        super().__init__()
        kw = dict(dtype=dtype, device=device)
        self.norm1 = ModulatedRMSNorm(in_channels, zq_channels, **kw)
        self.conv1 = Conv3d(in_channels, out_channels, 3, **kw)
        self.norm2 = ModulatedRMSNorm(out_channels, zq_channels, **kw)
        self.conv2 = Conv3d(out_channels, out_channels, 3, **kw)
        self.shortcut = Conv3d(in_channels, out_channels, 1, **kw) if in_channels != out_channels else None

    def forward(self, x, zq):
        h = self.conv1(F.silu(self.norm1(x, zq)))
        h = self.conv2(F.silu(self.norm2(h, zq)))
        return (x if self.shortcut is None else self.shortcut(x)) + h


class PXSUpsample(nn.Module):
    # linear(up + spatial_conv(up)), up = nearest x2 of x, or x itself for the x2 model's finisher (upsample_ops.py:170-234)
    def __init__(self, channels, resize, dtype=None, device=None):
        super().__init__()
        self.resize = resize
        self.spatial_conv = ops.Conv3d(channels, channels, kernel_size=(1, 3, 3), padding=(0, 1, 1), dtype=dtype, device=device)
        self.linear = ops.Conv3d(channels, channels, kernel_size=1, dtype=dtype, device=device)

    def forward(self, x):
        if self.resize:
            x = F.interpolate(x, scale_factor=(1, 2, 2), mode="nearest")
        return self.linear(x + self.spatial_conv(x))


def _stack(n, block_in, block_out, zq_channels, **kw):
    return nn.ModuleList([ResidualBlock(block_in if i == 0 else block_out, block_out, zq_channels, **kw) for i in range(n)])


class LatentUpscalerModel(nn.Module):
    def __init__(self, config, dtype=None, device=None):
        super().__init__()
        kw = dict(dtype=dtype, device=device)
        c_in = config["in_channels"]
        w1, w2, w3 = config["stage_channels"]
        self.dtype = dtype
        self.input_proj = nn.ModuleList([Conv3d(c_in, w1, 3, **kw)])
        self.pre_blocks = _stack(config["num_pre_blocks"], w1, w1, c_in, **kw)
        self.upsample_1 = PXSUpsample(w1, config["scale"] == 4, **kw)
        self.mid_blocks = _stack(config["num_mid_blocks"], w1, w2, c_in, **kw)
        self.upsample_2 = PXSUpsample(w2, True, **kw)
        self.post_blocks = _stack(config["num_post_blocks"], w2, w3, c_in, **kw)
        self.output_proj = nn.Module()
        self.output_proj.norm = ModulatedRMSNorm(w3, c_in, **kw)
        self.output_proj.conv = Conv3d(w3, c_in, 3, **kw)

    def forward(self, z):
        x = self.input_proj[0](z)
        for block in self.pre_blocks:
            x = block(x, z)
        x = self.upsample_1(x)
        for block in self.mid_blocks:
            x = block(x, z)
        x = self.upsample_2(x)
        for block in self.post_blocks:
            x = block(x, z)
        return self.output_proj.conv(F.silu(self.output_proj.norm(x, z)))


class LatentUpscaler:
    """The pipeline's handle: a ModelPatcher around one upscaler (x2 or x4)."""

    def __init__(self, patcher, config):
        self.patcher = patcher
        self.config = config
        self.scale = config["scale"]

    def memory(self, raw_tile_shape):
        """Bytes upscale_tile needs beside the weights for a raw [T', 64, h, w] tile."""
        t, _, h, w = raw_tile_shape
        return upscale_memory(t, h, w, self.scale)

    def upscale_tile(self, raw_tile, scaling_factor):
        """Raw latent [T', 64, h, w] -> scaled (T', h * scale, w * scale, 64) float32 (sr_pipeline.py:414-429).
        Compute only: the caller loads the patcher first (load_models_gpu with memory), from its main thread."""
        model = self.patcher.model
        device = self.patcher.load_device
        with comfy.model_management.cuda_device_context(device):
            z = raw_tile.permute(1, 0, 2, 3).unsqueeze(0).to(device, model.dtype) * scaling_factor
            return model(z)[0].permute(1, 2, 3, 0).float()


def upscale_memory(t, h, w, scale):
    # 13.5 KB per output latent voxel measured on an RTX 3090 for both scales, plus 0.5 GB margin
    return 2**29 + 14000 * t * h * w * scale * scale


def load_latent_upscaler(path, device=None):
    """A single-file upscaler written by tools/convert_latent_upscaler.py (architecture in the metadata).

    device: the card it runs on (ComfyUI's default device when None); a second card needs its own handle.
    """
    sd, metadata = comfy.utils.load_torch_file(path, return_metadata=True)
    config = json.loads(metadata["kandinsky_sr.latent_upscaler"])
    load_device = device if device is not None else comfy.model_management.get_torch_device()
    offload_device = comfy.model_management.unet_offload_device()
    dtype = comfy.model_management.unet_dtype(load_device, supported_dtypes=[torch.bfloat16, torch.float32])
    model = LatentUpscalerModel(config, dtype=dtype, device=offload_device)
    comfy.model_management.archive_model_dtypes(model)
    # attribute access on purpose: main.py rebinds CoreModelPatcher to the dynamic patcher after imports
    patcher = comfy.model_patcher.CoreModelPatcher(model, load_device=load_device, offload_device=offload_device)
    model.load_state_dict(sd, strict=True, assign=patcher.is_dynamic())
    log.info("Kandinsky SR: latent upscaler x%d loaded (%s, %s)", config["scale"], path, dtype)
    return LatentUpscaler(patcher, config)
