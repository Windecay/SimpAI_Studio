"""Kandinsky 6.0 VSR 2.0 nodes: load the DiT, the KVAE and the latent upscalers; upscale a video x2, x2.25 or x4."""
import logging
import math
import os
import time
import uuid
from fractions import Fraction

import numpy as np
from PIL import Image
import torch

import comfy.model_management
import comfy.utils
import folder_paths
from comfy_api.latest import InputImpl, io

from . import kvae as kvae_module
from . import latent_upscaler as lu_module
from . import pipeline
from .loader import load_dit
from .video_io import ENCODERS, ArrayFrames, FileFrames, Writer, pick_encoder

log = logging.getLogger("KandinskySR")
SCALES = {"2x": 2.0, "2.25x": 2.25, "4x": 4.0}


def _files(folder, prefix):
    return [f.replace(os.sep, "/") for f in folder_paths.get_filename_list(folder) if os.path.basename(f).startswith(prefix)]


def _other_gpus():
    """CUDA devices other than ComfyUI's, as "cuda:N (name)"."""
    if not torch.cuda.is_available():
        return []
    main = comfy.model_management.get_torch_device()
    return [f"cuda:{i} ({torch.cuda.get_device_name(i)})" for i in range(torch.cuda.device_count())
            if torch.device("cuda", i) != main]


def _default(files, preferred):
    return next((f for f in files if f.endswith(preferred)), files[0] if files else None)


class VideoSRModels:
    """The model set: a DiT and a KVAE per card (pipeline.Card), the latent upscalers on the main card, each loaded
    on the first run at its scale."""

    def __init__(self, cards, upscaler_paths):
        self.cards, self.upscaler_paths, self.upscalers = cards, upscaler_paths, {}

    def upscaler(self, scale):
        if scale not in self.upscaler_paths:
            raise ValueError(f"Select the Kandinsky {scale}x latent upscaler for this scale.")
        if scale not in self.upscalers:
            self.upscalers[scale] = lu_module.load_latent_upscaler(self.upscaler_paths[scale])
        return self.upscalers[scale]


class LoadKandinskyVideoSRModels(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        dits = _files("diffusion_models", "kandinsky6_vsr")
        vaes = _files("vae", "kandinsky_kvae")
        x2 = _files("latent_upscale_models", "kandinsky6_sr_latent_upscaler_x2")
        x4 = _files("latent_upscale_models", "kandinsky6_sr_latent_upscaler_x4")
        return io.Schema(
            node_id="KandinskyVideoSRLoader",
            display_name="Load Kandinsky Video SR Models",
            category="Kandinsky SR",
            description="Loads Kandinsky 6.0 Video Super-Resolution 2.0: the SR DiT, the KVAE video autoencoder and the x2 "
                        "and x4 latent upscalers (each read when a run first needs it).",
            inputs=[
                io.Combo.Input("dit", options=dits, default=_default(dits, "_bf16.safetensors"),
                               tooltip="models/diffusion_models: kandinsky6_vsr_2.0_distilled2steps_bf16 (tools/convert_vsr_dit.py)."),
                io.Combo.Input("kvae", options=vaes, default=_default(vaes, "_bf16.safetensors"),
                               tooltip="models/vae: kandinsky_kvae_3d_2.0_t4s16 (tools/convert_kvae.py)."),
                io.Combo.Input("upscaler_x2", options=x2, default=_default(x2, "_bf16.safetensors"),
                               tooltip="models/latent_upscale_models: the x2 latent upscaler, used by the 2x and 2.25x routes."),
                io.Combo.Input("upscaler_x4", options=x4, default=_default(x4, "_bf16.safetensors"),
                               optional=True,
                               tooltip="models/latent_upscale_models: the x4 latent upscaler, used by the 4x route."),
                io.Combo.Input("second_gpu", options=["none"] + _other_gpus(), default="none", advanced=True, optional=True,
                               tooltip="Run tiles on a second card too: it gets its own copy of the DiT and the KVAE (about "
                                       "6.5 GB more RAM) and takes the next tile whenever it is free, so a faster card does "
                                       "more of them. Each card computes in its own arithmetic: a tile from another card model "
                                       "differs at the bf16 noise level."),
            ],
            outputs=[io.Custom("KANDINSKY_VIDEO_SR").Output(display_name="models")],
        )

    @classmethod
    def execute(cls, dit, kvae, upscaler_x2, upscaler_x4=None, second_gpu="none") -> io.NodeOutput:
        path = lambda folder, name: folder_paths.get_full_path_or_raise(folder, name)  # noqa: E731
        upscaler_paths = {2: path("latent_upscale_models", upscaler_x2)}
        if upscaler_x4:
            upscaler_paths[4] = path("latent_upscale_models", upscaler_x4)
        devices = [None] + ([torch.device(second_gpu.split(" ")[0])] if second_gpu != "none" else [])
        cards = [pipeline.Card(load_dit(path("diffusion_models", dit), device=device),
                               kvae_module.load_kvae(path("vae", kvae), device=device)) for device in devices]
        return io.NodeOutput(VideoSRModels(cards, upscaler_paths))


class KandinskyVideoSRUpscale(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="KandinskyVideoSRUpscale",
            display_name="Kandinsky Video SR Upscale",
            category="Kandinsky SR",
            description="Tiled video super-resolution: the clip is encoded once, each tile is upscaled in latent space, "
                        "refined by the DiT in two steps and decoded, and the tiles are blended into the output, which is "
                        "encoded to a file with optional source audio. Unless frame rate preservation is enabled, "
                        "sources above the 24 fps tolerance are thinned. Clips "
                        "longer than window_frames (361, 15 s) run in overlapping windows, cross-faded where they meet.",
            inputs=[
                io.Custom("KANDINSKY_VIDEO_SR").Input("models"),
                io.Video.Input("video", optional=True, tooltip="The video to upscale; its frame rate and audio carry over. "
                                                               "Connect this or images."),
                io.Image.Input("images", optional=True, tooltip="Or the frames as images, in order, at the fps below, no audio."),
                io.Combo.Input("scale", options=list(SCALES), default="2x",
                               tooltip="Output size = input x scale. 2.25x is a 1.125x bilinear pre-upscale followed by 2x."),
                io.Int.Input("seed", default=42, min=0, max=0xffffffffffffffff, control_after_generate=io.ControlAfterGenerate.fixed,
                             tooltip="Seed of the start noise; tile i uses seed + i (the reference's default is 42)."),
                io.Float.Input("overlap", default=0.2, min=0.0, max=0.9, step=0.05, advanced=True,
                               tooltip="Least overlap between neighbouring tiles, as a fraction of the tile; the grid takes the "
                                       "fewest tiles that keep it. More overlap: more tiles, smoother seams."),
                io.Combo.Input("encoder", options=["auto"] + list(ENCODERS), default="auto", advanced=True,
                               tooltip="How the output is encoded: NVENC HEVC / H.264 on NVIDIA's video encoder, or x264 on "
                                       "the CPU; auto takes the first that opens at the output size."),
                io.Float.Input("fps", default=24.0, min=1.0, max=240.0, step=0.001, optional=True,
                               tooltip="Frame rate of the images input; a video keeps its own."),
                io.Combo.Input("kernels", options=["fast", "exact"], default="fast", optional=True,
                               tooltip="fast: the DiT's attention with float16 P V, its norms in fused kernels and the KVAE "
                                       "decode in float16 (CUDA with Triton): at the reference's own bf16 noise, faster. "
                                       "exact: the reference's arithmetic. Without Triton the DiT runs plain-torch NABLA."),
                io.Int.Input("window_frames", default=361, min=17, max=505, step=8, advanced=True, optional=True,
                             tooltip="Longest piece of the clip the model sees at once (1 + 8k frames; it was trained on 121 "
                                     "and holds up to 361). A longer clip runs in windows of this many frames that share 9 "
                                     "frames, cross-faded where they meet; detail softens briefly at each join."),
                io.Boolean.Input("preserve_frame_rate", default=False, advanced=True, optional=True,
                                 tooltip="Keep the source frame count and nominal frame rate instead of thinning frames."),
                io.Int.Input("duration_limit", default=0, min=0, max=36000, advanced=True, optional=True,
                             tooltip="Limit the processed source to this many seconds. Zero uses the complete video."),
                io.Boolean.Input("include_audio", default=True, advanced=True, optional=True,
                                 tooltip="Include the first audio track. Disable when the output node handles audio."),
                io.Combo.Input("stitch", options=["pixels", "latent"], default="pixels", optional=True,
                               tooltip="pixels: decode every tile and blend the frames, as the reference does. latent: blend "
                                       "the tiles' latents and decode the whole frame once: about 2x faster to decode, a "
                                       "little sharper where tiles overlap (kernels fast on a CUDA card)."),
            ],
            outputs=[io.Video.Output(tooltip="The upscaled video, encoded to a file as it was stitched.")],
        )

    @classmethod
    def execute(cls, models, scale, seed, overlap=0.2, encoder="auto", fps=24.0, kernels="fast", stitch="pixels",
                window_frames=361, video=None, images=None, preserve_frame_rate=False, duration_limit=0,
                include_audio=True) -> io.NodeOutput:
        if (video is None) == (images is None):
            raise ValueError("Kandinsky Video SR Upscale needs a video or images connected, one of the two")
        if window_frames < 17 or (window_frames - 1) % 8:
            raise ValueError("The Kandinsky temporal window must have 1 + 8k frames (at least 17).")
        if isinstance(video, InputImpl.VideoFromFile):
            source = FileFrames(video, exact_count=preserve_frame_rate)
        elif images is not None:
            source = ArrayFrames(images, fps)
        else:  # a VIDEO made from components
            parts = video.get_components()
            source = ArrayFrames(parts.images, parts.frame_rate)
            if include_audio and parts.audio is not None:
                source.audio = (parts.audio["waveform"][0].float().numpy(), parts.audio["sample_rate"])
        started = time.perf_counter()
        device = models.cards[0].device
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats(device)
        try:
            return cls.run(models, source, scale, seed, overlap, encoder, kernels, stitch, window_frames, device, started,
                           preserve_frame_rate=preserve_frame_rate, duration_limit=duration_limit, include_audio=include_audio)
        finally:
            source.close()

    @classmethod
    def run(cls, models, source, scale, seed, overlap, encoder, kernels, stitch, window_frames, device, started,
            *, preserve_frame_rate=False, duration_limit=0, include_audio=True):
        """The clip a temporal window at a time: source frames are read as a window needs them, each window runs the
        whole pipeline, and the frames two windows share are cross-faded linearly before they are written."""
        total = min(source.total, math.ceil(duration_limit * source.fps)) if duration_limit else source.total
        if preserve_frame_rate:
            indices, rate = range(total), source.fps
        else:
            indices, rate = pipeline.frame_plan(total, float(source.fps))
            rate = source.fps if rate == float(source.fps) else Fraction(rate)
        first = source.get(indices[0], indices[0] + 1) if indices else []
        if not len(first):
            raise ValueError("Kandinsky Video SR Upscale: the input has no frames")
        count = [len(indices)]  # the container's count until the source runs out earlier
        if rate != source.fps:
            log.info("Kandinsky VSR: %d source frames at %.3f fps -> %d frames at %g fps", source.total, float(source.fps), count[0], rate)
        buffer, buffer_start = [first[0]], 0  # the source frames of the current window, from clip frame buffer_start

        def read_until(stop):
            """Source frames up to clip frame `stop`; a file that ends earlier than its container says sets count."""
            while buffer_start + len(buffer) < min(stop, count[0]):
                got = source.get(indices[buffer_start + len(buffer)], indices[buffer_start + len(buffer)] + 1)
                if not len(got):
                    count[0] = buffer_start + len(buffer)
                    break
                buffer.append(got[0])

        # the first window and one frame past it before planning, so the windows come from the frames the file holds
        read_until(window_frames + 1)
        starts, padded = pipeline.window_starts(count[0], window_frames)
        span = window_frames if len(starts) > 1 else padded
        plan = pipeline.Plan(span, first.shape[1], first.shape[2], SCALES[scale], overlap)
        out_h, out_w = plan.out_size
        chosen = pick_encoder(encoder, out_w, out_h, rate)
        log.info("Kandinsky VSR: %d frames %dx%d -> %dx%d (%s), %d window(s) of %d frames, %d tiles of %dx%d, seed %d, "
                 "kernels %s, stitch %s, encoder %s", count[0], first.shape[2], first.shape[1], out_w, out_h, scale,
                 len(starts), span, len(plan.tiles), plan.tile[1], plan.tile[0], seed, kernels, stitch, chosen)
        audio = source.audio if include_audio else None
        if audio is not None:
            samples, sample_rate = audio
            audio = (samples[:, :round(count[0] / float(rate) * sample_rate)], sample_rate)

        def window_video(start):
            nonlocal buffer, buffer_start
            buffer, buffer_start = buffer[start - buffer_start:], start
            read_until(start + span + 1)  # one frame past the window, so a short file ends the loop before another window
            frames = buffer[:span] + buffer[-1:] * (span - len(buffer))  # past the clip's end: copies of its last frame
            return torch.from_numpy(np.stack(frames)).permute(0, 3, 1, 2).contiguous()

        folder = os.path.join(folder_paths.get_temp_directory(), "kandinsky_sr")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{uuid.uuid4().hex}.mp4")
        upscaler = models.upscaler(plan.tiling)
        steps = len(starts) * len(plan.tiles) * (models.cards[0].dit.sampler["nfe"] + 1)
        progress = comfy.utils.ProgressBar(steps + 1)
        progress.update_absolute(0)
        timings, written, writer = {}, [0], None
        last_preview = 0.0
        try:
            with comfy.model_management.cuda_device_context(device):
                writer = Writer(path, out_w, out_h, rate, chosen, device, audio)

                def put(frames):
                    nonlocal last_preview
                    comfy.model_management.throw_exception_if_processing_interrupted()
                    take = min(frames.shape[0], count[0] - written[0])
                    if take > 0:
                        writer.put(frames[:take])
                        written[0] += take
                        now = time.monotonic()
                        if now - last_preview >= 0.5 or written[0] == count[0]:
                            stride = max(1, math.ceil(max(out_w, out_h) / 512))
                            preview = Image.fromarray(frames[take - 1, ::stride, ::stride].cpu().numpy())
                            progress.update_absolute(progress.current, preview=("WEBP", preview, 512))
                            last_preview = now

                held, prev_end = None, None  # the previous window's last frames, not written yet, and its end
                for k, start in enumerate(starts):
                    if start >= count[0]:
                        break
                    video_u8 = window_video(start)
                    last = k == len(starts) - 1 or starts[k + 1] >= count[0] or count[0] <= start + span
                    fade = prev_end - len(held) if held is not None else start
                    keep_from = start + span if last else start + span - pipeline.WINDOW_OVERLAP
                    new_held, position = [], [start]

                    def emit(chunk, fade=fade, keep_from=keep_from, held=held, new_held=new_held, position=position):
                        f0 = position[0]
                        f1 = position[0] = f0 + len(chunk)
                        lo = max(f0, fade)
                        if lo >= f1:
                            return
                        frames = chunk[lo - f0:]
                        hi = min(f1, prev_end) if held is not None else lo
                        if hi > lo:
                            weight = (torch.arange(lo - fade, hi - fade, device=frames.device) + 1).view(-1, 1, 1, 1) / (len(held) + 1)
                            blended = (held[lo - fade:hi - fade].float() * (1 - weight)
                                       + frames[:hi - lo].float() * weight).round_().to(torch.uint8)
                            frames = torch.cat((blended, frames[hi - lo:]))
                        # A short window can overlap both neighbors. Hold blended frames for the next window as well.
                        take = max(0, min(f1, keep_from) - lo)
                        if take:
                            put(frames[:take])
                        if take < len(frames):
                            new_held.append(frames[take:].clone())

                    part = pipeline.upscale(models.cards, upscaler, video_u8, plan, seed, emit, kernels=kernels,
                                            stitch_mode=stitch, first_frame=None if len(starts) == 1 else start // 4,
                                            progress=progress)
                    for key, value in part.items():
                        if isinstance(value, float):
                            timings[key] = timings.get(key, 0.0) + value
                        elif isinstance(value, tuple):
                            timings[key] = tuple(round(a + b, 2) for a, b in zip(timings.get(key, (0, 0)), value))
                        else:
                            timings[key] = value
                    held, prev_end = (torch.cat(new_held) if new_held else None), start + span
                    if len(starts) > 1:
                        log.info("Kandinsky VSR: window %d/%d (frames %d-%d) done at %.1f s, peak VRAM %.1f GB", k + 1,
                                 len(starts), start, min(start + span, count[0]) - 1, time.perf_counter() - started,
                                 torch.cuda.max_memory_allocated(device) / 2**30 if device.type == "cuda" else 0.0)
                    if last:
                        break
                if written[0] != count[0] or (preserve_frame_rate and total != count[0]):
                    raise RuntimeError(f"Kandinsky VSR wrote {written[0]} frames; expected {total if preserve_frame_rate else count[0]}.")
                if preserve_frame_rate and total == source.total and len(source.get(total, total + 1)):
                    raise RuntimeError("Kandinsky VSR source contains more frames than its declared count.")
                comfy.model_management.throw_exception_if_processing_interrupted()
                t0 = time.perf_counter()
                writer.close()
                comfy.model_management.throw_exception_if_processing_interrupted()
                timings["encode wait"] = time.perf_counter() - t0
                progress.update_absolute(steps + 1)
        except BaseException:
            if writer is not None:
                writer.abort()
            elif os.path.exists(path):
                os.remove(path)
            raise
        elapsed = time.perf_counter() - started
        peak = torch.cuda.max_memory_allocated(device) / 2**30 if device.type == "cuda" else 0.0
        log.info("Kandinsky VSR: %d frames in %.1f s (%s), peak VRAM %.1f GB; %s", written[0], elapsed,
                 ", ".join(f"{k} {v:.1f} s" if isinstance(v, float) else f"{k} {v}" for k, v in timings.items()), peak, path)
        return io.NodeOutput(InputImpl.VideoFromFile(path))


NODES = [LoadKandinskyVideoSRModels, KandinskyVideoSRUpscale]
