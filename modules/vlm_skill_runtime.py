"""Discovery and loading for user-provided SKILL.md files.

The loader only reads Markdown files. It does not execute files from a skill
directory and it never accepts a filesystem path from a chat request.
"""

import hashlib
import os
import re
import shutil
import stat
import tempfile
import zipfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from pathlib import PurePosixPath

import shared
from modules import access_mode
from modules.canvas_workbench_request_identity import resolve_local_workspace_did


SKILL_FILE_NAME = "SKILL.md"
DEFAULT_MAX_SKILL_BYTES = 100_000
MAX_SKILL_PACKAGE_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_SKILL_PACKAGE_FILES = 512
MAX_SKILL_PACKAGE_FILE_BYTES = 32 * 1024 * 1024
MAX_SKILL_PACKAGE_TOTAL_BYTES = 64 * 1024 * 1024
MAX_DESCRIPTION_CHARS = 1_024
MAX_FRONTMATTER_BYTES = 24_000
MAX_SKILLS = 128
_SKIP_DIRECTORY_NAMES = {
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "vendor",
    ".venv",
    "coverage",
}
_SAFE_FRONTMATTER_KEYS = {
    "name",
    "description",
    "when_to_use",
    "license",
    "metadata",
}
_SKILL_NAME_RE = re.compile(r"^[^/\\\x00\r\n]{1,96}$")
_WINDOWS_INVALID_PATH_CHARS = set('<>:"/\\|?*')


def studio_root():
    return Path(__file__).resolve().parents[1]


def _path_key(path):
    try:
        value = os.path.abspath(os.path.expanduser(str(path)))
    except Exception:
        value = str(path or "")
    return os.path.normcase(os.path.normpath(value))


def _display_path(path):
    try:
        return str(Path(path).expanduser().resolve(strict=False))
    except Exception:
        return str(path or "")


def _append_root(roots, seen, path, scope, source):
    if not path:
        return
    display = _display_path(path)
    key = _path_key(display)
    if not key or key in seen:
        return
    seen.add(key)
    roots.append({"path": display, "scope": scope, "source": source})


@dataclass(frozen=True)
class SkillAccess:
    """Server-created identity context, never deserialized from HTTP payloads."""
    role: str
    user_root: Path | None = None

    @property
    def write_scopes(self):
        scopes = ["project"] if self.role in {"local", "admin"} else []
        if self.role in {"local", "admin", "user"} and self.user_root is not None:
            scopes.append("user")
        return scopes


def resolve_skill_access(authenticated_did=None):
    token = getattr(shared, "token", None)
    role, did = "guest", str(authenticated_did or "").strip()
    if access_mode.is_local_mode():
        role = "local"
        try:
            did = resolve_local_workspace_did(token)
        except ValueError:
            did = "local" if token is None else ""
    elif did and did.lower() not in {"guest", "unknown", "invalid_did"}:
        try:
            if token is not None and not token.is_guest(did):
                if token.is_admin(did):
                    role = "admin"
                else:
                    record = access_mode.get_user_access_record(did)
                    if record is None or record.get("status") == "allowed":
                        role = "user"
        except Exception:
            role = "guest"
    user_root = None
    if role != "guest" and did:
        try:
            if token is not None and hasattr(token, "get_path_in_user_dir"):
                path = str(token.get_path_in_user_dir(did, "skills") or "").strip()
                user_root = Path(path).absolute() if path else None
            elif token is None and role == "local":
                user_root = Path(getattr(shared, "path_userhome", None) or studio_root() / "users") / "local" / "skills"
                user_root = user_root.absolute()
        except Exception:
            pass
    return SkillAccess(role, user_root)


def _access(value=None):
    return value if isinstance(value, SkillAccess) else resolve_skill_access()


def _normal_path(path):
    path = Path(path).absolute()
    return (
        path.resolve(strict=False) == path
        and not any(p.is_symlink() or getattr(p, "is_junction", lambda: False)()
                    for p in (path, *path.parents))
    )


def resolve_skill_roots(project_root=None, include_user=True, access=None):
    """Only Studio project skills and this session's private skills are mounted."""
    policy = _access(access)
    root = Path(project_root or studio_root()).absolute() / "skills"
    roots = []
    seen = set()
    if include_user and policy.role != "guest" and policy.user_root is not None and _normal_path(policy.user_root):
        _append_root(roots, seen, policy.user_root, "user", "studio")
    if _normal_path(root):
        _append_root(roots, seen, root, "project", "studio")
    return roots


def _scan_skill_files(root_path):
    root = Path(root_path)
    if not root.is_dir() or not _normal_path(root):
        return []
    files = []
    own = root / SKILL_FILE_NAME
    if own.is_file() and not own.is_symlink():
        files.append(own)
    try:
        entries = sorted(root.iterdir(), key=lambda item: item.name.casefold())
    except OSError:
        raise
    for entry in entries:
        if entry.name in _SKIP_DIRECTORY_NAMES or entry.name.startswith("."):
            continue
        try:
            if not entry.is_dir() or not _normal_path(entry):
                continue
            candidate = entry / SKILL_FILE_NAME
            if candidate.is_file() and not candidate.is_symlink():
                files.append(candidate)
        except OSError:
            raise
    return files


def _read_prefix(path, limit=MAX_FRONTMATTER_BYTES):
    with open(path, "rb") as handle:
        return handle.read(max(1024, int(limit))).decode("utf-8", errors="replace")


def _extract_frontmatter(content):
    text = str(content or "").lstrip("\ufeff")
    if not text.startswith("---"):
        return None, text
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None, text
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return "\n".join(lines[1:index]), "\n".join(lines[index + 1:])
    return None, text


def _unquote_scalar(value):
    value = str(value or "").strip()
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            import json
            return str(json.loads(value))
        except Exception:
            return value[1:-1]
    if len(value) >= 2 and value[0] == value[-1] == "'":
        return value[1:-1].replace("''", "'")
    return value


def _parse_frontmatter(frontmatter):
    values = {}
    keys = []
    lines = str(frontmatter or "").splitlines()
    index = 0
    while index < len(lines):
        raw = lines[index]
        index += 1
        if not raw.strip() or raw.lstrip().startswith("#") or raw[:1].isspace():
            continue
        separator = raw.find(":")
        if separator <= 0:
            continue
        key = raw[:separator].strip()
        value = raw[separator + 1:].strip()
        keys.append(key)
        if value in {">", ">+", ">-", "|", "|+", "|-"}:
            block = []
            while index < len(lines):
                line = lines[index]
                if line.strip() and not line[:1].isspace():
                    break
                block.append(line)
                index += 1
            non_empty_indent = min(
                (len(line) - len(line.lstrip()) for line in block if line.strip()),
                default=0,
            )
            body = [line[non_empty_indent:] if line.strip() else "" for line in block]
            values[key] = " ".join(part.strip() for part in body).strip() if value.startswith(">") else "\n".join(body).strip()
        else:
            values[key] = _unquote_scalar(value)
    return values, keys


def _valid_skill_name(name):
    value = str(name or "").strip()
    return bool(_SKILL_NAME_RE.fullmatch(value)) and value not in {".", ".."}


def _valid_skill_package_name(name):
    value = str(name or "").strip()
    if not _valid_skill_name(value) or value.endswith((".", " ")) or any(
        char in _WINDOWS_INVALID_PATH_CHARS or ord(char) < 32 for char in value
    ):
        return False
    return not re.match(r"^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", value, re.I)


def _description_from_body(body):
    for line in str(body or "").splitlines():
        text = line.strip().lstrip("#").strip()
        if text:
            return text[:MAX_DESCRIPTION_CHARS]
    return ""


def _parse_skill_file(path, root):
    prefix = _read_prefix(path)
    frontmatter, body_prefix = _extract_frontmatter(prefix)
    values, keys = _parse_frontmatter(frontmatter) if frontmatter is not None else ({}, [])
    name = str(values.get("name") or (Path(path).parent.name if frontmatter is None else "")).strip()
    if not _valid_skill_name(name):
        return None, {
            "code": "skill_invalid_name",
            "severity": "error",
            "message": "Skill name is missing or invalid.",
            "path": str(path),
        }
    description = str(values.get("description") or "").strip()
    if not description and frontmatter is None:
        description = _description_from_body(body_prefix)
    if len(description) > MAX_DESCRIPTION_CHARS:
        return None, {
            "code": "skill_description_too_long",
            "severity": "error",
            "message": "Skill description is too long.",
            "path": str(path),
            "skill_name": name,
        }
    try:
        size_bytes = int(Path(path).stat().st_size)
    except OSError:
        size_bytes = 0
    summary = {
        "name": name,
        "description": description,
        "when_to_use": str(values.get("when_to_use") or "").strip()[:MAX_DESCRIPTION_CHARS],
        "path": str(Path(path).resolve(strict=False)),
        "directory": str(Path(path).parent.resolve(strict=False)),
        "root_path": str(Path(root["path"]).resolve(strict=False)),
        "scope": root.get("scope") or "project",
        "source": root.get("source") or "project",
        "size_bytes": size_bytes,
        "safe_to_auto_load": all(key in _SAFE_FRONTMATTER_KEYS for key in keys),
        "frontmatter_keys": list(keys),
    }
    return summary, None


def discover_skills(project_root=None, include_user=True, max_skills=MAX_SKILLS, access=None):
    roots = resolve_skill_roots(project_root, include_user=include_user, access=access)
    diagnostics = []
    selected = {}
    seen_paths = set()
    total_discovered = 0
    try:
        limit = max(1, min(MAX_SKILLS, int(max_skills)))
    except (TypeError, ValueError):
        limit = MAX_SKILLS

    for root in roots:
        try:
            candidates = _scan_skill_files(root["path"])
        except OSError as exc:
            diagnostics.append({
                "code": "skill_scan_failed",
                "severity": "warning",
                "message": str(exc),
                "path": root["path"],
            })
            continue
        for path in candidates:
            if len(selected) >= limit:
                break
            path_key = _path_key(path)
            if path_key in seen_paths:
                continue
            seen_paths.add(path_key)
            try:
                summary, diagnostic = _parse_skill_file(path, root)
            except OSError as exc:
                diagnostics.append({
                    "code": "skill_read_failed",
                    "severity": "warning",
                    "message": str(exc),
                    "path": str(path),
                })
                continue
            if diagnostic:
                diagnostics.append(diagnostic)
            if not summary:
                continue
            total_discovered += 1
            name_key = summary["name"].casefold()
            if name_key in selected:
                diagnostics.append({
                    "code": "skill_shadowed",
                    "severity": "info",
                    "message": "A skill with the same name was found in an earlier root.",
                    "path": summary["path"],
                    "skill_name": summary["name"],
                })
                continue
            selected[name_key] = summary
    skills = sorted(selected.values(), key=lambda item: item["name"].casefold())
    return {
        "skills": skills,
        "diagnostics": diagnostics,
        "roots": roots,
        "total_discovered": total_discovered,
    }


def list_skill_summaries(project_root=None, include_user=True, max_skills=MAX_SKILLS, access=None):
    return discover_skills(project_root, include_user=include_user, max_skills=max_skills, access=access)["skills"]


def _managed_skill_location(summary, project_root=None, access=None):
    policy = _access(access)
    path = Path(summary["path"])
    for item in resolve_skill_roots(project_root, access=policy):
        scope, root = item["scope"], Path(item["path"])
        if (
            scope in policy.write_scopes
            and _normal_path(path)
            and path.parent.parent == root and path.name == SKILL_FILE_NAME
            and root.resolve() == root and path.resolve() == path
            and not any(p.is_symlink() or getattr(p, "is_junction", lambda: False)()
                        for p in (root, path.parent, path))
        ):
            return {"scope": scope, "folder_name": path.parent.name}
    return None


def manage_skill(payload, project_root=None, access=None):
    """Inspect discovered files; mutate only direct children of managed roots."""
    name = str(payload.get("name") or "")
    policy = _access(access)
    if payload["action"] != "inspect" and not policy.write_scopes:
        return {"ok": False, "code": "skill_forbidden"}
    summary = next((s for s in list_skill_summaries(project_root, access=policy)
                    if s["name"] == name), None)
    if not summary:
        return {"ok": False, "code": "skill_not_found"}
    path = Path(summary["path"])
    try:
        with path.open("rb") as handle:
            raw = handle.read(DEFAULT_MAX_SKILL_BYTES + 1)
        if len(raw) > DEFAULT_MAX_SKILL_BYTES:
            return {"ok": False, "code": "skill_too_large"}
        content = raw.decode("utf-8")
    except (OSError, UnicodeError):
        return {"ok": False, "code": "skill_read_failed"}
    revision = hashlib.sha256(str(path).encode("utf-8") + b"\0" + raw).hexdigest()
    location = _managed_skill_location(summary, project_root, access=policy)
    if payload["action"] == "inspect":
        return {
            "ok": True, "skill": summary, "content": content,
            "revision": revision, "editable": bool(location),
            **(location or {"scope": "user" if policy.user_root else "project", "folder_name": path.parent.name}),
        }
    if not location:
        return {"ok": False, "code": "skill_read_only"}
    if payload.get("revision") != revision:
        return {"ok": False, "code": "skill_changed"}
    if payload["action"] == "update":
        updated = payload.get("content")
        if isinstance(updated, str):
            frontmatter, _ = _extract_frontmatter(updated)
            if updated.lstrip("\ufeff").startswith("---") and frontmatter is None:
                return {"ok": False, "code": "skill_invalid_metadata"}
            if frontmatter is not None:
                values, _ = _parse_frontmatter(frontmatter)
                if (not _valid_skill_name(values.get("name"))
                        or len(str(values.get("description") or "")) > MAX_DESCRIPTION_CHARS):
                    return {"ok": False, "code": "skill_invalid_metadata"}
        return save_skill(location["folder_name"], updated,
                          project_root=project_root, scope=location["scope"], overwrite=True, access=policy)
    if payload["action"] == "delete":
        try:
            # Remove only SKILL.md; scripts, references and other sibling files stay intact.
            path.unlink()
        except OSError:
            return {"ok": False, "code": "skill_delete_failed"}
        return {"ok": True, "name": name}
    return {"ok": False, "code": "skill_invalid_action"}


def load_skill(name, project_root=None, include_user=True, max_bytes=DEFAULT_MAX_SKILL_BYTES, access=None):
    requested = str(name or "").strip()
    if not _valid_skill_name(requested):
        return {"ok": False, "error": "Invalid skill name.", "code": "skill_invalid_name"}
    outcome = discover_skills(project_root, include_user=include_user, access=access)
    summary = next(
        (item for item in outcome["skills"] if item["name"].casefold() == requested.casefold()),
        None,
    )
    if not summary:
        return {
            "ok": False,
            "error": "Skill not found.",
            "code": "skill_not_found",
            "name": requested,
            "available": [item["name"] for item in outcome["skills"]],
        }
    try:
        byte_limit = max(1024, min(DEFAULT_MAX_SKILL_BYTES, int(max_bytes)))
    except (TypeError, ValueError):
        byte_limit = DEFAULT_MAX_SKILL_BYTES
    path = Path(summary["path"])
    try:
        size_bytes = int(path.stat().st_size)
        with open(path, "rb") as handle:
            raw = handle.read(byte_limit)
    except OSError as exc:
        return {"ok": False, "error": "Skill could not be read.", "code": "skill_read_failed", "details": str(exc)}
    text = raw.decode("utf-8", errors="replace")
    _, body = _extract_frontmatter(text)
    return {
        "ok": True,
        "skill": summary,
        "content": body.strip(),
        "base_directory": summary["directory"],
        "bytes_read": len(raw),
        "size_bytes": size_bytes,
        "truncated": size_bytes > len(raw),
        "diagnostics": outcome["diagnostics"],
    }


def _normalize_requested_skill_names(names):
    requested = []
    for value in names if isinstance(names, list) else []:
        name = str(value or "").strip()
        if name and name.casefold() not in {item.casefold() for item in requested}:
            requested.append(name)
    return requested


def load_requested_skills_report(
    names,
    project_root=None,
    include_user=True,
    max_total_chars=24_000,
    max_skills=None,
    access=None,
):
    """Load selected skills without silently dropping content or selections."""
    requested = _normalize_requested_skill_names(names)
    try:
        char_limit = max(1, int(max_total_chars))
    except (TypeError, ValueError):
        char_limit = 24_000
    try:
        skill_limit = max(1, int(max_skills)) if max_skills is not None else None
    except (TypeError, ValueError):
        skill_limit = None

    report = {
        "ok": True,
        "requested_names": requested,
        "requested_count": len(requested),
        "max_skills": skill_limit,
        "missing_names": [],
        "truncated_names": [],
        "skills": [],
        "skill_chars": 0,
        "max_skill_chars": char_limit,
    }
    if skill_limit is not None and len(requested) > skill_limit:
        report.update({
            "ok": False,
            "code": "skill_count_limit_exceeded",
            "overflow_count": len(requested) - skill_limit,
        })
        return report

    loaded = []
    used = 0
    for name in requested:
        item = load_skill(name, project_root=project_root, include_user=include_user, access=access)
        if not item.get("ok"):
            report["missing_names"].append(name)
            continue
        content = str(item.get("content") or "")
        if item.get("truncated"):
            report["truncated_names"].append(name)
            continue
        used += len(content)
        loaded.append({
            "name": item["skill"]["name"],
            "description": item["skill"].get("description") or "",
            "content": content,
            "truncated": False,
            "path": item["skill"].get("path") or "",
        })
    report["skills"] = loaded
    report["skill_chars"] = used
    if report["missing_names"]:
        report.update({"ok": False, "code": "skill_not_found_in_selection"})
    elif report["truncated_names"]:
        report.update({"ok": False, "code": "skill_content_truncated"})
    elif used > char_limit:
        report.update({
            "ok": False,
            "code": "skill_context_budget_exceeded",
            "overflow_chars": used - char_limit,
        })
    return report


def load_requested_skills(names, project_root=None, include_user=True, max_total_chars=24_000, access=None):
    """Compatibility wrapper for callers that only need a complete skill list."""
    report = load_requested_skills_report(
        names,
        project_root=project_root,
        include_user=include_user,
        max_total_chars=max_total_chars,
        access=access,
    )
    return report["skills"] if report.get("ok") else []


def save_skill(name, content, project_root=None, scope="project", overwrite=False, access=None):
    """Write one user-authored SKILL.md into a fixed project or user root."""
    skill_name = str(name or "").strip()
    if not _valid_skill_name(skill_name):
        return {
            "ok": False,
            "error": "Skill folder name is missing or invalid.",
            "code": "skill_invalid_name",
        }
    if not isinstance(content, str) or not content.strip():
        return {"ok": False, "error": "Skill content is empty.", "code": "skill_empty"}
    content_bytes = content.encode("utf-8")
    if len(content_bytes) > DEFAULT_MAX_SKILL_BYTES:
        return {
            "ok": False,
            "error": "Skill content is too large.",
            "code": "skill_too_large",
            "max_bytes": DEFAULT_MAX_SKILL_BYTES,
        }

    normalized_scope = str(scope or "project").strip().lower()
    if normalized_scope not in {"project", "user"}:
        return {
            "ok": False,
            "error": "Skill scope must be project or user.",
            "code": "skill_invalid_scope",
        }

    policy = _access(access)
    if normalized_scope not in policy.write_scopes:
        return {"ok": False, "code": "skill_forbidden", "error": "This skill location is not writable for the current user."}
    base_root = (
        Path(project_root or studio_root()).expanduser().resolve(strict=False) / "skills"
        if normalized_scope == "project"
        else policy.user_root
    )
    if not _normal_path(base_root):
        return {
            "ok": False,
            "error": "The selected skill root cannot be a symbolic link.",
            "code": "skill_root_invalid",
        }

    skill_directory = base_root / skill_name
    target = skill_directory / SKILL_FILE_NAME
    if not _normal_path(skill_directory) or (skill_directory.exists() and not skill_directory.is_dir()):
        return {
            "ok": False,
            "error": "The selected skill folder is not a normal directory.",
            "code": "skill_directory_invalid",
        }
    if target.exists() and not target.is_file():
        return {
            "ok": False,
            "error": "The selected SKILL.md path is not a normal file.",
            "code": "skill_file_invalid",
        }
    if target.is_symlink():
        return {
            "ok": False,
            "error": "The selected SKILL.md path cannot be a symbolic link.",
            "code": "skill_file_invalid",
        }
    if target.exists() and not overwrite:
        return {
            "ok": False,
            "error": "A skill with this name already exists.",
            "code": "skill_exists",
            "name": skill_name,
            "path": str(target),
        }

    temporary_path = None
    try:
        skill_directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="",
            dir=str(skill_directory),
            prefix=".SKILL.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(content)
            temporary_path = Path(handle.name)
        os.replace(temporary_path, target)
    except OSError as exc:
        if temporary_path:
            try:
                temporary_path.unlink(missing_ok=True)
            except OSError:
                pass
        return {
            "ok": False,
            "error": "Skill could not be saved.",
            "code": "skill_write_failed",
            "details": str(exc),
        }

    root_info = {
        "path": str(base_root),
        "scope": normalized_scope,
        "source": "ui",
    }
    try:
        summary, diagnostic = _parse_skill_file(target, root_info)
    except OSError as exc:
        return {
            "ok": True,
            "name": skill_name,
            "path": str(target.resolve(strict=False)),
            "scope": normalized_scope,
            "warning": str(exc),
        }
    result = {
        "ok": True,
        "name": skill_name,
        "path": str(target.resolve(strict=False)),
        "scope": normalized_scope,
        "skill": summary or {
            "name": skill_name,
            "path": str(target.resolve(strict=False)),
            "directory": str(skill_directory.resolve(strict=False)),
            "root_path": str(base_root.resolve(strict=False)),
            "scope": normalized_scope,
            "source": "ui",
        },
    }
    if diagnostic:
        result["diagnostic"] = diagnostic
    return result


def import_skill_package(archive_bytes, filename="", project_root=None, scope="project", access=None):
    """Import one complete skill folder without replacing an existing skill."""
    if not isinstance(archive_bytes, (bytes, bytearray, memoryview)):
        return {"ok": False, "code": "skill_package_invalid"}
    archive_bytes = bytes(archive_bytes)
    if not archive_bytes or len(archive_bytes) > MAX_SKILL_PACKAGE_ARCHIVE_BYTES:
        return {
            "ok": False,
            "code": "skill_package_too_large" if archive_bytes else "skill_package_invalid",
            "max_bytes": MAX_SKILL_PACKAGE_ARCHIVE_BYTES,
        }

    normalized_scope = str(scope or "project").strip().lower()
    if normalized_scope not in {"project", "user"}:
        return {"ok": False, "code": "skill_invalid_scope"}
    policy = _access(access)
    if normalized_scope not in policy.write_scopes:
        return {"ok": False, "code": "skill_forbidden"}
    base_root = (
        Path(project_root or studio_root()).expanduser().absolute() / "skills"
        if normalized_scope == "project"
        else policy.user_root
    )
    if not base_root or not _normal_path(base_root):
        return {"ok": False, "code": "skill_root_invalid"}

    temp_root = None
    try:
        with zipfile.ZipFile(BytesIO(archive_bytes), "r") as archive:
            entries = archive.infolist()
            if not entries or len(entries) > MAX_SKILL_PACKAGE_FILES:
                return {"ok": False, "code": "skill_package_file_limit"}

            normalized_entries = []
            seen_paths = set()
            declared_total = 0
            skill_paths = []
            for info in entries:
                raw_name = str(info.filename or "")
                if not raw_name or "\\" in raw_name or "\x00" in raw_name:
                    return {"ok": False, "code": "skill_package_path_invalid"}
                is_directory = info.is_dir()
                name = raw_name[:-1] if is_directory and raw_name.endswith("/") else raw_name
                path = PurePosixPath(name)
                parts = path.parts
                if (
                    path.is_absolute()
                    or not parts
                    or any(
                        part in {"", ".", ".."}
                        or ":" in part
                        or part.endswith((".", " "))
                        or any(char in '<>"|?*' for char in part)
                        or any(ord(char) < 32 for char in part)
                        or re.match(r"^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", part, re.I)
                        for part in parts
                    )
                ):
                    return {"ok": False, "code": "skill_package_path_invalid"}
                path_key = "/".join(parts).casefold()
                if path_key in seen_paths:
                    return {"ok": False, "code": "skill_package_duplicate_path"}
                seen_paths.add(path_key)
                mode = (info.external_attr >> 16) & 0xFFFF
                file_type = stat.S_IFMT(mode)
                if file_type == stat.S_IFLNK or file_type not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    return {"ok": False, "code": "skill_package_link_not_allowed"}
                if info.flag_bits & 0x1:
                    return {"ok": False, "code": "skill_package_encrypted"}
                if info.compress_type not in {
                    zipfile.ZIP_STORED,
                    zipfile.ZIP_DEFLATED,
                    zipfile.ZIP_BZIP2,
                    zipfile.ZIP_LZMA,
                }:
                    return {"ok": False, "code": "skill_package_compression_unsupported"}
                if not is_directory:
                    if info.file_size < 0 or info.file_size > MAX_SKILL_PACKAGE_FILE_BYTES:
                        return {"ok": False, "code": "skill_package_file_too_large"}
                    declared_total += info.file_size
                    if declared_total > MAX_SKILL_PACKAGE_TOTAL_BYTES:
                        return {"ok": False, "code": "skill_package_unpacked_too_large"}
                    if info.file_size > 1024 * 1024 and (
                        not info.compress_size or info.file_size / info.compress_size > 500
                    ):
                        return {"ok": False, "code": "skill_package_compression_ratio"}
                    normalized_entries.append((info, parts, False))
                    if len(parts) and parts[-1].casefold() == SKILL_FILE_NAME.casefold():
                        skill_paths.append(parts)
                else:
                    normalized_entries.append((info, parts, True))

            if len(skill_paths) != 1 or skill_paths[0][-1] != SKILL_FILE_NAME:
                return {"ok": False, "code": "skill_package_skill_file_required"}
            skill_parts = skill_paths[0]
            prefix = skill_parts[0] if len(skill_parts) > 1 else ""
            if prefix and (
                len(skill_parts) != 2
                or any(parts[0] != prefix for _info, parts, _directory in normalized_entries)
            ):
                return {"ok": False, "code": "skill_package_layout_invalid"}

            package_files = []
            actual_total = 0
            skill_content = None
            for info, parts, is_directory in normalized_entries:
                relative_parts = parts[1:] if prefix else parts
                if not relative_parts:
                    continue
                if is_directory:
                    package_files.append((info, relative_parts, True))
                    continue
                relative_path = PurePosixPath(*relative_parts)
                if relative_path == PurePosixPath(SKILL_FILE_NAME):
                    if info.file_size > DEFAULT_MAX_SKILL_BYTES:
                        return {"ok": False, "code": "skill_too_large"}
                data = bytearray()
                with archive.open(info, "r") as source:
                    while True:
                        chunk = source.read(1024 * 1024)
                        if not chunk:
                            break
                        actual_total += len(chunk)
                        if actual_total > MAX_SKILL_PACKAGE_TOTAL_BYTES or len(data) + len(chunk) > MAX_SKILL_PACKAGE_FILE_BYTES:
                            return {"ok": False, "code": "skill_package_unpacked_too_large"}
                        data.extend(chunk)
                if len(data) != info.file_size:
                    return {"ok": False, "code": "skill_package_corrupt"}
                if relative_path == PurePosixPath(SKILL_FILE_NAME):
                    try:
                        skill_content = bytes(data).decode("utf-8")
                    except UnicodeError:
                        return {"ok": False, "code": "skill_package_skill_file_encoding"}
                package_files.append((info, relative_parts, False, bytes(data)))

            if skill_content is None:
                return {"ok": False, "code": "skill_package_skill_file_required"}
            frontmatter, _body = _extract_frontmatter(skill_content)
            if skill_content.lstrip("\ufeff").startswith("---") and frontmatter is None:
                return {"ok": False, "code": "skill_invalid_metadata"}
            metadata, _keys = _parse_frontmatter(frontmatter) if frontmatter is not None else ({}, [])
            fallback_name = PurePosixPath(str(filename or "")).stem if not prefix else prefix
            skill_name = str(metadata.get("name") or fallback_name or "").strip()
            if not _valid_skill_package_name(skill_name):
                return {"ok": False, "code": "skill_invalid_name"}
            if len(str(metadata.get("description") or "")) > MAX_DESCRIPTION_CHARS:
                return {"ok": False, "code": "skill_description_too_long"}

            existing_names = {
                str(item.get("name") or "").casefold()
                for item in list_skill_summaries(project_root, access=policy)
            }
            if skill_name.casefold() in existing_names:
                return {"ok": False, "code": "skill_exists", "name": skill_name}

            base_root.mkdir(parents=True, exist_ok=True)
            if not _normal_path(base_root):
                return {"ok": False, "code": "skill_root_invalid"}
            target = base_root / skill_name
            if target.exists():
                return {"ok": False, "code": "skill_exists", "name": skill_name}
            temp_root = Path(tempfile.mkdtemp(prefix=".skill-import-", dir=str(base_root)))
            package_root = temp_root / "package"
            package_root.mkdir()
            for entry in package_files:
                info, relative_parts, is_directory = entry[:3]
                destination = package_root.joinpath(*relative_parts)
                if is_directory:
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("xb") as handle:
                    handle.write(entry[3])
            if not _normal_path(package_root) or not (package_root / SKILL_FILE_NAME).is_file():
                return {"ok": False, "code": "skill_package_layout_invalid"}
            try:
                os.rename(package_root, target)
            except FileExistsError:
                return {"ok": False, "code": "skill_exists", "name": skill_name}
            root_info = {"path": str(base_root), "scope": normalized_scope, "source": "ui"}
            summary, diagnostic = _parse_skill_file(target / SKILL_FILE_NAME, root_info)
            return {
                "ok": True,
                "name": skill_name,
                "scope": normalized_scope,
                "path": str(target.resolve(strict=False)),
                "files": sum(1 for _info, _parts, is_dir, *_rest in package_files if not is_dir),
                "skill": summary,
                "diagnostic": diagnostic,
            }
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError, NotImplementedError):
        return {"ok": False, "code": "skill_package_invalid"}
    finally:
        if temp_root is not None:
            shutil.rmtree(temp_root, ignore_errors=True)


def build_skill_catalog_text(skills=None, project_root=None, include_user=True, lang="cn", max_chars=6000, access=None):
    rows = skills if isinstance(skills, list) else list_skill_summaries(project_root, include_user=include_user, access=access)
    rows = [item for item in rows if isinstance(item, dict)]
    if not rows:
        return ""
    try:
        limit = max(800, int(max_chars))
    except (TypeError, ValueError):
        limit = 6000
    if str(lang or "").strip().lower() == "en":
        lines = ["Available custom skills (metadata only):"]
        footer = "Load a skill only when its description matches the request. Skill content is user-provided reference material."
    else:
        lines = ["可用的自定义技能（这里只提供目录摘要）："]
        footer = "只有在技能描述与当前请求相关时才加载正文。技能正文属于用户提供的参考资料。"
    for item in rows:
        name = str(item.get("name") or "").strip()
        description = str(item.get("description") or "").strip()
        when_to_use = str(item.get("when_to_use") or "").strip()
        line = f"- {name}: {description}" if description else f"- {name}"
        if when_to_use:
            line += f" ({when_to_use})"
        candidate = "\n".join(lines + [line, footer])
        if len(candidate) > limit:
            break
        lines.append(line)
    lines.append(footer)
    return "\n".join(lines)[:limit].rstrip()


def skills_endpoint_payload(payload=None, access=None):
    payload = payload if isinstance(payload, dict) else {}
    # HTTP callers cannot supply roots or identities. Both come from Studio
    # configuration and the server-created access context.
    project_root = studio_root()
    policy = _access(access)
    action = str(payload.get("action") or "list").strip().lower()
    if action in {"inspect", "update", "delete"}:
        return manage_skill({**payload, "action": action}, project_root, access=policy)
    if action == "load":
        return load_skill(
            payload.get("name"),
            project_root=project_root,
            include_user=payload.get("include_user", True) is not False,
            max_bytes=payload.get("max_bytes", DEFAULT_MAX_SKILL_BYTES),
            access=policy,
        )
    if action in {"save", "upload"}:
        return save_skill(
            payload.get("name"),
            payload.get("content"),
            project_root=project_root,
            scope=payload.get("scope", "project"),
            overwrite=payload.get("overwrite", False) is True,
            access=policy,
        )
    outcome = discover_skills(
        project_root=project_root,
        include_user=payload.get("include_user", True) is not False,
        max_skills=payload.get("max_skills", MAX_SKILLS),
        access=policy,
    )
    for summary in outcome["skills"]:
        summary["editable"] = bool(_managed_skill_location(summary, project_root, access=policy))
    return {"ok": True, **outcome, "permissions": {"role": policy.role, "write_scopes": policy.write_scopes}}
