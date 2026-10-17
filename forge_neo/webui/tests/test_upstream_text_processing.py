import ast
import os
from pathlib import Path
import re
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import torch
import torch.nn.functional as F


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "modules_forge" / "packages"))

_argv = sys.argv
sys.argv = sys.argv[:1]
try:
    from backend.args import dynamic_args
    from backend.operations_mixed_precision import linear_input_act
    from backend.patcher.vae import VAE
    from backend.text_processing.anima_engine import AnimaTextProcessingEngine
    from backend.text_processing.emphasis import EmphasisIgnore, EmphasisNone
    from backend.text_processing.krea2_engine import Krea2TextProcessingEngine
    from backend.text_processing.qwen_image21 import QwenImage21TextProcessingEngine
    from backend.text_processing.sd_engine import ClipEngine
finally:
    sys.argv = _argv


class TinyTokenizer:
    def __init__(self, eos=None):
        self.eos = eos
        self.calls = []

    def __call__(self, text):
        self.calls.append(text)
        if isinstance(text, list):
            return {"input_ids": [self(item)["input_ids"] for item in text]}
        special = {"<|im_start|>": 151644, "<|im_end|>": 151645, "<|image_pad|>": 151655,
                   "user": 872, "\n": 198}
        tokens = [special.get(part, 7) for part in re.findall(r"<\|[^|]+\|>|user|\n|.", text)]
        return {"input_ids": tokens + ([] if self.eos is None else [self.eos])}


class TinyEncoder(torch.nn.Module):
    num_layers = 36

    def __init__(self):
        super().__init__()
        self.embeddings = torch.nn.Embedding(151700, 8)
        self.calls = 0

    def get_input_embeddings(self):
        return self.embeddings

    def preprocess_embed(self, item, device):
        return torch.ones(1, 3, 8, device=device), {}

    def preprocess_text_embeds(self, source, ids):
        return source.mean(dim=1, keepdim=True).expand(-1, ids.shape[1], -1).clone()

    def forward(self, input_ids=None, attention_mask=None, embeds=None, intermediate_output=None, **kwargs):
        self.calls += 1
        self.last_mask = attention_mask
        self.last_image_info = kwargs.get("embeds_info")
        hidden = embeds.clone()
        if isinstance(intermediate_output, list):
            hidden = hidden.unsqueeze(1).repeat(1, len(intermediate_output), 1, 1)
        return embeds, hidden


class UpstreamTextProcessingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def tearDown(self):
        dynamic_args.reset()

    def test_reference_images_expand_and_are_removed_from_qwen_conditioning(self):
        encoder = TinyEncoder()
        engine = QwenImage21TextProcessingEngine(encoder, TinyTokenizer())
        images = [torch.zeros(1, 2, 2, 3), torch.ones(1, 2, 2, 3)]
        result = engine(["replace the shirt"], images=images)
        self.assertEqual(len(encoder.last_image_info), 2)
        self.assertEqual([entry["size"] for entry in encoder.last_image_info], [3, 3])
        self.assertEqual(result[0].ndim, 2)
        self.assertEqual(result[0].shape[-1], 8)
        self.assertEqual(len(dynamic_args.qwen_image21_image_slots), 2)
        self.assertEqual(dynamic_args.image_slots, dynamic_args.qwen_image21_image_slots)
        engine(["plain text"])
        self.assertEqual(dynamic_args.qwen_image21_image_slots, [])
        self.assertEqual(dynamic_args.image_slots, [])
        self.assertEqual(encoder.last_image_info, [])

    def test_qwen_text_length_matches_template_removal(self):
        engine = QwenImage21TextProcessingEngine(TinyEncoder(), TinyTokenizer())
        tokens = engine.tokenize_line("red apple", [])[0].tokens
        start = [i for i, token in enumerate(tokens) if token == 151644][1]
        result = engine(["red apple"])
        self.assertEqual(tuple(result[0].shape), (len(tokens) - start, 8))

    def test_anima_keeps_weighted_adapter_output_and_prompt_cache(self):
        encoder = TinyEncoder()
        engine = AnimaTextProcessingEngine(encoder, TinyTokenizer(), TinyTokenizer(eos=1))
        with (
            patch("backend.text_processing.anima_engine.opts", SimpleNamespace(emphasis="Original")),
            patch("backend.memory_management.text_encoder_device", return_value=torch.device("cpu")),
        ):
            outputs = engine(["(cat:1.5)", "(cat:1.5)"])
        self.assertEqual(encoder.calls, 1)
        self.assertIs(outputs[0], outputs[1])
        self.assertEqual(tuple(outputs[0].shape), (1, 512, 8))
        self.assertTrue(torch.isfinite(outputs[0]).all())
        self.assertTrue(torch.equal(outputs[0][:, 4:], torch.zeros_like(outputs[0][:, 4:])))

    def test_krea2_preserves_fused_tap_dimensions_and_image_template(self):
        encoder, tokenizer = TinyEncoder(), TinyTokenizer()
        engine = Krea2TextProcessingEngine(encoder, tokenizer)
        with (
            patch("backend.text_processing.krea2_engine.opts", SimpleNamespace(emphasis="None")),
            patch("backend.memory_management.text_encoder_device", return_value=torch.device("cpu")),
        ):
            plain = engine(["a cat"])[0]
            reference = engine(["a cat"], images=[torch.zeros(1, 2, 2, 3)])[0]
        self.assertEqual(plain.ndim, 3)
        self.assertEqual(plain.shape[0], 1)
        self.assertEqual(plain.shape[-1], 12 * 8)
        self.assertEqual(reference.shape[-1], 12 * 8)
        self.assertEqual(len(encoder.last_image_info), 1)
        self.assertTrue(any(text.startswith("<|im_start|>user\n<|vision_start|>") for text in tokenizer.calls if isinstance(text, str)))

    def test_none_and_ignore_emphasis_preserve_clip_tensor_and_pooling(self):
        for mode, emphasis in (("None", EmphasisNone()), ("Ignore", EmphasisIgnore())):
            with self.subTest(mode=mode):
                z = torch.randn(1, 3, 8)
                self.assertIs(emphasis(z, torch.ones(1, 3)), z)
                z.pooled = torch.randn(1, 8)
                engine = object.__new__(ClipEngine)
                engine.id_end = engine.id_pad = 1
                engine.encode_with_transformers = lambda _tokens: z
                with patch("backend.text_processing.sd_engine.opts", SimpleNamespace(emphasis=mode)):
                    result = engine.process_tokens([[1, 2, 3]], [[1.0, 2.0, 1.0]])
                self.assertIs(result, z)
                self.assertIs(result.pooled, z.pooled)

    def test_qwen_rgba_tiled_decode_requests_four_output_channels(self):
        vae = VAE(no_init=True)
        vae.first_stage_model = SimpleNamespace()
        vae.vae_dtype = torch.float32
        vae.device = vae.output_device = torch.device("cpu")
        vae.upscale_ratio = 16
        vae.output_channels = 4
        vae.trace_tensor_stats = False
        vae.process_output = lambda output: output
        with patch("backend.patcher.vae.tiled_scale", return_value=torch.ones(1, 4, 16, 16)) as tiled:
            output = vae.decode_tiled_(torch.zeros(1, 64, 1, 1))
        self.assertEqual(tuple(output.shape), (1, 4, 16, 16))
        self.assertEqual([call.kwargs["out_channels"] for call in tiled.call_args_list], [4, 4, 4])

    def test_fused_linear_cpu_matches_activation_and_residual(self):
        linear = torch.nn.Linear(8, 5)
        x, residual = torch.randn(2, 3, 8), torch.randn(2, 3, 5)
        scale = torch.tensor(0.25)
        actual = linear_input_act(linear, x, "gelu_tanh", residual=residual, residual_scale=scale)
        expected = residual + linear(F.gelu(x, approximate="tanh")) * scale
        torch.testing.assert_close(actual, expected)

    def test_cached_api_defaults_do_not_rebuild_script_ui(self):
        tree = ast.parse((ROOT / "modules" / "api" / "api.py").read_text(encoding="utf-8"))
        api = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "Api")
        method = next(node for node in api.body if isinstance(node, ast.FunctionDef) and node.name == "init_default_script_args")
        namespace = {}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "api.py", "exec"), namespace)
        script = SimpleNamespace(
            args_from=1, args_to=3, api_info=SimpleNamespace(args=[SimpleNamespace(value=True), SimpleNamespace(value="Euler")]),
            ui=lambda *_args: self.fail("UI must not be rebuilt"),
        )
        result = namespace["init_default_script_args"](None, SimpleNamespace(scripts=[script]))
        self.assertEqual(result, [0, True, "Euler"])

    def test_model_patcher_import_order_is_independent(self):
        prefix = (
            "import os,sys; sys.argv=['probe','--cpu']; "
            "sys.path.insert(0,os.getcwd()); "
            "sys.path.insert(0,os.path.join(os.getcwd(),'modules_forge','packages')); "
        )
        for first in ("backend.loader", "backend.patcher.unet"):
            with self.subTest(first=first):
                result = subprocess.run(
                    [sys.executable, "-c", prefix + f"import {first}; from backend.loader import possible_models; assert len(possible_models) == 14"],
                    cwd=ROOT, capture_output=True, text=True, timeout=45,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
