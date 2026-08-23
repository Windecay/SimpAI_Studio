import base64
import binascii
import html
import io
import hashlib
import json
import logging
import mimetypes
import os
import re
import struct
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple

from PIL import Image, ImageOps

import modules.config as config
import modules.flags as flags


logger = logging.getLogger(__name__)

MODEL_FILE_EXTENSIONS = (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf")
PREVIEW_EXTENSIONS = (".webp", ".png", ".jpg", ".jpeg")
PREVIEW_SUFFIXES = (
    ".preview.webp",
    ".preview.png",
    ".preview.jpg",
    ".preview.jpeg",
    ".webp",
    ".png",
    ".jpg",
    ".jpeg",
    ".civitai_bak.webp",
    ".civitai_bak.png",
    ".civitai_bak.jpg",
    ".civitai_bak.jpeg",
)
VIDEO_PREVIEW_EXTENSIONS = (".mp4", ".webm", ".mov", ".m4v")
PREVIEW_MAX_EDGE = 1024
SAFETENSORS_HEADER_MAX_BYTES = 100 * 1024 * 1024
REMOTE_DISABLED_TYPES = {"clip", "vae"}
MODEL_BROWSER_CATALOG_CACHE_TTL = 120.0
MODEL_BROWSER_CATALOG_CACHE: Dict[str, Dict[str, Any]] = {}
MODEL_BROWSER_CATALOG_CACHE_LOCK = threading.Lock()
_MODEL_BROWSER_METADATA_DIR_CACHE = ""
ARCH_FAMILY_CHOICES = (
    "unknown",
    "sdxl",
    "sd3",
    "sd2",
    "flux",
    "wan",
    "ltx2",
    "anima",
    "qwen",
    "z_image",
    "hunyuan",
    "sdpose",
    "melband_roformer",
    "newbie",
)

TYPE_CONFIG = {
    "base": {
        "label": "Base Model",
        "catalogs": ("checkpoints", "diffusion_models"),
        "catalog_key": "model_filenames",
        "config_attr": "model_filenames",
        "prepend": (),
    },
    "refiner": {
        "label": "Refiner Model",
        "catalogs": ("checkpoints", "diffusion_models"),
        "catalog_key": "refiner_filenames",
        "config_attr": "model_filenames",
        "prepend": ("None",),
    },
    "lora": {
        "label": "LoRA",
        "catalogs": ("loras",),
        "catalog_key": "lora_filenames",
        "config_attr": "lora_filenames",
        "prepend": ("None",),
    },
    "style": {
        "label": "Style Model",
        "catalogs": ("style_models",),
        "catalog_key": "style_model_filenames",
        "config_attr": None,
        "prepend": (),
    },
    "upscale": {
        "label": "Upscale Model",
        "catalogs": ("upscale_models",),
        "catalog_key": "upscale_model_filenames",
        "config_attr": "upscale_model_filenames",
        "prepend": ("default",),
    },
    "clip": {
        "label": "CLIP / Text Encoder",
        "catalogs": ("clip", "text_encoders"),
        "catalog_key": "clip_filenames",
        "config_attr": "clip_filenames",
        "prepend": (),
    },
    "vae": {
        "label": "VAE",
        "catalogs": ("vae",),
        "catalog_key": "vae_filenames",
        "config_attr": "vae_filenames",
        "prepend": (),
    },
}


def _model_root() -> str:
    return os.path.abspath(getattr(config, "path_models_root", None) or config.get_path_models_root())


def _models_info_path() -> str:
    return os.path.join(_model_root(), "models_info.json")


def _load_models_info() -> Dict[str, Any]:
    try:
        with open(_models_info_path(), "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_models_info(data: Dict[str, Any]) -> None:
    path = _models_info_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data if isinstance(data, dict) else {}, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def _normalize_type(value: Any) -> str:
    text = str(value or "base").strip().lower()
    if text.startswith("lora:"):
        return "lora"
    if text in ("model", "checkpoint", "checkpoints", "diffusion", "diffusion_models"):
        return "base"
    if text in ("style_model", "style_models"):
        return "style"
    if text in ("upscaler", "upscale_model", "upscale_models"):
        return "upscale"
    if text in TYPE_CONFIG:
        return text
    return "base"


def _normalize_model_name(name: Any) -> str:
    text = str(name or "").strip().replace("\\", "/")
    while text.startswith("/"):
        text = text[1:]
    return text


def _display_path(name: Any) -> str:
    return _normalize_model_name(name).replace("/", "\\")


def _unique(items: Iterable[Any]) -> List[str]:
    result: List[str] = []
    seen = set()
    for item in items or []:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.lower().replace("\\", "/")
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def _trigger_word_list(value: Any, limit: int = 64) -> List[str]:
    if isinstance(value, list):
        raw = value
    elif isinstance(value, tuple):
        raw = list(value)
    else:
        text = str(value or "").strip()
        if not text:
            return []
        raw = []
        for line in text.replace("\r", "\n").split("\n"):
            raw.extend(line.split(","))
    words: List[str] = []
    seen = set()
    for item in raw:
        if isinstance(item, (list, tuple)) and item:
            item = item[0]
        text = str(item or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        words.append(text)
        if len(words) >= limit:
            break
    return words


def _trigger_word_text(value: Any) -> str:
    if isinstance(value, (list, tuple)):
        return ", ".join(_trigger_word_list(value))
    return str(value or "").strip()


def _metadata_trained_words(sidecar: Dict[str, Any]) -> List[str]:
    words = _trigger_word_list(sidecar.get("trained_words"))
    if words:
        return words
    civitai = sidecar.get("civitai") if isinstance(sidecar.get("civitai"), dict) else {}
    return _trigger_word_list(civitai.get("trainedWords"))


def _lora_user_trigger_entry(lora_name: str) -> Tuple[bool, str, List[str]]:
    return _lora_user_trigger_entry_from_cache(lora_name, _load_lora_trigger_words_cache())


def _load_lora_trigger_words_cache() -> Dict[str, str]:
    try:
        from modules.lora_trigger_manager import trigger_manager

        trigger_manager.load_trigger_words()
        return dict(getattr(trigger_manager, "trigger_words", {}) or {})
    except Exception as exc:
        logger.debug("Model browser LoRA trigger word lookup failed: %s", exc)
        return {}


def _lora_user_trigger_entry_from_cache(lora_name: str, trigger_words: Dict[str, str]) -> Tuple[bool, str, List[str]]:
    key = str(lora_name or "").strip()
    if not key:
        return False, "", []
    candidates = [key]
    slash_variant = key.replace("\\", "/")
    backslash_variant = key.replace("/", "\\")
    for candidate in (slash_variant, backslash_variant):
        if candidate and candidate not in candidates:
            candidates.append(candidate)
    exists = False
    text = ""
    for candidate in candidates:
        if candidate in trigger_words:
            exists = True
            text = str(trigger_words.get(candidate) or "").strip()
            break
    return exists, text, [text] if text else []


def _synthetic_choice(name: Any) -> bool:
    text = str(name or "").strip().lower()
    return text in {"none", "default", "default (model)", str(getattr(flags, "default_clip", "")).lower(), str(getattr(flags, "default_vae", "")).lower()}


def _catalog_roots(catalogs: Iterable[str]) -> List[str]:
    roots: List[str] = []
    for catalog in catalogs or []:
        raw = []
        try:
            raw = list((getattr(config, "model_cata_map", {}) or {}).get(catalog) or [])
        except Exception:
            raw = []
        for path in raw:
            if not path:
                continue
            abs_path = os.path.abspath(path)
            if abs_path not in roots:
                roots.append(abs_path)
    return roots


def _choices_from_catalog_payload(model_type: str, payload: Dict[str, Any]) -> Optional[List[str]]:
    raw_choices = payload.get("choices")
    if isinstance(raw_choices, list) and raw_choices:
        return _unique(raw_choices)

    catalog_payload = payload.get("catalog")
    if isinstance(catalog_payload, dict):
        key = TYPE_CONFIG[model_type]["catalog_key"]
        raw = catalog_payload.get(key)
        if isinstance(raw, list):
            return _unique(raw)

    preset_node = payload.get("preset_node")
    if isinstance(preset_node, dict):
        try:
            import modules.canvas_workbench_models as canvas_workbench_models

            result = canvas_workbench_models.get_model_catalog_for_preset(payload)
            catalog = result.get("catalog") if isinstance(result, dict) else None
            if isinstance(catalog, dict):
                raw = catalog.get(TYPE_CONFIG[model_type]["catalog_key"])
                if isinstance(raw, list):
                    return _unique(raw)
        except Exception as exc:
            logger.debug("Model browser preset catalog lookup failed: %s", exc)

    return None


def _payload_has_key(payload: Dict[str, Any], *keys: str) -> bool:
    return any(key in payload for key in keys)


def _payload_bool(payload: Dict[str, Any], keys: Iterable[str], default: bool = False) -> bool:
    for key in keys:
        if key not in payload:
            continue
        value = payload.get(key)
        if isinstance(value, bool):
            return value
        text = str(value or "").strip().lower()
        if text in {"1", "true", "yes", "on"}:
            return True
        if text in {"0", "false", "no", "off"}:
            return False
    return default


def _dict_payload(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _engine_task_from_payload(payload: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    catalog = _dict_payload(payload.get("catalog"))
    state_params = _dict_payload(payload.get("state_params") or payload.get("state") or payload.get("topbar_state"))
    preset_node = _dict_payload(payload.get("preset_node"))
    runtime = _dict_payload(preset_node.get("runtime"))
    preset = _dict_payload(preset_node.get("preset"))

    engine = (
        payload.get("engine")
        or payload.get("backend_engine")
        or payload.get("__backend_engine")
        or payload.get("task_class_name")
        or catalog.get("engine")
        or catalog.get("backend_engine")
        or catalog.get("__backend_engine")
        or runtime.get("backend_engine")
        or preset.get("backend_engine")
        or state_params.get("backend_engine")
        or state_params.get("__backend_engine")
        or state_params.get("engine")
        or state_params.get("task_class_name")
        or state_params.get("engine_type")
        or "Z-image"
    )
    task_method = (
        payload.get("task_method")
        or payload.get("__scene_task_method")
        or catalog.get("task_method")
        or catalog.get("__scene_task_method")
        or runtime.get("task_method")
        or preset.get("task_method")
        or state_params.get("task_method")
        or state_params.get("__scene_task_method")
        or state_params.get("current_task_method")
        or None
    )
    if runtime.get("scene_frontend") and task_method and not str(task_method).startswith("scene_"):
        task_method = f"scene_{task_method}"
    return str(engine or "Z-image"), str(task_method) if task_method else None


def _choices_from_model_filter_payload(model_type: str, payload: Dict[str, Any]) -> Optional[List[str]]:
    if model_type == "style" or not _payload_has_key(payload, "use_model_filter", "model_filter", "modelFilter"):
        return None
    use_model_filter = _payload_bool(payload, ("use_model_filter", "model_filter", "modelFilter"), True)
    engine, task_method = _engine_task_from_payload(payload)
    try:
        model_filenames, lora_filenames, vae_filenames, clip_filenames = config.update_files(
            engine,
            task_method,
            use_model_filter=use_model_filter,
        )
    except Exception as exc:
        logger.debug("Model browser filtered catalog lookup failed: %s", exc)
        return None

    if model_type == "base":
        values = list(model_filenames or [])
    elif model_type == "refiner":
        values = ["None"] + list(model_filenames or [])
    elif model_type == "lora":
        values = ["None"] + list(lora_filenames or [])
    elif model_type == "clip":
        values = [getattr(flags, "default_clip", "Default (model)")] + list(clip_filenames or [])
    elif model_type == "vae":
        values = [getattr(flags, "default_vae", "Default (model)")] + list(vae_filenames or [])
    elif model_type == "upscale":
        values = ["default"] + list(getattr(config, "upscale_model_filenames", []) or [])
    else:
        values = []
    return _unique(values)


def _choices_from_config(model_type: str) -> List[str]:
    cfg = TYPE_CONFIG[model_type]
    if model_type == "clip":
        prepend = [getattr(flags, "default_clip", "Default (model)")]
    elif model_type == "vae":
        prepend = [getattr(flags, "default_vae", "Default (model)")]
    else:
        prepend = list(cfg.get("prepend") or [])

    attr = cfg.get("config_attr")
    if attr:
        values = list(getattr(config, attr, []) or [])
        if model_type == "clip":
            modelsinfo = getattr(config, "modelsinfo", None)
            if modelsinfo is not None:
                for catalog in cfg["catalogs"]:
                    try:
                        values.extend(modelsinfo.get_model_names(catalog))
                    except Exception:
                        pass
    else:
        values = []
        modelsinfo = getattr(config, "modelsinfo", None)
        if modelsinfo is not None:
            for catalog in cfg["catalogs"]:
                try:
                    values.extend(modelsinfo.get_model_names(catalog))
                except Exception:
                    pass
    return _unique(prepend + values)


def _model_choices(model_type: str, payload: Dict[str, Any]) -> List[str]:
    filtered_choices = _choices_from_model_filter_payload(model_type, payload)
    if filtered_choices is not None:
        return filtered_choices
    payload_choices = _choices_from_catalog_payload(model_type, payload)
    if payload_choices is not None:
        return payload_choices
    return _choices_from_config(model_type)


def _payload_force_catalog_refresh(payload: Dict[str, Any]) -> bool:
    return bool(
        payload.get("force_refresh")
        or payload.get("__force_refresh")
        or payload.get("refresh_catalog")
        or payload.get("refreshCatalog")
    )


def _payload_has_explicit_model_choices(payload: Dict[str, Any]) -> bool:
    return any(
        isinstance(payload.get(key), expected)
        for key, expected in (
            ("choices", list),
            ("catalog", dict),
            ("preset_node", dict),
        )
    )


def _model_choice_cache_key(model_type: str, payload: Dict[str, Any]) -> str:
    if _payload_has_explicit_model_choices(payload):
        return ""
    engine, task_method = _engine_task_from_payload(payload)
    use_model_filter = _payload_bool(payload, ("use_model_filter", "model_filter", "modelFilter"), True)
    return json.dumps(
        {
            "type": model_type,
            "engine": engine,
            "task_method": task_method or "",
            "use_model_filter": bool(use_model_filter),
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _model_choices_cached(model_type: str, payload: Dict[str, Any]) -> List[str]:
    key = _model_choice_cache_key(model_type, payload)
    if not key:
        return _model_choices(model_type, payload)
    now = time.time()
    force = _payload_force_catalog_refresh(payload)
    cached = MODEL_BROWSER_CATALOG_CACHE.get(key)
    if not force and isinstance(cached, dict) and now - float(cached.get("time") or 0) <= MODEL_BROWSER_CATALOG_CACHE_TTL:
        return list(cached.get("choices") or [])
    with MODEL_BROWSER_CATALOG_CACHE_LOCK:
        now = time.time()
        cached = MODEL_BROWSER_CATALOG_CACHE.get(key)
        if not force and isinstance(cached, dict) and now - float(cached.get("time") or 0) <= MODEL_BROWSER_CATALOG_CACHE_TTL:
            return list(cached.get("choices") or [])
        choices = _model_choices(model_type, payload)
        if len(MODEL_BROWSER_CATALOG_CACHE) > 64:
            MODEL_BROWSER_CATALOG_CACHE.clear()
        MODEL_BROWSER_CATALOG_CACHE[key] = {"time": now, "choices": list(choices or [])}
        return choices


def _resolve_models_info_key(data: Dict[str, Any], catalogs: Iterable[str], model_name: str) -> Tuple[str, Dict[str, Any]]:
    normalized = _normalize_model_name(model_name)
    if not normalized:
        return "", {}
    for catalog in catalogs:
        catalog = _normalize_model_name(catalog)
        candidates = [
            f"{catalog}/{normalized}",
            normalized if normalized.startswith(f"{catalog}/") else "",
        ]
        for key in candidates:
            if key and isinstance(data.get(key), dict):
                return key, data[key]

    suffix = f"/{normalized}"
    matches = [(key, value) for key, value in data.items() if isinstance(value, dict) and any(key.startswith(f"{catalog}/") for catalog in catalogs) and key.endswith(suffix)]
    if len(matches) == 1:
        return matches[0]

    basename = normalized.rsplit("/", 1)[-1].lower()
    matches = []
    for key, value in data.items():
        if not isinstance(value, dict):
            continue
        if not any(key.startswith(f"{catalog}/") for catalog in catalogs):
            continue
        if key.rsplit("/", 1)[-1].lower() == basename:
            matches.append((key, value))
    if len(matches) == 1:
        return matches[0]
    return "", {}


def _first_existing_file_from_entry(entry: Dict[str, Any]) -> str:
    files = entry.get("file")
    if isinstance(files, str):
        files = [files]
    for path in files or []:
        if not path:
            continue
        abs_path = os.path.abspath(path)
        if os.path.isfile(abs_path):
            return abs_path
    return ""


def _find_model_file_in_roots(model_name: str, catalogs: Iterable[str]) -> str:
    normalized = _normalize_model_name(model_name)
    if not normalized:
        return ""
    candidates = [normalized]
    basename = os.path.basename(normalized)
    if basename and basename != normalized:
        candidates.append(basename)
    for root in _catalog_roots(catalogs):
        for candidate in candidates:
            path = os.path.abspath(os.path.join(root, candidate))
            if os.path.isfile(path) and os.path.splitext(path)[1].lower() in MODEL_FILE_EXTENSIONS:
                return path
    return ""


def _resolve_model_path(model_name: str, catalogs: Iterable[str], data: Dict[str, Any]) -> Tuple[str, str, str, Dict[str, Any]]:
    normalized = _normalize_model_name(model_name)
    modelsinfo = getattr(config, "modelsinfo", None)
    for catalog in catalogs:
        if modelsinfo is None:
            continue
        try:
            path = modelsinfo.get_model_filepath(catalog, normalized)
        except Exception:
            path = ""
        if path:
            path = os.path.abspath(path)
            if os.path.isfile(path):
                key, entry = _resolve_models_info_key(data, (catalog,), normalized)
                return path, catalog, key, entry

    key, entry = _resolve_models_info_key(data, catalogs, normalized)
    path = _first_existing_file_from_entry(entry)
    if path:
        catalog = key.split("/", 1)[0] if "/" in key else next(iter(catalogs), "")
        return path, catalog, key, entry
    path = _find_model_file_in_roots(normalized, catalogs)
    if path:
        catalog = next(iter(catalogs), "")
        found_catalog = False
        for candidate_catalog in catalogs:
            for root in _catalog_roots((candidate_catalog,)):
                try:
                    if os.path.commonpath([root, path]) == root:
                        catalog = candidate_catalog
                        found_catalog = True
                        break
                except ValueError:
                    continue
            if found_catalog:
                break
        return path, catalog, key, entry
    return "", next(iter(catalogs), ""), key, entry


def _hash_from_entry(entry: Dict[str, Any]) -> str:
    for key in ("hash", "sha256", "SHA256"):
        value = str(entry.get(key) or "").strip()
        if value:
            return value.lower()
    return ""


def _arch_family_from_entry(entry: Dict[str, Any]) -> Tuple[str, str, Any]:
    if not isinstance(entry, dict):
        return "", "", None
    arch_family = str(entry.get("arch_family") or "").strip().lower()
    if arch_family == "unknown":
        arch_family = "unknown"
    source = str(entry.get("arch_family_source") or "").strip()
    return arch_family, source, entry.get("arch_family_algo")


def _architecture_manageable_item(item: Dict[str, Any]) -> bool:
    if not item or item.get("synthetic"):
        return False
    model_type = _normalize_type(item.get("type"))
    if model_type not in {"base", "refiner", "lora"}:
        return False
    return bool(item.get("path_exists") and item.get("path"))


def _models_info_key_for_item(item: Dict[str, Any]) -> str:
    key = str(item.get("models_info_key") or "").strip()
    if key:
        return key
    catalog = _normalize_model_name(item.get("catalog") or "")
    name = _normalize_model_name(item.get("name") or item.get("relative_path") or "")
    if catalog and name:
        return f"{catalog}/{name}"
    return ""


def _sync_models_info_entry(key: str, entry: Dict[str, Any]) -> None:
    if not key or not isinstance(entry, dict):
        return
    try:
        modelsinfo = getattr(config, "modelsinfo", None)
        m_info = getattr(modelsinfo, "m_info", None)
        if isinstance(m_info, dict):
            if isinstance(m_info.get(key), dict):
                m_info[key].update(entry)
            else:
                m_info[key] = dict(entry)
    except Exception:
        pass


def _invalidate_canvas_model_catalog_cache() -> None:
    try:
        from modules import canvas_workbench_models

        canvas_workbench_models.invalidate_model_catalog_cache()
    except Exception:
        pass


def _stamp_for_model_path(model_path: str) -> Dict[str, Any]:
    stamp: Dict[str, Any] = {}
    try:
        if model_path and os.path.isfile(model_path):
            stamp["size"] = int(os.path.getsize(model_path))
            stamp["mtime"] = float(os.path.getmtime(model_path))
    except Exception:
        pass
    return stamp


def _inspector_summary(result: Dict[str, Any]) -> Dict[str, Any]:
    summary: Dict[str, Any] = {}
    for key in ("file_type", "parse_mode", "weight_kind", "key_count", "lora_key_count", "components", "lora_targets", "error", "note"):
        value = result.get(key) if isinstance(result, dict) else None
        if value not in (None, "", [], {}):
            summary[key] = value
    return summary


def _persist_arch_family_for_item(item: Dict[str, Any], arch_family: str, source: str, inspector_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    if not _architecture_manageable_item(item):
        raise ValueError("this model type cannot store architecture classification")
    value = str(arch_family or "").strip().lower() or "unknown"
    if value not in ARCH_FAMILY_CHOICES:
        raise ValueError(f"unsupported architecture classification: {value}")

    key = _models_info_key_for_item(item)
    if not key:
        raise ValueError("models_info key is missing")
    model_path = str(item.get("path") or "").strip()
    data = _load_models_info()
    entry = data.get(key)
    if not isinstance(entry, dict):
        entry = {}
        data[key] = entry
    if model_path:
        entry.setdefault("file", [os.path.abspath(model_path)])
        try:
            entry["size"] = int(os.path.getsize(model_path))
            entry["modified"] = float(os.path.getmtime(model_path))
        except Exception:
            pass
    entry["arch_family"] = value
    entry["arch_family_algo"] = getattr(config, "ARCH_FAMILY_ALGO", 3)
    entry["arch_family_source"] = str(source or "manual").strip() or "manual"
    entry["arch_family_updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    stamp = _stamp_for_model_path(model_path)
    if stamp:
        entry["arch_family_stamp"] = stamp
    if isinstance(inspector_result, dict):
        entry["arch_family_inspect"] = _inspector_summary(inspector_result)
    _save_models_info(data)
    _sync_models_info_entry(key, entry)
    return entry


def _arch_family_from_base_model(value: Any) -> str:
    text = str(value or "").strip().lower().replace("_", "-")
    if not text:
        return "unknown"
    if "anima" in text:
        return "anima"
    if "z-image" in text or "zimage" in text:
        return "z_image"
    if "qwen" in text:
        return "qwen"
    if "hunyuan" in text:
        return "hunyuan"
    if "ltx" in text:
        return "ltx2"
    if re.search(r"(^|[^a-z0-9])wan(?:2(?:\.[0-9]+)?)?([^a-z0-9]|$)", text):
        return "wan"
    if "flux" in text:
        return "flux"
    if "stable diffusion 3" in text or "stable-diffusion-3" in text or re.search(r"(^|[^a-z0-9])sd3([^a-z0-9]|$)", text):
        return "sd3"
    if "stable diffusion 2" in text or "stable-diffusion-2" in text or re.search(r"(^|[^a-z0-9])sd2([^a-z0-9]|$)", text):
        return "sd2"
    if any(token in text for token in ("sdxl", "sd-xl", "stable diffusion xl", "stable-diffusion-xl", "sd 1.5", "sd1.5", "sd-1.5", "pony", "illustrious", "noobai")):
        return "sdxl"
    return "unknown"


def _inspect_and_persist_architecture(
    item: Dict[str, Any],
    remote_base_model: Any = "",
    preserve_existing: bool = True,
) -> Tuple[Dict[str, Any], str, str]:
    current = str(item.get("arch_family") or "").strip().lower()
    if preserve_existing and current and current != "unknown":
        return {}, current, str(item.get("arch_family_source") or "cached")
    import enhanced.weight_inspector as weight_inspector

    result = weight_inspector.inspect_weight_file(
        str(item.get("path") or ""),
        torch_ckpt_load=False,
        include_metadata=False,
        include_key_examples=False,
    )
    arch_family = str(result.get("arch_family") or "unknown").strip().lower() or "unknown"
    source = "weight_inspector"
    if arch_family not in ARCH_FAMILY_CHOICES:
        arch_family = "unknown"
    remote_family = _arch_family_from_base_model(remote_base_model)
    if arch_family == "unknown" and remote_family != "unknown":
        arch_family = remote_family
        source = "civitai"
    _persist_arch_family_for_item(item, arch_family, source, result)
    return result, arch_family, source


def _format_size(size: Any) -> str:
    try:
        value = float(size or 0)
    except Exception:
        value = 0
    if value <= 0:
        return ""
    units = ("B", "KB", "MB", "GB", "TB")
    index = 0
    while value >= 1024 and index < len(units) - 1:
        value /= 1024
        index += 1
    return f"{value:.1f} {units[index]}" if index else f"{int(value)} {units[index]}"


def _safe_metadata_stem(value: str) -> str:
    text = os.path.splitext(os.path.basename(str(value or "").strip()))[0]
    safe = "".join(ch if ch.isalnum() or ch in ("-", "_", ".") else "_" for ch in text).strip("._")
    return (safe or "model")[:96]


def _model_browser_metadata_dir() -> str:
    global _MODEL_BROWSER_METADATA_DIR_CACHE
    if _MODEL_BROWSER_METADATA_DIR_CACHE:
        return _MODEL_BROWSER_METADATA_DIR_CACHE
    path = os.path.join(_model_root(), ".model_browser", "metadata")
    os.makedirs(path, exist_ok=True)
    _MODEL_BROWSER_METADATA_DIR_CACHE = path
    return path


def _metadata_token(model_path: str) -> str:
    normalized = os.path.abspath(model_path).replace("\\", "/").lower()
    return hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _legacy_sidecar_path(model_path: str) -> str:
    root, _ = os.path.splitext(model_path)
    return f"{root}.model_browser.json"


def _sidecar_path(model_path: str) -> str:
    if not model_path:
        return ""
    return os.path.join(
        _model_browser_metadata_dir(),
        f"{_safe_metadata_stem(model_path)}.{_metadata_token(model_path)}.json",
    )


def _read_json_file(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _valid_hex_hash(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if re.fullmatch(r"[0-9a-f]{64}", text) else ""


def _civitai_sha256(payload: Dict[str, Any]) -> str:
    files = payload.get("files") if isinstance(payload.get("files"), list) else []
    for file_info in files:
        hashes = file_info.get("hashes") if isinstance(file_info, dict) else None
        if not isinstance(hashes, dict):
            continue
        sha256 = _valid_hex_hash(hashes.get("SHA256") or hashes.get("sha256"))
        if sha256:
            return sha256
    return ""


def _metadata_list(value: Any, limit: int = 64) -> List[str]:
    if not isinstance(value, list):
        return []
    items: List[str] = []
    for raw in value:
        if isinstance(raw, dict):
            raw = raw.get("name") or raw.get("label") or ""
        text = str(raw or "").strip()
        if text and text not in items:
            items.append(text)
        if len(items) >= limit:
            break
    return items


def _plain_text_description(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    text = re.sub(r"<(?:br|hr)\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(?:p|div|li|h[1-6])\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _normalize_external_sidecar(raw: Dict[str, Any], path: str = "") -> Dict[str, Any]:
    if not isinstance(raw, dict) or not raw:
        return {}
    model = raw.get("model") if isinstance(raw.get("model"), dict) else {}
    creator = model.get("creator") if isinstance(model.get("creator"), dict) else {}
    raw_creator = raw.get("creator")
    if isinstance(raw_creator, dict):
        raw_creator = raw_creator.get("username") or raw_creator.get("name") or ""
    model_id = model.get("id") or raw.get("modelId") or raw.get("model_id")
    version_id = raw.get("id") or raw.get("modelVersionId") or raw.get("model_version_id")
    model_name = model.get("name") or raw.get("modelName") or raw.get("model_name") or ""
    version_name = raw.get("name") or raw.get("version_name") or ""
    base_model = raw.get("baseModel") or raw.get("base_model") or ""
    description = raw.get("description") or model.get("description") or ""
    trained_words = raw.get("trainedWords")
    if not isinstance(trained_words, list):
        trained_words = raw.get("trained_words")
    tags = model.get("tags") if isinstance(model.get("tags"), list) else raw.get("tags")
    sha256 = (
        _civitai_sha256(raw)
        or _valid_hex_hash(raw.get("sha256"))
        or _valid_hex_hash(raw.get("hash"))
    )
    preview_remote_url = str(raw.get("preview_remote_url") or "").strip()
    if not preview_remote_url:
        preview_remote_url = _remote_preview_url(raw)
    civitai_url = str(raw.get("civitai_url") or "").strip()
    if not civitai_url and model_id:
        civitai_url = f"https://civitai.com/models/{model_id}"
        if version_id:
            civitai_url += f"?modelVersionId={version_id}"
    return {
        "source": str(raw.get("source") or "civitai-sidecar"),
        "metadata_origin": os.path.basename(path) if path else str(raw.get("metadata_origin") or "external sidecar"),
        "sha256": sha256,
        "hash": sha256,
        "model_id": model_id,
        "model_version_id": version_id,
        "model_name": str(model_name or "").strip(),
        "version_name": str(version_name or "").strip(),
        "type": str(model.get("type") or raw.get("type") or "").strip(),
        "base_model": str(base_model or "").strip(),
        "creator": str(creator.get("username") or model.get("creatorName") or raw_creator or "").strip(),
        "tags": _metadata_list(tags),
        "trained_words": _metadata_list(trained_words),
        "description": _plain_text_description(description),
        "preview_remote_url": preview_remote_url,
        "civitai_url": civitai_url,
    }


def _standard_sidecar_paths(model_path: str) -> List[str]:
    root, _ = os.path.splitext(model_path)
    return [f"{root}.civitai.info", f"{root}.info"]


def _load_standard_sidecar(model_path: str) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    for path in _standard_sidecar_paths(model_path):
        normalized = _normalize_external_sidecar(_read_json_file(path), path)
        if not normalized:
            continue
        if not merged:
            merged = normalized
            continue
        for key, value in normalized.items():
            if merged.get(key) in (None, "", [], {}):
                merged[key] = value
    return merged


def _read_safetensors_embedded_hashes(model_path: str) -> List[Dict[str, str]]:
    if os.path.splitext(model_path)[1].lower() != ".safetensors":
        return []
    try:
        file_size = os.path.getsize(model_path)
        with open(model_path, "rb") as f:
            header_size_raw = f.read(8)
            if len(header_size_raw) != 8:
                return []
            header_size = struct.unpack("<Q", header_size_raw)[0]
            if header_size <= 0 or header_size > min(SAFETENSORS_HEADER_MAX_BYTES, max(0, file_size - 8)):
                return []
            header = json.loads(f.read(header_size).decode("utf-8"))
    except Exception:
        return []
    metadata = header.get("__metadata__") if isinstance(header, dict) else None
    if not isinstance(metadata, dict):
        return []
    candidates: List[Dict[str, str]] = []
    seen = set()

    def append(value: Any, algorithm: str, key: str) -> None:
        digest = _valid_hex_hash(value)
        if digest and digest not in seen:
            seen.add(digest)
            candidates.append({"hash": digest, "algorithm": algorithm, "key": key})

    append(metadata.get("modelspec.hash.sha256"), "sha256", "modelspec.hash.sha256")
    append(metadata.get("modelspec.hash.blake3"), "blake3", "modelspec.hash.blake3")
    for key, value in metadata.items():
        key_text = str(key or "").lower()
        if "hash" not in key_text and "civitai" not in key_text:
            continue
        append(value, "sha256" if "sha256" in key_text else "unknown", str(key))
    return candidates


def _hash_stamp_for_model_path(model_path: str) -> Dict[str, int]:
    try:
        stat = os.stat(model_path)
        return {"size": int(stat.st_size), "mtime_ns": int(stat.st_mtime_ns)}
    except Exception:
        return {}


def _hash_stamp_is_current(metadata: Dict[str, Any], model_path: str) -> bool:
    stamp = metadata.get("hash_file_stamp") if isinstance(metadata, dict) else None
    if not isinstance(stamp, dict) or not stamp:
        return True
    return stamp == _hash_stamp_for_model_path(model_path)


def _load_sidecar(model_path: str) -> Dict[str, Any]:
    if not model_path:
        return {}
    sidecar = _read_json_file(_sidecar_path(model_path))
    if sidecar:
        external = _load_standard_sidecar(model_path)
        for key, value in external.items():
            if sidecar.get(key) in (None, "", [], {}):
                sidecar[key] = value
        return sidecar
    legacy_path = _legacy_sidecar_path(model_path)
    legacy = _read_json_file(legacy_path)
    if legacy:
        try:
            _save_sidecar(model_path, legacy)
            os.remove(legacy_path)
        except Exception as exc:
            logger.debug("Model browser sidecar migration failed: %s", exc)
        return legacy
    return _load_standard_sidecar(model_path)


def _save_sidecar(model_path: str, metadata: Dict[str, Any]) -> None:
    if not model_path:
        return
    path = _sidecar_path(model_path)
    if not path:
        return
    payload = dict(metadata or {})
    payload.setdefault("model_path", os.path.abspath(model_path))
    payload.setdefault("model_file", os.path.basename(model_path))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def _preview_candidates(model_path: str) -> List[str]:
    if not model_path:
        return []
    directory = os.path.dirname(model_path)
    stem = os.path.splitext(os.path.basename(model_path))[0]
    candidates = [os.path.join(directory, f"{stem}{suffix}") for suffix in PREVIEW_SUFFIXES]
    parent = os.path.dirname(directory)
    if parent and parent != directory:
        candidates.extend(os.path.join(parent, f"{stem}{suffix}") for suffix in PREVIEW_SUFFIXES)
    return [os.path.abspath(path) for path in candidates]


def _is_valid_preview_image(path: str) -> bool:
    if not path or not os.path.isfile(path):
        return False
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image.load()
            return bool(getattr(image, "width", 0) > 0 and getattr(image, "height", 0) > 0)
    except Exception:
        return False


def _preview_resample_filter():
    try:
        return Image.Resampling.LANCZOS
    except AttributeError:
        return Image.LANCZOS


def _prepare_preview_image(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGB")
    width = int(getattr(image, "width", 0) or 0)
    height = int(getattr(image, "height", 0) or 0)
    if width <= 0 or height <= 0:
        raise ValueError("preview image has invalid dimensions")
    if max(width, height) > PREVIEW_MAX_EDGE:
        resized = image.copy()
        resized.thumbnail((PREVIEW_MAX_EDGE, PREVIEW_MAX_EDGE), _preview_resample_filter())
        image = resized
    return image


def find_preview_path(model_path: str) -> str:
    for path in _preview_candidates(model_path):
        if os.path.isfile(path) and _is_valid_preview_image(path):
            return path
    return ""


def _allowed_preview_roots() -> List[str]:
    roots = [_model_root()]
    try:
        for paths in (getattr(config, "model_cata_map", {}) or {}).values():
            for path in paths or []:
                if path:
                    roots.append(os.path.abspath(path))
    except Exception:
        pass
    unique: List[str] = []
    for root in roots:
        root = os.path.abspath(root)
        if root not in unique:
            unique.append(root)
    return unique


def is_preview_path_allowed(path: str) -> bool:
    if not path:
        return False
    try:
        abs_path = os.path.abspath(path)
        if not os.path.isfile(abs_path):
            return False
        if os.path.splitext(abs_path)[1].lower() not in PREVIEW_EXTENSIONS:
            return False
        for root in _allowed_preview_roots():
            try:
                if os.path.commonpath([root, abs_path]) == root:
                    return True
            except ValueError:
                continue
    except Exception:
        return False
    return False


def is_model_path_allowed(path: str) -> bool:
    if not path:
        return False
    try:
        abs_path = os.path.abspath(path)
        if not os.path.isfile(abs_path):
            return False
        if os.path.splitext(abs_path)[1].lower() not in MODEL_FILE_EXTENSIONS:
            return False
        for root in _allowed_preview_roots():
            try:
                if os.path.commonpath([root, abs_path]) == root:
                    return True
            except ValueError:
                continue
    except Exception:
        return False
    return False


def preview_url(path: str) -> str:
    if not is_preview_path_allowed(path):
        return ""
    version = ""
    try:
        version = f"&v={int(os.path.getmtime(path))}"
    except Exception:
        version = ""
    return f"/model-browser/preview?path={urllib.parse.quote(os.path.abspath(path), safe='')}{version}"


def _folder_for_name(name: str) -> str:
    normalized = _normalize_model_name(name).strip("/")
    folder = os.path.dirname(normalized).replace("/", "\\").strip("\\")
    return folder or "Root"


def _basic_item_from_choice(model_type: str, name: str) -> Dict[str, Any]:
    cfg = TYPE_CONFIG[model_type]
    display_name = _display_path(name)
    synthetic = _synthetic_choice(name)
    return {
        "id": f"{model_type}:{_normalize_model_name(name)}",
        "type": model_type,
        "type_label": cfg["label"],
        "name": str(name or "").strip(),
        "display_name": display_name,
        "file_name": os.path.basename(display_name),
        "folder": _folder_for_name(display_name),
        "catalog": "",
        "relative_path": _normalize_model_name(name),
        "sha256": "",
        "hash_source": "synthetic" if synthetic else "missing",
        "hash_stale": False,
        "muid": "",
        "size": 0,
        "size_label": "",
        "modified": 0,
        "modified_label": "",
        "preview_url": "",
        "preview_source": "none",
        "metadata_status": "synthetic" if synthetic else "missing",
        "remote_status": "disabled" if synthetic or model_type in REMOTE_DISABLED_TYPES else "unknown",
        "tags": [],
        "trained_words": [],
        "metadata_trained_words": [],
        "user_trigger_words": [],
        "user_trigger_words_set": False,
        "trigger_words_text": "",
        "trigger_words_source": "none",
        "base_model": "",
        "remote_model_name": "",
        "remote_version_name": "",
        "creator": "",
        "description": "",
        "civitai_url": "",
        "metadata_origin": "",
        "download_count": 0,
        "rating": 0,
        "synthetic": synthetic,
        "path_exists": False,
        "remote_enabled": False if synthetic or model_type in REMOTE_DISABLED_TYPES else True,
        "arch_family": "",
        "arch_family_source": "",
        "arch_family_algo": None,
        "arch_family_choices": list(ARCH_FAMILY_CHOICES),
        "arch_family_manageable": False,
    }


def _item_from_choice(model_type: str, name: str, data: Dict[str, Any], lora_trigger_words: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    cfg = TYPE_CONFIG[model_type]
    item = _basic_item_from_choice(model_type, name)
    synthetic = bool(item.get("synthetic"))
    if synthetic:
        return item

    model_path, catalog, info_key, entry = _resolve_model_path(name, cfg["catalogs"], data)
    sidecar = _load_sidecar(model_path)
    metadata_words = _metadata_trained_words(sidecar)
    user_trigger_set = False
    user_trigger_text = ""
    user_trigger_words: List[str] = []
    effective_words = metadata_words
    trigger_words_text = ", ".join(metadata_words)
    trigger_words_source = "metadata" if metadata_words else "none"
    if model_type == "lora":
        if lora_trigger_words is None:
            user_trigger_set, user_trigger_text, user_trigger_words = _lora_user_trigger_entry(name)
        else:
            user_trigger_set, user_trigger_text, user_trigger_words = _lora_user_trigger_entry_from_cache(name, lora_trigger_words)
        if user_trigger_set:
            effective_words = user_trigger_words
            trigger_words_text = user_trigger_text
            trigger_words_source = "user"
    entry_hash_current = _hash_stamp_is_current(entry, model_path)
    sidecar_hash_current = _hash_stamp_is_current(sidecar, model_path)
    entry_hash = _valid_hex_hash(_hash_from_entry(entry)) if entry_hash_current else ""
    sidecar_hash = _valid_hex_hash(sidecar.get("sha256") or sidecar.get("hash")) if sidecar_hash_current else ""
    sha256 = sidecar_hash or entry_hash
    hash_source = (
        str(sidecar.get("hash_source") or "sidecar")
        if sidecar_hash
        else (str(entry.get("hash_source") or "models_info") if entry_hash else "missing")
    )
    arch_family, arch_family_source, arch_family_algo = _arch_family_from_entry(entry)
    preview_path = find_preview_path(model_path)
    try:
        size = os.path.getsize(model_path) if model_path and os.path.isfile(model_path) else entry.get("size", 0)
    except Exception:
        size = entry.get("size", 0)
    try:
        modified = os.path.getmtime(model_path) if model_path and os.path.isfile(model_path) else 0
    except Exception:
        modified = 0
    item.update({
        "id": f"{model_type}:{info_key or _normalize_model_name(name)}",
        "catalog": catalog,
        "models_info_key": info_key,
        "path": model_path,
        "path_exists": bool(model_path and os.path.isfile(model_path)),
        "sha256": sha256,
        "hash_source": hash_source,
        "hash_stale": bool((not sidecar_hash_current and _hash_from_entry(sidecar)) or (not entry_hash_current and _hash_from_entry(entry))),
        "muid": str(entry.get("muid") or "").strip() if isinstance(entry, dict) else "",
        "size": int(size or 0) if str(size or "").isdigit() else size or 0,
        "size_label": _format_size(size),
        "modified": modified,
        "modified_label": time.strftime("%Y-%m-%d %H:%M", time.localtime(modified)) if modified else "",
        "preview_url": preview_url(preview_path),
        "preview_source": "local" if preview_path else "none",
        "metadata_status": "remote" if sidecar.get("source") == "civitai" else ("local" if sidecar else "missing"),
        "remote_status": str(sidecar.get("remote_status") or ("found" if sidecar.get("source") == "civitai" else "unknown")),
        "tags": sidecar.get("tags") if isinstance(sidecar.get("tags"), list) else [],
        "trained_words": effective_words,
        "metadata_trained_words": metadata_words,
        "user_trigger_words": user_trigger_words,
        "user_trigger_words_set": user_trigger_set,
        "trigger_words_text": trigger_words_text,
        "trigger_words_source": trigger_words_source,
        "base_model": str(sidecar.get("base_model") or entry.get("base_model") or "").strip() if isinstance(entry, dict) else str(sidecar.get("base_model") or "").strip(),
        "remote_model_name": str(sidecar.get("model_name") or "").strip(),
        "remote_version_name": str(sidecar.get("version_name") or "").strip(),
        "creator": str(sidecar.get("creator") or "").strip(),
        "description": str(sidecar.get("description") or "").strip(),
        "civitai_url": str(sidecar.get("civitai_url") or "").strip(),
        "metadata_origin": str(sidecar.get("metadata_origin") or sidecar.get("source") or "").strip(),
        "download_count": sidecar.get("download_count") or 0,
        "rating": sidecar.get("rating") or 0,
        "arch_family": arch_family,
        "arch_family_source": arch_family_source,
        "arch_family_algo": arch_family_algo,
        "arch_family_manageable": False,
    })
    item["arch_family_manageable"] = _architecture_manageable_item(item)
    return item


def _filter_items(items: List[Dict[str, Any]], search: str, folder: str) -> List[Dict[str, Any]]:
    q = str(search or "").strip().lower()
    folder_value = str(folder or "All folders").strip() or "All folders"
    out = []
    for item in items:
        if folder_value != "All folders" and item.get("folder") != folder_value:
            continue
        haystack = " ".join([
            str(item.get("name") or ""),
            str(item.get("display_name") or ""),
            str(item.get("folder") or ""),
            str(item.get("base_model") or ""),
            str(item.get("creator") or ""),
            " ".join(str(tag) for tag in item.get("tags") or []),
            " ".join(str(word) for word in item.get("trained_words") or []),
        ]).lower()
        if q and q not in haystack:
            continue
        out.append(item)
    return out


def _sort_items(items: List[Dict[str, Any]], sort: str) -> List[Dict[str, Any]]:
    value = str(sort or "name").lower()
    reverse = value.endswith("_desc")
    key_name = value[:-5] if reverse else value
    if key_name == "modified":
        return sorted(items, key=lambda item: float(item.get("modified") or 0), reverse=reverse)
    if key_name == "size":
        return sorted(items, key=lambda item: float(item.get("size") or 0), reverse=reverse)
    if key_name == "folder":
        return sorted(items, key=lambda item: (str(item.get("folder") or "").lower(), str(item.get("display_name") or "").lower()), reverse=reverse)
    if key_name == "preview":
        return sorted(items, key=lambda item: (0 if item.get("preview_url") else 1, str(item.get("display_name") or "").lower()), reverse=reverse)
    return sorted(items, key=lambda item: str(item.get("display_name") or "").lower(), reverse=reverse)


def _sort_requires_full_items(sort: Any) -> bool:
    value = str(sort or "name").lower()
    key_name = value[:-5] if value.endswith("_desc") else value
    return key_name in {"modified", "size", "preview"}


def _enrich_model_browser_items(model_type: str, items: List[Dict[str, Any]], data: Dict[str, Any]) -> List[Dict[str, Any]]:
    if not items:
        return []
    trigger_words = _load_lora_trigger_words_cache() if model_type == "lora" else None
    return [
        _item_from_choice(model_type, item.get("name") or "", data, trigger_words)
        for item in items
    ]


def query_models(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    model_type = _normalize_type(payload.get("type") or payload.get("target_type"))
    data = _load_models_info()
    choices = _model_choices_cached(model_type, payload)
    basic_items = [_basic_item_from_choice(model_type, choice) for choice in choices]
    folders = ["All folders"] + sorted({item.get("folder") or "Root" for item in basic_items}, key=lambda item: (item != "Root", item.lower()))
    search = payload.get("search") or payload.get("q") or ""
    folder = payload.get("folder") or "All folders"
    sort = payload.get("sort") or "name"
    try:
        page = max(1, int(payload.get("page") or 1))
    except Exception:
        page = 1
    try:
        page_size = int(payload.get("page_size") or 36)
    except Exception:
        page_size = 36
    page_size = max(1, min(page_size, 500))
    start = (page - 1) * page_size
    force_full_index = bool(payload.get("full_index") or payload.get("include_metadata_index") or payload.get("search_metadata"))
    full_index = force_full_index or _sort_requires_full_items(sort)

    if full_index:
        indexed_items = _enrich_model_browser_items(model_type, basic_items, data)
        filtered = _filter_items(indexed_items, search, folder)
        filtered = _sort_items(filtered, sort)
        total = len(filtered)
        page_items = filtered[start:start + page_size]
    else:
        filtered_basic = _filter_items(basic_items, search, folder)
        if search and not filtered_basic:
            indexed_items = _enrich_model_browser_items(model_type, basic_items, data)
            filtered = _filter_items(indexed_items, search, folder)
            filtered = _sort_items(filtered, sort)
            total = len(filtered)
            page_items = filtered[start:start + page_size]
        else:
            filtered = _sort_items(filtered_basic, sort)
            total = len(filtered)
            page_items = _enrich_model_browser_items(model_type, filtered[start:start + page_size], data)
    return {
        "ok": True,
        "type": model_type,
        "type_label": TYPE_CONFIG[model_type]["label"],
        "use_model_filter": _payload_bool(payload, ("use_model_filter", "model_filter", "modelFilter"), True),
        "items": page_items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": start + page_size < total,
        "folders": folders,
        "types": [{"value": key, "label": value["label"]} for key, value in TYPE_CONFIG.items()],
        "missing_preview_count": sum(1 for item in page_items if not item.get("preview_url") and not item.get("synthetic")),
        "metadata_missing_count": sum(1 for item in page_items if item.get("metadata_status") == "missing" and item.get("remote_enabled")),
    }


def _resolve_single_item(payload: Dict[str, Any]) -> Dict[str, Any]:
    model_type = _normalize_type(payload.get("type") or payload.get("target_type"))
    name = str(payload.get("name") or payload.get("model") or "").strip()
    if not name:
        item_id = str(payload.get("id") or "").strip()
        if ":" in item_id:
            name = item_id.split(":", 1)[1]
    if not name:
        return {}
    data = _load_models_info()
    return _item_from_choice(model_type, name, data)


def detail_model(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    return {"ok": True, "item": item}


def update_trigger_words(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if item.get("type") != "lora":
        return {"ok": False, "error": "trigger words are only managed for LoRA models", "item": item}
    if item.get("synthetic"):
        return {"ok": False, "error": "synthetic model choices cannot have trigger words", "item": item}

    if "trigger_words" in payload:
        text = _trigger_word_text(payload.get("trigger_words"))
    elif "trigger_words_text" in payload:
        text = _trigger_word_text(payload.get("trigger_words_text"))
    else:
        text = _trigger_word_text(payload.get("trigger_word"))
    if len(text) > 4096:
        return {"ok": False, "error": "trigger words are too long", "item": item}

    try:
        from modules.lora_trigger_manager import set_lora_trigger_word

        saved = set_lora_trigger_word(item["name"], text)
    except Exception as exc:
        return {"ok": False, "error": f"trigger word save failed: {type(exc).__name__}: {exc}", "item": item}
    if not saved:
        return {"ok": False, "error": "trigger word save failed", "item": item}

    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    return {
        "ok": True,
        "item": refreshed,
        "trigger_words": refreshed.get("trained_words") or [],
        "trigger_words_text": refreshed.get("trigger_words_text") or "",
        "trigger_words_source": refreshed.get("trigger_words_source") or "user",
        "message": "trigger words saved",
    }


def inspect_arch_family(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if not _architecture_manageable_item(item):
        return {"ok": False, "error": "this model type cannot be classified", "item": item}

    model_path = str(item.get("path") or "").strip()
    if not is_model_path_allowed(model_path):
        return {"ok": False, "error": "model file is missing or outside model directories", "item": item}
    try:
        result, arch_family, source = _inspect_and_persist_architecture(item, preserve_existing=False)
    except Exception as exc:
        return {"ok": False, "error": f"architecture inspection failed: {type(exc).__name__}: {exc}", "item": item}

    _invalidate_canvas_model_catalog_cache()
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    return {
        "ok": True,
        "item": refreshed,
        "arch_family": refreshed.get("arch_family") or arch_family,
        "arch_family_source": refreshed.get("arch_family_source") or source,
        "inspect": _inspector_summary(result),
        "message": "architecture classification updated",
    }


def update_arch_family(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    value = str(payload.get("arch_family") or payload.get("architecture") or "").strip().lower()
    if not value:
        value = "unknown"
    try:
        _persist_arch_family_for_item(item, value, "manual")
    except Exception as exc:
        return {"ok": False, "error": f"architecture classification save failed: {type(exc).__name__}: {exc}", "item": item}
    _invalidate_canvas_model_catalog_cache()
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    return {
        "ok": True,
        "item": refreshed,
        "arch_family": refreshed.get("arch_family") or value,
        "arch_family_source": refreshed.get("arch_family_source") or "manual",
        "message": "architecture classification saved",
    }


def _compute_sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024 * 8), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _persist_hash_for_item(item: Dict[str, Any], sha256: str, source: str = "computed") -> None:
    model_path = str(item.get("path") or "").strip()
    stamp = _hash_stamp_for_model_path(model_path)
    if model_path:
        sidecar = _load_sidecar(model_path)
        sidecar.update({
            "sha256": sha256,
            "hash": sha256,
            "hash_source": source,
            "hash_computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "hash_file_stamp": stamp,
        })
        _save_sidecar(model_path, sidecar)

    key = str(item.get("models_info_key") or "").strip()
    if not key:
        return
    data = _load_models_info()
    entry = data.get(key)
    if isinstance(entry, dict):
        entry["hash"] = sha256
        entry["sha256"] = sha256
        entry["hash_source"] = source
        entry["hash_file_stamp"] = stamp
        try:
            if model_path and os.path.isfile(model_path):
                entry["size"] = os.path.getsize(model_path)
                entry["modified"] = os.path.getmtime(model_path)
        except Exception:
            pass
        _save_models_info(data)
        try:
            modelsinfo = getattr(config, "modelsinfo", None)
            m_info = getattr(modelsinfo, "m_info", None)
            if isinstance(m_info, dict) and isinstance(m_info.get(key), dict):
                m_info[key].update(entry)
        except Exception:
            pass


def _ensure_item_sha256(item: Dict[str, Any], force: bool = False) -> Tuple[str, Dict[str, Any], str]:
    sha256 = str(item.get("sha256") or "").strip().lower()
    if sha256 and not force:
        return sha256, item, str(item.get("hash_source") or "cached")
    model_path = str(item.get("path") or "").strip()
    if not is_model_path_allowed(model_path):
        raise FileNotFoundError("model file is missing or outside model directories")
    sha256 = _compute_sha256_file(model_path)
    _persist_hash_for_item(item, sha256, "computed")
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    return sha256, refreshed, "computed"


def compute_hash(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if item.get("synthetic"):
        return {"ok": False, "error": "synthetic model choices do not have files", "item": item}
    try:
        sha256, refreshed, source = _ensure_item_sha256(item, bool(payload.get("force")))
    except Exception as exc:
        return {"ok": False, "error": f"hash calculation failed: {type(exc).__name__}: {exc}", "item": item}
    return {"ok": True, "sha256": sha256, "hash_source": source, "item": refreshed}


def _decode_upload_image(payload: Dict[str, Any]) -> Image.Image:
    data_url = str(payload.get("image_data") or payload.get("data_url") or "").strip()
    if not data_url:
        raise ValueError("image data is missing")

    if "," in data_url and data_url.lower().startswith("data:"):
        header, data_url = data_url.split(",", 1)
        if "image/" not in header.lower():
            raise ValueError("uploaded preview must be an image")

    try:
        raw = base64.b64decode(data_url, validate=True)
    except binascii.Error as exc:
        raise ValueError(f"invalid image data: {exc}") from exc

    if not raw:
        raise ValueError("image data is empty")
    if len(raw) > 80 * 1024 * 1024:
        raise ValueError("image is too large")

    image = Image.open(io.BytesIO(raw))
    image.load()
    image = ImageOps.exif_transpose(image)
    if getattr(image, "width", 0) <= 0 or getattr(image, "height", 0) <= 0:
        raise ValueError("uploaded preview is not a valid image")
    return image


def set_preview(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if item.get("synthetic"):
        return {"ok": False, "error": "synthetic model choices cannot have previews", "item": item}

    model_path = str(item.get("path") or "").strip()
    if not is_model_path_allowed(model_path):
        return {"ok": False, "error": "model file is missing or outside model directories", "item": item}

    try:
        image = _decode_upload_image(payload)
    except Exception as exc:
        return {"ok": False, "error": f"preview image is invalid: {type(exc).__name__}: {exc}", "item": item}

    base, _ = os.path.splitext(model_path)
    webp_path = f"{base}.preview.webp"
    try:
        os.makedirs(os.path.dirname(webp_path), exist_ok=True)
        image = _prepare_preview_image(image)
        tmp_path = f"{webp_path}.tmp"
        image.save(tmp_path, "WEBP", quality=88, method=6)
        os.replace(tmp_path, webp_path)
        if not _is_valid_preview_image(webp_path):
            raise ValueError("saved preview was not readable")
    except Exception as exc:
        try:
            if os.path.exists(f"{webp_path}.tmp"):
                os.remove(f"{webp_path}.tmp")
        except Exception:
            pass
        return {"ok": False, "error": f"preview save failed: {type(exc).__name__}: {exc}", "item": item}

    sidecar = _load_sidecar(model_path)
    sidecar.update({
        "preview_path": webp_path,
        "preview_source": "manual_upload",
        "preview_original_name": str(payload.get("image_name") or payload.get("file_name") or "").strip(),
        "preview_max_edge": PREVIEW_MAX_EDGE,
        "preview_updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    try:
        _save_sidecar(model_path, sidecar)
    except Exception as exc:
        logger.debug("Model browser preview sidecar save failed: %s", exc)

    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    return {
        "ok": True,
        "item": refreshed,
        "preview_path": webp_path,
        "preview_url": refreshed.get("preview_url") or preview_url(webp_path),
        "message": "preview saved",
    }


def _civitai_headers() -> Dict[str, str]:
    headers = {"User-Agent": "SimpAI-Studio-ModelBrowser/3.0", "Accept": "application/json"}
    api_key = str(
        os.environ.get("CIVITAI_API_KEY")
        or os.environ.get("CIVITAI_TOKEN")
        or getattr(config, "civitai_api_key", "")
        or ""
    ).strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _fetch_civitai_json(url: str, timeout: int = 30) -> Dict[str, Any]:
    request = urllib.request.Request(url, headers=_civitai_headers())
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
    data = json.loads(payload.decode("utf-8", errors="replace"))
    return data if isinstance(data, dict) else {}


def _fetch_civitai_model_version(file_hash: str) -> Dict[str, Any]:
    url = f"https://civitai.com/api/v1/model-versions/by-hash/{urllib.parse.quote(file_hash, safe='')}"
    return _fetch_civitai_json(url)


def _fetch_civitai_model(model_id: Any) -> Dict[str, Any]:
    if model_id in (None, ""):
        return {}
    url = f"https://civitai.com/api/v1/models/{urllib.parse.quote(str(model_id), safe='')}"
    return _fetch_civitai_json(url)


def _merge_civitai_model_detail(version: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(version or {})
    version_model = merged.get("model") if isinstance(merged.get("model"), dict) else {}
    model_id = version_model.get("id") or merged.get("modelId")
    if not model_id:
        return merged
    try:
        detail = _fetch_civitai_model(model_id)
    except Exception as exc:
        logger.debug("Civitai model detail request failed for %s: %s", model_id, exc)
        return merged
    if detail:
        combined_model = dict(version_model)
        for key, value in detail.items():
            if value not in (None, "", [], {}):
                combined_model[key] = value
        merged["model"] = combined_model
    return merged


def _remote_preview_url(metadata: Dict[str, Any]) -> str:
    images = metadata.get("images")
    if not isinstance(images, list):
        return ""
    sorted_images = sorted(
        [item for item in images if isinstance(item, dict) and item.get("url")],
        key=lambda item: (str(item.get("type") or "").lower() not in {"image", ""}, int(item.get("nsfwLevel") or 0)),
    )
    for item in sorted_images:
        url = str(item.get("url") or "").strip()
        if url:
            return url
    return ""


def _metadata_payload(remote: Dict[str, Any], sha256: str, preview_remote_url: str) -> Dict[str, Any]:
    model = remote.get("model") if isinstance(remote.get("model"), dict) else {}
    creator = model.get("creator") if isinstance(model.get("creator"), dict) else {}
    tags = model.get("tags") if isinstance(model.get("tags"), list) else []
    trained_words = remote.get("trainedWords") if isinstance(remote.get("trainedWords"), list) else []
    model_id = model.get("id") or remote.get("modelId")
    version_id = remote.get("id")
    civitai_url = f"https://civitai.com/models/{model_id}" if model_id else ""
    if civitai_url and version_id:
        civitai_url += f"?modelVersionId={version_id}"
    version_stats = remote.get("stats") if isinstance(remote.get("stats"), dict) else {}
    model_stats = model.get("stats") if isinstance(model.get("stats"), dict) else {}
    return {
        "source": "civitai",
        "metadata_origin": "Civitai API",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "sha256": sha256,
        "hash": sha256,
        "model_id": model_id,
        "model_version_id": version_id,
        "model_name": model.get("name") or remote.get("modelName") or "",
        "version_name": remote.get("name") or "",
        "type": model.get("type") or "",
        "base_model": remote.get("baseModel") or "",
        "creator": creator.get("username") or model.get("creatorName") or "",
        "tags": [str(tag) for tag in tags[:64]],
        "trained_words": [str(word) for word in trained_words[:64]],
        "description": _plain_text_description(model.get("description") or remote.get("description")),
        "preview_remote_url": preview_remote_url,
        "civitai_url": civitai_url,
        "published_at": remote.get("publishedAt") or model.get("publishedAt") or "",
        "download_count": version_stats.get("downloadCount") or model_stats.get("downloadCount") or 0,
        "rating": version_stats.get("rating") or model_stats.get("rating") or 0,
    }


def _content_extension(content_type: str, url: str) -> str:
    guessed = mimetypes.guess_extension((content_type or "").split(";", 1)[0].strip()) or ""
    ext = guessed.lower()
    if ext in PREVIEW_EXTENSIONS:
        return ".jpg" if ext == ".jpe" else ext
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    return ext if ext in PREVIEW_EXTENSIONS else ".jpg"


def _video_extension(content_type: str, url: str) -> str:
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    if ext in VIDEO_PREVIEW_EXTENSIONS:
        return ext
    guessed = mimetypes.guess_extension((content_type or "").split(";", 1)[0].strip()) or ""
    guessed = guessed.lower()
    return guessed if guessed in VIDEO_PREVIEW_EXTENSIONS else ".mp4"


def _is_video_response(content_type: str, url: str) -> bool:
    media_type = (content_type or "").split(";", 1)[0].strip().lower()
    if media_type.startswith("video/"):
        return True
    return os.path.splitext(urllib.parse.urlparse(url).path)[1].lower() in VIDEO_PREVIEW_EXTENSIONS


def _save_video_frame_webp(raw: bytes, content_type: str, url: str, webp_path: str) -> Tuple[str, str]:
    suffix = _video_extension(content_type, url)
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name

        import cv2  # type: ignore

        capture = cv2.VideoCapture(tmp_path)
        if not capture.isOpened():
            capture.release()
            return "", "video preview could not be opened"

        frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps = float(capture.get(cv2.CAP_PROP_FPS) or 0)
        candidates = []
        if frame_count > 0:
            candidates.extend([max(0, int(frame_count * 0.08)), max(0, int(frame_count * 0.2)), 0])
        if fps > 0:
            candidates.extend([max(0, int(fps)), max(0, int(fps * 0.5))])
        candidates.extend([0, 1, 5, 10])

        frame = None
        seen = set()
        for index in candidates:
            if index in seen:
                continue
            seen.add(index)
            if index > 0:
                capture.set(cv2.CAP_PROP_POS_FRAMES, index)
            ok, data = capture.read()
            if ok and data is not None:
                frame = data
                break
        capture.release()

        if frame is None:
            return "", "video preview did not contain a readable frame"

        image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if getattr(image, "width", 0) <= 0 or getattr(image, "height", 0) <= 0:
            return "", "video frame is not a valid image"
        image = _prepare_preview_image(image)
        image.save(webp_path, "WEBP", quality=86, method=6)
        if not _is_valid_preview_image(webp_path):
            try:
                os.remove(webp_path)
            except Exception:
                pass
            return "", "video frame webp was not readable"
        return webp_path, "saved webp from video frame"
    except Exception as exc:
        return "", f"video frame extraction failed: {type(exc).__name__}: {exc}"
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def _download_preview_to_model(model_path: str, image_url: str, force: bool = False) -> Tuple[str, str]:
    if not model_path or not image_url:
        return "", "no preview url"
    base, _ = os.path.splitext(model_path)
    webp_path = f"{base}.webp"
    if os.path.isfile(webp_path) and _is_valid_preview_image(webp_path) and not force:
        return webp_path, "kept existing webp"

    headers = _civitai_headers()
    headers["Accept"] = "image/avif,image/webp,image/*,video/*,*/*"
    request = urllib.request.Request(image_url, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        content_type = response.headers.get("Content-Type", "")
        raw = response.read()

    if _is_video_response(content_type, image_url):
        return _save_video_frame_webp(raw, content_type, image_url, webp_path)

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
        if getattr(image, "width", 0) <= 0 or getattr(image, "height", 0) <= 0:
            return "", "downloaded preview is not a valid image"
    except Exception as exc:
        return "", f"downloaded preview is not a valid image: {type(exc).__name__}"

    try:
        image = _prepare_preview_image(image)
        image.save(webp_path, "WEBP", quality=86, method=6)
        return webp_path, "saved webp"
    except Exception as exc:
        ext = _content_extension(content_type, image_url)
        fallback_path = f"{base}{ext}"
        if os.path.isfile(fallback_path) and _is_valid_preview_image(fallback_path) and not force:
            return fallback_path, f"kept existing {ext}"
        fallback_image = _prepare_preview_image(image)
        fallback_format = "PNG" if ext == ".png" else "JPEG"
        if fallback_format == "JPEG" and fallback_image.mode == "RGBA":
            fallback_image = fallback_image.convert("RGB")
        fallback_image.save(fallback_path, fallback_format, quality=88, optimize=True)
        if not _is_valid_preview_image(fallback_path):
            try:
                os.remove(fallback_path)
            except Exception:
                pass
            return "", f"preview fallback was not readable: {type(exc).__name__}"
        return fallback_path, f"webp conversion failed; saved original: {type(exc).__name__}"


def _try_civitai_hash_candidates(candidates: Iterable[Dict[str, str]]) -> Tuple[Dict[str, Any], Dict[str, str], List[Dict[str, str]]]:
    attempted: List[Dict[str, str]] = []
    seen = set()
    for raw in candidates:
        file_hash = _valid_hex_hash(raw.get("hash"))
        if not file_hash or file_hash in seen:
            continue
        seen.add(file_hash)
        candidate = dict(raw, hash=file_hash)
        attempted.append(candidate)
        try:
            remote = _fetch_civitai_model_version(file_hash)
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                continue
            raise
        if remote:
            return remote, candidate, attempted
    return {}, {}, attempted


def _local_metadata_fallback(
    item: Dict[str, Any],
    sha256: str,
    hash_source: str,
    attempted: List[Dict[str, str]],
) -> Dict[str, Any]:
    model_path = str(item.get("path") or "").strip()
    architecture_warning = ""
    if _architecture_manageable_item(item):
        try:
            _inspect_and_persist_architecture(item, preserve_existing=True)
        except Exception as exc:
            architecture_warning = f"architecture inspection failed: {type(exc).__name__}: {exc}"
    metadata = _load_sidecar(model_path)
    metadata.update({
        "source": metadata.get("source") or "local-inspection",
        "metadata_origin": metadata.get("metadata_origin") or "Local model header",
        "remote_status": "not_found",
        "remote_checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    if sha256:
        metadata["sha256"] = sha256
        metadata["hash"] = sha256
        metadata["hash_source"] = hash_source
        metadata["hash_file_stamp"] = _hash_stamp_for_model_path(model_path)
    _save_sidecar(model_path, metadata)
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    preview_ok = bool(refreshed.get("preview_url"))
    return {
        "ok": True,
        "remote_found": False,
        "item": refreshed,
        "metadata": metadata,
        "metadata_ok": True,
        "preview_ok": preview_ok,
        "preview_status": "ready" if preview_ok else "missing",
        "preview_message": "Civitai has no matching model; local hash and architecture were saved",
        "architecture_warning": architecture_warning,
        "hash_attempts": attempted,
    }


def fetch_metadata(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if not item.get("remote_enabled"):
        return {"ok": False, "error": "remote metadata is disabled for this model type", "item": item}
    model_path = str(item.get("path") or "").strip()
    if not is_model_path_allowed(model_path):
        return {"ok": False, "error": "model file is missing", "item": item}

    compute_hash_allowed = bool(payload.get("compute_hash", True))
    force_hash = bool(payload.get("force_hash"))
    sha256 = _valid_hex_hash(item.get("sha256"))
    hash_source = str(item.get("hash_source") or "")
    remote: Dict[str, Any] = {}
    matched_candidate: Dict[str, str] = {}
    attempted: List[Dict[str, str]] = []

    try:
        if force_hash:
            if not compute_hash_allowed:
                return {"ok": False, "error": "force_hash requires hash calculation", "item": item}
            sha256, item, hash_source = _ensure_item_sha256(item, True)
            remote, matched_candidate, attempted = _try_civitai_hash_candidates([
                {"hash": sha256, "algorithm": "sha256", "source": "computed"}
            ])
        else:
            candidates: List[Dict[str, str]] = []
            if sha256:
                candidates.append({"hash": sha256, "algorithm": "sha256", "source": hash_source or "cached"})
            else:
                candidates.extend(
                    dict(candidate, source="safetensors-header")
                    for candidate in _read_safetensors_embedded_hashes(model_path)
                )
            remote, matched_candidate, attempted = _try_civitai_hash_candidates(candidates)
            if not remote and not sha256 and compute_hash_allowed:
                sha256, item, hash_source = _ensure_item_sha256(item, True)
                remote, matched_candidate, full_attempts = _try_civitai_hash_candidates([
                    {"hash": sha256, "algorithm": "sha256", "source": "computed"}
                ])
                attempted.extend(full_attempts)
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"Civitai HTTP {exc.code}", "item": item, "hash_attempts": attempted}
    except Exception as exc:
        return {"ok": False, "error": f"model information request failed: {type(exc).__name__}: {exc}", "item": item, "hash_attempts": attempted}

    if not remote:
        return _local_metadata_fallback(item, sha256, hash_source, attempted)

    remote = _merge_civitai_model_detail(remote)
    canonical_sha256 = _civitai_sha256(remote)
    if not canonical_sha256 and matched_candidate.get("algorithm") == "sha256":
        canonical_sha256 = _valid_hex_hash(matched_candidate.get("hash"))
    if canonical_sha256:
        sha256 = canonical_sha256
        hash_source = "civitai-header-match" if matched_candidate.get("source") == "safetensors-header" else (hash_source or matched_candidate.get("source") or "civitai")
        _persist_hash_for_item(item, sha256, hash_source)

    architecture_warning = ""
    if _architecture_manageable_item(item):
        try:
            _inspect_and_persist_architecture(item, remote.get("baseModel"), preserve_existing=True)
        except Exception as exc:
            architecture_warning = f"architecture inspection failed: {type(exc).__name__}: {exc}"

    preview_remote = _remote_preview_url(remote)
    preview_message = ""
    preview_path = find_preview_path(model_path)
    if preview_remote and (payload.get("force") or not preview_path):
        try:
            preview_path, preview_message = _download_preview_to_model(model_path, preview_remote, bool(payload.get("force")))
        except Exception as exc:
            preview_message = f"preview download failed: {type(exc).__name__}: {exc}"
    elif not preview_remote:
        preview_message = "remote metadata has no preview image or video"
    elif preview_path:
        preview_message = "kept existing preview"

    metadata = _metadata_payload(remote, sha256, preview_remote)
    metadata["hash_source"] = hash_source
    metadata["hash_file_stamp"] = _hash_stamp_for_model_path(model_path)
    metadata["remote_status"] = "found"
    metadata["hash_lookup"] = matched_candidate
    if preview_path:
        metadata["preview_path"] = preview_path
    _save_sidecar(model_path, metadata)
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    preview_ok = bool(refreshed.get("preview_url"))
    return {
        "ok": True,
        "remote_found": True,
        "item": refreshed,
        "metadata": metadata,
        "metadata_ok": True,
        "preview_ok": preview_ok,
        "preview_status": "ready" if preview_ok else "missing",
        "preview_message": preview_message,
        "architecture_warning": architecture_warning,
        "hash_attempts": attempted,
        "hash_lookup": matched_candidate,
    }


def fetch_batch(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    raw_items = payload.get("items") if isinstance(payload.get("items"), list) else []
    targets: List[Dict[str, Any]] = []
    if raw_items:
        for item in raw_items:
            if isinstance(item, dict):
                targets.append({
                    "type": item.get("type") or payload.get("type"),
                    "name": item.get("name") or item.get("model") or "",
                    "force": payload.get("force", False),
                    "compute_hash": payload.get("compute_hash", True),
                    "force_hash": payload.get("force_hash", False),
                })
    else:
        query_payload = dict(payload)
        query_payload["page"] = 1
        query_payload["page_size"] = min(int(payload.get("limit") or 100), 500)
        result = query_models(query_payload)
        for item in result.get("items") or []:
            if payload.get("missing_only") and not _needs_remote_metadata(item):
                continue
            targets.append({
                "type": item.get("type"),
                "name": item.get("name"),
                "force": payload.get("force", False),
                "compute_hash": payload.get("compute_hash", True),
                "force_hash": payload.get("force_hash", False),
            })

    counts = {"success": 0, "failed": 0, "skipped": 0}
    results = []
    for target in targets:
        item = _resolve_single_item(target)
        if not item or item.get("synthetic") or not item.get("remote_enabled"):
            counts["skipped"] += 1
            results.append({"ok": False, "skipped": True, "error": "not fetchable", "item": item or target})
            continue
        if payload.get("missing_only") and not _needs_remote_metadata(item) and not payload.get("force"):
            counts["skipped"] += 1
            results.append({"ok": True, "skipped": True, "item": item})
            continue
        fetched = fetch_metadata(target)
        if fetched.get("ok"):
            counts["success"] += 1
        else:
            counts["failed"] += 1
        results.append(fetched)

    return {
        "ok": True,
        "total": len(targets),
        **counts,
        "results": results,
    }


def _needs_remote_metadata(item: Dict[str, Any]) -> bool:
    if not item or not item.get("remote_enabled") or item.get("synthetic"):
        return False
    if item.get("remote_status") == "not_found" and item.get("metadata_status") != "missing":
        return False
    return not item.get("preview_url") or item.get("metadata_status") == "missing"


def _associated_local_metadata_paths(model_path: str) -> List[str]:
    if not model_path:
        return []
    base, _ = os.path.splitext(model_path)
    paths = [_sidecar_path(model_path), _legacy_sidecar_path(model_path), *_standard_sidecar_paths(model_path)]
    paths.extend(f"{base}{suffix}" for suffix in PREVIEW_SUFFIXES)
    return list(dict.fromkeys(os.path.abspath(path) for path in paths if path))


def _remove_from_runtime_catalog(item: Dict[str, Any]) -> None:
    model_type = _normalize_type(item.get("type"))
    name_keys = {
        _normalize_model_name(item.get("name")).lower(),
        _normalize_model_name(item.get("display_name")).lower(),
        _normalize_model_name(item.get("relative_path")).lower(),
        os.path.basename(str(item.get("path") or "")).lower(),
    }
    cfg = TYPE_CONFIG.get(model_type) or {}
    attr = cfg.get("config_attr")
    if attr and isinstance(getattr(config, attr, None), list):
        current = list(getattr(config, attr) or [])
        filtered = []
        for value in current:
            text = str(value or "")
            normalized = _normalize_model_name(text).lower()
            basename = os.path.basename(normalized)
            if normalized in name_keys or basename in name_keys:
                continue
            filtered.append(value)
        setattr(config, attr, filtered)

    info_key = str(item.get("models_info_key") or "").strip()
    if info_key:
        try:
            modelsinfo = getattr(config, "modelsinfo", None)
            m_info = getattr(modelsinfo, "m_info", None)
            if isinstance(m_info, dict):
                m_info.pop(info_key, None)
        except Exception:
            pass


def delete_model(payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    item = _resolve_single_item(payload)
    if not item:
        return {"ok": False, "error": "model not found"}
    if item.get("synthetic"):
        return {"ok": False, "error": "synthetic model choices cannot be deleted", "item": item}

    model_path = str(item.get("path") or "").strip()
    if not is_model_path_allowed(model_path):
        return {"ok": False, "error": "model file is missing or outside model directories", "item": item}

    expected_name = os.path.basename(model_path)
    confirm_name = str(payload.get("confirm_name") or "").strip()
    if confirm_name != expected_name:
        return {"ok": False, "error": "delete confirmation did not match the model file name", "expected_name": expected_name, "item": item}

    delete_previews = bool(payload.get("delete_previews", True))
    paths = [os.path.abspath(model_path)]
    if delete_previews:
        paths.extend(_associated_local_metadata_paths(model_path))

    deleted = []
    failed = []
    seen = set()
    allowed_sidecars = {
        os.path.abspath(path)
        for path in (_sidecar_path(model_path), _legacy_sidecar_path(model_path))
        if path
    }
    for path in paths:
        if path in seen or not os.path.exists(path):
            continue
        seen.add(path)
        try:
            if path == os.path.abspath(model_path) and not is_model_path_allowed(path):
                failed.append({"path": path, "error": "path is not an allowed model file"})
                continue
            if path != os.path.abspath(model_path) and not (path in allowed_sidecars or is_preview_path_allowed(path)):
                failed.append({"path": path, "error": "path is not an allowed metadata file"})
                continue
            os.remove(path)
            deleted.append(path)
        except Exception as exc:
            failed.append({"path": path, "error": f"{type(exc).__name__}: {exc}"})

    info_key = str(item.get("models_info_key") or "").strip()
    if info_key:
        data = _load_models_info()
        if info_key in data:
            data.pop(info_key, None)
            try:
                _save_models_info(data)
            except Exception as exc:
                failed.append({"path": _models_info_path(), "error": f"models_info update failed: {type(exc).__name__}: {exc}"})

    _remove_from_runtime_catalog(item)
    refreshed = _item_from_choice(item["type"], item["name"], _load_models_info())
    model_abs = os.path.abspath(model_path)
    preview_deleted = [path for path in deleted if path != model_abs and is_preview_path_allowed(path)]
    metadata_deleted = [path for path in deleted if path != model_abs and path in allowed_sidecars]
    related_deleted = [path for path in deleted if path != model_abs]
    return {
        "ok": not any(entry.get("path") == os.path.abspath(model_path) for entry in failed),
        "item": refreshed,
        "deleted": deleted,
        "delete_summary": {
            "model_deleted": model_abs in deleted,
            "model_name": expected_name,
            "model_count": 1 if model_abs in deleted else 0,
            "preview_count": len(preview_deleted),
            "metadata_count": len(metadata_deleted),
            "related_count": len(related_deleted),
            "file_count": len(deleted),
        },
        "failed": failed,
    }
