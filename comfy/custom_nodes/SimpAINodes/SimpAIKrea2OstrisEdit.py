"""Krea2 ai-toolkit edit LoRA support.

Cached reference attention is adapted from ostris/ComfyUI-Krea2-Ostris-Edit.
Copyright (c) 2026 Ostris, LLC. See SimpAIKrea2OstrisEdit.LICENSE.
The non-cached path uses ComfyUI's native index_timestep_zero implementation.
"""

import torch
import torch.nn.functional as F
from einops import rearrange

import comfy.patcher_extension as pe
import comfy.utils
from comfy.ldm.flux.layers import timestep_embedding
from comfy.ldm.flux.math import apply_rope
from comfy.ldm.krea2.model import SingleStreamDiT
from comfy.ldm.modules.attention import optimized_attention_masked


def _pack_refs(dit, ref_latents, batch_size, device, dtype):
    tokens, positions = [], []
    for index, ref in enumerate(ref_latents, 1):
        if ref.ndim == 5:
            ref = ref.movedim(2, 1).flatten(0, 1)
        ref = comfy.utils.repeat_to_batch_size(ref.to(device=device, dtype=dtype), batch_size)
        tok, pos, _, _ = dit.process_img(ref, index=index)
        tokens.append(tok)
        positions.append(pos)
    return torch.cat(tokens, dim=1), torch.cat(positions, dim=1)


def _attention_kv(attn, x, freqs, transformer_options, capture=None, cached=None):
    q, k, v, gate = attn.wq(x), attn.wk(x), attn.wv(x), attn.gate(x)
    q = rearrange(q, "b l (h d) -> b h l d", h=attn.heads)
    k = rearrange(k, "b l (h d) -> b h l d", h=attn.kvheads)
    v = rearrange(v, "b l (h d) -> b h l d", h=attn.kvheads)
    q, k = attn.qknorm(q, k)
    if freqs is not None:
        q, k = apply_rope(q, k, freqs)
    if capture is not None:
        capture.append((k, v))
    if cached is not None:
        k = torch.cat((k, cached[0].to(k)), dim=2)
        v = torch.cat((v, cached[1].to(v)), dim=2)
    if attn.kvheads != attn.heads:
        repeats = attn.heads // attn.kvheads
        k = k.repeat_interleave(repeats, dim=1)
        v = v.repeat_interleave(repeats, dim=1)
    out = optimized_attention_masked(
        q, k, v, attn.heads, mask=None, skip_reshape=True,
        transformer_options=transformer_options,
    )
    return attn.wo(out * F.sigmoid(gate))


def _block_kv(block, x, vec, freqs, transformer_options, capture=None, cached=None):
    prescale, preshift, pregate, postscale, postshift, postgate = block.mod(vec)
    x = x + pregate * _attention_kv(
        block.attn, (1 + prescale) * block.prenorm(x) + preshift,
        freqs, transformer_options, capture=capture, cached=cached,
    )
    return x + postgate * block.mlp((1 + postscale) * block.postnorm(x) + postshift)


def _precompute_ref_kv(dit, x, timesteps, ref_latents, transformer_options):
    batch_size = x.shape[0] * (x.shape[2] if x.ndim == 5 else 1)
    tokens, positions = _pack_refs(dit, ref_latents, batch_size, x.device, x.dtype)
    hidden = dit.first(tokens)
    t0 = dit.tmlp(
        timestep_embedding(torch.zeros_like(timesteps), dit.tdim)
        .unsqueeze(1).to(hidden.dtype)
    )
    vec = dit.tproj(t0)
    freqs = dit.pe_embedder(positions)
    options = transformer_options.copy()
    options.update(total_blocks=len(dit.blocks), block_type="single", img_slice=[0, hidden.shape[1]])
    result = []
    for index, block in enumerate(dit.blocks):
        options["block_index"] = index
        capture = []
        hidden = _block_kv(block, hidden, vec, freqs, options, capture=capture)
        result.append(capture[0])
    return result


def _forward_cached(dit, x, timesteps, context, ref_kv, transformer_options):
    temporal_shape = x.shape if x.ndim == 5 else None
    if temporal_shape is not None:
        x = x.movedim(2, 1).flatten(0, 1)
    batch_size, _, original_h, original_w = x.shape
    image, image_pos, height, width = dit.process_img(x)
    image = dit.first(image)
    time = dit.tmlp(timestep_embedding(timesteps, dit.tdim).unsqueeze(1).to(image.dtype))
    vec = dit.tproj(time)
    context = dit._unpack_context(context)
    context = dit.txtfusion(context, mask=None, transformer_options=transformer_options)
    context = dit.txtmlp(context)
    text_length, image_length = context.shape[1], image.shape[1]
    hidden = torch.cat((context, image), dim=1)
    text_pos = torch.zeros(batch_size, text_length, 3, device=x.device, dtype=torch.float32)
    freqs = dit.pe_embedder(torch.cat((text_pos, image_pos), dim=1))
    options = transformer_options.copy()
    options.update(
        total_blocks=len(dit.blocks), block_type="single",
        img_slice=[text_length, hidden.shape[1]],
    )
    for index, (block, cached) in enumerate(zip(dit.blocks, ref_kv)):
        options["block_index"] = index
        hidden = _block_kv(block, hidden, vec, freqs, options, cached=cached)
    out = dit.last(hidden, time)[:, text_length:text_length + image_length, :]
    out = rearrange(
        out, "b (h w) (c ph pw) -> b c (h ph) (w pw)",
        h=height, w=width, c=dit.channels, ph=dit.patch, pw=dit.patch,
    )[:, :, :original_h, :original_w]
    if temporal_shape is not None:
        out = out.reshape(
            temporal_shape[0], temporal_shape[2], dit.channels, original_h, original_w,
        ).movedim(1, 2)
    return out


class SimpAIKrea2OstrisEditModelPatch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "kv_cache": ("BOOLEAN", {"default": False}),
            },
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "patch"
    CATEGORY = "SimpAI/Krea2"
    DESCRIPTION = "Krea2 ai-toolkit edit LoRAs. Enable kv_cache only for LoRAs trained with it."

    def patch(self, model, kv_cache=False):
        if not isinstance(model.get_model_object("diffusion_model"), SingleStreamDiT):
            raise ValueError("SimpAI Krea2 Edit requires a Krea2 diffusion model.")
        patched = model.clone()
        state = {"active": False, "caches": []}

        def sample(executor, *args, **kwargs):
            # Sampling boundaries also cover repeated one-step runs and exceptions.
            state["caches"].clear()
            state["active"] = True
            try:
                return executor(*args, **kwargs)
            finally:
                state["caches"].clear()
                state["active"] = False

        def forward(executor, x, timesteps, context, attention_mask=None,
                    ref_latents=None, transformer_options=None, **kwargs):
            options = transformer_options if transformer_options is not None else {}
            if not ref_latents or not kv_cache:
                if ref_latents:
                    kwargs["ref_latents_method"] = "index_timestep_zero"
                return executor(
                    x, timesteps, context, attention_mask=attention_mask,
                    ref_latents=ref_latents, transformer_options=options, **kwargs,
                )

            dit = executor.class_obj
            batch_size = x.shape[0] * (x.shape[2] if x.ndim == 5 else 1)
            key = (batch_size, x.device, x.dtype)
            ref_kv = None
            for entry in state["caches"]:
                if entry["key"] == key and len(entry["refs"]) == len(ref_latents):
                    if all(
                        saved.device == ref.device and saved.dtype == ref.dtype
                        and torch.equal(saved, ref)
                        for saved, ref in zip(entry["refs"], ref_latents)
                    ):
                        ref_kv = entry["kv"]
                        break
            if ref_kv is None:
                ref_kv = _precompute_ref_kv(dit, x, timesteps, ref_latents, options)
                if state["active"]:
                    state["caches"].append({
                        "key": key,
                        "refs": [ref.detach().clone() for ref in ref_latents],
                        "kv": ref_kv,
                    })
            return _forward_cached(dit, x, timesteps, context, ref_kv, options)

        options = patched.model_options.setdefault("transformer_options", {})
        wrappers = options.setdefault("wrappers", {})
        key = "simpai_krea2_ostris_edit"
        for kind, wrapper in (
            (pe.WrappersMP.DIFFUSION_MODEL, forward),
            (pe.WrappersMP.OUTER_SAMPLE, sample),
        ):
            wrappers.setdefault(kind, {})[key] = [wrapper]
        return (patched,)


NODE_CLASS_MAPPINGS = {
    "SimpAIKrea2OstrisEditModelPatch": SimpAIKrea2OstrisEditModelPatch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIKrea2OstrisEditModelPatch": "SimpAI Krea2 Ostris Edit Model Patch",
}
