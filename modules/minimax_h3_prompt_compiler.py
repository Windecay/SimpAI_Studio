import re


COMPILER_ID = "minimax_h3"
H3_MIN_OUTPUT_DURATION = 4.0
H3_MAX_OUTPUT_DURATION = 30.0
MODE_T2VA = "T2VA"
MODE_I2VA = "I2VA"
MODE_FL2VA = "FL2VA"
MODE_L2VA = "L2VA"
MODE_REF2VA = "Ref2VA"
MODE_R2I = "R2I"

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
_R2I_FIELD_RE = re.compile(
    r"(?i)(?<![A-Za-z])(?:Camera|Dialogue and visible text|Synchronized sound)\s*:"
)
_R2I_TIMESTAMP_RE = re.compile(
    r"(?i)(?:\b\d{1,2}:\d{2}(?:\.\d{1,3})?\b|"
    r"\b\d+(?:\.\d{1,3})?\s*-\s*\d+(?:\.\d{1,3})?\s*(?:s|seconds?)\b)"
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


def _director_ref_list(director, kind):
    data = director if isinstance(director, dict) else {}
    values = data.get(f"{kind}_refs")
    if isinstance(values, str):
        values = re.split(r"[,;|\n]+", values)
    if not isinstance(values, (list, tuple)):
        values = [data.get(f"{kind}_ref")]
    refs = []
    for item in values:
        ref = _clean_text(item.get("source_ref") if isinstance(item, dict) else item)
        if ref and ref not in refs:
            refs.append(ref)
    return refs[:3]


def _is_video_continuation(context):
    data = context if isinstance(context, dict) else {}
    if "is_video_continuation" in data:
        return bool(data.get("is_video_continuation"))
    source = _clean_text(data.get("continuation_source")).lower().replace("-", "_").replace(" ", "_")
    if source in {"previous_segment", "previous_video", "video_continuation", "continuation", "r2c"}:
        return True
    haystack = " ".join(
        _clean_text(data.get(key))
        for key in ("task_method", "task_name", "task_type", "video_mode", "continuation_source")
    ).lower()
    return bool(re.search(r"(?:^|[_\s/-])(?:r2c|video_extend|video_continuation)(?:$|[_\s/-])", haystack))


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
    if (
        "r2i" in route_normalized
        or route_normalized in {"image_reference", "image_edit", "reference_to_image"}
    ):
        route_id = "image_reference"
    elif (
        route_normalized == "reference"
        or "ref2va" in route_normalized
        or "r2v" in route_normalized
        or "r2c" in route_normalized
    ):
        route_id = "reference"
    elif "fl2va" in route_normalized:
        route_id = "frame_anchor"
    elif route_normalized == "last_frame" or "last_frame" in route_normalized or route_normalized.endswith("l2va"):
        route_id = "last_frame"
    elif route_normalized == "frame_anchor" or "frame" in route_normalized or "i2v" in route_normalized:
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
    if "minimax_h3_upscale" in task_method:
        return None
    if "r2i" in task_method:
        return {"id": COMPILER_ID, "route": "image_reference"}
    if "r2v" in task_method or "r2c" in task_method:
        return {"id": COMPILER_ID, "route": "reference"}
    if "i2v" in task_method:
        return {"id": COMPILER_ID, "route": "frame_anchor"}
    return {"id": COMPILER_ID, "route": "text"}


def normalize_context(context=None):
    data = context if isinstance(context, dict) else {}
    descriptors = data.get("image_descriptors") if isinstance(data.get("image_descriptors"), list) else []
    video_descriptors = data.get("video_descriptors") if isinstance(data.get("video_descriptors"), list) else []
    director = data.get("director") if isinstance(data.get("director"), dict) else {}
    explicit_inventory = any(
        key in data for key in (
            "generation_image_count",
            "image_count",
            "video_count",
            "audio_count",
            "image_descriptors",
            "video_descriptors",
            "reference_video_present",
        )
    )
    if "generation_image_count" in data:
        image_count = _safe_count(data.get("generation_image_count"))
    else:
        image_count = _safe_count(data.get("image_count"), len(descriptors))
    if "video_count" in data:
        video_count = _safe_count(data.get("video_count"))
    elif video_descriptors:
        video_count = len(video_descriptors)
    else:
        video_count = int(bool(data.get("video_path") or data.get("video_used") or data.get("video_source")))
        video_count += int(bool(data.get("reference_video_present")))
    if "audio_count" in data:
        audio_count = _safe_count(data.get("audio_count"))
    else:
        audio_count = int(bool(data.get("audio_present")))
    if director.get("enabled"):
        video_count = len(_director_ref_list(director, "video"))
        audio_count = len(_director_ref_list(director, "audio")) if bool(data.get("audio_present")) else 0
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
        "video_descriptors": video_descriptors,
        "video_reference_index": _safe_count(data.get("video_reference_index")),
        "motion_picture_index": _safe_count(data.get("motion_picture_index")),
        "video_requested": bool(data.get("video_requested")),
        "video_used": bool(data.get("video_used")),
        "video_source": _clean_text(data.get("video_source")),
        "continuation_source": _clean_text(data.get("continuation_source"))
        or ("previous_segment" if _is_video_continuation(data) else ""),
        "is_video_continuation": _is_video_continuation(data),
        "task_method": _clean_text(data.get("task_method")),
        "task_name": _clean_text(data.get("task_name")),
        "video_visual_count": _safe_count(data.get("video_visual_count")),
        "reference_video_present": bool(data.get("reference_video_present")),
        "reference_video_content_available": bool(data.get("reference_video_content_available")),
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
    if route == "image_reference":
        return MODE_R2I
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
    video_descriptors = media.get("video_descriptors") or []
    for index in range(media["video_count"]):
        descriptor = video_descriptors[index] if index < len(video_descriptors) and isinstance(video_descriptors[index], dict) else {}
        role = _clean_text(descriptor.get("role"))
        if media.get("is_video_continuation") and index + 1 == media.get("video_reference_index"):
            details = (
                "previous H3 clip and continuation source; start from its final scene, motion, camera direction, "
                "pacing, style, and embedded soundtrack; supplied pictures may define characters who continue or enter"
            )
        else:
            details = "video reference; its embedded soundtrack stays paired with this video"
        if role and role != "video reference":
            details += f"; runtime role: {role}"
        if media.get("video_used") and media.get("video_reference_index") == index + 1:
            details += "; chronological visual samples from this exact video token are attached to the request"
        elif media.get("video_reference_index") == index + 1 and media.get("video_requested") and not media.get("reference_video_content_available"):
            details += "; no decoded visual samples from the selected motion video reached the request"
        lines.append(f"- <Video {index + 1}>: {details}")
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
    if media.get("is_video_continuation"):
        selected_video = media.get("video_reference_index") or 1
        lines.append(
            f"- Continuation mode: <Video {selected_video}> is the previous H3 clip; write only what happens after its exact final state. "
            "Uploaded pictures define identity and appearance for characters who may continue, enter, or become visible later."
        )
    if (
        media.get("video_requested")
        and media.get("video_reference_index")
        and not media.get("video_used")
    ):
        lines.append(
            f"- The selected video reference <Video {media['video_reference_index']}> produced no decoded visual samples; do not claim that its motion, pose, or camera trajectory was analyzed."
        )
    if (
        media.get("video_requested")
        and media.get("video_source") == "reference_video"
        and media.get("reference_video_present")
        and not media.get("reference_video_content_available")
    ):
        lines.append(
            "- The selected reference video was requested for motion/timing transfer, but no decoded visual frames reached the agent; do not claim that its motion was analyzed."
        )
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


def _r2i_context_note(context=None):
    media = normalize_context(context)
    lines = []
    if media["language"] == "cn":
        lines.append("- Editable prompt content language: Simplified Chinese.")
    elif media["language"] == "en":
        lines.append("- Editable prompt content language: English.")
    for index in range(media["image_count"]):
        descriptor = (
            media["image_descriptors"][index]
            if index < len(media["image_descriptors"])
            and isinstance(media["image_descriptors"][index], dict)
            else {}
        )
        role = _clean_text(descriptor.get("role")) or "image reference"
        lines.append(f"- <Picture {index + 1}>: {role}")
    if media["inventory_known"] and not media["image_count"]:
        lines.append("- Numbered runtime picture references: none. Do not write <Picture N>.")
    if media["video_count"] or media["audio_count"]:
        lines.append(
            "- R2I media policy: video and audio inputs are forbidden for this route; do not reference or describe them."
        )
    if not lines:
        lines.append("- No runtime picture inventory was supplied; use no numbered reference labels.")
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


def _ref2va_motion_transfer_rules(context=None):
    media = normalize_context(context)
    if media["is_video_continuation"] or media["image_count"] < 1 or media["video_count"] < 1:
        return ""
    selected_video = media.get("video_reference_index") or 1
    selected_video = min(max(1, selected_video), media["video_count"])
    selected_picture = media.get("motion_picture_index") or (1 if media["image_count"] == 1 else 0)
    if selected_picture:
        selected_picture = min(max(1, selected_picture), media["image_count"])
        picture_binding = (
            f"For this runtime binding, pair the selected motion video with <Picture {selected_picture}> "
            "unless the user's shot explicitly assigns it to another picture."
        )
    else:
        picture_binding = (
            "When more than one picture is available and the runtime has not supplied an explicit target, infer the "
            "motion target from the <Picture N> token in the same shot as the selected video; do not silently default "
            "to <Picture 1>. If that shot has no Picture token, flag the missing pairing instead of inventing one."
        )
    example = (
        f"For example, if <Picture {selected_picture}> shows an ancient-style woman and <Video {selected_video}> shows a man sleeping, "
        f"describe <Picture {selected_picture}> sleeping with <Video {selected_video}>'s pose and timing."
        if selected_picture
        else (
            f"For example, if a shot names a picture-defined subject and <Video {selected_video}> shows a man sleeping, "
            "describe that named picture subject sleeping with the video's pose and timing."
        )
    )
    return (
        "When retention_analysis assigns motion, timing, temporal continuity, pose, action, or camera trajectory to a "
        "video reference, treat that video as driving evidence rather than the target identity. The <Picture N> token in "
        "a shot defines who or what appears; apply the cited video's visible pose sequence, body motion, action state, "
        "timing, and compatible camera trajectory to that picture-defined subject. Do not preserve the video's actor "
        "identity or appearance unless the user explicitly requests it. Do not leave the picture subject in its static "
        f"input pose when the video shows a different action. {example} The selected motion video must be declared in retention_analysis as attribute_transfer with motion "
        f"or timing content, not as a fully preserved video actor identity. {picture_binding} do not describe the picture-defined subject standing or the picture "
        "subject standing when the video shows sleeping, and do not replace the picture subject with the video actor. "
    )


def _ref2va_continuation_rules(context=None):
    media = normalize_context(context)
    if not media["is_video_continuation"] or media["video_count"] < 1:
        return ""
    selected_video = media.get("video_reference_index") or 1
    selected_video = min(max(1, selected_video), media["video_count"])
    video_token = f"<Video {selected_video}>"
    picture_rule = (
        "Optional <Picture N> tokens define a character's identity and appearance; they do not replace the previous "
        "clip's scene or drive its motion, and they may ground a character who enters later."
        if media["image_count"]
        else "No identity picture is available, so preserve the previous clip's visible subject directly."
    )
    return (
        "This is R2C video continuation, not R2V motion transfer. The selected previous clip "
        f"{video_token} is the continuity source for the world, timeline, final scene state, camera, lighting, motion "
        "direction, pacing, style, and synchronized sound. Start from its exact final scene and action state, but do not "
        "assume every character in the next segment must be visible in the previous clip's final frame. "
        f"{picture_rule} A picture-defined character may continue, enter, or become visible after the previous clip ends "
        "when the user's intent or shot plan calls for it, even if that character is absent from the previous final frame. "
        "Keep the scene and camera transition causal. Do not invent a character without a supplied picture or explicit user "
        "request, and do not silently replace a previous subject. In summary, make video continuation the primary task "
        "type; reference generation may be secondary when identity pictures are supplied. In retention_analysis, describe "
        "the previous clip as fully_preserved or partially_preserved continuity and explain its final scene, action, camera, "
        "and sound continuity. Describe each used picture separately as identity/appearance reference, including whether "
        "the character continues or enters later. Do not label the previous clip attribute_transfer unless the user explicitly "
        "requests a separate motion-transfer task. In detailed_description, include the continuation source "
        f"{video_token} in the continuation shot(s), and pair it with each applicable <Picture N> in the same shot when "
        "that picture-defined character appears. Do not restart the previous action or replay events already completed."
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
    if mode == MODE_R2I:
        if media["language"] == "cn":
            language_rule = "Write the single editable prompt in fluent Simplified Chinese."
        elif media["language"] == "en":
            language_rule = "Write the single editable prompt in fluent English."
        else:
            language_rule = (
                "Write the single editable prompt in the user's language; use Simplified Chinese when the request contains Chinese."
            )
        return (
            "MiniMax H3 prompt compiler mode: R2I.\n"
            "Output exactly one self-contained, generator-ready still-image generation or editing prompt, with no "
            "Markdown fence, explanation, JSON, headings, metadata, or completion claim. "
            f"{language_rule} Preserve the user's requested identity, subject count, composition, pose, lighting, "
            "style, text, and unchanged content. Describe the requested visible result directly and keep edits limited "
            "to the user's intent. Use exact runtime picture labels <Picture N>, such as <Picture 1>, only when they exist; explain "
            "what each supplied picture contributes when more than one picture is present. Never invent, reorder, "
            "renumber, translate, or replace picture labels.\n"
            "R2I is a still-image route. Do not output subject_definitions, summary, retention_analysis, "
            "detailed_description, overall_soundscape, non_diegetic_music, [Shot N], timestamps, Camera:, "
            "Dialogue and visible text:, Synchronized sound:, video references, or audio references. A still-image "
            "prompt may describe composition, lens look, pose, and lighting, but it must not describe a timeline, "
            "shot list, camera movement, dialogue, soundtrack, or video action.\n"
            f"Runtime picture inventory:\n{_r2i_context_note(target_context)}"
        )
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
        f"The H3 output duration must be between {H3_MIN_OUTPUT_DURATION:g} and {H3_MAX_OUTPUT_DURATION:g} seconds when supplied, "
        "and the exact requested duration must be used. For 10-30 second outputs, distribute the timeline across a readable "
        "opening state, action development, visible change, and ending result; do not compress all meaningful motion into the "
        "opening seconds. If the source draft contains a different timeline, the runtime target duration overrides the draft; "
        "rebuild the shot intervals instead of copying the old timestamps. Every shot must use an explicit [Shot N] START-ENDs interval marker in chronological order; Shot 1 must start at "
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
            f"{_ref2va_continuation_rules(target_context)}"
            f"{_ref2va_motion_transfer_rules(target_context)}"
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


def _explicit_shot_timeline_duration(matches):
    ends = []
    for match in matches:
        if match.group(5) is None:
            continue
        try:
            ends.append(float(match.group(5)))
        except (TypeError, ValueError):
            continue
    return round(max(ends), 3) if ends else None


def _infer_motion_picture_index(text, video_reference_index, fallback=0):
    source = _clean_text(text)
    video_number = _safe_count(video_reference_index)
    if not source or video_number < 1:
        if _safe_count(fallback) == 0 and fallback == 0:
            return 0
        return max(1, _safe_count(fallback) or 1)
    video_token = f"<Video {video_number}>"
    for _number, body in _shot_bodies(source):
        if video_token.lower() not in body.lower():
            continue
        picture_numbers = [
            int(number)
            for number in re.findall(r"<Picture\s+(\d+)>", body, re.IGNORECASE)
        ]
        picture_numbers = list(dict.fromkeys(number for number in picture_numbers if number > 0))
        if len(picture_numbers) == 1:
            return picture_numbers[0]
        if len(picture_numbers) > 1:
            return 0
    if _safe_count(fallback) == 0 and fallback == 0:
        return 0
    return max(1, _safe_count(fallback) or 1)


def _motion_picture_fallback(context):
    """Only infer Picture 1 when the runtime has exactly one picture."""
    media = normalize_context(context)
    return 1 if media["image_count"] == 1 else 0


def _continuation_validation_warnings(values, timeline, media):
    if not media.get("is_video_continuation") or not media.get("video_count"):
        return []
    warnings = []
    selected_video = media.get("video_reference_index") or 1
    selected_video = min(max(1, selected_video), media["video_count"])
    video_token = f"<Video {selected_video}>"
    summary = values.get("summary", [""])[0] if values.get("summary") else ""
    retention = values.get("retention_analysis", [""])[0] if values.get("retention_analysis") else ""
    if summary and not re.search(r"video\s+continuation|continuation|续写|续接|延续", summary, re.IGNORECASE):
        warnings.append("R2C summary should identify video continuation as the primary task type.")
    if not media.get("video_used"):
        warnings.append(
            f"Continuation source {video_token} produced no decoded visual frames; do not claim that its final state or motion was observed."
        )
        return list(dict.fromkeys(warnings))
    retention_match = re.search(
        rf"{re.escape(video_token)}\s*:\s*([^\r\n]+)",
        retention,
        re.IGNORECASE,
    )
    retention_line = retention_match.group(1) if retention_match else ""
    if not retention_match:
        warnings.append(f"Continuation source {video_token} is missing from retention_analysis.")
    else:
        if re.search(r"attribute[_\s-]*transfer", retention_line, re.IGNORECASE):
            warnings.append(
                f"Continuation source {video_token} is labeled attribute_transfer; R2C should preserve the previous clip's continuity instead."
            )
        if not re.search(
            r"continuation|previous|final|last|end|continuity|续写|续接|上一段|前一段|最后|结尾|延续|连续",
            retention_line,
            re.IGNORECASE,
        ):
            warnings.append(
                f"Continuation source {video_token} is missing previous-clip final-state continuity in retention_analysis."
            )
    if video_token not in timeline:
        warnings.append(
            f"Continuation source {video_token} is not used in detailed_description; the prompt does not define where the previous clip continues."
        )
        return list(dict.fromkeys(warnings))
    timeline_bodies = _shot_bodies(timeline)
    picture_numbers = sorted(
        set(
            int(number)
            for number in re.findall(r"<Picture\s+(\d+)>", timeline, re.IGNORECASE)
        )
    )
    unpaired_pictures = [
        number
        for number in picture_numbers
        if not any(
            video_token in body and f"<Picture {number}>" in body
            for _shot_number, body in timeline_bodies
        )
    ]
    if unpaired_pictures:
        labels = ", ".join(f"<Picture {number}>" for number in unpaired_pictures)
        warnings.append(
            f"Continuation source {video_token} is not paired with {labels} in the same continuation shot."
        )
    for number in picture_numbers:
        picture_token = f"<Picture {number}>"
        if picture_token not in retention:
            warnings.append(
                f"R2C retention_analysis does not explain the identity/appearance role of {picture_token}."
            )
    return list(dict.fromkeys(warnings))


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
    user_intent = source_prompt or (
        "(No prompt text was provided. Infer the requested scene from the runtime media inventory, "
        "current preset contract, and explicit user instructions.)"
    )
    if mode == MODE_R2I:
        protected_references = protected_reference_tokens(source_prompt, compiler, target_context)
        reference_lock = ""
        if protected_references:
            reference_lock = (
                "\n\nProtected picture reference lock:\nPreserve these exact source tokens wherever they already "
                "appear: "
                + ", ".join(protected_references)
                + ". Use only these picture labels and never add video or audio labels."
            )
        return (
            "Compile this rough request into one complete MiniMax H3 R2I still-image prompt.\n\n"
            f"Runtime picture context:\n{_r2i_context_note(target_context)}\n\n"
            "Rewrite rules:\n"
            "- Return one self-contained positive image generation or editing instruction.\n"
            "- Preserve the source image, identity, composition, pose, lighting, and all unrequested content when "
            "the user supplies a picture; when multiple pictures are supplied, state the role of each one.\n"
            "- Keep the requested change concrete, localized, and visually verifiable.\n"
            "- If the rough request contains H3 video sections, [Shot N], timestamps, Camera:, dialogue, sound, "
            "video, or audio material, convert only the still-image intent and remove that video structure.\n"
            "- Do not output headings, JSON, explanations, subject definitions, timelines, shot lists, or media labels "
            "other than existing <Picture N> tokens.\n"
            f"User intent:\n{user_intent}{reference_lock}"
        )
    if mode == MODE_REF2VA and isinstance(target_context, dict):
        target_context = dict(target_context)
        if not _safe_count(target_context.get("motion_picture_index")):
            target_context["motion_picture_index"] = _infer_motion_picture_index(
                source_prompt,
                target_context.get("video_reference_index"),
                fallback=_motion_picture_fallback(target_context),
            )
    source_shots = list(_SHOT_RE.finditer(source_prompt))
    storyboard_lock = ""
    if source_shots:
        runtime_duration = normalize_context(target_context).get("duration_seconds")
        source_duration = _explicit_shot_timeline_duration(source_shots)
        duration_changed = (
            runtime_duration is not None
            and source_duration is not None
            and abs(runtime_duration - source_duration) > 0.001
        )
        if duration_changed:
            storyboard_lock = (
                "\n\nDuration retargeting required:\n"
                f"The source storyboard timeline ends at {source_duration:.3f} seconds, but the runtime target is "
                f"{runtime_duration:.3f} seconds. Keep the existing {len(source_shots)} shot order and core action beats, "
                "but discard every source timestamp and rebuild the shot intervals across the full runtime target. "
                "Do not return the original shorter timeline or merely repeat its wording. Split a shot into additional "
                "chronological shots only when needed for natural pacing, and do not add unrelated events. The final shot "
                "must end exactly at the runtime target."
            )
        else:
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
    continuation_lock = ""
    motion_transfer_lock = ""
    if mode == MODE_REF2VA:
        subject_binding_lock = (
            "\n\nRef2VA subject definitions and picture references:\n"
            + _ref2va_subject_binding_rules(target_context)
        )
        continuation_rules = _ref2va_continuation_rules(target_context)
        if continuation_rules:
            continuation_lock = "\n\nRef2VA continuation source and identity binding:\n" + continuation_rules
        motion_rules = _ref2va_motion_transfer_rules(target_context)
        if motion_rules:
            motion_transfer_lock = "\n\nRef2VA picture identity and video motion binding:\n" + motion_rules
    return (
        f"Compile this rough request into the required MiniMax H3 {mode} structure.\n\n"
        f"Runtime context:\n{context_note(target_context)}\n\n"
        f"User intent:\n{user_intent}{storyboard_lock}{reference_lock}{subject_binding_lock}{continuation_lock}{motion_transfer_lock}"
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


def _shot_bodies(text):
    source = _clean_text(text)
    matches = list(_SHOT_RE.finditer(source))
    return [
        (int(match.group(1)), source[match.end():matches[index + 1].start() if index + 1 < len(matches) else len(source)].strip())
        for index, match in enumerate(matches)
    ]


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
    if mode == MODE_R2I:
        return {
            "picture": media["image_count"] if media.get("inventory_known") else 9,
            "video": 0,
            "audio": 0,
        }
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


def _validate_r2i_prompt(text, media):
    errors = []
    warnings = []
    references = {"picture": [], "video": [], "audio": []}
    section_matches = list(_SECTION_RE.finditer(text))
    if section_matches:
        names = ", ".join(dict.fromkeys(match.group(1).lower() for match in section_matches))
        errors.append(f"R2I must be one still-image prompt without H3 storyboard sections: {names}.")
    if _SHOT_RE.search(text):
        errors.append("R2I must not contain [Shot N] markers or a video shot list.")
    if _R2I_TIMESTAMP_RE.search(text):
        errors.append("R2I must not contain a video timeline or shot timestamps.")
    if _R2I_FIELD_RE.search(text):
        errors.append("R2I must not contain Camera, Dialogue and visible text, or Synchronized sound fields.")

    for kind, raw_number in _REFERENCE_RE.findall(text):
        key = kind.lower()
        number = int(raw_number)
        if number not in references[key]:
            references[key].append(number)
    limits = _reference_limits(MODE_R2I, media)
    for number in references["video"]:
        errors.append(f"R2I accepts only <Picture N> references; <Video {number}> is not allowed.")
    for number in references["audio"]:
        errors.append(f"R2I accepts only <Picture N> references; <Audio {number}> is not allowed.")
    for number in references["picture"]:
        if number < 1 or number > limits["picture"]:
            errors.append(f"<Picture {number}> has no matching runtime picture reference.")

    if media["inventory_known"] and media["image_count"]:
        unused = [
            index
            for index in range(1, media["image_count"] + 1)
            if index not in references["picture"]
        ]
        if unused:
            labels = ", ".join(f"<Picture {index}>" for index in unused)
            warnings.append(f"Uploaded picture references not mentioned in the R2I prompt: {labels}.")
    errors = list(dict.fromkeys(errors))
    warnings = list(dict.fromkeys(warnings))
    return {
        "ok": not errors,
        "mode": MODE_R2I,
        "errors": errors,
        "warnings": warnings,
        "references": references,
        "inventory": {
            "pictures": media["image_count"],
            "videos": 0,
            "audio": 0,
            "known": media["inventory_known"],
        },
    }


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
    if mode == MODE_R2I:
        return _validate_r2i_prompt(text, media)
    if mode == MODE_REF2VA and not media.get("motion_picture_index") and not media.get("is_video_continuation"):
        media["motion_picture_index"] = _infer_motion_picture_index(
            text,
            media.get("video_reference_index"),
            fallback=_motion_picture_fallback(media),
        )
    if media["duration_seconds"] is not None and not (
        H3_MIN_OUTPUT_DURATION <= media["duration_seconds"] <= H3_MAX_OUTPUT_DURATION
    ):
        errors.append(
            f"MiniMax H3 output duration must be between {H3_MIN_OUTPUT_DURATION:g} and "
            f"{H3_MAX_OUTPUT_DURATION:g} seconds."
        )

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
        if media.get("is_video_continuation"):
            warnings.extend(_continuation_validation_warnings(values, timeline, media))
        if (
            not media.get("is_video_continuation")
            and media.get("video_requested")
            and media.get("video_source") == "reference_video"
            and media.get("reference_video_present")
            and not media.get("reference_video_content_available")
        ):
            warnings.append(
                "Selected reference video was requested for motion/timing transfer, but no decoded visual frames reached the agent."
            )
        selected_video = media.get("video_reference_index") or 0
        if (
            not media.get("is_video_continuation")
            and (media.get("video_requested") or media.get("video_used"))
            and selected_video
            and media.get("image_count")
        ):
            video_token = f"<Video {selected_video}>"
            if not media.get("video_used"):
                warnings.append(
                    f"Selected motion/timing reference {video_token} produced no decoded visual frames; its motion must not be described as observed."
                )
            else:
                retention = values.get("retention_analysis", [""])[0] if values.get("retention_analysis") else ""
                retention_match = re.search(
                    rf"{re.escape(video_token)}\s*:\s*([^\r\n]+)",
                    retention,
                    re.IGNORECASE,
                )
                if media.get("video_source") == "reference_video":
                    retention_line = retention_match.group(1) if retention_match else ""
                    if not retention_match:
                        warnings.append(
                            f"Selected motion/timing reference {video_token} is missing from retention_analysis."
                        )
                    elif not re.search(
                        r"attribute_transfer|motion|timing|temporal|pose|action|\u8fd0\u52a8|\u65f6\u5e8f|\u59ff\u6001|\u52a8\u4f5c",
                        retention_line,
                        re.IGNORECASE,
                    ):
                        warnings.append(
                            f"Selected motion/timing reference {video_token} is not declared as a motion/timing transfer in retention_analysis."
                        )
                if video_token not in timeline:
                    warnings.append(
                        f"Selected motion/timing reference {video_token} is not used in detailed_description; "
                        "the picture-defined subject may remain in its static pose."
                    )
                else:
                    selected_picture = media.get("motion_picture_index")
                    if not selected_picture:
                        selected_picture = _infer_motion_picture_index(
                            timeline,
                            selected_video,
                            fallback=0,
                        )
                    if selected_picture:
                        selected_picture = min(max(1, selected_picture), media["image_count"])
                        picture_token = f"<Picture {selected_picture}>"
                        paired_shots = [
                            body for _number, body in _shot_bodies(timeline)
                            if video_token in body and picture_token in body
                        ]
                        if not paired_shots:
                            warnings.append(
                                f"Selected motion/timing reference {video_token} is not paired with a <Picture N> "
                                f"(expected {picture_token}) inside the same shot."
                            )
                    else:
                        paired_shots = [
                            body for _number, body in _shot_bodies(timeline)
                            if video_token in body and re.search(r"<Picture\s+\d+>", body, re.IGNORECASE)
                        ]
                        if not paired_shots:
                            warnings.append(
                                f"Selected motion/timing reference {video_token} is not paired with a <Picture N> "
                                "inside the same shot."
                            )
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
    task_method = _clean_text(getattr(task, "task_method", None) or params.get("task_method"))
    task_name = _clean_text(getattr(task, "task_name", None) or params.get("task_name"))
    task_context = {
        "task_method": task_method,
        "task_name": task_name,
        "task_type": _clean_text(params.get("task_type")),
        "video_mode": _clean_text(params.get("video_mode")),
        "continuation_source": _clean_text(params.get("continuation_source")),
    }
    is_video_continuation = _is_video_continuation(task_context)
    language = getattr(task, "simpleai_lang", None) or params.get("__lang")
    state = getattr(task, "state", None)
    if not language and isinstance(state, dict):
        language = state.get("__lang")
    images = [
        getattr(task, key, None)
        for key in (
            "scene_canvas_image",
            "scene_input_image1",
            "scene_input_image2",
            "scene_input_image3",
            "scene_input_image4",
            "scene_input_image5",
            "scene_input_image6",
            "scene_input_image7",
            "scene_input_image8",
        )
    ]
    main_video = params.get("video")
    reference_video = params.get("reference_video")
    reference_video2 = params.get("reference_video2")
    video_descriptors = []
    if main_video:
        if is_video_continuation:
            main_video_role = "previous H3 clip continuation source"
        elif reference_video or reference_video2:
            main_video_role = "scene/composition video reference"
        else:
            main_video_role = "motion/timing reference video"
        video_descriptors.append({
            "slot": "scene_video",
            "index": len(video_descriptors) + 1,
            "role": main_video_role,
        })
    if reference_video:
        video_descriptors.append({
            "slot": "scene_reference_video",
            "index": len(video_descriptors) + 1,
            "role": "scene/composition video reference" if reference_video2 else "motion/timing reference video",
        })
    if reference_video2:
        video_descriptors.append({
            "slot": "scene_reference_video2",
            "index": len(video_descriptors) + 1,
            "role": "motion/timing reference video",
        })
    selected_video_index = len(video_descriptors) if reference_video or reference_video2 else (1 if main_video else 0)
    return {
        "duration_seconds": getattr(task, "scene_video_duration", None) or params.get("video_duration"),
        "image_count": sum(value is not None for value in images),
        "video_count": len(video_descriptors),
        "video_descriptors": video_descriptors,
        "video_reference_index": selected_video_index,
        "video_requested": bool(video_descriptors),
        "video_used": bool(video_descriptors),
        "video_source": "reference_video2" if reference_video2 else ("reference_video" if reference_video else ("main_video" if main_video else "")),
        "continuation_source": _clean_text(params.get("continuation_source"))
        or ("previous_segment" if is_video_continuation else ""),
        "is_video_continuation": is_video_continuation,
        "task_method": task_method,
        "task_name": task_name,
        "language": language,
        "reference_video_present": bool(reference_video or reference_video2),
        "reference_video_content_available": bool(reference_video or reference_video2),
        "audio_count": sum(bool(params.get(key)) for key in ("audio", "audio2", "audio3")),
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
