"""Request-local entity references for the hidden state director."""

from __future__ import annotations

import copy
import json
from collections import Counter

from modules import vlm_roleplay as rp
from modules import vlm_roleplay_numeric as numeric


def entity_table(session, speaker_id=""):
    normalized = rp.normalize_roleplay_session(session)
    present = rp._director_present_character_ids(normalized, speaker_id)
    return [
        {"ref": "P0", "type": "player", "id": normalized["persona"]["id"],
         "name": normalized["persona"].get("name") or "Player",
         "present": rp._director_player_is_present(normalized)},
        *[
            {"ref": f"C{index}", "type": "character", "id": entity_id,
             "name": card.get("name") or entity_id, "present": entity_id in present}
            for index, (entity_id, card) in enumerate(normalized["characters"].items(), 1)
        ],
        {"ref": "S0", "type": "scene", "id": "scene", "name": "Scene"},
    ]


def prompt_budget(n_ctx=None):
    try:
        size = int(n_ctx or 8192)
    except (TypeError, ValueError):
        size = 8192
    # Match the stateless director cap; leave space for runtime formatting.
    return (6000 if size <= 8192 else min(12000, max(8000, int(size * .55)))) - 200


def _json(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _runtime(session, entity):
    state = session["story_state"]
    if entity["type"] == "scene":
        return state["scene"]
    if entity["type"] == "player":
        return state["player_state"]
    return state["characters"].get(entity["id"], {})


def public_table(session, table, *, numeric_enabled=False):
    rows = []
    refs = {item["id"]: item["ref"] for item in table if item["type"] == "character"}
    for entity in table:
        row = {key: value for key, value in entity.items() if key != "id"}
        runtime = _runtime(session, entity)
        allowed = (
            rp.DIRECTOR_PLAYER_FIELDS if entity["type"] == "player"
            else rp.DIRECTOR_CHARACTER_FIELDS if entity["type"] == "character"
            else rp.DIRECTOR_SCENE_FIELDS
        )
        fields = rp._state_field_catalog(runtime.get("state_fields", []))
        if numeric_enabled:
            fields = [field for field in fields if field["value_type"] == "text"]
        row["fields"] = sorted(allowed - {"state_fields"})
        row["state"] = {
            field: copy.deepcopy(runtime[field])
            for field in sorted(allowed - {"state_fields"})
            if runtime.get(field) not in (None, "", [], {})
        }
        if "present_character_ids" in row["state"]:
            row["state"]["present_character_ids"] = [
                refs[entity_id] for entity_id in row["state"]["present_character_ids"] if entity_id in refs
            ]
        if fields:
            row["fields"].append("state_fields")
            row["state_fields"] = fields
        rows.append(row)
    return rows


def _public_previous(previous, table):
    by_id = {(item["type"], item["id"]): item["ref"] for item in table}

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {key: convert(item) for key, item in value.items() if not key.startswith("_director_")}
        for prefix in ("target", "actor"):
            ref = by_id.get((str(result.get(f"{prefix}_entity_type")), str(result.get(f"{prefix}_entity_id"))))
            if ref:
                result.pop(f"{prefix}_entity_type", None)
                result.pop(f"{prefix}_entity_id", None)
                result[f"{prefix}_ref"] = ref
        return result

    return convert(previous)


def build_prompt(session, user_message, assistant_reply, table, *, speaker_id="",
                 turn_intent="", lang="cn", n_ctx=None, numeric_enabled=False,
                 review=None, previous=None, as_request=False):
    language = "English" if str(lang).lower().startswith("en") else "Chinese"
    intent = rp.normalize_roleplay_turn_intent(turn_intent, session["story_state"]["player_state"])
    speaker = next((item["ref"] for item in table
                    if item["type"] == "character" and item["id"] == speaker_id), "")
    rules = (
        f"Hidden state director. Return JSON only; prose values use {language}. "
        f"Speaker={speaker}; user intent={intent}.\n"
        "Use ONLY target_ref/actor_ref from the request table. Never invent IDs, names as IDs, or paths. "
        "P0 is the player, never an NPC. An alias in dialogue is not a new entity. "
        "Choose the affected entity, not automatically the speaker or actor. "
        "For multi-target effects update exactly the named recipients; do not broadcast effects. "
        "current_action describes its target's own action; state_text describes its target's condition. "
        "Second-person dialogue refers to the player only when no other addressee is established. "
        "Do not infer a player target from operator pronouns or NPC dialogue when the player is absent. "
        "Absent entities stay unchanged; only explicit unquoted user control naming the player may update "
        "the absent player. Player status allows present/absent only. Selecting a speaker does not grant presence. "
        "Story-control instructions establish facts without requiring the reply to repeat them; "
        "story-control intent alone does not change presence.\n"
        "Audit every new plot consequence against current state after each exchange, even without a direct "
        "request for a state update. Interpret custom fields by meaning; action ability means capacity to act, "
        "not obedience. No invented effects, thoughts, names or fields. Hypotheticals, questions, quoted "
        "commands and attempts are not established outcomes. Do not replay old effects. "
        "Use only listed fields; state_fields items use exact field_id and value. "
        "Use set for new incremental facts; replace only with a complete concise current snapshot when old "
        "text contradicts established facts; remove explicitly ended text states. Never clear state_fields. "
        "Preserve unrelated traits and ongoing effects. Appearance changes belong to appearance. "
        "evidence_id must quote the numbered latest-exchange source; never invent evidence.\n"
        + (
            "A separate numeric adjudicator owns ALL numeric fields. Do not output numeric state_fields; "
            "record physical/mental effects in text and turn_facts, including each affected recipient.\n"
            if numeric_enabled else
            "Numeric fields accept exact values, explicit deltas or unambiguous zero/full endpoints only; "
            "otherwise describe the established effect in text without inventing a number.\n"
        )
        + "Each patches item uses op,target_ref,field,value,evidence_id. "
        "Return patches and compact turn_facts (actions with actor_ref,target_ref,action,result,evidence_id; "
        "state_changes with target_ref,fields,summary,evidence_id). Empty arrays are valid after auditing. "
        "Do not write memory/world-book/chapter/image content. Set resource_signals flags only for durable "
        "events, reusable lore, chapter changes or distinctive visual moments respectively."
    )
    shape = {
        "patches": [],
        "turn_facts": {"actions": [], "state_changes": [], "appearance_changes": [],
                       "scene_changes": [], "durable_facts": [], "unchanged_entity_ids": []},
        "resource_signals": {"memory": False, "world_book": False, "chapter": False, "visual": False},
    }
    sections = [
        "JSON shape (fill only established changes):", _json(shape),
        "Authoritative request entity table:",
        _json(public_table(session, table, numeric_enabled=numeric_enabled)),
        "Numbered latest-exchange evidence:",
        _json(numeric.evidence_catalog(user_message, assistant_reply)),
    ]
    if review:
        sections += [
            "Focused review: " + str(review),
            "Keep valid changes. Correct only the reported issue; an unchanged result is allowed when justified.",
        ]
        if previous:
            sections += ["Previous proposals:", _json(_public_previous(previous, table))]
    prompt = "\n".join(sections if as_request else [rules, *sections])
    if len(prompt) > prompt_budget(n_ctx):
        raise ValueError("director_input_budget_exceeded")
    return {"prompt": prompt, "user_system_prompt": rules} if as_request else prompt


def decode_response(text, session, table, user_message="", assistant_reply=""):
    data = rp._extract_json_object(text)
    if not isinstance(data, dict):
        return rp.parse_director_response(text, session)
    by_ref = {item["ref"]: item for item in table}
    identities = {(item["type"], item["id"]) for item in table}
    evidence = numeric.evidence_catalog(user_message, assistant_reply)

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {key: convert(item) for key, item in value.items() if not key.startswith("_director_")}
        for prefix in ("target", "actor"):
            key = f"{prefix}_ref"
            candidate = result.get(key)
            if key not in result:
                candidate = result.get(f"{prefix}_entity_id")
                if not isinstance(candidate, str) or candidate not in by_ref:
                    continue
                if (str(result.get(f"{prefix}_entity_type")), candidate) in identities:
                    continue
            entity = by_ref.get(candidate) if isinstance(candidate, str) else None
            result.pop(key, None)
            if entity is None:
                result[f"{prefix}_entity_type"] = "unknown"
                result[f"{prefix}_entity_id"] = str(candidate or "")
                if prefix == "target":
                    result["_director_target_ref_invalid"] = True
                continue
            conflicting_id = (
                key in value and f"{prefix}_entity_id" in value
                and str(value[f"{prefix}_entity_id"]) not in {entity["id"], entity["ref"]}
            )
            conflicting_type = (
                key in value and f"{prefix}_entity_type" in value
                and value[f"{prefix}_entity_type"] != entity["type"]
            )
            result[f"{prefix}_entity_type"] = entity["type"]
            result[f"{prefix}_entity_id"] = entity["id"]
            if prefix == "target":
                result["_director_bound_target"] = True
                if conflicting_id or conflicting_type:
                    result["_director_target_ref_invalid"] = True
            elif conflicting_id or conflicting_type:
                result[f"{prefix}_entity_type"] = "unknown"
        if "evidence_id" in result:
            result["evidence"] = evidence.get(str(result["evidence_id"]), "")
            if not result["evidence"]:
                result["_director_evidence_invalid"] = True
        if result.get("field") == "present_character_ids" and isinstance(result.get("value"), list):
            character_ids = {item["id"] for item in table if item["type"] == "character"}
            if any(not isinstance(ref, str) or (
                ref not in character_ids and (ref not in by_ref or by_ref[ref]["type"] != "character")
            ) for ref in result["value"]):
                result["_director_scene_roster_invalid"] = True
            result["value"] = [
                by_ref[ref]["id"] if isinstance(ref, str) and ref in by_ref
                and by_ref[ref]["type"] == "character" else ref for ref in result["value"]
            ]
        if isinstance(result.get("unchanged_entity_ids"), list):
            result["unchanged_entity_ids"] = [
                by_ref[ref]["id"] for ref in result["unchanged_entity_ids"]
                if isinstance(ref, str) and ref in by_ref
            ]
        return result

    decoded = convert(data)
    fact_warnings = []
    facts = decoded.get("turn_facts")
    if isinstance(facts, dict):
        for key, rows in list(facts.items()):
            if not isinstance(rows, list):
                continue
            kept = []
            for row in rows:
                if isinstance(row, dict) and (row.get("_director_target_ref_invalid") or any(
                        f"{prefix}_entity_id" in row and
                        (str(row.get(f"{prefix}_entity_type")), str(row.get(f"{prefix}_entity_id"))) not in identities
                        for prefix in ("target", "actor"))):
                    fact_warnings.append("director_fact_target_unknown")
                    continue
                if isinstance(row, dict) and row.get("_director_evidence_invalid"):
                    fact_warnings.append("director_fact_evidence_rejected")
                    continue
                kept.append(row)
            facts[key] = kept
    parsed = rp.parse_director_response(_json(decoded), session)
    parsed["warnings"] = list(dict.fromkeys([*parsed["warnings"], *fact_warnings]))
    return parsed


def inspect_targets(session, parsed, *, speaker_id="", user_message="", assistant_reply=""):
    failed = []
    for index, patch in enumerate(parsed.get("patches") or []):
        if not isinstance(patch, dict):
            continue
        _, _, warnings = rp._director_patch_target(
            session, copy.deepcopy(patch), speaker_id=speaker_id,
            attribution_text=user_message + "\n" + assistant_reply, instruction_text=user_message,
        )
        if patch.get("_director_target_ref_invalid") or any(warning in {
            "director_character_target_unknown", "director_player_target_id_mismatch",
            "director_target_type_invalid", "director_scene_target_id_invalid",
            "director_bound_target_mismatch_rejected",
        } for warning in warnings):
            failed.append({"patch_id": f"R{index + 1}", "index": index,
                           "patch": copy.deepcopy(patch), "warnings": warnings})
    return failed


def build_repair_prompt(session, table, failed, user_message, assistant_reply, *, n_ctx=None):
    prompt = "\n".join([
        "Correct ONLY the target of the rejected patches. Return JSON only.",
        "Select target_ref from the entity table using the ORIGINAL exchange. P0 is the player, never an NPC. "
        "A transliteration is not an ID. Do not assume the speaker is the recipient. "
        "Return one correction per patch_id: {patch_id,target_ref,evidence_id}. "
        "If ambiguous, use {patch_id,uncertain:true}. Do not change values, fields or operations. "
        "Do not return successful patches or invent additional updates. "
        "Absent targets and field permissions remain enforced.",
        "Entity table:", _json(public_table(session, table)),
        "Rejected patches:", _json(_public_previous([
            {"patch_id": item["patch_id"], "proposal": item["patch"], "issues": item["warnings"]}
            for item in failed
        ], table)),
        "Original numbered evidence:", _json(numeric.evidence_catalog(user_message, assistant_reply)),
        'JSON shape: {"corrections":[]}. Fill only the listed rejected patch_ids.',
    ])
    if len(prompt) > prompt_budget(n_ctx):
        raise ValueError("director_input_budget_exceeded")
    return prompt


def merge_repairs(session, parsed, table, failed, text, *, speaker_id="",
                  user_message="", assistant_reply=""):
    data = rp._extract_json_object(text) or {}
    rows = data.get("corrections", [])
    rows = rows if isinstance(rows, list) else []
    counts = Counter(str(row.get("patch_id")) for row in rows if isinstance(row, dict))
    requests = {item["patch_id"]: item for item in failed}
    by_ref = {item["ref"]: item for item in table}
    evidence = numeric.evidence_catalog(user_message, assistant_reply)
    output = copy.deepcopy(parsed)
    accepted = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        patch_id = str(row.get("patch_id") or "")
        request = requests.get(patch_id)
        ref = row.get("target_ref")
        entity = by_ref.get(ref) if isinstance(ref, str) else None
        quote = evidence.get(str(row.get("evidence_id") or ""))
        if not request or counts[patch_id] != 1 or not entity or not quote or row.get("uncertain"):
            continue
        if entity["type"] != "scene" and entity["id"] not in rp._director_entity_mentions(session, quote):
            continue
        patch = copy.deepcopy(request["patch"])
        for key in list(patch):
            if key.startswith("_director_"):
                patch.pop(key)
        patch.update(target_entity_type=entity["type"], target_entity_id=entity["id"],
                     evidence=quote, _director_bound_target=True)
        path, target, _warnings = rp._director_patch_target(
            session, copy.deepcopy(patch), speaker_id=speaker_id,
            attribution_text=user_message + "\n" + assistant_reply, instruction_text=user_message,
        )
        if not path or (target.get("entity_type"), target.get("entity_id")) != (entity["type"], entity["id"]):
            continue
        patch.pop("path", None)
        output["patches"][request["index"]] = patch
        accepted.append(patch_id)
    return output, {
        "attempted": len(failed), "corrected": len(accepted),
        "pending_count": len(failed) - len(accepted),
        "pending": [{"patch_id": item["patch_id"], "field": item["patch"].get("field", ""),
                     "target": item["patch"].get("target_entity_id", "")}
                    for item in failed if item["patch_id"] not in accepted],
    }


def merge_field_review(session, original, reviewed):
    """Keep accepted proposals while correcting only invalid field entries."""
    output = copy.deepcopy(original)
    candidates = reviewed.get("patches") or []
    used = set()
    for index, patch in enumerate(original.get("patches") or []):
        alignment = rp.inspect_director_state_fields(session, {"patches": [patch]})
        if not alignment["needs_repair"]:
            continue
        descriptor = rp._director_raw_patch_target(session, patch) if isinstance(patch, dict) else None
        if not descriptor:
            continue
        matches = [
            (position, candidate) for position, candidate in enumerate(candidates)
            if position not in used and isinstance(candidate, dict)
            and rp._director_raw_patch_target(session, candidate) == descriptor
            and not rp.inspect_director_state_fields(session, {"patches": [candidate]})["needs_repair"]
        ]
        if len(matches) != 1:
            continue
        position, candidate = matches[0]
        existing = rp._state_field_schema_at_path(session["story_state"], descriptor[0])
        valid_ids = {rp._state_field_id(item["label"]) for item in existing}
        original_entries = rp._state_field_patch_entries(patch.get("value"))
        kept = [item for item in original_entries if item.get("field_id") in valid_ids]
        kept_ids = {item["field_id"] for item in kept}
        corrected = [
            item for item in rp._state_field_patch_entries(candidate.get("value"))
            if item.get("field_id") in valid_ids and item["field_id"] not in kept_ids
        ]
        if len(corrected) < max(1, alignment["unknown_count"]):
            continue
        replacement = copy.deepcopy(patch)
        replacement["value"] = [*kept, *corrected]
        output["patches"][index] = replacement
        used.add(position)
    return output
