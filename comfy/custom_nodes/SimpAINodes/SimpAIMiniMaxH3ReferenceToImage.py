import nodes
from comfy_api.latest import io
from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo


class MiniMaxH3ReferenceToImage(MiniMaxH3ReferenceToVideo):
    """Reference-to-image conditioning registered by SimpAINodes."""

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="MiniMaxH3ReferenceToImage",
            description="<Picture i> reference conditioning for MiniMax H3 image editing.",
            display_name="MiniMax H3 ReferenceToImage",
            category="model/conditioning/minimax",
            inputs=[
                io.Clip.Input("clip"),
                io.Vae.Input("vae"),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True),
                io.Int.Input("width", default=1024, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=1024, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("length", default=5, min=5, max=3600, step=17),
                io.Combo.Input("ref_image_size", options=["match", "max"], default="match"),
                io.Autogrow.Input(
                    "ref_images",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Image.Input("ref_image"),
                        prefix="ref_image_",
                        min=0,
                        max=9,
                    ),
                ),
            ],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Latent.Output()],
        )

    @classmethod
    def execute(cls, clip, vae, prompt, width, height, length, ref_image_size="match", ref_images=None):
        return MiniMaxH3ReferenceToVideo.execute(
            clip,
            vae,
            None,
            prompt,
            width,
            height,
            length,
            ref_image_size=ref_image_size,
            ref_images=ref_images,
        )


NODE_CLASS_MAPPINGS = {
    "MiniMaxH3ReferenceToImage": MiniMaxH3ReferenceToImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MiniMaxH3ReferenceToImage": "MiniMax H3 ReferenceToImage",
}
