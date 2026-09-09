"""Krea2 AIO adapters using native ComfyUI sampling and model patches."""

import math

import torch
import torch.nn.functional as F

import comfy.model_management
import comfy.patcher_extension as pe
import comfy.utils
import folder_paths
import node_helpers
from comfy.ldm.krea2.model import SingleStreamDiT
from comfy.text_encoders.krea2 import KREA2_TEMPLATE
from comfy.weight_adapter.lora import LoRAAdapter
from comfy_execution.graph_utils import GraphBuilder

from .SimpAIAIOInpaint import _SimpAIAIOInpaintBase
from .SimpAIKrea2OstrisEdit import SimpAIKrea2OstrisEditModelPatch
from .krea2_anypaint_helpers import prepare_canvas, token_aligned_noise_mask


DEPTH_LORA = "depth-control-lora.safetensors"
POSE_LORA = "krea2_turbo_openpose_controlnet.safetensors"
ANYPAINT_LORA = "krea2_anypaint_rank32.safetensors"


def _encode_still_images(vae, image):
    return torch.cat([vae.encode(item[None, ..., :3]) for item in image], dim=0)


def _fit_area(image, pixels, snap=1):
    height, width = image.shape[1:3]
    scale = min(1.0, math.sqrt(pixels / (width * height)))
    width = max(snap, round(width * scale / snap) * snap)
    height = max(snap, round(height * scale / snap) * snap)
    return comfy.utils.common_upscale(
        image.movedim(-1, 1), width, height, "area", "disabled",
    ).movedim(1, -1)


def _grounded_encode(clip, prompt, image):
    tokens = clip.tokenize(
        "Picture 1: <|vision_start|><|image_pad|><|vision_end|>" + prompt,
        images=[_fit_area(image, 384 * 384)], llama_template=KREA2_TEMPLATE,
    )
    return clip.encode_from_tokens_scheduled(tokens)


def _reference_conditioning(conditioning, latent):
    return node_helpers.conditioning_set_values(
        conditioning, {"reference_latents": [latent]}, append=True,
    )


def _depth_lora_patches(state, model):
    patches = {}
    for key, down in state.items():
        if not key.endswith(".A") or not key.startswith("blocks."):
            continue
        base = key[:-2]
        up = state[base + ".B"]
        target = "diffusion_model." + base + ".weight"
        output_features = model.get_model_object(target).shape[0]
        if up.shape[0] != output_features:
            down, up = down.t().contiguous(), up.t().contiguous()
        alpha = float(state.get(base + ".alpha", down.shape[0]))
        patches[target] = LoRAAdapter(
            {key, base + ".B"}, (up, down, alpha, None, None, None),
        )
    if not patches:
        raise ValueError("The selected file has no Krea2 depth Control LoRA weights.")
    return patches


def _depth_wrapper(control_latent, control_weight, end_timestep):
    def forward(executor, x, timesteps, context, attention_mask=None,
                ref_latents=None, transformer_options=None, **kwargs):
        options = transformer_options.copy() if transformer_options is not None else {}
        if float(timesteps.max()) >= end_timestep:
            dit = executor.class_obj
            control = control_latent.to(device=x.device, dtype=x.dtype)
            if control.ndim == 5:
                control = control.movedim(2, 1).flatten(0, 1)
            batch = x.shape[0] * (x.shape[2] if x.ndim == 5 else 1)
            control = comfy.utils.repeat_to_batch_size(control, batch)
            control = comfy.utils.common_upscale(control, x.shape[-1], x.shape[-2], "bilinear", "disabled")
            tokens, _, _, _ = dit.process_img(control)
            weight = comfy.model_management.cast_to(control_weight, device=x.device, dtype=x.dtype)
            projected = F.linear(tokens, weight)

            def add_control(args):
                image = args["img"]
                length = projected.shape[1]
                args["img"] = torch.cat((image[:, :length] + projected, image[:, length:]), dim=1)
                return args

            # This projection is local to one forward, including failures and cancellation.
            options["patches"] = options.get("patches", {}).copy()
            options["patches"]["post_input"] = options["patches"].get("post_input", []) + [add_control]
        return executor(
            x, timesteps, context, attention_mask=attention_mask, ref_latents=ref_latents,
            transformer_options=options, **kwargs,
        )
    return forward


class SimpAIKrea2DepthControl:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",), "vae": ("VAE",), "image": ("IMAGE",),
            "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0}),
            "stop_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0}),
            "width": ("INT", {"default": 1024, "min": 16, "max": 32768}),
            "height": ("INT", {"default": 1024, "min": 16, "max": 32768}),
            "lora_name": ("STRING", {"default": DEPTH_LORA}),
        }}

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "apply"
    CATEGORY = "SimpAI/Krea2"

    def apply(self, model, vae, image, strength, stop_percent, width, height, lora_name=DEPTH_LORA):
        if strength == 0 or stop_percent == 0:
            return (model,)
        dit = model.get_model_object("diffusion_model")
        if not isinstance(dit, SingleStreamDiT):
            raise ValueError("Krea2 depth control requires a Krea2 model.")
        state = comfy.utils.load_torch_file(folder_paths.get_full_path_or_raise("loras", lora_name), safe_load=True)
        image_features = dit.channels * dit.patch ** 2
        # Keep the original image projection, including its quantization and user LoRAs.
        control_weight = state["first.weight"][:, image_features:].detach().clone()
        patched = model.clone()
        patched.add_patches(_depth_lora_patches(state, model), strength_patch=float(strength))
        image = comfy.utils.common_upscale(
            image[..., :3].movedim(-1, 1), width, height, "bilinear", "center",
        ).movedim(1, -1)
        image = image.mean(dim=-1, keepdim=True).expand(-1, -1, -1, 3)
        low, high = image.amin(dim=(1, 2, 3), keepdim=True), image.amax(dim=(1, 2, 3), keepdim=True)
        image = (image - low) / (high - low).clamp_min(1e-6)
        latent = model.model.process_latent_in(_encode_still_images(vae, image)).to("cpu")
        sampling = model.get_model_object("model_sampling")
        end_timestep = float(sampling.timestep(sampling.percent_to_sigma(float(stop_percent))))
        patched.add_wrapper_with_key(
            pe.WrappersMP.DIFFUSION_MODEL, "simpai_krea2_depth",
            _depth_wrapper(latent, control_weight, end_timestep),
        )
        return (patched,)


class SimpAIKrea2PoseConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "clip": ("CLIP",), "vae": ("VAE",), "image": ("IMAGE",),
            "positive": ("CONDITIONING",), "negative": ("CONDITIONING",),
            "prompt": ("STRING", {"multiline": True}),
            "negative_prompt": ("STRING", {"multiline": True}),
            "stop_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0}),
        }}

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    FUNCTION = "encode"
    CATEGORY = "SimpAI/Krea2"

    def encode(self, clip, vae, image, positive, negative, prompt, negative_prompt, stop_percent):
        latent = _encode_still_images(vae, _fit_area(image, 1024 * 1024, snap=16))
        result = []
        for base, text in ((positive, prompt), (negative, negative_prompt)):
            grounded = _reference_conditioning(_grounded_encode(clip, text, image), latent)
            if stop_percent < 1.0:
                grounded = node_helpers.conditioning_set_values(grounded, {"end_percent": stop_percent})
                grounded += node_helpers.conditioning_set_values(base, {"start_percent": stop_percent})
            result.append(grounded)
        return tuple(result)


class SimpAIAIOReferenceKrea2:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",), "positive": ("CONDITIONING",), "negative": ("CONDITIONING",),
            "vae": ("VAE",), "clip": ("CLIP", {"lazy": True}),
            "prompt": ("STRING", {"multiline": True}), "negative_prompt": ("STRING", {"multiline": True}),
            "width": ("INT", {"default": 1024}), "height": ("INT", {"default": 1024}),
            **{f"reference_{i}": ("SIMPAI_AIO_REFERENCE_CONFIG",) for i in range(1, 5)},
        }}

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/Reference"

    @staticmethod
    def _active(references):
        return [ref for ref in references if ref["mode"] > 0 and ref["weight"] != 0 and ref["stop_percent"] > 0]

    def check_lazy_status(self, model, positive, negative, vae, clip, prompt, negative_prompt,
                          width, height, reference_1, reference_2, reference_3, reference_4):
        active = self._active((reference_1, reference_2, reference_3, reference_4))
        return ["clip"] if clip is None and any(ref["mode"] == 5 for ref in active) else []

    def expand(self, model, positive, negative, vae, clip, prompt, negative_prompt,
               width, height, reference_1, reference_2, reference_3, reference_4):
        active = self._active((reference_1, reference_2, reference_3, reference_4))
        if not active:
            return (model, positive, negative)
        if len(active) > 1:
            raise ValueError("Krea2 AIO currently supports one active Depth or OpenPose control image.")
        reference = active[0]
        graph = GraphBuilder()
        if reference["mode"] == 3:
            controlled = graph.node(
                "SimpAIKrea2DepthControl", model=model, vae=vae, image=reference["image"],
                width=width, height=height, strength=reference["weight"],
                stop_percent=reference["stop_percent"], lora_name=DEPTH_LORA,
            )
            outputs = (controlled.out(0), positive, negative)
        elif reference["mode"] == 5:
            loaded = graph.node("LoraLoaderModelOnly", model=model, lora_name=POSE_LORA,
                                strength_model=reference["weight"])
            patched = graph.node("SimpAIKrea2OstrisEditModelPatch", model=loaded.out(0), kv_cache=True)
            conditioned = graph.node(
                "SimpAIKrea2PoseConditioning", clip=clip, vae=vae, image=reference["image"],
                positive=positive, negative=negative, prompt=prompt, negative_prompt=negative_prompt,
                stop_percent=reference["stop_percent"],
            )
            outputs = (patched.out(0), conditioned.out(0), conditioned.out(1))
        else:
            raise ValueError("Krea2 AIO supports Depth and OpenPose control, not ImagePrompt, Canny or FaceSwap.")
        return {"result": outputs, "expand": graph.finalize()}


class SimpAIKrea2AnyPaintModelPatch(SimpAIKrea2OstrisEditModelPatch):
    REGISTER_REFERENCE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",)}}

    def patch(self, model):
        return super().patch(model, kv_cache=True)


class SimpAIKrea2AnyPaintConditioning:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "positive": ("CONDITIONING",), "negative": ("CONDITIONING",), "vae": ("VAE",),
            "image": ("IMAGE",), "mask": ("MASK",),
        }, "optional": {
            "clip": ("CLIP",), "prompt": ("STRING", {"multiline": True}),
            "negative_prompt": ("STRING", {"multiline": True}),
            "disable_initial_latent": ("BOOLEAN", {"default": False}),
        }}

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT")
    FUNCTION = "encode"
    CATEGORY = "SimpAI/Krea2"

    def encode(self, positive, negative, vae, image, mask, clip=None, prompt="", negative_prompt="",
               disable_initial_latent=False):
        semantic, known, keep = prepare_canvas(image, mask)
        reference = _encode_still_images(vae, semantic)
        latent = _encode_still_images(vae, known)
        noise_mask = token_aligned_noise_mask(keep, latent.shape[-2], latent.shape[-1])
        if disable_initial_latent:
            latent_mask = noise_mask.unsqueeze(2) if latent.ndim == 5 else noise_mask
            latent = latent * (1.0 - latent_mask)
        if clip is not None:
            positive = _grounded_encode(clip, prompt, semantic)
            negative = _grounded_encode(clip, negative_prompt, semantic)
        return (
            _reference_conditioning(positive, reference),
            _reference_conditioning(negative, reference),
            {"samples": latent, "noise_mask": noise_mask},
        )


class SimpAIAIOInpaintKrea2(_SimpAIAIOInpaintBase):
    FAMILY = "krea2"

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["optional"].update({
            "clip": ("CLIP",), "prompt": ("STRING", {"multiline": True}),
            "negative_prompt": ("STRING", {"multiline": True}),
        })
        return types

    def check_lazy_status(self, model, positive, negative, vae, inpaint, seed, steps, cfg,
                          sampler_name, scheduler, progress_node_id="", use_differential_diffusion=True,
                          clip=None, prompt="", negative_prompt=""):
        return []

    def expand(self, model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
               progress_node_id="", use_differential_diffusion=True, clip=None, prompt="", negative_prompt=""):
        if inpaint.get("mix_reference", False):
            raise ValueError("Krea2 AIO does not support mixing control images with inpaint or outpaint.")
        engine = str(inpaint.get("engine", "None")).strip().casefold()
        if engine in ("", "none", "disabled"):
            return super().expand(
                model=model, positive=positive, negative=negative, vae=vae, inpaint=inpaint,
                seed=seed, steps=steps, cfg=cfg, sampler_name=sampler_name, scheduler=scheduler,
                progress_node_id=progress_node_id, use_differential_diffusion=use_differential_diffusion,
            )
        if engine != "anypaint":
            raise ValueError("Krea2 AIO inpaint engine must be AnyPaint or None.")
        graph = GraphBuilder()
        mask = graph.node("ImageToMask", image=inpaint["mask_image"], channel="red").out(0)
        if inpaint.get("invert_mask", False):
            mask = graph.node("InvertMask", mask=mask).out(0)
        loaded = graph.node("LoraLoaderModelOnly", model=model, lora_name=ANYPAINT_LORA, strength_model=1.0)
        patched = graph.node("SimpAIKrea2AnyPaintModelPatch", model=loaded.out(0))
        inputs = dict(
            positive=positive, negative=negative, vae=vae, image=inpaint["image"], mask=mask,
            disable_initial_latent=bool(inpaint.get("disable_initial_latent", False)),
        )
        if clip is not None:
            inputs.update(clip=clip, prompt=prompt, negative_prompt=negative_prompt)
        encoded = graph.node("SimpAIKrea2AnyPaintConditioning", **inputs)
        sampled = graph.node(
            "KSampler", model=patched.out(0), positive=encoded.out(0), negative=encoded.out(1),
            latent_image=encoded.out(2), seed=seed, steps=steps, cfg=cfg, sampler_name=sampler_name,
            scheduler=scheduler, denoise=float(inpaint.get("denoise", 1.0)),
        )
        if progress_node_id:
            sampled.set_override_display_id(progress_node_id)
        decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
        height, width = inpaint["image"].shape[1:3]
        cropped = graph.node("ImageCrop", image=decoded.out(0), width=width, height=height, x=0, y=0)
        return {"result": (cropped.out(0),), "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    "SimpAIKrea2DepthControl": SimpAIKrea2DepthControl,
    "SimpAIKrea2PoseConditioning": SimpAIKrea2PoseConditioning,
    "SimpAIAIOReferenceKrea2": SimpAIAIOReferenceKrea2,
    "SimpAIKrea2AnyPaintModelPatch": SimpAIKrea2AnyPaintModelPatch,
    "SimpAIKrea2AnyPaintConditioning": SimpAIKrea2AnyPaintConditioning,
    "SimpAIAIOInpaintKrea2": SimpAIAIOInpaintKrea2,
}
NODE_DISPLAY_NAME_MAPPINGS = {name: name.replace("SimpAI", "SimpAI ") for name in NODE_CLASS_MAPPINGS}
