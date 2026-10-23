import logging
import math
from pathlib import Path

import folder_paths
import nodes
import torch

from .SimpAIOptionalVideoPath import _file_hash, _load_video_frames, _resolve_video_path
from .SimpAIH3ContinuationOutput import _resize_images
from .SimpAIH3VideoTransition import (
    MODEL_FPS,
    _generated_output_frames,
    select_source_frames,
    transition_audio,
    transition_layout,
)


LOG = logging.getLogger(__name__)


def loop_source_frames(images, source_fps, allow_download=True):
    if not math.isfinite(source_fps) or source_fps <= 0 or len(images) == 0:
        raise ValueError("Loop sources must contain frames with a valid frame rate.")
    if source_fps >= MODEL_FPS - 0.01 or len(images) == 1:
        return select_source_frames(images, source_fps)
    candidates = [
        Path(__file__).parents[1] / "ComfyUI-VFI/rife/train_log/flownet.pkl",
        Path(folder_paths.models_dir) / "rife/flownet.pkl",
        Path(folder_paths.models_dir) / "controlnet/rife/flownet.pkl",
    ]
    resolver = getattr(folder_paths, "get_full_path", None)
    registered = resolver("controlnet", "rife/flownet.pkl") if callable(resolver) else None
    if registered:
        candidates.insert(0, Path(registered))
    if not any(path.is_file() for path in candidates):
        raise FileNotFoundError("Install the local RIFE flownet.pkl model before interpolating a loop source.")
    interpolate = nodes.NODE_CLASS_MAPPINGS.get("RIFEInterpolation")
    if interpolate is None:
        raise RuntimeError("Install ComfyUI-VFI before interpolating a loop source.")
    wanted = max(1, round(len(images) / source_fps * MODEL_FPS))
    source = images
    # RIFE floors its output count; extend only the final hold to cover rounding.
    if int(len(source) / source_fps * MODEL_FPS) < wanted:
        source = torch.cat((source, source[-1:]))
    LOG.info("[H3 Loop] Interpolating %s source frames @ %.6f to %s @ 24 FPS with RIFE.",
             len(images), source_fps, wanted)
    result = interpolate().interpolate(
        images=source, source_fps=source_fps, target_fps=MODEL_FPS, scale=2.0,
        model_name="flownet.pkl", batch_size=2, use_fp16=True,
        scene_detect=True, scene_threshold=0.15,
        allow_download=allow_download,
    )[0]
    if len(result) < wanted:
        raise ValueError("Loop source interpolation returned fewer frames than requested.")
    return result[:wanted]


class SimpAIH3LoopSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "video": ("STRING", {"default": ""}),
            "duration": ("FLOAT", {"default": 3.0, "min": 0.1, "max": 30.0}),
            "overlap": ("FLOAT", {"default": 0.75, "min": 0.1, "max": 3.0}),
            "width": ("INT", {"default": 864, "min": 32, "max": 8192}),
            "height": ("INT", {"default": 480, "min": 32, "max": 8192}),
        }, "optional": {"allow_download": ("BOOLEAN", {"default": True})}}

    RETURN_TYPES = ("H3_TRANSITION", "INT", "INT", "INT", "FLOAT")
    RETURN_NAMES = ("transition", "length", "width", "height", "fps")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/MiniMax H3"

    @classmethod
    def IS_CHANGED(cls, video, **kwargs):
        return _file_hash(_resolve_video_path(video)), kwargs

    def prepare(self, video, duration, overlap, width, height, allow_download=True):
        if not video:
            raise ValueError("Upload a source video to create a loop.")
        source, _, audio, source_fps = _load_video_frames(
            video, return_fps=True, label="Loop source video",
        )
        if source is None:
            raise ValueError("Upload a source video to create a loop.")
        source = loop_source_frames(source, source_fps, allow_download=allow_download)
        # Keep original neighbors at the loop boundary when the source is long enough.
        context_limit = max(1, (len(source) - 2) // 2)
        layout = transition_layout(context_limit, context_limit, float(duration), float(overlap))
        scale = math.sqrt(max(1024, width * height) / (source.shape[1] * source.shape[2]))
        sample_w = max(32, round(source.shape[2] * scale / 32) * 32)
        sample_h = max(32, round(source.shape[1] * scale / 32) * 32)
        layout.update(
            first=source, second=source, first_audio=audio, second_audio=audio,
            width=sample_w, height=sample_h, loop_cut=len(source) // 2,
        )
        LOG.info(
            "[H3 Loop] source=%s frames @ 24 FPS; overlap=%s/%s extension=%s "
            "model_frames=%s output_frames=%s sampling=%sx%s",
            len(source), layout["left"], layout["right"], layout["gap"],
            layout["length"], len(source) + layout["gap"], sample_w, sample_h,
        )
        return layout, layout["length"], sample_w, sample_h, MODEL_FPS


class SimpAIH3LoopOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "transition": ("H3_TRANSITION",), "images": ("IMAGE",),
        }, "optional": {"audio": ("AUDIO",)}}

    RETURN_TYPES = ("IMAGE", "AUDIO")
    FUNCTION = "compose"
    CATEGORY = "SimpAI/MiniMax H3"

    def compose(self, transition, images, audio=None):
        data = transition
        source = data["first"]
        bridge = _generated_output_frames(data, images)
        bridge = _resize_images(bridge, source.shape[2], source.shape[1]).to(source)
        cut, left, right = (data[key] for key in ("loop_cut", "left", "right"))
        count = len(source) + data["gap"]
        result = torch.cat((source[cut:len(source) - left], bridge, source[right:cut]))[:count]
        soundtrack = transition_audio(data, audio, True)
        if soundtrack is not None:
            rate = soundtrack["sample_rate"]
            begin, samples = round(cut / MODEL_FPS * rate), round(count / MODEL_FPS * rate)
            waveform = soundtrack["waveform"][..., begin:begin + samples].clone()
            waveform = torch.nn.functional.pad(waveform, (0, max(0, samples - waveform.shape[-1])))
            soundtrack = {"waveform": waveform, "sample_rate": rate}
        return result, soundtrack


NODE_CLASS_MAPPINGS = {
    "SimpAIH3LoopSource": SimpAIH3LoopSource,
    "SimpAIH3LoopOutput": SimpAIH3LoopOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3LoopSource": "H3 Loop Source",
    "SimpAIH3LoopOutput": "H3 Loop Output",
}
