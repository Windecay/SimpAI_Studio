"""Kandinsky 6.0 VSR DiT: the text-free Kandinsky 5 visual transformer with a pi-Flow multi-grid output head.

Parameter names are those of the released transformer (Diffusers bundle `transformer/`), so the converted file loads
without a key map. Numerics follow the reference (kandinsky_sr/core/components/model/dit.py, nn.py), which runs fp32
weights under bf16 autocast: the time embedding, the AdaLN modulation, the layer norms, the q/k RMSNorm, RoPE and the
residual stream are float32; projections, attention and the feed-forward run in the compute dtype (the dtype of the
input). The time embedding, the modulation and the q/k norms keep the release's float32 weights.
"""
import math

import torch
import torch.nn.functional as F
from torch import nn

import comfy.model_management
import comfy.model_prefetch
from comfy.ldm.flux.math import apply_rope1
from comfy.ldm.kandinsky5.model import attention as dense_attention
from comfy.ldm.modules.attention import ComfyAttention

from ..kernels import fused
from . import nabla

RMS_EPS = torch.finfo(torch.float32).eps  # nn.RMSNorm(eps=None) on float32 input


def get_freqs(dim, max_period=10000.0):
    return torch.exp(-math.log(max_period) * torch.arange(start=0, end=dim, dtype=torch.float32) / dim)


class TimestepEmbedder(nn.Module):
    def __init__(self, model_dim, time_dim, operations, device):
        super().__init__()
        self.linear_1 = operations.Linear(model_dim, time_dim, device=device, dtype=torch.float32)
        self.linear_2 = operations.Linear(time_dim, time_dim, device=device, dtype=torch.float32)


class TimeEmbeddings(nn.Module):
    def __init__(self, model_dim, time_dim, operations, device):
        super().__init__()
        self.register_buffer("freqs", get_freqs(model_dim // 2), persistent=False)
        self.timestep_embedder = TimestepEmbedder(model_dim, time_dim, operations, device)

    def forward(self, time):
        args = torch.outer(time.float(), self.freqs.to(time.device))
        embed = torch.cat([torch.cos(args), torch.sin(args)], dim=-1)
        return self.timestep_embedder.linear_2(F.silu(self.timestep_embedder.linear_1(embed)))


class Modulation(nn.Module):
    def __init__(self, time_dim, model_dim, num_params, operations, device):
        super().__init__()
        self.out_layer = operations.Linear(time_dim, num_params * model_dim, device=device, dtype=torch.float32)

    def forward(self, time_embed):
        return self.out_layer(F.silu(time_embed)).unsqueeze(1)


class SelfAttention(nn.Module):
    def __init__(self, dim, head_dim, operations, device, dtype):
        super().__init__()
        self.num_heads = dim // head_dim
        self.comfy_attention = ComfyAttention()
        self.to_query = operations.Linear(dim, dim, device=device, dtype=dtype)
        self.to_key = operations.Linear(dim, dim, device=device, dtype=dtype)
        self.to_value = operations.Linear(dim, dim, device=device, dtype=dtype)
        self.query_norm = operations.RMSNorm(head_dim, device=device, dtype=torch.float32)
        self.key_norm = operations.RMSNorm(head_dim, device=device, dtype=torch.float32)
        self.out_layer = operations.Linear(dim, dim, device=device, dtype=dtype)

    def forward(self, x, rope, grid, kernels, transformer_options):
        heads = self.num_heads
        if kernels == "fast":  # RMSNorm and RoPE in one kernel; the float32 norm reduction runs in another order
            wq = comfy.model_management.cast_to(self.query_norm.weight, torch.float32, x.device)
            wk = comfy.model_management.cast_to(self.key_norm.weight, torch.float32, x.device)
            q = fused.rms_rope(self.to_query(x).unflatten(-1, (heads, -1)), wq, rope, RMS_EPS)
            k = fused.rms_rope(self.to_key(x).unflatten(-1, (heads, -1)), wk, rope, RMS_EPS)
        else:
            # fp32 RMSNorm, rounded to the compute dtype, then RoPE in fp32 and rounded again (nn.py:703, 945)
            q = apply_rope1(self.query_norm(self.to_query(x).unflatten(-1, (heads, -1)).float()).to(x.dtype), rope)
            k = apply_rope1(self.key_norm(self.to_key(x).unflatten(-1, (heads, -1)).float()).to(x.dtype), rope)
        v = self.to_value(x).unflatten(-1, (heads, -1))
        if grid is None:
            out = dense_attention(q, k, v, heads, transformer_options=transformer_options, preferred_attention=self.comfy_attention)
        else:
            out = nabla.attention(q, k, v, grid, kernels)
        return self.out_layer(out)


class GELUProjection(nn.Module):
    def __init__(self, dim, ff_dim, operations, device, dtype):
        super().__init__()
        self.proj = operations.Linear(dim, ff_dim, bias=False, device=device, dtype=dtype)


class FeedForward(nn.Module):
    def __init__(self, dim, ff_dim, operations, device, dtype):
        super().__init__()
        # net.1 is the reference's Dropout(0.0); kept as a slot so the checkpoint's net.2 keeps its index
        self.net = nn.ModuleList([GELUProjection(dim, ff_dim, operations, device, dtype), nn.Identity(),
                                  operations.Linear(ff_dim, dim, bias=False, device=device, dtype=dtype)])

    def forward(self, x):
        return self.net[2](F.gelu(self.net[0].proj(x)))


class TransformerBlock(nn.Module):
    def __init__(self, model_dim, time_dim, ff_dim, head_dim, operations, device, dtype):
        super().__init__()
        self.visual_modulation = Modulation(time_dim, model_dim, 6, operations, device)
        self.self_attention_norm = operations.LayerNorm(model_dim, elementwise_affine=False)
        self.self_attention = SelfAttention(model_dim, head_dim, operations, device, dtype)
        self.feed_forward_norm = operations.LayerNorm(model_dim, elementwise_affine=False)
        self.feed_forward = FeedForward(model_dim, ff_dim, operations, device, dtype)

    def forward(self, x, time_embed, rope, grid, dtype, kernels, transformer_options):
        """x: (B, S, D) float32 residual stream."""
        shift, scale, gate, ff_shift, ff_scale, ff_gate = self.visual_modulation(time_embed).chunk(6, dim=-1)
        if kernels == "fast":  # the same arithmetic in fused kernels; the norm reductions run in another order
            out = self.self_attention(fused.adaln(x, shift, scale, dtype), rope, grid, kernels, transformer_options)
            x, out = fused.residual_adaln(x, gate, out, ff_shift, ff_scale, dtype)
            return torch.addcmul(x, ff_gate, self.feed_forward(out))
        out = torch.addcmul(shift, self.self_attention_norm(x), scale + 1.0).to(dtype)
        x = torch.addcmul(x, gate, self.self_attention(out, rope, grid, kernels, transformer_options))
        out = torch.addcmul(ff_shift, self.feed_forward_norm(x), ff_scale + 1.0).to(dtype)
        return torch.addcmul(x, ff_gate, self.feed_forward(out))


class VisualEmbeddings(nn.Module):
    def __init__(self, visual_dim, model_dim, operations, device, dtype):
        super().__init__()
        self.in_layer = operations.Linear(visual_dim, model_dim, device=device, dtype=dtype)


class OutLayer(nn.Module):
    def __init__(self, model_dim, time_dim, out_dim, operations, device, dtype):
        super().__init__()
        self.modulation = Modulation(time_dim, model_dim, 2, operations, device)
        self.norm = operations.LayerNorm(model_dim, elementwise_affine=False)
        self.out_layer = operations.Linear(model_dim, out_dim, device=device, dtype=dtype)


class KandinskyVSRDiT(nn.Module):
    """Patch (1, 1, 1): one token per latent pixel. forward takes the model input (B, T, H, W, 2C + 1) channels last
    in the compute dtype and a timestep (B,) on the reference's t * 1000 scale, and returns (B, T, H, W, n_grid * C):
    channel g * C + c of the output is grid point g of channel c."""

    def __init__(self, in_visual_dim=64, n_grid=10, time_dim=512, model_dim=1792, ff_dim=7168,
                 num_visual_blocks=32, axes_dims=(16, 24, 24), rope_scale=(1.0, 2.0, 2.0), attention=None,
                 device=None, dtype=None, operations=None):
        super().__init__()
        head_dim = sum(axes_dims)
        self.axes_dims = tuple(axes_dims)
        self.rope_scale = tuple(rope_scale)
        self.attention = attention  # NABLA settings (P, wT, wH, wW, add_sta); None = dense
        self.time_embeddings = TimeEmbeddings(model_dim, time_dim, operations, device)
        # the learned constant that replaced the pooled text embedding of the text model (dit.py:483)
        self.pooled_bias = nn.Parameter(torch.empty(time_dim, device=device, dtype=dtype))
        self.visual_embeddings = VisualEmbeddings(2 * in_visual_dim + 1, model_dim, operations, device, dtype)
        self.visual_transformer_blocks = nn.ModuleList([
            TransformerBlock(model_dim, time_dim, ff_dim, head_dim, operations, device, dtype)
            for _ in range(num_visual_blocks)])
        self.out_layer = OutLayer(model_dim, time_dim, in_visual_dim * n_grid, operations, device, dtype)

    def rope(self, t, h, w, device):
        """RoPE3D of nn.py:481: per-axis angles pos * freq / scale in fp32, as (1, T*H*W, 1, head_dim/2, 2, 2) in
        raster order."""
        args = []
        for size, axis_dim, scale, view in zip((t, h, w), self.axes_dims, self.rope_scale, ((t, 1, 1), (1, h, 1), (1, 1, w))):
            freqs = get_freqs(axis_dim // 2).to(device)
            angles = torch.outer(torch.arange(size, device=device, dtype=torch.float32), freqs) / scale
            args.append(angles.view(*view, -1).expand(t, h, w, -1))
        args = torch.cat(args, dim=-1)
        cos, sin = torch.cos(args), torch.sin(args)
        return torch.stack([cos, -sin, sin, cos], dim=-1).view(1, t * h * w, 1, -1, 2, 2)

    def forward(self, x, timestep, kernels=None, transformer_options={}):
        """kernels: None (plain torch), "exact" (the Triton NABLA kernel, the reference's arithmetic) or "fast" (its
        float16 P V and the fused norm kernels); the caller checks kernels.nabla.available for the device."""
        dtype = x.dtype
        b, t, h, w, _ = x.shape
        time_embed = self.time_embeddings(timestep) + comfy.model_management.cast_to(self.pooled_bias, torch.float32, x.device)
        visual = self.visual_embeddings.in_layer(x).flatten(1, 3)
        rope = self.rope(t, h, w, x.device)
        grid = None
        if self.attention is not None:
            grid = nabla.Grid(t, h, w, **self.attention)
            visual, rope = nabla.to_blocks(visual, grid), nabla.to_blocks(rope, grid)
        visual = visual.float()
        blocks = self.visual_transformer_blocks
        prefetch_queue = comfy.model_prefetch.make_prefetch_queue(list(blocks), x.device, transformer_options)
        for block in blocks:
            comfy.model_prefetch.prefetch_queue_pop(prefetch_queue, x.device, block, dtype)
            visual = block(visual, time_embed, rope, grid, dtype, kernels, transformer_options)
        comfy.model_prefetch.prefetch_queue_pop(prefetch_queue, x.device, None)
        if grid is not None:
            visual = nabla.from_blocks(visual, grid)
        shift, scale = self.out_layer.modulation(time_embed).chunk(2, dim=-1)
        visual = torch.addcmul(shift, self.out_layer.norm(visual), scale + 1.0).to(dtype)
        return self.out_layer.out_layer(visual).view(b, t, h, w, -1)
