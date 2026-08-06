import re

import modules.canvas_danbooru_policy as canvas_danbooru_policy
import modules.canvas_danbooru_service as canvas_danbooru_service
import modules.canvas_vlm_prompt_pipeline as canvas_vlm_prompt_pipeline
import modules.minimax_h3_prompt_compiler as minimax_h3_prompt_compiler


def payload_text_to_image_target_key(payload):
    if not isinstance(payload, dict):
        return ""
    agent_context = payload.get("agent_context") if isinstance(payload.get("agent_context"), dict) else {}
    targets = agent_context.get("prompt_generation_targets") if isinstance(agent_context.get("prompt_generation_targets"), dict) else {}
    text_target = targets.get("text_to_image") if isinstance(targets.get("text_to_image"), dict) else {}
    return str(text_target.get("key") or text_target.get("name") or "").strip().lower()


def target_is_anima(target_key="", target=None):
    key = str(target_key or "").strip().lower()
    if key in {"anima", "anima_aio", "anima_danbooru"}:
        return True
    data = target if isinstance(target, dict) else {}
    haystack = " ".join(
        str(data.get(item) or "")
        for item in ("key", "name", "label", "backend_engine", "task_method", "text_encoder", "prompt_format", "source")
    ).lower()
    model_list = data.get("model_list") if isinstance(data.get("model_list"), list) else []
    if model_list:
        haystack += " " + " ".join(str(item or "") for item in model_list[:12]).lower()
    return bool(
        "anima_aio" in haystack
        or "anima-base" in haystack
        or re.search(r"(?:^|[\s,|/_-])anima(?:$|[\s,|/_-])", haystack)
    )


def prompt_preflight_unmatched_terms(prompt, matches):
    terms = canvas_danbooru_service._canvas_danbooru_query_terms(prompt)
    if not terms:
        return []
    matched_text = " ".join(
        [
            str(item.get("tag") or "")
            + " "
            + str(item.get("translation") or "")
            + " "
            + str(item.get("aliases") or "")
            for item in (matches or [])
            if isinstance(item, dict)
        ]
    ).lower()
    stop = {
        "masterpiece", "best", "quality", "highres", "absurdres", "newest",
        "solo", "safe", "very", "aesthetic", "amazing", "prompt", "image",
        "画", "生成", "图片", "一个", "一张", "提示词",
    }
    misses = []
    for term in terms:
        clean = str(term or "").strip().lower()
        if not clean or clean in stop or len(clean) < 2:
            continue
        if clean in matched_text or clean.replace(" ", "_") in matched_text:
            continue
        if clean not in misses:
            misses.append(clean)
    return misses[:12]


def prompt_preflight_unescaped_parenthetical_tags(prompt):
    output = []
    for raw in re.split(r"[,;\n]+", str(prompt or "")):
        text = str(raw or "").strip()
        if not text:
            continue
        clean = canvas_danbooru_service._canvas_clean_prompt_tag_name(text)
        if not clean or "(" not in clean or ")" not in clean:
            continue
        safe = canvas_danbooru_service._canvas_prompt_safe_danbooru_tag(clean)
        if safe and safe not in text and clean not in output:
            output.append(clean)
    return output[:12]


def prompt_preflight_check(payload):
    data = payload if isinstance(payload, dict) else {}
    prompt = str(data.get("prompt") or data.get("recommended_prompt") or "").strip()
    wildcard_preview = data.get("wildcard_preview") if isinstance(data.get("wildcard_preview"), dict) else {}
    wildcard_samples = wildcard_preview.get("samples") if isinstance(wildcard_preview.get("samples"), list) else []
    if wildcard_samples:
        first_sample = wildcard_samples[0] if isinstance(wildcard_samples[0], dict) else {}
        prompt = str(first_sample.get("prompt") or prompt).strip()
    target = data.get("prompt_target") if isinstance(data.get("prompt_target"), dict) else {}
    target_key = str(target.get("key") or data.get("target_key") or "").strip()
    target_key_lower = target_key.lower()
    action = str(data.get("action") or "").strip()
    purpose = str(data.get("purpose") or action or "").strip()
    user_prompt = str(data.get("user_prompt") or data.get("original_prompt") or data.get("source_prompt") or "").strip()
    preset_defaults = data.get("preset_defaults") if isinstance(data.get("preset_defaults"), dict) else {}
    h3_compiler = minimax_h3_prompt_compiler.target_compiler(target)
    tag_source_mode = canvas_danbooru_service._canvas_danbooru_tag_source_mode(
        data.get("tag_source") or data.get("tag_source_mode")
    )
    checks = []

    def add(level, code, message, suggestion=""):
        checks.append({
            "level": level,
            "code": code,
            "message": message,
            "suggestion": suggestion,
        })

    if not prompt:
        add(
            "warning" if h3_compiler else "block",
            "empty_prompt",
            "Prompt is empty.",
            "The H3 task can still be submitted; enter a prompt when you want explicit scene control."
            if h3_compiler else "Write a final prompt before submitting.",
        )
    has_chinese = bool(re.search(r"[\u3400-\u9fff]", prompt))
    comma_count = prompt.count(",")
    sentence_like = bool(re.search(r"[。！？.!?]\s*$", prompt)) or len(prompt) > 160 and comma_count < 2
    tag_like = comma_count >= 2 and not has_chinese

    matches = []
    unmatched_terms = []
    unescaped_parenthetical_tags = prompt_preflight_unescaped_parenthetical_tags(prompt)
    character_resolution = {}
    unknown_character_tags = []
    h3_validation = None
    if h3_compiler:
        h3_validation = minimax_h3_prompt_compiler.validate_prompt(prompt, target)
        for index, message in enumerate(h3_validation.get("errors") or []):
            add(
                "warning",
                f"minimax_h3_structure_{index + 1}",
                message,
                "The prompt can still be submitted. Open the H3 storyboard editor only when you want to adjust its structure.",
            )
        for index, message in enumerate(h3_validation.get("warnings") or []):
            add("warning", f"minimax_h3_warning_{index + 1}", message)
        if h3_validation.get("ok") and not h3_validation.get("warnings"):
            add("pass", "minimax_h3_structure", f"MiniMax H3 {h3_validation.get('mode') or ''} prompt structure is valid.")

    elif target_key_lower == "outpaint_instruction" or action.lower() == "outpaint" or purpose.lower() == "outpaint":
        if has_chinese:
            add("block", "outpaint_chinese", "FLUX outpaint prompt contains Chinese characters.", "Translate the final prompt into concise English before submitting.")
        elif prompt:
            add("pass", "outpaint_instruction", "Outpaint prompt is present.")

    elif target_is_anima(target_key_lower, target):
        matches = canvas_danbooru_service._canvas_lookup_danbooru_tags(prompt, limit=28, source_mode=tag_source_mode)
        unmatched_terms = prompt_preflight_unmatched_terms(prompt, matches)
        prompt_tag_set = {
            canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
            for item in re.split(r"[,;\n]+", prompt)
            if str(item or "").strip()
        }
        if has_chinese:
            add("block", "anima_chinese", "Anima prompt contains Chinese characters.", "Rewrite the final prompt as English Anima tags plus short English nltags.")
        if comma_count < 2:
            add("warning", "anima_structure_sparse", "Anima prompt may be too sparse for the hybrid tag/nltags format.", "Use quality/period/rating, subject count, resolved anchors, hard tags, and short English nltags.")
        if not prompt_tag_set.intersection({"safe", "sensitive", "nsfw", "explicit"}):
            add("warning", "anima_rating_missing", "Anima rating token is missing.", "Add safe, sensitive, nsfw, or explicit according to user intent and local policy.")
        if not prompt_tag_set.intersection({"newest", "recent", "mid", "early", "old"}) and not any(tag.startswith("year_") or tag.startswith("year ") for tag in prompt_tag_set):
            add("warning", "anima_period_missing", "Anima period/year control is missing.", "Use newest/recent/mid/early/old or a year token when it helps the requested style.")
        forbidden_positive_tags = sorted(
            tag for tag in prompt_tag_set if canvas_danbooru_service._canvas_is_forbidden_positive_tag(tag)
        )
        if forbidden_positive_tags:
            add("block", "danbooru_forbidden_positive_tag", "Prompt contains forbidden positive tag(s): " + ", ".join(forbidden_positive_tags), "Remove these tags from the positive prompt; use a separate negative prompt only when needed.")
        if unescaped_parenthetical_tags:
            safe_examples = [canvas_danbooru_service._canvas_prompt_safe_danbooru_tag(tag) for tag in unescaped_parenthetical_tags[:4]]
            add("warning", "danbooru_parentheses_unescaped", "Prompt has literal parenthetical tag(s) that may be parsed as weight syntax.", "Escape canonical tag parentheses, for example: " + ", ".join(safe_examples))
        if unmatched_terms:
            add("warning", "anima_unmatched", "Some Anima/Danbooru prompt terms were not matched in local lookup.", "Keep unresolved complex ideas in short nltags rather than fabricated tags.")
        if matches:
            add("pass", "anima_lookup", f"Local lookup found {len(matches)} candidate canonical tag(s).")

    elif target_key_lower == "sdxl_danbooru":
        matches = canvas_danbooru_service._canvas_lookup_danbooru_tags(prompt, limit=28, source_mode=tag_source_mode)
        unknown_character_tags = canvas_danbooru_service._canvas_unknown_character_like_prompt_tags(prompt)
        character_query = user_prompt or " ".join(unknown_character_tags)
        character_resolution = (
            canvas_danbooru_service._canvas_requested_character_resolution(character_query, prompt)
            if character_query
            else {"state": "none", "resolved": [], "candidates": [], "copyright_candidates": []}
        )
        matches = canvas_danbooru_service._canvas_merge_character_candidates_into_matches(
            matches, character_resolution, limit=28
        )
        unmatched_terms = prompt_preflight_unmatched_terms(prompt, matches)
        if has_chinese:
            add("block", "sdxl_chinese", "SDXL/Danbooru prompt contains Chinese characters.", "Convert the final prompt to English Danbooru tags.")
        if comma_count < 1:
            add("block", "sdxl_not_comma_tags", "SDXL/Danbooru prompt is not comma-separated tags.", "Use comma-separated canonical tags, for example: 1girl, solo, magical_girl.")
        if sentence_like:
            add("warning", "sdxl_sentence_like", "Prompt looks like prose instead of compact tags.", "Use short Danbooru tags and place important tags first.")
        if unknown_character_tags:
            add("block", "danbooru_unknown_character_tag", "Prompt contains character-like tags that are not in the local character/copyright index.", "Replace them with lookup/glossary canonical tags or use generic visual traits.")
        if canvas_danbooru_policy.has_substitute_character_language(prompt):
            add("block", "danbooru_substitute_character_language", "Prompt appears to replace the requested named character with a lookalike or invented alias.", "Use the locally resolved canonical character tag instead.")
        prompt_tag_set = {
            canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
            for item in prompt.split(",")
            if str(item or "").strip()
        }
        forbidden_positive_tags = sorted(
            tag for tag in prompt_tag_set if canvas_danbooru_service._canvas_is_forbidden_positive_tag(tag)
        )
        if forbidden_positive_tags:
            add("block", "danbooru_forbidden_positive_tag", "Prompt contains forbidden positive tag(s): " + ", ".join(forbidden_positive_tags), "Remove these tags from the positive prompt; use a separate negative prompt only when needed.")
        if unescaped_parenthetical_tags:
            safe_examples = [canvas_danbooru_service._canvas_prompt_safe_danbooru_tag(tag) for tag in unescaped_parenthetical_tags[:4]]
            add("warning", "danbooru_parentheses_unescaped", "Prompt has literal parenthetical tag(s) that may be parsed as weight syntax.", "Escape canonical tag parentheses, for example: " + ", ".join(safe_examples))
        resolved_character_tags = [str(item.get("tag") or "") for item in character_resolution.get("resolved") or [] if item.get("tag")]
        resolved_copyright_tags = canvas_danbooru_policy.drop_redundant_copyright_tags(
            resolved_character_tags,
            [str(item.get("tag") or "") for item in character_resolution.get("copyright_candidates") or [] if item.get("tag")],
        )
        if resolved_character_tags and "no_humans" not in prompt_tag_set and not prompt_tag_set.intersection({"1girl", "1boy"}):
            add("block", "danbooru_subject_count_missing", "Named character prompt is missing 1girl/1boy.", "Add an explicit subject-count tag such as 1girl or 1boy before solo.")
        missing_resolved = [tag for tag in resolved_character_tags + resolved_copyright_tags if tag and tag not in prompt_tag_set]
        if missing_resolved and user_prompt:
            add("block", "danbooru_character_not_applied", "A named character/copyright was resolved locally but is missing from the final prompt.", "Include the resolved canonical tag(s): " + ", ".join(missing_resolved[:8]))
        if character_resolution.get("state") == "ambiguous":
            add("block", "danbooru_character_ambiguous", "Named character lookup returned multiple plausible local candidates.", "Choose one canonical character tag before submitting.")
        elif character_resolution.get("state") == "unresolved":
            add("warning", "danbooru_character_unresolved", "Possible character name was not found in the local character glossary or Danbooru index.", "Do not invent a character tag; add it to the glossary or use generic visual traits.")
        if unmatched_terms:
            add("warning", "danbooru_unmatched", "Some prompt terms were not matched in local Danbooru tags.", "Review unmatched terms and replace them with canonical tags when possible.")
        if matches:
            add("pass", "danbooru_matches", f"Danbooru lookup found {len(matches)} candidate canonical tag(s).")
        if resolved_character_tags or resolved_copyright_tags:
            add("pass", "danbooru_character_lookup", "Local character/copyright lookup resolved: " + ", ".join((resolved_character_tags + resolved_copyright_tags)[:8]))

    elif target_key_lower == "flux_t5_en":
        if has_chinese:
            add("block", "flux_chinese", "FLUX/T5XXL final prompt contains Chinese characters.", "Translate the final prompt into English natural language.")
        elif prompt:
            add("pass", "flux_language", "FLUX/T5XXL prompt is English-only.")

    elif target_key_lower == "wan_video_cn":
        motion_terms = (
            "转", "走", "跑", "继续", "移动", "推", "拉", "摇", "跟随", "镜头", "画面", "逐渐", "缓慢",
            "turn", "walk", "run", "move", "camera", "tracking", "pan", "dolly", "continues", "gradually", "slowly",
        )
        has_motion = any(term in prompt.lower() for term in motion_terms)
        if tag_like and not has_motion:
            add("warning", "wan_static_tags", "Wan video prompt looks like a static tag list.", "Describe action progression, camera movement, and temporal continuity.")
        elif not has_motion:
            add("warning", "wan_motion_missing", "Wan video prompt may be missing motion/camera continuity.", "Add what moves, how the shot changes, and what remains consistent.")
        else:
            add("pass", "wan_motion", "Wan video prompt includes motion or camera continuity.")

    elif target_key_lower == "qwen_natural":
        subject_terms = ("人", "女孩", "男孩", "角色", "subject", "girl", "boy", "character", "person")
        action_terms = ("在", "拿", "看", "走", "站", "跑", "转", "做", "holding", "looking", "walking", "standing", "turning")
        scene_terms = ("场景", "街", "房间", "夜", "雨", "森林", "背景", "scene", "street", "room", "night", "rain", "background")
        camera_terms = ("镜头", "构图", "近景", "远景", "低机位", "camera", "composition", "close-up", "wide shot", "low angle")
        missing = []
        lower = prompt.lower()
        if not any(term in lower for term in subject_terms):
            missing.append("subject")
        if not any(term in lower for term in action_terms):
            missing.append("action")
        if not any(term in lower for term in scene_terms):
            missing.append("scene")
        if not any(term in lower for term in camera_terms):
            missing.append("camera/composition")
        if missing:
            add("warning", "qwen_visual_logic_missing", "Qwen/Z-image prompt may lack visual story logic: " + ", ".join(missing), "Add subject, visible action, setting, emotion/conflict, and camera/composition.")
        else:
            add("pass", "qwen_visual_logic", "Qwen/Z-image prompt includes basic visual story elements.")

    if not checks and prompt:
        add("pass", "basic_prompt", "Prompt is present.")

    if any(item["level"] == "block" for item in checks):
        state = "block"
    elif any(item["level"] == "warning" for item in checks):
        state = "warning"
    else:
        state = "pass"

    summary = {
        "pass": "Prompt preflight passed.",
        "warning": "Prompt preflight has warnings.",
        "block": "Prompt preflight blocked submission.",
    }.get(state, "Prompt preflight checked.")

    return {
        "ok": True,
        "state": state,
        "summary": summary,
        "checks": checks,
        "matches": matches,
        "unmatched_terms": unmatched_terms,
        "character_resolution": character_resolution,
        "unknown_character_tags": unknown_character_tags,
        "preset_defaults": {
            "styles": preset_defaults.get("styles") if isinstance(preset_defaults.get("styles"), list) else [],
            "negative_prompt": str(preset_defaults.get("negative_prompt") or "")[:1000],
        },
        "prompt_target": target,
        "tag_source": tag_source_mode,
        "wildcard_preview": wildcard_preview,
        "action": action,
        "purpose": purpose,
        "prompt_compiler": h3_validation,
    }


def repair_sdxl_named_character_prompt(
    prompt,
    user_prompt,
    prompt_intent=None,
    variation_strength=None,
    prompt_variant_seed=None,
):
    source_prompt = str(prompt or "").strip()
    if not source_prompt:
        return source_prompt
    pure_scenery = canvas_vlm_prompt_pipeline.compose_sdxl_pure_scenery_prompt(
        user_prompt,
        source_prompt,
        prompt_intent=prompt_intent,
    )
    if pure_scenery.get("locked"):
        fixed_scenery = str(pure_scenery.get("prompt") or "").strip()
        if fixed_scenery:
            return fixed_scenery
    resolution = canvas_danbooru_service._canvas_requested_character_resolution(user_prompt)
    user_entity_terms = canvas_danbooru_service._canvas_character_entity_terms(user_prompt)
    if resolution.get("state") != "resolved" and user_entity_terms:
        fallback_resolution = canvas_danbooru_service._canvas_requested_character_resolution(user_prompt, source_prompt)
        if fallback_resolution.get("state") == "resolved":
            resolution = fallback_resolution
    resolved_tags = [str(item.get("tag") or "").strip() for item in resolution.get("resolved") or [] if item.get("tag")]
    copyright_tags = [
        str(item.get("tag") or "").strip()
        for item in resolution.get("copyright_candidates") or []
        if item.get("tag")
    ]
    named_source_terms = []
    if not resolved_tags:
        named_match = re.search(r"\bnamed\s+([a-zA-Z][a-zA-Z0-9_-]{2,})", str(user_prompt or ""), re.I)
        if named_match:
            named_source_terms.append(named_match.group(1))
    if resolved_tags:
        composed = canvas_vlm_prompt_pipeline.compose_sdxl_named_character_prompt(
            user_prompt,
            source_prompt,
            resolution=resolution,
            variation_strength=variation_strength,
            prompt_variant_seed=prompt_variant_seed,
            prompt_intent=prompt_intent,
        )
        if composed.get("adult") and composed.get("state") == "blocked":
            return ""
        fixed = str(composed.get("prompt") or "").strip()
        if not fixed:
            fixed = canvas_danbooru_policy.build_named_character_prompt(
                user_prompt,
                source_prompt,
                resolved_tags=resolved_tags,
                copyright_tags=copyright_tags,
            )
    else:
        generic = canvas_vlm_prompt_pipeline.compose_sdxl_generic_prompt(user_prompt, source_prompt, prompt_intent=prompt_intent)
        generic_fixed = str(generic.get("prompt") or "").strip() if isinstance(generic, dict) else ""
        if generic_fixed:
            return generic_fixed
        unknown_tags = canvas_danbooru_service._canvas_unknown_character_like_prompt_tags(source_prompt)
        if not user_entity_terms:
            unknown_tags += canvas_danbooru_service._canvas_known_identity_prompt_tags(source_prompt)
        fixed = canvas_danbooru_policy.repair_tag_list(
            source_prompt,
            resolved_tags=resolved_tags,
            copyright_tags=copyright_tags,
            unknown_tags=unknown_tags,
            named_source_terms=named_source_terms,
        )
    if re.search(r"(半身|半身照|上半身|bust|upper body|upper_body)", str(user_prompt or ""), re.I):
        tags = [item.strip() for item in fixed.split(",") if item.strip()]
        normalized_tags = {
            canvas_danbooru_service._canvas_clean_prompt_tag_name(item)
            for item in tags
            if str(item or "").strip()
        }
        if "upper_body" not in normalized_tags:
            insert_at = 2 if len(tags) >= 2 else len(tags)
            tags.insert(insert_at, "upper_body")
        fixed = ", ".join(dict.fromkeys(tags))
    return canvas_danbooru_service._canvas_prompt_safe_danbooru_text(fixed)
