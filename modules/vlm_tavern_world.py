"""SillyTavern world-info option aliases and keyword activation."""

from __future__ import annotations

import re
from typing import Any

from modules.vlm_tavern import expand_macros


ALIASES = {
    "case_sensitive": ("caseSensitive", "case_sensitive"),
    "match_whole_words": ("matchWholeWords", "match_whole_words"),
    "scan_depth": ("scanDepth", "scan_depth"),
    "exclude_recursion": ("excludeRecursion", "exclude_recursion"),
    "prevent_recursion": ("preventRecursion", "prevent_recursion"),
    "delay_until_recursion": ("delayUntilRecursion", "delay_until_recursion"),
    "selectiveLogic": ("selectiveLogic",),
    "useProbability": ("useProbability", "use_probability"),
    "probability": ("probability",),
    "group": ("group",),
    "group_weight": ("groupWeight", "group_weight"),
    "group_override": ("groupOverride", "group_override"),
    "sticky": ("sticky",), "cooldown": ("cooldown",), "delay": ("delay",),
    "depth": ("depth",), "role": ("role",), "position": ("position",),
    "use_regex": ("use_regex",),
    "selective": ("selective",),
    "match_persona_description": ("matchPersonaDescription", "match_persona_description"),
    "match_character_description": ("matchCharacterDescription", "match_character_description"),
    "match_character_personality": ("matchCharacterPersonality", "match_character_personality"),
    "match_character_depth_prompt": ("matchCharacterDepthPrompt", "match_character_depth_prompt"),
    "match_scenario": ("matchScenario", "match_scenario"),
    "match_creator_notes": ("matchCreatorNotes", "match_creator_notes"),
}


def normalize_options(source: dict) -> dict:
    extensions = dict(source.get("extensions")) if isinstance(source.get("extensions"), dict) else {}
    for canonical, aliases in ALIASES.items():
        found = False
        for container in (source, extensions):
            for alias in aliases:
                if alias in container and container[alias] is not None:
                    extensions[canonical] = container[alias]
                    found = True
                    break
            if found:
                break
    position = extensions.get("position", source.get("position", "before_char"))
    if position in ("before_char", "before", "↑Char"):
        position = 0
    elif position in ("after_char", "after", "↓Char"):
        position = 1
    try:
        position = int(position)
    except (TypeError, ValueError):
        position = 1
    extensions["position"] = position
    for key in (
        "case_sensitive", "match_whole_words", "exclude_recursion", "prevent_recursion",
        "selective", "useProbability", "use_regex", "match_persona_description",
        "match_character_description", "match_character_personality", "match_scenario",
        "match_character_depth_prompt", "match_creator_notes",
    ):
        if key in extensions and isinstance(extensions[key], str):
            extensions[key] = extensions[key].strip().lower() in {"true", "1", "on", "yes"}
    order = source.get("insertion_order", source.get("order", source.get("priority", 100)))
    try:
        extensions["tavern_order"] = int(order)
    except (TypeError, ValueError, OverflowError):
        extensions["tavern_order"] = 100
    extensions["_tavern"] = True
    return extensions


def is_imported(entry: dict) -> bool:
    return bool(entry.get("extensions", {}).get("_tavern")) or str(entry.get("source") or "").startswith("tavern")


def key_matches(text: str, key: str, options: dict) -> bool:
    expression = re.fullmatch(r"/(.*)/([imsugdy]*)", key, flags=re.S)
    if expression or options.get("use_regex"):
        pattern = expression[1] if expression else key
        flags_text = expression[2] if expression else ("i" if not options.get("case_sensitive") else "")
        flags = (re.I if "i" in flags_text else 0) | (re.M if "m" in flags_text else 0) | (re.S if "s" in flags_text else 0)
        try:
            return bool(re.search(pattern, text, flags))
        except (re.error, ValueError):
            return False
    haystack = text if options.get("case_sensitive") else text.lower()
    needle = key if options.get("case_sensitive") else key.lower()
    if not needle:
        return False
    if options.get("match_whole_words") and len(needle.split()) == 1:
        return bool(re.search(rf"(?:^|\W){re.escape(needle)}(?:$|\W)", haystack, flags=re.ASCII))
    return needle in haystack


def matches(entry: dict, query: str, history: list, metadata: dict, values: dict, recursion: str = "", scan_pass: int = 0) -> bool:
    options = entry.get("extensions", {})
    metadata = dict(metadata, **options.get("_tavern_book", {}))
    if scan_pass and not metadata.get("recursive_scanning", False):
        return False
    if scan_pass > 0 and options.get("exclude_recursion"):
        return False
    delay = options.get("delay_until_recursion") or 0
    try:
        if scan_pass < int(delay):
            return False
    except (ValueError, TypeError, OverflowError):
        return False
    if entry.get("mode") == "always":
        return True
    depth = options.get("scan_depth")
    try:
        depth = max(0, min(100, int(metadata.get("scan_depth", 2) if depth is None else depth)))
    except (ValueError, TypeError, OverflowError):
        depth = 2
    if depth == 0:
        return False
    messages = [
        str(item["content"]) for item in history
        if isinstance(item, dict) and not item.get("pending") and item.get("content")
    ]
    if query:
        messages.append(query)
    text = "\n".join(messages[-depth:]) if depth else ""
    if recursion:
        text += "\n" + recursion
    for flag, variable in (
        ("match_persona_description", "persona"), ("match_character_description", "description"),
        ("match_character_personality", "personality"), ("match_scenario", "scenario"),
        ("match_character_depth_prompt", "depthprompt"), ("match_creator_notes", "creatornotes"),
    ):
        if options.get(flag):
            text += "\n" + values.get(variable, "")
    settings = dict(options)
    for flag in ("case_sensitive", "match_whole_words"):
        if settings.get(flag) is None:
            settings[flag] = bool(metadata.get(flag, False))
    primary = any(key_matches(text, expand_macros(key, values).strip(), settings) for key in entry.get("keys", []))
    if not primary:
        return False
    secondary = entry.get("secondary_keys", [])
    if not options.get("selective") or not secondary:
        return True
    hits = [key_matches(text, expand_macros(key, values).strip(), settings) for key in secondary]
    logic = str(options.get("selectiveLogic", 0)).lower().replace(" ", "_")
    if logic in {"1", "not_all"}:
        return not all(hits)
    if logic in {"2", "not_any"}:
        return not any(hits)
    if logic in {"3", "and_all", "all"}:
        return all(hits)
    return any(hits)


def select_entries(entries: list[dict], query: str, history: list, metadata: dict, values: dict) -> list[dict]:
    selected = []
    selected_ids = set()
    recursion_parts = []
    recursive = bool(metadata.get("recursive_scanning", False)) or any(
        entry.get("extensions", {}).get("_tavern_book", {}).get("recursive_scanning", False) for entry in entries
    )
    for scan_pass in range(min(len(entries) + 1, 20) if recursive else 1):
        added = []
        recursion = "\n".join(recursion_parts)[-240000:]
        for entry in entries:
            if entry["id"] in selected_ids or not matches(entry, query, history, metadata, values, recursion, scan_pass):
                continue
            selected.append(entry)
            selected_ids.add(entry["id"])
            if not entry.get("extensions", {}).get("prevent_recursion"):
                added.append(expand_macros(entry.get("content"), values))
        if not added:
            pending_delay = any(
                entry["id"] not in selected_ids
                and isinstance(entry.get("extensions", {}).get("delay_until_recursion"), int)
                and entry["extensions"]["delay_until_recursion"] > scan_pass
                for entry in entries
            )
            if not (recursive and recursion_parts and pending_delay):
                break
        recursion_parts.extend(added)
    return sorted(selected, key=lambda entry: -int(entry.get("extensions", {}).get("tavern_order", entry.get("priority", 0))))


def unsupported_options(options: dict) -> list[str]:
    fields = [key for key in ("group", "sticky", "cooldown", "delay", "vectorized", "automation_id", "outlet_name") if options.get(key)]
    if options.get("useProbability") and options.get("probability", 100) != 100:
        fields.append("probability")
    if options.get("position") in {2, 3, 7}:
        fields.append("position")
    return fields
