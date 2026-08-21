import math

import torch
from comfy_api.latest import io


H3_SIGMA_SPACING = ("cosine", "linear", "exponential")


class SimpAIMiniMaxH3SigmaRefiner(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3SigmaRefiner",
            display_name="SimpAI MiniMax H3 Sigma Refiner / H3 Sigma 精修",
            category="model/sampling/schedulers",
            is_experimental=True,
            description=(
                "Resample the low-noise tail of an H3 sigma schedule and add detail-refinement steps. / "
                "重新分布 H3 低噪区间并增加细节精修步数。"
            ),
            inputs=[
                io.Sigmas.Input("sigmas"),
                io.Int.Input(
                    "extra_steps",
                    default=1,
                    min=0,
                    max=15,
                    step=1,
                    tooltip="Additional low-noise refinement steps. / 低噪阶段额外增加的精修步数。",
                ),
                io.Float.Input(
                    "start_at_sigma",
                    default=0.7,
                    min=0.0,
                    max=1.0,
                    step=0.01,
                    tooltip="H3 sigma threshold where tail resampling begins. / 开始重新分布低噪区间的 H3 sigma 阈值。",
                ),
                io.Float.Input(
                    "end_at_sigma",
                    default=0.0,
                    min=0.0,
                    max=1.0,
                    step=0.01,
                    tooltip="Tail resampling endpoint; use 0 for normal H3 completion. / 尾段重新分布终点，H3 通常使用 0。",
                ),
                io.Combo.Input(
                    "spacing",
                    options=list(H3_SIGMA_SPACING),
                    default="cosine",
                    tooltip="Tail spacing curve. / 尾段步长分布曲线。",
                ),
            ],
            outputs=[io.Sigmas.Output(display_name="sigmas")],
        )

    @classmethod
    def execute(
        cls,
        sigmas,
        extra_steps,
        start_at_sigma,
        end_at_sigma,
        spacing,
    ) -> io.NodeOutput:
        extra_steps = int(extra_steps)
        if extra_steps <= 0 or sigmas.numel() < 2:
            return io.NodeOutput(sigmas)
        if sigmas.ndim != 1:
            raise ValueError("MiniMax H3 sigma schedule must be one-dimensional")

        start_at_sigma = float(start_at_sigma)
        end_at_sigma = float(end_at_sigma)
        if not 0.0 <= end_at_sigma <= start_at_sigma <= 1.0:
            raise ValueError("MiniMax H3 sigma range must satisfy 0 <= end <= start <= 1")
        if spacing not in H3_SIGMA_SPACING:
            raise ValueError(f"Unsupported MiniMax H3 sigma spacing: {spacing}")

        work_dtype = torch.float32 if sigmas.dtype in (torch.float16, torch.bfloat16) else sigmas.dtype
        source = sigmas.detach().to(dtype=work_dtype)
        threshold_indices = torch.nonzero(source <= start_at_sigma, as_tuple=False)
        if threshold_indices.numel() == 0:
            return io.NodeOutput(sigmas)

        start_index = int(threshold_indices[0].item())
        if start_index >= source.shape[0] - 1:
            return io.NodeOutput(sigmas)

        head = source[:start_index]
        start_sigma = source[start_index]
        final_sigma = max(end_at_sigma, float(source[-1].item()))
        tail_length = source.shape[0] - start_index + extra_steps
        position = torch.linspace(
            0.0,
            1.0,
            steps=tail_length,
            dtype=work_dtype,
            device=source.device,
        )

        if spacing == "cosine":
            factor = (1.0 - torch.cos(position * math.pi)) / 2.0
        elif spacing == "exponential":
            alpha = 3.0
            factor = (torch.exp(position * alpha) - 1.0) / (math.exp(alpha) - 1.0)
        else:
            factor = position

        tail = start_sigma + (final_sigma - start_sigma) * factor
        if float(source[-1].item()) == 0.0 and final_sigma > 0.0:
            tail = torch.cat((tail, torch.zeros(1, dtype=work_dtype, device=source.device)))

        refined = torch.cat((head, tail)).to(device=sigmas.device, dtype=sigmas.dtype)
        return io.NodeOutput(refined)


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3SigmaRefiner": SimpAIMiniMaxH3SigmaRefiner,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3SigmaRefiner": "SimpAI MiniMax H3 Sigma Refiner / H3 Sigma 精修",
}
