from comfy.samplers import SAMPLER_NAMES, SCHEDULER_NAMES
from comfy_execution.graph_utils import GraphBuilder

from .inpaint_worker import mask_blend_parameters


def _mask_from_config(graph, config):
    mask = graph.node("ImageToMask", image=config["mask_image"], channel="red").out(0)
    if config.get("invert_mask", False):
        mask = graph.node("InvertMask", mask=mask).out(0)
    image = config["image"]
    dilation_kernel_size, _, blur_radius = mask_blend_parameters(image.shape[-3], image.shape[-2])
    return graph.node(
        "GrowMaskWithBlur",
        mask=mask,
        expand=(dilation_kernel_size - 1) // 2,
        incremental_expandrate=0,
        tapered_corners=False,
        flip_input=False,
        blur_radius=blur_radius,
        lerp_alpha=1,
        decay_factor=1,
        fill_holes=False,
    ).out(0)


def _patch_differential_diffusion(graph, model, enabled):
    if not enabled:
        return model
    return graph.node("DifferentialDiffusion", model=model, strength=1.0).out(0)


def _sampler_cfg(family, cfg):
    return 1.0 if family == "flux" else float(cfg)


def _engine_enabled(config):
    return str(config.get("engine", "")).strip().casefold() not in ("", "none", "disabled")


def _uses_flux_fill(config):
    return str(config.get("engine", "")).strip().casefold() == "fp8"


class _SimpAIAIOInpaintBase:
    FAMILY = "flux"

    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        if cls.FAMILY == "flux":
            optional["inpaint_model"] = ("MODEL", {"lazy": True})
        if cls.FAMILY in ("sdxl", "qwen"):
            optional["inpaint_control_net"] = ("CONTROL_NET", {"lazy": True})
        optional["progress_node_id"] = ("STRING", {"default": ""})
        optional["use_differential_diffusion"] = ("BOOLEAN", {"default": True})
        return {
            "required": {
                "model": ("MODEL",),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "vae": ("VAE",),
                "inpaint": ("SIMPAI_AIO_INPAINT_CONFIG",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 1125899906842624}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0}),
                "sampler_name": (SAMPLER_NAMES,),
                "scheduler": (SCHEDULER_NAMES,),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/Inpaint"

    def check_lazy_status(self, model, positive, negative, vae, inpaint, seed, steps, cfg,
                          sampler_name, scheduler, inpaint_model=None, inpaint_control_net=None, progress_node_id="",
                          use_differential_diffusion=True):
        if self.FAMILY == "flux" and _uses_flux_fill(inpaint) and inpaint_model is None:
            return ["inpaint_model"]
        if self.FAMILY in ("sdxl", "qwen") and _engine_enabled(inpaint) and inpaint_control_net is None:
            return ["inpaint_control_net"]
        return []

    def expand(self, model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
               inpaint_model=None, inpaint_control_net=None, progress_node_id="", use_differential_diffusion=True):
        graph = GraphBuilder()
        image = inpaint["image"]
        mask = _mask_from_config(graph, inpaint)
        denoise = float(inpaint.get("denoise", 1.0))

        engine_enabled = _engine_enabled(inpaint)
        if self.FAMILY == "sdxl" and engine_enabled and inpaint_control_net is not None:
            prepared = graph.node(
                "InpaintPreprocessor",
                image=image,
                mask=mask,
                black_pixel_for_xinsir_cn=True,
            )
            conditioned = graph.node(
                "ControlNetApplyAdvanced",
                positive=positive,
                negative=negative,
                control_net=inpaint_control_net,
                image=prepared.out(0),
                vae=vae,
                strength=1.0,
                start_percent=0.0,
                end_percent=1.0,
            )
            positive = conditioned.out(0)
            negative = conditioned.out(1)
        elif self.FAMILY == "qwen" and engine_enabled and inpaint_control_net is not None:
            conditioned = graph.node(
                "ControlNetInpaintingAliMamaApply",
                positive=positive,
                negative=negative,
                control_net=inpaint_control_net,
                vae=vae,
                image=image,
                mask=mask,
                strength=1.0,
                start_percent=0.0,
                end_percent=1.0,
            )
            positive = conditioned.out(0)
            negative = conditioned.out(1)

        conditioned = graph.node("InpaintModelConditioning", positive=positive, negative=negative, vae=vae, pixels=image, mask=mask, noise_mask=True)
        latent = conditioned.out(2)
        if inpaint.get("disable_initial_latent", False):
            latent = graph.node("VAEEncodeForInpaint", pixels=image, vae=vae, mask=mask, grow_mask_by=16).out(0)

        if self.FAMILY == "flux" and _uses_flux_fill(inpaint) and inpaint_model is not None:
            model = inpaint_model
        model = _patch_differential_diffusion(graph, model, use_differential_diffusion)

        sampled = graph.node(
            "KSampler",
            model=model,
            positive=conditioned.out(0),
            negative=conditioned.out(1),
            latent_image=latent,
            seed=seed,
            steps=steps,
            cfg=_sampler_cfg(self.FAMILY, cfg),
            sampler_name=sampler_name,
            scheduler=scheduler,
            denoise=denoise,
        )
        if progress_node_id:
            sampled.set_override_display_id(progress_node_id)
        decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
        return {"result": (decoded.out(0),), "expand": graph.finalize()}


class SimpAIAIOInpaintFlux(_SimpAIAIOInpaintBase):
    FAMILY = "flux"


class SimpAIAIOInpaintFlux2(_SimpAIAIOInpaintBase):
    FAMILY = "flux2"


class SimpAIAIOInpaintSDXL(_SimpAIAIOInpaintBase):
    FAMILY = "sdxl"


class SimpAIAIOInpaintQwen(_SimpAIAIOInpaintBase):
    FAMILY = "qwen"


class SimpAIAIOInpaintWan(_SimpAIAIOInpaintBase):
    FAMILY = "wan"

    def expand(self, model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
               inpaint_control_net=None, progress_node_id="", use_differential_diffusion=True):
        graph = GraphBuilder()
        image = inpaint["image"]
        mask = _mask_from_config(graph, inpaint)
        encoded = graph.node("VAEEncode", pixels=image, vae=vae)
        latent = graph.node("SetLatentNoiseMask", samples=encoded.out(0), mask=mask)
        height = int(image.shape[1])
        width = int(image.shape[2])
        conditioned = graph.node(
            "WanVaceToVideo",
            positive=positive,
            negative=negative,
            vae=vae,
            width=width,
            height=height,
            length=1,
            batch_size=1,
            strength=1.0,
            control_video=image,
            control_masks=mask,
        )
        model = _patch_differential_diffusion(graph, model, use_differential_diffusion)
        sampled = graph.node(
            "KSampler",
            model=model,
            positive=conditioned.out(0),
            negative=conditioned.out(1),
            latent_image=latent.out(0),
            seed=seed,
            steps=steps,
            cfg=cfg,
            sampler_name=sampler_name,
            scheduler=scheduler,
            denoise=float(inpaint.get("denoise", 1.0)),
        )
        if progress_node_id:
            sampled.set_override_display_id(progress_node_id)
        decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
        return {"result": (decoded.out(0),), "expand": graph.finalize()}


class SimpAIAIOInpaintZImage(_SimpAIAIOInpaintBase):
    FAMILY = "z_image"

    def expand(self, model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
               inpaint_control_net=None, progress_node_id="", use_differential_diffusion=True):
        if not _engine_enabled(inpaint):
            return super().expand(
                model, positive, negative, vae, inpaint, seed, steps, cfg,
                sampler_name, scheduler, inpaint_control_net, progress_node_id, use_differential_diffusion,
            )
        graph = GraphBuilder()
        image = inpaint["image"]
        mask = _mask_from_config(graph, inpaint)
        encoded = graph.node("VAEEncode", pixels=image, vae=vae)
        latent = graph.node("SetLatentNoiseMask", samples=encoded.out(0), mask=mask)
        model = _patch_differential_diffusion(graph, model, use_differential_diffusion)
        sampled = graph.node(
            "LanPaint_KSampler",
            model=model,
            positive=positive,
            negative=negative,
            latent_image=latent.out(0),
            seed=seed,
            steps=steps,
            cfg=cfg,
            sampler_name=sampler_name,
            scheduler=scheduler,
            denoise=float(inpaint.get("denoise", 1.0)),
            LanPaint_NumSteps=2,
            LanPaint_PromptMode="Image First",
            LanPaint_Info="LanPaint KSampler",
            Inpainting_mode="🖼️ Image Inpainting",
        )
        if progress_node_id:
            sampled.set_override_display_id(progress_node_id)
        decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
        return {"result": (decoded.out(0),), "expand": graph.finalize()}


class SimpAIAIOInpaintAnima(_SimpAIAIOInpaintBase):
    FAMILY = "anima"

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["optional"]["model_patch"] = ("MODEL_PATCH", {"lazy": True})
        return types

    def check_lazy_status(self, model, positive, negative, vae, inpaint, seed, steps, cfg,
                          sampler_name, scheduler, inpaint_control_net=None, progress_node_id="",
                          use_differential_diffusion=True, model_patch=None):
        if str(inpaint.get("engine", "")).strip() == "anima_inpainting" and model_patch is None:
            return ["model_patch"]
        return []

    def expand(self, model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
               inpaint_control_net=None, progress_node_id="", use_differential_diffusion=True, model_patch=None):
        if str(inpaint.get("engine", "")).strip() != "anima_inpainting":
            return super().expand(
                model, positive, negative, vae, inpaint, seed, steps, cfg, sampler_name, scheduler,
                inpaint_control_net, progress_node_id, use_differential_diffusion,
            )
        if model_patch is None:
            raise ValueError("Anima inpainting requires MODEL_PATCH")
        graph = GraphBuilder()
        mask = _mask_from_config(graph, inpaint)
        patched = graph.node("AnimaLLLiteApply", model=model, model_patch=model_patch,
                             image=inpaint["image"], mask=mask, strength=1.0, start_percent=0.0,
                             end_percent=1.0)
        conditioned = graph.node("InpaintModelConditioning", positive=positive, negative=negative, vae=vae,
                                 pixels=inpaint["image"], mask=mask, noise_mask=True)
        sampled = graph.node("KSampler", model=patched.out(0), positive=conditioned.out(0), negative=conditioned.out(1),
                             latent_image=conditioned.out(2), seed=seed, steps=steps, cfg=cfg, sampler_name=sampler_name,
                             scheduler=scheduler, denoise=float(inpaint.get("denoise", 1.0)))
        if progress_node_id:
            sampled.set_override_display_id(progress_node_id)
        decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
        return {"result": (decoded.out(0),), "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    "SimpAIAIOInpaintFlux": SimpAIAIOInpaintFlux,
    "SimpAIAIOInpaintFlux2": SimpAIAIOInpaintFlux2,
    "SimpAIAIOInpaintSDXL": SimpAIAIOInpaintSDXL,
    "SimpAIAIOInpaintQwen": SimpAIAIOInpaintQwen,
    "SimpAIAIOInpaintWan": SimpAIAIOInpaintWan,
    "SimpAIAIOInpaintZImage": SimpAIAIOInpaintZImage,
    "SimpAIAIOInpaintAnima": SimpAIAIOInpaintAnima,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    name: name.replace("SimpAIAIO", "SimpAI AIO ") for name in NODE_CLASS_MAPPINGS
}
