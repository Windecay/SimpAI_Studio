import json
import os
import re
import shared

bool_map = {
    "true": True,
    "false": False
}
float_pattern = r"^[+-]?\d*\.?\d+$|^[+-]?\d+\.?\d*$"

cache_vars = {}

LOCAL_SETTINGS_FILENAME = "local_settings.json"


def _is_local_mode():
    try:
        token = getattr(shared, "token", None)
        if token is not None and hasattr(token, "get_admin_did"):
            return not bool(token.get_admin_did())
        node_type = getattr(getattr(shared, "args", None), "node_type", None)
        if node_type is not None and node_type != "online":
            return True
        node_mode = token.get_node_mode() if token is not None and hasattr(token, "get_node_mode") else None
        if node_mode and node_mode != "online":
            return True
        return True
    except Exception:
        return True


def _local_settings_path():
    userhome = getattr(shared, "path_userhome", None)
    if not userhome:
        userhome = os.getenv("simpleai_userhome", None)
    if not userhome:
        try:
            userhome = getattr(getattr(shared, "args", None), "userhome_path", None)
        except Exception:
            userhome = None
    if not userhome:
        userhome = "users"
    return os.path.abspath(os.path.join(userhome, LOCAL_SETTINGS_FILENAME))


def _load_local_settings():
    path = _local_settings_path()
    try:
        if not os.path.exists(path):
            return {"user": {}, "admin": {}}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"user": {}, "admin": {}}
        user = data.get("user", {})
        admin = data.get("admin", {})
        data["user"] = user if isinstance(user, dict) else {}
        data["admin"] = admin if isinstance(admin, dict) else {}
        return data
    except Exception:
        return {"user": {}, "admin": {}}


def _save_local_settings(data):
    path = _local_settings_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception:
        return False


def _get_local_setting(scope, key):
    if not _is_local_mode():
        return None, False
    data = _load_local_settings()
    values = data.get(scope, {})
    if not isinstance(values, dict) or key not in values:
        return None, False
    return values.get(key), True


def _set_local_setting(scope, key, value):
    if not _is_local_mode():
        return False
    data = _load_local_settings()
    values = data.setdefault(scope, {})
    if not isinstance(values, dict):
        values = {}
        data[scope] = values
    values[key] = value
    return _save_local_settings(data)


def clear_local_setting(scope, key):
    if not _is_local_mode():
        return False
    data = _load_local_settings()
    values = data.get(scope, {})
    if not isinstance(values, dict) or key not in values:
        return False
    del values[key]
    return _save_local_settings(data)

def convert_value(value):
    global bool_map, float_pattern

    if not isinstance(value, str):
        return value
    
    if value.lower() in bool_map:
        value = bool_map[value.lower()]
    elif value.isdigit() or ((value.startswith('-') or value.startswith('+')) and value[1:].isdigit()):
        value = int(value)
    elif re.match(float_pattern, value):
        value = float(value)
    elif value == 'None' or value == 'Unknown':
        value = None
    return value

def _get_env_bool(keys, default_value=False):
    if isinstance(keys, str):
        keys = [keys]
    for key in keys:
        value = os.environ.get(key)
        if value is None:
            continue
        value = value.strip().lower()
        if value in ("1", "true", "yes", "on"):
            return True
        if value in ("0", "false", "no", "off"):
            return False
    return default_value

def get_admin_default(admin_key):
    global cache_vars, default

    cache_key = f'admin_{admin_key}'
    if admin_key == 'vlm_checkbox':
        cache_vars[cache_key] = True
        return True
    if admin_key == 'advanced_logs':
        value = _get_env_bool(["SIMPLEAI_ADVANCED_LOGS", "ADVANCED_LOGS"], False)
        cache_vars[cache_key] = value
        return value
    if cache_key in cache_vars:
        return cache_vars[cache_key]
    local_value, local_found = _get_local_setting("admin", admin_key)
    if local_found:
        cache_vars[cache_key] = local_value
        return local_value
    try:
        admin_value = shared.token.get_local_admin_vars(admin_key)
        admin_value = admin_value.strip() if isinstance(admin_value, str) else 'None'
    except Exception:
        admin_value = 'None'
    if admin_value is None or admin_value=="None" or admin_value=="Unknown":
        if admin_key in default:
            admin_value = str(default[admin_key])
        else:
            admin_value = 'None'
    admin_value = convert_value(admin_value)
    cache_vars[cache_key] = admin_value
    return admin_value

def get_user_default(user_key, state, config_default=None):
    global cache_vars, default

    user_session = state.get("__session", None) if isinstance(state, dict) else None
    ua_hash = state.get("ua_hash", None) if isinstance(state, dict) else None
    cache_key = f'{user_session}_{user_key}' if user_session else None
    if cache_key and cache_key in cache_vars:
        return cache_vars[cache_key]
    local_value, local_found = _get_local_setting("user", user_key)
    if local_found:
        if cache_key:
            cache_vars[cache_key] = local_value
        return local_value
    if not user_session or not ua_hash:
        if config_default is not None:
            user_value = str(config_default)
        elif user_key in default:
            user_value = str(default[user_key])
        else:
            user_value = 'None'
        user_value = convert_value(user_value)
        if cache_key:
            cache_vars[cache_key] = user_value
        return user_value
    try:
        user_value = shared.token.get_local_vars(user_key, 'None', user_session, ua_hash)
        user_value = user_value.strip() if isinstance(user_value, str) else 'None'
    except Exception:
        user_value = 'None'
    if user_value is None or user_value=="None" or user_value=="Unknown":
        if config_default is not None:
            user_value = str(config_default)
        else:
            if user_key in default:
                user_value = str(default[user_key])
            else:
                user_value = 'None'
    user_value = convert_value(user_value)
    cache_vars[cache_key] = user_value
    return user_value

def set_admin_default_value(key, value, state):
    global cache_vars

    if key == 'vlm_checkbox':
        value = True
    if key == 'advanced_logs':
        value = get_admin_default('advanced_logs')
        cache_vars[f'admin_{key}'] = value
        return
    cache_key = f'admin_{key}'
    cache_vars[cache_key] = value
    try:
        shared.token.set_local_admin_vars(key, str(value), state["__session"], state["ua_hash"])
    except Exception:
        if not _is_local_mode():
            raise
    _set_local_setting("admin", key, value)

def set_user_default_value(key, value, state):
    global cache_vars

    cache_key = f'{state["__session"]}_{key}'
    cache_vars[cache_key] = value
    try:
        user = state.get("user", None) if isinstance(state, dict) else None
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
        is_guest = bool(user_did and shared.token.is_guest(user_did))
    except Exception:
        is_guest = False
    try:
        if is_guest and hasattr(shared.token, 'set_local_vars_for_guest'):
            shared.token.set_local_vars_for_guest(key, str(value), state["__session"], state["ua_hash"])
        else:
            shared.token.set_local_vars(key, str(value), state["__session"], state["ua_hash"])
    except Exception:
        if not _is_local_mode():
            raise
    _set_local_setting("user", key, value)

default = {
    'disable_preview': False,
    'adm_scaler_positive': 1.5,
    'adm_scaler_negative': 0.8,
    'adm_scaler_end': 0.3,
    'adaptive_cfg': 7.0,
    'sampler_name': 'dpmpp_2m_sde_gpu',
    'scheduler_name': 'karras',
    'generate_image_grid': False,
    'overwrite_step': -1,
    'overwrite_switch': -1,
    'overwrite_width': -1,
    'overwrite_height': -1,
    'overwrite_vary_strength': -1,
    'overwrite_upscale_strength': -1,
    'mixing_image_prompt_and_vary_upscale': False,
    'mixing_image_prompt_and_inpaint': False,
    'debugging_cn_preprocessor': False,
    'skipping_cn_preprocessor': False,
    'controlnet_softness': 0.25,
    'canny_low_threshold': 64,
    'canny_high_threshold': 128,
    'refiner_swap_method': 'joint',
    'freeu': [1.01, 1.02, 0.99, 0.95],
    'debugging_inpaint_preprocessor': False,
    'inpaint_disable_initial_latent': False,
    'inpaint_engine': 'LanPaint',
    'inpaint_strength': 1,
    'inpaint_respective_field': 0.618,
    'inpaint_advanced_masking_checkbox': True,
    'invert_mask_checkbox': False,
    'inpaint_erode_or_dilate': 0,
    'loras_min_weight': -5,
    'loras_max_weight': 5,
    'max_lora_number': 8,
    'max_image_number': 32,
    'image_number': 2,
    'output_format': 'jpeg',
    'save_metadata_to_images': True,
    'metadata_scheme': 'simple',
    'input_image_checkbox': False,
    'advanced_checkbox': True,
    'backfill_prompt': False,
    'gallery_frost_enabled': True,
    'translation_methods': 'Third APIs',
    'backend': 'SDXL',
    'comfyd_active_checkbox': True,
    'image_catalog_max_number': 65,
    'clip_skip': 2,
    'clip_model': 'Default (model)',
    'vae': 'Default (model)',
    'upscale_model': 'default',
    'developer_debug_mode_checkbox': True,
    'fast_comfyd_checkbox': False,
    'dynamic_vram_checkbox': True,
    'disable_smart_memory_checkbox': True,
    'reserved_vram': 0,
    'vlm_checkbox': True,
    'vlm_version': 'Qwen3.5-9B-abliterated-Q4_K_M',
    'advanced_logs': False,
    'wavespeed_strength': 0.12,
    'cache_ram_enable': False,
    'cache_ram': 2,
    'p2p_active_checkbox': False,
    'p2p_remote_process': 'Disable',
    'p2p_in_did_list': '',
    'p2p_out_did_list': '',
    'guest_can_generate': False,
    'guest_can_download_models': False,
    'default_user_can_generate': True,
    'default_user_can_download_models': False,
    'style_preview_checkbox': True,
    'quick_enhance': False,
    'enhance_checkbox': False,
    'enhance_enabled_1': False,
    'enhance_enabled_2': False,
    'enhance_enabled_3': False,
    'enhance_mask_model': 'sam',
    'enhance_mask_cloth_category': 'full',
    'enhance_mask_sam_model': 'vit_b',
    'enhance_mask_text_threshold': 0.25,
    'enhance_mask_box_threshold': 0.3,
    'enhance_mask_sam_max_detections': 0,
    'enhance_inpaint_disable_initial_latent': False,
    'enhance_inpaint_engine': 'None',
    'enhance_inpaint_strength': 0.5,
    'enhance_inpaint_respective_field': 0,
    'enhance_inpaint_erode_or_dilate': 0,
    'enhance_mask_invert': False,
    }
