import os
import json
import copy
import re
import math
import time
from html import escape
from urllib.parse import unquote, urlparse
import gradio as gr
import modules.config as config
import modules.util as util
import modules.regen_manifest as regen_manifest
import modules.sdxl_styles as sdxl_styles
import enhanced.all_parameters as ads
import enhanced.topbar as topbar
import enhanced.gallery as gallery
import enhanced.version as version
import modules.flags as flags
import modules.meta_parser as meta_parser
import logging
from enhanced.logger import format_name
from ui.update_helpers import dataset_update, dropdown_update, gr_update, skip_update
logger = logging.getLogger(format_name(__name__))

from enhanced.simpleai import sync_model_info, get_path_in_user_dir
from modules.model_loader import load_file_from_url
from shared import sysinfo


# app context
toolbox_note_preset_title='Save a new preset for the current params and configuration.'
toolbox_note_regenerate_title='Extract parameters to backfill for regeneration. Please note that some parameters will be modified!'
toolbox_note_embed_title='Embed parameters into images for easy identification of image sources and communication and learning.'
toolbox_note_missing_muid='The model in the params and configuration is missing MUID. And the system will spend some time calculating the hash of model files and synchronizing information to obtain the muid for usability and transferability.'

def make_infobox_markdown(info, theme):
    bgcolor = '#ddd'
    if theme == "dark":
        bgcolor = '#444'
    hidden_keys = {
        'Filename',
        'Advanced_parameters',
        'Fooocus V2 Expansion',
        'Metadata Scheme',
        'Version',
        'Upscale (Fast)',
        regen_manifest.KEY,
        regen_manifest.LABEL,
        'SimpleAI Regen Manifest',
    }

    def normalize_value(value):
        if isinstance(value, (list, tuple)):
            values = [normalize_value(item) for item in value]
            return values[0] if len(values) == 1 else '\n'.join(str(item) for item in values)
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False)
        return value

    def render_value(value):
        value = normalize_value(value)
        value = escape(str(value), quote=False)
        return value.replace('\r\n', '\n').replace('\r', '\n').replace('\n', '<br/>')

    # 为 div 添加 padding，特别是右侧留出空间给关闭按钮 (×)
    html = f'<div style="background: {bgcolor}; padding: 10px 35px 10px 15px; border-radius: 8px;">'
    if info:
        for key in info:
            value = normalize_value(info[key])
            if key in hidden_keys or value in [None, '', 'None']:
                continue
            html += f'<b>{escape(str(key))}:</b> {render_value(value)}<br/>'
    else:
        html += '<p>info</p>'
    html += '</div>'
    return html


def toggle_toolbox(state, state_params):
    visible = bool(state or gallery.get_gallery_engine_type(state_params) == "video" or "scene_frontend" in state_params)
    if state_params.get("gallery_preview_open") and visible:
        return [gr_update(visible=visible)]
    else:
        return [gr_update(visible=False)] 


def toggle_prompt_info(state_params):
    prev_state = state_params.get("infobox_state", False)
    prompt_info_data_before = state_params.get("prompt_info")
    util.log_ui_trace(
        logger,
        "[UI-TRACE] toolbox.toggle_prompt_info.enter | prev=%r, prompt_info=%r, gallery_state=%r, output_count=%s",
        prev_state,
        prompt_info_data_before,
        state_params.get("gallery_state"),
        len(state_params.get("__output_list", []) or []),
    )
    infobox_state = True
    state_params.update({"infobox_state": infobox_state})

    prompt_info_data = state_params.get("prompt_info")
    if not prompt_info_data or not isinstance(prompt_info_data, list) or len(prompt_info_data) < 2:
        output_list = state_params.get("__output_list", [])
        if output_list:
            prompt_info_data = [output_list[0], 0]
            state_params.update({"prompt_info": prompt_info_data})
        else:
            prompt_info_data = [None, 0]

    [choice, selected] = prompt_info_data
    prompt_info = gallery.get_selected_gallery_media_metadata(state_params)
    if prompt_info is None:
        prompt_info = gallery.get_main_gallery_browser_selected_metadata(state_params, selected)
    if prompt_info is None:
        prompt_info = gallery.get_images_prompt(choice, selected, state_params["__max_per_page"], user_did=state_params["user"].get_did(), media_type=gallery.get_gallery_engine_type(state_params))
    info_len = len(str(prompt_info)) if prompt_info is not None else 0
    markdown = make_infobox_markdown(prompt_info, state_params['__theme'])
    util.log_ui_trace(
        logger,
        "[UI-TRACE] toolbox.toggle_prompt_info.exit | next=%r, choice=%r, selected=%r, info_len=%s, markdown_len=%s",
        infobox_state,
        choice,
        selected,
        info_len,
        len(markdown),
    )
    return (
        gr_update(value=markdown, visible=infobox_state),
        gr_update(visible=infobox_state),
        gr_update(visible=infobox_state),
        state_params
    )

def close_prompt_info(state_params):
    util.log_ui_trace(
        logger,
        "[UI-TRACE] toolbox.close_prompt_info | prev=%r, prompt_info=%r",
        state_params.get("infobox_state"),
        state_params.get("prompt_info"),
    )
    state_params.update({"infobox_state": False})
    return (
        gr_update(visible=False),
        gr_update(visible=False),
        gr_update(visible=False),
        state_params
    )


def check_preset_models(checklist, state_params):
    note_box_state = state_params["note_box_state"]
    note_box_state[2] = 0
    #for i in range(len(checklist)):
    #    if checklist[i] and checklist[i] != 'None':
    #        k1 = "checkpoints/"+checklist[i]
    #        k2 = "loras/"+checklist[i]
    #        if (i<2 and (k1 not in models_info.keys() or not models_info[k1]['muid'])) or (i>=2 and (k2 not in models_info.keys() or not models_info[k2]['muid'])):
    #            note_box_state[2] = 1
    #            break
    state_params.update({"note_box_state": note_box_state})
    return state_params


def toggle_note_box(item, state_params):
    note_box_state = state_params["note_box_state"]
    if item in ('delete', 'regen'):
        note_box_state[0] = item
        note_box_state[1] = True
    elif note_box_state[0] is None:
        note_box_state[0] = item
    if item in ('delete', 'regen'):
        pass
    elif item == note_box_state[0]:
        note_box_state[1] = not note_box_state[1]
    elif not note_box_state[1]:
        note_box_state[1] = not note_box_state[1]
        note_box_state[0] = item
    else:
        note_box_state[0] = item
        note_box_state[1] = True

    state_params.update({"note_box_state": note_box_state})
    flag = note_box_state[1]
    title_extra = ""
    if note_box_state[2]:
        title_extra = '\n' # + toolbox_note_missing_muid

    info_val = ""
    if item == 'delete':
        media_label = 'video' if gallery.get_gallery_engine_type(state_params) == 'video' else 'image'
        info_val = f'DELETE the {media_label} from output directory and logs!'
    elif item == 'regen':
        info_val = toolbox_note_regenerate_title
    elif item == 'preset':
        info_val = toolbox_note_preset_title + title_extra

    # 返回顺序: info, close_btn, input_name, delete_btn, regen_btn, preset_btn, box, state_params
    return (
        gr_update(value=info_val, visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        state_params
    )

def toggle_note_box_delete(state_params, delete_target=None):
    result = toggle_note_box('delete', state_params)
    if delete_target is None:
        return result
    return result + (delete_target,)


def toggle_note_box_regen(*args):
    args = list(args)
    state_params = args.pop()
    lora_count = len(config.default_loras)
    for i in range(lora_count):
        if len(args) > 4:
            del args[4]
            del args[4]
    checklist = args[2:]
    state_params = check_preset_models(checklist, state_params)
    return toggle_note_box('regen', state_params)

def toggle_note_box_preset(*args):
    args = list(args)
    state_params = args.pop()
    lora_count = len(config.default_loras)
    for i in range(lora_count):
        if len(args) > 4:
            del args[4]
            del args[4]
    checklist = args[2:]
    state_params = check_preset_models(checklist, state_params)
    return toggle_note_box('preset', state_params)


def toggle_note_box_preset_overlay(*args):
    args = list(args)
    state_params = args.pop()
    lora_count = len(config.default_loras)
    for i in range(lora_count):
        if len(args) > 4:
            del args[4]
            del args[4]
    checklist = args[2:]
    state_params = check_preset_models(checklist, state_params)
    note_box_state = state_params.get("note_box_state", ['', 0, 0])
    missing_muid = note_box_state[2] if len(note_box_state) > 2 else 0
    state_params.update({"note_box_state": ['preset', 1, missing_muid]})
    title_extra = '\n' if missing_muid else ''
    return (
        gr_update(value=toolbox_note_preset_title + title_extra, visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        gr_update(visible="hidden"),
        state_params
    )


def close_note_box(state_params):
    state_params.update({"note_box_state": ['', 0, 0]})
    state_params.pop("__regen_preset_restore", None)
    # 隐藏所有组件，返回顺序需与 webui.py 中的 outputs 一致
    return (
        gr_update(visible="hidden"), # info
        gr_update(visible="hidden"), # close_btn
        gr_update(visible="hidden"), # input_name
        gr_update(visible="hidden"), # delete_btn
        gr_update(visible="hidden"), # regen_btn
        gr_update(visible="hidden"), # preset_btn
        gr_update(visible="hidden"), # box
        state_params
    )


filename_regex = re.compile(r'\<div id=\"([^\"]+)\"')


def _log_item_id_for_filename(file_name):
    return os.path.basename(str(file_name or "")).replace(".", "_")


def _log_item_id_matches_filename(log_item_id, file_name):
    file_name = os.path.basename(str(file_name or ""))
    stem, _ = os.path.splitext(file_name)
    return log_item_id in {_log_item_id_for_filename(file_name), stem}


def _remove_media_from_html_log(log_path, file_name):
    if not os.path.exists(log_path):
        return False

    file_text = ''
    deleting_item = False
    removed = False
    with open(log_path, "r", encoding="utf-8") as log_file:
        line = log_file.readline()
        while line:
            match = filename_regex.search(line)
            if match:
                if _log_item_id_matches_filename(match.group(1), file_name):
                    deleting_item = True
                    removed = True
                    line = log_file.readline()
                    continue
                if deleting_item:
                    deleting_item = False
            if deleting_item:
                if "</div>" in line:
                    deleting_item = False
                line = log_file.readline()
                continue
            file_text += line
            line = log_file.readline()
    if removed:
        with open(log_path, "w", encoding="utf-8") as log_file:
            log_file.write(file_text)
    return removed


def _remove_media_from_ads_log(log_name, file_name):
    if not os.path.exists(log_name):
        return
    log_ext = {}
    with open(log_name, "r", encoding="utf-8") as log_file:
        log_ext.update(json.load(log_file))
    log_ext.pop(file_name, None)
    if not log_ext:
        os.remove(log_name)
    else:
        with open(log_name, 'w', encoding='utf-8') as log_file:
            json.dump(log_ext, log_file)


def _folder_has_remaining_output_media(dir_path):
    if not os.path.isdir(dir_path):
        return False
    extensions = set(getattr(gallery, "image_types", []) or [])
    extensions.update(getattr(gallery, "video_types", []) or [])
    extensions.update([".wav", ".mp3", ".flac", ".ogg", ".opus", ".m4a", ".aac"])
    for root, _, files in os.walk(dir_path):
        for name in files:
            if os.path.splitext(name)[1].lower() in extensions:
                return True
    return False


def _get_media_paths_from_gallery_index(choice, max_per_page, user_did, engine_type):
    if engine_type == "video":
        return gallery.get_videos_from_gallery_index(choice, max_per_page, user_did)
    return gallery.get_images_from_gallery_index(choice, max_per_page, user_did)


def _safe_output_media_path(file_path, user_path_outputs):
    if not file_path or not user_path_outputs:
        return None
    try:
        abs_path = os.path.abspath(str(file_path))
        root_path = os.path.abspath(str(user_path_outputs))
        if os.path.normcase(os.path.commonpath([abs_path, root_path])) != os.path.normcase(root_path):
            return None
    except Exception:
        return None
    return abs_path if os.path.isfile(abs_path) else None


def _output_choice_from_media_path(file_path, user_path_outputs):
    try:
        rel_parts = os.path.relpath(file_path, user_path_outputs).split(os.sep)
    except Exception:
        rel_parts = []
    folder_name = rel_parts[0] if rel_parts else ""
    return folder_name[2:] if folder_name.startswith("20") else folder_name


def _parse_gallery_delete_target(delete_target):
    if isinstance(delete_target, dict):
        return dict(delete_target)
    if not isinstance(delete_target, str) or not delete_target.strip():
        return None
    try:
        value = json.loads(delete_target)
    except Exception:
        return None
    return value if isinstance(value, dict) else None


def _gallery_delete_media_path_from_src(media_src):
    media_src = str(media_src or "").strip()
    if not media_src:
        return None
    try:
        parsed = urlparse(media_src)
        decoded_path = unquote(parsed.path or "")
    except Exception:
        return None

    preview_route = f"{gallery.GALLERY_DISPLAY_PREVIEW_ROUTE}/"
    if preview_route in decoded_path:
        preview_name = os.path.basename(decoded_path)
        return gallery._gallery_display_preview_original_path_from_name(preview_name)

    for marker in ("/gradio_api/file=", "/file="):
        marker_index = decoded_path.find(marker)
        if marker_index < 0:
            continue
        file_path = decoded_path[marker_index + len(marker):]
        if re.match(r"^/[A-Za-z]:[\\/]", file_path):
            file_path = file_path[1:]
        return file_path.replace("/", os.sep)
    return None


def _resolve_gallery_delete_target(delete_target, state_params, user_path_outputs):
    target = _parse_gallery_delete_target(delete_target)
    if not target or target.get("version") != 1 or not target.get("valid"):
        return None, target, "invalid_snapshot"

    try:
        selected_index = gallery.normalize_gallery_selected_index(target.get("selected_index"))
    except Exception:
        selected_index = 0

    state_params = state_params if isinstance(state_params, dict) else {}
    candidates = []

    for state_path in (
        state_params.get("__selected_gallery_media_path"),
        _gallery_delete_media_path_from_src(state_params.get("__post_generation_image_url")),
    ):
        if state_path:
            candidates.append(state_path)

    candidates.extend([
        _gallery_delete_media_path_from_src(target.get("media_src")),
        target.get("media_path"),
    ])
    browser_paths = state_params.get("__main_gallery_browser_paths") if isinstance(state_params, dict) else None
    if isinstance(browser_paths, list) and selected_index < len(browser_paths):
        candidates.append(browser_paths[selected_index])

    expected_name = os.path.basename(str(target.get("file_name") or ""))
    prompt_info = state_params.get("prompt_info") or []
    choice = target.get("choice") or (prompt_info[0] if prompt_info else None)
    choice_folder = str(choice or "").split("/", 1)[0]
    if re.fullmatch(r"\d{2}-\d{2}-\d{2}", choice_folder):
        candidates.append(os.path.join(user_path_outputs, f"20{choice_folder}", expected_name))
    date_match = re.match(r"^(\d{4}-\d{2}-\d{2})", expected_name)
    if date_match:
        candidates.append(os.path.join(user_path_outputs, date_match.group(1), expected_name))

    for candidate in candidates:
        safe_path = _safe_output_media_path(candidate, user_path_outputs)
        if not safe_path:
            continue
        if expected_name and os.path.normcase(os.path.basename(safe_path)) != os.path.normcase(expected_name):
            continue
        target["selected_index"] = selected_index
        return safe_path, target, None
    return None, target, "target_not_in_outputs"


def delete_image(state_params, delete_target=None):
    util.log_ui_trace(
        logger,
        "[UI-TRACE] toolbox.delete_media.target_received | type=%s, size=%s",
        type(delete_target).__name__,
        len(delete_target) if isinstance(delete_target, str) else 0,
    )
    prompt_info = state_params.get("prompt_info") or [None, 0]
    if len(prompt_info) < 2:
        prompt_info = [None, 0]
    [choice, selected] = prompt_info
    selected = gallery.normalize_gallery_selected_index(selected)
    if choice is None and "__output_list" in state_params and len(state_params["__output_list"]) > 0:
        choice = state_params["__output_list"][0]
        prompt_info[0] = choice

    max_per_page = state_params["__max_per_page"]
    max_catalog = state_params["__max_catalog"]
    user_did = state_params["user"].get_did()
    user_path_outputs = config.get_user_path_outputs(user_did)
    engine_type = gallery.get_gallery_engine_type(state_params)
    direct_path = None
    resolved_target = None
    if delete_target is not None:
        selected_path, resolved_target, target_error = _resolve_gallery_delete_target(
            delete_target,
            state_params,
            user_path_outputs,
        )
        if selected_path is None:
            logger.error(
                "Delete media blocked: current gallery target could not be verified, reason=%s, target=%r",
                target_error,
                resolved_target,
            )
            return [skip_update() for _ in range(6)] + [state_params['__finished_nums_pages']]
        selected = gallery.normalize_gallery_selected_index(resolved_target.get("selected_index"))
        extension = os.path.splitext(selected_path)[1].lower()
        if extension in set(getattr(gallery, "video_types", []) or []):
            engine_type = "video"
        elif extension in set(getattr(gallery, "image_types", []) or []):
            engine_type = "image"
    else:
        remembered_path = _safe_output_media_path(state_params.get("__selected_gallery_media_path"), user_path_outputs)
        direct_path = gallery.get_main_gallery_browser_selected_path(state_params, selected)
        direct_path = _safe_output_media_path(direct_path, user_path_outputs)
        if state_params.get("gallery_state") == "main_browser":
            selected_path = direct_path or remembered_path
        else:
            selected_path = remembered_path or direct_path
        if selected_path is None and choice is not None:
            selected_path = _safe_output_media_path(
                gallery.get_media_path_from_gallery_index(choice, selected, max_per_page, user_did, engine_type),
                user_path_outputs,
            )
    media_label = "video" if engine_type == "video" else "image"
    info = gallery.read_embedded_metadata_from_file(selected_path, engine_type) if selected_path else None
    if info is None:
        info = gallery.get_images_prompt(choice, selected, max_per_page, user_did=user_did, media_type=engine_type)
    if not info or "Filename" not in info:
        if selected_path:
            info = {"Filename": os.path.basename(selected_path)}
        else:
            logger.warning(f"Delete {media_label} failed: media info not found for choice={choice}, selected={selected}")
            return [skip_update() for _ in range(6)] + [state_params['__finished_nums_pages']]
    file_name = os.path.basename(selected_path or info["Filename"] or "")
    if selected_path:
        output_choice = _output_choice_from_media_path(selected_path, user_path_outputs)
        file_path = selected_path
        if str(choice or "").split("/")[0] != output_choice:
            choice = output_choice
    else:
        output_index = str(choice or "").split('/')
        output_choice = output_index[0] if output_index else ""
        file_path = None
    if not output_choice:
        logger.warning(f"Delete {media_label} failed: invalid choice={choice}, path={direct_path}")
        return [skip_update() for _ in range(6)] + [state_params['__finished_nums_pages']]

    dir_path = os.path.join(user_path_outputs, "20{}".format(output_choice))

    log_path = os.path.join(dir_path, 'log.html')
    if _remove_media_from_html_log(log_path, file_name):
        logger.info(f'Delete item from log.html: {file_name}')

    log_name = os.path.join(dir_path, "log_ads.json")
    _remove_media_from_ads_log(log_name, file_name)

    if file_path:
        pass
    elif engine_type == "video":
        video_rel_path = gallery.get_video_rel_path_from_gallery_index(choice, selected, max_per_page, user_did)
        file_path = os.path.join(user_path_outputs, video_rel_path) if video_rel_path else os.path.join(dir_path, file_name)
    else:
        file_path = os.path.join(dir_path, file_name)
    if os.path.exists(file_path):
        os.remove(file_path)
    else:
        logger.warning(f"Delete {media_label} skipped missing file: {file_path}")
    logger.info(f'Delete {media_label} file: {file_path}')

    try:
        old_index = state_params.get("__output_list", []).index(choice)
    except ValueError:
        old_index = 0

    gallery.invalidate_output_list_cache(user_did, engine_type)
    if engine_type == "video":
        gallery.refresh_videos_catalog(output_choice, True, user_did)
    else:
        gallery.refresh_images_catalog(output_choice, True, user_did)

    if not _folder_has_remaining_output_media(dir_path):
        if os.path.exists(log_path):
            os.remove(log_path)
        if os.path.exists(log_name):
            os.remove(log_name)

    output_list, finished_nums, finished_pages = gallery.refresh_output_list(max_per_page, max_catalog, user_did, engine_type)
    state_params.update({"__output_list": output_list})
    state_params.update({"__finished_nums_pages": f'{finished_nums},{finished_pages}'})

    if choice not in output_list:
        if output_list:
            choice = output_list[min(old_index, len(output_list) - 1)]
        else:
            choice = None

    if state_params.get("gallery_state") == "main_browser":
        choice = state_params.get("__main_gallery_browser_folder")
        if choice and choice.startswith("20"):
            choice = choice[2:]
        media_gallery = [
            path for path in (state_params.get("__main_gallery_browser_paths") or [])
            if os.path.abspath(path) != os.path.abspath(file_path) and os.path.isfile(path)
        ]
        state_params["__main_gallery_browser_paths"] = media_gallery
        state_params["gallery_state"] = "main_browser"
        state_params["gallery_preview_open"] = bool(media_gallery)
    else:
        media_gallery = _get_media_paths_from_gallery_index(choice, max_per_page, user_did, engine_type) if choice else []
    if media_gallery:
        try:
            selected = int(selected)
        except Exception:
            selected = 0
        selected = max(0, min(selected, len(media_gallery) - 1))
    else:
        selected = 0

    state_params.update({"prompt_info":[choice, selected]})
    gallery.set_selected_gallery_media_path(state_params, media_gallery[selected] if media_gallery else None)
    state_params.update({"note_box_state": ['',0,0]})
    has_media = bool(media_gallery)
    state_params["gallery_preview_open"] = has_media
    label = gallery._gallery_media_label(engine_type, state_params)
    selected_index_update = selected if has_media else None
    display_gallery = gallery.gallery_display_paths_for_progress(media_gallery, engine_type, user_did, state_params)
    gallery_update = gr_update(value=None, visible=False) if engine_type == "video" else gr_update(
        value=display_gallery,
        allow_preview=True,
        preview=has_media,
        selected_index=selected_index_update,
        fit_columns=False,
    )
    output_choices = state_params.get("__output_list", []) or []
    if state_params.get("gallery_state") == "main_browser":
        gallery_index_value = choice if choice in output_choices else None
    else:
        gallery_index_value = choice if choice in output_choices else (output_choices[0] if output_choices else None)
    progress_window_update = gr_update(visible=False) if has_media else gallery._empty_gallery_welcome_update(state_params)
    util.log_ui_trace(
        logger,
        "[UI-TRACE] toolbox.delete_media.refresh | choice=%r, selected=%s, engine_type=%r, target=%r, media=%s, output_count=%s",
        choice,
        selected,
        engine_type,
        file_path,
        len(media_gallery or []),
        len(state_params.get("__output_list", []) or []),
    )
    return (
        gallery_update,
        gr_update(
            value=media_gallery,
            visible=has_media,
            label=label,
            allow_preview=True,
            preview=has_media,
            selected_index=selected_index_update,
            fit_columns=False,
        ),
        progress_window_update,
        dropdown_update(choices=output_choices, value=gallery_index_value, visible=bool(gallery_index_value)),
        gr_update(visible=False),
        gr_update(visible=False),
        state_params['__finished_nums_pages'],
    )


def _scene_aspect_ratio_to_raw(value, candidates=None):
    if not isinstance(value, str) or not value:
        return value
    value = value.strip()
    raw_candidates = []
    if isinstance(candidates, (list, tuple)):
        raw_candidates = [item for item in candidates if isinstance(item, str) and item]
    if value in raw_candidates:
        return value

    reverse_named_ratios = {
        display: raw
        for raw, display in getattr(flags, "scene_aspect_ratios_map", {}).items()
        if isinstance(raw, str) and isinstance(display, str)
    }
    if value in reverse_named_ratios:
        raw_value = reverse_named_ratios[value]
        if not raw_candidates or raw_value in raw_candidates:
            return raw_value

    if "|" not in value:
        return value
    left, ratio = value.split("|", 1)
    left = left.strip()
    ratio = ratio.strip()

    def _matching_candidate_for_ratio():
        if not raw_candidates:
            return None
        if ratio in raw_candidates:
            return ratio
        suffix = f"|{ratio}"
        for item in raw_candidates:
            if item.endswith(suffix):
                return item
        return None

    for sep in ("脳", "×", "x", "X", "*"):
        if sep in left:
            width = left.split(sep, 1)[0].strip()
            if width.isdigit():
                raw_value = f"{width}|{ratio}"
                if not raw_candidates or raw_value in raw_candidates:
                    return raw_value
                return _matching_candidate_for_ratio() or raw_value

    if left.isdigit():
        raw_value = f"{left}|{ratio}"
        if not raw_candidates or raw_value in raw_candidates:
            return raw_value
        return _matching_candidate_for_ratio() or raw_value

    return _matching_candidate_for_ratio() or ratio or value


def _set_scene_theme_value(scene_frontend, theme, key, value):
    if value is None:
        return
    if not theme:
        scene_frontend[key] = value
        return
    scene_frontend[key] = {theme: value}


def _normalize_task_method(value):
    if not isinstance(value, str):
        return ""
    value = value.strip()
    if ":" in value:
        value = value.split(":", 1)[1]
    if value.startswith("scene_"):
        value = value[6:]
    return value


def _get_state_user_did(state_params):
    try:
        user = state_params.get("user") if isinstance(state_params, dict) else None
        return user.get_did() if user is not None and hasattr(user, "get_did") else None
    except Exception:
        return None


def _iter_preset_names_for_regen(user_did):
    seen = set()
    base_dir = os.path.abspath("./presets")
    if os.path.isdir(base_dir):
        for entry in sorted(os.listdir(base_dir)):
            if not entry.lower().endswith(".json") or not topbar.is_preset_file_allowed(entry):
                continue
            name = entry[:-5]
            if name and name not in seen:
                seen.add(name)
                yield name

    user_dir = get_path_in_user_dir("presets", user_did) if user_did else get_path_in_user_dir("presets")
    if os.path.isdir(user_dir):
        for entry in sorted(os.listdir(user_dir)):
            if not entry.lower().endswith(".json") or not topbar.is_preset_file_allowed(entry):
                continue
            name = f"{entry[:-5]}."
            if name and name not in seen:
                seen.add(name)
                yield name


def _iter_scene_task_methods(scene_frontend):
    if not isinstance(scene_frontend, dict):
        return
    methods = scene_frontend.get("task_method", {})
    if isinstance(methods, dict):
        for theme, method in methods.items():
            yield str(theme), _normalize_task_method(method)
    elif isinstance(methods, list):
        themes = scene_frontend.get("theme", [])
        for index, method in enumerate(methods):
            theme = themes[index] if isinstance(themes, list) and index < len(themes) else None
            yield str(theme or method), _normalize_task_method(method)
    else:
        themes = scene_frontend.get("theme", [])
        theme = themes[0] if isinstance(themes, list) and themes else methods
        yield str(theme or methods), _normalize_task_method(methods)


def _legacy_regen_manifest_from_metadata(parsed_parameters, state_params):
    target_method = _normalize_task_method(
        parsed_parameters.get("Backend Engine", parsed_parameters.get("backend_engine", ""))
    )
    if not target_method:
        return None

    user_did = _get_state_user_did(state_params)
    for preset_name in _iter_preset_names_for_regen(user_did):
        preset_json = config.try_get_preset_content(preset_name, user_did)
        if not isinstance(preset_json, dict) or not preset_json:
            continue
        preset_engine = preset_json.get("default_engine", {})
        scene_frontend = preset_engine.get("scene_frontend", {}) if isinstance(preset_engine, dict) else {}
        for theme, method in _iter_scene_task_methods(scene_frontend):
            if method != target_method:
                continue
            try:
                preset_prepared = meta_parser.parse_meta_from_preset(copy.deepcopy(preset_json))
            except Exception:
                preset_prepared = {}
            logger.info(
                "Legacy regen metadata matched preset=%s theme=%s task_method=%s",
                preset_name,
                theme,
                target_method,
            )
            return regen_manifest.make_manifest(
                preset_name=preset_name,
                preset_json=preset_json,
                preset_prepared=preset_prepared,
                ui_values={
                    "scene_theme": theme,
                    "task_method": target_method,
                    "engine_type": preset_engine.get("engine_type", "image") if isinstance(preset_engine, dict) else "image",
                    "engine": preset_engine.get("backend_engine") if isinstance(preset_engine, dict) else None,
                },
                backend_params={},
                asset_refs={},
            )
    return None


def _read_gallery_embedded_metadata(metadata, state_params):
    if not isinstance(metadata, dict) or not isinstance(state_params, dict):
        return None

    prompt_info = state_params.get("prompt_info") or []
    choice = prompt_info[0] if len(prompt_info) > 0 else None
    selected = prompt_info[1] if len(prompt_info) > 1 else 0
    if choice is None:
        return None
    browser_metadata = gallery.get_main_gallery_browser_selected_metadata(state_params, selected)
    if browser_metadata is not None:
        return browser_metadata
    return gallery.get_embedded_media_metadata(
        choice,
        selected,
        state_params.get("__max_per_page", 18),
        user_did=_get_state_user_did(state_params),
        media_type=gallery.get_gallery_engine_type(state_params),
    )


def _resolve_regen_base_model(metadata_value, backend_value, state_params):
    metadata_value = str(metadata_value or "").strip()
    backend_value = str(backend_value or "").strip()
    selected = metadata_value or backend_value
    if not selected:
        return ""

    if (
        metadata_value
        and not regen_manifest.model_name_has_file_extension(metadata_value)
        and backend_value
        and regen_manifest.model_names_share_stem(metadata_value, backend_value)
    ):
        selected = backend_value

    try:
        choices = config.get_base_model_list(
            state_params.get("engine") or state_params.get("backend_engine") or "Comfy",
            state_params.get("task_method"),
            use_model_filter=False,
        )
    except Exception as exc:
        logger.warning("Regen base model catalog unavailable: %s", exc)
        choices = []

    resolved = regen_manifest.resolve_model_filename(selected, choices)
    if resolved != metadata_value and metadata_value:
        logger.info("Regen base model restored: %s -> %s", metadata_value, resolved)
    return resolved


def _apply_regen_manifest(parsed_parameters, state_params, manifest):
    if not isinstance(manifest, dict):
        return parsed_parameters

    preset_json = manifest.get("preset_json", {})
    preset_prepared = {}
    if isinstance(preset_json, dict) and preset_json:
        try:
            preset_prepared = meta_parser.parse_meta_from_preset(copy.deepcopy(preset_json))
        except Exception:
            logger.exception("Failed to parse preset_json from regen manifest.")
            preset_prepared = {}
    if not preset_prepared and isinstance(manifest.get("preset_prepared"), dict):
        preset_prepared = copy.deepcopy(manifest.get("preset_prepared") or {})
    if not isinstance(preset_prepared, dict) or not preset_prepared:
        return parsed_parameters

    ui_values = manifest.get("ui_values", {})
    if not isinstance(ui_values, dict):
        ui_values = {}

    preset_name = manifest.get("preset_name") or parsed_parameters.get("preset")
    if preset_name:
        preset_prepared["preset"] = preset_name
        state_params["__preset"] = preset_name
        state_params["bar_button"] = preset_name
        state_params["__preset_url"] = topbar.get_preset_inc_url(preset_name)
        state_params["__regen_preset_restore"] = True
        state_params["__preset_switched"] = False
    if isinstance(preset_json, dict):
        state_params["__preset_supported_tasks"] = config.resolve_preset_supported_tasks(preset_json, preset_name)
        state_params["__preset_interaction_requirements"] = config.resolve_preset_interaction_requirements(preset_json, preset_name)
        state_params["__preset_model_list_raw"] = preset_json.get("model_list", [])
        state_params["__preset_previous_default_model_info"] = {
            "default_model": preset_json.get("default_model", ""),
            "previous_default_models": preset_json.get("previous_default_models", []),
            "default_refiner": preset_json.get("default_refiner", ""),
            "previous_default_refiners": preset_json.get("previous_default_refiners", []),
        }
        state_params["__preset_output_format"] = preset_json.get("default_output_format", None)
        state_params["__preset_output_format_loaded"] = True
    preset_prepared["is_mobile"] = state_params.get("__is_mobile", False)

    engine = preset_prepared.get("engine", {})
    if not isinstance(engine, dict):
        engine = {}
        preset_prepared["engine"] = engine

    scene_frontend = engine.get("scene_frontend")
    if isinstance(scene_frontend, dict):
        scene_frontend = copy.deepcopy(scene_frontend)
        theme = ui_values.get("scene_theme")
        themes = scene_frontend.get("theme", [])
        if not isinstance(themes, list):
            themes = [themes] if themes else []
        if theme:
            scene_frontend["theme"] = [theme] + [item for item in themes if item != theme]
        else:
            theme = themes[0] if themes else None
        for legacy_key in ("scene_steps", "scene_steps_min", "scene_steps_max"):
            scene_frontend.pop(legacy_key, None)

        scene_value_map = {
            "scene_additional_prompt": "additional_prompt",
            "scene_additional_prompt_2": "additional_prompt_2",
            "scene_video_duration": "video_duration",
            "scene_var_number": "var_number",
            "scene_var_number2": "var_number2",
            "scene_var_number3": "var_number3",
            "scene_var_number4": "var_number4",
            "scene_var_number5": "var_number5",
            "scene_var_number6": "var_number6",
            "scene_var_number7": "var_number7",
            "scene_var_number8": "var_number8",
            "scene_var_number9": "var_number9",
            "scene_var_number10": "var_number10",
            "scene_steps": "overwrite_step",
            "overwrite_step": "overwrite_step",
            "scene_switch_option1": "switch_option1",
            "scene_switch_option2": "switch_option2",
            "scene_switch_option3": "switch_option3",
            "scene_switch_option4": "switch_option4",
            "scene_image_number": "image_number",
        }
        for ui_key, scene_key in scene_value_map.items():
            if ui_key in ui_values:
                _set_scene_theme_value(scene_frontend, theme, scene_key, ui_values.get(ui_key))

        if "scene_aspect_ratio" in ui_values and ui_values.get("scene_aspect_ratio"):
            current_ratios = scene_frontend.get("aspect_ratio", [])
            if isinstance(current_ratios, dict):
                current_ratios = current_ratios.get(theme, next(iter(current_ratios.values()), []))
            if not isinstance(current_ratios, list):
                current_ratios = []
            selected_raw = _scene_aspect_ratio_to_raw(ui_values.get("scene_aspect_ratio"), current_ratios)
            scene_frontend["aspect_ratio"] = [selected_raw] + [item for item in current_ratios if item != selected_raw]

        engine["scene_frontend"] = scene_frontend
        state_params["scene_frontend"] = scene_frontend
        task_method = scene_frontend.get("task_method", "")
        if isinstance(task_method, dict):
            task_method = task_method.get(theme, next(iter(task_method.values()), ""))
        elif isinstance(task_method, list):
            task_method = task_method[0] if task_method else ""
        state_params["task_method"] = task_method
    elif "scene_frontend" in state_params:
        del state_params["scene_frontend"]

    backend_engine = engine.get("backend_engine") or ui_values.get("engine")
    if backend_engine:
        state_params["engine"] = backend_engine
        state_params["backend_engine"] = backend_engine
    engine_type = engine.get("engine_type") or ui_values.get("engine_type")
    if engine_type:
        state_params["engine_type"] = engine_type
        state_params["__gallery_engine_type"] = "video" if engine_type == "video" else "image"

    restored = copy.deepcopy(preset_prepared)
    restored.update({
        key: value
        for key, value in parsed_parameters.items()
        if key not in (regen_manifest.KEY, regen_manifest.LABEL, "SimpleAI Regen Manifest")
    })

    backend_params = manifest.get("backend_params", {})
    if not isinstance(backend_params, dict):
        backend_params = {}

    metadata_base_model = None
    for key in ("base_model", "Base Model"):
        value = parsed_parameters.get(key)
        if isinstance(value, str) and value.strip():
            metadata_base_model = value.strip()
            break
    backend_base_model = backend_params.get("base_model") or backend_params.get("base_model_gguf")
    if isinstance(backend_base_model, str):
        backend_base_model = backend_base_model.strip()
    else:
        backend_base_model = ""
    restored_base_model = _resolve_regen_base_model(
        metadata_base_model,
        backend_base_model,
        state_params,
    )
    if restored_base_model:
        restored["base_model"] = restored_base_model
        preset_prepared["base_model"] = restored_base_model

    for index in range(1, config.default_max_lora_number + 1):
        canonical_key = f"lora_combined_{index}"
        metadata_key = f"LoRA {index}"
        if canonical_key in parsed_parameters:
            combined = parsed_parameters.get(canonical_key)
        elif metadata_key in parsed_parameters:
            combined = parsed_parameters.get(metadata_key)
        else:
            model_name = backend_params.get(f"lora_{index}")
            strength = backend_params.get(f"lora_{index}_strength", 1.0)
            if model_name and str(model_name).strip().casefold() not in ("none", "placeholder.safetensors"):
                combined = f"{model_name} : {strength}"
            else:
                combined = "None : 1.0"
        if not isinstance(combined, str) or not combined.strip():
            combined = "None : 1.0"
        restored[canonical_key] = combined
        preset_prepared[canonical_key] = combined

    state_params["__preset_prepared"] = copy.deepcopy(preset_prepared)

    def _metadata_prompt_value(*keys):
        empty_value = None
        for key in keys:
            if key not in parsed_parameters:
                continue
            value = parsed_parameters.get(key)
            if not isinstance(value, str):
                continue
            if value.strip():
                return value
            if empty_value is None:
                empty_value = value
        return empty_value

    for canonical_key, metadata_keys in (
        ("prompt", ("prompt", "Prompt")),
        ("negative_prompt", ("negative_prompt", "Negative Prompt")),
    ):
        metadata_value = _metadata_prompt_value(*metadata_keys)
        if metadata_value is not None:
            restored[canonical_key] = metadata_value

    if state_params.get("task_method"):
        restored["task_method"] = state_params.get("task_method")
    explicit_resolution = meta_parser.parse_resolution_pair_value(
        parsed_parameters.get("resolution", parsed_parameters.get("Resolution"))
    )
    if explicit_resolution:
        restored["resolution"] = str(tuple(explicit_resolution))
        restored["overwrite_width"], restored["overwrite_height"] = explicit_resolution
        if "resolution_multiplier" not in parsed_parameters:
            restored["resolution_multiplier"] = 1.0
    return restored


def reset_params_by_image_meta(metadata, state_params, is_generating, inpaint_mode):
    if metadata is None:
        metadata = {}
    manifest = regen_manifest.extract(metadata)
    parsed_parameters = meta_parser.normalize_metadata_parameters(metadata) or {}
    if manifest is not None:
        logger.info(
            "Regen metadata path: embedded manifest found preset=%s theme=%s schema=%s",
            manifest.get("preset_name"),
            (manifest.get("ui_values") or {}).get("scene_theme"),
            manifest.get("schema"),
        )
    else:
        embedded_metadata = _read_gallery_embedded_metadata(metadata, state_params)
        embedded_manifest = regen_manifest.extract(embedded_metadata)
        if embedded_manifest is not None:
            manifest = embedded_manifest
            parsed_parameters = meta_parser.normalize_metadata_parameters(embedded_metadata) or {}
            logger.info(
                "Regen metadata path: embedded manifest found in gallery file preset=%s theme=%s schema=%s",
                manifest.get("preset_name"),
                (manifest.get("ui_values") or {}).get("scene_theme"),
                manifest.get("schema"),
            )
        else:
            logger.info("Regen metadata path: embedded manifest missing; attempting legacy fallback.")
            manifest = _legacy_regen_manifest_from_metadata(parsed_parameters, state_params)
        if manifest is None:
            logger.info("Regen metadata path: legacy fallback did not find a matching preset.")
    parsed_parameters = _apply_regen_manifest(parsed_parameters, state_params, manifest)
    state_params["__regen_params_loaded"] = True

    #config_preset = config.try_get_preset_content(state_params["__preset"], state_params["user"].get_did())
    #preset_prepared = meta_parser.parse_meta_from_preset(config_preset)
    #if "engine" in preset_prepared:
    #    parsed_parameters.update({"engine": preset_prepared["engine"]})
    
    results = meta_parser.switch_layout_template(parsed_parameters, state_params)
    results += meta_parser.load_parameter_button_click(
        parsed_parameters,
        is_generating,
        inpaint_mode,
        use_resolution_override=True,
        state_params=state_params,
    )

    engine_name = parsed_parameters.get("Backend Engine", parsed_parameters.get("backend_engine", "SDXL-Fooocus"))
    logger.info(f'Reset_params_from_image: -->{engine_name} params from the image with embedded parameters.')
    return results


def reset_params_by_image_meta_with_state(metadata, state_params, is_generating, inpaint_mode):
    return reset_params_by_image_meta(metadata, state_params, is_generating, inpaint_mode) + [state_params]

def reset_image_params(state_params, is_generating, inpaint_mode):
    [choice, selected] = state_params["prompt_info"]
    metainfo = gallery.get_selected_gallery_media_metadata(state_params)
    if metainfo is None:
        metainfo = gallery.get_main_gallery_browser_selected_metadata(state_params, selected)
    if metainfo is None:
        metainfo = gallery.get_embedded_media_metadata(
            choice,
            selected,
            state_params["__max_per_page"],
            user_did=state_params["user"].get_did(),
            media_type=gallery.get_gallery_engine_type(state_params),
        )
    if metainfo is None:
        metainfo = {}
    logger.info(
        "Regen metadata source: selected media embedded metadata filename=%s keys=%s manifest=%s",
        metainfo.get("Filename"),
        len(metainfo),
        bool(regen_manifest.extract(metainfo)),
    )
    metadata = copy.deepcopy(metainfo)
    metadata['Refiner Model'] = metainfo.get('Refiner Model', 'None')
    state_params.update({"note_box_state": ['',0,0]})

    results = reset_params_by_image_meta(metadata, state_params, is_generating, inpaint_mode)
    return results + [state_params] + [gr_update(visible="hidden")] * 2


def save_preset(*args):    
    args = list(args)
    args.reverse()
    name = args.pop()
    backend_params = dict(args.pop())
    state_params = dict(args.pop())
    model_params_state = None
    if args and isinstance(args[-1], dict) and args[-1].get("__model_params_state"):
        model_params_state = dict(args.pop())

    output_format = args.pop()
    inpaint_advanced_masking_checkbox = args.pop()
    mixing_image_prompt_and_vary_upscale = args.pop()
    mixing_image_prompt_and_inpaint = args.pop()
    backfill_prompt = args.pop()
    translation_methods = args.pop()
    input_image_checkbox = args.pop()
    quick_enhance = args.pop()

    progress_video = args.pop()
    progress_gallery = args.pop()
    progress_window = args.pop()
    gallery = args.pop()
    gallery_index = args.pop()

    image_number = int(args.pop())
    prompt = args.pop()
    negative_prompt = args.pop()
    style_selections = args.pop()
    performance_selection = args.pop()
    overwrite_step = int(args.pop())
    overwrite_switch = args.pop()
    aspect_ratios_selection = args.pop()
    overwrite_width = args.pop()
    overwrite_height = args.pop()
    resolution_quantize_step = args.pop()
    resolution_multiplier = args.pop()
    resolution_edit_mode = args.pop()
    guidance_scale = args.pop()
    sharpness = args.pop()
    adm_scaler_positive = args.pop()
    adm_scaler_negative = args.pop()
    adm_scaler_end = args.pop()
    refiner_swap_method = args.pop()
    adaptive_cfg = args.pop()
    args.pop()  # legacy generation positional slot
    base_model = args.pop()
    refiner_model = args.pop()
    refiner_switch = args.pop()
    sampler_name = args.pop()
    scheduler_name = args.pop()
    clip_model = args.pop()
    vae_name = args.pop()
    upscale_model = args.pop()
    seed_random = args.pop()
    image_seed = args.pop()
    inpaint_engine = args.pop()
    inpaint_engine_state = args.pop()
    inpaint_mode = args.pop()
    enhance_inpaint_mode_ctrls = [args.pop() for _ in range(config.default_enhance_tabs)]
    #generate_button = args.pop()
    #load_parameter_button = args.pop()
    freeu_ctrls = [bool(args.pop()), float(args.pop()), float(args.pop()), float(args.pop()), float(args.pop())]
    loras = [(bool(args.pop()), str(args.pop()), float(args.pop())) for _ in range(config.default_max_lora_number)]
    loras = [[n, w] for (f, n, w) in loras]
    enhance_checkbox = args.pop()
    enhance_enabled_1 = args.pop()
    enhance_enabled_2 = args.pop()
    enhance_enabled_3 = args.pop()
    enhance_uov_method = args.pop()
    enhance_uov_strength = args.pop()

    scene_theme = None
    scene_additional_prompt = None
    scene_additional_prompt_2 = None
    scene_video_duration = None
    scene_var_number = None
    scene_var_number2 = None
    scene_var_number3 = None
    scene_var_number4 = None
    scene_var_number5 = None
    scene_var_number6 = None
    scene_var_number7 = None
    scene_var_number8 = None
    scene_var_number9 = None
    scene_var_number10 = None
    scene_steps = None
    scene_switch_option1 = None
    scene_switch_option2 = None
    scene_switch_option3 = None
    scene_switch_option4 = None
    scene_aspect_ratio = None
    scene_image_number = None

    if args:
        scene_theme = args.pop()
        scene_additional_prompt = args.pop()
        scene_additional_prompt_2 = args.pop()
        scene_video_duration = args.pop()
        scene_var_number = args.pop()
        scene_var_number2 = args.pop()
        scene_var_number3 = args.pop()
        scene_var_number4 = args.pop()
        scene_var_number5 = args.pop()
        scene_var_number6 = args.pop()
        scene_var_number7 = args.pop()
        scene_var_number8 = args.pop()
        scene_var_number9 = args.pop()
        scene_var_number10 = args.pop()
        scene_steps = args.pop()
        scene_switch_option1 = args.pop()
        scene_switch_option2 = args.pop()
        scene_switch_option3 = args.pop()
        scene_switch_option4 = args.pop()
        scene_aspect_ratio = args.pop()
        scene_image_number = args.pop()

    if isinstance(model_params_state, dict) and model_params_state.get("__model_params_state"):
        base_model = model_params_state.get("base_model", base_model)
        refiner_model = model_params_state.get("refiner_model", refiner_model)
        refiner_switch = model_params_state.get("refiner_switch", refiner_switch)
        clip_model = model_params_state.get("clip_model", clip_model)
        vae_name = model_params_state.get("vae_name", vae_name)
        upscale_model = model_params_state.get("upscale_model", upscale_model)
        state_loras = list(model_params_state.get("loras") or [])
        normalized_loras = []
        for lora_index in range(config.default_max_lora_number):
            raw_lora = state_loras[lora_index] if lora_index < len(state_loras) else ["None", 1.0]
            model_name = "None"
            weight = 1.0
            if isinstance(raw_lora, dict):
                model_name = raw_lora.get("model", raw_lora.get("name", raw_lora.get("filename", "None")))
                weight = raw_lora.get("weight", raw_lora.get("strength", 1.0))
            elif isinstance(raw_lora, (list, tuple)):
                if len(raw_lora) >= 3:
                    model_name = raw_lora[1]
                    weight = raw_lora[2]
                elif len(raw_lora) >= 2:
                    model_name = raw_lora[0]
                    weight = raw_lora[1]
                elif len(raw_lora) == 1:
                    model_name = raw_lora[0]
            try:
                weight = float(weight)
            except Exception:
                weight = 1.0
            normalized_loras.append([str(model_name or "None"), weight])
        loras = normalized_loras

    if name:
        preset = {}
        prepared_engine = None
        try:
            prepared = state_params.get("__preset_prepared", None)
            if isinstance(prepared, dict):
                prepared_engine = prepared.get("engine", None)
        except Exception:
            prepared_engine = None

        if isinstance(prepared_engine, dict):
            engine = copy.deepcopy(prepared_engine)
        else:
            engine = copy.deepcopy(config.default_engine) if isinstance(config.default_engine, dict) else {}

        backend_engine = backend_params.get("backend_engine", None) or state_params.get("backend_engine", None) or state_params.get("engine", None) or engine.get("backend_engine", None) or config.backend_engine
        if isinstance(backend_engine, str):
            backend_engine = backend_engine.strip()
        if not backend_engine:
            backend_engine = config.backend_engine
        engine["backend_engine"] = backend_engine

        task_method = backend_params.get("task_method", None) or state_params.get("task_method", None)
        if isinstance(task_method, str):
            task_method = task_method.strip()
        else:
            task_method = None

        if task_method:
            if isinstance(engine.get("backend_params", None), dict):
                engine["backend_params"]["task_method"] = task_method
            else:
                engine["backend_params"] = {"task_method": task_method}

        engine_type = state_params.get("engine_type", None)
        if isinstance(engine_type, str) and engine_type:
            engine["engine_type"] = engine_type

        if scene_theme is not None and isinstance(state_params.get("scene_frontend", None), dict):
            scene_frontend = copy.deepcopy(state_params.get("scene_frontend", {}))
            old_themes = scene_frontend.get("theme", [])
            if not isinstance(old_themes, list):
                old_themes = []

            scene_frontend["theme"] = [scene_theme]

            for key, value in list(scene_frontend.items()):
                if not isinstance(value, dict):
                    continue
                if not any(t in value for t in old_themes):
                    continue
                chosen = value.get(scene_theme, next(iter(value.values()), None))
                if chosen is not None:
                    scene_frontend[key] = {scene_theme: chosen}
            for legacy_key in ("scene_steps", "scene_steps_min", "scene_steps_max"):
                scene_frontend.pop(legacy_key, None)

            task_method_map = scene_frontend.get("task_method", None)
            if isinstance(task_method_map, dict):
                chosen_task = task_method_map.get(scene_theme, next(iter(task_method_map.values()), None))
            else:
                chosen_task = None
            if not isinstance(chosen_task, str) or not chosen_task.strip():
                chosen_task = task_method
                if isinstance(chosen_task, str) and chosen_task.startswith("scene_"):
                    chosen_task = chosen_task[6:]
            if isinstance(chosen_task, str) and chosen_task.strip():
                scene_frontend["task_method"] = {scene_theme: chosen_task.strip()}

            def _set_theme_value(k, v):
                if v is None:
                    return
                scene_frontend[k] = {scene_theme: v}

            _set_theme_value("additional_prompt", scene_additional_prompt)
            _set_theme_value("additional_prompt_2", scene_additional_prompt_2)
            _set_theme_value("video_duration", scene_video_duration)
            _set_theme_value("var_number", scene_var_number)
            _set_theme_value("var_number2", scene_var_number2)
            _set_theme_value("var_number3", scene_var_number3)
            _set_theme_value("var_number4", scene_var_number4)
            _set_theme_value("var_number5", scene_var_number5)
            _set_theme_value("var_number6", scene_var_number6)
            _set_theme_value("var_number7", scene_var_number7)
            _set_theme_value("var_number8", scene_var_number8)
            _set_theme_value("var_number9", scene_var_number9)
            _set_theme_value("var_number10", scene_var_number10)
            _set_theme_value("overwrite_step", overwrite_step)
            _set_theme_value("switch_option1", scene_switch_option1)
            _set_theme_value("switch_option2", scene_switch_option2)
            _set_theme_value("switch_option3", scene_switch_option3)
            _set_theme_value("switch_option4", scene_switch_option4)
            _set_theme_value("image_number", scene_image_number)
            if scene_aspect_ratio is not None:
                base_ar = scene_frontend.get("aspect_ratio", [])
                if isinstance(base_ar, dict):
                    base_ar = base_ar.get(scene_theme, next(iter(base_ar.values()), []))
                if not isinstance(base_ar, list):
                    base_ar = []
                selected_raw = _scene_aspect_ratio_to_raw(scene_aspect_ratio, base_ar)
                if selected_raw:
                    scene_frontend["aspect_ratio"] = [selected_raw] + [x for x in base_ar if x != selected_raw]

            engine["scene_frontend"] = scene_frontend

        backend_params_sanitized = engine.get("backend_params", None)
        if isinstance(backend_params_sanitized, dict):
            for k in [
                "nickname",
                "user_did",
                "translation_methods",
                "backfill_prompt",
                "comfyd_active_checkbox",
                "backend_engine",
                "clip_model",
                "upscale_model",
                "cloud_config_name",
                "cloud_protocol",
                "cloud_base_url",
                "cloud_api_key",
                "cloud_model",
            ]:
                backend_params_sanitized.pop(k, None)
            if not backend_params_sanitized:
                engine.pop("backend_params", None)

        preset["default_engine"] = engine
        source_supported_tasks = config.normalize_preset_supported_tasks(state_params.get("__preset_supported_tasks"))
        if not source_supported_tasks:
            source_preset_name = state_params.get("__preset")
            source_preset = config.try_get_preset_content(source_preset_name, state_params['user'].get_did())
            source_supported_tasks = config.resolve_preset_supported_tasks(source_preset, source_preset_name)
        preset["supported_tasks"] = source_supported_tasks or config.resolve_preset_supported_tasks(
            {"default_engine": engine},
            name,
        )
        source_interaction_requirements = config.normalize_preset_interaction_requirements(
            state_params.get("__preset_interaction_requirements")
        )
        if not source_interaction_requirements:
            source_preset_name = state_params.get("__preset")
            source_preset = config.try_get_preset_content(source_preset_name, state_params['user'].get_did())
            source_interaction_requirements = config.resolve_preset_interaction_requirements(
                source_preset,
                source_preset_name,
            )
        preset["interaction_requirements"] = source_interaction_requirements

        preset["default_model"] = base_model
        preset["default_refiner"] = refiner_model
        preset["default_refiner_switch"] = refiner_switch
        preset["default_loras"] = loras
        preset["default_cfg_scale"] = guidance_scale
        preset["default_sample_sharpness"] = sharpness
        preset["default_sampler"] = sampler_name
        preset["default_scheduler"] = scheduler_name
        preset["default_performance"] = performance_selection
        preset["default_prompt"] = prompt
        preset["default_prompt_negative"] = negative_prompt
        preset["default_styles"] = style_selections
        preset["default_aspect_ratio"] = aspect_ratios_selection.split(' ')[0].replace(u'\u00d7','*')
        try:
            quantize_step = int(resolution_quantize_step)
        except Exception:
            quantize_step = flags.default_resolution_quantize_step
        if quantize_step in flags.resolution_quantize_steps and quantize_step != flags.default_resolution_quantize_step:
            preset["default_resolution_quantize_step"] = quantize_step
        try:
            multiplier = float(resolution_multiplier)
        except Exception:
            multiplier = flags.default_resolution_multiplier
        if multiplier != flags.default_resolution_multiplier:
            preset["default_resolution_multiplier"] = multiplier
        if resolution_edit_mode in flags.resolution_edit_modes and resolution_edit_mode != flags.default_resolution_edit_mode:
            preset["default_resolution_edit_mode"] = resolution_edit_mode
        if ads.default["adm_scaler_positive"] != adm_scaler_positive or ads.default["adm_scaler_negative"] != adm_scaler_negative \
                or ads.default["adm_scaler_end"] != adm_scaler_end:
            preset["default_adm_guidance"] = f'({adm_scaler_positive}, {adm_scaler_negative}, {adm_scaler_end})'
        if ads.default["freeu"]!=freeu_ctrls[1:]:
            preset["default_freeu"]=freeu_ctrls[1:]
        def _differs_from_builtin_or_config(config_key, value, builtin_default):
            config_default = getattr(config, config_key, builtin_default)
            return value != builtin_default or value != config_default

        if _differs_from_builtin_or_config("default_cfg_tsnr", adaptive_cfg, ads.default["adaptive_cfg"]):
            preset["default_cfg_tsnr"] = adaptive_cfg
        if _differs_from_builtin_or_config("default_overwrite_step", overwrite_step, ads.default["overwrite_step"]):
            preset["default_overwrite_step"] = overwrite_step
        if _differs_from_builtin_or_config("default_overwrite_switch", overwrite_switch, ads.default["overwrite_switch"]):
            preset["default_overwrite_switch"] = overwrite_switch
        if ads.default["inpaint_engine"] != inpaint_engine:
            preset["default_inpaint_engine"] = inpaint_engine
        if clip_model and clip_model not in (flags.default_clip, flags.default_vae, 'auto'):
            preset["default_clip_model"] = clip_model
        if ads.default["vae"] != vae_name:
            preset["default_vae"] = vae_name
        if upscale_model:
            preset["default_upscale_model"] = upscale_model
        if ads.default["overwrite_width"] != overwrite_width:
            preset["default_overwrite_width"] = overwrite_width
        if ads.default["overwrite_height"] != overwrite_height:
            preset["default_overwrite_height"] = overwrite_height
        if not seed_random:
            preset["default_image_seed"] = image_seed
        if ads.default.get("enhance_checkbox", False) != enhance_checkbox:
            preset["default_enhance_checkbox"] = enhance_checkbox
        if enhance_enabled_1:
            preset["default_enhance_enabled_1"] = enhance_enabled_1
        if enhance_enabled_2:
            preset["default_enhance_enabled_2"] = enhance_enabled_2
        if enhance_enabled_3:
            preset["default_enhance_enabled_3"] = enhance_enabled_3
        if ads.default.get("enhance_uov_method", 'upscale_15') != enhance_uov_method:
            preset["default_enhance_uov_method"] = enhance_uov_method
        if ads.default.get("enhance_uov_strength", 0.2) != enhance_uov_strength:
            preset["default_enhance_uov_strength"] = enhance_uov_strength

        preset["default_output_format"] = output_format
        preset["default_inpaint_advanced_masking"] = inpaint_advanced_masking_checkbox
        preset["default_mixing_image_prompt_and_vary_upscale"] = mixing_image_prompt_and_vary_upscale
        preset["default_mixing_image_prompt_and_inpaint"] = mixing_image_prompt_and_inpaint
        preset["default_backfill_prompt"] = backfill_prompt
        preset["default_translation_methods"] = translation_methods
        preset["default_input_image_checkbox"] = input_image_checkbox

        # preset["default_progress_video"] = progress_video
        # preset["default_progress_gallery"] = progress_gallery
        # preset["default_progress_window"] = progress_window

        preset["default_refiner_swap_method"] = refiner_swap_method
        preset["default_inpaint_engine_state"] = inpaint_engine_state
        preset["default_inpaint_mode"] = inpaint_mode
        preset["default_enhance_inpaint_mode_ctrls"] = enhance_inpaint_mode_ctrls

        preset["default_image_number"] = image_number

        preset["checkpoint_downloads"] = {}
        # if refiner_model and refiner_model != 'None':
        #     # preset["checkpoint_downloads"].update({refiner_model: get_muid_link("checkpoints/"+refiner_model)})

        preset["embeddings_downloads"] = {}
        prompt_tags = re.findall(r'[\(](.*?)[)]', negative_prompt) + re.findall(r'[\(](.*?)[)]', prompt)
        embeddings = {}
        for e in prompt_tags:
            embed = e.split(':')
            if len(embed)>2 and embed[0] == 'embedding':
                embeddings.update({embed[1]:embed[2]})
        embeddings = embeddings.keys()
        preset["embeddings_downloads"] = {} 


        m_dict = {}
        for key in style_selections:
            if key!='Fooocus V2':
                m_dict.update({key: sdxl_styles.styles[key]})
        if len(m_dict.keys())>0:
            preset["styles_definition"] = m_dict

        #logger.info(f'preset:{preset}')
        save_path = get_path_in_user_dir(name + '.json', state_params['user'].get_did(), catalog='presets')
        with open(save_path, "w", encoding="utf-8") as json_file:
            json.dump(preset, json_file, indent=4)

        logger.info(f'Saved the current params to {save_path}.')
    state_params.update({"note_box_state": ['',0,0]})
    cache_key = state_params['user'].get_did()
    topbar.preset_samples.pop(cache_key, None)
    topbar.preset_samples_user_mtime.pop(cache_key, None)
    topbar.preset_samples_base_mtime.pop(cache_key, None)
    topbar.preset_samples_complete_ts.pop(cache_key, None)
    results = [gr_update(value='', visible="hidden"), gr_update(visible="hidden"), gr_update(visible="hidden")]
    results += [dataset_update(samples=topbar.get_preset_samples(cache_key))]
    results += topbar.refresh_nav_bars(state_params)
    results += topbar.update_topbar_js_params(state_params)
    return results


def preset_store_unmount(state_params):
    return gr_update(samples=[], visible=False)


def preset_store_mount(state_params):
    user_did = state_params['user'].get_did() if 'user' in state_params and state_params['user'] else None
    return gr_update(samples=topbar.get_preset_samples(user_did), visible=True)


def sync_model_info_click(*args):

    downurls = list(args)
    #logger.info(f'downurls:{downurls} \nargs:{args}, len={len(downurls)}')
    keylist = sync_model_info(downurls)
    results = []
    nums = 0
    for k in keylist:
        muid = ' ' 
        durl = None 
        nums += 1 
        results += [gr_update(info=f'MUID={muid}', value=durl)]
    if nums:
        logger.info(f'There are {nums} model files missing MUIDs, which need to be added with download URLs before synchronizing.')
    return results


def open_output_folder(state_params):
    lang = state_params.get("__lang", "en")
    is_cn = lang != "en"

    local_access = state_params.get("local_access", False)
    if not local_access:
        gr.Info("此功能仅限本机使用。" if is_cn else "This feature is only available on the local machine.", duration=3)
        return skip_update()

    user_did = state_params["user"].get_did()
    output_dir = config.get_user_path_outputs(user_did)
    if not output_dir or not os.path.isdir(output_dir):
        gr.Warning("未找到输出文件夹。" if is_cn else "Output folder not found.", duration=3)
        return skip_update()

    current_folder = ""
    if state_params.get("gallery_state") == "main_browser":
        current_folder = str(state_params.get("__main_gallery_browser_folder") or "").strip().replace("\\", "/").strip("/")
    selected_path = gallery.get_main_gallery_browser_selected_path(state_params)
    if not current_folder and selected_path:
        try:
            current_folder = os.path.basename(os.path.dirname(selected_path))
        except Exception:
            current_folder = ""
    if current_folder:
        date_dir = os.path.join(output_dir, current_folder if current_folder.startswith("20") else "20{}".format(current_folder))
        if os.path.isdir(date_dir):
            output_dir = date_dir
    else:
        output_list = state_params.get("__output_list", [])
        if isinstance(output_list, list) and len(output_list) > 0:
            first_entry = str(output_list[0])
            date_prefix = first_entry.split("/")[0] if "/" in first_entry else first_entry
            date_dir = os.path.join(output_dir, "20{}".format(date_prefix))
            if os.path.isdir(date_dir):
                output_dir = date_dir

    try:
        import subprocess
        import platform
        if platform.system() == "Windows":
            os.startfile(output_dir)
        elif platform.system() == "Darwin":
            subprocess.Popen(["open", output_dir])
        else:
            subprocess.Popen(["xdg-open", output_dir])
        gr.Info(f"已打开：{output_dir}" if is_cn else f"Opened: {output_dir}", duration=2)
    except Exception as e:
        logger.exception(f"Failed to open output folder: {output_dir}, error={e}")
        gr.Warning(f"无法打开文件夹：{e}" if is_cn else f"Could not open folder: {e}", duration=4)

    return skip_update()
