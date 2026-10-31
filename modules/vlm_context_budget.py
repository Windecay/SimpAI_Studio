"""Text estimates for the complete request when a remote tokenizer is unavailable."""

import math
import re


_CJK = re.compile(r"[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]")
_ASCII = re.compile(r"[\x00-\x7f]")


def estimate_text_tokens(text):
    text = str(text or "")
    cjk = len(_CJK.findall(text))
    ascii_chars = len(_ASCII.findall(text))
    other = len(text) - cjk - ascii_chars
    return math.ceil(cjk * 1.4 + ascii_chars / 3.5 + other * 1.5)


def estimate_message_tokens(message):
    return 12 + estimate_text_tokens(message.get("content")) + estimate_text_tokens(message.get("name"))


def request_budget(messages, context_window, max_output_tokens):
    context_window = max(1, int(context_window))
    output_tokens = max(64, int(max_output_tokens))
    # Covers template differences and estimation error, not a second system prompt.
    reserve_tokens = min(4096, max(1024, context_window // 16))
    input_tokens = 3 + sum(estimate_message_tokens(message) for message in messages)
    input_budget = max(0, context_window - output_tokens - reserve_tokens)
    return {
        "source": "estimated",
        "context_window": context_window,
        "input_tokens": input_tokens,
        "input_budget_tokens": input_budget,
        "output_tokens": output_tokens,
        "reserve_tokens": reserve_tokens,
        "total_tokens": input_tokens + output_tokens + reserve_tokens,
        "chars": sum(len(str(message.get("content") or "")) for message in messages),
        "message_count": len(messages),
        "fits": input_tokens <= input_budget,
    }
