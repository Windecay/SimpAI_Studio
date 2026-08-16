"""Roleplay agent routing for local and API VLM backends.

The router only chooses an inference profile. It does not apply story state
changes, so the existing state_version/action_id protocol remains the single
write path for roleplay state.
"""

from __future__ import annotations

import copy
import re
from typing import Any


ROUTER_SCHEMA = "simpai.vlm_agent_router"
ROUTER_VERSION = 1

ROLE_CHARACTER_REPLY = "character_reply"
ROLE_PLAYER_PROXY = "player_proxy"
ROLE_DIRECTOR_STATE = "director_state"
ROLE_STATE_SUMMARY = "state_summary"
ROLE_VISUAL_DIRECTOR = "visual_director"

ROUTE_ROLES = (
    ROLE_CHARACTER_REPLY,
    ROLE_PLAYER_PROXY,
    ROLE_DIRECTOR_STATE,
    ROLE_STATE_SUMMARY,
    ROLE_VISUAL_DIRECTOR,
)

PROFILE_LOCAL = "local"
PROFILE_API = "api"
PROFILE_MODES = {"auto", PROFILE_LOCAL, PROFILE_API}

_DEFAULT_ROUTE_ORDER = {
    ROLE_CHARACTER_REPLY: ("api_main", "local_main"),
    ROLE_PLAYER_PROXY: ("local_main", "api_main"),
    ROLE_DIRECTOR_STATE: ("api_main", "local_main"),
    ROLE_STATE_SUMMARY: ("local_main", "api_main"),
    ROLE_VISUAL_DIRECTOR: ("api_main", "local_main"),
}


def _text(value: Any, limit: int = 240) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()
    return text[:limit]


def _truthy(value: Any, default: bool = False) -> bool:
    if value is None:
        return bool(default)
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "no", "off"}
    return bool(value)


def _profile_type(value: Any) -> str:
    value = _text(value, 20).lower()
    return PROFILE_API if value in {"api", "cloud", "remote", "custom"} else PROFILE_LOCAL


def normalize_profile(
    value: Any = None,
    *,
    profile_id: str = "",
    profile_type: str = PROFILE_LOCAL,
    include_secret: bool = True,
) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    item_type = _profile_type(source.get("type") or source.get("provider_type") or profile_type)
    result = {
        "id": _text(source.get("id") or profile_id, 80),
        "type": item_type,
        "name": _text(source.get("name") or source.get("label"), 160),
        "version": _text(source.get("version") or source.get("model_version"), 200),
        "provider": _text(source.get("provider") or "custom", 80) or "custom",
        "api_format": _text(source.get("api_format") or "openai_compatible", 80) or "openai_compatible",
        "base_url": _text(source.get("base_url") or source.get("custom_base_url"), 1000).rstrip("/"),
        "model": _text(source.get("model") or source.get("custom_model"), 240),
        "supports_images": _truthy(source.get("supports_images"), True),
    }
    if include_secret:
        result["api_key"] = _text(source.get("api_key") or source.get("custom_api_key"), 4000)
    return result


def _profile_ready(profile: Any) -> bool:
    item = normalize_profile(profile)
    if item["type"] == PROFILE_API:
        return bool(item["base_url"] and item["model"])
    return bool(item["version"])


def _default_profiles(local_version: Any = "", api_profile: Any = None, *, include_secret: bool = True) -> dict[str, dict[str, Any]]:
    local_version = _text(local_version, 200)
    api = normalize_profile(
        api_profile,
        profile_id="api_main",
        profile_type=PROFILE_API,
        include_secret=include_secret,
    )
    api["id"] = "api_main"
    api["type"] = PROFILE_API
    api["name"] = api["name"] or "API"
    local = normalize_profile(
        {"version": local_version, "name": "Local"},
        profile_id="local_main",
        profile_type=PROFILE_LOCAL,
        include_secret=include_secret,
    )
    local["id"] = "local_main"
    local["type"] = PROFILE_LOCAL
    local["name"] = local["name"] or "Local"
    return {"api_main": api, "local_main": local}


def default_agent_routing(
    local_version: Any = "",
    api_profile: Any = None,
    *,
    include_secret: bool = True,
) -> dict[str, Any]:
    profiles = _default_profiles(local_version, api_profile, include_secret=include_secret)
    routes = {}
    for role, (primary, fallback) in _DEFAULT_ROUTE_ORDER.items():
        routes[role] = {
            "mode": "auto",
            "primary": primary,
            "fallback": fallback,
            "fallback_enabled": True,
        }
    return {
        "schema": ROUTER_SCHEMA,
        "version": ROUTER_VERSION,
        "profiles": profiles,
        "routes": routes,
    }


def _normalize_route(value: Any, role: str) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    primary_default, fallback_default = _DEFAULT_ROUTE_ORDER.get(role, ("api_main", "local_main"))
    mode = _text(source.get("mode") or "auto", 20).lower()
    if mode not in PROFILE_MODES:
        mode = "auto"
    primary = _text(source.get("primary") or primary_default, 80)
    fallback = _text(source.get("fallback") or fallback_default, 80)
    return {
        "mode": mode,
        "primary": primary,
        "fallback": fallback,
        "fallback_enabled": _truthy(source.get("fallback_enabled"), True),
    }


def normalize_agent_routing(
    value: Any = None,
    *,
    local_version: Any = "",
    api_profile: Any = None,
    include_secret: bool = True,
) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    defaults = default_agent_routing(
        local_version,
        api_profile,
        include_secret=include_secret,
    )
    profiles = dict(defaults["profiles"])
    raw_profiles = source.get("profiles") if isinstance(source.get("profiles"), dict) else {}
    for profile_id, raw_profile in raw_profiles.items():
        profile_key = _text(profile_id, 80)
        if not profile_key:
            continue
        merged_profile = dict(profiles.get(profile_key) or {})
        if isinstance(raw_profile, dict):
            merged_profile.update(raw_profile)
        profile = normalize_profile(
            merged_profile,
            profile_id=profile_key,
            include_secret=include_secret,
        )
        profile["id"] = profile_key
        profiles[profile_key] = profile
    # Request-scoped API settings are allowed to refresh api_main without
    # persisting the API key in the roleplay session.
    if isinstance(api_profile, dict):
        refreshed = normalize_profile(
            dict(profiles.get("api_main") or {}, **api_profile),
            profile_id="api_main",
            profile_type=PROFILE_API,
            include_secret=include_secret,
        )
        refreshed["id"] = "api_main"
        refreshed["type"] = PROFILE_API
        refreshed["name"] = refreshed["name"] or "API"
        profiles["api_main"] = refreshed
    routes = {}
    raw_routes = source.get("routes") if isinstance(source.get("routes"), dict) else {}
    for role in ROUTE_ROLES:
        routes[role] = _normalize_route(raw_routes.get(role), role)
    return {
        "schema": ROUTER_SCHEMA,
        "version": ROUTER_VERSION,
        "profiles": profiles,
        "routes": routes,
    }


def route_attempts(
    routing: Any,
    role: str,
    *,
    local_version: Any = "",
    api_profile: Any = None,
) -> list[dict[str, Any]]:
    role = _text(role, 80) or ROLE_CHARACTER_REPLY
    normalized = normalize_agent_routing(
        routing,
        local_version=local_version,
        api_profile=api_profile,
        include_secret=True,
    )
    route = normalized["routes"].get(role) or _normalize_route({}, role)
    profiles = normalized["profiles"]
    if route["mode"] == PROFILE_API:
        profile_ids = ["api_main"]
        if route["fallback_enabled"]:
            profile_ids.append(route["fallback"] or "local_main")
    elif route["mode"] == PROFILE_LOCAL:
        profile_ids = ["local_main"]
        if route["fallback_enabled"]:
            profile_ids.append(route["fallback"] or "api_main")
    else:
        profile_ids = [route["primary"]]
        if route["fallback_enabled"]:
            profile_ids.append(route["fallback"])
    attempts = []
    seen = set()
    for index, profile_id in enumerate(profile_ids):
        profile = copy.deepcopy(profiles.get(profile_id) or {})
        if not profile or profile_id in seen or not _profile_ready(profile):
            continue
        seen.add(profile_id)
        attempts.append({
            "role": role,
            "profile": profile,
            "profile_id": profile_id,
            "attempt_index": index,
            "is_fallback": index > 0,
            "mode": route["mode"],
        })
    return attempts


def apply_profile_to_runtime_payload(runtime_payload: Any, profile: Any) -> dict[str, Any]:
    """Return a runtime payload with exactly one selected backend profile."""
    payload = copy.deepcopy(runtime_payload) if isinstance(runtime_payload, dict) else {}
    params = payload.setdefault("params", {})
    selected = normalize_profile(profile, include_secret=True)
    params["agent_profile_id"] = selected.get("id") or ""
    params["agent_profile_type"] = selected.get("type") or PROFILE_LOCAL
    if selected["type"] == PROFILE_API:
        params["version"] = "Custom"
        params["custom_api_name"] = selected.get("name") or "API"
        params["custom_provider"] = selected.get("provider") or "custom"
        params["custom_api_format"] = selected.get("api_format") or "openai_compatible"
        params["custom_base_url"] = selected.get("base_url") or ""
        params["custom_model"] = selected.get("model") or ""
        params["custom_api_key"] = selected.get("api_key") or ""
        params["custom_supports_images"] = bool(selected.get("supports_images", True))
        payload["api_key"] = params["custom_api_key"]
    else:
        params["version"] = selected.get("version") or ""
        for key in (
            "custom_profile_id",
            "custom_profile_version",
            "custom_api_name",
            "custom_provider",
            "custom_api_format",
            "custom_base_url",
            "custom_model",
            "custom_api_key",
            "custom_supports_images",
        ):
            params.pop(key, None)
        payload.pop("api_key", None)
    return payload


def should_try_fallback(result: Any) -> bool:
    if not isinstance(result, dict):
        return True
    if result.get("ok"):
        return False
    if result.get("aborted") or result.get("cancelled"):
        return False
    error = _text(result.get("error") or result.get("details"), 240).lower()
    return not any(token in error for token in ("cancel", "aborted", "state_version_conflict", "branch_conflict"))


def route_summary(routing: Any, *, local_version: Any = "", api_profile: Any = None) -> dict[str, Any]:
    normalized = normalize_agent_routing(
        routing,
        local_version=local_version,
        api_profile=api_profile,
        include_secret=False,
    )
    return {
        "schema": ROUTER_SCHEMA,
        "version": ROUTER_VERSION,
        "routes": copy.deepcopy(normalized["routes"]),
        "profiles": {
            key: {
                "id": value.get("id"),
                "type": value.get("type"),
                "name": value.get("name"),
                "version": value.get("version"),
                "model": value.get("model"),
            }
            for key, value in normalized["profiles"].items()
        },
    }


__all__ = [
    "ROUTER_SCHEMA",
    "ROUTER_VERSION",
    "ROLE_CHARACTER_REPLY",
    "ROLE_PLAYER_PROXY",
    "ROLE_DIRECTOR_STATE",
    "ROLE_STATE_SUMMARY",
    "ROLE_VISUAL_DIRECTOR",
    "ROUTE_ROLES",
    "default_agent_routing",
    "normalize_profile",
    "normalize_agent_routing",
    "route_attempts",
    "apply_profile_to_runtime_payload",
    "should_try_fallback",
    "route_summary",
]
