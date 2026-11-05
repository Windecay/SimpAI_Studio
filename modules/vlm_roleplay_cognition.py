from __future__ import annotations

import copy
import hashlib
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
                "roleplay_observation_only": True,
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


def normalize_continuity(value: Any) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    def index(value: Any) -> int:
        try:
            return max(0, min(1000000000, int(value or 0)))
        except (TypeError, ValueError, OverflowError):
            return 0

    def strings(value: Any, limit: int, length: int) -> list[str]:
        return list(dict.fromkeys(item[:length] for item in value if isinstance(item, str)))[:limit] if isinstance(value, list) else []

    events = []
    seen = set()
    for row in source.get("events", []) if isinstance(source.get("events"), list) else []:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str) or not row["id"] or row["id"][:160] in seen:
            continue
        seen.add(row["id"][:160])
        events.append({
            "id": str(row["id"])[:160], "text": str(row.get("text") or "")[:700],
            "evidence": str(row.get("evidence") or "")[:700],
            "known_by": strings(row.get("known_by"), 21, 160),
            "turn_id": str(row.get("turn_id") or "")[:200], "branch_id": str(row.get("branch_id") or "")[:160],
            "channel": row.get("channel") if isinstance(row.get("channel"), str) and row["channel"] in {"observed", "manual", "reported"} else "observed",
            "message_ids": strings(row.get("message_ids"), 20, 240),
        })
    presence = {}
    for key, row in source.get("presence", {}).items() if isinstance(source.get("presence"), dict) else []:
        if not isinstance(row, dict):
            continue
        item = {"is_present": bool(row.get("is_present"))}
        for name in ("last_seen_turn_id", "entry_turn_id"):
            if name in row:
                item[name] = str(row[name] or "")[:200]
        for name in ("last_seen_index", "entry_index"):
            if name in row:
                item[name] = index(row[name])
        if isinstance(row.get("departure"), dict):
            departure = row["departure"]
            item["departure"] = {"turn_id": str(departure.get("turn_id") or "")[:200],
                "index": index(departure.get("index")), "location": str(departure.get("location") or "")[:500],
                "known_facts": strings(departure.get("known_facts"), 20, 700)}
        presence[str(key)[:160]] = item
    return {
        "version": 1, "turn_id": str(source.get("turn_id") or "")[:200],
        "branch_id": str(source.get("branch_id") or "")[:160],
        "turn_index": index(source.get("turn_index")),
        "events": events,
        "presence": presence,
    }


def record_continuity(
    session: dict[str, Any], previous_observers: list[str], previous_scene: dict[str, Any],
    observations: list[dict[str, Any]], turn_id: str, message_ids: list[str],
) -> None:
    if not turn_id:
        return
    state = session["story_state"]
    data = normalize_continuity(state.get("cognition"))
    branch = session.get("active_branch_id") or "main"
    if (data["turn_id"], data["branch_id"]) != (turn_id, branch):
        data["turn_index"] += 1
    data["turn_id"], data["branch_id"] = turn_id, branch
    index = data["turn_index"]
    current = set(observer_ids(session))
    previous = set(previous_observers)
    for actor_id in dict.fromkeys([*(session.get("characters") or {}), (session.get("persona") or {}).get("id")]):
        if not actor_id:
            continue
        record = data["presence"].setdefault(actor_id, {})
        if actor_id in previous and actor_id not in current:
            record["departure"] = {
                "turn_id": turn_id, "index": index, "location": previous_scene.get("location", ""),
                "known_facts": list(state.get("knowledge", {}).get(actor_id) or [])[-20:],
            }
        if actor_id in current and actor_id not in previous:
            record["entry_turn_id"], record["entry_index"] = turn_id, index
        if actor_id in current:
            record["last_seen_turn_id"], record["last_seen_index"] = turn_id, index
        record["is_present"] = actor_id in current
    existing = {row["id"]: row for row in data["events"]}
    for observation in observations:
        identifier = "knowledge_" + hashlib.sha256(
            f"{branch}\n{turn_id}\n{observation['text']}\n{observation['evidence']}".encode("utf-8")
        ).hexdigest()[:24]
        if identifier in existing:
            existing[identifier]["known_by"] = list(dict.fromkeys([*existing[identifier]["known_by"], *observation["known_by"]]))
        else:
            row = {
                "id": identifier, "text": observation["text"], "evidence": observation["evidence"],
                "known_by": list(observation["known_by"]), "turn_id": turn_id, "branch_id": branch,
                "channel": "observed", "message_ids": list(message_ids),
            }
            data["events"].append(row)
            existing[identifier] = row
    state["cognition"] = data


def reentry_material(session: dict[str, Any], actor_id: str) -> dict[str, Any] | None:
    data = (session.get("story_state") or {}).get("cognition") or {}
    record = (data.get("presence") or {}).get(actor_id) or {}
    departure = record.get("departure") or {}
    if actor_id not in observer_ids(session) or not departure or record.get("entry_index") is None:
        return None
    if int(data.get("turn_index") or 0) - int(record["entry_index"]) > 1:
        return None
    state = session["story_state"]
    scene = state.get("scene") or {}
    return {
        "last_seen_turn_id": departure.get("turn_id", ""),
        "last_known_location": str(departure.get("location") or "")[:160],
        "last_known_facts": [str(item)[:180] for item in list(departure.get("known_facts") or [])[-4:]],
        "away_turns": max(0, int(record["entry_index"]) - int(departure.get("index") or 0)),
        "visible_now": {
            "location": str(scene.get("location") or "")[:500], "time": str(scene.get("time") or "")[:200],
            "people": [{"id": key, "name": str(session["characters"][key].get("name") or key)[:100]}
                       for key in scene.get("present_character_ids") or []
                       if key in session.get("characters", {}) and key != actor_id][:6],
        },
        "rule": "You did not witness events while absent. Current appearances do not reveal their causes. Do not infer elapsed days.",
    }
