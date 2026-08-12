import math

import torch
import torch.nn.functional as F


def _resize_bhwc(image, height, width):
    if image.shape[1:3] == (height, width):
        return image
    mode = "area" if height <= image.shape[1] and width <= image.shape[2] else "bilinear"
    channels_first = image.movedim(-1, 1)
    if mode == "area":
        resized = F.interpolate(channels_first, size=(height, width), mode=mode)
    else:
        resized = F.interpolate(channels_first, size=(height, width), mode=mode, align_corners=False)
    return resized.movedim(1, -1)


def _analysis_size(height, width, limit):
    scale = min(1.0, float(limit) / max(height, width))
    return max(16, round(height * scale)), max(16, round(width * scale))


def _fit_channel_affine(edited, reference, sample_fraction, iterations=6):
    valid = torch.isfinite(edited).all(dim=1) & torch.isfinite(reference).all(dim=1)
    if not valid.all():
        raise ValueError("Auto-Protected Color Match requires finite RGB values.")
    if edited.shape[0] < 16:
        raise ValueError("Auto-Protected Color Match requires at least 16 valid pixels.")

    sample_count = min(edited.shape[0], max(128, round(edited.shape[0] * sample_fraction)))
    residual = (edited - reference).square().mean(dim=1)
    coefficients = edited.new_tensor([[1.0, 0.0], [1.0, 0.0], [1.0, 0.0]])
    selected = torch.topk(residual, sample_count, largest=False, sorted=False).indices

    for _ in range(iterations):
        selected_edited = edited[selected].transpose(0, 1)
        selected_reference = reference[selected].transpose(0, 1).unsqueeze(-1)
        design = torch.stack((selected_edited, torch.ones_like(selected_edited)), dim=2)
        design_t = design.transpose(1, 2)
        gram = design_t @ design
        rhs = design_t @ selected_reference

        ridge_strength = max(1.0, sample_count * 1e-4)
        regularizer = torch.eye(2, device=edited.device, dtype=edited.dtype).expand(3, -1, -1).clone()
        regularizer[:, 0, 0] *= ridge_strength
        regularizer[:, 1, 1] *= ridge_strength * 0.1
        identity = edited.new_tensor([1.0, 0.0]).view(1, 2, 1).expand(3, -1, -1)
        coefficients = torch.linalg.solve(gram + regularizer, rhs + regularizer @ identity).squeeze(-1)
        coefficients[:, 0].clamp_(0.5, 2.0)
        coefficients[:, 1].clamp_(-0.25, 0.25)

        corrected = edited * coefficients[:, 0] + coefficients[:, 1]
        residual = (corrected - reference).square().mean(dim=1)
        selected = torch.topk(residual, sample_count, largest=False, sorted=False).indices

    return coefficients, residual, selected


def _change_mask(residual, selected, height, width, output_height, output_width, sensitivity, expand):
    error = residual.sqrt()
    inlier_error = error[selected]
    median = inlier_error.median()
    deviation = (inlier_error - median).abs().median() * 1.4826
    threshold = torch.maximum(torch.quantile(inlier_error, 0.95), median + sensitivity * deviation)
    threshold = threshold.clamp_min(3.0 / 255.0)

    mask = (error.reshape(1, 1, height, width) > threshold).to(error.dtype)
    if expand > 0:
        scaled_radius = max(1, math.ceil(expand * max(height / output_height, width / output_width)))
        mask = F.max_pool2d(mask, kernel_size=scaled_radius * 2 + 1, stride=1, padding=scaled_radius)
    mask = F.avg_pool2d(mask, kernel_size=5, stride=1, padding=2, count_include_pad=False)
    return F.interpolate(mask, size=(output_height, output_width), mode="bilinear", align_corners=False)[:, 0]


def _match_confidence(edited, reference, coefficients, height, width, sample_fraction):
    corrected = edited * coefficients[:, 0] + coefficients[:, 1]
    error = (corrected - reference).square().mean(dim=1).sqrt()
    stable = (error.reshape(1, 1, height, width) < 0.06).to(error.dtype)
    stable_fraction = stable.mean()
    required_fraction = max(0.20, min(0.35, sample_fraction))
    fraction_score = (stable_fraction / required_fraction).clamp(0.0, 1.0)

    tile_density = F.adaptive_avg_pool2d(stable, (4, 4))
    coverage_score = (tile_density / 0.20).clamp(0.0, 1.0).mean()

    raw_error = (edited - reference).square().mean(dim=1).sqrt()
    sample_count = min(edited.shape[0], max(128, round(edited.shape[0] * sample_fraction)))
    selected = torch.topk(error, sample_count, largest=False, sorted=False).indices
    before = raw_error[selected].mean()
    after = error[selected].mean()
    improvement_score = ((before - after) / (before * 0.5 + 1e-6)).clamp(0.0, 1.0)

    confidence = 0.5 * fraction_score + 0.3 * coverage_score + 0.2 * improvement_score
    return float(confidence.clamp(0.0, 1.0).item())


class SimpAIAutoProtectedColorMatch:
    DESCRIPTION = (
        "Uses low-change regions shared by the original and edited images to correct global color drift "
        "without treating the intended edit as a color reference."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "reference_image": ("IMAGE", {"tooltip": "Original image before editing"}),
                "edited_image": ("IMAGE", {"tooltip": "Image produced by the editing model"}),
                "strength": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.5, "step": 0.05,
                    "tooltip": "1.0 is the fitted correction; values above 1.0 extrapolate it",
                }),
                "sample_fraction": ("FLOAT", {
                    "default": 0.35, "min": 0.05, "max": 0.80, "step": 0.05,
                    "tooltip": "Fraction of the lowest-change pixels used for fitting",
                }),
                "analysis_size": ("INT", {
                    "default": 512, "min": 64, "max": 2048, "step": 64,
                    "tooltip": "Maximum analysis width or height",
                }),
                "mask_sensitivity": ("FLOAT", {
                    "default": 3.0, "min": 1.0, "max": 8.0, "step": 0.5,
                    "tooltip": "Higher values mark only clearer edits",
                }),
                "mask_expand": ("INT", {
                    "default": 8, "min": 0, "max": 128, "step": 1,
                    "tooltip": "Expansion radius of the diagnostic edit mask",
                }),
                "confidence_threshold": ("FLOAT", {
                    "default": 0.55, "min": 0.0, "max": 1.0, "step": 0.05,
                    "tooltip": "Below this confidence the correction is bypassed; 0 disables the check",
                }),
            },
            "optional": {
                "lock_batch_parameters": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Fit once from the first frame and reuse the same correction for the full batch",
                }),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "FLOAT", "BOOLEAN")
    RETURN_NAMES = ("corrected", "edit mask", "confidence", "active")
    FUNCTION = "match"
    CATEGORY = "SimpAI/image"

    def match(
        self, reference_image, edited_image, strength, sample_fraction, analysis_size,
        mask_sensitivity, mask_expand, confidence_threshold, lock_batch_parameters=False,
    ):
        if reference_image.ndim != 4 or edited_image.ndim != 4:
            raise ValueError("Auto-Protected Color Match expects IMAGE tensors in BHWC format.")
        if reference_image.shape[-1] < 3 or edited_image.shape[-1] < 3:
            raise ValueError("Auto-Protected Color Match requires RGB images.")
        if reference_image.shape[0] not in (1, edited_image.shape[0]):
            raise ValueError("Use one reference image or a reference batch matching the edited batch.")

        if reference_image.shape[0] == 1 and edited_image.shape[0] > 1:
            reference_image = reference_image.expand(edited_image.shape[0], -1, -1, -1)

        output = []
        masks = []
        confidences = []
        active = []
        output_height, output_width = edited_image.shape[1:3]
        analysis_height, analysis_width = _analysis_size(output_height, output_width, analysis_size)

        if lock_batch_parameters and edited_image.shape[0] > 1:
            reference = reference_image[0:1].to(device=edited_image.device, dtype=torch.float32)
            edited = edited_image[0:1].to(dtype=torch.float32)
            reference = _resize_bhwc(reference, output_height, output_width)
            reference_analysis = _resize_bhwc(reference, analysis_height, analysis_width)[..., :3]
            edited_analysis = _resize_bhwc(edited, analysis_height, analysis_width)[..., :3]

            reference_blurred = F.avg_pool2d(
                reference_analysis.movedim(-1, 1), kernel_size=5, stride=1, padding=2, count_include_pad=False
            ).movedim(1, -1)
            edited_blurred = F.avg_pool2d(
                edited_analysis.movedim(-1, 1), kernel_size=5, stride=1, padding=2, count_include_pad=False
            ).movedim(1, -1)
            coefficients, residual, selected = _fit_channel_affine(
                edited_blurred.reshape(-1, 3), reference_blurred.reshape(-1, 3), sample_fraction
            )
            confidence = _match_confidence(
                edited_analysis.reshape(-1, 3), reference_analysis.reshape(-1, 3), coefficients,
                analysis_height, analysis_width, sample_fraction,
            )
            correction_active = strength > 0.0 and confidence >= confidence_threshold

            corrected = edited_image.clone()
            if correction_active:
                gain = coefficients[:, 0].to(device=edited_image.device, dtype=edited_image.dtype)
                offset = coefficients[:, 1].to(device=edited_image.device, dtype=edited_image.dtype)
                corrected_rgb = edited_image[..., :3] * gain + offset
                corrected[..., :3] = (
                    edited_image[..., :3] + strength * (corrected_rgb - edited_image[..., :3])
                ).clamp(0.0, 1.0)

            mask = _change_mask(
                residual, selected, analysis_height, analysis_width, output_height, output_width,
                mask_sensitivity, mask_expand,
            )[0].to(device=edited_image.device, dtype=edited_image.dtype)
            masks = mask.unsqueeze(0).expand(edited_image.shape[0], -1, -1).clone()
            return corrected, masks, confidence, correction_active

        for reference, edited in zip(reference_image, edited_image):
            reference = reference.unsqueeze(0).to(device=edited.device, dtype=torch.float32)
            edited_analysis = edited.unsqueeze(0).to(dtype=torch.float32)
            reference = _resize_bhwc(reference, output_height, output_width)
            reference_analysis = _resize_bhwc(reference, analysis_height, analysis_width)[..., :3]
            edited_analysis = _resize_bhwc(edited_analysis, analysis_height, analysis_width)[..., :3]

            reference_blurred = F.avg_pool2d(
                reference_analysis.movedim(-1, 1), kernel_size=5, stride=1, padding=2, count_include_pad=False
            ).movedim(1, -1)
            edited_blurred = F.avg_pool2d(
                edited_analysis.movedim(-1, 1), kernel_size=5, stride=1, padding=2, count_include_pad=False
            ).movedim(1, -1)
            coefficients, residual, selected = _fit_channel_affine(
                edited_blurred.reshape(-1, 3), reference_blurred.reshape(-1, 3), sample_fraction
            )

            confidence = _match_confidence(
                edited_analysis.reshape(-1, 3), reference_analysis.reshape(-1, 3), coefficients,
                analysis_height, analysis_width, sample_fraction,
            )
            correction_active = strength > 0.0 and confidence >= confidence_threshold

            gain = coefficients[:, 0].to(device=edited.device, dtype=edited.dtype)
            offset = coefficients[:, 1].to(device=edited.device, dtype=edited.dtype)
            corrected_rgb = edited[..., :3] * gain + offset
            corrected_rgb = edited[..., :3] + strength * (corrected_rgb - edited[..., :3])
            corrected = edited.clone()
            if correction_active:
                corrected[..., :3] = corrected_rgb.clamp(0.0, 1.0)
            output.append(corrected)
            confidences.append(confidence)
            active.append(correction_active)
            masks.append(_change_mask(
                residual, selected, analysis_height, analysis_width, output_height, output_width,
                mask_sensitivity, mask_expand,
            )[0].to(device=edited.device, dtype=edited.dtype))

        return torch.stack(output), torch.stack(masks), min(confidences), all(active)


NODE_CLASS_MAPPINGS = {"SimpAIAutoProtectedColorMatch": SimpAIAutoProtectedColorMatch}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIAutoProtectedColorMatch": "SimpAI Auto-Protected Color Match"
}
