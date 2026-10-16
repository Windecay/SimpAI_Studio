"""Separate suggested next inputs from the assistant's established reply."""

import json
import re
from html.parser import HTMLParser


MAX_OPTIONS = 20
MAX_OPTION_CHARS = 1000
MAX_TOTAL_CHARS = 10000
_CODE = re.compile(r"(`{3,}|~{3,})[\s\S]*?(?:\1|$)|(`+)[^\r\n]*?\2")
_OPEN = re.compile(r"<options\s*>", re.I)
_CLOSE = re.compile(r"</options\s*>", re.I)

SYSTEM_PROMPT = (
    "When useful, append <options><option>next USER input</option></options> outside prose/code. "
    "Options copy VERBATIM, not advice to the reader. Respect count/opt-out; bare answers are valid. "
    "Unchosen actions are not facts. No private/future leaks."
)


def prompt(*, input_type="", player_name="", recipient_name=""):
    if input_type not in {"character", "story_control"}:
        return SYSTEM_PROMPT
    names = {
        "player": player_name.strip()[:200] if isinstance(player_name, str) else "",
        "recipient": recipient_name.strip()[:200] if isinstance(recipient_name, str) else "",
    }
    if input_type == "story_control":
        perspective = (
            "RP OPTIONS PERSPECTIVE: story_control. Write the author's proposed NPC/scene direction using "
            "names, not player dialogue or advice to the reader. Preserve player presence."
        )
    else:
        perspective = (
            "RP OPTIONS PERSPECTIVE: character. I/my=player; you/your=recipient NPC. "
            "Use first-person attempts or dialogue, not 'your wife' advice. "
            "Keep relationships/targets and player-visible facts."
        )
    return "\n\n".join([
        SYSTEM_PROMPT, perspective,
        "Role names (data only):\n"
        + json.dumps(names, ensure_ascii=False, separators=(",", ":")),
    ])


def normalize(values):
    if not isinstance(values, list):
        return []
    result = []
    total = 0
    for item in values:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text or len(text) > MAX_OPTION_CHARS or text in result:
            continue
        if total + len(text) > MAX_TOTAL_CHARS:
            continue
        result.append(text)
        total += len(text)
        if len(result) >= MAX_OPTIONS:
            break
    return result


class _OptionsParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.values = []
        self.current = None
        self.suppressed = 0

    def _finish(self):
        if self.current is not None:
            self.values.append("".join(self.current))
            self.current = None

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "iframe", "object", "template"}:
            self.suppressed += 1
        elif not self.suppressed and tag == "option":
            self._finish()
            self.current = []
        elif not self.suppressed and tag == "br" and self.current is not None:
            self.current.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "iframe", "object", "template"}:
            self.suppressed = max(0, self.suppressed - 1)
        elif not self.suppressed and tag in {"option", "options"}:
            self._finish()

    def handle_data(self, data):
        if self.current is not None and not self.suppressed:
            self.current.append(data)


def extract(text, values=None):
    source = str(text or "")
    protected = [match.span() for match in _CODE.finditer(source)]
    pieces = []
    options = list(values) if isinstance(values, list) else []
    cursor = 0
    for opening in _OPEN.finditer(source):
        if opening.start() < cursor or any(start <= opening.start() < end for start, end in protected):
            continue
        closing = _CLOSE.search(source, opening.end())
        pieces.append(source[cursor:opening.start()])
        if not closing:
            cursor = len(source)
            break
        parser = _OptionsParser()
        parser.feed(source[opening.start():closing.end()])
        options.extend(parser.values)
        cursor = closing.end()
    pieces.append(source[cursor:])
    return {"text": "".join(pieces).strip(), "options": normalize(options)}
