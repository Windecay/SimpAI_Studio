from comfy import sd1_clip
from comfy.text_encoders import qwen35


class MOSSImageTokenizer(sd1_clip.SD1Tokenizer):
    def __init__(self, embedding_directory=None, tokenizer_data={}):
        def tokenizer(*args, **kwargs):
            return qwen35.Qwen35Tokenizer(*args, **kwargs, embedding_size=4096, embedding_key="qwen35_9b")

        super().__init__(
            embedding_directory=embedding_directory,
            tokenizer_data=tokenizer_data,
            name="qwen35_9b",
            tokenizer=tokenizer,
        )

    def tokenize_with_weights(self, text, return_word_ids=False, **kwargs):
        text = f"<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n<think>\n"
        tokens = super().tokenize_with_weights(
            text, return_word_ids=return_word_ids, disable_weights=True, **kwargs
        )
        tokens["qwen35_9b"] = [tokens["qwen35_9b"][0][:4096]]
        return tokens


class Qwen35MOSSImage(qwen35.Qwen35):
    model_type = "qwen35_9b"


class MOSSImageClipModel(sd1_clip.SDClipModel):
    def __init__(self, device="cpu", dtype=None, model_options={}):
        super().__init__(
            device=device,
            dtype=dtype,
            layer="last",
            textmodel_json_config={"lm_head": False},
            model_class=Qwen35MOSSImage,
            special_tokens={"pad": 248044},
            enable_attention_masks=True,
            return_attention_masks=True,
            model_options=model_options,
        )


class MOSSImageTEModel(sd1_clip.SD1ClipModel):
    def __init__(self, device="cpu", dtype=None, model_options={}):
        super().__init__(
            device=device,
            dtype=dtype,
            name="qwen35_9b",
            clip_model=MOSSImageClipModel,
            model_options=model_options,
        )


def te(dtype_llama=None, llama_quantization_metadata=None):
    class MOSSImageTEModel_(MOSSImageTEModel):
        def __init__(self, device="cpu", dtype=None, model_options={}):
            if dtype_llama is not None:
                dtype = dtype_llama
            if llama_quantization_metadata is not None:
                model_options = {**model_options, "quantization_metadata": llama_quantization_metadata}
            super().__init__(device=device, dtype=dtype, model_options=model_options)

    return MOSSImageTEModel_
