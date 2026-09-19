"""User-owned audiovisual cards, alongside (not replacing) roleplay cards."""

import copy
import hashlib
import json
import math
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


def _now():
    return datetime.now(timezone.utc).isoformat()


def _root(user_did, root=None):
    return vlm_roleplay.roleplay_character_library_root(user_did, root)


def _read(path):
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None


def _card_path(card_id, user_did, root=None):
    if not _CARD_ID.fullmatch(str(card_id)):
        raise ValueError("invalid_character_id")
    return _root(user_did, root) / f"{card_id}.json"


def _media_path(asset_id, user_did, root=None):
    if not _MEDIA_ID.fullmatch(str(asset_id)):
        raise ValueError("invalid_asset_id")
    return _root(user_did, root) / "audiovisual_media" / f"{asset_id.split(':')[1]}.json"


def register_media(asset_ref, user_did, root=None):
    """Only call with the trusted result of the media storage service."""
    ref = copy.deepcopy(asset_ref)
    if str(ref.get("owner")) != str(user_did):
        raise ValueError("asset_owner_mismatch")
    if not str(ref.get("mime", "")).startswith(("image/", "audio/")):
        raise ValueError("unsupported_media_type")
    ref["schema"] = MEDIA_SCHEMA
    with _LOCK:
        vlm_roleplay._atomic_write_json(_media_path(ref["asset_id"], user_did, root), ref)
    return ref


def resolve_media(asset_id, user_did, root=None):
    ref = _read(_media_path(asset_id, user_did, root))
    if not ref or ref.get("schema") != MEDIA_SCHEMA or str(ref.get("owner")) != str(user_did):
        raise ValueError("asset_not_found")
    return ref


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
        with _LOCK:
            temporary.replace(output)
        trimmed = asset_service.register_existing_file_asset(
            str(output), "character_library", state, node_id="visual_character", role="audio",
            metadata={"mime": "audio/wav"}, copy_to_assets=False,
        )
        if not trimmed:
            raise ValueError("audio_trim_failed")
        trimmed.update({
            "name": f"{Path(ref.get('name') or 'voice').stem} [{start:g}-{end:g}s].wav",
            "trim_source_asset_id": asset_id,
            "trim_start": start, "trim_end": end,
        })
        return register_media(trimmed, user_did, root)
    finally:
        temporary.unlink(missing_ok=True)


def load_character(card_id, user_did, root=None):
    card = _read(_card_path(card_id, user_did, root))
    return card if card and card.get("schema") == SCHEMA else None


def save_character(value, user_did, root=None):
    from modules.visual_character_voice import normalize_voice

    source = value if isinstance(value, dict) else {}
    name = str(source.get("name") or "").strip()[:200]
    if not name:
        raise ValueError("character_name_required")
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
        media = [resolve_media(asset_id, user_did, root) for asset_id in dict.fromkeys(raw_ids)]
        if sum(str(item.get("mime", "")).startswith("image/") for item in media) > 9:
            raise ValueError("too_many_images")
        if sum(str(item.get("mime", "")).startswith("audio/") for item in media) > 3:
            raise ValueError("too_many_audios")
        card = {
            "schema": SCHEMA, "version": 1, "category": "audiovisual", "id": card_id,
            "revision": previous["revision"] + 1 if previous else 1,
            "name": name,
            "appearance": str(source.get("appearance") or "").strip()[:12000],
            "image_prompt": str(source.get("image_prompt") or "").strip()[:12000],
            "image_preset": str(source.get("image_preset") or "").strip()[:200],
            "personality": str(source.get("personality") or "").strip()[:4000],
            "voice_description": str(source.get("voice_description") or "").strip()[:4000],
            "voice": normalize_voice(source.get("voice")),
            "media_ids": [item["asset_id"] for item in media],
            "media": media,
            "source_roleplay_id": str(source.get("source_roleplay_id") or "")[:200],
            "created_at": previous["created_at"] if previous else _now(),
            "updated_at": _now(),
        }
        vlm_roleplay._atomic_write_json(path, card)
    return card


def list_characters(user_did, category="audiovisual", root=None):
    if category not in {"audiovisual", "roleplay", "all"}:
        raise ValueError("invalid_character_category")
    cards = []
    if category in {"audiovisual", "all"}:
        for path in _root(user_did, root).glob("av_*.json"):
            card = _read(path)
            if card and card.get("schema") == SCHEMA:
                cards.append(card)
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
        if not load_character(card_id, user_did, root):
            return False
        _card_path(card_id, user_did, root).unlink()
    # Media may be referenced by projects or other cards. Do not delete it here.
    return True
