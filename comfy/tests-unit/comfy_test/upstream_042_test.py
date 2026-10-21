import json
from types import SimpleNamespace

import pytest
import torch

import comfy.lora
import comfy.lora_convert
import comfy.model_management
import comfy.sd1_clip
import comfy.text_encoders.qwen35
from comfy.ldm.flux.layers import EmbedND
from comfy.ldm.minimax.model import FinalLayer
from comfy.ldm.moss_image.model import MOSSImage
from comfy.model_detection import detect_unet_config
from comfy.ops import manual_cast
from comfy_extras.nodes_moss_image import MOSSImageControl


def test_moss_default_rope_matches_previous_embedding():
    model = MOSSImage(
        dim=128, ffn_dim=32, num_heads=1, num_layers=0, text_dim=16,
        latent_channels=8, dtype=torch.float32, device="cpu", operations=manual_cast,
    )
    h, w, length = 3, 5, 4
    ids = torch.zeros(1, h * w + length, 4)
    ids[0, :h * w, 1] = length
    ids[0, :h * w, 2] = (torch.arange(h) - (h - 1) / 2).repeat_interleave(w)
    ids[0, :h * w, 3] = (torch.arange(w) - (w - 1) / 2).repeat(h)
    ids[0, h * w:, 1] = torch.arange(length)
    expected = EmbedND(dim=128, theta=10000, axes_dim=[32] * 4)(ids).transpose(1, 2).contiguous()
    actual = model.rope(h, w, length, torch.device("cpu"))
    torch.testing.assert_close(actual, expected)
    changed = model.rope(h, w, length, torch.device("cpu"), {"rope_options": {"scale_x": 2, "shift_y": 3}})
    assert changed.shape == actual.shape
    assert torch.isfinite(changed).all()
    assert not torch.equal(changed, actual)


def test_moss_control_without_maps_preserves_conditioning():
    positive, negative = [[torch.zeros(1, 1, 4), {}]], [[torch.ones(1, 1, 4), {}]]
    result = MOSSImageControl.execute(positive, negative, None).result
    assert result[0] is positive
    assert result[1] is negative


def test_moss_control_aligns_maps_batches_and_sampling_range():
    positive = [[torch.zeros(1, 1, 4), {"existing": True}]]
    vae = SimpleNamespace(encode=lambda image: image.movedim(-1, 1))
    color = torch.ones(2, 2, 3, 3)
    depth = torch.full((1, 1, 2, 3), 2.0)
    result = MOSSImageControl.execute(
        positive, positive, vae, color, depth, strength=0.5, start_percent=0.25, end_percent=0.75,
    ).result
    for conditioning in result:
        assert len(conditioning) == 3
        active = conditioning[1][1]
        assert active["existing"]
        assert (active["start_percent"], active["end_percent"]) == (0.25, 0.75)
        control = active["concat_latent_image"]
        assert control.shape == (2, 6, 2, 3)
        torch.testing.assert_close(control[:, :3], torch.full((2, 3, 2, 3), 0.5))
        torch.testing.assert_close(control[:, 3:], torch.ones(2, 3, 2, 3))
    assert positive[0][1] == {"existing": True}


@pytest.mark.parametrize("pdd_steps", [1, 3])
def test_h3_baked_pdd_detection_keeps_native_channel_counts(pdd_steps):
    state = {
        "video_patch_proj.weight": torch.empty(8, 8, device="meta"),
        "audio_patch_proj.weight": torch.empty(8, 3, device="meta"),
        "final_layer.video_out.weight": torch.empty(8 * pdd_steps, 8, device="meta"),
        "final_layer.audio_out.weight": torch.empty(3 * pdd_steps, 8, device="meta"),
        "blocks.0.attn.q_norm.weight": torch.empty(4, device="meta"),
        "blocks.0.attn.qkv_proj.weight": torch.empty(24, 8, device="meta"),
        "blocks.0.mlp.fc1.weight": torch.empty(32, 8, device="meta"),
        "condition_proj.weight": torch.empty(8, 6, device="meta"),
        "time_embedder.proj_in.weight": torch.empty(8, 4, device="meta"),
        "time_embedder.proj_out.weight": torch.empty(8, 8, device="meta"),
        "rope.inv_freq": torch.empty(2, device="meta"),
    }
    metadata = {"config": json.dumps({"transformer": {"pdd_steps": pdd_steps}})}
    config = detect_unet_config(state, "", metadata)
    assert config["latents_dim"] == 2
    assert config["audio_latents_dim"] == 3
    assert config["pdd_steps"] == pdd_steps


def test_h3_baked_pdd_heads_require_schedule_and_return_native_width():
    layer = FinalLayer(8, 4, 2, 3, 1e-5, pdd_steps=3, dtype=torch.float32, device="cpu", operations=manual_cast)
    layer.load_state_dict({name: torch.randn_like(value) * 0.02 for name, value in layer.state_dict().items()})
    assert layer.video_out.weight.shape == (6, 8)
    assert layer.audio_out.weight.shape == (9, 8)
    arguments = (torch.randn(4, 8), torch.randn(1, 4), (0, 2, 0), (2, 4, 0), torch.tensor(0.5))
    with pytest.raises(ValueError, match="sigma schedule"):
        layer(*arguments, None, (12.0, 3.0))
    video, audio = layer(*arguments, torch.tensor([1.0, 0.5, 0.0]), (12.0, 3.0))
    assert video.shape == (2, 2)
    assert audio.shape == (2, 3)
    assert torch.isfinite(video).all() and torch.isfinite(audio).all()


def test_set_lora_can_replace_weight_shape_without_changing_source():
    original = torch.ones(2, 3)
    replacement = torch.full((2, 7), 4.0)
    patches = [(1.0, ("set", (replacement,)), 1.0, None, None)]
    assert comfy.lora.calculate_shape(patches, original, "weight") == replacement.shape
    result = comfy.lora.calculate_weight(patches, original, "weight")
    torch.testing.assert_close(result, replacement)
    assert result.data_ptr() != replacement.data_ptr()
    torch.testing.assert_close(original, torch.ones(2, 3))


def test_moss_control_adapter_uses_explicit_set_weight_keys():
    state = {
        "video_embedder.weight": torch.empty(4, 12),
        "video_embedder.bias": torch.empty(4),
        "layers.0.proj.q.lora_A.weight": torch.empty(2, 4),
    }
    converted = comfy.lora_convert.convert_lora(state)
    assert converted["diffusion_model.video_embedder.set_weight"] is state["video_embedder.weight"]
    assert converted["diffusion_model.video_embedder.bias.set_weight"] is state["video_embedder.bias"]


@pytest.mark.parametrize("capability", [
    "supports_fp8_compute", "supports_nvfp4_compute", "supports_mxfp8_compute", "supports_int8_compute",
])
def test_cpu_does_not_advertise_gpu_quantized_compute(capability):
    assert getattr(comfy.model_management, capability)(torch.device("cpu")) is False


@pytest.mark.parametrize("thinking,suffix", [
    (True, "<think>\n"), (False, "<think>\n\n</think>\n\n"),
])
def test_qwen35_chat_template_handles_thinking_and_embedding_tokens(monkeypatch, thinking, suffix):
    seen = []
    embedding = torch.ones(1, 3)

    def tokenize(self, text, **kwargs):
        seen.append(text)
        return {"qwen35_9b": [[(embedding, 1.0), (248056, 1.0)]]}

    monkeypatch.setattr(comfy.sd1_clip.SD1Tokenizer, "tokenize_with_weights", tokenize)
    tokenizer = comfy.text_encoders.qwen35.Qwen35ImageTokenizer.__new__(
        comfy.text_encoders.qwen35.Qwen35ImageTokenizer,
    )
    tokenizer.llama_template = "<|im_start|>user\n{}<|im_end|>\n<|im_start|>assistant\n"
    tokenizer.llama_template_images = tokenizer.llama_template
    image = torch.zeros(1, 2, 2, 3)
    result = tokenizer.tokenize_with_weights("A garden", images=[image], thinking=thinking)
    assert seen[0].endswith(suffix)
    assert result["qwen35_9b"][0][0][0] is embedding
    assert result["qwen35_9b"][0][1][0]["data"] is image
