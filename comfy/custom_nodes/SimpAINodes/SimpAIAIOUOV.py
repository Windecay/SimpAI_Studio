from comfy.samplers import SAMPLER_NAMES, SCHEDULER_NAMES
from comfy_execution.graph_utils import GraphBuilder


TILED_PROMPT_GUARD_LONG_EDGE = 6000

_TAG_QUALITY_PROMPT = (
    "masterpiece, best quality, absurdres, very aesthetic, amazing quality, "
    "highres, ultra detailed"
)
_GENERIC_QUALITY_PROMPT = (
    "masterpiece, best quality, ultra detailed, high resolution, clean fine detail"
)
_WAN_QUALITY_PROMPT = (
    "(masterpiece:1.2), (best quality:1.2), ultra high resolution, "
    "(ultra-detailed), (beautiful and aesthetic:1.2), high texture, 4K"
)

QUALITY_PROMPTS = {
    "anima": _TAG_QUALITY_PROMPT,
    "flux": _GENERIC_QUALITY_PROMPT,
    "flux2": _GENERIC_QUALITY_PROMPT,
    "qwen": _GENERIC_QUALITY_PROMPT,
    "sdxl": _TAG_QUALITY_PROMPT,
    "wan": _WAN_QUALITY_PROMPT,
    "z_image": _GENERIC_QUALITY_PROMPT,
}


class SimpAIAIOTilePromptGuard:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "original": ("CONDITIONING",),
            "quality": ("CONDITIONING",),
            "upscale_by": ("FLOAT", {"default": 1.5, "min": 0.01, "max": 16.0, "step": 0.01}),
            "long_edge_threshold": ("INT", {"default": TILED_PROMPT_GUARD_LONG_EDGE, "min": 1, "max": 16384}),
        }}

    RETURN_TYPES = ("CONDITIONING",)
    RETURN_NAMES = ("positive",)
    FUNCTION = "select"
    CATEGORY = "SimpAI/AIO/UOV/Internal"

    def select(self, image, original, quality, upscale_by, long_edge_threshold):
        height = int(image.shape[-3])
        width = int(image.shape[-2])
        target_long_edge = max(height, width) * float(upscale_by)
        return (quality if target_long_edge > int(long_edge_threshold) else original,)


def _quality_conditioning(graph, family, clip, guidance):
    text = QUALITY_PROMPTS.get(family, _GENERIC_QUALITY_PROMPT)
    if family == "flux":
        return graph.node(
            "CLIPTextEncodeFlux",
            clip=clip,
            clip_l=text,
            t5xxl=text,
            guidance=guidance,
        ).out(0)
    return graph.node("CLIPTextEncode", clip=clip, text=text).out(0)


def _tiled_target_long_edge(image, multiple):
    height = int(image.shape[-3])
    width = int(image.shape[-2])
    return max(height, width) * float(multiple)


def _tiled_guard_needs_quality_prompt(image, multiple):
    return _tiled_target_long_edge(image, multiple) > TILED_PROMPT_GUARD_LONG_EDGE


def _upscale_target_size(image, multiple):
    height = int(image.shape[-3])
    width = int(image.shape[-2])
    return max(1, int(width * float(multiple))), max(1, int(height * float(multiple)))


def _tiled_vae_decode(uov):
    return bool(uov.get("tiled_decode", True))


class _SimpAIAIOUOVBase:
    FAMILY = "base"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"lazy": True}),
                "clip": ("CLIP", {"lazy": True}),
                "positive": ("CONDITIONING", {"lazy": True}),
                "negative": ("CONDITIONING", {"lazy": True}),
                "vae": ("VAE", {"lazy": True}),
                "upscale_model": ("UPSCALE_MODEL", {"lazy": True}),
                "uov": ("SIMPAI_AIO_UOV_CONFIG",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 1125899906842624}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0}),
                "sampler_name": (SAMPLER_NAMES,),
                "scheduler": (SCHEDULER_NAMES,),
            },
            "optional": {
                "progress_node_id": ("STRING", {"default": ""}),
                "denoise": ("FLOAT", {"default": -1.0, "min": -1.0, "max": 1.0, "step": 0.01}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/UOV"

    def check_lazy_status(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg, sampler_name, scheduler, progress_node_id="", denoise=-1.0):
        mode = int(uov.get("mode", 0))
        if mode <= 0:
            return []
        if mode == 1:
            required = ("upscale_model",)
        elif mode in (2, 3):
            required = ("model", "positive", "negative", "vae")
        else:
            required = ["model", "positive", "negative", "vae", "upscale_model"]
            if _tiled_guard_needs_quality_prompt(uov["image"], uov.get("multiple", 1.5)):
                required.append("clip")
        values = {
            "model": model,
            "clip": clip,
            "positive": positive,
            "negative": negative,
            "vae": vae,
            "upscale_model": upscale_model,
        }
        return [name for name in required if values[name] is None]

    def _guard_tiled_positive(self, graph, image, clip, positive, multiple, cfg):
        if not _tiled_guard_needs_quality_prompt(image, multiple):
            return positive
        quality = _quality_conditioning(graph, self.FAMILY, clip, cfg)
        return graph.node(
            "SimpAIAIOTilePromptGuard",
            image=image,
            original=positive,
            quality=quality,
            upscale_by=multiple,
            long_edge_threshold=TILED_PROMPT_GUARD_LONG_EDGE,
        ).out(0)

    def expand(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg, sampler_name, scheduler, progress_node_id="", denoise=-1.0):
        mode = int(uov.get("mode", 0))
        image = uov["image"]
        if mode <= 0:
            return (image,)

        graph = GraphBuilder()
        multiple = float(uov.get("multiple", 1.5))
        denoise_override = float(denoise)
        sampler_cfg = 1.0 if self.FAMILY == "flux" else float(cfg)
        if mode == 1:
            upscaled = graph.node("ImageUpscaleWithModel", upscale_model=upscale_model, image=image)
            target_width, target_height = _upscale_target_size(image, multiple)
            scaled = graph.node(
                "ImageScale",
                image=upscaled.out(0),
                upscale_method="lanczos",
                width=target_width,
                height=target_height,
                crop="disabled",
            )
            output = scaled.out(0)
        elif mode in (2, 3):
            effective_denoise = denoise_override if denoise_override >= 0.0 else (0.5 if mode == 2 else 0.85)
            encoded = graph.node("VAEEncode", pixels=image, vae=vae)
            sampled = graph.node(
                "KSampler",
                model=model,
                positive=positive,
                negative=negative,
                latent_image=encoded.out(0),
                seed=seed,
                steps=steps,
                cfg=sampler_cfg,
                sampler_name=sampler_name,
                scheduler=scheduler,
                denoise=effective_denoise,
            )
            if progress_node_id:
                sampled.set_override_display_id(progress_node_id)
            decoded = graph.node("VAEDecode", samples=sampled.out(0), vae=vae)
            output = decoded.out(0)
        else:
            positive = self._guard_tiled_positive(graph, image, clip, positive, multiple, cfg)
            tiled = graph.node(
                "UltimateSDUpscale",
                image=image,
                model=model,
                positive=positive,
                negative=negative,
                vae=vae,
                upscale_model=upscale_model,
                upscale_by=multiple,
                seed=seed,
                steps=int(uov.get("tile_steps", steps)),
                cfg=sampler_cfg,
                sampler_name=sampler_name,
                scheduler=scheduler,
                denoise=denoise_override if denoise_override >= 0.0 else 0.5,
                mode_type="Chess",
                tile_width=int(uov.get("tile_width", 1024)),
                tile_height=int(uov.get("tile_height", 1024)),
                mask_blur=64 if self.FAMILY in ("sdxl", "wan") else 32,
                tile_padding=128,
                seam_fix_mode="None",
                seam_fix_denoise=1.0,
                seam_fix_width=64,
                seam_fix_mask_blur=8,
                seam_fix_padding=16,
                force_uniform_tiles=True,
                tiled_decode=_tiled_vae_decode(uov),
            )
            if progress_node_id:
                tiled.set_override_display_id(progress_node_id)
            output = tiled.out(0)

        return {"result": (output,), "expand": graph.finalize()}


def _family_node(name, family):
    return type(name, (_SimpAIAIOUOVBase,), {"FAMILY": family})


SimpAIAIOUOVFlux = _family_node("SimpAIAIOUOVFlux", "flux")
SimpAIAIOUOVSDXL = _family_node("SimpAIAIOUOVSDXL", "sdxl")
SimpAIAIOUOVQwen = _family_node("SimpAIAIOUOVQwen", "qwen")
SimpAIAIOUOVWan = _family_node("SimpAIAIOUOVWan", "wan")
SimpAIAIOUOVZImage = _family_node("SimpAIAIOUOVZImage", "z_image")
SimpAIAIOUOVFlux2 = _family_node("SimpAIAIOUOVFlux2", "flux2")


class SimpAIAIOUOVAnima(_SimpAIAIOUOVBase):
    FAMILY = "anima"

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["optional"]["model_patch"] = ("MODEL_PATCH", {"lazy": True})
        return types

    def check_lazy_status(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg,
                          sampler_name, scheduler, progress_node_id="", denoise=-1.0, model_patch=None):
        missing = super().check_lazy_status(model, clip, positive, negative, vae, upscale_model, uov, seed,
                                            steps, cfg, sampler_name, scheduler, progress_node_id, denoise)
        if int(uov.get("mode", 0)) == 4 and model_patch is None:
            missing.append("model_patch")
        return missing

    def expand(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg, sampler_name,
               scheduler, progress_node_id="", denoise=-1.0, model_patch=None):
        if int(uov.get("mode", 0)) != 4:
            return super().expand(model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg, sampler_name, scheduler, progress_node_id, denoise)
        if model_patch is None:
            raise ValueError("Anima tiled upscale requires MODEL_PATCH")
        graph = GraphBuilder()
        positive = self._guard_tiled_positive(
            graph, uov["image"], clip, positive, float(uov.get("multiple", 1.5)), cfg
        )
        patched = graph.node("AnimaLLLiteApply", model=model, model_patch=model_patch,
                             image=uov["image"], strength=0.35, start_percent=0.0, end_percent=0.50)
        tiled = graph.node("UltimateSDUpscale", image=uov["image"], model=patched.out(0), positive=positive,
                           negative=negative, vae=vae, upscale_model=upscale_model, upscale_by=float(uov.get("multiple", 1.5)),
                           seed=seed, steps=int(uov.get("tile_steps", steps)), cfg=cfg, sampler_name=sampler_name,
                           scheduler=scheduler, denoise=float(denoise) if float(denoise) >= 0.0 else 0.5,
                           mode_type="Chess", tile_width=int(uov.get("tile_width", 1024)),
                           tile_height=int(uov.get("tile_height", 1024)), mask_blur=32, tile_padding=128,
                           seam_fix_mode="None", seam_fix_denoise=1.0, seam_fix_width=64, seam_fix_mask_blur=8,
                           seam_fix_padding=16, force_uniform_tiles=True, tiled_decode=_tiled_vae_decode(uov))
        if progress_node_id:
            tiled.set_override_display_id(progress_node_id)
        return {"result": (tiled.out(0),), "expand": graph.finalize()}


class SimpAIAIOUOVChenkin(_SimpAIAIOUOVBase):
    FAMILY = "sdxl"

    @classmethod
    def INPUT_TYPES(cls):
        types = super().INPUT_TYPES()
        types["optional"]["tile_control_net"] = ("CONTROL_NET", {"lazy": True})
        return types

    def check_lazy_status(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg,
                          sampler_name, scheduler, progress_node_id="", denoise=-1.0, tile_control_net=None):
        missing = super().check_lazy_status(model, clip, positive, negative, vae, upscale_model, uov, seed, steps,
                                            cfg, sampler_name, scheduler, progress_node_id, denoise)
        if int(uov.get("mode", 0)) == 4 and tile_control_net is None:
            missing.append("tile_control_net")
        return missing

    def expand(self, model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg, sampler_name,
               scheduler, progress_node_id="", denoise=-1.0, tile_control_net=None):
        if int(uov.get("mode", 0)) != 4:
            return super().expand(model, clip, positive, negative, vae, upscale_model, uov, seed, steps, cfg,
                                  sampler_name, scheduler, progress_node_id, denoise)
        graph = GraphBuilder()
        positive = self._guard_tiled_positive(
            graph, uov["image"], clip, positive, float(uov.get("multiple", 1.5)), cfg
        )
        applied = graph.node("ControlNetApplyAdvanced", positive=positive, negative=negative,
                             control_net=tile_control_net, image=uov["image"], vae=vae, strength=0.3,
                             start_percent=0.0, end_percent=1.0)
        tiled = graph.node("UltimateSDUpscale", image=uov["image"], model=model, positive=applied.out(0),
                           negative=applied.out(1), vae=vae, upscale_model=upscale_model,
                           upscale_by=float(uov.get("multiple", 1.5)), seed=seed,
                           steps=int(uov.get("tile_steps", steps)), cfg=cfg, sampler_name=sampler_name,
                           scheduler=scheduler, denoise=float(denoise) if float(denoise) >= 0.0 else 0.5,
                           mode_type="Chess",
                           tile_width=int(uov.get("tile_width", 1024)), tile_height=int(uov.get("tile_height", 1024)),
                           mask_blur=64, tile_padding=128, seam_fix_mode="None", seam_fix_denoise=1.0,
                           seam_fix_width=64, seam_fix_mask_blur=8, seam_fix_padding=16,
                           force_uniform_tiles=True, tiled_decode=_tiled_vae_decode(uov))
        if progress_node_id:
            tiled.set_override_display_id(progress_node_id)
        return {"result": (tiled.out(0),), "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    cls.__name__: cls for cls in (
        SimpAIAIOTilePromptGuard,
        SimpAIAIOUOVFlux,
        SimpAIAIOUOVSDXL,
        SimpAIAIOUOVQwen,
        SimpAIAIOUOVWan,
        SimpAIAIOUOVZImage,
        SimpAIAIOUOVFlux2,
        SimpAIAIOUOVAnima,
        SimpAIAIOUOVChenkin,
    )
}


NODE_DISPLAY_NAME_MAPPINGS = {
    name: name.replace("SimpAIAIO", "SimpAI AIO ") for name in NODE_CLASS_MAPPINGS
}
