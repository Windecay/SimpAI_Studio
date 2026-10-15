"""Portable roleplay starting configurations, separate from played stories."""

from __future__ import annotations

import base64
import copy
import io
import json
import re
import threading
import uuid
from pathlib import Path

from modules import vlm_roleplay as rp
from modules import vlm_roleplay_outline as outline

SCHEMA = "simpai.vlm_roleplay.story_pack"
VERSION = 1
MAX_BYTES = 48 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGES = 40
MAX_PACKS = 200
_LOCK = threading.RLock()
_ID = re.compile(r"^story_pack_[a-f0-9]{32}$")
_IMAGE = re.compile(r"^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$")
_RUNTIME_FIELDS = (
    "location", "appearance", "state_text", "state_fields", "condition",
    "emotion", "current_action", "inventory", "goals", "current_appearance_asset_ids",
)
_TAVERN_FIELDS = (
    "system_prompt", "post_history_instructions", "alternate_greetings", "group_only_greetings",
)


def _runtime(value, *, player=False):
    source = rp._normalize_player_state(value) if player else rp._normalize_character_runtime(value)
    result = {key: copy.deepcopy(source[key]) for key in _RUNTIME_FIELDS if key in source}
    if player:
        result["status"] = source["status"]
    return result


def _world(value):
    # Removing activation restrictions could expose lore at the wrong time.
    return rp.normalize_world_book(value)


def settings_from_session(value):
    session = rp.normalize_roleplay_session(value)
    characters = {}
    for key, source in session["characters"].items():
        if not source.get("name") and not any(source.get(field) for field in ("identity", "appearance", "first_message")):
            continue
        card = copy.deepcopy(source)
        card["state_image_history"] = []
        tavern = source.get("import_metadata", {}).get("tavern", {})
        card["import_metadata"] = {"tavern": {
            field: copy.deepcopy(tavern[field]) for field in _TAVERN_FIELDS if field in tavern
        }}
        card["world_book"] = _world(card.get("world_book"))
        characters[key] = card
    if not characters:
        raise ValueError("story_pack_character_required")
    active = session["active_character_id"]
    if active not in characters:
        active = next(iter(characters))
    scene = copy.deepcopy(session["story_state"]["scene"])
    scene.pop("id", None)
    scene["present_character_ids"] = [
        key for key in scene["present_character_ids"] if key in characters
    ]
    plan = session["story_outline"]
    fresh_outline = outline.normalize({
        key: copy.deepcopy(plan[key]) for key in ("enabled", "title", "source", "nodes")
    }, characters)
    return {
        "characters": characters, "active_character_id": active,
        "persona": copy.deepcopy(session["persona"]),
        "scene": scene,
        "player_state": _runtime(session["story_state"]["player_state"], player=True),
        "character_states": {
            key: _runtime(session["story_state"]["characters"].get(key, {})) for key in characters
        },
        "scene_reference_asset_ids": copy.deepcopy(session["visual_config"]["reference_asset_ids"]),
        "world_book": _world(session["world_book"]),
        "story_outline": fresh_outline,
        "director_config": copy.deepcopy(session["director_config"]),
    }


def _session_from_settings(settings):
    characters = rp._dict(settings.get("characters"))
    active = settings.get("active_character_id")
    return {
        "character": characters.get(active) or next(iter(characters.values()), {}),
        "characters": characters, "active_character_id": active,
        "persona": settings.get("persona"),
        "story_state": {
            "scene": settings.get("scene"), "player_state": settings.get("player_state"),
            "characters": settings.get("character_states"),
        },
        "world_book": settings.get("world_book"), "story_outline": settings.get("story_outline"),
        "director_config": settings.get("director_config"),
        "visual_config": {"reference_asset_ids": settings.get("scene_reference_asset_ids", [])},
    }


def image_ids(settings):
    ids = list(settings.get("scene_reference_asset_ids", []))
    ids.extend(settings.get("persona", {}).get("reference_asset_ids", []))
    for key, card in settings.get("characters", {}).items():
        ids.extend([card.get("avatar_asset_id"), *card.get("reference_asset_ids", [])])
        ids.extend(settings.get("character_states", {}).get(key, {}).get("current_appearance_asset_ids", []))
    return list(dict.fromkeys(str(value) for value in ids if value))


def remap_images(settings, mapping):
    result = copy.deepcopy(settings)
    result["scene_reference_asset_ids"] = [mapping[key] for key in result["scene_reference_asset_ids"] if key in mapping]
    persona = result["persona"]
    persona["reference_asset_ids"] = [mapping[key] for key in persona["reference_asset_ids"] if key in mapping]
    for key, card in result["characters"].items():
        card["avatar_asset_id"] = mapping.get(card.get("avatar_asset_id"), "")
        card["reference_asset_ids"] = [mapping[value] for value in card["reference_asset_ids"] if value in mapping]
        runtime = result["character_states"][key]
        runtime["current_appearance_asset_ids"] = [
            mapping[value] for value in runtime.get("current_appearance_asset_ids", []) if value in mapping
        ]
    return result


def _images(raw, required):
    from PIL import Image

    if len(required) > MAX_IMAGES:
        raise ValueError("story_pack_too_many_images")
    assets = raw if isinstance(raw, dict) else {}
    result = {}
    for key in required:
        source = assets.get(key)
        if not isinstance(source, dict):
            raise ValueError("story_pack_images_missing")
        text = source.get("data_url")
        if not isinstance(text, str) or len(text) > MAX_IMAGE_BYTES * 4 // 3 + 1024:
            raise ValueError("story_pack_image_too_large")
        match = _IMAGE.fullmatch(text)
        if not match:
            raise ValueError("story_pack_invalid_image")
        try:
            binary = base64.b64decode(match[2], validate=True)
            if len(binary) > MAX_IMAGE_BYTES:
                raise ValueError("story_pack_image_too_large")
            with Image.open(io.BytesIO(binary)) as image:
                if image.format != {"png": "PNG", "jpeg": "JPEG", "webp": "WEBP"}[match[1]] or image.width * image.height > 80_000_000:
                    raise ValueError("story_pack_invalid_image")
                image.verify()
            with Image.open(io.BytesIO(binary)) as image:
                image.draft("RGB", (160, 200))
                image.thumbnail((160, 200))
                preview = io.BytesIO()
                image.convert("RGBA").save(preview, format="PNG")
        except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
            if str(error).startswith("story_pack_"):
                raise
            raise ValueError("story_pack_invalid_image") from error
        result[key] = {
            "name": rp._text(source.get("name"), 160) or key,
            "mime": "image/" + match[1], "data_url": text,
            "thumbnail_url": "data:image/png;base64," + base64.b64encode(preview.getvalue()).decode("ascii"),
        }
    return result


def normalize_pack(value, *, include_images=True):
    if not isinstance(value, dict):
        raise ValueError("story_pack_invalid")
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_BYTES:
        raise ValueError("story_pack_too_large")
    if value.get("schema") not in (None, SCHEMA) or value.get("version", VERSION) != VERSION:
        raise ValueError("story_pack_invalid")
    settings = value.get("settings")
    raw_session = _session_from_settings(settings) if isinstance(settings, dict) else rp._dict(value.get("session"))
    configured = set(rp._dict(raw_session.get("characters")))
    for node in rp._list(rp._dict(raw_session.get("story_outline")).get("nodes"), outline.MAX_NODES):
        if isinstance(node, dict) and isinstance(node.get("briefs"), dict) and any(key not in configured for key in node["briefs"]):
            raise ValueError("story_pack_unknown_character")
    settings = settings_from_session(raw_session)
    if not include_images:
        settings = remap_images(settings, {})
    assets = _images(value.get("assets"), image_ids(settings))
    mapping = {key: f"pack_image_{index + 1}" for index, key in enumerate(assets)}
    settings = remap_images(settings, mapping)
    name = rp._text(value.get("name"), 120)
    if not name:
        raise ValueError("story_pack_name_required")
    result = {
        "schema": SCHEMA, "version": VERSION,
        "id": value.get("id") if isinstance(value.get("id"), str) and _ID.fullmatch(value["id"]) else "",
        "name": name, "description": rp._text(value.get("description"), 1200),
        "opening": rp._text(value.get("opening"), 12000),
        "suggested_actions": rp._clean_string_list(value.get("suggested_actions"), 6),
        "narration_prompt": rp._text(value.get("narration_prompt"), 12000),
        "settings": settings, "assets": {mapping[key]: asset for key, asset in assets.items()},
        "created_at": rp._text(value.get("created_at"), 80) or rp._now(),
        "updated_at": rp._text(value.get("updated_at"), 80) or rp._now(),
    }
    if len(json.dumps(result, ensure_ascii=False, indent=2).encode("utf-8")) > MAX_BYTES:
        raise ValueError("story_pack_too_large")
    return result


def summary(pack):
    settings = pack["settings"]
    return {
        "id": pack["id"], "name": pack["name"], "description": pack["description"],
        "character_names": [card["name"] for card in settings["characters"].values()],
        "player_name": settings["persona"]["name"],
        "location": settings["scene"]["location"],
        "world_entries": len(settings["world_book"]["entries"]),
        "outline_nodes": len(settings["story_outline"]["nodes"]),
        "image_count": len(pack["assets"]), "updated_at": pack["updated_at"],
    }


def _paths(pack_id, user_did="", root=None):
    if not isinstance(pack_id, str) or not _ID.fullmatch(pack_id):
        raise ValueError("story_pack_invalid_id")
    base = rp.roleplay_user_root(user_did, root) / "story_packs"
    return rp._safe_child(base, pack_id + ".json"), rp._safe_child(base, pack_id + ".meta.json")


def save_pack(value, user_did="", root=None, *, include_images=True):
    pack = normalize_pack(value, include_images=include_images)
    pack["id"] = "story_pack_" + uuid.uuid4().hex
    pack["created_at"] = pack["updated_at"] = rp._now()
    path, meta = _paths(pack["id"], user_did, root)
    with _LOCK:
        if sum(1 for _ in meta.parent.glob("*.meta.json")) >= MAX_PACKS:
            raise ValueError("story_pack_library_full")
        rp._atomic_write_json(path, pack)
        rp._atomic_write_json(meta, summary(pack))
    return pack


def load_pack(pack_id, user_did="", root=None):
    path, _ = _paths(pack_id, user_did, root)
    try:
        with _LOCK:
            if path.stat().st_size > MAX_BYTES:
                raise ValueError("story_pack_too_large")
            return normalize_pack(json.loads(path.read_text(encoding="utf-8")))
    except FileNotFoundError:
        return None


def list_packs(user_did="", root=None):
    base = rp.roleplay_user_root(user_did, root) / "story_packs"
    rows = []
    with _LOCK:
        paths = sorted(base.glob("*.meta.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        for path in paths[:MAX_PACKS]:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                pack_path, _ = _paths(data.get("id"), user_did, root)
                if pack_path.exists():
                    rows.append(data)
            except (OSError, ValueError, TypeError):
                continue
    return rows


def delete_pack(pack_id, user_did="", root=None):
    path, meta = _paths(pack_id, user_did, root)
    with _LOCK:
        if not path.exists():
            return False
        path.unlink()
        meta.unlink(missing_ok=True)
    return True
