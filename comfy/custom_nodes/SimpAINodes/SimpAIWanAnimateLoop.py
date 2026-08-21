from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path

import torch


_TAIL_GUARD_FRAMES = 4
_MIN_CHUNK_SAMPLE_FRAMES = 33
_BACKGROUND_CALIBRATION_STRENGTH = 1.0
_BACKGROUND_CALIBRATION_MAX_LUMA_SCALE = 0.10
_BACKGROUND_CALIBRATION_MAX_LUMA_SHIFT = 0.08
_BACKGROUND_CALIBRATION_MAX_CHROMA_SHIFT = 0.05
_BACKGROUND_CALIBRATION_MIN_SAMPLES = 32
_OVERLAP_COLOR_CALIBRATION_STRENGTH = 1.0
_OVERLAP_COLOR_MAX_LUMA_SCALE = 0.08
_OVERLAP_COLOR_MAX_LUMA_SHIFT = 0.06
_OVERLAP_COLOR_MIN_CHROMA_SCALE = 0.70
_OVERLAP_COLOR_MAX_CHROMA_SCALE = 1.10
_OVERLAP_COLOR_MAX_CHROMA_SHIFT = 0.05
_OVERLAP_COLOR_MIN_SAMPLES = 32
_OVERLAP_COLOR_REFERENCE_TAIL_FRAMES = 3
_OVERLAP_COLOR_MIN_CHROMA_SPREAD = 0.005
_OVERLAP_COLOR_FADE_FRAMES = 8
_CHARACTER_COLOR_REFERENCE_FRAMES = 5
_CHARACTER_COLOR_STRENGTH = 1.0
_CHARACTER_COLOR_TEMPORAL_ALPHA = 0.25
_CHARACTER_LUMA_CORRECTION_ENABLED = False
_CHARACTER_COLOR_MIN_LUMA_SCALE = 0.80
_CHARACTER_COLOR_MAX_LUMA_SCALE = 1.20
_CHARACTER_COLOR_MAX_LUMA_SHIFT = 0.06
_CHARACTER_COLOR_MIN_CHROMA_SCALE = 0.60
_CHARACTER_COLOR_MAX_CHROMA_SCALE = 1.25
_CHARACTER_COLOR_MAX_CHROMA_SHIFT = 0.06
_CHARACTER_COLOR_MIN_LUMA_SPREAD = 0.02
_CHARACTER_COLOR_MIN_CHROMA_SPREAD = 0.005
_CHARACTER_COLOR_DETAIL_RADIUS = 12
_CHARACTER_COLOR_MIN_SAMPLES = 32
_MANUAL_SATURATION_CURVE_END = 0.18
_CHARACTER_TONE_REFERENCE_FRAMES = 5
_CHARACTER_TONE_FINE_RADIUS = 2
_CHARACTER_TONE_MID_RADIUS = 8
_CHARACTER_TONE_BROAD_RADIUS = 32
_CHARACTER_TONE_KNEE_QUANTILE = 0.90
_CHARACTER_TONE_LIMIT_QUANTILE = 0.99
_CHARACTER_TONE_TRIGGER_RATIO = 1.05
_CHARACTER_TONE_FINE_MIN_GAIN = 0.70
_CHARACTER_TONE_MID_MIN_GAIN = 0.75
_CHARACTER_TONE_BROAD_MIN_GAIN = 0.85
_CHARACTER_TONE_TARGET_MIN_RATIO = 0.85
_CHARACTER_TONE_TARGET_MAX_RATIO = 1.15
_CHARACTER_TONE_TEMPORAL_ALPHA = 0.65
_CHARACTER_TONE_MIN_LEVEL = 0.001
_CHARACTER_TONE_MIN_SAMPLES = 32
_CHARACTER_TONE_STATISTICS_FRAMES = 8
_CHARACTER_TONE_PROCESS_BATCH_FRAMES = 8
_CHARACTER_LOW_FREQUENCY_INNER_RADIUS = 32
_CHARACTER_LOW_FREQUENCY_OUTER_RADIUS = 96
_CHARACTER_LOW_FREQUENCY_TRIGGER_RATIO = 1.05
_CHARACTER_LOW_FREQUENCY_MIN_GAIN = 0.80
_CHARACTER_LOW_FREQUENCY_CENTER_TRIGGER = 0.002
_CHARACTER_LOW_FREQUENCY_MAX_CENTER_SHIFT = 0.04
_CHARACTER_LOW_FREQUENCY_MAX_PIXEL_CORRECTION = 0.04
_CHARACTER_LOW_FREQUENCY_TEMPORAL_ALPHA = 0.65
_WEAK_CONTINUE_MOTION_FRAMES = 5
_CONTINUATION_DETAIL_REFERENCE_FRAMES = 5
_CONTINUATION_DETAIL_RADIUS = 2
_CONTINUATION_DETAIL_QUANTILE = 0.95
_CONTINUATION_DETAIL_TARGET_RATIO = 1.00
_CONTINUATION_DETAIL_TRIGGER_RATIO = 1.08
_CONTINUATION_DETAIL_MIN_GAIN = 0.70
_CONTINUATION_DETAIL_MIN_LEVEL = 0.001
_CONTINUATION_DETAIL_MIN_SAMPLES = 32
_CONTINUATION_LUMA_ALIGNMENT_STRENGTH = 0.75
_CONTINUATION_LUMA_MIN_SCALE = 0.85
_CONTINUATION_LUMA_MAX_SCALE = 1.10
_CONTINUATION_LUMA_MAX_SHIFT = 0.04
_CONTINUATION_LUMA_MIN_SPREAD = 0.02
_APPEARANCE_REFERENCE_FRAMES = 5
_APPEARANCE_SAMPLE_SIZE = 64
_APPEARANCE_DETAIL_RADIUS = 2
_APPEARANCE_LOCAL_BLOCK_SIZE = 32
_APPEARANCE_LOCAL_BLOCK_QUANTILE = 0.90
_APPEARANCE_LOCAL_BLOCK_MIN_MASK_COVERAGE = 0.75
_NOISE_SEED_MASK = 0xFFFFFFFFFFFFFFFF
_CALIBRATION_DEBUG_FOLDER = "wan_animate_calibration_debug"


def _node_result(value):
    if hasattr(value, "result"):
        return tuple(value.result or ())
    if isinstance(value, tuple):
        return value
    return (value,)


def _align_4n1(value):
    value = max(1, int(value))
    return value + ((1 - value) % 4)


def _pad_to_temporal_grid(images, frame_count):
    frame_count = max(1, int(frame_count))
    images = images[:frame_count].contiguous()
    aligned_frame_count = _align_4n1(frame_count)
    padding_count = aligned_frame_count - frame_count
    if padding_count:
        padding = images[-1:].expand(
            padding_count,
            *images.shape[1:],
        )
        images = torch.cat((images, padding), dim=0)
    return images.contiguous(), frame_count, aligned_frame_count


def _plan_chunk_keep_targets(total_frames, chunk_limit, overlap):
    total_frames = max(1, int(total_frames))
    chunk_limit = max(1, int(chunk_limit))
    overlap = max(0, int(overlap))
    first_capacity = chunk_limit - _TAIL_GUARD_FRAMES
    repeat_capacity = chunk_limit - overlap - _TAIL_GUARD_FRAMES
    if first_capacity <= 0 or repeat_capacity <= 0:
        raise RuntimeError("Wan Animate chunk has no room for output frames.")
    if total_frames <= first_capacity:
        return [total_frames]

    remaining = total_frames - first_capacity
    repeat_count = (remaining + repeat_capacity - 1) // repeat_capacity
    targets = [first_capacity]
    if repeat_count > 1:
        targets.extend([repeat_capacity] * (repeat_count - 1))
    targets.append(remaining - (repeat_count - 1) * repeat_capacity)

    minimum_sample = min(_MIN_CHUNK_SAMPLE_FRAMES, chunk_limit)
    last_sample = _align_4n1(overlap + targets[-1] + _TAIL_GUARD_FRAMES)
    if last_sample >= minimum_sample:
        return targets

    minimum_last_keep = 1
    while (
        _align_4n1(overlap + minimum_last_keep + _TAIL_GUARD_FRAMES)
        < minimum_sample
    ):
        minimum_last_keep += 1

    donor_discard = 0 if len(targets) == 2 else overlap
    minimum_donor_keep = 1
    while (
        _align_4n1(donor_discard + minimum_donor_keep + _TAIL_GUARD_FRAMES)
        < minimum_sample
    ):
        minimum_donor_keep += 1

    needed = max(0, minimum_last_keep - targets[-1])
    transfer = ((needed + 3) // 4) * 4
    available = max(0, targets[-2] - minimum_donor_keep)
    transfer = min(transfer, (available // 4) * 4)
    if transfer > 0:
        targets[-2] -= transfer
        targets[-1] += transfer
    return targets


def _sample(model, positive, negative, sampler, sigmas, latent, seed, cfg, noise=None):
    if noise is not None:
        import comfy.sample
        import comfy.utils
        import latent_preview

        sampled_latent = latent.copy()
        latent_image = comfy.sample.fix_empty_latent_channels(
            model,
            latent["samples"],
            latent.get("downscale_ratio_spacial"),
            latent.get("downscale_ratio_temporal"),
        )
        if not isinstance(noise, torch.Tensor) or noise.shape != latent_image.shape:
            raise RuntimeError("Global Wan Animate noise does not match the chunk latent shape.")
        noise = noise.to(device="cpu", dtype=latent_image.dtype).contiguous()
        noise_mask = latent.get("noise_mask")
        x0_output = {}
        callback = latent_preview.prepare_callback(model, sigmas.shape[-1] - 1, x0_output)
        samples = comfy.sample.sample_custom(
            model,
            noise,
            float(cfg),
            sampler,
            sigmas,
            positive,
            negative,
            latent_image,
            noise_mask=noise_mask,
            callback=callback,
            disable_pbar=not comfy.utils.PROGRESS_BAR_ENABLED,
            seed=int(seed),
        )
        sampled_latent.pop("downscale_ratio_spacial", None)
        sampled_latent.pop("downscale_ratio_temporal", None)
        if "x0" in x0_output:
            sampled_latent["samples"] = model.model.process_latent_out(
                x0_output["x0"].cpu()
            )
        else:
            sampled_latent["samples"] = samples
        return sampled_latent

    from comfy_extras.nodes_custom_sampler import SamplerCustom

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
        raise RuntimeError("SamplerCustom returned no latent output.")
    result = sampled[1] if len(sampled) > 1 else sampled[0]
    if not isinstance(result, dict) or "samples" not in result:
        raise RuntimeError("SamplerCustom returned an invalid latent output.")
    return result


def _mixed_timeline_seed(seed, timeline_index, reference=False):
    value = int(seed) & _NOISE_SEED_MASK
    namespace = 0xD1B54A32D192ED03 if reference else 0x94D049BB133111EB
    value = (value ^ namespace) + (int(timeline_index) + 1) * 0x9E3779B97F4A7C15
    value &= _NOISE_SEED_MASK
    value = ((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9) & _NOISE_SEED_MASK
    value = ((value ^ (value >> 27)) * 0x94D049BB133111EB) & _NOISE_SEED_MASK
    return (value ^ (value >> 31)) & _NOISE_SEED_MASK


def _timeline_aligned_noise(latent, trim_latent, source_start, seed):
    samples = latent.get("samples") if isinstance(latent, dict) else None
    if not isinstance(samples, torch.Tensor) or samples.ndim != 5:
        raise RuntimeError("Wan Animate global noise requires a 5D latent tensor.")
    trim_latent = max(0, int(trim_latent))
    if trim_latent >= int(samples.shape[2]):
        raise RuntimeError("Wan Animate latent contains no video frames for global noise.")
    source_start = max(0, int(source_start))
    if source_start % 4 != 0:
        raise RuntimeError("Wan Animate chunk start is not aligned to the global latent timeline.")

    piece_shape = (
        int(samples.shape[0]),
        int(samples.shape[1]),
        1,
        int(samples.shape[3]),
        int(samples.shape[4]),
    )

    def make_piece(timeline_index, reference=False):
        generator = torch.Generator(device="cpu")
        generator.manual_seed(
            _mixed_timeline_seed(seed, timeline_index, reference=reference)
        )
        return torch.randn(piece_shape, dtype=torch.float32, generator=generator).to(
            dtype=samples.dtype
        )

    pieces = [make_piece(index, reference=True) for index in range(trim_latent)]
    video_noise_start = source_start // 4
    video_latent_length = int(samples.shape[2]) - trim_latent
    pieces.extend(
        make_piece(video_noise_start + index)
        for index in range(video_latent_length)
    )
    return torch.cat(pieces, dim=2).contiguous(), video_noise_start, video_latent_length


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


def _prepare_edit_mask(character_mask, start, count, frames):
    if not isinstance(character_mask, torch.Tensor) or character_mask.numel() == 0:
        return None

    mask = character_mask.detach()
    if mask.ndim == 2:
        mask = mask.unsqueeze(0)
    elif mask.ndim == 4:
        if mask.shape[-1] <= 4:
            mask = mask[..., 0]
        elif mask.shape[1] <= 4:
            mask = mask[:, 0]
    if mask.ndim != 3 or int(mask.shape[0]) == 0:
        return None

    count = max(1, int(count))
    start = max(0, int(start))
    if int(mask.shape[0]) == 1:
        mask = mask.repeat(count, 1, 1)
    elif start < int(mask.shape[0]):
        mask = mask[start : start + count]
        if int(mask.shape[0]) < count:
            mask = torch.cat((mask, mask[-1:].repeat(count - int(mask.shape[0]), 1, 1)), dim=0)
    else:
        mask = mask[-1:].repeat(count, 1, 1)

    import torch.nn.functional as F

    mask = mask.unsqueeze(1).to(device=frames.device, dtype=torch.float32)
    if mask.shape[-2:] != frames.shape[1:3]:
        mask = F.interpolate(mask, size=frames.shape[1:3], mode="bilinear", align_corners=False)
    return mask.movedim(1, -1).clamp(0, 1).contiguous()


def _prepare_reference_frames(driving_video, start, count, frames):
    reference = _slice_condition_window(
        driving_video,
        start,
        count,
        int(driving_video.shape[0]),
        repeat_single=True,
    )
    if not isinstance(reference, torch.Tensor) or reference.ndim != 4 or int(reference.shape[-1]) < 3:
        return None

    import torch.nn.functional as F

    reference = reference[..., :3].to(device=frames.device, dtype=torch.float32)
    if reference.shape[1:3] != frames.shape[1:3]:
        reference = F.interpolate(
            reference.movedim(-1, 1),
            size=frames.shape[1:3],
            mode="bilinear",
            align_corners=False,
        ).movedim(1, -1)
    return reference.contiguous()


def _rgb_to_ycbcr(rgb):
    red, green, blue = rgb.unbind(dim=-1)
    luma = red * 0.299 + green * 0.587 + blue * 0.114
    cb = (blue - luma) / 1.772
    cr = (red - luma) / 1.402
    return luma, cb, cr


def _apply_manual_segment_output_color(
    frames,
    edit_mask,
    segment_contrast=1.0,
    segment_saturation=1.0,
):
    contrast = max(0.0, float(segment_contrast))
    saturation = max(0.0, float(segment_saturation))
    info = {
        "enabled": True,
        "scope": "existing_character_mask",
        "contrast": contrast,
        "saturation": saturation,
        "contrast_pivot": 0.5,
        "color_space": "ycbcr",
        "saturation_transform": "smoothstep_chroma_radius_weighted_gain",
        "saturation_curve_end": _MANUAL_SATURATION_CURVE_END,
        "visible_output_applied": True,
        "passed_to_continue_motion": True,
    }
    if not isinstance(frames, torch.Tensor) or frames.ndim != 4 or int(frames.shape[-1]) < 3:
        return frames, {**info, "applied": False, "reason": "missing_frames"}
    if (
        not isinstance(edit_mask, torch.Tensor)
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return frames, {**info, "applied": False, "reason": "missing_character_mask"}
    if abs(contrast - 1.0) < 1e-8 and abs(saturation - 1.0) < 1e-8:
        return frames, {**info, "applied": False, "reason": "identity"}

    rgb = frames[..., :3].to(torch.float32)
    luma, cb, cr = _rgb_to_ycbcr(rgb)
    adjusted_luma = (0.5 + (luma - 0.5) * contrast).clamp(0, 1)
    chroma_radius = torch.sqrt(cb * cb + cr * cr)
    curve_position = (chroma_radius / _MANUAL_SATURATION_CURVE_END).clamp(0, 1)
    curve_weight = curve_position * curve_position * (3.0 - 2.0 * curve_position)
    chroma_gain = 1.0 + (saturation - 1.0) * curve_weight
    adjusted_cb = cb * chroma_gain
    adjusted_cr = cr * chroma_gain
    adjusted_rgb = torch.stack(
        (
            adjusted_luma + 1.402 * adjusted_cr,
            adjusted_luma - 0.344136 * adjusted_cb - 0.714136 * adjusted_cr,
            adjusted_luma + 1.772 * adjusted_cb,
        ),
        dim=-1,
    ).clamp(0, 1)
    mask = edit_mask.to(device=frames.device, dtype=torch.float32).clamp(0, 1)
    corrected = frames.clone()
    corrected[..., :3] = torch.lerp(rgb, adjusted_rgb, mask).to(frames.dtype)
    return corrected.contiguous(), {**info, "applied": True}


def _calibrate_to_original_background(frames, reference, edit_mask, strength=None):
    strength = (
        _BACKGROUND_CALIBRATION_STRENGTH if strength is None else float(strength)
    )
    if not isinstance(edit_mask, torch.Tensor):
        return frames, {"applied": False, "reason": "missing_character_mask"}
    if (
        not isinstance(reference, torch.Tensor)
        or reference.shape[:3] != frames.shape[:3]
        or int(reference.shape[-1]) < 3
    ):
        return frames, {"applied": False, "reason": "missing_original_frames"}

    import torch.nn.functional as F

    # The expanded mask is used only to reject boundary pixels from the statistics.
    margin = max(1, min(8, int(round(min(frames.shape[1:3]) * 0.01))))
    time_step = max(1, (int(frames.shape[0]) + 15) // 16)
    sample_height = min(64, int(frames.shape[1]))
    sample_width = min(64, int(frames.shape[2]))
    sample_size = (sample_height, sample_width)
    generated_rgb = F.adaptive_avg_pool2d(
        frames[::time_step, ..., :3].movedim(-1, 1).to(torch.float32),
        sample_size,
    ).movedim(1, -1)
    original_rgb = F.adaptive_avg_pool2d(
        reference[::time_step, ..., :3]
        .movedim(-1, 1)
        .to(device=frames.device, dtype=torch.float32),
        sample_size,
    ).movedim(1, -1)
    sampled_edit_mask = F.adaptive_max_pool2d(
        edit_mask[::time_step].movedim(-1, 1).to(torch.float32),
        sample_size,
    )
    sample_margin = max(
        1,
        (margin * sample_height + int(frames.shape[1]) - 1) // int(frames.shape[1]),
        (margin * sample_width + int(frames.shape[2]) - 1) // int(frames.shape[2]),
    )
    expanded_edit_mask = F.max_pool2d(
        sampled_edit_mask,
        kernel_size=sample_margin * 2 + 1,
        stride=1,
        padding=sample_margin,
    ).movedim(1, -1)
    unchanged = expanded_edit_mask[..., 0] <= 0.01

    generated_luma, generated_cb, generated_cr = _rgb_to_ycbcr(generated_rgb)
    original_luma, original_cb, original_cr = _rgb_to_ycbcr(original_rgb)
    valid = unchanged
    valid &= torch.isfinite(generated_rgb).all(dim=-1)
    valid &= torch.isfinite(original_rgb).all(dim=-1)
    valid &= (generated_luma > 0.005) & (generated_luma < 0.995)
    valid &= (original_luma > 0.005) & (original_luma < 0.995)
    sample_count = int(valid.sum())
    if sample_count < _BACKGROUND_CALIBRATION_MIN_SAMPLES:
        return frames, {
            "applied": False,
            "reason": "insufficient_unchanged_background",
            "sample_count": sample_count,
            "mask_used_for_statistics_only": True,
        }

    generated_luma = generated_luma[valid]
    original_luma = original_luma[valid]
    generated_luma_median = generated_luma.median()
    original_luma_median = original_luma.median()
    generated_luma_mad = (generated_luma - generated_luma_median).abs().median()
    original_luma_mad = (original_luma - original_luma_median).abs().median()
    if float(generated_luma_mad) > 0.005 and float(original_luma_mad) > 0.005:
        requested_luma_scale = original_luma_mad / generated_luma_mad
    else:
        requested_luma_scale = torch.ones_like(generated_luma_mad)
    requested_luma_scale = requested_luma_scale.clamp(
        1.0 - _BACKGROUND_CALIBRATION_MAX_LUMA_SCALE,
        1.0 + _BACKGROUND_CALIBRATION_MAX_LUMA_SCALE,
    )
    requested_luma_shift = (
        original_luma - generated_luma * requested_luma_scale
    ).median().clamp(
        -_BACKGROUND_CALIBRATION_MAX_LUMA_SHIFT,
        _BACKGROUND_CALIBRATION_MAX_LUMA_SHIFT,
    )
    requested_chroma_shift = torch.stack(
        (
            (original_cb[valid] - generated_cb[valid]).median(),
            (original_cr[valid] - generated_cr[valid]).median(),
        )
    ).clamp(
        -_BACKGROUND_CALIBRATION_MAX_CHROMA_SHIFT,
        _BACKGROUND_CALIBRATION_MAX_CHROMA_SHIFT,
    )

    applied_luma_scale = 1.0 + (requested_luma_scale - 1.0) * strength
    applied_luma_shift = requested_luma_shift * strength
    applied_chroma_shift = requested_chroma_shift * strength

    corrected = frames.clone()
    full_rgb = frames[..., :3].to(torch.float32)
    luma_delta = (
        full_rgb[..., 0] * 0.299
        + full_rgb[..., 1] * 0.587
        + full_rgb[..., 2] * 0.114
    ) * (applied_luma_scale - 1.0) + applied_luma_shift
    luma_delta = luma_delta.to(frames.dtype)
    cb_shift = float(applied_chroma_shift[0].detach().cpu())
    cr_shift = float(applied_chroma_shift[1].detach().cpu())
    corrected[..., 0].add_(luma_delta).add_(1.402 * cr_shift)
    corrected[..., 1].add_(luma_delta).add_(-0.344136 * cb_shift - 0.714136 * cr_shift)
    corrected[..., 2].add_(luma_delta).add_(1.772 * cb_shift)
    corrected[..., :3].clamp_(0, 1)
    return corrected.contiguous(), {
        "applied": True,
        "sample_count": sample_count,
        "mask_used_for_statistics_only": True,
        "mask_margin_pixels": margin,
        "strength": float(strength),
        "luma_scale": float(applied_luma_scale.detach().cpu()),
        "luma_shift": float(applied_luma_shift.detach().cpu()),
        "chroma_shift": [
            float(value) for value in applied_chroma_shift.detach().cpu()
        ],
    }


def _calibrate_to_previous_overlap(
    frames,
    previous_overlap,
    edit_mask,
    overlap_frames,
    strength=None,
):
    strength = (
        _OVERLAP_COLOR_CALIBRATION_STRENGTH
        if strength is None
        else float(strength)
    )
    overlap_frames = min(
        max(0, int(overlap_frames)),
        int(frames.shape[0]),
        int(previous_overlap.shape[0]) if isinstance(previous_overlap, torch.Tensor) else 0,
    )
    if overlap_frames <= 0:
        return frames, {"applied": False, "reason": "missing_overlap"}
    if (
        not isinstance(previous_overlap, torch.Tensor)
        or previous_overlap.ndim != 4
        or previous_overlap.shape[1:3] != frames.shape[1:3]
        or int(previous_overlap.shape[-1]) < 3
    ):
        return frames, {"applied": False, "reason": "invalid_previous_overlap"}

    import torch.nn.functional as F

    reference_frames = min(
        overlap_frames,
        _OVERLAP_COLOR_REFERENCE_TAIL_FRAMES,
    )
    reference_start = overlap_frames - reference_frames
    current_rgb = frames[reference_start:overlap_frames, ..., :3].to(torch.float32)
    previous_rgb = previous_overlap[-reference_frames:, ..., :3].to(
        device=frames.device,
        dtype=torch.float32,
    )
    sample_size = (
        min(64, int(frames.shape[1])),
        min(64, int(frames.shape[2])),
    )
    sampled_current = F.adaptive_avg_pool2d(
        current_rgb.movedim(-1, 1),
        sample_size,
    ).movedim(1, -1)
    sampled_previous = F.adaptive_avg_pool2d(
        previous_rgb.movedim(-1, 1),
        sample_size,
    ).movedim(1, -1)

    use_character_mask = (
        isinstance(edit_mask, torch.Tensor)
        and edit_mask.ndim == 4
        and edit_mask.shape[:3] == frames.shape[:3]
    )
    if use_character_mask:
        sampled_mask = F.adaptive_avg_pool2d(
            edit_mask[reference_start:overlap_frames]
            .movedim(-1, 1)
            .to(torch.float32),
            sample_size,
        ).movedim(1, -1)
        valid = sampled_mask[..., 0] >= 0.75
        scope = "character_mask"
    else:
        valid = torch.ones(
            sampled_current.shape[:-1],
            device=sampled_current.device,
            dtype=torch.bool,
        )
        scope = "whole_frame"

    current_luma, current_cb, current_cr = _rgb_to_ycbcr(sampled_current)
    previous_luma, previous_cb, previous_cr = _rgb_to_ycbcr(sampled_previous)
    valid &= torch.isfinite(sampled_current).all(dim=-1)
    valid &= torch.isfinite(sampled_previous).all(dim=-1)
    valid &= (current_luma > 0.005) & (current_luma < 0.995)
    valid &= (previous_luma > 0.005) & (previous_luma < 0.995)
    sample_count = int(valid.sum())
    if sample_count < _OVERLAP_COLOR_MIN_SAMPLES:
        return frames, {
            "applied": False,
            "reason": "insufficient_overlap_samples",
            "sample_count": sample_count,
            "scope": scope,
        }

    valid_current_luma = current_luma[valid]
    valid_previous_luma = previous_luma[valid]
    current_luma_median = valid_current_luma.median()
    previous_luma_median = valid_previous_luma.median()
    current_luma_mad = (valid_current_luma - current_luma_median).abs().median()
    previous_luma_mad = (valid_previous_luma - previous_luma_median).abs().median()
    if float(current_luma_mad) > 0.005 and float(previous_luma_mad) > 0.005:
        requested_luma_scale = previous_luma_mad / current_luma_mad
    else:
        requested_luma_scale = torch.ones_like(current_luma_mad)
    requested_luma_scale = requested_luma_scale.clamp(
        1.0 - _OVERLAP_COLOR_MAX_LUMA_SCALE,
        1.0 + _OVERLAP_COLOR_MAX_LUMA_SCALE,
    )
    requested_luma_shift = (
        valid_previous_luma - valid_current_luma * requested_luma_scale
    ).median().clamp(
        -_OVERLAP_COLOR_MAX_LUMA_SHIFT,
        _OVERLAP_COLOR_MAX_LUMA_SHIFT,
    )

    current_chroma = torch.stack((current_cb, current_cr), dim=-1)
    previous_chroma = torch.stack((previous_cb, previous_cr), dim=-1)
    current_chroma_center = torch.stack(
        (current_cb[valid].median(), current_cr[valid].median())
    )
    previous_chroma_center = torch.stack(
        (previous_cb[valid].median(), previous_cr[valid].median())
    )
    current_centered_radius = torch.linalg.vector_norm(
        current_chroma - current_chroma_center,
        dim=-1,
    )[valid]
    previous_centered_radius = torch.linalg.vector_norm(
        previous_chroma - previous_chroma_center,
        dim=-1,
    )[valid]
    current_chroma_spread = torch.quantile(current_centered_radius, 0.75)
    previous_chroma_spread = torch.quantile(previous_centered_radius, 0.75)
    if (
        float(current_chroma_spread) >= _OVERLAP_COLOR_MIN_CHROMA_SPREAD
        and float(previous_chroma_spread) >= _OVERLAP_COLOR_MIN_CHROMA_SPREAD
    ):
        requested_chroma_scale = previous_chroma_spread / current_chroma_spread
        chroma_scale_basis = "centered_chroma_p75"
    else:
        current_chroma_radius = torch.linalg.vector_norm(current_chroma, dim=-1)[valid]
        previous_chroma_radius = torch.linalg.vector_norm(previous_chroma, dim=-1)[valid]
        current_chroma_level = torch.quantile(current_chroma_radius, 0.75)
        previous_chroma_level = torch.quantile(previous_chroma_radius, 0.75)
        if (
            float(current_chroma_level) >= _OVERLAP_COLOR_MIN_CHROMA_SPREAD
            and float(previous_chroma_level) >= _OVERLAP_COLOR_MIN_CHROMA_SPREAD
        ):
            requested_chroma_scale = previous_chroma_level / current_chroma_level
            chroma_scale_basis = "neutral_chroma_p75"
        else:
            requested_chroma_scale = torch.ones_like(current_chroma_spread)
            chroma_scale_basis = "identity"
    requested_chroma_scale = requested_chroma_scale.clamp(
        _OVERLAP_COLOR_MIN_CHROMA_SCALE,
        _OVERLAP_COLOR_MAX_CHROMA_SCALE,
    )
    requested_chroma_shift = torch.stack(
        (
            (
                previous_cb[valid]
                - current_cb[valid] * requested_chroma_scale
            ).median(),
            (
                previous_cr[valid]
                - current_cr[valid] * requested_chroma_scale
            ).median(),
        )
    ).clamp(
        -_OVERLAP_COLOR_MAX_CHROMA_SHIFT,
        _OVERLAP_COLOR_MAX_CHROMA_SHIFT,
    )

    applied_luma_scale = 1.0 + (requested_luma_scale - 1.0) * strength
    applied_luma_shift = requested_luma_shift * strength
    applied_chroma_scale = 1.0 + (requested_chroma_scale - 1.0) * strength
    applied_chroma_shift = requested_chroma_shift * strength
    full_rgb = frames[..., :3].to(torch.float32)
    full_luma, full_cb, full_cr = _rgb_to_ycbcr(full_rgb)
    corrected_luma = full_luma * applied_luma_scale + applied_luma_shift
    corrected_cb = full_cb * applied_chroma_scale + applied_chroma_shift[0]
    corrected_cr = full_cr * applied_chroma_scale + applied_chroma_shift[1]
    corrected_rgb = torch.stack(
        (
            corrected_luma + 1.402 * corrected_cr,
            corrected_luma - 0.344136 * corrected_cb - 0.714136 * corrected_cr,
            corrected_luma + 1.772 * corrected_cb,
        ),
        dim=-1,
    ).clamp(0, 1)

    if use_character_mask:
        mask = edit_mask.movedim(-1, 1).to(
            device=frames.device,
            dtype=torch.float32,
        )
        feather_radius = max(1, min(8, int(round(min(frames.shape[1:3]) * 0.01))))
        mask = F.pad(
            mask,
            (feather_radius, feather_radius, feather_radius, feather_radius),
            mode="replicate",
        )
        mask = F.avg_pool2d(
            mask,
            kernel_size=feather_radius * 2 + 1,
            stride=1,
        ).movedim(1, -1).clamp(0, 1)
    else:
        mask = torch.ones_like(full_rgb[..., :1])

    fade_frames = min(
        _OVERLAP_COLOR_FADE_FRAMES,
        max(0, int(frames.shape[0]) - overlap_frames),
    )
    temporal_weight = torch.zeros(
        (int(frames.shape[0]), 1, 1, 1),
        device=frames.device,
        dtype=torch.float32,
    )
    temporal_weight[:overlap_frames] = 1.0
    if fade_frames > 0:
        temporal_weight[overlap_frames : overlap_frames + fade_frames] = torch.linspace(
            1.0,
            0.0,
            fade_frames + 2,
            device=frames.device,
            dtype=torch.float32,
        )[1:-1].view(-1, 1, 1, 1)
    mask = mask * temporal_weight

    corrected = frames.clone()
    corrected[..., :3] = torch.lerp(full_rgb, corrected_rgb, mask).to(frames.dtype)
    return corrected.contiguous(), {
        "applied": True,
        "sample_count": sample_count,
        "scope": scope,
        "overlap_frames": overlap_frames,
        "fade_frames": fade_frames,
        "correction_frames": overlap_frames + fade_frames,
        "reference_tail_frames": reference_frames,
        "strength": float(strength),
        "luma_scale": float(applied_luma_scale.detach().cpu()),
        "luma_shift": float(applied_luma_shift.detach().cpu()),
        "chroma_scale": float(applied_chroma_scale.detach().cpu()),
        "chroma_scale_basis": chroma_scale_basis,
        "chroma_shift": [
            float(value) for value in applied_chroma_shift.detach().cpu()
        ],
    }


def _calibrate_character_sequence_to_previous(
    frames,
    previous_reference,
    edit_mask,
    reference_mask,
):
    if not isinstance(frames, torch.Tensor) or frames.ndim != 4 or int(frames.shape[-1]) < 3:
        return frames, {"applied": False, "reason": "missing_frames"}
    if (
        not isinstance(previous_reference, torch.Tensor)
        or previous_reference.ndim != 4
        or previous_reference.shape[1:3] != frames.shape[1:3]
        or int(previous_reference.shape[-1]) < 3
    ):
        return frames, {"applied": False, "reason": "missing_previous_reference"}
    if (
        not isinstance(edit_mask, torch.Tensor)
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
        or not isinstance(reference_mask, torch.Tensor)
        or reference_mask.ndim != 4
        or reference_mask.shape[:3] != previous_reference.shape[:3]
    ):
        return frames, {"applied": False, "reason": "missing_character_mask"}

    import torch.nn.functional as F

    frame_count = int(frames.shape[0])
    sample_size = (
        min(64, int(frames.shape[1])),
        min(64, int(frames.shape[2])),
    )
    current_rgb = frames[..., :3].to(torch.float32)
    reference_rgb = previous_reference[..., :3].to(
        device=frames.device,
        dtype=torch.float32,
    )
    sampled_current = F.adaptive_avg_pool2d(
        current_rgb.movedim(-1, 1),
        sample_size,
    ).movedim(1, -1)
    sampled_reference = F.adaptive_avg_pool2d(
        reference_rgb.movedim(-1, 1),
        sample_size,
    ).movedim(1, -1)
    sampled_current_mask = F.adaptive_avg_pool2d(
        edit_mask.movedim(-1, 1).to(device=frames.device, dtype=torch.float32),
        sample_size,
    ).movedim(1, -1)
    sampled_reference_mask = F.adaptive_avg_pool2d(
        reference_mask.movedim(-1, 1).to(device=frames.device, dtype=torch.float32),
        sample_size,
    ).movedim(1, -1)

    reference_luma, reference_cb, reference_cr = _rgb_to_ycbcr(sampled_reference)
    reference_valid = sampled_reference_mask[..., 0] >= 0.75
    reference_valid &= torch.isfinite(sampled_reference).all(dim=-1)
    reference_valid &= (reference_luma > 0.005) & (reference_luma < 0.995)
    reference_sample_count = int(reference_valid.sum())
    if reference_sample_count < _CHARACTER_COLOR_MIN_SAMPLES:
        return frames, {
            "applied": False,
            "reason": "insufficient_previous_reference_samples",
            "reference_sample_count": reference_sample_count,
        }

    reference_luma_values = reference_luma[reference_valid]
    target_luma_center = reference_luma_values.median()
    target_luma_spread = (
        torch.quantile(reference_luma_values, 0.90)
        - torch.quantile(reference_luma_values, 0.10)
    )
    target_chroma_center = torch.stack(
        (
            reference_cb[reference_valid].median(),
            reference_cr[reference_valid].median(),
        )
    )
    reference_chroma = torch.stack((reference_cb, reference_cr), dim=-1)
    target_chroma_spread = torch.quantile(
        torch.linalg.vector_norm(
            reference_chroma - target_chroma_center,
            dim=-1,
        )[reference_valid],
        0.75,
    )
    detail_radius = max(
        2,
        min(
            _CHARACTER_COLOR_DETAIL_RADIUS,
            int(round(min(frames.shape[1:3]) * 0.02)),
        ),
    )
    current_luma, current_cb, current_cr = _rgb_to_ycbcr(sampled_current)
    luma_scales = torch.ones(frame_count, device=frames.device, dtype=torch.float32)
    luma_shifts = torch.zeros(frame_count, device=frames.device, dtype=torch.float32)
    chroma_scales = torch.ones(frame_count, device=frames.device, dtype=torch.float32)
    chroma_shifts = torch.zeros(frame_count, 2, device=frames.device, dtype=torch.float32)
    applied_frames = torch.zeros(frame_count, device=frames.device, dtype=torch.bool)
    sample_counts = []

    for frame_index in range(frame_count):
        valid = sampled_current_mask[frame_index, ..., 0] >= 0.75
        valid &= torch.isfinite(sampled_current[frame_index]).all(dim=-1)
        valid &= (
            (current_luma[frame_index] > 0.005)
            & (current_luma[frame_index] < 0.995)
        )
        sample_count = int(valid.sum())
        sample_counts.append(sample_count)
        if sample_count < _CHARACTER_COLOR_MIN_SAMPLES:
            continue

        if _CHARACTER_LUMA_CORRECTION_ENABLED:
            luma_values = current_luma[frame_index][valid]
            current_luma_center = luma_values.median()
            current_luma_spread = (
                torch.quantile(luma_values, 0.90)
                - torch.quantile(luma_values, 0.10)
            )
            requested_luma_scale = torch.ones_like(current_luma_spread)
            if (
                float(current_luma_spread) >= _CHARACTER_COLOR_MIN_LUMA_SPREAD
                and float(target_luma_spread) >= _CHARACTER_COLOR_MIN_LUMA_SPREAD
            ):
                requested_luma_scale = (
                    target_luma_spread / current_luma_spread
                ).clamp(
                    _CHARACTER_COLOR_MIN_LUMA_SCALE,
                    _CHARACTER_COLOR_MAX_LUMA_SCALE,
                )
            luma_scales[frame_index] = (
                1.0
                + (requested_luma_scale - 1.0) * _CHARACTER_COLOR_STRENGTH
            )
            requested_luma_shift = (
                target_luma_center
                - current_luma_center * luma_scales[frame_index]
            ).clamp(
                -_CHARACTER_COLOR_MAX_LUMA_SHIFT,
                _CHARACTER_COLOR_MAX_LUMA_SHIFT,
            )
            luma_shifts[frame_index] = (
                requested_luma_shift * _CHARACTER_COLOR_STRENGTH
            )

        current_chroma_center = torch.stack(
            (
                current_cb[frame_index][valid].median(),
                current_cr[frame_index][valid].median(),
            )
        )
        current_chroma = torch.stack(
            (current_cb[frame_index], current_cr[frame_index]),
            dim=-1,
        )
        current_chroma_spread = torch.quantile(
            torch.linalg.vector_norm(
                current_chroma - current_chroma_center,
                dim=-1,
            )[valid],
            0.75,
        )
        requested_chroma_scale = torch.ones_like(current_chroma_spread)
        if (
            float(current_chroma_spread) >= _CHARACTER_COLOR_MIN_CHROMA_SPREAD
            and float(target_chroma_spread) >= _CHARACTER_COLOR_MIN_CHROMA_SPREAD
        ):
            requested_chroma_scale = (
                target_chroma_spread / current_chroma_spread
            ).clamp(
                _CHARACTER_COLOR_MIN_CHROMA_SCALE,
                _CHARACTER_COLOR_MAX_CHROMA_SCALE,
            )
        chroma_scales[frame_index] = (
            1.0
            + (requested_chroma_scale - 1.0) * _CHARACTER_COLOR_STRENGTH
        )
        requested_chroma_shift = (
            target_chroma_center
            - current_chroma_center * chroma_scales[frame_index]
        ).clamp(
            -_CHARACTER_COLOR_MAX_CHROMA_SHIFT,
            _CHARACTER_COLOR_MAX_CHROMA_SHIFT,
        )
        chroma_shifts[frame_index] = (
            requested_chroma_shift * _CHARACTER_COLOR_STRENGTH
        )
        applied_frames[frame_index] = True

    raw_luma_scales = luma_scales.clone()
    raw_luma_shifts = luma_shifts.clone()
    raw_chroma_scales = chroma_scales.clone()
    raw_chroma_shifts = chroma_shifts.clone()
    for frame_index in range(1, frame_count - 1):
        valid_window = applied_frames[frame_index - 1 : frame_index + 2]
        if applied_frames[frame_index] and bool(valid_window.any()):
            luma_scales[frame_index] = raw_luma_scales[
                frame_index - 1 : frame_index + 2
            ][valid_window].median()
            luma_shifts[frame_index] = raw_luma_shifts[
                frame_index - 1 : frame_index + 2
            ][valid_window].median()
            chroma_scales[frame_index] = raw_chroma_scales[
                frame_index - 1 : frame_index + 2
            ][valid_window].median()
            chroma_shifts[frame_index] = raw_chroma_shifts[
                frame_index - 1 : frame_index + 2
            ][valid_window].median(dim=0).values
    for frame_index in range(1, frame_count):
        if applied_frames[frame_index] and applied_frames[frame_index - 1]:
            alpha = _CHARACTER_COLOR_TEMPORAL_ALPHA
            luma_scales[frame_index] = (
                luma_scales[frame_index - 1] * (1.0 - alpha)
                + luma_scales[frame_index] * alpha
            )
            luma_shifts[frame_index] = (
                luma_shifts[frame_index - 1] * (1.0 - alpha)
                + luma_shifts[frame_index] * alpha
            )
            chroma_scales[frame_index] = (
                chroma_scales[frame_index - 1] * (1.0 - alpha)
                + chroma_scales[frame_index] * alpha
            )
            chroma_shifts[frame_index] = (
                chroma_shifts[frame_index - 1] * (1.0 - alpha)
                + chroma_shifts[frame_index] * alpha
            )

    mask = edit_mask.movedim(-1, 1).to(
        device=frames.device,
        dtype=torch.float32,
    )
    feather_radius = max(1, min(8, int(round(min(frames.shape[1:3]) * 0.01))))
    mask = F.pad(
        mask,
        (feather_radius, feather_radius, feather_radius, feather_radius),
        mode="replicate",
    )
    mask = F.avg_pool2d(
        mask,
        kernel_size=feather_radius * 2 + 1,
        stride=1,
    ).movedim(1, -1).clamp(0, 1)

    corrected = frames.clone()
    for frame_index in range(frame_count):
        if not applied_frames[frame_index]:
            continue
        frame_rgb = current_rgb[frame_index]
        frame_luma, frame_cb, frame_cr = _rgb_to_ycbcr(frame_rgb)
        channels = torch.stack((frame_luma, frame_cb, frame_cr), dim=0).unsqueeze(0)
        low_frequency = F.avg_pool2d(
            F.pad(
                channels,
                (detail_radius, detail_radius, detail_radius, detail_radius),
                mode="replicate",
            ),
            kernel_size=detail_radius * 2 + 1,
            stride=1,
        )[0]
        detail = channels[0] - low_frequency
        corrected_luma = (
            low_frequency[0] * luma_scales[frame_index]
            + luma_shifts[frame_index]
            + detail[0]
        )
        corrected_cb = (
            (low_frequency[1] + detail[1]) * chroma_scales[frame_index]
            + chroma_shifts[frame_index, 0]
        )
        corrected_cr = (
            (low_frequency[2] + detail[2]) * chroma_scales[frame_index]
            + chroma_shifts[frame_index, 1]
        )
        corrected_rgb = torch.stack(
            (
                corrected_luma + 1.402 * corrected_cr,
                corrected_luma - 0.344136 * corrected_cb - 0.714136 * corrected_cr,
                corrected_luma + 1.772 * corrected_cb,
            ),
            dim=-1,
        ).clamp(0, 1)
        corrected[frame_index, ..., :3] = torch.lerp(
            frame_rgb,
            corrected_rgb,
            mask[frame_index],
        ).to(frames.dtype)

    applied_count = int(applied_frames.sum())
    return corrected.contiguous(), {
        "applied": applied_count > 0,
        "scope": "character_mask",
        "reference": "provided_character_reference",
        "timing": "after_decode_before_overlap",
        "statistics": "chroma_only_ycbcr_robust_framewise",
        "frame_count": frame_count,
        "frames_applied": applied_count,
        "reference_frames": int(previous_reference.shape[0]),
        "reference_sample_count": reference_sample_count,
        "current_sample_counts": sample_counts,
        "detail_radius": detail_radius,
        "strength": _CHARACTER_COLOR_STRENGTH,
        "temporal_alpha": _CHARACTER_COLOR_TEMPORAL_ALPHA,
        "luma_scales": [float(value) for value in luma_scales.detach().cpu()],
        "luma_shifts": [float(value) for value in luma_shifts.detach().cpu()],
        "chroma_scales": [float(value) for value in chroma_scales.detach().cpu()],
        "chroma_shifts": [
            [float(value) for value in frame_shift]
            for frame_shift in chroma_shifts.detach().cpu()
        ],
        "luma_correction_enabled": _CHARACTER_LUMA_CORRECTION_ENABLED,
        "preserves_all_luma": not _CHARACTER_LUMA_CORRECTION_ENABLED,
        "preserves_high_frequency_luma": True,
        "preserves_high_frequency_chroma_structure": True,
        "high_frequency_chroma_scale": "same_as_low_frequency_chroma",
        "color_feedback": "controlled_by_caller_reference",
    }


def _tone_box_blur(luma, requested_radius):
    import torch.nn.functional as F

    radius = min(
        int(requested_radius),
        max(1, (min(int(luma.shape[-2]), int(luma.shape[-1])) - 1) // 2),
    )
    kernel_size = radius * 2 + 1
    values = luma.unsqueeze(1)
    values = F.avg_pool2d(
        F.pad(values, (radius, radius, 0, 0), mode="replicate"),
        kernel_size=(1, kernel_size),
        stride=1,
    )
    values = F.avg_pool2d(
        F.pad(values, (0, 0, radius, radius), mode="replicate"),
        kernel_size=(kernel_size, 1),
        stride=1,
    )
    return values.squeeze(1), radius


def _character_tone_pyramid(frames):
    rgb = frames[..., :3].to(torch.float32)
    luma = (
        rgb[..., 0] * 0.299
        + rgb[..., 1] * 0.587
        + rgb[..., 2] * 0.114
    )
    fine_blur, fine_radius = _tone_box_blur(
        luma,
        _CHARACTER_TONE_FINE_RADIUS,
    )
    mid_blur, mid_radius = _tone_box_blur(
        luma,
        _CHARACTER_TONE_MID_RADIUS,
    )
    broad_blur, broad_radius = _tone_box_blur(
        luma,
        _CHARACTER_TONE_BROAD_RADIUS,
    )
    return {
        "rgb": rgb,
        "luma": luma,
        "base": broad_blur,
        "bands": {
            "fine": luma - fine_blur,
            "mid": fine_blur - mid_blur,
            "broad": mid_blur - broad_blur,
        },
        "radii": {
            "fine": fine_radius,
            "mid": mid_radius,
            "broad": broad_radius,
        },
    }


def _character_tone_valid_mask(edit_mask, radius):
    import torch.nn.functional as F

    mask = edit_mask.to(dtype=torch.float32).clamp(0, 1)
    mask_channels = mask.movedim(-1, 1)
    radius = min(
        int(radius),
        max(1, (min(int(mask.shape[1]), int(mask.shape[2])) - 1) // 2),
    )
    kernel_size = radius * 2 + 1
    eroded = -F.max_pool2d(
        F.pad(-mask_channels, (radius, radius, 0, 0), mode="replicate"),
        kernel_size=(1, kernel_size),
        stride=1,
    )
    eroded = -F.max_pool2d(
        F.pad(-eroded, (0, 0, radius, radius), mode="replicate"),
        kernel_size=(kernel_size, 1),
        stride=1,
    )
    valid = eroded[:, 0] >= 0.50
    statistics_scope = "character_mask_interior"
    if int(valid.sum()) < _CHARACTER_TONE_MIN_SAMPLES:
        valid = mask[..., 0] >= 0.50
        statistics_scope = "character_mask"
    return mask, valid, statistics_scope


def _signed_tone_statistics(values, valid):
    finite = valid & torch.isfinite(values)
    selected = values[finite]
    positive = selected[selected > 0]
    negative = -selected[selected < 0]

    def quantiles(samples):
        sample_count = int(samples.numel())
        if sample_count < _CHARACTER_TONE_MIN_SAMPLES:
            return {
                "applied": False,
                "sample_count": sample_count,
                "reason": "insufficient_signed_samples",
            }
        return {
            "applied": True,
            "sample_count": sample_count,
            "q90": float(
                torch.quantile(
                    samples,
                    _CHARACTER_TONE_KNEE_QUANTILE,
                ).detach().cpu()
            ),
            "q99": float(
                torch.quantile(
                    samples,
                    _CHARACTER_TONE_LIMIT_QUANTILE,
                ).detach().cpu()
            ),
        }

    return {
        "positive": quantiles(positive),
        "negative": quantiles(negative),
    }


def _character_tone_state(frames, edit_mask):
    if (
        not isinstance(frames, torch.Tensor)
        or frames.ndim != 4
        or int(frames.shape[-1]) < 3
    ):
        return None, {"applied": False, "reason": "missing_frames"}
    if (
        not isinstance(edit_mask, torch.Tensor)
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return None, {"applied": False, "reason": "missing_character_mask"}

    pyramid = _character_tone_pyramid(frames)
    mask, valid, statistics_scope = _character_tone_valid_mask(
        edit_mask.to(device=frames.device),
        pyramid["radii"]["broad"],
    )
    sample_count = int(valid.sum())
    if sample_count < _CHARACTER_TONE_MIN_SAMPLES:
        return None, {
            "applied": False,
            "reason": "insufficient_character_samples",
            "sample_count": sample_count,
        }
    statistics = {
        band: _signed_tone_statistics(values, valid)
        for band, values in pyramid["bands"].items()
    }
    pyramid["mask"] = mask
    pyramid["valid"] = valid
    return pyramid, {
        "applied": True,
        "sample_count": sample_count,
        "statistics_scope": statistics_scope,
        "radii": pyramid["radii"],
        "bands": statistics,
    }


def _compress_signed_tone_band(values, controls):
    corrected_magnitudes = {}
    for sign, direction in (("positive", 1.0), ("negative", -1.0)):
        magnitude = torch.relu(values * direction)
        control = controls[sign]
        knee = float(control["target_q90"])
        full = max(float(control["current_q99"]), knee + 1e-6)
        position = ((magnitude - knee) / (full - knee)).clamp(0, 1)
        smooth_position = position * position * (3.0 - 2.0 * position)
        gain = 1.0 - (1.0 - float(control["gain"])) * smooth_position
        corrected_magnitudes[sign] = magnitude * gain
    return corrected_magnitudes["positive"] - corrected_magnitudes["negative"]


def _measure_character_tone_reference(generated_frames, original_frames, edit_mask):
    _generated_state, generated_info = _character_tone_state(
        generated_frames,
        edit_mask,
    )
    _original_state, original_info = _character_tone_state(
        original_frames,
        edit_mask,
    )
    if not generated_info.get("applied") or not original_info.get("applied"):
        return {
            "applied": False,
            "reason": "missing_reference_statistics",
            "generated": generated_info,
            "original": original_info,
        }
    return {
        "applied": True,
        "reference": "first_segment_head_relative_to_time_aligned_original",
        "frame_count": int(generated_frames.shape[0]),
        "radii": generated_info["radii"],
        "generated": generated_info["bands"],
        "original": original_info["bands"],
    }


def _apply_character_tone_inverse(
    frames,
    original_frames,
    edit_mask,
    reference,
    previous_gains=None,
):
    import torch.nn.functional as F

    if not reference or not reference.get("applied"):
        return frames, {
            "applied": False,
            "reason": "missing_first_segment_reference",
        }, previous_gains or {}
    if (
        not isinstance(frames, torch.Tensor)
        or not isinstance(original_frames, torch.Tensor)
        or not isinstance(edit_mask, torch.Tensor)
        or frames.ndim != 4
        or original_frames.shape[:3] != frames.shape[:3]
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return frames, {
            "applied": False,
            "reason": "missing_current_frames_or_mask",
        }, previous_gains or {}

    frame_count = int(frames.shape[0])
    if frame_count > _CHARACTER_TONE_STATISTICS_FRAMES:
        statistics_indices = torch.linspace(
            0,
            frame_count - 1,
            steps=_CHARACTER_TONE_STATISTICS_FRAMES,
            device=frames.device,
        ).round().to(torch.long).unique()
        statistics_frames = frames.index_select(0, statistics_indices)
        statistics_original = original_frames.index_select(0, statistics_indices)
        statistics_mask = edit_mask.index_select(0, statistics_indices)
    else:
        statistics_frames = frames
        statistics_original = original_frames
        statistics_mask = edit_mask

    generated_state, generated_info = _character_tone_state(
        statistics_frames,
        statistics_mask,
    )
    original_state, original_info = _character_tone_state(
        statistics_original,
        statistics_mask,
    )
    if not generated_info.get("applied") or not original_info.get("applied"):
        return frames, {
            "applied": False,
            "reason": "missing_current_statistics",
            "generated": generated_info,
            "original": original_info,
        }, previous_gains or {}

    previous_gains = previous_gains or {}
    next_gains = {}
    controls = {}
    min_gains = {
        "fine": _CHARACTER_TONE_FINE_MIN_GAIN,
        "mid": _CHARACTER_TONE_MID_MIN_GAIN,
        "broad": _CHARACTER_TONE_BROAD_MIN_GAIN,
    }
    applied = False
    for band in ("fine", "mid", "broad"):
        band_controls = {}
        for sign in ("positive", "negative"):
            current_stats = generated_info["bands"][band][sign]
            source_stats = original_info["bands"][band][sign]
            reference_generated = reference["generated"][band][sign]
            reference_original = reference["original"][band][sign]
            key = f"{band}_{sign}"
            if not all(
                item.get("applied")
                for item in (
                    current_stats,
                    source_stats,
                    reference_generated,
                    reference_original,
                )
            ):
                target_q90 = float(current_stats.get("q90", 0.0))
                target_q99 = float(current_stats.get("q99", 0.0))
                requested_gain = 1.0
                target_q90_ratio = 1.0
                target_q99_ratio = 1.0
            else:
                target_q90_ratio = max(
                    _CHARACTER_TONE_TARGET_MIN_RATIO,
                    min(
                        _CHARACTER_TONE_TARGET_MAX_RATIO,
                        float(reference_generated["q90"])
                        / max(float(reference_original["q90"]), 1e-6),
                    ),
                )
                target_q99_ratio = max(
                    _CHARACTER_TONE_TARGET_MIN_RATIO,
                    min(
                        _CHARACTER_TONE_TARGET_MAX_RATIO,
                        float(reference_generated["q99"])
                        / max(float(reference_original["q99"]), 1e-6),
                    ),
                )
                target_q90 = float(source_stats["q90"]) * target_q90_ratio
                target_q99 = float(source_stats["q99"]) * target_q99_ratio
                current_q90 = float(current_stats["q90"])
                current_q99 = float(current_stats["q99"])
                if (
                    current_q90
                    > max(
                        _CHARACTER_TONE_MIN_LEVEL,
                        target_q90 * _CHARACTER_TONE_TRIGGER_RATIO,
                    )
                    or current_q99
                    > max(
                        _CHARACTER_TONE_MIN_LEVEL,
                        target_q99 * _CHARACTER_TONE_TRIGGER_RATIO,
                    )
                ):
                    ratios = []
                    if current_q90 >= _CHARACTER_TONE_MIN_LEVEL:
                        ratios.append(target_q90 / current_q90)
                    if current_q99 >= _CHARACTER_TONE_MIN_LEVEL:
                        ratios.append(target_q99 / current_q99)
                    requested_gain = max(
                        min_gains[band],
                        min(1.0, min(ratios) if ratios else 1.0),
                    )
                else:
                    requested_gain = 1.0
            previous_gain = float(previous_gains.get(key, 1.0))
            if requested_gain < previous_gain:
                gain = previous_gain + (
                    requested_gain - previous_gain
                ) * _CHARACTER_TONE_TEMPORAL_ALPHA
            else:
                gain = requested_gain
            next_gains[key] = float(gain)
            applied |= gain < 1.0 - 1e-6
            band_controls[sign] = {
                "current_q90": float(current_stats.get("q90", 0.0)),
                "current_q99": float(current_stats.get("q99", 0.0)),
                "target_q90": float(target_q90),
                "target_q99": float(target_q99),
                "target_q90_ratio": float(target_q90_ratio),
                "target_q99_ratio": float(target_q99_ratio),
                "requested_gain": float(requested_gain),
                "previous_gain": previous_gain,
                "gain": float(gain),
            }
        controls[band] = band_controls

    del generated_state, original_state
    if not applied:
        return frames, {
            "applied": False,
            "reason": "within_reference_range",
            "reference": reference["reference"],
            "controls": controls,
            "radii": generated_info["radii"],
        }, next_gains

    feather_radius = max(1, min(8, int(round(min(frames.shape[1:3]) * 0.01))))
    corrected_batches = []
    for batch_start in range(0, frame_count, _CHARACTER_TONE_PROCESS_BATCH_FRAMES):
        batch_end = min(
            frame_count,
            batch_start + _CHARACTER_TONE_PROCESS_BATCH_FRAMES,
        )
        batch_frames = frames[batch_start:batch_end]
        batch_mask = edit_mask[batch_start:batch_end].to(
            device=frames.device,
            dtype=torch.float32,
        ).clamp(0, 1)
        pyramid = _character_tone_pyramid(batch_frames)
        corrected_bands = {
            band: _compress_signed_tone_band(pyramid["bands"][band], controls[band])
            for band in ("fine", "mid", "broad")
        }
        corrected_luma = (
            pyramid["base"]
            + corrected_bands["broad"]
            + corrected_bands["mid"]
            + corrected_bands["fine"]
        )
        corrected_rgb = (
            pyramid["rgb"] + (corrected_luma - pyramid["luma"]).unsqueeze(-1)
        ).clamp(0, 1)
        correction_mask = F.avg_pool2d(
            F.pad(
                batch_mask.movedim(-1, 1),
                (feather_radius, feather_radius, feather_radius, feather_radius),
                mode="replicate",
            ),
            kernel_size=feather_radius * 2 + 1,
            stride=1,
        ).movedim(1, -1).clamp(0, 1)
        corrected_batch = batch_frames.clone()
        corrected_batch[..., :3] = torch.lerp(
            pyramid["rgb"],
            corrected_rgb,
            correction_mask,
        ).to(frames.dtype)
        corrected_batches.append(corrected_batch)
    corrected = torch.cat(corrected_batches, dim=0).contiguous()
    return corrected, {
        "applied": True,
        "scope": "existing_character_mask",
        "reference": reference["reference"],
        "transform": "three_band_asymmetric_soft_knee_luma_inverse",
        "radii": generated_info["radii"],
        "knee_quantile": _CHARACTER_TONE_KNEE_QUANTILE,
        "limit_quantile": _CHARACTER_TONE_LIMIT_QUANTILE,
        "trigger_ratio": _CHARACTER_TONE_TRIGGER_RATIO,
        "temporal_alpha": _CHARACTER_TONE_TEMPORAL_ALPHA,
        "mask_feather_radius": feather_radius,
        "statistics_frames": int(statistics_frames.shape[0]),
        "process_batch_frames": _CHARACTER_TONE_PROCESS_BATCH_FRAMES,
        "preserves_low_frequency_base": True,
        "preserves_chroma": True,
        "passed_to_continue_motion": True,
        "controls": controls,
    }, next_gains


def _character_low_frequency_residual_state(
    generated_frames,
    original_frames,
    edit_mask,
):
    if (
        not isinstance(generated_frames, torch.Tensor)
        or not isinstance(original_frames, torch.Tensor)
        or not isinstance(edit_mask, torch.Tensor)
        or generated_frames.ndim != 4
        or original_frames.shape[:3] != generated_frames.shape[:3]
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != generated_frames.shape[:3]
    ):
        return None, {"applied": False, "reason": "missing_frames_or_mask"}

    generated_rgb = generated_frames[..., :3].to(torch.float32)
    original_rgb = original_frames[..., :3].to(
        device=generated_frames.device,
        dtype=torch.float32,
    )
    generated_luma = (
        generated_rgb[..., 0] * 0.299
        + generated_rgb[..., 1] * 0.587
        + generated_rgb[..., 2] * 0.114
    )
    original_luma = (
        original_rgb[..., 0] * 0.299
        + original_rgb[..., 1] * 0.587
        + original_rgb[..., 2] * 0.114
    )
    generated_inner, inner_radius = _tone_box_blur(
        generated_luma,
        _CHARACTER_LOW_FREQUENCY_INNER_RADIUS,
    )
    generated_outer, outer_radius = _tone_box_blur(
        generated_luma,
        _CHARACTER_LOW_FREQUENCY_OUTER_RADIUS,
    )
    original_inner, _ = _tone_box_blur(original_luma, inner_radius)
    original_outer, _ = _tone_box_blur(original_luma, outer_radius)
    generated_band = generated_inner - generated_outer
    original_band = original_inner - original_outer
    residual = generated_band - original_band
    mask, valid, statistics_scope = _character_tone_valid_mask(
        edit_mask.to(device=generated_frames.device),
        inner_radius,
    )
    finite = valid & torch.isfinite(residual)
    sample_count = int(finite.sum())
    if sample_count < _CHARACTER_TONE_MIN_SAMPLES:
        return None, {
            "applied": False,
            "reason": "insufficient_character_samples",
            "sample_count": sample_count,
        }
    center = residual[finite].median()
    centered_residual = residual - center
    statistics = _signed_tone_statistics(centered_residual, finite)
    return {
        "rgb": generated_rgb,
        "residual": residual,
        "center": center,
        "centered_residual": centered_residual,
        "mask": mask,
    }, {
        "applied": True,
        "sample_count": sample_count,
        "statistics_scope": statistics_scope,
        "inner_radius": inner_radius,
        "outer_radius": outer_radius,
        "center": float(center.detach().cpu()),
        "residual": statistics,
    }


def _measure_character_low_frequency_reference(
    generated_frames,
    original_frames,
    edit_mask,
):
    _state, info = _character_low_frequency_residual_state(
        generated_frames,
        original_frames,
        edit_mask,
    )
    if not info.get("applied"):
        return {
            "applied": False,
            "reason": "missing_reference_statistics",
            "statistics": info,
        }
    return {
        "applied": True,
        "reference": "first_segment_head_generated_minus_time_aligned_original",
        "frame_count": int(generated_frames.shape[0]),
        "inner_radius": int(info["inner_radius"]),
        "outer_radius": int(info["outer_radius"]),
        "center": float(info["center"]),
        "residual": info["residual"],
    }


def _apply_character_low_frequency_residual(
    frames,
    original_frames,
    edit_mask,
    reference,
    previous_controls=None,
):
    import torch.nn.functional as F

    if not reference or not reference.get("applied"):
        return frames, {
            "applied": False,
            "reason": "missing_first_segment_reference",
        }, previous_controls or {}
    if (
        not isinstance(frames, torch.Tensor)
        or not isinstance(original_frames, torch.Tensor)
        or not isinstance(edit_mask, torch.Tensor)
        or frames.ndim != 4
        or original_frames.shape[:3] != frames.shape[:3]
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return frames, {
            "applied": False,
            "reason": "missing_current_frames_or_mask",
        }, previous_controls or {}

    frame_count = int(frames.shape[0])
    if frame_count > _CHARACTER_TONE_STATISTICS_FRAMES:
        statistics_indices = torch.linspace(
            0,
            frame_count - 1,
            steps=_CHARACTER_TONE_STATISTICS_FRAMES,
            device=frames.device,
        ).round().to(torch.long).unique()
        statistics_frames = frames.index_select(0, statistics_indices)
        statistics_original = original_frames.index_select(0, statistics_indices)
        statistics_mask = edit_mask.index_select(0, statistics_indices)
    else:
        statistics_frames = frames
        statistics_original = original_frames
        statistics_mask = edit_mask
    _statistics_state, current_info = _character_low_frequency_residual_state(
        statistics_frames,
        statistics_original,
        statistics_mask,
    )
    if not current_info.get("applied"):
        return frames, {
            "applied": False,
            "reason": "missing_current_statistics",
            "current": current_info,
        }, previous_controls or {}

    previous_controls = previous_controls or {}
    controls = {}
    next_controls = {}
    applied = False
    for sign in ("positive", "negative"):
        current_stats = current_info["residual"][sign]
        reference_stats = reference["residual"][sign]
        if current_stats.get("applied") and reference_stats.get("applied"):
            target_q90 = float(reference_stats["q90"])
            target_q99 = float(reference_stats["q99"])
            current_q99 = float(current_stats["q99"])
            if (
                target_q99 >= _CHARACTER_TONE_MIN_LEVEL
                and current_q99
                > target_q99 * _CHARACTER_LOW_FREQUENCY_TRIGGER_RATIO
            ):
                requested_gain = max(
                    _CHARACTER_LOW_FREQUENCY_MIN_GAIN,
                    min(1.0, target_q99 / max(current_q99, 1e-8)),
                )
            else:
                requested_gain = 1.0
        else:
            target_q90 = float(current_stats.get("q90", 0.0))
            target_q99 = float(current_stats.get("q99", 0.0))
            requested_gain = 1.0
        previous_gain = float(previous_controls.get(f"{sign}_gain", 1.0))
        if requested_gain < previous_gain:
            gain = previous_gain + (
                requested_gain - previous_gain
            ) * _CHARACTER_LOW_FREQUENCY_TEMPORAL_ALPHA
        else:
            gain = requested_gain
        next_controls[f"{sign}_gain"] = float(gain)
        applied |= gain < 1.0 - 1e-6
        controls[sign] = {
            "current_q90": float(current_stats.get("q90", 0.0)),
            "current_q99": float(current_stats.get("q99", 0.0)),
            "target_q90": target_q90,
            "target_q99": target_q99,
            "requested_gain": float(requested_gain),
            "previous_gain": previous_gain,
            "gain": float(gain),
        }

    current_center = float(current_info["center"])
    reference_center = float(reference["center"])
    center_error = reference_center - current_center
    if abs(center_error) >= _CHARACTER_LOW_FREQUENCY_CENTER_TRIGGER:
        requested_center_shift = max(
            -_CHARACTER_LOW_FREQUENCY_MAX_CENTER_SHIFT,
            min(_CHARACTER_LOW_FREQUENCY_MAX_CENTER_SHIFT, center_error),
        )
    else:
        requested_center_shift = 0.0
    previous_center_shift = float(previous_controls.get("center_shift", 0.0))
    center_shift = previous_center_shift + (
        requested_center_shift - previous_center_shift
    ) * _CHARACTER_LOW_FREQUENCY_TEMPORAL_ALPHA
    next_controls["center_shift"] = float(center_shift)
    applied |= abs(center_shift) > 1e-6

    center_control = {
        "reference_center": reference_center,
        "current_center": current_center,
        "center_error": center_error,
        "requested_shift": float(requested_center_shift),
        "previous_shift": previous_center_shift,
        "shift": float(center_shift),
    }
    if not applied:
        return frames, {
            "applied": False,
            "reason": "within_reference_range",
            "reference": reference["reference"],
            "inner_radius": int(current_info["inner_radius"]),
            "outer_radius": int(current_info["outer_radius"]),
            "center": center_control,
            "controls": controls,
        }, next_controls

    feather_radius = max(
        1,
        min(8, int(round(min(frames.shape[1:3]) * 0.01))),
    )
    corrected_batches = []
    for batch_start in range(0, frame_count, _CHARACTER_TONE_PROCESS_BATCH_FRAMES):
        batch_end = min(
            frame_count,
            batch_start + _CHARACTER_TONE_PROCESS_BATCH_FRAMES,
        )
        batch_frames = frames[batch_start:batch_end]
        batch_original = original_frames[batch_start:batch_end]
        batch_mask = edit_mask[batch_start:batch_end].to(
            device=frames.device,
            dtype=torch.float32,
        ).clamp(0, 1)
        batch_state, _batch_info = _character_low_frequency_residual_state(
            batch_frames,
            batch_original,
            batch_mask,
        )
        if batch_state is None:
            corrected_batches.append(batch_frames)
            continue
        centered_residual = batch_state["residual"] - current_center
        corrected_centered = _compress_signed_tone_band(
            centered_residual,
            controls,
        )
        corrected_residual = (
            corrected_centered + current_center + center_shift
        )
        correction = (corrected_residual - batch_state["residual"]).clamp(
            -_CHARACTER_LOW_FREQUENCY_MAX_PIXEL_CORRECTION,
            _CHARACTER_LOW_FREQUENCY_MAX_PIXEL_CORRECTION,
        )
        corrected_rgb = (
            batch_state["rgb"] + correction.unsqueeze(-1)
        ).clamp(0, 1)
        correction_mask = F.avg_pool2d(
            F.pad(
                batch_mask.movedim(-1, 1),
                (
                    feather_radius,
                    feather_radius,
                    feather_radius,
                    feather_radius,
                ),
                mode="replicate",
            ),
            kernel_size=feather_radius * 2 + 1,
            stride=1,
        ).movedim(1, -1).clamp(0, 1)
        corrected_batch = batch_frames.clone()
        corrected_batch[..., :3] = torch.lerp(
            batch_state["rgb"],
            corrected_rgb,
            correction_mask,
        ).to(frames.dtype)
        corrected_batches.append(corrected_batch)
    corrected = torch.cat(corrected_batches, dim=0).contiguous()
    return corrected, {
        "applied": True,
        "scope": "existing_character_mask",
        "reference": reference["reference"],
        "transform": "first_segment_residual_ultra_band_inverse",
        "band": "blur32_minus_blur96",
        "inner_radius": int(current_info["inner_radius"]),
        "outer_radius": int(current_info["outer_radius"]),
        "trigger_ratio": _CHARACTER_LOW_FREQUENCY_TRIGGER_RATIO,
        "minimum_gain": _CHARACTER_LOW_FREQUENCY_MIN_GAIN,
        "temporal_alpha": _CHARACTER_LOW_FREQUENCY_TEMPORAL_ALPHA,
        "maximum_center_shift": _CHARACTER_LOW_FREQUENCY_MAX_CENTER_SHIFT,
        "maximum_pixel_correction": _CHARACTER_LOW_FREQUENCY_MAX_PIXEL_CORRECTION,
        "mask_feather_radius": feather_radius,
        "statistics_frames": int(statistics_frames.shape[0]),
        "process_batch_frames": _CHARACTER_TONE_PROCESS_BATCH_FRAMES,
        "center": center_control,
        "controls": controls,
        "preserves_chroma": True,
        "preserves_scene_outer_base": True,
        "passed_to_continue_motion": True,
    }, next_controls


def _continuation_luma_detail_state(frames, edit_mask):
    if (
        not isinstance(frames, torch.Tensor)
        or frames.ndim != 4
        or int(frames.shape[-1]) < 3
    ):
        return None, {"applied": False, "reason": "missing_frames"}
    if (
        not isinstance(edit_mask, torch.Tensor)
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return None, {"applied": False, "reason": "missing_character_mask"}

    import torch.nn.functional as F

    rgb = frames[..., :3].to(torch.float32)
    luma = (
        rgb[..., 0] * 0.299
        + rgb[..., 1] * 0.587
        + rgb[..., 2] * 0.114
    )
    radius = min(
        _CONTINUATION_DETAIL_RADIUS,
        max(1, (min(int(frames.shape[1]), int(frames.shape[2])) - 1) // 2),
    )
    kernel_size = radius * 2 + 1
    padded_luma = F.pad(
        luma.unsqueeze(1),
        (radius, radius, radius, radius),
        mode="replicate",
    )
    low_frequency = F.avg_pool2d(
        padded_luma,
        kernel_size=kernel_size,
        stride=1,
    ).squeeze(1)
    detail = luma - low_frequency
    mask = edit_mask.to(device=frames.device, dtype=torch.float32).clamp(0, 1)
    mask_channels = mask.movedim(-1, 1)
    statistics_mask = -F.max_pool2d(
        F.pad(
            -mask_channels,
            (radius, radius, radius, radius),
            mode="replicate",
        ),
        kernel_size=radius * 2 + 1,
        stride=1,
    ).movedim(1, -1)
    valid = statistics_mask[..., 0] >= 0.50
    valid &= torch.isfinite(detail)
    sample_count = int(valid.sum())
    statistics_scope = "character_mask_interior"
    if sample_count < _CONTINUATION_DETAIL_MIN_SAMPLES:
        valid = mask[..., 0] >= 0.50
        valid &= torch.isfinite(detail)
        sample_count = int(valid.sum())
        statistics_scope = "character_mask"
    if sample_count < _CONTINUATION_DETAIL_MIN_SAMPLES:
        return None, {
            "applied": False,
            "reason": "insufficient_character_samples",
            "sample_count": sample_count,
        }

    detail_level = torch.quantile(
        detail[valid].abs(),
        _CONTINUATION_DETAIL_QUANTILE,
    )
    luma_values = luma[valid]
    luma_center = luma_values.median()
    luma_spread = (
        torch.quantile(luma_values, 0.90)
        - torch.quantile(luma_values, 0.10)
    )
    return (
        rgb,
        detail,
        mask,
        detail_level,
        luma,
        low_frequency,
    ), {
        "applied": True,
        "sample_count": sample_count,
        "statistics_scope": statistics_scope,
        "detail_radius": radius,
        "detail_quantile": _CONTINUATION_DETAIL_QUANTILE,
        "detail_level": float(detail_level.detach().cpu()),
        "luma_center": float(luma_center.detach().cpu()),
        "luma_spread": float(luma_spread.detach().cpu()),
    }


def _measure_continuation_detail_reference(frames, edit_mask):
    _state, info = _continuation_luma_detail_state(frames, edit_mask)
    if not info.get("applied"):
        return None, info
    return float(info["detail_level"]), info


def _limit_continuation_detail_energy(
    frames,
    reference_detail_level,
    edit_mask,
    reference_luma_center=None,
    reference_luma_spread=None,
):
    import torch.nn.functional as F

    state, info = _continuation_luma_detail_state(frames, edit_mask)
    if state is None:
        return frames, info
    has_detail_reference = (
        reference_detail_level is not None
        and float(reference_detail_level) >= _CONTINUATION_DETAIL_MIN_LEVEL
    )
    has_luma_reference = (
        reference_luma_center is not None
        and reference_luma_spread is not None
        and float(reference_luma_spread) >= _CONTINUATION_LUMA_MIN_SPREAD
    )
    if not has_detail_reference and not has_luma_reference:
        return frames, {
            **info,
            "applied": False,
            "reason": "missing_conditioning_reference",
            "reference_detail_level": reference_detail_level,
            "reference_luma_center": reference_luma_center,
            "reference_luma_spread": reference_luma_spread,
        }

    rgb, detail, mask, current_level, luma, low_frequency = state
    current_level_value = float(current_level.detach().cpu())
    reference_level = (
        float(reference_detail_level) if has_detail_reference else None
    )
    detail_gain = 1.0
    detail_limited = False
    if has_detail_reference:
        target_detail_level = reference_level * _CONTINUATION_DETAIL_TARGET_RATIO
        trigger_level = target_detail_level * _CONTINUATION_DETAIL_TRIGGER_RATIO
        if current_level_value > trigger_level:
            requested_gain = target_detail_level / max(current_level_value, 1e-8)
            detail_gain = max(
                _CONTINUATION_DETAIL_MIN_GAIN,
                min(1.0, requested_gain),
            )
            detail_limited = True
    else:
        target_detail_level = None

    luma_scale = 1.0
    luma_shift = 0.0
    if has_luma_reference:
        current_luma_center = float(info["luma_center"])
        current_luma_spread = float(info["luma_spread"])
        if current_luma_spread >= _CONTINUATION_LUMA_MIN_SPREAD:
            requested_luma_scale = max(
                _CONTINUATION_LUMA_MIN_SCALE,
                min(
                    _CONTINUATION_LUMA_MAX_SCALE,
                    float(reference_luma_spread) / current_luma_spread,
                ),
            )
        else:
            requested_luma_scale = 1.0
        requested_luma_shift = max(
            -_CONTINUATION_LUMA_MAX_SHIFT,
            min(
                _CONTINUATION_LUMA_MAX_SHIFT,
                float(reference_luma_center)
                - current_luma_center * requested_luma_scale,
            ),
        )
        strength = _CONTINUATION_LUMA_ALIGNMENT_STRENGTH
        luma_scale = 1.0 + (requested_luma_scale - 1.0) * strength
        luma_shift = requested_luma_shift * strength

    luma_aligned = abs(luma_scale - 1.0) > 1e-6 or abs(luma_shift) > 1e-6
    if not detail_limited and not luma_aligned:
        return frames, {
            **info,
            "applied": False,
            "reason": "within_reference_range",
            "reference_detail_level": reference_level,
            "target_detail_level": target_detail_level,
            "trigger_detail_level": (
                target_detail_level * _CONTINUATION_DETAIL_TRIGGER_RATIO
                if target_detail_level is not None
                else None
            ),
            "detail_target_ratio": _CONTINUATION_DETAIL_TARGET_RATIO,
            "reference_luma_center": reference_luma_center,
            "reference_luma_spread": reference_luma_spread,
            "detail_gain": 1.0,
            "luma_scale": 1.0,
            "luma_shift": 0.0,
        }

    corrected_luma = (
        low_frequency * luma_scale
        + luma_shift
        + detail * detail_gain
    )
    corrected_rgb = (rgb + (corrected_luma - luma).unsqueeze(-1)).clamp(0, 1)
    feather_radius = max(
        1,
        min(8, int(round(min(frames.shape[1:3]) * 0.01))),
    )
    correction_mask = F.avg_pool2d(
        F.pad(
            mask.movedim(-1, 1),
            (feather_radius, feather_radius, feather_radius, feather_radius),
            mode="replicate",
        ),
        kernel_size=feather_radius * 2 + 1,
        stride=1,
    ).movedim(1, -1).clamp(0, 1)
    corrected = frames.clone()
    corrected[..., :3] = torch.lerp(rgb, corrected_rgb, correction_mask).to(frames.dtype)
    return corrected.contiguous(), {
        **info,
        "applied": True,
        "scope": "existing_character_mask",
        "mask_feather_radius": feather_radius,
        "conditioning_only": True,
        "reference": "first_segment_head",
        "reference_detail_level": reference_level,
        "target_detail_level": target_detail_level,
        "trigger_detail_level": (
            target_detail_level * _CONTINUATION_DETAIL_TRIGGER_RATIO
            if target_detail_level is not None
            else None
        ),
        "detail_target_ratio": _CONTINUATION_DETAIL_TARGET_RATIO,
        "reference_luma_center": reference_luma_center,
        "reference_luma_spread": reference_luma_spread,
        "trigger_ratio": _CONTINUATION_DETAIL_TRIGGER_RATIO,
        "detail_gain": float(detail_gain),
        "detail_limited": detail_limited,
        "min_detail_gain": _CONTINUATION_DETAIL_MIN_GAIN,
        "luma_aligned": luma_aligned,
        "luma_scale": float(luma_scale),
        "luma_shift": float(luma_shift),
        "luma_alignment_strength": _CONTINUATION_LUMA_ALIGNMENT_STRENGTH,
        "aligns_low_frequency_luma": True,
        "luma_alignment_scales_high_frequency_luma": False,
        "preserves_in_range_high_frequency_luma": not detail_limited,
        "preserves_chroma": True,
    }


def _measure_local_character_blocks(frames, edit_mask):
    import torch.nn.functional as F

    height = int(frames.shape[1])
    width = int(frames.shape[2])
    minimum_dimension = min(height, width)
    block_size = min(
        _APPEARANCE_LOCAL_BLOCK_SIZE,
        max(2, minimum_dimension // 4),
    )
    if block_size < 2:
        return {"applied": False, "reason": "frame_too_small"}

    rgb = frames[..., :3].to(torch.float32)
    luma, cb, cr = _rgb_to_ycbcr(rgb)
    mask = edit_mask[..., 0].to(
        device=frames.device,
        dtype=torch.float32,
    ).clamp(0, 1)

    def block_mean(values):
        return F.avg_pool2d(
            values.unsqueeze(1),
            kernel_size=block_size,
            stride=block_size,
        ).squeeze(1)

    coverage = block_mean(mask)
    luma_mean = block_mean(luma)
    luma_variance = (block_mean(luma * luma) - luma_mean * luma_mean).clamp_min(0)
    radius = min(
        _APPEARANCE_DETAIL_RADIUS,
        max(1, (min(height, width) - 1) // 2),
    )
    low_frequency = F.avg_pool2d(
        F.pad(
            luma.unsqueeze(1),
            (radius, radius, radius, radius),
            mode="replicate",
        ),
        kernel_size=radius * 2 + 1,
        stride=1,
    ).squeeze(1)
    detail_energy = block_mean((luma - low_frequency).abs())
    cb_mean = block_mean(cb)
    cr_mean = block_mean(cr)
    chroma_variance = (
        block_mean(cb * cb)
        - cb_mean * cb_mean
        + block_mean(cr * cr)
        - cr_mean * cr_mean
    ).clamp_min(0)
    valid = coverage >= _APPEARANCE_LOCAL_BLOCK_MIN_MASK_COVERAGE
    valid &= torch.isfinite(luma_variance)
    valid &= torch.isfinite(detail_energy)
    valid &= torch.isfinite(chroma_variance)
    block_count = int(valid.sum())
    if block_count < 1:
        return {
            "applied": False,
            "reason": "no_character_blocks",
            "block_count": block_count,
        }

    return {
        "applied": True,
        "block_size": block_size,
        "block_quantile": _APPEARANCE_LOCAL_BLOCK_QUANTILE,
        "minimum_mask_coverage": _APPEARANCE_LOCAL_BLOCK_MIN_MASK_COVERAGE,
        "block_count": block_count,
        "local_block_luma_std_p90": float(
            torch.quantile(
                torch.sqrt(luma_variance[valid]),
                _APPEARANCE_LOCAL_BLOCK_QUANTILE,
            ).detach().cpu()
        ),
        "local_block_detail_mean_p90": float(
            torch.quantile(
                detail_energy[valid],
                _APPEARANCE_LOCAL_BLOCK_QUANTILE,
            ).detach().cpu()
        ),
        "local_block_chroma_std_p90": float(
            torch.quantile(
                torch.sqrt(chroma_variance[valid]),
                _APPEARANCE_LOCAL_BLOCK_QUANTILE,
            ).detach().cpu()
        ),
    }


def _measure_character_appearance(frames, edit_mask):
    if (
        not isinstance(frames, torch.Tensor)
        or frames.ndim != 4
        or int(frames.shape[-1]) < 3
    ):
        return {"applied": False, "reason": "missing_frames"}
    if (
        not isinstance(edit_mask, torch.Tensor)
        or edit_mask.ndim != 4
        or edit_mask.shape[:3] != frames.shape[:3]
    ):
        return {"applied": False, "reason": "missing_character_mask"}

    import torch.nn.functional as F

    sample_size = (
        min(_APPEARANCE_SAMPLE_SIZE, int(frames.shape[1])),
        min(_APPEARANCE_SAMPLE_SIZE, int(frames.shape[2])),
    )
    sampled_rgb = F.adaptive_avg_pool2d(
        frames[..., :3].movedim(-1, 1).to(torch.float32),
        sample_size,
    ).movedim(1, -1)
    sampled_mask = F.adaptive_avg_pool2d(
        edit_mask.movedim(-1, 1).to(torch.float32),
        sample_size,
    ).movedim(1, -1).clamp(0, 1)
    luma, cb, cr = _rgb_to_ycbcr(sampled_rgb)
    valid = sampled_mask[..., 0] >= 0.50
    valid &= torch.isfinite(sampled_rgb).all(dim=-1)
    valid &= (luma > 0.005) & (luma < 0.995)
    sample_count = int(valid.sum())
    if sample_count < _CHARACTER_COLOR_MIN_SAMPLES:
        return {
            "applied": False,
            "reason": "insufficient_character_samples",
            "sample_count": sample_count,
        }

    luma_values = luma[valid]
    luma_center = luma_values.median()
    luma_spread = (
        torch.quantile(luma_values, 0.90)
        - torch.quantile(luma_values, 0.10)
    )
    radius = min(
        _APPEARANCE_DETAIL_RADIUS,
        max(1, (min(sample_size) - 1) // 2),
    )
    low_frequency = F.avg_pool2d(
        F.pad(
            luma.unsqueeze(1),
            (radius, radius, radius, radius),
            mode="replicate",
        ),
        kernel_size=radius * 2 + 1,
        stride=1,
    ).squeeze(1)
    detail_values = (luma - low_frequency)[valid]
    absolute_detail = detail_values.abs()
    detail_level = torch.quantile(
        absolute_detail,
        _CONTINUATION_DETAIL_QUANTILE,
    )
    detail_p99 = torch.quantile(absolute_detail, 0.99)
    positive_detail = detail_values[detail_values > 0]
    negative_detail = -detail_values[detail_values < 0]
    detail_positive_p99 = (
        torch.quantile(positive_detail, 0.99)
        if int(positive_detail.numel()) > 0
        else torch.zeros_like(detail_p99)
    )
    detail_negative_p99 = (
        torch.quantile(negative_detail, 0.99)
        if int(negative_detail.numel()) > 0
        else torch.zeros_like(detail_p99)
    )
    chroma_center = torch.stack((cb[valid].median(), cr[valid].median()))
    chroma = torch.stack((cb, cr), dim=-1)
    chroma_radius = torch.linalg.vector_norm(chroma - chroma_center, dim=-1)[valid]
    chroma_spread = torch.quantile(chroma_radius, 0.75)
    chroma_radius_p95 = torch.quantile(chroma_radius, 0.95)
    chroma_radius_p99 = torch.quantile(chroma_radius, 0.99)
    local_blocks = _measure_local_character_blocks(frames, edit_mask)
    return {
        "applied": True,
        "frame_count": int(frames.shape[0]),
        "sample_count": sample_count,
        "luma_center": float(luma_center.detach().cpu()),
        "luma_spread_p90_p10": float(luma_spread.detach().cpu()),
        "detail_p95": float(detail_level.detach().cpu()),
        "detail_p99": float(detail_p99.detach().cpu()),
        "detail_positive_p99": float(detail_positive_p99.detach().cpu()),
        "detail_negative_p99": float(detail_negative_p99.detach().cpu()),
        "chroma_center": [
            float(value) for value in chroma_center.detach().cpu()
        ],
        "chroma_spread_p75": float(chroma_spread.detach().cpu()),
        "chroma_radius_p95": float(chroma_radius_p95.detach().cpu()),
        "chroma_radius_p99": float(chroma_radius_p99.detach().cpu()),
        "local_blocks": local_blocks,
        "local_block_luma_std_p90": local_blocks.get(
            "local_block_luma_std_p90"
        ),
        "local_block_detail_mean_p90": local_blocks.get(
            "local_block_detail_mean_p90"
        ),
        "local_block_chroma_std_p90": local_blocks.get(
            "local_block_chroma_std_p90"
        ),
    }


def _measure_character_appearance_windows(frames, edit_mask):
    if not isinstance(frames, torch.Tensor) or int(frames.shape[0]) <= 0:
        missing = {"applied": False, "reason": "missing_frames"}
        return {"head": missing, "tail": missing}
    count = min(_APPEARANCE_REFERENCE_FRAMES, int(frames.shape[0]))
    head_mask = edit_mask[:count] if isinstance(edit_mask, torch.Tensor) else None
    tail_mask = edit_mask[-count:] if isinstance(edit_mask, torch.Tensor) else None
    return {
        "head": _measure_character_appearance(frames[:count], head_mask),
        "tail": _measure_character_appearance(frames[-count:], tail_mask),
    }


def _appearance_change(current, reference):
    if not current.get("applied") or not reference.get("applied"):
        return {"applied": False, "reason": "missing_appearance_statistics"}
    reference_luma_spread = max(float(reference["luma_spread_p90_p10"]), 1e-8)
    reference_detail = max(float(reference["detail_p95"]), 1e-8)
    reference_detail_p99 = max(float(reference["detail_p99"]), 1e-8)
    reference_detail_positive_p99 = max(
        float(reference["detail_positive_p99"]),
        1e-8,
    )
    reference_detail_negative_p99 = max(
        float(reference["detail_negative_p99"]),
        1e-8,
    )
    reference_chroma_spread = max(float(reference["chroma_spread_p75"]), 1e-8)
    reference_chroma_radius_p95 = max(float(reference["chroma_radius_p95"]), 1e-8)
    reference_chroma_radius_p99 = max(float(reference["chroma_radius_p99"]), 1e-8)
    reference_local_luma = max(
        float(reference.get("local_block_luma_std_p90") or 0.0),
        1e-8,
    )
    reference_local_detail = max(
        float(reference.get("local_block_detail_mean_p90") or 0.0),
        1e-8,
    )
    reference_local_chroma = max(
        float(reference.get("local_block_chroma_std_p90") or 0.0),
        1e-8,
    )
    cb_delta = float(current["chroma_center"][0]) - float(reference["chroma_center"][0])
    cr_delta = float(current["chroma_center"][1]) - float(reference["chroma_center"][1])
    return {
        "applied": True,
        "luma_center_delta": float(current["luma_center"])
        - float(reference["luma_center"]),
        "luma_spread_ratio": float(current["luma_spread_p90_p10"])
        / reference_luma_spread,
        "detail_ratio": float(current["detail_p95"]) / reference_detail,
        "detail_p99_ratio": float(current["detail_p99"]) / reference_detail_p99,
        "detail_positive_p99_ratio": float(current["detail_positive_p99"])
        / reference_detail_positive_p99,
        "detail_negative_p99_ratio": float(current["detail_negative_p99"])
        / reference_detail_negative_p99,
        "chroma_center_distance": (cb_delta * cb_delta + cr_delta * cr_delta) ** 0.5,
        "chroma_spread_ratio": float(current["chroma_spread_p75"])
        / reference_chroma_spread,
        "chroma_radius_p95_ratio": float(current["chroma_radius_p95"])
        / reference_chroma_radius_p95,
        "chroma_radius_p99_ratio": float(current["chroma_radius_p99"])
        / reference_chroma_radius_p99,
        "local_block_luma_std_p90_ratio": float(
            current.get("local_block_luma_std_p90") or 0.0
        )
        / reference_local_luma,
        "local_block_detail_mean_p90_ratio": float(
            current.get("local_block_detail_mean_p90") or 0.0
        )
        / reference_local_detail,
        "local_block_chroma_std_p90_ratio": float(
            current.get("local_block_chroma_std_p90") or 0.0
        )
        / reference_local_chroma,
    }


def _attach_appearance_reference(windows, reference):
    result = {}
    for name in ("head", "tail"):
        statistics = dict(windows.get(name, {}))
        statistics["vs_first_segment_head"] = _appearance_change(
            statistics,
            reference,
        )
        result[name] = statistics
    result["tail_vs_head"] = _appearance_change(
        result["tail"],
        result["head"],
    )
    return result


def _slice_condition_window(value, start, length, source_limit, repeat_single=False):
    if not isinstance(value, torch.Tensor) or value.ndim == 0 or int(value.shape[0]) == 0:
        return value

    available = min(int(value.shape[0]), max(1, int(source_limit)))
    source = value[:available]
    start = max(0, int(start))
    length = max(1, int(length))

    if available == 1 and not repeat_single:
        return source if start == 0 else None
    if start < available:
        window = source[start : start + length]
    else:
        window = source[-1:]
    if int(window.shape[0]) < length:
        window = torch.cat(
            (window, window[-1:].repeat((length - int(window.shape[0]),) + (1,) * (window.ndim - 1))),
            dim=0,
        )
    return window.contiguous()


def _replace_output_tail(output, replacement):
    remaining = int(replacement.shape[0])
    replacement_end = remaining
    for frames in reversed(output):
        if remaining <= 0:
            break
        take = min(remaining, int(frames.shape[0]))
        replacement_start = replacement_end - take
        frames[-take:] = replacement[replacement_start:replacement_end]
        remaining -= take
        replacement_end = replacement_start
    if remaining != 0:
        raise RuntimeError("Wan Animate overlap exceeds the available output frames.")


def _output_tail(output, count):
    remaining = max(0, int(count))
    pieces = []
    for frames in reversed(output):
        if remaining <= 0:
            break
        take = min(remaining, int(frames.shape[0]))
        pieces.insert(0, frames[-take:])
        remaining -= take
    if not pieces:
        return None
    return torch.cat(pieces, dim=0).contiguous()


def _calibration_debug_sample_indices(frame_count, discard_head):
    frame_count = max(0, int(frame_count))
    if frame_count <= 0:
        return []
    candidates = [("head", 0)]
    discard_head = max(0, min(int(discard_head), frame_count))
    if discard_head > 0:
        candidates.append(("overlap_tail", discard_head - 1))
    if discard_head < frame_count:
        candidates.append(("kept_head", discard_head))
    candidates.append(("tail", frame_count - 1))
    result = []
    seen = set()
    for label, index in candidates:
        if index in seen:
            continue
        seen.add(index)
        result.append((label, index))
    return result


def _start_calibration_debug(enabled, seed, total_frames, width, height):
    state = {
        "enabled": bool(enabled),
        "written": False,
        "errors": [],
        "stage_records": [],
        "effective_mask": None,
    }
    if not enabled:
        return state
    try:
        import folder_paths

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        directory = (
            Path(folder_paths.get_output_directory())
            / _CALIBRATION_DEBUG_FOLDER
            / f"{timestamp}_seed{int(seed)}"
        )
        directory.mkdir(parents=True, exist_ok=False)
        state.update(
            {
                "directory": str(directory.resolve()),
                "_directory": directory,
                "seed": int(seed),
                "total_frames": int(total_frames),
                "width": int(width),
                "height": int(height),
            }
        )
    except Exception as exc:
        state["errors"].append(f"create_debug_directory: {exc}")
    return state


def _calibration_debug_write_effective_mask(state, edit_mask):
    directory = state.get("_directory")
    if directory is None or state.get("effective_mask") is not None:
        return
    if not isinstance(edit_mask, torch.Tensor) or edit_mask.ndim != 4:
        return
    try:
        from PIL import Image

        mask = (
            edit_mask[0, ..., 0]
            .detach()
            .to(device="cpu", dtype=torch.float32)
            .clamp(0, 1)
            .mul(255.0)
            .round()
            .to(torch.uint8)
            .numpy()
        )
        relative = Path("effective_character_mask.png")
        Image.fromarray(mask).save(directory / relative, optimize=True)
        state["effective_mask"] = relative.as_posix()
    except Exception as exc:
        state["errors"].append(f"write_effective_mask: {exc}")


def _calibration_debug_record_stage(
    state,
    chunk_index,
    stage,
    frames,
    edit_mask,
    source_start,
    discard_head=0,
):
    directory = state.get("_directory")
    if directory is None:
        return
    if not isinstance(frames, torch.Tensor) or frames.ndim != 4 or int(frames.shape[0]) <= 0:
        return
    try:
        from PIL import Image

        frame_count = int(frames.shape[0])
        appearance = _measure_character_appearance_windows(frames, edit_mask)
        stage_directory = Path(f"chunk_{int(chunk_index):02d}") / str(stage)
        (directory / stage_directory).mkdir(parents=True, exist_ok=True)
        files = []
        for label, local_index in _calibration_debug_sample_indices(
            frame_count,
            discard_head,
        ):
            global_frame = int(source_start) + int(local_index)
            relative = stage_directory / (
                f"{label}_local_{int(local_index):03d}_global_{global_frame:04d}.png"
            )
            rgb = (
                frames[local_index, ..., :3]
                .detach()
                .to(device="cpu", dtype=torch.float32)
                .clamp(0, 1)
                .mul(255.0)
                .round()
                .to(torch.uint8)
                .numpy()
            )
            Image.fromarray(rgb).save(directory / relative, optimize=True)
            files.append(
                {
                    "label": label,
                    "local_frame": int(local_index),
                    "global_frame": global_frame,
                    "path": relative.as_posix(),
                }
            )
        state["stage_records"].append(
            {
                "chunk": int(chunk_index),
                "stage": str(stage),
                "source_start": int(source_start),
                "frame_count": frame_count,
                "discard_head": int(discard_head),
                "appearance": appearance,
                "images": files,
            }
        )
    except Exception as exc:
        state["errors"].append(
            f"record_stage chunk={int(chunk_index)} stage={stage}: {exc}"
        )


def _calibration_debug_metric_rows(stage_records):
    rows = []
    metric_names = (
        "luma_center",
        "luma_spread_p90_p10",
        "detail_p95",
        "detail_p99",
        "detail_positive_p99",
        "detail_negative_p99",
        "chroma_spread_p75",
        "chroma_radius_p95",
        "chroma_radius_p99",
        "local_block_luma_std_p90",
        "local_block_detail_mean_p90",
        "local_block_chroma_std_p90",
    )
    for record in stage_records:
        frame_count = int(record["frame_count"])
        for window in ("head", "tail"):
            statistics = record.get("appearance", {}).get(window, {})
            count = int(statistics.get("frame_count", 0) or 0)
            if window == "head":
                frame_start = int(record["source_start"])
            else:
                frame_start = int(record["source_start"]) + max(0, frame_count - count)
            center = statistics.get("chroma_center") or [None, None]
            row = {
                "chunk": int(record["chunk"]),
                "stage": str(record["stage"]),
                "window": window,
                "source_start": int(record["source_start"]),
                "frame_start": frame_start,
                "frame_end": frame_start + max(0, count - 1),
                "frame_count": count,
                "sample_count": int(statistics.get("sample_count", 0) or 0),
                "applied": bool(statistics.get("applied")),
                "chroma_center_cb": center[0],
                "chroma_center_cr": center[1],
            }
            for metric in metric_names:
                row[metric] = statistics.get(metric)
            rows.append(row)
    return rows


def _finish_calibration_debug(state, summary_payload):
    if not state.get("enabled"):
        summary_payload["calibration_debug"] = {
            "enabled": False,
            "written": False,
        }
        return
    directory = state.get("_directory")
    if directory is None:
        summary_payload["calibration_debug"] = {
            "enabled": True,
            "written": False,
            "errors": list(state.get("errors", [])),
        }
        return

    public = {
        "enabled": True,
        "written": False,
        "directory": str(directory.resolve()),
        "manifest": str((directory / "debug_manifest.json").resolve()),
        "loop_summary": str((directory / "loop_summary.json").resolve()),
        "chunk_controls": str((directory / "chunk_controls.json").resolve()),
        "stage_metrics": str((directory / "stage_metrics.csv").resolve()),
        "effective_mask": (
            str((directory / state["effective_mask"]).resolve())
            if state.get("effective_mask")
            else None
        ),
        "stage_count": len(state.get("stage_records", [])),
        "errors": list(state.get("errors", [])),
    }
    summary_payload["calibration_debug"] = public
    try:
        control_keys = (
            "chunk",
            "source_start",
            "produced",
            "continue_motion_frames",
            "continuation_rgb",
            "background_calibration",
            "character_color_calibration",
            "character_tone_inverse",
            "character_low_frequency_residual",
            "character_saturation_control",
            "overlap_color_calibration",
            "appearance_drift",
        )
        chunk_controls = {
            "schema_version": 1,
            "color_correction_switches": summary_payload.get(
                "color_correction_switches",
                {},
            ),
            "chunks": [
                {key: chunk.get(key) for key in control_keys}
                for chunk in summary_payload.get("chunks", [])
            ],
        }
        (directory / "chunk_controls.json").write_text(
            json.dumps(chunk_controls, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        rows = _calibration_debug_metric_rows(state.get("stage_records", []))
        if rows:
            with (directory / "stage_metrics.csv").open(
                "w",
                encoding="utf-8-sig",
                newline="",
            ) as handle:
                writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)

        public["written"] = True
        state["written"] = True
        (directory / "loop_summary.json").write_text(
            json.dumps(summary_payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest = {
            "schema_version": 1,
            "seed": state.get("seed"),
            "total_frames": state.get("total_frames"),
            "width": state.get("width"),
            "height": state.get("height"),
            "effective_mask": state.get("effective_mask"),
            "loop_summary": "loop_summary.json",
            "chunk_controls": "chunk_controls.json",
            "stage_metrics": "stage_metrics.csv",
            "stage_records": state.get("stage_records", []),
            "errors": list(state.get("errors", [])),
        }
        (directory / "debug_manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    except Exception as exc:
        public["errors"].append(f"finalize_debug_bundle: {exc}")
        public["written"] = False


def _blend_output_overlap(output, current_overlap):
    count = int(current_overlap.shape[0])
    if count <= 0:
        return 0
    previous_overlap = _output_tail(output, count)
    if previous_overlap is None or int(previous_overlap.shape[0]) != count:
        raise RuntimeError("Wan Animate overlap exceeds the available output frames.")
    if count == 1:
        weights = torch.ones((1, 1, 1, 1), device=current_overlap.device, dtype=torch.float32)
    else:
        weights = torch.linspace(0.0, 1.0, count, device=current_overlap.device, dtype=torch.float32)
        weights = (weights * weights * (3.0 - 2.0 * weights)).view(count, 1, 1, 1)
    blended = torch.lerp(
        previous_overlap.to(torch.float32),
        current_overlap.to(torch.float32),
        weights,
    ).to(previous_overlap.dtype)
    _replace_output_tail(output, blended.contiguous())
    return count


class SimpAIWanAnimateLoop:
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
                "driving_video": ("IMAGE",),
                "width": ("INT", {"default": 832, "min": 16, "max": 16384, "step": 16}),
                "height": ("INT", {"default": 480, "min": 16, "max": 16384, "step": 16}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1}),
                "max_frames": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1}),
                "max_chunk_frames": ("INT", {"default": 77, "min": 17, "max": 97, "step": 4}),
                "overlap_frames": ("INT", {"default": 5, "min": 1, "max": 33, "step": 4}),
                "segment_contrast": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01}),
                "segment_saturation": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.01}),
            },
            "optional": {
                "clip_vision_output": ("CLIP_VISION_OUTPUT",),
                "face_video": ("IMAGE",),
                "pose_video": ("IMAGE",),
                "background_video": ("IMAGE",),
                "character_mask": ("MASK",),
                "enable_continuation_normalization": ("BOOLEAN", {"default": False}),
                "enable_background_calibration": ("BOOLEAN", {"default": False}),
                "enable_character_color_calibration": ("BOOLEAN", {"default": False}),
                "enable_character_tone_inverse": ("BOOLEAN", {"default": False}),
                "enable_character_low_frequency_residual": ("BOOLEAN", {"default": False}),
                "enable_manual_segment_color": ("BOOLEAN", {"default": False}),
                "enable_overlap_color_calibration": ("BOOLEAN", {"default": False}),
                "calibration_debug": ("BOOLEAN", {"default": False}),
                "preserve_input_frame_count": ("BOOLEAN", {"default": False}),
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
        driving_video,
        width,
        height,
        seed,
        cfg,
        max_frames,
        max_chunk_frames,
        overlap_frames,
        segment_contrast=1.0,
        segment_saturation=1.0,
        clip_vision_output=None,
        face_video=None,
        pose_video=None,
        background_video=None,
        character_mask=None,
        enable_continuation_normalization=False,
        enable_background_calibration=False,
        enable_character_color_calibration=False,
        enable_character_tone_inverse=False,
        enable_character_low_frequency_residual=False,
        enable_manual_segment_color=False,
        enable_overlap_color_calibration=False,
        calibration_debug=False,
        preserve_input_frame_count=False,
    ):
        if not isinstance(driving_video, torch.Tensor) or driving_video.ndim != 4:
            raise ValueError("driving_video must be a ComfyUI IMAGE tensor.")
        if not isinstance(reference_image, torch.Tensor) or reference_image.ndim != 4 or reference_image.shape[0] == 0:
            raise ValueError("reference_image must contain at least one image.")

        from comfy_extras.nodes_wan import WanAnimateToVideo

        source_frame_count = int(driving_video.shape[0])
        if int(max_frames) > 0:
            source_frame_count = min(source_frame_count, int(max_frames))
        if source_frame_count <= 0:
            raise ValueError("driving_video has no frames to generate.")

        total_frames = source_frame_count
        if preserve_input_frame_count:
            driving_video, source_frame_count, total_frames = _pad_to_temporal_grid(
                driving_video,
                source_frame_count,
            )

        calibration_debug_state = _start_calibration_debug(
            calibration_debug,
            seed,
            source_frame_count,
            width,
            height,
        )

        chunk_limit = min(97, _align_4n1(max_chunk_frames))
        overlap = min(
            _align_4n1(overlap_frames),
            33,
            chunk_limit - _TAIL_GUARD_FRAMES - 4,
        )
        keep_targets = _plan_chunk_keep_targets(total_frames, chunk_limit, overlap)
        produced = 0
        chunk_index = 0
        previous_frames = None
        continuation_detail_reference_level = None
        continuation_detail_reference_summary = {
            "applied": False,
            "reason": "first_segment_not_generated",
        }
        appearance_reference = None
        fixed_character_color_reference = None
        fixed_character_color_reference_mask = None
        character_tone_reference = None
        character_tone_gains = {}
        character_low_frequency_reference = None
        character_low_frequency_controls = {}
        output = []
        chunks = []

        while produced < total_frames:
            has_previous = previous_frames is not None
            discard_head = overlap if has_previous else 0
            max_keep = chunk_limit - discard_head - _TAIL_GUARD_FRAMES
            if max_keep <= 0:
                raise RuntimeError("Wan Animate chunk has no room for output frames.")
            if chunk_index >= len(keep_targets):
                raise RuntimeError("Wan Animate chunk plan ended before the video.")
            keep_target = keep_targets[chunk_index]
            if keep_target <= 0 or keep_target > max_keep:
                raise RuntimeError("Wan Animate chunk plan contains an invalid frame count.")
            generate_length = _align_4n1(
                discard_head + keep_target + _TAIL_GUARD_FRAMES
            )
            generate_length = max(
                generate_length,
                min(_MIN_CHUNK_SAMPLE_FRAMES, chunk_limit),
            )
            generate_length = min(generate_length, chunk_limit)
            source_start = max(0, produced - discard_head)
            continuation_frames = (
                min(_WEAK_CONTINUE_MOTION_FRAMES, overlap) if has_previous else 0
            )
            continuation_detail_summary = {
                "enabled": bool(enable_continuation_normalization),
                "applied": False,
                "reason": "first_chunk",
            }
            if continuation_frames > 0:
                raw_continuation = previous_frames[:continuation_frames].contiguous()
                continuation_mask = _prepare_edit_mask(
                    character_mask,
                    source_start,
                    continuation_frames,
                    raw_continuation,
                )
                if enable_continuation_normalization:
                    continuation, continuation_detail_summary = (
                        _limit_continuation_detail_energy(
                            raw_continuation,
                            continuation_detail_reference_level,
                            continuation_mask,
                            continuation_detail_reference_summary.get("luma_center"),
                            continuation_detail_reference_summary.get("luma_spread"),
                        )
                    )
                    continuation_detail_summary["enabled"] = True
                else:
                    continuation = raw_continuation
                    continuation_detail_summary = {
                        "enabled": False,
                        "applied": False,
                        "reason": "disabled_by_node_switch",
                    }
                _calibration_debug_record_stage(
                    calibration_debug_state,
                    chunk_index,
                    "continue_source_pre_normalization",
                    raw_continuation,
                    continuation_mask,
                    source_start,
                )
                _calibration_debug_record_stage(
                    calibration_debug_state,
                    chunk_index,
                    "continue_motion_input",
                    continuation,
                    continuation_mask,
                    source_start,
                )
            else:
                continuation = None
            continuation_rgb_summary = {
                "used": continuation is not None,
                "source": (
                    "previous_segment_manual_color_adjusted_output"
                    if enable_manual_segment_color
                    else "previous_segment_pre_overlap_output"
                ),
                "source_stage": (
                    "after_manual_segment_adjustment_before_overlap"
                    if enable_manual_segment_color
                    else "segment_output_before_overlap"
                ),
                "source_start": int(source_start) if continuation is not None else None,
                "source_saturation_curve_applied": False,
                "pixel_transform": bool(continuation_detail_summary.get("applied")),
                "conditioning_normalization": continuation_detail_summary,
            }
            conditioning_offset = continuation_frames
            chunk_face_video = _slice_condition_window(
                face_video,
                source_start,
                generate_length,
                total_frames,
            )
            chunk_pose_video = _slice_condition_window(
                pose_video,
                source_start,
                generate_length,
                total_frames,
            )
            chunk_background_video = _slice_condition_window(
                background_video,
                source_start,
                generate_length,
                total_frames,
            )
            chunk_character_mask = _slice_condition_window(
                character_mask,
                source_start,
                generate_length,
                total_frames,
                repeat_single=True,
            )

            conditioned = _node_result(
                WanAnimateToVideo.execute(
                    positive=positive,
                    negative=negative,
                    vae=vae,
                    width=int(width),
                    height=int(height),
                    length=int(generate_length),
                    batch_size=1,
                    continue_motion_max_frames=int(_WEAK_CONTINUE_MOTION_FRAMES),
                    video_frame_offset=int(conditioning_offset),
                    reference_image=reference_image[:1],
                    clip_vision_output=clip_vision_output,
                    face_video=chunk_face_video,
                    pose_video=chunk_pose_video,
                    background_video=chunk_background_video,
                    character_mask=chunk_character_mask,
                    continue_motion=continuation,
                )
            )
            if len(conditioned) != 6:
                raise RuntimeError("WanAnimateToVideo returned an unexpected result.")
            chunk_positive, chunk_negative, latent, trim_latent, _trim_image, _next_offset = conditioned
            chunk_noise, noise_start, noise_length = _timeline_aligned_noise(
                latent,
                trim_latent,
                source_start,
                seed,
            )
            sampled = _sample(
                model,
                chunk_positive,
                chunk_negative,
                sampler,
                sigmas,
                latent,
                int(seed),
                cfg,
                noise=chunk_noise,
            )
            decoded = _decode(vae, _trim_latent(sampled, trim_latent))
            required_frames = discard_head + keep_target + _TAIL_GUARD_FRAMES
            if int(decoded.shape[0]) < required_frames:
                raise RuntimeError(
                    "Wan Animate chunk did not produce enough tail guard frames."
                )
            kept_end = discard_head + keep_target
            usable = decoded[:kept_end].contiguous()
            if int(usable.shape[0]) <= discard_head:
                raise RuntimeError("Wan Animate chunk produced no usable frames.")
            discard_tail = int(decoded.shape[0]) - kept_end

            edit_mask = _prepare_edit_mask(
                character_mask,
                source_start,
                int(usable.shape[0]),
                usable,
            )
            _calibration_debug_write_effective_mask(
                calibration_debug_state,
                edit_mask,
            )
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "raw_decoded",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            raw_appearance_windows = _measure_character_appearance_windows(
                usable,
                edit_mask,
            )
            original_frames = _prepare_reference_frames(
                driving_video,
                source_start,
                int(usable.shape[0]),
                usable,
            )
            if enable_background_calibration:
                usable, calibration_summary = _calibrate_to_original_background(
                    usable,
                    original_frames,
                    edit_mask,
                )
                calibration_summary["enabled"] = True
            else:
                calibration_summary = {
                    "enabled": False,
                    "applied": False,
                    "reason": "disabled_by_node_switch",
                }
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "background_calibrated",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            color_reference_frames = min(
                _CHARACTER_COLOR_REFERENCE_FRAMES,
                int(usable.shape[0]),
            )
            if not enable_character_color_calibration:
                character_color_summary = {
                    "enabled": False,
                    "applied": False,
                    "reason": "disabled_by_node_switch",
                    "reference_source": None,
                }
            else:
                if discard_head > 0:
                    previous_color_reference = fixed_character_color_reference
                    previous_color_reference_mask = fixed_character_color_reference_mask
                    color_reference_source = "first_segment_head_fixed"
                else:
                    previous_color_reference = usable[:color_reference_frames].contiguous()
                    previous_color_reference_mask = (
                        edit_mask[:color_reference_frames].contiguous()
                        if isinstance(edit_mask, torch.Tensor)
                        else None
                    )
                    color_reference_source = "first_segment_head_initial"
                usable, character_color_summary = _calibrate_character_sequence_to_previous(
                    usable,
                    previous_color_reference,
                    edit_mask,
                    previous_color_reference_mask,
                )
                character_color_summary["enabled"] = True
                character_color_summary["reference_source"] = color_reference_source
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "character_color_calibrated",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            if not enable_character_tone_inverse:
                character_tone_summary = {
                    "enabled": False,
                    "applied": False,
                    "reason": "disabled_by_node_switch",
                    "reference_created": False,
                    "passed_to_continue_motion": False,
                }
            elif character_tone_reference is None:
                tone_reference_frames = min(
                    _CHARACTER_TONE_REFERENCE_FRAMES,
                    int(usable.shape[0]),
                )
                character_tone_reference = _measure_character_tone_reference(
                    usable[:tone_reference_frames].contiguous(),
                    original_frames[:tone_reference_frames].contiguous(),
                    (
                        edit_mask[:tone_reference_frames].contiguous()
                        if isinstance(edit_mask, torch.Tensor)
                        else None
                    ),
                )
                character_tone_summary = {
                    "enabled": True,
                    "applied": False,
                    "reason": "first_segment_reference",
                    "reference_created": bool(
                        character_tone_reference.get("applied")
                    ),
                    "passed_to_continue_motion": True,
                }
            else:
                (
                    usable,
                    character_tone_summary,
                    character_tone_gains,
                ) = _apply_character_tone_inverse(
                    usable,
                    original_frames,
                    edit_mask,
                    character_tone_reference,
                    character_tone_gains,
                )
                character_tone_summary["enabled"] = True
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "character_tone_inverse",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            if not enable_character_low_frequency_residual:
                character_low_frequency_summary = {
                    "enabled": False,
                    "applied": False,
                    "reason": "disabled_by_node_switch",
                    "reference_created": False,
                    "passed_to_continue_motion": False,
                }
            elif character_low_frequency_reference is None:
                low_frequency_reference_frames = min(
                    _CHARACTER_TONE_REFERENCE_FRAMES,
                    int(usable.shape[0]),
                )
                character_low_frequency_reference = (
                    _measure_character_low_frequency_reference(
                        usable[:low_frequency_reference_frames].contiguous(),
                        original_frames[:low_frequency_reference_frames].contiguous(),
                        (
                            edit_mask[:low_frequency_reference_frames].contiguous()
                            if isinstance(edit_mask, torch.Tensor)
                            else None
                        ),
                    )
                )
                character_low_frequency_summary = {
                    "enabled": True,
                    "applied": False,
                    "reason": "first_segment_reference",
                    "reference_created": bool(
                        character_low_frequency_reference.get("applied")
                    ),
                    "passed_to_continue_motion": True,
                }
            else:
                (
                    usable,
                    character_low_frequency_summary,
                    character_low_frequency_controls,
                ) = _apply_character_low_frequency_residual(
                    usable,
                    original_frames,
                    edit_mask,
                    character_low_frequency_reference,
                    character_low_frequency_controls,
                )
                character_low_frequency_summary["enabled"] = True
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "character_low_frequency_residual",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            character_saturation_summary = {
                "enabled": False,
                "applied": False,
                "reason": "disabled_after_usertest_purple_lip_regression",
                "scope": "existing_character_mask",
                "passed_to_continue_motion": False,
            }
            if not enable_manual_segment_color:
                manual_segment_color_summary = {
                    "enabled": False,
                    "scope": "existing_character_mask",
                    "contrast": float(segment_contrast),
                    "saturation": float(segment_saturation),
                    "contrast_pivot": 0.5,
                    "color_space": "ycbcr",
                    "saturation_transform": "smoothstep_chroma_radius_weighted_gain",
                    "saturation_curve_end": _MANUAL_SATURATION_CURVE_END,
                    "visible_output_applied": False,
                    "passed_to_continue_motion": False,
                    "applied": False,
                    "reason": "disabled_by_node_switch",
                    "first_segment_enabled": False,
                    "later_segments_enabled": False,
                }
            elif chunk_index == 0:
                manual_segment_color_summary = {
                    "enabled": True,
                    "scope": "existing_character_mask",
                    "contrast": float(segment_contrast),
                    "saturation": float(segment_saturation),
                    "contrast_pivot": 0.5,
                    "color_space": "ycbcr",
                    "saturation_transform": "smoothstep_chroma_radius_weighted_gain",
                    "saturation_curve_end": _MANUAL_SATURATION_CURVE_END,
                    "visible_output_applied": False,
                    "passed_to_continue_motion": False,
                    "applied": False,
                    "reason": "first_segment_identity",
                    "first_segment_enabled": False,
                    "later_segments_enabled": True,
                }
            else:
                usable, manual_segment_color_summary = (
                    _apply_manual_segment_output_color(
                        usable,
                        edit_mask,
                        segment_contrast,
                        segment_saturation,
                    )
                )
                manual_segment_color_summary.update(
                    {
                        "first_segment_enabled": False,
                        "later_segments_enabled": True,
                    }
                )
            continuation_source_usable = usable.clone().contiguous()
            continuation_rgb_summary["segment_output_manual_color_adjustment"] = (
                manual_segment_color_summary
            )
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "segment_output_manual_color_adjusted",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )

            blend_frames = 0
            overlap_color_summary = {
                "enabled": bool(enable_overlap_color_calibration),
                "applied": False,
                "reason": "first_chunk",
            }
            if discard_head > 0:
                previous_overlap = _output_tail(output, discard_head)
                if enable_overlap_color_calibration:
                    usable, overlap_color_summary = _calibrate_to_previous_overlap(
                        usable,
                        previous_overlap,
                        edit_mask,
                        discard_head,
                    )
                    overlap_color_summary["enabled"] = True
                else:
                    overlap_color_summary = {
                        "enabled": False,
                        "applied": False,
                        "reason": "disabled_by_node_switch",
                    }
                blend_frames = _blend_output_overlap(output, usable[:discard_head].contiguous())
            _calibration_debug_record_stage(
                calibration_debug_state,
                chunk_index,
                "overlap_calibrated_preblend",
                usable,
                edit_mask,
                source_start,
                discard_head,
            )
            final_appearance_windows = _measure_character_appearance_windows(
                usable,
                edit_mask,
            )
            if appearance_reference is None:
                appearance_reference = dict(final_appearance_windows["head"])
            appearance_drift_summary = {
                "reference": "first_segment_final_head",
                "raw_decoded": _attach_appearance_reference(
                    raw_appearance_windows,
                    appearance_reference,
                ),
                "final": _attach_appearance_reference(
                    final_appearance_windows,
                    appearance_reference,
                ),
            }
            raw_tail_change = appearance_drift_summary["raw_decoded"]["tail"].get(
                "vs_first_segment_head",
                {},
            )
            measured_raw_chroma_ratio = (
                float(raw_tail_change["chroma_spread_ratio"])
                if raw_tail_change.get("applied")
                and raw_tail_change.get("chroma_spread_ratio") is not None
                else None
            )
            character_saturation_summary["observed_raw_tail_chroma_ratio"] = (
                measured_raw_chroma_ratio
            )
            kept = usable[discard_head:kept_end].contiguous()
            continuation_source_kept = continuation_source_usable[
                discard_head:kept_end
            ].contiguous()

            output.append(kept)
            produced += int(kept.shape[0])
            if chunk_index == 0 and enable_character_color_calibration:
                fixed_character_color_reference = usable[
                    :color_reference_frames
                ].contiguous()
                fixed_character_color_reference_mask = (
                    edit_mask[:color_reference_frames].contiguous()
                    if isinstance(edit_mask, torch.Tensor)
                    else None
                )
            if chunk_index == 0:
                if enable_continuation_normalization:
                    reference_frame_count = min(
                        _CONTINUATION_DETAIL_REFERENCE_FRAMES,
                        int(output[0].shape[0]),
                    )
                    detail_reference_frames = output[0][:reference_frame_count].contiguous()
                    detail_reference_mask = _prepare_edit_mask(
                        character_mask,
                        0,
                        reference_frame_count,
                        detail_reference_frames,
                    )
                    (
                        continuation_detail_reference_level,
                        continuation_detail_reference_summary,
                    ) = _measure_continuation_detail_reference(
                        detail_reference_frames,
                        detail_reference_mask,
                    )
                    continuation_detail_reference_summary["enabled"] = True
                    continuation_detail_reference_summary["reference_frames"] = int(
                        reference_frame_count
                    )
                    continuation_detail_reference_summary["reference"] = "first_segment_head"
                    continuation_rgb_summary["detail_reference"] = (
                        continuation_detail_reference_summary
                    )
                else:
                    continuation_detail_reference_summary = {
                        "enabled": False,
                        "applied": False,
                        "reason": "disabled_by_node_switch",
                    }
            previous_frames = continuation_source_kept[-overlap:].contiguous()
            chunks.append(
                {
                    "chunk": chunk_index,
                    "generate_length": int(generate_length),
                    "discard": int(discard_head),
                    "discard_tail": int(discard_tail),
                    "kept": int(kept.shape[0]),
                    "produced": int(produced),
                    "source_start": int(source_start),
                    "next_offset": int(source_start + generate_length),
                    "blend_frames": int(blend_frames),
                    "continue_motion_frames": int(continuation_frames),
                    "continuation_rgb": continuation_rgb_summary,
                    "global_noise_start": int(noise_start),
                    "global_noise_length": int(noise_length),
                    "background_calibration": calibration_summary,
                    "character_color_calibration": character_color_summary,
                    "character_tone_inverse": character_tone_summary,
                    "character_low_frequency_residual": character_low_frequency_summary,
                    "character_saturation_control": character_saturation_summary,
                    "overlap_color_calibration": overlap_color_summary,
                    "appearance_drift": appearance_drift_summary,
                }
            )
            chunk_index += 1

        output_frame_count = source_frame_count if preserve_input_frame_count else total_frames
        frames = torch.cat(output, dim=0)[:output_frame_count].contiguous()
        final_start = 0
        for chunk in chunks:
            final_end = min(output_frame_count, int(chunk["produced"]))
            if final_end <= final_start:
                continue
            final_chunk = frames[final_start:final_end].contiguous()
            final_mask = _prepare_edit_mask(
                character_mask,
                final_start,
                int(final_chunk.shape[0]),
                final_chunk,
            )
            _calibration_debug_record_stage(
                calibration_debug_state,
                int(chunk["chunk"]),
                "final_output",
                final_chunk,
                final_mask,
                final_start,
            )
            final_start = final_end

        summary_payload = {
                "total_frames": output_frame_count,
                "sampling_frame_count": total_frames,
                "preserve_input_frame_count": bool(preserve_input_frame_count),
                "width": int(width),
                "height": int(height),
                "max_chunk_frames": chunk_limit,
                "overlap_frames": overlap,
                "tail_guard_frames": _TAIL_GUARD_FRAMES,
                "minimum_chunk_sample_frames": min(
                    _MIN_CHUNK_SAMPLE_FRAMES,
                    chunk_limit,
                ),
                "seed_strategy": "global_timeline_aligned_noise",
                "continue_motion_strategy": (
                    "previous_generated_conditioning_normalized_rgb"
                    if enable_continuation_normalization
                    else "previous_generated_rgb"
                ),
                "continue_motion_frames": _WEAK_CONTINUE_MOTION_FRAMES,
                "color_correction_switches": {
                    "enable_continuation_normalization": bool(enable_continuation_normalization),
                    "enable_background_calibration": bool(enable_background_calibration),
                    "enable_character_color_calibration": bool(enable_character_color_calibration),
                    "enable_character_tone_inverse": bool(enable_character_tone_inverse),
                    "enable_character_low_frequency_residual": bool(enable_character_low_frequency_residual),
                    "enable_manual_segment_color": bool(enable_manual_segment_color),
                    "enable_overlap_color_calibration": bool(enable_overlap_color_calibration),
                    "native_color_path": not any(
                        (
                            enable_continuation_normalization,
                            enable_background_calibration,
                            enable_character_color_calibration,
                            enable_character_tone_inverse,
                            enable_character_low_frequency_residual,
                            enable_manual_segment_color,
                            enable_overlap_color_calibration,
                        )
                    ),
                    "overlap_blending_preserved": True,
                },
                "continuation_rgb": {
                    "enabled": True,
                    "normalization_enabled": bool(enable_continuation_normalization),
                    "source": (
                        "previous_segment_manual_color_adjusted_output"
                        if enable_manual_segment_color
                        else "previous_segment_pre_overlap_output"
                    ),
                    "source_stage": (
                        "after_manual_segment_adjustment_before_overlap"
                        if enable_manual_segment_color
                        else "segment_output_before_overlap"
                    ),
                    "applies_to": (
                        "time_aligned_generated_overlap_after_conditioning_normalization"
                        if enable_continuation_normalization
                        else "time_aligned_generated_overlap_native_rgb"
                    ),
                    "conditioning_only": True,
                    "detail_reference": (
                        "first_segment_head"
                        if enable_continuation_normalization
                        else None
                    ),
                    "detail_reference_frames": _CONTINUATION_DETAIL_REFERENCE_FRAMES,
                    "detail_reference_summary": continuation_detail_reference_summary,
                    "detail_radius": _CONTINUATION_DETAIL_RADIUS,
                    "detail_quantile": _CONTINUATION_DETAIL_QUANTILE,
                    "detail_target_ratio": _CONTINUATION_DETAIL_TARGET_RATIO,
                    "detail_trigger_ratio": _CONTINUATION_DETAIL_TRIGGER_RATIO,
                    "min_detail_gain": _CONTINUATION_DETAIL_MIN_GAIN,
                    "luma_alignment_strength": _CONTINUATION_LUMA_ALIGNMENT_STRENGTH,
                    "min_luma_scale": _CONTINUATION_LUMA_MIN_SCALE,
                    "max_luma_scale": _CONTINUATION_LUMA_MAX_SCALE,
                    "max_luma_shift": _CONTINUATION_LUMA_MAX_SHIFT,
                    "aligns_low_frequency_luma": bool(enable_continuation_normalization),
                    "luma_alignment_scales_high_frequency_luma": False,
                    "preserves_in_range_high_frequency_luma": True,
                    "detail_policy": "first_segment_reference_ceiling_only",
                    "preserves_chroma": True,
                    "manual_segment_output_adjustment": {
                        "enabled": bool(enable_manual_segment_color),
                        "scope": "existing_character_mask",
                        "contrast": float(segment_contrast),
                        "saturation": float(segment_saturation),
                        "contrast_pivot": 0.5,
                        "color_space": "ycbcr",
                        "saturation_transform": "smoothstep_chroma_radius_weighted_gain",
                        "saturation_curve_end": _MANUAL_SATURATION_CURVE_END,
                        "visible_output_applied": bool(enable_manual_segment_color),
                        "passed_to_continue_motion": bool(enable_manual_segment_color),
                        "first_segment_enabled": False,
                        "later_segments_enabled": bool(enable_manual_segment_color),
                    },
                },
                "character_tone_inverse": {
                    "enabled": bool(enable_character_tone_inverse),
                    "scope": "existing_character_mask",
                    "reference": "first_segment_head_relative_to_time_aligned_original",
                    "reference_frames": _CHARACTER_TONE_REFERENCE_FRAMES,
                    "reference_summary": character_tone_reference,
                    "bands": {
                        "fine": _CHARACTER_TONE_FINE_RADIUS,
                        "mid": _CHARACTER_TONE_MID_RADIUS,
                        "broad": _CHARACTER_TONE_BROAD_RADIUS,
                    },
                    "knee_quantile": _CHARACTER_TONE_KNEE_QUANTILE,
                    "limit_quantile": _CHARACTER_TONE_LIMIT_QUANTILE,
                    "trigger_ratio": _CHARACTER_TONE_TRIGGER_RATIO,
                    "min_gains": {
                        "fine": _CHARACTER_TONE_FINE_MIN_GAIN,
                        "mid": _CHARACTER_TONE_MID_MIN_GAIN,
                        "broad": _CHARACTER_TONE_BROAD_MIN_GAIN,
                    },
                    "target_original_ratio_range": [
                        _CHARACTER_TONE_TARGET_MIN_RATIO,
                        _CHARACTER_TONE_TARGET_MAX_RATIO,
                    ],
                    "temporal_alpha": _CHARACTER_TONE_TEMPORAL_ALPHA,
                    "statistics_frames": _CHARACTER_TONE_STATISTICS_FRAMES,
                    "process_batch_frames": _CHARACTER_TONE_PROCESS_BATCH_FRAMES,
                    "positive_and_negative_controlled_separately": True,
                    "preserves_scene_base": True,
                    "preserves_chroma": True,
                    "passed_to_continue_motion": bool(enable_character_tone_inverse),
                },
                "character_low_frequency_residual": {
                    "enabled": bool(enable_character_low_frequency_residual),
                    "scope": "existing_character_mask",
                    "reference": "first_segment_head_generated_minus_time_aligned_original",
                    "reference_frames": _CHARACTER_TONE_REFERENCE_FRAMES,
                    "reference_summary": character_low_frequency_reference,
                    "band": "blur32_minus_blur96",
                    "inner_radius": _CHARACTER_LOW_FREQUENCY_INNER_RADIUS,
                    "outer_radius": _CHARACTER_LOW_FREQUENCY_OUTER_RADIUS,
                    "trigger_ratio": _CHARACTER_LOW_FREQUENCY_TRIGGER_RATIO,
                    "minimum_gain": _CHARACTER_LOW_FREQUENCY_MIN_GAIN,
                    "center_trigger": _CHARACTER_LOW_FREQUENCY_CENTER_TRIGGER,
                    "maximum_center_shift": _CHARACTER_LOW_FREQUENCY_MAX_CENTER_SHIFT,
                    "maximum_pixel_correction": _CHARACTER_LOW_FREQUENCY_MAX_PIXEL_CORRECTION,
                    "temporal_alpha": _CHARACTER_LOW_FREQUENCY_TEMPORAL_ALPHA,
                    "preserves_chroma": True,
                    "preserves_scene_outer_base": True,
                    "passed_to_continue_motion": bool(enable_character_low_frequency_residual),
                },
                "character_saturation_control": {
                    "enabled": False,
                    "mode": "disabled",
                    "reason": "usertest_purple_lip_regression",
                    "measurement": "raw_decoded_tail_chroma_p75_vs_first_segment_head_for_report_only",
                    "scope": "existing_character_mask",
                    "passed_to_continue_motion": False,
                    "manual_segment_controls_preserved": bool(enable_manual_segment_color),
                },
                "appearance_drift": {
                    "enabled": True,
                    "reference": "first_segment_final_head",
                    "windows": "first_and_last_five_frames_per_chunk",
                    "stages": ["raw_decoded", "final"],
                    "metrics": [
                        "luma_center_delta",
                        "luma_spread_ratio",
                        "detail_ratio",
                        "detail_p99_ratio",
                        "detail_positive_p99_ratio",
                        "detail_negative_p99_ratio",
                        "chroma_center_distance",
                        "chroma_spread_ratio",
                        "chroma_radius_p95_ratio",
                        "chroma_radius_p99_ratio",
                        "local_block_luma_std_p90_ratio",
                        "local_block_detail_mean_p90_ratio",
                        "local_block_chroma_std_p90_ratio",
                    ],
                    "local_block_size": _APPEARANCE_LOCAL_BLOCK_SIZE,
                    "local_block_quantile": _APPEARANCE_LOCAL_BLOCK_QUANTILE,
                    "local_block_minimum_mask_coverage": _APPEARANCE_LOCAL_BLOCK_MIN_MASK_COVERAGE,
                },
                "character_color_calibration": {
                    "enabled": bool(enable_character_color_calibration),
                    "timing": "after_decode_before_overlap",
                    "applies_to": "every_frame_inside_character_mask",
                    "reference": "fixed_first_segment_head",
                    "first_segment_reference": "first_segment_head_initial",
                    "reference_frames": _CHARACTER_COLOR_REFERENCE_FRAMES,
                    "statistics": "chroma_only_ycbcr_robust_framewise",
                    "strength": _CHARACTER_COLOR_STRENGTH,
                    "temporal_alpha": _CHARACTER_COLOR_TEMPORAL_ALPHA,
                    "luma_correction_enabled": _CHARACTER_LUMA_CORRECTION_ENABLED,
                    "min_luma_scale": _CHARACTER_COLOR_MIN_LUMA_SCALE,
                    "max_luma_scale": _CHARACTER_COLOR_MAX_LUMA_SCALE,
                    "max_luma_shift": _CHARACTER_COLOR_MAX_LUMA_SHIFT,
                    "min_chroma_scale": _CHARACTER_COLOR_MIN_CHROMA_SCALE,
                    "max_chroma_scale": _CHARACTER_COLOR_MAX_CHROMA_SCALE,
                    "max_chroma_shift": _CHARACTER_COLOR_MAX_CHROMA_SHIFT,
                    "detail_radius": _CHARACTER_COLOR_DETAIL_RADIUS,
                    "preserves_all_luma": not _CHARACTER_LUMA_CORRECTION_ENABLED,
                    "preserves_high_frequency_luma": True,
                    "preserves_high_frequency_chroma_structure": True,
                    "high_frequency_chroma_scale": "same_as_low_frequency_chroma",
                    "color_feedback": "fixed_first_segment_head_only",
                },
                "background_calibration": {
                    "enabled": bool(enable_background_calibration),
                    "reference": "time_aligned_driving_video_outside_character_mask",
                    "applies_to": "whole_chunk",
                    "pixel_compositing": False,
                    "strength": _BACKGROUND_CALIBRATION_STRENGTH,
                    "max_luma_scale": _BACKGROUND_CALIBRATION_MAX_LUMA_SCALE,
                    "max_luma_shift": _BACKGROUND_CALIBRATION_MAX_LUMA_SHIFT,
                    "max_chroma_shift": _BACKGROUND_CALIBRATION_MAX_CHROMA_SHIFT,
                },
                "overlap_color_calibration": {
                    "enabled": bool(enable_overlap_color_calibration),
                    "reference": "previous_generated_overlap",
                    "preferred_scope": "character_mask",
                    "fallback_scope": "whole_frame",
                    "preserves_overlap_blending": True,
                    "strength": _OVERLAP_COLOR_CALIBRATION_STRENGTH,
                    "max_luma_scale": _OVERLAP_COLOR_MAX_LUMA_SCALE,
                    "max_luma_shift": _OVERLAP_COLOR_MAX_LUMA_SHIFT,
                    "min_chroma_scale": _OVERLAP_COLOR_MIN_CHROMA_SCALE,
                    "max_chroma_scale": _OVERLAP_COLOR_MAX_CHROMA_SCALE,
                    "max_chroma_shift": _OVERLAP_COLOR_MAX_CHROMA_SHIFT,
                    "reference_tail_frames": _OVERLAP_COLOR_REFERENCE_TAIL_FRAMES,
                    "fade_frames": _OVERLAP_COLOR_FADE_FRAMES,
                    "applies_to": "overlap_and_short_fade",
                },
                "chunks": chunks,
            }
        _finish_calibration_debug(calibration_debug_state, summary_payload)
        summary = json.dumps(
            summary_payload,
            ensure_ascii=False,
        )
        return frames, summary


NODE_CLASS_MAPPINGS = {
    "SimpAIWanAnimateLoop": SimpAIWanAnimateLoop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIWanAnimateLoop": "SimpAI Wan Animate Loop",
}
