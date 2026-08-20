import logging
import math

import torch

import comfy.model_management as model_management
import comfy.utils
import node_helpers
import nodes
from comfy_api.latest import io
from comfy_extras.nodes_minimax_h3 import (
    CANVAS_MULTIPLE,
    FPS,
    MiniMaxH3ReferenceToVideo,
    _empty_av_latent,
    adapt_canvas,
    align_frame_count,
    video_latent_t,
)


LOG = logging.getLogger(__name__)

DEFAULT_MAX_IMAGE_LONG_EDGE = 2048
MIN_IMAGE_LONG_EDGE = 512
MIN_VIDEO_LONG_EDGE = 384
VIDEO_RESIZE_CHUNK_FRAMES = 16


def _align_dimension(value):
    return max(
        CANVAS_MULTIPLE,
        int(round(float(value) / CANVAS_MULTIPLE)) * CANVAS_MULTIPLE,
    )


def _floor_dimension(value):
    return max(
        CANVAS_MULTIPLE,
        int(math.floor(float(value) / CANVAS_MULTIPLE)) * CANVAS_MULTIPLE,
    )


def _limit_long_edge(width, height, max_long_edge):
    width = int(width)
    height = int(height)
    max_long_edge = max(CANVAS_MULTIPLE, int(max_long_edge))
    scale = min(1.0, float(max_long_edge) / float(max(width, height)))
    return _align_dimension(width * scale), _align_dimension(height * scale)


def _reference_spatial_tokens(width, height):
    return max(1, int(width) // 32) * max(1, int(height) // 32)


def _valid_reference_video_frames(frame_count, available_frames):
    frames = min(int(frame_count), int(available_frames))
    if frames < 5:
        return frames
    while frames % 17 != 5:
        frames -= 1
    return frames


def _qwen_video_blocks(frame_count):
    if frame_count <= 0:
        return 0
    sampled_frames = int(math.ceil(float(frame_count) / float(FPS // 2)))
    return int(math.ceil(float(sampled_frames) / 2.0))


def _image_reference_tokens(width, height):
    spatial = _reference_spatial_tokens(width, height)
    # Qwen3-VL uses 16px patches with a 2x2 merger, matching the H3 32px
    # reference-latent patch grid. Both token sets enter the packed sequence.
    return spatial * 2


def _video_reference_tokens(width, height, frame_count):
    if frame_count < 5:
        return 0
    spatial = _reference_spatial_tokens(width, height)
    return spatial * (video_latent_t(frame_count) + _qwen_video_blocks(frame_count))


def _total_vram_gib():
    try:
        device = model_management.get_torch_device()
        if getattr(device, "type", None) in ("cpu", "mps"):
            return None
        return float(model_management.get_total_memory(device)) / 1024**3
    except Exception as err:
        LOG.debug("Unable to query total VRAM for H3 reference planning: %s", err)
        return None


def _memory_profile(total_vram_gib=None):
    total_vram_gib = _total_vram_gib() if total_vram_gib is None else total_vram_gib
    if total_vram_gib is not None and total_vram_gib <= 13.0:
        return {
            "name": "low",
            "video_ratio": 0.35,
            "still_budget": 6144,
            "video_floor": 4096,
            "video_ceiling": 32768,
            "total_vram_gib": total_vram_gib,
        }
    if total_vram_gib is not None and total_vram_gib <= 20.0:
        return {
            "name": "medium",
            "video_ratio": 0.50,
            "still_budget": 8192,
            "video_floor": 6144,
            "video_ceiling": 49152,
            "total_vram_gib": total_vram_gib,
        }
    if total_vram_gib is None or total_vram_gib <= 26.0:
        return {
            "name": "high",
            "video_ratio": 0.75,
            "still_budget": 12288,
            "video_floor": 8192,
            "video_ceiling": 65536,
            "total_vram_gib": total_vram_gib,
        }
    return {
        "name": "ultra",
        "video_ratio": 1.0,
        "still_budget": 16384,
        "video_floor": 12288,
        "video_ceiling": 98304,
        "total_vram_gib": total_vram_gib,
    }


def _automatic_reference_budget(width, height, length, override=0, total_vram_gib=None):
    target_width = _align_dimension(width)
    target_height = _align_dimension(height)
    frame_count = align_frame_count(max(5, int(length)))
    target_tokens = (
        video_latent_t(frame_count)
        * _reference_spatial_tokens(target_width, target_height)
    )
    profile = _memory_profile(total_vram_gib)
    if int(override or 0) > 0:
        budget = int(override)
    elif frame_count <= 5:
        budget = int(profile["still_budget"])
    else:
        budget = int(target_tokens * profile["video_ratio"])
        budget = max(int(profile["video_floor"]), budget)
        budget = min(int(profile["video_ceiling"]), budget)
    return budget, target_tokens, frame_count, profile


def _candidate_video_dimensions(width, height):
    canvas_width, canvas_height = adapt_canvas(int(width), int(height))
    if int(width) * int(height) < canvas_width * canvas_height:
        canvas_width = _align_dimension(width)
        canvas_height = _align_dimension(height)
    return canvas_width, canvas_height


def _item_cost(item, width=None, height=None):
    width = int(item["width"] if width is None else width)
    height = int(item["height"] if height is None else height)
    if item["kind"] == "image":
        return _image_reference_tokens(width, height)
    return _video_reference_tokens(width, height, int(item["frames"]))


def _allocate_item_budgets(items, total_budget):
    if not items:
        return []
    total_budget = max(1.0, float(total_budget))
    if sum(item["cost"] for item in items) <= total_budget:
        return [float(item["cost"]) for item in items]

    allocated = [0.0] * len(items)
    active = list(range(len(items)))
    remaining = total_budget
    while active:
        weight_sum = sum(float(items[index]["weight"]) for index in active)
        limited = []
        for index in active:
            share = remaining * float(items[index]["weight"]) / weight_sum
            if float(items[index]["cost"]) <= share:
                allocated[index] = float(items[index]["cost"])
                remaining -= allocated[index]
                limited.append(index)
        if limited:
            active = [index for index in active if index not in limited]
            continue
        for index in active:
            allocated[index] = (
                remaining * float(items[index]["weight"]) / weight_sum
            )
        break
    return allocated


def _fit_item_to_budget(item, budget):
    width = int(item["width"])
    height = int(item["height"])
    budget = max(1.0, float(budget))
    min_long_edge = min(int(item["min_long_edge"]), max(width, height))

    for _ in range(24):
        cost = _item_cost(item, width, height)
        current_long_edge = max(width, height)
        if cost <= budget or current_long_edge <= min_long_edge:
            break
        ratio = math.sqrt(budget / float(cost))
        next_long_edge = _floor_dimension(current_long_edge * ratio)
        next_long_edge = max(min_long_edge, next_long_edge)
        if next_long_edge >= current_long_edge:
            next_long_edge = max(min_long_edge, current_long_edge - CANVAS_MULTIPLE)
        scale = float(next_long_edge) / float(current_long_edge)
        next_width = _floor_dimension(width * scale)
        next_height = _floor_dimension(height * scale)
        if next_width == width and next_height == height:
            break
        width, height = next_width, next_height

    fitted = dict(item)
    fitted["width"] = width
    fitted["height"] = height
    fitted["cost"] = _item_cost(fitted)
    fitted["budget"] = int(budget)
    return fitted


def _plan_references(
    width,
    height,
    length,
    ref_images,
    ref_videos,
    max_image_long_edge,
    reference_token_budget,
    total_vram_gib=None,
):
    budget, target_tokens, frame_count, profile = _automatic_reference_budget(
        width,
        height,
        length,
        override=reference_token_budget,
        total_vram_gib=total_vram_gib,
    )
    items = []
    image_values = [
        (name, image)
        for name, image in (ref_images or {}).items()
        if image is not None
    ]
    for name, image in image_values:
        source_height, source_width = map(int, image.shape[1:3])
        item_width, item_height = _limit_long_edge(
            source_width,
            source_height,
            max_image_long_edge,
        )
        item = {
            "kind": "image",
            "name": name,
            "source_width": source_width,
            "source_height": source_height,
            "width": item_width,
            "height": item_height,
            "frames": 1,
            "weight": 1.0,
            "min_long_edge": MIN_IMAGE_LONG_EDGE,
        }
        item["cost"] = _item_cost(item)
        items.append(item)

    for name, video in (ref_videos or {}).items():
        if video is None:
            continue
        source_height, source_width = map(int, video.shape[1:3])
        item_width, item_height = _candidate_video_dimensions(
            source_width,
            source_height,
        )
        item = {
            "kind": "video",
            "name": name,
            "source_width": source_width,
            "source_height": source_height,
            "width": item_width,
            "height": item_height,
            "frames": _valid_reference_video_frames(frame_count, video.shape[0]),
            "weight": 2.0,
            "min_long_edge": MIN_VIDEO_LONG_EDGE,
        }
        item["cost"] = _item_cost(item)
        items.append(item)

    item_budgets = _allocate_item_budgets(items, budget)
    fitted_items = [
        _fit_item_to_budget(item, item_budget)
        for item, item_budget in zip(items, item_budgets)
    ]
    return {
        "budget": int(budget),
        "target_tokens": int(target_tokens),
        "frame_count": int(frame_count),
        "profile": profile,
        "items": fitted_items,
        "estimated_reference_tokens": sum(item["cost"] for item in fitted_items),
    }


def _resize_reference_images(images, width, height):
    width = int(width)
    height = int(height)
    images = images[..., :3]
    if tuple(images.shape[1:3]) == (height, width):
        return images.contiguous()

    source = images.movedim(-1, 1)
    resized = comfy.utils.common_upscale(
        source,
        width,
        height,
        "lanczos",
        "disabled",
    )
    return resized.movedim(1, -1).contiguous()


def _resize_reference_video(video, width, height):
    width = int(width)
    height = int(height)
    video = video[..., :3]
    if tuple(video.shape[1:3]) == (height, width):
        return video.contiguous()

    output = torch.empty(
        (video.shape[0], height, width, 3),
        dtype=video.dtype,
        device=video.device,
    )
    for start in range(0, video.shape[0], VIDEO_RESIZE_CHUNK_FRAMES):
        end = min(start + VIDEO_RESIZE_CHUNK_FRAMES, video.shape[0])
        output[start:end].copy_(
            _resize_reference_images(video[start:end], width, height)
        )
    return output


class SimpAIMiniMaxH3AdaptiveReference(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIMiniMaxH3AdaptiveReference",
            description="MiniMax H3 reference conditioning with automatic image/video token budgeting.",
            display_name="SimpAI MiniMax H3 Adaptive Reference",
            category="SimpAI/conditioning/minimax",
            inputs=[
                io.Clip.Input("clip"),
                io.Vae.Input("vae"),
                io.Vae.Input("audio_vae", optional=True, advanced=True),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True),
                io.Int.Input("width", default=1344, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("height", default=768, min=32, max=nodes.MAX_RESOLUTION, step=32),
                io.Int.Input("length", default=124, min=5, max=3600, step=17),
                io.Combo.Input(
                    "ref_image_size",
                    options=["auto", "match", "max"],
                    default="auto",
                    tooltip="Auto limits reference tokens before VAE/Qwen encoding. Match and max preserve the core H3 behavior.",
                ),
                io.Int.Input(
                    "reference_token_budget",
                    default=0,
                    min=0,
                    max=1048576,
                    step=256,
                    advanced=True,
                    tooltip="Total image/video reference token budget. Zero selects a VRAM-aware automatic value.",
                ),
                io.Int.Input(
                    "max_image_long_edge",
                    default=DEFAULT_MAX_IMAGE_LONG_EDGE,
                    min=512,
                    max=4096,
                    step=32,
                    advanced=True,
                    tooltip="Maximum image-reference long edge used by auto mode.",
                ),
                io.Autogrow.Input(
                    "ref_images",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Image.Input("ref_image"),
                        prefix="ref_image_",
                        min=0,
                        max=9,
                    ),
                ),
                io.Autogrow.Input(
                    "ref_videos",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Image.Input("ref_video"),
                        prefix="ref_video_",
                        min=0,
                        max=3,
                    ),
                ),
                io.Autogrow.Input(
                    "ref_video_audios",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Audio.Input("ref_video_audio"),
                        prefix="ref_video_audio_",
                        min=0,
                        max=3,
                    ),
                ),
                io.Autogrow.Input(
                    "ref_audios",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Audio.Input("ref_audio"),
                        prefix="ref_audio_",
                        min=0,
                        max=3,
                    ),
                ),
            ],
            outputs=[io.Conditioning.Output(display_name="positive"), io.Latent.Output()],
        )

    @classmethod
    def execute(
        cls,
        clip,
        vae,
        prompt,
        width,
        height,
        length,
        ref_image_size="auto",
        reference_token_budget=0,
        max_image_long_edge=DEFAULT_MAX_IMAGE_LONG_EDGE,
        audio_vae=None,
        ref_images=None,
        ref_videos=None,
        ref_video_audios=None,
        ref_audios=None,
    ):
        if ref_image_size != "auto":
            return MiniMaxH3ReferenceToVideo.execute(
                clip,
                vae,
                audio_vae,
                prompt,
                width,
                height,
                length,
                ref_image_size=ref_image_size,
                ref_images=ref_images,
                ref_videos=ref_videos,
                ref_video_audios=ref_video_audios,
                ref_audios=ref_audios,
            )

        plan = _plan_references(
            width,
            height,
            length,
            ref_images,
            ref_videos,
            max_image_long_edge,
            reference_token_budget,
        )
        profile = plan["profile"]
        LOG.info(
            "SimpAI H3 adaptive reference: profile=%s total_vram=%.2f GiB budget=%d target_tokens=%d reference_tokens=%d refs=%d",
            profile["name"],
            profile["total_vram_gib"] if profile["total_vram_gib"] is not None else -1.0,
            plan["budget"],
            plan["target_tokens"],
            plan["estimated_reference_tokens"],
            len(plan["items"]),
        )
        item_map = {(item["kind"], item["name"]): item for item in plan["items"]}
        for item in plan["items"]:
            LOG.info(
                "SimpAI H3 reference %s %s: source=%dx%d processed=%dx%d frames=%d estimated_tokens=%d item_budget=%d",
                item["kind"],
                item["name"],
                item["source_width"],
                item["source_height"],
                item["width"],
                item["height"],
                item["frames"],
                item["cost"],
                item["budget"],
            )

        latent, frame_count = _empty_av_latent(width, height, length)
        ref_items = []
        ref_blocks = []

        for name, image in (ref_images or {}).items():
            if image is None:
                continue
            item = item_map[("image", name)]
            resized = _resize_reference_images(
                image[:1],
                item["width"],
                item["height"],
            )
            encoded = vae.encode(resized)
            ref_items.append({"type": "image", "data": resized})
            ref_blocks.append(
                {
                    "kind": "image",
                    "latent_h": item["height"] // 16,
                    "latent_w": item["width"] // 16,
                    "latent": encoded,
                }
            )

        ref_video_audios = ref_video_audios or {}
        for name, video_frames in (ref_videos or {}).items():
            if video_frames is None:
                continue
            item = item_map[("video", name)]
            frame_total = int(item["frames"])
            if frame_total < 5:
                raise ValueError(
                    "MiniMax H3 reference videos need at least 5 frames (~0.2s at 24 fps)"
                )
            frames = _resize_reference_video(
                video_frames[:frame_total],
                item["width"],
                item["height"],
            )
            encoded = vae.encode(frames)
            soundtrack = ref_video_audios.get(
                "ref_video_audio_" + name.rsplit("_", 1)[-1]
            )
            audio_latent, ref_audio_t = None, 0
            if soundtrack is not None:
                if audio_vae is None:
                    raise ValueError("audio_vae is required when a reference video has audio")
                audio_latent, ref_audio_t = MiniMaxH3ReferenceToVideo._encode_ref_audio(
                    audio_vae,
                    soundtrack,
                )
                ref_items.append({"type": "audio"})

            sample_idx = list(range(0, frames.shape[0], FPS // 2))
            qwen_frames = frames[sample_idx]
            ref_items.append(
                {
                    "type": "video",
                    "data": qwen_frames,
                    "timestamps": [index / 2.0 for index in range(len(sample_idx))],
                }
            )
            ref_blocks.append(
                {
                    "kind": "video_audio" if ref_audio_t else "video",
                    "latent_t": encoded.shape[2],
                    "latent_h": item["height"] // 16,
                    "latent_w": item["width"] // 16,
                    "ref_audio_t": ref_audio_t,
                    "latent": encoded,
                    "audio_latent": audio_latent,
                }
            )

        for audio in (ref_audios or {}).values():
            if audio is None:
                continue
            if audio_vae is None:
                raise ValueError("audio_vae is required when an audio reference is provided")
            audio_latent, ref_audio_t = MiniMaxH3ReferenceToVideo._encode_ref_audio(
                audio_vae,
                audio,
            )
            ref_items.append({"type": "audio"})
            ref_blocks.append(
                {
                    "kind": "audio",
                    "ref_audio_t": ref_audio_t,
                    "audio_latent": audio_latent,
                }
            )

        tokens = clip.tokenize(prompt, minimax_ref_items=ref_items)
        conditioning = clip.encode_from_tokens_scheduled(tokens)
        if ref_blocks:
            conditioning = node_helpers.conditioning_set_values(
                conditioning,
                {"minimax_refs": ref_blocks},
            )
        return io.NodeOutput(conditioning, latent)


NODE_CLASS_MAPPINGS = {
    "SimpAIMiniMaxH3AdaptiveReference": SimpAIMiniMaxH3AdaptiveReference,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIMiniMaxH3AdaptiveReference": "SimpAI MiniMax H3 Adaptive Reference",
}
