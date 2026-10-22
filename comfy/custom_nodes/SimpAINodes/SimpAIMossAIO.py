"""Optional MOSS control for the main AIO sampling branch."""

import torch

import comfy.lora_convert
import comfy.ops
import comfy.sd
import comfy.utils
import folder_paths
import node_helpers
from comfy.ldm.moss_image.model import MOSSImage
from comfy_extras.nodes_moss_image import MOSSImageControl
from comfy_execution.graph_utils import GraphBuilder


CONTROL_LORA = "moss_image_color_depth_control.safetensors"


def _active_references(references):
    active = {}
    for reference in references:
        mode = int(reference.get("mode", 0))
        if mode <= 0 or reference["weight"] == 0 or reference["stop_percent"] <= 0:
            continue
        if mode == 1:
            if reference.get("image") is None:
                raise ValueError("The enabled MOSS reference image is missing.")
            continue
        if mode not in (3, 6):
            raise ValueError("MOSS image control supports ImagePrompt, Depth and ColorMap.")
        if mode in active:
            raise ValueError("MOSS image control accepts one Depth map and one ColorMap.")
        if reference.get("image") is None:
            raise ValueError("The enabled MOSS control image is missing.")
        active[mode] = reference
    return active


def _fit_map(image, width, height, method):
    return comfy.utils.common_upscale(
        image[..., :3].movedim(-1, 1), width, height, method, "center",
    ).movedim(1, -1)


class SimpAIMossControlModel:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",)}}

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "load"
    CATEGORY = "SimpAI/MOSS"

    def load(self, model):
        dit = model.get_model_object("diffusion_model")
        if not isinstance(dit, MOSSImage):
            raise ValueError("MOSS image control requires a MOSS-Image model.")
        path = folder_paths.get_full_path("loras", CONTROL_LORA)
        if path is None:
            raise FileNotFoundError(f"MOSS image control model is missing: {CONTROL_LORA}")
        state = comfy.utils.load_torch_file(path, safe_load=True)
        weight = state.get("video_embedder.weight")
        bias = state.get("video_embedder.bias")
        expected = (dit.video_embedder.weight.shape[0], dit.latent_channels * 3)
        if weight is None or tuple(weight.shape) != expected:
            raise ValueError(f"MOSS control video_embedder must have shape {expected}.")
        if bias is not None and tuple(bias.shape) != (expected[0],):
            raise ValueError("MOSS control video_embedder bias has an incompatible shape.")

        patches = comfy.lora_convert.convert_lora(state)
        patches.pop("diffusion_model.video_embedder.set_weight", None)
        patches.pop("diffusion_model.video_embedder.bias.set_weight", None)
        controlled, _ = comfy.sd.load_lora_for_models(model, None, patches, 1.0, 0.0)
        # The wider projection must be visible before concat_cond, including GGUF.
        # An object patch also restores the original projection on model unload.
        projection = comfy.ops.manual_cast.Linear(
            expected[1], expected[0], bias=bias is not None, device="meta", dtype=weight.dtype,
        )
        projection.weight = torch.nn.Parameter(weight, requires_grad=False)
        if bias is not None:
            projection.bias = torch.nn.Parameter(bias, requires_grad=False)
        for key in ("diffusion_model.video_embedder.weight", "diffusion_model.video_embedder.bias"):
            controlled.patches.pop(key, None)
        controlled.add_object_patch("diffusion_model.video_embedder", projection)
        return (controlled,)


class SimpAIMossControlConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "positive": ("CONDITIONING",), "negative": ("CONDITIONING",), "vae": ("VAE",),
            "width": ("INT", {"default": 1024, "min": 16, "max": 32768}),
            "height": ("INT", {"default": 1024, "min": 16, "max": 32768}),
            "color_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0}),
            "depth_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0}),
            "color_end": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0}),
            "depth_end": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0}),
        }, "optional": {"color_map": ("IMAGE",), "depth_map": ("IMAGE",)}}

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    FUNCTION = "encode"
    CATEGORY = "SimpAI/MOSS"

    def encode(self, positive, negative, vae, width, height, color_strength=1.0,
               depth_strength=1.0, color_end=0.5, depth_end=0.5, color_map=None, depth_map=None):
        maps = (
            _fit_map(color_map, width, height, "nearest-exact") if color_map is not None and color_strength and color_end > 0 else None,
            _fit_map(depth_map, width, height, "bilinear") if depth_map is not None and depth_strength and depth_end > 0 else None,
        )
        if all(image is None for image in maps):
            return (positive, negative)
        encoded = MOSSImageControl.execute(positive, negative, vae, color_map=maps[0], depth_map=maps[1])
        control = next(
            item[1]["concat_latent_image"] for conditioning in encoded for item in conditioning
        )
        color, depth = control.chunk(2, dim=1)
        ends = (color_end if maps[0] is not None else 0.0, depth_end if maps[1] is not None else 0.0)
        result = [positive, negative]
        start = 0.0
        # Each interval carries both maps; sequential control nodes would overwrite them.
        for end in sorted(set(value for value in ends if value > 0)):
            combined = torch.cat((
                color * (color_strength if ends[0] >= end else 0.0),
                depth * (depth_strength if ends[1] >= end else 0.0),
            ), dim=1)
            result = [
                node_helpers.conditioning_set_values_with_timestep_range(
                    conditioning, {"concat_latent_image": combined}, start, end,
                )
                for conditioning in result
            ]
            start = end
        return tuple(result)


class SimpAIAIOReferenceMoss:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",), "positive": ("CONDITIONING",), "negative": ("CONDITIONING",),
            "vae": ("VAE",), "width": ("INT", {"default": 1024}),
            "height": ("INT", {"default": 1024}),
            **{f"reference_{index}": ("SIMPAI_AIO_REFERENCE_CONFIG",) for index in range(1, 5)},
        }, "optional": {
            "clip": ("CLIP",), "prompt": ("STRING", {"multiline": True}),
            "negative_prompt": ("STRING", {"multiline": True}),
        }}

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/Reference"

    def expand(self, model, positive, negative, vae, width, height,
               reference_1, reference_2, reference_3, reference_4,
               clip=None, prompt="", negative_prompt=""):
        references = (reference_1, reference_2, reference_3, reference_4)
        active = _active_references(references)
        vision = any(ref["mode"] == 1 and ref["weight"] > 0 and ref["stop_percent"] > 0 for ref in references)
        if not active and not vision:
            return (model, positive, negative)
        graph = GraphBuilder()
        if vision:
            if clip is None:
                raise ValueError("MOSS image references require the selected text encoder.")
            encoded = graph.node(
                "SimpAIMossVisionConditioning", clip=clip, prompt=prompt, negative_prompt=negative_prompt,
                positive=positive, negative=negative,
                **{f"reference_{index}": ref for index, ref in enumerate(references, 1)},
            )
            positive, negative = encoded.out(0), encoded.out(1)
        if not active:
            return {"result": (model, positive, negative), "expand": graph.finalize()}
        controlled = graph.node("SimpAIMossControlModel", model=model)
        inputs = dict(positive=positive, negative=negative, vae=vae, width=width, height=height)
        for mode, name in ((6, "color"), (3, "depth")):
            reference = active.get(mode)
            if reference is not None:
                inputs.update({
                    f"{name}_map": reference["image"],
                    f"{name}_strength": reference["weight"],
                    f"{name}_end": reference["stop_percent"],
                })
        conditioned = graph.node("SimpAIMossControlConditioning", **inputs)
        return {
            "result": (controlled.out(0), conditioned.out(0), conditioned.out(1)),
            "expand": graph.finalize(),
        }


NODE_CLASS_MAPPINGS = {
    "SimpAIMossControlModel": SimpAIMossControlModel,
    "SimpAIMossControlConditioning": SimpAIMossControlConditioning,
    "SimpAIAIOReferenceMoss": SimpAIAIOReferenceMoss,
}
NODE_DISPLAY_NAME_MAPPINGS = {name: name.replace("SimpAI", "SimpAI ") for name in NODE_CLASS_MAPPINGS}
