"""Temporal source protection for H3 source-latent repaint experiments."""

import json
import logging


FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
LOG = logging.getLogger(__name__)


def temporal_profile(length, start_frame, core_frames, ramp_frames):
    values = (length, start_frame, core_frames, ramp_frames)
    if any(type(value) is not int for value in values):
        raise ValueError("Temporal repaint positions must be integers.")
    if length < 5 or length % 17 != 5:
        raise ValueError("H3 length must follow the 17k+5 frame grid.")
    if start_frame < 1 or core_frames < 1 or start_frame + core_frames >= length:
        raise ValueError("The repaint core must leave source context on both sides.")
    if ramp_frames < 0 or ramp_frames > (core_frames - 1) // 2:
        raise ValueError("The ramp must fit within half of the repaint core.")
    end_frame = start_frame + core_frames
    frame_weights = [0.0] * length
    for index in range(start_frame, end_frame):
        distance = min(index - start_frame, end_frame - 1 - index)
        value = min(1.0, distance / ramp_frames) if ramp_frames else 1.0
        frame_weights[index] = value * value * (3.0 - 2.0 * value)
    token_weights, spans = [], []
    offset = 0
    while offset < length:
        span = FRAME_PER_TOKEN[len(spans) % len(FRAME_PER_TOKEN)]
        end = offset + span
        if end > length:
            raise ValueError("The H3 temporal token grid does not match the frame count.")
        # A token crossing a protected boundary stays entirely source-conditioned.
        protected = offset < start_frame or end > end_frame
        weight = 0.0 if protected else sum(frame_weights[offset:end]) / span
        token_weights.append(weight)
        spans.append([offset, end])
        offset = end
    if not any(weight > 0 for weight in token_weights):
        raise ValueError("The core is too short to repaint any H3 temporal token.")
    return {"frame_weights": frame_weights, "token_weights": token_weights, "spans": spans}


class SimpAIH3TemporalRepaint:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "latent": ("LATENT",),
            "length": ("INT", {"default": 124, "min": 5, "max": 3600, "step": 17}),
            "start_frame": ("INT", {"default": 36, "min": 1, "max": 3598}),
            "core_frames": ("INT", {"default": 48, "min": 1, "max": 3598}),
            "ramp_frames": ("INT", {"default": 12, "min": 0, "max": 1798}),
        }}

    RETURN_TYPES = ("LATENT", "STRING")
    RETURN_NAMES = ("latent", "profile")
    FUNCTION = "apply"
    CATEGORY = "SimpAI/MiniMax H3"

    def apply(self, latent, length, start_frame, core_frames, ramp_frames):
        import torch
        import comfy.nested_tensor

        if "noise_mask" in latent:
            raise ValueError("Temporal repaint requires an initial latent without an existing noise mask.")
        samples = latent["samples"]
        if not getattr(samples, "is_nested", False):
            raise ValueError("Temporal repaint requires an H3 audiovisual latent.")
        streams = list(samples.unbind())
        if len(streams) != 2:
            raise ValueError("Expected one H3 video stream and one H3 audio stream.")
        video, audio = streams
        if (video.ndim != 5 or video.shape[1] != 24 or audio.ndim != 4
                or audio.shape[1:3] != (32, 2)):
            raise ValueError("Unexpected H3 audiovisual latent shape.")
        profile = temporal_profile(length, start_frame, core_frames, ramp_frames)
        if video.shape[2] != len(profile["token_weights"]):
            raise ValueError("Temporal repaint length differs from the encoded source latent.")
        mask = torch.tensor(
            profile["token_weights"], dtype=torch.float32, device=video.device,
        ).reshape(1, 1, -1, 1, 1)
        output = dict(latent)
        # Keep audio sampling unchanged so this experiment changes only video protection.
        output["noise_mask"] = comfy.nested_tensor.NestedTensor((
            mask, torch.ones_like(audio, dtype=torch.float32),
        ))
        text = json.dumps(profile)
        LOG.info("[H3 Temporal Repaint] start=%d count=%d ramp=%d token_weights=%s",
                 start_frame, core_frames, ramp_frames, profile["token_weights"])
        return output, text


NODE_CLASS_MAPPINGS = {"SimpAIH3TemporalRepaint": SimpAIH3TemporalRepaint}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3TemporalRepaint": "SimpAI H3 Temporal Repaint / H3 时间渐变重绘",
}
