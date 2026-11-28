"""KVAE-3D-2.0 t4s16: the causal video VAE of Kandinsky 6.0 VSR (64 latent channels, 16x spatial, 4x temporal).

Ported from the reference's cached model (kandinskylab/kandinsky-video-sr,
src/kandinsky_sr/core/components/video_kvae/). Clips are encoded and decoded in temporal segments; the causal state of
each segment lives in a dict created by the top-level call and passed down, keyed by module. The reference encodes in
plain bf16 and decodes under bf16 autocast, which keeps the decoder's norms and residual stream in float32 while its
convolutions run in bf16: the decoder below does the same explicitly.
"""
import json
import logging
import math

import torch
import torch.nn as nn
import torch.nn.functional as F
import comfy_kitchen as ck

import comfy.model_management
import comfy.model_patcher
import comfy.ops
import comfy.utils

from ..kernels.conv_norm import spatial_norm_silu

log = logging.getLogger("KandinskySR")
ops = comfy.ops.disable_weight_init
CL = torch.channels_last_3d


# fast decoder path (kernels="fast"): float16 activations in channels-last layout, convolutions on pre-padded buffers
# with float16 accumulation (comfy-kitchen) and the residual in their epilogue, norms fused (kernels/conv_norm.py).
# The weights are cast to float16 once per decode call and kept in that call's cache dict under "w16", a dict the
# per-piece caches of a spatially split decode share.

def _split(conv, device):
    # the kitchen declines 3x3x3 convs over 1024 or more channels and cuDNN runs them at half its rate; their
    # (1,3,3) partials over one temporal tap and up to 1024 channels run at the kitchen's full rate
    return device.type == "cuda" and conv.kernel_size == (3, 3, 3) and conv.in_channels >= 1024


def _fp16_params(conv, cache, device):
    w16 = cache.setdefault("w16", {})
    if conv not in w16:
        w, b, stream = comfy.ops.cast_bias_weight(conv, dtype=torch.float16, device=device, bias_dtype=torch.float16, offloadable=True)
        if _split(conv, device):
            groups = math.ceil(conv.in_channels / 1024)
            c = conv.in_channels // groups
            w16[conv] = ([w[:, g * c:(g + 1) * c, tap:tap + 1].clone(memory_format=CL) for tap in range(3) for g in range(groups)],
                         None if b is None else b.clone())
        else:
            w16[conv] = (w.clone(memory_format=CL), None if b is None else b.clone())
        comfy.ops.uncast_bias_weight(conv, w, b, stream)
    return w16[conv]


def _conv16(conv, x, cache, residual=None):
    # x float16 and already padded: the conv itself pads nothing
    w, b = _fp16_params(conv, cache, x.device)
    if isinstance(w, list):
        # split conv (_split): partial convs over frame-shifted views and channel groups, summed in the epilogue
        t = x.shape[2] - 2
        groups = len(w) // 3
        c = x.shape[1] // groups
        out = residual
        for i, piece in enumerate(w):
            tap, g = divmod(i, groups)
            out = ck.fp16_conv3d(x[:, g * c:(g + 1) * c, tap:tap + t], piece, b if i == 0 else None, out, 1)
        return out
    # the kitchen kernel is 2-6x slower than cuDNN's on the 16-channel full-resolution convs (measured on both cards)
    if x.is_cuda and conv.out_channels > 16:
        return ck.fp16_conv3d(x, w, b, residual, conv.stride)
    out = F.conv3d(x, w, b, conv.stride)
    return out if residual is None else out.add_(residual)


def _padded(c, t, h, w, tp, p, device):
    # float16 NDHWC buffer for a conv input of t frames h x w: tp halo frames in front, zero spatial border p
    buf = torch.empty((1, c, t + tp, h + 2 * p, w + 2 * p), dtype=torch.float16, device=device, memory_format=CL)
    if p:
        for border in (buf[:, :, :, :p], buf[:, :, :, -p:], buf[:, :, :, :, :p], buf[:, :, :, :, -p:]):
            border.zero_()
    return buf, buf[:, :, tp:, p:p + h, p:p + w]


def _conv(conv, x, cache):
    # exact path: the module's own conv call with its weights cast once per decode/encode call and kept in the call's
    # cache; under dynamic VRAM a staged weight can be evicted by the activations and streamed again every segment
    held = cache.setdefault("w", {})
    if conv not in held:
        weight, bias, stream = comfy.ops.cast_bias_weight(conv, x, offloadable=True)
        # a resident parameter is held as it is; a cast or a staged (evictable) weight is copied
        held[conv] = (weight if weight is conv.weight else weight.clone(), bias if bias is None or bias is conv.bias else bias.clone())
        comfy.ops.uncast_bias_weight(conv, weight, bias, stream)
    return conv._conv_forward(x, *held[conv])


class CausalConv3d(nn.Module):
    # zero spatial padding, causal temporal padding seeded with copies of the first frame; segment state in `cache`
    def __init__(self, chan_in, chan_out, kernel_size, stride=(1, 1, 1), dtype=None, device=None):
        super().__init__()
        kernel_size = (kernel_size,) * 3 if isinstance(kernel_size, int) else kernel_size
        self.time_kernel = kernel_size[0]
        self.time_pad = kernel_size[0] - 1
        self.spatial_pad = kernel_size[1] // 2
        self.t_stride = stride[0]
        self.dtype = dtype
        self.conv = ops.Conv3d(chan_in, chan_out, kernel_size, stride=stride, dtype=dtype, device=device)

    def forward(self, x, cache):
        t_out = (x.shape[2] + 1) // 2 if self.t_stride == 2 else x.shape[2]
        out = torch.empty((x.shape[0], self.conv.out_channels, t_out, *x.shape[3:]), dtype=x.dtype, device=x.device)
        p = self.spatial_pad
        if p:
            x = F.pad(x, (p, p, p, p, 0, 0))
        padding = cache.get(self)
        if padding is None:
            padding = x[:, :, :1].expand(-1, -1, self.time_pad, -1, -1)
        # the frames that read the padding go through their own conv call, as in the reference
        offset_out = math.ceil(padding.shape[2] / self.t_stride)
        offset_in = offset_out * self.t_stride - padding.shape[2]
        if offset_out > 0:
            head = torch.cat([padding, x[:, :, :offset_in + self.time_kernel - self.t_stride]], dim=2)
            out[:, :, :offset_out] = _conv(self.conv, head.to(self.dtype), cache)
        if offset_out < t_out:
            out[:, :, offset_out:] = _conv(self.conv, x[:, :, offset_in:].to(self.dtype), cache)
        pad_offset = offset_in + self.t_stride * math.trunc((x.shape[2] - offset_in - self.time_kernel) / self.t_stride) + self.t_stride
        if pad_offset < 0:
            cache[self] = torch.cat([padding[:, :, pad_offset:], x], dim=2)
        else:
            cache[self] = x[:, :, pad_offset:].clone()
        return out


    def buffer(self, c, t, h, w, device):
        return _padded(c, t, h, w, self.time_pad, self.spatial_pad, device)

    def forward_fast(self, buf, cache, residual=None):
        # buf from buffer(), interior filled: the halo is the cached tail, or copies of the first frame
        tp = self.time_pad
        if tp:
            padding = cache.get(self)
            buf[:, :, :tp] = buf[:, :, tp:tp + 1] if padding is None else padding
            cache[self] = buf[:, :, -tp:].clone(memory_format=CL)
        return _conv16(self.conv, buf, cache, residual)


class RMSNorm(nn.Module):
    def __init__(self, channels, dtype=None, device=None):
        super().__init__()
        self.scale = channels ** 0.5
        self.gamma = nn.Parameter(torch.empty((channels, 1, 1, 1), dtype=dtype, device=device))

    def forward(self, x):
        return F.normalize(x, dim=1) * self.scale * comfy.ops.cast_to_input(self.gamma, x)


class SpatialNorm3D(nn.Module):
    # RMSNorm modulated by the latent: norm(f) * conv_y(zq) + conv_b(zq), zq resized to f by nearest
    def __init__(self, f_channels, zq_channels, dtype=None, device=None):
        super().__init__()
        self.norm_layer = RMSNorm(f_channels, dtype=dtype, device=device)
        self.conv_y = ops.Conv3d(zq_channels, f_channels, kernel_size=1, dtype=dtype, device=device)
        self.conv_b = ops.Conv3d(zq_channels, f_channels, kernel_size=1, dtype=dtype, device=device)

    def forward(self, f, zq, first, cache):
        if first:
            # the first frame stands alone, the others resize as one block
            zq_first = F.interpolate(zq[:, :, :1], size=(1, *f.shape[-2:]), mode="nearest")
            if zq.shape[2] > 1:
                zq_rest = F.interpolate(zq[:, :, 1:], size=(f.shape[2] - 1, *f.shape[-2:]), mode="nearest")
                zq = torch.cat([zq_first, zq_rest], dim=2)
            else:
                zq = zq_first
        else:
            zq = F.interpolate(zq, size=f.shape[-3:], mode="nearest")
        norm_f = self.norm_layer(f)
        norm_f.mul_(_conv(self.conv_y, zq, cache))
        norm_f.add_(_conv(self.conv_b, zq, cache))
        return norm_f

    def forward_fast(self, f, zq, first, out, view=None):
        # SiLU(norm) written into out; conv_y / conv_b run on the latent itself and are gathered per voxel
        gamma = comfy.model_management.cast_to(self.norm_layer.gamma, torch.float32, f.device).view(-1)
        return spatial_norm_silu(f, gamma, self.conv_y(zq), self.conv_b(zq), first, out, view)


class ResnetBlock3D(nn.Module):
    def __init__(self, in_channels, out_channels, zq_ch=None, dtype=None, device=None):
        super().__init__()
        self.dtype = dtype
        if zq_ch is None:
            self.norm1 = RMSNorm(in_channels, dtype=dtype, device=device)
            self.norm2 = RMSNorm(out_channels, dtype=dtype, device=device)
        else:
            self.norm1 = SpatialNorm3D(in_channels, zq_ch, dtype=dtype, device=device)
            self.norm2 = SpatialNorm3D(out_channels, zq_ch, dtype=dtype, device=device)
        self.conv1 = CausalConv3d(in_channels, out_channels, 3, dtype=dtype, device=device)
        self.conv2 = CausalConv3d(out_channels, out_channels, 3, dtype=dtype, device=device)
        if in_channels != out_channels:
            self.nin_shortcut = ops.Conv3d(in_channels, out_channels, kernel_size=1, dtype=dtype, device=device)
        else:
            self.nin_shortcut = None

    def forward(self, x, cache, zq=None, first=False):
        h = self.norm1(x) if zq is None else self.norm1(x, zq, first, cache)
        h = self.conv1(F.silu(h, inplace=True), cache)
        h = self.norm2(h) if zq is None else self.norm2(h, zq, first, cache)
        h = self.conv2(F.silu(h, inplace=True), cache)
        if self.nin_shortcut is not None:
            x = _conv(self.nin_shortcut, x.to(self.dtype), cache)
        return x + h

    def forward_fast(self, x, cache, zq, first, view=None):
        _, c, t, h, w = x.shape
        buf, inner = self.conv1.buffer(c, t, h, w, x.device)
        self.norm1.forward_fast(x, zq, first, inner, view)
        y = self.conv1.forward_fast(buf, cache)
        buf, inner = self.conv2.buffer(y.shape[1], t, h, w, x.device)
        self.norm2.forward_fast(y, zq, first, inner, view)
        del y
        shortcut = x if self.nin_shortcut is None else _conv16(self.nin_shortcut, x, cache)
        return self.conv2.forward_fast(buf, cache, residual=shortcut)


class Downsample(nn.Module):
    # pixel-unshuffle mean + stride-2 conv; on temporal levels also first-frame-kept average + two causal convs
    def __init__(self, in_channels, compress_time, dtype=None, device=None):
        super().__init__()
        out_channels = in_channels * 2
        self.compress_time = compress_time
        self.spatial_conv = ops.Conv3d(in_channels, out_channels, kernel_size=(1, 3, 3), stride=(1, 2, 2),
                                              padding=(0, 1, 1), dtype=dtype, device=device)
        if compress_time:
            self.temporal_conv = nn.Sequential(
                CausalConv3d(out_channels, out_channels, (2, 1, 1), dtype=dtype, device=device),
                CausalConv3d(out_channels, out_channels, (2, 1, 1), stride=(2, 1, 1), dtype=dtype, device=device))
        self.linear = ops.Conv3d(out_channels, out_channels, kernel_size=1, dtype=dtype, device=device)

    def forward(self, x, cache, first):
        b, c, t, h, w = x.shape
        pxs = x.reshape(b, c, t, h // 2, 2, w // 2, 2).mean(dim=-1).permute(0, 1, 4, 2, 3, 5).reshape(b, c * 2, t, h // 2, w // 2)
        x = self.spatial_conv(x) + pxs
        if self.compress_time:
            b, c, t, h, w = x.shape
            frames = x.permute(0, 3, 4, 1, 2).reshape(b * h * w, c, t)
            if first:
                interp = torch.cat([frames[..., :1], F.avg_pool1d(frames[..., 1:], 2, 2)], dim=-1) if t > 1 else frames[..., :1]
            else:
                interp = F.avg_pool1d(frames, 2, 2)
            interp = interp.reshape(b, h, w, c, -1).permute(0, 3, 4, 1, 2)
            x = self.temporal_conv[1](self.temporal_conv[0](x, cache), cache) + interp
        return self.linear(x)


class Upsample(nn.Module):
    # optional temporal x2 (frame repeat + causal conv residual), then nearest x2 + conv residual, then a 1x1 conv
    def __init__(self, channels, compress_time, dtype=None, device=None):
        super().__init__()
        self.dtype = dtype
        self.compress_time = compress_time
        self.spatial_conv = ops.Conv3d(channels, channels, kernel_size=(1, 3, 3), padding=(0, 1, 1), dtype=dtype, device=device)
        if compress_time:
            self.temporal_conv = CausalConv3d(channels, channels, (3, 1, 1), dtype=dtype, device=device)
        self.linear = ops.Conv3d(channels, channels, kernel_size=1, dtype=dtype, device=device)

    def forward(self, x, cache, first):
        if self.compress_time:
            x = x.repeat_interleave(2, dim=2)
            if first:
                x = x[:, :, 1:]
            x = self.temporal_conv(x, cache) + x
        x = F.interpolate(x, scale_factor=(1, 2, 2), mode="nearest")
        x.add_(_conv(self.spatial_conv, x.to(self.dtype), cache))
        return _conv(self.linear, x.to(self.dtype), cache).to(x.dtype)

    def forward_fast(self, x, cache, first):
        _, c, t, h, w = x.shape
        if self.compress_time:
            buf, inner = self.temporal_conv.buffer(c, 2 * t - first, h, w, x.device)
            if first:
                inner[:, :, :1] = x[:, :, :1]
            inner[:, :, int(first):].unflatten(2, (t - first, 2)).copy_(x[:, :, int(first):].unsqueeze(3))
            x = self.temporal_conv.forward_fast(buf, cache, residual=inner)
            del buf, inner
            t = x.shape[2]
        buf, inner = _padded(c, t, 2 * h, 2 * w, 0, 1, x.device)
        inner.unflatten(3, (h, 2)).unflatten(5, (w, 2)).copy_(x[:, :, :, :, None, :, None])
        del x
        x = _conv16(self.spatial_conv, buf, cache, residual=inner)
        del buf, inner
        return _conv16(self.linear, x, cache)


def _blocks(n, block_in, block_out, **kwargs):
    return nn.ModuleList([ResnetBlock3D(block_in if i == 0 else block_out, block_out, **kwargs) for i in range(n)])


class Encoder3D(nn.Module):
    def __init__(self, ch, ch_mult, num_res_blocks, in_channels, z_channels, temporal_compress_times,
                 temporal_compress_start_level, dtype=None, device=None):
        super().__init__()
        kw = dict(dtype=dtype, device=device)
        time_levels = range(temporal_compress_start_level, int(math.log2(temporal_compress_times)) + temporal_compress_start_level)
        self.conv_in = CausalConv3d(in_channels, round(ch * ch_mult[0]), 3, **kw)
        self.down = nn.ModuleList()
        block_in = round(ch * ch_mult[0])
        for i, mult in enumerate(ch_mult):
            down = nn.Module()
            down.block = _blocks(num_res_blocks, block_in, round(ch * mult), **kw)
            block_in = round(ch * mult)
            if i != len(ch_mult) - 1:
                down.downsample = Downsample(block_in, i in time_levels, **kw)
                block_in *= 2
            self.down.append(down)
        self.mid = nn.Module()
        self.mid.block_1 = ResnetBlock3D(block_in, block_in, **kw)
        self.mid.block_2 = ResnetBlock3D(block_in, block_in, **kw)
        self.norm_out = RMSNorm(block_in, dtype=dtype, device=device)
        self.conv_out = CausalConv3d(block_in, 2 * z_channels, 3, **kw)

    def forward(self, x, cache, first):
        h = self.conv_in(x, cache)
        for down in self.down:
            for block in down.block:
                h = block(h, cache)
            if hasattr(down, "downsample"):
                h = down.downsample(h, cache, first)
        h = self.mid.block_2(self.mid.block_1(h, cache), cache)
        h = self.norm_out(h)
        return self.conv_out(h * torch.sigmoid(h), cache)


class Decoder3D(nn.Module):
    def __init__(self, ch, ch_mult, num_res_blocks, out_ch, z_channels, temporal_compress_times,
                 temporal_compress_start_level, dtype=None, device=None):
        super().__init__()
        kw = dict(dtype=dtype, device=device)
        levels = len(ch_mult)
        time_levels = range(levels - int(math.log2(temporal_compress_times)) - temporal_compress_start_level, levels - temporal_compress_start_level)
        block_in = round(ch * ch_mult[-1])
        self.conv_in = CausalConv3d(z_channels, block_in, 3, **kw)
        self.mid = nn.Module()
        self.mid.block_1 = ResnetBlock3D(block_in, block_in, zq_ch=z_channels, **kw)
        self.mid.block_2 = ResnetBlock3D(block_in, block_in, zq_ch=z_channels, **kw)
        up = []
        for i in reversed(range(levels)):
            level = nn.Module()
            level.block = _blocks(num_res_blocks + 1, block_in, round(ch * ch_mult[i]), zq_ch=z_channels, **kw)
            block_in = round(ch * ch_mult[i])
            if i != 0:
                level.upsample = Upsample(block_in, i in time_levels, **kw)
            up.insert(0, level)
        self.up = nn.ModuleList(up)
        self.norm_out = SpatialNorm3D(block_in, z_channels, **kw)
        self.conv_out = CausalConv3d(block_in, out_ch, 3, **kw)

    def forward(self, z, cache, first):
        # float32 from here on, the reference's autocast region: convolutions round their inputs to bf16
        h = self.conv_in(z, cache).float()
        h = self.mid.block_1(h, cache, z, first)
        h = self.mid.block_2(h, cache, z, first)
        for level in reversed(self.up):
            for block in level.block:
                h = block(h, cache, z, first)
            if hasattr(level, "upsample"):
                h = level.upsample(h, cache, first)
        h = self.norm_out(h, z, first, cache)
        return self.conv_out(h * torch.sigmoid(h), cache)

    def forward_fast(self, z, cache, first, pieces=None):
        """pieces: None, or core boxes (top, bottom, left, right) at 1/4 resolution: the levels from up[2]'s upsample
        on run per box with a halo of HALO px that covers their receptive field, each with its own causal state."""
        _, c, t, hz, wz = z.shape
        buf, inner = self.conv_in.buffer(c, t, hz, wz, z.device)
        inner.copy_(z)
        h = self.conv_in.forward_fast(buf, cache)
        h = self.mid.block_1.forward_fast(h, cache, z, first)
        h = self.mid.block_2.forward_fast(h, cache, z, first)
        for i in (4, 3, 2):
            for block in self.up[i].block:
                h = block.forward_fast(h, cache, z, first)
            if i != 2:
                h = self.up[i].upsample.forward_fast(h, cache, first)
        if pieces is None:
            return self._top_fast(h, z, cache, first, None)
        _, _, _, fh, fw = h.shape
        out = None
        for n, (y0, y1, x0, x1) in enumerate(pieces):
            sy0, sy1, sx0, sx1 = max(0, y0 - HALO), min(fh, y1 + HALO), max(0, x0 - HALO), min(fw, x1 + HALO)
            piece_cache = cache.setdefault(("piece", n), {"w16": cache.setdefault("w16", {})})
            part = self._top_fast(h[:, :, :, sy0:sy1, sx0:sx1], z, piece_cache, first, (sy0, sx0, fh, fw))
            if out is None:
                out = torch.empty((1, part.shape[1], part.shape[2], 4 * fh, 4 * fw), dtype=part.dtype, device=part.device)
            out[:, :, :, 4 * y0:4 * y1, 4 * x0:4 * x1] = part[:, :, :, 4 * (y0 - sy0):4 * (y1 - sy0), 4 * (x0 - sx0):4 * (x1 - sx0)]
        return out

    def _top_fast(self, h, z, cache, first, view):
        # up[2].upsample to conv_out; view = (top, left, full_h, full_w) of a piece at 1/4 resolution, doubled per upsample
        h = self.up[2].upsample.forward_fast(h, cache, first)
        view = None if view is None else tuple(2 * v for v in view)
        for block in self.up[1].block:
            h = block.forward_fast(h, cache, z, first, view)
        h = self.up[1].upsample.forward_fast(h, cache, first)
        view = None if view is None else tuple(2 * v for v in view)
        for block in self.up[0].block:
            h = block.forward_fast(h, cache, z, first, view)
        _, c, t, hh, ww = h.shape
        buf, inner = self.conv_out.buffer(c, t, hh, ww, h.device)
        self.norm_out.forward_fast(h, z, first, inner, view)
        del h
        return self.conv_out.forward_fast(buf, cache)


# halo of a spatial piece at 1/4 resolution: the levels after it reach 5.5 px (1 + 6 convs at 1/2, 1 + 6 + 1 at full)
HALO = 6


class KVAEModel(nn.Module):
    def __init__(self, config, dtype=None, device=None):
        super().__init__()
        c = config
        self.dtype = dtype
        self.temporal_compress = c["temporal_compress_times"]
        self.encoder = Encoder3D(c["ch"], c["ch_mult"], c["num_res_blocks"], c["in_channels"], c["z_channels"],
                                 c["temporal_compress_times"], c["temporal_compress_start_level"],
                                 dtype=dtype, device=device)
        self.decoder = Decoder3D(c["decoder_ch"], c["decoder_ch_mult"], c["num_res_blocks"], c["out_channels"],
                                 c["z_channels"], c["temporal_compress_times"], c["temporal_compress_start_level"],
                                 dtype=dtype, device=device)

    def encode_segments(self, chunks):
        # posterior means of consecutive segments of one clip, the causal state carried between them
        cache = {}
        for i, x in enumerate(chunks):
            moments = self.encoder(x, cache, i == 0)
            yield moments[:, :moments.shape[1] // 2]

    def decode_segments(self, z, seg, fast=False, pieces=None):
        # latent segments of 1 + seg, seg, ... frames (cached_model.py:216-227 with seg = 16 // 4); the causal cache
        # makes any segment length exact, shorter ones only cost less memory
        t = z.shape[2]
        if t == 1:
            sizes = [1]
        else:
            sizes = [seg] * ((t - 1) // seg)
            if (t - 1) % seg:
                sizes.append((t - 1) % seg)
            sizes[0] += 1
        cache = {}
        for i, chunk in enumerate(torch.split(z, sizes, dim=2)):
            yield self.decoder.forward_fast(chunk, cache, i == 0, pieces) if fast else self.decoder(chunk, cache, i == 0)


def encode_sizes(frames, seg_len=16):
    # 1 + seg_len, seg_len, ..., and a shorter last segment (cached_model.py:184-190)
    sizes = [seg_len + 1]
    left = frames - (seg_len + 1)
    while left > 0:
        sizes.append(seg_len)
        left -= seg_len
    sizes[-1] += left
    return sizes


def to_uint8(x):
    bounds = torch.aminmax(x)
    if not torch.isfinite(torch.stack(bounds)).all():
        raise RuntimeError("Kandinsky Video SR produced non-finite decoded pixels.")
    # vae_io.py:111,128: (x + 1) * 128 / 255, clamped, * 255, truncated
    return (((x + 1) * 128 / 255.0).clamp(0.0, 1.0) * 255.0).to(torch.uint8)


class KVAE:
    """The pipeline's handle: a ModelPatcher around KVAEModel plus the latent scaling factor."""

    def __init__(self, patcher, config):
        self.patcher = patcher
        self.config = config
        self.scaling_factor = config["scaling_factor"]
        self.dtype = patcher.model.dtype

    def encode_memory(self, video_shape):
        """Bytes encode_video needs beside the weights for a [T, 3, H, W] clip (its shortest segments; it takes the
        reference's 17-frame segments when more is free)."""
        return encode_memory(video_shape[2], video_shape[3], 4)

    def decode_memory(self, latent_shape, kernels="exact"):
        """Bytes decode_tile(kernels) needs beside the weights for a (T', h, w, 64) latent (fast: its 1-frame
        segments and the float16 weight copy; it takes 2-frame segments when more is free)."""
        _, h, w, _ = latent_shape
        if kernels == "fast" and self.patcher.load_device.type == "cuda":
            return decode_memory_fast(h, w, 1)
        return decode_memory(h, w)

    def encode_video(self, video_u8):
        """[T, 3, H, W] uint8 (any device) -> raw latent [T', 64, h, w] float32 on the card (sr_pipeline.py:364-377).
        Compute only, like every method here: the caller loads the patcher first (load_models_gpu with encode_memory),
        from its main thread.

        Segments of 17, 16, ... frames as the reference, or 9, 8, ... / 5, 4, ... when those do not fit the free
        memory (exact math, other cuDNN algorithms); each segment is moved and normalised on its own, x / 128 - 1.
        """
        t, _, h, w = video_u8.shape
        device = self.patcher.load_device
        free = comfy.model_management.get_free_memory(device)
        seg_len = next((s for s in (16, 8) if encode_memory(h, w, s) < free), 4)
        pixels = video_u8.permute(1, 0, 2, 3).unsqueeze(0)
        chunks = ((c.to(device).float() / 128 - 1.0).to(self.dtype) for c in torch.split(pixels, encode_sizes(t, seg_len), dim=2))
        with comfy.model_management.cuda_device_context(device):
            return torch.cat(list(self.patcher.model.encode_segments(chunks)), dim=2)[0].permute(1, 0, 2, 3).float()

    def decode_tile(self, latent, kernels="exact"):
        """Scaled latent (T', h, w, 64) -> uint8 [3, T, H, W] on the card (stages.py:304-324).

        exact: the reference's numerics, one latent frame per segment (the reference with KVAE_DECODE_SEG=4): the
        causal caches make it the same math as its 16-frame segments, which need more than 24 GB at 512x768, and the
        result does not depend on free memory. fast (CUDA): the float16 path above, FAST_SEG latent frames per segment
        when they fit the free memory, else 1.
        """
        _, h, w, _ = latent.shape
        device = self.patcher.load_device
        fast = kernels == "fast" and device.type == "cuda"
        with comfy.model_management.cuda_device_context(device):
            seg = 1
            if fast and decode_memory_fast(h, w, FAST_SEG) < comfy.model_management.get_free_memory(device):
                seg = FAST_SEG
            z = (latent.to(device) / self.scaling_factor).permute(3, 0, 1, 2).unsqueeze(0).to(self.dtype)
            return torch.cat([to_uint8(x[0]) for x in self.patcher.model.decode_segments(z, seg, fast)], dim=1)

    def can_decode_canvas(self, kernels):
        """Whether decode_canvas runs with these kernels on this handle's device: the fast path only (its norms
        gather the latent at piece coordinates; the exact modules resize it per call)."""
        return kernels == "fast" and self.patcher.load_device.type == "cuda"

    def canvas_memory(self, latent_shape, kernels="fast"):
        """Bytes decode_canvas needs beside the weights for a (T', h, w, 64) canvas: its largest pass."""
        _, h, w, _ = latent_shape
        # planned for the whole card less the resident weights: decode_canvas plans again from the free memory
        free = comfy.model_management.get_total_memory(self.patcher.load_device) - self.patcher.model_size() - 2**30 - CANVAS_HEADROOM
        axis, bands = canvas_bands(h, w, free)
        return max(canvas_pass_memory(e - s, w if axis == 0 else h) for s, e in bands)

    def decode_canvas(self, latent, kernels="fast"):
        """Scaled latent canvas (T', h, w, 64), the blended tiles of a whole frame -> uint8 frames (n, 16h, 16w, 3)
        on the card, yielded in order a temporal segment at a time.

        One pass over the canvas when its causal state (the last two input frames of every conv, ~4.6 KB per output
        pixel) fits the free memory: the low levels run on the whole canvas, the levels from 1/4 resolution in pieces
        (Decoder3D.forward_fast). A larger canvas is cut along its longer side into bands that overlap by BAND_OVERLAP
        latent px, each decoded over the whole clip as its own pass and cross-faded linearly over the overlap; their
        frames are held in host memory (uint8) until the last band is done, then yielded.
        """
        if not self.can_decode_canvas(kernels):
            raise ValueError(f"decode_canvas needs kernels='fast' on a CUDA device (check can_decode_canvas), got {kernels!r}")
        t, h, w, _ = latent.shape
        device = self.patcher.load_device
        model = self.patcher.model
        axis, bands = canvas_bands(h, w, comfy.model_management.get_free_memory(device) - CANVAS_HEADROOM)
        log.info("Kandinsky SR: canvas decode %dx%d, %s", 16 * w, 16 * h, "one pass" if len(bands) == 1 else
                 f"{len(bands)} bands along the {'height' if axis == 0 else 'width'}, frames held in RAM until the last")
        with comfy.model_management.cuda_device_context(device):
            z = (latent.to(device) / self.scaling_factor).permute(3, 0, 1, 2).unsqueeze(0).to(self.dtype)
            if len(bands) == 1:
                for x in model.decode_segments(z, 1, True, canvas_pieces(4 * h, 4 * w)):
                    yield to_uint8(x[0]).permute(1, 2, 3, 0)
                return
            frames = 4 * t - 3
            out = torch.empty((frames, 16 * h, 16 * w, 3), dtype=torch.uint8)
            dim = 3 + axis  # latent dim of the split axis in z [1, C, T, h, w]
            prev_end = 0
            for start, end in bands:
                zb = z.narrow(dim, start, end - start)
                bh, bw = zb.shape[3], zb.shape[4]
                ramp = None
                if start > 0:  # rises over the overlap with the band before
                    n = 16 * (prev_end - start)
                    ramp = ((torch.arange(n, device=device, dtype=torch.float32) + 0.5) / n).view(-1, 1, 1) if axis == 0 else \
                        ((torch.arange(n, device=device, dtype=torch.float32) + 0.5) / n).view(1, -1, 1)
                f0 = 0
                for x in model.decode_segments(zb, 1, True, canvas_pieces(4 * bh, 4 * bw)):
                    rgb = to_uint8(x[0]).permute(1, 2, 3, 0)  # (n, H_band, W_band, 3)
                    n_f = rgb.shape[0]
                    region = out[f0:f0 + n_f].narrow(1 + axis, 16 * start, rgb.shape[1 + axis])
                    if ramp is not None:
                        n = ramp.shape[axis]
                        old = region.narrow(1 + axis, 0, n).to(device).float()
                        new = rgb.narrow(1 + axis, 0, n).float()
                        blended = (old + (new - old) * ramp).round_().to(torch.uint8)
                        rgb = torch.cat([blended, rgb.narrow(1 + axis, n, rgb.shape[1 + axis] - n)], dim=1 + axis)
                    region.copy_(rgb)
                    f0 += n_f
                prev_end = end
            for f0 in range(0, frames, 16):
                yield out[f0:f0 + 16].to(device)


# activation peaks measured on an RTX 3090 at 256x384 to 768x512 output, plus 0.5 GB margin
# plus the copy of the weights each call holds (_conv): 0.55 GB encoder, 2.75 GB decoder
def encode_memory(h, w, seg_len):
    return 2**29 + int(0.55 * 2**30) + h * w * (850 + 455 * (seg_len + 1))


def decode_memory(h, w):
    # 1 + 4 frames per segment (the first), latent h x w
    return 2**29 + int(2.75 * 2**30) + 256 * h * w * (10800 + 3950 * 5)


FAST_SEG = 2  # 9% faster than 1 on an RTX 3090, 2% on an RTX 4090
PIECE = (128, 192)  # largest piece core of a canvas decode at 1/4 resolution: one 512x768 output tile
BAND_OVERLAP = 8  # latent px two bands of a canvas share and cross-fade over (128 output px)


def canvas_pieces(h4, w4):
    """Even cores (top, bottom, left, right) at 1/4 resolution, each at most PIECE; None when one covers it."""
    ny, nx = math.ceil(h4 / PIECE[0]), math.ceil(w4 / PIECE[1])
    if ny * nx == 1:
        return None
    ys = [round(i * h4 / ny) for i in range(ny + 1)]
    xs = [round(i * w4 / nx) for i in range(nx + 1)]
    return [(ys[i], ys[i + 1], xs[j], xs[j + 1]) for i in range(ny) for j in range(nx)]


def canvas_pass_memory(h, w):
    # one canvas pass over a latent h x w: the float16 weights, the causal state of the whole canvas and the low
    # levels' working set per output pixel, and one piece's working set
    piece = min(256 * h * w, (4 * PIECE[0] + 8 * HALO) * (4 * PIECE[1] + 8 * HALO))
    return 2**29 + int(2.75 * 2**30) + 256 * h * w * CANVAS_BYTES + piece * PIECE_BYTES


CANVAS_BYTES = 5700  # fitted on an RTX 4090 at 0.4-2.5 M output pixels, 4-15% over every measured peak
PIECE_BYTES = 6900
# a pass planned closer to the card's end runs slower (allocator retries): 3 bands of the 3072x2048 canvas took
# 89-93 s at 17.5 GB, 4 bands 86.6 s at 14.2 GB
CANVAS_HEADROOM = 3 * 2**30


def canvas_bands(h, w, free):
    """(axis, [(start, end), ...]): the fewest bands of the latent canvas along its longer side (axis 0 = rows)
    whose pass fits `free`, neighbours overlapping by BAND_OVERLAP."""
    axis = 0 if h >= w else 1
    length, other = (h, w) if axis == 0 else (w, h)
    for n in range(1, length // (2 * BAND_OVERLAP) + 1):
        core = math.ceil((length + (n - 1) * BAND_OVERLAP) / n)
        starts = [round(i * (length - core) / (n - 1)) for i in range(n)] if n > 1 else [0]
        bands = [(s, min(length, s + core)) for s in starts]
        size = max(e - s for s, e in bands)
        if canvas_pass_memory(size, other) <= free or n == length // (2 * BAND_OVERLAP):
            return axis, bands
    return axis, [(0, length)]



def decode_memory_fast(h, w, seg):
    # measured on an RTX 4090: the per-call float16 copy of the decoder weights (2.73 GB) and
    # 3.79 KB + 1.70 KB per frame of the first segment for every output pixel, plus margin
    return 2**29 + int(2.75 * 2**30) + 256 * h * w * (3800 + 1750 * (4 * seg + 1))


def load_kvae(path, device=None):
    """A single-file KVAE written by tools/convert_kvae.py (architecture and scaling factor in the metadata).

    device: the card it runs on (ComfyUI's default device when None); a second card needs its own handle.
    """
    sd, metadata = comfy.utils.load_torch_file(path, return_metadata=True)
    config = json.loads(metadata["kandinsky_sr.kvae"])
    load_device = device if device is not None else comfy.model_management.get_torch_device()
    offload_device = comfy.model_management.vae_offload_device()
    dtype = comfy.model_management.vae_dtype(load_device, [torch.bfloat16, torch.float32])
    model = KVAEModel(config, dtype=dtype, device=offload_device)
    comfy.model_management.archive_model_dtypes(model)
    # attribute access on purpose: main.py rebinds CoreModelPatcher to the dynamic patcher after imports
    patcher = comfy.model_patcher.CoreModelPatcher(model, load_device=load_device, offload_device=offload_device)
    model.load_state_dict(sd, strict=True, assign=patcher.is_dynamic())
    log.info("Kandinsky SR: KVAE loaded (%s, %s)", path, dtype)
    return KVAE(patcher, config)
