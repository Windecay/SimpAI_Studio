import math

import numpy as np
from PIL import Image
import torch

import node_helpers
from comfy_api.latest import io
from comfy_extras.nodes_moss_image import EDIT_FORMATS


def resize_edit_reference(image, max_edge, width=512, height=512):
    source_height, source_width = image.shape[1:3]
    if max_edge == 0:
        scale = math.sqrt(width * height / (source_width * source_height))
    else:
        scale = min(1.0, max(16, max_edge // 16 * 16) / max(source_width, source_height))
    target_width = max(16, math.floor(source_width * scale / 16 + 0.5) * 16)
    target_height = width * height / target_width if max_edge == 0 else source_height * scale
    size = (target_width, max(16, math.floor(target_height / 16 + 0.5) * 16))
    # Preserve the edit adapter's uint8 rounding and Lanczos preprocessing.
    pixels = (image[:, :, :, :3].detach().float().cpu().clamp(0, 1) * 255).round().to(torch.uint8).numpy()
    return torch.stack([torch.from_numpy(np.array(Image.fromarray(sample).resize(size, Image.Resampling.LANCZOS)))
                        for sample in pixels]).float() / 255


class SimpAIMossEditReference(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMossEditReference", display_name="SimpAI MOSS Edit References",
            category="SimpAI/MOSS",
            inputs=[
                io.Conditioning.Input("positive"), io.Conditioning.Input("negative"), io.Vae.Input("vae"),
                io.Int.Input("reference_max_edge", default=0, min=0, max=4096, step=16),
                io.Int.Input("width", default=512, min=16, max=16384, step=16, optional=True),
                io.Int.Input("height", default=512, min=16, max=16384, step=16, optional=True),
                io.Autogrow.Input("images", template=io.Autogrow.TemplatePrefix(
                    io.Image.Input("image", optional=True), prefix="image", min=1)),
            ],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Conditioning.Output(display_name="negative")],
        )

    @classmethod
    def execute(cls, positive, negative, vae, reference_max_edge, images, width=512, height=512):
        latents = [vae.encode(resize_edit_reference(images[name], reference_max_edge, width, height))
                   for name in sorted(images, key=lambda name: int(name.removeprefix("image"))) if images[name] is not None]
        if not latents:
            raise ValueError("MOSS image editing needs at least one reference image.")
        if any(latent.shape[1] != 128 for latent in latents):
            raise ValueError("MOSS image editing requires a Flux2-compatible 128-channel VAE.")
        values = {"reference_latents": latents, "reference_latents_method": EDIT_FORMATS["Moss-Image-Edit"][0]}
        return io.NodeOutput(node_helpers.conditioning_set_values(positive, values),
                             node_helpers.conditioning_set_values(negative, values))


class SimpAIMossEditScheduler(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMossEditScheduler", display_name="SimpAI MOSS Edit Schedule",
            category="sampling/custom_sampling/schedulers",
            inputs=[io.Int.Input("steps", default=30, min=1, max=1000),
                    io.Float.Input("shift", default=5.0, min=0.01, max=100.0, step=0.1)],
            outputs=[io.Sigmas.Output()],
        )

    @classmethod
    def execute(cls, steps, shift):
        # The author's V2 schedule snaps shifted sigmas to the training grid.
        lower = shift / (1000 + shift - 1)
        values = torch.linspace(1, lower, steps)
        sigmas = shift * values / (1 + (shift - 1) * values)
        training = torch.linspace(1, 0.001, 1000).flip(0)
        upper = torch.searchsorted(training, sigmas).clamp(max=999)
        lower = (upper - 1).clamp(min=0)
        nearest = torch.where((sigmas - training[lower]).abs() <= (training[upper] - sigmas).abs(), lower, upper)
        sigmas = torch.unique_consecutive(training[nearest])
        return io.NodeOutput(torch.cat((sigmas, sigmas.new_zeros(1))))


NODE_CLASS_MAPPINGS = {
    "SimpAIMossEditReference": SimpAIMossEditReference,
    "SimpAIMossEditScheduler": SimpAIMossEditScheduler,
}
