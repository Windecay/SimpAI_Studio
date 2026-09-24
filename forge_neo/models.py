from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from forge_neo.bootstrap import ensure_config


SOURCE_PROJECT = "Haoming02/sd-webui-forge-classic"
SOURCE_BRANCH = "neo"
SOURCE_COMMIT = "bfa6f820"
SOURCE_LICENSE = "AGPL-3.0"

UI_PRESETS = ["sd", "xl", "flux", "klein", "qwen", "qwen21", "krea2", "lumina", "zit", "anima"]
FORGE_NEO_LOCAL_CONFIG_KEYS = {"forge_preset"}
LOW_BIT_CHOICES = ["Automatic", "Float8 e4m3fn", "Float8 e5m2", "NF4", "None"]
MODEL_EXTENSIONS = {".pth", ".ckpt", ".bin", ".safetensors", ".fooocus.patch", ".patch", ".gguf", ".pt", ".onnx"}
UPSCALER_MODEL_EXTENSIONS = {".pt", ".pth", ".safetensors"}
CONFIG_PATH_KEYS = {
    "checkpoints": ("path_diffusion_models", "path_checkpoints"),
    "diffusion_models": ("path_unet", "path_diffusion_models", "path_checkpoints"),
    "vae": ("path_vae",),
    "clip": ("path_text_encoders", "path_clip"),
    "text_encoders": ("path_text_encoders", "path_clip"),
    "loras": ("path_loras",),
    "embeddings": ("path_embeddings",),
    "controlnet": ("path_controlnet",),
    "upscale_models": ("path_upscale_models", "path_esrgan_models", "path_realesrgan_models", "path_swinir_models"),
}
REFERENCE_MODEL_DIRS = {
    "checkpoints": ("Stable-diffusion", "diffusion_models", "checkpoints"),
    "diffusion_models": ("diffusion_models", "Stable-diffusion", "checkpoints"),
    "vae": ("VAE", "vae"),
    "clip": ("text_encoder", "text_encoders", "clip"),
    "text_encoders": ("text_encoder", "text_encoders", "clip"),
    "loras": ("Lora", "loras"),
    "embeddings": ("embeddings",),
    "controlnet": ("controlnet", "ControlNet"),
    "upscale_models": ("ESRGAN", "RealESRGAN", "SwinIR", "upscale_models"),
}
SIMPLEMODELS_DIRS = {
    "checkpoints": ("diffusion_models", "unet", "checkpoints"),
    "diffusion_models": ("unet", "diffusion_models", "checkpoints"),
    "vae": ("vae", "VAE"),
    "clip": ("text_encoders", "clip"),
    "text_encoders": ("text_encoders", "clip"),
    "loras": ("loras", "Lora"),
    "embeddings": ("embeddings",),
    "controlnet": ("controlnet", "ControlNet"),
    "upscale_models": ("upscale_models", "ESRGAN", "RealESRGAN", "SwinIR"),
}
LAUNCHER_PATH_CATALOGS = {
    "ckpt_dir": ("checkpoints",),
    "stable_diffusion_dir": ("checkpoints",),
    "diffusion_models_dir": ("checkpoints", "diffusion_models"),
    "text_encoder_dir": ("clip", "text_encoders"),
    "lora_dir": ("loras",),
    "vae_dir": ("vae",),
    "controlnet_dir": ("controlnet",),
    "esrgan_models_path": ("upscale_models",),
    "realesrgan_models_path": ("upscale_models",),
    "swinir_models_path": ("upscale_models",),
}

SAMPLING_METHODS = [
    "DPM++ 2M",
    "DPM++ SDE",
    "DPM++ 2M SDE",
    "DPM++ 3M SDE",
    "DPM++ 2s a RF",
    "Euler a",
    "Euler",
    "ER SDE",
    "LCM",
    "LMS",
    "Heun",
    "DPM2",
    "Res Multistep",
    "Kohaku LoNyu Yog",
    "Restart",
    "UniPC",
    "DDIM",
    "PLMS",
    "DPM++ 2M CFG++",
    "Euler a CFG++",
    "Euler CFG++",
]


def _sampler_registry_names() -> list[str]:
    return list(SAMPLING_METHODS)


def _settings_value(settings: dict[str, object] | None, key: str, default: object) -> object:
    if settings is not None:
        return settings.get(key, default)
    try:
        from forge_neo.settings import load_settings

        loaded = load_settings()
        return loaded.get(key, default) if isinstance(loaded, dict) else default
    except Exception:
        return default


def _source_sampler_display_name(name: str, *, forbidden_knowledge: bool) -> str:
    if name in {"DPM++ 2s a RF", "Flux Realistic"}:
        return "Flux Realistic" if forbidden_knowledge else "DPM++ 2s a RF"
    return name


def sampling_methods(settings: dict[str, object] | None = None, *, include_hidden: bool = False) -> list[str]:
    forbidden = bool(_settings_value(settings, "forbidden_knowledge", False))
    hidden_values = _settings_value(settings, "hide_samplers", [])
    hidden = {str(item) for item in hidden_values} if isinstance(hidden_values, (list, tuple, set)) else {str(hidden_values)}
    names: list[str] = []
    for raw_name in _sampler_registry_names():
        name = _source_sampler_display_name(str(raw_name), forbidden_knowledge=forbidden)
        if not include_hidden and (name in hidden or str(raw_name) in hidden):
            continue
        if name not in names:
            names.append(name)
    return names

SCHEDULER_TYPES = [
    "Automatic",
    "Karras",
    "Exponential",
    "Polyexponential",
    "Normal",
    "Simple",
    "Uniform",
    "SGM Uniform",
    "Linear Quadratic",
    "KL Optimal",
    "DDIM",
    "Align Your Steps",
    "Beta",
    "Turbo",
    "Bong Tangent",
    "FlowMatchEulerDiscrete",
    "Flux2",
]


def scheduler_types() -> list[str]:
    return list(SCHEDULER_TYPES)


PRESET_DEFAULTS = {
    "sd": {"steps": 32, "width": 512, "height": 768, "cfg_scale": 6.0, "sampler": "Euler a", "scheduler": "Automatic"},
    "xl": {"steps": 24, "width": 832, "height": 1216, "cfg_scale": 4.5, "sampler": "Euler a", "scheduler": "Automatic"},
    "flux": {"steps": 20, "width": 1152, "height": 896, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Beta"},
    "klein": {"steps": 4, "width": 1152, "height": 896, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Beta"},
    "qwen": {"steps": 8, "width": 1328, "height": 1328, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Beta"},
    "qwen21": {"steps": 25, "width": 1024, "height": 1024, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Simple"},
    "krea2": {"steps": 8, "width": 832, "height": 1216, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Simple"},
    "lumina": {"steps": 32, "width": 1024, "height": 1024, "cfg_scale": 4.0, "sampler": "Res Multistep", "scheduler": "Simple"},
    "zit": {"steps": 9, "width": 1024, "height": 1024, "cfg_scale": 1.0, "sampler": "Euler", "scheduler": "Beta"},
    "anima": {"steps": 32, "width": 1024, "height": 1024, "cfg_scale": 4.0, "sampler": "ER SDE", "scheduler": "Simple"},
}

PRESET_ENGINE = {
    "sd": "SDXL",
    "xl": "SDXL",
    "flux": "Flux",
    "klein": "Flux",
    "qwen": "Qwen",
    "qwen21": "Qwen",
    "krea2": "Krea2",
    "lumina": "Flux",
    "zit": "Z-image",
    "anima": "SDXL",
}

XL_ILLUSTRIOUS2_PRESET_FILE = "Illustrious(OB).json"


SIMPAI_PRESET_MODEL_FILES = {
    "sd": "SD1.5.json",
    "xl": XL_ILLUSTRIOUS2_PRESET_FILE,
    "flux": "Flux1-dev.json",
    "klein": "Flux2-Klein.json",
    "qwen": "Qwen2512.json",
    "qwen21": "Qwen2.1-Edit.json",
    "krea2": "Krea2-Turbo.json",
    "zit": "Z-imageT.json",
    "anima": "Anima.json",
}


@dataclass
class ForgeNeoModelChoices:
    checkpoints: list[str] = field(default_factory=list)
    vae: list[str] = field(default_factory=list)
    text_encoders: list[str] = field(default_factory=list)
    loras: list[str] = field(default_factory=list)
    embeddings: list[str] = field(default_factory=list)
    controlnet: list[str] = field(default_factory=list)
    upscale_models: list[str] = field(default_factory=list)


@dataclass
class ForgeNeoPresetModelDefaults:
    preset: str = "klein"
    checkpoint: str | None = None
    modules: list[str] = field(default_factory=list)
    vae: str = "None"
    text_encoders: list[str] = field(default_factory=list)
    loras: list[str] = field(default_factory=list)
    lora_weights: dict[str, float] = field(default_factory=dict)
    low_bits: str = "Automatic"


def _unique(items: list[str]) -> list[str]:
    cleaned: list[str] = []
    for item in items:
        name = str(item or "").replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep)
        if name and name not in cleaned:
            cleaned.append(name)
    return cleaned


def _as_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item or "").strip()]
    if isinstance(value, tuple):
        return [str(item) for item in value if str(item or "").strip()]
    if isinstance(value, str) and value.strip():
        return [value]
    return []


def _root_path() -> Path:
    try:
        import shared

        root = getattr(shared, "root", "")
        if root:
            return Path(str(root)).resolve()
    except Exception:
        pass
    return Path.cwd().resolve()


def _abs_dir(path: object, base: Path | None = None) -> str:
    raw = str(path or "").strip()
    if not raw:
        return ""
    expanded = os.path.expandvars(os.path.expanduser(raw))
    if os.path.isabs(expanded):
        candidate = expanded
    else:
        candidate = os.path.join(str(base or _root_path()), expanded)
    return os.path.normpath(os.path.abspath(candidate))


def _dedupe_dirs(paths: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for path in paths:
        normalized = _abs_dir(path)
        if not normalized:
            continue
        key = os.path.normcase(os.path.normpath(normalized))
        if key in seen:
            continue
        seen.add(key)
        out.append(normalized)
    return out


def _config_candidate_paths(config) -> list[Path]:
    values: list[str] = []
    configured = getattr(config, "config_path", "")
    if configured:
        values.append(str(configured))

    env_paths = os.environ.get("FORGE_NEO_MODEL_CONFIG_PATHS")
    if env_paths:
        values.extend([item for item in env_paths.split(os.pathsep) if item.strip()])

    root = _root_path()
    if len(root.parents) >= 2:
        values.append(str(root.parents[1] / "users" / "config.txt"))

    paths: list[Path] = []
    seen: set[str] = set()
    for value in values:
        path = Path(_abs_dir(value))
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        if path.is_file():
            paths.append(path)
    return paths


def _source_config_candidate_paths(config=None) -> list[Path]:
    if config is None:
        config = ensure_config()
    values: list[str] = [str(path) for path in _config_candidate_paths(config)]

    env_paths = os.environ.get("FORGE_NEO_SOURCE_CONFIG_PATHS")
    if env_paths:
        values.extend([item for item in env_paths.split(os.pathsep) if item.strip()])

    for root in _reference_root_candidates(config):
        values.append(str(root / "webui" / "config.json"))
        values.append(str(root / "config.json"))

    paths: list[Path] = []
    seen: set[str] = set()
    for value in values:
        path = Path(_abs_dir(value))
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen:
            continue
        seen.add(key)
        if path.is_file():
            paths.append(path)
    return paths


def _source_config_dicts(config=None) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in _source_config_candidate_paths(config):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(data, dict):
            rows.append(data)
    return rows


def _source_config_value(key: str, default=None, config=None):
    if key in FORGE_NEO_LOCAL_CONFIG_KEYS:
        local_value = _forge_neo_config_value(key, None)
        if local_value is not None:
            return local_value
    for data in _source_config_dicts(config):
        if key in data:
            return data.get(key)
    return default


def source_config_value(key: str, default=None):
    return _source_config_value(key, default)


def forge_neo_config_path() -> Path:
    return Path(__file__).resolve().parent / "config.json"


def _forge_neo_config_value(key: str, default=None):
    if key not in FORGE_NEO_LOCAL_CONFIG_KEYS:
        return default
    path = forge_neo_config_path()
    if not path.is_file():
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default
    if not isinstance(data, dict) or key not in data:
        return default
    return data.get(key)


def save_forge_neo_config_values(values: dict[str, object]) -> None:
    preset = str((values or {}).get("forge_preset") or "").strip().lower() if isinstance(values, dict) else ""
    if preset not in UI_PRESETS:
        return None
    path = forge_neo_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"forge_preset": preset}, ensure_ascii=False, indent=2), encoding="utf-8")
    return None


def _config_file_paths(config, catalog: str) -> list[str]:
    paths = _config_candidate_paths(config)
    if not paths:
        return []
    roots: list[str] = []
    base = _root_path()
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(data, dict):
            continue
        for key in CONFIG_PATH_KEYS.get(catalog, ()):
            for item in _as_list(data.get(key)):
                roots.append(_abs_dir(item, base))
    return roots


def _reference_root_candidates(config) -> list[Path]:
    values: list[str] = []
    env_roots = os.environ.get("FORGE_NEO_REFERENCE_ROOTS") or os.environ.get("FORGE_NEO_MODEL_ROOTS")
    if env_roots:
        values.extend([item for item in env_roots.split(os.pathsep) if item.strip()])
    config_dict = getattr(config, "config_dict", {})
    if isinstance(config_dict, dict):
        values.extend(_as_list(config_dict.get("forge_neo_reference_roots")))
        values.extend(_as_list(config_dict.get("forge_neo_model_roots")))
    roots: list[Path] = []
    seen: set[str] = set()
    for value in values:
        path = Path(_abs_dir(value))
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen or not path.is_dir():
            continue
        seen.add(key)
        roots.append(path)
    return roots


def _launcher_reference_dirs(root: Path, catalog: str) -> list[str]:
    launcher_config = root / "launcher_config.json"
    if not launcher_config.is_file():
        return []
    try:
        data = json.loads(launcher_config.read_text(encoding="utf-8"))
    except Exception:
        return []
    paths = data.get("paths") if isinstance(data, dict) else None
    if not isinstance(paths, dict):
        return []
    out: list[str] = []
    for key, catalogs in LAUNCHER_PATH_CATALOGS.items():
        if catalog not in catalogs:
            continue
        for item in _as_list(paths.get(key)):
            out.append(_abs_dir(item, root))
    return out


def _reference_model_dirs(config, catalog: str) -> list[str]:
    out: list[str] = []
    aliases = REFERENCE_MODEL_DIRS.get(catalog, ())
    for root in _reference_root_candidates(config):
        out.extend(_launcher_reference_dirs(root, catalog))
        model_roots = [root, root / "models", root / "webui" / "models"]
        for model_root in model_roots:
            for alias in aliases:
                candidate = model_root / alias
                if candidate.is_dir():
                    out.append(str(candidate))
    return out


def _simplemodels_root_candidates(config) -> list[Path]:
    values: list[str] = []
    env_roots = os.environ.get("FORGE_NEO_SIMPLEMODELS_ROOTS")
    if env_roots:
        values.extend([item for item in env_roots.split(os.pathsep) if item.strip()])
    config_dict = getattr(config, "config_dict", {})
    if isinstance(config_dict, dict):
        values.extend(_as_list(config_dict.get("forge_neo_simplemodels_roots")))
    if os.environ.get("FORGE_NEO_AUTO_SIMPLEMODELS_ROOTS", "1") != "0":
        root = _root_path()
        values.extend(str(base / "SimpleModels") for base in [root, *root.parents[:2]])

    roots: list[Path] = []
    seen: set[str] = set()
    for value in values:
        path = Path(_abs_dir(value))
        key = os.path.normcase(os.path.normpath(str(path)))
        if key in seen or not path.is_dir():
            continue
        seen.add(key)
        roots.append(path)
    return roots


def _simplemodels_dirs(config, catalog: str) -> list[str]:
    out: list[str] = []
    for root in _simplemodels_root_candidates(config):
        for alias in SIMPLEMODELS_DIRS.get(catalog, ()):
            candidate = root / alias
            if candidate.is_dir():
                out.append(str(candidate))
    return out


def _forge_webui_model_dirs(config, catalog: str) -> list[str]:
    models_root = _root_path() / "forge_neo" / "webui" / "models"
    if not models_root.is_dir():
        return []
    out: list[str] = []
    for alias in REFERENCE_MODEL_DIRS.get(catalog, ()):
        candidate = models_root / alias
        if candidate.is_dir():
            out.append(str(candidate))
    return out


def model_roots_for_catalog(catalog: str) -> list[str]:
    config = ensure_config()
    roots: list[str] = []
    model_cata_map = getattr(config, "model_cata_map", {}) or {}
    roots.extend(_as_list(model_cata_map.get(catalog)))
    for key in CONFIG_PATH_KEYS.get(catalog, ()):
        attr_name = f"paths_{key[5:]}" if key.startswith("path_") else key
        roots.extend(_as_list(getattr(config, attr_name, [])))
    roots.extend(_config_file_paths(config, catalog))
    roots.extend(_simplemodels_dirs(config, catalog))
    roots.extend(_forge_webui_model_dirs(config, catalog))
    roots.extend(_reference_model_dirs(config, catalog))
    return _dedupe_dirs(roots)


def _model_extension_allowed(path: Path, extensions: set[str] | None = None) -> bool:
    suffix = path.suffix.lower()
    if extensions is not None:
        return suffix in extensions
    return suffix in MODEL_EXTENSIONS or str(path.name).lower().endswith(".fooocus.patch")


def _scan_model_names(roots: list[str], extensions: set[str] | None = None) -> list[str]:
    names: list[str] = []
    for root_text in roots:
        root = Path(root_text)
        if not root.is_dir():
            continue
        try:
            files = sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: str(item).casefold())
        except OSError:
            continue
        for item in files:
            if not _model_extension_allowed(item, extensions):
                continue
            if not _is_usable_model_file(item):
                continue
            try:
                name = str(item.relative_to(root))
            except ValueError:
                name = item.name
            names.append(name)
    return _unique(names)


def _is_usable_model_file(path: Path) -> bool:
    try:
        return path.is_file() and path.stat().st_size > 0
    except OSError:
        return False


def _is_placeholder_name(name: str) -> bool:
    stem = Path(str(name or "").replace("\\", "/")).stem
    return stem.lower() == "placeholder"


def _drop_placeholders_when_real_models_exist(names: list[str]) -> list[str]:
    real = [name for name in names if not _is_placeholder_name(name)]
    return real or names


def _model_names(*catalogs: str, extensions: set[str] | None = None) -> list[str]:
    config = ensure_config()
    names: list[str] = []
    modelsinfo = getattr(config, "modelsinfo", None)
    for catalog in catalogs:
        if modelsinfo is not None:
            try:
                discovered = modelsinfo.get_model_names(catalog, [])
            except TypeError:
                discovered = modelsinfo.get_model_names(catalog)
            except Exception:
                discovered = []
            for name in discovered:
                try:
                    path = modelsinfo.get_model_filepath(catalog, str(name))
                except Exception:
                    path = ""
                path_obj = Path(path)
                if not path or not _model_extension_allowed(path_obj, extensions) or not _is_usable_model_file(path_obj):
                    continue
                names.append(str(name))
        names.extend(_scan_model_names(model_roots_for_catalog(catalog), extensions=extensions))
    return _drop_placeholders_when_real_models_exist(_unique(names))


def _upscaler_display_name(name: str) -> str:
    clean = str(name or "").replace("\\", "/").rsplit("/", 1)[-1]
    return Path(clean).stem


def upscale_model_names() -> list[str]:
    return _unique(
        [
            display_name
            for display_name in (_upscaler_display_name(name) for name in _model_names("upscale_models", extensions=UPSCALER_MODEL_EXTENSIONS))
            if display_name
        ]
    )


def find_upscale_model_path(name: str) -> str:
    clean_name = str(name or "").strip()
    if not clean_name or clean_name == "None":
        return ""
    config = ensure_config()
    modelsinfo = getattr(config, "modelsinfo", None)
    if modelsinfo is not None:
        try:
            discovered = modelsinfo.get_model_names("upscale_models", [])
        except TypeError:
            discovered = modelsinfo.get_model_names("upscale_models")
        except Exception:
            discovered = []
        for discovered_name in discovered:
            text = str(discovered_name or "")
            if clean_name not in {text, Path(text.replace("\\", "/")).name, _upscaler_display_name(text)}:
                continue
            try:
                path = modelsinfo.get_model_filepath("upscale_models", text)
            except Exception:
                path = ""
            path_obj = Path(path)
            if path and _model_extension_allowed(path_obj, UPSCALER_MODEL_EXTENSIONS) and _is_usable_model_file(path_obj):
                return str(path_obj)
    for root_text in model_roots_for_catalog("upscale_models"):
        root = Path(root_text)
        if not root.is_dir():
            continue
        try:
            files = sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: str(item).casefold())
        except OSError:
            continue
        for item in files:
            if not _model_extension_allowed(item, UPSCALER_MODEL_EXTENSIONS) or not _is_usable_model_file(item):
                continue
            try:
                relative_name = str(item.relative_to(root))
            except ValueError:
                relative_name = item.name
            if clean_name in {relative_name, item.name, item.stem}:
                return str(item)
    return ""


def find_model_path(name: str, *catalogs: str) -> str:
    clean_name = str(name or "").replace("\\", os.sep).replace("/", os.sep).lstrip(os.sep)
    if not clean_name or clean_name == "None":
        return ""
    config = ensure_config()
    modelsinfo = getattr(config, "modelsinfo", None)
    if modelsinfo is not None:
        for catalog in catalogs:
            try:
                path = modelsinfo.get_model_filepath(catalog, clean_name)
            except Exception:
                path = ""
            if path and _is_usable_model_file(Path(path)):
                return str(Path(path))
    for catalog in catalogs:
        for root in model_roots_for_catalog(catalog):
            candidate = Path(root) / clean_name
            if _is_usable_model_file(candidate):
                return str(candidate)
    return ""


def refresh_model_choices(preset: str = "klein") -> ForgeNeoModelChoices:
    config = ensure_config()
    engine = PRESET_ENGINE.get(str(preset or "").lower(), "Flux")
    try:
        config.update_files(engine=engine, use_model_filter=False)
    except TypeError:
        config.update_files(engine=engine)
    return ForgeNeoModelChoices(
        checkpoints=_model_names("diffusion_models", "checkpoints"),
        vae=_model_names("vae"),
        text_encoders=_model_names("text_encoders", "clip"),
        loras=_model_names("loras"),
        embeddings=_model_names("embeddings"),
        controlnet=_model_names("controlnet"),
        upscale_models=upscale_model_names(),
    )


def initial_model_choices(preset: str = "klein") -> ForgeNeoModelChoices:
    return refresh_model_choices(preset)


def module_choices(choices: ForgeNeoModelChoices) -> list[str]:
    return _unique([*list(choices.vae or []), *list(choices.text_encoders or [])])


def _choice_lookup(choices: list[str]) -> dict[str, str]:
    lookup: dict[str, str] = {}
    for choice in choices:
        text = str(choice or "")
        normalized = text.replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep)
        basename = os.path.basename(normalized)
        for key in (text, normalized, basename):
            if key:
                lookup.setdefault(key.casefold(), text)
    return lookup


def _match_choice(value: object, choices: list[str]) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    normalized = text.replace("/", os.sep).replace("\\", os.sep).lstrip(os.sep)
    basename = os.path.basename(normalized)
    lookup = _choice_lookup(choices)
    for key in (text, normalized, basename):
        matched = lookup.get(str(key).casefold())
        if matched:
            return matched
    return ""


def _requested_model_name(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.casefold() in {"none", "automatic", "default", "default (model)"}:
        return ""
    return text


def split_module_selection(values: list[str] | tuple[str, ...] | None, *, fallback_vae: str = "None") -> tuple[str, list[str]]:
    selected = _unique([str(item) for item in list(values or []) if str(item or "").strip()])
    selected_vae = ""
    text_values: list[str] = []
    for value in selected:
        if find_model_path(value, "vae"):
            if not selected_vae:
                selected_vae = value
            continue
        text_values.append(value)
    vae_name = selected_vae or str(fallback_vae or "None")
    return vae_name or "None", text_values


def initial_preset() -> str:
    preset = str(_source_config_value("forge_preset", "klein") or "klein").strip().lower()
    return preset if preset in UI_PRESETS else "klein"


def _low_bits_from_source(value: object) -> str:
    text = str(value or "Automatic").strip()
    aliases = {
        "automatic": "Automatic",
        "float8-e4m3fn": "Float8 e4m3fn",
        "float8_e4m3fn": "Float8 e4m3fn",
        "float8-e5m2": "Float8 e5m2",
        "float8_e5m2": "Float8 e5m2",
        "int8": "Automatic",
        "int8 (fp16 lora)": "Automatic",
        "bnb-nf4": "NF4",
        "nf4": "NF4",
        "none": "None",
    }
    return aliases.get(text.casefold(), text if text in LOW_BIT_CHOICES else "Automatic")


def _simpai_preset_path(preset: str) -> Path:
    filename = SIMPAI_PRESET_MODEL_FILES.get(str(preset or "").strip().lower(), "")
    if not filename:
        return Path()
    return Path(__file__).resolve().parents[1] / "presets" / filename


def _simpai_preset_model_defaults(preset: str) -> dict[str, object]:
    path = _simpai_preset_path(preset)
    if not path:
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}
    result: dict[str, object] = {
        "checkpoint": data.get("default_model"),
        "previous_checkpoints": data.get("previous_default_models"),
        "vae": data.get("default_vae"),
        "clip": data.get("default_clip_model"),
        "modules": _simpai_preset_required_modules(data),
    }
    loras, lora_weights = _simpai_preset_lora_defaults(data.get("default_loras"))
    result["loras"] = loras
    result["lora_weights"] = lora_weights
    model_list = data.get("model_list")
    if isinstance(model_list, list):
        result["model_list"] = [str(item) for item in model_list if str(item or "").strip()]
    return result


def _simpai_module_name(value: object) -> str:
    text = str(value or "").strip()
    if not text or text.casefold() in {"none", "default (model)", "default"}:
        return ""
    return text


def _simpai_model_list_names(model_list: object, catalogs: set[str]) -> list[str]:
    if not isinstance(model_list, list):
        return []
    names: list[str] = []
    wanted = {str(item).casefold() for item in catalogs}
    for row in model_list:
        parts = str(row or "").split(",", 2)
        if len(parts) < 2:
            continue
        catalog = parts[0].strip().casefold()
        name = parts[1].strip()
        if catalog in wanted and _simpai_module_name(name):
            names.append(name)
    return _unique(names)


def _simpai_preset_lora_defaults(value: object) -> tuple[list[str], dict[str, float]]:
    loras: list[str] = []
    weights: dict[str, float] = {}
    if not isinstance(value, list):
        return loras, weights
    for row in value:
        if isinstance(row, (list, tuple)) and row:
            name = _simpai_module_name(row[0])
            raw_weight = row[1] if len(row) > 1 else 1.0
        else:
            name = _simpai_module_name(row)
            raw_weight = 1.0
        if not name:
            continue
        try:
            weight = float(raw_weight)
        except Exception:
            weight = 1.0
        loras.append(name)
        weights[name] = weight
    return _unique(loras), weights


def _simpai_preset_required_modules(data: dict[str, object]) -> list[str]:
    modules: list[str] = []
    clip_name = _simpai_module_name(data.get("default_clip_model"))
    vae_name = _simpai_module_name(data.get("default_vae"))
    default_engine = data.get("default_engine")
    backend_engine = ""
    if isinstance(default_engine, dict):
        backend_engine = str(default_engine.get("backend_engine", "") or "").strip().casefold()
    if backend_engine == "flux" and clip_name.casefold().startswith(("t5", "umt5")):
        for name in _simpai_model_list_names(data.get("model_list"), {"clip", "text_encoders"}):
            if Path(str(name).replace("\\", "/")).name.casefold() == "clip_l.safetensors":
                modules.append(name)
                break
    if clip_name:
        modules.append(clip_name)
    if vae_name:
        modules.append(vae_name)
    return _unique(modules)


def _simpai_preset_modules(defaults: dict[str, object]) -> list[str]:
    modules: list[str] = []
    if isinstance(defaults.get("modules"), list):
        for value in defaults.get("modules", []):
            text = _simpai_module_name(value)
            if text:
                modules.append(text)
        if modules:
            return _unique(modules)
    for value in (defaults.get("clip"), defaults.get("vae")):
        text = _simpai_module_name(value)
        if text:
            modules.append(text)
    return _unique(modules)


def _simpai_previous_checkpoint(defaults: dict[str, object], choices: list[str]) -> str:
    raw_values = defaults.get("previous_checkpoints")
    if not isinstance(raw_values, list):
        return ""
    for value in raw_values:
        matched = _match_choice(_requested_model_name(value), choices)
        if matched:
            return matched
    return ""


def _simpai_preset_loras(defaults: dict[str, object], choices: list[str]) -> tuple[list[str], dict[str, float]]:
    raw_loras = _as_list(defaults.get("loras"))
    raw_weights = defaults.get("lora_weights")
    weight_source = raw_weights if isinstance(raw_weights, dict) else {}
    matched_loras: list[str] = []
    matched_weights: dict[str, float] = {}
    for raw_name in raw_loras:
        matched = _match_choice(raw_name, choices)
        if not matched:
            continue
        matched_loras.append(matched)
        for key in (raw_name, matched, os.path.basename(str(raw_name).replace("\\", os.sep).replace("/", os.sep))):
            if key in weight_source:
                try:
                    matched_weights[matched] = float(weight_source[key])
                except Exception:
                    matched_weights[matched] = 1.0
                break
    return _unique(matched_loras), matched_weights


def preset_model_defaults(preset: str, choices: ForgeNeoModelChoices | None = None) -> ForgeNeoPresetModelDefaults:
    preset_key = str(preset or initial_preset()).strip().lower()
    if preset_key not in UI_PRESETS:
        preset_key = "klein"
    model_choices = choices or refresh_model_choices(preset_key)
    modules = module_choices(model_choices)
    has_simpai_model_suite = preset_key in SIMPAI_PRESET_MODEL_FILES
    simpai_defaults = _simpai_preset_model_defaults(preset_key)
    source_checkpoint_value = _requested_model_name(_source_config_value(f"forge_checkpoint_{preset_key}"))
    simpai_checkpoint_value = _requested_model_name(simpai_defaults.get("checkpoint"))
    global_checkpoint_value = _requested_model_name(_source_config_value("sd_model_checkpoint"))
    source_checkpoint = _match_choice(source_checkpoint_value, model_choices.checkpoints)
    simpai_checkpoint = _match_choice(simpai_checkpoint_value, model_choices.checkpoints)
    previous_simpai_checkpoint = _simpai_previous_checkpoint(simpai_defaults, model_choices.checkpoints) if simpai_checkpoint_value and not simpai_checkpoint else ""
    global_checkpoint = _match_choice(global_checkpoint_value, model_choices.checkpoints)
    checkpoint_missing = False
    checkpoint_origin = ""
    if preset_key == "qwen" and simpai_checkpoint_value:
        checkpoint = simpai_checkpoint or previous_simpai_checkpoint or None
        checkpoint_missing = not bool(simpai_checkpoint or previous_simpai_checkpoint)
        checkpoint_origin = "simpai"
    elif source_checkpoint_value:
        checkpoint = source_checkpoint or None
        checkpoint_missing = not bool(source_checkpoint)
        checkpoint_origin = "source"
    elif simpai_checkpoint_value:
        checkpoint = simpai_checkpoint or previous_simpai_checkpoint or None
        checkpoint_missing = not bool(simpai_checkpoint or previous_simpai_checkpoint)
        checkpoint_origin = "simpai"
    elif has_simpai_model_suite:
        checkpoint = global_checkpoint or first_or_none(model_choices.checkpoints) or None
        checkpoint_origin = "global" if checkpoint and checkpoint != "None" else ""
    else:
        checkpoint = None
        checkpoint_origin = ""

    source_modules = _as_list(_source_config_value(f"forge_additional_modules_{preset_key}"))
    simpai_modules = _simpai_preset_modules(simpai_defaults)
    raw_modules_requested = False
    if checkpoint_origin == "source":
        raw_modules = _unique([*source_modules, *simpai_modules])
        raw_modules_requested = bool(source_modules or simpai_modules)
    elif checkpoint_origin == "simpai":
        raw_modules = simpai_modules
        raw_modules_requested = bool(simpai_modules)
    elif source_modules:
        raw_modules = source_modules
        raw_modules_requested = True
    elif has_simpai_model_suite:
        raw_modules = _as_list(_source_config_value("forge_additional_modules"))
        raw_modules_requested = bool(raw_modules)
    else:
        raw_modules = []
        raw_modules_requested = False
    matched_modules = [matched for value in raw_modules if (matched := _match_choice(value, modules))]
    matched_modules = _unique(matched_modules)
    if (
        not matched_modules
        and checkpoint
        and checkpoint != "None"
        and not checkpoint_missing
        and not raw_modules_requested
        and not (simpai_checkpoint and not simpai_modules)
    ):
        matched_modules = modules[:2]

    fallback_vae = _match_choice(simpai_defaults.get("vae"), model_choices.vae)
    if not fallback_vae:
        fallback_vae = "None" if (not has_simpai_model_suite or checkpoint_missing or simpai_checkpoint or raw_modules_requested) else first_or_none(model_choices.vae)
    vae_name, text_values = split_module_selection(matched_modules, fallback_vae=fallback_vae)
    low_bits = _low_bits_from_source(
        _source_config_value(f"forge_unet_storage_dtype_{preset_key}") or _source_config_value("forge_unet_storage_dtype")
    )
    loras, lora_weights = ([], {}) if checkpoint_missing else _simpai_preset_loras(simpai_defaults, model_choices.loras)
    return ForgeNeoPresetModelDefaults(
        preset=preset_key,
        checkpoint=checkpoint,
        modules=matched_modules,
        vae=vae_name,
        text_encoders=text_values,
        loras=loras,
        lora_weights=lora_weights,
        low_bits=low_bits,
    )


def first_or_none(values: list[str]) -> str:
    return values[0] if values else "None"


def defaults_for_preset(preset: str) -> dict[str, float | int | str]:
    return dict(PRESET_DEFAULTS.get(str(preset or "").lower(), PRESET_DEFAULTS["klein"]))


def settings_defaults_for_preset(
    preset: str,
    *,
    mode: str = "t2i",
    settings: dict[str, object] | None = None,
) -> dict[str, float | int | str]:
    preset_key = str(preset or "").strip().lower()
    if preset_key not in PRESET_DEFAULTS:
        preset_key = "klein"
    base = defaults_for_preset(preset_key)
    mode_key = "i2i" if str(mode or "").lower() == "i2i" else "t2i"

    def positive_int(suffix: str, default: object) -> int:
        try:
            value = int(_settings_value(settings, f"{preset_key}_{suffix}", default))
        except Exception:
            value = int(default)
        return value if value > 0 else int(default)

    def positive_float(suffix: str, default: object) -> float:
        try:
            value = float(_settings_value(settings, f"{preset_key}_{suffix}", default))
        except Exception:
            value = float(default)
        return value if value > 0.0 else float(default)

    result: dict[str, float | int | str] = {
        "steps": positive_int(f"{mode_key}_step", base["steps"]),
        "width": positive_int(f"{mode_key}_width", base["width"]),
        "height": positive_int(f"{mode_key}_height", base["height"]),
        "cfg_scale": positive_float(f"{mode_key}_cfg", base["cfg_scale"]),
        "sampler": str(_settings_value(settings, f"{preset_key}_{mode_key}_sampler", base["sampler"])),
        "scheduler": str(_settings_value(settings, f"{preset_key}_{mode_key}_scheduler", base["scheduler"])),
        "batch_size": positive_int(f"{mode_key}_batch_size", 1),
    }
    if str(mode or "").lower() in {"hires", "t2i_hr", "hr"}:
        result.update(
            {
                "steps": positive_int("t2i_hr_step", base["steps"]),
                "cfg_scale": positive_float("t2i_hr_cfg", base["cfg_scale"]),
            }
        )
    return result
