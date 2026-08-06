import torch

import comfy.model_management
import comfy.nested_tensor
import comfy.utils
import nodes
from comfy_api.latest import io


H3_FPS = 24
H3_AUDIO_FPS = 40
H3_VIDEO_LATENT_CHANNELS = 24
H3_AUDIO_LATENT_CHANNELS = 32
H3_AUDIO_LATENT_PLANES = 2
H3_SPATIAL_DOWNSCALE = 16


def _align_frame_count(length):
    length = max(5, int(length))
    while length % 17 != 5:
        length += 1
    return length


def _h3_temporal_shape(length):
    frame_count = _align_frame_count(length)
    video_latent_t = ((frame_count - 5) // 17) * 5 + 2
    audio_latent_t = round(frame_count / H3_FPS * H3_AUDIO_FPS)
    return frame_count, video_latent_t, audio_latent_t


def _fit_frames(frames, frame_count):
    if frames is None or frames.shape[0] <= 0:
        raise ValueError("MiniMax H3 upscale needs at least one source video frame")
    frames = frames[..., :3]
    if frames.shape[0] >= frame_count:
        return frames[:frame_count]
    return torch.cat(
        [frames, frames[-1:].repeat(frame_count - frames.shape[0], 1, 1, 1)],
        dim=0,
    )


def _resize_frames(frames, width, height):
    samples = frames.movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", "disabled")
    return samples.movedim(1, -1)


def _fit_audio_latent(audio_latent, target_t):
    if audio_latent.shape[-1] == target_t:
        return audio_latent
    if audio_latent.shape[-1] > target_t:
        return audio_latent[..., :target_t]
    padding = audio_latent.new_zeros(
        (*audio_latent.shape[:-1], target_t - audio_latent.shape[-1])
    )
    return torch.cat([audio_latent, padding], dim=-1)


def _encode_source_audio(audio_vae, source_audio, target_t):
    import torchaudio

    waveform = source_audio.get("waveform")
    if waveform is None:
        raise ValueError("Source audio has no waveform")
    sample_rate = int(source_audio.get("sample_rate", 32000))
    vae_sample_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
    if sample_rate != vae_sample_rate:
        waveform = torchaudio.functional.resample(waveform, sample_rate, vae_sample_rate)
    audio_latent = audio_vae.encode(waveform[:1].movedim(1, -1))
    if audio_latent.ndim != 4 or audio_latent.shape[1] != H3_AUDIO_LATENT_CHANNELS:
        raise ValueError(
            "MiniMax H3 audio VAE returned an unexpected latent shape: "
            f"{tuple(audio_latent.shape)}"
        )
    if audio_latent.shape[2] != H3_AUDIO_LATENT_PLANES:
        raise ValueError(
            "MiniMax H3 audio latent has an unexpected plane count: "
            f"{audio_latent.shape[2]}"
        )
    return _fit_audio_latent(audio_latent, target_t)


class SimpAIMiniMaxH3VideoUpscaleLatent(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3VideoUpscaleLatent",
            display_name=(
                "SimpAI MiniMax H3 Video Upscale Latent / "
                "SimpAI MiniMax H3 视频放大初始 Latent"
            ),
            category="conditioning/video_models",
            description=(
                "Experimental source-video latent for low-denoise H3 reference generation. "
                "实验节点：把源视频编码成 H3 的初始 AV latent，配合 R2V reference context 使用。"
            ),
            inputs=[
                io.Vae.Input("vae"),
                io.Int.Input("width", default=1024, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=576, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input(
                    "length",
                    default=124,
                    min=5,
                    max=3600,
                    step=17,
                    tooltip=(
                        "H3 frame count at 24 fps; aligned to 17k+5. "
                        "H3 24 fps 帧数，会对齐到 17k+5。"
                    ),
                ),
                io.Image.Input(
                    "source_video",
                    tooltip=(
                        "Source frames to encode as the initial latent. "
                        "要编码成初始 latent 的源视频帧。"
                    ),
                ),
                io.Vae.Input("audio_vae", optional=True, advanced=True),
                io.Audio.Input(
                    "source_audio",
                    optional=True,
                    advanced=True,
                    tooltip=(
                        "Optional source audio for the initial H3 audio latent. "
                        "可选的源音频，用于编码 H3 初始 audio latent。"
                    ),
                ),
            ],
            outputs=[io.Latent.Output(display_name="H3 AV latent / H3 AV latent")],
        )

    @classmethod
    def execute(
        cls,
        vae,
        width,
        height,
        length,
        source_video,
        audio_vae=None,
        source_audio=None,
    ) -> io.NodeOutput:
        width = int(width)
        height = int(height)
        if width < 32 or height < 32 or width % 32 != 0 or height % 32 != 0:
            raise ValueError("MiniMax H3 width and height must be multiples of 32")

        frame_count, video_latent_t, audio_latent_t = _h3_temporal_shape(length)
        frames = _fit_frames(source_video, frame_count)
        frames = _resize_frames(frames, width, height)
        video_latent = vae.encode(frames)

        if video_latent.ndim != 5 or video_latent.shape[1] != H3_VIDEO_LATENT_CHANNELS:
            raise ValueError(
                "MiniMax H3 video VAE returned an unexpected latent shape: "
                f"{tuple(video_latent.shape)}"
            )
        expected_shape = (video_latent_t, height // H3_SPATIAL_DOWNSCALE, width // H3_SPATIAL_DOWNSCALE)
        actual_shape = tuple(video_latent.shape[2:])
        if actual_shape != expected_shape:
            raise ValueError(
                "MiniMax H3 source latent shape does not match the target canvas: "
                f"expected {expected_shape}, got {actual_shape}"
            )

        if source_audio is not None:
            if audio_vae is None:
                raise ValueError("audio_vae is required when source_audio is provided")
            audio_latent = _encode_source_audio(audio_vae, source_audio, audio_latent_t)
            audio_latent = audio_latent.to(device=video_latent.device, dtype=video_latent.dtype)
        else:
            audio_latent = video_latent.new_zeros(
                [
                    video_latent.shape[0],
                    H3_AUDIO_LATENT_CHANNELS,
                    H3_AUDIO_LATENT_PLANES,
                    audio_latent_t,
                ]
            )

        samples = comfy.nested_tensor.NestedTensor((video_latent, audio_latent))
        return io.NodeOutput({"samples": samples})


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": SimpAIMiniMaxH3VideoUpscaleLatent,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": (
        "SimpAI MiniMax H3 Video Upscale Latent / "
        "SimpAI MiniMax H3 视频放大初始 Latent"
    ),
}
