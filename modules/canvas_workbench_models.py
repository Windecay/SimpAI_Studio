import copy
import os
import time

import shared
import modules.config as config
import modules.model_loader as model_loader
from enhanced import parameter_profiles
from modules.access_mode import is_local_mode, user_can_download_models


MODEL_CATALOG_CACHE = {}
DEFAULT_MODEL_VALUES = {
    "": True,
    "none": True,
    "default": True,
    "default (model)": True,
    "current": True,
    "automatic": True,
    "auto": True,
}

SELECTED_MODEL_CATALOGS = {
    "base_model": ("checkpoints", "diffusion_models"),
    "refiner_model": ("checkpoints", "diffusion_models"),
    "clip_model": ("clip", "text_encoders"),
    "vae": ("vae",),
    "upscale_model": ("upscale_models",),
    "lora": ("loras",),
}


def invalidate_model_catalog_cache():
    MODEL_CATALOG_CACHE.clear()


def _normalize_list(values):
    result = []
    for item in values or []:
        text = str(item or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def _preset_lora_names(preset_node):
    defaults = {}
    try:
        defaults = (preset_node.get("models_config") or {}).get("defaults") or {}
    except Exception:
        defaults = {}
    names = []
    for item in defaults.get("loras") or []:
        if not isinstance(item, dict):
            continue
        model = item.get("model")
        if model and model != "None":
            names.append(model)
    return names


def _model_config_from_node(preset_node):
    config_data = preset_node.get("models_config") if isinstance(preset_node.get("models_config"), dict) else {}
    return {
        "mode": config_data.get("mode", "preset_default"),
        "defaults": copy.deepcopy(config_data.get("defaults") or {}),
        "overrides": copy.deepcopy(config_data.get("overrides") or {}),
        "source_node_id": config_data.get("source_node_id"),
    }


def _model_config_is_external(config_data):
    if not isinstance(config_data, dict):
        return False
    mode = str(config_data.get("mode") or "preset_default").strip()
    if mode and mode != "preset_default":
        return True
    if config_data.get("source_node_id"):
        return True
    overrides = config_data.get("overrides")
    return isinstance(overrides, dict) and bool(overrides)


def _merged_model_config_values(config_data):
    defaults = config_data.get("defaults") if isinstance(config_data.get("defaults"), dict) else {}
    overrides = config_data.get("overrides") if isinstance(config_data.get("overrides"), dict) else {}
    merged = copy.deepcopy(defaults)
    merged.update(copy.deepcopy(overrides))
    return merged


def _model_value(value):
    text = str(value or "").strip().replace("\\", "/").lstrip("/")
    return text


def _is_default_model_value(value):
    return DEFAULT_MODEL_VALUES.get(_model_value(value).lower(), False)


def _enabled_lora_models(model_values):
    raw = model_values.get("loras") if isinstance(model_values, dict) else []
    if not isinstance(raw, list):
        return []
    names = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        if item.get("enabled") is False:
            continue
        model = _model_value(item.get("model") or "")
        if model and not _is_default_model_value(model):
            names.append(model)
    return names


def _selected_model_requirements(preset_node):
    config_data = _model_config_from_node(preset_node)
    if not _model_config_is_external(config_data):
        return []
    values = _merged_model_config_values(config_data)
    requirements = []
    for key, label in (
        ("base_model", "Base Model"),
        ("refiner_model", "Refiner"),
        ("clip_model", "CLIP"),
        ("vae", "VAE"),
        ("upscale_model", "Upscale Model"),
    ):
        name = _model_value(values.get(key) or "")
        if not name or _is_default_model_value(name):
            continue
        catalogs = SELECTED_MODEL_CATALOGS[key]
        requirements.append({
            "role": label,
            "cata": catalogs[0],
            "catalogs": catalogs,
            "path_file": name,
        })
    for name in _enabled_lora_models(values):
        requirements.append({
            "role": "LoRA",
            "cata": "loras",
            "catalogs": SELECTED_MODEL_CATALOGS["lora"],
            "path_file": name,
        })
    return requirements


def _modelsinfo_handle():
    return getattr(shared, "modelsinfo", None) or getattr(config, "modelsinfo", None)


def _existing_model_path(name, catalogs):
    text = _model_value(name)
    if not text:
        return ""
    candidates = []
    for item in (text, text.replace("/", os.sep), os.path.basename(text)):
        item = str(item or "").strip().lstrip("/\\")
        if item and item not in candidates:
            candidates.append(item)
    modelsinfo = _modelsinfo_handle()
    if modelsinfo is not None:
        for catalog in catalogs or []:
            for candidate in candidates:
                try:
                    path = modelsinfo.get_model_filepath(catalog, candidate)
                except Exception:
                    path = ""
                if path and os.path.exists(path):
                    return os.path.abspath(path)
    model_cata_map = getattr(config, "model_cata_map", {}) or {}
    for catalog in catalogs or []:
        roots = model_cata_map.get(catalog, [])
        if isinstance(roots, str):
            roots = [roots]
        for root in roots or []:
            for candidate in candidates:
                path = os.path.abspath(os.path.join(str(root), candidate))
                if os.path.exists(path):
                    return path
    return ""


def _selected_model_config_status(preset_node):
    requirements = _selected_model_requirements(preset_node)
    if not requirements:
        return None
    missing_rows = []
    present_rows = []
    for item in requirements:
        path_file = item.get("path_file") or ""
        cata = item.get("cata") or ""
        path = _existing_model_path(path_file, item.get("catalogs") or (cata,))
        row = {
            "source": "models_config",
            "role": item.get("role") or "",
            "cata": cata,
            "path_file": path_file,
            "human_size": "",
            "url": "",
            "size": 0,
            "status_key": _download_status_key(cata, path_file),
            "download_status": copy.deepcopy(model_loader.get_download_status(_download_status_key(cata, path_file)) or {}),
        }
        if path:
            row["file_path"] = path
            present_rows.append(row)
        else:
            missing_rows.append(row)
    return {
        "ready": not missing_rows,
        "missing_rows": missing_rows,
        "present_rows": present_rows,
        "checked_count": len(requirements),
    }


def get_model_catalog_for_preset(payload):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    preset_node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    runtime = preset_node.get("runtime") if isinstance(preset_node.get("runtime"), dict) else {}
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    use_model_filter = bool(payload.get("use_model_filter", True))
    engine = runtime.get("backend_engine") or preset.get("backend_engine") or "Z-image"
    task_method = runtime.get("task_method") or preset.get("task_method") or None
    if runtime.get("scene_frontend") and task_method and not str(task_method).startswith("scene_"):
        task_method = f"scene_{task_method}"
    signature = (str(engine), str(task_method or ""), use_model_filter)
    force_refresh = bool(payload.get("force_refresh") or payload.get("__force_refresh"))

    if not force_refresh and signature in MODEL_CATALOG_CACHE:
        catalog = copy.deepcopy(MODEL_CATALOG_CACHE[signature])
    else:
        model_filenames, lora_filenames, vae_filenames, clip_filenames = config.update_files(
            engine,
            task_method,
            use_model_filter=use_model_filter,
        )
        catalog = {
            "engine": engine,
            "backend_engine": engine,
            "task_method": task_method,
            "use_model_filter": use_model_filter,
            "model_filenames": _normalize_list(model_filenames),
            "refiner_filenames": ["None"] + _normalize_list(model_filenames),
            "lora_filenames": ["None"] + _normalize_list(lora_filenames),
            "vae_filenames": ["Default (model)"] + _normalize_list(vae_filenames),
            "clip_filenames": ["Default (model)"] + _normalize_list(clip_filenames),
            "upscale_model_filenames": ["default"] + _normalize_list(getattr(config, "upscale_model_filenames", []) or []),
        }
        MODEL_CATALOG_CACHE[signature] = copy.deepcopy(catalog)

    for name in _preset_lora_names(preset_node):
        if name not in catalog["lora_filenames"]:
            catalog["lora_filenames"].append(name)

    return {"ok": True, "catalog": catalog}


def _clean_preset_name(value):
    text = str(value or "").strip().replace("\u2B07", "").strip()
    return text


def _user_did_from_payload(payload):
    context = payload.get("user_context") if isinstance(payload.get("user_context"), dict) else {}
    for key in ("user_did", "owner"):
        value = str(context.get(key) or "").strip()
        if value and value not in ("guest", "multi", "local"):
            return value
    value = str(context.get("user_did") or context.get("owner") or "").strip()
    if value and value != "multi":
        return value
    return "local" if is_local_mode() else ""


def _preset_node_from_payload(payload):
    node = payload.get("preset_node") if isinstance(payload.get("preset_node"), dict) else {}
    return node


def _preset_name_from_node(preset_node):
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    return _clean_preset_name(preset.get("name") or preset.get("display_name") or preset_node.get("title") or "")


def _raw_model_list_from_node(preset_node):
    requirements = preset_node.get("model_requirements") if isinstance(preset_node.get("model_requirements"), dict) else {}
    raw = requirements.get("model_list")
    if raw is None:
        raw = preset_node.get("model_list")
    if raw is None:
        raw = preset_node.get("model_list_raw")
    return raw if isinstance(raw, list) else []


def _previous_default_info_from_node(preset_node):
    requirements = preset_node.get("model_requirements") if isinstance(preset_node.get("model_requirements"), dict) else {}
    preset = preset_node.get("preset") if isinstance(preset_node.get("preset"), dict) else {}
    default_model = (
        requirements.get("default_model")
        or preset_node.get("default_model")
        or preset.get("default_model")
        or ""
    )
    previous_default_models = (
        requirements.get("previous_default_models")
        or preset_node.get("previous_default_models")
        or preset.get("previous_default_models")
        or []
    )
    default_refiner = (
        requirements.get("default_refiner")
        or preset_node.get("default_refiner")
        or preset.get("default_refiner")
        or ""
    )
    previous_default_refiners = (
        requirements.get("previous_default_refiners")
        or preset_node.get("previous_default_refiners")
        or preset.get("previous_default_refiners")
        or []
    )
    return {
        "default_model": default_model,
        "previous_default_models": previous_default_models if isinstance(previous_default_models, list) else [],
        "default_refiner": default_refiner,
        "previous_default_refiners": previous_default_refiners if isinstance(previous_default_refiners, list) else [],
    }


def _has_model_probe(preset_node, preset_name, raw_model_list, user_did):
    requirements = preset_node.get("model_requirements") if isinstance(preset_node.get("model_requirements"), dict) else {}
    if raw_model_list:
        return True
    if requirements.get("has_model_probe"):
        return True
    try:
        get_cached = getattr(model_loader, "_get_cached_preset_model_list", None)
        if callable(get_cached):
            _, cached_list, _ = get_cached(preset_name, user_did)
            return cached_list is not None
    except Exception:
        pass
    return False


def _missing_models_for_preset(preset_name, raw_model_list, user_did, previous_default_info=None):
    if raw_model_list:
        return preset_name, model_loader.get_missing_model_list_from_entries(
            preset_name,
            raw_model_list,
            user_did=user_did,
            previous_default_info=previous_default_info,
        )

    missing = model_loader.get_missing_model_list(preset_name, user_did=user_did)
    if missing:
        return preset_name, missing

    if preset_name and (not preset_name.endswith("_fp4")) and (not preset_name.endswith("_int4")):
        for variant_name in (f"{preset_name}_fp4", f"{preset_name}_int4"):
            variant_missing = model_loader.get_missing_model_list(variant_name, user_did=user_did)
            if variant_missing:
                return variant_name, variant_missing

    return preset_name, []


def _download_status_key(cata, path_file):
    return (str(cata) + "/" + str(path_file)).replace("\\", "/").strip("/")


def _missing_model_dicts(missing_models):
    rows = []
    for item in missing_models or []:
        try:
            cata, path_file, human_size, url, size = item
        except Exception:
            continue
        status_key = _download_status_key(cata, path_file)
        rows.append({
            "cata": str(cata or ""),
            "path_file": str(path_file or ""),
            "human_size": str(human_size or ""),
            "url": str(url or ""),
            "size": int(size or 0) if str(size or "").isdigit() else size,
            "status_key": status_key,
            "download_status": copy.deepcopy(model_loader.get_download_status(status_key) or {}),
        })
    return rows


def get_preset_model_status(payload):
    if not isinstance(payload, dict):
        return {"ok": False, "error": "payload is not an object"}
    user_did = _user_did_from_payload(payload)
    applied = parameter_profiles.apply_profile_to_canvas_node(
        payload.get("preset_node"),
        {"user_did": user_did},
    )
    if not applied.get("ok"):
        return applied
    payload = copy.deepcopy(payload)
    payload["preset_node"] = applied.get("preset_node")
    preset_node = _preset_node_from_payload(payload)
    preset_name = _preset_name_from_node(preset_node)
    if not preset_name:
        return {"ok": False, "error": "preset name is empty"}

    can_download = user_can_download_models(user_did) and not bool(getattr(shared.args, "disable_backend", False))
    selected_status = _selected_model_config_status(preset_node)
    if selected_status is not None:
        missing_rows = selected_status["missing_rows"]
        ready = selected_status["ready"]
        state = "ready" if ready else "missing"
        can_download_selected = False if missing_rows else can_download
        message = (
            "Selected Models Config files are available."
            if ready
            else f"{len(missing_rows)} selected Models Config file(s) are missing."
        )
        return {
            "ok": True,
            "preset": preset_name,
            "checked_preset": preset_name,
            "state": state,
            "ready": ready,
            "has_requirements": True,
            "model_config_gate": True,
            "selected_model_count": selected_status["checked_count"],
            "selected_models": selected_status["present_rows"],
            "missing_count": len(missing_rows),
            "missing_models": missing_rows,
            "can_download": bool(can_download_selected),
            "download_disabled": not bool(can_download_selected),
            "backend_disabled": bool(getattr(shared.args, "disable_backend", False)),
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "message": message,
        }

    raw_model_list = _raw_model_list_from_node(preset_node)
    checked_preset, missing_models = _missing_models_for_preset(
        preset_name,
        raw_model_list,
        user_did,
        previous_default_info=_previous_default_info_from_node(preset_node),
    )
    missing_rows = _missing_model_dicts(missing_models)
    has_requirements = _has_model_probe(preset_node, checked_preset, raw_model_list, user_did)
    ready = len(missing_rows) == 0
    state = "ready" if ready else "missing"
    message = "All required model files are available." if ready else f"{len(missing_rows)} required model file(s) are missing."
    if ready and not has_requirements:
        message = "No missing models found for this preset."
    return {
        "ok": True,
        "preset": preset_name,
        "checked_preset": checked_preset,
        "state": state,
        "ready": ready,
        "has_requirements": bool(has_requirements),
        "missing_count": len(missing_rows),
        "missing_models": missing_rows,
        "can_download": bool(can_download),
        "download_disabled": not bool(can_download),
        "backend_disabled": bool(getattr(shared.args, "disable_backend", False)),
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "message": message,
    }


def queue_preset_model_downloads(payload):
    status = get_preset_model_status(payload)
    if not status.get("ok"):
        return status
    if status.get("ready"):
        return dict(status, queued_count=0, message="All required model files are already available.")
    if not status.get("can_download"):
        return dict(status, ok=False, error="model download is not allowed for the current user or backend mode")

    user_did = _user_did_from_payload(payload)
    single = payload.get("missing_model") if isinstance(payload.get("missing_model"), dict) else None
    if single:
        task_id = model_loader.download_model_entry(
            single.get("cata"),
            single.get("path_file"),
            size=single.get("size") or 0,
            url=single.get("url") or "",
            user_did=user_did,
            async_task=True,
        )
        queued = [task_id] if task_id else []
        return dict(status, ok=True, state="queued", queued_count=len(queued), queued=queued, message=f"Queued {len(queued)} model download task(s).")

    queued = []
    for item in status.get("missing_models") or []:
        task_id = model_loader.download_model_entry(
            item.get("cata"),
            item.get("path_file"),
            size=item.get("size") or 0,
            url=item.get("url") or "",
            user_did=user_did,
            async_task=True,
        )
        if task_id:
            queued.append(task_id)

    return dict(status, ok=True, state="queued", queued_count=len(queued), queued=queued, message=f"Queued {len(queued)} model download task(s).")
