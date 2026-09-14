"""Spatial H3 refinement at enlarged working resolution, on the source timeline."""

import logging
import math

import numpy as np
import torch

from .SimpAIH3ContinuationOutput import _resize_images
from .SimpAIH3RegionRebuild import SimpAIH3RegionCondition, restore_indices
from .SimpAIFaceTrack import adaptive_face_track, sam3_follow_contexts


LOG = logging.getLogger(__name__)
DWPOSE_MODEL = "dw-ll_ucoco_384.onnx"


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
    if any(max(w, h) > 1536 for w, h in sizes):
        raise ValueError(
            f"Fixed four-tile working sizes {sizes} exceed the maximum side 1536. "
            "Enable Automatic Tile Grid or resize the source. "
            "\u56fa\u5b9a\u56db\u5206\u533a\u5de5\u4f5c\u5c3a\u5bf8\u8d85\u8fc7\u5355\u8fb9\u4e0a\u9650 1536\uff0c"
            "\u8bf7\u542f\u7528\u81ea\u52a8\u7f51\u683c\u6216\u7f29\u5c0f\u6e90\u753b\u9762\u3002")
    required = math.ceil(math.sqrt(max(w * h for w, h in sizes)) / 32) * 32
    if required > resolution:
        LOG.info("H3 fixed four-tile budget automatically adjusted: %d -> %d; working sizes=%s",
                 resolution, required, sizes)
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


def face_refinement_track(bboxes, width, height, fps, feather, manual=False):
    if bboxes is None:
        raise ValueError("Face refinement requires frame-aligned face detections.")
    geometry = np.asarray([box if box is not None else [np.nan] * 4 for box in bboxes], dtype=float)
    good = np.flatnonzero(np.isfinite(geometry).all(axis=1))
    if not len(good):
        raise ValueError("No valid face confidently matched to the target.")
    present = np.isfinite(geometry).all(axis=1)
    # Missing sections have zero editing masks; smooth each visible run independently.
    starts = sorted(set(getattr(bboxes, "scene_starts", [0]))
                    | set((np.flatnonzero(present[1:] != present[:-1]) + 1).tolist()))
    if len(starts) > 1:
        boxes, contexts = [], []
        for start, stop in zip(starts, starts[1:] + [len(bboxes)]):
            section = list(bboxes[start:stop])
            if not any(box is not None for box in section):
                nearest = good[np.argmin(np.abs(good - (start + stop - 1) / 2))]
                section = [bboxes[nearest]] * len(section)
            face, context = face_refinement_track(section, width, height, fps, feather, manual=manual)
            boxes.extend(face)
            contexts.extend(context)
        return boxes, contexts
    # Borrow geometry only to keep crop tensors frame-aligned; missing masks stay zero.
    for axis in range(4):
        geometry[:, axis] = np.interp(np.arange(len(geometry)), good, geometry[good, axis])
    if manual:
        boxes = np.rint(geometry).astype(int).tolist()
    else:
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
    boxes, contexts = face_refinement_track(bboxes, images.shape[2], images.shape[1], fps, feather,
                                           manual=getattr(bboxes, "manual", False))
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


def preserved_face_intervals(bboxes, region):
    begin, stop = region["begin"] - region["first"], region["stop"] - region["first"]
    intervals = []
    start = None
    for index in range(begin, stop + 1):
        if index < stop and bboxes[index] is None:
            if start is None:
                start = index
        elif start is not None:
            intervals.append(((region["first"] + start) / region["fps"],
                              (region["first"] + index) / region["fps"]))
            start = None
    return intervals


def face_pose_control(images, mask):
    import folder_paths
    import onnxruntime as ort
    from comfy.utils import ProgressBar
    from custom_controlnet_aux.dwpose.dw_onnx.cv_ox_pose import inference_pose
    from custom_controlnet_aux.dwpose.types import Keypoint
    from custom_controlnet_aux.dwpose.util import draw_facepose
    from .SimpAIH3UpscaleLoop import _throw_if_interrupted

    if (mask.shape != images.shape[:3] or not torch.isfinite(mask).all()
            or mask.min() < 0 or mask.max() > 1):
        raise ValueError("DWPose control requires a frame-aligned face mask in [0, 1].")
    path = (folder_paths.get_full_path("controlnet", DWPOSE_MODEL)
            or folder_paths.get_full_path("controlnet", "yzd-v/DWPose/" + DWPOSE_MODEL))
    if path is None:
        raise FileNotFoundError(f"Face pose control requires the installed model: {DWPOSE_MODEL}")
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    model = ort.InferenceSession(path, providers=["CPUExecutionProvider"], sess_options=options)
    input_size = tuple(reversed(model.get_inputs()[0].shape[-2:]))
    height, width = images.shape[1:3]
    control = torch.zeros(images.shape, dtype=torch.float32, device="cpu")
    mask = mask.detach().cpu()
    progress = ProgressBar(len(images))
    missing, missing_mouth, active = [], [], 0
    # Use the selected face crop as the top-down pose region; do not redetect people.
    for index, frame in enumerate(images):
        _throw_if_interrupted()
        ys, xs = torch.where(mask[index] > 0)
        if len(xs):
            active += 1
            x1, x2, y1, y2 = xs.min().item(), xs.max().item() + 1, ys.min().item(), ys.max().item() + 1
            side = max(x2 - x1, y2 - y1) * 2
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            bounds = np.array([[max(0, cx - side / 2), max(0, cy - side / 2),
                                min(width, cx + side / 2), min(height, cy + side / 2)]], dtype=np.float32)
            rgb = (frame.detach().cpu().float().clamp(0, 1).numpy() * 255).round().astype(np.uint8)
            points, scores = inference_pose(model, bounds, rgb, input_size, dtype=np.float32)
            if points.shape != (1, 133, 2) or scores.shape != (1, 133):
                raise ValueError("DWPose must return 133 whole-body keypoints for the selected crop.")
            # DWPose face points plus the two eye centers match its OpenPose renderer.
            indices = list(range(23, 91)) + [2, 1]
            face = []
            for point_index in indices:
                x, y = points[0, point_index]
                score = scores[0, point_index]
                valid = (np.isfinite([x, y, score]).all() and score >= .3
                         and 0 <= x < width and 0 <= y < height
                         and mask[index, int(y), int(x)] > 0)
                face.append(Keypoint(float(x), float(y), float(score), point_index) if valid else None)
            canvas = draw_facepose(np.zeros((height, width, 3), dtype=np.uint8), face)
            control[index] = torch.from_numpy(canvas).float().div_(255)
            control[index].mul_((mask[index] > 0).unsqueeze(-1))
            if not any(point is not None for point in face):
                missing.append(index)
            if not any(point is not None for point in face[48:68]):
                missing_mouth.append(index)
        progress.update_absolute(index + 1)
    LOG.info("H3 DWPose face control: %d/%d active frames with face points, %d with mouth points.",
             active - len(missing), active, active - len(missing_mouth))
    if missing_mouth:
        LOG.warning("DWPose mouth points unavailable on %d active frames (first frames: %s).",
                    len(missing_mouth), missing_mouth[:16])
    return control


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
        control_inputs = {}
        if generation_mask is not None:
            if tuple(generation_mask.shape) != tuple(images.shape[:3]):
                raise ValueError("Face sampling mask must match the cropped video.")
            indices = (torch.arange(len(frames), device=generation_mask.device)
                       * data["fps"] / data["rate"]).round().long().clamp_(0, len(generation_mask) - 1)
            control_inputs["control_video"] = (
                face_pose_control(frames, generation_mask[indices]) if control_strength > 0
                else torch.zeros(frames.shape, dtype=torch.float32, device="cpu"))
        positive, latent, control_video = SimpAIH3RegionCondition().prepare(
            data, frames, clip, vae, prompt, **references, **control_inputs)
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
            model, model_patch, vae, control_strength, 0, 1, control_video=control_video,
        ))[0]
        try:
            sigmas = _scheduler(patched, scheduler, steps, denoise_percent / 100)
            sampled, denoised = _sample_advanced(
                patched, positive, _sampler(sampler_name), sigmas, latent, seed)
            del denoised, latent, positive, frames, control_video, control_inputs
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
            preserved = preserved_face_intervals(bboxes, region)
            if preserved:
                LOG.warning("H3 face refinement preserves original frames in %d source-time intervals (seconds): %s%s",
                            len(preserved), ", ".join(f"[{start:.3f}, {stop:.3f})" for start, stop in preserved[:12]),
                            " ..." if len(preserved) > 12 else "")
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
