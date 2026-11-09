"""SnapRef: ComfyUI node for the SnapRef reference adapter for Anima (asymmetric attention + cached reference K/V).

The reference runs once per sampling run through its own stream (sigma 0, its own LoRA, RoPE frame t = ref_t,
centred on the target) and every block's self-attention K/V are kept. Each target forward then prepends those
K/V in self-attention, with the target LoRA, inside ComfyUI's own blocks, so any sampler / scheduler works.
The target LoRA is on in every target forward. By default only the positive (cond) branch reads the reference.

strength: a log-scale bias on the attention logits of the reference keys (0 = trained weight; > 0 stronger,
< 0 weaker). weight_1..3: per-reference attention weights (log w added to that reference's keys).
Both are applied without an attention mask: the keys are split into groups (target + weight-1 references, and each
other reference), each group runs the fused attention kernel with its log-sum-exp, and the groups are merged as
softmax over all keys would (out = sum_g w_g e^lse_g o_g / sum_g w_g e^lse_g). Same result as the masked form, at
about the speed of plain attention; falls back to the masked SDPA where the fused kernels are unavailable.

ref_guidance (switch ref_guidance_on): the reference goes into both CFG branches and a post-CFG step adds
(ref_guidance - 1) * (uncond with reference - uncond without reference), then APG (as in ElectronGirl's
ComfyUI-Anima-Ref-Adapter, Apache-2.0). One extra model call per step until ref_end.

Two characters: stitch two references side by side into one image and say who is left / right in the prompt.

Several references of ONE character (e.g. an upper-body shot and a full-body shot): connect image_2 / image_3 or
pass an image batch with use_batch on. Each reference is encoded on its own and the per-block K/V are concatenated,
so the target reads all of them (tested with v1a on 96 unseen characters: closer to the character than any single
reference, never two people; reports/2026-10-31_multi-ref-same-character). multi_layout "stitch" puts them side by
side in one ~ref_megapixels reference instead (what Image Stitch does).

Node: SnapRef (MODEL, CLIP, VAE, reference IMAGE, adapter) -> MODEL for KSampler.
Weight files keep the internal tensor format anima_ref_kv/1 (key prefix anima_ref_kv.*).
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import uuid
import weakref

import torch
import torch.nn.functional as F
from safetensors import safe_open
from safetensors.torch import load_file

import comfy.patcher_extension
from comfy.ldm.anima.model import Anima as AnimaModel
import comfy.samplers
import comfy.utils
import folder_paths

WRAPPER_KEY = "snapref"

NO_REF_KEY = "snapref_off"   # transformer_options flag: run this call without the reference
_STATE = {"adapter": None, "stream": None}   # LoRA hooks apply only while an adapter is active
_adapters: dict[str, "_Adapter"] = {}


def _drop_reference_caches() -> None:
    for ad in _adapters.values():
        ad.cache.clear()


def _hook_memory_release() -> None:
    """Clear the cross-run reference cache together with ComfyUI's own unload / free paths."""
    import comfy.model_management as mm
    for name in ("unload_all_models", "soft_empty_cache"):
        orig = getattr(mm, name, None)
        if orig is None or getattr(orig, "_snapref_hooked", False):
            continue

        def wrapped(*a, _orig=orig, _name=name, **k):
            if _name == "unload_all_models" or k.get("force") or (a and a[0]):
                _drop_reference_caches()
            return _orig(*a, **k)
        wrapped._snapref_hooked = True
        setattr(mm, name, wrapped)


_hook_memory_release()


# Anima-2.9B inserts these blocks into the 28-block base, shifting its original layers.
_INSERTED_29B = frozenset((2, 5, 8, 11, 14, 17, 21, 24, 27, 30, 33, 36))


def _adapter_block_map(indices, model) -> tuple[int, ...]:
    indices = set(indices)
    if not indices:
        raise ValueError("Adapter has no diffusion block weights")
    model_blocks = len(model.blocks)
    if max(indices) + 1 == model_blocks:
        return tuple(range(model_blocks))
    if isinstance(model, AnimaModel) and model_blocks == 40 and indices == set(range(28)):
        return tuple(i for i in range(40) if i not in _INSERTED_29B)
    raise ValueError(f"Adapter covers {max(indices) + 1} blocks but the model has {model_blocks}. "
                     "Only native layouts and the 28-to-40-block Anima-2.9B expansion are supported.")


class _Adapter:
    def __init__(self, path: str):
        tensors = load_file(path)
        with safe_open(path, "pt") as handle:
            md = handle.metadata() or {}
            self.meta = json.loads(md.get("snapref") or md.get("anima_ref_kv") or "{}")
        if self.meta.get("format") != "anima_ref_kv/1":
            raise ValueError(f"{path} is not an anima_ref_kv/1 adapter")
        self.ref_t = int(self.meta.get("ref_t", 10))
        self.modes = list(self.meta.get("modes", ["cs"]))
        self.mode_embed = tensors.get("anima_ref_kv.mode_embed")
        self.lora: dict[str, dict[str, list]] = {}   # module name -> stream -> [down, up, scale]
        for key, value in tensors.items():
            if not key.endswith(".lora_down"):
                continue
            root = key[: -len("lora_down")]
            _, stream, name = root[:-1].split(".", 2)
            down, up = (self._dequant(tensors, root + n) for n in ("lora_down", "lora_up"))
            alpha = float(tensors[root + "alpha"])
            self.lora.setdefault(name, {})[stream] = [down, up, alpha / down.shape[0]]
        self.block_indices = {int(n.split(".")[1]) for n in self.lora if n.startswith("blocks.")}
        self.hooked = weakref.WeakSet()   # diffusion models carrying our hooks (id() is reused after unload)
        self.cache: dict = {}

    @staticmethod
    def _dequant(tensors, key):
        """bf16 matrix; FP8 files (deploy/quantize_adapter_fp8.py) carry a per-row float32 <key>_scale."""
        w = tensors[key]
        if key + "_scale" in tensors:
            w = w.float() * tensors[key + "_scale"]
        return w.to(torch.bfloat16)

    def install(self, dm) -> None:
        """Forward hooks on the targeted Linears (LoRA delta of the active stream) and the self-attention
        record / prepend patch. Both are no-ops unless this adapter is active."""
        block_map = _adapter_block_map(self.block_indices, dm)
        if dm in self.hooked:
            return
        # Resolve everything first; a failed install must not be remembered as successful.
        targets = []
        for name, streams in self.lora.items():
            if name.startswith("blocks."):
                _, index, suffix = name.split(".", 2)
                name = f"blocks.{block_map[int(index)]}.{suffix}"
            module = dm.get_submodule(name)
            targets.append((module, streams))
        for module, streams in targets:

            def hook(mod, args, out, _streams=streams, _me=self):
                if _STATE["adapter"] is not _me or _STATE["stream"] not in _streams:
                    return out
                w = _streams[_STATE["stream"]]
                x = args[0]
                if w[0].device != x.device or w[0].dtype != x.dtype:
                    w[0], w[1] = w[0].to(x.device, x.dtype), w[1].to(x.device, x.dtype)
                return out + F.linear(F.linear(x, w[0]), w[1]) * w[2]
            module.register_forward_hook(hook)
        for index, block in enumerate(dm.blocks):
            attn = block.self_attn
            if getattr(attn, "_ref_kv_state", "missing") != "missing":
                continue
            attn._ref_kv_state = None
            original = attn.forward

            def forward(x, context=None, rope_emb=None, transformer_options={}, _attn=attn, _i=index, _orig=original):
                state = _attn._ref_kv_state
                if state is None:
                    return _orig(x, context, rope_emb=rope_emb, transformer_options=transformer_options)
                q, k, v = _attn.compute_qkv(x, context, rope_emb=rope_emb, transformer_options=transformer_options)
                if "record" in state:
                    state["record"][_i] = (k, v)
                elif state.get("rows") is not None:   # mixed batch: reference only for the rows in state["rows"]
                    out = _rows_attention(q, k, v, state["cache"][_i], state["sizes"], state["biases"], state["rows"],
                                          state.get("row_biases"))
                    if out is not None:
                        return _attn.output_dropout(_attn.output_proj(out))
                    out = _weighted_attention(q, k, v, state["cache"][_i], state["sizes"], state["biases"])   # no fused kernel
                    return _attn.output_dropout(_attn.output_proj(out))
                elif any(b != 0.0 for b in state.get("biases", ())):
                    out = _weighted_attention(q, k, v, state["cache"][_i], state["sizes"], state["biases"])
                    return _attn.output_dropout(_attn.output_proj(out))
                else:
                    k_r, v_r = state["cache"][_i]
                    k = torch.cat([k_r.expand(k.shape[0], *k_r.shape[1:]).to(k.dtype), k], dim=1)
                    v = torch.cat([v_r.expand(v.shape[0], *v_r.shape[1:]).to(v.dtype), v], dim=1)
                return _attn.compute_attention(q, k, v, transformer_options=transformer_options)
            attn.forward = forward
        self.hooked.add(dm)


def _set_attn_state(dm, state) -> None:
    for block in dm.blocks:
        block.self_attn._ref_kv_state = state


def _lse_attention(q, k, v):
    """Fused attention with its log-sum-exp. q, k, v [B, H, S, D] -> out [B, H, S, D] (float32), lse [B, H, S, 1]."""
    if not (q.is_cuda and q.dtype in (torch.float16, torch.bfloat16)):
        raise RuntimeError("no fused kernel")
    try:
        out, lse = torch.ops.aten._scaled_dot_product_flash_attention(q, k, v, 0.0, False, False)[:2]
    except (RuntimeError, AttributeError):
        out, lse = torch.ops.aten._scaled_dot_product_efficient_attention(q, k, v, None, True, 0.0, False)[:2]
    return out.float(), lse.float()[..., :q.shape[2], None]


def _weighted_attention(q, k_t, v_t, kv_ref, sizes, biases):
    """softmax over [K_ref_1 + b_1; ...; K_ref_n + b_n; K_t] without materialising a mask: the target keys plus the
    references with b = 0 form one group, every other reference its own group; each group goes through the fused
    kernel, then the groups are merged by their log-sum-exp. q, k_t, v_t [B, S, H, D]; kv_ref the concatenated
    reference (k, v) [1, sum(sizes), H, D]. Returns [B, S, H * D]."""
    k_r, v_r = kv_ref
    B, S, H, D = q.shape
    kr = k_r.expand(B, *k_r.shape[1:]).to(q.dtype)
    vr = v_r.expand(B, *v_r.shape[1:]).to(q.dtype)
    starts = [sum(sizes[:i]) for i in range(len(sizes))]
    span = lambda t, i: t[:, starts[i]:starts[i] + sizes[i]]   # noqa: E731
    zero = [i for i, b in enumerate(biases) if b == 0.0]
    groups = [(0.0, torch.cat([span(kr, i) for i in zero] + [k_t], dim=1), torch.cat([span(vr, i) for i in zero] + [v_t], dim=1))]
    groups += [(biases[i], span(kr, i), span(vr, i)) for i in range(len(sizes)) if biases[i] != 0.0]
    qh = q.transpose(1, 2)
    try:
        parts = [(b, *_lse_attention(qh, kk.transpose(1, 2), vv.transpose(1, 2))) for b, kk, vv in groups]
    except RuntimeError:   # CPU / fp32 / no fused kernel: one masked SDPA over all keys
        return _masked_attention(q, k_t, v_t, kv_ref, sizes, biases)
    m = torch.stack([lse + b for b, _, lse in parts]).amax(dim=0)
    num, den = 0.0, 0.0
    for b, out, lse in parts:
        w = torch.exp(lse + b - m)
        num = num + w * out
        den = den + w
    out = (num / den).to(q.dtype)
    return out.transpose(1, 2).reshape(B, S, H * D)


def _rows_attention(q, k_t, v_t, kv_ref, sizes, biases, rows, row_biases=None):
    """One call for a batch where only some rows read the reference (cond reads it, uncond does not): plain
    attention over the target keys for every row, plus the reference groups merged by log-sum-exp into the rows
    that read them. Rows without the reference get exactly the plain attention. row_biases: optional extra log bias
    per selected row, added to every reference group of that row (Fidelity: uncond rows at log(1 - f))."""
    B, S, H, D = q.shape
    qh, kt, vt = q.transpose(1, 2), k_t.transpose(1, 2), v_t.transpose(1, 2)
    try:
        out_t, lse_t = _lse_attention(qh, kt, vt)
    except RuntimeError:   # no fused kernel: fall back to the split path (two calls)
        return None
    sel = torch.as_tensor(rows, device=q.device)
    k_r, v_r = kv_ref
    starts = [sum(sizes[:i]) for i in range(len(sizes))]
    qs = qh.index_select(0, sel)
    parts = [(0.0, out_t.index_select(0, sel), lse_t.index_select(0, sel))]
    for i, b in enumerate(biases):
        kr = k_r[:, starts[i]:starts[i] + sizes[i]].expand(len(rows), -1, -1, -1).to(q.dtype).transpose(1, 2)
        vr = v_r[:, starts[i]:starts[i] + sizes[i]].expand(len(rows), -1, -1, -1).to(q.dtype).transpose(1, 2)
        parts.append((b, *_lse_attention(qs, kr, vr)))
    if row_biases is not None:
        extra = torch.as_tensor(row_biases, device=q.device, dtype=torch.float32).view(-1, 1, 1, 1)
        parts = [parts[0]] + [(b + extra, o, lse) for b, o, lse in parts[1:]]   # target group stays at 0
    m = torch.stack([(lse + b).expand_as(parts[0][2]) for b, _, lse in parts]).amax(dim=0)
    num, den = 0.0, 0.0
    for b, o, lse in parts:
        w = torch.exp(lse + b - m)
        num, den = num + w * o, den + w
    out = out_t.clone()
    out.index_copy_(0, sel, num / den)
    return out.to(q.dtype).transpose(1, 2).reshape(B, S, H * D)


def _masked_attention(q, k_t, v_t, kv_ref, sizes, biases):
    """Reference implementation (and fallback) of _weighted_attention: SDPA with an additive key mask."""
    k_r, v_r = kv_ref
    B, S, H, D = q.shape
    k = torch.cat([k_r.expand(B, *k_r.shape[1:]).to(q.dtype), k_t], dim=1).transpose(1, 2)
    v = torch.cat([v_r.expand(B, *v_r.shape[1:]).to(q.dtype), v_t], dim=1).transpose(1, 2)
    n = k.shape[2]
    pad = (-n) % 16
    if pad:
        k, v = F.pad(k, (0, 0, 0, pad)), F.pad(v, (0, 0, 0, pad))
    mask = torch.zeros(1, 1, 1, n + pad, device=q.device, dtype=q.dtype)
    start = 0
    for size, bias in zip(sizes, biases):
        mask[..., start:start + size] = bias
        start += size
    if pad:
        mask[..., n:] = float("-inf")
    out = F.scaled_dot_product_attention(q.transpose(1, 2), k, v, attn_mask=mask.expand(B, H, S, n + pad))
    return out.transpose(1, 2).reshape(B, S, H * D)


def _rope(pe, t, h, w):
    """VideoRopePosition3DEmb for explicit per-token positions (train/anima_env.rope_from_positions)."""
    def rot(pos, freqs):
        angle = torch.outer(pos.float(), freqs)
        return torch.stack([angle.cos(), -angle.sin(), angle.sin(), angle.cos()], dim=-1)
    dev = t.device
    emb = torch.cat([rot(t, 1.0 / ((10000.0 * pe.t_ntk_factor) ** pe.dim_temporal_range.to(dev))),
                     rot(h, 1.0 / ((10000.0 * pe.h_ntk_factor) ** pe.dim_spatial_range.to(dev))),
                     rot(w, 1.0 / ((10000.0 * pe.w_ntk_factor) ** pe.dim_spatial_range.to(dev)))], dim=-2)
    return emb.reshape(*emb.shape[:-1], 2, 2).float()


@torch.no_grad()
def _encode_reference(adapter: _Adapter, dm, ref, context, target_hw, mode: str):
    """train/asym.encode_reference: per-block (k, v) of the reference stream."""
    x_emb, _, _ = dm.prepare_embedded_sequence(ref, fps=None, padding_mask=None)
    _, _, hp, wp, _ = x_emb.shape
    h0 = round((target_hw[0] // 2) / 2 - hp / 2)
    w0 = round((target_hw[1] // 2) / 2 - wp / 2)
    hh, ww = torch.meshgrid(torch.arange(hp, device=ref.device) + h0, torch.arange(wp, device=ref.device) + w0, indexing="ij")
    rope = _rope(dm.pos_embedder, torch.full_like(hh, adapter.ref_t).flatten(), hh.flatten(), ww.flatten())
    t_emb, adaln = dm.t_embedder[1](dm.t_embedder[0](torch.zeros(ref.shape[0], 1, device=ref.device)).to(x_emb.dtype))
    t_emb = dm.t_embedding_norm(t_emb)
    if adapter.mode_embed is not None and mode in adapter.modes:
        t_emb = t_emb + adapter.mode_embed[adapter.modes.index(mode)].to(t_emb)[None, None, :]
    record = [None] * len(dm.blocks)
    _set_attn_state(dm, {"record": record})
    _STATE.update(adapter=adapter, stream="ref")
    try:
        # as MiniTrainDIT.forward: fp32 residual stream under fp16 compute (fp16 overflows -> NaN K/V -> black image)
        x = x_emb.float() if x_emb.dtype == torch.float16 else x_emb
        for block in dm.blocks:
            x = block(x, t_emb, context, rope_emb_L_1_1_D=rope.unsqueeze(1).unsqueeze(0), adaln_lora_B_T_3D=adaln,
                      extra_per_block_pos_emb=None, transformer_options={})
    finally:
        _set_attn_state(dm, None)
        _STATE.update(adapter=None, stream=None)
    return record


def _concat_kv(records: list[list]) -> list:
    if len(records) == 1:
        return records[0]
    return [(torch.cat([r[i][0] for r in records], dim=1), torch.cat([r[i][1] for r in records], dim=1))
            for i in range(len(records[0]))]


def _model_token(dm) -> str:
    """Cache key for this model object (id() is reused after unload)."""
    token = getattr(dm, "_snapref_token", None)
    if token is None:
        token = uuid.uuid4().hex
        dm._snapref_token = token
    return token


def _ref_digest(ref_latents: list, ref_cond, mode: str) -> str:
    """Content key of a reference set: same pictures + caption + mode -> same K/V."""
    h = hashlib.sha1(mode.encode())
    for lat in ref_latents:
        t = lat.detach().float().cpu().contiguous()
        h.update(str(tuple(t.shape)).encode()); h.update(t.numpy().tobytes())
    cross = ref_cond[0].detach().float().cpu().contiguous()
    h.update(str(tuple(cross.shape)).encode()); h.update(cross.numpy().tobytes())
    return h.hexdigest()


def _make_wrapper(adapter: _Adapter, ref_latents: list, ref_cond, mode: str, in_uncond: bool, bias: float = 0.0,
                  weights: list | None = None, uncond_bias: float | None = None):
    """uncond_bias (Fidelity < 1): the negative branch also reads the reference with this extra log
    bias. Needs the one-call mixed path (CUDA, fp16/bf16); elsewhere the negative branch reads it fully."""
    weights = list(weights or [1.0] * len(ref_latents))
    digest = _ref_digest(ref_latents, ref_cond, mode)
    biases = [bias + math.log(w) for w in weights]   # weight-0 references were dropped before encoding
    def wrapper(executor, x, timesteps, context, fps=None, padding_mask=None, **kwargs):
        dm = executor.class_obj
        adapter.install(dm)
        options = kwargs.get("transformer_options", {})
        key = (digest, _model_token(dm), tuple(x.shape[-2:]), x.dtype, x.device)
        if key not in adapter.cache:
            adapter.cache.clear()   # ~0.9 GB of K/V per 1 MP reference (bf16); keep one set
            cross, meta = ref_cond
            ids, weights = meta.get("t5xxl_ids"), meta.get("t5xxl_weights")
            ctx = dm.preprocess_text_embeds(cross.to(x.device, x.dtype),
                                            None if ids is None else ids.unsqueeze(0).to(x.device),
                                            None if weights is None else weights.unsqueeze(0).unsqueeze(-1).to(x.device, x.dtype))
            records = [_encode_reference(adapter, dm, lat.to(x.device, x.dtype), ctx, tuple(x.shape[-2:]), mode)
                       for lat in ref_latents]
            adapter.cache[key] = (_concat_kv(records), [r[0][0].shape[1] for r in records])
        cache, sizes = adapter.cache[key]
        flags = options.get("cond_or_uncond") or [0]
        if options.get(NO_REF_KEY):   # the extra reference-free call of ref_guidance
            use = [False] * len(flags)
        else:
            use = [f == 0 or in_uncond for f in flags]   # 0 = positive, 1 = negative

        def run(xs, ts, cs, with_ref, kw):
            # the "tgt" LoRA is on in every target forward, with or without the reference (as in training)
            _set_attn_state(dm, {"cache": cache, "sizes": sizes, "biases": biases} if with_ref else None)
            _STATE.update(adapter=adapter, stream="tgt")
            try:
                return executor(xs, ts, cs, fps, padding_mask, **kw)
            finally:
                _set_attn_state(dm, None)
                _STATE.update(adapter=None, stream=None)
        n = x.shape[0] // len(flags)
        if uncond_bias is not None and not options.get(NO_REF_KEY) and any(f == 1 for f in flags) \
                and x.is_cuda and x.dtype in (torch.float16, torch.bfloat16):
            # Fidelity: every row reads the reference, the uncond rows weaker (one call)
            rows = list(range(x.shape[0]))
            row_biases = [uncond_bias if flags[r // n] == 1 else 0.0 for r in rows]
            _set_attn_state(dm, {"cache": cache, "sizes": sizes, "biases": biases, "rows": rows, "row_biases": row_biases})
            _STATE.update(adapter=adapter, stream="tgt")
            try:
                return executor(x, timesteps, context, fps, padding_mask, **kwargs)
            finally:
                _set_attn_state(dm, None)
                _STATE.update(adapter=None, stream=None)
        if uncond_bias is not None:
            use = [True] * len(flags)   # no fused kernel: the negative branch reads the reference fully
        if all(use) or not any(use):
            return run(x, timesteps, context, use[0], kwargs)
        # mixed cond/uncond batch (rare for Anima: ComfyUI batches cond and uncond only when their text lengths match):
        # run the two parts separately
        # shortcut: only x / timesteps / context are split; per-batch extras in kwargs (e.g. ControlNet) are not
        outs = []
        for i, u in enumerate(use):
            sl = slice(i * n, (i + 1) * n)
            outs.append(run(x[sl], timesteps[sl], context[sl], u, kwargs))
        return torch.cat(outs, dim=0)
    return wrapper


def _make_outer(adapter: _Adapter):
    """Kept for workflows that carry it; the reference cache now lives across runs (content-keyed, one entry),
    so a second image with the same reference skips the reference encoding."""
    def wrapper(executor, *args, **kwargs):
        return executor(*args, **kwargs)
    return wrapper


def _correct(guided, pos, correction, rescale_phi=0.5):
    """APG (drop the update's component parallel to the cond prediction) or CFG rescale, in x0 space
    (as ElectronGirl/ComfyUI-Anima-Ref-Adapter, Apache-2.0)."""
    dims = tuple(range(1, pos.ndim))
    if correction == "apg":
        update = (guided - pos).double()
        unit = F.normalize(pos.double().flatten(1), dim=1).view_as(pos)
        return pos + (update - (update * unit).sum(dim=dims, keepdim=True) * unit).to(pos.dtype)
    if correction == "rescale":
        ratio = pos.std(dim=dims, keepdim=True) / guided.std(dim=dims, keepdim=True)
        return rescale_phi * guided * ratio + (1 - rescale_phi) * guided
    return guided


def _make_ref_guidance(ref_guidance: float, correction: str, ref_end: float):
    """Post-CFG: guided = base + rg * (uncond_ref - base) + cfg * (cond_ref - uncond_ref), base = uncond without
    the reference (one extra model call per step, until ref_end). KSampler's CFG already gives
    uncond_ref + cfg * (cond_ref - uncond_ref), so add (rg - 1) * (uncond_ref - base)."""
    warned = []

    def post_cfg(args):
        guided, pos = args["denoised"], args["cond_denoised"]
        ms = args["model"].model_sampling
        if ref_end >= 1.0 or float(args["sigma"].flatten()[0]) >= ms.percent_to_sigma(ref_end) - 1e-5:
            cond, ref = (args["uncond"], args["uncond_denoised"]) if args["uncond"] is not None else (args["cond"], pos)
            options = args["model_options"].copy()
            options["transformer_options"] = {**options.get("transformer_options", {}), NO_REF_KEY: True}
            if "model_function_wrapper" in options and not warned:
                # kept on purpose: Layer Replay also lives there, and the extra call needs it; Spectrum counts calls
                logging.warning("[SnapRef] ref_guidance_on with a model_function_wrapper (Spectrum, Layer Replay ...): "
                                "Spectrum-type forecasting breaks on the extra call; turn ref_guidance_on off with Spectrum")
                warned.append(True)
            (base,) = comfy.samplers.calc_cond_batch(args["model"], [cond], args["input"], args["sigma"], options)
            guided = guided + (ref_guidance - 1.0) * (ref - base)
        return _correct(guided, pos, correction)
    return post_cfg


def _reference_images(inputs: list, use_batch: bool, weights: list) -> tuple[list, list]:
    """IMAGE tensors [B, H, W, C] -> single images [1, H, W, C] (first of each batch unless use_batch) and the
    weight of each (a batch shares its input's weight). Images with weight 0 are dropped (no encoding cost)."""
    out, ws = [], []
    for img, w in zip(inputs, weights):
        if img is None or w <= 0:
            continue
        for i in range(img.shape[0] if use_batch else 1):
            out.append(img[i:i + 1])
            ws.append(float(w))
    if not out:
        raise ValueError("SnapRef: every reference has weight 0")
    return out, ws


def _stitch(refs: list) -> torch.Tensor:
    """Side by side at the first image's height on white (core Image Stitch, direction right, match size)."""
    h = refs[0].shape[1]
    parts = []
    for px in refs:
        c = px[..., :3].movedim(-1, 1)
        w = max(1, round(c.shape[-1] * h / c.shape[-2]))
        parts.append(comfy.utils.common_upscale(c, w, h, "lanczos", "disabled").movedim(1, -1))
    return torch.cat(parts, dim=2)


def _encode_image(model, vae, image, megapixels: float):
    """One reference image [1, H, W, C] -> model-space latent [1, 16, 1, h, w], shrunk (never enlarged) to
    megapixels with the aspect kept, sides multiples of 16."""
    pixels = image[:1].movedim(-1, 1)
    h, w = pixels.shape[-2:]
    s = min(1.0, (megapixels * 1024 * 1024 / (w * h)) ** 0.5)
    width, height = max(16, int(w * s) // 16 * 16), max(16, int(h * s) // 16 * 16)
    pixels = comfy.utils.common_upscale(pixels, width, height, "lanczos", "disabled").movedim(1, -1)
    latent = vae.encode(pixels[..., :3])
    if latent.ndim == 4:
        latent = latent.unsqueeze(2)
    return model.get_model_object("process_latent_in")(latent), (width, height)


def _adapter_files():
    names = folder_paths.get_filename_list("loras")
    return [n for n in names if "snapref" in n.lower() or "anima_ref_kv" in n] or names


class SnapRef:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",),
            "clip": ("CLIP", {"tooltip": "encodes ref_caption for the reference stream"}),
            "vae": ("VAE",),
            "image": ("IMAGE", {"tooltip": "the reference (first image of the batch)"}),
            "adapter": (_adapter_files(),),
            "mode": (["cs", "char"], {"tooltip": "cs = character and style from the reference; "
                                                 "char = character only (put artist tags in the prompt)"}),
            "ref_in_uncond": ("BOOLEAN", {"default": False, "tooltip": "off (trained default): only the positive "
                                          "branch reads the reference, so CFG pushes toward it. on: weaker, closer to the prompt"}),
            "ref_megapixels": ("FLOAT", {"default": 1.0, "min": 0.25, "max": 2.0, "step": 0.05,
                                         "tooltip": "the reference is shrunk (never enlarged) to this area, aspect kept; trained at <= 1.0"}),
        }, "optional": {
            "strength": ("FLOAT", {"default": 0.0, "min": -3.0, "max": 3.0, "step": 0.1,
                                   "tooltip": "attention to the reference, log scale. 0 = as trained; +1 = about 2.7x more, "
                                              "-1 = about 2.7x less. Non-zero values make sampling about 1.3x slower"}),
            "ref_caption": ("STRING", {"multiline": True, "default": "",
                                       "tooltip": "optional appearance tags of the reference (gender, solo, hair, eyes, outfit); "
                                                  "no name or artist. Empty works."}),
            "ref_guidance_on": ("BOOLEAN", {"default": False, "tooltip": "separate reference guidance (one extra model call "
                                            "per step until ref_end). Puts the reference in both CFG branches and pushes "
                                            "from 'no reference' toward it by ref_guidance; ignores ref_in_uncond"}),
            "ref_guidance": ("FLOAT", {"default": 4.5, "min": 0.0, "max": 15.0, "step": 0.1,
                                       "tooltip": "reference strength, separate from cfg. Equal to cfg = the same strength as "
                                                  "with ref_guidance off (plus APG); above cfg = closer to the reference, "
                                                  "below = closer to the prompt; 1 = no push"}),
            "correction": (["apg", "rescale", "none"], {"tooltip": "keeps colors in check when ref_guidance is on"}),
            "ref_end": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                                  "tooltip": "last step with the extra call, as a fraction of the denoising; ~0.6 is faster"}),
            "image_2": ("IMAGE", {"tooltip": "another reference of the SAME character (e.g. full body when image is an "
                                             "upper-body shot). For two different characters, stitch them into image instead"}),
            "image_3": ("IMAGE", {"tooltip": "a third reference of the same character"}),
            "use_batch": ("BOOLEAN", {"default": False, "tooltip": "use every image of each IMAGE batch as a reference of "
                                      "the same character (off: only the first image of each input)"}),
            "multi_layout": (["separate", "stitch"], {"tooltip": "several references: separate = each at ref_megapixels, "
                             "encoded on its own (sharper, slower with more references); stitch = side by side in one "
                             "ref_megapixels image (as Image Stitch, same speed as one reference)"}),
            "weight_1": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05,
                                   "tooltip": "how much image (the first reference) counts; 1 = as trained. Only with "
                                              "several references in multi_layout separate. No speed cost"}),
            "weight_2": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05,
                                   "tooltip": "how much image_2 counts (e.g. 0.4: mostly the first image, a little of this "
                                              "one); 0 = ignored"}),
            "weight_3": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05, "tooltip": "how much image_3 counts"}),
            "fidelity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05,
                                   "tooltip": "1 = keep every detail of the picture; lower = follow the prompt more freely. "
                                              "Ignored when ref_in_uncond or ref_guidance_on is on"}),
        }}

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply"
    CATEGORY = "SnapRef"

    def apply(self, model, clip, vae, image, adapter, mode, ref_in_uncond, ref_megapixels, strength=0.0, ref_caption="",
              ref_guidance_on=False, ref_guidance=4.5, correction="apg", ref_end=1.0, image_2=None, image_3=None,
              use_batch=False, multi_layout="separate", weight_1=1.0, weight_2=1.0, weight_3=1.0, fidelity=1.0):
        path = folder_paths.get_full_path_or_raise("loras", adapter)
        if path not in _adapters:
            _adapters[path] = _Adapter(path)
        ad = _adapters[path]
        _adapter_block_map(ad.block_indices, model.get_model_object("diffusion_model"))
        refs, weights = _reference_images([image, image_2, image_3], use_batch, [weight_1, weight_2, weight_3])
        if len(refs) > 1 and multi_layout == "stitch":
            refs, weights = [_stitch(refs)], [1.0]
        latents, sizes = [], []
        for px in refs:
            lat, size = _encode_image(model, vae, px, ref_megapixels)
            latents.append(lat)
            sizes.append(size)
        width, height = sizes[0]
        cond = clip.encode_from_tokens_scheduled(clip.tokenize(ref_caption.strip()))[0]
        uncond_bias = None if fidelity >= 1.0 or ref_in_uncond or ref_guidance_on else math.log(max(1.0 - float(fidelity), 1e-6))
        m = model.clone()
        m.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY,
                               _make_wrapper(ad, latents, cond, mode, ref_in_uncond or ref_guidance_on, strength, weights, uncond_bias))
        # outermost: a wrapper that runs the blocks itself without calling executor (Anzhc Mod Guidance) would skip ours
        dm_wrappers = m.wrappers[comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL]
        m.wrappers[comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL] = {WRAPPER_KEY: dm_wrappers.pop(WRAPPER_KEY), **dm_wrappers}
        m.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.OUTER_SAMPLE, WRAPPER_KEY, _make_outer(ad))
        if ref_guidance_on:
            m.set_model_sampler_post_cfg_function(_make_ref_guidance(ref_guidance, correction, ref_end))
        logging.info(f"[SnapRef] {adapter} step {ad.meta.get('step')}, "
                     f"reference {', '.join(f'{a}x{b} w{w:g}' for (a, b), w in zip(sizes, weights))}, mode {mode}, "
                     f"strength {strength}, fidelity {fidelity}, ref_guidance {ref_guidance if ref_guidance_on else 'off'}")
        return (m,)


try:   # package import inside ComfyUI; plain file import in tests
    from . import simple as _simple   # noqa: E402
except ImportError:
    import importlib.util as _ilu
    import os as _os
    _spec = _ilu.spec_from_file_location("snapref_simple", _os.path.join(_os.path.dirname(__file__), "simple.py"))
    _simple = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_simple)

import types as _types   # noqa: E402

# the simple node reaches the core through a namespace (works both as a package module and as a loose file)
SnapRefSimple = _simple.make_simple_node(_types.SimpleNamespace(
    _adapters=_adapters, _Adapter=_Adapter, _encode_image=_encode_image, _make_wrapper=_make_wrapper,
    _adapter_block_map=_adapter_block_map, WRAPPER_KEY=WRAPPER_KEY))
WEB_DIRECTORY = "./web"
# "SnapRef" keeps its class name so saved workflows still load; it is shown as SnapRef (Advanced)
NODE_CLASS_MAPPINGS = {"SnapRefSimple": SnapRefSimple, "SnapRef": SnapRef}
NODE_DISPLAY_NAME_MAPPINGS = {"SnapRefSimple": "SnapRef", "SnapRef": "SnapRef (Advanced)"}
