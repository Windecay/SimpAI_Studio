import contextlib
from fractions import Fraction
import logging
import math
import os
import shutil
import subprocess
import tempfile
import time

import av
import imageio_ffmpeg
from PIL import Image
import torch

import folder_paths
import nodes
from comfy.ldm.wan.model_vsr import RELAY_KEYFRAME_INTERVAL, relay_latent_size
from comfy import model_management, utils
from comfy_api.latest import Input, InputImpl, Types, io, ui


logger = logging.getLogger(__name__)


def _frames(path, start, duration, fps):
    limit = max(1, math.ceil(duration * fps)) if duration > 0 else None
    count = 0
    with av.open(path) as container:
        stream = container.streams.video[0]
        for index, frame in enumerate(container.decode(stream)):
            model_management.throw_exception_if_processing_interrupted()
            timestamp = float(frame.time) if frame.time is not None else index / float(fps)
            if timestamp < start:
                continue
            if limit is not None and count >= limit:
                break
            yield frame
            count += 1


def _keyframes(path, start, duration, fps):
    selected = []
    last = None
    count = 0
    for index, frame in enumerate(_frames(path, start, duration, fps)):
        last = frame
        count = index + 1
        if index % RELAY_KEYFRAME_INTERVAL == 0:
            selected.append(torch.from_numpy(frame.to_ndarray(format="rgb24")))
    if last is None:
        raise ValueError("The source video has no decodable frames.")
    if (count - 1) % RELAY_KEYFRAME_INTERVAL:
        selected.append(torch.from_numpy(last.to_ndarray(format="rgb24")))
    return torch.stack(selected).float().div_(255), count


def _windows(path, start, duration, fps):
    window = []
    emitted = False
    for frame in _frames(path, start, duration, fps):
        window.append(torch.from_numpy(frame.to_ndarray(format="rgb24")))
        if len(window) == RELAY_KEYFRAME_INTERVAL + 1:
            yield torch.stack(window).float().div_(255)
            emitted = True
            window = window[-1:]
    if len(window) > 1 or (window and not emitted):
        yield torch.stack(window).float().div_(255)


@contextlib.contextmanager
def _progress_range(progress, start, end):
    original = utils.PROGRESS_BAR_HOOK

    def update(value, total, preview=None, node_id=None):
        mapped = start + int((end - start) * value / max(1, total))
        progress.update_absolute(max(progress.current, mapped))

    utils.set_progress_bar_global_hook(update)
    try:
        yield
    finally:
        utils.set_progress_bar_global_hook(original)


def _mux_audio(silent_path, source_path, output_path, start, duration):
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-nostdin",
        "-y", "-i", silent_path, "-ss", str(start), "-i", source_path,
        "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k", "-t", str(duration), "-movflags", "+faststart", output_path,
    ]
    with tempfile.TemporaryFile() as errors:
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=errors)
        deadline = time.monotonic() + max(60, duration * 2 + 30)
        try:
            while process.poll() is None:
                model_management.throw_exception_if_processing_interrupted()
                if time.monotonic() > deadline:
                    raise TimeoutError("RelayVSR audio encoding timed out.")
                time.sleep(0.1)
            if process.returncode:
                errors.seek(0)
                raise RuntimeError(errors.read().decode("utf-8", errors="replace")[-2000:])
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


@contextlib.contextmanager
def _open_video_encoder(path, fps, crf, first_frame):
    # NVENC CQ=0 means automatic quality, not the existing lossless CRF=0.
    encoders = ("h264_nvenc", "libx264") if crf else ("libx264",)
    width, height = first_frame.width, first_frame.height
    for encoder in encoders:
        with av.open(path, "w", format="mp4") as container:
            try:
                stream = container.add_stream(encoder, rate=fps)
                stream.width, stream.height = width, height
                stream.pix_fmt = "yuv420p"
                if encoder == "h264_nvenc":
                    stream.bit_rate = 0
                    stream.options = {"preset": "p4", "rc": "vbr", "cq": str(crf)}
                else:
                    stream.options = {"crf": str(crf), "preset": "fast"}
                first_frame.pts, first_frame.time_base = 0, 1 / fps
                packets = stream.encode(first_frame)
            except (av.error.FFmpegError, av.codec.codec.UnknownCodecError) as error:
                if encoder != "h264_nvenc":
                    raise
                logger.warning("RelayVSR: %s failed at %sx%s; using libx264: %s", encoder, width, height, error)
                continue
            logger.info("RelayVSR: encoding %sx%s with %s", width, height, encoder)
            yield container, stream, packets, encoder
            return


def _encode_video_packets(stream, encoder, frame=None):
    try:
        return stream.encode(frame)
    except av.error.FFmpegError as error:
        raise RuntimeError(f"RelayVSR: {encoder} failed after encoding started: {error}") from error


class SimpAIRelayVSRVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIRelayVSRVideo",
            display_name="RelayVSR Video",
            category="SimpAI/video",
            inputs=[
                io.Model.Input("model"),
                io.Vae.Input("vae"),
                io.Video.Input("video"),
                io.Int.Input("seed", default=42, min=0, max=0xffffffffffffffff),
                io.Float.Input("detail", default=1.0, min=0.0, max=1.0, step=0.01),
                io.Int.Input("crf", default=18, min=0, max=51),
                io.Int.Input("duration_limit", default=0, min=0, max=36000),
            ],
            outputs=[io.Video.Output()],
        )

    @classmethod
    def execute(cls, model, vae, video: Input.Video, seed=42, detail=1.0, crf=18, duration_limit=0.0):
        with tempfile.TemporaryDirectory(prefix="relayvsr-", dir=folder_paths.get_temp_directory()) as work:
            source = video.get_stream_source()
            if isinstance(source, (str, os.PathLike)):
                source = os.fspath(source)
                if not os.path.isfile(source):
                    raise ValueError("RelayVSR requires a local video file.")
            else:
                source_path = os.path.join(work, "source.mp4")
                source.seek(0)
                with open(source_path, "wb") as dest:
                    shutil.copyfileobj(source, dest)
                source = source_path
            fps = Fraction(video.get_frame_rate())
            start, trim_duration = video.get_active_trim_window()
            limits = [value for value in (trim_duration, duration_limit) if value > 0]
            duration = min(limits) if limits else 0
            images, frames = _keyframes(source, start, duration, fps)
            height, width = images.shape[1:3]
            progress = utils.ProgressBar(frames * 100)
            progress.update_absolute(1)
            progress.update_absolute(frames * 10)
            diffusion = model.model.diffusion_model
            positive = [[diffusion.positive_conditioning.unsqueeze(0).clone(), {"lq_images": images}]]
            latent = {"samples": torch.zeros(
                (1, model.model.latent_format.latent_channels, len(images),
                 *relay_latent_size(height, width, diffusion.latent_stride)),
                device=model_management.intermediate_device(),
            )}
            with _progress_range(progress, frames * 10, frames * 40):
                sampled, = nodes.common_ksampler(model, seed, 1, 1.0, "euler", "simple", positive, positive, latent)
            del positive, latent, images
            silent_path = os.path.join(work, "silent.mp4")
            completed = 0
            last_preview = 0
            with contextlib.ExitStack() as resources:
                for index, window in enumerate(_windows(source, start, duration, fps)):
                    skip = int(index > 0)
                    count = len(window) - skip
                    with _progress_range(progress, frames * 40 + 59 * completed, frames * 40 + 59 * (completed + count)):
                        decoded = vae.decode(
                            sampled["samples"][:, :, index:index + 2],
                            vae_options={"lq_images": window, "detail": detail},
                        )
                    decoded = decoded.reshape(-1, *decoded.shape[-3:])
                    for output in decoded[skip:]:
                        model_management.throw_exception_if_processing_interrupted()
                        pixels = output.mul(255).round().clamp_(0, 255).to(device="cpu", dtype=torch.uint8).numpy()
                        frame = av.VideoFrame.from_ndarray(pixels, format="rgb24")
                        if completed == 0:
                            container, stream, packets, encoder = resources.enter_context(
                                _open_video_encoder(silent_path, fps, crf, frame),
                            )
                        else:
                            frame.pts, frame.time_base = completed, 1 / fps
                            packets = _encode_video_packets(stream, encoder, frame)
                        for packet in packets:
                            container.mux(packet)
                        completed += 1
                        preview = None
                        if time.monotonic() - last_preview >= 0.3 or completed == frames:
                            preview = ("WEBP", Image.fromarray(pixels), 512)
                            last_preview = time.monotonic()
                        progress.update_absolute(max(progress.current, frames * 40 + completed * 59), preview=preview)
                    del decoded, window
                if completed != frames:
                    raise RuntimeError(f"RelayVSR decoded {completed} frames; the source contains {frames}.")
                for packet in _encode_video_packets(stream, encoder):
                    container.mux(packet)
                output_width, output_height = stream.width, stream.height
            final_temp = os.path.join(work, "result.mp4")
            _mux_audio(silent_path, source, final_temp, start, float(frames / fps))
            output_dir, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
                "RelayVSR", folder_paths.get_temp_directory(), output_width, output_height,
            )
            filename = f"{filename}_{counter:05}_.mp4"
            result = os.path.join(output_dir, filename)
            shutil.move(final_temp, result)
            progress.update_absolute(frames * 100)
            return io.NodeOutput(InputImpl.VideoFromFile(result))


class SimpAIRelayVSRSaveVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIRelayVSRSaveVideo", display_name="Save RelayVSR Video", category="SimpAI/video",
            inputs=[io.Video.Input("video"), io.String.Input("filename_prefix", default="RelayVSR")],
            outputs=[], is_output_node=True,
        )

    @classmethod
    def execute(cls, video: Input.Video, filename_prefix="RelayVSR"):
        width, height = video.get_dimensions()
        output_dir, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, folder_paths.get_output_directory(), width, height,
        )
        filename = f"{filename}_{counter:05}_.mp4"
        video.save_to(os.path.join(output_dir, filename), format=Types.VideoContainer("mp4"), codec=Types.VideoCodec("auto"))
        return io.NodeOutput(ui={"video": [ui.SavedResult(filename, subfolder, io.FolderType.output)]})


NODE_CLASS_MAPPINGS = {"SimpAIRelayVSRVideo": SimpAIRelayVSRVideo, "SimpAIRelayVSRSaveVideo": SimpAIRelayVSRSaveVideo}
NODE_DISPLAY_NAME_MAPPINGS = {"SimpAIRelayVSRVideo": "RelayVSR Video", "SimpAIRelayVSRSaveVideo": "Save RelayVSR Video"}
