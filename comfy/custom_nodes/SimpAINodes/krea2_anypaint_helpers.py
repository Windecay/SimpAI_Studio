"""AnyPaint canvas preparation adapted from alexw5702-afk/krea2-anypaint.

Copyright (c) 2026 yijunwang2. See SimpAIKrea2AnyPaint.LICENSE.
Studio supplies an already expanded canvas and composites the final region.
"""

import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F


def prepare_canvas(image, mask, reference_max_edge=384, boundary_redraw=32):
    height, width = image.shape[1:3]
    canvas_h, canvas_w = (height + 15) // 16 * 16, (width + 15) // 16 * 16
    mask = F.interpolate(mask.reshape(-1, 1, *mask.shape[-2:]).float(), (height, width), mode="nearest")[:, 0]
    mask = (mask > 0.5).float()
    if mask.shape[0] == 1:
        mask = mask.expand(image.shape[0], -1, -1)
    references, known_images, masks = [], [], []
    for source, generated in zip(image, mask):
        pixels = source[..., :3].detach().cpu().clamp(0, 1).mul(255).round().to(torch.uint8).numpy()
        median = np.median(pixels.reshape(-1, 3), axis=0).round().astype(np.uint8)
        known = np.empty((canvas_h, canvas_w, 3), dtype=np.uint8)
        known[:] = median
        known[:height, :width] = pixels
        generated = F.pad(generated, (0, canvas_w - width, 0, canvas_h - height), value=1)
        generated_values = generated.detach().cpu().numpy() > 0.5
        semantic = known.copy()
        preserved = semantic[~generated_values]
        semantic[generated_values] = np.median(preserved, axis=0).round().astype(np.uint8) if len(preserved) else median
        scale = min(1.0, reference_max_edge / max(canvas_h, canvas_w))
        ref_size = tuple(max(16, round(size * scale) // 16 * 16) for size in (canvas_w, canvas_h))
        reference = Image.fromarray(semantic).resize(ref_size, Image.Resampling.LANCZOS)
        references.append(torch.from_numpy(np.asarray(reference).copy()).float().div_(255))
        known_images.append(torch.from_numpy(known).float().div_(255))
        masks.append(generated)
    generated = torch.stack(masks)
    keep = 1.0 - F.max_pool2d(
        generated[:, None], boundary_redraw * 2 + 1, stride=1, padding=boundary_redraw,
    )[:, 0]
    return torch.stack(references), torch.stack(known_images), keep


def token_aligned_noise_mask(keep_mask, latent_height, latent_width):
    keep = F.interpolate(keep_mask[:, None].float(), (latent_height, latent_width), mode="nearest")[:, 0]
    blocks = (keep > 0.5).float().reshape(keep.shape[0], latent_height // 2, 2, latent_width // 2, 2)
    known = blocks.amin(dim=(2, 4)).repeat_interleave(2, 1).repeat_interleave(2, 2)
    return (1.0 - known)[:, None]
