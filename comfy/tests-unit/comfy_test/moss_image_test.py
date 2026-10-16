import json
from pathlib import Path

import pytest
import torch
from torch import nn
import nodes

import comfy.lora
import comfy.model_base
import comfy.model_management
import comfy.sd
import comfy.supported_models
import comfy.text_encoders.moss_image
import comfy.text_encoders.qwen35
from comfy.ldm.moss_image.model import MOSSImage
from comfy.model_detection import detect_unet_config
from comfy.ops import manual_cast
from comfy_extras.nodes_moss_image import MOSSImageLayoutPrompt


def make_model(fused_qkv=False, dtype=torch.float32):
    model = MOSSImage(
        dim=128, ffn_dim=256, num_heads=1, num_layers=1, text_dim=32,
        latent_channels=8, fused_qkv=fused_qkv, dtype=dtype, device="cpu", operations=manual_cast,
    )
    model.load_state_dict({name: torch.randn_like(value) * 0.02 for name, value in model.state_dict().items()})
    return model


@pytest.mark.parametrize("fused_qkv", [False, True])
def test_detection_uses_output_width_for_packed_weights(fused_qkv):
    state = {
        "shared_block_modulation.weight": torch.empty(768, 64, device="meta"),
        "layers.0.proj.ffn_up_gate.weight": torch.empty(512, 64, device="meta"),
    }
    if fused_qkv:
        state["layers.0.proj.qkv.weight"] = torch.empty(384, 64, device="meta")
    assert detect_unet_config(state, "") == {
        "image_model": "moss_image", "dim": 128, "ffn_dim": 256,
        "num_heads": 1, "num_layers": 1, "fused_qkv": fused_qkv,
    }


def test_incomplete_moss_signature_does_not_claim_another_model():
    assert detect_unet_config({"shared_block_modulation.weight": torch.empty(768, 64, device="meta")}, "") is None


@pytest.mark.parametrize("fused_qkv", [False, True])
@pytest.mark.parametrize("dtype", [torch.float32, torch.bfloat16])
def test_small_cpu_forward_and_replace_patch(fused_qkv, dtype):
    torch.manual_seed(42)
    model = make_model(fused_qkv, dtype)
    image = torch.randn(1, 8, 3, 5, dtype=dtype)
    context = torch.randn(1, 4, 32, dtype=dtype)
    timestep = torch.tensor([0.5], dtype=dtype)
    seen = []

    def replace(arguments, extra):
        seen.append((arguments["transformer_options"]["block_index"], arguments["img"].shape))
        return extra["original_block"](arguments)

    options = {"patches_replace": {"dit": {("single_block", 0): replace}}}
    with torch.set_grad_enabled(False):
        expected = model(image, timestep, context)
        actual = model(image, timestep, context, transformer_options=options)
    torch.testing.assert_close(actual, expected)
    assert actual.shape == image.shape
    assert actual.dtype == dtype
    assert actual.device.type == "cpu"
    assert torch.isfinite(actual).all()
    assert seen == [(0, (1, 19, 128))]
    assert set(options) == {"patches_replace"}


def test_fused_qkv_matches_separate_projections():
    torch.manual_seed(123)
    separate, fused = make_model(), make_model(True)
    state = separate.state_dict()
    qkv = torch.cat([state.pop("layers.0.proj." + projection + ".weight") for projection in ("q", "k", "v")])
    state["layers.0.proj.qkv.weight"] = qkv
    fused.load_state_dict(state)
    image, context = torch.randn(1, 8, 2, 3), torch.randn(1, 3, 32)
    with torch.set_grad_enabled(False):
        expected = separate(image, torch.tensor([0.5]), context)
        actual = fused(image, torch.tensor([0.5]), context)
    torch.testing.assert_close(actual, expected)


def test_training_path_keeps_gradients(monkeypatch):
    monkeypatch.setattr(comfy.model_management, "in_training", True)
    model = make_model()
    image = torch.randn(1, 8, 2, 3, requires_grad=True)
    context = torch.randn(1, 3, 32, requires_grad=True)
    model(image, torch.tensor([0.5]), context).square().mean().backward()
    assert torch.isfinite(image.grad).all()
    assert torch.isfinite(context.grad).all()
    assert torch.isfinite(model.layers[0].proj["q"].weight.grad).all()


def test_lora_separate_keys_target_fused_weight_slices():
    model = comfy.model_base.MOSSImage.__new__(comfy.model_base.MOSSImage)
    nn.Module.__init__(model)
    model.model_config = comfy.supported_models.MOSSImage({
        "dim": 128, "ffn_dim": 256, "num_heads": 1, "num_layers": 1,
    })
    model.diffusion_model = make_model(True)
    mapping = comfy.lora.model_lora_keys_unet(model, {})
    for index, projection in enumerate(("q", "k", "v")):
        expected = ("diffusion_model.layers.0.proj.qkv.weight", (0, index * 128, 128))
        assert mapping["diffusion_model.layers.0.proj." + projection] == expected
        assert mapping["lora_unet_layers_0_proj_" + projection] == expected


@pytest.mark.parametrize("elements", [[], None])
def test_empty_layout_preserves_original_prompt(elements):
    assert MOSSImageLayoutPrompt.execute("  a garden  ", elements, 1344, 768).result == ("  a garden  ",)


def test_layout_uses_centered_pixel_boxes_and_keeps_roles():
    elements = [
        {"type": "image", "desc": "tree", "bbox": [0, 0, 1000, 500]},
        {"type": "image", "desc": "person", "bbox": [250, 500, 750, 1000]},
        {"type": "text", "desc": "sign", "text": "Hello", "bbox": [0, 0, 125, 125],
         "color_palette": ["#ffffff"]},
    ]
    result, = MOSSImageLayoutPrompt.execute("  A garden  ", elements, 1344, 768, "2").result
    data = json.loads(result)
    assert data["summary"] == {"caption": "A garden"}
    assert data["bbox_coord_space"] == "abs_centralized"
    assert data["bbox_format"] == "yxyx"
    assert data["items"] == [
        {"label": "object", "caption": "tree", "bbox": [-384, -672, 384, 0]},
        {"label": "character", "caption": "person", "bbox": [-192, 0, 192, 672]},
        {"label": "text", "caption": "sign", "text": "Hello", "palette": ["#ffffff"],
         "bbox": [-384, -672, -288, -504]},
    ]


@pytest.mark.parametrize("text,template,thinking,expected_text,expected_thinking", [
    ("  A garden  ", None, None, "A garden", True),
    ("  A garden  ", "custom {}", False, "  A garden  ", False),
    ("<|im_start|>user\nA garden", None, None, "<|im_start|>user\nA garden", False),
])
def test_tokenizer_template_does_not_download_assets(monkeypatch, text, template, thinking, expected_text, expected_thinking):
    seen = {}

    def tokenize(self, value, **kwargs):
        seen.update(text=value, **kwargs)
        return seen

    monkeypatch.setattr(comfy.text_encoders.qwen35.Qwen35ImageTokenizer, "tokenize_with_weights", tokenize)
    tokenizer_class = comfy.text_encoders.moss_image.MOSSImageTokenizer
    tokenizer = tokenizer_class.__new__(tokenizer_class)
    tokenizer.tokenize_with_weights(text, llama_template=template, thinking=thinking)
    assert seen["text"] == expected_text
    assert seen["thinking"] is expected_thinking
    assert seen["llama_template"] == (template or (
        "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n<think>\n" if expected_thinking else None
    ))


def test_moss_text_encoder_route_leaves_other_qwen_modes_unchanged(monkeypatch):
    targets = []
    monkeypatch.setattr(comfy.sd, "detect_te_model", lambda state: comfy.sd.TEModel.QWEN35_9B)
    monkeypatch.setattr(comfy.sd, "llama_detect", lambda state: {})
    monkeypatch.setattr(comfy.sd, "CLIP", lambda target, **kwargs: targets.append(target))
    for clip_type in (comfy.sd.CLIPType.MOSS_IMAGE, comfy.sd.CLIPType.STABLE_DIFFUSION):
        comfy.sd.load_text_encoder_state_dicts(
            [{"model.language_model.embed_tokens.weight": torch.zeros(2, 2)}], clip_type=clip_type,
        )
    assert targets[0].tokenizer is comfy.text_encoders.moss_image.MOSSImageTokenizer
    assert issubclass(targets[0].clip, comfy.text_encoders.moss_image.MOSSImageTEModel)
    assert targets[1].tokenizer is not targets[0].tokenizer
    assert not issubclass(targets[1].clip, comfy.text_encoders.moss_image.MOSSImageTEModel)


def test_native_node_registration_preserves_standard_loaders():
    assert "moss_image" in nodes.CLIPLoader.INPUT_TYPES()["required"]["type"][0]
    assert MOSSImageLayoutPrompt.define_schema().node_id == "MOSSImageLayoutPrompt"
    source = (Path(__file__).resolve().parents[2] / "nodes.py").read_text(encoding="utf-8")
    assert '"nodes_moss_image.py"' in source


def test_supported_model_uses_flux2_latents_and_ignores_checkpoint_rope_cache():
    config = comfy.supported_models.MOSSImage({"dim": 128, "ffn_dim": 256, "num_heads": 1, "num_layers": 1})
    assert isinstance(config.latent_format, comfy.latent_formats.Flux2)
    assert config.sampling_settings == {"multiplier": 1.0, "shift": 5.0}
    state = {"rope.bands": torch.zeros(4), "weight": torch.ones(1)}
    assert config.process_unet_state_dict(state) == {"weight": torch.ones(1)}
