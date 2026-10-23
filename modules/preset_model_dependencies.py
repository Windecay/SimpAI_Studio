"""Conditional files used by the selected preset operation."""

import hashlib


MODEL_PREFIX = "https://www.modelscope.cn/models/metercai/SimpleSDXL2/resolve/master/SimpleModels"
ONEKEY_MODELS = {
    "kontext_gen": ("Kontext_general_V1.safetensors", 306593008),
    "kontext_all": ("Kontext_all.safetensors", 306593008),
    "kontext_appliances": ("Kontext_appliances_V1.safetensors", 343806368),
    "kontext_mk": ("Kontext_makeup_V1.safetensors", 171970336),
    "kontext_metal": ("Kontext_metal_V1.safetensors", 343806368),
    "kontext_clothing": ("Kontext_clothing_V1.safetensors", 306593008),
    "kontext_jewelry": ("Kontext_jewelry_V1.safetensors", 306593008),
    "kontext_3c": ("Kontext_digital3C.safetensors", 306593008),
    "kontext_composite": ("Kontext_composite.safetensors", 343806400),
    "kontext_pattern": ("Kontext_pattern.safetensors", 343806384),
    "kontext_scene": ("Kontext_scene_alpha.safetensors", 343806392),
    "kontext_face": ("Kontext_face_V1.safetensors", 306593008),
    "kontext_angle": ("Kontext_angle_beta.safetensors", 343806392),
    "kontext_3view": ("Kontext_3view.safetensors", 306593008),
    "kontext_remove": ("Kontext_remove_V1.safetensors", 306593008),
    "kontext_body": ("Kontext_body_restore.safetensors", 343806408),
    "kontext_takeclothes": ("Kontext_takeclothes_V2.safetensors", 343806408),
    "kontext_putit": ("Kontext_put_it_here_V4.2.safetensors", 358706112),
    "kontext_unblurbg": ("Kontext_deblur.safetensors", 306793968),
    "kontext_depth_ref": ("Kontext_depth_referencel.safetensors", 343806456),
}
REMBG_MODELS = {
    "u2net": ("u2net.onnx", 175997641),
    "u2netp": ("u2netp.onnx", 4574861),
    "u2net_human_seg": ("u2net_human_seg.onnx", 175997641),
    "u2net_cloth_seg": ("u2net_cloth_seg.onnx", 176194565),
    "silueta": ("silueta.onnx", 44173029),
    "isnet-general-use": ("isnet-general-use.onnx", 178648008),
    "isnet-anime": ("isnet-anime.onnx", 176069933),
}


def _entry(category, model):
    name, size = model
    return f"{category},{name},{size},0,{MODEL_PREFIX}/{category}/{name}"


def _enabled(value):
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "on", "yes"}
    return bool(value)


def required_model_entries(preset_node):
    node = preset_node if isinstance(preset_node, dict) else {}
    runtime = node.get("runtime") or {}
    params = node.get("params") or {}
    schema = node.get("schema") or {}
    theme = runtime.get("scene_theme") or params.get("scene_theme") or schema.get("default_theme") or ""
    theme_info = (schema.get("per_theme") or {}).get(theme) or {}
    method = str(runtime.get("task_method") or params.get("task_method") or theme_info.get("task_method") or "").removeprefix("scene_")
    if method in ONEKEY_MODELS:
        return [_entry("loras", ONEKEY_MODELS[method])]
    if method not in {"sd15_aio", "sd15_aio_cn"}:
        return []
    enhance = node.get("enhance_params") or {}
    if "classic_mode" in node or "current_tab" in node:
        active = node.get("classic_mode") == "enhance" or node.get("current_tab") == "enhance"
    else:
        active = _enabled(params.get("enhance_checkbox")) or _enabled(enhance.get("enabled"))
    if not active:
        return []
    regions = enhance.get("regions") if isinstance(enhance.get("regions"), list) else []
    indexes = set(range(max(3, len(regions))))
    for key in params:
        parts = str(key).split("_")
        if len(parts) >= 4 and parts[:2] == ["enhance", "region"] and parts[2].isdigit():
            indexes.add(int(parts[2]) - 1)
    entries = []
    for index in sorted(indexes):
        region = regions[index] if 0 <= index < len(regions) and isinstance(regions[index], dict) else {}
        enabled = params.get(f"enhance_region_{index + 1}_enabled", region.get("enabled", index < 3))
        if not _enabled(enabled) or not _enabled(region.get("requires_mask", True)):
            continue
        session = params.get(f"enhance_region_{index + 1}_mask_model", region.get("mask_model", "sam"))
        if session in REMBG_MODELS:
            entry = _entry("inpaint", REMBG_MODELS[session])
            if entry not in entries:
                entries.append(entry)
    return entries


def required_model_entries_for_state(state_params, backend_params=None, enhance_selection=None):
    state = state_params if isinstance(state_params, dict) else {}
    params = dict(backend_params or {})
    scene = state.get("scene_frontend") if isinstance(state.get("scene_frontend"), dict) else {}
    theme = params.get("scene_theme") or state.get("scene_theme") or state.get("__scene_theme") or ""
    method = scene.get("task_method")
    if isinstance(method, dict):
        method = method.get(theme) or ""
    elif isinstance(method, list):
        method = method[0] if method else ""
    method = params.get("task_method") or method or state.get("task_method") or ""
    selection = enhance_selection if isinstance(enhance_selection, dict) else state.get("__selected_enhance_models") or {}
    if selection.get("preset") != state.get("__preset"):
        selection = {}
    elif selection:
        params = {key: value for key, value in params.items() if not str(key).startswith("enhance_region_")}
    params["enhance_checkbox"] = selection.get("enabled", params.get("enhance_checkbox", False))
    return required_model_entries({
        "runtime": {"task_method": method, "scene_theme": theme}, "params": params,
        "enhance_params": {"regions": selection.get("regions") or []},
    })


def model_entries_revision(entries):
    return hashlib.sha256(repr(entries).encode("utf-8")).hexdigest()


def capture_enhance_selection(state_params, enabled, *controls):
    state = state_params if isinstance(state_params, dict) else {}
    regions = []
    for offset in range(0, len(controls), 16):
        region = controls[offset:offset + 16]
        if len(region) < 5:
            break
        regions.append({"enabled": _enabled(region[0]), "mask_model": str(region[4] or "sam"),
                        "requires_mask": _enabled(enabled) and _enabled(region[0])})
    state["__selected_enhance_models"] = {
        "preset": state.get("__preset"), "enabled": _enabled(enabled), "regions": regions,
    }
    return state
