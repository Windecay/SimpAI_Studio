import logging
import math

import torch


LOGGER = logging.getLogger(__name__)


def _read_audio(audio, label):
    if audio is None:
        raise ValueError(f"{label} audio is unavailable.")

    waveform = audio["waveform"]
    sample_rate = int(audio["sample_rate"])
    if not isinstance(waveform, torch.Tensor) or waveform.ndim != 3:
        raise ValueError(f"{label} audio waveform must have shape [batch, channels, samples].")
    if sample_rate <= 0:
        raise ValueError(f"{label} audio sample rate must be positive.")
    return waveform, sample_rate


def _ensure_stereo(waveform, label):
    channels = int(waveform.shape[1])
    if channels == 1:
        return waveform.repeat(1, 2, 1)
    if channels != 2:
        raise ValueError(f"{label} audio must be mono or stereo.")
    return waveform


def _resample(waveform, source_rate, target_rate):
    if source_rate == target_rate:
        return waveform
    from torchaudio.functional import resample

    return resample(waveform, source_rate, target_rate)


def concat_ltx_extent_audio(source_audio, generated_audio, source_frame_count, frame_rate):
    try:
        generated_waveform, generated_rate = _read_audio(generated_audio, "Generated")
    except Exception as err:
        raise ValueError("Generated continuation audio is unavailable.") from err

    generated_waveform = _ensure_stereo(generated_waveform, "Generated")
    try:
        source_waveform, source_rate = _read_audio(source_audio, "Source")
        source_waveform = _ensure_stereo(source_waveform, "Source")
    except Exception as err:
        LOGGER.warning(
            "LTX extent source audio is unavailable; inserting aligned silence. %s: %s",
            type(err).__name__,
            str(err).splitlines()[0] if str(err) else "unknown error",
        )
        source_waveform = None
        source_rate = generated_rate

    frame_rate = float(frame_rate)
    if not math.isfinite(frame_rate) or frame_rate <= 0:
        raise ValueError("Frame rate must be positive.")
    source_frame_count = max(0, int(source_frame_count))

    output_rate = max(source_rate, generated_rate)
    generated_waveform = _resample(generated_waveform, generated_rate, output_rate)
    if source_waveform is not None:
        source_waveform = _resample(source_waveform, source_rate, output_rate)
        source_waveform = source_waveform.to(
            device=generated_waveform.device,
            dtype=generated_waveform.dtype,
        )
        if source_waveform.shape[0] != generated_waveform.shape[0]:
            raise ValueError("Source and generated audio batch sizes must match.")

    source_samples = int(round(source_frame_count * output_rate / frame_rate))
    if source_waveform is None:
        source_shape = list(generated_waveform.shape)
        source_shape[-1] = source_samples
        source_waveform = torch.zeros(
            source_shape,
            device=generated_waveform.device,
            dtype=generated_waveform.dtype,
        )
    elif source_waveform.shape[-1] < source_samples:
        silence_shape = list(source_waveform.shape)
        silence_shape[-1] = source_samples - source_waveform.shape[-1]
        source_waveform = torch.cat(
            [
                source_waveform,
                torch.zeros(
                    silence_shape,
                    device=source_waveform.device,
                    dtype=source_waveform.dtype,
                ),
            ],
            dim=-1,
        )
    else:
        source_waveform = source_waveform[..., :source_samples]

    return {
        "waveform": torch.cat([source_waveform, generated_waveform], dim=-1),
        "sample_rate": output_rate,
    }
