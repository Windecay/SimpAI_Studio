"""Adapted from bag3labo/moss-image-edit-charref-v2 (see LICENSE.moss-charref)."""

import torch

import comfy.ldm.flux.math
import comfy.ldm.moss_image.model
import comfy.model_patcher
import comfy.samplers


class SimpAIMossCharRefLayout:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",), "latent": ("LATENT",)}}

    RETURN_TYPES = ("MODEL",)
    FUNCTION = "patch"
    CATEGORY = "SimpAI/MOSS"

    def patch(self, model, latent):
        patched = model.clone()
        dit = patched.get_model_object("diffusion_model")
        if not isinstance(dit, comfy.ldm.moss_image.model.MOSSImage):
            raise ValueError("MOSS character reference requires a native MOSS-Image model.")
        target_rows = latent["samples"].shape[-2]
        original = dit.rope

        def rope(h, w, text_len, device, transformer_options=None, ref_shapes=(), f_offset=0):
            pe = original(h, w, text_len, device, transformer_options or {}, ref_shapes, f_offset)
            start = h * w + text_len
            for index, (rows, cols) in enumerate(ref_shapes, 1):
                count = rows * cols
                ids = torch.zeros(1, count, 4, device=device, dtype=torch.float32)
                ids[..., 0] = index
                # The ai-toolkit KV prepass calls RoPE with h=0; use the output height there too.
                ids[..., 2] = (torch.arange(rows, device=device, dtype=torch.float32)
                               - (rows - 1) / 2 + (h or target_rows)).repeat_interleave(cols)
                ids[..., 3] = (torch.arange(cols, device=device, dtype=torch.float32)
                               - (cols - 1) / 2).repeat(rows)
                moved = torch.cat([comfy.ldm.flux.math.rope(ids[..., axis], dim, 10000)
                                   for axis, dim in enumerate(dit.rope_axes_dim)], dim=-3)
                pe[:, start:start + count] = moved.unsqueeze(2).to(pe.dtype)
                start += count
            return pe

        patched.add_object_patch("diffusion_model.rope", rope)
        return (patched,)


def _skip_block(args, _extra_args):
    return args


class _CharRefGuider(comfy.samplers.CFGGuider):
    def __init__(self, model, cfg, reference_guidance):
        super().__init__(model)
        self.set_cfg(cfg)
        self.reference_guidance = reference_guidance

    def predict_noise(self, x, timestep, model_options=None, seed=None):
        model_options = self.model_options if model_options is None else model_options
        skipped = comfy.model_patcher.set_model_options_patch_replace(
            model_options.copy(), _skip_block, "dit", "single_block", 22,
        )
        calc = comfy.samplers.calc_cond_batch
        positive = calc(self.inner_model, [self.conds["positive"]], x, timestep, model_options)[0]
        negative = calc(self.inner_model, [self.conds["negative"]], x, timestep, skipped)[0]
        guided = negative + self.cfg * (positive - negative)
        if self.reference_guidance == 1.0:
            return guided
        no_reference = calc(self.inner_model, [self.conds["negative_no_reference"]], x, timestep, skipped)[0]
        return guided + (self.reference_guidance - 1.0) * (negative - no_reference)


class SimpAIMossCharRefGuider:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",),
            "positive": ("CONDITIONING",),
            "negative": ("CONDITIONING",),
            "negative_no_reference": ("CONDITIONING",),
            "cfg": ("FLOAT", {"default": 3.0, "min": 0.0, "max": 100.0, "step": 0.1}),
            "reference_guidance": ("FLOAT", {"default": 2.5, "min": 1.0, "max": 20.0, "step": 0.05}),
        }}

    RETURN_TYPES = ("GUIDER",)
    FUNCTION = "get_guider"
    CATEGORY = "SimpAI/MOSS"

    def get_guider(self, model, positive, negative, negative_no_reference, cfg, reference_guidance):
        guider = _CharRefGuider(model, cfg, reference_guidance)
        conds = {"positive": positive, "negative": negative}
        if reference_guidance != 1.0:
            conds["negative_no_reference"] = negative_no_reference
        guider.inner_set_conds(conds)
        return (guider,)


NODE_CLASS_MAPPINGS = {
    "SimpAIMossCharRefLayout": SimpAIMossCharRefLayout,
    "SimpAIMossCharRefGuider": SimpAIMossCharRefGuider,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMossCharRefLayout": "MOSS Character Reference Layout",
    "SimpAIMossCharRefGuider": "MOSS Character Reference Guider",
}
