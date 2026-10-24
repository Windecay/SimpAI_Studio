"""Portable audiovisual cards and recovery from identity-owned local backups."""

import base64
import copy
import hashlib
import json
from pathlib import Path

from modules import visual_character_library as library
from modules.visual_character_voice import normalize_voice


SCHEMA = "simpai.audiovisual.character.archive"
MAX_ARCHIVE_BYTES = 80 * 1024 * 1024
MAX_MEDIA_BYTES = 20 * 1024 * 1024
MIMES = {"image/png", "image/jpeg", "image/webp", "audio/wav", "audio/x-wav",
         "audio/mpeg", "audio/ogg", "audio/flac", "audio/mp4"}
TEXT_FIELDS = {"name": 200, "appearance": 12000, "image_prompt": 12000, "image_preset": 200,
               "image_edit_preset": 200, "personality": 4000, "voice_description": 4000,
               "image_source_asset_id": 100, "source_roleplay_id": 200,
               "folder_name": library.MAX_FOLDER_NAME}


def _service(service):
    if service is None:
        from modules import canvas_workbench_assets
        return canvas_workbench_assets
    return service


def _state(user_did):
    return {"user_did": user_did, "__user_did": user_did}


def _character(source):
    if not isinstance(source, dict) or source.get("schema") != library.SCHEMA:
        raise ValueError("invalid_character_archive")
    card = {}
    for key, limit in TEXT_FIELDS.items():
        value = source.get(key) or ""
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError("invalid_character_archive")
        card[key] = value.strip()
    if not card["name"]:
        raise ValueError("character_name_required")
    card["voice"] = normalize_voice(source.get("voice"))
    card["image_mode"] = source.get("image_mode") if source.get("image_mode") in ("text", "reference") else "text"
    return card


def _parse(value):
    if isinstance(value, str):
        if len(value.encode("utf-8")) > MAX_ARCHIVE_BYTES:
            raise ValueError("character_archive_too_large")
        try:
            value = json.loads(value.lstrip("\ufeff"))
        except ValueError:
            raise ValueError("invalid_character_archive") from None
    if not isinstance(value, dict):
        raise ValueError("invalid_character_archive")
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > MAX_ARCHIVE_BYTES:
        raise ValueError("character_archive_too_large")
    if value.get("schema") == SCHEMA:
        if value.get("version") != 1:
            raise ValueError("invalid_character_archive")
        source, media = value.get("character"), value.get("media", [])
    else:
        source, media = value, value.get("media", [])
    card = _character(source)
    if not isinstance(media, list) or len(media) > 12:
        raise ValueError("invalid_character_archive")
    records, ids = [], set()
    for item in media:
        if not isinstance(item, dict) or not library._MEDIA_ID.fullmatch(str(item.get("asset_id") or "")):
            raise ValueError("invalid_character_archive")
        asset_id = item["asset_id"]
        if asset_id in ids:
            raise ValueError("invalid_character_archive")
        ids.add(asset_id)
        record = {key: item.get(key, "") for key in ("asset_id", "name", "mime", "relative_path", "asset_relative_path")}
        if not all(isinstance(item, str) for item in record.values()) or record["mime"] not in MIMES:
            raise ValueError("invalid_character_archive")
        data_url = item.get("data_url")
        if data_url is not None:
            prefix = f"data:{record['mime']};base64,"
            if not isinstance(data_url, str) or not data_url.startswith(prefix):
                raise ValueError("invalid_character_archive")
            encoded = data_url[len(prefix):]
            if len(encoded) > (MAX_MEDIA_BYTES + 2) // 3 * 4:
                raise ValueError("character_archive_too_large")
            try:
                binary = base64.b64decode(encoded, validate=True)
            except ValueError:
                raise ValueError("invalid_character_archive") from None
            if not binary or len(binary) > MAX_MEDIA_BYTES:
                raise ValueError("invalid_character_archive")
            if hashlib.sha256(binary).hexdigest()[:24] != asset_id.split(":")[1]:
                raise ValueError("character_archive_media_mismatch")
            record["data_url"] = data_url
        records.append(record)
    source_ids = source.get("media_ids", [record["asset_id"] for record in records])
    if not isinstance(source_ids, list) or source_ids != [record["asset_id"] for record in records]:
        raise ValueError("invalid_character_archive")
    if sum(item["mime"].startswith("image/") for item in records) > 9:
        raise ValueError("too_many_images")
    if sum(item["mime"].startswith("audio/") for item in records) > 3:
        raise ValueError("too_many_audios")
    return card, records


def _existing_media(record, user_did, root, service):
    """Resolve IDs only in this identity. Imported absolute paths and owners are ignored."""
    try:
        ref = library.resolve_media(record["asset_id"], user_did, root)
        if Path(str(ref.get("path") or "")).is_file() and ref.get("mime") == record["mime"]:
            return ref
    except ValueError:
        pass
    folder = Path(service._asset_root("character_library", _state(user_did))[0]).resolve()
    digest = record["asset_id"].split(":")[1]
    candidates = []
    relative = record.get("asset_relative_path") or record.get("relative_path")
    if relative:
        candidates.append(folder / relative)
    candidates.extend((folder / digest[:2]).glob(f"*{digest[:16]}*"))
    for candidate in candidates:
        candidate = candidate.resolve()
        if not candidate.is_relative_to(folder) or not candidate.is_file():
            continue
        if candidate.stat().st_size > MAX_MEDIA_BYTES:
            continue
        if hashlib.sha256(candidate.read_bytes()).hexdigest()[:24] != digest:
            continue
        # This path is obtained by checking current storage and its content hash.
        return {"asset_id": record["asset_id"], "path": str(candidate), "mime": record["mime"],
                "owner": user_did, "name": record["name"], "needs_registration": True}
    return None


def _prepare(value, user_did, root, service):
    card, records = _parse(value)
    missing = []
    for record in records:
        if "data_url" not in record:
            record["existing"] = _existing_media(record, user_did, root, service)
            if record["existing"] is None:
                missing.append({"asset_id": record["asset_id"], "name": record["name"] or record["asset_id"]})
    return card, records, missing


def preview_import(value, user_did, root=None, asset_service=None):
    card, records, missing = _prepare(value, user_did, root, _service(asset_service))
    return {"character": card, "media_count": len(records), "missing_media": missing}


def import_character(value, user_did, root=None, asset_service=None, *, allow_missing_media=False,
                     restore_id=None, restore_revision=None, folder_id=None):
    service = _service(asset_service)
    card, records, missing = _prepare(value, user_did, root, service)
    if missing and allow_missing_media is not True:
        raise ValueError("character_archive_media_missing")
    if folder_id is not None:
        library._folder_fields(folder_id, library._folder_catalog(user_did, root), strict=True)
    mapping, refs = {}, []
    for record in records:
        ref = record.get("existing")
        if "data_url" in record:
            ref = service.save_data_url_asset(record["data_url"], "character_library", _state(user_did),
                                              node_id="visual_character", role="reference")
        elif ref and ref.get("needs_registration"):
            ref = service.register_existing_file_asset(ref["path"], "character_library", _state(user_did),
                                                        node_id="visual_character", role="reference", copy_to_assets=False)
        if not ref:
            if record["asset_id"] in {item["asset_id"] for item in missing}:
                continue
            raise ValueError("asset_registration_failed")
        ref = copy.deepcopy(ref)
        ref["name"] = record["name"][:200]
        ref = library.register_media(ref, user_did, root)
        mapping[record["asset_id"]] = ref["asset_id"]
        if ref["asset_id"] not in {item["asset_id"] for item in refs}:
            refs.append(ref)
    card["media_ids"] = [ref["asset_id"] for ref in refs]
    card["image_source_asset_id"] = mapping.get(card["image_source_asset_id"], "")
    if restore_id:
        card["id"] = restore_id
    with library._LOCK:
        if folder_id is None:
            folder_id = (library.save_folder(card["folder_name"], user_did, root, reuse=True)["id"]
                         if card["folder_name"] else "")
        card["folder_id"] = folder_id
        saved = library.save_character(card, user_did, root, restore_revision=restore_revision)
    return {"character": saved, "missing_media": missing}


def export_character(card_id, user_did, root=None):
    card = library.load_character(card_id, user_did, root)
    if not card:
        raise ValueError("character_not_found")
    return _export_card(card, user_did, root)


def _export_card(card, user_did, root=None):
    portable = {"schema": library.SCHEMA, "version": 1, **_character(card), "media_ids": card["media_ids"]}
    archive = {"schema": SCHEMA, "version": 1, "character": portable, "media": []}
    total = len(json.dumps(archive, ensure_ascii=False).encode("utf-8"))
    for asset_id in card["media_ids"]:
        ref = library.resolve_media(asset_id, user_did, root)
        path = Path(str(ref.get("path") or ""))
        if not path.is_file():
            raise ValueError("character_archive_media_missing")
        if path.stat().st_size > MAX_MEDIA_BYTES:
            raise ValueError("character_archive_too_large")
        binary = path.read_bytes()
        if ref.get("mime") not in MIMES or hashlib.sha256(binary).hexdigest()[:24] != asset_id.split(":")[1]:
            raise ValueError("character_archive_media_mismatch")
        item = {"asset_id": asset_id, "name": str(ref.get("name") or path.name)[:200], "mime": ref["mime"],
                "data_url": f"data:{ref['mime']};base64," + base64.b64encode(binary).decode("ascii")}
        total += len(json.dumps(item, ensure_ascii=False).encode("utf-8")) + 2
        if total > MAX_ARCHIVE_BYTES:
            raise ValueError("character_archive_too_large")
        archive["media"].append(item)
    return archive


def preview_backup(card_id, backup_id, user_did, root=None, asset_service=None):
    card = library.backup_card(card_id, backup_id, user_did, root)
    history = library.history_root(user_did, root) / card_id
    copy_only = (library._card_path(card_id, user_did, root).exists()
                 or (history / "deleted.json").exists())
    return {**preview_import(card, user_did, root, asset_service),
            "restore_mode": "copy" if copy_only else "restore",
            "revision": card["revision"], "updated_at": card.get("updated_at", "")}


def import_backup(card_id, backup_id, user_did, root=None, asset_service=None, *, allow_missing_media=False,
                  folder_id=None):
    with library._LOCK:
        card = library.backup_card(card_id, backup_id, user_did, root)
        preview = preview_backup(card_id, backup_id, user_did, root, asset_service)
        restore_id, revision = None, None
        if preview["restore_mode"] == "restore":
            restore_id = card_id
            revision = max(entry["revision"] for entry in library.backup_entries(user_did, root)
                           if entry["id"] == card_id) + 1
        return import_character(card, user_did, root, asset_service,
                                allow_missing_media=allow_missing_media,
                                restore_id=restore_id, restore_revision=revision, folder_id=folder_id)


def export_backup(card_id, backup_id, user_did, root=None):
    return _export_card(library.backup_card(card_id, backup_id, user_did, root), user_did, root)


def recovery_preview(card_id, user_did, root=None, asset_service=None):
    card = library.recovery_card(card_id, user_did, root)
    if not library._valid_card(card, card_id):
        raise ValueError("character_backup_not_found")
    return card, preview_import(card, user_did, root, asset_service)


def recover_character(card_id, user_did, root=None, asset_service=None, *, allow_missing_media=False,
                      folder_id=None):
    with library._LOCK:
        path = library._card_path(card_id, user_did, root)
        if path.exists():
            raise ValueError("character_id_conflict")
        card, _ = recovery_preview(card_id, user_did, root, asset_service)
        return import_character(card, user_did, root, asset_service,
                                allow_missing_media=allow_missing_media, restore_id=card_id,
                                restore_revision=card["revision"], folder_id=folder_id)
