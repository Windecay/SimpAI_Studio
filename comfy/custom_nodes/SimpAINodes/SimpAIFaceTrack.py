import copy
import math

import numpy as np


def adaptive_face_track(bboxes, width, height, fps=24.0, mask_expand=256, mask_blend=64):
    """Return frame-aligned face boxes and independent crop context boxes."""
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("Face tracking requires a positive FPS.")
    boxes = np.asarray(
        [list(box[:4]) if box is not None and len(box) >= 4 else [np.nan] * 4
         for box in bboxes], dtype=np.float64,
    )
    if boxes.ndim != 2 or boxes.shape[1] != 4 or len(boxes) == 0:
        raise ValueError("Expected one face bbox per video frame.")
    finite = np.isfinite(boxes).all(axis=1)
    boxes[:, [0, 2]] = boxes[:, [0, 2]].clip(0, width)
    boxes[:, [1, 3]] = boxes[:, [1, 3]].clip(0, height)
    valid = finite & (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])
    if not valid.any():
        raise ValueError("No valid face detected in the video.")
    # Only bridge short detection gaps; long gaps cannot identify the same face.
    good = np.flatnonzero(valid)
    gaps = np.diff(np.r_[-1, good, len(boxes)]) - 1
    if gaps.max() > max(1, round(fps * 0.25)):
        raise ValueError("Face detection missing for more than 0.25 seconds.")
    for column in range(4):
        boxes[:, column] = np.interp(np.arange(len(boxes)), good, boxes[good, column])
    centers = (boxes[:, :2] + boxes[:, 2:]) / 2
    sizes = boxes[:, 2:] - boxes[:, :2]
    track = np.concatenate((centers, sizes), axis=1)
    # Reject isolated jumps only when the frames on either side agree.
    cleaned = track.copy()
    for i in range(1, len(track) - 1):
        before, current, after = track[i - 1:i + 2]
        scale = max(1.0, min(before[2:]))
        if (np.max(np.abs(after - before)) < scale * 0.2
                and np.max(np.abs(current - (before + after) / 2)) > scale * 0.5):
            cleaned[i] = (before + after) / 2

    face_boxes, contexts = [], []
    face = cleaned[0].copy()
    crop_center = face[:2].copy()
    # Match expand_m/blur_m support in the installed CropAndStitch implementation.
    margin = (math.ceil((max(0, mask_expand) * 0.375 + 1) / 2)
              + math.ceil((max(0, mask_blend) * 0.375 + 1) / 2)
              + math.ceil(max(0, mask_blend) * 0.5) + 2)
    crop_size = face[2:] * 1.2 + 2 * margin
    for target in cleaned:
        scale = max(1.0, min(face[2:]))
        motion = np.linalg.norm(target[:2] - face[:2]) / scale
        reset = motion > 1.5 or np.max(np.abs(np.log(target[2:] / face[2:]))) > math.log(2)
        if reset:
            face = target.copy()
            crop_center = face[:2].copy()
            crop_size = face[2:] * 1.2 + 2 * margin
        else:
            center_alpha = 1 - math.exp(-1 / (fps * (0.025 if motion > 0.08 else 0.10)))
            size_alpha = 1 - math.exp(-1 / (fps * 0.18))
            face[:2] += center_alpha * (target[:2] - face[:2])
            face[2:] += size_alpha * (target[2:] - face[2:])
        lo = np.floor(face[:2] - face[2:] / 2).astype(int)
        hi = np.ceil(face[:2] + face[2:] / 2).astype(int)
        lo = np.maximum(lo, 0)
        hi = np.minimum(hi, [width, height])
        face_boxes.append(tuple(int(v) for v in np.r_[lo, hi]))

        desired = face[2:] * 1.2 + 2 * margin
        # A deadband keeps crop scale fixed through small detector size variations.
        change = np.abs(desired - crop_size) > crop_size * 0.06
        crop_size += change * (1 - math.exp(-1 / (fps * 0.45))) * (desired - crop_size)
        crop_center += (1 - math.exp(-1 / (fps * 0.08))) * (face[:2] - crop_center)
        needed_lo = np.maximum(0, lo - margin)
        needed_hi = np.minimum([width, height], hi + margin)
        size = np.minimum([width, height], np.maximum(np.ceil(crop_size), needed_hi - needed_lo)).astype(int)
        start = np.rint(crop_center - size / 2).astype(int)
        start = np.maximum(needed_hi - size, np.minimum(start, needed_lo))
        start = np.maximum(0, np.minimum(start, np.array([width, height]) - size))
        contexts.append(tuple(int(v) for v in np.r_[start, start + size]))
    return face_boxes, contexts


class SimpAIFaceTrack:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            # PoseAndFaceDetection currently declares this output with a trailing comma.
            "bboxes": ("BBOX,",),
            "images": ("IMAGE",),
            "fps": ("FLOAT", {"default": 24.0, "min": 0.01, "max": 240.0}),
            "mask_expand": ("INT", {"default": 256, "min": 0, "max": 4096}),
            "mask_blend": ("INT", {"default": 64, "min": 0, "max": 4096}),
        }}

    RETURN_TYPES = ("BBOX", "MASK")
    RETURN_NAMES = ("bboxes", "context_mask")
    FUNCTION = "track"
    CATEGORY = "SimpAI/video"

    def track(self, bboxes, images, fps, mask_expand, mask_blend):
        import torch

        count, height, width, _ = images.shape
        if len(bboxes) != count:
            raise ValueError("Face bbox count does not match video frame count.")
        boxes, contexts = adaptive_face_track(bboxes, width, height, fps, mask_expand, mask_blend)
        masks = torch.zeros((count, height, width), dtype=torch.float32, device="cpu")
        for i, (x1, y1, x2, y2) in enumerate(contexts):
            masks[i, y1:y2, x1:x2] = 1
        return boxes, masks


def sam3_component_thresholds(areas, fps):
    from scipy.ndimage import median_filter

    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("Face tracking requires a positive FPS.")
    areas = np.asarray(areas, dtype=np.float64)
    window = 2 * max(1, round(fps * 0.25)) + 1
    reference = np.maximum(areas, median_filter(areas, size=window, mode="nearest"))
    return np.maximum(1, np.ceil(reference * 0.001)).astype(np.int64)


def clean_sam3_mask_frame(frame, minimum_area):
    import cv2

    binary = np.asarray(frame, dtype=np.uint8)
    _, labels, stats, _ = cv2.connectedComponentsWithStats(binary, connectivity=8)
    keep = stats[:, cv2.CC_STAT_AREA] >= minimum_area
    keep[0] = False
    return keep[labels]


def sam3_follow_contexts(boxes, width, height, fps, mask_expand, mask_blend):
    _, tracked = adaptive_face_track(boxes, width, height, fps, mask_expand, mask_blend)
    tracked = np.asarray(tracked, dtype=np.float64)
    boxes = np.asarray(boxes, dtype=np.float64)
    margin = (math.ceil((max(0, mask_expand) * 0.375 + 1) / 2)
              + math.ceil((max(0, mask_blend) * 0.375 + 1) / 2)
              + math.ceil(max(0, mask_blend) * 0.5) + 2)
    required_lo = np.maximum(0, np.floor(boxes[:, :2]) - margin)
    required_hi = np.minimum([width, height], np.ceil(boxes[:, 2:]) + margin)
    needed = np.maximum(tracked[:, 2:] - tracked[:, :2], required_hi - required_lo)
    # Build a slow-changing size envelope in both directions. A newly connected
    # mask region is contained before it appears, without expanding for one frame.
    log_side = np.log(np.max(needed, axis=1))
    rate = 0.35 / fps
    for i in range(1, len(log_side)):
        log_side[i] = max(log_side[i], log_side[i - 1] - rate)
    for i in range(len(log_side) - 2, -1, -1):
        log_side[i] = max(log_side[i], log_side[i + 1] - rate)
    sizes = np.minimum([width, height], np.ceil(np.exp(log_side))[:, None])

    centers = (tracked[:, :2] + tracked[:, 2:]) / 2
    radius = max(1, round(fps * 0.08))
    weights = np.r_[np.arange(1, radius + 2), np.arange(radius, 0, -1)]
    weights = weights / weights.sum()
    for axis in range(2):
        centers[:, axis] = np.convolve(
            np.pad(centers[:, axis], radius, mode="edge"), weights, mode="valid",
        )
    starts = np.rint(centers - sizes / 2)
    starts = np.maximum(required_hi - sizes, np.minimum(starts, required_lo))
    starts = np.maximum(0, np.minimum(starts, np.array([width, height]) - sizes))
    return np.concatenate((starts, starts + sizes), axis=1).astype(np.int64).tolist()


class SimpAISAM3FaceCrop:
    @classmethod
    def INPUT_TYPES(cls):
        import nodes

        schema = copy.deepcopy(nodes.NODE_CLASS_MAPPINGS["InpaintCropImproved"].INPUT_TYPES())
        schema["required"]["mask"] = schema["optional"].pop("mask")
        schema["optional"].pop("optional_context_mask", None)
        schema["required"]["fps"] = ("FLOAT", {"default": 24.0, "min": 0.01, "max": 240.0})
        return schema

    RETURN_TYPES = ("STITCHER", "IMAGE", "MASK")
    RETURN_NAMES = ("stitcher", "cropped_image", "cropped_mask")
    FUNCTION = "crop"
    CATEGORY = "SimpAI/video"

    def crop(self, image, mask, fps, **kwargs):
        import nodes
        import torch

        if mask is None or mask.ndim != 3 or tuple(mask.shape) != tuple(image.shape[:3]):
            raise ValueError("SAM3 mask frames and dimensions must match the source video.")
        if not torch.isfinite(mask).all():
            raise ValueError("SAM3 mask contains invalid values.")
        if kwargs.get("preresize") or kwargs.get("extend_for_outpainting") or kwargs.get("mask_invert"):
            raise ValueError("SAM3 face crop requires the original canvas and a non-inverted mask.")
        masks = (mask.detach().cpu() > 0.5).to(torch.float32)
        thresholds = sam3_component_thresholds(masks.sum(dim=(1, 2)).numpy(), fps)
        bboxes = []
        for frame, minimum_area in zip(masks, thresholds):
            # Filter before both bbox tracking and generation: CropAndStitch also
            # derives context from the editing mask, so geometry-only cleanup is insufficient.
            cleaned = clean_sam3_mask_frame(frame.numpy(), minimum_area)
            frame.copy_(torch.from_numpy(cleaned))
            ys = torch.where(frame.any(dim=1))[0]
            xs = torch.where(frame.any(dim=0))[0]
            bboxes.append(
                (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1)
                if len(xs) else (np.nan,) * 4
            )
        boxes = np.asarray(bboxes, dtype=np.float64)
        good = np.flatnonzero(np.isfinite(boxes).all(axis=1))
        if not len(good):
            raise ValueError("SAM3 mask is empty. Select a face region before generating.")
        empty = ~np.isfinite(boxes).all(axis=1)
        # Interpolate crop geometry only; unselected frames retain a zero editing mask.
        for column in range(4):
            boxes[:, column] = np.interp(np.arange(len(boxes)), good, boxes[good, column])
        expand = kwargs.get("mask_expand_pixels", 0)
        blend = kwargs.get("mask_blend_pixels", 0)
        height, width = masks.shape[1:]
        contexts = sam3_follow_contexts(boxes, width, height, fps, expand, blend)
        context_masks = torch.zeros_like(masks)
        for i, (x1, y1, x2, y2) in enumerate(contexts):
            context_masks[i, y1:y2, x1:x2] = 1
            if empty[i]:
                # CropAndStitch uses the whole canvas for an empty mask; a temporary
                # point selects the follow region. Both output masks are cleared below.
                masks[i, (y1 + y2) // 2, (x1 + x2) // 2] = 1
        stitcher, cropped, cropped_mask = nodes.NODE_CLASS_MAPPINGS["InpaintCropImproved"]().inpaint_crop(
            image=image, mask=masks, optional_context_mask=context_masks, **kwargs,
        )
        for i in np.flatnonzero(empty):
            cropped_mask[i].zero_()
            stitcher["cropped_mask_for_blend"][i].zero_()
        return stitcher, cropped, cropped_mask


class SimpAIFaceGenerationMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mask": ("MASK",)}}

    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/video"

    def prepare(self, mask):
        import torch

        if mask is None or mask.ndim != 3 or not torch.isfinite(mask).all():
            raise ValueError("Face generation requires a finite frame-aligned mask.")
        # Make the >= 0.5 core fully editable while retaining the outer soft edge.
        # Zero pixels stay zero; crop geometry and the stitch mask are unchanged.
        return ((mask * 2.0).clamp_(0, 1),)


class SimpAIFaceOuterStitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "stitcher": ("STITCHER",),
            "inpainted_image": ("IMAGE",),
            "feather_pixels": ("INT", {"default": 64, "min": 0, "max": 64}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "stitch"
    CATEGORY = "SimpAI/video"

    def stitch(self, stitcher, inpainted_image, feather_pixels):
        import nodes
        import torch

        if not 0 <= feather_pixels <= 64:
            raise ValueError("Face stitch feathering must be between 0 and 64.")
        count = inpainted_image.shape[0]
        masks = stitcher["cropped_mask_for_blend"]
        if len(masks) != count:
            raise ValueError("Face stitch frames must match the generated video.")
        updated = dict(stitcher)
        outer_masks = []
        for i, mask in enumerate(masks):
            if not torch.isfinite(mask).all():
                raise ValueError("Face stitch mask contains invalid values.")
            if not mask.any():
                outer_masks.append(torch.zeros_like(mask))
                continue
            height, width = mask.shape[-2:]
            canvas_width = stitcher["cropped_to_canvas_w"][i]
            canvas_height = stitcher["cropped_to_canvas_h"][i]
            if canvas_width <= 0 or canvas_height <= 0:
                raise ValueError("Face stitch crop dimensions must be positive.")

            # Feather only the crop perimeter, in source-canvas pixel units.
            # Keep the original mask solely as the selected/empty-frame flag.
            def ramp(length, canvas_length):
                edge = torch.ones(length, device=mask.device, dtype=mask.dtype)
                if feather_pixels and length > 2:
                    radius = min(feather_pixels * length / canvas_length, (length - 1) / 2)
                    position = torch.arange(length, device=mask.device, dtype=mask.dtype)
                    distance = torch.minimum(position, length - 1 - position)
                    t = (distance / radius).clamp(0, 1)
                    edge = t * t * (3 - 2 * t)
                return edge

            alpha = ramp(height, canvas_height)[:, None] * ramp(width, canvas_width)[None, :]
            outer_masks.append(alpha.expand_as(mask))
        updated["cropped_mask_for_blend"] = outer_masks
        return nodes.NODE_CLASS_MAPPINGS["InpaintStitchImproved"]().inpaint_stitch(
            updated, inpainted_image,
        )


NODE_CLASS_MAPPINGS = {
    "SimpAIFaceTrack": SimpAIFaceTrack,
    "SimpAISAM3FaceCrop": SimpAISAM3FaceCrop,
    "SimpAIFaceGenerationMask": SimpAIFaceGenerationMask,
    "SimpAIFaceOuterStitch": SimpAIFaceOuterStitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIFaceTrack": "SimpAI Face Track",
    "SimpAISAM3FaceCrop": "SimpAI SAM3 Face Crop",
    "SimpAIFaceGenerationMask": "SimpAI Face Generation Mask",
    "SimpAIFaceOuterStitch": "SimpAI Face Outer Stitch",
}
