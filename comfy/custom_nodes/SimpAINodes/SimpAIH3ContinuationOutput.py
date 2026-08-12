import torch
import torch.nn.functional as F

import comfy.utils
from comfy_api.latest import io


H3_FPS = 24.0


def _images(value, label):
    if value is None:
        return None
    if not isinstance(value, torch.Tensor) or value.ndim != 4:
        raise ValueError(f"{label} images must have shape [frames, height, width, channels].")
    if value.shape[0] <= 0:
        raise ValueError(f"{label} images must contain at least one frame.")
    return value[..., :3]


def _resize_images(images, width, height):
    if int(images.shape[1]) == int(height) and int(images.shape[2]) == int(width):
        return images
    resized = comfy.utils.common_upscale(
        images.movedim(-1, 1),
        int(width),
        int(height),
        "lanczos",
        "disabled",
    )
    return resized.movedim(1, -1)


def _audio_waveform(audio, label):
    if audio is None:
        return None, 0
    waveform = audio.get("waveform") if isinstance(audio, dict) else None
    sample_rate = int(audio.get("sample_rate", 0)) if isinstance(audio, dict) else 0
    if not isinstance(waveform, torch.Tensor) or waveform.ndim not in (2, 3):
        raise ValueError(f"{label} audio waveform must have shape [batch, channels, samples].")
    if waveform.ndim == 2:
        waveform = waveform.unsqueeze(0)
    if sample_rate <= 0:
        raise ValueError(f"{label} audio sample rate must be positive.")
    return waveform, sample_rate


def _resample(waveform, source_rate, target_rate):
    if int(source_rate) == int(target_rate):
        return waveform
    try:
        import torchaudio

        return torchaudio.functional.resample(waveform, int(source_rate), int(target_rate))
    except ImportError:
        target_length = max(1, int(round(waveform.shape[-1] * target_rate / source_rate)))
        return F.interpolate(
            waveform.reshape(-1, 1, waveform.shape[-1]),
            size=target_length,
            mode="linear",
            align_corners=False,
        ).reshape(waveform.shape[0], waveform.shape[1], target_length)


def _match_channels(waveform, channels):
    current = int(waveform.shape[1])
    channels = max(1, int(channels))
    if current == channels:
        return waveform
    if current == 1:
        return waveform.repeat(1, channels, 1)
    if channels == 1:
        return waveform.mean(dim=1, keepdim=True)
    if current > channels:
        return waveform[:, :channels]
    repeats = (channels + current - 1) // current
    return waveform.repeat(1, repeats, 1)[:, :channels]


def _fit_audio(waveform, frame_count, fps, sample_rate):
    wanted = max(0, int(round(int(frame_count) * int(sample_rate) / float(fps))))
    if waveform.shape[-1] > wanted:
        return waveform[..., :wanted]
    if waveform.shape[-1] < wanted:
        padding = torch.zeros(
            (*waveform.shape[:-1], wanted - waveform.shape[-1]),
            dtype=waveform.dtype,
            device=waveform.device,
        )
        return torch.cat((waveform, padding), dim=-1)
    return waveform


def concat_h3_continuation(
    continuation_images,
    continuation_audio,
    original_images,
    original_audio,
    continuation_duration=0.0,
    append_original=True,
    fps=H3_FPS,
):
    continuation_images = _images(continuation_images, "Continuation")
    if continuation_images is None:
        raise ValueError("H3 continuation output requires generated images.")
    target_frames = max(0, int(round(float(continuation_duration or 0.0) * float(fps))))
    if target_frames:
        if int(continuation_images.shape[0]) < target_frames:
            raise ValueError(
                "H3 generated continuation is shorter than the requested duration: "
                f"{int(continuation_images.shape[0])} < {target_frames} frames."
            )
        continuation_images = continuation_images[:target_frames]

    generated_waveform, generated_rate = _audio_waveform(continuation_audio, "Continuation")
    if generated_waveform is not None:
        generated_waveform = _fit_audio(
            generated_waveform,
            int(continuation_images.shape[0]),
            fps,
            generated_rate,
        )
        continuation_audio = {
            "waveform": generated_waveform,
            "sample_rate": generated_rate,
        }
    if not bool(append_original) or original_images is None:
        return continuation_images, continuation_audio

    original_images = _images(original_images, "Original")
    original_images = _resize_images(
        original_images,
        int(continuation_images.shape[2]),
        int(continuation_images.shape[1]),
    ).to(device=continuation_images.device, dtype=continuation_images.dtype)
    output_images = torch.cat((original_images, continuation_images), dim=0).contiguous()

    original_waveform, original_rate = _audio_waveform(original_audio, "Original")
    if generated_waveform is None and original_waveform is None:
        return output_images, None
    if generated_waveform is None:
        original_waveform = _fit_audio(
            original_waveform,
            int(original_images.shape[0]),
            fps,
            original_rate,
        )
        return output_images, {"waveform": original_waveform, "sample_rate": original_rate}

    output_rate = int(generated_rate)
    generated_waveform = generated_waveform.to(device=continuation_images.device)
    if original_waveform is not None:
        output_rate = max(output_rate, int(original_rate))
        original_waveform = _resample(original_waveform, original_rate, output_rate)
        channels = max(int(original_waveform.shape[1]), int(generated_waveform.shape[1]))
        original_waveform = _match_channels(original_waveform, channels)
        generated_waveform = _match_channels(generated_waveform, channels)
    else:
        original_waveform = torch.zeros(
            (
                int(generated_waveform.shape[0]),
                int(generated_waveform.shape[1]),
                max(0, int(round(int(original_images.shape[0]) * output_rate / float(fps)))),
            ),
            dtype=generated_waveform.dtype,
            device=generated_waveform.device,
        )

    generated_waveform = _resample(generated_waveform, generated_rate, output_rate)
    original_waveform = original_waveform.to(
        device=generated_waveform.device,
        dtype=generated_waveform.dtype,
    )
    original_waveform = _fit_audio(
        original_waveform,
        int(original_images.shape[0]),
        fps,
        output_rate,
    )
    generated_waveform = _fit_audio(
        generated_waveform,
        int(continuation_images.shape[0]),
        fps,
        output_rate,
    )
    output_audio = {
        "waveform": torch.cat((original_waveform, generated_waveform), dim=-1).contiguous(),
        "sample_rate": output_rate,
    }
    return output_images, output_audio


class SimpAIH3ContinuationOutput(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIH3ContinuationOutput",
            display_name="H3 Continuation Output",
            category="SimpAI/video",
            description="Optionally prepend the original H3 video to the generated continuation.",
            inputs=[
                io.Image.Input("continuation_images"),
                io.Audio.Input("continuation_audio", optional=True),
                io.Image.Input("original_images", optional=True),
                io.Audio.Input("original_audio", optional=True),
                io.Float.Input("continuation_duration", default=0.0, min=0.0, max=3600.0, step=0.01, advanced=True),
                io.Boolean.Input("append_original", default=True),
                io.Float.Input("fps", default=H3_FPS, min=1.0, max=240.0, step=0.001, advanced=True),
            ],
            outputs=[
                io.Image.Output(display_name="images"),
                io.Audio.Output(display_name="audio"),
            ],
        )

    @classmethod
    def execute(
        cls,
        continuation_images,
        continuation_audio=None,
        original_images=None,
        original_audio=None,
        continuation_duration=0.0,
        append_original=True,
        fps=H3_FPS,
    ):
        images, audio = concat_h3_continuation(
            continuation_images,
            continuation_audio,
            original_images,
            original_audio,
            continuation_duration=continuation_duration,
            append_original=append_original,
            fps=fps,
        )
        return io.NodeOutput(images, audio)


NODE_CLASS_MAPPINGS = {
    "SimpAIH3ContinuationOutput": SimpAIH3ContinuationOutput,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3ContinuationOutput": "H3 Continuation Output",
}
