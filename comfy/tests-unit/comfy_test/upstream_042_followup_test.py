import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import torch
from torch import nn

import comfy.lora
import comfy.model_base
from comfy.ldm.fibo2.model import Fibo2
from comfy.ldm.minimax.model import FinalLayer
from comfy.model_detection import detect_unet_config
from comfy.ops import manual_cast
from comfy.text_encoders.llama import BaseGenerate
from comfy_api_nodes import nodes_bfl, nodes_bria


@pytest.mark.parametrize("top_p,retained", [(0.0, 1), (0.49, 1), (0.7, 2), (0.95, 4), (1.0, 4)])
def test_top_p_retains_the_token_that_crosses_the_threshold(top_p, retained):
    probabilities = torch.tensor([[0.5, 0.25, 0.15, 0.1]])
    actual, indices = BaseGenerate.processed_probs(
        None, probabilities.log(), 1.0, 0, top_p, 0.0, 1.0, [],
    )
    expected = probabilities.clone()
    expected[:, retained:] = 0
    expected /= expected.sum()
    torch.testing.assert_close(actual, expected)
    assert indices is None


@pytest.mark.parametrize("steps", [1, 3])
@pytest.mark.parametrize("head", ["video", "audio"])
def test_single_head_lora_changes_only_the_pdd_base_head(steps, head):
    model = comfy.model_base.MiniMaxH3.__new__(comfy.model_base.MiniMaxH3)
    nn.Module.__init__(model)
    model.model_config = SimpleNamespace(unet_config={"image_model": "minimax_h3", "pdd_steps": steps})
    model.diffusion_model = nn.Module()
    model.diffusion_model.final_layer = FinalLayer(
        8, 4, 2, 3, 1e-5, pdd_steps=steps, dtype=torch.float32, device="cpu", operations=manual_cast,
    )
    mapping = comfy.lora.model_lora_keys_unet(model, {})
    name = f"final_layer.{head}_out"
    key = f"diffusion_model.{name}.weight"
    original = torch.zeros_like(model.state_dict()[key])
    width = original.shape[0] // steps
    bias = torch.zeros(original.shape[0])
    patches = comfy.lora.load_lora({
        name + ".diff": torch.ones(width, original.shape[1]),
        name + ".diff_b": torch.ones(width),
    }, mapping)
    target = mapping[name]
    if isinstance(target, tuple):
        key, offset = target
    else:
        key, offset = target, None
    result = comfy.lora.calculate_weight([(1.0, patches[target], 1.0, offset, None)], original, key)
    bias_target = comfy.lora.bias_key(target)
    bias_result = comfy.lora.calculate_weight(
        [(1.0, patches[bias_target], 1.0, offset, None)], bias, key.replace(".weight", ".bias"),
    )
    expected = torch.zeros_like(original)
    expected[:width] = 1
    torch.testing.assert_close(result, expected)
    torch.testing.assert_close(bias_result[:width], torch.ones(width))
    torch.testing.assert_close(bias_result[width:], torch.zeros_like(bias_result[width:]))


@pytest.mark.parametrize("fused", [False, True])
@pytest.mark.parametrize("reference", [False, True])
def test_fibo2_detection_and_native_latent_forward(fused, reference):
    model = Fibo2(
        in_channels=4, dim=256, n_heads=2, n_layers=2, n_refiner_layers=1,
        injection_layers=(1,), cap_feat_dim=8, perceiver_layers=1, max_gist_tokens=256,
        ffn_dim=32, fused_ffn=fused, dtype=torch.float32, device="cpu", operations=manual_cast,
    )
    model.load_state_dict({name: torch.randn_like(value) * 0.02 for name, value in model.state_dict().items()})
    detected = detect_unet_config(model.state_dict(), "")
    assert detected["image_model"] == "fibo2"
    assert detected["in_channels"] == 4
    assert detected["injection_layers"] == [1]
    assert detected.get("fused_ffn", True) is fused
    latent = torch.randn(1, 4, 2, 3)
    references = [torch.randn(1, 4, 3, 2)] if reference else []
    with torch.set_grad_enabled(False):
        result = model(latent, torch.tensor([0.5]), torch.randn(1, 5, 16), ref_latents=references)
    assert result.shape == latent.shape
    assert result.dtype == latent.dtype
    assert torch.isfinite(result).all()


def test_authorized_cloud_nodes_are_registered():
    bfl = asyncio.run(nodes_bfl.BFLExtension().get_node_list())
    bria = asyncio.run(nodes_bria.BriaExtension().get_node_list())
    assert nodes_bfl.Flux3MaxTextToVideoNode in bfl
    assert nodes_bfl.Flux3MaxImageToVideoNode in bfl
    assert nodes_bria.BriaImageGenerate in bria
    for node in (nodes_bfl.Flux3MaxTextToVideoNode, nodes_bfl.Flux3MaxImageToVideoNode, nodes_bria.BriaImageGenerate):
        assert node.define_schema().is_api_node


def test_flux3_max_polls_the_submitted_request_without_network(monkeypatch):
    sync = AsyncMock(side_effect=[
        nodes_bfl.Flux3MaxSubmitResponse(request_id="test-request"),
        nodes_bfl.Flux3MaxResult(video={"url": "https://example.invalid/result.mp4"}),
    ])
    poll = AsyncMock()
    download = AsyncMock(return_value="video")
    monkeypatch.setattr(nodes_bfl, "sync_op", sync)
    monkeypatch.setattr(nodes_bfl, "poll_op", poll)
    monkeypatch.setattr(nodes_bfl, "download_url_to_video_output", download)
    request = nodes_bfl.Flux3MaxVideoRequest(
        prompt="A garden", duration=5, resolution="720p", reasoning_level="high",
        aspect_ratio="16:9", generate_audio=True, seed=42,
    )
    result = asyncio.run(nodes_bfl._flux3max_execute(nodes_bfl.Flux3MaxTextToVideoNode, "text-to-video", request))
    assert result.result == ("video",)
    assert sync.await_args_list[0].args[1].path.endswith("/text-to-video")
    assert poll.await_args.args[1].path.endswith("/requests/test-request/status")
    assert sync.await_args_list[1].args[1].path.endswith("/requests/test-request")
    download.assert_awaited_once_with("https://example.invalid/result.mp4")


def test_bria_generate_preserves_prompt_and_reference_without_network(monkeypatch):
    upload = AsyncMock(return_value="https://example.invalid/reference.png")
    run = AsyncMock(return_value=nodes_bria.IO.NodeOutput("image", "caption"))
    monkeypatch.setattr(nodes_bria, "upload_image_to_comfyapi", upload)
    monkeypatch.setattr(nodes_bria, "_run_fibo_edit", run)
    image = torch.ones(1, 8, 8, 3)
    result = asyncio.run(nodes_bria.BriaImageGenerate.execute("A garden", "", "1:1", "1MP", 42, {}, image))
    assert result.result == ("image", "caption")
    assert run.await_args.args[1] == "/proxy/bria/v2/image/generate"
    request = run.await_args.args[2]
    assert request.prompt == "A garden"
    assert request.images == ["https://example.invalid/reference.png"]
    assert request.seed == 42
    upload.assert_awaited_once()
