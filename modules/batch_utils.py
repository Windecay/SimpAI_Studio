import os
import uuid
import copy
import random
import re
import threading
import json
from html import escape
import numpy as np
import gradio as gr
from PIL import Image
from ui.update_helpers import dropdown_update, gr_update
from modules.scene_batch_inputs import INPUTS, INPUT_BY_SLOT, MEDIA_EXTENSIONS, MEDIA_UPLOAD_LABELS, replace_media_input

BATCH_EVENTS = {}
_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def list_images(folder_path, extensions=None):
    if folder_path is None:
        return []
    folder_path = str(folder_path).strip()
    if folder_path == "" or not os.path.isdir(folder_path):
        return []
    files = []
    for name in os.listdir(folder_path):
        full = os.path.join(folder_path, name)
        if not os.path.isfile(full):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in (_EXTS if extensions is None else extensions):
            files.append(full)
    files.sort(key=lambda p: os.path.basename(p).lower())
    return files


def files_from_upload(upload_files, *, strict=False):
    if upload_files is None:
        return []
    if isinstance(upload_files, (str, dict)):
        upload_files = [upload_files]
    if not isinstance(upload_files, list):
        return []
    files = []
    for it in upload_files:
        p = None
        if isinstance(it, str):
            p = it
        elif isinstance(it, dict):
            p = it.get("path") or it.get("name")
        else:
            p = getattr(it, "name", None)
        if p and isinstance(p, str) and (strict or os.path.exists(p)):
            files.append(p)
    if not strict:
        files = [p for p in files if os.path.splitext(p)[1].lower() in _EXTS]
    files.sort(key=lambda p: os.path.basename(p).lower())
    return files


def get_files(folder_path, upload_files, media_type=None):
    upload_list = files_from_upload(upload_files, strict=media_type is not None)
    if len(upload_list) > 0:
        return upload_list
    # An explicit upload must never silently run files from the local folder.
    if media_type is not None and upload_files:
        return []
    return list_images(folder_path, MEDIA_EXTENSIONS[media_type] if media_type else None)


def load_rgba(path):
    with Image.open(path) as im:
        return np.array(im.convert("RGBA"))


def load_scene_batch_media(path, kind):
    if os.path.splitext(path)[1].lower() not in MEDIA_EXTENSIONS[kind]:
        raise ValueError(f"Expected {kind}: {os.path.basename(path)}")
    if kind == "image":
        image = load_rgba(path)
        return image, (image.shape[1], image.shape[0])
    if not os.path.isfile(path):
        raise FileNotFoundError(path)
    import av

    # Inspect one decoded frame, without loading the full clip into memory.
    with av.open(path, timeout=5.0) as container:
        streams = getattr(container.streams, kind)
        if not streams:
            raise ValueError(f"No {kind} stream")
        frame = next(container.decode(streams[0]), None)
        if frame is None:
            raise ValueError(f"Empty {kind} stream")
        size = (frame.width, frame.height) if kind == "video" else None
    return path, size


def _image_size_from_value(value):
    if value is None:
        return None
    if isinstance(value, dict):
        item = value.get("image")
        if item is None:
            item = value.get("background")
        if item is None:
            item = value.get("composite")
        value = item
    if isinstance(value, np.ndarray) and len(value.shape) >= 2:
        return int(value.shape[1]), int(value.shape[0])
    if isinstance(value, Image.Image):
        return int(value.size[0]), int(value.size[1])
    if isinstance(value, str) and os.path.exists(value):
        try:
            with Image.open(value) as im:
                return int(im.size[0]), int(im.size[1])
        except Exception:
            return None
    return None


def _positive_size_pair(width, height):
    try:
        width = int(float(width))
        height = int(float(height))
    except Exception:
        return None
    if width > 0 and height > 0:
        return width, height
    return None


def _positive_size_from_pair(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    return _positive_size_pair(value[0], value[1])


def _scene_batch_selected_original_resolution(scene_aspect_ratio, projected_base=None):
    if isinstance(projected_base, dict) and projected_base.get("origin"):
        return True
    text = str(scene_aspect_ratio or "").strip()
    if not text:
        return False
    marker_text = text.lower().replace("-", "_").replace(" ", "_")
    markers = ("|origin", "|original", "[origin]", "[original]", "(origin)", "(original)")
    return any(marker in marker_text for marker in markers)


def _scene_batch_truthy(value):
    if isinstance(value, str):
        return value.strip().lower() not in ("", "0", "false", "no", "off", "none")
    return bool(value)


def _scene_batch_effective_original_input(resolution_original_input, selected_original_resolution=False):
    return _scene_batch_truthy(resolution_original_input) or bool(selected_original_resolution)


def _scene_batch_target_size_for_batch_image(
    image_size,
    resolution_preprocess,
    resolution_profile,
    projected_base,
    custom_area,
    resolution_quantize_step,
    selected_original_resolution=False,
):
    image_size = _positive_size_from_pair(image_size)
    if not image_size:
        return None
    if selected_original_resolution:
        return image_size
    if resolution_preprocess is None:
        return None
    if projected_base:
        return resolution_preprocess.resolve_projected_profile_size(
            image_size,
            resolution_profile,
            selected_value=projected_base,
            resolution_quantize_step=resolution_quantize_step,
        )
    if custom_area:
        return resolution_preprocess.project_keep_input_pixel_area_size(
            image_size,
            custom_area,
            resolution_quantize_step,
        )
    return None


def _scene_batch_resolve_task_size(
    overwrite_width,
    overwrite_height,
    scene_aspect_ratio,
    resolution_multiplier,
    resolution_quantize_step,
    resolution_preprocess=None,
):
    if resolution_preprocess is not None:
        try:
            return resolution_preprocess.resolve_target_size(
                overwrite_width=overwrite_width,
                overwrite_height=overwrite_height,
                scene_aspect_ratio=scene_aspect_ratio,
                resolution_multiplier=resolution_multiplier,
                resolution_quantize_step=resolution_quantize_step,
            )
        except Exception:
            pass
    size = _positive_size_pair(overwrite_width, overwrite_height)
    if not size:
        return None
    try:
        multiplier = float(resolution_multiplier)
    except Exception:
        multiplier = 1.0
    multiplier = max(1.0, min(2.0, multiplier))
    if multiplier <= 1.0:
        return size
    try:
        step = int(resolution_quantize_step)
    except Exception:
        step = 8
    if step <= 0:
        step = 8

    def _quantize(value):
        value = int(round(float(value) / float(step)) * step)
        return max(step, value)

    return _quantize(size[0] * multiplier), _quantize(size[1] * multiplier)


def _scene_batch_set_task_resolution_args(
    args_i,
    api_params,
    overwrite_width,
    overwrite_height,
    scene_aspect_ratio,
    resolution_multiplier,
    resolution_quantize_step,
    resolution_preprocess=None,
):
    if not isinstance(args_i, list):
        return None
    task_size = _scene_batch_resolve_task_size(
        overwrite_width,
        overwrite_height,
        scene_aspect_ratio,
        resolution_multiplier,
        resolution_quantize_step,
        resolution_preprocess,
    )
    names = getattr(api_params, "all_args", [])
    if task_size:
        try:
            overwrite_width_index = names.index("overwrite_width")
            overwrite_height_index = names.index("overwrite_height")
            args_i[overwrite_width_index] = task_size[0]
            args_i[overwrite_height_index] = task_size[1]
        except Exception:
            pass
    try:
        aspect_ratios_index = names.index("aspect_ratios_selection")
        args_i[aspect_ratios_index] = scene_aspect_ratio
    except Exception:
        pass
    return task_size


_SCENE_BATCH_TARGET_SLOTS = tuple(INPUT_BY_SLOT)
_SCENE_BATCH_UPLOAD_SLOTS = tuple(f"scene_input_image{index}" for index in range(1, 9))


def _scene_batch_lang_is_cn(state_params):
    lang = state_params.get("__lang") if isinstance(state_params, dict) else state_params
    lang = str(lang or "").strip().lower()
    return lang.startswith("cn") or lang.startswith("zh") or lang in {"中文", "chinese"}


def _batch_text(state_params, en, cn):
    return cn if _scene_batch_lang_is_cn(state_params) else en


def _scene_batch_disvisible(state_params):
    scenes = state_params.get("scene_frontend", {}) if isinstance(state_params, dict) else {}
    disvisible = scenes.get("disvisible", []) if isinstance(scenes, dict) else []
    if isinstance(disvisible, str):
        disvisible = [item.strip() for item in disvisible.split(",") if item.strip()]
    if not isinstance(disvisible, list):
        disvisible = []
    enabled = scenes.get("divisible", []) if isinstance(scenes, dict) else []
    enabled = set(str(item) for item in enabled) if isinstance(enabled, list) else set()
    disvisible = [str(item) for item in disvisible]
    themes = scenes.get("theme", []) if isinstance(scenes, dict) else []
    theme = None
    if isinstance(state_params, dict):
        theme = state_params.get("scene_theme") or state_params.get("__scene_theme")
    if not theme:
        if isinstance(themes, list) and themes:
            theme = themes[0]
        elif isinstance(themes, str):
            theme = themes
    theme_hidden = scenes.get("theme_disvisible", {}) if isinstance(scenes, dict) else {}
    if isinstance(theme_hidden, dict):
        extra_hidden = theme_hidden.get(theme, [])
        if isinstance(extra_hidden, list):
            disvisible.extend(str(item) for item in extra_hidden)
    for slot in (item["slot"] for item in INPUTS if item.get("optional")):
        if slot not in disvisible and slot not in enabled:
            disvisible.append(slot)
    return set(str(item) for item in disvisible)


def _scene_batch_visible_slots(state_params):
    disvisible = _scene_batch_disvisible(state_params)
    return [slot for slot in _SCENE_BATCH_TARGET_SLOTS if slot not in disvisible]


def _scene_batch_slot_fixed_index(slot):
    if slot == "scene_canvas_image":
        return 1
    match = re.search(r"scene_input_image(\d+)$", str(slot))
    if match:
        return int(match.group(1)) + 1
    return 1


def _scene_batch_slot_label(slot, index=None, state_params=None):
    definition = INPUT_BY_SLOT.get(slot)
    if definition:
        return definition["cn" if _scene_batch_lang_is_cn(state_params) else "en"]
    slot_index = _scene_batch_slot_fixed_index(slot)
    if slot == "scene_canvas_image":
        return f"主体图片({slot_index})" if _scene_batch_lang_is_cn(state_params) else f"Upload and canvas({slot_index})"
    return f"参考图片({slot_index})" if _scene_batch_lang_is_cn(state_params) else f"Upload prompt image({slot_index})"


def _scene_batch_target_choices(state_params):
    visible_slots = _scene_batch_visible_slots(state_params)
    return [(_scene_batch_slot_label(slot, state_params=state_params), slot) for slot in visible_slots]


def scene_batch_all_choices():
    return [(item["en"], item["slot"]) for item in INPUTS]


def scene_batch_schema_html():
    payload = [{**item, "extensions": MEDIA_EXTENSIONS[item["kind"]],
                "upload_en": MEDIA_UPLOAD_LABELS[item["kind"]][0],
                "upload_cn": MEDIA_UPLOAD_LABELS[item["kind"]][1]} for item in INPUTS]
    return '<span data-scene-batch-inputs="' + escape(json.dumps(payload), quote=True) + '"></span>'


def refresh_scene_batch_upload(state_params, target):
    definition = INPUT_BY_SLOT.get(normalize_scene_batch_target_slot(target, state_params))
    kind = definition["kind"] if definition else "image"
    return gr_update(label=_batch_text(state_params, *MEDIA_UPLOAD_LABELS[kind]),
                     file_types=list(MEDIA_EXTENSIONS[kind]), value=None)


def normalize_scene_batch_target_slot(target, state_params=None):
    raw = str(target or "").replace("\u3000", " ").strip()
    visible_slots = _scene_batch_visible_slots(state_params)
    if raw in _SCENE_BATCH_TARGET_SLOTS:
        slot = raw
    else:
        choices = _scene_batch_target_choices(state_params)
        slot = None
        for label, choice_slot in choices:
            if raw == str(label).strip():
                slot = choice_slot
                break
        if slot is None:
            lowered = raw.lower()
            if "scene_canvas" in lowered or "upload and canvas" in lowered or "主体图片" in raw or "canvas" in lowered:
                slot = "scene_canvas_image"
            else:
                for candidate in reversed(_SCENE_BATCH_UPLOAD_SLOTS):
                    if candidate in lowered:
                        slot = candidate
                        break
            if slot is None and ("upload prompt image" in lowered or "prompt image" in lowered or "参考图片" in raw):
                match = re.search(r"\((\d+)\)", raw)
                number = int(match.group(1)) if match else 2
                slot_index = max(1, min(len(_SCENE_BATCH_UPLOAD_SLOTS), number - 1))
                slot = _SCENE_BATCH_UPLOAD_SLOTS[slot_index - 1]
    if not visible_slots:
        return None
    if slot not in visible_slots:
        slot = "scene_canvas_image" if "scene_canvas_image" in visible_slots else visible_slots[0]
    return slot or "scene_input_image1"


def _scene_batch_source_value(target, scene_canvas_image, scene_input_image1, scene_input_image2, scene_input_image3=None, scene_input_image4=None, scene_input_image5=None, scene_input_image6=None, scene_input_image7=None, scene_input_image8=None):
    if target == "scene_canvas_image":
        return scene_canvas_image
    image_values = {
        f"scene_input_image{index}": value
        for index, value in enumerate(
            (scene_input_image1, scene_input_image2, scene_input_image3, scene_input_image4, scene_input_image5, scene_input_image6, scene_input_image7, scene_input_image8),
            start=1,
        )
    }
    return image_values.get(target, scene_input_image1)


def create_batch(batch_id=None):
    if batch_id is None:
        batch_id = str(uuid.uuid4())
    evt = BATCH_EVENTS.get(batch_id)
    if evt is None:
        evt = threading.Event()
        evt.simpleai_batch_id = batch_id
        BATCH_EVENTS[batch_id] = evt
    return batch_id, evt


def clear_batch(batch_id):
    if not batch_id:
        return
    if batch_id in BATCH_EVENTS:
        try:
            del BATCH_EVENTS[batch_id]
        except Exception:
            pass


def stop_batch(batch_id, state_params=None, worker=None):
    evt = BATCH_EVENTS.get(batch_id)
    if evt is not None:
        evt.set()
    if worker is not None and evt is not None:
        try:
            worker.request_batch_cancel(evt)
        except Exception:
            pass
    return _batch_text(state_params, "Stopping...", "正在停止...") if batch_id else ""


def fill_backend_meta(args_norm, state):
    try:
        if not isinstance(args_norm, list):
            return args_norm
        import simpleai_base.api_params as api_params
        try:
            params_backend_index = api_params.all_args.index("params_backend")
        except Exception:
            params_backend_index = 67
        if len(args_norm) <= params_backend_index:
            return args_norm

        backend = args_norm[params_backend_index]
        if not isinstance(backend, list):
            return args_norm

        backend_args = getattr(api_params, "backend_args", [])
        if not isinstance(backend_args, list) or len(backend_args) == 0:
            return args_norm
        backend_idx = {name: i for i, name in enumerate(backend_args)}

        user = state.get("user") if isinstance(state, dict) else None
        preset = state.get("__preset") if isinstance(state, dict) else None
        engine_type = state.get("engine_type") if isinstance(state, dict) else None
        if engine_type is None and isinstance(state, dict):
            engine_type = state.get("default_engine", {}).get("engine_type")
        nickname = user.get_nickname() if user is not None else ""
        user_did = user.get_did() if user is not None else ""

        if preset is not None and "preset" in backend_idx:
            backend[backend_idx["preset"]] = preset
        if "nickname" in backend_idx:
            backend[backend_idx["nickname"]] = nickname if nickname is not None else ""
        if "user_did" in backend_idx:
            backend[backend_idx["user_did"]] = user_did if user_did is not None else ""
        if engine_type is not None and "engine_type" in backend_idx:
            backend[backend_idx["engine_type"]] = engine_type
    except Exception:
        return args_norm
    return args_norm

def resolve_batch_seed(seed_random, seed_value, constants):
    if seed_random:
        return random.randint(constants.MIN_SEED, constants.MAX_SEED)
    try:
        seed_value = int(seed_value)
        if constants.MIN_SEED <= seed_value <= constants.MAX_SEED:
            return seed_value
    except Exception:
        pass
    return random.randint(constants.MIN_SEED, constants.MAX_SEED)

def refresh_scene_batch_target(state_params, current_value):
    choices = _scene_batch_target_choices(state_params)
    choice_slots = [slot for _, slot in choices]
    current_slot = normalize_scene_batch_target_slot(current_value, state_params)
    if current_slot in choice_slots:
        value = current_slot
    elif "scene_canvas_image" in choice_slots:
        value = "scene_canvas_image"
    else:
        value = choice_slots[0] if choice_slots else None
    # Keep all options mounted so fast preset navigation can reveal other media
    # without waiting for another Python theme event. JS owns option visibility.
    mounted_choices = [(_scene_batch_slot_label(item["slot"], state_params=state_params), item["slot"])
                       for item in INPUTS]
    return dropdown_update(choices=mounted_choices, value=value)


def refresh_scene_batch_accordion(state_params):
    # The mounted scene controller owns visibility, including fast preset navigation.
    return gr_update(open=False)


def _ensure_backend_ctrl(ctrls_values, state):
    if not isinstance(ctrls_values, list):
        return ctrls_values
    backend_index = None
    for i in range(len(ctrls_values) - 1, -1, -1):
        if isinstance(ctrls_values[i], dict):
            backend_index = i
            break
    if backend_index is None:
        return ctrls_values

    backend = ctrls_values[backend_index]
    if backend is None:
        backend = {}
    if not isinstance(backend, dict):
        backend = {}
    backend = copy.deepcopy(backend)

    user = state.get("user") if isinstance(state, dict) else None
    if user is not None:
        try:
            backend["nickname"] = user.get_nickname()
        except Exception:
            backend.setdefault("nickname", "")
        try:
            backend["user_did"] = user.get_did()
        except Exception:
            backend.setdefault("user_did", "")

    if isinstance(state, dict) and "__preset" in state:
        backend["preset"] = state.get("__preset")

    engine_type = state.get("engine_type") if isinstance(state, dict) else None
    if engine_type is None and isinstance(state, dict):
        engine_type = state.get("default_engine", {}).get("engine_type")
    if engine_type is not None:
        backend["engine_type"] = engine_type

    ctrls_values = list(ctrls_values)
    ctrls_values[backend_index] = backend
    return ctrls_values


def batch_run_uov(folder_path, upload_files, seed_random, *args, get_task_with_resolution_multiplier, generate_clicked, worker, constants, html, get_welcome_image):
    if len(args) < 4:
        return
    state = args[-1]
    is_mobile = state.get("__is_mobile", False) if isinstance(state, dict) else False
    resolution_quantize_step = args[-2]
    resolution_multiplier = args[-3]
    ctrls_values = list(args[:-3])
    ctrls_values = _ensure_backend_ctrl(ctrls_values, state)

    files = get_files(folder_path, upload_files)
    if len(files) == 0:
        message = _batch_text(state, "Batch: folder is empty or invalid.", "批处理：文件夹为空或无效。")
        yield gr_update(visible=True, value=html.make_progress_html(1, message)), \
            gr_update(visible=True, value=get_welcome_image(is_mobile=is_mobile, is_change=True, state_params=state)), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=True), False, message, ""
        return

    batch_id, evt = create_batch()
    try:
        progress_message = _batch_text(state, f"Batch: 0/{len(files)}", f"批处理：0/{len(files)}")
        started_message = _batch_text(state, f"Batch started: {len(files)} files", f"批处理已开始：{len(files)} 个文件")
        yield gr_update(visible=True, value=html.make_progress_html(1, progress_message)), \
            gr_update(), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=False), True, started_message, batch_id

        base_task = get_task_with_resolution_multiplier(*ctrls_values, resolution_multiplier, resolution_quantize_step)
        base_args = base_task.args.copy()
        base_args[19] = None
        base_args = copy.deepcopy(base_args)
        base_args = fill_backend_meta(base_args, state)
        base_seed = base_args[8] if len(base_args) > 8 else 0

        stopped = False
        completed = 0

        for i, path in enumerate(files):
            if evt.is_set():
                stopped = True
                break
            try:
                img = load_rgba(path)
            except Exception as e:
                filename = os.path.basename(path)
                detail_message = _batch_text(state, f"Batch: failed to load {filename} ({e})", f"批处理：无法读取 {filename}（{e}）")
                status_message = _batch_text(state, f"Batch: failed to load {filename}", f"批处理：无法读取 {filename}")
                yield gr_update(visible=True, value=html.make_progress_html(1, detail_message)), \
                    gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), gr_update(), gr_update(), \
                    gr_update(interactive=False), True, status_message, batch_id
                continue

            args_i = copy.deepcopy(base_args)
            try:
                args_i[8] = resolve_batch_seed(seed_random, base_seed, constants)
            except Exception:
                pass
            args_i[19] = img
            task = worker.AsyncTask(args=args_i)
            task.simpleai_batch_cancel_event = evt

            status = _batch_text(
                state,
                f"Batch UOV: {i + 1}/{len(files)} - {os.path.basename(path)}",
                f"UOV 批处理：{i + 1}/{len(files)} - {os.path.basename(path)}",
            )
            for out in generate_clicked(task, state):
                yield (*out, gr_update(interactive=False), True, status, batch_id)
            completed = i + 1
            if evt.is_set():
                stopped = True
                break

        if stopped:
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, _batch_text(state, f"Batch stopped: {completed}/{len(files)} files", f"批处理已停止：{completed}/{len(files)} 个文件"), batch_id
        else:
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, _batch_text(state, "Batch finished.", "批处理已完成。"), batch_id
    finally:
        evt.simpleai_batch_closed = True
        worker.release_batch(evt)


def batch_run_enhance(folder_path, upload_files, seed_random, *args, get_task_with_resolution_multiplier, generate_clicked, worker, constants, html, get_welcome_image):
    if len(args) < 4:
        return
    state = args[-1]
    is_mobile = state.get("__is_mobile", False) if isinstance(state, dict) else False
    resolution_quantize_step = args[-2]
    resolution_multiplier = args[-3]
    ctrls_values = list(args[:-3])
    ctrls_values = _ensure_backend_ctrl(ctrls_values, state)

    files = get_files(folder_path, upload_files)
    if len(files) == 0:
        message = _batch_text(state, "Batch: folder is empty or invalid.", "批处理：文件夹为空或无效。")
        yield gr_update(visible=True, value=html.make_progress_html(1, message)), \
            gr_update(visible=True, value=get_welcome_image(is_mobile=is_mobile, is_change=True, state_params=state)), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=True), False, message, ""
        return

    batch_id, evt = create_batch()
    try:
        progress_message = _batch_text(state, f"Batch: 0/{len(files)}", f"批处理：0/{len(files)}")
        started_message = _batch_text(state, f"Batch started: {len(files)} files", f"批处理已开始：{len(files)} 个文件")
        yield gr_update(visible=True, value=html.make_progress_html(1, progress_message)), \
            gr_update(), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=False), True, started_message, batch_id

        base_task = get_task_with_resolution_multiplier(*ctrls_values, resolution_multiplier, resolution_quantize_step)
        base_args = base_task.args.copy()
        base_args[75] = None
        base_args = copy.deepcopy(base_args)
        base_args = fill_backend_meta(base_args, state)
        base_seed = base_args[8] if len(base_args) > 8 else 0

        stopped = False
        completed = 0

        for i, path in enumerate(files):
            if evt.is_set():
                stopped = True
                break
            try:
                img = load_rgba(path)
            except Exception as e:
                filename = os.path.basename(path)
                detail_message = _batch_text(state, f"Batch: failed to load {filename} ({e})", f"批处理：无法读取 {filename}（{e}）")
                status_message = _batch_text(state, f"Batch: failed to load {filename}", f"批处理：无法读取 {filename}")
                yield gr_update(visible=True, value=html.make_progress_html(1, detail_message)), \
                    gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), gr_update(), gr_update(), \
                    gr_update(interactive=False), True, status_message, batch_id
                continue

            args_i = copy.deepcopy(base_args)
            try:
                args_i[8] = resolve_batch_seed(seed_random, base_seed, constants)
            except Exception:
                pass
            args_i[75] = img
            task = worker.AsyncTask(args=args_i)
            task.simpleai_batch_cancel_event = evt

            status = _batch_text(
                state,
                f"Batch Enhance: {i + 1}/{len(files)} - {os.path.basename(path)}",
                f"增强批处理：{i + 1}/{len(files)} - {os.path.basename(path)}",
            )
            for out in generate_clicked(task, state):
                yield (*out, gr_update(interactive=False), True, status, batch_id)
            completed = i + 1
            if evt.is_set():
                stopped = True
                break

        if stopped:
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, _batch_text(state, f"Batch stopped: {completed}/{len(files)} files", f"批处理已停止：{completed}/{len(files)} 个文件"), batch_id
        else:
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, _batch_text(state, "Batch finished.", "批处理已完成。"), batch_id
    finally:
        evt.simpleai_batch_closed = True
        worker.release_batch(evt)


def _scene_batch_report(state, records, total, stopped=False):
    successes = sum(row[1] == "success" for row in records)
    failures = sum(row[1] == "failed" for row in records)
    heading = _batch_text(state, "Batch stopped:" if stopped else "Batch finished:",
                          "批处理已停止：" if stopped else "批处理结束：")
    summary = _batch_text(state, f"{successes}/{total} succeeded, {failures}/{total} failed, {total - len(records)} pending.",
                          f"成功 {successes}/{total}，失败 {failures}/{total}，未处理 {total - len(records)}。")
    labels = {"success": _batch_text(state, "Succeeded", "成功"),
              "failed": _batch_text(state, "Failed", "失败"),
              "skipped": _batch_text(state, "Skipped", "已跳过"),
              "stopped": _batch_text(state, "Stopped", "已停止")}
    interrupted = sum(row[1] in ("skipped", "stopped") for row in records)
    if interrupted:
        summary += _batch_text(state, f" {interrupted} skipped/stopped.", f" 跳过或停止 {interrupted} 项。")
    lines = [f"{heading} {summary}"]
    lines.extend(f"{name} — {labels[status]}" + (f"：{detail}" if detail else "")
                 for name, status, detail in records)
    return "\n".join(lines)


def batch_run_scene(folder_path, upload_files, target, seed_random, image_seed, backend_params, scene_theme, scene_canvas_image, scene_input_image1, scene_input_image2, scene_input_image3, scene_input_image4, scene_additional_prompt, scene_additional_prompt_2,
                    scene_var_number, scene_var_number2, scene_var_number3, scene_var_number4, scene_var_number5, scene_var_number6,
                    scene_var_number7, scene_var_number8, scene_var_number9, scene_var_number10, scene_steps,
                    scene_switch_option1, scene_switch_option2, scene_switch_option3, scene_switch_option4, scene_aspect_ratio,
                    scene_image_number, scene_video, scene_audio, scene_original_video_path, active_video_source,
                    sam3_input_video, sam3_original_video_path, sam3_mask_video, overwrite_step=None, overwrite_width=None, overwrite_height=None,
                    resolution_edit_mode=None, resolution_original_input=False, scene_video_duration=None,
                    scene_input_image5=None, scene_input_image6=None, scene_input_image7=None, scene_input_image8=None,
                    scene_reference_video=None, scene_reference_video_original_path=None, scene_reference_video_trim_payload=None,
                    scene_reference_video2=None, scene_reference_video2_original_path=None, scene_reference_video2_trim_payload=None,
                    scene_audio2=None, scene_audio3=None, scene_video_trim_payload=None,
                    *args, get_task_with_resolution_multiplier,
                    generate_clicked, worker, constants, html, get_welcome_image, api_params, topbar):
    if len(args) < 3:
        return

    state = args[-1]
    is_mobile = state.get("__is_mobile", False) if isinstance(state, dict) else False
    resolution_quantize_step = args[-2]
    resolution_multiplier = args[-3]
    ctrls_values = list(args[:-3])
    ctrls_values = _ensure_backend_ctrl(ctrls_values, state)
    current_model_params_state = (
        ctrls_values[-1]
        if ctrls_values and isinstance(ctrls_values[-1], dict) and ctrls_values[-1].get("__model_params_state")
        else None
    )
    target_slot = normalize_scene_batch_target_slot(target, state)
    if (target_slot is None or "scene_batch" in _scene_batch_disvisible(state)
            or (target in INPUT_BY_SLOT and target != target_slot)):
        message = _batch_text(state, "This batch target is unavailable for the current preset/theme.",
                             "当前预置或主题不支持这个批量覆盖位置。")
        yield gr_update(visible=True, value=html.make_progress_html(1, message)), \
            gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), gr_update(), gr_update(), \
            gr_update(interactive=True), False, message, ""
        return
    media_type = INPUT_BY_SLOT[target_slot]["kind"]
    current_source_size = _image_size_from_value(_scene_batch_source_value(target_slot, scene_canvas_image, scene_input_image1, scene_input_image2, scene_input_image3, scene_input_image4, scene_input_image5, scene_input_image6, scene_input_image7, scene_input_image8))
    current_target_size = _positive_size_pair(overwrite_width, overwrite_height)
    try:
        from enhanced import resolution_preprocess

        resolution_profile = resolution_preprocess.get_resolution_profile(state, scene_theme)
        projected_base = resolution_preprocess.resolve_projected_profile_base(
            resolution_profile,
            selected_value=scene_aspect_ratio,
            current_source_size=current_source_size,
            current_target_size=current_target_size,
            resolution_quantize_step=resolution_quantize_step,
        )
    except Exception:
        resolution_preprocess = None
        resolution_profile = {}
        projected_base = None
    selected_original_resolution = _scene_batch_selected_original_resolution(scene_aspect_ratio, projected_base)
    custom_area = None
    if resolution_preprocess is not None and not selected_original_resolution and projected_base is None and current_target_size:
        custom_area = current_target_size[0] * current_target_size[1]

    files = get_files(folder_path, upload_files, media_type)
    if len(files) == 0:
        message = _batch_text(state, "Batch: no matching media files in the upload or folder.", "批处理：上传列表或文件夹中没有匹配类型的素材。")
        yield gr_update(visible=True, value=html.make_progress_html(1, message)), \
            gr_update(visible=True, value=get_welcome_image(is_mobile=is_mobile, is_change=True, state_params=state)), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=True), False, message, ""
        return

    batch_id, evt = create_batch()
    try:
        progress_message = _batch_text(state, f"Batch: 0/{len(files)}", f"批处理：0/{len(files)}")
        started_message = _batch_text(state, f"Batch started: {len(files)} files", f"批处理已开始：{len(files)} 个文件")
        yield gr_update(visible=True, value=html.make_progress_html(1, progress_message)), \
            gr_update(), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), False, gr_update(visible=False), gr_update(visible=False, size="sm"), gr_update(), gr_update(), \
            gr_update(interactive=False), True, started_message, batch_id

        base_task = get_task_with_resolution_multiplier(*ctrls_values, resolution_multiplier, resolution_quantize_step)
        base_args = copy.deepcopy(base_task.args)
        base_seed = base_args[8] if len(base_args) > 8 else image_seed

        stopped = False
        records = []
        original_media = dict(
            scene_video=scene_video, scene_original_video_path=scene_original_video_path,
            active_video_source=active_video_source, scene_video_trim_payload=scene_video_trim_payload,
            scene_reference_video=scene_reference_video,
            scene_reference_video_original_path=scene_reference_video_original_path,
            scene_reference_video_trim_payload=scene_reference_video_trim_payload,
            scene_reference_video2=scene_reference_video2,
            scene_reference_video2_original_path=scene_reference_video2_original_path,
            scene_reference_video2_trim_payload=scene_reference_video2_trim_payload,
            scene_audio=scene_audio, scene_audio2=scene_audio2, scene_audio3=scene_audio3,
        )

        def _build_canvas_value(img_rgba):
            h, w = img_rgba.shape[0], img_rgba.shape[1]
            mask = np.zeros((h, w, 4), dtype=np.uint8)
            return {"image": img_rgba, "mask": mask}

        for i, path in enumerate(files):
            if evt.is_set():
                stopped = True
                break
            try:
                media_value, media_size = load_scene_batch_media(path, media_type)
            except Exception as e:
                filename = os.path.basename(path)
                records.append((filename, "failed", str(e)))
                detail_message = _batch_text(state, f"Batch: failed to load {filename} ({e})", f"批处理：无法读取 {filename}（{e}）")
                status_message = _batch_text(state, f"Batch: failed to load {filename}", f"批处理：无法读取 {filename}")
                yield gr_update(visible=True, value=html.make_progress_html(1, detail_message)), \
                    gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), gr_update(), gr_update(), \
                    gr_update(interactive=False), True, status_message, batch_id
                continue

            media_values = (replace_media_input(original_media, target_slot, media_value)
                            if media_type != "image" else dict(original_media))
            scene_canvas_image_v = copy.deepcopy(scene_canvas_image) if isinstance(scene_canvas_image, dict) else scene_canvas_image
            scene_input_image1_v = scene_input_image1
            scene_input_image2_v = scene_input_image2
            scene_input_image3_v = scene_input_image3
            scene_input_image4_v = scene_input_image4
            scene_input_image5_v = scene_input_image5
            scene_input_image6_v = scene_input_image6
            scene_input_image7_v = scene_input_image7
            scene_input_image8_v = scene_input_image8
            if target_slot == "scene_canvas_image":
                scene_canvas_image_v = _build_canvas_value(media_value)
            elif media_type == "image":
                image_values = [
                    scene_input_image1_v,
                    scene_input_image2_v,
                    scene_input_image3_v,
                    scene_input_image4_v,
                    scene_input_image5_v,
                    scene_input_image6_v,
                    scene_input_image7_v,
                    scene_input_image8_v,
                ]
                target_index = max(0, min(7, _scene_batch_slot_fixed_index(target_slot) - 2))
                image_values[target_index] = media_value
                (
                    scene_input_image1_v,
                    scene_input_image2_v,
                    scene_input_image3_v,
                    scene_input_image4_v,
                    scene_input_image5_v,
                    scene_input_image6_v,
                    scene_input_image7_v,
                    scene_input_image8_v,
                ) = image_values

            overwrite_width_v = overwrite_width
            overwrite_height_v = overwrite_height
            scene_aspect_ratio_v = scene_aspect_ratio
            resolution_original_input_v = _scene_batch_effective_original_input(
                resolution_original_input,
                selected_original_resolution,
            )
            batch_target_size = _scene_batch_target_size_for_batch_image(
                media_size if media_type == "image" or target_slot == "scene_video" else None,
                resolution_preprocess,
                resolution_profile,
                projected_base,
                custom_area,
                resolution_quantize_step,
                selected_original_resolution,
            )
            if batch_target_size:
                overwrite_width_v, overwrite_height_v = batch_target_size
                scene_aspect_ratio_v = f"{batch_target_size[0]}×{batch_target_size[1]}"

            batch_seed = resolve_batch_seed(seed_random, base_seed, constants)
            bp = {} if backend_params is None else copy.deepcopy(backend_params)
            try:
                topbar.process_before_generation(
                    state, False, batch_seed,
                    bp, scene_theme, scene_canvas_image_v, scene_input_image1_v, scene_input_image2_v, scene_input_image3_v, scene_input_image4_v,
                    scene_additional_prompt, scene_additional_prompt_2,
                    scene_var_number, scene_var_number2, scene_var_number3, scene_var_number4, scene_var_number5,
                    scene_var_number6, scene_var_number7, scene_var_number8, scene_var_number9, scene_var_number10,
                    scene_steps, scene_switch_option1, scene_switch_option2, scene_switch_option3, scene_switch_option4,
                    scene_aspect_ratio_v, scene_image_number,
                    media_values["scene_video"], media_values["scene_audio"],
                    media_values["scene_original_video_path"], media_values["active_video_source"],
                    sam3_input_video, sam3_original_video_path, sam3_mask_video,
                    overwrite_width_v, overwrite_height_v, resolution_multiplier, resolution_quantize_step,
                    resolution_edit_mode, resolution_original_input_v,
                    overwrite_step=overwrite_step,
                    scene_video_duration=scene_video_duration,
                    scene_reference_video=media_values["scene_reference_video"],
                    scene_reference_video_original_path=media_values["scene_reference_video_original_path"],
                    scene_video_trim_payload=media_values["scene_video_trim_payload"],
                    scene_reference_video_trim_payload=media_values["scene_reference_video_trim_payload"],
                    scene_input_image5=scene_input_image5_v,
                    scene_input_image6=scene_input_image6_v,
                    scene_input_image7=scene_input_image7_v,
                    scene_input_image8=scene_input_image8_v,
                    scene_reference_video2=media_values["scene_reference_video2"],
                    scene_reference_video2_original_path=media_values["scene_reference_video2_original_path"],
                    scene_reference_video2_trim_payload=media_values["scene_reference_video2_trim_payload"],
                    scene_audio2=media_values["scene_audio2"],
                    scene_audio3=media_values["scene_audio3"],
                    current_model_params_state=current_model_params_state,
                )
            except Exception as e:
                last_preparation_error = f"{os.path.basename(path)}: {e}"
                records.append((os.path.basename(path), "failed", str(e)))
                detail_message = _batch_text(
                    state,
                    f"Batch Scene: preparation failed for {last_preparation_error}",
                    f"场景批处理：准备失败，{last_preparation_error}",
                )
                yield gr_update(visible=True, value=html.make_progress_html(1, detail_message)), \
                    gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), gr_update(), gr_update(), \
                    gr_update(interactive=False), True, detail_message, batch_id
                if evt.is_set():
                    stopped = True
                    break
                continue

            from modules.regen_manifest import ensure_api_params_backend_arg
            ensure_api_params_backend_arg(api_params)
            backend_norm = api_params.normalization_backend(bp)

            args_i = copy.deepcopy(base_args)
            _scene_batch_set_task_resolution_args(
                args_i,
                api_params,
                overwrite_width_v,
                overwrite_height_v,
                scene_aspect_ratio_v,
                resolution_multiplier,
                resolution_quantize_step,
                resolution_preprocess,
            )
            try:
                params_backend_index = api_params.all_args.index("params_backend")
            except Exception:
                params_backend_index = 67
            args_i[params_backend_index] = backend_norm
            args_i = fill_backend_meta(args_i, state)
            try:
                args_i[8] = batch_seed
            except Exception:
                pass

            task = worker.AsyncTask(args=args_i)
            task.simpleai_batch_cancel_event = evt
            status = _batch_text(
                state,
                f"Batch Scene: {i + 1}/{len(files)} - {os.path.basename(path)}",
                f"场景批处理：{i + 1}/{len(files)} - {os.path.basename(path)}",
            )
            for out in generate_clicked(task, state):
                yield (*out, gr_update(interactive=False), True, status, batch_id)
            has_output = getattr(task, "simpleai_generation_had_output", bool(getattr(task, "results", [])))
            error = str(getattr(task, "backend_error", "") or getattr(task, "cloud_error", "")
                        or getattr(task, "simpleai_native_error", "") or "")
            cancel_action = getattr(task, "user_cancel_action", None) or getattr(task, "last_stop", None)
            if cancel_action in ("stop", "skip"):
                records.append((os.path.basename(path), "skipped" if cancel_action == "skip" else "stopped", ""))
            elif has_output and not error:
                outputs = []
                for result in getattr(task, "results", []):
                    result = result[0] if isinstance(result, (list, tuple)) and result else result
                    if isinstance(result, str):
                        outputs.append(os.path.basename(result))
                records.append((os.path.basename(path), "success", ", ".join(outputs)))
            elif evt.is_set():
                records.append((os.path.basename(path), "stopped", ""))
            else:
                records.append((os.path.basename(path), "failed", error or _batch_text(
                    state, "Generation produced no output.", "生成没有返回结果。")))
            if evt.is_set():
                stopped = True
                break

        if stopped:
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, _scene_batch_report(state, records, len(files), stopped=True), batch_id
        else:
            finished_message = _scene_batch_report(state, records, len(files))
            yield gr_update(visible=False), \
                gr_update(), gr_update(), gr_update(), gr_update(), False, gr_update(), gr_update(), \
                gr_update(visible=False, interactive=False), gr_update(visible=False, interactive=False), \
                gr_update(visible=True, interactive=True), False, finished_message, batch_id
    finally:
        evt.simpleai_batch_closed = True
        worker.release_batch(evt)
