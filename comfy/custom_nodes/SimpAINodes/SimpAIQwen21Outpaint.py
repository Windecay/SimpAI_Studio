import math

import torch

import comfy.utils


OUTPAINT_PROMPT = (
    "Outpaint the image: replace the solid gray areas with a seamless continuation "
    "of the scene, keeping the existing picture unchanged."
)


class SimpAIQwen21OutpaintPrepare:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "up": ("INT", {"default": 15, "min": 0, "max": 100}),
                "down": ("INT", {"default": 15, "min": 0, "max": 100}),
                "left": ("INT", {"default": 15, "min": 0, "max": 100}),
                "right": ("INT", {"default": 15, "min": 0, "max": 100}),
                "max_megapixels": ("FLOAT", {"default": 0, "min": 0, "max": 16, "step": 0.1}),
            },
        }

    RETURN_TYPES = ("IMAGE", "QWEN21_OUTPAINT", "STRING")
    RETURN_NAMES = ("padded_image", "stitch_data", "prompt")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/image"

    def prepare(self, image, prompt, up, down, left, right, max_megapixels):
        if image is None or image.ndim != 4 or image.shape[-1] < 3:
            raise ValueError("Qwen outpaint requires a source image.")
        source = image[:1, :, :, :3]
        if image.shape[-1] > 3:
            alpha = image[:1, :, :, 3:4]
            source = source * alpha + (1 - alpha)
        source_h, source_w = source.shape[1:3]

        def geometry(width, height):
            top = round(height * up / 100)
            bottom = round(height * down / 100)
            pad_left = round(width * left / 100)
            pad_right = round(width * right / 100)
            canvas_w = max(32, math.ceil((width + pad_left + pad_right) / 32) * 32)
            canvas_h = max(32, math.ceil((height + top + bottom) / 32) * 32)
            return top, pad_left, canvas_w, canvas_h

        top, pad_left, canvas_w, canvas_h = geometry(source_w, source_h)
        max_pixels = float(max_megapixels) * 1_000_000
        if max_pixels > 0 and canvas_w * canvas_h > max_pixels:
            scale = math.sqrt(max_pixels / (canvas_w * canvas_h))
            width = max(1, math.floor(source_w * scale))
            height = max(1, math.floor(source_h * scale))
            top, pad_left, canvas_w, canvas_h = geometry(width, height)
            # Leave room for the encoder's 32-pixel canvas alignment.
            while canvas_w * canvas_h > max_pixels and (width > 1 or height > 1):
                scale = min(0.99, math.sqrt(max_pixels / (canvas_w * canvas_h)))
                width = max(1, math.floor(width * scale))
                height = max(1, math.floor(height * scale))
                top, pad_left, canvas_w, canvas_h = geometry(width, height)
            source = comfy.utils.common_upscale(
                source.movedim(-1, 1), width, height, "lanczos", "disabled"
            ).movedim(1, -1)

        height, width = source.shape[1:3]
        padded = source.new_full((1, canvas_h, canvas_w, 3), 128 / 255)
        padded[:, top:top + height, pad_left:pad_left + width] = source
        text = str(prompt or "").strip()
        if not text:
            text = OUTPAINT_PROMPT
        elif not text.startswith(OUTPAINT_PROMPT):
            text = f"{OUTPAINT_PROMPT}\nScene: {text}"
        stitch_data = {"source": source, "top": top, "left": pad_left, "width": canvas_w, "height": canvas_h}
        return padded, stitch_data, text


class SimpAIQwen21OutpaintStitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "stitch_data": ("QWEN21_OUTPAINT",),
                "feather": ("INT", {"default": 32, "min": 0, "max": 256}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "stitch"
    CATEGORY = "SimpAI/image"

    def stitch(self, image, stitch_data, feather):
        source = stitch_data["source"]
        top, left = stitch_data["top"], stitch_data["left"]
        height, width = source.shape[1:3]
        if image.shape[1:3] != (stitch_data["height"], stitch_data["width"]):
            raise ValueError("Qwen outpaint output does not match the padded canvas.")
        result = image[:, :, :, :3].clone()
        source = source.to(device=result.device, dtype=result.dtype)
        weight = result.new_ones((height, width))
        if feather > 0:
            y = torch.arange(height, device=result.device, dtype=result.dtype)
            x = torch.arange(width, device=result.device, dtype=result.dtype)
            # Blend only where a generated border touches the original image.
            if top > 0:
                weight *= (y / feather).clamp(0, 1)[:, None]
            if top + height < result.shape[1]:
                weight *= ((height - 1 - y) / feather).clamp(0, 1)[:, None]
            if left > 0:
                weight *= (x / feather).clamp(0, 1)[None, :]
            if left + width < result.shape[2]:
                weight *= ((width - 1 - x) / feather).clamp(0, 1)[None, :]
        region = result[:, top:top + height, left:left + width]
        result[:, top:top + height, left:left + width] = torch.lerp(region, source, weight[None, :, :, None])
        return (result,)


NODE_CLASS_MAPPINGS = {
    "SimpAIQwen21OutpaintPrepare": SimpAIQwen21OutpaintPrepare,
    "SimpAIQwen21OutpaintStitch": SimpAIQwen21OutpaintStitch,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIQwen21OutpaintPrepare": "SimpAI Qwen 2.1 Outpaint Canvas",
    "SimpAIQwen21OutpaintStitch": "SimpAI Qwen 2.1 Outpaint Stitch",
}
