# Adapted from comfyui-vrgamedevgirl/VRGDG_MiniMaxH3AudioDrive.py.
# Copyright (c) 2026 Jean Thompson. SPDX-License-Identifier: AGPL-3.0-only
import torch
import torchaudio

import comfy.nested_tensor


def _nested_av_parts(av_latent):
    if not isinstance(av_latent, dict) or "samples" not in av_latent:
        raise ValueError("MiniMax H3 Audio Drive requires an AV LATENT input.")
    samples = av_latent["samples"]
    if not getattr(samples, "is_nested", False):
        raise ValueError("MiniMax H3 Audio Drive requires a joint video+audio latent.")
    parts = list(samples.unbind())
    if len(parts) != 2:
        raise ValueError("MiniMax H3 Audio Drive requires one video and one audio latent.")
    return parts[0], parts[1]


def _fit_audio_latent(encoded_audio, template_audio):
    if encoded_audio.ndim != 4 or template_audio.ndim != 4:
        raise ValueError("MiniMax H3 audio latents must use [batch, channels, stereo, time] layout.")
    if encoded_audio.shape[1:-1] != template_audio.shape[1:-1]:
        raise ValueError("The source audio VAE does not match the MiniMax H3 audio latent layout.")
    target_batch = template_audio.shape[0]
    if encoded_audio.shape[0] == 1 and target_batch > 1:
        encoded_audio = encoded_audio.repeat(target_batch, 1, 1, 1)
    elif encoded_audio.shape[0] != target_batch:
        encoded_audio = encoded_audio[:target_batch]
        if encoded_audio.shape[0] != target_batch:
            raise ValueError("Source audio batch cannot match the MiniMax H3 latent batch.")
    target_t = template_audio.shape[-1]
    current_t = encoded_audio.shape[-1]
    if current_t > target_t:
        encoded_audio = encoded_audio[..., :target_t]
    elif current_t < target_t:
        padding = encoded_audio.new_zeros((*encoded_audio.shape[:-1], target_t - current_t))
        encoded_audio = torch.cat((encoded_audio, padding), dim=-1)
    return encoded_audio.to(device=template_audio.device, dtype=template_audio.dtype)


class VRGDG_MiniMaxH3AudioDrive:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "av_latent": ("LATENT",),
            "source_audio": ("AUDIO",),
            "audio_vae": ("VAE",),
        }}

    RETURN_TYPES = ("LATENT", "AUDIO")
    RETURN_NAMES = ("audio_driven_av_latent", "original_audio")
    FUNCTION = "apply_audio_drive"
    CATEGORY = "SimpAI/MiniMax H3"

    def apply_audio_drive(self, av_latent, source_audio, audio_vae):
        if not isinstance(source_audio, dict):
            raise ValueError("MiniMax H3 Audio Drive requires a connected AUDIO input.")
        waveform = source_audio.get("waveform")
        sample_rate = source_audio.get("sample_rate")
        if waveform is None or sample_rate is None:
            raise ValueError("The connected AUDIO is missing waveform or sample_rate data.")
        if waveform.ndim != 3 or waveform.shape[-1] == 0 or int(sample_rate) <= 0:
            raise ValueError("Source audio must contain a nonempty [batch, channels, samples] waveform.")
        video_latent, template_audio = _nested_av_parts(av_latent)
        vae_sample_rate = int(getattr(audio_vae, "audio_sample_rate", 32000))
        waveform_for_vae = waveform
        if int(sample_rate) != vae_sample_rate:
            waveform_for_vae = torchaudio.functional.resample(waveform, int(sample_rate), vae_sample_rate)
        encoded_audio = audio_vae.encode(waveform_for_vae[:1].movedim(1, -1))
        encoded_audio = _fit_audio_latent(encoded_audio, template_audio)
        output = av_latent.copy()
        output["samples"] = comfy.nested_tensor.NestedTensor((video_latent, encoded_audio))
        video_mask = torch.ones_like(video_latent)
        if "noise_mask" in av_latent:
            mask = av_latent["noise_mask"]
            video_mask = mask.unbind()[0] if getattr(mask, "is_nested", False) else mask
        output["noise_mask"] = comfy.nested_tensor.NestedTensor((
            video_mask, torch.zeros_like(encoded_audio),
        ))
        # The VAE encoding conditions generation; the final mux keeps the source waveform.
        return output, source_audio


NODE_CLASS_MAPPINGS = {"VRGDG_MiniMaxH3AudioDrive": VRGDG_MiniMaxH3AudioDrive}
NODE_DISPLAY_NAME_MAPPINGS = {"VRGDG_MiniMaxH3AudioDrive": "MiniMax H3 Audio Drive"}
