import numpy as np
import torch

from comfy.samplers import SAMPLER_NAMES, SCHEDULER_NAMES
from comfy_execution.graph_utils import GraphBuilder

from .inpaint_worker import InpaintWorker


TILED_PROMPT_GUARD_LONG_EDGE = 6000


def _mask_for_region(graph, image, region):
    mask = graph.node("SimpAIAIORegionMask", image=image, region=region).out(0)
    if region["erode_or_dilate"]:
        mask = graph.node("GrowMask", mask=mask, expand=region["erode_or_dilate"], tapered_corners=True).out(0)
    if region["invert_mask"]:
        mask = graph.node("InvertMask", mask=mask).out(0)
    return mask


def _conditioning_for_region(graph, family, clip, original, text, guidance):
    if not _has_prompt(text):
        return original
    if family == "flux":
        encoded = graph.node("CLIPTextEncodeFlux", clip=clip, clip_l=text, t5xxl=text, guidance=guidance)
    else:
        encoded = graph.node("CLIPTextEncode", clip=clip, text=text)
    return encoded.out(0)


def _has_prompt(text):
    return str(text or "").strip().casefold() not in ("", "none", "null")


def _engine_enabled(region):
    return str(region.get("engine", "")).strip().casefold() not in ("", "none", "disabled")


def _tiled_guard_needs_quality_prompt(image, multiple):
    height = int(image.shape[-3])
    width = int(image.shape[-2])
    return max(height, width) * float(multiple) > TILED_PROMPT_GUARD_LONG_EDGE


def _upscale_target_size(image, multiple):
    height = int(image.shape[-3])
    width = int(image.shape[-2])
    return max(1, int(width * float(multiple))), max(1, int(height * float(multiple)))


def _enhance_uses_region_prompt(regions, enhance_uov):
    if enhance_uov["prompt_type"] != "Last Filled Enhancement Prompts":
        return False
    return any(_has_prompt(region["prompt"]) or _has_prompt(region["negative_prompt"]) for region in regions)


def _stack_same_shape(items, name):
    shapes = {tuple(item.shape) for item in items}
    if len(shapes) != 1:
        raise ValueError(f"{name} produced different crop sizes in one batch: {sorted(shapes)}")
    return torch.stack(items, dim=0)


class SimpAIAIOPrepareRegionInpaint:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "mask": ("MASK",),
            "respective_field": ("FLOAT", {"default": 0.618, "min": 0.0, "max": 1.0, "step": 0.01}),
            "use_fill": ("BOOLEAN", {"default": False}),
        }}

    RETURN_TYPES = ("IMAGE", "MASK", "SIMPAI_AIO_INPAINT_REGION_STATE")
    RETURN_NAMES = ("image", "mask", "state")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/AIO/Improve Detail/Internal"

    def prepare(self, image, mask, respective_field, use_fill):
        workers = []
        images = []
        masks = []
        for image_item, mask_item in zip(image, mask):
            np_image = (image_item.detach().cpu().numpy().clip(0.0, 1.0) * 255.0).round().astype(np.uint8)
            np_mask = (mask_item.detach().cpu().numpy().clip(0.0, 1.0) * 255.0).round().astype(np.uint8)
            worker = InpaintWorker(
                np_image,
                np_mask,
                use_fill=bool(use_fill),
                k=float(respective_field),
                use_upscale_model=False,
            )
            workers.append(worker)
            images.append(torch.from_numpy(worker.interested_image.astype(np.float32) / 255.0))
            masks.append(torch.from_numpy(worker.interested_mask.astype(np.float32) / 255.0))

        return (_stack_same_shape(images, "InpaintWorker image"),
                _stack_same_shape(masks, "InpaintWorker mask"), workers)


class SimpAIAIOFinishRegionInpaint:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",),
            "state": ("SIMPAI_AIO_INPAINT_REGION_STATE",),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "finish"
    CATEGORY = "SimpAI/AIO/Improve Detail/Internal"

    def finish(self, image, state):
        if len(image) != len(state):
            raise ValueError(f"Inpaint result batch ({len(image)}) does not match region state batch ({len(state)})")
        results = []
        for image_item, worker in zip(image, state):
            np_image = (image_item.detach().cpu().numpy().clip(0.0, 1.0) * 255.0).round().astype(np.uint8)
            result = worker.post_process(np_image)
            results.append(torch.from_numpy(result.astype(np.float32) / 255.0))
        return (torch.stack(results, dim=0),)


class SimpAIAIOApplyRegion:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "image": ("IMAGE",), "mask": ("MASK",), "family": (["flux", "flux2", "sdxl", "qwen", "wan", "z_image", "anima", "krea2"],),
            "model": ("MODEL", {"lazy": True}), "positive": ("CONDITIONING", {"lazy": True}),
            "negative": ("CONDITIONING", {"lazy": True}), "vae": ("VAE", {"lazy": True}),
            "region": ("SIMPAI_AIO_REGION_CONFIG",), "seed": ("INT", {"default": 0}), "steps": ("INT", {"default": 20}),
            "cfg": ("FLOAT", {"default": 1.0}), "sampler_name": (SAMPLER_NAMES,), "scheduler": (SCHEDULER_NAMES,),
            "progress_node_id": ("STRING", {"default": ""}),
        }, "optional": {
            "inpaint_model": ("MODEL", {"lazy": True}),
            "inpaint_control_net": ("CONTROL_NET", {"lazy": True}),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/Improve Detail/Internal"

    def check_lazy_status(self, image, mask, family, model, positive, negative, vae, region, seed, steps, cfg, sampler_name, scheduler, progress_node_id="", inpaint_model=None, inpaint_control_net=None):
        if float(mask.detach().abs().max()) <= 1e-6:
            return []
        values = {"model": model, "positive": positive, "negative": negative, "vae": vae}
        required = ["model", "positive", "negative", "vae"]
        if _engine_enabled(region) and family == "flux":
            values["inpaint_model"] = inpaint_model
            required.append("inpaint_model")
        if _engine_enabled(region) and family in ("sdxl", "qwen"):
            values["inpaint_control_net"] = inpaint_control_net
            required.append("inpaint_control_net")
        return [name for name in required if values[name] is None]

    def expand(self, image, mask, family, model, positive, negative, vae, region, seed, steps, cfg, sampler_name, scheduler, progress_node_id="", inpaint_model=None, inpaint_control_net=None):
        if float(mask.detach().abs().max()) <= 1e-6:
            return (image,)
        graph = GraphBuilder()
        prepared = graph.node(
            "SimpAIAIOPrepareRegionInpaint",
            image=image,
            mask=mask,
            respective_field=region["respective_field"],
            use_fill=float(region["denoise"]) > 0.99,
        )
        mask_image = graph.node("MaskToImage", mask=prepared.out(1))
        config = graph.node(
            "SimpAIAIOInpaintConfig", image=prepared.out(0), mask_image=mask_image.out(0), mode=2,
            engine=region["engine"], invert_mask=False, mix_reference=False,
            disable_initial_latent=region["disable_initial_latent"], denoise=region["denoise"],
        )
        inpaint_node = {"flux": "SimpAIAIOInpaintFlux", "flux2": "SimpAIAIOInpaintFlux2", "sdxl": "SimpAIAIOInpaintSDXL", "qwen": "SimpAIAIOInpaintQwen", "wan": "SimpAIAIOInpaintWan", "z_image": "SimpAIAIOInpaintZImage", "anima": "SimpAIAIOInpaintFlux", "krea2": "SimpAIAIOInpaintKrea2"}[family]
        selected_model = inpaint_model if _engine_enabled(region) and inpaint_model is not None else model
        inputs = dict(model=selected_model, positive=positive, negative=negative, vae=vae, inpaint=config.out(0), seed=seed,
                      steps=steps, cfg=cfg, sampler_name=sampler_name, scheduler=scheduler,
                      progress_node_id=progress_node_id,
                      use_differential_diffusion=family not in ("qwen", "anima"))
        if _engine_enabled(region) and inpaint_control_net is not None:
            inputs["inpaint_control_net"] = inpaint_control_net
        repaired = graph.node(inpaint_node, **inputs)
        finished = graph.node("SimpAIAIOFinishRegionInpaint", image=repaired.out(0), state=prepared.out(2))
        return {"result": (finished.out(0),), "expand": graph.finalize()}


class _SimpAIAIOImproveDetailBase:
    FAMILY = "flux"

    @classmethod
    def INPUT_TYPES(cls):
        optional = {
            "fallback_image": ("IMAGE", {"lazy": True}),
            "inpaint_model": ("MODEL", {"lazy": True}),
            "inpaint_control_net": ("CONTROL_NET", {"lazy": True}),
        }
        if cls.FAMILY == "anima":
            optional["model_patch"] = ("MODEL_PATCH", {"lazy": True})
        return {
            "required": {
                "image": ("IMAGE",),
                "model": ("MODEL", {"lazy": True}),
                "clip": ("CLIP", {"lazy": True}),
                "positive": ("CONDITIONING", {"lazy": True}),
                "negative": ("CONDITIONING", {"lazy": True}),
                "vae": ("VAE", {"lazy": True}),
                "upscale_model": ("UPSCALE_MODEL", {"lazy": True}),
                "region_1": ("SIMPAI_AIO_REGION_CONFIG",),
                "region_2": ("SIMPAI_AIO_REGION_CONFIG",),
                "region_3": ("SIMPAI_AIO_REGION_CONFIG",),
                "enhance_uov": ("SIMPAI_AIO_ENHANCE_UOV_CONFIG",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 1125899906842624}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0}),
                "sampler_name": (SAMPLER_NAMES,),
                "scheduler": (SCHEDULER_NAMES,),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("IMAGE", "BOOLEAN", "IMAGE")
    RETURN_NAMES = ("image", "active", "source_image")
    FUNCTION = "expand"
    CATEGORY = "SimpAI/AIO/Improve Detail"

    def check_lazy_status(self, image, model, clip, positive, negative, vae, upscale_model, region_1, region_2, region_3, enhance_uov, seed, steps, cfg, sampler_name, scheduler, fallback_image=None, inpaint_model=None, inpaint_control_net=None, model_patch=None):
        required = []
        image_is_empty = float(image.detach().abs().max()) == 0.0
        if image_is_empty and fallback_image is None:
            required.append("fallback_image")

        regions = (region_1, region_2, region_3)
        regions_active = any(region["detection_prompt"] for region in regions)
        method = enhance_uov["method"]
        if regions_active:
            required.extend(("model", "clip", "positive", "negative", "vae"))
        specialized_regions = any(
            region["detection_prompt"] and _engine_enabled(region)
            for region in regions
        )
        if specialized_regions and self.FAMILY == "flux":
            required.append("inpaint_model")
        if specialized_regions and self.FAMILY in ("sdxl", "qwen"):
            required.append("inpaint_control_net")
        if method == "upscale (fast 2x)":
            required.append("upscale_model")
        elif method != "disabled":
            required.extend(("model", "positive", "negative", "vae", "upscale_model"))
            source_image = fallback_image if image_is_empty and fallback_image is not None else image
            if (
                method in ("upscale (1.5x)", "upscale (2x)")
                and _tiled_guard_needs_quality_prompt(source_image, enhance_uov["multiple"])
            ) or _enhance_uses_region_prompt(regions, enhance_uov):
                required.append("clip")
        if self.FAMILY == "anima" and method in ("upscale (1.5x)", "upscale (2x)"):
            required.append("model_patch")

        values = {
            "model": model,
            "clip": clip,
            "positive": positive,
            "negative": negative,
            "vae": vae,
            "upscale_model": upscale_model,
            "fallback_image": fallback_image,
            "inpaint_model": inpaint_model,
            "inpaint_control_net": inpaint_control_net,
            "model_patch": model_patch,
        }
        return list(dict.fromkeys(name for name in required if values[name] is None))

    def _uov_node(self):
        return {
            "flux": "SimpAIAIOUOVFlux",
            "sdxl": "SimpAIAIOUOVSDXL",
            "qwen": "SimpAIAIOUOVQwen",
            "wan": "SimpAIAIOUOVWan",
            "z_image": "SimpAIAIOUOVZImage",
            "anima": "SimpAIAIOUOVAnima",
            "krea2": "SimpAIAIOUOVKrea2",
        }[self.FAMILY]

    def _inpaint_node(self):
        return {
            "flux": "SimpAIAIOInpaintFlux",
            "sdxl": "SimpAIAIOInpaintSDXL",
            "qwen": "SimpAIAIOInpaintQwen",
            "wan": "SimpAIAIOInpaintWan",
            "z_image": "SimpAIAIOInpaintZImage",
            "anima": "SimpAIAIOInpaintFlux",
            "krea2": "SimpAIAIOInpaintKrea2",
        }[self.FAMILY]

    def _apply_uov(self, graph, image, model, clip, positive, negative, vae, upscale_model, enhance_uov, seed, steps, cfg, sampler_name, scheduler, model_patch=None):
        methods = {
            "disabled": 0,
            "upscale (fast 2x)": 1,
            "vary (subtle)": 2,
            "vary (strong)": 3,
            "upscale (1.5x)": 4,
            "upscale (2x)": 4,
        }
        mode = methods.get(enhance_uov["method"], 0)
        if mode == 1:
            upscaled = graph.node("ImageUpscaleWithModel", upscale_model=upscale_model, image=image)
            target_width, target_height = _upscale_target_size(image, enhance_uov["multiple"])
            return graph.node(
                "ImageScale",
                image=upscaled.out(0),
                upscale_method="lanczos",
                width=target_width,
                height=target_height,
                crop="disabled",
            ).out(0)

        uov = graph.node(
            "SimpAIAIOUOVConfig",
            image=image,
            mode=mode,
            mix_reference=False,
            multiple=enhance_uov["multiple"],
            tile_width=enhance_uov["tile_width"],
            tile_height=enhance_uov["tile_height"],
            tile_steps=enhance_uov["tile_steps"],
            hires_weight=0.5,
            hires_stop=0.8,
            hires_blur=0.0,
        )
        inputs = {
            "model": model,
            "clip": clip,
            "positive": positive,
            "negative": negative,
            "vae": vae,
            "upscale_model": upscale_model,
            "uov": uov.out(0),
            "seed": seed,
            "steps": steps,
            "cfg": cfg,
            "sampler_name": sampler_name,
            "scheduler": scheduler,
            "progress_node_id": "aio_enhance_uov",
            "denoise": enhance_uov["denoise"],
        }
        if self.FAMILY == "anima":
            inputs["model_patch"] = model_patch
        applied = graph.node(self._uov_node(), **inputs)
        return applied.out(0)

    def _uov_conditioning(self, graph, clip, positive, negative, regions, enhance_uov, cfg):
        if enhance_uov["prompt_type"] != "Last Filled Enhancement Prompts":
            return positive, negative
        selected = next((
            region for region in reversed(regions)
            if _has_prompt(region["prompt"]) or _has_prompt(region["negative_prompt"])
        ), None)
        if selected is None:
            return positive, negative
        return (
            _conditioning_for_region(graph, self.FAMILY, clip, positive, selected["prompt"], cfg),
            _conditioning_for_region(graph, self.FAMILY, clip, negative, selected["negative_prompt"], cfg),
        )

    def expand(self, image, model, clip, positive, negative, vae, upscale_model, region_1, region_2, region_3, enhance_uov, seed, steps, cfg, sampler_name, scheduler, fallback_image=None, inpaint_model=None, inpaint_control_net=None, model_patch=None):
        graph = GraphBuilder()
        if fallback_image is not None and float(image.detach().abs().max()) == 0.0:
            image = fallback_image
        source_image = image
        current = image
        regions = (region_1, region_2, region_3)
        active = enhance_uov["method"] != "disabled" or any(region["detection_prompt"] for region in regions)
        uov_positive, uov_negative = self._uov_conditioning(graph, clip, positive, negative, regions, enhance_uov, cfg)
        if enhance_uov["method"] != "disabled" and enhance_uov["processing_order"] == "Before First Enhancement":
            current = self._apply_uov(graph, current, model, clip, uov_positive, uov_negative, vae, upscale_model, enhance_uov, seed, steps, cfg, sampler_name, scheduler, model_patch)

        for index, region in enumerate(regions):
            if not region["detection_prompt"]:
                continue
            mask = _mask_for_region(graph, current, region)
            region_positive = _conditioning_for_region(graph, self.FAMILY, clip, positive, region["prompt"], cfg)
            region_negative = _conditioning_for_region(graph, self.FAMILY, clip, negative, region["negative_prompt"], cfg)
            inputs = {
                "image": current, "mask": mask, "family": self.FAMILY,
                "model": model,
                "positive": region_positive,
                "negative": region_negative,
                "vae": vae,
                "region": region,
                "seed": seed + index,
                "steps": steps,
                "cfg": cfg,
                "sampler_name": sampler_name,
                "scheduler": scheduler,
                "progress_node_id": f"aio_region_{index + 1}",
            }
            if inpaint_model is not None:
                inputs["inpaint_model"] = inpaint_model
            if inpaint_control_net is not None:
                inputs["inpaint_control_net"] = inpaint_control_net
            current = graph.node("SimpAIAIOApplyRegion", **inputs).out(0)

        if enhance_uov["method"] != "disabled" and enhance_uov["processing_order"] == "After Last Enhancement":
            current = self._apply_uov(graph, current, model, clip, uov_positive, uov_negative, vae, upscale_model, enhance_uov, seed, steps, cfg, sampler_name, scheduler, model_patch)

        return {"result": (current, active, source_image), "expand": graph.finalize()}


class SimpAIAIOImproveDetailFlux(_SimpAIAIOImproveDetailBase):
    FAMILY = "flux"


class SimpAIAIOImproveDetailFlux2(_SimpAIAIOImproveDetailBase):
    FAMILY = "flux2"


class SimpAIAIOImproveDetailSDXL(_SimpAIAIOImproveDetailBase):
    FAMILY = "sdxl"


class SimpAIAIOImproveDetailQwen(_SimpAIAIOImproveDetailBase):
    FAMILY = "qwen"


class SimpAIAIOImproveDetailWan(_SimpAIAIOImproveDetailBase):
    FAMILY = "wan"


class SimpAIAIOImproveDetailZImage(_SimpAIAIOImproveDetailBase):
    FAMILY = "z_image"


class SimpAIAIOImproveDetailAnima(_SimpAIAIOImproveDetailBase):
    FAMILY = "anima"


class SimpAIAIOImproveDetailKrea2(_SimpAIAIOImproveDetailBase):
    FAMILY = "krea2"


NODE_CLASS_MAPPINGS = {
    "SimpAIAIOPrepareRegionInpaint": SimpAIAIOPrepareRegionInpaint,
    "SimpAIAIOFinishRegionInpaint": SimpAIAIOFinishRegionInpaint,
    "SimpAIAIOApplyRegion": SimpAIAIOApplyRegion,
    "SimpAIAIOImproveDetailFlux": SimpAIAIOImproveDetailFlux,
    "SimpAIAIOImproveDetailFlux2": SimpAIAIOImproveDetailFlux2,
    "SimpAIAIOImproveDetailSDXL": SimpAIAIOImproveDetailSDXL,
    "SimpAIAIOImproveDetailQwen": SimpAIAIOImproveDetailQwen,
    "SimpAIAIOImproveDetailWan": SimpAIAIOImproveDetailWan,
    "SimpAIAIOImproveDetailZImage": SimpAIAIOImproveDetailZImage,
    "SimpAIAIOImproveDetailAnima": SimpAIAIOImproveDetailAnima,
    "SimpAIAIOImproveDetailKrea2": SimpAIAIOImproveDetailKrea2,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    name: name.replace("SimpAIAIO", "SimpAI AIO ") for name in NODE_CLASS_MAPPINGS
}
