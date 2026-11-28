"""Kandinsky ImageSR 2.0 nodes: load the transformer; upscale images x2 or x4 with a stock FLUX VAE."""
import os

import folder_paths
from comfy_api.latest import io

from . import loader, upscale

SCALES = {"2x": 2, "4x": 4}


class LoadKandinskyImageSRModel(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        files = [f.replace(os.sep, "/") for f in folder_paths.get_filename_list("diffusion_models")
                 if os.path.basename(f).startswith("kandinsky_image_sr")]
        return io.Schema(
            node_id="KandinskyImageSRLoader",
            display_name="Load Kandinsky Image SR Model",
            category="Kandinsky SR",
            description="Loads the Kandinsky ImageSR 2.0 transformer (one model for x2 and x4).",
            inputs=[io.Combo.Input("model", options=files, default=next((f for f in files if f.endswith("_bf16.safetensors")), files[0] if files else None),
                                   tooltip="models/diffusion_models: kandinsky_image_sr_2.0_bf16 (tools/convert_image_sr.py) or "
                                           "kandinsky_image_sr_2.0_int8_convrot (tools/convert_image_sr_int8.py: 4.8 GB, faster, close to bf16).")],
            outputs=[io.Custom("KANDINSKY_IMAGE_SR").Output(display_name="model")],
        )

    @classmethod
    def execute(cls, model) -> io.NodeOutput:
        return io.NodeOutput(loader.load(folder_paths.get_full_path_or_raise("diffusion_models", model)))


class KandinskyImageSRUpscale(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="KandinskyImageSRUpscale",
            display_name="Kandinsky Image SR Upscale",
            category="Kandinsky SR",
            description="Super-resolves each image x2 or x4 in one step, tile by tile (1024 px output tiles, 25% overlap). "
                        "Seedless: the same input gives the same output.",
            inputs=[
                io.Custom("KANDINSKY_IMAGE_SR").Input("model"),
                io.Vae.Input("vae", tooltip="The FLUX.1 VAE (ae.safetensors), the release's VAE."),
                io.Image.Input("image"),
                io.Combo.Input("scale", options=list(SCALES), default="4x"),
                io.Int.Input("creativity", default=4, min=0, max=8,
                             tooltip="How much detail the model invents: 0 stays closest to the input, 8 adds the most. "
                                     "4 is the release default (x2: t 0.15, x4: t 0.244)."),
                io.Int.Input("tile_batch_size", default=1, min=1, max=16, advanced=True,
                             tooltip="Tiles per transformer and VAE call. More tiles use more VRAM (the VAE needs most of it) and are not faster yet."),
                io.Combo.Input("kernels", options=["fast", "exact"], default="fast",
                               tooltip="fast: the transformer's norms, modulation, residual and RoPE in fused kernels (CUDA with "
                                       "Triton), the same arithmetic in another reduction order: as close to the reference as exact, "
                                       "faster. exact: the reference's ops, bit for bit."),
            ],
            outputs=[io.Image.Output()],
        )

    @classmethod
    def execute(cls, model, vae, image, scale, creativity, tile_batch_size, kernels) -> io.NodeOutput:
        return io.NodeOutput(upscale.upscale(model, vae, image, SCALES[scale], creativity, tile_batch_size, kernels))


NODES = [LoadKandinskyImageSRModel, KandinskyImageSRUpscale]
