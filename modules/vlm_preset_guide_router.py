import json
import logging
import os
import re
import unicodedata


logger = logging.getLogger(__name__)

PRESET_GUIDE_ROUTE_MANIFEST_FILE = "simpai_preset_guide_routes.json"
PRESET_GUIDE_SOURCE_FILE = "simpai_preset_guide.md"
PRESET_GUIDE_DEFAULT_MAX_CHARS = 4200


def _skills_dir():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "vlm_skills")


def _read_text_file(filename):
    clean = str(filename or "").replace("\\", "/").strip()
    if not clean or clean.startswith("/") or ".." in clean.split("/"):
        return ""
    path = os.path.join(_skills_dir(), clean)
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except Exception as exc:
        logger.warning("Preset guide source skipped: %s", exc)
        return ""


def load_preset_guide_route_manifest():
    text = _read_text_file(PRESET_GUIDE_ROUTE_MANIFEST_FILE)
    if not text:
        return {}
    try:
        data = json.loads(text)
    except Exception as exc:
        logger.warning("Preset guide route manifest skipped: %s", exc)
        return {}
    return data if isinstance(data, dict) else {}


def _normalize_language(value):
    text = str(value or "").strip().lower().replace("_", "-")
    return "cn" if text.startswith(("zh", "cn")) or text in {"chinese", "中文"} else "en"


def _normalize_query(value):
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"\s+", " ", text).strip()


def _keyword_matches(query, keyword):
    query = _normalize_query(query)
    keyword = _normalize_query(keyword)
    if not query or not keyword:
        return False
    if re.fullmatch(r"[a-z0-9]{2,5}", keyword):
        return bool(re.search(rf"(?<![a-z0-9]){re.escape(keyword)}(?![a-z0-9])", query))
    return keyword in query


def select_preset_guide_routes(query="", manifest=None):
    manifest = manifest if isinstance(manifest, dict) else load_preset_guide_route_manifest()
    routes = [item for item in manifest.get("routes") or [] if isinstance(item, dict) and item.get("key")]
    matches = []
    for order, route in enumerate(routes):
        keywords = [str(item or "").strip() for item in route.get("keywords") or [] if str(item or "").strip()]
        matched = [keyword for keyword in keywords if _keyword_matches(query, keyword)]
        if not matched:
            continue
        priority = int(route.get("priority") or 0)
        score = priority * 10000 + sum(len(_normalize_query(keyword)) for keyword in matched)
        matches.append((score, -order, route))
    if matches:
        matches.sort(reverse=True, key=lambda item: (item[0], item[1]))
        first = dict(matches[0][2])
        if first.get("exclusive"):
            return [first]
        limit = max(1, int(manifest.get("max_routes") or 2))
        return [dict(item[2]) for item in matches[:limit]]
    defaults = {str(item or "").strip() for item in manifest.get("default_routes") or []}
    return [dict(route) for route in routes if str(route.get("key") or "").strip() in defaults]


def _markdown_sections(source):
    matches = list(re.finditer(r"^##\s+(.+?)\s*$", str(source or ""), re.M))
    sections = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        sections[match.group(1).strip()] = source[match.start():end].strip()
    return sections


def _trim_markdown(text, max_chars):
    text = str(text or "").strip()
    limit = max(0, int(max_chars or 0))
    if not limit or len(text) <= limit:
        return text
    marker = "\n... routed section truncated"
    available = max(1, limit - len(marker))
    cut = text.rfind("\n", 0, available)
    if cut < max(80, available // 2):
        cut = available
    return text[:cut].rstrip() + marker


def build_preset_guide_context(query="", language="en", max_chars=PRESET_GUIDE_DEFAULT_MAX_CHARS):
    manifest = load_preset_guide_route_manifest()
    if not manifest:
        return ""
    source = _read_text_file(manifest.get("source") or PRESET_GUIDE_SOURCE_FILE)
    if not source:
        return ""
    sections = _markdown_sections(source)
    selected_routes = select_preset_guide_routes(query, manifest)
    selected_keys = [str(route.get("key") or "").strip() for route in selected_routes]
    selected_titles = []
    lang = _normalize_language(language)
    for route in selected_routes:
        title = route.get("title") if isinstance(route.get("title"), dict) else {}
        selected_titles.append(str(title.get(lang) or title.get("en") or route.get("key") or "").strip())

    requested_sections = []
    for route in selected_routes:
        requested_sections.extend(route.get("sections") or [])
    requested_sections.extend(manifest.get("always_sections") or [])
    ordered_sections = []
    for heading in requested_sections:
        clean = str(heading or "").strip()
        if clean and clean not in ordered_sections and clean in sections:
            ordered_sections.append(clean)

    route_label = ", ".join(selected_keys) or "overview"
    title_label = " / ".join(item for item in selected_titles if item) or route_label
    language_note = (
        "Visible answers and Preset display names must follow state.__lang=cn. Keep exact Preset keys when needed."
        if lang == "cn"
        else "Visible answers and Preset display names must follow state.__lang=en."
    )
    result = (
        "# SimpAI Preset Guide Routed Skill\n\n"
        f"Selected route(s): {route_label}. Selected topic(s): {title_label}.\n"
        "Only the knowledge selected for the current request is loaded. Do not invent behavior for omitted Presets.\n"
        f"{language_note}"
    )
    limit = max(1200, int(max_chars or PRESET_GUIDE_DEFAULT_MAX_CHARS))
    for heading in ordered_sections:
        separator = "\n\n"
        remaining = limit - len(result) - len(separator)
        if remaining < 120:
            break
        excerpt = _trim_markdown(sections.get(heading), remaining)
        if not excerpt:
            continue
        result += separator + excerpt
    return result[:limit].rstrip()
