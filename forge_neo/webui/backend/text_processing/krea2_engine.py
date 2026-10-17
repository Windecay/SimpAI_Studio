# https://github.com/Comfy-Org/ComfyUI/blob/v0.36.0/comfy/text_encoders/krea2.py

import numbers

import torch

from backend import memory_management
from backend.args import dynamic_args
from backend.text_processing import emphasis
from modules.shared import opts

from ._comfy import INF, TOKEN_WEIGHTS, SDClipModel, SDTokenizer


KREA2_TAP_LAYERS = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]


class Krea2TextProcessingEngine:
    def __init__(self, text_encoder, tokenizer):
        self.text_encoder = text_encoder
        self.clip = SDClipModel(
            text_encoder, layer=KREA2_TAP_LAYERS, special_tokens={"pad": 151643},
            layer_norm_hidden_state=False, enable_attention_masks=True, return_attention_masks=True,
        )
        self.tokenizer = SDTokenizer(tokenizer, pad_with_end=False, has_start_token=False, has_end_token=False, pad_to_max_length=False, max_length=INF, min_length=1, pad_token=151643)

        self.llama_template = "<|im_start|>system\nDescribe the image by detailing the color, shape, size, texture, quantity, text, spatial relationships of the objects and background:<|im_end|>\n<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n"
        self.image_template = "<|im_start|>user\n<|vision_start|><|image_pad|><|vision_end|>{}<|im_end|>\n<|im_start|>assistant\n"
        self.vision_block = "<|vision_start|><|image_pad|><|vision_end|>"
        self.id_template = 151644
        self.intermediate_output = KREA2_TAP_LAYERS
        self.layer_norm_hidden_state = False

    @property
    def emphasis(self) -> "emphasis.Emphasis":
        return emphasis.get_current_option(opts.emphasis)()

    def tokenize(self, texts, images=None):
        if isinstance(texts, str):
            return self.tokenize([texts], images)[0]
        template = self.image_template.replace(self.vision_block, self.vision_block * len(images), 1) if images else self.llama_template
        return [self.tokenizer.tokenizer(template.format(text) if text else "")["input_ids"] for text in texts]

    def __call__(self, texts, images=None):
        images = images or []
        if any(emphasis.uses_emphasis(text) for text in texts):
            dynamic_args.last_extra_generation_params["Emphasis"] = self.emphasis.name

        zs: list[torch.Tensor] = []
        cache: dict[str, torch.Tensor] = {}

        for line in texts:
            if line in cache:
                cond = cache[line]
            else:
                chunk = self._tokenize_with_weights(line, images)
                tokens = [[token for token, _ in row] for row in chunk]
                weights = [[weight for _, weight in row] for row in chunk]
                cond = self.process_tokens(tokens, weights)
                cond = self.strip_template(cond, tokens[0])
                cache[line] = cond

            zs.append(cond)

        return zs

    def strip_template(self, out, tokens):
        template_end, count_im_start = 0, 0
        for index, value in enumerate(tokens):
            if isinstance(value, numbers.Integral) and value == self.id_template and count_im_start < 2:
                template_end = index
                count_im_start += 1
        if len(tokens) > template_end + 2 and out.shape[2] > template_end + 3:
            if tokens[template_end + 1] == 872 and tokens[template_end + 2] == 198:
                template_end += 3
        out = out[:, :, template_end:]
        return self.flatten_tap_layers(out)

    def flatten_tap_layers(self, out: torch.Tensor) -> torch.Tensor:
        b, layers, seq, hidden = out.shape
        return out.permute(0, 2, 1, 3).reshape(b, seq, layers * hidden)

    def process_embeds(self, batch_tokens):
        return self.clip.process_tokens(batch_tokens, memory_management.text_encoder_device())

    def process_tokens(self, batch_tokens, batch_multipliers):
        embeds, mask, count, info = self.process_embeds(batch_tokens)
        if embeds.shape[1] == len(batch_multipliers[0]):
            weighted = self.emphasis(embeds, torch.asarray(batch_multipliers).to(embeds))
            if weighted is not None:
                embeds = weighted
        _, z = self.text_encoder(
            None, embeds=embeds, attention_mask=mask, num_tokens=count, embeds_info=info,
            intermediate_output=self.intermediate_output,
            final_layer_norm_intermediate=self.layer_norm_hidden_state,
        )
        return z

    def _tokenize_with_weights(self, text: str, images: list[torch.Tensor]) -> TOKEN_WEIGHTS:
        template = self.image_template.replace(self.vision_block, self.vision_block * len(images), 1) if images else self.llama_template
        llama_text = template.format(text) if text else ""
        tokens = self.tokenizer.tokenize_with_weights(llama_text, disable_weights=self.emphasis.name == "None")
        if self.emphasis.name == "Ignore":
            tokens = [[(token, 1.0) for token, _ in row] for row in tokens]

        embed_count = 0

        for r in tokens:
            for i in range(len(r)):
                if isinstance(r[i][0], (int, float)) and r[i][0] == 151655:
                    if len(images) > embed_count:
                        r[i] = ({"type": "image", "data": images[embed_count], "original_type": "image"},) + r[i][1:]
                        embed_count += 1

        return tokens
