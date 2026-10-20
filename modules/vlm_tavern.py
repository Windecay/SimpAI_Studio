"""Tavern prompt preset conversion and bounded, stateless actor message assembly."""

from __future__ import annotations

import copy
import json
import math
import re
from typing import Any


PRESET_SCHEMA = "simpai.vlm_roleplay.tavern_preset"
MAX_PROMPTS = 256
MAX_PROMPT_CHARS = 64000
MAX_PRESET_CHARS = 240000
MARKERS = {
    "worldInfoBefore", "worldInfoAfter", "charDescription", "charPersonality",
    "scenario", "personaDescription", "dialogueExamples", "chatHistory",
}
DEFAULT_ORDER = [
    "main", "worldInfoBefore", "personaDescription", "charDescription",
    "charPersonality", "scenario", "worldInfoAfter", "dialogueExamples",
    "chatHistory", "jailbreak",
]
FORMAT_KEYS = ("wi_format", "scenario_format", "personality_format", "new_example_chat_prompt")
SAMPLING_KEYS = ("temperature", "top_p", "top_k", "repetition_penalty", "min_p", "frequency_penalty", "presence_penalty")
MACROS = {
    "char", "user", "bot", "charifnotgroup", "userifnotgroup", "group", "groupnotmuted",
    "description", "chardescription", "personality", "charpersonality", "scenario",
    "persona", "mesexamples", "mesexamplesraw", "charprompt", "charjailbreak",
    "original", "lastmessage", "lastusermessage", "lastcharmessage", "newline",
    "trim", "noop", "wibefore", "wiafter", "system",
}


def _text(value: Any) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n") if isinstance(value, str) else ""


def _bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "on"}
    return bool(value)


def _integer(value: Any, default: int, lower: int, upper: int) -> int:
    try:
        return max(lower, min(upper, int(value)))
    except (ValueError, TypeError, OverflowError):
        return default


def _role(value: Any) -> str:
    if isinstance(value, int):
        return {0: "system", 1: "user", 2: "assistant"}.get(value, "system")
    return value if isinstance(value, str) and value in {"system", "user", "assistant"} else "system"


def normalize_regex_scripts(value: Any) -> list[dict]:
    rows = []
    for source in value[:MAX_PROMPTS] if isinstance(value, list) else []:
        if not isinstance(source, dict):
            continue
        row = {}
        for key in ("id", "scriptName", "findRegex", "replaceString"):
            if isinstance(source.get(key), str):
                row[key] = source[key][:240 if key in {"id", "scriptName"} else MAX_PRESET_CHARS]
        for key in ("disabled", "markdownOnly", "promptOnly", "runOnEdit"):
            if key in source:
                row[key] = _bool(source[key])
        for key in ("substituteRegex", "minDepth", "maxDepth"):
            item = source.get(key)
            if key in source and (item is None or type(item) is int or type(item) is float and math.isfinite(item)):
                row[key] = item
        if isinstance(source.get("trimStrings"), list):
            row["trimStrings"] = [item[:4096] for item in source["trimStrings"][:MAX_PROMPTS] if isinstance(item, str)]
        if isinstance(source.get("placement"), list):
            row["placement"] = [item for item in source["placement"][:32] if type(item) is int]
        if row:
            rows.append(row)
    return rows


def default_prompts() -> list[dict]:
    return [
        {
            "identifier": identifier, "name": identifier, "role": "system",
            "content": "", "marker": identifier in MARKERS, "enabled": True,
            "injection_position": 0, "injection_depth": 4, "injection_order": 100,
            "forbid_overrides": False,
        }
        for identifier in DEFAULT_ORDER
    ]


def normalize_preset(value: Any = None) -> dict:
    source = value if isinstance(value, dict) else {}
    prompts = []
    identifiers = set()
    total_chars = 0
    warnings = [str(item)[:500] for item in source.get("warnings", [])[:40]] if isinstance(source.get("warnings"), list) else []
    for index, item in enumerate(source.get("prompts", [])[:MAX_PROMPTS] if isinstance(source.get("prompts"), list) else []):
        if not isinstance(item, dict):
            continue
        identifier = str(item.get("identifier") or f"prompt_{index + 1}")[:160]
        if identifier in identifiers:
            continue
        identifiers.add(identifier)
        content = _text(item.get("content"))
        total_chars += len(content)
        prompts.append({
            "identifier": identifier,
            "name": str(item.get("name") or identifier)[:240],
            "role": _role(item.get("role")),
            "content": content,
            "marker": identifier in MARKERS or _bool(item.get("marker")),
            "enabled": _bool(item.get("enabled"), True),
            "injection_position": _integer(item.get("injection_position"), 0, 0, 1),
            "injection_depth": _integer(item.get("injection_depth"), 4, 0, 100),
            "injection_order": _integer(item.get("injection_order"), 100, -10000, 10000),
            "forbid_overrides": _bool(item.get("forbid_overrides")),
            "injection_trigger": [str(trigger)[:40] for trigger in item.get("injection_trigger", [])[:20]]
            if isinstance(item.get("injection_trigger"), list) else [],
        })
    too_large = total_chars > MAX_PRESET_CHARS or any(len(prompt["content"]) > MAX_PROMPT_CHARS for prompt in prompts)
    style = _text(source.get("style"))
    formats = source.get("formats") if isinstance(source.get("formats"), dict) else {}
    format_texts = [_text(formats.get(key)) for key in FORMAT_KEYS]
    if (len(style) > MAX_PROMPT_CHARS or any(len(text) > MAX_PROMPT_CHARS for text in format_texts)
            or total_chars + len(style) + sum(map(len, format_texts)) > MAX_PRESET_CHARS):
        too_large = True
    if too_large:
        prompts = []
        style = ""
        formats = {}
        warnings.append("preset_too_large")
    elif _bool(source.get("enabled")) and not prompts and not source.get("source_format"):
        prompts = default_prompts()
    sampling = {}
    for key in SAMPLING_KEYS:
        try:
            number = float(source.get("sampling", {}).get(key))
        except (ValueError, TypeError, AttributeError, OverflowError):
            continue
        if math.isfinite(number):
            sampling[key] = number
    return {
        "schema": PRESET_SCHEMA, "version": 1,
        "revision": _integer(source.get("revision"), 0, 0, 2147483647),
        "enabled": _bool(source.get("enabled")) and not too_large,
        "name": str(source.get("name") or "")[:240],
        "source_format": str(source.get("source_format") or "")[:80],
        "source_name": str(source.get("source_name") or "")[:240],
        "prompts": prompts, "style": style,
        "formats": {key: _text(formats[key])[:MAX_PROMPT_CHARS] for key in FORMAT_KEYS if key in formats},
        "sampling": sampling, "apply_sampling": _bool(source.get("apply_sampling")),
        "regex_scripts": normalize_regex_scripts(source.get("regex_scripts")),
        "warnings": list(dict.fromkeys(warnings))[:40],
    }


def _macro_warnings(text: str) -> list[str]:
    names = re.findall(r"\{\{\s*([^{}]+?)\s*\}\}", text)
    unknown = set()
    for name in names:
        if name.startswith("//") or name.lower() in {"/if", "/unless", "else"}:
            continue
        key = name.lower().strip()
        if key.startswith(("#if ", "#unless ")):
            key = key.split(" ", 1)[1].strip()
        if key not in MACROS:
            unknown.add(name.split("::", 1)[0][:80])
    return [f"unsupported_macro:{name}" for name in sorted(unknown)]


def import_preset(value: Any, filename: str = "") -> dict:
    raw = value
    if isinstance(raw, (bytes, bytearray)):
        for encoding in ("utf-8-sig", "utf-16"):
            try:
                raw = json.loads(bytes(raw).decode(encoding))
                break
            except (ValueError, UnicodeError):
                continue
    elif isinstance(raw, str):
        try:
            raw = json.loads(raw.lstrip("\ufeff"))
        except ValueError:
            return {"ok": False, "error": "tavern_preset_json_invalid"}
    if not isinstance(raw, dict):
        return {"ok": False, "error": "tavern_preset_json_invalid"}
    if raw.get("spec") or "character_book" in raw or "first_mes" in raw:
        return {"ok": False, "error": "character_card_file_detected"}
    if isinstance(raw.get("entries"), (list, dict)):
        return {"ok": False, "error": "world_book_file_detected"}
    source = raw.get("preset") if isinstance(raw.get("preset"), dict) else raw
    warnings = []
    prompts = []
    source_format = ""
    if isinstance(source.get("prompts"), list):
        source_format = "tavern_chat_completion"
        original = source["prompts"]
        if len(original) > MAX_PROMPTS or any(not isinstance(item, dict) for item in original):
            return {"ok": False, "error": "tavern_preset_prompts_invalid"}
        definitions = {}
        for index, prompt in enumerate(original):
            identifier = str(prompt.get("identifier") or f"prompt_{index + 1}")
            if identifier in definitions:
                return {"ok": False, "error": "tavern_preset_duplicate_identifier"}
            if prompt.get("role") not in (None, "system", "user", "assistant"):
                return {"ok": False, "error": "tavern_preset_role_invalid"}
            definitions[identifier] = dict(prompt, identifier=identifier)
        order_source = source.get("prompt_order")
        if isinstance(order_source, list) and order_source and all(isinstance(item, dict) and "identifier" in item for item in order_source):
            order = order_source
        elif isinstance(order_source, list) and order_source:
            profiles = [item for item in order_source if isinstance(item, dict) and isinstance(item.get("order"), list)]
            selected = next((item for item in profiles if str(item.get("character_id")) == "100001"), None)
            selected = selected or next((item for item in profiles if str(item.get("character_id")) == "100000"), None)
            if selected is None and len(profiles) == 1:
                selected = profiles[0]
            if selected is None:
                return {"ok": False, "error": "tavern_preset_order_ambiguous"}
            order = selected["order"]
        else:
            order = [{"identifier": identifier, "enabled": prompt.get("enabled", True)} for identifier, prompt in definitions.items()]
            warnings.append("prompt_order_missing")
        seen = set()
        for item in order:
            if not isinstance(item, dict) or not isinstance(item.get("identifier"), str):
                return {"ok": False, "error": "tavern_preset_order_invalid"}
            identifier = item["identifier"]
            if identifier in seen:
                return {"ok": False, "error": "tavern_preset_duplicate_order"}
            seen.add(identifier)
            definition = definitions.get(identifier)
            if definition is None and identifier in MARKERS:
                definition = {"identifier": identifier, "marker": True}
            if definition is None:
                warnings.append(f"prompt_definition_missing:{identifier}")
                continue
            prompts.append(dict(definition, enabled=_bool(item.get("enabled"), False)))
        prompts.extend(dict(prompt, enabled=False) for identifier, prompt in definitions.items() if identifier not in seen)
    elif isinstance(source.get("content"), str) and ("post_history" in source or "name" in source):
        source_format = "tavern_system_prompt"
        prompts = default_prompts()
        prompts[0]["content"] = source["content"]
        prompts[-1]["content"] = _text(source.get("post_history"))
    elif isinstance(source.get("story_string"), str):
        source_format = "tavern_context_template"
        prompts = [
            {"identifier": "context", "content": source["story_string"], "role": "system", "enabled": True},
            {"identifier": "chatHistory", "marker": True, "enabled": True},
        ]
        warnings.append("context_serialization_not_applied")
    elif isinstance(source.get("system_prompt"), str):
        source_format = "tavern_instruct_system_prompt"
        prompts = default_prompts()
        prompts[0]["content"] = source["system_prompt"]
        warnings.append("instruct_sequences_not_applied")
    else:
        return {"ok": False, "error": "tavern_preset_format_unsupported"}
    if not prompts:
        return {"ok": False, "error": "tavern_preset_prompts_empty"}
    for prompt in prompts:
        if prompt.get("injection_trigger") and set(prompt["injection_trigger"]) - {"normal"}:
            warnings.append("generation_trigger_subset")
        warnings.extend(_macro_warnings(_text(prompt.get("content"))))
    for key in ("assistant_prefill", "assistant_impersonation"):
        if source.get(key):
            warnings.append(f"preset_option_not_applied:{key}")
    extensions = source.get("extensions") if isinstance(source.get("extensions"), dict) else {}
    regex_source = source.get("regex_scripts") if "regex_scripts" in source else extensions.get("regex_scripts")
    if normalize_regex_scripts(regex_source):
        warnings.append("regex_scripts_preserved_not_executed")
    elif regex_source:
        warnings.append("preset_option_not_applied:regex_scripts")
    if set(extensions) - {"regex_scripts"}:
        warnings.append("preset_option_not_applied:extensions")
    preset = normalize_preset({
        "enabled": True, "revision": 1, "name": source.get("name") or filename.rsplit(".", 1)[0],
        "source_name": filename, "source_format": source_format, "prompts": prompts,
        "formats": {key: source[key] for key in FORMAT_KEYS if key in source},
        "sampling": {key: source[key] for key in SAMPLING_KEYS if key in source},
        "regex_scripts": regex_source,
        "warnings": warnings,
    })
    if "preset_too_large" in preset["warnings"]:
        return {"ok": False, "error": "tavern_preset_too_large"}
    return {"ok": True, "preset": preset, "warnings": preset["warnings"], "source_format": source_format}


def expand_macros(text: Any, values: dict, *, original: str = "", warnings: list | None = None) -> str:
    result = _text(text)
    variables = {key.lower(): _text(value) for key, value in values.items()}
    variables.update({"original": original, "newline": "\n", "noop": ""})
    result = re.sub(r"\{\{\s*//[^{}]*\}\}", "", result)
    conditional = re.compile(r"\{\{#(if|unless)\s+([A-Za-z]+)\s*\}\}((?:(?!\{\{#(?:if|unless)).)*?)\{\{/\1\}\}", re.S)
    for _ in range(12):
        def replace_conditional(match):
            truth = bool(variables.get(match[2].lower(), ""))
            if match[1] == "unless":
                truth = not truth
            branches = re.split(r"\{\{\s*else\s*\}\}", match[3], maxsplit=1)
            return branches[0] if truth else branches[1] if len(branches) > 1 else ""
        replaced = conditional.sub(replace_conditional, result)
        if replaced == result:
            break
        result = replaced
    result = re.sub(r"(?:\r?\n)*\{\{\s*trim\s*\}\}(?:\r?\n)*", "", result, flags=re.I)
    def replace_macro(match):
        name = match[1].strip().lower()
        if name in variables:
            return variables[name]
        if warnings is not None:
            warnings.append(f"unsupported_macro:{match[1].split('::', 1)[0][:80]}")
        return match[0]
    return re.sub(r"\{\{\s*([^{}]+?)\s*\}\}", replace_macro, result)


def _selected_world(context: dict) -> list[dict]:
    for block in context.get("blocks", []):
        if block.get("id") == "world_book" and block.get("content"):
            try:
                rows = json.loads(block["content"])
            except (TypeError, ValueError):
                return []
            return rows if isinstance(rows, list) else []
    return []


def _visible_persona(context: dict) -> dict:
    for block in context.get("blocks", []):
        if block.get("id") != "player":
            continue
        try:
            data = json.loads(block.get("content", ""))
        except (ValueError, TypeError):
            return {}
        persona = data.get("persona") if isinstance(data, dict) else None
        return persona if isinstance(persona, dict) else {}
    return {}


def has_actor_instructions(session: dict, speaker_id: str = "") -> bool:
    if normalize_preset(session.get("tavern_preset"))["enabled"]:
        return True
    card = session.get("characters", {}).get(speaker_id or session.get("active_character_id"), session.get("character", {}))
    tavern = card.get("import_metadata", {}).get("tavern", {})
    source_format = str(card.get("import_metadata", {}).get("source_format") or "")
    imported_world = any(
        entry.get("extensions", {}).get("_tavern") or str(entry.get("source") or "").startswith("tavern")
        for entry in session.get("world_book", {}).get("entries", [])
    )
    return bool(source_format.startswith(("tavern", "chara_card"))
                or imported_world or tavern.get("system_prompt") or tavern.get("post_history_instructions")
                or tavern.get("extensions", {}).get("depth_prompt", {}).get("prompt"))


def actor_context(context: dict, preset_enabled: bool) -> dict:
    result = copy.deepcopy(context)
    for block in result.get("blocks", []):
        if block.get("id") == "world_book" and preset_enabled:
            block["transport"] = "preset"
        if block.get("id") not in {"speaker", "player"}:
            continue
        try:
            data = json.loads(block["content"])
        except (ValueError, TypeError, KeyError):
            continue
        card = data.get("card")
        if isinstance(card, dict):
            card.pop("imported_instructions", None)
            if preset_enabled:
                for key in ("identity", "personality", "background", "example_dialogues"):
                    card.pop(key, None)
        if preset_enabled and isinstance(data.get("persona"), dict):
            data["persona"] = {key: value for key, value in data["persona"].items() if key in {"id", "name"}}
        block["content"] = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return result


def _example_messages(text: str, values: dict, heading: str) -> list[dict]:
    rows = []
    speakers = {values["user"]: "example_user", values["char"]: "example_assistant"}
    pattern = re.compile(r"^(" + "|".join(re.escape(name) for name in speakers) + r"):\s*(.*)$")
    for block in re.split(r"(?:^|\n)\s*<START>\s*(?:\n|$)", text, flags=re.I):
        if not block.strip():
            continue
        if heading.strip():
            rows.append({"role": "system", "content": heading})
        current_name = ""
        current_lines = []
        parsed = []
        for line in block.splitlines():
            match = pattern.match(line)
            if match:
                if current_name and current_lines:
                    parsed.append({"role": "system", "name": current_name, "content": "\n".join(current_lines).strip()})
                current_name = speakers[match[1]]
                current_lines = [match[2]]
            elif current_name:
                current_lines.append(line)
        if current_name and current_lines:
            parsed.append({"role": "system", "name": current_name, "content": "\n".join(current_lines).strip()})
        rows.extend(parsed or [{"role": "system", "content": "Example dialogue (not story events):\n" + block.strip()}])
    return rows


def build_actor_messages(session: dict, context: dict, system_prompt: str, history: list, user_message: Any,
                         latest_user_text: str | None = None) -> dict:
    preset = normalize_preset(session.get("tavern_preset"))
    configured = preset["enabled"]
    if not configured:
        preset["prompts"] = default_prompts()
    card = session.get("characters", {}).get(context.get("speaker_id") or session.get("active_character_id"), session.get("character", {}))
    persona = _visible_persona(context)
    tavern = card.get("import_metadata", {}).get("tavern", {})
    warnings = list(preset["warnings"])
    if any(session.get("persona", {}).get(key) for key in ("identity", "personality", "relationship_seed")):
        if any(prompt["enabled"] and (
            prompt["identifier"] == "personaDescription" or re.search(r"\{\{\s*persona\s*\}\}", prompt["content"], re.I)
        ) for prompt in preset["prompts"]):
            warnings.append("persona_uses_actor_visible_fields")
    world = _selected_world(context)
    values = {
        "char": card.get("name") or card.get("id") or "Character",
        "user": persona.get("name") or "User",
        "description": card.get("identity", ""),
        "personality": card.get("personality", ""),
        "scenario": card.get("background", ""),
        "persona": "\n".join(_text(persona.get(key)) for key in ("identity", "appearance", "personality", "relationship_seed") if persona.get(key)),
        "mesexamples": "\n<START>\n".join(card.get("example_dialogues", [])),
        "charprompt": _text(tavern.get("system_prompt")),
        "charjailbreak": _text(tavern.get("post_history_instructions")),
        "system": _text(tavern.get("system_prompt")),
    }
    values.update({
        "bot": values["char"], "charifnotgroup": values["char"], "userifnotgroup": values["user"],
        "group": values["char"], "groupnotmuted": values["char"],
        "chardescription": values["description"], "charpersonality": values["personality"],
        "mesexamplesraw": values["mesexamples"],
        "lastmessage": _text(user_message if latest_user_text is None else latest_user_text),
        "lastusermessage": _text(user_message if latest_user_text is None else latest_user_text),
        "lastcharmessage": next((_text(item.get("content")) for item in reversed(history) if item.get("role") == "assistant"), ""),
    })
    before = []
    after = []
    example_top = []
    example_bottom = []
    injections = []
    for entry in world:
        insertion = entry.get("insertion", {})
        position = insertion.get("position", 0)
        content = _text(entry.get("content"))
        warnings.extend(f"world_option_not_applied:{key}" for key in insertion.get("unsupported_options", []))
        if position == 7:
            warnings.append("world_outlet_not_inserted")
            continue
        if position == 4:
            injections.append({
                "content": content, "role": _role(insertion.get("role")),
                "injection_depth": _integer(insertion.get("depth"), 4, 0, 100),
                "injection_order": 100,
            })
        elif position == 0:
            before.append(content)
        elif position == 5:
            example_top.append(content)
        elif position == 6:
            example_bottom.append(content)
        else:
            after.append(content)
            if position not in {1}:
                warnings.append(f"world_position_approximated:{position}")
    values["wibefore"] = "\n".join(before)
    values["wiafter"] = "\n".join(after)
    formats = preset["formats"]
    markers = {
        "charDescription": values["description"],
        "charPersonality": expand_macros(formats.get("personality_format", "{{personality}}"), values, warnings=warnings),
        "scenario": expand_macros(formats.get("scenario_format", "{{scenario}}"), values, warnings=warnings),
        "personaDescription": values["persona"],
        "worldInfoBefore": _text(formats.get("wi_format", "{0}")).replace("{0}", values["wibefore"]) if before else "",
        "worldInfoAfter": _text(formats.get("wi_format", "{0}")).replace("{0}", values["wiafter"]) if after else "",
    }
    current = {"role": "user", "content": user_message, "_simpai_current_turn": True}
    chat = [copy.deepcopy(item) for item in history if item.get("role") in {"system", "user", "assistant"}]
    chat.append(current)
    messages = [{"role": "system", "content": expand_macros(system_prompt, values, warnings=warnings)}]
    history_added = False
    applied = []
    for prompt in preset["prompts"]:
        if not prompt["enabled"]:
            continue
        triggers = prompt.get("injection_trigger") or []
        if triggers and "normal" not in triggers:
            continue
        identifier = prompt["identifier"]
        content = prompt["content"]
        if identifier in {"main", "jailbreak"} and not prompt["forbid_overrides"]:
            override = values["charprompt" if identifier == "main" else "charjailbreak"]
            if override:
                content = expand_macros(override, values, original=content, warnings=warnings)
        if identifier in markers:
            content = markers[identifier]
        if prompt["injection_position"] == 1:
            injections.append(dict(prompt, content=expand_macros(content, values, warnings=warnings)))
            applied.append(identifier)
            continue
        if identifier == "chatHistory":
            messages.extend(chat)
            history_added = True
        elif identifier == "dialogueExamples":
            for text in example_top:
                messages.append({"role": "system", "content": expand_macros(text, values, warnings=warnings)})
            examples = expand_macros(values["mesexamples"], values, warnings=warnings)
            if examples:
                messages.extend(_example_messages(
                    examples, values, expand_macros(formats.get("new_example_chat_prompt", "[Example Chat]"), values, warnings=warnings),
                ))
            for text in example_bottom:
                messages.append({"role": "system", "content": expand_macros(text, values, warnings=warnings)})
        elif content.strip():
            messages.append({"role": prompt["role"], "content": expand_macros(content, values, warnings=warnings)})
        applied.append(identifier)
    if not history_added:
        messages.append(current)
        if configured:
            warnings.append("chat_history_marker_disabled_or_missing")
    depth_prompt = tavern.get("extensions", {}).get("depth_prompt", {})
    if depth_prompt.get("prompt"):
        injections.append({
            "role": _role(depth_prompt.get("role")),
            "content": expand_macros(depth_prompt["prompt"], values, warnings=warnings),
            "injection_depth": _integer(depth_prompt.get("depth"), 4, 0, 100),
            "injection_order": 100,
        })
    current_index = next((index for index, message in enumerate(messages) if message is current), len(messages) - 1)
    history_start = current_index - (len(chat) - 1 if history_added else 0)
    grouped = {}
    for injection in injections:
        if not injection.get("content", "").strip():
            continue
        depth = injection.get("injection_depth", 4)
        insertion_index = max(history_start, current_index + 1 - depth)
        grouped.setdefault(insertion_index, []).append(injection)
    for index in sorted(grouped, reverse=True):
        roles = {}
        for item in grouped[index]:
            key = (item.get("injection_order", 100), _role(item.get("role")))
            roles.setdefault(key, []).append(item["content"])
        keys = sorted(roles, key=lambda item: (item[0], {"assistant": 0, "user": 1, "system": 2}[item[1]]))
        messages[index:index] = [{"role": role, "content": "\n".join(roles[(order, role)])} for order, role in keys]
    if configured and preset["style"].strip():
        messages.append({"role": "system", "content": expand_macros(preset["style"], values, warnings=warnings)})
    return {
        "messages": messages,
        "report": {
            "enabled": configured, "name": preset["name"], "source_format": preset["source_format"],
            "applied_prompt_ids": applied, "injections": len(injections),
            "warnings": list(dict.fromkeys(warnings))[:40],
            "chars": sum(len(str(message["content"])) for message in messages),
        },
    }
