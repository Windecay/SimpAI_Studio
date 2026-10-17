import torch

from backend import memory_management


class MOSSTextProcessingEngine:
    template = "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n<think>\n"
    max_length = 4096

    def __init__(self, text_encoder, tokenizer):
        self.text_encoder = text_encoder.eval().requires_grad_(False)
        self.tokenizer = tokenizer

    def tokenize(self, texts):
        if isinstance(texts, str):
            return self.tokenize([texts])[0]
        return [
            self.tokenizer(
                self.template.format(text.strip()), add_special_tokens=False,
                truncation=True, max_length=self.max_length,
            )["input_ids"]
            for text in texts
        ]

    @torch.inference_mode()
    def __call__(self, texts):
        output, cache = [], {}
        device = memory_management.text_encoder_device()
        for text, tokens in zip(texts, self.tokenize(texts)):
            if text not in cache:
                ids = torch.tensor([tokens], device=device, dtype=torch.long)
                cache[text] = self.text_encoder(input_ids=ids)[0][0].float().to(memory_management.intermediate_device())
            output.append(cache[text])
        return {
            "crossattn": output,
            "vector": [value.new_zeros(1) for value in output],
            "attention_mask": [torch.ones(value.shape[0], 1, device=value.device, dtype=torch.bool) for value in output],
        }
