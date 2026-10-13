from __future__ import annotations

import copy
import re
from typing import Any


def resolve_actor_ids(session: dict[str, Any], references: Any) -> list[str]:
    entities = dict(session.get("characters") or {})
    persona = session.get("persona") or {}
    if persona.get("id"):
        entities[persona["id"]] = persona
    result = []
    for reference in references if isinstance(references, list) else []:
        reference = str(reference or "").strip()
        matches = [entity_id for entity_id, card in entities.items() if card.get("name") == reference]
        entity_id = reference if reference in entities else matches[0] if len(matches) == 1 else ""
        if entity_id and entity_id not in result:
            result.append(entity_id)
    return result[:21]


def observer_ids(session: dict[str, Any]) -> list[str]:
    state = session.get("story_state") or {}
    scene = state.get("scene") or {}
    result = resolve_actor_ids(session, scene.get("present_character_ids") or [])
    player = state.get("player_state") or {}
    player_id = str((session.get("persona") or {}).get("id") or "")
    if player_id and player.get("status", "present") != "absent":
        result.append(player_id)
    return list(dict.fromkeys(result))


def resource_is_visible(resource: dict[str, Any], session: dict[str, Any], actor_id: str) -> bool:
    visibility = str(resource.get("visibility") or "public").lower()
    references = resource.get("known_by") or resource.get("visible_to") or []
    if visibility in {"restricted", "private"} or references:
        return bool(actor_id and actor_id in resolve_actor_ids(session, references))
    return visibility == "public"


def visible_card(card: dict[str, Any]) -> dict[str, Any]:
    return {key: copy.deepcopy(card[key]) for key in ("id", "name", "appearance") if card.get(key)}


def visible_runtime(runtime: dict[str, Any], *, player: bool = False) -> dict[str, Any]:
    keys = ("location", "appearance", "status", "is_present") if player else ("location", "appearance")
    return {key: copy.deepcopy(runtime[key]) for key in keys if key in runtime}


def filter_history(history: Any, session: dict[str, Any], actor_id: str) -> list[dict[str, Any]]:
    rows = history if isinstance(history, list) else []
    player_id = str((session.get("persona") or {}).get("id") or "")
    result = []
    established = [
        observation for fact in (session.get("story_state") or {}).get("recent_turn_facts") or []
        if isinstance(fact, dict) for observation in normalize_observations(fact.get("observations"))
        if observation["evidence"]
    ]
    for index, item in enumerate(rows):
        if not isinstance(item, dict):
            result.append({"pending": True})
            continue
        role = str(item.get("role") or "").lower()
        control = item.get("roleplay_control_only") or item.get("roleplay_internal_turn") or (
            str(item.get("roleplay_turn_intent") or "").lower() in {"story_control", "control", "director"}
        )
        if role == "user" and re.match(r"^\s*(?:OOC\b|[\(（]\s*OOC\s*[\)）])", str(item.get("content") or ""), re.I):
            control = True
        allowed = False
        if role in {"user", "assistant"} and not item.get("pending") and not (role == "user" and control):
            references = item.get("roleplay_known_by", item.get("known_by", item.get("visible_to")))
            visibility = item.get("roleplay_visibility", item.get("visibility"))
            speaker_id = str(item.get("roleplay_speaker_id") or item.get("speaker_id") or "")
            if role == "assistant" and str(visibility or "").lower() == "private" and speaker_id:
                allowed = actor_id in resolve_actor_ids(session, [speaker_id])
            elif references is not None or visibility is not None:
                allowed = resource_is_visible(
                    {"known_by": references or [], "visibility": visibility or "restricted"}, session, actor_id,
                )
            elif role == "assistant":
                allowed = str(item.get("roleplay_speaker_id") or item.get("speaker_id") or "") == actor_id
            elif actor_id == player_id:
                allowed = True
            else:
                following = next(
                    (row for row in rows[index + 1:] if isinstance(row, dict) and row.get("role") in {"user", "assistant"}),
                    {},
                )
                before = following.get("roleplay_session_before") or {}
                allowed = following.get("role") == "assistant" and str(
                    following.get("roleplay_speaker_id") or following.get("speaker_id") or ""
                ) == actor_id
                if before:
                    allowed = allowed and actor_id in observer_ids(before)
        if allowed:
            result.append(copy.deepcopy(item))
            continue
        observations = normalize_observations(item.get("roleplay_observations"))
        public_text = []
        for observation in observations if role == "assistant" and not item.get("pending") else []:
            if not observation["evidence"] or actor_id not in resolve_actor_ids(session, observation["known_by"]):
                continue
            grounded = evidence_is_grounded(observation["evidence"], str(item.get("content") or ""))
            retained = any(
                known["text"] == observation["text"] and known["evidence"] == observation["evidence"]
                and actor_id in resolve_actor_ids(session, known["known_by"]) for known in established
            )
            if (grounded or retained) and observation["text"] not in public_text:
                public_text.append(observation["text"])
        if public_text:
            result.append({
                "role": "assistant", "content": "\n".join(public_text)[:2400],
                "roleplay_speaker_id": item.get("roleplay_speaker_id") or item.get("speaker_id") or "",
                "roleplay_known_by": [actor_id], "roleplay_visibility": "restricted",
            })
        else:
            result.append({"pending": True})
    return result


def normalize_observations(value: Any) -> list[dict[str, Any]]:
    result = []
    for item in value[:40] if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()[:700]
        references = item.get("known_by") or []
        if not text or not isinstance(references, list):
            continue
        result.append({
            "text": text,
            "known_by": list(dict.fromkeys(str(reference).strip()[:160] for reference in references if reference))[:21],
            "evidence": str(item.get("evidence") or "").strip()[:700],
        })
    return result


def evidence_is_grounded(evidence: str, source_text: str) -> bool:
    parts = [part.strip() for part in evidence.splitlines() if part.strip()]
    if not parts or not source_text or not all(any(character.isalnum() for character in part) for part in parts):
        return False
    position = 0
    for part in parts:
        found = source_text.find(part, position)
        if found < 0:
            return False
        position = found + len(part)
    return True


def validate_observations(
    value: Any, session: dict[str, Any], witnesses: list[str], source_text: str,
) -> list[dict[str, Any]]:
    result = []
    for item in normalize_observations(value):
        evidence = item["evidence"]
        if not evidence_is_grounded(evidence, source_text):
            continue
        known_by = [entity_id for entity_id in resolve_actor_ids(session, item["known_by"]) if entity_id in witnesses]
        if known_by:
            result.append({**item, "known_by": known_by})
    return result


def visible_turn_fact(value: dict[str, Any], session: dict[str, Any], actor_id: str) -> dict[str, Any]:
    observations = [
        item["text"] for item in normalize_observations(value.get("observations"))
        if item["evidence"] and actor_id in resolve_actor_ids(session, item["known_by"])
    ]
    if observations:
        return {"turn_id": value.get("turn_id") or "", "summary": "；".join(observations)[:1200]}
    if value.get("known_by") and resource_is_visible(value, session, actor_id):
        return copy.deepcopy(value)
    return {}
