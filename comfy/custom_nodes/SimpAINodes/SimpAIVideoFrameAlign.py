import torch

from comfy_api.latest import io


def align_video_frames(
    images,
    target_frame_count,
    source_fps=0.0,
    target_fps=0.0,
    resample_when_fps_diff=False,
):
    if not isinstance(images, torch.Tensor) or images.ndim != 4:
        raise ValueError("Video frames must have shape [frames, height, width, channels].")
    if int(images.shape[0]) <= 0:
        raise ValueError("Video frames must contain at least one frame.")

    target_frame_count = int(target_frame_count)
    if target_frame_count <= 0:
        raise ValueError("Target frame count must be positive.")

    current_frame_count = int(images.shape[0])
    source_fps = float(source_fps or 0.0)
    target_fps = float(target_fps or 0.0)
    fps_differs = (
        source_fps > 0.0
        and target_fps > 0.0
        and abs(source_fps - target_fps) >= 0.01
    )
    if resample_when_fps_diff and fps_differs and current_frame_count != target_frame_count:
        indices = torch.linspace(
            0,
            current_frame_count - 1,
            target_frame_count,
            device=images.device,
        ).round().to(dtype=torch.long)
        return images.index_select(0, indices).contiguous()
    if current_frame_count > target_frame_count:
        if fps_differs:
            indices = torch.linspace(
                0,
                current_frame_count - 1,
                target_frame_count,
                device=images.device,
            ).round().to(dtype=torch.long)
            return images.index_select(0, indices).contiguous()
        return images[:target_frame_count].contiguous()
    if current_frame_count == target_frame_count:
        return images[:target_frame_count].contiguous()

    padding = images[-1:].expand(
        target_frame_count - current_frame_count,
        *images.shape[1:],
    )
    return torch.cat((images, padding), dim=0).contiguous()


class SimpAIVideoFrameAlign(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIVideoFrameAlign",
            display_name="SimpAI Video Frame Align",
            category="SimpAI/video",
            description=(
                "Restores the requested video frame count by repeating the last frame when decoding is short."
            ),
            inputs=[
                io.Image.Input("images"),
                io.Int.Input("target_frame_count", min=1, max=1000000, step=1),
                io.Float.Input("source_fps", default=0.0, min=0.0, max=240.0, step=0.01, optional=True, advanced=True),
                io.Float.Input("target_fps", default=0.0, min=0.0, max=240.0, step=0.01, optional=True, advanced=True),
                io.Boolean.Input("resample_when_fps_diff", default=False, optional=True, advanced=True),
            ],
            outputs=[io.Image.Output(display_name="images")],
        )

    @classmethod
    def execute(
        cls,
        images,
        target_frame_count,
        source_fps=0.0,
        target_fps=0.0,
        resample_when_fps_diff=False,
    ):
        return io.NodeOutput(
            align_video_frames(
                images,
                target_frame_count,
                source_fps,
                target_fps,
                resample_when_fps_diff,
            )
        )


NODE_CLASS_MAPPINGS = {
    "SimpAIVideoFrameAlign": SimpAIVideoFrameAlign,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIVideoFrameAlign": "SimpAI Video Frame Align",
}
