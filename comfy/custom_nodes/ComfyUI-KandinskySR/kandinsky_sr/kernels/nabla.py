"""Block-sparse attention over NABLA masks (64-token blocks), a Triton kernel.

`sparse_attention(q, k, v, mask)` has the contract of `kandinsky_sr/video/nabla.py::sparse_attention`: q, k, v
(B, heads, S, D) in block order, mask bool (B, heads, n, n) over 64-token blocks (query block x key block), scale
D ** -0.5, result (B, heads, S, D) in q's dtype. Each (batch, head, query block) runs over its kept key blocks in
ascending block order with the arithmetic of the reference's backend, PyTorch flex_attention's Triton template at
block 64 with full blocks: score = (q k^T) * scale * log2(e), running max and sum in float32, exp2, probabilities
rounded to the input dtype for P V, which accumulates into the running output; no FMA contraction. In bf16 it
matches flex_attention bit for bit on all but ~4e-6 of the outputs (block order of tied rows).

`fast=True` computes P V in float16 with a float16 accumulator per key block (twice the tensor-core rate on sm86 /
sm89): ~1.4x faster, about 1e-3 relative error per call. It changes numbers.

`available(device)` says whether the kernel runs there (CUDA sm80+, Triton importable); otherwise the caller keeps
its plain-torch path.
"""
import functools

import torch

try:
    import triton
    import triton.language as tl
except ImportError:
    triton = None

BLOCK = 64


@functools.cache
def _supported(index):
    return torch.cuda.get_device_capability(index) >= (8, 0)


def available(device):
    device = torch.device(device)
    if triton is None or device.type != "cuda":
        return False
    return _supported(device.index if device.index is not None else torch.cuda.current_device())


def kv_lists(mask):
    """mask (B, H, n, n) -> (indices (B, H, n, width) int32 ascending, padded with n; counts (B, H, n) int32)."""
    counts = mask.sum(-1, dtype=torch.int32)
    width = int(counts.max())
    n = mask.shape[-1]
    order = torch.arange(n, device=mask.device, dtype=torch.int32).expand_as(mask)
    indices = torch.where(mask, order, n).sort(-1).values[..., :width]
    return indices.contiguous(), counts


if triton is not None:
    @triton.jit
    def _attend(Q, K, V, OUT, IDX, CNT, scale, n, width, heads,
                qsb, qsh, qss, ksb, ksh, kss, vsb, vsh, vss, osb, osh, oss,
                D: tl.constexpr, BM: tl.constexpr, IEEE: tl.constexpr, FP16_PV: tl.constexpr):
        # every tensor is a (B, heads, S, D) view with its own (batch, head, token) strides
        qb, bh = tl.program_id(0), tl.program_id(1)
        b, h = (bh // heads).to(tl.int64), (bh % heads).to(tl.int64)
        rows = tl.arange(0, BM)
        tokens = (qb * BM + rows)[:, None].to(tl.int64)
        d = tl.arange(0, D)
        q = tl.load(Q + b * qsb + h * qsh + tokens * qss + d[None, :])
        k_base = K + b * ksb + h * ksh
        v_base = V + b * vsb + h * vsh
        row = bh.to(tl.int64) * n + qb
        count = tl.load(CNT + row)
        m_i = tl.full((BM,), -float("inf"), tl.float32)
        l_i = tl.zeros((BM,), tl.float32)
        acc = tl.zeros((BM, D), tl.float32)
        for i in range(count):
            kb = tl.load(IDX + row * width + i)
            keys = (kb * BM + rows)[:, None].to(tl.int64)
            k = tl.load(k_base + keys * kss + d[None, :])
            if IEEE:
                qk = tl.dot(q, tl.trans(k), input_precision="ieee")
            else:
                qk = tl.dot(q, tl.trans(k))
            qk = qk * scale
            qk = qk * 1.4426950408889634
            m_ij = tl.maximum(m_i, tl.max(qk, 1))
            alpha = tl.math.exp2(m_i - m_ij)
            p = tl.math.exp2(qk - m_ij[:, None])
            l_i = l_i * alpha + tl.sum(p, 1)
            acc = acc * alpha[:, None]
            v = tl.load(v_base + keys * vss + d[None, :])
            if FP16_PV:
                acc += tl.dot(p.to(tl.float16), v, out_dtype=tl.float16).to(tl.float32)
            elif IEEE:
                acc = tl.dot(p, v, acc, input_precision="ieee")
            else:
                acc = tl.dot(p.to(v.dtype), v, acc)
            m_i = m_ij
        out = acc / l_i[:, None]
        tl.store(OUT + b * osb + h * osh + tokens * oss + d[None, :], out.to(OUT.dtype.element_ty))


def sparse_attention(q, k, v, mask, lists=None, fast=False, num_warps=4, num_stages=3):
    """q, k, v: (B, heads, S, D) views with a contiguous last dimension, each with any strides (for example the
    (B, S, heads, D) projections transposed: no copy needed). The result has v's memory layout, so its transpose back
    to (B, S, heads, D) is free when v is such a view. lists: kv_lists(mask), when one mask serves several calls."""
    b, heads, s, d = q.shape
    n = s // BLOCK
    indices, counts = kv_lists(mask) if lists is None else lists
    fast = fast and q.dtype != torch.float32
    if fast:
        v = v.to(torch.float16)
    q, k, v = (x if x.stride(-1) == 1 else x.contiguous() for x in (q, k, v))
    out = torch.empty_like(v, dtype=q.dtype)
    _attend[(n, b * heads)](q, k, v, out, indices, counts, d ** -0.5, n, indices.shape[-1], heads,
                            *q.stride()[:3], *k.stride()[:3], *v.stride()[:3], *out.stride()[:3],
                            D=d, BM=BLOCK, IEEE=q.dtype == torch.float32, FP16_PV=fast,
                            num_warps=num_warps, num_stages=num_stages, enable_fp_fusion=False)
    return out
