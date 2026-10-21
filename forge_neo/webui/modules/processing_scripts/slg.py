# Adapted from Haoming02/sd-webui-forge-classic PR #1564 (f7afb14cf913).
# The native MOSS model applies the guidance per branch, preserving batch sampling.

from backend.moss_slg import guidance_options
from backend.nn.moss import MOSSImageTransformer
from modules import scripts
from modules.shared import opts


class SkipLayerGuidance(scripts.Script):
    def title(self):
        return "Skip Layer Guidance"

    def show(self, is_img2img):
        return scripts.AlwaysVisible

    def process_before_every_sampling(self, p, *args, **kwargs):
        unet = p.sd_model.forge_objects.unet
        model = unet.model.diffusion_model
        if not isinstance(model, MOSSImageTransformer):
            return
        options, metadata = guidance_options(
            unet.model.predictor, len(model.layers),
            enabled=opts.slg_enable, layers=opts.slg_single_layers,
            start=opts.slg_start_percent, end=opts.slg_end_percent,
        )
        unet = unet.clone()
        unet.model_options["transformer_options"].update(options)
        p.sd_model.forge_objects.unet = unet
        p.extra_generation_params.update(metadata)
