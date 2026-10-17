import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import torch
import torch.nn.functional as F


ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / "modules_forge/packages")]
_argv, sys.argv = sys.argv, sys.argv[:1]
try:
    from backend.nn.llm.qwen35_text import Qwen35TextModel, chunk_gated_delta
    from backend.nn.moss import MOSSImageTransformer
    from backend.sampling.condition import Condition, compile_weighted_conditions
    from modules import prompt_parser
    from modules_forge.packages.huggingface_guess import detection, model_list
finally:
    sys.argv = _argv


class MOSSNativeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_model_detection_uses_tensor_structure(self):
        shape = lambda *dims: torch.empty(*dims, device="meta")
        state = {
            "shared_block_modulation.weight": shape(192, 32),
            "video_embedder.weight": shape(32, 4),
            "text_embedder.proj.weight": shape(32, 16),
            "layers.0.q_norm.weight": shape(8),
            "layers.0.proj.ffn_up_gate.weight": shape(128, 32),
            "layers.0.proj.qkv.weight": shape(96, 32),
        }
        config = detection.detect_unet_config(state, "")
        model = detection.model_config_from_unet_config(config, state)
        self.assertIsInstance(model, model_list.MOSSImage)
        self.assertEqual(config["num_heads"], 4)
        self.assertEqual(config["text_dim"], 16)
        self.assertTrue(config["fused_qkv"])
        self.assertEqual(model.sampling_settings, {"shift": 5.0, "multiplier": 1.0})

    def test_chunk_delta_matches_tokenwise_reference(self):
        torch.manual_seed(5)
        q, k = torch.randn(1, 9, 2, 4), torch.randn(1, 9, 2, 4)
        v = torch.randn(1, 9, 2, 3)
        g, beta = -torch.rand(1, 9, 2), torch.rand(1, 9, 2)
        actual = chunk_gated_delta(q, k, v, g, beta, chunk_size=4)
        q, k = F.normalize(q, dim=-1), F.normalize(k, dim=-1)
        state, expected = torch.zeros(1, 2, 4, 3), []
        for index in range(q.shape[1]):
            state = state * g[:, index].exp()[..., None, None]
            delta = (v[:, index] - (k[:, index].unsqueeze(-2) @ state).squeeze(-2)) * beta[:, index, :, None]
            state = state + k[:, index, :, :, None] * delta.unsqueeze(-2)
            expected.append(((q[:, index] * 0.5).unsqueeze(-2) @ state).squeeze(-2))
        torch.testing.assert_close(actual, torch.stack(expected, dim=1), rtol=2e-5, atol=2e-6)

    def test_hybrid_text_encoder_is_causal(self):
        config = {
            "hidden_size": 32, "intermediate_size": 48, "vocab_size": 64, "num_hidden_layers": 4,
            "num_attention_heads": 4, "num_key_value_heads": 2, "head_dim": 8,
            "linear_num_key_heads": 2, "linear_num_value_heads": 4,
            "linear_key_head_dim": 4, "linear_value_head_dim": 4, "partial_rotary_factor": 0.5,
        }
        encoder = Qwen35TextModel(config).eval().requires_grad_(False)
        encoder.computation_dtype = torch.float32
        torch.manual_seed(4)
        for parameter in encoder.parameters():
            parameter.data.uniform_(-0.1, 0.1)
        a = torch.tensor([[1, 2, 3, 4, 5, 6]])
        b = torch.tensor([[1, 2, 3, 7, 8, 9]])
        with torch.inference_mode():
            first, second = encoder(a)[0], encoder(b)[0]
        self.assertTrue(torch.isfinite(first).all())
        torch.testing.assert_close(first[:, :3], second[:, :3], rtol=2e-5, atol=2e-5)

    def test_skip_layer_only_affects_negative_branch(self):
        torch.manual_seed(10)
        model = MOSSImageTransformer(dim=32, ffn_dim=48, num_heads=4, num_layers=2, text_dim=16, latent_channels=4)
        x, context = torch.randn(1, 4, 2, 2), torch.randn(1, 5, 16)
        calls = []
        handle = model.layers[1].register_forward_hook(lambda *_args: calls.append(True))
        with torch.inference_mode():
            output = model(
                x.repeat(2, 1, 1, 1), torch.tensor([0.5, 0.5]), context.repeat(2, 1, 1),
                transformer_options={"cond_or_uncond": [0, 1], "moss_uncond_skip_layers": [1]},
            )
        handle.remove()
        self.assertEqual(len(calls), 1)
        self.assertTrue(torch.isfinite(output).all())
        self.assertFalse(torch.equal(output[0], output[1]))

    def test_text_padding_does_not_change_rope_or_output(self):
        torch.manual_seed(7)
        model = MOSSImageTransformer(dim=32, ffn_dim=48, num_heads=4, num_layers=1, text_dim=16, latent_channels=4)
        x, text = torch.randn(1, 4, 2, 2), torch.randn(1, 3, 16)
        with torch.inference_mode():
            expected = model(x, torch.tensor([0.4]), text)
            actual = model(
                x, torch.tensor([0.4]), F.pad(text, (0, 0, 0, 2), value=100),
                attention_mask=torch.tensor([[1, 1, 1, 0, 0]]),
            )
        torch.testing.assert_close(actual, expected, rtol=0, atol=0)

    def test_layout_and_and_text_are_literal_and_masks_are_padded_with_zero(self):
        layout = json.dumps({"caption": "[red:blue:0.5] AND [TEXT]", "items": []})
        received = []

        def conditioning(prompts):
            received.extend(prompts)
            values = [torch.ones(3 if text == layout else 5, 16) for text in prompts]
            return {
                "crossattn": values, "vector": [torch.zeros(1) for _ in prompts],
                "attention_mask": [torch.ones(value.shape[0], 1) for value in values],
            }

        model = SimpleNamespace(literal_prompt=True, get_learned_conditioning=conditioning)
        prompts = prompt_parser.SdConditioning([layout, "longer caption"])
        learned = prompt_parser.get_multicond_learned_conditioning(model, prompts, 4)
        composition, batch = prompt_parser.reconstruct_multicond_batch(learned, 0)
        compiled = compile_weighted_conditions(batch, composition)
        self.assertEqual(received, [layout, "longer caption"])
        self.assertEqual(batch["attention_mask"][0, :, 0].tolist(), [1, 1, 1, 0, 0])
        self.assertIs(type(compiled[0]["model_conds"]["c_crossattn"]), Condition)

    def test_component_loading_and_preset_are_registered(self):
        config = json.loads((ROOT / "backend/huggingface/OpenMOSS-Team/MOSS-Image-SFT/model_index.json").read_text())
        self.assertEqual(config["text_encoder"], ["transformers", "Qwen3_5Model"])
        self.assertEqual(config["vae"], ["diffusers", "AutoencoderKLFlux2"])
        from modules_forge.presets import PresetArch, SHIFT, STEPS
        self.assertEqual(STEPS[PresetArch.moss], 50)
        self.assertEqual(SHIFT[PresetArch.moss], 5.0)

    def test_diffusers_lora_keys_map_to_fused_qkv_slices(self):
        from modules_forge.packages.comfy.lora import model_lora_keys_unet

        key = "diffusion_model.layers.0.proj.qkv.weight"
        model = SimpleNamespace(
            state_dict=lambda: {key: torch.zeros(96, 32)},
            diffusion_model=SimpleNamespace(config={"image_model": "moss_image"}),
            config=SimpleNamespace(huggingface_repo="OpenMOSS-Team/MOSS-Image-SFT"),
        )
        mapping = model_lora_keys_unet(model, {})
        self.assertEqual(mapping["transformer.layers.0.proj.qkv"], key)
        self.assertEqual(mapping["transformer.layers.0.proj.q"], (key, (0, 0, 32)))
        self.assertEqual(mapping["transformer.layers.0.proj.k"], (key, (0, 32, 32)))
        self.assertEqual(mapping["transformer.layers.0.proj.v"], (key, (0, 64, 32)))
