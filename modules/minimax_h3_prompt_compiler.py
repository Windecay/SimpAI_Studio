import re


COMPILER_ID = "minimax_h3"
MODE_T2VA = "T2VA"
MODE_I2VA = "I2VA"
MODE_FL2VA = "FL2VA"
MODE_L2VA = "L2VA"
MODE_REF2VA = "Ref2VA"

BASE_SECTIONS = (
    "integrated_multimodal_description",
    "overall_soundscape",
    "non_diegetic_music",
)
REFERENCE_SECTIONS = (
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
)

_SECTION_RE = re.compile(
    r"(?mi)^(integrated_multimodal_description|overall_soundscape|non_diegetic_music|"
    r"subject_definitions|summary|retention_analysis|detailed_description)\s*:\s*"
)
_SHOT_RE = re.compile(
    r"\[Shot\s+(\d+)\](?:\s+(?:At\s+(\d{2}):(\d{2}(?:\.\d{1,3})?)|"
    r"(\d+(?:\.\d{1,3})?)\s*-\s*(\d+(?:\.\d{1,3})?)\s*(?:s|seconds?)?))?",
    re.IGNORECASE,
)
_REFERENCE_RE = re.compile(r"<(Picture|Video|Audio)\s+(\d+)>", re.IGNORECASE)
_REFERENCE_VARIANT_RE = re.compile(
    r"(?<![A-Za-z0-9])(?:[<\uff1c\u3008\[]\s*)?"
    r"(Picture|Image|Video|Audio)\s*#?\s*(\d+)"
    r"(?:\s*[>\uff1e\u3009\]])?(?![A-Za-z0-9])",
    re.IGNORECASE,
)
_REFERENCE_TITLES = {
    "picture": "Picture",
    "image": "Picture",
    "video": "Video",
    "audio": "Audio",
}


def _clean_text(value):
    return str(value or "").strip()


def _safe_count(value, default=0):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return max(0, int(default))


def _safe_duration(value):
    try:
        duration = float(value)
    except (TypeError, ValueError):
        return None
    if duration <= 0:
        return None
    return round(duration, 3)


def normalize_compiler(value):
    if isinstance(value, dict):
        compiler_id = _clean_text(value.get("id") or value.get("compiler") or value.get("name"))
        route = _clean_text(value.get("route") or value.get("mode"))
        if not compiler_id and len(value) == 1:
            compiler_id, route = next(iter(value.items()))
            compiler_id = _clean_text(compiler_id)
            route = _clean_text(route)
        raw = " ".join(part for part in (compiler_id, route) if part)
    else:
        raw = _clean_text(value)
        route = raw
    normalized = raw.lower().replace("-", "_").replace(" ", "_")
    if "minimax" not in normalized or "h3" not in normalized:
        return None
    route_normalized = _clean_text(route).lower().replace("-", "_").replace(" ", "_")
    if route_normalized == "reference" or "ref2va" in route_normalized or "r2v" in route_normalized:
        route_id = "reference"
    elif route_normalized == "last_frame" or "last_frame" in route_normalized or "l2va" in route_normalized:
        route_id = "last_frame"
    elif route_normalized == "frame_anchor" or "frame" in route_normalized or "i2v" in route_normalized or "fl2va" in route_normalized:
        route_id = "frame_anchor"
    else:
        route_id = "text"
    return {"id": COMPILER_ID, "route": route_id}


def scene_compiler(scene_frontend, theme=""):
    scene = scene_frontend if isinstance(scene_frontend, dict) else {}
    raw = scene.get("prompt_compiler")
    if isinstance(raw, dict) and not any(key in raw for key in ("id", "compiler", "name", "mode", "route")):
        selected_theme = _clean_text(theme)
        if selected_theme and selected_theme in raw:
            raw = raw.get(selected_theme)
        elif raw:
            raw = next(iter(raw.values()))
    return normalize_compiler(raw)


def target_compiler(target):
    data = target if isinstance(target, dict) else {}
    compiler = normalize_compiler(data.get("prompt_compiler"))
    if compiler:
        return compiler
    haystack = " ".join(
        _clean_text(data.get(key))
        for key in ("key", "name", "label", "task_method", "source")
    )
    if "minimax" not in haystack.lower() or "h3" not in haystack.lower():
        return None
    task_method = _clean_text(data.get("task_method")).lower()
    if "r2v" in task_method:
        return {"id": COMPILER_ID, "route": "reference"}
    if "i2v" in task_method:
        return {"id": COMPILER_ID, "route": "frame_anchor"}
    return {"id": COMPILER_ID, "route": "text"}


def normalize_context(context=None):
    data = context if isinstance(context, dict) else {}
    descriptors = data.get("image_descriptors") if isinstance(data.get("image_descriptors"), list) else []
    director = data.get("director") if isinstance(data.get("director"), dict) else {}
    explicit_inventory = any(
        key in data for key in (
            "generation_image_count",
            "image_count",
            "video_count",
            "audio_count",
            "image_descriptors",
        )
    )
    if "generation_image_count" in data:
        image_count = _safe_count(data.get("generation_image_count"))
    else:
        image_count = _safe_count(data.get("image_count"), len(descriptors))
    if "video_count" in data:
        video_count = _safe_count(data.get("video_count"))
    else:
        video_count = int(bool(data.get("video_path") or data.get("video_used") or data.get("video_source")))
        video_count += int(bool(data.get("reference_video_present")))
    if "audio_count" in data:
        audio_count = _safe_count(data.get("audio_count"))
    else:
        audio_count = int(bool(data.get("audio_present")))
    if director.get("enabled"):
        video_count = int(bool(director.get("video_ref")))
        audio_count = int(bool(director.get("audio_ref")) and bool(data.get("audio_present")))
    duration = _safe_duration(data.get("target_duration_seconds") or data.get("duration_seconds") or data.get("duration"))
    language = _clean_text(data.get("language") or data.get("lang") or data.get("__lang")).lower()
    if language.startswith("en"):
        language = "en"
    elif language in {"cn", "zh", "zh-cn", "zh_cn", "chinese", "simplified_chinese"} or language.startswith("zh"):
        language = "cn"
    else:
        language = ""
    return {
        "duration_seconds": duration,
        "image_count": image_count,
        "video_count": video_count,
        "audio_count": audio_count,
        "image_descriptors": descriptors,
        "analysis_only_image_count": _safe_count(data.get("analysis_only_image_count")),
        "visual_analysis_intent": _clean_text(data.get("visual_analysis_intent")),
        "inventory_known": bool(data.get("inventory_known", explicit_inventory)),
        "director": director,
        "language": language,
        "storyboard_form": bool(data.get("storyboard_form") or data.get("h3_storyboard_form")),
    }


def resolve_mode(compiler, context=None):
    spec = normalize_compiler(compiler) if not isinstance(compiler, dict) or compiler.get("id") != COMPILER_ID else compiler
    if not spec:
        return ""
    route = _clean_text(spec.get("route")).lower()
    media = normalize_context(context)
    if route == "reference":
        return MODE_REF2VA
    if route == "last_frame":
        return MODE_L2VA
    if route == "frame_anchor":
        return MODE_FL2VA if media["image_count"] >= 2 else MODE_I2VA
    return MODE_T2VA


def _reference_inventory_lines(context):
    media = normalize_context(context)
    lines = []
    descriptors = media.get("image_descriptors") or []
    for index in range(media["image_count"]):
        descriptor = descriptors[index] if index < len(descriptors) and isinstance(descriptors[index], dict) else {}
        role = _clean_text(descriptor.get("role")) or "reference image"
        lines.append(f"- <Picture {index + 1}>: {role}")
    for index in range(media["video_count"]):
        lines.append(f"- <Video {index + 1}>: video reference; its embedded soundtrack stays paired with this video")
    for index in range(media["audio_count"]):
        lines.append(f"- <Audio {index + 1}>: independent audio reference")
    return lines


def context_note(context=None):
    media = normalize_context(context)
    lines = []
    if media["language"] == "cn":
        lines.append("- Editable prompt content language: Simplified Chinese.")
    elif media["language"] == "en":
        lines.append("- Editable prompt content language: English.")
    if media["duration_seconds"] is not None:
        lines.append(f"- Target duration: {media['duration_seconds']:.3f} seconds")
    if media["analysis_only_image_count"]:
        analysis_label = media["visual_analysis_intent"] or "visual planning"
        lines.append(
            f"- Analysis-only {analysis_label} images: {media['analysis_only_image_count']}. "
            "Read them for shot planning, but never name them as <Picture N> or treat them as H3 generation media."
        )
    lines.extend(_reference_inventory_lines(media))
    if media["inventory_known"] and not any(
        media[key] for key in ("image_count", "video_count", "audio_count")
    ):
        lines.append(
            "- Numbered runtime references: none. Do not write <Picture N>, <Video N>, or <Audio N>."
        )
    director = media.get("director") or {}
    if director.get("enabled"):
        lines.append(
            "- Director segment: "
            f"{_safe_count(director.get('segment_index')) + 1}, "
            f"{director.get('start_seconds')} to {director.get('end_seconds')} seconds"
        )
    if not lines:
        lines.append("- No runtime media inventory was supplied; never exceed the selected H3 mode limits.")
    return "\n".join(lines)


def _ref2va_subject_binding_rules(context=None):
    media = normalize_context(context)
    subject_map = ", ".join(
        f"<Subject {index}> (<Picture {index}>)"
        for index in range(1, media["image_count"] + 1)
    )
    inventory_rule = (
        f"For this runtime inventory, the default one-to-one map is: {subject_map}. "
        if subject_map
        else "Apply the same one-to-one numbering rule to every runtime <Picture N>. "
    )
    if media["language"] == "cn":
        subject_content_rule = (
            "For Simplified Chinese output, every subject_definitions line must use this exact binding prefix: "
            "<Subject N> (<Picture N>):. After the colon, write one concise Simplified Chinese description of the "
            "actual visible person in that picture. Use only useful identifying traits such as apparent age and gender, "
            "face or hairstyle, main clothing shape and colors, and distinctive accessories; omit traits that cannot be "
            "seen. Keep it as a short description, normally no more than one sentence. The English editor scaffold "
            "'Independent character defined only by this picture. Preserve identity, face, hairstyle, clothing, colors, "
            "accessories, and distinguishing features; do not merge this subject with any other numbered subject.' is "
            "placeholder metadata, not user-authored content: replace it instead of preserving, translating, or extending "
            "it. Do not use generic Chinese protection prose such as 作为独立角色, 完整保留其全部辨识特征, or "
            "不与其他角色融合 in subject_definitions. "
        )
    else:
        subject_content_rule = (
            "In subject_definitions, write one separate line per picture using exactly this binding prefix: "
            "<Subject N> (<Picture N>):. After the colon, give one concise description of the actual visible person in "
            "that picture. Use useful identifying traits such as apparent age and gender, face or hairstyle, main "
            "clothing shape and colors, and distinctive accessories; omit traits that cannot be seen. Never replace the "
            "visible description with generic preservation instructions. "
        )
    return (
        "Treat every runtime picture as an independent subject by default; Picture N maps to Subject N. "
        f"{inventory_rule}"
        f"{subject_content_rule}"
        "subject_definitions is the single place for the full appearance description. In detailed_description, write the "
        "relevant <Picture N> tokens directly in the shot action; one shot may name multiple picture tokens, and the "
        "picture order should follow the user's action when it matters. Do not automatically add <Subject N> labels or "
        "<Subject N> (<Picture N>) pairs inside a shot. Only include a Subject label in a shot when the user's original "
        "request explicitly requires that label; do not repeat the identity checklist, preservation declaration, or "
        "non-merging declaration inside each shot. Do not merge identities across pictures "
        "or write same primary subject, same character, or 同一主要人物 merely because the images have a similar style, "
        "gender, clothing, or setting. Only merge pictures when the user''s original intent explicitly names the affected "
        "picture numbers and states that they depict the same identity. A generic same-subject phrase already present in a "
        "draft is not explicit identity evidence; keep the one-to-one subject_definitions map and use the picture tokens "
        "the user supplied in each shot."
    )


def build_system_instructions(target_or_compiler, context=None):
    target = target_or_compiler if isinstance(target_or_compiler, dict) else {"prompt_compiler": target_or_compiler}
    compiler = target_compiler(target) or normalize_compiler(target_or_compiler)
    target_context = context
    if target_context is None and isinstance(target, dict):
        target_context = target.get("prompt_compiler_context")
    mode = resolve_mode(compiler, target_context)
    if not mode:
        return ""
    media = normalize_context(target_context)
    if media["language"] == "cn":
        language_rule = (
            "Keep required H3 section names, shot markers, timestamps, media tokens, and the field labels Camera, "
            "Dialogue and visible text, and Synchronized sound in English, but write all editable field content in "
            "fluent Simplified Chinese."
        )
        empty_dialogue = "无"
        empty_sound = "静音"
    elif media["language"] == "en":
        language_rule = "Write editable field content in fluent English."
        empty_dialogue = "None"
        empty_sound = "Silence"
    else:
        language_rule = (
            "Write editable field content in the user's language; use Simplified Chinese when the request contains Chinese."
        )
        empty_dialogue = "无 for Chinese or None for English"
        empty_sound = "静音 for Chinese or Silence for English"
    common = (
        "Output only the finished MiniMax H3 prompt, with no Markdown fence, explanation, JSON, or analysis. "
        f"{language_rule} Preserve exact dialogue, lyrics, and visible text in their original language. "
        "Put only spoken words inside <d>[Language] ...</d>. Keep ambience and synchronized physical sounds in "
        "overall_soundscape; put only audience-only score in non_diegetic_music. Preserve the user's identities, actions, "
        "dialogue, endpoint frames, and requested style. Do not invent media labels or unsupported reference content. "
        "Every legal <Picture N>, <Video N>, and <Audio N> token already present in the user's prompt is immutable: keep "
        "its exact type and number, and never delete, translate, renumber, or reformat it. "
        "Every shot must use an explicit [Shot N] START-ENDs interval marker in chronological order; Shot 1 must start at "
        "0 seconds, all later starts must increase, and the final end must match the target duration. Legacy prompts may "
        "still contain [Shot N] At MM:SS.mmm markers and must remain readable. Give each speaking or singing source a stable "
        "(S1), (S2), and so on. Put visible "
        "text in English double quotation marks. Inside every shot, write the visible scene/action first, then always include "
        "these exact labels in this order: Camera:, Dialogue and visible text:, Synchronized sound:. Fill Camera with a "
        "suitable camera design when the user did not specify one. If no dialogue or visible text was requested, write "
        f"{empty_dialogue} after Dialogue and visible text:. If no sound was requested, write {empty_sound} after "
        "Synchronized sound:. Do not merge these fields into one paragraph. Camera movement must state its type, meaningful "
        "amplitude, and speed. Use N/A when there is no non-diegetic score."
    )
    if mode == MODE_REF2VA:
        format_rules = (
            "Return exactly these six sections in this order: subject_definitions, summary, retention_analysis, "
            "detailed_description, overall_soundscape, non_diegetic_music. Each section name must be lowercase and followed "
            "by a colon. Number <Picture N>, <Video N>, and <Audio N> independently and use only labels listed in the runtime "
            "inventory. Use stable <Subject N> labels in subject_definitions; shots may directly reference one or more "
            "<Picture N> tokens without adding Subject labels. In summary, use only applicable task types from: keyframe completion, "
            "reference generation, video editing, video continuation, audio reuse, audio reference. In retention_analysis, "
            "use only fully_preserved, partially_preserved, attribute_transfer, or weak_reference for visual media, and "
            "fully_copy, partially_copy, reference, or weak_reference for audio. Establish style before [Shot 1] in "
            "detailed_description, then write an explicit chronological plan with enough detail for the existing shots. "
            "Do not add filler, new shots, or unrelated events. "
            f"{_ref2va_subject_binding_rules(target_context)}"
        )
    else:
        alignment = {
            MODE_T2VA: "Do not add an image-alignment preamble.",
            MODE_I2VA: "Before the three sections, add one image-alignment line stating that <Picture 1> is fully referenced at 0.00 seconds, then one blank line.",
            MODE_FL2VA: "Before the three sections, add one image-alignment line stating that <Picture 1> aligns at 0.00 seconds and <Picture 2> aligns at the target duration, then one blank line.",
            MODE_L2VA: "Before the three sections, add one image-alignment line stating that <Picture 1> aligns at the target duration, then one blank line.",
        }[mode]
        format_rules = (
            f"{alignment} Return exactly these three sections in this order: integrated_multimodal_description, "
            "overall_soundscape, non_diegetic_music. Each section name must be lowercase and followed by a colon. "
            "integrated_multimodal_description must begin with [Shot 1]."
        )
    return f"MiniMax H3 prompt compiler mode: {mode}.\n{format_rules}\n{common}\nRuntime media inventory:\n{context_note(target_context)}"


def _shot_marker_text(match):
    marker = f"[Shot {match.group(1)}]"
    if match.group(4) is not None:
        marker += f" {match.group(4)}-{match.group(5)}s"
    elif match.group(2) is not None:
        marker += f" At {match.group(2)}:{match.group(3)}"
    return marker


def build_rewrite_request(prompt, target_or_compiler, context=None):
    target = target_or_compiler if isinstance(target_or_compiler, dict) else {"prompt_compiler": target_or_compiler}
    compiler = target_compiler(target) or normalize_compiler(target_or_compiler)
    target_context = context
    if target_context is None and isinstance(target, dict):
        target_context = target.get("prompt_compiler_context")
    mode = resolve_mode(compiler, target_context)
    if not mode:
        return _clean_text(prompt)
    source_prompt = _clean_text(prompt)
    source_shots = list(_SHOT_RE.finditer(source_prompt))
    storyboard_lock = ""
    if source_shots:
        markers = []
        for shot in source_shots:
            markers.append(_shot_marker_text(shot))
        storyboard_lock = (
            "\n\nStructured storyboard lock:\n"
            f"Preserve exactly {len(source_shots)} shots, in the same order, with these exact markers and start times: "
            + "; ".join(markers)
            + ". Improve the content inside each shot without merging, deleting, splitting, or renumbering shots."
        )
    protected_references = protected_reference_tokens(source_prompt, compiler, target_context)
    reference_lock = ""
    if protected_references:
        reference_lock = (
            "\n\nProtected media reference lock:\nPreserve these exact source tokens wherever they already appear: "
            + ", ".join(protected_references)
            + ". Never delete, translate, renumber, retype, or replace them with synonyms."
        )
    subject_binding_lock = ""
    if mode == MODE_REF2VA:
        subject_binding_lock = (
            "\n\nRef2VA subject definitions and picture references:\n"
            + _ref2va_subject_binding_rules(target_context)
        )
    return (
        f"Compile this rough request into the required MiniMax H3 {mode} structure.\n\n"
        f"Runtime context:\n{context_note(target_context)}\n\n"
        f"User intent:\n{source_prompt}{storyboard_lock}{reference_lock}{subject_binding_lock}"
    )


def _section_values(prompt, required_sections):
    matches = list(_SECTION_RE.finditer(prompt))
    names = [match.group(1).lower() for match in matches]
    values = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(prompt)
        values.setdefault(match.group(1).lower(), []).append(prompt[match.end():end].strip())
    required_matches = [name for name in names if name in required_sections]
    return matches, names, required_matches, values


def _shot_errors(text, duration):
    errors = []
    shots = list(_SHOT_RE.finditer(text or ""))
    if not shots:
        return ["The timeline must start with [Shot 1]."]
    expected_number = 1
    previous_time = -1.0
    intervals = []
    for index, shot in enumerate(shots):
        number = int(shot.group(1))
        if number != expected_number:
            errors.append("Shot numbers must be consecutive from [Shot 1].")
            break
        minute_text, second_text = shot.group(2), shot.group(3)
        range_start, range_end = shot.group(4), shot.group(5)
        if range_start is not None:
            timestamp = float(range_start)
            end = float(range_end)
            if index == 0 and abs(timestamp) > 0.001:
                errors.append("[Shot 1] must start at 0 seconds.")
            if end <= timestamp:
                errors.append(f"[Shot {number}] must end after its start time.")
            if duration is not None and end > duration + 0.001:
                errors.append(f"[Shot {number}] ends after the {duration:.3f}-second target duration.")
        elif index == 0:
            if minute_text is not None:
                errors.append("[Shot 1] must not use a legacy timestamp.")
            timestamp = 0.0
            end = None
        else:
            if minute_text is None:
                errors.append(f"[Shot {number}] must include a START-ENDs interval or legacy At MM:SS.mmm timestamp.")
                timestamp = previous_time
            else:
                timestamp = int(minute_text) * 60 + float(second_text)
            end = None
        if index > 0 and timestamp <= previous_time:
            errors.append("Shot start times must be strictly increasing.")
        if index > 0 and duration is not None and timestamp >= duration:
            errors.append(f"[Shot {number}] starts at or after the {duration:.3f}-second target duration.")
        intervals.append((timestamp, end, number))
        previous_time = timestamp
        expected_number += 1
    for index, (start, end, number) in enumerate(intervals):
        if end is None:
            continue
        if index + 1 < len(intervals):
            next_start = intervals[index + 1][0]
            if abs(end - next_start) > 0.001:
                errors.append(f"[Shot {number}] interval must end where the next shot starts.")
        elif duration is not None and abs(end - duration) > 0.001:
            errors.append(f"The final shot must end at the {duration:.3f}-second target duration.")
    return errors


def _preamble_mentions_time(preamble, seconds):
    if seconds is None:
        return True
    compact = f"{seconds:.3f}".rstrip("0").rstrip(".")
    whole = str(int(seconds)) if float(seconds).is_integer() else compact
    candidates = {compact, whole, f"{seconds:.2f}", f"{seconds:.3f}"}
    return any(
        re.search(rf"(?<!\d){re.escape(candidate)}(?!\d)\s*(?:seconds?|s)?", preamble, re.I)
        for candidate in candidates
        if candidate
    )


def _reference_limits(mode, media):
    if mode == MODE_T2VA:
        return {"picture": 0, "video": 0, "audio": 0}
    if mode in {MODE_I2VA, MODE_L2VA}:
        return {"picture": 1, "video": 0, "audio": 0}
    if mode == MODE_FL2VA:
        return {"picture": 2, "video": 0, "audio": 0}
    if media.get("inventory_known"):
        return {
            "picture": media["image_count"],
            "video": media["video_count"],
            "audio": media["audio_count"],
        }
    return {"picture": 5, "video": 2, "audio": 1}


def _reference_target_context(target_or_compiler, context=None):
    target = target_or_compiler if isinstance(target_or_compiler, dict) else {"prompt_compiler": target_or_compiler}
    compiler = target_compiler(target) or normalize_compiler(target_or_compiler)
    target_context = context
    if target_context is None and isinstance(target, dict):
        target_context = target.get("prompt_compiler_context")
    media = normalize_context(target_context)
    return compiler, media, resolve_mode(compiler, media)


def _canonical_reference(kind, number):
    title = _REFERENCE_TITLES.get(_clean_text(kind).lower())
    return f"<{title} {int(number)}>" if title else ""


def protected_reference_tokens(prompt, target_or_compiler, context=None):
    _compiler, media, mode = _reference_target_context(target_or_compiler, context)
    if not mode:
        return []
    limits = _reference_limits(mode, media)
    protected = []
    for kind, raw_number in _REFERENCE_RE.findall(_clean_text(prompt)):
        key = kind.lower()
        number = int(raw_number)
        if number < 1 or number > limits.get(key, 0):
            continue
        token = _canonical_reference(key, number)
        if token and token not in protected:
            protected.append(token)
    return protected


def _reference_key_from_variant(kind, number):
    canonical_kind = "picture" if _clean_text(kind).lower() == "image" else _clean_text(kind).lower()
    return canonical_kind, int(number)


def _canonicalize_protected_reference_variants(value, protected):
    protected_keys = {
        (kind.lower(), int(number))
        for kind, number in _REFERENCE_RE.findall(" ".join(protected))
    }

    def replace(match):
        key = _reference_key_from_variant(match.group(1), match.group(2))
        return _canonical_reference(*key) if key in protected_keys else match.group(0)

    return _REFERENCE_VARIANT_RE.sub(replace, _clean_text(value))


def _restore_single_renumbered_references(value, protected):
    text = _clean_text(value)
    protected_by_kind = {"picture": [], "video": [], "audio": []}
    for kind, number in _REFERENCE_RE.findall(" ".join(protected)):
        token = _canonical_reference(kind, number)
        if token and token not in protected_by_kind[kind.lower()]:
            protected_by_kind[kind.lower()].append(token)
    for kind, tokens in protected_by_kind.items():
        if len(tokens) != 1 or tokens[0] in text:
            continue
        replacement = tokens[0]
        replaced = False

        def replace(match):
            nonlocal replaced
            candidate_kind, _number = _reference_key_from_variant(match.group(1), match.group(2))
            if replaced or candidate_kind != kind:
                return match.group(0)
            replaced = True
            return replacement

        text = _REFERENCE_VARIANT_RE.sub(replace, text)
    return text


def _reference_section_name(prompt, token):
    text = _clean_text(prompt)
    matches = list(_SECTION_RE.finditer(text))
    first_section_start = matches[0].start() if matches else len(text)
    if token in text[:first_section_start]:
        return "__preamble__"
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        if token in text[match.end():end]:
            return match.group(1).lower()
    return ""


def _insert_missing_references(value, source_prompt, missing):
    text = _clean_text(value)
    if not missing:
        return text
    grouped = {}
    canonical_source = _canonicalize_protected_reference_variants(source_prompt, missing)
    for token in missing:
        grouped.setdefault(_reference_section_name(canonical_source, token), []).append(token)

    preamble_tokens = grouped.pop("__preamble__", [])
    if preamble_tokens:
        text = " ".join(preamble_tokens) + (f"\n\n{text}" if text else "")

    matches = list(_SECTION_RE.finditer(text))
    insertions = []
    for section, tokens in grouped.items():
        if not section:
            continue
        match_index = next(
            (index for index, match in enumerate(matches) if match.group(1).lower() == section),
            None,
        )
        if match_index is None:
            continue
        end = matches[match_index + 1].start() if match_index + 1 < len(matches) else len(text)
        insertions.append((end, " ".join(tokens)))
    inserted = set(preamble_tokens)
    for position, tokens_text in sorted(insertions, reverse=True):
        tokens = tokens_text.split()
        inserted.update(
            token
            for token in missing
            if token in tokens_text
        )
        before = text[:position].rstrip()
        after = text[position:]
        text = f"{before} {tokens_text}{after}"
    remaining = [token for token in missing if token not in inserted]
    if remaining:
        text = f"{text.rstrip()}\n\n{' '.join(remaining)}" if text else " ".join(remaining)
    return text


def preserve_rewrite_references(source_prompt, rewritten_prompt, target_or_compiler, context=None):
    protected = protected_reference_tokens(source_prompt, target_or_compiler, context)
    candidate = _clean_text(rewritten_prompt)
    if not protected or not candidate:
        return candidate
    candidate = _canonicalize_protected_reference_variants(candidate, protected)
    candidate = _restore_single_renumbered_references(candidate, protected)
    missing = [token for token in protected if token not in candidate]
    return _insert_missing_references(candidate, source_prompt, missing)


def rewrite_request_source_prompt(value):
    text = _clean_text(value)
    matches = list(re.finditer(r"(?mi)^User request:\s*", text))
    return _clean_text(text[matches[-1].end():]) if matches else text


def validate_prompt(prompt, target_or_compiler, context=None):
    text = _clean_text(prompt)
    target = target_or_compiler if isinstance(target_or_compiler, dict) else {"prompt_compiler": target_or_compiler}
    compiler = target_compiler(target) or normalize_compiler(target_or_compiler)
    target_context = context
    if target_context is None and isinstance(target, dict):
        target_context = target.get("prompt_compiler_context")
    media = normalize_context(target_context)
    mode = resolve_mode(compiler, media)
    if not mode:
        return {"ok": True, "mode": "", "errors": [], "warnings": [], "references": {}}
    errors = []
    warnings = []
    if not text:
        return {"ok": False, "mode": mode, "errors": ["Prompt is empty."], "warnings": [], "references": {}}
    if media["duration_seconds"] is not None and not (4 <= media["duration_seconds"] <= 15):
        errors.append("MiniMax H3 output duration must be between 4 and 15 seconds.")

    required = REFERENCE_SECTIONS if mode == MODE_REF2VA else BASE_SECTIONS
    matches, _all_names, required_matches, values = _section_values(text, required)
    unexpected_sections = [name for name in _all_names if name not in required]
    if unexpected_sections:
        errors.append("Unexpected H3 section(s): " + ", ".join(dict.fromkeys(unexpected_sections)) + ".")
    for section in required:
        count = len(values.get(section, []))
        if count == 0:
            errors.append(f"Missing required section: {section}.")
        elif count > 1:
            errors.append(f"Section appears more than once: {section}.")
        elif not values[section][0]:
            errors.append(f"Section is empty: {section}.")
    if required_matches != list(required):
        errors.append("Required sections are not in the expected order.")

    first_required = next((match for match in matches if match.group(1).lower() in required), None)
    preamble = text[:first_required.start()].strip() if first_required else ""
    if mode in {MODE_REF2VA, MODE_T2VA} and preamble:
        errors.append(f"{mode} must begin with its first required section and no alignment preamble.")
    if mode in {MODE_I2VA, MODE_FL2VA, MODE_L2VA}:
        if not preamble:
            errors.append(f"{mode} requires an image-alignment line before the sections.")
        elif mode == MODE_I2VA and not (re.search(r"<?Picture\s+1>?", preamble, re.I) and re.search(r"0(?:\.0+)?\s*(?:seconds?|s)?", preamble, re.I)):
            errors.append("I2VA alignment must place <Picture 1> at 0.00 seconds.")
        elif mode == MODE_FL2VA:
            if not re.search(r"<?Picture\s+1>?", preamble, re.I) or not re.search(r"<?Picture\s+2>?", preamble, re.I):
                errors.append("FL2VA alignment must name <Picture 1> and <Picture 2>.")
            if not re.search(r"0(?:\.0+)?\s*(?:seconds?|s)?", preamble, re.I):
                errors.append("FL2VA alignment must place <Picture 1> at 0.00 seconds.")
            if not _preamble_mentions_time(preamble, media["duration_seconds"]):
                errors.append("FL2VA alignment must place <Picture 2> at the target duration.")
        elif mode == MODE_L2VA:
            if not re.search(r"<?Picture\s+1>?", preamble, re.I):
                errors.append("L2VA alignment must name <Picture 1> as the final frame.")
            if not _preamble_mentions_time(preamble, media["duration_seconds"]):
                errors.append("L2VA alignment must place <Picture 1> at the target duration.")

    timeline_section = "detailed_description" if mode == MODE_REF2VA else "integrated_multimodal_description"
    timeline = values.get(timeline_section, [""])[0] if values.get(timeline_section) else ""
    errors.extend(_shot_errors(timeline, media["duration_seconds"]))

    references = {"picture": [], "video": [], "audio": []}
    for kind, raw_number in _REFERENCE_RE.findall(text):
        key = kind.lower()
        number = int(raw_number)
        if number not in references[key]:
            references[key].append(number)
    limits = _reference_limits(mode, media)
    for kind, numbers in references.items():
        for number in numbers:
            if number < 1 or number > limits[kind]:
                errors.append(f"<{kind.title()} {number}> has no matching runtime reference.")
    if mode == MODE_I2VA and media["inventory_known"] and media["image_count"] < 1:
        errors.append("I2VA requires one runtime picture.")
    if mode == MODE_FL2VA and media["inventory_known"] and media["image_count"] < 2:
        errors.append("FL2VA requires two runtime pictures.")
    if mode == MODE_REF2VA:
        if not any(references.values()):
            warnings.append("Ref2VA prompt does not reference any uploaded media label.")
        detail_words = re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", timeline)
        if len(detail_words) < 180:
            warnings.append("Ref2VA detailed_description is shorter than the recommended production detail level.")
    for kind, count_key in (("picture", "image_count"), ("video", "video_count"), ("audio", "audio_count")):
        available = media[count_key]
        if media["inventory_known"] and available:
            unused = [index for index in range(1, available + 1) if index not in references[kind]]
            if unused:
                labels = ", ".join(f"<{kind.title()} {index}>" for index in unused)
                warnings.append(f"Uploaded references not mentioned in the prompt: {labels}.")

    errors = list(dict.fromkeys(errors))
    warnings = list(dict.fromkeys(warnings))
    return {
        "ok": not errors,
        "mode": mode,
        "errors": errors,
        "warnings": warnings,
        "references": references,
        "inventory": {
            "pictures": media["image_count"],
            "videos": media["video_count"],
            "audio": media["audio_count"],
            "known": media["inventory_known"],
        },
    }


def validation_error_text(validation, limit=3):
    data = validation if isinstance(validation, dict) else {}
    errors = [_clean_text(item) for item in data.get("errors") or [] if _clean_text(item)]
    if not errors:
        return ""
    return "; ".join(errors[:max(1, int(limit or 1))])


def context_from_task(task):
    params = getattr(task, "params_backend", None)
    params = params if isinstance(params, dict) else {}
    images = [
        getattr(task, key, None)
        for key in (
            "scene_canvas_image",
            "scene_input_image1",
            "scene_input_image2",
            "scene_input_image3",
            "scene_input_image4",
        )
    ]
    return {
        "duration_seconds": getattr(task, "scene_video_duration", None) or params.get("video_duration"),
        "image_count": sum(value is not None for value in images),
        "video_count": int(bool(params.get("video"))) + int(bool(params.get("reference_video"))),
        "audio_count": int(bool(params.get("audio"))),
        "inventory_known": True,
    }


def validate_task_prompt(task, compiler=None):
    if compiler is None:
        target = {
            "name": getattr(task, "task_name", ""),
            "task_method": getattr(task, "task_method", ""),
        }
    else:
        target = {"prompt_compiler": compiler}
    if not target_compiler(target):
        return None
    return validate_prompt(
        getattr(task, "prompt", ""),
        target,
        context_from_task(task),
    )
