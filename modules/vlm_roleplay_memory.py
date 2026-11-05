"""Bounded lexical recall and metadata for the persistent RP memory library."""
from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from typing import Any


def _strings(value: Any, limit: int = 24, chars: int = 240) -> list[str]:
    return list(dict.fromkeys(str(item).strip()[:chars] for item in value if str(item).strip()))[:limit] if isinstance(value, list) else []


def normalize_metadata(value: dict) -> dict:
    result = {}
    status = value.get("status")
    if isinstance(status, str) and status in {"invalid", "superseded"}:
        result["status"] = status
    for key in ("aliases", "subject_ids"):
        items = _strings(value.get(key), 24 if key == "aliases" else 21)
        if items:
            result[key] = items
    for key in ("invalid_reason", "merged_into"):
        if value.get(key):
            result[key] = str(value[key]).strip()[:400 if key == "invalid_reason" else 160]
    sources = []
    for row in value.get("sources", [])[:40] if isinstance(value.get("sources"), list) else []:
        if not isinstance(row, dict):
            continue
        source = {key: str(row.get(key) or "").strip()[:240] for key in
                  ("memory_id", "turn_id", "chapter_id", "branch_id", "created_at")}
        if source["memory_id"] or source["turn_id"]:
            sources.append(source)
    if sources:
        result["sources"] = sources
    return result


def active(memory: dict) -> bool:
    return memory.get("enabled", True) and memory.get("status", "active") == "active" and not memory.get("merged_into")


def terms(value: Any) -> list[str]:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()[:12000]
    result = re.findall(r"[a-z0-9_]+", text)
    for run in re.findall(r"[\u3400-\u9fff]+", text):
        if len(run) == 1:
            result.append(run)
        result.extend(run[index:index + 2] for index in range(len(run) - 1))
    return result


def recall_scores(memories: list[dict], query: str) -> dict[str, float]:
    """Rank only the already-authorized candidates; unrelated documents score zero."""
    query_terms = set(terms(re.sub(r"@(?:记忆|memory)\[[^\]]+\]", "", query, flags=re.I)))
    if not query_terms:
        return {}
    documents = [Counter(terms(" ".join([str(item.get("text") or ""), *item.get("keywords", []), *item.get("aliases", [])])))
                 for item in memories]
    frequency = Counter(term for document in documents for term in document.keys() & query_terms)
    average = sum(sum(document.values()) for document in documents) / max(1, len(documents))
    scores = {}
    for item, document in zip(memories, documents):
        matched = document.keys() & query_terms
        if not matched:
            continue
        # One shared Chinese bigram is too weak unless it is an explicit keyword/alias.
        phrases = [str(part).casefold() for part in [*item.get("keywords", []), *item.get("aliases", [])] if len(str(part)) >= 2]
        phrase_hit = any(phrase in query.casefold() for phrase in phrases)
        latin_hit = any(re.fullmatch(r"[a-z0-9_]+", term) and len(term) >= 3 for term in matched)
        if len(matched) < 2 and not phrase_hit and not latin_hit:
            continue
        length = sum(document.values())
        score = sum(math.log(1 + (len(documents) - frequency[term] + 0.5) / (frequency[term] + 0.5))
                    * document[term] * 2.2 / (document[term] + 1.2 * (0.25 + 0.75 * length / max(1, average)))
                    for term in matched)
        coverage = len(matched) / max(1, len(query_terms))
        scores[str(item["id"])] = min(30.0, score * (0.5 + coverage)) + (12.0 if phrase_hit else 0)
    return scores
