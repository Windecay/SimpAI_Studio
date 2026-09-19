from comfy_api.latest import io
from comfy_extras.nodes_minimax_h3 import _resize

from .SimpAIH3TransitionConditioning import _execute_hybrid_conditioning
from .SimpAIMiniMaxH3AdaptiveReference import (
    DEFAULT_MAX_IMAGE_LONG_EDGE,
    SimpAIMiniMaxH3AdaptiveReference,
)


class SimpAIH3FirstLastFrameConditioning(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        reference = {item.id: item for item in SimpAIMiniMaxH3AdaptiveReference.define_schema().inputs}
        inputs = [
            reference["clip"],
            reference["vae"],
            reference["audio_vae"],
            reference["prompt"],
            reference["width"],
            reference["height"],
            reference["length"],
            io.Image.Input("first_frame", optional=True),
            io.Image.Input("last_frame", optional=True),
            reference["reference_token_budget"],
            reference["max_image_long_edge"],
            reference["ref_images"],
            reference["ref_audios"],
        ]
        return io.Schema(
            node_id="SimpAIH3FirstLastFrameConditioning",
            description="MiniMax H3 first/last-frame conditioning with optional reference images and audio.",
            display_name="H3 First and Last Frames with References",
            category="SimpAI/conditioning/minimax",
            inputs=inputs,
            outputs=[io.Conditioning.Output(display_name="positive"), io.Latent.Output()],
        )

    @classmethod
    def execute(
        cls,
        clip,
        vae,
        prompt,
        width,
        height,
        length,
        first_frame=None,
        last_frame=None,
        audio_vae=None,
        reference_token_budget=0,
        max_image_long_edge=DEFAULT_MAX_IMAGE_LONG_EDGE,
        ref_images=None,
        ref_audios=None,
    ):
        has_references = any(image is not None for image in (ref_images or {}).values())
        has_references = has_references or any(
            audio is not None for audio in (ref_audios or {}).values()
        )
        if has_references:
            first = (
                _resize(first_frame[:1], width, height, "disabled")
                if first_frame is not None
                else None
            )
            last = (
                _resize(last_frame[:1], width, height, "center")
                if last_frame is not None
                else None
            )
        else:
            first, last = first_frame, last_frame
        return _execute_hybrid_conditioning(
            clip=clip,
            vae=vae,
            prompt=prompt,
            width=width,
            height=height,
            length=length,
            first=first,
            last=last,
            audio_vae=audio_vae,
            reference_token_budget=reference_token_budget,
            max_image_long_edge=max_image_long_edge,
            ref_images=ref_images,
            ref_audios=ref_audios,
        )


NODE_CLASS_MAPPINGS = {
    "SimpAIH3FirstLastFrameConditioning": SimpAIH3FirstLastFrameConditioning,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3FirstLastFrameConditioning": "H3 First and Last Frames with References",
}
