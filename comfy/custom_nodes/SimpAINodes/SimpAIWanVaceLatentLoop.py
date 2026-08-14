from __future__ import annotations

import logging

import torch

import comfy.model_management
import comfy.sample
import comfy.utils
import latent_preview
import node_helpers
import nodes
from comfy_api.latest import io


LOG = logging.getLogger(__name__)
_SEED_MASK = 0xFFFFFFFFFFFFFFFF
_VACE_TRANSITION_LATENTS = 2


def _frames_to_latents(frame_count):
    return ((max(1, int(frame_count)) - 1) // 4) + 1


def _plan_windows(total_latents, chunk_latents, context_latents):
    total_latents = int(total_latents)
    chunk_latents = int(chunk_latents)
    context_latents = int(context_latents)
    if total_latents < 1:
        raise ValueError("Source latent is empty / 源 Latent 为空")
    if chunk_latents < 2:
        raise ValueError("Wan VACE chunk must contain at least two latent frames / Wan VACE 分段至少需要两个 Latent 帧")
    if context_latents < 1 or context_latents >= chunk_latents:
        raise ValueError("Wan VACE context must be shorter than the chunk / Wan VACE 上下文必须短于分段")

    windows = []
    next_new = 0
    while next_new < total_latents:
        if not windows:
            start = 0
            prefix = 0
        else:
            start = next_new - context_latents
            prefix = context_latents
        end = min(start + chunk_latents, total_latents)
        windows.append(
            {
                "start": start,
                "end": end,
                "prefix": prefix,
                "output_start": next_new,
                "new_count": end - next_new,
            }
        )
        next_new = end
    return windows


def _pad_latent(samples, length):
    if int(samples.shape[2]) >= int(length):
        return samples[:, :, :length].contiguous()
    padding = samples[:, :, -1:].repeat(1, 1, int(length) - int(samples.shape[2]), 1, 1)
    return torch.cat((samples, padding), dim=2).contiguous()


def _mixed_timeline_seed(seed, timeline_index):
    value = (int(seed) & _SEED_MASK) ^ 0x94D049BB133111EB
    value = (value + (int(timeline_index) + 1) * 0x9E3779B97F4A7C15) & _SEED_MASK
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & _SEED_MASK
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & _SEED_MASK
    return (value ^ (value >> 31)) & _SEED_MASK


def _timeline_noise(samples, start, seed):
    piece_shape = (
        int(samples.shape[0]),
        int(samples.shape[1]),
        1,
        int(samples.shape[3]),
        int(samples.shape[4]),
    )
    pieces = []
    for offset in range(int(samples.shape[2])):
        generator = torch.Generator(device="cpu")
        generator.manual_seed(_mixed_timeline_seed(seed, int(start) + offset))
        pieces.append(
            torch.randn(piece_shape, dtype=torch.float32, generator=generator).to(
                dtype=samples.dtype
            )
        )
    return torch.cat(pieces, dim=2).contiguous()


def _build_vace_masks(control, prefix):
    noise_mask = torch.ones(
        (control.shape[0], 1, control.shape[2], control.shape[3], control.shape[4]),
        device=control.device,
        dtype=control.dtype,
    )
    if int(prefix) > 0:
        noise_mask[:, :, : int(prefix)] = 0

    vace_mask = noise_mask.clone()
    if 0 < int(prefix) < int(control.shape[2]):
        ramp_count = min(
            _VACE_TRANSITION_LATENTS,
            int(control.shape[2]) - int(prefix),
        )
        if ramp_count > 0:
            ramp = torch.arange(
                1,
                ramp_count + 1,
                device=control.device,
                dtype=control.dtype,
            ).reshape(1, 1, ramp_count, 1, 1) / float(ramp_count + 1)
            vace_mask[:, :, int(prefix) : int(prefix) + ramp_count] = ramp
    return noise_mask, vace_mask


def _apply_vace_conditioning(positive, negative, control, neutral, prefix, strength):
    if neutral.ndim != 5 or tuple(neutral.shape[:2]) != tuple(control.shape[:2]):
        raise ValueError("Neutral Wan VACE latent must match the control batch and channels / 中性 Wan VACE Latent 的批次和通道必须与控制 Latent 一致")
    if tuple(neutral.shape[3:]) != tuple(control.shape[3:]):
        raise ValueError("Neutral Wan VACE latent must match the control spatial size / 中性 Wan VACE Latent 的空间尺寸必须与控制 Latent 一致")

    noise_mask, vace_mask = _build_vace_masks(control, prefix)

    neutral = _pad_latent(neutral, control.shape[2]).to(
        device=control.device,
        dtype=control.dtype,
    )
    # VACE is a continuation signal. Keep the generated tail only in the
    # fixed prefix; the body must stay neutral so Bernini can rebuild detail
    # from the source latent without copying its blur into every segment.
    if int(prefix) > 0:
        vace_control = neutral.clone()
        vace_control[:, :, : int(prefix)] = control[:, :, : int(prefix)]
    else:
        vace_control = neutral
    inactive = vace_control * (1 - vace_mask) + neutral * vace_mask
    reactive = neutral * (1 - vace_mask) + vace_control * vace_mask
    vace_frames = torch.cat((inactive, reactive), dim=1).contiguous()
    vace_mask = vace_mask.repeat(1, 64, 1, 1, 1).contiguous()
    values = {
        "vace_frames": [vace_frames],
        "vace_mask": [vace_mask],
        # The first segment has no continuation source, so leave VACE out of
        # that pass instead of letting its zero context alter the Bernini
        # detail pass.
        "vace_strength": [float(strength) if int(prefix) > 0 else 0.0],
    }
    return (
        node_helpers.conditioning_set_values(positive, values, append=True),
        node_helpers.conditioning_set_values(negative, values, append=True),
        noise_mask,
    )


def _sample_chunk(model, positive, negative, sampler, sigmas, latent, noise, cfg, seed):
    samples = latent["samples"]
    samples = comfy.sample.fix_empty_latent_channels(
        model,
        samples,
        latent.get("downscale_ratio_spacial"),
        latent.get("downscale_ratio_temporal"),
    )
    callback = latent_preview.prepare_callback(model, max(0, int(sigmas.shape[-1]) - 1))
    return comfy.sample.sample_custom(
        model,
        noise,
        float(cfg),
        sampler,
        sigmas,
        positive,
        negative,
        samples,
        noise_mask=latent.get("noise_mask"),
        callback=callback,
        disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,
        seed=int(seed),
    )


def _validate_model(model):
    diffusion_model = model.get_model_object("diffusion_model")
    if not hasattr(diffusion_model, "vace_patch_embedding") or not getattr(
        diffusion_model, "vace_layers", None
    ):
        raise RuntimeError(
            "The loaded MODEL has no VACE layers. Merge the Wan2.1 VACE module with DiffusionModelLoaderKJ. / "
            "当前 MODEL 没有 VACE 层，请使用 DiffusionModelLoaderKJ 合并 Wan2.1 VACE module。"
        )
    latent_format = model.get_model_object("latent_format")
    if int(getattr(latent_format, "latent_channels", 0)) != 16:
        raise RuntimeError("Wan VACE sampling requires a Wan2.1 16-channel latent model / Wan VACE 采样需要 16 通道 Latent 的 Wan2.1 模型")
    model_config = getattr(getattr(model, "model", None), "model_config", None)
    unet_config = getattr(model_config, "unet_config", {})
    if unet_config.get("image_model") != "wan2.1" or unet_config.get("model_type") != "vace":
        raise RuntimeError("Wan VACE sampling requires a native Wan2.1 VACE MODEL / Wan VACE 采样需要原生 Wan2.1 VACE MODEL")


class SimpAIWanVaceLatentLoop(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIWanVaceLatentLoop",
            display_name="SimpAI Wan VACE Latent Loop / Wan VACE Latent 分段采样",
            category="SimpAI/video",
            description=(
                "Samples a long Wan2.1 latent in sequential temporal chunks. The generated tail "
                "of each chunk is fixed as VACE motion context for the next chunk; the chunk body "
                "stays neutral to preserve Bernini detail reconstruction. / "
                "按时间顺序分段采样长 Wan2.1 Latent，每段尾部只作为下一段的 VACE 接续上下文，"
                "主体时间段保持中性以保留 Bernini 的细节重绘能力。"
            ),
            inputs=[
                io.Model.Input("model", display_name="model / 模型"),
                io.Conditioning.Input("positive", display_name="positive / 正向条件"),
                io.Conditioning.Input("negative", display_name="negative / 负向条件"),
                io.Vae.Input("vae", display_name="vae / VAE"),
                io.Latent.Input("source_latent", display_name="source_latent / 源 Latent"),
                io.Sampler.Input("sampler", display_name="sampler / 采样器"),
                io.Sigmas.Input("sigmas", display_name="sigmas / Sigma 序列"),
                io.Int.Input("chunk_frames", display_name="chunk_frames / 分段帧数", default=81, min=5, max=nodes.MAX_RESOLUTION, step=4),
                io.Int.Input("context_frames", display_name="context_frames / 上下文帧数", default=17, min=1, max=nodes.MAX_RESOLUTION, step=4),
                io.Float.Input("vace_strength", display_name="vace_strength / VACE 接续强度", default=1.0, min=0.0, max=10.0, step=0.01),
                io.Float.Input("cfg", display_name="cfg / CFG", default=1.0, min=0.0, max=100.0, step=0.1),
                io.Int.Input(
                    "seed",
                    display_name="seed / 种子",
                    default=0,
                    min=0,
                    max=0xFFFFFFFFFFFFFFFF,
                    control_after_generate=True,
                ),
            ],
            outputs=[
                io.Latent.Output(display_name="latent / 输出 Latent"),
                io.Int.Output(display_name="segment_count / 分段数"),
            ],
        )

    @classmethod
    def execute(
        cls,
        model,
        positive,
        negative,
        vae,
        source_latent,
        sampler,
        sigmas,
        chunk_frames,
        context_frames,
        vace_strength,
        cfg,
        seed,
    ):
        _validate_model(model)
        if int(chunk_frames) % 4 != 1 or int(context_frames) % 4 != 1:
            raise ValueError("Wan VACE chunk_frames and context_frames must be 4n+1 / Wan VACE 分段帧数和上下文帧数必须符合 4n+1")
        if not isinstance(source_latent, dict) or not isinstance(
            source_latent.get("samples"), torch.Tensor
        ):
            raise ValueError("source_latent must contain a samples tensor / source_latent 必须包含 samples 张量")
        if int(sigmas.shape[-1]) < 2:
            raise ValueError("Wan VACE latent loop requires at least one sampling step / Wan VACE Latent 分段采样至少需要一个采样步骤")

        source = source_latent["samples"]
        if source.ndim != 5 or int(source.shape[1]) != 16:
            raise ValueError("source_latent must have shape [batch, 16, time, height, width] / source_latent 必须是 [batch, 16, time, height, width] 形状")
        source = source.detach().to(device="cpu").contiguous()

        chunk_latents = _frames_to_latents(chunk_frames)
        context_latents = _frames_to_latents(context_frames)
        windows = _plan_windows(source.shape[2], chunk_latents, context_latents)
        spatial_scale = int(vae.spacial_compression_encode())
        gray_frames = torch.full(
            (
                int(chunk_frames),
                int(source.shape[3]) * spatial_scale,
                int(source.shape[4]) * spatial_scale,
                3,
            ),
            0.5,
            device=comfy.model_management.intermediate_device(),
            dtype=comfy.model_management.intermediate_dtype(),
        )
        neutral = vae.encode(gray_frames).detach().to(device="cpu", copy=True).contiguous()
        del gray_frames
        if neutral.ndim != 5 or int(neutral.shape[1]) != 16:
            raise RuntimeError("Wan2.1 VAE returned an invalid neutral latent / Wan2.1 VAE 返回了无效的中性 Latent")
        if tuple(neutral.shape[3:]) != tuple(source.shape[3:]):
            raise RuntimeError("Wan2.1 VAE neutral latent does not match the source spatial size / Wan2.1 VAE 中性 Latent 与源 Latent 的空间尺寸不一致")
        neutral = _pad_latent(neutral, chunk_latents)
        output_samples = torch.empty_like(source, device="cpu")
        previous_tail = None

        LOG.info(
            "Wan VACE latent loop: latent_frames=%d segments=%d chunk=%d context=%d",
            int(source.shape[2]),
            len(windows),
            chunk_latents,
            context_latents,
        )

        for index, window in enumerate(windows):
            comfy.model_management.throw_exception_if_processing_interrupted()
            control = _pad_latent(source[:, :, window["start"] : window["end"]], chunk_latents)
            prefix = int(window["prefix"])
            if prefix > 0:
                if previous_tail is None or int(previous_tail.shape[2]) < prefix:
                    raise RuntimeError("Previous Wan VACE segment did not provide enough motion context / 上一段 Wan VACE 结果没有提供足够的动作上下文")
                control = control.clone()
                control[:, :, :prefix] = previous_tail[:, :, -prefix:]

            positive_chunk, negative_chunk, noise_mask = _apply_vace_conditioning(
                positive,
                negative,
                control,
                neutral,
                prefix,
                vace_strength,
            )
            latent = source_latent.copy()
            latent["samples"] = control
            latent["noise_mask"] = noise_mask
            noise = _timeline_noise(control, window["start"], seed)
            chunk_seed = _mixed_timeline_seed(seed, window["start"])
            sampled = _sample_chunk(
                model,
                positive_chunk,
                negative_chunk,
                sampler,
                sigmas,
                latent,
                noise,
                cfg,
                chunk_seed,
            )
            sampled = sampled.detach().to(device="cpu", copy=True).contiguous()

            keep_start = prefix
            keep_end = prefix + int(window["new_count"])
            output_start = int(window["output_start"])
            output_end = output_start + int(window["new_count"])
            output_samples[:, :, output_start:output_end].copy_(
                sampled[:, :, keep_start:keep_end]
            )
            previous_tail = sampled[:, :, -context_latents:].contiguous()
            LOG.info(
                "Wan VACE latent segment %d/%d: source=%d:%d prefix=%d kept=%d",
                index + 1,
                len(windows),
                int(window["start"]),
                int(window["end"]),
                prefix,
                int(window["new_count"]),
            )

        output = source_latent.copy()
        output.pop("noise_mask", None)
        output["samples"] = output_samples.contiguous()
        return io.NodeOutput(output, len(windows))


NODE_CLASS_MAPPINGS = {
    "SimpAIWanVaceLatentLoop": SimpAIWanVaceLatentLoop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIWanVaceLatentLoop": "SimpAI Wan VACE Latent Loop / Wan VACE Latent 分段采样",
}
