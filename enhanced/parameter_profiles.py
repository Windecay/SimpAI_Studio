from __future__ import annotations

import copy
import json
import logging
import os
import re
from datetime import datetime
from typing import Any

import gradio as gr

import modules.config as config
import modules.flags as flags
import modules.meta_parser as meta_parser
import modules.regen_manifest as regen_manifest
import shared
from enhanced.logger import format_name
from ui.update_helpers import dropdown_update, gr_update, skip_update

logger = logging.getLogger(format_name(__name__))

PROFILE_SCHEMA = "simpleai.parameter_profile.v1"
PROFILE_FOLDER = "generation_params"
_INVALID_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]+')
_MISSING_MODEL_MARKER = "\u2B07"
_PROFILE_WARNING_LIMIT = 6

_SCENE_PROFILE_CONTROL_KEYS = (
    "scene_theme",
    "scene_additional_prompt",
    "scene_additional_prompt_2",
    "scene_video_duration",
    "scene_var_number",
    "scene_var_number2",
    "scene_var_number3",
    "scene_var_number4",
    "scene_var_number5",
    "scene_var_number6",
    "scene_var_number7",
    "scene_var_number8",
    "scene_var_number9",
    "scene_var_number10",
    "scene_switch_option1",
    "scene_switch_option2",
    "scene_switch_option3",
    "scene_switch_option4",
    "scene_aspect_ratio",
    "scene_image_number",
)

_CANVAS_PROFILE_PARAM_KEYS = (
    "negative_prompt",
    "seed_random",
    "inpaint_advanced_masking_checkbox",
    "mixing_image_prompt_and_vary_upscale",
    "mixing_image_prompt_and_inpaint",
    "backfill_prompt",
    "translation_methods",
    "enhance_checkbox",
    "enhance_enabled_1",
    "enhance_enabled_2",
    "enhance_enabled_3",
    "enhance_uov_method",
    "enhance_uov_strength",
    *_SCENE_PROFILE_CONTROL_KEYS,
)

_CANVAS_PROFILE_GENERATION_KEYS = {
    "guidance_scale": "guidance_scale",
    "sharpness": "sharpness",
    "sampler": "sampler_name",
    "scheduler": "scheduler_name",
    "performance": "performance_selection",
    "output_format": "output_format",
    "refiner_switch": "refiner_switch",
    "adaptive_cfg": "adaptive_cfg",
    "steps": "overwrite_step",
    "overwrite_switch": "overwrite_switch",
}


def _clean_name(value: Any) -> str:
    return str(value or "").replace(_MISSING_MODEL_MARKER, "").strip()


def _safe_filename(value: Any, fallback: str = "profile") -> str:
    text = _clean_name(value)
    text = _INVALID_FILENAME_CHARS.sub("_", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    if not text:
        text = fallback
    return text[:96].strip(" .") or fallback


def _get_user_did(source: Any = None) -> str:
    if isinstance(source, dict):
        for key in ("user_did", "__user_did"):
            value = _clean_name(source.get(key))
            if value:
                return value
        user = source.get("user")
        if user is not None and hasattr(user, "get_did"):
            try:
                value = _clean_name(user.get_did())
                if value:
                    return value
            except Exception:
                pass
    token = getattr(shared, "token", None)
    if token is not None:
        for method_name in ("get_default_workspace_did", "get_guest_did"):
            method = getattr(token, method_name, None)
            if callable(method):
                try:
                    value = _clean_name(method())
                    if value:
                        return value
                except Exception:
                    pass
    return "local"


def _get_preset_name(source: Any = None) -> str:
    if isinstance(source, dict):
        value = _clean_name(source.get("__preset") or source.get("preset"))
        if value:
            return value
    return _clean_name(getattr(config, "preset", None)) or "default"


def _profiles_root(user_did: str) -> str:
    token = getattr(shared, "token", None)
    if token is not None and hasattr(token, "get_path_in_user_dir"):
        try:
            root = token.get_path_in_user_dir(user_did, PROFILE_FOLDER)
        except Exception:
            root = None
    else:
        root = None
    if not root:
        userhome = getattr(shared, "path_userhome", None) or getattr(config, "path_userhome", None) or "users"
        root = os.path.join(userhome, user_did, PROFILE_FOLDER)
    root = os.path.abspath(root)
    os.makedirs(root, exist_ok=True)
    return root


def _preset_profiles_dir(user_did: str, preset_name: str) -> str:
    path = os.path.join(_profiles_root(user_did), _safe_filename(preset_name, "preset"))
    os.makedirs(path, exist_ok=True)
    return path


def _profile_path(user_did: str, preset_name: str, name: str) -> str:
    return os.path.join(_preset_profiles_dir(user_did, preset_name), f"{_safe_filename(name)}.json")


def _load_json(path: str) -> dict[str, Any] | None:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _profile_entries(user_did: str, preset_name: str) -> list[dict[str, Any]]:
    folder = _preset_profiles_dir(user_did, preset_name)
    entries: list[dict[str, Any]] = []
    if not os.path.isdir(folder):
        return entries
    for filename in sorted(os.listdir(folder)):
        if not filename.lower().endswith(".json"):
            continue
        path = os.path.join(folder, filename)
        payload = _load_json(path)
        if not payload or not isinstance(payload.get("metadata"), dict):
            continue
        name = _clean_name(payload.get("name")) or os.path.splitext(filename)[0]
        entries.append({
            "name": name,
            "path": path,
            "schema": _clean_name(payload.get("schema")),
            "updated_at": _clean_name(payload.get("updated_at") or payload.get("created_at")),
        })
    entries.sort(key=lambda item: item["name"].casefold())
    return entries


def refresh_dropdown(context: Any = None, current_value: Any = None):
    user_did = _get_user_did(context)
    preset_name = _get_preset_name(context)
    choices = [entry["name"] for entry in _profile_entries(user_did, preset_name)]
    selected = _clean_name(current_value)
    return dropdown_update(choices=choices, value=selected if selected in choices else None, allow_custom_value=True)


def _state_preset_json(state_params: dict[str, Any], user_did: str, preset_name: str) -> dict[str, Any]:
    try:
        preset_json = config.try_get_preset_content(preset_name, user_did)
        if isinstance(preset_json, dict):
            return copy.deepcopy(preset_json)
    except Exception:
        pass
    return {}


def _state_preset_prepared(state_params: dict[str, Any], preset_json: dict[str, Any]) -> dict[str, Any]:
    state_prepared = state_params.get("__preset_prepared") if isinstance(state_params, dict) else None
    if isinstance(preset_json, dict) and preset_json:
        try:
            preset_prepared = meta_parser.parse_meta_from_preset(copy.deepcopy(preset_json))
            preset_engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
            if isinstance(preset_engine.get("scene_frontend"), dict) or not state_prepared:
                return preset_prepared
        except Exception:
            logger.exception("Failed to prepare preset metadata for parameter profile.")
    if isinstance(state_prepared, dict) and state_prepared:
        return copy.deepcopy(state_prepared)
    return {}


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _as_number(value: Any, default: Any = None):
    try:
        if isinstance(default, int) and not isinstance(default, bool):
            return int(float(value))
        return float(value)
    except Exception:
        return default


def _as_int(value: Any, default: int) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return default


def _resolution_value(values: dict[str, Any]) -> Any:
    width = _as_number(values.get("overwrite_width"), -1)
    height = _as_number(values.get("overwrite_height"), -1)
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        return (width, height)
    selection = values.get("aspect_ratios_selection")
    return selection if selection not in (None, "") else None


def _normalized_model_name(value: Any) -> str:
    return _clean_name(value).replace("\\", os.sep).replace("/", os.sep).lstrip(os.sep)


def _model_match(value: Any, candidates: list[Any], passthrough: set[str] | None = None) -> str | None:
    normalized = _normalized_model_name(value)
    if not normalized:
        return None
    passthrough = passthrough or set()
    if normalized in passthrough:
        return normalized

    by_exact: dict[str, str] = {}
    by_stem: dict[str, str] = {}
    for candidate in candidates or []:
        candidate_name = _normalized_model_name(candidate)
        if not candidate_name:
            continue
        by_exact[candidate_name.casefold()] = candidate_name
        by_stem[os.path.splitext(os.path.basename(candidate_name))[0].casefold()] = candidate_name

    exact = by_exact.get(normalized.casefold())
    if exact:
        return exact
    return by_stem.get(os.path.splitext(os.path.basename(normalized))[0].casefold())


def _default_clip_value() -> str:
    return getattr(flags, "default_clip", "Default (model)")


def _default_vae_value() -> str:
    return getattr(flags, "default_vae", "Default (model)")


def _model_value(values: dict[str, Any], key: str, fallback_key: str | None = None):
    model_state = values.get("model_params_state")
    if isinstance(model_state, dict) and model_state.get("__model_params_state") and key in model_state:
        return model_state.get(key)
    if fallback_key and fallback_key in values:
        return values.get(fallback_key)
    return values.get(key)


def _split_lora_entry(value: Any) -> tuple[bool, str, float]:
    enabled = True
    model = "None"
    weight = 1.0
    try:
        parts = [part.strip() for part in str(value or "").split(" : ")]
        if len(parts) >= 3:
            enabled = parts[0].lower() == "true"
            model = parts[1] or "None"
            weight = float(parts[2])
        elif len(parts) >= 2:
            model = parts[0] or "None"
            weight = float(parts[1])
            enabled = model.lower() != "none"
        elif len(parts) == 1 and parts[0]:
            model = parts[0]
            enabled = model.lower() != "none"
    except Exception:
        pass
    return bool(enabled), model, weight


def _lora_entry(enabled: bool, model: str, weight: float) -> str:
    try:
        weight = float(weight)
    except Exception:
        weight = 1.0
    return f"{bool(enabled)} : {model or 'None'} : {weight}"


def _lora_entries(values: dict[str, Any]) -> list[str]:
    model_state = values.get("model_params_state")
    state_loras = model_state.get("loras") if isinstance(model_state, dict) and model_state.get("__model_params_state") else None
    entries: list[str] = []
    for index in range(config.default_max_lora_number):
        enabled = values.get(f"lora_{index + 1}_enabled", True)
        name = values.get(f"lora_{index + 1}_model", "None")
        weight = values.get(f"lora_{index + 1}_weight", 1)
        if isinstance(state_loras, (list, tuple)) and index < len(state_loras):
            raw = state_loras[index]
            if isinstance(raw, dict):
                name = raw.get("model", raw.get("name", raw.get("filename", name)))
                weight = raw.get("weight", raw.get("strength", weight))
            elif isinstance(raw, (list, tuple)):
                if len(raw) >= 3:
                    enabled, name, weight = raw[0], raw[1], raw[2]
                elif len(raw) >= 2:
                    name, weight = raw[0], raw[1]
                elif len(raw) == 1:
                    name = raw[0]
        entries.append(f"{bool(enabled)} : {name or 'None'} : {_as_number(weight, 1.0)}")
    return entries


def _scene_hidden_controls(preset_prepared: dict[str, Any]) -> set[str]:
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    scene_frontend = engine.get("scene_frontend", {}) if isinstance(engine, dict) else {}
    if not isinstance(scene_frontend, dict):
        return set()
    try:
        return set(meta_parser.scene_disvisible_with_optional_inputs(scene_frontend))
    except Exception:
        raw_hidden = scene_frontend.get("disvisible", [])
        if isinstance(raw_hidden, list):
            return {str(item) for item in raw_hidden}
        if isinstance(raw_hidden, str):
            return {item.strip() for item in raw_hidden.split(",") if item.strip()}
        return set()


def _remove_hidden_scene_values(
    ui_values: dict[str, Any],
    preset_prepared: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    visible_values = dict(ui_values or {})
    for control_name in _scene_hidden_controls(preset_prepared):
        visible_values.pop(control_name, None)
        if isinstance(metadata, dict):
            metadata.pop(control_name, None)
    return visible_values


def _scene_ui_values(values: dict[str, Any], preset_prepared: dict[str, Any] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in _SCENE_PROFILE_CONTROL_KEYS:
        if key in values:
            result[key] = values.get(key)
    if "overwrite_step" in values:
        result["overwrite_step"] = values.get("overwrite_step")
    elif "scene_steps" in values:
        result["overwrite_step"] = values.get("scene_steps")
    return _remove_hidden_scene_values(result, preset_prepared or {})


def build_profile_payload(name: str, values: dict[str, Any]) -> dict[str, Any]:
    state_params = values.get("state_topbar")
    state_params = state_params if isinstance(state_params, dict) else {}
    backend_params = values.get("params_backend")
    backend_params = dict(backend_params) if isinstance(backend_params, dict) else {}

    user_did = _get_user_did(state_params)
    preset_name = _get_preset_name(state_params)
    preset_json = _state_preset_json(state_params, user_did, preset_name)
    preset_prepared = _state_preset_prepared(state_params, preset_json)
    engine = copy.deepcopy(preset_prepared.get("engine", {})) if isinstance(preset_prepared.get("engine"), dict) else {}
    scene_values = _scene_ui_values(values, preset_prepared)

    backend_engine = (
        backend_params.get("backend_engine")
        or state_params.get("backend_engine")
        or state_params.get("engine")
        or engine.get("backend_engine")
        or getattr(config, "backend_engine", None)
        or "Fooocus"
    )
    if isinstance(engine.get("scene_frontend"), dict):
        task_method = _current_preset_task_method(preset_prepared, state_params, scene_values)
        task_method = task_method or state_params.get("task_method") or backend_params.get("task_method")
    else:
        task_method = backend_params.get("task_method") or state_params.get("task_method")
    engine_type = state_params.get("engine_type", engine.get("engine_type", "image"))

    resolution = _resolution_value(values)
    metadata: dict[str, Any] = {
        "preset": preset_name,
        "is_mobile": bool(state_params.get("__is_mobile", False)),
        "engine": engine,
        "backend_engine": backend_engine,
        "Backend Engine": backend_engine,
        "task_method": task_method,
        "engine_type": engine_type,
        "image_number": values.get("image_number"),
        "max_image_number": getattr(config, "default_max_image_number", 32),
        "prompt": values.get("prompt"),
        "negative_prompt": values.get("negative_prompt"),
        "styles": values.get("style_selections") or [],
        "performance": values.get("performance_selection"),
        "steps": values.get("overwrite_step"),
        "overwrite_switch": values.get("overwrite_switch"),
        "resolution": resolution,
        "Resolution": resolution,
        "overwrite_width": values.get("overwrite_width"),
        "overwrite_height": values.get("overwrite_height"),
        "resolution_quantize_step": values.get("resolution_quantize_step", flags.default_resolution_quantize_step),
        "resolution_multiplier": values.get("resolution_multiplier", flags.default_resolution_multiplier),
        "resolution_edit_mode": values.get("resolution_edit_mode", flags.default_resolution_edit_mode),
        "random_aspect_ratio": _as_bool(values.get("random_aspect_ratio")),
        "use_resolution_override": _as_bool(values.get("use_resolution_override")),
        "resolution_original_input": _as_bool(values.get("resolution_original_input")),
        "guidance_scale": values.get("guidance_scale"),
        "sharpness": values.get("sharpness"),
        "adm_guidance": repr((
            values.get("adm_scaler_positive"),
            values.get("adm_scaler_negative"),
            values.get("adm_scaler_end"),
        )),
        "refiner_swap_method": values.get("refiner_swap_method"),
        "adaptive_cfg": values.get("adaptive_cfg"),
        "base_model": _model_value(values, "base_model"),
        "refiner_model": _model_value(values, "refiner_model"),
        "refiner_switch": _model_value(values, "refiner_switch"),
        "sampler": values.get("sampler_name"),
        "scheduler": values.get("scheduler_name"),
        "clip_model": _model_value(values, "clip_model"),
        "vae": _model_value(values, "vae_name", "vae"),
        "upscale_model": _model_value(values, "upscale_model"),
        "seed_random": _as_bool(values.get("seed_random", True)),
        "inpaint_engine_version": values.get("inpaint_engine_state") or values.get("inpaint_engine"),
        "inpaint_engine": values.get("inpaint_engine"),
        "inpaint_engine_state": values.get("inpaint_engine_state"),
        "inpaint_method": values.get("inpaint_mode"),
        "output_format": values.get("output_format"),
        "inpaint_advanced_masking_checkbox": values.get("inpaint_advanced_masking_checkbox"),
        "mixing_image_prompt_and_vary_upscale": values.get("mixing_image_prompt_and_vary_upscale"),
        "mixing_image_prompt_and_inpaint": values.get("mixing_image_prompt_and_inpaint"),
        "backfill_prompt": values.get("backfill_prompt"),
        "translation_methods": values.get("translation_methods"),
        "input_image_checkbox": values.get("input_image_checkbox"),
        "enhance_checkbox": values.get("enhance_checkbox", False),
        "enhance_enabled_1": values.get("enhance_enabled_1", False),
        "enhance_enabled_2": values.get("enhance_enabled_2", False),
        "enhance_enabled_3": values.get("enhance_enabled_3", False),
        "enhance_uov_method": values.get("enhance_uov_method", "Disabled"),
        "enhance_uov_strength": values.get("enhance_uov_strength", 0.2),
    }
    if not metadata["seed_random"]:
        metadata["seed"] = values.get("image_seed")
    if _as_bool(values.get("freeu_enabled", False)):
        metadata["freeu"] = repr((
            values.get("freeu_b1"),
            values.get("freeu_b2"),
            values.get("freeu_s1"),
            values.get("freeu_s2"),
        ))

    for index, entry in enumerate(_lora_entries(values), start=1):
        metadata[f"lora_combined_{index}"] = entry

    metadata.update(scene_values)

    manifest_ui_values = {
        "engine": backend_engine,
        "engine_type": engine_type,
        "task_method": task_method,
        **scene_values,
    }
    skipped_backend_keys = {"image", "mask", "samples", "pixels", "latent", regen_manifest.KEY}
    backend_snapshot = {
        key: value
        for key, value in backend_params.items()
        if key not in skipped_backend_keys
    }
    manifest = regen_manifest.make_manifest(
        preset_name=preset_name,
        preset_json=preset_json,
        preset_prepared=preset_prepared,
        ui_values=manifest_ui_values,
        backend_params=backend_snapshot,
        asset_refs={},
    )
    metadata[regen_manifest.KEY] = manifest
    metadata[regen_manifest.LABEL] = manifest

    now = datetime.now().isoformat(timespec="seconds")
    return {
        "schema": PROFILE_SCHEMA,
        "name": name,
        "preset_name": preset_name,
        "user_did": user_did,
        "created_at": now,
        "updated_at": now,
        "metadata": regen_manifest.json_safe(metadata),
    }


def _profile_lang_is_cn(context: Any = None) -> bool:
    lang = context.get("__lang") if isinstance(context, dict) else context
    value = str(lang or "en").strip().lower()
    return value.startswith("cn") or value.startswith("zh") or value in {"中文", "chinese"}


def _profile_text(context: Any, en: str, cn: str) -> str:
    return cn if _profile_lang_is_cn(context) else en


def _warn_profile_load(warnings: list[str], context: Any = None):
    if not warnings:
        return
    visible = warnings[:_PROFILE_WARNING_LIMIT]
    suffix = "" if len(warnings) <= _PROFILE_WARNING_LIMIT else _profile_text(
        context,
        f"; {len(warnings) - _PROFILE_WARNING_LIMIT} more",
        f"；另有 {len(warnings) - _PROFILE_WARNING_LIMIT} 项",
    )
    separator = "; " if not _profile_lang_is_cn(context) else "；"
    message = _profile_text(
        context,
        "Parameter profile loaded for the current version: ",
        "参数预设已按当前版本读取：",
    ) + separator.join(visible) + suffix
    try:
        gr.Warning(message, duration=6)
    except Exception:
        pass


def _current_scene_ui_values(metadata: dict[str, Any], manifest: dict[str, Any] | None) -> dict[str, Any]:
    ui_values = {}
    if isinstance(manifest, dict) and isinstance(manifest.get("ui_values"), dict):
        ui_values.update(copy.deepcopy(manifest.get("ui_values") or {}))
    for key in (
        *_SCENE_PROFILE_CONTROL_KEYS,
        "overwrite_step",
    ):
        if key in metadata:
            ui_values[key] = metadata.get(key)
    if "overwrite_step" not in ui_values:
        if isinstance(manifest, dict) and isinstance(manifest.get("ui_values"), dict) and "scene_steps" in manifest.get("ui_values"):
            ui_values["overwrite_step"] = manifest.get("ui_values", {}).get("scene_steps")
        elif "scene_steps" in metadata:
            ui_values["overwrite_step"] = metadata.get("scene_steps")
    ui_values.pop("scene_steps", None)
    metadata.pop("scene_steps", None)
    if "overwrite_step" in ui_values:
        metadata["overwrite_step"] = ui_values.get("overwrite_step")
    return ui_values


def _current_preset_task_method(preset_prepared: dict[str, Any], state_params: dict[str, Any], ui_values: dict[str, Any]) -> Any:
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    scene_frontend = engine.get("scene_frontend") if isinstance(engine, dict) else None
    if isinstance(scene_frontend, dict):
        task_method = scene_frontend.get("task_method")
        theme = ui_values.get("scene_theme")
        if isinstance(task_method, dict):
            if theme in task_method:
                return task_method.get(theme)
            return next(iter(task_method.values()), "")
        if isinstance(task_method, list):
            return task_method[0] if task_method else ""
        if task_method:
            return task_method
    return state_params.get("task_method") if isinstance(state_params, dict) else None


def _apply_current_preset_manifest(metadata: dict[str, Any], state_params: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    user_did = _get_user_did(state_params)
    preset_name = _get_preset_name(state_params) or _get_preset_name(metadata)
    preset_json = _state_preset_json(state_params, user_did, preset_name)
    preset_prepared = _state_preset_prepared(state_params, preset_json)
    if not preset_prepared:
        warnings.append(_profile_text(
            state_params,
            "The current preset structure is unavailable; recognized parameters were retained.",
            "当前 preset 结构不可用，已保留可识别参数",
        ))
        metadata["preset"] = preset_name
        return metadata

    old_manifest = regen_manifest.extract(metadata)
    ui_values = _current_scene_ui_values(metadata, old_manifest)
    ui_values = _remove_hidden_scene_values(ui_values, preset_prepared, metadata)
    engine = preset_prepared.get("engine", {}) if isinstance(preset_prepared, dict) else {}
    if isinstance(engine, dict):
        if engine.get("backend_engine"):
            ui_values["engine"] = engine.get("backend_engine")
        if engine.get("engine_type"):
            ui_values["engine_type"] = engine.get("engine_type")
    task_method = _current_preset_task_method(preset_prepared, state_params, ui_values)
    if task_method:
        ui_values["task_method"] = task_method

    backend_params = {}
    if isinstance(old_manifest, dict) and isinstance(old_manifest.get("backend_params"), dict):
        backend_params = copy.deepcopy(old_manifest.get("backend_params") or {})

    manifest = regen_manifest.make_manifest(
        preset_name=preset_name,
        preset_json=preset_json,
        preset_prepared=preset_prepared,
        ui_values=ui_values,
        backend_params=backend_params,
        asset_refs={},
    )
    metadata[regen_manifest.KEY] = manifest
    metadata[regen_manifest.LABEL] = manifest
    metadata["preset"] = preset_name
    metadata["engine"] = copy.deepcopy(engine) if isinstance(engine, dict) else {}
    if isinstance(engine, dict) and engine.get("backend_engine"):
        metadata["backend_engine"] = engine.get("backend_engine")
        metadata["Backend Engine"] = engine.get("backend_engine")
    if isinstance(engine, dict) and engine.get("engine_type"):
        metadata["engine_type"] = engine.get("engine_type")
    if task_method:
        metadata["task_method"] = task_method
    return metadata


def _model_lists_for_metadata(metadata: dict[str, Any], state_params: dict[str, Any]) -> dict[str, list[Any]]:
    engine = metadata.get("backend_engine") or metadata.get("Backend Engine")
    if isinstance(metadata.get("engine"), dict):
        engine = metadata["engine"].get("backend_engine", engine)
    task_method = metadata.get("task_method") or (state_params.get("task_method") if isinstance(state_params, dict) else None)
    try:
        base_models = list(config.get_base_model_list(engine, task_method, use_model_filter=True) or [])
    except Exception:
        base_models = list(getattr(config, "model_filenames", []) or [])
    if not base_models:
        base_models = list(getattr(config, "model_filenames", []) or [])
    return {
        "base": base_models,
        "lora": list(getattr(config, "lora_filenames", []) or []),
        "clip": list(getattr(config, "clip_filenames", []) or []),
        "vae": list(getattr(config, "vae_filenames", []) or []),
        "upscale": list(getattr(config, "upscale_model_filenames", []) or []),
    }


def _fallback_model(default_value: Any, candidates: list[Any], none_value: str = "None") -> str:
    match = _model_match(default_value, candidates, passthrough={none_value, "default", _default_clip_value(), _default_vae_value(), "auto"})
    if match:
        return match
    for candidate in candidates or []:
        value = _normalized_model_name(candidate)
        if value:
            return value
    return _clean_name(default_value) or none_value


def _sanitize_model_values(metadata: dict[str, Any], state_params: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    lists = _model_lists_for_metadata(metadata, state_params)
    base_fallback = _fallback_model(getattr(config, "default_base_model_name", None), lists["base"], "None")
    refiner_fallback = "None"
    clip_fallback = getattr(config, "default_clip_model", _default_clip_value())
    vae_fallback = getattr(config, "default_vae", _default_vae_value())
    upscale_fallback = getattr(config, "default_upscale_model", "default") or "default"

    def apply_model(key: str, candidates_key: str, fallback: str, label: str, passthrough: set[str] | None = None):
        raw = metadata.get(key)
        if raw in (None, ""):
            return
        match = _model_match(raw, lists[candidates_key], passthrough=passthrough)
        if match:
            metadata[key] = match
            return
        raw_name = _clean_name(raw)
        if raw_name and raw_name not in (fallback, "None", "default", _default_clip_value(), _default_vae_value(), "auto"):
            warnings.append(_profile_text(
                state_params,
                f"{label} is not in the current model list; switched to {fallback}.",
                f"{label} 不在当前模型列表中，已改用 {fallback}",
            ))
        metadata[key] = fallback

    apply_model("base_model", "base", base_fallback, "Base Model")
    apply_model("refiner_model", "base", refiner_fallback, "Refiner Model", passthrough={"None"})
    apply_model("clip_model", "clip", clip_fallback, "CLIP Model", passthrough={_default_clip_value(), "auto"})
    apply_model("vae", "vae", vae_fallback, "VAE", passthrough={_default_vae_value(), "auto"})
    apply_model("upscale_model", "upscale", upscale_fallback, "Upscale Model", passthrough={"default"})

    for index in range(getattr(config, "default_max_lora_number", 0)):
        key = f"lora_combined_{index + 1}"
        if key not in metadata:
            continue
        enabled, model, weight = _split_lora_entry(metadata.get(key))
        if not enabled or _clean_name(model).lower() == "none":
            metadata[key] = _lora_entry(False, "None", weight)
            continue
        match = _model_match(model, lists["lora"], passthrough={"None"})
        if match:
            metadata[key] = _lora_entry(enabled, match, weight)
            continue
        warnings.append(_profile_text(
            state_params,
            f"LoRA {index + 1} is not in the current model list and was disabled.",
            f"LoRA {index + 1} 不在当前模型列表中，已停用",
        ))
        metadata[key] = _lora_entry(False, "None", weight)
    return metadata


def _sanitize_profile_values(metadata: dict[str, Any], warnings: list[str], state_params: dict[str, Any] | None = None) -> dict[str, Any]:
    metadata.pop("clip_skip", None)
    default_images = _as_int(getattr(config, "default_image_number", 1), 1)
    max_images = max(1, _as_int(getattr(config, "default_max_image_number", 32), 32))
    if "image_number" in metadata:
        image_number = _as_int(metadata.get("image_number"), default_images)
        if image_number < 1 or image_number > max_images:
            warnings.append(_profile_text(
                state_params,
                "The generation count was outside the current range and was adjusted.",
                "生成数量超出当前范围，已使用当前允许值",
            ))
        metadata["image_number"] = min(max(1, image_number), max_images)
    metadata["max_image_number"] = max_images

    resolution = metadata.get("resolution", metadata.get("Resolution"))
    if resolution not in (None, ""):
        try:
            parsed_resolution = meta_parser.parse_resolution_pair_value(resolution)
        except Exception:
            parsed_resolution = None
        if parsed_resolution is None:
            metadata.pop("resolution", None)
            metadata.pop("Resolution", None)
            warnings.append(_profile_text(
                state_params,
                "The resolution format is incompatible with the current version; the current preset default was used.",
                "分辨率格式不适合当前版本，已使用当前 preset 默认值",
            ))

    output_format = _clean_name(metadata.get("output_format"))
    if output_format and output_format not in getattr(flags, "output_formats", ["png", "jpeg", "webp"]):
        fallback_format = getattr(config, "default_output_format", "png")
        warnings.append(_profile_text(
            state_params,
            f"Output format {output_format} is unsupported; switched to {fallback_format}.",
            f"存图格式 {output_format} 不支持，已改用 {fallback_format}",
        ))
        metadata["output_format"] = fallback_format

    sampler_choices = set(getattr(flags, "sampler_list", []) or []) | set(getattr(flags, "comfy_sampler_list", []) or [])
    scheduler_choices = set(getattr(flags, "scheduler_list", []) or []) | set(getattr(flags, "comfy_scheduler_list", []) or [])
    sampler = _clean_name(metadata.get("sampler"))
    if sampler and sampler_choices and sampler not in sampler_choices:
        fallback_sampler = getattr(config, "default_sampler", None) or next(iter(sampler_choices))
        warnings.append(_profile_text(
            state_params,
            f"Sampler {sampler} is unsupported; switched to {fallback_sampler}.",
            f"Sampler {sampler} 不支持，已改用 {fallback_sampler}",
        ))
        metadata["sampler"] = fallback_sampler
    scheduler = _clean_name(metadata.get("scheduler"))
    if scheduler and scheduler_choices and scheduler not in scheduler_choices:
        fallback_scheduler = getattr(config, "default_scheduler", None) or next(iter(scheduler_choices))
        warnings.append(_profile_text(
            state_params,
            f"Scheduler {scheduler} is unsupported; switched to {fallback_scheduler}.",
            f"Scheduler {scheduler} 不支持，已改用 {fallback_scheduler}",
        ))
        metadata["scheduler"] = fallback_scheduler

    step = _as_int(metadata.get("resolution_quantize_step"), getattr(flags, "default_resolution_quantize_step", 16))
    if step not in getattr(flags, "resolution_quantize_steps", [step]):
        metadata["resolution_quantize_step"] = getattr(flags, "default_resolution_quantize_step", step)
    try:
        metadata["resolution_multiplier"] = max(1.0, min(2.0, float(metadata.get("resolution_multiplier", flags.default_resolution_multiplier))))
    except Exception:
        metadata["resolution_multiplier"] = getattr(flags, "default_resolution_multiplier", 1.0)
    return metadata


def prepare_metadata_for_load(metadata: dict[str, Any], payload: dict[str, Any] | None, context: Any = None) -> tuple[dict[str, Any], list[str]]:
    metadata = copy.deepcopy(metadata or {})
    state_params = context if isinstance(context, dict) else {}
    warnings: list[str] = []
    schema = _clean_name((payload or {}).get("schema"))
    if schema and schema != PROFILE_SCHEMA:
        warnings.append(_profile_text(
            state_params,
            "The saved format is from an older version; recognized fields were loaded.",
            "保存格式来自旧版本，已读取可识别字段",
        ))
    elif not schema:
        warnings.append(_profile_text(
            state_params,
            "The saved format has no version information; recognized fields were loaded.",
            "保存格式缺少版本信息，已读取可识别字段",
        ))
    metadata = _apply_current_preset_manifest(metadata, state_params, warnings)
    metadata = _sanitize_profile_values(metadata, warnings, state_params)
    metadata = _sanitize_model_values(metadata, state_params, warnings)
    return metadata, warnings


def save_profile(name: Any, values: dict[str, Any]):
    profile_name = _clean_name(name)
    context = values.get("state_topbar") if isinstance(values, dict) else {}
    if not profile_name:
        try:
            gr.Warning(_profile_text(context, "Parameter profile name is required.", "请输入参数预设名称。"), duration=3)
        except Exception:
            pass
        return refresh_dropdown(context, name)
    payload = build_profile_payload(profile_name, values)
    path = _profile_path(payload["user_did"], payload["preset_name"], profile_name)
    existing = _load_json(path)
    if isinstance(existing, dict) and existing.get("created_at"):
        payload["created_at"] = existing.get("created_at")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
    logger.info("Saved parameter profile %s for preset %s to %s", profile_name, payload["preset_name"], path)
    try:
        gr.Info(_profile_text(context, "Parameter profile saved.", "参数预设已保存。"), duration=2)
    except Exception:
        pass
    return refresh_dropdown({"user_did": payload["user_did"], "__preset": payload["preset_name"]}, profile_name)


def delete_profile(name: Any, context: Any = None):
    profile_name = _clean_name(name)
    if not profile_name:
        return refresh_dropdown(context, None)
    user_did = _get_user_did(context)
    preset_name = _get_preset_name(context)
    path = _profile_path(user_did, preset_name, profile_name)
    if os.path.isfile(path):
        os.remove(path)
        logger.info("Deleted parameter profile %s for preset %s from %s", profile_name, preset_name, path)
        try:
            gr.Info(_profile_text(context, "Parameter profile deleted.", "参数预设已删除。"), duration=2)
        except Exception:
            pass
    return refresh_dropdown(context, None)


def load_profile_metadata(name: Any, context: Any = None) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    profile_name = _clean_name(name)
    if not profile_name:
        return None, None
    user_did = _get_user_did(context)
    preset_name = _get_preset_name(context)
    for entry in _profile_entries(user_did, preset_name):
        if entry["name"] != profile_name:
            continue
        payload = _load_json(entry["path"])
        metadata = payload.get("metadata") if isinstance(payload, dict) else None
        if isinstance(metadata, dict):
            metadata, warnings = prepare_metadata_for_load(metadata, payload, context)
            _warn_profile_load(warnings, context)
            return metadata, payload
    return None, None


def _all_user_profile_payloads(context: Any = None) -> list[dict[str, Any]]:
    user_did = _get_user_did(context)
    root = _profiles_root(user_did)
    entries: list[dict[str, Any]] = []
    if not os.path.isdir(root):
        return entries
    for folder_name in sorted(os.listdir(root)):
        folder = os.path.join(root, folder_name)
        if not os.path.isdir(folder):
            continue
        for filename in sorted(os.listdir(folder)):
            if not filename.lower().endswith(".json"):
                continue
            path = os.path.join(folder, filename)
            payload = _load_json(path)
            metadata = payload.get("metadata") if isinstance(payload, dict) else None
            if not isinstance(metadata, dict):
                continue
            name = _clean_name(payload.get("name")) or os.path.splitext(filename)[0]
            preset_name = _clean_name(payload.get("preset_name") or metadata.get("preset"))
            if not name or not preset_name:
                continue
            entries.append({
                "name": name,
                "preset_name": preset_name,
                "path": path,
                "schema": _clean_name(payload.get("schema")),
                "updated_at": _clean_name(payload.get("updated_at") or payload.get("created_at")),
                "payload": payload,
                "metadata": metadata,
            })
    entries.sort(key=lambda item: (item["preset_name"].casefold(), item["name"].casefold()))
    return entries


def _profile_capability(entry: dict[str, Any]) -> dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    manifest = regen_manifest.extract(metadata)
    ui_values = manifest.get("ui_values") if isinstance(manifest, dict) and isinstance(manifest.get("ui_values"), dict) else {}
    return {
        "name": _clean_name(entry.get("name")),
        "preset": _clean_name(entry.get("preset_name")),
        "scene_theme": _clean_name(metadata.get("scene_theme") or ui_values.get("scene_theme")),
        "task_method": _clean_name(metadata.get("task_method") or ui_values.get("task_method")),
        "engine_type": _clean_name(metadata.get("engine_type")) or "image",
        "updated_at": _clean_name(entry.get("updated_at")),
    }


def list_agent_profile_capabilities(context: Any = None, preset_names: Any = None) -> list[dict[str, Any]]:
    """Return private profile names and routing metadata without exposing saved parameters."""
    allowed = {
        _clean_name(name).casefold()
        for name in (preset_names if isinstance(preset_names, (list, tuple, set)) else [])
        if _clean_name(name)
    }
    seen = set()
    result = []
    for entry in _all_user_profile_payloads(context):
        capability = _profile_capability(entry)
        if allowed and capability["preset"].casefold() not in allowed:
            continue
        key = (capability["preset"].casefold(), capability["name"].casefold())
        if key in seen:
            continue
        seen.add(key)
        result.append(capability)
    return result


def _find_user_profile(name: Any, preset_name: Any = None, context: Any = None) -> tuple[dict[str, Any] | None, str]:
    profile_name = _clean_name(name)
    wanted_preset = _clean_name(preset_name)
    if not profile_name:
        return None, "parameter_profile_missing"
    matches = [
        entry for entry in _all_user_profile_payloads(context)
        if entry["name"].casefold() == profile_name.casefold()
        and (not wanted_preset or entry["preset_name"].casefold() == wanted_preset.casefold())
    ]
    if not matches:
        return None, "parameter_profile_missing"
    if len(matches) > 1:
        return None, "parameter_profile_ambiguous"
    return matches[0], ""


def _task_method_key(value: Any) -> str:
    text = _clean_name(value).lower()
    return text[len("scene_"):] if text.startswith("scene_") else text


def _profile_loras(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    result = []
    max_loras = max(1, int(getattr(config, "default_max_lora_number", 10) or 10))
    for index in range(1, max_loras + 1):
        key = f"lora_combined_{index}"
        if key not in metadata:
            continue
        enabled, model, weight = _split_lora_entry(metadata.get(key))
        result.append({"enabled": bool(enabled), "model": model or "None", "weight": weight})
    return result


def _profile_resolution_overrides(metadata: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    resolution = _clean_name(metadata.get("resolution") or metadata.get("Resolution"))
    size = re.search(r"(\d{3,5})\s*[xX*×]\s*(\d{3,5})", resolution)
    if size:
        result["aspect_ratio"] = f"{size.group(1)}*{size.group(2)}"
    width = _as_int(metadata.get("overwrite_width"), -1)
    height = _as_int(metadata.get("overwrite_height"), -1)
    if width > 0 and height > 0:
        result.update({"width": width, "height": height, "aspect_ratio": f"{width}*{height}"})
    aliases = {
        "resolution_quantize_step": "quantize",
        "resolution_multiplier": "multiplier",
        "resolution_edit_mode": "edit_mode",
        "random_aspect_ratio": "random_aspect_ratio",
    }
    for source, target in aliases.items():
        if source in metadata:
            result[target] = copy.deepcopy(metadata.get(source))
    return result


def apply_profile_to_canvas_node(preset_node: Any, context: Any = None) -> dict[str, Any]:
    """Resolve and apply a private profile to a Canvas node using the current user identity."""
    if not isinstance(preset_node, dict):
        return {"ok": False, "error": "parameter_profile_invalid", "details": "Preset node is invalid."}
    reference = preset_node.get("parameter_profile")
    if isinstance(reference, str):
        profile_name = _clean_name(reference)
        reference_preset = ""
    elif isinstance(reference, dict):
        profile_name = _clean_name(reference.get("name"))
        reference_preset = _clean_name(reference.get("preset"))
    else:
        profile_name = ""
        reference_preset = ""
    if not profile_name:
        return {"ok": True, "preset_node": copy.deepcopy(preset_node), "profile": None}

    node = copy.deepcopy(preset_node)
    preset = node.get("preset") if isinstance(node.get("preset"), dict) else {}
    node_preset = _clean_name(preset.get("name") or preset.get("display_name") or node.get("title"))
    if reference_preset and node_preset.casefold() != reference_preset.casefold():
        return {
            "ok": False,
            "error": "parameter_profile_incompatible",
            "details": "The parameter profile belongs to another Preset.",
        }
    entry, error = _find_user_profile(profile_name, node_preset, context)
    if not entry:
        return {"ok": False, "error": error, "details": "The private parameter profile is unavailable."}

    state_params = dict(context) if isinstance(context, dict) else {}
    state_params.update({"__preset": node_preset, "preset": node_preset})
    runtime = node.get("runtime") if isinstance(node.get("runtime"), dict) else {}
    if runtime.get("scene_theme"):
        state_params["scene_theme"] = runtime.get("scene_theme")
    if runtime.get("task_method"):
        state_params["task_method"] = runtime.get("task_method")
    metadata, warnings = prepare_metadata_for_load(entry["metadata"], entry["payload"], state_params)

    saved_theme = _clean_name(metadata.get("scene_theme"))
    active_theme = _clean_name(runtime.get("scene_theme"))
    saved_task_method = _task_method_key(metadata.get("task_method"))
    active_task_method = _task_method_key(runtime.get("task_method"))
    if saved_theme and active_theme and saved_theme != active_theme:
        return {
            "ok": False,
            "error": "parameter_profile_incompatible",
            "details": "The parameter profile belongs to another Preset method.",
        }
    if saved_task_method and active_task_method and saved_task_method != active_task_method:
        return {
            "ok": False,
            "error": "parameter_profile_incompatible",
            "details": "The parameter profile task method no longer matches this route.",
        }

    params = node.setdefault("params", {})
    if not isinstance(params, dict):
        params = {}
        node["params"] = params
    for key in _CANVAS_PROFILE_PARAM_KEYS:
        if key in metadata:
            params[key] = copy.deepcopy(metadata.get(key))
    if not _as_bool(metadata.get("seed_random", True)) and metadata.get("seed") is not None:
        params["image_seed"] = metadata.get("seed")

    models_config = node.setdefault("models_config", {})
    model_defaults = models_config.setdefault("defaults", {}) if isinstance(models_config, dict) else {}
    if not isinstance(model_defaults, dict):
        model_defaults = {}
        models_config["defaults"] = model_defaults
    model_aliases = {
        "base_model": "base_model",
        "refiner_model": "refiner_model",
        "clip_model": "clip_model",
        "vae": "vae",
        "upscale_model": "upscale_model",
    }
    for source, target in model_aliases.items():
        if metadata.get(source) not in (None, ""):
            model_defaults[target] = copy.deepcopy(metadata.get(source))
    loras = _profile_loras(metadata)
    if loras:
        model_defaults["loras"] = loras
    models_config["mode"] = "parameter_profile"

    styles_config = node.setdefault("styles_config", {})
    style_defaults = styles_config.setdefault("defaults", {}) if isinstance(styles_config, dict) else {}
    styles = metadata.get("styles")
    if isinstance(styles, list):
        style_defaults["style_selections"] = copy.deepcopy(styles)

    resolution_config = node.setdefault("resolution_config", {})
    resolution_defaults = resolution_config.setdefault("defaults", {}) if isinstance(resolution_config, dict) else {}
    resolution_defaults.update(_profile_resolution_overrides(metadata))

    generation_config = node.setdefault("generation_config", {})
    generation_defaults = generation_config.setdefault("defaults", {}) if isinstance(generation_config, dict) else {}
    for source, target in _CANVAS_PROFILE_GENERATION_KEYS.items():
        if metadata.get(source) not in (None, ""):
            generation_defaults[target] = copy.deepcopy(metadata.get(source))

    capability = _profile_capability(entry)
    node["parameter_profile"] = {
        "name": capability["name"],
        "preset": capability["preset"],
        "source": "private",
        "updated_at": capability["updated_at"],
    }
    node["parameter_profile_warnings"] = warnings[:_PROFILE_WARNING_LIMIT]
    return {"ok": True, "preset_node": node, "profile": capability}


def resolution_extra_updates(metadata: dict[str, Any] | None):
    if not isinstance(metadata, dict):
        return [skip_update(), skip_update(), skip_update()]
    random_aspect = _as_bool(metadata.get("random_aspect_ratio", False))
    use_override = _as_bool(metadata.get("use_resolution_override", False))
    original_input = _as_bool(metadata.get("resolution_original_input", False))
    if not use_override:
        width = _as_number(metadata.get("overwrite_width"), -1)
        height = _as_number(metadata.get("overwrite_height"), -1)
        use_override = isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0
    return [
        gr_update(value=random_aspect),
        gr_update(value=use_override),
        gr_update(value=original_input),
    ]
