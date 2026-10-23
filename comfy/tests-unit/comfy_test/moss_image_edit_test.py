from types import SimpleNamespace

import pytest
import torch

import comfy.lora
import comfy.model_base
import comfy.model_management
import comfy.sampler_helpers
import comfy.supported_models
import comfy.ldm.moss_image.model as moss_model
from comfy.ldm.moss_image.model import MOSSImage
from comfy.ops import manual_cast
from comfy_extras.nodes_moss_image import EDIT_FORMATS, TextEncodeMOSSImageEdit


def make_model(fused=False):
    model = MOSSImage(dim=128, ffn_dim=256, num_heads=1, num_layers=2, text_dim=32,
                      latent_channels=8, fused_qkv=fused, dtype=torch.float32, device="cpu", operations=manual_cast)
    model.load_state_dict({key: torch.randn_like(value) * 0.1 for key, value in model.state_dict().items()})
    return model


@pytest.mark.parametrize("method,with_reference,uses_edit_time", [
    ("index_timestep_zero_text_start", True, True),
    ("index_timestep_zero_text_start", False, False),
    ("index_timestep_zero_isolated", True, False),
    ("index_timestep_zero", True, False),
    ("index", True, False),
])
def test_training_time_precision_applies_only_to_moss_image_edit(monkeypatch, method, with_reference, uses_edit_time):
    original = moss_model.edit_timestep_embedding
    seen = []

    def embed(timestep):
        seen.append(timestep.clone())
        return original(timestep)

    monkeypatch.setattr(moss_model, "edit_timestep_embedding", embed)
    model = make_model()
    refs = [torch.randn(1, 8, 2, 3)] if with_reference else []
    with torch.set_grad_enabled(False):
        output = model(torch.randn(1, 8, 3, 5), torch.tensor([0.37]), torch.randn(1, 4, 32),
                       ref_latents=refs, ref_latents_method=method)
    assert len(seen) == int(uses_edit_time)
    assert torch.isfinite(output).all()


@pytest.mark.parametrize("fp64_supported", [False, True])
def test_training_time_precision_handles_devices_without_fp64(monkeypatch, fp64_supported):
    monkeypatch.setattr(comfy.model_management, "supports_fp64", lambda device: fp64_supported)
    embedding = moss_model.edit_timestep_embedding(torch.tensor([0.37]))
    assert embedding.shape == (1, 256)
    assert embedding.dtype == torch.float32
    assert embedding.device.type == "cpu"
    assert torch.isfinite(embedding).all()


@pytest.mark.parametrize("fused", [False, True])
@pytest.mark.parametrize("method", ["index_timestep_zero_isolated", "index_timestep_zero_text_start"])
def test_precomputed_references_match_direct_path_and_do_not_change_text_to_image(fused, method):
    torch.manual_seed(43)
    model = make_model(fused)
    image, text = torch.randn(1, 8, 3, 5), torch.randn(1, 4, 32)
    refs = [torch.randn(1, 8, 2, 4), torch.randn(1, 8, 3, 2)]
    with torch.set_grad_enabled(False):
        original = model(image, torch.tensor([0.5]), text)
        kv = model.preprocess_refs(refs)
        saved = kv.clone()
        cached = model(image, torch.tensor([0.5]), text, ref_kv=kv, ref_latents_method=method)
        direct = model(image, torch.tensor([0.5]), text, ref_latents=refs, ref_latents_method=method)
        model(image, torch.tensor([0.1]), torch.randn(1, 7, 32), ref_kv=kv, ref_latents_method=method)
        restored = model(image, torch.tensor([0.5]), text)
    torch.testing.assert_close(cached, direct, atol=1e-6, rtol=1e-6)
    torch.testing.assert_close(kv, saved, atol=0, rtol=0)
    torch.testing.assert_close(original, restored, atol=0, rtol=0)
    assert not torch.allclose(cached, original)
    assert kv.shape == (1, 2, 2, 14, 128)
    assert not any("cache" in key or "reference" in key for key in model.__dict__)


@pytest.mark.parametrize("fused", [False, True])
def test_reference_cache_broadcast_matches_individual_cfg_calls(fused):
    torch.manual_seed(51)
    model = make_model(fused)
    images, texts = torch.randn(2, 8, 3, 5), torch.randn(2, 4, 32)
    with torch.set_grad_enabled(False):
        kv = model.preprocess_refs([torch.randn(1, 8, 2, 3)])
        actual = model(images, torch.tensor([0.4, 0.4]), texts, ref_kv=kv,
                       ref_latents_method="index_timestep_zero_text_start")
        expected = torch.cat([model(images[i:i + 1], torch.tensor([0.4]), texts[i:i + 1],
                                    ref_kv=kv, ref_latents_method="index_timestep_zero_text_start") for i in range(2)])
    torch.testing.assert_close(actual, expected, atol=2e-5, rtol=2e-5)


def test_reference_images_with_different_batch_sizes_are_repeated():
    model = make_model()
    with torch.set_grad_enabled(False):
        kv = model.preprocess_refs([torch.randn(1, 8, 2, 3), torch.randn(2, 8, 3, 4)])
    assert kv.shape == (2, 2, 2, 18, 128)
    assert torch.isfinite(kv).all()


def test_reference_preprocessing_can_be_cancelled(monkeypatch):
    model = make_model()

    def interrupted():
        raise comfy.model_management.InterruptProcessingException()

    monkeypatch.setattr(comfy.model_management, "throw_exception_if_processing_interrupted", interrupted)
    with pytest.raises(comfy.model_management.InterruptProcessingException):
        model.preprocess_refs([torch.zeros(1, 8, 2, 3)])


@pytest.mark.parametrize("method", ["index_timestep_zero_text_start", "index_timestep_zero_isolated"])
def test_reference_memory_budget_includes_both_cfg_caches(monkeypatch, method):
    monkeypatch.setattr(comfy.model_management, "xformers_enabled", lambda: False)
    monkeypatch.setattr(comfy.model_management, "pytorch_attention_flash_attention", lambda: True)
    base = comfy.model_base.MOSSImage.__new__(comfy.model_base.MOSSImage)
    torch.nn.Module.__init__(base)
    base.diffusion_model = MOSSImage(dtype=torch.bfloat16, device="meta", operations=manual_cast)
    base.memory_usage_factor = 14.6
    base.memory_usage_factor_conds = ("ref_latents",)
    base.memory_usage_shape_process = {}
    base.get_dtype_inference = lambda: torch.bfloat16
    shape = [1, 128, 32, 32]
    empty = base.memory_required(shape)
    condition = {"reference_latents": [torch.empty(shape, device="meta")], "reference_latents_method": method}
    full, minimum = comfy.sampler_helpers.estimate_memory(
        SimpleNamespace(model=base), shape, {"positive": [condition], "negative": [condition]})
    cache_bytes = 2 * 42 * 2 * 32 * 32 * 3072 * 2
    assert full >= minimum >= empty + cache_bytes


@pytest.mark.parametrize("method", ["index", "index_timestep_zero"])
def test_full_attention_reference_modes_do_not_reserve_a_kv_cache(method):
    base = comfy.model_base.MOSSImage.__new__(comfy.model_base.MOSSImage)
    torch.nn.Module.__init__(base)
    shapes = base.extra_conds_shapes(reference_latents=[torch.empty(1, 128, 3, 5, device="meta")],
                                     reference_latents_method=method)
    assert shapes == {"ref_latents": [1, 128, 15]}


@pytest.mark.parametrize("method", ["index", "index_timestep_zero", "index_timestep_zero_text_start"])
def test_reference_training_path_keeps_gradients(monkeypatch, method):
    monkeypatch.setattr(comfy.model_management, "in_training", True)
    model = make_model()
    image = torch.randn(1, 8, 2, 3, requires_grad=True)
    reference = torch.randn(1, 8, 3, 2, requires_grad=True)
    text = torch.randn(1, 4, 32, requires_grad=True)
    model(image, torch.tensor([0.5]), text, ref_latents=[reference], ref_latents_method=method).square().mean().backward()
    assert torch.isfinite(image.grad).all()
    assert torch.isfinite(reference.grad).all()
    assert torch.isfinite(text.grad).all()


@pytest.mark.parametrize("method,inference,hooks,cached", [
    ("index_timestep_zero_text_start", True, None, True),
    ("index_timestep_zero_isolated", True, None, True),
    ("index_timestep_zero_text_start", False, None, False),
    ("index_timestep_zero_text_start", True, object(), False),
    ("index_timestep_zero", True, None, False),
    ("index", True, None, False),
])
def test_conditioning_cache_respects_training_and_hooks(monkeypatch, method, inference, hooks, cached):
    monkeypatch.setattr(comfy.model_base.BaseModel, "extra_conds", lambda self, **kwargs: {})
    base = comfy.model_base.MOSSImage.__new__(comfy.model_base.MOSSImage)
    torch.nn.Module.__init__(base)
    base.diffusion_model = make_model()
    base.process_latent_in = lambda latent: latent
    base.get_dtype_inference = lambda: torch.float32
    with torch.inference_mode(inference):
        conds = base.extra_conds(reference_latents=[torch.zeros(1, 8, 2, 3)], device=torch.device("cpu"),
                                 reference_latents_method=method, hooks=hooks)
    assert ("ref_kv" in conds) == cached
    assert ("ref_latents" in conds) != cached
    assert conds["ref_latents_method"].cond == method
    if cached:
        assert conds["ref_kv"].cond.shape == (1, 2, 2, 6, 128)


@pytest.mark.parametrize("fused", [False, True])
@pytest.mark.parametrize("projection", ["q", "k", "v", "o", "ffn_up_gate", "ffn_down"])
def test_original_edit_adapter_bare_keys_use_standard_lora_loader(fused, projection):
    base = comfy.model_base.MOSSImage.__new__(comfy.model_base.MOSSImage)
    torch.nn.Module.__init__(base)
    base.diffusion_model = make_model(fused)
    base.model_config = comfy.supported_models.MOSSImage({"dim": 128, "ffn_dim": 256, "num_heads": 1, "num_layers": 2})
    name = "layers.0.proj." + projection
    mapping = comfy.lora.model_lora_keys_unet(base, {})
    target = mapping[name]
    if isinstance(target, tuple):
        key, (_, offset, length) = target
        weight = base.state_dict()[key][offset:offset + length]
    else:
        key = target
        weight = base.state_dict()[key]
    a, b = torch.randn(2, weight.shape[1]), torch.randn(weight.shape[0], 2)
    patches = comfy.lora.load_lora({name + ".lora_A": a, name + ".lora_B": b}, mapping)
    assert set(patches) == {target}
    actual = patches[target].calculate_weight(weight.clone(), key, strength=1.0, strength_model=1.0,
                                               offset=None, function=lambda value: value, intermediate_dtype=torch.float32)
    torch.testing.assert_close(actual, weight + b @ a)


@pytest.mark.parametrize("edit_format", list(EDIT_FORMATS))
def test_encoding_selects_the_trained_layout_and_vision_contract(edit_format):
    seen = {}

    def tokenize(prompt, **kwargs):
        seen.update(prompt=prompt, **kwargs)
        return prompt

    clip = SimpleNamespace(tokenize=tokenize, encode_from_tokens_scheduled=lambda tokens: [[torch.zeros(1, 2, 32), {}]])
    encoded_images = []

    def encode(image):
        encoded_images.append(image)
        return torch.zeros(1, 128, image.shape[1] // 16, image.shape[2] // 16)

    images = {"image_2": torch.ones(1, 32, 64, 3), "image_0": torch.zeros(1, 400, 800, 3), "image_1": None}
    conditioning, = TextEncodeMOSSImageEdit.execute(clip, "change the jacket", SimpleNamespace(encode=encode),
                                                  edit_format, images).result
    method, vision = EDIT_FORMATS[edit_format]
    assert conditioning[0][1]["reference_latents_method"] == method
    assert len(conditioning[0][1]["reference_latents"]) == 2
    assert len(encoded_images) == 2
    for actual, expected in zip(encoded_images, (images["image_0"], images["image_2"])):
        torch.testing.assert_close(actual, expected, atol=0, rtol=0)
    assert len(seen["images"]) == (2 if vision else 0)
    assert seen["prompt"].endswith("change the jacket")
    assert ("Picture 1:" in seen["prompt"]) == vision
    if not vision:
        assert seen["prompt"] == "change the jacket"
