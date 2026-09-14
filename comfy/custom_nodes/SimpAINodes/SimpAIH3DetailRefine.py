"""Spatial H3 refinement at enlarged working resolution, on the source timeline."""

import logging
import math

import numpy as np
import torch

from .SimpAIH3ContinuationOutput import _resize_images
from .SimpAIH3RegionRebuild import SimpAIH3RegionCondition, restore_indices
from .SimpAIFaceTrack import adaptive_face_track, sam3_follow_contexts


LOG = logging.getLogger(__name__)


def quad_plan(width, height, resolution, magnification):
    if resolution < 128 or resolution > 1536 or resolution % 32:
        raise ValueError("Tile working budget must be a multiple of 32 between 128 and 1536.")
    if magnification != 2 or min(width, height) < 2:
        raise ValueError("Fixed four tiles require a source at least 2x2 and 2x magnification.")
    mx, my = width // 2, height // 2
    halo = min(32, min(mx, my) // 4)
    boxes = [(x1, y1, x2, y2)
             for y1, y2 in ((0, my + halo), (my - halo, height))
             for x1, x2 in ((0, mx + halo), (mx - halo, width))]
    sizes = [(math.ceil((x2 - x1) * 2 / 32) * 32,
              math.ceil((y2 - y1) * 2 / 32) * 32) for x1, y1, x2, y2 in boxes]
    if any(w * h > resolution ** 2 or max(w, h) > 1536 for w, h in sizes):
        raise ValueError(
            f"Fixed four-tile working sizes {sizes} exceed budget {resolution}x{resolution} "
            "(maximum side 1536). Enable Automatic Tile Grid, increase the budget, or resize the source. "
            "\u56fa\u5b9a\u56db\u5206\u533a\u8d85\u51fa\u5de5\u4f5c\u9884\u7b97\uff0c"
            "\u8bf7\u542f\u7528\u81ea\u52a8\u7f51\u683c\u3001\u63d0\u9ad8\u9884\u7b97\u6216\u7f29\u5c0f\u6e90\u753b\u9762\u3002")
    return boxes


def quad_weight(box, width, height):
    mx, my = width // 2, height // 2
    halo = min(32, min(mx, my) // 4)

    def ramp(start, end, midpoint):
        if not halo:
            return torch.ones(end - start)
        position = ((torch.arange(start, end).float() + 0.5 - (midpoint - halo))
                    / (2 * halo)).clamp(0, 1)
        fade = position * position * (3 - 2 * position)
        return 1 - fade if start == 0 else fade

    x1, y1, x2, y2 = box
    return (ramp(y1, y2, my)[:, None] * ramp(x1, x2, mx)[None, :]).unsqueeze(-1)


def tile_plan(width, height, resolution, magnification):
    if resolution < 128 or resolution > 1536 or resolution % 32:
        raise ValueError("Detail working resolution must be a multiple of 32 between 128 and 1536.")
    if magnification != 2 or min(width, height) < 1:
        raise ValueError("Tile refinement currently requires 2x magnification.")
    side = max(32, resolution // magnification)

    def starts(length):
        size = min(length, side)
        stride = max(1, round(size * 0.75))
        positions = list(range(0, max(1, length - size + 1), stride))
        if positions[-1] != length - size:
            positions.append(length - size)
        return size, positions

    w, xs = starts(width)
    h, ys = starts(height)
    if len(xs) * len(ys) > 64:
        raise ValueError("Detail refinement exceeds 64 tiles. Increase working resolution.")
    return [(x, y, x + w, y + h) for y in ys for x in xs]


def tile_weight(box, width, height):
    x1, y1, x2, y2 = box

    def ramp(size, start, end, boundary):
        weight = torch.ones(size)
        radius = max(1, round(size * 0.25))
        position = torch.arange(1, radius + 1).float() / (radius + 1)
        fade = position * position * (3 - 2 * position)
        if start > 0:
            weight[:radius] *= fade
        if end < boundary:
            weight[-radius:] *= fade.flip(0)
        return weight

    return (ramp(y2 - y1, y1, y2, height)[:, None]
            * ramp(x2 - x1, x1, x2, width)[None, :]).unsqueeze(-1)


def magnify_tile(images):
    width, height = images.shape[2] * 2, images.shape[1] * 2
    enlarged = _resize_images(images, width, height)
    # Pad to the H3 grid without changing the exact 2x geometry.
    padded = torch.nn.functional.pad(
        enlarged.movedim(-1, 1), (0, -width % 32, 0, -height % 32), mode="replicate",
    ).movedim(1, -1)
    return padded, (width, height)


def face_refinement_track(bboxes, width, height, fps, feather):
    if bboxes is None:
        raise ValueError("Face refinement requires frame-aligned face detections.")
    geometry = np.asarray([box if box is not None else [np.nan] * 4 for box in bboxes], dtype=float)
    good = np.flatnonzero(np.isfinite(geometry).all(axis=1))
    if not len(good):
        raise ValueError("No valid face confidently matched to the target.")
    starts = getattr(bboxes, "scene_starts", [0])
    if len(starts) > 1:
        boxes, contexts = [], []
        for start, stop in zip(starts, starts[1:] + [len(bboxes)]):
            section = list(bboxes[start:stop])
            if not any(box is not None for box in section):
                nearest = good[np.argmin(np.abs(good - (start + stop - 1) / 2))]
                section = [bboxes[nearest]] * len(section)
            face, context = face_refinement_track(section, width, height, fps, feather)
            boxes.extend(face)
            contexts.extend(context)
        return boxes, contexts
    if not np.isfinite(geometry[good[0]:good[-1] + 1]).all():
        raise ValueError("Face refinement received an unresolved tracking gap.")
    # Only absent leading/trailing frames borrow geometry; their masks stay zero.
    for axis in range(4):
        geometry[:, axis] = np.interp(np.arange(len(geometry)), good, geometry[good, axis])
    boxes, _ = adaptive_face_track(geometry, width, height, fps, 8, feather)
    geometry = np.asarray(boxes, dtype=np.float64)
    centers = (geometry[:, :2] + geometry[:, 2:]) / 2
    # Context is independent of the editing mask; include hair, neck and surroundings.
    sides = np.maximum(np.max(geometry[:, 2:] - geometry[:, :2], axis=1) * 2, 96)
    sizes = np.minimum([width, height], sides[:, None])
    starts = np.clip(centers - sizes / 2, 0, np.array([width, height]) - sizes)
    expanded = np.concatenate((starts, starts + sizes), axis=1)
    contexts = sam3_follow_contexts(expanded, width, height, fps, 8, feather)
    return boxes, contexts


def face_crop(images, bboxes, fps, resolution, feather):
    import nodes

    if bboxes is not None and len(bboxes) != len(images):
        raise ValueError("Face bbox count does not match video frame count.")
    boxes, contexts = face_refinement_track(bboxes, images.shape[2], images.shape[1], fps, feather)
    masks = torch.zeros(images.shape[:3], dtype=torch.float32, device="cpu")
    context_masks = torch.zeros_like(masks)
    for index, (x1, y1, x2, y2) in enumerate(boxes):
        masks[index, y1:y2, x1:x2] = 1
    for index, (x1, y1, x2, y2) in enumerate(contexts):
        context_masks[index, y1:y2, x1:x2] = 1
    crop = nodes.NODE_CLASS_MAPPINGS.get("InpaintCropImproved")
    if crop is None:
        raise RuntimeError("Install Inpaint CropAndStitch before face refinement.")
    result = crop().inpaint_crop(
        image=images, mask=masks, optional_context_mask=context_masks,
        downscale_algorithm="bicubic", upscale_algorithm="bicubic",
        preresize=False, preresize_mode="ensure minimum resolution",
        preresize_min_width=resolution, preresize_min_height=resolution,
        preresize_max_width=16384, preresize_max_height=16384,
        mask_fill_holes=False, mask_expand_pixels=8, mask_invert=False,
        mask_blend_pixels=feather, mask_hipass_filter=0,
        extend_for_outpainting=False, extend_up_factor=1, extend_down_factor=1,
        extend_left_factor=1, extend_right_factor=1, context_from_mask_extend_factor=1,
        output_resize_to_target_size=True, output_target_width=resolution,
        output_target_height=resolution, output_padding="0",
    )
    for index, box in enumerate(bboxes):
        if box is None:
            result[2][index].zero_()
            result[0]["cropped_mask_for_blend"][index].zero_()
    return result


def _interpolate(images, region):
    if abs(region["fps"] - region["rate"]) < 0.01:
        return images
    import nodes

    return nodes.NODE_CLASS_MAPPINGS["RIFEInterpolation"]().interpolate(
        images=images, source_fps=region["fps"], target_fps=region["rate"], scale=2.0,
        model_name="flownet.pkl", batch_size=2, use_fp16=True,
        scene_detect=True, scene_threshold=0.15,
    )[0]


def face_sampling_mask(mask, region, video):
    from comfy.utils import reshape_mask
    from .SimpAIFaceTrack import SimpAIFaceGenerationMask

    if (mask.ndim != 3 or len(mask) != region["input_frames"]
            or not torch.isfinite(mask).all() or mask.min() < 0 or mask.max() > 1):
        raise ValueError("Face sampling requires a finite, frame-aligned mask in [0, 1].")
    mask, = SimpAIFaceGenerationMask().prepare(mask)
    # Follow source time at the generation rate, then repeat the final padding frame.
    indices = (torch.arange(region["used"], device=mask.device)
               * region["fps"] / region["rate"]).round().long().clamp_(0, len(mask) - 1)
    mask = mask[indices]
    if len(mask) < region["length"]:
        mask = torch.cat((mask, mask[-1:].expand(region["length"] - len(mask), -1, -1)))
    return reshape_mask(mask.to(device=video.device, dtype=torch.float32),
                        (video.shape[0], 1, *video.shape[2:]))


class SimpAIH3DetailRefine:
    @classmethod
    def INPUT_TYPES(cls):
        from comfy.samplers import SAMPLER_NAMES, SCHEDULER_NAMES

        return {"required": {
            "region": ("H3_REGION",), "images": ("IMAGE",),
            "model": ("MODEL",), "model_patch": ("MODEL_PATCH",),
            "clip": ("CLIP",), "vae": ("VAE",),
            "prompt": ("STRING", {"default": "", "multiline": True}),
            "mode": (["face", "tiles"],),
            "resolution": ("INT", {"default": 768, "min": 128, "max": 1536, "step": 32}),
            "magnification": ("INT", {"default": 2, "min": 2, "max": 2}),
            "feather": ("INT", {"default": 8, "min": 0, "max": 64}),
            "denoise_percent": ("INT", {"default": 35, "min": 1, "max": 100}),
            "control_strength": ("FLOAT", {"default": 0.6, "min": 0, "max": 2}),
            "steps": ("INT", {"default": 8, "min": 1, "max": 50}),
            "sampler_name": (SAMPLER_NAMES, {"default": "er_sde"}),
            "scheduler": (SCHEDULER_NAMES, {"default": "beta57"}),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
        }, "optional": {
            "automatic_grid": ("BOOLEAN", {"default": False}),
            "bboxes": ("BBOX,",),
            "reference1": ("IMAGE",), "reference2": ("IMAGE",), "reference3": ("IMAGE",),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("refined_source_interval",)
    FUNCTION = "refine"
    CATEGORY = "SimpAI/MiniMax H3"

    def _generate(self, images, region, model, model_patch, clip, vae, prompt,
                  steps, sampler_name, scheduler, denoise_percent, control_strength, seed, references,
                  generation_mask=None):
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3FunControlNetApply
        from .SimpAIH3UpscaleLoop import (
            _node_result, _sample_advanced, _sampler, _scheduler,
            _decode_video, _empty_cache, _throw_if_interrupted,
        )

        _throw_if_interrupted()
        data = dict(region, width=images.shape[2], height=images.shape[1])
        frames = _interpolate(images, data)
        positive, latent, canny = SimpAIH3RegionCondition().prepare(
            data, frames, clip, vae, prompt, **references)
        if generation_mask is not None:
            import comfy.nested_tensor

            if tuple(generation_mask.shape) != tuple(images.shape[:3]):
                raise ValueError("Face sampling mask must match the cropped video.")
            video, _audio = latent["samples"].unbind()
            temporal_mask, audio_mask = latent["noise_mask"].unbind()
            spatial_mask = face_sampling_mask(generation_mask, data, video)
            latent = dict(latent, noise_mask=comfy.nested_tensor.NestedTensor((
                temporal_mask * spatial_mask, audio_mask)))
        patched = _node_result(MiniMaxH3FunControlNetApply.execute(
            model, model_patch, vae, control_strength, 0, 1, control_video=canny,
        ))[0]
        try:
            sigmas = _scheduler(patched, scheduler, steps, denoise_percent / 100)
            sampled, denoised = _sample_advanced(
                patched, positive, _sampler(sampler_name), sigmas, latent, seed)
            del denoised, latent, positive, frames, canny
            decoded = _decode_video(vae, sampled)
            if len(decoded) < data["length"] or not torch.isfinite(decoded).all():
                raise ValueError("H3 detail generation returned incomplete or invalid frames.")
            return decoded
        finally:
            del patched
            _empty_cache()

    def refine(self, region, images, model, model_patch, clip, vae, prompt, mode,
               resolution, magnification, feather, denoise_percent, control_strength,
               steps, sampler_name, scheduler, seed, bboxes=None,
               reference1=None, reference2=None, reference3=None, automatic_grid=False):
        from comfy.utils import ProgressBar
        from .SimpAIH3UpscaleLoop import _throw_if_interrupted

        if mode not in ("face", "tiles"):
            raise ValueError("Unknown H3 detail refinement mode.")
        if (not 0 <= feather <= 64 or not 1 <= denoise_percent <= 100
                or not math.isfinite(control_strength) or not 0 <= control_strength <= 2):
            raise ValueError("Invalid H3 detail refinement strength or feathering.")
        if (images.ndim != 4 or images.shape[-1] != 3 or len(images) != region["input_frames"]
                or images.shape[1:3] != (region["height"], region["width"])
                or not torch.isfinite(images).all()):
            raise ValueError("Detail refinement requires the original, frame-aligned source window.")
        planner = tile_plan if automatic_grid else quad_plan
        plan = planner(region["width"], region["height"], resolution, magnification) if mode == "tiles" else [None]
        if mode == "face" and (resolution < 128 or resolution > 1536 or resolution % 32):
            raise ValueError("Invalid face working resolution.")
        images = images.detach().cpu()
        references = dict(reference1=reference1, reference2=reference2, reference3=reference3)
        begin, stop = region["begin"] - region["first"], region["stop"] - region["first"]
        arguments = dict(region=region, model=model, model_patch=model_patch, clip=clip, vae=vae,
                         steps=steps, sampler_name=sampler_name, scheduler=scheduler,
                         denoise_percent=denoise_percent, control_strength=control_strength,
                         references=references)
        progress = ProgressBar(len(plan))
        _throw_if_interrupted()
        if mode == "face":
            import nodes

            stitcher, cropped, mask = face_crop(images, bboxes, region["fps"], resolution, feather)
            description = (prompt + "\nThe supplied video is a tracked face crop of the original person. "
                           "Refine that same person's facial details without changing identity, expression, "
                           "head pose, gaze, motion or crop framing. Optional pictures depict the original identity.")
            decoded = self._generate(cropped, prompt=description, seed=seed,
                                     generation_mask=mask, **arguments)
            indices = [min(region["used"] - 1, round(i / region["fps"] * region["rate"]))
                       for i in range(len(images))]
            restored = nodes.NODE_CLASS_MAPPINGS["InpaintStitchImproved"]().inpaint_stitch(
                stitcher, decoded[indices],
            )[0]
            for index, box in enumerate(bboxes):
                if box is None:
                    restored[index].copy_(images[index])
            progress.update_absolute(1)
            return (restored[begin:stop].contiguous(),)

        output = torch.zeros_like(images[begin:stop], dtype=torch.float32)
        weights = torch.zeros((*images.shape[1:3], 1), dtype=torch.float32)
        indices = restore_indices(region)
        description = (prompt + "\nThe supplied video is one spatial crop, not the whole scene. "
                       "Refine only details already visible inside this crop. Preserve source composition, "
                       "object scale, identity, trajectories, lighting and temporal continuity. "
                       "Do not fit the whole subject or scene into this crop or introduce new content.")
        for index, box in enumerate(plan):
            _throw_if_interrupted()
            x1, y1, x2, y2 = box
            cropped, (w, h) = magnify_tile(images[:, y1:y2, x1:x2])
            LOG.info("H3 detail tile %d/%d: source=%s working=%dx%d", index + 1, len(plan), box, cropped.shape[2], cropped.shape[1])
            decoded = self._generate(cropped, prompt=description,
                                     seed=(seed + index) & 0xffffffffffffffff, **arguments)
            core = _resize_images(decoded[indices, :h, :w], x2 - x1, y2 - y1).cpu()
            weight = (tile_weight if automatic_grid else quad_weight)(box, region["width"], region["height"])
            output[:, y1:y2, x1:x2].add_(core * weight)
            weights[y1:y2, x1:x2].add_(weight)
            del cropped, decoded, core
            progress.update_absolute(index + 1)
        if not (weights > 0).all():
            raise ValueError("H3 tile composition left uncovered source pixels.")
        return (output.div_(weights).clamp_(0, 1),)


NODE_CLASS_MAPPINGS = {"SimpAIH3DetailRefine": SimpAIH3DetailRefine}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIH3DetailRefine": "H3 Spatial Detail Refinement"}
