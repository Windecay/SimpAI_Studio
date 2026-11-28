"""NABLA sparse self-attention of the reference (core/components/model/utils.py nablaT_v2_doc, nn.py attention_flex).

Tokens are reordered into blocks of 8x8 latent pixels of one frame (64 tokens, raster order inside the block, blocks in
(frame, row, column) order). Per head, the block means of q and k give a block-to-block softmax; a query block keeps
the key blocks holding the top `P` of its mass ("topcdf"), OR every key block within a (wT, wH, wW) window of the
block grid. Attention then runs exactly over the kept 64-token blocks.

`sparse_attention` gathers each query block's kept key blocks and runs SDPA over them: plain torch, never a
tokens x tokens matrix; the fallback where the Triton kernel (kandinsky_sr/kernels/nabla.py) does not run.
"""
import math

import torch
import torch.nn.functional as F

from ..kernels import nabla as knabla

BLOCK = 8
BLOCK_TOKENS = BLOCK * BLOCK


class Grid:
    """Token grid of one DiT call and the NABLA settings of the checkpoint (transformer config attention_params)."""

    def __init__(self, t, h, w, P, wT, wH, wW, add_sta=True):
        if h % BLOCK or w % BLOCK:
            raise ValueError(f"NABLA needs a latent tile divisible by {BLOCK}, got {h}x{w}")
        self.t, self.h, self.w = t, h, w
        self.P, self.window, self.add_sta = P, (wT, wH, wW), add_sta

    @property
    def blocks(self):
        return self.t, self.h // BLOCK, self.w // BLOCK

    def sta(self, device):
        """(n, n) sliding window on the (frame, row, column) block grid (utils.py:217 fast_sta_nabla)."""
        near = []
        for size, window in zip(self.blocks, self.window):
            r = torch.arange(size, device=device)
            near.append((r[:, None] - r[None, :]).abs() <= window // 2)
        dt, dh, dw = near
        n = math.prod(self.blocks)
        return (dt[:, None, None, :, None, None] & dh[None, :, None, None, :, None] & dw[None, None, :, None, None, :]).reshape(n, n)


def to_blocks(x, grid):
    """(B, T*H*W, ...) raster order -> block order (utils.py:133 local_patching with (1, 8, 8))."""
    b, rest = x.shape[0], x.shape[2:]
    t, hb, wb = grid.blocks
    return x.view(b, t, hb, BLOCK, wb, BLOCK, *rest).transpose(3, 4).reshape(b, t * grid.h * grid.w, *rest)


def from_blocks(x, grid):
    b, rest = x.shape[0], x.shape[2:]
    t, hb, wb = grid.blocks
    return x.view(b, t, hb, wb, BLOCK, BLOCK, *rest).transpose(3, 4).reshape(b, t * grid.h * grid.w, *rest)


def block_mask(q, k, grid):
    """q, k: (B, heads, S, D) in block order -> bool (B, heads, n, n), query block x key block.

    Same arithmetic as nablaT_v2_doc under the reference's bf16 autocast: block means and their product in the
    input dtype, softmax in fp32 (an autocast fp32 op), ascending sort and cumulative sum in fp32."""
    b, heads, s, d = q.shape
    n = s // BLOCK_TOKENS
    qa = q.view(b, heads, n, BLOCK_TOKENS, d).mean(-2)
    ka = k.view(b, heads, n, BLOCK_TOKENS, d).mean(-2)
    probs = torch.softmax((qa @ ka.transpose(-1, -2)).float() / math.sqrt(d), dim=-1)
    values, order = probs.sort(dim=-1)
    keep = values.cumsum_(-1) >= 1 - grid.P
    mask = torch.zeros_like(keep).scatter_(-1, order, keep)
    if grid.add_sta:
        mask |= grid.sta(q.device)
    return mask


def sparse_attention(q, k, v, mask, budget=1 << 30):
    """Exact attention of each 64-token query block over its kept key blocks. q, k, v: (B, heads, S, D).

    Rows (batch, head, query block) are sorted by how many key blocks they keep and taken in chunks, so a chunk's
    gathered keys are padded only to its own widest row."""
    b, heads, s, d = q.shape
    n = s // BLOCK_TOKENS
    counts = mask.sum(-1).flatten()
    width = int(counts.max())
    index = torch.argsort((~mask).to(torch.uint8), dim=-1, stable=True)[..., :width].reshape(-1, width)  # kept first
    qb, kb, vb = (x.reshape(b * heads, n, BLOCK_TOKENS, d) for x in (q, k, v))
    counts, rows = counts.sort()
    widths = counts.tolist()
    head = rows // n  # (batch, head) of the row
    out = torch.empty_like(qb).view(-1, BLOCK_TOKENS, d)
    per_row = 2 * BLOCK_TOKENS * d * q.element_size()  # gathered keys and values per kept block
    start = 0
    while start < len(widths):
        stop = min(len(widths), start + max(1, budget // (per_row * widths[start])))
        width = widths[stop - 1]
        r, h = rows[start:stop], head[start:stop, None]
        sel = index[r, :width]
        keys = kb[h, sel].reshape(-1, width * BLOCK_TOKENS, d)
        values = vb[h, sel].reshape(-1, width * BLOCK_TOKENS, d)
        keep = (torch.arange(width, device=q.device) < counts[start:stop, None])
        keep = keep[:, None, :, None].expand(-1, -1, -1, BLOCK_TOKENS).reshape(-1, 1, width * BLOCK_TOKENS)
        out[r] = F.scaled_dot_product_attention(qb.view(-1, BLOCK_TOKENS, d)[r], keys, values, attn_mask=keep)
        start = stop
    return out.view(b, heads, s, d)


def attention(q, k, v, grid, kernels=None):
    """q, k, v: (B, S, heads, D) in block order -> (B, S, heads * D). kernels "exact" / "fast": the Triton kernel of
    kandinsky_sr/kernels/nabla.py on v's memory as it is; None: plain torch."""
    qt, kt = q.transpose(1, 2).contiguous(), k.transpose(1, 2).contiguous()
    mask = block_mask(qt, kt, grid)
    if kernels is not None:
        return knabla.sparse_attention(qt, kt, v.transpose(1, 2), mask, fast=kernels == "fast").transpose(1, 2).flatten(2)
    out = sparse_attention(qt, kt, v.transpose(1, 2).contiguous(), mask)
    return out.transpose(1, 2).flatten(2)
