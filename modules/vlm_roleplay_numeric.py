"""Focused, hidden numeric settlement for roleplay turns."""

from __future__ import annotations

import copy
import json
import re
from typing import Any

from modules import vlm_roleplay as rp


def evidence_catalog(user_message: str, assistant_reply: str) -> dict[str, str]:
    result = {}
    for prefix, source, limit in (("user", user_message, 12000), ("reply", assistant_reply, 16000)):
        sentences = [text.strip() for text in re.split(r"(?<=[。！？!?；;])|\n+", rp._text(source, limit)) if text.strip()]
        result.update({f"{prefix}_{index + 1}": text for index, text in enumerate(sentences)})
    return result


def settlement_catalog(session: Any, user_message: str = "", speaker_id: str = "",
                       *, target_table=None) -> list[dict]:
    normalized = rp.normalize_roleplay_session(session)
    if rp._director_instruction_is_read_only(user_message) or rp._director_instruction_is_non_fact_command(user_message):
        return []
    present = rp._director_present_character_ids(normalized, speaker_id)
    player_id = normalized["persona"]["id"]
    entities = [{
        "target_entity_type": "player", "target_entity_id": player_id,
        "name": normalized["persona"].get("name") or player_id,
        "runtime": normalized["story_state"]["player_state"],
    }, *[{
        "target_entity_type": "character", "target_entity_id": entity_id,
        "name": card.get("name") or entity_id,
        "runtime": normalized["story_state"]["characters"].get(entity_id, {}),
    } for entity_id, card in normalized["characters"].items() if entity_id in present]]
    catalog = []
    refs = {(item["type"], item["id"]): item["ref"] for item in (target_table or [])}
    for entity in entities:
        entity_type = entity["target_entity_type"]
        entity_id = entity["target_entity_id"]
        if entity_type == "character" and entity_id not in present:
            continue
        fields = [
            field for field in rp._state_field_catalog(entity["runtime"].get("state_fields", []))
            if field["value_type"] in {"number", "ratio", "percent"}
        ]
        if not fields:
            continue
        path = ["player_state"] if entity_type == "player" else ["characters", entity_id]
        locked = normalized["character"].get("locked_fields", [])
        if rp._locked_path([*path, "state_fields"], locked):
            continue
        catalog.append({
            "entity_ref": refs.get((entity_type, entity_id), f"{entity_type}:{entity_id}"),
            "target_entity_type": entity_type,
            "target_entity_id": entity_id,
            "name": entity["name"],
            "is_present": rp._director_player_is_present(normalized) if entity_type == "player" else True,
            "current_state": rp._text(entity["runtime"].get("state_text", ""), 1600),
            "condition": entity["runtime"].get("condition", ""),
            "fields": fields,
        })
    return catalog


def build_settlement_prompt(session: Any, catalog: list[dict], user_message: str,
                            assistant_reply: str, *, speaker_id: str = "",
                            turn_intent: str = "", lang: str = "cn") -> str:
    normalized = rp.normalize_roleplay_session(session)
    language = "English" if str(lang).lower().startswith("en") else "Chinese"
    intent = rp.normalize_roleplay_turn_intent(turn_intent, normalized["story_state"]["player_state"])
    public_catalog = [
        {key: value for key, value in item.items() if key not in {"target_entity_id", "target_entity_type"}}
        for item in catalog
    ]
    speaker_ref = next((item["entity_ref"] for item in catalog
                        if item["target_entity_type"] == "character"
                        and item["target_entity_id"] == speaker_id), "")
    scene = copy.deepcopy(normalized["story_state"].get("scene", {}))
    scene["present_character_ids"] = [
        item["entity_ref"] for item in catalog if item["target_entity_type"] == "character"
    ]
    return "\n\n".join([
        "You are the hidden numeric state adjudicator for SimpAI Studio Roleplay.",
        f"Return JSON only; reasons use {language}. This output is never part of the character reply.",
        "The visible actor deliberately does NOT receive raw numeric stats. It describes effects in natural prose. "
        "You are responsible for translating established effects into existing numeric fields after every turn.",
        "Review EVERY field in the catalog exactly once: changes, unchanged, or uncertain. "
        "A state_text update is not a substitute for a numeric update. Do not return an empty object.",
        "Identify the recipient of each effect, separately from its actor and the speaking character. "
        "Healing changes each patient's health, not the healer's health; the healer's mana changes only "
        "if a cost is established. A group effect requires separate changes for all actual recipients. "
        "Missed, blocked, harmless, hypothetical or merely attempted attacks do not reduce health.",
        f"Speaking character reference: {speaker_ref}. Effective user intent: {intent}. "
        "Story-control instructions establish facts; do not treat them as the player's spoken action. "
        "An absent player stays unchanged unless an unquoted USER instruction names that player as the affected "
        "entity. Operator I/you/we and NPC dialogue never authorize changes to an absent player. "
        "Do not include off-scene characters or substitute the speaker as a default recipient.",
        "Use an explicit amount or final value from the latest instruction when available. Explicit user values "
        "override incompatible prose. Use basis=explicit. Unambiguous depletion, total loss of sanity or full "
        "recovery can map to zero/existing maximum with basis=endpoint.",
        "For a real effect with no stated number, use basis=estimated and a proportionate signed delta based on "
        "the field's meaning, current scale, established story rules, severity and ongoing conditions. "
        "Do not leave health unchanged after a confirmed injury solely because no damage number was narrated. "
        "Do not leave a clearly spent resource unchanged solely because no cost number was narrated. "
        "There is no universal fixed damage percentage. Never invent a new effect, change maximum values, "
        "assume every spell costs mana, or convert nonlethal pressure into death or complete depletion. "
        "Bandaging, giving medicine, speaking, walking and ordinary physical actions do not consume mana. "
        "A mana deduction needs evidence of actual magical resource consumption. Identical group effects on "
        "recipients with the same scale and no stated defensive difference use the same magnitude; being an "
        "enemy or an ally is not a reason for a different amount. "
        "An unstated exact magnitude alone is NOT a reason for uncertain when a bounded health, mana or sanity "
        "field has a clear consequence. Mental shock with confused thoughts decreases existing sanity by an "
        "estimated amount; it must not remain full solely because the prose omitted a number. "
        "delta is an absolute number of field units, not a fraction of the maximum: for 70/100, delta=-8 yields "
        "62/100; delta=0.2 adds only 0.2 points, not 20 percent. Use whole points for integer-valued game stats "
        "unless fractional values are already established by the story. "
        "If the effect or the scale is genuinely ambiguous, list the field as uncertain with a short reason.",
        "Apply only NEW effects this turn. Existing injuries and buffs persist but are not charged again merely "
        "because the old state mentions them. Ongoing damage applies again only if this turn establishes a tick "
        "or continued harm. Count the same event only once when both user and reply describe it. "
        "Do not reset resources, undo active effects, or change unrelated fields.",
        "Copy entity_ref and field IDs exactly. entity_ref already identifies the exact entity and its type; "
        "do not invent or separately assign an entity type. Never output translated labels as writable identifiers. "
        "Each change must use evidence_id copied from the numbered latest-exchange evidence below. The runtime "
        "retrieves the original sentence; do not rewrite, abbreviate or invent an evidence quote. "
        "Put interpretation in reason. "
        "Use delta OR value, never both. Return only numeric values/deltas, not a prose condition.",
        "For a changed field use changes=[{field_id, delta OR value, basis, evidence_id, reason}]. "
        "For an uncertain field use uncertain=[{field_id, reason}]. Remove those field IDs from unchanged. "
        "Keep every other field ID and every unaffected entity row in the filled form.",
        "Authoritative catalog (pre-turn values; do not replay old effects):",
        json.dumps(public_catalog, ensure_ascii=False),
        "Current scene:",
        json.dumps(scene, ensure_ascii=False),
        "Established current chapter summary:",
        rp._text(normalized["story_state"].get("chapter_summary"), 2400),
        "Numbered latest-exchange evidence. user_* is the latest user message; reply_* is the visible reply:",
        json.dumps(evidence_catalog(user_message, assistant_reply), ensure_ascii=False),
        "Complete this prefilled JSON form. Return ALL rows below, including unaffected/off-scene player rows. "
        "Move affected fields from unchanged to changes or uncertain; do not omit or duplicate any field.",
        json.dumps({"entities": [{
            "entity_ref": entity["entity_ref"],
            "changes": [],
            "unchanged": [field["field_id"] for field in entity["fields"]],
            "uncertain": [],
        } for entity in catalog]}, ensure_ascii=False),
    ])


def _compact(value: Any) -> str:
    return re.sub(r"\s+", "", str(value or ""))


def _evidence_sentence(quote: str, user_message: str, assistant_reply: str) -> str:
    for source in (user_message, assistant_reply):
        offset = source.find(quote)
        if offset < 0:
            continue
        left = max((source.rfind(token, 0, offset) for token in "。！？!?；;\n"), default=-1) + 1
        ends = [source.find(token, offset + len(quote)) for token in "。！？!?；;\n"]
        right = (
            offset + len(quote) if quote.endswith(tuple("。！？!?；;\n"))
            else min((end + 1 for end in ends if end >= 0), default=len(source))
        )
        sentence = source[left:right].strip()
        return sentence if len(sentence) <= 1200 else quote
    return quote


def _coordinated_recipients(session: dict, evidence: str) -> set[str]:
    names = {entity_id: card.get("name") or entity_id for entity_id, card in session["characters"].items()}
    names[session["persona"]["id"]] = session["persona"].get("name") or session["persona"]["id"]
    tokens = "|".join(re.escape(name) for name in sorted(names.values(), key=len, reverse=True))
    group = rf"(?P<group>(?:{tokens})(?:\s*(?:、|和|与|及|,|and)\s*(?:{tokens}))+)"
    pattern = (
        group +
        r"\s*(?:都|均|同时|分别|一起)?\s*(?:受伤|流血|被|受到|恢复|痊愈|"
        r"的伤口[^。；\n]{0,20}愈合|are\s+(?:injured|hurt|healed)|were\s+(?:injured|hurt|healed))"
    )
    object_pattern = r"(?:治疗|治愈|攻击|命中|击中|保护|影响|heals?|hits?)\s*" + group
    return {
        entity_id for expression in (pattern, object_pattern)
        for match in re.finditer(expression, evidence, re.IGNORECASE)
        for entity_id, name in names.items() if name in match.group("group")
    }


def parse_settlement(text: Any, session: Any, catalog: list[dict], user_message: str,
                     assistant_reply: str, *, speaker_id: str = "") -> dict:
    """Validate coverage, source quotes and exact targets before producing patches."""
    normalized = rp.normalize_roleplay_session(session)
    data = rp._extract_json_object(text)
    rows = data.get("entities") if isinstance(data, dict) else None
    expected = {
        (entity["target_entity_type"], entity["target_entity_id"], field["field_id"]): field
        for entity in catalog for field in entity["fields"]
    }
    entities = {entity["entity_ref"]: entity for entity in catalog}
    # Exact legacy references remain readable; no name/transliteration inference.
    entities.update({f"{item['target_entity_type']}:{item['target_entity_id']}": item for item in catalog})
    report = {"ok": False, "patches": [], "reviewed_count": 0, "expected_count": len(expected),
              "issues": [], "warnings": [], "decisions": [], "estimated_count": 0}
    if not isinstance(rows, list):
        report["issues"].append({"reason": "numeric_response_invalid"})
        return report
    seen = set()
    invalid = set()
    sources = [_compact(user_message), _compact(assistant_reply)]
    numbered_evidence = evidence_catalog(user_message, assistant_reply)
    for row in rows[:rp.MAX_ROLEPLAY_CHARACTERS + 1]:
        if not isinstance(row, dict):
            report["issues"].append({"reason": "numeric_entity_invalid"})
            continue
        entity = entities.get(row.get("entity_ref")) if isinstance(row.get("entity_ref"), str) else None
        if not entity:
            report["issues"].append({"reason": "numeric_entity_invalid"})
            continue
        entity_type, entity_id = entity["target_entity_type"], entity["target_entity_id"]
        for bucket in ("changes", "unchanged", "uncertain"):
            entries = row.get(bucket, [])
            if not isinstance(entries, list):
                report["issues"].append({"target_entity_id": entity_id, "reason": "numeric_bucket_invalid"})
                continue
            for entry in entries[:rp.MAX_CHARACTER_STATE_FIELDS]:
                field_id = entry if bucket == "unchanged" else entry.get("field_id") if isinstance(entry, dict) else None
                key = (entity_type, entity_id, field_id) if isinstance(field_id, str) else None
                if key not in expected or key in seen:
                    report["issues"].append({"target_entity_id": entity_id, "field_id": field_id,
                                             "reason": "numeric_field_unknown_or_duplicate"})
                    invalid.add(key)
                    continue
                seen.add(key)
                field = expected[key]
                decision = {"target_entity_type": entity_type, "target_entity_id": entity_id,
                            "field_id": field_id, "label": field["label"], "before": field["current_value"],
                            "status": bucket}
                report["decisions"].append(decision)
                if bucket == "unchanged":
                    continue
                if bucket == "uncertain":
                    report["issues"].append({**decision, "reason": rp._text(entry.get("reason"), 300) or "numeric_uncertain"})
                    continue
                evidence_id = entry.get("evidence_id")
                evidence = (
                    numbered_evidence.get(evidence_id, "") if isinstance(evidence_id, str)
                    else rp._text(entry.get("evidence"), 1200)
                )
                basis = entry.get("basis")
                value = None
                if ("delta" in entry) != ("value" in entry):
                    amount = rp._numeric_delta(entry.get("delta") if "delta" in entry else entry.get("value"))
                    if amount is not None:
                        value = (rp._apply_numeric_delta(field["current_value"], amount) if "delta" in entry
                                 else rp._coerce_numeric_state_value(field["current_value"], amount))
                    elif "value" in entry and isinstance(entry["value"], str):
                        candidate = entry["value"].strip()
                        ratio = rp._NUMERIC_STATE_RATIO_RE.fullmatch(candidate)
                        percent = rp._NUMERIC_STATE_PERCENT_RE.fullmatch(candidate)
                        if ratio and field["value_type"] == "ratio":
                            current_ratio = rp._NUMERIC_STATE_RATIO_RE.fullmatch(field["current_value"])
                            if (rp._numeric_delta(ratio.group(1)) is not None
                                    and rp._numeric_delta(ratio.group(2)) == rp._numeric_delta(current_ratio.group(2))):
                                value = rp._coerce_numeric_state_value(field["current_value"], candidate)
                        elif percent and field["value_type"] == "percent" and rp._numeric_delta(percent.group(1)) is not None:
                            value = rp._coerce_numeric_state_value(field["current_value"], candidate)
                error = ""
                if value is None or basis not in {"explicit", "endpoint", "estimated"}:
                    error = "numeric_value_or_basis_invalid"
                elif not evidence or not any(_compact(evidence) in source for source in sources):
                    error = "numeric_evidence_not_in_exchange"
                if not error and rp._state_field_display_compare_key(value) == rp._state_field_display_compare_key(field["current_value"]):
                    decision["status"] = "unchanged"
                    continue
                evidence = _evidence_sentence(evidence, user_message, assistant_reply)
                if not error and basis == "estimated" and rp._state_field_semantic_key(field["label"]) == "mana" and not re.search(
                    r"魔力|法力|\bmana\b|\bmp\b|magic(?:al)?\s+(?:energy|power|resource)", evidence, re.IGNORECASE,
                ):
                    decision["status"] = "unchanged"
                    decision["correction"] = "no_magical_resource_effect"
                    report["warnings"].append({**decision, "reason": "numeric_unestablished_mana_cost_ignored"})
                    continue
                if not error and rp._director_numeric_field_is_forbidden(
                    user_message, rp._state_field_semantic_key(field["label"]),
                    normalized=normalized, target_id=entity_id,
                ):
                    error = "numeric_field_locked_by_instruction"
                patch = {
                    "op": "set", "target_entity_type": entity_type, "target_entity_id": entity_id,
                    "field": "state_fields", "value": [{"field_id": field_id, "value": value}],
                    "evidence": evidence, "_director_numeric_settlement": True,
                    "_director_numeric_group_recipient": entity_id in _coordinated_recipients(normalized, evidence),
                }
                if not error:
                    path, target, _warnings = rp._director_patch_target(
                        normalized, copy.deepcopy(patch), speaker_id=speaker_id,
                        attribution_text=evidence, instruction_text=user_message,
                    )
                    if not path or target.get("entity_type") != entity_type or target.get("entity_id") != entity_id:
                        error = "numeric_target_rejected"
                if error:
                    invalid.add(key)
                    decision["status"] = "rejected"
                    report["issues"].append({**decision, "reason": error})
                    continue
                decision.update(after=value, basis=basis, evidence=evidence, reason=rp._text(entry.get("reason"), 300))
                if rp._state_field_display_compare_key(value) == rp._state_field_display_compare_key(field["current_value"]):
                    decision["status"] = "unchanged"
                else:
                    report["patches"].append(patch)
    for key in expected.keys() - seen:
        report["issues"].append({"target_entity_type": key[0], "target_entity_id": key[1], "field_id": key[2],
                                 "label": expected[key]["label"], "reason": "numeric_field_not_reviewed"})
    report["patches"] = [
        patch for patch in report["patches"]
        if (patch["target_entity_type"], patch["target_entity_id"], patch["value"][0]["field_id"]) not in invalid
    ]
    report["reviewed_count"] = len(seen - invalid)
    report["estimated_count"] = sum(
        decision.get("basis") == "estimated" and decision["status"] == "changes"
        and (decision["target_entity_type"], decision["target_entity_id"], decision["field_id"]) not in invalid
        for decision in report["decisions"]
    )
    report["ok"] = not report["issues"]
    return report


def without_numeric_patches(session: Any, patches: Any) -> list[dict]:
    """Only the settlement pass owns numeric writes; retain primary text patches."""
    normalized = rp.normalize_roleplay_session(session)
    result = []
    for original in patches if isinstance(patches, list) else []:
        if not isinstance(original, dict):
            continue
        patch = copy.deepcopy(original)
        descriptor = rp._director_raw_patch_target(normalized, patch)
        if not descriptor or descriptor[0][-1:] != ["state_fields"]:
            result.append(patch)
            continue
        fields = rp._state_field_schema_at_path(normalized["story_state"], descriptor[0])
        hint = rp._director_state_field_hint(patch.get("field") or patch.get("target_field"))
        retained = []
        for entry in rp._state_field_patch_entries(patch.get("value"), hint):
            index = rp._state_field_match_index_by_id(fields, entry.get("field_id"))
            if index is None:
                index = rp._state_field_match_index(fields, entry.get("label") or hint, use_aliases=True)
            if index is not None and rp._state_field_value_type(fields[index]["value"]) == "text":
                retained.append(entry)
        if retained:
            patch["value"] = retained
            result.append(patch)
    return result


def verify_settlement_commit(report: dict, session: Any) -> None:
    """A parsed proposal is not proof that the final state actually changed."""
    normalized = rp.normalize_roleplay_session(session)
    estimated = 0
    for decision in report.get("decisions", []):
        if decision.get("status") != "changes":
            continue
        runtime = (
            normalized["story_state"]["player_state"]
            if decision["target_entity_type"] == "player"
            else normalized["story_state"]["characters"].get(decision["target_entity_id"], {})
        )
        field = next((item for item in runtime.get("state_fields", [])
                      if rp._state_field_id(item.get("label")) == decision["field_id"]), {})
        actual = field.get("value")
        decision["committed_value"] = actual
        if rp._state_field_display_compare_key(actual) == rp._state_field_display_compare_key(decision["before"]):
            decision["status"] = "not_applied"
            report["issues"].append({**decision, "reason": "numeric_change_not_applied"})
        elif rp._state_field_display_compare_key(actual) != rp._state_field_display_compare_key(decision.get("after")):
            decision["basis"] = "runtime_corrected"
            decision["correction"] = "authoritative_value_applied"
        elif decision.get("basis") == "estimated":
            estimated += 1
    report["estimated_count"] = estimated
    report["ok"] = not report["issues"]
