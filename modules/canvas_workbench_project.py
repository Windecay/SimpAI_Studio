import copy
import json
import os
import re
import shutil
import time
from urllib.parse import unquote

import shared
from modules import canvas_workbench_assets, canvas_workbench_runner
from modules.access_mode import get_access_mode, is_local_mode


PROJECT_SCHEMA = "simpai.canvas.workbench.v1"
PROJECTS_CATALOG = "canvas_workbench/projects"
TEMPLATES_CATALOG = "canvas_workbench/templates"
BACKUPS_DIRNAME = "_backups"


def _safe_id(value, fallback="default"):
    text = str(value or "").strip()
    if not text:
        text = fallback
    text = re.sub(r"[^a-zA-Z0-9_.-]+", "_", text)
    text = text.strip("._-")
    return (text or fallback)[:96]


def _get_user_did(state_params):
    try:
        user = state_params.get("user") if isinstance(state_params, dict) else None
        if user is not None and hasattr(user, "get_did"):
            did = user.get_did()
            if did:
                return did
    except Exception:
        pass
    try:
        if isinstance(state_params, dict):
            did = str(state_params.get("user_did") or "").strip()
            if did:
                return did
    except Exception:
        pass
    try:
        if shared.token is not None:
            return shared.token.get_guest_did()
    except Exception:
        pass
    return "guest"


def _state_params_for_payload(payload, state_params):
    params = dict(state_params) if isinstance(state_params, dict) else {}
    user_context = payload.get("user_context") if isinstance(payload, dict) and isinstance(payload.get("user_context"), dict) else {}
    scope = str(user_context.get("scope") or "").strip().lower()
    user_did = str(user_context.get("user_did") or "").strip()
    if scope and user_did and (scope != "local" or is_local_mode()):
        params["user_did"] = user_did
        params["user_role"] = str(user_context.get("role") or user_context.get("scope") or "multi")
        params["access_mode"] = "local" if scope == "local" else "multi"
    return params


def _project_path(project_id, state_params):
    user_did = _get_user_did(state_params)
    filename = f"{_safe_id(project_id)}.canvas.json"
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            base_dir = shared.token.get_path_in_user_dir(user_did, PROJECTS_CATALOG)
        else:
            base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), PROJECTS_CATALOG)
    except Exception:
        base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), PROJECTS_CATALOG)
    path = os.path.join(base_dir, filename)
    return os.path.abspath(path), user_did


def _user_catalog_path(item_id, state_params, catalog, suffix):
    user_did = _get_user_did(state_params)
    filename = f"{_safe_id(item_id)}{suffix}"
    try:
        if shared.token is not None and hasattr(shared.token, "get_path_in_user_dir"):
            base_dir = shared.token.get_path_in_user_dir(user_did, catalog)
        else:
            base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), catalog)
    except Exception:
        base_dir = os.path.join(shared.path_userhome or "users", str(user_did or "guest"), catalog)
    return os.path.abspath(os.path.join(base_dir, filename)), user_did


def _template_path(template_id, state_params):
    return _user_catalog_path(template_id, state_params, TEMPLATES_CATALOG, ".canvas.json")


def _storage_info(project_id, state_params, path=None, user_did=None):
    if path is None or user_did is None:
        path, user_did = _project_path(project_id, state_params)
    try:
        asset_root, _ = canvas_workbench_assets._asset_root(project_id, state_params)
    except Exception:
        asset_root = ""
    mode = "local" if is_local_mode() else "multi"
    role = "local"
    try:
        if not is_local_mode() and isinstance(state_params, dict):
            role = str(state_params.get("user_role") or state_params.get("access_mode") or get_access_mode() or "multi")
    except Exception:
        role = "multi"
    return {
        "kind": "user_directory",
        "project_id": _safe_id(project_id),
        "scope": mode,
        "owner": str(user_did or "guest"),
        "label": f"{'Local 模式' if mode == 'local' else '多用户模式'} / {str(user_did or 'guest')}",
        "location": "用户目录",
        "path": path,
        "asset_root": asset_root,
    }


def _empty_project(project_id, state_params):
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return {
        "schema": PROJECT_SCHEMA,
        "id": _safe_id(project_id),
        "title": "Untitled Canvas",
        "created_at": now,
        "updated_at": now,
        "viewport": {"x": 80, "y": 80, "zoom": 1},
        "settings": {
            "grid": True,
            "snap": False,
            "minimap": False,
            "edgeLabels": True,
            "reducedMotion": False,
            "inspectorCollapsed": False,
        },
        "groups": [],
        "nodes": [],
        "edges": [],
        "runs": [],
        "storage": _storage_info(project_id, state_params),
    }


def _decode_asset_path_text(value):
    text = str(value or "").strip()
    if text.startswith("/file="):
        text = text[len("/file="):]
    elif text.startswith("/gradio_api/file="):
        text = text[len("/gradio_api/file="):]
    text = re.split(r"[?#]", text, 1)[0]
    return re.sub(r"/+", "/", unquote(text).replace("\\", "/"))


def _infer_project_asset_relative_path(value):
    text = _decode_asset_path_text(value)
    marker = "/canvas_workbench/assets/"
    marker_index = text.find(marker)
    if marker_index < 0:
        return ""
    tail = text[marker_index + len(marker):].lstrip("/")
    parts = tail.split("/", 1)
    if len(parts) < 2:
        return ""
    rel = parts[1].strip().replace("\\", "/").lstrip("/")
    if not rel or ".." in rel.split("/"):
        return ""
    return rel


def _normalize_asset_reference(asset):
    if not isinstance(asset, dict):
        return
    rel = str(asset.get("asset_relative_path") or asset.get("relative_path") or "").strip().replace("\\", "/").lstrip("/")
    if not rel:
        for key in ("path", "output_path", "original_output_path", "preview_url", "thumb"):
            rel = _infer_project_asset_relative_path(asset.get(key))
            if rel:
                break
    if not rel:
        return
    asset.setdefault("asset_relative_path", rel)
    asset.setdefault("relative_path", rel)
    asset.setdefault("asset_root_key", "project_asset_root")
    thumb = str(asset.get("thumb") or "")
    if "/canvas_workbench/assets/" in _decode_asset_path_text(thumb):
        asset.pop("thumb", None)


def _normalize_project_asset_references(project):
    for node in project.get("nodes") or []:
        if not isinstance(node, dict):
            continue
        _normalize_asset_reference(node.get("asset"))
        _normalize_asset_reference(node.get("preview"))
        for asset in node.get("assets") or []:
            _normalize_asset_reference(asset)
        for asset in node.get("preview_frames") or []:
            _normalize_asset_reference(asset)
        chat = node.get("chat") if isinstance(node.get("chat"), dict) else {}
        for message in chat.get("messages") or []:
            if not isinstance(message, dict):
                continue
            for image in message.get("images") or []:
                _normalize_asset_reference(image)
    for run in project.get("runs") or []:
        if not isinstance(run, dict):
            continue
        _normalize_asset_reference(run.get("asset"))
        _normalize_asset_reference(run.get("preview"))
        for asset in run.get("assets") or []:
            _normalize_asset_reference(asset)
        for asset in run.get("preview_frames") or []:
            _normalize_asset_reference(asset)


def _sanitize_project(project, project_id, state_params, path=None, user_did=None, touch_updated=True):
    if not isinstance(project, dict):
        project = _empty_project(project_id, state_params)
    project = copy.deepcopy(project)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    project["schema"] = str(project.get("schema") or PROJECT_SCHEMA)
    project["id"] = _safe_id(project.get("id") or project_id)
    project["title"] = str(project.get("title") or "Untitled Canvas")
    project.setdefault("created_at", now)
    if touch_updated:
        project["updated_at"] = now
    else:
        project["updated_at"] = str(project.get("updated_at") or project.get("modified_at") or project.get("created_at") or now)
    if not isinstance(project.get("viewport"), dict):
        project["viewport"] = {"x": 80, "y": 80, "zoom": 1}
    if not isinstance(project.get("settings"), dict):
        project["settings"] = {}
    for key in ("groups", "nodes", "edges", "runs"):
        if not isinstance(project.get(key), list):
            project[key] = []
    _normalize_project_asset_references(project)
    project["storage"] = _storage_info(project["id"], state_params, path=path, user_did=user_did)
    return project


def save_project(payload, state_params):
    project_id = _safe_id(payload.get("project_id") or "default") if isinstance(payload, dict) else "default"
    project = payload.get("project") if isinstance(payload, dict) else None
    backup_existing = bool(payload.get("backup_existing")) if isinstance(payload, dict) else False
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, user_did = _project_path(project_id, effective_state_params)
    project = _sanitize_project(project, project_id, effective_state_params, path=path, user_did=user_did)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    backup_path = None
    if backup_existing and os.path.exists(path):
        backups_dir = os.path.join(os.path.dirname(path), BACKUPS_DIRNAME)
        os.makedirs(backups_dir, exist_ok=True)
        timestamp = time.strftime("%Y%m%d-%H%M%S", time.localtime())
        backup_name = f"{_safe_id(project_id)}.{timestamp}.canvas.json"
        backup_path = os.path.abspath(os.path.join(backups_dir, backup_name))
        if os.path.exists(backup_path):
            backup_path = os.path.abspath(os.path.join(
                backups_dir,
                f"{_safe_id(project_id)}.{timestamp}.{int(time.time() * 1000) % 1000:03d}.canvas.json",
            ))
        shutil.copy2(path, backup_path)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(project, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, path)
    result = {"ok": True, "project": project, "storage": project["storage"]}
    if backup_path:
        result["backup_path"] = backup_path
    return result


def load_project(payload, state_params):
    project_id = _safe_id(payload.get("project_id") or "default") if isinstance(payload, dict) else "default"
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, user_did = _project_path(project_id, effective_state_params)
    if not os.path.exists(path):
        project = _empty_project(project_id, effective_state_params)
        project["storage"] = _storage_info(project_id, effective_state_params, path=path, user_did=user_did)
        return {"ok": True, "found": False, "project": project, "storage": project["storage"]}
    with open(path, "r", encoding="utf-8") as f:
        raw_project = json.load(f)
    project = _sanitize_project(raw_project, project_id, effective_state_params, path=path, user_did=user_did, touch_updated=False)
    try:
        raw_for_compare = copy.deepcopy(raw_project) if isinstance(raw_project, dict) else {}
        raw_for_compare["updated_at"] = project.get("updated_at")
        raw_for_compare["storage"] = project.get("storage")
        if raw_for_compare != project:
            tmp_path = f"{path}.tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(project, f, ensure_ascii=False, separators=(",", ":"))
            os.replace(tmp_path, path)
    except Exception:
        pass
    return {"ok": True, "found": True, "project": project, "storage": project["storage"]}


def clear_project(payload, state_params):
    project_id = _safe_id(payload.get("project_id") or "default") if isinstance(payload, dict) else "default"
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, user_did = _project_path(project_id, effective_state_params)
    project = _empty_project(project_id, effective_state_params)
    project["storage"] = _storage_info(project_id, effective_state_params, path=path, user_did=user_did)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(project, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp_path, path)
    return {"ok": True, "project": project, "storage": project["storage"]}


def list_projects(payload, state_params):
    project_id = _safe_id(payload.get("project_id") or "default") if isinstance(payload, dict) else "default"
    effective_state_params = _state_params_for_payload(payload, state_params)
    sample_path, user_did = _project_path(project_id, effective_state_params)
    projects_dir = os.path.dirname(sample_path)
    os.makedirs(projects_dir, exist_ok=True)
    items = []
    for name in sorted(os.listdir(projects_dir)):
        if not name.endswith(".canvas.json"):
            continue
        path = os.path.join(projects_dir, name)
        try:
            stat = os.stat(path)
        except Exception:
            continue
        items.append({
            "project_id": name[:-len(".canvas.json")],
            "name": name,
            "path": os.path.abspath(path),
            "updated_at": stat.st_mtime,
            "size": stat.st_size,
        })
    items.sort(key=lambda item: item.get("updated_at") or 0, reverse=True)
    return {
        "ok": True,
        "projects": items,
        "storage": _storage_info(project_id, effective_state_params, path=sample_path, user_did=user_did),
    }


def delete_project(payload, state_params):
    project_id = _safe_id(payload.get("project_id") or "default") if isinstance(payload, dict) else "default"
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, user_did = _project_path(project_id, effective_state_params)
    projects_dir = os.path.realpath(os.path.dirname(path))
    real_path = os.path.realpath(path)
    if os.path.commonpath([projects_dir, real_path]) != projects_dir:
        raise ValueError("Project path is outside the project directory")
    existed = os.path.exists(real_path)
    if existed:
        os.remove(real_path)

    assets_deleted = False
    asset_root = ""
    if isinstance(payload, dict) and bool(payload.get("delete_assets")):
        asset_root, _ = canvas_workbench_assets._asset_root(project_id, effective_state_params)
        real_asset_root = os.path.realpath(asset_root)
        real_asset_parent = os.path.realpath(os.path.dirname(asset_root))
        if os.path.commonpath([real_asset_parent, real_asset_root]) != real_asset_parent:
            raise ValueError("Asset path is outside the canvas asset directory")
        if os.path.isdir(real_asset_root):
            shutil.rmtree(real_asset_root)
            assets_deleted = True

    return {
        "ok": True,
        "project_id": project_id,
        "deleted": existed,
        "path": real_path,
        "assets_deleted": assets_deleted,
        "asset_root": asset_root,
        "storage": _storage_info(project_id, effective_state_params, path=real_path, user_did=user_did),
    }


def _template_manifest_item(template_id, project, path):
    metadata = project.get("template") if isinstance(project.get("template"), dict) else {}
    stat = os.stat(path) if os.path.exists(path) else None
    category = str(metadata.get("category") or "starter").strip().lower()
    if category not in ("starter", "image", "video", "audio"):
        category = "starter"
    tags = metadata.get("tags")
    if not isinstance(tags, list):
        tags = []
    return {
        "id": _safe_id(template_id),
        "title": metadata.get("title") or project.get("title") or _safe_id(template_id),
        "description": metadata.get("description") or "",
        "category": category,
        "tags": [str(tag).strip() for tag in tags if str(tag).strip()],
        "type_label": metadata.get("type_label") or "User template",
        "model_dependency": metadata.get("model_dependency") if isinstance(metadata.get("model_dependency"), dict) else {},
        "path": f"user:{_safe_id(template_id)}",
        "preview": metadata.get("preview") or "",
        "source": "user",
        "updated_at": stat.st_mtime if stat else None,
        "size": stat.st_size if stat else 0,
        "file_path": os.path.abspath(path),
    }


def _sanitize_template_project(project, template_id, metadata):
    if not isinstance(project, dict):
        project = {}
    project = copy.deepcopy(project)
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    project["schema"] = str(project.get("schema") or PROJECT_SCHEMA)
    project["id"] = _safe_id(template_id)
    project["title"] = str(metadata.get("title") or project.get("title") or _safe_id(template_id))
    project["created_at"] = str(project.get("created_at") or now)
    project["updated_at"] = now
    if not isinstance(project.get("viewport"), dict):
        project["viewport"] = {"x": 80, "y": 80, "zoom": 1}
    if not isinstance(project.get("settings"), dict):
        project["settings"] = {}
    project["settings"]["__template_source"] = "user"
    for key in ("groups", "nodes", "edges", "runs"):
        if not isinstance(project.get(key), list):
            project[key] = []
    project.pop("storage", None)
    project["template"] = {
        "id": _safe_id(template_id),
        "title": str(metadata.get("title") or project.get("title") or _safe_id(template_id)),
        "description": str(metadata.get("description") or ""),
        "category": str(metadata.get("category") or "starter"),
        "tags": list(metadata.get("tags") or []),
        "type_label": str(metadata.get("type_label") or "User template"),
        "model_dependency": copy.deepcopy(metadata.get("model_dependency") or {}),
        "preview": str(metadata.get("preview") or ""),
        "saved_at": now,
    }
    return project


def save_template(payload, state_params):
    template_id = _safe_id(payload.get("template_id") or payload.get("id") or "template") if isinstance(payload, dict) else "template"
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, _user_did = _template_path(template_id, effective_state_params)
    metadata = {
        "title": str(payload.get("title") or template_id) if isinstance(payload, dict) else template_id,
        "description": str(payload.get("description") or "") if isinstance(payload, dict) else "",
        "category": str(payload.get("category") or "starter").strip().lower() if isinstance(payload, dict) else "starter",
        "tags": payload.get("tags") if isinstance(payload, dict) and isinstance(payload.get("tags"), list) else [],
        "type_label": str(payload.get("type_label") or "User template") if isinstance(payload, dict) else "User template",
        "preview": str(payload.get("preview") or "") if isinstance(payload, dict) else "",
        "model_dependency": payload.get("model_dependency") if isinstance(payload, dict) and isinstance(payload.get("model_dependency"), dict) else {},
    }
    if metadata["category"] not in ("starter", "image", "video", "audio"):
        metadata["category"] = "starter"
    project = _sanitize_template_project(payload.get("project") if isinstance(payload, dict) else {}, template_id, metadata)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(project, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)
    return {
        "ok": True,
        "template": _template_manifest_item(template_id, project, path),
        "project": project,
    }


def list_templates(payload, state_params):
    effective_state_params = _state_params_for_payload(payload, state_params)
    sample_path, user_did = _template_path("sample", effective_state_params)
    templates_dir = os.path.dirname(sample_path)
    os.makedirs(templates_dir, exist_ok=True)
    items = []
    for name in sorted(os.listdir(templates_dir)):
        if not name.endswith(".canvas.json"):
            continue
        path = os.path.join(templates_dir, name)
        try:
            with open(path, "r", encoding="utf-8") as f:
                project = json.load(f)
        except Exception:
            continue
        template_id = name[:-len(".canvas.json")]
        items.append(_template_manifest_item(template_id, project if isinstance(project, dict) else {}, path))
    items.sort(key=lambda item: item.get("updated_at") or 0, reverse=True)
    return {
        "ok": True,
        "templates": items,
        "storage": {
            "kind": "user_directory",
            "scope": "local" if is_local_mode() else "multi",
            "owner": str(user_did or "guest"),
            "location": "用户目录",
            "path": templates_dir,
        },
    }


def load_template(payload, state_params):
    template_id = _safe_id(payload.get("template_id") or payload.get("id") or "") if isinstance(payload, dict) else ""
    if not template_id:
        return {"ok": False, "error": "Missing template_id"}
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, _user_did = _template_path(template_id, effective_state_params)
    if not os.path.exists(path):
        return {"ok": False, "error": "Template not found", "template_id": template_id}
    with open(path, "r", encoding="utf-8") as f:
        project = json.load(f)
    if not isinstance(project, dict):
        return {"ok": False, "error": "Template file is not an object", "template_id": template_id}
    project.pop("storage", None)
    return {
        "ok": True,
        "template_id": template_id,
        "project": project,
        "template": _template_manifest_item(template_id, project, path),
    }


def delete_template(payload, state_params):
    template_id = _safe_id(payload.get("template_id") or payload.get("id") or "") if isinstance(payload, dict) else ""
    if not template_id:
        return {"ok": False, "error": "Missing template_id"}
    effective_state_params = _state_params_for_payload(payload, state_params)
    path, user_did = _template_path(template_id, effective_state_params)
    templates_dir = os.path.realpath(os.path.dirname(path))
    real_path = os.path.realpath(path)
    if os.path.commonpath([templates_dir, real_path]) != templates_dir:
        raise ValueError("Template path is outside the template directory")
    existed = os.path.exists(real_path)
    if existed:
        os.remove(real_path)
    return {
        "ok": True,
        "template_id": template_id,
        "deleted": existed,
        "path": real_path,
        "storage": {
            "kind": "user_directory",
            "scope": "local" if is_local_mode() else "multi",
            "owner": str(user_did or "guest"),
            "location": "用户目录",
            "path": templates_dir,
        },
    }


def handle_bridge_request(payload_text, state_params):
    request_id = ""
    try:
        payload = json.loads(payload_text or "{}")
        if not isinstance(payload, dict):
            payload = {}
        request_id = str(payload.get("request_id") or "")
        action = str(payload.get("action") or "").strip()
        data = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
        if action == "save_project":
            result = save_project(data, state_params)
        elif action == "load_project":
            result = load_project(data, state_params)
        elif action == "clear_project":
            result = clear_project(data, state_params)
        elif action == "list_projects":
            result = list_projects(data, state_params)
        elif action == "delete_project":
            result = delete_project(data, state_params)
        elif action == "save_template":
            result = save_template(data, state_params)
        elif action == "list_templates":
            result = list_templates(data, state_params)
        elif action == "load_template":
            result = load_template(data, state_params)
        elif action == "delete_template":
            result = delete_template(data, state_params)
        elif action == "list_assets":
            result = canvas_workbench_assets.list_project_assets(data.get("project_id") or "default", state_params, data)
        elif action == "delete_assets":
            result = canvas_workbench_assets.delete_project_assets(data.get("project_id") or "default", state_params, data.get("paths") or [])
        elif action == "dry_run_node":
            result = canvas_workbench_runner.dry_run_node(data, state_params)
        else:
            result = {"ok": False, "error": f"Unknown canvas action: {action}"}
        result["request_id"] = request_id
        result["action"] = action
        return json.dumps(result, ensure_ascii=False)
    except Exception as err:
        return json.dumps({
            "ok": False,
            "request_id": request_id,
            "error": f"{type(err).__name__}: {err}",
        }, ensure_ascii=False)
