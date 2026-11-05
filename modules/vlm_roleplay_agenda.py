"""Evidence-backed story obligations with actor-specific progress."""
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any

from modules import vlm_roleplay_cognition as cognition
from modules.vlm_roleplay_memory import terms

SCHEMA = "simpai.vlm_roleplay.agenda"
KINDS = ("promise", "task", "foreshadowing")
STATUSES = ("pending", "active", "completed", "cancelled")


def text(value: Any, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def strings(value: Any, limit: int = 21, length: int = 160) -> list[str]:
    return list(dict.fromkeys(text(item, length) for item in value if text(item, length)))[:limit] if isinstance(value, list) else []


def revision(value: Any) -> int:
    try:
        return max(0, min(2_000_000_000, int(value or 0)))
    except (ValueError, TypeError, OverflowError):
        return 0


def source_ref(value: Any) -> dict:
    row = value if isinstance(value, dict) else {}
    return {
        "turn_id": text(row.get("turn_id"), 200), "branch_id": text(row.get("branch_id"), 160),
        "chapter_id": text(row.get("chapter_id"), 160), "message_ids": strings(row.get("message_ids"), 20, 240),
        "evidence": text(row.get("evidence"), 700),
        "origin": "director" if row.get("origin") == "director" else "manual",
    }


def normalize_item(value: Any) -> dict | None:
    row = value if isinstance(value, dict) else {}
    identifier, title = text(row.get("id"), 160), text(row.get("title"), 200)
    if not identifier or not title:
        return None
    progress = []
    for event in row.get("progress", []) if isinstance(row.get("progress"), list) else []:
        if not isinstance(event, dict) or event.get("status") not in STATUSES:
            continue
        progress.append({
            **source_ref(event), "status": event["status"], "note": text(event.get("note"), 700),
            "known_by": strings(event.get("known_by")),
        })
    return {
        "id": identifier, "title": title,
        "kind": row.get("kind") if row.get("kind") in KINDS else "task",
        "status": row.get("status") if row.get("status") in STATUSES else "pending",
        "condition": text(row.get("condition"), 500), "note": text(row.get("note"), 700),
        "participant_ids": strings(row.get("participant_ids")), "known_by": strings(row.get("known_by")),
        "source": source_ref(row.get("source")), "progress": progress,
        "revision": revision(row.get("revision")), "updated_at": text(row.get("updated_at"), 80),
    }


def normalize(value: Any = None) -> dict:
    data = value if isinstance(value, dict) else {}
    items, seen = [], set()
    for row in data.get("items", []) if isinstance(data.get("items"), list) else []:
        item = normalize_item(row)
        if item and item["id"] not in seen:
            seen.add(item["id"])
            items.append(item)
    result = {"schema": SCHEMA, "version": 1, "items": items, "revision": revision(data.get("revision"))}
    raw = data.get("undo")
    if isinstance(raw, dict) and all(isinstance(raw.get(key), list) and len(raw[key]) <= 6 for key in ("before", "after")):
        before = [normalize_item(row) for row in raw["before"]]
        after = [normalize_item(row) for row in raw["after"]]
        if (after and all(before) and all(after)
                and len({row["id"] for row in before}) == len(before)
                and len({row["id"] for row in after}) == len(after)
                and {row["id"] for row in before} <= {row["id"] for row in after}):
            receipt = {"session_id": text(raw.get("session_id"), 160), "branch_id": text(raw.get("branch_id"), 160),
                       "before": before, "after": after}
            if len(json.dumps(receipt, ensure_ascii=False)) <= 300000:
                result["undo"] = receipt
    return result


def material(session: dict, actor_id: str = "", *, private: bool = True, query: str = "") -> list[dict]:
    rows = []
    query_terms = set(terms(query))
    for item in normalize((session.get("story_state") or {}).get("agenda"))["items"]:
        if private and actor_id not in cognition.resolve_actor_ids(session, item["known_by"]):
            continue
        visible = [
            event for event in item["progress"]
            if not private or actor_id in cognition.resolve_actor_ids(session, event["known_by"])
        ]
        # An old imported record without progress must not disclose hidden changes.
        status = visible[-1]["status"] if visible else "pending" if private else item["status"]
        note = visible[-1]["note"] if visible else "" if private else item["note"]
        active = status in ("pending", "active")
        score = len(query_terms & set(terms(item["title"] + " " + item["condition"])))
        if not active and not score:
            continue
        rows.append((active, score, {
            "id": item["id"], "kind": item["kind"], "title": item["title"],
            "status": status, "condition": item["condition"], "note": note[:250],
            "participant_ids": item["participant_ids"],
        }))
    rows.sort(key=lambda row: (not row[0], -row[1]))
    return [row for _, _, row in rows[:8 if private else 20]]


def _participant_evidence(session: dict, ids: list[str], evidence: str, speaker_id: str,
                          user_message: str, assistant_reply: str, *, require_all: bool = False) -> bool:
    entities = {**session.get("characters", {}), session["persona"]["id"]: session["persona"]}
    first_person = bool(re.search(r"我|\bI\b|\bmy\b", evidence, re.I))
    supported = []
    for identifier in ids:
        if identifier not in entities:
            continue
        name = text(entities[identifier].get("name"), 200)
        if (name and name in evidence) or identifier in evidence:
            supported.append(identifier)
        elif first_person and ((identifier == speaker_id and evidence in assistant_reply)
                               or (identifier == session["persona"]["id"] and evidence in user_message)):
            supported.append(identifier)
        elif (identifier == session["persona"]["id"] and evidence in assistant_reply
              and re.search(r"你|您|\byou\b|\byour\b", evidence, re.I)):
            supported.append(identifier)
    return len(supported) == len(ids) if require_all else bool(supported) or not ids


def apply_updates(session: dict, updates: Any, *, turn_id: str, witnesses: list[str],
                  user_message: str, assistant_reply: str, speaker_id: str = "",
                  message_ids: list[str] | None = None) -> tuple[list[dict], list[str]]:
    """Apply only supported incremental operations; preserve manual definitions."""
    agenda = normalize(session["story_state"].get("agenda"))
    entities = {**session.get("characters", {}), session["persona"]["id"]: session["persona"]}
    by_id = {row["id"]: row for row in agenda["items"]}
    before, changes, warnings, touched = {}, [], [], set()
    source_text = "\n\n".join([user_message, assistant_reply])
    for operation in updates[:6] if isinstance(updates, list) else []:
        if not isinstance(operation, dict):
            warnings.append("agenda_invalid_operation_rejected")
            continue
        evidence = text(operation.get("evidence"), 700)
        if not cognition.evidence_is_grounded(evidence, source_text):
            warnings.append("agenda_evidence_rejected")
            continue
        identifier = text(operation.get("id"), 160)
        existing = by_id.get(identifier)
        action = operation.get("op")
        status = operation.get("status")
        if status not in STATUSES:
            warnings.append("agenda_status_rejected")
            continue
        if action == "add":
            participants = strings(operation.get("participant_ids"))
            if (not isinstance(operation.get("participant_ids"), list) or len(operation["participant_ids"]) > 21
                    or not participants or any(key not in entities for key in participants)
                    or not text(operation.get("title"), 200) or operation.get("kind") not in KINDS
                    or status not in ("pending", "active")):
                warnings.append("agenda_definition_rejected")
                continue
            if any(row["status"] in ("pending", "active") and row["kind"] == operation["kind"]
                   and set(row["participant_ids"]) == set(participants)
                   and (row["title"].casefold() == text(operation["title"], 200).casefold()
                        or row["source"]["evidence"] == evidence)
                   for row in by_id.values()):
                continue
            digest = hashlib.sha256(json.dumps([
                operation["kind"], text(operation["title"], 200), sorted(participants), turn_id
            ], ensure_ascii=False).encode()).hexdigest()[:24]
            identifier = "agenda_" + digest
            existing = by_id.get(identifier)
            if existing:
                continue
            item = normalize_item({**operation, "id": identifier, "progress": [], "revision": 0, "updated_at": ""})
        elif action == "update" and existing:
            item = copy.deepcopy(existing)
            participants = item["participant_ids"]
            if item["status"] in ("completed", "cancelled") and status != item["status"]:
                warnings.append("agenda_terminal_progress_rejected")
                continue
        else:
            warnings.append("agenda_target_rejected")
            continue
        if identifier in touched:
            continue
        if not _participant_evidence(session, participants, evidence, speaker_id, user_message, assistant_reply, require_all=action == "add"):
            warnings.append("agenda_participant_rejected")
            continue
        if status in ("completed", "cancelled") and (
            re.search(r"是否|有没有|能否|会不会|[吗？?]", evidence)
            or re.search(r"(?:未|没有|没|不会|不打算|不愿).{0,10}(?:完成|归还|交还|赴约|到达|抵达|履行|取消|放弃)"
                         r"|\b(?:not|never|hasn't|didn't|won't)\b.{0,35}(?:return|complete|arriv|cancel)", evidence, re.I)
        ):
            warnings.append("agenda_unestablished_progress_rejected")
            continue
        if status in ("completed", "cancelled") and re.search(r"明天|将会|打算|准备|答应|承诺|计划|如果|要是|假如|假设|可能|\b(?:will|would|plan|promise|might|if)\b", evidence, re.I):
            if not re.search(r"已经|完成|归还了|交还了|抵达|到达|如约|已履行|\b(?:returned|arrived|completed|fulfilled)\b", evidence, re.I):
                warnings.append("agenda_future_completion_rejected")
                continue
        if status == "cancelled" and not re.search(r"取消|放弃|作废|失约|解除|终止|不算数|\b(?:cancel|abandon|void|broke)", evidence, re.I):
            warnings.append("agenda_cancellation_evidence_rejected")
            continue
        known_by = cognition.resolve_actor_ids(session, operation.get("known_by"))
        known_by = [key for key in known_by if key in witnesses]
        if existing:
            known_by = [key for key in known_by if key in cognition.resolve_actor_ids(session, existing["known_by"])]
        if not known_by:
            warnings.append("agenda_knowledge_rejected")
            continue
        note = text(operation.get("note"), 700)
        if existing and status == existing["status"] and (status != "active" or note == existing["note"]) and any(
            step["status"] == status and set(known_by) <= set(step["known_by"])
            for step in existing["progress"]
        ):
            continue
        source = source_ref({"turn_id": turn_id, "branch_id": session.get("active_branch_id"),
                             "chapter_id": session.get("active_chapter_id"), "message_ids": message_ids or [],
                             "evidence": evidence, "origin": "director"})
        if existing:
            before[identifier] = copy.deepcopy(existing)
        else:
            item["known_by"], item["source"] = known_by, source
        step = {**source, "status": status, "note": note, "known_by": known_by}
        if step in item["progress"]:
            continue
        old_status = existing["status"] if existing else ""
        item.update(status=status, note=note, revision=item["revision"] + 1)
        item["progress"].append(step)
        by_id[identifier] = item
        touched.add(identifier)
        changes.append({"kind": "agenda", "op": "update" if existing else "add",
                        "id": identifier, "title": item["title"], "field": "status", "value": status,
                        "before": old_status, "after": status, "evidence": evidence})
    if changes:
        agenda["items"] = [by_id.pop(row["id"]) for row in agenda["items"]]
        agenda["items"].extend(by_id.values())
        agenda["revision"] += 1
        agenda["undo"] = {"session_id": session["id"], "branch_id": session["active_branch_id"],
                          "before": list(before.values()),
                          "after": [copy.deepcopy(row) for row in agenda["items"] if row["id"] in touched]}
        session["story_state"]["agenda"] = agenda
    return changes, list(dict.fromkeys(warnings))
