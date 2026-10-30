"""Recognize explicit requests to use or choose LoRA, not general mentions."""

import re


_LORA = re.compile(r"(?<![a-z0-9])lora(?:s)?(?![a-z0-9])", re.I)
_NEGATED = re.compile(
    r"(?:不(?:要|用|使用|加载|启用)|无需|别|禁止|取消|移除|关闭|禁用|"
    r"\b(?:no|without|disable|remove|avoid|don't use|do not use)\b)"
    r"[^，。；,;.!?！？\n]{0,12}$", re.I,
)
_BEFORE = re.compile(
    r"(?:使用|用上|选用|采用|选择|挑选|添加|加载|搭配|启用|加入|带上|应用|套用|"
    r"用|选|加|\b(?:use|using|with|apply|add|choose|select|include|enable)\b)"
    r"[^，。；,;.!?！？\n]{0,24}$", re.I,
)
_AFTER = re.compile(
    r"^\s*(?:的)?(?:选择|选项|列表|清单|有哪些|哪(?:些|个)|用于|来生成|来画|生成时|"
    r"\b(?:choices|options|list|selection|for generation)\b)", re.I,
)
_EXISTING = re.compile(
    r"(?:内置|自带|默认|当前|原有|已选|之前)(?:的)?\s*$|"
    r"\b(?:built[- ]in|default|current|existing|selected)\s*$", re.I,
)


def requests_lora(text):
    text = str(text or "")
    for match in _LORA.finditer(text):
        before = text[max(0, match.start() - 40):match.start()]
        after = text[match.end():match.end() + 40]
        if _NEGATED.search(before) or _EXISTING.search(before):
            continue
        if _BEFORE.search(before) or _AFTER.search(after):
            return True
    return False
