import logging
import math

import torch
import torch.nn.functional as F


def _fit_samples(waveform, count):
    if waveform.shape[-1] >= count:
        return waveform[..., :count]
    return F.pad(waveform, (0, count - waveform.shape[-1]))


def align_source_audio(audio, source_fps, frame_count):
    if audio is None:
        return None
    fps = float(source_fps)
    count = int(frame_count)
    if not math.isfinite(fps) or fps <= 0 or count <= 0:
        raise ValueError("H3 audio timing requires positive source FPS and frame count.")
    waveform = audio.get("waveform")
    sample_rate = int(audio.get("sample_rate", 0))
    if not isinstance(waveform, torch.Tensor) or waveform.ndim != 3 or sample_rate <= 0:
        raise ValueError("H3 source audio must contain [batch, channels, samples] and a sample rate.")
    if waveform.shape[-1] == 0:
        return None
    source_samples = max(1, round(count / fps * sample_rate))
    target_samples = max(1, round(count / 24.0 * sample_rate))
    if fps == 24.0:
        if waveform.shape[-1] == target_samples:
            return audio
        return {**audio, "waveform": _fit_samples(waveform, target_samples)}

    rate = 24.0 / fps
    if not 0.1 <= rate <= 10.0:
        raise ValueError("Source FPS is outside AudioSpeedShift's supported speed range.")
    import nodes

    speed_class = nodes.NODE_CLASS_MAPPINGS.get("AudioSpeedShift")
    if speed_class is None:
        raise RuntimeError("AudioSpeedShift is required for H3 source-audio timing. Enable audio-separation-nodes-comfyui.")
    speed_node = speed_class()
    speed = getattr(speed_node, speed_node.FUNCTION)
    # The upstream phase vocoder uses CPU phase tensors and a 2048-sample STFT.
    prepared = _fit_samples(waveform.detach().to(device="cpu", dtype=torch.float32), source_samples)
    prepared = _fit_samples(prepared, max(2048, source_samples))
    outputs = []
    for batch in prepared.split(1, dim=0):
        shifted = speed(audio={"waveform": batch.clone(), "sample_rate": sample_rate}, rate=rate)[0]
        outputs.append(_fit_samples(shifted["waveform"], target_samples))
    logging.info(
        "[H3 Audio Timing] source_fps=%s frames=%s speed=%s source_seconds=%.6f drive_seconds=%.6f",
        fps, count, rate, count / fps, count / 24.0,
    )
    return {**audio, "waveform": torch.cat(outputs, dim=0), "sample_rate": sample_rate}


class SimpAIH3SourceAudioTiming:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "audio": ("AUDIO",),
            "source_fps": ("FLOAT", {"default": 24.0, "min": 0.01, "max": 240.0}),
            "frame_count": ("INT", {"default": 1, "min": 1, "max": 1000000}),
        }}

    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "align"
    CATEGORY = "SimpAI/MiniMax H3"

    def align(self, audio, source_fps, frame_count):
        return (align_source_audio(audio, source_fps, frame_count),)


NODE_CLASS_MAPPINGS = {"SimpAIH3SourceAudioTiming": SimpAIH3SourceAudioTiming}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIH3SourceAudioTiming": "SimpAI H3 Source Audio Timing"}
