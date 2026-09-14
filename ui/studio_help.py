"""Small, public help context. Reading help must not load or scan models."""

import csv
import html


def _strings(value):
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def build_preset_help_context(state, theme=""):
    state = state if isinstance(state, dict) else {}
    scene = state.get("scene_frontend")
    scene = scene if isinstance(scene, dict) else {}
    tasks = _strings(state.get("__preset_supported_tasks"))
    theme_tasks = scene.get("theme_supported_tasks")
    if isinstance(theme_tasks, dict) and theme in theme_tasks:
        tasks = _strings(theme_tasks[theme])
    requirements = state.get("__preset_interaction_requirements")
    labels = scene.get("theme_labels")
    theme_label = labels.get(theme) if isinstance(labels, dict) else None
    if isinstance(theme_label, dict):
        language = str(state.get("__lang") or "en").lower()
        keys = ("cn", "zh", "en") if language.startswith(("cn", "zh")) else ("en",)
        theme_label = next((theme_label[key] for key in keys if theme_label.get(key)), theme)
    files = []
    model_rows = state.get("__preset_model_list_raw")
    for row in model_rows if isinstance(model_rows, (list, tuple)) else []:
        if not isinstance(row, str):
            continue
        columns = next(csv.reader([row]), [])
        if len(columns) > 1 and columns[1] and columns[1] not in files:
            files.append(columns[1])
    return {
        "preset": str(state.get("__preset") or ""),
        "theme": str(theme or ""),
        "theme_label": str(theme_label or theme or ""),
        "tasks": tasks,
        "requirements": _strings(requirements),
        "model_files": files,
    }


def vlm_help_marker(status, version=None, *, api=False):
    status = status if isinstance(status, dict) else {}
    if not status.get("exists"):
        reason = "api_missing" if api else "files_missing"
    elif status.get("vision_status") == "missing":
        reason = "vision_missing"
    else:
        reason = "configured" if api else "files_present"
    version_value = str(version or "").strip()
    version_attr = (
        f' data-studio-help-version="{html.escape(version_value, quote=True)}"'
        if version_value else ""
    )
    return (
        f'<span data-studio-help-notice="{reason}" data-studio-help-source="main"{version_attr}></span>'
    )
