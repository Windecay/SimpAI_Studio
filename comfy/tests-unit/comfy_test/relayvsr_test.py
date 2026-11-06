from types import SimpleNamespace

import pytest
import torch

from comfy import latent_formats
from comfy.ldm.wan.model_vsr import RelayFlash, relay_keyframes, relay_latent_size
from comfy.model_detection import detect_unet_config
from comfy.model_management import HostWriter
from comfy_extras.nodes_wan import RelayVSRConditioning, VSRDecode


@pytest.mark.parametrize("frames,expected", [
    (1, [0]), (2, [0, 1]), (15, [0, 14]), (16, [0, 15]),
    (17, [0, 15, 16]), (30, [0, 15, 29]), (31, [0, 15, 30]),
])
def test_keyframes_include_last_frame_once(frames, expected):
    assert relay_keyframes(frames) == expected


@pytest.mark.parametrize("factor", [2, 4])
@pytest.mark.parametrize("frames", [1, 2, 15, 16, 17, 30, 31])
def test_flash_shape_keeps_all_frames_and_original_edges(factor, frames):
    decoder = RelayFlash.__new__(RelayFlash)
    torch.nn.Module.__init__(decoder)
    decoder.upscale_factor = factor
    decoder.latent_stride = 16 // factor
    images = torch.empty(frames, 73, 129, 3)
    spatial = relay_latent_size(73, 129, decoder.latent_stride)
    shape = (1, 48, len(relay_keyframes(frames)), *spatial)

    assert decoder.decode_output_shape(shape, lq_images=images) == (1, 3, frames, 73 * factor, 129 * factor)


def test_flash_rejects_mismatched_factor():
    decoder = RelayFlash.__new__(RelayFlash)
    torch.nn.Module.__init__(decoder)
    decoder.upscale_factor = 4
    decoder.latent_stride = 4
    images = torch.empty(17, 73, 129, 3)
    x2_shape = (1, 48, 3, *relay_latent_size(73, 129, 8))

    with pytest.raises(ValueError, match="same factor"):
        decoder.decode_output_shape(x2_shape, lq_images=images)


@pytest.mark.parametrize("factor", [2, 4])
def test_conditioning_selects_keyframes_and_embedded_text(factor):
    context = torch.arange(12, dtype=torch.float32).reshape(3, 4)
    diffusion = SimpleNamespace(positive_conditioning=context, latent_stride=16 // factor)
    model = SimpleNamespace(model=SimpleNamespace(
        diffusion_model=diffusion, latent_format=SimpleNamespace(latent_channels=48),
    ))
    images = torch.arange(17, dtype=torch.float32).reshape(17, 1, 1, 1).expand(17, 73, 129, 3)

    positive, latent = RelayVSRConditioning.execute(model, images).result

    torch.testing.assert_close(positive[0][0], context.unsqueeze(0))
    assert positive[0][0].data_ptr() != context.data_ptr()
    torch.testing.assert_close(positive[0][1]["lq_images"], images[[0, 15, 16]])
    assert latent["samples"].shape == (1, 48, 3, *relay_latent_size(73, 129, 16 // factor))


@pytest.mark.parametrize("factor", [2, 4])
def test_wan_detection_recognizes_relay_factor(factor):
    state = {
        "head.modulation": torch.empty(1, 2, 128, device="meta"),
        "head.head.weight": torch.empty(192, 128, device="meta"),
        "blocks.0.ffn.0.weight": torch.empty(256, 128, device="meta"),
        "patch_embedding.weight": torch.empty(128, 48, 1, 2, 2, device="meta"),
        "lq_proj_in.conv1.weight": torch.empty(768, 3 * (4 * factor) ** 2, 1, 1, device="meta"),
    }

    config = detect_unet_config(state, "")

    assert config["model_type"] == "relayvsr"
    assert config["upscale_factor"] == factor
    assert config["in_dim"] == 48


def test_decode_passes_source_frames_and_detail_to_vae():
    images = torch.zeros(17, 3, 4, 3)
    samples = torch.zeros(1, 48, 3, 2, 2)
    decoded = torch.arange(17 * 6 * 8 * 3, dtype=torch.float32).reshape(1, 17, 6, 8, 3)

    class Decoder:
        def decode(self, latent, vae_options):
            assert latent is samples
            assert vae_options["lq_images"] is images
            assert vae_options["detail"] == 0.6
            return decoded

    output, = VSRDecode.execute(Decoder(), {"samples": samples}, images, detail=0.6).result

    assert output.shape == (17, 6, 8, 3)
    torch.testing.assert_close(output, decoded[0])


def test_relay_latents_are_already_normalized():
    format = latent_formats.RelayVSR()
    latent = torch.randn(1, 48, 2, 4, 6)
    assert format.process_in(latent) is latent
    assert format.process_out(latent) is latent


def test_host_writer_cpu_copies_every_destination():
    target = torch.empty(3, 2, 4)
    with HostWriter(torch.device("cpu"), target, (2, 4)) as writer:
        for frame in range(3):
            writer.write(target[frame], torch.full((2, 4), float(frame)))
    torch.testing.assert_close(target, torch.arange(3, dtype=torch.float32).reshape(3, 1, 1).expand_as(target))
