import torch

from backend.args import dynamic_args
from backend.text_processing import emphasis
from backend.text_processing.qwen3vl_engine import Qwen3VLTextProcessingEngine
from modules.shared import opts


class QwenImage21TextProcessingEngine(Qwen3VLTextProcessingEngine):
    def __init__(self, text_encoder, tokenizer):
        super().__init__(text_encoder, tokenizer)
        self.llama_template = (
            "<|im_start|>system\nComprehend and analyze the provided prompt.<|im_end|>\n"
            "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n"
        )

    def tokenize(self, texts: list[str], images: int = 0):
        prompts = []
        for text in texts:
            if images:
                image_text = " ".join(
                    f"<image{index + 1}>{self.vision_block}" for index in range(images)
                )
                prompts.append(f"{image_text}{text.strip()}")
            else:
                prompts.append(text.strip())
        return self.tokenizer([self.llama_template.format(prompt) for prompt in prompts])["input_ids"]

    def process_tokens(self, batch_tokens, batch_multipliers):
        embeds, mask, count, info = self.process_embeds(batch_tokens)
        if embeds.size(1) == len(batch_multipliers[0]):
            self.emphasis.tokens = batch_tokens
            self.emphasis.multipliers = torch.asarray(batch_multipliers).to(embeds)
            self.emphasis.z = embeds
            embeds = self.emphasis.z

        _, hidden = self.text_encoder(
            None,
            embeds=embeds,
            attention_mask=mask,
            num_tokens=count,
            embeds_info=info,
            intermediate_output=-1,
            final_layer_norm_intermediate=False,
        )
        return hidden, info

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
        return hidden[:, keep]

    def __call__(self, texts, images: list[torch.Tensor] = None):
        images = images or []
        if images:
            self.emphasis = emphasis.EmphasisNone()
        else:
            self.emphasis = emphasis.get_current_option(opts.emphasis)()
            dynamic_args.qwen_image21_image_slots = []

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
