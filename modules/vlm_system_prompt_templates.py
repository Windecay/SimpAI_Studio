import csv
import os
import re
from io import StringIO
from pathlib import Path


DEFAULT_TEMPLATE_CSV = Path(__file__).resolve().parent.parent / "docs" / "vlm_system_prompt_templates.csv"
TEMPLATE_CSV_ENV = "SIMPAI_VLM_SYSTEM_PROMPT_TEMPLATE_CSV"
TEMPLATE_DIR_ENV = "SIMPAI_VLM_SYSTEM_PROMPT_TEMPLATE_DIR"
MAX_TEMPLATE_CHARS = 12000
H3_PROMPT_WRITING_TEMPLATES = {
    "cn": {
        "id": "h3_prompt_writing_cn.md",
        "name": "H3 提示词写作",
        "filename": "h3_prompt_writing_cn.md",
    },
    "en": {
        "id": "h3_prompt_writing_en.md",
        "name": "H3 Prompt Writing",
        "filename": "h3_prompt_writing_en.md",
    },
}


def _clean_text(value):
    return str(value or "").strip()


def _normalize_language(value):
    raw = _clean_text(value).lower().replace("_", "-")
    if raw.startswith("en") or raw in {"english", "英文"}:
        return "en"
    if raw.startswith(("zh", "cn")) or raw in {"chinese", "simplified-chinese", "中文"}:
        return "cn"
    return ""


def _payload_language(payload):
    payload = payload if isinstance(payload, dict) else {}
    candidates = []
    for source in (payload.get("stage"), payload.get("user_context"), payload):
        if isinstance(source, dict):
            candidates.extend(source.get(key) for key in ("__lang", "lang", "language"))
    for value in candidates:
        language = _normalize_language(value)
        if language:
            return language
    return ""


def _is_default_template_source(source):
    try:
        return source.resolve() == DEFAULT_TEMPLATE_CSV.resolve()
    except OSError:
        return source == DEFAULT_TEMPLATE_CSV


def _h3_prompt_writing_template_entries(language="", max_chars=MAX_TEMPLATE_CHARS):
    skill_dir = DEFAULT_TEMPLATE_CSV.parent / "vlm_skills"
    entries = []
    languages = [language] if language else list(H3_PROMPT_WRITING_TEMPLATES)
    for item_language in languages:
        metadata = H3_PROMPT_WRITING_TEMPLATES.get(item_language)
        if not metadata:
            continue
        path = skill_dir / metadata["filename"]
        if not path.is_file():
            continue
        try:
            content = extract_system_prompt_template(_read_text(path), max_chars=max_chars)
        except Exception:
            continue
        if not content:
            continue
        stat = path.stat()
        entries.append({
            "id": metadata["id"],
            "name": metadata["name"],
            "filename": metadata["filename"],
            "content": content,
            "chars": len(content),
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "source": f"bundled:{metadata['filename']}",
            "template_dir": str(skill_dir),
            "template_source": str(path),
            "language": item_language,
        })
    return entries


def _template_source(payload=None, root=None):
    payload = payload if isinstance(payload, dict) else {}
    candidates = [
        root,
        payload.get("template_csv"),
        payload.get("template_file"),
        payload.get("template_path"),
        payload.get("template_dir"),
        os.environ.get(TEMPLATE_CSV_ENV),
        os.environ.get(TEMPLATE_DIR_ENV),
        DEFAULT_TEMPLATE_CSV,
    ]
    for value in candidates:
        text = _clean_text(value)
        if text:
            return Path(text)
    return DEFAULT_TEMPLATE_CSV


def _read_text(path):
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_text(encoding="utf-8", errors="replace")


def extract_system_prompt_template(content, max_chars=MAX_TEMPLATE_CHARS):
    text = str(content or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""

    match = re.search(r"(?im)^\s*系统提示词\s*[:：]\s*(.*)$", text)
    if match:
        inline = str(match.group(1) or "").strip()
        body = text[match.end() :].strip()
        text = f"{inline}\n{body}".strip() if inline else body

    stop = re.search(r"(?im)^\s*用户提示词\s*[:：].*$", text)
    if stop:
        text = text[: stop.start()].strip()

    text = re.sub(r"(?:\n\s*)*-{6,}\s*$", "", text).strip()
    if max_chars and len(text) > int(max_chars):
        text = text[: int(max_chars)].rstrip() + "\n..."
    return text


def _template_entry(path, root, max_chars=MAX_TEMPLATE_CHARS):
    stat = path.stat()
    content = extract_system_prompt_template(_read_text(path), max_chars=max_chars)
    return {
        "id": path.name,
        "name": path.stem,
        "filename": path.name,
        "content": content,
        "chars": len(content),
        "size": stat.st_size,
        "mtime": int(stat.st_mtime),
        "source": str(path),
        "template_dir": str(root),
        "template_source": str(root),
    }


def _template_entry_from_csv_row(row, source_path, mtime=0, max_chars=MAX_TEMPLATE_CHARS):
    row = row if isinstance(row, dict) else {}
    template_id = _clean_text(row.get("id") or row.get("filename") or row.get("name"))
    name = _clean_text(row.get("name") or Path(template_id).stem or template_id)
    filename = _clean_text(row.get("filename") or template_id)
    content = extract_system_prompt_template(
        row.get("content") or row.get("system_prompt") or row.get("prompt"),
        max_chars=max_chars,
    )
    if not template_id or not name or not content:
        return None
    entry = {
        "id": template_id,
        "name": name,
        "filename": filename,
        "content": content,
        "chars": len(content),
        "size": len(content.encode("utf-8")),
        "mtime": int(mtime or 0),
        "source": _clean_text(row.get("source")) or f"{source_path.name}:{template_id}",
        "template_dir": str(source_path.parent),
        "template_source": str(source_path),
    }
    language = _normalize_language(row.get("language"))
    if language:
        entry["language"] = language
    return entry


def _list_templates_from_csv(path, max_chars=MAX_TEMPLATE_CHARS):
    stat = path.stat()
    templates = []
    content = _read_text(path)
    reader = csv.DictReader(StringIO(content))
    for row in reader:
        entry = _template_entry_from_csv_row(row, path, mtime=stat.st_mtime, max_chars=max_chars)
        if entry:
            templates.append(entry)
    return templates


def _list_templates_from_dir(root, max_chars=MAX_TEMPLATE_CHARS):
    templates = []
    for path in sorted(root.glob("*.txt"), key=lambda item: item.name.lower()):
        if not path.is_file():
            continue
        try:
            entry = _template_entry(path, root, max_chars=max_chars)
        except Exception as exc:
            templates.append({
                "id": path.name,
                "name": path.stem,
                "filename": path.name,
                "content": "",
                "chars": 0,
                "source": str(path),
                "template_dir": str(root),
                "template_source": str(root),
                "error": str(exc),
            })
            continue
        if entry["content"]:
            templates.append(entry)
    return templates


def list_vlm_system_prompt_templates(payload=None, root=None, max_chars=MAX_TEMPLATE_CHARS):
    payload = payload if isinstance(payload, dict) else {}
    source = _template_source(payload=payload, root=root)
    if not source.exists():
        return {
            "ok": True,
            "templates": [],
            "count": 0,
            "template_dir": str(source.parent),
            "template_source": str(source),
            "message": "VLM system prompt template source is not available.",
        }

    if source.is_dir():
        templates = _list_templates_from_dir(source, max_chars=max_chars)
        template_dir = str(source)
    elif source.is_file():
        templates = _list_templates_from_csv(source, max_chars=max_chars)
        template_dir = str(source.parent)
    else:
        templates = []
        template_dir = str(source.parent)

    language = _payload_language(payload)
    if _is_default_template_source(source):
        templates.extend(_h3_prompt_writing_template_entries(language=language, max_chars=max_chars))
    if language:
        templates = [
            item for item in templates
            if not _normalize_language(item.get("language"))
            or _normalize_language(item.get("language")) == language
        ]

    return {
        "ok": True,
        "templates": templates,
        "count": len(templates),
        "template_dir": template_dir,
        "template_source": str(source),
    }


def resolve_vlm_system_prompt_template(template_id, payload=None, root=None, max_chars=MAX_TEMPLATE_CHARS):
    target = str(template_id or "").strip()
    if not target:
        return ""
    result = list_vlm_system_prompt_templates(payload=payload, root=root, max_chars=max_chars)
    for item in result.get("templates") or []:
        if target in {str(item.get("id") or ""), str(item.get("name") or ""), str(item.get("filename") or "")}:
            return str(item.get("content") or "").strip()
    return ""
