import folder_paths
from comfy_api.latest import ComfyExtension, io

from .hf import load_hf_clip, load_hf_model, load_hf_vae
from .loaders import DTYPES, load_clip, load_model


class MOSSImageUNETLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageUNETLoader",
            display_name="MOSS-Image Load Diffusion Model",
            category="MOSS-Image",
            inputs=[
                io.Combo.Input("unet_name", options=folder_paths.get_filename_list("diffusion_models")),
                io.Combo.Input("weight_dtype", options=list(DTYPES), default="default"),
            ],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, unet_name, weight_dtype):
        path = folder_paths.get_full_path_or_raise("diffusion_models", unet_name)
        return io.NodeOutput(load_model(path, weight_dtype))


class MOSSImageCLIPLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageCLIPLoader",
            display_name="MOSS-Image Load Qwen3.5",
            category="MOSS-Image",
            inputs=[
                io.Combo.Input("clip_name", options=folder_paths.get_filename_list("text_encoders")),
                io.Combo.Input("device", options=["default", "cpu"], default="default", advanced=True),
            ],
            outputs=[io.Clip.Output()],
        )

    @classmethod
    def execute(cls, clip_name, device):
        path = folder_paths.get_full_path_or_raise("text_encoders", clip_name)
        return io.NodeOutput(load_clip(path, device))


class MOSSImageHFDiTLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageHFDiTLoader", display_name="MOSS-Image HF DiT",
            category="MOSS-Image/HF",
            inputs=[io.String.Input("model_path"),
                    io.Combo.Input("weight_dtype", options=list(DTYPES), default="default")],
            outputs=[io.Model.Output()],
        )

    @classmethod
    def execute(cls, model_path, weight_dtype):
        return io.NodeOutput(load_hf_model(model_path, weight_dtype))


class MOSSImageHFTextEncoderLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageHFTextEncoderLoader", display_name="MOSS-Image HF Text Encoder",
            category="MOSS-Image/HF",
            inputs=[io.String.Input("model_path"),
                    io.Combo.Input("device", options=["default", "cpu"], default="default")],
            outputs=[io.Clip.Output()],
        )

    @classmethod
    def execute(cls, model_path, device):
        return io.NodeOutput(load_hf_clip(model_path, device))


class MOSSImageHFVAELoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageHFVAELoader", display_name="MOSS-Image HF VAE",
            category="MOSS-Image/HF",
            inputs=[io.String.Input("model_path")],
            outputs=[io.Vae.Output()],
        )

    @classmethod
    def execute(cls, model_path):
        return io.NodeOutput(load_hf_vae(model_path))


class MOSSImageHFLoader(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MOSSImageHFLoader", display_name="MOSS-Image HF Loader",
            category="MOSS-Image/HF",
            inputs=[
                io.String.Input("model_path"),
                io.Combo.Input("weight_dtype", options=list(DTYPES), default="default"),
                io.Combo.Input("text_device", options=["default", "cpu"], default="default", advanced=True),
            ],
            outputs=[io.Model.Output(), io.Clip.Output(), io.Vae.Output()],
        )

    @classmethod
    def execute(cls, model_path, weight_dtype, text_device):
        model = load_hf_model(model_path, weight_dtype)
        clip = load_hf_clip(model_path, text_device)
        vae = load_hf_vae(model_path)
        return io.NodeOutput(model, clip, vae)


class MOSSImageExtension(ComfyExtension):
    async def get_node_list(self):
        return [
            MOSSImageUNETLoader,
            MOSSImageCLIPLoader,
            MOSSImageHFLoader,
            MOSSImageHFDiTLoader,
            MOSSImageHFTextEncoderLoader,
            MOSSImageHFVAELoader,
        ]


async def comfy_entrypoint():
    return MOSSImageExtension()
