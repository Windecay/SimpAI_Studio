"""Kandinsky ImageSR 2.0 transformer: the Kandinsky 5 visual DiT whose text tower and cross-attention are replaced by
per-timestep tables (time_embed_table, one xattn_bias_table per block). Built from ComfyUI's Kandinsky 5 layers with
the reference's numerics: norms, modulated norms and residual sums in float32 and cast back, the rest in the compute
dtype. The modulation linears run in the compute dtype on a float32 silu, as under the reference's bf16 autocast."""
import math

import torch
from torch import nn

import comfy.model_management
import comfy.model_prefetch
from comfy.ldm.kandinsky5 import model as k5
from comfy.ldm.modules.attention import AttentionTensorContainer

from ..kernels import fused

RMS_EPS = torch.finfo(torch.float32).eps  # RMSNorm(eps=None) on float32 input


def modulated_norm(norm, x, shift, scale):
    return (norm(x.float()) * (scale.float() + 1.0) + shift.float()).type_as(x)


def modulation(mod, time_embed, dtype):
    # the reference's bf16 autocast: silu in float32, the linear in the compute dtype
    return mod.out_layer(mod.activation(time_embed).to(dtype))


def gated_sum(x, out, gate):
    return (x.float() + gate.float() * out.float()).type_as(x)


def rope(x, freqs):
    # the reference's rotation: two products summed in float32 (ck.apply_rope1 fuses them and rounds differently)
    return (freqs * x.float().unflatten(-1, (-1, 1, 2))).sum(-1).flatten(-2).type_as(x)


class SelfAttention(k5.SelfAttention):
    def _compute_qk(self, x, freqs, proj_fn, norm_fn):
        result = proj_fn(x).view(*x.shape[:-1], self.num_heads, -1)
        return rope(norm_fn(result.float()).type_as(result), freqs)

    def forward_fused(self, x, freqs, transformer_options={}):
        """The same attention with q/k RMSNorm and RoPE in one kernel (kernels=fast)."""
        heads = self.num_heads
        wq = comfy.model_management.cast_to(self.query_norm.weight, dtype=torch.float32, device=x.device)
        wk = comfy.model_management.cast_to(self.key_norm.weight, dtype=torch.float32, device=x.device)
        q = fused.rms_rope(self.to_query(x).view(*x.shape[:-1], heads, -1), wq, freqs, RMS_EPS)
        k = fused.rms_rope(self.to_key(x).view(*x.shape[:-1], heads, -1), wk, freqs, RMS_EPS)
        v = self.to_value(x).view(*x.shape[:-1], heads, -1)
        q, k, v = AttentionTensorContainer(q), AttentionTensorContainer(k), AttentionTensorContainer(v)
        return self.out_layer(k5.attention(q, k, v, heads, preferred_attention=self.comfy_attention, transformer_options=transformer_options))


class Block(nn.Module):
    def __init__(self, model_dim, time_dim, ff_dim, head_dim, num_timesteps, operation_settings):
        super().__init__()
        operations, device, dtype = (operation_settings.get(k) for k in ("operations", "device", "dtype"))
        self.visual_modulation = k5.Modulation(time_dim, model_dim, 9, operation_settings=operation_settings)
        self.self_attention_norm = operations.LayerNorm(model_dim, elementwise_affine=False, device=device, dtype=dtype)
        self.self_attention = SelfAttention(model_dim, head_dim, operation_settings=operation_settings)
        self.feed_forward_norm = operations.LayerNorm(model_dim, elementwise_affine=False, device=device, dtype=dtype)
        self.feed_forward = k5.FeedForward(model_dim, ff_dim, operation_settings=operation_settings)
        self.xattn_bias_table = nn.Parameter(torch.empty(num_timesteps, model_dim, device=device, dtype=torch.float32), requires_grad=False)

    def forward(self, x, time_embed, freqs, t_index, fast=False, transformer_options={}):
        attn, _, ff = modulation(self.visual_modulation, time_embed, x.dtype).unsqueeze(1).chunk(3, dim=-1)
        shift, scale, gate = attn.chunk(3, dim=-1)
        ff_shift, ff_scale, ff_gate = ff.chunk(3, dim=-1)
        bias = comfy.model_management.cast_to(self.xattn_bias_table[t_index], dtype=torch.float32, device=x.device)
        if fast:  # the same arithmetic in fused kernels; the float32 reductions of the norms run in another order
            out = self.self_attention.forward_fused(fused.adaln(x, shift, scale, x.dtype), freqs, transformer_options=transformer_options)
            x, out = fused.residual_adaln(x, gate, out, ff_shift, ff_scale, x.dtype, bias=bias)
            return gated_sum(x, self.feed_forward(out), ff_gate)
        out = self.self_attention(modulated_norm(self.self_attention_norm, x, shift, scale), freqs, transformer_options=transformer_options)
        x = gated_sum(x, out, gate)
        x = (x.float() + bias).type_as(x)
        out = self.feed_forward(modulated_norm(self.feed_forward_norm, x, ff_shift, ff_scale))
        return gated_sum(x, out, ff_gate)


class OutLayer(k5.OutLayer):
    def forward(self, x, time_embed, grid):
        shift, scale = modulation(self.modulation, time_embed, x.dtype).unsqueeze(1).chunk(2, dim=-1)
        x = self.out_layer(modulated_norm(self.norm, x, shift, scale))
        B, (H, W), (ph, pw) = x.shape[0], grid, self.patch_size[1:]
        return x.view(B, H, W, -1, ph, pw).permute(0, 3, 1, 4, 2, 5).reshape(B, -1, H * ph, W * pw)


def rope_freqs(axes_dims, grid, device):
    """The reference's 3D RoPE (Kandinsky5RoPE3D, one frame) as rotation matrices [1, h*w, 1, head_dim/2, 2, 2]."""
    h, w = grid
    args = []
    for axis, (dim, n) in enumerate(zip(axes_dims, (1, h, w))):
        # the reference builds its frequencies on the CPU: exp differs there in the last bit
        freq = torch.exp(-math.log(10000.0) * torch.arange(dim // 2, dtype=torch.float32) / (dim // 2)).to(device)
        a = torch.outer(torch.arange(n, dtype=torch.float32, device=device), freq)
        shape = [1, 1, 1, dim // 2]
        shape[axis] = n
        args.append(a.view(shape).expand(1, h, w, dim // 2))
    args = torch.cat(args, dim=-1).reshape(1, h * w, 1, -1)
    cos, sin = torch.cos(args), torch.sin(args)
    return torch.stack([cos, -sin, sin, cos], dim=-1).view(*args.shape, 2, 2)


class KandinskyImageSR(nn.Module):
    def __init__(self, in_visual_dim=16, out_visual_dim=16, time_dim=512, patch_size=(1, 2, 2), model_dim=2560, ff_dim=10240,
                 num_visual_blocks=50, axes_dims=(32, 48, 48), num_timesteps=19, device=None, dtype=None, operations=None):
        super().__init__()
        operation_settings = {"operations": operations, "device": device, "dtype": dtype}
        self.patch_size = tuple(patch_size)
        self.axes_dims = tuple(axes_dims)
        self.dtype = dtype
        self.visual_embeddings = k5.VisualEmbeddings(math.prod(patch_size) * in_visual_dim, model_dim, self.patch_size, operation_settings=operation_settings)
        self.visual_transformer_blocks = nn.ModuleList(
            [Block(model_dim, time_dim, ff_dim, sum(axes_dims), num_timesteps, operation_settings) for _ in range(num_visual_blocks)])
        self.out_layer = OutLayer(model_dim, time_dim, out_visual_dim, self.patch_size, operation_settings=operation_settings)
        self.time_embed_table = nn.Parameter(torch.empty(num_timesteps, time_dim, device=device, dtype=torch.float32), requires_grad=False)

    def forward(self, x, t_index, fast=False, transformer_options={}):
        """x: scaled latents [B, 16, H, W] in the compute dtype; t_index: row of the baked timestep tables; fast: the
        fused kernels of kandinsky_sr/kernels/fused.py (CUDA and Triton only). Returns the flow prediction
        [B, 16, H, W] in the compute dtype."""
        B, _, H, W = x.shape
        grid = (H // self.patch_size[1], W // self.patch_size[2])
        time_embed = comfy.model_management.cast_to(self.time_embed_table[t_index], dtype=torch.float32, device=x.device).expand(B, -1)
        freqs = rope_freqs(self.axes_dims, grid, x.device)
        x = self.visual_embeddings(x.unsqueeze(2)).flatten(1, 3)

        blocks = self.visual_transformer_blocks
        prefetch_queue = comfy.model_prefetch.make_prefetch_queue(list(blocks), x.device, transformer_options)
        for i, block in enumerate(blocks):
            comfy.model_prefetch.prefetch_queue_pop(prefetch_queue, x.device, block, x.dtype)
            transformer_options["block_index"] = i
            x = block(x, time_embed, freqs, t_index, fast, transformer_options=transformer_options)
        comfy.model_prefetch.prefetch_queue_pop(prefetch_queue, x.device, None)
        return self.out_layer(x, time_embed, grid)
