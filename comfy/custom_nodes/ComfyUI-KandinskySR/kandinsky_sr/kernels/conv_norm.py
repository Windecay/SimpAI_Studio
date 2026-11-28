"""Fused modulated RMS norm for the KVAE decoder's fast path, Triton with a plain-torch fallback.

`spatial_norm_silu(x, gamma, proj_y, proj_b, first, out, view=None)` writes, for every voxel of x [1, C, T, H, W]:

    n = x / max(||x||_C, 1e-12) * sqrt(C) * gamma          (float32)
    n = n * proj_y[zt, zy, zx] + proj_b[zt, zy, zx]         (the latent's 1x1 projections, gathered, not resized)
    out = n * sigmoid(n)                                    (rounded to out's dtype)

proj_y / proj_b [1, C, Tz, h, w] are conv_y(zq) / conv_b(zq) at the latent's resolution: a nearest resize commutes
with a 1x1 conv, so gathering them per voxel is the reference's `conv_y(interpolate(zq))` without the full-resolution
tensors. The gather follows the reference's nearest resize (`cached_layers.py:345-371`): on the first segment frame 0
reads latent frame 0 and the others are spread over the rest; later segments spread all frames over all latent frames.
`out` may be a strided view (the interior of a pre-padded conv input), any layout; NDHWC keeps both sides coalesced.
`view` = (top, left, full_h, full_w) when x is a spatial piece of a larger frame: the gather uses the frame's
coordinates.
"""
import torch
import torch.nn.functional as F

try:
    import triton
    import triton.language as tl
except ImportError:
    triton = None


# (voxels per program, warps) per padded channel count, from a launch sweep on the decoder's shapes:
# the 4090 (sm 8.9) for Ada, the 3090 (sm 8.6) for everything else
LAUNCH = {(8, 9): {16: (64, 4), 256: (8, 4), 512: (16, 8), 1024: (1, 8), 2048: (1, 4)},
          None: {16: (64, 1), 256: (4, 4), 512: (2, 1), 1024: (1, 8), 2048: (1, 4)}}


def available(device):
    return triton is not None and torch.device(device).type == "cuda"


if triton is not None:
    @triton.jit
    def _spatial_norm_silu(X, G, Y, B, O, C: tl.constexpr, T, H, W, ZT, ZH, ZW, OY, OX, FH, FW,
                           xc, xt, xh, xw, yc, yt, yh, yw, bc, bt, bh, bw, oc, ot, oh, ow,
                           voxels, scale, FIRST: tl.constexpr, BLOCK_P: tl.constexpr, BLOCK_C: tl.constexpr):
        p = tl.program_id(0).to(tl.int64) * BLOCK_P + tl.arange(0, BLOCK_P)
        c = tl.arange(0, BLOCK_C)
        valid = p < voxels
        mask = valid[:, None] & (c[None, :] < C)
        ix = p % W
        iy = (p // W) % H
        it = p // (W * H)
        v = tl.load(X + (it * xt + iy * xh + ix * xw)[:, None] + c[None, :] * xc, mask, other=0.0).to(tl.float32)
        denom = tl.maximum(tl.sqrt(tl.sum(v * v, axis=1)), 1e-12)
        g = tl.load(G + c, c < C, other=0.0).to(tl.float32)
        n = v / denom[:, None] * scale * g[None, :]
        if FIRST:
            zt = tl.where(it == 0, 0, 1 + ((it - 1) * (ZT - 1)) // tl.maximum(T - 1, 1))
        else:
            zt = (it * ZT) // T
        zy = ((iy + OY) * ZH) // FH
        zx = ((ix + OX) * ZW) // FW
        py = tl.load(Y + (zt * yt + zy * yh + zx * yw)[:, None] + c[None, :] * yc, mask, other=0.0).to(tl.float32)
        pb = tl.load(B + (zt * bt + zy * bh + zx * bw)[:, None] + c[None, :] * bc, mask, other=0.0).to(tl.float32)
        n = n * py + pb
        n = n / (1.0 + tl.exp(-n))
        tl.store(O + (it * ot + iy * oh + ix * ow)[:, None] + c[None, :] * oc, n.to(O.dtype.element_ty), mask)


def _gather_index(t, zt_count, first, device):
    i = torch.arange(t, device=device)
    if first:
        return torch.where(i == 0, 0, 1 + (i - 1) * (zt_count - 1) // max(t - 1, 1))
    return i * zt_count // t


def spatial_norm_silu(x, gamma, proj_y, proj_b, first, out, view=None):
    _, c, t, h, w = x.shape
    zt, zh, zw = proj_y.shape[2:]
    oy, ox, fh, fw = view if view is not None else (0, 0, h, w)
    scale = c ** 0.5
    if available(x.device):
        block_c = triton.next_power_of_2(c)
        table = LAUNCH.get(torch.cuda.get_device_capability(x.device), LAUNCH[None])
        block_p, warps = table.get(block_c, (max(1, min(32, 2048 // block_c)), 4))
        voxels = t * h * w
        _spatial_norm_silu[(triton.cdiv(voxels, block_p),)](
            x, gamma, proj_y, proj_b, out, c, t, h, w, zt, zh, zw, oy, ox, fh, fw,
            *x.stride()[1:], *proj_y.stride()[1:], *proj_b.stride()[1:], *out.stride()[1:],
            voxels, scale, FIRST=bool(first), BLOCK_P=block_p, BLOCK_C=block_c, num_warps=warps)
        return out
    # plain torch: the same arithmetic in float32
    n = F.normalize(x.float(), dim=1) * scale * gamma.float().view(1, c, 1, 1, 1)
    ti = _gather_index(t, zt, first, x.device)
    yi = (torch.arange(h, device=x.device) + oy) * zh // fh
    xi = (torch.arange(w, device=x.device) + ox) * zw // fw
    for proj, op in ((proj_y, torch.mul), (proj_b, torch.add)):
        n = op(n, proj.float()[:, :, ti][:, :, :, yi][:, :, :, :, xi])
    out.copy_(n * torch.sigmoid(n))
    return out
