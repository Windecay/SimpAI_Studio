import os
import ast
import copy
import json
import mimetypes
import re
from abc import ABC, abstractmethod
from pathlib import Path
import random

import gradio as gr
from PIL import Image
try:
    import piexif
    import piexif.helper
except Exception:
    piexif = None

import modules.config
import modules.sdxl_styles
import shared

from modules.flags import MetadataScheme, Performance, Steps, task_class_mapping, get_taskclass_by_fullname, default_class_params, scheduler_list, sampler_list, default_clip
from modules.flags import SAMPLERS, CIVITAI_NO_KARRAS
from modules.util import quote, unquote, extract_styles_from_prompt, is_json, sha256, get_files_from_folder, resize_image, resize_image_by_max_area, is_chinese, HWC3, normalize_gradio_image_value, simpai_ui_trace_enabled
import enhanced.all_parameters as ads
from modules.hash_cache import sha256_from_cache
from modules.localization import localized_text as localized_ui_text
import extras.preprocessors as preprocessors
import numpy as np
from enhanced.vlm import vlm
from ui.update_helpers import dropdown_update, gr_update, skip_update

import logging
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

re_param_code = r'\s*(\w[\w \-/]+):\s*("(?:\\.|[^\\"])+"|[^,]*)(?:,|$)'
re_param = re.compile(re_param_code)
re_imagesize = re.compile(r"^(\d+)x(\d+)$")
SCENE_OPTIONAL_INPUT_IMAGE_SLOTS = ("scene_input_image3", "scene_input_image4")
SCENE_OPTIONAL_VIDEO_SLOTS = ("scene_reference_video",)
SCENE_INPUT_IMAGE_SLOTS = ("scene_input_image1", "scene_input_image2", "scene_input_image3", "scene_input_image4")
SCENE_AUX_OUTPUT_COUNT = 11
SCENE_PRIMARY_OUTPUT_COUNT = 29
SCENE_SWITCH_OUTPUT_COUNT = SCENE_AUX_OUTPUT_COUNT + SCENE_PRIMARY_OUTPUT_COUNT


def resolve_engine_class_display(template_engine, task_method):
    if template_engine in ['Flux', 'Wan', 'Qwen', 'Z-image']:
        return template_engine
    if template_engine == 'Comfy':
        if str(task_method or '').strip().lower().startswith('minimax_h3'):
            return 'H3'
        return {
            'sd15_aio': 'SD15',
            'il_v_pre_aio': 'Illustrious',
            'anima_aio': 'Anima',
        }.get(task_method, 'SDXL')
    return 'SDXL'

get_layout_visible = lambda x,y:gr_update(visible=x not in y)
get_layout_visible_inter = lambda x,y,z:gr_update(visible=x not in y, interactive=x not in z)
get_layout_invert_visible_inter = lambda x,y,z:gr_update(value=x not in z, visible=x not in y, interactive=x not in z)
get_layout_toggle_visible_inter = lambda x,y,z: gr_update(visible=x not in y, interactive=x not in z) if x not in z else gr_update(value=x not in z, visible=x not in y, interactive=x not in z)
get_layout_choices_visible_inter = lambda l,x,y,z:gr_update(choices=l, visible=x not in y, interactive=x not in z)
get_layout_setting_choices_visible_inter = lambda l,v,x,y,z:dropdown_update(choices=l, value=v, visible=x not in y, interactive=x not in z)
get_layout_empty_visible_inter_text = lambda x,y,z: gr_update(visible=x not in y, interactive=x not in z) if x not in z else gr_update(value='', visible=x not in y, interactive=x not in z)
get_layout_empty_visible_inter_image = lambda x,y,z: gr_update(visible=x not in y, interactive=x not in z) if x not in z else gr_update(value=None, visible=x not in y, interactive=x not in z)
get_layout_update_label_visible_inter = lambda t,v,x,y,z:gr_update(label=t, value='' if v is None else v, visible=x not in y, interactive=x not in z) if t else gr_update(value='' if v is None else v, visible=x not in y, interactive=x not in z)
get_layout_update_label_inter = lambda t,v,x,z:gr_update(label=t, value='' if v is None else v, interactive=x not in z) if t else gr_update(value='' if v is None else v, interactive=x not in z)
get_layout_update_label_and_choice_visible_inter = lambda t,l,v,x,y,z:dropdown_update(label=t, choices=l, value=v, visible=x not in y, interactive=x not in z) if t else dropdown_update(choices=l, value=v, visible=x not in y, interactive=x not in z)
get_layout_update_and_visible_inter = lambda v,x,y,z:gr_update(value=v, visible=x not in y, interactive=x not in z)

def _value_with_default_alias(source_dict, key, default=None):
    if not isinstance(source_dict, dict):
        return default
    value = source_dict.get(key, None)
    if value is not None:
        return value
    return source_dict.get(f"default_{key}", default)


def _resolve_previous_default_model(source_dict, model_name, previous_key):
    if not isinstance(source_dict, dict) or not model_name:
        return model_name
    if str(model_name).strip().lower() in ("none", "auto", "default (model)"):
        return model_name
    try:
        from modules.model_loader import resolve_preset_default_model_choice

        return resolve_preset_default_model_choice(model_name, source_dict.get(previous_key, []))
    except Exception:
        return model_name


def _resolve_previous_default_base_model(source_dict, base_model):
    return _resolve_previous_default_model(source_dict, base_model, "previous_default_models")


def _resolve_previous_default_refiner_model(source_dict, refiner_model):
    return _resolve_previous_default_model(source_dict, refiner_model, "previous_default_refiners")


def scene_disvisible_with_optional_inputs(scenes):
    if not isinstance(scenes, dict):
        return []
    raw_hidden = scenes.get("disvisible", [])
    if isinstance(raw_hidden, list):
        hidden = [str(item) for item in raw_hidden]
    elif isinstance(raw_hidden, str):
        hidden = [item.strip() for item in raw_hidden.split(",") if item.strip()]
    else:
        hidden = []
    enabled = scenes.get("divisible", [])
    enabled = set(str(item) for item in enabled) if isinstance(enabled, list) else set()
    for slot in (*SCENE_OPTIONAL_INPUT_IMAGE_SLOTS, *SCENE_OPTIONAL_VIDEO_SLOTS):
        if slot not in hidden and slot not in enabled:
            hidden.append(slot)
    if "scene_video_duration" not in hidden and "scene_video_duration" not in enabled and "video_duration" not in scenes:
        hidden.append("scene_video_duration")
    return hidden


def scene_localized_text(state, scenes, key, default=""):
    state = state if isinstance(state, dict) else {}
    scenes = scenes if isinstance(scenes, dict) else {}
    value = scenes.get(key, default)
    return localized_ui_text(state, default if value is None else value)


def _scene_frontend_from_state_or_scene(state_or_scene):
    if not isinstance(state_or_scene, dict):
        return {}
    scenes = state_or_scene.get("scene_frontend", None)
    if isinstance(scenes, dict):
        return scenes
    engine = state_or_scene.get("engine", None)
    if isinstance(engine, dict) and isinstance(engine.get("scene_frontend"), dict):
        return engine.get("scene_frontend")
    return state_or_scene


def _scene_disinteractive_list(scenes):
    if not isinstance(scenes, dict):
        return []
    raw = scenes.get("disinteractive", [])
    if isinstance(raw, list):
        return [str(item) for item in raw]
    if isinstance(raw, str):
        return [item.strip() for item in raw.split(",") if item.strip()]
    return []


def _scene_standard_steps_readonly(state_or_scene):
    scenes = _scene_frontend_from_state_or_scene(state_or_scene)
    hidden = set(scene_disvisible_with_optional_inputs(scenes))
    disabled = set(_scene_disinteractive_list(scenes))
    return (
        "scene_steps" in hidden
        or "scene_steps" in disabled
        or "overwrite_step" in disabled
    )

def ensure_dropdown_choices_include_values(choices, *values):
    result = list(choices or [])
    for value in values:
        if not value or value == 'None':
            continue
        value = str(value).replace('\\', os.sep).replace('/', os.sep)
        if value not in result:
            result.append(value)
    return result

def _coerce_scene_slider_value(value, minimum=None, maximum=None, step=None):
    if minimum is None and maximum is None:
        return value
    try:
        if value is None or value == "":
            value = minimum if minimum is not None else maximum
        number = float(value)
        if minimum is not None:
            number = max(number, float(minimum))
        if maximum is not None:
            number = min(number, float(maximum))
        if step == 1 or all(isinstance(v, int) and not isinstance(v, bool) for v in (minimum, maximum) if v is not None):
            return int(round(number))
        return number
    except Exception:
        return value


def get_scene_safe_update(control_name, value, visible, inter, **kwargs):
    is_interactive = control_name not in inter
    payload = dict(kwargs)
    payload["interactive"] = is_interactive
    if "minimum" in payload or "maximum" in payload:
        payload["value"] = _coerce_scene_slider_value(value, payload.get("minimum"), payload.get("maximum"), payload.get("step"))
    else:
        payload["value"] = value
    return gr_update(**payload)

def get_scene_task_method(scenes, theme):
    task_method = scenes.get("task_method", "") if isinstance(scenes, dict) else ""
    if isinstance(task_method, dict):
        if isinstance(theme, str) and theme in task_method:
            task_method = task_method.get(theme, "")
        else:
            task_method = ""
    elif isinstance(task_method, list):
        themes = scenes.get("theme", []) if isinstance(scenes, dict) else []
        if isinstance(theme, str) and isinstance(themes, (list, tuple)) and theme in themes:
            index = list(themes).index(theme)
            task_method = task_method[index] if index < len(task_method) else ""
        else:
            task_method = task_method[0] if len(task_method) == 1 else ""
    return str(task_method or "")


def scene_frontend_all_sam3_themes(scenes):
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


def scene_sam3_inputs_enabled(scenes, theme):
    if not isinstance(scenes, dict):
        return False

    raw_hidden = scenes.get("disvisible", [])
    if isinstance(raw_hidden, str):
        raw_hidden = [item.strip() for item in raw_hidden.split(",") if item.strip()]
    hidden = set(str(item).strip() for item in raw_hidden) if isinstance(raw_hidden, (list, tuple, set)) else set()
    if any(key in hidden for key in ("sam3_video_mask_accordion", "sam3_input_video", "sam3_mask_video")):
        return False

    theme_l = str(theme or "").lower()
    task_method_l = get_scene_task_method(scenes, theme).lower()
    if "sam3" in theme_l or "sam3" in task_method_l or scene_frontend_all_sam3_themes(scenes):
        return True

    raw_enabled = scenes.get("divisible", [])
    enabled = set(str(item).strip() for item in raw_enabled) if isinstance(raw_enabled, (list, tuple, set)) else set()
    return any(key in enabled for key in ("sam3_input_video", "sam3_mask_video"))


def get_scene_resolution_override_updates(scenes, theme):
    return [
        gr_update(visible="hidden", open=False),
        gr_update(visible="hidden", value=False),
        gr_update(visible="hidden", value=""),
    ]

def get_scene_aux_control_updates(scenes, theme):
    task_method_l = get_scene_task_method(scenes, theme).lower()
    theme_l = str(theme or "").lower()
    hidden = scenes.get('disvisible', []) if isinstance(scenes, dict) else []
    hidden = set(str(item).strip() for item in hidden) if isinstance(hidden, list) else set(str(item).strip() for item in str(hidden or '').split(','))
    show_camera = bool(theme_l and "multiangle" in theme_l and "camera_control_accordion" not in hidden)
    show_light = bool(theme_l and ("anglelight" in theme_l or "lightning" in theme_l) and "anglelight_control_accordion" not in hidden)
    show_style_transfer = bool(theme_l and "flux2_styletransfer" in theme_l and "style_transfer_accordion" not in hidden)
    show_sam3 = scene_sam3_inputs_enabled(scenes, theme)
    show_pose = bool(("pose" in theme_l or "pose" in task_method_l) and "pose_studio" not in hidden)
    gaussian_markers = ("gaussian", "3dgs", "splat", "sharp")
    show_gaussian = bool((any(marker in theme_l for marker in gaussian_markers) or any(marker in task_method_l for marker in gaussian_markers)) and "gaussian_studio" not in hidden)
    liveportrait_markers = ("liveportrait", "advancedliveportrait")
    show_liveportrait = bool((any(marker in theme_l for marker in liveportrait_markers) or any(marker in task_method_l for marker in liveportrait_markers)) and "liveportrait_expression" not in hidden)
    show_relight = bool(("relight" in theme_l or "relight" in task_method_l) and "relight_light_control" not in hidden)
    return [
        gr_update(open=show_camera),
        gr_update(open=show_light),
        gr_update(open=False),
        gr_update(open=show_sam3),
        gr_update(visible=show_pose),
        gr_update(visible=show_gaussian),
        gr_update(visible=show_liveportrait),
        gr_update(visible=show_relight),
    ]

def get_layout_visible_inter_loras_with_choices(visible, inter, max_number, lora_choices):
    x = 'loras'
    y1 = max_number if x in visible else -1
    for key in visible:
        if '-' in key and x == key.split('-')[0]:
            y1 = int(key.split('-')[1])
            break
    z1 = max_number if x in inter else -1
    for key in inter:
        if '-' in key and x == key.split('-')[0]:
            z1 = int(key.split('-')[1])
            break
    results = []
    for i in range(max_number):
        is_visible = i + y1 < max_number or y1 < 0
        is_interactive = i + z1 < max_number or z1 < 0
        results.append(gr_update(visible=is_visible, interactive=is_interactive))
        results.append(gr_update(choices=lora_choices, visible=is_visible, interactive=is_interactive))
        results.append(gr_update(visible=is_visible, interactive=is_interactive))
    return results

def get_layout_visible_inter_loras(y,z,max_number):
    x = 'loras'
    y1 = max_number if x in y else -1 
    for key in y:
        if '-' in key and x==key.split('-')[0]:
            y1 = int(key.split('-')[1])
            break
    z1 = max_number if x in z else -1
    for key in z:
        if '-' in key and x==key.split('-')[0]:
            z1 = int(key.split('-')[1])
            break
    results = []
    for i in range(max_number):
        results += [gr_update(visible= i+y1<max_number or y1<0, interactive= i+z1<max_number or z1<0)] * 3
    return results

def _parse_scene_aspect_ratio_candidate(value):
    text = str(value or "").strip()
    if '|' in text:
        text = text.split('|', 1)[1].strip()
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?):([0-9]+(?:\.[0-9]+)?)", text)
    if not match:
        return None
    width = float(match.group(1))
    height = float(match.group(2))
    if height == 0:
        return None
    return width / height

def get_auto_candidate(img, selections, mode):
    img = normalize_gradio_image_value(img)
    if img is None:
        return modules.flags.scene_aspect_ratios[:3], modules.flags.scene_aspect_ratios[0]
    H, W = img.shape[:2]
    selections = list(selections or [])
    candidates = [
        (index, ratio)
        for index, selection in enumerate(selections)
        for ratio in [_parse_scene_aspect_ratio_candidate(selection)]
        if ratio is not None
    ]
    if not candidates:
        return selections, '' if len(selections) == 0 else selections[0]
    selection = float(W)/float(H)
    selections2 = np.array([ratio for _, ratio in candidates])
    index = np.argmin(np.abs(selections2 - selection))
    index_value = selections[candidates[index][0]]
    if '_candidate' in mode:
        start_index = max(index - 1, 0)
        end_index = min(index + 2, len(candidates))
        selections = [selections[candidate_index] for candidate_index, _ in candidates[start_index:end_index]]
    return selections, index_value


def describe_prompt_for_scene(state, img, scene_theme, additional_prompt):
    img = normalize_gradio_image_value(img)
    img = img if img is None else resize_image_by_max_area(HWC3(img), max_area=1024 * 1024)
    preprocessor_methods = modules.flags.get_value_by_scene_theme(state, scene_theme, 'image_preprocessor_method', [])
    img_is_ok = True
    if len(preprocessor_methods)>0 and img is not None:
        for preprocessor_method in preprocessor_methods:
            if 'face' in preprocessor_method or 'hand' in preprocessor_method or 'body' in preprocessor_method:
                img_is_ok = preprocessors.openpose_have(img, preprocessor_method)
    s_prompts = state['scene_frontend'].get('prompt', {})
    describe_prompt = s_prompts.get(scene_theme, '')
    if not describe_prompt:
        return '', img_is_ok
    if is_chinese(additional_prompt) and not state['scene_frontend']['task_method'][scene_theme].lower().endswith('_cn'):
        additional_prompt = vlm.translate(additional_prompt, 'Slim Model')
    describe_prompts = [describe_prompt.format(additional_prompt=additional_prompt)]
    m_prompts = state['scene_frontend'].get('multimodal_prompt', {})
    prompt_prompt = m_prompts.get(scene_theme, '')
    if prompt_prompt and img is not None:
        prompt_prompt = prompt_prompt.format(additional_prompt=additional_prompt)
        prompt_prompt_key = prompt_prompt.strip().lower()
        if 'tags' in prompt_prompt_key:
            from extras.wd14tagger import default_interrogator as default_interrogator_anime
            describe_prompts.append(default_interrogator_anime(img))
        else:
            vlm_prompt = None if 'photo' in prompt_prompt_key else prompt_prompt
            describe_prompts.append(vlm.interrogate(img, prompt=vlm_prompt))
    describe_prompt=', '.join(describe_prompts)
    return describe_prompt, img_is_ok

def extract_scene_image(value):
    return normalize_gradio_image_value(value)

def switch_scene_theme_select(state, theme=None):
    if not isinstance(state, dict):
        state = {}
    scenes = state.get("scene_frontend", {})
    resolved_theme = _resolve_scene_theme_name(scenes, theme)
    if resolved_theme:
        state["scene_theme"] = resolved_theme
        state["__scene_theme_preset"] = state.get("__preset")
        task_method = get_scene_task_method(scenes, resolved_theme)
        if task_method:
            state["task_method"] = task_method
    state["switch_scene_theme"] = True
    try:
        state["__scene_theme_revision"] = int(state.get("__scene_theme_revision", 0) or 0) + 1
    except Exception:
        state["__scene_theme_revision"] = 1
    return state

def _resolve_scene_theme_name(scenes: dict, theme):
    themes = scenes.get("theme", []) if isinstance(scenes, dict) else []
    if isinstance(themes, str):
        themes = [themes] if themes else []
    if isinstance(themes, (list, tuple)):
        themes = [t for t in themes if isinstance(t, str) and t]
        if isinstance(theme, str) and theme and (not themes or theme in themes):
            return theme
        return themes[0] if themes else ""
    elif isinstance(theme, str) and theme:
        return theme
    return ""


def _resolve_active_scene_theme(state, theme=None):
    scenes = state.get("scene_frontend", {}) if isinstance(state, dict) else {}
    if isinstance(state, dict):
        preset_name = str(state.get("__preset") or "").strip()
        theme_owner = str(state.get("__scene_theme_preset") or "").strip()
        state_theme = state.get("scene_theme")
        if isinstance(state_theme, str) and state_theme and (not theme_owner or not preset_name or theme_owner == preset_name):
            return _resolve_scene_theme_name(scenes, state_theme)
    return _resolve_scene_theme_name(scenes, theme)


def scene_theme_event_matches_preset(state, source_preset=None):
    if not isinstance(state, dict):
        return True
    current_preset = str(state.get("__preset") or "").strip()
    source_preset = str(source_preset or "").strip()
    return not (current_preset and source_preset and current_preset != source_preset)


def _scene_generation_step_default(state_or_scene, theme=None, default=None):
    if isinstance(state_or_scene, dict):
        nested_scene = state_or_scene.get("scene_frontend")
        scenes = nested_scene if isinstance(nested_scene, dict) else state_or_scene
    else:
        scenes = {}
    for key in ("overwrite_step", "steps", "scene_steps"):
        if key not in scenes:
            continue
        value = modules.flags.get_value_by_scene_theme({"scene_frontend": scenes}, theme, key, None)
        if value is None:
            continue
        try:
            return int(float(value))
        except Exception:
            continue
    if default is not None:
        try:
            return int(float(default))
        except Exception:
            return default
    return None


def _scene_generation_step_bound(state_or_scene, theme=None, suffix="min", default=None):
    scenes = state_or_scene.get("scene_frontend", {}) if isinstance(state_or_scene, dict) else {}
    if not isinstance(scenes, dict):
        scenes = state_or_scene if isinstance(state_or_scene, dict) else {}
    for key in (f"overwrite_step_{suffix}", f"steps_{suffix}", f"scene_steps_{suffix}"):
        if key not in scenes:
            continue
        value = modules.flags.get_value_by_scene_theme({"scene_frontend": scenes}, theme, key, None)
        if value is None:
            continue
        try:
            return int(float(value))
        except Exception:
            continue
    if default is not None:
        try:
            return int(float(default))
        except Exception:
            return default
    return None


def _scene_generation_step_update_props(state_or_scene, theme=None):
    return {
        "minimum": _scene_generation_step_bound(state_or_scene, theme, "min", -1),
        "maximum": _scene_generation_step_bound(state_or_scene, theme, "max", 200),
        "step": _scene_generation_step_bound(state_or_scene, theme, "step", 1),
    }


def _state_standard_generation_step_default(state):
    if not isinstance(state, dict):
        return None
    preset_prepared = state.get("__preset_prepared", {})
    candidates = [state]
    if isinstance(preset_prepared, dict):
        candidates.append(preset_prepared)
    for source in candidates:
        for key in ("overwrite_step", "steps", "default_overwrite_step"):
            value = source.get(key)
            if value is None:
                continue
            try:
                step_value = int(float(value))
            except Exception:
                continue
            if step_value > 0:
                return step_value
    return None


def switch_scene_theme_standard_generation_defaults(state, theme=None):
    scenes = state.get("scene_frontend", {}) if isinstance(state, dict) else {}
    resolved_theme = _resolve_scene_theme_name(scenes, theme)
    step_value = _scene_generation_step_default(state, resolved_theme, None)
    if step_value is None:
        step_value = _state_standard_generation_step_default(state)
    if isinstance(state, dict) and resolved_theme:
        state["scene_theme"] = resolved_theme
    update = _scene_generation_step_update_props(state, resolved_theme)
    update["interactive"] = not _scene_standard_steps_readonly(state)
    if step_value is None:
        return gr_update(**update)
    update["value"] = step_value
    return gr_update(**update)


def switch_scene_theme_select_with_standard_generation_defaults(state, theme=None):
    state = switch_scene_theme_select(state, theme)
    return state, switch_scene_theme_standard_generation_defaults(state, theme)


def switch_scene_theme_ready_to_gen(state, image_number, canvas_image, input_image1, additional_prompt, additional_prompt_2, theme=None, video=None, audio=None):
    scenes = state.get("scene_frontend",{})
    requested_theme = _resolve_scene_theme_name(scenes, theme)
    theme = requested_theme or _resolve_active_scene_theme(state, theme)
    visible = scene_disvisible_with_optional_inputs(scenes)
    input_image_number = 1 if 'scene_canvas_image' not in visible or 'scene_input_image1' not in visible else 0
    input_image_number = 2 if 'scene_canvas_image' not in visible and 'scene_input_image1' not in visible else input_image_number
    refer_image_number = sum(1 for slot in SCENE_INPUT_IMAGE_SLOTS if slot not in visible)

    canvas_visible = 'scene_canvas_image' not in visible
    input_image1_visible = 'scene_input_image1' not in visible
    video_visible = 'scene_video' not in visible
    audio_visible = 'scene_audio' not in visible

    canvas_img = extract_scene_image(canvas_image)
    input_img = extract_scene_image(input_image1)

    ready_to_gen = False
    if input_image_number == 1:
        if canvas_visible and canvas_img is not None:
            ready_to_gen = True
        elif input_image1_visible and input_img is not None:
            ready_to_gen = True
    elif input_image_number == 2:
        if canvas_visible and canvas_img is not None :
            ready_to_gen = True

    if video_visible and video is not None:
        ready_to_gen = True
    if audio_visible and audio is not None:
        ready_to_gen = True

    use_image = None
    if not canvas_visible:
        if input_img is not None:
            use_image = input_img
        elif canvas_img is not None:
            use_image = canvas_img
    else:
        if canvas_img is not None:
            use_image = canvas_img
        elif input_img is not None:
            use_image = input_img

    # A theme's preset prompt is independent of whether the current media is
    # ready for generation. Keep the prompt selector in sync even when the
    # image check cannot pass yet; only the Generate button should depend on
    # ready_to_gen.
    describe_prompt, img_is_ok = describe_prompt_for_scene(
        state,
        use_image,
        theme,
        f'{additional_prompt}{additional_prompt_2}',
    )
    task_method = scenes.get("task_method", {}).get(theme, "")
    if "infinitetalk" in (task_method or "").lower():
        return describe_prompt if describe_prompt else gr_update(), gr_update(interactive=bool(use_image is not None and audio is not None and img_is_ok))
    return describe_prompt if describe_prompt else gr_update(), gr_update(interactive=True if not ready_to_gen else img_is_ok)


def switch_scene_theme(state, image_number, canvas_image, input_image1, additional_prompt, additional_prompt_2, video_duration, var_number, var_number2, var_number3, var_number4, var_number5, var_number6, var_number7, var_number8, var_number9, var_number10, scene_steps, switch_option1, switch_option2, switch_option3, switch_option4, theme=None):
    scenes = state.get("scene_frontend",{})
    theme = _resolve_scene_theme_name(scenes, theme)
    visible = scene_disvisible_with_optional_inputs(scenes)
    inter = scenes.get('disinteractive', [])
    input_image_number = 1 if 'scene_canvas_image' not in visible or 'scene_input_image1' not in visible else 0
    input_image_number = 2 if 'scene_canvas_image' not in visible and 'scene_input_image1' not in visible else input_image_number
    refer_image_number = sum(1 for slot in SCENE_INPUT_IMAGE_SLOTS if slot not in visible)
    switch_flag = state.get("switch_scene_theme", False)
    canvas_img = extract_scene_image(canvas_image)
    input_img = extract_scene_image(input_image1)
    ready_to_gen = True if switch_flag and ((input_image_number==1 and (('scene_canvas_image' not in visible and canvas_img is not None) or ('scene_input_image1' not in visible and input_img is not None))) or (input_image_number==2 and (('scene_canvas_image' not in visible and canvas_img is not None) and ('scene_input_image1' not in visible and input_img is not None)))) else False
    #print(f'input_image_number={input_image_number}, ready_to_gen={ready_to_gen}, switch_flag={switch_flag}')
    ui_lines = 0
    ui_lines += 0 if 'scene_theme' in visible and 'scene_additional_prompt' in visible else 1.0
    ui_lines += 0 if 'scene_additional_prompt_2' in visible else 1.0
    ui_lines += 0 if 'scene_aspect_ratio' in visible else 1.0
    ui_lines += 0 if 'scene_video_duration' in visible else 1.0
    ui_lines += 0 if 'scene_var_number' in visible else 1.0
    ui_lines += 0 if 'scene_var_number2' in visible else 1.0
    ui_lines += 0 if 'scene_var_number3' in visible else 1.0
    ui_lines += 0 if 'scene_var_number4' in visible else 1.0
    ui_lines += 0 if 'scene_var_number5' in visible else 1.0
    ui_lines += 0 if 'scene_var_number6' in visible else 1.0
    var_number7_10_visible = (
        'scene_var_number7' not in visible or
        'scene_var_number8' not in visible or
        'scene_var_number9' not in visible or
        'scene_var_number10' not in visible
    )
    ui_lines += 1.0 if var_number7_10_visible else 0
    ui_lines += 0 if 'scene_steps' in visible else 1.0
    ui_lines += 0 if 'scene_image_number' in visible else 0.83
    
    canvas_height = int(545 - ui_lines * 82.6) if input_image_number==1 else int(325 - ui_lines * 41)
    input_height = int(545 - ui_lines * 82.6) if input_image_number==1 else int(245 - ui_lines * 41)
    input_height = int((input_height * 2) / 3) if input_image_number==1 and refer_image_number>=2 else input_height
    if input_image_number == 1:
        canvas_height = max(canvas_height, 250)
        input_height = max(input_height, 200)
    else:
        canvas_height = max(canvas_height, 200)
        input_height = max(input_height, 180)
    if simpai_ui_trace_enabled():
        try:
            logger.info(
                f"[UI-TRACE] switch_scene_theme | theme={theme!r}, switch_flag={switch_flag}, "
                f"input_image_number={input_image_number}, canvas_height={canvas_height}, input_height={input_height}, "
                f"disvisible_count={len(visible) if isinstance(visible, list) else -1}"
            )
        except Exception:
            pass
    results = [gr_update(interactive=True)]
    results.append(gr_update(value=None, height=input_height) if not switch_flag else gr_update(height=input_height))
    results.append(gr_update(value=None, height=input_height) if not switch_flag else gr_update(height=input_height))
    results.append(gr_update(value=None, height=input_height) if not switch_flag else gr_update(height=input_height))
    results.append(gr_update(value=None, height=input_height) if not switch_flag else gr_update(height=input_height))
    themes = scenes.get('theme', [])
    index = themes.index(theme) if theme and themes and theme in themes else 0
    title = scene_localized_text(state, scenes, 'additional_prompt_title', '')
    additional_prompt_default = modules.flags.get_value_by_scene_theme(state, theme, 'additional_prompt', '')
    results.append(get_layout_update_label_inter(title, additional_prompt if ready_to_gen and switch_flag else additional_prompt_default, 'scene_additional_prompt', inter))
    title_2 = scene_localized_text(state, scenes, 'additional_prompt_title_2', '')
    additional_prompt_2_default = modules.flags.get_value_by_scene_theme(state, theme, 'additional_prompt_2', '')
    results.append(get_layout_update_label_inter(title_2, additional_prompt_2 if ready_to_gen and switch_flag else additional_prompt_2_default, 'scene_additional_prompt_2', inter))

    video_duration_title = scene_localized_text(state, scenes, 'video_duration_title', 'Video Duration(s)')
    video_duration_min = scenes.get('video_duration_min', 0.1)
    video_duration_max = scenes.get('video_duration_max', 60.0)
    video_duration_default = modules.flags.get_value_by_scene_theme(state, theme, 'video_duration', 5.0)
    results.append(get_scene_safe_update('scene_video_duration', video_duration_default if switch_flag else video_duration, visible, inter, label=video_duration_title, minimum=video_duration_min, maximum=video_duration_max, step=0.1))

    var_number_title = scene_localized_text(state, scenes, 'var_number_title', 'Duration(s)')
    var_number_max = scenes.get('var_number_max', 10)
    var_number_min = scenes.get('var_number_min', 0)
    var_number_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number', 0)
    var_number = var_number_default if switch_flag else var_number
    results.append(get_scene_safe_update('scene_var_number', var_number, visible, inter, label=var_number_title, minimum=var_number_min, maximum=var_number_max))

    var_number2_title = scene_localized_text(state, scenes, 'var_number2_title', 'Int Value 2')
    var_number2_min = scenes.get('var_number2_min', 0)
    var_number2_max = scenes.get('var_number2_max', 10)
    var_number2_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number2', 1)
    results.append(get_scene_safe_update('scene_var_number2', var_number2_default if switch_flag else var_number2, visible, inter, label=var_number2_title, minimum=var_number2_min, maximum=var_number2_max))

    var_number3_title = scene_localized_text(state, scenes, 'var_number3_title', 'Float Value 1')
    var_number3_min = scenes.get('var_number3_min', 0.0)
    var_number3_max = scenes.get('var_number3_max', 1.0)
    var_number3_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number3', 0.0)
    results.append(get_scene_safe_update('scene_var_number3', var_number3_default if switch_flag else var_number3, visible, inter, label=var_number3_title, minimum=var_number3_min, maximum=var_number3_max))

    var_number4_title = scene_localized_text(state, scenes, 'var_number4_title', 'Float Value 2')
    var_number4_min = scenes.get('var_number4_min', 0.0)
    var_number4_max = scenes.get('var_number4_max', 1.0)
    var_number4_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number4', 0.0)
    results.append(get_scene_safe_update('scene_var_number4', var_number4_default if switch_flag else var_number4, visible, inter, label=var_number4_title, minimum=var_number4_min, maximum=var_number4_max))

    var_number5_title = scene_localized_text(state, scenes, 'var_number5_title', 'Float Value 3')
    var_number5_min = scenes.get('var_number5_min', 0.0)
    var_number5_max = scenes.get('var_number5_max', 1.0)
    var_number5_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number5', 0.0)
    results.append(get_scene_safe_update('scene_var_number5', var_number5_default if switch_flag else var_number5, visible, inter, label=var_number5_title, minimum=var_number5_min, maximum=var_number5_max))

    var_number6_title = scene_localized_text(state, scenes, 'var_number6_title', 'Float Value 4')
    var_number6_min = scenes.get('var_number6_min', 0.0)
    var_number6_max = scenes.get('var_number6_max', 1.0)
    var_number6_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number6', 0.0)
    results.append(get_scene_safe_update('scene_var_number6', var_number6_default if switch_flag else var_number6, visible, inter, label=var_number6_title, minimum=var_number6_min, maximum=var_number6_max))

    var_number7_title = scene_localized_text(state, scenes, 'var_number7_title', 'Int Value 3')
    var_number7_min = scenes.get('var_number7_min', 0)
    var_number7_max = scenes.get('var_number7_max', 10)
    var_number7_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number7', 0)
    results.append(get_scene_safe_update('scene_var_number7', var_number7_default if switch_flag else var_number7, visible, inter, label=var_number7_title, minimum=var_number7_min, maximum=var_number7_max))

    var_number8_title = scene_localized_text(state, scenes, 'var_number8_title', 'Int Value 4')
    var_number8_min = scenes.get('var_number8_min', 0)
    var_number8_max = scenes.get('var_number8_max', 10)
    var_number8_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number8', 0)
    results.append(get_scene_safe_update('scene_var_number8', var_number8_default if switch_flag else var_number8, visible, inter, label=var_number8_title, minimum=var_number8_min, maximum=var_number8_max))

    var_number9_title = scene_localized_text(state, scenes, 'var_number9_title', 'Int Value 5')
    var_number9_min = scenes.get('var_number9_min', 0)
    var_number9_max = scenes.get('var_number9_max', 10)
    var_number9_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number9', 0)
    results.append(get_scene_safe_update('scene_var_number9', var_number9_default if switch_flag else var_number9, visible, inter, label=var_number9_title, minimum=var_number9_min, maximum=var_number9_max))

    var_number10_title = scene_localized_text(state, scenes, 'var_number10_title', 'Int Value 6')
    var_number10_min = scenes.get('var_number10_min', 0)
    var_number10_max = scenes.get('var_number10_max', 10)
    var_number10_default = modules.flags.get_value_by_scene_theme(state, theme, 'var_number10', 0)
    results.append(get_scene_safe_update('scene_var_number10', var_number10_default if switch_flag else var_number10, visible, inter, label=var_number10_title, minimum=var_number10_min, maximum=var_number10_max))

    scene_steps_title = scene_localized_text(state, scenes, 'scene_steps_title', 'Scene Steps')
    scene_steps_min = _scene_generation_step_bound(state, theme, "min", scenes.get('scene_steps_min', 1))
    scene_steps_max = _scene_generation_step_bound(state, theme, "max", scenes.get('scene_steps_max', 100))
    scene_steps_default = _scene_generation_step_default(state, theme, 30)
    results.append(get_scene_safe_update('scene_steps', scene_steps_default if switch_flag else scene_steps, visible, inter, label=scene_steps_title, minimum=scene_steps_min, maximum=scene_steps_max, step=1))

    switch_option1_title = scene_localized_text(state, scenes, 'switch_option1_title', 'Switch Option 1')
    switch_option1_default = modules.flags.get_value_by_scene_theme(state, theme, 'switch_option1', False)
    results.append(gr_update(label=switch_option1_title, value=switch_option1_default if switch_flag else switch_option1, interactive='scene_switch_option1' not in inter))

    switch_option2_title = scene_localized_text(state, scenes, 'switch_option2_title', 'Switch Option 2')
    switch_option2_default = modules.flags.get_value_by_scene_theme(state, theme, 'switch_option2', False)
    results.append(gr_update(label=switch_option2_title, value=switch_option2_default if switch_flag else switch_option2, interactive='scene_switch_option2' not in inter))

    switch_option3_title = scene_localized_text(state, scenes, 'switch_option3_title', 'Switch Option 3')
    switch_option3_default = modules.flags.get_value_by_scene_theme(state, theme, 'switch_option3', False)
    results.append(gr_update(label=switch_option3_title, value=switch_option3_default if switch_flag else switch_option3, interactive='scene_switch_option3' not in inter))

    switch_option4_title = scene_localized_text(state, scenes, 'switch_option4_title', 'Switch Option 4')
    switch_option4_default = modules.flags.get_value_by_scene_theme(state, theme, 'switch_option4', False)
    results.append(gr_update(label=switch_option4_title, value=switch_option4_default if switch_flag else switch_option4, interactive='scene_switch_option4' not in inter))

    aspect_ratios = modules.flags.get_value_by_scene_theme(state, theme, 'aspect_ratio', [])
    aspect_ratio_select_mode = state['scene_frontend'].get('aspect_ratio_select_mode', '')
    if ready_to_gen and switch_flag and aspect_ratio_select_mode:
        img = input_img if input_image_number==1 and 'scene_input_image1' not in visible else canvas_img
        if img is not None:
            img = resize_image_by_max_area(img, max_area=1024 * 1024)
        aspect_ratios_new, aspect_ratio = get_auto_candidate(img, aspect_ratios, aspect_ratio_select_mode)
        aspect_ratios = aspect_ratios_new
        if 'auto_match' in aspect_ratio_select_mode:
            aspect_ratios = [aspect_ratio]
        aspect_ratios = modules.flags.normalize_scene_aspect_ratio_list(aspect_ratios)
        aspect_ratio = modules.flags.normalize_scene_aspect_ratio_value(aspect_ratio)
    else:
        aspect_ratios = modules.flags.normalize_scene_aspect_ratio_list(aspect_ratios)
        aspect_ratio = '' if len(aspect_ratios)==0 else aspect_ratios[0]
    results.append(gr_update(value=aspect_ratio, visible="hidden"))
    results.append(get_scene_safe_update('scene_image_number', image_number, visible, inter))
    results.append(modules.flags.get_value_by_scene_theme(state, theme, 'mask_color', "#70FF81"))
    results.append(gr_update())
    results.append(gr_update())
    results.append(gr_update())
    if simpai_ui_trace_enabled():
        try:
            task_method = get_scene_task_method(scenes, theme)
            logger.info(
                f"[UI-TRACE] switch_scene_theme.visibility | theme={theme!r}, task_method={task_method!r}, "
                f"resolution_box={'t2v' in task_method.lower()}, scene_video={'scene_video' not in visible}, "
                f"scene_reference_video={'scene_reference_video' not in visible}, "
                f"scene_audio={'scene_audio' not in visible}, disvisible={visible!r}"
            )
        except Exception:
            pass
    state['scene_theme'] = theme
    state.pop("switch_scene_theme", None)
    return results


def switch_scene_theme_safe(state, image_number, canvas_image, input_image1, additional_prompt, additional_prompt_2, theme=None):
    # Gradio 6 validates component inputs before this function runs. During preset/theme
    # switches, stale scene slider values can be outside the newly applied min/max range
    # (for example scene_steps=20 while Wan-Outpaint has maximum=12). Keep this event
    # path free of slider/dropdown inputs and rebuild scene controls from preset defaults.
    scenes = state.get("scene_frontend", {}) if isinstance(state, dict) else {}
    switch_flag = bool(isinstance(state, dict) and state.get("switch_scene_theme", False))
    resolved_theme = _resolve_active_scene_theme(state, theme)
    if not switch_flag:
        if simpai_ui_trace_enabled():
            try:
                logger.info(
                    f"[UI-TRACE] switch_scene_theme_safe.noop_programmatic_change | "
                    f"theme={resolved_theme!r}, preset={state.get('__preset', None) if isinstance(state, dict) else None!r}"
                )
            except Exception:
                pass
        return [gr_update()] * SCENE_SWITCH_OUTPUT_COUNT
    results = get_scene_aux_control_updates(scenes, resolved_theme) + get_scene_resolution_override_updates(scenes, resolved_theme) + switch_scene_theme(
        state,
        image_number,
        canvas_image,
        input_image1,
        additional_prompt,
        additional_prompt_2,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        False,
        False,
        False,
        False,
        resolved_theme,
    )
    expected = SCENE_SWITCH_OUTPUT_COUNT
    if len(results) != expected:
        logger.error(
            f"[UI-TRACE] switch_scene_theme_safe.output_mismatch | "
            f"theme={resolved_theme!r}, expected={expected}, actual={len(results)}"
        )
    return results


def switch_layout_template(presetdata: dict | str, state_params, preset_url='', defer_file_choices=False, fast_nav=False, omit_scene_outputs=False):
    presetdata_dict = presetdata
    if isinstance(presetdata, str):
        presetdata_dict = json.loads(presetdata)
    assert isinstance(presetdata_dict, dict)
    enginedata_dict = presetdata_dict.get('engine', {})
    is_scene_frontend = 'scene_frontend' in enginedata_dict
    engine_display_str = presetdata_dict.get('Backend Engine', presetdata_dict.get('backend_engine',
        task_class_mapping[enginedata_dict.get('backend_engine', 'Fooocus')]))
    template_engine = _resolve_backend_engine_key(engine_display_str)
    default_params = default_class_params[template_engine]
    visible = enginedata_dict.get('disvisible', default_params.get('disvisible', default_class_params['Fooocus']['disvisible']))
    inter = enginedata_dict.get('disinteractive', default_params.get('disinteractive', default_class_params['Fooocus']['disinteractive']))
    # Copy to avoid mutating cached preset/default lists across preset switches.
    visible = list(visible) if isinstance(visible, list) else []
    inter = list(inter) if isinstance(inter, list) else []
    sampler_list = enginedata_dict.get('available_sampler_name', default_params.get('available_sampler_name', default_class_params['Fooocus']['available_sampler_name']))
    scheduler_list = enginedata_dict.get('available_scheduler_name', default_params.get('available_scheduler_name', default_class_params['Fooocus']['available_scheduler_name']))
    uov_method_list = enginedata_dict.get('available_uov_method', default_params.get('available_uov_method', default_class_params['Fooocus']['available_uov_method']))
    uov_method_list = [method for method in uov_method_list if method != 'Vary (Hires.fix)']

    def _preset_str_value(*keys):
        for key in keys:
            value = presetdata_dict.get(key)
            if isinstance(value, str):
                return value
        return None

    def _preset_float_value(*keys):
        for key in keys:
            value = presetdata_dict.get(key)
            if value is None:
                continue
            try:
                return float(value)
            except Exception:
                continue
        return None

    def _preset_steps_value():
        try:
            steps = int(presetdata_dict.get('steps', presetdata_dict.get('Steps')))
            performance_name = str(presetdata_dict.get('performance', '')).replace(' ', '_').replace('-', '_').casefold()
            performance_candidates = [
                key for key in Steps.keys()
                if key.casefold() == performance_name and Steps[key] == steps
            ]
            return -1 if performance_candidates else steps
        except Exception:
            return -1

    def _layout_value_visible_inter(value, control_name, visible_items, interactive_items):
        if value is None:
            return get_layout_visible_inter(control_name, visible_items, interactive_items)
        return gr_update(value=value, visible=control_name not in visible_items, interactive=control_name not in interactive_items)

    def _layout_overwrite_step_update(value, visible_items, interactive_items):
        readonly = is_scene_frontend and _scene_standard_steps_readonly(enginedata_dict)
        update = {
            "visible": "overwrite_step" not in visible_items,
            "interactive": "overwrite_step" not in interactive_items and not readonly,
            "minimum": -1,
            "maximum": 200,
            "step": 1,
        }
        if is_scene_frontend:
            update.update(_scene_generation_step_update_props(enginedata_dict, scene_theme_default))
        if value is not None:
            update["value"] = value
        return gr_update(**update)

    def _layout_dropdown_value_visible_inter(choices, value, control_name, visible_items, interactive_items):
        update = {
            "choices": choices,
            "visible": control_name not in visible_items,
            "interactive": control_name not in interactive_items,
        }
        if value is not None:
            update["value"] = value
        return dropdown_update(**update) if value is not None else gr_update(**update)

    if template_engine == 'Fooocus':
        params_backend = dict(modules.flags.get_engine_default_backend_params(template_engine))
    else:
        params_backend = dict(enginedata_dict.get('backend_params', modules.flags.get_engine_default_backend_params(template_engine)))
    scene_theme_default = None
    if ':' in engine_display_str:
        params_backend.update(dict(task_method=engine_display_str.split(':')[1]))
    if is_scene_frontend:
        scenes = enginedata_dict.get("scene_frontend", {})
        preset_name = str(presetdata_dict.get("preset") or state_params.get("__preset") or "").strip()
        theme_owner = str(state_params.get("__scene_theme_preset") or "").strip()
        preferred_theme = state_params.get("scene_theme") if preset_name and theme_owner == preset_name else None
        scene_theme_default = _resolve_scene_theme_name(scenes, preferred_theme)
        scene_task_method = get_scene_task_method(scenes, scene_theme_default)
        if scene_task_method:
            params_backend.update(dict(task_method=scene_task_method))
    preset_clip_model = (
        presetdata_dict.get('clip_model')
        or presetdata_dict.get('CLIP Model')
        or presetdata_dict.get('default_clip_model')
        or params_backend.get('clip_model')
        or modules.config.default_clip_model
    )
    preset_upscale_model = (
        presetdata_dict.get('upscale_model')
        or presetdata_dict.get('Upscale Model')
        or presetdata_dict.get('default_upscale_model')
        or params_backend.get('upscale_model')
        or modules.config.default_upscale_model
    )
    if preset_clip_model and preset_clip_model not in (default_clip, 'Default (model)', 'auto'):
        params_backend.update({"clip_model": str(preset_clip_model).replace('\\', os.sep).replace('/', os.sep)})
    else:
        params_backend.pop('clip_model', None)
    if preset_upscale_model:
        params_backend.update({"upscale_model": str(preset_upscale_model).replace('\\', os.sep).replace('/', os.sep)})
    params_backend.update(dict(
            nickname=state_params["user"].get_nickname(),
            user_did=state_params["user"].get_did(),
            translation_methods=modules.config.default_translation_methods,
            backfill_prompt=modules.config.default_backfill_prompt,
            comfyd_active_checkbox=modules.config.default_comfyd_active_checkbox,
            backend_engine=template_engine 
            ))

    task_method = params_backend.get('task_method', None)
    if not defer_file_choices:
        modules.config.update_files(template_engine, task_method)
        base_model_list = modules.config.get_base_model_list(template_engine, task_method)
        base_model_list = ensure_dropdown_choices_include_values(
            base_model_list,
            presetdata_dict.get('base_model'),
            presetdata_dict.get('Base Model'),
            presetdata_dict.get('default_model'),
        )
    else:
        base_model_list = None
    if simpai_ui_trace_enabled():
        logger.info("[UI-TRACE] template_engine:%s", template_engine)

    engine_class_display = resolve_engine_class_display(template_engine, task_method)
    preset_base_model = presetdata_dict.get('base_model') or presetdata_dict.get('Base Model') or presetdata_dict.get('default_model')
    preset_base_model = _resolve_previous_default_base_model(presetdata_dict, preset_base_model)
    preset_refiner_model = presetdata_dict.get('refiner_model') or presetdata_dict.get('Refiner Model') or presetdata_dict.get('default_refiner')
    preset_refiner_model = _resolve_previous_default_refiner_model(presetdata_dict, preset_refiner_model)
    preset_negative_prompt = _preset_str_value('negative_prompt', 'Negative Prompt')
    preset_performance = _preset_str_value('performance', 'Performance')
    preset_steps = _preset_steps_value()
    if is_scene_frontend:
        scene_steps_default = _scene_generation_step_default(enginedata_dict.get("scene_frontend", {}), scene_theme_default, None)
        if scene_steps_default is not None:
            preset_steps = scene_steps_default
    preset_guidance_scale = _preset_float_value('guidance_scale', 'Guidance Scale')
    preset_sampler = _preset_str_value('sampler', 'Sampler')
    preset_scheduler = _preset_str_value('scheduler', 'Scheduler')

    results = [params_backend]
    mobile_advanced_collapsed = bool(state_params.get("__is_mobile", False))
    if is_scene_frontend:
        results.append(gr_update(
            value=not mobile_advanced_collapsed,
            visible=True,
            interactive=True,
        ))
    elif mobile_advanced_collapsed:
        results.append(gr_update(
            value=False,
            visible='advanced_checkbox' not in visible,
            interactive='advanced_checkbox' not in inter,
        ))
    else:
        results.append(get_layout_invert_visible_inter('advanced_checkbox', visible, inter))
    results.append(gr_update(value=preset_performance) if preset_performance is not None else gr.skip())
    results.append(_layout_dropdown_value_visible_inter(scheduler_list, preset_scheduler, 'scheduler_name', visible, inter))
    results.append(_layout_dropdown_value_visible_inter(sampler_list, preset_sampler, 'sampler_name', visible, inter))
    results.append(get_layout_toggle_visible_inter('input_image_checkbox', visible, inter))
    if is_scene_frontend:
        if 'prompt_panel_checkbox' in visible:
            visible.remove('prompt_panel_checkbox')
        if 'prompt_panel_checkbox' in inter:
            inter.remove('prompt_panel_checkbox')
    results.append(get_layout_toggle_visible_inter('prompt_panel_checkbox', visible, inter))
    enhance_checkbox_value = _value_with_default_alias(presetdata_dict, 'enhance_checkbox', False)
    results.append(get_layout_update_and_visible_inter(enhance_checkbox_value, 'enhance_checkbox', visible, inter))
    if is_scene_frontend:
        scenes = enginedata_dict.get("scene_frontend", {})
        scenes_visible = scene_disvisible_with_optional_inputs(scenes)
        visible.extend(scenes_visible)
        scenes_inter = scenes.get('disinteractive', [])
        scenes_inter = list(scenes_inter) if isinstance(scenes_inter, list) else []
        inter.extend(scenes_inter)
        for scene_name, main_name in [('scene_base_model', 'base_model'), ('scene_refiner_model', 'refiner_model')]:
            if scene_name in visible and main_name not in visible:
                visible.append(main_name)
            if scene_name in inter and main_name not in inter:
                inter.append(main_name)
    minimal_base_model_list = ensure_dropdown_choices_include_values([], preset_base_model)
    minimal_refiner_model = preset_refiner_model or 'None'
    minimal_refiner_model_list = ensure_dropdown_choices_include_values(['None'], minimal_refiner_model)
    if is_scene_frontend:
        if defer_file_choices:
            results.append(dropdown_update(choices=minimal_base_model_list, value=preset_base_model, visible='base_model' not in visible, interactive='base_model' not in inter))
        else:
            results.append(dropdown_update(choices=base_model_list, value=preset_base_model, visible='base_model' not in visible, interactive='base_model' not in inter))
        if defer_file_choices:
            results.append(dropdown_update(choices=minimal_refiner_model_list, value=minimal_refiner_model, visible='refiner_model' not in visible, interactive='refiner_model' not in inter))
        else:
            results.append(gr_update(value=preset_refiner_model, visible='refiner_model' not in visible, interactive='refiner_model' not in inter))
    else:
        if defer_file_choices:
            results.append(dropdown_update(choices=minimal_base_model_list, value=preset_base_model, visible='base_model' not in visible, interactive='base_model' not in inter))
        else:
            results.append(_layout_dropdown_value_visible_inter(base_model_list, preset_base_model, 'base_model', visible, inter))
        if defer_file_choices:
            results.append(dropdown_update(choices=minimal_refiner_model_list, value=minimal_refiner_model, visible='refiner_model' not in visible, interactive='refiner_model' not in inter))
        else:
            results.append(_layout_value_visible_inter(preset_refiner_model, 'refiner_model', visible, inter))
    results.append(_layout_overwrite_step_update(preset_steps, visible, inter))
    results.append(_layout_value_visible_inter(preset_guidance_scale, 'guidance_scale', visible, inter))
    if preset_negative_prompt is not None:
        results.append(gr_update(value=preset_negative_prompt, visible='negative_prompt' not in visible, interactive='negative_prompt' not in inter))
    else:
        results.append(get_layout_empty_visible_inter_text('negative_prompt', visible, inter))
    preset_instruction_visible = False
    try:
        preset_instruction_visible = os.path.basename(str(preset_url).split('?', 1)[0].replace('\\', '/')) != 'blank.inc.html'
    except Exception:
        preset_instruction_visible = False
    results.append(gr_update(visible=preset_instruction_visible))
    results.append(gr_update(visible=False)) # identity_dialog
    state_params['identity_dialog'] = False

    # [engine_class_display, uov_method, enhance_checkbox, enhance_input_image]
    results.append(engine_class_display)
    results.append(get_layout_setting_choices_visible_inter(uov_method_list, modules.flags.disabled, 'uov_method', visible, inter))
    results.append(get_layout_toggle_visible_inter('enhance_checkbox', visible, inter))
    results.append(get_layout_empty_visible_inter_image('enhance_input_image', visible, inter))
    if defer_file_choices and fast_nav:
        results += [skip_update()] * (modules.config.default_max_lora_number * 3)
    else:
        if defer_file_choices:
            results += get_layout_visible_inter_loras(visible, inter, modules.config.default_max_lora_number)
        else:
            lora_choices = ['None'] + modules.config.lora_filenames
            results += get_layout_visible_inter_loras_with_choices(visible, inter, modules.config.default_max_lora_number, lora_choices)

    #[output_format, inpaint_advanced_masking_checkbox, mixing_image_prompt_and_vary_upscale, mixing_image_prompt_and_inpaint, backfill_prompt, translation_methods, input_image_checkbox]
    # if default_X in config_prese then update the value to gr.X else update with default value in ads.default[X]
    update_value_if_existed = lambda x: gr_update() if x not in presetdata_dict else presetdata_dict[x]
    engine_type = enginedata_dict.get('engine_type', '')
    if engine_type == 'video':
        results.append(gr_update(visible=False))
    else:
        results.append(gr_update(visible=True))
    results.append(update_value_if_existed("inpaint_advanced_masking_checkbox"))
    results.append(update_value_if_existed("mixing_image_prompt_and_vary_upscale"))
    results.append(update_value_if_existed("mixing_image_prompt_and_inpaint"))
    results.append(update_value_if_existed("backfill_prompt"))
    results.append(update_value_if_existed("translation_methods"))
    results.append(False if template_engine not in ['Fooocus', 'Comfy'] and task_method and '_aio' not in task_method else update_value_if_existed("input_image_checkbox"))
    quick_enhance_value = _value_with_default_alias(presetdata_dict, 'quick_enhance', False)
    if engine_type == 'video':
        results.append(gr_update(value=False, visible=False))
    else:
        results.append(gr_update(value=bool(quick_enhance_value), visible=True))

    def _finish_results():
        state_params.pop("switch_scene_theme", None)

        if 'image_catalog_max_number' in presetdata_dict:
            state_params.update({'__max_catalog': presetdata_dict['image_catalog_max_number']})

        return results

    if omit_scene_outputs:
        return _finish_results()

    # [prompt_internal_panel, disable_intermediate_results, image_tools_checkbox, scene_panel, scene_theme], [generate_button, load_parameter_button]
    if is_scene_frontend:
        scenes = enginedata_dict.get("scene_frontend",{})
        results.append(gr_update(visible=True))    #prompt_internal_panel
        results.append(gr_update(visible=True, interactive=True, value="Prompt Picks"))  #random_button
        results.append(gr_update(visible=True, interactive=False, value="Prompt Tools"))  #super_prompter
        results.append(skip_update())  # disable_intermediate_results is a user setting
        results.append(skip_update())  # image_tools_checkbox is a user setting
        results.append(gr_update(visible=True))
        themes = scenes.get('theme', [])
        if isinstance(themes, str):
            themes = [themes] if themes else []
        if isinstance(themes, (list, tuple)):
            themes = [theme for theme in themes if isinstance(theme, str) and theme]
        theme_default = scene_theme_default if scene_theme_default in themes else (themes[0] if themes else None)
        themes_title = scene_localized_text(state_params, scenes, 'theme_title', '')
        scene_theme_update = get_layout_update_label_and_choice_visible_inter(themes_title, themes, theme_default, 'scene_theme', visible, inter)
        results.append(scene_theme_update)
        if simpai_ui_trace_enabled():
            try:
                logger.info(
                    f"[UI-TRACE] switch_layout_template.scene_theme_update | preset={presetdata_dict.get('preset', None)!r}, "
                    f"theme={theme_default!r}, choices={themes!r}, update={scene_theme_update!r}, local_index={len(results) - 1}"
                )
            except Exception:
                pass
        results += get_scene_aux_control_updates(scenes, theme_default)

        task_method = get_scene_task_method(scenes, theme_default)
        scene_resolution_start = len(results)
        results += get_scene_resolution_override_updates(scenes, theme_default)
        if simpai_ui_trace_enabled():
            try:
                logger.info(
                    f"[UI-TRACE] switch_layout_template.scene_visibility | preset={presetdata_dict.get('preset', None)!r}, "
                    f"theme={theme_default!r}, task_method={task_method!r}, resolution_box={'t2v' in task_method.lower()}, "
                    f"scene_video={'scene_video' not in visible}, scene_reference_video={'scene_reference_video' not in visible}, "
                    f"scene_audio={'scene_audio' not in visible}, "
                    f"resolution_output_index={scene_resolution_start}"
                )
            except Exception:
                pass

        results.append(gr_update(interactive=True))
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())

        title = scene_localized_text(state_params, scenes, 'additional_prompt_title', '')
        results.append(get_layout_update_label_inter(title, modules.flags.get_value_by_scene_theme(state_params, theme_default, 'additional_prompt', ''), 'scene_additional_prompt', inter))

        title_2 = scene_localized_text(state_params, scenes, 'additional_prompt_title_2', '')
        results.append(get_layout_update_label_inter(title_2, modules.flags.get_value_by_scene_theme(state_params, theme_default, 'additional_prompt_2', ''), 'scene_additional_prompt_2', inter))

        video_duration_title = scene_localized_text(state_params, scenes, 'video_duration_title', 'Video Duration(s)')
        video_duration_min = scenes.get('video_duration_min', 0.1)
        video_duration_max = scenes.get('video_duration_max', 60.0)
        results.append(get_scene_safe_update(
            'scene_video_duration',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'video_duration', 5.0),
            visible,
            inter,
            label=video_duration_title,
            minimum=video_duration_min,
            maximum=video_duration_max,
            step=0.1,
        ))

        var_number_title = scene_localized_text(state_params, scenes, 'var_number_title', 'Duration(s)')
        var_number_min = scenes.get('var_number_min', 0)
        var_number_max = scenes.get('var_number_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number', 0),
            visible,
            inter,
            label=var_number_title,
            minimum=var_number_min,
            maximum=var_number_max,
        ))

        var_number2_title = scene_localized_text(state_params, scenes, 'var_number2_title', 'Int Value 2')
        var_number2_min = scenes.get('var_number2_min', 0)
        var_number2_max = scenes.get('var_number2_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number2',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number2', 1),
            visible,
            inter,
            label=var_number2_title,
            minimum=var_number2_min,
            maximum=var_number2_max,
        ))

        var_number3_title = scene_localized_text(state_params, scenes, 'var_number3_title', 'Float Value 1')
        var_number3_min = scenes.get('var_number3_min', 0.0)
        var_number3_max = scenes.get('var_number3_max', 1.0)
        results.append(get_scene_safe_update(
            'scene_var_number3',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number3', 0.0),
            visible,
            inter,
            label=var_number3_title,
            minimum=var_number3_min,
            maximum=var_number3_max,
        ))

        var_number4_title = scene_localized_text(state_params, scenes, 'var_number4_title', 'Float Value 2')
        var_number4_min = scenes.get('var_number4_min', 0.0)
        var_number4_max = scenes.get('var_number4_max', 1.0)
        results.append(get_scene_safe_update(
            'scene_var_number4',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number4', 0.0),
            visible,
            inter,
            label=var_number4_title,
            minimum=var_number4_min,
            maximum=var_number4_max,
        ))

        var_number5_title = scene_localized_text(state_params, scenes, 'var_number5_title', 'Float Value 3')
        var_number5_min = scenes.get('var_number5_min', 0.0)
        var_number5_max = scenes.get('var_number5_max', 1.0)
        results.append(get_scene_safe_update(
            'scene_var_number5',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number5', 0.0),
            visible,
            inter,
            label=var_number5_title,
            minimum=var_number5_min,
            maximum=var_number5_max,
        ))

        var_number6_title = scene_localized_text(state_params, scenes, 'var_number6_title', 'Float Value 4')
        var_number6_min = scenes.get('var_number6_min', 0.0)
        var_number6_max = scenes.get('var_number6_max', 1.0)
        results.append(get_scene_safe_update(
            'scene_var_number6',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number6', 0.0),
            visible,
            inter,
            label=var_number6_title,
            minimum=var_number6_min,
            maximum=var_number6_max,
        ))

        var_number7_title = scene_localized_text(state_params, scenes, 'var_number7_title', 'Int Value 3')
        var_number7_min = scenes.get('var_number7_min', 0)
        var_number7_max = scenes.get('var_number7_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number7',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number7', 0),
            visible,
            inter,
            label=var_number7_title,
            minimum=var_number7_min,
            maximum=var_number7_max,
        ))

        var_number8_title = scene_localized_text(state_params, scenes, 'var_number8_title', 'Int Value 4')
        var_number8_min = scenes.get('var_number8_min', 0)
        var_number8_max = scenes.get('var_number8_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number8',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number8', 0),
            visible,
            inter,
            label=var_number8_title,
            minimum=var_number8_min,
            maximum=var_number8_max,
        ))

        var_number9_title = scene_localized_text(state_params, scenes, 'var_number9_title', 'Int Value 5')
        var_number9_min = scenes.get('var_number9_min', 0)
        var_number9_max = scenes.get('var_number9_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number9',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number9', 0),
            visible,
            inter,
            label=var_number9_title,
            minimum=var_number9_min,
            maximum=var_number9_max,
        ))

        var_number10_title = scene_localized_text(state_params, scenes, 'var_number10_title', 'Int Value 6')
        var_number10_min = scenes.get('var_number10_min', 0)
        var_number10_max = scenes.get('var_number10_max', 10)
        results.append(get_scene_safe_update(
            'scene_var_number10',
            modules.flags.get_value_by_scene_theme(state_params, theme_default, 'var_number10', 0),
            visible,
            inter,
            label=var_number10_title,
            minimum=var_number10_min,
            maximum=var_number10_max,
        ))

        scene_steps_title = scene_localized_text(state_params, scenes, 'scene_steps_title', 'Scene Steps')
        scene_steps_min = _scene_generation_step_bound(state_params, theme_default, "min", scenes.get('scene_steps_min', 1))
        scene_steps_max = _scene_generation_step_bound(state_params, theme_default, "max", scenes.get('scene_steps_max', 100))
        results.append(get_scene_safe_update(
            'scene_steps',
            _scene_generation_step_default(state_params, theme_default, 30),
            visible,
            inter,
            label=scene_steps_title,
            minimum=scene_steps_min,
            maximum=scene_steps_max,
            step=1,
        ))

        switch_option1_title = scene_localized_text(state_params, scenes, 'switch_option1_title', 'Switch Option 1')
        results.append(gr_update(label=switch_option1_title, value=modules.flags.get_value_by_scene_theme(state_params, theme_default, 'switch_option1', False), interactive='scene_switch_option1' not in inter))

        switch_option2_title = scene_localized_text(state_params, scenes, 'switch_option2_title', 'Switch Option 2')
        results.append(gr_update(label=switch_option2_title, value=modules.flags.get_value_by_scene_theme(state_params, theme_default, 'switch_option2', False), interactive='scene_switch_option2' not in inter))

        switch_option3_title = scene_localized_text(state_params, scenes, 'switch_option3_title', 'Switch Option 3')
        results.append(gr_update(label=switch_option3_title, value=modules.flags.get_value_by_scene_theme(state_params, theme_default, 'switch_option3', False), interactive='scene_switch_option3' not in inter))

        switch_option4_title = scene_localized_text(state_params, scenes, 'switch_option4_title', 'Switch Option 4')
        results.append(gr_update(label=switch_option4_title, value=modules.flags.get_value_by_scene_theme(state_params, theme_default, 'switch_option4', False), interactive='scene_switch_option4' not in inter))

        aspect_ratios = modules.flags.get_value_by_scene_theme(state_params, theme_default, 'aspect_ratio', [])
        aspect_ratios = modules.flags.normalize_scene_aspect_ratio_list(aspect_ratios)
        aspect_ratio = '' if len(aspect_ratios) == 0 else aspect_ratios[0]
        results.append(gr_update(value=aspect_ratio, visible="hidden"))

        scene_image_number_default = modules.flags.get_value_by_scene_theme(state_params, theme_default, 'image_number', 1)
        results.append(get_scene_safe_update('scene_image_number', scene_image_number_default, visible, inter))

        results.append(modules.flags.get_value_by_scene_theme(state_params, theme_default, 'mask_color', "#70FF81"))
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())

        results.append(gr_update())  # sam3_input_video
        results.append(gr_update())  # sam3_original_video_path
        results.append(gr_update())  # sam3_mask_video
        results.append(gr_update())  # sam3_trim_payload
        results.append(gr_update(visible=True, interactive=True)) #generate_button
        results.append(gr_update(visible=False))                   #load_parameter_button
    else:
        results.append(gr_update(visible=True))    #prompt_internal_panel
        results.append(gr_update(visible=True, interactive=True)) #random_button
        results.append(gr_update(visible=True, value="Prompt Tools"))  #super_prompter
        results.append(skip_update())  # disable_intermediate_results is a user setting
        results.append(skip_update())  # image_tools_checkbox is a user setting
        results.append(gr_update(visible=False))
        results.append(gr_update(visible=True, interactive=True))
        
        scene_child_count = SCENE_SWITCH_OUTPUT_COUNT
        if fast_nav:
            results += [gr_update()] * scene_child_count
        else:
            results += [gr_update(visible=False)] * scene_child_count

        results.append(gr_update())  # sam3_input_video
        results.append(gr_update())  # sam3_original_video_path
        results.append(gr_update())  # sam3_mask_video
        results.append(gr_update())  # sam3_trim_payload
        results.append(gr_update(visible=True, interactive=True))  #generate_button
        results.append(gr_update(visible=False))                   #load_parameter_button
    return _finish_results()

def _get_welcome_preset_asset_names(preset):
    preset_name = str(preset or '').strip()
    if not preset_name:
        return []
    if preset_name.endswith('\u2B07'):
        preset_name = preset_name[:-1].strip()

    names = []
    normalized_name = preset_name.lower().replace(' ', '_')
    for name in (normalized_name, preset_name):
        if name and name not in names:
            names.append(name)
    return names


def get_welcome_image(preset=None, is_mobile=False, is_change=False, no_welcome=False, state_params=None):
    if no_welcome:
        return None
    try:
        from modules import welcome_media

        custom_kind = welcome_media.WAITING_KIND if is_change else welcome_media.TITLE_KIND
        custom_path = welcome_media.resolve_custom_media(state_params, custom_kind, is_mobile)
        if custom_path:
            return custom_path
    except Exception:
        pass
    path_welcome = os.path.abspath(f'./presets/welcome/')
    if preset:
        suffix = 'w' if not is_mobile else 'm'
        for preset_asset_name in _get_welcome_preset_asset_names(preset):
            for extension in ('.jpg', '.jpeg', '.png', '.gif', '.webp'):
                file_welcome = os.path.join(path_welcome, f'welcome_{preset_asset_name}_{suffix}{extension}')
                if os.path.exists(file_welcome):
                    return file_welcome
    if is_change:
        if is_mobile:
            file_welcome = os.path.join(path_welcome, 'welcome_0_m.jpg')
        else:
            file_welcome = os.path.join(path_welcome, 'welcome_0_w.jpg')
        return file_welcome
    file_welcome = os.path.join(path_welcome, 'welcome.png')
    file_suffix = 'welcome_w' if not is_mobile else 'welcome_m'
    welcomes = [p for p in get_files_from_folder(path_welcome, ['.jpg', '.jpeg', '.png', '.gif', '.webp'], file_suffix, None) if not p.startswith('.')]
    if len(welcomes)>0:
        file_welcome = os.path.join(path_welcome, random.choice(welcomes))
    return file_welcome


def load_parameter_button_click(raw_metadata: dict | str, is_generating: bool, inpaint_mode: str, use_resolution_override: bool = False, no_welcome=False, defer_preview_reset=False, state_params=None):
    loaded_parameter_dict = raw_metadata
    if isinstance(raw_metadata, str):
        loaded_parameter_dict = json.loads(raw_metadata)
    assert isinstance(loaded_parameter_dict, dict)
   
    preset = loaded_parameter_dict.get("preset", None)
    is_mobile = loaded_parameter_dict.get("is_mobile", False)
    if defer_preview_reset:
        results = [gr_update(), gr_update(), gr_update(visible=False), gr_update(visible=False), None]
    elif no_welcome:
        results = [gr_update(value=None, visible=True), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), None]
    else:
        results = [gr_update(value=get_welcome_image(preset, is_mobile, no_welcome=no_welcome, state_params=state_params), visible=True), gr_update(visible=False), gr_update(visible=False), gr_update(visible=False), None]

    get_image_number('image_number', 'Image Number', loaded_parameter_dict, results)
    get_str('prompt', 'Prompt', loaded_parameter_dict, results)
    get_str('negative_prompt', 'Negative Prompt', loaded_parameter_dict, results)
    get_list('styles', 'Styles', loaded_parameter_dict, results)
    performance = get_str('performance', 'Performance', loaded_parameter_dict, results)
    get_steps('steps', 'Steps', loaded_parameter_dict, results)
    get_number('overwrite_switch', 'Overwrite Switch', loaded_parameter_dict, results)
    get_resolution('resolution', 'Resolution', loaded_parameter_dict, results, use_resolution_override=use_resolution_override)
    get_resolution_control_defaults(loaded_parameter_dict, results)
    get_number('guidance_scale', 'Guidance Scale', loaded_parameter_dict, results)
    get_number('sharpness', 'Sharpness', loaded_parameter_dict, results)
    get_adm_guidance('adm_guidance', 'ADM Guidance', loaded_parameter_dict, results)
    get_str('refiner_swap_method', 'Refiner Swap Method', loaded_parameter_dict, results)
    get_number('adaptive_cfg', 'CFG Mimicking from TSNR', loaded_parameter_dict, results)
    results.append(skip_update())
    get_str('base_model', 'Base Model', loaded_parameter_dict, results)
    refiner_model_value = get_str('refiner_model', 'Refiner Model', loaded_parameter_dict, results)
    get_number('refiner_switch', 'Refiner Switch', loaded_parameter_dict, results)
    refiner_switch_visible = (
        is_fooocus_backend(loaded_parameter_dict)
        and (refiner_model_value if refiner_model_value is not None else modules.config.default_refiner_model_name) != 'None'
    )
    current_refiner_switch = results[-1]
    if isinstance(current_refiner_switch, (int, float)):
        results[-1] = gr_update(value=current_refiner_switch, visible=refiner_switch_visible)
    else:
        results[-1] = gr_update(visible=refiner_switch_visible)
    get_str('sampler', 'Sampler', loaded_parameter_dict, results)
    get_str('scheduler', 'Scheduler', loaded_parameter_dict, results)
    get_str('clip_model', 'CLIP Model', loaded_parameter_dict, results, default=modules.config.default_clip_model)
    get_str('vae', 'VAE', loaded_parameter_dict, results, default=modules.flags.default_vae)
    get_str('upscale_model', 'Upscale Model', loaded_parameter_dict, results, default=modules.config.default_upscale_model)
    get_seed('seed', 'Seed', loaded_parameter_dict, results)
    get_inpaint_engine_version('inpaint_engine_version', 'Inpaint Engine Version', loaded_parameter_dict, results, inpaint_mode)
    get_inpaint_method('inpaint_method', 'Inpaint Mode', loaded_parameter_dict, results)

    #if is_generating:
    #    results.append(gr_update())
    #else:
    #    results.append(gr_update(visible=True))
    #results.append(gr_update(visible=False))

    get_freeu('freeu', 'FreeU', loaded_parameter_dict, results)

    # prevent performance LoRAs to be added twice, by performance and by lora
    performance_filename = None
    if performance is not None and performance in Performance.values():
        performance = Performance(performance)
        performance_filename = performance.lora_filename()

    for i in range(modules.config.default_max_lora_number):
        get_lora(f'lora_combined_{i + 1}', f'LoRA {i + 1}', loaded_parameter_dict, results, performance_filename)
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_checkbox', False))
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_enabled_1', False))
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_enabled_2', False))
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_enabled_3', False))
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_uov_method', 'Disabled'))
    results.append(_value_with_default_alias(loaded_parameter_dict, 'enhance_uov_strength', 0.2))

    return results


def get_str(key: str, fallback: str | None, source_dict: dict, results: list, default=None) -> str | None:
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert isinstance(h, str)
        results.append(h)
        return h
    except:
        results.append(gr_update())
        return None

def get_list(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    h = None
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        if isinstance(h, str):
            h = eval(h)
        assert isinstance(h, list)
        results.append(h)
    except:
        results.append(gr_update())
    if key in ['styles', 'Styles']:
        if h:
            for k in h:
                if k and 'styles_definition' in source_dict and k not in modules.sdxl_styles.styles and k in source_dict.get('styles_definition', default):
                    modules.sdxl_styles.styles.update({k: source_dict["styles_definition"][k]})


def get_number(key: str, fallback: str | None, source_dict: dict, results: list, default=None, cast_type=float):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert h is not None
        h = cast_type(h)
        results.append(h)
    except:
        results.append(gr_update())


def is_fooocus_backend(source_dict: dict) -> bool:
    try:
        engine = source_dict.get('Backend Engine', source_dict.get('backend_engine', task_class_mapping['Fooocus']))
        if 'engine' in source_dict and isinstance(source_dict['engine'], dict):
            engine = source_dict['engine'].get('backend_engine', engine)
        return (get_taskclass_by_fullname(str(engine)) or str(engine)) == 'Fooocus'
    except Exception:
        return False


def get_image_number(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert h is not None
        h = int(h)
        h = min(h, modules.config.default_max_image_number)
        m = int(source_dict.get('max_image_number', ads.default["max_image_number"]))
        results.append(gr_update(value=h, maximum=m))
    except:
        results.append(1)


def get_steps(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert h is not None
        h = int(h)
        # if not in steps or in steps and performance is not the same
        performance_name = source_dict.get('performance', '').replace(' ', '_').replace('-', '_').casefold()
        performance_candidates = [key for key in Steps.keys() if key.casefold() == performance_name and Steps[key] == h]
        if len(performance_candidates) == 0:
            results.append(h)
            return
        results.append(-1)
    except:
        results.append(-1)


def _normalize_original_resolution_choice(value):
    if isinstance(value, dict):
        return "origin|Original" if value.get("origin") else ""
    text = str(value or "").strip()
    if not text:
        return ""
    head = text.split(",", 1)[0].strip()
    marker_text = head.lower().replace("-", "_").replace(" ", "_")
    parts = [part.strip("_") for part in re.split(r"[|\[\]\(\)]", marker_text) if part.strip("_")]
    for part in parts:
        if part in ("origin", "original", "source", "no_resize", "noresize"):
            return head or "origin|Original"
    return ""


def parse_resolution_pair_value(value, min_dimension=64):
    def coerce_pair(width_value, height_value):
        try:
            width = int(round(float(str(width_value).strip())))
            height = int(round(float(str(height_value).strip())))
        except Exception:
            return None
        if width < min_dimension or height < min_dimension:
            return None
        return width, height

    if value is None:
        return None
    if isinstance(value, dict):
        for width_key, height_key in (
            ("width", "height"),
            ("Width", "Height"),
            ("w", "h"),
        ):
            if width_key in value and height_key in value:
                pair = coerce_pair(value.get(width_key), value.get(height_key))
                if pair:
                    return pair
        return None
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return coerce_pair(value[0], value[1])

    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = ast.literal_eval(text)
        if isinstance(parsed, (list, tuple)) and len(parsed) >= 2:
            pair = coerce_pair(parsed[0], parsed[1])
            if pair:
                return pair
    except Exception:
        pass

    normalized = text.replace("×", "x").replace("*", "x")
    match = re.search(r"(\d+(?:\.\d+)?)\s*(?:x|X|,|\s+)\s*(\d+(?:\.\d+)?)", normalized)
    if not match:
        return None
    return coerce_pair(match.group(1), match.group(2))


def _resolve_backend_engine_key(value):
    text = str(value or "").strip()
    base = text.split(":", 1)[0] if ":" in text else text
    engine = get_taskclass_by_fullname(text) or get_taskclass_by_fullname(base) or base
    return engine if engine in default_class_params else "Fooocus"


def get_resolution(key: str, fallback: str | None, source_dict: dict, results: list, default=None, use_resolution_override=False):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        original_choice = _normalize_original_resolution_choice(h)
        if original_choice:
            results.append(original_choice)
            results.append(-1)
            results.append(-1)
            return
        parsed_resolution = parse_resolution_pair_value(h)
        if parsed_resolution is None:
            raise ValueError(f"invalid resolution value: {h!r}")
        width, height = parsed_resolution
        formatted = modules.flags.add_ratio(f'{width}*{height}')
        if 'engine' in source_dict:
            engine_data = source_dict['engine'] if isinstance(source_dict.get('engine'), dict) else {}
            engine = engine_data.get('backend_engine', source_dict.get('Backend Engine', source_dict.get('backend_engine', task_class_mapping['Fooocus'])))
            engine = _resolve_backend_engine_key(engine)
            template = engine_data.get('available_aspect_ratios_selection', default_class_params[engine].get('available_aspect_ratios_selection', default_class_params['Fooocus']['available_aspect_ratios_selection']))
        else:
            engine = _resolve_backend_engine_key(source_dict.get('Backend Engine', source_dict.get('backend_engine', task_class_mapping['Fooocus'])))
            template = default_class_params[engine].get('available_aspect_ratios_selection', default_class_params['Fooocus']['available_aspect_ratios_selection'])
        if formatted in modules.flags.available_aspect_ratios_list.get(template, []):
            h = f'{formatted},{template}'
            results.append(h)
            if use_resolution_override:
                results.append(int(width))
                results.append(int(height))
            else:
                results.append(-1)
                results.append(-1)
        else:
            results.append(gr_update())
            results.append(int(width))
            results.append(int(height))
    except Exception as e:
        logger.info(f'in except:{e}')
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())


def get_resolution_control_defaults(source_dict: dict, results: list):
    try:
        overwrite_width = source_dict.get('overwrite_width', source_dict.get('Overwrite Width', None))
        overwrite_height = source_dict.get('overwrite_height', source_dict.get('Overwrite Height', None))
        overwrite_width = int(overwrite_width)
        overwrite_height = int(overwrite_height)
        if overwrite_width > 0 and overwrite_height > 0 and len(results) >= 2:
            results[-2] = overwrite_width
            results[-1] = overwrite_height
    except Exception:
        pass

    try:
        step = int(source_dict.get('resolution_quantize_step', modules.flags.default_resolution_quantize_step))
    except Exception:
        step = modules.flags.default_resolution_quantize_step
    if step not in modules.flags.resolution_quantize_steps:
        step = modules.flags.default_resolution_quantize_step
    results.append(step)

    try:
        multiplier = float(source_dict.get('resolution_multiplier', modules.flags.default_resolution_multiplier))
    except Exception:
        multiplier = modules.flags.default_resolution_multiplier
    multiplier = max(1.0, min(2.0, multiplier))
    results.append(multiplier)

    mode = str(source_dict.get('resolution_edit_mode', modules.flags.default_resolution_edit_mode) or '').strip().lower()
    mode = mode.replace('-', '_').replace(' ', '_')
    mode_aliases = {
        'fit': modules.flags.resolution_edit_mode_proportional,
        'proportion': modules.flags.resolution_edit_mode_proportional,
        'proportional': modules.flags.resolution_edit_mode_proportional,
        'same_ratio': modules.flags.resolution_edit_mode_proportional,
        'crop': modules.flags.resolution_edit_mode_crop,
        'cover': modules.flags.resolution_edit_mode_crop,
        'fill': modules.flags.resolution_edit_mode_fill,
        'scale': modules.flags.resolution_edit_mode_scale,
        'stretch': modules.flags.resolution_edit_mode_scale,
        'pad': modules.flags.resolution_edit_mode_pad,
        'padding': modules.flags.resolution_edit_mode_pad,
        'letterbox': modules.flags.resolution_edit_mode_pad,
        'contain': modules.flags.resolution_edit_mode_pad,
    }
    mode = mode_aliases.get(mode, modules.flags.default_resolution_edit_mode)
    results.append(mode)


def get_seed(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    try:
        if bool(source_dict.get('seed_random', False)):
            results.append(True)
            results.append(gr_update())
            return
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert h is not None
        h = int(h)
        results.append(False)
        results.append(h)
    except:
        results.append(gr_update())
        results.append(gr_update())


def get_inpaint_engine_version(key: str, fallback: str | None, source_dict: dict, results: list, inpaint_mode: str, default=None) -> str | None:
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        if h is None:
            h = source_dict.get('inpaint_engine', source_dict.get('Inpaint Engine', default))
        task_method = source_dict.get('task_method', source_dict.get(fallback, 'text2image'))
        if isinstance(task_method, dict):
            task_method = next(iter(task_method.values()), '') if task_method else ''
        elif isinstance(task_method, list):
            task_method = task_method[0] if task_method else ''
        task_method = str(task_method or '').strip()
        if task_method not in modules.flags.inpaint_engine_versions:
            engine = source_dict.get('backend_engine', source_dict.get('Backend Engine', source_dict.get('engine', '')))
            if isinstance(engine, dict):
                engine = engine.get('backend_engine', '')
            engine = str(engine or '').strip()
            task_lower = task_method.lower()
            if 'z_image' in task_lower or 'z-image' in task_lower or engine in ('Z-image', 'Zimage'):
                task_method = 'z_image_turbo_aio_cn'
            elif 'wan' in task_lower or engine == 'Wan':
                task_method = 'wan_aio_cn'
            elif 'qwen' in task_lower or engine == 'Qwen':
                task_method = 'qwen_aio_cn'
            elif 'flux' in task_lower or engine == 'Flux':
                task_method = 'flux_aio'
            else:
                task_method = 'SDXL'
        inpaint_engine_versions = modules.flags.inpaint_engine_versions.get(task_method, modules.flags.inpaint_engine_versions["SDXL"])
        #assert isinstance(h, str) and h in inpaint_engine_versions
        if h not in inpaint_engine_versions:
            h = inpaint_engine_versions[0]
        if inpaint_mode != modules.flags.inpaint_option_detail:
            results.append(dropdown_update(choices=inpaint_engine_versions, value=h))
        else:
            # Keep the remembered engine state in `h`, but force the hidden/detail dropdown
            # to a valid visible choice so Gradio 6 does not warn about a stale previous value.
            detail_value = 'None' if 'None' in inpaint_engine_versions else inpaint_engine_versions[0]
            results.append(dropdown_update(choices=inpaint_engine_versions, value=detail_value))
        results.append(h)
        return h
    except:
        results.append(gr_update())
        results.append('empty')
        return None


def get_inpaint_method(key: str, fallback: str | None, source_dict: dict, results: list, default=None) -> str | None:
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        assert isinstance(h, str) and h in modules.flags.inpaint_options
        results.append(h)
        for i in range(modules.config.default_enhance_tabs):
            results.append(dropdown_update(
                choices=[modules.flags.inpaint_option_detail],
                value=modules.flags.inpaint_option_detail,
            ))
        return h
    except:
        results.append(gr_update())
        for i in range(modules.config.default_enhance_tabs):
            results.append(gr_update())


def get_adm_guidance(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        p, n, e = eval(h)
        results.append(float(p))
        results.append(float(n))
        results.append(float(e))
    except:
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())


def get_freeu(key: str, fallback: str | None, source_dict: dict, results: list, default=None):
    try:
        h = source_dict.get(key, source_dict.get(fallback, default))
        b1, b2, s1, s2 = eval(h)
        results.append(True)
        results.append(float(b1))
        results.append(float(b2))
        results.append(float(s1))
        results.append(float(s2))
    except:
        results.append(False)
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())
        results.append(gr_update())


def get_lora(key: str, fallback: str | None, source_dict: dict, results: list, performance_filename: str | None):
    try:
        split_data = source_dict.get(key, source_dict.get(fallback)).split(' : ')
        enabled = True
        name = split_data[0]
        weight = split_data[1]

        if len(split_data) == 3:
            enabled = split_data[0] == 'True'
            name = split_data[1]
            weight = split_data[2]

        if name == performance_filename:
            raise Exception
        w_min = float(source_dict.get('loras_min_weight', ads.default['loras_min_weight']))
        w_max = float(source_dict.get('loras_max_weight', ads.default['loras_max_weight']))
        weight = float(weight)
        results.append(enabled)
        results.append(name)
        results.append(gr_update(value=weight, minimum=w_min, maximum=w_max))
    except:
        results.append(True)
        results.append('None')
        results.append(1)


def get_sha256(filepath):
    global hash_cache
    if not os.path.isfile(filepath):
        return ''
    if filepath not in hash_cache:
        filehash = shared.modelsinfo.get_file_muid(filepath)
        if not filehash:
            filehash = sha256(filepath)
        hash_cache[filepath] = filehash
    return hash_cache[filepath]


def parse_meta_from_preset(preset_content):
    assert isinstance(preset_content, dict)
    preset_prepared = {}
    items = preset_content

    for settings_key, meta_key in modules.config.possible_preset_keys.items():
        if settings_key == "default_loras":
            loras = getattr(modules.config, settings_key)
            if settings_key in items:
                loras = items[settings_key]
            for index, lora in enumerate(loras[:modules.config.default_max_lora_number]):
                if len(lora) == 2:
                    lora = (lora[0].replace('\\', os.sep).replace('/', os.sep), *lora[1:])
                elif  len(lora) == 3:
                    lora = (lora[0], lora[1].replace('\\', os.sep).replace('/', os.sep), *lora[2:])
                preset_prepared[f'lora_combined_{index + 1}'] = ' : '.join(map(str, lora))
        elif settings_key == "default_aspect_ratio":
            if settings_key in items and items[settings_key] is not None:
                default_aspect_ratio = items[settings_key]
                original_choice = _normalize_original_resolution_choice(default_aspect_ratio)
                if original_choice:
                    preset_prepared[meta_key] = original_choice
                    continue
                parsed_resolution = parse_resolution_pair_value(default_aspect_ratio)
                if parsed_resolution is None:
                    width, height = str(default_aspect_ratio).split('*')
                else:
                    width, height = parsed_resolution
            else:
                default_aspect_ratio = getattr(modules.config, settings_key)
                parsed_resolution = parse_resolution_pair_value(default_aspect_ratio)
                if parsed_resolution is None:
                    width, height = default_aspect_ratio.split('×')
                    height = height[:height.index(" ")]
                else:
                    width, height = parsed_resolution
            preset_prepared[meta_key] = (width, height)
        elif settings_key == "default_clip_model" and settings_key not in items:
            preset_prepared[meta_key] = modules.flags.default_clip
        elif settings_key == "default_vae" and settings_key not in items:
            preset_prepared[meta_key] = modules.flags.default_vae
        elif settings_key not in items and settings_key in modules.config.allow_missing_preset_key:
            continue
        else:
            preset_prepared[meta_key] = items[settings_key] if settings_key in items and items[settings_key] is not None else getattr(modules.config, settings_key)

        if settings_key == "default_styles" or settings_key == "default_aspect_ratio":
            preset_prepared[meta_key] = str(preset_prepared[meta_key])
        if settings_key in ["default_model", "default_refiner", "default_clip_model", "default_vae", "default_upscale_model"]:
            preset_prepared[meta_key] = preset_prepared[meta_key].replace('\\', os.sep).replace('/', os.sep)

    for key, value in items.items():
        if key in modules.config.possible_preset_keys:
            continue

        if key.startswith("default_") and value is not None:
            meta_key = key[8:]
            preset_prepared[meta_key] = value

            if key in ["default_styles", "default_aspect_ratio"]:
                preset_prepared[meta_key] = str(preset_prepared[meta_key])
            elif key in ["default_model", "default_refiner", "default_clip_model", "default_vae", "default_upscale_model"]:
                preset_prepared[meta_key] = preset_prepared[meta_key].replace('\\', os.sep).replace('/', os.sep)

    engine_params = preset_prepared.get('engine', {}).get('backend_params', {}) if isinstance(preset_prepared.get('engine', {}), dict) else {}
    if isinstance(engine_params, dict) and "default_clip_model" not in items:
        clip_model = engine_params.get('clip_model')
        if isinstance(clip_model, str) and clip_model:
            preset_prepared['clip_model'] = default_clip if clip_model == 'auto' else clip_model.replace('\\', os.sep).replace('/', os.sep)

    if "base_model" in preset_prepared:
        preset_prepared["base_model"] = _resolve_previous_default_base_model(items, preset_prepared.get("base_model"))
    if "refiner_model" in preset_prepared:
        preset_prepared["refiner_model"] = _resolve_previous_default_refiner_model(items, preset_prepared.get("refiner_model"))

    return preset_prepared


class MetadataParser(ABC):
    def __init__(self):
        self.raw_prompt: str = ''
        self.full_prompt: str = ''
        self.raw_negative_prompt: str = ''
        self.full_negative_prompt: str = ''
        self.steps: int = Steps.SPEED.value
        self.base_model_name: str = ''
        self.base_model_hash: str = ''
        self.refiner_model_name: str = ''
        self.refiner_model_hash: str = ''
        self.loras: list = []
        self.vae_name: str = ''
        self.styles_definition = {}

    @abstractmethod
    def get_scheme(self) -> MetadataScheme:
        raise NotImplementedError

    @abstractmethod
    def to_json(self, metadata: dict | str) -> dict:
        raise NotImplementedError

    @abstractmethod
    def to_string(self, metadata: dict) -> str:
        raise NotImplementedError

    def set_data(self, raw_prompt, full_prompt, raw_negative_prompt, full_negative_prompt, steps, base_model_name,
                 refiner_model_name, loras, vae_name, styles_definition):
        self.raw_prompt = raw_prompt
        self.full_prompt = full_prompt
        self.raw_negative_prompt = raw_negative_prompt
        self.full_negative_prompt = full_negative_prompt
        self.steps = steps
        self.base_model_name = Path(base_model_name).stem

        if base_model_name not in ['', 'None']:
            base_model_path = shared.modelsinfo.get_model_filepath('checkpoints', base_model_name)
            self.base_model_hash = shared.modelsinfo.get_file_muid(base_model_path)

        if refiner_model_name not in ['', 'None']:
            self.refiner_model_name = Path(refiner_model_name).stem
            refiner_model_path = shared.modelsinfo.get_model_filepath('checkpoints', refiner_model_name)
            self.refiner_model_hash = shared.modelsinfo.get_file_muid(refiner_model_path)

        self.loras = []
        for (lora_name, lora_weight) in loras:
            if lora_name != 'None':
                lora_path = shared.modelsinfo.get_model_filepath('loras', lora_name)
                lora_hash = shared.modelsinfo.get_file_muid(lora_path)
                self.loras.append((Path(lora_name).stem, lora_weight, lora_hash))
        self.vae_name = Path(vae_name).stem
        if styles_definition != 'None':
            self.styles_definition = styles_definition


class A1111MetadataParser(MetadataParser):
    def get_scheme(self) -> MetadataScheme:
        return MetadataScheme.A1111

    fooocus_to_a1111 = {
        'raw_prompt': 'Raw prompt',
        'raw_negative_prompt': 'Raw negative prompt',
        'negative_prompt': 'Negative prompt',
        'styles': 'Styles',
        'performance': 'Performance',
        'steps': 'Steps',
        'sampler': 'Sampler',
        'scheduler': 'Schedule type',
        'vae': 'VAE',
        'clip_model': 'Text Encoder',
        'guidance_scale': 'CFG scale',
        'seed': 'Seed',
        'resolution': 'Size',
        'sharpness': 'Sharpness',
        'adm_guidance': 'ADM Guidance',
        'refiner_swap_method': 'Refiner Swap Method',
        'adaptive_cfg': 'Adaptive CFG',
        'overwrite_switch': 'Overwrite Switch',
        'freeu': 'FreeU',
        'base_model': 'Model',
        'base_model_hash': 'Model hash',
        'refiner_model': 'Refiner',
        'refiner_model_hash': 'Refiner hash',
        'lora_hashes': 'Lora hashes',
        'lora_weights': 'Lora weights',
        'created_by': 'User',
        'version': 'Version',
        'backend_engine': 'Backend Engine'
    }
    a1111_to_fooocus_aliases = {
        'Scheduler': 'scheduler',
        'Schedule type': 'scheduler',
        'VAE': 'vae',
        'Text Encoder': 'clip_model',
        'Module 1': 'vae',
        'Module 2': 'clip_model',
    }
    scheduler_display_names = {
        'normal': 'Normal',
        'karras': 'Karras',
        'exponential': 'Exponential',
        'sgm_uniform': 'SGM Uniform',
        'simple': 'Simple',
        'ddim_uniform': 'DDIM',
        'lcm': 'LCM',
        'turbo': 'Turbo',
        'align_your_steps': 'Align Your Steps',
        'tcd': 'TCD',
        'edm_playground_v2.5': 'EDM Playground v2.5',
        'beta': 'Beta',
        'linear_quadratic': 'Linear Quadratic',
        'kl_optimal': 'KL Optimal',
        'bong_tangent': 'Bong Tangent',
    }
    scheduler_internal_names = {v: k for k, v in scheduler_display_names.items()}

    @classmethod
    def _a1111_key_to_internal(cls, key):
        if key in cls.a1111_to_fooocus_aliases:
            return cls.a1111_to_fooocus_aliases[key]
        values = list(cls.fooocus_to_a1111.values())
        if key in values:
            return list(cls.fooocus_to_a1111.keys())[values.index(key)]
        return None

    @classmethod
    def _scheduler_to_a1111(cls, scheduler):
        scheduler = str(scheduler or '').strip()
        return cls.scheduler_display_names.get(scheduler, scheduler)

    @classmethod
    def _scheduler_to_internal(cls, scheduler):
        scheduler = str(scheduler or '').strip()
        if scheduler in cls.scheduler_internal_names:
            return cls.scheduler_internal_names[scheduler]
        return scheduler

    @staticmethod
    def _filename_stem(value):
        text = str(value or '').strip()
        if text in ['', 'None']:
            return ''
        return Path(text).stem

    @staticmethod
    def _normalize_inline_a1111_sections(metadata):
        text = str(metadata or "")
        if "\nNegative prompt:" not in text:
            text = re.sub(r",\s*Negative prompt:\s*", "\nNegative prompt: ", text, count=1)
            text = re.sub(r"\s+Negative prompt:\s*", "\nNegative prompt: ", text, count=1)
        if "\nSteps:" not in text:
            text = re.sub(r",\s*Steps:\s*(?=\d)", "\nSteps: ", text, count=1)
            text = re.sub(r"\s+Steps:\s*(?=\d)", "\nSteps: ", text, count=1)
        return text

    def to_json(self, metadata: dict | str) -> dict:
        if isinstance(metadata, dict):
            wrapper_scheme = metadata.get("metadata_scheme") or metadata.get("fooocus_scheme")
            if "parameters" in metadata and (wrapper_scheme or isinstance(metadata.get("parameters"), str)):
                metadata = metadata.get("parameters") or ""
            else:
                return dict(metadata)
        metadata = self._normalize_inline_a1111_sections(metadata)
        metadata_prompt = ''
        metadata_negative_prompt = ''

        done_with_prompt = False

        *lines, lastline = metadata.strip().split("\n")
        if len(re_param.findall(lastline)) < 3:
            lines.append(lastline)
            lastline = ''

        for line in lines:
            line = line.strip()
            if line.startswith(f"{self.fooocus_to_a1111['negative_prompt']}:"):
                done_with_prompt = True
                line = line[len(f"{self.fooocus_to_a1111['negative_prompt']}:"):].strip()
            if done_with_prompt:
                metadata_negative_prompt += ('' if metadata_negative_prompt == '' else "\n") + line
            else:
                metadata_prompt += ('' if metadata_prompt == '' else "\n") + line

        metadata_prompt_raw = metadata_prompt
        metadata_negative_prompt_raw = metadata_negative_prompt
        found_styles, prompt, negative_prompt = extract_styles_from_prompt(metadata_prompt, metadata_negative_prompt)
        if not str(prompt or '').strip() and str(metadata_prompt_raw or '').strip():
            prompt = metadata_prompt_raw
        if not str(negative_prompt or '').strip() and str(metadata_negative_prompt_raw or '').strip():
            negative_prompt = metadata_negative_prompt_raw

        data = {
            'prompt': prompt,
            'negative_prompt': negative_prompt
        }

        for k, v in re_param.findall(lastline):
            try:
                if v != '' and v[0] == '"' and v[-1] == '"':
                    v = unquote(v)

                m = re_imagesize.match(v)
                if m is not None:
                    data['resolution'] = str((m.group(1), m.group(2)))
                else:
                    internal_key = self._a1111_key_to_internal(k)
                    if internal_key is not None:
                        data[internal_key] = v
            except Exception:
                logger.info(f"Error parsing \"{k}: {v}\"")

        # workaround for multiline prompts
        if 'raw_prompt' in data:
            data['prompt'] = data['raw_prompt']
            raw_prompt = data['raw_prompt'].replace("\n", ', ')
            if metadata_prompt != raw_prompt and modules.sdxl_styles.fooocus_expansion not in found_styles:
                found_styles.append(modules.sdxl_styles.fooocus_expansion)

        if 'raw_negative_prompt' in data:
            data['negative_prompt'] = data['raw_negative_prompt']

        data['styles'] = str(found_styles)

        # try to load performance based on steps, fallback for direct A1111 imports
        if 'steps' in data and 'performance' not in data:
            try:
                data['performance'] = Performance.by_steps(data['steps']).value
            except (ValueError, KeyError):
                pass

        if 'sampler' in data:
            data['sampler'] = data['sampler'].replace(' Karras', '')
            # get key
            for k, v in SAMPLERS.items():
                if v == data['sampler']:
                    data['sampler'] = k
                    break
        if 'scheduler' in data:
            data['scheduler'] = self._scheduler_to_internal(data['scheduler'])

        for key in ['base_model', 'refiner_model', 'vae', 'clip_model']:
            if key in data:
                if key == 'vae':
                    self.add_extension_to_filename(data, modules.config.vae_filenames, 'vae')
                elif key == 'clip_model':
                    self.add_extension_to_filename(data, modules.config.clip_filenames, 'clip_model')
                else:
                    self.add_extension_to_filename(data, modules.config.model_filenames, key)

        lora_data = ''
        if 'lora_weights' in data and data['lora_weights'] != '':
            lora_data = data['lora_weights']
        elif 'lora_hashes' in data and data['lora_hashes'] != '' and data['lora_hashes'].split(', ')[0].count(':') == 2:
            lora_data = data['lora_hashes']

        if lora_data != '':
            for li, lora in enumerate(lora_data.split(', ')):
                lora_split = lora.split(': ')
                lora_name = lora_split[0]
                lora_weight = lora_split[2] if len(lora_split) == 3 else lora_split[1]
                for filename in modules.config.lora_filenames:
                    path = Path(filename)
                    if lora_name == path.stem:
                        data[f'lora_combined_{li + 1}'] = f'{filename} : {lora_weight}'
                        break

        return data

    def to_string(self, metadata: dict) -> str:
        data = {k: v for _, k, v in metadata}

        width, height = eval(data['resolution'])

        sampler = data['sampler']
        scheduler = data['scheduler']
        scheduler_text = self._scheduler_to_a1111(scheduler)

        if sampler in SAMPLERS and SAMPLERS[sampler] != '':
            sampler = SAMPLERS[sampler]
            if sampler not in CIVITAI_NO_KARRAS and scheduler == 'karras':
                sampler += f' Karras'

        generation_params = {
            self.fooocus_to_a1111['steps']: self.steps,
            self.fooocus_to_a1111['sampler']: sampler,
            self.fooocus_to_a1111['scheduler']: scheduler_text,
            self.fooocus_to_a1111['seed']: data['seed'],
            self.fooocus_to_a1111['resolution']: f'{width}x{height}',
            self.fooocus_to_a1111['guidance_scale']: data['guidance_scale'],
            self.fooocus_to_a1111['sharpness']: data['sharpness'],
            self.fooocus_to_a1111['adm_guidance']: data['adm_guidance'],
            self.fooocus_to_a1111['base_model']: Path(data['base_model']).stem,
            self.fooocus_to_a1111['base_model_hash']: self.base_model_hash,
        }

        clip_model = data.get('clip_model', data.get('CLIP Model'))
        vae_name = self._filename_stem(data.get('vae'))
        clip_name = self._filename_stem(clip_model)
        if clip_name and clip_name not in {default_clip, 'Default (model)', 'auto'}:
            if vae_name:
                generation_params['Module 1'] = vae_name
            generation_params['Module 2'] = clip_name
        elif vae_name:
            generation_params[self.fooocus_to_a1111['vae']] = vae_name

        generation_params[self.fooocus_to_a1111['performance']] = data['performance']
        # workaround for multiline prompts
        generation_params[self.fooocus_to_a1111['raw_prompt']] = self.raw_prompt
        generation_params[self.fooocus_to_a1111['raw_negative_prompt']] = self.raw_negative_prompt

        if self.refiner_model_name not in ['', 'None']:
            generation_params |= {
                self.fooocus_to_a1111['refiner_model']: self.refiner_model_name,
                self.fooocus_to_a1111['refiner_model_hash']: self.refiner_model_hash
            }

        for key in ['adaptive_cfg', 'overwrite_switch', 'refiner_swap_method', 'freeu']:
            if key in data:
                generation_params[self.fooocus_to_a1111[key]] = data[key]

        if len(self.loras) > 0:
            lora_hashes = []
            lora_weights = []
            for index, (lora_name, lora_weight, lora_hash) in enumerate(self.loras):
                # workaround for Fooocus not knowing LoRA name in LoRA metadata
                lora_hashes.append(f'{lora_name}: {lora_hash}')
                lora_weights.append(f'{lora_name}: {lora_weight}')
            lora_hashes_string = ', '.join(lora_hashes)
            lora_weights_string = ', '.join(lora_weights)
            generation_params[self.fooocus_to_a1111['lora_hashes']] = lora_hashes_string
            generation_params[self.fooocus_to_a1111['lora_weights']] = lora_weights_string

        generation_params[self.fooocus_to_a1111['version']] = data['version']

        if modules.config.metadata_created_by != '':
            generation_params[self.fooocus_to_a1111['created_by']] = modules.config.metadata_created_by

        generation_params_text = ", ".join(
            [k if k == v else f'{k}: {quote(v)}' for k, v in generation_params.items() if
             v not in [None, '']])
        positive_prompt_resolved = ', '.join(self.full_prompt)
        negative_prompt_resolved = ', '.join(self.full_negative_prompt)
        negative_prompt_text = f"\nNegative prompt: {negative_prompt_resolved}" if negative_prompt_resolved else ""
        return f"{positive_prompt_resolved}{negative_prompt_text}\n{generation_params_text}".strip()

    @staticmethod
    def add_extension_to_filename(data, filenames, key):
        for filename in filenames:
            path = Path(filename)
            if data[key] == path.stem:
                data[key] = filename
                break


class FooocusMetadataParser(MetadataParser):
    def get_scheme(self) -> MetadataScheme:
        return MetadataScheme.FOOOCUS

    def to_json(self, metadata: dict) -> dict:

        for key, value in metadata.items():
            if value in ['', 'None']:
                continue
            if key in ['base_model', 'refiner_model']:
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.model_filenames)
            elif key.startswith('lora_combined_'):
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.lora_filenames)
            elif key == 'clip_model':
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.clip_filenames)
            elif key == 'vae':
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.vae_filenames)
            else:
                continue

        return metadata

    def to_string(self, metadata: list) -> str:
        for li, (label, key, value) in enumerate(metadata):
            # remove model folder paths from metadata
            if key.startswith('lora_combined_'):
                name, weight = value.split(' : ')
                name = Path(name).stem
                value = f'{name} : {weight}'
                metadata[li] = (label, key, value)

        res = {k: v for _, k, v in metadata}

        res['full_prompt'] = self.full_prompt
        res['full_negative_prompt'] = self.full_negative_prompt
        res['steps'] = self.steps
        res['base_model'] = self.base_model_name
        res['base_model_hash'] = self.base_model_hash

        if self.refiner_model_name not in ['', 'None']:
            res['refiner_model'] = self.refiner_model_name
            res['refiner_model_hash'] = self.refiner_model_hash

        res['vae'] = self.vae_name
        res['loras'] = self.loras

        if modules.config.metadata_created_by != '':
            res['created_by'] = modules.config.metadata_created_by

        return json.dumps(dict(sorted(res.items())))

    @staticmethod
    def replace_value_with_filename(key, value, filenames):
        if key in ['vae', 'clip_model'] and value == 'Default (model)':
            return value
        for filename in filenames:
            path = Path(filename)
            if key.startswith('lora_combined_'):
                name, weight = value.split(' : ')
                if name == path.stem:
                    return f'{filename} : {weight}'
            elif value == path.stem:
                return filename

        return None

class SIMPLEMetadataParser(MetadataParser):
    def get_scheme(self) -> MetadataScheme:
        return MetadataScheme.SIMPLE


    def to_json(self, metadata: dict) -> dict:
        engine = _resolve_backend_engine_key(metadata.get('Backend Engine', metadata.get('backend_engine', task_class_mapping['Fooocus'])))
        model_filenames = modules.config.get_base_model_list(engine)
        for key, value in metadata.items():
            if value in ['', 'None']:
                if key in ['base_model', 'refiner_model', 'Base Model', 'Refiner Model', 'clip_model', 'CLIP Model']:
                    metadata[key] = 'None'
                continue
            if key in ['base_model', 'refiner_model', 'Base Model', 'Refiner Model']:
                metadata[key] = self.replace_value_with_filename(key, value, model_filenames)
                if metadata[key]=='None':
                    logger.info(f' ⚠️  WARNING! The model is not available in the local: {value}.')
            elif key in ['clip_model', 'CLIP Model']:
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.clip_filenames)
            elif key.startswith('LoRA '):
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.lora_filenames)
            elif key in ['vae', 'VAE']:
                metadata[key] = self.replace_value_with_filename(key, value, modules.config.vae_filenames)
            else:
                continue

        return metadata

    def to_string(self, metadata: list) -> str:
        for li, (label, key, value) in enumerate(metadata):
            # remove model folder paths from metadata
            if key.startswith('lora_combined_'):
                name, weight = value.split(' : ')
                name = Path(name).stem
                value = f'{name} : {weight}'
                metadata[li] = (label, key, value)

        res = {k: v for k, _, v in metadata}

        res['Full Prompt'] = self.full_prompt
        res['Full Negative Prompt'] = self.full_negative_prompt
        res['Steps'] = self.steps
        res['Base Model'] = self.base_model_name
        res['Base Model Hash'] = self.base_model_hash

        if self.refiner_model_name not in ['', 'None']:
            res['Refiner Model'] = self.refiner_model_name
            res['Refiner Model Hash'] = self.refiner_model_hash

        res['VAE'] = self.vae_name
        res['LoRAs'] = self.loras
        res['styles_definition'] = self.styles_definition

        if modules.config.metadata_created_by != '':
            res['User'] = modules.config.metadata_created_by

        return json.dumps(dict(sorted(res.items())))

    @staticmethod
    def replace_value_with_filename(key, value, filenames):
        if key in ['vae', 'VAE', 'clip_model', 'CLIP Model'] and value=='Default (model)':
            return value
        for filename in filenames:
            path = Path(filename)
            if key.startswith('LoRA '):
                name, weight = value.split(' : ')
                if Path(name).stem == path.stem or name == path.stem:
                    return f'{filename} : {weight}'
            elif Path(value).stem == path.stem or value == path.stem:
                return filename
        return 'None'


def get_metadata_parser(metadata_scheme: MetadataScheme) -> MetadataParser:
    match metadata_scheme:
        case MetadataScheme.FOOOCUS:
            return FooocusMetadataParser()
        case MetadataScheme.A1111:
            return A1111MetadataParser()
        case MetadataScheme.SIMPLE:
            return SIMPLEMetadataParser()
        case _:
            raise NotImplementedError


def _metadata_scheme_from_value(value):
    if isinstance(value, MetadataScheme):
        return value
    if value is None:
        return None
    try:
        return MetadataScheme(value)
    except ValueError:
        return None


def normalize_metadata_parameters(parameters, metadata_scheme=None) -> dict | None:
    if parameters is None:
        return None

    scheme = _metadata_scheme_from_value(metadata_scheme)
    parsed = copy.deepcopy(parameters) if isinstance(parameters, dict) else parameters

    if isinstance(parsed, str) and is_json(parsed):
        parsed = json.loads(parsed)
        parsed = params_lora_fixed(parsed)

    if isinstance(parsed, dict):
        wrapper_scheme = parsed.get("metadata_scheme") or parsed.get("fooocus_scheme")
        if "parameters" in parsed and wrapper_scheme:
            scheme = _metadata_scheme_from_value(wrapper_scheme) or scheme
            parsed = parsed.get("parameters")
            if isinstance(parsed, str) and is_json(parsed):
                parsed = json.loads(parsed)
                parsed = params_lora_fixed(parsed)

    if scheme is None:
        if isinstance(parsed, str):
            scheme = MetadataScheme.A1111
        elif isinstance(parsed, dict):
            return parsed
        else:
            return None

    if scheme == MetadataScheme.FOOOCUS:
        scheme = MetadataScheme.SIMPLE

    try:
        normalized = get_metadata_parser(scheme).to_json(parsed)
    except Exception:
        logger.exception("Failed to normalize metadata parameters with scheme=%s", scheme)
        return parsed if isinstance(parsed, dict) else None
    return normalized if isinstance(normalized, dict) else None


def _exif_bytes_to_text(value, *, user_comment=False):
    if value is None or isinstance(value, str):
        return value
    if isinstance(value, tuple) and all(isinstance(item, int) for item in value):
        value = bytes(value)
    if isinstance(value, bytes):
        if user_comment and piexif is not None:
            try:
                return piexif.helper.UserComment.load(value)
            except Exception:
                pass
        for prefix, encoding in (
            (b"ASCII\x00\x00\x00", "utf-8"),
            (b"UNICODE\x00", "utf-16-be"),
            (b"JIS\x00\x00\x00\x00\x00", "shift_jis"),
        ):
            if value.startswith(prefix):
                return value[len(prefix):].decode(encoding, "replace").strip("\x00")
        for encoding in ("utf-8", "utf-16-be", "utf-16", "latin-1"):
            try:
                return value.decode(encoding).strip("\x00")
            except Exception:
                pass
        return value.decode("utf-8", "replace").strip("\x00")
    return str(value)


def _read_exif_ifd(exif):
    if hasattr(exif, "get_ifd"):
        try:
            exif_ifd = exif.get_ifd(0x8769)
            if isinstance(exif_ifd, dict):
                return exif_ifd
        except Exception:
            pass
    return {}


def read_info_from_image(file) -> tuple[str | None, MetadataScheme | None]:
    items = (file.info or {}).copy()

    parameters = items.pop('parameters', None)
    metadata_scheme = items.pop('metadata_scheme', None)
    if metadata_scheme is None:
        metadata_scheme = items.pop('fooocus_scheme', None)
    exif = items.pop('exif', None)
    if not parameters and 'Comment' in items:
        metadata_scheme = 'simple'
        parameters = items.pop('Comment', None)

    if isinstance(parameters, str) and is_json(parameters):
        parameters = json.loads(parameters)
        parameters = params_lora_fixed(parameters)
    elif exif is not None:
        exif = file.getexif()
        exif_ifd = _read_exif_ifd(exif)
        # 0x9286 = UserComment
        parameters = exif_ifd.get(0x9286, exif.get(0x9286, None))
        # 0x927C = MakerNote
        metadata_scheme = exif_ifd.get(0x927C, exif.get(0x927C, None))
        parameters = _exif_bytes_to_text(parameters, user_comment=True)
        metadata_scheme = _exif_bytes_to_text(metadata_scheme)
        
        if isinstance(parameters, str) and is_json(parameters):
            parameters = json.loads(parameters)
            parameters = params_lora_fixed(parameters)

    try:
        if metadata_scheme == 'fooocus':
            metadata_scheme = 'simple'
            if isinstance(parameters, dict):
                parameters.update({'metadata_scheme': 'simple'})
        metadata_scheme = MetadataScheme(metadata_scheme)
    except ValueError:
        metadata_scheme = None

        # broad fallback
        #if isinstance(parameters, dict):
        #    metadata_scheme = MetadataScheme.FOOOCUS

        if isinstance(parameters, str):
            metadata_scheme = MetadataScheme.A1111
    return parameters, metadata_scheme


def _metadata_file_path(file):
    if isinstance(file, (str, os.PathLike)):
        return os.path.abspath(os.fspath(file))
    if isinstance(file, dict):
        for key in ("path", "name"):
            value = file.get(key)
            if isinstance(value, (str, os.PathLike)):
                return os.path.abspath(os.fspath(value))
    for attr in ("path", "name"):
        value = getattr(file, attr, None)
        if isinstance(value, (str, os.PathLike)):
            return os.path.abspath(os.fspath(value))
    return ""


def metadata_media_type(file):
    if isinstance(file, Image.Image):
        return "image"
    path = _metadata_file_path(file)
    mime = str(mimetypes.guess_type(path)[0] or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    return ""


def read_info_from_video(file) -> tuple[str | dict | None, MetadataScheme | None]:
    path = _metadata_file_path(file)
    if not path or not os.path.isfile(path):
        return None, None

    from modules.canvas_media_metadata import read_video_metadata_tags

    tags = read_video_metadata_tags(path)
    if not isinstance(tags, dict) or not tags:
        return None, None
    lower_tags = {str(key).lower(): value for key, value in tags.items()}
    metadata_scheme = lower_tags.get("metadata_scheme") or lower_tags.get("fooocus_scheme")

    parameters = None
    for key in ("simpleai_metadata", "parameters", "comment"):
        candidate = lower_tags.get(key)
        if candidate in (None, ""):
            continue
        if isinstance(candidate, str) and is_json(candidate):
            candidate = json.loads(candidate)
        if isinstance(candidate, dict) and isinstance(candidate.get("prompt"), dict):
            candidate = candidate.get("prompt")
        parameters = candidate
        break

    if parameters is None:
        return None, None
    if isinstance(parameters, dict):
        parameters = params_lora_fixed(parameters)

    if metadata_scheme == "fooocus":
        metadata_scheme = "simple"
        if isinstance(parameters, dict):
            parameters.setdefault("metadata_scheme", "simple")
    try:
        metadata_scheme = MetadataScheme(metadata_scheme)
    except (TypeError, ValueError):
        metadata_scheme = MetadataScheme.A1111 if isinstance(parameters, str) else MetadataScheme.SIMPLE
    return parameters, metadata_scheme


def read_info_from_media(file) -> tuple[str | dict | None, MetadataScheme | None]:
    if file is None:
        return None, None
    if isinstance(file, Image.Image):
        return read_info_from_image(file)

    path = _metadata_file_path(file)
    media_type = metadata_media_type(path)
    if media_type == "video":
        return read_info_from_video(path)
    if media_type == "image":
        try:
            with Image.open(path) as image:
                return read_info_from_image(image)
        except Exception:
            logger.exception("Failed to read image metadata from %s", path)
            return None, None
    return None, None

def params_lora_fixed(parameters):
    loras_p = {k: v for k, v in parameters.items() if k.startswith("LoRA [")}
    if loras_p:
        for k, _ in loras_p.items():
            del parameters[k]
        loras_p = {f'LoRA {i}': f'{k[6:-8]} : {v}' for i, (k, v) in enumerate(loras_p.items(), 1)}
        parameters.update(loras_p)
    return parameters

def get_exif(metadata: str | None, metadata_scheme: str):
    import enhanced.version as version
    software = f'{version.branch}_{version.get_simpai_ver()}'
    if piexif is not None:
        exif_ifd = {
            piexif.ExifIFD.UserComment: piexif.helper.UserComment.dump(str(metadata or ""), encoding="unicode")
        }
        if metadata_scheme:
            exif_ifd[piexif.ExifIFD.MakerNote] = str(metadata_scheme).encode("utf-8")
        return piexif.dump({
            "0th": {piexif.ImageIFD.Software: software},
            "Exif": exif_ifd,
            "GPS": {},
            "1st": {},
            "thumbnail": None,
        })

    exif = Image.Exif()
    # tags see see https://github.com/python-pillow/Pillow/blob/9.2.x/src/PIL/ExifTags.py
    # 0x9286 = UserComment
    exif[0x9286] = metadata
    # 0x0131 = Software
    exif[0x0131] = software
    # 0x927C = MakerNote
    exif[0x927C] = metadata_scheme
    return exif
