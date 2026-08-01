import copy
import json
import os
import threading
import uuid
from pathlib import Path

import shared
from modules.access_mode import is_local_mode
from modules.custom_llm_api import api_format_supported


CONFIG_FILENAME = ".vlm_api_profiles.json"
PROFILE_VERSION_PREFIX = "custom_api:"
_LOCK = threading.RLock()


def _owner_did():
    token = getattr(shared, "token", None)
    if token is None:
        return None
    try:
        if hasattr(token, "get_admin_did"):
            value = str(token.get_admin_did() or "").strip()
            if value and value != "Unknown":
                return value
    except Exception:
        pass
    for method_name in ("get_default_workspace_did", "get_local_did", "get_guest_did"):
        try:
            if hasattr(token, method_name):
                value = str(getattr(token, method_name)() or "").strip()
                if value and value != "Unknown":
                    return value
        except Exception:
            continue
    return None


def _config_path():
    from enhanced.simpleai import get_path_in_user_dir

    return Path(get_path_in_user_dir(CONFIG_FILENAME, _owner_did()))


def _as_bool(value, default=True):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "no", "off"}
    return bool(value)


def profile_version(profile_id):
    profile_id = str(profile_id or "").strip()
    return f"{PROFILE_VERSION_PREFIX}{profile_id}" if profile_id else ""


def profile_id_from_version(version):
    version = str(version or "").strip()
    if not version.startswith(PROFILE_VERSION_PREFIX):
        return ""
    return version[len(PROFILE_VERSION_PREFIX):].strip()


def is_profile_version(version):
    return bool(profile_id_from_version(version))


def _normalize_item(item):
    item = item if isinstance(item, dict) else {}
    provider = str(item.get("provider") or "custom").strip() or "custom"
    api_format = str(item.get("api_format") or "openai_compatible").strip() or "openai_compatible"
    return {
        "id": str(item.get("id") or uuid.uuid4().hex).strip(),
        "name": str(item.get("name") or item.get("api_name") or "VLM API").strip() or "VLM API",
        "provider": provider,
        "api_format": api_format,
        "base_url": str(item.get("base_url") or "").strip().rstrip("/"),
        "model": str(item.get("model") or "").strip(),
        "api_key": str(item.get("api_key") or "").strip(),
        "supports_images": _as_bool(item.get("supports_images"), True),
    }


def _normalize_data(data):
    data = data if isinstance(data, dict) else {}
    items = []
    seen = set()
    for raw in data.get("items") or []:
        if not isinstance(raw, dict):
            continue
        item = _normalize_item(raw)
        if not item["id"] or item["id"] in seen:
            continue
        seen.add(item["id"])
        items.append(item)
    default_id = str(data.get("default_id") or "").strip()
    if default_id not in seen:
        default_id = items[0]["id"] if items else ""
    return {"default_id": default_id, "items": items}


def load_profiles():
    with _LOCK:
        try:
            data = json.loads(_config_path().read_text(encoding="utf-8"))
        except (OSError, ValueError, TypeError):
            data = {}
        return _normalize_data(data)


def save_profiles(data):
    normalized = _normalize_data(data)
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    with _LOCK:
        temporary.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(temporary, path)
    return copy.deepcopy(normalized)


def can_manage(state=None, user_did=None):
    if is_local_mode():
        return True
    did = str(user_did or "").strip()
    if not did and isinstance(state, dict):
        try:
            user = state.get("user")
            if user is not None and hasattr(user, "get_did"):
                did = str(user.get_did() or "").strip()
        except Exception:
            did = ""
    token = getattr(shared, "token", None)
    if not did or token is None or not hasattr(token, "is_admin"):
        return False
    try:
        return bool(token.is_admin(did))
    except Exception:
        return False


def profile_by_id(profile_id, fallback_default=False):
    profile_id = str(profile_id or "").strip()
    data = load_profiles()
    for item in data["items"]:
        if item["id"] == profile_id:
            return copy.deepcopy(item)
    if fallback_default and data["default_id"]:
        for item in data["items"]:
            if item["id"] == data["default_id"]:
                return copy.deepcopy(item)
    return None


def profile_by_version(version):
    return profile_by_id(profile_id_from_version(version))


def default_profile():
    return profile_by_id("", fallback_default=True)


def upsert_profile(settings, profile_id=None):
    settings = settings if isinstance(settings, dict) else {}
    data = load_profiles()
    requested_id = str(profile_id or settings.get("id") or "").strip()
    requested_name = str(settings.get("name") or settings.get("api_name") or "VLM API").strip() or "VLM API"
    item = _normalize_item(dict(settings, id=requested_id or uuid.uuid4().hex, name=requested_name))
    replaced = False
    items = []
    for existing in data["items"]:
        if existing["id"] == item["id"]:
            items.append(item)
            replaced = True
        else:
            items.append(existing)
    if not replaced:
        items.append(item)
    data["items"] = items
    data["default_id"] = item["id"]
    saved = save_profiles(data)
    return profile_by_id(item["id"]) or next((row for row in saved["items"] if row["id"] == item["id"]), item)


def delete_profile(profile_id):
    profile_id = str(profile_id or "").strip()
    data = load_profiles()
    data["items"] = [item for item in data["items"] if item["id"] != profile_id]
    if data["default_id"] == profile_id:
        data["default_id"] = data["items"][0]["id"] if data["items"] else ""
    return save_profiles(data)


def ensure_legacy_profile(settings):
    settings = settings if isinstance(settings, dict) else {}
    if not str(settings.get("base_url") or "").strip() or not str(settings.get("model") or "").strip():
        return None
    data = load_profiles()
    target_url = str(settings.get("base_url") or "").strip().rstrip("/")
    target_model = str(settings.get("model") or "").strip()
    for item in data["items"]:
        if item["base_url"] == target_url and item["model"] == target_model:
            return copy.deepcopy(item)
    return upsert_profile(settings)


def runtime_settings(profile):
    item = _normalize_item(profile)
    return {
        "api_name": item["name"],
        "provider": item["provider"],
        "api_format": item["api_format"],
        "base_url": item["base_url"],
        "model": item["model"],
        "api_key": item["api_key"],
        "supports_images": item["supports_images"],
    }


def apply_profile_to_params(params, version):
    profile = profile_by_version(version)
    if not profile or not isinstance(params, dict):
        return None
    settings = runtime_settings(profile)
    params.update({
        "custom_profile_id": profile["id"],
        "custom_profile_version": profile_version(profile["id"]),
        "custom_api_name": settings["api_name"],
        "custom_provider": settings["provider"],
        "custom_api_format": settings["api_format"],
        "custom_base_url": settings["base_url"],
        "custom_model": settings["model"],
        "custom_api_key": settings["api_key"],
        "custom_supports_images": settings["supports_images"],
    })
    return profile


def profile_ready(profile):
    item = _normalize_item(profile)
    return bool(item["base_url"] and item["model"] and api_format_supported(item["api_format"]))


def profile_choices():
    return [(item["name"], item["id"]) for item in load_profiles()["items"]]


def public_catalog_item(profile):
    item = _normalize_item(profile)
    version = profile_version(item["id"])
    label = item["name"]
    if item["model"] and item["model"].casefold() not in label.casefold():
        label = f"{label} · {item['model']}"
    return {
        "id": version,
        "label": label,
        "display_label": f"[API] {label}",
        "group": "API",
        "backend": "custom_api",
        "source_catalog": "admin_api",
        "architecture": item["api_format"],
        "capabilities": ["text", "image"] if item["supports_images"] else ["text"],
        "context_window": 32768,
        "installed": profile_ready(item),
        "downloadable": False,
        "recommended": True,
        "expected_files": [],
        "runtime_config": {
            "backend": "custom_api",
            "profile_id": item["id"],
            "profile_name": item["name"],
            "model": item["model"],
            "api_format": item["api_format"],
            "supports_images": item["supports_images"],
        },
        "aliases": [],
    }


def resolve_profile_version(value):
    text = str(value or "").strip()
    if not text:
        return ""
    if is_profile_version(text):
        return text

    normalized = text.lstrip("✓✔⚠⬇↓ \t").strip().casefold()
    matches = []
    for profile in load_profiles()["items"]:
        item = public_catalog_item(profile)
        labels = {
            str(item.get("label") or "").strip().casefold(),
            str(item.get("display_label") or "").strip().casefold(),
        }
        if normalized in labels:
            matches.append(str(item.get("id") or "").strip())
    return matches[0] if len(matches) == 1 else ""


def merge_catalog(catalog, allow_raw_custom=False):
    result = copy.deepcopy(catalog if isinstance(catalog, dict) else {})
    base_items = [item for item in result.get("items") or [] if isinstance(item, dict)]
    custom_id = str(result.get("custom") or "Custom")
    raw_custom = next((item for item in base_items if str(item.get("id") or "") == custom_id), None)
    base_items = [item for item in base_items if str(item.get("id") or "") != custom_id]
    api_items = [public_catalog_item(item) for item in load_profiles()["items"]]
    items = base_items + api_items
    if allow_raw_custom and raw_custom:
        items.append(raw_custom)
    result["items"] = items
    result["choices"] = [item["id"] for item in items if item.get("id")]
    result["labels"] = {item["id"]: item.get("display_label") or item.get("label") or item["id"] for item in items if item.get("id")}
    result["context_windows"] = {item["id"]: int(item.get("context_window") or 8192) for item in items if item.get("id")}
    result["allow_custom"] = bool(allow_raw_custom)
    result["api_profile_count"] = len(api_items)
    return result
