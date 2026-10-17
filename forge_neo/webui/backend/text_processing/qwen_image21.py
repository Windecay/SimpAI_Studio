import torch
from types import SimpleNamespace

from backend.args import dynamic_args
from backend.text_processing import emphasis
from backend.text_processing._comfy import INF, SDClipModel, SDTokenizer


class _QwenImage21ClipModel(SDClipModel):
    def process_tokens(self, tokens, device):
        result = super().process_tokens(tokens, device)
        self.image_info = result[3]
        return result


class QwenImage21TextProcessingEngine:
    def __init__(self, text_encoder, tokenizer):
        self.text_encoder = _QwenImage21ClipModel(
            text_encoder, layer="hidden", layer_idx=-1, special_tokens={"pad": 151643},
            layer_norm_hidden_state=False, enable_attention_masks=True, return_attention_masks=True,
        )
        self.tokenizer = SDTokenizer(
            tokenizer, pad_with_end=False, has_start_token=False, has_end_token=False,
            pad_to_max_length=False, max_length=INF, min_length=1, pad_token=151643,
        )
        self.id_template = 151644
        self.vision_block = "<|vision_start|><|image_pad|><|vision_end|>"
        self.llama_template = (
            "<|im_start|>system\nComprehend and analyze the provided prompt.<|im_end|>\n"
            "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n"
        )

    def tokenize(self, texts: list[str], images: int = 0):
        if isinstance(texts, str):
            return self.tokenize([texts], images)[0]
        prompts = []
        for text in texts:
            if images:
                image_text = " ".join(
                    f"<image{index + 1}>{self.vision_block}" for index in range(images)
                )
                prompts.append(f"{image_text}{text.strip()}")
            else:
                prompts.append(text.strip())
        return [
            self.tokenizer.tokenizer(self.llama_template.format(prompt))["input_ids"]
            for prompt in prompts
        ]

    def tokenize_line(self, line, images):
        refs = " ".join(f"<image{index + 1}>{self.vision_block}" for index in range(len(images)))
        tokens = self.tokenizer.tokenize_with_weights(
            self.llama_template.format(refs + (line.strip() or " ")), disable_weights=True,
        )
        chunks = []
        image_index = 0
        for row in tokens:
            values = []
            for token, _weight in row:
                if isinstance(token, int) and token == 151655 and image_index < len(images):
                    token = {"type": "image", "data": images[image_index], "original_type": "image"}
                    image_index += 1
                values.append(token)
            chunks.append(SimpleNamespace(tokens=values, multipliers=[1.0] * len(values)))
        return chunks

    def process_tokens(self, batch_tokens, batch_multipliers):
        pairs = [list(zip(tokens, weights)) for tokens, weights in zip(batch_tokens, batch_multipliers)]
        hidden = self.text_encoder.encode_token_weights(pairs)[0]
        return hidden, self.text_encoder.image_info

    def strip_template_and_images(self, hidden, tokens, info):
        starts = []
        offset = 0
        spans = iter(sorted(info, key=lambda item: item["index"]))
        for token in tokens:
            if isinstance(token, int):
                if token == self.id_template:
                    starts.append(offset)
                offset += 1
            elif isinstance(token, dict) and token.get("type") == "image":
                span = next(spans, None)
                offset += span["size"] if span is not None else 1

        keep = torch.ones(hidden.shape[1], dtype=torch.bool, device=hidden.device)
        if len(starts) > 1:
            keep[: starts[1]] = False

        slots = []
        for image in sorted(info, key=lambda item: item["index"]):
            start = image["index"]
            end = start + image["size"]
            keep[start:end] = False
            slots.append(int(keep[:start].sum()))

        dynamic_args.qwen_image21_image_slots = slots
        dynamic_args.image_slots = slots.copy()
        return hidden[:, keep]

    def __call__(self, texts, images: list[torch.Tensor] = None):
        images = images or []
        self.emphasis = emphasis.EmphasisNone()
        if not images:
            dynamic_args.qwen_image21_image_slots = []
            dynamic_args.image_slots = None

        if any(emphasis.uses_emphasis(text) for text in texts):
            dynamic_args.last_extra_generation_params["Emphasis"] = self.emphasis.name

        outputs = []
        for line in texts:
            chunks = self.tokenize_line(line, images)
            for chunk in chunks:
                hidden, info = self.process_tokens([chunk.tokens], [chunk.multipliers])
                outputs.append(self.strip_template_and_images(hidden, chunk.tokens, info).squeeze(0))
        return outputs

    def get_prompt_lengths_on_ui(self, prompt):
        return len(self.tokenize([prompt])[0]), 999999
