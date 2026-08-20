import torch
import torch.nn.functional as F
import importlib.util
from pathlib import Path

import comfy.ldm.common_dit
import comfy.model_management
import comfy.nested_tensor
import comfy.utils
from comfy_api.latest import io

try:
    from .SimpAIMiniMaxH3LearnedLatentUpscaler import (
        H3_LEARNED_PRECISIONS,
        scan_h3_latent_upscaler_models,
        upscale_h3_video_latent,
    )
except ImportError:
    _helper_path = Path(__file__).with_name("SimpAIMiniMaxH3LearnedLatentUpscaler.py")
    _helper_spec = importlib.util.spec_from_file_location(
        "simpai_h3_learned_latent_upscaler_test", _helper_path
    )
    _helper_module = importlib.util.module_from_spec(_helper_spec)
    _helper_spec.loader.exec_module(_helper_module)
    H3_LEARNED_PRECISIONS = _helper_module.H3_LEARNED_PRECISIONS
    scan_h3_latent_upscaler_models = _helper_module.scan_h3_latent_upscaler_models
    upscale_h3_video_latent = _helper_module.upscale_h3_video_latent


H3_FPS = 24
H3_AUDIO_FPS = 40
H3_VIDEO_LATENT_CHANNELS = 24
H3_AUDIO_LATENT_CHANNELS = 32
H3_AUDIO_LATENT_PLANES = 2
H3_SPATIAL_DOWNSCALE = 16
H3_UPSCALE_METHODS = ("nearest", "bilinear", "bicubic", "learned_2d", "learned_3d")
H3_DIT_SPATIAL_MULTIPLE = 2


def _max_resolution():
    try:
        import nodes

        return int(nodes.MAX_RESOLUTION)
    except Exception:
        # Keep schema-only imports usable in lightweight test/runtime environments.
        return 32768


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


def _snap_h3_spatial_size(size):
    return max(
        H3_DIT_SPATIAL_MULTIPLE,
        ((int(size) + H3_DIT_SPATIAL_MULTIPLE - 1) // H3_DIT_SPATIAL_MULTIPLE)
        * H3_DIT_SPATIAL_MULTIPLE,
    )


def _resize_latent_spatial(samples, target_h, target_w, method):
    if method not in H3_UPSCALE_METHODS:
        raise ValueError(
            f"Unsupported MiniMax H3 latent upscale method {method!r}; "
            f"expected one of {H3_UPSCALE_METHODS}"
        )
    if samples.ndim < 4:
        raise ValueError(
            "MiniMax H3 visual latent needs at least 4 dimensions: "
            f"{tuple(samples.shape)}"
        )

    orig_shape = tuple(samples.shape)
    if orig_shape[-2:] == (target_h, target_w):
        return samples

    folded = samples
    if samples.ndim > 4:
        folded = samples.reshape(
            samples.shape[0], samples.shape[1], -1, samples.shape[-2], samples.shape[-1]
        )
        folded = folded.movedim(2, 1)
        folded = folded.reshape(-1, orig_shape[1], orig_shape[-2], orig_shape[-1])

    if method in ("bilinear", "bicubic"):
        folded = F.interpolate(
            folded,
            size=(target_h, target_w),
            mode=method,
            align_corners=False,
        )
    else:
        folded = F.interpolate(folded, size=(target_h, target_w), mode=method)

    if samples.ndim == 4:
        return folded

    folded = folded.reshape((orig_shape[0], -1, orig_shape[1], target_h, target_w))
    return folded.movedim(2, 1).reshape(orig_shape[:-2] + (target_h, target_w))


def _resize_video_latent(video_latent, width, height):
    target_h = height // H3_SPATIAL_DOWNSCALE
    target_w = width // H3_SPATIAL_DOWNSCALE
    return _resize_latent_spatial(video_latent, target_h, target_w, "bicubic")


def _upscale_video_latent(
    video_latent,
    scale_by,
    method,
    upscaler_model=None,
    upscaler_precision="bf16",
    upscaler_device="auto",
    tile_width=None,
    tile_height=None,
    tile_frames=None,
    tile_overlap=None,
    tile_temporal_overlap=None,
):
    if scale_by <= 0:
        raise ValueError("MiniMax H3 latent upscale scale_by must be greater than zero")
    if method in ("learned_2d", "learned_3d"):
        return upscale_h3_video_latent(
            video_latent,
            scale_by=scale_by,
            model_name=upscaler_model,
            variant=method.removeprefix("learned_"),
            precision=upscaler_precision,
            device=upscaler_device,
            tile_width=tile_width,
            tile_height=tile_height,
            tile_frames=tile_frames,
            tile_overlap=tile_overlap,
            tile_temporal_overlap=tile_temporal_overlap,
        )
    target_h = _snap_h3_spatial_size(round(video_latent.shape[-2] * scale_by))
    target_w = _snap_h3_spatial_size(round(video_latent.shape[-1] * scale_by))
    return _resize_latent_spatial(video_latent, target_h, target_w, method)


def _resize_video_like_latent(
    latent,
    width,
    height,
    method,
    upscaler_model=None,
    upscaler_precision="bf16",
    upscaler_device="auto",
    scale_hint=None,
    tile_width=None,
    tile_height=None,
    tile_frames=None,
    tile_overlap=None,
    tile_temporal_overlap=None,
):
    target_h = int(height) // H3_SPATIAL_DOWNSCALE
    target_w = int(width) // H3_SPATIAL_DOWNSCALE
    if target_h < 1 or target_w < 1:
        raise ValueError("MiniMax H3 target width and height must be at least 16")
    if method in ("learned_2d", "learned_3d"):
        if scale_hint is None:
            source_h, source_w = latent.shape[-2:]
            scale_hint = ((target_h / source_h) * (target_w / source_w)) ** 0.5
        return upscale_h3_video_latent(
            latent,
            scale_by=scale_hint,
            target_width=int(width),
            target_height=int(height),
            model_name=upscaler_model,
            variant=method.removeprefix("learned_"),
            precision=upscaler_precision,
            device=upscaler_device,
            tile_width=tile_width,
            tile_height=tile_height,
            tile_frames=tile_frames,
            tile_overlap=tile_overlap,
            tile_temporal_overlap=tile_temporal_overlap,
        )
    if latent.ndim == 4:
        latent = _resize_latent_spatial(latent, target_h, target_w, method)
        return comfy.ldm.common_dit.pad_to_patch_size(
            latent.unsqueeze(2), (1, H3_DIT_SPATIAL_MULTIPLE, H3_DIT_SPATIAL_MULTIPLE)
        ).squeeze(2)
    if latent.ndim == 5:
        latent = _resize_latent_spatial(latent, target_h, target_w, method)
        return comfy.ldm.common_dit.pad_to_patch_size(
            latent, (1, H3_DIT_SPATIAL_MULTIPLE, H3_DIT_SPATIAL_MULTIPLE)
        )
    raise ValueError(
        "MiniMax H3 visual latent needs 4 or 5 dimensions: "
        f"{tuple(latent.shape)}"
    )


def _extract_latent_members(samples):
    if isinstance(samples, comfy.nested_tensor.NestedTensor) or getattr(samples, "is_nested", False):
        members = list(samples.unbind())
        if not members:
            raise ValueError("MiniMax H3 NestedTensor has no latent members")
        return members, True
    if isinstance(samples, torch.Tensor):
        return [samples], False
    raise TypeError(
        "MiniMax H3 latent samples must be a Tensor or NestedTensor, "
        f"got {type(samples)}"
    )


def _wrap_latent_members(members, was_nested):
    if was_nested:
        return comfy.nested_tensor.NestedTensor(members)
    if len(members) != 1:
        raise ValueError(
            "MiniMax H3 plain latent path expects one tensor, "
            f"got {len(members)}"
        )
    return members[0]


def _upscale_video_like_latent(
    latent,
    scale_by,
    method,
    upscaler_model=None,
    upscaler_precision="bf16",
    upscaler_device="auto",
    tile_width=None,
    tile_height=None,
    tile_frames=None,
    tile_overlap=None,
    tile_temporal_overlap=None,
):
    if latent.ndim == 4:
        latent = _upscale_video_latent(
            latent.unsqueeze(2),
            scale_by,
            method,
            upscaler_model,
            upscaler_precision,
            upscaler_device,
            tile_width,
            tile_height,
            tile_frames,
            tile_overlap,
            tile_temporal_overlap,
        )
        if method in ("learned_2d", "learned_3d"):
            return latent.squeeze(2)
        latent = comfy.ldm.common_dit.pad_to_patch_size(
            latent, (1, H3_DIT_SPATIAL_MULTIPLE, H3_DIT_SPATIAL_MULTIPLE)
        )
        return latent.squeeze(2)
    if latent.ndim == 5:
        latent = _upscale_video_latent(
            latent,
            scale_by,
            method,
            upscaler_model,
            upscaler_precision,
            upscaler_device,
            tile_width,
            tile_height,
            tile_frames,
            tile_overlap,
            tile_temporal_overlap,
        )
        if method in ("learned_2d", "learned_3d"):
            return latent
        return comfy.ldm.common_dit.pad_to_patch_size(
            latent, (1, H3_DIT_SPATIAL_MULTIPLE, H3_DIT_SPATIAL_MULTIPLE)
        )
    raise ValueError(
        "MiniMax H3 visual latent needs 4 or 5 dimensions: "
        f"{tuple(latent.shape)}"
    )


def _upscale_source_latent(source_latent, width, height):
    samples = source_latent.get("samples") if source_latent is not None else None
    if not isinstance(samples, comfy.nested_tensor.NestedTensor):
        raise ValueError("MiniMax H3 source_latent must contain a nested video/audio latent")

    latents = samples.unbind()
    if len(latents) != 2:
        raise ValueError("MiniMax H3 source_latent must contain exactly video and audio latents")

    video_latent, audio_latent = latents
    if video_latent.ndim != 5 or video_latent.shape[1] != H3_VIDEO_LATENT_CHANNELS:
        raise ValueError(
            "MiniMax H3 source video latent has an unexpected shape: "
            f"{tuple(video_latent.shape)}"
        )
    if audio_latent.ndim != 4 or audio_latent.shape[1] != H3_AUDIO_LATENT_CHANNELS:
        raise ValueError(
            "MiniMax H3 source audio latent has an unexpected shape: "
            f"{tuple(audio_latent.shape)}"
        )
    if audio_latent.shape[2] != H3_AUDIO_LATENT_PLANES:
        raise ValueError(
            "MiniMax H3 source audio latent has an unexpected plane count: "
            f"{audio_latent.shape[2]}"
        )

    video_latent = _resize_video_latent(video_latent, width, height)
    audio_latent = audio_latent.to(device=video_latent.device, dtype=video_latent.dtype)
    return comfy.nested_tensor.NestedTensor((video_latent, audio_latent))


def _fit_audio_latent(audio_latent, target_t):
    if audio_latent.shape[-1] == target_t:
        return audio_latent
    if audio_latent.shape[-1] > target_t:
        return audio_latent[..., :target_t]
    padding = audio_latent.new_zeros(
        (*audio_latent.shape[:-1], target_t - audio_latent.shape[-1])
    )
    return torch.cat([audio_latent, padding], dim=-1)


def _get_source_audio_waveform(source_audio):
    if source_audio is None:
        return None
    getter = getattr(source_audio, "get", None)
    if getter is None:
        return None
    waveform = getter("waveform")
    if waveform is None:
        return None
    if not isinstance(waveform, torch.Tensor):
        raise ValueError("Source audio waveform must be a tensor")
    if waveform.numel() == 0:
        return None
    return waveform


def _encode_source_audio(audio_vae, source_audio, target_t):
    import torchaudio

    waveform = _get_source_audio_waveform(source_audio)
    if waveform is None:
        return None
    if audio_vae is None:
        raise ValueError("audio_vae is required when source audio contains a waveform")
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


def _upscale_latent_dict(
    latent,
    scale_by,
    method,
    target_width=None,
    target_height=None,
    upscaler_model=None,
    upscaler_precision="bf16",
    upscaler_device="auto",
    tile_width=None,
    tile_height=None,
    tile_frames=None,
    tile_overlap=None,
    tile_temporal_overlap=None,
):
    if not isinstance(latent, dict) or "samples" not in latent:
        raise ValueError("MiniMax H3 latent upscale needs a LATENT dict with samples")

    out = latent.copy()
    members, was_nested = _extract_latent_members(latent["samples"])
    if target_width and target_height:
        video_up = _resize_video_like_latent(
            members[0],
            target_width,
            target_height,
            method,
            upscaler_model,
            upscaler_precision,
            upscaler_device,
            scale_hint=scale_by,
            tile_width=tile_width,
            tile_height=tile_height,
            tile_frames=tile_frames,
            tile_overlap=tile_overlap,
            tile_temporal_overlap=tile_temporal_overlap,
        )
    else:
        video_up = _upscale_video_like_latent(
            members[0],
            scale_by,
            method,
            upscaler_model,
            upscaler_precision,
            upscaler_device,
            tile_width,
            tile_height,
            tile_frames,
            tile_overlap,
            tile_temporal_overlap,
        )

    if was_nested:
        out["samples"] = _wrap_latent_members([video_up, *members[1:]], True)
    else:
        out["samples"] = video_up

    noise_mask = latent.get("noise_mask")
    if noise_mask is not None:
        mask_method = "bicubic" if method in ("learned_2d", "learned_3d") else method
        is_nested_mask = isinstance(
            noise_mask, comfy.nested_tensor.NestedTensor
        ) or getattr(noise_mask, "is_nested", False)
        if is_nested_mask:
            mask_members, _ = _extract_latent_members(noise_mask)
            if target_width and target_height:
                mask_video_up = _resize_video_like_latent(
                    mask_members[0],
                    target_width,
                    target_height,
                    mask_method,
                    scale_hint=scale_by,
                )
            else:
                mask_video_up = _upscale_video_like_latent(
                    mask_members[0], scale_by, mask_method
                )
            out["noise_mask"] = _wrap_latent_members(
                [mask_video_up, *mask_members[1:]], True
            )
        elif isinstance(noise_mask, torch.Tensor) and noise_mask.ndim >= 4:
            out["noise_mask"] = _upscale_video_like_latent(
                noise_mask, scale_by, mask_method
            )

    return out


def _upscale_and_prepare_clean_latent(
    latent,
    scale_by,
    method,
    target_width=None,
    target_height=None,
    upscaler_model=None,
    upscaler_precision="bf16",
    upscaler_device="auto",
    tile_width=None,
    tile_height=None,
    tile_frames=None,
    tile_overlap=None,
    tile_temporal_overlap=None,
):
    """Upscale only the visual member and keep the AV latent clean.

    The second sampler owns noise generation and denoise strength.  This keeps
    the first-pass result from being noised once in this node and again by the
    sampler.
    """
    return _upscale_latent_dict(
        latent,
        scale_by,
        method,
        target_width=target_width,
        target_height=target_height,
        upscaler_model=upscaler_model,
        upscaler_precision=upscaler_precision,
        upscaler_device=upscaler_device,
        tile_width=tile_width,
        tile_height=tile_height,
        tile_frames=tile_frames,
        tile_overlap=tile_overlap,
        tile_temporal_overlap=tile_temporal_overlap,
    )


class SimpAIMiniMaxH3VideoUpscaleLatent(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3VideoUpscaleLatent",
            display_name="SimpAI MiniMax H3 Initial Latent / H3 视频初始 Latent",
            category="conditioning/video_models",
            description=(
                "Prepare a low-denoise H3 AV latent from source media or an existing latent for reference generation. / "
                "把源媒体或已有 H3 AV latent 处理成低去噪参考生成的初始 latent。"
            ),
            inputs=[
                io.Vae.Input("vae", optional=True),
                io.Int.Input("width", default=1024, min=32, max=_max_resolution(), step=32),
                io.Int.Input("height", default=576, min=32, max=_max_resolution(), step=32),
                io.Int.Input(
                    "length",
                    default=124,
                    min=5,
                    max=3600,
                    step=17,
                    tooltip=(
                        "H3 frame count at 24 fps; aligned to 17k+5. / H3 24 fps 帧数，会对齐到 17k+5。"
                    ),
                ),
                io.Image.Input(
                    "source_video",
                    optional=True,
                    tooltip=(
                        "Source video frames to encode. / 要编码成初始 latent 的源视频帧。"
                    ),
                ),
                io.Latent.Input("source_latent", optional=True),
                io.Vae.Input("audio_vae", optional=True, advanced=True),
                io.Audio.Input(
                    "source_audio",
                    optional=True,
                    advanced=True,
                    tooltip=(
                        "Optional source audio for the initial H3 audio latent. / 可选的源音频，用于编码 H3 初始 audio latent。"
                    ),
                ),
            ],
            outputs=[io.Latent.Output(display_name="H3 AV latent")],
        )

    @classmethod
    def execute(
        cls,
        vae,
        width,
        height,
        length,
        source_video,
        source_latent=None,
        audio_vae=None,
        source_audio=None,
    ) -> io.NodeOutput:
        width = int(width)
        height = int(height)
        if width < 32 or height < 32 or width % 32 != 0 or height % 32 != 0:
            raise ValueError("MiniMax H3 width and height must be multiples of 32")

        if source_latent is not None:
            samples = _upscale_source_latent(source_latent, width, height)
            return io.NodeOutput({"samples": samples})

        if vae is None:
            raise ValueError("vae is required when source_latent is not provided")
        if source_video is None:
            raise ValueError("source_video or source_latent is required")

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

        audio_latent = _encode_source_audio(audio_vae, source_audio, audio_latent_t)
        if audio_latent is not None:
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


class SimpAIMiniMaxH3LatentUpscaleCombined(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        model_options = scan_h3_latent_upscaler_models()
        return io.Schema(
            node_id="SimpAIMiniMaxH3LatentUpscaleCombined",
            display_name="SimpAI MiniMax H3 Latent 2 Pass / H3 latent 双采样放大",
            category="conditioning/video_models",
            is_experimental=True,
            description=(
                "Upscale the first-pass H3 video latent and preserve the audio latent. Conditioning inputs are compatibility pass-throughs and must be re-encoded by an H3 conditioning node. / "
                "放大第一阶段 H3 video latent 并保留 audio latent。条件输入仅为兼容透传，必须由 H3 条件节点重新编码。"
            ),
            inputs=[
                io.Latent.Input("samples"),
                io.Float.Input("scale_by", default=1.5, min=0.01, max=8.0, step=0.01),
                io.Combo.Input(
                    "upscale_method",
                    options=list(H3_UPSCALE_METHODS),
                    default="bicubic",
                ),
                io.Combo.Input(
                    "upscaler_model",
                    options=model_options,
                    default=model_options[0],
                    advanced=True,
                ),
                io.Combo.Input(
                    "upscaler_precision",
                    options=list(H3_LEARNED_PRECISIONS),
                    default="bf16",
                    advanced=True,
                ),
                io.Combo.Input(
                    "upscaler_device",
                    options=["auto", "cuda", "cpu"],
                    default="auto",
                    advanced=True,
                ),
                io.Int.Input(
                    "tile_width",
                    default=0,
                    min=0,
                    max=4096,
                    step=2,
                    optional=True,
                    advanced=True,
                    tooltip="空间块宽度，单位为 latent token；0 表示自动。",
                ),
                io.Int.Input(
                    "tile_height",
                    default=0,
                    min=0,
                    max=4096,
                    step=2,
                    optional=True,
                    advanced=True,
                    tooltip="空间块高度，单位为 latent token；0 表示自动。",
                ),
                io.Int.Input(
                    "tile_frames",
                    default=0,
                    min=0,
                    max=4096,
                    step=1,
                    optional=True,
                    advanced=True,
                    tooltip="时间块长度，单位为 video latent 帧；0 表示自动。",
                ),
                io.Int.Input(
                    "tile_overlap",
                    default=0,
                    min=0,
                    max=1024,
                    step=2,
                    optional=True,
                    advanced=True,
                    tooltip="空间重叠，单位为 latent token；0 使用模型对应的默认值。",
                ),
                io.Int.Input(
                    "tile_temporal_overlap",
                    default=0,
                    min=0,
                    max=1024,
                    step=1,
                    optional=True,
                    advanced=True,
                    tooltip="时间重叠，单位为 video latent 帧；0 使用模型对应的默认值。",
                ),
                io.Model.Input("model", optional=True, advanced=True),
                io.Noise.Input("noise", optional=True, advanced=True),
                io.Sigmas.Input("sigmas", optional=True, advanced=True),
                io.Float.Input(
                    "audio_denoise",
                    default=0.0,
                    min=0.0,
                    max=1.0,
                    step=0.05,
                    optional=True,
                    advanced=True,
                    tooltip=(
                        "Deprecated compatibility input; second-pass audio stays clean. / "
                        "兼容旧工作流的参数；双采样音频保持干净，不在此节点重复加噪。"
                    ),
                ),
                io.Int.Input(
                    "target_width",
                    default=0,
                    min=0,
                    max=_max_resolution(),
                    step=32,
                    optional=True,
                    advanced=True,
                ),
                io.Int.Input(
                    "target_height",
                    default=0,
                    min=0,
                    max=_max_resolution(),
                    step=32,
                    optional=True,
                    advanced=True,
                ),
                io.Conditioning.Input("positive", optional=True),
                io.Conditioning.Input("negative", optional=True),
            ],
            outputs=[
                io.Latent.Output(display_name="latent"),
                io.Conditioning.Output(display_name="positive"),
                io.Conditioning.Output(display_name="negative"),
            ],
        )

    @classmethod
    def execute(
        cls,
        samples,
        scale_by,
        upscale_method,
        model=None,
        noise=None,
        sigmas=None,
        audio_denoise=0.0,
        positive=None,
        negative=None,
        target_width=None,
        target_height=None,
        upscaler_model=None,
        upscaler_precision="bf16",
        upscaler_device="auto",
        tile_width=0,
        tile_height=0,
        tile_frames=0,
        tile_overlap=0,
        tile_temporal_overlap=0,
    ) -> io.NodeOutput:
        target_width = int(target_width) if target_width else None
        target_height = int(target_height) if target_height else None
        if (target_width is None) != (target_height is None):
            raise ValueError("MiniMax H3 target_width and target_height must be provided together")
        if target_width is not None:
            if target_width < 32 or target_height < 32:
                raise ValueError("MiniMax H3 target width and height must be at least 32")
            if target_width % 32 != 0 or target_height % 32 != 0:
                raise ValueError("MiniMax H3 target width and height must be multiples of 32")

        latent = _upscale_and_prepare_clean_latent(
            samples,
            scale_by,
            upscale_method,
            target_width=target_width,
            target_height=target_height,
            upscaler_model=upscaler_model,
            upscaler_precision=upscaler_precision,
            upscaler_device=upscaler_device,
            tile_width=tile_width,
            tile_height=tile_height,
            tile_frames=tile_frames,
            tile_overlap=tile_overlap,
            tile_temporal_overlap=tile_temporal_overlap,
        )
        return io.NodeOutput(latent, positive, negative)


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": SimpAIMiniMaxH3VideoUpscaleLatent,
    "SimpAIMiniMaxH3LatentUpscaleCombined": SimpAIMiniMaxH3LatentUpscaleCombined,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": (
        "SimpAI MiniMax H3 Initial Latent / H3 视频初始 Latent"
    ),
    "SimpAIMiniMaxH3LatentUpscaleCombined": (
        "SimpAI MiniMax H3 Latent 2 Pass / H3 latent 双采样放大"
    ),
}
