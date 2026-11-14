"""Canvas prompt tools using the same preset rules and runner as Studio."""

import copy


def _preset_context(node, state):
    from enhanced import topbar

    preset = node.get("preset") or {}
    name = str(preset.get("name") if isinstance(preset, dict) else preset).strip()
    catalog = topbar._build_preset_store_meta(state)
    if not name or name not in catalog:
        raise ValueError("Select an available preset before optimizing the prompt.")
    entry = catalog[name]
    content, status = topbar._read_preset_content_with_status(name, state.get("user_did"))
    if status.get("load_status") != "ready":
        raise ValueError("The selected preset could not be read.")
    engine = copy.deepcopy(content.get("default_engine") or {})
    scene = engine.get("scene_frontend")
    runtime = node.get("runtime") or {}
    schema = entry.get("schema") or {}
    theme = str(runtime.get("scene_theme") or schema.get("default_theme") or "")
    themes = schema.get("per_theme") or {}
    if themes and theme not in themes:
        raise ValueError("The selected preset function changed. Select it again.")
    info = themes.get(theme) or {}
    params = node.get("params") or {}
    next_state = {
        **state, "__preset": name, "preset": name,
        "engine": entry.get("backend_engine") or engine.get("backend_engine") or "",
        "backend_engine": entry.get("backend_engine") or engine.get("backend_engine") or "",
        "engine_type": entry.get("engine_type") or "image",
        "task_method": info.get("task_method") or entry.get("task_method") or "",
        "scene_theme": theme, "__is_scene_frontend": isinstance(scene, dict),
        "__preset_prepared": {"preset": name, "engine": engine},
    }
    if isinstance(scene, dict):
        next_state["scene_frontend"] = scene
        readonly = scene.get("disinteractive") or []
        if "prompt" in readonly or "positive_prompt" in readonly:
            raise ValueError("The prompt is read-only for this preset function.")
    if any(p.get("key") == "prompt" and p.get("interactive") is False
           for p in (info.get("params") or schema.get("params") or [])):
        raise ValueError("The prompt is read-only for this preset function.")
    models = node.get("models_config") or {}
    selected_models = {**(entry.get("models_config") or {}), **(models.get("defaults") or {}),
                       **(models.get("overrides") or {})}
    for key in ("base_model", "clip_model"):
        if isinstance(selected_models.get(key), str):
            next_state[key] = selected_models[key]
    resources = {key: copy.deepcopy(params[key]) for key in (
        "scene_video_duration", "scene_additional_prompt", "scene_additional_prompt_2",
    ) if key in params}
    return next_state, resources


def _input_media(payload, state, resources):
    from modules import canvas_workbench_assets, prompt_actions

    images = {}
    node = payload.get("preset_node") or {}
    sources = {**(node.get("upload_slot_sources") or {}), **(payload.get("asset_sources") or {})}
    media_slots = {"scene_video", "scene_audio", "scene_audio2", "scene_audio3",
                   "scene_reference_video", "scene_reference_video2"}
    for slot, source in sources.items():
        if slot not in prompt_actions.PROMPT_ACTION_SCENE_IMAGE_SLOTS and slot not in media_slots:
            continue
        resolved = canvas_workbench_assets.materialize_node_asset(payload.get("project_id") or "default", state, source)
        asset = resolved.get("asset_ref") or {}
        path = asset.get("path")
        if not resolved.get("ok") or not path:
            raise ValueError("A connected media input could not be read. Reconnect it and retry.")
        if slot in prompt_actions.PROMPT_ACTION_SCENE_IMAGE_SLOTS:
            images[slot] = path
            mask = resolved.get("mask_ref") or {}
            if slot == "scene_canvas_image" and mask.get("path"):
                images[slot] = {"image": path, "mask": mask["path"]}
        else:
            resources[slot] = path
    return images


def run_canvas_prompt_action(payload, state, *, runner=None):
    from modules.access_mode import user_can_generate

    original = str(payload.get("text") or "")
    action_id = str(payload.get("action_id") or "smart_expand")
    result = {"ok": False, "text": original, "action_id": action_id}
    if action_id != "smart_expand":
        return {**result, "error": "Unknown prompt action."}
    if not user_can_generate(state.get("user_did") or ""):
        return {**result, "error": "The current identity is not allowed to use the Agent."}
    if not original.strip():
        return {**result, "error": "Enter a prompt before optimizing it."}
    try:
        context, resources = _preset_context(payload.get("preset_node") or {}, state)
        images = _input_media(payload, context, resources)
        if runner is None:
            from enhanced.vlm import vlm
            runner = vlm.run_prompt_action
        options = {"language": context.get("__lang") or "en", "use_scene_agent_prompt": True,
                   "use_video": bool(resources.get("scene_video"))}
        response = runner("smart_expand", original, "Expand the following prompt to add more detail:", images, context, options=options,
                          scene_resources=resources)
        if not isinstance(response, dict) or not response.get("ok") or not str(response.get("text") or "").strip():
            error = response.get("error") if isinstance(response, dict) else None
            return {**result, "error": error or "The model returned no prompt text. Please retry or use the original prompt."}
        return response
    except (ValueError, OSError) as error:
        return {**result, "error": str(error)}
