import torch

import comfy.utils


class SimpAIQwen21CanvasInpaint:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vae": ("VAE",),
                "latent": ("LATENT",),
                "width": ("INT", {"default": 1024, "min": 32, "max": 32768, "step": 32}),
                "height": ("INT", {"default": 1024, "min": 32, "max": 32768, "step": 32}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask_image": ("IMAGE",),
                "use_source_latent": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("LATENT", "IMAGE", "MASK")
    RETURN_NAMES = ("latent", "original_image", "edit_mask")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/image"

    def prepare(self, vae, latent, width, height, image=None, mask_image=None, use_source_latent=True):
        if image is None:
            original = torch.zeros((1, height, width, 3), dtype=torch.float32)
            return (latent, original, torch.ones((1, height, width), dtype=torch.float32))

        source = image[:1]
        if mask_image is None:
            mask = torch.zeros(source.shape[:3], dtype=source.dtype, device=source.device)
        else:
            if mask_image.shape[1:3] != source.shape[1:3]:
                raise ValueError("Canvas image and painted mask must have the same size.")
            mask = mask_image[:1, :, :, :3].amax(dim=-1).clamp(0, 1)

        if source.shape[1:3] != (height, width):
            source = comfy.utils.common_upscale(
                source.movedim(-1, 1), width, height, "lanczos", "center"
            ).movedim(1, -1)
            mask = comfy.utils.common_upscale(
                mask.unsqueeze(1), width, height, "nearest-exact", "center"
            )[:, 0]

        original = source[:, :, :, :3]
        if source.shape[-1] > 3:
            alpha = source[:, :, :, 3:4]
            original = original * alpha + (1 - alpha)

        if not torch.any(mask > 0):
            return (latent, original, torch.ones_like(mask))

        if not use_source_latent:
            return (latent, original, mask)

        samples = vae.encode(source)
        return ({"samples": samples, "noise_mask": mask.unsqueeze(1)}, original, mask)


NODE_CLASS_MAPPINGS = {
    "SimpAIQwen21CanvasInpaint": SimpAIQwen21CanvasInpaint,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIQwen21CanvasInpaint": "SimpAI Qwen 2.1 Canvas Mask",
}
