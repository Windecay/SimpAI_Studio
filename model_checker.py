import os
import re
import sys
import time
import requests
import queue
import platform
import hashlib
import csv
import io
from contextlib import redirect_stdout
from tqdm import tqdm
from colorama import init, Fore, Style
import threading
import atexit
import json
import argparse
from collections import defaultdict
from multiprocessing import current_process
DEFAULT_DOWNLOAD_PREFIX = "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/"
HF_DOWNLOAD_PREFIX = "https://huggingface.co/metercai/SimpleSDXL2/resolve/main/"
DOWNLOAD_SOURCE = os.getenv("SIMPLEAI_DOWNLOAD_SOURCE", "modelscope").strip().lower()
if DOWNLOAD_SOURCE not in ("modelscope", "huggingface"):
    DOWNLOAD_SOURCE = "modelscope"
current_source = "ModelScope魔搭国内源" if DOWNLOAD_SOURCE == "modelscope" else "HuggingFace拥抱脸国外源"
CURRENT_DOWNLOAD_SOURCE = DOWNLOAD_SOURCE
CURRENT_DOWNLOAD_PREFIX = DEFAULT_DOWNLOAD_PREFIX if CURRENT_DOWNLOAD_SOURCE == "modelscope" else HF_DOWNLOAD_PREFIX

script_dir = os.path.dirname(os.path.abspath(__file__))
if current_process().name != "MainProcess":
    root_dir = os.path.dirname(os.path.dirname(script_dir))
elif platform.system() == 'Windows':
    root_dir = os.path.dirname(os.path.dirname(script_dir))
else:
    root_dir = script_dir

def ensure_directory_exists(directory):
    """确保目录存在，如果不存在则创建"""
    if not os.path.exists(directory):
        try:
            os.makedirs(directory)
            print_colored(f"√创建目录: {directory}", Fore.GREEN)
        except Exception as e:
            print_colored(f"×创建目录失败: {directory}, 错误: {e}", Fore.RED)
            return False
    return True

def _path_drive_available(path):
    if not path:
        return False
    try:
        normalized = os.path.abspath(path)
    except Exception:
        normalized = str(path)
    drive, _ = os.path.splitdrive(normalized)
    if not drive:
        return True
    return os.path.exists(drive + os.sep)

def ensure_model_root_exists(directory):
    """仅确保模型根目录存在；盘符不存在时静默跳过。"""
    if not directory:
        return False
    if os.path.exists(directory):
        return True
    if not _path_drive_available(directory):
        return False
    try:
        os.makedirs(directory, exist_ok=True)
        return True
    except Exception:
        return False

def _dedupe_keep_order(items):
    seen = set()
    out = []
    for x in items or []:
        if not x:
            continue
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out

def _config_paths(config, key, default_value=None):
    value = config.get(key, default_value)
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        raw_paths = value
    else:
        raw_paths = [value]

    paths = []
    for p in raw_paths:
        pp = str(p or "").strip()
        if not pp:
            continue
        paths.append(os.path.abspath(os.path.join(script_dir, pp)) if not os.path.isabs(pp) else pp)
    return paths

download_path_mapping = {}

MODEL_SCAN_CATEGORIES = [
    'checkpoints', 'loras', 'controlnet', 'embeddings', 'diffusion_models',
    'configs', 'vae_approx', 'vae', 'upscale_models', 'inpaint', 'grounding-dino', 'ipadapter',
    'clip', 'clip_vision', 'llms', 'LLM', 'unet', 'diffusers', 'model_patches',
    'text_encoders', 'audio_encoders', 'background_removal', 'frame_interpolation',
    'geometry_estimation', 'optical_flow', 'safety_checker',
    'layer_model', 'pulid', 'insightface', 'prompt_expansion', 'fooocus_expansion',
    'gemma3', 'jina_clip', 'rembg', 'birefnet', 'sam3', 'sam3dbody', 'sharp', 'sams', 'qwen-tts',
    'latent_upscale_models', 'hunyuan_foley', 'liveportrait', 'gligen',
    'hypernetworks', 'photomaker',
]

MODEL_ROOT_CATEGORY_FOLDERS = {
    "checkpoints": ("diffusion_models", "checkpoints"),
    "diffusion_models": ("unet", "diffusion_models", "checkpoints"),
    "unet": ("unet", "diffusion_models", "checkpoints"),
    "clip": ("text_encoders", "clip"),
    "text_encoders": ("text_encoders", "clip"),
    "clip_vision": ("clip_vision", "ipadapter"),
    "ipadapter": ("ipadapter", "controlnet"),
    "background_removal": ("background_removal",),
    "grounding-dino": ("grounding-dino",),
    "detection": ("detection",),
    "geometry_estimation": ("geometry_estimation",),
    "lsnet": ("lsnet",),
    "optical_flow": ("optical_flow",),
    "ultralytics": ("ultralytics",),
    "liveportrait": ("liveportrait",),
    "bbox": ("ultralytics/bbox",),
    "segm": ("ultralytics/segm",),
    "kaloscope": ("lsnet/kaloscope", "kaloscope"),
    "LLM": ("LLM", "llm"),
    "llms": ("llms", "LLM", "llm"),
    "SEEDVR2": ("SEEDVR2",),
    "seedvr2": ("SEEDVR2",),
    "qwen-tts": ("qwen-tts",),
}

LEGACY_CATEGORY_SEARCH_PATHS = {
    "sams": ("inpaint",),
    "grounding-dino": ("inpaint",),
    "ipadapter": ("controlnet",),
}

def _model_root_category_dirs(path_type):
    folders = MODEL_ROOT_CATEGORY_FOLDERS.get(path_type, (path_type,))
    return [os.path.join(simplemodels_root, folder) for folder in folders]

def _root_from_category_path(path, folder):
    if not path or not folder:
        return None
    path_norm = os.path.normpath(os.path.abspath(str(path)))
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

def _infer_extra_model_roots_from_path_mapping(path_mapping):
    root_categories = {}
    for category, paths in (path_mapping or {}).items():
        folders = MODEL_ROOT_CATEGORY_FOLDERS.get(category, (category,))
        for raw_path in paths or []:
            for folder in folders:
                root = _root_from_category_path(raw_path, folder)
                if not root:
                    continue
                key = os.path.normcase(os.path.normpath(root))
                root_categories.setdefault(key, {"root": root, "categories": set()})["categories"].add(category)
    return [
        item["root"]
        for item in root_categories.values()
        if len(item["categories"]) >= 2
    ]

def _extra_model_root_category_dirs(path_type, path_mapping):
    folders = MODEL_ROOT_CATEGORY_FOLDERS.get(path_type, (path_type,))
    paths = []
    for root in _infer_extra_model_roots_from_path_mapping(path_mapping):
        paths.extend(os.path.join(root, folder) for folder in folders)
    return paths

def _config_path_candidates():
    candidates = []
    for env_name in ("simpleai_userhome", "SIMPLEAI_USERHOME"):
        env_userhome = os.getenv(env_name)
        if env_userhome:
            base = os.path.abspath(os.path.join(script_dir, env_userhome)) if not os.path.isabs(env_userhome) else env_userhome
            candidates.append(os.path.join(base, "config.txt"))

    candidates.extend([
        os.path.normpath(os.path.join(root_dir, "users", "config.txt")),
        os.path.normpath(os.path.join(script_dir, "users", "config.txt")),
        os.path.abspath(os.path.join(script_dir, "..", "..", "users", "config.txt")),
        os.path.abspath(os.path.join(os.getcwd(), "..", "..", "users", "config.txt")),
        os.path.abspath(os.path.join(os.getcwd(), "users", "config.txt")),
    ])

    out = []
    seen = set()
    for path in candidates:
        key = os.path.normcase(os.path.normpath(os.path.abspath(path)))
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out

def _find_config_path():
    for candidate in _config_path_candidates():
        if os.path.isfile(candidate):
            return candidate
    return None

def load_model_paths():
    global simplemodels_root, download_path_mapping

    config_path = _find_config_path()
    path_mapping = {}

    try:
        if config_path is None:
            raise FileNotFoundError("SimpAI config.txt not found")
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        models_root = config.get("path_models_root", None)
        if models_root:
            simplemodels_root = os.path.abspath(os.path.join(script_dir, models_root)) if not os.path.isabs(models_root) else models_root
        else:
            simplemodels_root = os.path.normpath(os.path.join(root_dir, "SimpleModels"))
        path_mapping = {
            "checkpoints": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in config.get("path_checkpoints", [])],
            "loras": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                    for p in config.get("path_loras", [])],
            "controlnet": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in config.get("path_controlnet", [])],
            "embeddings": [os.path.abspath(os.path.join(script_dir, p))
                        for p in ([config.get("path_embeddings")] if isinstance(config.get("path_embeddings"), str)
                                else config.get("path_embeddings", []))],
            "vae_approx": [os.path.abspath(os.path.join(script_dir, p))
                        for p in ([config.get("path_vae_approx")] if isinstance(config.get("path_vae_approx"), str)
                                else config.get("path_vae_approx", []))],
            "vae": [os.path.abspath(os.path.join(script_dir, p))
                    for p in ([config.get("path_vae")] if isinstance(config.get("path_vae"), str)
                            else config.get("path_vae", []))],
            "upscale_models": [os.path.abspath(os.path.join(script_dir, p))
                        for p in ([config.get("path_upscale_models")] if isinstance(config.get("path_upscale_models"), str)
                            else config.get("path_upscale_models", []))],
            "inpaint": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in config.get("path_inpaint", [])],
            "clip": [os.path.abspath(os.path.join(script_dir, p))
                        for p in ([config.get("path_clip")] if isinstance(config.get("path_clip"), str)
                            else config.get("path_clip", []))],
            "clip_vision": [os.path.abspath(os.path.join(script_dir, p))
                        for p in ([config.get("path_clip_vision")] if isinstance(config.get("path_clip_vision"), str)
                            else config.get("path_clip_vision", []))],
            "fooocus_expansion": [os.path.abspath(os.path.join(script_dir, config.get("path_fooocus_expansion", "")))],
            "llms": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_llms", [os.path.join(simplemodels_root, "llms")])
                                if isinstance(config.get("path_llms"), list)
                                else [config.get("path_llms") or os.path.join(simplemodels_root, "llms")])],
            "LLM": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in _dedupe_keep_order(
                            (config.get("path_LLM", [])
                                if isinstance(config.get("path_LLM"), list)
                                else [config.get("path_LLM")] if config.get("path_LLM") else [])
                            + (config.get("path_llm", [])
                                if isinstance(config.get("path_llm"), list)
                                else [config.get("path_llm")] if config.get("path_llm") else [])
                            + [os.path.join(simplemodels_root, "LLM")]
                        )],
            "safety_checker": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_safety_checker", [])
                            if isinstance(config.get("path_safety_checker"), list)
                            else [config.get("path_safety_checker", "")])],
            "unet": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_unet", [])
                            if isinstance(config.get("path_unet"), list)
                            else [config.get("path_unet", "")])],
            "rembg": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_rembg", [])
                            if isinstance(config.get("path_rembg"), list)
                            else [config.get("path_rembg", "")])],
            "birefnet": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_birefnet", [os.path.join(simplemodels_root, "birefnet")])
                            if isinstance(config.get("path_birefnet"), list)
                            else [config.get("path_birefnet") or os.path.join(simplemodels_root, "birefnet")])],
            "layer_model": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_layer_model", [])
                                if isinstance(config.get("path_layer_model"), list)
                                else [config.get("path_layer_model", "")])],
            "diffusers": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in config.get("path_diffusers", [])],
            "ipadapter": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_ipadapter", [])
                            if isinstance(config.get("path_ipadapter"), list)
                            else [config.get("path_ipadapter", "")])],
            "pulid": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_pulid", [])
                        if isinstance(config.get("path_pulid"), list)
                        else [config.get("path_pulid", "")])],
            "insightface": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_insightface", [])
                                if isinstance(config.get("path_insightface"), list)
                                else [config.get("path_insightface", "")])],
            "style_models": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_style_models", [])
                                if isinstance(config.get("path_style_models"), list)
                                else [config.get("path_style_models", "")])],
            "configs": _config_paths(config, "path_configs", os.path.join(simplemodels_root, "configs")),
            "gligen": _config_paths(config, "path_gligen", os.path.join(simplemodels_root, "gligen")),
            "hypernetworks": _config_paths(config, "path_hypernetworks", os.path.join(simplemodels_root, "hypernetworks")),
            "photomaker": _config_paths(config, "path_photomaker", os.path.join(simplemodels_root, "photomaker")),
            "prompt_expansion": [os.path.abspath(os.path.join(simplemodels_root, "prompt_expansion"))],
            "model_patches": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_model_patches", [os.path.join(simplemodels_root, "model_patches")])
                                if isinstance(config.get("path_model_patches"), list)
                                else [config.get("path_model_patches") or os.path.join(simplemodels_root, "model_patches")])],
            "audio_encoders": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_audio_encoders", [os.path.join(simplemodels_root, "audio_encoders")])
                                    if isinstance(config.get("path_audio_encoders"), list)
                                    else [config.get("path_audio_encoders") or os.path.join(simplemodels_root, "audio_encoders")])],
            "background_removal": _config_paths(config, "path_background_removal", os.path.join(simplemodels_root, "background_removal")),
            "frame_interpolation": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_frame_interpolation", [os.path.join(simplemodels_root, "frame_interpolation")])
                                    if isinstance(config.get("path_frame_interpolation"), list)
                                    else [config.get("path_frame_interpolation") or os.path.join(simplemodels_root, "frame_interpolation")])],
            "geometry_estimation": _config_paths(config, "path_geometry_estimation", os.path.join(simplemodels_root, "geometry_estimation")),
            "optical_flow": _config_paths(config, "path_optical_flow", os.path.join(simplemodels_root, "optical_flow")),
            "grounding-dino": _config_paths(config, "path_grounding_dino", os.path.join(simplemodels_root, "grounding-dino")),
            "text_encoders": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_text_encoders", [os.path.join(simplemodels_root, "text_encoders")])
                                if isinstance(config.get("path_text_encoders"), list)
                                else [config.get("path_text_encoders") or os.path.join(simplemodels_root, "text_encoders")])],
            "lsnet": _config_paths(config, "path_lsnet", os.path.join(simplemodels_root, "lsnet")),
            "kaloscope": _config_paths(config, "path_kaloscope", os.path.join(simplemodels_root, "lsnet", "kaloscope")),
            "detection": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_detection", [os.path.join(simplemodels_root, "detection")])
                                if isinstance(config.get("path_detection"), list)
                                else [config.get("path_detection") or os.path.join(simplemodels_root, "detection")])],
            "diffusion_models": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_diffusion_models", [os.path.join(simplemodels_root, "diffusion_models")])
                                if isinstance(config.get("path_diffusion_models"), list)
                                else [config.get("path_diffusion_models") or os.path.join(simplemodels_root, "diffusion_models")])],
            "ultralytics": _config_paths(config, "path_ultralytics", os.path.join(simplemodels_root, "ultralytics")),
            "liveportrait": _config_paths(config, "path_liveportrait", os.path.join(simplemodels_root, "liveportrait")),
            "bbox": _config_paths(config, "path_bbox", os.path.join(simplemodels_root, "ultralytics", "bbox")),
            "segm": _config_paths(config, "path_segm", os.path.join(simplemodels_root, "ultralytics", "segm")),
            "SDPose_OOD": [os.path.join(simplemodels_root, "SDPose_OOD")],
            "yolo": [os.path.join(simplemodels_root, "yolo")],
            "jina_clip": [os.path.join(simplemodels_root, "jina_clip")],
            "gemma3": [os.path.join(simplemodels_root, "gemma3")],
            "nlf": [os.path.join(simplemodels_root, "nlf")],
            "SEEDVR2": _config_paths(config, "path_SEEDVR2", os.path.join(simplemodels_root, "SEEDVR2")),
            "sam3": _config_paths(config, "path_sam3", os.path.join(simplemodels_root, "sam3")),
            "sam3dbody": _config_paths(config, "path_sam3dbody", os.path.join(simplemodels_root, "sam3dbody")),
            "sharp": [os.path.abspath(os.path.join(script_dir, p)) if not os.path.isabs(p) else p
                        for p in (config.get("path_sharp", [os.path.join(simplemodels_root, "sharp")])
                            if isinstance(config.get("path_sharp"), list)
                            else [config.get("path_sharp") or os.path.join(simplemodels_root, "sharp")])],
            "sams": _config_paths(config, "path_sams", os.path.join(simplemodels_root, "sams")),
            "qwen-tts": _config_paths(config, "path_qwen_tts", os.path.join(simplemodels_root, "qwen-tts")),
            "latent_upscale_models": _config_paths(config, "path_latent_upscale_models", os.path.join(simplemodels_root, "latent_upscale_models")),
            "hunyuan_foley": _config_paths(config, "path_hunyuan_foley", os.path.join(simplemodels_root, "hunyuan_foley")),
        }

    except Exception as e:
        print(f"{Fore.YELLOW}△配置文件加载失败: {e}，使用默认路径{Style.RESET_ALL}", file=sys.stderr)
        # 设置默认的simplemodels_root
        simplemodels_root = os.path.normpath(os.path.join(root_dir, "SimpleModels"))
        path_mapping = {
            "checkpoints": [os.path.join(simplemodels_root, "checkpoints")],
            "loras": [os.path.join(simplemodels_root, "loras")],
            "controlnet": [os.path.join(simplemodels_root, "controlnet")],
            "embeddings": [os.path.join(simplemodels_root, "embeddings")],
            "vae_approx": [os.path.join(simplemodels_root, "vae_approx")],
            "vae": [os.path.join(simplemodels_root, "vae")],
            "upscale_models": [os.path.join(simplemodels_root, "upscale_models")],
            "inpaint": [os.path.join(simplemodels_root, "inpaint")],
            "clip": [os.path.join(simplemodels_root, "clip")],
            "clip_vision": [os.path.join(simplemodels_root, "clip_vision")],
            "fooocus_expansion": [os.path.join(simplemodels_root, "prompt_expansion", "fooocus_expansion")],
            "llms": [os.path.join(simplemodels_root, "llms")],
            "LLM": [os.path.join(simplemodels_root, "LLM")],
            "safety_checker": [os.path.join(simplemodels_root, "safety_checker")],
            "unet": [os.path.join(simplemodels_root, "unet")],
            "rembg": [os.path.join(simplemodels_root, "rembg")],
            "birefnet": [os.path.join(simplemodels_root, "birefnet")],
            "layer_model": [os.path.join(simplemodels_root, "layer_model")],
            "diffusers": [os.path.join(simplemodels_root, "diffusers")],
            "ipadapter": [os.path.join(simplemodels_root, "ipadapter")],
            "pulid": [os.path.join(simplemodels_root, "pulid")],
            "insightface": [os.path.join(simplemodels_root, "insightface")],
            "style_models": [os.path.join(simplemodels_root, "style_models")],
            "configs": [os.path.normpath(os.path.join(simplemodels_root, "configs"))],
            "gligen": [os.path.join(simplemodels_root, "gligen")],
            "hypernetworks": [os.path.join(simplemodels_root, "hypernetworks")],
            "photomaker": [os.path.join(simplemodels_root, "photomaker")],
            "prompt_expansion": [os.path.normpath(os.path.join(simplemodels_root, "prompt_expansion"))],
            "model_patches": [os.path.join(simplemodels_root, "model_patches")],
            "audio_encoders": [os.path.join(simplemodels_root, "audio_encoders")],
            "background_removal": [os.path.join(simplemodels_root, "background_removal")],
            "frame_interpolation": [os.path.join(simplemodels_root, "frame_interpolation")],
            "geometry_estimation": [os.path.join(simplemodels_root, "geometry_estimation")],
            "optical_flow": [os.path.join(simplemodels_root, "optical_flow")],
            "grounding-dino": [os.path.join(simplemodels_root, "grounding-dino")],
            "text_encoders": [os.path.join(simplemodels_root, "text_encoders")],
            "lsnet": [os.path.join(simplemodels_root, "lsnet")],
            "kaloscope": [os.path.join(simplemodels_root, "lsnet", "kaloscope")],
            "detection": [os.path.join(simplemodels_root, "detection")],
            "diffusion_models": [os.path.join(simplemodels_root, "diffusion_models")],
            "ultralytics": [os.path.join(simplemodels_root, "ultralytics")],
            "liveportrait": [os.path.join(simplemodels_root, "liveportrait")],
            "bbox": [os.path.join(simplemodels_root, "ultralytics", "bbox")],
            "segm": [os.path.join(simplemodels_root, "ultralytics", "segm")],
            "SDPose_OOD": [os.path.join(simplemodels_root, "SDPose_OOD")],
            "yolo": [os.path.join(simplemodels_root, "yolo")],
            "jina_clip": [os.path.join(simplemodels_root, "jina_clip")],
            "gemma3": [os.path.join(simplemodels_root, "gemma3")],
            "nlf": [os.path.join(simplemodels_root, "nlf")],
            "SEEDVR2": [os.path.join(simplemodels_root, "SEEDVR2")],
            "sam3": [os.path.join(simplemodels_root, "sam3")],
            "sam3dbody": [os.path.join(simplemodels_root, "sam3dbody")],
            "sharp": [os.path.join(simplemodels_root, "sharp")],
            "sams": [os.path.join(simplemodels_root, "sams")],
            "qwen-tts": [os.path.join(simplemodels_root, "qwen-tts")],
            "latent_upscale_models": [os.path.join(simplemodels_root, "latent_upscale_models")],
            "hunyuan_foley": [os.path.join(simplemodels_root, "hunyuan_foley")],
        }

    download_path_mapping = {
        key: list(value or [])
        for key, value in path_mapping.items()
    }

    for key in list(path_mapping):
        path_mapping[key] = _dedupe_keep_order(
            _model_root_category_dirs(key)
            + _extra_model_root_category_dirs(key, path_mapping)
            + path_mapping.get(key, [])
        )

    for key in path_mapping:
        normalized_paths = []
        seen = set()
        for p in path_mapping[key]:
            pp = str(p or "").strip()
            if not pp:
                continue
            pp = os.path.abspath(pp) if not os.path.isabs(pp) else pp
            norm_key = os.path.normcase(os.path.normpath(pp))
            if norm_key in seen:
                continue
            seen.add(norm_key)
            normalized_paths.append(pp)
        path_mapping[key] = normalized_paths

    for key in download_path_mapping:
        normalized_paths = []
        seen = set()
        for p in download_path_mapping[key]:
            pp = str(p or "").strip()
            if not pp:
                continue
            pp = os.path.abspath(pp) if not os.path.isabs(pp) else pp
            norm_key = os.path.normcase(os.path.normpath(pp))
            if norm_key in seen:
                continue
            seen.add(norm_key)
            normalized_paths.append(pp)
        download_path_mapping[key] = normalized_paths

    ensure_model_root_exists(simplemodels_root)

    return path_mapping

def _get_download_base_dirs(path_type, path_mapping):
    # Download targets must follow the declared package category exactly.
    base_dirs = download_path_mapping.get(path_type, []) or []
    if base_dirs:
        return base_dirs
    return path_mapping.get(path_type, []) or [os.path.join(simplemodels_root, path_type)]

def _get_search_dirs(path_mapping, path_type):
    if not path_mapping or not path_type:
        return []

    base = path_mapping.get(path_type, []) or []
    legacy_dirs = []
    for legacy_type in LEGACY_CATEGORY_SEARCH_PATHS.get(path_type, ()):
        legacy_dirs.extend(path_mapping.get(legacy_type, []) or [])
    if legacy_dirs:
        base = _dedupe_keep_order(base + legacy_dirs)

    if path_type == "checkpoints":
        diffusion_models_dirs = path_mapping.get("diffusion_models", []) or []
        return _dedupe_keep_order(diffusion_models_dirs + base)
    if path_type in ("unet", "diffusion_models"):
        checkpoints_dirs = path_mapping.get("checkpoints", []) or []
        diffusion_models_dirs = path_mapping.get("diffusion_models", []) or []
        unet_dirs = path_mapping.get("unet", []) or []
        return _dedupe_keep_order(unet_dirs + diffusion_models_dirs + checkpoints_dirs)
    if path_type in ("clip", "text_encoders"):
        text_encoders_dirs = path_mapping.get("text_encoders", []) or []
        clip_dirs = path_mapping.get("clip", []) or []
        return _dedupe_keep_order(text_encoders_dirs + clip_dirs)
    if path_type == "clip_vision":
        clip_vision_dirs = path_mapping.get("clip_vision", []) or []
        ipadapter_dirs = path_mapping.get("ipadapter", []) or []
        return _dedupe_keep_order(clip_vision_dirs + ipadapter_dirs)
    if path_type == "ipadapter":
        ipadapter_dirs = path_mapping.get("ipadapter", []) or []
        controlnet_dirs = path_mapping.get("controlnet", []) or []
        return _dedupe_keep_order(ipadapter_dirs + controlnet_dirs)
    return base

def cleanup():
    if os.path.exists("downloadlist.txt"):
        os.remove("downloadlist.txt")
        print("已删除 'downloadlist.txt' 文件。", file=sys.stderr)
    if os.path.exists("缺失模型下载链接.txt"):
        os.remove("缺失模型下载链接.txt")
        print("已删除 '缺失模型下载链接.txt' 文件。", file=sys.stderr)
atexit.register(cleanup)

init(autoreset=True, strip=False, convert=False)

LAUNCHER_MODE = os.getenv("SIMPLEAI_LAUNCHER", "0") == "1"

class DownloadStatus:
    def __init__(self, filename, total_size):
        self.filename = filename
        self.total_size = total_size
        self.progress_bar = tqdm(
            total=total_size,
            unit='iB',
            unit_scale=True,
            desc=filename,
            position=0,
            leave=False,         # 完成后保留进度条（显示100%）
            dynamic_ncols=True,  # 动态列宽
            file=sys.stdout,     # 输出到 stdout
            miniters=1,          # 每次迭代都更新
            mininterval=0.05,    # 缩短更新间隔到 0.05 秒
            disable=False,       # 明确不禁用
            ncols=100            # 固定列宽
        )

def print_colored(text, color=Fore.WHITE):
    print(f"{color}{text}{Style.RESET_ALL}")

def check_python_embedded():
    python_exe = sys.executable
    print(f"Python解析器路径: {python_exe}")

    if platform.system() =='Windows' and "python_embeded" not in python_exe.lower():
        print_colored("×当前 Python 解释器不在 python_embeded 目录中，请检查运行环境", Fore.RED)
        print("按任意键继续。", flush=True)
        input()
        sys.exit(1)

def check_script_file():
    script_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "SimpAI_Studio", "entry_with_update.py")

    if os.path.exists(script_file):
        print_colored("√找到主程序目录", Fore.GREEN)
    else:
        print_colored("×未找到主程序目录，请检查脚本位置", Fore.RED)
        print("按任意键继续。", flush=True)
        input()
        sys.exit(1)

    base_dir = os.path.dirname(os.path.dirname(script_file))
    directory_level = len(base_dir.split(os.sep))

    if directory_level <= 2:
        print_colored("×主程序目录层级不足，可能会导致脚本结果有误。请按照安装视频指引先建立SimpleAI主文件夹", Fore.RED)
    else: 
        print_colored("√主程序目录层级验证通过", Fore.GREEN)

    paths_to_check = [
        ("当前脚本路径", os.path.abspath(__file__)),
        ("主程序目录", base_dir),
        ("入口文件路径", script_file)
    ]

    has_space = False
    for desc, path in paths_to_check:
        if ' ' in path:
            print_colored(f"!警告：{desc}包含空格 -> {path}", Fore.YELLOW)
            has_space = True

    if has_space:
        print_colored("!路径包含空格可能导致程序异常，建议将SimpleAI安装到无空格路径（如D:\\SimpleAI）", Fore.YELLOW)
        time.sleep(10)

def get_total_virtual_memory():
    try:
        import psutil
        virtual_mem = psutil.virtual_memory().total
        swap_mem = psutil.swap_memory().total
        total_virtual_memory = virtual_mem + swap_mem
        return total_virtual_memory
    except ImportError:
        print_colored("无法导入 psutil 模块，跳过内存检查", Fore.YELLOW)
        return None
    except Exception as e:
        print_colored(f"无法获取系统虚拟内存，可能是性能计数器未开启或其他问题。\n错误详情: {e}", Fore.YELLOW)
        print_colored("请参考https://learn.microsoft.com/zh-cn/troubleshoot/windows-server/performance/rebuild-performance-counter-library-values重新启用系统性能计数器，或忽略此警告继续。", Fore.YELLOW)
        return None

def check_virtual_memory(total_virtual):
    if total_virtual is None:
        print_colored("跳过虚拟内存检查。", Fore.YELLOW)
        return
    total_gb = total_virtual / (1024 ** 3)
    if total_gb < 40:
        print_colored("警告：系统虚拟内存小于40GB，会禁用部分预置包，请参考安装视频教程设置系统虚拟内存。", Fore.YELLOW)
    else:
        print_colored("√系统虚拟内存充足", Fore.GREEN)
    print(f"系统总虚拟内存: {total_gb:.2f} GB")

def find_simplemodels_dir(start_path):
    current_dir = start_path
    while current_dir != os.path.dirname(current_dir):
        simplemodels_path = os.path.join(current_dir, "SimpleModels")
        if os.path.isdir(simplemodels_path):
            return simplemodels_path
        current_dir = os.path.dirname(current_dir)
    return None

def find_users_dir(start_path):
    current_dir = start_path
    candidate = None
    while current_dir != os.path.dirname(current_dir):
        users_path = os.path.join(current_dir, "users")
        if os.path.isdir(users_path):
            config_path = os.path.join(users_path, "config.txt")
            if os.path.isfile(config_path):
                return users_path
            if candidate is None:
                candidate = users_path
        current_dir = os.path.dirname(current_dir)
    return candidate

def normalize_path(path):
    path_mapping = load_model_paths()

    path_parts = path.split('/')
    if len(path_parts) < 2:
        return os.path.abspath(path)

    path_type = path_parts[0]
    filename = '/'.join(path_parts[1:])

    sorted_dirs = sorted(
        path_mapping.get(path_type, []),
        key=lambda x: (
            0 if "SimpleModels" in x else
            1 if any(part == "models" for part in x.split(os.sep)) else
            2,
            x
        )
    )

    for base_dir in sorted_dirs:
        full_path = os.path.join(base_dir, filename)
        return os.path.abspath(full_path)

def typewriter_effect(text, delay=0.01):
    for char in text:
        print(char, end='', flush=True)
        time.sleep(delay)

    print()
def print_instructions():
    print()
    print(f"{Fore.GREEN}★★★★★{Style.RESET_ALL}安装视频教程{Fore.YELLOW}https://www.bilibili.com/video/BV1ddkdYcEWg/{Style.RESET_ALL}{Fore.GREEN}★★★★★{Style.RESET_ALL}{Fore.GREEN}★{Style.RESET_ALL}")
    time.sleep(0.1)
    print()
    print(f"{Fore.GREEN}★{Style.RESET_ALL}攻略地址飞书文档:{Fore.YELLOW}https://acnmokx5gwds.feishu.cn/wiki/QK3LwOp2oiRRaTkFRhYcO4LonGe{Style.RESET_ALL}文章无权限即为未编辑完毕。{Fore.GREEN}★{Style.RESET_ALL}")
    time.sleep(0.1)
    print(f"{Fore.GREEN}★{Style.RESET_ALL}稳速生图指南:Nvidia显卡驱动选择最新版驱动,驱动类型最好为Studio。{Fore.GREEN}★{Style.RESET_ALL}")
    time.sleep(0.1)
    print(f"{Fore.GREEN}★{Style.RESET_ALL}在遇到生图速度断崖式下降或者爆显存OutOfMemory时,提高{Fore.GREEN}预留显存功能{Style.RESET_ALL}的数值至（1~2）{Fore.GREEN}★{Style.RESET_ALL}")
    time.sleep(0.1)
    print(f"{Fore.GREEN}★{Style.RESET_ALL}打开默认浏览器设置，关闭GPU加速、或图形加速的选项。{Fore.GREEN}★{Style.RESET_ALL}大内存(64+)与固态硬盘存放模型有助于减少模型加载时间。{Fore.GREEN}★{Style.RESET_ALL}")
    time.sleep(0.1)
    print(f"{Fore.GREEN}★{Style.RESET_ALL}疑难杂症进QQ群求助：1005085136{Fore.GREEN}★{Style.RESET_ALL}脚本：✿   冰華 |版本:26.08.14{Fore.GREEN}★{Style.RESET_ALL}")
    print()
    time.sleep(0.1)

def get_unique_filename(file_path, extension=".corrupted"):
    base = file_path + extension
    counter = 1
    while os.path.exists(base):
        base = f"{file_path}{extension}_{counter}"
        counter += 1
    return base

def _normalize_relpath_for_match(path):
    return str(path).replace("\\", "/").lstrip("/").lower()

def _split_obsolete_specs(obsolete_models):
    basenames = set()
    relpaths = set()
    for spec in obsolete_models:
        s = _normalize_relpath_for_match(spec).strip()
        if not s:
            continue
        if "/" in s:
            relpaths.add(s)
        else:
            basenames.add(s)
    return basenames, relpaths

def _is_under_dir(path, parent_dir):
    try:
        parent = os.path.normcase(os.path.normpath(parent_dir))
        p = os.path.normcase(os.path.normpath(path))
        return os.path.commonpath([parent, p]) == parent
    except Exception:
        return False

def _matches_obsolete(full_path, filename, obsolete_basenames, obsolete_relpaths, simplemodels_root):
    if filename.lower() in obsolete_basenames:
        return True
    if not obsolete_relpaths or not simplemodels_root:
        return False
    if not _is_under_dir(full_path, simplemodels_root):
        return False
    try:
        rel = os.path.relpath(full_path, simplemodels_root)
    except Exception:
        return False
    rel = _normalize_relpath_for_match(rel)
    if rel in obsolete_relpaths:
        return True
    return any(rel.startswith(spec.rstrip("/") + "/") for spec in obsolete_relpaths)

HF_URL_OVERRIDES = {}

def split_path_and_url(path_with_url):
    if not isinstance(path_with_url, str):
        return str(path_with_url), None
    https_pos = path_with_url.find("https://")
    http_pos = path_with_url.find("http://")
    if https_pos == -1 and http_pos == -1:
        return path_with_url, None
    if https_pos == -1:
        url_pos = http_pos
    elif http_pos == -1:
        url_pos = https_pos
    else:
        url_pos = min(https_pos, http_pos)
    return path_with_url[:url_pos].rstrip('/'), path_with_url[url_pos:]

def parse_package_file_entry(file_entry):
    if isinstance(file_entry, tuple) and len(file_entry) >= 2:
        raw_path = file_entry[0]
        size = int(file_entry[1])
        local_part, url = split_path_and_url(raw_path)

        if url:
            local_part = local_part.strip('/')
            parts = local_part.split('/') if local_part else []
            path_type = parts[0] if parts else "default"
            rel_dir = '/'.join(parts[1:]).strip('/')
            file_name = os.path.basename(url)
            relative_path = f"{rel_dir}/{file_name}".strip('/') if rel_dir else file_name
            modelscope_url = url
        else:
            local_part = str(raw_path).strip('/')
            parts = local_part.split('/') if local_part else []
            path_type = parts[0] if parts else "default"
            relative_path = '/'.join(parts[1:]).strip('/')
            if not relative_path:
                relative_path = os.path.basename(local_part)
            modelscope_url = f"{DEFAULT_DOWNLOAD_PREFIX}SimpleModels/{local_part}" if DEFAULT_DOWNLOAD_PREFIX else None

        expected_path = f"{path_type}/{relative_path}".strip('/')
        hf_url = HF_URL_OVERRIDES.get(expected_path) or (HF_URL_OVERRIDES.get(modelscope_url) if modelscope_url else None)
        return {
            "path_type": path_type,
            "relative_path": relative_path,
            "expected_path": expected_path,
            "size": size,
            "sha256": None,
            "modelscope_url": modelscope_url,
            "hf_url": hf_url,
        }

    if isinstance(file_entry, str):
        fields = next(csv.reader([file_entry], skipinitialspace=True))
        if len(fields) < 5:
            raise ValueError(f"invalid file entry: {file_entry!r}")

        path_type = fields[0].strip()
        relative_path = fields[1].strip().lstrip('/').rstrip('/')
        size = int(fields[2].strip())
        sha256 = fields[3].strip() if len(fields) >= 4 else ""
        if sha256 in ("", "0", "none", "null", "None"):
            sha256 = None
        modelscope_url = fields[4].strip() if len(fields) >= 5 else ""
        hf_url = fields[5].strip() if len(fields) >= 6 else ""
        expected_path = f"{path_type}/{relative_path}".strip('/')

        if not hf_url:
            hf_url = HF_URL_OVERRIDES.get(expected_path) or (HF_URL_OVERRIDES.get(modelscope_url) if modelscope_url else None)

        if not modelscope_url:
            modelscope_url = f"{DEFAULT_DOWNLOAD_PREFIX}SimpleModels/{expected_path}" if DEFAULT_DOWNLOAD_PREFIX else None

        return {
            "path_type": path_type,
            "relative_path": relative_path,
            "expected_path": expected_path,
            "size": size,
            "sha256": sha256,
            "modelscope_url": modelscope_url,
            "hf_url": hf_url if hf_url else None,
        }

    raise ValueError(f"unsupported file entry type: {type(file_entry)}")

def select_download_url(entry):
    if CURRENT_DOWNLOAD_SOURCE == "huggingface":
        return entry.get("hf_url")
    return entry.get("modelscope_url")

def iter_package_file_entries(files_list):
    for file_entry in files_list:
        yield parse_package_file_entry(file_entry)

def build_url_index(packages):
    url_index = {}
    for pkg in packages.values():
        for entry in iter_package_file_entries(pkg.get("files", [])):
            ms_url = entry.get("modelscope_url")
            hf_url = entry.get("hf_url")
            if ms_url:
                url_index[ms_url] = (entry["path_type"], entry["relative_path"])
            if hf_url:
                url_index[hf_url] = (entry["path_type"], entry["relative_path"])
    return url_index

def get_package_info_links(package_info):
    links = package_info.get("info_links", None)
    if not links:
        return []
    if isinstance(links, str):
        return [links]
    return [x for x in links if isinstance(x, str) and x.strip()]

def get_actual_file_path(file_path):
    local_path, url = split_path_and_url(file_path)
    if url:
        url_file_name = os.path.basename(url)
        actual_file_path = os.path.join(local_path, url_file_name) if local_path else url_file_name
        return os.path.normpath(actual_file_path)
    return os.path.normpath(file_path)
def validate_files(packages):
    cleanup()
    path_mapping = load_model_paths()
    print_colored(f">>>>>>默认模型根目录为：{simplemodels_root}<<<<<<", Fore.YELLOW)
    print()
    # 根据GPU架构过滤packages
    filtered_packages = filter_packages_by_gpu_arch(packages)
    entry_by_expected_path = {}
    for pkg in filtered_packages.values():
        for entry in iter_package_file_entries(pkg.get("files", [])):
            entry_by_expected_path.setdefault(entry["expected_path"], entry)

    # 获取GPU架构信息并显示
    gpu_arch = get_gpu_arch_str()
    print_colored(f"当前GPU架构: {gpu_arch}, 已根据架构过滤预置包", Fore.CYAN)

    download_files = {}
    missing_package_names = []
    package_percentages = {}
    package_sizes = {}
    root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    for package_key, package_info in filtered_packages.items():
        package_name = package_info["name"]
        package_note = package_info.get("note", "")
        files_and_sizes = package_info["files"]
        download_links = get_package_info_links(package_info)

        parsed_entries = list(iter_package_file_entries(files_and_sizes))
        total_size = sum([e["size"] for e in parsed_entries])
        total_size_gb = total_size / (1024 ** 3)
        non_missing_size = 0

        print("－－－－－－－", end='')
        time.sleep(0.1)
        print(f"校验{package_name}文件－－－－{package_note}")

        missing_files = []
        size_mismatch_files = []
        case_mismatch_files = []

        for entry in parsed_entries:
            expected_path = entry["expected_path"]
            expected_size = entry["size"]
            expected_filename = os.path.basename(expected_path) 
            path_parts = expected_path.split('/')
            path_type = path_parts[0] if len(path_parts) > 0 else ''
            sub_path = '/'.join(path_parts[1:]) if len(path_parts) > 1 else ''

            search_dirs = sorted(
                _get_search_dirs(path_mapping, path_type),
                key=lambda x: (
                    0 if "SimpleModels" in x else
                    1 if any(part == "models" for part in x.split(os.sep)) else
                    2,
                    x
                )
            )
            if not search_dirs:
                simplemodels_default = os.path.join(root, "SimpleModels")
                search_dirs = [os.path.join(simplemodels_default, path_type)]

            found = False
            actual_dir = None
            for base_dir in search_dirs:
                full_path = os.path.join(base_dir, sub_path) if sub_path else os.path.join(base_dir, os.path.basename(expected_path))
                if os.path.exists(full_path):
                    actual_dir = os.path.dirname(full_path)
                    found = True
                    break

            if not found:
                missing_files.append((expected_path, expected_size))
                continue

            try:
                directory_listing = os.listdir(actual_dir)
            except Exception as e:
                print(f"{Fore.RED}目录访问错误: {actual_dir} - {str(e)}{Style.RESET_ALL}")
                missing_files.append((expected_path, expected_size))
                continue

            expected_filename = os.path.basename(expected_path)
            actual_filename = next((f for f in directory_listing if f.lower() == expected_filename.lower()), None)
            directory_listing = os.listdir(actual_dir)
            actual_filename = next((f for f in directory_listing if f.lower() == expected_filename.lower()), None)

            if actual_filename is None:
                missing_files.append((expected_path, expected_size))
            elif actual_filename != expected_filename:
                case_mismatch_files.append((os.path.join(actual_dir, actual_filename), expected_filename))
            else:
                actual_size = os.path.getsize(os.path.join(actual_dir, actual_filename))
                if actual_size != expected_size:
                    size_mismatch_files.append((entry["expected_path"], os.path.join(actual_dir, actual_filename), actual_size, expected_size))
                else:
                    non_missing_size += expected_size
        obsolete_files = []
        obsolete_basenames, obsolete_relpaths = _split_obsolete_specs(OBSOLETE_MODELS)
        MODEL_PATHS_TO_SCAN = [
        os.path.join(simplemodels_root, "checkpoints"),
        os.path.join(simplemodels_root, "loras"),
        os.path.join(simplemodels_root, "controlnet"),
        os.path.join(simplemodels_root, "ipadapter"),
        os.path.join(simplemodels_root, "diffusers"),
        os.path.join(simplemodels_root, "model_patches"),
        os.path.join(simplemodels_root, "background_removal"),
        os.path.join(simplemodels_root, "geometry_estimation"),
        os.path.join(simplemodels_root, "optical_flow"),
        os.path.join(simplemodels_root, "inpaint"),
        os.path.join(simplemodels_root, "clip"),
        os.path.join(simplemodels_root, "clip_vision"),
        os.path.join(simplemodels_root, "fooocus_expansion"),
        os.path.join(simplemodels_root, "llms"),
        os.path.join(simplemodels_root, "LLM"),
        os.path.join(simplemodels_root, "safety_checker"),
        os.path.join(simplemodels_root, "unet"),
        os.path.join(simplemodels_root, "layer_model"),
        os.path.join(simplemodels_root, "pulid"),
        os.path.join(simplemodels_root, "text_encoders"),
        os.path.join(simplemodels_root, "lsnet"),
        os.path.join(simplemodels_root, "kaloscope"),
        os.path.join(simplemodels_root, "diffusion_models"),
        os.path.join(simplemodels_root, "SDPose_OOD"),
        os.path.join(simplemodels_root, "jina_clip"),
        os.path.join(simplemodels_root, "gemma3"),
        os.path.join(simplemodels_root, "nlf"),
        os.path.join(simplemodels_root, "SEEDVR2"),
        os.path.join(simplemodels_root, "LLM", "Huihui-Qwen3.5-9B-abliterated"),
        os.path.join(simplemodels_root, "rembg"),
        os.path.join(simplemodels_root, "birefnet"),
        os.path.join(simplemodels_root, "sam3"),
        os.path.join(simplemodels_root, "sam3dbody"),
        os.path.join(simplemodels_root, "sams"),
        os.path.join(simplemodels_root, "qwen-tts"),
        os.path.join(simplemodels_root, "latent_upscale_models"),
        os.path.join(simplemodels_root, "hunyuan_foley"),
        ]
        for model_root in MODEL_PATHS_TO_SCAN:
            if not os.path.exists(model_root):
                continue
            for scan_root, _, files in os.walk(model_root):
                for file in files:
                    full_path = os.path.join(scan_root, file)
                    if _matches_obsolete(full_path, file, obsolete_basenames, obsolete_relpaths, simplemodels_root):
                        obsolete_files.append(full_path)


        if total_size > 0:
            non_missing_percentage = (non_missing_size / total_size) * 100
            package_percentages[package_name] = non_missing_percentage
            package_sizes[package_name] = total_size_gb

        if case_mismatch_files:
            print(f"{Fore.RED}×{package_name}中有文件名大小写不匹配，请检查以下文件:{Style.RESET_ALL}")
            for file, expected_filename in case_mismatch_files:
                print(f"文件: {normalize_path(file)}")
                time.sleep(0.1)
                print(f"正确文件名: {expected_filename}")

                corrected_file_path = os.path.join(os.path.dirname(file), expected_filename)
                os.rename(file, corrected_file_path)
                print(f"{Fore.GREEN}文件名已更正为: {expected_filename}{Style.RESET_ALL}")

        if size_mismatch_files:
            print(f"{Fore.RED}×{package_name}中有文件大小不匹配，可能存在下载不完全或损坏，请检查列出的文件。{Style.RESET_ALL}")
            for expected_path, local_file, actual_size, expected_size in size_mismatch_files:
                normalized_path = normalize_path(expected_path)
                print(f"{normalized_path} 当前大小={actual_size}, 预期大小={expected_size}")
                time.sleep(0.1)

                corrupted_file_path = get_unique_filename(local_file)
                os.rename(local_file, corrupted_file_path)
                print(f"{Fore.YELLOW}文件已重命名为: {normalize_path(corrupted_file_path)}（大小不匹配）{Style.RESET_ALL}")

                download_files[expected_path] = expected_size
                if package_name not in missing_package_names:
                    missing_package_names.append(package_name)

        if missing_files:
            print(f"{Fore.RED}×{package_name}有文件缺失，请检查以下文件:{Style.RESET_ALL}")
            for file, expected_size in missing_files:
                print(normalize_path(file))
                download_files[file] = expected_size
            if package_name not in missing_package_names:
                missing_package_names.append(package_name)
        if not missing_files and not size_mismatch_files and not case_mismatch_files:
            print(f"{Fore.GREEN}√{package_name}文件全部验证通过{Style.RESET_ALL}")

        if download_links:
            for link in download_links:
                print(f"{Fore.YELLOW}模型介绍链接-->  {link}{Style.RESET_ALL}")


    if missing_package_names:
        print(f"{Fore.RED}△以下模型包缺失文件，请选择你想要的模块下载：{Style.RESET_ALL}")
        for package_name in missing_package_names:
            percentage = package_percentages.get(package_name, 0)
            total_size_gb = package_sizes.get(package_name, 0)

            missing_size_gb = total_size_gb * (1 - (percentage / 100))
            print(f"- {package_name} - 总大小：{total_size_gb:.2f}GB，完整度：{percentage:.2f}%，尚需下载：{missing_size_gb:.2f}GB")
    if obsolete_files:
        # 新增空间计算
        total_obsolete_size = 0
        for file in obsolete_files:
            try:
                total_obsolete_size += os.path.getsize(file)
            except:
                pass
        print(f"\n{Fore.YELLOW}△发现以下可删除的废弃模型：{Style.RESET_ALL}")
        for file in obsolete_files:
            print(f"  {file}")
        # 新增空间显示
        print(f"{Fore.CYAN}※这些模型已被新版替代，可节省空间: {total_obsolete_size/1024/1024/1024:.2f}GB (按0+回车清理时选择删除){Style.RESET_ALL}")

    sorted_download_files = sorted(download_files.items(), key=lambda x: x[1])

    if sorted_download_files:
        with open("downloadlist.txt", "w") as f1, open("缺失模型下载链接.txt", "w") as f2:
            for file, size in sorted_download_files:
                entry = entry_by_expected_path.get(file)
                if entry:
                    link = select_download_url(entry)
                else:
                    link = f"{CURRENT_DOWNLOAD_PREFIX}SimpleModels/{file}"

                if not link:
                    print(f"{Fore.RED}×无法生成下载链接(缺少当前下载源URL): {file}{Style.RESET_ALL}")
                    continue

                f1.write(f"{link},{size}\n")
                f2.write(f"{link}\n")
        print(f"{Fore.YELLOW}>>>问题文件的文件下载链接已保存到 '缺失模型下载链接.txt'。<<<<<<<<<<<<<<<<<<<<<{Style.RESET_ALL}")

def get_package_status(packages, package_ids=None):
    path_mapping = load_model_paths()
    filtered_packages = filter_packages_by_gpu_arch(packages)
    if package_ids is not None:
        id_set = set(package_ids)
        filtered_packages = {
            k: v for k, v in filtered_packages.items()
            if v.get("id") in id_set
        }
    root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    result = []
    for package_key, package_info in filtered_packages.items():
        package_name = package_info.get("name")
        package_note = package_info.get("note", "")
        files_and_sizes = package_info.get("files", [])
        parsed_entries = list(iter_package_file_entries(files_and_sizes))
        total_size = sum(e["size"] for e in parsed_entries)
        non_missing_size = 0
        file_statuses = []
        for entry in parsed_entries:
            expected_path = entry["expected_path"]
            expected_size = entry["size"]
            path_parts = expected_path.split('/')
            path_type = path_parts[0] if len(path_parts) > 0 else ''
            sub_path = '/'.join(path_parts[1:]) if len(path_parts) > 1 else ''
            search_dirs = sorted(
                _get_search_dirs(path_mapping, path_type),
                key=lambda x: (
                    0 if "SimpleModels" in x else
                    1 if any(part == "models" for part in x.split(os.sep)) else
                    2,
                    x
                )
            )
            if not search_dirs:
                simplemodels_default = os.path.join(root, "SimpleModels")
                search_dirs = [os.path.join(simplemodels_default, path_type)]
            found = False
            actual_dir = None
            for base_dir in search_dirs:
                full_path = os.path.join(base_dir, sub_path) if sub_path else os.path.join(base_dir, os.path.basename(expected_path))
                if os.path.exists(full_path):
                    actual_dir = os.path.dirname(full_path)
                    found = True
                    break
            status_name = "missing"
            actual_path = None
            actual_size = None
            if found and actual_dir:
                try:
                    directory_listing = os.listdir(actual_dir)
                except Exception:
                    status_name = "missing"
                else:
                    expected_filename = os.path.basename(expected_path)
                    actual_filename = next((f for f in directory_listing if f.lower() == expected_filename.lower()), None)
                    if actual_filename is None:
                        status_name = "missing"
                    elif actual_filename != expected_filename:
                        status_name = "case_mismatch"
                        actual_path = os.path.join(actual_dir, actual_filename)
                        try:
                            actual_size = os.path.getsize(actual_path)
                        except Exception:
                            actual_size = None
                    else:
                        actual_path = os.path.join(actual_dir, actual_filename)
                        try:
                            actual_size = os.path.getsize(actual_path)
                        except Exception:
                            actual_size = None
                        if actual_size is not None and actual_size != expected_size:
                            status_name = "size_mismatch"
                        else:
                            status_name = "ok"
                            non_missing_size += expected_size
            file_statuses.append(
                {
                    "path_type": entry.get("path_type"),
                    "relative_path": entry.get("relative_path"),
                    "expected_path": expected_path,
                    "size": expected_size,
                    "status": status_name,
                    "actual_path": actual_path,
                    "actual_size": actual_size,
                }
            )
        completeness = 0.0
        if total_size > 0:
            completeness = (non_missing_size / total_size) * 100
        result.append(
            {
                "key": package_key,
                "id": package_info.get("id"),
                "name": package_name,
                "note": package_note,
                "info_links": get_package_info_links(package_info),
                "total_size": total_size,
                "present_size": non_missing_size,
                "completeness": completeness,
                "files": file_statuses,
            }
        )
    return result


def _build_entry_index(packages):
    entry_index = {}
    for pkg in packages.values():
        for entry in iter_package_file_entries(pkg.get("files", [])):
            expected_path = entry.get("expected_path")
            if expected_path:
                entry_index[expected_path] = entry
    return entry_index


def _write_and_start_download(entries):
    unique = {}
    for url, size in entries:
        if not url:
            continue
        if url not in unique or size < unique[url]:
            unique[url] = size
    if not unique:
        print("没有缺失文件需要下载！")
        return
    with open("downloadlist.txt", "w", encoding="utf-8") as f:
        for url, size in sorted(unique.items(), key=lambda x: x[1]):
            f.write(f"{url},{size}\n")
    print(f"{Fore.YELLOW}>>>下载列表已生成，开始下载（关闭窗口可中断）。<<<{Style.RESET_ALL}")
    auto_download_missing_files_with_retry(max_threads=5)


def download_missing_for_packages(package_ids):
    status_list = get_package_status(packages, package_ids)
    entry_index = _build_entry_index(packages)
    download_entries = []
    for pkg_status in status_list:
        for file_info in pkg_status.get("files", []):
            status_name = file_info.get("status")
            if status_name in ("ok", None):
                continue
            expected_path = file_info.get("expected_path")
            entry = entry_index.get(expected_path)
            if not entry:
                continue
            url = select_download_url(entry)
            size = entry.get("size", 0) or 0
            download_entries.append((url, size))
    _write_and_start_download(download_entries)


def download_files_by_expected_paths(expected_paths):
    cleaned = []
    for p in expected_paths:
        p = str(p).strip().strip(";")
        if p and p not in cleaned:
            cleaned.append(p)
    if not cleaned:
        print(f"{Fore.RED}△未指定要下载的文件{Style.RESET_ALL}")
        return
    entry_index = _build_entry_index(packages)
    status_list = get_package_status(packages, None)
    status_by_expected = {}
    for pkg_status in status_list:
        for file_info in pkg_status.get("files", []):
            expected_path = file_info.get("expected_path")
            if expected_path:
                status_by_expected[expected_path] = file_info.get("status")
    download_entries = []
    for expected_path in cleaned:
        entry = entry_index.get(expected_path)
        if not entry:
            print(f"{Fore.RED}△无法识别文件: {expected_path}{Style.RESET_ALL}")
            continue
        status_name = status_by_expected.get(expected_path)
        if status_name == "ok":
            print(f"{Fore.GREEN}√文件已存在: {expected_path}{Style.RESET_ALL}")
            continue
        url = select_download_url(entry)
        size = entry.get("size", 0) or 0
        if not url:
            print(f"{Fore.RED}△没有可用下载链接: {expected_path}{Style.RESET_ALL}")
            continue
        download_entries.append((url, size))
    _write_and_start_download(download_entries)

def delete_partial_files():
    global OBSOLETE_MODELS
    try:
        path_mapping = load_model_paths()
    except Exception as e:
        print(f"{Fore.RED}△路径配置加载失败: {str(e)}{Style.RESET_ALL}")
        return

    scan_dirs = []
    for category in MODEL_SCAN_CATEGORIES:
        scan_dirs.extend(path_mapping.get(category, []))

    total_size = 0
    files_found = False
    files_to_delete = []
    obsolete_files_found = []  # 新增废弃文件存储
    obsolete_basenames, obsolete_relpaths = _split_obsolete_specs(OBSOLETE_MODELS)

    for model_dir in scan_dirs:
        if not os.path.exists(model_dir):
            print(f"{Fore.YELLOW}△跳过不存在目录: {model_dir}{Style.RESET_ALL}")
            continue

        print(f"{Fore.CYAN}△扫描目录: {model_dir}{Style.RESET_ALL}")

        for root, _, files in os.walk(model_dir):
            for file in files:
                if ".partial" in file or ".corrupted" in file:
                    file_path = os.path.join(root, file)
                    files_found = True
                    files_to_delete.append(file_path)
                    try:
                        total_size += os.path.getsize(file_path)
                    except:
                        pass
                file_path = os.path.join(root, file)
                if _matches_obsolete(file_path, file, obsolete_basenames, obsolete_relpaths, simplemodels_root):
                    obsolete_files_found.append(file_path)
                    files_found = True
    if files_found:
        if files_to_delete:
            print(f"{Fore.YELLOW}△以下未下载完或损坏的文件将被删除：{Style.RESET_ALL}")
            for file_path in files_to_delete:
                print(f"- {file_path}")

        obsolete_total = sum(os.path.getsize(f) for f in obsolete_files_found if os.path.exists(f))

        if obsolete_files_found:
            print(f"\n{Fore.YELLOW}△以下废弃模型文件将被删除：{Style.RESET_ALL}")
            for file in obsolete_files_found:
                print(f"  {file}")
        all_files_to_delete = files_to_delete + obsolete_files_found

        print(f"{Fore.CYAN}△可清理的磁盘空间: {(total_size + obsolete_total) / (1024 * 1024):.2f} MB{Style.RESET_ALL}")
        print(f"{Fore.GREEN}△是否确认删除这些文件？(y/n): {Style.RESET_ALL}", flush=True)
        confirm = input()
        if confirm.lower() == 'y':
            success_count = 0
            for file_path in all_files_to_delete:
                try:
                    os.remove(file_path)
                    print(f"{Fore.GREEN}√已删除: {file_path}{Style.RESET_ALL}")
                    success_count += 1
                except Exception as e:
                    print(f"{Fore.RED}×删除失败[{file_path}]: {str(e)}{Style.RESET_ALL}")
            print(f"操作完成！成功删除 {success_count}/{len(all_files_to_delete)} 个文件")
        else:
            print(f"{Fore.RED}△删除操作已取消{Style.RESET_ALL}")
    else:
        print(">>>未找到需要删除的临时/损坏文件<<<")


def _find_obsolete_model_files():
    path_mapping = load_model_paths()

    scan_dirs = []
    for category in MODEL_SCAN_CATEGORIES:
        scan_dirs.extend(path_mapping.get(category, []))

    found = []
    obsolete_basenames, obsolete_relpaths = _split_obsolete_specs(OBSOLETE_MODELS)
    for model_dir in scan_dirs:
        if not os.path.exists(model_dir):
            continue
        for root, _, files in os.walk(model_dir):
            for file in files:
                file_path = os.path.join(root, file)
                if _matches_obsolete(file_path, file, obsolete_basenames, obsolete_relpaths, simplemodels_root):
                    found.append(file_path)
    return found


def _print_obsolete_models_report():
    try:
        obsolete_files = _find_obsolete_model_files()
    except Exception:
        return

    if not obsolete_files:
        return

    total_size = 0
    for file_path in obsolete_files:
        try:
            total_size += os.path.getsize(file_path)
        except Exception:
            pass

    print(f"\n{Fore.YELLOW}△发现以下可删除的废弃模型：{Style.RESET_ALL}")
    for file_path in obsolete_files:
        print(f"  {file_path}")
    print(f"{Fore.CYAN}※这些模型已被新版替代，可节省空间: {total_size/1024/1024/1024:.2f}GB{Style.RESET_ALL}")

def _load_comfyd_inputs_excludes(users_dir: str) -> set[str]:
    excludes: list[str] = ["welcome.png", "0.png", "1.png", "2.png", "3.png", "4.png", "5.png", "6.png", "7.png", "8.png", "9.png", "10.png",
    "11.png", "12.png", "13.png", "14.png", "audio_example.mp3", "example.jpg", "example.mp4", "example.png", "ghibi.png", "mask.mp4", "motion_signal.mp4",
    "papercut.png","ttm_example.jpeg", "白瓷雕像风格参考.webp", "人脸修复-风格参考-肖像摄影3.jpg"]
    config_path = os.path.join(str(users_dir), "config.txt")
    raw = ""
    try:
        raw = open(config_path, "r", encoding="utf-8").read()
    except Exception:
        try:
            raw = open(config_path, "r", encoding="gbk").read()
        except Exception:
            raw = ""
    if raw:
        try:
            config = json.loads(raw)
        except Exception:
            config = {}
        value = config.get("cleanup_comfyd_inputs_excludes")
        if isinstance(value, list):
            excludes.extend([str(x) for x in value if str(x).strip()])
    return {str(x).strip().lower() for x in excludes if str(x).strip()}

def delete_specific_image_files():
    """
    从相对路径查找并删除常见媒体文件（图片/动图/视频），支持排除列表。
    """
    users_dir = os.path.join(root_dir, "users")
    if not os.path.isdir(users_dir):
        users_dir = find_users_dir(os.path.dirname(os.path.abspath(__file__)))
    if not users_dir:
        print(f"{Fore.RED}△未找到 users 目录{Style.RESET_ALL}")
        return
    candidates = []
    for workspace_name in ("Local", "guest_user"):
        comfyd_inputs_dir = os.path.join(users_dir, workspace_name, "comfyd_inputs")
        if os.path.isdir(comfyd_inputs_dir):
            candidates.append(comfyd_inputs_dir)
    comfy_input_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "comfy", "input")
    if os.path.exists(comfy_input_dir):
        candidates.append(comfy_input_dir)
    if not candidates:
        print(f"{Fore.RED}△未找到可清理的输入目录{Style.RESET_ALL}")
        return

    print(f"{Fore.CYAN}△正在清理输入目录中的临时图片/视频缓存...{Style.RESET_ALL}")

    total_size = 0
    files_found = False
    files_to_delete = []
    allowed_exts = {
        ".png",
        ".webp",
        ".jpg",
        ".jpeg",
        ".gif",
        ".mp3",
        ".mp4",
        ".webm",
        ".mkv",
        ".mov",
        ".avi",
        ".m4v",
        ".wmv",
    }
    excludes = _load_comfyd_inputs_excludes(users_dir)

    for target_dir in candidates:
        for root, _, files in os.walk(target_dir):
            for file in files:
                if not file:
                    continue
                lower = file.lower()
                if lower in excludes:
                    continue
                _, ext = os.path.splitext(lower)
                if ext in allowed_exts:
                    files_found = True
                    file_path = os.path.join(root, file)
                    files_to_delete.append(file_path)
                    total_size += os.path.getsize(file_path)
    if files_found:
        print(f"{Fore.YELLOW}△以下临时图片/视频缓存文件将被删除：{Style.RESET_ALL}")
        for file_path in files_to_delete:
            print(f"- {file_path}")
        print(f"{Fore.CYAN}△可清理的磁盘空间: {total_size / (1024 * 1024):.2f} MB{Style.RESET_ALL}")
        print(f"{Fore.GREEN}△是否确认删除这些文件？(y/n): {Style.RESET_ALL}", flush=True)
        confirm = input()
        if confirm.lower() == 'y':
            for file_path in files_to_delete:
                try:
                    os.remove(file_path)
                    print(f"{Fore.GREEN}√已删除文件: {file_path}{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}△删除文件时出错: {file_path}, 错误原因: {e}{Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}△删除操作已取消。{Style.RESET_ALL}")
    else:
        print(">>>未找到需要删除的临时图片/视频缓存<<<")
        print()

def delete_log_files():
    """
    删除与脚本所在位置一致的 logs 目录下的所有 .logs 文件
    """
    script_logs_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    root_logs_dir = os.path.join(root_dir, "logs")

    candidates = []
    if os.path.isdir(root_logs_dir):
        candidates.append(root_logs_dir)
    if os.path.isdir(script_logs_dir) and os.path.normcase(script_logs_dir) != os.path.normcase(root_logs_dir):
        candidates.append(script_logs_dir)

    if not candidates:
        print(f"{Fore.RED}△未找到指定日志目录: {root_logs_dir}{Style.RESET_ALL}")
        return

    print(f"{Fore.CYAN}△正在清理日志文件...{Style.RESET_ALL}")

    total_size = 0
    files_to_delete = []
    seen = set()

    for logs_dir in candidates:
        try:
            for root, _, files in os.walk(logs_dir):
                for file in files:
                    if not file.endswith(".log"):
                        continue
                    file_path = os.path.join(root, file)
                    key = os.path.normcase(os.path.normpath(file_path))
                    if key in seen:
                        continue
                    seen.add(key)
                    files_to_delete.append(file_path)
                    total_size += os.path.getsize(file_path)
        except Exception:
            continue

    if files_to_delete:
        print(f"{Fore.YELLOW}△以下日志文件将被删除：{Style.RESET_ALL}")
        for file_path in files_to_delete:
            print(f"- {file_path}")

        print(f"{Fore.CYAN}△可清理的磁盘空间: {total_size / (1024 * 1024):.2f} MB{Style.RESET_ALL}")
        print(f"{Fore.GREEN}△是否确认删除这些日志文件？(y/n): {Style.RESET_ALL}", flush=True)
        confirm = input()
        if confirm.lower() == 'y':
            for file_path in files_to_delete:
                try:
                    os.remove(file_path)
                    print(f"{Fore.GREEN}√已删除日志文件: {file_path}{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}△删除文件时出错: {file_path}, 错误原因: {e}{Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}△删除操作已取消。{Style.RESET_ALL}")
    else:
        print(">>>未找到需要删除的日志文件<<<")
        print()

def download_file_with_resume(link, file_path, position, result_queue, max_retries=5, lock=None, expected_path=None, expected_total_size=None):
    partial_file_path = file_path + ".partial"
    retries = 0
    while retries < max_retries:
        try:
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            if os.path.exists(partial_file_path):
                resume_size = os.path.getsize(partial_file_path)
                headers = {'Range': f"bytes={resume_size}-"}
            else:
                resume_size = 0
                headers = {}

            response = requests.get(link, stream=True, headers=headers, timeout=(30, 60))

            mode = 'ab'
            try:
                total_size = int(expected_total_size) if expected_total_size is not None else 0
            except Exception:
                total_size = 0
            if total_size < 0:
                total_size = 0
            if response.status_code == 200:
                resume_size = 0
                mode = 'wb'
                header_size = int(response.headers.get('content-length', 0) or 0)
                if total_size <= 0 and header_size > 0:
                    total_size = header_size
            elif response.status_code == 206:
                content_range = response.headers.get('content-range', '')
                match = re.search(r'/(\d+)$', content_range)
                if total_size <= 0 and match:
                    total_size = int(match.group(1))
                else:
                    header_size = int(response.headers.get('content-length', 0) or 0)
                    if total_size <= 0 and header_size > 0:
                        total_size = header_size + resume_size
            else:
                header_size = int(response.headers.get('content-length', 0) or 0)
                if total_size <= 0 and header_size > 0:
                    total_size = header_size + resume_size

            block_size = 8192
            current_size = resume_size
            last_report_size = resume_size
            last_report_time = time.time()

            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            start_time = time.time()
            last_update_time = start_time

            with open(partial_file_path, mode) as file, tqdm(
                    desc=os.path.basename(file_path),
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    position=position,
                    initial=resume_size,
                    dynamic_ncols=True,
                    leave=False,
                    file=sys.stdout,
                    miniters=1,
                    mininterval=0.1,
                    disable=LAUNCHER_MODE
            ) as progress_bar:
                for data in response.iter_content(block_size):
                    chunk_len = len(data)
                    if not chunk_len:
                        continue
                    file.write(data)
                    progress_bar.update(chunk_len)
                    current_size += chunk_len

                    if expected_path and total_size > 0:
                        now = time.time()
                        size_delta = current_size - last_report_size
                        need_report = False
                        if current_size >= total_size:
                            need_report = True
                        elif size_delta >= max(total_size * 0.01, 1024 * 1024):
                            need_report = True
                        elif now - last_report_time >= 0.5:
                            need_report = True
                        if need_report and LAUNCHER_MODE:
                            print(f"__SIMPLEAI_PROGRESS__ {expected_path} {current_size} {total_size}", flush=True)
                            last_report_size = current_size
                            last_report_time = now

                    current_time = time.time()
                    if current_time - last_update_time > 60:
                        raise requests.exceptions.Timeout("下载超时，超过60秒没有数据")
                    last_update_time = current_time

                file.flush()
                os.fsync(file.fileno())

                downloaded_size = os.path.getsize(partial_file_path)
                if downloaded_size <= 0:
                    raise requests.exceptions.RequestException("文件大小校验失败：下载结果为空")
                if total_size > 0 and downloaded_size != total_size:
                    raise requests.exceptions.RequestException(f"文件大小校验失败：预期 {total_size} 字节，实际 {downloaded_size} 字节")

            final_file_path = os.path.normpath(file_path)
            partial_file_path = os.path.normpath(partial_file_path)
            os.rename(partial_file_path, final_file_path)

            try:
                official_sha256 = get_modelscope_file_sha256(link, verbose=False)
                if official_sha256:
                    local_sha256 = calculate_sha256(final_file_path)
                    if local_sha256.lower() != official_sha256.lower():
                        os.remove(final_file_path)
                        raise requests.exceptions.RequestException(f"SHA256校验失败 (预期: {official_sha256}, 实际: {local_sha256})")
            except Exception as e:
                if "SHA256校验失败" in str(e):
                    raise e

            tqdm.write(f"{Fore.GREEN}√下载完成：{final_file_path}{Style.RESET_ALL}")

            if lock:
                with lock:
                    remove_link_from_downloadlist(link)

            result_queue.put(True)
            return

        except (requests.exceptions.RequestException, requests.exceptions.Timeout) as e:
            tqdm.write(f"{Fore.RED}△下载失败，正在重试... 错误：{e}{Style.RESET_ALL}")
            retries += 1
            time.sleep(5)
        except Exception as e:
            tqdm.write(f"{Fore.RED}发生错误：{e}{Style.RESET_ALL}")
            result_queue.put(False)
            return

    tqdm.write(f"△下载链接失败：{link}")
    result_queue.put(False)

def remove_link_from_downloadlist(link):
    """
    删除下载列表中已成功下载的条目
    :param link: 下载链接
    :return: None
    """
    with open("downloadlist.txt", "r") as f:
        lines = f.readlines()

    with open("downloadlist.txt", "w") as f:
        for line in lines:
            if link.strip() not in line.strip():
                f.write(line)
def trigger_manual_download():
    """手动触发指定文件下载"""
    path_mapping = load_model_paths()

    for link in MANUAL_DOWNLOAD_LIST:
        if "SimpleModels/" in link:
            path_part = link.split("SimpleModels/", 1)[1]
            path_parts = path_part.split('/')
            path_type = path_parts[0]
            rel_path = '/'.join(path_parts[1:])
        else:
            continue

        sorted_base_dir = sorted(
            _get_download_base_dirs(path_type, path_mapping),
            key=lambda x: (
                0 if "SimpleModels" in x else
                1 if any(part == "models" for part in x.split(os.sep)) else 2,
                x
            )
        )

        target_base_dir = None
        for base_dir in sorted_base_dir:
            if os.path.exists(base_dir):
                target_base_dir = base_dir
                break
        if not target_base_dir:
            for base_dir in sorted_base_dir:
                if not _path_drive_available(base_dir):
                    continue
                try:
                    os.makedirs(base_dir, exist_ok=True)
                    target_base_dir = base_dir
                    break
                except Exception:
                    continue
        if not target_base_dir:
            continue

        file_name = os.path.basename(link)
        save_path = os.path.join(target_base_dir, rel_path)

        if os.path.exists(save_path):
            print(f"{Fore.GREEN}△文件已存在，跳过下载: {save_path}{Style.RESET_ALL}")
            continue

        print(f"{Fore.CYAN}△开始下载: {file_name}{Style.RESET_ALL}")
        result_queue = queue.Queue()
        expected_path = None
        if link in url_index:
            path_type, rel_path = url_index[link]
            expected_path = f"{path_type}/{rel_path}"
        download_file_with_resume(link, save_path, 0, result_queue, expected_path=expected_path)

def auto_download_missing_files_with_retry(max_threads=5):
    if not os.path.exists("downloadlist.txt"):
        print("未找到 'downloadlist.txt' 文件。")
        return

    with open("downloadlist.txt", "r") as f:
        links = f.readlines()

    if not links:
        print("没有缺失文件需要下载！")
        return

    path_mapping = load_model_paths()
    url_index = build_url_index(packages)
    result_queue = queue.Queue()
    lock = threading.Lock()

    task_queue = queue.Queue()
    # position 不再直接使用索引，而是通过 Slot 机制动态分配
    for index, line in enumerate(links):
        task_queue.put(line.strip())

    # 创建可用 Slot 队列，限制同时显示的进度条数量等于线程数
    position_slots = queue.Queue()
    for i in range(max_threads):
        position_slots.put(i)

    def worker():
        while not task_queue.empty():
            try:
                line = task_queue.get_nowait()

                # 获取一个可用的 Slot 用于显示进度条
                try:
                    position = position_slots.get(timeout=30)
                except queue.Empty:
                    # 理论上不应发生，但作为防守
                    position = 0 

                link, size_str = line.rsplit(',', 1)
                expected_total_size = int(size_str)
                size_mb = expected_total_size / (1024 * 1024)

                # 使用 tqdm.write 避免破坏进度条
                tqdm.write(f"{Fore.CYAN}▶ 正在下载: {link} ({size_mb:.1f}MB){Style.RESET_ALL}")

                path_type = "default"
                rel_path = os.path.basename(link)
                if link in url_index:
                    path_type, rel_path = url_index[link]
                elif link.startswith(CURRENT_DOWNLOAD_PREFIX) and "SimpleModels/" in link:
                    path_part = link.split("SimpleModels/", 1)[1].strip("/")
                    path_parts = path_part.split("/", 1)
                    path_type = path_parts[0] if path_parts else "default"
                    rel_path = path_parts[1] if len(path_parts) > 1 else os.path.basename(path_part)
                else:
                    url_parts = link.split('/')
                    possible_types = ["checkpoints", "loras", "controlnet", "embeddings", "vae", "inpaint", "ipadapter", "diffusion_models", "text_encoders", "clip", "clip_vision", "upscale_models", "sam3dbody", "birefnet", "sharp"]
                    for part in url_parts:
                        if part.lower() in possible_types:
                            path_type = part.lower()
                            break
                    rel_path = os.path.basename(link)

                sorted_base_dir = sorted(
                    _get_download_base_dirs(path_type, path_mapping),
                    key=lambda x: (
                        0 if "SimpleModels" in x else
                        1 if any(part == "models" for part in x.split(os.sep)) else
                        2,
                        x
                    )
                )
                if not sorted_base_dir:
                    sorted_base_dir = [os.path.join(simplemodels_root, path_type)]

                target_base_dir = None
                for base_dir in sorted_base_dir:
                    if os.path.exists(base_dir):
                        target_base_dir = base_dir
                        break

                if not target_base_dir:
                    default_base_dir = os.path.join(simplemodels_root, path_type)
                    if ensure_model_root_exists(simplemodels_root) and not sorted_base_dir:
                        try:
                            os.makedirs(default_base_dir, exist_ok=True)
                            target_base_dir = default_base_dir
                            tqdm.write(f"{Fore.YELLOW}△自动创建缺失目录: {target_base_dir}{Style.RESET_ALL}")
                        except Exception:
                            target_base_dir = None

                if not target_base_dir:
                    for base_dir in sorted_base_dir:
                        if not _path_drive_available(base_dir):
                            continue
                        try:
                            os.makedirs(base_dir, exist_ok=True)
                            target_base_dir = base_dir
                            tqdm.write(f"{Fore.YELLOW}△自动创建缺失目录: {target_base_dir}{Style.RESET_ALL}")
                            break
                        except Exception:
                            continue

                if not target_base_dir:
                    tqdm.write(f"{Fore.RED}×未找到可用的下载目录（已跳过不可用盘符）: {path_type}{Style.RESET_ALL}")
                    position_slots.put(position)
                    task_queue.task_done()
                    continue

                rel_path_local = rel_path.replace("/", os.sep)
                file_name = os.path.basename(rel_path_local)
                file_sub_dir = os.path.dirname(rel_path_local)
                save_dir = os.path.join(target_base_dir, file_sub_dir)
                file_path = os.path.join(save_dir, file_name)
                expected_path = None
                if link in url_index:
                    path_type, rel_path = url_index[link]
                    expected_path = f"{path_type}/{rel_path}"
                download_file_with_resume(link, file_path, position, result_queue, 5, lock, expected_path=expected_path, expected_total_size=expected_total_size)

                # 下载完成（无论成功失败），归还 Slot
                position_slots.put(position)
                task_queue.task_done()
            except queue.Empty:
                break

    threads = []
    for _ in range(max_threads):
        t = threading.Thread(target=worker)
        t.start()
        threads.append(t)

    task_queue.join()

    success_count = 0
    fail_count = 0

    while not result_queue.empty():
        success = result_queue.get()
        if success:
            success_count += 1
        else:
            fail_count += 1

    print(f"√下载成功：{success_count}个")
    print(f"×下载失败：{fail_count}个")

    if fail_count == 0 and success_count > 0:
        if os.path.exists("downloadlist.txt"):
            os.remove("downloadlist.txt")
            print("√下载完成")
            if not LAUNCHER_MODE:
                print("√下载完成，执行重新检测")
                validate_files(packages)
    else:
        print(f"△有{fail_count}个文件下载失败，请检查网络连接或手动下载文件。")

def get_download_links_for_package(packages, download_list_path):
    """
    根据 packages 中的 files 列表生成路径，并与 downloadlist.txt 中的需求进行比对，
    更新 downloadlist.txt 中需要下载的文件，只保留 files 中有的文件链接。
    """
    if not os.path.exists(download_list_path):
        print(f"{Fore.RED}>>>downloadlist.txt不存在，输入【R】重新检测<<<{Style.RESET_ALL}")
        return []

    with open(download_list_path, "r") as f:
        existing_links = [line.strip().split(",")[0] for line in f.readlines()]

    allowed_links = {}
    for package_info in packages.values():
        for entry in iter_package_file_entries(package_info.get("files", [])):
            link = select_download_url(entry)
            if link:
                allowed_links[link] = entry["size"]

    valid_files = []
    added_links = set()
    with open(download_list_path, "r") as f:
        existing_lines = [line.strip() for line in f.readlines()]

    for line in existing_lines:
        existing_link = line.split(",")[0]
        if existing_link in allowed_links and existing_link in existing_links and existing_link not in added_links:
            valid_files.append((existing_link, allowed_links[existing_link]))
            added_links.add(existing_link)

    valid_files = sorted(valid_files, key=lambda x: x[1])

    with open(download_list_path, "w") as f:
        for link, size in valid_files:
            f.write(f"{link},{size}\n")

    print(f"{Fore.YELLOW}>>>下载列表已更新，开始下载（关闭窗口可中断）。<<<{Style.RESET_ALL}")

    return valid_files

def delete_package(package_name, packages):
    """删除指定模型包文件（基于config路径配置）"""
    try:
        path_mapping = load_model_paths()
    except Exception as e:
        print(f"{Fore.RED}× 路径配置加载失败: {str(e)}{Style.RESET_ALL}")
        return

    if package_name not in packages:
        print(f"{Fore.RED}× 无效的模型包名称！{Style.RESET_ALL}")
        return

    package = packages[package_name]
    print(f"\n{Fore.CYAN}△ 开始处理模型包：{package['name']}{Style.RESET_ALL}")

    file_refs = defaultdict(set)
    for pkg_name, pkg_info in packages.items():
        for entry in iter_package_file_entries(pkg_info.get("files", [])):
            file_type = entry["path_type"]
            rel_path = entry["relative_path"].replace("/", os.sep)
            candidate_paths = set()
            for base_dir in path_mapping.get(file_type, []):
                candidate_paths.add(os.path.join(base_dir, rel_path))
            candidate_paths.add(os.path.join(simplemodels_root, file_type, rel_path))
            for full_path in candidate_paths:
                if os.path.exists(full_path):
                    file_refs[full_path].add(pkg_name)

    delete_candidates: set[str] = set()
    shared_files: set[str] = set()

    for entry in iter_package_file_entries(package.get("files", [])):
        file_type = entry["path_type"]
        rel_path = entry["relative_path"].replace("/", os.sep)
        candidate_paths = set()
        for base_dir in path_mapping.get(file_type, []):
            candidate_paths.add(os.path.join(base_dir, rel_path))
        candidate_paths.add(os.path.join(simplemodels_root, file_type, rel_path))
        for full_path in candidate_paths:
            if not os.path.exists(full_path):
                continue
            if len(file_refs[full_path]) == 1 and package_name in file_refs[full_path]:
                delete_candidates.add(full_path)
            else:
                shared_files.add(full_path)

    if shared_files:
        print(f"\n{Fore.YELLOW}△ 以下文件被其他模型包共享：{Style.RESET_ALL}")
        for path in sorted(shared_files):
            print(f"  {path}")

    if delete_candidates:
        print(f"\n{Fore.YELLOW}△ 以下孤立文件将被删除：{Style.RESET_ALL}")
        total_size = 0
        for path in sorted(delete_candidates):
            try:
                size = os.path.getsize(path)
                print(f"  {path} ({size/1024/1024:.1f}MB)")
                total_size += size
            except:
                print(f"  {path} (大小未知)")

        print(f"{Fore.CYAN}△ 总计释放空间: {total_size/1024/1024/1024:.2f}GB{Style.RESET_ALL}")

        print(f"\n{Fore.GREEN}是否确认删除？(y/n): {Style.RESET_ALL}", flush=True)
        confirm = input()
        if confirm.lower() == 'y':
            success = 0
            for path in sorted(delete_candidates):
                try:
                    os.remove(path)
                    print(f"{Fore.GREEN}✓ 已删除: {path}{Style.RESET_ALL}")
                    success += 1
                except Exception as e:
                    print(f"{Fore.RED}× 删除失败: {path} ({str(e)}){Style.RESET_ALL}")

            print(f"\n{Fore.GREEN}✓ 模型包{package['name']}孤立文件已清除{Style.RESET_ALL}")
            if not LAUNCHER_MODE:
                validate_files(packages)
        else:
            print(f"{Fore.BLUE}× 操作已取消{Style.RESET_ALL}")
    else:
        print(f"{Fore.BLUE}△ 未找到可安全删除的文件{Style.RESET_ALL}")

def delete_package_force(package_name, packages):
    """强制删除指定模型包文件（不检查关联性）"""
    try:
        path_mapping = load_model_paths()
    except Exception as e:
        print(f"{Fore.RED}× 路径配置加载失败: {str(e)}{Style.RESET_ALL}")
        return

    if package_name not in packages:
        print(f"{Fore.RED}× 无效的模型包名称！{Style.RESET_ALL}")
        return

    package = packages[package_name]
    print(f"\n{Fore.RED}!!! 正在执行强制删除操作 !!!{Style.RESET_ALL}")
    print(f"{Fore.CYAN}△ 开始处理模型包：{package['name']}{Style.RESET_ALL}")

    delete_candidates: set[str] = set()

    for entry in iter_package_file_entries(package.get("files", [])):
        file_type = entry["path_type"]
        rel_path = entry["relative_path"].replace("/", os.sep)
        candidate_paths = set()
        for base_dir in path_mapping.get(file_type, []):
            candidate_paths.add(os.path.join(base_dir, rel_path))
        candidate_paths.add(os.path.join(simplemodels_root, file_type, rel_path))
        for full_path in candidate_paths:
            if os.path.exists(full_path):
                delete_candidates.add(full_path)

    if delete_candidates:
        print(f"\n{Fore.RED}△ 以下文件将被【强制删除】（不检查其他模型包依赖）：{Style.RESET_ALL}")
        total_size = 0
        for path in sorted(delete_candidates):
            try:
                size = os.path.getsize(path)
                print(f"  {path} ({size/1024/1024:.1f}MB)")
                total_size += size
            except:
                print(f"  {path} (大小未知)")

        print(f"{Fore.CYAN}△ 总计释放空间: {total_size/1024/1024/1024:.2f}GB{Style.RESET_ALL}")

        print(f"\n{Fore.RED}此操作不可逆且可能破坏其他模型包完整性，是否确认强制删除？(输入 'force' 确认): {Style.RESET_ALL}", flush=True)
        confirm = input().lower()
        if confirm == 'force':
            success = 0
            for path in sorted(delete_candidates):
                try:
                    os.remove(path)
                    print(f"{Fore.GREEN}✓ 已删除: {path}{Style.RESET_ALL}")
                    success += 1
                except Exception as e:
                    print(f"{Fore.RED}× 删除失败: {path} ({str(e)}){Style.RESET_ALL}")

            print(f"\n{Fore.GREEN}✓ 模型包{package['name']}文件已强制清除{Style.RESET_ALL}")
            if not LAUNCHER_MODE:
                validate_files(packages)
        else:
            print(f"{Fore.BLUE}× 操作已取消{Style.RESET_ALL}")
    else:
        print(f"{Fore.BLUE}△ 未找到该模型包的任何文件{Style.RESET_ALL}")

def get_gpu_arch_str():
    """获取GPU架构字符串，如sm120等"""
    try:
        import torch
        if torch.cuda.is_available():
            major, minor = torch.cuda.get_device_capability(0)
            arch_str = f"sm{major}{minor}"
            return arch_str
        else:
            return "cpu"
    except Exception as e:
        print(f"获取GPU架构失败: {e}", file=sys.stderr)
        return "cpu"

def filter_packages_by_gpu_arch(packages):
    """
    根据GPU架构过滤package
    - 当sm120时，只显示带fp4的package和其他无标识package
    - 当不等于sm120且高于10系显卡时，只显示带int4的package和其他无标识package
    - 对于10系及以下显卡，只显示无标识package
    - 当GPU小于等于20系时，不显示QwenEdit+双截棍量化包
    """
    # 获取GPU架构
    gpu_arch = get_gpu_arch_str()
    filtered_packages = {}

    is_legacy_gpu = False
    is_20_series_or_lower = False
    if gpu_arch.startswith('sm'):
        try:
            arch_number = int(gpu_arch[2:])
            # 计算能力<=61的视为10系及以下显卡
            is_legacy_gpu = arch_number <= 61
            # 计算能力<=75的视为20系及以下显卡（RTX 20系列计算能力为7.5）
            is_20_series_or_lower = arch_number <= 75
        except ValueError:
            pass

    for package_key, package_info in packages.items():
        package_name = package_info["name"]

        if is_20_series_or_lower and package_key in {
            "nun_int4_qwen_image_edit_plus_package",
            "nun_fp4_qwen_image_edit_plus_package",
        }:
            continue

        has_int4 = 'int4' in package_name.lower()
        has_fp4 = 'fp4' in package_name.lower()

        # 10系及以下显卡特殊处理：只保留无标识package
        if is_legacy_gpu:
            if not has_int4 and not has_fp4:
                filtered_packages[package_key] = package_info
        else:
            if has_int4 and has_fp4:
                continue

            if gpu_arch == 'sm120':
                if has_fp4 or (not has_int4 and not has_fp4):
                    filtered_packages[package_key] = package_info
            else:
                if has_int4 or (not has_int4 and not has_fp4):
                    filtered_packages[package_key] = package_info

    return filtered_packages

packages = {'base_package': {'id': 1,
                  'name': '[1]基础组件模型包[建议补全]',
                  'note': '包含运行所需中小型组件、预处理器、放大模型、翻译器',
                  'files': ['upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                            'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                            'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                            'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                            'clip_vision,clip_vision_h.safetensors,1264219396,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/clip_vision/clip_vision_h.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors',
                            'clip_vision,wd-eva02-large-tagger-v3.onnx,1260435999,0,https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.onnx,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/wd-eva02-large-tagger-v3.onnx',
                            'clip_vision,wd-eva02-large-tagger-v3.csv,308468,0,https://www.modelscope.cn/models/windecay/WD-tagger/resolve/master/wd-eva02-large-tagger-v3.csv,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/wd-eva02-large-tagger-v3.csv',
                            'clip_vision,clip-vit-large-patch14/merges.txt,524619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/clip-vit-large-patch14/merges.txt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/clip-vit-large-patch14/merges.txt',
                            'clip_vision,clip-vit-large-patch14/special_tokens_map.json,389,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/clip-vit-large-patch14/special_tokens_map.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/clip-vit-large-patch14/special_tokens_map.json',
                            'clip_vision,clip-vit-large-patch14/tokenizer_config.json,905,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/clip-vit-large-patch14/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/clip-vit-large-patch14/tokenizer_config.json',
                            'clip_vision,clip-vit-large-patch14/vocab.json,961143,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/clip-vit-large-patch14/vocab.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/clip-vit-large-patch14/vocab.json',
                            'configs,anything_v3.yaml,1933,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/anything_v3.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/anything_v3.yaml',
                            'configs,v1-inference.yaml,1873,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v1-inference.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v1-inference.yaml',
                            'configs,v1-inference_clip_skip_2.yaml,1933,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v1-inference_clip_skip_2.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v1-inference_clip_skip_2.yaml',
                            'configs,v1-inference_clip_skip_2_fp16.yaml,1956,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v1-inference_clip_skip_2_fp16.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v1-inference_clip_skip_2_fp16.yaml',
                            'configs,v1-inference_fp16.yaml,1896,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v1-inference_fp16.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v1-inference_fp16.yaml',
                            'configs,v1-inpainting-inference.yaml,1992,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v1-inpainting-inference.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v1-inpainting-inference.yaml',
                            'configs,v2-inference-v.yaml,1815,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v2-inference-v.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v2-inference-v.yaml',
                            'configs,v2-inference-v_fp32.yaml,1816,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v2-inference-v_fp32.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v2-inference-v_fp32.yaml',
                            'configs,v2-inference.yaml,1789,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v2-inference.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v2-inference.yaml',
                            'configs,v2-inference_fp32.yaml,1790,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v2-inference_fp32.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v2-inference_fp32.yaml',
                            'configs,v2-inpainting-inference.yaml,4450,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/configs/v2-inpainting-inference.yaml,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/configs/v2-inpainting-inference.yaml',
                            'controlnet,detection_Resnet50_Final.pth,109497761,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/detection_Resnet50_Final.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/detection_Resnet50_Final.pth',
                            'controlnet,fooocus_ip_negative.safetensors,65616,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/fooocus_ip_negative.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/fooocus_ip_negative.safetensors',
                            'controlnet,parsing_parsenet.pth,85331193,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_parsenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_parsenet.pth',
                            'controlnet,lllyasviel/Annotators/body_pose_model.pth,209267595,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/body_pose_model.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/body_pose_model.pth',
                            'controlnet,lllyasviel/Annotators/facenet.pth,153718792,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/facenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/facenet.pth',
                            'controlnet,lllyasviel/Annotators/hand_pose_model.pth,147341049,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/hand_pose_model.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/hand_pose_model.pth',
                            'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                            'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx',
                            'inpaint,fooocus_inpaint_head.pth,52602,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/fooocus_inpaint_head.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/fooocus_inpaint_head.pth',
                            'grounding-dino,groundingdino_swint_ogc.pth,693997677,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/groundingdino_swint_ogc.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/groundingdino_swint_ogc.pth',
                            'grounding-dino,GroundingDINO_SwinT_OGC.cfg.py,1006,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/inpaint/GroundingDINO_SwinT_OGC.cfg.py,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/GroundingDINO_SwinT_OGC.cfg.py',
                            'inpaint,isnet-anime.onnx,176069933,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/isnet-anime.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/isnet-anime.onnx',
                            'inpaint,isnet-general-use.onnx,178648008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/isnet-general-use.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/isnet-general-use.onnx',
                            'sams,sam_vit_b_01ec64.pth,375042383,0,https://www.modelscope.cn/models/muse/sam_vit_b_01ec64/resolve/master/sam_vit_b_01ec64.pth,https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_b_01ec64.pth',
                            'sams,sam_vit_l_0b3195.pth,1249524607,0,https://www.modelscope.cn/models/muse/sam_vit_l_0b3195/resolve/master/sam_vit_l_0b3195.pth,https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_l_0b3195.pth',
                            'inpaint,silueta.onnx,44173029,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/silueta.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/silueta.onnx',
                            'inpaint,u2net.onnx,175997641,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/u2net.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/u2net.onnx',
                            'inpaint,u2netp.onnx,4574861,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/u2netp.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/u2netp.onnx',
                            'inpaint,u2net_cloth_seg.onnx,176194565,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/u2net_cloth_seg.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/u2net_cloth_seg.onnx',
                            'inpaint,u2net_human_seg.onnx,175997641,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/u2net_human_seg.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/u2net_human_seg.onnx',
                            'llms,bert-base-uncased/config.json,570,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/bert-base-uncased/config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/bert-base-uncased/config.json',
                            'llms,bert-base-uncased/model.safetensors,440449768,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/bert-base-uncased/model.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/bert-base-uncased/model.safetensors',
                            'llms,bert-base-uncased/tokenizer.json,466062,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/bert-base-uncased/tokenizer.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/bert-base-uncased/tokenizer.json',
                            'llms,bert-base-uncased/tokenizer_config.json,28,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/bert-base-uncased/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/bert-base-uncased/tokenizer_config.json',
                            'llms,bert-base-uncased/vocab.txt,231508,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/bert-base-uncased/vocab.txt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/bert-base-uncased/vocab.txt',
                            'llms,Helsinki-NLP/opus-mt-zh-en/config.json,1394,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/config.json',
                            'llms,Helsinki-NLP/opus-mt-zh-en/generation_config.json,293,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/generation_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/generation_config.json',
                            'llms,Helsinki-NLP/opus-mt-zh-en/metadata.json,1477,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/metadata.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/metadata.json',
                            'llms,Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin,312087009,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin',
                            'llms,Helsinki-NLP/opus-mt-zh-en/source.spm,804677,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/source.spm,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/source.spm',
                            'llms,Helsinki-NLP/opus-mt-zh-en/target.spm,806530,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/target.spm,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/target.spm',
                            'llms,Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json,44,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json',
                            'llms,Helsinki-NLP/opus-mt-zh-en/vocab.json,1617902,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/vocab.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/vocab.json',
                            'llms,superprompt-v1/config.json,1512,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/config.json',
                            'llms,superprompt-v1/generation_config.json,142,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/generation_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/generation_config.json',
                            'llms,superprompt-v1/model.safetensors,307867048,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/model.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/model.safetensors',
                            'llms,superprompt-v1/README.md,3661,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/README.md,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/README.md',
                            'llms,superprompt-v1/spiece.model,791656,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/spiece.model,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/spiece.model',
                            'llms,superprompt-v1/tokenizer.json,2424064,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/tokenizer.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/tokenizer.json',
                            'llms,superprompt-v1/tokenizer_config.json,2539,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/superprompt-v1/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/superprompt-v1/tokenizer_config.json',
                            'rembg,RMBG-1.4.pth,176718373,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/rembg/RMBG-1.4.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/rembg/RMBG-1.4.pth',
                            'vae_approx,vaeapp_sd15.pth,213777,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae_approx/vaeapp_sd15.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae_approx/vaeapp_sd15.pth',
                            'vae_approx,xl-to-v1_interposer-v4.0.safetensors,5667280,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae_approx/xl-to-v1_interposer-v4.0.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae_approx/xl-to-v1_interposer-v4.0.safetensors',
                            'vae_approx,xlvaeapp.pth,213777,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae_approx/xlvaeapp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae_approx/xlvaeapp.pth',
                            'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                            'ultralytics,bbox/face_yolov8m.pt,52026019,0,https://www.modelscope.cn/models/ACCC1380/Adetailer_model/resolve/master/face_yolov8m.pt,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/ultralytics/bbox/face_yolov8m.pt',
                            'ultralytics,bbox/hand_yolov8s.pt,22507643,0,https://www.modelscope.cn/models/ACCC1380/Adetailer_model/resolve/master/hand_yolov8s.pt,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/ultralytics/bbox/hand_yolov8s.pt'],
                  'info_links': [],
                  'preset_sample': []},
 'Qwen3_package': {'id': 2,
                   'name': '[2]Qwen3.5-9B-abliterated-VLM',
                   'note': 'Local Qwen3.5 9B abliterated VLM GGUF pack. The UI selects quantization; default Q4_K_M, Q2_K is reserved for ultra-low-end machines.',
                   'files': ['LLM,Huihui-Qwen3.5-9B-abliterated/Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf,5627045248,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/LLM/Huihui-Qwen3.5-9B-abliterated/Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf,https://huggingface.co/mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf',
                             'LLM,Huihui-Qwen3.5-9B-abliterated/Huihui-Qwen3.5-9B-abliterated.mmproj-Q8_0.gguf,624229760,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/LLM/Huihui-Qwen3.5-9B-abliterated/Huihui-Qwen3.5-9B-abliterated.mmproj-Q8_0.gguf,https://huggingface.co/mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF/resolve/main/Huihui-Qwen3.5-9B-abliterated.mmproj-Q8_0.gguf'],
                   'info_links': ['https://modelscope.cn/models/Qwen/Qwen3.5-9B'],
                   'preset_sample': []},
 'z-image_package': {'id': 3,
                  'name': '[3]造相Z-Image-Turbo预置包',
                 'note': 'Z-image-Turbo-默认模型[Z-image-Turbo-int8]|显存需求：★★☆ 速度：★★★',
                 'files': ['diffusion_models,z_image_turbo_int8_convrot.safetensors,6201001296,0,https://modelscope.cn/models/Comfy-Org/z_image_turbo/resolve/master/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors',
                            'text_encoders,qwen_3_4b.safetensors,8044982048,0,https://www.modelscope.cn/models/VerStella/z_image_turbo_comfyui/resolve/master/split_files/text_encoders/qwen_3_4b.safetensors,https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
                            'model_patches,Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors,2016627488,0,https://www.modelscope.cn/models/PAI/Z-Image-Turbo-Fun-Controlnet-Union-2.1/resolve/master/Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors,https://huggingface.co/alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1/resolve/main/Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors',
                            'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                            'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                            'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                            'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                            'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                            'controlnet,parsing_parsenet.pth,85331193,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_parsenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_parsenet.pth',
                            'controlnet,lllyasviel/Annotators/body_pose_model.pth,209267595,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/body_pose_model.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/body_pose_model.pth',
                            'controlnet,lllyasviel/Annotators/facenet.pth,153718792,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/facenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/facenet.pth',
                            'controlnet,lllyasviel/Annotators/hand_pose_model.pth,147341049,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/hand_pose_model.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/hand_pose_model.pth',
                            'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                            'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                  'info_links': ['https://modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo'],
                  'preset_sample': []},
 'zit_ttp_package': {'id': 4,
                     'name': '[4]Z-Image_Turbo_TTP超清放大扩展包',
                     'note': 'Z-Image_Turbo_TTP超清放大|显存需求：★★★ 速度：★★',
                    'files': ['diffusion_models,z_image_turbo_int8_convrot.safetensors,6201001296,0,https://modelscope.cn/models/Comfy-Org/z_image_turbo/resolve/master/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_int8_convrot.safetensors',
                               'text_encoders,qwen_3_4b.safetensors,8044982048,0,https://www.modelscope.cn/models/VerStella/z_image_turbo_comfyui/resolve/master/split_files/text_encoders/qwen_3_4b.safetensors,https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
                               'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                               'vae,UltraFlux-vae_v1.safetensors,335306212,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/vae/UltraFlux-vae_v1.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/vae/UltraFlux-vae_v1.safetensors',
                               'SEEDVR2,ema_vae_fp16.safetensors,501324814,0,https://www.modelscope.cn/models/numz/SeedVR2_comfyUI/resolve/master/ema_vae_fp16.safetensors,https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors',
                               'SEEDVR2,seedvr2_ema_3b_fp16.safetensors,6783018808,0,https://www.modelscope.cn/models/numz/SeedVR2_comfyUI/resolve/master/seedvr2_ema_3b_fp16.safetensors,https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp16.safetensors'],
                     'info_links': ['https://modelscope.cn/models/Tongyi-MAI/Z-Image-Turbo',
                                    'https://modelscope.cn/models/numz/SeedVR2_comfyUI'],
                     'preset_sample': []},
 'qwen_aio_package': {'id': 5,
                      'name': '[5]Qwen_Image2512全功能预置包',
                      'note': 'Qwen_Image2512全功能预置包|显存需求：★★★★★ 速度:★★',
                      'files': ['diffusion_models,qwen_image_2512_fp8_e4m3fn.safetensors,20430679144,0,https://www.modelscope.cn/models/Comfy-Org/Qwen-Image_ComfyUI/resolve/master/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors,https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors',
                                'controlnet,Qwen-Image-InstantX-ControlNet-Union.safetensors,3536027816,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/Qwen-Image-InstantX-ControlNet-Union.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/Qwen-Image-InstantX-ControlNet-Union.safetensors',
                                'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                                'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                                'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors',
                                'loras,Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/lightx2v/Qwen-Image-2512-Lightning/resolve/master/Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-2512-Lightning/resolve/main/Qwen-Image-2512-Lightning-4steps-V1.0-bf16.safetensors',
                                'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                                'controlnet,Qwen-Image-InstantX-ControlNet-Inpainting.safetensors,4234599432,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/Qwen-Image-InstantX-ControlNet-Inpainting.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/Qwen-Image-InstantX-ControlNet-Inpainting.safetensors'],
                      'info_links': ['https://www.modelscope.cn/models/Qwen/Qwen-Image-2512'],
                      'preset_sample': []},
 'qwen_image_edit_plus_package': {'id': 6,
                                  'name': '[6]QwenEdit+2511图像编辑预置包',
                                  'note': 'Qwen_Image_Edit+2511指令编辑图像&自由视角&A2R动漫转真人|显存需求：★★★★★ 速度:★☆',
                                  'files': ['diffusion_models,qwen_image_edit_2511_fp8mixed.safetensors,20533762817,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors,https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors',
                                            'loras,Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
                                            'loras,Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
                                            'loras,bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors,307464216,0,https://www.modelscope.cn/models/Alissonerdx/BFS-Best-Face-Swap/resolve/20260309043408/bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors,https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap/resolve/main/bfs_head_v5_2511_merged_version_rank_16_fp16.safetensors',
                                            'detection,mediapipe_face_fp32.safetensors,5423900,0,https://www.modelscope.cn/models/Comfy-Org/mediapipe/resolve/master/detection/mediapipe_face_fp32.safetensors,https://huggingface.co/Comfy-Org/mediapipe/resolve/main/detection/mediapipe_face_fp32.safetensors',
                                            'loras,qwen-image-edit-2511-multiple-angles-lora.safetensors,295140688,0,https://www.modelscope.cn/models/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/master/qwen-image-edit-2511-multiple-angles-lora.safetensors,https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA/resolve/main/qwen-image-edit-2511-multiple-angles-lora.safetensors',
                                            'loras,anything2real_2601_A_final_patched.safetensors,613580128,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/anything2real_2601_A_final_patched.safetensors,https://huggingface.co/lrzjason/Anything2Real_2601/resolve/main/anything2real_2601_A_final_patched.safetensors',
                                            'loras,qe2511_consis_alpha_patched.safetensors,613578928,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/qe2511_consis_alpha_patched.safetensors,https://huggingface.co/lrzjason/QwenEdit_Consistance_Edit/resolve/main/qe2511_consis_alpha_patched.safetensors',
                                            'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                            'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors',
                                            'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                            'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                                  'info_links': ['https://www.modelscope.cn/models/Qwen/Qwen-Image-Edit-2511'],
                                  'preset_sample': []},
 'nun_int4_qwen_image_edit_plus_package': {'id': 7,
                                           'name': '[7]双截棍int4-QwenEdit+图像编辑',
                                           'note': 'Qwen_Image_Edit+2511指令编辑图像|显存需求：★★★★ 速度:★★★',
                                           'files': ['diffusion_models,nunchaku_qwen_image_2511_balance_int4.safetensors,12654443120,0,https://modelscope.cn/models/QuantFunc/Nunchaku-Qwen-Image-EDIT-2511/resolve/master/nunchaku_qwen_image_2511_balance_int4.safetensors,https://huggingface.co/QuantFunc/Nunchaku-Qwen-Image-EDIT-2511/resolve/main/nunchaku_qwen_image_edit_2511_balance_int4.safetensors',
                                                     'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                                     'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors'
                                                     'loras,Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
                                                     'loras,Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
                                                     'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                                     'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors',
                                                     'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                                     'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                                           'info_links': ['https://www.modelscope.cn/models/Qwen/Qwen-Image-Edit-2511'],
                                           'preset_sample': []},
 'nun_fp4_qwen_image_edit_plus_package': {'id': 8,
                                          'name': '[8]双截棍fp4-QwenEdit+图像编辑',
                                          'note': 'Qwen_Image_Edit+2511指令编辑图像|显存需求：★★★★ 速度:★★★',
                                           'files': ['diffusion_models,nunchaku_qwen_image_2511_balance_fp4.safetensors,13081386832,0,https://modelscope.cn/models/QuantFunc/Nunchaku-Qwen-Image-EDIT-2511/resolve/master/nunchaku_qwen_image_2511_balance_fp4.safetensors,https://huggingface.co/QuantFunc/Nunchaku-Qwen-Image-EDIT-2511/resolve/main/nunchaku_qwen_image_edit_2511_balance_fp4.safetensors',
                                                     'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                                     'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors'
                                                     'loras,Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
                                                     'loras,Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,849608296,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors,https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
                                                     'text_encoders,qwen_2.5_vl_7b_fp8_scaled.safetensors,9384670680,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/qwen_2.5_vl_7b_fp8_scaled.safetensors',
                                                     'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors',
                                                     'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                                     'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                                           'info_links': ['https://www.modelscope.cn/models/Qwen/Qwen-Image-Edit-2511'],
                                          'preset_sample': []},
 'qwen-rapid-aio-nsfw': {'id': 9,
                         'name': '[9]Qwen-Rapid-AIO-NSFW',
                         'note': 'QwenNSFW图像编辑，解锁限制的版本最终版V23|显存需求：★★★★★ 速度：★★',
                         'files': ['checkpoints,Qwen-Rapid-AIO-NSFW-v23.safetensors,28431840023,0,https://modelscope.cn/models/Phr00t/Qwen-Rapid-AIO/resolve/master/v23/Qwen-Rapid-AIO-NSFW-v23.safetensors,https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/resolve/main/v23/Qwen-Rapid-AIO-NSFW-v23.safetensors',
                                   'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                   'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                         'info_links': ['https://modelscope.cn/models/Phr00t/Qwen-Rapid-AIO'],
                         'preset_sample': []},
 'anima_package': {'id': 10,
                             'name': '[10]Anima动漫-base-v1.0预置包',
                            'note': 'Anima动漫-base-v1.0-默认模型[anima-base-v1.0.safetensors]|显存需求：★★★ 速度：★★',
                            'files': ['diffusion_models,anima-base-v1.0.safetensors,4182218328,0,https://www.modelscope.cn/models/circlestone-labs/Anima/resolve/master/split_files/diffusion_models/anima-base-v1.0.safetensors,https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/diffusion_models/anima-base-v1.0.safetensors',
                                        'text_encoders,qwen_3_06b_base.safetensors,1192135096,0,https://www.modelscope.cn/models/circlestone-labs/Anima/resolve/master/split_files/text_encoders/qwen_3_06b_base.safetensors,https://huggingface.co/circlestone-labs/Anima/resolve/main/split_files/text_encoders/qwen_3_06b_base.safetensors',
                                        'vae,qwen_image_vae.safetensors,253806246,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/qwen_image_vae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/qwen_image_vae.safetensors',
                                        'upscale_models,4x-AnimeSharp.pth,67010245,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/upscale_models/4x-AnimeSharp.pth,https://huggingface.co/Kim2091/AnimeSharp/resolve/main/4x-AnimeSharp.pth',
                                        'model_patches,anima-lllite-any-test-like-v2.safetensors,16403008,0,https://www.modelscope.cn/models/Comfy-Org/Anima-LLLite/resolve/master/model_patches/anima-lllite-any-test-like-v2.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/anima-lllite-any-test-like-v2.safetensors',
                                        'model_patches,anima-lllite-pose-1.safetensors,23310040,0,https://www.modelscope.cn/models/Comfy-Org/Anima-LLLite/resolve/master/model_patches/anima-lllite-pose-1.safetensors,https://huggingface.co/kohya-ss/Anima-LLLite/resolve/main/anima-lllite-pose-1.safetensors',
                                        'model_patches,anima-lllite-inpainting-v2.safetensors,65772872,0,https://www.modelscope.cn/models/Comfy-Org/Anima-LLLite/resolve/master/model_patches/anima-lllite-inpainting-v2.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/anima-lllite-inpainting-v2.safetensors',
                                        'model_patches,animaTileRepair_v20.safetensors,94037744,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/controlnet/animaTileRepair_v20.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/animaTileRepair_v20.safetensors'
],
                             'info_links': ['https://www.modelscope.cn/models/circlestone-labs/Anima/summary'],
                             'preset_sample': []},
 'Flux_aio_plus_package': {'id': 11,
                           'name': '[11]Flux1-dev扩展包',
                           'note': 'Flux全功能-默认模型[Fluxdev_fp8]|显存需求：★★★★ 速度：★★☆',
                           'files': ['diffusion_models,flux1-dev-fp8.safetensors,11901525888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-dev-fp8.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-dev-fp8.safetensors',
                                     'diffusion_models,flux1-fill-dev-OneReward_fp8.safetensors,11902532704,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors',
                                     'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                     'clip,EVA02_CLIP_L_336_psz14_s6B.pt,856461210,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt',
                                     'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                     'clip_vision,sigclip_vision_patch14_384.safetensors,856505640,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors',
                                     'controlnet,flux.1-dev_controlnet_union_pro_2.0.safetensors,4281779224,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors',
                                     'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                                     'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                     'insightface,models/antelopev2/1k3d68.onnx,143607619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/1k3d68.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/1k3d68.onnx',
                                     'insightface,models/antelopev2/2d106det.onnx,5030888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/2d106det.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/2d106det.onnx',
                                     'insightface,models/antelopev2/genderage.onnx,1322532,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/genderage.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/genderage.onnx',
                                     'insightface,models/antelopev2/glintr100.onnx,260665334,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/glintr100.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/glintr100.onnx',
                                     'insightface,models/antelopev2/scrfd_10g_bnkps.onnx,16923827,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx',
                                     'pulid,pulid_flux_v0.9.1.safetensors,1142099520,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors',
                                     'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                                     'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                                     'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                     'style_models,flux1-redux-dev.safetensors,129063232,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/style_models/flux1-redux-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/style_models/flux1-redux-dev.safetensors'],
                           'info_links': ['https://modelscope.cn/models/AI-ModelScope/FLUX.1-dev'],
                           'preset_sample': []},
 'nunchaku_int4_aio_package': {'id': 12,
                               'name': '[12]双截棍int4量化Flux扩展包',
                               'note': '适配非50系-默认模型[svdq-int4]|显存需求：★★★ 速度：★★★',
                               'files': ['diffusion_models,svdq-int4_r32-flux.1-dev.safetensors,6768309832,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/svdq-int4_r32-flux.1-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/svdq-int4_r32-flux.1-dev.safetensors',
                                         'diffusion_models,svdq-int4_r32-flux.1-fill-dev.safetensors,6770275936,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/svdq-int4_r32-flux.1-fill-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/svdq-int4_r32-flux.1-fill-dev.safetensors',
                                         'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                         'clip,EVA02_CLIP_L_336_psz14_s6B.pt,856461210,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt',
                                         'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                         'clip_vision,sigclip_vision_patch14_384.safetensors,856505640,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors',
                                         'controlnet,flux.1-dev_controlnet_union_pro_2.0.safetensors,4281779224,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors',
                                         'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                                         'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                         'insightface,models/antelopev2/1k3d68.onnx,143607619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/1k3d68.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/1k3d68.onnx',
                                         'insightface,models/antelopev2/2d106det.onnx,5030888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/2d106det.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/2d106det.onnx',
                                         'insightface,models/antelopev2/genderage.onnx,1322532,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/genderage.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/genderage.onnx',
                                         'insightface,models/antelopev2/glintr100.onnx,260665334,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/glintr100.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/glintr100.onnx',
                                         'insightface,models/antelopev2/scrfd_10g_bnkps.onnx,16923827,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx',
                                         'pulid,pulid_flux_v0.9.1.safetensors,1142099520,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors',
                                         'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                                         'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                                         'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                         'style_models,flux1-redux-dev.safetensors,129063232,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/style_models/flux1-redux-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/style_models/flux1-redux-dev.safetensors'],
                               'info_links': ['https://modelscope.cn/models/nunchaku-tech/nunchaku-flux.1-dev'],
                               'preset_sample': []},
 'nunchaku_fp4_aio_package': {'id': 13,
                              'name': '[13]双截棍fp4量化Flux扩展包',
                              'note': '仅适配50系-默认模型[svdq-fp4]|显存需求：★★☆ 速度：★★★',
                              'files': ['diffusion_models,svdq-fp4_r32-flux.1-dev.safetensors,7038706888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/svdq-fp4_r32-flux.1-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/svdq-fp4_r32-flux.1-dev.safetensors',
                                        'diffusion_models,svdq-fp4_r32-flux.1-fill-dev.safetensors,7040672992,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/svdq-fp4_r32-flux.1-fill-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/svdq-fp4_r32-flux.1-fill-dev.safetensors',
                                        'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                        'clip,EVA02_CLIP_L_336_psz14_s6B.pt,856461210,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt',
                                        'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                        'clip_vision,sigclip_vision_patch14_384.safetensors,856505640,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors',
                                        'controlnet,flux.1-dev_controlnet_union_pro_2.0.safetensors,4281779224,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/flux.1-dev_controlnet_union_pro_2.0.safetensors',
                                        'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth',
                                        'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                        'insightface,models/antelopev2/1k3d68.onnx,143607619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/1k3d68.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/1k3d68.onnx',
                                        'insightface,models/antelopev2/2d106det.onnx,5030888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/2d106det.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/2d106det.onnx',
                                        'insightface,models/antelopev2/genderage.onnx,1322532,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/genderage.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/genderage.onnx',
                                        'insightface,models/antelopev2/glintr100.onnx,260665334,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/glintr100.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/glintr100.onnx',
                                        'insightface,models/antelopev2/scrfd_10g_bnkps.onnx,16923827,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx',
                                        'pulid,pulid_flux_v0.9.1.safetensors,1142099520,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors',
                                        'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                                        'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors',
                                        'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                        'style_models,flux1-redux-dev.safetensors,129063232,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/style_models/flux1-redux-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/style_models/flux1-redux-dev.safetensors'],
                              'info_links': ['https://modelscope.cn/models/nunchaku-tech/nunchaku-flux.1-dev'],
                              'preset_sample': []},
 'flux2-klein-9b-fp8': {'id': 14,
                        'name': '[14]Flux2-Klein-9B-FP8图像编辑&多打光&修复&漫转真',
                        'note': 'Flux2-Klein-9B图像编辑&多角度打光，高效快速|显存需求：★★★ 速度：★★★',
                        'files': ['diffusion_models,Flux2-Klein-9B-True-V3-int8mixedrow.safetensors,9439884768,0,https://modelscope.cn/models/wikeeyang/Flux2-Klein-9B-True-V3/resolve/master/Flux2-Klein-9B-True-V3-int8mixedrow.safetensors',
                                  'text_encoders,qwen3_8b_abliterated_v2-fp8mixed.safetensors,8191194604,0,https://www.modelscope.cn/models/silveroxides/FLUX.2-dev-fp8_scaled/resolve/master/qwen3_8b_abliterated_v2-fp8mixed.safetensors,https://huggingface.co/silveroxides/FLUX.2-dev-fp8_scaled/resolve/main/qwen3_8b_abliterated_v2-fp8mixed.safetensors',
                                  'vae,flux2-vae.safetensors,336211292,0,https://www.modelscope.cn/models/Comfy-Org/flux2-klein-4B/resolve/master/split_files/vae/flux2-vae.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/vae/flux2-vae.safetensors',
                                  'loras,Flux2 Klein动漫转写实真人 AnythingtoRealCharacters.safetensors,165704392,0,https://www.modelscope.cn/models/zhouwenbin1994/Klein9BAnythingtoRealC/resolve/20260128232821/Flux2%20Klein%E5%8A%A8%E6%BC%AB%E8%BD%AC%E5%86%99%E5%AE%9E%E7%9C%9F%E4%BA%BA%20AnythingtoRealCharacters.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/Flux2%20Klein%E5%8A%A8%E6%BC%AB%E8%BD%AC%E5%86%99%E5%AE%9E%E7%9C%9F%E4%BA%BA%20AnythingtoRealCharacters.safetensors',
                                  'controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                  'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx'],
                        'info_links': ['https://modelscope.cn/models/black-forest-labs/FLUX.2-klein-9B'],
                        'preset_sample': []},
 'onekey_kontext_package': {'id': 15,
                            'name': '[15]OneKeyKontext一键精修预置包',
                            'note': '基于Flux_Kontext的一键精修|显存需求：★★★★ 速度：★★☆',
                            'files': ['diffusion_models,flux1-dev-kontext_fp8_scaled.safetensors,11904640136,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-dev-kontext_fp8_scaled.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-dev-kontext_fp8_scaled.safetensors',
                                      'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                      'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                      'loras,flux1-turbo.safetensors,694082424,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/flux1-turbo.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/flux1-turbo.safetensors',
                                      'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                      'upscale_models,4x_NMKD-Siax_200k.safetensors,66864028,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x_NMKD-Siax_200k.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x_NMKD-Siax_200k.safetensors',
                                      'loras,Kontext_general_V1.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_general_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_general_V1.safetensors',
                                      'loras,Kontext_all.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_all.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_all.safetensors',
                                      'loras,Kontext_appliances_V1.safetensors,343806368,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_appliances_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_appliances_V1.safetensors',
                                      'loras,Kontext_makeup_V1.safetensors,171970336,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_makeup_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_makeup_V1.safetensors',
                                      'loras,Kontext_metal_V1.safetensors,343806368,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_metal_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_metal_V1.safetensors',
                                      'loras,Kontext_clothing_V1.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_clothing_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_clothing_V1.safetensors',
                                      'loras,Kontext_jewelry_V1.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_jewelry_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_jewelry_V1.safetensors',
                                      'loras,Kontext_digital3C.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_digital3C.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_digital3C.safetensors',
                                      'loras,Kontext_composite.safetensors,343806400,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_composite.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_composite.safetensors',
                                      'loras,Kontext_pattern.safetensors,343806384,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_pattern.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_pattern.safetensors',
                                      'loras,Kontext_scene_alpha.safetensors,343806392,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_scene_alpha.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_scene_alpha.safetensors',
                                      'loras,Kontext_face_V1.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_face_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_face_V1.safetensors',
                                      'loras,Kontext_angle_beta.safetensors,343806392,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_angle_beta.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_angle_beta.safetensors',
                                      'loras,Kontext_3view.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_3view.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_3view.safetensors',
                                      'loras,Kontext_remove_V1.safetensors,306593008,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_remove_V1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_remove_V1.safetensors',
                                      'loras,Kontext_body_restore.safetensors,343806408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_body_restore.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_body_restore.safetensors',
                                      'loras,Kontext_takeclothes_V2.safetensors,343806408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_takeclothes_V2.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_takeclothes_V2.safetensors',
                                      'loras,Kontext_put_it_here_V4.2.safetensors,358706112,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_put_it_here_V4.2.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_put_it_here_V4.2.safetensors',
                                      'loras,Kontext_deblur.safetensors,306793968,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_deblur.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_deblur.safetensors',
                                      'loras,Kontext_depth_referencel.safetensors,343806456,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Kontext_depth_referencel.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Kontext_depth_referencel.safetensors'],
                            'info_links': ['https://modelscope.cn/models/black-forest-labs/FLUX.1-Kontext-dev'],
                            'preset_sample': []},
 'Removebg_package': {'id': 16,
                           'name': '[16]一键抠图',
                           'note': '抠图去背景神器|显存需求：★ 速度：★★★★★',
                           'files': ['rembg,ckpt_base.pth,367520613,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/rembg/ckpt_base.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/rembg/ckpt_base.pth',
                                     'rembg,RMBG-1.4.pth,176718373,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/rembg/RMBG-1.4.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/rembg/RMBG-1.4.pth',
                                     'rembg,General.safetensors,884878856,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/rembg/General.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/rembg/General.safetensors',
                                     'rembg,Portrait.safetensors,884878856,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/rembg/Portrait.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/rembg/Portrait.safetensors'],
                           'info_links': ['https://modelscope.cn/models/modelscope/BiRefNet'],
                           'preset_sample': []},
 'Eraser_package': {'id': 17,
                      'name': '[17]一键消除',
                      'note': '一键消除-默认模型[Flux1-fill-dev-OneReward]|显存需求：★★ 速度：★★☆',
                      'files': ['diffusion_models,flux1-fill-dev-OneReward_fp8.safetensors,11902532704,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors',
                                'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                'loras,removal_timestep_alpha-2-1740.safetensors,89746016,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/removal_timestep_alpha-2-1740.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/removal_timestep_alpha-2-1740.safetensors',
                                'llms,Helsinki-NLP/opus-mt-zh-en/config.json,1394,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/config.json',
                                'llms,Helsinki-NLP/opus-mt-zh-en/generation_config.json,293,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/generation_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/generation_config.json',
                                'llms,Helsinki-NLP/opus-mt-zh-en/metadata.json,1477,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/metadata.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/metadata.json',
                                'llms,Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin,312087009,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/pytorch_model.bin',
                                'llms,Helsinki-NLP/opus-mt-zh-en/source.spm,804677,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/source.spm,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/source.spm',
                                'llms,Helsinki-NLP/opus-mt-zh-en/target.spm,806530,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/target.spm,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/target.spm',
                                'llms,Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json,44,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/tokenizer_config.json',
                                'llms,Helsinki-NLP/opus-mt-zh-en/vocab.json,1617902,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/vocab.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/Helsinki-NLP/opus-mt-zh-en/vocab.json'],
                      'info_links': ['https://hf-mirror.com/lrzjason/ObjectRemovalFluxFill'],
                      'preset_sample': []},
 'Swapface_package': {'id': 18,
                         'name': '[18]一键换脸',
                         'note': '高精度换脸-默认模型[OneReward_fp8]|显存需求：★★★ 速度：★★',
                         'files': ['diffusion_models,flux1-fill-dev-OneReward_fp8.safetensors,11902532704,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors',
                                   'pulid,pulid_flux_v0.9.1.safetensors,1142099520,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/pulid/pulid_flux_v0.9.1.safetensors',
                                   'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                   'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                   'clip_vision,sigclip_vision_patch14_384.safetensors,856505640,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors',
                                   'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                   'loras,flux1-turbo.safetensors,694082424,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/flux1-turbo.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/flux1-turbo.safetensors',
                                   'grounding-dino,groundingdino_swint_ogc.pth,693997677,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/groundingdino_swint_ogc.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/groundingdino_swint_ogc.pth',
                                   'grounding-dino,GroundingDINO_SwinT_OGC.cfg.py,1006,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/inpaint/GroundingDINO_SwinT_OGC.cfg.py,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/GroundingDINO_SwinT_OGC.cfg.py',
                                   'sams,sam_vit_h_4b8939.pth,2564550879,0,https://www.modelscope.cn/models/muse/sam_vit_h_4b8939/resolve/master/sam_vit_h_4b8939.pth,https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_h_4b8939.pth',
                                   'style_models,flux1-redux-dev.safetensors,129063232,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/style_models/flux1-redux-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/style_models/flux1-redux-dev.safetensors',
                                   'insightface,models/antelopev2/1k3d68.onnx,143607619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/1k3d68.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/1k3d68.onnx',
                                   'insightface,models/antelopev2/2d106det.onnx,5030888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/2d106det.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/2d106det.onnx',
                                   'insightface,models/antelopev2/genderage.onnx,1322532,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/genderage.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/genderage.onnx',
                                   'insightface,models/antelopev2/glintr100.onnx,260665334,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/glintr100.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/glintr100.onnx',
                                   'insightface,models/antelopev2/scrfd_10g_bnkps.onnx,16923827,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/antelopev2/scrfd_10g_bnkps.onnx',
                                   'clip,EVA02_CLIP_L_336_psz14_s6B.pt,856461210,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/EVA02_CLIP_L_336_psz14_s6B.pt',
                                   'loras,comfyui_portrait_lora64.safetensors,612742344,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/comfyui_portrait_lora64.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/comfyui_portrait_lora64.safetensors',
                                   'controlnet,detection_Resnet50_Final.pth,109497761,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/detection_Resnet50_Final.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/detection_Resnet50_Final.pth',
                                   'controlnet,parsing_bisenet.pth,53289463,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/parsing_bisenet.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/parsing_bisenet.pth'],
                         'info_links': ['https://hf-mirror.com/bytedance-research/OneReward'],
                         'preset_sample': []},
 'swap_plus_package': {'id': 19,
                           'name': '[19]Flux迁移、换装预置包',
                           'note': '万物迁移-默认模型[flux-fill-OneReward]|显存需求：★★★☆ 速度：★★★',
                           'files': ['diffusion_models,flux1-fill-dev-OneReward_fp8.safetensors,11902532704,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/flux1-fill-dev-OneReward_fp8.safetensors',
                                     'clip,clip_l.safetensors,246144152,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/clip_l.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/clip_l.safetensors',
                                     'text_encoders,t5xxl_fp8_e4m3fn.safetensors,4893934904,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/t5xxl_fp8_e4m3fn.safetensors',
                                     'clip_vision,sigclip_vision_patch14_384.safetensors,856505640,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip_vision/sigclip_vision_patch14_384.safetensors',
                                     'vae,ae.safetensors,335304388,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/vae/ae.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/vae/ae.safetensors',
                                     'sams,sam_vit_h_4b8939.pth,2564550879,0,https://www.modelscope.cn/models/muse/sam_vit_h_4b8939/resolve/master/sam_vit_h_4b8939.pth,https://huggingface.co/mashb1t/misc/resolve/main/sam_vit_h_4b8939.pth',
                                     'style_models,flux1-redux-dev.safetensors,129063232,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/style_models/flux1-redux-dev.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/style_models/flux1-redux-dev.safetensors'],
                           'info_links': ['https://hf-mirror.com/bytedance-research/OneReward'],
                           'preset_sample': []},
 'extension_package': {'id': 20,
                       'name': '[20]IC-Light重打光',
                       'note': 'IC-Light图像重打光预置包|显存需求：★★ 速度：★★★☆',
                       'files': ['checkpoints,realisticVisionV60B1_v51VAE.safetensors,2132625894,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/realisticVisionV60B1_v51VAE.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/realisticVisionV60B1_v51VAE.safetensors',
                                 'unet,iclight_sd15_fbc_unet_ldm.safetensors,1719167896,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/unet/iclight_sd15_fbc_unet_ldm.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/unet/iclight_sd15_fbc_unet_ldm.safetensors',
                                 'unet,iclight_sd15_fc_unet_ldm.safetensors,1719144856,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/unet/iclight_sd15_fc_unet_ldm.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/unet/iclight_sd15_fc_unet_ldm.safetensors'],
                       'info_links': ['https://modelscope.cn/models/AI-ModelScope/ic-light'],
                       'preset_sample': []},
 'Illustrious_package': {'id': 21,
                         'name': '[21]光辉模型包(喵咔V2.0)',
                         'note': '支持NoobAI/光辉文生图-Fooocus-SDXL后端，默认模型[miaomiaoV2.0]|显存需求：★★ 速度：★★★☆',
                         'files': ['checkpoints,miaomiaoHarem_v20.safetensors,6938040400,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/checkpoints/miaomiaoHarem_v20.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/miaomiaoHarem_v20.safetensors'],
                         'info_links': ['https://civitai.red/models/934764/miaomiao-harem?modelVersionId=2851583'],
                         'preset_sample': []},
 'Illustrious(OB)_aio_package': {'id': 22,
                              'name': '[22]光辉(OBv20)扩展包',
                              'note': 'NoobAI/光辉全功能-Comfy后端-默认模型OneObsession_20Bold|显存需求：★★★ 速度：★★★',
                              'files': ['checkpoints,OneObsession_20Bold.safetensors,6938040682,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/checkpoints/OneObsession_20Bold.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/OneObsession_20Bold.safetensors?',
                                        'ipadapter,noob_ip_adapter.bin,1396798350,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/ipadapter/noob_ip_adapter.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/ipadapter/noob_ip_adapter.bin',
                                        'upscale_models,remacri_original.safetensors,66864028,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/upscale_models/remacri_original.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/remacri_original.safetensors',
                                        'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                        'controlnet,noob_sdxl_controlnet_inpainting.safetensors,5004167832,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/noob_sdxl_controlnet_inpainting.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/noob_sdxl_controlnet_inpainting.safetensors',
                                        'controlnet,xinsir_cn_union_sdxl_1.0_promax.safetensors,2513342408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors'],
                              'info_links': ['https://civitai.com/models/1318945/one-obsession'],
                              'preset_sample': []},
 'chenking_aio_package': {'id': 23,
                              'name': '[23]ChenkingNoob-XL-V0.5扩展包',
                              'note': 'ChenkingNoob-XL-V0.5二次元动漫模型扩展包|显存需求：★★ 速度：★★★☆',
                              'files': ['checkpoints,ChenkinNoob-XL-V0.5.safetensors,6938042930,0,https://www.modelscope.cn/models/ChenkinNoob/ChenkinNoob-XL-V0.5/resolve/20260410110159/ChenkinNoob-XL-V0.5.safetensors,https://huggingface.co/ChenkinNoob/ChenkinNoob-XL-V0.5/resolve/main/ChenkinNoob-XL-V0.5.safetensors',
                                        'ipadapter,noob_ip_adapter.bin,1396798350,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/ipadapter/noob_ip_adapter.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/ipadapter/noob_ip_adapter.bin',
                                        'upscale_models,remacri_original.safetensors,66864028,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/upscale_models/remacri_original.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/remacri_original.safetensors',
                                        'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                        'controlnet,Chenkin-UniControl-XL.safetensors,2516656328,0,https://www.modelscope.cn/models/ChenkinNoob/Chenkin-UniControl-XL/resolve/master/Chenkin-UniControl-XL.safetensors,https://huggingface.co/ChenkinNoob/Chenkin-UniControl-XL/resolve/main/Chenkin-UniControl-XL.safetensors'],
                              'info_links': ['https://www.modelscope.cn/models/ChenkinNoob/ChenkinNoob-XL-V0.5'],
                              'preset_sample': []},
 'sdxl_package': {'id': 24,
                  'name': '[24]怀旧fooocus-SDXL支持包',
                  'note': 'fooocus后端SDXL模块支持包|显存需求：★★ 速度:★★★☆',
                  'files': ['ipadapter,ip-adapter-plus-face_sdxl_vit-h.bin,1013454761,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/ip-adapter-plus-face_sdxl_vit-h.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/ip-adapter-plus-face_sdxl_vit-h.bin',
                            'ipadapter,ip-adapter-plus_sdxl_vit-h.bin,1013454427,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/ip-adapter-plus_sdxl_vit-h.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/ip-adapter-plus_sdxl_vit-h.bin',
                            'controlnet,xinsir_cn_union_sdxl_1.0_promax.safetensors,2513342408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors',
                            'loras,sd_xl_offset_example-lora_1.0.safetensors,49553604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/sd_xl_offset_example-lora_1.0.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/sd_xl_offset_example-lora_1.0.safetensors',
                            'loras,ip-adapter-faceid-plusv2_sdxl_lora.safetensors,371842896,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/ip-adapter-faceid-plusv2_sdxl_lora.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/ip-adapter-faceid-plusv2_sdxl_lora.safetensors',
                            'loras,sdxl_lightning_4step_lora.safetensors,393854592,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/sdxl_lightning_4step_lora.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/sdxl_lightning_4step_lora.safetensors',
                            'upscale_models,fooocus_upscaler_s409985e5.bin,33636613,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/fooocus_upscaler_s409985e5.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/fooocus_upscaler_s409985e5.bin',
                            'loras,Hyper-SDXL-8steps-lora.safetensors,787359648,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Hyper-SDXL-8steps-lora.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Hyper-SDXL-8steps-lora.safetensors',
                            'embeddings,unaestheticXLhk1.safetensors,33296,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/embeddings/unaestheticXLhk1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/embeddings/unaestheticXLhk1.safetensors',
                            'embeddings,unaestheticXLv31.safetensors,33296,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/embeddings/unaestheticXLv31.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/embeddings/unaestheticXLv31.safetensors',
                            'inpaint,inpaint_v26.fooocus.patch,1323362033,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/inpaint_v26.fooocus.patch,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/inpaint_v26.fooocus.patch',
                            'inpaint,inpaint_v25.fooocus.patch,2580722369,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/inpaint_v25.fooocus.patch,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/inpaint_v25.fooocus.patch',
                            'llms,nllb-200-distilled-600M/pytorch_model.bin,2460457927,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/nllb-200-distilled-600M/pytorch_model.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/nllb-200-distilled-600M/pytorch_model.bin',
                            'llms,nllb-200-distilled-600M/sentencepiece.bpe.model,4852054,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/nllb-200-distilled-600M/sentencepiece.bpe.model,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/nllb-200-distilled-600M/sentencepiece.bpe.model',
                            'llms,nllb-200-distilled-600M/tokenizer.json,17331176,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/llms/nllb-200-distilled-600M/tokenizer.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/llms/nllb-200-distilled-600M/tokenizer.json',
                            'prompt_expansion,fooocus_expansion/config.json,937,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/config.json',
                            'prompt_expansion,fooocus_expansion/merges.txt,456356,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/merges.txt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/merges.txt',
                            'prompt_expansion,fooocus_expansion/positive.txt,5655,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/positive.txt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/positive.txt',
                            'prompt_expansion,fooocus_expansion/pytorch_model.bin,351283802,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/pytorch_model.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/pytorch_model.bin',
                            'prompt_expansion,fooocus_expansion/special_tokens_map.json,99,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/special_tokens_map.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/special_tokens_map.json',
                            'prompt_expansion,fooocus_expansion/tokenizer.json,2107625,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/tokenizer.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/tokenizer.json',
                            'prompt_expansion,fooocus_expansion/tokenizer_config.json,255,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/tokenizer_config.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/tokenizer_config.json',
                            'prompt_expansion,fooocus_expansion/vocab.json,798156,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/prompt_expansion/fooocus_expansion/vocab.json,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/prompt_expansion/fooocus_expansion/vocab.json',
                            'safety_checker,stable-diffusion-safety-checker.bin,1216067303,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/safety_checker/stable-diffusion-safety-checker.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/safety_checker/stable-diffusion-safety-checker.bin'],
                  'info_links': ['https://modelscope.cn/models/yuguangyan/fooocus'],
                  'preset_sample': []},
 'SD15_aio_package': {'id': 25,
                      'name': '[25]SD1.5_AIO扩展包',
                      'note': 'SD1.5全功能-默认模型[realisticVision]|显存需求：★ 速度：★★★★',
                      'files': ['checkpoints,realisticVisionV60B1_v51VAE.safetensors,2132625894,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/realisticVisionV60B1_v51VAE.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/realisticVisionV60B1_v51VAE.safetensors',
                                'clip,sd15_clip_model.fp16.safetensors,246144864,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/clip/sd15_clip_model.fp16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/clip/sd15_clip_model.fp16.safetensors',
                                'controlnet,control_v11f1e_sd15_tile_fp16.safetensors,722601104,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/control_v11f1e_sd15_tile_fp16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/control_v11f1e_sd15_tile_fp16.safetensors',
                                'controlnet,control_v11f1p_sd15_depth_fp16.safetensors,722601100,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/control_v11f1p_sd15_depth_fp16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/control_v11f1p_sd15_depth_fp16.safetensors',
                                'controlnet,control_v11p_sd15_canny_fp16.safetensors,722601100,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/control_v11p_sd15_canny_fp16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/control_v11p_sd15_canny_fp16.safetensors',
                                'controlnet,control_v11p_sd15_openpose_fp16.safetensors,722601100,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/control_v11p_sd15_openpose_fp16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/control_v11p_sd15_openpose_fp16.safetensors',
                                'controlnet,lllyasviel/Annotators/ZoeD_M12_N.pt,1443406099,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/ZoeD_M12_N.pt',
                                'inpaint,sd15_powerpaint_brushnet_clip_v2_1.bin,492401329,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/sd15_powerpaint_brushnet_clip_v2_1.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/sd15_powerpaint_brushnet_clip_v2_1.bin',
                                'inpaint,sd15_powerpaint_brushnet_v2_1.safetensors,3544366408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/inpaint/sd15_powerpaint_brushnet_v2_1.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/inpaint/sd15_powerpaint_brushnet_v2_1.safetensors',
                                'insightface,models/buffalo_l/1k3d68.onnx,143607619,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/buffalo_l/1k3d68.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/buffalo_l/1k3d68.onnx',
                                'insightface,models/buffalo_l/2d106det.onnx,5030888,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/buffalo_l/2d106det.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/buffalo_l/2d106det.onnx',
                                'insightface,models/buffalo_l/det_10g.onnx,16923827,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/buffalo_l/det_10g.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/buffalo_l/det_10g.onnx',
                                'insightface,models/buffalo_l/genderage.onnx,1322532,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/buffalo_l/genderage.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/buffalo_l/genderage.onnx',
                                'insightface,models/buffalo_l/w600k_r50.onnx,174383860,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/insightface/models/buffalo_l/w600k_r50.onnx,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/insightface/models/buffalo_l/w600k_r50.onnx',
                                'ipadapter,ip-adapter-faceid-plusv2_sd15.bin,156558509,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/ipadapter/ip-adapter-faceid-plusv2_sd15.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/ipadapter/ip-adapter-faceid-plusv2_sd15.bin',
                                'ipadapter,ip-adapter_sd15.safetensors,44642768,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/ipadapter/ip-adapter_sd15.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/ipadapter/ip-adapter_sd15.safetensors',
                                'loras,ip-adapter-faceid-plusv2_sd15_lora.safetensors,51059544,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/ip-adapter-faceid-plusv2_sd15_lora.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/ip-adapter-faceid-plusv2_sd15_lora.safetensors',
                                'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                                'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors'],
                      'info_links': ['https://modelscope.cn/models/MusePublic/Realistic_Vision_V6.0_B1_SD_1_5'],
                      'preset_sample': []},
 'Depthstatue_package': {'id': 26,
                           'name': '[26]深度图、雕像扩展包',
                           'note': '深度图、白瓷雕像风格扩展|显存需求：★★ 速度：★★★★★',
                           'files': ['checkpoints,juggernautXL_juggXIByRundiffusion.safetensors,7105350536,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/juggernautXL_juggXIByRundiffusion.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/juggernautXL_juggXIByRundiffusion.safetensors',
                                     'loras,Hyper-SDXL-8steps-lora.safetensors,787359648,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/Hyper-SDXL-8steps-lora.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/Hyper-SDXL-8steps-lora.safetensors',
                                     'controlnet,xinsir_cn_union_sdxl_1.0_promax.safetensors,2513342408,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/xinsir_cn_union_sdxl_1.0_promax.safetensors',
                                     'controlnet,depth-anything/Depth-Anything-V2-Large/depth_anything_v2_vitl.pth,1341395338,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/depth-anything/Depth-Anything-V2-Large/depth_anything_v2_vitl.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/depth-anything/Depth-Anything-V2-Large/depth_anything_v2_vitl.pth',
                                     'controlnet,lllyasviel/Annotators/sk_model.pth,17173511,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/sk_model.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/sk_model.pth',
                                     'controlnet,lllyasviel/Annotators/sk_model2.pth,17173511,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/lllyasviel/Annotators/sk_model2.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/lllyasviel/Annotators/sk_model2.pth',
                                     'clip_vision,clip_vision_h.safetensors,1264219396,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/clip_vision/clip_vision_h.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors',
                                     'ipadapter,ip-adapter-plus_sdxl_vit-h.bin,1013454427,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/controlnet/ip-adapter-plus_sdxl_vit-h.bin,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/controlnet/ip-adapter-plus_sdxl_vit-h.bin'],
                           'info_links': ['https://modelscope.cn/models/depth-anything/Depth-Anything-V2-Large'],
                           'preset_sample': []},
 'one_key_pose_package': {'id': 27,
                          'name': '[27]一键Pose骨骼图预置包',
                          'note': '使用SDPose、DWpose进行预处理姿势|显存需求：★★ 速度：★★★★★',
                          'files': ['controlnet,hr16/DWPose-TorchScript-BatchSize5/dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://www.modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt,https://huggingface.co/hr16/DWPose-TorchScript-BatchSize5/resolve/main/dw-ll_ucoco_384_bs5.torchscript.pt',
                                    'controlnet,yzd-v/DWPose/yolox_l.onnx,216746733,0,https://www.modelscope.cn/models/zhangjin/DWPose/resolve/master/yolox_l.onnx,https://huggingface.co/yzd-v/DWPose/blob/main/yolox_l.onnx',
                                    'checkpoints,sdpose_wholebody_fp16.safetensors,1916645792,0,https://modelscope.cn/models/Comfy-Org/SDPose/resolve/master/checkpoints/sdpose_wholebody_fp16.safetensors,https://huggingface.co/Comfy-Org/SDPose/resolve/main/checkpoints/sdpose_wholebody_fp16.safetensors'],
                          'info_links': ['https://modelscope.cn/models/Sunjian520/SDPose-Wholebody'],
                          'preset_sample': []},
 'LSnet_package': {'id': 28,
                   'name': '[28]LSnet画师串反推器',
                   'note': '用于反推二次元风格对应画师名|显存需求：★ 速度：★★★★★',
                   'files': ['lsnet,kaloscope/best_checkpoint.pth,2015978609,0,https://www.modelscope.cn/models/Heathcliff02/Kaloscope/resolve/master/best_checkpoint.pth,https://huggingface.co/heathcliff01/Kaloscope/resolve/main/best_checkpoint.pth',
                             'lsnet,kaloscope/class_mapping.csv,574531,0,https://www.modelscope.cn/models/Heathcliff02/Kaloscope/resolve/master/class_mapping.csv,https://huggingface.co/heathcliff01/Kaloscope/resolve/main/class_mapping.csv'],
                   'info_links': ['https://www.modelscope.cn/models/Heathcliff02/Kaloscope'],
                   'preset_sample': []},
 'wan_t2i_package': {'id': 29,
                     'name': '[29]Wan2.2_T2I文生图扩展包',
                     'note': '万相2.2文生图扩展包，使用万相视频模型用于生成图片|显存需求：★★★ 速度：★★',
                     'files': ['diffusion_models,wan2.2_bernini_r_low_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors',
                               'diffusion_models,Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors,3052113849,0,https://www.modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors',
                               'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                               'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                               'loras,Bernini-R_LightX2V_high_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_high_noise.safetensors,https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_high_noise.safetensors',
                               'loras,Bernini-R_LightX2V_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_low_noise.safetensors,https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_low_noise.safetensors',
                               'loras,WAN2.1_SmartphoneSnapshotPhotoReality_v1_by-AI_Characters.safetensors,306848672,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/WAN2.1_SmartphoneSnapshotPhotoReality_v1_by-AI_Characters.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/WAN2.1_SmartphoneSnapshotPhotoReality_v1_by-AI_Characters.safetensors',
                               'upscale_models,4x-UltraSharp.pth,66961958,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4x-UltraSharp.pth,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4x-UltraSharp.pth',
                               'upscale_models,4xNomosUniDAT_bokeh_jpg.safetensors,154152604,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/upscale_models/4xNomosUniDAT_bokeh_jpg.safetensors'],
                     'info_links': ['https://modelscope.cn/models/Wan-AI/Wan2.2-T2V-A14B'],
                     'preset_sample': []},
 'wan_i2v_package': {'id': 30,
                     'name': '[30]Wan2.2图生视频扩展包',
                     'note': '通义万相2.2图生视频扩展包,包含SVI-Pro视频延长|显存需求：★★★★ 速度：★',
                     'files': ['diffusion_models,Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf,9651728896,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf',
                               'diffusion_models,Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf,9651728896,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/checkpoints/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/checkpoints/Wan2.2-I2V-A14B-LowNoise-Q4_K_M.gguf',
                               'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                               'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                               'loras,Wan2.2_I2V_LightX2V_2step_high_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Wan2.2_I2V_LightX2V_2Step/resolve/master/Wan2.2_I2V_LightX2V_2step_high_noise.safetensors,https://huggingface.co/rzgar/Wan2.2_I2V_LightX2V_2Step/resolve/main/Wan2.2_I2V_LightX2V_2step_high_noise.safetensors?download=true',
                               'loras,Wan2.2_I2V_LightX2V_2step_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Wan2.2_I2V_LightX2V_2Step/resolve/master/Wan2.2_I2V_LightX2V_2step_low_noise.safetensors,https://huggingface.co/rzgar/Wan2.2_I2V_LightX2V_2Step/resolve/main/Wan2.2_I2V_LightX2V_2step_low_noise.safetensors?download=true',
                               'loras,SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors,1226934120,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors',
                               'loras,SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors,1226934120,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors',
                               'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                     'info_links': ['https://modelscope.cn/models/Wan-AI/Wan2.2-I2V-A14B'],
                     'preset_sample': []},
 'dasiwa_i2v_package': {'id': 31,
                     'name': '[31]Wan2.2_Dasiwa动漫向图生视频扩展包',
                     'note': '万相2.2_Dasiwa动漫向图生视频扩展包,包含SVI-Pro视频延长|显存需求：★★★☆ 速度：★☆',
                     'files': ['diffusion_models,DasiwaWAN22I2V14BLightspeed_synthseductionHighV9.safetensors,14528641504,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/diffusion_models/DasiwaWAN22I2V14BLightspeed_synthseductionHighV9.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/diffusion_models/DasiwaWAN22I2V14BLightspeed_synthseductionHighV9.safetensors',
                               'diffusion_models,DasiwaWAN22I2V14BLightspeed_synthseductionLowV9.safetensors,14528641504,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/diffusion_models/DasiwaWAN22I2V14BLightspeed_synthseductionLowV9.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/diffusion_models/DasiwaWAN22I2V14BLightspeed_synthseductionLowV9.safetensors',
                               'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                               'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                               'loras,SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors,1226934120,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors',
                               'loras,SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors,1226934120,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors',
                               'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                     'info_links': ['https://civitai.com/models/1981116/dasiwa-wan-22-i2v-14b-or-lightspeed-or-safetensors'],
                     'preset_sample': []},
 'wan_t2v_package': {'id': 32,
                     'name': '[32]Wan2.2文生视频扩展包',
                     'note': '通义万相2.2文生视频扩展包|显存需求：★★★★ 速度：★',
                     'files': ['diffusion_models,Wan2.2_Remix_SFW_t2v_14b_high_lighting_v1.0_dyno.safetensors,14289633352,0,https://www.modelscope.cn/models/huyuefeitool/wan2.2-Remix/resolve/master/Wan2.2_Remix_SFW_t2v_14b_high_lighting_v1.0_dyno.safetensors,https://huggingface.co/FX-FeiHou/wan2.2-Remix/resolve/main/SFW/Wan2.2_Remix_SFW_t2v_14b_high_lighting_v1.0_dyno.safetensors',
                               'diffusion_models,wan2.2_bernini_r_low_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors',
                               'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                               'loras,Bernini-R_LightX2V_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_low_noise.safetensors',
                               'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                               'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                     'info_links': ['https://modelscope.cn/models/Wan-AI/Wan2.2-T2V-A14B'],
                     'preset_sample': []},
 'wan_ttp_package': {'id': 33,
                     'name': '[33]Wan2.2_TTP超清放大扩展包',
                     'note': '万相2.2TTP超清放大扩展包|显存需求：★★★ 速度：★★',
                     'files': ['diffusion_models,wan2.2_bernini_r_low_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors',
                               'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                               'loras,Bernini-R_LightX2V_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_low_noise.safetensors',
                               'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                               'vae,Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors,507684560,0,https://www.modelscope.cn/models/spacepxl/Wan2.1-VAE-upscale2x/resolve/master/Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors,https://huggingface.co/spacepxl/Wan2.1-VAE-upscale2x/resolve/main/Wan2.1_VAE_upscale2x_imageonly_real_v1.safetensors',
                               'SEEDVR2,ema_vae_fp16.safetensors,501324814,0,https://www.modelscope.cn/models/numz/SeedVR2_comfyUI/resolve/master/ema_vae_fp16.safetensors,https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/ema_vae_fp16.safetensors',
                               'SEEDVR2,seedvr2_ema_3b_fp16.safetensors,6783018808,0,https://www.modelscope.cn/models/numz/SeedVR2_comfyUI/resolve/master/seedvr2_ema_3b_fp16.safetensors,https://huggingface.co/numz/SeedVR2_comfyUI/resolve/main/seedvr2_ema_3b_fp16.safetensors'],
                     'info_links': ['https://modelscope.cn/models/Wan-AI/Wan2.2-T2V-A14B',
                                    'https://modelscope.cn/models/numz/SeedVR2_comfyUI'],
                     'preset_sample': []},
 'wan_scail_package': {'id': 34,
                       'name': '[34]Wan_SCAIL2扩展包',
                       'note': '万相_SCAIL2角色替换/动作迁移扩展包|显存需求：★★★ 速度：★',
                       'files': ['diffusion_models,wan2.1_14B_SCAIL_2_int8_convrot.safetensors,16654506256,0,https://modelscope.cn/models/Comfy-Org/SCAIL-2/resolve/master/diffusion_models/wan2.1_14B_SCAIL_2_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/diffusion_models/wan2.1_14B_SCAIL_2_int8_convrot.safetensors',
                                 'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                                 'clip_vision,clip_vision_h.safetensors,1264219396,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/clip_vision/clip_vision_h.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors',
                                 'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                                 'loras,lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,738005744,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
                                 'loras,wan2.1_SCAIL_2_DPO_lora_bf16.safetensors,1226936552,0,https://modelscope.cn/models/Comfy-Org/SCAIL-2/resolve/master/loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors,https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/loras/wan2.1_SCAIL_2_DPO_lora_bf16.safetensors',
                                 'loras,wan2.1_SCAIL_2_relight_lora_bf16.safetensors,1226936552,0,https://modelscope.cn/models/Comfy-Org/SCAIL-2/resolve/master/loras/wan2.1_SCAIL_2_relight_lora_bf16.safetensors,https://huggingface.co/Comfy-Org/SCAIL-2/resolve/main/loras/wan2.1_SCAIL_2_relight_lora_bf16.safetensors',
                                 'checkpoints,sam3.1_multiplex_fp16.safetensors,1745546848,0,https://www.modelscope.cn/models/Comfy-Org/sam3.1/resolve/master/checkpoints/sam3.1_multiplex_fp16.safetensors,https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors',
                                 'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'
                                 ],
                       'info_links': ['https://modelscope.cn/models/ZhipuAI/SCAIL-2'],
                       'preset_sample': []},
 "wan-animate-video-edit": {"id": 35,
                         "name": "[35]Wan-Animate-视频编辑",
                         "note": "Wan-Animate物体替换/人物替换/动作迁移/视频消除|显存需求：★★★★ 速度：★★",
                         "files": ['diffusion_models,wan2.2_animate_14B_int8_convrot.safetensors,18413068672,0,https://modelscope.cn/models/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/master/split_files/diffusion_models/wan2.2_animate_14B_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_animate_14B_int8_convrot.safetensors',
                                    'diffusion_models,Wan2_1-MiniMaxRemover_1_3B_fp16.safetensors,2254156824,0,https://www.modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/Wan2_1-MiniMaxRemover_1_3B_fp16.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1-MiniMaxRemover_1_3B_fp16.safetensors',
                                    'checkpoints,sam3.1_multiplex_fp16.safetensors,1745546848,0,https://www.modelscope.cn/models/Comfy-Org/sam3.1/resolve/master/checkpoints/sam3.1_multiplex_fp16.safetensors,https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/sam3.1_multiplex_fp16.safetensors',
                                    'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                                    'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                                    'clip_vision,clip_vision_h.safetensors,1264219396,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/clip_vision/clip_vision_h.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/clip_vision/clip_vision_h.safetensors',
                                    'loras,lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,738005744,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
                                    'loras,WanAnimate_relight_lora_fp16.safetensors,1436672440,0,https://modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/LoRAs/Wan22_relight/WanAnimate_relight_lora_fp16.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/LoRAs/Wan22_relight/WanAnimate_relight_lora_fp16.safetensors',
                                    'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl',
                                    'detection,vitpose_h_wholebody_data.bin,2548958740,0,https://modelscope.cn/models/Kijai/vitpose_comfy/resolve/master/onnx/vitpose_h_wholebody_data.bin,https://huggingface.co/Kijai/vitpose_comfy/resolve/main/onnx/vitpose_h_wholebody_data.bin',
                                    'detection,vitpose_h_wholebody_model.onnx,420252,0,https://modelscope.cn/models/Kijai/vitpose_comfy/resolve/master/onnx/vitpose_h_wholebody_model.onnx,https://huggingface.co/Kijai/vitpose_comfy/resolve/main/onnx/vitpose_h_wholebody_model.onnx',
                                    'detection,yolov10m.onnx,61659339,0,https://modelscope.cn/models/Wan-AI/Wan2.2-Animate-14B/resolve/master/process_checkpoint/det/yolov10m.onnx,https://huggingface.co/Wan-AI/Wan2.2-Animate-14B/resolve/main/process_checkpoint/det/yolov10m.onnx'
                         ],
                         "info_links": ["https://www.modelscope.cn/models/Wan-AI/Wan2.2-Animate-14B"],
                         "preset_sample": []},
 'wan_infinitetalk': {'id': 36, 'name': '[36]Wan-InfiniteTalk对口型预置包',
                        'note': 'Wan-InfiniteTalk音频驱动数字人对口型预置包|显存需求：★★★ 速度：★★',
                        'files': ['diffusion_models,Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors,16993877896,0,https://www.modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/Wan2_1-I2V-14B-480P_fp8_e4m3fn.safetensors,https://huggingface.co/Kijai/wav2vec2_safetensors/resolve/main/wav2vec2-chinese-base_fp16.safetensors',
                                'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                                'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                                'loras,lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,738005744,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors,https://huggingface.co/metercai/SimpleSDXL2/resolve/main/SimpleModels/loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
                                'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl',
                                'diffusion_models,MelBandRoformer_fp16.safetensors,456479072,0,https://www.modelscope.cn/models/Kijai/MelBandRoFormer_comfy/resolve/master/MelBandRoformer_fp16.safetensors,https://huggingface.co/Kijai/MelBandRoFormer_comfy/resolve/main/MelBandRoformer_fp16.safetensors',
                                'model_patches,wan2.1_infiniteTalk_single_fp16.safetensors,5125258232,0,https://www.modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/model_patches/wan2.1_infiniteTalk_single_fp16.safetensors,https://huggingface.co/Kijai/wav2vec2_safetensors/resolve/main/wav2vec2-chinese-base_fp16.safetensors',
                                'audio_encoders,wav2vec2-chinese-base_fp16.safetensors,190115368,0,https://www.modelscope.cn/models/Kijai/wav2vec2_safetensors/resolve/master/wav2vec2-chinese-base_fp16.safetensors,https://huggingface.co/Kijai/wav2vec2_safetensors/resolve/main/wav2vec2-chinese-base_fp16.safetensors'],
                        'info_links': ['https://www.modelscope.cn/models/MeiGen-AI/InfiniteTalk'],
                        "preset_sample": []},
 'ltx_package': {'id': 37, 'name': '[37]LTX文生、图生音视频和视频配音预置包',
                    'note': 'LTX文生、图生音视频生成、视频外扩、视频配音预置包|显存需求：★★★☆ 速度：★★☆',
                    'files': [
                        'diffusion_models,ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors,21504034224,0,https://www.modelscope.cn/models/Lightricks/LTX-2.5/resolve/master/diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
                        'loras,ltx/ltx-2.3-22b-ic-lora-outpaint.safetensors,1308756416,0,https://www.modelscope.cn/models/oumoumad-ai/LTX-2.3-22b-IC-LoRA-Outpaint/resolve/master/ltx-2.3-22b-ic-lora-outpaint.safetensors,https://huggingface.co/oumoumad/LTX-2.3-22b-IC-LoRA-Outpaint/resolve/main/ltx-2.3-22b-ic-lora-outpaint.safetensors',
                        'text_encoders,gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors,15372969374,0,https://www.modelscope.cn/models/Lightricks/LTX-2.5/resolve/master/text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
                        'vae,ltx-2.5-video-vae-bf16.safetensors,1472223346,0,https://www.modelscope.cn/models/Lightricks/LTX-2.5/resolve/master/vae/ltx-2.5-video-vae-bf16.safetensors',
                        'vae,ltx-2.5-audio-vae-bf16.safetensors,364866540,0,https://www.modelscope.cn/models/Lightricks/LTX-2.5/resolve/master/vae/ltx-2.5-audio-vae-bf16.safetensors',
                        'latent_upscale_models,ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors,995778752,0,https://www.modelscope.cn/models/Lightricks/LTX-2.5/resolve/master/latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
                        'text_encoders,qwen3vl_4b_fp8_scaled.safetensors,5242467968,0,https://modelscope.cn/models/Comfy-Org/Krea-2/resolve/master/text_encoders/qwen3vl_4b_fp8_scaled.safetensors,https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors',
                        'loras,ltx/ltx2.3-video-restoration-general.safetensors,100767488,0,https://www.modelscope.cn/models/joyfox/LTX2.3-ICEdit-Insight/resolve/master/ltx2.3-video-restoration-general.safetensors,https://huggingface.co/joyfox/LTX2.3-ICEdit-Insight/resolve/main/ltx2.3-video-restoration-general.safetensors',
                        'loras,ltx/ltx2.3-ic-video-upscale-general.safetensors,327287384,0,https://www.modelscope.cn/models/joyfox/LTX2.3-ICEdit-Insight/resolve/master/ltx2.3-ic-video-upscale-general.safetensors,https://huggingface.co/joyfox/LTX2.3-ICEdit-Insight/resolve/main/ltx2.3-ic-video-upscale-general.safetensors',
                        'loras,ltx/ltx2.3-ic-watermark-remove-general.safetensors,327287384,0,https://www.modelscope.cn/models/joyfox/LTX2.3-ICEdit-Insight/resolve/master/ltx2.3-ic-watermark-remove-general.safetensors,https://huggingface.co/joyfox/LTX2.3-ICEdit-Insight/resolve/main/ltx2.3-ic-watermark-remove-general.safetensors',
                        'loras,ltx/ltx2.3-ic-subtitles-remove-general.safetensors,327287384,0,https://www.modelscope.cn/models/joyfox/LTX2.3-ICEdit-Insight/resolve/master/ltx2.3-ic-subtitles-remove-general.safetensors,https://huggingface.co/joyfox/LTX2.3-ICEdit-Insight/resolve/main/ltx2.3-ic-subtitles-remove-general.safetensors',
                        'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                    'info_links': ['https://www.modelscope.cn/models/Lightricks/LTX-2.5'],
                    'preset_sample': []},
 'hunyuan_foley_package': {'id': 38, 'name': '[38]腾讯混元Foley音效生成预置包',
                    'note': '腾讯混元Foley音效生成预置包|显存需求：★★☆ 速度：★★☆',
                    'files': [
                        'hunyuan_foley,clap/config.json,643,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/clap/config.json,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/clap/config.json',
                        'hunyuan_foley,clap/merges.txt,456318,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/clap/merges.txt,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/clap/merges.txt',
                        'hunyuan_foley,clap/pytorch_model.bin,776444665,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/clap/pytorch_model.bin,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/clap/pytorch_model.bin',
                        'hunyuan_foley,clap/vocab.json,798293,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/clap/vocab.json,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/clap/vocab.json',
                        'hunyuan_foley,hunyuanvideo_foley_xl.pth,5854140970,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/hunyuanvideo_foley_xl.pth,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/hunyuanvideo_foley_xl.pth',
                        'hunyuan_foley,siglip2/config.json,276,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/siglip2/config.json,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/siglip2/config.json',
                        'hunyuan_foley,siglip2/model.safetensors,1503344520,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/siglip2/model.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/siglip2/model.safetensors',
                        'hunyuan_foley,siglip2/preprocessor_config.json,394,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/siglip2/preprocessor_config.json,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/siglip2/preprocessor_config.json',
                        'hunyuan_foley,synchformer_state_dict.pth,950058171,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/synchformer_state_dict.pth,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/synchformer_state_dict.pth',
                        'hunyuan_foley,vae_128d_48k.pth,1486465965,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/hunyuan_foley/vae_128d_48k.pth,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/hunyuan_foley/vae_128d_48k.pth'],
                    'info_links': ['https://modelscope.cn/models/Tencent-Hunyuan/HunyuanVideo-Foley/'],
                    'preset_sample': []},
 'qwen_tts_0_6b': {'id': 39, 'name': '[39]Qwen3-TTS 0.6B模型包',
                        'note': 'Qwen3-TTS 0.6B语音生成、克隆模块|显存需求：★ 速度：★★★', 
                        'files': ['qwen-tts,Qwen3-TTS-Tokenizer-12Hz/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/config.json,4494,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/configuration.json,47,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/generation_config.json,245,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/generation_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/generation_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/merges.txt,1671839,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/merges.txt,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/merges.txt',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/model.safetensors,1829344272,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/preprocessor_config.json,127,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/speech_tokenizer/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/speech_tokenizer/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/speech_tokenizer/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/speech_tokenizer/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/speech_tokenizer/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/speech_tokenizer/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/speech_tokenizer/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/speech_tokenizer/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/speech_tokenizer/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/tokenizer_config.json,7344,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/tokenizer_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/tokenizer_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-Base/vocab.json,2776833,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/master/vocab.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base/resolve/main/vocab.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/config.json,4908,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/configuration.json,47,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/generation_config.json,245,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/generation_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/generation_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/merges.txt,1671839,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/merges.txt,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/merges.txt',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/model.safetensors,1811626576,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/preprocessor_config.json,127,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/speech_tokenizer/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/speech_tokenizer/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/speech_tokenizer/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/speech_tokenizer/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/speech_tokenizer/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/speech_tokenizer/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/speech_tokenizer/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/speech_tokenizer/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/speech_tokenizer/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/speech_tokenizer/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/speech_tokenizer/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/speech_tokenizer/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/tokenizer_config.json,7344,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/tokenizer_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/tokenizer_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-0.6B-CustomVoice/vocab.json,2776833,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/master/vocab.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice/resolve/main/vocab.json'],
                        'info_links': ['https://www.modelscope.cn/collections/Qwen/Qwen3-TTS'],
                        "preset_sample": []},
 'qwen_tts_1_7b': {'id': 40, 'name': '[40]Qwen3-TTS 1.7B模型包',
                        'note': 'Qwen3-TTS 1.7B语音生成、克隆模块|显存需求：★☆ 速度：★★★', 
                        'files': ['qwen-tts,Qwen3-TTS-Tokenizer-12Hz/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-Tokenizer-12Hz/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-Tokenizer-12Hz/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/config.json,4494,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/configuration.json,47,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/generation_config.json,245,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/generation_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/generation_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/merges.txt,1671839,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/merges.txt,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/merges.txt',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/model.safetensors,3857413744,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/preprocessor_config.json,127,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/speech_tokenizer/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/speech_tokenizer/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/speech_tokenizer/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/speech_tokenizer/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/speech_tokenizer/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/speech_tokenizer/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/speech_tokenizer/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/speech_tokenizer/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/speech_tokenizer/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/speech_tokenizer/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/speech_tokenizer/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/speech_tokenizer/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/tokenizer_config.json,7344,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/tokenizer_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/tokenizer_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-Base/vocab.json,2776833,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/master/vocab.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base/resolve/main/vocab.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/config.json,4908,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/configuration.json,47,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/generation_config.json,245,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/generation_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/generation_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/merges.txt,1671839,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/merges.txt,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/merges.txt',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/model.safetensors,3833402552,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/preprocessor_config.json,127,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/speech_tokenizer/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/speech_tokenizer/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/speech_tokenizer/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/speech_tokenizer/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/speech_tokenizer/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/speech_tokenizer/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/speech_tokenizer/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/speech_tokenizer/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/speech_tokenizer/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/tokenizer_config.json,7344,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/tokenizer_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/tokenizer_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-CustomVoice/vocab.json,2776833,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/master/vocab.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice/resolve/main/vocab.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/config.json,4421,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/configuration.json,47,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/generation_config.json,245,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/generation_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/generation_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/merges.txt,1671839,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/merges.txt,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/merges.txt',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/model.safetensors,3833402552,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/preprocessor_config.json,127,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/speech_tokenizer/config.json,2336,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/speech_tokenizer/config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/speech_tokenizer/config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/speech_tokenizer/configuration.json,76,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/speech_tokenizer/configuration.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/speech_tokenizer/configuration.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/speech_tokenizer/model.safetensors,682293092,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/speech_tokenizer/model.safetensors,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/speech_tokenizer/model.safetensors',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/speech_tokenizer/preprocessor_config.json,234,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/speech_tokenizer/preprocessor_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/speech_tokenizer/preprocessor_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/tokenizer_config.json,7344,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/tokenizer_config.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/tokenizer_config.json',
                                'qwen-tts,Qwen3-TTS-12Hz-1.7B-VoiceDesign/vocab.json,2776833,0,https://www.modelscope.cn/models/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/master/vocab.json,https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign/resolve/main/vocab.json'],
                        'info_links': ['https://www.modelscope.cn/collections/Qwen/Qwen3-TTS'],
                        "preset_sample": []},
 'pose_studio_sam3d_body_package': {'id': 41,
                                    'name': '[41]Pose Studio SAM 3D Body姿势解析模型包',
                                    'note': 'Pose Studio参考图姿势解析必需模型包;QwenPose和Flux2-Klein-Pose使用',
                                    'files': ['sam3dbody,model.ckpt,2109129346,0,https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/model.ckpt,https://huggingface.co/jetjodh/sam-3d-body-dinov3/resolve/main/model.ckpt',
                                              'sam3dbody,model_config.yaml,1488,0,https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/model_config.yaml,https://huggingface.co/jetjodh/sam-3d-body-dinov3/resolve/main/model_config.yaml',
                                              'sam3dbody,assets/mhr_model.pt,696110248,0,https://www.modelscope.cn/models/facebook/sam-3d-body-dinov3/resolve/master/assets/mhr_model.pt,https://huggingface.co/jetjodh/sam-3d-body-dinov3/resolve/main/assets/mhr_model.pt',
                                              'birefnet,BiRefNet_lite/BiRefNet_config.py,298,,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/birefnet/BiRefNet_lite/BiRefNet_config.py,https://huggingface.co/ZhengPeng7/BiRefNet_lite/resolve/main/BiRefNet_config.py',
                                              'birefnet,BiRefNet_lite/birefnet.py,92134,,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/birefnet/BiRefNet_lite/birefnet.py,https://huggingface.co/ZhengPeng7/BiRefNet_lite/resolve/main/birefnet.py',
                                              'birefnet,BiRefNet_lite/config.json,410,,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/birefnet/BiRefNet_lite/config.json,https://huggingface.co/ZhengPeng7/BiRefNet_lite/resolve/main/config.json',
                                              'birefnet,BiRefNet_lite/model.safetensors,177634392,,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/birefnet/BiRefNet_lite/model.safetensors,https://huggingface.co/ZhengPeng7/BiRefNet_lite/resolve/main/model.safetensors',
                                              'loras,VNCCS_PoseStudioKlein9b_V1.safetensors,165704408,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/VNCCS_PoseStudioKlein9b_V1.safetensors,https://huggingface.co/MIUProject/VNCCS_PoseStudio_Klein/resolve/main/models/loras/Klein9b/VNCCS/VNCCS_PoseStudioKlein9b_V1.safetensors',
                                              'loras,VNCCS_QIE2511_PoseStudio_ART_V5.9.5.safetensors,1179883808,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/VNCCS_QIE2511_PoseStudio_ART_V5.9.5.safetensors,https://huggingface.co/MIUProject/VNCCS_PoseStudio/resolve/main/models/loras/qwen/VNCCS/VNCCS_QIE2511_PoseStudio_ART_V5.9.5.safetensors'

],
                                    'info_links': ['https://modelscope.cn/models/facebook/sam-3d-body-dinov3',
                                                   'https://github.com/AHEKOT/ComfyUI_VNCCS_Utils'],
                                    'preset_sample': []},
 'gaussian_studio_sharp_package': {'id': 42,
                                   'name': '[42]Gaussian Studio SHARP 3DGS模型包',
                                   'note': 'Gaussian Studio单图3D高斯泼溅视角旋转与缺损修复模型包;Gaussian Studio使用',
                                   'files': ['sharp,sharp_2572gikvuh.pt,2809738232,0,https://modelscope.cn/models/apple/Sharp/resolve/master/sharp_2572gikvuh.pt,https://huggingface.co/apple/Sharp/resolve/main/sharp_2572gikvuh.pt',
                                             'loras,Repair-Damage_25.safetensors,236117040,0,https://modelscope.cn/models/Daniel8152/Repair-Damage/resolve/20260111212939/Repair-Damage_25.safetensors,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/loras/Repair-Damage_25.safetensors'],
                                   'info_links': ['https://modelscope.cn/models/apple/Sharp/',
                                                  'https://modelscope.cn/models/Daniel8152/Repair-Damage'],
                                   'preset_sample': []},
 'bernini_r_package': {'id': 43,
                       'name': '[43]Bernini-R图像编辑/多图视频/视频编辑模型包',
                       'note': 'Bernini ImageEdit、Bernini MultiI2V和Bernini VideoEdit共用模型包，包含Bernini-R双扩散模型、Bernini-R/Lightx2v LoRA、Wan VAE、umt5文本编码器和RIFE插帧模型|显存需求：★★★★☆ 速度：★',
                       'files': ['diffusion_models,wan2.2_bernini_r_high_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_high_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_high_noise_int8_convrot.safetensors',
                                 'diffusion_models,wan2.2_bernini_r_low_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors',
                                 'diffusion_models,Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors,3052113849,0,https://www.modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan2_1-VACE_module_14B_fp8_e4m3fn.safetensors',
                                 'loras,Bernini-R_LightX2V_high_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_high_noise.safetensors,https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_high_noise.safetensors',
                                 'loras,Bernini-R_LightX2V_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_low_noise.safetensors,https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_low_noise.safetensors',
                                 'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                                 'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                                 'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                       'info_links': ['https://www.modelscope.cn/models/Comfy-Org/Bernini-R'],
                       'preset_sample': []},
 'krea2_package': {'id': 44,
                   'name': '[44]Krea2文生图/图像编辑模型包',
                   'note': 'Krea2 Turbo文生图与Identity Edit图像编辑共用模型包，包含Krea2 Turbo模型、Identity Edit v1.2 LoRA、Qwen3VL 4B文本编码器|显存需求：★★★ 速度：★★★',
                   'files': ['diffusion_models,krea2_turbo_int8_convrot.safetensors,13492686496,0,https://modelscope.cn/models/Comfy-Org/Krea-2/resolve/master/diffusion_models/krea2_turbo_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Krea-2/resolve/main/diffusion_models/krea2_turbo_int8_convrot.safetensors',
                             'loras,krea2_identity_edit_v1_2.safetensors,1828256432,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/loras/krea2_identity_edit_v1_2.safetensors,https://huggingface.co/conradlocke/krea2-identity-edit/resolve/main/krea2_identity_edit_v1_2.safetensors',
                             'loras,krea2filterbypass3.safetensors,160,0,https://hf-mirror.com/uzumix/krea2filterbypass3.safetensors/resolve/main/krea2filterbypass3.safetensors,https://huggingface.co/uzumix/krea2filterbypass3.safetensors/resolve/main/krea2filterbypass3.safetensors',
                             'text_encoders,qwen3vl_4b_fp8_scaled.safetensors,5242467968,0,https://modelscope.cn/models/Comfy-Org/Krea-2/resolve/master/text_encoders/qwen3vl_4b_fp8_scaled.safetensors,https://huggingface.co/Comfy-Org/Krea-2/resolve/main/text_encoders/qwen3vl_4b_fp8_scaled.safetensors',
                             'vae,qwen_image_vae.safetensors,253806246,0,https://modelscope.cn/models/Comfy-Org/Krea-2/resolve/master/vae/qwen_image_vae.safetensors,https://huggingface.co/Comfy-Org/Krea-2/resolve/main/vae/qwen_image_vae.safetensors',
                             'upscale_models,4x-AnimeSharp.pth,67010245,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/upscale_models/4x-AnimeSharp.pth,https://huggingface.co/Kim2091/AnimeSharp/resolve/main/4x-AnimeSharp.pth'],
                   'info_links': ['https://modelscope.cn/models/krea/Krea-2-Turbo',
                                  'https://www.modelscope.cn/models/hf/conradlocke-krea2-identity-edit'],
                   'preset_sample': []},
 'liveportrait_exp_package': {'id': 45,
                              'name': '[45]LivePortrait Exp表情编辑模型包',
                              'note': 'LivePortrait 图像/视频表情编辑模型包，包含LivePortrait核心模型和人脸检测模型|显存需求：★ 速度：★★★★',
                              'files': ['liveportrait,appearance_feature_extractor.safetensors,3361936,0,https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/resolve/master/appearance_feature_extractor.safetensors,https://huggingface.co/Kijai/LivePortrait_safetensors/resolve/main/appearance_feature_extractor.safetensors',
                                        'liveportrait,motion_extractor.safetensors,112496256,0,https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/resolve/master/motion_extractor.safetensors,https://huggingface.co/Kijai/LivePortrait_safetensors/resolve/main/motion_extractor.safetensors',
                                        'liveportrait,warping_module.safetensors,182158564,0,https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/resolve/master/warping_module.safetensors,https://huggingface.co/Kijai/LivePortrait_safetensors/resolve/main/warping_module.safetensors',
                                        'liveportrait,spade_generator.safetensors,221771768,0,https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/resolve/master/spade_generator.safetensors,https://huggingface.co/Kijai/LivePortrait_safetensors/resolve/main/spade_generator.safetensors',
                                        'liveportrait,stitching_retargeting_module.safetensors,911836,0,https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/resolve/master/stitching_retargeting_module.safetensors,https://huggingface.co/Kijai/LivePortrait_safetensors/resolve/main/stitching_retargeting_module.safetensors',
                                        'ultralytics,face_yolov8n.pt,6230011,0,https://www.modelscope.cn/models/Bingsu/adetailer/resolve/master/face_yolov8n.pt,https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8n.pt'],
                              'info_links': ['https://www.modelscope.cn/models/Kijai/LivePortrait_safetensors/files',
                                             'https://github.com/PowerHouseMan/ComfyUI-AdvancedLivePortrait'],
                              'preset_sample': []},
 'wan_uni3c_t2v_package': {'id': 46,
                           'name': '[46]Wan Uni3C T2V运镜模型包',
                           'note': 'Wan-Uni3C(T2V) 模型包，使用Wan2.1 T2V模型搭配Uni3C控制模型，输入参考视频控制摄像机运动|显存需求：★★★★ 速度：★',
                           'files': ['diffusion_models,wan2.1_t2v_14B_fp8_scaled.safetensors,14293896178,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.1_t2v_14B_fp8_scaled.safetensors',
                                     'diffusion_models,wan2.2_bernini_r_low_noise_int8_convrot.safetensors,14535868680,0,https://www.modelscope.cn/models/Comfy-Org/Bernini-R/resolve/master/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/Bernini-R/resolve/main/diffusion_models/wan2.2_bernini_r_low_noise_int8_convrot.safetensors',
                                     'loras,lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors,630697104,0,https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels/loras/lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Lightx2v/lightx2v_T2V_14B_cfg_step_distill_v2_lora_rank64_bf16.safetensors',
                                     'loras,Bernini-R_LightX2V_low_noise.safetensors,1244141856,0,https://modelscope.cn/models/rzgar/Bernini-R-LightX2V-4step-loras/resolve/master/Bernini-R_LightX2V_low_noise.safetensors,https://huggingface.co/rzgar/Bernini-R-LightX2V-4step-loras/resolve/main/Bernini-R_LightX2V_low_noise.safetensors',
                                     'text_encoders,nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors,6749480621,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/text_encoders/wan_umt5_xxl_v2_int8-convrot.safetensors,https://huggingface.co/rzgar/NSFW-Wan-UMT5-XXL-V2/resolve/main/encoders/nsfw_wan_umt5_xxl_v2_int8-convrot.safetensors',
                                     'vae,wan_2.1_vae.safetensors,253815318,0,https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/master/split_files/vae/wan_2.1_vae.safetensors,https://huggingface.co/Comfy-Org/Wan_2.1_ComfyUI_repackaged/resolve/main/split_files/vae/wan_2.1_vae.safetensors',
                                     'model_patches,Wan21_Uni3C_controlnet_fp16.safetensors,1997314376,0,https://www.modelscope.cn/models/Kijai/WanVideo_comfy/resolve/master/Wan21_Uni3C_controlnet_fp16.safetensors,https://huggingface.co/Kijai/WanVideo_comfy/resolve/main/Wan21_Uni3C_controlnet_fp16.safetensors',
                                     'controlnet,rife/flownet.pkl,24636301,0,https://www.modelscope.cn/models/windecay/rife/resolve/master/flownet.pkl,https://huggingface.co/windecay/SimpleSDXL2/resolve/main/SimpleModels/controlnet/rife/flownet.pkl'],
                           'info_links': ['https://modelscope.cn/models/Comfy-Org/Wan_2.1_ComfyUI_repackaged'],
                           'preset_sample': []},
 'minimax_h3_package': {'id': 47,
                        'name': '[47]MiniMax H3文生、图生、多参考图原生音视频模型包',
                        'note': 'MiniMax H3文生视频、首尾帧图生视频、多参考图视频生成模型包，输出原生音频|显存需求：★★★★ 速度：★',
                        'files': ['diffusion_models,minimax_h3_fl2va_pruned_int8_convrot.safetensors,20970379616,0,https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors,https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors',
                                  'loras,minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors,1956193000,0,https://modelscope.cn/models/lightx2v/Minimax-h3-Turbo/resolve/master/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
                                  'text_encoders,qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors,15687142551,0,https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors,https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
                                  'vae,minimax_h3_video_vae_int8_convrot.safetensors,3171670912,0,https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/vae/minimax_h3_video_vae_int8_convrot.safetensors,https://huggingface.co/Kijai/MiniMax-H3-experimental/resolve/main/minimax_h3_video_vae_int8_convrot.safetensors',
                                  'vae_approx,taeh3.safetensors,9791388,0,https://modelscope.cn/models/Kijai/MiniMax-H3-TAE/resolve/master/vae_approx/taeh3.safetensors,https://huggingface.co/Kijai/MiniMax-H3-TAE/resolve/main/vae_approx/taeh3.safetensors',
                                  'vae,minimax_h3_audio_vae_fp32.safetensors,605254808,0,https://modelscope.cn/models/Comfy-Org/MiniMax-H3/resolve/master/vae/minimax_h3_audio_vae_fp32.safetensors,https://huggingface.co/Comfy-Org/MiniMax-H3/resolve/main/vae/minimax_h3_audio_vae_fp32.safetensors',
                                  'latent_upscale_models,minimax_h3_latent_upscaler_3d_bf16.safetensors,690592992,0,https://modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpleModels/latent_upscale_models/minimax_h3_latent_upscaler_3d_bf16.safetensors,https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler/resolve/main/minimax_h3_latent_upscaler_3d_bf16.safetensors'],
                        'info_links': ['https://modelscope.cn/models/Comfy-Org/MiniMax-H3'],
                        'preset_sample': []},
}
MANUAL_DOWNLOAD_MAP = {
}

MANUAL_DOWNLOAD_LIST = [
    f"https://hf-mirror.com/windecay/SimpleSDXL2/resolve/main/SimpleModels/{category}/{filename}"
    for category, files in MANUAL_DOWNLOAD_MAP.items() 
    for filename in files
]

OBSOLETE_MODELS = [
    'flux-2-klein-9b-fp8.safetensors',
    'Flux2-Klein-9B-True-v2-fp8mixed.safetensors',
    'krea2_turbo_fp8_scaled.safetensors',
    'ltx-2-3-22b-dev_transformer_only_fp8_input_scaled.safetensors',
    'ltx-2.3-22b-dev_transformer_only_int8_convrot.safetensors',
    'ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors',
    'gemma-3-12b-it-abliterated_heretic_lora_rank64_bf16.safetensors',
    'ltx-2.3_text_projection_bf16.safetensors',
    'gemma_3_12B_it_fpmixed.safetensors',
    'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
    'LTX23_audio_vae_bf16.safetensors',
    'LTX23_video_vae_bf16.safetensors',
    'taeltx2_3.safetensors',
    'wan2.1_14B_SCAIL_2_fp8_scaled.safetensors',
    'wan2.2_bernini_r_high_noise_fp8_scaled.safetensors',
    'wan2.2_bernini_r_low_noise_fp8_scaled.safetensors',
    'z_image_turbo_bf16.safetensors',
    'krea2_identity_edit_v1_1.safetensors',
    'wan2.2_i2v_A14b_high_noise_lora_rank64_lightx2v_4step_1022.safetensors',
    'wan2.2_i2v_A14b_low_noise_lora_rank64_lightx2v_4step_1022.safetensors',
    'umt5-xxl-encoder-Q8_0.gguf',
    'nsfw_wan_umt5-xxl_bf16_fixed.safetensors',
    'minimax_h3_video_vae_fp16.safetensors'
]

MODELSCOPE_FILE_CACHE = {}

def get_modelscope_file_sha256(url, verbose=True):
    """
    尝试从ModelScope API获取文件的SHA256
    URL格式: https://www.modelscope.cn/models/{namespace}/{repo_name}/resolve/{revision}/{file_path}
    API格式: https://modelscope.cn/api/v1/models/{namespace}/{repo_name}/repo/files?Revision={revision}&Recursive=true
    """
    pattern = r'https?://(?:www\.)?modelscope\.cn/models/([^/]+)/([^/]+)/resolve/([^/]+)/(.*)'
    match = re.match(pattern, url)

    if not match:
        return None

    namespace, repo_name, revision, file_path = match.groups()
    cache_key = (namespace, repo_name, revision)

    try:
        from urllib.parse import unquote
        file_path = unquote(file_path)
    except:
        pass

    if cache_key not in MODELSCOPE_FILE_CACHE:
        api_url = f"https://modelscope.cn/api/v1/models/{namespace}/{repo_name}/repo/files?Revision={revision}&Recursive=true"
        try:
            if verbose:
                print(f"{Fore.CYAN}正在获取官方校验数据: {namespace}/{repo_name} ({revision})...{Style.RESET_ALL}")
            # 设置较短超时，避免卡住
            response = requests.get(api_url, timeout=15)
            if response.status_code == 200:
                data = response.json()
                file_map = {}
                if 'Data' in data and 'Files' in data['Data']:
                    for f in data['Data']['Files']:
                        if f['Type'] == 'blob':
                            file_map[f['Path']] = f['Sha256']
                MODELSCOPE_FILE_CACHE[cache_key] = file_map
                if verbose:
                    print(f"{Fore.GREEN}√ 获取成功，已缓存 {len(file_map)} 个文件的特征值{Style.RESET_ALL}")
            else:
                if verbose:
                    print(f"{Fore.RED}无法获取官方数据 (HTTP {response.status_code}){Style.RESET_ALL}")
                MODELSCOPE_FILE_CACHE[cache_key] = None
        except Exception as e:
            if verbose:
                print(f"{Fore.RED}获取官方数据失败: {e}{Style.RESET_ALL}")
            MODELSCOPE_FILE_CACHE[cache_key] = None

    file_map = MODELSCOPE_FILE_CACHE.get(cache_key)
    if file_map:
        return file_map.get(file_path)
    return None

def calculate_sha256(file_path):
    """计算文件的SHA256哈希值"""
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            # Read and update hash string value in blocks of 4K
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        return f"Error: {e}"


def verify_package_strict(package_id, packages):
    """严格校验包内文件的SHA256"""
    # Find package
    target_package = None
    for pkg_name, pkg_info in packages.items():
        if pkg_info["id"] == package_id:
            target_package = pkg_info
            break

    if not target_package:
        print(f"{Fore.RED}△未找到ID为 {package_id} 的模型包{Style.RESET_ALL}")
        return

    print(f"{Fore.CYAN}正在严格校验模型包: {target_package['name']} (计算SHA256需要时间，请耐心等待)...{Style.RESET_ALL}")

    path_mapping = load_model_paths()
    root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

    entries = list(iter_package_file_entries(target_package.get("files", [])))
    corrupted_files = []

    for entry in entries:
        expected_path = entry["expected_path"]
        expected_size = entry["size"]
        path_parts = expected_path.split('/')
        path_type = path_parts[0] if len(path_parts) > 0 else ''
        rel_path = entry["relative_path"].replace("/", os.sep)

        search_dirs = sorted(
            _get_search_dirs(path_mapping, path_type),
            key=lambda x: (
                0 if "SimpleModels" in x else
                1 if any(part == "models" for part in x.split(os.sep)) else
                2,
                x
            )
        )
        if not search_dirs:
            simplemodels_default = os.path.join(root, "SimpleModels")
            search_dirs = [os.path.join(simplemodels_default, path_type)]

        found = False
        actual_path = None

        for base_dir in search_dirs:
            full_path = os.path.normpath(os.path.join(base_dir, rel_path))
            if os.path.exists(full_path):
                actual_path = full_path
                found = True
                break

        target_url = entry.get("modelscope_url")

        if found and actual_path:
            print(f"正在计算: {os.path.basename(actual_path)} ...", end="", flush=True)
            sha256_val = calculate_sha256(actual_path)
            print(f"\r{Fore.GREEN}文件: {os.path.basename(actual_path)}{Style.RESET_ALL}")
            print(f"  路径: {actual_path}")
            print(f"  SHA256: {Fore.YELLOW}{sha256_val}{Style.RESET_ALL}")
            print(f"  大小: {os.path.getsize(actual_path)} bytes (预期: {expected_size})")

            # 尝试获取官方SHA256
            official_sha256 = None
            if target_url:
                official_sha256 = get_modelscope_file_sha256(target_url)

            if official_sha256:
                if sha256_val.lower() == official_sha256.lower():
                     print(f"  校验结果: {Fore.GREEN}√ 通过 (与官方一致){Style.RESET_ALL}")
                else:
                     print(f"  校验结果: {Fore.RED}× 失败 (官方: {official_sha256}){Style.RESET_ALL}")
                     corrupted_files.append((actual_path, target_url, expected_size, sha256_val, official_sha256))
            else:
                 print(f"  校验结果: {Fore.YELLOW}? 未能获取官方数据，请人工比对{Style.RESET_ALL}")

        else:
            print(f"{Fore.RED}×文件缺失: {expected_path}{Style.RESET_ALL}")

    if corrupted_files:
        print(f"\n{Fore.RED}发现 {len(corrupted_files)} 个文件的SHA256与官方不匹配：{Style.RESET_ALL}")
        for path, _, _, local_sha256, official_sha256 in corrupted_files:
            print(f"- {os.path.basename(path)}")
            print(f"  路径: {path}")
            print(f"  本地SHA256: {local_sha256}")
            print(f"  官方SHA256: {official_sha256}")

        print(f"\n{Fore.YELLOW}是否删除这些受损文件并重新下载？(y/n): {Style.RESET_ALL}", end="")
        choice = input().strip().lower()
        if choice == 'y':
            with open("downloadlist.txt", "w") as f1:
                for path, url, size, _, _ in corrupted_files:
                    try:
                        os.remove(path)
                        print(f"已删除: {path}")
                        f1.write(f"{url},{size}\n")
                    except Exception as e:
                        print(f"删除失败 {path}: {e}")

            print("启动自动下载...")
            auto_download_missing_files_with_retry()

    print(f"\n{Fore.CYAN}校验完成。{Style.RESET_ALL}")

def run_cli_command(argv):
    parser = argparse.ArgumentParser(prog="model_checker", add_help=True)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--list-packages", action="store_true")
    group.add_argument("--validate", action="store_true")
    group.add_argument("--download-packages", type=str)
    group.add_argument("--download-files", type=str)
    group.add_argument("--verify-sha", type=str)
    group.add_argument("--delete-packages", type=str)
    group.add_argument("--force-delete-packages", type=str)
    group.add_argument("--download-previews", action="store_true")
    group.add_argument("--package-status", nargs="?", const="ALL")
    group.add_argument("--cleanup-cache", action="store_true")
    args = parser.parse_args(argv)

    if args.list_packages:
        filtered_packages = filter_packages_by_gpu_arch(packages)
        output = []
        for pkg_key, pkg_info in filtered_packages.items():
            pkg_entry = {
                "key": pkg_key,
                "id": pkg_info.get("id"),
                "name": pkg_info.get("name"),
                "note": pkg_info.get("note", ""),
                "info_links": get_package_info_links(pkg_info),
                "files": list(iter_package_file_entries(pkg_info.get("files", []))),
            }
            output.append(pkg_entry)
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    if args.validate:
        validate_files(packages)
        return

    if args.download_previews:
        trigger_manual_download()
        return

    if args.cleanup_cache:
        delete_partial_files()
        delete_specific_image_files()
        delete_log_files()
        return

    if getattr(args, "package_status", None) is not None:
        spec = args.package_status
        package_ids = None
        if spec and spec.upper() != "ALL":
            normalized_input = spec.replace('，', ',')
            ids = []
            for pkg_id_str in normalized_input.split(','):
                pkg_id_str = pkg_id_str.strip()
                if not pkg_id_str:
                    continue
                if pkg_id_str.isdigit():
                    ids.append(int(pkg_id_str))
                else:
                    print(f"{Fore.RED}△输入格式错误：'{pkg_id_str}' 不是有效的模型包编号{Style.RESET_ALL}")
            package_ids = ids
        status = get_package_status(packages, package_ids)
        _print_obsolete_models_report()
        print(json.dumps(status, ensure_ascii=False, indent=2))
        return

    if args.verify_sha:
        input_content = args.verify_sha.strip()
        normalized_input = input_content.replace('，', ',')
        if ',' in normalized_input:
            pkg_ids = normalized_input.split(',')
            valid_ids = []
            for pid in pkg_ids:
                pid = pid.strip()
                if pid.isdigit():
                    valid_ids.append(int(pid))
                elif pid:
                    print(f"{Fore.RED}△无效的模型包编号：{pid}{Style.RESET_ALL}")
            for pid in valid_ids:
                verify_package_strict(pid, packages)
        elif input_content.isdigit():
            verify_package_strict(int(input_content), packages)
        else:
            print(f"{Fore.RED}△输入格式错误，请输入类似 1 或 1,3,5 来校验对应模型包。{Style.RESET_ALL}")
        return

    if args.download_files:
        spec = args.download_files.strip()
        if not spec:
            print(f"{Fore.RED}△未指定要下载的文件{Style.RESET_ALL}")
            return
        expected_paths = [p for p in (part.strip() for part in spec.split(";")) if p]
        download_files_by_expected_paths(expected_paths)
        return

    if args.download_packages:
        spec = args.download_packages.strip()
        if spec.lower() == "all":
            print("※启动自动下载模块,支持断点续传，关闭窗口可中断。")
            download_missing_for_packages(None)
            return

        normalized_input = spec.replace('，', ',')
        package_ids = normalized_input.split(',')
        valid_input = True
        selected_ids = []

        for pkg_id_str in package_ids:
            pkg_id_str = pkg_id_str.strip()
            if not pkg_id_str.isdigit():
                print(f"{Fore.RED}△输入格式错误：'{pkg_id_str}' 不是有效的模型包编号{Style.RESET_ALL}")
                valid_input = False
                break

            package_id = int(pkg_id_str)
            exists = any(pkg_info.get("id") == package_id for pkg_info in packages.values())
            if not exists:
                print(f"{Fore.RED}△模型包编号{package_id} 无效，请输入正确的模型包ID。{Style.RESET_ALL}")
                valid_input = False
                break
            selected_ids.append(package_id)

        if valid_input and selected_ids:
            print(f"{Fore.GREEN}√已选择 {len(selected_ids)} 个模型包，正在生成合并的下载列表...{Style.RESET_ALL}")
            download_missing_for_packages(selected_ids)
        return

    if args.delete_packages:
        package_spec = args.delete_packages.strip()
        normalized_input = package_spec.replace('，', ',')
        package_ids = normalized_input.split(',')
        for pkg_id_str in package_ids:
            pkg_id_str = pkg_id_str.strip()
            if not pkg_id_str.isdigit():
                print(f"{Fore.RED}△输入格式错误，请输入类似 1 或 1,3,5 来删除对应模型包。{Style.RESET_ALL}")
                continue
            package_id = int(pkg_id_str)
            selected_package = None
            selected_pkg_name = None
            for pkg_name, pkg_info in packages.items():
                if pkg_info["id"] == package_id:
                    selected_package = pkg_info
                    selected_pkg_name = pkg_name
                    break
            if selected_package:
                print(f"{Fore.YELLOW}△即将删除模型包：[{selected_package['name']}]{Style.RESET_ALL}")
                delete_package(selected_pkg_name, packages)
            else:
                print(f"{Fore.RED}△无效的模型包编号！{Style.RESET_ALL}")
        return

    if args.force_delete_packages:
        package_spec = args.force_delete_packages.strip()
        normalized_input = package_spec.replace('，', ',')
        package_ids = normalized_input.split(',')
        for pkg_id_str in package_ids:
            pkg_id_str = pkg_id_str.strip()
            if not pkg_id_str.isdigit():
                print(f"{Fore.RED}△输入格式错误，请输入类似 1 或 1,3,5 来强制删除对应模型包。{Style.RESET_ALL}")
                continue
            package_id = int(pkg_id_str)
            selected_package = None
            selected_pkg_name = None
            for pkg_name, pkg_info in packages.items():
                if pkg_info["id"] == package_id:
                    selected_package = pkg_info
                    selected_pkg_name = pkg_name
                    break
            if selected_package:
                delete_package_force(selected_pkg_name, packages)
            else:
                print(f"{Fore.RED}△无效的模型包编号！{Style.RESET_ALL}")
        return

def main():
    print()
    print_colored("★★★★★★★★★★★★★★★★★★欢迎使用SimpleAI模型检测器★★★★★★★★★★★★★★★★★★", Fore.CYAN)
    time.sleep(0.1)
    print()
    check_python_embedded()
    time.sleep(0.1)
    check_script_file()
    time.sleep(0.1)
    total_virtual = get_total_virtual_memory()
    time.sleep(0.1)
    check_virtual_memory(total_virtual)
    time.sleep(0.1)
    print_instructions()
    time.sleep(0.1)
    validate_files(packages)
    print()
    print_colored("★★★★★★★★★★★★★★★★★★检测已结束执行自动下载模块★★★★★★★★★★★★★★★★★★", Fore.CYAN)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        run_cli_command(sys.argv[1:])
    else:
        main()
        print()
        while True:
            print(f">>>输入【{Fore.YELLOW}ALL{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】----------------启动全部文件下载<<<     备注：支持断点续传，顺序从小文件开始。")
            print(f">>>输入【{Fore.YELLOW}模型包编号{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】----------启动预置包补全<<<     备注：可输入多个编号，例如1,5,7")
            print(f">>>数字【{Fore.YELLOW}0{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】-清理日志/下载/图片缓存与坏文件<<<     备注：△谨慎执行。慎防误删私有模型")
            print(f">>>输入【{Fore.YELLOW}DEL{Style.RESET_ALL}】【{Fore.YELLOW}模型包编号{Style.RESET_ALL}】----------删除已有模型包文件<<<     备注：△谨慎执行。自动避开关联文件")
            print(f">>>输入【{Fore.YELLOW}*DEL{Style.RESET_ALL}】【{Fore.YELLOW}模型包编号{Style.RESET_ALL}】-------强制删除模型包文件<<<     备注：△谨慎执行。不检查关联性直接删除")
            print(f">>>输入【{Fore.YELLOW}R{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】-----------------------重新检测<<<     备注：再玩一遍，玩不腻")
            print(f">>>输入【{Fore.YELLOW}S{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】-----------------下载模型预览图<<<     备注：只下载checkpoints和lora预览图")
            print(f">>>输入【{Fore.YELLOW}SHA{Style.RESET_ALL}】【{Fore.YELLOW}模型包编号{Style.RESET_ALL}】-------------校验模型包SHA256<<<     备注：严格校验,支持多个编号")
            print(f">>>输入【{Fore.YELLOW}H{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】--------切换下载源到Huggingface<<<     备注：当前使用源：{current_source}")
            print(f">>>输入【{Fore.YELLOW}M{Style.RESET_ALL}】 【{Fore.YELLOW}回车{Style.RESET_ALL}】--------切换下载源到ModelScope<<<<     备注：当前使用源：{current_source}")
            print("请选择操作(不需要括号):", flush=True)
            user_input = input()

            stripped_input = user_input.strip()

            if stripped_input.lower() == "all":
                print("※启动自动下载模块,支持断点续传，关闭窗口可中断。")
                auto_download_missing_files_with_retry(max_threads=5)
            elif stripped_input.lower().startswith("sha"):
                input_content = stripped_input[3:].strip()
                normalized_input = input_content.replace('，', ',')
                if ',' in normalized_input:
                    pkg_ids = normalized_input.split(',')
                    valid_ids = []
                    for pid in pkg_ids:
                        pid = pid.strip()
                        if pid.isdigit():
                            valid_ids.append(int(pid))
                        elif pid:
                            print(f"{Fore.RED}△无效的模型包编号：{pid}{Style.RESET_ALL}")
                    for pid in valid_ids:
                        verify_package_strict(pid, packages)
                elif input_content.isdigit():
                    verify_package_strict(int(input_content), packages)
                else:
                    print(f"{Fore.RED}△输入格式错误，请输入类似 sha 1 或 sha 1,3,5 来校验对应模型包。{Style.RESET_ALL}")
            elif ',' in stripped_input or '，' in stripped_input:
                selected_packages = {}
                normalized_input = stripped_input.replace('，', ',')
                package_ids = normalized_input.split(',')
                valid_input = True

                for pkg_id_str in package_ids:
                    pkg_id_str = pkg_id_str.strip()
                    if not pkg_id_str.isdigit():
                        print(f"{Fore.RED}△输入格式错误：'{pkg_id_str}' 不是有效的模型包编号{Style.RESET_ALL}")
                        valid_input = False
                        break

                    package_id = int(pkg_id_str)
                    found = False

                    for package_name, package_info in packages.items():
                        if package_info["id"] == package_id:
                            selected_packages[package_name] = package_info
                            found = True
                            break

                    if not found:
                        print(f"{Fore.RED}△模型包编号{package_id} 无效，请输入正确的模型包ID。{Style.RESET_ALL}")
                        valid_input = False
                        break

                if valid_input and selected_packages:
                    print(f"{Fore.GREEN}√已选择 {len(selected_packages)} 个模型包，正在生成合并的下载列表...{Style.RESET_ALL}")
                    get_download_links_for_package(selected_packages, "downloadlist.txt")
                    auto_download_missing_files_with_retry(max_threads=5)
            elif stripped_input.isdigit():
                package_id = int(stripped_input)
                selected_package = None
                for package_name, package_info in packages.items():
                    if package_info["id"] == package_id:
                        selected_package = package_info
                        break

                if selected_package:
                    get_download_links_for_package({package_name: selected_package}, "downloadlist.txt")
                    auto_download_missing_files_with_retry(max_threads=5)
                elif package_id == 0:
                    delete_partial_files()
                    delete_specific_image_files()
                    delete_log_files()
                else:
                    print(f"{Fore.RED}△模型包编号{package_id} 无效，请输入正确的模型包ID。{Style.RESET_ALL}")
            elif stripped_input.lower().startswith("*del"):
                try:
                    path_mapping = load_model_paths()
                    package_id_str = stripped_input[4:].strip()

                    if not package_id_str.isdigit():
                        print(f"{Fore.RED}△输入格式错误，请输入类似 *del1 来强制删除对应模型包。{Style.RESET_ALL}")
                    else:
                        package_id = int(package_id_str)
                        selected_package = None
                        selected_pkg_name = None

                        for pkg_name, pkg_info in packages.items():
                            if pkg_info["id"] == package_id:
                                selected_package = pkg_info
                                selected_pkg_name = pkg_name
                                break

                        if selected_package:
                            delete_package_force(selected_pkg_name, packages)
                        else:
                            print(f"{Fore.RED}△无效的模型包编号！{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}△强制删除过程中发生错误：{str(e)}{Style.RESET_ALL}")
            elif stripped_input.lower().startswith("del"):
                try:
                    path_mapping = load_model_paths()
                    package_id_str = stripped_input[3:].strip()

                    if not package_id_str.isdigit():
                        print(f"{Fore.RED}△输入格式错误，请输入类似 del1 来删除对应模型包。{Style.RESET_ALL}")
                    else:
                        package_id = int(package_id_str)
                        selected_package = None

                        for pkg_name, pkg_info in packages.items():
                            if pkg_info["id"] == package_id:
                                selected_package = pkg_info
                                break

                        if selected_package:
                            print(f"{Fore.YELLOW}△即将删除模型包：[{selected_package['name']}]{Style.RESET_ALL}")
                            delete_package(pkg_name, packages)
                        else:
                            print(f"{Fore.RED}△无效的模型包编号！{Style.RESET_ALL}")
                except Exception as e:
                    print(f"{Fore.RED}△删除过程中发生错误：{str(e)}{Style.RESET_ALL}")
            elif stripped_input.lower() == "r":
                print("重新检测文件...")
                validate_files(packages)
            elif stripped_input.lower() == "s":
                print("下载预览图...")
                trigger_manual_download()
            elif stripped_input.lower() == "h":
                CURRENT_DOWNLOAD_SOURCE = "huggingface"
                CURRENT_DOWNLOAD_PREFIX = HF_DOWNLOAD_PREFIX
                current_source = "HuggingFace拥抱脸国外源"
                validate_files(packages)
                print(f"{Fore.GREEN}√下载源已切换到Huggingface：{CURRENT_DOWNLOAD_PREFIX}{Style.RESET_ALL}")
                print(f"{Fore.YELLOW}※提示：此切换只在本次运行有效，重启程序后将恢复默认设置。{Style.RESET_ALL}")
            elif stripped_input.lower() == "m":
                CURRENT_DOWNLOAD_SOURCE = "modelscope"
                CURRENT_DOWNLOAD_PREFIX = DEFAULT_DOWNLOAD_PREFIX
                current_source = "ModelScope魔搭国内源"
                validate_files(packages)
                print(f"{Fore.GREEN}√下载源已切换到ModelScope：{CURRENT_DOWNLOAD_PREFIX}{Style.RESET_ALL}")
                print(f"{Fore.YELLOW}※提示：此切换只在本次运行有效，重启程序后将恢复默认设置。{Style.RESET_ALL}")
            else:
                print(f"{Fore.RED}△无效的输入，请输入回车或有效的模型包编号（不需要括号）。{Style.RESET_ALL}")
