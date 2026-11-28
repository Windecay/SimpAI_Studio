from io import BytesIO
import os
import subprocess
import tempfile
import time
import uuid

import imageio_ffmpeg
from PIL import Image
import torch

import folder_paths
import simpai_ws_recovery
from comfy import model_management
from comfy_api.latest import InputImpl, io, ui


class SimpAIKandinskySaveImage(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIKandinskySaveImage",
            display_name="Save Kandinsky Image",
            category="SimpAI/image",
            inputs=[io.Image.Input("images")],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, images):
        saved = []
        for image in images:
            model_management.throw_exception_if_processing_interrupted()
            pixels = (image * 255).clamp_(0, 255).to(torch.uint8).cpu().numpy()
            picture = Image.fromarray(pixels)
            with BytesIO() as buffer:
                if max(picture.size) <= 16383:
                    extension = "webp"
                    picture.save(buffer, format="WEBP", lossless=True, method=3)
                else:
                    extension = "png"
                    picture.save(buffer, format="PNG", compress_level=4)
                result = simpai_ws_recovery.save_bytes(folder_paths.get_temp_directory(), buffer.getvalue(), extension)
            if result is None:
                raise RuntimeError("Kandinsky image result could not be saved.")
            saved.append(result)
        return io.NodeOutput(ui={"images": saved})


def _save_with_source_audio(video_path, source_path, destination, start, duration):
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-i", video_path, "-ss", f"{start:.9f}", "-i", source_path,
        "-map", "0:v:0", "-map", "1:a?", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-t", f"{duration:.9f}", "-movflags", "+faststart", destination,
    ]
    with tempfile.TemporaryFile() as errors:
        with subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=errors,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)) as process:
            deadline = time.monotonic() + max(60, duration * 2 + 30)
            try:
                while process.poll() is None:
                    model_management.throw_exception_if_processing_interrupted()
                    if time.monotonic() > deadline:
                        raise TimeoutError("Kandinsky video audio mux timed out.")
                    time.sleep(0.1)
                if process.returncode:
                    errors.seek(0)
                    raise RuntimeError(f"Kandinsky video save failed: {errors.read().decode(errors='replace')[-2000:]}")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=5)


class SimpAIKandinskySaveVideo(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAIKandinskySaveVideo",
            display_name="Save Kandinsky Video",
            category="SimpAI/video",
            inputs=[io.Video.Input("video"), io.Video.Input("source"), io.String.Input("filename_prefix", default="Kandinsky")],
            outputs=[],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, video, source, filename_prefix="Kandinsky"):
        if not isinstance(video, InputImpl.VideoFromFile) or not isinstance(source, InputImpl.VideoFromFile):
            raise ValueError("Saving Kandinsky video requires file-backed input and result videos.")
        video_path, source_path = video.get_stream_source(), source.get_stream_source()
        if not isinstance(video_path, str) or not isinstance(source_path, str):
            raise ValueError("Saving Kandinsky video requires local video files.")
        start, _ = source.get_active_trim_window()
        duration = float(video.get_frame_count() / video.get_frame_rate())
        width, height = video.get_dimensions()
        output_dir, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
            filename_prefix, folder_paths.get_output_directory(), width, height,
        )
        filename = f"{filename}_{counter:05}_{uuid.uuid4().hex[:12]}.mp4"
        with tempfile.NamedTemporaryFile(dir=output_dir, suffix=".mp4", prefix=".kandinsky-", delete=False) as file:
            partial = file.name
        try:
            _save_with_source_audio(video_path, source_path, partial, start, duration)
            model_management.throw_exception_if_processing_interrupted()
            os.replace(partial, os.path.join(output_dir, filename))
        finally:
            if os.path.isfile(partial):
                os.remove(partial)
        return io.NodeOutput(ui={"video": [ui.SavedResult(filename, subfolder, io.FolderType.output)]})
