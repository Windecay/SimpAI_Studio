# https://github.com/Comfy-Org/ComfyUI/blob/v0.36.0/comfy/text_encoders/anima.py

import torch

from backend import memory_management
from backend.args import dynamic_args
from backend.text_processing import emphasis
from backend.text_processing._comfy import INF, SDClipModel, SDTokenizer
from modules.shared import opts
from modules.source_backend_timing import log_tensor_stats


def _prepare_qwen_cuda_workspace(device):
    if device.type != "cuda":
        return
    clear_workspace = getattr(torch._C, "_cuda_clearCublasWorkspaces", None)
    if clear_workspace is None or torch.cuda.get_device_properties(device).major < 10:
        return
    # Preserve the Blackwell workspace reset before Qwen embeddings are evaluated.
    with torch.cuda.device(device):
        torch.cuda.synchronize(device)
        clear_workspace()

class AnimaTextProcessingEngine:
    def __init__(self, text_encoder, qwen_tokenizer, t5_tokenizer):
        self.text_encoder = text_encoder
        self.trace_tensor_stats = bool(getattr(text_encoder, "trace_tensor_stats", False))
        self.clip = SDClipModel(
            text_encoder, layer="last", special_tokens={"pad": 151643},
            layer_norm_hidden_state=False, enable_attention_masks=True, return_attention_masks=True,
        )
        self.qwen_tokenizer = SDTokenizer(qwen_tokenizer, pad_with_end=False, has_start_token=False, has_end_token=False, pad_to_max_length=False, max_length=INF, min_length=1, pad_token=151643)
        self.t5_tokenizer = SDTokenizer(t5_tokenizer, pad_with_end=False, has_start_token=False, pad_to_max_length=False, max_length=INF, min_length=1)

    @property
    def emphasis(self) -> "emphasis.Emphasis":
        return emphasis.get_current_option(opts.emphasis)()

    def _log_tensor_stats(self, name: str, tensor: torch.Tensor, **extra) -> None:
        log_tensor_stats(name, tensor, enabled=self.trace_tensor_stats, **extra)

    def tokenize(self, texts):
        return (
            self.qwen_tokenizer.tokenizer(texts)["input_ids"],
            self.t5_tokenizer.tokenizer(texts)["input_ids"],
        )

    def __call__(self, texts: list[str]) -> list[torch.Tensor]:
        mode = self.emphasis.name
        if any(emphasis.uses_emphasis(text) for text in texts):
            dynamic_args.last_extra_generation_params["Emphasis"] = mode

        zs: list[torch.Tensor] = []
        cache: dict[str, torch.Tensor] = {}

        for line in texts:
            if line in cache:
                z = cache[line]
            else:
                qwen_chunk = self.qwen_tokenizer.tokenize_with_weights(line, disable_weights=mode == "None")
                t5_chunk = self.t5_tokenizer.tokenize_with_weights(line, disable_weights=mode == "None")
                tokens = [[token for token, _ in row] for row in qwen_chunk]
                cond = self.process_tokens(tokens, None)[0]
                ids = torch.tensor([token for token, _ in t5_chunk[0]], dtype=torch.int)
                weights = torch.tensor([1.0 if mode == "Ignore" else weight for _, weight in t5_chunk[0]])

                z = self.anima_preprocess(cond, ids, weights)
                cache[line] = z

            zs.append(z)

        return zs

    def anima_preprocess(self, cross_attn, t5xxl_ids, t5xxl_weights):
        device = memory_management.text_encoder_device()

        self._log_tensor_stats("anima.conditioning.qwen_output", cross_attn)
        cross_attn = cross_attn.unsqueeze(0).to(device=device)
        t5xxl_ids = t5xxl_ids.unsqueeze(0).to(device=device)
        cross_attn = self.text_encoder.preprocess_text_embeds(cross_attn, t5xxl_ids)
        self._log_tensor_stats("anima.conditioning.llm_adapter_output", cross_attn)
        if t5xxl_weights is not None:
            cross_attn *= t5xxl_weights.unsqueeze(0).unsqueeze(-1).to(cross_attn)
        self._log_tensor_stats(
            "anima.conditioning.weighted", cross_attn, weights_applied=t5xxl_weights is not None,
        )

        if cross_attn.shape[1] < 512:
            cross_attn = torch.nn.functional.pad(cross_attn, (0, 0, 0, 512 - cross_attn.shape[1]))

        self._log_tensor_stats("anima.conditioning.final", cross_attn)
        if not bool(torch.isfinite(cross_attn).all().item()):
            raise RuntimeError("ANIMA_NONFINITE_CONDITIONING: final weighted conditioning contains NaN/Inf.")
        return cross_attn

    def process_embeds(self, batch_tokens):
        return self.clip.process_tokens(batch_tokens, memory_management.text_encoder_device())

    def process_tokens(self, batch_tokens, batch_multipliers):
        _prepare_qwen_cuda_workspace(memory_management.text_encoder_device())
        embeds, mask, count, info = self.process_embeds(batch_tokens)
        z, _ = self.text_encoder(input_ids=None, embeds=embeds, attention_mask=mask, num_tokens=count, embeds_info=info)
        return z
