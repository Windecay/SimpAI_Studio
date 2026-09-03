from __future__ import annotations

from pathlib import Path


SOURCE_BACKEND_STAGE = "source_webui_mirror"
SOURCE_BACKEND_DIR = Path(__file__).resolve().parent / "webui"
SOURCE_BACKEND_LEGACY_MIRROR_DIR = Path(__file__).resolve().parent / "source_backend_mirror"
SOURCE_BACKEND_DIRS = (
    "backend",
    "extensions-builtin",
    "html",
    "javascript",
    "localizations",
    "modules",
    "modules_forge",
    "scripts",
)
SOURCE_BACKEND_ROOT_FILES = (
    "launch.py",
    "script.js",
    "style.css",
    "webui.py",
)
SOURCE_BACKEND_OPTIONAL_ROOT_FILES = ("styles.csv",)
SOURCE_BACKEND_SUFFIXES = (
    ".py",
    ".json",
    ".txt",
    ".md",
    ".xz",
    ".yaml",
    ".yml",
    ".html",
    ".css",
    ".js",
    ".mjs",
    ".jinja",
    ".csv",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".mp3",
)
SOURCE_MODULE_FILES = (
    "modules/devices.py",
    "modules/errors.py",
    "modules/images.py",
    "modules/img2img.py",
    "modules/paths.py",
    "modules/processing.py",
    "modules/prompt_parser.py",
    "modules/rng.py",
    "modules/script_callbacks.py",
    "modules/scripts.py",
    "modules/sd_models.py",
    "modules/sd_samplers.py",
    "modules/sd_samplers_cfg_denoiser.py",
    "modules/sd_samplers_common.py",
    "modules/sd_samplers_extra.py",
    "modules/sd_samplers_kdiffusion.py",
    "modules/sd_samplers_timesteps.py",
    "modules/sd_samplers_timesteps_impl.py",
    "modules/sd_schedulers.py",
    "modules/sd_unet.py",
    "modules/sd_vae.py",
    "modules/sd_vae_approx.py",
    "modules/sd_vae_taesd.py",
    "modules/shared.py",
    "modules/txt2img.py",
)
SOURCE_BACKEND_HASH_CHECKS = (
    "launch.py",
    "backend/diffusion_engine/anima.py",
    "backend/sampling/condition.py",
    "backend/sampling/sampling_function.py",
    "backend/text_processing/anima_engine.py",
    "modules/sd_samplers_kdiffusion.py",
    "modules/sd_samplers_common.py",
)
SOURCE_BACKEND_LOCAL_PATCH_FILES = (
    "backend/memory_management.py",
    "backend/patcher/base.py",
    "backend/args.py",
    "backend/loader.py",
    "extensions-builtin/sd_forge_lora/networks.py",
    "javascript/inputAccordion.js",
    "styles.csv",
    "modules/launch_utils.py",
    "modules/processing.py",
    "modules/sd_models.py",
    "modules_forge/patch_basic.py",
    "modules_forge/main_entry.py",
    "modules_forge/presets.py",
    # Local Krea-2 integration files are not present in the source WebUI.
    "backend/diffusion_engine/krea2.py",
    "backend/nn/krea2.py",
    "backend/regional_prompter_presets.json",
    "backend/sampling/__init__.py",
    "backend/text_processing/krea2_engine.py",
    "modules/k_model.py",
    "modules/k_prediction.py",
)
SOURCE_BACKEND_LOCAL_PATCH_PREFIXES = (
    # Keep the local Krea-2 Turbo model configuration if a future source tree
    # adds files at the same paths.
    "backend/huggingface/krea/Krea-2-Turbo/",
)
SOURCE_BACKEND_EXCLUDED_PATHS = (
    "backend/diffusion_engine/wan.py",
    "backend/diffusion_engine/ernie.py",
    "backend/nn/wan.py",
    "backend/nn/ernie.py",
    "backend/huggingface/wan.tokenizer.json.xz",
    "backend/huggingface/ernie.tokenizer.json.xz",
)
SOURCE_BACKEND_EXCLUDED_PREFIXES = (
    "extensions-builtin/sd_forge_radial/",
    "backend/huggingface/Wan-AI/",
    "backend/huggingface/baidu/ERNIE-Image/",
)


def source_backend_target_relative(relative: str | Path) -> Path:
    return Path(relative)


def source_backend_is_excluded(relative: str | Path) -> bool:
    normalized = Path(relative).as_posix()
    if normalized in SOURCE_BACKEND_EXCLUDED_PATHS:
        return True
    return any(normalized.startswith(prefix) for prefix in SOURCE_BACKEND_EXCLUDED_PREFIXES)


def source_backend_is_local_patch(relative: str | Path) -> bool:
    normalized = Path(relative).as_posix()
    if normalized in SOURCE_BACKEND_LOCAL_PATCH_FILES:
        return True
    return any(normalized.startswith(prefix) for prefix in SOURCE_BACKEND_LOCAL_PATCH_PREFIXES)


def source_backend_target_path(target_root: Path, relative: str | Path) -> Path:
    return target_root / source_backend_target_relative(relative)
