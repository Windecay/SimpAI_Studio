"""Request-local entity references for the hidden state director."""

from __future__ import annotations

import copy
import json
import re
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
        "Use table target_ref/actor_ref only, never invented IDs or paths. "
        "P0 is the player, never an NPC. An alias in dialogue is not a new entity. "
        "Choose the affected entity, not automatically the speaker or actor. "
        "For multi-target effects update exactly the named recipients; do not broadcast effects. "
        "current_action describes its target's own action; state_text describes its target's condition. "
        "Begin current_action with the target's table name. "
        "Never copy spoken questions or threats into state_text. A question addressed to P0 is not "
        "P0's condition. Describe the speaker's actual action in current_action, or omit a state patch. "
        "Second person means P0 only without another addressee. "
        "Do not infer a player target from operator pronouns or NPC dialogue when the player is absent. "
        "Absent entities stay unchanged; only explicit unquoted user control naming the player may update "
        "the absent player. Player status allows present/absent only. Selecting a speaker does not grant presence. "
        "present_character_ids uses C refs only; P0 presence belongs in P0.status. "
        "Story-control instructions establish facts without requiring the reply to repeat them; "
        "story-control intent alone does not change presence.\n"
        "Audit every new plot consequence against current state after each exchange, even without a direct "
        "request for a state update. Interpret custom fields by meaning; action ability means capacity to act, "
        "not obedience. No invented effects, thoughts, names or fields. Hypotheticals, questions, quoted "
        "commands and attempts are not established outcomes. Do not replay old effects. "
        "Use only listed fields; state_fields items use exact field_id and value. "
        "Use set for new incremental facts; replace only with a complete concise current snapshot when old "
        "text contradicts established facts; remove explicitly ended text states. Never clear state_fields. "
        "Remove superseded claims in each changed field: no 'uninjured' after injury or 'bleeding' after it stops. "
        "Treatment does not mean healed. Do not repeat unchanged facts in incremental patches. "
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


def resolve_evidence(row, catalog):
    """Resolve exact source references, including bounded lists, without guessing IDs."""
    raw = row.get("evidence_id", row.get("evidence_ids"))
    if isinstance(raw, str):
        raw = raw.strip()
        if raw.startswith("["):
            try:
                raw = json.loads(raw)
            except (ValueError, TypeError):
                pass
        elif raw not in catalog and re.fullmatch(r"(?:user|reply)_\d+(?:[\s,;，、]+(?:user|reply)_\d+)+", raw):
            raw = re.split(r"[\s,;，、]+", raw)
    refs = raw if isinstance(raw, list) else [raw]
    if 0 < len(refs) <= 8 and all(isinstance(ref, str) and ref.strip() in catalog for ref in refs):
        quote = "\n".join(catalog[ref] for ref in dict.fromkeys(ref.strip() for ref in refs))
        if len(quote) <= 1200:
            return quote
    quote = row.get("evidence")
    if isinstance(quote, str) and 4 <= len(quote.strip()) <= 1200:
        quote = quote.strip()
        matches = [source for source in catalog.values() if quote in source]
        if len(set(matches)) == 1:
            return matches[0] if len(matches[0]) <= 1200 else ""
    return ""


def decode_response(text, session, table, user_message="", assistant_reply=""):
    data = rp._extract_json_object(text)
    if not isinstance(data, dict):
        return rp.parse_director_response(text, session)
    by_ref = {item["ref"]: item for item in table}
    identities = {(item["type"], item["id"]) for item in table}
    evidence = numeric.evidence_catalog(user_message, assistant_reply)
    reference_issues = []

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
        if "evidence_id" in result or "evidence_ids" in result or result.get("_director_bound_target"):
            result["evidence"] = resolve_evidence(result, evidence)
            if not result["evidence"]:
                result["_director_evidence_invalid"] = True
                reference_issues.append({
                    "target": str(result.get("target_entity_id") or ""),
                    "field": str(result.get("field") or ""),
                    "reference": str(result.get("evidence_id", result.get("evidence_ids", "")))[:180],
                })
        if result.get("field") == "present_character_ids" and isinstance(result.get("value"), list):
            character_ids = {item["id"] for item in table if item["type"] == "character"}
            has_character = any(
                isinstance(ref, str) and (ref in character_ids or (
                    ref in by_ref and by_ref[ref]["type"] == "character"
                )) for ref in result["value"]
            )
            if has_character:
                result["value"] = [
                    ref for ref in result["value"]
                    if not (isinstance(ref, str) and ref in by_ref and by_ref[ref]["type"] == "player")
                ]
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
    echo_count = 0
    if isinstance(decoded.get("patches"), list):
        kept_patches = []
        for patch in decoded["patches"]:
            entity = next((item for item in table if isinstance(patch, dict) and
                           (item["type"], item["id"]) == (
                               patch.get("target_entity_type"), patch.get("target_entity_id"))), None)
            if (
                entity and "present" in entity and patch.get("field") in ("present", "is_present")
                and isinstance(patch.get("value"), bool) and patch["value"] == entity["present"]
                and patch.get("op", "set") in ("set", "replace")
                and not patch.get("_director_target_ref_invalid")
            ):
                echo_count += 1
                continue
            kept_patches.append(patch)
        decoded["patches"] = kept_patches
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
    dialogue_rows = [
        patch for patch in parsed.get("patches", [])
        if rp.director_non_state_dialogue_reason(patch)
    ]
    if dialogue_rows:
        parsed["patches"] = [
            patch for patch in parsed["patches"]
            if not rp.director_non_state_dialogue_reason(patch)
        ]
        fact_warnings.append("director_non_state_dialogue_ignored")
    parsed["warnings"] = list(dict.fromkeys([*parsed["warnings"], *fact_warnings]))
    if echo_count:
        parsed["warnings"].append("director_presence_echo_ignored")
    parsed["reference_issues"] = reference_issues[:40]
    return parsed


def inspect_targets(session, parsed, *, speaker_id="", user_message="", assistant_reply=""):
    failed = []
    for index, patch in enumerate(parsed.get("patches") or []):
        if not isinstance(patch, dict):
            continue
        target_candidate = copy.deepcopy(patch)
        target_candidate.pop("_director_evidence_invalid", None)
        _, _, warnings = rp._director_patch_target(
            session, target_candidate, speaker_id=speaker_id,
            attribution_text=user_message + "\n" + assistant_reply, instruction_text=user_message,
        )
        target_invalid = patch.get("_director_target_ref_invalid") or any(warning in {
            "director_character_target_unknown", "director_player_target_id_mismatch",
            "director_target_type_invalid", "director_scene_target_id_invalid",
            "director_bound_target_mismatch_rejected",
        } for warning in warnings)
        if target_invalid or patch.get("_director_evidence_invalid"):
            failed.append({"patch_id": f"R{index + 1}", "index": index,
                           "kind": "target" if target_invalid else "evidence",
                           "patch": copy.deepcopy(patch), "warnings": warnings})
    return failed


def build_repair_prompt(session, table, failed, user_message, assistant_reply, *, n_ctx=None):
    prompt = "\n".join([
        "Correct ONLY the failed references of the rejected patches. Return JSON only.",
        "Select target_ref from the entity table using the ORIGINAL exchange. P0 is the player, never an NPC. "
        "A transliteration is not an ID. Do not assume the speaker is the recipient. "
        "Return one correction per patch_id: {patch_id,target_ref,evidence_id}. "
        "If ambiguous, use {patch_id,uncertain:true}. Do not change values, fields or operations. "
        "Do not return successful patches or invent additional updates. "
        "For kind=evidence, keep the original target and correct only evidence_id. "
        "For kind=target, choose the actual affected entity and its evidence. "
        "Absent targets and field permissions remain enforced.",
        "Entity table:", _json(public_table(session, table)),
        "Rejected patches:", _json(_public_previous([
            {"patch_id": item["patch_id"], "kind": item.get("kind", "target"),
             "proposal": item["patch"], "issues": item["warnings"]}
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
        if request and request.get("kind") == "evidence":
            original = request["patch"]
            entity = next((item for item in table if
                           (item["type"], item["id"]) == (
                               original.get("target_entity_type"), original.get("target_entity_id"))), None)
            if ref and (not entity or ref != entity["ref"]):
                continue
        quote = resolve_evidence(row, evidence)
        if not request or counts[patch_id] != 1 or not entity or not quote or row.get("uncertain"):
            continue
        if request.get("kind") != "evidence" and entity["type"] != "scene" and entity["id"] not in rp._director_entity_mentions(session, quote):
            continue
        patch = copy.deepcopy(request["patch"])
        for key in list(patch):
            if key in {"_director_target_ref_invalid", "_director_evidence_invalid"}:
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
    report = {
        "attempted": len(failed), "corrected": len(accepted),
        "pending_count": len(failed) - len(accepted),
        "pending": [{"patch_id": item["patch_id"], "field": item["patch"].get("field", ""),
                     "target": item["patch"].get("target_entity_id", "")}
                    for item in failed if item["patch_id"] not in accepted],
    }
    evidence_pending = sum(item.get("kind") == "evidence" and item["patch_id"] not in accepted for item in failed)
    if evidence_pending:
        report["evidence_pending_count"] = evidence_pending
    return output, report


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
