"""Per-user image tagger selection and explicit downloads of catalogued files."""

import json
import os
import threading
import uuid
from pathlib import Path

import shared
from modules.access_mode import is_local_mode, user_can_download_models
from modules.identity_access import current_user_did
from modules.wd14_models import (
    DEFAULT_MODEL_ID, MODEL_LABELS, default_thresholds, installed_models, model_files, validate_model_id,
    DEFAULT_TAG_CATEGORIES, normalize_tag_categories,
)

SETTING_KEY = "image_tagger_model"
CATEGORIES_KEY = "image_tagger_categories"
_lock = threading.RLock()


def owner_did(state):
    state = state if isinstance(state, dict) else {}
    return current_user_did(state) or str(state.get("user_did") or "")


def _settings_path(state):
    did = owner_did(state)
    if not did:
        raise PermissionError("Sign in to save the image tagger selection")
    return Path(shared.token.get_path_in_user_dir(did, ".image_tagger.json"))


def _read_setting(key, default, state):
    if is_local_mode():
        from enhanced import all_parameters as ads
        with _lock:
            value, found = ads._get_local_setting("user", key)
        return value if found else default
    elif owner_did(state):
        path = _settings_path(state)
        with _lock:
            data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        return data.get(key, default)
    return default


def _save_setting(key, value, state):
    with _lock:
        if is_local_mode():
            from enhanced import all_parameters as ads
            if not ads._set_local_setting("user", key, value):
                raise OSError("Could not save the image tagger settings")
        else:
            path = _settings_path(state)
            path.parent.mkdir(parents=True, exist_ok=True)
            data = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
            data[key] = value
            temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
            try:
                temporary.write_text(json.dumps(data), encoding="utf-8")
                os.replace(temporary, path)
            finally:
                if temporary.exists():
                    temporary.unlink()
    return value


def selected_model(state=None):
    return validate_model_id(_read_setting(SETTING_KEY, DEFAULT_MODEL_ID, state))


def save_model(model_id, state):
    return _save_setting(SETTING_KEY, validate_model_id(model_id), state)


def selected_categories(state=None):
    return normalize_tag_categories(_read_setting(CATEGORIES_KEY, DEFAULT_TAG_CATEGORIES, state))


def save_categories(categories, state):
    return _save_setting(CATEGORIES_KEY, normalize_tag_categories(categories), state)


def model_status(state, model_id=None):
    from modules.config import paths_clip_vision
    from modules import model_loader

    model_id = validate_model_id(model_id) if model_id is not None else selected_model(state)
    models = installed_models(paths_clip_vision)
    selected = next(row for row in models if row["model_id"] == model_id)
    missing_exts = set(selected["missing_files"] + selected["invalid_files"])
    files = model_files(model_id)
    task_ids = {"clip_vision/" + item["path_file"] for item in files}
    tasks = [{key: row.get(key) for key in ("task_id", "file_name", "status", "active", "percent", "error")}
             for row in model_loader.get_download_queue_snapshot() if row.get("task_id") in task_ids]
    can_download = (user_can_download_models(owner_did(state))
                    and not bool(getattr(shared.args, "disable_backend", False)))
    return {**selected, "models": models, "categories": selected_categories(state), "can_download": bool(can_download),
            "missing_models": [item for item in files if item["path_file"].rsplit(".", 1)[1] in missing_exts],
            "download_tasks": tasks, "downloading": any(row.get("active") for row in tasks),
            "threshold": default_thresholds(model_id)[0], "character_threshold": default_thresholds(model_id)[1]}


def download_selected(model_id, state):
    from modules import model_loader

    validate_model_id(model_id)
    if selected_model(state) != model_id:
        raise ValueError("The selected image tagger changed. Refresh the settings before downloading.")
    status = model_status(state, model_id)
    if not status["can_download"]:
        raise PermissionError("Model download is not allowed for the current user")
    for item in status["missing_models"]:
        task = model_loader.download_model_entry(
            item["cata"], item["path_file"], size=item["size"], url=item["url"],
            user_did=owner_did(state), async_task=True,
        )
        if not task:
            raise RuntimeError("Could not queue image tagger download")
    return model_status(state, model_id)


def status_text(status, state):
    cn = isinstance(state, dict) and state.get("__lang") == "cn"
    label = MODEL_LABELS[status["model_id"]]
    if status["ready"]:
        detail = (f"模型已就绪。默认阈值：普通 {status['threshold']}，角色 {status['character_threshold']}。" if cn else
                  f"Model ready. Default thresholds: general {status['threshold']}, character {status['character_threshold']}.")
    elif status["downloading"]:
        detail = "正在下载模型文件。" if cn else "Downloading model files."
        active = [row for row in status["download_tasks"] if row.get("active")]
        detail += " " + "; ".join(f"{row['file_name']}: {float(row.get('percent') or 0):.0f}%" for row in active)
    else:
        detail = ("缺少或未完整下载：" if cn else "Missing or incomplete: ") + ", ".join(
            row["path_file"] for row in status["missing_models"])
        if any(row.get("error") for row in status["download_tasks"]):
            detail += " 下载失败，请重试或查看下载记录。" if cn else " Download failed. Retry or check the download log."
        if not status["can_download"]:
            detail += " 当前身份没有模型下载权限。" if cn else " This identity cannot download models."
    return label + ": " + detail
