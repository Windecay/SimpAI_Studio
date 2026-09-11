import logging
import math

import torch

import comfy.nested_tensor
import comfy.utils

from .SimpAIOptionalVideoPath import _file_hash, _load_video_frames, _resolve_video_path
from .SimpAIH3ContinuationOutput import _audio_waveform, _match_channels, _resample, _resize_images
from .VRGDG_MiniMaxH3AudioDrive import _fit_audio_latent


LOG = logging.getLogger(__name__)
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
MODEL_FPS = 24.0
AUDIO_CROSSFADE_SECONDS = 0.08


def transition_layout(first_count, second_count, duration, overlap):
    if min(first_count, second_count) < 1:
        raise ValueError("Both source videos must contain at least one frame.")
    if not math.isfinite(duration) or duration <= 0 or not math.isfinite(overlap) or overlap <= 0:
        raise ValueError("Transition duration and overlap must be positive.")
    gap = max(1, round(duration * MODEL_FPS))
    left = min(first_count, max(2, round(overlap * MODEL_FPS)))
    right = min(second_count, max(2, round(overlap * MODEL_FPS)))
    used = left + gap + right
    length = max(5, used)
    length += (5 - length % 17) % 17
    return {"left": left, "gap": gap, "right": right, "used": used, "length": length, "fps": MODEL_FPS}


def temporal_weights(layout):
    left, gap, right = (layout[key] for key in ("left", "gap", "right"))
    ramp_a = torch.linspace(0, 1, left)
    ramp_b = torch.linspace(1, 0, right) if right > 1 else torch.zeros(1)
    ramp_a = ramp_a.square() * (3 - 2 * ramp_a)
    ramp_b = ramp_b.square() * (3 - 2 * ramp_b)
    return torch.cat((ramp_a, torch.ones(gap), ramp_b))


def latent_weights(layout):
    weights = temporal_weights(layout)
    weights[layout["left"] + layout["gap"]:] = 0
    weights = torch.nn.functional.pad(weights, (0, layout["length"] - layout["used"]))
    result, offset, index = [], 0, 0
    while offset < layout["length"]:
        span = FRAME_PER_TOKEN[index % 5]
        end = offset + span
        # A token touching unknown frames must be fully regenerated.
        unknown = offset < layout["left"] + layout["gap"] and end > layout["left"]
        result.append(1.0 if unknown else float(weights[offset:end].mean()))
        offset, index = end, index + 1
    if offset != layout["length"]:
        raise ValueError("Transition length is incompatible with the H3 temporal grid.")
    return torch.tensor(result).reshape(1, 1, -1, 1, 1)


def _fit_second_canvas(images, width, height):
    source_h, source_w = images.shape[1:3]
    if (source_w, source_h) == (width, height):
        return images
    scale = min(width / source_w, height / source_h)
    resized = _resize_images(images, max(1, round(source_w * scale)), max(1, round(source_h * scale)))
    output = images.new_zeros((len(images), height, width, 3))
    y, x = (height - resized.shape[1]) // 2, (width - resized.shape[2]) // 2
    output[:, y:y + resized.shape[1], x:x + resized.shape[2]] = resized
    return output


def select_source_frames(images, source_fps):
    if not math.isfinite(source_fps) or source_fps <= 0:
        raise ValueError("Transition sources must have a valid frame rate.")
    if len(images) == 0:
        raise ValueError("Transition sources must contain frames.")
    if source_fps == MODEL_FPS:
        return images
    wanted = max(1, round(len(images) / source_fps * MODEL_FPS))
    # Keep the source frame displayed at each 24-FPS timestamp; never synthesize pixels.
    indices = [min(len(images) - 1, math.floor(i * source_fps / MODEL_FPS + 1e-9)) for i in range(wanted)]
    return images[indices]


def _generated_output_frames(data, images):
    if len(images) < data["used"]:
        raise ValueError("Generated transition has fewer model frames than requested.")
    return images[:data["used"]]


class SimpAIH3TransitionSource:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "video": ("STRING", {"default": ""}),
            "next_video": ("STRING", {"default": ""}),
            "duration": ("FLOAT", {"default": 5.0, "min": 0.1, "max": 30.0}),
            "overlap": ("FLOAT", {"default": 0.75, "min": 0.1, "max": 3.0}),
            "width": ("INT", {"default": 864, "min": 32, "max": 8192}),
            "height": ("INT", {"default": 480, "min": 32, "max": 8192}),
        }}

    RETURN_TYPES = ("H3_TRANSITION", "INT", "INT", "INT", "FLOAT")
    RETURN_NAMES = ("transition", "length", "width", "height", "fps")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/MiniMax H3"

    @classmethod
    def IS_CHANGED(cls, video, next_video, **kwargs):
        return (_file_hash(_resolve_video_path(video)), _file_hash(_resolve_video_path(next_video)), kwargs)

    def prepare(self, video, next_video, duration, overlap, width, height):
        if not video or not next_video:
            raise ValueError("Upload both the preceding video and the following video.")
        LOG.info("[H3 Transition] Decoding source clips for native 24-FPS generation and output.")
        first, _, first_audio, first_fps = _load_video_frames(video, return_fps=True, label="Preceding video")
        LOG.info("[H3 Transition] Decoding following video.")
        second, _, second_audio, second_fps = _load_video_frames(next_video, return_fps=True, label="Following video")
        if first is None or second is None:
            raise ValueError("Upload both the preceding video and the following video.")
        original_first_count, original_second_count = len(first), len(second)
        first = select_source_frames(first, first_fps)
        second = select_source_frames(second, second_fps)
        second = _fit_second_canvas(second, first.shape[2], first.shape[1])
        layout = transition_layout(len(first), len(second), float(duration), float(overlap))
        # The UI chooses sampling area; the first source always determines aspect and final dimensions.
        scale = math.sqrt(max(1024, width * height) / (first.shape[1] * first.shape[2]))
        sample_w = max(32, round(first.shape[2] * scale / 32) * 32)
        sample_h = max(32, round(first.shape[1] * scale / 32) * 32)
        layout.update(first=first, second=second, first_audio=first_audio, second_audio=second_audio,
                      width=sample_w, height=sample_h)
        LOG.info(
            "[H3 Transition] first=%s frames @ %.6f -> %s @ 24; second=%s @ %.6f -> %s @ 24; "
            "overlap=%s/%s gap=%s model_frames=%s; output=%sx%s @ 24 FPS sampling=%sx%s; no frame interpolation",
            original_first_count, first_fps, len(first), original_second_count, second_fps, len(second),
            layout["left"], layout["right"], layout["gap"], layout["length"],
            first.shape[2], first.shape[1], sample_w, sample_h,
        )
        return layout, layout["length"], sample_w, sample_h, MODEL_FPS


class SimpAIH3TransitionLatent:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "transition": ("H3_TRANSITION",), "latent": ("LATENT",), "vae": ("VAE",),
            "audio_vae": ("VAE",),
        }}

    RETURN_TYPES = ("LATENT", "IMAGE", "INT")
    RETURN_NAMES = ("latent", "following_start", "following_frame")
    FUNCTION = "prepare"
    CATEGORY = "SimpAI/MiniMax H3"

    def prepare(self, transition, latent, vae, audio_vae):
        data = transition
        left = _resize_images(data["first"][-data["left"]:], data["width"], data["height"])
        right = _resize_images(data["second"][:data["right"]], data["width"], data["height"])
        blank = left.new_full((data["gap"], data["height"], data["width"], 3), 0.5)
        padding = right[-1:].repeat(data["length"] - data["used"], 1, 1, 1)
        seed = torch.cat((left, blank, right, padding))
        LOG.info("[H3 Transition] Encoding %s context/middle frames for temporal repainting.", len(seed))
        encoded = vae.encode(seed)
        streams = list(latent["samples"].unbind())
        mask = latent_weights(data).to(encoded.device)
        if encoded.shape != streams[0].shape or encoded.shape[2] != mask.shape[2]:
            raise ValueError("H3 transition VAE shape does not match the requested AV latent.")
        audio_samples, audio_mask = transition_audio_latent(data, streams[1], audio_vae)
        output = dict(latent)
        output["samples"] = comfy.nested_tensor.NestedTensor((encoded, audio_samples))
        output["noise_mask"] = comfy.nested_tensor.NestedTensor((
            mask, audio_mask,
        ))
        return output, right[:1].clone(), data["left"] + data["gap"]


def _audio_window(decoded, rate, channels, start_seconds, count):
    wave, source_rate = decoded
    if wave is None or wave.shape[-1] == 0:
        return torch.zeros((1, channels, count))
    begin = round(start_seconds * source_rate)
    leading = min(count, max(0, round(-start_seconds * rate)))
    begin = max(0, begin)
    source_count = math.ceil((count - leading) * source_rate / rate)
    wave = wave[:1, :, begin:begin + source_count].detach().cpu().float()
    if wave.shape[-1] == 0:
        return torch.zeros((1, channels, count))
    wave = _match_channels(_resample(wave, source_rate, rate), channels)[..., :count - leading]
    wave = torch.nn.functional.pad(wave, (leading, 0))
    return torch.nn.functional.pad(wave, (0, max(0, count - wave.shape[-1])))


def transition_audio_context(data, rate):
    sources = [_audio_waveform(data.get(key), "Transition source")
               for key in ("first_audio", "second_audio")]
    if not any(wave is not None and wave.shape[-1] for wave, _ in sources):
        return None
    fps = data["fps"]
    left_seconds = data["left"] / fps
    left_end = round(left_seconds * rate)
    right_start = round((left_seconds + data["gap"] / fps) * rate)
    waveform = torch.zeros((1, 2, round(data["length"] / MODEL_FPS * rate)))
    right_end = min(waveform.shape[-1], round((left_seconds + data["gap"] / fps + data["right"] / fps) * rate))
    waveform[..., :left_end] = _audio_window(
        sources[0], rate, 2, len(data["first"]) / fps - left_seconds, left_end,
    )
    waveform[..., right_start:right_end] = _audio_window(
        sources[1], rate, 2, 0, right_end - right_start,
    )
    return {"waveform": waveform, "sample_rate": rate}


def transition_audio_latent(data, template, audio_vae):
    context = transition_audio_context(data, int(getattr(audio_vae, "audio_sample_rate", 32000)))
    if context is None:
        LOG.info("[H3 Transition] Neither source has audio; generating the transition sound without audio anchors.")
        return template, torch.ones_like(template)
    LOG.info("[H3 Transition] Encoding source tail/head audio as timed boundary conditions.")
    encoded = _fit_audio_latent(audio_vae.encode(context["waveform"].movedim(1, -1)), template)
    # Audio latents are 40 Hz on the shared 24-FPS generation/output timeline.
    token_start = torch.arange(template.shape[-1], device=template.device, dtype=torch.float64) / 40
    token_end = token_start + 1 / 40
    left_end = data["left"] / MODEL_FPS
    right_start = left_end + data["gap"] / data["fps"]
    right_end = right_start + data["right"] / MODEL_FPS
    known_left = token_end <= left_end + 1e-9
    known_right = ((token_start >= right_start - 1e-9) & (token_end <= right_end + 1e-9))
    # Every token intersecting the unknown middle or model padding is fully generated.
    mask = (~(known_left | known_right)).to(template.dtype).reshape(1, 1, 1, -1)
    return encoded, mask.expand_as(template).contiguous()


def _blend_audio_context(source, generated, begin, count, entering):
    if count < 2:
        return
    weight = torch.linspace(0, 1, count)
    weight = weight.square() * (3 - 2 * weight)
    if not entering:
        weight = 1 - weight
    destination = source[..., -count:] if entering else source[..., :count]
    destination.copy_(destination * (1 - weight) + generated[..., begin:begin + count] * weight)


def transition_audio(data, generated_audio, append_original):
    fps = data["fps"]
    parts = [data.get("first_audio"), generated_audio, data.get("second_audio")]
    decoded = [_audio_waveform(item, "Transition") for item in parts]
    present = [(wave, rate) for wave, rate in decoded if wave is not None and wave.shape[-1]]
    if not present:
        return None
    rate = next((decoded[i][1] for i in (0, 2, 1)
                 if decoded[i][0] is not None and decoded[i][0].shape[-1]), 0)
    channels = max(wave.shape[1] for wave, _ in present)
    generated = None
    if decoded[1][0] is not None and decoded[1][0].shape[-1]:
        generated = _audio_window(decoded[1], rate, channels, 0, round(data["length"] / MODEL_FPS * rate))
        decoded[1] = (generated, rate)
    first_count, second_count = len(data["first"]), len(data["second"])
    spans = [(0, first_count), (data["left"] / MODEL_FPS, data["gap"]), (0, second_count)]
    if not append_original:
        spans[0] = ((first_count - data["left"]) / fps, data["left"])
        spans[2] = (0, data["right"])
    output = []
    frame_cursor = 0
    for (wave, source_rate), (start, count) in zip(decoded, spans):
        wanted = round((frame_cursor + count) / fps * rate) - round(frame_cursor / fps * rate)
        frame_cursor += count
        output.append(_audio_window((wave, source_rate), rate, channels, start, wanted))
    if generated is not None:
        middle_start = round(data["left"] / MODEL_FPS * rate)
        middle_end = middle_start + output[1].shape[-1]
        # Blend matching timestamps within existing context; never overlap or shorten the timeline.
        fade_left = min(round(AUDIO_CROSSFADE_SECONDS * rate), middle_start, output[0].shape[-1])
        fade_right = min(round(AUDIO_CROSSFADE_SECONDS * rate), round(data["right"] / fps * rate),
                         output[2].shape[-1], generated.shape[-1] - middle_end)
        _blend_audio_context(output[0], generated, middle_start - fade_left, fade_left, True)
        _blend_audio_context(output[2], generated, middle_end, fade_right, False)
    return {"waveform": torch.cat(output, dim=-1), "sample_rate": rate}


class SimpAIH3TransitionOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "transition": ("H3_TRANSITION",), "images": ("IMAGE",),
            "append_original": ("BOOLEAN", {"default": True}),
        }, "optional": {"audio": ("AUDIO",)}}

    RETURN_TYPES = ("IMAGE", "AUDIO")
    FUNCTION = "compose"
    CATEGORY = "SimpAI/MiniMax H3"

    def compose(self, transition, images, append_original=True, audio=None):
        data = transition
        first, second = data["first"], data["second"]
        images = _generated_output_frames(data, images)
        images = _resize_images(images, first.shape[2], first.shape[1]).to(first)
        left, gap, right = data["left"], data["gap"], data["right"]
        weights = temporal_weights(data)[:data["used"]].to(images).reshape(-1, 1, 1, 1)
        start = first[-left:] * (1 - weights[:left]) + images[:left] * weights[:left]
        # The following context is preserved conditioning, not editable output.
        # Boundary-token decoding can discolor it even with a zero latent mask.
        end = second[:right]
        bridge = torch.cat((start, images[left:left + gap], end))
        result = torch.cat((first[:-left], bridge, second[right:])) if append_original else bridge
        return result, transition_audio(data, audio, append_original)


NODE_CLASS_MAPPINGS = {
    "SimpAIH3TransitionSource": SimpAIH3TransitionSource,
    "SimpAIH3TransitionLatent": SimpAIH3TransitionLatent,
    "SimpAIH3TransitionOutput": SimpAIH3TransitionOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3TransitionSource": "H3 Transition Sources",
    "SimpAIH3TransitionLatent": "H3 Temporal Transition Mask",
    "SimpAIH3TransitionOutput": "H3 Transition Output",
}
