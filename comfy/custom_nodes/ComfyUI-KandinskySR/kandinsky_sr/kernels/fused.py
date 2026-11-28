"""Fused elementwise passes of the Kandinsky 5 family DiT blocks (video SR and image SR), Triton.

Each function keeps the reference's arithmetic (float32 math, rounding to the compute dtype where the reference
rounds) and replaces several memory passes over the token stream with one. No FMA contraction.

- `adaln(x, shift, scale, out_dtype)`: LayerNorm(x.float()) (no affine, eps 1e-5) * (scale + 1) + shift, rounded to
  out_dtype. x (..., D) float32 (video residual) or bf16 (image residual); shift and scale broadcast over rows,
  (B, 1, D). Torch's LayerNorm reduces with Welford, this kernel with two passes over a row in registers, so the
  float32 values differ in the last bits and the rounded output in a few elements.
- `residual_adaln(x, gate, out, shift, scale, out_dtype, bias=None)`: x + gate * out in float32 (the gated residual,
  stored in x's dtype), optionally + bias (rounded again), and the next sub-layer's adaln of that sum, in one pass:
  returns (new x, normed).
- `rms_rope(x, weight, freqs, eps)`: per-head RMSNorm in float32 (x * rsqrt(mean(x^2) + eps) * weight), rounded to
  x's dtype, then RoPE on adjacent pairs with float32 rotation matrices (two products summed), rounded again.
  x (B, S, heads, Dh), weight (Dh,), freqs (1, S, 1, Dh / 2, 2, 2).

`available(device)`: CUDA and Triton; callers keep their unfused ops otherwise.
"""
import torch

from .nabla import available

try:
    import triton
    import triton.language as tl
except ImportError:
    triton = None

__all__ = ["available", "adaln", "residual_adaln", "rms_rope"]


if triton is not None:
    @triton.jit
    def _norm_mod(x, shift, scale, cols, D: tl.constexpr, eps):
        valid = cols < D
        mean = tl.sum(tl.where(valid, x, 0.0), 0) / D
        centred = tl.where(valid, x - mean, 0.0)
        var = tl.sum(centred * centred, 0) / D
        y = centred * tl.math.rsqrt(var + eps)
        return shift + y * (scale + 1.0)

    @triton.jit
    def _adaln(X, SHIFT, SCALE, OUT, rows_per_batch, D: tl.constexpr, BD: tl.constexpr, eps):
        row = tl.program_id(0).to(tl.int64)
        b = row // rows_per_batch
        cols = tl.arange(0, BD)
        valid = cols < D
        x = tl.load(X + row * D + cols, mask=valid, other=0.0).to(tl.float32)
        shift = tl.load(SHIFT + b * D + cols, mask=valid, other=0.0).to(tl.float32)
        scale = tl.load(SCALE + b * D + cols, mask=valid, other=0.0).to(tl.float32)
        out = _norm_mod(x, shift, scale, cols, D, eps)
        tl.store(OUT + row * D + cols, out.to(OUT.dtype.element_ty), mask=valid)

    @triton.jit
    def _residual_adaln(X, GATE, O, BIAS, SHIFT, SCALE, XOUT, OUT, rows_per_batch, D: tl.constexpr, BD: tl.constexpr, eps,
                        HAS_BIAS: tl.constexpr):
        row = tl.program_id(0).to(tl.int64)
        b = row // rows_per_batch
        cols = tl.arange(0, BD)
        valid = cols < D
        x = tl.load(X + row * D + cols, mask=valid, other=0.0).to(tl.float32)
        gate = tl.load(GATE + b * D + cols, mask=valid, other=0.0).to(tl.float32)
        o = tl.load(O + row * D + cols, mask=valid, other=0.0).to(tl.float32)
        x = (x + gate * o).to(XOUT.dtype.element_ty)
        if HAS_BIAS:
            bias = tl.load(BIAS + cols, mask=valid, other=0.0).to(tl.float32)
            x = (x.to(tl.float32) + bias).to(XOUT.dtype.element_ty)
        tl.store(XOUT + row * D + cols, x, mask=valid)
        shift = tl.load(SHIFT + b * D + cols, mask=valid, other=0.0).to(tl.float32)
        scale = tl.load(SCALE + b * D + cols, mask=valid, other=0.0).to(tl.float32)
        out = _norm_mod(x.to(tl.float32), shift, scale, cols, D, eps)
        tl.store(OUT + row * D + cols, out.to(OUT.dtype.element_ty), mask=valid)

    @triton.jit
    def _rms_rope(X, W, F, OUT, heads, S, eps, DH: tl.constexpr, HB: tl.constexpr):
        # one token per program, HB heads at a time; pairs (2i, 2i + 1) of a head rotate with F[token, i]
        token = tl.program_id(0).to(tl.int64)
        h0 = tl.program_id(1) * HB
        s = token % S
        h = h0 + tl.arange(0, HB)
        i = tl.arange(0, DH // 2)
        hv = (h < heads)[:, None]
        base = X + token * heads * DH + h[:, None] * DH + 2 * i[None, :]
        x0 = tl.load(base, mask=hv, other=0.0).to(tl.float32)
        x1 = tl.load(base + 1, mask=hv, other=0.0).to(tl.float32)
        ms = (tl.sum(x0 * x0, 1) + tl.sum(x1 * x1, 1)) / DH
        r = tl.math.rsqrt(ms + eps)[:, None]
        w0 = tl.load(W + 2 * i).to(tl.float32)[None, :]
        w1 = tl.load(W + 2 * i + 1).to(tl.float32)[None, :]
        x0 = ((x0 * r) * w0).to(OUT.dtype.element_ty).to(tl.float32)
        x1 = ((x1 * r) * w1).to(OUT.dtype.element_ty).to(tl.float32)
        f = F + s * (DH // 2) * 4 + i * 4
        f00, f01, f10, f11 = tl.load(f)[None, :], tl.load(f + 1)[None, :], tl.load(f + 2)[None, :], tl.load(f + 3)[None, :]
        out = OUT + token * heads * DH + h[:, None] * DH + 2 * i[None, :]
        tl.store(out, (f00 * x0 + f01 * x1).to(OUT.dtype.element_ty), mask=hv)
        tl.store(out + 1, (f10 * x0 + f11 * x1).to(OUT.dtype.element_ty), mask=hv)


def _rows(x, shift):
    d = x.shape[-1]
    rows = x.numel() // d
    batches = shift.numel() // d
    return d, rows, rows // batches


def adaln(x, shift, scale, out_dtype, eps=1e-5):
    d, rows, per_batch = _rows(x, shift)
    out = torch.empty(x.shape, device=x.device, dtype=out_dtype)
    _adaln[(rows,)](x.contiguous(), shift.contiguous(), scale.contiguous(), out, per_batch, D=d,
                    BD=triton.next_power_of_2(d), eps=eps, num_warps=8, enable_fp_fusion=False)
    return out


def residual_adaln(x, gate, out, shift, scale, out_dtype, bias=None, eps=1e-5):
    """bias: an optional float32 (D,) row added after the gated sum and rounded again (the image model's baked
    cross-attention table row)."""
    d, rows, per_batch = _rows(x, shift)
    new_x = torch.empty_like(x)
    normed = torch.empty(x.shape, device=x.device, dtype=out_dtype)
    _residual_adaln[(rows,)](x.contiguous(), gate.contiguous(), out.contiguous(), x if bias is None else bias.contiguous(),
                             shift.contiguous(), scale.contiguous(), new_x, normed, per_batch, D=d,
                             BD=triton.next_power_of_2(d), eps=eps, HAS_BIAS=bias is not None, num_warps=8,
                             enable_fp_fusion=False)
    return new_x, normed


def rms_rope(x, weight, freqs, eps):
    b, s, heads, dh = x.shape
    out = torch.empty_like(x)
    hb = 4
    _rms_rope[(b * s, triton.cdiv(heads, hb))](x.contiguous(), weight.contiguous(), freqs.contiguous(), out, heads, s, eps,
                                              DH=dh, HB=hb, num_warps=4, enable_fp_fusion=False)
    return out
