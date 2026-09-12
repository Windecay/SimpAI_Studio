"""Rebuild a bounded source interval, then restore its original timeline."""

import math
from pathlib import Path

import cv2
import av
import numpy as np
import torch

from .SimpAIOptionalVideoPath import _file_hash, _load_video_frames, _resolve_video_path
from .SimpAIH3ContinuationOutput import _resize_images
from .SimpAIH3TemporalRepaint import temporal_profile


def validate_source_timeline(path, fps):
    # SaveVideoWebsocket emits constant-FPS video. Reject variable timestamps
    # rather than silently retime the unaffected parts of the source.
    with av.open(path) as container:
        stream = container.streams.video[0]
        unit = float(stream.time_base)
        timestamps = sorted(packet.pts for packet in container.demux(stream) if packet.pts is not None)
    if not timestamps:
        raise ValueError("The video has no usable presentation timestamps.")
    tolerance = max(1.5 * unit, 1e-5)
    first = timestamps[0]
    if any(abs((pts - first) * unit - i / fps) > tolerance for i, pts in enumerate(timestamps)):
        raise ValueError("Region reconstruction currently requires constant-FPS video. Convert this source to constant FPS first.")


def region_layout(total, fps, start, end, factor):
    if not all(math.isfinite(v) for v in (fps, start, end, factor)) or fps <= 0:
        raise ValueError("Invalid video interval or frame rate.")
    if factor not in (1, 2, 3, 4):
        raise ValueError("Reconstruction slowdown must be 1, 2, 3 or 4.")
    if total < 1 or not 0 <= start < end <= total / fps + 1 / fps:
        raise ValueError("Select a non-empty interval inside the source video.")
    begin = min(total - 1, round(start * fps))
    stop = min(total, max(begin + 1, round(end * fps)))
    context = max(1, round(0.75 / factor * fps))
    first, last = max(0, begin - context), min(total, stop + context)
    rate = 24 * factor
    input_frames = max(last - first, math.ceil(fps / rate))
    used = input_frames if abs(fps - rate) < 0.01 else max(1, int(input_frames / fps * rate))
    length = max(5, used)
    length += (5 - length) % 17
    if length > 3600:
        raise ValueError("The selected interval exceeds 3600 H3 frames. Shorten it or reduce slowdown.")
    core_start = round((begin - first) / fps * rate)
    core_end = min(used, max(core_start + 1, round((stop - first) / fps * rate)))
    return dict(total=total, fps=fps, begin=begin, stop=stop, first=first, last=last,
                factor=factor, rate=rate, used=used, length=length, input_frames=input_frames,
                core_start=core_start, core_end=core_end)


def region_mask(data):
    length, start, end = (data[k] for k in ("length", "core_start", "core_end"))
    count = end - start
    ramp = min(12, max(0, (count - 1) // 2))
    if start > 0 and end < length:
        try:
            return temporal_profile(length, start, count, ramp)["token_weights"]
        except ValueError as error:
            if "too short" not in str(error):
                raise
    # Edge/tiny intervals can touch a token shared with context. Final assembly
    # still replaces only selected source frames, never the adjacent originals.
    weights, offset = [], 0
    while offset < length:
        span = (1, 4, 4, 4, 4)[len(weights) % 5]
        overlap = max(0, min(offset + span, end) - max(offset, start))
        weights.append(overlap / span)
        offset += span
    return weights


def restore_indices(data):
    return [min(data["used"] - 1, round((i - data["first"]) / data["fps"] * data["rate"]))
            for i in range(data["begin"], data["stop"])]


class SimpAIH3RegionSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "video": ("STRING", {"default": ""}),
            "start": ("FLOAT", {"default": 0, "min": 0, "max": 86400}),
            "end": ("FLOAT", {"default": 1, "min": 0, "max": 86400}),
            "factor": ("INT", {"default": 2, "min": 1, "max": 4}),
            "width": ("INT", {"default": 864, "min": 32, "max": 8192}),
            "height": ("INT", {"default": 480, "min": 32, "max": 8192}),
        }}

    RETURN_TYPES = ("H3_REGION", "IMAGE", "FLOAT", "FLOAT")
    RETURN_NAMES = ("region", "source_window", "source_fps", "interpolation_fps")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/MiniMax H3"

    @classmethod
    def IS_CHANGED(cls, video, **kwargs):
        return _file_hash(_resolve_video_path(video)), kwargs

    def prepare(self, video, start, end, factor, width, height):
        path = _resolve_video_path(video)
        _, total, _, fps = _load_video_frames(
            path, metadata_only=True, load_audio=False, return_fps=True)
        data = region_layout(total, fps, start, end, factor)
        validate_source_timeline(path, fps)
        if abs(fps - data["rate"]) >= 0.01:
            # This preset never initiates a RIFE model download.
            import folder_paths
            candidates = [
                Path(__file__).parents[1] / "ComfyUI-VFI/rife/train_log/flownet.pkl",
                Path(folder_paths.models_dir) / "rife/flownet.pkl",
                Path(folder_paths.models_dir) / "controlnet/rife/flownet.pkl",
            ]
            if not any(p.is_file() for p in candidates):
                raise FileNotFoundError("Install the local RIFE flownet.pkl model before reconstruction.")
        frames, count, _, _ = _load_video_frames(
            path, skip_first_frames=data["first"], frame_load_cap=data["last"] - data["first"],
            load_audio=False, return_fps=True)
        if count != data["last"] - data["first"]:
            raise ValueError("Source frame count changed or the selected interval could not be decoded.")
        if count < data["input_frames"]:
            frames = torch.cat((frames, frames[-1:].repeat(data["input_frames"] - count, 1, 1, 1)))
        scale = math.sqrt(width * height / (frames.shape[1] * frames.shape[2]))
        w, h = (max(32, round(n * scale / 32) * 32) for n in (frames.shape[2], frames.shape[1]))
        data.update(path=path, digest=_file_hash(path), width=w, height=h)
        return data, _resize_images(frames, w, h), fps, float(data["rate"])


class SimpAIH3RegionCondition:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "region": ("H3_REGION",), "images": ("IMAGE",), "clip": ("CLIP",), "vae": ("VAE",),
            "prompt": ("STRING", {"default": "", "multiline": True}),
        }, "optional": {
            "reference1": ("IMAGE",), "reference2": ("IMAGE",), "reference3": ("IMAGE",),
        }}

    RETURN_TYPES = ("CONDITIONING", "LATENT", "IMAGE")
    RETURN_NAMES = ("positive", "latent", "canny")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/MiniMax H3"

    def prepare(self, region, images, clip, vae, prompt, reference1=None, reference2=None, reference3=None):
        import comfy.nested_tensor
        from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageToVideo, MiniMaxH3AddGuide
        from .SimpAIMiniMaxH3VideoUpscaleLatent import SimpAIMiniMaxH3VideoUpscaleLatent

        data = region
        if len(images) != data["used"]:
            raise ValueError("Interpolated frame count does not match the selected source interval.")
        endpoints = {}
        if data["begin"] > data["first"]:
            endpoints["first_frame"] = images[:1]
        if data["stop"] < data["last"]:
            endpoints["last_frame"] = images[-1:]
        references = [image for image in (reference1, reference2, reference3) if image is not None]
        if references:
            from .SimpAIMiniMaxH3AdaptiveReference import SimpAIMiniMaxH3AdaptiveReference
            positive, _ = SimpAIMiniMaxH3AdaptiveReference.execute(
                clip=clip, vae=vae, prompt=prompt, width=data["width"], height=data["height"],
                length=data["length"],
                ref_images={f"ref_image_{index}": image for index, image in enumerate(references)})
        else:
            positive, _ = MiniMaxH3ImageToVideo.execute(
                clip, vae, prompt, data["width"], data["height"], data["length"], **endpoints)
        latent, = SimpAIMiniMaxH3VideoUpscaleLatent.execute(
            vae, data["width"], data["height"], data["length"], images)
        # Reference pictures carry identity only; temporal anchors still come from source context.
        if references:
            for name, index in (("first_frame", 0), ("last_frame", data["length"] - 1)):
                if name in endpoints:
                    positive, = MiniMaxH3AddGuide.execute(
                        positive, latent, index, vae=vae, image=endpoints[name])
        guides = []
        if data["begin"] > data["first"]:
            guides.append(max(0, round((data["begin"] - data["first"] - 1) / data["fps"] * data["rate"])))
        if data["stop"] < data["last"]:
            guides.append(data["core_end"])
        for index in guides:
            index = min(len(images) - 1, index)
            positive, = MiniMaxH3AddGuide.execute(
                positive, latent, index, vae=vae, image=images[index:index + 1])
        video, audio = latent["samples"].unbind()
        weights = torch.tensor(region_mask(data), device=video.device, dtype=torch.float32)
        if len(weights) != video.shape[2]:
            raise ValueError("Region mask and H3 video latent have different temporal shapes.")
        latent = dict(latent, noise_mask=comfy.nested_tensor.NestedTensor((
            weights.reshape(1, 1, -1, 1, 1), torch.ones_like(audio))))
        edges = []
        for frame in images.detach().cpu():
            rgb = (frame.float().clamp(0, 1).numpy() * 255).round().astype(np.uint8)
            edge = cv2.Canny(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), 100, 200)
            edges.append(torch.from_numpy(edge.copy()).unsqueeze(-1).expand(-1, -1, 3))
        return positive, latent, torch.stack(edges).float().div_(255)


class SimpAIH3RegionOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"region": ("H3_REGION",), "images": ("IMAGE",)}}

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT")
    RETURN_NAMES = ("full_video", "original_audio", "source_fps")
    FUNCTION = "compose"
    CATEGORY = "SimpAI/MiniMax H3"

    def compose(self, region, images):
        data = region
        if len(images) < data["length"]:
            raise ValueError("The generated video is shorter than the requested H3 interval.")
        if _file_hash(data["path"]) != data["digest"]:
            raise ValueError("The source video changed during reconstruction.")
        source, count, audio, fps = _load_video_frames(data["path"], return_fps=True)
        if count != data["total"] or abs(fps - data["fps"]) > 1e-6:
            raise ValueError("The source timeline changed during reconstruction.")
        core = _resize_images(images[restore_indices(data)], source.shape[2], source.shape[1])
        source[data["begin"]:data["stop"]] = core.to(source)
        return source, audio, fps


NODE_CLASS_MAPPINGS = {
    "SimpAIH3RegionSource": SimpAIH3RegionSource,
    "SimpAIH3RegionCondition": SimpAIH3RegionCondition,
    "SimpAIH3RegionOutput": SimpAIH3RegionOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3RegionSource": "H3 Region Source",
    "SimpAIH3RegionCondition": "H3 Region Conditioning",
    "SimpAIH3RegionOutput": "H3 Full Video Reconstruction",
}
