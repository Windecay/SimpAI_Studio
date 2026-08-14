import logging

import torch

import comfy.nested_tensor
import comfy.utils
import node_helpers
import nodes
from comfy_api.latest import io

from .SimpAIMiniMaxH3MotionContextLayout import (
    MC_AUDIO_KEY,
    MC_KEY,
    apply_patch as apply_layout_patch,
    is_applied as layout_patch_applied,
)
from .SimpAIMiniMaxH3MotionContextPayload import (
    apply_patch as apply_payload_patch,
    is_applied as payload_patch_applied,
)

try:
    import torchaudio
except ImportError:
    torchaudio = None

LOG = logging.getLogger("simpai_h3_motion_context")
H3_FPS = 24
H3_AUDIO_HZ = 40
FRAME_RESCALE = 5.0 / 3.0
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
VIDEO_RUN_GRID = (124, 107, 90, 73, 56, 39, 22, 5, 1)


def _ensure_patches(require_payload=False):
    if not layout_patch_applied() and not apply_layout_patch():
        raise RuntimeError(
            "SimpAI H3 motion context layout patch is unavailable / "
            "SimpAI H3 动作上下文布局补丁不可用"
        )
    if require_payload and not payload_patch_applied() and not apply_payload_patch():
        raise RuntimeError(
            "SimpAI H3 motion context payload patch is unavailable / "
            "SimpAI H3 动作上下文 payload 补丁不可用"
        )


def _pixel_frames(latent_t):
    return sum(FRAME_PER_TOKEN[index % 5] for index in range(int(latent_t)))


def _step_offsets(latent_t):
    offsets = []
    current = 0
    for index in range(int(latent_t)):
        offsets.append(current)
        current += FRAME_PER_TOKEN[index % 5]
    return offsets


def _steps_for_frames(frame_count):
    steps = 0
    covered = 0
    while covered < int(frame_count):
        covered += FRAME_PER_TOKEN[steps % 5]
        steps += 1
    return steps if covered == int(frame_count) else None


def _resize_frames(frames, width, height):
    samples = frames[..., :3].movedim(-1, 1)
    samples = comfy.utils.common_upscale(samples, width, height, "lanczos", "disabled")
    return samples.movedim(1, -1)


def _streams_from_latent(latent):
    samples = latent.get("samples") if isinstance(latent, dict) else None
    if isinstance(samples, comfy.nested_tensor.NestedTensor) or getattr(samples, "is_nested", False):
        parts = list(samples.unbind())
    elif isinstance(samples, (tuple, list)):
        parts = list(samples)
    else:
        raise ValueError(
            "SimpAI H3 motion context expects an AV latent with video/audio streams / "
            "需要包含 video/audio 两路的 H3 AV latent"
        )
    if len(parts) < 1:
        raise ValueError("SimpAI H3 AV latent has no streams / H3 AV latent 没有数据流")
    return parts


def _video_from_latent(latent):
    video = _streams_from_latent(latent)[0]
    if video.ndim == 4:
        video = video.unsqueeze(0)
    if video.ndim != 5:
        raise ValueError(f"Unexpected H3 video latent shape / H3 video latent 形状异常: {tuple(video.shape)}")
    return video


def _audio_tail_from_latent(latent, frame_count):
    parts = _streams_from_latent(latent)
    if len(parts) < 2:
        raise ValueError("Context latent has no audio stream / 上下文 latent 没有音频流")
    video, audio = parts[0], parts[1]
    if video.ndim == 4:
        video = video.unsqueeze(0)
    if audio.ndim == 3:
        audio = audio.unsqueeze(0)
    if audio.ndim != 4:
        raise ValueError(f"Unexpected H3 audio latent shape / H3 audio latent 形状异常: {tuple(audio.shape)}")
    total_steps = int(audio.shape[-1])
    total_frames = _pixel_frames(int(video.shape[2]))
    overhang = total_steps - FRAME_RESCALE * total_frames
    if not 0.0 <= overhang < 1.0:
        overhang = 0.0
    want_steps = int(round(int(frame_count) / H3_FPS * H3_AUDIO_HZ))
    want_steps = min(max(1, want_steps), total_steps)
    return audio[:1, ..., total_steps - want_steps:].clone(), want_steps, float(overhang)


def _video_tail_from_latent(latent, frame_count):
    video = _video_from_latent(latent)
    total_steps = int(video.shape[2])
    steps = _steps_for_frames(frame_count)
    if steps is None:
        raise ValueError("Motion context frame count is not on the H3 VAE grid / 动作上下文帧数不在 H3 VAE 网格上")
    if steps > total_steps:
        raise ValueError("Context latent is shorter than the requested motion context / 上下文 latent 长度不足")
    start = total_steps - steps
    if start % 5 != 0:
        raise ValueError("Context latent temporal phase is incompatible / 上下文 latent 时间相位不兼容")
    covered = _pixel_frames(steps)
    if covered != int(frame_count):
        raise RuntimeError("H3 VAE temporal grid changed / H3 VAE 时间网格发生变化")
    blocks = [video[:1, :, start + index:start + index + 1].clone() for index in range(steps)]
    return blocks, _step_offsets(steps), covered


def _encode_tail_audio(audio_vae, audio, seconds):
    waveform = audio.get("waveform")
    sample_rate = int(audio.get("sample_rate", H3_AUDIO_HZ))
    vae_sample_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
    if sample_rate != vae_sample_rate:
        if torchaudio is None:
            raise RuntimeError("torchaudio is required for audio resampling / 音频重采样需要 torchaudio")
        waveform = torchaudio.functional.resample(waveform, sample_rate, vae_sample_rate)
    want = int(round(float(seconds) * vae_sample_rate))
    if waveform.shape[-1] > want:
        waveform = waveform[..., -want:]
    encoded = audio_vae.encode(waveform[:1].movedim(1, -1))
    return encoded, int(encoded.shape[-1])


class SimpAIMiniMaxH3MotionContext(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3MotionContext",
            display_name="SimpAI MiniMax H3 Motion Context / H3 动作上下文",
            category="conditioning/video_models",
            description=(
                "Pin the previous H3 clip tail at the head of the next clip. / "
                "把上一段 H3 视频尾部固定到下一段开头，用于视频续写。"
            ),
            inputs=[
                io.Conditioning.Input("conditioning"),
                io.Latent.Input("latent"),
                io.Combo.Input("context_length", options=["22", "5", "39", "56"], default="22"),
                io.Vae.Input("vae", optional=True),
                io.Int.Input("audio_context_length", default=22, min=0, max=240, advanced=True),
                io.Latent.Input("context_latent", optional=True),
                io.Image.Input("context_frames", optional=True),
                io.Vae.Input("audio_vae", optional=True, advanced=True),
                io.Audio.Input("context_audio", optional=True, advanced=True),
                io.Boolean.Input("prefer_video", default=False, advanced=True),
            ],
            outputs=[
                io.Conditioning.Output(display_name="conditioning / 条件"),
                io.Int.Output(display_name="trim_frames / 裁剪帧数"),
            ],
        )

    @classmethod
    def execute(
        cls,
        conditioning,
        latent,
        context_length,
        vae=None,
        audio_context_length=22,
        context_latent=None,
        context_frames=None,
        audio_vae=None,
        context_audio=None,
        prefer_video=False,
    ):
        if context_latent is None and context_frames is None and context_audio is None:
            return io.NodeOutput(conditioning, 0)

        use_frame_context = context_frames is not None and (bool(prefer_video) or context_latent is None)
        _ensure_patches(
            require_payload=(
                context_latent is not None
                or context_frames is not None
                or context_audio is not None
            )
        )
        target_video = _video_from_latent(latent)
        target_latent_t = int(target_video.shape[2])
        target_height = int(target_video.shape[3]) * 16
        target_width = int(target_video.shape[4]) * 16
        target_frame_count = _pixel_frames(target_latent_t)

        if context_latent is not None and not use_frame_context:
            source_video = _video_from_latent(context_latent)
            source_width = int(source_video.shape[4]) * 16
            source_height = int(source_video.shape[3]) * 16
            if (source_width, source_height) != (target_width, target_height):
                raise ValueError(
                    "Context latent resolution must match the target / "
                    "上下文 latent 分辨率必须与目标一致"
                )
            available = _pixel_frames(int(source_video.shape[2]))
            source_kind = "latent"
        else:
            if context_frames is None:
                raise ValueError("Wire context_latent or context_frames / 请连接 context_latent 或 context_frames")
            available = int(context_frames.shape[0])
            source_kind = "frames"

        requested = min(max(1, int(context_length)), available)
        context_frames_count = next((value for value in VIDEO_RUN_GRID if value <= requested), None)
        if context_frames_count is None:
            raise ValueError("Not enough frames for H3 motion context / 可用帧数不足以构成 H3 动作上下文")
        if context_frames_count >= target_frame_count:
            raise ValueError("Motion context must be shorter than the target / 动作上下文必须短于目标视频")

        if source_kind == "latent":
            blocks, offsets, span = _video_tail_from_latent(context_latent, context_frames_count)
        else:
            if vae is None:
                raise ValueError("vae is required for context_frames / 使用 context_frames 时需要连接 vae")
            tail = _resize_frames(
                context_frames[-context_frames_count:],
                target_width,
                target_height,
            )
            encoded = vae.encode(tail)
            if encoded.ndim != 5:
                raise ValueError("H3 video VAE must return a 5D latent / H3 video VAE 必须返回 5D latent")
            offsets = _step_offsets(int(encoded.shape[2]))
            span = _pixel_frames(int(encoded.shape[2]))
            if span != context_frames_count:
                raise RuntimeError("H3 VAE temporal grid changed / H3 VAE 时间网格发生变化")
            blocks = [encoded[:, :, index:index + 1] for index in range(int(encoded.shape[2]))]

        keyframes = [
            {
                "resolved_frame_index": 0,
                MC_KEY: int(offset),
                "latent": block,
            }
            for offset, block in zip(offsets, blocks)
        ]
        values = {
            "minimax_keyframes": keyframes,
            "minimax_frame_count": target_frame_count,
        }
        output_conditioning = node_helpers.conditioning_set_values(conditioning, values)

        if source_kind == "latent" or context_audio is not None or context_latent is not None:
            if source_kind == "latent" or context_audio is None:
                audio_latent, audio_steps, overhang = _audio_tail_from_latent(
                    context_latent,
                    int(audio_context_length) or span,
                )
            else:
                if audio_vae is None:
                    raise ValueError("audio_vae is required for context_audio / 使用 context_audio 时需要 audio_vae")
                audio_latent, audio_steps = _encode_tail_audio(
                    audio_vae,
                    context_audio,
                    (int(audio_context_length) or span) / H3_FPS,
                )
                overhang = 0.0

            end_frame = float(span) + overhang / FRAME_RESCALE
            end_frame = round(FRAME_RESCALE * end_frame) / FRAME_RESCALE
            audio_ref = {
                "kind": "audio",
                "ref_audio_t": int(audio_steps),
                "audio_latent": audio_latent,
                MC_AUDIO_KEY: end_frame,
            }
            output_conditioning = node_helpers.conditioning_set_values(
                output_conditioning,
                {"minimax_refs": [audio_ref]},
                append=True,
            )

        LOG.info(
            "SimpAI H3 motion context: source=%s, context=%d, target=%d, trim=%d",
            source_kind,
            span,
            target_frame_count,
            span,
        )
        return io.NodeOutput(output_conditioning, span)


class SimpAIMiniMaxH3MotionContextTrim(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3MotionContextTrim",
            display_name="SimpAI MiniMax H3 Context Trim / H3 上下文裁剪",
            category="conditioning/video_models",
            description=(
                "Remove repeated head frames and matching audio after H3 continuation. / "
                "续写后删除开头重复的上下文帧，并同步裁剪音频。"
            ),
            inputs=[
                io.Image.Input("images"),
                io.Int.Input("trim_frames", default=0, min=0, max=4096),
                io.Audio.Input("audio", optional=True),
                io.Float.Input("fps", default=24.0, min=1.0, max=240.0, step=0.001, advanced=True),
                io.Boolean.Input("match_tail", default=True, advanced=True),
            ],
            outputs=[io.Image.Output(display_name="images / 图像"), io.Audio.Output(display_name="audio / 音频")],
        )

    @classmethod
    def execute(cls, images, trim_frames, audio=None, fps=24.0, match_tail=True):
        trim = max(0, int(trim_frames))
        if trim >= int(images.shape[0]) and trim:
            raise ValueError("Cannot trim the whole H3 clip / 不能裁掉整段 H3 视频")
        output_images = images[trim:] if trim else images
        output_audio = audio
        if audio is not None and trim:
            waveform = audio["waveform"]
            sample_rate = int(audio["sample_rate"])
            cut = int(round(trim / float(fps) * sample_rate))
            if cut >= int(waveform.shape[-1]):
                raise ValueError("Audio is shorter than the motion context / 音频短于动作上下文")
            waveform = waveform[..., cut:]
            if match_tail:
                wanted = int(round((int(images.shape[0]) - trim) / float(fps) * sample_rate))
                waveform = waveform[..., :wanted]
            output_audio = {"waveform": waveform, "sample_rate": sample_rate}
        return io.NodeOutput(output_images, output_audio)


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3MotionContext": SimpAIMiniMaxH3MotionContext,
    "SimpAIMiniMaxH3MotionContextTrim": SimpAIMiniMaxH3MotionContextTrim,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3MotionContext": "SimpAI MiniMax H3 Motion Context / H3 动作上下文",
    "SimpAIMiniMaxH3MotionContextTrim": "SimpAI MiniMax H3 Context Trim / H3 上下文裁剪",
}
