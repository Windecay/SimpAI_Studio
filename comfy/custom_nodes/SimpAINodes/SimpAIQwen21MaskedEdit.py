import logging
import math
import re

import cv2
import numpy as np
import torch

import comfy.utils


# Quoted output text must remain literal when normalizing image references.
_IMAGE_REFERENCE = re.compile(
    r'(?P<literal>"(?:\\.|[^"\\])*"|(?<![\w])\'(?:\\.|[^\'\\])*\'|'
    r'\u201c[^\u201d]*\u201d|\u2018[^\u2019]*\u2019|`[^`]*`)|'
    r'(?<![A-Za-z0-9_<])(?:<image[12]>|'
    r'(?:image|picture)\s*[12](?![A-Za-z0-9_])|'
    r'(?:the\s+)?(?:first|second)\s+(?:image|picture)\b|'
    r'\u56fe(?:\u7247|\u50cf)?\s*[12\u4e00\u4e8c](?![0-9])|'
    r'\u7b2c\s*[12\u4e00\u4e8c]\s*\u5f20\u56fe(?:\u7247|\u50cf)?)',
    re.IGNORECASE,
)


def normalize_image_references(instruction, user_image_count, multiple_images):
    prose = _IMAGE_REFERENCE.sub(lambda match: "" if match.group("literal") else match[0], instruction)
    chinese = bool(re.search(r"[\u3400-\u9fff]", prose))
    source = "<image1>" if multiple_images else ("\u56fe\u50cf" if chinese else "the image")

    def replace(match):
        if match.group("literal"):
            return match[0]
        number = re.search(r"[12\u4e00\u4e8c]|first|second", match[0], re.IGNORECASE)[0].lower()
        index = 1 if number in ("1", "\u4e00", "first") else 2
        if index > user_image_count:
            return match[0]
        return source if index == 1 else "<image2>"

    return _IMAGE_REFERENCE.sub(replace, instruction), source, chinese


class SimpAIQwen21MaskedEdit:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "operation": (["erase", "replace", "outfit_swap"],),
            },
            "optional": {
                "mask_image": ("IMAGE",),
                "reference_image": ("IMAGE",),
            },
        }

    RETURN_TYPES = ("STRING", "IMAGE", "IMAGE", "IMAGE")
    RETURN_NAMES = ("prompt", "image_2", "image_3", "sampling_mask_image")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/image"

    def prepare(self, image, prompt, operation, mask_image=None, reference_image=None):
        if image is None:
            raise ValueError("Qwen editing requires a source image.")
        if operation not in ("erase", "replace", "outfit_swap"):
            raise ValueError("Unsupported Qwen masked edit operation.")
        if operation == "outfit_swap" and reference_image is None:
            raise ValueError("Qwen outfit swap requires a clothing reference image.")

        # Canvas strokes may be green; the RGB maximum also preserves soft edges.
        visual_mask = sampling_mask = None
        if mask_image is not None:
            if mask_image.shape[1:3] != image.shape[1:3]:
                raise ValueError("Canvas image and painted mask must have the same size.")
            mask = mask_image[:1, :, :, :3].amax(dim=-1, keepdim=True).clamp(0, 1)
            if torch.any(mask > 0):
                visual_mask = (mask > 0).to(mask.dtype).expand(-1, -1, -1, 3)
                sampling_mask = mask.expand(-1, -1, -1, 3)

        instruction = str(prompt or "").strip()
        if operation == "outfit_swap":
            if not instruction:
                instruction = "Dress the person in <image1> in the outfit from <image2>. Replace everything they wear."
            instruction, _, chinese = normalize_image_references(instruction, 2, True)
            context = (
                "\u4ec5\u4ece<image2>\u53d6\u7528\u670d\u88c5\uff0c\u4e0d\u590d\u5236\u53c2\u8003\u56fe\u7684\u4eba\u7269\u6216\u80cc\u666f\u3002\u4fdd\u7559<image1>\u4e2d\u4eba\u7269\u7684\u8138\u90e8\u3001\u53d1\u578b\u3001\u53cc\u624b\u3001\u59ff\u52bf\u53ca\u539f\u6709\u80cc\u666f\u548c\u6784\u56fe\u3002" if chinese else
                "Use only the clothing from <image2>, not its person or background. "
                "Preserve the face, hair, hands, pose, background and framing of <image1>."
            )
            # Keep two visual references; return the canvas mask for sampling separately.
            return (f"{instruction}\n{context}", reference_image, None, sampling_mask)

        if visual_mask is None and not instruction:
            raise ValueError("Without a mask, describe the object to erase or replace.")
        reference = reference_image if operation == "replace" else None
        if operation == "replace" and reference is None and not instruction:
            raise ValueError("Describe the replacement or provide a reference image.")

        instruction, source, chinese = normalize_image_references(
            instruction, 2 if reference is not None else 1,
            reference is not None or visual_mask is not None,
        )

        # Lead with the user's action instead of repeating generic edit constraints.
        parts = [instruction] if instruction else []
        mask_tag = "<image3>" if reference is not None else "<image2>"
        if operation == "erase":
            target = "the specified object" if instruction else f"the content marked white in {mask_tag}"
            parts.append(
                f"\u4ece{source}\u4e2d\u79fb\u9664\u6307\u5b9a\u5bf9\u8c61\uff0c\u81ea\u7136\u91cd\u5efa\u80cc\u666f\u3002" if chinese else
                f"Remove {target} from {source} and reconstruct the background naturally."
            )
        elif not instruction:
            parts.append(
                f"Replace the content marked white in {mask_tag} of <image1> "
                "with the relevant object from <image2>."
            )
        parts.append(
            f"\u7f16\u8f91{source}\uff0c\u4fdd\u7559\u65e0\u5173\u5185\u5bb9\u3001\u6784\u56fe\u548c\u56fe\u50cf\u5c3a\u5bf8\u3002" if chinese else
            f"Edit {source}; preserve unrelated content, framing and image dimensions."
        )
        if reference is not None:
            parts.append(
                "\u4ece<image2>\u53d6\u7528\u5bf9\u5e94\u5bf9\u8c61\u4f5c\u4e3a\u66ff\u6362\u5185\u5bb9\uff0c\u4fdd\u7559\u5176\u5916\u89c2\uff0c\u5e76\u9002\u914d<image1>\u7684\u6bd4\u4f8b\u3001\u5149\u7167\u548c\u900f\u89c6\uff1b\u4e0d\u590d\u5236\u53c2\u8003\u56fe\u7684\u80cc\u666f\u3002" if chinese else
                "Take the replacement object from <image2>, preserving its appearance while adapting "
                "its scale, lighting and perspective to <image1>. Do not copy the reference background."
            )
        if visual_mask is not None:
            parts.append(
                f"{mask_tag}\u662f\u4e0e<image1>\u5bf9\u9f50\u7684\u9ed1\u767d\u533a\u57df\u56fe\uff1a\u4ec5\u7f16\u8f91\u767d\u8272\u533a\u57df\uff0c\u4fdd\u7559\u9ed1\u8272\u533a\u57df\u3002\u4e0d\u8981\u5728\u7ed3\u679c\u4e2d\u663e\u793a\u533a\u57df\u56fe\u3002" if chinese else
                f"{mask_tag} is a black-and-white spatial mask aligned with <image1>: "
                "edit its white area and preserve its black area. Do not render the mask."
            )

        # Append the internal mask after user images so their labels stay stable.
        second = reference if reference is not None else visual_mask
        third = visual_mask if reference is not None else None
        return ("\n".join(parts), second, third, sampling_mask)


class SimpAIQwen21ErasePrepare:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "width": ("INT", {"default": 1024, "min": 32, "max": 32768, "step": 32}),
                "height": ("INT", {"default": 1024, "min": 32, "max": 32768, "step": 32}),
            },
            "optional": {"mask_image": ("IMAGE",)},
        }

    RETURN_TYPES = ("STRING", "IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("prompt", "marked_image", "original_image", "blend_mask")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/image"

    def prepare(self, image, prompt, width, height, mask_image=None):
        if image is None:
            raise ValueError("Qwen erasing requires a source image.")
        if image.shape[-1] not in (3, 4):
            raise ValueError("Qwen erasing requires an RGB or RGBA source image.")
        if width < 32 or height < 32 or width % 32 or height % 32:
            raise ValueError("Qwen erase output dimensions must be positive multiples of 32.")
        source = image[:1]
        mask = torch.zeros(source.shape[:3], dtype=source.dtype, device=source.device)
        if mask_image is not None:
            if mask_image.shape[1:3] != source.shape[1:3]:
                raise ValueError("Canvas image and painted mask must have the same size.")
            mask = mask_image[:1, :, :, :3].amax(dim=-1).to(source).clamp(0, 1)
        if source.shape[1:3] != (height, width):
            # Both use full-frame coordinates, including when the aspect ratio changes.
            source = comfy.utils.common_upscale(
                source.movedim(-1, 1), width, height, "lanczos", "disabled"
            ).movedim(1, -1)
            mask = comfy.utils.common_upscale(
                mask.unsqueeze(1), width, height, "nearest-exact", "disabled"
            )[:, 0]

        instruction, _, chinese = normalize_image_references(str(prompt or "").strip(), 1, False)
        if not torch.any(mask > 0):
            if not instruction:
                raise ValueError("Without a mask, describe the object to erase.")
            return (instruction, source, source, mask)

        guidance = (
            "移除红色涂抹区域下的所有物体及其阴影，用周围背景自然填充该区域，保持纹理、透视和光照连续。"
            "清除红色标记，保留标记区域之外的所有内容。输出完整、不透明的图像。" if chinese else
            "Remove all objects and their shadows underneath the red painted region. "
            "Reconstruct the marked region using the surrounding background, with continuous texture, perspective and lighting. "
            "Completely remove the red marking. Preserve everything outside the marked region. "
            "Return a complete, fully opaque image."
        )
        instruction = f"{instruction}\n{guidance}" if instruction else guidance
        rgb = source[..., :3]
        if source.shape[-1] == 4:
            rgb = rgb * source[..., 3:4] + (1 - source[..., 3:4])
        # Even soft strokes use opaque guidance; their weights remain in the blend mask.
        marked = torch.where((mask > 0).unsqueeze(-1), rgb.new_tensor([1, 0, 0]), rgb)
        mask_array = mask[0].detach().float().cpu().numpy()
        grown = cv2.dilate(mask_array, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
        blurred = cv2.GaussianBlur(grown, (25, 25), 4, borderType=cv2.BORDER_REFLECT_101)
        # Do not reduce the original selection: inward feathering can restore the subject.
        blend_mask = torch.from_numpy(np.maximum(mask_array, blurred)).unsqueeze(0).to(mask)
        return (instruction, marked, source, blend_mask)


class SimpAIQwen21EraseComposite:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"original_image": ("IMAGE",), "generated_image": ("IMAGE",), "mask": ("MASK",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "composite"
    CATEGORY = "SimpAI/image"

    def composite(self, original_image, generated_image, mask):
        # An empty selection means ordinary text-directed editing, including native alpha.
        if not torch.any(mask > 0):
            return (generated_image,)
        if original_image.shape[1:3] != generated_image.shape[1:3] or mask.shape[1:3] != original_image.shape[1:3]:
            raise ValueError("Qwen erase source, result and mask must have the same size.")
        source = original_image.to(generated_image)
        weight = mask.to(generated_image).clamp(0, 1).unsqueeze(-1)
        if generated_image.shape[-1] == 4:
            weight = weight * generated_image[..., 3:4].clamp(0, 1)
        source_alpha = source[..., 3:4] if source.shape[-1] == 4 else torch.ones_like(weight)
        alpha = weight + source_alpha * (1 - weight)
        rgb = generated_image[..., :3] * weight + source[..., :3] * source_alpha * (1 - weight)
        if source.shape[-1] == 4:
            rgb = rgb / alpha.clamp_min(torch.finfo(rgb.dtype).eps)
            result = torch.cat((rgb, alpha), dim=-1)
        else:
            result = rgb
        # Retain exact source values outside the blend support and under transparent output.
        return (torch.where(weight > 0, result, source),)


def erase_generation_size(width, height, max_resolution=0):
    # Automatic editing follows crop detail, with the native 2K pixel budget.
    # A 4096x512 strip and a 2048x2048 square must not share a 2048 long-edge cap.
    side_limit = max(32, int(max_resolution) // 32 * 32) if max_resolution > 0 else 4096
    pixel_limit = side_limit ** 2 if max_resolution > 0 else 2048 ** 2
    scale = min(1.0, side_limit / max(width, height), math.sqrt(pixel_limit / (width * height)))
    generation_w = min(side_limit, max(32, math.ceil(width * scale / 32) * 32))
    generation_h = min(side_limit, max(32, math.ceil(height * scale / 32) * 32))
    if generation_w * generation_h > pixel_limit:
        generation_w = max(32, math.floor(width * scale / 32) * 32)
        generation_h = max(32, math.floor(height * scale / 32) * 32)
    return generation_w, generation_h


class SimpAIQwen21EraseCrop:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "max_resolution": ("INT", {"default": 0, "min": 0, "max": 4096, "step": 32}),
                "context_pixels": ("INT", {"default": 150, "min": 32, "max": 2048}),
            },
            "optional": {"mask_image": ("IMAGE",)},
        }

    RETURN_TYPES = ("STRING", "IMAGE", "QWEN21_ERASE", "IMAGE")
    RETURN_NAMES = ("prompt", "marked_crop", "stitch_data", "color_reference")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/image"

    def prepare(self, image, prompt, max_resolution=0, context_pixels=150, mask_image=None):
        if image is None:
            raise ValueError("Qwen erasing requires a source image.")
        source = image[:1]
        height, width = source.shape[1:3]
        mask = torch.zeros((1, height, width), dtype=source.dtype, device=source.device)
        if mask_image is not None:
            if mask_image.shape[1:3] != (height, width):
                raise ValueError("Canvas image and painted mask must have the same size.")
            mask = mask_image[:1, :, :, :3].amax(-1).to(source).clamp(0, 1)
        # Find occupied rows/columns without allocating coordinates for a full-size mask.
        rows = torch.where(torch.any(mask[0] > 0, dim=1))[0]
        columns = torch.where(torch.any(mask[0] > 0, dim=0))[0]
        has_mask = len(rows) > 0
        x0, y0, x1, y1 = 0, 0, width, height
        if has_mask:
            pad_x = max(context_pixels, min(512, math.ceil((int(columns[-1]) - int(columns[0]) + 1) / 4)))
            pad_y = max(context_pixels, min(512, math.ceil((int(rows[-1]) - int(rows[0]) + 1) / 4)))
            x0, x1 = max(0, int(columns[0]) - pad_x), min(width, int(columns[-1]) + pad_x + 1)
            y0, y1 = max(0, int(rows[0]) - pad_y), min(height, int(rows[-1]) + pad_y + 1)
        crop = source[:, y0:y1, x0:x1]
        crop_mask = mask[:, y0:y1, x0:x1]
        crop_h, crop_w = crop.shape[1:3]
        generation_w, generation_h = erase_generation_size(crop_w, crop_h, max_resolution)
        resized_mask = crop_mask.unsqueeze(1)
        if (generation_h, generation_w) != (crop_h, crop_w):
            crop = comfy.utils.common_upscale(crop.movedim(-1, 1), generation_w, generation_h, "lanczos", "disabled").movedim(1, -1)
            # Area/max pooling keeps tiny selected pixels when a large region is reduced.
            if generation_h < crop_h or generation_w < crop_w:
                resized_mask = torch.nn.functional.adaptive_max_pool2d(resized_mask, (generation_h, generation_w))
            else:
                resized_mask = torch.nn.functional.interpolate(resized_mask, size=(generation_h, generation_w), mode="nearest-exact")
        instruction, marked, _, _ = SimpAIQwen21ErasePrepare().prepare(
            crop, prompt, generation_w, generation_h, resized_mask.movedim(1, -1),
        )
        stitch_data = {
            "source": source, "box": (x0, y0, x1, y1), "mask": crop_mask,
            "generation_size": (generation_h, generation_w), "has_mask": has_mask,
        }
        logging.info("Qwen erase: source=%dx%d, crop=(%d,%d,%d,%d), generation=%dx%d, output=%dx%d",
                     width, height, x0, y0, crop_w, crop_h, generation_w, generation_h, width, height)
        reference = crop[..., :3]
        if crop.shape[-1] == 4:
            reference = reference * crop[..., 3:4] + (1 - crop[..., 3:4])
        return instruction, marked, stitch_data, reference


class SimpAIQwen21EraseStitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"generated_image": ("IMAGE",), "stitch_data": ("QWEN21_ERASE",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "stitch"
    CATEGORY = "SimpAI/image"

    def stitch(self, generated_image, stitch_data):
        if generated_image.shape[1:3] != stitch_data["generation_size"]:
            raise ValueError("Qwen erase result does not match the cropped generation size.")
        source = stitch_data["source"]
        x0, y0, x1, y1 = stitch_data["box"]
        generated = generated_image
        if generated.shape[1:3] != (y1 - y0, x1 - x0):
            generated = comfy.utils.common_upscale(generated.movedim(-1, 1), x1 - x0, y1 - y0, "lanczos", "disabled").movedim(1, -1)
        if not stitch_data["has_mask"]:
            return (generated,)
        original = source[:, y0:y1, x0:x1].to(generated)
        mask = stitch_data["mask"]
        mask_array = mask[0].detach().float().cpu().numpy()
        grown = cv2.dilate(mask_array, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17)))
        blurred = cv2.GaussianBlur(grown, (25, 25), 4, borderType=cv2.BORDER_REFLECT_101)
        blend = torch.from_numpy(np.maximum(mask_array, blurred)).unsqueeze(0).to(generated)
        patch = SimpAIQwen21EraseComposite().composite(original, generated, blend)[0]
        # Keep the 6000x4000 canvas on its original device; only the crop needs inference.
        output = source.clone()
        output[:, y0:y1, x0:x1] = patch.to(output)
        return (output,)


NODE_CLASS_MAPPINGS = {
    "SimpAIQwen21MaskedEdit": SimpAIQwen21MaskedEdit,
    "SimpAIQwen21ErasePrepare": SimpAIQwen21ErasePrepare,
    "SimpAIQwen21EraseComposite": SimpAIQwen21EraseComposite,
    "SimpAIQwen21EraseCrop": SimpAIQwen21EraseCrop,
    "SimpAIQwen21EraseStitch": SimpAIQwen21EraseStitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIQwen21MaskedEdit": "SimpAI Qwen 2.1 Masked Edit",
    "SimpAIQwen21ErasePrepare": "SimpAI Qwen 2.1 Erase Preparation",
    "SimpAIQwen21EraseComposite": "SimpAI Qwen 2.1 Erase Composite",
    "SimpAIQwen21EraseCrop": "SimpAI Qwen 2.1 Erase Crop",
    "SimpAIQwen21EraseStitch": "SimpAI Qwen 2.1 Erase Stitch",
}
