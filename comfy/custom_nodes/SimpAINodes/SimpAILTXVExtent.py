from comfy_api.latest import io
from comfy_extras.nodes_lt import (
    LTXVAddGuide,
    _append_guide_attention_entry,
    get_noise_mask,
)

from .ltx_guide_schedule import (
    parse_ltx_extent_config,
    resolve_ltx_extent_guide_schedule,
    scene_image_source_present,
)
from .ltx_extent_audio import concat_ltx_extent_audio


_MISSING = object()


class SimpAILTXVExtentPrepare(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVExtentPrepare",
            display_name="SimpAI LTX Extent Context",
            category="SimpAI/conditioning/ltxv",
            description=(
                "Selects an 8n+1 tail context from the source video and calculates the target frame counts "
                "for LTX video extension. "
            ),
            inputs=[
                io.Image.Input("source_video"),
                io.Int.Input("extension_frames", default=121, min=1, max=14401, step=8),
                io.Float.Input("frame_rate", default=24.0, min=1.0, max=120.0, step=0.01),
                io.String.Input("guide_config", default="{}", multiline=True),
            ],
            outputs=[
                io.Image.Output(display_name="context_video"),
                io.Int.Output(display_name="target_frames"),
                io.Int.Output(display_name="new_frame_count"),
                io.Int.Output(display_name="continuation_start_index"),
                io.Float.Output(display_name="context_duration"),
                io.Float.Output(display_name="extension_duration"),
            ],
        )

    @classmethod
    def execute(cls, source_video, extension_frames, frame_rate, guide_config) -> io.NodeOutput:
        source_frames = int(source_video.shape[0])
        if source_frames < 1:
            raise ValueError("The source video has no usable frames.")

        config = parse_ltx_extent_config(guide_config)
        available_context_frames = ((source_frames - 1) // 8) * 8 + 1
        context_frames = min(config["context_frames"], available_context_frames)
        context_video = source_video[-context_frames:]

        extension_frames = max(1, int(extension_frames))
        extension_frames = ((extension_frames - 1) // 8) * 8 + 1
        target_frames = context_frames + extension_frames - 1
        new_frame_count = extension_frames - 1
        frame_rate = max(1.0, float(frame_rate))
        context_duration = (context_frames - 1) / frame_rate
        extension_duration = new_frame_count / frame_rate

        return io.NodeOutput(
            context_video,
            target_frames,
            new_frame_count,
            context_frames,
            context_duration,
            extension_duration,
        )


class SimpAILTXVAddGuideExtent(LTXVAddGuide):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVAddGuideExtent",
            display_name="SimpAI LTX Video Extent Guides",
            category="SimpAI/conditioning/ltxv",
            description=(
                "Uses a source-video tail as temporal context and places up to five optional image guides "
                "inside the continuation range."
            ),
            inputs=[
                io.Conditioning.Input("positive"),
                io.Conditioning.Input("negative"),
                io.Vae.Input("vae"),
                io.Latent.Input("latent"),
                io.Image.Input("source_video"),
                io.String.Input("guide_config", default="{}", multiline=True),
                io.Image.Input("image_1", optional=True, lazy=True),
                io.Image.Input("image_2", optional=True, lazy=True),
                io.Image.Input("image_3", optional=True, lazy=True),
                io.Image.Input("image_4", optional=True, lazy=True),
                io.Image.Input("image_5", optional=True, lazy=True),
                io.String.Input("image_1_source", optional=True, advanced=True),
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
        image_1=_MISSING,
        image_2=_MISSING,
        image_3=_MISSING,
        image_4=_MISSING,
        image_5=_MISSING,
        image_1_source=None,
        image_2_source=None,
        image_3_source=None,
        image_4_source=None,
        image_5_source=None,
        **_kwargs,
    ):
        required = []
        images = (image_1, image_2, image_3, image_4, image_5)
        sources = (
            image_1_source,
            image_2_source,
            image_3_source,
            image_4_source,
            image_5_source,
        )
        for index, (image, source) in enumerate(zip(images, sources), start=1):
            if image is _MISSING or not scene_image_source_present(source):
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
        source_video,
        guide_config,
        image_1=None,
        image_2=None,
        image_3=None,
        image_4=None,
        image_5=None,
        image_1_source=None,
        image_2_source=None,
        image_3_source=None,
        image_4_source=None,
        image_5_source=None,
    ) -> io.NodeOutput:
        images = [image_1, image_2, image_3, image_4, image_5]
        sources = [
            image_1_source,
            image_2_source,
            image_3_source,
            image_4_source,
            image_5_source,
        ]
        active_images = [
            image
            for image, source in zip(images, sources)
            if image is not None and scene_image_source_present(source)
        ]

        config = parse_ltx_extent_config(guide_config)
        scale_factors = vae.downscale_index_formula
        latent_image = latent["samples"]
        noise_mask = get_noise_mask(latent)
        _, _, latent_length, latent_height, latent_width = latent_image.shape
        total_frames = (latent_length - 1) * int(scale_factors[0]) + 1
        continuation_start_frame = int(source_video.shape[0]) - 1
        schedule = resolve_ltx_extent_guide_schedule(
            len(active_images),
            continuation_start_frame,
            total_frames,
            guide_config=config,
        )

        def add_guide(image, frame_idx, strength):
            nonlocal positive, negative, latent_image, noise_mask
            encoded_image, guide_latent = cls.encode(
                vae,
                latent_width,
                latent_height,
                image,
                scale_factors,
            )
            resolved_frame_idx, latent_idx = cls.get_latent_index(
                positive,
                latent_length,
                len(encoded_image),
                frame_idx,
                scale_factors,
            )
            if latent_idx + guide_latent.shape[2] > latent_length:
                raise ValueError(
                    "引导帧超出目标视频长度。 / Conditioning frames exceed the target video length."
                )
            positive, negative, latent_image, noise_mask = cls.append_keyframe(
                positive,
                negative,
                resolved_frame_idx,
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

        add_guide(source_video, 0, config["source_strength"])
        for image, (frame_idx, strength) in zip(active_images, schedule):
            add_guide(image, frame_idx, strength)

        return io.NodeOutput(
            positive,
            negative,
            {"samples": latent_image, "noise_mask": noise_mask},
        )


class SimpAILTXVConcatExtentAudio(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVConcatExtentAudio",
            display_name="SimpAI LTX Extent Audio / LTX 续写音频",
            category="SimpAI/audio",
            description=(
                "Preserves source audio when available, or inserts source-length silence before the generated "
                "continuation audio. "
            ),
            inputs=[
                io.Audio.Input("source_audio"),
                io.Audio.Input("generated_audio"),
                io.Int.Input("source_frame_count", default=1, min=0, max=999999999),
                io.Float.Input("frame_rate", default=24.0, min=0.01, max=120.0, step=0.01),
            ],
            outputs=[io.Audio.Output(display_name="audio")],
        )

    @classmethod
    def execute(cls, source_audio, generated_audio, source_frame_count, frame_rate) -> io.NodeOutput:
        return io.NodeOutput(
            concat_ltx_extent_audio(
                source_audio,
                generated_audio,
                source_frame_count,
                frame_rate,
            )
        )


NODE_CLASS_MAPPINGS = {
    "SimpAILTXVExtentPrepare": SimpAILTXVExtentPrepare,
    "SimpAILTXVAddGuideExtent": SimpAILTXVAddGuideExtent,
    "SimpAILTXVConcatExtentAudio": SimpAILTXVConcatExtentAudio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAILTXVExtentPrepare": "SimpAI LTX Extent Context",
    "SimpAILTXVAddGuideExtent": "SimpAI LTX Video Extent Guides",
    "SimpAILTXVConcatExtentAudio": "SimpAI LTX Extent Audio",
}
