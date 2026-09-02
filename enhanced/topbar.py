import os
import json
import hashlib
import gradio as gr
import numbers
import copy
import re
import sys
import args_manager
import random
import cv2
import numpy as np
import base64
import shared
import modules.util as util
import modules.config as config
import modules.flags
from ui.generation_performance import is_mobile_user_agent
import modules.regen_manifest as regen_manifest
import modules.sdxl_styles
import modules.constants as constants
from modules.access_mode import get_access_mode, is_local_mode, state_has_full_local_access
import modules.meta_parser as meta_parser
import modules.sdxl_styles as sdxl_styles
import modules.style_sorter as style_sorter
import enhanced.all_parameters as ads
import enhanced.gallery as gallery_util
import enhanced.superprompter as superprompter
import enhanced.comfy_task as comfy_task
import enhanced.resolution_preprocess as resolution_preprocess
import ldm_patched.modules.model_management
import logging
import threading
import time
from urllib.parse import urlsplit
from ui.update_helpers import dataset_update, skip_update
from gradio.route_utils import API_PREFIX
from enhanced.logger import format_name
logger = logging.getLogger(format_name(__name__))

from datetime import datetime
from modules.model_loader import is_models_file_absent, refresh_model_list, download_model_files
import modules.model_loader as model_loader
from modules.meta_parser import get_welcome_image, describe_prompt_for_scene
from enhanced.simpleai import comfyd, get_admin_recovery_guide, get_identity_access_status, get_path_in_user_dir, toggle_identity_dialog, sync_intput_reserved, get_identity_mode_text, normalize_ui_lang, update_comfyd_io_paths
from enhanced.vlm import VLM, vlm
from simpleai_base.simpleai_base import export_identity_qrcode_svg, import_identity_qrcode, gen_ua_session

def gr_update(**kwargs):
    return gr.update(**kwargs)

def _get_request_header(request, key, default=""):
    headers = getattr(request, "headers", {}) or {}
    if hasattr(headers, "get"):
        return headers.get(key, default)
    return default

def _get_request_host_header(request, default=""):
    return _get_request_header(request, "host", default)

def _get_request_client_host_port(request):
    client = getattr(request, "client", None)
    if isinstance(client, dict):
        return str(client.get("host", "") or ""), client.get("port", "")
    if isinstance(client, (tuple, list)) and len(client) >= 2:
        return str(client[0]), client[1]
    return str(getattr(client, "host", "") or ""), getattr(client, "port", "")

def _first_forwarded_header_value(value):
    return str(value or "").split(",", 1)[0].strip().strip('"')

def _parse_forwarded_header(request):
    forwarded = _get_request_header(request, "forwarded", "")
    if not forwarded:
        return {}
    first_entry = str(forwarded).split(",", 1)[0]
    values = {}
    for part in first_entry.split(";"):
        if "=" not in part:
            continue
        key, raw_value = part.split("=", 1)
        key = str(key or "").strip().lower()
        value = str(raw_value or "").strip().strip('"')
        if key and value:
            values[key] = value
    return values

def _host_has_explicit_port(host):
    text = str(host or "").strip()
    if not text:
        return False
    if text.startswith("["):
        return "]:" in text
    return text.count(":") == 1

def _append_port_to_host(host, port):
    text = str(host or "").strip()
    port_text = str(port or "").strip()
    if not text or not port_text or _host_has_explicit_port(text):
        return text
    if ":" in text and not text.startswith("["):
        return f"[{text}]:{port_text}"
    return f"{text}:{port_text}"

def _get_request_origin(request, default=""):
    origin_header = _first_forwarded_header_value(_get_request_header(request, "origin", ""))
    if origin_header.startswith(("http://", "https://")):
        parsed_origin = urlsplit(origin_header)
        if parsed_origin.scheme and parsed_origin.netloc:
            return f"{parsed_origin.scheme}://{parsed_origin.netloc}"

    forwarded = _parse_forwarded_header(request)
    forwarded_host = _first_forwarded_header_value(
        forwarded.get("host")
        or _get_request_header(request, "x-forwarded-host", "")
        or _get_request_host_header(request, "")
    )
    forwarded_port = _first_forwarded_header_value(
        _get_request_header(request, "x-forwarded-port", "")
    )
    host = _append_port_to_host(forwarded_host, forwarded_port)
    if not host:
        return default

    scheme = _first_forwarded_header_value(
        forwarded.get("proto")
        or _get_request_header(request, "x-forwarded-proto", "")
        or _get_request_header(request, "x-forwarded-scheme", "")
    )
    if not scheme:
        request_url = getattr(request, "url", None)
        scheme = str(getattr(request_url, "scheme", "") or "").strip()
    if not scheme:
        scope = getattr(request, "scope", None)
        if isinstance(scope, dict):
            scheme = str(scope.get("scheme", "") or "").strip()
    if scheme not in ("http", "https"):
        scheme = "http"
    return f"{scheme}://{host}"

def _get_request_base_url(request, origin=None, default=""):
    request_origin = str(origin or "").strip() or _get_request_origin(request, default="")
    if not request_origin:
        return default
    webroot = str(getattr(args_manager.args, "webroot", "") or "").strip()
    if webroot and not webroot.startswith("/"):
        webroot = "/" + webroot
    return f"{request_origin}{webroot.rstrip('/')}"

def _update_request_web_state(state_params, request):
    if not isinstance(state_params, dict):
        return
    if "__webpath" not in state_params.keys():
        state_params.update({"__webpath": f'{args_manager.args.webroot}/file={os.getcwd()}'})
    request_origin = _get_request_origin(request, "")
    if request_origin:
        state_params["__origin"] = request_origin
        state_params["__base_url"] = _get_request_base_url(request, origin=request_origin)

# app context
system_message = ''
config_ext = {}
enhanced_config = os.path.abspath(f'./enhanced/config.json')
if os.path.exists(enhanced_config):
    with open(enhanced_config, "r", encoding="utf-8") as json_file:
        config_ext.update(json.load(json_file))
else:
    config_ext.update({'fooocus_line': '# 2.1.852', 'simplesdxl_line': '# 2023-12-20'})

def preset_filter(presets, apply_missing_model_filter=True):
    try:
        compute_capability = int(shared.gpu_arch[2:]) if shared.gpu_arch else None
        # 定义不同显卡系列的判断条件
        is_10_series_or_lower = compute_capability is not None and compute_capability <= 61  # 10系列及以下
        is_20_series_or_lower = compute_capability is not None and compute_capability <= 75  # 20系列及以下

        # 创建过滤后的预设列表
        filtered_presets = []
        seen_presets = set()
 
        # 获取是否跳过模型缺失过滤的设置
        missing_model_filter = ads.get_admin_default('missing_model_filter_checkbox')

        for preset_item in presets:
            # 标记是否应该被过滤
            should_filter = False
            filter_reason = ""

            # 获取预设名称字符串用于判断
            if isinstance(preset_item, list) and len(preset_item) > 0:
                preset_name = str(preset_item[0])
            else:
                # 处理普通字符串预设
                preset_name = str(preset_item)

            # 10系列及以下显卡过滤规则
            if is_10_series_or_lower:
                if 'fp4' in preset_name.lower() or 'int4' in preset_name.lower() or 'nun' in preset_name.lower():
                    should_filter = True
                    filter_reason = "10 Series GPU incompatible (Nunchaku)"

            elif is_20_series_or_lower:
                if ('NunQwenEdit+' in preset_name) or ('fp4' in preset_name.lower()):
                    should_filter = True
                    filter_reason = "20 Series GPU incompatible (NunQwenEdit+)"

            # 只有当启用模型缺失过滤选项时，才检查模型是否缺失
            if (
                not should_filter
                and apply_missing_model_filter
                and missing_model_filter
                and is_models_file_absent(preset_name, None)
            ):
                should_filter = True
                filter_reason = "Missing Model"

            # 记录被过滤的预置包和原因
            # if should_filter:
            #     logger.info(f"[Preset Filter] Disvisible: {preset_name}, Reason: {filter_reason}")

            if not should_filter:
                # 处理预设名称，去掉 _fp4 或 _int4 后缀
                if isinstance(preset_item, list) and len(preset_item) > 0:
                    original_name = str(preset_item[0])
                    # 检查并去掉 _fp4 或 _int4 后缀
                    if original_name.endswith('_fp4'):
                        modified_name = original_name[:-4]
                    elif original_name.endswith('_int4'):
                        modified_name = original_name[:-5]
                    else:
                        modified_name = original_name
                    if modified_name not in seen_presets:
                        seen_presets.add(modified_name)
                        modified_preset = [modified_name] + preset_item[1:]
                        filtered_presets.append(modified_preset)
                else:
                    # 处理普通字符串形式的预设
                    original_name = str(preset_item)
                    # 检查并去掉 _fp4 或 _int4 后缀
                    if original_name.endswith('_fp4'):
                        modified_name = original_name[:-4]
                    elif original_name.endswith('_int4'):
                        modified_name = original_name[:-5]
                    else:
                        modified_name = original_name
                    # 检查是否已经添加过相同名称的预设
                    if modified_name not in seen_presets:
                        seen_presets.add(modified_name)
                        filtered_presets.append(modified_name)
        return filtered_presets
    except Exception:
        return presets

def is_preset_file_allowed(p):
    if not p:
        return False
    if p.startswith('.'):
        return False
    p2 = str(p).replace('\\', '/').strip('/')
    parts = [x for x in p2.split('/') if x]
    if parts and parts[-1].lower() == 'liveportrait video exp.json':
        return False
    excluded_dirs = {'deprecated', 'characters', 'scene_prompt_recommendations'}
    if any(part.lower() in excluded_dirs for part in parts[:-1]):
        return False
    return True

PRESET_MISSING_MARKER = "\u2B07"
PRESET_STORE_ORDER = [
    "Z-imageT",
    "Krea2-Turbo",
    "Krea2-ImageEdit",
    "Z-TTP",
    "Flux2-Klein",
    "Flux2-KleinEdit",
    "Flux2-AngleLight",
    "Flux2-A2R",
    "Flux2-KleinPose",
    "Flux1-dev",
    "FluxKontext",
    "Swap+",
    "NunSwap_fp4",
    "NunSwap_int4",
    "NunFlux_fp4",
    "NunFlux_int4",
    "NunQwenEdit+_fp4",
    "NunQwenEdit+_int4",
    "QwenEdit+",
    "Qwen2512",
    "QwenA2R",
    "QwenPose",
    "QwenGaussian",
    "QwenMultiAngle",
    "QwenNSFW",
    "Illustrious",
    "Illustrious(OB)",
    "Illustrious(MiaoKa)",
    "ChenkinXL",
    "Anima",
    "Wan(I2V)",
    "Wan-Uni3C(I2V)",
    "Wan-Extent",
    "Dasiwa(I2V)",
    "Dasiwa-Extent",
    "Wan(T2V)",
    "Wan-Uni3C(T2V)",
    "Wan(T2I)",
    "MiniMax-H3(T2V)",
    "MiniMax-H3(I2V)",
    "MiniMax-H3(R2V)",
    "MiniMax-H3(R2C)",
    "MiniMax-H3(R2I)",
    "Bernini-ImageEdit",
    "Bernini-MultiI2V",
    "Bernini-VideoEdit",
    "Bernini-VideoUpscale",
    "Wan-TTP",
    "Wan-Animate",
    "Wan-Animate-2",
    "Wan-Swap",
    "Wan-SCAIL2",
    "Wan-SCAIL2-SAM3",
    "Wan-Remover",
    "InfiniteTalk",
    "InfiniteTalk-AV2V",
    "LTX(I2V)",
    "LTX(Extent)",
    "LTX(IA2V)",
    "LTX(T2V)",
    "LTX(TA2V)",
    "LTX(AudioGen)",
    "LTX(InsightTool)",
    "LTX-Outpaint",
    "Nvidia-VSR",
    "Hunyuan-Foley",
    "FooocusSDXL",
    "Eraser",
    "StyleTransfer",
    "StyleTransfer+",
    "Removebg",
    "Imagerepair+",
    "OneKeyKontext",
    "OneKeyPose",
    "OneKey-Outpaint",
    "Swapface",
    "Depthstatue",
    "Tile",
    "Relight",
    "SD1.5",
    "ReActor-FaceSwap",
    "LivePortrait Exp",
    "LivePortrait Video",
    "Topaz-Starlight",
    "Depth Video",
    "GeneralAPIImage"
]

def _strip_preset_marker(name):
    if not isinstance(name, str):
        return name
    base = name
    if base.endswith(PRESET_MISSING_MARKER):
        base = base[:-len(PRESET_MISSING_MARKER)].strip()
    return base

def _canonicalize_preset_name(name):
    if not isinstance(name, str):
        return name
    name = _strip_preset_marker(name).strip()
    is_user_preset = name.endswith('.')
    base_name = name[:-1] if is_user_preset else name
    if base_name.endswith('_fp4'):
        base_name = base_name[:-4]
    elif base_name.endswith('_int4'):
        base_name = base_name[:-5]
    if is_user_preset and base_name:
        return f'{base_name}.'
    return base_name

def _has_preset_model_probe(preset_name, user_did=None):
    if not isinstance(preset_name, str) or not preset_name:
        return False

    try:
        get_cached = getattr(model_loader, "_get_cached_preset_model_list", None)
        if callable(get_cached):
            _, model_list, _ = get_cached(preset_name, user_did)
            if model_list is not None:
                return True
    except Exception:
        pass

    try:
        get_preset_file = getattr(model_loader, "_get_preset_file_for_missing_models", None)
        if callable(get_preset_file):
            preset_path = get_preset_file(preset_name, user_did)
            return bool(preset_path and os.path.exists(preset_path))
    except Exception:
        pass

    try:
        if preset_name.endswith('.'):
            if user_did is None:
                return False
            user_path_preset = get_path_in_user_dir('presets', user_did)
            return os.path.exists(os.path.abspath(os.path.join(user_path_preset, f'{preset_name}json')))
        return os.path.exists(os.path.abspath(f'./presets/{preset_name}.json'))
    except Exception:
        return False

def _append_status_marker(preset_name, user_did=None):
    if not isinstance(preset_name, str) or not preset_name:
        return preset_name
    base_name = _strip_preset_marker(preset_name).strip()
    candidate_names = [base_name]
    if base_name.endswith('.'):
        user_base_name = base_name[:-1]
        if user_base_name and not user_base_name.endswith('_fp4') and not user_base_name.endswith('_int4'):
            candidate_names.extend([f'{user_base_name}_fp4.', f'{user_base_name}_int4.'])
    elif not base_name.endswith('_fp4') and not base_name.endswith('_int4'):
        candidate_names.extend([f'{base_name}_fp4', f'{base_name}_int4'])

    disable_backend = bool(getattr(shared.args, "disable_backend", False))
    cache = getattr(model_loader, "presets_model_list", {})
    check_exists_fn = getattr(model_loader, "check_models_exists", None)
    has_missing = False
    has_probe = False

    for candidate in candidate_names:
        if not _has_preset_model_probe(candidate, user_did):
            continue
        if disable_backend:
            if not callable(check_exists_fn) or candidate not in cache:
                continue
            has_probe = True
            try:
                if check_exists_fn(candidate, user_did):
                    return base_name
                has_missing = True
            except Exception:
                continue
        else:
            has_probe = True
            try:
                if not is_models_file_absent(candidate, user_did):
                    return base_name
                has_missing = True
            except Exception:
                continue

    if has_probe and has_missing:
        return f"{base_name}{PRESET_MISSING_MARKER}"
    return base_name

def _apply_complete_markers(preset_list, user_did=None):
    marked_list = []
    for item in preset_list:
        if isinstance(item, list) and len(item) > 0:
            marked_name = _append_status_marker(item[0], user_did)
            marked_list.append([marked_name] + item[1:])
        else:
            marked_list.append(item)
    return marked_list

def _canonicalize_preset_samples(samples):
    normalized = []
    seen = set()
    for item in samples:
        if isinstance(item, list) and len(item) > 0:
            display_name = _canonicalize_preset_name(item[0])
            if isinstance(item[0], str) and item[0].endswith(PRESET_MISSING_MARKER):
                display_name = f"{display_name}{PRESET_MISSING_MARKER}"
            if display_name not in seen:
                seen.add(display_name)
                normalized.append([display_name] + item[1:])
        else:
            display_name = _canonicalize_preset_name(item)
            if display_name not in seen:
                seen.add(display_name)
                normalized.append(display_name)
    return normalized

def _unmark_preset_samples(samples):
    unmarked = []
    for item in samples:
        if isinstance(item, list) and len(item) > 0:
            unmarked.append([_canonicalize_preset_name(item[0])] + item[1:])
        else:
            unmarked.append(_canonicalize_preset_name(item))
    return unmarked

def _canonicalize_nav_preset_names(preset_names):
    normalized = []
    seen = set()
    for preset in preset_names:
        if not preset:
            continue
        display_name = _canonicalize_preset_name(str(preset).strip())
        if not display_name or display_name in seen:
            continue
        seen.add(display_name)
        normalized.append(display_name)
    return normalized

def _resolve_preset_storage_name(preset_name, user_did=None):
    if not preset_name:
        return preset_name

    base_name = _strip_preset_marker(str(preset_name).strip())
    arch_str = config.get_gpu_arch_str_in_preset_name()
    path_preset = os.path.abspath('./presets/')
    user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')

    if base_name.endswith('.') or base_name.endswith('_fp4') or base_name.endswith('_int4'):
        candidate_names = [base_name]
    else:
        candidate_names = [base_name]
        if arch_str:
            candidate_names.append(f'{base_name}{arch_str}')
        candidate_names.extend([f'{base_name}_fp4', f'{base_name}_int4'])

    seen = set()
    for candidate in candidate_names:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if candidate.endswith('.'):
            preset_file = os.path.join(user_path_preset, f'{candidate[:-1]}.json')
            preset_file2 = os.path.join(user_path_preset, f'{candidate[:-1]}{arch_str}.json')
        else:
            preset_file = os.path.join(path_preset, f'{candidate}.json')
            preset_file2 = os.path.join(path_preset, f'{candidate}{arch_str}.json')
        if os.path.exists(preset_file2):
            return candidate[:-len(arch_str)] if arch_str and candidate.endswith(arch_str) else candidate
        if os.path.exists(preset_file):
            return candidate
    if user_did and not base_name.endswith('.'):
        user_candidate_names = [base_name]
        if arch_str and not base_name.endswith(arch_str):
            user_candidate_names.append(f'{base_name}{arch_str}')
        if not base_name.endswith('_fp4') and not base_name.endswith('_int4'):
            user_candidate_names.extend([f'{base_name}_fp4', f'{base_name}_int4'])
        user_seen = set()
        for candidate in user_candidate_names:
            if not candidate or candidate in user_seen:
                continue
            user_seen.add(candidate)
            preset_file = os.path.join(user_path_preset, f'{candidate}.json')
            if os.path.exists(preset_file):
                return _canonicalize_preset_name(f'{candidate}.')
    return base_name

def _preset_storage_exists(preset_name, user_did=None):
    resolved_name = _resolve_preset_storage_name(preset_name, user_did)
    arch_str = config.get_gpu_arch_str_in_preset_name()
    path_preset = os.path.abspath('./presets/')
    user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')

    if resolved_name.endswith('.'):
        preset_file = os.path.join(user_path_preset, f'{resolved_name[:-1]}.json')
        preset_file2 = os.path.join(user_path_preset, f'{resolved_name[:-1]}{arch_str}.json')
    else:
        preset_file = os.path.join(path_preset, f'{resolved_name}.json')
        preset_file2 = os.path.join(path_preset, f'{resolved_name}{arch_str}.json')

    return os.path.exists(preset_file2) or os.path.exists(preset_file)

def _filter_existing_presets(presets, user_did=None):
    path_preset = os.path.abspath(f'./presets/')
    user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')
    available = []
    arch_str = config.get_gpu_arch_str_in_preset_name()
    for preset in presets:
        preset_name = _strip_preset_marker(preset)
        if preset_name.endswith('.'):
            preset_file = os.path.join(user_path_preset, f'{preset_name[:-1]}.json')
            preset_file2 = os.path.join(user_path_preset, f'{preset_name[:-1]}{arch_str}.json')
        else:
            preset_file = os.path.join(path_preset, f'{preset_name}.json')
            preset_file2 = os.path.join(path_preset, f'{preset_name}{arch_str}.json')
        if os.path.exists(preset_file2):
            preset_file = preset_file2
        if os.path.exists(preset_file):
            available.append(preset)
    return available

def _nav_button_limit(limit=None):
    try:
        value = int(limit if limit is not None else shared.BUTTON_NUM)
        return value if value > 0 else 15
    except Exception:
        return 15

def _is_nav_preset_value_present(value):
    if value is None:
        return False
    text = str(value).strip()
    return bool(text) and text not in ["Unknown", "None", "Default"]

def _persist_nav_preset_value(user_session, ua_hash, presets_list):
    shared.token.set_local_vars("user_presets", presets_list, user_session, ua_hash)


def _state_can_manage_preset_store(state):
    if is_local_mode():
        return True
    try:
        user = state.get("user") if isinstance(state, dict) else None
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
        if not user_did or shared.token.is_guest(user_did):
            return False
        return state_has_full_local_access(state)
    except Exception:
        return False

def _coerce_nav_preset_list(presets, user_did=None, fallback_preset=None, limit=None, apply_missing_model_filter=True):
    limit = _nav_button_limit(limit)
    names = _canonicalize_nav_preset_names(list(presets or []))
    fallback_names = _canonicalize_nav_preset_names([fallback_preset] if fallback_preset else [])

    def _filter_names(source_names, apply_filter):
        try:
            filtered = preset_filter(source_names, apply_missing_model_filter=apply_filter)
        except TypeError:
            filtered = preset_filter(source_names)
        except Exception:
            filtered = source_names
        filtered = _canonicalize_nav_preset_names(filtered)
        existing = []
        seen = set()
        for preset in filtered:
            resolved_preset = _canonicalize_preset_name(_resolve_preset_storage_name(preset, user_did))
            if not resolved_preset or resolved_preset in seen:
                continue
            resolved_file = f'{resolved_preset[:-1] if resolved_preset.endswith(".") else resolved_preset}.json'
            if not is_preset_file_allowed(resolved_file):
                continue
            if not _preset_storage_exists(resolved_preset, user_did):
                continue
            seen.add(resolved_preset)
            existing.append(resolved_preset)
            if len(existing) >= limit:
                break
        return existing

    existing_presets = _filter_names(names, apply_missing_model_filter)
    if not existing_presets and apply_missing_model_filter:
        existing_presets = _filter_names(names, False)
    if not existing_presets and fallback_names:
        existing_presets = _filter_names(fallback_names, False)
    return _canonicalize_nav_preset_names(existing_presets)[:limit]

def _build_default_nav_preset_list(user_did=None, fallback_preset=None, limit=None):
    limit = _nav_button_limit(limit)
    path_preset = os.path.abspath(f'./presets/')
    candidates = []
    if fallback_preset:
        candidates.append(fallback_preset)
    if getattr(config, "preset", None):
        candidates.append(config.preset)
    file_times = []
    try:
        presets = [p for p in util.get_files_from_folder(path_preset, ['.json'], None)
                  if is_preset_file_allowed(p)]
        file_times.extend((f[:-5], os.path.getmtime(os.path.join(path_preset, f))) for f in presets)
    except Exception:
        pass
    try:
        user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')
        if user_path_preset and os.path.exists(user_path_preset):
            presets2 = [p for p in util.get_files_from_folder(user_path_preset, ['.json'], None)
                       if is_preset_file_allowed(p)]
            file_times.extend((f'{f[:-5]}.', os.path.getmtime(os.path.join(user_path_preset, f))) for f in presets2)
    except Exception:
        pass
    candidates.extend([name for name, _ in sorted(file_times, key=lambda x: x[1], reverse=True)])
    candidates.extend(PRESET_STORE_ORDER)
    return _coerce_nav_preset_list(
        candidates,
        user_did=user_did,
        fallback_preset=None,
        limit=limit,
        apply_missing_model_filter=False,
    )

def _nav_minimum_preset_message(lang=None):
    if normalize_ui_lang(lang) == "en":
        return "The navbar must keep at least one preset. The current preset has been kept."
    return "导航栏至少需要保留 1 个预设，已保留当前预设。"

def get_preset_name_list(user_session, ua_hash):
    user_did = shared.token.check_sstoken_and_get_did(user_session, ua_hash)
    is_guest = not user_did or shared.token.is_guest(user_did)

    try:
        stored_presets = shared.token.get_local_vars("user_presets", "", user_session, ua_hash)
    except Exception as e:
        logger.debug(f"Error getting nav presets: {str(e)}")
        stored_presets = ""
    if _is_nav_preset_value_present(stored_presets):
        nav_presets = _coerce_nav_preset_list(str(stored_presets).split(','), user_did)
        if nav_presets:
            presets_list = ','.join(nav_presets)
            if presets_list != str(stored_presets).strip():
                _persist_nav_preset_value(user_session, ua_hash, presets_list)
            return presets_list
        logger.warning(f"[Preset Management] Ignored empty/invalid stored navbar preset list for user_did={user_did}")

    nav_presets = _build_default_nav_preset_list(user_did if not is_guest else None, config.preset)
    presets_list = ','.join(nav_presets)
    _persist_nav_preset_value(user_session, ua_hash, presets_list)
    return presets_list

def get_initial_nav_preset(state_params):
    try:
        preset_names = get_preset_name_list(
            state_params.get("__session", ""),
            state_params.get("ua_hash", ""),
        )
    except Exception:
        preset_names = ""

    presets = [p.strip() for p in str(preset_names or "").split(",") if p.strip()]
    try:
        presets = preset_filter(presets)
    except Exception:
        pass
    try:
        user = state_params.get("user", None)
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
    except Exception:
        user_did = None
    presets = _filter_existing_presets(presets, user_did)
    presets = _canonicalize_nav_preset_names(presets)
    if presets:
        return presets[0]
    return config.preset


def _state_user_did(state):
    try:
        user = state.get("user", None) if isinstance(state, dict) else None
        return user.get_did() if user is not None and hasattr(user, "get_did") else None
    except Exception:
        return None


def _state_user_nickname(state, default=""):
    try:
        user = state.get("user", None) if isinstance(state, dict) else None
        return user.get_nickname() if user is not None and hasattr(user, "get_nickname") else default
    except Exception:
        return default


preset_samples = {}
preset_samples_user_mtime = {}
preset_samples_base_mtime = {}
PRESET_COMPLETE_REFRESH_SECONDS = 8
preset_samples_complete_ts = {}
preset_store_meta_cache = {}
preset_store_meta_user_mtime = {}
preset_store_meta_base_mtime = {}
preset_store_meta_samples_sig = {}
preset_status_refresh_lock = threading.Lock()
preset_status_refresh_thread = None

def _invalidate_preset_store_cache(user_did=None):
    cache_key = user_did if user_did else 'guest'
    preset_samples.pop(cache_key, None)
    preset_samples_user_mtime.pop(cache_key, None)
    preset_samples_base_mtime.pop(cache_key, None)
    preset_samples_complete_ts.pop(cache_key, None)
    preset_store_meta_cache.pop(cache_key, None)
    preset_store_meta_user_mtime.pop(cache_key, None)
    preset_store_meta_base_mtime.pop(cache_key, None)
    preset_store_meta_samples_sig.pop(cache_key, None)

def get_preset_samples(user_did=None, include_status_markers=True):
    global preset_samples, preset_samples_user_mtime, preset_samples_base_mtime, preset_samples_complete_ts
    cache_key = user_did if user_did else 'guest'
    path_preset = os.path.abspath(f'./presets/')
    base_files = [p for p in util.get_files_from_folder(path_preset, ['.json'], None) 
                 if is_preset_file_allowed(p)]
    base_presets = [p[:-5] for p in base_files]
    base_mtime = 0
    for f in base_files:
        try:
            base_mtime = max(base_mtime, os.path.getmtime(os.path.join(path_preset, f)))
        except Exception:
            continue

    user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')
    user_presets = []
    user_mtime = 0
    if user_path_preset and os.path.exists(user_path_preset):
        presets2 = [p for p in util.get_files_from_folder(user_path_preset, ['.json'], None)
                   if is_preset_file_allowed(p)]
        for p in presets2:
            user_presets.append(f'{p[:-5]}.')
            try:
                user_mtime = max(user_mtime, os.path.getmtime(os.path.join(user_path_preset, p)))
            except Exception:
                continue

    store_list = _filter_existing_presets(PRESET_STORE_ORDER, user_did)

    if (
        cache_key in preset_samples
        and preset_samples_user_mtime.get(cache_key, -1) == user_mtime
        and preset_samples_base_mtime.get(cache_key, -1) == base_mtime
    ):
        cached = preset_samples[cache_key]
        if not include_status_markers:
            return _unmark_preset_samples(cached)
        now = time.time()
        last_ts = preset_samples_complete_ts.get(cache_key, 0)
        if now - last_ts < PRESET_COMPLETE_REFRESH_SECONDS:
            return cached
        refreshed = _canonicalize_preset_samples(_apply_complete_markers(cached, user_did))
        preset_samples[cache_key] = refreshed
        preset_samples_complete_ts[cache_key] = now
        return refreshed

    if store_list:
        ordered_presets = store_list[:]
    else:
        ordered_presets = []
    existing = {_canonicalize_preset_name(p) for p in ordered_presets}
    # 追加：开发者硬编码之外的基础预置（按文件名字典序）
    for preset in sorted(base_presets):
        canonical = _canonicalize_preset_name(preset)
        if canonical not in existing:
            ordered_presets.append(preset)
            existing.add(canonical)
    # 追加：用户自定义预置（末尾，带.标识）
    for preset in user_presets:
        canonical = _canonicalize_preset_name(preset)
        if canonical not in existing:
            ordered_presets.append(preset)
            existing.add(canonical)

    ordered_list = preset_filter([[p] for p in ordered_presets], apply_missing_model_filter=False)
    if not include_status_markers:
        return _canonicalize_preset_samples(ordered_list)

    refresh_model_list(ordered_presets, user_did)
    marked_list = _canonicalize_preset_samples(_apply_complete_markers(ordered_list, user_did))
    if util.simpai_ui_trace_enabled():
        try:
            total_count = len(marked_list)
            missing_count = 0
            for item in marked_list:
                name = item[0] if isinstance(item, list) and item else item
                if isinstance(name, str) and name.endswith(PRESET_MISSING_MARKER):
                    missing_count += 1
            logger.info(
                f"[UI-TRACE] get_preset_samples.missing_marker_count | "
                f"cache_key={cache_key}, disable_backend={getattr(shared.args, 'disable_backend', False)}, "
                f"model_cache={len(getattr(model_loader, 'presets_model_list', {}))}, "
                f"missing={missing_count}, total={total_count}"
            )
        except Exception:
            pass
    preset_samples[cache_key] = marked_list
    preset_samples_user_mtime[cache_key] = user_mtime
    preset_samples_base_mtime[cache_key] = base_mtime
    preset_samples_complete_ts[cache_key] = time.time()
    return marked_list

def start_preset_status_refresh(user_did=None):
    global preset_status_refresh_thread

    with preset_status_refresh_lock:
        if preset_status_refresh_thread is not None and preset_status_refresh_thread.is_alive():
            return False

        def _refresh():
            try:
                get_preset_samples(user_did, include_status_markers=True)
            except Exception:
                logger.exception("Preset model status refresh failed")

        preset_status_refresh_thread = threading.Thread(
            target=_refresh,
            name="simpai-preset-status-refresh",
            daemon=True,
        )
        preset_status_refresh_thread.start()
        return True


def refresh_preset_store_list(state):
    user_did = None
    try:
        if isinstance(state, dict) and 'user' in state and state['user']:
            user_did = state['user'].get_did()
    except Exception:
        user_did = None

    _invalidate_preset_store_cache(user_did)

    return dataset_update(samples=get_preset_samples(user_did))


def get_system_message():
    global config_ext

    fooocus_log = os.path.abspath(f'./update_log.md')
    simpai_log = os.path.abspath(f'./simpai_log.md')
    update_msg_f = ''
    first_line_f = None
    if os.path.exists(fooocus_log):
        with open(fooocus_log, "r", encoding="utf-8") as log_file:
            line = log_file.readline()
            while line:
                if line == '\n':
                    line = log_file.readline()
                    continue
                if line.startswith("# ") and first_line_f is None:
                    first_line_f = line.strip()
                if line.strip() == config_ext['fooocus_line']:
                    break
                if first_line_f:
                    update_msg_f += line
                line = log_file.readline()
    update_msg_s = ''
    first_line_s = None
    if os.path.exists(simpai_log):
        with open(simpai_log, "r", encoding="utf-8") as log_file:
            line = log_file.readline()
            while line:
                if line == '\n':
                    line = log_file.readline()
                    continue
                if line.startswith("# ") and first_line_s is None:
                    first_line_s = line.strip()
                if line.strip() == config_ext['simplesdxl_line']:
                    break
                if first_line_s:
                    update_msg_s += line
                line = log_file.readline()
    update_msg_f = update_msg_f.replace("\n","  ")
    update_msg_s = update_msg_s.replace("\n","  ")
    
    f_log_path = os.path.abspath("./update_log.md")
    s_log_path = simpai_log
    if len(update_msg_f)>0:
        body_f = f'<b id="update_f">[SimpAI更新信息]</b>: {update_msg_f}<a href="{args_manager.args.webroot}/file={f_log_path}">更多>></a>   '
    else:
        body_f = '<b id="update_f"> </b>'
    if len(update_msg_s)>0:
        body_s = f'<b id="update_s">[系统消息 - 已更新内容]</b>: {update_msg_s}<a href="{args_manager.args.webroot}/file={s_log_path}">更多>></a>'
    else:
         body_s = '<b id="update_s"> </b>'
    import mistune
    body = mistune.html(body_f+body_s)
    if first_line_f and first_line_s and (first_line_f != config_ext['fooocus_line'] or first_line_s != config_ext['simplesdxl_line']):
        config_ext['fooocus_line']=first_line_f
        config_ext['simplesdxl_line']=first_line_s
        with open(enhanced_config, "w", encoding="utf-8") as config_file:
            json.dump(config_ext, config_file)
    return body if body else ''



def preset_instruction():
    head = "<div style='max-width:100%; max-height:65x; overflow:auto'>"
    foot = "</div>"
    body = f'<iframe id="instruction" src="{get_preset_inc_url(config.preset, args_manager.args.language)}" frameborder="0" scrolling="auto" width="100%" height="65"></iframe>'
    
    return head + body + foot

get_system_params_js = '''
function(system_params) {
    const params = new URLSearchParams(window.location.search);
    const readCookie = (name) => {
        try {
            const cookies = document.cookie.split(';').map(c => c.trim());
            const cookie = cookies.find(c => c.startsWith(name + '='));
            if (!cookie) return null;
            const raw = cookie.split('=').slice(1).join('=');
            try { return decodeURIComponent(raw); } catch (e) { return raw; }
        } catch (e) {
            return null;
        }
    };
    const sessionCookie = readCookie('aitoken') || (typeof getCookie === 'function' ? getCookie('aitoken') : null);
    const sessionLocal = (!sessionCookie && typeof localStorage !== "undefined") ? localStorage.getItem("aitoken") : null;
    const url_params = Object.fromEntries(params);
    if (url_params["__lang"]) 
        system_params["__lang"]=url_params["__lang"];
    if (!url_params["__lang"]) {
        const persistedLang = readCookie("ailang") || (typeof localStorage !== "undefined" ? localStorage.getItem("ailang") : null);
        if (persistedLang === "cn" || persistedLang === "en") {
            system_params["__lang"] = persistedLang;
        }
    }
    if (url_params["__theme"]) 
        system_params["__theme"]=url_params["__theme"];
    if (sessionCookie) 
        system_params["__session"]=sessionCookie;
    else if (sessionLocal)
        system_params["__session"]=sessionLocal;
    if (window.SimpAIWorkspaceRecovery && typeof window.SimpAIWorkspaceRecovery.prepareInitialSystemParams === "function") {
        system_params = window.SimpAIWorkspaceRecovery.prepareInitialSystemParams(system_params);
    }
    return system_params;
}
'''

def init_nav_bars(state_params, comfyd_active_checkbox, fast_comfyd_checkbox, dynamic_vram_checkbox, disable_smart_memory_checkbox, cache_clear_on_finish_checkbox, reserved_vram, cache_ram_enable, ram_pressure, vlm_checkbox, vlm_version, advanced_logs, wavespeed_strength, translation_methods, no_welcome_checkbox, missing_model_filter_checkbox, request: gr.Request):
    #logger.info(f'request.headers:{request.headers}')
    #logger.info(f'request.client:{request.client}')
    admin_currunt_value = [comfyd_active_checkbox, fast_comfyd_checkbox, dynamic_vram_checkbox, disable_smart_memory_checkbox, cache_clear_on_finish_checkbox, reserved_vram, cache_ram_enable, ram_pressure, vlm_checkbox, vlm_version, advanced_logs, wavespeed_strength, translation_methods, no_welcome_checkbox, missing_model_filter_checkbox]
    #logger.info(f'admin_currunt_value: {admin_currunt_value}')

    headers = getattr(request, "headers", {}) or {}
    user_agent = headers.get("user-agent", "") if hasattr(headers, "get") else ""
    request_host = headers.get("host", "") if hasattr(headers, "get") else ""
    request_cookie = headers.get("cookie", "") if hasattr(headers, "get") else ""
    client = getattr(request, "client", None)
    client_host = ""
    client_port = ""
    if isinstance(client, dict):
        client_host = str(client.get("host", "") or "")
        client_port = str(client.get("port", "") or "")
    elif isinstance(client, (tuple, list)) and len(client) >= 2:
        client_host = str(client[0])
        client_port = str(client[1])
    else:
        client_host = str(getattr(client, "host", "") or "")
        client_port = str(getattr(client, "port", "") or "")
    ua_hash = hashlib.sha256(user_agent.encode('utf-8')).hexdigest()
    ua_session = gen_ua_session(client_host, client_port, user_agent)
    state_params.update({"ua_hash": ua_hash})
    state_params.update({"ua_session": ua_session})
    state_params.update({"__identity_session_seq": int(state_params.get("__identity_session_seq", 0) or 0)})
    if "__session" not in state_params.keys():
        sstoken = shared.token.get_guest_sstoken(ua_hash)
        state_params.update({"sstoken": sstoken})
        user_did = shared.token.get_guest_did()
        user_session = sstoken
        state_params.update({"__session": user_session})
        logger.info(f'New request/新请求(无身份): {client_host}:{client_port} --> {request_host}, session({user_session})')
    else:
        #logger.info(f'aitoken: {state_params["__session"]}, guest={shared.token.get_guest_did()}')
        user_session = state_params["__session"]
        user_did = shared.token.check_sstoken_and_get_did(user_session, ua_hash)
        if user_did == "Unknown":
            sstoken = shared.token.get_guest_sstoken(ua_hash)
            state_params.update({"sstoken": sstoken})
            user_did = shared.token.get_guest_did()
            user_session = sstoken
            state_params.update({"__session": user_session})
            state_params["__identity_session_seq"] += 1
            logger.debug(f'user-agent:{user_agent}, cookie:{request_cookie}')
            logger.info(f'Reset request/重置请求(无效身份): {client_host}:{client_port} --> {request_host}, session({user_session})')
            user = shared.token.get_user_context(user_did)
        else:
            user = shared.token.get_user_context(user_did)
            state_params.update({"sstoken": ""})
            if user.get_nickname().startswith('guest_'):
                logger.info(f'Reset request/游客请求: {client_host}:{client_port} --> {request_host}, session({user_session})')
            else:
                logger.info(f'Binded request/含身份请求: {client_host}:{client_port} --> {request_host}, session({user_session})')
    shared.token.log_register(state_params["__session"])
    state_params.update({"user": shared.token.get_user_context(user_did)})
    state_params.update({"sys_did":  shared.token.get_sys_did()})
    state_params.update({"local_access":  True if client_host == shared.args.listen or shared.args.listen=='127.0.0.1' or client_host=='127.0.0.1' else False})

    if "__lang" not in state_params.keys():
        state_params.update({"__lang": ads.get_user_default("__lang", state_params, args_manager.args.language)})
    if "__theme" not in state_params.keys():
        state_params.update({"__theme": ads.get_user_default("__theme", state_params, args_manager.args.theme)})
    initial_preset = get_initial_nav_preset(state_params)
    if "__preset" not in state_params.keys():
        state_params.update({"__preset": initial_preset})
    workspace_reconnect_pending = bool(state_params.pop("__workspace_reconnect_pending", False))
    workspace_reconnect_owner = state_params.pop("__workspace_reconnect_owner", "")
    workspace_reconnect_requested_at = state_params.pop("__workspace_reconnect_requested_at", 0)
    if workspace_reconnect_pending:
        logger.info(
            "[UI-TRACE] workspace_recovery.bootstrap | owner=%s, preset=%r, scene_theme=%r, requested_at=%s",
            workspace_reconnect_owner,
            state_params.get("__preset"),
            state_params.get("__scene_theme") or state_params.get("scene_theme"),
            workspace_reconnect_requested_at,
        )
    # The browser can keep the state object across a reload. Refresh the
    # device classification from the current request so a session opened on
    # desktop does not keep desktop layout values when it is later opened on
    # a phone (and vice versa).
    detected_mobile = is_mobile_user_agent(user_agent)
    state_params.update({"__is_mobile": detected_mobile})
    _update_request_web_state(state_params, request)
    # Keep gallery paging identical across devices; only rendering cadence is
    # device-specific for performance.
    state_params.update({"__max_per_page": 18})
    if "__max_catalog" not in state_params.keys():
        state_params.update({"__max_catalog": config.default_image_catalog_max_number })
    state_params.update({"infobox_state": 0})
    state_params.update({"note_box_state": ['',0,0]})
    state_params.update({"array_wildcards_mode": '_'})
    state_params.update({"wildcard_in_wildcards": 'root'})
    state_params.update({"bar_button": state_params.get("__preset", initial_preset)})
    state_params.update({"preset_store": False})
    state_params.update({"__preset_store_seq": state_params.get("__preset_store_seq", 0)})
    state_params.update({"__preset_store_mounted": False})
    state_params.update({"__layout_initialized": False})
    initial_user_did = _state_user_did(state_params)
    resolved_initial_preset = _resolve_preset_storage_name(state_params.get("__preset", initial_preset), initial_user_did)
    initial_config_preset = config.try_get_preset_content(resolved_initial_preset, initial_user_did)
    initial_preset_prepared = meta_parser.parse_meta_from_preset(initial_config_preset)
    initial_engine = initial_preset_prepared.get('engine', {}).get('backend_engine', 'Z-image')
    initial_engine_type = initial_preset_prepared.get('engine', {}).get('engine_type', 'image')
    state_params.update({"engine": initial_engine})
    state_params.update({"engine_type": initial_engine_type})
    state_params.update({"__gallery_engine_type": initial_engine_type})
    initial_task_method = initial_preset_prepared.get('engine', {}).get(
        'backend_params',
        modules.flags.get_engine_default_backend_params(initial_engine)
    ).get('task_method', 'text2image')
    if isinstance(initial_task_method, str) and initial_engine == 'Fooocus':
        initial_task_method = 'text2image'
    initial_scene_frontend = initial_preset_prepared.get('engine', {}).get('scene_frontend', None)
    if initial_scene_frontend:
        state_params["scene_frontend"] = initial_scene_frontend
        initial_scene_theme_preference = _preferred_scene_theme_for_preset(
            state_params,
            state_params.get("__preset"),
        )
        initial_scene_theme = _resolve_scene_theme(initial_scene_frontend, initial_scene_theme_preference)
        if initial_scene_theme:
            state_params["scene_theme"] = initial_scene_theme
            state_params["__scene_theme_preset"] = state_params.get("__preset", initial_preset)
            state_params["__scene_theme_revision"] = 1
        initial_task_method = initial_scene_frontend.get('task_method', '')
        if isinstance(initial_task_method, list):
            initial_task_method = initial_task_method[0] if initial_task_method else ''
        elif isinstance(initial_task_method, dict):
            if initial_scene_theme and initial_scene_theme in initial_task_method:
                initial_task_method = initial_task_method[initial_scene_theme]
            else:
                initial_task_method = initial_task_method[next(iter(initial_task_method))] if initial_task_method else ''
    elif "scene_frontend" in state_params:
        del state_params["scene_frontend"]
        state_params.pop("scene_theme", None)
    state_params.update({"task_method": initial_task_method})
    state_params['__preset_prepared'] = initial_preset_prepared
    state_params['__preset_supported_tasks'] = config.resolve_preset_supported_tasks(initial_config_preset, initial_preset)
    state_params['__preset_interaction_requirements'] = config.resolve_preset_interaction_requirements(initial_config_preset, initial_preset)
    state_params['__preset_model_list_raw'] = initial_config_preset.get('model_list', []) if isinstance(initial_config_preset, dict) else []
    state_params['__preset_resource_bundles_raw'] = initial_config_preset.get('resource_bundles', []) if isinstance(initial_config_preset, dict) else []
    state_params['__preset_previous_default_model_info'] = {
        'default_model': initial_config_preset.get('default_model', '') if isinstance(initial_config_preset, dict) else '',
        'previous_default_models': initial_config_preset.get('previous_default_models', []) if isinstance(initial_config_preset, dict) else [],
        'default_refiner': initial_config_preset.get('default_refiner', '') if isinstance(initial_config_preset, dict) else '',
        'previous_default_refiners': initial_config_preset.get('previous_default_refiners', []) if isinstance(initial_config_preset, dict) else [],
    }
    state_params['__preset_output_format'] = initial_config_preset.get('default_output_format', None) if isinstance(initial_config_preset, dict) else None
    state_params['__preset_output_format_loaded'] = True
    results = [gr.update(value=get_welcome_image(state_params["__preset"],state_params["__is_mobile"],no_welcome=ads.get_admin_default("no_welcome_checkbox"),state_params=state_params))]
    results += [gr.update(value=modules.flags.language_radio(state_params["__lang"])), gr.update(value=state_params["__theme"])]
    preset = state_params.get("__preset", initial_preset)
    preset_url = get_preset_inc_url(preset, state_params.get("__lang"))
    state_params.update({"__preset_url":preset_url})
    results += [gr.update(visible=has_preset_inc_url(preset_url))]
    results += get_all_user_default(state_params)
    results += get_all_admin_default(admin_currunt_value)

    return results

def _preset_inc_language_candidates(lang=None):
    lang = normalize_ui_lang(lang)
    if lang == 'en':
        return ['en']
    return ['cn', 'zh']


def _preset_inc_file_url(file_path):
    resolved_path = os.path.abspath(file_path)
    root_path = os.path.abspath(os.getcwd())
    if resolved_path.startswith(root_path):
        web_path = os.path.relpath(resolved_path, root_path).replace('\\', '/')
    else:
        web_path = resolved_path.replace('\\', '/')
    try:
        mtime = os.path.getmtime(resolved_path)
    except OSError:
        mtime = int(time.time())
    return f'{API_PREFIX}/file={web_path}?{mtime}'


def get_preset_inc_url(preset_name='blank', lang=None):
    preset_name = _strip_preset_marker(str(preset_name or 'blank')).strip()
    html_dir = os.path.abspath('./presets/html')
    candidate_paths = []
    for lang_suffix in _preset_inc_language_candidates(lang):
        candidate_paths.append(os.path.join(html_dir, f'{preset_name}.{lang_suffix}.inc.html'))
        candidate_paths.append(os.path.join(html_dir, f'{preset_name}.inc.{lang_suffix}.html'))
    candidate_paths.append(os.path.join(html_dir, f'{preset_name}.inc.html'))
    blank_inc_path = os.path.abspath(f'./presets/html/blank.inc.html')
    for preset_inc_path in candidate_paths:
        if os.path.exists(preset_inc_path):
            return _preset_inc_file_url(preset_inc_path)
    return _preset_inc_file_url(blank_inc_path)


def has_preset_inc_url(preset_url):
    try:
        return os.path.basename(str(preset_url).split('?', 1)[0].replace('\\', '/')) != 'blank.inc.html'
    except Exception:
        return False

def _get_effective_nav_preset_list(state_params):
    user_session = state_params.get("__session", "")
    ua_hash = state_params.get("ua_hash", "")
    user_did = _state_user_did(state_params)
    is_guest = shared.token.is_guest(user_did) if user_did else True
    raw_nav_name_list = get_preset_name_list(user_session, ua_hash)
    preset_name_list = _coerce_nav_preset_list(
        str(raw_nav_name_list or "").split(','),
        user_did=user_did,
        fallback_preset=state_params.get("__preset"),
    )

    if not preset_name_list:
        preset_name_list = _build_default_nav_preset_list(user_did if not is_guest else None, state_params.get("__preset"))

    nav_name_list = ','.join(_canonicalize_nav_preset_names(preset_name_list))
    if nav_name_list != ','.join(_canonicalize_nav_preset_names(str(raw_nav_name_list or "").split(','))):
        _persist_nav_preset_value(state_params.get("__session", ""), state_params.get("ua_hash", ""), nav_name_list)

    return _canonicalize_nav_preset_names(preset_name_list)

def refresh_nav_bars(state_params):
    preset_name_list = _get_effective_nav_preset_list(state_params)
    user_did = _state_user_did(state_params)
    is_guest = shared.token.is_guest(user_did) if user_did else True

    for i in range(shared.BUTTON_NUM - len(preset_name_list)):
        preset_name_list.append('')
    # PresetStore is available on every device; mobile only changes sizing
    # and preview cadence, not the navigation feature set.
    results = [gr.update(visible=True)]
    missing_count = 0
    total_count = 0
    for i in range(len(preset_name_list)):
        name = preset_name_list[i]
        name = _append_status_marker(name, user_did)
        if isinstance(name, str) and name:
            total_count += 1
            if name.endswith(PRESET_MISSING_MARKER):
                missing_count += 1
        visible_flag = i < shared.BUTTON_NUM
        if name:
            results += [gr.update(value=name, interactive=True, visible=visible_flag)]
        else: 
            results += [gr.update(value='', interactive=False, visible=False)]
    if util.simpai_ui_trace_enabled():
        try:
            logger.info(
                f"[UI-TRACE] refresh_nav_bars.missing_marker_count | "
                f"user_did={user_did}, disable_backend={getattr(shared.args, 'disable_backend', False)}, "
                f"missing={missing_count}, total={total_count}"
            )
        except Exception:
            pass
    return results

def _read_preset_content_silent(preset_name, user_did=None):
    resolved_name = _resolve_preset_storage_name(preset_name, user_did)
    arch_str = config.get_gpu_arch_str_in_preset_name()
    path_preset = os.path.abspath('./presets/')
    user_path_preset = get_path_in_user_dir('presets', user_did) if user_did else get_path_in_user_dir('presets')

    if resolved_name.endswith('.'):
        preset_path = os.path.join(user_path_preset, f'{resolved_name[:-1]}.json')
        preset_path2 = os.path.join(user_path_preset, f'{resolved_name[:-1]}{arch_str}.json')
    else:
        preset_path = os.path.join(path_preset, f'{resolved_name}.json')
        preset_path2 = os.path.join(path_preset, f'{resolved_name}{arch_str}.json')
    if os.path.exists(preset_path2):
        preset_path = preset_path2
    if not os.path.exists(preset_path):
        return {}
    try:
        with open(preset_path, "r", encoding="utf-8") as json_file:
            preset_content = json.load(json_file)
            if isinstance(preset_content, dict):
                preset_content["supported_tasks"] = config.resolve_preset_supported_tasks(preset_content, resolved_name)
                preset_content["interaction_requirements"] = config.resolve_preset_interaction_requirements(preset_content, resolved_name)
            return preset_content
    except Exception:
        return {}

def _canvas_scene_value(scene_frontend, key, theme=None, default=None):
    if not isinstance(scene_frontend, dict):
        return default
    value = scene_frontend.get(key, default)
    if isinstance(value, dict):
        if theme is not None and theme in value:
            return value.get(theme)
        if value:
            return next(iter(value.values()))
        return default
    return value


def _canvas_scene_generation_step(scene_frontend, theme=None, default=None):
    for key in ("overwrite_step", "steps", "scene_steps"):
        value = _canvas_scene_value(scene_frontend, key, theme, None)
        if value is None:
            continue
        try:
            return int(float(value))
        except Exception:
            continue
    return default


def _canvas_scene_generation_step_bound(scene_frontend, theme=None, suffix="min", default=None):
    for key in (f"overwrite_step_{suffix}", f"steps_{suffix}", f"scene_steps_{suffix}"):
        value = _canvas_scene_value(scene_frontend, key, theme, None)
        if value is None:
            continue
        try:
            return int(float(value))
        except Exception:
            continue
    return default


def _scene_list_value(value):
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def _scene_standard_steps_readonly(scene_frontend):
    if not isinstance(scene_frontend, dict):
        return False
    disvisible = set(_scene_list_value(scene_frontend.get("disvisible", [])))
    disinteractive = set(_scene_list_value(scene_frontend.get("disinteractive", [])))
    return (
        "scene_steps" in disvisible
        or "scene_steps" in disinteractive
        or "overwrite_step" in disinteractive
    )


def _canvas_scene_generation_step_props(scene_frontend, theme=None):
    props = {
        "min": _canvas_scene_generation_step_bound(scene_frontend, theme, "min", -1),
        "max": _canvas_scene_generation_step_bound(scene_frontend, theme, "max", 200),
        "step": _canvas_scene_generation_step_bound(scene_frontend, theme, "step", 1),
    }
    if _scene_standard_steps_readonly(scene_frontend):
        props["interactive"] = False
        step_value = _canvas_scene_generation_step(scene_frontend, theme, None)
        if step_value is not None:
            props["value"] = step_value
    return props


def _scene_bool_value(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on", "enabled")
    return bool(value)


def _resolve_scene_canvas_mask_disabled(scene_frontend, theme=None):
    value = _canvas_scene_value(scene_frontend, "disable_canvas_mask", theme, None)
    if value is None:
        value = _canvas_scene_value(scene_frontend, "disable_scene_canvas_mask", theme, False)
    return _scene_bool_value(value)


def _canvas_scene_themes(scene_frontend):
    if not isinstance(scene_frontend, dict):
        return []
    raw = scene_frontend.get("theme", [])
    if isinstance(raw, list):
        themes = [str(x) for x in raw if str(x).strip()]
    elif isinstance(raw, dict):
        themes = [str(x) for x in raw.keys() if str(x).strip()]
    elif isinstance(raw, str) and raw.strip():
        themes = [raw.strip()]
    else:
        themes = []
    task_method = scene_frontend.get("task_method", {})
    if not themes and isinstance(task_method, dict):
        themes = [str(x) for x in task_method.keys() if str(x).strip()]
    return themes


def get_scene_theme_choices():
    """Return every built-in scene theme accepted by the legacy Gradio Radio."""
    choices = []
    seen = set()

    def _append(values):
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, (list, tuple, set)):
            return
        for value in values:
            text = str(value or "").strip()
            if text and text not in seen:
                seen.add(text)
                choices.append(text)

    _append(getattr(modules.flags, "scene_themes", []))
    preset_root = os.path.abspath("./presets")
    try:
        preset_files = [
            path for path in util.get_files_from_folder(preset_root, [".json"], None)
            if is_preset_file_allowed(path)
        ]
    except Exception:
        preset_files = []

    for relative_path in preset_files:
        try:
            with open(os.path.join(preset_root, relative_path), "r", encoding="utf-8") as preset_file:
                preset_content = json.load(preset_file)
            default_engine = preset_content.get("default_engine", {})
            scene_frontend = default_engine.get("scene_frontend", {}) if isinstance(default_engine, dict) else {}
            _append(_canvas_scene_themes(scene_frontend))
        except Exception:
            continue

    return choices or ["Scene Theme / 场景主题"]


def _scene_disvisible_with_optional_inputs(scene_frontend):
    if not isinstance(scene_frontend, dict):
        return []

    hidden = []

    def _extend_hidden(values):
        if isinstance(values, str):
            values = [item.strip() for item in values.split(",") if item.strip()]
        if not isinstance(values, (list, tuple, set)):
            return
        for item in values:
            text = str(item).strip()
            if text and text not in hidden:
                hidden.append(text)

    try:
        _extend_hidden(meta_parser.scene_disvisible_with_optional_inputs(scene_frontend))
    except Exception:
        pass
    _extend_hidden(scene_frontend.get("disvisible", []))

    enabled = scene_frontend.get("divisible", [])
    enabled = set(str(item) for item in enabled) if isinstance(enabled, list) else set()
    optional_slots = getattr(meta_parser, "SCENE_OPTIONAL_INPUT_IMAGE_SLOTS", ("scene_input_image3", "scene_input_image4"))
    for slot in optional_slots:
        if slot not in hidden and slot not in enabled:
            hidden.append(slot)
    optional_video_slots = getattr(meta_parser, "SCENE_OPTIONAL_VIDEO_SLOTS", ("scene_reference_video",))
    for slot in optional_video_slots:
        if slot not in hidden and slot not in enabled:
            hidden.append(slot)
    optional_audio_slots = getattr(meta_parser, "SCENE_OPTIONAL_AUDIO_SLOTS", ("scene_audio2", "scene_audio3"))
    for slot in optional_audio_slots:
        if slot not in hidden and slot not in enabled:
            hidden.append(slot)
    if "scene_video_duration" not in hidden and "scene_video_duration" not in enabled and "video_duration" not in scene_frontend:
        hidden.append("scene_video_duration")
    return hidden


def _canvas_param_schema(scene_frontend, key, title_key=None, default_key=None, param_type="number", theme=None):
    disvisible = _scene_disvisible_with_optional_inputs(scene_frontend)
    disinteractive = scene_frontend.get("disinteractive", []) if isinstance(scene_frontend, dict) else []
    if not isinstance(disinteractive, list):
        disinteractive = []
    if key in disvisible:
        return None
    base = key[6:] if key.startswith("scene_") else key
    resolved_title_key = title_key or f"{base}_title"
    title = _canvas_scene_value(scene_frontend, resolved_title_key, theme, key)
    default = _canvas_scene_value(scene_frontend, default_key or base, theme, None)
    item = {
        "key": key,
        "label": str(title or key),
        "type": param_type,
        "default": default,
        "visible": True,
        "interactive": key not in disinteractive,
    }
    min_value = _canvas_scene_value(scene_frontend, f"{base}_min", theme, None)
    max_value = _canvas_scene_value(scene_frontend, f"{base}_max", theme, None)
    step_value = _canvas_scene_value(scene_frontend, f"{base}_step", theme, None)
    if min_value is not None:
        item["min"] = min_value
    if max_value is not None:
        item["max"] = max_value
    if step_value is not None:
        item["step"] = step_value
    return item


def _build_canvas_scene_schema(scene_frontend):
    if not isinstance(scene_frontend, dict):
        return {}
    themes = _canvas_scene_themes(scene_frontend)
    default_theme = themes[0] if themes else ""
    disvisible = _scene_disvisible_with_optional_inputs(scene_frontend)
    disinteractive = scene_frontend.get("disinteractive", [])
    if not isinstance(disinteractive, list):
        disinteractive = []
    divisible = scene_frontend.get("divisible", None)
    if not isinstance(divisible, list):
        divisible = None
    elif not divisible:
        divisible = None
    sam3_inputs_visible = any(
        meta_parser.scene_sam3_inputs_enabled(scene_frontend, theme)
        for theme in (themes or [default_theme])
    )

    slot_defs = [
        ("scene_video", "Scene Video"),
        ("scene_reference_video", "Reference Video"),
        ("scene_reference_video2", "Additional Reference Video"),
        ("sam3_input_video", "SAM3 Input Video"),
        ("sam3_mask_video", "SAM3 Mask Video"),
        ("scene_audio", "Scene Audio"),
        ("scene_audio2", "Scene Audio 2"),
        ("scene_audio3", "Scene Audio 3"),
        ("scene_canvas_image", "Canvas Image"),
        ("scene_input_image1", "Input Image"),
        ("scene_input_image2", "Input Image"),
        ("scene_input_image3", "Input Image"),
        ("scene_input_image4", "Input Image"),
        ("scene_input_image5", "Input Image"),
        ("scene_input_image6", "Input Image"),
        ("scene_input_image7", "Input Image"),
        ("scene_input_image8", "Input Image"),
    ]
    def _slot_visible(key):
        if key in disvisible:
            return False
        if key in ("sam3_input_video", "sam3_mask_video"):
            return sam3_inputs_visible
        return True

    upload_slots = [
        {"key": key, "label": label, "visible": _slot_visible(key), "interactive": key not in disinteractive}
        for key, label in slot_defs
    ]

    params = []
    if "scene_additional_prompt" not in disvisible:
        params.append({
            "key": "scene_additional_prompt",
            "label": str(_canvas_scene_value(scene_frontend, "additional_prompt_title", default_theme, "Prompt")),
            "type": "textarea",
            "default": _canvas_scene_value(scene_frontend, "additional_prompt", default_theme, ""),
            "visible": True,
            "interactive": "scene_additional_prompt" not in disinteractive,
        })
    if "scene_additional_prompt_2" not in disvisible:
        params.append({
            "key": "scene_additional_prompt_2",
            "label": str(_canvas_scene_value(scene_frontend, "additional_prompt_2_title", default_theme, "Prompt 2")),
            "type": "textarea",
            "default": _canvas_scene_value(scene_frontend, "additional_prompt_2", default_theme, ""),
            "visible": True,
            "interactive": "scene_additional_prompt_2" not in disinteractive,
        })

    if (
        "video_duration" in scene_frontend
        or "video_duration_min" in scene_frontend
        or "video_duration_max" in scene_frontend
    ):
        item = _canvas_param_schema(scene_frontend, "scene_video_duration", "video_duration_title", "video_duration", "number", default_theme)
        if item:
            params.append(item)

    for index in range(1, 11):
        suffix = "" if index == 1 else str(index)
        key = f"scene_var_number{suffix}"
        base = f"var_number{suffix}"
        if base not in scene_frontend and f"{base}_min" not in scene_frontend and f"{base}_max" not in scene_frontend:
            continue
        item = _canvas_param_schema(scene_frontend, key, f"{base}_title", base, "number", default_theme)
        if item:
            params.append(item)

    for index in range(1, 5):
        key = f"scene_switch_option{index}"
        base = f"switch_option{index}"
        if base not in scene_frontend:
            continue
        item = _canvas_param_schema(scene_frontend, key, f"{base}_title", base, "checkbox", default_theme)
        if item:
            params.append(item)

    if "scene_aspect_ratio" not in disvisible and isinstance(scene_frontend.get("aspect_ratio"), list):
        aspect_choices = scene_frontend.get("aspect_ratio", [])
        params.append({
            "key": "scene_aspect_ratio",
            "label": "Aspect Ratio",
            "type": "choice",
            "choices": aspect_choices,
            "default": aspect_choices[0] if aspect_choices else "",
            "visible": True,
            "interactive": "scene_aspect_ratio" not in disinteractive,
        })

    per_theme = {}
    theme_supported_tasks = scene_frontend.get("theme_supported_tasks") if isinstance(scene_frontend.get("theme_supported_tasks"), dict) else {}
    for theme in themes or [""]:
        defaults = {}
        for item in params:
            key = item.get("key")
            if not key:
                continue
            base = key[6:] if key.startswith("scene_") else key
            resolved = _canvas_scene_value(scene_frontend, base, theme, item.get("default"))
            if item.get("type") == "choice" and isinstance(resolved, list):
                resolved = item.get("default")
            defaults[key] = resolved
        scene_step_default = _canvas_scene_generation_step(scene_frontend, theme, None)
        if scene_step_default is not None:
            defaults.setdefault("overwrite_step", scene_step_default)
            defaults.setdefault("scene_steps", scene_step_default)
        if "image_number" in scene_frontend:
            defaults.setdefault("scene_image_number", _canvas_scene_value(scene_frontend, "image_number", theme, 1))
        if "prompt" in scene_frontend:
            defaults.setdefault("prompt", _canvas_scene_value(scene_frontend, "prompt", theme, ""))
        if isinstance(scene_frontend.get("aspect_ratio"), list) and scene_frontend.get("aspect_ratio"):
            defaults.setdefault("scene_aspect_ratio", scene_frontend.get("aspect_ratio")[0])
        per_theme[theme] = {
            "task_method": _canvas_scene_value(scene_frontend, "task_method", theme, ""),
            "prompt_compiler": copy.deepcopy(_canvas_scene_value(scene_frontend, "prompt_compiler", theme, "")),
            "supported_tasks": [
                str(task or "").strip().lower().replace("-", "_").replace(" ", "_")
                for task in (theme_supported_tasks.get(theme) if isinstance(theme_supported_tasks.get(theme), list) else [])
                if str(task or "").strip()
            ],
            "defaults": defaults,
            "generation_config_props": {
                "overwrite_step": _canvas_scene_generation_step_props(scene_frontend, theme),
            },
        }

    return {
        "version": scene_frontend.get("version", ""),
        "themes": themes,
        "default_theme": default_theme,
        "theme_labels": copy.deepcopy(scene_frontend.get("theme_labels") or {}),
        "theme_title": scene_frontend.get("theme_title", "Theme"),
        "prompt_compiler": copy.deepcopy(_canvas_scene_value(scene_frontend, "prompt_compiler", default_theme, "")),
        "director_capability": copy.deepcopy(scene_frontend.get("director_capability") or {}),
        "disvisible": disvisible,
        "disinteractive": disinteractive,
        "divisible": divisible or [],
        "image_preprocessor_method": scene_frontend.get("image_preprocessor_method", []),
        "disable_canvas_mask": _resolve_scene_canvas_mask_disabled(scene_frontend, default_theme),
        "upload_slots": upload_slots,
        "params": params,
        "per_theme": per_theme,
    }


def _build_canvas_media_capability(
    schema,
    engine_type="image",
    preset_name="",
    task_method="",
    backend_engine="",
    explicit_supported_tasks=None,
    explicit_interaction_requirements=None,
):
    schema = schema if isinstance(schema, dict) else {}
    ordered_image_slots = (
        "scene_canvas_image",
        "scene_input_image1",
        "scene_input_image2",
        "scene_input_image3",
        "scene_input_image4",
        "scene_input_image5",
        "scene_input_image6",
        "scene_input_image7",
        "scene_input_image8",
    )
    ordered_video_slots = ("scene_video", "scene_reference_video", "scene_reference_video2")
    ordered_audio_slots = ("scene_audio", "scene_audio2", "scene_audio3")
    upload_slots = schema.get("upload_slots") if isinstance(schema.get("upload_slots"), list) else []
    visible = {
        str(item.get("key") or ""): item.get("visible") is not False
        for item in upload_slots
        if isinstance(item, dict)
    }
    image_slots = [slot for slot in ordered_image_slots if visible.get(slot, False)]
    video_slots = [slot for slot in ordered_video_slots if visible.get(slot, False)]
    audio_slots = [slot for slot in ordered_audio_slots if visible.get(slot, False)]
    director = schema.get("director_capability") if isinstance(schema.get("director_capability"), dict) else {}
    try:
        declared_max = int(director.get("max_images")) if director.get("max_images") is not None else len(image_slots)
    except Exception:
        declared_max = len(image_slots)
    try:
        declared_min = int(director.get("min_images")) if director.get("min_images") is not None else 0
    except Exception:
        declared_min = 0
    max_images = max(0, min(len(image_slots), declared_max))
    min_images = max(0, min(max_images, declared_min))
    typed_limits = {}
    for media_type, slots in (("video", video_slots), ("audio", audio_slots)):
        try:
            declared_typed_max = int(director.get(f"max_{media_type}s")) if director.get(f"max_{media_type}s") is not None else len(slots)
        except Exception:
            declared_typed_max = len(slots)
        policy = str(director.get(f"{media_type}_policy") or "").strip().lower()
        try:
            declared_typed_min = int(director.get(f"min_{media_type}s")) if director.get(f"min_{media_type}s") is not None else (1 if policy == "required" else 0)
        except Exception:
            declared_typed_min = 1 if policy == "required" else 0
        maximum = max(0, min(len(slots), declared_typed_max))
        typed_limits[media_type] = {
            "slots": slots[:maximum],
            "max": maximum,
            "min": max(0, min(maximum, declared_typed_min)),
        }
    task_aliases = {
        "t2i": "text_to_image",
        "text2image": "text_to_image",
        "text_to_image": "text_to_image",
        "edit": "image_edit",
        "image_edit": "image_edit",
        "image_to_image": "image_edit",
        "multi_edit": "multi_image_edit",
        "multi_image_edit": "multi_image_edit",
        "t2v": "text_to_video",
        "i2v": "image_to_video",
        "v2v": "video_edit",
        "a2v": "audio_to_video",
        "v2a": "video_to_audio",
    }
    raw_supported_tasks = explicit_supported_tasks
    if not isinstance(raw_supported_tasks, (list, tuple)):
        raw_supported_tasks = director.get("supported_tasks") or schema.get("supported_tasks")
    supported_tasks = []
    for raw_task in raw_supported_tasks if isinstance(raw_supported_tasks, (list, tuple)) else []:
        task_key = str(raw_task or "").strip().lower().replace("-", "_").replace(" ", "_")
        normalized_task = task_aliases.get(task_key, task_key)
        valid_task = normalized_task[:1].isalpha() and all(char.isalnum() or char == "_" for char in normalized_task)
        if valid_task and normalized_task not in supported_tasks:
            supported_tasks.append(normalized_task)

    output_type = "video" if str(engine_type or "").strip().lower() == "video" else "image"
    if not supported_tasks:
        descriptor = " ".join(
            str(value or "").strip().lower()
            for value in (
                preset_name,
                task_method,
                backend_engine,
                schema.get("theme_title"),
            )
        )
        edit_markers = (
            "image edit",
            "image-edit",
            "image_edit",
            "imageediting",
            "editing",
            "qwenedit",
            "qwen_edit",
            "kleinedit",
            "klein_edit",
            "flux2_9b_edit",
            "kontext",
            "inpaint",
            "outpaint",
            "retouch",
            "imagerepair",
            "image repair",
            "pose editor",
            "a2r",
        )
        if output_type == "video":
            supported_tasks = ["video_edit"]
        elif max_images > 0 and any(marker in descriptor for marker in edit_markers):
            supported_tasks = ["image_edit"]
            if max_images > 1:
                supported_tasks.append("multi_image_edit")
        else:
            supported_tasks = ["text_to_image"]

    supported_tasks = [
        task for task in supported_tasks
        if task not in {"image_edit", "multi_image_edit"}
        or (task == "image_edit" and max_images >= 1)
        or (task == "multi_image_edit" and max_images >= 2)
    ]
    task_modes = {}
    if output_type == "image" and "image_detail_enhance" in supported_tasks and not schema and not image_slots:
        image_slots = ["enhance_image"]
        min_images = 0
        max_images = 1
        task_modes["image_detail_enhance"] = "enhance"
    interaction_requirements = []
    for raw_requirement in explicit_interaction_requirements if isinstance(explicit_interaction_requirements, (list, tuple)) else []:
        requirement = str(raw_requirement or "").strip().lower().replace("-", "_").replace(" ", "_")
        valid_requirement = requirement[:1].isalpha() and all(char.isalnum() or char == "_" for char in requirement)
        if valid_requirement and requirement not in interaction_requirements:
            interaction_requirements.append(requirement)
    capability = {
        "output_type": output_type,
        "image_slots": image_slots[:max_images],
        "min_images": min_images,
        "max_images": max_images,
        "video_slots": typed_limits["video"]["slots"],
        "min_videos": typed_limits["video"]["min"],
        "max_videos": typed_limits["video"]["max"],
        "audio_slots": typed_limits["audio"]["slots"],
        "min_audios": typed_limits["audio"]["min"],
        "max_audios": typed_limits["audio"]["max"],
        "supported_tasks": supported_tasks,
    }
    if task_modes:
        capability["task_modes"] = task_modes
    if interaction_requirements:
        capability["interaction_requirements"] = interaction_requirements
    return capability


def _build_canvas_lora_defaults(preset_content, backend_params=None):
    backend_params = backend_params if isinstance(backend_params, dict) else {}
    raw_loras = []
    if isinstance(preset_content, dict):
        raw_loras = preset_content.get("default_loras") or preset_content.get("loras") or []
    if not raw_loras:
        raw_loras = backend_params.get("default_loras") or backend_params.get("loras") or []
    if not isinstance(raw_loras, list):
        raw_loras = []

    loras = []
    for raw in raw_loras[:10]:
        enabled = True
        model = "None"
        weight = 1.0
        if isinstance(raw, dict):
            enabled = bool(raw.get("enabled", raw.get("use", True)))
            model = raw.get("model") or raw.get("name") or raw.get("filename") or raw.get("lora") or "None"
            weight = raw.get("weight", raw.get("strength", 1.0))
        elif isinstance(raw, (list, tuple)):
            if len(raw) >= 3 and isinstance(raw[0], bool):
                enabled = bool(raw[0])
                model = raw[1] if len(raw) > 1 else "None"
                weight = raw[2] if len(raw) > 2 else 1.0
            else:
                model = raw[0] if len(raw) > 0 else "None"
                weight = raw[1] if len(raw) > 1 else 1.0
        elif isinstance(raw, str):
            model = raw
        if not isinstance(model, str) or not model:
            model = "None"
        try:
            weight = float(weight)
        except Exception:
            weight = 1.0
        loras.append({
            "enabled": bool(enabled),
            "model": model.replace("\\", "/"),
            "weight": weight,
        })

    while len(loras) < 10:
        loras.append({"enabled": True, "model": "None", "weight": 1.0})
    return loras


def _build_preset_store_meta(state, copy_cached=True):
    user_did = None
    try:
        if isinstance(state, dict) and state.get("user"):
            user_did = state["user"].get_did()
        elif isinstance(state, dict):
            user_did = str(state.get("user_did") or "").strip() or None
    except Exception:
        user_did = None

    try:
        samples = get_preset_samples(user_did)
    except Exception:
        samples = []

    sample_signature = (
        "canvas_preset_meta_media_capability_v9",
        *(
            item[0] if isinstance(item, (list, tuple)) and item else item
            for item in samples
        ),
    )
    cache_key = user_did if user_did else 'guest'
    current_user_mtime = preset_samples_user_mtime.get(cache_key, -1)
    current_base_mtime = preset_samples_base_mtime.get(cache_key, -1)
    if (
        cache_key in preset_store_meta_cache
        and preset_store_meta_user_mtime.get(cache_key, -2) == current_user_mtime
        and preset_store_meta_base_mtime.get(cache_key, -2) == current_base_mtime
        and preset_store_meta_samples_sig.get(cache_key) == sample_signature
    ):
        cached_meta = preset_store_meta_cache[cache_key]
        return copy.deepcopy(cached_meta) if copy_cached else cached_meta

    meta = {}
    for order, item in enumerate(samples):
        raw_name = item[0] if isinstance(item, (list, tuple)) and item else item
        if not isinstance(raw_name, str) or not raw_name.strip():
            continue
        display_name = raw_name.strip()
        preset_name = display_name.replace(PRESET_MISSING_MARKER, "").strip()
        if not preset_name:
            continue

        backend_engine = "Other"
        preset_category = ""
        engine_type = "image"
        is_scene = False
        task_method = ""
        explicit_supported_tasks = None
        explicit_interaction_requirements = None
        schema = {}
        models_config = {}
        resolution_config = {}
        generation_config = {}
        default_styles = []
        default_prompt = ""
        default_prompt_negative = ""
        model_list_raw = []
        resource_bundles_raw = []
        has_model_probe = False
        try:
            preset_content = _read_preset_content_silent(preset_name, user_did)
            model_list_raw = preset_content.get("model_list", []) if isinstance(preset_content, dict) else []
            resource_bundles_raw = preset_content.get("resource_bundles", []) if isinstance(preset_content, dict) else []
            if isinstance(preset_content, dict):
                preset_category = str(preset_content.get("preset_category") or "").strip()
                raw_styles = preset_content.get("default_styles", [])
                if isinstance(raw_styles, list):
                    default_styles = [str(item) for item in raw_styles if str(item).strip()]
                elif isinstance(raw_styles, str) and raw_styles.strip():
                    try:
                        parsed_styles = json.loads(raw_styles.replace("'", '"'))
                    except Exception:
                        parsed_styles = None
                    if isinstance(parsed_styles, list):
                        default_styles = [str(item) for item in parsed_styles if str(item).strip()]
                    else:
                        default_styles = [item.strip().strip("[]'\"") for item in raw_styles.split(",") if item.strip().strip("[]'\"")]
                default_prompt = str(preset_content.get("default_prompt") or preset_content.get("prompt") or "")
                default_prompt_negative = str(preset_content.get("default_prompt_negative") or "")
            has_model_probe = bool(model_list_raw) or bool(resource_bundles_raw) or _has_preset_model_probe(preset_name, user_did)
            default_engine = preset_content.get("default_engine", {}) if isinstance(preset_content, dict) else {}
            if isinstance(default_engine, dict):
                explicit_supported_tasks = (
                    preset_content.get("supported_tasks")
                    or default_engine.get("supported_tasks")
                )
                explicit_interaction_requirements = config.resolve_preset_interaction_requirements(
                    preset_content,
                    preset_name,
                )
                backend_engine = (
                    default_engine.get("backend_engine")
                    or default_engine.get("engine")
                    or backend_engine
                )
                engine_type = default_engine.get("engine_type") or engine_type
                is_scene = isinstance(default_engine.get("scene_frontend"), dict)
                backend_params = default_engine.get("backend_params", {})
                if isinstance(backend_params, dict):
                    task_method = backend_params.get("task_method", "") or ""
                models_config = {
                    "base_model": preset_content.get("base_model") or preset_content.get("Base Model") or preset_content.get("default_model") or "",
                    "refiner_model": preset_content.get("refiner_model") or preset_content.get("Refiner Model") or preset_content.get("default_refiner") or "",
                    "clip_model": preset_content.get("clip_model") or preset_content.get("default_clip_model") or (backend_params.get("clip_model", "") if isinstance(backend_params, dict) else ""),
                    "vae": preset_content.get("vae") or preset_content.get("VAE") or preset_content.get("default_vae") or "",
                    "upscale_model": preset_content.get("upscale_model") or preset_content.get("default_upscale_model") or (backend_params.get("upscale_model", "") if isinstance(backend_params, dict) else "") or "default",
                    "loras": _build_canvas_lora_defaults(preset_content, backend_params),
                }
                generation_config = {
                    "guidance_scale": preset_content.get("default_cfg_scale", None),
                    "sharpness": preset_content.get("default_sample_sharpness", None),
                    "sampler_name": preset_content.get("default_sampler", ""),
                    "scheduler_name": preset_content.get("default_scheduler", ""),
                    "performance_selection": preset_content.get("default_performance", ""),
                    "image_number": preset_content.get("default_image_number", None),
                    "output_format": preset_content.get("default_output_format", ""),
                    "refiner_switch": preset_content.get("default_refiner_switch", None),
                    "adaptive_cfg": preset_content.get("default_cfg_tsnr", None),
                    "overwrite_step": preset_content.get("default_overwrite_step", None),
                    "overwrite_switch": preset_content.get("default_overwrite_switch", None),
                    "save_metadata_to_images": preset_content.get("default_save_metadata_to_images", None),
                }
                scene_frontend = default_engine.get("scene_frontend", {})
                if isinstance(scene_frontend, dict):
                    explicit_supported_tasks = scene_frontend.get("supported_tasks") or explicit_supported_tasks
                    schema = _build_canvas_scene_schema(scene_frontend)
                    scene_themes = schema.get("themes", []) if isinstance(schema, dict) else []
                    scene_theme = scene_themes[0] if scene_themes else ""
                    scene_default_steps = _canvas_scene_generation_step(scene_frontend, scene_theme, None)
                    if scene_default_steps is not None:
                        generation_config["overwrite_step"] = scene_default_steps
                    scene_default_image_number = _canvas_scene_value(scene_frontend, "image_number", scene_theme, None)
                    if scene_default_image_number is not None:
                        generation_config["image_number"] = scene_default_image_number
                    if not default_prompt:
                        default_prompt = str(_canvas_scene_value(scene_frontend, "prompt", scene_theme, "") or "")
                    raw_task = scene_frontend.get("task_method", "")
                    if isinstance(raw_task, dict) and raw_task:
                        task_method = next(iter(raw_task.values()), task_method)
                    elif isinstance(raw_task, list) and raw_task:
                        task_method = raw_task[0]
                    elif isinstance(raw_task, str):
                        task_method = raw_task
                resolution_profile = {}
                if isinstance(scene_frontend, dict):
                    resolution_profile = scene_frontend.get("resolution_control", {}) or {}
                if not resolution_profile:
                    resolution_profile = default_engine.get("resolution_control", {}) or {}
                aspect_template = default_engine.get("available_aspect_ratios_selection")
                if not aspect_template:
                    template_engine = modules.flags.get_taskclass_by_fullname(str(backend_engine)) or str(backend_engine or "Fooocus")
                    aspect_template = modules.flags.default_class_params.get(
                        template_engine,
                        modules.flags.default_class_params.get("Fooocus", {}),
                    ).get("available_aspect_ratios_selection", "SDXL")
                if aspect_template not in modules.flags.available_aspect_ratios_list:
                    aspect_template = "SDXL"
                resolution_config = {
                    "template": aspect_template,
                    "available_aspect_ratios_selection": aspect_template,
                    "resolution": preset_content.get("resolution", ""),
                    "resolution_control": resolution_profile if isinstance(resolution_profile, dict) else {},
                    "aspect_ratios": scene_frontend.get("aspect_ratio", []) if isinstance(scene_frontend, dict) else [],
                    "use_resolution_override": preset_content.get("use_resolution_override", False),
                    "default_aspect_ratio": preset_content.get("default_aspect_ratio", ""),
                    "default_overwrite_width": preset_content.get("default_overwrite_width", -1),
                    "default_overwrite_height": preset_content.get("default_overwrite_height", -1),
                    "default_resolution_quantize_step": preset_content.get("default_resolution_quantize_step", modules.flags.default_resolution_quantize_step),
                    "default_resolution_multiplier": preset_content.get("default_resolution_multiplier", modules.flags.default_resolution_multiplier),
                    "default_resolution_edit_mode": preset_content.get("default_resolution_edit_mode", modules.flags.default_resolution_edit_mode),
                }
        except Exception:
            pass

        meta[preset_name] = {
            "backend_engine": str(backend_engine or "Other"),
            "preset_category": str(preset_category or backend_engine or "Other"),
            "engine_type": str(engine_type or "image"),
            "scene": bool(is_scene),
            "task_method": str(task_method or ""),
            "prompt_compiler": copy.deepcopy(schema.get("prompt_compiler") if isinstance(schema, dict) else ""),
            "schema": schema,
            "media_capability": _build_canvas_media_capability(
                schema,
                engine_type,
                preset_name,
                task_method,
                backend_engine,
                explicit_supported_tasks,
                explicit_interaction_requirements,
            ),
            "themes": schema.get("themes", []) if isinstance(schema, dict) else [],
            "models_config": models_config,
            "resolution_config": resolution_config,
            "generation_config": generation_config,
            "default_styles": copy.deepcopy(default_styles),
            "default_prompt": default_prompt,
            "default_prompt_negative": default_prompt_negative,
            "model_list": copy.deepcopy(model_list_raw),
            "resource_bundles": copy.deepcopy(resource_bundles_raw),
            "has_model_probe": bool(has_model_probe),
            "missing": display_name.endswith(PRESET_MISSING_MARKER),
            "order": order,
            "source": "user" if preset_name.endswith('.') else "base",
        }
    preset_store_meta_cache[cache_key] = copy.deepcopy(meta)
    preset_store_meta_user_mtime[cache_key] = current_user_mtime
    preset_store_meta_base_mtime[cache_key] = current_base_mtime
    preset_store_meta_samples_sig[cache_key] = sample_signature
    return meta


def _get_preset_store_meta_revision(state):
    user_did = _state_user_did(state)
    cache_key = user_did if user_did else 'guest'
    signature = (
        str(cache_key),
        preset_store_meta_user_mtime.get(cache_key, -1),
        preset_store_meta_base_mtime.get(cache_key, -1),
        preset_store_meta_samples_sig.get(cache_key, ()),
    )
    serialized = json.dumps(signature, ensure_ascii=True, separators=(',', ':'), default=str)
    return hashlib.sha1(serialized.encode('utf-8')).hexdigest()


def wait_for_vlm_completion(check_interval=0.5):
    try:
        while True:
            processing_status = VLM.get_processing_status()
            is_processing = False
            if isinstance(processing_status, bool):
                is_processing = processing_status

            if not is_processing:
                return None
            time.sleep(check_interval)

    except Exception as e:
        logger.error(f"VLM Error: {str(e)}")
        return None


def _format_scene_prompt_template(value, additional_prompt):
    text = str(value or "")
    if not text:
        return ""
    try:
        return text.format(additional_prompt=additional_prompt)
    except Exception:
        return text


def _refresh_scene_prompt_for_current_theme(prompt, state, scene_theme, additional_prompt, additional_prompt_2):
    if not isinstance(state, dict) or not isinstance(state.get("scene_frontend"), dict):
        return None

    scene_frontend = state["scene_frontend"]
    resolved_theme = _resolve_scene_generation_theme(state, scene_frontend, scene_theme)
    current_template = _scene_value_by_theme(scene_frontend, resolved_theme, "prompt", "")
    combined_additional_prompt = f"{additional_prompt or ''}{additional_prompt_2 or ''}"
    current_prompt = _format_scene_prompt_template(current_template, combined_additional_prompt).strip()
    existing_prompt = str(prompt or "").strip()
    if not current_prompt or not existing_prompt:
        return None

    raw_prompts = scene_frontend.get("prompt", {})
    if isinstance(raw_prompts, dict):
        prompt_values = raw_prompts.values()
    elif isinstance(raw_prompts, str):
        prompt_values = [raw_prompts]
    else:
        prompt_values = []
    known_prompts = {
        _format_scene_prompt_template(value, combined_additional_prompt).strip()
        for value in prompt_values
        if str(value or "").strip()
    }
    if existing_prompt not in known_prompts:
        return None
    return current_prompt


def avoid_empty_prompt_for_scene(prompt, state, canvas_image, input_image1, scene_theme, additional_prompt, additional_prompt_2):
    refreshed_prompt = _refresh_scene_prompt_for_current_theme(
        prompt,
        state,
        scene_theme,
        additional_prompt,
        additional_prompt_2,
    )
    if refreshed_prompt is not None:
        return refreshed_prompt

    describe_prompt = None
    if not prompt and 'scene_frontend' in state:
        visible = _scene_disvisible_with_optional_inputs(state["scene_frontend"])
        canvas_visible = 'scene_canvas_image' not in visible
        canvas_img = meta_parser.extract_scene_image(canvas_image) if canvas_visible else None
        input_img = meta_parser.extract_scene_image(input_image1)
        use_img = canvas_img if canvas_img is not None else input_img
        describe_prompt, img_is_ok = describe_prompt_for_scene(state, use_img, scene_theme, f'{additional_prompt}{additional_prompt_2}')
    return skip_update() if describe_prompt is None else describe_prompt


def _asset_ref(value, depth=0):
    if depth > 5:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or text.startswith("data:"):
            return None
        if text[0] in "{[":
            try:
                parsed = json.loads(text)
            except Exception:
                return text
            return _asset_ref(parsed, depth + 1)
        if len(text) > 8192:
            return None
        return text
    if isinstance(value, dict):
        for key in ("path", "name", "video", "audio", "url"):
            item = value.get(key)
            ref = _asset_ref(item, depth + 1)
            if ref:
                return ref
        for key in ("image", "mask", "file", "data"):
            ref = _asset_ref(value.get(key), depth + 1)
            if ref:
                return ref
    if isinstance(value, (list, tuple)):
        for item in value:
            ref = _asset_ref(item, depth + 1)
            if ref:
                return ref
    return None


def _build_regen_manifest_for_generation(
    state_params,
    backend_params,
    scene_theme,
    scene_canvas_image,
    scene_input_image1,
    scene_input_image2,
    scene_input_image3,
    scene_input_image4,
    scene_input_image5,
    scene_input_image6,
    scene_input_image7,
    scene_input_image8,
    scene_additional_prompt,
    scene_additional_prompt_2,
    scene_var_number,
    scene_var_number2,
    scene_var_number3,
    scene_var_number4,
    scene_var_number5,
    scene_var_number6,
    scene_var_number7,
    scene_var_number8,
    scene_var_number9,
    scene_var_number10,
    scene_steps,
    scene_switch_option1,
    scene_switch_option2,
    scene_switch_option3,
    scene_switch_option4,
    scene_aspect_ratio,
    scene_image_number,
    scene_video,
    scene_reference_video,
    scene_reference_video2,
    scene_audio,
    scene_audio2,
    scene_audio3,
    scene_original_video_path,
    active_video_source,
    sam3_input_video,
    sam3_original_video_path,
    sam3_mask_video,
    scene_video_duration=None,
    overwrite_step=None,
):
    if not isinstance(state_params, dict):
        return None

    user = state_params.get("user")
    user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
    preset_name = state_params.get("__preset", config.preset)
    try:
        resolved_preset = _resolve_preset_storage_name(preset_name, user_did)
        preset_json = config.try_get_preset_content(resolved_preset, user_did)
    except Exception:
        preset_json = {}

    preset_prepared = state_params.get("__preset_prepared", {})
    if not isinstance(preset_prepared, dict):
        preset_prepared = {}

    backend_params_dict = dict(backend_params or {})
    active_task_method = backend_params_dict.get("task_method") or state_params.get("task_method")
    is_scene_generation = isinstance(state_params.get("scene_frontend"), dict) and str(active_task_method or "").startswith("scene_")

    ui_values = {
        "engine": state_params.get("engine"),
        "engine_type": state_params.get("engine_type", "image"),
        "task_method": state_params.get("task_method"),
    }

    if is_scene_generation:
        ui_values.update({
            "scene_theme": scene_theme,
            "scene_additional_prompt": scene_additional_prompt,
            "scene_additional_prompt_2": scene_additional_prompt_2,
            "scene_var_number": scene_var_number,
            "scene_var_number2": scene_var_number2,
            "scene_var_number3": scene_var_number3,
            "scene_var_number4": scene_var_number4,
            "scene_var_number5": scene_var_number5,
            "scene_var_number6": scene_var_number6,
            "scene_var_number7": scene_var_number7,
            "scene_var_number8": scene_var_number8,
            "scene_var_number9": scene_var_number9,
            "scene_var_number10": scene_var_number10,
            "scene_video_duration": scene_video_duration,
            "overwrite_step": overwrite_step,
            "scene_switch_option1": scene_switch_option1,
            "scene_switch_option2": scene_switch_option2,
            "scene_switch_option3": scene_switch_option3,
            "scene_switch_option4": scene_switch_option4,
            "scene_aspect_ratio": scene_aspect_ratio,
            "scene_image_number": scene_image_number,
            "active_video_source": active_video_source,
            "scene_reference_video": scene_reference_video,
            "scene_reference_video2": scene_reference_video2,
        })

    asset_refs = {}
    if is_scene_generation:
        asset_refs = {
            "scene_canvas_image": _asset_ref(scene_canvas_image),
            "scene_input_image1": _asset_ref(scene_input_image1),
            "scene_input_image2": _asset_ref(scene_input_image2),
            "scene_input_image3": _asset_ref(scene_input_image3),
            "scene_input_image4": _asset_ref(scene_input_image4),
            "scene_input_image5": _asset_ref(scene_input_image5),
            "scene_input_image6": _asset_ref(scene_input_image6),
            "scene_input_image7": _asset_ref(scene_input_image7),
            "scene_input_image8": _asset_ref(scene_input_image8),
            "scene_video": _asset_ref(scene_video),
            "scene_reference_video": _asset_ref(scene_reference_video),
            "scene_reference_video2": _asset_ref(scene_reference_video2),
            "scene_audio": _asset_ref(scene_audio),
            "scene_audio2": _asset_ref(scene_audio2),
            "scene_audio3": _asset_ref(scene_audio3),
            "scene_original_video_path": _asset_ref(scene_original_video_path),
            "sam3_input_video": _asset_ref(sam3_input_video),
            "sam3_original_video_path": _asset_ref(sam3_original_video_path),
            "sam3_mask_video": _asset_ref(sam3_mask_video),
        }
    asset_refs = {key: value for key, value in asset_refs.items() if value}

    skipped_backend_keys = {
        "scene_canvas_image",
        "scene_input_image1",
        "scene_input_image2",
        "scene_input_image3",
        "scene_input_image4",
        "scene_input_image5",
        "scene_input_image6",
        "scene_input_image7",
        "scene_input_image8",
        "video",
        "reference_video",
        "reference_video2",
        "audio",
        "audio2",
        "audio3",
        "mask_video",
        regen_manifest.KEY,
    }
    backend_snapshot = {
        key: value
        for key, value in backend_params_dict.items()
        if key not in skipped_backend_keys
    }
    workflow_snapshot = backend_snapshot.get("workflow") or backend_snapshot.get("comfy_workflow")

    return regen_manifest.make_manifest(
        preset_name=preset_name,
        preset_json=preset_json,
        preset_prepared=preset_prepared,
        ui_values=ui_values,
        backend_params=backend_snapshot,
        asset_refs=asset_refs,
        workflow=workflow_snapshot if isinstance(workflow_snapshot, dict) else None,
    )


def _scene_director_audio_status_for_generation(scene_director_enabled=False, scene_director_state=None):
    status = {
        "managed": bool(scene_director_enabled),
        "ready": False,
        "refs": [],
    }
    if not scene_director_enabled or not isinstance(scene_director_state, dict):
        return status
    try:
        import modules.scene_director_webui as scene_director_webui
    except Exception:
        return status
    refs = []
    segments = scene_director_state.get("segments")
    if isinstance(segments, list):
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            ref = scene_director_webui._scene_director_first_segment_ref(segment, "audio")
            if ref and ref not in refs:
                refs.append(ref)
    status["refs"] = refs
    for ref in refs:
        if scene_director_webui._scene_director_media_available(scene_director_state, ref, "audio"):
            status["ready"] = True
            break
    return status


def _clean_scene_reference_video_path(value):
    try:
        from extras.media_normalize import normalize_gradio_file_value

        normalized = normalize_gradio_file_value(value)
        if normalized is not None:
            value = normalized
    except Exception:
        pass
    if isinstance(value, dict):
        value = value.get("path") or value.get("video") or value.get("name")
    if hasattr(value, "path"):
        try:
            value = value.path
        except Exception:
            pass
    if hasattr(value, "name") and not isinstance(value, str):
        try:
            value = value.name
        except Exception:
            pass
    text = str(value or "").strip().strip('"')
    if not text or text.lower() in ("none", "null"):
        return None
    return text


def _forward_preset_native_process(state_params, backend_params):
    if not isinstance(state_params, dict) or not isinstance(backend_params, dict):
        return
    preset_prepared = state_params.get("__preset_prepared")
    if not isinstance(preset_prepared, dict):
        return
    preset_engine = preset_prepared.get("engine")
    if not isinstance(preset_engine, dict):
        return
    native_process = preset_engine.get("native_process")
    if native_process and not backend_params.get("native_process"):
        backend_params["native_process"] = native_process


def _resolve_scene_video_trim(component_path, original_path, trim_payload):
    from enhanced import sam3_video_mask as _sam3_video_mask

    return _sam3_video_mask.resolve_sam3_backend_video_path(component_path, original_path, trim_payload)


def _effective_scene_video(scene_video, scene_original_video_path, trim_payload=None):
    component_path = _clean_scene_reference_video_path(scene_video)
    if not component_path:
        return None
    original_path = _clean_scene_reference_video_path(scene_original_video_path)
    if trim_payload:
        try:
            resolved = _resolve_scene_video_trim(component_path, original_path, trim_payload)
            if resolved:
                return resolved
        except Exception:
            logger.warning("[VideoTrim] failed to prepare the original-quality trimmed video", exc_info=True)
        return component_path
    if original_path:
        return original_path
    return component_path


def _effective_scene_reference_video(state_params, scene_theme, scene_reference_video, scene_reference_video_original_path, trim_payload=None):
    del state_params, scene_theme
    return _effective_scene_video(scene_reference_video, scene_reference_video_original_path, trim_payload)


def _apply_scene_reference_video_backend_param(backend_params, reference_video):
    if reference_video:
        backend_params["reference_video"] = reference_video
    else:
        backend_params.pop("reference_video", None)


def _apply_scene_video_backend_params(backend_params, video, mask_video, reference_video, reference_video2=None):
    backend_params["video"] = _clean_scene_reference_video_path(video)
    backend_params["mask_video"] = _clean_scene_reference_video_path(mask_video)
    _apply_scene_reference_video_backend_param(
        backend_params,
        _clean_scene_reference_video_path(reference_video),
    )
    reference_video2 = _clean_scene_reference_video_path(reference_video2)
    if reference_video2:
        backend_params["reference_video2"] = reference_video2
    else:
        backend_params.pop("reference_video2", None)


def process_before_generation(state_params, seed_random, image_seed, backend_params, scene_theme, scene_canvas_image, scene_input_image1, scene_input_image2, scene_input_image3, scene_input_image4, scene_additional_prompt, scene_additional_prompt_2, scene_var_number, scene_var_number2, scene_var_number3, scene_var_number4, scene_var_number5, scene_var_number6, scene_var_number7, scene_var_number8, scene_var_number9, scene_var_number10, scene_steps, scene_switch_option1, scene_switch_option2, scene_switch_option3, scene_switch_option4, scene_aspect_ratio, scene_image_number, scene_video, scene_audio, scene_original_video_path, active_video_source, sam3_input_video, sam3_original_video_path, sam3_mask_video, overwrite_width=None, overwrite_height=None, resolution_multiplier=1.0, resolution_quantize_step=None, resolution_edit_mode=None, resolution_original_input=False, sam3_trim_payload=None, overwrite_step=None, scene_director_enabled=False, scene_director_state=None, scene_video_duration=None, scene_reference_video=None, scene_reference_video_original_path=None, scene_video_trim_payload=None, scene_reference_video_trim_payload=None, scene_input_image5=None, scene_input_image6=None, scene_input_image7=None, scene_input_image8=None, scene_reference_video2=None, scene_reference_video2_original_path=None, scene_reference_video2_trim_payload=None, scene_audio2=None, scene_audio3=None):
    regen_scene_additional_prompt = scene_additional_prompt
    regen_scene_additional_prompt_2 = scene_additional_prompt_2
    user_did = _state_user_did(state_params)
    backend_params.update(dict(
        nickname=_state_user_nickname(state_params),
        user_did=user_did,
        preset=state_params.get("__preset", ""),
        __lang=state_params.get("__lang"),
        engine_type=state_params.get("engine_type", "image"),
        ))
    _forward_preset_native_process(state_params, backend_params)
    state_upscale_model = str(state_params.get("upscale_model") or "").replace("\\", os.sep).replace("/", os.sep).lstrip(os.sep)
    if state_upscale_model:
        if state_upscale_model.lower() not in ("auto", "default") or "upscale_model" not in backend_params:
            backend_params["upscale_model"] = state_upscale_model
    state_clip_model = str(state_params.get("clip_model") or "").replace("\\", os.sep).replace("/", os.sep).lstrip(os.sep)
    if state_clip_model and state_clip_model not in (modules.flags.default_clip, modules.flags.default_vae, "auto"):
        backend_params["clip_model"] = state_clip_model
    try:
        from extras.media_normalize import normalize_gradio_audio_value

        scene_audio = normalize_gradio_audio_value(scene_audio)
        scene_audio2 = normalize_gradio_audio_value(scene_audio2)
        scene_audio3 = normalize_gradio_audio_value(scene_audio3)
    except Exception:
        pass

    if user_did:
        try:
            io_paths = update_comfyd_io_paths(user_did)
            if isinstance(io_paths, (list, tuple)) and len(io_paths) >= 3:
                _, comfyd_inputs, comfyui_outputs = io_paths[:3]
                logger.debug(f"Updated Comfyd IO directories: inputs={comfyd_inputs}, outputs={comfyui_outputs}")
        except Exception as e:
            logger.warning(f"Error updating comfyd IO directories: {e}")
    
    if 'scene_frontend' in state_params:
        scene_frontend = state_params['scene_frontend']
        scene_theme = _resolve_scene_generation_theme(state_params, scene_frontend, scene_theme)
        disvisible = _scene_disvisible_with_optional_inputs(scene_frontend)
        disvisible = set(disvisible)

        scene_switch_option3 = _resolve_scene_generation_switch_option3(
            scene_frontend,
            scene_theme,
            scene_switch_option3,
        )

        if 'scene_canvas_image' in disvisible:
            scene_canvas_image = None
        if 'scene_input_image1' in disvisible:
            scene_input_image1 = None
        if 'scene_input_image2' in disvisible:
            scene_input_image2 = None
        if 'scene_input_image3' in disvisible:
            scene_input_image3 = None
        if 'scene_input_image4' in disvisible:
            scene_input_image4 = None
        if 'scene_input_image5' in disvisible:
            scene_input_image5 = None
        if 'scene_input_image6' in disvisible:
            scene_input_image6 = None
        if 'scene_input_image7' in disvisible:
            scene_input_image7 = None
        if 'scene_input_image8' in disvisible:
            scene_input_image8 = None
        if 'scene_video' in disvisible:
            scene_video = None
            scene_original_video_path = None
            scene_video_trim_payload = ""
            if active_video_source == "scene":
                active_video_source = None
        if 'scene_reference_video' in disvisible:
            scene_reference_video = None
            scene_reference_video_original_path = None
            scene_reference_video_trim_payload = ""
        if 'scene_reference_video2' in disvisible:
            scene_reference_video2 = None
            scene_reference_video2_original_path = None
            scene_reference_video2_trim_payload = ""
        if 'scene_audio' in disvisible:
            scene_audio = None
        if 'scene_audio2' in disvisible:
            scene_audio2 = None
        if 'scene_audio3' in disvisible:
            scene_audio3 = None
        sam3_hidden = not meta_parser.scene_sam3_inputs_enabled(scene_frontend, scene_theme)
        if sam3_hidden:
            sam3_input_video = None
            sam3_original_video_path = None
            sam3_mask_video = None
            sam3_trim_payload = ""
            if active_video_source == "sam3":
                active_video_source = None
        if 'scene_var_number' in disvisible:
            scene_var_number = None
        if 'scene_var_number2' in disvisible:
            scene_var_number2 = None
        if 'scene_var_number3' in disvisible:
            scene_var_number3 = None
        if 'scene_var_number4' in disvisible:
            scene_var_number4 = None
        if 'scene_var_number5' in disvisible:
            scene_var_number5 = None
        if 'scene_var_number6' in disvisible:
            scene_var_number6 = None
        if 'scene_var_number7' in disvisible:
            scene_var_number7 = None
        if 'scene_var_number8' in disvisible:
            scene_var_number8 = None
        if 'scene_var_number9' in disvisible:
            scene_var_number9 = None
        if 'scene_var_number10' in disvisible:
            scene_var_number10 = None
        if 'scene_video_duration' in disvisible:
            scene_video_duration = None
        if 'scene_switch_option1' in disvisible:
            scene_switch_option1 = None
        if 'scene_switch_option2' in disvisible:
            scene_switch_option2 = None
        if 'scene_switch_option3' in disvisible:
            scene_switch_option3 = None
        if 'scene_switch_option4' in disvisible:
            scene_switch_option4 = None

        scene_canvas_image = util.normalize_gradio_sketch_value(scene_canvas_image, preserve_mask_color=True)
        scene_input_image1 = util.normalize_gradio_image_value(scene_input_image1, image_mode="RGBA")
        scene_input_image2 = util.normalize_gradio_image_value(scene_input_image2, image_mode="RGBA")
        scene_input_image3 = util.normalize_gradio_image_value(scene_input_image3, image_mode="RGBA")
        scene_input_image4 = util.normalize_gradio_image_value(scene_input_image4, image_mode="RGBA")
        scene_input_image5 = util.normalize_gradio_image_value(scene_input_image5, image_mode="RGBA")
        scene_input_image6 = util.normalize_gradio_image_value(scene_input_image6, image_mode="RGBA")
        scene_input_image7 = util.normalize_gradio_image_value(scene_input_image7, image_mode="RGBA")
        scene_input_image8 = util.normalize_gradio_image_value(scene_input_image8, image_mode="RGBA")
        scene_canvas_mask_disabled = _resolve_scene_canvas_mask_disabled(scene_frontend, scene_theme)

        scene_additional_prompt = f'{scene_additional_prompt}{scene_additional_prompt_2}'
        if util.is_chinese(scene_additional_prompt) and not scene_frontend['task_method'][scene_theme].lower().endswith('_cn'):
            scene_additional_prompt = vlm.translate(scene_additional_prompt, 'Slim Model')
        resolution_profile = resolution_preprocess.get_resolution_profile(state_params, scene_theme)
        resolution_target_size = resolution_preprocess.resolve_target_size(
            overwrite_width=overwrite_width,
            overwrite_height=overwrite_height,
            scene_aspect_ratio=scene_aspect_ratio,
            resolution_multiplier=resolution_multiplier,
            resolution_quantize_step=resolution_quantize_step,
        )
        resolution_original_input = resolution_preprocess.resolve_effective_original_input(
            resolution_original_input=resolution_original_input,
            scene_aspect_ratio=scene_aspect_ratio,
            target_size=resolution_target_size,
            profile=resolution_profile,
            scene_canvas_image=scene_canvas_image,
            scene_input_image1=scene_input_image1,
            scene_input_image2=scene_input_image2,
            scene_input_image3=scene_input_image3,
            scene_input_image4=scene_input_image4,
            scene_input_image5=scene_input_image5,
            scene_input_image6=scene_input_image6,
            scene_input_image7=scene_input_image7,
            scene_input_image8=scene_input_image8,
        )
        resize_image_flag = not resolution_original_input
        mask_color_flag = False
        preprocessor_methods = modules.flags.get_value_by_scene_theme(state_params, scene_theme, 'image_preprocessor_method', [])
        if len(preprocessor_methods)>0:
            for preprocessor_method in preprocessor_methods:
                if '-normalization' in preprocessor_method:
                    resize_image_flag = False
                if 'mask_color' in preprocessor_method:
                    mask_color_flag = True
        resolution_preprocess_result = resolution_preprocess.apply_scene_resolution_preprocess(
            state_params=state_params,
            scene_theme=scene_theme,
            scene_canvas_image=scene_canvas_image,
            scene_input_image1=scene_input_image1,
            scene_input_image2=scene_input_image2,
            scene_input_image3=scene_input_image3,
            scene_input_image4=scene_input_image4,
            scene_input_image5=scene_input_image5,
            scene_input_image6=scene_input_image6,
            scene_input_image7=scene_input_image7,
            scene_input_image8=scene_input_image8,
            scene_video=scene_video,
            scene_original_video_path=scene_original_video_path,
            active_video_source=active_video_source,
            sam3_input_video=sam3_input_video,
            sam3_original_video_path=sam3_original_video_path,
            sam3_mask_video=sam3_mask_video,
            sam3_trim_payload=sam3_trim_payload,
            scene_aspect_ratio=scene_aspect_ratio,
            overwrite_width=overwrite_width,
            overwrite_height=overwrite_height,
            resolution_multiplier=resolution_multiplier,
            resolution_quantize_step=resolution_quantize_step,
            resolution_edit_mode=resolution_edit_mode,
            resolution_original_input=resolution_original_input,
            scene_video_duration=scene_video_duration,
        )
        if resolution_preprocess_result.get("changed"):
            scene_canvas_image = resolution_preprocess_result.get("scene_canvas_image")
            scene_input_image1 = resolution_preprocess_result.get("scene_input_image1")
            scene_input_image2 = resolution_preprocess_result.get("scene_input_image2")
            scene_input_image3 = resolution_preprocess_result.get("scene_input_image3")
            scene_input_image4 = resolution_preprocess_result.get("scene_input_image4")
            scene_input_image5 = resolution_preprocess_result.get("scene_input_image5")
            scene_input_image6 = resolution_preprocess_result.get("scene_input_image6")
            scene_input_image7 = resolution_preprocess_result.get("scene_input_image7")
            scene_input_image8 = resolution_preprocess_result.get("scene_input_image8")
            scene_video = resolution_preprocess_result.get("scene_video")
            scene_original_video_path = resolution_preprocess_result.get("scene_original_video_path")
            sam3_input_video = resolution_preprocess_result.get("sam3_input_video")
            sam3_original_video_path = resolution_preprocess_result.get("sam3_original_video_path")
            sam3_mask_video = resolution_preprocess_result.get("sam3_mask_video")
            sam3_trim_payload = resolution_preprocess_result.get("sam3_trim_payload", sam3_trim_payload)
            resize_image_flag = False
        if scene_input_image1 is not None:
            scene_input_image1 = util.resize_image_by_max_area(scene_input_image1, max_area=1024 * 1024) if resize_image_flag else scene_input_image1
        if scene_input_image2 is not None:
            scene_input_image2 = util.resize_image_by_max_area(scene_input_image2, max_area=1024 * 1024) if resize_image_flag else scene_input_image2
        if scene_input_image3 is not None:
            scene_input_image3 = util.resize_image_by_max_area(scene_input_image3, max_area=1024 * 1024) if resize_image_flag else scene_input_image3
        if scene_input_image4 is not None:
            scene_input_image4 = util.resize_image_by_max_area(scene_input_image4, max_area=1024 * 1024) if resize_image_flag else scene_input_image4
        if scene_input_image5 is not None:
            scene_input_image5 = util.resize_image_by_max_area(scene_input_image5, max_area=1024 * 1024) if resize_image_flag else scene_input_image5
        if scene_input_image6 is not None:
            scene_input_image6 = util.resize_image_by_max_area(scene_input_image6, max_area=1024 * 1024) if resize_image_flag else scene_input_image6
        if scene_input_image7 is not None:
            scene_input_image7 = util.resize_image_by_max_area(scene_input_image7, max_area=1024 * 1024) if resize_image_flag else scene_input_image7
        if scene_input_image8 is not None:
            scene_input_image8 = util.resize_image_by_max_area(scene_input_image8, max_area=1024 * 1024) if resize_image_flag else scene_input_image8

        if scene_canvas_image is not None:
            image = scene_canvas_image['image']
            rgb = image[:, :, :3]
            alpha = image[:, :, 3]
            white_background = np.full_like(rgb, 255, dtype=np.uint8)
            mask = alpha > 0
            image = np.where(np.expand_dims(mask, axis=-1), rgb, white_background)
            image = np.dstack((image, alpha))
            scene_canvas_image['image'] = util.resize_image_by_max_area(image, max_area=1024 * 1024) if resize_image_flag else image
            mask = scene_canvas_image['mask']
            if scene_canvas_mask_disabled:
                mask = np.zeros_like(mask, dtype=np.uint8)
            if mask.shape[2] == 4:
                if mask_color_flag:
                    color = mask[:, :, 0:3].astype(np.float32)
                    alpha = mask[:, :, 3:4].astype(np.float32) / 255.0
                    mask = color * alpha
                    mask = mask.clip(0, 255).astype(np.uint8)
                else:
                    alpha = mask[:, :, 3]
                    h, w = alpha.shape
                    mask = np.zeros((h, w, 3), dtype=np.uint8)
                    mask[:, :, 0] = alpha
                    mask[:, :, 1] = alpha
                    mask[:, :, 2] = alpha
            scene_canvas_image['mask'] = util.resize_image_by_max_area(util.HWC3(mask), max_area=1024 * 1024) if resize_image_flag else mask

        scene_video_effective = _effective_scene_video(scene_video, scene_original_video_path, scene_video_trim_payload)
        try:
            from enhanced import sam3_video_mask as _sam3_video_mask

            sam3_video_effective = _sam3_video_mask.resolve_sam3_backend_video_path(sam3_input_video, sam3_original_video_path, sam3_trim_payload)
        except Exception:
            sam3_video_effective = sam3_input_video if sam3_input_video else sam3_original_video_path
        if active_video_source == "scene":
            video_effective = scene_video_effective if scene_video_effective else sam3_video_effective
        elif active_video_source == "sam3":
            video_effective = sam3_video_effective if sam3_video_effective else scene_video_effective
        else:
            video_effective = sam3_video_effective if sam3_video_effective else scene_video_effective
        reference_video_effective = _effective_scene_reference_video(
            state_params,
            scene_theme,
            scene_reference_video,
            scene_reference_video_original_path,
            scene_reference_video_trim_payload,
        )
        reference_video2_effective = _effective_scene_reference_video(
            state_params,
            scene_theme,
            scene_reference_video2,
            scene_reference_video2_original_path,
            scene_reference_video2_trim_payload,
        )
        scene_task_method_value = meta_parser.get_scene_task_method(scene_frontend, scene_theme)
        if scene_task_method_value == "wan_scail2_sam3_cn":
            mask_path = _clean_scene_reference_video_path(sam3_mask_video)
            if not mask_path or not os.path.isfile(mask_path):
                lang = normalize_ui_lang(state_params.get("__lang"))
                if lang == "zh":
                    raise gr.Error("SAM3 蒙版视频无效，请重新上传后再生成。")
                raise gr.Error("The SAM3 mask video is missing or invalid. Please upload it again.")
            logger.info(
                "[Generate][SCAIL2Mask] web_mask_ready path=%s size=%s",
                mask_path,
                os.path.getsize(mask_path),
            )
        if scene_task_method_value == "minimax_h3_mask_r2v_cn":
            lang = normalize_ui_lang(state_params.get("__lang"))
            source_path = _clean_scene_reference_video_path(video_effective)
            if not source_path or not os.path.isfile(source_path):
                if lang == "cn":
                    raise gr.Error("SAM3 源视频无效，请重新上传后再生成。")
                raise gr.Error("The SAM3 source video is missing or invalid. Please upload it again.")
            mask_path = _clean_scene_reference_video_path(sam3_mask_video)
            if not mask_path or not os.path.isfile(mask_path):
                if lang == "cn":
                    raise gr.Error("SAM3 蒙版视频无效，请重新生成或上传后再生成。")
                raise gr.Error("The SAM3 mask video is missing or invalid. Please regenerate or upload it again.")
            logger.info(
                "[Generate][H3MaskEdit] source_ready=%s source_size=%s mask_ready=%s mask_size=%s",
                source_path,
                os.path.getsize(source_path),
                mask_path,
                os.path.getsize(mask_path),
            )
        if scene_task_method_value == "minimax_h3_face_swap_r2v_cn":
            lang = normalize_ui_lang(state_params.get("__lang"))
            video_effective = scene_video_effective
            source_path = _clean_scene_reference_video_path(scene_video_effective)
            if not source_path or not os.path.isfile(source_path):
                if lang == "cn":
                    raise gr.Error("自动换脸原视频无效，请重新上传后再生成。")
                raise gr.Error("The automatic face-swap source video is missing or invalid. Please upload it again.")
            replacement_image = (
                scene_canvas_image.get("image")
                if isinstance(scene_canvas_image, dict)
                else scene_canvas_image
            )
            if replacement_image is None:
                if lang == "cn":
                    raise gr.Error("自动换脸需要一张人脸参考图，请上传后再生成。")
                raise gr.Error("Automatic face swap requires one face reference image. Please upload it before generating.")
            logger.info(
                "[Generate][H3AutoFaceSwap] source_ready=%s source_size=%s reference_shape=%s",
                source_path,
                os.path.getsize(source_path),
                getattr(replacement_image, "shape", None),
            )
        try:
            import modules.scene_director_webui as scene_director_webui
            scene_director_capability = scene_director_webui._scene_director_capability_from_state(state_params, scene_theme)
            scene_director_available = scene_director_webui._scene_director_available_from_state(
                state_params,
                scene_theme,
                scene_director_capability,
            )
        except Exception:
            scene_director_capability = {}
            scene_director_available = True
        if not scene_director_available:
            scene_director_enabled = False

        def _scene_image_trace_shape(value, *, sketch=False):
            try:
                image = value.get("image") if sketch and isinstance(value, dict) else value
                shape = getattr(image, "shape", None)
                if shape is None:
                    return None
                return tuple(int(part) for part in shape[:3])
            except Exception:
                return None

        util.log_ui_trace(
            logger,
            "[UI-TRACE] scene_image_backend_input | preset=%r, theme=%r, task_method=%r, hidden=%s, canvas_present=%s, canvas_shape=%s, input1_present=%s, input1_shape=%s, input2_present=%s, input2_shape=%s, input3_present=%s, input3_shape=%s, input4_present=%s, input4_shape=%s",
            state_params.get("__preset"),
            scene_theme,
            scene_task_method_value,
            sorted(disvisible),
            scene_canvas_image is not None,
            _scene_image_trace_shape(scene_canvas_image, sketch=True),
            scene_input_image1 is not None,
            _scene_image_trace_shape(scene_input_image1),
            scene_input_image2 is not None,
            _scene_image_trace_shape(scene_input_image2),
            scene_input_image3 is not None,
            _scene_image_trace_shape(scene_input_image3),
            scene_input_image4 is not None,
            _scene_image_trace_shape(scene_input_image4),
        )

        scene_audio_present = scene_audio is not None and not (isinstance(scene_audio, str) and not scene_audio.strip())
        scene_audio_exists = os.path.exists(scene_audio) if isinstance(scene_audio, str) and scene_audio.strip() else None
        scene_audio_ready = scene_audio_present and scene_audio_exists is not False
        scene_director_audio_status = _scene_director_audio_status_for_generation(scene_director_enabled, scene_director_state)
        util.log_ui_trace(
            logger,
            "[UI-TRACE] scene_audio_backend_input | preset=%r, theme=%r, task_method=%r, hidden=%s, audio_present=%s, audio_type=%s, exists=%s, director_audio_managed=%s, director_audio_ready=%s, director_audio_refs=%s",
            state_params.get("__preset"),
            scene_theme,
            scene_task_method_value,
            "scene_audio" in disvisible,
            scene_audio_present,
            type(scene_audio).__name__ if scene_audio is not None else "None",
            scene_audio_exists,
            scene_director_audio_status.get("managed"),
            scene_director_audio_status.get("ready"),
            scene_director_audio_status.get("refs"),
        )
        scene_task_method_l = str(scene_task_method_value or "").lower()
        scene_audio_policy = str((scene_director_capability or {}).get("audio_policy") or "").lower()
        scene_switch_option1_effective = scene_switch_option1
        if scene_switch_option1_effective is None:
            scene_switch_option1_effective = modules.flags.get_value_by_scene_theme(
                state_params,
                scene_theme,
                "switch_option1",
                False,
            )
        ltx_audio_gen_task = "ltx_audio_gen" in scene_task_method_l
        scene_audio_required = (
            ("infinitetalk" in scene_task_method_l)
            or ("ltx_" in scene_task_method_l and scene_audio_policy == "required")
            or ("ltx_ia2v" in scene_task_method_l)
            or ("ltx_ta2v" in scene_task_method_l)
            or (
                "ltx_" in scene_task_method_l
                and not ltx_audio_gen_task
                and not scene_audio_policy
                and bool(scene_switch_option1_effective)
            )
        )
        if scene_audio_required and not scene_audio_ready and not scene_director_audio_status.get("managed"):
            lang = str(state_params.get("__lang") or "").lower()
            if lang.startswith("zh") or lang.startswith("cn"):
                raise gr.Error("请先上传 Scene Audio，再生成音频驱动视频。")
            raise gr.Error("Please upload Scene Audio before generating audio-driven video.")
        def _scene_aspect_to_resolution(value):
            target_size = resolution_preprocess.resolve_target_size(
                overwrite_width=overwrite_width,
                overwrite_height=overwrite_height,
                scene_aspect_ratio=None,
                resolution_multiplier=resolution_multiplier,
                resolution_quantize_step=resolution_quantize_step,
            )
            if target_size:
                return f"{target_size[0]}×{target_size[1]}"
            value = str(value or "").strip()
            if not value:
                return modules.flags.scene_aspect_ratios_size[modules.flags.scene_aspect_ratios[0]]
            compact = value.split("|", 1)[0].strip().replace("×", "*").replace("x", "*")
            parts = compact.split("*")
            if len(parts) == 2:
                try:
                    width = int(float(parts[0]))
                    height = int(float(parts[1]))
                    if width > 0 and height > 0:
                        return f"{width}×{height}"
                except Exception:
                    pass
            if '×' in value:
                return value.split('|')[0].strip()
            if value in modules.flags.scene_aspect_ratios_size:
                return modules.flags.scene_aspect_ratios_size[value]
            try:
                mapped = modules.flags.scene_aspect_ratios_mapping(value)
                if '×' in mapped:
                    return mapped.split('|')[0].strip()
                if mapped in modules.flags.scene_aspect_ratios_size:
                    return modules.flags.scene_aspect_ratios_size[mapped]
            except Exception:
                pass
            return modules.flags.scene_aspect_ratios_size[modules.flags.scene_aspect_ratios[0]]

        backend_params.update(dict(
            task_method=f'scene_{scene_frontend["task_method"][scene_theme]}',
            scene_frontend=scene_frontend['version'],
            scene_canvas_image=scene_canvas_image,
            scene_input_image1=scene_input_image1,
            scene_input_image2=scene_input_image2,
            scene_input_image3=scene_input_image3,
            scene_input_image4=scene_input_image4,
            scene_input_image5=scene_input_image5,
            scene_input_image6=scene_input_image6,
            scene_input_image7=scene_input_image7,
            scene_input_image8=scene_input_image8,
            scene_theme=scene_theme,
            scene_additional_prompt=scene_additional_prompt,
            scene_var_number=None if 'var_number' not in scene_frontend else scene_var_number,
            scene_var_number2=scene_var_number2,
            scene_var_number3=scene_var_number3,
            scene_var_number4=scene_var_number4,
            scene_var_number5=scene_var_number5,
            scene_var_number6=scene_var_number6,
            scene_var_number7=scene_var_number7,
            scene_var_number8=scene_var_number8,
            scene_var_number9=scene_var_number9,
            scene_var_number10=scene_var_number10,
            scene_video_duration=scene_video_duration if 'video_duration' in scene_frontend else None,
            scene_switch_option1=scene_switch_option1,
            scene_switch_option2=scene_switch_option2,
            scene_switch_option3=scene_switch_option3,
            scene_switch_option4=scene_switch_option4,
            scene_aspect_ratio=_scene_aspect_to_resolution(scene_aspect_ratio),
            scene_image_number=scene_image_number,
            scene_steps=None,
            ))
        for key, value in (("audio", scene_audio), ("audio2", scene_audio2), ("audio3", scene_audio3)):
            if value:
                backend_params[key] = value
            else:
                backend_params.pop(key, None)
        _apply_scene_video_backend_params(
            backend_params,
            video_effective,
            sam3_mask_video,
            reference_video_effective,
            reference_video2_effective,
        )
    regen_data = _build_regen_manifest_for_generation(
        state_params,
        backend_params,
        scene_theme,
        scene_canvas_image,
        scene_input_image1,
        scene_input_image2,
        scene_input_image3,
        scene_input_image4,
        scene_input_image5,
        scene_input_image6,
        scene_input_image7,
        scene_input_image8,
        regen_scene_additional_prompt,
        regen_scene_additional_prompt_2,
        scene_var_number,
        scene_var_number2,
        scene_var_number3,
        scene_var_number4,
        scene_var_number5,
        scene_var_number6,
        scene_var_number7,
        scene_var_number8,
        scene_var_number9,
        scene_var_number10,
        scene_steps,
        scene_switch_option1,
        scene_switch_option2,
        scene_switch_option3,
        scene_switch_option4,
        scene_aspect_ratio,
        scene_image_number,
        scene_video_effective if 'scene_frontend' in state_params else scene_video,
        reference_video_effective if 'scene_frontend' in state_params else scene_reference_video,
        reference_video2_effective if 'scene_frontend' in state_params else scene_reference_video2,
        scene_audio,
        scene_audio2,
        scene_audio3,
        scene_original_video_path,
        active_video_source,
        sam3_input_video,
        sam3_original_video_path,
        sam3_mask_video,
        scene_video_duration=scene_video_duration,
        overwrite_step=overwrite_step,
    )
    if regen_data:
        backend_params[regen_manifest.KEY] = regen_data
        logger.info(
            "Regen manifest prepared for generation: preset=%s theme=%s task_method=%s",
            regen_data.get("preset_name"),
            (regen_data.get("ui_values") or {}).get("scene_theme"),
            (regen_data.get("backend_params") or {}).get("task_method"),
        )
    state_params["absent_model"] = False
    if not args_manager.args.disable_backend and is_models_file_absent(state_params["__preset"], user_did):
        if not ads.get_user_default("no_model_modal_checkbox", state_params, False):
            gr.Info(preset_absent_model_note_info)
        state_params["absent_model"] = True
        # if shared.token.is_admin(state_params["user"].get_did()):
        #     download_model_files(state_params["__preset"], state_params["user"].get_did(), True)
    elif not args_manager.args.disable_backend:
        notify_compat_fallback_once(state_params, state_params["__preset"], user_did=user_did)

    superprompter.remove_superprompt()
    vlm.free_model()
    try:
        import extras.wd14tagger
        extras.wd14tagger.free_model()
    except Exception:
        pass

    # stop_button, skip_button, generate_button, gallery, state_is_generating, index_radio, image_toolbox, prompt_info_box
    results = [gr.update(visible=True, interactive=False), gr.update(visible=True, interactive=False), gr.update(visible=False, interactive=False), [], True, gr.update(visible=False, open=False), gr.update(visible=False), gr.update(visible=False)]
    # image_seed
    if seed_random:
        seed_value = random.randint(constants.MIN_SEED, constants.MAX_SEED)
    else:
        try:
            seed_value = int(image_seed)
            if constants.MIN_SEED <= seed_value <= constants.MAX_SEED:
                 pass
        except ValueError:
            seed_value = random.randint(constants.MIN_SEED, constants.MAX_SEED)
    results += [seed_value]
    # params_backend must be an explicit output so the regen manifest reaches AsyncTask.
    results += [backend_params]
    # random_button, super_prompter, background_theme, image_tools_checkbox, bar_store_button, bar0_button, bar1_button, bar2_button, bar3_button, bar4_button, bar5_button, bar6_button, bar7_button, bar8_button
    preset_nums = len(get_preset_name_list(state_params["__session"], state_params["ua_hash"]).split(','))
    results += [gr.update(interactive=False)] * (preset_nums + 5)
    results += [skip_update() for _ in range(shared.BUTTON_NUM-preset_nums)]
    # preset_store, identity_dialog
    results += [gr.update(visible=False)]*2

    state_params["gallery_state"]='preview'
    state_params["gallery_preview_open"] = False
    gallery_util.clear_main_gallery_browser_state(state_params)
    gallery_util.clear_post_generation_compare_state(state_params)
    state_params["__skip_gallery_browser_refresh_once"] = False
    state_params["preset_store"]=False
    state_params["identity_dialog"]=False
    return results


def _has_generation_output(generation_task=None, gallery_output=None, video_output=None):
    def _has_component_output(value):
        if value is None:
            return False
        if isinstance(value, dict):
            return any(value.get(key) for key in ("name", "data", "value", "path"))
        if isinstance(value, (list, tuple, set)):
            return len(value) > 0
        return bool(value)

    task_results = getattr(generation_task, 'results', None)
    try:
        task_has_output = bool(task_results and len(task_results) > 0)
    except Exception:
        task_has_output = bool(task_results)

    return task_has_output or _has_component_output(gallery_output) or _has_component_output(video_output)


def should_show_finished_catalog(engine_type, output_list):
    return bool(output_list) or engine_type == "video"


def process_after_generation(state_params, generation_task=None, gallery_output=None, video_output=None):
    if "__max_per_page" not in state_params.keys():
        state_params.update({"__max_per_page": 18})
    if "__max_catalog" not in state_params.keys():
        state_params.update({"__max_catalog": config.default_image_catalog_max_number })
    
    max_per_page = state_params["__max_per_page"]
    max_catalog = state_params["__max_catalog"]
    user_did = _state_user_did(state_params)
    engine_type = state_params["engine_type"]
    state_params["__gallery_engine_type"] = engine_type
    state_params["gallery_preview_open"] = False
    gallery_util.clear_main_gallery_browser_state(state_params)
    gallery_util.invalidate_output_list_cache(user_did, engine_type)
    output_list, finished_nums, finished_pages = gallery_util.refresh_output_list(max_per_page, max_catalog, user_did, engine_type)
    state_params.update({"__output_list": output_list})
    state_params.update({"__finished_nums_pages": f'{finished_nums},{finished_pages}'})
    has_generation_context = generation_task is not None or gallery_output is not None or video_output is not None
    task_had_output = getattr(generation_task, "simpleai_generation_had_output", None)
    if task_had_output is None:
        no_current_output = has_generation_context and not _has_generation_output(generation_task, gallery_output, video_output)
    else:
        no_current_output = not bool(task_had_output)
    if no_current_output:
        state_params["gallery_state"] = 'preview'
    else:
        state_params["gallery_state"] = 'finished_index'
        choice = output_list[0] if output_list else None
        state_params["prompt_info"] = [choice, 0]
        task_results = getattr(generation_task, "results", None)
        if not isinstance(task_results, (list, tuple)):
            task_results = [task_results] if task_results is not None else []
        selected_path = next((os.fspath(path) for path in task_results if isinstance(path, (str, os.PathLike))), None)
        if selected_path:
            gallery_util.set_selected_gallery_media_path(state_params, selected_path)
        else:
            gallery_util.remember_selected_gallery_media_path(choice, 0, state_params)
    state_params["__skip_gallery_browser_refresh_once"] = bool(no_current_output)
    # generate_button, stop_button, skip_button, state_is_generating
    results = [gr.update(visible=True, interactive=True)] + [gr.update(visible=False, interactive=False), gr.update(visible=False, interactive=False), False]
    # gallery_index, index_radio
    # Completion must restore the catalog even when the output scan is still empty.
    catalog_visible = True
    if has_generation_context:
        results += [gr.update(choices=state_params["__output_list"], value=None), gr.update(visible=catalog_visible, open=False)]
    else:
        results += [gr.update(choices=state_params["__output_list"]), gr.update(visible=catalog_visible, open=len(state_params["__output_list"])>0)]
    # random_button, super_prompter, background_theme, image_tools_checkbox, bar_store_button, bar0_button, bar1_button, bar2_button, bar3_button, bar4_button, bar5_button, bar6_button, bar7_button, bar8_button
    preset_nums = len(get_preset_name_list(state_params["__session"], state_params["ua_hash"]).split(','))
    results += [gr.update(interactive=True)] * (preset_nums + 5)
    results += [skip_update() for _ in range(shared.BUTTON_NUM-preset_nums)]
    # [history_link, gallery_index_stat]
    results += [state_params['__finished_nums_pages']]
    results += [update_history_link(user_did, state_params["local_access"])]
    

    if len(state_params["__output_list"]) > 0 and engine_type == 'image':
        try:
            output_index = state_params["__output_list"][0].split('/')[0]
            gallery_util.refresh_images_catalog(output_index, True, user_did)
        except Exception as e:
            logger.error(f'Error in post-generation gallery processing: {e}')
   
    return results


def refresh_finished_catalog_stat_after_generation(state_params):
    state_params = state_params if isinstance(state_params, dict) else {}
    try:
        state_params.setdefault("__max_per_page", 18)
        state_params.setdefault("__max_catalog", config.default_image_catalog_max_number)
        user = state_params.get("user")
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
        engine_type = state_params.get("__gallery_engine_type") or state_params.get("engine_type") or "image"
        engine_type = "video" if engine_type == "video" else "image"
        time.sleep(0.35)
        output_list, finished_nums, finished_pages = gallery_util.refresh_output_list(
            state_params["__max_per_page"],
            state_params["__max_catalog"],
            user_did,
            engine_type,
        )
        state_params["__gallery_engine_type"] = engine_type
        state_params["__output_list"] = output_list
        state_params["__finished_nums_pages"] = f"{finished_nums},{finished_pages}"
        gallery_util.clear_main_gallery_browser_state(state_params)
        if state_params.get("gallery_state") == "main_browser":
            state_params["gallery_state"] = "finished_index"
        if output_list and engine_type == "image":
            try:
                gallery_util.refresh_images_catalog(output_list[0].split("/")[0], True, user_did)
            except Exception as e:
                logger.error(f"Error in delayed post-generation gallery processing: {e}")
    except Exception as e:
        logger.exception("Delayed post-generation gallery stat refresh failed: %s", e)
        state_params.setdefault("__finished_nums_pages", "0,0")
    return state_params.get("__finished_nums_pages", "0,0")


def sync_message(state_params):
    state_params.update({"__message":system_message})
    return

preset_down_note_info = 'The model file is missing. You can click to download the required models. You can also use the model_checker to complete the model files.'
preset_downing_note_info = 'Downloading the model file required for image generation, please wait for a moment...'
preset_absent_model_note_info = 'The preset package being loaded has model files that need to be downloaded.'
preset_compat_fallback_note_template = '当前预设正在兼容模式下运行，实际使用旧版模型: {legacy_model}。点击打开升级面板。'

def check_absent_model(bar_button, state_params):
    #logger.info(f'check_absent_model,state_params:{state_params}')
    state_params.update({'bar_button': bar_button})
    return 

def down_absent_model(state_params):
    state_params.update({'bar_button': state_params["bar_button"].replace('\u2B07', '')})
    return gr.update(visible=False), state_params


def notify_compat_fallback_once(state_params, preset_name, user_did=None):
    preset_name = str(preset_name or "").strip()
    if not preset_name or not isinstance(state_params, dict):
        return
    notified = state_params.get("__compat_fallback_notified_presets")
    if not isinstance(notified, list):
        notified = []
        state_params["__compat_fallback_notified_presets"] = notified
    if preset_name in notified:
        return
    try:
        fallback_models = model_loader.get_fallback_model_list_from_entries(
            preset_name,
            state_params.get("__preset_model_list_raw") or [],
            user_did=user_did,
            previous_default_info=state_params.get("__preset_previous_default_model_info"),
        )
    except Exception:
        fallback_models = model_loader.get_fallback_model_list(preset_name, user_did=user_did)
    if not fallback_models:
        return
    legacy_model = str((fallback_models[0] or {}).get("legacy_human_name") or (fallback_models[0] or {}).get("legacy_model") or "")
    state_params["__compat_fallback_notice"] = preset_compat_fallback_note_template.format(legacy_model=legacy_model or "")
    state_params["__compat_fallback_notice_token"] = f"{preset_name}:{len(notified) + 1}"
    notified.append(preset_name)

reset_layout_num = 0
reset_layout_ui_outputs_len = 0
reset_layout_scene_offset = 0
reset_layout_scene_outputs_len = 0
# Local indexes inside webui.py scene_frontend_ctrls. Preset switches should
# not carry uploaded media from the previous preset into hidden scene controls.
SCENE_PRESET_SWITCH_CLEAR_OUTPUTS = {
    18: "scene_canvas_image",
    19: "scene_input_image1",
    20: "scene_input_image2",
    21: "scene_input_image3",
    22: "scene_input_image4",
    44: "scene_video",
    45: "scene_reference_video",
    46: "scene_audio",
    47: "scene_input_image5",
    48: "scene_input_image6",
    49: "scene_input_image7",
    50: "scene_input_image8",
    51: "scene_reference_video2",
    52: "scene_audio2",
    53: "scene_audio3",
    54: "sam3_input_video",
    55: "sam3_original_video_path",
    56: "sam3_mask_video",
    57: "sam3_trim_payload",
}
SCENE_PRESET_SWITCH_CLEAR_VALUES = {
    57: "",
}

def reset_layout_ui(prompt, negative_prompt, state_params, is_generating, inpaint_mode, comfyd_active_checkbox, bar_button = None, include_scene_outputs=True):
    global system_message, preset_down_note_info, reset_layout_num, reset_layout_ui_outputs_len

    if bar_button is not None:
        state_params.update({"bar_button": bar_button})
        state_params["preset_store"] = False
    regen_params_loaded = bool(state_params.pop("__regen_params_loaded", False)) if bar_button is not None else False

    prev_engine_type = state_params.get("engine_type", None)
    prev_user_did = None
    try:
        if isinstance(state_params, dict) and state_params.get("user"):
            prev_user_did = state_params["user"].get_did()
    except Exception:
        prev_user_did = None
    state_params["__prev_engine_type"] = prev_engine_type
    state_params["__prev_user_did"] = prev_user_did

    if "__lang" not in state_params:
        state_params["__lang"] = ads.get_user_default("__lang", state_params, args_manager.args.language)
    if "__theme" not in state_params:
        state_params["__theme"] = ads.get_user_default("__theme", state_params, args_manager.args.theme)

    state_params.update({"__message": system_message})
    system_message = 'system message was displayed!'
    layout_initialized = bool(state_params.get("__layout_initialized", False))
    same_preset = (
        '__preset' in state_params.keys()
        and 'bar_button' in state_params.keys()
        and state_params["__preset"] == state_params['bar_button']
    )
    if '__preset' not in state_params.keys() or 'bar_button' not in state_params.keys() or (same_preset and layout_initialized and not regen_params_loaded):
        state_params["__preset_switched"] = False
        comparison_default = [skip_update() for _ in range(5)]
        nav_updates = refresh_nav_bars(state_params)
        fill_count = reset_layout_ui_outputs_len - len(nav_updates)
        if fill_count < 0:
            fill_count = 0
        return nav_updates + [skip_update() for _ in range(fill_count)] + [state_params] + comparison_default
    preset = state_params["bar_button"] if '\u2B07' not in state_params["bar_button"] else state_params["bar_button"].replace('\u2B07', '')
    current_user_did = _state_user_did(state_params)
    resolved_preset = _resolve_preset_storage_name(preset, current_user_did)
    logger.info(f'Reset_context: preset={state_params.get("__preset", None)}-->{preset}, theme={state_params.get("__theme", None)}, lang={state_params.get("__lang", None)}')
    if not args_manager.args.disable_backend and '\u2B07' in state_params["bar_button"]:
        if not ads.get_user_default("no_model_modal_checkbox", state_params, False):
            gr.Info(preset_down_note_info)

    state_params.update({"__preset": preset})
    state_params["__preset_switched"] = True
    state_params["gallery_state"] = "preview"
    state_params["gallery_preview_open"] = False
    state_params["__skip_gallery_browser_refresh_once"] = True
    gallery_util.invalidate_main_gallery_browser_requests(state_params, "preset_switch")
    gallery_util.clear_main_gallery_browser_state(state_params)
    gallery_util.clear_post_generation_compare_state(state_params)

    config_preset = config.try_get_preset_content(resolved_preset, current_user_did)
    preset_prepared = meta_parser.parse_meta_from_preset(config_preset)

    engine = preset_prepared.get('engine', {}).get('backend_engine', 'Fooocus')
    engine_type = preset_prepared.get('engine', {}).get('engine_type', 'image')
    state_params.update({"engine": engine})
    state_params.update({"engine_type": engine_type})
    state_params.update({"__gallery_engine_type": engine_type})
    scene_frontend = preset_prepared.get('engine', {}).get('scene_frontend', None)
    if scene_frontend:
        state_params.update({"scene_frontend": scene_frontend})
        scene_theme_preference = _preferred_scene_theme_for_preset(state_params, preset)
        scene_theme = _resolve_scene_theme(scene_frontend, scene_theme_preference)
        if scene_theme:
            state_params["scene_theme"] = scene_theme
            state_params["__scene_theme_preset"] = preset
        try:
            state_params["__scene_theme_revision"] = int(state_params.get("__scene_theme_revision", 0) or 0) + 1
        except Exception:
            state_params["__scene_theme_revision"] = 1
        task_method = scene_frontend['task_method']
        if isinstance(task_method, list):
            task_method = task_method[0]
        elif isinstance(task_method, dict):
            if scene_theme and scene_theme in task_method:
                task_method = task_method[scene_theme]
            elif task_method:
                task_method = task_method[next(iter(task_method))]
    else:
        if 'scene_frontend' in state_params:
            del state_params["scene_frontend"]
        state_params.pop("scene_theme", None)
        state_params.pop("__scene_theme_preset", None)
        try:
            state_params["__scene_theme_revision"] = int(state_params.get("__scene_theme_revision", 0) or 0) + 1
        except Exception:
            state_params["__scene_theme_revision"] = 1
        task_method = preset_prepared.get('engine', {}).get('backend_params', modules.flags.get_engine_default_backend_params(engine)).get('task_method', 'text2image')
        if isinstance(task_method, str) and engine == 'Fooocus':
            task_method = 'text2image'
    state_params.update({"task_method": task_method})
    preset_prepared.update({
        'preset': preset,
        'task_method': task_method,
        'is_mobile': state_params["__is_mobile"] })

    state_params['__preset_prepared'] = preset_prepared # Cache for reset_layout_values
    state_params['__preset_supported_tasks'] = config.resolve_preset_supported_tasks(config_preset, resolved_preset)
    state_params['__preset_interaction_requirements'] = config.resolve_preset_interaction_requirements(config_preset, resolved_preset)
    state_params['__preset_model_list_raw'] = config_preset.get('model_list', []) if isinstance(config_preset, dict) else []
    state_params['__preset_resource_bundles_raw'] = config_preset.get('resource_bundles', []) if isinstance(config_preset, dict) else []
    state_params['__preset_previous_default_model_info'] = {
        'default_model': config_preset.get('default_model', '') if isinstance(config_preset, dict) else '',
        'previous_default_models': config_preset.get('previous_default_models', []) if isinstance(config_preset, dict) else [],
        'default_refiner': config_preset.get('default_refiner', '') if isinstance(config_preset, dict) else '',
        'previous_default_refiners': config_preset.get('previous_default_refiners', []) if isinstance(config_preset, dict) else [],
    }
    state_params['__preset_output_format'] = config_preset.get('default_output_format', None) if isinstance(config_preset, dict) else None
    state_params['__preset_output_format_loaded'] = True
    if not args_manager.args.disable_backend and not is_models_file_absent(preset, current_user_did):
        notify_compat_fallback_once(state_params, preset, user_did=current_user_did)
    preset_url = preset_prepared.get('reference') or get_preset_inc_url(preset, state_params.get("__lang"))
    state_params.update({"__preset_url":preset_url})
    state_params.update({'preset_store': False})
    state_params["__layout_initialized"] = True

    results = refresh_nav_bars(state_params)
    layout_updates = list(meta_parser.switch_layout_template(
        preset_prepared,
        state_params,
        preset_url,
        defer_file_choices=True,
        fast_nav=True,
        omit_scene_outputs=(not include_scene_outputs and bool(reset_layout_scene_outputs_len)),
    ))
    engine_disvisible = _resolve_engine_disvisible_for_state(state_params)
    engine_disinteractive = _resolve_engine_disinteractive_for_state(state_params)
    if len(layout_updates) > 11:
        layout_updates[10] = _main_param_update_with_engine_visibility(
            layout_updates[10],
            "overwrite_step",
            engine_disvisible,
            engine_disinteractive,
        )
        layout_updates[11] = _main_param_update_with_engine_visibility(
            layout_updates[11],
            "guidance_scale",
            engine_disvisible,
            engine_disinteractive,
        )
    results += layout_updates
    fill_count = reset_layout_ui_outputs_len - len(results)
    if fill_count > 0:
        results += [skip_update() for _ in range(fill_count)]
    elif fill_count < 0:
        results = results[:reset_layout_ui_outputs_len]

    # comparison_state, comparison_box, progress_gallery, compare_btn, progress_window
    comparison_outputs = [False, gr.update(visible=False), gr.update(visible=False), gr.update(value="🔍", visible=True, variant="secondary"), gr.update(visible=True, value=get_welcome_image(preset, state_params["__is_mobile"], no_welcome=ads.get_admin_default("no_welcome_checkbox"), state_params=state_params))]
    
    return results + [state_params] + comparison_outputs

def reset_scene_frontend_ui(state_params):
    count = int(reset_layout_scene_outputs_len or 0)
    if count <= 0:
        return []
    if not isinstance(state_params, dict) or not state_params.get("__preset_switched", False):
        return [skip_update() for _ in range(count)]

    preset_prepared = state_params.get('__preset_prepared', None)
    if preset_prepared is None:
        try:
            preset = state_params.get("__preset", config.preset)
            user = state_params.get("user", None)
            user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
            config_preset = config.try_get_preset_content(preset, user_did)
            preset_prepared = meta_parser.parse_meta_from_preset(config_preset)
        except Exception as e:
            util.log_ui_trace(logger, f"[UI-TRACE] reset_scene_frontend_ui.prepare_failed | err={type(e).__name__}: {e}")
            return [skip_update() for _ in range(count)]

    try:
        layout_updates = meta_parser.switch_layout_template(
            preset_prepared,
            state_params,
            state_params.get("__preset_url", ""),
            defer_file_choices=True,
            fast_nav=True,
        )
        start = int(reset_layout_scene_offset or 0)
        scene_updates = list(layout_updates[start:start + count])
    except Exception as e:
        util.log_ui_trace(logger, f"[UI-TRACE] reset_scene_frontend_ui.failed | err={type(e).__name__}: {e}")
        return [skip_update() for _ in range(count)]

    if len(scene_updates) > count:
        scene_updates = scene_updates[:count]
    if len(scene_updates) < count:
        scene_updates += [skip_update() for _ in range(count - len(scene_updates))]
    for index in SCENE_PRESET_SWITCH_CLEAR_OUTPUTS:
        if index < len(scene_updates):
            scene_updates[index] = gr_update(value=SCENE_PRESET_SWITCH_CLEAR_VALUES.get(index, None))
    return scene_updates

def reset_layout_values(state_params, is_generating, inpaint_mode, use_resolution_override, scene_batch_target, scene_theme=None, scene_aspect_ratio=None, fast_nav=False, after_identity_count=0):
    start_perf = time.perf_counter()
    if not isinstance(state_params, dict):
        state_params = {}

    preset = state_params.get("__preset", None)
    if not preset:
        preset = config.preset
        state_params["__preset"] = preset

    preset_prepared = state_params.get('__preset_prepared', None)
    if preset_prepared is None:
        try:
            user = state_params.get("user", None)
            user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
        except Exception:
            user_did = None
        if not user_did:
            try:
                user_did = shared.token.get_guest_did()
            except Exception:
                user_did = None

        config_preset = config.try_get_preset_content(preset, user_did)
        preset_prepared = meta_parser.parse_meta_from_preset(config_preset)

        engine = preset_prepared.get('engine', {}).get('backend_engine', 'Fooocus')
        state_params.update({"engine": engine})
        state_params.update({"backend_engine": engine})
        task_method = preset_prepared.get('engine', {}).get('backend_params', modules.flags.get_engine_default_backend_params(engine)).get('task_method', 'text2image')
        if isinstance(task_method, str) and engine == 'Fooocus' and task_method.startswith('z_image_'):
            task_method = 'text2image'
        state_params.update({"task_method": task_method})
        preset_prepared.update({
            'preset': preset,
            'task_method': task_method,
            'is_mobile': state_params.get("__is_mobile", False) })

    defer_preview_reset = bool(fast_nav and state_params.get("__preset_switched", False))
    results = meta_parser.load_parameter_button_click(
        preset_prepared,
        is_generating,
        inpaint_mode,
        use_resolution_override,
        no_welcome=ads.get_admin_default("no_welcome_checkbox"),
        defer_preview_reset=defer_preview_reset,
        state_params=state_params,
    )
    engine_data = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    if not isinstance(engine_data, dict):
        engine_data = {}
    backend_engine = (
        state_params.get("backend_engine")
        or state_params.get("engine")
        or engine_data.get("backend_engine")
        or config.backend_engine
    )
    engine_disvisible = _resolve_engine_disvisible_for_state(state_params)
    engine_disinteractive = _resolve_engine_disinteractive_for_state(state_params)
    scenes = state_params.get("scene_frontend", None)
    if isinstance(scenes, dict) and len(results) > 10:
        current_preset = str(state_params.get("__preset") or "").strip()
        theme_owner = str(state_params.get("__scene_theme_preset") or "").strip()
        preferred_theme = state_params.get("scene_theme") if current_preset and theme_owner == current_preset else None
        active_theme = _resolve_scene_theme(scenes, preferred_theme)
        if active_theme:
            state_params["scene_theme"] = active_theme
            state_params["__scene_theme_preset"] = current_preset
            results[10] = meta_parser.switch_scene_theme_standard_generation_defaults(
                state_params,
                active_theme,
            )
    if len(results) > 18:
        results[10] = _main_param_update_with_engine_visibility(
            results[10],
            "overwrite_step",
            engine_disvisible,
            engine_disinteractive,
        )
        results[18] = _main_param_update_with_engine_visibility(
            results[18],
            "guidance_scale",
            engine_disvisible,
            engine_disinteractive,
        )
    hidden_models = set(engine_disvisible if isinstance(engine_disvisible, list) else [])
    scenes_disvisible = []
    if isinstance(scenes, dict):
        scenes_disvisible = _scene_disvisible_with_optional_inputs(scenes)
        hidden_models.update(scenes_disvisible)
        if "scene_base_model" in hidden_models:
            hidden_models.add("base_model")
        if "scene_refiner_model" in hidden_models:
            hidden_models.add("refiner_model")
    base_visible = "base_model" not in hidden_models
    refiner_visible = "refiner_model" not in hidden_models
    preset_refiner_model = (
        preset_prepared.get("refiner_model")
        or preset_prepared.get("Refiner Model")
        or preset_prepared.get("default_refiner")
        or config.default_refiner_model_name
    ) if isinstance(preset_prepared, dict) else config.default_refiner_model_name
    refiner_switch_visible = backend_engine == "Fooocus" and refiner_visible and preset_refiner_model != "None"
    current_base = results[26]
    current_refiner = results[27]
    current_refiner_switch = results[28]
    if util.simpai_ui_trace_enabled():
        logger.info(
            f"[UI-TRACE] reset_layout_values.model_visibility | "
            f"preset={state_params.get('__preset')!r}, backend={backend_engine!r}, "
            f"engine_disvisible={engine_disvisible!r}, scene_disvisible={scenes_disvisible!r}, "
            f"base_visible={base_visible}, refiner_visible={refiner_visible}, "
            f"refiner_switch_visible={refiner_switch_visible}, "
            f"current_base_type={type(current_base).__name__}, "
            f"current_refiner_type={type(current_refiner).__name__}, "
            f"current_refiner_switch_type={type(current_refiner_switch).__name__}"
        )
    if isinstance(current_base, str):
        results[26] = gr.update(value=current_base, visible=base_visible)
    else:
        results[26] = gr.update(visible=base_visible)
    if isinstance(current_refiner, str):
        results[27] = gr.update(value=current_refiner, visible=refiner_visible)
    else:
        results[27] = gr.update(visible=refiner_visible)
    if isinstance(current_refiner_switch, (int, float)):
        results[28] = gr.update(value=current_refiner_switch, visible=refiner_switch_visible)
    else:
        results[28] = gr.update(visible=refiner_switch_visible)
    after_parameters = time.perf_counter()

    def _parse_scene_resolution(value):
        if value is None:
            return -1, -1
        s = str(value).strip()
        if not s:
            return -1, -1
        s = s.split(",", 1)[0].strip()
        try:
            mapped = modules.flags.scene_aspect_ratios_mapping(s)
            size = modules.flags.scene_aspect_ratios_size.get(mapped)
            if size:
                w_raw, h_raw = str(size).replace("×", "x").split("x", 1)
                return int(w_raw.strip()), int(h_raw.strip())
        except Exception:
            pass
        if "|" in s:
            parts = s.split("|", 1)
            w_raw = parts[0].strip()
            ratio = parts[1].strip()
            if w_raw.isdigit() and ":" in ratio:
                try:
                    a_str, b_str = ratio.split(":", 1)
                    a = float(a_str)
                    b = float(b_str)
                    w = int(w_raw)
                    if a > 0 and b > 0 and w > 0:
                        h = int(round(w * (b / a)))
                        return w, h
                except Exception:
                    pass
        try:
            import re
            m = re.search(r"(\d+)\D+(\d+)", s.replace("×", "x").replace("*", "x"))
            if m:
                return int(m.group(1)), int(m.group(2))
        except Exception:
            pass
        return -1, -1

    def _scene_is_t2v(state):
        try:
            scenes = state.get("scene_frontend", {})
            if not isinstance(scenes, dict):
                return False
            task_method = scenes.get("task_method", "")
            theme = scene_theme if isinstance(scene_theme, str) and scene_theme else state.get("scene_theme", None)
            if isinstance(task_method, dict):
                if isinstance(theme, str) and theme in task_method:
                    task_method = task_method.get(theme, "")
                elif task_method:
                    task_method = next(iter(task_method.values()), "")
            elif isinstance(task_method, list):
                task_method = task_method[0] if task_method else ""
            return "t2v" in str(task_method or "").lower()
        except Exception:
            return False

    scene_t2v_enabled = _scene_is_t2v(state_params)
    if scene_t2v_enabled:
        try:
            ow = results[13]
            oh = results[14]
            ow_val = int(ow) if isinstance(ow, (int, float)) else -1
            oh_val = int(oh) if isinstance(oh, (int, float)) else -1
        except Exception:
            ow_val, oh_val = -1, -1

        if not (ow_val > 0 and oh_val > 0):
            w2, h2 = _parse_scene_resolution(scene_aspect_ratio)
            if not (w2 > 0 and h2 > 0):
                try:
                    scenes = state_params.get("scene_frontend", {})
                    theme = scene_theme if isinstance(scene_theme, str) and scene_theme else state_params.get("scene_theme", None)
                    if not theme and isinstance(scenes, dict):
                        themes = scenes.get("theme", [])
                        if isinstance(themes, str):
                            theme = themes
                        elif isinstance(themes, (list, tuple)) and themes:
                            theme = themes[0]
                    scene_ratios = modules.flags.get_value_by_scene_theme(state_params, theme, "aspect_ratio", [])
                    if isinstance(scene_ratios, (list, tuple)) and scene_ratios:
                        w2, h2 = _parse_scene_resolution(scene_ratios[0])
                except Exception:
                    pass
            if not (w2 > 0 and h2 > 0):
                w2, h2 = 640, 640
            if w2 > 0 and h2 > 0:
                results[13] = gr.update(value=int(w2))
                results[14] = gr.update(value=int(h2))
    if fast_nav:
        current_user_did = None
        try:
            if isinstance(state_params, dict) and state_params.get("user"):
                current_user_did = state_params["user"].get_did()
        except Exception:
            current_user_did = None
        has_output_list_cache = "__output_list" in state_params and "__finished_nums_pages" in state_params
        skip_output_refresh = (
            has_output_list_cache
            and
            state_params.get("__prev_engine_type", None) == state_params.get("engine_type", None)
            and state_params.get("__prev_user_did", None) == current_user_did
        )
        lightweight_after_identity = update_after_identity_sub(
            state_params,
            lightweight_nav=True,
            skip_output_refresh=skip_output_refresh,
            skip_system_params=True,
        )
        after_identity = time.perf_counter()
        expected_after_identity = int(after_identity_count or 0)
        if expected_after_identity > 0:
            if len(lightweight_after_identity) > expected_after_identity:
                lightweight_after_identity = lightweight_after_identity[:expected_after_identity]
            elif len(lightweight_after_identity) < expected_after_identity:
                lightweight_after_identity += [skip_update() for _ in range(expected_after_identity - len(lightweight_after_identity))]
        results += lightweight_after_identity
    else:
        results += update_after_identity_sub(state_params)
        after_identity = time.perf_counter()

    reset_ui_results_len = 19 + (len(config.default_loras) * 4)
    if fast_nav:
        reset_ui_results = [skip_update() for _ in range(reset_ui_results_len)]
    else:
        reset_ui_results = [gr.update() for _ in range(9)] + [True] + \
                   [False, [], [], "base", gr.update(visible=False), gr.update(value=""), gr.update(choices=["All folders"], value="All folders"), gr.update(value="Showing **0** / **0** items"), gr.update(value=[])] + \
                   [gr.update(visible=False) for _ in config.default_loras] + \
                   [False for _ in config.default_loras] + \
                   [[] for _ in config.default_loras] + \
                   [gr.update(variant="secondary") for _ in config.default_loras]
    results += reset_ui_results

    if not fast_nav:
        sync_intput_reserved()
        ldm_patched.modules.model_management.print_memory_info("after switched preset")

    if fast_nav:
        batch_accordion_update = skip_update()
        batch_target_update = skip_update()
    else:
        try:
            import modules.batch_utils as batch_utils
            batch_accordion_update = batch_utils.refresh_scene_batch_accordion(state_params)
            batch_target_update = batch_utils.refresh_scene_batch_target(state_params, scene_batch_target)
        except Exception:
            batch_accordion_update = skip_update()
            batch_target_update = skip_update()

    end_perf = time.perf_counter()
    if util.simpai_ui_trace_enabled():
        try:
            logger.info(
                "[UI-TRACE] reset_layout_values.timing | "
                f"preset={preset!r}, fast_nav={fast_nav}, "
                f"skip_output_refresh={skip_output_refresh if fast_nav else False}, "
                f"parameters={after_parameters - start_perf:.3f}s, "
                f"after_identity={after_identity - after_parameters:.3f}s, "
                f"tail={end_perf - after_identity:.3f}s, "
                f"total={end_perf - start_perf:.3f}s"
            )
        except Exception:
            pass

    return [batch_accordion_update, batch_target_update] + results

def check_admin_exists():
    try:
        return bool(shared.token.get_admin_did())
    except Exception as e:
        logger.debug(f"获取管理员变量时出错: {str(e)}")
        return False

def toggle_preset_store(state):
    user_in_state = 'user' in state
    store_update = skip_update()
    can_manage_preset_store = _state_can_manage_preset_store(state) if user_in_state else is_local_mode()
    if user_in_state and can_manage_preset_store:
        if 'preset_store' in state:
            flag = state['preset_store']
        else:
            state['preset_store'] = False
            flag = False
        state['preset_store'] = not flag
        preset_store_update = gr.update(visible=not flag)
        state["__preset_store_mounted"] = not flag
        state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
        state['identity_dialog'] = False
        return [preset_store_update, store_update] + update_topbar_js_params(state, include_canvas_catalogs=False) + [gr.update(visible=False)] + [skip_update() for _ in range(17)]
    else:
        if is_local_mode():
            if 'preset_store' in state:
                flag = state['preset_store']
            else:
                state['preset_store'] = False
                flag = False
            state['preset_store'] = not flag
            preset_store_update = gr.update(visible=not flag)
            state["__preset_store_mounted"] = not flag
            state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
            state['identity_dialog'] = False
            return [preset_store_update, store_update] + update_topbar_js_params(state, include_canvas_catalogs=False) + [gr.update(visible=False)] + [skip_update() for _ in range(17)]
        else:
            state['preset_store'] = False
            state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
            # The guest entry is an identity-card opener, not a toggle. Startup
            # updates can otherwise leave the server-side flag out of date.
            state['identity_dialog'] = False
            return [skip_update(), store_update] + update_topbar_js_params(state) + toggle_identity_dialog(state)

def update_navbar_from_mystore(selected_preset, state):
    global preset_samples
    user_did = _state_user_did(state)
    is_guest = shared.token.is_guest(user_did) if user_did else True

    def _to_index(v):
        if v is None:
            return None
        if isinstance(v, (list, tuple)):
            if not v:
                return None
            v = v[0]
        try:
            return int(v)
        except Exception:
            return None

    idx = _to_index(selected_preset)
    samples = get_preset_samples(user_did)
    if idx is None or idx < 0 or idx >= len(samples):
        if is_guest:
            samples = get_preset_samples(None)
        if idx is None or idx < 0 or idx >= len(samples):
            return refresh_nav_bars(state) + update_topbar_js_params(state)

    selected_preset_name = _canonicalize_preset_name(samples[idx][0])

    results = refresh_nav_bars(state)
    results2 = update_topbar_js_params(state)
    nav_name_list = get_preset_name_list(state["__session"], state["ua_hash"])
    nav_array = _canonicalize_nav_preset_names(nav_name_list.split(','))
    available_presets_count = 0

    missing_model_filter = ads.get_admin_default("missing_model_filter_checkbox")

    filtered_nav_array = []
    for preset in nav_array:
        if preset:
            if not missing_model_filter or not is_models_file_absent(preset, user_did):
                available_presets_count += 1
                filtered_nav_array.append(preset)
            else:
                logger.info(f'[Preset Management] Filtered out preset with missing model: {preset}')

    if len(filtered_nav_array) != len([p for p in nav_array if p]):
        nav_array = filtered_nav_array
        if 'user' in state and not is_guest:
            filtered_nav_name_list = ','.join(_canonicalize_nav_preset_names(nav_array))
            shared.token.set_local_vars("user_presets", filtered_nav_name_list, state["__session"], state["ua_hash"])

    if selected_preset_name == state["__preset"]:
        return results + results2
    if selected_preset_name in nav_array:
        nav_array.remove(selected_preset_name)
        logger.info(f'[Preset Management] Withdraw the preset/回撤预置包: {selected_preset_name}.')
    else:
        elimination_threshold = max(available_presets_count, len(nav_array))
        if elimination_threshold >= shared.BUTTON_NUM:
            if state["__preset"] not in nav_array:
                return results + results2
            position = nav_array.index(state["__preset"])
            if position+1 == shared.BUTTON_NUM:
                nav_array = nav_array[:-2] + nav_array[-1:]
            else:
                nav_array = nav_array[:-1]
        nav_array.append(selected_preset_name)
        logger.info(f'[Preset Management] Launch the preset/启用预置包: {selected_preset_name}.')

    nav_array = _coerce_nav_preset_list(
        nav_array,
        user_did=user_did,
        fallback_preset=state.get("__preset"),
        apply_missing_model_filter=False,
    )
    nav_name_list = ','.join(_canonicalize_nav_preset_names(nav_array))
    if 'user' in state:
        if not is_guest:
            logger.info(f"[Preset Management] save mypreset: {nav_name_list}")
            shared.token.set_local_vars("user_presets", nav_name_list, state["__session"], state["ua_hash"])
        else:
            has_admin = False
            has_admin = check_admin_exists()
            
            if not has_admin:
                shared.token.set_local_vars("user_presets", nav_name_list, state["__session"], state["ua_hash"])

    try:
        return refresh_nav_bars(state) + update_topbar_js_params(state)
    except TypeError as e:
        logger.error(f"UI Update Error: {str(e)}")

def apply_navbar_from_store_editor(payload, state):
    user_did = _state_user_did(state)

    if not _state_can_manage_preset_store(state):
        state["preset_store"] = False
        state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
        try:
            gr.Info("Please sign in.")
        except Exception:
            pass
        return refresh_nav_bars(state) + update_topbar_js_params(state)

    try:
        parsed = json.loads(payload or "{}")
    except Exception:
        parsed = {}

    raw_presets = parsed.get("presets", []) if isinstance(parsed, dict) else []
    if not isinstance(raw_presets, list):
        raw_presets = []
    close_after_apply = bool(parsed.get("close")) if isinstance(parsed, dict) else False

    nav_array = []
    seen = set()
    for item in raw_presets:
        if not isinstance(item, str):
            continue
        preset_name = _canonicalize_preset_name(item)
        if not preset_name:
            continue
        if preset_name.endswith(PRESET_MISSING_MARKER):
            preset_name = preset_name[:-len(PRESET_MISSING_MARKER)].strip()
        canonical = _canonicalize_preset_name(preset_name)
        if not canonical:
            continue
        resolved_preset = _canonicalize_preset_name(_resolve_preset_storage_name(canonical, user_did))
        if not resolved_preset or resolved_preset in seen:
            continue
        if not _preset_storage_exists(resolved_preset, user_did):
            continue
        seen.add(resolved_preset)
        nav_array.append(resolved_preset)
        if len(nav_array) >= shared.BUTTON_NUM:
            break

    if not nav_array:
        try:
            gr.Info(_nav_minimum_preset_message(state.get("__lang")))
        except Exception:
            pass
        nav_array = _get_effective_nav_preset_list(state)

    nav_array = _coerce_nav_preset_list(
        nav_array,
        user_did=user_did,
        fallback_preset=state.get("__preset"),
        apply_missing_model_filter=False,
    )
    nav_name_list = ','.join(_canonicalize_nav_preset_names(nav_array))
    if 'user' in state:
        logger.info(f"[Preset Management] apply store draft: {nav_name_list}")
        _persist_nav_preset_value(state["__session"], state["ua_hash"], nav_name_list)
    state["preset_store"] = not close_after_apply
    state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1
    return refresh_nav_bars(state) + update_topbar_js_params(state)

def _resolve_user_preset_delete_paths(preset_name, user_did=None):
    if not user_did or not preset_name:
        return '', []

    display_name = _strip_preset_marker(_canonicalize_preset_name(str(preset_name).strip()))
    if not isinstance(display_name, str) or not display_name.endswith('.'):
        return display_name, []

    base_name = display_name[:-1].strip()
    if not base_name:
        return display_name, []

    try:
        user_path_preset = get_path_in_user_dir('presets', user_did)
    except Exception:
        user_path_preset = None
    if not user_path_preset:
        return display_name, []

    base_dir = os.path.abspath(user_path_preset)
    arch_str = config.get_gpu_arch_str_in_preset_name()
    candidate_stems = [base_name]
    if arch_str and not base_name.endswith(arch_str):
        candidate_stems.append(f'{base_name}{arch_str}')
    if not base_name.endswith('_fp4') and not base_name.endswith('_int4'):
        candidate_stems.extend([f'{base_name}_fp4', f'{base_name}_int4'])

    paths = []
    seen_paths = set()
    for stem in candidate_stems:
        if not isinstance(stem, str) or not stem.strip():
            continue
        rel_path = os.path.normpath(f'{stem}.json')
        if os.path.isabs(rel_path) or os.path.splitdrive(rel_path)[0] or rel_path == '.' or rel_path.startswith('..'):
            continue
        target_path = os.path.abspath(os.path.join(base_dir, rel_path))
        try:
            if os.path.commonpath([base_dir, target_path]) != base_dir:
                continue
        except Exception:
            continue
        if target_path in seen_paths:
            continue
        seen_paths.add(target_path)
        if os.path.isfile(target_path):
            paths.append(target_path)

    return display_name, paths

def delete_user_preset_from_store(payload, state):
    user_did = None
    try:
        if isinstance(state, dict) and state.get("user"):
            user_did = state["user"].get_did()
    except Exception:
        user_did = None

    try:
        parsed = json.loads(payload or "{}")
    except Exception:
        parsed = {}
    preset_name = parsed.get("preset", "") if isinstance(parsed, dict) else ""
    display_name, delete_paths = _resolve_user_preset_delete_paths(preset_name, user_did)

    if not display_name or not display_name.endswith('.'):
        try:
            gr.Info("Cannot delete built-in Preset")
        except Exception:
            pass
        return [dataset_update(samples=get_preset_samples(user_did))] + refresh_nav_bars(state) + update_topbar_js_params(state)

    if not _state_can_manage_preset_store(state):
        try:
            gr.Info("Please sign in.")
        except Exception:
            pass
        return [dataset_update(samples=get_preset_samples(user_did))] + refresh_nav_bars(state) + update_topbar_js_params(state)

    if not delete_paths:
        try:
            gr.Info("Delete failed: unable to locate user directory")
        except Exception:
            pass
        return [dataset_update(samples=get_preset_samples(user_did))] + refresh_nav_bars(state) + update_topbar_js_params(state)

    deleted = []
    failed = []
    for preset_path in delete_paths:
        try:
            os.remove(preset_path)
            deleted.append(preset_path)
        except Exception as e:
            failed.append((preset_path, e))

    _invalidate_preset_store_cache(user_did)
    try:
        model_loader.presets_model_list.pop(display_name, None)
        model_loader.presets_model_list.pop(display_name[:-1], None)
        getattr(model_loader, "presets_resource_bundles", {}).pop(display_name, None)
        getattr(model_loader, "presets_resource_bundles", {}).pop(display_name[:-1], None)
    except Exception:
        pass

    if failed:
        for preset_path, err in failed:
            logger.error(f"[Preset Management] Failed to delete user preset {preset_path}: {err}")
        try:
            gr.Info(f"Delete failed: {display_name}")
        except Exception:
            pass
    elif deleted:
        logger.info(f"[Preset Management] Deleted user preset {display_name}: {deleted}")
        try:
            gr.Info(f"Deleted preset: {display_name}")
        except Exception:
            pass

    if isinstance(state, dict):
        state["preset_store"] = True
        state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1

    return [dataset_update(samples=get_preset_samples(user_did))] + refresh_nav_bars(state) + update_topbar_js_params(state)

def admin_sync_to_guest(state, catalog='presets'):
    user_did = _state_user_did(state)
    if user_did and shared.token.is_admin(user_did):
        if catalog == 'presets':
            nav_name_list = get_preset_name_list(state["__session"], state["ua_hash"])
            shared.token.set_local_vars_for_guest("user_presets", nav_name_list, state["__session"], state["ua_hash"])
    current_time = datetime.now().strftime("%H:%M:%S")
    admin_sync_title = 'Sync presets nav to guest' if state["__lang"]!='cn' else '同步预置导航给游客'
    logger.info(f'Sync presets nav to guest: {current_time}')
    return f'{admin_sync_title}({current_time})'



def _resolve_engine_disvisible_for_state(state):
    try:
        if not isinstance(state, dict):
            return []
        preset_prepared = state.get("__preset_prepared", {})
        if not isinstance(preset_prepared, dict):
            preset_prepared = {}
        engine_data = preset_prepared.get("engine", {})
        if not isinstance(engine_data, dict):
            engine_data = {}
        engine_display = preset_prepared.get(
            "Backend Engine",
            preset_prepared.get(
                "backend_engine",
                modules.flags.task_class_mapping.get(engine_data.get("backend_engine", "Fooocus"), "SDXL-Fooocus"),
            ),
        )
        template_engine = modules.flags.get_taskclass_by_fullname(str(engine_display)) if engine_display else None
        if not template_engine:
            template_engine = engine_data.get("backend_engine") or state.get("backend_engine") or state.get("engine") or "Fooocus"
        default_params = modules.flags.get_engine_default_params(template_engine)
        disvisible = engine_data.get("disvisible", default_params.get("disvisible", []))
        if not isinstance(disvisible, list):
            return []
        return list(disvisible)
    except Exception:
        return []


def _resolve_engine_disinteractive_for_state(state):
    try:
        if not isinstance(state, dict):
            return []
        preset_prepared = state.get("__preset_prepared", {})
        if not isinstance(preset_prepared, dict):
            preset_prepared = {}
        engine_data = preset_prepared.get("engine", {})
        if not isinstance(engine_data, dict):
            engine_data = {}
        engine_display = preset_prepared.get(
            "Backend Engine",
            preset_prepared.get(
                "backend_engine",
                modules.flags.task_class_mapping.get(engine_data.get("backend_engine", "Fooocus"), "SDXL-Fooocus"),
            ),
        )
        template_engine = modules.flags.get_taskclass_by_fullname(str(engine_display)) if engine_display else None
        if not template_engine:
            template_engine = engine_data.get("backend_engine") or state.get("backend_engine") or state.get("engine") or "Fooocus"
        default_params = modules.flags.get_engine_default_params(template_engine)
        disinteractive = engine_data.get("disinteractive", default_params.get("disinteractive", []))
        if not isinstance(disinteractive, list):
            return []
        result = list(disinteractive)
        scene_frontend = engine_data.get("scene_frontend", None)
        if not isinstance(scene_frontend, dict):
            scene_frontend = state.get("scene_frontend", None)
        if _scene_standard_steps_readonly(scene_frontend) and "overwrite_step" not in result:
            result.append("overwrite_step")
        return result
    except Exception:
        return []


def _main_param_update_with_engine_visibility(update, control_name, engine_disvisible, engine_disinteractive):
    # Keep Gradio 6 controls mounted; javascript/topbar.js applies the visible state.
    interactive = control_name not in set(engine_disinteractive or [])
    if isinstance(update, dict):
        next_update = dict(update)
        next_update.pop("visible", None)
        next_update["interactive"] = interactive
        return next_update
    if update is None:
        return gr_update(interactive=interactive)
    return gr_update(value=update, interactive=interactive)


def _coerce_scene_default_number(value, minimum=None, maximum=None, step=None):
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


def _scene_value_by_theme(scene_frontend, theme, key, default):
    if not isinstance(scene_frontend, dict):
        return default
    try:
        return modules.flags.get_value_by_scene_theme({"scene_frontend": scene_frontend}, theme, key, default)
    except Exception:
        value = scene_frontend.get(key, default)
        if isinstance(value, dict):
            return value.get(theme, next(iter(value.values()), default))
        return value


def get_scene_lora_defaults(state_params, scene_theme=None):
    if not isinstance(state_params, dict):
        return None
    scene_frontend = state_params.get("scene_frontend")
    if not isinstance(scene_frontend, dict):
        return None
    theme = scene_theme or state_params.get("scene_theme") or state_params.get("__scene_theme")
    loras = _scene_value_by_theme(scene_frontend, theme, "loras", None)
    return loras if isinstance(loras, (list, tuple)) else None


def _preferred_scene_theme_for_preset(state_params, preset):
    if not isinstance(state_params, dict):
        return None
    target_preset = str(preset or "").strip()
    theme_owner = str(state_params.get("__scene_theme_preset") or "").strip()
    if not target_preset or theme_owner != target_preset:
        return None
    preferred = state_params.get("__scene_theme") or state_params.get("scene_theme")
    return preferred if isinstance(preferred, str) and preferred.strip() else None


def _resolve_scene_theme(scene_frontend, current_theme=None):
    themes = scene_frontend.get("theme", []) if isinstance(scene_frontend, dict) else []
    if isinstance(themes, str):
        theme_list = [themes] if themes else []
    elif isinstance(themes, (list, tuple)):
        theme_list = [theme for theme in themes if isinstance(theme, str) and theme]
    else:
        theme_list = []
    if isinstance(current_theme, str) and current_theme and (not theme_list or current_theme in theme_list):
        return current_theme
    return theme_list[0] if theme_list else ""


def _resolve_scene_generation_theme(state_params, scene_frontend, component_theme=None):
    """Resolve the generation theme from the current preset-owned state."""
    if not isinstance(scene_frontend, dict):
        return component_theme
    if isinstance(state_params, dict):
        preset = str(state_params.get("__preset") or "").strip()
        theme_owner = str(state_params.get("__scene_theme_preset") or "").strip()
        state_theme = state_params.get("scene_theme") or state_params.get("__scene_theme")
        if isinstance(state_theme, str) and state_theme.strip() and (not theme_owner or not preset or theme_owner == preset):
            resolved = _resolve_scene_theme(scene_frontend, state_theme)
            if resolved:
                return resolved
    return _resolve_scene_theme(scene_frontend, component_theme)


def _resolve_scene_generation_switch_option3(scene_frontend, scene_theme, component_value):
    if not isinstance(scene_frontend, dict):
        return component_value
    if 'scene_switch_option3' not in scene_frontend.get('disinteractive', []):
        return component_value
    return bool(_scene_value_by_theme(scene_frontend, scene_theme, 'switch_option3', False))


def _scene_number_default_specs():
    return [
        ("scene_var_number", "var_number", 0),
        ("scene_var_number2", "var_number2", 1),
        ("scene_var_number3", "var_number3", 0.0),
        ("scene_var_number4", "var_number4", 0.0),
        ("scene_var_number5", "var_number5", 0.0),
        ("scene_var_number6", "var_number6", 0.0),
        ("scene_var_number7", "var_number7", 0),
        ("scene_var_number8", "var_number8", 0),
        ("scene_var_number9", "var_number9", 0),
        ("scene_var_number10", "var_number10", 0),
        ("scene_video_duration", "video_duration", 5.0),
        ("scene_steps", "scene_steps", 30),
    ]


def _scene_standard_overwrite_step_default_from_state(state):
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


def _build_scene_default_payload(scene_frontend, scene_theme, overwrite_step_default=None):
    if not isinstance(scene_frontend, dict):
        return {}

    payload = {"scene_theme": scene_theme}
    payload["scene_additional_prompt"] = _scene_value_by_theme(scene_frontend, scene_theme, "additional_prompt", "")
    payload["scene_additional_prompt_2"] = _scene_value_by_theme(scene_frontend, scene_theme, "additional_prompt_2", "")

    for control_name, key, default in _scene_number_default_specs():
        if key == "scene_steps":
            minimum = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "min", -1)
            maximum = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "max", 200)
            step = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "step", 1)
            fallback = overwrite_step_default if overwrite_step_default is not None else default
            value = _canvas_scene_generation_step(scene_frontend, scene_theme, fallback)
        else:
            minimum = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_min", None)
            maximum = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_max", None)
            step = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_step", None)
            value = _scene_value_by_theme(scene_frontend, scene_theme, key, default)
        payload[control_name] = _coerce_scene_default_number(value, minimum, maximum, step)

    for index in range(1, 5):
        key = f"switch_option{index}"
        payload[f"scene_switch_option{index}"] = bool(_scene_value_by_theme(scene_frontend, scene_theme, key, False))

    aspect_ratios = _scene_value_by_theme(scene_frontend, scene_theme, "aspect_ratio", [])
    try:
        aspect_ratios = modules.flags.normalize_scene_aspect_ratio_list(aspect_ratios)
    except Exception:
        aspect_ratios = []
    payload["scene_aspect_ratio"] = aspect_ratios[0] if aspect_ratios else ""
    payload["scene_image_number"] = _scene_value_by_theme(scene_frontend, scene_theme, "image_number", 1)
    return payload


def _build_scene_control_props(scene_frontend, scene_theme):
    if not isinstance(scene_frontend, dict):
        return {}
    props = {}
    steps_readonly = _scene_standard_steps_readonly(scene_frontend)
    for control_name, key, _default in _scene_number_default_specs():
        control_props = {}
        label_default = "Scene Steps" if key == "scene_steps" else None
        label = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_title", label_default)
        if key == "scene_steps":
            minimum = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "min", -1)
            maximum = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "max", 200)
            step = _canvas_scene_generation_step_bound(scene_frontend, scene_theme, "step", 1)
        else:
            minimum = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_min", None)
            maximum = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_max", None)
            step = _scene_value_by_theme(scene_frontend, scene_theme, f"{key}_step", None)
        if label is not None:
            control_props["label"] = label
        if minimum is not None:
            control_props["minimum"] = minimum
        if maximum is not None:
            control_props["maximum"] = maximum
        if step is not None:
            control_props["step"] = step
        if key == "scene_steps":
            control_props["interactive"] = not steps_readonly
        if control_props:
            props[control_name] = control_props
            if key == "scene_steps":
                props["overwrite_step"] = dict(control_props)
    return props


def update_topbar_js_params(state, include_canvas_catalogs=True):
    regen_preset_restore = bool(state.pop("__regen_preset_restore", False))
    filtered_preset_name_list = _get_effective_nav_preset_list(state)
    nav_user_did = _state_user_did(state)
    filtered_preset_display_name_list = [_append_status_marker(name, nav_user_did) for name in filtered_preset_name_list]
    filtered_nav_name_list_str = ','.join(filtered_preset_display_name_list)

    if "__lang" not in state:
        state["__lang"] = ads.get_user_default("__lang", state, args_manager.args.language)
    if "__theme" not in state:
        state["__theme"] = ads.get_user_default("__theme", state, args_manager.args.theme)
    if "__preset" not in state:
        state["__preset"] = config.preset
    if "__webpath" not in state:
        state["__webpath"] = f'{args_manager.args.webroot}/file={os.getcwd()}'
    if "__preset_url" not in state:
        state["__preset_url"] = get_preset_inc_url(state.get("__preset", config.preset), state.get("__lang"))
    if "__finished_nums_pages" not in state:
        state["__finished_nums_pages"] = "0,0"
    if "engine_type" not in state:
        state["engine_type"] = "image"
    if "preset_store" not in state:
        state["preset_store"] = False
    current_preset_name = state.get("__preset", config.preset)
    current_preset_marked = _append_status_marker(current_preset_name, nav_user_did) if nav_user_did else current_preset_name
    current_preset_missing = isinstance(current_preset_marked, str) and current_preset_marked.endswith(PRESET_MISSING_MARKER)
    preset_prepared = state.get("__preset_prepared", {}) if isinstance(state, dict) else {}
    if not isinstance(preset_prepared, dict):
        preset_prepared = {}
    scene_frontend = state.get("scene_frontend", {}) if isinstance(state, dict) else {}
    scene_disvisible = _scene_disvisible_with_optional_inputs(scene_frontend)
    engine_disvisible = _resolve_engine_disvisible_for_state(state)
    backend_engine = state.get("backend_engine", state.get("engine"))
    hidden_models = set(engine_disvisible if isinstance(engine_disvisible, list) else [])
    hidden_models.update(scene_disvisible)
    if "scene_base_model" in hidden_models:
        hidden_models.add("base_model")
    if "scene_refiner_model" in hidden_models:
        hidden_models.add("refiner_model")
    preset_refiner_model = (
        preset_prepared.get("refiner_model")
        or preset_prepared.get("Refiner Model")
        or preset_prepared.get("default_refiner")
        or config.default_refiner_model_name
    )
    refiner_switch_visible = backend_engine == "Fooocus" and "refiner_model" not in hidden_models and preset_refiner_model != "None"
    scene_theme_owner = str(state.get("__scene_theme_preset") or "").strip()
    current_preset = str(state.get("__preset") or "").strip()
    preferred_scene_theme = state.get("scene_theme", None) if current_preset and scene_theme_owner == current_preset else None
    scene_theme = _resolve_scene_theme(scene_frontend, preferred_scene_theme)
    resolved_scene_theme_owner = current_preset if scene_theme else ""
    scene_task_method = ""
    if isinstance(scene_frontend, dict):
        raw_task_method = scene_frontend.get("task_method", "")
        if isinstance(raw_task_method, dict):
            if isinstance(scene_theme, str) and scene_theme in raw_task_method:
                scene_task_method = raw_task_method.get(scene_theme, "")
            elif raw_task_method:
                scene_task_method = next(iter(raw_task_method.values()), "")
        elif isinstance(raw_task_method, list):
            scene_task_method = raw_task_method[0] if raw_task_method else ""
        else:
            scene_task_method = raw_task_method

    def _resolve_resolution_control_profile(scene_frontend, scene_theme):
        if not isinstance(scene_frontend, dict):
            return {}
        raw = scene_frontend.get("resolution_control", {})
        if isinstance(raw, dict) and isinstance(scene_theme, str) and isinstance(raw.get(scene_theme), dict):
            raw = raw.get(scene_theme, {})
        if not isinstance(raw, dict):
            raw = {}
        profile = dict(raw)
        scene_disinteractive = scene_frontend.get("disinteractive", [])
        if not isinstance(scene_disinteractive, list):
            scene_disinteractive = []
        if (
            "resolution_control" in scene_disinteractive
            or "scene_resolution_control" in scene_disinteractive
            or "scene_aspect_ratio" in scene_disinteractive
        ):
            profile["interactive"] = False
        mode = str(profile.get("mode", "") or "").strip()
        if not mode:
            return {}
        profile["mode"] = mode
        profile.setdefault("source", "scene_canvas")
        profile.setdefault("interactive", True)
        aspect_ratios = scene_frontend.get("aspect_ratio", []) if isinstance(scene_frontend, dict) else []
        if isinstance(aspect_ratios, dict):
            aspect_ratios = aspect_ratios.get(scene_theme, []) if isinstance(scene_theme, str) else []
        if isinstance(aspect_ratios, str):
            aspect_ratios = [aspect_ratios]
        if isinstance(aspect_ratios, (list, tuple)):
            profile.setdefault("aspect_ratios", [str(item) for item in aspect_ratios if str(item or "").strip()])
        try:
            profile["base_width"] = int(profile.get("base_width", 640) or 640)
            profile["base_height"] = int(profile.get("base_height", 640) or 640)
        except Exception:
            profile["base_width"] = 640
            profile["base_height"] = 640
        try:
            profile["quantize"] = int(profile.get("quantize", modules.flags.default_resolution_quantize_step) or modules.flags.default_resolution_quantize_step)
        except Exception:
            profile["quantize"] = modules.flags.default_resolution_quantize_step
        if profile["quantize"] not in modules.flags.resolution_quantize_steps:
            profile["quantize"] = modules.flags.default_resolution_quantize_step
        return profile

    include_canvas_catalogs = bool(include_canvas_catalogs)
    canvas_preset_catalog = {}
    canvas_model_catalog = {}
    preset_store_meta_revision = ""
    if include_canvas_catalogs or state.get("preset_store"):
        try:
            canvas_preset_catalog = _build_preset_store_meta(state, copy_cached=include_canvas_catalogs)
            preset_store_meta_revision = _get_preset_store_meta_revision(state)
        except Exception:
            canvas_preset_catalog = {}
    if include_canvas_catalogs:
        try:
            use_model_filter_for_catalog = ads.get_user_default("use_model_filter_checkbox", state, True)
            catalog_model_filenames, catalog_lora_filenames, catalog_vae_filenames, catalog_clip_filenames = config.update_files(
                backend_engine or "Fooocus",
                state.get("task_method"),
                use_model_filter=use_model_filter_for_catalog,
            )
            canvas_model_catalog = {
                "engine": backend_engine,
                "backend_engine": backend_engine,
                "task_method": state.get("task_method"),
                "use_model_filter": bool(use_model_filter_for_catalog),
                "model_filenames": list(catalog_model_filenames or []),
                "refiner_filenames": ["None"] + list(catalog_model_filenames or []),
                "clip_filenames": [modules.flags.default_clip] + list(catalog_clip_filenames or []),
                "vae_filenames": [modules.flags.default_vae] + list(catalog_vae_filenames or []),
                "upscale_model_filenames": ["default"] + list(getattr(config, "upscale_model_filenames", []) or []),
                "lora_filenames": ["None"] + list(catalog_lora_filenames or []),
            }
        except Exception:
            canvas_model_catalog = {}

    current_user_did = _state_user_did(state)
    current_access_status = get_identity_access_status(current_user_did) if current_user_did else None
    if is_local_mode():
        user_role = "local"
    elif not current_user_did or shared.token.is_guest(current_user_did):
        user_role = "guest"
    elif shared.token.is_admin(current_user_did):
        user_role = "admin"
    elif current_access_status in ("pending", "blocked"):
        user_role = current_access_status
    else:
        user_role = "member"
    if user_role == "guest" and not is_local_mode() and state.get("preset_store"):
        state["preset_store"] = False
        state["__preset_store_seq"] = int(state.get("__preset_store_seq", 0) or 0) + 1

    try:
        scene_aspect_ratios = modules.flags.normalize_scene_aspect_ratio_list(
            _scene_value_by_theme(scene_frontend, scene_theme, "aspect_ratio", [])
        )
    except Exception:
        scene_aspect_ratios = []

    system_params= dict(
        __preset=state.get("__preset"),
        __preset_missing=current_preset_missing,
        __preset_switched=bool(state.get("__preset_switched", False)),
        __regen_preset_restore=regen_preset_restore,
        __identity_session_seq=int(state.get("__identity_session_seq", 0) or 0),
        __preset_store_seq=int(state.get("__preset_store_seq", 0) or 0),
        __theme=state.get("__theme"),
        __is_scene_frontend=("scene_frontend" in state),
        __engine_disvisible=engine_disvisible,
        __scene_disvisible=scene_disvisible,
        __scene_theme=scene_theme,
        __scene_theme_preset=resolved_scene_theme_owner,
        __scene_theme_revision=int(state.get("__scene_theme_revision", 0) or 0),
        __scene_defaults=_build_scene_default_payload(
            scene_frontend,
            scene_theme,
            _scene_standard_overwrite_step_default_from_state(state),
        ),
        __scene_aspect_ratios=scene_aspect_ratios,
        __scene_control_props=_build_scene_control_props(scene_frontend, scene_theme),
        __scene_task_method=str(scene_task_method or ""),
        __scene_canvas_mask_disabled=_resolve_scene_canvas_mask_disabled(scene_frontend, scene_theme),
        __resolution_control_profile=_resolve_resolution_control_profile(scene_frontend, scene_theme),
        __nav_name_list=filtered_nav_name_list_str,  # 使用过滤后的预设列表
        sstoken=state["sstoken"],
        user_name=_state_user_nickname(state),
        user_did=current_user_did,
        user_role=user_role,
        access_mode=get_access_mode(),
        upstream=shared.upstream_did,
        task_class_name=state["engine"],
        __backend_engine=backend_engine,
        backend_engine=backend_engine,
        engine=backend_engine,
        task_method=state.get("task_method"),
        __refiner_switch_visible=refiner_switch_visible,
        preset_store=state["preset_store"],
        __message='' if "__message" not in state else state["__message"],
        __compat_fallback_notice=str(state.get("__compat_fallback_notice", "") or ""),
        __compat_fallback_notice_token=str(state.get("__compat_fallback_notice_token", "") or ""),
        __webpath=state["__webpath"],
        __lang=state.get("__lang"),
        __preset_url=state.get("__preset_url"),
        __finished_nums_pages=state.get("__finished_nums_pages", "0,0"),
        __gallery_engine_type=state.get("__gallery_engine_type", state.get('engine_type', 'image')),
        __skip_gallery_browser_refresh_once=bool(state.get("__skip_gallery_browser_refresh_once", False)),
        gallery_frost_enabled=ads.get_user_default("gallery_frost_enabled", state, True),
        user_qr="" if 'user_qr' not in state else state.pop("user_qr"),
        engine_type=state.get('engine_type', 'image'),
        no_welcome_image=ads.get_admin_default("no_welcome_checkbox"),
        missing_model_filter=ads.get_admin_default("missing_model_filter_checkbox")
        )
    if include_canvas_catalogs:
        system_params["__canvas_preset_catalog"] = canvas_preset_catalog
        system_params["__canvas_model_catalog"] = canvas_model_catalog
    if state.get("preset_store"):
        system_params["__preset_store_meta_revision"] = preset_store_meta_revision
        # The component visibility update and the JS status callback are separate
        # browser updates. Always include the catalog while opening the store so a
        # delayed or discarded earlier callback cannot leave an empty pool.
        system_params["__preset_store_meta"] = copy.deepcopy(canvas_preset_catalog)
    return [system_params]


def export_identity(state):
    user_did = _state_user_did(state)
    if user_did and not shared.token.is_guest(user_did):
        state["user_qr"] = export_identity_qrcode_svg(user_did)
        #logger.info(f'user_qrcode_svg: {state["user_qr"]}')
    elif is_local_mode():
        admin_qr = shared.token.export_isolated_admin_qrcode_svg()
        if admin_qr:
            state["user_qr"] = admin_qr
            #logger.info(f'admin_user_qrcode_svg: {state["user_qr"]}')
    return update_topbar_js_params(state)[0]


def update_history_link(user_did, local_access):
    lang = normalize_ui_lang(getattr(args_manager.args, "language", "en"))
    theme = "dark" if str(getattr(args_manager.args, "theme", "light") or "light").lower().startswith("dark") else "light"
    webroot = str(getattr(args_manager.args, "webroot", "") or "").rstrip("/")
    return gr.update(
        value=f'<a href="{webroot}/simpleai/gallery/app?__theme={theme}&__lang={lang}" target="_blank"><i class="fa fa-images"></i> Media Library</a>'
    )

def update_comfyd_url(state):
    listen_host = str(getattr(args_manager.args, "listen", "") or "127.0.0.1")
    loopback_port = shared.sysinfo["loopback_port"]
    webroot = args_manager.args.webroot
    listen_was_explicit = any(arg == "--listen" or arg.startswith("--listen=") for arg in sys.argv)
    is_loopback_host = listen_host in ("127.0.0.1", "localhost", "::1")

    if is_local_mode() and (not listen_was_explicit or is_loopback_host):
        entry_url = f'http://127.0.0.1:{loopback_port}{webroot}/'
        return f'<a href="{entry_url}" target="_blank">{entry_url}</a><div>Click and Entry embedded ComfyUI from here.</div>'

    entry_url = f'http://{listen_host}:{loopback_port}{webroot}/'
    user_did = state["user"].get_did() if "user" in state and state["user"] else None

    entry_point = ""
    entry_point_id = comfyd.get_entry_point_id()
    if entry_point_id is not None and user_did:
        try:
            entry_point = shared.token.get_entry_point(user_did, entry_point_id) or ""
            if not entry_point and hasattr(shared.token, "get_admin_did"):
                admin_did = shared.token.get_admin_did()
                if admin_did:
                    entry_point = shared.token.get_entry_point(admin_did, entry_point_id) or ""
            if not entry_point:
                sys_did = state.get("sys_did") if isinstance(state, dict) else None
                if sys_did and sys_did != user_did:
                    entry_point = shared.token.get_entry_point(sys_did, entry_point_id) or ""
        except Exception:
            entry_point = ""

    if not entry_point:
        hour_key = datetime.now().strftime("%Y%m%d%H")
        suffix = state.get("__session") or state.get("ua_hash") or (user_did or "guest")
        entry_point = f"{hour_key}_{suffix}"

    return f'<a href="{entry_url}?p={entry_point}" target="_blank">{entry_url}</a><div>Click and Entry embedded ComfyUI from here.</div>'
   
identity_introduce = '''
<div style="line-height:1.55">
  <div style="font-weight:600;margin-bottom:6px;">当前为游客</div>
  <div style="margin-bottom:10px;">点击“身份管理”绑定身份，可解锁更多功能。</div>
  <details style="margin:6px 0;">
    <summary style="cursor:pointer;">绑定身份后能做什么</summary>
    <div style="margin-top:6px;">
      1，为本机启用多用户模式，“预置包”变更为“我的预置”，私有化排列<br>
      2，独立的出图存储空间和日志历史页，保障隐私安全。<br>
      3，可将当前环境参数保存为个人定制的预置包。<br>
      4，解锁更多的功能配置管理和个性化服务。<br>
    </div>
  </details>
  <details style="margin:6px 0;">
    <summary style="cursor:pointer;">管理员与协助</summary>
    <div style="margin-top:6px;">
      系统指定首个绑定身份者为管理员，赋予超级管理权限：<br>
      1，可管理游客的预置导航及下载预置包所需模型。<br>
      2，管理高级系统设置，最高权限分配系统资源。<br>
      更多管理需求可以入QQ群:1005085136 进行交流。<br>
    </div>
  </details>
  <details style="margin:6px 0;">
    <summary style="cursor:pointer;">身份机制说明</summary>
    <div style="margin-top:6px;">
      系统遵循分布式身份管理机制，即：<br>
      1，用户掌控身份私钥，授权本地部署的节点使用身份。<br>
      2，本地部署的AI节点管理多用户相互隔离的数字空间。<br>
      3，上游社区节点保存加密身份副本用于追溯和自证。<br>
      在多方协作下共同保障隐私安全、身份可信及跨节点互认。以此构建“和而不同”的开源社区生态。<br>
    </div>
  </details>
</div>
'''

def update_after_identity_all(state):
    results = update_after_identity(state)
    results += get_all_user_default(state)
    return results

def build_identity_introduce_html(state):
    user = state.get("user") if isinstance(state, dict) else None
    user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
    nickname = user.get_nickname() if user is not None and hasattr(user, "get_nickname") else "Unknown"
    lang = normalize_ui_lang(state.get("__lang") if isinstance(state, dict) else None)
    access_mode = get_access_mode()
    is_guest = True if not user_did else shared.token.is_guest(user_did)
    is_admin = False if not user_did else shared.token.is_admin(user_did)

    if access_mode == "local":
        if lang == "en":
            title = "Currently in Local Mode"
            summary = "Local mode starts with full features enabled and is intended for complete single-machine use."
            details_title = "How to switch to Multi-user Mode"
            details_body = (
                "1. At this stage, you can use all local features without binding an identity.<br>"
                "2. If you want this machine to switch into the admin / user / guest multi-user flow, please actively verify an admin identity in Identity Management.<br>"
                "3. After admin verification succeeds, the multi-user permission chain becomes active. If you plan to expose this node to other clients, it is recommended to restart in multi-user mode afterward."
            )
            extra_title = "Local Mode Notes"
            extra_body = (
                "1. Local mode prioritizes a complete single-machine workflow and does not rely on remote-service restrictions.<br>"
                "2. Any guest label shown here only means the current browser has not bound a multi-user identity yet. It does not reduce local capabilities."
            )
        else:
            title = '当前为本机模式'
            summary = '本机模式默认开放完整功能，适合单机完整工作流。'
            details_title = '如何切换到多用户模式'
            details_body = (
                '1. 当前阶段无需绑定身份，也能完整使用本机功能。<br>'
                '2. 如需把这台机器切换为管理员 / 用户 / 游客的多用户模式，请在“身份管理”中主动验证管理员身份。<br>'
                '3. 管理员验证成功后，多用户权限链才会生效；如需对外开放访问，建议随后重启并按多用户方式启动。'
            )
            extra_title = '本机模式说明'
            extra_body = (
                '1. 本机模式优先服务单机完整工作流，不以远程权限隔离为基础。<br>'
                '2. 此时界面中的“游客”仅表示当前浏览器尚未绑定多用户身份，不影响本机完整能力。'
            )
    else:
        if lang == "en":
            if is_admin:
                title = "Currently Signed in as Admin"
                summary = f"This browser is bound to the admin identity: {nickname}. You are in multi-user mode and can manage system settings, model downloads, and identity routing."
            elif is_guest:
                title = "Currently Signed in as Guest"
                summary = "This node is already in multi-user mode, but the current browser is still a guest. Guest access is limited for presets, model downloads, and personal workspace features."
            else:
                access_status = get_identity_access_status(user_did)
                if access_status == "pending":
                    title = "Waiting for Admin Approval"
                    summary = f"This browser is bound to the user identity: {nickname}, but Admin has not approved it yet. Image generation, model downloads, and personal resource management are unavailable."
                elif access_status == "blocked":
                    title = "Identity Disabled"
                    summary = f"This browser is bound to the user identity: {nickname}, but this identity has been rejected or disabled by Admin."
                else:
                    title = "Currently Signed in as Verified User"
                    summary = f"This browser is bound to the user identity: {nickname}. You are in multi-user mode with your own personal workspace and permission scope."

            details_title = "What Multi-user Mode Provides"
            details_body = (
                "1. Different identities have isolated presets, output records, personal Wildcards, and configuration scope.<br>"
                "2. Admin can maintain system-level settings, resource policies, and guest-visible content.<br>"
                "3. Verified users work inside their own permission scope with their own personal resources."
            )
            extra_title = "Identity Mechanism"
            extra_body = (
                "1. Identity is bound to the current browser and node session, and is used to distinguish admin / user / guest.<br>"
                "2. To switch identity, unbind first. Exported identity QR codes can be used for future rebinding."
            )
        else:
            if is_admin:
                title = '当前为管理员身份'
                summary = f'当前浏览器已绑定管理员身份：{nickname}。您正在使用多用户模式，可管理系统设置、模型下载和身份链路。'
            elif is_guest:
                title = '当前为游客身份'
                summary = '当前已进入多用户模式，但本浏览器仍是游客身份。游客会受到预置、模型下载和个人空间权限限制。'
            else:
                access_status = get_identity_access_status(user_did)
                if access_status == "pending":
                    title = '正在等待管理员批准'
                    summary = f'当前浏览器已绑定用户身份：{nickname}，但管理员尚未批准。批准前不能生图、下载模型或管理个人资源。'
                elif access_status == "blocked":
                    title = '当前身份已停用'
                    summary = f'当前浏览器已绑定用户身份：{nickname}，但该身份已被管理员拒绝或停用。'
                else:
                    title = '当前为已验证用户'
                    summary = f'当前浏览器已绑定用户身份：{nickname}。您正在使用多用户模式，并拥有独立的个人空间与权限范围。'

            details_title = '多用户模式能做什么'
            details_body = (
                '1. 不同身份拥有各自独立的预置、输出记录、个人 Wildcards 和配置范围。<br>'
                '2. 管理员可以维护系统级设置、资源策略和游客可见内容。<br>'
                '3. 已验证用户会在自己的权限范围内使用个人配置与资源。'
            )
            extra_title = '身份机制说明'
            extra_body = (
                '1. 身份会绑定到当前浏览器与节点会话，用于区分管理员 / 用户 / 游客。<br>'
                '2. 如需更换身份，请先解绑；导出的身份二维码可用于后续再次绑定。'
            )

    recovery_html = get_admin_recovery_guide(lang) if access_mode == "multi-user" and is_guest else ""
    return f"""
<div style="line-height:1.55">
  <div style="font-weight:600;margin-bottom:6px;">{title}</div>
  <div style="margin-bottom:10px;">{summary}</div>
  <details style="margin:6px 0;">
    <summary style="cursor:pointer;">{details_title}</summary>
    <div style="margin-top:6px;">{details_body}</div>
  </details>
  <details style="margin:6px 0;">
    <summary style="cursor:pointer;">{extra_title}</summary>
    <div style="margin-top:6px;">{extra_body}</div>
  </details>
  {recovery_html}
</div>
"""
def update_after_identity(state):

    results = refresh_nav_bars(state)
    results += update_after_identity_sub(state)

    return results

_AIO_STYLE_TRANSFER_TASK_METHODS = {
    'anima_aio',
    'qwen_aio_cn',
    'z_image_turbo_aio_cn',
}


def get_allowed_ip_types(engine, task_method=None):
    ip_list = list(modules.flags.ip_list if engine in ['Fooocus', 'SDXL', 'Flux', 'Comfy', 'Wan', 'Qwen', 'Z-image'] else modules.flags.ip_list[:-1])
    if engine in ['Wan', 'Qwen', 'Z-image'] or task_method == 'flux2_aio_cn':
        ip_list = ip_list[1:3] + ip_list[-1:]
    if task_method in ['il_v_pre_aio', 'chenkin_noob_aio']:
        ip_list = ip_list[:3] + ip_list[-1:]
    if task_method == 'anima_aio':
        ip_list = [modules.flags.cn_ip, modules.flags.cn_canny, modules.flags.cn_cpds, modules.flags.cn_pose]
    elif task_method in _AIO_STYLE_TRANSFER_TASK_METHODS and modules.flags.cn_ip not in ip_list:
        ip_list.insert(0, modules.flags.cn_ip)
    return ip_list


def update_after_identity_sub(state, lightweight_nav=False, skip_output_refresh=False, skip_system_params=False):
    #[gallery_index, index_radio, gallery_index_stat, preset_store, preset_store_list, history_link, identity_introduce, configure_panel, local_system_tab, user_access_tab, admin_panel, admin_link, system_params] + ip_types
    max_per_page = state["__max_per_page"]
    max_catalog = state["__max_catalog"]
    nickname = _state_user_nickname(state, "Unknown")
    user_did = _state_user_did(state)
    engine_type = state["engine_type"]
    state["__gallery_engine_type"] = engine_type
    logger.info(f'Session identity/当前身份: {nickname}({user_did}{", admin" if user_did and shared.token.is_admin(user_did) else ""}), session({state["__session"]})')
    if skip_output_refresh:
        output_list = state.get("__output_list", [])
        finished_nums_pages = state.get("__finished_nums_pages", "0,0")
    else:
        output_list, finished_nums, finished_pages = gallery_util.refresh_output_list(max_per_page, max_catalog, user_did, engine_type)
        state.update({"__output_list": output_list})
        state.update({"__finished_nums_pages": f'{finished_nums},{finished_pages}'})
        finished_nums_pages = state["__finished_nums_pages"]
        if output_list and engine_type == 'image':
            try:
                output_index = output_list[0].split('/')[0]
                gallery_util.refresh_images_catalog(output_index, True, user_did)
            except Exception as e:
                logger.error(f'Error in identity gallery prewarm: {e}')

    is_guest = shared.token.is_guest(user_did) if user_did else True
    is_admin = shared.token.is_admin(user_did) if user_did else False
    is_privileged_guest = is_guest and is_local_mode()

    if (not lightweight_nav) and user_did:
        try:
            io_paths = update_comfyd_io_paths(user_did)
            if isinstance(io_paths, (list, tuple)) and len(io_paths) >= 3:
                _, comfyd_inputs, comfyui_outputs = io_paths[:3]
                logger.info(f"Setting ComfyUI IO directories: inputs={comfyd_inputs}, outputs={comfyui_outputs}")
        except Exception as e:
            logger.warning(f"Error updating comfyd IO directories: {e}")

    if skip_output_refresh:
        catalog_visible = should_show_finished_catalog(engine_type, output_list)
        results = [gr.update(choices=output_list, value=None)]
        results += [gr.update(visible=catalog_visible)]
        results += [finished_nums_pages]
    else:
        catalog_visible = should_show_finished_catalog(engine_type, output_list)
        results = [gr.update(choices=output_list, value=None), gr.update(visible=catalog_visible)]
        results += [finished_nums_pages]
    results += [gr.update(visible=False if 'preset_store' not in state else state['preset_store'])]
    results += [skip_update() if lightweight_nav else dataset_update(samples=get_preset_samples(user_did))]
    results += [skip_update() if skip_output_refresh else update_history_link(user_did, state["local_access"])]
    if lightweight_nav:
        results += [gr.update(visible=True, value=build_identity_introduce_html(state))]
        results += [gr.update(visible=True)]
        results += [gr.update(visible=is_admin or is_privileged_guest)]
        results += [gr.update(visible=is_admin)]
        results += [gr.update(visible=is_admin or is_privileged_guest)]
        results += [gr.update(visible=is_admin or is_privileged_guest, value=update_comfyd_url(state))]
    else:
        results += [gr.update(visible=True, value=build_identity_introduce_html(state))]
        results += [gr.update(visible=True)]
        results += [gr.update(visible=is_admin or is_privileged_guest)]
        results += [gr.update(visible=is_admin)]
        results += [gr.update(visible=is_admin or is_privileged_guest)]
        results += [gr.update(visible=is_admin or is_privileged_guest, value=update_comfyd_url(state))]
    if skip_system_params:
        results += [skip_update()]
    else:
        results += update_topbar_js_params(state)
    ip_list = get_allowed_ip_types(state["engine"], state.get("task_method"))
    default_controlnet_image_count = config.default_controlnet_image_count if state["engine"]=='Fooocus' else 4
    for image_count in range(default_controlnet_image_count):
        image_count += 1
        ip_value = config.default_ip_types[image_count]
        if ip_value not in ip_list:
            ip_value = ip_list[0] if len(ip_list) > 0 else None
        results.append(gr.update(choices=ip_list, value=ip_value))

    return results

def update_size_and_uov_strength(image, uov_method):
    size_image = update_upscale_size_of_image(image, uov_method)
    # Gradio 6 validates hidden Slider inputs before callbacks, so inactive
    # UOV strength values must stay inside the 0..1 slider range.
    vary_strength = 0.0
    vary_visible = False
    upscale_strength = 0.0
    upscale_visible = False
    if 'Upscale' in uov_method:
        upscale_visible = True
        upscale_strength = 0.2
    if 'Vary' in uov_method:
        vary_visible = True
        if 'Subtle' in uov_method:
            vary_strength = 0.5
        if 'Strong' in uov_method:
            vary_strength = 0.85
    return gr.update(value=size_image), gr.update(visible=vary_visible, value=vary_strength), gr.update(interactive=not 'Fast' in uov_method, visible=upscale_visible, value=upscale_strength)

def update_upscale_size_of_image(image, uov_method):
    if image is not None:
        H, W, C = util.HWC3(image).shape
    else:
        return ''
    match = re.search(r'\((?:Fast )?([\d.]+)x\)', uov_method)
    match_multiple = 1.0 if not match else float(match.group(1))
    match_multiple = match_multiple if match_multiple<4.0 else 4.0 
    width = int(W * match_multiple)
    height = int(H * match_multiple)

    return f'{W} x {H} | {width} x {height}'

def get_all_user_default(state):
    #[backfill_prompt, image_tools_checkbox, disable_preview, disable_intermediate_results, disable_seed_increment, save_final_enhanced_image_only, style_preview_checkbox]
    results = [ads.get_user_default("backfill_prompt", state, config.default_backfill_prompt)]
    image_tools_enabled = ads.get_user_default("image_tools_checkbox", state, True)
    if isinstance(state, dict):
        state["__image_tools_enabled"] = bool(image_tools_enabled)
    results += [image_tools_enabled]
    results += [ads.get_user_default("disable_preview", state, False)]
    results += [ads.get_user_default("disable_intermediate_results", state, False)]
    results += [ads.get_user_default("disable_seed_increment", state, False)]
    results += [ads.get_user_default("save_final_enhanced_image_only", state, False)]
    results += [ads.get_user_default("style_preview_checkbox", state)]
    results += [ads.get_user_default("generate_image_grid", state, False)]
    results += [ads.get_user_default("black_out_nsfw", state, config.default_black_out_nsfw)]
    results += [ads.get_user_default("save_metadata_to_images", state, config.default_save_metadata_to_images)]
    results += [ads.get_user_default("metadata_scheme", state, config.default_metadata_scheme)]
    results += [ads.get_user_default("gallery_frost_enabled", state, True)]
    results += [ads.get_user_default("no_model_modal_checkbox", state, False)]
    results += [ads.get_user_default("lora_auto_send_trigger_words", state, False)]
    use_model_filter = ads.get_user_default("use_model_filter_checkbox", state, True)
    results += [use_model_filter, use_model_filter]
    return results

def get_preferred_output_format(state_params):
    allowed = modules.flags.OutputFormat.list()
    user_did = None
    try:
        user = state_params.get("user", None) if isinstance(state_params, dict) else None
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
    except Exception:
        user_did = None
    if not user_did:
        try:
            user_did = shared.token.get_guest_did()
        except Exception:
            user_did = None

    preset_name = None
    try:
        preset_name = state_params.get("__preset", None) if isinstance(state_params, dict) else None
    except Exception:
        preset_name = None
    if not preset_name:
        preset_name = config.preset

    user_fmt = None
    try:
        raw_user_fmt = ads.get_user_default("output_format", state_params, None)
        if isinstance(raw_user_fmt, str):
            raw_user_fmt = raw_user_fmt.strip()
        if raw_user_fmt and raw_user_fmt not in ["Unknown", "None", "Default"]:
            user_fmt = ads.convert_value(raw_user_fmt)
    except Exception:
        user_fmt = None

    preset_fmt = state_params.get("__preset_output_format", None) if isinstance(state_params, dict) else None
    preset_fmt_loaded = bool(state_params.get("__preset_output_format_loaded", False)) if isinstance(state_params, dict) else False
    try:
        if preset_fmt is None and (not preset_fmt_loaded) and preset_name:
            preset_content = config.try_get_preset_content(str(preset_name), user_did)
            if isinstance(preset_content, dict):
                preset_fmt = preset_content.get("default_output_format", None)
    except Exception:
        preset_fmt = None

    fmt = preset_fmt if preset_fmt in allowed else user_fmt
    if fmt not in allowed:
        fmt = "jpeg"
    try:
        logger.debug(f"[OutputFormat] preset={preset_name}, preset_default={preset_fmt}, user={user_fmt}, final={fmt}")
    except Exception:
        pass
    return fmt

def apply_preferred_output_format(state_params):
    return gr.update(value=get_preferred_output_format(state_params))

def restore_all_defaults(state_params):
    user_keys = ["__lang", "__theme", "backfill_prompt", "image_tools_checkbox", "disable_preview", "disable_intermediate_results", "disable_seed_increment", "save_final_enhanced_image_only", "style_preview_checkbox", "generate_image_grid", "black_out_nsfw", "save_metadata_to_images", "metadata_scheme", "gallery_frost_enabled", "no_model_modal_checkbox", "lora_auto_send_trigger_words", "use_model_filter_checkbox", "output_format"]
    admin_keys = ["comfyd_active_checkbox", "fast_comfyd_checkbox", "dynamic_vram_checkbox", "disable_smart_memory_checkbox", "cache_clear_on_finish_checkbox", "reserved_vram", "cache_ram_enable", "cache_ram", "vlm_checkbox", "vlm_version", "advanced_logs", "wavespeed_strength", "translation_methods", "no_welcome_checkbox", "missing_model_filter_checkbox"]

    try:
        user = state_params.get("user", None) if isinstance(state_params, dict) else None
        user_did = user.get_did() if user is not None and hasattr(user, "get_did") else None
    except Exception:
        user_did = None
    try:
        logger.info(f"[RestoreDefaults] confirm: session={state_params.get('__session', None)}, ua_hash={state_params.get('ua_hash', None)}, did={user_did}")
    except Exception:
        pass

    user_session = state_params.get("__session", None) if isinstance(state_params, dict) else None
    ua_hash = state_params.get("ua_hash", None) if isinstance(state_params, dict) else None
    if not user_session or not ua_hash:
        try:
            gr.Info("Restore failed: missing session/ua_hash (refresh page and retry).")
        except Exception:
            pass
        outputs_len = 1 + 4 + len(get_all_user_default(state_params)) + len(admin_keys) + 1
        return [gr.update(visible=True)] + [skip_update() for _ in range(outputs_len - 1)]

    for key in user_keys:
        try:
            shared.token.set_local_vars(key, "Default", user_session, ua_hash)
        except Exception:
            pass
        try:
            ads.clear_local_setting("user", key)
        except Exception:
            pass
        try:
            ads.cache_vars.pop(f"{user_session}_{key}", None)
        except Exception:
            pass

    for key in admin_keys:
        try:
            shared.token.set_local_admin_vars(key, "", user_session, ua_hash)
        except Exception:
            pass
        try:
            ads.clear_local_setting("admin", key)
        except Exception:
            pass
        try:
            ads.cache_vars.pop(f"admin_{key}", None)
        except Exception:
            pass

    try:
        if "__lang" in state_params:
            del state_params["__lang"]
        if "__theme" in state_params:
            del state_params["__theme"]
    except Exception:
        pass

    try:
        gr.Info("Defaults restored (including admin settings).")
    except Exception:
        pass

    lang_internal = ads.get_user_default("__lang", state_params, args_manager.args.language)
    theme_internal = ads.get_user_default("__theme", state_params, args_manager.args.theme)
    user_defaults = [gr.update(value=v) for v in get_all_user_default(state_params)]

    admin_values_new = []
    for key in admin_keys:
        v = ads.get_admin_default(key)
        if key == "comfyd_active_checkbox":
            if args_manager.args.disable_comfyd or args_manager.args.disable_backend:
                v = False
        elif key == "translation_methods":
            try:
                if v not in modules.flags.translation_methods:
                    v = config.default_translation_methods
            except Exception:
                pass
        admin_values_new.append(v)

    admin_updates = []
    for k, v in zip(admin_keys, admin_values_new):
        if k == "cache_ram":
            try:
                cache_enable = bool(admin_values_new[admin_keys.index("cache_ram_enable")])
            except Exception:
                cache_enable = True
            admin_updates.append(gr.update(value=v, interactive=cache_enable))
        else:
            admin_updates.append(gr.update(value=v))

    fmt = get_preferred_output_format(state_params)
    head_updates = [
        gr.update(visible=False),
        skip_update(),
        gr.update(value=modules.flags.language_radio(lang_internal)),
        gr.update(value=theme_internal),
        skip_update(),
    ]
    return head_updates + user_defaults + admin_updates + [gr.update(value=fmt)]

def get_all_admin_default(currunt_value):
    admin_keys = ['comfyd_active_checkbox', 'fast_comfyd_checkbox', 'dynamic_vram_checkbox', 'disable_smart_memory_checkbox', 'cache_clear_on_finish_checkbox', 'reserved_vram', 'cache_ram_enable', 'cache_ram', 'vlm_checkbox', 'vlm_version', 'advanced_logs', 'wavespeed_strength', 'translation_methods', "no_welcome_checkbox", "missing_model_filter_checkbox"]
    result = []
    for i, admin_key in enumerate(admin_keys):
        admin_value = ads.get_admin_default(admin_key)

        if admin_value == 'None':
            result.append(gr.update(interactive=False))
            continue
        if admin_value == currunt_value[i]:
            result.append(skip_update())
        else:
            if admin_key == 'comfyd_active_checkbox':
                admin_value = 'False' if args_manager.args.disable_comfyd or args_manager.args.disable_backend else admin_value
            elif admin_key == 'translation_methods' and admin_value not in modules.flags.translation_methods:
                admin_value = config.default_translation_methods
            result.append(gr.update(interactive=True, value=admin_value))
    return result


#system_message = get_system_message()

def stop_comfyd_background(comfyd_active_checkbox):
    if comfyd_active_checkbox:
        threading.Thread(target=comfyd.stop).start()
