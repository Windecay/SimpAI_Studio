"""Canonical character directories and non-destructive legacy migration."""

import copy
import hashlib
import json
import os
from pathlib import Path
import re
import threading
import uuid

import shared


_LOCK = threading.RLock()
_READY = set()
MAX_FILES = 10000
MAX_BYTES = 32 * 1024 * 1024
SCHEMAS = {"simpai.audiovisual.character", "simpai.audiovisual.media",
           "simpai.vlm_roleplay.character", "simpai.character.folders"}


def portable_value(value):
    value = copy.deepcopy(value)
    refs = [value] if value.get("schema") == "simpai.audiovisual.media" else value.get("media", [])
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        relative = ref.get("asset_relative_path") or ref.get("relative_path")
        if not relative and ref.get("path") and ref.get("asset_root"):
            try:
                relative = Path(ref["path"]).relative_to(Path(ref["asset_root"])).as_posix()
            except ValueError:
                pass
        if relative and not Path(relative).is_absolute() and ".." not in Path(relative).parts:
            ref.update(asset_relative_path=relative, relative_path=relative,
                       asset_root_key="project_asset_root", project_id="character_library")
        for key in ("path", "asset_root", "output_path", "original_output_path", "preview_url", "data_url"):
            ref.pop(key, None)
    return value


def atomic_json(path, value, *, overwrite=True):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        if overwrite:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def snapshot(path, value):
    """Content-addressed versions remain available after edits and deletions."""
    path = Path(path)
    workspace = path.parent.parent.parent
    content = json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(content).hexdigest()
    target = workspace / "character_backups" / "history" / path.stem / f"{digest}.json"
    if not target.exists():
        atomic_json(target, value)
    return target


def normalize_library(folder):
    """Backfill backups before converting existing audiovisual references."""
    folder = Path(folder)
    paths = list(folder.glob("*.json")) + list((folder / "audiovisual_media").glob("*.json"))
    if len(paths) > MAX_FILES:
        raise ValueError("character_library_migration_limit")
    result = {"backed_up": 0, "converted": 0, "unreadable": []}
    for path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()):
            raise ValueError("character_storage_error")
        if path.stat().st_size > MAX_BYTES:
            raise ValueError("character_library_migration_limit")
        try:
            value = json.loads(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError):
            result["unreadable"].append(str(path.relative_to(folder)))
            continue
        if not isinstance(value, dict) or value.get("schema") not in SCHEMAS:
            continue
        portable = portable_value(value)
        if value.get("schema") != "simpai.audiovisual.media":
            snapshot(path, portable)
            result["backed_up"] += 1
        if portable != value:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            backup = folder.parent.parent / "character_backups" / "migration"
            atomic_json(backup / digest / path.relative_to(folder), value)
            atomic_json(path, portable)
            result["converted"] += 1
    return result


def migrate_library(source, destination):
    """Copy trusted legacy JSONs; never overwrite a destination or remove a source."""
    source, destination = Path(source), Path(destination)
    if source.is_symlink() or destination.is_symlink():
        raise ValueError("character_storage_error")
    source, destination = source.resolve(), destination.resolve()
    result = {"source": str(source), "destination": str(destination),
              "copied": [], "conflicts": [], "unreadable": []}
    if source == destination or not source.exists():
        return result
    if source.is_symlink() or destination.is_symlink():
        raise ValueError("character_storage_error")
    with _LOCK:
        manifest_path = destination / ".legacy_migration.json"
        manifest = {}
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        processed = manifest.setdefault("processed", {})
        paths = list(source.glob("*.json")) + list((source / "audiovisual_media").glob("*.json"))
        if len(paths) > MAX_FILES:
            raise ValueError("character_library_migration_limit")
        for path in paths:
            relative = path.relative_to(source)
            if path.is_symlink() or not path.resolve().is_relative_to(source):
                raise ValueError("character_storage_error")
            try:
                if path.stat().st_size > MAX_BYTES:
                    raise ValueError("character_library_migration_limit")
                binary = path.read_bytes()
                value = json.loads(binary.decode("utf-8-sig"))
                if not isinstance(value, dict) or value.get("schema") not in SCHEMAS:
                    continue
            except (OSError, UnicodeError, json.JSONDecodeError):
                result["unreadable"].append(str(relative))
                continue
            digest = hashlib.sha256(binary).hexdigest()
            key = f"{source}/{relative.as_posix()}"
            if processed.get(key) == digest:
                continue
            target = destination / relative
            if not target.resolve().is_relative_to(destination):
                raise ValueError("character_storage_error")
            portable = portable_value(value)
            if target.exists():
                try:
                    existing = json.loads(target.read_text(encoding="utf-8-sig"))
                except (OSError, ValueError):
                    result["conflicts"].append(str(relative))
                    continue
                if existing != portable:
                    result["conflicts"].append(str(relative))
                    continue
            else:
                # An independent copy is committed before the new live file.
                backup = destination.parent.parent / "character_backups" / "migration"
                atomic_json(backup / digest / relative, value)
                if value.get("schema") in {"simpai.audiovisual.character", "simpai.vlm_roleplay.character"}:
                    snapshot(target, portable)
                try:
                    atomic_json(target, portable, overwrite=False)
                except FileExistsError:
                    result["conflicts"].append(str(relative))
                    continue
                result["copied"].append(str(relative))
            processed[key] = digest
        if paths:
            manifest.update({"conflicts": result["conflicts"], "unreadable": result["unreadable"]})
            atomic_json(manifest_path, manifest)
    return result


def library_root(user_did, root=None):
    did = str(user_did or "").strip()
    safe_did = re.sub(r"[^A-Za-z0-9_.:@-]+", "_", did).strip(" ._")
    if not safe_did:
        raise ValueError("invalid_user_id")
    if root is not None:
        return Path(root) / safe_did / "presets" / "characters"
    token = getattr(shared, "token", None)
    if token is None or not hasattr(token, "get_path_in_user_dir"):
        raise ValueError("character_storage_error")
    try:
        folder = token.get_path_in_user_dir(did, "presets/characters")
    except Exception as error:
        raise ValueError("character_storage_error") from error
    if not folder:
        raise ValueError("character_storage_error")
    destination = Path(folder)
    legacy = Path(getattr(shared, "path_userhome", None) or "users") / safe_did / "presets" / "characters"
    key = (str(legacy.resolve()), str(destination.resolve()))
    with _LOCK:
        if key not in _READY:
            migrate_library(legacy, destination)
            normalize_library(destination)
            _READY.add(key)
    return destination
