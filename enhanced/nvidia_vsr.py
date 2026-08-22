"""Studio-native Nvidia RTX Video Super Resolution processing."""

from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
import time
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterator


NVIDIA_VSR_METHOD = "nvidia_vsr"
NATIVE_PROCESS = "studio"
RIFE_MODEL_NAME = "flownet.pkl"

ProgressCallback = Callable[[int, str], None]
CancelCallback = Callable[[], bool]


class NvidiaVSRCancelled(RuntimeError):
    """Raised when the Studio task is stopped by the user."""


class NvidiaVSRDependencyError(RuntimeError):
    """Raised when a native VSR dependency is unavailable."""


@dataclass(frozen=True)
class NvidiaVSRParams:
    crf: int = 19
    target_fps: float = 30.0
    segment_frames: int = 300
    upscale_factor: float = 2.0
    interpolate: bool = False
    duration_limit: float = 0.0
    interpolation_scale: float = 2.0
    interpolation_batch_size: int = 16
    max_pixels_per_batch: int = 128 * 1024 * 1024
    quality: str = "ULTRA"
    scene_detect: bool = True
    scene_threshold: float = 0.15


@dataclass(frozen=True)
class _VideoInfo:
    width: int
    height: int
    source_fps: float
    frame_count: int
    has_audio: bool


def _value(source: Any, *names: str, default: Any = None) -> Any:
    for name in names:
        if isinstance(source, Mapping):
            if name in source and source[name] is not None:
                return source[name]
        else:
            candidate = getattr(source, name, None)
            if candidate is not None:
                return candidate
    return default


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        result = int(round(float(value)))
    except (TypeError, ValueError):
        result = default
    return max(minimum, min(maximum, result))


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    result = _number(value, default)
    return max(minimum, min(maximum, result))


def _bool_value(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"true", "1", "yes", "on", "y", "是", "开启"}:
            return True
        if normalized in {"false", "0", "no", "off", "n", "否", "关闭"}:
            return False
    return bool(value)


def normalize_vsr_params(source: Any) -> NvidiaVSRParams:
    """Normalize scene frontend values without importing GPU or video libraries."""

    return NvidiaVSRParams(
        crf=_bounded_int(_value(source, "scene_var_number2", "var_number2", default=19), 19, 5, 45),
        target_fps=_bounded_float(_value(source, "scene_var_number3", "var_number3", default=30), 30.0, 16.0, 120.0),
        segment_frames=_bounded_int(
            _value(source, "scene_var_number7", "var_number7", default=300),
            300,
            60,
            600,
        ),
        upscale_factor=_bounded_float(
            _value(source, "scene_var_number8", "var_number8", default=2),
            2.0,
            1.0,
            4.0,
        ),
        interpolate=_bool_value(
            _value(source, "scene_switch_option1", "switch_option1", default=False),
            False,
        ),
        duration_limit=max(
            0.0,
            _number(
                _value(
                    source,
                    "scene_video_duration",
                    "video_duration",
                    "scene_var_number",
                    "var_number",
                    default=0,
                ),
                0.0,
            ),
        ),
        scene_detect=_bool_value(
            _value(source, "scene_detect", "scene_scene_detect", default=True),
            True,
        ),
        scene_threshold=_bounded_float(
            _value(source, "scene_threshold", "scene_scene_threshold", default=0.15),
            0.15,
            0.05,
            0.95,
        ),
    )


def is_native_nvidia_vsr_task(task: Any) -> bool:
    method = str(getattr(task, "task_method", "") or "").strip().casefold()
    if method.removeprefix("scene_") != NVIDIA_VSR_METHOD:
        return False
    backend_params = getattr(task, "params_backend", None)
    native_process = _value(backend_params, "native_process", default="")
    task_name = str(getattr(task, "task_name", "") or "").strip().casefold().replace("_", "-")
    return str(native_process or "").strip().casefold() == NATIVE_PROCESS or task_name == "nvidia-vsr"


def _path_from_value(value: Any) -> str | None:
    if isinstance(value, Mapping):
        for key in ("path", "video", "file", "original_path", "output_path", "name"):
            path = _path_from_value(value.get(key))
            if path:
                return path
        return None
    if isinstance(value, (str, os.PathLike)):
        text = os.fspath(value).strip()
        return os.path.abspath(text) if text else None
    return None


def resolve_input_video(source: Any) -> str:
    candidates = (
        "scene_original_video_path",
        "scene_video",
        "video",
        "reference_video",
    )
    for name in candidates:
        path = _path_from_value(_value(source, name, default=None))
        if path and os.path.isfile(path):
            return path
    requested = [_path_from_value(_value(source, name, default=None)) for name in candidates]
    requested = [path for path in requested if path]
    if requested:
        raise FileNotFoundError(requested[0])
    raise FileNotFoundError("No input video was provided.")


def resolve_output_dimensions(width: int, height: int, scale: float) -> tuple[int, int]:
    output_width = max(8, round(int(width) * float(scale) / 8) * 8)
    output_height = max(8, round(int(height) * float(scale) / 8) * 8)
    return output_width, output_height


def get_frame_batch_size(output_width: int, output_height: int, max_pixels_per_batch: int) -> int:
    output_pixels = max(1, int(output_width) * int(output_height))
    return max(1, int(max_pixels_per_batch) // output_pixels)


def localized_text(language: Any, english: str, chinese: str) -> str:
    normalized = str(language or "").strip().casefold()
    return chinese if normalized in {"cn", "zh", "zh-cn", "中文", "chinese"} else english


def _emit_progress(callback: ProgressCallback | None, language: Any, percentage: float, english: str, chinese: str) -> None:
    if callback is None:
        return
    callback(max(0, min(100, int(round(percentage)))), localized_text(language, english, chinese))


def _load_video_dependencies():
    try:
        import av
        import numpy as np
        import nvvfx
        import torch
    except Exception as exc:
        raise NvidiaVSRDependencyError(
            f"NVIDIA VSR requires av, numpy, nvvfx, and torch: {type(exc).__name__}: {exc}"
        ) from exc
    if not torch.cuda.is_available():
        raise NvidiaVSRDependencyError("NVIDIA VSR requires a CUDA-capable NVIDIA GPU.")
    return av, np, nvvfx, torch


def _stream_fps(stream: Any) -> float:
    for value in (getattr(stream, "average_rate", None), getattr(stream, "base_rate", None)):
        try:
            result = float(value)
        except (TypeError, ValueError):
            continue
        if result > 0:
            return result
    return 30.0


def _inspect_video(path: str, av: Any, max_frames: int | None) -> _VideoInfo:
    with av.open(path, mode="r") as container:
        if not container.streams.video:
            raise ValueError("Input video does not contain a video stream.")
        stream = container.streams.video[0]
        source_fps = _stream_fps(stream)
        known_frame_count = int(getattr(stream, "frames", 0) or 0)
        frame_count = known_frame_count
        if max_frames is not None and frame_count > 0:
            frame_count = min(frame_count, max_frames)
        has_audio = bool(container.streams.audio)
        width = int(getattr(stream, "width", 0) or 0)
        height = int(getattr(stream, "height", 0) or 0)
    if known_frame_count <= 0:
        frame_count = _count_video_frames(path, av, max_frames)
    if width <= 0 or height <= 0 or frame_count <= 0:
        raise ValueError("Input video has no readable frames.")
    return _VideoInfo(width, height, source_fps, frame_count, has_audio)


def _count_video_frames(path: str, av: Any, max_frames: int | None) -> int:
    count = 0
    with av.open(path, mode="r") as container:
        stream = container.streams.video[0]
        for _ in container.decode(stream):
            count += 1
            if max_frames is not None and count >= max_frames:
                break
    return count


def _iter_video_batches(path: str, batch_size: int, max_frames: int, av: Any, np: Any, torch: Any) -> Iterator[Any]:
    with av.open(path, mode="r") as container:
        stream = container.streams.video[0]
        frames = []
        decoded = 0
        for frame in container.decode(stream):
            if decoded >= max_frames:
                break
            frames.append(frame.to_ndarray(format="rgb24"))
            decoded += 1
            if len(frames) >= batch_size:
                yield torch.from_numpy(np.stack(frames, axis=0)).float().div_(255.0)
                frames = []
        if frames:
            yield torch.from_numpy(np.stack(frames, axis=0)).float().div_(255.0)


def _iter_video_frames(path: str, batch_size: int, max_frames: int, av: Any, np: Any, torch: Any) -> Iterator[Any]:
    del batch_size
    with av.open(path, mode="r") as container:
        stream = container.streams.video[0]
        decoded = 0
        for frame in container.decode(stream):
            if decoded >= max_frames:
                break
            image = frame.to_ndarray(format="rgb24")
            yield torch.from_numpy(image).float().div_(255.0)
            decoded += 1


def _iter_frame_batches(frame_iter: Iterator[Any], batch_size: int, torch: Any) -> Iterator[Any]:
    frames = []
    for frame in frame_iter:
        frames.append(frame)
        if len(frames) >= batch_size:
            yield torch.stack(frames, dim=0)
            frames = []
    if frames:
        yield torch.stack(frames, dim=0)


def _quality_level(nvvfx: Any, quality: str) -> Any:
    levels = {
        "LOW": nvvfx.effects.QualityLevel.LOW,
        "MEDIUM": nvvfx.effects.QualityLevel.MEDIUM,
        "HIGH": nvvfx.effects.QualityLevel.HIGH,
        "ULTRA": nvvfx.effects.QualityLevel.ULTRA,
    }
    return levels.get(str(quality or "ULTRA").upper(), nvvfx.effects.QualityLevel.ULTRA)


def _upscale_batch(sr: Any, batch: Any, torch: Any) -> Iterator[Any]:
    batch_cuda = batch.cuda().permute(0, 3, 1, 2).float().contiguous()
    if batch_cuda.numel() and batch_cuda.max().item() > 1.0:
        batch_cuda.div_(255.0)
    try:
        for index in range(batch_cuda.shape[0]):
            dlpack_out = sr.run(batch_cuda[index]).image
            frame = torch.from_dlpack(dlpack_out).movedim(0, -1).float().clamp_(0.0, 1.0).cpu()
            yield frame
            del frame
    finally:
        del batch_cuda


def _ffmpeg_executable() -> str | None:
    try:
        import imageio_ffmpeg

        path = imageio_ffmpeg.get_ffmpeg_exe()
        if path and os.path.isfile(path):
            return path
    except Exception:
        pass
    return shutil.which("ffmpeg")


def _ffmpeg_supports_encoder(ffmpeg: str, encoder: str) -> bool:
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except Exception:
        return False
    return result.returncode == 0 and encoder in result.stdout


def _select_encoder(ffmpeg: str) -> str:
    return "h264_nvenc" if _ffmpeg_supports_encoder(ffmpeg, "h264_nvenc") else "libx264"


def _fps_arg(value: float) -> str:
    numerator = max(1, int(round(float(value) * 1000)))
    return f"{numerator}/1000"


class _RawVideoWriter:
    def __init__(self, output_path: str, width: int, height: int, fps: float, crf: int, ffmpeg: str, torch: Any):
        self.output_path = output_path
        self.torch = torch
        self.process = None
        encoder = _select_encoder(ffmpeg)
        codec_args = ["-c:v", encoder]
        if encoder == "h264_nvenc":
            codec_args.extend(["-preset", "p4", "-rc", "vbr", "-cq", str(crf), "-b:v", "0"])
        else:
            codec_args.extend(["-preset", "medium", "-crf", str(crf)])
        command = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{int(width)}x{int(height)}",
            "-r",
            _fps_arg(fps),
            "-i",
            "-",
            "-an",
            *codec_args,
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            output_path,
        ]
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        self.encoder = encoder

    def write(self, frame: Any) -> None:
        if self.process is None or self.process.stdin is None:
            raise RuntimeError("Video writer is not available.")
        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr is not None else b""
            raise RuntimeError(f"ffmpeg exited early: {stderr.decode(errors='replace')}")
        if hasattr(frame, "detach"):
            image = frame.detach().clamp(0.0, 1.0).mul(255.0).byte().cpu().numpy()
        else:
            image = frame
        self.process.stdin.write(image[..., :3].tobytes())

    def close(self) -> None:
        if self.process is None:
            return
        try:
            if self.process.stdin is not None:
                self.process.stdin.close()
            stderr = self.process.stderr.read() if self.process.stderr is not None else b""
            return_code = self.process.wait()
            if return_code != 0:
                raise RuntimeError(f"ffmpeg failed with code {return_code}: {stderr.decode(errors='replace')}")
        finally:
            self.process = None

    def abort(self) -> None:
        if self.process is None:
            return
        try:
            self.process.kill()
            self.process.wait(timeout=5)
        except Exception:
            pass
        finally:
            self.process = None


def _mux_source_audio(output_path: str, source_path: str, ffmpeg: str) -> bool:
    temp_path = f"{output_path}.audio_{os.getpid()}_{int(time.time() * 1000)}.mp4"
    base_command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        output_path,
        "-i",
        source_path,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-shortest",
        temp_path,
    ]
    for audio_args in (["-c:a", "copy"], ["-c:a", "aac", "-b:a", "192k"]):
        command = base_command[:-1] + list(audio_args) + [base_command[-1]]
        try:
            result = subprocess.run(command, capture_output=True, timeout=300, check=False)
            if result.returncode == 0 and os.path.isfile(temp_path) and os.path.getsize(temp_path) > 0:
                os.replace(temp_path, output_path)
                return True
        except Exception:
            pass
        try:
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except OSError:
            pass
    return False


def _rife_model_path(project_root: str | os.PathLike[str] | None = None) -> str | None:
    root = Path(project_root) if project_root else Path(__file__).resolve().parents[1]
    candidates = [
        root / "models" / "controlnet" / "rife" / RIFE_MODEL_NAME,
        root / "models" / "rife" / RIFE_MODEL_NAME,
        root / "SimpleModels" / "controlnet" / "rife" / RIFE_MODEL_NAME,
        root / "comfy" / "models" / "controlnet" / "rife" / RIFE_MODEL_NAME,
        root / "comfy" / "custom_nodes" / "ComfyUI-VFI" / "rife" / "train_log" / RIFE_MODEL_NAME,
    ]
    try:
        import folder_paths

        models_dir = Path(folder_paths.models_dir)
        candidates[0:0] = [
            models_dir / "controlnet" / "rife" / RIFE_MODEL_NAME,
            models_dir / "rife" / RIFE_MODEL_NAME,
        ]
    except Exception:
        pass
    seen = set()
    for candidate in candidates:
        candidate = candidate.resolve()
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.is_file():
            return str(candidate)
    return None


_RIFE_CACHE: dict[str, Any] = {}


def _load_rife_model(model_path: str, torch: Any) -> Any:
    cached = _RIFE_CACHE.get(model_path)
    if cached is not None:
        return cached
    vfi_root = Path(__file__).resolve().parents[1] / "comfy" / "custom_nodes" / "ComfyUI-VFI"
    if str(vfi_root) not in sys.path:
        sys.path.insert(0, str(vfi_root))
    try:
        from rife.rife_comfyui_wrapper import RIFEWrapper
    except Exception as exc:
        raise NvidiaVSRDependencyError(f"RIFE wrapper is unavailable: {type(exc).__name__}: {exc}") from exc
    model = RIFEWrapper(model_path, use_fp16=bool(torch.cuda.is_available()))
    _RIFE_CACHE[model_path] = model
    return model


def _rife_batch(model: Any, frame0: Any, frame1: Any, factors: list[float], scale: float, batch_size: int, torch: Any) -> list[Any]:
    import torch.nn.functional as functional

    if not factors:
        return []
    height, width = int(frame0.shape[0]), int(frame0.shape[1])
    padding_unit = max(128, int(128 / scale))
    padded_height = ((height - 1) // padding_unit + 1) * padding_unit
    padded_width = ((width - 1) // padding_unit + 1) * padding_unit
    device = model.device
    dtype = torch.float16 if model.use_fp16 else torch.float32
    results = []
    with torch.inference_mode():
        for start in range(0, len(factors), max(1, batch_size)):
            current_factors = factors[start:start + max(1, batch_size)]
            batch0 = torch.empty(
                (len(current_factors), 3, padded_height, padded_width),
                device=device,
                dtype=dtype,
            )
            batch1 = torch.empty_like(batch0)
            source0 = frame0.to(device=device, dtype=dtype).permute(2, 0, 1).unsqueeze(0)
            source1 = frame1.to(device=device, dtype=dtype).permute(2, 0, 1).unsqueeze(0)
            padded0 = functional.pad(source0, (0, padded_width - width, 0, padded_height - height))[0]
            padded1 = functional.pad(source1, (0, padded_width - width, 0, padded_height - height))[0]
            batch0[:] = padded0
            batch1[:] = padded1
            interpolated = model.model.inference_batch(batch0, batch1, current_factors, scale=scale)
            for index in range(interpolated.shape[0]):
                results.append(interpolated[index, :, :height, :width].permute(1, 2, 0).float().clamp(0, 1).cpu())
            del batch0, batch1, source0, source1, padded0, padded1, interpolated
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
    return results


def _iter_interpolated_frames(
    frame_iter: Iterator[Any],
    source_count: int,
    source_fps: float,
    target_fps: float,
    rife_model: Any,
    config: NvidiaVSRParams,
    torch: Any,
    language: Any,
    progress_callback: ProgressCallback | None,
    cancel_callback: CancelCallback | None,
) -> Iterator[Any]:
    try:
        from rife.scene_detection import SceneChangeDetector, choose_scene_boundary_frame
    except ModuleNotFoundError:
        vfi_root = Path(__file__).resolve().parents[1] / "comfy" / "custom_nodes" / "ComfyUI-VFI"
        if str(vfi_root) not in sys.path:
            sys.path.insert(0, str(vfi_root))
        from rife.scene_detection import SceneChangeDetector, choose_scene_boundary_frame

    target_count = max(1, int((source_count / source_fps) * target_fps))
    target_index = 0
    output_count = 0
    scene_detector = SceneChangeDetector(config.scene_threshold) if config.scene_detect else None
    current = next(frame_iter)
    for source_index in range(source_count):
        if cancel_callback and cancel_callback():
            raise NvidiaVSRCancelled()
        next_frame = next(frame_iter) if source_index + 1 < source_count else current
        direct_frame = current
        scene_cut = scene_detector.is_cut(direct_frame, next_frame) if scene_detector is not None else False
        factors = []
        factor_order = []
        while target_index < target_count:
            source_position = target_index * source_fps / target_fps
            first_index = int(source_position)
            if first_index < source_index:
                target_index += 1
                continue
            if first_index > source_index:
                break
            factor = source_position - first_index
            factor_order.append(factor)
            if factor > 0.000001 and not scene_cut:
                factors.append(factor)
            target_index += 1
        interpolated = iter(
            _rife_batch(
                rife_model,
                direct_frame,
                next_frame,
                factors,
                config.interpolation_scale,
                config.interpolation_batch_size,
                torch,
            )
        )
        for factor in factor_order:
            if factor <= 0.000001:
                frame = direct_frame
            elif scene_cut:
                frame = choose_scene_boundary_frame(direct_frame, next_frame, factor)
            else:
                frame = next(interpolated)
            output_count += 1
            _emit_progress(
                progress_callback,
                language,
                2.0 + 34.0 * output_count / target_count,
                f"Interpolating frames {output_count}/{target_count}...",
                f"正在插帧 {output_count}/{target_count}...",
            )
            yield frame
        current = next_frame


def run_nvidia_vsr(
    input_path: str,
    output_path: str,
    params: Any = None,
    *,
    language: Any = None,
    progress_callback: ProgressCallback | None = None,
    cancel_callback: CancelCallback | None = None,
    project_root: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    """Run VSR directly in the Studio worker without creating a Comfy task."""

    config = normalize_vsr_params(params or {})
    input_path = os.path.abspath(os.fspath(input_path))
    output_path = os.path.abspath(os.fspath(output_path))
    if not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    av, np, nvvfx, torch = _load_video_dependencies()
    ffmpeg = _ffmpeg_executable()
    if ffmpeg is None:
        raise NvidiaVSRDependencyError("FFmpeg is required to encode the native VSR output.")

    max_source_frames = None
    info = _inspect_video(input_path, av, None)
    if config.duration_limit > 0:
        max_source_frames = max(1, int(config.duration_limit * info.source_fps))
        if max_source_frames < info.frame_count:
            info = _inspect_video(input_path, av, max_source_frames)
    output_width, output_height = resolve_output_dimensions(info.width, info.height, config.upscale_factor)
    output_fps = config.target_fps if config.interpolate else info.source_fps
    should_interpolate = config.interpolate and abs(output_fps - info.source_fps) >= 0.01
    if should_interpolate:
        rife_path = _rife_model_path(project_root)
        if rife_path is None:
            raise NvidiaVSRDependencyError(
                f"RIFE model '{RIFE_MODEL_NAME}' was not found locally; automatic download is disabled."
            )
        _emit_progress(progress_callback, language, 1, "Loading RIFE model...", "正在加载 RIFE 模型...")
        rife_model = _load_rife_model(rife_path, torch)
    else:
        rife_model = None

    frame_batch_size = min(
        config.segment_frames,
        get_frame_batch_size(output_width, output_height, config.max_pixels_per_batch),
    )
    writer = _RawVideoWriter(output_path, output_width, output_height, output_fps, config.crf, ffmpeg, torch)
    writer_closed = False
    success = False
    processed_source_frames = 0
    processed_vsr_frames = 0
    output_frames = 0

    def source_frames() -> Iterator[Any]:
        nonlocal processed_source_frames
        for frame in _iter_video_frames(
            input_path,
            frame_batch_size,
            info.frame_count,
            av,
            np,
            torch,
        ):
            processed_source_frames += 1
            yield frame

    def upscaled_frames(frame_iter: Iterator[Any], input_frame_count: int) -> Iterator[Any]:
        nonlocal processed_vsr_frames
        with nvvfx.VideoSuperRes(_quality_level(nvvfx, config.quality)) as sr:
            sr.output_width = output_width
            sr.output_height = output_height
            sr.load()
            for batch in _iter_frame_batches(frame_iter, frame_batch_size, torch):
                if cancel_callback and cancel_callback():
                    raise NvidiaVSRCancelled()
                for frame in _upscale_batch(sr, batch, torch):
                    processed_vsr_frames += 1
                    _emit_progress(
                        progress_callback,
                        language,
                        (38.0 if should_interpolate else 0.0)
                        + (58.0 * processed_vsr_frames / max(1, input_frame_count)),
                        f"Upscaling video {processed_vsr_frames}/{input_frame_count}...",
                        f"正在放大视频 {processed_vsr_frames}/{input_frame_count}...",
                    )
                    yield frame
                del batch

    try:
        _emit_progress(progress_callback, language, 0, "Loading NVIDIA VSR...", "正在加载 NVIDIA VSR...")
        source_frame_iter = source_frames()
        if should_interpolate:
            interpolated_frames = _iter_interpolated_frames(
                source_frame_iter,
                info.frame_count,
                info.source_fps,
                output_fps,
                rife_model,
                config,
                torch,
                language,
                progress_callback,
                cancel_callback,
            )
            frames = upscaled_frames(
                interpolated_frames,
                max(1, int((info.frame_count / info.source_fps) * output_fps)),
            )
        else:
            frames = upscaled_frames(source_frame_iter, info.frame_count)
        for frame in frames:
            if cancel_callback and cancel_callback():
                raise NvidiaVSRCancelled()
            writer.write(frame)
            output_frames += 1
        writer.close()
        writer_closed = True
        if info.has_audio:
            _emit_progress(progress_callback, language, 98, "Muxing source audio...", "正在复用源音频...")
            audio_muxed = _mux_source_audio(output_path, input_path, ffmpeg)
        else:
            audio_muxed = False
        success = True
        _emit_progress(progress_callback, language, 100, "NVIDIA VSR finished", "NVIDIA VSR 已完成")
        return {
            "output_path": output_path,
            "source_fps": info.source_fps,
            "output_fps": output_fps,
            "source_frames": processed_source_frames,
            "output_frames": output_frames,
            "source_width": info.width,
            "source_height": info.height,
            "output_width": output_width,
            "output_height": output_height,
            "audio_muxed": audio_muxed,
            "encoder": writer.encoder,
        }
    finally:
        if not writer_closed:
            writer.abort()
        if not success:
            try:
                if os.path.exists(output_path):
                    os.remove(output_path)
            except OSError:
                pass
