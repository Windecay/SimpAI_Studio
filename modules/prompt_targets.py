"""Lightweight target classification used by the UI and Agent API."""
import re


def prompt_target_key(backend_engine, task_method, target_text):
    haystack = f"{backend_engine} {task_method} {target_text}".lower()
    if "minimax" in haystack and "h3" in haystack:
        return "minimax_h3"
    if re.search(r"(?:^|[^a-z0-9])anima(?:[^a-z0-9]|$)", haystack):
        return "anima_aio"
    if any(token in haystack for token in ("il_v_pre", "illustrious", "chenkin", "noob", "newbie", "pony", "animagine", "sd15_aio")):
        return "sdxl_danbooru"
    if "flux2" in haystack or "flux.2" in haystack or "flux 2" in haystack:
        return "qwen_natural"
    if "flux" in haystack:
        return "flux_t5_en"
    if "wan" in haystack or "video" in haystack or any(token in haystack for token in ("t2v", "i2v", "v2v", "av2v", "ltx")):
        return "wan_video_cn"
    if "qwen" in haystack:
        return "qwen_natural"
    if "t5" in haystack:
        return "flux_t5_en"
    if "_cn" in haystack or "中文" in haystack or "chinese" in haystack:
        return "natural_zh"
    return "natural_en"
