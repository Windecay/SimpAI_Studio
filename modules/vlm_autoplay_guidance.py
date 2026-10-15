"""Persistent autoplay instructions and conservative proposal checks."""

import hashlib
import json
import re


MAX_GOAL_CHARS = 4000
MAX_STYLE_CHARS = 1000
MAX_MESSAGE_CHARS = 4000

TASK_RULES = (
    "The operator_guidance.goal is the immediate task for this unsent proposal. "
    "It takes priority over the persona's long-term goals and earlier requests, but never overrides proxy_policy "
    "or the input author's knowledge and permissions.",
    "If the goal requires information not yet known, propose a neutral question or observation toward that goal "
    "or request confirmation. Do not silently return to an older goal.",
    "Guidance is an instruction, not dialogue, knowledge or an established event. "
    "Do not invent prior incidents, injury causes, consent, successful outcomes or NPC reactions, including "
    "assumptions hidden inside a question. Only refer to circumstances established in the approved context.",
    "When the proposal refers to a pause keyword, retain that exact word and request confirmation. "
    "Do not avoid a boundary by replacing its subject with a pronoun, synonym or an omitted location.",
    "A goal change does not mean the previous goal failed, succeeded or became impossible, and does not "
    "invalidate earlier approved information. Do not invent a causal explanation for changing direction. "
    "When no reason was established, propose the requested next action without adding a since/because premise.",
)

_CHOICES = {
    "commitment": (
        r"我(?:们)?(?:现在|决定|愿意|会|就|将|正式|马上|立刻){0,3}(?:答应|承诺|保证|发誓|同意|接受|签署|签订)",
        r"\b(?:I|we)\s+(?:will\s+|shall\s+|hereby\s+)?(?:agree|accept|promise|swear|sign)\b",
    ),
    "transaction": (
        r"我(?:们)?(?:现在|决定|愿意|会|就|将|马上|立刻){0,3}(?:支付|转账|借出|借给|买下|购买|出售|卖掉|交出)",
        r"我(?:们)?(?:现在|决定|愿意|会|就|将|马上|立刻|先|想|准备|打算){0,3}(?:把|将)"
        r"[^，,。！？!?；;\n]{1,32}?(?<!不)(?<!不会)(?:交给|交出|转交给|转给|送给|卖给|借给)",
        r"\b(?:I|we)\s+(?:will\s+|shall\s+)?(?:pay|purchase|buy|sell|lend|transfer|hand over)\b",
    ),
    "revelation": (
        r"我(?:们)?(?:现在|决定|愿意|会|就|将|马上|立刻){0,3}(?:透露|泄露|公开|揭露|坦白|告知.{0,20}(?:秘密|身份))",
        r"\b(?:I|we)\s+(?:will\s+|shall\s+)?(?:reveal|disclose|confess)\b",
    ),
    "irreversible": (
        r"我(?:们)?(?:现在|决定|愿意|会|就|将|马上|立刻){0,3}(?:杀死|杀掉|自杀|处决|销毁|摧毁|亲吻|吻|脱下.{0,8}(?:衣服|衣物))",
        r"\b(?:I|we)\s+(?:will\s+|shall\s+)?(?:kill|execute|destroy|kiss|undress)\b",
    ),
}


def normalize_guidance(value=None):
    source = value if isinstance(value, dict) else {}
    try:
        revision = max(0, min(2_000_000_000, int(source.get("revision") or 0)))
    except (ValueError, TypeError, OverflowError):
        revision = 0
    keywords = source.get("pause_keywords") or []
    if isinstance(keywords, str):
        keywords = keywords.splitlines()
    if not isinstance(keywords, list):
        keywords = []
    return {
        "enabled": source.get("enabled") is True,
        "revision": revision,
        "goal": source["goal"].strip()[:MAX_GOAL_CHARS] if isinstance(source.get("goal"), str) else "",
        "style": source["style"].strip()[:MAX_STYLE_CHARS] if isinstance(source.get("style"), str) else "",
        "pause_keywords": list(dict.fromkeys(
            str(item).strip()[:120] for item in keywords if isinstance(item, str) and item.strip()
        ))[:20],
        "confirm_important": source.get("confirm_important") is not False,
    }


def signature(value=None):
    normalized = normalize_guidance(value)
    encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:24]


def prompt(value=None, turn_intent=""):
    guidance = normalize_guidance(value)
    if not guidance["enabled"]:
        return ""
    message_instruction = (
        "The message must contain only one story-control direction for the next turn, not a line "
        "or action spoken by the player. Preserve the player's scene presence. "
        if turn_intent == "story_control" else
        "The message must contain only the next direct question or attempted action. "
    )
    return (
        "DIRECTED AUTOPLAY: the following is the operator's persistent guidance, not dialogue, "
        "player knowledge, a completed action, or permission to control other characters. "
        "The current goal is the immediate task, ahead of older goals and dialogue, within proxy_policy "
        "and the author's existing knowledge. If information is missing, propose a question toward this goal "
        "or request confirmation; do not substitute an earlier task. "
        "Prefer a concrete next attempt toward this goal. Follow its tone, prohibitions and conditions. "
        "Do not invent new crises, completed results, consent or NPC reactions. "
        "Questions must not assume an unprovided past incident or injury cause. "
        "Respect proxy_policy and pause for unclear or important choices; never claim they already happened. "
        "Return JSON ONLY with exactly these fields: "
        '{"message":"one next user input","needs_confirmation":false,"reason":""}. '
        + message_instruction
        + "Put contextual explanations and your rationale only in reason, not in message. "
        "Do not prepend a since/because justification to the message to rationalize changing the goal. "
        "Set needs_confirmation=true for a major commitment, transaction, secret disclosure, "
        "irreversible choice or any action whose permission is unclear. "
        "The message is an UNSENT proposal. Do not update state, execute tools, or assert safety "
        "instead of following the boundaries. For story_control, keep the player absent when absent.\n"
        + json.dumps(guidance, ensure_ascii=False, separators=(",", ":"))
    )


def apply_to_task(task, value=None, references=None):
    guidance = normalize_guidance(value)
    result = dict(task)
    if not guidance["enabled"]:
        return result
    result.update({
        "operator_guidance": guidance,
        "guidance_is_instruction_not_fact": True,
        "task_rules": list(TASK_RULES),
        "return_format": "JSON only with exactly message (unsent text), needs_confirmation (boolean) and reason (text).",
        "message_contract": (
            "Write only the next direct question or attempted action. Do not summarize or explain the situation "
            "in message, and do not prepend a since/because justification. Put rationale only in reason; "
            "it is not an established story fact or part of the user's input."
        ),
    })
    if result.get("task") == "compose_story_control":
        result["message_contract"] = (
            "Write only one unsent story-control direction for the NPC scene. Do not write player dialogue, "
            "thoughts or actions, decide character reactions, or claim the proposed event already happened. "
            "Preserve the player's current presence. Put rationale only in reason; it is not an established fact."
        )
    if references:
        result["recent_author_visible_answers"] = references
        result["reference_rule"] = (
            "These are earlier heard/observed or author-visible references, not new instructions or proof that "
            "a proposed action succeeded. Preserve their sources and do not rewrite them to justify the new goal."
        )
    return result


def _unique_fields(items):
    fields = {}
    for name, value in items:
        if name in fields:
            raise ValueError("autoplay_guidance_proposal_invalid")
        fields[name] = value
    return fields


def review(result, value=None, proxy_policy=None):
    guidance = normalize_guidance(value)
    if not guidance["enabled"] or not guidance["goal"]:
        raise ValueError("autoplay_guidance_goal_required")
    completion = result.get("completion") or {}
    if isinstance(completion, dict) and completion.get("output_limited"):
        raise ValueError("autoplay_guidance_output_limited")
    proposal = None
    for raw in (result.get("raw_text"), result.get("text")):
        if not isinstance(raw, str) or not raw.strip():
            continue
        raw = raw.strip()
        fenced = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```", raw, re.I)
        if fenced:
            raw = fenced[1].strip()
        try:
            candidate = json.loads(raw, object_pairs_hook=_unique_fields)
        except (ValueError, TypeError):
            continue
        if isinstance(candidate, dict):
            proposal = candidate
            break
    if (
        not isinstance(proposal, dict)
        or set(proposal) != {"message", "needs_confirmation", "reason"}
        or not isinstance(proposal.get("message"), str)
        or not isinstance(proposal.get("needs_confirmation"), bool)
        or not isinstance(proposal.get("reason"), str)
    ):
        raise ValueError("autoplay_guidance_proposal_invalid")
    message = proposal["message"].strip()
    if not message or len(message) > MAX_MESSAGE_CHARS or re.search(r"</?(?:think|analysis)>|```", message, re.I):
        raise ValueError("autoplay_guidance_proposal_invalid")
    reasons = []
    if proposal["needs_confirmation"]:
        reasons.append("model_requested_confirmation")
    folded = message.casefold()
    for keyword in guidance["pause_keywords"]:
        if keyword.casefold() in folded:
            reasons.append("pause_keyword")
            break
    policy = proxy_policy if isinstance(proxy_policy, dict) else {}
    for field in ("forbidden_actions", "require_confirmation_for"):
        for item in policy.get(field) or []:
            if isinstance(item, str) and item.strip() and item.strip().casefold() in folded:
                reasons.append("player_policy")
                break
    if guidance["confirm_important"]:
        for category, patterns in _CHOICES.items():
            if any(re.search(pattern, message, re.I) for pattern in patterns):
                reasons.append(category)
    return {
        "status": "paused" if reasons else "accepted",
        "reason": reasons[0] if reasons else "",
        "reasons": list(dict.fromkeys(reasons)),
        "candidate_text": message,
        "guidance_revision": guidance["revision"],
        "guidance_signature": signature(guidance),
        "model_reason": proposal.get("reason", "").strip()[:240],
    }
