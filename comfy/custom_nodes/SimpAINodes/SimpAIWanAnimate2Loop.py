from __future__ import annotations

import json

import torch


def _node_result(value):
    if hasattr(value, "result"):
        return tuple(value.result or ())
    if isinstance(value, tuple):
        return value
    return (value,)


def _align_4n1(value):
    value = max(1, int(value))
    return value + ((1 - value) % 4)


def _trim_latent(latent, amount):
    amount = max(0, int(amount))
    if amount == 0:
        return latent
    trimmed = latent.copy()
    trimmed["samples"] = latent["samples"][:, :, amount:].contiguous()
    return trimmed


def _decode(vae, latent):
    import nodes

    return nodes.VAEDecode().decode(vae, latent)[0].detach().cpu().contiguous().clamp(0, 1)


def _sample(model, positive, negative, sampler, sigmas, latent, seed, cfg):
    from comfy_extras.nodes_custom_sampler import SamplerCustom

    if isinstance(latent, torch.Tensor):
        latent = {"samples": latent}
    elif not isinstance(latent, dict) or "samples" not in latent:
        raise TypeError("Wan Animate 2 sampler latent must be a Comfy latent dict or tensor.")

    sampled = _node_result(
        SamplerCustom.execute(
            model,
            True,
            int(seed),
            float(cfg),
            positive,
            negative,
            sampler,
            sigmas,
            latent,
        )
    )
    if not sampled:
        raise RuntimeError("SamplerCustom returned no latent output for Wan Animate 2.")
    result = sampled[1] if len(sampled) > 1 else sampled[0]
    if not isinstance(result, dict) or "samples" not in result:
        raise RuntimeError("SamplerCustom returned an invalid Wan Animate 2 latent.")
    return result


def _release_animate2_cache(model):
    """Release pose-cache slots after a segment has finished sampling.

    Animate-2's cache is keyed by the complete pose latent sequence. Every
    continuation segment has a different key, so keeping earlier slots does
    not help the next segment and can retain many gigabytes of pinned RAM.
    """
    model_options = getattr(model, "model_options", None)
    if not isinstance(model_options, dict):
        return False
    transformer_options = model_options.get("transformer_options")
    if not isinstance(transformer_options, dict):
        return False
    cache = transformer_options.get("animate2_cache")
    free = getattr(cache, "free", None)
    if not callable(free):
        return False
    free()
    return True


def _normalize_chunk_limit(value):
    return min(81, max(5, _align_4n1(value)))


def _segment_plan(total_frames, chunk_limit):
    """Return (sample_length, output_length) pairs for the native one-frame overlap protocol."""
    total_frames = max(1, int(total_frames))
    chunk_limit = _normalize_chunk_limit(chunk_limit)
    plan = []
    produced = 0

    first_output = min(total_frames, chunk_limit)
    first_length = min(chunk_limit, _align_4n1(first_output))
    plan.append((first_length, first_output))
    produced += first_output

    while produced < total_frames:
        output_length = min(total_frames - produced, chunk_limit - 1)
        sample_length = min(chunk_limit, _align_4n1(output_length + 1))
        plan.append((sample_length, output_length))
        produced += output_length
    return plan


class SimpAIWanAnimate2Loop:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "vae": ("VAE",),
                "sampler": ("SAMPLER",),
                "sigmas": ("SIGMAS",),
                "reference_image": ("IMAGE",),
                "pose_video": ("IMAGE",),
                "width": ("INT", {"default": 832, "min": 16, "max": 16384, "step": 16}),
                "height": ("INT", {"default": 480, "min": 16, "max": 16384, "step": 16}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "max_frames": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
                "max_chunk_frames": ("INT", {"default": 81, "min": 5, "max": 81, "step": 4}),
                "pose_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01}),
                "pose_start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "pose_end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "reference_image_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01}),
            },
            "optional": {
                "clip_vision_output": ("CLIP_VISION_OUTPUT",),
                "clip_vision_output_pose": ("CLIP_VISION_OUTPUT",),
                "positive_pose": ("CONDITIONING",),
            },
        }

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("frames", "summary")
    FUNCTION = "generate"
    CATEGORY = "SimpAI/video"

    def generate(
        self,
        model,
        positive,
        negative,
        vae,
        sampler,
        sigmas,
        reference_image,
        pose_video,
        width,
        height,
        seed,
        cfg,
        max_frames,
        max_chunk_frames,
        pose_strength=1.0,
        pose_start_percent=0.0,
        pose_end_percent=1.0,
        reference_image_strength=1.0,
        clip_vision_output=None,
        clip_vision_output_pose=None,
        positive_pose=None,
    ):
        if not isinstance(pose_video, torch.Tensor) or pose_video.ndim != 4:
            raise ValueError("pose_video must be a ComfyUI IMAGE tensor.")
        if pose_video.shape[0] <= 0:
            raise ValueError("pose_video has no frames to generate.")
        if not isinstance(reference_image, torch.Tensor) or reference_image.ndim != 4 or reference_image.shape[0] <= 0:
            raise ValueError("reference_image must contain at least one image.")
        if float(pose_start_percent) > float(pose_end_percent):
            raise ValueError("pose_start_percent must not be greater than pose_end_percent.")

        from comfy_extras.nodes_wan import WanAnimate2ToVideo

        total_frames = int(pose_video.shape[0])
        if int(max_frames) > 0:
            total_frames = min(total_frames, int(max_frames))
        if total_frames <= 0:
            raise ValueError("pose_video has no frames to generate.")

        plan = _segment_plan(total_frames, max_chunk_frames)
        output_parts = []
        previous_motion = None
        video_frame_offset = 0
        segments = []

        for index, (sample_length, output_length) in enumerate(plan):
            conditioned = _node_result(
                WanAnimate2ToVideo.execute(
                    positive=positive,
                    negative=negative,
                    vae=vae,
                    width=int(width),
                    height=int(height),
                    length=int(sample_length),
                    batch_size=1,
                    video_frame_offset=int(video_frame_offset),
                    reference_image=reference_image[:1],
                    pose_video=pose_video,
                    clip_vision_output=clip_vision_output,
                    positive_pose=positive_pose,
                    clip_vision_output_pose=clip_vision_output_pose,
                    continue_motion=previous_motion,
                    pose_strength=float(pose_strength),
                    pose_start_percent=float(pose_start_percent),
                    pose_end_percent=float(pose_end_percent),
                    reference_image_strength=float(reference_image_strength),
                )
            )
            if len(conditioned) != 6:
                raise RuntimeError("WanAnimate2ToVideo returned an unexpected result.")
            chunk_positive, chunk_negative, latent, trim_latent, trim_image, next_offset = conditioned
            try:
                sampled = _sample(
                    model,
                    chunk_positive,
                    chunk_negative,
                    sampler,
                    sigmas,
                    latent,
                    int(seed),
                    float(cfg),
                )
            finally:
                _release_animate2_cache(model)
            decoded = _decode(vae, _trim_latent(sampled, trim_latent))
            trim_image = max(0, int(trim_image))
            if trim_image >= int(decoded.shape[0]):
                raise RuntimeError("Wan Animate 2 continuation removed the complete decoded segment.")
            new_frames = decoded[trim_image:].contiguous()
            if int(new_frames.shape[0]) < output_length:
                raise RuntimeError(
                    f"Wan Animate 2 segment {index} produced {int(new_frames.shape[0])} frames; "
                    f"{output_length} were required."
                )
            new_frames = new_frames[:output_length].contiguous()
            output_parts.append(new_frames)
            previous_motion = decoded[-1:].contiguous()
            video_frame_offset = int(next_offset)
            segments.append(
                {
                    "index": index,
                    "sample_length": int(sample_length),
                    "output_length": int(output_length),
                    "trim_image": trim_image,
                    "video_frame_offset": int(video_frame_offset),
                }
            )

        frames = torch.cat(output_parts, dim=0)[:total_frames].contiguous()
        summary = json.dumps(
            {
                "model_family": "Wan-Animate-2",
                "total_frames": int(total_frames),
                "segment_count": len(segments),
                "max_chunk_frames": _normalize_chunk_limit(max_chunk_frames),
                "continuation_protocol": "native_continue_motion_last_frame",
                "offset_protocol": "native_video_frame_offset",
                "segments": segments,
            },
            ensure_ascii=False,
        )
        return frames, summary


NODE_CLASS_MAPPINGS = {
    "SimpAIWanAnimate2Loop": SimpAIWanAnimate2Loop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIWanAnimate2Loop": "SimpAI Wan Animate 2",
}
