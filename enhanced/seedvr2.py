"""Studio-native SeedVR2 video upscaling, using the installed inference core."""

from __future__ import annotations

import importlib
import math
import operator
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, replace
from itertools import chain
from pathlib import Path
from types import ModuleType
from typing import Any, Callable, Iterator

from enhanced import nvidia_vsr, seedvr2_memory


SEEDVR2_METHOD = "seedvr2"
DEFAULT_DIT = "seedvr2_ema_3b_fp16.safetensors"
DEFAULT_VAE = "ema_vae_fp16.safetensors"
DEFAULT_BATCH_SIZE = 17
ProgressCallback = Callable[[int, str, Any], None]
CancelCallback = Callable[[], bool]


class SeedVR2Cancelled(RuntimeError):
    pass


@dataclass(frozen=True)
class SeedVR2Params:
    dit_model: str = DEFAULT_DIT
    vae_model: str = DEFAULT_VAE
    resolution: int = 1080
    batch_size: int = DEFAULT_BATCH_SIZE
    overlap: int = 1
    crf: int = 19
    duration_limit: float = 0
    tiled_vae: bool = True
    seed: int = 42


def _value(source: Any, *names: str, default: Any = None) -> Any:
    value = nvidia_vsr._value(source, *names, default=None)
    if value is None:
        value = nvidia_vsr._value(getattr(source, "params_backend", {}), *names, default=default)
    return value


def _integer(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        value = float(value)
        result = int(round(value)) if math.isfinite(value) else default
    except (TypeError, ValueError, OverflowError):
        result = default
    return max(minimum, min(maximum, result))


def _model_name(value: Any, default: str) -> str:
    text = str(value or "").strip()
    return default if text in {"", "None", "Default (model)", "auto"} else text


def _normalize_seed(value: Any) -> int:
    try:
        integer = int(value) if isinstance(value, str) else operator.index(value)
    except (TypeError, ValueError, OverflowError):
        return _integer(value, 42, 0, 2**64 - 1)
    return max(0, min(2**64 - 1, integer))


def normalize_seedvr2_params(source: Any) -> SeedVR2Params:
    batch_size = _integer(_value(source, "scene_var_number9", "batch_size"), DEFAULT_BATCH_SIZE, 5, 33)
    batch_size = 1 + 4 * ((batch_size - 1) // 4)
    return SeedVR2Params(
        dit_model=_model_name(_value(source, "base_model_name", "base_model", "dit_model"), DEFAULT_DIT),
        vae_model=_model_name(_value(source, "vae_name", "vae", "vae_model"), DEFAULT_VAE),
        resolution=2 * (_integer(_value(source, "scene_var_number", "resolution"), 1080, 16, 4096) // 2),
        batch_size=batch_size,
        overlap=_integer(_value(source, "scene_var_number10", "overlap"), 1, 0, min(4, batch_size - 1)),
        crf=_integer(_value(source, "scene_var_number2", "crf"), 19, 5, 45),
        duration_limit=_integer(_value(source, "scene_var_number8", "duration_limit"), 0, 0, 3600),
        tiled_vae=nvidia_vsr._bool_value(_value(source, "scene_switch_option1", "tiled_vae", default=True), True),
        seed=_normalize_seed(_value(source, "seed")),
    )


def list_local_models(model_dirs: list[str]) -> dict[str, list[str]]:
    """Only enumerate local files; never add registry entries or download models."""
    models: dict[str, list[str]] = {"dit": [], "vae": []}
    for directory in model_dirs:
        root = Path(directory)
        if not root.is_dir():
            continue
        for current, directories, files in os.walk(root):
            directories[:] = sorted(name for name in directories if not name.startswith("."))
            for filename in sorted(files):
                path = Path(current, filename)
                if path.suffix.lower() not in {".safetensors", ".gguf"}:
                    continue
                role = "vae" if "vae" in path.stem.lower() else "dit"
                if role == "vae" and path.suffix.lower() != ".safetensors":
                    continue
                name = str(path.relative_to(root))
                if name not in models[role]:
                    models[role].append(name)
    return models


def resolve_model_path(name: str, model_dirs: list[str]) -> Path:
    path = Path(name.replace("\\", os.sep).replace("/", os.sep)).expanduser()
    if path.is_absolute():
        candidates = [path]
    else:
        if ".." in path.parts:
            raise ValueError(f"Invalid SeedVR2 model path: {name}")
        candidates = [Path(directory) / path for directory in model_dirs]
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f"SeedVR2 model not found locally: {name}")


def _check_cancel(cancel_callback: CancelCallback | None) -> None:
    if cancel_callback and cancel_callback():
        raise SeedVR2Cancelled("SeedVR2 stopped by user.")


def _load_video_dependencies():
    import av
    import numpy as np
    import torch

    return av, np, torch


def _inspect_source_video(path: str, av: Any, duration_limit: float, cancel_callback, report):
    with av.open(path, mode="r") as container:
        if not container.streams.video:
            raise ValueError("Input video does not contain a video stream.")
        stream = container.streams.video[0]
        fps = nvidia_vsr._stream_fps(stream)
        width, height = int(stream.width or 0), int(stream.height or 0)
        has_audio = bool(container.streams.audio)
        max_frames = max(1, int(duration_limit * fps)) if duration_limit else None
        frame_count = int(stream.frames or 0)
        if frame_count > 0:
            frame_count = min(frame_count, max_frames) if max_frames is not None else frame_count
        else:
            last_report = time.monotonic()
            for _ in container.decode(stream):
                _check_cancel(cancel_callback)
                frame_count += 1
                if max_frames is not None and frame_count >= max_frames:
                    break
                if time.monotonic() - last_report >= 0.5:
                    report(
                        0, f"Reading input video: {frame_count} frames checked...",
                        f"正在读取输入视频：已检查 {frame_count} 帧...",
                    )
                    last_report = time.monotonic()
        if width <= 0 or height <= 0 or frame_count <= 0:
            raise ValueError("Input video has no readable frames.")
        return nvidia_vsr._VideoInfo(width, height, fps, frame_count, has_audio)


def _load_core(project_root: Path) -> dict[str, Any]:
    # A private package name avoids colliding with custom nodes' generic `src`.
    root = project_root / "comfy" / "custom_nodes" / "ComfyUI-SeedVR2_VideoUpscaler"
    if not (root / "src" / "core" / "generation_phases.py").is_file():
        raise RuntimeError("The installed SeedVR2 inference core is unavailable.")
    package_name = "_simpai_native_seedvr2"
    if package_name not in sys.modules:
        package = ModuleType(package_name)
        package.__path__ = [str(root)]
        sys.modules[package_name] = package
    comfy_root = str(project_root / "comfy")
    if comfy_root not in sys.path:
        sys.path.append(comfy_root)
    return {
        name: importlib.import_module(f"{package_name}.src.{module}")
        for name, module in {
            "utils": "core.generation_utils",
            "phases": "core.generation_phases",
            "memory": "optimization.memory_manager",
            "blockswap": "optimization.blockswap",
            "loader": "core.model_loader",
            "debug": "utils.debug",
        }.items()
    }


class _SeedVR2Runtime:
    def __init__(self, config: SeedVR2Params, dit_path: Path, vae_path: Path, project_root: Path, cancel_callback):
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("SeedVR2 requires a CUDA-capable GPU.")
        self.core = _load_core(project_root)
        self.config = config
        self.cancel_callback = cancel_callback
        self.debug = self.core["debug"].Debug(enabled=False)
        self.runner = None
        self.ctx = None
        self.cache_context = None
        self.memory_policy = None
        self.device = f"cuda:{torch.cuda.current_device()}"
        try:
            for module_name in ("ldm_patched.modules.model_management", "comfy.model_management"):
                management = sys.modules.get(module_name)
                if management is not None:
                    management.unload_all_models()
            self.ctx = self._new_context()
            self.runner, self.cache_context = self.core["utils"].prepare_runner(
                dit_model=str(dit_path),
                vae_model=str(vae_path),
                model_dir=str(dit_path.parent),
                debug=self.debug,
                ctx=self.ctx,
                dit_cache=False,
                vae_cache=False,
                encode_tiled=config.tiled_vae,
                encode_tile_size=(512, 512),
                encode_tile_overlap=(64, 64),
                decode_tiled=config.tiled_vae,
                decode_tile_size=(512, 512),
                decode_tile_overlap=(64, 64),
                attention_mode="sdpa",
            )
            # Load on CPU before planning so custom/quantized models use real weight sizes.
            for role in ("vae", "dit"):
                _check_cancel(cancel_callback)
                self.core["loader"].materialize_model(
                    self.runner, role, torch.device("cpu"), self.runner.config, self.debug,
                )
            self.memory_policy = seedvr2_memory.SeedVR2MemoryPolicy(
                self.runner, self.core, self.debug, self.device, config.batch_size,
            )
        except BaseException:
            self.close()
            raise

    def _new_context(self):
        ctx = self.core["utils"].setup_generation_context(
            dit_device=self.device,
            vae_device=self.device,
            dit_offload_device="cpu",
            vae_offload_device="cpu",
            tensor_offload_device="cpu",
            debug=self.debug,
        )
        ctx["interrupt_fn"] = lambda: _check_cancel(self.cancel_callback)
        return ctx

    @property
    def batch_size(self):
        return self.config.batch_size

    def _set_batch_size(self, frames):
        if frames < self.config.batch_size:
            self.config = replace(self.config, batch_size=frames)
        if self.memory_policy is not None:
            self.memory_policy.frames = self.config.batch_size

    def prepare_video(self, first_frame):
        ctx = self._new_context()
        try:
            _, info = self.core["utils"].compute_generation_info(
                ctx, first_frame.unsqueeze(0), resolution=self.config.resolution,
                batch_size=self.config.batch_size, uniform_batch_size=True,
                seed=self.config.seed, debug=self.debug,
            )
            if self.memory_policy is not None:
                self._set_batch_size(self.memory_policy.select_window(info))
        finally:
            ctx.clear()
            self.debug.clear_history()

    def process(self, images: Any, phase_callback: Callable[[float, str], None]):
        import torch

        _check_cancel(self.cancel_callback)
        utils, phases = self.core["utils"], self.core["phases"]

        def progress(current, total, _frames, phase):
            _check_cancel(self.cancel_callback)
            phase = phase.split(" (", 1)[0]
            offset, weight = {
                "Phase 1: Encoding": (0.0, 0.20),
                "Phase 2: Upscaling": (0.20, 0.35),
                "Phase 3: Decoding": (0.55, 0.35),
                "Phase 4: Post-processing": (0.90, 0.10),
            }.get(phase, (0.0, 0.0))
            phase_callback(offset + weight * min(1.0, current / max(1, total)), phase)

        # At most one full-offload retry plus 33 -> 17 -> 9 -> 5 frame reductions.
        for attempt in range(5):
            _check_cancel(self.cancel_callback)
            config = self.config
            self.ctx = self._new_context()
            self.ctx["cache_context"] = self.cache_context
            prepared_images = None
            next_batch = config.batch_size
            try:
                prepared_images, info = utils.compute_generation_info(
                    self.ctx, images, resolution=config.resolution, batch_size=config.batch_size,
                    uniform_batch_size=True, seed=config.seed, debug=self.debug,
                )
                if self.memory_policy is not None:
                    self._set_batch_size(self.memory_policy.select_window(info))
                    if self.config.batch_size < config.batch_size:
                        phase_callback(0.0, f"Window reduced: {self.config.batch_size}")
                        config = self.config
                    self.memory_policy.begin_window(info, self.ctx)
                # A retry may subdivide an already-read larger window; the core blends its overlaps.
                temporal_overlap = config.overlap if len(images) > config.batch_size else 0
                phase_callback(0.0, "Phase 1: Encoding")
                with torch.inference_mode():
                    self.ctx = phases.encode_all_batches(
                        self.runner, ctx=self.ctx, images=prepared_images, debug=self.debug,
                        batch_size=config.batch_size, uniform_batch_size=True, seed=config.seed,
                        progress_callback=progress, temporal_overlap=temporal_overlap, resolution=config.resolution,
                        color_correction="lab",
                    )
                    phase_callback(0.20, "Phase 2: Upscaling")
                    self.ctx = phases.upscale_all_batches(
                        self.runner, ctx=self.ctx, debug=self.debug, progress_callback=progress,
                        seed=config.seed, cache_model=True,
                    )
                    phase_callback(0.55, "Phase 3: Decoding")
                    self.ctx = phases.decode_all_batches(
                        self.runner, ctx=self.ctx, debug=self.debug, progress_callback=progress,
                        cache_model=True,
                    )
                    phase_callback(0.90, "Phase 4: Post-processing")
                    self.ctx = phases.postprocess_all_batches(
                        ctx=self.ctx, debug=self.debug, progress_callback=progress,
                        color_correction="lab", temporal_overlap=temporal_overlap, batch_size=config.batch_size,
                    )
                    return self.ctx["final_video"].detach().cpu()
            except torch.cuda.OutOfMemoryError:
                if attempt == 4 or self.memory_policy is None:
                    raise
                already_offloaded = self.memory_policy.force_offload or getattr(
                    self.memory_policy, "fully_offloaded", False,
                )
                if already_offloaded:
                    if config.batch_size <= 5:
                        raise
                    next_batch = seedvr2_memory.smaller_temporal_window(config.batch_size)
            finally:
                self.core["memory"].cleanup_text_embeddings(self.ctx, self.debug)
                self.ctx.clear()
                self.debug.clear_history()
            # Retry only after exception frames and window tensors have been released.
            del prepared_images
            _check_cancel(self.cancel_callback)
            self.memory_policy.recover_from_oom()
            if next_batch < self.config.batch_size:
                self._set_batch_size(next_batch)
                phase_callback(0.0, f"Window reduced: {self.config.batch_size}")
            phase_callback(0.0, "Memory retry")

    def close(self):
        if self.ctx:
            self.core["memory"].cleanup_text_embeddings(self.ctx, self.debug)
            self.ctx.clear()
        if self.runner is not None:
            try:
                try:
                    if self.memory_policy is not None:
                        self.memory_policy.offload()
                finally:
                    self.core["memory"].complete_cleanup(
                        self.runner, debug=self.debug, dit_cache=False, vae_cache=False,
                    )
            finally:
                self.runner = None
                self.memory_policy = None


def _iter_windows(frames: Iterator[Any], size: int | Callable[[], int], overlap: int, torch: Any):
    window = []
    start = 0
    while True:
        current_size = size() if callable(size) else size
        previous_count = len(window)
        for _ in range(current_size - previous_count):
            try:
                window.append(next(frames))
            except StopIteration:
                break
        if len(window) == previous_count:
            return
        yield start, torch.stack(window)
        if len(window) < current_size:
            return
        start += len(window) - overlap
        window = window[-overlap:] if overlap else []


def _blend_overlap(previous: Any, current: Any, torch: Any):
    count = len(previous)
    with torch.inference_mode():
        weights = torch.linspace(0, 1, count + 2, dtype=current.dtype, device=current.device)[1:-1]
        weights = weights.reshape(count, 1, 1, 1)
        current[:count] = previous * (1 - weights) + current[:count] * weights
    return current


def _output_preview(frame: Any):
    from PIL import Image

    array = frame.detach().float().clamp(0, 1).mul(255).byte().cpu().numpy()
    image = Image.fromarray(array[..., :3])
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    return image


def _finish_writer(writer: Any, cancel_callback: CancelCallback | None) -> None:
    process = writer.process
    if process is None:
        return
    if process.stdin is not None:
        process.stdin.close()
        process.stdin = None
    deadline = time.monotonic() + 120
    try:
        while True:
            _check_cancel(cancel_callback)
            if time.monotonic() >= deadline:
                raise TimeoutError("SeedVR2 video encoding timed out.")
            try:
                _, stderr = process.communicate(timeout=0.2)
                break
            except subprocess.TimeoutExpired:
                continue
        if process.returncode != 0:
            raise RuntimeError(f"Video encoding failed: {(stderr or b'').decode(errors='replace')}")
    except BaseException:
        writer.abort()
        raise
    writer.process = None


def _mux_audio(output_path: str, input_path: str, ffmpeg: str, cancel_callback, *, duration: float | None = None) -> None:
    temporary = output_path + ".seedvr2-audio.mp4"
    try:
        for audio_args in (["-c:a", "copy"], ["-c:a", "aac", "-b:a", "192k"]):
            _check_cancel(cancel_callback)
            command = [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", output_path]
            # Limit the audio input; `-shortest` can discard the last video frame.
            if duration is not None:
                command.extend(["-t", f"{duration:.9f}"])
            command.extend([
                "-i", input_path, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                *audio_args, "-movflags", "+faststart", temporary,
            ])
            with tempfile.TemporaryFile() as error_log:
                process = subprocess.Popen(
                    command, stdout=subprocess.DEVNULL, stderr=error_log,
                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                )
                try:
                    deadline = time.monotonic() + 300
                    while process.poll() is None:
                        _check_cancel(cancel_callback)
                        if time.monotonic() >= deadline:
                            raise TimeoutError("SeedVR2 audio muxing timed out.")
                        time.sleep(0.1)
                    if process.returncode == 0 and os.path.isfile(temporary) and os.path.getsize(temporary) > 0:
                        os.replace(temporary, output_path)
                        return
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait(timeout=5)
        raise RuntimeError("Could not preserve the source audio.")
    finally:
        if os.path.isfile(temporary):
            os.remove(temporary)


def _verify_output(path: str, av: Any, frame_count: int, has_audio: bool) -> None:
    with av.open(path, mode="r") as container:
        if not container.streams.video or int(container.streams.video[0].frames or 0) != frame_count:
            raise RuntimeError("SeedVR2 saved video frame count does not match the source.")
        if has_audio and not container.streams.audio:
            raise RuntimeError("SeedVR2 saved video is missing the source audio.")


def run_seedvr2(
    input_path: str,
    output_path: str,
    params: Any = None,
    *,
    language: Any = None,
    progress_callback: ProgressCallback | None = None,
    cancel_callback: CancelCallback | None = None,
    preview_enabled: bool = True,
    model_dirs: list[str] | None = None,
    project_root: str | None = None,
) -> dict[str, Any]:
    config = normalize_seedvr2_params(params or {})
    root = Path(project_root) if project_root else Path(__file__).resolve().parents[1]
    if model_dirs is None:
        from modules import config as studio_config

        model_dirs = list(studio_config.paths_SEEDVR2)
    last_preview = None
    last_percentage = 0

    def report(percentage: float, english: str, chinese: str):
        nonlocal last_percentage
        last_percentage = max(last_percentage, min(100, int(percentage)))
        if progress_callback is not None:
            progress_callback(last_percentage, nvidia_vsr.localized_text(language, english, chinese), last_preview)

    _check_cancel(cancel_callback)
    input_path, output_path = os.path.abspath(input_path), os.path.abspath(output_path)
    if os.path.normcase(input_path) == os.path.normcase(output_path):
        raise ValueError("SeedVR2 input and output paths must be different.")
    if not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)
    if os.path.exists(output_path):
        raise FileExistsError(output_path)
    dit_path = resolve_model_path(config.dit_model, model_dirs)
    vae_path = resolve_model_path(config.vae_model, model_dirs)
    if dit_path.suffix.lower() not in {".safetensors", ".gguf"} or not any(
        family in dit_path.name.lower() for family in ("3b", "7b")
    ):
        raise ValueError("SeedVR2 DiT requires a 3b/7b model filename and safetensors or GGUF format.")
    if vae_path.suffix.lower() != ".safetensors":
        raise ValueError("SeedVR2 VAE requires safetensors format.")
    av, np, torch = _load_video_dependencies()
    ffmpeg = nvidia_vsr._ffmpeg_executable()
    if ffmpeg is None:
        raise RuntimeError("FFmpeg is required for SeedVR2 video output.")
    report(0, "Reading input video...", "正在读取输入视频...")
    info = _inspect_source_video(input_path, av, config.duration_limit, cancel_callback, report)
    frame_count = info.frame_count
    if config.duration_limit:
        frame_count = min(frame_count, max(1, int(config.duration_limit * info.source_fps)))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    report(0, "Loading SeedVR2 models...", "正在加载 SeedVR2 模型...")
    runtime = writer = None
    pending = None
    output_frames = source_frames = 0
    success = False
    try:
        runtime = _SeedVR2Runtime(config, dit_path, vae_path, root, cancel_callback)

        def source():
            for frame in nvidia_vsr._iter_video_frames(input_path, config.batch_size, frame_count, av, np, torch):
                _check_cancel(cancel_callback)
                yield frame

        video_frames = iter(source())
        first_frame = next(video_frames, None)
        if first_frame is None:
            raise ValueError("Input video has no readable frames.")
        prepare_video = getattr(runtime, "prepare_video", None)
        if callable(prepare_video):
            prepare_video(first_frame)
        initial_batch_size = getattr(runtime, "batch_size", config.batch_size)
        if initial_batch_size < config.batch_size:
            report(
                1, f"SeedVR2 temporal window: {config.batch_size} -> {initial_batch_size} frames (VRAM limit)",
                f"SeedVR2 时间窗口：{config.batch_size} -> {initial_batch_size} 帧（显存限制）",
            )
        window_size = lambda: getattr(runtime, "batch_size", config.batch_size)
        window_count = 0
        for start, images in _iter_windows(chain((first_frame,), video_frames), window_size, config.overlap, torch):
            _check_cancel(cancel_callback)
            new_frames = start + len(images) - source_frames
            window_end = start + len(images)

            def phase_progress(fraction, phase):
                stages = {
                    "Phase 1: Encoding": ("VAE encoding", "VAE 编码"),
                    "Phase 2: Upscaling": ("Upscaling", "放大"),
                    "Phase 3: Decoding": ("VAE decoding", "VAE 解码"),
                    "Phase 4: Post-processing": ("Color correction", "色彩校正"),
                    "Memory retry": ("Retrying with CPU offload", "增加 CPU 卸载并重试当前窗口"),
                }
                if phase.startswith("Window reduced: "):
                    frames = phase.split(": ", 1)[1]
                    stage_en, stage_cn = (
                        f"Temporal window reduced to {frames} frames", f"时间窗口缩小为 {frames} 帧",
                    )
                else:
                    stage_en, stage_cn = stages[phase]
                report(
                    2 + 92 * (source_frames + new_frames * fraction) / frame_count,
                    f"SeedVR2: {stage_en}, frames {start + 1}-{window_end}/{frame_count}",
                    f"SeedVR2：{stage_cn}，帧 {start + 1}-{window_end}/{frame_count}",
                )

            output = runtime.process(images, phase_progress)
            del images
            _check_cancel(cancel_callback)
            if output.ndim != 4 or len(output) != window_end - start or output.shape[-1] != 3:
                raise RuntimeError("SeedVR2 returned an invalid frame batch.")
            if writer is None:
                writer = nvidia_vsr._RawVideoWriter(
                    output_path, output.shape[2], output.shape[1], info.source_fps, config.crf, ffmpeg, torch,
                )
            if pending is not None:
                output = _blend_overlap(pending, output, torch)
            keep = min(config.overlap, len(output))
            end = len(output) - keep
            for frame in output[:end]:
                _check_cancel(cancel_callback)
                writer.write(frame)
                output_frames += 1
            pending = output[-keep:].clone() if keep else None
            source_frames = window_end
            window_count += 1
            if preview_enabled and end:
                last_preview = _output_preview(output[end - 1])
            report(
                2 + 92 * source_frames / frame_count,
                f"SeedVR2: {output_frames}/{frame_count} output frames",
                f"SeedVR2：已输出 {output_frames}/{frame_count} 帧",
            )
            del output
        if pending is not None:
            for frame in pending:
                _check_cancel(cancel_callback)
                writer.write(frame)
                output_frames += 1
            if preview_enabled:
                last_preview = _output_preview(pending[-1])
            del pending
        if writer is None or source_frames != frame_count or output_frames != frame_count:
            raise RuntimeError(f"SeedVR2 frame count mismatch: {output_frames}/{frame_count}.")
        effective_batch_size = getattr(runtime, "batch_size", config.batch_size)
        runtime.close()
        runtime = None
        report(96, "Saving SeedVR2 video...", "正在保存 SeedVR2 视频...")
        _finish_writer(writer, cancel_callback)
        _check_cancel(cancel_callback)
        if info.has_audio:
            report(98, "Preserving source audio...", "正在保留源音轨...")
            _mux_audio(output_path, input_path, ffmpeg, cancel_callback, duration=output_frames / info.source_fps)
        _check_cancel(cancel_callback)
        _verify_output(output_path, av, output_frames, info.has_audio)
        result = {
            "output_path": output_path, "source_frames": source_frames, "output_frames": output_frames,
            "source_fps": info.source_fps, "output_fps": info.source_fps,
            "output_width": writer.width, "output_height": writer.height,
            "audio_muxed": info.has_audio, "encoder": writer.encoder,
            "dit_model": config.dit_model, "vae_model": config.vae_model,
            "requested_batch_size": config.batch_size, "initial_batch_size": initial_batch_size,
            "effective_batch_size": effective_batch_size, "window_count": window_count,
        }
        report(100, "SeedVR2 finished", "SeedVR2 已完成")
        success = True
        return result
    finally:
        try:
            if writer is not None:
                writer.abort()
        finally:
            try:
                if runtime is not None:
                    runtime.close()
            finally:
                if not success and os.path.isfile(output_path):
                    os.remove(output_path)
