"""Sampling-scoped Spectrum for the native MOSS presets."""


class SimpAIMossSpectrum:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"model": ("MODEL",), "enabled": ("BOOLEAN", {"default": False})},
            "optional": {
                "window_size": ("FLOAT", {"default": 2.0, "min": 1.0, "max": 20.0}),
                "flex_window": ("FLOAT", {"default": 0.25, "min": 0.0, "max": 1.0}),
                "warmup_steps": ("INT", {"default": 6, "min": 0, "max": 10000}),
                "tail_actual_steps": ("INT", {"default": 3, "min": 0, "max": 10000}),
            },
        }

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "patch"
    CATEGORY = "SimpAI/model_patches"

    def patch(self, model, enabled=False, window_size=2.0, flex_window=0.25,
              warmup_steps=6, tail_actual_steps=3):
        if not enabled:
            return (model,)
        from .spectrum_moss.model_patch_moss import apply_moss_model_patch

        return (apply_moss_model_patch(
            model, enabled=True, window_size=window_size, flex_window=flex_window,
            warmup_steps=warmup_steps, tail_actual_steps=tail_actual_steps,
            blend_w=0.3, cheby_degree=3, ridge_lambda=0.1, history_size=100,
            one_sampler_only=False, compat_policy="conservative",
        ),)


NODE_CLASS_MAPPINGS = {"SimpAIMossSpectrum": SimpAIMossSpectrum}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIMossSpectrum": "MOSS Spectrum (SimpAI)"}
