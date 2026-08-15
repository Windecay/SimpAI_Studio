import torch

from comfy_api.latest import io


DEFAULT_LTXV_TIME_SCALE_FACTOR = 8


def _validate_images(images):
    if not isinstance(images, torch.Tensor) or images.ndim != 4:
        raise ValueError("LTX video frames must have shape [frames, height, width, channels] / LTX 视频帧必须是 [帧数, 高度, 宽度, 通道] 形状")
    if int(images.shape[0]) <= 0:
        raise ValueError("LTX video frames must contain at least one frame / LTX 视频至少需要一帧")


def resolve_ltxv_time_scale_factor(vae=None, fallback=DEFAULT_LTXV_TIME_SCALE_FACTOR):
    formula = getattr(vae, "downscale_index_formula", None)
    if formula is not None:
        try:
            value = int(formula[0])
            if value > 0:
                return value
        except (IndexError, TypeError, ValueError):
            pass
    value = int(fallback)
    if value <= 0:
        raise ValueError("LTX temporal scale factor must be positive / LTX 时间缩放因子必须大于零")
    return value


def aligned_ltxv_frame_count(frame_count, time_scale_factor=DEFAULT_LTXV_TIME_SCALE_FACTOR):
    frame_count = int(frame_count)
    time_scale_factor = int(time_scale_factor)
    if frame_count <= 0:
        raise ValueError("LTX video frames must contain at least one frame / LTX 视频至少需要一帧")
    if time_scale_factor <= 0:
        raise ValueError("LTX temporal scale factor must be positive / LTX 时间缩放因子必须大于零")
    remainder = (frame_count - 1) % time_scale_factor
    return frame_count + ((time_scale_factor - remainder) % time_scale_factor)


def pad_ltxv_frames(images, time_scale_factor=DEFAULT_LTXV_TIME_SCALE_FACTOR):
    _validate_images(images)
    original_frame_count = int(images.shape[0])
    target_frame_count = aligned_ltxv_frame_count(original_frame_count, time_scale_factor)
    padding_count = target_frame_count - original_frame_count
    if padding_count:
        padding = images[-1:].expand(padding_count, -1, -1, -1)
        images = torch.cat((images, padding), dim=0)
    return images.contiguous(), original_frame_count


def trim_ltxv_frames(images, target_frame_count):
    _validate_images(images)
    target_frame_count = int(target_frame_count)
    if target_frame_count <= 0:
        raise ValueError("Target frame count must be positive / 目标帧数必须大于零")
    current_frame_count = int(images.shape[0])
    if current_frame_count < target_frame_count:
        padding = images[-1:].expand(target_frame_count - current_frame_count, -1, -1, -1)
        images = torch.cat((images, padding), dim=0)
    return images[:target_frame_count].contiguous()


class SimpAILTXVFramePad(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVFramePad",
            display_name="SimpAI LTX Frame Pad / LTX 视频帧补齐",
            category="SimpAI/video",
            description=(
                "Pads LTX guide-video frames to the VAE 8n+1 temporal grid and returns the original frame count. / "
                "将 LTX 引导视频补齐到 VAE 的 8n+1 时间网格，并输出原始帧数。"
            ),
            inputs=[
                io.Image.Input("images"),
                io.Vae.Input("vae", optional=True),
                io.Int.Input(
                    "time_scale_factor",
                    default=DEFAULT_LTXV_TIME_SCALE_FACTOR,
                    min=1,
                    max=32,
                    step=1,
                    advanced=True,
                ),
            ],
            outputs=[
                io.Image.Output(display_name="aligned_images / 补齐后视频"),
                io.Int.Output(display_name="original_frame_count / 原始帧数"),
            ],
        )

    @classmethod
    def execute(cls, images, vae=None, time_scale_factor=DEFAULT_LTXV_TIME_SCALE_FACTOR):
        factor = resolve_ltxv_time_scale_factor(vae, time_scale_factor)
        return io.NodeOutput(*pad_ltxv_frames(images, factor))


class SimpAILTXVFrameTrim(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAILTXVFrameTrim",
            display_name="SimpAI LTX Frame Trim / LTX 视频帧裁剪",
            category="SimpAI/video",
            description=(
                "Restores the original guide-video frame count after LTX VAE decoding, including a short decode batch. / "
                "LTX VAE 解码后恢复引导视频的原始帧数，并处理解码批次偏短的情况。"
            ),
            inputs=[
                io.Image.Input("images"),
                io.Int.Input("target_frame_count", min=1, max=1000000, step=1),
            ],
            outputs=[io.Image.Output(display_name="images / 输出视频")],
        )

    @classmethod
    def execute(cls, images, target_frame_count):
        return io.NodeOutput(trim_ltxv_frames(images, target_frame_count))


NODE_CLASS_MAPPINGS = {
    "SimpAILTXVFramePad": SimpAILTXVFramePad,
    "SimpAILTXVFrameTrim": SimpAILTXVFrameTrim,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAILTXVFramePad": "SimpAI LTX Frame Pad / LTX 视频帧补齐",
    "SimpAILTXVFrameTrim": "SimpAI LTX Frame Trim / LTX 视频帧裁剪",
}
