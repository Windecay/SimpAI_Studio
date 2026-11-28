"""The reference's tiled one-step pipeline (KandinskyImageSRPipeline.__call__) on ComfyUI's model management and a
stock FLUX VAE: LQ tiles of tile_size / factor with replicate padding up to one tile, bicubic to tile_size, VAE
encode, one transformer step, corrected = lq - t * prediction, VAE decode, boundary-aware Hann blend, crop."""
import functools
import logging
import math

import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.utils

from ..kernels import fused
from . import vae_fast

log = logging.getLogger("KandinskySR")

CREATIVITY_TIMESTEPS = {
    2: (0.07, 0.086, 0.118, 0.134, 0.15, 0.18, 0.21, 0.27, 0.30),
    4: (0.17, 0.1885, 0.207, 0.2255, 0.244, 0.278, 0.312, 0.346, 0.38),
}


def tile_positions(length, tile, stride):
    if length <= tile:
        return [0]
    positions = list(range(0, length - tile, stride))
    if positions[-1] + tile < length:
        positions.append(length - tile)
    return positions


def tile_grid(height, width, factor, tile_size=1024, overlap=0.25):
    """LQ tile side, and the tops and lefts of the tiles on the image padded to at least one tile."""
    lq_tile = tile_size // factor
    stride = max(1, int(lq_tile * (1.0 - overlap)))
    return lq_tile, tile_positions(max(height, lq_tile), lq_tile, stride), tile_positions(max(width, lq_tile), lq_tile, stride)


def hann(length, start, end, device):
    w = 0.5 - 0.5 * torch.cos(2 * math.pi * torch.arange(length, device=device) / length)
    if start:
        w[: length // 2] = 1.0
    if end:
        w[length // 2:] = 1.0
    return w


def window(size, top, bottom, left, right, device):
    """The reference's boundary_aware_window: a Hann window whose halves at the image border are flat."""
    return hann(size, top, bottom, device)[:, None] * hann(size, left, right, device)[None, :]


def estimate_memory(tile_batch, tile_size=1024):
    """Peak activation memory of one bf16 transformer call: 252 / 484 / 964 / 1924 MiB for 1 / 2 / 4 / 8 tiles of
    4,096 tokens, measured on an RTX 3090, plus room for the tile's latents and prediction."""
    return tile_batch * (tile_size // 16) ** 2 * 62 * 1024 + 256 * 2**20


@functools.cache
def _fast_available(device):
    if not fused.available(device):
        log.warning("Kandinsky Image SR: kernels=fast needs CUDA and Triton; running the exact ops on %s", device)
        return False
    return True


def upscale_image(model, vae, image, factor, timestep, tile_batch=1, progress=None, kernels="exact"):
    """image: [H, W, 3] float in [0, 1] on the CPU. Returns [H * factor, W * factor, 3] float32 on the CPU.
    kernels: "exact" (the reference's ops, the stock VAE calls) or "fast" (fused kernels where the device runs them, and
    vae_fast's encode and float16 decode)."""
    patcher = model.patcher
    device = patcher.load_device
    fast = kernels == "fast" and _fast_available(device)
    dit = patcher.model
    t_index = model.timestep_index(timestep)
    tile_size, scaling = model.tile_size, model.scaling_factor
    height, width = image.shape[:2]

    # contiguous NCHW as in the reference: CPU bicubic takes another kernel (other rounding) on a channels-last view
    pixels = image.movedim(-1, 0).unsqueeze(0).float().clamp(0.0, 1.0).contiguous()
    lq_tile, tops, lefts = tile_grid(height, width, factor, tile_size, model.overlap)
    pad_h, pad_w = max(0, lq_tile - height), max(0, lq_tile - width)
    if pad_h or pad_w:
        pixels = F.pad(pixels, (0, pad_w, 0, pad_h), mode="replicate")
    out_h, out_w = pixels.shape[-2] * factor, pixels.shape[-1] * factor
    accumulator = torch.zeros(1, 3, out_h, out_w, device=device)
    weights = torch.zeros(1, 1, out_h, out_w, device=device)
    cells = [(r, c) for r in range(len(tops)) for c in range(len(lefts))]
    transformer_options = {"prefetch_dynamic_vbars": patcher.is_dynamic()}
    # both models once per image with the larger of the transformer's and the VAE decode's working memory; the VAE's
    # own calls below then find it loaded
    vae_decode = vae.memory_used_decode((tile_batch, 16, tile_size // 8, tile_size // 8), vae.vae_dtype)
    comfy.model_management.load_models_gpu([patcher, vae.patcher], memory_required=max(estimate_memory(tile_batch, tile_size), vae_decode))

    for start in range(0, len(cells), tile_batch):
        comfy.model_management.throw_exception_if_processing_interrupted()
        chunk = cells[start:start + tile_batch]
        tiles = [F.interpolate(pixels[:, :, tops[r]:tops[r] + lq_tile, lefts[c]:lefts[c] + lq_tile], size=(tile_size, tile_size),
                               mode="bicubic", align_corners=False) for r, c in chunk]
        tiles = torch.cat(tiles).clamp(0.0, 1.0)
        if fast:
            lq = vae_fast.encode(vae, tiles.to(vae.device)).to(device) * scaling
        else:
            lq = vae.encode(tiles.movedim(1, -1)).to(device).float() * scaling

        with comfy.model_management.cuda_device_context(device):
            prediction = dit(lq.to(dit.dtype), t_index, fast, transformer_options=transformer_options).float()
        corrected = lq - timestep * prediction
        if fast:
            decoded = vae_fast.decode(vae, (corrected / scaling).to(vae.device)).to(device)
        else:
            decoded = vae.decode(corrected / scaling).to(device).movedim(-1, 1)

        for i, (r, c) in enumerate(chunk):
            w = window(tile_size, r == 0, r == len(tops) - 1, c == 0, c == len(lefts) - 1, device)[None, None]
            top, left = tops[r] * factor, lefts[c] * factor
            accumulator[:, :, top:top + tile_size, left:left + tile_size] += decoded[i:i + 1] * w
            weights[:, :, top:top + tile_size, left:left + tile_size] += w
        if progress is not None:
            progress.update(len(chunk))

    out = (accumulator / weights.clamp_min(1e-6))[:, :, :height * factor, :width * factor]
    out = out[0].movedim(0, -1).cpu()
    if not torch.isfinite(out).all():
        raise RuntimeError("Kandinsky Image SR produced non-finite pixels.")
    return out.clamp_(0, 1)


def upscale(model, vae, images, factor, creativity=4, tile_batch=1, kernels="exact"):
    """images: IMAGE [B, H, W, 3]. creativity 0-8 picks the factor's calibrated timestep (4 is the release default)."""
    timestep = CREATIVITY_TIMESTEPS[factor][creativity]
    lq_tile, tops, lefts = tile_grid(images.shape[1], images.shape[2], factor, model.tile_size, model.overlap)
    progress = comfy.utils.ProgressBar(images.shape[0] * len(tops) * len(lefts))
    return torch.stack([upscale_image(model, vae, image, factor, timestep, tile_batch, progress, kernels) for image in images])
