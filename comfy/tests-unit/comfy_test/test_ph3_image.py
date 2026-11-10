import asyncio

import pytest
import torch
from torch import nn

from comfy.ldm.minimax.vae import (
    MiniMaxH3VideoVAE,
    IMAGE_ENCODE_SEED,
    PH3_IMAGE_FRAME_POSITION,
    PH3ImageDecoder,
    PH3ImageVAE,
    create_token_ids,
)
from comfy.text_encoders.minimax import MiniMaxH3Tokenizer, PH3ImageTokenizer, TextConnector
from comfy_extras.nodes_minimax_h3 import MiniMaxH3Extension, MiniMaxH3ImageConditioning, PH3ImageConditioning


class FakeClip:
    def tokenize(self, prompt, images, picture_label=None):
        self.prompt = prompt
        self.images = images
        self.picture_label = picture_label
        return "tokens"

    def encode_from_tokens_scheduled(self, tokens):
        assert tokens == "tokens"
        return [[torch.zeros(1, 1), {}]]


class FakeVAE:
    def __init__(self):
        self.images = []

    def encode(self, image):
        self.images.append(image)
        return torch.full((1, 24, 1, image.shape[1] // 16, image.shape[2] // 16), image[0, 0, 0, 0].item())


def test_ph3_node_is_registered():
    assert PH3ImageConditioning in asyncio.run(MiniMaxH3Extension().get_node_list())


def test_schema_accepts_additional_references():
    schema = PH3ImageConditioning.define_schema()
    images = next(item for item in schema.inputs if item.id == "images")
    assert images.template.names[:9] == [f"image_{i}" for i in range(1, 10)]
    assert "image_100" in images.template.names


def test_text_to_image_uses_requested_size_without_vae():
    clip = FakeClip()
    conditioning, latent = PH3ImageConditioning.execute(clip, "a garden", 96, 64).result

    assert clip.prompt == "a garden"
    assert clip.images == []
    assert "minimax_refs" not in conditioning[0][1]
    video, audio = latent["samples"].unbind()
    assert video.shape == (1, 24, 1, 4, 6)
    assert audio.shape == (1, 32, 2, 2)


def test_text_to_image_uses_default_size_when_not_specified():
    _, latent = PH3ImageConditioning.execute(FakeClip(), "a garden", 0, 0).result
    assert latent["samples"].unbind()[0].shape == (1, 24, 1, 182, 182)


def test_edit_orders_references_and_uses_main_image_size():
    clip = FakeClip()
    vae = FakeVAE()
    main = torch.full((1, 64, 96, 3), 0.25)
    reference = torch.full((1, 32, 64, 3), 0.75)

    conditioning, latent = PH3ImageConditioning.execute(
        clip, "change the hat", 0, 0, vae=vae,
        images={"image_2": reference, "image_1": main},
    ).result

    assert clip.prompt == "Edit <Picture 1>. change the hat"
    assert torch.equal(clip.images[0], main)
    assert torch.equal(clip.images[1], reference)
    assert [image[0, 0, 0, 0].item() for image in vae.images] == [0.25, 0.75]
    refs = conditioning[0][1]["minimax_refs"]
    assert [(ref["latent_h"], ref["latent_w"]) for ref in refs] == [(4, 6), (2, 4)]
    assert latent["samples"].unbind()[0].shape == (1, 24, 1, 4, 6)


def test_edit_keeps_batched_and_additional_reference_images():
    clip = FakeClip()
    vae = FakeVAE()
    batch = torch.stack([torch.full((32, 32, 3), 0.1), torch.full((32, 32, 3), 0.2)])
    inputs = {
        "image_10": torch.full((1, 32, 32, 3), 0.4),
        "image_2": torch.full((1, 32, 32, 3), 0.3),
        "image_1": batch,
    }

    conditioning, _ = PH3ImageConditioning.execute(clip, "edit", 0, 0, vae=vae, images=inputs).result

    assert [image[0, 0, 0, 0].item() for image in clip.images] == pytest.approx([0.1, 0.2, 0.3, 0.4])
    assert len(vae.images) == 4
    assert len(conditioning[0][1]["minimax_refs"]) == 4


@pytest.mark.parametrize("prompt", ["Edit <Picture 2>. use its colors", "subject_definitions: a person"])
def test_edit_keeps_preformatted_prompts(prompt):
    clip = FakeClip()
    PH3ImageConditioning.execute(
        clip, prompt, 64, 64, vae=FakeVAE(), images={"image_1": torch.ones(1, 64, 64, 3)},
    )
    assert clip.prompt == prompt


def test_reference_without_vae_still_conditions_the_text_encoder():
    clip = FakeClip()
    conditioning, _ = PH3ImageConditioning.execute(
        clip, "edit", 64, 64, images={"image_1": torch.ones(1, 64, 64, 3)},
    ).result
    assert len(clip.images) == 1
    assert "minimax_refs" not in conditioning[0][1]


def test_h3_image_conditioning_keeps_batched_references_and_image_latent(monkeypatch):
    monkeypatch.setattr("comfy_extras.nodes_minimax_h3._resize_to", lambda image, size: image)
    clip = FakeClip()
    vae = FakeVAE()
    batch = torch.stack([torch.full((32, 32, 3), 0.1), torch.full((32, 32, 3), 0.2)])
    conditioning, latent = MiniMaxH3ImageConditioning.execute(
        clip, "edit", 96, 64, vae=vae,
        images={"image_3": torch.full((1, 32, 32, 3), 0.4),
                "image_2": torch.full((1, 32, 32, 3), 0.3), "image_1": batch},
    ).result
    assert clip.picture_label == "Picture %d: "
    assert [image[0, 0, 0, 0].item() for image in clip.images] == pytest.approx([0.1, 0.2, 0.3, 0.4])
    assert len(conditioning[0][1]["minimax_refs"]) == 4
    assert latent["samples"].shape == (1, 24, 1, 4, 6)


def test_h3_image_without_references_or_vae():
    clip = FakeClip()
    conditioning, latent = MiniMaxH3ImageConditioning.execute(clip, "a garden", 64, 32).result
    assert clip.images == []
    assert "minimax_refs" not in conditioning[0][1]
    assert latent["samples"].shape == (1, 24, 1, 2, 4)


@pytest.mark.parametrize(
    "tokenizer_class,encoder",
    [(MiniMaxH3Tokenizer, "qwen3vl_32b"), (PH3ImageTokenizer, "qwen3vl_4b")],
)
def test_image_and_video_tokenizers_use_their_own_encoder(tokenizer_class, encoder):
    class FakeTokenizer:
        def tokenize_with_weights(self, text, **kwargs):
            return [[(len(text), 1.0)]]

    tokenizer = tokenizer_class.__new__(tokenizer_class)
    tokenizer.clip = encoder
    setattr(tokenizer, encoder, FakeTokenizer())
    image = torch.ones(1, 8, 8, 3)

    encoded = tokenizer.tokenize_with_weights("prompt", images=[image])
    tokens = encoded[encoder][0]

    assert list(encoded) == [encoder]
    assert sum(isinstance(token[0], dict) for token in tokens) == 1
    assert next(token[0]["data"] for token in tokens if isinstance(token[0], dict)) is image


def test_text_connector_projects_layers_and_replaces_first_token():
    connector = TextConnector(4, 2, operations=nn)
    connector.load_state_dict({
        "input_mean": torch.tensor([1.0, 2.0, 3.0, 4.0]),
        "input_std": torch.tensor([1.0, 2.0, 1.0, 2.0]),
        "proj.weight": torch.tensor([[1.0, 2.0, 0.0, 0.0], [0.0, 0.0, 3.0, 4.0]]),
        "output_mean": torch.tensor([0.5, -0.5]),
        "output_std": torch.tensor([2.0, 3.0]),
        "sink_embedding": torch.tensor([9.0, 10.0]),
    })
    hidden = torch.arange(12, dtype=torch.float32).reshape(1, 2, 3, 2)
    flattened = hidden.movedim(1, 2).flatten(2)
    normalized = (flattened - connector.input_mean) / connector.input_std
    projected = nn.functional.linear(normalized, connector.proj.weight)
    expected = projected * connector.output_std + connector.output_mean
    expected = torch.cat([connector.sink_embedding.reshape(1, 1, 2), expected[:, 1:]], dim=1)

    torch.testing.assert_close(connector(hidden), expected)


def test_single_frame_decoder_positions():
    actual = PH3ImageDecoder._token_ids(None, 1, 2, 3, torch.device("cpu"), torch.float32)
    spatial = create_token_ids((2, 3), torch.device("cpu"), torch.float32)
    assert actual.shape == (1, 6, 3)
    torch.testing.assert_close(actual[..., 0], torch.full((1, 6), PH3_IMAGE_FRAME_POSITION))
    torch.testing.assert_close(actual[..., 1:], spatial)


def test_image_vae_encodes_with_seeded_noise_on_input_device(monkeypatch):
    vae = PH3ImageVAE.__new__(PH3ImageVAE)
    nn.Module.__init__(vae)
    vae.latents_mean = torch.zeros(24)
    vae.latents_std = torch.ones(24)
    vae._normalize_pixels = lambda pixels: pixels
    vae._adaptive_encode = lambda pixels: torch.zeros(1, 48, 1, 2, 3, device=pixels.device)
    original_randn = torch.randn
    calls = []

    def track_randn(*args, **kwargs):
        calls.append(kwargs)
        return original_randn(*args, **kwargs)

    monkeypatch.setattr(torch, "randn", track_randn)
    image = torch.zeros(1, 3, 1, 32, 48)
    first = vae.encode(image)
    second = vae.encode(image)

    assert calls[0]["device"] == image.device
    assert calls[0]["dtype"] == torch.float32
    assert calls[0]["generator"].initial_seed() == IMAGE_ENCODE_SEED
    torch.testing.assert_close(first, second)
    expected = original_randn(first.shape, generator=torch.Generator().manual_seed(IMAGE_ENCODE_SEED))
    torch.testing.assert_close(first, expected)


def test_image_vae_rejects_video_latents_and_forwards_single_frame(monkeypatch):
    vae = PH3ImageVAE.__new__(PH3ImageVAE)
    nn.Module.__init__(vae)
    monkeypatch.setattr(MiniMaxH3VideoVAE, "decode", lambda self, z, output: (z, output))
    image_latent = torch.zeros(1, 24, 1, 2, 2)

    assert vae.decode(image_latent) == (image_latent, None)
    with pytest.raises(ValueError, match="single-frame"):
        vae.decode(torch.zeros(1, 24, 2, 2, 2))
