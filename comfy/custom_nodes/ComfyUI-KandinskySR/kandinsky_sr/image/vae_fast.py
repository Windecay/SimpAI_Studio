"""The VAE side of kernels=fast in the image node, on the user's stock FLUX VAE, which is never modified.

- encode: the first-stage encoder called directly with the stock arithmetic (bf16, the same values as VAE.encode),
  without VAE.encode's per-call model load (the caller loads the VAE once per image).
- decode: ComfyUI's own fused channels-last decoder path (kitchen GroupNorm+SiLU+pad, strip convolutions; comfy/sd.py
  enables it only for the FLUX.2 VAE) in float16 with float16 accumulation, run on a view of the decoder: a shallow
  copy of each module with its own flags that shares the original's parameters, so the VAE's patcher still owns every
  weight and casts it per call. Activations of the FLUX.1 decoder peak near 2,100 on the standard images, well inside
  float16.
"""
import copy

import torch


def _fused_view(module):
    view = copy.copy(module)
    view._modules = {name: None if child is None else _fused_view(child) for name, child in module._modules.items()}
    if "fused_norm" in view.__dict__:
        view.fused_norm = True
    if hasattr(view, "comfy_cast_weights"):
        view.comfy_cast_weights = True  # weights go to the float16 input's dtype per call
    return view


def encode(vae, pixels):
    """pixels [B, 3, H, W] in [0, 1] on the VAE's device -> raw latents float32, as VAE.encode computes them."""
    return vae.first_stage_model.encode((pixels * 2.0 - 1.0).to(vae.vae_dtype)).float()


def decode(vae, latent):
    """raw latents [B, 16, h, w] on the VAE's device -> pixels [B, 3, H, W] float32 in [0, 1]."""
    decoder = _fused_view(vae.first_stage_model.decoder)
    accumulation = torch.backends.cuda.matmul.allow_fp16_accumulation
    torch.backends.cuda.matmul.allow_fp16_accumulation = True  # the kitchen fp16_conv3d path of the fused convolutions
    try:
        return ((decoder(latent.to(torch.float16)).float() + 1.0) / 2.0).clamp_(0.0, 1.0)
    finally:
        torch.backends.cuda.matmul.allow_fp16_accumulation = accumulation
