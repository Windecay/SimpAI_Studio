"""Keep an explicitly unfinished roleplay reply out of story-state updates."""

import re


def incomplete_reply_reason(text):
    text = str(text or "").strip()
    if not text:
        return ""
    # Fenced code and inline code can intentionally contain unmatched quotes.
    prose = re.sub(r"```[\s\S]*?```|`[^`\n]*`", "", text).strip().rstrip("*_").rstrip()
    if not prose:
        return ""
    if prose.endswith((",", "\uff0c", "\u3001", ":", "\uff1a", ";", "\uff1b")):
        return "unfinished_sentence"
    quotes = prose.replace("\u201c", '"').replace("\u201d", '"')
    if quotes.count('"') % 2 and re.search(r'(?:^|[\s\uff1a:])"', quotes):
        return "unclosed_dialogue"
    return ""


def guard_incomplete_reply(result, *, trace=None):
    completion = result.get("completion") if isinstance(result, dict) else None
    completion = completion if isinstance(completion, dict) else {}
    normal_stop = completion.get("status") == "completed" or completion.get("finish_reason") in {
        "stop", "end_turn",
    }
    if not isinstance(result, dict) or not result.get("ok") or completion.get("output_limited") or not normal_stop:
        return result
    text = str(result.get("text") or result.get("raw_text") or "")
    reason = incomplete_reply_reason(text)
    if not reason:
        return result
    if callable(trace):
        trace("detected", reason, result)

    return {
        **result, "ok": False, "code": "roleplay_reply_incomplete",
        "error": "roleplay_reply_incomplete", "text": "", "raw_text": "", "partial_text": text,
        "agent_actions": [], "limited_actions": [],
        "completion": {
            **completion, "provider_status": completion.get("status"),
            "status": "interrupted", "reason": "suspected_early_stop",
            "reply_integrity": {"attempts": 1, "reason": reason},
        },
    }
