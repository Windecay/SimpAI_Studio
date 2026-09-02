import json
import logging
import os
import hashlib
import sys
import tempfile
import threading
import uuid
import html

import cv2
import gradio as gr
import numpy as np
import torch
from contextlib import nullcontext
from ui.update_helpers import gr_update

from enhanced import sam3_comfy31

_VIDEO_PREDICTOR = None
_VIDEO_PREDICTOR_CKPT = None
_SAM3_CANCEL_EVENTS: dict[str, threading.Event] = {}
_SAM3_CANCEL_LOCK = threading.Lock()
logger = logging.getLogger(__name__)
SAM3_CHECKPOINT_URL = sam3_comfy31.SAM31_CHECKPOINT_URL
SAM3_CHECKPOINT_FILENAME = sam3_comfy31.SAM31_CHECKPOINT_FILENAME


class Sam3Cancelled(RuntimeError):
    pass


def _cancel_key(token: str | None) -> str:
    return str(token or "webui").strip() or "webui"


def reset_sam3_cancel(token: str | None = None) -> None:
    key = _cancel_key(token)
    with _SAM3_CANCEL_LOCK:
        _SAM3_CANCEL_EVENTS[key] = threading.Event()


def request_sam3_cancel(token: str | None = None) -> None:
    key = _cancel_key(token)
    with _SAM3_CANCEL_LOCK:
        event = _SAM3_CANCEL_EVENTS.get(key)
        if event is None:
            event = threading.Event()
            _SAM3_CANCEL_EVENTS[key] = event
        event.set()


def clear_sam3_cancel(token: str | None = None) -> None:
    key = _cancel_key(token)
    with _SAM3_CANCEL_LOCK:
        _SAM3_CANCEL_EVENTS.pop(key, None)


def is_sam3_cancelled(token: str | None = None) -> bool:
    key = _cancel_key(token)
    with _SAM3_CANCEL_LOCK:
        event = _SAM3_CANCEL_EVENTS.get(key)
        return bool(event and event.is_set())


def make_sam3_cancel_check(token: str | None = None):
    key = _cancel_key(token)

    def _check() -> None:
        if is_sam3_cancelled(key):
            raise Sam3Cancelled("SAM3 mask generation cancelled.")

    return _check


def translate_prompt_slim(prompt_text):
    import enhanced.translator as translator
    from enhanced.vlm import vlm

    prompt_text = translator.normalize_prompt(prompt_text)
    try:
        return translator.normalize_prompt(vlm.translate(prompt_text, "Slim Model"))
    except Exception:
        return translator.normalize_prompt(prompt_text)


def on_video_upload_with_preview(video_path, state_params=None):
    if video_path is None:
        return None, None, None
    try:
        import modules.util as util

        preview_path = util.compress_video(video_path)
        gr.Info(_sam3_text(state_params, "Compression completed!", "视频压缩完成！"))
        return preview_path, video_path, "sam3"
    except Exception as e:
        gr.Warning(_sam3_text(state_params, f"Compression failed: {e}", f"视频压缩失败：{e}"))
        return video_path, video_path, "sam3"


def _media_value_path(value) -> str | None:
    try:
        from extras.media_normalize import normalize_gradio_file_value

        normalized = normalize_gradio_file_value(value)
        if isinstance(normalized, str) and normalized.strip():
            return normalized.strip()
    except Exception:
        pass
    if isinstance(value, str) and value.strip():
        return value.strip()
    if isinstance(value, dict):
        for key in ("path", "name", "orig_name", "filename", "file"):
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
            if hasattr(item, "name"):
                try:
                    name = item.name
                    if isinstance(name, str) and name.strip():
                        return name.strip()
                except Exception:
                    pass
    if hasattr(value, "path"):
        try:
            path = value.path
            if isinstance(path, str) and path.strip():
                return path.strip()
        except Exception:
            pass
    if hasattr(value, "name"):
        try:
            name = value.name
            if isinstance(name, str) and name.strip():
                return name.strip()
        except Exception:
            pass
    return None


def _preview_path_for_original(original_path: str | None) -> str | None:
    if not original_path:
        return None
    base, _ = os.path.splitext(str(original_path))
    return os.path.abspath(f"{base}_preview.mp4")


def parse_sam3_trim_payload(payload) -> dict | None:
    if not payload:
        return None
    if isinstance(payload, dict):
        data = payload
    else:
        try:
            data = json.loads(str(payload))
        except Exception:
            return None
    try:
        def read_float(*keys, default=0.0):
            for key in keys:
                if key in data and data.get(key) not in (None, ""):
                    return float(data.get(key))
            return default

        start = max(0.0, read_float("trim_start", "start", default=0.0))
        end = max(0.0, read_float("trim_end", "end", default=0.0))
        video_duration = max(0.0, read_float("video_duration", "source_duration", default=0.0))
    except Exception:
        return None
    if end <= start + 0.001 and video_duration > start + 0.001:
        end = video_duration
    if end <= start + 0.001:
        return None
    return {
        "trim_start": round(start, 3),
        "trim_end": round(end, 3),
        "duration": round(end - start, 3),
    }


def trim_original_video_for_sam3(original_video, trim_payload) -> str | None:
    original_path = _media_value_path(original_video)
    edit = parse_sam3_trim_payload(trim_payload)
    if not original_path or not edit:
        return None
    original_path = os.path.abspath(original_path)
    if not os.path.exists(original_path):
        return None
    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        raise RuntimeError("ffmpeg is not available for SAM3 original video trim")

    import subprocess

    start = float(edit["trim_start"])
    duration = max(0.001, float(edit["duration"]))
    ext = ".mp4"
    signature = f"{original_path}|{os.path.getmtime(original_path)}|{start:.3f}|{duration:.3f}|exact-reencode-v1"
    digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    out_dir = sam3_mask_output_dir("source_trims")
    out_path = os.path.abspath(os.path.join(out_dir, f"sam3_source_trim_{digest[:16]}{ext}"))
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return out_path

    tmp_path = f"{out_path}.tmp{ext}"
    if os.path.exists(tmp_path):
        try:
            os.remove(tmp_path)
        except Exception:
            pass

    cmd = [
        ffmpeg_exe,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        original_path,
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "18",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        "-avoid_negative_ts",
        "make_zero",
        tmp_path,
    ]
    completed = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300)
    if completed.returncode != 0 or not os.path.exists(tmp_path) or os.path.getsize(tmp_path) <= 0:
        raise RuntimeError((completed.stderr or completed.stdout or "SAM3 original video trim failed")[-1000:])
    os.replace(tmp_path, out_path)
    return out_path


def prefer_current_sam3_video_path(current_video, original_video=None):
    current_path = _media_value_path(current_video)
    original_path = _media_value_path(original_video)
    if current_path and original_path:
        current_abs = os.path.abspath(current_path)
        original_abs = os.path.abspath(original_path)
        if current_abs == original_abs:
            return original_path
        preview_abs = _preview_path_for_original(original_path)
        if preview_abs and current_abs == preview_abs:
            return original_path
        return current_path
    return original_path or current_path


def resolve_sam3_backend_video_path(current_video, original_video=None, trim_payload=None):
    if parse_sam3_trim_payload(trim_payload):
        trimmed = trim_original_video_for_sam3(original_video, trim_payload)
        if trimmed:
            return trimmed
    return prefer_current_sam3_video_path(current_video, original_video)


def cleanup_translator_and_vram():
    try:
        import enhanced.translator as translator

        translator.free_translator_model()
    except Exception:
        pass
    try:
        import gc

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
        gc.collect()
    except Exception:
        pass
    try:
        import ldm_patched.modules.model_management as model_management

        model_management.soft_empty_cache()
    except Exception:
        pass


def mask_opts(
    score_threshold_detection,
    new_det_thresh,
    fill_hole_area,
    recondition_every_nth_frame,
    postprocess_strength,
    invert_mask,
):
    return dict(
        precision="fp16",
        score_threshold_detection=float(score_threshold_detection or 0.0),
        new_det_thresh=float(new_det_thresh or 0.0),
        det_nms_thresh=0.1,
        fill_hole_area=int(fill_hole_area or 0),
        recondition_every_nth_frame=int(recondition_every_nth_frame or 1),
        image_size=1008,
        postprocess_strength=int(postprocess_strength or 0),
        postprocess_min_area=0,
        debug_print=False,
        invert_mask=bool(invert_mask),
    )


def _run_failure_cleanup(unload_callback=None):
    if unload_callback is None:
        return
    try:
        unload_callback(False)
    except Exception:
            logger.exception("SAM3 unload callback failed")


def _sam3_text(state_params, en, cn):
    lang = state_params.get("__lang") if isinstance(state_params, dict) else state_params
    value = str(lang or "en").strip().lower()
    return cn if value.startswith("cn") or value.startswith("zh") or value in {"中文", "chinese"} else en


def stop_webui_sam3_generation(state_params=None):
    request_sam3_cancel("webui")
    gr.Warning(_sam3_text(state_params, "SAM3 stop requested.", "已请求停止 SAM3。"))
    return gr_update(interactive=True), gr_update(visible=False)


def generate_mask_by_points(
    original_video_path,
    video_path,
    trim_payload,
    editor_payload_json,
    uploaded_mask_path,
    score_threshold_detection,
    new_det_thresh,
    fill_hole_area,
    recondition_every_nth_frame,
    postprocess_strength,
    invert_mask,
    state_params=None,
    unload_callback=None,
    cancel_token: str | None = "webui",
):
    effective_video_path = resolve_sam3_backend_video_path(video_path, original_video_path, trim_payload)
    if effective_video_path is None:
        gr.Warning(_sam3_text(state_params, "Please upload a video first.", "请先上传视频。"))
        return uploaded_mask_path
    if editor_payload_json is None or not str(editor_payload_json).strip():
        if uploaded_mask_path:
            return uploaded_mask_path
        gr.Warning(_sam3_text(
            state_params,
            "Please click the video and select targets in the popup, or upload a mask video directly.",
            "请点击视频并在弹窗中选择目标，或直接上传蒙版视频。",
        ))
        return uploaded_mask_path
    editor_payload = _parse_editor_payload(editor_payload_json)
    if _editor_payload_uses_static_mask(editor_payload):
        reset_sam3_cancel(cancel_token)
        try:
            out_path = run_static_mask(
                video_path=effective_video_path,
                editor_payload_json=editor_payload_json,
                invert_mask=bool(invert_mask),
                cancel_check=make_sam3_cancel_check(cancel_token),
            )
            gr.Info(_sam3_text(state_params, "Polygon mask created!", "多边形蒙版已生成！"))
            return out_path
        except Sam3Cancelled as e:
            gr.Warning(_sam3_text(state_params, str(e), "SAM3 生成已取消。"))
            return uploaded_mask_path
        except Exception as e:
            logger.exception("Static mask generation failed")
            gr.Warning(_sam3_text(state_params, f"Polygon mask failed: {e}", f"多边形蒙版生成失败：{e}"))
            return uploaded_mask_path
        finally:
            clear_sam3_cancel(cancel_token)

    import modules.async_worker as worker

    with worker.external_exclusive_task():
        reset_sam3_cancel(cancel_token)
        cleanup_translator_and_vram()
        try:
            out_path = run_sam3_video_mask(
                video_path=effective_video_path,
                editor_payload_json=editor_payload_json,
                cancel_check=make_sam3_cancel_check(cancel_token),
                **mask_opts(
                    score_threshold_detection,
                    new_det_thresh,
                    fill_hole_area,
                    recondition_every_nth_frame,
                    postprocess_strength,
                    invert_mask,
                ),
            )
            gr.Info(_sam3_text(state_params, "Mask generated!", "蒙版已生成！"))
            return out_path
        except Sam3Cancelled as e:
            gr.Warning(_sam3_text(state_params, str(e), "SAM3 生成已取消。"))
            _run_failure_cleanup(unload_callback)
            return uploaded_mask_path
        except Exception as e:
            logger.exception("SAM3 points mask generation failed")
            gr.Warning(_sam3_text(state_params, f"SAM3 failed: {e}", f"SAM3 生成失败：{e}"))
            _run_failure_cleanup(unload_callback)
            return uploaded_mask_path
        finally:
            clear_sam3_cancel(cancel_token)


def generate_mask_by_prompt(
    original_video_path,
    video_path,
    trim_payload,
    prompt_text,
    uploaded_mask_path,
    score_threshold_detection,
    new_det_thresh,
    fill_hole_area,
    recondition_every_nth_frame,
    postprocess_strength,
    invert_mask,
    state_params=None,
    unload_callback=None,
    cancel_token: str | None = "webui",
):
    import enhanced.translator as translator
    from enhanced.vlm import vlm
    import modules.async_worker as worker

    effective_video_path = resolve_sam3_backend_video_path(video_path, original_video_path, trim_payload)
    if effective_video_path is None:
        gr.Warning(_sam3_text(state_params, "Please upload a video first.", "请先上传视频。"))
        return uploaded_mask_path
    if prompt_text is None or not str(prompt_text).strip():
        if uploaded_mask_path:
            return uploaded_mask_path
        gr.Warning(_sam3_text(
            state_params,
            "Please enter a prompt, or upload a mask video directly.",
            "请输入提示词，或直接上传蒙版视频。",
        ))
        return uploaded_mask_path
    with worker.external_exclusive_task():
        reset_sam3_cancel(cancel_token)
        try:
            prompt_text = translator.normalize_prompt(vlm.translate(str(prompt_text), "Slim Model"))
        except Exception:
            prompt_text = translator.normalize_prompt(str(prompt_text))
        cleanup_translator_and_vram()
        try:
            out_path = run_sam3_video_mask_by_prompt(
                video_path=effective_video_path,
                prompt=str(prompt_text),
                cancel_check=make_sam3_cancel_check(cancel_token),
                **mask_opts(
                    score_threshold_detection,
                    new_det_thresh,
                    fill_hole_area,
                    recondition_every_nth_frame,
                    postprocess_strength,
                    invert_mask,
                ),
            )
            gr.Info(_sam3_text(state_params, "Mask generated!", "蒙版已生成！"))
            return out_path
        except Sam3Cancelled as e:
            gr.Warning(_sam3_text(state_params, str(e), "SAM3 生成已取消。"))
            _run_failure_cleanup(unload_callback)
            return uploaded_mask_path
        except Exception as e:
            logger.exception("SAM3 semantic prompt mask generation failed")
            gr.Warning(_sam3_text(state_params, f"SAM3 failed: {e}", f"SAM3 生成失败：{e}"))
            _run_failure_cleanup(unload_callback)
            return uploaded_mask_path
        finally:
            clear_sam3_cancel(cancel_token)


def _scene_frontend_all_sam3_themes(scenes):
    if not isinstance(scenes, dict):
        return False
    values = []
    themes = scenes.get("theme", [])
    if isinstance(themes, (list, tuple)):
        values.extend(themes)
    elif themes:
        values.append(themes)
    task_method = scenes.get("task_method", "")
    if isinstance(task_method, dict):
        values.extend(task_method.values())
    elif isinstance(task_method, (list, tuple)):
        values.extend(task_method)
    elif task_method:
        values.append(task_method)
    normalized = [str(value or "").lower() for value in values if str(value or "").strip()]
    return bool(normalized) and all("sam3" in value for value in normalized)


def control_visibility(theme, state=None):
    theme_l = str(theme or "").lower()
    if not theme_l and isinstance(state, dict):
        theme_l = str(state.get("scene_theme", "") or "").lower()

    task_method_l = ""
    all_sam3_scene = False
    inputs_explicitly_enabled = False
    inputs_explicitly_hidden = False
    if isinstance(state, dict):
        scenes = state.get("scene_frontend", {})
        all_sam3_scene = _scene_frontend_all_sam3_themes(scenes)
        if isinstance(scenes, dict):
            raw_hidden = scenes.get("disvisible", [])
            if isinstance(raw_hidden, str):
                raw_hidden = [item.strip() for item in raw_hidden.split(",") if item.strip()]
            hidden = set(str(item).strip() for item in raw_hidden) if isinstance(raw_hidden, (list, tuple, set)) else set()
            inputs_explicitly_hidden = any(
                key in hidden for key in ("sam3_video_mask_accordion", "sam3_input_video", "sam3_mask_video")
            )

            raw_enabled = scenes.get("divisible", [])
            enabled = set(str(item).strip() for item in raw_enabled) if isinstance(raw_enabled, (list, tuple, set)) else set()
            inputs_explicitly_enabled = any(
                key in enabled for key in ("sam3_video_mask_accordion", "sam3_input_video", "sam3_mask_video")
            )
        task_method = scenes.get("task_method", "") if isinstance(scenes, dict) else ""
        resolved_theme = theme or state.get("scene_theme", None)
        if isinstance(task_method, dict):
            if isinstance(resolved_theme, str) and resolved_theme in task_method:
                task_method = task_method.get(resolved_theme, "")
            else:
                task_method = ""
        elif isinstance(task_method, list):
            themes = scenes.get("theme", []) if isinstance(scenes, dict) else []
            if isinstance(resolved_theme, str) and isinstance(themes, (list, tuple)) and resolved_theme in themes:
                index = list(themes).index(resolved_theme)
                task_method = task_method[index] if index < len(task_method) else ""
            else:
                task_method = task_method[0] if len(task_method) == 1 else ""
        task_method_l = str(task_method or "").lower()

    show_camera = bool(theme_l and "multiangle" in theme_l)
    show_light = bool(theme_l and ("anglelight" in theme_l or "lightning" in theme_l))
    show_style_transfer = bool(theme_l and "flux2_styletransfer" in theme_l)
    show_sam3 = bool(
        not inputs_explicitly_hidden
        and ("sam3" in theme_l or "sam3" in task_method_l or all_sam3_scene or inputs_explicitly_enabled)
    )
    return (
        gr_update(visible=show_camera, open=show_camera),
        gr_update(visible=show_light, open=show_light),
        gr_update(visible=show_style_transfer, open=False),
        gr_update(visible=show_sam3, open=show_sam3),
    )


def _repo_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def _local_comfyd_inputs_dir() -> str:
    try:
        import shared

        root = str(getattr(shared, "root", "") or "").strip()
        candidates = []
        if root:
            candidates.append(os.path.abspath(os.path.join(root, "..", "..", "users")))
        userhome = str(getattr(shared, "path_userhome", "") or "").strip()
        if userhome:
            candidates.append(os.path.abspath(userhome))
        candidates.append(os.path.abspath(os.path.join(_repo_root(), "..", "..", "users")))
        for candidate in candidates:
            if os.path.isfile(os.path.join(candidate, "config.txt")) or os.path.isdir(os.path.join(candidate, "Local")):
                return os.path.abspath(os.path.join(candidate, "Local", "comfyd_inputs"))
    except Exception:
        pass
    return os.path.abspath(os.path.join(_repo_root(), "..", "..", "users", "Local", "comfyd_inputs"))


def sam3_mask_output_dir(subdir: str | None = None) -> str:
    base = os.path.abspath(os.path.join(_local_comfyd_inputs_dir(), "sam3_masks"))
    if subdir:
        safe_subdir = str(subdir).strip().replace("\\", "/").strip("/")
        safe_subdir = "_".join(part for part in safe_subdir.split("/") if part and part not in (".", ".."))
        if safe_subdir:
            base = os.path.join(base, safe_subdir)
    os.makedirs(base, exist_ok=True)
    return base


def _ensure_easy_sam3_importable() -> None:
    easy_sam3_root = os.path.join(
        _repo_root(), "comfy", "custom_nodes", "ComfyUI-Easy-Sam3"
    )
    if easy_sam3_root not in sys.path:
        sys.path.insert(0, easy_sam3_root)


def _bytes_to_gib(n: int) -> float:
    return float(n) / (1024.0**3)


def _gib_to_bytes(gib: float) -> int:
    return int(float(gib) * (1024.0**3))


def _env_float(name: str, default: float) -> float:
    v = os.environ.get(name, None)
    if v is None:
        return float(default)
    try:
        return float(str(v).strip())
    except Exception:
        return float(default)


def _env_flag(name: str, default: bool) -> bool:
    v = os.environ.get(name, None)
    if v is None:
        return bool(default)
    s = str(v).strip().lower()
    if s in ("0", "false", "no", "off", ""):
        return False
    if s in ("1", "true", "yes", "on"):
        return True
    return bool(default)


def _env_int(name: str, default: int) -> int:
    v = os.environ.get(name, None)
    if v is None:
        return int(default)
    try:
        return int(float(str(v).strip()))
    except Exception:
        return int(default)


def _auto_choose_sam3_image_size(image_size: int, *, device_index: int) -> int:
    requested = int(image_size or 0)
    if not _env_flag("SIMPLEAI_SAM3_AUTO_IMAGE_SIZE", True):
        return requested if requested > 0 else 1008

    patch = 14
    min_size = int(_env_int("SIMPLEAI_SAM3_AUTO_IMAGE_SIZE_MIN", 560))
    max_size = int(_env_int("SIMPLEAI_SAM3_AUTO_IMAGE_SIZE_MAX", 1008))
    min_size = max(patch, (int(min_size) // patch) * patch)
    max_size = max(patch, (int(max_size) // patch) * patch)
    if requested > 0:
        requested = max(patch, (int(requested) // patch) * patch)
        max_size = min(int(max_size), int(requested))
    if min_size > max_size:
        min_size, max_size = max_size, min_size

    candidates = [s for s in (1008, 896, 784, 672, 560) if int(min_size) <= int(s) <= int(max_size)]
    if not candidates:
        return requested if requested > 0 else 1008

    cap_gb = None
    if torch.cuda.is_available():
        try:
            cap = _apply_elastic_vram_limit_for_sam3(device_index=int(device_index))
            if isinstance(cap, dict) and cap.get("cap_gb_effective", None) is not None:
                cap_gb = float(cap["cap_gb_effective"])
        except Exception:
            cap_gb = None

    if cap_gb is None and torch.cuda.is_available():
        try:
            free_bytes, total_bytes = torch.cuda.mem_get_info(int(device_index))
            total_gb = float(total_bytes) / (1024.0**3)
            free_gb = float(free_bytes) / (1024.0**3)
            cap_gb = min(total_gb, free_gb + float(torch.cuda.memory_reserved(int(device_index))) / (1024.0**3))
        except Exception:
            cap_gb = None

    if cap_gb is not None:
        if float(cap_gb) < 3.5:
            desired = 672
        elif float(cap_gb) < 5.0:
            desired = 784
        elif float(cap_gb) < 7.0:
            desired = 896
        else:
            desired = 1008
    else:
        desired = 1008

    for s in sorted(candidates, reverse=True):
        if int(s) <= int(desired):
            return int(s)
    return int(min(candidates))


def _get_session_num_frames(predictor, session_id: str) -> int | None:
    try:
        states = getattr(predictor, "_ALL_INFERENCE_STATES", None)
        if not isinstance(states, dict):
            return None
        session = states.get(session_id, None)
        if not isinstance(session, dict):
            return None
        state = session.get("state", None)
        if not isinstance(state, dict):
            return None
        n = state.get("num_frames", None)
        if n is None:
            return None
        n = int(n)
        return n if n > 0 else None
    except Exception:
        return None


def _apply_elastic_vram_limit_for_sam3(*, device_index: int) -> dict | None:
    if not torch.cuda.is_available():
        return None
    if not _env_flag("SIMPLEAI_SAM3_ELASTIC_VRAM", True):
        return None

    try:
        torch.cuda.set_device(int(device_index))
    except Exception:
        pass

    headroom_gb = _env_float("SIMPLEAI_SAM3_NVML_HEADROOM_GB", 0.2)
    limit_gb = _env_float("SIMPLEAI_SAM3_LIMIT_GB", 0.0)

    try:
        from ldm_patched.modules.model_management import get_free_memory_by_nvml_for_nvidia
    except Exception:
        return None

    dev = None
    try:
        dev = torch.device(f"cuda:{int(device_index)}")
    except Exception:
        dev = None

    free_bytes = None
    try:
        free_bytes, _total_cuda = torch.cuda.mem_get_info(int(device_index))
        free_bytes = int(free_bytes)
    except Exception:
        free_bytes = None
    if free_bytes is None:
        try:
            free_bytes = get_free_memory_by_nvml_for_nvidia(dev)
        except Exception:
            free_bytes = None
    if free_bytes is None:
        return None

    try:
        total_bytes = int(torch.cuda.get_device_properties(int(device_index)).total_memory)
    except Exception:
        total_bytes = 0
    if total_bytes <= 0:
        return None

    pid_used_bytes = 0
    try:
        pid_used_bytes = int(torch.cuda.memory_reserved(int(device_index)))
    except Exception:
        pid_used_bytes = 0

    headroom_bytes = _gib_to_bytes(float(headroom_gb))
    cap_from_free_bytes = int(pid_used_bytes + max(0, int(free_bytes) - headroom_bytes))

    cap_bytes = cap_from_free_bytes
    if float(limit_gb) and float(limit_gb) > 0:
        cap_bytes = min(int(cap_bytes), _gib_to_bytes(float(limit_gb)))

    frac = float(cap_bytes) / float(total_bytes)
    frac = max(0.01, min(1.0, frac))
    try:
        torch.cuda.set_per_process_memory_fraction(float(frac), device=int(device_index))
    except Exception:
        return None

    return {
        "enabled": True,
        "device_index": int(device_index),
        "limit_gb": float(limit_gb),
        "headroom_gb": float(headroom_gb),
        "cap_gb_effective": round(_bytes_to_gib(int(cap_bytes)), 3),
        "cap_gb_from_free": round(_bytes_to_gib(int(cap_from_free_bytes)), 3),
        "fraction": round(float(frac), 6),
    }


def _resolve_sam3_checkpoint(model_path: str | None) -> str:
    return sam3_comfy31.resolve_sam31_checkpoint(model_path, allow_download=True)


def _get_video_meta(video_path: str) -> tuple[float, int, int, int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cap.release()
    return fps, frame_count, width, height


def _is_video_file(path: str) -> bool:
    if not isinstance(path, str):
        return False
    ext = os.path.splitext(path)[-1].lower()
    return ext in [".mp4", ".mov", ".mkv", ".avi", ".webm"]


def _has_image_files(folder: str) -> bool:
    try:
        for name in os.listdir(folder):
            ext = os.path.splitext(name)[-1].lower()
            if ext in (".jpg", ".jpeg", ".png", ".bmp", ".webp"):
                return True
    except Exception:
        return False
    return False



def _extract_video_to_temp_frames(video_path: str, *, max_frames: int) -> str:
    tmp_dir = tempfile.mkdtemp(prefix="sam3_frames_")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")
    written = 0
    while True:
        if int(max_frames) >= 0 and written >= int(max_frames):
            break
        ok, frame_bgr = cap.read()
        if not ok:
            break
        out_path = os.path.join(tmp_dir, f"{written:06d}.jpg")
        try:
            ok_enc, buf = cv2.imencode(".jpg", frame_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            if ok_enc:
                with open(out_path, "wb") as f:
                    f.write(buf.tobytes())
                written += 1
        except Exception:
            pass

    cap.release()
    if written <= 0 or not _has_image_files(tmp_dir):
        raise RuntimeError("No frames extracted from video.")
    return tmp_dir


def _parse_editor_payload(payload_json: str) -> dict:
    if not payload_json or not str(payload_json).strip():
        return {}
    try:
        data = json.loads(payload_json)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _editor_payload_uses_static_mask(payload: dict) -> bool:
    if not isinstance(payload, dict):
        return False
    mode = str(payload.get("mode", "") or "").strip().lower()
    return mode in {"static_boxes", "static_polygons"}


def _normalize_points(points: list, width: int, height: int) -> list[list[float]]:
    out: list[list[float]] = []
    if not points:
        return out
    for p in points:
        if isinstance(p, dict):
            x = float(p.get("x", 0.0))
            y = float(p.get("y", 0.0))
        elif isinstance(p, (list, tuple)) and len(p) >= 2:
            x = float(p[0])
            y = float(p[1])
        else:
            continue

        if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
            out.append([x, y])
            continue

        if width > 0 and height > 0:
            out.append([max(0.0, min(1.0, x / width)), max(0.0, min(1.0, y / height))])
    return out


def _normalize_bbox(bbox: object, width: int, height: int) -> list[list[float]] | None:
    if not bbox:
        return None
    try:
        if isinstance(bbox, dict):
            x0 = float(bbox.get("x0", bbox.get("x", 0.0)))
            y0 = float(bbox.get("y0", bbox.get("y", 0.0)))
            x1 = float(bbox.get("x1", bbox.get("x2", 0.0)))
            y1 = float(bbox.get("y1", bbox.get("y2", 0.0)))
        elif isinstance(bbox, (list, tuple)) and len(bbox) >= 4:
            x0 = float(bbox[0])
            y0 = float(bbox[1])
            x1 = float(bbox[2])
            y1 = float(bbox[3])
        else:
            return None

        if 0.0 <= x0 <= 1.0 and 0.0 <= y0 <= 1.0 and 0.0 <= x1 <= 1.0 and 0.0 <= y1 <= 1.0:
            nx0, ny0, nx1, ny1 = x0, y0, x1, y1
        elif width > 0 and height > 0:
            nx0 = max(0.0, min(1.0, x0 / width))
            ny0 = max(0.0, min(1.0, y0 / height))
            nx1 = max(0.0, min(1.0, x1 / width))
            ny1 = max(0.0, min(1.0, y1 / height))
        else:
            return None

        xmin = min(nx0, nx1)
        ymin = min(ny0, ny1)
        w = abs(nx1 - nx0)
        h = abs(ny1 - ny0)
        if w <= 0.0 or h <= 0.0:
            return None
        return [[xmin, ymin, w, h]]
    except Exception:
        return None


def _normalize_static_boxes(boxes: object, width: int, height: int) -> list[tuple[float, float, float, float]]:
    if not isinstance(boxes, (list, tuple)):
        return []
    normalized: list[tuple[float, float, float, float]] = []
    for box in boxes:
        bbox_xywh = _normalize_bbox(box, width, height)
        if not bbox_xywh:
            continue
        x, y, box_width, box_height = bbox_xywh[0]
        normalized.append((float(x), float(y), float(box_width), float(box_height)))
    return normalized


def _normalize_static_polygons(
    polygons: object,
    width: int,
    height: int,
) -> list[list[tuple[float, float]]]:
    if not isinstance(polygons, (list, tuple)):
        return []

    normalized_polygons: list[list[tuple[float, float]]] = []
    for polygon in polygons:
        points = polygon.get("points", []) if isinstance(polygon, dict) else polygon
        if not isinstance(points, (list, tuple)):
            continue

        normalized_points: list[tuple[float, float]] = []
        for point in points:
            try:
                if isinstance(point, dict):
                    x = float(point.get("x", 0.0))
                    y = float(point.get("y", 0.0))
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    x = float(point[0])
                    y = float(point[1])
                else:
                    continue
                if not np.isfinite(x) or not np.isfinite(y):
                    continue
                if -0.5 <= x <= 1.5 and -0.5 <= y <= 1.5:
                    nx, ny = x, y
                elif width > 0 and height > 0:
                    nx = x / width
                    ny = y / height
                else:
                    continue
                nx = max(-0.5, min(1.5, nx))
                ny = max(-0.5, min(1.5, ny))
                point_xy = (float(nx), float(ny))
                if not normalized_points or point_xy != normalized_points[-1]:
                    normalized_points.append(point_xy)
            except Exception:
                continue

        if len(normalized_points) >= 2 and normalized_points[0] == normalized_points[-1]:
            normalized_points.pop()
        if len(normalized_points) >= 3:
            normalized_polygons.append(normalized_points)
    return normalized_polygons


def _select_binary_mask_from_outputs(
    outputs: dict, preferred_obj_id: int | None = None
) -> np.ndarray | None:
    mask = outputs.get("out_binary_masks", None)
    if mask is None or not isinstance(mask, np.ndarray):
        return None

    if mask.ndim == 2:
        return mask.astype(bool)

    if mask.ndim != 3 or mask.shape[0] <= 0:
        return None

    if preferred_obj_id is not None:
        obj_ids = outputs.get("out_obj_ids", None)
        try:
            if isinstance(obj_ids, np.ndarray):
                obj_ids_list = obj_ids.tolist()
            elif isinstance(obj_ids, (list, tuple)):
                obj_ids_list = list(obj_ids)
            else:
                obj_ids_list = []
            if preferred_obj_id in obj_ids_list:
                idx = int(obj_ids_list.index(preferred_obj_id))
                if 0 <= idx < int(mask.shape[0]):
                    return mask[idx].astype(bool)
        except Exception:
            pass

    probs = outputs.get("out_probs", None)
    if isinstance(probs, np.ndarray) and probs.ndim == 1 and int(probs.shape[0]) == int(mask.shape[0]):
        try:
            idx = int(np.argmax(probs))
            return mask[idx].astype(bool)
        except Exception:
            pass

    return np.any(mask, axis=0)


def _load_video_predictor(checkpoint_path: str, *, image_size: int):
    model, _clip, _ckpt = sam3_comfy31.ensure_sam31_loaded(checkpoint_path)
    return model


def unload_sam3_video_predictor() -> None:
    sam3_comfy31.unload_sam31()


def _patch_predictor_for_webui(predictor) -> None:
    model = getattr(predictor, "model", None)
    if model is None:
        return
    if getattr(model, "_simpai_webui_patched", False):
        return

    _sync_bias_dtype_with_weight(model)
    try:
        if callable(getattr(model, "init_state", None)) and not getattr(
            model, "_simpai_init_state_offload_patched", False
        ):
            orig_init_state = model.init_state

            def init_state_patched(*args, **kwargs):
                if "offload_video_to_cpu" not in kwargs:
                    kwargs["offload_video_to_cpu"] = True
                return orig_init_state(*args, **kwargs)

            model.init_state = init_state_patched
            model._simpai_init_state_offload_patched = True
    except Exception:
        pass
    try:
        if callable(getattr(model, "_init_new_tracker_state", None)) and not getattr(
            model, "_simpai_init_new_tracker_state_patched", False
        ):
            orig_init_new_tracker_state = model._init_new_tracker_state

            def _init_new_tracker_state_patched(inference_state):
                offload_state_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_STATE_TO_CPU", True)
                tracker = getattr(model, "tracker", None)
                if tracker is not None and callable(getattr(tracker, "init_state", None)):
                    return tracker.init_state(
                        cached_features=inference_state["feature_cache"],
                        video_height=inference_state["orig_height"],
                        video_width=inference_state["orig_width"],
                        num_frames=inference_state["num_frames"],
                        offload_state_to_cpu=bool(offload_state_to_cpu),
                    )
                return orig_init_new_tracker_state(inference_state)

            model._init_new_tracker_state = _init_new_tracker_state_patched
            model._simpai_init_new_tracker_state_patched = True
    except Exception:
        pass
    try:
        cls = model.__class__
        if callable(getattr(cls, "_cache_frame_outputs", None)) and not getattr(
            cls, "_simpai_cache_frame_outputs_patched", False
        ):
            orig_cache_frame_outputs = cls._cache_frame_outputs

            def _cache_frame_outputs_patched(
                self,
                inference_state,
                frame_idx,
                obj_id_to_mask,
                suppressed_obj_ids=None,
                removed_obj_ids=None,
                unconfirmed_obj_ids=None,
            ):
                offload_cached_masks = _env_flag(
                    "SIMPLEAI_SAM3_OFFLOAD_CACHED_MASKS_TO_CPU", True
                )
                if offload_cached_masks and isinstance(obj_id_to_mask, dict):
                    try:
                        converted = {}
                        for k, v in obj_id_to_mask.items():
                            if isinstance(v, torch.Tensor) and v.is_cuda:
                                converted[k] = v.detach().to("cpu", non_blocking=True)
                            else:
                                converted[k] = v
                        obj_id_to_mask = converted
                    except Exception:
                        pass
                return orig_cache_frame_outputs(
                    self,
                    inference_state,
                    frame_idx,
                    obj_id_to_mask,
                    suppressed_obj_ids=suppressed_obj_ids,
                    removed_obj_ids=removed_obj_ids,
                    unconfirmed_obj_ids=unconfirmed_obj_ids,
                )

            cls._cache_frame_outputs = _cache_frame_outputs_patched
            cls._simpai_cache_frame_outputs_patched = True
    except Exception:
        pass
    try:
        tracker = getattr(model, "tracker", None)
        tracker_cls = tracker.__class__ if tracker is not None else None
        if (
            tracker_cls is not None
            and callable(getattr(tracker_cls, "propagate_in_video", None))
            and not getattr(tracker_cls, "_simpai_prune_noncond_patched", False)
        ):
            orig_propagate_in_video = tracker_cls.propagate_in_video

            def propagate_in_video_patched(
                self,
                inference_state,
                start_frame_idx,
                max_frame_num_to_track,
                reverse,
                tqdm_disable=False,
                obj_ids=None,
                run_mem_encoder=True,
                propagate_preflight=False,
            ):
                enabled = _env_flag("SIMPLEAI_SAM3_PRUNE_NONCOND_FRAMES", True)
                keep_frames_env = int(_env_float("SIMPLEAI_SAM3_NONCOND_KEEP_FRAMES", 0.0))
                keep_frames_default = int(getattr(self, "max_obj_ptrs_in_encoder", 16) or 16) + 4
                keep_frames = keep_frames_env if keep_frames_env > 0 else keep_frames_default

                def _prune(state, current_frame_idx: int, is_reverse: bool):
                    if not enabled:
                        return
                    output_dict = state.get("output_dict", None) if isinstance(state, dict) else None
                    if not isinstance(output_dict, dict):
                        return
                    non_cond = output_dict.get("non_cond_frame_outputs", None)
                    if not isinstance(non_cond, dict) or not non_cond:
                        return
                    consolidated = state.get("consolidated_frame_inds", {}) if isinstance(state, dict) else {}
                    consolidated_non_cond = (
                        consolidated.get("non_cond_frame_outputs", set())
                        if isinstance(consolidated, dict)
                        else set()
                    )
                    if is_reverse:
                        cutoff = int(current_frame_idx) + int(keep_frames)
                        to_drop = [
                            t
                            for t in list(non_cond.keys())
                            if int(t) > cutoff and t not in consolidated_non_cond
                        ]
                    else:
                        cutoff = int(current_frame_idx) - int(keep_frames)
                        to_drop = [
                            t
                            for t in list(non_cond.keys())
                            if int(t) < cutoff and t not in consolidated_non_cond
                        ]
                    if not to_drop:
                        return
                    for t in to_drop:
                        non_cond.pop(t, None)
                    output_dict_per_obj = state.get("output_dict_per_obj", None)
                    if isinstance(output_dict_per_obj, dict):
                        for obj_out in output_dict_per_obj.values():
                            d = obj_out.get("non_cond_frame_outputs", None) if isinstance(obj_out, dict) else None
                            if isinstance(d, dict):
                                for t in to_drop:
                                    d.pop(t, None)
                    frames_already_tracked = state.get("frames_already_tracked", None)
                    if isinstance(frames_already_tracked, dict):
                        for t in to_drop:
                            frames_already_tracked.pop(t, None)

                gen = orig_propagate_in_video(
                    self,
                    inference_state,
                    start_frame_idx,
                    max_frame_num_to_track,
                    reverse,
                    tqdm_disable=tqdm_disable,
                    obj_ids=obj_ids,
                    run_mem_encoder=run_mem_encoder,
                    propagate_preflight=propagate_preflight,
                )
                for out in gen:
                    yield out
                    try:
                        _prune(inference_state, int(out[0]), bool(reverse))
                    except Exception:
                        pass

            tracker_cls.propagate_in_video = propagate_in_video_patched
            tracker_cls._simpai_prune_noncond_patched = True
    except Exception:
        pass
    model._simpai_webui_patched = True


def _sync_bias_dtype_with_weight(model) -> None:
    try:
        with torch.no_grad():
            for module in model.modules():
                weight = getattr(module, "weight", None)
                bias = getattr(module, "bias", None)
                if weight is None or bias is None:
                    continue
                if not isinstance(weight, torch.Tensor) or not isinstance(bias, torch.Tensor):
                    continue
                if not weight.is_floating_point() or not bias.is_floating_point():
                    continue
                if bias.dtype == weight.dtype:
                    continue
                try:
                    bias.data = bias.data.to(device=weight.device, dtype=weight.dtype)
                except Exception:
                    pass
    except Exception:
        pass


def _choose_video_loader_type(prefer_torchcodec: bool = True) -> str:
    return "cv2"


def _precision_to_dtype(precision: str) -> torch.dtype:
    p = str(precision or "").strip().lower()
    if p in ("fp16", "float16", "half", "16"):
        return torch.float16
    if p in ("bf16", "bfloat16"):
        return torch.bfloat16
    return torch.float32


def _autocast_context(dtype: torch.dtype):
    if dtype in (torch.float16, torch.bfloat16):
        return torch.autocast(device_type="cuda", dtype=dtype)
    return nullcontext()


def _apply_video_model_defaults(
    model,
    *,
    score_threshold_detection: float,
    new_det_thresh: float,
    assoc_iou_thresh: float,
    det_nms_thresh: float,
    hotstart_delay: int,
    hotstart_unmatch_thresh: int,
    hotstart_dup_thresh: int,
    suppress_unmatched_only_within_hotstart: bool,
    min_trk_keep_alive: int,
    max_trk_keep_alive: int,
    init_trk_keep_alive: int,
    suppress_overlapping_based_on_recent_occlusion_threshold: float,
    suppress_det_close_to_boundary: bool,
    fill_hole_area: int,
    recondition_every_nth_frame: int,
    masklet_confirmation_enable: bool,
    decrease_trk_keep_alive_for_empty_masklets: bool,
    image_size: int,
) -> None:
    if model is None:
        return
    for k, v in {
        "score_threshold_detection": float(score_threshold_detection),
        "new_det_thresh": float(new_det_thresh),
        "assoc_iou_thresh": float(assoc_iou_thresh),
        "det_nms_thresh": float(det_nms_thresh),
        "hotstart_delay": int(hotstart_delay),
        "hotstart_unmatch_thresh": int(hotstart_unmatch_thresh),
        "hotstart_dup_thresh": int(hotstart_dup_thresh),
        "suppress_unmatched_only_within_hotstart": bool(suppress_unmatched_only_within_hotstart),
        "min_trk_keep_alive": int(min_trk_keep_alive),
        "max_trk_keep_alive": int(max_trk_keep_alive),
        "init_trk_keep_alive": int(init_trk_keep_alive),
        "suppress_overlapping_based_on_recent_occlusion_threshold": float(
            suppress_overlapping_based_on_recent_occlusion_threshold
        ),
        "suppress_det_close_to_boundary": bool(suppress_det_close_to_boundary),
        "fill_hole_area": int(fill_hole_area),
        "recondition_every_nth_frame": int(recondition_every_nth_frame),
        "masklet_confirmation_enable": bool(masklet_confirmation_enable),
        "decrease_trk_keep_alive_for_empty_masklets": bool(
            decrease_trk_keep_alive_for_empty_masklets
        ),
        "image_size": int(image_size),
    }.items():
        if hasattr(model, k):
            try:
                setattr(model, k, v)
            except Exception:
                pass


def _postprocess_mask_u8(mask_u8: np.ndarray, *, strength: int, min_area: int) -> np.ndarray:
    if mask_u8 is None:
        return mask_u8
    s = int(strength or 0)
    if s <= 0:
        return mask_u8
    m = (mask_u8 > 127).astype(np.uint8) * 255

    s = max(1, min(5, s))
    close_ks = 2 * s + 1
    open_ks = max(0, 2 * (s - 2) + 1) if s >= 3 else 0

    if close_ks >= 3:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_ks, close_ks))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k, iterations=1)
    if open_ks >= 3:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_ks, open_ks))
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k, iterations=1)

    area = int(min_area or 0)
    if area > 0:
        num, labels, stats, _ = cv2.connectedComponentsWithStats(
            (m > 0).astype(np.uint8), connectivity=8
        )
        keep = np.zeros_like(m, dtype=np.uint8)
        for i in range(1, int(num)):
            if int(stats[i, cv2.CC_STAT_AREA]) >= area:
                keep[labels == i] = 255
        m = keep

    return (m > 127).astype(np.uint8) * 255


def _safe_get_video_file_size(video_path: str) -> int | None:
    try:
        return int(os.path.getsize(video_path))
    except Exception:
        return None


def _collect_model_params(model) -> dict:
    keys = [
        "score_threshold_detection",
        "new_det_thresh",
        "assoc_iou_thresh",
        "det_nms_thresh",
        "hotstart_delay",
        "hotstart_unmatch_thresh",
        "hotstart_dup_thresh",
        "suppress_unmatched_only_within_hotstart",
        "min_trk_keep_alive",
        "max_trk_keep_alive",
        "init_trk_keep_alive",
        "suppress_overlapping_based_on_recent_occlusion_threshold",
        "suppress_det_close_to_boundary",
        "fill_hole_area",
        "recondition_every_nth_frame",
        "masklet_confirmation_enable",
        "decrease_trk_keep_alive_for_empty_masklets",
        "image_size",
    ]
    out = {}
    if model is None:
        return out
    for k in keys:
        if hasattr(model, k):
            try:
                out[k] = getattr(model, k)
            except Exception:
                pass
    return out


def _open_mask_video_writer(out_path: str, *, fps: float, width: int, height: int) -> cv2.VideoWriter:
    ext = os.path.splitext(str(out_path))[1].lower()
    if ext == ".avi":
        candidates = ["MJPG", "XVID", "I420"]
    else:
        candidates = ["avc1", "H264", "X264", "mp4v"]
    for fourcc_text in candidates:
        try:
            writer = cv2.VideoWriter(
                out_path,
                cv2.VideoWriter_fourcc(*fourcc_text),
                float(fps),
                (int(width), int(height)),
            )
            if writer.isOpened():
                return writer
        except Exception:
            pass
    writer = cv2.VideoWriter(
        out_path,
        cv2.VideoWriter_fourcc(*"mp4v"),
        float(fps),
        (int(width), int(height)),
    )
    return writer


def _get_ffmpeg_exe() -> str | None:
    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass
    from shutil import which

    return which("ffmpeg")


def _remux_or_reencode_for_browser_playback(src_path: str, dst_path: str, *, fps: float) -> bool:
    ffmpeg_exe = _get_ffmpeg_exe()
    if not ffmpeg_exe:
        return False
    try:
        import subprocess

        gop = max(1, int(round(float(fps or 30.0))))
        cmd = [
            ffmpeg_exe,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src_path,
            "-an",
            "-c:v",
            "libx264",
            "-crf",
            "1",
            "-preset",
            "veryfast",
            "-pix_fmt",
            "yuv420p",
            "-profile:v",
            "baseline",
            "-level",
            "3.1",
            "-g",
            str(gop),
            "-keyint_min",
            str(gop),
            "-sc_threshold",
            "0",
            "-movflags",
            "+faststart",
            dst_path,
        ]
        subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return os.path.isfile(dst_path) and os.path.getsize(dst_path) > 0
    except Exception:
        return False


def normalize_mask_media_to_source_video(
    mask_path: str,
    mask_mime: str,
    source_video_path: str,
    output_dir: str,
    node_id: str = "sam3v",
) -> str:
    import hashlib

    fps, frame_count, width, height = _get_video_meta(str(source_video_path))
    fps = float(fps or 24.0)
    frame_count = max(1, int(frame_count or 1))
    width = max(1, int(width or 0))
    height = max(1, int(height or 0))
    if width <= 1 or height <= 1:
        raise RuntimeError("source video dimensions are unavailable")

    signature = f"{os.path.abspath(str(mask_path))}|{os.path.getmtime(mask_path)}|{os.path.abspath(str(source_video_path))}|{os.path.getmtime(source_video_path)}|{frame_count}|{width}x{height}|{fps}"
    digest = hashlib.sha256(signature.encode("utf-8", errors="ignore")).hexdigest()
    os.makedirs(output_dir, exist_ok=True)
    raw_out_path = os.path.abspath(os.path.join(output_dir, f"{node_id or 'sam3v'}.uploaded_mask.{digest[:16]}.raw.mp4"))
    out_path = os.path.abspath(os.path.join(output_dir, f"{node_id or 'sam3v'}.uploaded_mask.{digest[:16]}.mp4"))
    if os.path.exists(out_path):
        return out_path

    def mask_frame_to_bgr(frame):
        if frame is None:
            return None
        if len(frame.shape) == 2:
            gray = frame
        elif frame.shape[2] == 4:
            gray = frame[:, :, 3]
        else:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        if gray.shape[1] != width or gray.shape[0] != height:
            gray = cv2.resize(gray, (width, height), interpolation=cv2.INTER_NEAREST)
        return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    writer = _open_mask_video_writer(raw_out_path, fps=fps, width=width, height=height)
    if writer is None or not writer.isOpened():
        raise RuntimeError("failed to open uploaded mask video writer")
    try:
        if str(mask_mime or "").lower().startswith("image/"):
            frame = mask_frame_to_bgr(cv2.imread(str(mask_path), cv2.IMREAD_UNCHANGED))
            if frame is None:
                raise RuntimeError("failed to read uploaded mask image")
            for _ in range(frame_count):
                writer.write(frame)
        else:
            cap = cv2.VideoCapture(str(mask_path))
            if not cap.isOpened():
                raise RuntimeError("failed to read uploaded mask video")
            last_frame = None
            try:
                for _ in range(frame_count):
                    ok, frame = cap.read()
                    if ok:
                        converted = mask_frame_to_bgr(frame)
                        if converted is not None:
                            last_frame = converted
                    if last_frame is None:
                        raise RuntimeError("uploaded mask video contains no readable frames")
                    writer.write(last_frame)
            finally:
                cap.release()
    finally:
        writer.release()

    remuxed = False
    try:
        remuxed = _remux_or_reencode_for_browser_playback(raw_out_path, out_path, fps=fps)
    except Exception:
        remuxed = False
    if not remuxed:
        try:
            os.replace(raw_out_path, out_path)
        except Exception:
            out_path = raw_out_path
    elif os.path.exists(raw_out_path):
        try:
            os.remove(raw_out_path)
        except Exception:
            pass
    return out_path


def _write_mask_video_from_frames(
    *,
    masks_by_frame: dict[int, np.ndarray],
    fps: float,
    frame_count: int,
    width: int,
    height: int,
    postprocess_strength: int,
    postprocess_min_area: int,
    force_browser_compatible_output: bool,
    invert_mask: bool,
    debug_print: bool,
    default_mask: np.ndarray | None = None,
    cancel_check=None,
) -> str:
    out_dir = sam3_mask_output_dir()
    out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}.mp4")
    ffmpeg_ok = bool(_get_ffmpeg_exe()) if force_browser_compatible_output else False
    raw_ext = ".avi" if ffmpeg_ok else ".mp4"
    raw_out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}_raw{raw_ext}")

    if width <= 0 or height <= 0:
        if masks_by_frame:
            any_mask = next(iter(masks_by_frame.values()))
            height, width = int(any_mask.shape[0]), int(any_mask.shape[1])
        else:
            raise RuntimeError("Could not infer video dimensions for output.")

    out_fps = fps if fps > 0 else 24.0
    writer = _open_mask_video_writer(raw_out_path, fps=float(out_fps), width=int(width), height=int(height))
    if not writer.isOpened():
        raise RuntimeError("Failed to open VideoWriter for mask output.")

    try:
        total = int(frame_count) if int(frame_count or 0) > 0 else (max(masks_by_frame.keys()) + 1 if masks_by_frame else 0)
        for i in range(int(total)):
            if cancel_check is not None and (i % 8) == 0:
                cancel_check()
            mask = masks_by_frame.get(i, default_mask)
            if mask is None:
                frame = np.zeros((height, width), dtype=np.uint8)
            else:
                if mask.shape[0] != height or mask.shape[1] != width:
                    frame = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
                else:
                    frame = mask
                frame = _postprocess_mask_u8(frame, strength=postprocess_strength, min_area=postprocess_min_area)
            if invert_mask:
                frame = 255 - frame
            writer.write(cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR))
    finally:
        writer.release()

    if force_browser_compatible_output:
        if cancel_check is not None:
            cancel_check()
        ok = _remux_or_reencode_for_browser_playback(raw_out_path, out_path, fps=float(out_fps))
        if ok:
            try:
                if os.path.isfile(raw_out_path):
                    os.remove(raw_out_path)
            except Exception:
                pass
            if debug_print:
                logger.info("SAM3(webui) mask video output: %s", str(out_path))
            return out_path
        try:
            if os.path.isfile(out_path):
                os.remove(out_path)
        except Exception:
            pass
        if debug_print:
            logger.info("SAM3(webui) mask video output: %s", str(raw_out_path))
        return raw_out_path
    return raw_out_path


def run_static_mask(
    video_path: str,
    editor_payload_json: str,
    force_browser_compatible_output: bool = True,
    invert_mask: bool = False,
    debug_print: bool = False,
    cancel_check=None,
) -> str:
    if video_path is None or not str(video_path).strip():
        raise ValueError("video_path is empty")
    video_path = os.path.abspath(str(video_path))
    if cancel_check is not None:
        cancel_check()

    fps, frame_count, width, height = _get_video_meta(video_path)
    if frame_count <= 0 or width <= 0 or height <= 0:
        raise RuntimeError("Could not read source video dimensions or frame count.")

    payload = _parse_editor_payload(editor_payload_json)
    mask = np.zeros((height, width), dtype=np.uint8)
    mode = str(payload.get("mode", "") or "").strip().lower()
    if mode == "static_polygons":
        polygons = _normalize_static_polygons(payload.get("polygons", []), width, height)
        if not polygons:
            raise ValueError("No static polygons were provided.")
        for polygon in polygons:
            pixel_polygon = np.asarray(
                [
                    [
                        int(round(x * width)),
                        int(round(y * height)),
                    ]
                    for x, y in polygon
                ],
                dtype=np.int32,
            )
            cv2.fillPoly(mask, [pixel_polygon], 255, lineType=cv2.LINE_8)
    else:
        boxes = _normalize_static_boxes(payload.get("boxes", []), width, height)
        if not boxes:
            raise ValueError("No static boxes were provided.")
        for x, y, box_width, box_height in boxes:
            left = max(0, min(width - 1, int(np.floor(x * width))))
            top = max(0, min(height - 1, int(np.floor(y * height))))
            right = max(left + 1, min(width, int(np.ceil((x + box_width) * width))))
            bottom = max(top + 1, min(height, int(np.ceil((y + box_height) * height))))
            mask[top:bottom, left:right] = 255

    return _write_mask_video_from_frames(
        masks_by_frame={},
        default_mask=mask,
        fps=fps,
        frame_count=frame_count,
        width=width,
        height=height,
        postprocess_strength=0,
        postprocess_min_area=0,
        force_browser_compatible_output=force_browser_compatible_output,
        invert_mask=invert_mask,
        debug_print=debug_print,
        cancel_check=cancel_check,
    )


def run_sam3_video_mask(
    video_path: str,
    editor_payload_json: str,
    propagation_direction: str = "both",
    max_frames_to_track: int = -1,
    close_after_propagation: bool = True,
    precision: str = "fp16",
    score_threshold_detection: float = 0.3,
    new_det_thresh: float = 0.7,
    det_nms_thresh: float = 0.1,
    fill_hole_area: int = 16,
    recondition_every_nth_frame: int = 16,
    image_size: int = 1008,
    postprocess_strength: int = 0,
    postprocess_min_area: int = 0,
    debug_print: bool = False,
    force_browser_compatible_output: bool = True,
    invert_mask: bool = False,
    unload_after_run: bool = True,
    cancel_check=None,
) -> str:
    if video_path is None or not str(video_path).strip():
        raise ValueError("video_path is empty")
    video_path = os.path.abspath(video_path)
    if cancel_check is not None:
        cancel_check()

    payload = _parse_editor_payload(editor_payload_json)
    if _editor_payload_uses_static_mask(payload):
        return run_static_mask(
            video_path=video_path,
            editor_payload_json=editor_payload_json,
            force_browser_compatible_output=force_browser_compatible_output,
            invert_mask=invert_mask,
            debug_print=debug_print,
            cancel_check=cancel_check,
        )

    fps, frame_count, width, height = _get_video_meta(video_path)
    payload_frame_index = None
    if payload.get("frame_index", None) is not None:
        try:
            payload_frame_index = int(payload.get("frame_index"))
        except Exception:
            payload_frame_index = None
    if payload_frame_index is None and payload.get("frame_time", None) is not None:
        try:
            payload_frame_index = int(round(float(payload.get("frame_time", 0.0) or 0.0) * float(fps or 0.0)))
        except Exception:
            payload_frame_index = None
    frame_index = int(payload_frame_index or 0)
    frame_index = max(0, min(frame_count - 1, frame_index)) if frame_count > 0 else max(0, frame_index)
    pos_points = _normalize_points(payload.get("positive_coords", []), width, height)
    neg_points = _normalize_points(payload.get("negative_coords", []), width, height)
    bbox_xywh = _normalize_bbox(payload.get("bbox", None), width, height)
    prompt_text = str(payload.get("prompt", "") or "").strip()
    if not bbox_xywh and not pos_points and not neg_points and not prompt_text:
        raise ValueError("No prompt provided. Please add points in editor or provide prompt text.")

    device_index = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
    effective_image_size = _auto_choose_sam3_image_size(int(image_size), device_index=device_index)
    try:
        masks_by_frame, fps, frame_count, width, height = sam3_comfy31.video_masks(
            video_path,
            prompt=prompt_text or None,
            frame_index=frame_index,
            pos_points=pos_points,
            neg_points=neg_points,
            bbox_xywh=bbox_xywh,
            max_frames=max_frames_to_track,
            threshold=float(new_det_thresh),
            mask_threshold=0.0,
            detect_interval=max(1, int(recondition_every_nth_frame or 1)),
            max_objects=0,
            refine_iterations=2,
            propagation_direction=propagation_direction,
            image_size=effective_image_size,
            model_path=None,
            cancel_check=cancel_check,
        )
        if cancel_check is not None:
            cancel_check()
        return _write_mask_video_from_frames(
            masks_by_frame=masks_by_frame,
            fps=fps,
            frame_count=frame_count,
            width=width,
            height=height,
            postprocess_strength=postprocess_strength,
            postprocess_min_area=postprocess_min_area,
            force_browser_compatible_output=force_browser_compatible_output,
            invert_mask=invert_mask,
            debug_print=debug_print,
            cancel_check=cancel_check,
        )
    finally:
        if unload_after_run:
            unload_sam3_video_predictor()

    predictor = None
    model = None
    session_id = None
    tmp_frames_dir = None
    resource_path = video_path
    session_num_frames = None
    masks_by_frame: dict[int, np.ndarray] = {}
    try:
        checkpoint_path = _resolve_sam3_checkpoint(None)
        device_index = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
        effective_image_size = _auto_choose_sam3_image_size(int(image_size), device_index=device_index)
        predictor = _load_video_predictor(checkpoint_path, image_size=effective_image_size)
        model = getattr(predictor, "model", None)
        dtype = _precision_to_dtype(precision)
        _apply_video_model_defaults(
            model,
            score_threshold_detection=score_threshold_detection,
            new_det_thresh=new_det_thresh,
            assoc_iou_thresh=0.1,
            det_nms_thresh=det_nms_thresh,
            hotstart_delay=15,
            hotstart_unmatch_thresh=8,
            hotstart_dup_thresh=8,
            suppress_unmatched_only_within_hotstart=True,
            min_trk_keep_alive=-1,
            max_trk_keep_alive=30,
            init_trk_keep_alive=30,
            suppress_overlapping_based_on_recent_occlusion_threshold=0.7,
            suppress_det_close_to_boundary=False,
            fill_hole_area=fill_hole_area,
            recondition_every_nth_frame=recondition_every_nth_frame,
            masklet_confirmation_enable=False,
            decrease_trk_keep_alive_for_empty_masklets=False,
            image_size=effective_image_size,
        )
        _sync_bias_dtype_with_weight(model)

        fps, frame_count, width, height = _get_video_meta(video_path)
        payload = _parse_editor_payload(editor_payload_json)
        offload_video_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_VIDEO_TO_CPU", True)
        async_loading_frames = _env_flag("SIMPLEAI_SAM3_ASYNC_LOADING_FRAMES", True)
        offload_state_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_STATE_TO_CPU", True)
        offload_cached_masks_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_CACHED_MASKS_TO_CPU", True)
        if debug_print:
            logger.info(
                "SAM3(webui) video=%s size_bytes=%s fps=%s frames=%s w=%s h=%s image_size=%s precision=%s dtype=%s model_params=%s offload_video_to_cpu=%s async_loading_frames=%s offload_state_to_cpu=%s offload_cached_masks_to_cpu=%s elastic_vram=%s",
                str(video_path),
                str(_safe_get_video_file_size(video_path)),
                float(fps),
                int(frame_count),
                int(width),
                int(height),
                int(effective_image_size),
                str(precision),
                str(dtype),
                str(_collect_model_params(model)),
                bool(offload_video_to_cpu),
                bool(async_loading_frames),
                bool(offload_state_to_cpu),
                bool(offload_cached_masks_to_cpu),
                str(_apply_elastic_vram_limit_for_sam3(device_index=int(torch.cuda.current_device()))),
            )

        payload_frame_index = None
        if payload.get("frame_index", None) is not None:
            try:
                payload_frame_index = int(payload.get("frame_index"))
            except Exception:
                payload_frame_index = None
        if payload_frame_index is None and payload.get("frame_time", None) is not None:
            try:
                payload_frame_index = int(round(float(payload.get("frame_time", 0.0) or 0.0) * float(fps or 0.0)))
            except Exception:
                payload_frame_index = None
        frame_index = int(payload_frame_index or 0)
        frame_index = max(0, min(frame_count - 1, frame_index)) if frame_count > 0 else max(0, frame_index)

        pos_points = _normalize_points(payload.get("positive_coords", []), width, height)
        neg_points = _normalize_points(payload.get("negative_coords", []), width, height)
        bbox_xywh = _normalize_bbox(payload.get("bbox", None), width, height)
        points, point_labels = [], []
        if pos_points:
            points.extend(pos_points)
            point_labels.extend([1] * len(pos_points))
        if neg_points:
            points.extend(neg_points)
            point_labels.extend([0] * len(neg_points))

        prompt_text = str(payload.get("prompt", "") or "").strip()
        if not bbox_xywh and not points and not prompt_text:
            raise ValueError("No prompt provided. Please add points in editor or provide prompt text.")

        preferred_obj_id = 1 if (points and not bbox_xywh) else None

        with torch.inference_mode(), _autocast_context(dtype):
            try:
                predictor.async_loading_frames = bool(async_loading_frames)
                predictor.video_loader_type = _choose_video_loader_type()
            except Exception:
                pass
            if (
                getattr(predictor, "video_loader_type", "cv2") != "torchcodec"
                and getattr(predictor, "async_loading_frames", False)
                and _is_video_file(video_path)
                and os.path.isfile(video_path)
            ):
                try:
                    tmp_frames_dir = _extract_video_to_temp_frames(
                        video_path, max_frames=int(frame_count) if int(frame_count) > 0 else -1
                    )
                    if _has_image_files(tmp_frames_dir):
                        resource_path = tmp_frames_dir
                    else:
                        raise RuntimeError("No frames extracted from video.")
                except Exception:
                    if tmp_frames_dir:
                        try:
                            import shutil

                            shutil.rmtree(tmp_frames_dir, ignore_errors=True)
                        except Exception:
                            pass
                    tmp_frames_dir = None
                    resource_path = video_path
            response = predictor.handle_request(
                request=dict(
                    type="start_session",
                    resource_path=resource_path,
                    session_id=None,
                    offload_video_to_cpu=bool(offload_video_to_cpu),
                    async_loading_frames=bool(async_loading_frames),
                    video_loader_type=_choose_video_loader_type(),
                )
            )
            session_id = response.get("session_id", None)
            if not session_id:
                raise RuntimeError("Failed to start SAM3 session")

            session_num_frames = _get_session_num_frames(predictor, session_id)
            if session_num_frames is not None:
                frame_index = max(0, min(int(session_num_frames) - 1, int(frame_index)))

            predictor.handle_request(
                request=dict(
                    type="add_prompt",
                    session_id=session_id,
                    frame_index=frame_index,
                    text=None if (bbox_xywh or points) else (prompt_text or None),
                    points=points if (points and not bbox_xywh) else None,
                    point_labels=point_labels if (points and not bbox_xywh) else None,
                    bounding_boxes=bbox_xywh if bbox_xywh else None,
                    bounding_box_labels=([1] * len(bbox_xywh)) if bbox_xywh else None,
                    obj_id=1,
                )
            )

            for r in predictor.handle_stream_request(
                request=dict(
                    type="propagate_in_video",
                    session_id=session_id,
                    propagation_direction=propagation_direction,
                    start_frame_index=frame_index,
                    max_frame_num_to_track=None if max_frames_to_track == -1 else int(max_frames_to_track),
                )
            ):
                if cancel_check is not None:
                    cancel_check()
                frame_idx = int(r.get("frame_index", 0) or 0)
                outputs = r.get("outputs", {}) or {}
                merged = _select_binary_mask_from_outputs(outputs, preferred_obj_id=preferred_obj_id)
                if merged is None:
                    continue
                m = _postprocess_mask_u8(merged.astype(np.uint8) * 255, strength=postprocess_strength, min_area=postprocess_min_area)
                masks_by_frame[frame_idx] = m

            if debug_print:
                try:
                    if masks_by_frame:
                        keys = sorted(masks_by_frame.keys())
                        expected_total = frame_count if frame_count > 0 else (int(keys[-1]) + 1)
                        first_missing = [i for i in range(int(min(30, expected_total))) if i not in masks_by_frame]
                        logger.info(
                            "SAM3(webui) masks: frames_with_mask=%s min=%s max=%s expected_total=%s missing_first=%s",
                            int(len(keys)),
                            int(keys[0]),
                            int(keys[-1]),
                            int(expected_total),
                            str(first_missing),
                        )
                    else:
                        logger.info("SAM3(webui) masks: empty (no frames received)")
                except Exception:
                    logger.exception("SAM3(webui) masks: failed to summarize frame coverage")
    finally:
        if close_after_propagation and predictor is not None and session_id:
            try:
                predictor.handle_request(request=dict(type="close_session", session_id=session_id))
            except Exception:
                pass
        if tmp_frames_dir:
            try:
                import shutil

                shutil.rmtree(tmp_frames_dir, ignore_errors=True)
            except Exception:
                pass
        try:
            del model
        except Exception:
            pass
        try:
            del predictor
        except Exception:
            pass

    result = None
    try:
        out_dir = sam3_mask_output_dir()
        out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}.mp4")
        ffmpeg_ok = bool(_get_ffmpeg_exe()) if force_browser_compatible_output else False
        raw_ext = ".avi" if ffmpeg_ok else ".mp4"
        raw_out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}_raw{raw_ext}")

        if width <= 0 or height <= 0:
            if masks_by_frame:
                any_mask = next(iter(masks_by_frame.values()))
                height, width = int(any_mask.shape[0]), int(any_mask.shape[1])
            else:
                raise RuntimeError("Could not infer video dimensions for output.")

        out_fps = fps if fps > 0 else 24.0
        writer = _open_mask_video_writer(raw_out_path, fps=float(out_fps), width=int(width), height=int(height))
        if not writer.isOpened():
            raise RuntimeError("Failed to open VideoWriter for mask output.")

        total = (
            frame_count
            if frame_count > 0
            else (int(session_num_frames) if session_num_frames is not None else (max(masks_by_frame.keys()) + 1 if masks_by_frame else 0))
        )
        for i in range(int(total)):
            if cancel_check is not None and (i % 8) == 0:
                cancel_check()
            mask = masks_by_frame.get(i, None)
            if mask is None:
                frame = np.zeros((height, width), dtype=np.uint8)
            else:
                if mask.shape[0] != height or mask.shape[1] != width:
                    frame = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
                else:
                    frame = mask
            if invert_mask:
                frame = 255 - frame
            bgr = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
            writer.write(bgr)
        writer.release()

        if force_browser_compatible_output:
            ok = _remux_or_reencode_for_browser_playback(raw_out_path, out_path, fps=float(out_fps))
            if ok:
                try:
                    if os.path.isfile(raw_out_path):
                        os.remove(raw_out_path)
                except Exception:
                    pass
                if debug_print:
                    logger.info("SAM3(webui) mask video output: %s", str(out_path))
                result = out_path
            else:
                try:
                    if os.path.isfile(out_path):
                        os.remove(out_path)
                except Exception:
                    pass
                if debug_print:
                    logger.info("SAM3(webui) mask video output: %s", str(raw_out_path))
                result = raw_out_path
        else:
            result = out_path
        return result
    finally:
        try:
            del masks_by_frame
        except Exception:
            pass
        if unload_after_run:
            unload_sam3_video_predictor()


def run_sam3_video_mask_by_prompt(
    video_path: str,
    prompt: str,
    frame_time: float = 0.0,
    propagation_direction: str = "both",
    max_frames_to_track: int = -1,
    close_after_propagation: bool = True,
    precision: str = "fp16",
    score_threshold_detection: float = 0.3,
    new_det_thresh: float = 0.7,
    det_nms_thresh: float = 0.1,
    fill_hole_area: int = 16,
    recondition_every_nth_frame: int = 16,
    image_size: int = 1008,
    postprocess_strength: int = 0,
    postprocess_min_area: int = 0,
    debug_print: bool = False,
    force_browser_compatible_output: bool = True,
    invert_mask: bool = False,
    unload_after_run: bool = True,
    cancel_check=None,
) -> str:
    if video_path is None or not str(video_path).strip():
        raise ValueError("video_path is empty")
    video_path = os.path.abspath(video_path)
    if cancel_check is not None:
        cancel_check()

    prompt = str(prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is empty")

    fps, frame_count, width, height = _get_video_meta(video_path)
    frame_index = int(round(float(frame_time or 0.0) * fps)) if fps > 0 else 0
    frame_index = max(0, min(frame_count - 1, frame_index)) if frame_count > 0 else max(0, frame_index)
    device_index = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
    effective_image_size = _auto_choose_sam3_image_size(int(image_size), device_index=device_index)
    try:
        masks_by_frame, fps, frame_count, width, height = sam3_comfy31.video_masks(
            video_path,
            prompt=prompt,
            frame_index=frame_index,
            pos_points=None,
            neg_points=None,
            bbox_xywh=None,
            max_frames=max_frames_to_track,
            threshold=float(new_det_thresh),
            mask_threshold=0.0,
            detect_interval=max(1, int(recondition_every_nth_frame or 1)),
            max_objects=0,
            refine_iterations=2,
            propagation_direction=propagation_direction,
            image_size=effective_image_size,
            model_path=None,
            cancel_check=cancel_check,
        )
        if cancel_check is not None:
            cancel_check()
        return _write_mask_video_from_frames(
            masks_by_frame=masks_by_frame,
            fps=fps,
            frame_count=frame_count,
            width=width,
            height=height,
            postprocess_strength=postprocess_strength,
            postprocess_min_area=postprocess_min_area,
            force_browser_compatible_output=force_browser_compatible_output,
            invert_mask=invert_mask,
            debug_print=debug_print,
            cancel_check=cancel_check,
        )
    finally:
        if unload_after_run:
            unload_sam3_video_predictor()

    predictor = None
    model = None
    session_id = None
    tmp_frames_dir = None
    resource_path = video_path
    session_num_frames = None
    masks_by_frame: dict[int, np.ndarray] = {}
    try:
        checkpoint_path = _resolve_sam3_checkpoint(None)
        device_index = int(torch.cuda.current_device()) if torch.cuda.is_available() else 0
        effective_image_size = _auto_choose_sam3_image_size(int(image_size), device_index=device_index)
        predictor = _load_video_predictor(checkpoint_path, image_size=effective_image_size)
        model = getattr(predictor, "model", None)
        dtype = _precision_to_dtype(precision)
        _apply_video_model_defaults(
            model,
            score_threshold_detection=score_threshold_detection,
            new_det_thresh=new_det_thresh,
            assoc_iou_thresh=0.1,
            det_nms_thresh=det_nms_thresh,
            hotstart_delay=15,
            hotstart_unmatch_thresh=8,
            hotstart_dup_thresh=8,
            suppress_unmatched_only_within_hotstart=True,
            min_trk_keep_alive=-1,
            max_trk_keep_alive=30,
            init_trk_keep_alive=30,
            suppress_overlapping_based_on_recent_occlusion_threshold=0.7,
            suppress_det_close_to_boundary=False,
            fill_hole_area=fill_hole_area,
            recondition_every_nth_frame=recondition_every_nth_frame,
            masklet_confirmation_enable=False,
            decrease_trk_keep_alive_for_empty_masklets=False,
            image_size=effective_image_size,
        )
        _sync_bias_dtype_with_weight(model)

        fps, frame_count, width, height = _get_video_meta(video_path)
        offload_video_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_VIDEO_TO_CPU", True)
        async_loading_frames = _env_flag("SIMPLEAI_SAM3_ASYNC_LOADING_FRAMES", True)
        offload_state_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_STATE_TO_CPU", True)
        offload_cached_masks_to_cpu = _env_flag("SIMPLEAI_SAM3_OFFLOAD_CACHED_MASKS_TO_CPU", True)
        frame_index = int(round(float(frame_time or 0.0) * fps)) if fps > 0 else 0
        frame_index = max(0, min(frame_count - 1, frame_index)) if frame_count > 0 else max(0, frame_index)
        if debug_print:
            logger.info(
                "SAM3(webui) video=%s size_bytes=%s fps=%s frames=%s w=%s h=%s image_size=%s precision=%s dtype=%s model_params=%s offload_video_to_cpu=%s async_loading_frames=%s offload_state_to_cpu=%s offload_cached_masks_to_cpu=%s elastic_vram=%s prompt=%s",
                str(video_path),
                str(_safe_get_video_file_size(video_path)),
                float(fps),
                int(frame_count),
                int(width),
                int(height),
                int(effective_image_size),
                str(precision),
                str(dtype),
                str(_collect_model_params(model)),
                bool(offload_video_to_cpu),
                bool(async_loading_frames),
                bool(offload_state_to_cpu),
                bool(offload_cached_masks_to_cpu),
                str(_apply_elastic_vram_limit_for_sam3(device_index=int(torch.cuda.current_device()))),
                str(prompt),
            )

        with torch.inference_mode(), _autocast_context(dtype):
            try:
                predictor.async_loading_frames = bool(async_loading_frames)
                predictor.video_loader_type = _choose_video_loader_type()
            except Exception:
                pass
            if (
                getattr(predictor, "video_loader_type", "cv2") != "torchcodec"
                and getattr(predictor, "async_loading_frames", False)
                and _is_video_file(video_path)
                and os.path.isfile(video_path)
            ):
                try:
                    tmp_frames_dir = _extract_video_to_temp_frames(
                        video_path, max_frames=int(frame_count) if int(frame_count) > 0 else -1
                    )
                    if _has_image_files(tmp_frames_dir):
                        resource_path = tmp_frames_dir
                    else:
                        raise RuntimeError("No frames extracted from video.")
                except Exception:
                    if tmp_frames_dir:
                        try:
                            import shutil

                            shutil.rmtree(tmp_frames_dir, ignore_errors=True)
                        except Exception:
                            pass
                    tmp_frames_dir = None
                    resource_path = video_path
            response = predictor.handle_request(
                request=dict(
                    type="start_session",
                    resource_path=resource_path,
                    session_id=None,
                    offload_video_to_cpu=bool(offload_video_to_cpu),
                    async_loading_frames=bool(async_loading_frames),
                    video_loader_type=_choose_video_loader_type(),
                )
            )
            session_id = response.get("session_id", None)
            if not session_id:
                raise RuntimeError("Failed to start SAM3 session")

            session_num_frames = _get_session_num_frames(predictor, session_id)
            if session_num_frames is not None:
                frame_index = max(0, min(int(session_num_frames) - 1, int(frame_index)))

            predictor.handle_request(
                request=dict(
                    type="add_prompt",
                    session_id=session_id,
                    frame_index=frame_index,
                    text=prompt,
                    points=None,
                    point_labels=None,
                    bounding_boxes=None,
                    bounding_box_labels=None,
                    obj_id=1,
                )
            )

            for r in predictor.handle_stream_request(
                request=dict(
                    type="propagate_in_video",
                    session_id=session_id,
                    propagation_direction=propagation_direction,
                    start_frame_index=frame_index,
                    max_frame_num_to_track=None if max_frames_to_track == -1 else int(max_frames_to_track),
                )
            ):
                if cancel_check is not None:
                    cancel_check()
                frame_idx = int(r.get("frame_index", 0) or 0)
                outputs = r.get("outputs", {}) or {}
                mask = outputs.get("out_binary_masks", None)
                if mask is None:
                    continue
                if isinstance(mask, np.ndarray) and mask.ndim == 3 and mask.shape[0] > 0:
                    merged = np.any(mask, axis=0)
                elif isinstance(mask, np.ndarray) and mask.ndim == 2:
                    merged = mask.astype(bool)
                else:
                    continue
                m = _postprocess_mask_u8(merged.astype(np.uint8) * 255, strength=postprocess_strength, min_area=postprocess_min_area)
                masks_by_frame[frame_idx] = m

            if debug_print:
                try:
                    if masks_by_frame:
                        keys = sorted(masks_by_frame.keys())
                        expected_total = frame_count if frame_count > 0 else (int(keys[-1]) + 1)
                        first_missing = [i for i in range(int(min(30, expected_total))) if i not in masks_by_frame]
                        logger.info(
                            "SAM3(webui) masks: frames_with_mask=%s min=%s max=%s expected_total=%s missing_first=%s",
                            int(len(keys)),
                            int(keys[0]),
                            int(keys[-1]),
                            int(expected_total),
                            str(first_missing),
                        )
                    else:
                        logger.info("SAM3(webui) masks: empty (no frames received)")
                except Exception:
                    logger.exception("SAM3(webui) masks: failed to summarize frame coverage")
    finally:
        if close_after_propagation and predictor is not None and session_id:
            try:
                predictor.handle_request(request=dict(type="close_session", session_id=session_id))
            except Exception:
                pass
        if tmp_frames_dir:
            try:
                import shutil

                shutil.rmtree(tmp_frames_dir, ignore_errors=True)
            except Exception:
                pass
        try:
            del model
        except Exception:
            pass
        try:
            del predictor
        except Exception:
            pass

    result = None
    try:
        out_dir = sam3_mask_output_dir()
        out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}.mp4")
        ffmpeg_ok = bool(_get_ffmpeg_exe()) if force_browser_compatible_output else False
        raw_ext = ".avi" if ffmpeg_ok else ".mp4"
        raw_out_path = os.path.join(out_dir, f"sam3_mask_{uuid.uuid4().hex}_raw{raw_ext}")

        if width <= 0 or height <= 0:
            if masks_by_frame:
                any_mask = next(iter(masks_by_frame.values()))
                height, width = int(any_mask.shape[0]), int(any_mask.shape[1])
            else:
                raise RuntimeError("Could not infer video dimensions for output.")

        out_fps = fps if fps > 0 else 24.0
        writer = _open_mask_video_writer(raw_out_path, fps=float(out_fps), width=int(width), height=int(height))
        if not writer.isOpened():
            raise RuntimeError("Failed to open VideoWriter for mask output.")

        total = (
            frame_count
            if frame_count > 0
            else (int(session_num_frames) if session_num_frames is not None else (max(masks_by_frame.keys()) + 1 if masks_by_frame else 0))
        )
        for i in range(int(total)):
            if cancel_check is not None and (i % 8) == 0:
                cancel_check()
            mask = masks_by_frame.get(i, None)
            if mask is None:
                frame = np.zeros((height, width), dtype=np.uint8)
            else:
                if mask.shape[0] != height or mask.shape[1] != width:
                    frame = cv2.resize(mask, (width, height), interpolation=cv2.INTER_NEAREST)
                else:
                    frame = mask
            if invert_mask:
                frame = 255 - frame
            bgr = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
            writer.write(bgr)
        writer.release()

        if force_browser_compatible_output:
            ok = _remux_or_reencode_for_browser_playback(raw_out_path, out_path, fps=float(out_fps))
            if ok:
                try:
                    if os.path.isfile(raw_out_path):
                        os.remove(raw_out_path)
                except Exception:
                    pass
                if debug_print:
                    logger.info("SAM3(webui) mask video output: %s", str(out_path))
                result = out_path
            else:
                try:
                    if os.path.isfile(out_path):
                        os.remove(out_path)
                except Exception:
                    pass
                if debug_print:
                    logger.info("SAM3(webui) mask video output: %s", str(raw_out_path))
                result = raw_out_path
        else:
            result = out_path
        return result
    finally:
        try:
            del masks_by_frame
        except Exception:
            pass
        if unload_after_run:
            unload_sam3_video_predictor()


def get_viewer_html() -> str:
    glue_js = r"""
(function(){
  if (window.sam3FramesEditorInitialized) return;
  window.sam3FramesEditorInitialized = true;

  const state = {
    open: false,
    mode: "point",
    pointsPos: [],
    pointsNeg: [],
    polygons: [],
    polygonDraft: [],
    polygonHover: null,
    polygonSnapToStart: false,
    selectedPolygonIndex: -1,
    polygonDrag: null,
    polygonHoverTarget: null,
    history: [],
    historyIndex: -1,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
    time: 0,
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("sam3_frames_modal_backdrop");
  const modal = $("sam3_frames_modal");
  const canvas = $("sam3_canvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const hiddenVideo = $("sam3_hidden_video");
  const slider = $("sam3_time_slider");
  const label = $("sam3_frame_label");
  const hint = $("sam3_frames_hint");
  const hintMode = $("sam3_hint_mode");
  const hintAction = $("sam3_hint_action");
  const btnUndo = $("sam3_undo");
  const btnRedo = $("sam3_redo");
  const btnClear = $("sam3_clear");
  const btnModePoint = $("sam3_mode_point");
  const btnModePolygon = $("sam3_mode_polygon");
  const btnCancel = $("sam3_cancel");
  const btnConfirm = $("sam3_confirm");
  const body = $("sam3_frames_body");
  const closeStyleProps = ["display", "visibility", "pointer-events", "min-height", "height", "max-height", "margin", "padding", "overflow"];

  const clearForcedCloseStyles = () => {
    [backdrop, modal].forEach((el) => {
      if (!el || !el.style) return;
      closeStyleProps.forEach((prop) => el.style.removeProperty(prop));
    });
  };

  const forceCloseModal = () => {
    state.open = false;
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    if (backdrop) {
      backdrop.style.setProperty("display", "none", "important");
      backdrop.style.removeProperty("visibility");
      backdrop.style.removeProperty("pointer-events");
      backdrop.setAttribute("aria-hidden", "true");
    }
    if (modal) {
      modal.style.removeProperty("display");
      modal.style.removeProperty("visibility");
      modal.style.removeProperty("pointer-events");
    }
    document.body.classList.remove("sam3-frames-editor-open");
  };
  window.closeSam3FramesEditor = forceCloseModal;

  if (!backdrop || !modal || !canvas || !ctx || !hiddenVideo || !slider || !label || !hint || !hintMode || !hintAction || !btnUndo || !btnRedo || !btnClear || !btnModePoint || !btnModePolygon || !btnCancel || !btnConfirm || !body) {
    return;
  }

  const ensureModalPortal = () => {
    // Escape Gradio/gallery stacking contexts; z-index alone cannot beat a parent stacking context.
    if (backdrop.parentElement !== document.body) {
      document.body.appendChild(backdrop);
    }
    backdrop.style.setProperty("position", "fixed", "important");
    backdrop.style.setProperty("inset", "0", "important");
    backdrop.style.setProperty("z-index", "2147483647", "important");
    backdrop.style.setProperty("isolation", "isolate", "important");
    modal.style.setProperty("position", "relative", "important");
  };

  ensureModalPortal();

  const editorGeometry = () => {
    const frameWidth = Math.max(1, state.videoWidth || 1);
    const frameHeight = Math.max(1, state.videoHeight || 1);
    const padding = Math.max(24, Math.min(32, Math.round(Math.min(frameWidth, frameHeight) * 0.05)));
    return {
      padding,
      frameWidth,
      frameHeight,
      canvasWidth: frameWidth + padding * 2,
      canvasHeight: frameHeight + padding * 2,
    };
  };

  const pointToCanvas = (point) => {
    const geometry = editorGeometry();
    return {
      x: geometry.padding + point.x * geometry.frameWidth,
      y: geometry.padding + point.y * geometry.frameHeight,
    };
  };

  const layoutCanvas = () => {
    if (!state.open) return;
    if (state.videoWidth <= 0 || state.videoHeight <= 0) return;
    const bw = Math.max(1, body.clientWidth || 1);
    const bh = Math.max(1, body.clientHeight || 1);
    const geometry = editorGeometry();
    const aspect = geometry.canvasWidth / geometry.canvasHeight;
    let w = bw;
    let h = Math.round(w / aspect);
    if (h > bh) {
      h = bh;
      w = Math.round(h * aspect);
    }
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
  };

  const updateUndoRedo = () => {
    btnUndo.style.opacity = state.historyIndex >= 0 ? "1" : "0.35";
    btnUndo.style.pointerEvents = state.historyIndex >= 0 ? "auto" : "none";
    btnRedo.style.opacity = state.historyIndex < state.history.length - 1 ? "1" : "0.35";
    btnRedo.style.pointerEvents = state.historyIndex < state.history.length - 1 ? "auto" : "none";
  };

  const updateHint = (message, isError) => {
    const modeText = state.mode === "polygon"
      ? "Polygon Mask · 固定遮罩 · 不运行 SAM3 · 所有帧共用 · 多边形按并集合并"
      : "Point Mode · SAM3 跟踪 · 当前帧点选 · 自动跟踪其他帧";
    hintMode.textContent = modeText;
    hintMode.title = modeText;
    hintAction.style.color = isError ? "#fca5a5" : "#aaa";
    const writeAction = (value, asHtml) => {
      if (asHtml) hintAction.innerHTML = value;
      else hintAction.textContent = value;
      hintAction.title = hintAction.textContent;
    };
    if (message) {
      writeAction(message, false);
      return;
    }
    if (state.mode === "polygon") {
      if (state.polygonDraft.length) {
        writeAction(`左键添加顶点，靠近首点或双击闭合（已完成 ${state.polygons.length} 个，当前 ${state.polygonDraft.length} 点）`, false);
        return;
      }
      if (state.selectedPolygonIndex >= 0 && state.selectedPolygonIndex < state.polygons.length) {
        writeAction(`多边形 ${state.selectedPolygonIndex + 1}：拖动锚点调整，单击边线增加锚点；右键锚点删除，右键内部删除多边形`, false);
        return;
      }
      writeAction(`左键开始绘制，单击已有多边形可编辑（已完成 ${state.polygons.length} 个）`, false);
      return;
    }
    writeAction('左键<span class="sam3_hint_dot" style="color:#22c55e;">●</span>选取，右键<span class="sam3_hint_dot" style="color:#ef4444;">●</span>排除', true);
  };

  const draw = () => {
    if (!state.open) return;
    if (state.videoWidth <= 0 || state.videoHeight <= 0) return;
    const geometry = editorGeometry();
    canvas.width = geometry.canvasWidth;
    canvas.height = geometry.canvasHeight;
    ctx.fillStyle = "#181a1d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      hiddenVideo,
      geometry.padding,
      geometry.padding,
      geometry.frameWidth,
      geometry.frameHeight,
    );
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = Math.max(1, canvas.width * 0.0015);
    ctx.strokeRect(
      geometry.padding,
      geometry.padding,
      geometry.frameWidth,
      geometry.frameHeight,
    );

    const drawPolygon = (points, color, fill, dashed, index, closed, showVertices, hoveredVertexIndex) => {
      if (!points.length) return;
      ctx.save();
      ctx.lineWidth = Math.max(2, canvas.width * 0.003);
      ctx.strokeStyle = color;
      ctx.setLineDash(dashed ? [Math.max(6, canvas.width * 0.008), Math.max(4, canvas.width * 0.005)] : []);
      ctx.beginPath();
      const firstCanvasPoint = pointToCanvas(points[0]);
      ctx.moveTo(firstCanvasPoint.x, firstCanvasPoint.y);
      for (let index = 1; index < points.length; index += 1) {
        const canvasPoint = pointToCanvas(points[index]);
        ctx.lineTo(canvasPoint.x, canvasPoint.y);
      }
      if (closed && points.length >= 3) ctx.closePath();
      ctx.fillStyle = fill;
      if (closed && points.length >= 3) ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      if (showVertices) {
        const vertexRadius = Math.max(4, canvas.width * 0.005);
        points.forEach((point, vertexIndex) => {
          const canvasPoint = pointToCanvas(point);
          const hovered = vertexIndex === hoveredVertexIndex;
          ctx.beginPath();
          ctx.arc(canvasPoint.x, canvasPoint.y, hovered ? vertexRadius * 1.45 : vertexRadius, 0, Math.PI * 2);
          ctx.fillStyle = hovered ? "rgba(34,197,94,1)" : "rgba(255,255,255,0.98)";
          ctx.fill();
          ctx.lineWidth = Math.max(1, canvas.width * 0.0015);
          ctx.strokeStyle = hovered ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.7)";
          ctx.stroke();
        });
      }
      if (Number.isInteger(index)) {
        ctx.font = `${Math.max(14, canvas.width * 0.018)}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          String(index + 1),
          firstCanvasPoint.x + Math.max(7, canvas.width * 0.008),
          firstCanvasPoint.y + Math.max(18, canvas.width * 0.022),
        );
      }
      ctx.restore();
    };

    const drawPoint = (p, color) => {
      const canvasPoint = pointToCanvas(p);
      ctx.beginPath();
      ctx.arc(canvasPoint.x, canvasPoint.y, Math.max(6, canvas.width * 0.008), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(0,0,0,0.6)";
      ctx.stroke();
    };

    const drawPolygonDraftGuide = () => {
      if (!state.polygonDraft.length) return;
      const firstPoint = state.polygonDraft[0];
      const lastPoint = state.polygonDraft[state.polygonDraft.length - 1];
      const targetPoint = state.polygonSnapToStart ? firstPoint : state.polygonHover;
      if (targetPoint) {
        const lastCanvasPoint = pointToCanvas(lastPoint);
        const targetCanvasPoint = pointToCanvas(targetPoint);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lastCanvasPoint.x, lastCanvasPoint.y);
        ctx.lineTo(targetCanvasPoint.x, targetCanvasPoint.y);
        ctx.lineWidth = Math.max(2, canvas.width * 0.003);
        ctx.strokeStyle = state.polygonSnapToStart ? "rgba(34,197,94,0.98)" : "rgba(255,255,255,0.8)";
        ctx.setLineDash([Math.max(6, canvas.width * 0.008), Math.max(4, canvas.width * 0.005)]);
        ctx.stroke();
        ctx.restore();
      }
      if (state.polygonDraft.length < 3) return;
      const firstCanvasPoint = pointToCanvas(firstPoint);
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        firstCanvasPoint.x,
        firstCanvasPoint.y,
        Math.max(11, canvas.width * 0.015),
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = state.polygonSnapToStart ? "rgba(34,197,94,0.24)" : "rgba(255,255,255,0.12)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, canvas.width * 0.003);
      ctx.strokeStyle = state.polygonSnapToStart ? "rgba(34,197,94,1)" : "rgba(255,255,255,0.75)";
      ctx.stroke();
      ctx.restore();
    };

    const drawSelectedPolygonGuide = () => {
      const target = state.polygonHoverTarget;
      if (!target || target.type !== "edge") return;
      if (state.selectedPolygonIndex < 0 || state.selectedPolygonIndex >= state.polygons.length) return;
      const polygon = state.polygons[state.selectedPolygonIndex];
      const startPoint = polygon[target.edgeIndex];
      const endPoint = polygon[(target.edgeIndex + 1) % polygon.length];
      if (!startPoint || !endPoint) return;
      const startCanvasPoint = pointToCanvas(startPoint);
      const endCanvasPoint = pointToCanvas(endPoint);
      const insertCanvasPoint = pointToCanvas(target.point);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(startCanvasPoint.x, startCanvasPoint.y);
      ctx.lineTo(endCanvasPoint.x, endCanvasPoint.y);
      ctx.lineWidth = Math.max(3, canvas.width * 0.0045);
      ctx.strokeStyle = "rgba(34,197,94,0.95)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(insertCanvasPoint.x, insertCanvasPoint.y, Math.max(5, canvas.width * 0.006), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(34,197,94,1)";
      ctx.fill();
      ctx.lineWidth = Math.max(1, canvas.width * 0.0015);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.stroke();
      ctx.restore();
    };

    if (state.mode === "polygon") {
      state.polygons.forEach((polygon, index) => {
        const selected = index === state.selectedPolygonIndex;
        const hoveredVertexIndex = (
          selected && state.polygonHoverTarget?.type === "vertex"
        ) ? state.polygonHoverTarget.vertexIndex : -1;
        drawPolygon(
          polygon,
          selected ? "rgba(34,197,94,0.98)" : "rgba(255,255,255,0.98)",
          selected ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.3)",
          false,
          index,
          true,
          selected,
          hoveredVertexIndex,
        );
      });
      drawSelectedPolygonGuide();
      drawPolygon(state.polygonDraft, "rgba(255,255,255,0.95)", "rgba(255,255,255,0.15)", true, null, false, true, -1);
      drawPolygonDraftGuide();
    } else {
      state.pointsPos.forEach(p => drawPoint(p, "#70FF81"));
      state.pointsNeg.forEach(p => drawPoint(p, "#FF6B6B"));
    }
  };

  const seekToTime = (t, skipSliderUpdate) => {
    if (!state.open) return;
    const clamped = Math.max(0, Math.min(state.duration || 0, t));
    state.time = clamped;
    if (!skipSliderUpdate && state.duration > 0) {
      slider.value = String(Math.round((clamped / state.duration) * 1000));
    }
    label.textContent = "t=" + clamped.toFixed(2) + "s";
    hiddenVideo.currentTime = clamped;
  };

  const pushHistory = () => {
    const snapshot = {
      mode: state.mode,
      pointsPos: state.pointsPos.map(p => ({x:p.x,y:p.y})),
      pointsNeg: state.pointsNeg.map(p => ({x:p.x,y:p.y})),
      polygons: state.polygons.map(polygon => polygon.map(point => ({x:point.x,y:point.y}))),
      polygonDraft: state.polygonDraft.map(point => ({x:point.x,y:point.y})),
      time: state.time,
    };
    if (state.historyIndex < state.history.length - 1) {
      state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(snapshot);
    state.historyIndex = state.history.length - 1;
    updateUndoRedo();
  };

  const restoreHistory = (idx) => {
    const s = state.history[idx];
    state.mode = s.mode || "point";
    state.pointsPos = (s.pointsPos || []).map(p => ({x:p.x,y:p.y}));
    state.pointsNeg = (s.pointsNeg || []).map(p => ({x:p.x,y:p.y}));
    state.polygons = (s.polygons || []).map(polygon => polygon.map(point => ({x:point.x,y:point.y})));
    state.polygonDraft = (s.polygonDraft || []).map(point => ({x:point.x,y:point.y}));
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    state.time = s.time || 0;
    seekToTime(state.time, true);
    updateUndoRedo();
    btnModePoint.classList.toggle("active", state.mode === "point");
    btnModePolygon.classList.toggle("active", state.mode === "polygon");
    updateHint();
    draw();
  };

  slider.addEventListener("input", () => {
    if (!state.open) return;
    if (state.duration <= 0) return;
    const v = Number(slider.value || 0);
    const t = (v / 1000) * state.duration;
    seekToTime(t, true);
  });

  hiddenVideo.addEventListener("seeked", () => draw());
  hiddenVideo.addEventListener("loadedmetadata", () => {
    state.duration = hiddenVideo.duration || 0;
    state.videoWidth = hiddenVideo.videoWidth || 0;
    state.videoHeight = hiddenVideo.videoHeight || 0;
    layoutCanvas();
    seekToTime(0, false);
    draw();
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const getCanvasNormPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const geometry = editorGeometry();
    const canvasX = ((e.clientX - rect.left) / rect.width) * geometry.canvasWidth;
    const canvasY = ((e.clientY - rect.top) / rect.height) * geometry.canvasHeight;
    return {
      x: (canvasX - geometry.padding) / geometry.frameWidth,
      y: (canvasY - geometry.padding) / geometry.frameHeight,
    };
  };

  const clampPointToEditor = (point) => {
    const geometry = editorGeometry();
    const marginX = geometry.padding / geometry.frameWidth;
    const marginY = geometry.padding / geometry.frameHeight;
    return {
      x: Math.max(-marginX, Math.min(1 + marginX, point.x)),
      y: Math.max(-marginY, Math.min(1 + marginY, point.y)),
    };
  };

  const snapPointOutsideFrame = (point) => {
    const geometry = editorGeometry();
    const scale = editorDisplayScale();
    const thresholdX = 8 / Math.max(1, scale.x);
    const thresholdY = 8 / Math.max(1, scale.y);
    const overscanX = 2 / geometry.frameWidth;
    const overscanY = 2 / geometry.frameHeight;
    const snapped = {x:point.x, y:point.y};
    if (point.x >= -overscanX && point.x <= thresholdX) snapped.x = -overscanX;
    else if (point.x <= 1 + overscanX && point.x >= 1 - thresholdX) snapped.x = 1 + overscanX;
    if (point.y >= -overscanY && point.y <= thresholdY) snapped.y = -overscanY;
    else if (point.y <= 1 + overscanY && point.y >= 1 - thresholdY) snapped.y = 1 + overscanY;
    return snapped;
  };

  const preparePolygonPoint = (point) => snapPointOutsideFrame(clampPointToEditor(point));

  const pointInsideFrame = (point) => {
    return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  };

  const editorDisplayScale = () => {
    const rect = canvas.getBoundingClientRect();
    const geometry = editorGeometry();
    return {
      x: rect.width * geometry.frameWidth / geometry.canvasWidth,
      y: rect.height * geometry.frameHeight / geometry.canvasHeight,
    };
  };

  const shouldSnapToPolygonStart = (point) => {
    if (state.polygonDraft.length < 3) return false;
    const rect = canvas.getBoundingClientRect();
    const scale = editorDisplayScale();
    const firstPoint = state.polygonDraft[0];
    const dx = (point.x - firstPoint.x) * scale.x;
    const dy = (point.y - firstPoint.y) * scale.y;
    const snapRadius = Math.max(14, Math.min(22, Math.min(rect.width, rect.height) * 0.04));
    return Math.hypot(dx, dy) <= snapRadius;
  };

  const pointNearSegment = (point, start, end, tolerance) => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq <= 0) return Math.hypot(point.x - start.x, point.y - start.y) <= tolerance;
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
    const nearestX = start.x + t * dx;
    const nearestY = start.y + t * dy;
    return Math.hypot(point.x - nearestX, point.y - nearestY) <= tolerance;
  };

  const nearestPointOnSegment = (point, start, end) => {
    const scale = editorDisplayScale();
    const dx = (end.x - start.x) * scale.x;
    const dy = (end.y - start.y) * scale.y;
    const px = (point.x - start.x) * scale.x;
    const py = (point.y - start.y) * scale.y;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / lengthSq)) : 0;
    const nearest = {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
    return {
      point: nearest,
      distance: Math.hypot((point.x - nearest.x) * scale.x, (point.y - nearest.y) * scale.y),
    };
  };

  const findPolygonVertex = (point, polygon, tolerance = 13) => {
    const scale = editorDisplayScale();
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    polygon.forEach((vertex, index) => {
      const distance = Math.hypot((point.x - vertex.x) * scale.x, (point.y - vertex.y) * scale.y);
      if (distance <= tolerance && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const findPolygonEdge = (point, polygon, tolerance = 10) => {
    let best = null;
    for (let index = 0; index < polygon.length; index += 1) {
      const nearest = nearestPointOnSegment(point, polygon[index], polygon[(index + 1) % polygon.length]);
      if (nearest.distance <= tolerance && (!best || nearest.distance < best.distance)) {
        best = {edgeIndex:index, point:nearest.point, distance:nearest.distance};
      }
    }
    return best;
  };

  const pointInPolygon = (point, polygon) => {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
      const currentPoint = polygon[index];
      const previousPoint = polygon[previous];
      if (pointNearSegment(point, previousPoint, currentPoint, 0.008)) return true;
      const intersects = (
        (currentPoint.y > point.y) !== (previousPoint.y > point.y) &&
        point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x
      );
      if (intersects) inside = !inside;
    }
    return inside;
  };

  const findPolygonIndexAt = (point) => {
    for (let index = state.polygons.length - 1; index >= 0; index -= 1) {
      const polygon = state.polygons[index];
      if (pointInPolygon(point, polygon) || findPolygonEdge(point, polygon, 10)) return index;
    }
    return -1;
  };

  const closePolygonDraft = () => {
    if (state.polygonDraft.length < 3) {
      updateHint("多边形至少需要 3 个顶点", true);
      return false;
    }
    state.polygons.push(state.polygonDraft.map(point => ({x:point.x, y:point.y})));
    state.selectedPolygonIndex = state.polygons.length - 1;
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    pushHistory();
    updateHint();
    draw();
    return true;
  };

  canvas.addEventListener("mousedown", (e) => {
    if (!state.open) return;
    if (state.videoWidth <= 0 || state.videoHeight <= 0) return;
    const rawPoint = getCanvasNormPos(e);

    if (state.mode === "polygon") {
      const hitPoint = clampPointToEditor(rawPoint);
      const polygonPoint = preparePolygonPoint(rawPoint);
      if (e.button === 2) {
        if (state.polygonDraft.length) {
          state.polygonDraft.pop();
          state.polygonHover = null;
          state.polygonSnapToStart = false;
          pushHistory();
          updateHint();
          draw();
          return;
        }
        if (state.selectedPolygonIndex >= 0 && state.selectedPolygonIndex < state.polygons.length) {
          const selectedPolygon = state.polygons[state.selectedPolygonIndex];
          const vertexIndex = findPolygonVertex(hitPoint, selectedPolygon);
          if (vertexIndex >= 0) {
            if (selectedPolygon.length <= 3) {
              updateHint("多边形至少需要保留 3 个锚点", true);
              return;
            }
            selectedPolygon.splice(vertexIndex, 1);
            state.polygonHoverTarget = null;
            pushHistory();
            updateHint();
            draw();
            return;
          }
        }
        const polygonIndex = findPolygonIndexAt(hitPoint);
        if (polygonIndex >= 0) {
          state.polygons.splice(polygonIndex, 1);
          if (state.selectedPolygonIndex === polygonIndex) state.selectedPolygonIndex = -1;
          else if (state.selectedPolygonIndex > polygonIndex) state.selectedPolygonIndex -= 1;
          state.polygonHoverTarget = null;
          pushHistory();
        }
        updateHint();
        draw();
        return;
      }
      if (e.button !== 0) return;
      if (state.polygonDraft.length) {
        if (shouldSnapToPolygonStart(polygonPoint)) {
          e.preventDefault();
          closePolygonDraft();
          return;
        }
        if (e.detail >= 2) {
          e.preventDefault();
          if (state.polygonDraft.length >= 3) closePolygonDraft();
          return;
        }
        state.polygonDraft.push(polygonPoint);
        state.polygonHover = polygonPoint;
        state.polygonSnapToStart = false;
        pushHistory();
        updateHint();
        draw();
        return;
      }

      if (state.selectedPolygonIndex >= 0 && state.selectedPolygonIndex < state.polygons.length) {
        const selectedPolygon = state.polygons[state.selectedPolygonIndex];
        const vertexIndex = findPolygonVertex(hitPoint, selectedPolygon);
        if (vertexIndex >= 0) {
          state.polygonDrag = {
            polygonIndex: state.selectedPolygonIndex,
            vertexIndex,
            moved: false,
          };
          state.polygonHoverTarget = {type:"vertex", vertexIndex};
          canvas.style.cursor = "grabbing";
          return;
        }
        const edge = findPolygonEdge(hitPoint, selectedPolygon);
        if (edge) {
          const insertIndex = edge.edgeIndex + 1;
          selectedPolygon.splice(insertIndex, 0, edge.point);
          state.polygonHoverTarget = {type:"vertex", vertexIndex:insertIndex};
          pushHistory();
          updateHint();
          draw();
          return;
        }
      }

      const polygonIndex = findPolygonIndexAt(hitPoint);
      if (polygonIndex >= 0) {
        state.selectedPolygonIndex = polygonIndex;
        state.polygonHoverTarget = null;
        canvas.style.cursor = "pointer";
        updateHint();
        draw();
        return;
      }

      state.selectedPolygonIndex = -1;
      state.polygonHoverTarget = null;
      state.polygonDraft.push(polygonPoint);
      state.polygonHover = polygonPoint;
      state.polygonSnapToStart = false;
      pushHistory();
      updateHint();
      draw();
      return;
    }

    if (!pointInsideFrame(rawPoint)) return;
    if (e.button === 2) state.pointsNeg.push(rawPoint);
    else if (e.button === 0) state.pointsPos.push(rawPoint);
    else return;
    pushHistory();
    draw();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!state.open || state.mode !== "polygon" || state.polygonDrag) return;
    const rawPoint = getCanvasNormPos(e);
    const hitPoint = clampPointToEditor(rawPoint);
    if (state.polygonDraft.length) {
      const polygonPoint = preparePolygonPoint(rawPoint);
      state.polygonHover = polygonPoint;
      state.polygonSnapToStart = shouldSnapToPolygonStart(polygonPoint);
      state.polygonHoverTarget = null;
      canvas.style.cursor = state.polygonSnapToStart ? "pointer" : "crosshair";
      draw();
      return;
    }

    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.polygonHoverTarget = null;
    if (state.selectedPolygonIndex >= 0 && state.selectedPolygonIndex < state.polygons.length) {
      const selectedPolygon = state.polygons[state.selectedPolygonIndex];
      const vertexIndex = findPolygonVertex(hitPoint, selectedPolygon);
      if (vertexIndex >= 0) {
        state.polygonHoverTarget = {type:"vertex", vertexIndex};
        canvas.style.cursor = "grab";
        draw();
        return;
      }
      const edge = findPolygonEdge(hitPoint, selectedPolygon);
      if (edge) {
        state.polygonHoverTarget = {type:"edge", edgeIndex:edge.edgeIndex, point:edge.point};
        canvas.style.cursor = "copy";
        draw();
        return;
      }
    }
    canvas.style.cursor = findPolygonIndexAt(hitPoint) >= 0 ? "pointer" : "crosshair";
    draw();
  });

  canvas.addEventListener("mouseleave", () => {
    if (!state.open || state.mode !== "polygon" || state.polygonDrag) return;
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    draw();
  });

  window.addEventListener("mousemove", (e) => {
    if (!state.open || state.mode !== "polygon" || !state.polygonDrag) return;
    const drag = state.polygonDrag;
    if (drag.polygonIndex < 0 || drag.polygonIndex >= state.polygons.length) return;
    const polygon = state.polygons[drag.polygonIndex];
    if (drag.vertexIndex < 0 || drag.vertexIndex >= polygon.length) return;
    const point = preparePolygonPoint(getCanvasNormPos(e));
    const previousPoint = polygon[drag.vertexIndex];
    if (Math.abs(previousPoint.x - point.x) > 0.000001 || Math.abs(previousPoint.y - point.y) > 0.000001) {
      drag.moved = true;
      polygon[drag.vertexIndex] = point;
    }
    state.polygonHoverTarget = {type:"vertex", vertexIndex:drag.vertexIndex};
    canvas.style.cursor = "grabbing";
    draw();
  });

  window.addEventListener("mouseup", () => {
    if (!state.polygonDrag) return;
    const drag = state.polygonDrag;
    state.polygonDrag = null;
    canvas.style.cursor = "grab";
    if (drag.moved) pushHistory();
    updateHint();
    draw();
  });

  canvas.addEventListener("dblclick", (e) => e.preventDefault());

  btnUndo.addEventListener("click", () => {
    if (state.historyIndex >= 0) {
      state.historyIndex -= 1;
      if (state.historyIndex >= 0) restoreHistory(state.historyIndex);
      else {
        state.pointsPos = [];
        state.pointsNeg = [];
        state.polygons = [];
        state.polygonDraft = [];
        state.polygonHover = null;
        state.polygonSnapToStart = false;
        state.selectedPolygonIndex = -1;
        state.polygonDrag = null;
        state.polygonHoverTarget = null;
        canvas.style.cursor = "crosshair";
        updateUndoRedo();
        updateHint();
        draw();
      }
    }
  });
  btnRedo.addEventListener("click", () => {
    if (state.historyIndex < state.history.length - 1) {
      state.historyIndex += 1;
      restoreHistory(state.historyIndex);
    }
  });
  btnClear.addEventListener("click", () => {
    state.pointsPos = [];
    state.pointsNeg = [];
    state.polygons = [];
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    pushHistory();
    updateHint();
    draw();
  });

  btnModePoint.addEventListener("click", () => {
    state.mode = "point";
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    btnModePoint.classList.add("active");
    btnModePolygon.classList.remove("active");
    pushHistory();
    updateHint();
    draw();
  });

  btnModePolygon.addEventListener("click", () => {
    state.mode = "polygon";
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    btnModePolygon.classList.add("active");
    btnModePoint.classList.remove("active");
    pushHistory();
    updateHint();
    draw();
  });

  const closeModal = () => {
    forceCloseModal();
  };
  window.closeSam3FramesEditor = closeModal;

  btnCancel.addEventListener("click", () => closeModal());
  backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) closeModal(); });

  btnConfirm.addEventListener("click", () => {
    let payload;
    if (state.mode === "polygon") {
      if (state.polygonDraft.length > 0 && state.polygonDraft.length < 3) {
        updateHint("当前多边形至少需要 3 个顶点", true);
        return;
      }
      if (state.polygonDraft.length >= 3) {
        state.polygons.push(state.polygonDraft.map(point => ({x:point.x, y:point.y})));
        state.polygonDraft = [];
        state.polygonHover = null;
        state.polygonSnapToStart = false;
        state.polygonHoverTarget = null;
      }
      if (!state.polygons.length) {
        updateHint("请先绘制至少一个多边形遮罩", true);
        return;
      }
      payload = {
        mode: "static_polygons",
        apply_to_all_frames: true,
        frame_time: state.time,
        polygons: state.polygons.map(polygon => polygon.map(point => ({x:point.x, y:point.y}))),
      };
    } else {
      payload = {
        mode: "sam3_points",
        frame_time: state.time,
        positive_coords: state.pointsPos.map(p => ({x:p.x, y:p.y})),
        negative_coords: state.pointsNeg.map(p => ({x:p.x, y:p.y})),
      };
    }
    const value = JSON.stringify(payload);
    window.SimpAISam3PendingEditorPayload = value;
    const hidden = document.querySelector("#sam3_editor_payload textarea, #sam3_editor_payload input");
    if (hidden) {
      const proto = hidden instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(hidden, value);
      else hidden.value = value;
      hidden.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: value }));
      hidden.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }
    const genBtn = document.querySelector("#sam3_points_generate_btn button, #sam3_points_generate_btn");
    if (genBtn) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => genBtn.click());
      });
    }
    closeModal();
  });

  window.sam3PointsGeneratePayload = (...args) => {
    const pending = String(window.SimpAISam3PendingEditorPayload || "");
    if (pending && args.length >= 4) {
      args[3] = pending;
      window.SimpAISam3PendingEditorPayload = "";
    }
    return args;
  };

  const getVideoSrc = (videoEl) => {
    if (!videoEl) return "";
    const src = videoEl.currentSrc || videoEl.src || "";
    if (src) return src;
    const source = videoEl.querySelector("source");
    return (source && source.src) ? source.src : "";
  };

  const fileExt = (file) => {
    const name = String(file && file.name ? file.name : "").toLowerCase();
    const idx = name.lastIndexOf(".");
    return idx >= 0 ? name.slice(idx) : "";
  };

  const isVideoFile = (file) => {
    const mime = String(file && file.type ? file.type : "").toLowerCase();
    if (mime.startsWith("video/")) return true;
    return [".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"].includes(fileExt(file));
  };

  const isImageFile = (file) => {
    const mime = String(file && file.type ? file.type : "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    return [".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(fileExt(file));
  };

  const transferFiles = (transfer) => {
    const files = [];
    if (!transfer) return files;
    if (transfer.files && transfer.files.length) {
      files.push(...Array.from(transfer.files).filter(Boolean));
    }
    if (!files.length && transfer.items) {
      for (const item of Array.from(transfer.items)) {
        if (item && item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }
    return files;
  };

  const containsTransferFile = (transfer) => {
    if (!transfer) return false;
    if (transfer.files && transfer.files.length) return true;
    if (!transfer.items) return false;
    return Array.from(transfer.items).some((item) => item && item.kind === "file");
  };

  const componentFileInput = (componentId) => {
    const root = document.getElementById(componentId);
    if (!root) return null;
    return root.querySelector('input[type="file"]');
  };

  const componentIsVisible = (root) => {
    if (!root) return false;
    if (root.hidden || root.closest('[hidden], .simpai-mounted-hidden, .simpai-force-hidden, .hidden, .hide, [aria-hidden="true"]')) return false;
    try {
      const style = window.getComputedStyle ? window.getComputedStyle(root) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none")) return false;
      const rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
      if (rect && (rect.width <= 0 || rect.height <= 0)) return false;
    } catch (e) {
      return false;
    }
    return true;
  };

  const uploadFileToComponent = (componentId, file) => {
    const replacementBridge = window.SimpAIGradioMediaReplacement;
    if (replacementBridge?.supports?.(componentId)) {
      void replacementBridge.replaceFile(componentId, file);
      return true;
    }
    const input = componentFileInput(componentId);
    if (!input || !file) return false;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      return true;
    } catch (e) {
      console.warn("[SAM3] upload drop bridge failed", e);
      return false;
    }
  };

  const sam3TrimTextField = () => {
    const root = document.getElementById("sam3_trim_payload");
    if (!root) return null;
    return root.querySelector("textarea, input");
  };

  const readExistingSam3TrimPayload = () => {
    const field = sam3TrimTextField();
    const text = field ? String(field.value || "").trim() : "";
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      return data && typeof data === "object" ? data : null;
    } catch (e) {
      return null;
    }
  };

  const writeSam3TrimPayload = (payload) => {
    const field = sam3TrimTextField();
    if (!field) return false;
    const text = payload ? JSON.stringify(payload) : "";
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(field, text);
    else field.value = text;
    try {
      field.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
    } catch (e) {
      field.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
    field.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return true;
  };

  const sam3ButtonLabel = (button) => {
    if (!button) return "";
    return [
      button.textContent || "",
      button.getAttribute("aria-label") || "",
      button.getAttribute("title") || "",
    ].join(" ").trim().toLowerCase();
  };

  const isSam3NativeTrimSubmitButton = (button) => {
    const label = sam3ButtonLabel(button);
    return label === "trim" || label.includes("trim video") || label.includes("裁剪");
  };

  const isSam3NativeTrimCancelButton = (button) => {
    const label = sam3ButtonLabel(button);
    return label === "cancel" || label.includes("cancel") || label.includes("取消");
  };

  const readSam3TrimPct = (el, fallback) => {
    const raw = el && el.style ? String(el.style.left || "") : "";
    const value = parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  };

  const sam3NativeTrimPayload = (root) => {
    if (!root) return null;
    const video = root.querySelector("video");
    const duration = Number(video && video.duration ? video.duration : 0);
    if (!Number.isFinite(duration) || duration <= 0) return null;
    const leftHandle = root.querySelector('button[aria-label="start drag handle for trimming video"]');
    const rightHandle = root.querySelector('button[aria-label="end drag handle for trimming video"]');
    if (!leftHandle || !rightHandle) return null;

    const leftPct = Math.max(0, Math.min(100, readSam3TrimPct(leftHandle, 0)));
    const rightPct = Math.max(0, Math.min(100, readSam3TrimPct(rightHandle, 100)));
    const relStart = Math.max(0, Math.min(duration, duration * Math.min(leftPct, rightPct) / 100));
    const relEnd = Math.max(0, Math.min(duration, duration * Math.max(leftPct, rightPct) / 100));
    if (relEnd <= relStart + 0.001) return null;

    const previous = readExistingSam3TrimPayload();
    const previousStart = Number(previous && previous.trim_start);
    const previousDuration = Number(previous && previous.duration);
    const previousSourceDuration = Number(previous && previous.video_duration);
    const chainsPreviousTrim = (
      previous &&
      Number.isFinite(previousStart) &&
      Number.isFinite(previousDuration) &&
      previousDuration > 0 &&
      Math.abs(previousDuration - duration) < 0.35
    );
    const baseStart = chainsPreviousTrim ? previousStart : 0;
    const sourceDuration = (
      chainsPreviousTrim && Number.isFinite(previousSourceDuration) && previousSourceDuration > 0
    ) ? previousSourceDuration : duration;
    const start = Math.max(0, Math.min(sourceDuration, baseStart + relStart));
    const end = Math.max(0, Math.min(sourceDuration, baseStart + relEnd));
    if (end <= start + 0.001) return null;
    return {
      source: "gradio_video_trim",
      component: "sam3_input_video",
      trim_start: Math.round(start * 1000) / 1000,
      trim_end: Math.round(end * 1000) / 1000,
      duration: Math.round((end - start) * 1000) / 1000,
      video_duration: Math.round(sourceDuration * 1000) / 1000,
      preview_duration: Math.round(duration * 1000) / 1000,
    };
  };

  const bindSam3NativeTrimRecorder = () => {
    const root = document.getElementById("sam3_input_video");
    if (!root) return false;
    const input = componentFileInput("sam3_input_video");
    if (input && input.dataset.sam3TrimUploadClearBound !== "1") {
      input.dataset.sam3TrimUploadClearBound = "1";
      input.addEventListener("change", () => writeSam3TrimPayload(null), false);
    }
    if (root.dataset.sam3NativeTrimRecorderBound === "1") return true;
    root.dataset.sam3NativeTrimRecorderBound = "1";
    root.addEventListener("click", (event) => {
      const target = event.target;
      const button = target && target.closest ? target.closest("button") : null;
      if (!button || !root.contains(button)) return;
      if (isSam3NativeTrimSubmitButton(button)) {
        const payload = sam3NativeTrimPayload(root);
        if (payload) writeSam3TrimPayload(payload);
      } else if (isSam3NativeTrimCancelButton(button)) {
        writeSam3TrimPayload(null);
      }
    }, true);
    return true;
  };

  const bindUploadDropZone = (componentId, options) => {
    const root = document.getElementById(componentId);
    if (!root) return false;
    root.querySelectorAll("video").forEach((video) => video.setAttribute("draggable", "false"));
    if (root.dataset.sam3UploadDropBound === "1") return true;
    root.dataset.sam3UploadDropBound = "1";
    const opts = options || {};

    const preventFileOpen = (event) => {
      if (!componentIsVisible(root)) return;
      if (!containsTransferFile(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
    };

    const onDrop = (event) => {
      if (!componentIsVisible(root)) return;
      if (!containsTransferFile(event.dataTransfer)) return;
      preventFileOpen(event);
      const file = transferFiles(event.dataTransfer)[0];
      if (!file) return;
      if (opts.imageBridgeId && isImageFile(file)) {
        uploadFileToComponent(opts.imageBridgeId, file);
        return;
      }
      if (isVideoFile(file)) {
        uploadFileToComponent(componentId, file);
      }
    };

    root.addEventListener("dragenter", preventFileOpen, true);
    root.addEventListener("dragover", preventFileOpen, true);
    root.addEventListener("drop", onDrop, true);
    return true;
  };

  const bindUploadDropZones = () => {
    bindUploadDropZone("sam3_input_video", {});
    bindUploadDropZone("sam3_output_mask_video", { imageBridgeId: "sam3_mask_upload_file" });
  };

  window.SimpAISam3UploadDropBridge = {
    bindUploadDropZone,
    bindUploadDropZones,
    uploadFileToComponent,
  };

  const openFromVideo = (videoEl) => {
    const src = getVideoSrc(videoEl);
    if (!src) return;
    state.mode = "point";
    state.pointsPos = [];
    state.pointsNeg = [];
    state.polygons = [];
    state.polygonDraft = [];
    state.polygonHover = null;
    state.polygonSnapToStart = false;
    state.selectedPolygonIndex = -1;
    state.polygonDrag = null;
    state.polygonHoverTarget = null;
    canvas.style.cursor = "crosshair";
    state.history = [];
    state.historyIndex = -1;
    updateUndoRedo();
    btnModePoint.classList.toggle("active", state.mode === "point");
    btnModePolygon.classList.toggle("active", state.mode === "polygon");
    updateHint();
    hiddenVideo.src = src;
    hiddenVideo.load();
    state.open = true;
    clearForcedCloseStyles();
    ensureModalPortal();
    document.body.classList.add("sam3-frames-editor-open");
    backdrop.setAttribute("aria-hidden", "false");
    modal.removeAttribute("aria-hidden");
    backdrop.style.setProperty("display", "flex", "important");
    backdrop.style.setProperty("visibility", "visible", "important");
    backdrop.style.setProperty("pointer-events", "auto", "important");
    modal.style.setProperty("display", "flex", "important");
    modal.style.setProperty("visibility", "visible", "important");
    modal.style.setProperty("pointer-events", "auto", "important");
    layoutCanvas();
  };

  window.addEventListener("resize", () => layoutCanvas());
  try {
    const ro = new ResizeObserver(() => layoutCanvas());
    ro.observe(body);
  } catch (e) {}

  const bindClick = () => {
    const container = document.getElementById("sam3_input_video");
    if (!container) return false;
    const v = container.querySelector("video");
    if (!v) return false;
    v.setAttribute("draggable", "false");
    if (v.dataset.sam3Bound === "1") return true;
    v.dataset.sam3Bound = "1";

    const handler = (e) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.target !== v) return;
      openFromVideo(v);
    };

    v.addEventListener("dblclick", handler, false);
    return true;
  };

  const mo = new MutationObserver(() => {
    bindClick();
    bindSam3NativeTrimRecorder();
    bindUploadDropZones();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  bindClick();
  bindSam3NativeTrimRecorder();
  bindUploadDropZones();
})()
"""
    glue_html = '<img src="x" alt="" style="display:none" onerror="' + html.escape(glue_js, quote=True) + '">'

    return r"""
<div id="sam3_frames_editor_root"></div>
<style>
  #sam3_frames_modal_backdrop{
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: none;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 18px;
    z-index: 2147483647;
    isolation: isolate;
    box-sizing: border-box;
  }
  body.sam3-frames-editor-open{
    overflow: hidden !important;
  }
  #sam3_frames_modal{
    width: min(980px, 92vw);
    height: min(720px, calc(100vh - 48px));
    background: #0f1011;
    border: 1px solid #333;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 26px 80px rgba(0,0,0,0.65);
  }
  #sam3_frames_toolbar{
    flex: 0 0 52px;
    width: 100%;
    background: #222;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px;
    box-sizing: border-box;
    border-bottom: 1px solid #333;
  }
  #sam3_frames_hint{
    flex: 1;
    min-width: 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    user-select: none;
    padding: 0 8px;
  }
  #sam3_hint_mode,
  #sam3_hint_action{
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #sam3_hint_mode{
    color: #f0f0f0;
    font-size: 12px;
    font-weight: 600;
    line-height: 17px;
  }
  #sam3_hint_action{
    color: #aaa;
    font-size: 11px;
    line-height: 15px;
  }
  .sam3_hint_dot{
    display: inline-block;
    width: 10px;
    text-align: center;
    font-weight: 700;
  }
  .sam3_btn{
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 6px;
    color: #ccc;
    background: transparent;
    border: 1px solid transparent;
    user-select: none;
  }
  .sam3_btn:hover{ background:#333; }
  .sam3_btn.active{ background:#444; color:#fff; border-color:#555; }
  #sam3_frames_body{
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f1011;
    min-height: 0;
    overflow: auto;
  }
  #sam3_canvas{
    max-width: 100%;
    max-height: 100%;
    cursor: crosshair;
    display: block;
  }
  #sam3_frames_footer{
    flex: 0 0 44px;
    width: 100%;
    background: #222;
    border-top: 1px solid #333;
    padding: 6px 10px;
    box-sizing: border-box;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  #sam3_time_slider{ flex: 1; height: 4px; }
  #sam3_frame_label{ color:#ccc; font-family: monospace; font-size: 12px; min-width: 140px; text-align:center; user-select:none; }
  #sam3_confirm{
    height: 30px;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid #555;
    background: #2b6cb0;
    color: #fff;
    cursor: pointer;
  }
  #sam3_cancel{
    height: 30px;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid #555;
    background: #333;
    color: #eee;
    cursor: pointer;
  }
  #sam3_stop_btn button{
    background:#b91c1c !important;
    border-color:#ef4444 !important;
    color:#fff !important;
  }
</style>

<div id="sam3_frames_modal_backdrop">
  <div id="sam3_frames_modal">
    <div id="sam3_frames_toolbar">
      <div style="display:flex; gap:6px; align-items:center;">
        <div class="sam3_btn" id="sam3_undo" title="Undo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
        </div>
        <div class="sam3_btn" id="sam3_redo" title="Redo">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/></svg>
        </div>
        <div class="sam3_btn" id="sam3_clear" title="Clear All">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </div>
      </div>
      <div id="sam3_frames_hint">
        <div id="sam3_hint_mode" title="Point Mode · SAM3 跟踪 · 当前帧点选 · 自动跟踪其他帧">Point Mode · SAM3 跟踪 · 当前帧点选 · 自动跟踪其他帧</div>
        <div id="sam3_hint_action" title="左键选取，右键排除">左键<span class="sam3_hint_dot" style="color:#22c55e;">●</span>选取，右键<span class="sam3_hint_dot" style="color:#ef4444;">●</span>排除</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center;">
        <div class="sam3_btn active" id="sam3_mode_point" title="Point Mode：运行 SAM3 跟踪" aria-label="Point Mode：运行 SAM3 跟踪">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </div>
        <div class="sam3_btn" id="sam3_mode_polygon" title="Polygon Mask：固定到所有帧，不运行 SAM3" aria-label="Polygon Mask：固定到所有帧，不运行 SAM3">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2 2 9l4 13h12l4-13-10-7zm0 2.4 7.6 5.3-3 10.3H7.4l-3-10.3L12 4.4z"/></svg>
        </div>
      </div>
    </div>
    <div id="sam3_frames_body">
      <canvas id="sam3_canvas"></canvas>
      <video id="sam3_hidden_video" style="display:none;"></video>
    </div>
    <div id="sam3_frames_footer">
      <div id="sam3_frame_label">t=0.00s</div>
      <input id="sam3_time_slider" type="range" min="0" max="1000" value="0" step="1" />
      <button id="sam3_cancel">取消</button>
      <button id="sam3_confirm">确认</button>
    </div>
  </div>
</div>
""" + glue_html
