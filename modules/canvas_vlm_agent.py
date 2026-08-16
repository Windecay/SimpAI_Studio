import copy
import functools
import json
import logging
import os
import re
import time

import modules.canvas_danbooru_policy as canvas_danbooru_policy
import modules.canvas_danbooru_preflight as canvas_danbooru_preflight
import modules.canvas_danbooru_prompt_review as canvas_danbooru_prompt_review
import modules.canvas_danbooru_service as canvas_danbooru_service
import modules.canvas_vlm_prompt_pipeline as canvas_vlm_prompt_pipeline
import modules.minimax_h3_prompt_compiler as minimax_h3_prompt_compiler

try:
    from enhanced.vlm import VLM
except Exception as exc:
    class _CanvasVLMImportStub:
        VERSIONS = {}

    VLM = _CanvasVLMImportStub()
    _CANVAS_VLM_IMPORT_ERROR = exc
else:
    _CANVAS_VLM_IMPORT_ERROR = None

logger = logging.getLogger(__name__)

CANVAS_VLM_LOCAL_LOCK_CACHE_MAX = 256
_canvas_vlm_current_turn_lock_cache = {}
_canvas_vlm_current_turn_lock_cache_order = []

VLM_AGENT_ACTIONS = {
    "summarize_canvas",
    "explain_node",
    "focus_node",
    "select_node",
    "find_broken_edges",
    "suggest_next_node",
    "inspect_tool_status",
    "generate_image",
    "text_to_image",
    "edit_image",
    "outpaint_image",
    "erase_image",
    "replace_image",
    "upscale_image",
}
VLM_AGENT_COMMON_CHARACTER_ALIAS_LOCKS = (
    (("爱莉希雅", "愛莉希雅", "elysia"), "elysia_(honkai_impact)", "honkai_impact"),
    (("甘雨", "ganyu"), "ganyu_(genshin_impact)", "genshin_impact"),
    (("闲云", "閒雲", "xianyun"), "xianyun_(genshin_impact)", "genshin_impact"),
    (("雷电将军", "雷電將軍", "raiden shogun", "raiden_shogun"), "raiden_shogun", "genshin_impact"),
    (("胡桃", "hu tao", "hu_tao"), "hu_tao_(genshin_impact)", "genshin_impact"),
)
VLM_AGENT_PROMPT_ENRICHMENT_KEYS = (
    "enrichment_tags",
    "suggested_tags",
    "candidate_tags",
    "style_tags",
    "composition_tags",
    "pose_tags",
    "expression_tags",
    "lighting_tags",
    "atmosphere_tags",
    "camera_tags",
    "setting_tags",
    "prop_tags",
    "action_tags",
)
VLM_PERSONA_TAG_ALIASES = {
    "animal_ear_fluff": "ear_fluff",
    "cat_girl": "catgirl",
    "twin_tails": "twintails",
    "bunny_ears": "rabbit_ears",
}
VLM_PERSONA_LOW_SIGNAL_TAGS = {
    "black",
    "blue",
    "brown",
    "cat",
    "character",
    "clothes",
    "clothing",
    "eye",
    "eyes",
    "face",
    "female",
    "fur",
    "girl",
    "green",
    "hair",
    "human",
    "male",
    "person",
    "outfit",
    "roots_(hair)",
    "skin",
    "white",
    "eyewear",
    "kawaii",
    "orange",
    "pink",
    "purple",
    "red",
    "silver",
    "yellow",
}
VLM_PERSONA_HAIR_STYLE_TAGS = {
    "twintails",
    "ponytail",
    "low_ponytail",
    "side_ponytail",
    "braid",
    "twin_braids",
    "drill_hair",
    "short_hair",
    "long_hair",
    "very_long_hair",
}
VLM_PERSONA_LOOKUP_MAX_CANDIDATES = 6
VLM_SKILL_INDEX_FILE = "skill_index.json"
VLM_IMAGE_PROMPT_SKILL_FILE = "image_prompting.md"
VLM_IMAGE_EDIT_SKILL_FILE = "image_editing.md"
VLM_DANBOORU_TAG_PROMPT_SKILL_FILE = "danbooru_tag_prompting.md"
VLM_ANIMA_PROMPT_SKILL_FILE = "anima_prompting.md"
VLM_NATURAL_PROMPT_ACTION_SKILL_FILE = "natural_prompt_action.md"
VLM_NATURAL_PROMPT_ADULT_SKILL_FILE = "natural_prompt_adult.md"
VLM_NATURAL_PROMPT_REFINE_SKILL_FILE = "natural_prompt_refine.md"
VLM_AGENT_COMPANION_SKILL_FILE = "agent_companion.md"
VLM_PRESET_TOOL_CALLING_SKILL_FILE = "preset_tool_calling.md"
VLM_SIMPAI_PRESET_GUIDE_SKILL_FILE = "simpai_preset_guide.md"
VLM_H3_PROMPT_WRITING_SKILL_FILES = {
    "en": "h3_prompt_writing_en.md",
    "cn": "h3_prompt_writing_cn.md",
}
VLM_H3_PROMPT_WRITING_MODE_SKILL_FILES = {
    "base": {
        "en": "h3_prompt_writing_base_en.md",
        "cn": "h3_prompt_writing_base_cn.md",
    },
    "reference": {
        "en": "h3_prompt_writing_ref_en.md",
        "cn": "h3_prompt_writing_ref_cn.md",
    },
}
VLM_PROMPT_REWRITE_PRESET_NOTES_MAX_CHARS = 6000
VLM_PROMPT_REWRITE_SKILL_SOURCE_MAX_CHARS = 20000
VLM_PROMPT_REWRITE_SKILL_EXCERPT_MAX_CHARS = 3600

def _canvas_normalize_vlm_action_name(action):
    name = str(action or "").strip().lower().replace("-", "_").replace(" ", "_")
    if name in {"text_to_image", "generate", "generateimage", "image_generate", "create_image", "draw_image"}:
        return "generate_image"
    if name.startswith(("draw_", "paint_")):
        return "generate_image"
    return name

def _canvas_normalize_vlm_action_names(actions):
    if not actions:
        return actions
    changed = False
    output = []
    for action in actions:
        if not isinstance(action, dict):
            output.append(action)
            continue
        item = dict(action)
        normalized = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if normalized and normalized != item.get("action"):
            item["action"] = normalized
            changed = True
        output.append(item)
    return output if changed else actions

def _canvas_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() not in {"0", "false", "no", "off", ""}


def _canvas_normalize_skill_language(value):
    raw = str(value or "").strip().lower().replace("_", "-")
    if raw.startswith("en") or raw in {"english", "英文"}:
        return "en"
    if raw.startswith(("zh", "cn")) or raw in {"chinese", "simplified-chinese", "中文"}:
        return "cn"
    return ""


def _canvas_vlm_skill_language(params=None, payload=None, target=None):
    params = params if isinstance(params, dict) else {}
    payload = payload if isinstance(payload, dict) else {}
    target = target if isinstance(target, dict) else {}
    candidates = []

    def add_state(value):
        if isinstance(value, dict):
            for key in ("__lang", "lang", "language"):
                if value.get(key):
                    candidates.append(value.get(key))

    # stage.__lang is the request-level language source. The other locations
    # keep direct API calls and older canvas payloads compatible.
    add_state(payload.get("stage"))
    add_state(params.get("stage"))
    add_state(params)
    add_state(payload)
    add_state(payload.get("state"))
    add_state(payload.get("user_context"))
    add_state(payload.get("agent_context"))
    add_state(target)
    add_state(target.get("prompt_compiler_context"))

    for value in candidates:
        normalized = _canvas_normalize_skill_language(value)
        if normalized:
            return normalized
    return "en"


def _canvas_h3_prompt_writing_skill_file(params=None, payload=None, target=None):
    language = _canvas_vlm_skill_language(params=params, payload=payload, target=target)
    return VLM_H3_PROMPT_WRITING_SKILL_FILES[language]


def _canvas_h3_prompt_writing_mode(target=None):
    target = target if isinstance(target, dict) else {}
    compiler = minimax_h3_prompt_compiler.target_compiler(target)
    if not compiler:
        return ""
    context = target.get("prompt_compiler_context") if isinstance(target.get("prompt_compiler_context"), dict) else {}
    mode = minimax_h3_prompt_compiler.resolve_mode(compiler, context)
    return "reference" if mode == minimax_h3_prompt_compiler.MODE_REF2VA else "base"


def _canvas_h3_prompt_writing_skill_files(params=None, payload=None, target=None):
    language = _canvas_vlm_skill_language(params=params, payload=payload, target=target)
    files = [VLM_H3_PROMPT_WRITING_SKILL_FILES[language]]
    mode_key = _canvas_h3_prompt_writing_mode(target)
    mode_files = VLM_H3_PROMPT_WRITING_MODE_SKILL_FILES.get(mode_key) or {}
    mode_file = mode_files.get(language)
    if mode_file:
        files.append(mode_file)
    return files

def _canvas_compact_agent_prompt_enabled(params):
    if not isinstance(params, dict):
        return False
    return _canvas_bool(
        params.get("compact_agent_prompt", params.get("agent_prompt_compact")),
        False,
    )

def _canvas_agent_danbooru_lookup_enabled(params):
    if not isinstance(params, dict):
        return True
    return _canvas_bool(params.get("agent_use_danbooru_lookup"), True)

def _canvas_vlm_prompt_rewrite_request(params, payload):
    candidates = []
    if isinstance(payload, dict):
        candidates.append(payload.get("node_id"))
    if isinstance(params, dict):
        candidates.append(params.get("node_id"))
    for value in candidates:
        text = str(value or "").strip()
        if text.startswith("canvas_agent_prompt_rewrite:"):
            return True
    return False


def _canvas_vlm_prompt_rewrite_purpose(params=None, payload=None):
    candidates = []
    if isinstance(payload, dict):
        candidates.append(payload.get("node_id"))
    if isinstance(params, dict):
        candidates.append(params.get("node_id"))
    for value in candidates:
        text = str(value or "").strip().lower()
        if text.startswith("canvas_agent_prompt_rewrite:"):
            return text.split(":", 1)[1].strip()
    return ""


def _canvas_target_is_image_edit(target=None):
    data = target if isinstance(target, dict) else {}
    haystack = " ".join(
        str(data.get(key) or "").strip().lower()
        for key in ("key", "name", "label", "task_method", "source", "prompt_compiler")
    )
    return bool(re.search(
        r"(?:r2i|reference[_\s-]*to[_\s-]*image|image[_\s-]*edit|edit[_\s-]*image|"
        r"imageedit|qwenedit|kleinedit|inpaint|outpaint|retouch)",
        haystack,
        re.I,
    ))


def _canvas_vlm_image_edit_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    terms = (
        "image_edit",
        "edit_image",
        "image editing",
        "edit this image",
        "modify this image",
        "retouch this image",
        "reference-to-image",
        "reference to image",
        "r2i",
        "图片编辑",
        "编辑这张图",
        "编辑图片",
        "修改这张图",
        "修改图片",
        "改图",
        "修图",
        "扩图",
        "擦除",
        "替换",
        "重绘",
    )
    return any(term in text for term in terms)


def _canvas_vlm_prompt_rewrite_target(payload):
    if not isinstance(payload, dict):
        return {}
    agent_context = payload.get("agent_context") if isinstance(payload.get("agent_context"), dict) else {}
    targets = agent_context.get("prompt_generation_targets") if isinstance(agent_context.get("prompt_generation_targets"), dict) else {}
    purpose = _canvas_vlm_prompt_rewrite_purpose(payload=payload)
    text_target = targets.get("text_to_image") if isinstance(targets.get("text_to_image"), dict) else {}
    edit_target = targets.get("image_edit") if isinstance(targets.get("image_edit"), dict) else {}
    if purpose == "image_edit" and _canvas_target_is_image_edit(text_target):
        target = text_target
    elif purpose == "image_edit":
        target = edit_target
    else:
        target = text_target
    return dict(target)


def _canvas_vlm_prompt_rewrite_is_image_edit(payload, target=None):
    return (
        _canvas_vlm_prompt_rewrite_purpose(payload=payload) == "image_edit"
        or _canvas_target_is_image_edit(target)
    )

def _canvas_vlm_prompt_rewrite_target_summary(payload):
    if not isinstance(payload, dict):
        return "unknown/default"
    target = _canvas_vlm_prompt_rewrite_target(payload)
    target_key = str(target.get("key") or "").strip()
    if not target_key:
        target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload)
    fields = []
    for key in ("label", "name", "backend_engine", "task_method", "text_encoder", "prompt_format", "prompt_compiler"):
        value = str(target.get(key) or "").strip()
        if value:
            fields.append(f"{key}={value[:80]}")
    return (target_key or "unknown/default") + (("; " + "; ".join(fields[:5])) if fields else "")


def _canvas_vlm_prompt_rewrite_target_family(target_key, target=None):
    key = str(target_key or "").strip().lower()
    data = target if isinstance(target, dict) else {}
    task_method = str(data.get("task_method") or "").strip().lower()
    text_encoder = str(data.get("text_encoder") or "").strip().lower()
    backend_engine = str(data.get("backend_engine") or "").strip().lower()
    target_name = " ".join(
        str(data.get(field) or "").strip().lower()
        for field in ("label", "name")
    )

    if minimax_h3_prompt_compiler.target_compiler(data):
        return "minimax_h3"
    if _canvas_is_anima_prompt_target_key(key, data):
        return "anima"
    if key in CANVAS_DANBOORU_TARGET_KEYS:
        return "danbooru"
    if (
        "audio_gen" in task_method
        or "foley" in task_method
        or ("video to audio" in target_name and "video to video" not in target_name)
    ):
        return "audio"
    if key == "natural_en":
        return "natural_en"
    if key == "natural_zh":
        return "natural_zh"
    if key == "qwen_natural" or key.startswith("qwen"):
        return "qwen"
    if key == "flux_t5_en":
        return "flux"
    if key in {"wan_video_cn", "video_natural"}:
        if "image_edit" in task_method and "video" not in task_method:
            return "natural_zh"
        return "wan"
    if "umt5" in key or key.startswith("wan") or "video" in key:
        return "wan"
    if "flux" in key or ("t5" in key and "umt5" not in key):
        return "flux"

    # When a generic target key is used, the actual encoder is more reliable
    # than a marketing/backend family name. In particular, Flux workflows can
    # use Qwen encoders, while Wan UMT5 must not be treated as FLUX/T5XXL.
    if "qwen" in text_encoder:
        return "qwen"
    if "umt5" in text_encoder or "wan" in backend_engine or "video" in task_method:
        if "image_edit" in task_method and "video" not in task_method:
            return "natural_zh"
        return "wan"
    if "t5" in text_encoder or "flux" in backend_engine:
        return "flux"
    return "natural"


def _canvas_vlm_prompt_rewrite_compact_text(value, max_chars):
    text = str(value or "").strip()
    if not text:
        return ""
    max_chars = max(0, int(max_chars or 0))
    if max_chars == 0:
        return ""
    if text.startswith("'''"):
        text = text[3:].lstrip()
    text = re.sub(r"'''\s*需要改写的提示词是[：:]?\s*$", "", text).strip()
    if len(text) <= max_chars:
        return text
    marker = "\n\n... middle omitted to fit the prompt context ...\n\n"
    if max_chars <= len(marker):
        return text[:max_chars]
    available = max(0, max_chars - len(marker))
    head_chars = int(available * 0.6)
    tail_chars = available - head_chars
    tail = text[-tail_chars:].lstrip() if tail_chars else ""
    return text[:head_chars].rstrip() + marker + tail


def _canvas_vlm_markdown_section(content, heading):
    text = str(content or "")
    pattern = re.compile(
        rf"(?ms)^{re.escape(heading)}\s*$.*?(?=^##\s|\Z)",
    )
    match = pattern.search(text)
    return match.group(0).strip() if match else ""


def _canvas_vlm_prompt_rewrite_skill_excerpt(doc, target_key, target=None):
    item = doc if isinstance(doc, dict) else {}
    content = str(item.get("content") or "").strip()
    if not content:
        return ""
    if str(item.get("path") or "").replace("\\", "/") != VLM_IMAGE_PROMPT_SKILL_FILE:
        return _canvas_vlm_prompt_rewrite_compact_text(
            content,
            VLM_PROMPT_REWRITE_SKILL_EXCERPT_MAX_CHARS,
        )

    family = _canvas_vlm_prompt_rewrite_target_family(target_key, target)
    if family == "audio":
        return ""
    family_heading = {
        "wan": "## Wan / UMT5 Video Encoders",
        "flux": "## FLUX.1 / T5XXL Encoders",
        "qwen": "## Z-image / Qwen Text Encoders",
        "natural": "## Z-image / Qwen Text Encoders",
        "natural_en": "## Z-image / Qwen Text Encoders",
        "natural_zh": "## Z-image / Qwen Text Encoders",
    }.get(family)
    selected = ["# Image Prompting And Text Encoder Targets"]
    target_selection = _canvas_vlm_markdown_section(content, "## Target Selection")
    if target_selection:
        selected.append(target_selection)
    target_section = _canvas_vlm_markdown_section(content, family_heading) if family_heading else ""
    if target_section:
        selected.append(target_section)
    excerpt = "\n\n".join(selected)
    return _canvas_vlm_prompt_rewrite_compact_text(
        excerpt or content,
        VLM_PROMPT_REWRITE_SKILL_EXCERPT_MAX_CHARS,
    )

def _canvas_vlm_prompt_rewrite_required_docs(payload):
    payload = payload if isinstance(payload, dict) else {}
    target = _canvas_vlm_prompt_rewrite_target(payload)
    target_key = str(target.get("key") or "").strip()
    if not target_key:
        target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload)
        target = _canvas_prompt_target_for_payload(payload, target_key)
    required = [VLM_IMAGE_EDIT_SKILL_FILE] if _canvas_vlm_prompt_rewrite_is_image_edit(payload, target) else []
    if minimax_h3_prompt_compiler.target_compiler(target):
        return required + _canvas_h3_prompt_writing_skill_files(payload=payload, target=target)
    if _canvas_is_anima_prompt_target_key(target_key, target):
        return required + [VLM_ANIMA_PROMPT_SKILL_FILE]
    if target_key in CANVAS_DANBOORU_TARGET_KEYS:
        return required + [VLM_DANBOORU_TAG_PROMPT_SKILL_FILE]
    if _canvas_is_natural_prompt_target_key(target_key):
        return required + [VLM_IMAGE_PROMPT_SKILL_FILE]
    return required + [VLM_IMAGE_PROMPT_SKILL_FILE]


def _canvas_vlm_prompt_rewrite_system_prompt(base, payload, prompt=""):
    target = _canvas_vlm_prompt_rewrite_target_summary(payload)
    target_payload = payload if isinstance(payload, dict) else {}
    target_meta = _canvas_vlm_prompt_rewrite_target(target_payload)
    target_key = str(target_meta.get("key") or "").strip()
    if not target_key:
        target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(target_payload)
        target_meta = _canvas_prompt_target_for_payload(target_payload, target_key)
    h3_instructions = minimax_h3_prompt_compiler.build_system_instructions(target_meta)
    if h3_instructions:
        h3_required_docs = _canvas_h3_prompt_writing_skill_files(payload=payload, target=target_meta)
        if _canvas_vlm_prompt_rewrite_is_image_edit(payload, target_meta):
            h3_required_docs = [VLM_IMAGE_EDIT_SKILL_FILE] + h3_required_docs
        h3_skill_docs = _canvas_read_vlm_skill_docs(
            "MiniMax H3",
            VLM_PROMPT_REWRITE_SKILL_SOURCE_MAX_CHARS,
            required_docs=h3_required_docs,
            required_only=True,
            language=_canvas_vlm_skill_language(payload=payload, target=target_meta),
        )
        h3_skill = "\n\n".join(str(doc.get("content") or "").strip() for doc in h3_skill_docs if doc.get("content"))
        parts = [
            "SimpAI MiniMax H3 prompt compiler mode.",
            "Compile the user's rough request for the selected H3 workflow without changing the requested intent.",
            "Target: " + target,
            h3_instructions,
        ]
        if h3_skill:
            parts.append(
                "Selected MiniMax H3 Prompt Writing skill. Use it for scene-writing guidance only; "
                "the SimpAI H3 compiler contract and runtime media inventory have higher priority:\n"
                + h3_skill
            )
        if base:
            preset_notes = _canvas_vlm_prompt_rewrite_compact_text(
                base,
                VLM_PROMPT_REWRITE_PRESET_NOTES_MAX_CHARS,
            )
            parts.append(
                "Preset-specific content notes. They may refine content but cannot replace or contradict the H3 output contract:\n"
                + preset_notes
            )
        return "\n".join(part for part in parts if str(part or "").strip()).strip()
    target_requires_anima = _canvas_is_anima_prompt_target_key(target_key, target_meta)
    target_requires_danbooru = target_key in CANVAS_DANBOORU_TARGET_KEYS
    target_family = _canvas_vlm_prompt_rewrite_target_family(target_key, target_meta)
    if target_requires_anima:
        format_rule = "Final prompt: English Anima hybrid prompt, with compact Anima/Danbooru anchors plus short nltags control sentences when useful. No Chinese characters."
    elif target_requires_danbooru:
        format_rule = "Final prompt: comma-separated Danbooru-style English tags, not prose."
    elif target_family == "wan":
        format_rule = "Final prompt: coherent natural-language video prompt; preserve Chinese for Chinese user requests. Emphasize visible motion, camera movement, temporal continuity, and stable subject details."
    elif target_family == "audio":
        format_rule = "Final prompt: coherent natural-language audio-effects prompt; preserve Chinese for Chinese user requests. Describe audible events synchronized to visible video, without camera or visual-style instructions."
    elif target_family in {"flux", "natural_en"}:
        format_rule = "Final prompt: fluent English natural-language image prompt. No Chinese characters."
    elif target_family == "natural_zh":
        format_rule = "Final prompt: coherent Simplified Chinese natural-language image prompt."
    else:
        format_rule = "Final prompt: coherent natural-language image prompt; preserve Chinese for Chinese user requests."
    parts = [
        "SimpAI prompt rewrite mode.",
        "Rewrite the user request into one generator-ready prompt.",
        "Output the final prompt text only. No explanation, markdown, JSON, labels, metadata, policy notes, or internal state.",
        "If the request is brief, expand it with visible subject, action/pose, setting, composition/camera, lighting, mood, and concrete visual details.",
        "Do not return the unchanged original request unless it is already a detailed generator prompt.",
        "Preserve explicit adult/R18 intent for clearly adult requests, but do not add stronger sexual actions, unrelated fetish content, or extra subjects.",
        "Target: " + target,
        format_rule,
    ]
    required_docs = _canvas_vlm_prompt_rewrite_required_docs(payload if isinstance(payload, dict) else {})
    docs = _canvas_read_vlm_skill_docs(
        prompt,
        VLM_PROMPT_REWRITE_SKILL_SOURCE_MAX_CHARS,
        required_docs=required_docs,
        required_only=bool(required_docs),
        language=_canvas_vlm_skill_language(payload=payload, target=target_meta),
    )
    if docs:
        skill_text = "\n\n".join(
            f"### {doc['title']}\n{excerpt}"
            for doc in docs
            for excerpt in [_canvas_vlm_prompt_rewrite_skill_excerpt(doc, target_key, target_meta)]
            if excerpt
        )
        if skill_text:
            parts.append(
                "Target prompt skill docs. Use these as target-language and prompt-content guidance only. "
                "Ignore any action JSON schema or chat-card protocol mentioned in the docs; "
                "the main WebUI SuperPrompt button still returns final prompt text only:\n"
                + skill_text
            )
    if (target_requires_anima or target_requires_danbooru) and str(prompt or "").strip():
        try:
            lookup_text = canvas_danbooru_service._canvas_danbooru_lookup_text(
                str(prompt or "")[:1200],
                model_hint=target,
                limit=24,
            )
        except Exception as exc:
            logger.debug("Prompt rewrite Danbooru lookup skipped: %s", exc)
            lookup_text = ""
        if lookup_text:
            parts.append(
                "Local Danbooru/Anima lookup hints. Prefer exact canonical tags from this local lookup when they match the user request:\n"
                + lookup_text
            )
    if base:
        preset_notes = _canvas_vlm_prompt_rewrite_compact_text(
            base,
            VLM_PROMPT_REWRITE_PRESET_NOTES_MAX_CHARS,
        )
        parts.append(
            "Preset-specific rewrite notes. These are lower priority than the output-format rule above; do not copy any JSON/markdown output format from them:\n"
            + preset_notes
        )
    return "\n".join(part for part in parts if str(part or "").strip()).strip()

def _canvas_vlm_agent_mode(params):
    if not isinstance(params, dict):
        return "persona"
    mode = str(params.get("agent_mode") or "").strip().lower().replace("-", "_")
    if mode in ("raw", "persona", "canvas_agent"):
        return mode
    if _canvas_bool(params.get("agent_raw_mode"), False):
        return "raw"
    legacy_keys = ("agent_use_skills", "agent_use_canvas_context", "agent_action_hints")
    if any(key in params for key in legacy_keys):
        if (
            _canvas_bool(params.get("agent_use_skills"), True)
            or _canvas_bool(params.get("agent_use_canvas_context"), True)
            or _canvas_bool(params.get("agent_action_hints"), True)
        ):
            return "canvas_agent"
    return "persona"

def _canvas_vlm_skills_dir():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "vlm_skills")

def _canvas_read_vlm_skill_index():
    path = os.path.join(_canvas_vlm_skills_dir(), VLM_SKILL_INDEX_FILE)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, dict) else {}
    except Exception as exc:
        logger.warning("VLM skill index skipped: %s", exc)
        return {}

def _canvas_read_vlm_skill_file(filename, max_chars=9000):
    clean = str(filename or "").replace("\\", "/").strip()
    if not clean or clean.startswith("/") or ".." in clean.split("/"):
        return ""
    path = os.path.join(_canvas_vlm_skills_dir(), clean)
    if not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except Exception as exc:
        logger.warning("VLM skill file skipped: %s", exc)
        return ""
    if max_chars and len(content) > int(max_chars):
        return content[: int(max_chars)].rstrip() + "\n..."
    return content

def _canvas_vlm_image_prompting_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    cn_terms = (
        "\u63d0\u793a\u8bcd",
        "\u751f\u56fe",
        "\u914d\u56fe",
        "\u751f\u6210\u56fe",
        "\u751f\u6210\u4e00\u5f20",
        "\u4e00\u5f20\u56fe",
        "\u5f20\u56fe",
        "\u4e2a\u56fe",
        "\u5e45\u56fe",
        "\u51fa\u56fe",
        "\u56fe\u7247",
        "\u56fe\u50cf",
        "\u753b\u56fe",
        "\u753b\u4f5c",
        "\u4f5c\u54c1",
        "\u98ce\u666f\u753b",
        "\u98ce\u666f\u56fe",
        "\u98ce\u666f\u7167",
        "\u573a\u666f\u56fe",
        "\u80cc\u666f\u56fe",
        "\u6982\u5ff5\u56fe",
        "\u8bbe\u5b9a\u56fe",
        "\u89d2\u8272\u56fe",
        "\u4eba\u7269\u56fe",
        "\u58c1\u7eb8",
        "\u6765\u4e00\u5f20",
        "\u6765\u5f20",
        "\u7ed9\u6211\u6765\u5f20",
        "\u753b\u4e00",
        "\u753b\u5f20",
        "\u753b\u4e2a",
        "\u753b\u51fa",
        "\u7ed8\u5236",
        "\u7f16\u8f91",
        "\u4fee\u6539",
        "\u63d2\u753b",
        "\u6d77\u62a5",
        "\u5934\u50cf",
        "\u7167\u7247",
        "\u81ea\u62cd",
        "\u89c6\u9891",
        "\u6269\u56fe",
        "\u64e6\u9664",
        "\u66ff\u6362",
        "\u653e\u5927",
    )
    if any(term in text for term in cn_terms):
        return True
    if re.search(
        r"(?<!\u4e0d)(?<!\u522b)(?<!\u5225)(?<!\u8981)(?:\u753b|\u7ed8\u5236)\s*(?:[\u4e00-\u9fffA-Za-z0-9_\(（][^，。,.!?\n]{0,30})",
        text,
        re.I,
    ):
        return True
    terms = (
        "generate_image",
        "text_to_image",
        "edit_image",
        "outpaint_image",
        "erase_image",
        "replace_image",
        "upscale_image",
        "image prompt",
        "draw",
        "create image",
        "make image",
        "picture",
        "illustration",
        "poster",
        "avatar",
        "photo",
        "video",
        "t2i",
        "i2v",
        "t2v",
        "z-image",
        "zimage",
        "wan",
        "flux",
        "sdxl",
        "illustrious",
        "noob",
        "danbooru",
        "提示词",
        "生图",
        "配图",
        "生成图",
        "生成一张",
        "一张图",
        "张图",
        "个图",
        "幅图",
        "出图",
        "图片",
        "图像",
        "画图",
        "画作",
        "作品",
        "风景画",
        "风景图",
        "风景照",
        "场景图",
        "背景图",
        "概念图",
        "设定图",
        "壁纸",
        "画一",
        "画张",
        "画个",
        "画出",
        "绘制",
        "编辑",
        "修改",
        "插画",
        "海报",
        "头像",
        "照片",
        "自拍",
        "视频",
        "扩图",
        "擦除",
        "替换",
        "放大",
    )
    return any(term in text for term in terms)

def _canvas_vlm_danbooru_prompting_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    terms = (
        "sdxl",
        "sd15",
        "illustrious",
        "noob",
        "newbie",
        "nai-xl",
        "danbooru",
        "booru",
        "fooocus",
        "pony",
        "animagine",
        "chenkin",
        "魔法少女",
        "标签",
    )
    return any(term in text for term in terms) or bool(re.search(r"\b(tags?|booru)\b", text))


def _canvas_vlm_preset_guide_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    terms = (
        "guide mode",
        "workflow",
        "which preset",
        "what preset",
        "which workflow",
        "what workflow",
        "which tool",
        "what tool",
        "recommend",
        "recommendation",
        "preset",
        "feature",
        "function",
        "image-to-video",
        "text-to-video",
        "i2v",
        "t2v",
        "retouch",
        "refiner",
        "upscale",
        "outpaint",
        "inpaint",
        "style transfer",
        "face swap",
        "video face swap",
        "motion transfer",
        "expression edit",
        "expression editing",
        "liveportrait",
        "liveportrait exp",
        "reactor",
        "reactor faceswap",
        "background removal",
        "free viewpoint",
        "viewpoint",
        "multiangle",
        "multi-angle",
        "camera angle",
        "angle edit",
        "perspective",
        "gaussian",
        "gaussian splat",
        "pose preset",
        "pose studio",
        "skeleton",
        "dwpose",
        "sdpose",
        "qwenpose",
        "qwenmultiangle",
        "qwengaussian",
        "flux2-kleinpose",
        "nvidia-vsr",
        "infinitetalk",
        "hunyuan-foley",
        "用哪个",
        "用哪种",
        "用什么",
        "选哪个",
        "选哪种",
        "推荐",
        "适合",
        "功能",
        "流程",
        "工作流",
        "预设",
        "模式",
        "路线",
        "主界面",
        "画布",
        "动起来",
        "图生视频",
        "文生视频",
        "视频生成",
        "精修",
        "修图",
        "修手",
        "修脸",
        "修眼",
        "扩图",
        "擦除",
        "换背景",
        "去背景",
        "抠图",
        "风格迁移",
        "风格转换",
        "换脸",
        "视频换脸",
        "表情编辑",
        "表情调整",
        "换表情",
        "姿态",
        "姿势",
        "姿势预置",
        "骨架",
        "自由视角",
        "自由视角+",
        "换视角",
        "换角度",
        "视角",
        "镜头",
        "机位",
        "多角度",
        "透视",
        "高斯",
        "高斯泼溅",
        "缺损",
        "填充缺损",
        "动作迁移",
        "视频超分",
        "语音",
        "口型",
        "音效",
    )
    return any(term in text for term in terms)


def _canvas_vlm_persona_image_subject_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    positive_terms = (
        "show me your look",
        "show your look",
        "show yourself",
        "your selfie",
        "draw yourself",
        "draw you",
        "your avatar",
        "your appearance",
        "your body",
        "your nude",
        "your naked body",
        "你的自拍",
        "看看你的样子",
        "给我看看你的样子",
        "你的样子",
        "画你",
        "画一下你",
        "画出你",
        "你的头像",
        "你的立绘",
        "你的外观",
        "你的形象",
        "你和我",
        "和你一起",
        "你在逛街",
        "你正在逛街",
    )
    negative_terms = (
        "给你画",
        "为你画",
        "给你生成",
        "为你生成",
        "给你的图",
        "你的图片",
    )
    if any(term in text for term in negative_terms):
        return False
    if any(term in text for term in positive_terms):
        return True
    positive_patterns = (
        r"\byour\s+(?:body|nude|nudes|naked\s+body|naked\s+appearance)\b",
        r"\b(?:draw|show|see|look\s+at|view)\s+(?:you|your\s+(?:body|nude|naked\s+body))\b",
        r"(?:\u4f60\u7684)(?:\u88f8\u4f53|\u88f8\u7167|\u8eab\u4f53|\u80f4\u4f53)",
        r"(?:\u753b|\u770b|\u770b\u770b|\u770b\u4e00\u4e0b|\u6211\u8981\u770b).{0,8}(?:\u4f60|\u4f60\u7684(?:\u8eab\u4f53|\u88f8\u4f53|\u80f4\u4f53))",
        r"(?:\u8131\u5149|\u8131\u6389|\u88f8).{0,12}\u4f60|\u4f60.{0,12}(?:\u8131\u5149|\u8131\u6389|\u88f8)",
        r"(?:^|[，。,.!?\s])\u4f60(?:\u6b63\u5728|\u6b63|\u5728)?(?:\u901b\u8857|\u6563\u6b65|\u8d70\u8def|\u65c5\u884c|\u62cd\u7167|\u81ea\u62cd|\u7ad9\u7740|\u5750\u7740|\u8eba\u7740|\u7761\u89c9|\u8dd1\u6b65|\u8df3|\u5403|\u559d|\u62ff|\u7a7f|\u7948\u7977|\u6d17\u6fa1|\u6e38\u6cf3|\u73a9)",
        r"(?:^|[，。,.!?\s])\u4f60(?:\u6b63\u5728|\u6b63|\u5728).{0,16}(?:\u8857|\u57ce\u5e02|\u6d77\u8fb9|\u6c99\u6ee9|\u623f\u95f4|\u5e8a|\u6d74\u5ba4|\u5496\u5561|\u9910\u5385|\u5b66\u6821|\u516c\u56ed|\u96e8|\u96ea|\u591c|\u767d\u5929)",
    )
    return any(re.search(pattern, text, re.I) for pattern in positive_patterns)


def _canvas_vlm_prompt_has_visible_human_subject(prompt):
    tags = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        for raw in str(prompt or "").split(",")
        if canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
    }
    if "no_humans" in tags:
        return False
    return bool(tags.intersection({
        "1girl", "1boy", "2girls", "2boys", "3girls", "3boys",
        "4girls", "4boys", "5girls", "5boys", "6girls", "6boys",
        "multiple_others", "solo",
    }))


def _canvas_vlm_persona_visual_context_hint(text):
    source = str(text or "")
    if not source:
        return False
    if re.search(
        r"(?:\u4f60\u662f|\u4f60\u7684|\u6211\u662f).{0,80}"
        r"(?:\u5916\u89c2|\u5f62\u8c61|\u6837\u5b50|\u8eab\u4f53|\u4eba\u8bbe|\u89d2\u8272\u8bbe\u5b9a|"
        r"appearance|body|persona|character\s+design|visual\s+identity)",
        source,
        re.I,
    ):
        return True
    return bool(re.search(
        r"(?:\u6211\u662f|\u4f60\u662f).{0,120}"
        r"(?:\u732b\u8033|\u732b\u5a18|\u732b\u8033\u5a18|\u72d0\u8033|\u72fc\u8033|\u4fee\u5973|\u5973\u4ec6|"
        r"\u7ea2\u53d1|\u9ed1\u53d1|\u767d\u53d1|\u7eff\u773c|\u7fe0\u7eff|\u53cc\u9a6c\u5c3e|\u5de8\u4e73|"
        r"catgirl|cat\s*ears|nun|maid|red\s*hair|black\s*hair|white\s*hair|green\s*eyes|twintails|large\s*breasts)",
        source,
        re.I,
    ))


def _canvas_vlm_persona_lookup_debug_enabled():
    value = str(os.environ.get("SAI_VLM_PERSONA_LOOKUP_DEBUG") or "").strip().lower()
    return value in {"1", "true", "yes", "on", "debug"}


def _canvas_vlm_persona_store_lookup_candidate(lookup, key_source, tag, count=0, source=""):
    key = canvas_vlm_prompt_pipeline._semantic_lookup_key(key_source)
    clean = _canvas_vlm_persona_canonical_tag(tag)
    if not key or len(key) < 2 or not clean:
        return
    candidate = {
        "tag": clean,
        "count": int(count or 0),
        "term": str(key_source or ""),
        "source": str(source or ""),
    }
    current = list(lookup.get(key) or [])
    for index, item in enumerate(current):
        if item.get("tag") == clean:
            if candidate["count"] > int(item.get("count") or 0):
                current[index] = candidate
            break
    else:
        current.append(candidate)
    current.sort(key=lambda item: (int(item.get("count") or 0), len(str(item.get("term") or ""))), reverse=True)
    lookup[key] = current[:VLM_PERSONA_LOOKUP_MAX_CANDIDATES]


@functools.lru_cache(maxsize=1)
def _canvas_vlm_persona_tag_lookup():
    lookup = {}
    try:
        rows = canvas_danbooru_service._canvas_gallery_load_seed_rows(categories=["general"], max_rows=0)
    except Exception:
        rows = []
    try:
        general_lookup = canvas_vlm_prompt_pipeline._danbooru_general_tag_lookup() or {}
    except Exception:
        general_lookup = {}
    try:
        allowed_tags = set(canvas_vlm_prompt_pipeline.SCENE_TAG_POOL)
        allowed_tags.update(canvas_vlm_prompt_pipeline._curated_tagcart_tag_set())
        allowed_tags.update(general_lookup.values())
    except Exception:
        allowed_tags = set(general_lookup.values())

    def add(key_source, tag, count=0):
        tag = _canvas_vlm_persona_canonical_tag(tag)
        if not tag:
            return
        if tag in {"none", "null", "nil", "na", "n/a", "no_humans"}:
            return
        if not _canvas_vlm_persona_visual_tag_allowed(tag):
            return
        try:
            if not canvas_vlm_prompt_pipeline._semantic_lookup_term_allowed_for_tag(key_source, tag):
                return
        except Exception:
            pass
        if allowed_tags and tag not in allowed_tags:
            try:
                if not canvas_vlm_prompt_pipeline._canonical_tag_allowed(tag):
                    return
            except Exception:
                return
        _canvas_vlm_persona_store_lookup_candidate(lookup, key_source, tag, count, "seed_general")

    for row in rows or []:
        tag = str((row or {}).get("tag") or "").strip()
        count = int((row or {}).get("count") or 0)
        add(tag, tag, count)
        add(str(tag).replace("_", " "), tag, count)
        translation = str((row or {}).get("translation") or "").strip()
        if translation:
            for item in re.split(r"[,|/，、；;()（）]", translation):
                add(item, tag, count)
        aliases = str((row or {}).get("aliases") or "").strip()
        if aliases:
            for item in re.split(r"[,|/，、；;]", aliases):
                add(item, tag, count)
    for key, tag in general_lookup.items():
        add(key, tag, 0)
    return {key: tuple(value) for key, value in lookup.items() if value}


def _canvas_vlm_persona_tag_phrases(text):
    source = str(text or "").strip()
    if not source:
        return []
    phrases = []

    def add(value):
        value = str(value or "").strip()
        if value and value not in phrases:
            phrases.append(value)

    normalized = re.sub(r"([A-Za-z]+)-haired\b", r"\1 hair", source, flags=re.I)
    normalized = re.sub(r"([A-Za-z]+)-breasted\b", r"\1 breasts", normalized, flags=re.I)
    normalized = normalized.replace("_", " ")
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9']+", normalized.lower())
    for size in (3, 2, 1):
        for start in range(0, max(0, len(tokens) - size + 1)):
            add(" ".join(tokens[start:start + size]))

    for chunk in re.findall(r"[\u3400-\u9fff]{2,24}", source):
        max_len = min(6, len(chunk))
        for size in range(max_len, 1, -1):
            for start in range(0, len(chunk) - size + 1):
                add(chunk[start:start + size])
    return phrases[:180]


def _canvas_vlm_persona_database_tags(text, limit=18):
    try:
        lookup = _canvas_vlm_persona_tag_lookup()
    except Exception:
        lookup = {}
    if not lookup:
        return []
    output = []
    for phrase in _canvas_vlm_persona_tag_phrases(text):
        key = canvas_vlm_prompt_pipeline._semantic_lookup_key(phrase)
        clean = _canvas_vlm_select_persona_lookup_candidate(
            phrase,
            lookup.get(key),
            text,
            "seed_general",
        )
        if clean and clean not in output:
            output.append(clean)
        if len(output) >= int(limit or 18):
            break
    return output


def _canvas_vlm_persona_canonical_tag(tag):
    clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
    if not clean:
        return ""
    clean = canvas_danbooru_policy.REPAIR_TAG_ALIASES.get(clean, clean)
    return VLM_PERSONA_TAG_ALIASES.get(clean, clean)


def _canvas_vlm_persona_visual_tag_allowed(tag):
    clean = _canvas_vlm_persona_canonical_tag(tag)
    if not clean:
        return False
    if clean.endswith("_theme"):
        return False
    if clean in VLM_PERSONA_LOW_SIGNAL_TAGS:
        return False
    if clean in canvas_danbooru_policy.QUALITY_TAGS:
        return False
    if clean in canvas_vlm_prompt_pipeline.PLAIN_OUTPUT_TAGS:
        return False
    if canvas_danbooru_policy.is_forbidden_positive_tag(clean):
        return False
    if ":" in clean or len(clean) > 64 or clean.count("_") > 5:
        return False
    return not bool(re.search(r"[^a-z0-9_()'!/.-]", clean))


def _canvas_vlm_persona_color_only_term(term):
    source = canvas_vlm_prompt_pipeline._semantic_lookup_key(term)
    return source in {
        "black", "blue", "brown", "green", "grey", "gray", "orange", "pink", "purple", "red", "silver", "white", "yellow",
        "\u9ed1", "\u9ed1\u8272", "\u84dd", "\u85cd", "\u84dd\u8272", "\u85cd\u8272", "\u68d5", "\u8910", "\u68d5\u8272", "\u8910\u8272",
        "\u7eff", "\u7da0", "\u7eff\u8272", "\u7da0\u8272", "\u7070", "\u7070\u8272", "\u6a59", "\u6a59\u8272",
        "\u7c89", "\u7c89\u8272", "\u7c89\u7ea2", "\u7c89\u7d05", "\u7d2b", "\u7d2b\u8272", "\u7ea2", "\u7d05", "\u7ea2\u8272", "\u7d05\u8272",
        "\u94f6", "\u9280", "\u94f6\u8272", "\u9280\u8272", "\u767d", "\u767d\u8272", "\u9ec4", "\u9ec3", "\u9ec4\u8272", "\u9ec3\u8272",
    }


def _canvas_vlm_persona_term_context_source(term, full_text=""):
    source = str(term or "")
    full = str(full_text or "")
    if not source or not full or source not in full:
        return source
    escaped = re.escape(source)
    hints = []
    context_rules = (
        (r"(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b)", " hair"),
        (r"(?:\u773c\u775b|\u773c\u7738|\u773c|\u77b3|\beyes?\b)", " eyes"),
        (r"(?:\u8033|\bear\b|\bears\b)", " ears"),
        (r"(?:\u6bdb|\bfur\b|\bfluff\b)", " fur"),
        (r"(?:\u6311\u67d3|\u6761\u7eb9|\bstreak|\bhighlight|\bstripe)", " streak"),
    )
    for slot_pattern, hint in context_rules:
        if re.search(rf"{escaped}.{{0,2}}{slot_pattern}|{slot_pattern}.{{0,2}}{escaped}", full, re.I):
            hints.append(hint)
    return source + "".join(hints)


def _canvas_vlm_persona_visual_term_tag_compatible(term, tag, full_text=""):
    return _canvas_vlm_persona_visual_term_tag_reject_reason(term, tag, full_text) == ""


def _canvas_vlm_persona_visual_term_tag_reject_reason(term, tag, full_text=""):
    clean = _canvas_vlm_persona_canonical_tag(tag)
    source = _canvas_vlm_persona_term_context_source(term, full_text)
    if not clean:
        return "empty_tag"
    if not _canvas_vlm_persona_visual_tag_allowed(clean):
        return "tag_not_allowed"
    if clean.endswith("_theme"):
        return "theme_tag"
    if _canvas_vlm_persona_color_only_term(source):
        return "color_only_term"
    if re.search(r"(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b|\u6311\u67d3|\u6761\u7eb9|\bstreak|\bhighlight|\bstripe)", source, re.I):
        if "hair" in clean or clean in VLM_PERSONA_HAIR_STYLE_TAGS:
            return ""
        return "hair_slot_mismatch"
    if re.search(r"(?:\u773c\u775b|\u773c\u7738|\u773c|\u77b3|\beyes?\b)", source, re.I):
        if "eye" in clean:
            return ""
        return "eye_slot_mismatch"
    if re.search(r"(?:\u8033|\bear\b|\bears\b)", source, re.I):
        if "ear" in clean or clean in {"catgirl", "animal_ears", "ear_fluff", "white_fur"}:
            return ""
        return "ear_slot_mismatch"
    if re.search(r"(?:\u6bdb|\bfur\b|\bfluff\b)", source, re.I):
        if any(fragment in clean for fragment in ("fur", "fluff", "hair", "ear")):
            return ""
        return "fur_slot_mismatch"
    return ""


def _canvas_vlm_persona_candidate_count_score(count):
    count = max(0, int(count or 0))
    if count >= 100000:
        return 12
    if count >= 10000:
        return 9
    if count >= 1000:
        return 6
    if count >= 100:
        return 3
    return 0


def _canvas_vlm_persona_visual_slot_score(term, tag, full_text=""):
    clean = _canvas_vlm_persona_canonical_tag(tag)
    source = _canvas_vlm_persona_term_context_source(term, full_text)
    score = 0
    if re.search(r"(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b)", source, re.I):
        if clean.endswith("_hair") or clean in VLM_PERSONA_HAIR_STYLE_TAGS:
            score += 45
        elif "hair" in clean:
            score += 30
    if re.search(r"(?:\u6311\u67d3|\u6761\u7eb9|\bstreak|\bhighlight|\bstripe)", source, re.I):
        if clean in {"streaked_hair", "white_streaked_hair"}:
            score += 45
        elif "hair" in clean:
            score += 18
    if re.search(r"(?:\u773c\u775b|\u773c\u7738|\u773c|\u77b3|\beyes?\b)", source, re.I):
        if clean.endswith("_eyes") or clean.endswith("_eye"):
            score += 45
        elif "eye" in clean:
            score += 25
    if re.search(r"(?:\u8033|\bear\b|\bears\b)", source, re.I):
        if clean in {"cat_ears", "animal_ears", "ear_fluff"} or clean.endswith("_ears"):
            score += 45
        elif "ear" in clean:
            score += 25
        elif clean == "catgirl":
            score += 18
    if re.search(r"(?:\u6bdb|\bfur\b|\bfluff\b)", source, re.I):
        if clean in {"ear_fluff", "white_fur"}:
            score += 45
        elif any(fragment in clean for fragment in ("fur", "fluff")):
            score += 25
    return score


def _canvas_vlm_persona_candidate_score(term, candidate, full_text=""):
    clean = _canvas_vlm_persona_canonical_tag((candidate or {}).get("tag"))
    if not clean:
        return -100000
    term_key = canvas_vlm_prompt_pipeline._semantic_lookup_key(term)
    candidate_term = str((candidate or {}).get("term") or "")
    candidate_term_key = canvas_vlm_prompt_pipeline._semantic_lookup_key(candidate_term)
    tag_key = canvas_vlm_prompt_pipeline._semantic_lookup_key(clean)
    score = 0
    if term_key and candidate_term_key and term_key == candidate_term_key:
        score += 80
    elif term_key and tag_key and term_key == tag_key:
        score += 70
    elif term_key and candidate_term_key and (term_key in candidate_term_key or candidate_term_key in term_key):
        score += 25
    score += min(30, len(term_key) * 2)
    score += _canvas_vlm_persona_visual_slot_score(term, clean, full_text)
    score += _canvas_vlm_persona_candidate_count_score((candidate or {}).get("count"))
    if clean in {"catgirl", "cat_ears", "ear_fluff", "white_fur", "streaked_hair", "white_streaked_hair"}:
        score += 10
    if clean.endswith("_hair") or clean.endswith("_eyes") or clean in VLM_PERSONA_HAIR_STYLE_TAGS:
        score += 8
    if "(" in clean or ")" in clean:
        score -= 35
    if clean.count("_") >= 4 and clean not in {"white_streaked_hair"}:
        score -= 20
    return score


def _canvas_vlm_select_persona_lookup_candidate(term, candidates, full_text="", source_name=""):
    normalized = []
    if isinstance(candidates, dict):
        normalized = [candidates]
    elif isinstance(candidates, str):
        normalized = [{"tag": candidates, "count": 0, "term": term, "source": source_name}]
    else:
        normalized = [item for item in (candidates or []) if isinstance(item, dict)]
    rejected = []
    accepted = []
    for candidate in normalized:
        clean = _canvas_vlm_persona_canonical_tag(candidate.get("tag"))
        reason = _canvas_vlm_persona_visual_term_tag_reject_reason(term, clean, full_text)
        if reason:
            rejected.append({"tag": clean, "reason": reason})
            continue
        scored = dict(candidate)
        scored["tag"] = clean
        scored["score"] = _canvas_vlm_persona_candidate_score(term, scored, full_text)
        accepted.append(scored)
    if not accepted:
        if rejected and _canvas_vlm_persona_lookup_debug_enabled():
            logger.info("persona lookup rejected phrase=%r source=%s rejected=%s", term, source_name, rejected[:6])
        return ""
    accepted.sort(key=lambda item: (int(item.get("score") or 0), int(item.get("count") or 0)), reverse=True)
    selected = accepted[0]
    if _canvas_vlm_persona_lookup_debug_enabled():
        logger.info(
            "persona lookup selected phrase=%r source=%s selected=%s score=%s rejected=%s candidates=%s",
            term,
            source_name,
            selected.get("tag"),
            selected.get("score"),
            rejected[:6],
            [
                {"tag": item.get("tag"), "score": item.get("score"), "count": item.get("count")}
                for item in accepted[:6]
            ],
        )
    return str(selected.get("tag") or "")


@functools.lru_cache(maxsize=1)
def _canvas_vlm_persona_visual_tag_lookup():
    rows = []
    try:
        rows = canvas_danbooru_service._canvas_load_danbooru_tag_rows(source_mode="all")
    except Exception:
        rows = []
    lookup = {}

    def add(term, tag, count=0):
        clean = _canvas_vlm_persona_canonical_tag(tag)
        if not _canvas_vlm_persona_visual_tag_allowed(clean):
            return
        try:
            if not canvas_vlm_prompt_pipeline._semantic_lookup_term_allowed_for_tag(term, clean):
                return
        except Exception:
            pass
        _canvas_vlm_persona_store_lookup_candidate(lookup, term, clean, count, "danbooru_all")

    for row in rows or []:
        if not isinstance(row, dict):
            continue
        source = str(row.get("source") or "")
        category = str(row.get("category") or "").strip().lower()
        if source == "danbooru_all.csv" and category not in {"general", "custom"}:
            continue
        group_text = " ".join(
            str(row.get(key) or "")
            for key in ("group", "top_group", "sub_group", "path_group")
        )
        if "NSFW" in group_text.upper():
            continue
        tag = str(row.get("tag") or "").strip()
        if not tag:
            continue
        count = int(row.get("count") or 0)
        add(tag, tag, count)
        add(str(tag).replace("_", " "), tag, count)
        aliases = str(row.get("aliases") or "").strip()
        if aliases:
            for item in re.split(r"[,|/，、；;]", aliases):
                add(item, tag, count)
        translation = str(row.get("translation") or "").strip()
        if translation:
            for item in re.split(r"[,|/，、；;()（）]", translation):
                add(item, tag, count)
    return {key: tuple(value) for key, value in lookup.items() if value}


def _canvas_vlm_persona_visual_database_tags(text, limit=24):
    try:
        lookup = _canvas_vlm_persona_visual_tag_lookup()
    except Exception:
        lookup = {}
    if not lookup:
        return []
    output = []
    for phrase in _canvas_vlm_persona_tag_phrases(text):
        key = canvas_vlm_prompt_pipeline._semantic_lookup_key(phrase)
        tag = _canvas_vlm_select_persona_lookup_candidate(
            phrase,
            lookup.get(key),
            text,
            "danbooru_all",
        )
        if tag and tag not in output:
            output.append(tag)
        if len(output) >= int(limit or 24):
            break
    return output


def _canvas_vlm_persona_color_visual_tags(text):
    source = str(text or "")
    if not source:
        return []
    output = []

    def add(tag):
        clean = _canvas_vlm_persona_canonical_tag(tag)
        if clean and clean not in output:
            output.append(clean)

    hair_noun = r"(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b)"
    eye_noun = r"(?:\u773c\u775b|\u773c\u7738|\u773c|\u77b3\u5b54|\u77b3|\beyes?\b)"
    streak_noun = r"(?:\u6311\u67d3|\u6761\u7eb9|\bstreak(?:ed)?\b|\bhighlight(?:ed)?\b|\bstripe(?:d)?\b)"
    colors = (
        (r"(?:\u767d\u8272|\u767d|\bwhite\b)", "white_hair", ""),
        (r"(?:\u9ed1\u8272|\u9ed1|\bblack\b)", "black_hair", "black_eyes"),
        (r"(?:\u7ea2\u8272|\u7d05\u8272|\u7ea2|\u7d05|\bred\b)", "red_hair", "red_eyes"),
        (r"(?:\u7eff\u8272|\u7da0\u8272|\u7fe0\u7eff|\u7fe0\u7da0|\u7eff|\u7da0|\bgreen\b)", "green_hair", "green_eyes"),
        (r"(?:\u84dd\u8272|\u85cd\u8272|\u84dd|\u85cd|\bblue\b)", "blue_hair", "blue_eyes"),
        (r"(?:\u7c89\u8272|\u7c89\u7ea2|\u7c89\u7d05|\u7c89|\bpink\b)", "pink_hair", "pink_eyes"),
        (r"(?:\u7d2b\u8272|\u7d2b|\bpurple\b)", "purple_hair", "purple_eyes"),
        (r"(?:\u68d5\u8272|\u8910\u8272|\u68d5|\u8910|\bbrown\b)", "brown_hair", "brown_eyes"),
        (r"(?:\u91d1\u8272|\u91d1|\u9ec4\u53d1|\u9ec3\u9aee|\bblonde\b|\bblond\b)", "blonde_hair", ""),
        (r"(?:\u94f6\u8272|\u9280\u8272|\u94f6|\u9280|\bsilver\b)", "silver_hair", "silver_eyes"),
        (r"(?:\u7070\u8272|\u7070|\bgrey\b|\bgray\b)", "grey_hair", "grey_eyes"),
        (r"(?:\u6a59\u8272|\u6a59|\borange\b)", "orange_hair", "orange_eyes"),
    )
    for color_pattern, hair_tag, eye_tag in colors:
        if hair_tag and re.search(
            rf"{color_pattern}.{{0,8}}{hair_noun}|"
            rf"{hair_noun}(?:\s|[=:：]|(?:\u662f|\u4e3a|\u70ba|\u5448|\u989c\u8272|\u984f\u8272|is|are|color|colour|colored|coloured|with|has)){{0,4}}{color_pattern}",
            source,
            re.I,
        ):
            add(hair_tag)
        if eye_tag and re.search(rf"{color_pattern}.{{0,8}}{eye_noun}|{eye_noun}.{{0,8}}{color_pattern}", source, re.I):
            add(eye_tag)
        if re.search(rf"{color_pattern}.{{0,10}}{streak_noun}|{streak_noun}.{{0,10}}{color_pattern}", source, re.I):
            add("streaked_hair")
            if hair_tag == "white_hair":
                add("white_streaked_hair")
    if re.search(streak_noun, source, re.I):
        add("streaked_hair")
    return output


def _canvas_vlm_persona_compound_visual_tags(text):
    source = str(text or "")
    if not source:
        return []
    output = []

    def add(*tags):
        for tag in tags:
            clean = _canvas_vlm_persona_canonical_tag(tag)
            if clean and clean not in output:
                output.append(clean)

    if re.search(r"\bcat\s*girls?\b|\bcatgirl\b|\bnekomimi\b|\u732b\u8033.{0,2}\u5a18|\u732b\u5a18", source, re.I):
        add("catgirl")
    if re.search(r"\bcat\s*ears?\b|\bnekomimi\b|\u732b\u8033", source, re.I):
        add("cat_ears")
    if re.search(r"\b(?:bunny|rabbit)\s*(?:girl|girls|suit|costume|outfit|ears?)\b|\u5154\u5973\u90ce|\u5154\u8033|\u5154\u5b50", source, re.I):
        add("bunny_girl", "rabbit_ears")
    if re.search(r"(?:\u5154\u5973\u90ce|\u5154\u8033).{0,12}(?:\u8863\u670d|\u670d|\u88c5|\u88dd|outfit|costume|suit)|\b(?:bunny|rabbit)\s*(?:suit|costume|outfit)\b", source, re.I):
        add("bunny_girl", "playboy_bunny")
    if re.search(r"\b(?:large|big|huge)\s+breasts?\b|\b(?:large|big|huge)\s+chest\b|\u80f8\u5927|\u5927\u80f8|\u5de8\u4e73|\u7206\u4e73", source, re.I):
        add("large_breasts")
    for tag in _canvas_vlm_persona_color_visual_tags(source):
        add(tag)
    if re.search(
        r"\bwhite\s+(?:streak(?:ed)?|highlight(?:ed)?|stripe(?:d)?)\s+hair\b|"
        r"\b(?:streak(?:ed)?|highlight(?:ed)?|stripe(?:d)?)\s+white\s+hair\b|"
        r"(?:\u6311\u67d3|\u6761\u7eb9).{0,8}\u767d.{0,4}(?:\u53d1|\u9aee)|"
        r"\u767d.{0,4}(?:\u53d1|\u9aee).{0,8}(?:\u6311\u67d3|\u6761\u7eb9)",
        source,
        re.I,
    ):
        add("streaked_hair", "white_streaked_hair")
    if re.search(
        r"(?:\bear\b|ears|\u8033).{0,16}(?:fur|fluff|\u6bdb)|"
        r"(?:fur|fluff|\u6bdb).{0,16}(?:\bear\b|ears|\u8033)",
        source,
        re.I,
    ):
        add("ear_fluff")
        if re.search(r"(?:white|\u767d).{0,8}(?:fur|fluff|\u6bdb)|(?:fur|fluff|\u6bdb).{0,8}(?:white|\u767d)", source, re.I):
            add("white_fur")
    return output


def _canvas_vlm_persona_filter_visual_tag_conflicts(tags, text):
    output = []
    for tag in tags or []:
        clean = _canvas_vlm_persona_canonical_tag(tag)
        if clean and clean not in output:
            output.append(clean)
    has_streaked_white = bool(
        {"streaked_hair", "white_streaked_hair"}.intersection(output)
        and re.search(
            r"(?:\u6311\u67d3|\u6761\u7eb9|streak|highlight|stripe).{0,12}(?:\u767d|white)|"
            r"(?:\u767d|white).{0,12}(?:\u6311\u67d3|\u6761\u7eb9|streak|highlight|stripe)",
            str(text or ""),
            re.I,
        )
    )
    base_hair_tags = {
        tag
        for tag in output
        if tag.endswith("_hair") and tag not in {"white_hair", "streaked_hair", "white_streaked_hair"}
    }
    has_explicit_white_base_hair = bool(re.search(
        r"(?:\u767d\u8272|\u767d|white).{0,8}(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b)|"
        r"(?:\u5934\u53d1|\u982d\u9aee|\u53d1|\u9aee|\bhair\b).{0,8}(?:\u767d\u8272|\u767d|white)",
        str(text or ""),
        re.I,
    ))
    if has_streaked_white and base_hair_tags and not has_explicit_white_base_hair:
        output = [tag for tag in output if tag != "white_hair"]
    if "twintails" in output:
        output = [tag for tag in output if tag != "ponytail"]
    return output


def _canvas_vlm_continuation_reference_prompt_tags(text, limit=32):
    source = str(text or "").strip()
    if not source or "\n" not in source:
        return []
    output = []
    blocked_tags = set()
    try:
        blocked_tags = _canvas_blocked_prompt_tags_for_intent(source)
    except Exception:
        blocked_tags = set()
    for line in source.splitlines()[:4]:
        candidate = str(line or "").strip()
        if not candidate or "," not in candidate:
            continue
        try:
            canonical = _canvas_canonical_draft_tag_list(candidate, blocked_tags=blocked_tags)
        except Exception:
            canonical = ""
        tags = [
            canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
            for item in str(canonical or candidate).split(",")
            if canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
        ]
        tags = [tag for tag in tags if tag and tag not in VLM_AGENT_INVALID_PROMPT_TAGS]
        if len(tags) < 3 and not set(tags).intersection({"1girl", "1boy", "no_humans"}):
            continue
        for tag in tags:
            if tag in blocked_tags:
                continue
            if tag not in output:
                output.append(tag)
            if len(output) >= int(limit or 32):
                return output
        if output:
            break
    return output


def _canvas_count_word_to_int(value):
    text = str(value or "").strip().lower()
    if not text:
        return None
    if text.isdigit():
        return int(text)
    mapping = {
        "one": 1,
        "two": 2,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
        "\u4e00": 1,
        "\u4e8c": 2,
        "\u4e24": 2,
        "\u5169": 2,
        "\u4fe9": 2,
        "\u5006": 2,
        "\u4e09": 3,
        "\u56db": 4,
        "\u4e94": 5,
        "\u516d": 6,
    }
    return mapping.get(text)


def _canvas_explicit_subject_total_count(text):
    source = str(text or "")
    if not source.strip():
        return None
    if re.search(
        r"(?:\u6ca1\u6709|\u6c92\u6709|\u65e0|\u7121|\u4e0d\u8981|\u522b\u753b|\u5225\u756b|no|without).{0,8}(?:\u4eba|\u4eba\u7269|\u89d2\u8272|humans?|people|characters?)",
        source,
        re.I,
    ):
        return 0
    try:
        explicit = canvas_vlm_prompt_pipeline._explicit_subject_mention_counts(source)
    except Exception:
        explicit = {}
    explicit_total = int((explicit or {}).get("girls") or 0) + int((explicit or {}).get("boys") or 0)
    if explicit_total > 0:
        return explicit_total
    pattern = re.compile(
        r"(?P<count>\d+|one|two|three|four|five|six|\u4e00|\u4e8c|\u4e24|\u5169|\u4fe9|\u5006|\u4e09|\u56db|\u4e94|\u516d)"
        r"\s*(?:\u4e2a|\u500b|\u4f4d|\u540d)?\s*"
        r"(?:\u4eba|\u4eba\u7269|\u89d2\u8272|people|persons|characters?)",
        re.I,
    )
    match = pattern.search(source)
    if not match:
        return None
    count = _canvas_count_word_to_int(match.group("count"))
    if count is None:
        return None
    return max(0, min(int(count), 12))


def _canvas_explicit_visual_subject_total_count(text):
    source = str(text or "")
    if not source.strip():
        return None
    pattern = re.compile(
        r"(?P<count>\d+|one|two|three|four|five|six|\u4e00|\u4e8c|\u4e24|\u5169|\u4fe9|\u5006|\u4e09|\u56db|\u4e94|\u516d)"
        r"\s*(?:\u4e2a|\u500b|\u4f4d|\u540d)?\s*.{0,16}?"
        r"(?:\u732b\u5a18|\u732b\u8033\u5a18|\u5973\u5b69|\u5c11\u5973|\u5973\u751f|\u5973\u90ce|\u5973\u6027|\bgirls?\b|\bcat\s*girls?\b|\bcatgirls?\b|\bbunny\s*girls?\b)",
        re.I,
    )
    match = pattern.search(source)
    if not match:
        return None
    count = _canvas_count_word_to_int(match.group("count"))
    if count is None:
        return None
    return max(0, min(int(count), 12))


def _canvas_visual_subject_count_tags(text, visual_tags):
    tag_set = {str(tag or "").strip().lower() for tag in visual_tags or [] if str(tag or "").strip()}
    if "no_humans" in tag_set:
        return []
    source = str(text or "")
    female_hint = bool(
        tag_set.intersection({"catgirl", "bunny_girl", "playboy_bunny", "large_breasts", "red_eyes", "white_hair"})
        or re.search(r"\u732b\u5a18|\u732b\u8033\u5a18|\u5973\u5b69|\u5c11\u5973|\u5973\u751f|\u5973\u90ce|\u5973\u6027|\bgirls?\b|\bcat\s*girls?\b|\bcatgirls?\b|\bbunny\s*girls?\b", source, re.I)
    )
    male_hint = bool(re.search(r"\u7537\u5b69|\u7537\u751f|\u7537\u6027|\u7537\u90ce|\bboys?\b|\bmen\b|\bmale\b", source, re.I))
    if not female_hint and not male_hint:
        return []
    total = _canvas_explicit_subject_total_count(source)
    if total is None:
        total = _canvas_explicit_visual_subject_total_count(source)
    if total is None:
        total = 1
    total = max(1, min(int(total), 6))
    if female_hint and not male_hint:
        return ["1girl" if total == 1 else f"{total}girls"]
    if male_hint and not female_hint:
        return ["1boy" if total == 1 else f"{total}boys"]
    return ["multiple_girls" if total > 1 else "1girl"]


def _canvas_vlm_common_character_alias_locks(text):
    source = str(text or "")
    if not source.strip():
        return [], []
    lowered = source.lower()
    character_tags = []
    copyright_tags = []
    for aliases, character_tag, copyright_tag in VLM_AGENT_COMMON_CHARACTER_ALIAS_LOCKS:
        matched = False
        for alias in aliases:
            value = str(alias or "").strip()
            if not value:
                continue
            if re.search(r"[\u4e00-\u9fff]", value):
                matched = value in source
            else:
                pattern = re.escape(value.lower()).replace(r"\ ", r"[\s_]+")
                matched = bool(re.search(rf"(?<![a-z0-9_]){pattern}(?![a-z0-9_])", lowered, re.I))
            if matched:
                break
        if not matched:
            continue
        if character_tag and character_tag not in character_tags:
            character_tags.append(character_tag)
        if copyright_tag and copyright_tag not in copyright_tags:
            copyright_tags.append(copyright_tag)
    return character_tags, copyright_tags


def _canvas_character_tag_base_key(tag):
    clean = str(tag or "").strip().lower()
    if not clean:
        return ""
    clean = re.sub(r"_\([^)]+\)$", "", clean)
    clean = re.sub(r"\s*\([^)]+\)$", "", clean)
    return clean


def _canvas_character_tag_work_key(tag):
    clean = str(tag or "").strip().lower()
    match = re.search(r"_\(([^)]+)\)$", clean)
    if not match:
        return ""
    return canvas_danbooru_service._canvas_clean_prompt_tag_name(match.group(1))


def _canvas_text_mentions_character_base(text, base_key):
    base = str(base_key or "").strip().lower()
    source = str(text or "").strip().lower()
    if not base or not source:
        return False
    variants = {base, base.replace("_", " "), base.replace("_", "-")}
    for variant in variants:
        term = re.escape(variant).replace(r"\ ", r"[\s_-]+")
        if re.search(rf"(?<![a-z0-9_]){term}(?![a-z0-9_])", source, re.I):
            return True
    return False


def _canvas_promote_same_work_character_candidates(text, character_tags, copyright_tags, candidates, limit=6):
    output = list(character_tags or [])
    if len(output) >= int(limit or 6):
        return output
    source = str(text or "")
    if not source.strip():
        return output
    source_has_multi_hint = bool(re.search(r"\b(?:and|with|plus|alongside)\b|[、，,]\s*[a-z]|\u548c|\u4e0e|\u8ddf|\u540c|\u966a", source, re.I))
    if not source_has_multi_hint:
        return output
    existing_bases = {
        _canvas_character_tag_base_key(tag)
        for tag in output
        if _canvas_character_tag_base_key(tag)
    }
    work_keys = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in (copyright_tags or [])
        if str(tag or "").strip()
    }
    for tag in list(work_keys):
        if tag.endswith("_(series)"):
            work_keys.add(tag[:-len("_(series)")])
        else:
            work_keys.add(f"{tag}_(series)")
    for row in candidates or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("category") or "").strip().lower() != "character":
            continue
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(row.get("tag"))
        if not clean or clean in output:
            continue
        base = _canvas_character_tag_base_key(clean)
        if not base or base in existing_bases:
            continue
        work = _canvas_character_tag_work_key(clean)
        if work_keys and work and work not in work_keys:
            continue
        if work_keys and not work:
            continue
        if not _canvas_text_mentions_character_base(source, base):
            continue
        output.append(clean)
        existing_bases.add(base)
        if len(output) >= int(limit or 6):
            break
    return output


def _canvas_filter_duplicate_character_rows(rows):
    source_rows = [row for row in (rows or []) if isinstance(row, dict) and str(row.get("tag") or "").strip()]
    if len(source_rows) <= 1:
        return source_rows
    grouped = {}
    for index, row in enumerate(source_rows):
        key = _canvas_character_tag_base_key(row.get("tag")) or str(row.get("tag") or "").strip().lower()
        grouped.setdefault(key, []).append((index, row))
    keep_indexes = set()
    for grouped_rows in grouped.values():
        if len(grouped_rows) == 1:
            keep_indexes.add(grouped_rows[0][0])
            continue
        def rank(item):
            index, row = item
            source = str(row.get("source") or "").lower()
            glossary = 1 if "character_glossary" in source or row.get("glossary_status") else 0
            priority = float(row.get("_priority") or 0)
            score = float(row.get("score") or 0)
            count = float(row.get("count") or 0)
            return (glossary, priority, score, count, -index)
        keep_indexes.add(max(grouped_rows, key=rank)[0])
    return [row for index, row in enumerate(source_rows) if index in keep_indexes]


def _canvas_dedupe_character_count_tags(tags):
    output = []
    seen = set()
    for tag in tags or []:
        clean = str(tag or "").strip()
        if not clean:
            continue
        base_key = _canvas_character_tag_base_key(clean) or clean.lower()
        if base_key in seen:
            continue
        seen.add(base_key)
        output.append(clean)
    return output


def _canvas_vlm_current_turn_prompt_locks(prompt, allow_pure_scenery=True, allow_character_resolution=True):
    text = str(prompt or "").strip()
    key = (text, bool(allow_pure_scenery), bool(allow_character_resolution))
    cached = _canvas_vlm_current_turn_lock_cache.get(key)
    if isinstance(cached, dict):
        return copy.deepcopy(cached)
    result = _canvas_vlm_current_turn_prompt_locks_uncached(
        text,
        allow_pure_scenery=allow_pure_scenery,
        allow_character_resolution=allow_character_resolution,
    )
    if isinstance(result, dict):
        _canvas_vlm_current_turn_lock_cache[key] = copy.deepcopy(result)
        _canvas_vlm_current_turn_lock_cache_order.append(key)
        while len(_canvas_vlm_current_turn_lock_cache_order) > CANVAS_VLM_LOCAL_LOCK_CACHE_MAX:
            old_key = _canvas_vlm_current_turn_lock_cache_order.pop(0)
            _canvas_vlm_current_turn_lock_cache.pop(old_key, None)
    return copy.deepcopy(result) if isinstance(result, dict) else {}


def _canvas_vlm_current_turn_prompt_locks_uncached(prompt, allow_pure_scenery=True, allow_character_resolution=True):
    text = str(prompt or "").strip()
    if not text:
        return {}
    if allow_pure_scenery:
        try:
            pure_scenery = canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(text, "")
        except Exception:
            pure_scenery = {}
        if isinstance(pure_scenery, dict) and pure_scenery.get("locked"):
            pure_tags = []
            for raw in str(pure_scenery.get("prompt") or "").split(","):
                clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
                if clean and clean not in pure_tags:
                    pure_tags.append(clean)
            if pure_tags:
                counts = _canvas_subject_counts_from_count_tags(pure_tags)
                scene_tags = [tag for tag in pure_tags if tag != "no_humans"][:12]
                return {
                    "required_prompt_tags": pure_tags[:24],
                    "draft_prompt_prefix": ", ".join(pure_tags[:18]),
                    "scene_tags": scene_tags,
                    "scene_branch": "pure_scenery",
                    "subject_count_tags": ["no_humans"],
                    "subject_counts": counts,
                    "draft_prompt_rule": (
                        "Pure scenery request. Preserve no_humans and do not add character, persona, or named-character tags."
                    ),
                }
    if allow_character_resolution:
        try:
            resolution = canvas_danbooru_service._canvas_requested_character_resolution(text)
        except Exception:
            resolution = {}
    else:
        resolution = {}
    resolution_state = str(resolution.get("state") or "").strip().lower() if isinstance(resolution, dict) else ""
    resolved_rows = _canvas_filter_duplicate_character_rows(resolution.get("resolved") if resolution_state == "resolved" else [])
    character_tags = [
        str(item.get("tag") or "").strip()
        for item in (resolved_rows or [])
        if isinstance(item, dict) and str(item.get("tag") or "").strip()
    ] if resolution_state == "resolved" else []
    copyright_tags = [
        str(item.get("tag") or "").strip()
        for item in (resolution.get("copyright_candidates") or [])
        if isinstance(item, dict) and str(item.get("tag") or "").strip()
    ] if resolution_state == "resolved" else []
    if resolution_state == "resolved" and character_tags:
        character_tags = _canvas_promote_same_work_character_candidates(
            text,
            character_tags,
            copyright_tags,
            resolution.get("candidates") or [],
        )
    if not character_tags:
        fallback_character_tags, fallback_copyright_tags = _canvas_vlm_common_character_alias_locks(text)
        if fallback_character_tags:
            character_tags = fallback_character_tags
            copyright_tags = fallback_copyright_tags
            resolution_state = "resolved"
    explicit_total = _canvas_explicit_subject_total_count(text)
    if explicit_total is not None and explicit_total > 0 and len(character_tags) > explicit_total:
        character_tags = character_tags[:explicit_total]
    direct_tags = []
    try:
        direct_tags = [
            str(tag or "").strip()
            for tag in (canvas_vlm_prompt_pipeline._generic_direct_hint_tags(text) or [])
            if str(tag or "").strip()
        ]
    except Exception:
        direct_tags = []
    for tag in _canvas_vlm_persona_compound_visual_tags(text):
        clean = str(tag or "").strip()
        if clean and clean not in direct_tags:
            direct_tags.append(clean)
    blocked_prompt_tags = _canvas_blocked_prompt_tags_for_intent(text)
    if blocked_prompt_tags:
        direct_tags = [tag for tag in direct_tags if tag not in blocked_prompt_tags]
    if direct_tags and not allow_character_resolution:
        try:
            index = canvas_danbooru_service._canvas_load_danbooru_character_index()
            identity_tags = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
        except Exception:
            identity_tags = set()
        direct_tags = [tag for tag in direct_tags if tag not in identity_tags]
    reference_tags = _canvas_vlm_continuation_reference_prompt_tags(text)
    if blocked_prompt_tags:
        reference_tags = [tag for tag in reference_tags if tag not in blocked_prompt_tags]
    try:
        plan = canvas_vlm_prompt_pipeline.plan_prompt_intent(text, "", resolution=resolution)
    except Exception:
        plan = {}
    scene_tags = [
        str(tag or "").strip()
        for tag in (plan.get("scene_tags") or [])
        if str(tag or "").strip()
    ] if isinstance(plan, dict) else []
    if blocked_prompt_tags:
        scene_tags = [tag for tag in scene_tags if tag not in blocked_prompt_tags]
    plan_branch = str(plan.get("scene_branch") or "") if isinstance(plan, dict) else ""
    if plan_branch.strip().lower() == "pool":
        pool_blocked = {"beach", "ocean", "sea", "sand", "wave", "waves", "horizon", "table", "desk"}
        scene_tags = [tag for tag in scene_tags if tag not in pool_blocked]
    try:
        adult_tags = [
            str(tag or "").strip()
            for tag in (canvas_vlm_prompt_pipeline.detect_adult_intent(text, "") or {}).get("tags") or []
            if str(tag or "").strip()
        ]
    except Exception:
        adult_tags = []
    if blocked_prompt_tags:
        adult_tags = [tag for tag in adult_tags if tag not in blocked_prompt_tags]
    if adult_tags:
        for tag in adult_tags:
            if tag not in scene_tags:
                scene_tags.append(tag)
        if isinstance(plan, dict):
            plan = dict(plan)
            plan["scene_branch"] = "adult"
        plan_branch = "adult"
    subject_count_tags = []
    try:
        count_character_tags = list(character_tags or [])
        for tag in direct_tags or []:
            clean = str(tag or "").strip()
            if (
                clean
                and clean not in count_character_tags
                and canvas_vlm_prompt_pipeline.CHARACTER_SUBJECT_COUNT_HINTS.get(clean)
            ):
                count_character_tags.append(clean)
        count_character_tags = _canvas_dedupe_character_count_tags(count_character_tags)
        if character_tags:
            subject_count_fn = (
                canvas_vlm_prompt_pipeline._adult_subject_count_tags
                if adult_tags
                else canvas_vlm_prompt_pipeline._subject_count_tags
            )
            subject_count_tags = subject_count_fn(
                text,
                "",
                count_character_tags,
                adult_tags if adult_tags else plan_branch,
            )
        else:
            subject_count_tags = canvas_vlm_prompt_pipeline._generic_subject_count_tags(text, "", direct_tags, adult_tags)
        if not subject_count_tags:
            subject_count_tags = _canvas_visual_subject_count_tags(text, direct_tags + scene_tags)
    except Exception:
        subject_count_tags = []
    counts = None
    try:
        counts = _canvas_subject_counts_from_count_tags(subject_count_tags)
    except Exception:
        counts = None
    count_prefix_tags = list(subject_count_tags or [])
    if (
        isinstance(counts, dict)
        and counts.get("total") == 1
        and counts.get("others", 0) == 0
        and (counts.get("girls", 0) + counts.get("boys", 0)) == 1
        and "no_humans" not in count_prefix_tags
        and "solo" not in count_prefix_tags
        and not canvas_vlm_prompt_pipeline._blue_archive_student_request_text(text, "")
    ):
                count_prefix_tags.append("solo")
    explicit_action_tags = []
    action_lock_pool = set(getattr(canvas_vlm_prompt_pipeline, "INTERACTION_LOCK_TAGS", set()) or set())
    action_lock_pool.update({
        "bathing", "showering", "sleeping", "lying", "kiss", "fighting", "battle",
        "jumping", "singing", "dancing", "reading", "eating", "drinking", "selfie",
        "holding_phone", "holding_camera", "holding_umbrella", "shared_umbrella",
    })
    for tag in scene_tags:
        clean = str(tag or "").strip()
        if clean and clean in action_lock_pool and clean not in explicit_action_tags:
            explicit_action_tags.append(clean)
    hard_prefix_tags = []
    hard_seen = set()
    for tag in count_prefix_tags + character_tags + copyright_tags + reference_tags + direct_tags + adult_tags + explicit_action_tags:
        clean = str(tag or "").strip()
        if clean and clean not in hard_seen:
            hard_seen.add(clean)
            hard_prefix_tags.append(clean)
    draft_prefix_tags = []
    prefix_seen = set()
    for tag in hard_prefix_tags + scene_tags[:12]:
        clean = str(tag or "").strip()
        if clean and clean not in prefix_seen:
            prefix_seen.add(clean)
            draft_prefix_tags.append(clean)
    required_prompt_tags = []
    seen = set()
    for tag in hard_prefix_tags:
        clean = str(tag or "").strip()
        if clean and clean not in seen:
            seen.add(clean)
            required_prompt_tags.append(clean)
    contract_soft_tags = []
    for tag in scene_tags[:16]:
        clean = str(tag or "").strip()
        if clean and clean not in seen and clean not in contract_soft_tags:
            contract_soft_tags.append(clean)
    if not required_prompt_tags and not character_tags and not scene_tags:
        return {}
    output = {
        "required_prompt_tags": required_prompt_tags,
        "contract_required_tags": required_prompt_tags[:28],
        "contract_soft_tags": contract_soft_tags,
        "draft_prompt_prefix": ", ".join(draft_prefix_tags[:18]),
        "character_tags": character_tags,
        "copyright_tags": copyright_tags,
        "scene_tags": scene_tags[:12],
        "scene_branch": plan_branch,
        "subject_count_tags": list(subject_count_tags or []),
        "subject_counts": counts,
        "draft_prompt_rule": (
            "Copy the exact required_prompt_tags that match the user request into draft_prompt. "
            "Do not replace canonical character tags with translated names, romanized guesses, aliases, or bare names."
        ),
    }
    if reference_tags:
        output["scene_strictness"] = "high"
    return {key: value for key, value in output.items() if value not in ({}, [], "", None)}


def _canvas_vlm_persona_prompt_locks(persona_text):
    text = str(persona_text or "").strip()
    if not text:
        return {}
    tags = []

    def add_tag(tag):
        clean = _canvas_vlm_persona_canonical_tag(tag)
        if clean and clean not in tags:
            tags.append(clean)

    for tag in _canvas_vlm_persona_compound_visual_tags(text):
        add_tag(tag)
    try:
        for tag in canvas_vlm_prompt_pipeline._generic_direct_hint_tags(text) or []:
            add_tag(tag)
    except Exception:
        pass
    try:
        for tag in canvas_vlm_prompt_pipeline._rule_tags(text, canvas_vlm_prompt_pipeline.GENERIC_PROMPT_RULES) or []:
            add_tag(tag)
    except Exception:
        pass
    for tag in _canvas_vlm_persona_database_tags(text):
        add_tag(tag)
    for tag in _canvas_vlm_persona_visual_database_tags(text):
        add_tag(tag)
    try:
        index = canvas_danbooru_service._canvas_load_danbooru_character_index()
        identity_tags = set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
    except Exception:
        identity_tags = set()
    if identity_tags:
        tags = [tag for tag in tags if tag not in identity_tags]
    tags = _canvas_vlm_persona_filter_visual_tag_conflicts(tags, text)
    if not tags:
        return {}
    count = "1boy" if re.search(r"\b(?:boy|male|man)\b|\u7537\u6027|\u7537\u4eba|\u7537\u5b69|\u7537\u751f", text, re.I) else "1girl"
    required = [count, "solo"]
    for tag in tags:
        if tag not in required:
            required.append(tag)
    counts = _canvas_subject_counts_from_count_tags(required)
    return {
        "required_prompt_tags": required[:24],
        "draft_prompt_prefix": ", ".join(required[:18]),
        "scene_tags": tags[:12],
        "subject_count_tags": [count],
        "subject_counts": counts,
        "scene_strictness": "high",
        "draft_prompt_rule": "Assistant-self image request. Preserve persona visual identity tags extracted from the user's system prompt by local Danbooru lookup and generic visual-slot parsing.",
    }


def _canvas_merge_prompt_locks(primary, secondary):
    left = dict(primary or {}) if isinstance(primary, dict) else {}
    right = secondary if isinstance(secondary, dict) else {}
    if not right:
        return left
    output = dict(left)
    right_counts = right.get("subject_counts") if isinstance(right.get("subject_counts"), dict) else {}
    right_has_visible_subject = int(float(right_counts.get("total") or 0)) > 0
    for key in (
        "required_prompt_tags", "contract_required_tags", "contract_scene_tags", "contract_soft_tags",
        "scene_tags", "subject_count_tags", "character_tags", "copyright_tags",
    ):
        values = []
        for source in (left.get(key), right.get(key)):
            for item in source or []:
                clean = str(item or "").strip()
                if right_has_visible_subject and clean.lower() == "no_humans":
                    continue
                if clean and clean not in values:
                    values.append(clean)
        if values:
            output[key] = values
    if right.get("subject_counts"):
        left_counts = left.get("subject_counts") if isinstance(left.get("subject_counts"), dict) else {}
        if not left_counts or int(float(left_counts.get("total") or 0)) <= 0 < int(float(right_counts.get("total") or 0)):
            output["subject_counts"] = right_counts
    if str(right.get("scene_strictness") or "").strip().lower() == "high" or str(left.get("scene_strictness") or "").strip().lower() == "high":
        output["scene_strictness"] = "high"
    if right.get("scene_branch") and not output.get("scene_branch"):
        output["scene_branch"] = right.get("scene_branch")
    prefix = []
    for tag in (output.get("required_prompt_tags") or []) + (output.get("scene_tags") or []):
        if tag and tag not in prefix:
            prefix.append(tag)
    if prefix:
        output["draft_prompt_prefix"] = ", ".join(prefix[:18])
    if right.get("draft_prompt_rule"):
        base_rule = str(left.get("draft_prompt_rule") or "").strip()
        output["draft_prompt_rule"] = (base_rule + " " if base_rule else "") + str(right.get("draft_prompt_rule")).strip()
    return {key: value for key, value in output.items() if value not in ({}, [], "", None)}


def _canvas_vlm_minimal_persona_image_system_prompt(base, targets, target_key, current_turn_locks, persona_image_subject):
    lock_keys = (
        "required_prompt_tags",
        "draft_prompt_prefix",
        "character_tags",
        "copyright_tags",
        "scene_tags",
        "scene_branch",
        "subject_count_tags",
        "subject_counts",
        "scene_strictness",
        "two_stage_understanding",
        "draft_prompt_rule",
        "source",
    )
    compact_locks = {
        key: current_turn_locks.get(key)
        for key in lock_keys
        if isinstance(current_turn_locks, dict) and current_turn_locks.get(key) not in ({}, [], "", None)
    }
    target_meta = {"target_key": target_key or "unknown"}
    if isinstance(targets, dict):
        text_to_image = targets.get("text_to_image")
        if isinstance(text_to_image, dict):
            for key in ("key", "name", "label", "type", "prompt_format", "model"):
                value = text_to_image.get(key)
                if value not in (None, ""):
                    target_meta[key] = value
    prefix = str(compact_locks.get("draft_prompt_prefix") or "").strip()
    required_tags = ", ".join((compact_locks.get("required_prompt_tags") or [])[:24])
    schema = (
        '{"action":"generate_image","prompt":"...",'
        '"draft_prompt":"...",'
        '"prompt_intent":{"locked_tags":[],"must_preserve":[],"enrichment_tags":[]},'
        '"subject_counts":{"girls":0,"boys":0,"others":0,"total":0},'
        '"summary":"...","confidence":0.95}'
    )
    parts = [
        "SimpAI compact image-intent mode.",
        "Return exactly one valid JSON object. No markdown. No visible chat. No explanation.",
        "Schema: " + schema,
        "Target metadata:\n" + _canvas_compact_agent_json(target_meta, 700),
    ]
    if compact_locks:
        parts.append("Local locks for the current user request:\n" + _canvas_compact_agent_json(compact_locks, 2200))
    parts.append(
        "Rules:\n"
        "1. prompt and draft_prompt are comma-separated English short tags/phrases only; draft_prompt must contain 24-36 comma-separated items.\n"
        "2. Extract in this order: subject_counts, locked identity tags, action/props, setting, composition/camera, atmosphere/light, expression, quality.\n"
        "3. If draft_prompt_prefix is present, draft_prompt must start with it exactly: "
        + (prefix or "(none)")
        + ".\n"
        "4. Copy these required tags exactly when present: "
        + (required_tags or "(none)")
        + ".\n"
        "5. prompt_intent.locked_tags repeats the critical count, identity, action, prop, and setting tags.\n"
        "6. Put optional visual richness in prompt_intent.enrichment_tags: camera, pose, expression, lighting, atmosphere, props, and reasonable short fuzzy phrases such as playing with children or warm afternoon light.\n"
        "7. Never translate, romanize, abbreviate, or replace locked tags.\n"
        "8. Do not invent long underscore sentence tags. Do not use ratio, pixel, seed, steps, cfg, artist, commentary, watermark, lowres, or filler background tags unless explicitly requested.\n"
        "9. Assistant persona is not a default image subject. Use persona visual identity only when the user explicitly asks to draw the assistant/selfie/avatar.\n"
        "10. Backend code will canonicalize fuzzy draft tags through the database, filter conflicts, and may discard unsafe candidates."
    )
    if persona_image_subject and base:
        parts.append(
            "Explicit assistant-self image request only. Persona source for visual identity, lower priority than JSON/schema/locks:\n"
            + base[:1200]
        )
    return "\n\n".join(part for part in parts if str(part or "").strip()).strip()


def _canvas_natural_action_protocol_language_rule(target_key):
    key = str(target_key or "").strip().lower()
    family = _canvas_vlm_prompt_rewrite_target_family(key)
    if family in {"flux", "natural_en"}:
        return "For FLUX/T5 targets, prompt and draft_prompt must be fluent English only; translate Chinese user intent into English."
    if "krea" in key:
        return "For Krea2 targets, use coherent natural-language prompts and preserve the user's language."
    if family == "wan":
        return "For Wan/video targets, use Chinese for Chinese requests and include visible motion, camera movement, continuity, and stable subject details."
    return "For Qwen/natural targets, preserve the user's language; Chinese requests should become coherent Chinese natural-language prompts."


def _canvas_natural_adult_intent_info(user_prompt="", source_prompt=""):
    try:
        adult_intent = canvas_vlm_prompt_pipeline.detect_adult_intent(user_prompt, source_prompt)
    except Exception:
        adult_intent = {}
    tags = [
        str(tag or "").strip()
        for tag in (adult_intent.get("tags") if isinstance(adult_intent, dict) else []) or []
        if str(tag or "").strip()
    ]
    is_adult = bool(isinstance(adult_intent, dict) and adult_intent.get("is_adult") and tags)
    if not is_adult:
        return {"is_adult": False, "tags": [], "level": 0, "allowlist_source": ""}
    try:
        level = int(canvas_vlm_prompt_pipeline._adult_intent_level(tags, user_prompt, source_prompt))
    except Exception:
        level = 3 if any(tag in {"sex", "penetration", "oral/fellatio", "fellatio", "anal", "handjob", "paizuri"} for tag in tags) else 1
    return {
        "is_adult": True,
        "tags": tags[:16],
        "level": max(1, min(3, level)),
        "allowlist_source": str(adult_intent.get("allowlist_source") or "")[:200] if isinstance(adult_intent, dict) else "",
    }


def _canvas_natural_adult_intent_protocol_line(adult_intent):
    if not (isinstance(adult_intent, dict) and adult_intent.get("is_adult")):
        return ""
    tags = ", ".join(str(tag or "").strip() for tag in (adult_intent.get("tags") or [])[:12] if str(tag or "").strip())
    level = adult_intent.get("level") or 1
    return (
        f"- Adult intent detected from the current user request: level={level}, tags={tags or 'adult'}. "
        "Treat this as explicit permission for the requested adult content in this request; do not sanitize it back to SFW, "
        "but do not add stronger acts, extra fetishes, new partners, or unrelated explicit details beyond the detected/requested intent.\n"
    )


def _canvas_vlm_compact_action_protocol_text(image_prompt_intent, danbooru_prompt_required, current_turn_locks, target_key=None, adult_intent=None, anima_prompt_required=False):
    if image_prompt_intent:
        lock_lines = []
        if isinstance(current_turn_locks, dict) and current_turn_locks:
            draft_prefix = str(current_turn_locks.get("draft_prompt_prefix") or "").strip()
            required_tags = ", ".join((current_turn_locks.get("required_prompt_tags") or [])[:24])
            subject_tags = ", ".join(current_turn_locks.get("subject_count_tags") or [])
            identity_tags = ", ".join(
                (current_turn_locks.get("character_tags") or [])
                + (current_turn_locks.get("copyright_tags") or [])
            )
            scene_tags = ", ".join((current_turn_locks.get("scene_tags") or [])[:12])
            understanding = str(current_turn_locks.get("two_stage_understanding") or "").strip()
            must_preserve = "; ".join(str(item or "").strip() for item in (current_turn_locks.get("must_preserve") or [])[:8] if str(item or "").strip())
            forbidden_tags = ", ".join((current_turn_locks.get("forbidden_tags") or [])[:12])
            if understanding:
                lock_lines.append(f"- First-stage understanding: {understanding[:300]}.")
            if draft_prefix:
                lock_lines.append(f"- draft_prompt starts with: {draft_prefix}.")
            if required_tags:
                lock_lines.append(f"- Copy required tags exactly: {required_tags}.")
            if subject_tags:
                lock_lines.append(f"- Subject count tags: {subject_tags}.")
            if identity_tags:
                lock_lines.append(f"- Canonical identity tags: {identity_tags}.")
            if scene_tags:
                lock_lines.append(f"- Action/setting tags: {scene_tags}.")
            if must_preserve:
                lock_lines.append(f"- Preserve semantic constraints: {must_preserve}.")
            if forbidden_tags:
                lock_lines.append(f"- Do not include forbidden tags: {forbidden_tags}.")
        tag_mode = (
            "prompt and draft_prompt must be comma-separated English Danbooru tags."
            if danbooru_prompt_required
            else "prompt follows the selected target format."
        )
        if anima_prompt_required:
            return (
                "Anima image action protocol:\n"
                "- Return JSON only, exactly one object, action=\"generate_image\".\n"
                "- Shape: {\"action\":\"generate_image\",\"prompt\":\"...\",\"draft_prompt\":\"...\","
                "\"negative_prompt\":\"...\",\"prompt_intent\":{\"locked_tags\":[],\"must_preserve\":[]},"
                "\"subject_counts\":{\"girls\":0,\"boys\":0,\"others\":0,\"total\":0},"
                "\"summary\":\"...\",\"confidence\":0.95}.\n"
                "- prompt is the final Anima positive prompt in English: compact Anima/Danbooru anchors first, then short English nltags control sentences when useful.\n"
                "- draft_prompt is an English Anima skeleton, not Chinese prose and not a generic Qwen paragraph.\n"
                "- Use this order: quality/period/rating, subject count, character, series, one confirmed @artist when available, appearance, hard visual tags, environment, nltags.\n"
                "- Use safe/sensitive/nsfw/explicit only to match user intent and local policy; do not escalate an ordinary SFW request.\n"
                "- Keep nltags to 2-4 short English layout/light/focus sentences; no literary backstory, no video-only motion commands.\n"
                "- Character lookup aliases are identity hints only, not appearance/outfit facts; keep uncertain character design details in nltags instead of blind appearance searches.\n"
                "- For multi-image requests, choose canvas/size per image from its composition; do not reuse one allowed resolution for all images by default.\n"
                "- Put width, height, aspect_ratio, image_number, seed, steps, cfg_scale, sampler, scheduler, and negative_prompt only in JSON fields when explicitly requested or preset-provided.\n"
                "- Do not invent artist, character, series, or long underscore pseudo-tags. Prefer local lookup facts and preserve prompt_intent locks.\n"
                "- Do not use persona appearance unless the user explicitly asks to draw the assistant/selfie/avatar.\n"
                + ("\n".join(lock_lines) if lock_lines else "")
            )
        natural_prompt_required = bool(not danbooru_prompt_required and _canvas_is_natural_prompt_target_key(target_key))
        if natural_prompt_required:
            return (
                "Natural-language image action protocol:\n"
                "- Return JSON only, exactly one object, action=\"generate_image\".\n"
                "- Shape: {\"action\":\"generate_image\",\"prompt\":\"...\",\"draft_prompt\":\"...\","
                "\"prompt_intent\":{\"locked_tags\":[],\"must_preserve\":[],\"enrichment_tags\":[]},"
                "\"subject_counts\":{\"girls\":0,\"boys\":0,\"others\":0,\"total\":0},"
                "\"summary\":\"...\",\"confidence\":0.95}.\n"
                "- prompt is the final natural-language generation prompt for the selected target, not a Danbooru tag list.\n"
                "- draft_prompt is a compact natural-language scene draft in the same target language, not comma-separated tags.\n"
                "- Do not output prompt_payload, visual_payload, safety_override, engine_config, metadata, system_instructions, policy notes, or unlock signals; flatten visual content into prompt.\n"
                f"- {_canvas_natural_action_protocol_language_rule(target_key)}\n"
                "- Preserve the user's named subjects, subject count, relationship, action, body state, setting, clothing, props, camera, mood, and explicit constraints.\n"
                "- For named characters or roles, keep the requested name or role and add visible anchors: hair, eyes, outfit colors, accessories, pose, expression, props, and scene context.\n"
                "- Build one coherent small scene with subject design, action, setting, composition/camera, lighting, atmosphere, materials, and story beat.\n"
                + _canvas_natural_adult_intent_protocol_line(adult_intent)
                + "- Put explicit user negative constraints only in negative_prompt; never write no/without/avoid/not/不要/别/没有 style negation inside prompt or draft_prompt.\n"
                "- Put aspect_ratio, image_number, size, seed, steps, cfg, sampler, and style switches only in JSON control fields when explicitly requested.\n"
                "- Never output markdown sections, numbered prompt instructions, command flags like --ar/--style, artist names, watermark text, or execution reports inside prompt fields.\n"
                "- prompt_intent.locked_tags can stay empty for natural targets; use must_preserve for short semantic constraints the backend should not lose.\n"
                "- Do not use persona appearance unless the user explicitly asks to draw the assistant/selfie/avatar.\n"
                + ("\n".join(lock_lines) if lock_lines else "")
            )
        return (
            "Compact image action protocol:\n"
            "- Return JSON only, exactly one object, action=\"generate_image\".\n"
            "- Shape: {\"action\":\"generate_image\",\"prompt\":\"...\",\"draft_prompt\":\"...\","
            "\"prompt_intent\":{\"locked_tags\":[],\"must_preserve\":[],\"enrichment_tags\":[]},"
            "\"subject_counts\":{\"girls\":0,\"boys\":0,\"others\":0,\"total\":0},"
            "\"summary\":\"...\",\"confidence\":0.95}.\n"
            f"- {tag_mode}\n"
            "- draft_prompt is the first-pass visual draft: 24-36 comma-separated English short tags/phrases.\n"
            "- Extract intent in order: visible subject counts, canonical identity, action/props, setting, composition/camera, atmosphere/light, expression, quality.\n"
            "- draft_prompt must preserve the user's requested subject, count, action, relationship, props, and scene, while adding reasonable visual associations.\n"
            "- prompt_intent.locked_tags repeats critical canonical tags; must_preserve holds short semantic constraints.\n"
            "- prompt_intent.enrichment_tags may suggest optional Danbooru atoms or short fuzzy phrases for camera, pose, expression, lighting, atmosphere, and props. The backend will database-canonicalize and filter them.\n"
            "- Put aspect_ratio, image_number, size, seed, steps, and cfg only in JSON control fields when explicitly requested.\n"
            "- Never put artist/commentary/watermark/lowres/meta garbage in prompt or draft_prompt.\n"
            "- Do not use persona appearance unless the user explicitly asks to draw the assistant/selfie/avatar.\n"
            "- Do not invent aliases, romanized replacements, long underscore sentence tags, placeholder tags, or generic profile fallbacks.\n"
            + ("\n".join(lock_lines) if lock_lines else "")
        )
    return (
        "Compact action protocol: include a JSON action only for explicit canvas/tool requests. "
        "Do not claim the action has already run. Use one of: "
        + ", ".join(sorted(VLM_AGENT_ACTIONS))
        + ". Keep normal chat concise and in the user's language."
    )


def _canvas_read_vlm_skill_docs(query="", max_chars=9000, required_docs=None, required_only=False, language=None):
    root = _canvas_vlm_skills_dir()
    if not os.path.isdir(root):
        return []
    requested_language = _canvas_normalize_skill_language(language)
    skill_index = _canvas_read_vlm_skill_index()
    area_by_doc = {}
    for area in skill_index.get("areas") or []:
        if isinstance(area, dict) and area.get("doc"):
            area_by_doc[str(area.get("doc")).replace("\\", "/")] = area
    query_terms = [item for item in re.split(r"\W+", str(query or "").lower()) if len(item) >= 3]
    required_list = []
    for item in required_docs or []:
        clean = str(item or "").replace("\\", "/").strip()
        if clean and clean not in required_list:
            required_list.append(clean)
    required_order = {item: index for index, item in enumerate(required_list)}
    required = set(required_order)
    rows = []
    for dirpath, _, filenames in os.walk(root):
        for filename in sorted(filenames):
            if not filename.lower().endswith(".md"):
                continue
            path = os.path.join(dirpath, filename)
            rel = os.path.relpath(path, root).replace("\\", "/")
            try:
                with open(path, "r", encoding="utf-8") as handle:
                    content = handle.read().strip()
            except Exception as exc:
                logger.warning("VLM skill doc skipped: %s", exc)
                continue
            if not content:
                continue
            if required_only and required and rel not in required:
                continue
            lowered = content.lower()
            area = area_by_doc.get(rel, {})
            area_language = _canvas_normalize_skill_language(area.get("language"))
            if requested_language and area_language and area_language != requested_language:
                continue
            area_text = json.dumps(area, ensure_ascii=False).lower() if area else ""
            score = sum(1 for term in query_terms if term in lowered or term in rel.lower() or term in area_text)
            title = filename[:-3]
            first_heading = next((line.strip("# ").strip() for line in content.splitlines() if line.startswith("#")), "")
            rows.append({
                "path": rel,
                "title": first_heading or title,
                "score": score,
                "ownership": area.get("ownership") or "manual_review",
                "manual_required": bool(area.get("manual_required", False)),
                "auto_generated": bool(area.get("auto_generated", False)),
                "edit_target": area.get("edit_target") or rel,
                "content": content,
                "required": rel in required,
            })
    rows.sort(key=lambda item: (not item["required"], required_order.get(item["path"], 9999), -item["score"], item["path"]))
    selected = []
    used = 0
    for item in rows:
        budget = max(600, max_chars - used)
        excerpt = item["content"][:budget]
        if len(item["content"]) > len(excerpt):
            excerpt = excerpt.rstrip() + "\n..."
        used += len(excerpt)
        selected.append({
            "path": item["path"],
            "title": item["title"],
            "ownership": item["ownership"],
            "manual_required": item["manual_required"],
            "auto_generated": item["auto_generated"],
            "edit_target": item["edit_target"],
            "content": excerpt,
        })
        if used >= max_chars:
            break
    return selected

def _canvas_compact_agent_json(data, max_chars=8000):
    try:
        text = json.dumps(data or {}, ensure_ascii=False, indent=2)
    except Exception:
        text = "{}"
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n... truncated"


def _canvas_first_json_object(text):
    source = str(text or "")
    if not source:
        return None
    decoder = json.JSONDecoder()
    for index, char in enumerate(source):
        if char != "{":
            continue
        try:
            parsed, _ = decoder.raw_decode(source[index:])
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _canvas_two_stage_intent_enabled(payload, params, prompt):
    data = params if isinstance(params, dict) else {}
    if _canvas_vlm_agent_mode(data) == "raw":
        return False
    if _canvas_bool(data.get("disable_two_stage_intent"), False):
        return False
    if not _canvas_bool(data.get("enable_two_stage_intent"), True):
        return False
    if not (_canvas_target_requires_danbooru(payload) or _canvas_target_requires_anima(payload)):
        return False
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    if not effective_prompt.strip():
        return False
    try:
        if _canvas_random_prompt_should_own_subject(effective_prompt):
            return False
    except Exception:
        pass
    return bool(_canvas_vlm_image_prompting_intent(effective_prompt) or _canvas_vlm_visual_scene_hint(effective_prompt))


def _canvas_two_stage_local_prompt_locks(payload, params, prompt):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    persona_image_subject = _canvas_vlm_persona_image_subject_for_request(
        payload if isinstance(payload, dict) else {},
        prompt,
        effective_prompt,
    )
    lock_source = _canvas_vlm_persona_lock_source(prompt, effective_prompt, persona_image_subject)
    locks = _canvas_vlm_current_turn_prompt_locks(
        lock_source,
        allow_pure_scenery=not persona_image_subject,
        allow_character_resolution=not persona_image_subject,
    )
    if persona_image_subject:
        persona_locks = _canvas_merge_prompt_locks(
            _canvas_vlm_persona_prompt_locks(_canvas_vlm_user_system_prompt(params or {})),
            _canvas_vlm_persona_prompt_locks(prompt),
        )
        locks = _canvas_merge_prompt_locks(persona_locks, locks)
    return locks


def _canvas_intent_array(value):
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return list(value)
    text = str(value or "").strip()
    if not text:
        return []
    if "," in text:
        return [item.strip() for item in text.split(",") if item.strip()]
    return [text]


def _canvas_intent_clean_tags(values, limit=32, blocked_counts=None):
    output = []
    blocked = {str(tag or "").strip().lower() for tag in (blocked_counts or []) if str(tag or "").strip()}
    for item in _canvas_intent_array(values):
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
        if not clean or clean in VLM_AGENT_INVALID_PROMPT_TAGS:
            continue
        if clean.lower() in blocked:
            continue
        if len(clean) > 80 or clean.count("_") > 6:
            continue
        if clean not in output:
            output.append(clean)
        if len(output) >= int(limit or 32):
            break
    return output


TWO_STAGE_INTENT_CONTRACT_SCHEMA = "simpai.image_intent_contract.v1"


def _canvas_intent_clean_phrases(values, limit=16, max_len=120):
    output = []
    for item in _canvas_intent_array(values):
        text = re.sub(r"\s+", " ", str(item or "")).strip()
        if not text:
            continue
        if len(text) > int(max_len or 120):
            text = text[: int(max_len or 120)].rstrip()
        if text and text not in output:
            output.append(text)
        if len(output) >= int(limit or 16):
            break
    return output


def _canvas_contract_tags_by_pool(tags, *pool_names):
    pools = []
    for name in pool_names:
        pool = getattr(canvas_vlm_prompt_pipeline, name, None)
        if pool:
            pools.append(set(pool))
    if not pools:
        return []
    output = []
    for tag in tags or []:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and any(clean in pool for pool in pools) and clean not in output:
            output.append(clean)
    return output


def _canvas_contract_confidence(parsed):
    value = parsed.get("confidence") if isinstance(parsed, dict) else 0.0
    if isinstance(value, dict):
        value = value.get("overall", value.get("intent", value.get("score", 0.0)))
    try:
        score = float(value)
    except Exception:
        score = 0.0
    if score > 1.0 and score <= 100.0:
        score = score / 100.0
    return max(0.0, min(1.0, score))


def _canvas_normalized_two_stage_contract(
    parsed,
    *,
    understanding,
    selected_counts,
    required_tags,
    scene_tags,
    must_preserve,
    forbidden_tags,
    local_locks,
):
    parsed = parsed if isinstance(parsed, dict) else {}
    local_locks = local_locks if isinstance(local_locks, dict) else {}
    locked_tags = []
    for tag in required_tags or []:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean not in locked_tags:
            locked_tags.append(clean)
    enrichment_tags = []
    for tag in scene_tags or []:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean not in locked_tags and clean not in enrichment_tags:
            enrichment_tags.append(clean)

    character_tags = []
    for source in (
        local_locks.get("character_tags") or [],
        parsed.get("characters") or [],
        parsed.get("character_tags") or [],
    ):
        for tag in _canvas_intent_clean_tags(source, limit=16):
            if tag and tag not in character_tags:
                character_tags.append(tag)
    copyright_tags = []
    for source in (
        local_locks.get("copyright_tags") or [],
        parsed.get("copyrights") or [],
        parsed.get("copyright_tags") or [],
    ):
        for tag in _canvas_intent_clean_tags(source, limit=16):
            if tag and tag not in copyright_tags:
                copyright_tags.append(tag)

    action_candidates = []
    for source in (
        parsed.get("actions"),
        parsed.get("action_tags"),
        enrichment_tags,
        locked_tags,
    ):
        action_candidates.extend(_canvas_intent_clean_tags(source, limit=32))
    setting_candidates = []
    for source in (
        parsed.get("setting"),
        parsed.get("settings"),
        parsed.get("setting_tags"),
        enrichment_tags,
    ):
        setting_candidates.extend(_canvas_intent_clean_tags(source, limit=32))
    style_candidates = []
    for source in (
        parsed.get("style"),
        parsed.get("styles"),
        parsed.get("style_tags"),
        parsed.get("lighting_tags"),
        parsed.get("atmosphere_tags"),
        parsed.get("camera_tags"),
        parsed.get("composition_tags"),
    ):
        style_candidates.extend(_canvas_intent_clean_tags(source, limit=32))

    subject_counts = selected_counts if isinstance(selected_counts, dict) else {}
    confidence = _canvas_contract_confidence(parsed)
    return {
        "schema": TWO_STAGE_INTENT_CONTRACT_SCHEMA,
        "understanding": str(understanding or "").strip()[:500],
        "subject_counts": subject_counts,
        "characters": character_tags[:16],
        "copyrights": copyright_tags[:16],
        "actions": _canvas_contract_tags_by_pool(action_candidates, "ACTION_TAG_POOL", "POSE_TAG_POOL")[:16],
        "setting": _canvas_contract_tags_by_pool(setting_candidates, "SETTING_TAG_POOL", "SCENE_TAG_POOL")[:16],
        "style": _canvas_contract_tags_by_pool(style_candidates, "ATMOSPHERE_TAG_POOL", "SOURCE_STYLE_CARRYOVER_TAGS")[:16],
        "negative_intent": _canvas_intent_clean_phrases(
            _canvas_intent_array(parsed.get("negative_intent"))
            + _canvas_intent_array(parsed.get("negative"))
            + _canvas_intent_array(parsed.get("forbidden_tags"))
            + _canvas_intent_array(parsed.get("negative_tags"))
            + list(forbidden_tags or []),
            limit=16,
        ),
        "plain_scene": bool(parsed.get("plain_scene") or ("no_humans" in set(locked_tags))),
        "locked_tags": locked_tags[:28],
        "enrichment_tags": enrichment_tags[:16],
        "must_preserve": list(must_preserve or [])[:12],
        "confidence": {"overall": confidence},
    }


def _canvas_validate_two_stage_intent_contract(contract):
    issues = []
    if not isinstance(contract, dict):
        return ["stage1 contract missing"]
    if contract.get("schema") != TWO_STAGE_INTENT_CONTRACT_SCHEMA:
        issues.append("stage1 contract schema mismatch")
    if not isinstance(contract.get("subject_counts"), dict):
        issues.append("stage1 contract subject_counts must be an object")
    for key in ("characters", "copyrights", "actions", "setting", "style", "negative_intent", "locked_tags", "enrichment_tags", "must_preserve"):
        if not isinstance(contract.get(key), list):
            issues.append(f"stage1 contract {key} must be a list")
    confidence = contract.get("confidence")
    if not isinstance(confidence, dict):
        issues.append("stage1 contract confidence must be an object")
    else:
        try:
            score = float(confidence.get("overall"))
        except Exception:
            score = -1.0
        if score < 0.0 or score > 1.0:
            issues.append("stage1 contract confidence.overall must be 0..1")
    return issues


def _canvas_first_stage_count_blocklist(selected_counts):
    normalized = _canvas_normalize_subject_counts(selected_counts)
    selected = set(_canvas_subject_count_tags_from_counts(normalized) or [])
    if normalized and int(normalized.get("total") or 0) <= 0:
        selected.add("no_humans")
    if (
        normalized
        and int(normalized.get("total") or 0) == 1
        and int(normalized.get("others") or 0) == 0
        and (int(normalized.get("girls") or 0) + int(normalized.get("boys") or 0)) == 1
    ):
        selected.add("solo")
    all_count_tags = {
        "solo", "no_humans", "multiple_others",
        "1girl", "2girls", "3girls", "4girls", "5girls", "6girls",
        "1boy", "2boys", "3boys", "4boys", "5boys", "6boys",
    }
    return all_count_tags - selected


def _canvas_two_stage_intent_locks(params):
    if not isinstance(params, dict):
        return {}
    locks = params.get("_two_stage_intent_locks")
    return locks if isinstance(locks, dict) else {}


def _canvas_merge_two_stage_locks(current_turn_locks, params):
    stage_locks = _canvas_two_stage_intent_locks(params)
    if not stage_locks:
        return current_turn_locks if isinstance(current_turn_locks, dict) else {}
    merged = _canvas_merge_prompt_locks(current_turn_locks, stage_locks)
    for key in ("two_stage_understanding", "must_preserve", "forbidden_tags", "prompt_intent", "source"):
        value = stage_locks.get(key)
        if value not in ({}, [], "", None):
            merged[key] = value
    return merged


def _canvas_build_two_stage_intent_prompt(payload, params, prompt):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload if isinstance(payload, dict) else {})
    local_locks = _canvas_two_stage_local_prompt_locks(payload, params, prompt)
    compact_prompt = _canvas_compact_agent_prompt_enabled(params)
    schema = {
        "schema": TWO_STAGE_INTENT_CONTRACT_SCHEMA,
        "understanding": "one short sentence in the user's language",
        "subject_counts": {"girls": 0, "boys": 0, "others": 0, "total": 0},
        "characters": [],
        "actions": [],
        "setting": [],
        "style": [],
        "negative_intent": [],
        "plain_scene": False,
        "locked_tags": [],
        "enrichment_tags": [],
        "must_preserve": [],
        "forbidden_tags": [],
        "confidence": {"overall": 0.95},
    }
    payload_text = {
        "target_key": target_key or "unknown",
        "user_request": effective_prompt[:1800],
        "local_hard_locks": local_locks,
        "output_schema": schema,
    }
    budget = 2200 if compact_prompt else 4200
    try:
        override_budget = int(params.get("two_stage_intent_prompt_budget") or 0)
    except Exception:
        override_budget = 0
    if override_budget > 0:
        budget = max(900, override_budget)
    if compact_prompt:
        return (
            "Stage1 intent JSON only. No final prompt, no markdown.\n"
            "Copy backend local_hard_locks; do not invent counts, characters, actions, props, or scene. "
            "Use output_schema keys exactly. locked_tags are only explicit/locked Danbooru atoms; must_preserve is short text. "
            "No-people requests: total=0 and include no_humans.\n\n"
            + _canvas_compact_agent_json(payload_text, budget)
        )
    return (
        "Stage 1 image intent extraction only.\n"
        "Do not write a final prompt. Do not write draft_prompt. Do not invent characters, counts, settings, props, or actions.\n"
        "Extract only facts directly stated or strongly implied by the user request. The local_hard_locks are backend facts and must not be contradicted.\n"
        "Return exactly one JSON object and no markdown.\n"
        "Use the output_schema keys exactly. characters/actions/setting/style/negative_intent are semantic slots; locked_tags/enrichment_tags are canonical Danbooru atoms.\n"
        "locked_tags should contain only critical count, identity, action, prop, and setting atoms that are explicit in the request or present in local_hard_locks; must_preserve can use short natural-language constraints.\n"
        "Do not add a setting because of a character identity. Character identity never implies grass, sky, city, shrine, office, or any other scene by itself.\n"
        "If the user requests no people, subject_counts.total must be 0 and locked_tags should include no_humans.\n"
        "If the local_hard_locks already contain subject_counts or character tags, repeat them instead of guessing alternates.\n\n"
        + _canvas_compact_agent_json(payload_text, budget)
    )


def _canvas_two_stage_understanding_source(effective_prompt, prompt=""):
    current = str(prompt or "").strip()
    effective = str(effective_prompt or "").strip()
    if current and current != effective:
        try:
            if _canvas_vlm_continuation_image_intent(current):
                return current
        except Exception:
            pass
    return effective


def _canvas_fallback_two_stage_understanding(effective_prompt, local_locks=None):
    source = re.sub(r"\s+", " ", str(effective_prompt or "")).strip()
    if len(source) > 120:
        source = source[:120].rstrip() + "..."
    if not source:
        source = "the current image request"
    is_zh = bool(re.search(r"[\u3400-\u9fff]", source))
    if is_zh:
        suffix = "" if re.search(r"[\u3002\uff01\uff1f.!?]\s*$", source) else "\u3002"
        return "\u597d\u7684\uff1a" + source + suffix
    suffix = "" if re.search(r"[.!?]\s*$", source) else "."
    return "Got it: " + source + suffix


def _canvas_normalize_two_stage_understanding_text(text, effective_prompt=""):
    value = re.sub(r"\s+", " ", str(text or "")).strip()
    if not value:
        return _canvas_fallback_two_stage_understanding(effective_prompt)
    is_zh = bool(re.search(r"[\u3400-\u9fff]", value + " " + str(effective_prompt or "")))
    if is_zh:
        for _ in range(4):
            next_value = re.sub(
                r"^\s*(?:\u6211\u7406\u89e3\u4e3a|\u7406\u89e3\u4e3a|\u597d\u7684|\u597d|\u660e\u767d|ok|okay|got\s+it)\s*[:\uff1a,，\-]*\s*",
                "",
                value,
                flags=re.I,
            ).strip()
            if next_value == value:
                break
            value = next_value
        if not value:
            return _canvas_fallback_two_stage_understanding(effective_prompt)
        suffix = "" if re.search(r"[\u3002\uff01\uff1f.!?]\s*$", value) else "\u3002"
        return "\u597d\u7684\uff1a" + value + suffix
    for _ in range(4):
        next_value = re.sub(
            r"^\s*(?:i\s+understand(?:\s+the\s+image\s+request\s+as)?|understood|got\s+it|okay|ok)\s*[:\-]*\s*",
            "",
            value,
            flags=re.I,
        ).strip()
        if next_value == value:
            break
        value = next_value
    if not value:
        return _canvas_fallback_two_stage_understanding(effective_prompt)
    suffix = "" if re.search(r"[.!?]\s*$", value) else "."
    return "Got it: " + value + suffix


def _canvas_rewrite_visible_understanding_prefix(text):
    value = str(text or "").strip()
    if not value:
        return value
    if re.match(
        r"^\s*(?:\u6211\u7406\u89e3\u4e3a|\u7406\u89e3\u4e3a|\u597d\u7684|\u597d|i\s+understand|understood|got\s+it|okay|ok)\s*[:\uff1a,\-]",
        value,
        re.I,
    ):
        return _canvas_normalize_two_stage_understanding_text(value, value)
    return value


def _canvas_parse_two_stage_intent_response(text, payload, params, prompt):
    try:
        return _canvas_parse_two_stage_intent_response_inner(text, payload, params, prompt)
    except Exception as exc:
        effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
        try:
            local_locks = _canvas_two_stage_local_prompt_locks(payload, params, prompt)
        except Exception:
            local_locks = {}
        understanding = _canvas_fallback_two_stage_understanding(
            _canvas_two_stage_understanding_source(effective_prompt, prompt),
            local_locks if isinstance(local_locks, dict) else {},
        )
        issue = f"intent parse failed: {str(exc)[:160]}"
        logger.warning("Canvas VLM Stage1 intent parser fell back after malformed response: %s", exc)
        return {
            "valid": False,
            "issues": [issue],
            "understanding": understanding[:500],
            "contract": {},
            "contract_issues": ["stage1 contract missing"],
            "locks": {},
            "raw_text": str(text or "").strip()[:1600],
            "confidence": 0.0,
            "user_prompt": effective_prompt[:1200],
        }


def _canvas_parse_two_stage_intent_response_inner(text, payload, params, prompt):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    local_locks = _canvas_two_stage_local_prompt_locks(payload, params, prompt)
    parsed = _canvas_first_json_object(text)
    if isinstance(parsed, dict):
        for key in ("intent", "intent_locks", "image_intent", "prompt_intent"):
            if isinstance(parsed.get(key), dict):
                parsed = parsed.get(key)
                break
    issues = []
    if not isinstance(parsed, dict):
        parsed = {}
        issues.append("intent JSON missing")
    understanding = str(parsed.get("understanding") or parsed.get("summary") or "").strip()
    if not understanding:
        understanding = _canvas_fallback_two_stage_understanding(
            _canvas_two_stage_understanding_source(effective_prompt, prompt),
            local_locks,
        )
    else:
        understanding = _canvas_normalize_two_stage_understanding_text(understanding, effective_prompt)
    local_counts = _canvas_normalize_subject_counts(local_locks.get("subject_counts") if isinstance(local_locks, dict) else None)
    llm_counts = _canvas_normalize_subject_counts(parsed.get("subject_counts") or parsed.get("subjects"))
    selected_counts = local_counts if local_counts is not None else llm_counts
    if selected_counts is None:
        selected_counts = _canvas_subject_counts_from_count_tags(local_locks.get("subject_count_tags") or [])
    count_tags = _canvas_subject_count_tags_from_counts(selected_counts)
    if selected_counts and int(selected_counts.get("total") or 0) <= 0:
        count_tags = ["no_humans"]
    blocked_count_tags = _canvas_first_stage_count_blocklist(selected_counts)
    intent_payload = {}
    if isinstance(parsed.get("prompt_intent"), dict):
        intent_payload.update(parsed.get("prompt_intent") or {})
    for key in (
        "locked_tags", "must_preserve", "enrichment_tags", "suggested_tags", "candidate_tags",
        "style_tags", "composition_tags", "pose_tags", "expression_tags", "lighting_tags",
        "atmosphere_tags", "camera_tags", "setting_tags", "prop_tags", "action_tags",
    ):
        if key in parsed and key not in intent_payload:
            intent_payload[key] = _canvas_intent_array(parsed.get(key))
    normalized_intent = canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent(intent_payload)
    llm_locked = _canvas_intent_clean_tags(normalized_intent.get("locked_tags") or [], limit=18, blocked_counts=blocked_count_tags)
    llm_scene = _canvas_intent_clean_tags(
        _canvas_intent_array(normalized_intent.get("enrichment_tags"))
        + _canvas_intent_array(parsed.get("action_tags"))
        + _canvas_intent_array(parsed.get("setting_tags")),
        limit=16,
        blocked_counts=blocked_count_tags,
    )
    persona_stage_subject = _canvas_vlm_persona_image_subject_for_request(
        payload if isinstance(payload, dict) else {},
        prompt,
        effective_prompt,
    )
    local_contract_required = (
        local_locks.get("contract_required_tags")
        if isinstance(local_locks, dict) and local_locks.get("contract_required_tags")
        else local_locks.get("required_prompt_tags") if isinstance(local_locks, dict) else []
    )
    local_contract_required_set = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in (local_contract_required or [])
        if canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
    }
    local_contract_soft = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in ((local_locks.get("contract_soft_tags") if isinstance(local_locks, dict) else []) or [])
        if canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
    }
    if persona_stage_subject and (llm_locked or llm_scene):
        try:
            identity_index = canvas_danbooru_service._canvas_load_danbooru_character_index()
            known_identity_pool = set(identity_index.get("character_tags") or set()).union(set(identity_index.get("copyright_tags") or set()))
        except Exception:
            known_identity_pool = set()
        user_system_identity_tags = set(
            canvas_danbooru_service._canvas_known_identity_prompt_tags(_canvas_vlm_user_system_prompt(params if isinstance(params, dict) else {}))
        )
        prompt_identity_tags = set(canvas_danbooru_service._canvas_known_identity_prompt_tags(effective_prompt))
        allowed_identity_tags = set(local_contract_required_set) | user_system_identity_tags | prompt_identity_tags

        def keep_persona_stage_tag(tag):
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            return bool(clean and (clean not in known_identity_pool or clean in allowed_identity_tags))

        llm_locked = [tag for tag in llm_locked if keep_persona_stage_tag(tag)]
        llm_scene = [tag for tag in llm_scene if keep_persona_stage_tag(tag)]
    if local_contract_soft:
        llm_locked = [
            tag for tag in llm_locked
            if tag not in local_contract_soft or tag in local_contract_required_set
        ]
        llm_contract_scene = [
            tag for tag in llm_scene
            if tag not in local_contract_soft or tag in local_contract_required_set
        ]
    else:
        llm_contract_scene = list(llm_scene)
    required = []
    for source in (count_tags, local_contract_required, llm_locked):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if not clean or clean in blocked_count_tags:
                continue
            if clean not in required:
                required.append(clean)
    scene_tags = []
    for source in (local_locks.get("scene_tags") if isinstance(local_locks, dict) else [], llm_scene):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if not clean or clean in blocked_count_tags:
                continue
            if clean not in scene_tags:
                scene_tags.append(clean)
    contract_scene_tags = []
    for source in (local_locks.get("contract_scene_tags") if isinstance(local_locks, dict) else [], llm_contract_scene):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if not clean or clean in blocked_count_tags:
                continue
            if clean not in contract_scene_tags:
                contract_scene_tags.append(clean)
    if scene_tags:
        enrichment = list(normalized_intent.get("enrichment_tags") or [])
        for tag in scene_tags:
            if tag not in required and tag not in enrichment:
                enrichment.append(tag)
        if enrichment:
            normalized_intent["enrichment_tags"] = enrichment[:16]
        normalized_intent["draft_first"] = True
    subject_count_tags = list(count_tags or [])
    if local_locks.get("subject_count_tags") and local_counts is not None:
        subject_count_tags = [
            tag for tag in local_locks.get("subject_count_tags") or []
            if canvas_danbooru_service._canvas_clean_prompt_tag_name(tag) not in blocked_count_tags
        ]
        if selected_counts and int(selected_counts.get("total") or 0) <= 0:
            subject_count_tags = ["no_humans"]
    draft_prefix = []
    for tag in required + scene_tags:
        if tag and tag not in draft_prefix:
            draft_prefix.append(tag)
    must_preserve = [
        str(item or "").strip()[:120]
        for item in (
            _canvas_intent_array(normalized_intent.get("must_preserve"))
            or _canvas_intent_array(parsed.get("must_preserve"))
        )
        if str(item or "").strip()
    ][:12]
    forbidden = _canvas_intent_clean_tags(parsed.get("forbidden_tags") or parsed.get("negative_tags") or [], limit=16)
    contract = _canvas_normalized_two_stage_contract(
        parsed,
        understanding=understanding,
        selected_counts=selected_counts,
        required_tags=required,
        scene_tags=contract_scene_tags,
        must_preserve=must_preserve,
        forbidden_tags=forbidden,
        local_locks=local_locks,
    )
    if local_contract_soft:
        keep_required = set(required)
        for key in ("locked_tags", "enrichment_tags", "actions", "setting", "style"):
            values = contract.get(key)
            if not isinstance(values, list):
                continue
            contract[key] = [
                tag for tag in values
                if canvas_danbooru_service._canvas_clean_prompt_tag_name(tag) not in local_contract_soft
                or canvas_danbooru_service._canvas_clean_prompt_tag_name(tag) in keep_required
            ]
    contract_issues = _canvas_validate_two_stage_intent_contract(contract)
    if contract_issues:
        issues.extend(contract_issues)
    locks = {
        "required_prompt_tags": required[:28],
        "draft_prompt_prefix": ", ".join(draft_prefix[:18]),
        "character_tags": local_locks.get("character_tags") if isinstance(local_locks, dict) else [],
        "copyright_tags": local_locks.get("copyright_tags") if isinstance(local_locks, dict) else [],
        "scene_tags": scene_tags[:16],
        "scene_branch": local_locks.get("scene_branch") if isinstance(local_locks, dict) else "",
        "subject_count_tags": subject_count_tags,
        "subject_counts": selected_counts,
        "scene_strictness": "high" if required or subject_count_tags else "",
        "must_preserve": must_preserve,
        "forbidden_tags": forbidden,
        "prompt_intent": normalized_intent,
        "intent_contract": contract,
        "two_stage_understanding": understanding[:500],
        "source": "two_stage_intent_extract",
        "draft_prompt_rule": (
            "Two-stage intent locks. The second-stage prompt must preserve these subject counts, identities, action/props, setting, and exclusions."
        ),
    }
    locks = {key: value for key, value in locks.items() if value not in ({}, [], "", None)}
    confidence = float((contract.get("confidence") or {}).get("overall") or 0.0)
    return {
        "valid": bool((locks.get("required_prompt_tags") or locks.get("subject_counts") or not issues) and not contract_issues),
        "issues": issues[:8],
        "understanding": understanding[:500],
        "contract": contract,
        "contract_issues": contract_issues[:8],
        "locks": locks,
        "raw_text": str(text or "").strip()[:1600],
        "confidence": max(0.0, min(1.0, confidence)),
        "user_prompt": effective_prompt[:1200],
    }


def _canvas_local_two_stage_intent_response(payload, params, prompt):
    data = params if isinstance(params, dict) else {}
    if _canvas_bool(data.get("disable_local_two_stage_intent"), False):
        return None
    if not _canvas_bool(data.get("prefer_local_two_stage_intent"), True):
        return None
    is_anima_target = _canvas_target_requires_anima(payload)
    if not (_canvas_target_requires_danbooru(payload) or is_anima_target):
        return None
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    if not effective_prompt.strip():
        return None
    try:
        if _canvas_random_prompt_should_own_subject(effective_prompt):
            return None
    except Exception:
        pass
    if not (_canvas_vlm_image_prompting_intent(effective_prompt) or _canvas_vlm_visual_scene_hint(effective_prompt)):
        return None
    local_locks = _canvas_two_stage_local_prompt_locks(payload, params, prompt)
    local_locks = local_locks if isinstance(local_locks, dict) else {}

    required = [
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in (local_locks.get("required_prompt_tags") or [])
    ]
    required = [tag for tag in required if tag]
    scene_tags = [
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in (local_locks.get("scene_tags") or [])
    ]
    scene_tags = [tag for tag in scene_tags if tag]
    subject_counts = _canvas_normalize_subject_counts(local_locks.get("subject_counts"))
    subject_count_tags = list(local_locks.get("subject_count_tags") or [])
    character_tags = list(local_locks.get("character_tags") or [])
    copyright_tags = list(local_locks.get("copyright_tags") or [])
    if is_anima_target:
        anima_signals = _canvas_anima_prompt_signal_tags(effective_prompt, local_locks)
        for tag in (anima_signals.get("locked_tags") or []):
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean not in required:
                required.append(clean)
        for tag in (anima_signals.get("scene_tags") or []):
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean not in scene_tags:
                scene_tags.append(clean)
        for tag in (anima_signals.get("artist_tags") or []):
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean not in local_locks.get("artist_tags", []):
                local_locks.setdefault("artist_tags", []).append(clean)

    has_identity_or_count = bool(character_tags or copyright_tags or subject_count_tags or subject_counts)
    has_enough_local_signal = bool(
        len(required) >= 2
        or (required and (has_identity_or_count or scene_tags))
        or (subject_counts and scene_tags)
        or ("no_humans" in set(required + subject_count_tags) and scene_tags)
    )
    confidence = 0.98 if has_enough_local_signal else 0.72
    source = "local_two_stage_prompt_locks" if has_enough_local_signal else "local_one_llm_stage1_fallback"

    understanding = _canvas_fallback_two_stage_understanding(
        _canvas_two_stage_understanding_source(effective_prompt, prompt),
        local_locks,
    )
    must_preserve = [
        str(item or "").strip()[:120]
        for item in (local_locks.get("must_preserve") or [])
        if str(item or "").strip()
    ][:12]
    forbidden = _canvas_intent_clean_tags(local_locks.get("forbidden_tags") or [], limit=16)
    prompt_intent = canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent({
        "locked_tags": required[:28],
        "enrichment_tags": scene_tags[:16],
        "must_preserve": must_preserve,
    })
    if subject_counts is not None:
        prompt_intent["subject_counts"] = subject_counts
    contract = _canvas_normalized_two_stage_contract(
        {},
        understanding=understanding,
        selected_counts=subject_counts,
        required_tags=required,
        scene_tags=scene_tags,
        must_preserve=must_preserve,
        forbidden_tags=forbidden,
        local_locks=local_locks,
    )
    contract["confidence"] = {"overall": confidence}
    locks = dict(local_locks)
    if required:
        locks["required_prompt_tags"] = required[:28]
        locks["draft_prompt_prefix"] = ", ".join(required[:18])
    if scene_tags:
        locks["scene_tags"] = scene_tags[:16]
    if subject_counts is not None:
        locks["subject_counts"] = subject_counts
    locks["prompt_intent"] = prompt_intent
    locks["two_stage_understanding"] = understanding[:500]
    locks["source"] = source
    locks["local_signal_level"] = "strong" if has_enough_local_signal else "fallback"
    locks["draft_prompt_rule"] = (
        "Local deterministic Stage1 replacement. Preserve provided subject counts, "
        "identities, action/setting tags, and exclusions when present; otherwise infer the action from the user request."
    )
    return {
        "valid": True,
        "issues": [],
        "understanding": understanding[:500],
        "contract": contract,
        "contract_issues": [],
        "locks": {key: value for key, value in locks.items() if value not in ({}, [], "", None)},
        "raw_text": "",
        "confidence": confidence,
        "user_prompt": effective_prompt[:1200],
        "local_fast_path": True,
        "local_signal_level": "strong" if has_enough_local_signal else "fallback",
    }


def _canvas_first_image_generation_action(actions):
    for action in actions or []:
        if not isinstance(action, dict):
            continue
        name = _canvas_normalize_vlm_action_name(action.get("action") or action.get("type") or "")
        if name in {"generate_image", "text_to_image"}:
            return action
    return None


def _canvas_action_prompt_tags(action, limit=64):
    prompt_text = _canvas_action_prompt_text(action)
    tags = []
    for raw in str(prompt_text or "").split(","):
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        if not clean or clean in VLM_AGENT_INVALID_PROMPT_TAGS:
            continue
        if clean not in tags:
            tags.append(clean)
        if len(tags) >= int(limit or 64):
            break
    return tags


def _canvas_split_known_identity_tags(tags):
    try:
        index = canvas_danbooru_service._canvas_load_danbooru_character_index()
    except Exception:
        index = {}
    character_pool = set(index.get("character_tags") or set()) if isinstance(index, dict) else set()
    copyright_pool = set(index.get("copyright_tags") or set()) if isinstance(index, dict) else set()
    characters = []
    copyrights = []
    for tag in tags or []:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if not clean:
            continue
        if clean in character_pool and clean not in characters:
            characters.append(clean)
        elif clean in copyright_pool and clean not in copyrights:
            copyrights.append(clean)
    return characters[:16], copyrights[:16]


def _canvas_backfill_two_stage_intent_response(payload, params, prompt, actions):
    data = params if isinstance(params, dict) else {}
    if _canvas_bool(data.get("disable_two_stage_contract_backfill"), False):
        return None
    if not _canvas_two_stage_intent_enabled(payload, data, prompt):
        return None
    action = _canvas_first_image_generation_action(actions)
    if not isinstance(action, dict):
        return None
    prompt_tags = _canvas_action_prompt_tags(action)
    if not prompt_tags:
        return None
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    local_locks = _canvas_two_stage_local_prompt_locks(payload, data, prompt)
    local_locks = local_locks if isinstance(local_locks, dict) else {}
    local_required = (
        local_locks.get("contract_required_tags")
        or local_locks.get("required_prompt_tags")
        or []
    )
    prompt_intent = _canvas_action_prompt_intent(action)
    intent_locked = list(prompt_intent.get("locked_tags") or [])
    subject_counts = (
        _canvas_normalize_subject_counts(action.get("subject_counts"))
        or _canvas_normalize_subject_counts(local_locks.get("subject_counts"))
        or _canvas_subject_counts_from_prompt(", ".join(prompt_tags))
    )
    count_tags = _canvas_subject_count_tags_from_counts(subject_counts)
    prompt_tag_set = set(prompt_tags)
    if subject_counts and int(subject_counts.get("total") or 0) <= 1 and "solo" in prompt_tag_set:
        count_tags = list(count_tags or []) + ["solo"]
    known_identity_tags = canvas_danbooru_service._canvas_known_identity_prompt_tags(", ".join(prompt_tags))
    action_characters, action_copyrights = _canvas_split_known_identity_tags(known_identity_tags)
    characters = []
    copyrights = []
    for tag in list(local_locks.get("character_tags") or []) + action_characters:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean in prompt_tag_set and clean not in characters:
            characters.append(clean)
    for tag in list(local_locks.get("copyright_tags") or []) + action_copyrights:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean in prompt_tag_set and clean not in copyrights:
            copyrights.append(clean)

    required = []
    for source in (count_tags, local_required, intent_locked, characters, copyrights):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean in prompt_tag_set and clean not in required:
                required.append(clean)
    if not required and not subject_counts:
        return None
    protected = set(required) | set(canvas_vlm_prompt_pipeline.SUBJECT_COUNT_TAGS) | {"solo", "multiple_others", "no_humans"}
    scene_tags = []
    for source in (
        prompt_intent.get("enrichment_tags") or [],
        prompt_tags,
    ):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if not clean or clean in protected or clean not in prompt_tag_set:
                continue
            if clean not in scene_tags:
                scene_tags.append(clean)
            if len(scene_tags) >= 16:
                break
        if len(scene_tags) >= 16:
            break

    understanding = _canvas_fallback_two_stage_understanding(
        _canvas_two_stage_understanding_source(effective_prompt, prompt),
        local_locks,
    )
    must_preserve = [
        str(item or "").strip()[:120]
        for item in (
            _canvas_intent_array(prompt_intent.get("must_preserve"))
            or _canvas_intent_array(action.get("must_preserve"))
            or []
        )
        if str(item or "").strip()
    ][:12]
    forbidden = _canvas_intent_clean_tags(
        local_locks.get("forbidden_tags") or action.get("forbidden_tags") or [],
        limit=16,
    )
    parsed = {
        "characters": characters,
        "copyrights": copyrights,
        "action_tags": scene_tags,
        "setting_tags": scene_tags,
        "confidence": 0.62,
    }
    contract = _canvas_normalized_two_stage_contract(
        parsed,
        understanding=understanding,
        selected_counts=subject_counts,
        required_tags=required,
        scene_tags=scene_tags,
        must_preserve=must_preserve,
        forbidden_tags=forbidden,
        local_locks={
            **local_locks,
            "character_tags": characters or local_locks.get("character_tags") or [],
            "copyright_tags": copyrights or local_locks.get("copyright_tags") or [],
        },
    )
    contract["confidence"] = {"overall": 0.62}
    contract_issues = _canvas_validate_two_stage_intent_contract(contract)
    if contract_issues:
        return {
            "valid": False,
            "issues": contract_issues[:8],
            "understanding": understanding[:500],
            "contract": contract,
            "contract_issues": contract_issues[:8],
            "locks": {},
            "raw_text": "",
            "confidence": 0.0,
            "user_prompt": effective_prompt[:1200],
        }
    subject_count_tags = list(count_tags or [])
    draft_prefix = []
    for tag in required + scene_tags:
        if tag and tag not in draft_prefix:
            draft_prefix.append(tag)
    locks = _canvas_merge_prompt_locks(local_locks, {
        "required_prompt_tags": required[:28],
        "contract_required_tags": required[:28],
        "draft_prompt_prefix": ", ".join(draft_prefix[:18]),
        "character_tags": characters,
        "copyright_tags": copyrights,
        "scene_tags": scene_tags[:16],
        "contract_scene_tags": scene_tags[:16],
        "subject_count_tags": subject_count_tags,
        "subject_counts": subject_counts,
    })
    normalized_prompt_intent = canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent({
        **(prompt_intent if isinstance(prompt_intent, dict) else {}),
        "locked_tags": required[:28],
        "enrichment_tags": scene_tags[:16],
        "must_preserve": must_preserve,
        "draft_first": True,
        "scene_strictness": "draft",
    })
    locks["prompt_intent"] = normalized_prompt_intent
    locks["intent_contract"] = contract
    locks["two_stage_understanding"] = understanding[:500]
    locks["source"] = "two_stage_contract_backfill_from_repaired_action"
    locks["draft_prompt_rule"] = (
        "Backfilled two-stage contract from the repaired image action. Preserve these already-canonical count and identity locks."
    )
    return {
        "valid": True,
        "issues": [],
        "understanding": understanding[:500],
        "contract": contract,
        "contract_issues": [],
        "locks": {key: value for key, value in locks.items() if value not in ({}, [], "", None)},
        "raw_text": "",
        "confidence": 0.62,
        "user_prompt": effective_prompt[:1200],
        "backfilled": True,
    }


def _canvas_vlm_int(value, default, min_value=None, max_value=None):
    try:
        number = int(round(float(value)))
    except Exception:
        number = int(default)
    if min_value is not None:
        number = max(int(min_value), number)
    if max_value is not None:
        number = min(int(max_value), number)
    return number

def _canvas_vlm_text_budget(params, version_name=None):
    version_cfg = VLM.get_version_config(str(version_name or params.get("version") or "")) or {}
    n_ctx = int(version_cfg.get("n_ctx", 8192) or 8192)
    default_chars = 6000 if n_ctx <= 8192 else min(18000, max(8000, int(n_ctx * 0.55)))
    max_chars = 6000 if n_ctx <= 8192 else min(18000, max(8000, int(n_ctx * 0.55)))
    return _canvas_vlm_int(params.get("context_chars") or params.get("rolling_context_chars"), default_chars, 1200, max_chars)

def _canvas_vlm_message_text(message):
    if not isinstance(message, dict):
        return ""
    content = message.get("content")
    if isinstance(content, list):
        bits = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                bits.append(str(item.get("text") or ""))
            elif isinstance(item, str):
                bits.append(item)
        return "\n".join(bits).strip()
    return str(content or "").strip()


def _canvas_vlm_message_action_prompts(message):
    if not isinstance(message, dict):
        return []
    actions = message.get("actions") if isinstance(message.get("actions"), list) else []
    content = _canvas_vlm_message_text(message)
    if content:
        extractor = globals().get("_canvas_extract_vlm_agent_actions")
        if callable(extractor):
            try:
                actions = list(actions) + list(extractor(content) or [])
            except Exception:
                pass
        else:
            stripped = content.strip()
            if stripped.startswith("{") and stripped.endswith("}"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, dict):
                        actions = list(actions) + [parsed]
                except Exception:
                    pass
    output = []
    seen_prompts = set()
    for action in actions:
        if not isinstance(action, dict):
            continue
        name = _canvas_normalize_vlm_action_name(action.get("action") or action.get("type") or "")
        if name not in {"generate_image", "text_to_image"}:
            continue
        prompt = ""
        for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt"):
            value = str(action.get(key) or "").strip()
            if value:
                prompt = value
                break
        if not prompt:
            continue
        trusted = str(action.get("_backend_repaired") or action.get("_canonical_locked") or "").strip().lower() == "true"
        if prompt in seen_prompts:
            continue
        seen_prompts.add(prompt)
        persona_self = str(action.get("_persona_self_image") or action.get("persona_self_image") or "").strip().lower() in {"1", "true", "yes", "on"}
        output.append({"prompt": prompt, "trusted": trusted, "persona_self": persona_self})
    return output


def _canvas_mark_persona_self_actions(actions, persona_self_image):
    if not persona_self_image:
        return actions
    changed = False
    output = []
    for action in actions or []:
        if not isinstance(action, dict):
            output.append(action)
            continue
        item = dict(action)
        name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if name in {"generate_image", "text_to_image"}:
            if str(item.get("_persona_self_image") or "").strip().lower() != "true":
                item["_persona_self_image"] = "true"
                changed = True
            if item.get("persona_self_image") is not True:
                item["persona_self_image"] = True
                changed = True
        output.append(item)
    return output if changed else actions


def _canvas_vlm_continuation_references_persona(payload, prompt):
    if not _canvas_vlm_continuation_image_intent(prompt):
        return False
    source = []
    if isinstance(payload, dict):
        rolling_source = payload.get("chat_messages") if isinstance(payload.get("chat_messages"), list) else []
        full_source = payload.get("chat_messages_full") if isinstance(payload.get("chat_messages_full"), list) else []
        source = (rolling_source[-12:] if rolling_source else []) + (full_source[-40:] if full_source else [])
    if not source:
        return False
    seen = set()
    awaiting_user_for_image = False
    for item in reversed(source):
        if not isinstance(item, dict) or item.get("pending"):
            continue
        key = id(item)
        if key in seen:
            continue
        seen.add(key)
        role = str(item.get("role") or "").strip().lower()
        if role == "assistant":
            action_prompts = _canvas_vlm_message_action_prompts(item)
            if any(action.get("persona_self") for action in action_prompts):
                return True
            if action_prompts:
                awaiting_user_for_image = True
            continue
        if role == "user":
            content = _canvas_vlm_message_text(item)
            if content and content.strip() != str(prompt or "").strip() and awaiting_user_for_image:
                if _canvas_vlm_persona_image_subject_intent(content):
                    return True
                awaiting_user_for_image = False
    return False


def _canvas_vlm_persona_image_subject_for_request(payload, prompt, effective_prompt=None):
    if _canvas_vlm_persona_image_subject_intent(effective_prompt if effective_prompt is not None else prompt):
        return True
    return _canvas_vlm_continuation_references_persona(payload if isinstance(payload, dict) else {}, prompt)


def _canvas_vlm_persona_lock_source(prompt, effective_prompt, persona_self_image):
    if persona_self_image and _canvas_vlm_continuation_image_intent(prompt):
        return str(prompt or "")
    return str(effective_prompt if effective_prompt is not None else prompt or "")

def _canvas_vlm_rolling_history(payload, params, version_name=None):
    source = payload.get("chat_messages") if isinstance(payload.get("chat_messages"), list) else []
    client_context = payload.get("context") if isinstance(payload.get("context"), dict) else {}
    client_omitted = _canvas_vlm_int(client_context.get("omitted"), 0, 0, 1000000)
    if not source or not _canvas_bool(params.get("save_context"), True):
        return [], {"omitted": len(source) + client_omitted, "chars": 0, "max_history": 0, "budget": 0}
    max_history = _canvas_vlm_int(params.get("max_history"), 12, 1, 80)
    budget = _canvas_vlm_text_budget(params, version_name)
    selected = []
    used = 0
    omitted = client_omitted
    for item in reversed(source):
        if not isinstance(item, dict) or item.get("pending"):
            omitted += 1
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in ("user", "assistant", "system"):
            role = "user"
        content = _canvas_vlm_message_text(item)
        if not content:
            omitted += 1
            continue
        max_one = max(500, min(1800, budget // 3))
        if len(content) > max_one:
            content = content[-max_one:].lstrip()
        label_cost = len(role) + len(content) + 16
        if len(selected) >= max_history or (selected and used + label_cost > budget):
            omitted += 1
            continue
        selected.append({"role": role, "content": content})
        used += label_cost
    selected.reverse()
    return selected, {
        "omitted": omitted,
        "chars": used,
        "max_history": max_history,
        "budget": budget,
}

VLM_AGENT_NEGATIVE_PROMPT_KEYS = (
    "negative_prompt",
    "negativePrompt",
    "negative",
    "negative_image_prompt",
)

VLM_AGENT_PROMPT_TEXT_KEYS = (
    "prompt",
    "prompt_text",
    "draft_prompt",
    "user_prompt",
    "image_prompt",
    "positive_prompt",
    "positivePrompt",
    "positive",
    "recommended_prompt",
    "final_prompt",
)

VLM_AGENT_STRUCTURED_PROMPT_POSITIVE_KEYS = (
    "positive_prompt",
    "positivePrompt",
    "positive",
    "prompt",
    "prompt_text",
    "image_prompt",
    "recommended_prompt",
    "final_prompt",
    "draft_prompt",
    "text",
    "prefix",
    "middle",
    "middle_action",
    "body",
    "suffix",
    "tags",
    "tag_list",
    "prompt_tags",
    "danbooru_tags",
    "positive_tags",
    "suggested_tags",
)

VLM_AGENT_STRUCTURED_PROMPT_COMPOSITE_KEYS = (
    "subject",
    "subjects",
    "character",
    "characters",
    "main_subject",
    "mainSubject",
    "description",
    "visual_description",
    "visualDescription",
    "pose",
    "action",
    "action_pose",
    "actionPose",
    "attire",
    "clothing",
    "outfit",
    "outfit_details",
    "outfitDetails",
    "costume",
    "environment",
    "setting",
    "scene",
    "background",
    "composition",
    "camera",
    "camera_motion",
    "cameraMotion",
    "lighting",
    "lighting_atmosphere",
    "lightingAtmosphere",
    "style",
    "style_mood",
    "styleMood",
    "style_reference",
    "styleReference",
    "mood",
    "mood_keywords",
    "moodKeywords",
    "atmosphere",
    "details",
    "visual_details",
    "visualDetails",
    "prefix",
    "middle",
    "middle_action",
    "body",
    "suffix",
    "tags",
    "tag_list",
    "prompt_tags",
    "danbooru_tags",
    "positive_tags",
    "suggested_tags",
)

VLM_AGENT_STRUCTURED_PROMPT_PAYLOAD_KEYS = (
    "prompt_payload",
    "promptPayload",
    "visual_payload",
    "visualPayload",
    "image_payload",
    "imagePayload",
    "generation_prompt",
    "generationPrompt",
)

VLM_AGENT_PROMPT_META_TAGS = {
    "prompt",
    "positive_prompt",
    "negative_prompt",
    "negativeprompt",
    "negative",
    "parameters",
    "params",
    "metadata",
    "seed",
    "steps",
    "cfg",
    "cfg_scale",
    "guidance",
    "guidance_scale",
    "sampler",
    "scheduler",
    "width",
    "height",
    "resolution",
    "size",
}

VLM_AGENT_IMAGE_COUNT_KEYS = (
    "image_number",
    "images",
    "count",
    "batch_size",
)

VLM_AGENT_ASPECT_RATIO_KEYS = (
    "aspect_ratio",
    "aspectRatio",
    "aspect",
    "ratio",
    "orientation",
)

VLM_AGENT_PIXEL_SIZE_KEYS = (
    "width",
    "height",
    "resolution",
    "size",
)

VLM_AGENT_UNREQUESTED_GENERATION_CONTROL_KEYS = (
    "resolution_scale",
    "scale",
    "upscale",
    "seed",
    "image_seed",
    "seed_random",
    "random_seed",
    "randomize_seed",
    "steps",
    "scene_steps",
    "cfg_scale",
    "guidance_scale",
    "cfg",
    "guidance",
)

VLM_AGENT_INVALID_PROMPT_TAGS = {"none", "null", "nil", "na", "n/a", "undefined"}
VLM_AGENT_CONTEXTUAL_TAGS = {"green_blood"}

VLM_AGENT_SFW_BLOCKED_ADULT_TAGS = {
    "nude",
    "naked",
    "completely_nude",
    "fully_nude",
    "nude_female",
    "nude_male",
    "female_nude",
    "male_nude",
    "clothed_male_nude_female",
    "topless",
    "nipples",
    "areolae",
    "bare_breasts",
    "breasts_out",
    "sex",
    "penetration",
    "fellatio",
    "deepthroat",
    "handjob",
    "paizuri",
    "anal",
    "vaginal",
    "mating_press",
    "facial",
    "bukkake",
    "cum",
    "cum_on_face",
    "semen",
    "penis",
    "pussy",
}

VLM_AGENT_EXPLICIT_NEGATIVE_PATTERN = re.compile(
    r"(?:negative\s*prompt|negative_prompt|--neg\b|\u53cd\u5411\u63d0\u793a|\u8d1f\u5411\u63d0\u793a|\u8d1f\u9762\u63d0\u793a|\u8d1f\u9762prompt|\u8d1f\u5411prompt)",
    re.I,
)
VLM_NATURAL_POSITIVE_NEGATION_PATTERN = re.compile(
    r"(?:\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b|\bnon[-\s]|"
    r"\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|"
    r"\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)",
    re.I,
)
VLM_NATURAL_INLINE_GENERATION_CONTROL_PATTERN = re.compile(
    r"(?:^|[\s,，;；。])--(?:ar|aspect(?:-ratio)?|ratio|style|stylize|seed|steps|cfg|guidance|"
    r"sampler|scheduler|width|height|size|quality|q|chaos|version|v|raw)\b"
    r"(?:\s*(?:=|:)?\s*(?:\"[^\"]*\"|'[^']*'|[^\s,，;；。]+))?",
    re.I,
)
VLM_NATURAL_PROMPT_SCAFFOLD_LABEL_PATTERN = re.compile(
    r"(?:\b(?:final\s*prompt|refined\s*prompt|positive\s*prompt|prompt|description)\b|"
    r"\u6700\u7ec8\u63d0\u793a|\u6700\u7d42\u63d0\u793a|\u6b63\u5411\u63d0\u793a|\u753b\u9762\u63cf\u8ff0|"
    r"\u63d0\u793a\u8bcd|\u63d0\u793a\u8a5e|\u5173\u952e\u7ec6\u8282\u8981\u6c42|\u95dc\u9375\u7d30\u7bc0\u8981\u6c42|"
    r"\u753b\u9762\u8981\u6c42|\u6784\u56fe\u8981\u6c42|\u69cb\u5716\u8981\u6c42)\s*[:：]",
    re.I,
)
VLM_NATURAL_NEGATIVE_CONSTRAINT_RULES = (
    {
        "code": "full_body",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u5168\u8eab|\u5168\u8eab\u7167|\u5168\u8eab\u56fe|\u5168\u8eab\u5716)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\bfull[-_\s]?body\b)",
            re.I,
        ),
        "negative_terms": ("full body", "wide full-body shot"),
        "positive_zh": ("\u534a\u8eab\u6216\u8fd1\u666f\u6784\u56fe",),
        "positive_en": ("upper-body portrait framing",),
    },
    {
        "code": "transparent_background",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u900f\u660e\u80cc\u666f|\u900f\u660e\u5e95|\u900f\u660e\u5e95\u56fe|\u900f\u660e\u5e95\u5716|alpha\s*\u80cc\u666f)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:transparent\s+background|alpha\s+background)\b)",
            re.I,
        ),
        "negative_terms": ("transparent background", "alpha background"),
        "positive_zh": ("\u5b8c\u6574\u53ef\u89c1\u80cc\u666f",),
        "positive_en": ("complete visible background",),
    },
    {
        "code": "background",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)(?![^,，。.;；!?！？\n]{0,18}\u900f\u660e)[^,，。.;；!?！？\n]{0,12}(?:\u80cc\u666f)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b(?![^,.;!?\n]{0,18}transparent)[^,.;!?\n]{0,12}\bbackground\b)",
            re.I,
        ),
        "negative_terms": ("busy background", "detailed scenery"),
        "positive_zh": ("\u7b80\u6d01\u7eaf\u8272\u80cc\u666f",),
        "positive_en": ("plain simple backdrop",),
    },
    {
        "code": "nudity",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u88f8|\u88f8\u4f53|\u88f8\u9ad4|\u88f8\u9732|\u8d64\u88f8|\u9732\u70b9|\u9732\u9ede)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:nude|nudity|naked|topless|bare\s+breasts?)\b)",
            re.I,
        ),
        "negative_terms": ("nudity", "naked body", "exposed nipples", "bare breasts"),
        "positive_zh": ("\u7a7f\u7740\u5b8c\u6574\u670d\u88c5",),
        "positive_en": ("fully clothed",),
    },
    {
        "code": "explicit_sex",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u8272\u60c5|\u6027\u884c\u4e3a|\u6027\u884c\u70ba|\u6027\u7231|\u6027\u611b|\u6027\u4ea4|\u505a\u7231|\u505a\u611b|\u6027\u6697\u793a|\u9732\u9aa8)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:explicit|sex|sexual|porn|nsfw|intercourse)\b)",
            re.I,
        ),
        "negative_terms": ("explicit sexual content", "sex", "penetration", "pornographic content"),
        "positive_zh": ("\u65e5\u5e38\u5b89\u5168\u753b\u9762",),
        "positive_en": ("ordinary safe scene",),
    },
    {
        "code": "cat_ears",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u732b\u8033|\u8c93\u8033|\u732b\u5a18|\u8c93\u5a18|\u517d\u8033|\u7378\u8033)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:cat[-_\s]?ears?|cat[-_\s]?girls?|catgirls?|nekomimi|animal[-_\s]?ears?)\b)",
            re.I,
        ),
        "negative_terms": ("cat ears", "animal ears", "catgirl", "nekomimi"),
        "positive_zh": (),
        "positive_en": (),
    },
    {
        "code": "text_artifacts",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u6587\u5b57|\u6587\u672c|\u5b57\u5e55|\u6c34\u5370|\u7b7e\u540d|\u7c3d\u540d|logo|\u6807\u5fd7|\u6a19\u5fd7|\u754c\u9762)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:text|letters|caption|subtitles?|watermark|signature|logo|ui)\b)",
            re.I,
        ),
        "negative_terms": ("text", "watermark", "signature", "logo", "subtitles", "UI"),
        "positive_zh": (),
        "positive_en": (),
    },
    {
        "code": "no_people",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u4eba\u7269|\u4eba\u50cf|\u4eba\u5f71|\u4eba\u7fa4|\u8def\u4eba|\u6709\u4eba|\u6ca1\u6709\u4eba|\u6c92\u6709\u4eba|\u4eba)|"
            r"(?:\u65e0\u4eba|\u7121\u4eba|\u7eaf\u98ce\u666f|\u7d14\u98a8\u666f)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:people|persons?|humans?|human\s+figures?|figures?|characters?)\b)",
            re.I,
        ),
        "negative_terms": ("people", "person", "human figure", "silhouette", "\u4eba\u7269", "\u4eba\u50cf", "\u4eba\u5f71", "\u8eab\u5f71", "\u8def\u4eba", "\u4eba"),
        "positive_zh": ("\u7eaf\u98ce\u666f\u6784\u56fe",),
        "positive_en": ("pure landscape composition",),
    },
    {
        "code": "blur_low_quality",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u6a21\u7cca|\u4f4e\u6e05|\u4f4e\u8d28\u91cf|\u4f4e\u54c1\u8d28|\u4f4e\u756b\u8d28|\u4f4e\u753b\u8d28)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\b(?:blur|blurry|low[-_\s]?quality|lowres)\b)",
            re.I,
        ),
        "negative_terms": ("blur", "blurry", "low quality", "lowres"),
        "positive_zh": ("\u6e05\u6670\u9510\u5229\u7684\u753b\u9762",),
        "positive_en": ("sharp clear focus",),
    },
    {
        "code": "simple_background",
        "pattern": re.compile(
            r"(?:(?:\u4e0d\u8981|\u522b|\u5225|\u907f\u514d|\u7981\u6b62|\u4e0d\u9700\u8981|\u65e0\u9700|\u7121\u9700|\u6ca1\u6709|\u6c92\u6709|\u4e0d\u542b|\u6392\u9664)[^,，。.;；!?！？\n]{0,18}(?:\u7b80\u5355\u80cc\u666f|\u7c21\u55ae\u80cc\u666f|\u7b80\u6d01\u80cc\u666f|\u7c21\u6f54\u80cc\u666f)|"
            r"\b(?:no|without|avoid|exclude|excluding|do\s+not|don't|not)\b[^,.;!?\n]{0,18}\bsimple\s+background\b)",
            re.I,
        ),
        "negative_terms": ("simple background", "plain background"),
        "positive_zh": ("\u6709\u573a\u666f\u7ec6\u8282\u7684\u80cc\u666f",),
        "positive_en": ("detailed environmental background",),
    },
)

VLM_AGENT_IMAGE_COUNT_DIGIT_PATTERN = re.compile(
    r"(?:\u751f\u6210|\u753b|\u6765|\u8981|\u51fa|\u505a|make|generate|create|draw)?\s*(\d{1,2})\s*(?:\u5f20|\u5e45|images?|imgs?|pictures?)",
    re.I,
)
VLM_AGENT_IMAGE_COUNT_CN_PATTERN = re.compile(
    r"(?:\u751f\u6210|\u753b|\u6765|\u8981|\u51fa|\u505a)?\s*([\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341])\s*(?:\u5f20|\u5e45)(?:\u56fe|\u56fe\u7247|\u7167\u7247|\u753b|\u4f5c\u54c1)?",
    re.I,
)
VLM_AGENT_IMAGE_COUNT_CN_DIGITS = {
    "\u4e00": 1,
    "\u4e8c": 2,
    "\u4e24": 2,
    "\u4e09": 3,
    "\u56db": 4,
    "\u4e94": 5,
    "\u516d": 6,
    "\u4e03": 7,
    "\u516b": 8,
    "\u4e5d": 9,
    "\u5341": 10,
}

VLM_AGENT_ASPECT_RATIO_PATTERN = re.compile(
    r"(?<!\d)([1-9]\d?)\s*(?:[:\uff1a/\u6bd4]|x|X|\*)\s*([1-9]\d?)(?!\d)",
    re.I,
)
VLM_AGENT_PIXEL_SIZE_PATTERN = re.compile(
    r"(?<!\d)([1-9]\d{2,4})\s*(?:x|X|\*|\u00d7|by)\s*([1-9]\d{2,4})(?!\d)",
    re.I,
)
VLM_AGENT_ASPECT_SQUARE_PATTERN = re.compile(
    r"(?:\u4e00\u6bd4\u4e00|\u6b63\u65b9\u5f62|\u65b9\u56fe|\bsquare\b|\b1\s*(?:to|:)\s*1\b)",
    re.I,
)
VLM_AGENT_ASPECT_LANDSCAPE_PATTERN = re.compile(
    r"(?:\u6a2a\u5c4f|\u6a2a\u7248|\u5bbd\u5c4f|\bwidescreen\b)",
    re.I,
)
VLM_AGENT_ASPECT_PORTRAIT_PATTERN = re.compile(
    r"(?:\u7ad6\u5c4f|\u7ad6\u7248|\bportrait\s+orientation\b)",
    re.I,
)


def _canvas_prompt_text_from_value(value):
    if value is None:
        return ""
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return ""
        structured = _canvas_positive_prompt_from_structured_text(text)
        return structured or text
    if isinstance(value, (list, tuple)):
        parts = []
        for item in value:
            text = _canvas_prompt_text_from_value(item)
            if text:
                parts.append(text)
        return ", ".join(parts)
    if isinstance(value, dict):
        text_value = _canvas_prompt_text_from_value(value.get("text")) if "text" in value else ""
        if text_value:
            return text_value
        composite_parts = []
        for key in VLM_AGENT_STRUCTURED_PROMPT_COMPOSITE_KEYS:
            if key not in value:
                continue
            text = _canvas_prompt_text_from_value(value.get(key))
            if text:
                composite_parts.append(text)
        if composite_parts:
            return ", ".join(composite_parts)
        for key in VLM_AGENT_STRUCTURED_PROMPT_POSITIVE_KEYS:
            if key not in value:
                continue
            text = _canvas_prompt_text_from_value(value.get(key))
            if text:
                return text
        return ""
    return str(value).strip()


def _canvas_prompt_text_from_structured_payload(item):
    if not isinstance(item, dict):
        return ""
    for key in VLM_AGENT_STRUCTURED_PROMPT_PAYLOAD_KEYS:
        if key not in item:
            continue
        text = _canvas_prompt_text_from_value(item.get(key))
        if text:
            return text
    return ""


def _canvas_prompt_text_from_structured_payload_source(source):
    text_source = str(source or "")
    if not text_source:
        return ""
    decoder = json.JSONDecoder()
    for key in VLM_AGENT_STRUCTURED_PROMPT_PAYLOAD_KEYS:
        pattern = re.compile(rf'"{re.escape(key)}"\s*:\s*', re.I)
        for match in pattern.finditer(text_source):
            start = match.end()
            while start < len(text_source) and text_source[start].isspace():
                start += 1
            if start >= len(text_source) or text_source[start] not in "{[\"":
                continue
            try:
                parsed, _ = decoder.raw_decode(text_source[start:])
            except Exception:
                continue
            prompt_text = _canvas_prompt_text_from_value(parsed)
            if prompt_text:
                return prompt_text
    return ""


def _canvas_positive_prompt_from_structured_text(text):
    source = str(text or "").strip()
    if not source or source[0] not in "{[":
        return ""
    try:
        parsed = json.loads(source)
    except Exception:
        parsed = None
    if parsed is not None:
        return _canvas_prompt_text_from_value(parsed)
    quoted_patterns = (
        r'"(?:positive_prompt|positivePrompt|positive|prompt|prompt_text|image_prompt|recommended_prompt|final_prompt|draft_prompt|text)"\s*:\s*"((?:\\.|[^"\\])*)"',
        r"'(?:positive_prompt|positivePrompt|positive|prompt|prompt_text|image_prompt|recommended_prompt|final_prompt|draft_prompt|text)'\s*:\s*'((?:\\.|[^'\\])*)'",
    )
    for pattern in quoted_patterns:
        match = re.search(pattern, source, re.I | re.S)
        if not match:
            continue
        literal = match.group(1)
        try:
            return str(json.loads(f'"{literal}"') or "").strip()
        except Exception:
            return str(literal or "").strip()
    return ""


def _canvas_vlm_continuation_image_intent(prompt):
    text = str(prompt or "").strip().lower()
    if not text:
        return False
    if re.search(r"^/(?:regen|regenerate|reroll|again)\b|^/\u518d\u6765\b", text, re.I):
        return True
    if re.search(
        r"(?:\u518d(?:\u753b|\u756b|\u6765|\u4f86|\u751f\u6210|\u51fa).{0,6}(?:\u5f20|\u5f35|\u56fe|\u5716)?|"
        r"\u7ee7\u7eed|\u7e7c\u7e8c|\u63a5\u7740|\u63a5\u8457|\u540c\u6837|\u540c\u6b3e|\u4e0a\u4e00\u5f20|\u4e0a\u4e00\u5f35|"
        r"\u53e6\u4e00\u5f20|\u53e6\u4e00\u5f35|\u518d\u6765\u4e00\u5f20|\u518d\u4f86\u4e00\u5f35|"
        r"\banother\b|\bagain\b|\bcontinue\b|\bsame\b|\bmore\b)",
        text,
        re.I,
    ):
        if _canvas_vlm_image_prompting_intent(text):
            return True
        if re.search(r"(?:\u5f20|\u5f35|\u56fe|\u5716|\u753b|\u756b|image|picture|prompt)", text, re.I):
            return True
    if re.search(
        r"(?:\u4e0d\u662f|\u4e0d\u5bf9|\u4e0d\u5c0d|\u4f46\u662f|\u4f46|\u753b\u51fa\u6765|\u756b\u51fa\u4f86|\u5e94\u8be5|\u61c9\u8a72|\u6539\u6210|\u6362\u6210|\u63db\u6210|wrong|not\s+right|should\s+be|change\s+to)",
        text,
        re.I,
    ) and re.search(
        r"(?:\u56fe|\u5716|\u753b|\u756b|\u989c\u8272|\u984f\u8272|\u53d1|\u9aee|\u5934\u53d1|\u982d\u9aee|\u53cc\u9a6c\u5c3e|\u96d9\u99ac\u5c3e|hair|color|image|picture|prompt)",
        text,
        re.I,
    ):
        return True
    if not re.search(
        r"(?:继续|再来|再画|再生成|再出|另[一1]张|换[一1]张|同样|刚才|上一张|接着|more|another|continue|same)",
        text,
        re.I,
    ):
        return False
    if _canvas_vlm_image_prompting_intent(text):
        return True
    if re.search(
        r"(?:张|图|画面|场景|情景|背景|半身|头像|立绘|姿势|动作|战斗|动态|街道|雨夜|夜晚|简单背景|透明背景|portrait|scene|background|pose|battle|street|night)",
        text,
        re.I,
    ):
        return True
    return _canvas_vlm_visual_scene_hint(text, include_meta=False)


def _canvas_vlm_fake_generation_complete(text):
    source = str(text or "").strip()
    if not source:
        return False
    return bool(re.search(
        r"(?:generation\s+complete|image\s+is\s+now\s+attached|already\s+generated|"
        r"\u5df2.{0,12}\u751f\u6210|\u751f\u6210\u5b8c\u6210|\u8bf7\u67e5\u6536)",
        source,
        re.I,
    ))


def _canvas_vlm_visual_scene_hint(prompt, include_meta=True):
    text = str(prompt or "").strip()
    if not text:
        return False
    if include_meta and (_canvas_vlm_image_prompting_intent(text) or _canvas_vlm_continuation_image_intent(text)):
        return True
    if re.search(
        r"(?:\u753b\u9762|\u573a\u666f|\u60c5\u666f|\u80cc\u666f|\u6c99\u6ee9|\u6d77\u8fb9|\u6d77\u6ee9|"
        r"\u6cf3\u88c5|\u6cf3\u8863|\u6bd4\u57fa\u5c3c|\u7a7f\u7740|\u73a9\u800d|\u5b09\u620f|"
        r"\u8857|\u8857\u4e0a|\u8857\u9053|\u7275\u624b|\u624b\u7275\u624b|\u8d70\u8def|\u884c\u8d70|"
        r"\u505a\u7231|\u6027\u7231|\u540e\u5165|\u5f8c\u5165|\u72d7\u722c|\u63d2\u5165|\u63a5\u543b|\u4eb2\u543b|\u88ab\u5582|\u6295\u5582|\u5582\u98df|\u6d17\u6fa1|\u6d74\u5ba4|"
        r"\u5251\u9053|\u9053\u573a|\u6728\u5200|\u7af9\u5200|\u6218\u6597|\u6253\u4e00\u67b6|\u6253\u67b6|\u5bf9\u6218|"
        r"\u5408\u7167|\u96c6\u4f53\u7167|\u821e\u53f0|\u6821\u56ed|\u5b66\u6821|\u6559\u5ba4|\u6563\u6b65|"
        r"\u9b54\u6cd5\u5c11\u5973|\u8def\u706f|\u56de\u5934|\u770b\u955c\u5934|\u900f\u660e\u80cc\u666f|\u5168\u8eab|\u534a\u8eab|\u7acb\u7ed8|"
        r"scene|background|beach|seaside|street|city|holding\s+hands|walking|swimsuit|bikini|playing|sex|doggystyle|penetration|kiss|bathroom|bathing|"
        r"kendo|dojo|shinai|wooden\s+sword|battle|fight(?:ing)?|combat|group\s+photo|stage|campus|school|student|magical\s+girl|lamppost|looking\s+back|transparent\s+background|full\s+body|upper\s+body)",
        text,
        re.I,
    ):
        return True
    subject_pattern = (
        r"(?:\d+|one|two|three|four|five|six|\u4e00|\u4e8c|\u4e24|\u5169|\u4e09|\u56db|\u4e94|\u516d)"
        r"\s*(?:\u4e2a|\u500b|\u4f4d|\u540d)?\s*"
        r"(?:\u4eba|\u89d2\u8272|\u5973\u5b69|\u5973\u751f|\u7537\u5b69|\u7537\u751f|\u5b66\u751f|girls?|boys?|men|women|people|students?)"
        r"|\b(?:girl|boy|woman|man|student|character)s?\b"
    )
    visual_modifier_pattern = (
        r"(?:\u7ad9|\u5750|\u8df3|\u8dd1|\u8d70|\u6563\u6b65|\u7ec3|\u8868\u6f14|\u821e\u53f0|\u6253|"
        r"\u96e8|\u591c|\u6821\u56ed|\u5b66\u6821|\u9053\u573a|\u5251\u9053|\u5408\u7167|\u80cc\u666f|"
        r"standing|sitting|jumping|running|walking|training|performing|stage|rain|night|campus|school|dojo|kendo|photo|portrait)"
    )
    return bool(re.search(subject_pattern, text, re.I) and re.search(visual_modifier_pattern, text, re.I))


def _canvas_vlm_history_reference_prompt(payload, prompt):
    persona_subject = _canvas_vlm_persona_image_subject_intent(prompt)
    continuation_subject = _canvas_vlm_continuation_image_intent(prompt)
    if not continuation_subject and not persona_subject:
        return ""
    current_resolution = canvas_danbooru_service._canvas_requested_character_resolution(prompt)
    if current_resolution.get("state") == "resolved":
        return ""
    full_source = payload.get("chat_messages_full") if isinstance(payload.get("chat_messages_full"), list) else []
    rolling_source = payload.get("chat_messages") if isinstance(payload.get("chat_messages"), list) else []
    source = (rolling_source[-12:] if rolling_source else []) + (full_source[-40:] if full_source else [])
    seen = set()
    action_candidates = []
    for item in reversed(source):
        if not isinstance(item, dict) or item.get("pending"):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role == "assistant":
            for action_prompt in _canvas_vlm_message_action_prompts(item):
                prompt_text = action_prompt.get("prompt") or ""
                if persona_subject and prompt_text and _canvas_vlm_prompt_has_visible_human_subject(prompt_text):
                    return prompt_text
                if continuation_subject and prompt_text and action_prompt.get("trusted"):
                    return prompt_text
                if continuation_subject and prompt_text and _canvas_vlm_prompt_has_visible_human_subject(prompt_text):
                    return prompt_text
                if prompt_text and prompt_text not in seen:
                    seen.add(prompt_text)
                    action_candidates.append(action_prompt)
            content = _canvas_vlm_message_text(item)
            if persona_subject and content and _canvas_vlm_persona_visual_context_hint(content):
                return content
            continue
        if role != "user":
            continue
        content = _canvas_vlm_message_text(item)
        if not content or content.strip() == str(prompt or "").strip():
            continue
        dedupe_key = (role, content)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        resolution = canvas_danbooru_service._canvas_requested_character_resolution(content)
        if resolution.get("state") == "resolved":
            return content
        if persona_subject and _canvas_vlm_persona_visual_context_hint(content):
            return content
    for action_prompt in sorted(action_candidates, key=lambda item: 0 if item.get("trusted") else 1):
        prompt_text = action_prompt.get("prompt") or ""
        if continuation_subject and prompt_text:
            return prompt_text
        if persona_subject and _canvas_vlm_prompt_has_visible_human_subject(prompt_text):
            return prompt_text
        resolution = canvas_danbooru_service._canvas_requested_character_resolution(prompt_text)
        if resolution.get("state") == "resolved":
            return prompt_text
    return ""


def _canvas_vlm_effective_prompt(payload, prompt):
    payload = payload if isinstance(payload, dict) else {}
    cache = payload.get("_vlm_effective_prompt_cache")
    key = str(prompt or "")
    if isinstance(cache, dict) and cache.get("prompt") == key:
        return str(cache.get("effective_prompt") or "")
    reference = _canvas_vlm_history_reference_prompt(payload if isinstance(payload, dict) else {}, prompt)
    if not reference:
        effective = str(prompt or "")
    else:
        effective = f"{reference}\n{prompt}"
    try:
        payload["_vlm_effective_prompt_cache"] = {"prompt": key, "effective_prompt": effective}
    except Exception:
        pass
    return effective


def _canvas_vlm_isolate_rolling_history_for_prompt(payload, params, prompt):
    data = params if isinstance(params, dict) else {}
    if _canvas_vlm_agent_mode(data) == "raw":
        return False
    if _canvas_vlm_prompt_rewrite_request(data, payload):
        return False
    if _canvas_bool(data.get("disable_standalone_image_history_isolation"), False):
        return False
    text = str(prompt or "").strip()
    if not text:
        return False
    if _canvas_vlm_continuation_image_intent(text) or _canvas_vlm_persona_image_subject_intent(text):
        return False
    if not (_canvas_vlm_image_prompting_intent(text) or _canvas_vlm_visual_scene_hint(text)):
        return False
    try:
        resolution = canvas_danbooru_service._canvas_requested_character_resolution(text)
    except Exception:
        resolution = {}
    return bool(isinstance(resolution, dict) and resolution.get("state") == "resolved")


def _canvas_vlm_user_system_prompt(params):
    if not isinstance(params, dict):
        return ""
    for key in ("user_system_prompt", "raw_system_prompt", "base_system_prompt"):
        value = str(params.get(key) or "").strip()
        if value:
            return value
    system_prompt = str(params.get("system_prompt") or "").strip()
    marker = "Lower-priority persona background."
    if marker in system_prompt:
        tail = system_prompt.split(marker, 1)[-1]
        if "\n" in tail:
            return tail.split("\n", 1)[-1].strip()
        return tail.strip()
    return system_prompt


def _canvas_build_vlm_agent_system_prompt(params, payload, prompt):
    started = time.monotonic()
    base = _canvas_vlm_user_system_prompt(params)
    mode = str(params.get("mode") or "single").strip().lower()
    if mode != "chat":
        return base
    agent_mode = _canvas_vlm_agent_mode(params)
    if agent_mode == "raw":
        return base
    prompt_rewrite_request = _canvas_vlm_prompt_rewrite_request(params, payload)
    if prompt_rewrite_request:
        agent_prompt = _canvas_vlm_prompt_rewrite_system_prompt(base, payload, prompt)
        logger.info(
            "Canvas VLM agent prompt built: elapsed=%.3fs, chars=%s, compact=%s, use_skills=%s, use_canvas=%s, action_hints=%s, danbooru_lookup=%s, lookup_elapsed=%.3fs, prompt_rewrite=%s",
            time.monotonic() - started,
            len(agent_prompt),
            True,
            False,
            False,
            False,
            False,
            0.0,
            True,
        )
        return agent_prompt
    effective_prompt = _canvas_vlm_effective_prompt(payload, prompt)
    persona_image_subject = _canvas_vlm_persona_image_subject_for_request(
        payload if isinstance(payload, dict) else {},
        prompt,
        effective_prompt,
    )
    lock_source = _canvas_vlm_persona_lock_source(prompt, effective_prompt, persona_image_subject)
    payload_agent_context = payload.get("agent_context") if isinstance(payload.get("agent_context"), dict) else {}
    payload_targets = payload_agent_context.get("prompt_generation_targets") if isinstance(payload_agent_context, dict) else {}
    payload_text_target = payload_targets.get("text_to_image") if isinstance(payload_targets.get("text_to_image"), dict) else {}
    payload_edit_target = payload_targets.get("image_edit") if isinstance(payload_targets.get("image_edit"), dict) else {}
    image_edit_request = _canvas_vlm_image_edit_intent(effective_prompt)
    preferred_edit_target = payload_text_target if _canvas_target_is_image_edit(payload_text_target) else payload_edit_target
    h3_target = preferred_edit_target if image_edit_request and preferred_edit_target else payload_text_target
    target_key = str(h3_target.get("key") or "").strip()
    if not target_key:
        target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload if isinstance(payload, dict) else {})
    h3_target = h3_target or {"key": target_key}
    image_edit_request = image_edit_request or _canvas_target_is_image_edit(h3_target)
    h3_prompt_required = bool(minimax_h3_prompt_compiler.target_compiler(h3_target))
    h3_skill_files = _canvas_h3_prompt_writing_skill_files(
        params=params,
        payload=payload,
        target=h3_target,
    ) if h3_prompt_required else []
    target_requires_anima = _canvas_is_anima_prompt_target_key(target_key, payload_text_target)
    target_requires_danbooru = target_key in {"sdxl_danbooru", "danbooru", "illustrious", "noob", "pony", "animagine"}
    image_prompt_intent = _canvas_vlm_image_prompting_intent(effective_prompt)
    natural_target = _canvas_is_natural_prompt_target_key(target_key)
    natural_adult_intent = _canvas_natural_adult_intent_info(effective_prompt, "") if natural_target else {}
    if not image_prompt_intent and (target_requires_danbooru or target_requires_anima):
        try:
            adult_intent = canvas_vlm_prompt_pipeline.detect_adult_intent(effective_prompt, "")
        except Exception:
            adult_intent = {}
        image_prompt_intent = bool(
            _canvas_vlm_visual_scene_hint(effective_prompt)
            or (isinstance(adult_intent, dict) and adult_intent.get("is_adult"))
        )
    image_request_mode = image_prompt_intent
    compact_prompt = True if prompt_rewrite_request else _canvas_compact_agent_prompt_enabled(params)
    prompt_skill_intent = bool(image_prompt_intent or prompt_rewrite_request)
    minimal_image_prompt = (
        image_prompt_intent
        and target_requires_danbooru
        and (agent_mode == "persona" or compact_prompt)
    )
    if minimal_image_prompt:
        current_turn_locks = _canvas_vlm_current_turn_prompt_locks(
            lock_source,
            allow_pure_scenery=not persona_image_subject,
            allow_character_resolution=not persona_image_subject,
        )
        if persona_image_subject:
            persona_locks = _canvas_merge_prompt_locks(
                _canvas_vlm_persona_prompt_locks(base),
                _canvas_vlm_persona_prompt_locks(prompt),
            )
            current_turn_locks = _canvas_merge_prompt_locks(
                persona_locks,
                current_turn_locks,
            )
        current_turn_locks = _canvas_merge_two_stage_locks(current_turn_locks, params)
        return _canvas_vlm_minimal_persona_image_system_prompt(
            base,
            payload_targets,
            target_key,
            current_turn_locks,
            persona_image_subject,
        )
    use_skills = (
        _canvas_bool(params.get("agent_use_skills"), True)
        and (prompt_rewrite_request or agent_mode == "canvas_agent" or image_request_mode)
    )
    use_canvas = (
        not prompt_rewrite_request
        and
        _canvas_bool(params.get("agent_use_canvas_context"), True)
        and (agent_mode == "canvas_agent" or image_request_mode)
        and not minimal_image_prompt
    )
    action_hints = (
        not prompt_rewrite_request
        and agent_mode in ("persona", "canvas_agent")
        and _canvas_bool(params.get("agent_action_hints"), True)
    )
    if not (use_skills or use_canvas or action_hints):
        return base

    sections = []
    lookup_elapsed = 0.0
    if agent_mode == "persona":
        sections.append(
            "Persona chat boundary: follow the user's System Prompt/persona and chat naturally. "
            "Do not claim to be SimpAI unless the user asked for SimpAI behavior. "
            "Do not mention canvas data or tool protocols during normal conversation."
        )
        if image_request_mode:
            sections.append(
                "Image-request override for persona mode: keep the visible chat tone natural and concise, "
                "but switch your hidden working mode to prompt-generation skill first. "
                "For image requests, the highest priority is understanding user intent correctly and preparing a strong image action prompt, "
                "not extending persona roleplay."
            )
    if use_canvas:
        agent_context = payload.get("agent_context") if isinstance(payload.get("agent_context"), dict) else {}
        canvas_budget = 1800 if compact_prompt else 7000
        target_budget = 900 if compact_prompt else 3000
        sections.append(
            "Canvas context snapshot. Treat it as read-only state from the current SimpAI infinite canvas:\n"
            + _canvas_compact_agent_json(agent_context, canvas_budget)
            )
        targets = agent_context.get("prompt_generation_targets") if isinstance(agent_context, dict) else {}
        if isinstance(targets, dict) and targets:
            sections.append(
                "Current canvas generation prompt targets. These override generic model preferences when you write action JSON prompts:\n"
                + _canvas_compact_agent_json(targets, target_budget)
            )
    else:
        agent_context = {}
        targets = payload_targets if isinstance(payload_targets, dict) else {}
        if prompt_skill_intent and isinstance(targets, dict) and targets:
            sections.append(
                "Current image generation target metadata. This is target format only, not a canvas snapshot:\n"
                + _canvas_compact_agent_json(targets, 900 if compact_prompt else 2500)
            )
    if prompt_skill_intent and natural_target and natural_adult_intent.get("is_adult"):
        sections.append(
            "Natural target adult-intent unlock for this request. This signal comes from local adult intent detection and should be preserved in the action prompt instead of being downgraded to SFW:\n"
            + _canvas_compact_agent_json(natural_adult_intent, 700)
        )
    danbooru_prompt_intent = _canvas_vlm_danbooru_prompting_intent(effective_prompt)
    danbooru_prompt_required = prompt_skill_intent and (danbooru_prompt_intent or target_requires_danbooru)
    anima_prompt_required = prompt_skill_intent and target_requires_anima
    current_turn_locks = {}
    if danbooru_prompt_required or anima_prompt_required:
        locked_prompt_context = canvas_vlm_prompt_pipeline.locked_prompt_context_text(lock_source)
        if locked_prompt_context:
            if compact_prompt and len(locked_prompt_context) > 1800:
                locked_prompt_context = locked_prompt_context[:1800].rstrip() + "\n..."
            sections.append(
                "Locked Planner / Resolver / Expander / Composer context for this turn. "
                "Use these as backend-verified facts for image action JSON; do not print this context in visible chat. "
                "If scene_branch_options are present, treat the model's job as selecting or respecting one branch, while the backend Composer owns the final tag matrix. "
                "Do not override a locked recommended_prompt with assistant persona traits or guessed character defaults:\n"
                + locked_prompt_context
            )
        current_turn_locks = _canvas_vlm_current_turn_prompt_locks(
            lock_source,
            allow_pure_scenery=not persona_image_subject,
            allow_character_resolution=not persona_image_subject,
        )
        if persona_image_subject:
            persona_locks = _canvas_merge_prompt_locks(
                _canvas_vlm_persona_prompt_locks(base),
                _canvas_vlm_persona_prompt_locks(prompt),
            )
            current_turn_locks = _canvas_merge_prompt_locks(
                persona_locks,
                current_turn_locks,
            )
        current_turn_locks = _canvas_merge_two_stage_locks(current_turn_locks, params)
        two_stage_understanding = str(current_turn_locks.get("two_stage_understanding") or "").strip()
        if two_stage_understanding:
            sections.append(
                "Two-stage intent extract for this turn. Use this as the visible understanding and as hard semantic guidance for the JSON action; do not contradict it:\n"
                + two_stage_understanding[:250 if compact_prompt else 500]
            )
        if current_turn_locks:
            sections.append(
                "MANDATORY CURRENT TURN PROMPT LOCKS / 当前轮生图锁定信息：\n"
                "Use this compact local lookup result when writing the JSON action. "
                "For SDXL/Danbooru targets, copy exact tags from required_prompt_tags into draft_prompt and prompt_intent.locked_tags when they match the user's request. "
                "For Anima targets, use exact resolved anchors where they fit and place complex layout details in English nltags. "
                "Do not translate, romanize, abbreviate, or replace these tags with bare names.\n"
                + _canvas_compact_agent_json(current_turn_locks, 1800 if compact_prompt else 3500)
            )
    if use_skills:
        skill_index = _canvas_read_vlm_skill_index()
        if skill_index and not prompt_rewrite_request:
            sections.append(
                "SimpAI VLM skill ownership index. Use this to distinguish user-authored knowledge from generated scaffolding:\n"
                + _canvas_compact_agent_json(skill_index, 1200 if compact_prompt else 5000)
            )
        preset_guide_required = bool(
            not prompt_rewrite_request
            and agent_mode == "canvas_agent"
            and _canvas_vlm_preset_guide_intent(effective_prompt)
        )
        required_docs = []
        if h3_prompt_required:
            required_docs.extend(h3_skill_files)
        elif anima_prompt_required:
            required_docs.append(VLM_ANIMA_PROMPT_SKILL_FILE)
        if image_edit_request:
            required_docs.append(VLM_IMAGE_EDIT_SKILL_FILE)
        if preset_guide_required:
            required_docs.append(VLM_SIMPAI_PRESET_GUIDE_SKILL_FILE)
        if not prompt_rewrite_request and (prompt_skill_intent or preset_guide_required):
            required_docs.append(VLM_PRESET_TOOL_CALLING_SKILL_FILE)
        if not prompt_rewrite_request and agent_mode == "canvas_agent":
            required_docs.append(VLM_AGENT_COMPANION_SKILL_FILE)
        if not anima_prompt_required and danbooru_prompt_required:
            required_docs.append(VLM_DANBOORU_TAG_PROMPT_SKILL_FILE)
        elif not anima_prompt_required and prompt_skill_intent and _canvas_is_natural_prompt_target_key(target_key):
            required_docs.append(VLM_NATURAL_PROMPT_ACTION_SKILL_FILE)
        elif not anima_prompt_required and prompt_skill_intent:
            required_docs.append(VLM_IMAGE_PROMPT_SKILL_FILE)
        doc_budget = 1400 if prompt_rewrite_request else (2200 if compact_prompt else 9000)
        if h3_prompt_required:
            doc_budget = max(doc_budget, 7000 if compact_prompt else 10000)
        elif anima_prompt_required:
            doc_budget = max(doc_budget, 18000 if compact_prompt else 20000)
        if preset_guide_required:
            doc_budget = max(doc_budget, 30000 if compact_prompt else 32000)
        elif not prompt_rewrite_request and VLM_PRESET_TOOL_CALLING_SKILL_FILE in required_docs:
            doc_budget = max(doc_budget, 10000 if compact_prompt else 14000)
        docs = _canvas_read_vlm_skill_docs(
            effective_prompt,
            doc_budget,
            required_docs=required_docs,
            required_only=bool(required_docs),
            language=_canvas_vlm_skill_language(params=params, payload=payload, target=h3_target),
        )
        if docs:
            if compact_prompt:
                skill_text = "\n\n".join(
                    f"### {doc['title']}\n{doc['content']}"
                    for doc in docs
                )
            else:
                skill_text = "\n\n".join(
                    (
                        f"### {doc['title']} ({doc['path']})\n"
                        f"Ownership: {doc.get('ownership')}; manual_required: {doc.get('manual_required')}; "
                        f"auto_generated: {doc.get('auto_generated')}; edit_target: {doc.get('edit_target')}\n"
                        f"{doc['content']}"
                    )
                    for doc in docs
                )
            sections.append(
                "Built-in SimpAI skill docs. For image requests, these skill instructions override casual persona habits and generic tool chatter:\n"
                + skill_text
            )
        if prompt_skill_intent and natural_target and natural_adult_intent.get("is_adult"):
            adult_skill = _canvas_read_vlm_skill_file(
                VLM_NATURAL_PROMPT_ADULT_SKILL_FILE,
                2200 if prompt_rewrite_request else 5000,
            )
            if adult_skill:
                sections.append(
                    "Dedicated natural adult branch skill. Loaded only because local adult_intent.is_adult=true for this request:\n"
                    + adult_skill
                )
        danbooru_lookup_enabled = (not prompt_rewrite_request) and _canvas_agent_danbooru_lookup_enabled(params)
        if (danbooru_prompt_required or anima_prompt_required) and danbooru_lookup_enabled:
            lookup_source = str(effective_prompt or prompt or "").strip()[:1200]
            lookup_started = time.monotonic()
            lookup_text = canvas_danbooru_service._canvas_danbooru_lookup_text(lookup_source, model_hint=prompt, limit=28)
            lookup_elapsed += time.monotonic() - lookup_started
            if lookup_text:
                sections.append(lookup_text)
    if action_hints:
        sections.append(
            _canvas_vlm_compact_action_protocol_text(
                image_prompt_intent,
                danbooru_prompt_required,
                current_turn_locks,
                target_key,
                natural_adult_intent,
                anima_prompt_required,
            )
        )
    agent_prompt = "\n\n".join(sections).strip()
    if not agent_prompt:
        return base
    logger.info(
        "Canvas VLM agent prompt built: elapsed=%.3fs, chars=%s, compact=%s, use_skills=%s, use_canvas=%s, action_hints=%s, danbooru_lookup=%s, lookup_elapsed=%.3fs, prompt_rewrite=%s",
        time.monotonic() - started,
        len(agent_prompt),
        compact_prompt,
        use_skills,
        use_canvas,
        action_hints,
        bool((danbooru_prompt_required or anima_prompt_required) and use_skills and (not prompt_rewrite_request) and _canvas_agent_danbooru_lookup_enabled(params)),
        lookup_elapsed,
        prompt_rewrite_request,
    )
    if base:
        if image_request_mode:
            return (
                agent_prompt
                + "\n\n---\n"
                + "Lower-priority persona background. Use this only for visible chat tone and explicit assistant-self portraits; "
                + "do not let it override image-subject selection, subject_counts, canonical character tags, or prompt format rules.\n"
                + base
            )
        return base + "\n\n---\n" + agent_prompt
    return agent_prompt

def _canvas_extract_vlm_agent_actions(text):
    source = str(text or "")
    if not source:
        return []
    decoder = json.JSONDecoder()
    actions = []

    def add_action(item):
        if not isinstance(item, dict):
            return
        nested_args = None
        if isinstance(item.get("args"), dict):
            nested_args = item.get("args")
        elif isinstance(item.get("arguments"), dict):
            nested_args = item.get("arguments")
        elif isinstance(item.get("parameters"), dict):
            nested_args = item.get("parameters")
        function_payload = item.get("function")
        if isinstance(function_payload, dict):
            function_args = function_payload.get("arguments")
            if isinstance(function_args, str):
                try:
                    function_args = json.loads(function_args)
                except Exception:
                    function_args = {}
            if isinstance(function_args, dict):
                nested_args = function_args
            if not item.get("name") and function_payload.get("name"):
                item = dict(item)
                item["name"] = function_payload.get("name")
        action = _canvas_normalize_vlm_action_name(
            item.get("action")
            or item.get("type")
            or item.get("name")
            or item.get("action_type")
            or item.get("actionType")
            or item.get("tool_name")
            or item.get("toolName")
            or item.get("tool")
            or ""
        )
        if action in VLM_AGENT_ACTIONS and isinstance(nested_args, dict):
            merged = dict(nested_args)
            for key, value in item.items():
                if key not in {"args", "arguments", "parameters", "function"} and key not in merged:
                    merged[key] = value
            merged["action"] = action
            item = merged
        if action not in VLM_AGENT_ACTIONS and isinstance(item.get("action"), dict):
            nested = item.get("action") or {}
            for nested_name, nested_payload in nested.items():
                nested_action = _canvas_normalize_vlm_action_name(nested_name)
                if nested_action in VLM_AGENT_ACTIONS and isinstance(nested_payload, dict):
                    item = dict(nested_payload)
                    item["action"] = nested_action
                    action = nested_action
                    break
        if action not in VLM_AGENT_ACTIONS:
            return
        clean = {"action": action}
        for dict_key in ("subject_counts", "subject_count", "subjects"):
            value = item.get(dict_key)
            if isinstance(value, dict):
                clean["subject_counts"] = dict(value)
                break
        prompt_intent = item.get("prompt_intent")
        if isinstance(prompt_intent, dict):
            clean["prompt_intent"] = dict(prompt_intent)
        for key in VLM_AGENT_PROMPT_ENRICHMENT_KEYS:
            value = item.get(key)
            if value is None:
                continue
            clean.setdefault("prompt_intent", {})
            clean["prompt_intent"].setdefault(key, value)
        for key in (
            "target_node_id", "node_id", "run_id", "summary", "reason", "message", "confidence",
            "prompt", "prompt_text", "draft_prompt", "user_prompt", "image_prompt",
            "positive_prompt", "positivePrompt", "positive", "recommended_prompt", "final_prompt",
            "negative_prompt", "negativePrompt", "negative", "negative_image_prompt",
            "preset", "tool", "title",
            "aspect_ratio", "aspectRatio", "aspect", "ratio", "orientation", "resolution", "size", "width", "height",
            "resolution_scale", "scale", "upscale",
            "image_number", "images", "count", "batch_size",
            "seed", "image_seed", "seed_random", "random_seed", "randomize_seed",
            "steps", "scene_steps", "cfg_scale", "guidance_scale", "cfg", "guidance",
            "_salvaged_malformed_json",
        ):
            if key in item and item.get(key) is not None:
                if key in VLM_AGENT_PROMPT_TEXT_KEYS:
                    prompt_text = _canvas_prompt_text_from_value(item.get(key))
                    if not prompt_text:
                        continue
                    clean_key = "prompt" if key in {"prompt_text", "positive_prompt", "positivePrompt", "positive"} else key
                    clean[clean_key] = prompt_text[:1800]
                else:
                    clean[key] = str(item.get(key))[:500]
        if action in ("generate_image", "text_to_image", "edit_image", "outpaint_image", "replace_image") and not _canvas_action_prompt_text(clean):
            structured_prompt = _canvas_prompt_text_from_structured_payload(item)
            if structured_prompt:
                clean["prompt"] = structured_prompt[:1800]
                clean.setdefault("draft_prompt", structured_prompt[:1800])
                clean["_structured_prompt_payload_salvaged"] = "true"
        actions.append(clean)

    for index, char in enumerate(source):
        if char not in "[{":
            continue
        try:
            parsed, _ = decoder.raw_decode(source[index:])
        except Exception:
            continue
        if isinstance(parsed, list):
            for item in parsed:
                add_action(item)
        elif isinstance(parsed, dict):
            if isinstance(parsed.get("actions"), list):
                for item in parsed.get("actions"):
                    add_action(item)
            else:
                add_action(parsed)
        if len(actions) >= 6:
            break
    if not actions:
        bracket_action_pattern = re.compile(
            r"\[\s*(generate_image|text_to_image|edit_image|outpaint_image|erase_image|replace_image|upscale_image)\s*[:：]\s*(\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*'|[^\]]+?)\s*\]",
            re.I | re.S,
        )
        for match in bracket_action_pattern.finditer(source):
            action = _canvas_normalize_vlm_action_name(match.group(1))
            prompt_text = str(match.group(2) or "").strip()
            if len(prompt_text) >= 2 and prompt_text[0] == prompt_text[-1] and prompt_text[0] in {'"', "'"}:
                if prompt_text[0] == '"':
                    try:
                        prompt_text = json.loads(prompt_text)
                    except Exception:
                        prompt_text = prompt_text[1:-1]
                else:
                    prompt_text = prompt_text[1:-1]
            prompt_text = str(prompt_text or "").strip()
            if action in VLM_AGENT_ACTIONS and prompt_text:
                add_action({
                    "action": action,
                    "prompt": prompt_text,
                    "summary": "Create an image from this request after confirmation.",
                })
            if len(actions) >= 6:
                break
    if not actions:
        markdown_action_match = re.search(
            r"(?im)^\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:action|action_type|tool|tool_name)\s*(?:\*\*)?\s*[:：]\s*`?([a-zA-Z_ -]+)`?\s*$",
            source,
        )
        markdown_prompt_match = re.search(
            r"(?ims)^\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:prompt|prompt_text|image_prompt|final_prompt|draft_prompt)\s*(?:\*\*)?\s*[:：]\s*(.+?)(?=^\s*(?:[-*]\s*)?(?:\*\*)?\s*(?:negative_prompt|summary|reason|confidence|action|action_type|tool|tool_name)\s*(?:\*\*)?\s*[:：]|\Z)",
            source,
        )
        if markdown_action_match and markdown_prompt_match:
            action = _canvas_normalize_vlm_action_name(markdown_action_match.group(1))
            if action in VLM_AGENT_ACTIONS:
                prompt_text = str(markdown_prompt_match.group(1) or "").strip()
                if prompt_text:
                    add_action({
                        "action": action,
                        "prompt": prompt_text,
                        "summary": "Create an image from this request after confirmation.",
                    })
    if not actions:
        action_match = re.search(
            r"(?im)^\s*(?:action|action_type|tool|tool_name)\s*[:：]\s*([a-zA-Z_ -]+)\s*$",
            source,
        )
        prompt_match = re.search(
            r"(?ims)^\s*(?:prompt|prompt_text|image_prompt|final_prompt|draft_prompt)\s*[:：]\s*(.+?)(?=^\s*(?:negative_prompt|summary|reason|confidence|action|action_type|tool|tool_name)\s*[:：]|\Z)",
            source,
        )
        if action_match and prompt_match:
            action = _canvas_normalize_vlm_action_name(action_match.group(1))
            if action in VLM_AGENT_ACTIONS:
                prompt_text = str(prompt_match.group(1) or "").strip()
                if prompt_text:
                    add_action({
                        "action": action,
                        "prompt": prompt_text,
                        "summary": "Create an image from this request after confirmation.",
                    })
    if not actions:
        action_match = re.search(r'"(?:action|type|action_type|actionType|tool_name|toolName|tool)"\s*:\s*"([a-zA-Z_ -]+)"', source, re.I)
        prompt_match = re.search(
            r'"(?:prompt|prompt_text|image_prompt|recommended_prompt|final_prompt|draft_prompt|text)"\s*:\s*("(?:(?:\\.|[^"\\])*)")',
            source,
            re.I | re.S,
        )
        if action_match and prompt_match:
            action = _canvas_normalize_vlm_action_name(action_match.group(1))
            if action in VLM_AGENT_ACTIONS:
                prompt_literal = str(prompt_match.group(1) or "")
                try:
                    prompt_text = str(json.loads(prompt_literal) or "")
                except Exception:
                    prompt_text = prompt_literal[1:-1]
                prompt_text = str(prompt_text or "").strip()
                if prompt_text:
                    add_action({
                        "action": action,
                        "prompt": prompt_text,
                        "draft_prompt": prompt_text,
                        "summary": "Create an image from this request after confirmation.",
                        "_salvaged_malformed_json": "true",
                    })
    if not actions:
        fenced_prompt_pattern = re.compile(r"```(?:text|prompt|natural-language|natural_language)?\s*\n([\s\S]*?)```", re.I)
        for match in fenced_prompt_pattern.finditer(source):
            prompt_text = str(match.group(1) or "").strip()
            if not prompt_text or prompt_text[0:1] in {"{", "["}:
                continue
            prompt_text = re.sub(r"^\s*(?:prompt|positive prompt|image prompt)\s*[:：]\s*", "", prompt_text, flags=re.I).strip()
            if len(prompt_text) < 40:
                continue
            add_action({
                "action": "generate_image",
                "prompt": prompt_text,
                "draft_prompt": prompt_text,
                "summary": "Create an image from this salvaged prompt block after confirmation.",
                "_salvaged_malformed_json": "true",
            })
            if actions:
                break
    if actions:
        source_structured_prompt = ""
        for item in actions:
            if item.get("action") not in ("generate_image", "text_to_image", "edit_image", "outpaint_image", "replace_image"):
                continue
            if _canvas_action_prompt_text(item):
                continue
            if not source_structured_prompt:
                source_structured_prompt = _canvas_prompt_text_from_structured_payload_source(source)
            if source_structured_prompt:
                item["prompt"] = source_structured_prompt[:1800]
                item.setdefault("draft_prompt", source_structured_prompt[:1800])
                item["_structured_prompt_payload_salvaged"] = "true"
    deduped = []
    seen = set()
    for action in actions:
        key = (action.get("action"), action.get("target_node_id") or action.get("node_id"), action.get("summary"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(action)
    image_actions = [item for item in deduped if item.get("action") in ("generate_image", "text_to_image")]
    if len(image_actions) > 1:
        first = dict(image_actions[0])
        counts = []
        for item in image_actions:
            for key in ("image_number", "images", "count", "batch_size"):
                try:
                    value = int(float(str(item.get(key) or "").strip()))
                except Exception:
                    continue
                if value > 0:
                    counts.append(value)
        first["image_number"] = str(max(counts) if counts else len(image_actions))
        merged = []
        inserted = False
        for item in deduped:
            if item in image_actions:
                if not inserted:
                    merged.append(first)
                    inserted = True
                continue
            merged.append(item)
        deduped = merged
    return deduped[:6]


_canvas_repair_sdxl_named_character_prompt = canvas_danbooru_preflight.repair_sdxl_named_character_prompt


def _canvas_adult_character_block_review(effective_prompt, resolution=None):
    try:
        composed = canvas_vlm_prompt_pipeline.compose_sdxl_named_character_prompt(
            effective_prompt,
            "",
            resolution=resolution,
        )
    except Exception:
        return None
    if not (composed.get("adult") and composed.get("state") == "blocked"):
        return None
    blocked_tags = [
        str(tag or "").strip()
        for tag in (composed.get("blocked_tags") or [])
        if str(tag or "").strip()
    ]
    return {
        "schema_version": 1,
        "state": "reject",
        "score": 0,
        "intent_alignment": 0,
        "tag_validity": 0,
        "conflict_check": 100,
        "subject_integrity": 0,
        "safety_policy": 0,
        "prompt_readiness": 0,
        "issues": [{
            "code": "adult_character_blocked",
            "message": "Adult generation was blocked for a protected/minor-coded character.",
            "tags": blocked_tags,
        }],
        "changes": [],
        "fixes": [],
        "enrichments": [],
        "warn_only": False,
        "hard_block_reason": "adult_character_blocked",
        "original_prompt": "",
        "final_prompt": "",
        "needs_user_confirmation": False,
        "bypassable": False,
        "source": "deterministic_safety",
    }


def _canvas_user_requested_negative_prompt(*texts):
    return any(VLM_AGENT_EXPLICIT_NEGATIVE_PATTERN.search(str(text or "")) for text in texts)


def _canvas_strip_unrequested_negative_prompts(actions, *intent_texts):
    if _canvas_user_requested_negative_prompt(*intent_texts):
        return actions
    cleaned = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            cleaned.append(action)
            continue
        item = dict(action)
        for key in VLM_AGENT_NEGATIVE_PROMPT_KEYS:
            if key in item:
                item.pop(key, None)
                changed = True
        cleaned.append(item)
    return cleaned if changed else actions


def _canvas_natural_prompt_language(target_key, *texts):
    key = str(target_key or "").strip().lower()
    family = _canvas_vlm_prompt_rewrite_target_family(key)
    if family in {"flux", "natural_en"}:
        return "en"
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if re.search(r"[\u3400-\u9fff]", combined):
        return "zh"
    if "krea" in key:
        return "en"
    if family in {"wan", "qwen", "natural_zh"} or key.endswith("_cn"):
        return "zh"
    return "en"


def _canvas_natural_positive_has_negation(text):
    return bool(VLM_NATURAL_POSITIVE_NEGATION_PATTERN.search(str(text or "")))


def _canvas_add_unique_text(target, values):
    seen = {str(item or "").strip().lower() for item in target if str(item or "").strip()}
    for value in values or ():
        text = str(value or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        target.append(text)


def _canvas_extract_natural_negative_concepts(text):
    source = str(text or "").strip()
    if not source:
        return []
    concepts = []
    chunks = [
        chunk.strip()
        for chunk in re.split(r"[,，。.;；!?！？\n]+", source)
        if chunk and chunk.strip()
    ]
    for chunk in chunks:
        if not _canvas_natural_positive_has_negation(chunk):
            continue
        if re.search(r"\bnot\s+only\b", chunk, re.I):
            continue
        clean = VLM_NATURAL_POSITIVE_NEGATION_PATTERN.sub(" ", chunk)
        clean = re.sub(
            r"(?:\u8bf7|\u8acb|\u8981|\u5e0c\u671b|\u753b|\u756b|\u751f\u6210|\u51fa\u73b0|\u52a0\u5165|\u6dfb\u52a0|\u653e\u5165|"
            r"\bplease\b|\bpls\b|\bdraw\b|\bmake\b|\bgenerate\b|\bcreate\b|\bshow(?:ing)?\b|\badd\b|\binclude\b|\bwith\b|\bbe\b)",
            " ",
            clean,
            flags=re.I,
        )
        clean = re.sub(r"\s+", " ", clean).strip(" \t\r\n,，.。;；:：-_/")
        if not clean or len(clean) > 80:
            continue
        if re.fullmatch(r"(?:and|or|the|a|an|\u7684|\u4e00\u4e2a|\u4e00\u500b)", clean, re.I):
            continue
        _canvas_add_unique_text(concepts, [clean])
    return concepts


def _canvas_natural_negative_constraint_info(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    info = {
        "codes": [],
        "negative_terms": [],
        "positive_zh": [],
        "positive_en": [],
        "has_negation": False,
    }
    if not combined:
        return info
    info["has_negation"] = _canvas_natural_positive_has_negation(combined)
    generic_source = combined
    for rule in VLM_NATURAL_NEGATIVE_CONSTRAINT_RULES:
        pattern = rule.get("pattern")
        if not pattern or not pattern.search(combined):
            continue
        generic_source = pattern.sub(" ", generic_source)
        _canvas_add_unique_text(info["codes"], [rule.get("code")])
        _canvas_add_unique_text(info["negative_terms"], rule.get("negative_terms") or ())
        _canvas_add_unique_text(info["positive_zh"], rule.get("positive_zh") or ())
        _canvas_add_unique_text(info["positive_en"], rule.get("positive_en") or ())
    _canvas_add_unique_text(info["negative_terms"], _canvas_extract_natural_negative_concepts(generic_source))
    return info


def _canvas_remove_natural_negation_clauses(text):
    source = str(text or "").strip()
    if not source:
        return ""
    cleaned = source
    for rule in VLM_NATURAL_NEGATIVE_CONSTRAINT_RULES:
        pattern = rule.get("pattern")
        if pattern:
            cleaned = pattern.sub(" ", cleaned)
    if not _canvas_natural_positive_has_negation(cleaned):
        return cleaned
    parts = re.split(r"([,，。.;；!?！？\n]+)", cleaned)
    kept = []
    index = 0
    while index < len(parts):
        clause = parts[index]
        sep = parts[index + 1] if index + 1 < len(parts) else ""
        if clause and _canvas_natural_positive_has_negation(clause):
            index += 2
            continue
        kept.append(clause)
        if sep:
            kept.append(sep)
        index += 2
    return "".join(kept)


def _canvas_remove_natural_negative_conflicts(text, source_constraints):
    source = str(text or "").strip()
    if not source or not isinstance(source_constraints, dict):
        return source
    if "no_people" not in set(source_constraints.get("codes") or ()):
        return source
    people_pattern = re.compile(
        r"(?:\b(?:people|persons?|humans?|human\s+figures?|figures?|silhouettes?|girls?|boys?|women|men|characters?)\b|"
        r"\u4eba\u7269|\u4eba\u50cf|\u4eba\u5f71|\u4eba\u7fa4|\u8def\u4eba|\u8eab\u5f71|\u5b64\u72ec\u7684\u8eab|\u5c11\u5973|\u5973\u5b69|\u5973\u5b50|\u7f8e\u5973|\u7537\u5b50|\u7537\u5b69|"
        r"\u4e00\u4f4d|\u4e00\u4e2a|\u4e00\u540d|\u4e00\u4eba)",
        re.I,
    )
    parts = re.split(r"([。.!?！？；;\n]+)", source)
    kept = []
    index = 0
    while index < len(parts):
        clause = parts[index]
        sep = parts[index + 1] if index + 1 < len(parts) else ""
        if clause and people_pattern.search(clause):
            index += 2
            continue
        kept.append(clause)
        if sep:
            kept.append(sep)
        index += 2
    return "".join(kept).strip()


def _canvas_strip_natural_prompt_scaffolding(text):
    value = str(text or "").strip()
    if not value:
        return ""
    value = re.sub(r"```(?:text|prompt|natural-language|natural_language)?", "\n", value, flags=re.I)
    value = value.replace("```", "\n")
    value = re.sub(r"`([^`]{1,240})`", r"\1", value)
    value = re.sub(
        r"(?im)^\s*(?:negative\s*prompt|negative_prompt|negative|--neg|\u53cd\u5411\u63d0\u793a|\u8d1f\u5411\u63d0\u793a|\u8d1f\u9762\u63d0\u793a)\s*[:：=].*$",
        " ",
        value,
    )
    value = re.sub(
        r"(?im)^\s*(?:parameters?|params?|generation\s*settings?|settings?|metadata|\u53c2\u6570|\u53c3\u6578|\u751f\u6210\u53c2\u6570|\u751f\u6210\u53c3\u6578)\s*[:：=].*$",
        " ",
        value,
    )
    value = VLM_NATURAL_INLINE_GENERATION_CONTROL_PATTERN.sub(" ", value)
    value = VLM_NATURAL_PROMPT_SCAFFOLD_LABEL_PATTERN.sub(" ", value)
    value = re.sub(r"(?m)^\s*(?:[-*]+|\d{1,2}[.)、．]|[一二三四五六七八九十]+[、.．])\s*", "", value)
    value = re.sub(
        r"\b([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9][A-Za-z0-9]*)+)_?\(([^)]{1,80})\)",
        lambda match: match.group(1).replace("_", " ") + " (" + match.group(2).replace("_", " ") + ")",
        value,
    )
    value = re.sub(r"\b([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9][A-Za-z0-9]*){1,5})\b", lambda match: match.group(1).replace("_", " "), value)
    return value.strip()


def _canvas_cleanup_natural_prompt_text(text):
    value = str(text or "").strip()
    if not value:
        return ""
    value = re.sub(r"\s+", " ", value)
    value = re.sub(r"\s*([，。；！？])\s*", r"\1", value)
    value = re.sub(r"\s*([,.;!?])\s*", r"\1 ", value)
    if re.search(r"[\u3400-\u9fff]", value):
        value = re.sub(r"\s*,\s*", "，", value)
        value = re.sub(r"，[，\s]*", "，", value)
    else:
        value = re.sub(r"(?:,\s*){2,}", ", ", value)
    value = re.sub(r"(?:[。.;；]\s*){2,}", "。", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" \t\r\n,，.。;；:：-")


def _canvas_natural_default_positive_prompt(target_key, *texts):
    lang = _canvas_natural_prompt_language(target_key, *texts)
    return "\u6e05\u6670\u5b8c\u6574\u7684\u753b\u9762" if lang == "zh" else "a clear, well-composed image"


def _canvas_natural_positive_replacements(info, target_key, current_text):
    if not isinstance(info, dict):
        return []
    lang = _canvas_natural_prompt_language(target_key, current_text)
    candidates = list(info.get("positive_en") or ()) if lang == "en" else list(info.get("positive_zh") or ())
    if not candidates:
        return []
    text = str(current_text or "")
    output = []
    for candidate in candidates:
        term = str(candidate or "").strip()
        if not term:
            continue
        if term in text:
            continue
        if "full_body" in (info.get("codes") or ()) and _canvas_prompt_has_upper_focus(text):
            if term in {"upper-body portrait framing", "\u534a\u8eab\u6216\u8fd1\u666f\u6784\u56fe"}:
                continue
        output.append(term)
    return output


def _canvas_join_natural_prompt_parts(base, additions, target_key):
    text = str(base or "").strip()
    extras = [str(item or "").strip() for item in additions or () if str(item or "").strip()]
    if not extras:
        return text
    lang = _canvas_natural_prompt_language(target_key, text, " ".join(extras))
    if not text:
        return ("，" if lang == "zh" else ", ").join(extras)
    text = text.rstrip(" \t\r\n,，.。;；")
    sep = "，" if lang == "zh" else ", "
    return text + sep + sep.join(extras)


def _canvas_sanitize_natural_positive_prompt_text(text, target_key, source_constraints):
    source = str(text or "").strip()
    if not source:
        return ""
    structured = _canvas_positive_prompt_from_structured_text(source)
    if structured:
        source = structured
    source = _canvas_strip_natural_prompt_scaffolding(source)
    cleaned = _canvas_remove_natural_negation_clauses(source)
    cleaned = _canvas_remove_natural_negative_conflicts(cleaned, source_constraints)
    cleaned = _canvas_cleanup_natural_prompt_text(cleaned)
    additions = _canvas_natural_positive_replacements(source_constraints, target_key, cleaned)
    cleaned = _canvas_join_natural_prompt_parts(cleaned, additions, target_key)
    cleaned = _canvas_cleanup_natural_prompt_text(cleaned)
    if not cleaned:
        cleaned = _canvas_natural_default_positive_prompt(target_key, text)
    if len(cleaned) > 2200:
        cleaned = cleaned[:2200].rstrip(" \t\r\n,，.。;；")
    return cleaned


def _canvas_clean_negative_prompt_concepts(*texts):
    concepts = []
    for value in texts or ():
        source = str(value or "").strip()
        if not source:
            continue
        source = re.sub(r"^\s*(?:negative\s*prompt|negative_prompt|negative|--neg|\u53cd\u5411\u63d0\u793a|\u8d1f\u5411\u63d0\u793a)\s*[:：=]\s*", "", source, flags=re.I)
        for part in re.split(r"[,，;；\n]+", source):
            term = part.strip(" \t\r\n.。:：-")
            if not term:
                continue
            if _canvas_natural_positive_has_negation(term):
                term = VLM_NATURAL_POSITIVE_NEGATION_PATTERN.sub(" ", term)
                term = re.sub(r"\s+", " ", term).strip(" \t\r\n,，.。;；:：-")
            if not term:
                continue
            _canvas_add_unique_text(concepts, [term])
    return concepts


def _canvas_merge_natural_negative_prompt(item, terms, extra_negative_prompt=""):
    if not isinstance(item, dict):
        return False
    merged = []
    for key in VLM_AGENT_NEGATIVE_PROMPT_KEYS:
        if key in item:
            _canvas_add_unique_text(merged, _canvas_clean_negative_prompt_concepts(item.get(key)))
            if key != "negative_prompt":
                item.pop(key, None)
    _canvas_add_unique_text(merged, _canvas_clean_negative_prompt_concepts(extra_negative_prompt))
    _canvas_add_unique_text(merged, _canvas_clean_negative_prompt_concepts(", ".join(str(term or "").strip() for term in terms or () if str(term or "").strip())))
    if not merged:
        return False
    value = ", ".join(merged)
    if item.get("negative_prompt") == value:
        return False
    item["negative_prompt"] = value
    return True


def _canvas_note_natural_negation_guard(item, changed_fields, negative_terms):
    if not isinstance(item, dict):
        return
    review = copy.deepcopy(item.get("prompt_review")) if isinstance(item.get("prompt_review"), dict) else {}
    issues = list(review.get("issues") or [])
    changes = list(review.get("changes") or [])
    if changed_fields:
        issues.append({
            "code": "natural_positive_negation_removed",
            "message": "Removed negative wording from natural positive prompt fields before text encoding.",
        })
        changes.append("moved natural-language negative constraints out of positive prompt")
    if negative_terms:
        changes.append("merged explicit negative constraints into negative_prompt")
    state = str(review.get("state") or "").strip().lower()
    if (changed_fields or negative_terms) and state in {"", "pass"}:
        state = "fixed"
    elif not state:
        state = "fixed"
    review.update({
        "schema_version": review.get("schema_version") or 1,
        "state": state,
        "score": review.get("score") or 90,
        "issues": issues[:12],
        "changes": [str(change or "").strip()[:500] for change in changes if str(change or "").strip()][:12],
        "original_prompt": review.get("original_prompt") or item.get("llm_draft_prompt_raw") or "",
        "final_prompt": _canvas_action_prompt_text(item),
        "needs_user_confirmation": bool(review.get("needs_user_confirmation")) if "needs_user_confirmation" in review else False,
        "source": review.get("source") or "deterministic_natural_positive_guard",
    })
    item["prompt_review"] = review


def _canvas_apply_natural_positive_negation_guard(action, effective_prompt, prompt, target_key, extra_negative_prompt=""):
    if not isinstance(action, dict):
        return action, False
    name = _canvas_normalize_vlm_action_name(action.get("action") or action.get("type") or "")
    if name not in {"generate_image", "text_to_image"}:
        return action, False
    item = dict(action)
    source_constraints = _canvas_natural_negative_constraint_info(effective_prompt, prompt)
    changed = False
    changed_fields = []
    for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt", "draft_prompt"):
        if key not in item:
            continue
        original = str(item.get(key) or "").strip()
        if not original:
            continue
        sanitized = _canvas_sanitize_natural_positive_prompt_text(original, target_key, source_constraints)
        if sanitized and sanitized != original:
            if key == "draft_prompt" and not item.get("llm_draft_prompt_raw"):
                item["llm_draft_prompt_raw"] = original[:1200]
            item[key] = sanitized
            changed = True
            changed_fields.append(key)
    allow_negative_prompt = bool(
        source_constraints.get("negative_terms")
        or _canvas_user_requested_negative_prompt(effective_prompt, prompt)
    )
    negative_changed = False
    if allow_negative_prompt:
        negative_changed = _canvas_merge_natural_negative_prompt(
            item,
            source_constraints.get("negative_terms") or (),
            extra_negative_prompt=extra_negative_prompt,
        )
        changed = changed or negative_changed
    if changed:
        item["_natural_positive_negation_guard"] = "true"
        _canvas_note_natural_negation_guard(
            item,
            changed_fields,
            source_constraints.get("negative_terms") if negative_changed else (),
        )
    return item, changed


def _canvas_apply_natural_positive_negation_guard_actions(actions, effective_prompt, prompt, target_key):
    cleaned = []
    changed = False
    for action in actions or []:
        item, item_changed = _canvas_apply_natural_positive_negation_guard(action, effective_prompt, prompt, target_key)
        cleaned.append(item)
        changed = changed or item_changed
    return cleaned if changed else actions


def _canvas_requested_image_count(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if not combined:
        return None
    digit_match = VLM_AGENT_IMAGE_COUNT_DIGIT_PATTERN.search(combined)
    if digit_match:
        try:
            return max(1, min(int(digit_match.group(1)), 16))
        except Exception:
            return None
    cn_match = VLM_AGENT_IMAGE_COUNT_CN_PATTERN.search(combined)
    if cn_match:
        value = VLM_AGENT_IMAGE_COUNT_CN_DIGITS.get(cn_match.group(1))
        if value:
            return max(1, min(int(value), 16))
    return None


def _canvas_requested_aspect_ratio(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if not combined:
        return None
    match = VLM_AGENT_ASPECT_RATIO_PATTERN.search(combined)
    if match:
        try:
            width = max(1, min(int(match.group(1)), 64))
            height = max(1, min(int(match.group(2)), 64))
        except Exception:
            return None
        return f"{width}:{height}"
    if VLM_AGENT_ASPECT_SQUARE_PATTERN.search(combined):
        return "1:1"
    if VLM_AGENT_ASPECT_LANDSCAPE_PATTERN.search(combined):
        return "16:9"
    if VLM_AGENT_ASPECT_PORTRAIT_PATTERN.search(combined):
        return "9:16"
    return None


def _canvas_requested_pixel_size(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if not combined:
        return None
    match = VLM_AGENT_PIXEL_SIZE_PATTERN.search(combined)
    if not match:
        return None
    try:
        width = max(64, min(int(match.group(1)), 8192))
        height = max(64, min(int(match.group(2)), 8192))
    except Exception:
        return None
    return width, height


def _canvas_normalize_image_count_controls(actions, *intent_texts):
    requested_count = _canvas_requested_image_count(*intent_texts)
    cleaned = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            cleaned.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            cleaned.append(item)
            continue
        if requested_count and requested_count > 1:
            item["image_number"] = str(requested_count)
            for key in ("images", "count", "batch_size"):
                if key in item:
                    item.pop(key, None)
                    changed = True
            changed = True
        else:
            for key in VLM_AGENT_IMAGE_COUNT_KEYS:
                if key in item:
                    item.pop(key, None)
                    changed = True
        cleaned.append(item)
    return cleaned if changed else actions


def _canvas_normalize_aspect_ratio_controls(actions, *intent_texts):
    requested_aspect = _canvas_requested_aspect_ratio(*intent_texts)
    cleaned = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            cleaned.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            cleaned.append(item)
            continue
        if requested_aspect:
            if item.get("aspect_ratio") != requested_aspect:
                item["aspect_ratio"] = requested_aspect
                changed = True
            for key in VLM_AGENT_ASPECT_RATIO_KEYS:
                if key != "aspect_ratio" and key in item:
                    item.pop(key, None)
                    changed = True
        else:
            for key in VLM_AGENT_ASPECT_RATIO_KEYS:
                if key in item:
                    item.pop(key, None)
                    changed = True
        cleaned.append(item)
    return cleaned if changed else actions


def _canvas_strip_unrequested_generation_controls(actions, *intent_texts):
    requested_size = _canvas_requested_pixel_size(*intent_texts)
    cleaned = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            cleaned.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            cleaned.append(item)
            continue
        for key in VLM_AGENT_UNREQUESTED_GENERATION_CONTROL_KEYS:
            if key in item:
                item.pop(key, None)
                changed = True
        if requested_size:
            width, height = requested_size
            if str(item.get("width") or "") != str(width):
                item["width"] = str(width)
                changed = True
            if str(item.get("height") or "") != str(height):
                item["height"] = str(height)
                changed = True
            for key in ("resolution", "size"):
                if key in item:
                    item.pop(key, None)
                    changed = True
        else:
            for key in VLM_AGENT_PIXEL_SIZE_KEYS:
                if key in item:
                    item.pop(key, None)
                    changed = True
        cleaned.append(item)
    return cleaned if changed else actions


def _canvas_user_requested_green_blood(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    return bool(re.search(r"(?:green\s*blood|\u7eff\u8840|\u7eff\u8272\u8840|\u7eff\u8272\u8840\u6db2|\u8840\u6db2.{0,8}\u7eff)", combined, re.I))


def _canvas_user_negative_tag_locks(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if not combined:
        return set()
    blocked = set()
    negative_rules = (
        (r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,10}(?:\u900f\u660e\u80cc\u666f|\u900f\u660e\u5e95|\btransparent\s+background\b|\bno\s+background\b)", {"transparent_background"}),
        (r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,10}(?:\u5168\u8eab|\bfull[-_\s]?body\b)", {"full_body"}),
        (r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,10}(?:\u88f8|\u88f8\u4f53|\u8d64\u88f8|\bnude\b|\bnaked\b)", {"nude", "naked"}),
        (r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,10}(?:\u6027|\u6027\u7231|\u6027\u4ea4|\bsex\b|\bexplicit\b)", {"sex", "penetration", "mating_press", "fellatio", "handjob", "paizuri", "anal"}),
        (r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,10}(?:\u732b\u8033|\u732b\u5a18|\bcat[-_\s]?ears?\b|\bcat[-_\s]?girls?\b|\bcatgirls?\b|\bnekomimi\b)", {"cat_ears", "catgirl", "cat_girl", "animal_ears"}),
    )
    for pattern, tags in negative_rules:
        if re.search(pattern, combined, re.I):
            blocked.update(tags)
    return blocked


def _canvas_prompt_has_upper_focus(text):
    return bool(re.search(r"\u534a\u8eab|\u4e0a\u534a\u8eab|\u8096\u50cf|\u5934\u50cf|\u8fd1\u666f|\u7279\u5199|\bupper[-_\s]?body\b|\bportrait\b|\bclose[-_\s]?up\b", str(text or ""), re.I))


def _canvas_prompt_has_full_body_request(text):
    return bool(re.search(r"\u5168\u8eab|\bfull[-_\s]?body\b", str(text or ""), re.I))


def _canvas_prompt_has_adult_specific_position(text):
    return bool(re.search(r"\u6388\u7cbe\u4f53\u4f4d|\u6388\u7cbe\u9ad4\u4f4d|\u4ea4\u914d\u6309\u538b|(?<![a-z0-9_])mating[_\s-]*press(?![a-z0-9_])|\bmissionary\b|\bdoggystyle\b|\bcowgirl\b|\bfull[_\s-]*nelson\b", str(text or ""), re.I))


def _canvas_prompt_has_facial_cum_intent(text):
    return bool(re.search(r"\u989c\u5c04|\u984f\u5c04|\u5c04\u6ee1\u8138|\u5c04\u6eff\u81c9|\u5c04\u5728(?:\u8138|\u81c9)\u4e0a|\bfacial\b|\bbukkake\b|\bcum\s+on\s+face\b", str(text or ""), re.I))


def _canvas_prompt_requests_nudity(text):
    source = str(text or "")
    if not source.strip():
        return False
    positive_source = re.sub(
        r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,12}(?:\u88f8|\u88f8\u4f53|\u8d64\u88f8|\bnude\b|\bnaked\b|\u9732\u70b9|\u9732\u9ede|\btopless\b)",
        "",
        source,
        flags=re.I,
    )
    return bool(re.search(r"\u88f8|\u88f8\u4f53|\u8d64\u88f8|\u5168\u88f8|\bnude\b|\bnaked\b|\u9732\u70b9|\u9732\u9ede|\btopless\b", positive_source, re.I))


def _canvas_prompt_allows_explicit_adult(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    if not combined:
        return False
    positive_source = re.sub(
        r"(?:\u4e0d\u8981|\u522b|\u5225|不要|别|no|without).{0,12}(?:\u88f8|\u88f8\u4f53|\u8d64\u88f8|\bnude\b|\bnaked\b|\u6027|\u6027\u7231|\u6027\u4ea4|\bsex\b|\bexplicit\b)",
        "",
        combined,
        flags=re.I,
    )
    try:
        return bool(canvas_vlm_prompt_pipeline.detect_adult_intent(positive_source, "").get("is_adult"))
    except Exception:
        return bool(re.search(r"\br-?18\b|\bnsfw\b|\bnude\b|\bsex\b|口交|性交|做爱|做愛|裸体|裸", positive_source, re.I))


def _canvas_blocked_prompt_tags_for_intent(*texts):
    combined = "\n".join(str(text or "") for text in texts if str(text or "").strip())
    current_prompt = str(texts[-1] or "") if texts else ""
    blocked = set()
    if not _canvas_user_requested_green_blood(*texts):
        blocked.add("green_blood")
    blocked.update(_canvas_user_negative_tag_locks(*texts))
    if not _canvas_prompt_allows_explicit_adult(*texts):
        blocked.update(VLM_AGENT_SFW_BLOCKED_ADULT_TAGS)
    if _canvas_prompt_has_upper_focus(combined) and not _canvas_prompt_has_full_body_request(current_prompt):
        blocked.add("full_body")
    if _canvas_prompt_has_adult_specific_position(combined) and not _canvas_prompt_has_full_body_request(current_prompt):
        blocked.add("full_body")
    if _canvas_prompt_has_facial_cum_intent(combined) and not _canvas_prompt_requests_nudity(combined):
        blocked.update({"nude", "naked", "completely_nude", "fully_nude", "topless", "nipples", "bare_breasts", "breasts_out"})
    if _canvas_vlm_persona_image_subject_intent(combined):
        blocked.add("no_humans")
    if re.search(r"\u81ea\u62cd|\bselfie\b|\bself[-_\s]?shot\b", combined, re.I):
        blocked.update({"camera", "holding_camera", "taking_picture"})
    return blocked


def _canvas_action_prompt_text(action):
    if not isinstance(action, dict):
        return ""
    for key in (
        "prompt",
        "prompt_text",
        "image_prompt",
        "positive_prompt",
        "positivePrompt",
        "positive",
        "recommended_prompt",
        "final_prompt",
        "draft_prompt",
    ):
        value = _canvas_prompt_text_from_value(action.get(key))
        if value:
            return value
    return ""


def _canvas_action_draft_prompt(action):
    if not isinstance(action, dict):
        return ""
    value = _canvas_prompt_text_from_value(action.get("draft_prompt"))
    if value:
        return value
    return _canvas_action_prompt_text(action)


def _canvas_strip_prompt_meta_phrases(text):
    value = str(text or "").strip()
    if not value:
        return ""
    if re.fullmatch(
        r"(?:looking|facing|gazing|staring)\s+(?:at\s+)?another|looking_at_another|facing_another",
        value,
        re.I,
    ):
        return value
    value = re.sub(
        r"^\s*(?:\u597d\u7684|\u597d|ok|okay|got\s+it)\s*[:\uff1a,，\-]*\s*",
        "",
        value,
        flags=re.I,
    ).strip()
    value = re.sub(
        r"(?:\u518d\u6765\u4e00?\u5f20|\u518d\u4f86\u4e00?\u5f35|\u518d\u6765|\u518d\u4f86|"
        r"\u518d\u753b|\u518d\u756b|\u518d\u751f\u6210|\u518d\u51fa|\u7ee7\u7eed|\u7e7c\u7e8c|"
        r"\u540c\u6837|\u540c\u6b3e|\u4e0a\u4e00\u5f20|\u4e0a\u4e00\u5f35|\u53e6[一1]\u5f20|\u53e6[一1]\u5f35|"
        r"\banother(?:\s+one)?\b|\bagain\b|\bcontinue\b|\bsame\s+one\b)",
        "",
        value,
        flags=re.I,
    )
    return value.strip(" \t\r\n,，.。;；:-")


def _canvas_canonical_draft_tag_list(prompt_text, blocked_tags=None):
    structured_prompt = _canvas_positive_prompt_from_structured_text(str(prompt_text or "").strip())
    if structured_prompt:
        prompt_text = structured_prompt
    output = []
    seen = set()
    blocked = set(blocked_tags or ())
    for raw in str(prompt_text or "").split(","):
        text = str(raw or "").strip()
        if not text:
            continue
        if re.match(r"^(?:negative_prompt|negative|parameters|params|metadata|seed|steps|cfg|cfg_scale|width|height|sampler|scheduler)\s*[:=]", text, re.I):
            continue
        if re.match(r"^(?:prompt|positive_prompt|draft_prompt|final_prompt|recommended_prompt|image_prompt)\s*[:=]", text, re.I):
            text = re.sub(r"^(?:prompt|positive_prompt|draft_prompt|final_prompt|recommended_prompt|image_prompt)\s*[:=]\s*", "", text, flags=re.I).strip()
            if not text:
                continue
        weighted = re.fullmatch(r"\(([^:()]+):[0-9.]+\)", text)
        if weighted:
            text = weighted.group(1).strip()
        text = _canvas_strip_prompt_meta_phrases(text)
        if not text:
            continue
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(text)
        if not clean:
            continue
        if clean in VLM_AGENT_INVALID_PROMPT_TAGS or clean in VLM_AGENT_PROMPT_META_TAGS:
            continue
        if any(marker in clean for marker in ("negative_prompt", "positive_prompt", "cfg_scale", "guidance_scale")):
            continue
        if clean in blocked:
            continue
        if canvas_danbooru_service._canvas_is_forbidden_positive_tag(clean):
            continue
        key = clean.lower()
        if key not in seen:
            seen.add(key)
            output.append(clean)
    return ", ".join(output)


def _canvas_canonical_prompt_tags(prompt_text, blocked_tags=None):
    canonical = _canvas_canonical_draft_tag_list(prompt_text, blocked_tags=blocked_tags)
    return [tag for tag in canonical.split(", ") if tag]


def _canvas_merge_missing_prompt_tags(prompt_text, required_text="", blocked_tags=None, allowed_identity_tags=None, strip_unrequested_identities=False):
    base_tags = _canvas_canonical_prompt_tags(prompt_text, blocked_tags=blocked_tags)
    required_tags = _canvas_canonical_prompt_tags(required_text, blocked_tags=blocked_tags)
    if strip_unrequested_identities:
        base_tags = _canvas_filter_unrequested_identity_tags(base_tags, allowed_identity_tags)
        required_tags = _canvas_filter_unrequested_identity_tags(required_tags, allowed_identity_tags)
    if not base_tags or not required_tags:
        return ", ".join(base_tags) if strip_unrequested_identities and base_tags else prompt_text
    seen = {tag.lower() for tag in base_tags}
    changed = False
    for tag in required_tags:
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        base_tags.append(tag)
        changed = True
    return ", ".join(base_tags) if changed else prompt_text


def _canvas_sanitize_action_prompt_fields(actions, *intent_texts):
    blocked_tags = _canvas_blocked_prompt_tags_for_intent(*intent_texts)
    cleaned = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            cleaned.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            cleaned.append(item)
            continue
        for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt", "draft_prompt"):
            if key not in item:
                continue
            raw_original = item.get(key)
            raw = _canvas_prompt_text_from_value(raw_original)
            if not raw:
                item.pop(key, None)
                changed = True
                continue
            canonical = _canvas_canonical_draft_tag_list(raw, blocked_tags=blocked_tags)
            if canonical and canonical != raw:
                if key == "draft_prompt" and not item.get("llm_draft_prompt_raw"):
                    item["llm_draft_prompt_raw"] = str(raw_original or raw)[:1200]
                item[key] = canonical
                changed = True
            elif not canonical:
                item.pop(key, None)
                changed = True
        cleaned.append(item)
    return cleaned if changed else actions


def _canvas_escape_action_prompt_parenthetical_tags(actions):
    repaired = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            repaired.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            repaired.append(item)
            continue
        for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt", "draft_prompt"):
            if key not in item:
                continue
            raw = _canvas_prompt_text_from_value(item.get(key))
            if not raw:
                continue
            fixed = canvas_danbooru_service._canvas_prompt_safe_danbooru_text(raw)
            if fixed and fixed != raw:
                item[key] = fixed
                changed = True
        repaired.append(item)
    return repaired if changed else actions


CANVAS_DANBOORU_TARGET_KEYS = {"sdxl_danbooru", "danbooru", "illustrious", "noob", "pony", "animagine"}
CANVAS_ANIMA_TARGET_KEYS = {"anima", "anima_aio", "anima_danbooru"}
CANVAS_ANIMA_QUALITY_TAGS = ("masterpiece", "very_aesthetic", "best_quality")
CANVAS_ANIMA_RATING_TAGS = {"safe", "sensitive", "nsfw", "explicit"}
CANVAS_ANIMA_PERIOD_TAGS = {"newest", "recent", "mid", "early", "old"}
CANVAS_ANIMA_ARTIST_BLOCKLIST = {"@anima", "@anima_(togashi)", "@anima_\\(togashi\\)"}
CANVAS_NATURAL_PROMPT_TARGET_KEYS = {
    "krea2",
    "krea2_turbo",
    "qwen_natural",
    "flux_t5_en",
    "wan_video_cn",
    "natural_en",
    "natural_zh",
    "video_natural",
}


def _canvas_target_requires_danbooru(payload):
    return canvas_danbooru_preflight.payload_text_to_image_target_key(payload if isinstance(payload, dict) else {}) in CANVAS_DANBOORU_TARGET_KEYS


def _canvas_target_requires_anima(payload):
    data = payload if isinstance(payload, dict) else {}
    target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(data)
    try:
        target = _canvas_prompt_target_for_payload(data, target_key)
    except Exception:
        target = None
    return _canvas_is_anima_prompt_target_key(target_key, target)


def _canvas_is_anima_prompt_target_key(target_key, target=None):
    key = str(target_key or "").strip().lower()
    if key in CANVAS_ANIMA_TARGET_KEYS:
        return True
    data = target if isinstance(target, dict) else {}
    haystack = " ".join(
        str(data.get(item) or "")
        for item in ("key", "name", "label", "backend_engine", "task_method", "text_encoder", "prompt_format", "source")
    ).lower()
    model_list = data.get("model_list") if isinstance(data.get("model_list"), list) else []
    if model_list:
        haystack += " " + " ".join(str(item or "") for item in model_list[:12]).lower()
    if not haystack:
        haystack = key
    return bool(
        "anima_aio" in haystack
        or "anima-base" in haystack
        or re.search(r"(?:^|[\s,|/_-])anima(?:$|[\s,|/_-])", haystack)
    )


def _canvas_anima_add_tag(output, tag, *, allow_quality=True):
    clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
    if not clean:
        return False
    if clean in VLM_AGENT_INVALID_PROMPT_TAGS or clean in VLM_AGENT_PROMPT_META_TAGS:
        return False
    if not allow_quality and clean in CANVAS_ANIMA_QUALITY_TAGS:
        return False
    if clean in {"anima", "anima_aio", "anima-base", "anima_base"}:
        return False
    if clean.lower() in CANVAS_ANIMA_ARTIST_BLOCKLIST:
        return False
    if canvas_danbooru_service._canvas_is_forbidden_positive_tag(clean):
        return False
    if clean not in output:
        output.append(clean)
        return True
    return False


def _canvas_anima_text(*texts):
    return "\n".join(str(text or "") for text in texts if str(text or "").strip())


def _canvas_anima_rating_tag(*texts):
    combined = _canvas_anima_text(*texts).lower()
    if re.search(r"\b(?:explicit|nsfw|r18|18\+|adult)\b|露骨|成人|色情|性爱|性交", combined, re.I):
        return "explicit"
    if re.search(r"\b(?:sensitive|suggestive|sexy)\b|擦边|性感|挑逗", combined, re.I):
        return "sensitive"
    return "safe"


def _canvas_anima_period_tags(*texts):
    combined = _canvas_anima_text(*texts).lower()
    match = re.search(r"\b(?:year[_\s-]?)?((?:19|20)\d{2})\b", combined, re.I)
    if match:
        return [f"year_{match.group(1)}"]
    if re.search(r"\b(?:retro|vintage|old|classic|90s|80s|70s)\b|复古|怀旧|老番|旧画风", combined, re.I):
        return ["old"]
    if re.search(r"\b(?:early|mid)\b|早期|中期", combined, re.I):
        return ["early"]
    if re.search(r"\b(?:recent|modern|current)\b|现代|近年", combined, re.I):
        return ["recent"]
    return ["newest"]


@functools.lru_cache(maxsize=128)
def _canvas_anima_artist_tags_cached(combined_text):
    output = []
    source = str(combined_text or "")
    for match in re.finditer(r"(?<![\w@])@[a-z0-9][a-z0-9_]*(?:_\\?\([^)\n]{1,80}\\?\))?", source, re.I):
        _canvas_anima_add_tag(output, match.group(0))
        if len(output) >= 2:
            return tuple(output)

    lower_source = source.lower()
    artist_hint = bool(
        re.search(r"[a-z0-9_@-]{3,}\s*(?:画风|畫風|风格|風格)", source, re.I)
        or re.search(r"\b(?:by|artist|style\s+of|in\s+the\s+style\s+of)\s+[@a-z0-9_ -]{3,}", source, re.I)
    )
    style_word = re.search(r"\b([a-z0-9_@-]{3,})\s+style\b", source, re.I)
    if style_word and style_word.group(1).lower() not in {"anime", "manga", "realistic", "hybrid", "digital", "illustration", "anima"}:
        artist_hint = True
    if not artist_hint:
        return tuple(output)

    try:
        rows = canvas_danbooru_service._canvas_lookup_danbooru_tags(source, limit=32, source_mode="all")
    except Exception:
        rows = []
    for row in rows or []:
        if not isinstance(row, dict):
            continue
        tag = str(row.get("tag") or row.get("prompt_tag") or "").strip()
        category = str(row.get("category") or "").strip().lower()
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if not clean:
            continue
        if category != "artist" and not clean.startswith("@"):
            continue
        if clean.lower().startswith("@anima"):
            continue
        plain = re.sub(r"_\\?\([^)]*\\?\)$", "", clean.lstrip("@")).replace("_", " ").strip().lower()
        if plain and plain not in lower_source and plain.replace(" ", "_") not in lower_source:
            continue
        if not _canvas_anima_add_tag(output, clean):
            continue
        if len(output) >= 2:
            break
    return tuple(output)


def _canvas_anima_artist_tags(*texts, limit=1):
    combined = _canvas_anima_text(*texts)
    if not combined:
        return []
    output = list(_canvas_anima_artist_tags_cached(combined))
    return output[: max(0, int(limit or 1))]


def _canvas_anima_scene_tags(effective_prompt, locks=None, action_prompt=""):
    output = []
    lock_data = locks if isinstance(locks, dict) else {}
    for source in (
        lock_data.get("scene_tags") or [],
        lock_data.get("contract_soft_tags") or [],
        lock_data.get("required_prompt_tags") or [],
    ):
        for tag in source or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if not clean:
                continue
            if clean in CANVAS_ANIMA_RATING_TAGS or clean in CANVAS_ANIMA_PERIOD_TAGS:
                continue
            if clean in canvas_vlm_prompt_pipeline.SUBJECT_COUNT_TAGS or clean in {"solo", "no_humans", "multiple_others"}:
                continue
            if clean in (lock_data.get("character_tags") or []) or clean in (lock_data.get("copyright_tags") or []):
                continue
            _canvas_anima_add_tag(output, clean, allow_quality=False)

    combined = _canvas_anima_text(effective_prompt, action_prompt)

    def add_many(*tags):
        for tag in tags:
            _canvas_anima_add_tag(output, tag, allow_quality=False)

    if re.search(r"火焰|火光|火|燃烧|炎|flame|fire|pyro|burning", combined, re.I):
        add_many("fire", "flames", "pyrokinesis", "embers")
    if re.search(r"战斗|战场|对战|战斗构图|fight|fighting|battle|combat|battlefield", combined, re.I):
        add_many("battle", "fighting", "dynamic_pose", "battlefield")
    if re.search(r"史尔特尔|surtr", combined, re.I):
        add_many("sword", "holding_sword")
    if re.search(r"教室|课堂|classroom", combined, re.I):
        add_many("indoors", "classroom", "desk", "curtains")
    if re.search(r"窗边|窗户|窗|window", combined, re.I):
        add_many("window")
    if re.search(r"柔光|阳光|日光|光线|soft\s+light|soft_lighting|sunlight|window\s+light", combined, re.I):
        add_many("soft_lighting", "sunlight", "light_rays")
    if re.search(r"半身|上半身|头像|portrait|upper[_\s-]?body|bust", combined, re.I):
        add_many("upper_body", "portrait")
    elif re.search(r"全身|full[_\s-]?body", combined, re.I):
        add_many("full_body")
    if re.search(r"近景|特写|close[-_\s]?up", combined, re.I):
        add_many("close-up")

    add_many("sharp_focus", "looking_at_viewer")
    return output[:24]


def _canvas_anima_subject_counts(locks, prompt_text=""):
    data = locks if isinstance(locks, dict) else {}
    counts = _canvas_normalize_subject_counts(data.get("subject_counts"))
    if counts:
        return counts
    prompt_counts = _canvas_subject_counts_from_prompt(prompt_text)
    if prompt_counts and int(prompt_counts.get("total") or 0) > 0:
        return prompt_counts
    if data.get("character_tags"):
        return {"girls": 1, "boys": 0, "others": 0, "total": 1}
    return None


def _canvas_anima_count_tags_from_counts(counts):
    normalized = _canvas_normalize_subject_counts(counts)
    if not normalized:
        return []
    if int(normalized.get("total") or 0) <= 0:
        return ["no_humans"]
    output = _canvas_subject_count_tags_from_counts(normalized)
    if (
        int(normalized.get("total") or 0) == 1
        and int(normalized.get("others") or 0) == 0
        and int(normalized.get("girls") or 0) + int(normalized.get("boys") or 0) == 1
    ):
        output.append("solo")
    return list(dict.fromkeys(output))


def _canvas_anima_prompt_signal_tags(effective_prompt, locks=None, action_prompt=""):
    lock_data = locks if isinstance(locks, dict) else {}
    counts = _canvas_anima_subject_counts(lock_data, action_prompt)
    count_tags = _canvas_anima_count_tags_from_counts(counts)
    character_tags = []
    copyright_tags = []
    for tag in lock_data.get("character_tags") or []:
        _canvas_anima_add_tag(character_tags, tag, allow_quality=False)
    for tag in lock_data.get("copyright_tags") or []:
        _canvas_anima_add_tag(copyright_tags, tag, allow_quality=False)
    artist_tags = _canvas_anima_artist_tags(effective_prompt, action_prompt, limit=1)
    period_tags = _canvas_anima_period_tags(effective_prompt, action_prompt)
    rating_tag = _canvas_anima_rating_tag(effective_prompt, action_prompt)
    scene_tags = _canvas_anima_scene_tags(effective_prompt, lock_data, action_prompt)

    locked_tags = []
    for tag in list(period_tags) + [rating_tag] + count_tags + character_tags + copyright_tags + artist_tags:
        _canvas_anima_add_tag(locked_tags, tag)
    return {
        "quality_tags": list(CANVAS_ANIMA_QUALITY_TAGS),
        "period_tags": period_tags,
        "rating_tag": rating_tag,
        "count_tags": count_tags,
        "subject_counts": counts,
        "character_tags": character_tags,
        "copyright_tags": copyright_tags,
        "artist_tags": artist_tags,
        "scene_tags": scene_tags,
        "locked_tags": locked_tags,
    }


def _canvas_anima_natural_lines(effective_prompt, scene_tags):
    combined = str(effective_prompt or "")
    scene_set = set(scene_tags or [])
    lines = ["Keep her face sharp and readable"]
    if scene_set.intersection({"fire", "flames", "pyrokinesis", "embers"}) or re.search(r"火|flame|fire", combined, re.I):
        lines.append("Use strong orange firelight around her sword")
    if scene_set.intersection({"battle", "fighting", "battlefield", "dynamic_pose"}):
        lines.append("Use a dynamic battle composition")
    if scene_set.intersection({"classroom", "window", "desk", "curtains"}):
        lines.append("Keep the classroom and window visible")
    if scene_set.intersection({"soft_lighting", "sunlight", "light_rays"}):
        lines.append("Use soft window light from the left")
    if scene_set.intersection({"upper_body", "portrait"}):
        lines.append("Frame her as an upper body portrait")
    return lines[:5]


def _canvas_compose_anima_prompt(effective_prompt, action=None, current_turn_locks=None):
    action_prompt = _canvas_action_prompt_text(action) if isinstance(action, dict) else ""
    locks = current_turn_locks if isinstance(current_turn_locks, dict) else {}
    if not locks:
        try:
            locks = _canvas_vlm_current_turn_prompt_locks(
                effective_prompt,
                allow_pure_scenery=True,
                allow_character_resolution=True,
            )
        except Exception:
            locks = {}
    signals = _canvas_anima_prompt_signal_tags(effective_prompt, locks, action_prompt)
    tags = []
    for source in (
        signals.get("quality_tags") or [],
        signals.get("period_tags") or [],
        [signals.get("rating_tag")],
        signals.get("count_tags") or [],
        signals.get("character_tags") or [],
        signals.get("copyright_tags") or [],
        signals.get("artist_tags") or [],
        signals.get("scene_tags") or [],
    ):
        for tag in source or []:
            _canvas_anima_add_tag(tags, tag)
    natural_lines = _canvas_anima_natural_lines(effective_prompt, signals.get("scene_tags") or [])
    prompt = ", ".join(tags + natural_lines)
    return {
        "prompt": canvas_danbooru_service._canvas_prompt_safe_danbooru_text(prompt),
        "tags": tags,
        "natural_lines": natural_lines,
        "signals": signals,
        "locks": locks,
    }


def _canvas_repair_anima_actions(actions, payload, params, prompt):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    try:
        base_locks = _canvas_vlm_current_turn_prompt_locks(
            effective_prompt,
            allow_pure_scenery=True,
            allow_character_resolution=True,
        )
    except Exception:
        base_locks = {}
    stage_locks = _canvas_two_stage_intent_locks(params if isinstance(params, dict) else {})
    if stage_locks:
        base_locks = _canvas_merge_prompt_locks(base_locks, stage_locks)
    repaired = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            repaired.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name not in {"generate_image", "text_to_image"}:
            repaired.append(item)
            continue
        composed = _canvas_compose_anima_prompt(effective_prompt, item, base_locks)
        final_prompt = str(composed.get("prompt") or "").strip()
        if not final_prompt:
            repaired.append(item)
            continue
        original_prompt = _canvas_action_prompt_text(item)
        if original_prompt and original_prompt != final_prompt:
            item["_anima_llm_draft_prompt"] = original_prompt[:1200]
        for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt", "draft_prompt"):
            if item.get(key) != final_prompt:
                item[key] = final_prompt
                changed = True
        signals = composed.get("signals") if isinstance(composed.get("signals"), dict) else {}
        counts = _canvas_normalize_subject_counts(signals.get("subject_counts")) or _canvas_subject_counts_from_prompt(final_prompt)
        if counts:
            item["subject_counts"] = counts
        locked_tags = []
        for tag in signals.get("locked_tags") or []:
            _canvas_anima_add_tag(locked_tags, tag)
        enrichment_tags = []
        for tag in signals.get("scene_tags") or []:
            if tag not in locked_tags:
                _canvas_anima_add_tag(enrichment_tags, tag, allow_quality=False)
        prompt_intent = canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent({
            **(_canvas_action_prompt_intent(item) or {}),
            "locked_tags": locked_tags[:28],
            "enrichment_tags": enrichment_tags[:16],
            "must_preserve": locked_tags[:12],
            "draft_first": True,
            "scene_strictness": "draft",
        })
        if counts:
            prompt_intent["subject_counts"] = counts
        item["prompt_intent"] = prompt_intent
        item["summary"] = str(item.get("summary") or "Prepared an Anima-ready prompt with canonical Danbooru anchors.").strip()
        try:
            confidence = float(item.get("confidence") or 0.0)
        except Exception:
            confidence = 0.0
        item["confidence"] = max(confidence, 0.92)
        item["_backend_repaired"] = "true"
        item["_canonical_locked"] = "true"
        item["_anima_backend_repaired"] = "true"
        repaired.append(item)
    return repaired if changed else actions


def _canvas_prompt_review_enabled(params):
    data = params if isinstance(params, dict) else {}
    return _canvas_bool(data.get("enable_prompt_review"), False) or _canvas_bool(data.get("enable_danbooru_review"), False)


def _canvas_is_natural_prompt_target_key(target_key):
    key = str(target_key or "").strip().lower()
    if not key or key in CANVAS_DANBOORU_TARGET_KEYS:
        return False
    return (
        key in CANVAS_NATURAL_PROMPT_TARGET_KEYS
        or "natural" in key
        or key.startswith(("qwen", "wan", "flux", "krea"))
        or "t5" in key
        or "umt5" in key
    )


def _canvas_should_validate_llm_draft(payload, params, prompt):
    if _canvas_vlm_agent_mode(params or {}) == "raw":
        return False
    if not _canvas_target_requires_danbooru(payload):
        return False
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    if _canvas_random_prompt_should_own_subject(effective_prompt):
        return False
    return bool(_canvas_vlm_image_prompting_intent(effective_prompt) or _canvas_vlm_visual_scene_hint(effective_prompt))


CANVAS_LLM_DRAFT_HARD_RETRY_ISSUE_PATTERNS = (
    re.compile(r"^empty LLM response$", re.I),
    re.compile(r"LLM response did not return the required JSON action", re.I),
    re.compile(r"^expected exactly one image action, got (?:0|[2-9]\d*)$", re.I),
    re.compile(r"^missing_action$", re.I),
    re.compile(r"^missing draft_prompt$", re.I),
    re.compile(r"^malformed JSON was salvaged$", re.I),
    re.compile(r"markdown fence", re.I),
    re.compile(r"repeats? .+ too many times", re.I),
)


def _canvas_llm_draft_retry_required(issues):
    for issue in issues or []:
        text = str(issue or "").strip()
        if text and any(pattern.search(text) for pattern in CANVAS_LLM_DRAFT_HARD_RETRY_ISSUE_PATTERNS):
            return True
    return False


def _canvas_llm_draft_candidate_prompt(actions):
    for action in actions or []:
        if not isinstance(action, dict):
            continue
        name = _canvas_normalize_vlm_action_name(action.get("action") or action.get("type") or "")
        if name not in {"generate_image", "text_to_image"}:
            continue
        for key in ("draft_prompt", "prompt", "image_prompt", "recommended_prompt", "final_prompt"):
            value = str(action.get(key) or "").strip()
            if value:
                return value
    return ""


def _canvas_llm_draft_repetition_issue(actions):
    draft_prompt = _canvas_llm_draft_candidate_prompt(actions)
    if not draft_prompt:
        return ""
    tag_counts = {}
    tags = []
    for raw in re.split(r"[,;\n]+", draft_prompt):
        clean = re.sub(r"[^a-z0-9_()]+", "_", str(raw or "").strip().lower())
        clean = re.sub(r"_+", "_", clean).strip("_")
        if clean:
            tags.append(clean)
            tag_counts[clean] = tag_counts.get(clean, 0) + 1
    if len(tags) >= 10 and tag_counts:
        tag, count = max(tag_counts.items(), key=lambda item: item[1])
        if count >= 5 or (count >= 4 and count / max(len(tags), 1) >= 0.35):
            return f"draft_prompt repeats tag too many times: {tag}"
    words = [item.lower() for item in re.findall(r"[a-zA-Z][a-zA-Z0-9_()-]{2,}", draft_prompt)]
    if len(words) >= 24:
        word_counts = {}
        for word in words:
            word_counts[word] = word_counts.get(word, 0) + 1
        word, count = max(word_counts.items(), key=lambda item: item[1])
        if count >= 12 and count / max(len(words), 1) >= 0.25:
            return f"draft_prompt repeats word too many times: {word}"
    return ""


def _canvas_validate_llm_draft_response(text, actions, payload, params, prompt):
    if not _canvas_should_validate_llm_draft(payload, params, prompt):
        return {"valid": True, "issues": [], "tag_count": 0, "retry_required": False, "repairable": False}
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    result = canvas_vlm_prompt_pipeline.validate_llm_draft_actions(
        actions or [],
        user_prompt=effective_prompt,
        target_requires_danbooru=True,
    )
    issues = list(result.get("issues") or [])
    repetition_issue = _canvas_llm_draft_repetition_issue(actions)
    if repetition_issue:
        issues.append(repetition_issue)
    source = str(text or "").strip()
    if not source:
        issues.append("empty LLM response")
    elif not actions and re.search(r"```|^\s*(?:Here|Sure|I can|Okay)\b|[\u3400-\u9fff].{8,}", source, re.I):
        issues.append("LLM response did not return the required JSON action")
    issues = list(dict.fromkeys(issues))[:16]
    retry_required = _canvas_llm_draft_retry_required(issues)
    source_empty = not bool(source)
    if retry_required and not _canvas_bool((params or {}).get("retry_repairable_llm_draft"), False):
        retry_required = source_empty
    return {
        "valid": not issues,
        "issues": issues,
        "tag_count": int(result.get("tag_count") or 0),
        "draft_prompt": result.get("draft_prompt") or "",
        "retry_required": retry_required,
        "repairable": bool(issues and not retry_required),
        "retry_reason_type": "model_output_empty" if retry_required else ("local_repair_preferred" if issues else ""),
    }


def _canvas_build_llm_draft_retry_prompt(payload, params, prompt, invalid_text, validation):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    issues = "; ".join(str(item or "").strip() for item in (validation or {}).get("issues") or [] if str(item or "").strip())
    target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload if isinstance(payload, dict) else {})
    stage_locks = _canvas_two_stage_intent_locks(params)
    stage_lock_text = (
        "\n\nTwo-stage locked intent. The retry must not contradict these locks:\n"
        + _canvas_compact_agent_json(stage_locks, 2200)
        if stage_locks
        else ""
    )
    return (
        "Your previous image-action draft was invalid and must be rewritten.\n"
        f"Failure reason(s): {issues or 'invalid draft format'}.\n\n"
        "Return exactly one JSON object, no markdown, no explanation:\n"
        "{\"action\":\"generate_image\",\"prompt\":\"...\",\"draft_prompt\":\"...\","
        "\"prompt_intent\":{\"locked_tags\":[],\"must_preserve\":[],\"enrichment_tags\":[]},"
        "\"subject_counts\":{\"girls\":0,\"boys\":0,\"others\":0,\"total\":0},"
        "\"summary\":\"...\",\"confidence\":0.95}\n\n"
        "draft_prompt requirements:\n"
        "- 24-36 comma-separated English short tags or short visual phrases.\n"
        "- Preserve the user's subject, count, relationship, action, setting, props, composition, atmosphere, and lighting.\n"
        "- Reasonable fuzzy phrases are allowed, for example: playing with children, kindergarten classroom, warm afternoon light.\n"
        "- Do not include Chinese text, prose sentences, artist/commentary/watermark/lowres/meta tags, or generation controls like seed/steps/cfg/width/height.\n\n"
        f"Target key: {target_key or 'unknown'}\n"
        f"User request:\n{effective_prompt[:1600]}\n\n"
        f"{stage_lock_text}"
        "\n\n"
        f"Invalid previous response excerpt:\n{str(invalid_text or '')[:1200]}"
    )


def validate_llm_draft_response(text, actions, payload, params, prompt):
    return _canvas_validate_llm_draft_response(text, actions, payload, params, prompt)


def build_llm_draft_retry_prompt(payload, params, prompt, invalid_text, validation):
    return _canvas_build_llm_draft_retry_prompt(payload, params, prompt, invalid_text, validation)


def _canvas_capture_initial_draft_prompts(actions):
    captured = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            captured.append(action)
            continue
        item = dict(action)
        action_name = _canvas_normalize_vlm_action_name(item.get("action") or item.get("type") or "")
        if action_name in {"generate_image", "text_to_image"} and not str(item.get("draft_prompt") or "").strip():
            draft_prompt = ""
            for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt"):
                value = _canvas_prompt_text_from_value(item.get(key))
                if value:
                    draft_prompt = value
                    break
            if draft_prompt:
                item["draft_prompt"] = draft_prompt
                changed = True
        captured.append(item)
    return captured if changed else actions


def _canvas_action_prompt_intent(action):
    if not isinstance(action, dict):
        return {}
    return canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent(action.get("prompt_intent"))


def _canvas_filter_named_character_prompt_intent(prompt_intent, current_prompt):
    if not isinstance(prompt_intent, dict):
        return {}
    explicit_detail_tags = set(_canvas_vlm_persona_compound_visual_tags(current_prompt))
    unrequested_body_detail_pattern = re.compile(
        r"(^|_)(?:slender|skinny|petite|tall|short|legs?|thighs?|breasts?|hips?|waist|collarbone|shoulders?|navel)(_|$)",
        re.I,
    )

    def keep_tag(tag):
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if not clean:
            return False
        if (
            (
                canvas_danbooru_policy.is_named_character_default_detail_tag(clean)
                or bool(unrequested_body_detail_pattern.search(clean))
            )
            and clean not in explicit_detail_tags
        ):
            return False
        return True

    output = dict(prompt_intent)
    for key in (
        "locked_tags", "enrichment_tags", "suggested_tags", "candidate_tags",
        "style_tags", "composition_tags", "pose_tags", "expression_tags",
        "lighting_tags", "atmosphere_tags", "camera_tags", "setting_tags",
        "prop_tags", "action_tags", "intent_hints",
    ):
        value = output.get(key)
        if not isinstance(value, list):
            continue
        filtered = [tag for tag in value if keep_tag(tag)]
        if filtered:
            output[key] = filtered
        else:
            output.pop(key, None)
    return output


def _canvas_merge_local_locked_prompt_intent(prompt_intent, current_turn_locks):
    normalized = canvas_vlm_prompt_pipeline.normalize_structured_prompt_intent(prompt_intent)
    locked_tags = []
    if isinstance(current_turn_locks, dict):
        for tag in current_turn_locks.get("required_prompt_tags") or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean not in locked_tags:
                locked_tags.append(clean)
    if (
        isinstance(current_turn_locks, dict)
        and (
            str(current_turn_locks.get("scene_branch") or "").strip().lower() == "selfie"
            or "selfie" in set(current_turn_locks.get("required_prompt_tags") or [])
        )
    ):
        selfie_blocked = {
            "camera", "holding_camera", "taking_picture", "backpack",
            "suitcase", "map", "walking", "looking_back",
        }
        locked_tags = [tag for tag in locked_tags if tag not in selfie_blocked]
        for tag in ("selfie", "holding_phone", "portrait", "looking_at_viewer"):
            if tag not in locked_tags:
                locked_tags.append(tag)
    output = dict(normalized)
    if locked_tags:
        output["locked_tags"] = locked_tags[:24]
    else:
        output.pop("locked_tags", None)
    if isinstance(current_turn_locks, dict):
        enrichment = list(output.get("enrichment_tags") or [])
        for tag in current_turn_locks.get("scene_tags") or []:
            clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
            if clean and clean not in locked_tags and clean not in enrichment:
                enrichment.append(clean)
        if enrichment:
            output["enrichment_tags"] = enrichment[:16]
    if isinstance(current_turn_locks, dict):
        strictness = str(current_turn_locks.get("scene_strictness") or "").strip().lower()
        if strictness in {"low", "medium", "high"}:
            output["scene_strictness"] = strictness
    return output


def _canvas_known_identity_tag_set():
    try:
        index = canvas_danbooru_service._canvas_load_danbooru_character_index()
        return set(index.get("character_tags") or set()).union(set(index.get("copyright_tags") or set()))
    except Exception:
        return set()


def _canvas_filter_unrequested_identity_tags(tags, allowed_tags=None):
    identity_tags = _canvas_known_identity_tag_set()
    if not identity_tags:
        return list(tags or [])
    allowed = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        for tag in (allowed_tags or [])
        if str(tag or "").strip()
    }
    output = []
    for tag in tags or []:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean in identity_tags and clean not in allowed:
            continue
        output.append(tag)
    return output


def _canvas_apply_llm_draft_canonicalization(item, effective_prompt, prompt, resolution=None):
    if not isinstance(item, dict):
        return False
    if str(item.get("_llm_draft_canonicalized") or "").lower() == "true":
        return False
    if _canvas_random_prompt_should_own_subject(effective_prompt):
        return False
    raw_source = item.get("llm_draft_prompt_raw") or item.get("draft_prompt") or _canvas_action_prompt_text(item)
    raw_draft = _canvas_prompt_text_from_value(raw_source)
    if not raw_draft:
        return False
    try:
        adult = bool(canvas_vlm_prompt_pipeline.detect_adult_intent(effective_prompt, raw_draft).get("is_adult"))
    except Exception:
        adult = False
    if resolution is None:
        try:
            resolution = canvas_danbooru_service._canvas_requested_character_resolution(effective_prompt, raw_draft)
        except Exception:
            resolution = {}
    resolved_tags = [
        str(row.get("tag") or "").strip()
        for row in (resolution or {}).get("resolved") or []
        if isinstance(row, dict) and str(row.get("tag") or "").strip()
    ]
    copyright_tags = [
        str(row.get("tag") or "").strip()
        for row in (resolution or {}).get("copyright_candidates") or []
        if isinstance(row, dict) and str(row.get("tag") or "").strip()
    ]
    canonical_user_prompt = effective_prompt
    if resolved_tags:
        try:
            canonical_user_prompt = canvas_vlm_prompt_pipeline._character_name_masked_text(effective_prompt, resolution)
        except Exception:
            canonical_user_prompt = effective_prompt
    prompt_intent = item.get("prompt_intent") if isinstance(item.get("prompt_intent"), dict) else {}
    canonicalized = canvas_vlm_prompt_pipeline.canonicalize_llm_draft_tags(
        raw_draft,
        user_prompt=canonical_user_prompt,
        source_prompt=raw_draft,
        resolved_tags=resolved_tags,
        copyright_tags=copyright_tags,
        prompt_intent=prompt_intent,
        adult=adult,
    )
    canonical_prompt = str(canonicalized.get("prompt") or "").strip()
    canonical_tags = list(canonicalized.get("tags") or [])
    blocked_tags = _canvas_blocked_prompt_tags_for_intent(effective_prompt, prompt)
    if blocked_tags and canonical_tags:
        canonical_tags = [
            tag for tag in canonical_tags
            if canvas_danbooru_service._canvas_clean_prompt_tag_name(tag) not in blocked_tags
        ]
        canonical_prompt = ", ".join(canonical_tags)
    if canonical_tags:
        allowed_identity_tags = list(resolved_tags or []) + list(copyright_tags or [])
        for key in ("locked_tags", "character_tags", "copyright_tags"):
            allowed_identity_tags.extend(prompt_intent.get(key) or [])
        filtered_identity_tags = _canvas_filter_unrequested_identity_tags(canonical_tags, allowed_identity_tags)
        if filtered_identity_tags != canonical_tags:
            canonical_tags = filtered_identity_tags
            canonical_prompt = ", ".join(canonical_tags)
    if not canonical_prompt or not canonical_tags:
        return False
    original_prompt = str(item.get("draft_prompt") or item.get("prompt") or "").strip()
    item["original_llm_draft"] = raw_draft[:1800]
    item["canonicalized_prompt"] = canonical_prompt
    item["draft_prompt"] = canonical_prompt
    item["_llm_draft_canonicalized"] = "true"
    item["llm_draft_canonicalization"] = {
        "source": canonicalized.get("canonicalize_source") or "llm_draft_db_canonicalize",
        "original_tag_count": len(canvas_vlm_prompt_pipeline._split_llm_draft_tags(raw_draft)),
        "canonical_tag_count": int(canonicalized.get("tag_count") or len(canonical_tags)),
        "unmatched_hints": canonicalized.get("unmatched_hints") or [],
        "mappings": canonicalized.get("mappings") or [],
    }
    if not item.get("prompt") or str(item.get("prompt") or "").strip() == original_prompt:
        item["prompt"] = canonical_prompt
    next_intent = dict(prompt_intent)
    next_intent["draft_first"] = True
    next_intent["scene_strictness"] = "draft"
    if canonicalized.get("intent_hints"):
        next_intent["intent_hints"] = canonicalized.get("intent_hints")
    locked = []
    for tag in list(next_intent.get("locked_tags") or []) + resolved_tags + copyright_tags:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(tag)
        if clean and clean not in locked:
            locked.append(clean)
    if locked:
        next_intent["locked_tags"] = locked[:24]
    enrichment = []
    protected = set(locked) | set(canvas_vlm_prompt_pipeline.SUBJECT_COUNT_TAGS) | {"solo", "multiple_others", "no_humans"}
    for tag in canonical_tags:
        if tag not in protected and tag not in enrichment:
            enrichment.append(tag)
    if enrichment:
        next_intent["enrichment_tags"] = enrichment[:16]
    if resolved_tags:
        next_intent = _canvas_filter_named_character_prompt_intent(next_intent, prompt)
    item["prompt_intent"] = next_intent
    return True


def _canvas_normalize_subject_counts(counts):
    if not isinstance(counts, dict):
        return None
    girls = max(0, int(float(counts.get("girls", counts.get("female", counts.get("females", counts.get("women", 0)))) or 0)))
    boys = max(0, int(float(counts.get("boys", counts.get("male", counts.get("males", counts.get("men", 0)))) or 0)))
    others = max(0, int(float(counts.get("others", counts.get("other", counts.get("unnamed", counts.get("extra", 0)))) or 0)))
    total = max(0, int(float(counts.get("total", counts.get("people", counts.get("characters", 0)))) or 0))
    total = max(total, girls + boys + others)
    return {"girls": girls, "boys": boys, "others": others, "total": total}


def _canvas_subject_counts_from_count_tags(tags):
    girls = 0
    boys = 0
    others = 0
    total = 0
    tag_set = {str(tag or "").strip().lower() for tag in (tags or []) if str(tag or "").strip()}
    if "no_humans" in tag_set:
        return {"girls": 0, "boys": 0, "others": 0, "total": 0}
    for tag in tag_set:
        match = re.fullmatch(r"([1-6])girls", tag)
        if match:
            girls = max(girls, int(match.group(1)))
            continue
        match = re.fullmatch(r"([1-6])boys", tag)
        if match:
            boys = max(boys, int(match.group(1)))
            continue
        if tag == "1girl":
            girls = max(girls, 1)
        elif tag == "1boy":
            boys = max(boys, 1)
        elif tag == "multiple_others":
            others = max(others, 1)
    total = max(total, girls + boys + others)
    return {"girls": girls, "boys": boys, "others": others, "total": total}


def _canvas_merge_subject_counts(primary, secondary):
    left = _canvas_normalize_subject_counts(primary)
    right = _canvas_normalize_subject_counts(secondary)
    if not left:
        return right
    if not right:
        return left
    girls = max(left["girls"], right["girls"])
    boys = max(left["boys"], right["boys"])
    others = max(left["others"], right["others"])
    total = max(left["total"], right["total"], girls + boys + others)
    return {"girls": girls, "boys": boys, "others": others, "total": total}


def _canvas_subject_count_tags_from_counts(counts):
    normalized = _canvas_normalize_subject_counts(counts)
    if not normalized:
        return []
    output = []
    girls = normalized["girls"]
    boys = normalized["boys"]
    others = normalized["others"]
    total = normalized["total"]
    if girls == 1:
        output.append("1girl")
    elif girls > 1:
        output.append(f"{min(girls, 6)}girls")
    if boys == 1:
        output.append("1boy")
    elif boys > 1:
        output.append(f"{min(boys, 6)}boys")
    if others > 0 or total > girls + boys:
        output.append("multiple_others")
    return output


def _canvas_apply_subject_counts_to_prompt(prompt_text, counts):
    normalized = _canvas_normalize_subject_counts(counts)
    prompt_value = str(prompt_text or "").strip()
    if not normalized or not prompt_value:
        return prompt_value
    raw_tags = [str(raw or "").strip() for raw in prompt_value.split(",") if str(raw or "").strip()]
    if not raw_tags:
        return prompt_value
    original_tag_set = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        for raw in raw_tags
        if canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
    }
    count_tags = set(_canvas_subject_count_tags_from_counts(normalized))
    next_tags = []
    seen = set()
    remove_clean = {
        "1girl", "2girls", "3girls", "4girls", "5girls", "6girls",
        "1boy", "2boys", "3boys", "4boys", "5boys", "6boys",
        "multiple_others", "solo", "no_humans",
    }
    for raw in raw_tags:
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        if clean in remove_clean:
            continue
        key = raw.strip().lower()
        if key and key not in seen:
            seen.add(key)
            next_tags.append(raw)
    prefix = []
    if normalized["total"] <= 0:
        prefix.append("no_humans")
    else:
        prefix.extend(_canvas_subject_count_tags_from_counts(normalized))
        generic_blue_archive_student = (
            "blue_archive" in original_tag_set
            and "student" in original_tag_set
            and not any(tag.endswith("_(blue_archive)") for tag in original_tag_set)
        )
        if (
            normalized["total"] == 1
            and normalized["others"] == 0
            and (normalized["girls"] + normalized["boys"]) == 1
            and not generic_blue_archive_student
        ):
            prefix.append("solo")
    merged = []
    merged_seen = set()
    for raw in prefix + next_tags:
        key = str(raw or "").strip().lower()
        if key and key not in merged_seen:
            merged_seen.add(key)
            merged.append(str(raw).strip())
    return ", ".join(merged)


def _canvas_subject_counts_from_prompt(prompt_text):
    tags = []
    seen = set()
    for raw in str(prompt_text or "").split(","):
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        if clean and clean not in seen:
            seen.add(clean)
            tags.append(clean)
    return _canvas_subject_counts_from_count_tags(tags)


def _canvas_infer_subject_counts(user_prompt, prompt_text="", source_prompt="", resolution=None, action=None, composed=None):
    prompt_counts = _canvas_subject_counts_from_prompt(prompt_text)
    prompt_tag_set = {
        canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
        for raw in str(prompt_text or "").split(",")
        if canvas_danbooru_service._canvas_clean_prompt_tag_name(raw)
    }
    prompt_adult_intent = {}
    try:
        prompt_adult_intent = canvas_vlm_prompt_pipeline.detect_adult_intent(user_prompt, source_prompt or prompt_text)
    except Exception:
        prompt_adult_intent = {}
    if (
        "no_humans" in prompt_tag_set
        and not _canvas_vlm_persona_image_subject_intent(user_prompt)
        and not (isinstance(prompt_adult_intent, dict) and prompt_adult_intent.get("is_adult"))
    ):
        return {"girls": 0, "boys": 0, "others": 0, "total": 0}
    action_counts = _canvas_normalize_subject_counts(action.get("subject_counts")) if isinstance(action, dict) else None

    resolution = resolution or (composed.get("resolution") if isinstance(composed, dict) else None)
    if resolution is None:
        try:
            resolution = canvas_danbooru_service._canvas_requested_character_resolution(user_prompt, prompt_text or source_prompt)
        except Exception:
            resolution = {}
    resolved_tags = [
        str(item.get("tag") or "").strip()
        for item in (resolution.get("resolved") or [])
        if isinstance(item, dict) and str(item.get("tag") or "").strip()
    ]
    try:
        scene_branch = str((canvas_vlm_prompt_pipeline.plan_prompt_intent(user_prompt, source_prompt or prompt_text, resolution=resolution) or {}).get("scene_branch") or "")
    except Exception:
        scene_branch = ""
    try:
        if resolved_tags:
            count_tags = canvas_vlm_prompt_pipeline._subject_count_tags(user_prompt, source_prompt or prompt_text, resolved_tags, scene_branch)
            inferred = _canvas_subject_counts_from_count_tags(count_tags)
            if inferred["total"] or len(resolved_tags) > 1:
                return _canvas_merge_subject_counts(action_counts, inferred)
        candidate_tags = []
        try:
            candidate_tags = list(canvas_vlm_prompt_pipeline._generic_direct_hint_tags(user_prompt) or [])
        except Exception:
            candidate_tags = []
        adult_tags = list((prompt_adult_intent or {}).get("tags") or []) if isinstance(prompt_adult_intent, dict) else []
        generic_tags = canvas_vlm_prompt_pipeline._generic_subject_count_tags(user_prompt, source_prompt or prompt_text, candidate_tags, adult_tags)
        inferred = _canvas_subject_counts_from_count_tags(generic_tags)
        if inferred["total"]:
            return _canvas_merge_subject_counts(action_counts, inferred)
    except Exception:
        pass
    if action_counts and action_counts["total"]:
        return _canvas_merge_subject_counts(action_counts, prompt_counts)
    if action_counts and action_counts["total"] == 0 and "no_humans" in prompt_tag_set:
        return action_counts
    if prompt_counts["total"]:
        return prompt_counts
    return None


def _canvas_random_prompt_seed(params, action=None):
    if isinstance(action, dict):
        composer = action.get("prompt_composer") if isinstance(action.get("prompt_composer"), dict) else {}
        if composer.get("random") and composer.get("variation_seed"):
            return str(composer.get("variation_seed"))
        if action.get("prompt_variant_seed") not in (None, ""):
            return str(action.get("prompt_variant_seed"))
    if isinstance(params, dict) and params.get("prompt_variant_seed") not in (None, ""):
        return str(params.get("prompt_variant_seed"))
    return f"runtime-random:{time.time_ns()}"


def _canvas_named_prompt_variant_seed(params, user_prompt="", source_prompt="", action=None):
    if isinstance(action, dict) and action.get("prompt_variant_seed") not in (None, ""):
        return str(action.get("prompt_variant_seed"))
    if isinstance(params, dict) and params.get("prompt_variant_seed") not in (None, ""):
        return str(params.get("prompt_variant_seed"))
    try:
        adult_intent = canvas_vlm_prompt_pipeline.detect_adult_intent(user_prompt, source_prompt)
    except Exception:
        adult_intent = {}
    if adult_intent.get("is_adult"):
        return _canvas_random_prompt_seed(params if isinstance(params, dict) else {}, action)
    return ""


def _canvas_random_persona_locks(params, prompt):
    system_prompt = _canvas_vlm_user_system_prompt(params if isinstance(params, dict) else {})
    return _canvas_merge_prompt_locks(
        _canvas_vlm_persona_prompt_locks(system_prompt),
        _canvas_vlm_persona_prompt_locks(prompt),
    )


def _canvas_random_prompt_intent(effective_prompt):
    try:
        return canvas_vlm_prompt_pipeline.detect_random_image_intent(effective_prompt, "")
    except Exception:
        return {}


def _canvas_random_prompt_should_own_subject(effective_prompt):
    if _canvas_vlm_persona_image_subject_intent(effective_prompt):
        return False
    return bool(_canvas_random_prompt_intent(effective_prompt).get("is_random"))


def _canvas_compose_random_danbooru_prompt(effective_prompt, params, prompt, action=None):
    if not _canvas_random_prompt_should_own_subject(effective_prompt):
        return {}
    persona_locks = _canvas_random_persona_locks(params if isinstance(params, dict) else {}, prompt)
    try:
        return canvas_vlm_prompt_pipeline.compose_sdxl_random_character_prompt(
            effective_prompt,
            "",
            variation_strength=(params or {}).get("prompt_variation_strength") or "rich",
            prompt_variant_seed=_canvas_random_prompt_seed(params if isinstance(params, dict) else {}, action),
            prompt_intent=persona_locks,
        )
    except Exception as exc:
        logger.warning("Random Danbooru prompt composer failed: %s", exc)
        return {}


def _canvas_compose_random_natural_prompt(effective_prompt, params, prompt, target_key, action=None):
    if not _canvas_random_prompt_should_own_subject(effective_prompt):
        return {}
    persona_locks = _canvas_random_persona_locks(params if isinstance(params, dict) else {}, prompt)
    try:
        return canvas_vlm_prompt_pipeline.compose_natural_random_prompt(
            effective_prompt,
            "",
            target_key=target_key,
            variation_strength=(params or {}).get("prompt_variation_strength") or "rich",
            prompt_variant_seed=_canvas_random_prompt_seed(params if isinstance(params, dict) else {}, action),
            prompt_intent=persona_locks,
        )
    except Exception as exc:
        logger.warning("Random natural prompt composer failed: %s", exc)
        return {}


def _canvas_composed_generation_resolution(composed):
    if not isinstance(composed, dict):
        return {}
    generation_resolution = composed.get("generation_resolution")
    if isinstance(generation_resolution, dict) and generation_resolution:
        return generation_resolution
    composer = composed.get("prompt_composer")
    if isinstance(composer, dict):
        generation_resolution = composer.get("generation_resolution")
        if isinstance(generation_resolution, dict) and generation_resolution:
            return generation_resolution
    return {}


def _canvas_apply_composed_generation_resolution(item, composed, *intent_texts):
    if not isinstance(item, dict) or not isinstance(composed, dict) or not composed.get("random"):
        return False
    if _canvas_requested_pixel_size(*intent_texts):
        return False
    generation_resolution = _canvas_composed_generation_resolution(composed)
    if not generation_resolution:
        return False
    try:
        width = int(generation_resolution.get("width") or 0)
        height = int(generation_resolution.get("height") or 0)
    except Exception:
        return False
    if width <= 0 or height <= 0:
        return False
    updates = {
        "width": width,
        "height": height,
        "aspect_ratio": generation_resolution.get("aspect_ratio") or f"{width}*{height}",
        "resolution_source": generation_resolution.get("source") or "backend_random_sdxl",
    }
    changed = False
    for key, value in updates.items():
        if item.get(key) != value:
            item[key] = value
            changed = True
    return changed


def _canvas_random_action_from_composed(composed, natural=False):
    prompt_text = str((composed or {}).get("prompt") or "").strip()
    if not prompt_text:
        return {}
    item = {
        "action": "generate_image",
        "prompt": prompt_text,
        "recommended_prompt": prompt_text,
        "final_prompt": prompt_text,
        "summary": "已随机整理一个高质量生成提示词。",
        "confidence": "0.95",
        "_backend_repaired": "true",
        "_canonical_locked": "true",
        "_backend_synthesized": "true",
    }
    if isinstance(composed, dict):
        if composed.get("subject_counts"):
            item["subject_counts"] = composed.get("subject_counts")
        if composed.get("prompt_intent"):
            item["prompt_intent"] = composed.get("prompt_intent")
        if composed.get("prompt_composer"):
            item["prompt_composer"] = composed.get("prompt_composer")
        _canvas_apply_composed_generation_resolution(item, composed)
        if natural and composed.get("tag_prompt_reference"):
            item["tag_prompt_reference"] = composed.get("tag_prompt_reference")
    return item


def _canvas_prompt_is_random_stub(value, effective_prompt):
    text = str(value or "").strip()
    source = str(effective_prompt or "").strip()
    if not text:
        return True
    if source and text == source:
        return True
    if len(text) <= 12 and _canvas_random_prompt_intent(text).get("is_random"):
        return True
    return False


def _canvas_repair_random_natural_actions(actions, payload, params, prompt, target_key):
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    if not _canvas_random_prompt_should_own_subject(effective_prompt):
        return actions
    composed = _canvas_compose_random_natural_prompt(effective_prompt, params, prompt, target_key)
    if not composed.get("locked"):
        return actions
    if not actions:
        if _canvas_vlm_image_prompting_intent(effective_prompt) or _canvas_vlm_visual_scene_hint(effective_prompt):
            item = _canvas_random_action_from_composed(composed, natural=True)
            return [item] if item else actions
        return actions
    repaired = []
    changed = False
    for action in actions:
        if not isinstance(action, dict):
            repaired.append(action)
            continue
        name = _canvas_normalize_vlm_action_name(action.get("action"))
        if name not in {"generate_image", "text_to_image"}:
            repaired.append(action)
            continue
        item = dict(action)
        item["action"] = "generate_image"
        current = _canvas_action_prompt_text(item)
        if _canvas_prompt_is_random_stub(current, effective_prompt):
            composed_for_action = _canvas_compose_random_natural_prompt(effective_prompt, params, prompt, target_key, action=item) or composed
            prompt_text = str(composed_for_action.get("prompt") or "").strip()
            if prompt_text:
                item.update(_canvas_random_action_from_composed(composed_for_action, natural=True))
                changed = True
        repaired.append(item)
    return repaired if changed else actions


def _canvas_prompt_target_for_payload(payload, target_key=None):
    if isinstance(payload, dict):
        agent_context = payload.get("agent_context") if isinstance(payload.get("agent_context"), dict) else {}
        targets = agent_context.get("prompt_generation_targets") if isinstance(agent_context.get("prompt_generation_targets"), dict) else {}
        text_target = targets.get("text_to_image") if isinstance(targets.get("text_to_image"), dict) else {}
        if text_target:
            target = dict(text_target)
            if target_key and not target.get("key"):
                target["key"] = target_key
            return target
    return {"key": str(target_key or "").strip()}


def _canvas_clean_natural_refined_prompt(value):
    text = str(value or "").strip()
    if not text:
        return ""
    fenced = re.search(r"```(?:json|text|prompt)?\s*([\s\S]*?)```", text, re.I)
    if fenced:
        text = fenced.group(1).strip()
    text = re.sub(r"^\s*(?:final_prompt|refined_prompt|prompt)\s*[:：]\s*", "", text, flags=re.I)
    text = text.strip().strip("`\"'")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > 2200:
        text = text[:2200].rstrip()
    return text


def _canvas_build_natural_prompt_refine_messages(review_payload):
    payload = review_payload if isinstance(review_payload, dict) else {}
    target = payload.get("target") if isinstance(payload.get("target"), dict) else {}
    target_key = str(payload.get("target_key") or target.get("key") or "").strip().lower()
    mode = str(payload.get("mode") or "repair_and_enrich").strip().lower()
    adult_intent = payload.get("adult_intent") if isinstance(payload.get("adult_intent"), dict) else {}
    skill = _canvas_read_vlm_skill_file(VLM_NATURAL_PROMPT_REFINE_SKILL_FILE, 12000)
    adult_skill = _canvas_read_vlm_skill_file(VLM_NATURAL_PROMPT_ADULT_SKILL_FILE, 6000) if adult_intent.get("is_adult") else ""
    target_family = _canvas_vlm_prompt_rewrite_target_family(target_key, target)
    if target_family in {"flux", "natural_en"}:
        language_rule = "Final prompt must be English natural language only. Translate Chinese intent into fluent English; output no Chinese characters."
    elif target_family == "wan":
        language_rule = "Final prompt should be Chinese natural language for video, with visible action progression, camera movement, temporal continuity, and stable subject details."
    else:
        language_rule = "Final prompt should preserve the user's language; for Chinese user requests, write coherent Chinese natural language."
    mode_rule = (
        "In score_only mode, do not rewrite unless the candidate prompt is unusable; normally return final_prompt equal to candidate_prompt."
        if mode == "score_only"
        else "Rewrite/expand the candidate prompt into a richer natural-language prompt while preserving user intent."
    )
    adult_rule = ""
    if adult_intent.get("is_adult"):
        adult_tags = ", ".join(str(tag or "").strip() for tag in (adult_intent.get("tags") or [])[:12] if str(tag or "").strip())
        adult_level = adult_intent.get("level") or 1
        adult_rule = (
            f" Adult intent is explicitly detected for this request (level={adult_level}, tags={adult_tags or 'adult'}). "
            "Do not downgrade the requested adult content to SFW and do not remove requested nudity/contact/explicit acts. "
            "Keep the intensity within the detected/requested level; do not add stronger acts, extra partners, unrelated fetishes, or explicit details not requested by the user."
        )
    compact = {
        "user_request": str(payload.get("user_request") or "")[:1400],
        "candidate_prompt": str(payload.get("candidate_prompt") or "")[:1800],
        "draft_prompt": str(payload.get("draft_prompt") or "")[:1200],
        "adult_intent": adult_intent if adult_intent.get("is_adult") else {"is_adult": False},
        "target": {
            "key": target.get("key"),
            "name": target.get("name"),
            "backend_engine": target.get("backend_engine"),
            "text_encoder": target.get("text_encoder"),
        },
        "preflight": payload.get("preflight") if isinstance(payload.get("preflight"), dict) else {},
        "mode": mode or "repair_and_enrich",
    }
    system = (
        "You are the isolated SimpAI natural-language prompt refine gate. "
        "Do not use chat persona or conversation memory. Return JSON only. "
        "The user's explicit intent has priority over beauty, style, and generic prompt quality. "
        + language_rule
        + " "
        + mode_rule
        + " Preserve all named characters, subject count, relationships, actions, setting, and required props from user_request. "
        "If candidate_prompt lost any explicit user intent, restore it from user_request. "
        "For natural-language targets, do not rely on character names as strong visual tags; keep the requested name but also describe visible appearance, clothing, colors, accessories, body silhouette, pose, props, and scene context. "
        "Turn simple role/topic requests into one coherent small-story image prompt with subject design, action, setting, composition, and mood. "
        "When the user asks for beauty, glamour, sexy, or adult appeal, add tasteful visible body/styling details such as curvy figure, generous bust, long elegant legs, fair skin, bare shoulders, or flirtatious expression, without adding nudity or explicit acts unless requested. "
        + adult_rule
        + " "
        "Do not introduce new named characters, artist names, copyrighted substitutions, watermarks, commentary text, generation controls, unrequested negative prompts, seed/steps/cfg/width/height, or unrelated sexual/violent content. "
        "Never put negative wording in final_prompt: no 'no', 'without', 'avoid', 'not', '不要', '别', or similar negation phrases in the positive prompt. "
        "When the user explicitly gives a negative constraint, rewrite the positive prompt affirmatively where possible and put only the forbidden concepts in negative_prompt. "
        "Add useful visible detail only: subject presentation, action, setting, composition/camera, lighting, atmosphere, materials, background, and coherent moment. "
        "Do not convert natural-language targets into comma-separated Danbooru tags. "
        "Output schema: {state,score,issues,changes,final_prompt,negative_prompt,needs_user_confirmation}. "
        "Use state pass, warn, or fixed; avoid reject unless the prompt is empty or unsafe."
    )
    if skill:
        system += "\n\nDedicated natural prompt refine skill:\n" + skill
    if adult_skill:
        system += "\n\nDedicated natural adult branch skill:\n" + adult_skill
    user = "Refine this natural-language generation prompt payload:\n" + json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def _canvas_natural_prompt_refine_payload(action, payload, params, effective_prompt, target_key):
    item = action if isinstance(action, dict) else {}
    candidate_prompt = _canvas_action_prompt_text(item)
    target = _canvas_prompt_target_for_payload(payload, target_key)
    preflight = {}
    try:
        preflight = canvas_danbooru_preflight.prompt_preflight_check({
            "prompt": candidate_prompt,
            "user_prompt": effective_prompt,
            "prompt_target": target,
            "target_key": target_key,
            "action": item.get("action") or item.get("type") or "generate_image",
        })
    except Exception as exc:
        preflight = {"state": "warning", "summary": f"preflight unavailable: {exc}"}
    return {
        "schema": "simpai.natural_prompt_refine.v1",
        "user_request": str(effective_prompt or "").strip(),
        "target": target,
        "target_key": str(target_key or "").strip().lower(),
        "adult_intent": _canvas_natural_adult_intent_info(effective_prompt, candidate_prompt),
        "draft_prompt": str(item.get("draft_prompt") or item.get("llm_draft_prompt_raw") or "")[:1800],
        "candidate_prompt": candidate_prompt,
        "preflight": preflight,
        "mode": str((params or {}).get("danbooru_review_mode") or "repair_and_enrich").strip() or "repair_and_enrich",
        "threshold": int(float((params or {}).get("danbooru_review_threshold") or 75)),
    }


def _canvas_review_issues_from_values(values):
    issues = []
    for value in values or []:
        if isinstance(value, dict):
            code = str(value.get("code") or value.get("type") or "prompt_refine_note").strip() or "prompt_refine_note"
            message = str(value.get("message") or value.get("reason") or value.get("text") or code).strip()
            issues.append({"code": code, "message": message[:500]})
        else:
            message = str(value or "").strip()
            if message:
                issues.append({"code": "prompt_refine_note", "message": message[:500]})
    return issues[:12]


def _canvas_refine_natural_prompt_action(action, payload, params, prompt, target_key, review_llm_fn=None):
    if not isinstance(action, dict) or not review_llm_fn:
        return action
    name = _canvas_normalize_vlm_action_name(action.get("action") or action.get("type") or "")
    if name not in {"generate_image", "text_to_image"}:
        return action
    item = dict(action)
    item["action"] = "generate_image"
    candidate_prompt = _canvas_action_prompt_text(item)
    if not candidate_prompt:
        return item
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    review_payload = _canvas_natural_prompt_refine_payload(item, payload, params, effective_prompt, target_key)
    try:
        raw_review = review_llm_fn(_canvas_build_natural_prompt_refine_messages(review_payload), review_payload)
    except Exception as exc:
        logger.warning("Canvas VLM natural prompt refine failed: %s", exc)
        item["prompt_review"] = {
            "schema_version": 1,
            "state": "warn",
            "score": 0,
            "issues": [{"code": "natural_refine_error", "message": str(exc)[:500]}],
            "changes": [],
            "original_prompt": candidate_prompt,
            "final_prompt": candidate_prompt,
            "needs_user_confirmation": False,
            "source": "llm_natural_refine",
            "target_key": target_key,
        }
        guarded, _changed = _canvas_apply_natural_positive_negation_guard(item, effective_prompt, prompt, target_key)
        return guarded
    review = canvas_danbooru_prompt_review.parse_review_response(raw_review)
    mode = str((params or {}).get("danbooru_review_mode") or "repair_and_enrich").strip().lower()
    final_prompt = _canvas_clean_natural_refined_prompt(
        review.get("final_prompt")
        or review.get("refined_prompt")
        or review.get("prompt")
        or ""
    )
    review_negative_prompt = ""
    if isinstance(review, dict):
        for key in VLM_AGENT_NEGATIVE_PROMPT_KEYS:
            value = review.get(key)
            if value:
                review_negative_prompt = str(value or "").strip()
                break
    issues = _canvas_review_issues_from_values(review.get("issues") if isinstance(review, dict) else [])
    changes = [
        str(value.get("message") or value.get("reason") or value.get("text") or value)
        if isinstance(value, dict)
        else str(value)
        for value in (review.get("changes") if isinstance(review, dict) and isinstance(review.get("changes"), list) else [])
    ]
    if not review:
        issues.append({"code": "natural_refine_invalid_json", "message": "Prompt refine review did not return a valid JSON object."})
    if not final_prompt:
        final_prompt = candidate_prompt
    normalized_target_key = str(target_key or "").strip().lower()
    if (normalized_target_key == "flux_t5_en" or "flux" in normalized_target_key) and re.search(r"[\u3400-\u9fff]", final_prompt):
        issues.append({"code": "natural_refine_flux_chinese", "message": "Refined FLUX/T5 prompt contained Chinese, so the original prompt was kept."})
        final_prompt = candidate_prompt
    if (
        normalized_target_key in {"qwen_natural", "wan_video_cn"}
        or normalized_target_key.endswith("_cn")
        or "chinese" in normalized_target_key
    ) and final_prompt and not re.search(r"[\u3400-\u9fff]", final_prompt) and re.search(r"[\u3400-\u9fff]", candidate_prompt):
        issues.append({"code": "natural_refine_chinese_target_english", "message": "Refined Chinese natural prompt lost Chinese language, so the original prompt was kept."})
        final_prompt = candidate_prompt
    state = str(review.get("state") or "").strip().lower() if isinstance(review, dict) else ""
    if state not in {"pass", "warn", "fixed"}:
        state = "fixed" if final_prompt != candidate_prompt and mode != "score_only" else ("warn" if issues else "pass")
    if state == "reject":
        state = "warn"
    can_apply = bool(final_prompt and final_prompt != candidate_prompt and mode != "score_only" and not any(issue.get("code") == "natural_refine_flux_chinese" for issue in issues))
    if can_apply:
        item["prompt"] = final_prompt
        item["recommended_prompt"] = final_prompt
        item["final_prompt"] = final_prompt
        item["_backend_repaired"] = "true"
        item["_natural_prompt_refined"] = "true"
        item["summary"] = item.get("summary") or "Refined the natural-language prompt for the selected preset."
        if not changes:
            changes.append("expanded natural-language prompt")
        state = "fixed"
    elif state == "fixed":
        state = "warn" if issues else "pass"
    score = review.get("score") if isinstance(review, dict) else None
    try:
        score = int(round(float(score)))
    except Exception:
        score = 90 if can_apply else (70 if issues else 85)
    item["prompt_review"] = {
        "schema_version": 1,
        "state": state,
        "score": max(0, min(100, score)),
        "issues": issues[:12],
        "changes": [str(change or "").strip()[:500] for change in changes if str(change or "").strip()][:12],
        "original_prompt": candidate_prompt,
        "final_prompt": final_prompt,
        "needs_user_confirmation": bool(can_apply or state == "warn"),
        "source": "llm_natural_refine",
        "target_key": target_key,
    }
    item, _changed = _canvas_apply_natural_positive_negation_guard(
        item,
        effective_prompt,
        prompt,
        target_key,
        extra_negative_prompt=review_negative_prompt,
    )
    return item


def _canvas_final_danbooru_repair_actions(actions, payload, params, prompt, target_requires_danbooru=False, precomputed=None):
    if not actions:
        return actions
    precomputed = precomputed if isinstance(precomputed, dict) else {}
    effective_prompt = (
        str(precomputed.get("effective_prompt") or "")
        if "effective_prompt" in precomputed
        else _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    )
    target_key = (
        str(precomputed.get("target_key") or "").strip()
        if "target_key" in precomputed
        else canvas_danbooru_preflight.payload_text_to_image_target_key(payload)
    )
    actions = _canvas_normalize_image_count_controls(actions, effective_prompt, prompt)
    actions = _canvas_normalize_aspect_ratio_controls(actions, effective_prompt, prompt)
    actions = _canvas_strip_unrequested_generation_controls(actions, effective_prompt, prompt)
    if target_requires_danbooru:
        actions = _canvas_sanitize_action_prompt_fields(actions, effective_prompt, prompt)
    if not target_requires_danbooru:
        repaired = _canvas_repair_random_natural_actions(actions, payload, params, prompt, target_key)
        return _canvas_apply_natural_positive_negation_guard_actions(repaired, effective_prompt, prompt, target_key)
    if "persona_self_image" in precomputed:
        persona_self_image = bool(precomputed.get("persona_self_image"))
    else:
        persona_self_image = _canvas_vlm_persona_image_subject_for_request(
            payload if isinstance(payload, dict) else {},
            prompt,
            effective_prompt,
        )
    persona_lock_source = _canvas_vlm_persona_lock_source(prompt, effective_prompt, persona_self_image)
    persona_compose_prompt = persona_lock_source if persona_self_image else effective_prompt
    if "requested_resolution" in precomputed and isinstance(precomputed.get("requested_resolution"), dict):
        requested_resolution = precomputed.get("requested_resolution") or {}
    else:
        requested_resolution = (
            {}
            if persona_self_image
            else canvas_danbooru_service._canvas_requested_character_resolution(effective_prompt)
        )
    if "has_requested_character" in precomputed:
        has_requested_character = bool(precomputed.get("has_requested_character"))
    else:
        has_requested_character = bool(not persona_self_image and requested_resolution.get("state") == "resolved")
    if "pure_scenery_intent" in precomputed and isinstance(precomputed.get("pure_scenery_intent"), dict):
        pure_scenery = precomputed.get("pure_scenery_intent") or {}
    else:
        pure_scenery = (
            {}
            if persona_self_image
            else canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(effective_prompt, "")
        )
    if "generic_intent" in precomputed and isinstance(precomputed.get("generic_intent"), dict):
        generic_prompt = precomputed.get("generic_intent") or {}
    else:
        generic_prompt = canvas_vlm_prompt_pipeline.compose_sdxl_generic_prompt(
            persona_compose_prompt,
            "",
            variation_strength=(params or {}).get("prompt_variation_strength"),
            prompt_variant_seed=(params or {}).get("prompt_variant_seed"),
            allow_pure_scenery=not persona_self_image,
            allow_named_character_resolution=not persona_self_image,
        )
    if "random_prompt" in precomputed and isinstance(precomputed.get("random_prompt"), dict):
        random_prompt = precomputed.get("random_prompt") or {}
    else:
        random_prompt = _canvas_compose_random_danbooru_prompt(effective_prompt, params, prompt) if not has_requested_character else {}
    should_repair_prompt = bool(
        target_requires_danbooru
        or has_requested_character
        or pure_scenery.get("locked")
        or random_prompt.get("locked")
        or generic_prompt.get("locked")
        or _canvas_two_stage_intent_locks(params)
    )
    if "current_turn_locks" in precomputed and isinstance(precomputed.get("current_turn_locks"), dict):
        current_turn_locks = dict(precomputed.get("current_turn_locks") or {})
    else:
        current_turn_locks = (
            _canvas_vlm_current_turn_prompt_locks(
                persona_lock_source,
                allow_pure_scenery=not persona_self_image,
                allow_character_resolution=not persona_self_image,
            )
            if should_repair_prompt
            else {}
        )
        if persona_self_image:
            persona_system_prompt = _canvas_vlm_user_system_prompt(params)
            persona_locks = _canvas_merge_prompt_locks(
                _canvas_vlm_persona_prompt_locks(persona_system_prompt),
                _canvas_vlm_persona_prompt_locks(prompt),
            )
            current_turn_locks = _canvas_merge_prompt_locks(
                persona_locks,
                current_turn_locks,
            )
        current_turn_locks = _canvas_merge_two_stage_locks(current_turn_locks, params)
    if not should_repair_prompt:
        return _canvas_mark_persona_self_actions(actions, persona_self_image)
    repaired = []
    changed = False
    for action in actions or []:
        if not isinstance(action, dict):
            repaired.append(action)
            continue
        item = dict(action)
        name = _canvas_normalize_vlm_action_name(item.get("action"))
        if name not in {"generate_image", "text_to_image"}:
            repaired.append(item)
            continue
        if persona_self_image:
            if str(item.get("_persona_self_image") or "").strip().lower() != "true":
                item["_persona_self_image"] = "true"
                changed = True
            if item.get("persona_self_image") is not True:
                item["persona_self_image"] = True
                changed = True
        if item.get("action") != "generate_image":
            item["action"] = "generate_image"
            changed = True
        review = item.get("prompt_review") if isinstance(item.get("prompt_review"), dict) else {}
        hard_block = (
            str(item.get("_safety_blocked") or "").lower() == "true"
            or (
                str(review.get("state") or "").strip().lower() == "reject"
                and bool(str(review.get("hard_block_reason") or "").strip())
            )
        )
        if hard_block:
            repaired.append(item)
            continue
        current_prompt = _canvas_action_prompt_text(item)
        if current_prompt and _canvas_apply_llm_draft_canonicalization(
            item,
            effective_prompt,
            prompt,
            resolution=requested_resolution if has_requested_character else None,
        ):
            changed = True
            current_prompt = _canvas_action_prompt_text(item)
        source_prompt = _canvas_action_draft_prompt(item) or current_prompt
        repair_source_prompt = "" if persona_self_image else source_prompt
        if persona_self_image:
            action_prompt_intent = {}
        elif has_requested_character:
            action_prompt_intent = _canvas_filter_named_character_prompt_intent(_canvas_action_prompt_intent(item), prompt)
        else:
            action_prompt_intent = _canvas_action_prompt_intent(item)
        prompt_intent = _canvas_merge_local_locked_prompt_intent(
            action_prompt_intent,
            current_turn_locks,
        )
        if prompt_intent != item.get("prompt_intent"):
            item["prompt_intent"] = prompt_intent
            changed = True
        local_subject_counts = _canvas_normalize_subject_counts(
            current_turn_locks.get("subject_counts") if isinstance(current_turn_locks, dict) else None
        )
        if local_subject_counts is not None and persona_self_image and int(local_subject_counts.get("total") or 0) == 0:
            local_subject_counts = None
        if local_subject_counts is not None and item.get("subject_counts") != local_subject_counts:
            item["subject_counts"] = local_subject_counts
            changed = True
        composed = {}
        named_variant_seed = ""
        if pure_scenery.get("locked") and not persona_self_image:
            composed = canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(
                effective_prompt,
                source_prompt,
                prompt_intent=prompt_intent,
            )
            fixed_prompt = str(composed.get("prompt") or "").strip()
        elif random_prompt.get("locked"):
            composed = _canvas_compose_random_danbooru_prompt(effective_prompt, params, prompt, action=item) or random_prompt
            fixed_prompt = str(composed.get("prompt") or "").strip()
        elif (generic_prompt.get("locked") or (persona_self_image and current_turn_locks.get("required_prompt_tags"))) and not has_requested_character:
            composed = canvas_vlm_prompt_pipeline.compose_sdxl_generic_prompt(
                persona_compose_prompt,
                repair_source_prompt,
                variation_strength=(params or {}).get("prompt_variation_strength"),
                prompt_variant_seed=(params or {}).get("prompt_variant_seed"),
                prompt_intent=prompt_intent,
                allow_pure_scenery=not persona_self_image,
                allow_named_character_resolution=not persona_self_image,
            )
            fixed_prompt = str(composed.get("prompt") or "").strip()
        else:
            named_variant_seed = _canvas_named_prompt_variant_seed(params, effective_prompt, source_prompt, action=item)
            fixed_prompt = _canvas_repair_sdxl_named_character_prompt(
                source_prompt,
                effective_prompt,
                prompt_intent=prompt_intent,
                variation_strength=(params or {}).get("prompt_variation_strength"),
                prompt_variant_seed=named_variant_seed,
            )
            if has_requested_character:
                try:
                    composed = canvas_vlm_prompt_pipeline.compose_sdxl_named_character_prompt(
                        effective_prompt,
                        source_prompt,
                        resolution=requested_resolution,
                        variation_strength=(params or {}).get("prompt_variation_strength"),
                        prompt_variant_seed=named_variant_seed,
                        prompt_intent=prompt_intent,
                    )
                except Exception:
                    composed = {}
        if fixed_prompt and not persona_self_image and not random_prompt.get("locked"):
            preserve_parts = [source_prompt]
            preserve_tags = []
            if isinstance(prompt_intent, dict):
                preserve_tags.extend(prompt_intent.get("locked_tags") or [])
                preserve_tags.extend(prompt_intent.get("enrichment_tags") or [])
            if isinstance(current_turn_locks, dict):
                preserve_tags.extend(current_turn_locks.get("required_prompt_tags") or [])
            if preserve_tags:
                preserve_parts.append(", ".join(str(tag or "").strip() for tag in preserve_tags if str(tag or "").strip()))
            allowed_identity_tags = []
            if isinstance(current_turn_locks, dict):
                allowed_identity_tags.extend(current_turn_locks.get("character_tags") or [])
                allowed_identity_tags.extend(current_turn_locks.get("copyright_tags") or [])
            if has_requested_character:
                allowed_identity_tags.extend(
                    str(row.get("tag") or "").strip()
                    for row in (requested_resolution.get("resolved") or [])
                    if isinstance(row, dict) and str(row.get("tag") or "").strip()
                )
                allowed_identity_tags.extend(
                    str(row.get("tag") or "").strip()
                    for row in (requested_resolution.get("copyright_candidates") or [])
                    if isinstance(row, dict) and str(row.get("tag") or "").strip()
                )
            fixed_prompt = _canvas_merge_missing_prompt_tags(
                fixed_prompt,
                ", ".join(str(part or "").strip() for part in preserve_parts if str(part or "").strip()),
                blocked_tags=_canvas_blocked_prompt_tags_for_intent(effective_prompt, prompt),
                allowed_identity_tags=allowed_identity_tags,
                strip_unrequested_identities=not has_requested_character,
            )
        if fixed_prompt and fixed_prompt != current_prompt:
            item["prompt"] = fixed_prompt
            item["recommended_prompt"] = fixed_prompt
            item["final_prompt"] = fixed_prompt
            item["_backend_repaired"] = "true"
            item["_canonical_locked"] = "true"
            item["summary"] = item.get("summary") or ("已随机整理一个高质量 Danbooru 提示词。" if composed.get("random") else "Prepared a repaired Danbooru prompt for confirmation.")
            if named_variant_seed and isinstance(composed, dict) and composed.get("adult"):
                item["prompt_variant_seed"] = named_variant_seed
            changed = True
        if isinstance(composed, dict) and composed.get("prompt_intent") and item.get("prompt_intent") != composed.get("prompt_intent"):
            item["prompt_intent"] = composed.get("prompt_intent")
            changed = True
        subject_counts = _canvas_infer_subject_counts(
            persona_compose_prompt,
            prompt_text=item.get("final_prompt") or item.get("recommended_prompt") or item.get("prompt") or current_prompt,
            source_prompt=repair_source_prompt or current_prompt,
            resolution=requested_resolution if has_requested_character else ({} if persona_self_image else None),
            action=item,
            composed=composed,
        )
        if local_subject_counts is not None:
            subject_counts = local_subject_counts
        if subject_counts and item.get("subject_counts") != subject_counts:
            item["subject_counts"] = subject_counts
            changed = True
        if subject_counts:
            aligned_prompt = _canvas_apply_subject_counts_to_prompt(
                item.get("final_prompt") or item.get("recommended_prompt") or item.get("prompt") or current_prompt,
                subject_counts,
            )
            if aligned_prompt and aligned_prompt != (item.get("final_prompt") or item.get("recommended_prompt") or item.get("prompt") or current_prompt):
                item["prompt"] = aligned_prompt
                item["recommended_prompt"] = aligned_prompt
                item["final_prompt"] = aligned_prompt
                item["_backend_repaired"] = "true"
                item["_canonical_locked"] = "true"
                changed = True
        if isinstance(composed, dict) and composed.get("prompt_composer") and not item.get("prompt_composer"):
            item["prompt_composer"] = composed.get("prompt_composer")
            changed = True
        if isinstance(composed, dict) and composed.get("random"):
            if _canvas_apply_composed_generation_resolution(item, composed, effective_prompt, prompt):
                changed = True
        authoritative_prompt = (
            item.get("final_prompt")
            or item.get("recommended_prompt")
            or item.get("prompt")
            or fixed_prompt
            or current_prompt
        )
        blocked_tags = _canvas_blocked_prompt_tags_for_intent(effective_prompt, prompt)
        if blocked_tags and any(tag in set(_canvas_canonical_draft_tag_list(authoritative_prompt).split(", ")) for tag in blocked_tags):
            cleaned_authoritative = _canvas_canonical_draft_tag_list(authoritative_prompt, blocked_tags=blocked_tags)
            if cleaned_authoritative and cleaned_authoritative != authoritative_prompt:
                item["prompt"] = cleaned_authoritative
                item["recommended_prompt"] = cleaned_authoritative
                item["final_prompt"] = cleaned_authoritative
                item["_backend_repaired"] = "true"
                item["_canonical_locked"] = "true"
                changed = True
                authoritative_prompt = cleaned_authoritative
        canonical_draft = _canvas_canonical_draft_tag_list(authoritative_prompt, blocked_tags=blocked_tags)
        if canonical_draft:
            raw_draft = str(item.get("draft_prompt") or "").strip()
            if raw_draft and raw_draft != canonical_draft and not item.get("llm_draft_prompt_raw"):
                item["llm_draft_prompt_raw"] = raw_draft[:1200]
            if item.get("draft_prompt") != canonical_draft:
                item["draft_prompt"] = canonical_draft
                item["_backend_draft_composed"] = "true"
                changed = True
        repaired.append(item)
    return repaired if changed else actions


def _canvas_review_vlm_agent_actions(actions, payload, params, prompt, review_llm_fn=None):
    if not actions or not _canvas_prompt_review_enabled(params):
        return actions
    if str((params or {}).get("danbooru_review_mode") or "repair_and_enrich").strip().lower() == "off":
        return actions
    reviewed = []
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload)
    natural_target = _canvas_is_natural_prompt_target_key(target_key)
    for action in actions:
        if not isinstance(action, dict):
            reviewed.append(action)
            continue
        if canvas_danbooru_prompt_review.should_review_action(action, payload, params):
            reviewed.append(
                canvas_danbooru_prompt_review.review_action(
                    action,
                    payload,
                    params,
                    effective_prompt,
                    llm_fn=review_llm_fn,
                )
            )
        elif natural_target:
            reviewed.append(
                _canvas_refine_natural_prompt_action(
                    action,
                    payload,
                    params,
                    prompt,
                    target_key,
                    review_llm_fn=review_llm_fn,
                )
            )
        else:
            reviewed.append(action)
    return reviewed


def _canvas_repair_vlm_agent_actions(actions, payload, params, prompt, review_llm_fn=None, assistant_text=None):
    if _canvas_vlm_agent_mode(params) == "raw":
        return actions
    repair_started = time.monotonic()
    input_action_count = len(actions or [])
    repair_timings = {}

    def add_timing(name, started):
        repair_timings[name] = repair_timings.get(name, 0.0) + max(0.0, time.monotonic() - started)

    def timed_call(name, fn):
        started = time.monotonic()
        try:
            return fn()
        finally:
            add_timing(name, started)

    def log_repair_result(reason, output):
        logger.info(
            "Canvas VLM repair detail: elapsed=%.3fs, reason=%s, actions_in=%s, actions_out=%s, timings=%s",
            time.monotonic() - repair_started,
            reason,
            input_action_count,
            len(output or []),
            {key: round(value, 3) for key, value in repair_timings.items()},
        )
        return output

    if not actions:
        return log_repair_result("no_actions", actions)

    phase_started = time.monotonic()
    actions = _canvas_normalize_vlm_action_names(actions)
    target_key = canvas_danbooru_preflight.payload_text_to_image_target_key(payload)
    target_meta = _canvas_prompt_target_for_payload(payload, target_key)
    target_requires_anima = _canvas_is_anima_prompt_target_key(target_key, target_meta)
    target_requires_danbooru = target_key in {"sdxl_danbooru", "danbooru", "illustrious", "noob", "pony", "animagine"}
    effective_prompt = _canvas_vlm_effective_prompt(payload if isinstance(payload, dict) else {}, prompt)
    actions = _canvas_capture_initial_draft_prompts(actions)
    actions = _canvas_strip_unrequested_negative_prompts(actions, effective_prompt, prompt)
    actions = _canvas_normalize_image_count_controls(actions, effective_prompt, prompt)
    actions = _canvas_normalize_aspect_ratio_controls(actions, effective_prompt, prompt)
    actions = _canvas_strip_unrequested_generation_controls(actions, effective_prompt, prompt)
    if target_requires_danbooru:
        actions = _canvas_sanitize_action_prompt_fields(actions, effective_prompt, prompt)
    if target_requires_anima or target_requires_danbooru:
        actions = _canvas_escape_action_prompt_parenthetical_tags(actions)
    add_timing("normalize_and_sanitize", phase_started)
    if target_requires_anima:
        repaired = timed_call("anima_prompt_repair", lambda: _canvas_repair_anima_actions(actions, payload, params, prompt))
        reviewed = timed_call("review_actions", lambda: _canvas_review_vlm_agent_actions(repaired, payload, params, prompt, review_llm_fn))
        reviewed = _canvas_escape_action_prompt_parenthetical_tags(reviewed)
        return log_repair_result("anima_target", reviewed)
    if not target_requires_danbooru:
        repaired = _canvas_repair_random_natural_actions(actions, payload, params, prompt, target_key)
        repaired = _canvas_apply_natural_positive_negation_guard_actions(repaired, effective_prompt, prompt, target_key)
        reviewed = timed_call("review_actions", lambda: _canvas_review_vlm_agent_actions(repaired, payload, params, prompt, review_llm_fn))
        reviewed = _canvas_apply_natural_positive_negation_guard_actions(reviewed, effective_prompt, prompt, target_key)
        return log_repair_result("natural_target", reviewed)
    persona_self_image = _canvas_vlm_persona_image_subject_for_request(
        payload if isinstance(payload, dict) else {},
        prompt,
        effective_prompt,
    )
    persona_lock_source = _canvas_vlm_persona_lock_source(prompt, effective_prompt, persona_self_image)
    persona_compose_prompt = persona_lock_source if persona_self_image else effective_prompt
    requested_resolution = timed_call(
        "requested_character_resolution",
        lambda: {} if persona_self_image else canvas_danbooru_service._canvas_requested_character_resolution(effective_prompt),
    )
    has_requested_character = bool(not persona_self_image and requested_resolution.get("state") == "resolved")
    pure_scenery_intent = timed_call(
        "pure_scenery_intent",
        lambda: {} if persona_self_image else canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(effective_prompt, ""),
    )
    generic_intent = timed_call(
        "generic_intent",
        lambda: canvas_vlm_prompt_pipeline.compose_sdxl_generic_prompt(
            persona_compose_prompt,
            "",
            variation_strength=(params or {}).get("prompt_variation_strength"),
            prompt_variant_seed=(params or {}).get("prompt_variant_seed"),
            allow_pure_scenery=not persona_self_image,
            allow_named_character_resolution=not persona_self_image,
        ),
    )
    phase_started = time.monotonic()
    current_turn_locks = _canvas_vlm_current_turn_prompt_locks(
        persona_lock_source,
        allow_pure_scenery=not persona_self_image,
        allow_character_resolution=not persona_self_image,
    )
    if persona_self_image:
        persona_system_prompt = _canvas_vlm_user_system_prompt(params)
        persona_locks = _canvas_merge_prompt_locks(
            _canvas_vlm_persona_prompt_locks(persona_system_prompt),
            _canvas_vlm_persona_prompt_locks(prompt),
        )
        current_turn_locks = _canvas_merge_prompt_locks(
            persona_locks,
            current_turn_locks,
        )
    current_turn_locks = _canvas_merge_two_stage_locks(current_turn_locks, params)
    add_timing("current_turn_locks", phase_started)
    random_intent = _canvas_random_prompt_intent(effective_prompt)
    random_prompt = timed_call(
        "random_prompt",
        lambda: _canvas_compose_random_danbooru_prompt(effective_prompt, params, prompt) if not has_requested_character else {},
    )
    locked_generic_intent = {}
    if isinstance(current_turn_locks, dict) and current_turn_locks.get("required_prompt_tags"):
        locked_generic_intent = timed_call(
            "locked_generic_intent",
            lambda: canvas_vlm_prompt_pipeline.compose_sdxl_generic_prompt(
                persona_compose_prompt,
                "",
                variation_strength=(params or {}).get("prompt_variation_strength"),
                prompt_variant_seed=(params or {}).get("prompt_variant_seed"),
                prompt_intent=current_turn_locks,
                allow_pure_scenery=not persona_self_image,
                allow_named_character_resolution=False,
            ),
        )
    has_generic_visual_intent = bool(
        pure_scenery_intent.get("locked")
        or random_prompt.get("locked")
        or generic_intent.get("locked")
        or locked_generic_intent.get("locked")
        or (isinstance(current_turn_locks, dict) and current_turn_locks.get("required_prompt_tags"))
    )
    repair_context = {
        "effective_prompt": effective_prompt,
        "target_key": target_key,
        "persona_self_image": persona_self_image,
        "requested_resolution": requested_resolution,
        "has_requested_character": has_requested_character,
        "pure_scenery_intent": pure_scenery_intent,
        "generic_intent": generic_intent,
        "random_prompt": random_prompt,
        "current_turn_locks": current_turn_locks,
    }
    if not target_requires_danbooru and not has_requested_character and not has_generic_visual_intent:
        return log_repair_result("no_visual_intent", actions)
    adult_block_review = (
        _canvas_adult_character_block_review(effective_prompt, requested_resolution)
        if target_requires_danbooru and has_requested_character
        else None
    )
    should_synthesize_action = (
        _canvas_vlm_image_prompting_intent(effective_prompt)
        or _canvas_vlm_continuation_image_intent(prompt)
        or (
            not actions
            and has_requested_character
            and _canvas_vlm_visual_scene_hint(effective_prompt)
        )
        or (
            not actions
            and has_generic_visual_intent
            and _canvas_vlm_visual_scene_hint(effective_prompt)
        )
        or (
            not actions
            and _canvas_vlm_fake_generation_complete(assistant_text)
            and _canvas_vlm_visual_scene_hint(effective_prompt)
        )
    )
    if not actions and should_synthesize_action:
        if adult_block_review:
            return log_repair_result("adult_block", [{
                "action": "generate_image",
                "prompt": "",
                "recommended_prompt": "",
                "final_prompt": "",
                "summary": "Generation request blocked by local adult character safety rules.",
                "confidence": "1.0",
                "_backend_synthesized": "true",
                "_safety_blocked": "true",
                "_prompt_review_rejected": "true",
                "prompt_review": adult_block_review,
            }])
        composed = None
        named_variant_seed = ""
        pure_scenery = pure_scenery_intent
        if pure_scenery.get("locked") and not persona_self_image:
            composed = canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(
                effective_prompt,
                "",
                prompt_intent=_canvas_merge_local_locked_prompt_intent({}, current_turn_locks),
            ) or pure_scenery
        elif random_prompt.get("locked"):
            composed = random_prompt
        elif has_requested_character:
            named_variant_seed = _canvas_named_prompt_variant_seed(params, effective_prompt, "", action=None)
            composed = canvas_vlm_prompt_pipeline.compose_sdxl_named_character_prompt(
                effective_prompt,
                "",
                resolution=requested_resolution,
                variation_strength=(params or {}).get("prompt_variation_strength"),
                prompt_variant_seed=named_variant_seed,
            )
        elif locked_generic_intent.get("locked"):
            composed = locked_generic_intent
        elif generic_intent.get("locked"):
            composed = generic_intent
        fixed_prompt = str((composed or {}).get("prompt") or "").strip()
        if fixed_prompt:
            prompt_intent = (composed or {}).get("prompt_intent") or _canvas_merge_local_locked_prompt_intent({}, current_turn_locks)
            subject_counts = _canvas_infer_subject_counts(
                persona_compose_prompt,
                prompt_text=fixed_prompt,
                source_prompt="",
                resolution=requested_resolution if has_requested_character else ({} if persona_self_image else None),
                composed=composed,
            )
            fixed_prompt = _canvas_apply_subject_counts_to_prompt(fixed_prompt, subject_counts)
            synthesized = [{
                "action": "generate_image",
                "prompt": fixed_prompt,
                "recommended_prompt": fixed_prompt,
                "final_prompt": fixed_prompt,
                "subject_counts": subject_counts,
                "prompt_intent": prompt_intent,
                "summary": "已根据本地角色索引和场景规则整理生成请求。",
                "confidence": "0.95",
                "_backend_repaired": "true",
                "_canonical_locked": "true",
                "_backend_synthesized": "true",
            }]
            if persona_self_image:
                synthesized[0]["_persona_self_image"] = "true"
                synthesized[0]["persona_self_image"] = True
            if isinstance(composed, dict) and composed.get("adult") and named_variant_seed:
                synthesized[0]["prompt_variant_seed"] = named_variant_seed
            if isinstance(composed, dict) and composed.get("prompt_composer"):
                synthesized[0]["prompt_composer"] = composed.get("prompt_composer")
            if isinstance(composed, dict) and composed.get("random"):
                synthesized[0]["summary"] = "已随机整理一个高质量 Danbooru 提示词。"
            if isinstance(composed, dict) and composed.get("random"):
                _canvas_apply_composed_generation_resolution(synthesized[0], composed, effective_prompt, prompt)
            reviewed = timed_call("review_actions", lambda: _canvas_review_vlm_agent_actions(synthesized, payload, params, prompt, review_llm_fn))
            final_actions = timed_call("final_danbooru_repair", lambda: _canvas_final_danbooru_repair_actions(
                reviewed,
                payload,
                params,
                prompt,
                target_requires_danbooru=target_requires_danbooru,
                precomputed=repair_context,
            ))
            final_actions = _canvas_escape_action_prompt_parenthetical_tags(final_actions)
            return log_repair_result("synthesized", final_actions)
    if not actions:
        return log_repair_result("no_actions", actions)
    repaired = []
    for action in actions:
        if not isinstance(action, dict):
            repaired.append(action)
            continue
        name = _canvas_normalize_vlm_action_name(action.get("action"))
        if name not in {"generate_image", "text_to_image"}:
            repaired.append(action)
            continue
        item = dict(action)
        item["action"] = "generate_image"
        if persona_self_image:
            item["_persona_self_image"] = "true"
            item["persona_self_image"] = True
        if adult_block_review:
            item.update({
                "_safety_blocked": "true",
                "_prompt_review_rejected": "true",
                "prompt_review": adult_block_review,
                "summary": item.get("summary") or "Generation request blocked by local adult character safety rules.",
            })
            repaired.append(item)
            continue
        if _canvas_action_prompt_text(item):
            timed_call(
                "llm_draft_canonicalization",
                lambda item=item: _canvas_apply_llm_draft_canonicalization(
                    item,
                    effective_prompt,
                    prompt,
                    resolution=requested_resolution if has_requested_character else None,
                ),
            )
        if not _canvas_action_prompt_text(item):
            composed = None
            named_variant_seed = ""
            if pure_scenery_intent.get("locked") and not persona_self_image:
                composed = canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(
                    effective_prompt,
                    "",
                    prompt_intent=_canvas_merge_local_locked_prompt_intent(_canvas_action_prompt_intent(item), current_turn_locks),
                ) or pure_scenery_intent
            elif random_prompt.get("locked"):
                composed = _canvas_compose_random_danbooru_prompt(effective_prompt, params, prompt, action=item) or random_prompt
            elif has_requested_character:
                named_variant_seed = _canvas_named_prompt_variant_seed(params, effective_prompt, "", action=item)
                prompt_intent = _canvas_filter_named_character_prompt_intent(_canvas_action_prompt_intent(item), prompt)
                composed = canvas_vlm_prompt_pipeline.compose_sdxl_named_character_prompt(
                    effective_prompt,
                    "",
                    resolution=requested_resolution,
                    variation_strength=(params or {}).get("prompt_variation_strength"),
                    prompt_variant_seed=named_variant_seed,
                    prompt_intent=prompt_intent,
                )
            elif locked_generic_intent.get("locked"):
                composed = locked_generic_intent
            elif generic_intent.get("locked"):
                composed = generic_intent
            fixed = str((composed or {}).get("prompt") or "").strip()
            if fixed:
                item["prompt"] = fixed
                item["recommended_prompt"] = fixed
                item["final_prompt"] = fixed
                if persona_self_image:
                    fallback_prompt_intent = {}
                elif has_requested_character:
                    fallback_prompt_intent = _canvas_filter_named_character_prompt_intent(_canvas_action_prompt_intent(item), prompt)
                else:
                    fallback_prompt_intent = _canvas_action_prompt_intent(item)
                item["prompt_intent"] = (composed or {}).get("prompt_intent") or _canvas_merge_local_locked_prompt_intent(
                    fallback_prompt_intent,
                    current_turn_locks,
                )
                item["_backend_repaired"] = "true"
                item["_canonical_locked"] = "true"
                item["summary"] = "已随机整理一个高质量 Danbooru 提示词。" if (composed or {}).get("random") else "Prepared a repaired Danbooru prompt for confirmation."
                if named_variant_seed and (composed or {}).get("adult"):
                    item["prompt_variant_seed"] = named_variant_seed
                if isinstance(composed, dict) and composed.get("prompt_composer"):
                    item["prompt_composer"] = composed.get("prompt_composer")
        for key in ("prompt", "image_prompt", "recommended_prompt", "final_prompt"):
            value = str(item.get(key) or "").strip()
            if value:
                source_prompt = _canvas_action_draft_prompt(item) or value
                prompt_intent = _canvas_action_prompt_intent(item)
                if has_requested_character:
                    prompt_intent = _canvas_filter_named_character_prompt_intent(prompt_intent, prompt)
                named_variant_seed = _canvas_named_prompt_variant_seed(params, effective_prompt, source_prompt, action=item)
                fixed = value if persona_self_image else timed_call(
                    "named_character_prompt_repair",
                    lambda: _canvas_repair_sdxl_named_character_prompt(
                        source_prompt,
                        effective_prompt,
                        prompt_intent=prompt_intent,
                        variation_strength=(params or {}).get("prompt_variation_strength"),
                        prompt_variant_seed=named_variant_seed,
                    ),
                )
                if fixed != value:
                    item[key] = fixed
                    item["prompt"] = fixed
                    item["recommended_prompt"] = fixed
                    item["final_prompt"] = fixed
                    if named_variant_seed:
                        item["prompt_variant_seed"] = named_variant_seed
                    item["_backend_repaired"] = "true"
                    item["_canonical_locked"] = "true"
                    item["summary"] = "已根据本地角色索引和场景规则整理生成请求。"
                break
        prompt_text = _canvas_action_prompt_text(item)
        if prompt_text:
            subject_counts = timed_call(
                "infer_subject_counts",
                lambda: _canvas_infer_subject_counts(
                    persona_compose_prompt,
                    prompt_text=prompt_text,
                    source_prompt="",
                    resolution=requested_resolution if has_requested_character else ({} if persona_self_image else None),
                    action=item,
                ),
            )
            if subject_counts:
                item["subject_counts"] = subject_counts
                aligned_prompt = _canvas_apply_subject_counts_to_prompt(prompt_text, subject_counts)
                if aligned_prompt and aligned_prompt != prompt_text:
                    item["prompt"] = aligned_prompt
                    item["recommended_prompt"] = aligned_prompt
                    item["final_prompt"] = aligned_prompt
        repaired.append(item)
    reviewed = timed_call("review_actions", lambda: _canvas_review_vlm_agent_actions(repaired, payload, params, prompt, review_llm_fn))
    final_actions = timed_call("final_danbooru_repair", lambda: _canvas_final_danbooru_repair_actions(
        reviewed,
        payload,
        params,
        prompt,
        target_requires_danbooru=target_requires_danbooru,
        precomputed=repair_context,
    ))
    final_actions = _canvas_escape_action_prompt_parenthetical_tags(final_actions)
    return log_repair_result("repaired", final_actions)


def _canvas_visible_text_looks_like_prompt_dump(text):
    source = str(text or "").strip()
    if not source:
        return False
    source = re.sub(
        r"^\s*(?:\u597d\u7684|\u597d|ok|okay|got\s+it)\s*[:\uff1a,，\-]*\s*",
        "",
        source,
        flags=re.I,
    ).strip()
    parts = [part.strip(" \t\r\n.。;；") for part in re.split(r"[,，]", source) if part.strip(" \t\r\n.。;；")]
    if len(parts) < 5:
        return False
    tag_like = 0
    for part in parts[:32]:
        text = re.sub(r"^\(+|\)+$", "", part).strip()
        text = re.sub(r":[0-9.]+\)?$", "", text).strip()
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(text)
        if not clean:
            continue
        if (
            clean in canvas_vlm_prompt_pipeline.SUBJECT_COUNT_TAGS
            or clean in {"solo", "masterpiece", "best_quality", "highres", "absurdres"}
            or "_" in clean
            or re.fullmatch(r"[a-z0-9][a-z0-9_()'/.-]{1,60}", clean)
        ):
            tag_like += 1
    return tag_like >= 5 and tag_like / max(1, min(len(parts), 32)) >= 0.55


def _canvas_visible_text_looks_like_action_scaffolding(text):
    source = str(text or "").strip()
    if not source:
        return False
    return bool(re.search(
        r"(?:\b(?:action-ready|json\s+prompt|generated\s+action\s+prompt|why\s+this\s+works|next\s+step|"
        r"click\s+generate|confirmation\s+card|canvas\s+context|prompt\s+generation\s+target|text\s+encoder)\b|"
        r"\u57fa\u4e8e\u753b\u5e03\u4e0a\u4e0b\u6587|\u57fa\u65bc\u756b\u5e03\u4e0a\u4e0b\u6587|"
        r"\u751f\u6210\u52a8\u4f5c\u63d0\u793a|\u751f\u6210\u52d5\u4f5c\u63d0\u793a|\u4e3a\u4ec0\u4e48\u8fd9\u6837\u6709\u6548|"
        r"\u70b9\u51fb.{0,8}\u751f\u6210|\u9ede\u64ca.{0,8}\u751f\u6210)",
        source,
        re.I,
    ))


def _canvas_vlm_agent_display_text(text, actions, params=None):
    if _canvas_vlm_agent_mode(params or {}) == "raw":
        return str(text or "").strip()
    image_actions = [
        item for item in (actions or [])
        if isinstance(item, dict) and str(item.get("action") or item.get("type") or "").strip().lower() in {
            "generate_image", "text_to_image", "edit_image", "outpaint_image", "erase_image", "replace_image", "upscale_image"
        }
    ]
    if not image_actions:
        return str(text or "").strip()
    visible = str(text or "").strip()
    visible = re.sub(r"```json[\s\S]*?```", "", visible, flags=re.I).strip()
    visible = re.sub(r"```\s*[\s\S]*?```", "", visible).strip()
    visible = re.sub(r"\{[\s\S]*?\"action\"\s*:\s*\"(?:generate_image|text_to_image|edit_image|outpaint_image|erase_image|replace_image|upscale_image)\"[\s\S]*?\}", "", visible, flags=re.I).strip()
    visible = re.sub(r"\[\s*(?:generate_image|text_to_image|edit_image|outpaint_image|erase_image|replace_image|upscale_image)\s*[:：]\s*(?:\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*'|[^\]]+?)\s*\]", "", visible, flags=re.I | re.S).strip()
    if re.search(r'^\s*[,{\[]?\s*"(?:subject_counts|prompt_intent|draft_prompt|summary|confidence|recommended_prompt|final_prompt)"\s*:', visible, re.I):
        visible = ""
    elif re.search(r'"(?:subject_counts|prompt_intent|draft_prompt|confidence)"\s*:', visible, re.I) and visible.count('"') >= 4:
        visible = ""
    visible = re.sub(r"\n{3,}", "\n\n", visible).strip()
    visible = _canvas_rewrite_visible_understanding_prefix(visible)
    if _canvas_visible_text_looks_like_prompt_dump(visible):
        visible = ""
    if _canvas_visible_text_looks_like_action_scaffolding(visible):
        visible = ""
    if not visible:
        return ""
        if any(str(item.get("_canonical_locked") or "").lower() == "true" for item in image_actions):
            return "我已经把画面整理成可生成的提示词了，你可以在下面确认卡里检查后执行。"
        return "Generation request prepared. Check the confirmation card below before running."
    if len(visible) > 800:
        visible = visible[:800].rstrip() + "..."
    return visible


def _canvas_vlm_skills(payload):
    query = ""
    if isinstance(payload, dict):
        query = str(payload.get("query") or "")
    agent_context = payload.get("agent_context") if isinstance(payload, dict) and isinstance(payload.get("agent_context"), dict) else {}
    targets = agent_context.get("prompt_generation_targets") if isinstance(agent_context.get("prompt_generation_targets"), dict) else {}
    target = targets.get("text_to_image") if isinstance(targets.get("text_to_image"), dict) else {}
    docs = _canvas_read_vlm_skill_docs(
        query,
        12000,
        language=_canvas_vlm_skill_language(payload=payload, target=target),
    )
    return {
        "ok": True,
        "skills_dir": _canvas_vlm_skills_dir(),
        "index": _canvas_read_vlm_skill_index(),
        "documents": docs,
    }


vlm_agent_mode = _canvas_vlm_agent_mode
vlm_text_budget = _canvas_vlm_text_budget
vlm_rolling_history = _canvas_vlm_rolling_history
vlm_isolate_rolling_history_for_prompt = _canvas_vlm_isolate_rolling_history_for_prompt
build_vlm_agent_system_prompt = _canvas_build_vlm_agent_system_prompt
two_stage_intent_enabled = _canvas_two_stage_intent_enabled
build_two_stage_intent_prompt = _canvas_build_two_stage_intent_prompt
parse_two_stage_intent_response = _canvas_parse_two_stage_intent_response
local_two_stage_intent_response = _canvas_local_two_stage_intent_response
backfill_two_stage_intent_response = _canvas_backfill_two_stage_intent_response
validate_two_stage_intent_contract = _canvas_validate_two_stage_intent_contract
extract_vlm_agent_actions = _canvas_extract_vlm_agent_actions
repair_vlm_agent_actions = _canvas_repair_vlm_agent_actions
validate_llm_draft_response = _canvas_validate_llm_draft_response
build_llm_draft_retry_prompt = _canvas_build_llm_draft_retry_prompt
vlm_agent_display_text = _canvas_vlm_agent_display_text
vlm_skills = _canvas_vlm_skills
