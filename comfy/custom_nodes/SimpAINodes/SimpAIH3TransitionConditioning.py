import node_helpers

from comfy_api.latest import io
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ImageToVideo, _empty_av_latent, _encode_ref_audio

from .SimpAIH3ContinuationOutput import _resize_images
from .SimpAIMiniMaxH3AdaptiveReference import (
    DEFAULT_MAX_IMAGE_LONG_EDGE,
    SimpAIMiniMaxH3AdaptiveReference,
    _plan_references,
    _resize_reference_images,
)


class SimpAIH3TransitionConditioning(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        reference = SimpAIMiniMaxH3AdaptiveReference.define_schema()
        retained = {
            "clip", "vae", "audio_vae", "prompt", "reference_token_budget",
            "max_image_long_edge", "ref_images", "ref_audios",
        }
        return io.Schema(
            node_id="SimpAIH3TransitionConditioning",
            display_name="H3 Transition First and Last Frames",
            category="SimpAI/conditioning/minimax",
            inputs=[io.Custom("H3_TRANSITION").Input("transition")]
            + [item for item in reference.inputs if item.id in retained],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Latent.Output()],
        )

    @classmethod
    def execute(
        cls, transition, clip, vae, prompt, audio_vae=None,
        reference_token_budget=0, max_image_long_edge=DEFAULT_MAX_IMAGE_LONG_EDGE,
        ref_images=None, ref_audios=None,
    ):
        data = transition
        width, height, length = (data[key] for key in ("width", "height", "length"))
        first = _resize_images(data["first"][-data["left"]:][:1], width, height)
        last = _resize_images(data["second"][data["right"] - 1:data["right"]], width, height)
        images = {name: image for name, image in (ref_images or {}).items() if image is not None}
        audios = {name: audio for name, audio in (ref_audios or {}).items() if audio is not None}
        if not images and not audios:
            return MiniMaxH3ImageToVideo.execute(
                clip=clip, vae=vae, prompt=prompt, width=width, height=height,
                length=length, first_frame=first, last_frame=last,
            )

        plan = _plan_references(
            width, height, length, images, None,
            max_image_long_edge, reference_token_budget,
        )
        item_map = {item["name"]: item for item in plan["items"]}
        ref_items, ref_blocks = [], []
        for name, image in images.items():
            item = item_map[name]
            resized = _resize_reference_images(image[:1], item["width"], item["height"])
            ref_items.append({"type": "image", "data": resized})
            ref_blocks.append({
                "kind": "image", "latent_h": item["height"] // 16,
                "latent_w": item["width"] // 16, "latent": vae.encode(resized),
            })
        # Optional pictures keep their UI numbering; endpoint pictures follow them.
        ref_items.extend({"type": "image", "data": image} for image in (first, last))
        for audio in audios.values():
            if audio_vae is None:
                raise ValueError("audio_vae is required when an audio reference is provided")
            audio_latent, ref_audio_t = _encode_ref_audio(audio_vae, audio)
            ref_items.append({"type": "audio"})
            ref_blocks.append({
                "kind": "audio", "ref_audio_t": ref_audio_t, "audio_latent": audio_latent,
            })
        latent, frame_count = _empty_av_latent(width, height, length)
        tokens = clip.tokenize(prompt, minimax_ref_items=ref_items)
        positive = clip.encode_from_tokens_scheduled(tokens)
        positive = node_helpers.conditioning_set_values(positive, {
            "minimax_refs": ref_blocks,
            "minimax_keyframes": [
                {"resolved_frame_index": 0, "latent": vae.encode(first)},
                {"resolved_frame_index": frame_count - 1, "latent": vae.encode(last)},
            ],
        })
        return io.NodeOutput(positive, latent)


NODE_CLASS_MAPPINGS = {"SimpAIH3TransitionConditioning": SimpAIH3TransitionConditioning}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3TransitionConditioning": "H3 Transition First and Last Frames",
}
