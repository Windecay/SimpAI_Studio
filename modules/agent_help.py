"""Read existing Studio help as reference data, without JS execution or network I/O."""

from functools import lru_cache
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
HELP_CONTENT = ROOT / "javascript/studio_help_content.js"
GUIDE_CONTENT = ROOT / "docs/vlm_skills/simpai_preset_guide.md"
LEGACY_DIRECTORY = ROOT / "presets/html"


@lru_cache(maxsize=4)
def _help_data(path, modified, size):
    source = Path(path).read_text(encoding="utf-8-sig")
    # This block is strict JSON shared with the browser. Never evaluate JS.
    begin = "/* studio-help-data:begin */"
    end = "/* studio-help-data:end */"
    if source.count(begin) != 1 or source.count(end) != 1:
        raise ValueError("Invalid shared help data")
    data = json.loads(source.split(begin, 1)[1].split(end, 1)[0])
    if "cfgSummary" in data:
        # The browser uses this same shared summary for the CFG introduction.
        data["topics"]["cfg"]["intro"] = data["cfgSummary"]
    return data


def help_data():
    stat = HELP_CONTENT.stat()
    return _help_data(str(HELP_CONTENT), stat.st_mtime_ns, stat.st_size)


def language(value):
    return "cn" if str(value or "").lower().startswith(("cn", "zh")) else "en"


def text(value, lang):
    if isinstance(value, str):
        return value
    return str((value or {}).get(lang) or (value or {}).get("en") or "")


def _markdown(title, intro, sections, lang):
    lines = ["# " + title, "", text(intro, lang)]
    for heading, items in sections:
        lines.extend(["", "## " + text(heading, lang)])
        for item in items:
            value = text(item, lang)
            href = item.get("href", "") if isinstance(item, dict) else ""
            parsed = urlsplit(href)
            if parsed.scheme == "https" and parsed.netloc and not parsed.username and not parsed.password:
                value += " (" + href + ")"
            lines.append("- " + value)
    return "\n".join(lines).strip()


def _document(identity, title, content, lang, source, **extra):
    return {"document_id": identity, "title": title, "content": content,
            "language": lang, "source": source, **extra}


def topic_document(key, lang, data=None):
    data = data or help_data()
    topic = data["topics"].get(key)
    if topic is None:
        return None
    title = text(data["titles"][key], lang)
    return _document("topic:" + key, title, _markdown(title, topic["intro"], topic.get("sections", []), lang),
                     lang, "studio_help", related=["topic:" + item for item in topic.get("links", [])])


def preset_document(entry, lang, theme="", data=None):
    data = data or help_data()
    name = entry["name"]
    schema = entry.get("schema") or {}
    theme = theme or schema.get("default_theme") or next(iter(schema.get("themes") or []), "")
    info = (schema.get("per_theme") or {}).get(theme) or {}
    tasks = info.get("supported_tasks") or (entry.get("media_capability") or {}).get("supported_tasks") or []
    known = [key for key in tasks if key in data["taskGuides"]]
    dedicated = data["presetGuides"].get(name)
    defaults = data["presetDefaults"]
    guide = dedicated or (data["taskGuides"][known[0]] if known else defaults["guide"])
    method = info.get("task_method") or entry.get("task_method") or ""
    hidden = info.get("disvisible", schema.get("disvisible", []))
    hidden = hidden if isinstance(hidden, (list, tuple, set)) else str(hidden).split(",")
    sam3 = (not {"sam3_video_mask_accordion", "sam3_input_video", "sam3_mask_video"}.intersection(hidden)
            and (name in data["sam3Presets"] or bool(re.search(r"sam3(?!d)", theme + " " + method, re.I))))
    duration = (data["h3DurationLimitNote"] if name in data["h3DurationLimitPresets"] else
                data["h3DurationNote"] if name in data["h3DurationPresets"] else None)
    labels = defaults["labels"]
    sections = [[labels["inputs"], [guide["inputs"]]]]
    if name in data["h3TwoPassPresets"]:
        sections.append([labels["modes"], data["h3SamplingModes"]])
    sections.append([labels["firstUse"], guide.get("steps", defaults["steps"])])
    if sam3:
        sections.extend(data["topics"]["sam3"]["sections"])
    notes = list(guide.get("notes", []))
    if guide.get("keyPoint"):
        notes.insert(0, guide["keyPoint"])
    if duration:
        notes.append(duration)
    if name in data["h3ShiftPresets"]:
        notes.append(data["h3ShiftNote"])
    if name in data["h3TwoPassPresets"]:
        notes.append(data["h3TwoPassControlNote"])
    if name in data["h3SpecificControlNotes"]:
        notes.append(data["h3SpecificControlNotes"][name])
    notes.append(defaults["missingModels"])
    sections.append([labels["details"], notes])
    if not dedicated and len(known) > 1:
        sections.append([labels["otherTasks"], [data["taskGuides"][key]["intro"] for key in known[1:]]])
    links = ["sam3", "media", "prompt", "models"] if sam3 else ["media", "prompt", "setup"]
    return _document("preset:" + name, name, _markdown(name, guide["intro"], sections, lang),
                     lang, "studio_help", preset_id=name, theme=theme,
                     related=["topic:" + key for key in links])


def guide_documents():
    from modules.vlm_preset_guide_router import _markdown_sections
    source = GUIDE_CONTENT.read_text(encoding="utf-8-sig")
    return [_document("guide:" + hashlib.sha256(heading.encode("utf-8")).hexdigest()[:16], heading, content,
                      "original", "preset_workflow_guide")
            for heading, content in _markdown_sections(source).items()]


class _HTMLText(HTMLParser):
    """Read text only: ignore scripts, styles, hidden content and external frames."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        hidden = (tag in {"script", "style", "iframe", "head", "noscript", "template", "svg"}
                  or "hidden" in attrs or attrs.get("aria-hidden") == "true"
                  or re.search(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", attrs.get("style", ""), re.I))
        skipped = bool(hidden or (self.stack and self.stack[-1][1]))
        if tag not in {"br", "hr", "img", "input", "meta", "link", "source", "wbr", "area", "base", "embed", "param", "track", "col"}:
            self.stack.append((tag, skipped))
        if not skipped and tag in {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_startendtag(self, tag, attrs):
        depth = len(self.stack)
        self.handle_starttag(tag, attrs)
        del self.stack[depth:]

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break
        if not (self.stack and self.stack[-1][1]) and tag in {"p", "div", "li", "tr", "h1", "h2", "h3", "h4"}:
            self.parts.append("\n")

    def handle_data(self, value):
        if not (self.stack and self.stack[-1][1]):
            self.parts.append(value)


def legacy_document(name, lang):
    # Only a known preset name is passed by the service. Reject path syntax too.
    if name in {"", ".", "..", "blank"} or re.search(r"[/\\:\x00-\x1f]", name):
        return None
    root = LEGACY_DIRECTORY.resolve()
    suffixes = [lang, "zh"] if lang == "cn" else [lang]
    candidates = [filename for suffix in suffixes for filename in (f"{name}.{suffix}.inc.html", f"{name}.inc.{suffix}.html")]
    candidates.append(f"{name}.inc.html")
    for filename in candidates:
        path = (root / filename).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            continue
        if path.stat().st_size > 1024 * 1024:
            continue
        parser = _HTMLText()
        parser.feed(path.read_text(encoding="utf-8-sig"))
        content = "\n".join(line.strip() for line in "".join(parser.parts).splitlines() if line.strip())
        if not content:
            continue
        return _document("legacy:" + name, name, content, "original" if filename == f"{name}.inc.html" else lang,
                         "preset_html", preset_id=name)
    return None


def documents(entries, lang, theme=""):
    data = help_data()
    result = [topic_document(key, lang, data) for key in data["topics"]]
    result.extend(guide_documents())
    for entry in entries.values():
        result.append(preset_document(entry, lang, theme, data))
        legacy = legacy_document(entry["name"], lang)
        if legacy:
            result.append(legacy)
    return result


def normalize(value):
    return unicodedata.normalize("NFKC", str(value or "")).casefold()


def search(documents, query, preset_id=""):
    query = normalize(query).strip()
    words = query.split()
    # Chinese questions usually have no spaces. Include meaningful adjacent
    # characters so “蒙版怎么使用” can find the existing 蒙版 guidance.
    for phrase in re.findall(r"[\u3400-\u9fff]{4,}", query):
        words.extend(phrase[index:index + 2] for index in range(len(phrase) - 1)
                     if phrase[index:index + 2] not in {"如何", "怎么", "使用", "什么", "为何", "一个"})
    words = list(dict.fromkeys(words))
    scored = []
    for order, document in enumerate(documents):
        title = normalize(document["title"])
        content = normalize(document["content"])
        matches = [word for word in words if word in title or word in content]
        if query and not matches:
            continue
        score = (40 if query and query in title else 0) + (15 if query and query in content else 0)
        score += sum(8 if word in title else 2 for word in matches)
        if preset_id and document.get("preset_id") == preset_id:
            score += 30
        position = min((content.find(word) for word in matches if word in content), default=0)
        summary = {key: value for key, value in document.items() if key not in {"content", "related"}}
        summary["snippet"] = document["content"][max(0, position - 45):position + 150].replace("\n", " ")
        scored.append((score, -order, summary))
    return [row for _, _, row in sorted(scored, key=lambda item: (item[0], item[1]), reverse=True)]


def read_document(identity, entries, lang, theme=""):
    kind, separator, key = identity.partition(":")
    if not separator:
        return None
    if kind == "topic":
        return topic_document(key, lang)
    if kind == "guide":
        return next((row for row in guide_documents() if row["document_id"] == identity), None)
    if kind in {"preset", "legacy"}:
        entry = entries.get(key)
        if entry is not None:
            return preset_document(entry, lang, theme) if kind == "preset" else legacy_document(key, lang)
    return None
