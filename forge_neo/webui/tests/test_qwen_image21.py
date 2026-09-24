import ast
import json
import os
import subprocess
import sys
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "modules_forge", "packages"))

_runner_argv = sys.argv
sys.argv = sys.argv[:1]
try:
    from backend.attention import attention_flash, attention_pytorch
    from backend.args import dynamic_args
    from backend.diffusion_engine.qwen_image21 import QwenImage21
    from backend.modules.k_prediction import PredictionFlux2
    from backend.nn.qwen_image21 import QwenImage21Transformer2DModel, ZeroCenteredRMSNorm
    from backend.nn.qwen_image21_vae import QwenImage21VAE
    from backend.operations import using_forge_operations
    from backend.patcher.vae import VAE
    from backend.quant_ops import ck
    from backend.sampling.condition import compile_weighted_conditions
    from backend.text_processing.qwen_image21 import QwenImage21TextProcessingEngine
    from modules import prompt_parser
    from modules_forge.packages.comfy.utils import convert_diffusers_mmdit
    from modules_forge.packages.huggingface_guess import detection, model_list
    from modules_forge.packages.huggingface_guess.latent import QwenImage21 as QwenImage21LatentFormat
finally:
    sys.argv = _runner_argv


class QwenImage21Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        torch.set_num_threads(2)

    def test_qwen3vl_vision_module_imports_in_either_order(self):
        for first, second in (
            ("backend.nn.llm.llama", "backend.nn.llm.qwen35"),
            ("backend.nn.llm.qwen35", "backend.nn.llm.llama"),
        ):
            with self.subTest(first=first):
                result = subprocess.run(
                    [
                        sys.executable,
                        "-c",
                        "import os, sys; "
                        "sys.path.insert(0, os.getcwd()); "
                        "sys.path.insert(0, os.path.join(os.getcwd(), 'modules_forge', 'packages')); "
                        f"import {first}; import {second}; "
                        "from backend.nn.llm.llama import Qwen3VL; "
                        "from backend.nn.llm.qwen35 import Qwen3VLVisionModel",
                    ],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_guess_selects_separate_model_family(self):
        prefix = "model.diffusion_model."
        state_dict = {
            f"{prefix}txt_in.text_norm.weight": torch.empty(4096),
            f"{prefix}txt_in.in_layer.weight": torch.empty(4096, 4096),
            f"{prefix}modulation.1.weight": torch.empty(16384, 4096),
            f"{prefix}transformer_blocks.0.attn.norm_q.weight": torch.empty(128),
            f"{prefix}transformer_blocks.0.img_mlp.gate_up.weight": torch.empty(24576, 4096),
            f"{prefix}img_in.weight": torch.empty(4096, 64),
            f"{prefix}proj_out.weight": torch.empty(64, 4096),
        }

        detected = detection.detect_unet_config(state_dict, prefix)
        config = detection.model_config_from_unet_config(detected, state_dict)

        self.assertIsInstance(config, model_list.QwenImage21)
        self.assertEqual(config.huggingface_repo, "Qwen/Qwen-Image-2.1")
        self.assertEqual(config.latent_format.latent_channels, 64)

    def test_qwen21_engine_uses_flux_schedule_with_configured_shift(self):
        config = model_list.QwenImage21({"image_model": "qwen_image21"})
        components = {"vae": SimpleNamespace(), "text_encoder": object(), "tokenizer": object(), "transformer": object()}

        with (
            patch("backend.diffusion_engine.qwen_image21.CLIP"),
            patch("backend.diffusion_engine.qwen_image21.VAE"),
            patch("backend.diffusion_engine.qwen_image21.UnetPatcher.from_model") as patcher,
            patch("backend.diffusion_engine.qwen_image21.QwenImage21TextProcessingEngine"),
        ):
            QwenImage21(config, components)

        predictor = patcher.call_args.kwargs["k_predictor"]
        self.assertIsInstance(predictor, PredictionFlux2)
        self.assertEqual(predictor.shift, 0.69)
        sigma = torch.tensor([0.5])
        self.assertTrue(torch.equal(predictor.timestep(sigma), sigma))
        self.assertTrue(torch.isfinite(predictor.sigmas).all())

    def test_qwen3vl_convrot_state_dict_prefixes_are_registered(self):
        loader_path = Path(ROOT, "backend", "loader.py")
        tree = ast.parse(loader_path.read_text(encoding="utf-8"))
        replace_state_dict = next(
            node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "replace_state_dict"
        )
        namespace = {
            "os": os,
            "torch": torch,
            "_is_krea2_config": lambda _guess: False,
        }
        exec(
            compile(ast.Module(body=[replace_state_dict], type_ignores=[]), str(loader_path), "exec"),
            namespace,
        )

        guess = SimpleNamespace(
            vae_key_prefix=["vae."],
            text_encoder_key_prefix=["text_encoders."],
        )
        for visual_prefix in ("visual.", "model.visual."):
            with self.subTest(visual_prefix=visual_prefix):
                source_state_dict = {
                    "model.layers.0.post_attention_layernorm.weight": torch.empty(4096),
                    "model.layers.0.self_attn.q_norm.weight": torch.empty(128),
                    f"{visual_prefix}blocks.0.attn.proj.weight": torch.empty(1, 1),
                }

                mapped = namespace["replace_state_dict"](
                    {},
                    source_state_dict,
                    guess,
                    "qwen3vl_8b_int8_convrot.safetensors",
                )

                self.assertIn(
                    "text_encoders.qwen3vl_8b.transformer.model.layers.0.post_attention_layernorm.weight",
                    mapped,
                )
                self.assertIn(
                    f"text_encoders.qwen3vl_8b.transformer.{visual_prefix}blocks.0.attn.proj.weight",
                    mapped,
                )

    def test_diffusers_transformer_state_dict_is_left_intact(self):
        state_dict = {
            "txt_in.text_norm.weight": torch.empty(4096),
            "modulation.1.weight": torch.empty(16384, 4096),
            "img_in.weight": torch.empty(4096, 64),
        }

        converted = convert_diffusers_mmdit(state_dict)

        self.assertIs(converted, state_dict)

    def test_latent_normalization_round_trip(self):
        latent_format = QwenImage21LatentFormat()
        latent = torch.randn(1, 64, 2, 3)

        restored = latent_format.process_out(latent_format.process_in(latent))

        self.assertTrue(torch.allclose(restored, latent, atol=1e-6, rtol=1e-6))

    def test_reference_image_slot_tracks_removed_vision_tokens(self):
        engine = object.__new__(QwenImage21TextProcessingEngine)
        engine.id_template = 151644
        tokens = [
            151644,
            90,
            151644,
            100,
            {"type": "image", "data": torch.empty(1), "original_type": "image"},
            101,
        ]
        hidden = torch.randn(1, 9, 8)
        image_info = [{"type": "image", "index": 4, "size": 4}]

        context = engine.strip_template_and_images(hidden, tokens, image_info)

        self.assertEqual(tuple(context.shape), (1, 3, 8))
        self.assertEqual(dynamic_args.qwen_image21_image_slots, [2])

    def test_text_conditioning_through_forge_prompt_reconstruction(self):
        engine = object.__new__(QwenImage21TextProcessingEngine)
        engine.id_template = 151644
        tokens = [151644, 90, 151644, 100, 101]
        chunk = SimpleNamespace(tokens=tokens, multipliers=[1.0] * len(tokens))
        engine.tokenize_line = lambda _line, _images: [chunk]
        engine.process_tokens = lambda _tokens, _multipliers: (torch.randn(1, len(tokens), 12), [])
        prompts = prompt_parser.SdConditioning(["a red apple"], width=32, height=32)

        with patch("backend.text_processing.qwen_image21.opts", SimpleNamespace(emphasis="None")):
            scheduled = prompt_parser.get_multicond_learned_conditioning(
                SimpleNamespace(get_learned_conditioning=engine), prompts, 2
            )
        composition, batch = prompt_parser.reconstruct_multicond_batch(scheduled, 0)
        cond = compile_weighted_conditions(batch, composition)
        context = cond[0]["model_conds"]["c_crossattn"].cond

        self.assertEqual(tuple(scheduled.batch[0][0].schedules[0].cond.shape), (3, 12))
        self.assertEqual(tuple(context.shape), (1, 3, 12))
        transformer = QwenImage21Transformer2DModel(
            in_channels=4,
            out_channels=4,
            num_layers=0,
            attention_head_dim=8,
            num_attention_heads=2,
            context_in_dim=12,
            axes_dims_rope=[2, 2, 4],
        )
        sequence, _, _ = transformer.build_sequence(torch.randn(1, 4, 2, 2), context, [], [])
        self.assertEqual(tuple(sequence.shape), (1, 7, 16))

    def test_transformer_forward_with_and_without_reference_images(self):
        model = QwenImage21Transformer2DModel(
            in_channels=4,
            out_channels=4,
            num_layers=1,
            attention_head_dim=8,
            num_attention_heads=2,
            context_in_dim=12,
            mlp_ratio=2,
            axes_dims_rope=[2, 2, 4],
            device="cpu",
            dtype=torch.float32,
        )
        for module in model.modules():
            if isinstance(module, ZeroCenteredRMSNorm):
                torch.nn.init.zeros_(module.weight)
        latent = torch.randn(1, 4, 2, 3)
        context = torch.randn(1, 5, 12)

        with patch("backend.nn.qwen_image21.attention_function", attention_pytorch):
            generated = model(latent, torch.tensor([0.5]), context)
            edited = model(
                latent,
                torch.tensor([0.5]),
                context,
                ref_latents=[torch.randn(1, 4, 1, 2)],
                image_slots=[2],
            )

        self.assertEqual(tuple(generated.shape), (1, 4, 2, 3))
        self.assertEqual(tuple(edited.shape), (1, 4, 2, 3))
        self.assertTrue(torch.isfinite(generated).all())
        self.assertTrue(torch.isfinite(edited).all())

    def test_masked_attention_skips_flash_fallback(self):
        from backend.nn.qwen_image21 import _block_causal_attention

        q = torch.randn(1, 3, 2, 8)
        segments = [(0, 3, torch.ones(3, 3, dtype=torch.bool).tril())]
        with (
            patch("backend.nn.qwen_image21.attention_function", attention_flash),
            patch("backend.nn.qwen_image21.attention_pytorch", wraps=attention_pytorch) as pytorch,
        ):
            result = _block_causal_attention(segments, {})(q, q, q, 2)

        self.assertEqual(tuple(result.shape), (1, 3, 16))
        pytorch.assert_called_once()

    def test_qwen3vl_vision_fp32_skips_flash_fallback(self):
        from backend.nn.llm.qwen35 import Qwen35VisionAttention

        vision = Qwen35VisionAttention(hidden_size=16, num_heads=2)
        with (
            patch("backend.nn.llm.qwen35.apply_rope", side_effect=lambda q, k, _pe: (q, k)),
            patch("backend.nn.llm.qwen35.attention_function", attention_flash),
            patch("backend.nn.llm.qwen35.attention_pytorch", wraps=attention_pytorch) as pytorch,
        ):
            result = vision(torch.randn(3, 16), torch.tensor([0, 3]), None)

        self.assertEqual(tuple(result.shape), (3, 16))
        pytorch.assert_called_once()

    def test_transformer_rope_uses_token_axis(self):
        model = QwenImage21Transformer2DModel(
            in_channels=4,
            out_channels=4,
            num_layers=1,
            attention_head_dim=8,
            num_attention_heads=2,
            context_in_dim=12,
            mlp_ratio=2,
            axes_dims_rope=[2, 2, 4],
        )
        tokens, pe, _ = model.build_sequence(torch.randn(1, 4, 2, 3), torch.randn(1, 3, 12), [], [])
        self.assertEqual(pe.shape[:3], (1, tokens.shape[1], 1))

        query = torch.randn(1, tokens.shape[1], 2, 8)
        rotated = ck.apply_rope(query, query, pe)[0]
        pairs = query.reshape(1, tokens.shape[1], 2, 4, 1, 2)
        expected = (pe[..., 0] * pairs[..., 0] + pe[..., 1] * pairs[..., 1]).reshape(query.shape)
        self.assertTrue(torch.allclose(rotated, expected, atol=1e-6, rtol=1e-6))

    def test_transformer_uses_forge_mixed_precision_operations(self):
        with using_forge_operations(
            device=torch.device("cpu"),
            dtype=torch.bfloat16,
            manual_cast_enabled=False,
            bnb_dtype={"mixed_ops": True, "TE": False},
        ):
            model = QwenImage21Transformer2DModel(
                in_channels=4,
                out_channels=4,
                num_layers=1,
                attention_head_dim=8,
                num_attention_heads=2,
                context_in_dim=12,
                mlp_ratio=2,
                axes_dims_rope=[2, 2, 4],
            )

        self.assertIn("MixedPrecisionOps", type(model.img_in).__qualname__)
        self.assertEqual(model.img_in._orig_shape, (16, 4))

    def test_vae_encodes_rgba_and_decodes_at_spatial_scale(self):
        config = {
            "dim": 4,
            "dec_dim": 6,
            "z_dim": 2,
            "dim_mult": [1, 2, 4, 8, 8],
            "num_res_blocks": 2,
            "attn_scales": [],
            "temperal_downsample": [False, True, True, True],
            "image_channels": 4,
            "patch_size": 1,
            "temporal_kernel": 1,
        }
        with using_forge_operations(device=torch.device("cpu"), dtype=torch.float32):
            vae = QwenImage21VAE(**config)
        wrapped = VAE(model=vae, device=torch.device("cpu"), dtype=torch.float32, is_qwen_image21=True)
        self.assertEqual(wrapped.latent_channels, config["z_dim"])
        self.assertEqual(wrapped.downscale_ratio, 16)
        self.assertEqual(wrapped.clone().latent_channels, config["z_dim"])

        latent = vae.encode(torch.randn(1, 4, 32, 32))
        decoded = vae.decode(latent)

        self.assertEqual(tuple(latent.shape), (1, 2, 2, 2))
        self.assertEqual(tuple(decoded.shape), (1, 4, 32, 32))

    def test_rgb_vae_input_pads_opaque_alpha(self):
        vae = VAE.__new__(VAE)
        vae.input_channels = 4
        vae.pad_channel_value = 1.0

        processed = vae.process_input(torch.zeros(1, 3, 2, 2))

        self.assertEqual(tuple(processed.shape), (1, 4, 2, 2))
        self.assertTrue(torch.equal(processed[:, :3], torch.full((1, 3, 2, 2), -1.0)))
        self.assertTrue(torch.equal(processed[:, 3:], torch.ones(1, 1, 2, 2)))

    def test_bundled_component_config(self):
        model_root = os.path.join(ROOT, "backend", "huggingface", "Qwen", "Qwen-Image-2.1")
        with open(os.path.join(model_root, "model_index.json"), encoding="utf-8") as stream:
            model_index = json.load(stream)
        with open(os.path.join(model_root, "transformer", "config.json"), encoding="utf-8") as stream:
            transformer = json.load(stream)
        with open(os.path.join(model_root, "vae", "config.json"), encoding="utf-8") as stream:
            vae = json.load(stream)

        self.assertEqual(model_index["transformer"][1], "QwenImage21Transformer2DModel")
        self.assertEqual(transformer["in_channels"], 64)
        self.assertEqual(vae["z_dim"], 64)
        self.assertEqual(vae["image_channels"], 4)

    def test_bundled_qwen3_tokenizer_image_markers(self):
        from transformers import Qwen2TokenizerFast

        tokenizer_path = os.path.join(
            ROOT,
            "backend",
            "huggingface",
            "Tongyi-MAI",
            "Z-Image-Turbo",
            "tokenizer",
        )
        tokenizer = Qwen2TokenizerFast.from_pretrained(tokenizer_path)

        self.assertEqual(tokenizer.convert_tokens_to_ids("<|image_pad|>"), 151655)
        self.assertEqual(tokenizer.convert_tokens_to_ids("<|vision_start|>"), 151652)
        self.assertEqual(tokenizer.convert_tokens_to_ids("<|vision_end|>"), 151653)


if __name__ == "__main__":
    unittest.main()
