import gc
import logging
import os
import time
from pathlib import Path

import torch
from comfy_api.latest import io

from .SimpAIOptionalVideoPath import _load_video_frames, _resolve_video_path


LOG = logging.getLogger("simpai_h3_upscale")
H3_FPS = 24
H3_CONTEXT_FRAMES = 5
H3_CONTEXT_FRAME_OPTIONS = (5, 22)
H3_MIN_GENERATION_FRAMES = 39
H3_FORWARD_TAKEOVER_FRAMES = 4


def _node_result(value):
    if hasattr(value, "result"):
        return tuple(value.result or ())
    if isinstance(value, tuple):
        return value
    return (value,)


def _align_h3_frames(value):
    value = max(5, int(value))
    return value + ((5 - value) % 17)


def _segment_plan(total_frames, segment_duration, fps=H3_FPS, context_frames=H3_CONTEXT_FRAMES):
    total_frames = max(1, int(total_frames))
    segment_frames = max(1, int(round(float(segment_duration) * float(fps))))
    windows = []
    output_start = 0
    # Reserve four frames at the end of each non-final window for the next
    # segment's boundary. This keeps the first 3-second H3 sample at 73
    # frames after alignment instead of expanding it to 90 frames.
    first_output_frames = max(1, segment_frames - H3_FORWARD_TAKEOVER_FRAMES)
    while output_start < total_frames:
        remaining = total_frames - output_start
        tail_overlap = min(context_frames, output_start) if output_start > 0 else 0
        if windows and remaining + tail_overlap < H3_MIN_GENERATION_FRAMES:
            # Do not launch a padded H3 sample for a tiny tail. Extend the
            # previous output window and keep the same source context.
            windows[-1]["output_frames"] += remaining
            break
        window_target = first_output_frames if not windows else segment_frames
        output_frames = min(window_target, total_frames - output_start)
        windows.append(
            {
                "output_start": output_start,
                "output_frames": output_frames,
            }
        )
        output_start += output_frames

    rows = []
    for index, window in enumerate(windows):
        output_start = int(window["output_start"])
        output_frames = int(window["output_frames"])
        overlap = min(context_frames, output_start) if output_start > 0 else 0
        source_start = output_start - overlap
        remaining_after = total_frames - (output_start + output_frames)
        takeover_out = min(H3_FORWARD_TAKEOVER_FRAMES, max(0, remaining_after))
        takeover_in = int(rows[-1]["takeover_out"]) if rows else 0
        required_source_frames = output_frames + overlap + takeover_out
        generation_frames = _align_h3_frames(
            max(required_source_frames, H3_MIN_GENERATION_FRAMES)
        )
        source_frames = min(generation_frames, total_frames - source_start)
        write_start = output_start + takeover_in
        write_frames = output_frames + takeover_out - takeover_in
        rows.append(
            {
                "index": index,
                "output_start": output_start,
                "output_frames": output_frames,
                "write_start": write_start,
                "write_frames": write_frames,
                "source_start": source_start,
                "source_frames": source_frames,
                "generation_frames": generation_frames,
                "overlap": overlap,
                "takeover_in": takeover_in,
                "takeover_out": takeover_out,
            }
        )
    return rows


def _fit_frames(frames, frame_count):
    if not isinstance(frames, torch.Tensor) or frames.ndim != 4 or int(frames.shape[0]) <= 0:
        raise ValueError("H3 upscale needs a non-empty source video segment")
    frames = frames[..., :3]
    if int(frames.shape[0]) >= int(frame_count):
        return frames[:frame_count].contiguous()
    return torch.cat(
        [frames, frames[-1:].repeat(int(frame_count) - int(frames.shape[0]), 1, 1, 1)],
        dim=0,
    ).contiguous()


def _trim_audio_to_frames(audio, frame_count, fps):
    if not isinstance(audio, dict):
        return audio
    waveform = audio.get("waveform")
    sample_rate = int(audio.get("sample_rate") or 0)
    if not isinstance(waveform, torch.Tensor) or sample_rate <= 0 or float(fps) <= 0:
        return audio
    sample_count = max(0, int(round(int(frame_count) / float(fps) * sample_rate)))
    if int(waveform.shape[-1]) <= sample_count:
        return audio
    trimmed = dict(audio)
    trimmed["waveform"] = waveform[..., :sample_count].contiguous()
    return trimmed


def _rtx_vsr_frames(frames, width, height):
    try:
        import nodes

        node_class = nodes.NODE_CLASS_MAPPINGS.get("ImageResizeKJv2")
    except Exception:
        node_class = None
    if node_class is None:
        raise RuntimeError("ImageResizeKJv2 is required for H3 upscale")

    result = node_class().resize(
        frames,
        int(width),
        int(height),
        "stretch",
        "nvidia_rtx_vsr",
        32,
        "0, 0, 0",
        "center",
        None,
        device="cpu",
    )
    return result[0].cpu().contiguous().clamp(0, 1)


def _sample_advanced(model, conditioning, sampler, sigmas, latent, seed):
    from comfy_extras.nodes_custom_sampler import BasicGuider, RandomNoise, SamplerCustomAdvanced

    guider = _node_result(BasicGuider.execute(model, conditioning))[0]
    noise = _node_result(RandomNoise.execute(int(seed) & 0xFFFFFFFFFFFFFFFF))[0]
    sampled = _node_result(SamplerCustomAdvanced.execute(noise, guider, sampler, sigmas, latent))
    if len(sampled) != 2:
        raise RuntimeError("SamplerCustomAdvanced returned an unexpected H3 result")
    return sampled[0], sampled[1]


def _scheduler(model, scheduler_name, steps, denoise):
    from comfy_extras.nodes_custom_sampler import BasicScheduler

    return _node_result(BasicScheduler.execute(model, scheduler_name, int(steps), float(denoise)))[0]


def _sampler(sampler_name):
    from comfy_extras.nodes_custom_sampler import KSamplerSelect

    return _node_result(KSamplerSelect.execute(sampler_name))[0]


def _conditioning(clip, vae, prompt, width, height, length, frames):
    from comfy_extras.nodes_minimax_h3 import MiniMaxH3ReferenceToVideo

    return _node_result(
        MiniMaxH3ReferenceToVideo.execute(
            clip,
            vae,
            None,
            prompt,
            int(width),
            int(height),
            int(length),
            "match",
            ref_videos={"ref_video_0": frames},
        )
    )


def _initial_latent(vae, width, height, length, frames):
    from .SimpAIMiniMaxH3VideoUpscaleLatent import SimpAIMiniMaxH3VideoUpscaleLatent

    return _node_result(
        SimpAIMiniMaxH3VideoUpscaleLatent.execute(
            vae,
            int(width),
            int(height),
            int(length),
            frames,
        )
    )[0]


def _motion_context(conditioning, latent, vae, context_frames, context_length):
    if context_frames is None:
        return conditioning, 0
    from .SimpAIMiniMaxH3MotionContext import SimpAIMiniMaxH3MotionContext

    return _node_result(
        SimpAIMiniMaxH3MotionContext.execute(
            conditioning,
            latent,
            str(int(context_length)),
            vae=vae,
            audio_context_length=0,
            context_frames=context_frames,
            prefer_video=True,
        )
    )


def _decode_video(vae, latent):
    import nodes

    images = nodes.VAEDecode().decode(vae, latent)[0]
    return images.detach().cpu().contiguous().clamp(0, 1)


def _empty_cache(force=False):
    try:
        import comfy.model_management

        comfy.model_management.cleanup_models_gc()
        try:
            comfy.model_management.soft_empty_cache(force=force)
        except TypeError:
            comfy.model_management.soft_empty_cache()
    except Exception:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    if force:
        gc.collect()


def _throw_if_interrupted():
    import comfy.model_management

    comfy.model_management.throw_exception_if_processing_interrupted()


def _calibrate_h3_overlap(frames, previous_overlap, overlap_frames, takeover_frames=0):
    """Reuse the SimpAINodes YCbCr overlap calibration used by Wan Animate."""
    try:
        from .SimpAIWanAnimateLoop import _calibrate_to_previous_overlap
    except ImportError:
        from SimpAIWanAnimateLoop import _calibrate_to_previous_overlap

    previous_frames = (
        int(previous_overlap.shape[0])
        if isinstance(previous_overlap, torch.Tensor) and previous_overlap.ndim == 4
        else 0
    )
    overlap_frames = min(
        max(0, int(overlap_frames)),
        int(frames.shape[0]),
        previous_frames,
    )
    takeover_frames = min(
        max(0, int(takeover_frames)),
        overlap_frames,
        max(0, int(frames.shape[0]) - overlap_frames),
    )
    correction_overlap_frames = overlap_frames + takeover_frames
    calibration_frames = frames
    calibration_previous = previous_overlap
    if takeover_frames > 0:
        stable_start = overlap_frames - takeover_frames
        calibration_frames = frames.clone()
        calibration_frames[overlap_frames:correction_overlap_frames].copy_(
            frames[stable_start:overlap_frames]
        )
        calibration_previous = torch.cat(
            (
                previous_overlap,
                previous_overlap[stable_start:overlap_frames],
            ),
            dim=0,
        ).contiguous()
    corrected, summary = _calibrate_to_previous_overlap(
        calibration_frames,
        calibration_previous,
        None,
        correction_overlap_frames,
    )
    summary["source"] = "SimpAIWanAnimateLoop"
    summary["reference_overlap_frames"] = overlap_frames
    summary["overlap_frames"] = overlap_frames
    summary["correction_overlap_frames"] = correction_overlap_frames
    summary["takeover_frames"] = takeover_frames
    return corrected, summary


def _blend_h3_overlap(output_frames, output_start, current_overlap):
    """Reuse the SimpAINodes smoothstep overlap blend for a tensor output buffer."""
    try:
        from .SimpAIWanAnimateLoop import _blend_output_overlap
    except ImportError:
        from SimpAIWanAnimateLoop import _blend_output_overlap

    produced = output_frames[: int(output_start)]
    return _blend_output_overlap([produced], current_overlap)


class SimpAIH3UpscaleLoop(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        import comfy.samplers

        return io.Schema(
            node_id="SimpAIH3UpscaleLoop",
            display_name="SimpAI H3 Upscale Loop",
            category="SimpAI/video",
            inputs=[
                io.Model.Input("model"),
                io.Clip.Input("clip"),
                io.Vae.Input("vae"),
                io.String.Input("source_video", multiline=False),
                io.String.Input("prompt", multiline=True, dynamic_prompts=True),
                io.Int.Input("width", default=1024, min=32, max=32768, step=32),
                io.Int.Input("height", default=576, min=32, max=32768, step=32),
                io.Float.Input("segment_duration", default=3.0, min=1.0, max=8.0, step=0.1),
                io.Int.Input("steps", default=4, min=1, max=10000),
                io.Float.Input("denoise", default=0.25, min=0.0, max=1.0, step=0.01),
                io.Combo.Input("sampler_name", options=comfy.samplers.SAMPLER_NAMES),
                io.Combo.Input("scheduler", options=comfy.samplers.SCHEDULER_NAMES),
                io.Int.Input("seed", default=0, min=0, max=0xFFFFFFFFFFFFFFFF),
                io.Float.Input("fps", default=24.0, min=1.0, max=60.0, step=1.0, advanced=True),
                io.Int.Input("context_frames", default=5, min=5, max=22, step=17, advanced=True),
            ],
            outputs=[
                io.Image.Output(display_name="frames / 完整帧"),
                io.Audio.Output(display_name="source_audio / 源音频"),
            ],
        )

    @classmethod
    def fingerprint_inputs(cls, source_video, **kwargs):
        return time.time()

    @classmethod
    def validate_inputs(cls, source_video, width, height, context_frames=5, **kwargs):
        path = _resolve_video_path(source_video)
        if not path or not os.path.isfile(path):
            return f"H3 upscale source video was not found: {source_video}"
        if (width is not None and int(width) % 32) or (height is not None and int(height) % 32):
            return "H3 upscale width and height must be multiples of 32"
        if context_frames is not None and int(context_frames) not in H3_CONTEXT_FRAME_OPTIONS:
            return "H3 upscale motion context must use 5 or 22 frames"
        return True

    @classmethod
    def execute(
        cls,
        model,
        clip,
        vae,
        source_video,
        prompt,
        width,
        height,
        segment_duration,
        steps,
        denoise,
        sampler_name,
        scheduler,
        seed,
        fps=24.0,
        context_frames=5,
    ):
        source_path = Path(_resolve_video_path(source_video)).resolve()
        fps = float(fps)
        context_frames = int(context_frames)
        if abs(fps - H3_FPS) > 1e-6:
            raise ValueError("MiniMax H3 upscale currently runs at 24 fps")
        if context_frames not in H3_CONTEXT_FRAME_OPTIONS:
            raise ValueError("MiniMax H3 upscale motion context must use 5 or 22 frames")

        metadata = _load_video_frames(
            str(source_path),
            force_rate=fps,
            frame_load_cap=0,
            skip_first_frames=0,
            select_every_nth=1,
            label="H3 upscale source",
            metadata_only=True,
            load_audio=True,
            return_fps=True,
        )
        total_frames = int(metadata[1])
        source_audio = _trim_audio_to_frames(metadata[2], total_frames, fps)
        plan = _segment_plan(total_frames, segment_duration, int(round(fps)), context_frames)
        sampler = _sampler(sampler_name)
        sigmas = _scheduler(model, scheduler, int(steps), float(denoise))
        previous_tail = None
        output_frames = None

        LOG.info(
            "H3 upscale loop: frames=%d segments=%d segment_duration=%.3f context=%d target=%dx%d steps=%d denoise=%.3f",
            total_frames,
            len(plan),
            float(segment_duration),
            context_frames,
            int(width),
            int(height),
            int(steps),
            float(denoise),
        )

        for row in plan:
            _throw_if_interrupted()
            frames, loaded_frames, _audio = _load_video_frames(
                str(source_path),
                force_rate=fps,
                frame_load_cap=int(row["source_frames"]),
                skip_first_frames=0,
                select_every_nth=1,
                label="H3 upscale segment",
                duration=float(row["source_frames"]) / fps,
                start_time=float(row["source_start"]) / fps,
                load_audio=False,
            )
            if int(loaded_frames) != int(row["source_frames"]):
                raise RuntimeError(
                    f"H3 upscale segment {row['index']} loaded {loaded_frames} frames, expected {row['source_frames']}"
                )
            generation_frames = int(row["generation_frames"])
            source_frames = _fit_frames(frames, generation_frames)
            upscaled_source = _rtx_vsr_frames(source_frames, int(width), int(height))
            conditioning, _empty = _conditioning(
                clip,
                vae,
                prompt,
                int(width),
                int(height),
                generation_frames,
                upscaled_source,
            )
            latent = _initial_latent(vae, int(width), int(height), generation_frames, upscaled_source)
            if previous_tail is not None:
                conditioning, _trim = _motion_context(
                    conditioning,
                    latent,
                    vae,
                    previous_tail,
                    context_frames,
                )
            sampled, _denoised = _sample_advanced(
                model,
                conditioning,
                sampler,
                sigmas,
                latent,
                int(seed) + int(row["index"]),
            )
            del frames, source_frames, upscaled_source, conditioning, latent, _denoised
            _empty_cache()
            decoded = _decode_video(vae, sampled)
            del sampled
            start = int(row["overlap"])
            takeover_in = int(row["takeover_in"])
            takeover_out = int(row["takeover_out"])
            window_frames = int(row["output_frames"]) + takeover_out
            end = start + window_frames
            if int(decoded.shape[0]) < end:
                raise RuntimeError(
                    f"H3 upscale segment {row['index']} decoded {int(decoded.shape[0])} frames, expected at least {end}"
                )
            usable = decoded[start:end].contiguous()
            if output_frames is None:
                output_frames = torch.empty(
                    (total_frames, *usable.shape[1:]),
                    dtype=torch.float16,
                    device="cpu",
                )
            overlap_summary = {
                "enabled": bool(start > 0),
                "applied": False,
                "reason": "first_segment" if start <= 0 else "not_run",
            }
            blend_frames = 0
            if start > 0:
                output_start = int(row["output_start"])
                previous_overlap = output_frames[
                    output_start - start : output_start
                ].contiguous()
                decoded, overlap_summary = _calibrate_h3_overlap(
                    decoded,
                    previous_overlap,
                    start,
                    takeover_in,
                )
                overlap_summary["enabled"] = True
                if takeover_in <= 0:
                    blend_frames = _blend_h3_overlap(
                        output_frames,
                        output_start,
                        decoded[:start].contiguous(),
                    )
                usable = decoded[start:end].contiguous()
            output_start = int(row["output_start"])
            write_start = output_start + takeover_in
            output_end = output_start + window_frames
            output_frames[write_start:output_end].copy_(
                usable[takeover_in:].to(dtype=output_frames.dtype)
            )
            boundary_end = output_start + int(row["output_frames"])
            tail_frames = min(context_frames, boundary_end)
            previous_tail = output_frames[
                boundary_end - tail_frames : boundary_end
            ].clone().contiguous()

            LOG.info(
                "H3 upscale segment done: %d/%d source=%d:%d sample=%d:%d generated=%d write=%d:%d takeover_in=%d takeover_out=%d overlap_color=%s blend=%d",
                int(row["index"]) + 1,
                len(plan),
                int(row["source_start"]),
                int(row["source_start"]) + int(row["source_frames"]),
                int(row["output_start"]),
                int(row["output_start"]) + window_frames,
                generation_frames,
                write_start,
                output_end,
                takeover_in,
                takeover_out,
                overlap_summary.get("reason") if not overlap_summary.get("applied") else "applied",
                blend_frames,
            )
            del decoded, usable
            _empty_cache(force=True)

        if output_frames is None:
            raise RuntimeError("H3 upscale produced no complete segments")
        return io.NodeOutput(output_frames.contiguous(), source_audio)


NODE_CLASS_MAPPINGS = {
    "SimpAIH3UpscaleLoop": SimpAIH3UpscaleLoop,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAIH3UpscaleLoop": "SimpAI H3 Upscale Loop",
}
