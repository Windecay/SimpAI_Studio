"""User-owned audiovisual cards, alongside (not replacing) roleplay cards."""

import copy
import hashlib
import json
import math
import mimetypes
import re
import subprocess
import tempfile
import threading
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

from modules import vlm_roleplay


SCHEMA = "simpai.audiovisual.character"
MEDIA_SCHEMA = "simpai.audiovisual.media"
_LOCK = threading.RLock()
_CARD_ID = re.compile(r"av_[a-f0-9]{32}\Z")
_MEDIA_ID = re.compile(r"(?:asset|file):[a-f0-9]{24}\Z")
SCENE_IMAGE_SLOTS = ("scene_canvas_image",) + tuple(f"scene_input_image{i}" for i in range(1, 9))
SCENE_AUDIO_SLOTS = ("scene_audio", "scene_audio2", "scene_audio3")
SCENE_SLOTS = SCENE_IMAGE_SLOTS + SCENE_AUDIO_SLOTS


class CharacterMediaUnavailable(ValueError):
    def __init__(self, missing_media):
        super().__init__(missing_media[0]["reason"])
        self.missing_media = missing_media


def _now():
    return datetime.now(timezone.utc).isoformat()


def _root(user_did, root=None):
    return vlm_roleplay.roleplay_character_library_root(user_did, root)


def _read(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def _card_path(card_id, user_did, root=None):
    if not _CARD_ID.fullmatch(str(card_id)):
        raise ValueError("invalid_character_id")
    return _root(user_did, root) / f"{card_id}.json"


def backup_root(user_did, root=None):
    return _root(user_did, root).parent.parent / "canvas_workbench" / "assets" / "character_library" / "cards"


def history_root(user_did, root=None):
    return _root(user_did, root).parent.parent / "character_backups" / "history"


def recovery_card(card_id, user_did, root=None):
    _card_path(card_id, user_did, root)
    history = history_root(user_did, root) / card_id
    if (history / "deleted.json").exists():
        return None
    candidates = [_read(backup_root(user_did, root) / f"{card_id}.json")]
    candidates.extend(_read(path) for path in history.glob("*.json"))
    valid = [card for card in candidates if _valid_card(card, card_id)]
    return max(valid, key=lambda card: (card["revision"], card.get("updated_at", "")), default=None)


def backup_entries(user_did, root=None):
    """Offer human-readable versions without exposing filesystem paths as selectors."""
    entries = []
    folder = history_root(user_did, root)
    for directory in folder.glob("av_*"):
        if (not directory.is_dir() or not _CARD_ID.fullmatch(directory.name)
                or not directory.resolve().is_relative_to(folder.resolve())):
            continue
        deleted = (directory / "deleted.json").exists()
        live = _card_path(directory.name, user_did, root).exists()
        for path in directory.glob("*.json"):
            if (not re.fullmatch(r"[a-f0-9]{64}", path.stem)
                    or not path.resolve().is_relative_to(folder.resolve())):
                continue
            card = _read(path)
            if not _valid_card(card, directory.name):
                continue
            entries.append({"id": card["id"], "backup_id": path.stem, "name": card["name"],
                            "revision": card["revision"], "updated_at": card.get("updated_at", ""),
                            "media_count": len(card.get("media", [])), "deleted": deleted, "live": live})
    return sorted(entries, key=lambda item: (item["updated_at"], item["revision"]), reverse=True)


def backup_card(card_id, backup_id, user_did, root=None):
    _card_path(card_id, user_did, root)
    if not re.fullmatch(r"[a-f0-9]{64}", str(backup_id)):
        raise ValueError("character_backup_not_found")
    folder = history_root(user_did, root) / card_id
    path = folder / f"{backup_id}.json"
    if not path.resolve().is_relative_to(history_root(user_did, root).resolve()):
        raise ValueError("character_backup_not_found")
    card = _read(path)
    if not _valid_card(card, card_id):
        raise ValueError("character_backup_not_found")
    return card


def _asset_folder(user_did, root=None):
    if root is not None:
        return _root(user_did, root).parent.parent / "canvas_workbench" / "assets" / "character_library"
    from modules import canvas_workbench_assets as assets
    return Path(assets._asset_root("character_library", {"user_did": user_did})[0])


def _stored_media(ref, user_did, root=None):
    """Persist relocation-safe references, not runtime URLs or absolute paths."""
    from modules import canvas_workbench_assets as assets

    ref = copy.deepcopy(ref)
    ref.pop("unavailable", None)
    ref.pop("unavailable_reason", None)
    folder = _asset_folder(user_did, root).resolve()
    path = str(ref.get("path") or "")
    relative = assets._asset_relative_path(path, folder) if path else ""
    if root is not None and path and not relative:
        return ref
    relative = relative or ref.get("asset_relative_path") or ref.get("relative_path")
    if not relative and path and root is None and Path(path).is_file():
        copied = assets.register_existing_file_asset(
            path, "character_library", {"user_did": user_did},
            node_id="visual_character", role=ref.get("role") or "reference", copy_to_assets=True)
        if not copied or copied.get("copy_error") or not copied.get("asset_relative_path"):
            raise ValueError("asset_registration_failed")
        relative = copied["asset_relative_path"]
    if relative:
        if not assets._project_asset_path_from_relative(relative, folder):
            raise ValueError("invalid_asset_id")
        ref["asset_relative_path"] = ref["relative_path"] = relative
        ref["asset_root_key"] = "project_asset_root"
        ref["project_id"] = "character_library"
    # An explicit offline root cannot relocate external files it does not own.
    if root is None or relative:
        for key in ("path", "asset_root", "output_path", "original_output_path", "preview_url", "data_url"):
            ref.pop(key, None)
    return ref


def _runtime_media(ref, user_did, root=None):
    from modules import canvas_workbench_assets as assets

    result = copy.deepcopy(ref)
    folder = _asset_folder(user_did, root)
    relative = ref.get("asset_relative_path") or ref.get("relative_path")
    path = assets._project_asset_path_from_relative(relative, folder) if relative else ""
    if path and not Path(path).is_file():
        path = ""
    if not path and root is None:
        # Never follow a persisted absolute path into another workspace.
        path = assets._resolve_asset_id_file_path(ref.get("asset_id"), folder)
    if path:
        result.update(path=path, asset_root=str(folder), preview_url=assets._file_preview_url(path))
    elif root is None:
        for key in ("path", "asset_root", "output_path", "original_output_path", "preview_url"):
            result.pop(key, None)
    return result


def _runtime_card(card, user_did, root=None):
    card = copy.deepcopy(card)
    media = []
    for ref in card.get("media", []):
        if root is not None:
            media.append(_runtime_media(ref, user_did, root))
            continue
        try:
            resolved = resolve_media(ref.get("asset_id"), user_did, root)
            if (resolved.get("asset_relative_path") or resolved.get("path")) and not Path(str(resolved.get("path") or "")).is_file():
                raise ValueError("asset_file_missing")
            media.append(resolved)
        except ValueError as error:
            media.append({**_runtime_media(ref, user_did, root),
                          "unavailable": True, "unavailable_reason": str(error)})
    card["media"] = media
    return card


def _owns_media(ref, user_did, root=None):
    if str(ref.get("owner")) == str(user_did):
        return True
    if root is not None or not ref.get("owner"):
        return False
    import shared

    token = getattr(shared, "token", None)
    try:
        # Only a confirmed local workspace may survive a native DID change.
        if token is None or token.get_admin_did():
            return False
        previous = token.get_path_in_user_dir(str(ref["owner"]), "presets/characters")
        current = token.get_path_in_user_dir(str(user_did), "presets/characters")
        return bool(previous and current and Path(previous).resolve() == Path(current).resolve())
    except Exception:
        return False


def _valid_card(card, card_id):
    return (isinstance(card, dict) and card.get("schema") == SCHEMA
            and card.get("id") == card_id and _CARD_ID.fullmatch(card_id)
            and isinstance(card.get("name"), str) and bool(card["name"].strip())
            and isinstance(card.get("revision"), int) and card["revision"] > 0
            and isinstance(card.get("media", []), list)
            and all(isinstance(ref, dict) for ref in card.get("media", [])))


def library_status(user_did, root=None):
    """Explain this identity's storage only; never search other user directories."""
    folder = _root(user_did, root)
    backups = backup_root(user_did, root)
    unreadable, recoverable = [], []
    try:
        for path in folder.glob("av_*.json"):
            if not _valid_card(_read(path), path.stem):
                unreadable.append(path.name)
        ids = {path.stem for path in backups.glob("av_*.json")}
        ids.update(path.name for path in history_root(user_did, root).glob("av_*") if path.is_dir())
        for card_id in ids:
            card = recovery_card(card_id, user_did, root)
            if card and not (folder / f"{card_id}.json").exists():
                recoverable.append({"id": card["id"], "name": card["name"], "updated_at": card.get("updated_at", "")})
    except OSError:
        raise ValueError("character_library_unreadable") from None
    migration = _read(folder / ".legacy_migration.json") or {}
    return {"directory": str(folder.resolve()), "backup_directory": str(backups.resolve()),
            "history_directory": str(history_root(user_did, root).resolve()),
            "migration_conflicts": migration.get("conflicts", []),
            "migration_unreadable": migration.get("unreadable", []),
            "unreadable_files": sorted(unreadable), "recoverable": recoverable,
            "backups": backup_entries(user_did, root)}


def _media_path(asset_id, user_did, root=None):
    if not _MEDIA_ID.fullmatch(str(asset_id)):
        raise ValueError("invalid_asset_id")
    return _root(user_did, root) / "audiovisual_media" / f"{asset_id.replace(':', '_')}.json"


def register_media(asset_ref, user_did, root=None):
    """Only call with the trusted result of the media storage service."""
    ref = copy.deepcopy(asset_ref)
    if str(ref.get("owner")) != str(user_did):
        raise ValueError("asset_owner_mismatch")
    if not str(ref.get("mime", "")).startswith(("image/", "audio/")):
        raise ValueError("unsupported_media_type")
    if ref.get("copy_error") or ref.get("output_error"):
        raise ValueError("asset_registration_failed")
    ref["schema"] = MEDIA_SCHEMA
    with _LOCK:
        path = _media_path(ref["asset_id"], user_did, root)
        stored = _stored_media(ref, user_did, root)
        if _read(path) != stored:
            vlm_roleplay._atomic_write_json(path, stored)
    return _runtime_media(ref, user_did, root)


def resolve_media(asset_id, user_did, root=None):
    path = _media_path(asset_id, user_did, root)
    if not path.exists():
        # Legacy filenames omitted the namespace; the record must still match the exact requested ID.
        path = path.with_name(f"{asset_id.split(':')[1]}.json")
    ref = _read(path)
    if not path.exists():
        from modules import canvas_workbench_assets as assets

        folder = _asset_folder(user_did, root)
        existing = assets._resolve_asset_id_file_path(asset_id, folder)
        mime = mimetypes.guess_type(existing)[0] if existing else None
        if existing and mime and mime.startswith(("image/", "audio/")):
            # The storage helper verifies the digest inside the current workspace.
            ref = register_media({"asset_id": asset_id, "owner": user_did, "mime": mime,
                                  "name": Path(existing).name, "path": existing,
                                  "asset_relative_path": assets._asset_relative_path(existing, folder)},
                                 user_did, root)
    if (not ref or ref.get("schema") != MEDIA_SCHEMA or not _owns_media(ref, user_did, root)
            or ref.get("asset_id") != asset_id or ref.get("trim_source_asset_id") == asset_id):
        raise ValueError("asset_not_found")
    return _runtime_media({**ref, "owner": user_did}, user_did, root)


def resolve_media_list(asset_ids, user_did, root=None):
    if not isinstance(asset_ids, list) or not asset_ids or len(asset_ids) > 12:
        raise ValueError("invalid_media_ids")
    return [resolve_media(asset_id, user_did, root) for asset_id in dict.fromkeys(asset_ids)]


def prepare_scene_assignments(assignments, current, user_did, image_loader, root=None, allowed_slots=None):
    """Validate and prepare the entire batch before any Gradio component is updated."""
    if not isinstance(assignments, list) or not assignments or len(assignments) > 12:
        raise ValueError("invalid_media_assignments")
    allowed = set(SCENE_SLOTS if allowed_slots is None else allowed_slots)
    updates, refs = {}, []
    for assignment in assignments:
        if not isinstance(assignment, dict):
            raise ValueError("invalid_media_assignments")
        slot = assignment.get("slot")
        if slot not in allowed or slot not in SCENE_SLOTS or slot in updates:
            raise ValueError("invalid_media_slot")
        existing = current.get(slot)
        if slot == "scene_canvas_image" and isinstance(existing, str) and existing.lstrip().startswith("{"):
            try:
                existing = json.loads(existing)
            except ValueError:
                pass
        if slot == "scene_canvas_image" and isinstance(existing, dict):
            existing = next((existing.get(key) for key in ("image", "image_ref", "background", "composite")
                             if existing.get(key) is not None
                             and not (isinstance(existing.get(key), str) and not existing[key])), None)
        if existing is not None and not (isinstance(existing, str) and not existing):
            raise ValueError("media_slot_occupied")
        ref = resolve_media(assignment.get("asset_id"), user_did, root)
        kind = "image" if slot in SCENE_IMAGE_SLOTS else "audio"
        if not ref.get("mime", "").startswith(kind + "/"):
            raise ValueError("media_kind_mismatch")
        path = str(ref.get("path") or "")
        if not Path(path).is_file():
            raise ValueError("asset_file_missing")
        value = image_loader(path) if kind == "image" else path
        if value is None:
            raise ValueError("invalid_media")
        updates[slot] = {"image": value, "mask": None} if slot == "scene_canvas_image" else value
        refs.append({"slot": slot, "asset_id": ref["asset_id"]})
    return updates, refs


def _validate_trim_wav(path):
    try:
        with wave.open(str(path), "rb") as reader:
            frame_size = reader.getnchannels() * reader.getsampwidth()
            if reader.getnframes() < 1 or len(reader.readframes(1)) < frame_size:
                raise ValueError("audio_trim_failed")
    except (OSError, wave.Error, EOFError):
        raise ValueError("audio_trim_failed") from None


def trim_audio(asset_id, start, end, user_did, root=None, asset_service=None):
    ref = resolve_media(asset_id, user_did, root)
    if not str(ref.get("mime", "")).startswith("audio/"):
        raise ValueError("audio_required")
    try:
        start, end = float(start), float(end)
    except (TypeError, ValueError):
        raise ValueError("invalid_trim_range") from None
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
        raise ValueError("invalid_trim_range")
    source = Path(str(ref.get("path") or ""))
    if not source.is_file():
        raise ValueError("asset_file_missing")
    if asset_service is None:
        from modules import canvas_workbench_assets as asset_service
    state = {"user_did": user_did, "__user_did": user_did}
    output_root, _ = asset_service._asset_root("character_library", state)
    folder = Path(output_root) / "audio_trims"
    folder.mkdir(parents=True, exist_ok=True)
    signature = f"{asset_id}:{start:.6f}:{end:.6f}"
    output = folder / f"{hashlib.sha256(signature.encode()).hexdigest()[:32]}.wav"
    # A temporary WAV ensures failure cannot leave a half-written reusable result.
    with tempfile.NamedTemporaryFile(suffix=".wav", dir=folder, delete=False) as file:
        temporary = Path(file.name)
    try:
        try:
            reader = wave.open(str(source), "rb")
        except (wave.Error, EOFError):
            reader = None
        if reader is not None:
            with reader:
                rate = reader.getframerate()
                duration = reader.getnframes() / rate
                if end > duration + 0.001 or round(end * rate) <= round(start * rate):
                    raise ValueError("invalid_trim_range")
                if round(start * rate) == 0 and round(end * rate) >= reader.getnframes():
                    # No PCM samples were removed, so retain the existing registration and origin.
                    _validate_trim_wav(source)
                    return ref
                reader.setpos(round(start * rate))
                with wave.open(str(temporary), "wb") as writer:
                    writer.setparams(reader.getparams())
                    writer.writeframes(reader.readframes(round(end * rate) - round(start * rate)))
        else:
            duration = float(ref.get("duration") or 0)
            if not duration or end > duration + 0.001:
                raise ValueError("invalid_trim_range")
            ffmpeg = asset_service._get_ffmpeg_exe()
            if not ffmpeg:
                raise ValueError("audio_trim_unavailable")
            try:
                result = subprocess.run(
                    [ffmpeg, "-y", "-i", str(source), "-ss", str(start), "-t", str(end - start),
                     "-vn", "-c:a", "pcm_s16le", str(temporary)],
                    capture_output=True, timeout=120, check=False,
                )
            except (OSError, subprocess.TimeoutExpired):
                raise ValueError("audio_trim_failed") from None
            if result.returncode:
                raise ValueError("audio_trim_failed")
        _validate_trim_wav(temporary)
        with _LOCK:
            created = not output.exists()
            try:
                if created:
                    temporary.replace(output)
                else:
                    _validate_trim_wav(output)
                trimmed = asset_service.register_existing_file_asset(
                    str(output), "character_library", state, node_id="visual_character", role="audio",
                    metadata={"mime": "audio/wav"}, copy_to_assets=False,
                )
                if not trimmed:
                    raise ValueError("audio_trim_failed")
                source_start = float(ref.get("trim_start") or 0) if ref.get("trim_source_asset_id") else 0
                trimmed.update({
                    "name": f"{Path(ref.get('name') or 'voice').stem} [{start:g}-{end:g}s].wav",
                    "trim_source_asset_id": ref.get("trim_source_asset_id") or asset_id,
                    "trim_start": start + source_start, "trim_end": end + source_start,
                })
                return register_media(trimmed, user_did, root)
            except BaseException:
                if created:
                    try:
                        output.unlink(missing_ok=True)
                    except OSError:
                        pass
                raise
    finally:
        temporary.unlink(missing_ok=True)


def load_character(card_id, user_did, root=None):
    card = _read(_card_path(card_id, user_did, root))
    return _runtime_card(card, user_did, root) if _valid_card(card, card_id) else None


def save_character(value, user_did, root=None, *, restore_revision=None):
    from modules.visual_character_voice import normalize_voice

    source = value if isinstance(value, dict) else {}
    name = str(source.get("name") or "").strip()[:200]
    if not name:
        raise ValueError("character_name_required")
    if restore_revision is not None and (type(restore_revision) is not int or restore_revision < 1):
        raise ValueError("invalid_character_archive")
    card_id = str(source.get("id") or f"av_{uuid.uuid4().hex}")
    with _LOCK:
        path = _card_path(card_id, user_did, root)
        previous = load_character(card_id, user_did, root)
        if path.exists() and not previous:
            raise ValueError("character_id_conflict")
        # Existing cards require a revision to avoid silently overwriting another editor.
        if previous and source.get("revision") != previous["revision"]:
            raise ValueError("character_revision_conflict")
        raw_ids = source.get("media_ids", [])
        if not isinstance(raw_ids, list) or len(raw_ids) > 12:
            raise ValueError("invalid_media_ids")
        media, missing = [], []
        names = {ref.get("asset_id"): ref.get("name") for ref in (previous or {}).get("media", [])}
        for asset_id in dict.fromkeys(raw_ids):
            try:
                ref = resolve_media(asset_id, user_did, root)
                if root is None and ref.get("asset_relative_path") and not Path(str(ref.get("path") or "")).is_file():
                    raise ValueError("asset_file_missing")
                media.append(ref)
            except ValueError as error:
                if str(error) not in {"asset_not_found", "asset_file_missing"}:
                    raise
                missing.append({"asset_id": asset_id, "name": names.get(asset_id) or asset_id,
                                "reason": str(error)})
        if missing:
            raise CharacterMediaUnavailable(missing)
        if sum(str(item.get("mime", "")).startswith("image/") for item in media) > 9:
            raise ValueError("too_many_images")
        if sum(str(item.get("mime", "")).startswith("audio/") for item in media) > 3:
            raise ValueError("too_many_audios")
        card = {
            "schema": SCHEMA, "version": 1, "category": "audiovisual", "id": card_id,
            "revision": previous["revision"] + 1 if previous else (restore_revision or 1),
            "name": name,
            "appearance": str(source.get("appearance") or "").strip()[:12000],
            "image_prompt": str(source.get("image_prompt") or "").strip()[:12000],
            "image_preset": str(source.get("image_preset") or "").strip()[:200],
            "image_edit_preset": str(source.get("image_edit_preset") or "").strip()[:200],
            "image_mode": source.get("image_mode") if source.get("image_mode") in ("text", "reference")
                          else ("reference" if any(item["mime"].startswith("image/") for item in media) else "text"),
            "image_source_asset_id": str(source.get("image_source_asset_id") or "")[:100],
            "personality": str(source.get("personality") or "").strip()[:4000],
            "voice_description": str(source.get("voice_description") or "").strip()[:4000],
            "voice": normalize_voice(source.get("voice")),
            "media_ids": [item["asset_id"] for item in media],
            "media": media,
            "source_roleplay_id": str(source.get("source_roleplay_id") or "")[:200],
            "created_at": previous["created_at"] if previous else _now(),
            "updated_at": _now(),
        }
        # Keep descriptions beside the assets as well as in the reusable library.
        # Write this first so a backup failure never reports an unprotected save as successful.
        from modules.character_storage import snapshot

        stored = {**card, "media": [_stored_media(ref, user_did, root) for ref in media]}
        if previous:
            snapshot(path, {**previous, "media": [_stored_media(ref, user_did, root) for ref in previous["media"]]})
        snapshot(path, stored)
        vlm_roleplay._atomic_write_json(backup_root(user_did, root) / path.name, stored)
        vlm_roleplay._atomic_write_json(path, stored)
        (history_root(user_did, root) / card_id / "deleted.json").unlink(missing_ok=True)
    return card


def list_characters(user_did, category="audiovisual", root=None):
    if category not in {"audiovisual", "roleplay", "all"}:
        raise ValueError("invalid_character_category")
    cards = []
    if category in {"audiovisual", "all"}:
        for path in _root(user_did, root).glob("av_*.json"):
            card = _read(path)
            if _valid_card(card, path.stem):
                cards.append(_runtime_card(card, user_did, root))
    if category in {"roleplay", "all"}:
        for row in vlm_roleplay.list_roleplay_characters(user_did, root):
            card = vlm_roleplay.load_roleplay_character(row["id"], user_did, root)
            if card:
                cards.append({
                    "id": card["id"], "name": card["name"], "category": "roleplay",
                    "appearance": card["appearance"] or card["image_prompt"],
                    "voice_description": card["speech_style"], "media": [], "media_ids": [],
                    "revision": card["revision"], "updated_at": card["updated_at"],
                })
    return sorted(cards, key=lambda card: card.get("updated_at", ""), reverse=True)


def delete_character(card_id, user_did, root=None):
    with _LOCK:
        card = load_character(card_id, user_did, root)
        if not card:
            return False
        from modules.character_storage import snapshot

        snapshot(_card_path(card_id, user_did, root), {
            **card, "media": [_stored_media(ref, user_did, root) for ref in card["media"]]})
        vlm_roleplay._atomic_write_json(history_root(user_did, root) / card_id / "deleted.json",
                                       {"id": card_id, "deleted_at": _now()})
        (backup_root(user_did, root) / f"{card_id}.json").unlink(missing_ok=True)
        _card_path(card_id, user_did, root).unlink()
    # Media may be referenced by projects or other cards. Do not delete it here.
    return True
