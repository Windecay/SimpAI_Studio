from __future__ import annotations

import json
import os
import queue
import random
import shlex
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections import deque
from dataclasses import replace
from pathlib import Path
from typing import Any

from forge_neo.runtime_backend.adapter import (
    _clamped_float,
    _clamped_int,
    _decode_api_image,
    _encode_api_image,
    _image_from_any_value,
    _inpainting_fill_index,
    _optional_clamped_float,
    _optional_model_name,
    _resize_mode_index,
    _source_backend_mode,
    _source_api_has_field,
    _source_prompt_with_loras,
    _source_apply_raw_request_model_values,
    _source_api_raw_field,
    _source_payload_with_infotext_unset_fields,
    _source_payload_without_ignored_api_fields,
    _source_request_float_arg,
    _source_request_int_arg,
    _source_request_optional_float_arg,
    _source_request_override_settings,
    _source_script_args_tuple,
    _source_seed_value,
    _source_seed_variance_args,
    _source_saved_override_settings,
    _source_low_bit_dtype,
    source_alwayson_scripts,
)
from forge_neo.png_info import parse_generation_parameters, png_info_items


ROOT = Path(__file__).resolve().parents[2]
DEV_ROOT = ROOT.parent
RUNTIME_BACKEND_ROOT = Path(__file__).resolve().parent
SOURCE_WEBUI_ROOT = ROOT / "forge_neo" / "webui"
SOURCE_EVENT_PREFIX = "__FORGE_NEO_SOURCE_EVENT__ "
SOURCE_RESULT_PREFIX = "__FORGE_NEO_SOURCE_RESULT__ "
_STDOUT_DONE = object()
_JSON_DECODER = json.JSONDecoder()
_SOURCE_BACKEND_CONTROL_PAYLOAD_KEY = "__forge_neo_source_control_path"
_SOURCE_BACKEND_INTERRUPT_GRACE_SECONDS = 12.0
_SOURCE_BACKEND_COMMAND_LINE_MESSAGE = "Source backend command line prepared"
_SOURCE_BATCH_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".avif"}
_SOURCE_BATCH_UNSAFE_FILENAME_CHARS = '#<>:"/\\|?*\n\r\t'
_SOURCE_BACKEND_NOISY_FLAGS = {
    "--skip-version-check",
    "--skip-prepare-environment",
    "--skip-install",
    "--api",
    "--disable-console-progressbars",
    "--no-hashing",
}
_SOURCE_BACKEND_DIR_ARGS = {
    "--ckpt-dirs": "ckpt",
    "--text-encoder-dirs": "text_encoder",
    "--vae-dirs": "vae",
    "--lora-dirs": "lora",
    "--esrgan-models-path": "upscale",
    "--controlnet-dir": "controlnet",
    "--controlnet-dirs": "controlnet",
}
_SOURCE_BACKEND_VALUE_ARGS = {
    "--data-dir",
    "--model-ref",
    "--gpu-device-id",
    "--reserve-vram",
    "--text-enc-device",
    "--vae-device",
    "--tiled-conv2d",
    "--cuda-stream",
    "--server-name",
    "--gradio-auth",
    "--gradio-auth-path",
    "--api-auth",
    "--subpath",
    "--gradio-allowed-path",
    "--sage-function",
}
_SOURCE_BACKEND_MODEL_ARG_CATALOGS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("--ckpt-dirs", ("checkpoints", "diffusion_models")),
    ("--text-encoder-dirs", ("text_encoders", "clip")),
    ("--vae-dirs", ("vae",)),
    ("--lora-dirs", ("loras",)),
    ("--esrgan-models-path", ("upscale_models",)),
)
_SOURCE_BACKEND_SINGLE_MODEL_ARGS = {"--esrgan-models-path"}
_SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE = False
_SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH = 0
_SOURCE_BACKEND_CONSOLE_PROGRESS_LINE = ""
_SOURCE_BACKEND_CONSOLE_PROGRESS_COMPLETION_LINE = ""
_SOURCE_BACKEND_TQDM_PARTIAL_BLOCKS = ("", "▏", "▎", "▍", "▌", "▋", "▊", "▉")
_SOURCE_BACKEND_BOOTSTRAP_PACKAGES: tuple[tuple[str, str], ...] = (
    ("comfy-kitchen", "0.2.28"),
)


def _default_data_root() -> Path:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_DATA_DIR", "") or "").strip()
    if value:
        candidate = Path(value)
        if (candidate / "webui" / "models").is_dir():
            return candidate / "webui"
        return candidate
    return SOURCE_WEBUI_ROOT


def _source_env_dirs(name: str) -> list[str]:
    value = str(os.environ.get(name, "") or "").strip()
    if not value:
        return []
    return [item for item in value.split(os.pathsep) if item.strip()]


def _source_existing_dirs(values: list[str]) -> list[str]:
    dirs: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text:
            continue
        path = Path(text).expanduser()
        if not path.is_dir():
            continue
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        dirs.append(str(path))
    return dirs


def _source_backend_controlnet_dirs() -> list[str]:
    values = _source_env_dirs("FORGE_NEO_SOURCE_BACKEND_CONTROLNET_DIRS")
    try:
        from forge_neo.models import model_roots_for_catalog

        values.extend(model_roots_for_catalog("controlnet"))
    except Exception:
        pass
    return _source_existing_dirs(values)


def _source_backend_model_dir_args() -> list[str]:
    try:
        from forge_neo.models import model_roots_for_catalog
    except Exception:
        return []
    args: list[str] = []
    for arg_name, catalogs in _SOURCE_BACKEND_MODEL_ARG_CATALOGS:
        values: list[str] = []
        for catalog in catalogs:
            values.extend(model_roots_for_catalog(catalog))
        directories = _source_existing_dirs(values)
        if arg_name in _SOURCE_BACKEND_SINGLE_MODEL_ARGS:
            directories = directories[:1]
        for directory in directories:
            args.extend([arg_name, directory])
    return args


def _source_backend_upscale_model_dirs() -> list[str]:
    try:
        from forge_neo.models import model_roots_for_catalog
    except Exception:
        return []
    return _source_existing_dirs(model_roots_for_catalog("upscale_models"))


def _source_backend_python_executable(data_root: Path) -> str:
    project_python = DEV_ROOT / "python_embeded" / "python.exe"
    if project_python.is_file():
        return str(project_python)
    project_python_no_ext = DEV_ROOT / "python_embeded" / "python"
    if project_python_no_ext.is_file():
        return str(project_python_no_ext)
    source_python = data_root.parent / "system" / "python" / "python.exe"
    if source_python.is_file():
        return str(source_python)
    source_python_no_ext = data_root.parent / "system" / "python" / "python"
    if source_python_no_ext.is_file():
        return str(source_python_no_ext)
    return sys.executable


def _python_package_version(python_executable: str, package: str) -> str | None:
    probe_code = (
        "import importlib.metadata as m, sys\n"
        "package = sys.argv[1]\n"
        "try:\n"
        "    print(m.version(package))\n"
        "except Exception:\n"
        "    raise SystemExit(1)\n"
    )
    try:
        result = subprocess.run(
            [python_executable, "-s", "-c", probe_code, package],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    version = str(result.stdout or "").strip()
    return version or None


def _ensure_source_backend_bootstrap_packages(python_executable: str) -> None:
    for package, version in _SOURCE_BACKEND_BOOTSTRAP_PACKAGES:
        installed_version = _python_package_version(python_executable, package)
        if installed_version == version:
            continue

        requirement = f"{package}=={version}"
        if installed_version:
            _print_source_backend_log(
                f"source backend bootstrap requires {requirement}; found {package}=={installed_version}, upgrading."
            )
        else:
            _print_source_backend_log(
                f"source backend bootstrap requires {requirement}; package is missing, installing."
            )

        try:
            result = subprocess.run(
                [python_executable, "-s", "-m", "pip", "install", "-U", "--prefer-binary", requirement],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                cwd=str(ROOT),
            )
        except Exception as exc:
            _print_source_backend_log(f"source backend bootstrap failed to install {requirement}: {type(exc).__name__}: {exc}")
            continue

        if result.returncode == 0:
            _print_source_backend_log(f"source backend bootstrap installed {requirement}.")
            continue

        output = _tail(str(result.stdout or ""))
        suffix = f" output={output}" if output else ""
        _print_source_backend_log(
            f"source backend bootstrap failed to install {requirement}; exit_code={result.returncode}.{suffix}"
        )


def _tail(text: str, limit: int = 4000) -> str:
    if len(text) <= limit:
        return text
    return text[-limit:]


def _tail_lines(lines: deque[str], limit: int = 4000) -> str:
    return _tail("\n".join(lines), limit=limit)


def _json_payload_after_prefix(line: str, prefix: str) -> dict[str, Any] | None:
    text = str(line or "")
    index = text.find(prefix)
    if index < 0:
        return None
    payload = text[index + len(prefix) :].strip()
    if not payload:
        return None
    data, _ = _JSON_DECODER.raw_decode(payload)
    return data if isinstance(data, dict) else None


def _source_event_from_line(line: str) -> dict[str, Any] | None:
    try:
        return _json_payload_after_prefix(line, SOURCE_EVENT_PREFIX)
    except json.JSONDecodeError:
        return {"event": "progress", "progress": 0.05, "message": "source backend progress event decode failed"}


def _source_result_from_line(line: str) -> dict[str, Any] | None:
    try:
        return _json_payload_after_prefix(line, SOURCE_RESULT_PREFIX)
    except json.JSONDecodeError as exc:
        return {"job_id": "", "result": {"ok": False, "error": f"Source backend result decode failed: {exc}"}}


def _source_event_log_line(event: dict[str, Any]) -> str:
    compact = dict(event)
    image_value = compact.get("current_image")
    if image_value:
        compact["current_image"] = f"<base64:{len(str(image_value))}>"
    return SOURCE_EVENT_PREFIX + json.dumps(compact, ensure_ascii=True, sort_keys=True)


def _source_event_visible_in_ui(event: dict[str, Any]) -> bool:
    message = str(event.get("message_en") or event.get("message") or event.get("message_cn") or "")
    return message != _SOURCE_BACKEND_COMMAND_LINE_MESSAGE


def _reader_stdout(stream: Any, output_queue: "queue.Queue[object]") -> None:
    try:
        for line in iter(stream.readline, ""):
            output_queue.put(line)
    finally:
        output_queue.put(_STDOUT_DONE)


def _clamped_progress(value: object, default: float = 0.0) -> float:
    try:
        numeric = float(value)
    except Exception:
        numeric = default
    return max(0.0, min(1.0, numeric))


def _forward_source_event(event: dict[str, Any], progress_callback) -> None:
    if progress_callback is None:
        return
    if not _source_event_visible_in_ui(event):
        return
    message_en = str(event.get("message_en") or event.get("message") or "Source backend working")
    message_cn = str(event.get("message_cn") or message_en)
    entry: dict[str, Any] = {
        "event": str(event.get("event") or "progress"),
        "progress": _clamped_progress(event.get("progress", 0.0)),
        "message": message_en,
        "message_en": message_en,
        "message_cn": message_cn,
    }
    for key in ("sampling_step", "sampling_steps", "id_live_preview"):
        if key in event:
            try:
                entry[key] = int(event.get(key) or 0)
            except Exception:
                entry[key] = 0
    if "eta_relative" in event:
        try:
            entry["eta_relative"] = float(event.get("eta_relative") or 0.0)
        except Exception:
            entry["eta_relative"] = 0.0
    current_image = event.get("current_image")
    if current_image:
        entry["current_image"] = str(current_image)
    progress_callback(entry)


def _stop_child_process(process: subprocess.Popen, *, timeout: float = 5.0) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=timeout)


def _read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"ok": False, "error": f"Result file missing: {path}"}
    except json.JSONDecodeError as exc:
        return {"ok": False, "error": f"Result JSON decode failed: {exc}"}


def _source_result_log_line(result: dict[str, Any]) -> str:
    compact = dict(result)
    payload = compact.get("result")
    if isinstance(payload, dict):
        payload = dict(payload)
        if "images" in payload:
            payload["images"] = f"<images:{len(list(payload.get('images') or []))}>"
        compact["result"] = payload
    return SOURCE_RESULT_PREFIX + json.dumps(compact, ensure_ascii=True, sort_keys=True)


def _finish_source_backend_progress_line() -> None:
    global _SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE, _SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH, _SOURCE_BACKEND_CONSOLE_PROGRESS_LINE, _SOURCE_BACKEND_CONSOLE_PROGRESS_COMPLETION_LINE
    if _SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE:
        current_line = str(_SOURCE_BACKEND_CONSOLE_PROGRESS_LINE or "").strip()
        if current_line:
            rendered = f"[Forge Neo]: {current_line}"
            width = max(_SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH, len(rendered))
            print("\r" + rendered.ljust(width), end="", flush=True)
        print("", flush=True)
        _SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE = False
        _SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH = 0
        _SOURCE_BACKEND_CONSOLE_PROGRESS_LINE = ""
        _SOURCE_BACKEND_CONSOLE_PROGRESS_COMPLETION_LINE = ""


def _print_source_backend_log(message: str) -> None:
    text = str(message or "").strip()
    if text:
        _finish_source_backend_progress_line()
        print(f"[Forge Neo]: {text}", flush=True)


def _print_source_backend_progress_line(message: str, *, completion_line: str = "") -> None:
    global _SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE, _SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH, _SOURCE_BACKEND_CONSOLE_PROGRESS_LINE, _SOURCE_BACKEND_CONSOLE_PROGRESS_COMPLETION_LINE
    text = str(message or "").strip()
    if not text:
        return
    rendered = f"[Forge Neo]: {text}"
    completion = str(completion_line or "").strip()
    completion_rendered = f"[Forge Neo]: {completion}" if completion else ""
    width = max(_SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH, len(rendered), len(completion_rendered))
    print("\r" + rendered.ljust(width), end="", flush=True)
    _SOURCE_BACKEND_CONSOLE_PROGRESS_ACTIVE = True
    _SOURCE_BACKEND_CONSOLE_PROGRESS_WIDTH = width
    _SOURCE_BACKEND_CONSOLE_PROGRESS_LINE = text
    _SOURCE_BACKEND_CONSOLE_PROGRESS_COMPLETION_LINE = completion


def _source_tqdm_interval(seconds: float) -> str:
    total = max(0, int(seconds))
    minutes, sec = divmod(total, 60)
    hours, minute = divmod(minutes, 60)
    if hours:
        return f"{hours:d}:{minute:02d}:{sec:02d}"
    return f"{minute:02d}:{sec:02d}"


def _source_tqdm_bar(fraction: float, width: int = 10) -> str:
    scaled = max(0.0, min(float(width), fraction * width))
    whole = int(scaled)
    partial_index = int(round((scaled - whole) * 8))
    if partial_index >= 8:
        whole += 1
        partial_index = 0
    whole = max(0, min(width, whole))
    partial = _SOURCE_BACKEND_TQDM_PARTIAL_BLOCKS[partial_index] if whole < width else ""
    spaces = " " * max(0, width - whole - len(partial))
    return "█" * whole + partial + spaces


def _source_backend_full_args_log_enabled() -> bool:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_LOG_FULL_ARGS", "") or "").strip().casefold()
    return value in {"1", "true", "yes", "on", "full", "verbose"}


def _source_backend_commandline_tokens(commandline_args: str) -> list[str]:
    try:
        return shlex.split(commandline_args or "")
    except ValueError:
        return [part for part in str(commandline_args or "").split() if part]


def _source_backend_commandline_summary(commandline_args: str) -> str:
    tokens = _source_backend_commandline_tokens(commandline_args)
    flags: list[str] = []
    dir_counts = {label: 0 for label in ("ckpt", "text_encoder", "vae", "lora", "upscale", "controlnet")}
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token in _SOURCE_BACKEND_DIR_ARGS:
            dir_counts[_SOURCE_BACKEND_DIR_ARGS[token]] += 1
            index += 2
            continue
        if token in _SOURCE_BACKEND_VALUE_ARGS:
            value = tokens[index + 1] if index + 1 < len(tokens) and not str(tokens[index + 1]).startswith("--") else ""
            if token not in {"--data-dir", "--model-ref"}:
                flags.append(f"{token}={value}" if value else token)
            index += 2 if value else 1
            continue
        if token.startswith("--") and token not in _SOURCE_BACKEND_NOISY_FLAGS:
            flags.append(token)
        index += 1

    flag_text = " ".join(flags) if flags else "(no extra flags)"
    counts_text = " ".join(f"{label}={count}" for label, count in dir_counts.items() if count)
    if counts_text:
        return f"args={flag_text} model_dirs={counts_text}"
    return f"args={flag_text}"


def _source_event_console_line(event: dict[str, Any]) -> str:
    message = str(event.get("message_en") or event.get("message") or event.get("message_cn") or "source backend event")
    if message == _SOURCE_BACKEND_COMMAND_LINE_MESSAGE:
        commandline_args = str(event.get("commandline_args") or "").strip()
        python_executable = str(event.get("python_executable") or "").strip()
        suffix = ""
        if python_executable:
            suffix += f" python={python_executable}"
        if commandline_args:
            if _source_backend_full_args_log_enabled():
                suffix += f" args={commandline_args}"
            else:
                suffix += f" {_source_backend_commandline_summary(commandline_args)}"
        return f"source backend command line prepared{suffix}"
    if not _source_event_visible_in_ui(event):
        return ""
    progress = _clamped_progress(event.get("progress", 0.0))
    suffix = ""
    try:
        step = int(event.get("sampling_step") or 0)
        steps = int(event.get("sampling_steps") or 0)
        if steps > 0:
            suffix += f" step={step}/{steps}"
    except Exception:
        pass
    python_executable = str(event.get("python_executable") or "").strip()
    if python_executable:
        suffix += f" python={python_executable}"
    job_id = str(event.get("job_id") or "")
    if job_id:
        suffix += f" job={job_id[-8:]}"
    return f"{progress * 100:.1f}% {message}{suffix}"


def _source_sampling_progress_console_line(event: dict[str, Any], *, elapsed_seconds: float | None = None) -> str:
    try:
        step = int(event.get("sampling_step") or 0)
        steps = int(event.get("sampling_steps") or 0)
    except Exception:
        return ""
    if step <= 0 or steps <= 0:
        return ""

    message = str(event.get("message_en") or event.get("message") or event.get("message_cn") or "Source backend sampling")
    if "Source backend sampling" not in message and "源后端采样" not in message:
        return ""

    fraction = max(0.0, min(1.0, step / max(steps, 1)))
    percent = int(round(fraction * 100))
    try:
        eta_relative = max(0.0, float(event.get("eta_relative") or 0.0))
    except Exception:
        eta_relative = 0.0
    remaining_steps = max(0, steps - step)
    if eta_relative > 0 and remaining_steps > 0:
        seconds_per_step = eta_relative / remaining_steps
        elapsed = seconds_per_step * step
    else:
        elapsed = max(0.0, float(elapsed_seconds or 0.0))
        seconds_per_step = elapsed / max(step, 1) if elapsed > 0 else 0.0
    eta = eta_relative
    if eta <= 0 and seconds_per_step > 0:
        eta = seconds_per_step * remaining_steps
    rate = f"{seconds_per_step:5.2f}s/it" if seconds_per_step > 0 else " ?s/it"
    return f"{percent:3d}%|{_source_tqdm_bar(fraction)}| {step}/{steps} [{_source_tqdm_interval(elapsed)}<{_source_tqdm_interval(eta)}, {rate}]"


def _source_job_console_line(job_id: str, mode: str, payload: dict[str, Any]) -> str:
    if mode == "controlnet_detect":
        images = payload.get("controlnet_input_images") or payload.get("images") or []
        if not isinstance(images, list):
            images = [images]
        module = str(payload.get("controlnet_module") or payload.get("module") or "None")
        return f"job {job_id[-8:]} queued mode=controlnet_detect module={module} images={len(images)}"
    if mode == "upscale":
        upscaler_1 = str(payload.get("upscaler_1") or "None")
        upscaler_2 = str(payload.get("upscaler_2") or "None")
        resize_mode = str(payload.get("resize_mode") or "Scale by")
        return f"job {job_id[-8:]} queued mode=upscale upscaler={upscaler_1}/{upscaler_2} resize={resize_mode}"
    settings = payload.get("override_settings") if isinstance(payload.get("override_settings"), dict) else {}
    preset = str(settings.get("forge_preset") or payload.get("forge_preset") or "")
    checkpoint = str(payload.get("override_settings_checkpoint") or settings.get("sd_model_checkpoint") or "")
    width = payload.get("width")
    height = payload.get("height")
    steps = payload.get("steps")
    batch_count = payload.get("n_iter")
    batch_size = payload.get("batch_size")
    return (
        f"job {job_id[-8:]} queued mode={mode} preset={preset or '-'} "
        f"checkpoint={checkpoint or '-'} steps={steps} size={width}x{height} "
        f"batch={batch_count}x{batch_size}"
    )


def _source_result_console_line(job_id: str, result: dict[str, Any]) -> str:
    images = list(result.get("images") or [])
    error = str(result.get("error") or "").strip()
    elapsed = result.get("elapsed_seconds")
    status = "ok" if result.get("ok") else "error"
    suffix = f" elapsed={elapsed}s" if elapsed is not None else ""
    if error:
        suffix += f" error={error}"
    return f"job {job_id[-8:]} result status={status} images={len(images)}{suffix}"


def _source_result_infotext(result: dict[str, Any]) -> str:
    raw = result.get("info")
    data: Any = None
    if isinstance(raw, dict):
        data = raw
    else:
        text = str(raw or "").strip()
        if not text:
            return ""
        try:
            data = json.loads(text)
        except Exception:
            return text

    if isinstance(data, dict):
        infotexts = data.get("infotexts")
        if isinstance(infotexts, list):
            for item in infotexts:
                item_text = str(item or "").strip()
                if item_text:
                    return item_text
        infotext = str(data.get("infotext") or "").strip()
        if infotext:
            return infotext
        return json.dumps(data, ensure_ascii=False)
    return str(raw or "")


def _source_info_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    text = str(value or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception:
        return {}
    return dict(data) if isinstance(data, dict) else {}


def _source_child_info(result: object) -> dict[str, Any]:
    debug_info = getattr(result, "debug_info", {}) or {}
    if isinstance(debug_info, dict):
        source_backend = debug_info.get("source_backend")
        if isinstance(source_backend, dict):
            return _source_info_dict(source_backend.get("source_info"))
        return _source_info_dict(debug_info.get("source_info"))
    return {}


def _source_info_texts(info: dict[str, Any], fallback: str, count: int) -> list[str]:
    raw_values = info.get("infotexts")
    values = [str(item or "").strip() for item in raw_values] if isinstance(raw_values, list) else []
    if not values and fallback:
        values = [str(fallback).strip()]
    if count <= 0:
        return values
    while len(values) < count:
        values.append(values[-1] if values else "")
    return values[:count]


def _source_info_list(info: dict[str, Any], key: str) -> list[Any]:
    values = info.get(key)
    return list(values) if isinstance(values, list) else []


def _source_sequential_seed(request: object) -> int:
    seed = _source_seed_value(request)
    if seed >= 0:
        return seed
    return int(random.randrange(0, 2**32 - 1))


def _source_generation_batch_count(request: object) -> int:
    return _source_request_int_arg(request, "batch_count", 1, field="n_iter", minimum=1, maximum=999)


def _source_generation_batch_size(request: object) -> int:
    return _source_request_int_arg(request, "batch_size", 1, field="batch_size", minimum=1, maximum=64)


def _source_save_generation_outputs(images: list[Any], infotexts: list[str], seed: int) -> list[str]:
    if not images:
        return []
    from forge_neo.runtime import _save_images

    paths: list[str] = []
    for index, image in enumerate(images):
        text = infotexts[index] if index < len(infotexts) else (infotexts[-1] if infotexts else "")
        image_seed = seed + index if seed >= 0 else seed
        paths.extend(_save_images([image], text, image_seed))
    return paths


def _source_generation_progress_event(event: dict[str, Any], *, index: int, total: int, requested_steps: int) -> dict[str, Any]:
    mapped = _source_batch_progress_event(event, index=index, total=total, requested_steps=requested_steps)
    message_en = str(event.get("message_en") or event.get("message") or "Source backend working")
    message_cn = str(event.get("message_cn") or message_en)
    mapped.update(
        {
            "message": f"Source backend generation batch {index + 1}/{total}: {message_en}",
            "message_en": f"Source backend generation batch {index + 1}/{total}: {message_en}",
            "message_cn": f"源后端生成批次 {index + 1}/{total}: {message_cn}",
        }
    )
    return mapped


def _source_merged_generation_info(
    request: object,
    *,
    source_infos: list[dict[str, Any]],
    infotexts: list[str],
    image_count: int,
    seed: int,
    batch_count: int,
    batch_size: int,
) -> dict[str, Any]:
    base = dict(next((info for info in source_infos if info), {}))
    all_prompts: list[Any] = []
    all_negative_prompts: list[Any] = []
    all_seeds: list[Any] = []
    all_subseeds: list[Any] = []
    for info in source_infos:
        all_prompts.extend(_source_info_list(info, "all_prompts"))
        all_negative_prompts.extend(_source_info_list(info, "all_negative_prompts"))
        all_seeds.extend(_source_info_list(info, "all_seeds"))
        all_subseeds.extend(_source_info_list(info, "all_subseeds"))

    if not all_prompts:
        all_prompts = [str(getattr(request, "prompt", "") or "") for _index in range(image_count)]
    if not all_negative_prompts:
        all_negative_prompts = [str(getattr(request, "negative_prompt", "") or "") for _index in range(image_count)]
    if not all_seeds:
        all_seeds = [seed + index if seed >= 0 else seed for index in range(image_count)]
    if not all_subseeds:
        subseed = _source_optional_int(getattr(request, "subseed", None))
        all_subseeds = [subseed + index if subseed is not None and subseed >= 0 else -1 for index in range(image_count)]

    prompt_value = str(base.get("prompt") or getattr(request, "prompt", "") or "")
    negative_prompt_value = str(base.get("negative_prompt") or getattr(request, "negative_prompt", "") or "")
    base.update(
        {
            "prompt": prompt_value,
            "all_prompts": all_prompts,
            "negative_prompt": negative_prompt_value,
            "all_negative_prompts": all_negative_prompts,
            "seed": all_seeds[0] if all_seeds else seed,
            "all_seeds": all_seeds,
            "subseed": all_subseeds[0] if all_subseeds else -1,
            "all_subseeds": all_subseeds,
            "subseed_strength": getattr(request, "subseed_strength", None) or 0.0,
            "width": base.get("width", getattr(request, "width", None)),
            "height": base.get("height", getattr(request, "height", None)),
            "sampler_name": base.get("sampler_name", str(getattr(request, "sampler", "") or "")),
            "cfg_scale": base.get("cfg_scale", getattr(request, "cfg_scale", None)),
            "steps": base.get("steps", getattr(request, "steps", None)),
            "batch_size": batch_size,
            "n_iter": batch_count,
            "index_of_first_image": int(base.get("index_of_first_image") or 0),
            "infotexts": list(infotexts),
            "styles": list(getattr(request, "styles", []) or []),
            "version": str(base.get("version") or "forge-neo-source-backend-sequential"),
        }
    )
    return base


def _source_batch_path(value: object) -> Path | None:
    path = None
    if isinstance(value, dict):
        path = value.get("name") or value.get("path")
    if path is None:
        path = getattr(value, "name", None) or getattr(value, "path", None)
    if path is None and isinstance(value, (str, os.PathLike)):
        path = value
    if not path:
        return None
    try:
        return Path(path).expanduser()
    except Exception:
        return None


def _source_batch_label(value: object, index: int) -> str:
    path = _source_batch_path(value)
    if path is not None and path.stem:
        return path.stem
    return f"batch-{index + 1}"


def _source_batch_files_from_dir(path: object) -> list[Path]:
    raw = str(path or "").strip()
    if not raw:
        return []
    root = Path(raw).expanduser()
    if not root.is_dir():
        return []
    return [item for item in sorted(root.iterdir()) if item.is_file() and item.suffix.lower() in _SOURCE_BATCH_IMAGE_EXTENSIONS][:64]


def _source_batch_values(request: object) -> list[object]:
    source_type = str(getattr(request, "batch_source_type", "upload") or "upload").strip().casefold()
    if source_type == "from dir":
        return list(_source_batch_files_from_dir(getattr(request, "batch_input_dir", "")))
    return [item for item in list(getattr(request, "batch_files", []) or []) if item]


def _source_batch_mask_value(request: object, image_value: object) -> object | None:
    mask_dir = str(getattr(request, "batch_inpaint_mask_dir", "") or "").strip()
    if not mask_dir:
        return None
    masks = _source_batch_files_from_dir(mask_dir)
    if not masks:
        return None
    if len(masks) == 1:
        return masks[0]
    image_path = _source_batch_path(image_value)
    if image_path is None:
        return None
    matches = [item for item in masks if item.stem.casefold() == image_path.stem.casefold()]
    return matches[0] if matches else None


def _source_batch_png_info_value(request: object, image_value: object) -> object:
    info_dir = str(getattr(request, "batch_png_info_dir", "") or "").strip()
    image_path = _source_batch_path(image_value)
    if info_dir and image_path is not None:
        candidate = Path(info_dir).expanduser() / image_path.name
        if candidate.is_file():
            return candidate
    return image_value


def _source_batch_png_parameters(request: object, image_value: object, label: str) -> dict[str, object]:
    props = {str(item) for item in list(getattr(request, "batch_png_info_props", []) or [])}
    if not bool(getattr(request, "batch_use_png_info", False)) and "Filename" not in props:
        return {}

    parsed: dict[str, object] = {}
    if bool(getattr(request, "batch_use_png_info", False)):
        info_image = _image_from_any_value(_source_batch_png_info_value(request, image_value))
        if info_image is not None:
            params, _ = png_info_items(info_image)
            parsed = parse_generation_parameters(params)

    selected: dict[str, object] = {}
    if "Prompt" in props and parsed.get("prompt"):
        selected["Prompt"] = parsed.get("prompt")
    if "Negative prompt" in props and parsed.get("negative_prompt"):
        selected["Negative prompt"] = parsed.get("negative_prompt")
    if "Seed" in props and "seed" in parsed:
        selected["Seed"] = parsed.get("seed")
    if "CFG scale" in props and "cfg_scale" in parsed:
        selected["CFG scale"] = parsed.get("cfg_scale")
    if "Sampler" in props and parsed.get("sampler"):
        selected["Sampler"] = parsed.get("sampler")
    if "Steps" in props and "steps" in parsed:
        selected["Steps"] = parsed.get("steps")
    if "Model hash" in props and parsed.get("model_hash"):
        selected["Model hash"] = parsed.get("model_hash")
    if "Filename" in props:
        selected["Filename"] = str(label).replace("(", "\\(").replace(")", "\\)")
    return selected


def _source_batch_request_for_image(request: object, image_value: object, mask_value: object | None, index: int):
    image = _image_from_any_value(image_value)
    if image is None:
        return None
    mask = _image_from_any_value(mask_value) if mask_value is not None else getattr(request, "mask_image", None)
    width = _clamped_int(getattr(request, "width", 512), 512, minimum=64, maximum=8192)
    height = _clamped_int(getattr(request, "height", 512), 512, minimum=64, maximum=8192)
    if int(getattr(request, "selected_scale_tab", 0) or 0) == 1:
        scale = _clamped_float(getattr(request, "resize_scale", 1.0), 1.0, minimum=0.05, maximum=16.0)
        width = max(64, round(image.size[0] * scale / 64) * 64)
        height = max(64, round(image.size[1] * scale / 64) * 64)

    label = _source_batch_label(image_value, index)
    png_parameters = _source_batch_png_parameters(request, image_value, label)
    prompt = str(getattr(request, "prompt", "") or "")
    negative_prompt = str(getattr(request, "negative_prompt", "") or "")
    if "Prompt" in png_parameters:
        prompt += (" " if prompt else "") + str(png_parameters["Prompt"])
    if "Filename" in png_parameters:
        prompt += (" " if prompt else "") + str(png_parameters["Filename"])
    if "Negative prompt" in png_parameters:
        negative_prompt += (" " if negative_prompt else "") + str(png_parameters["Negative prompt"])

    kwargs: dict[str, Any] = {
        "mode": "img2img",
        "prompt": prompt,
        "negative_prompt": negative_prompt,
        "init_image": image,
        "mask_image": mask,
        "width": int(width),
        "height": int(height),
    }
    if "Seed" in png_parameters:
        kwargs["seed"] = _clamped_int(png_parameters.get("Seed"), int(getattr(request, "seed", -1) or -1), minimum=-1, maximum=2**32 - 1)
    if "CFG scale" in png_parameters:
        kwargs["cfg_scale"] = _clamped_float(png_parameters.get("CFG scale"), float(getattr(request, "cfg_scale", 7.0) or 7.0), minimum=0.0, maximum=100.0)
    if "Sampler" in png_parameters:
        kwargs["sampler"] = str(png_parameters.get("Sampler") or getattr(request, "sampler", "Euler"))
    if "Steps" in png_parameters:
        kwargs["steps"] = _clamped_int(png_parameters.get("Steps"), int(getattr(request, "steps", 1) or 1), minimum=1, maximum=150)
    return replace(request, **kwargs)


def _source_batch_progress_event(event: dict[str, Any], *, index: int, total: int, requested_steps: int) -> dict[str, Any]:
    child_progress = _clamped_progress(event.get("progress", 0.0))
    aggregate_progress = min(0.99, max(0.0, (index + child_progress) / max(total, 1)))
    child_step = _clamped_int(event.get("sampling_step", 0), 0, minimum=0, maximum=999999)
    child_steps = _clamped_int(event.get("sampling_steps", requested_steps), requested_steps, minimum=0, maximum=999999)
    steps_per_image = max(child_steps, requested_steps, 1)
    aggregate_steps = steps_per_image * max(total, 1)
    aggregate_step = min(aggregate_steps, index * steps_per_image + child_step)
    message_en = str(event.get("message_en") or event.get("message") or "Source backend working")
    message_cn = str(event.get("message_cn") or message_en)
    mapped = dict(event)
    mapped.update(
        {
            "event": "progress",
            "progress": aggregate_progress,
            "message": f"Source backend batch {index + 1}/{total}: {message_en}",
            "message_en": f"Source backend batch {index + 1}/{total}: {message_en}",
            "message_cn": f"源后端批量 {index + 1}/{total}: {message_cn}",
            "sampling_step": aggregate_step,
            "sampling_steps": aggregate_steps,
        }
    )
    return mapped


def _source_safe_stem(value: object, fallback: str) -> str:
    text = str(value or fallback or "batch").strip() or "batch"
    text = text.translate({ord(char): "_" for char in _SOURCE_BATCH_UNSAFE_FILENAME_CHARS})
    text = text.strip(" .")
    return text[:120] or "batch"


def _source_unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    parent = path.parent
    stem = path.stem
    suffix = path.suffix
    index = 1
    while True:
        candidate = parent / f"{stem}-{index}{suffix}"
        if not candidate.exists():
            return candidate
        index += 1


def _source_save_batch_outputs(request: object, images: list[Any], labels: list[str]) -> list[str]:
    output_dir = str(getattr(request, "batch_output_dir", "") or "").strip()
    if not output_dir:
        return []
    root = Path(output_dir).expanduser()
    root.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for index, image in enumerate(images):
        label = labels[index] if index < len(labels) else f"batch-{index + 1}"
        path = _source_unique_path(root / f"{_source_safe_stem(label, f'batch-{index + 1}')}.png")
        image.save(path, format="PNG")
        paths.append(str(path))
    return paths


def _source_backend_control_path(job_id: str) -> Path:
    safe_job_id = "".join(ch for ch in str(job_id or "") if ch.isalnum() or ch in {"-", "_"})
    if not safe_job_id:
        safe_job_id = f"job-{uuid.uuid4().hex}"
    return Path(tempfile.gettempdir()) / "forge_neo_source_backend_control" / f"{safe_job_id}.json"


def _cleanup_source_backend_control_path(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink()
    except FileNotFoundError:
        pass
    except OSError:
        pass


def _write_source_backend_control(path: Path, status: str) -> bool:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "status": status,
                    "updated_at": time.time(),
                },
                ensure_ascii=True,
            ),
            encoding="utf-8",
        )
        return True
    except OSError:
        return False


def _source_backend_interrupt_grace_seconds() -> float:
    value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_INTERRUPT_GRACE_SECONDS", "") or "").strip()
    if not value:
        return _SOURCE_BACKEND_INTERRUPT_GRACE_SECONDS
    try:
        return max(1.0, float(value))
    except ValueError:
        return _SOURCE_BACKEND_INTERRUPT_GRACE_SECONDS


class _SourceBackendSession:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: subprocess.Popen | None = None
        self._queue: queue.Queue[object] | None = None
        self._key: tuple[str, str] | None = None
        self._stdout_lines: deque[str] = deque(maxlen=300)
        self._last_console_event_line = ""
        self._console_progress_started_at = 0.0
        self._console_progress_key = ""

    def _env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONPATH"] = str(ROOT) + os.pathsep + env.get("PYTHONPATH", "")
        env["PYTHONIOENCODING"] = "utf-8"
        controlnet_dirs = _source_backend_controlnet_dirs()
        if controlnet_dirs:
            env["FORGE_NEO_SOURCE_BACKEND_CONTROLNET_DIRS"] = os.pathsep.join(controlnet_dirs)
        model_dir_args = _source_backend_model_dir_args()
        if model_dir_args:
            env["FORGE_NEO_SOURCE_BACKEND_MODEL_DIR_ARGS_JSON"] = json.dumps(model_dir_args, ensure_ascii=False)
        upscale_model_dirs = _source_backend_upscale_model_dirs()
        if upscale_model_dirs:
            env["FORGE_NEO_SOURCE_BACKEND_UPSCALE_MODEL_DIRS"] = os.pathsep.join(upscale_model_dirs)
        return env

    def _ensure_process(self, data_root: Path, model_ref: Path | None = None) -> subprocess.Popen:
        key = (str(data_root), str(model_ref or ""))
        if self._process is not None and self._process.poll() is None and self._key == key:
            return self._process
        self.stop()
        python_executable = _source_backend_python_executable(data_root)
        _ensure_source_backend_bootstrap_packages(python_executable)
        command = [
            python_executable,
            "-s",
            str(RUNTIME_BACKEND_ROOT / "source_runtime_child.py"),
            "--serve",
            "--backend-root",
            str(SOURCE_WEBUI_ROOT),
            "--data-root",
            str(data_root),
        ]
        if model_ref is not None:
            command.extend(["--model-ref", str(model_ref)])
        _print_source_backend_log(
            f"starting service cwd={ROOT} data_root={data_root} source_webui_root={SOURCE_WEBUI_ROOT} python={python_executable}"
        )
        output_queue: queue.Queue[object] = queue.Queue()
        process = subprocess.Popen(
            command,
            cwd=str(ROOT),
            env=self._env(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        threading.Thread(target=_reader_stdout, args=(process.stdout, output_queue), daemon=True).start()
        self._process = process
        self._queue = output_queue
        self._key = key
        self._stdout_lines.clear()
        self._last_console_event_line = ""
        self._console_progress_started_at = 0.0
        self._console_progress_key = ""
        _print_source_backend_log(f"service pid={process.pid}")
        self._drain_startup_output(process, output_queue)
        return process

    def _source_sampling_elapsed_seconds(self, event: dict[str, Any]) -> float:
        try:
            step = int(event.get("sampling_step") or 0)
        except Exception:
            step = 0
        key = str(event.get("job_id") or event.get("task_id") or "")
        now = time.monotonic()
        if step <= 1 or key != self._console_progress_key or self._console_progress_started_at <= 0:
            self._console_progress_started_at = now
            self._console_progress_key = key
        return max(0.0, now - self._console_progress_started_at)

    def _print_source_event_console(self, event: dict[str, Any]) -> None:
        console_line = _source_event_console_line(event)
        if not console_line:
            return
        if console_line == self._last_console_event_line:
            return
        self._last_console_event_line = console_line
        progress_elapsed = self._source_sampling_elapsed_seconds(event)
        progress_line = _source_sampling_progress_console_line(event, elapsed_seconds=progress_elapsed)
        if progress_line:
            completion_line = ""
            try:
                step = int(event.get("sampling_step") or 0)
                steps = int(event.get("sampling_steps") or 0)
            except Exception:
                step = 0
                steps = 0
            if 0 < step < steps:
                completion_event = dict(event)
                completion_event["sampling_step"] = steps
                completion_event["progress"] = 1.0
                completion_event["eta_relative"] = 0.0
                completion_elapsed = progress_elapsed
                try:
                    eta_relative = max(0.0, float(event.get("eta_relative") or 0.0))
                except Exception:
                    eta_relative = 0.0
                remaining_steps = max(0, steps - step)
                if eta_relative > 0 and remaining_steps > 0:
                    completion_elapsed = eta_relative / remaining_steps * steps
                completion_line = _source_sampling_progress_console_line(completion_event, elapsed_seconds=completion_elapsed)
            _print_source_backend_progress_line(progress_line, completion_line=completion_line)
            return
        _print_source_backend_log(console_line)

    def _drain_startup_output(self, process: subprocess.Popen, output_queue: "queue.Queue[object]", timeout: float = 2.0) -> None:
        deadline = time.monotonic() + timeout
        saw_command_line = False
        while time.monotonic() < deadline and process.poll() is None:
            try:
                item = output_queue.get(timeout=0.05)
            except queue.Empty:
                if saw_command_line:
                    break
                continue

            if item is _STDOUT_DONE:
                self._stdout_lines.append("<source backend stdout closed>")
                _print_source_backend_log("child stdout closed")
                break
            if not isinstance(item, str):
                continue

            line = item.rstrip("\r\n")
            event = _source_event_from_line(line)
            if event is not None:
                self._stdout_lines.append(_source_event_log_line(event))
                self._print_source_event_console(event)
                message = str(event.get("message_en") or event.get("message") or event.get("message_cn") or "")
                if message == _SOURCE_BACKEND_COMMAND_LINE_MESSAGE:
                    saw_command_line = True
                continue

            source_result = _source_result_from_line(line)
            if source_result is not None:
                self._stdout_lines.append(_source_result_log_line(source_result))
                continue
            if line:
                self._stdout_lines.append(line)
                _print_source_backend_log(line)

    def stop(self) -> None:
        process = self._process
        self._process = None
        self._queue = None
        self._key = None
        self._last_console_event_line = ""
        self._console_progress_started_at = 0.0
        self._console_progress_key = ""
        if process is not None:
            _print_source_backend_log(f"stopping service pid={process.pid}")
            _stop_child_process(process)

    def start(self, *, data_root: Path, model_ref: Path | None = None) -> dict[str, Any]:
        with self._lock:
            process = self._ensure_process(data_root, model_ref)
            return {
                "status": "started",
                "pid": process.pid,
                "data_root": str(data_root),
                "backend_root": str(SOURCE_WEBUI_ROOT),
                "source_webui_root": str(SOURCE_WEBUI_ROOT),
                "model_ref": str(model_ref or ""),
                "model_loaded": False,
            }

    def unload_models(self, *, timeout: float = 30.0) -> dict[str, Any]:
        started = time.monotonic()
        with self._lock:
            process = self._process
            if process is None or process.poll() is not None:
                return {
                    "ok": True,
                    "status": "not_running",
                    "model_unload_requested": False,
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                }

            output_queue = self._queue
            if output_queue is None or process.stdin is None:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "status": "pipe_unavailable",
                    "model_unload_requested": False,
                    "error": "Source backend service pipe is unavailable.",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                }

            job_id = f"forge-neo-{uuid.uuid4().hex}"
            self._last_console_event_line = ""
            self._console_progress_started_at = time.monotonic()
            self._console_progress_key = job_id
            _print_source_backend_log(_source_job_console_line(job_id, "unload_models", {}))
            try:
                process.stdin.write(json.dumps({"job_id": job_id, "mode": "unload_models", "payload": {}}, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except OSError as exc:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "status": "write_failed",
                    "model_unload_requested": False,
                    "error": f"Source backend service write failed: {type(exc).__name__}: {exc}",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                }

            deadline = time.monotonic() + timeout
            result: dict[str, Any] | None = None
            while result is None:
                try:
                    item = output_queue.get(timeout=0.1)
                except queue.Empty:
                    item = None

                if item is _STDOUT_DONE:
                    self._stdout_lines.append("<source backend stdout closed>")
                    _print_source_backend_log("child stdout closed")
                elif isinstance(item, str):
                    line = item.rstrip("\r\n")
                    source_result = _source_result_from_line(line)
                    if source_result is not None:
                        self._stdout_lines.append(_source_result_log_line(source_result))
                        if str(source_result.get("job_id") or "") == job_id:
                            payload_result = source_result.get("result")
                            result = payload_result if isinstance(payload_result, dict) else {"ok": False, "error": "Source backend returned invalid result."}
                            _print_source_backend_log(_source_result_console_line(job_id, result))
                            break
                    else:
                        event = _source_event_from_line(line)
                        if event is not None:
                            event_job_id = str(event.get("job_id") or "")
                            self._stdout_lines.append(_source_event_log_line(event))
                            if not event_job_id or event_job_id == job_id:
                                self._print_source_event_console(event)
                        elif line:
                            self._stdout_lines.append(line)
                            _print_source_backend_log(line)

                if time.monotonic() >= deadline and process.poll() is None:
                    _print_source_backend_log(f"job {job_id[-8:]} timed out after {timeout:g}s")
                    self.stop()
                    return {
                        "ok": False,
                        "status_code": 503,
                        "status": "timeout",
                        "model_unload_requested": True,
                        "error": f"Source backend service timed out after {timeout:g}s.",
                        "elapsed_seconds": round(time.monotonic() - started, 3),
                        "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                    }

                if process.poll() is not None and output_queue.empty():
                    _print_source_backend_log(f"service exited code={process.returncode}")
                    break

            if result is None:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "status": "exited",
                    "model_unload_requested": True,
                    "error": "Source backend service exited before returning a result.",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                }
            result.setdefault("ok", True)
            result.setdefault("status", "unloaded")
            result["model_unload_requested"] = True
            result.setdefault("elapsed_seconds", round(time.monotonic() - started, 3))
            return result

    def call(
        self,
        *,
        mode: str,
        payload: dict[str, Any],
        data_root: Path,
        model_ref: Path | None,
        timeout: float,
    ) -> dict[str, Any]:
        started = time.monotonic()
        with self._lock:
            try:
                process = self._ensure_process(data_root, model_ref)
            except OSError as exc:
                return {
                    "ok": False,
                    "status_code": 503,
                    "error": f"Source backend service failed to start: {type(exc).__name__}: {exc}",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                }

            output_queue = self._queue
            if output_queue is None or process.stdin is None:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "error": "Source backend service pipe is unavailable.",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                }

            job_id = f"forge-neo-{uuid.uuid4().hex}"
            job_payload = dict(payload or {})
            self._last_console_event_line = ""
            self._console_progress_started_at = time.monotonic()
            self._console_progress_key = job_id
            _print_source_backend_log(_source_job_console_line(job_id, mode, job_payload))
            try:
                process.stdin.write(json.dumps({"job_id": job_id, "mode": mode, "payload": job_payload}, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except OSError as exc:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "error": f"Source backend service write failed: {type(exc).__name__}: {exc}",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                }

            deadline = time.monotonic() + timeout
            result: dict[str, Any] | None = None
            while result is None:
                try:
                    item = output_queue.get(timeout=0.1)
                except queue.Empty:
                    item = None

                if item is _STDOUT_DONE:
                    self._stdout_lines.append("<source backend stdout closed>")
                    _print_source_backend_log("child stdout closed")
                elif isinstance(item, str):
                    line = item.rstrip("\r\n")
                    source_result = _source_result_from_line(line)
                    if source_result is not None:
                        self._stdout_lines.append(_source_result_log_line(source_result))
                        if str(source_result.get("job_id") or "") == job_id:
                            payload_result = source_result.get("result")
                            result = payload_result if isinstance(payload_result, dict) else {"ok": False, "error": "Source backend returned invalid result."}
                            _print_source_backend_log(_source_result_console_line(job_id, result))
                            break
                    else:
                        event = _source_event_from_line(line)
                        if event is not None:
                            event_job_id = str(event.get("job_id") or "")
                            self._stdout_lines.append(_source_event_log_line(event))
                            if not event_job_id or event_job_id == job_id:
                                self._print_source_event_console(event)
                        elif line:
                            self._stdout_lines.append(line)
                            _print_source_backend_log(line)

                if time.monotonic() >= deadline and process.poll() is None:
                    _print_source_backend_log(f"job {job_id[-8:]} timed out after {timeout:g}s")
                    self.stop()
                    return {
                        "ok": False,
                        "status_code": 503,
                        "error": f"Source backend service timed out after {timeout:g}s.",
                        "elapsed_seconds": round(time.monotonic() - started, 3),
                        "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                    }

                if process.poll() is not None and output_queue.empty():
                    _print_source_backend_log(f"service exited code={process.returncode}")
                    break

            if result is None:
                self.stop()
                return {
                    "ok": False,
                    "status_code": 503,
                    "error": "Source backend service exited before returning a result.",
                    "elapsed_seconds": round(time.monotonic() - started, 3),
                    "debug_info": {"stdout_tail": _tail_lines(self._stdout_lines)},
                }
            result.setdefault("elapsed_seconds", round(time.monotonic() - started, 3))
            return result

    def run(
        self,
        *,
        request: object,
        mode: str,
        payload: dict[str, Any],
        data_root: Path,
        model_ref: Path | None,
        timeout: float,
        started: float,
        progress_callback=None,
        control_callback=None,
    ):
        from forge_neo.runtime import ForgeNeoResult

        with self._lock:
            try:
                process = self._ensure_process(data_root, model_ref)
            except OSError as exc:
                return ForgeNeoResult(
                    status="backend_unavailable",
                    error=f"Source backend service failed to start: {type(exc).__name__}: {exc}",
                    elapsed_seconds=time.monotonic() - started,
                )

            output_queue = self._queue
            if output_queue is None or process.stdin is None:
                self.stop()
                return ForgeNeoResult(
                    status="backend_unavailable",
                    error="Source backend service pipe is unavailable.",
                    elapsed_seconds=time.monotonic() - started,
                )

            job_id = f"forge-neo-{uuid.uuid4().hex}"
            job_payload = dict(payload.get("payload") or {})
            task_id = str(job_payload.get("force_task_id") or "").strip()
            if not task_id:
                task_id = f"forge-neo-source-backend-{mode}-{job_id[-8:]}"
            job_payload["force_task_id"] = task_id
            control_path = _source_backend_control_path(job_id)
            _cleanup_source_backend_control_path(control_path)
            job_payload[_SOURCE_BACKEND_CONTROL_PAYLOAD_KEY] = str(control_path)
            self._last_console_event_line = ""
            self._console_progress_started_at = time.monotonic()
            self._console_progress_key = job_id
            _print_source_backend_log(_source_job_console_line(job_id, mode, job_payload))
            try:
                process.stdin.write(json.dumps({"job_id": job_id, "mode": mode, "payload": job_payload}, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except OSError as exc:
                _cleanup_source_backend_control_path(control_path)
                self.stop()
                return ForgeNeoResult(
                    status="backend_unavailable",
                    error=f"Source backend service write failed: {type(exc).__name__}: {exc}",
                    elapsed_seconds=time.monotonic() - started,
                    debug_info={"stdout_tail": _tail_lines(self._stdout_lines)},
                )

            deadline = time.monotonic() + timeout
            timed_out = False
            interrupted_status = ""
            interrupt_requested_at = 0.0
            interrupted_service_stopped = False
            result: dict[str, Any] | None = None

            while result is None:
                try:
                    item = output_queue.get(timeout=0.1)
                except queue.Empty:
                    item = None

                if item is _STDOUT_DONE:
                    self._stdout_lines.append("<source backend stdout closed>")
                    _print_source_backend_log("child stdout closed")
                elif isinstance(item, str):
                    line = item.rstrip("\r\n")
                    source_result = _source_result_from_line(line)
                    if source_result is not None:
                        self._stdout_lines.append(_source_result_log_line(source_result))
                        if str(source_result.get("job_id") or "") == job_id:
                            payload_result = source_result.get("result")
                            result = payload_result if isinstance(payload_result, dict) else {"ok": False, "error": "Source backend returned invalid result."}
                            _print_source_backend_log(_source_result_console_line(job_id, result))
                            break
                    else:
                        event = _source_event_from_line(line)
                        if event is not None:
                            event_job_id = str(event.get("job_id") or "")
                            self._stdout_lines.append(_source_event_log_line(event))
                            if not event_job_id or event_job_id == job_id:
                                self._print_source_event_console(event)
                                _forward_source_event(event, progress_callback)
                        elif line:
                            self._stdout_lines.append(line)
                            _print_source_backend_log(line)

                if control_callback is not None and process.poll() is None:
                    control_status = control_callback()
                    if control_status in {"stopped", "skipped"} and not interrupted_status:
                        interrupted_status = str(control_status)
                        interrupt_requested_at = time.monotonic()
                        wrote_control = _write_source_backend_control(control_path, interrupted_status)
                        if wrote_control:
                            _print_source_backend_log(f"job {job_id[-8:]} {interrupted_status} requested")
                        else:
                            _print_source_backend_log(f"job {job_id[-8:]} {interrupted_status} request write failed")
                        if progress_callback is not None:
                            progress_callback(
                                {
                                    "event": "progress",
                                    "progress": 0.22,
                                    "message": f"Source backend {interrupted_status} requested",
                                    "message_en": f"Source backend {interrupted_status} requested",
                                    "message_cn": f"源后端已请求 {interrupted_status}",
                                    "source_control_status": interrupted_status,
                                }
                            )

                if interrupted_status and interrupt_requested_at > 0 and process.poll() is None:
                    grace_seconds = _source_backend_interrupt_grace_seconds()
                    if time.monotonic() - interrupt_requested_at >= grace_seconds:
                        interrupted_service_stopped = True
                        _print_source_backend_log(
                            f"job {job_id[-8:]} {interrupted_status} did not finish after {grace_seconds:g}s; restarting service"
                        )
                        _cleanup_source_backend_control_path(control_path)
                        self.stop()
                        break

                if time.monotonic() >= deadline and process.poll() is None:
                    timed_out = True
                    _print_source_backend_log(f"job {job_id[-8:]} timed out after {timeout:g}s")
                    _cleanup_source_backend_control_path(control_path)
                    self.stop()
                    break

                if process.poll() is not None and output_queue.empty():
                    _print_source_backend_log(f"service exited code={process.returncode}")
                    break

            if timed_out:
                _cleanup_source_backend_control_path(control_path)
                return ForgeNeoResult(
                    status="backend_unavailable",
                    error=f"Source backend service timed out after {timeout:g}s.",
                    elapsed_seconds=time.monotonic() - started,
                    debug_info={"stdout_tail": _tail_lines(self._stdout_lines)},
                )

            if interrupted_status:
                _cleanup_source_backend_control_path(control_path)
                return ForgeNeoResult(
                    status=interrupted_status,
                    error=f"Source backend was {interrupted_status}.",
                    elapsed_seconds=time.monotonic() - started,
                    debug_info={
                        "source_backend": {
                            "service_restarted_after_interrupt": interrupted_service_stopped,
                            "interrupt_grace_seconds": _source_backend_interrupt_grace_seconds(),
                            "stdout_tail": _tail_lines(self._stdout_lines),
                        }
                    },
                )

            if result is None:
                _cleanup_source_backend_control_path(control_path)
                self.stop()
                return ForgeNeoResult(
                    status="backend_unavailable",
                    error="Source backend service exited before returning a result.",
                    elapsed_seconds=time.monotonic() - started,
                    debug_info={"stdout_tail": _tail_lines(self._stdout_lines)},
                )

            images = [
                image
                for image in (_decode_api_image(value) for value in list(result.get("images") or []))
                if image is not None
            ]
            expects_images = bool(job_payload.get("send_images", True))
            finished_without_images = not expects_images and bool(result.get("ok", True))
            if progress_callback is not None:
                finish_event: dict[str, Any] = {
                    "event": "finish",
                    "progress": 1.0,
                    "message": "Source backend finished" if images or finished_without_images else "Source backend returned no image",
                    "message_en": "Source backend finished" if images or finished_without_images else "Source backend returned no image",
                    "message_cn": "源后端完成" if images or finished_without_images else "源后端没有返回图片",
                    "sampling_step": 0,
                    "sampling_steps": 0,
                    "eta_relative": 0.0,
                    "id_live_preview": int(time.monotonic() * 1000),
                }
                if images:
                    finish_event["current_image"] = images[0]
                progress_callback(finish_event)
            _cleanup_source_backend_control_path(control_path)
            return ForgeNeoResult(
                images=images,
                infotext=_source_result_infotext(result),
                seed=int(getattr(request, "seed", -1) or -1),
                status="finished" if images or finished_without_images else "error",
                error="" if images or finished_without_images else str(result.get("error") or "Source backend finished without returned images."),
                elapsed_seconds=time.monotonic() - started,
                debug_info={
                    "source_backend": {
                        "mode": mode,
                        "data_root": str(data_root),
                        "model_ref": str(model_ref or data_root / "models"),
                        "persistent": True,
                        "source_info": result.get("info"),
                        "child_elapsed_seconds": result.get("elapsed_seconds"),
                        "source_script_setup": result.get("source_script_setup"),
                        "source_lora_registry": result.get("source_lora_registry"),
                        "source_extra_networks": result.get("source_extra_networks"),
                        "source_model_settings": result.get("source_model_settings"),
                        "resolved_source_modules": result.get("resolved_source_modules"),
                        "stdout_tail": _tail_lines(self._stdout_lines),
                    }
                },
            )


_SOURCE_BACKEND_SESSION = _SourceBackendSession()


def start_source_backend_service(
    data_root: str | os.PathLike[str] | None = None,
    model_ref: str | os.PathLike[str] | None = None,
) -> dict[str, Any]:
    resolved_data_root = Path(data_root).resolve() if data_root else _default_data_root().resolve()
    env_model_ref = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_REF", "") or "").strip()
    resolved_model_ref: Path | None = None
    if model_ref:
        resolved_model_ref = Path(model_ref).resolve()
    elif env_model_ref:
        resolved_model_ref = Path(env_model_ref).resolve()
    return _SOURCE_BACKEND_SESSION.start(data_root=resolved_data_root, model_ref=resolved_model_ref)


def unload_source_backend_models(timeout: float = 30.0) -> dict[str, Any]:
    return _SOURCE_BACKEND_SESSION.unload_models(timeout=timeout)


def _source_backend_additional_modules(request: object) -> list[str]:
    modules: list[str] = []
    for value in list(getattr(request, "text_encoders", []) or []):
        text_encoder = _optional_model_name(value)
        if text_encoder is not None:
            modules.append(text_encoder)
    vae = _optional_model_name(getattr(request, "vae", None))
    if vae is not None:
        modules.append(vae)
    result: list[str] = []
    seen: set[str] = set()
    for value in modules:
        key = Path(str(value)).name.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(str(value))
    return result


def _source_backend_payload(request: object) -> dict[str, Any]:
    mode = _source_backend_mode(request)
    override_settings: dict[str, Any] = _source_saved_override_settings()
    override_settings.update(_source_request_override_settings(request))
    checkpoint = _optional_model_name(getattr(request, "checkpoint", None))
    preset = str(getattr(request, "preset", "") or "").strip()
    if preset:
        override_settings["forge_preset"] = preset
    if checkpoint is not None:
        override_settings["sd_model_checkpoint"] = checkpoint
    additional_modules = _source_backend_additional_modules(request)
    override_settings["forge_additional_modules"] = additional_modules
    low_bit_dtype = _source_low_bit_dtype(getattr(request, "low_bit_dtype", None))
    if low_bit_dtype is not None:
        override_settings["forge_unet_storage_dtype"] = low_bit_dtype
    refiner_checkpoint = _optional_model_name(getattr(request, "refiner_checkpoint", None))
    if refiner_checkpoint is None or not bool(getattr(request, "refiner", False)):
        refiner_checkpoint = None
        refiner_switch_at = None
    else:
        refiner_switch_at = _source_request_float_arg(request, "refiner_switch_at", 0.875, field="refiner_switch_at", minimum=0.0, maximum=1.0)
    script_name = str(getattr(request, "script", "") or "None").strip()
    if not script_name or script_name == "None":
        script_name = None
    has_raw_script_name, raw_script_name = _source_api_raw_field(request, "script_name")
    if has_raw_script_name:
        script_name = raw_script_name
    seed = _source_seed_value(request)

    args: dict[str, Any] = {
        "prompt": _source_prompt_with_loras(getattr(request, "prompt", ""), request),
        "negative_prompt": str(getattr(request, "negative_prompt", "") or ""),
        "styles": list(getattr(request, "styles", []) or []),
        "seed": seed,
        **_source_seed_variance_args(request),
        "seed_resize_from_w": _source_request_int_arg(request, "seed_resize_from_w", -1, field="seed_resize_from_w", minimum=-1, maximum=8192),
        "seed_resize_from_h": _source_request_int_arg(request, "seed_resize_from_h", -1, field="seed_resize_from_h", minimum=-1, maximum=8192),
        "seed_enable_extras": bool(getattr(request, "seed_enable_extras", True)),
        "sampler_name": str(getattr(request, "sampler", "") or "Euler"),
        "scheduler": str(getattr(request, "scheduler", "") or "Beta"),
        "batch_size": _source_request_int_arg(request, "batch_size", 1, field="batch_size", minimum=1, maximum=64),
        "n_iter": _source_request_int_arg(request, "batch_count", 1, field="n_iter", minimum=1, maximum=999),
        "steps": _source_request_int_arg(request, "steps", 1, field="steps", minimum=1, maximum=150),
        "cfg_scale": _source_request_float_arg(request, "cfg_scale", 7.0, field="cfg_scale", minimum=0.0, maximum=100.0),
        "distilled_cfg_scale": _source_request_float_arg(request, "distilled_cfg_scale", 3.5, field="distilled_cfg_scale", minimum=0.0, maximum=100.0),
        "eta": _source_request_optional_float_arg(request, "eta", field="eta", minimum=0.0, maximum=1.0),
        "s_min_uncond": _source_request_optional_float_arg(request, "s_min_uncond", field="s_min_uncond", minimum=0.0, maximum=8.0),
        "s_churn": _source_request_optional_float_arg(request, "s_churn", field="s_churn", minimum=0.0, maximum=100.0),
        "s_tmax": _source_request_optional_float_arg(request, "s_tmax", field="s_tmax", minimum=0.0, maximum=999.0),
        "s_tmin": _source_request_optional_float_arg(request, "s_tmin", field="s_tmin", minimum=0.0, maximum=10.0),
        "s_noise": _source_request_optional_float_arg(request, "s_noise", field="s_noise", minimum=0.0, maximum=1.1),
        "width": _source_request_int_arg(request, "width", 512, field="width", minimum=64, maximum=8192),
        "height": _source_request_int_arg(request, "height", 512, field="height", minimum=64, maximum=8192),
        "restore_faces": getattr(request, "restore_faces", None),
        "tiling": getattr(request, "tiling", None),
        "disable_extra_networks": bool(getattr(request, "disable_extra_networks", False)),
        "override_settings": override_settings,
        "override_settings_restore_afterwards": bool(getattr(request, "override_settings_restore_afterwards", True)),
        "comments": dict(getattr(request, "comments", {}) or {}),
        "firstpass_image": getattr(request, "firstpass_image", None),
        "refiner_checkpoint": refiner_checkpoint,
        "refiner_switch_at": refiner_switch_at,
        "do_not_save_samples": bool(getattr(request, "do_not_save_samples", False)),
        "do_not_save_grid": bool(getattr(request, "do_not_save_grid", False)),
        "send_images": bool(getattr(request, "send_images", True)),
        "save_images": bool(getattr(request, "save_images", False)),
        "alwayson_scripts": source_alwayson_scripts(request),
        "script_name": script_name,
        "script_args": list(_source_script_args_tuple(getattr(request, "script_args", None), script=script_name, mode=mode)),
        "force_task_id": str(getattr(request, "force_task_id", "") or f"forge-neo-source-backend-{mode}"),
    }
    has_raw_force_task_id, raw_force_task_id = _source_api_raw_field(request, "force_task_id")
    if has_raw_force_task_id:
        args["force_task_id"] = raw_force_task_id
    has_raw_infotext, raw_infotext = _source_api_raw_field(request, "infotext")
    if has_raw_infotext:
        args["infotext"] = raw_infotext
    else:
        infotext = str(getattr(request, "infotext", "") or "")
        if infotext:
            args["infotext"] = infotext

    if mode == "txt2img":
        enable_hr = bool(getattr(request, "hires_fix", False))
        args.update(
            {
                "enable_hr": enable_hr,
                "denoising_strength": _source_request_float_arg(request, "hires_denoising_strength", 0.75, field="denoising_strength", minimum=0.0, maximum=1.0)
                if enable_hr
                else None,
                "hr_scale": _source_request_float_arg(request, "hires_scale", 2.0, field="hr_scale", minimum=1.0, maximum=16.0),
                "hr_upscaler": str(getattr(request, "hires_upscaler", "") or "Latent"),
                "hr_second_pass_steps": _source_request_int_arg(request, "hires_steps", 0, field="hr_second_pass_steps", minimum=0, maximum=150),
                "hr_resize_x": _source_request_int_arg(request, "hires_resize_x", 0, field="hr_resize_x", minimum=0, maximum=8192),
                "hr_resize_y": _source_request_int_arg(request, "hires_resize_y", 0, field="hr_resize_y", minimum=0, maximum=8192),
                "firstphase_width": _source_request_int_arg(request, "firstphase_width", 0, field="firstphase_width", minimum=0, maximum=8192),
                "firstphase_height": _source_request_int_arg(request, "firstphase_height", 0, field="firstphase_height", minimum=0, maximum=8192),
                "hr_checkpoint_name": _optional_model_name(
                    getattr(request, "hires_checkpoint", None),
                    none_values={"Use same checkpoint"},
                ),
                "hr_additional_modules": list(getattr(request, "hires_additional_modules", []) or ["Use same choices"]),
                "hr_sampler_name": _optional_model_name(
                    getattr(request, "hires_sampler", None),
                    none_values={"Use same sampler"},
                ),
                "hr_scheduler": _optional_model_name(
                    getattr(request, "hires_scheduler", None),
                    none_values={"Use same scheduler"},
                ),
                "hr_prompt": str(getattr(request, "hires_prompt", "") or ""),
                "hr_negative_prompt": str(getattr(request, "hires_negative_prompt", "") or ""),
                "hr_cfg": _source_request_float_arg(request, "hires_cfg", 1.0, field="hr_cfg", minimum=0.0, maximum=100.0),
                "hr_distilled_cfg": _source_request_float_arg(request, "hires_distilled_cfg", 3.5, field="hr_distilled_cfg", minimum=0.0, maximum=100.0),
            }
        )
    elif mode == "img2img":
        init_image = getattr(request, "init_image", None)
        mask_image = getattr(request, "mask_image", None)
        init_image_encoded = _encode_api_image(init_image)
        mask_image_encoded = _encode_api_image(mask_image)
        init_images_payload = [init_image_encoded] if init_image_encoded else []
        mask_payload = mask_image_encoded or None
        if bool(getattr(request, "source_api_request", False)) and _source_api_has_field(request, "init_images"):
            init_images_payload = list(getattr(request, "source_api_init_images", []) or [])
        if bool(getattr(request, "source_api_request", False)) and _source_api_has_field(request, "mask"):
            mask_payload = getattr(request, "source_api_mask", None)
        args.update(
            {
                "init_images": init_images_payload,
                "mask": mask_payload,
                "include_init_images": bool(getattr(request, "include_init_images", False)),
                "resize_mode": getattr(request, "resize_mode") if _source_api_has_field(request, "resize_mode") else _resize_mode_index(getattr(request, "resize_mode", "Crop and resize")),
                "denoising_strength": _source_request_float_arg(request, "denoising_strength", 0.75, field="denoising_strength", minimum=0.0, maximum=1.0),
                "image_cfg_scale": getattr(request, "image_cfg_scale", None),
                "mask_blur": _source_request_int_arg(request, "mask_blur", 4, field="mask_blur", minimum=0, maximum=256),
                "mask_round": bool(getattr(request, "mask_round", True)),
                "inpainting_fill": getattr(request, "inpainting_fill") if _source_api_has_field(request, "inpainting_fill") else _inpainting_fill_index(getattr(request, "inpainting_fill", "original")),
                "inpaint_full_res": str(getattr(request, "inpaint_area", "") or "Only masked").lower() == "only masked",
                "inpaint_full_res_padding": _source_request_int_arg(request, "inpaint_padding", 32, field="inpaint_full_res_padding", minimum=0, maximum=512),
                "inpainting_mask_invert": 1
                if str(getattr(request, "inpainting_mask_mode", "") or "").lower() == "inpaint not masked"
                else 0,
                "initial_noise_multiplier": _source_request_optional_float_arg(request, "initial_noise_multiplier", field="initial_noise_multiplier", minimum=0.0, maximum=100.0),
                "latent_mask": getattr(request, "latent_mask", None),
            }
        )

    args = _source_apply_raw_request_model_values(args, request)
    args = _source_payload_without_ignored_api_fields(args, request)
    args = _source_payload_with_infotext_unset_fields(args, request)
    return {"mode": mode, "payload": args}


def _run_source_backend_batch(
    request: object,
    *,
    data_root: Path,
    model_ref: Path | None,
    timeout: float,
    started: float,
    progress_callback=None,
    control_callback=None,
):
    from forge_neo.runtime import ForgeNeoResult

    values = _source_batch_values(request)
    total = len(values)
    if total <= 0:
        if progress_callback is not None:
            progress_callback(
                {
                    "event": "finish",
                    "progress": 1.0,
                    "message": "Source backend batch has no input images",
                    "message_en": "Source backend batch has no input images",
                    "message_cn": "源后端批量没有输入图片",
                    "sampling_step": 0,
                    "sampling_steps": 0,
                }
            )
        return ForgeNeoResult(
            images=[],
            infotext="",
            seed=int(getattr(request, "seed", -1) or -1),
            status="error",
            error="Source backend batch has no input images.",
            elapsed_seconds=time.monotonic() - started,
            debug_info={"source_backend": {"mode": "batch", "batch_count": 0}},
        )

    if progress_callback is not None:
        progress_callback(
            {
                "event": "progress",
                "progress": 0.04,
                "message": f"Source backend batch queued {total} images",
                "message_en": f"Source backend batch queued {total} images",
                "message_cn": f"源后端批量已排队 {total} 张图片",
                "sampling_step": 0,
                "sampling_steps": max(1, int(getattr(request, "steps", 1) or 1)) * total,
            }
        )

    images: list[Any] = []
    infotexts: list[str] = []
    labels: list[str] = []
    skipped_inputs: list[str] = []
    requested_steps = max(1, int(getattr(request, "steps", 1) or 1))
    for index, value in enumerate(values):
        if control_callback is not None and control_callback() in {"stopped", "skipped"}:
            status = str(control_callback())
            return ForgeNeoResult(
                images=images,
                infotext="\n\n".join(infotexts),
                seed=int(getattr(request, "seed", -1) or -1),
                status=status,
                error=f"Source backend batch was {status}.",
                output_paths=_source_save_batch_outputs(request, images, labels),
                elapsed_seconds=time.monotonic() - started,
                debug_info={"source_backend": {"mode": "batch", "batch_count": total, "skipped_inputs": skipped_inputs}},
            )

        label = _source_batch_label(value, index)
        per_request = _source_batch_request_for_image(request, value, _source_batch_mask_value(request, value), index)
        if per_request is None:
            skipped_inputs.append(label)
            continue
        child_payload = _source_backend_payload(per_request)
        child_payload["payload"]["force_task_id"] = f"forge-neo-source-backend-batch-{index + 1}"

        def batch_progress(event: dict[str, Any], *, item_index=index) -> None:
            if progress_callback is None:
                return
            progress_callback(
                _source_batch_progress_event(
                    event,
                    index=item_index,
                    total=total,
                    requested_steps=max(1, int(getattr(per_request, "steps", requested_steps) or requested_steps)),
                )
            )

        child_result = _SOURCE_BACKEND_SESSION.run(
            request=per_request,
            mode="img2img",
            payload=child_payload,
            data_root=data_root,
            model_ref=model_ref,
            timeout=timeout,
            started=started,
            progress_callback=batch_progress,
            control_callback=control_callback,
        )
        if child_result.status not in {"finished"}:
            return ForgeNeoResult(
                images=images + list(child_result.images or []),
                infotext="\n\n".join([*infotexts, str(child_result.infotext or "").strip()]).strip(),
                seed=int(getattr(request, "seed", -1) or -1),
                status=child_result.status,
                error=child_result.error,
                output_paths=_source_save_batch_outputs(request, images, labels),
                elapsed_seconds=time.monotonic() - started,
                debug_info={
                    "source_backend": {
                        "mode": "batch",
                        "batch_count": total,
                        "failed_index": index,
                        "skipped_inputs": skipped_inputs,
                        "child_debug": child_result.debug_info,
                    }
                },
            )
        child_images = list(child_result.images or [])
        images.extend(child_images)
        infotext = str(child_result.infotext or "").strip()
        if infotext:
            infotexts.append(infotext)
        labels.extend([label] * max(1, len(child_images)))

    output_paths = _source_save_batch_outputs(request, images, labels)
    if progress_callback is not None:
        finish_event: dict[str, Any] = {
            "event": "finish",
            "progress": 1.0,
            "message": "Source backend batch finished" if images else "Source backend batch returned no image",
            "message_en": "Source backend batch finished" if images else "Source backend batch returned no image",
            "message_cn": "源后端批量完成" if images else "源后端批量没有返回图片",
            "sampling_step": 0,
            "sampling_steps": 0,
            "eta_relative": 0.0,
            "id_live_preview": int(time.monotonic() * 1000),
        }
        if images:
            finish_event["current_image"] = images[0]
        progress_callback(finish_event)

    return ForgeNeoResult(
        images=images,
        infotext="\n\n".join(infotexts),
        seed=int(getattr(request, "seed", -1) or -1),
        status="finished" if images else "error",
        error="" if images else "Source backend batch finished without returned images.",
        output_paths=output_paths,
        elapsed_seconds=time.monotonic() - started,
        debug_info={
            "source_backend": {
                "mode": "batch",
                "batch_count": total,
                "image_count": len(images),
                "output_paths": output_paths,
                "skipped_inputs": skipped_inputs,
            }
        },
    )


def _run_source_backend_generation_batches(
    request: object,
    *,
    mode: str,
    data_root: Path,
    model_ref: Path | None,
    timeout: float,
    started: float,
    progress_callback=None,
    control_callback=None,
):
    from forge_neo.runtime import ForgeNeoResult

    batch_count = _source_generation_batch_count(request)
    batch_size = _source_generation_batch_size(request)
    seed = _source_sequential_seed(request)
    requested_steps = max(1, int(getattr(request, "steps", 1) or 1))
    if progress_callback is not None:
        progress_callback(
            {
                "event": "progress",
                "progress": 0.04,
                "message": f"Source backend generation queued {batch_count} batches",
                "message_en": f"Source backend generation queued {batch_count} batches",
                "message_cn": f"源后端生成已排队 {batch_count} 个批次",
                "sampling_step": 0,
                "sampling_steps": requested_steps * batch_count,
            }
        )

    images: list[Any] = []
    infotexts: list[str] = []
    output_paths: list[str] = []
    source_infos: list[dict[str, Any]] = []
    for index in range(batch_count):
        if control_callback is not None:
            control_status = control_callback()
            if control_status in {"stopped", "skipped"}:
                return ForgeNeoResult(
                    images=images,
                    infotext=infotexts[0] if infotexts else "",
                    seed=seed,
                    status=str(control_status),
                    error=f"Source backend generation was {control_status}.",
                    output_paths=output_paths,
                    elapsed_seconds=time.monotonic() - started,
                    debug_info={
                        "source_backend": {
                            "mode": mode,
                            "sequential_batches": True,
                            "batch_count": batch_count,
                            "batch_size": batch_size,
                            "completed_batches": index,
                            "source_info": _source_merged_generation_info(
                                request,
                                source_infos=source_infos,
                                infotexts=infotexts,
                                image_count=len(images),
                                seed=seed,
                                batch_count=batch_count,
                                batch_size=batch_size,
                            ),
                        }
                    },
                )

        child_seed = seed + index * batch_size if seed >= 0 else seed
        task_prefix = str(getattr(request, "force_task_id", "") or f"forge-neo-source-backend-{mode}")
        child_request = replace(
            request,
            batch_count=1,
            seed=child_seed,
            force_task_id=f"{task_prefix}-batch-{index + 1}",
        )
        child_payload = _source_backend_payload(child_request)
        child_payload["payload"]["n_iter"] = 1
        child_payload["payload"]["seed"] = child_seed
        child_payload["payload"]["batch_size"] = batch_size
        child_payload["payload"]["force_task_id"] = str(
            getattr(child_request, "force_task_id", "") or f"forge-neo-source-backend-{mode}-batch-{index + 1}"
        )

        def generation_progress(event: dict[str, Any], *, item_index=index) -> None:
            if progress_callback is None:
                return
            progress_callback(
                _source_generation_progress_event(
                    event,
                    index=item_index,
                    total=batch_count,
                    requested_steps=max(1, int(getattr(child_request, "steps", requested_steps) or requested_steps)),
                )
            )

        child_result = _SOURCE_BACKEND_SESSION.run(
            request=child_request,
            mode=mode,
            payload=child_payload,
            data_root=data_root,
            model_ref=model_ref,
            timeout=timeout,
            started=started,
            progress_callback=generation_progress,
            control_callback=control_callback,
        )
        child_images = list(child_result.images or [])
        child_info = _source_child_info(child_result)
        child_infotexts = _source_info_texts(child_info, str(child_result.infotext or "").strip(), len(child_images))
        if child_info:
            source_infos.append(child_info)
        if child_result.status == "finished":
            images.extend(child_images)
            infotexts.extend(child_infotexts)
            output_paths.extend(list(child_result.output_paths or []) or _source_save_generation_outputs(child_images, child_infotexts, child_seed))
            continue

        if child_images:
            images.extend(child_images)
            infotexts.extend(child_infotexts)
            output_paths.extend(list(child_result.output_paths or []) or _source_save_generation_outputs(child_images, child_infotexts, child_seed))
        return ForgeNeoResult(
            images=images,
            infotext=infotexts[0] if infotexts else str(child_result.infotext or ""),
            seed=seed,
            status=child_result.status,
            error=child_result.error,
            output_paths=output_paths,
            elapsed_seconds=time.monotonic() - started,
            debug_info={
                "source_backend": {
                    "mode": mode,
                    "sequential_batches": True,
                    "batch_count": batch_count,
                    "batch_size": batch_size,
                    "failed_batch": index + 1,
                    "child_debug": child_result.debug_info,
                    "source_info": _source_merged_generation_info(
                        request,
                        source_infos=source_infos,
                        infotexts=infotexts,
                        image_count=len(images),
                        seed=seed,
                        batch_count=batch_count,
                        batch_size=batch_size,
                    ),
                }
            },
        )

    finished_without_images = not bool(getattr(request, "send_images", True))
    if progress_callback is not None:
        finish_event: dict[str, Any] = {
            "event": "finish",
            "progress": 1.0,
            "message": "Source backend generation finished" if images or finished_without_images else "Source backend returned no image",
            "message_en": "Source backend generation finished" if images or finished_without_images else "Source backend returned no image",
            "message_cn": "源后端生成完成" if images or finished_without_images else "源后端没有返回图片",
            "sampling_step": 0,
            "sampling_steps": 0,
            "eta_relative": 0.0,
            "id_live_preview": int(time.monotonic() * 1000),
        }
        if images:
            finish_event["current_image"] = images[0]
        progress_callback(finish_event)

    source_info = _source_merged_generation_info(
        request,
        source_infos=source_infos,
        infotexts=infotexts,
        image_count=len(images),
        seed=seed,
        batch_count=batch_count,
        batch_size=batch_size,
    )
    return ForgeNeoResult(
        images=images,
        infotext=infotexts[0] if infotexts else "",
        seed=seed,
        status="finished" if images or finished_without_images else "error",
        error="" if images or finished_without_images else "Source backend generation finished without returned images.",
        output_paths=output_paths,
        elapsed_seconds=time.monotonic() - started,
        debug_info={
            "source_backend": {
                "mode": mode,
                "sequential_batches": True,
                "batch_count": batch_count,
                "batch_size": batch_size,
                "image_count": len(images),
                "output_paths": output_paths,
                "source_info": source_info,
            }
        },
    )


def run_source_backend_processing(request: object, progress_callback=None, control_callback=None):
    from forge_neo.runtime import ForgeNeoResult

    started = time.monotonic()
    if control_callback is not None and control_callback() in {"stopped", "skipped"}:
        return ForgeNeoResult(status="stopped", error="Source backend processing was interrupted before start.")

    payload = _source_backend_payload(request)
    mode = str(payload.get("mode") or "txt2img")
    data_root = _default_data_root().resolve()
    model_ref_value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_REF", "") or "").strip()
    model_ref = Path(model_ref_value).resolve() if model_ref_value else None
    timeout = float(os.environ.get("FORGE_NEO_SOURCE_BACKEND_TIMEOUT", "1800") or 1800)

    if mode == "batch":
        return _run_source_backend_batch(
            request,
            data_root=data_root,
            model_ref=model_ref,
            timeout=timeout,
            started=started,
            progress_callback=progress_callback,
            control_callback=control_callback,
        )
    if mode not in {"txt2img", "img2img"}:
        return ForgeNeoResult(
            status="backend_unavailable",
            error=f"Source backend adapter currently supports txt2img/img2img/batch only, got {mode!r}.",
            elapsed_seconds=time.monotonic() - started,
        )
    if _source_generation_batch_count(request) > 1:
        return _run_source_backend_generation_batches(
            request,
            mode=mode,
            data_root=data_root,
            model_ref=model_ref,
            timeout=timeout,
            started=started,
            progress_callback=progress_callback,
            control_callback=control_callback,
        )

    if progress_callback is not None:
        progress_callback(
            {
                "event": "progress",
                "progress": 0.04,
                "message": "Source backend queued",
                "message_en": "Source backend queued",
                "message_cn": "源后端排队中",
            }
        )

    return _SOURCE_BACKEND_SESSION.run(
        request=request,
        mode=mode,
        payload=payload,
        data_root=data_root,
        model_ref=model_ref,
        timeout=timeout,
        started=started,
        progress_callback=progress_callback,
        control_callback=control_callback,
    )


def run_source_backend_upscale(image: object, request: object, progress_callback=None, control_callback=None):
    from forge_neo.runtime import ForgeNeoResult

    started = time.monotonic()
    if control_callback is not None and control_callback() in {"stopped", "skipped"}:
        return ForgeNeoResult(status="stopped", error="Source backend upscaler was interrupted before start.")

    payload = {
        "mode": "upscale",
        "payload": {
            "image": _encode_api_image(image),
            "resize_mode": str(getattr(request, "resize_mode", "") or "Scale by"),
            "resize_scale": float(getattr(request, "resize_scale", 4.0) or 4.0),
            "max_side_length": int(getattr(request, "max_side_length", 0) or 0),
            "resize_width": int(getattr(request, "resize_width", 1024) or 1024),
            "resize_height": int(getattr(request, "resize_height", 1024) or 1024),
            "crop_to_fit": bool(getattr(request, "crop_to_fit", True)),
            "upscaler_1": str(getattr(request, "upscaler_1", "") or "None"),
            "upscaler_2": str(getattr(request, "upscaler_2", "") or "None"),
            "upscaler_2_visibility": float(getattr(request, "upscaler_2_visibility", 0.0) or 0.0),
            "color_correction": bool(getattr(request, "color_correction", False)),
        },
    }
    if not payload["payload"]["image"]:
        return ForgeNeoResult(status="error", error="Source backend upscaler has no input image.")

    data_root = _default_data_root().resolve()
    model_ref_value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_REF", "") or "").strip()
    model_ref = Path(model_ref_value).resolve() if model_ref_value else None
    timeout = float(os.environ.get("FORGE_NEO_SOURCE_BACKEND_UPSCALE_TIMEOUT", os.environ.get("FORGE_NEO_SOURCE_BACKEND_TIMEOUT", "1800")) or 1800)

    if progress_callback is not None:
        progress_callback(
            {
                "event": "progress",
                "progress": 0.04,
                "message": "Source backend upscaler queued",
                "message_en": "Source backend upscaler queued",
                "message_cn": "源后端放大器排队中",
            }
        )

    return _SOURCE_BACKEND_SESSION.run(
        request=request,
        mode="upscale",
        payload=payload,
        data_root=data_root,
        model_ref=model_ref,
        timeout=timeout,
        started=started,
        progress_callback=progress_callback,
        control_callback=control_callback,
    )


def run_source_tipo_prompt(values: dict[str, Any], progress_callback=None, control_callback=None):
    from forge_neo.runtime import ForgeNeoRequest, ForgeNeoResult
    from forge_neo.tipo_compat import tipo_arg_dict

    started = time.monotonic()
    if control_callback is not None and control_callback() in {"stopped", "skipped"}:
        return ForgeNeoResult(status="stopped", error="TIPO prompt generation was interrupted before start.")

    tipo_values = tipo_arg_dict(values)
    tag_prompt = str(tipo_values.get("tag_prompt") or "").strip()
    nl_prompt = str(tipo_values.get("nl_prompt") or "")
    if not tag_prompt and not nl_prompt.strip():
        return ForgeNeoResult(status="error", error="TIPO requires a tag or natural language prompt.")

    payload_values = dict(tipo_values)
    payload_values["aspect_ratio"] = float(values.get("aspect_ratio") or 1.0)
    payload_values["send_images"] = False
    payload_values["save_images"] = False
    payload = {
        "mode": "tipo_prompt",
        "payload": payload_values,
    }
    data_root = _default_data_root().resolve()
    model_ref_value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_REF", "") or "").strip()
    model_ref = Path(model_ref_value).resolve() if model_ref_value else None
    timeout = float(
        os.environ.get(
            "FORGE_NEO_SOURCE_BACKEND_TIPO_TIMEOUT",
            os.environ.get("FORGE_NEO_SOURCE_BACKEND_TIMEOUT", "1800"),
        )
        or 1800
    )
    request = ForgeNeoRequest(
        mode="txt2img",
        prompt=tag_prompt,
        seed=int(tipo_values.get("seed", -1) or -1),
        send_images=False,
        save_images=False,
        force_task_id="forge-neo-tipo-prompt",
    )
    return _SOURCE_BACKEND_SESSION.run(
        request=request,
        mode="tipo_prompt",
        payload=payload,
        data_root=data_root,
        model_ref=model_ref,
        timeout=timeout,
        started=started,
        progress_callback=progress_callback,
        control_callback=control_callback,
    )


def run_source_controlnet_detect(values: dict[str, Any]) -> dict[str, Any]:
    data_root = _default_data_root().resolve()
    model_ref_value = str(os.environ.get("FORGE_NEO_SOURCE_BACKEND_MODEL_REF", "") or "").strip()
    model_ref = Path(model_ref_value).resolve() if model_ref_value else None
    timeout = float(os.environ.get("FORGE_NEO_SOURCE_BACKEND_CONTROLNET_TIMEOUT", "180") or 180)
    return _SOURCE_BACKEND_SESSION.call(
        mode="controlnet_detect",
        payload=values or {},
        data_root=data_root,
        model_ref=model_ref,
        timeout=timeout,
    )
