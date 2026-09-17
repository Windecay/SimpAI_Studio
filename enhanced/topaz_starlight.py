"""Studio-native Topaz Starlight video enhancement through Neuroserver."""

from __future__ import annotations

import json
import logging
import math
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from collections.abc import Mapping
from dataclasses import dataclass, replace
from fractions import Fraction
from pathlib import Path
from typing import Any, Callable


TOPAZ_STARLIGHT_METHOD = "topaz_starlight"
NATIVE_PROCESS = "studio"
TOPAZ_MODEL_ID = "slp-26"
# SLP-26 resources are installed in the topaz_engine model store.
TOPAZ_MODEL_DIR_NAME = "slp26"
NEUROSERVER_DIR_NAME = "neuroserver171"
FFMPEG_DIR_NAME = "bin171"
DEFAULT_FFMPEG_ENCODING = (
    "-c:v h264_nvenc -profile:v high -pix_fmt yuv420p -g 30 "
    "-preset p7 -tune hq -rc constqp -qp 18 -rc-lookahead 20 "
    "-spatial_aq 1 -aq-strength 15 -b:v 0 -bf 0"
)
TOPAZ_GPU_MEMORY_HEADROOM_GIB = 1.0
TOPAZ_GPU_MEMORY_FRACTION = 0.9
TOPAZ_GPU_MEMORY_FALLBACK_GIB = 14.0
TOPAZ_GPU_MEMORY_MIN_GIB = 4.0
TOPAZ_GPU_MEMORY_MAX_GIB = 64.0
TOPAZ_ENGINE_PROGRESS_MAX = 93.0
TOPAZ_ENGINE_FINALIZING_PROGRESS = 94.0
TOPAZ_ENGINE_FINALIZING_THRESHOLD = 99.5
TOPAZ_PROGRESS_HEARTBEAT_SECONDS = 2.0
TOPAZ_SEGMENT_REFERENCE_FRAMES = 96
TOPAZ_SEGMENT_REFERENCE_GPU_MEM_GIB = 14.0
TOPAZ_SEGMENT_REFERENCE_OUTPUT_PIXELS = 2560 * 1440
TOPAZ_SEGMENT_MIN_FRAMES = 24
TOPAZ_SEGMENT_MAX_FRAMES = 240
logger = logging.getLogger(__name__)
_TOPAZ_EXECUTION_LOCK = threading.Lock()

ProgressCallback = Callable[[int, str], None]
CancelCallback = Callable[[], bool]


class TopazStarlightCancelled(RuntimeError):
    """Raised when the Studio task is stopped by the user."""


class TopazStarlightDependencyError(RuntimeError):
    """Raised when the local Neuroserver package or model is unavailable."""


@dataclass(frozen=True)
class TopazStarlightParams:
    upscale_factor: float = 2.0
    enhancement_strength: float = 1.0
    max_gpu_mem: float | None = None
    duration_limit: float = 0.0
    segment_frames: int | None = None


@dataclass(frozen=True)
class TopazEngineConfig:
    package_root: str
    server_path: str
    ffmpeg_path: str
    ffprobe_path: str
    model_store: str


@dataclass(frozen=True)
class VideoInfo:
    width: int
    height: int
    fps: float
    frames: int
    has_audio: bool


@dataclass(frozen=True)
class TopazFrameSegment:
    index: int
    start_frame: int
    end_frame: int

    @property
    def frame_count(self) -> int:
        return max(0, self.end_frame - self.start_frame)


def _value(source: Any, *names: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        for name in names:
            if name in source and source[name] is not None:
                return source[name]
        return default
    for name in names:
        candidate = getattr(source, name, None)
        if candidate is not None:
            return candidate
    return default


def _source_values(source: Any) -> tuple[Any, ...]:
    values = [source]
    if isinstance(source, Mapping):
        nested = source.get("params_backend")
    else:
        nested = getattr(source, "params_backend", None)
    if nested is not None and nested is not source:
        values.append(nested)
    return tuple(values)


def _first_value(source: Any, *names: str, default: Any = None) -> Any:
    for candidate_source in _source_values(source):
        value = _value(candidate_source, *names, default=None)
        if value is not None:
            return value
    return default


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _bounded_float(value: Any, default: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, _number(value, default)))


def _bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        number = int(default)
    return max(int(minimum), min(int(maximum), number))


def _optional_segment_frames(value: Any) -> int | None:
    if value is None:
        return None
    try:
        number = int(round(float(value)))
    except (TypeError, ValueError, OverflowError):
        return None
    if number <= 0:
        return None
    return _bounded_int(
        number,
        TOPAZ_SEGMENT_REFERENCE_FRAMES,
        TOPAZ_SEGMENT_MIN_FRAMES,
        TOPAZ_SEGMENT_MAX_FRAMES,
    )


def _format_number(value: float) -> str:
    text = f"{float(value):.6f}".rstrip("0").rstrip(".")
    return text or "0"


def normalize_topaz_starlight_params(source: Any) -> TopazStarlightParams:
    """Normalize Scene values without importing video or GPU dependencies."""

    requested_max_gpu_mem = _first_value(
        source,
        "topaz_max_gpu_mem",
        "max_gpu_mem",
        default=None,
    )
    requested_segment_frames = _first_value(
        source,
        "topaz_segment_frames",
        "segment_frames",
        default=None,
    )
    return TopazStarlightParams(
        upscale_factor=_bounded_float(
            _first_value(
                source,
                "topaz_upscale_factor",
                "upscale_factor",
                "scene_var_number",
                "var_number",
                "scene_var_number2",
                "var_number2",
                "scene_var_number8",
                "var_number8",
                default=2.0,
            ),
            2.0,
            1.0,
            4.0,
        ),
        enhancement_strength=_bounded_float(
            _first_value(
                source,
                "topaz_enhancement_strength",
                "enhancement_strength",
                "scene_var_number3",
                "var_number3",
                default=1.0,
            ),
            1.0,
            0.5,
            1.5,
        ),
        max_gpu_mem=_bounded_float(
            requested_max_gpu_mem,
            TOPAZ_GPU_MEMORY_FALLBACK_GIB,
            TOPAZ_GPU_MEMORY_MIN_GIB,
            TOPAZ_GPU_MEMORY_MAX_GIB,
        ) if requested_max_gpu_mem is not None else None,
        duration_limit=max(
            0.0,
            _number(
                _first_value(
                    source,
                    "topaz_duration_limit",
                    "duration_limit",
                    "scene_video_duration",
                    "video_duration",
                    default=0.0,
                ),
                0.0,
            ),
        ),
        segment_frames=_optional_segment_frames(requested_segment_frames),
    )


def _query_available_gpu_memory_gib() -> tuple[float | None, float | None]:
    try:
        from ldm_patched.modules import model_management

        device = model_management.get_torch_device()
        if getattr(device, "type", None) != "cuda":
            raise RuntimeError(f"Topaz GPU device is unavailable: {device}")
        free_bytes = model_management.get_free_memory(device)
        total_bytes = model_management.get_total_memory(device)
        return (
            max(0.0, float(free_bytes) / (1024**3)),
            max(0.0, float(total_bytes) / (1024**3)),
        )
    except Exception as exc:
        logger.debug("Topaz primary GPU memory query failed: %s", exc)

    try:
        import torch

        if not torch.cuda.is_available():
            return None, None
        free_bytes, total_bytes = torch.cuda.mem_get_info()
        return (
            max(0.0, float(free_bytes) / (1024**3)),
            max(0.0, float(total_bytes) / (1024**3)),
        )
    except Exception as exc:
        logger.debug("Topaz fallback GPU memory query failed: %s", exc)
        return None, None


def resolve_topaz_max_gpu_mem_gib(requested: Any = None) -> float:
    if requested is not None:
        return _bounded_float(
            requested,
            TOPAZ_GPU_MEMORY_FALLBACK_GIB,
            TOPAZ_GPU_MEMORY_MIN_GIB,
            TOPAZ_GPU_MEMORY_MAX_GIB,
        )

    free_gib, total_gib = _query_available_gpu_memory_gib()
    if free_gib is None or free_gib <= 0:
        logger.warning(
            "Topaz GPU memory detection was unavailable; using %.1f GiB fallback.",
            TOPAZ_GPU_MEMORY_FALLBACK_GIB,
        )
        return TOPAZ_GPU_MEMORY_FALLBACK_GIB

    available_gib = min(
        free_gib * TOPAZ_GPU_MEMORY_FRACTION,
        free_gib - TOPAZ_GPU_MEMORY_HEADROOM_GIB,
    )
    if total_gib and total_gib > 0:
        available_gib = min(available_gib, total_gib)
    if available_gib < TOPAZ_GPU_MEMORY_MIN_GIB:
        raise TopazStarlightDependencyError(
            f"Topaz Starlight needs at least {TOPAZ_GPU_MEMORY_MIN_GIB:.1f} GiB free VRAM; "
            f"only {max(0.0, available_gib):.1f} GiB is available."
        )

    resolved = min(
        TOPAZ_GPU_MEMORY_MAX_GIB,
        max(TOPAZ_GPU_MEMORY_MIN_GIB, available_gib),
    )
    logger.info(
        "Topaz automatic GPU memory limit: free=%.2f GiB total=%.2f GiB limit=%.2f GiB",
        free_gib,
        total_gib or 0.0,
        resolved,
    )
    return resolved


def is_native_topaz_starlight_task(task: Any) -> bool:
    method = str(getattr(task, "task_method", "") or "").strip().casefold().removeprefix("scene_")
    if method != TOPAZ_STARLIGHT_METHOD:
        return False
    backend_params = getattr(task, "params_backend", None)
    native_process = _first_value(backend_params, "native_process", default="")
    task_name = str(getattr(task, "task_name", "") or "").strip().casefold().replace("_", "-")
    return (
        str(native_process or "").strip().casefold() == NATIVE_PROCESS
        or task_name in {"topaz-starlight", "topaz-starlight-video"}
    )


def localized_text(language: Any, english: str, chinese: str) -> str:
    normalized = str(language or "").strip().casefold()
    return chinese if normalized in {"cn", "zh", "zh-cn", "中文", "chinese"} else english


def _localized_catalog_text(language: Any, english: str) -> str:
    try:
        from modules.localization import localized_text as localized_ui_text

        return localized_ui_text({"__lang": language}, english)
    except Exception:
        return english


def _emit_progress(
    callback: ProgressCallback | None,
    language: Any,
    percentage: float,
    english: str,
    chinese: str,
) -> None:
    if callback is not None:
        callback(max(0, min(100, int(round(percentage)))), localized_text(language, english, chinese))


def _path_from_value(value: Any) -> str | None:
    if isinstance(value, Mapping):
        for key in ("path", "video", "file", "original_path", "output_path", "name"):
            path = _path_from_value(value.get(key))
            if path:
                return path
        return None
    if hasattr(value, "path") and not isinstance(value, (str, os.PathLike)):
        try:
            value = value.path
        except Exception:
            pass
    if hasattr(value, "name") and not isinstance(value, (str, os.PathLike)):
        try:
            value = value.name
        except Exception:
            pass
    if isinstance(value, (str, os.PathLike)):
        text = os.fspath(value).strip().strip('"')
        return os.path.abspath(text) if text else None
    return None


def resolve_input_video(source: Any) -> str:
    candidates = (
        "scene_original_video_path",
        "video",
        "scene_video",
        "reference_video",
    )
    requested: list[str] = []
    for candidate_source in _source_values(source):
        for name in candidates:
            path = _path_from_value(_value(candidate_source, name, default=None))
            if not path:
                continue
            if path not in requested:
                requested.append(path)
            if os.path.isfile(path):
                return path
    if requested:
        raise FileNotFoundError(requested[0])
    raise FileNotFoundError("No input video was provided.")


def _repository_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _normalize_package_root(value: Any) -> Path | None:
    path = _path_from_value(value)
    if not path:
        return None
    candidate = Path(path)
    if candidate.is_file() and candidate.name.casefold() == "neuroserver.exe":
        return candidate.parent.parent
    if candidate.name.casefold() == NEUROSERVER_DIR_NAME:
        return candidate.parent
    return candidate


def _configured_models_root() -> Path | None:
    """Resolve the configured model root without assuming the process cwd."""

    try:
        config = sys.modules.get("modules.config")
        if config is None:
            return None

        raw_path = getattr(config, "path_models_root", None)
        if not raw_path:
            return None
        path_resolver = getattr(config, "_config_path_to_abs", None)
        if callable(path_resolver):
            resolved_path = path_resolver(str(raw_path))
        else:
            expanded = os.path.expandvars(os.path.expanduser(str(raw_path)))
            if not os.path.isabs(expanded):
                expanded = os.path.join(str(_repository_root()), expanded)
            resolved_path = expanded
        if not resolved_path:
            return None
        return Path(resolved_path).expanduser().resolve()
    except Exception:
        logger.debug("Unable to resolve the configured model root for Topaz Starlight", exc_info=True)
        return None


def _engine_root_candidates(source: Any) -> list[Path]:
    candidates: list[Path] = []
    explicit_names = (
        "topaz_engine_root",
        "engine_root",
        "topaz_engine_path",
        "TOPAZ_ENGINE_ROOT",
    )
    for candidate_source in _source_values(source):
        for name in explicit_names:
            normalized = _normalize_package_root(_value(candidate_source, name, default=None))
            if normalized:
                candidates.append(normalized)
    for name in ("SIMPLEAI_TOPAZ_ENGINE_ROOT", "TOPAZ_ENGINE_ROOT", "TOPAZ_ENGINE_PATH"):
        normalized = _normalize_package_root(os.environ.get(name))
        if normalized:
            candidates.append(normalized)

    repo_root = _repository_root()
    configured_models_root = _configured_models_root()
    if configured_models_root:
        candidates.append(configured_models_root / "topaz_engine")

    try:
        import folder_paths

        comfy_models_root = _path_from_value(getattr(folder_paths, "models_dir", None))
        if comfy_models_root:
            comfy_models_path = Path(comfy_models_root)
            candidates.extend(
                [
                    comfy_models_path / "topaz_engine",
                    comfy_models_path.parent / "topaz_engine",
                ]
            )
    except Exception:
        logger.debug("Unable to inspect ComfyUI model paths for Topaz Starlight", exc_info=True)

    candidates.extend(
        [
            repo_root.parent.parent / "SimpleModels" / "topaz_engine",
            repo_root / "topaz_engine",
            repo_root / "comfy" / "topaz_engine",
            repo_root.parent / "topaz_engine",
            repo_root.parent.parent / "topaz_engine",
            Path.cwd() / "topaz_engine",
            Path.cwd().parent / "topaz_engine",
        ]
    )
    result: list[Path] = []
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved not in result:
            result.append(resolved)
    return result


def _model_store_candidates(source: Any, package_root: Path) -> list[Path]:
    candidates: list[Path] = []
    explicit_names = (
        "topaz_model_store",
        "model_store",
        "TOPAZ_MODEL_STORE",
    )
    for candidate_source in _source_values(source):
        for name in explicit_names:
            path = _path_from_value(_value(candidate_source, name, default=None))
            if path:
                candidates.append(Path(path))
    for name in ("TOPAZ_MODEL_STORE", "SIMPLEAI_TOPAZ_MODEL_STORE"):
        path = _path_from_value(os.environ.get(name))
        if path:
            candidates.append(Path(path))
    repo_root = _repository_root()
    candidates.extend(
        [
            package_root / "models",
            package_root.parent / "models",
            repo_root / "models",
            repo_root / "comfy" / "models",
            Path.cwd() / "models",
        ]
    )

    result: list[Path] = []
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved.name.casefold() == TOPAZ_MODEL_DIR_NAME:
            resolved = resolved.parent
        if resolved not in result:
            result.append(resolved)
    return result


def resolve_engine_config(source: Any = None) -> TopazEngineConfig:
    """Find Neuroserver 1.7.1 and its SLP-26 runtime model store."""

    attempted: list[str] = []
    for package_root in _engine_root_candidates(source):
        server = package_root / NEUROSERVER_DIR_NAME / "neuroserver.exe"
        if not server.is_file():
            attempted.append(str(server))
            continue
        ffmpeg = package_root / FFMPEG_DIR_NAME / "ffmpeg.exe"
        if not ffmpeg.is_file():
            ffmpeg = package_root / "bin" / "ffmpeg.exe"
        if not ffmpeg.is_file():
            system_ffmpeg = shutil.which("ffmpeg")
            if system_ffmpeg:
                ffmpeg = Path(system_ffmpeg)
        if not ffmpeg.is_file():
            raise TopazStarlightDependencyError(
                f"Topaz Neuroserver was found at {server}, but ffmpeg.exe is missing."
            )
        ffprobe = ffmpeg.with_name("ffprobe.exe")
        if not ffprobe.is_file():
            system_ffprobe = shutil.which("ffprobe")
            if system_ffprobe:
                ffprobe = Path(system_ffprobe)
        if not ffprobe.is_file():
            raise TopazStarlightDependencyError(
                f"Topaz ffprobe.exe is missing beside {ffmpeg}."
            )
        for model_store in _model_store_candidates(source, package_root):
            if (model_store / TOPAZ_MODEL_DIR_NAME).is_dir():
                logger.info(
                    "Topaz resources resolved: package_root=%s server=%s model_store=%s model_dir=%s",
                    package_root,
                    server,
                    model_store,
                    model_store / TOPAZ_MODEL_DIR_NAME,
                )
                return TopazEngineConfig(
                    package_root=str(package_root),
                    server_path=str(server),
                    ffmpeg_path=str(ffmpeg),
                    ffprobe_path=str(ffprobe),
                    model_store=str(model_store),
                )
        raise TopazStarlightDependencyError(
            "Topaz Neuroserver was found, but the slp26 model directory is missing. "
            "Set TVAI_MODEL_DIR or TOPAZ_MODEL_STORE to the directory containing models\\slp26."
        )
    attempted_text = "; ".join(attempted[:4])
    raise TopazStarlightDependencyError(
        "Topaz Neuroserver 1.7.1 was not found. "
        f"Set TOPAZ_ENGINE_ROOT to the topaz_engine directory. Checked: {attempted_text}"
    )


def engine_info(source: Any = None) -> dict[str, str]:
    config = resolve_engine_config(source)
    return {
        "package_root": config.package_root,
        "server_path": config.server_path,
        "ffmpeg_path": config.ffmpeg_path,
        "ffprobe_path": config.ffprobe_path,
        "model_store": config.model_store,
        "model_id": TOPAZ_MODEL_ID,
    }


def _parse_fps(value: Any) -> float:
    text = str(value or "").strip()
    if not text or text in {"0/0", "N/A"}:
        return 0.0
    try:
        return float(Fraction(text))
    except (ValueError, ZeroDivisionError):
        return _number(value, 0.0)


def _probe_json(ffprobe: str, args: list[str], input_path: str) -> dict[str, Any]:
    result = subprocess.run(
        [ffprobe, "-v", "error", *args, input_path],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise TopazStarlightDependencyError(
            f"ffprobe failed for {input_path}: {result.stderr.strip()[-500:]}"
        )
    try:
        return json.loads(result.stdout or "{}")
    except json.JSONDecodeError as exc:
        raise TopazStarlightDependencyError(f"ffprobe returned invalid JSON for {input_path}.") from exc


def _probe_video(input_path: str, ffprobe: str) -> VideoInfo:
    payload = _probe_json(
        ffprobe,
        [
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration",
            "-of",
            "json",
        ],
        input_path,
    )
    streams = payload.get("streams") or []
    if not streams:
        raise ValueError(f"No video stream found in {input_path}")
    stream = streams[0]
    width = int(_number(stream.get("width"), 0))
    height = int(_number(stream.get("height"), 0))
    fps = _parse_fps(stream.get("avg_frame_rate")) or _parse_fps(stream.get("r_frame_rate")) or 24.0
    frames = int(_number(stream.get("nb_frames"), 0))
    if frames <= 0:
        count_payload = _probe_json(
            ffprobe,
            [
                "-count_frames",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=nb_read_frames",
                "-of",
                "json",
            ],
            input_path,
        )
        count_streams = count_payload.get("streams") or []
        if count_streams:
            frames = int(_number(count_streams[0].get("nb_read_frames"), 0))
    if frames <= 0:
        duration = _number(stream.get("duration"), 0.0)
        frames = max(1, int(round(duration * fps))) if duration > 0 else 1
    audio_payload = _probe_json(
        ffprobe,
        [
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=index",
            "-of",
            "json",
        ],
        input_path,
    )
    if width <= 0 or height <= 0:
        raise ValueError(f"Invalid video dimensions in {input_path}: {width}x{height}")
    return VideoInfo(width, height, fps, frames, bool(audio_payload.get("streams")))


def _even_dimension(value: int) -> int:
    value = max(2, int(value))
    return value + value % 2


def _output_dimensions(info: VideoInfo, scale: float) -> tuple[int, int]:
    return _even_dimension(round(info.width * scale)), _even_dimension(round(info.height * scale))


def _frame_limit(info: VideoInfo, duration_limit: float) -> int:
    if duration_limit <= 0:
        return info.frames
    return max(1, min(info.frames, int(duration_limit * info.fps)))


def resolve_topaz_segment_frame_budget(
    info: VideoInfo,
    params: TopazStarlightParams,
    max_gpu_mem: float,
) -> int:
    """Choose a conservative frame count for one SLP-26 process."""

    if params.segment_frames is not None:
        return _bounded_int(
            params.segment_frames,
            TOPAZ_SEGMENT_REFERENCE_FRAMES,
            TOPAZ_SEGMENT_MIN_FRAMES,
            TOPAZ_SEGMENT_MAX_FRAMES,
        )

    output_width, output_height = _output_dimensions(info, params.upscale_factor)
    output_pixels = max(1, output_width * output_height)
    pixel_factor = math.sqrt(TOPAZ_SEGMENT_REFERENCE_OUTPUT_PIXELS / output_pixels)
    memory_factor = math.sqrt(
        max(
            0.5,
            min(2.0, float(max_gpu_mem) / TOPAZ_SEGMENT_REFERENCE_GPU_MEM_GIB),
        )
    )
    budget = round(TOPAZ_SEGMENT_REFERENCE_FRAMES * pixel_factor * memory_factor)
    return _bounded_int(
        budget,
        TOPAZ_SEGMENT_REFERENCE_FRAMES,
        TOPAZ_SEGMENT_MIN_FRAMES,
        TOPAZ_SEGMENT_MAX_FRAMES,
    )


def plan_topaz_segments(frame_count: int, segment_frame_budget: int) -> list[TopazFrameSegment]:
    """Split a limited source range into balanced, non-overlapping frame ranges."""

    total_frames = max(1, int(frame_count))
    budget = max(1, int(segment_frame_budget))
    segment_count = max(1, int(math.ceil(total_frames / budget)))
    balanced_size = int(math.ceil(total_frames / segment_count))
    segments: list[TopazFrameSegment] = []
    start_frame = 0
    for index in range(segment_count):
        end_frame = min(total_frames, start_frame + balanced_size)
        segments.append(TopazFrameSegment(index, start_frame, end_frame))
        start_frame = end_frame
    return segments


def _frame_end_index(frame_count: int) -> int:
    """Neuroserver's end-frame-idx is inclusive."""

    return max(0, int(frame_count) - 1)


def _build_filters(params: TopazStarlightParams) -> str:
    return json.dumps(
        [
            {
                "model": TOPAZ_MODEL_ID,
                "enhancement_strength": params.enhancement_strength,
                "softness": 1,
            }
        ],
        separators=(",", ":"),
    )


def build_neuroserver_command(
    config: TopazEngineConfig,
    input_path: str,
    output_path: str,
    info: VideoInfo,
    frame_count: int,
    params: TopazStarlightParams,
    *,
    start_frame_idx: int = 0,
    end_frame_idx: int | None = None,
) -> list[str]:
    output_width, output_height = _output_dimensions(info, params.upscale_factor)
    max_gpu_mem = resolve_topaz_max_gpu_mem_gib(params.max_gpu_mem)
    start_frame_idx = max(0, int(start_frame_idx))
    if end_frame_idx is None:
        end_frame_idx = start_frame_idx + _frame_end_index(frame_count)
    end_frame_idx = max(start_frame_idx, int(end_frame_idx))
    return [
        config.server_path,
        "--once",
        "--input-path",
        input_path,
        "--output-path",
        output_path,
        "--input-frame-rate",
        _format_number(info.fps),
        "--start-frame-idx",
        str(start_frame_idx),
        "--end-frame-idx",
        str(end_frame_idx),
        "--max-gpu-mem",
        _format_number(max_gpu_mem),
        "--filters",
        _build_filters(params),
        "--output-width",
        str(output_width),
        "--output-height",
        str(output_height),
        "--output-frame-rate",
        _format_number(info.fps),
        "--upscale-factor",
        _format_number(params.upscale_factor),
        "--ffmpeg-encoding",
        DEFAULT_FFMPEG_ENCODING,
    ]


def _json_payload_from_line(line: str) -> Any:
    stripped = line.strip()
    if not stripped:
        return None
    candidates = [stripped]
    first = stripped.find("{")
    last = stripped.rfind("}")
    if first >= 0 and last > first:
        candidates.append(stripped[first : last + 1])
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except (TypeError, json.JSONDecodeError):
            continue
    return None


def _progress_number(value: Any) -> float | None:
    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value)
        if not match:
            return None
        value = match.group(0)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if 0.0 <= number <= 1.0:
        number *= 100.0
    return max(0.0, min(100.0, number))


def _progress_from_payload(payload: Any, frame_count: int) -> tuple[float | None, str | None]:
    if not isinstance(payload, Mapping):
        return None, None
    for nested_key in ("progress", "data", "event", "payload", "status"):
        nested = payload.get(nested_key)
        if isinstance(nested, Mapping):
            percentage, message = _progress_from_payload(nested, frame_count)
            if percentage is not None or message:
                return percentage, message

    percentage = None
    for key in ("percentage", "percent", "progress", "progress_percent", "progressPercentage"):
        if key in payload:
            percentage = _progress_number(payload.get(key))
            if percentage is not None:
                break
    if percentage is None:
        current = None
        total = None
        for key in ("frame", "current_frame", "currentFrame", "processed_frames", "frame_idx"):
            if key in payload:
                current = _progress_number(payload.get(key))
                break
        for key in ("total_frames", "totalFrames", "frame_count", "total"):
            if key in payload:
                total = _progress_number(payload.get(key))
                break
        if current is not None and total and total > 0:
            percentage = 100.0 * current / total
        elif current is not None and frame_count > 0:
            percentage = 100.0 * current / frame_count

    message = None
    for key in ("message", "stage", "title", "status", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            message = value.strip()
            break
    return percentage, message


def parse_neuroserver_progress(line: str, frame_count: int) -> tuple[float | None, str | None]:
    payload = _json_payload_from_line(line)
    percentage, message = _progress_from_payload(payload, frame_count)
    if percentage is not None:
        return percentage, message
    percent_match = re.search(r"(?<!\d)(\d{1,3}(?:\.\d+)?)\s*%", line)
    if percent_match:
        percentage = _progress_number(percent_match.group(1))
    else:
        frame_match = re.search(
            r"\bframe(?:s)?\s*[:=]?\s*(\d+)\s*(?:/|of)\s*(\d+)",
            line,
            flags=re.IGNORECASE,
        )
        percentage = None
        if frame_match:
            percentage = 100.0 * int(frame_match.group(1)) / max(1, int(frame_match.group(2)))
    return percentage, line.strip() or None


def _display_neuroserver_progress(percentage: float) -> float:
    if percentage >= TOPAZ_ENGINE_FINALIZING_THRESHOLD:
        return TOPAZ_ENGINE_FINALIZING_PROGRESS
    return max(0.0, min(TOPAZ_ENGINE_PROGRESS_MAX, float(percentage)))


def _progress_title(language: Any, percentage: float, message: str | None) -> str:
    normalized_message = str(message or "").strip().casefold()
    if percentage >= TOPAZ_ENGINE_FINALIZING_THRESHOLD:
        return localized_text(language, "Finalizing Topaz output...", "正在整理 Topaz 输出...")
    if any(
        token in normalized_message
        for token in ("encode", "encoding", "write output", "writing output", "output frame", "mux", "flush")
    ):
        return localized_text(language, "Topaz Starlight writing output...", "正在写入 Topaz 星光输出...")
    if any(
        token in normalized_message
        for token in ("decode", "demux", "read input", "reading input", "input frame")
    ):
        return localized_text(language, "Topaz Starlight decoding source video...", "正在解码 Topaz 源视频...")
    return localized_text(language, "Topaz Starlight processing...", "正在处理 Topaz 星光...")


def _topaz_runtime_directories(config: TopazEngineConfig) -> list[str]:
    server_root = Path(config.server_path).resolve().parent
    site_packages = server_root / "Lib" / "site-packages"
    model_store = Path(config.model_store).resolve()
    model_dir = model_store / TOPAZ_MODEL_DIR_NAME
    candidates = [
        server_root,
        server_root / "DLLs",
        server_root / "Lib",
        site_packages,
        site_packages / "torch" / "lib",
        site_packages / "torchvision",
        site_packages / "starlight_utils",
        site_packages / "OpenImageIO" / "bin",
        site_packages / "numpy.libs",
        site_packages / "scipy.libs",
        model_store,
        model_dir,
        Path(config.ffmpeg_path).resolve().parent,
    ]
    directories: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate.is_dir():
            continue
        resolved = str(candidate)
        key = os.path.normcase(os.path.normpath(resolved))
        if key in seen:
            continue
        seen.add(key)
        directories.append(resolved)
    return directories


def _subprocess_environment(config: TopazEngineConfig) -> dict[str, str]:
    env = os.environ.copy()
    runner_dir = Path(config.server_path).resolve().parent
    model_store = Path(config.model_store).resolve()
    existing_path = env.get("PATH", "")
    runtime_directories = _topaz_runtime_directories(config)
    env["TOPAZ_RUNNER_DIR"] = str(runner_dir)
    env["TOPAZ_MODEL_STORE"] = str(model_store)
    # The native SLP loader expects the selected model directory.
    model_dir = model_store / TOPAZ_MODEL_DIR_NAME
    env["TVAI_MODEL_DIR"] = str(model_dir if model_dir.is_dir() else model_store)
    env["PATH"] = os.pathsep.join(
        runtime_directories + ([existing_path] if existing_path else [])
    )
    for key in tuple(env):
        normalized = key.upper()
        if normalized in {"PYTHONHOME", "PYTHONPATH", "CUDA_HOME", "CUDA_ROOT", "CUDA_PATH"}:
            env.pop(key, None)
        elif normalized.startswith("CUDA_PATH_"):
            env.pop(key, None)
    env["PYTHONNOUSERSITE"] = "1"
    logger.info(
        "Topaz subprocess environment: model_dir=%s runtime_dirs=%s",
        model_store,
        len(runtime_directories),
    )
    return env


def _creation_flags() -> int:
    return int(getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=5)
    except Exception:
        try:
            process.kill()
            process.wait(timeout=5)
        except Exception:
            logger.debug("Failed to terminate Topaz Neuroserver", exc_info=True)


def _run_neuroserver(
    command: list[str],
    config: TopazEngineConfig,
    frame_count: int,
    language: Any,
    progress_callback: ProgressCallback | None,
    cancel_callback: CancelCallback | None,
) -> tuple[list[str], bool]:
    process = subprocess.Popen(
        command,
        cwd=str(Path(config.server_path).parent),
        env=_subprocess_environment(config),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_creation_flags(),
    )
    lines: list[str] = []
    output_queue: queue.Queue[str | None] = queue.Queue()

    def read_output() -> None:
        try:
            if process.stdout is not None:
                for line in process.stdout:
                    output_queue.put(line)
        finally:
            output_queue.put(None)

    reader = threading.Thread(target=read_output, name="topaz-neuroserver-output", daemon=True)
    reader.start()
    last_percentage = 0.0
    last_message: str | None = None
    last_emit_time = time.monotonic()
    last_marker: tuple[int, str] | None = None
    watermark_required = False

    def emit_engine_state(force: bool = False) -> None:
        nonlocal last_emit_time, last_marker
        if progress_callback is None:
            return
        display_percentage = _display_neuroserver_progress(last_percentage)
        title = _progress_title(language, last_percentage, last_message)
        marker = (int(round(display_percentage)), title)
        if not force and marker == last_marker:
            return
        progress_callback(marker[0], title)
        last_marker = marker
        last_emit_time = time.monotonic()

    try:
        while True:
            if cancel_callback and cancel_callback():
                _terminate_process(process)
                raise TopazStarlightCancelled()
            try:
                line = output_queue.get(timeout=0.25)
            except queue.Empty:
                if process.poll() is not None and output_queue.empty():
                    break
                if time.monotonic() - last_emit_time >= TOPAZ_PROGRESS_HEARTBEAT_SECONDS:
                    emit_engine_state(force=True)
                continue
            if line is None:
                if process.poll() is not None:
                    break
                # Neuroserver can close stdout before its output container is finalized.
                # Keep polling so the task remains visibly active during that interval.
                continue
            clean_line = line.rstrip()
            if clean_line:
                lines.append(clean_line)
                lines = lines[-80:]
                lowered = clean_line.casefold()
                watermark_required = watermark_required or "watermark required" in lowered
                watermark_required = watermark_required or "auth file does not exist" in lowered
                percentage, _message = parse_neuroserver_progress(clean_line, frame_count)
                if _message:
                    last_message = _message
                if percentage is not None:
                    last_percentage = max(last_percentage, percentage)
                    emit_engine_state()
                elif _message:
                    emit_engine_state()
                logger.debug("[Topaz] %s", clean_line)
        return_code = process.wait()
    finally:
        if process.poll() is None:
            _terminate_process(process)
        if process.stdout is not None:
            try:
                process.stdout.close()
            except Exception:
                pass
    if return_code != 0:
        detail = " | ".join(lines[-8:])[-1200:]
        raise RuntimeError(f"neuroserver failed (exit {return_code}): {detail}")
    return lines, watermark_required


def _run_neuroserver_exclusive(
    command: list[str],
    config: TopazEngineConfig,
    frame_count: int,
    language: Any,
    progress_callback: ProgressCallback | None,
    cancel_callback: CancelCallback | None,
) -> tuple[list[str], bool]:
    """Serialize local Topaz runs inside the Studio/ComfyUI process."""

    while not _TOPAZ_EXECUTION_LOCK.acquire(timeout=0.25):
        if cancel_callback and cancel_callback():
            raise TopazStarlightCancelled()
    try:
        return _run_neuroserver(
            command,
            config,
            frame_count,
            language,
            progress_callback,
            cancel_callback,
        )
    finally:
        _TOPAZ_EXECUTION_LOCK.release()


def _run_topaz_segment(
    config: TopazEngineConfig,
    input_path: str,
    output_path: str,
    info: VideoInfo,
    params: TopazStarlightParams,
    segment: TopazFrameSegment,
    language: Any,
    progress_callback: ProgressCallback | None,
    cancel_callback: CancelCallback | None,
) -> tuple[list[str], bool]:
    command = build_neuroserver_command(
        config,
        input_path,
        output_path,
        info,
        segment.frame_count,
        params,
        start_frame_idx=segment.start_frame,
        end_frame_idx=segment.end_frame - 1,
    )
    return _run_neuroserver_exclusive(
        command,
        config,
        segment.frame_count,
        language,
        progress_callback,
        cancel_callback,
    )


def _segment_progress_title(language: Any, segment_number: int, segment_total: int, title: str) -> str:
    template = _localized_catalog_text(
        language,
        "Topaz Starlight segment {current}/{total}: {title}",
    )
    return template.format(current=segment_number, total=segment_total, title=title)


def _concat_topaz_segments(
    segment_paths: list[str],
    output_path: str,
    ffmpeg: str,
) -> None:
    if not segment_paths:
        raise RuntimeError("No Topaz segment outputs were produced.")

    output_path = os.path.abspath(output_path)
    list_path = f"{output_path}.concat_{os.getpid()}_{time.time_ns()}.txt"
    temp_path = f"{output_path}.concat_{os.getpid()}_{time.time_ns()}.mp4"
    try:
        lines = []
        for segment_path in segment_paths:
            normalized = os.path.abspath(segment_path).replace("\\", "/")
            escaped = normalized.replace("'", "'\\\\''")
            lines.append(f"file '{escaped}'")
        Path(list_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
        result = subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_path,
                "-map",
                "0:v:0",
                "-c",
                "copy",
                "-vsync",
                "0",
                "-movflags",
                "+faststart",
                temp_path,
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if result.returncode != 0 or not os.path.isfile(temp_path):
            detail = (result.stderr or result.stdout or "").strip()[-1200:]
            raise RuntimeError(f"Topaz segment merge failed: {detail}")
        os.replace(temp_path, output_path)
    finally:
        for path in (list_path, temp_path):
            try:
                if os.path.isfile(path):
                    os.remove(path)
            except OSError:
                pass


def _run_segmented_topaz(
    input_path: str,
    output_path: str,
    config: TopazEngineConfig,
    info: VideoInfo,
    frame_count: int,
    params: TopazStarlightParams,
    language: Any,
    progress_callback: ProgressCallback | None,
    cancel_callback: CancelCallback | None,
) -> dict[str, Any]:
    max_gpu_mem = resolve_topaz_max_gpu_mem_gib(params.max_gpu_mem)
    segment_budget = resolve_topaz_segment_frame_budget(info, params, max_gpu_mem)
    segments = plan_topaz_segments(frame_count, segment_budget)
    output_width, output_height = _output_dimensions(info, params.upscale_factor)
    work_dir = tempfile.mkdtemp(
        prefix="SimpAI_TopazStarlight_segments_",
        dir=os.path.dirname(output_path),
    )
    segment_paths: list[str] = []
    watermark_required = False
    audio_muxed = False
    success = False

    logger.info(
        "Topaz segmented execution: frames=%s segments=%s budget=%s output=%sx%s max_gpu_mem=%.2f",
        frame_count,
        len(segments),
        segment_budget,
        output_width,
        output_height,
        max_gpu_mem,
    )
    try:
        if progress_callback is not None:
            progress_callback(
                0,
                _localized_catalog_text(language, "Preparing Topaz segments..."),
            )
        for segment in segments:
            if cancel_callback and cancel_callback():
                raise TopazStarlightCancelled()
            segment_path = os.path.join(work_dir, f"segment_{segment.index + 1:04d}.mp4")

            def report_segment_progress(
                local_percentage: int,
                title: str,
                *,
                segment_index: int = segment.index,
            ) -> None:
                if progress_callback is None:
                    return
                local_fraction = max(0.0, min(94.0, float(local_percentage))) / 94.0
                overall = 2.0 + 90.0 * (
                    (segment_index + local_fraction) / max(1, len(segments))
                )
                progress_callback(
                    int(round(overall)),
                    _segment_progress_title(
                        language,
                        segment_index + 1,
                        len(segments),
                        title,
                    ),
                )

            segment_started = time.monotonic()
            _lines, segment_watermark = _run_topaz_segment(
                config,
                input_path,
                segment_path,
                info,
                replace(params, max_gpu_mem=max_gpu_mem),
                segment,
                language,
                report_segment_progress,
                cancel_callback,
            )
            watermark_required = watermark_required or segment_watermark
            if not os.path.isfile(segment_path):
                raise RuntimeError(
                    f"Topaz segment {segment.index + 1}/{len(segments)} produced no output file."
                )
            segment_info = _probe_video(segment_path, config.ffprobe_path)
            if segment_info.frames != segment.frame_count:
                raise RuntimeError(
                    f"Topaz segment {segment.index + 1}/{len(segments)} returned "
                    f"{segment_info.frames} frames; expected {segment.frame_count}."
                )
            segment_paths.append(segment_path)
            logger.info(
                "Topaz segment finished: segment=%s/%s start=%s end=%s frames=%s elapsed=%.2fs",
                segment.index + 1,
                len(segments),
                segment.start_frame,
                segment.end_frame - 1,
                segment.frame_count,
                time.monotonic() - segment_started,
            )
            if progress_callback is not None:
                progress_callback(
                    int(round(2.0 + 90.0 * (segment.index + 1) / len(segments))),
                    _segment_progress_title(
                        language,
                        segment.index + 1,
                        len(segments),
                        _localized_catalog_text(language, "Topaz segment completed"),
                    ),
                )

        if cancel_callback and cancel_callback():
            raise TopazStarlightCancelled()
        stitched_path = os.path.join(work_dir, "stitched.mp4")
        if progress_callback is not None:
            progress_callback(
                94,
                _localized_catalog_text(language, "Combining Topaz segments..."),
            )
        _concat_topaz_segments(segment_paths, stitched_path, config.ffmpeg_path)
        if info.has_audio:
            if progress_callback is not None:
                progress_callback(
                    96,
                    _localized_catalog_text(language, "Muxing source audio..."),
                )
            audio_muxed = _mux_source_audio(stitched_path, input_path, config.ffmpeg_path)
        if watermark_required:
            logger.warning("Topaz Neuroserver reported that a watermark is required.")
        os.replace(stitched_path, output_path)
        if progress_callback is not None:
            progress_callback(
                99,
                _localized_catalog_text(language, "Verifying Topaz output..."),
            )
        output_info = _probe_video(output_path, config.ffprobe_path)
        frame_count_mismatch = output_info.frames != frame_count
        frame_count_delta = output_info.frames - frame_count
        if frame_count_mismatch:
            logger.warning(
                "Topaz merged output frame count differs; keeping readable output: "
                "actual=%s expected=%s delta=%s path=%s",
                output_info.frames,
                frame_count,
                frame_count_delta,
                output_path,
            )
        success = True
        if progress_callback is not None:
            progress_callback(
                100,
                (
                    localized_text(
                        language,
                        "Topaz Starlight finished with a frame-count warning.",
                        "Topaz 星光处理完成，但合并后帧数与源视频不一致。",
                    )
                    if frame_count_mismatch
                    else _localized_catalog_text(language, "Topaz Starlight finished")
                ),
            )
        return {
            "output_path": output_path,
            "model_id": TOPAZ_MODEL_ID,
            "source_fps": info.fps,
            "output_fps": output_info.fps,
            "source_frames": frame_count,
            "output_frames": output_info.frames,
            "source_width": info.width,
            "source_height": info.height,
            "output_width": output_info.width or output_width,
            "output_height": output_info.height or output_height,
            "audio_muxed": audio_muxed,
            "watermark_required": watermark_required,
            "engine_path": config.server_path,
            "model_store": config.model_store,
            "segment_count": len(segments),
            "segment_frame_budget": segment_budget,
            "frame_count_mismatch": frame_count_mismatch,
            "frame_count_delta": frame_count_delta,
        }
    finally:
        if not success:
            try:
                if os.path.isfile(output_path):
                    os.remove(output_path)
            except OSError:
                pass
        shutil.rmtree(work_dir, ignore_errors=True)


def _mux_source_audio(output_path: str, source_path: str, ffmpeg: str) -> bool:
    temp_path = f"{output_path}.audio_{os.getpid()}_{time.time_ns()}.mp4"
    base = [
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
        "-map_metadata",
        "0",
        "-c:v",
        "copy",
        "-shortest",
        "-movflags",
        "+faststart",
        temp_path,
    ]
    commands = [
        base[: base.index("-shortest")] + ["-c:a", "copy"] + base[base.index("-shortest") :],
        base[: base.index("-shortest")] + ["-c:a", "aac", "-b:a", "192k"] + base[base.index("-shortest") :],
    ]
    try:
        for command in commands:
            result = subprocess.run(command, capture_output=True, check=False)
            if result.returncode == 0 and os.path.isfile(temp_path):
                os.replace(temp_path, output_path)
                return True
    finally:
        try:
            if os.path.isfile(temp_path):
                os.remove(temp_path)
        except OSError:
            pass
    return False


def run_topaz_starlight(
    input_path: str,
    output_path: str,
    params: Any = None,
    *,
    language: Any = None,
    progress_callback: ProgressCallback | None = None,
    cancel_callback: CancelCallback | None = None,
) -> dict[str, Any]:
    """Run slp-26 through the local Neuroserver process."""

    config = resolve_engine_config(params or {})
    settings = normalize_topaz_starlight_params(params or {})
    input_path = os.path.abspath(os.fspath(input_path))
    output_path = os.path.abspath(os.fspath(output_path))
    if not os.path.isfile(input_path):
        raise FileNotFoundError(input_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    info = _probe_video(input_path, config.ffprobe_path)
    frame_count = _frame_limit(info, settings.duration_limit)
    settings = replace(
        settings,
        max_gpu_mem=resolve_topaz_max_gpu_mem_gib(settings.max_gpu_mem),
    )
    segment_budget = resolve_topaz_segment_frame_budget(
        info,
        settings,
        settings.max_gpu_mem or TOPAZ_SEGMENT_REFERENCE_GPU_MEM_GIB,
    )
    segments = plan_topaz_segments(frame_count, segment_budget)
    if len(segments) > 1:
        return _run_segmented_topaz(
            input_path,
            output_path,
            config,
            info,
            frame_count,
            settings,
            language,
            progress_callback,
            cancel_callback,
        )
    command = build_neuroserver_command(config, input_path, output_path, info, frame_count, settings)
    output_width, output_height = _output_dimensions(info, settings.upscale_factor)
    _emit_progress(
        progress_callback,
        language,
        0,
        "Loading Topaz Starlight...",
        "正在加载 Topaz 星光...",
    )

    success = False
    audio_muxed = False
    watermark_required = False
    try:
        if cancel_callback and cancel_callback():
            raise TopazStarlightCancelled()
        _lines, watermark_required = _run_neuroserver_exclusive(
            command,
            config,
            frame_count,
            language,
            progress_callback,
            cancel_callback,
        )
        if not os.path.isfile(output_path):
            raise RuntimeError("neuroserver produced no output file")
        if cancel_callback and cancel_callback():
            raise TopazStarlightCancelled()
        _emit_progress(
            progress_callback,
            language,
            95,
            "Checking Topaz output...",
            "正在检查 Topaz 输出...",
        )
        if info.has_audio:
            _emit_progress(
                progress_callback,
                language,
                96,
                "Muxing source audio...",
                "正在复用源音频...",
            )
            audio_muxed = _mux_source_audio(output_path, input_path, config.ffmpeg_path)
        if watermark_required:
            logger.warning("Topaz Neuroserver reported that a watermark is required.")
        _emit_progress(
            progress_callback,
            language,
            99,
            "Verifying Topaz output...",
            "正在验证 Topaz 输出...",
        )
        output_info = _probe_video(output_path, config.ffprobe_path)
        success = True
        _emit_progress(
            progress_callback,
            language,
            100,
            "Topaz Starlight finished",
            "Topaz 星光处理完成",
        )
        return {
            "output_path": output_path,
            "model_id": TOPAZ_MODEL_ID,
            "source_fps": info.fps,
            "output_fps": output_info.fps,
            "source_frames": frame_count,
            "output_frames": output_info.frames,
            "source_width": info.width,
            "source_height": info.height,
            "output_width": output_info.width or output_width,
            "output_height": output_info.height or output_height,
            "audio_muxed": audio_muxed,
            "watermark_required": watermark_required,
            "engine_path": config.server_path,
            "model_store": config.model_store,
            "segment_count": 1,
            "segment_frame_budget": segment_budget,
        }
    finally:
        if not success:
            try:
                if os.path.exists(output_path):
                    os.remove(output_path)
            except OSError:
                pass
