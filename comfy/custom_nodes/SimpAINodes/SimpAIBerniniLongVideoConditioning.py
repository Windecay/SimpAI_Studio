import torch
import nodes
import comfy.model_management
import comfy.utils
import node_helpers
from comfy_api.latest import io


def _resize_to_canvas(image, width, height):
    return comfy.utils.common_upscale(
        image[:, :, :, :3].movedim(-1, 1),
        width,
        height,
        "area",
        "center",
    ).movedim(1, -1)


def _resize_long_edge(image, max_size, stride=16):
    h, w = image.shape[1], image.shape[2]
    scale = min(max_size / max(h, w), 1.0)
    nh = max(stride, round(h * scale / stride) * stride)
    nw = max(stride, round(w * scale / stride) * stride)
    return comfy.utils.common_upscale(
        image[:, :, :, :3].movedim(-1, 1),
        nw,
        nh,
        "area",
        "disabled",
    ).movedim(1, -1)


def _pad_or_trim_frames(frames, length):
    frame_count = frames.shape[0]
    if frame_count == length:
        return frames
    if frame_count > length:
        return frames[:length]
    if frame_count <= 0:
        return frames
    pad = frames[-1:].repeat((length - frame_count, 1, 1, 1))
    return torch.cat([frames, pad], dim=0)


class SimpAIBerniniLongVideoConditioning(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIBerniniLongVideoConditioning",
            display_name="SimpAI Bernini Long Video Conditioning",
            category="conditioning/video_models",
            description=(
                "Bernini in-context conditioning with optional previous frame prefix. "
                "For long video workflows, feed the previous segment frames here, then remove "
                "the reported inherited_prefix_frames from the decoded output before appending."
            ),
            inputs=[
                io.Conditioning.Input("positive"),
                io.Conditioning.Input("negative"),
                io.Vae.Input("vae"),
                io.Int.Input("width", default=832, min=16, max=nodes.MAX_RESOLUTION, step=16),
                io.Int.Input("height", default=480, min=16, max=nodes.MAX_RESOLUTION, step=16),
                io.Int.Input("length", default=81, min=1, max=nodes.MAX_RESOLUTION, step=4),
                io.Int.Input("batch_size", default=1, min=1, max=4096),
                io.Int.Input("inherited_prefix_frames", default=9, min=0, max=nodes.MAX_RESOLUTION, step=1),
                io.Int.Input("ref_max_size", default=848, min=16, max=nodes.MAX_RESOLUTION, step=16),
                io.Boolean.Input(
                    "allow_short_context",
                    default=False,
                    optional=True,
                    advanced=True,
                    tooltip="Keep a shorter source context instead of expanding it to the target length.",
                ),
                io.Image.Input("source_video", optional=True),
                io.Image.Input(
                    "context_video",
                    optional=True,
                    advanced=True,
                    tooltip="Optional reduced video used only for context_latents; source_video keeps the output length.",
                ),
                io.Image.Input("previous_frames", optional=True),
                io.Image.Input("reference_video", optional=True),
                io.Autogrow.Input(
                    "reference_images",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Image.Input("reference_image"),
                        prefix="reference_image_",
                        min=0,
                        max=8,
                    ),
                ),
            ],
            outputs=[
                io.Conditioning.Output(display_name="positive"),
                io.Conditioning.Output(display_name="negative"),
                io.Latent.Output(display_name="latent"),
                io.Int.Output(display_name="inherited_prefix_frames"),
                io.Latent.Output(display_name="source_latent"),
            ],
        )

    @classmethod
    def execute(
        cls,
        positive,
        negative,
        vae,
        width,
        height,
        length,
        batch_size,
        inherited_prefix_frames,
        ref_max_size,
        source_video=None,
        context_video=None,
        previous_frames=None,
        reference_video=None,
        reference_images=None,
        allow_short_context=False,
    ) -> io.NodeOutput:
        length = max(1, int(length))
        batch_size = max(1, int(batch_size))
        inherited_prefix_frames = max(0, int(inherited_prefix_frames))

        latent = torch.zeros(
            [batch_size, 16, ((length - 1) // 4) + 1, height // 8, width // 8],
            device=comfy.model_management.intermediate_device(),
        )

        prefix = None
        if previous_frames is not None and inherited_prefix_frames > 0:
            actual_prefix = min(inherited_prefix_frames, previous_frames.shape[0], length)
            if source_video is not None:
                actual_prefix = min(actual_prefix, max(0, length - 1))
            if actual_prefix > 0:
                prefix = _resize_to_canvas(previous_frames[-actual_prefix:], width, height)
        else:
            actual_prefix = 0

        context = []
        source_context = None
        source_latent_context = None

        if source_video is not None:
            if actual_prefix > 0:
                source_slice = source_video[actual_prefix:length]
            else:
                source_slice = source_video[:length]
            if source_slice.shape[0] == 0 and source_video.shape[0] > 0:
                source_slice = source_video[-1:]
            source_latent_context = _resize_to_canvas(source_slice, width, height)
            if prefix is not None:
                source_latent_context = torch.cat([prefix, source_latent_context], dim=0)
            source_latent_context = _pad_or_trim_frames(source_latent_context, length)

            if context_video is None:
                source_context = source_latent_context
            else:
                if actual_prefix > 0:
                    context_slice = context_video[actual_prefix:length]
                else:
                    context_slice = context_video[:length]
                if context_slice.shape[0] == 0 and context_video.shape[0] > 0:
                    context_slice = context_video if allow_short_context else context_video[-1:]
                source_context = _resize_to_canvas(context_slice, width, height)
                if prefix is not None:
                    source_context = torch.cat([prefix, source_context], dim=0)
                if not allow_short_context:
                    source_context = _pad_or_trim_frames(source_context, length)
        elif context_video is not None:
            source_context = _resize_to_canvas(context_video[:length], width, height)
            if prefix is not None:
                source_context = torch.cat([prefix, source_context], dim=0)
            if not allow_short_context:
                source_context = _pad_or_trim_frames(source_context, length)
        elif prefix is not None:
            source_context = prefix

        if source_latent_context is not None:
            source_samples = vae.encode(source_latent_context[:, :, :, :3])
            source_latent = {"samples": source_samples}
            if context_video is None:
                context.append(source_samples)
        elif source_context is not None and context_video is None:
            source_samples = vae.encode(source_context[:, :, :, :3])
            context.append(source_samples)
            source_latent = {"samples": source_samples}
        else:
            source_latent = {"samples": latent}

        if source_context is not None and context_video is not None:
            context.append(vae.encode(source_context[:, :, :, :3]))

        if reference_video is not None:
            ref_vid = _resize_long_edge(reference_video[:length], ref_max_size)
            context.append(vae.encode(ref_vid[:, :, :, :3]))

        if reference_images:
            for name in sorted(reference_images):
                imgs = reference_images[name]
                if imgs is None:
                    continue
                for i in range(imgs.shape[0]):
                    img = _resize_long_edge(imgs[i:i + 1], ref_max_size)
                    context.append(vae.encode(img[:, :, :, :3]))

        if context:
            positive = node_helpers.conditioning_set_values(positive, {"context_latents": context})
            negative = node_helpers.conditioning_set_values(negative, {"context_latents": context})

        return io.NodeOutput(positive, negative, {"samples": latent}, actual_prefix, source_latent)


NODE_CLASS_MAPPINGS = {
    "SimpAIBerniniLongVideoConditioning": SimpAIBerniniLongVideoConditioning,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIBerniniLongVideoConditioning": "SimpAI Bernini Long Video Conditioning",
}
