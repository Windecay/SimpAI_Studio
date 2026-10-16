import copy
from types import SimpleNamespace

from comfy_api.latest import io
from comfy_extras.nodes_textgen import TextGenerate


class SimpAITextGenerate(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        schema = copy.deepcopy(TextGenerate.define_schema())
        schema.node_id = "SimpAITextGenerate"
        schema.display_name = "SimpAI Generate Text"
        schema.has_intermediate_output = True
        return schema

    @classmethod
    def execute(cls, clip, prompt, max_length, sampling_mode, **kwargs):
        record = {"max_tokens": max_length}

        def generate(*args, **options):
            token_ids = clip.generate(*args, **options)
            record["generated_tokens"] = len(token_ids)
            record["hit_token_limit"] = len(token_ids) >= max_length
            return token_ids

        def decode(token_ids):
            text = clip.decode(token_ids)
            record["raw_output"] = text
            return text

        proxy = SimpleNamespace(tokenize=clip.tokenize, generate=generate, decode=decode)
        output = TextGenerate.execute(
            clip=proxy, prompt=prompt, max_length=max_length, sampling_mode=sampling_mode, **kwargs,
        )
        record["reasoning_output"] = output.args[1]
        return io.NodeOutput(*output.args, ui={"simpai_textgen": [record]})


NODE_CLASS_MAPPINGS = {"SimpAITextGenerate": SimpAITextGenerate}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAITextGenerate": "SimpAI Generate Text"}
