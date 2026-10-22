MAX_RESOLUTION = 32768


class SimpAIAIOReferenceConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"lazy": True}),
                "mode": ("INT", {"default": 0, "min": 0, "max": 6, "step": 1}),
                "weight": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.01}),
                "stop_percent": ("FLOAT", {"default": 0.6, "min": 0.0, "max": 1.0, "step": 0.01}),
                "skip_preprocessor": ("BOOLEAN", {"default": False}),
            },
            "optional": {"skip_inactive": ("BOOLEAN", {"default": False})},
        }

    RETURN_TYPES = ("SIMPAI_AIO_REFERENCE_CONFIG",)
    RETURN_NAMES = ("reference",)
    FUNCTION = "build"
    CATEGORY = "SimpAI/AIO/Input"

    def check_lazy_status(self, image, mode, weight, stop_percent, skip_preprocessor, skip_inactive=False):
        if skip_inactive and (float(weight) == 0 or float(stop_percent) <= 0):
            return []
        if int(mode) > 0 and image is None:
            return ["image"]
        return []

    def build(self, image=None, mode=0, weight=0.7, stop_percent=0.6, skip_preprocessor=False, skip_inactive=False):
        return ({
            "image": image,
            "mode": int(mode),
            "weight": float(weight),
            "stop_percent": float(stop_percent),
            "skip_preprocessor": bool(skip_preprocessor),
        },)


class SimpAIAIOUOVConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": ("INT", {"default": 0, "min": 0, "max": 5, "step": 1}),
                "mix_reference": ("BOOLEAN", {"default": False}),
                "multiple": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 4.0, "step": 0.1}),
                "tile_width": ("INT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "tile_height": ("INT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "tile_steps": ("INT", {"default": 12, "min": 1, "max": 10000, "step": 1}),
                "hires_weight": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 2.0, "step": 0.01}),
                "hires_stop": ("FLOAT", {"default": 0.8, "min": 0.0, "max": 1.0, "step": 0.01}),
                "hires_blur": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 64.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("SIMPAI_AIO_UOV_CONFIG",)
    RETURN_NAMES = ("uov",)
    FUNCTION = "build"
    CATEGORY = "SimpAI/AIO/Input"

    def build(self, image, mode, mix_reference, multiple, tile_width, tile_height, tile_steps, hires_weight, hires_stop, hires_blur):
        return ({
            "image": image,
            "mode": int(mode),
            "mix_reference": bool(mix_reference),
            "multiple": float(multiple),
            "tile_width": int(tile_width),
            "tile_height": int(tile_height),
            "tile_steps": int(tile_steps),
            "hires_weight": float(hires_weight),
            "hires_stop": float(hires_stop),
            "hires_blur": float(hires_blur),
        },)


class SimpAIAIOInpaintConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask_image": ("IMAGE",),
                "mode": ("INT", {"default": 2, "min": 0, "max": 2, "step": 1}),
                "engine": ("STRING", {"default": "None"}),
                "invert_mask": ("BOOLEAN", {"default": False}),
                "mix_reference": ("BOOLEAN", {"default": False}),
                "disable_initial_latent": ("BOOLEAN", {"default": False}),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("SIMPAI_AIO_INPAINT_CONFIG",)
    RETURN_NAMES = ("inpaint",)
    FUNCTION = "build"
    CATEGORY = "SimpAI/AIO/Input"

    def build(self, image, mask_image, mode, engine, invert_mask, mix_reference, disable_initial_latent, denoise):
        return ({
            "image": image,
            "mask_image": mask_image,
            "mode": int(mode),
            "engine": str(engine),
            "invert_mask": bool(invert_mask),
            "mix_reference": bool(mix_reference),
            "disable_initial_latent": bool(disable_initial_latent),
            "denoise": float(denoise),
        },)


class SimpAIAIORegionConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "detection_prompt": ("STRING", {"default": "", "multiline": False}),
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
                "mask_model": (["u2net", "u2netp", "u2net_human_seg", "u2net_cloth_seg", "silueta", "isnet-general-use", "isnet-anime", "sam"], {"default": "sam"}),
                "cloth_category": (["full", "upper", "lower"], {"default": "full"}),
                "sam_model": (["vit_b", "vit_l", "vit_h"], {"default": "vit_b"}),
                "text_threshold": ("FLOAT", {"default": 0.3, "min": 0.0, "max": 1.0, "step": 0.05}),
                "box_threshold": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0, "step": 0.05}),
                "max_detections": ("INT", {"default": 0, "min": 0, "max": 10, "step": 1}),
                "invert_mask": ("BOOLEAN", {"default": False}),
                "disable_initial_latent": ("BOOLEAN", {"default": False}),
                "engine": ("STRING", {"default": "None"}),
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "respective_field": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "erode_or_dilate": ("INT", {"default": 0, "min": -64, "max": 64, "step": 1}),
            }
        }

    RETURN_TYPES = ("SIMPAI_AIO_REGION_CONFIG",)
    RETURN_NAMES = ("region",)
    FUNCTION = "build"
    CATEGORY = "SimpAI/AIO/Input"

    def build(self, detection_prompt, prompt, negative_prompt, mask_model, cloth_category, sam_model, text_threshold, box_threshold, max_detections, invert_mask, disable_initial_latent, engine, denoise, respective_field, erode_or_dilate):
        detection_prompt = str(detection_prompt).strip()
        if detection_prompt.casefold() == "none":
            detection_prompt = ""
        return ({
            "detection_prompt": detection_prompt,
            "prompt": str(prompt),
            "negative_prompt": str(negative_prompt),
            "mask_model": str(mask_model),
            "cloth_category": str(cloth_category),
            "sam_model": str(sam_model),
            "text_threshold": float(text_threshold),
            "box_threshold": float(box_threshold),
            "max_detections": int(max_detections),
            "invert_mask": bool(invert_mask),
            "disable_initial_latent": bool(disable_initial_latent),
            "engine": str(engine),
            "denoise": float(denoise),
            "respective_field": float(respective_field),
            "erode_or_dilate": int(erode_or_dilate),
        },)


class SimpAIAIOEnhanceUOVConfig:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "method": (["disabled", "vary (subtle)", "vary (strong)", "upscale (1.5x)", "upscale (2x)", "upscale (fast 2x)"], {"default": "disabled"}),
                "denoise": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "processing_order": (["Before First Enhancement", "After Last Enhancement"], {"default": "Before First Enhancement"}),
                "prompt_type": (["Original Prompts", "Last Filled Enhancement Prompts"], {"default": "Original Prompts"}),
                "multiple": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 4.0, "step": 0.1}),
                "tile_width": ("INT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "tile_height": ("INT", {"default": 1024, "min": 64, "max": MAX_RESOLUTION, "step": 8}),
                "tile_steps": ("INT", {"default": 12, "min": 1, "max": 10000, "step": 1}),
            }
        }

    RETURN_TYPES = ("SIMPAI_AIO_ENHANCE_UOV_CONFIG",)
    RETURN_NAMES = ("enhance_uov",)
    FUNCTION = "build"
    CATEGORY = "SimpAI/AIO/Input"

    def build(self, method, denoise, processing_order, prompt_type, multiple, tile_width, tile_height, tile_steps):
        return ({
            "method": str(method),
            "denoise": float(denoise),
            "processing_order": str(processing_order),
            "prompt_type": str(prompt_type),
            "multiple": float(multiple),
            "tile_width": int(tile_width),
            "tile_height": int(tile_height),
            "tile_steps": int(tile_steps),
        },)


NODE_CLASS_MAPPINGS = {
    "SimpAIAIOReferenceConfig": SimpAIAIOReferenceConfig,
    "SimpAIAIOUOVConfig": SimpAIAIOUOVConfig,
    "SimpAIAIOInpaintConfig": SimpAIAIOInpaintConfig,
    "SimpAIAIORegionConfig": SimpAIAIORegionConfig,
    "SimpAIAIOEnhanceUOVConfig": SimpAIAIOEnhanceUOVConfig,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIAIOReferenceConfig": "SimpAI AIO Reference Config",
    "SimpAIAIOUOVConfig": "SimpAI AIO UOV Config",
    "SimpAIAIOInpaintConfig": "SimpAI AIO Inpaint Config",
    "SimpAIAIORegionConfig": "SimpAI AIO Region Config",
    "SimpAIAIOEnhanceUOVConfig": "SimpAI AIO Enhance UOV Config",
}
