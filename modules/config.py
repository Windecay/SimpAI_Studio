import os
import json
import numbers
import re
import shutil
from typing import Any, Dict, List, Optional, Tuple

import args_manager
import tempfile
import shared
import modules.flags
import modules.sdxl_styles
import enhanced.all_parameters as ads
import logging
import ldm_patched.modules.model_management as mm

from modules.model_loader import load_file_from_url
from modules.model_path_utils import (
    find_dir_containing_model,
    find_model_in_dirs,
    first_model_dir,
    resolve_existing_path_case_insensitive,
)
from modules.extra_utils import makedirs_with_log, get_files_from_folder, try_eval_env_var
from modules.flags import OutputFormat, Performance
from enhanced.logger import format_name
from enhanced.simpleai import init_modelsinfo, get_path_in_user_dir
logger = logging.getLogger(format_name(__name__))
ARCH_FAMILY_ALGO = 4
ARCH_FAMILY_CATALOGS = {"checkpoints", "diffusion_models", "loras", "vae", "unet"}
_logged_config_info_keys = set()


def _log_info_once(key, message):
    if key in _logged_config_info_keys:
        return
    _logged_config_info_keys.add(key)
    logger.info(message)

def get_config_path(key, default_value):
    env = os.getenv(key)
    if env is not None and isinstance(env, str):
        logger.info(f"Environment: {key} = {env}")
        return env
    else:
        return os.path.abspath(default_value)

userhome_path = get_config_path('simpleai_userhome', "users") if not args_manager.args.userhome_path else args_manager.args.userhome_path
config_path_old = get_config_path('config_path', "config.txt")
config_path = os.path.abspath(os.path.join(userhome_path, "config.txt"))
config_example_path = os.path.join(os.path.dirname(config_path), "config_modification_tutorial.txt")
forge_neo_read_only_user_config = bool(getattr(args_manager.args, "forge_neo_read_only_user_config", False))

config_dict = {}
config_template_dict = {}
always_save_keys = []
visited_keys = []
config_needs_write = False
wildcards_max_bfs_depth = 64

try:
    with open(os.path.abspath('./presets/Z-imageT.json'), "r", encoding="utf-8") as json_file:
        config_dict.update(json.load(json_file))
except Exception as e:
    logger.info('Load Z-imageT preset failed.')
    logger.info(e)

try:
    if not forge_neo_read_only_user_config and os.path.exists(config_path_old) and not os.path.exists(config_path):
        shutil.copy(config_path_old, config_path)
        config_path_deprecated = config_path_old + '.deprecated'
        os.rename(config_path_old, config_path_deprecated)
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as json_file:
            loaded_config = json.load(json_file)
            config_dict.update(loaded_config)
        always_save_keys = list(loaded_config.keys())
        for key in always_save_keys:
            if key.startswith('default_') and key[8:] in ads.default:
                ads.default[key[8:]] = config_dict[key]
        logger.info(f'Load config data from {config_path}.')
except Exception as e:
    logger.info(f'Failed to load config file "{config_path}" . The reason is: {str(e)}')
    logger.info('Please make sure that:')
    logger.info(f'1. The file "{config_path}" is a valid text file, and you have access to read it.')
    logger.info('2. Use "\\\\" instead of "\\" when describing paths.')
    logger.info('3. There is no "," before the last "}".')
    logger.info('4. All key/value formats are correct.')

try:
    if os.path.exists(config_path_old):
        with open(config_path_old, "r", encoding="utf-8") as json_file:
            config_template_dict.update(json.load(json_file))
except Exception as e:
    logger.info(f'Failed to load template config file "{config_path_old}" . The reason is: {str(e)}')

shared.gpu_arch = mm.get_current_compute_capability()

def try_load_deprecated_user_path_config():
    global config_dict

    if not os.path.exists('user_path_config.txt'):
        return

    try:
        deprecated_config_dict = json.load(open('user_path_config.txt', "r", encoding="utf-8"))

        def replace_config(old_key, new_key):
            if old_key in deprecated_config_dict:
                config_dict[new_key] = deprecated_config_dict[old_key]
                del deprecated_config_dict[old_key]

        replace_config('modelfile_path', 'paths_checkpoints')
        replace_config('lorafile_path', 'paths_loras')
        replace_config('embeddings_path', 'paths_embeddings')
        replace_config('vae_approx_path', 'paths_vae_approx')
        replace_config('upscale_models_path', 'paths_upscale_models')
        replace_config('inpaint_models_path', 'paths_inpaint')
        replace_config('controlnet_models_path', 'paths_controlnet')
        replace_config('clip_vision_models_path', 'paths_clip_vision')
        replace_config('fooocus_expansion_path', 'path_fooocus_expansion')
        replace_config('temp_outputs_path', 'path_outputs')

        if deprecated_config_dict.get("default_model", None) == 'juggernautXL_version6Rundiffusion.safetensors':
            os.replace('user_path_config.txt', 'user_path_config-deprecated.txt')
            logger.info('Config updated successfully in silence. '
                  'A backup of previous config is written to "user_path_config-deprecated.txt".')
            return

        if input("Newer models and configs are available. "
                 "Download and update files? [Y/n]:") in ['n', 'N', 'No', 'no', 'NO']:
            config_dict.update(deprecated_config_dict)
            logger.info('Loading using deprecated old models and deprecated old configs.')
            return
        else:
            os.replace('user_path_config.txt', 'user_path_config-deprecated.txt')
            logger.info('Config updated successfully by user. '
                  'A backup of previous config is written to "user_path_config-deprecated.txt".')
            return
    except Exception as e:
        logger.info('Processing deprecated config failed')
        logger.info(e)
    return

def _config_path_to_abs(path):
    if not isinstance(path, str) or not path.strip():
        return None
    expanded = os.path.expandvars(os.path.expanduser(path))
    if not os.path.isabs(expanded):
        expanded = os.path.join(shared.root, expanded)
    return os.path.abspath(expanded)


def _path_is_relative_config(path):
    if not isinstance(path, str) or not path.strip():
        return False
    expanded = os.path.expandvars(os.path.expanduser(path))
    return not os.path.isabs(expanded)


def _path_to_config_style(original_path, resolved_path):
    if not isinstance(resolved_path, str) or not resolved_path.strip():
        return original_path
    if _path_is_relative_config(original_path):
        rel_path = os.path.relpath(os.path.abspath(resolved_path), shared.root)
        return os.path.normpath(rel_path)
    return os.path.normpath(resolved_path)


def _package_default_models_root_abs():
    return os.path.abspath(os.path.join(shared.root, "..", "..", "SimpleModels"))


def _path_is_under(path, root):
    try:
        path_norm = os.path.normcase(os.path.normpath(os.path.abspath(path)))
        root_norm = os.path.normcase(os.path.normpath(os.path.abspath(root)))
        return os.path.commonpath([path_norm, root_norm]) == root_norm
    except Exception:
        return False


def _relative_config_path(path):
    return os.path.normpath(os.path.relpath(os.path.abspath(path), shared.root)).replace("\\", "/")


def _path_to_generated_config_style(path):
    resolved = _config_path_to_abs(path)
    if not resolved:
        return path
    if _path_is_relative_config(path):
        return _relative_config_path(resolved)
    if _path_is_under(resolved, _package_default_models_root_abs()):
        return _relative_config_path(resolved)
    return os.path.normpath(resolved)


def _normalize_path_for_compare(path):
    abs_path = _config_path_to_abs(path)
    if not abs_path:
        return None
    resolved = resolve_existing_path_case_insensitive(abs_path) or abs_path
    return os.path.normcase(os.path.normpath(resolved))

def _to_path_list(value):
    if isinstance(value, list):
        return [p for p in value if isinstance(p, str) and p.strip()]
    if isinstance(value, str) and value.strip():
        return [value]
    return []

def _migrate_path_alias(legacy_key, canonical_key):
    global config_dict, always_save_keys, config_needs_write

    legacy_paths = _to_path_list(config_dict.get(legacy_key))
    if not legacy_paths:
        return

    merged = list(_to_path_list(config_dict.get(canonical_key)))
    existing = {p for p in (_normalize_path_for_compare(x) for x in merged) if p}
    added = []
    for path in legacy_paths:
        normalized = _normalize_path_for_compare(path)
        if not normalized or normalized in existing:
            continue
        merged.append(path)
        existing.add(normalized)
        added.append(path)

    config_dict[canonical_key] = merged
    del config_dict[legacy_key]
    if legacy_key in always_save_keys:
        always_save_keys.remove(legacy_key)
    if canonical_key not in always_save_keys:
        always_save_keys.append(canonical_key)
    config_needs_write = True
    logger.info(f'Auto migrated config key "{legacy_key}" -> "{canonical_key}" with paths: {json.dumps(legacy_paths, ensure_ascii=False)}')
    if added:
        logger.info(f'Auto merged alias paths into "{canonical_key}": {json.dumps(added, ensure_ascii=False)}')


if not forge_neo_read_only_user_config:
    try_load_deprecated_user_path_config()
_migrate_path_alias("path_llm", "path_LLM")

def get_gpu_arch_str_in_preset_name():
    if shared.gpu_arch:
        if shared.gpu_arch.lower() == 'sm120':
            return '_fp4'
        else:
            return '_int4'
    return ''


def normalize_preset_supported_tasks(value):
    aliases = {
        "t2i": "text_to_image",
        "text2image": "text_to_image",
        "i2i": "image_edit",
        "image_to_image": "image_edit",
        "multi_edit": "multi_image_edit",
        "t2v": "text_to_video",
        "i2v": "image_to_video",
        "v2v": "video_edit",
        "a2v": "audio_to_video",
        "v2a": "video_to_audio",
        "upscale": "image_upscale",
        "super_resolution": "image_upscale",
        "restore": "image_restore",
        "detail_enhance": "image_detail_enhance",
        "enhance_details": "image_detail_enhance",
        "remove_background": "image_background_removal",
        "background_removal": "image_background_removal",
        "remove_object": "image_object_removal",
        "object_removal": "image_object_removal",
        "outpaint": "image_outpaint",
        "relight": "image_relight",
        "style_transfer": "image_style_transfer",
        "face_swap": "image_face_swap",
        "pose_transfer": "image_pose_transfer",
        "pose_extraction": "image_pose_extraction",
        "anime_to_real": "image_anime_to_real",
        "view_synthesis": "image_view_synthesis",
        "depth_estimation": "image_depth_estimation",
        "feature_transfer": "image_object_transfer",
        "object_transfer": "image_object_transfer",
        "image_feature_transfer": "image_object_transfer",
        "expression_transfer": "image_expression_transfer",
    }
    if isinstance(value, str):
        source = [item.strip() for item in value.split(",")]
    elif isinstance(value, (list, tuple)):
        source = value
    else:
        source = []
    normalized = []
    for item in source:
        task = str(item or "").strip().lower().replace("-", "_").replace(" ", "_")
        task = aliases.get(task, task)
        if re.fullmatch(r"[a-z][a-z0-9_]{1,63}", task or "") and task not in normalized:
            normalized.append(task)
    return normalized


def normalize_preset_interaction_requirements(value):
    if isinstance(value, str):
        source = [item.strip() for item in value.split(",")]
    elif isinstance(value, (list, tuple)):
        source = value
    else:
        source = []
    normalized = []
    for item in source:
        requirement = str(item or "").strip().lower().replace("-", "_").replace(" ", "_")
        if re.fullmatch(r"[a-z][a-z0-9_]{1,63}", requirement or "") and requirement not in normalized:
            normalized.append(requirement)
    return normalized


def resolve_preset_interaction_requirements(preset_content, preset_name=""):
    content = preset_content if isinstance(preset_content, dict) else {}
    engine = content.get("default_engine") if isinstance(content.get("default_engine"), dict) else {}
    scene = engine.get("scene_frontend") if isinstance(engine.get("scene_frontend"), dict) else {}
    for declared in (
        content.get("interaction_requirements"),
        engine.get("interaction_requirements"),
        scene.get("interaction_requirements"),
    ):
        normalized = normalize_preset_interaction_requirements(declared)
        if normalized:
            return normalized

    task_method = scene.get("task_method") or ""
    if isinstance(task_method, dict):
        method_text = " ".join(str(item or "") for item in task_method.values())
    else:
        method_text = str(task_method or "")
    descriptor = f"{preset_name} {scene.get('theme_title') or ''} {method_text}".lower()
    if any(marker in descriptor for marker in ("eraser", "clothing_fp4", "clothing_int4", "feature transfer")):
        return ["mask"]
    return []


def resolve_preset_supported_tasks(preset_content, preset_name=""):
    content = preset_content if isinstance(preset_content, dict) else {}
    engine = content.get("default_engine") if isinstance(content.get("default_engine"), dict) else {}
    scene = engine.get("scene_frontend") if isinstance(engine.get("scene_frontend"), dict) else {}
    for declared in (
        content.get("supported_tasks"),
        engine.get("supported_tasks"),
        scene.get("supported_tasks"),
    ):
        normalized = normalize_preset_supported_tasks(declared)
        if normalized:
            return normalized

    backend_params = engine.get("backend_params") if isinstance(engine.get("backend_params"), dict) else {}
    raw_method = scene.get("task_method") or backend_params.get("task_method") or ""
    if isinstance(raw_method, dict):
        method_text = " ".join(str(item or "") for item in raw_method.values())
    elif isinstance(raw_method, list):
        method_text = " ".join(str(item or "") for item in raw_method)
    else:
        method_text = str(raw_method or "")
    descriptor = " ".join(
        str(item or "").strip().lower()
        for item in (preset_name, method_text, scene.get("theme_title"))
    )
    engine_type = str(engine.get("engine_type") or "image").strip().lower()
    raw_hidden = scene.get("disvisible") if isinstance(scene.get("disvisible"), list) else []
    hidden = {str(item or "") for item in raw_hidden}
    raw_enabled = scene.get("divisible") if isinstance(scene.get("divisible"), list) else []
    enabled = {str(item or "") for item in raw_enabled}
    standard_image_slots = ("scene_canvas_image", "scene_input_image1", "scene_input_image2")
    optional_image_slots = tuple(f"scene_input_image{index}" for index in range(3, 9))
    image_slots = [
        slot
        for slot in standard_image_slots + optional_image_slots
        if scene and slot not in hidden and (slot in standard_image_slots or slot in enabled)
    ]

    if engine_type == "video":
        if any(marker in descriptor for marker in ("lip sync", "lip_sync", "infinitetalk")):
            if "av2v" in descriptor:
                return ["video_audio_to_video", "lip_sync"]
            return ["image_audio_to_video", "lip_sync"]
        if any(marker in descriptor for marker in ("foley", "audio_gen", "video to audio")):
            return ["video_to_audio"]
        if any(marker in descriptor for marker in ("ia2v", "image+audio")):
            return ["image_audio_to_video"]
        if any(marker in descriptor for marker in ("ta2v", "text+audio")):
            return ["audio_to_video"]
        if any(marker in descriptor for marker in ("t2v", "text-to-video", "text to video")):
            return ["text_to_video"]
        if any(marker in descriptor for marker in ("multi_i2v", "multi-i2v")):
            return ["image_to_video", "multi_image_to_video"]
        if any(marker in descriptor for marker in ("i2v", "image-to-video", "image to video")):
            tasks = ["image_to_video"]
            if len(image_slots) > 1:
                tasks.append("multi_image_to_video")
            return tasks
        specialized_video_tasks = []
        video_task_markers = (
            (("upscale", "super-resolution", "super resolution", "nvidia_vsr"), "video_upscale"),
            (("frame interpolation", "interpolation"), "video_frame_interpolation"),
            (("restore", "video_restore"), "video_restore"),
            (("subtitle", "subtitles_remove"), "video_subtitle_removal"),
            (("watermark", "watermark_remove"), "video_watermark_removal"),
            (("outpaint", "video_outpaint"), "video_outpaint"),
            (("extent", "extend", "video_extend"), "video_extend"),
            (("remover", "object removal", "object_removal"), "video_object_removal"),
            (("face swap", "faceswap", "face_swap", "sam3_face"), "video_face_swap"),
            (("motion transfer", "motion_transfer", "animate_pose"), "video_motion_transfer"),
            (("object replacement", "sam3_replace"), "video_object_replace"),
            (("person replacement", "character replacement", "sam3_person"), "video_person_replace"),
            (("expression", "liveportrait"), "video_expression_transfer"),
        )
        for markers, task in video_task_markers:
            if any(marker in descriptor for marker in markers):
                specialized_video_tasks.append(task)
        if specialized_video_tasks:
            return specialized_video_tasks
        return ["video_edit"]

    if not scene or not image_slots:
        return ["text_to_image"]
    if "cloud_image_generate" in descriptor:
        return ["text_to_image", "image_edit", "multi_image_edit"]
    specialized_image_tasks = (
        (("ttp", "upscale", "super-resolution", "super resolution"), "image_upscale"),
        (("imagerepair", "image repair", "restore"), "image_restore"),
        (("removebg", "remove background", "background removal"), "image_background_removal"),
        (("outpaint",), "image_outpaint"),
        (("relight", "anglelight", "angle light"), "image_relight"),
        (("styletransfer", "style transfer"), "image_style_transfer"),
        (("swapface", "face swap"), "image_face_swap"),
        (("pose editor", "qwenpose", "kleinpose"), "image_pose_transfer"),
        (("onekeypose", "dw_pose", "sdpose"), "image_pose_extraction"),
        (("a2r", "anime-to-real", "anime to real"), "image_anime_to_real"),
        (("multiangle", "multi-angle", "multi angle"), "image_view_synthesis"),
        (("depthstatue", "depth map", "depth estimation"), "image_depth_estimation"),
        (("clothing_fp4", "clothing_int4", "feature transfer", "object transfer"), "image_object_transfer"),
        (("liveportrait", "expression"), "image_expression_transfer"),
        (("eraser", "remove anything", "object removal"), "image_object_removal"),
    )
    for markers, task in specialized_image_tasks:
        if any(marker in descriptor for marker in markers):
            return [task]
    tasks = ["image_edit"]
    if len(image_slots) > 1:
        tasks.append("multi_image_edit")
    return tasks

def try_get_preset_content(preset, user_did=None):
    if isinstance(preset, str):
        try:
            arch_str = get_gpu_arch_str_in_preset_name()
            if preset.endswith('.'):
                if user_did is None:
                    user_did=shared.token.get_guest_did()
                preset_path = os.path.join(get_path_in_user_dir('presets', user_did), f'{preset[:-1]}.json')
                preset_path2 = os.path.join(get_path_in_user_dir('presets', user_did), f'{preset[:-1]}{arch_str}.json')
            else:
                preset_path = os.path.join(os.path.abspath('./presets/'), f'{preset}.json')
                preset_path2 = os.path.join(os.path.abspath('./presets/'), f'{preset}{arch_str}.json')
            if os.path.exists(preset_path2):
                preset_path = preset_path2
            if os.path.exists(preset_path):
                with open(preset_path, "r", encoding="utf-8") as json_file:
                    json_content = json.load(json_file)
                    logger.debug(f'Loaded preset: {preset_path}')

                    has_default_engine = 'default_engine' in json_content

                    default_engine_has_backend = False
                    if has_default_engine and isinstance(json_content['default_engine'], dict):
                        default_engine_has_backend = 'backend_engine' in json_content['default_engine']

                    if has_default_engine and isinstance(json_content['default_engine'], dict) and not default_engine_has_backend:
                        json_content['default_engine']['backend_engine'] = 'Fooocus'
                    elif not has_default_engine:
                        json_content['default_engine'] = {'backend_engine': 'Fooocus'}

                    json_content["supported_tasks"] = resolve_preset_supported_tasks(json_content, preset)
                    json_content["interaction_requirements"] = resolve_preset_interaction_requirements(json_content, preset)

                    return json_content
            else:
                raise FileNotFoundError
        except Exception as e:
            logger.info(f'Load preset [{preset_path}] failed')
            logger.info(e)
    return {}

preset = args_manager.args.preset
config_dict.update(try_get_preset_content(preset))
theme = args_manager.args.theme

def get_path_userhome() -> str:
    """
    Checking users path argument and overriding default path.
    """
    path_userhome = userhome_path
    if args_manager.args.userhome_path:
        if not forge_neo_read_only_user_config:
            makedirs_with_log(_config_path_to_abs(path_userhome))
    else:
        path_userhome = get_dir_or_set_default('path_userhome', userhome_path)
    _log_info_once("path_userhome", f'The path_userhome: {os.path.abspath(path_userhome)}')
    return path_userhome

def get_path_models_root() -> str:
    global config_dict, always_save_keys, config_needs_write

    if args_manager.args.models_root:
        path_models_root = _path_to_generated_config_style(args_manager.args.models_root)
        makedirs_with_log(_config_path_to_abs(path_models_root))
        if "path_models_root" not in config_dict:
            config_dict["path_models_root"] = path_models_root
            config_needs_write = True
            logger.info(f'Auto added missing config key "path_models_root" with command line value: {json.dumps(path_models_root, ensure_ascii=False)}')
        if "path_models_root" not in always_save_keys:
            always_save_keys.append("path_models_root")
    else:
        path_models_root = get_dir_or_set_default('path_models_root', 'models')
    _log_info_once("path_models_root", f'The path_models_root: {os.path.abspath(path_models_root)}')
    return path_models_root

def _get_path_defaults(key, default_value):
    template_value = config_template_dict.get(key, None)
    if isinstance(default_value, list) and isinstance(template_value, list) and template_value:
        return template_value
    return default_value

def _merge_missing_path_defaults(key, current_value, default_value):
    global config_dict, config_needs_write

    if not isinstance(default_value, list):
        return current_value

    if isinstance(current_value, list):
        merged = [p for p in current_value if isinstance(p, str) and p.strip()]
    elif isinstance(current_value, str) and current_value.strip():
        merged = [current_value]
    else:
        return current_value

    existing = {p for p in (_normalize_path_for_compare(x) for x in merged) if p}
    added = []
    for default_path in default_value:
        normalized = _normalize_path_for_compare(default_path)
        if not normalized or normalized in existing:
            continue
        merged.append(default_path)
        existing.add(normalized)
        added.append(default_path)

    if not added:
        return current_value

    config_dict[key] = merged
    config_needs_write = True
    logger.info(f'Auto updated config key "{key}" with missing default paths: {json.dumps(added, ensure_ascii=False)}')
    return merged

def _path_is_existing_dir(path):
    try:
        abs_path = _config_path_to_abs(path)
        if not abs_path:
            return False
        resolved = resolve_existing_path_case_insensitive(abs_path) or abs_path
        return os.path.exists(resolved) and os.path.isdir(resolved)
    except OSError as error:
        logger.info(f'Directory {path} could not be checked, reason: {error}')
        return False


def _resolve_configured_dir_path(path):
    if not isinstance(path, str) or not path.strip():
        return path
    abs_path = _config_path_to_abs(path)
    resolved = resolve_existing_path_case_insensitive(abs_path) or abs_path
    if resolved and os.path.isdir(resolved):
        return _path_to_config_style(path, resolved)
    return path


def _dedupe_paths(paths):
    result = []
    seen = set()
    for path in paths:
        if not isinstance(path, str) or not path.strip():
            continue
        key = _normalize_path_for_compare(path)
        if not key:
            continue
        if key in seen:
            continue
        seen.add(key)
        result.append(path)
    return result


def _build_default_dir_value(resolved_default_value, as_array=False, make_directory=True):
    if isinstance(resolved_default_value, list):
        dp = []
        for path in resolved_default_value:
            if not isinstance(path, str) or not path.strip():
                continue
            expanded = os.path.expandvars(os.path.expanduser(path))
            abs_path = _config_path_to_abs(path)
            if not os.path.isabs(expanded):
                path = _relative_config_path(abs_path)
            dp.append(path)
            if make_directory:
                makedirs_with_log(abs_path)
        return _dedupe_paths(dp)

    dp = _config_path_to_abs(resolved_default_value)
    if make_directory:
        makedirs_with_log(dp)
    expanded_default = os.path.expandvars(os.path.expanduser(resolved_default_value))
    if not os.path.isabs(expanded_default):
        dp = _relative_config_path(dp)
    if as_array:
        dp = [dp]
    return dp


def get_dir_or_set_default(key, default_value, as_array=False, make_directory=True):
    global config_dict, visited_keys, always_save_keys, config_needs_write

    if key not in visited_keys:
        visited_keys.append(key)

    if key not in always_save_keys:
        always_save_keys.append(key)

    had_config_value = key in config_dict
    v = os.getenv(key)
    if v is not None:
        logger.info(f"Environment: {key} = {v}")
        config_dict[key] = v
    else:
        v = config_dict.get(key, None)

    resolved_default_value = _get_path_defaults(key, default_value)
    v = _merge_missing_path_defaults(key, v, resolved_default_value)

    if isinstance(v, str):
        resolved_v = _resolve_configured_dir_path(v)
        if make_directory:
            makedirs_with_log(_config_path_to_abs(resolved_v) or resolved_v)
        if _path_is_existing_dir(resolved_v):
            if resolved_v != v:
                config_dict[key] = resolved_v
                config_needs_write = True
                logger.info(f'Auto normalized config key "{key}" path casing to: {json.dumps(resolved_v, ensure_ascii=False)}')
            return resolved_v if not as_array else [resolved_v]
        if had_config_value or v is not None:
            logger.info(f'Config key {json.dumps({key:v})} is not currently accessible; preserving the configured value.')
            fallback_value = _build_default_dir_value(resolved_default_value, as_array, make_directory)
            logger.info(f'Using runtime fallback for config key "{key}": {json.dumps(fallback_value, ensure_ascii=False)}')
            return fallback_value
    elif isinstance(v, list):
        configured_paths = [d for d in v if isinstance(d, str) and d.strip()]
        resolved_paths = [_resolve_configured_dir_path(d) for d in configured_paths]
        if make_directory:
            for resolved_path in resolved_paths:
                makedirs_with_log(_config_path_to_abs(resolved_path) or resolved_path)
        invalid_paths = [d for d in resolved_paths if not _path_is_existing_dir(d)]
        if configured_paths:
            if resolved_paths != configured_paths:
                config_dict[key] = resolved_paths
                config_needs_write = True
                logger.info(f'Auto normalized config key "{key}" path casing to: {json.dumps(resolved_paths, ensure_ascii=False)}')
            valid_paths = _dedupe_paths([d for d in resolved_paths if _path_is_existing_dir(d)])
            if args_manager.args.models_root and isinstance(resolved_default_value, list):
                default_paths = _build_default_dir_value(resolved_default_value, True, make_directory=False)
                valid_default_paths = [d for d in default_paths if _path_is_existing_dir(d)]
                valid_paths = _dedupe_paths(valid_default_paths + valid_paths)
            if invalid_paths:
                logger.info(f'Config key "{key}" has paths that are not currently accessible; preserving the configured list: {json.dumps(invalid_paths, ensure_ascii=False)}')
            if valid_paths:
                return valid_paths
            fallback_value = _build_default_dir_value(resolved_default_value, True, make_directory)
            logger.info(f'Using runtime fallback for config key "{key}": {json.dumps(fallback_value, ensure_ascii=False)}')
            return fallback_value

    if v is not None:
        logger.info(f'Failed to load config key: {json.dumps({key:v})} is invalid or does not exist; will use {json.dumps({key:resolved_default_value})} instead.')
    dp = _build_default_dir_value(resolved_default_value, as_array, make_directory)
    config_dict[key] = dp
    config_needs_write = True
    if not had_config_value:
        logger.info(f'Auto added missing config key "{key}" with default paths: {json.dumps(dp, ensure_ascii=False)}')
    return dp

path_userhome = get_path_userhome()
path_models_root = get_path_models_root()
paths_checkpoints = get_dir_or_set_default('path_checkpoints', [f'{path_models_root}/checkpoints/', 'models/checkpoints/'], True)
paths_loras = get_dir_or_set_default('path_loras', [f'{path_models_root}/loras/', 'models/loras/'], True)
paths_embeddings = get_dir_or_set_default('path_embeddings', [f'{path_models_root}/embeddings/'], True)
paths_configs = get_dir_or_set_default('path_configs', [f'{path_models_root}/configs/'], True)
paths_vae_approx = get_dir_or_set_default('path_vae_approx', [f'{path_models_root}/vae_approx/'], True)
paths_vae = get_dir_or_set_default('path_vae', [f'{path_models_root}/vae/'], True)
paths_upscale_models = get_dir_or_set_default('path_upscale_models', [f'{path_models_root}/upscale_models/'], True)
paths_latent_upscale_models = get_dir_or_set_default('path_latent_upscale_models', [f'{path_models_root}/latent_upscale_models/', 'models/latent_upscale_models/'], True)
paths_inpaint = get_dir_or_set_default('path_inpaint', [f'{path_models_root}/inpaint/', 'models/inpaint/'], True)
paths_controlnet = get_dir_or_set_default('path_controlnet', [f'{path_models_root}/controlnet/', 'models/controlnet/'], True)
paths_clip = get_dir_or_set_default('path_clip', [f'{path_models_root}/clip/'], True)
paths_clip_vision = get_dir_or_set_default('path_clip_vision', [f'{path_models_root}/clip_vision/'], True)
path_fooocus_expansion = get_dir_or_set_default('path_fooocus_expansion', f'{path_models_root}/prompt_expansion/fooocus_expansion/')
paths_llms = get_dir_or_set_default('path_llms', [f'{path_models_root}/llms/'], True)
paths_LLM = get_dir_or_set_default('path_LLM', [f'{path_models_root}/LLM/'], True)
paths_wildcards = get_dir_or_set_default('path_wildcards', [f'{path_models_root}/wildcards/'], True)
paths_safety_checker = get_dir_or_set_default('path_safety_checker', [f'{path_models_root}/safety_checker/'], True)
paths_sams = get_dir_or_set_default('path_sams', f'{path_models_root}/sams', True)
path_sam = paths_sams[0]
paths_unet = get_dir_or_set_default('path_unet', f'{path_models_root}/unet', True)
paths_rembg = get_dir_or_set_default('path_rembg', f'{path_models_root}/rembg', True)
paths_birefnet = get_dir_or_set_default('path_birefnet', f'{path_models_root}/birefnet', True)
paths_layer_model = get_dir_or_set_default('path_layer_model', f'{path_models_root}/layer_model', True)
paths_diffusers = get_dir_or_set_default('path_diffusers', [f'{path_models_root}/diffusers/'], True)
paths_ipadapter = get_dir_or_set_default('path_ipadapter', f'{path_models_root}/ipadapter', True)
paths_pulid = get_dir_or_set_default('path_pulid', f'{path_models_root}/pulid', True)
paths_insightface = get_dir_or_set_default('path_insightface', f'{path_models_root}/insightface', True)
paths_style_models = get_dir_or_set_default('path_style_models', f'{path_models_root}/style_models', True)
paths_gligen = get_dir_or_set_default('path_gligen', f'{path_models_root}/gligen', True)
paths_hypernetworks = get_dir_or_set_default('path_hypernetworks', f'{path_models_root}/hypernetworks', True)
paths_photomaker = get_dir_or_set_default('path_photomaker', f'{path_models_root}/photomaker', True)
paths_audio_encoders = get_dir_or_set_default('path_audio_encoders', f'{path_models_root}/audio_encoders', True)
paths_background_removal = get_dir_or_set_default('path_background_removal', f'{path_models_root}/background_removal', True)
paths_frame_interpolation = get_dir_or_set_default('path_frame_interpolation', f'{path_models_root}/frame_interpolation', True)
paths_geometry_estimation = get_dir_or_set_default('path_geometry_estimation', f'{path_models_root}/geometry_estimation', True)
paths_optical_flow = get_dir_or_set_default('path_optical_flow', f'{path_models_root}/optical_flow', True)
paths_model_patches = get_dir_or_set_default('path_model_patches', f'{path_models_root}/model_patches', True)
paths_grounding_dino = get_dir_or_set_default('path_grounding_dino', f'{path_models_root}/grounding-dino', True)
paths_detection = get_dir_or_set_default('path_detection', f'{path_models_root}/detection', True)
paths_ultralytics = get_dir_or_set_default('path_ultralytics', f'{path_models_root}/ultralytics', True)
paths_liveportrait = get_dir_or_set_default('path_liveportrait', f'{path_models_root}/liveportrait', True)
paths_bbox = get_dir_or_set_default('path_bbox', f'{path_models_root}/ultralytics/bbox', True)
paths_segm = get_dir_or_set_default('path_segm', f'{path_models_root}/ultralytics/segm', True)
paths_diffusion_models = get_dir_or_set_default('path_diffusion_models', f'{path_models_root}/diffusion_models', True)
paths_text_encoders = get_dir_or_set_default('path_text_encoders', f'{path_models_root}/text_encoders', True)
paths_sam3 = get_dir_or_set_default('path_sam3', f'{path_models_root}/sam3', True)
paths_sam3dbody = get_dir_or_set_default('path_sam3dbody', f'{path_models_root}/sam3dbody', True)
paths_sharp = get_dir_or_set_default('path_sharp', f'{path_models_root}/sharp', True)
paths_lsnet = get_dir_or_set_default('path_lsnet', f'{path_models_root}/lsnet', True)
paths_SEEDVR2 = get_dir_or_set_default('path_SEEDVR2', f'{path_models_root}/SEEDVR2', True)
paths_hunyuan_foley = get_dir_or_set_default('path_hunyuan_foley', f'{path_models_root}/hunyuan_foley', True)
paths_qwen_tts = get_dir_or_set_default('path_qwen_tts', f'{path_models_root}/qwen-tts', True)



model_cata_map = {
    'checkpoints': paths_diffusion_models + paths_checkpoints,
    'loras': paths_loras,
    'embeddings': paths_embeddings,
    'configs': paths_configs,
    'diffusers': paths_diffusers,
    'DIFFUSERS': paths_diffusers,
    'vae': paths_vae,
    'vae_approx': paths_vae_approx,
    'upscale_models': paths_upscale_models,
    'latent_upscale_models': paths_latent_upscale_models,
    'inpaint': paths_inpaint,
    'controlnet': paths_controlnet,
    'clip': paths_text_encoders + paths_clip,
    'clip_vision': paths_clip_vision,
    'llms': paths_llms,
    'LLM': paths_LLM,
    'unet': paths_unet + paths_diffusion_models + paths_checkpoints,
    'rembg': paths_rembg,
    'birefnet': paths_birefnet,
    'layer_model': paths_layer_model,
    'pulid': paths_pulid,
    'ipadapter': paths_ipadapter + paths_controlnet,
    'insightface': paths_insightface,
    'style_models': paths_style_models,
    'gligen': paths_gligen,
    'hypernetworks': paths_hypernetworks,
    'photomaker': paths_photomaker,
    'audio_encoders': paths_audio_encoders,
    'background_removal': paths_background_removal,
    'frame_interpolation': paths_frame_interpolation,
    'geometry_estimation': paths_geometry_estimation,
    'optical_flow': paths_optical_flow,
    'model_patches': paths_model_patches,
    'grounding-dino': paths_grounding_dino,
    'detection': paths_detection,
    'ultralytics': paths_ultralytics,
    'liveportrait': paths_liveportrait,
    'bbox': paths_bbox,
    'segm': paths_segm,
    'diffusion_models': paths_unet + paths_diffusion_models + paths_checkpoints,
    'text_encoders': paths_text_encoders + paths_clip,
    'sam3': paths_sam3,
    'sam3dbody': paths_sam3dbody,
    'sharp': paths_sharp,
    'lsnet': paths_lsnet,
    'sams': paths_sams,
    'seedvr2': paths_SEEDVR2,
    'SEEDVR2': paths_SEEDVR2,
    'hunyuan_foley': paths_hunyuan_foley,
    'qwen-tts': paths_qwen_tts,
    }

def _normalize_model_dirs(paths):
    out = []
    seen = set()
    if not paths:
        return out
    for p in paths:
        if not p or not isinstance(p, str):
            continue
        try:
            p2 = os.path.expandvars(os.path.expanduser(p))
            if not os.path.isabs(p2):
                p2 = os.path.join(shared.root, p2)
            p2 = os.path.normpath(os.path.abspath(p2))
        except Exception:
            continue
        if p2 in seen:
            continue
        seen.add(p2)
        out.append(p2)
    return out

MODEL_ROOT_CATEGORY_FOLDERS = {
    'checkpoints': ('diffusion_models', 'checkpoints'),
    'diffusion_models': ('unet', 'diffusion_models', 'checkpoints'),
    'unet': ('unet', 'diffusion_models', 'checkpoints'),
    'clip': ('text_encoders', 'clip'),
    'text_encoders': ('text_encoders', 'clip'),
    'clip_vision': ('clip_vision', 'ipadapter'),
    'ipadapter': ('ipadapter', 'controlnet'),
    'background_removal': ('background_removal',),
    'grounding-dino': ('grounding-dino',),
    'detection': ('detection',),
    'geometry_estimation': ('geometry_estimation',),
    'lsnet': ('lsnet',),
    'optical_flow': ('optical_flow',),
    'ultralytics': ('ultralytics',),
    'liveportrait': ('liveportrait',),
    'bbox': ('ultralytics/bbox',),
    'segm': ('ultralytics/segm',),
    'LLM': ('LLM', 'llm'),
    'llms': ('llms', 'LLM', 'llm'),
    'seedvr2': ('SEEDVR2',),
    'SEEDVR2': ('SEEDVR2',),
    'qwen-tts': ('qwen-tts',),
}

def _root_from_category_path(path, folder):
    normalized = _normalize_model_dirs([path])
    if not normalized or not folder:
        return None
    path_norm = os.path.normpath(normalized[0])
    folder_norm = os.path.normpath(str(folder))
    path_parts = [p for p in path_norm.split(os.sep) if p]
    folder_parts = [p for p in folder_norm.split(os.sep) if p]
    if len(path_parts) < len(folder_parts):
        return None
    path_tail = [os.path.normcase(p) for p in path_parts[-len(folder_parts):]]
    folder_tail = [os.path.normcase(p) for p in folder_parts]
    if path_tail != folder_tail:
        return None
    root = path_norm
    for _ in folder_parts:
        root = os.path.dirname(root)
    return root or None

def _infer_extra_model_roots_from_path_map(path_map):
    root_categories = {}
    for category, paths in (path_map or {}).items():
        folders = MODEL_ROOT_CATEGORY_FOLDERS.get(category, (category,))
        for raw_path in paths or []:
            for folder in folders:
                root = _root_from_category_path(raw_path, folder)
                if not root:
                    continue
                key = os.path.normcase(os.path.normpath(root))
                root_categories.setdefault(key, {'root': root, 'categories': set()})['categories'].add(category)
    return [
        item['root']
        for item in root_categories.values()
        if len(item['categories']) >= 2
    ]

def _extra_model_root_category_dirs(catalog):
    folders = MODEL_ROOT_CATEGORY_FOLDERS.get(catalog, (catalog,))
    paths = []
    for root in _infer_extra_model_roots_from_path_map(globals().get('model_cata_map', {})):
        paths.extend(os.path.join(root, folder) for folder in folders)
    return _normalize_model_dirs(paths)

def _model_root_category_dirs(catalog):
    folders = MODEL_ROOT_CATEGORY_FOLDERS.get(catalog, (catalog,))
    paths = [os.path.join(path_models_root, folder) for folder in folders]
    return _normalize_model_dirs(paths + _extra_model_root_category_dirs(catalog))

def _with_model_root_category_dirs(catalog, paths):
    return _dedupe_paths(_model_root_category_dirs(catalog) + _normalize_model_dirs(paths))

model_cata_map = {k: _with_model_root_category_dirs(k, v) for k, v in model_cata_map.items()}

def _build_modelsinfo_path_map(path_map: Dict[str, List[str]]) -> Dict[str, List[str]]:
    def base_name(p: str) -> str:
        try:
            return os.path.basename(os.path.normpath(p)).lower()
        except Exception:
            return ""

    out: Dict[str, List[str]] = {k: list(v) for k, v in (path_map or {}).items()}

    def keep_only_not(paths: List[str], banned_basenames: set[str]) -> List[str]:
        return [p for p in paths if base_name(p) not in banned_basenames]

    def keep_only_in(paths: List[str], allowed_basenames: set[str]) -> List[str]:
        return [p for p in paths if base_name(p) in allowed_basenames]

    if "unet" in out:
        out["unet"] = _with_model_root_category_dirs("unet", paths_unet)
    if "diffusion_models" in out:
        out["diffusion_models"] = _with_model_root_category_dirs("diffusion_models", paths_diffusion_models)
    if "checkpoints" in out:
        out["checkpoints"] = _with_model_root_category_dirs("checkpoints", paths_checkpoints)

    if "clip" in out:
        out["clip"] = _with_model_root_category_dirs("clip", paths_clip)
    if "text_encoders" in out:
        out["text_encoders"] = _with_model_root_category_dirs("text_encoders", paths_text_encoders)
    if "clip_vision" in out:
        out["clip_vision"] = _with_model_root_category_dirs("clip_vision", paths_clip_vision)
    if "ipadapter" in out:
        out["ipadapter"] = _with_model_root_category_dirs("ipadapter", paths_ipadapter)

    return out
modelsinfo = init_modelsinfo(path_models_root, _build_modelsinfo_path_map(model_cata_map))

shared.path_userhome = path_userhome
shared.token.set_user_base_dir(path_userhome)
default_workspace_did = shared.token.get_default_workspace_did() if hasattr(shared.token, "get_default_workspace_did") else shared.token.get_guest_did()
if getattr(shared.token, "skip_default_outputs_init", False):
    path_outputs = os.path.abspath(shared.token.get_path_in_user_dir(default_workspace_did, "outputs"))
else:
    path_outputs = shared.token.get_path_in_user_dir(default_workspace_did, "outputs")
    if not os.path.exists(path_outputs):
        os.makedirs(path_outputs, exist_ok=True)

def get_user_path_outputs(user_did=None):
    if user_did is None:
        user_did = shared.token.get_default_workspace_did() if hasattr(shared.token, "get_default_workspace_did") else shared.token.get_guest_did()
    user_path_outputs = shared.token.get_path_in_user_dir(user_did, "outputs")
    if not os.path.exists(user_path_outputs):
        os.makedirs(user_path_outputs, exist_ok=True)
    return user_path_outputs

def get_config_item_or_set_default(key, default_value, validator, disable_empty_as_none=False, expected_type=None):
    global config_dict, visited_keys

    if key not in visited_keys:
        visited_keys.append(key)

    v = os.getenv(key)
    if v is not None:
        v = try_eval_env_var(v, expected_type)
        logger.info(f"Environment: {key} = {v}")
        config_dict[key] = v

    if key not in config_dict:
        config_dict[key] = default_value
        return default_value

    v = config_dict.get(key, None)
    if not disable_empty_as_none:
        if v is None or v == '':
            v = 'None'
    if validator(v):
        return v
    else:
        if v is not None:
            logger.info(f'Failed to load config key: {json.dumps({key:v})} is invalid; will use {json.dumps({key:default_value})} instead.')
        config_dict[key] = default_value
        return default_value

def init_temp_path(path: str | None, default_path: str) -> str:
    if args_manager.args.temp_path:
        path = args_manager.args.temp_path

    if path != '' and path != default_path:
        try:
            if not os.path.isabs(path):
                path = os.path.abspath(path)
            os.makedirs(path, exist_ok=True)
            logging.info(f'Using temp path {path}')
            return path
        except Exception as e:
            logger.info(f'Could not create temp path {path}. Reason: {e}')
            logger.info(f'Using default temp path {default_path} instead.')

    os.makedirs(default_path, exist_ok=True)
    return default_path


default_loras = get_config_item_or_set_default(
    key='default_loras',
    default_value=[
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ],
        [
            True,
            "None",
            1.0
        ]
    ],
    validator=lambda x: isinstance(x, list) and all(
        len(y) == 3 and isinstance(y[0], bool) and isinstance(y[1], str) and isinstance(y[2], numbers.Number)
        or len(y) == 2 and isinstance(y[0], str) and isinstance(y[1], numbers.Number)
        for y in x)
)
default_loras = [(y[0], y[1].replace('\\', os.sep).replace('/', os.sep), y[2]) if len(y) == 3 else (True, y[0].replace('\\', os.sep).replace('/', os.sep), y[1]) for y in default_loras]
default_max_lora_number = get_config_item_or_set_default(
    key='default_max_lora_number',
    default_value=10,
    validator=lambda x: isinstance(x, int) and x == 10
)


default_temp_path = os.path.join(tempfile.gettempdir(), 'simpai')
temp_path = init_temp_path(get_config_item_or_set_default(
    key='temp_path',
    default_value=default_temp_path,
    validator=lambda x: isinstance(x, str),
    expected_type=str
), default_temp_path)
shared.temp_path = temp_path

temp_path_cleanup_on_launch = get_config_item_or_set_default(
    key='temp_path_cleanup_on_launch',
    default_value=True,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_engine = get_config_item_or_set_default(
    key='default_engine',
    default_value={},
    validator=lambda x: isinstance(x, dict),
    expected_type=dict
)
backend_engine = "Remote" if args_manager.args.disable_backend else default_engine.get("backend_engine", "Z-image")

default_base_model_name = default_model = get_config_item_or_set_default(
    key='default_model',
    default_value='model.safetensors',
    validator=lambda x: isinstance(x, str),
    expected_type=str
).replace('\\', os.sep).replace('/', os.sep)

previous_default_models = get_config_item_or_set_default(
    key='previous_default_models',
    default_value=[],
    validator=lambda x: isinstance(x, list) and all(isinstance(k, str) for k in x),
    expected_type=list
)
default_refiner_model_name = default_refiner = get_config_item_or_set_default(
    key='default_refiner',
    default_value='None',
    validator=lambda x: isinstance(x, str),
    expected_type=str
).replace('\\', os.sep).replace('/', os.sep)

default_refiner_switch = get_config_item_or_set_default(
    key='default_refiner_switch',
    default_value=0.8,
    validator=lambda x: isinstance(x, numbers.Number) and 0 <= x <= 1,
    expected_type=numbers.Number
)
default_loras_min_weight = get_config_item_or_set_default(
    key='default_loras_min_weight',
    default_value=ads.default['loras_min_weight'],
    validator=lambda x: isinstance(x, numbers.Number) and -10 <= x <= 10,
    expected_type=numbers.Number
)
default_loras_max_weight = get_config_item_or_set_default(
    key='default_loras_max_weight',
    default_value=ads.default['loras_max_weight'],
    validator=lambda x: isinstance(x, numbers.Number) and -10 <= x <= 10,
    expected_type=numbers.Number
)
default_cfg_scale = get_config_item_or_set_default(
    key='default_cfg_scale',
    default_value=7.0,
    validator=lambda x: isinstance(x, numbers.Number),
    expected_type=numbers.Number
)
default_sample_sharpness = get_config_item_or_set_default(
    key='default_sample_sharpness',
    default_value=2.0,
    validator=lambda x: isinstance(x, numbers.Number),
    expected_type=numbers.Number
)
default_sampler = get_config_item_or_set_default(
    key='default_sampler',
    default_value=ads.default['sampler_name'],
    validator=lambda x: x in modules.flags.sampler_list if backend_engine == 'Fooocus' else modules.flags.comfy_sampler_list,
    expected_type=str
)
default_scheduler = get_config_item_or_set_default(
    key='default_scheduler',
    default_value=ads.default['scheduler_name'],
    validator=lambda x: x in modules.flags.scheduler_list if backend_engine == 'Fooocus' else modules.flags.comfy_scheduler_list,
    expected_type=str
)
default_vae = get_config_item_or_set_default(
    key='default_vae',
    default_value=modules.flags.default_vae,
    validator=lambda x: isinstance(x, str),
    expected_type=str
)
default_clip_model = get_config_item_or_set_default(
    key='default_clip_model',
    default_value=modules.flags.default_clip,
    validator=lambda x: isinstance(x, str),
    expected_type=str
).replace('\\', os.sep).replace('/', os.sep)
default_upscale_model = get_config_item_or_set_default(
    key='default_upscale_model',
    default_value='default',
    validator=lambda x: isinstance(x, str),
    expected_type=str
).replace('\\', os.sep).replace('/', os.sep)
default_styles = get_config_item_or_set_default(
    key='default_styles',
    default_value=[
        "Fooocus V2",
        "Fooocus Enhance",
        "Fooocus Sharp"
    ],
    validator=lambda x: isinstance(x, list) and all(y in modules.sdxl_styles.legal_style_names for y in x),
    expected_type=list
)
default_prompt_negative = get_config_item_or_set_default(
    key='default_prompt_negative',
    default_value='',
    validator=lambda x: isinstance(x, str),
    disable_empty_as_none=True,
    expected_type=str
)
default_prompt = get_config_item_or_set_default(
    key='default_prompt',
    default_value='',
    validator=lambda x: isinstance(x, str),
    disable_empty_as_none=True,
    expected_type=str
)
default_performance = get_config_item_or_set_default(
    key='default_performance',
    default_value=Performance.SPEED.value,
    validator=lambda x: x in Performance.values(),
    expected_type=str
)
default_image_prompt_checkbox = get_config_item_or_set_default(
    key='default_image_prompt_checkbox',
    default_value=False,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_enhance_checkbox = get_config_item_or_set_default(
    key='default_enhance_checkbox',
    default_value=False,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_advanced_checkbox = get_config_item_or_set_default(
    key='default_advanced_checkbox',
    default_value=ads.default['advanced_checkbox'],
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_developer_debug_mode_checkbox = get_config_item_or_set_default(
    key='default_developer_debug_mode_checkbox',
    default_value=ads.default['developer_debug_mode_checkbox'],
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_image_prompt_advanced_checkbox = get_config_item_or_set_default(
    key='default_image_prompt_advanced_checkbox',
    default_value=True,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_max_image_number = get_config_item_or_set_default(
    key='default_max_image_number',
    default_value=ads.default['max_image_number'],
    validator=lambda x: isinstance(x, int) and x >= 1,
    expected_type=int
)
default_output_format = get_config_item_or_set_default(
    key='default_output_format',
    default_value=ads.default['output_format'],
    validator=lambda x: x in OutputFormat.list(),
    expected_type=str
)
default_image_number = get_config_item_or_set_default(
    key='default_image_number',
    default_value=ads.default['image_number'],
    validator=lambda x: isinstance(x, int) and 1 <= x <= default_max_image_number,
    expected_type=int
)
checkpoint_downloads = get_config_item_or_set_default(
    key='checkpoint_downloads',
    default_value={},
    validator=lambda x: isinstance(x, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in x.items()),
    expected_type=dict
)
lora_downloads = get_config_item_or_set_default(
    key='lora_downloads',
    default_value={},
    validator=lambda x: isinstance(x, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in x.items()),
    expected_type=dict
)
embeddings_downloads = get_config_item_or_set_default(
    key='embeddings_downloads',
    default_value={},
    validator=lambda x: isinstance(x, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in x.items()),
    expected_type=dict
)
vae_downloads = get_config_item_or_set_default(
    key='vae_downloads',
    default_value={},
    validator=lambda x: isinstance(x, dict) and all(isinstance(k, str) and isinstance(v, str) for k, v in x.items()),
    expected_type=dict
)
available_aspect_ratios = get_config_item_or_set_default(
    key='available_aspect_ratios',
    default_value=modules.flags.available_aspect_ratios[0],
    validator=lambda x: isinstance(x, list) and all('*' in v for v in x) and len(x) > 1,
    expected_type=list
)
default_aspect_ratio = get_config_item_or_set_default(
    key='default_aspect_ratio',
    default_value='1152*896' if '1152*896' in available_aspect_ratios else '1024*1024',
    validator=lambda x: x in available_aspect_ratios,
    expected_type=str
)
default_inpaint_engine_version = get_config_item_or_set_default(
    key='default_inpaint_engine_version',
    default_value=modules.flags.default_inpaint_engine_versions(backend_engine),
    validator=lambda x: x in modules.flags.inpaint_engine_versions,
    expected_type=str
)
default_selected_image_input_tab_id = get_config_item_or_set_default(
    key='default_selected_image_input_tab_id',
    default_value=modules.flags.default_input_image_tab,
    validator=lambda x: x in modules.flags.input_image_tab_ids,
    expected_type=str
)
default_uov_method = get_config_item_or_set_default(
    key='default_uov_method',
    default_value=modules.flags.disabled,
    validator=lambda x: x in modules.flags.uov_list,
    expected_type=str
)
default_controlnet_image_count = get_config_item_or_set_default(
    key='default_controlnet_image_count',
    default_value=4,
    validator=lambda x: isinstance(x, int) and x > 0,
    expected_type=int
)
default_ip_images = {}
default_ip_stop_ats = {}
default_ip_weights = {}
default_ip_types = {}

for image_count in range(default_controlnet_image_count):
    image_count += 1
    default_ip_images[image_count] = get_config_item_or_set_default(
        key=f'default_ip_image_{image_count}',
        default_value='None',
        validator=lambda x: x == 'None' or isinstance(x, str) and os.path.exists(x),
        expected_type=str
    )

    if default_ip_images[image_count] == 'None':
        default_ip_images[image_count] = None

    default_ip_types[image_count] = get_config_item_or_set_default(
        key=f'default_ip_type_{image_count}',
        default_value=modules.flags.default_ip,
        validator=lambda x: x in modules.flags.ip_list,
        expected_type=str
    )

    default_end, default_weight = modules.flags.default_parameters[default_ip_types[image_count]]

    default_ip_stop_ats[image_count] = get_config_item_or_set_default(
        key=f'default_ip_stop_at_{image_count}',
        default_value=default_end,
        validator=lambda x: isinstance(x, float) and 0 <= x <= 1,
        expected_type=float
    )
    default_ip_weights[image_count] = get_config_item_or_set_default(
        key=f'default_ip_weight_{image_count}',
        default_value=default_weight,
        validator=lambda x: isinstance(x, float) and 0 <= x <= 2,
        expected_type=float
    )

default_inpaint_advanced_masking_checkbox = get_config_item_or_set_default(
    key='default_inpaint_advanced_masking_checkbox',
    default_value=ads.default['inpaint_advanced_masking_checkbox'],
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_inpaint_method = get_config_item_or_set_default(
    key='default_inpaint_method',
    default_value=modules.flags.inpaint_option_default,
    validator=lambda x: x in modules.flags.inpaint_options,
    expected_type=str
)
default_cfg_tsnr = get_config_item_or_set_default(
    key='default_cfg_tsnr',
    default_value=ads.default['adaptive_cfg'],
    validator=lambda x: isinstance(x, numbers.Number),
    expected_type=numbers.Number
)
default_clip_skip = get_config_item_or_set_default(
    key='default_clip_skip',
    default_value=2,
    validator=lambda x: isinstance(x, int) and 1 <= x <= modules.flags.clip_skip_max,
    expected_type=int
)
default_overwrite_step = get_config_item_or_set_default(
    key='default_overwrite_step',
    default_value=ads.default['overwrite_step'],
    validator=lambda x: isinstance(x, int),
    expected_type=int
)
default_overwrite_switch = get_config_item_or_set_default(
    key='default_overwrite_switch',
    default_value=ads.default['overwrite_switch'],
    validator=lambda x: isinstance(x, int),
    expected_type=int
)
default_overwrite_upscale = get_config_item_or_set_default(
    key='default_overwrite_upscale',
    default_value=-1,
    validator=lambda x: isinstance(x, numbers.Number)
)

example_inpaint_prompts = get_config_item_or_set_default(
    key='example_inpaint_prompts',
    default_value=[
        'highly detailed face', 'detailed girl face', 'detailed man face', 'detailed hand', 'beautiful eyes'
    ],
    validator=lambda x: isinstance(x, list) and all(isinstance(v, str) for v in x),
    expected_type=list
)
example_enhance_detection_prompts = get_config_item_or_set_default(
    key='example_enhance_detection_prompts',
    default_value=[
        'face', 'eye', 'mouth', 'hair', 'hand', 'body'
    ],
    validator=lambda x: isinstance(x, list) and all(isinstance(v, str) for v in x),
    expected_type=list
)
default_enhance_tabs = get_config_item_or_set_default(
    key='default_enhance_tabs',
    default_value=3,
    validator=lambda x: isinstance(x, int) and 1 <= x <= 5,
    expected_type=int
)
default_enhance_uov_method = get_config_item_or_set_default(
    key='default_enhance_uov_method',
    default_value=modules.flags.disabled,
    validator=lambda x: x in modules.flags.uov_list,
    expected_type=int
)
default_enhance_uov_processing_order = get_config_item_or_set_default(
    key='default_enhance_uov_processing_order',
    default_value=modules.flags.enhancement_uov_before,
    validator=lambda x: x in modules.flags.enhancement_uov_processing_order,
    expected_type=int
)
default_enhance_uov_prompt_type = get_config_item_or_set_default(
    key='default_enhance_uov_prompt_type',
    default_value=modules.flags.enhancement_uov_prompt_type_original,
    validator=lambda x: x in modules.flags.enhancement_uov_prompt_types,
    expected_type=int
)
default_sam_max_detections = get_config_item_or_set_default(
    key='default_sam_max_detections',
    default_value=0,
    validator=lambda x: isinstance(x, int) and 0 <= x <= 10,
    expected_type=int
)
default_black_out_nsfw = get_config_item_or_set_default(
    key='default_black_out_nsfw',
    default_value=False,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_save_only_final_enhanced_image = get_config_item_or_set_default(
    key='default_save_only_final_enhanced_image',
    default_value=False,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_save_metadata_to_images = get_config_item_or_set_default(
    key='default_save_metadata_to_images',
    default_value=ads.default['save_metadata_to_images'],
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)
default_metadata_scheme = get_config_item_or_set_default(
    key='default_metadata_scheme',
    default_value=ads.default['metadata_scheme'],
    validator=lambda x: x in [y[1] for y in modules.flags.metadata_scheme if y[1] == x],
    expected_type=str
)
metadata_created_by = get_config_item_or_set_default(
    key='metadata_created_by',
    default_value='',
    validator=lambda x: isinstance(x, str),
    expected_type=str
)

example_inpaint_prompts = [[x] for x in example_inpaint_prompts]
example_enhance_detection_prompts = [[x] for x in example_enhance_detection_prompts]

default_invert_mask_checkbox = get_config_item_or_set_default(
    key='default_invert_mask_checkbox',
    default_value=False,
    validator=lambda x: isinstance(x, bool),
    expected_type=bool
)

default_inpaint_mask_model = get_config_item_or_set_default(
    key='default_inpaint_mask_model',
    default_value='isnet-general-use',
    validator=lambda x: x in modules.flags.inpaint_mask_models,
    expected_type=str
)

default_enhance_inpaint_mask_model = get_config_item_or_set_default(
    key='default_enhance_inpaint_mask_model',
    default_value='sam',
    validator=lambda x: x in modules.flags.inpaint_mask_models,
    expected_type=str
)

default_inpaint_mask_cloth_category = get_config_item_or_set_default(
    key='default_inpaint_mask_cloth_category',
    default_value='full',
    validator=lambda x: x in modules.flags.inpaint_mask_cloth_category,
    expected_type=str
)

default_inpaint_mask_sam_model = get_config_item_or_set_default(
    key='default_inpaint_mask_sam_model',
    default_value='vit_l',
    validator=lambda x: x in modules.flags.inpaint_mask_sam_model,
    expected_type=str
)

default_inpaint_mask_model = get_config_item_or_set_default(
    key='default_inpaint_mask_model',
    default_value='isnet-general-use',
    validator=lambda x: x in modules.flags.inpaint_mask_models
)

default_inpaint_mask_cloth_category = get_config_item_or_set_default(
    key='default_inpaint_mask_cloth_category',
    default_value='full',
    validator=lambda x: x in modules.flags.inpaint_mask_cloth_category
)

default_inpaint_mask_sam_model = get_config_item_or_set_default(
    key='default_inpaint_mask_sam_model',
    default_value='sam_vit_b_01ec64',
    validator=lambda x: x in modules.flags.inpaint_mask_sam_model
)

default_translation_methods = get_config_item_or_set_default(
    key='default_translation_methods',
    default_value=ads.default['translation_methods'],
    validator=lambda x: x in modules.flags.translation_methods
)

default_backfill_prompt = get_config_item_or_set_default(
    key='default_backfill_prompt',
    default_value=ads.default['backfill_prompt'],
    validator=lambda x: isinstance(x, bool)
)

default_comfyd_active_checkbox = get_config_item_or_set_default(
    key='default_comfyd_active_checkbox',
    default_value=ads.default['comfyd_active_checkbox'],
    validator=lambda x: isinstance(x, bool)
)

default_image_catalog_max_number = get_config_item_or_set_default(
    key='default_image_catalog_max_number',
    default_value=ads.default['image_catalog_max_number'],
    validator=lambda x: isinstance(x, int),
    expected_type=int
)

default_mixing_image_prompt_and_vary_upscale = get_config_item_or_set_default(
    key='default_mixing_image_prompt_and_vary_upscale',
    default_value=ads.default['mixing_image_prompt_and_vary_upscale'],
    validator=lambda x: isinstance(x, bool)
)

default_mixing_image_prompt_and_inpaint = get_config_item_or_set_default(
    key='default_mixing_image_prompt_and_inpaint',
    default_value=ads.default['mixing_image_prompt_and_inpaint'],
    validator=lambda x: isinstance(x, bool)
)

default_freeu = ads.default['freeu']
default_adm_guidance = [ads.default['adm_scaler_positive'], ads.default['adm_scaler_negative'], ads.default['adm_scaler_end']]
styles_definition = {}
instruction = ''
reference = ''

config_dict["default_loras"] = default_loras = default_loras[:default_max_lora_number] + [[True, 'None', 1.0] for _ in range(default_max_lora_number - len(default_loras))]

# mapping config to meta parameter
possible_preset_keys = {
    "default_engine": "engine",
    "default_model": "base_model",
    "default_refiner": "refiner_model",
    "default_refiner_switch": "refiner_switch",
    "previous_default_models": "previous_default_models",
    "default_loras_min_weight": "loras_min_weight",
    "default_loras_max_weight": "loras_max_weight",
    "default_loras": "<processed>",
    "default_cfg_scale": "guidance_scale",
    "default_sample_sharpness": "sharpness",
    "default_cfg_tsnr": "adaptive_cfg",
    "default_clip_model": "clip_model",
    "default_upscale_model": "upscale_model",
    "default_sampler": "sampler",
    "default_scheduler": "scheduler",
    "default_overwrite_step": "steps",
    "default_overwrite_switch": "overwrite_switch",
    "default_performance": "performance",
    "default_image_number": "image_number",
    "default_prompt": "prompt",
    "default_prompt_negative": "negative_prompt",
    "default_styles": "styles",
    "default_aspect_ratio": "resolution",
    "default_save_metadata_to_images": "save_metadata_to_images",
    "checkpoint_downloads": "checkpoint_downloads",
    "embeddings_downloads": "embeddings_downloads",
    "lora_downloads": "lora_downloads",
    "vae_downloads": "vae_downloads",
    "default_vae": "vae",
    # "default_inpaint_method": "inpaint_method", # disabled so inpaint mode doesn't refresh after every preset change
    "default_inpaint_engine_version": "inpaint_engine_version",

    "default_max_image_number": "max_image_number",
    "default_freeu": "freeu",
    "default_adm_guidance": "adm_guidance",
    "default_output_format": "output_format",
    #"default_controlnet_softness": "controlnet_softness",
    #"default_overwrite_vary_strength": "overwrite_vary_strength",
    #"default_overwrite_upscale_strength": "overwrite_upscale_strength",
    "default_inpaint_advanced_masking_checkbox": "inpaint_advanced_masking_checkbox",
    "default_mixing_image_prompt_and_vary_upscale": "mixing_image_prompt_and_vary_upscale",
    "default_mixing_image_prompt_and_inpaint": "mixing_image_prompt_and_inpaint",
    "default_backfill_prompt": "backfill_prompt",
    "default_translation_methods": "translation_methods",
    "default_image_catalog_max_number": "image_catalog_max_number",
    "styles_definition": "styles_definition",
    "instruction": "instruction",
    "reference": "reference",
}

allow_missing_preset_key = [
    "default_prompt",
    "default_prompt_negative",
    "default_output_format",
    "input_image_checkbox",
    "styles_definition",
    "instruction",
    "reference",
    "previous_default_models",
    "default_backfill_prompt",
    "default_translation_methods",
    ]

REWRITE_PRESET = False

if REWRITE_PRESET and isinstance(args_manager.args.preset, str):
    save_path = 'presets/' + args_manager.args.preset + '.json'
    with open(save_path, "w", encoding="utf-8") as json_file:
        json.dump({k: config_dict[k] for k in possible_preset_keys}, json_file, indent=4)
    logger.info(f'Preset saved to {save_path}. Exiting ...')
    exit(0)


default_aspect_ratio = modules.flags.default_aspect_ratios['SDXL']
available_aspect_ratios_labels = modules.flags.available_aspect_ratios_list['SDXL']


# Only write config in the first launch.
if not forge_neo_read_only_user_config and (not os.path.exists(config_path) or config_needs_write):
    with open(config_path, "w", encoding="utf-8") as json_file:
        json.dump({k: config_dict[k] for k in always_save_keys}, json_file, indent=4)


# Always write tutorials.
if not forge_neo_read_only_user_config:
    with open(config_example_path, "w", encoding="utf-8") as json_file:
        cpa = config_path.replace("\\", "\\\\")
        json_file.write(f'You can modify your "{cpa}" using the below keys, formats, and examples.\n'
                        f'Do not modify this file. Modifications in this file will not take effect.\n'
                        f'This file is a tutorial and example. Please edit "{cpa}" to really change any settings.\n'
                        + 'Remember to split the paths with "\\\\" rather than "\\", '
                          'and there is no "," before the last "}". \n\n\n')
        json.dump({k: config_dict[k] for k in visited_keys}, json_file, indent=4)




# config model path for comfyd
config_comfy_path = os.path.join(shared.root, 'comfy/extra_model_paths.yaml')
config_comfy_formatted_text = '''
comfyui:
     models_root: {models_root}
     checkpoints: {checkpoints}
     LLM: {LLM}
     clip_vision: {clip_vision}
     clip: {clip}
     controlnet: {controlnets}
     diffusers: {diffusers}
     diffusion_models: {diffusion_models}
     embeddings: {embeddings}
     configs: {configs}
     loras: {loras}
     upscale_models: {upscale_models}
     latent_upscale_models: {latent_upscale_models}
     unet: {unet}
     rembg: {rembg}
     birefnet: {birefnet}
     layer_model: {layer_model}
     vae: {vae}
     vae_approx: {vae_approx}
     ipadapter: {ipadapter}
     inpaint: {inpaint}
     sams: {sams}
     pulid: {pulid}
     insightface: {insightface}
     style_models: {style_models}
     gligen: {gligen}
     hypernetworks: {hypernetworks}
     photomaker: {photomaker}
     audio_encoders: {audio_encoders}
     background_removal: {background_removal}
     frame_interpolation: {frame_interpolation}
     geometry_estimation: {geometry_estimation}
     optical_flow: {optical_flow}
     model_patches: {model_patches}
     grounding-dino: {grounding_dino}
     detection: {detection}
     text_encoders: {text_encoders}
     sam3: {sam3}
     sam3dbody: {sam3dbody}
     sharp: {sharp}
     lsnet: {lsnet}
     seedvr2: {seedvr2}
     hunyuan_foley: {hunyuan_foley}
     qwen-tts: {qwen_tts}
     '''

def _path_to_comfy_extra_yaml_value(path):
    resolved = _config_path_to_abs(path)
    if not resolved:
        return path
    if _path_is_under(resolved, shared.root):
        return _relative_config_path(resolved)
    if _path_is_under(resolved, _package_default_models_root_abs()):
        return _relative_config_path(resolved)
    return os.path.normpath(resolved)


def paths2str(p, n):
    paths = [_path_to_comfy_extra_yaml_value(path) for path in p]
    if not paths:
        return ""
    return paths[0] if len(paths) <= 1 else '|\n' + ''.join([' '] * (5 + len(n))) + ''.join(['\n'] + [' '] * (5 + len(n))).join(paths)

def _model_root_for_extra_paths():
    paths = _normalize_model_dirs([path_models_root])
    return paths[0] if paths else path_models_root

def _extra_model_paths(catalog, paths):
    return _with_model_root_category_dirs(catalog, paths)

config_comfy_text = config_comfy_formatted_text.format(
        models_root=_path_to_comfy_extra_yaml_value(_model_root_for_extra_paths()),
        checkpoints=paths2str(_extra_model_paths('checkpoints', paths_diffusion_models + paths_checkpoints),'checkpoints'),
        LLM=paths2str(_extra_model_paths('LLM', paths_LLM), 'LLM'),
        clip_vision=paths2str(_extra_model_paths('clip_vision', paths_clip_vision + paths_ipadapter), 'clip_vision'),
        clip=paths2str(_extra_model_paths('clip', paths_text_encoders + paths_clip), 'clip'),
        controlnets=paths2str(_extra_model_paths('controlnet', paths_controlnet),'controlnet'), 
        diffusers=paths2str(_extra_model_paths('diffusers', paths_diffusers),'diffusers'), 
        embeddings=paths2str(_extra_model_paths('embeddings', paths_embeddings), 'embeddings'),
        configs=paths2str(_extra_model_paths('configs', paths_configs), 'configs'),
        loras=paths2str(_extra_model_paths('loras', paths_loras), 'loras'), 
        upscale_models=paths2str(_extra_model_paths('upscale_models', paths_upscale_models), 'upscale_models'),
        latent_upscale_models=paths2str(_extra_model_paths('latent_upscale_models', paths_latent_upscale_models), 'latent_upscale_models'),
        unet=paths2str(_extra_model_paths('unet', paths_unet + paths_diffusion_models + paths_checkpoints), 'unet'),
        rembg=paths2str(_extra_model_paths('rembg', paths_rembg), 'rembg'),
        birefnet=paths2str(_extra_model_paths('birefnet', paths_birefnet), 'birefnet'),
        layer_model=paths2str(_extra_model_paths('layer_model', paths_layer_model), 'layer_model'),
        vae=paths2str(_extra_model_paths('vae', paths_vae), 'vae'),
        vae_approx=paths2str(_extra_model_paths('vae_approx', paths_vae_approx), 'vae_approx'),
        ipadapter=paths2str(_extra_model_paths('ipadapter', paths_ipadapter + paths_controlnet), 'ipadapter'),
        inpaint=paths2str(_extra_model_paths('inpaint', paths_inpaint),'inpaint'), 
        sams=paths2str(_extra_model_paths('sams', paths_sams), 'sams'),
        pulid=paths2str(_extra_model_paths('pulid', paths_pulid), 'pulid'),
        insightface=paths2str(_extra_model_paths('insightface', paths_insightface), 'insightface'),
        style_models=paths2str(_extra_model_paths('style_models', paths_style_models), 'style_models'),
        gligen=paths2str(_extra_model_paths('gligen', paths_gligen), 'gligen'),
        hypernetworks=paths2str(_extra_model_paths('hypernetworks', paths_hypernetworks), 'hypernetworks'),
        photomaker=paths2str(_extra_model_paths('photomaker', paths_photomaker), 'photomaker'),
        audio_encoders=paths2str(_extra_model_paths('audio_encoders', paths_audio_encoders), 'audio_encoders'),
        background_removal=paths2str(_extra_model_paths('background_removal', paths_background_removal), 'background_removal'),
        frame_interpolation=paths2str(_extra_model_paths('frame_interpolation', paths_frame_interpolation), 'frame_interpolation'),
        geometry_estimation=paths2str(_extra_model_paths('geometry_estimation', paths_geometry_estimation), 'geometry_estimation'),
        optical_flow=paths2str(_extra_model_paths('optical_flow', paths_optical_flow), 'optical_flow'),
        model_patches=paths2str(_extra_model_paths('model_patches', paths_model_patches), 'model_patches'),
        grounding_dino=paths2str(_extra_model_paths('grounding-dino', paths_grounding_dino), 'grounding-dino'),
        detection=paths2str(_extra_model_paths('detection', paths_detection), 'detection'),
        text_encoders=paths2str(_extra_model_paths('text_encoders', paths_text_encoders + paths_clip), 'text_encoders'),
        diffusion_models=paths2str(_extra_model_paths('diffusion_models', paths_unet + paths_diffusion_models + paths_checkpoints), 'diffusion_models'),
        sam3=paths2str(_extra_model_paths('sam3', paths_sam3), 'sam3'),
        sam3dbody=paths2str(_extra_model_paths('sam3dbody', paths_sam3dbody), 'sam3dbody'),
        sharp=paths2str(_extra_model_paths('sharp', paths_sharp), 'sharp'),
        lsnet=paths2str(_extra_model_paths('lsnet', paths_lsnet), 'lsnet'),
        seedvr2=paths2str(_extra_model_paths('seedvr2', paths_SEEDVR2), 'seedvr2'),
        hunyuan_foley=paths2str(_extra_model_paths('hunyuan_foley', paths_hunyuan_foley), 'hunyuan_foley'),
        qwen_tts=paths2str(_extra_model_paths('qwen-tts', paths_qwen_tts), 'qwen-tts'),
        )

with open(config_comfy_path, "w", encoding="utf-8") as comfy_file:
    comfy_file.write(config_comfy_text)



model_filenames = []
lora_filenames = []
vae_filenames = []
clip_filenames = []
upscale_model_filenames = []
wildcard_filenames = []


def _load_models_info_json(models_root: str) -> Tuple[str, Dict[str, Any]]:
    path = os.path.abspath(os.path.join(models_root, "models_info.json"))
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return path, data
    except Exception:
        pass
    return path, {}


def _save_models_info_json(path: str, data: Dict[str, Any]) -> None:
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=True)
    os.replace(tmp_path, path)


def _get_filter_profile_key(engine: str, task_method: Optional[str] = None) -> str:
    engine_text = str(engine or "").strip()
    haystack = f"{engine_text} {task_method or ''}".lower()

    def contains_profile_token(token: str, allow_numeric_suffix: bool = False) -> bool:
        suffix = r"\d*" if allow_numeric_suffix else ""
        pattern = rf"(?<![a-z0-9]){re.escape(token)}{suffix}(?![a-z0-9])"
        return re.search(pattern, haystack) is not None
    if contains_profile_token("anima"):
        return "Anima"
    if contains_profile_token("ltx", allow_numeric_suffix=True):
        return "LTX"
    return engine_text


def _get_filter_arch_families(engine: str, task_method: Optional[str] = None) -> Optional[set]:
    profile_key = _get_filter_profile_key(engine, task_method)
    mapping = {
        "SD3x": {"sd3"},
        "SDXL": {"sdxl"},
        "Flux": {"flux"},
        "HyDiT": {"hunyuan"},
        "Wan": {"wan"},
        "LTX": {"ltx", "ltx2"},
        "Anima": {"anima"},
        "Qwen": {"qwen"},
        "Z-image": {"z_image"},
        "Fooocus": {"sdxl"},
    }
    return mapping.get(profile_key)


def _get_engine_arch_families(engine: str) -> Optional[set]:
    return _get_filter_arch_families(engine)


def _normalize_model_name(name: str) -> str:
    s = str(name or "")
    s = s.replace("\\", "/")
    while s.startswith("/"):
        s = s[1:]
    return s


def _is_placeholder_model_name(name: str) -> bool:
    s = _normalize_model_name(name)
    base = s.rsplit("/", 1)[-1]
    stem = base.rsplit(".", 1)[0]
    return stem.lower() == "placeholder"


def _resolve_models_info_key(data: Dict[str, Any], catalog: str, model_name: str) -> Optional[str]:
    catalog = _normalize_model_name(catalog)
    model_name = _normalize_model_name(model_name)
    exact = f"{catalog}/{model_name}"
    if exact in data:
        return exact

    suffix = f"/{model_name}"
    candidates: List[str] = []
    for k in data.keys():
        if k.startswith(f"{catalog}/") and k.endswith(suffix):
            candidates.append(k)
    if len(candidates) == 1:
        return candidates[0]
    return None


def _build_catalog_basename_index(data: Dict[str, Any], catalog: str) -> Dict[str, Optional[str]]:
    index: Dict[str, Optional[str]] = {}
    prefix = f"{catalog}/"
    for k in data.keys():
        if not k.startswith(prefix):
            continue
        base = k.rsplit("/", 1)[-1]
        if base in index:
            index[base] = None
        else:
            index[base] = k
    return index


_MODEL_ARCH_FAMILY_CACHE: Optional[Dict[str, Dict[str, Any]]] = None


def _model_arch_family_cache_path() -> str:
    return os.path.join(shared.root, "data", "model_arch_family_cache.json")


def _load_model_arch_family_cache() -> Dict[str, Dict[str, Any]]:
    global _MODEL_ARCH_FAMILY_CACHE
    if _MODEL_ARCH_FAMILY_CACHE is not None:
        return _MODEL_ARCH_FAMILY_CACHE
    path = _model_arch_family_cache_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except Exception:
        _MODEL_ARCH_FAMILY_CACHE = {}
        return _MODEL_ARCH_FAMILY_CACHE
    raw_entries = payload.get("entries") if isinstance(payload, dict) else payload
    if not isinstance(raw_entries, dict):
        _MODEL_ARCH_FAMILY_CACHE = {}
        return _MODEL_ARCH_FAMILY_CACHE
    entries: Dict[str, Dict[str, Any]] = {}
    for raw_key, raw_entry in raw_entries.items():
        key = _normalize_model_name(raw_key)
        if "/" not in key or not isinstance(raw_entry, dict):
            continue
        arch_family = str(raw_entry.get("arch_family") or "").strip().lower()
        if not arch_family or arch_family == "unknown":
            continue
        entries[key] = dict(raw_entry, arch_family=arch_family)
    _MODEL_ARCH_FAMILY_CACHE = entries
    return entries


def _apply_builtin_model_arch_family_cache(models_root: str) -> None:
    cache_entries = _load_model_arch_family_cache()
    if not cache_entries:
        return
    info_path, data = _load_models_info_json(models_root)
    if not data:
        return

    updated = False
    basename_index_by_catalog: Dict[str, Dict[str, Optional[str]]] = {}
    for cache_key, cache_entry in cache_entries.items():
        if "/" not in cache_key:
            continue
        catalog, model_name = cache_key.split("/", 1)
        if catalog not in ARCH_FAMILY_CATALOGS:
            continue
        resolved_key = _resolve_models_info_key(data, catalog, model_name)
        if not resolved_key and "/" not in model_name:
            idx = basename_index_by_catalog.get(catalog)
            if idx is None:
                idx = _build_catalog_basename_index(data, catalog)
                basename_index_by_catalog[catalog] = idx
            resolved_key = idx.get(model_name) or None
        if not resolved_key:
            continue
        entry = data.get(resolved_key)
        if not isinstance(entry, dict):
            continue
        arch_family = str(cache_entry.get("arch_family") or "").strip().lower()
        if not arch_family or arch_family == "unknown":
            continue
        if str(entry.get("arch_family") or "").strip().lower() == arch_family and entry.get("arch_family_algo") == ARCH_FAMILY_ALGO:
            if entry.get("arch_family_source"):
                continue
            entry["arch_family_source"] = "builtin_model_arch_family_cache"
            updated = True
            continue
        entry["arch_family"] = arch_family
        entry["arch_family_algo"] = ARCH_FAMILY_ALGO
        entry["arch_family_source"] = "builtin_model_arch_family_cache"
        updated = True
        try:
            mi = shared.modelsinfo
            if mi is not None and isinstance(getattr(mi, "m_info", None), dict):
                mi_entry = mi.m_info.get(resolved_key)
                if isinstance(mi_entry, dict):
                    mi_entry["arch_family"] = entry["arch_family"]
                    mi_entry["arch_family_algo"] = entry["arch_family_algo"]
                    mi_entry["arch_family_source"] = entry["arch_family_source"]
        except Exception:
            pass
    if updated:
        _save_models_info_json(info_path, data)


def _model_filter_patterns(engine: str, task_method: Optional[str] = None):
    profile_key = _get_filter_profile_key(engine, task_method)
    patterns = modules.flags.model_file_filter.get(profile_key)
    if patterns is None:
        patterns = modules.flags.model_file_filter.get(engine)
    return patterns


def _match_model_filter_name(name: str, patterns) -> bool:
    if not patterns:
        return False
    s = _normalize_model_name(name).lower()
    for item in patterns:
        group = [item] if isinstance(item, str) else list(item)
        if group and all(str(t).lower() in s for t in group):
            return True
    return False


def _model_arch_family_allows(entry: Any, families: set) -> bool:
    decision = _model_arch_family_decision(entry, families)
    return True if decision is None else decision


def _model_arch_family_decision(entry: Any, families: set) -> Optional[bool]:
    if not isinstance(entry, dict):
        return None
    arch_family = str(entry.get("arch_family") or "").strip().lower()
    if not arch_family or arch_family == "unknown":
        return None
    source = str(entry.get("arch_family_source") or "").strip().lower()
    if source in {"weight_inspector", "name_rule", "builtin_model_arch_family_cache"} and "arch_family_algo" in entry:
        try:
            algo = int(entry.get("arch_family_algo"))
        except Exception:
            return None
        if algo != ARCH_FAMILY_ALGO:
            return None
    return arch_family in families


def _ensure_weight_inspector_cache_for_keys(models_root: str, model_keys: List[str]) -> None:
    import enhanced.weight_inspector as weight_inspector
    import time

    modelsinfo = shared.modelsinfo
    if modelsinfo is None:
        return

    info_path, data = _load_models_info_json(models_root)
    if not data:
        return

    updated = False
    basename_index_by_catalog: Dict[str, Dict[str, Optional[str]]] = {}
    candidates: List[Tuple[str, str, str, str, Dict[str, Any], Dict[str, Any]]] = []
    to_scan: List[Tuple[str, str, str, str, Dict[str, Any], Dict[str, Any]]] = []

    for key in model_keys:
        key = _normalize_model_name(key)
        if "/" not in key:
            continue
        catalog, model_name = key.split("/", 1)
        if catalog not in ARCH_FAMILY_CATALOGS:
            continue
        resolved_key = _resolve_models_info_key(data, catalog, model_name)
        if not resolved_key and "/" not in model_name:
            idx = basename_index_by_catalog.get(catalog)
            if idx is None:
                idx = _build_catalog_basename_index(data, catalog)
                basename_index_by_catalog[catalog] = idx
            resolved_key = idx.get(model_name) or None
        if not resolved_key:
            continue

        entry = data.get(resolved_key)
        if not isinstance(entry, dict):
            continue
        if "file" not in entry:
            continue

        _, resolved_model_name = resolved_key.split("/", 1)
        try:
            file_path = modelsinfo.get_model_filepath(catalog, resolved_model_name)
        except Exception:
            file_path = None
        if not file_path or not os.path.isfile(file_path):
            continue

        try:
            current_size = int(os.path.getsize(file_path))
        except Exception:
            current_size = None
        try:
            current_mtime = float(os.path.getmtime(file_path))
        except Exception:
            current_mtime = None
        current_stamp = {"size": current_size, "mtime": current_mtime}

        cached_arch_family = entry.get("arch_family")
        if catalog == "loras":
            file_basename = os.path.basename(file_path).lower()
            file_parent = os.path.basename(os.path.dirname(file_path)).lower()
            if "kontext" in file_basename or "kontext" in file_parent or "kontext" in resolved_key.lower():
                desired_arch_family = "flux"
                if str(cached_arch_family or "").lower() != desired_arch_family:
                    entry["arch_family"] = desired_arch_family
                    entry["arch_family_algo"] = ARCH_FAMILY_ALGO
                    entry["arch_family_source"] = "name_rule"
                    entry["arch_family_stamp"] = current_stamp
                    cached_arch_family = desired_arch_family
                    updated = True
                    try:
                        mi = shared.modelsinfo
                        if mi is not None and isinstance(getattr(mi, "m_info", None), dict):
                            mi_entry = mi.m_info.get(resolved_key)
                            if isinstance(mi_entry, dict):
                                mi_entry["arch_family"] = entry["arch_family"]
                                mi_entry["arch_family_algo"] = entry["arch_family_algo"]
                                mi_entry["arch_family_source"] = entry["arch_family_source"]
                                mi_entry["arch_family_stamp"] = entry["arch_family_stamp"]
                    except Exception:
                        pass
        if (
            cached_arch_family
            and entry.get("arch_family_stamp") == current_stamp
            and entry.get("arch_family_algo") == ARCH_FAMILY_ALGO
        ):
            if str(cached_arch_family).lower() != "newbie":
                continue
            s = f"{os.path.basename(os.path.dirname(file_path)).lower()} {os.path.basename(file_path).lower()}"
            if "newbie" in s:
                continue
        payload = (key, catalog, resolved_key, file_path, entry, current_stamp)
        candidates.append(payload)
        to_scan.append(payload)

    if to_scan:
        logger.info(f"[WeightInspector] scanning {len(to_scan)}/{len(candidates)} model headers (unique_keys={len(model_keys)}) ...")
    else:
        if updated:
            _save_models_info_json(info_path, data)
        return

    start_t = time.time()
    last_log_t = start_t
    scanned = 0
    for _key, catalog, resolved_key, file_path, entry, current_stamp in to_scan:
        scanned += 1
        now = time.time()
        if scanned == 1 or (now - last_log_t) >= 2.0:
            last_log_t = now
            logger.info(f"[WeightInspector] scanning {scanned}/{len(to_scan)}")

        try:
            r = weight_inspector.inspect_weight_file(
                file_path,
                torch_ckpt_load=False,
                include_metadata=False,
                include_key_examples=False,
            )
        except Exception as e:
            r = {"arch_family": "unknown", "weight_kind": "unknown", "file_type": "unknown", "parse_mode": "", "error": f"{type(e).__name__}: {e}"}

        entry["arch_family"] = r.get("arch_family", "unknown")
        entry["arch_family_algo"] = ARCH_FAMILY_ALGO
        entry["arch_family_source"] = "weight_inspector"
        entry["arch_family_stamp"] = current_stamp
        updated = True
        try:
            mi = shared.modelsinfo
            if mi is not None and isinstance(getattr(mi, "m_info", None), dict):
                mi_entry = mi.m_info.get(resolved_key)
                if isinstance(mi_entry, dict):
                    mi_entry["arch_family"] = entry["arch_family"]
                    mi_entry["arch_family_algo"] = entry["arch_family_algo"]
                    mi_entry["arch_family_source"] = entry["arch_family_source"]
                    mi_entry["arch_family_stamp"] = entry["arch_family_stamp"]
        except Exception:
            pass

    if updated:
        _save_models_info_json(info_path, data)


def _refine_names_by_catalog(models_root: str, engine: str, catalog: str, names: List[str], task_method: Optional[str] = None) -> List[str]:
    families = _get_filter_arch_families(engine, task_method)
    if not families:
        return names
    families = {str(item).lower() for item in families}

    names = [_normalize_model_name(n) for n in names]

    _, data = _load_models_info_json(models_root)
    if not data:
        return names

    patterns = _model_filter_patterns(engine, task_method)
    basename_index = _build_catalog_basename_index(data, catalog)
    out: List[str] = []
    for name in names:
        resolved_key = _resolve_models_info_key(data, catalog, name)
        if not resolved_key and "/" not in name:
            resolved_key = basename_index.get(name) or None
        entry = data.get(resolved_key) if resolved_key else None
        decision = _model_arch_family_decision(entry, families)
        if decision is True:
            out.append(name)
            continue
        if decision is False:
            continue
        if not resolved_key or _match_model_filter_name(name, patterns):
            out.append(name)
            continue
        out.append(name)
    return out


def _refine_models_by_arch_family(models_root: str, engine: str, models: List[str], task_method: Optional[str] = None) -> List[str]:
    families = _get_filter_arch_families(engine, task_method)
    if not families:
        return models
    families = {str(item).lower() for item in families}

    models = [_normalize_model_name(n) for n in models]

    _, data = _load_models_info_json(models_root)
    if not data:
        return models

    patterns = _model_filter_patterns(engine, task_method)
    ck_basename_index = _build_catalog_basename_index(data, "checkpoints")
    dm_basename_index = _build_catalog_basename_index(data, "diffusion_models")
    out: List[str] = []
    for name in models:
        decisions = []
        ck_key = _resolve_models_info_key(data, "checkpoints", name)
        if not ck_key and "/" not in name:
            ck_key = ck_basename_index.get(name) or None
        ck = data.get(ck_key) if ck_key else None
        ck_decision = _model_arch_family_decision(ck, families)
        if ck_decision is not None:
            decisions.append(ck_decision)
        dm_key = _resolve_models_info_key(data, "diffusion_models", name)
        if not dm_key and "/" not in name:
            dm_key = dm_basename_index.get(name) or None
        dm = data.get(dm_key) if dm_key else None
        dm_decision = _model_arch_family_decision(dm, families)
        if dm_decision is not None:
            decisions.append(dm_decision)
        if decisions:
            if any(decisions):
                out.append(name)
            continue
        # Unknown or stale classifications stay visible. Filename rules are only
        # a fallback for those entries and never override a trusted classification.
        if _match_model_filter_name(name, patterns):
            out.append(name)
            continue
        out.append(name)
    return out


def get_model_filenames(folder_paths, extensions=None, name_filter=None):
    if extensions is None:
        extensions = ['.pth', '.ckpt', '.bin', '.safetensors', '.fooocus.patch', '.gguf']
    files = []

    if not isinstance(folder_paths, list):
        folder_paths = [folder_paths]
    for folder in folder_paths:
        files += get_files_from_folder(folder, extensions, name_filter)

    return files


def get_base_model_list(engine='Z-image', task_method=None, use_model_filter: bool = True):
    global modelsinfo
    base_model_list = modelsinfo.get_model_names('checkpoints', [])
    base_model_list.extend(modelsinfo.get_model_names('diffusion_models', []))
    base_model_list = [_normalize_model_name(n) for n in base_model_list]
    base_model_list = [n for n in base_model_list if not _is_placeholder_model_name(n)]
    base_model_list = list(dict.fromkeys(base_model_list))
    if use_model_filter:
        base_model_list = _refine_models_by_arch_family(path_models_root, engine, base_model_list, task_method)
    base_model_list = [str(n).replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep) for n in base_model_list]
    return base_model_list

def update_files(engine='Z-image', task_method=None, use_model_filter: bool = True):
    global modelsinfo, model_filenames, lora_filenames, vae_filenames, clip_filenames, upscale_model_filenames, wildcard_filenames
    modelsinfo.refresh_from_path()
    _apply_builtin_model_arch_family_cache(path_models_root)
    model_filenames = get_base_model_list(engine, task_method, use_model_filter=use_model_filter)
    lora_filenames = modelsinfo.get_model_names('loras')
    lora_filenames_norm = [_normalize_model_name(n) for n in lora_filenames]
    lora_filenames_norm = [n for n in lora_filenames_norm if not _is_placeholder_model_name(n)]
    if use_model_filter:
        lora_filenames_norm = _refine_names_by_catalog(path_models_root, engine, "loras", lora_filenames_norm, task_method)
    lora_filenames = [str(n).replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep) for n in lora_filenames_norm]
    vae_filenames = [n for n in modelsinfo.get_model_names('vae') if not _is_placeholder_model_name(n)]
    clip_names = []
    for catalog in ('clip', 'text_encoders'):
        try:
            clip_names.extend(modelsinfo.get_model_names(catalog))
        except Exception:
            pass
    clip_filenames = [n for n in clip_names if not _is_placeholder_model_name(n)]
    clip_filenames = [str(n).replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep) for n in clip_filenames]
    clip_filenames = list(dict.fromkeys(clip_filenames))
    upscale_model_filenames = [
        n for n in get_model_filenames(paths_upscale_models)
        if not _is_placeholder_model_name(n)
    ]
    upscale_model_filenames = [
        str(n).replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep)
        for n in upscale_model_filenames
    ]
    wildcard_filenames = []
    for path in paths_wildcards:
        files = get_files_from_folder(path, ['.txt'])
        wildcard_filenames.extend(files)
    return model_filenames, lora_filenames, vae_filenames, clip_filenames


def downloading_inpaint_models(v):
    assert v in modules.flags.inpaint_engine_versions_all

    inpaint_dir = find_dir_containing_model(paths_inpaint, 'fooocus_inpaint_head.pth')
    load_file_from_url(
        url='https://huggingface.co/lllyasviel/fooocus_inpaint/resolve/main/fooocus_inpaint_head.pth',
        model_dir=inpaint_dir,
        file_name='fooocus_inpaint_head.pth'
    )
    head_file = find_model_in_dirs(paths_inpaint, 'fooocus_inpaint_head.pth') or os.path.join(inpaint_dir, 'fooocus_inpaint_head.pth')
    patch_file = None

    if v == 'v1':
        patch_dir = find_dir_containing_model(paths_inpaint, 'inpaint.fooocus.patch')
        load_file_from_url(
            url='https://huggingface.co/lllyasviel/fooocus_inpaint/resolve/main/inpaint.fooocus.patch',
            model_dir=patch_dir,
            file_name='inpaint.fooocus.patch'
        )
        patch_file = find_model_in_dirs(paths_inpaint, 'inpaint.fooocus.patch') or os.path.join(patch_dir, 'inpaint.fooocus.patch')

    if v == 'v2.5':
        patch_dir = find_dir_containing_model(paths_inpaint, 'inpaint_v25.fooocus.patch')
        load_file_from_url(
            url='https://huggingface.co/lllyasviel/fooocus_inpaint/resolve/main/inpaint_v25.fooocus.patch',
            model_dir=patch_dir,
            file_name='inpaint_v25.fooocus.patch'
        )
        patch_file = find_model_in_dirs(paths_inpaint, 'inpaint_v25.fooocus.patch') or os.path.join(patch_dir, 'inpaint_v25.fooocus.patch')

    if v == 'v2.6':
        patch_dir = find_dir_containing_model(paths_inpaint, 'inpaint_v26.fooocus.patch')
        load_file_from_url(
            url='https://huggingface.co/lllyasviel/fooocus_inpaint/resolve/main/inpaint_v26.fooocus.patch',
            model_dir=patch_dir,
            file_name='inpaint_v26.fooocus.patch'
        )
        patch_file = find_model_in_dirs(paths_inpaint, 'inpaint_v26.fooocus.patch') or os.path.join(patch_dir, 'inpaint_v26.fooocus.patch')
    if v == 'Q4':
        patch_dir = find_dir_containing_model(paths_checkpoints, 'flux1-fill-dev-hyp8-Q4_K_S.gguf')
        load_file_from_url(
            url='https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-hyp8-Q4_K_S.gguf',
            model_dir=patch_dir,
            file_name='flux1-fill-dev-hyp8-Q4_K_S.gguf'
        )
        patch_file = find_model_in_dirs(paths_checkpoints, 'flux1-fill-dev-hyp8-Q4_K_S.gguf') or os.path.join(patch_dir, 'flux1-fill-dev-hyp8-Q4_K_S.gguf')
    if v == 'fp8':
        patch_dir = find_dir_containing_model(paths_checkpoints, 'flux1-fill-dev-OneReward_fp8.safetensors')
        load_file_from_url(
            url='https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors',
            model_dir=patch_dir,
            file_name='flux1-fill-dev-OneReward_fp8.safetensors'
        )
        patch_file = find_model_in_dirs(paths_checkpoints, 'flux1-fill-dev-OneReward_fp8.safetensors') or os.path.join(patch_dir, 'flux1-fill-dev-OneReward_fp8.safetensors')
    return head_file, patch_file


def downloading_sdxl_lcm_lora():
    load_file_from_url(
        url='https://huggingface.co/lllyasviel/misc/resolve/main/sdxl_lcm_lora.safetensors',
        model_dir=paths_loras[0],
        file_name=modules.flags.PerformanceLoRA.EXTREME_SPEED.value
    )
    return modules.flags.PerformanceLoRA.EXTREME_SPEED.value


def downloading_sdxl_lightning_lora():
    load_file_from_url(
        url='https://huggingface.co/mashb1t/misc/resolve/main/sdxl_lightning_4step_lora.safetensors',
        model_dir=paths_loras[0],
        file_name=modules.flags.PerformanceLoRA.LIGHTNING.value
    )
    return modules.flags.PerformanceLoRA.LIGHTNING.value


def downloading_sdxl_hyper_sd_lora():
    load_file_from_url(
        url='https://huggingface.co/ByteDance/Hyper-SD/resolve/main/Hyper-SDXL-8steps-lora.safetensors',
        model_dir=paths_loras[0],
        file_name=modules.flags.PerformanceLoRA.HYPER_SD.value
    )
    return modules.flags.PerformanceLoRA.HYPER_SD.value


def _load_controlnet_file(url, relative_path):
    existing_path = find_model_in_dirs(paths_controlnet, relative_path)
    if existing_path:
        return existing_path

    target_path = os.path.join(
        first_model_dir(paths_controlnet, fallback=os.path.join(path_models_root, 'controlnet')),
        str(relative_path).replace('\\', os.sep).replace('/', os.sep),
    )
    load_file_from_url(
        url=url,
        model_dir=os.path.dirname(target_path),
        file_name=os.path.basename(target_path),
    )
    return target_path


def downloading_controlnet_canny():
    return _load_controlnet_file(
        url='https://huggingface.co/lllyasviel/misc/resolve/main/control-lora-canny-rank128.safetensors',
        relative_path='control-lora-canny-rank128.safetensors',
    )


def downloading_controlnet_cpds():
    return _load_controlnet_file(
        url='https://huggingface.co/lllyasviel/misc/resolve/main/fooocus_xl_cpds_128.safetensors',
        relative_path='fooocus_xl_cpds_128.safetensors',
    )

def downloading_controlnet_zoe():
    model_path = 'lllyasviel/Annotators'
    file_name = 'ZoeD_M12_N.pt'
    return _load_controlnet_file(
        url='https://huggingface.co/lllyasviel/Annotators/resolve/main/ZoeD_M12_N.pt',
        relative_path=os.path.join(model_path, file_name),
    )

def downloading_controlnet_dwpose():
    model_path = "yzd-v/DWPose"
    model_det = 'yolox_l.onnx'
    model_pose = 'dw-ll_ucoco_384.onnx'
    pose_path = _load_controlnet_file(
        url=f'https://huggingface.co/{model_path}/resolve/main/{model_pose}',
        relative_path=os.path.join(model_path, model_pose),
    )
    det_path = _load_controlnet_file(
        url=f'https://huggingface.co/{model_path}/resolve/main/{model_det}',
        relative_path=os.path.join(model_path, model_det),
    )
    return det_path, pose_path

def downloading_controlnet_openpose():
    model_path = 'lllyasviel/Annotators'
    body_filename = 'body_pose_model.pth'
    hand_filename = 'hand_pose_model.pth'
    face_filename = 'facenet.pth'
    body_path = _load_controlnet_file(
        url=f'https://huggingface.co/{model_path}/resolve/main/{body_filename}',
        relative_path=os.path.join(model_path, body_filename),
    )
    hand_path = _load_controlnet_file(
        url=f'https://huggingface.co/{model_path}/resolve/main/{hand_filename}',
        relative_path=os.path.join(model_path, hand_filename),
    )
    face_path = _load_controlnet_file(
        url=f'https://huggingface.co/{model_path}/resolve/main/{face_filename}',
        relative_path=os.path.join(model_path, face_filename),
    )
    return body_path, hand_path, face_path


def downloading_controlnet_pose():
    return _load_controlnet_file(
        url='https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors',
        relative_path='xinsir_cn_openpose_sdxl_1.0.safetensors',
    )

def downloading_controlnet_union():
    return _load_controlnet_file(
        url='https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors',
        relative_path='xinsir_cn_union_sdxl_1.0_promax.safetensors',
    )

def downloading_ip_adapters(v):
    assert v in ['ip', 'face']

    results = []

    clip_dir = find_dir_containing_model(paths_clip_vision, 'clip_vision_h.safetensors')
    load_file_from_url(
        url='https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/clip_vision_h.safetensors',
        model_dir=clip_dir,
        file_name='clip_vision_h.safetensors'
    )
    results += [find_model_in_dirs(paths_clip_vision, 'clip_vision_h.safetensors') or os.path.join(clip_dir, 'clip_vision_h.safetensors')]

    negative_dir = find_dir_containing_model(paths_controlnet, 'fooocus_ip_negative.safetensors')
    load_file_from_url(
        url='https://huggingface.co/lllyasviel/misc/resolve/main/fooocus_ip_negative.safetensors',
        model_dir=negative_dir,
        file_name='fooocus_ip_negative.safetensors'
    )
    results += [find_model_in_dirs(paths_controlnet, 'fooocus_ip_negative.safetensors') or os.path.join(negative_dir, 'fooocus_ip_negative.safetensors')]

    if v == 'ip':
        adapter_dirs = paths_ipadapter + paths_controlnet
        adapter_dir = find_dir_containing_model(adapter_dirs, 'ip-adapter-plus_sdxl_vit-h.bin')
        load_file_from_url(
            url='https://huggingface.co/lllyasviel/misc/resolve/main/ip-adapter-plus_sdxl_vit-h.bin',
            model_dir=adapter_dir,
            file_name='ip-adapter-plus_sdxl_vit-h.bin'
        )
        results += [find_model_in_dirs(adapter_dirs, 'ip-adapter-plus_sdxl_vit-h.bin') or os.path.join(adapter_dir, 'ip-adapter-plus_sdxl_vit-h.bin')]

    if v == 'face':
        adapter_dirs = paths_ipadapter + paths_controlnet
        adapter_dir = find_dir_containing_model(adapter_dirs, 'ip-adapter-plus-face_sdxl_vit-h.bin')
        load_file_from_url(
            url='https://huggingface.co/lllyasviel/misc/resolve/main/ip-adapter-plus-face_sdxl_vit-h.bin',
            model_dir=adapter_dir,
            file_name='ip-adapter-plus-face_sdxl_vit-h.bin'
        )
        results += [find_model_in_dirs(adapter_dirs, 'ip-adapter-plus-face_sdxl_vit-h.bin') or os.path.join(adapter_dir, 'ip-adapter-plus-face_sdxl_vit-h.bin')]

    return results


def downloading_upscale_model(upscale_model=None):
    selected_model = str(upscale_model or '').strip()
    if selected_model and selected_model.lower() not in ('default', 'auto', 'none'):
        selected_model = selected_model.replace('\\', os.sep).replace('/', os.sep).lstrip(os.sep)
        found = find_model_in_dirs(paths_upscale_models, selected_model)
        if found:
            return found
        return os.path.join(paths_upscale_models[0], selected_model)

    load_file_from_url(
        url='https://huggingface.co/lllyasviel/misc/resolve/main/fooocus_upscaler_s409985e5.bin',
        model_dir=paths_upscale_models[0],
        file_name='fooocus_upscaler_s409985e5.bin'
    )
    return os.path.join(paths_upscale_models[0], 'fooocus_upscaler_s409985e5.bin')

def downloading_safety_checker_model():
    load_file_from_url(
        url='https://huggingface.co/mashb1t/misc/resolve/main/stable-diffusion-safety-checker.bin',
        model_dir=paths_safety_checker[0],
        file_name='stable-diffusion-safety-checker.bin'
    )
    return os.path.join(paths_safety_checker[0], 'stable-diffusion-safety-checker.bin')

def download_sam_model(sam_model: str) -> str:
    if sam_model == 'vit_b':
        return downloading_sam_vit_b()
    if sam_model == 'vit_l':
        return downloading_sam_vit_l()
    if sam_model == 'vit_h':
        return downloading_sam_vit_h()
    raise ValueError(f"sam model {sam_model} does not exist.")


def _download_sam_vit_file(file_name: str, url: str) -> str:
    existing_file = find_model_in_dirs(paths_sams + paths_inpaint, file_name)
    if existing_file:
        return existing_file
    load_file_from_url(
        url=url,
        model_dir=path_sam,
        file_name=file_name
    )
    return find_model_in_dirs(paths_sams + paths_inpaint, file_name) or os.path.join(path_sam, file_name)


def downloading_sam_vit_b():
    return _download_sam_vit_file(
        file_name='sam_vit_b_01ec64.pth',
        url='https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_b_01ec64.pth',
    )


def downloading_sam_vit_l():
    return _download_sam_vit_file(
        file_name='sam_vit_l_0b3195.pth',
        url='https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_l_0b3195.pth',
    )


def downloading_sam_vit_h():
    return _download_sam_vit_file(
        file_name='sam_vit_h_4b8939.pth',
        url='https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_h_4b8939.pth',
    )

def downloading_superprompter_model():
    path_superprompter = os.path.join(paths_llms[0], "superprompt-v1")
    load_file_from_url(
        url='https://huggingface.co/roborovski/superprompt-v1/resolve/main/model.safetensors',
        model_dir=path_superprompter,
        file_name='model.safetensors'
    )
    return os.path.join(path_superprompter, 'model.safetensors')

def downloading_sd3_medium_model():
    load_file_from_url(
        url='https://huggingface.co/metercai/SimpleSDXL2/resolve/main/sd3m/sd3_medium_incl_clips_t5xxlfp8.safetensors',
        model_dir=paths_checkpoints[0],
        file_name='sd3_medium_incl_clips_t5xxlfp8.safetensors'
    )
    return os.path.join(paths_checkpoints[0], 'sd3_medium_incl_clips_t5xxlfp8.safetensors')

def downloading_base_sd15_model():
    load_file_from_url(
        url='https://huggingface.co/metercai/SimpleSDXL2/resolve/main/ckpt/realisticVisionV60B1_v51VAE.safetensors',
        model_dir=paths_checkpoints[0],
        file_name='realisticVisionV60B1_v51VAE.safetensors'
    )
    return os.path.join(paths_checkpoints[0], 'realisticVisionV60B1_v51VAE.safetensors')

def downloading_hydit_model():
    load_file_from_url(
        url='https://huggingface.co/comfyanonymous/hunyuan_dit_comfyui/resolve/main/hunyuan_dit_1.2.safetensors',
        model_dir=paths_checkpoints[0],
        file_name='hunyuan_dit_1.2.safetensors'
    )
    return os.path.join(paths_checkpoints[0], 'hunyuan_dit_1.2.safetensors')

update_files()
