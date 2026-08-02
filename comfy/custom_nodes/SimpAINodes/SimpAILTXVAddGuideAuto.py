from comfy_api.latest import io
from comfy_extras.nodes_lt import (
    LTXVAddGuide,
    _append_guide_attention_entry,
    get_noise_mask,
)

from .ltx_guide_schedule import resolve_ltx_guide_schedule, scene_image_source_present


_MISSING = object()


class SimpAILTXVAddGuideAuto(LTXVAddGuide):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVAddGuideAuto",
            display_name="SimpAI LTX Auto Multi-Frame Guides",
            category="SimpAI/conditioning/ltxv",
            description=(
                "Adds one to five ordered LTX guide images. The first image is placed at frame 0, "
                "the last active image is placed at the final frame, and up to three middle images "
                "use configurable frame indices and strengths. A middle frame index of 0 selects "
                "an evenly spaced position automatically."
            ),
            inputs=[
                io.Conditioning.Input("positive"),
                io.Conditioning.Input("negative"),
                io.Vae.Input("vae"),
                io.Latent.Input("latent"),
                io.Image.Input("image_1"),
                io.String.Input(
                    "guide_config",
                    default="{}",
                    multiline=True,
                    tooltip="Structured first, middle, and last guide settings.",
                ),
                io.Image.Input("image_2", optional=True, lazy=True),
                io.Image.Input("image_3", optional=True, lazy=True),
                io.Image.Input("image_4", optional=True, lazy=True),
                io.Image.Input("image_5", optional=True, lazy=True),
                io.String.Input("image_2_source", optional=True, advanced=True),
                io.String.Input("image_3_source", optional=True, advanced=True),
                io.String.Input("image_4_source", optional=True, advanced=True),
                io.String.Input("image_5_source", optional=True, advanced=True),
            ],
            outputs=[
                io.Conditioning.Output(display_name="positive"),
                io.Conditioning.Output(display_name="negative"),
                io.Latent.Output(display_name="latent"),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        image_2=_MISSING,
        image_3=_MISSING,
        image_4=_MISSING,
        image_5=_MISSING,
        image_2_source=None,
        image_3_source=None,
        image_4_source=None,
        image_5_source=None,
        **_kwargs,
    ):
        required = []
        images = (image_2, image_3, image_4, image_5)
        sources = (image_2_source, image_3_source, image_4_source, image_5_source)
        for index, (image, source) in enumerate(zip(images, sources), start=2):
            if image is _MISSING:
                continue
            if source is not None and not scene_image_source_present(source):
                continue
            if image is None:
                required.append(f"image_{index}")
        return required

    @classmethod
    def execute(
        cls,
        positive,
        negative,
        vae,
        latent,
        image_1,
        guide_config,
        image_2=None,
        image_3=None,
        image_4=None,
        image_5=None,
        image_2_source=None,
        image_3_source=None,
        image_4_source=None,
        image_5_source=None,
    ) -> io.NodeOutput:
        images = [image_1, image_2, image_3, image_4, image_5]
        sources = [None, image_2_source, image_3_source, image_4_source, image_5_source]
        active_images = []
        for image, source in zip(images, sources):
            if image is None:
                continue
            if source is not None and not scene_image_source_present(source):
                continue
            active_images.append(image)

        scale_factors = vae.downscale_index_formula
        latent_image = latent["samples"]
        noise_mask = get_noise_mask(latent)
        _, _, latent_length, latent_height, latent_width = latent_image.shape
        total_frames = (latent_length - 1) * int(scale_factors[0]) + 1
        schedule = resolve_ltx_guide_schedule(
            len(active_images),
            total_frames,
            guide_config=guide_config,
        )

        for image, (frame_idx, strength) in zip(active_images, schedule):
            encoded_image, guide_latent = cls.encode(vae, latent_width, latent_height, image, scale_factors)
            frame_idx, latent_idx = cls.get_latent_index(
                positive,
                latent_length,
                len(encoded_image),
                frame_idx,
                scale_factors,
            )
            if latent_idx + guide_latent.shape[2] > latent_length:
                raise ValueError(
                    "Conditioning frames exceed the length of the latent sequence."
                )
            positive, negative, latent_image, noise_mask = cls.append_keyframe(
                positive,
                negative,
                frame_idx,
                latent_image,
                noise_mask,
                guide_latent,
                strength,
                scale_factors,
            )
            guide_latent_shape = list(guide_latent.shape[2:])
            pre_filter_count = guide_latent.shape[2] * guide_latent.shape[3] * guide_latent.shape[4]
            positive, negative = _append_guide_attention_entry(
                positive,
                negative,
                pre_filter_count,
                guide_latent_shape,
                strength=strength,
            )

        return io.NodeOutput(
            positive,
            negative,
            {"samples": latent_image, "noise_mask": noise_mask},
        )


NODE_CLASS_MAPPINGS = {
    "SimpAILTXVAddGuideAuto": SimpAILTXVAddGuideAuto,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAILTXVAddGuideAuto": "SimpAI LTX Auto Multi-Frame Guides",
}
