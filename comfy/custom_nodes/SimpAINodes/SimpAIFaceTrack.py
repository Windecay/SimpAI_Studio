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


NODE_CLASS_MAPPINGS = {"SimpAIFaceTrack": SimpAIFaceTrack}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIFaceTrack": "SimpAI Face Track"}
