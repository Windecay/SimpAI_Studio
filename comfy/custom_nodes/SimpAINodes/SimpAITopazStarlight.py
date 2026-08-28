"""Private ComfyUI node for Topaz Starlight SLP-26 video upscaling."""

from __future__ import annotations

import os
import importlib
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

import folder_paths
from comfy import model_management
from comfy_api.latest import InputImpl, Types, io, ui


CATEGORY = "SimpAI/video"


def _load_topaz_runtime():
    """Load Studio's shared Topaz runtime without requiring it during node discovery."""

    try:
        from enhanced import topaz_starlight
    except ModuleNotFoundError as exc:
        if exc.name != "enhanced":
            raise
        repository_root = Path(__file__).resolve().parents[3]
        if str(repository_root) not in sys.path:
            sys.path.insert(0, str(repository_root))
        from enhanced import topaz_starlight
    return topaz_starlight


def _active_trim_window(video: Any) -> tuple[float, float]:
    try:
        start_time, duration = video.get_active_trim_window()
    except (AttributeError, TypeError, ValueError):
        return 0.0, 0.0
    try:
        return float(start_time or 0.0), float(duration or 0.0)
    except (TypeError, ValueError):
        return 0.0, 0.0


def _materialize_video(video: Any) -> tuple[str, bool]:
    """Return a file path and whether this node owns the temporary source file."""

    source = video.get_stream_source()
    start_time, duration = _active_trim_window(video)
    if (
        isinstance(source, (str, os.PathLike))
        and os.path.isfile(source)
        and start_time == 0.0
        and duration == 0.0
    ):
        return os.path.abspath(os.fspath(source)), False

    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    file_descriptor, source_path = tempfile.mkstemp(
        prefix="SimpAI_TopazStarlight_source_",
        suffix=".mp4",
        dir=temp_dir,
    )
    os.close(file_descriptor)
    try:
        video.save_to(
            source_path,
            format=Types.VideoContainer.AUTO,
            codec=Types.VideoCodec.AUTO,
        )
        if not os.path.isfile(source_path) or os.path.getsize(source_path) <= 0:
            raise RuntimeError("ComfyUI could not materialize the input VIDEO as a file.")
    except BaseException:
        try:
            os.remove(source_path)
        except OSError:
            pass
        raise
    return source_path, True


def _new_output_path() -> str:
    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    return os.path.join(
        temp_dir,
        f"SimpAI_TopazStarlight_{uuid.uuid4().hex}.mp4",
    )


def _load_progress_bar():
    """Resolve ComfyUI's ProgressBar across the Studio namespace layout."""

    try:
        comfy_utils = importlib.import_module("comfy.utils")
        progress_bar = getattr(comfy_utils, "ProgressBar", None)
        if progress_bar is not None:
            return progress_bar
    except Exception:
        pass

    import comfy

    core_comfy_path = Path(__file__).resolve().parents[3] / "comfy" / "comfy"
    paths = [str(core_comfy_path)]
    paths.extend(path for path in getattr(comfy, "__path__", ()) if str(path) != str(core_comfy_path))
    try:
        comfy.__path__ = paths
    except Exception:
        pass
    sys.modules.pop("comfy.utils", None)
    comfy_utils = importlib.import_module("comfy.utils")
    progress_bar = getattr(comfy_utils, "ProgressBar", None)
    if progress_bar is None:
        raise ImportError("ComfyUI ProgressBar is unavailable")
    return progress_bar


class SimpAITopazStarlight(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="SimpAITopazStarlight",
            search_aliases=["Topaz", "Starlight", "SLP-26", "video upscale", "视频放大"],
            display_name="SimpAI Topaz Starlight / SLP-26",
            category=CATEGORY,
            description=(
                "Upscale a VIDEO with the bundled Topaz Starlight SLP-26 runtime. "
                "使用内置 Topaz 星光 SLP-26 引擎放大视频。"
            ),
            inputs=[
                io.Video.Input(
                    "video",
                    display_name="VIDEO",
                    tooltip="ComfyUI VIDEO input. / ComfyUI 视频输入。",
                ),
                io.Float.Input(
                    "upscale_factor",
                    display_name="Upscale factor / 放大倍数",
                    default=2.0,
                    min=1.0,
                    max=4.0,
                    step=0.1,
                    tooltip="Output scale from 1x to 4x. / 输出放大倍数，范围 1 到 4 倍。",
                ),
                io.Float.Input(
                    "enhancement_strength",
                    display_name="Enhancement strength / 增强强度",
                    default=1.0,
                    min=0.5,
                    max=1.5,
                    step=0.1,
                    tooltip="SLP-26 enhancement strength. / SLP-26 增强强度。",
                ),
            ],
            outputs=[
                io.Video.Output(
                    display_name="VIDEO",
                    tooltip="Upscaled video with source audio when available. / 放大后的视频，保留源音频（如有）。",
                ),
                io.String.Output(
                    display_name="file_path",
                    tooltip="Temporary output path. / 临时输出路径。",
                ),
            ],
        )

    @classmethod
    def execute(cls, video, upscale_factor=2.0, enhancement_strength=1.0) -> io.NodeOutput:
        if video is None:
            raise ValueError("A VIDEO input is required. / 需要输入 VIDEO。")

        topaz_starlight = _load_topaz_runtime()
        source_path, owns_source = _materialize_video(video)
        output_path = _new_output_path()
        progress_bar = _load_progress_bar()(100)
        report_progress, preview_session = _create_progress_callback(
            source_path,
            progress_bar,
        )

        try:
            model_management.throw_exception_if_processing_interrupted()
            topaz_starlight.run_topaz_starlight(
                source_path,
                output_path,
                {
                    "upscale_factor": float(upscale_factor),
                    "enhancement_strength": float(enhancement_strength),
                },
                language=None,
                progress_callback=report_progress,
                cancel_callback=model_management.processing_interrupted,
            )
            model_management.throw_exception_if_processing_interrupted()
            if not os.path.isfile(output_path):
                raise RuntimeError("Topaz Starlight produced no output VIDEO.")

            output_video = InputImpl.VideoFromFile(output_path)
            filename = os.path.basename(output_path)
            return io.NodeOutput(
                output_video,
                output_path,
                ui=ui.PreviewVideo(
                    [ui.SavedResult(filename, "", io.FolderType.temp)]
                ),
            )
        except BaseException:
            try:
                if os.path.isfile(output_path):
                    os.remove(output_path)
            except OSError:
                pass
            raise
        finally:
            preview_session.close()
            if owns_source:
                try:
                    os.remove(source_path)
                except OSError:
                    pass


def _create_progress_callback(source_path: str, progress_bar: Any):
    try:
        from modules.native_video_preview import create_native_video_progress_callback
    except Exception:
        return (
            lambda percentage, title: progress_bar.update_absolute(percentage, 100),
            _NullPreviewSession(),
        )

    return create_native_video_progress_callback(
        source_path,
        language=None,
        progress_sink=lambda percentage, _title, preview: progress_bar.update_absolute(
            percentage,
            100,
            preview,
        ),
    )


class _NullPreviewSession:
    def close(self) -> None:
        pass


NODE_CLASS_MAPPINGS = {
    "SimpAITopazStarlight": SimpAITopazStarlight,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SimpAITopazStarlight": "SimpAI Topaz Starlight / SLP-26",
}
