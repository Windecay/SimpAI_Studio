import json
import logging
import os


SIMPAI_CONFIG_PATH_MAP = {
    "checkpoints": ("path_diffusion_models", "path_checkpoints"),
    "configs": ("path_configs",),
    "LLM": ("path_LLM",),
    "llms": ("path_llms",),
    "clip_vision": ("path_clip_vision", "path_ipadapter"),
    "clip": ("path_text_encoders", "path_clip"),
    "controlnet": ("path_controlnet",),
    "diffusers": ("path_diffusers",),
    "diffusion_models": ("path_unet", "path_diffusion_models", "path_checkpoints"),
    "embeddings": ("path_embeddings",),
    "loras": ("path_loras",),
    "upscale_models": ("path_upscale_models",),
    "latent_upscale_models": ("path_latent_upscale_models",),
    "unet": ("path_unet", "path_diffusion_models", "path_checkpoints"),
    "rembg": ("path_rembg",),
    "birefnet": ("path_birefnet",),
    "layer_model": ("path_layer_model",),
    "vae": ("path_vae",),
    "vae_approx": ("path_vae_approx",),
    "gligen": ("path_gligen",),
    "hypernetworks": ("path_hypernetworks",),
    "photomaker": ("path_photomaker",),
    "ipadapter": ("path_ipadapter", "path_controlnet"),
    "inpaint": ("path_inpaint",),
    "sams": ("path_sams",),
    "pulid": ("path_pulid",),
    "insightface": ("path_insightface",),
    "style_models": ("path_style_models",),
    "audio_encoders": ("path_audio_encoders",),
    "background_removal": ("path_background_removal",),
    "model_patches": ("path_model_patches",),
    "frame_interpolation": ("path_frame_interpolation",),
    "geometry_estimation": ("path_geometry_estimation",),
    "optical_flow": ("path_optical_flow",),
    "grounding-dino": ("path_grounding_dino",),
    "detection": ("path_detection",),
    "ultralytics": ("path_ultralytics",),
    "liveportrait": ("path_liveportrait",),
    "bbox": ("path_bbox",),
    "segm": ("path_segm",),
    "text_encoders": ("path_text_encoders", "path_clip"),
    "sam3": ("path_sam3",),
    "sam3dbody": ("path_sam3dbody",),
    "sharp": ("path_sharp",),
    "lsnet": ("path_lsnet",),
    "seedvr2": ("path_SEEDVR2",),
    "hunyuan_foley": ("path_hunyuan_foley",),
    "qwen-tts": ("path_qwen_tts",),
}


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
    "LLM": ("LLM", "llm"),
    "llms": ("llms", "LLM", "llm"),
    "seedvr2": ("SEEDVR2",),
    "qwen-tts": ("qwen-tts",),
}


def _repo_root_from_yaml(yaml_path):
    if yaml_path:
        return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(yaml_path)), os.pardir))
    return os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))


def _resolve_path(path, base_dir):
    value = os.path.expandvars(os.path.expanduser(str(path or "").strip()))
    if not value:
        return ""
    if not os.path.isabs(value):
        value = os.path.join(base_dir, value)
    return os.path.normpath(os.path.abspath(value))


def _path_is_relative(path):
    value = os.path.expandvars(os.path.expanduser(str(path or "").strip()))
    return bool(value) and not os.path.isabs(value)


def _as_path_list(value):
    if isinstance(value, (list, tuple)):
        return [str(x).strip() for x in value if isinstance(x, str) and x.strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _dedupe_paths(paths):
    out = []
    seen = set()
    for path in paths:
        if not path:
            continue
        key = os.path.normcase(os.path.normpath(path))
        if key in seen:
            continue
        seen.add(key)
        out.append(path)
    return out


def _first_env_value(names):
    for name in names:
        value = os.getenv(name)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _models_root_from_env():
    return _first_env_value(("simpleai_models_root", "SIMPLEAI_MODELS_ROOT"))


def _userhome_config_candidates_from_env():
    candidates = []
    for env_name in ("simpleai_userhome", "SIMPLEAI_USERHOME"):
        env_userhome = os.getenv(env_name)
        if env_userhome:
            candidates.append(os.path.join(_resolve_path(env_userhome, os.getcwd()), "config.txt"))
    return candidates


def _repo_config_candidates(repo_root):
    return [
        os.path.abspath(os.path.join(repo_root, "..", "..", "users", "config.txt")),
        os.path.abspath(os.path.join(repo_root, "users", "config.txt")),
        os.path.abspath(os.path.join(repo_root, "..", "users", "config.txt")),
    ]


def _cwd_config_candidates():
    return [
        os.path.abspath(os.path.join(os.getcwd(), "..", "..", "users", "config.txt")),
        os.path.abspath(os.path.join(os.getcwd(), "users", "config.txt")),
    ]


def _config_candidates(repo_root):
    candidates = (
        _userhome_config_candidates_from_env()
        + _repo_config_candidates(repo_root)
        + _cwd_config_candidates()
    )
    return _dedupe_paths(candidates)


def _config_write_candidate(repo_root):
    candidates = _userhome_config_candidates_from_env() + _repo_config_candidates(repo_root)
    return candidates[0] if candidates else None


def find_simpai_config_path(repo_root=None):
    repo_root = os.path.abspath(repo_root or _repo_root_from_yaml(None))
    for candidate in _config_candidates(repo_root):
        if os.path.isfile(candidate):
            return candidate
    return None


def _primary_config_path(repo_root):
    for candidate in _dedupe_paths(_userhome_config_candidates_from_env() + _repo_config_candidates(repo_root)):
        if os.path.isfile(candidate):
            return candidate
    return None


def _default_models_root_config_value(repo_root):
    candidates = ("../../SimpleModels", "../SimpleModels", "SimpleModels")
    for value in candidates:
        if os.path.isdir(_resolve_path(value, repo_root)):
            return value
    return "../../SimpleModels"


def _default_models_root_abs(repo_root):
    return _resolve_path(_default_models_root_config_value(repo_root), repo_root)


def _models_root_config_value(config, repo_root):
    models_root = config.get("path_models_root") if isinstance(config, dict) else None
    if isinstance(models_root, str) and models_root.strip():
        return models_root.strip()
    return _default_models_root_config_value(repo_root)


def _is_path_under(path, root):
    try:
        path_norm = os.path.normcase(os.path.normpath(os.path.abspath(path)))
        root_norm = os.path.normcase(os.path.normpath(os.path.abspath(root)))
        return os.path.commonpath([path_norm, root_norm]) == root_norm
    except Exception:
        return False


def _path_to_repo_relative(path, repo_root):
    return os.path.normpath(os.path.relpath(os.path.abspath(path), repo_root)).replace("\\", "/")


def _relative_yaml_path(path):
    return os.path.normpath(path).replace("\\", "/")


def ensure_simpai_config_from_launch_context(repo_root=None):
    repo_root = os.path.abspath(repo_root or _repo_root_from_yaml(None))
    models_root = _models_root_from_env() or _default_models_root_config_value(repo_root)

    config_path = _primary_config_path(repo_root) or _config_write_candidate(repo_root)
    if not config_path:
        return None

    config = {}
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
            if not isinstance(loaded, dict):
                return None
            config = loaded
        except Exception as e:
            logging.warning("Failed to read SimpAI config before env bootstrap: %s (%s)", config_path, e)
            return None

    current = config.get("path_models_root")
    if isinstance(current, str) and current.strip():
        return config_path

    config["path_models_root"] = models_root
    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
    except Exception as e:
        logging.warning("Failed to write SimpAI config from env: %s (%s)", config_path, e)
        return None

    logging.info("Wrote SimpAI model root config from launch context: %s", config_path)
    return config_path


def ensure_simpai_config_from_env(repo_root=None):
    return ensure_simpai_config_from_launch_context(repo_root)


def load_simpai_config(repo_root=None):
    repo_root = os.path.abspath(repo_root or _repo_root_from_yaml(None))
    ensure_simpai_config_from_launch_context(repo_root)
    config_path = find_simpai_config_path(repo_root)
    if config_path is None:
        return None, None
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f), config_path


def get_models_root(config, repo_root):
    return _resolve_path(_models_root_config_value(config, repo_root), repo_root)


def models_root_yaml_value(config, repo_root):
    raw_root = _models_root_config_value(config, repo_root)
    models_root = _resolve_path(raw_root, repo_root)
    if _path_is_relative(raw_root):
        return _relative_yaml_path(raw_root)
    if _is_path_under(models_root, _default_models_root_abs(repo_root)):
        return _path_to_repo_relative(models_root, repo_root)
    return os.path.normpath(models_root)


def path_yaml_value(path, config, repo_root):
    resolved = _resolve_path(path, repo_root)
    raw_root = _models_root_config_value(config, repo_root)
    models_root = get_models_root(config, repo_root)
    if _path_is_relative(raw_root) and _is_path_under(resolved, models_root):
        return _path_to_repo_relative(resolved, repo_root)
    if _is_path_under(resolved, _default_models_root_abs(repo_root)):
        return _path_to_repo_relative(resolved, repo_root)
    if _is_path_under(resolved, repo_root):
        return _path_to_repo_relative(resolved, repo_root)
    return os.path.normpath(resolved)


def model_root_category_dirs(folder_name, models_root):
    folders = MODEL_ROOT_CATEGORY_FOLDERS.get(folder_name, (folder_name,))
    return [os.path.normpath(os.path.join(models_root, folder)) for folder in folders]


def package_models_root(repo_root):
    return os.path.normpath(os.path.join(repo_root, "models"))


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


def infer_extra_model_roots(config, repo_root):
    root_categories = {}
    for folder_name, config_keys in SIMPAI_CONFIG_PATH_MAP.items():
        folders = MODEL_ROOT_CATEGORY_FOLDERS.get(folder_name, (folder_name,))
        for config_key in config_keys:
            for raw_path in _as_path_list(config.get(config_key)):
                resolved = _resolve_path(raw_path, repo_root)
                for folder in folders:
                    root = _root_from_category_path(resolved, folder)
                    if not root:
                        continue
                    key = os.path.normcase(os.path.normpath(root))
                    root_categories.setdefault(key, {"root": root, "categories": set()})["categories"].add(folder_name)
    return [
        item["root"]
        for item in root_categories.values()
        if len(item["categories"]) >= 2
    ]


def build_folder_paths(config, folder_name, repo_root):
    models_root = get_models_root(config, repo_root)
    paths = model_root_category_dirs(folder_name, models_root)
    paths.extend(model_root_category_dirs(folder_name, package_models_root(repo_root)))
    for extra_root in infer_extra_model_roots(config, repo_root):
        paths.extend(model_root_category_dirs(folder_name, extra_root))
    for config_key in SIMPAI_CONFIG_PATH_MAP.get(folder_name, ()):
        paths.extend(_resolve_path(path, repo_root) for path in _as_path_list(config.get(config_key)))
    return _dedupe_paths(paths)


def _format_extra_model_paths_value(paths, indent):
    if not paths:
        return None
    if len(paths) == 1:
        return paths[0]
    return "|\n" + "\n".join((" " * indent) + path for path in paths)


def build_extra_model_paths_text(config, repo_root):
    lines = ["", "comfyui:", f"     models_root: {models_root_yaml_value(config, repo_root)}"]
    for folder_name in SIMPAI_CONFIG_PATH_MAP:
        paths = [path_yaml_value(path, config, repo_root) for path in build_folder_paths(config, folder_name, repo_root)]
        value = _format_extra_model_paths_value(paths, 5 + len(folder_name))
        if value is not None:
            lines.append(f"     {folder_name}: {value}")
    return "\n".join(lines) + "\n"


def write_simpai_extra_model_paths_from_config(yaml_path):
    repo_root = _repo_root_from_yaml(yaml_path)
    try:
        config, config_path = load_simpai_config(repo_root)
    except Exception as e:
        logging.warning("Failed to load SimpAI model paths for %s (%s)", yaml_path, e)
        return False

    if config is None:
        return False

    try:
        text = build_extra_model_paths_text(config, repo_root)
        with open(yaml_path, "w", encoding="utf-8") as f:
            f.write(text)
    except Exception as e:
        logging.warning("Failed to write SimpAI extra model paths: %s (%s)", yaml_path, e)
        return False

    logging.info("Wrote SimpAI extra model paths from %s", config_path)
    return True
