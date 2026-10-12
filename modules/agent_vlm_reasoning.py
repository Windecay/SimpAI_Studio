"""Separate native reasoning markup from answer text across streaming chunks."""

import re


_MARKER = re.compile(
    r"<(?P<close>/)?(?P<tag>think|thinking|analysis|reasoning)\b[^>]*>"
    r"|<\|channel\|?>\s*(?P<channel>analysis|thought|thinking|reasoning|final|answer|response)\b"
    r"|(?P<end><channel\|>)|(?P<message><\|message\|>)", re.IGNORECASE)


class ReasoningText:
    def __init__(self):
        # Some templates include <think> in the prompt. Until the first marker,
        # do not mistake that unmarked reasoning prefix for an answer.
        self.mode = None
        self.pending = ""

    def content_mode(self):
        if self.mode is None:
            self.mode = "content"

    def push(self, text="", final=False):
        self.pending += text
        output = {"content": [], "reasoning_content": []}

        def emit(value, mode=None):
            if value:
                output[mode or self.mode or "content"].append(value)

        while match := _MARKER.search(self.pending):
            ending = bool(match.group("close") or match.group("end"))
            channel = (match.group("channel") or "").lower()
            if channel in {"final", "answer", "response"}:
                ending = True
            prefix_mode = "reasoning_content" if self.mode is None and ending else None
            emit(self.pending[:match.start()], prefix_mode)
            self.pending = self.pending[match.end():]
            if ending:
                self.mode = "content"
            elif not match.group("message"):
                self.mode = "reasoning_content"
        if final:
            emit(self.pending)
            self.pending = ""
        elif self.mode is not None:
            # Preserve incomplete tags and channel names, even if a chunk ends
            # just after '>' and the channel word is in the next chunk.
            start = self.pending.rfind("<")
            tail = self.pending[start:] if start >= 0 else ""
            keep = start if start >= 0 and (">" not in tail or tail.lower().startswith("<|channel")) else len(self.pending)
            emit(self.pending[:keep])
            self.pending = self.pending[keep:]
        return {key: "".join(parts) for key, parts in output.items() if parts}
