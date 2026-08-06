import torch
import torch.nn.functional as F

import comfy.ldm.common_dit
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
H3_UPSCALE_METHODS = ("nearest", "bilinear", "bicubic")
H3_DIT_SPATIAL_MULTIPLE = 2


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


def _upscale_video_latent(video_latent, scale_by, method):
    if scale_by <= 0:
        raise ValueError("MiniMax H3 latent upscale scale_by must be greater than zero")
    target_h = _snap_h3_spatial_size(round(video_latent.shape[-2] * scale_by))
    target_w = _snap_h3_spatial_size(round(video_latent.shape[-1] * scale_by))
    return _resize_latent_spatial(video_latent, target_h, target_w, method)


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


def _upscale_video_like_latent(latent, scale_by, method):
    if latent.ndim == 4:
        latent = _upscale_video_latent(latent.unsqueeze(2), scale_by, method)
        latent = comfy.ldm.common_dit.pad_to_patch_size(
            latent, (1, H3_DIT_SPATIAL_MULTIPLE, H3_DIT_SPATIAL_MULTIPLE)
        )
        return latent.squeeze(2)
    if latent.ndim == 5:
        latent = _upscale_video_latent(latent, scale_by, method)
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


def _upscale_latent_dict(latent, scale_by, method):
    if not isinstance(latent, dict) or "samples" not in latent:
        raise ValueError("MiniMax H3 latent upscale needs a LATENT dict with samples")

    out = latent.copy()
    members, was_nested = _extract_latent_members(latent["samples"])
    video_up = _upscale_video_like_latent(members[0], scale_by, method)

    if was_nested:
        out["samples"] = _wrap_latent_members([video_up, *members[1:]], True)
    else:
        out["samples"] = video_up

    noise_mask = latent.get("noise_mask")
    if noise_mask is not None:
        is_nested_mask = isinstance(
            noise_mask, comfy.nested_tensor.NestedTensor
        ) or getattr(noise_mask, "is_nested", False)
        if is_nested_mask:
            mask_members, _ = _extract_latent_members(noise_mask)
            mask_video_up = _upscale_video_like_latent(mask_members[0], scale_by, method)
            out["noise_mask"] = _wrap_latent_members(
                [mask_video_up, *mask_members[1:]], True
            )
        elif isinstance(noise_mask, torch.Tensor) and noise_mask.ndim >= 4:
            out["noise_mask"] = _upscale_video_like_latent(noise_mask, scale_by, method)

    return out


def _has_nonzero_latent(samples):
    members, _ = _extract_latent_members(samples)
    return any(torch.count_nonzero(member).item() > 0 for member in members)


def _add_noise_nested_latent(
    model,
    noise,
    sigmas,
    latent,
    *,
    renoise_indices=None,
    noise_strengths=None,
):
    if len(sigmas) == 0:
        return latent
    if not isinstance(latent, dict) or "samples" not in latent:
        raise ValueError("MiniMax H3 latent re-noise needs a LATENT dict with samples")

    out = latent.copy()
    latent_image = latent["samples"]
    noisy = noise.generate_noise(latent)

    model_sampling = model.get_model_object("model_sampling")
    process_latent_out = model.get_model_object("process_latent_out")
    process_latent_in = model.get_model_object("process_latent_in")
    sigma_start = sigmas[0]

    latent_members, was_nested = _extract_latent_members(latent_image)
    noise_members, noise_was_nested = _extract_latent_members(noisy)
    if len(latent_members) != len(noise_members):
        raise ValueError(
            "MiniMax H3 noise and latent member counts differ: "
            f"{len(noise_members)} vs {len(latent_members)}"
        )

    if renoise_indices is None:
        renoise_set = set(range(len(latent_members)))
    else:
        renoise_set = set(renoise_indices)
        for index in renoise_set:
            if index < 0 or index >= len(latent_members):
                raise IndexError(
                    f"MiniMax H3 re-noise index {index} is out of range for "
                    f"{len(latent_members)} latent members"
                )

    shift_latents = _has_nonzero_latent(latent_image)
    result_members = []
    for index, (latent_member, noise_member) in enumerate(
        zip(latent_members, noise_members)
    ):
        latent_in = process_latent_in(latent_member) if shift_latents else latent_member
        if index in renoise_set:
            strength = 1.0 if noise_strengths is None else float(
                noise_strengths.get(index, 1.0)
            )
            strength = max(0.0, min(1.0, strength))
            if strength <= 0.0:
                mixed = latent_in
            elif strength >= 1.0:
                mixed = model_sampling.noise_scaling(
                    sigma_start, noise_member, latent_in
                )
            else:
                mixed = model_sampling.noise_scaling(
                    sigma_start, noise_member * strength, latent_in
                )
        else:
            mixed = latent_in

        if hasattr(model_sampling, "inverse_noise_scaling"):
            mixed = model_sampling.inverse_noise_scaling(sigma_start, mixed)
        mixed = process_latent_out(mixed)
        result_members.append(torch.nan_to_num(mixed, nan=0.0, posinf=0.0, neginf=0.0))

    out["samples"] = _wrap_latent_members(
        result_members, was_nested or noise_was_nested
    )
    return out


def _upscale_and_add_noise(latent, scale_by, method, model, noise, sigmas, audio_denoise):
    upscaled = _upscale_latent_dict(latent, scale_by, method)
    members, was_nested = _extract_latent_members(upscaled["samples"])

    if was_nested and len(members) >= 2:
        audio_strength = max(0.0, min(1.0, float(audio_denoise)))
        if audio_strength <= 0.0:
            renoise_indices = (0,)
            noise_strengths = None
        elif audio_strength >= 1.0:
            renoise_indices = (0, 1)
            noise_strengths = None
        else:
            renoise_indices = (0, 1)
            noise_strengths = {1: audio_strength}
    else:
        renoise_indices = None
        noise_strengths = None

    return _add_noise_nested_latent(
        model,
        noise,
        sigmas,
        upscaled,
        renoise_indices=renoise_indices,
        noise_strengths=noise_strengths,
    )


def _upscale_minimax_ref_block(block, scale_by, method):
    out = dict(block)
    if out.get("kind") == "audio":
        return out

    latent = out.get("latent")
    if latent is None:
        return out

    latent = _upscale_video_like_latent(latent, scale_by, method)
    out["latent"] = latent
    if latent.ndim == 5:
        out["latent_t"] = int(latent.shape[2])
        out["latent_h"] = int(latent.shape[-2])
        out["latent_w"] = int(latent.shape[-1])
    elif latent.ndim == 4:
        out["latent_h"] = int(latent.shape[-2])
        out["latent_w"] = int(latent.shape[-1])
    return out


def _upscale_minimax_keyframe(keyframe, scale_by, method):
    out = dict(keyframe)
    latent = out.get("latent")
    if latent is not None:
        out["latent"] = _upscale_video_like_latent(latent, scale_by, method)
    return out


def _upscale_minimax_conditioning(conditioning, scale_by, method):
    if conditioning is None:
        return None

    out = []
    for entry in conditioning:
        if not isinstance(entry, (list, tuple)) or len(entry) < 2:
            out.append(entry)
            continue

        embedding, meta = entry[0], entry[1]
        if not isinstance(meta, dict):
            out.append(entry)
            continue

        new_meta = meta.copy()
        refs = meta.get("minimax_refs")
        if refs is not None:
            new_meta["minimax_refs"] = [
                _upscale_minimax_ref_block(ref, scale_by, method) for ref in refs
            ]

        keyframes = meta.get("minimax_keyframes")
        if keyframes is not None:
            new_meta["minimax_keyframes"] = [
                _upscale_minimax_keyframe(keyframe, scale_by, method)
                for keyframe in keyframes
            ]

        out.append([embedding, new_meta])
    return out


class SimpAIMiniMaxH3VideoUpscaleLatent(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3VideoUpscaleLatent",
            display_name="SimpAI MiniMax H3 视频放大初始 Latent",
            category="conditioning/video_models",
            description=(
                "实验节点：把源视频或已有 H3 AV latent 处理成低去噪参考生成的初始 latent，"
                "配合 R2V reference context 使用。"
            ),
            inputs=[
                io.Vae.Input("vae", optional=True),
                io.Int.Input("width", default=1024, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=576, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input(
                    "length",
                    default=124,
                    min=5,
                    max=3600,
                    step=17,
                    tooltip=(
                        "H3 24 fps 帧数，会对齐到 17k+5。"
                    ),
                ),
                io.Image.Input(
                    "source_video",
                    optional=True,
                    tooltip=(
                        "要编码成初始 latent 的源视频帧。"
                    ),
                ),
                io.Latent.Input("source_latent", optional=True),
                io.Vae.Input("audio_vae", optional=True, advanced=True),
                io.Audio.Input(
                    "source_audio",
                    optional=True,
                    advanced=True,
                    tooltip=(
                        "可选的源音频，用于编码 H3 初始 audio latent。"
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


class SimpAIMiniMaxH3LatentUpscaleCombined(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3LatentUpscaleCombined",
            display_name="SimpAI MiniMax H3 latent 二次采样放大",
            category="conditioning/video_models",
            is_experimental=True,
            description=(
                "放大第一阶段输出的 H3 video latent，保留 audio latent，按第二阶段首个 sigma "
                "重新准备采样输入；同时更新 reference 和 keyframe 的视觉 latent。"
            ),
            inputs=[
                io.Latent.Input("samples"),
                io.Float.Input("scale_by", default=1.5, min=0.01, max=8.0, step=0.01),
                io.Combo.Input(
                    "upscale_method",
                    options=list(H3_UPSCALE_METHODS),
                    default="bicubic",
                ),
                io.Model.Input("model"),
                io.Noise.Input("noise"),
                io.Sigmas.Input("sigmas"),
                io.Float.Input(
                    "audio_denoise",
                    default=1.0,
                    min=0.0,
                    max=1.0,
                    step=0.05,
                    tooltip=(
                        "audio latent 的二次采样强度。0 保留第一阶段音频，1 完全按首个 sigma 重新加噪。"
                    ),
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
        model,
        noise,
        sigmas,
        audio_denoise,
        positive=None,
        negative=None,
    ) -> io.NodeOutput:
        latent = _upscale_and_add_noise(
            samples,
            scale_by,
            upscale_method,
            model,
            noise,
            sigmas,
            audio_denoise,
        )
        positive = _upscale_minimax_conditioning(
            positive, scale_by, upscale_method
        )
        negative = _upscale_minimax_conditioning(
            negative, scale_by, upscale_method
        )
        return io.NodeOutput(latent, positive, negative)


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": SimpAIMiniMaxH3VideoUpscaleLatent,
    "SimpAIMiniMaxH3LatentUpscaleCombined": SimpAIMiniMaxH3LatentUpscaleCombined,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3VideoUpscaleLatent": (
        "SimpAI MiniMax H3 视频放大初始 Latent"
    ),
    "SimpAIMiniMaxH3LatentUpscaleCombined": (
        "SimpAI MiniMax H3 latent 二次采样放大"
    ),
}
