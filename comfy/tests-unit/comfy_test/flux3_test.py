import json

import pytest
import torch

import comfy.lora
from comfy.ldm.flux3.model import Flux3
from comfy.model_detection import detect_unet_config
from comfy.ops import manual_cast
from comfy_extras.nodes_flux import Flux3LayoutPrompt


@pytest.mark.parametrize("fused_qkv", [False, True])
@pytest.mark.parametrize("flow_map", [False, True])
def test_detect_flux3_with_packed_weight_width(fused_qkv, flow_map):
    state = {
        "content_mode_blocks.image.0.attn_out.weight": torch.empty(128, 64, device="meta"),
        "single_stream_modulations.txt.lin.weight": torch.empty(384, 64, device="meta"),
        "txt_mode_blocks.0.mlp_in.weight": torch.empty(768, 64, device="meta"),
        "single_blocks.0.mlp_in.weight": torch.empty(768, 64, device="meta"),
    }
    if fused_qkv:
        state["single_blocks.0.qkv.weight"] = torch.empty(384, 64, device="meta")
    if flow_map:
        state["ref_time_in.in_layer.weight"] = torch.empty(128, 128, device="meta")
    config = detect_unet_config(state, "")
    assert config == {
        "image_model": "flux3", "hidden_size": 128, "num_heads": 1,
        "fused_qkv": fused_qkv, "flow_map": flow_map,
        "depth": 1, "depth_single_blocks": 1,
    }


@pytest.mark.parametrize("fused_qkv,flow_map,references", [
    (False, False, False), (True, False, False),
    (False, False, True), (True, False, True),
    (False, True, False), (True, True, True),
])
def test_flux3_small_cpu_forward(fused_qkv, flow_map, references):
    torch.manual_seed(123)
    model = Flux3(hidden_size=128, num_heads=1, depth=1, depth_single_blocks=1,
                  fused_qkv=fused_qkv, flow_map=flow_map,
                  dtype=torch.float32, device="cpu", operations=manual_cast)
    model.load_state_dict({name: torch.randn_like(value) * 0.02 for name, value in model.state_dict().items()})
    x = torch.randn(1, 128, 3, 5)
    context = torch.randn(1, 2, 20480)
    refs = [torch.randn(1, 128, 2, 3), torch.randn(1, 128, 1, 2)] if references else None
    options = {"sample_sigmas": torch.tensor([1.0, 0.5, 0.0])}
    with torch.set_grad_enabled(False):
        output = model(x, torch.tensor([0.5]), context, refs, transformer_options=options)
        if not flow_map:
            text, reference = model.preprocess_conds(context, refs)
            cached = model(x, torch.tensor([0.5]), txt_states=text, ref_states=reference,
                           ref_shapes=[ref.shape[-2:] for ref in refs] if refs else None)
            torch.testing.assert_close(output, cached)
    assert output.shape == x.shape
    assert output.dtype == x.dtype
    assert output.device == x.device
    assert torch.isfinite(output).all()


def test_flux3_layout_prompt_keeps_empty_prompt_unchanged():
    assert Flux3LayoutPrompt.execute("Place <obj_1> here", []).result == ("Place <obj_1> here",)


def test_flux3_layout_prompt_display_name_preserves_workflow_id():
    schema = Flux3LayoutPrompt.define_schema()
    assert schema.node_id == "Flux3LayoutPrompt"
    assert schema.display_name == "FLUX 3 Image Layout Prompt"


def test_flux3_layout_prompt_serializes_text_and_boxes():
    prompt = "Place <obj_1> above <obj_2>"
    elements = [
        {"type": "text", "text": "Hello", "desc": "sign", "bbox": [0, 0, 0.5, 0.25]},
        {"type": "image", "desc": "building", "bbox": [0.1, 0.3, 0.9, 1]},
    ]
    result, = Flux3LayoutPrompt.execute(prompt, elements).result
    assert result.startswith(prompt + " ")
    assert json.loads(result[len(prompt) + 1:]) == [
        {"id": "obj_1", "desc": 'sign "Hello"', "bbox": elements[0]["bbox"]},
        {"id": "obj_2", "desc": "building", "bbox": elements[1]["bbox"]},
    ]


def test_lora_preserves_attention_configuration():
    value = {"attention": "pytorch"}
    patches = comfy.lora.load_lora({"block.attn.config": value}, {}, log_missing=False)
    assert patches == {"block.attn.config": ("config", (value,))}
