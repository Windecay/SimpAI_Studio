import importlib.util
from pathlib import Path
import sys
import types
from unittest.mock import Mock

import gguf
import numpy as np
import pytest
import torch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "comfy"))

import comfy.ops as ops


@pytest.fixture(scope="module")
def ggml_ops():
    name = "_linear_input_act_gguf_test"
    package = types.ModuleType(name)
    package.__path__ = [str(ROOT / "comfy/custom_nodes/ComfyUI-GGUF")]
    sys.modules[name] = package
    try:
        spec = importlib.util.spec_from_file_location(
            f"{name}.ops", Path(package.__path__[0]) / "ops.py"
        )
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        yield module
    finally:
        for key in list(sys.modules):
            if key == name or key.startswith(name + "."):
                sys.modules.pop(key)


@pytest.mark.parametrize("device", ["cpu", "cuda"])
@pytest.mark.parametrize("activation", ["gelu_tanh", "situ"])
@pytest.mark.parametrize("qtype", [
    gguf.GGMLQuantizationType.Q8_0,
    gguf.GGMLQuantizationType.Q4_K,
    gguf.GGMLQuantizationType.Q6_K,
])
def test_gguf_uses_native_dequantization_with_fp16_accumulation(
    ggml_ops, monkeypatch, device, activation, qtype
):
    if device == "cuda" and not torch.cuda.is_available():
        pytest.skip("CUDA unavailable")
    width, outputs = 256, 16
    if qtype == gguf.GGMLQuantizationType.Q8_0:
        dense = np.random.default_rng(42).normal(0, 0.1, (outputs, width)).astype(np.float32)
        packed = torch.from_numpy(gguf.quants.quantize(dense, qtype))
    else:
        block_size, type_size = gguf.GGML_QUANT_SIZES[qtype]
        packed = torch.zeros(outputs, width // block_size * type_size, dtype=torch.uint8)
    linear = ggml_ops.GGMLOps.Linear(width, outputs)
    linear.weight = torch.nn.Parameter(
        ggml_ops.GGMLTensor(packed.to(device), tensor_type=qtype,
                           tensor_shape=torch.Size((outputs, width))),
        requires_grad=False,
    )
    linear.bias = torch.nn.Parameter(torch.full((outputs,), 0.25, device=device, dtype=torch.float16))
    x = torch.full((2, 3, width * (2 if activation == "situ" else 1)), 0.1, device=device, dtype=torch.float16)
    residual = torch.ones(2, 3, outputs, device=device, dtype=torch.float16)
    scale = torch.tensor(0.5, device=device, dtype=torch.float16)
    if activation == "situ":
        hidden, gate = x.chunk(2, dim=-1)
        activated = (4.0 * torch.tanh(gate / 4.0) * torch.sigmoid(gate)) * (25.0 * torch.tanh(hidden / 25.0))
    else:
        activated = torch.nn.functional.gelu(x, approximate="tanh")
    expected = torch.addcmul(residual, linear(activated), scale)
    monkeypatch.setattr(torch.backends.cuda.matmul, "allow_fp16_accumulation", True)
    # Exercise the same dispatch on CPU as well as the real CUDA condition.
    if device == "cpu":
        monkeypatch.setattr(ops, "_fp16_linear_wanted", lambda value: True)
    fast = Mock(side_effect=AssertionError("GGUF must retain its native dequantization"))
    monkeypatch.setattr(ops.quant_ops.ck, "fp16_linear", fast)
    actual = ops.linear_input_act(linear, x, activation, residual=residual, residual_scale=scale)
    fast.assert_not_called()
    torch.testing.assert_close(actual, expected)


@pytest.mark.parametrize("parameter", [False, True])
def test_plain_weights_keep_fast_path_and_release_cast(monkeypatch, parameter):
    weight = torch.ones(3, 4)
    if parameter:
        weight = torch.nn.Parameter(weight)
    linear = types.SimpleNamespace(weight=weight)
    x = torch.ones(2, 4)
    cast = Mock(return_value=(weight, None, "stream"))
    uncast = Mock()
    fast = Mock(return_value=torch.ones(2, 3))
    monkeypatch.setattr(ops, "_fp16_linear_wanted", lambda value: True)
    monkeypatch.setattr(ops, "cast_bias_weight", cast)
    monkeypatch.setattr(ops, "uncast_bias_weight", uncast)
    monkeypatch.setattr(ops.quant_ops.ck, "fp16_linear", fast)
    actual = ops.linear_input_act(linear, x, "gelu_tanh")
    assert actual is fast.return_value
    cast.assert_called_once()
    fast.assert_called_once()
    uncast.assert_called_once_with(linear, weight, None, "stream")
