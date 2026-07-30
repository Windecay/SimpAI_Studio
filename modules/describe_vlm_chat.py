import json
import os
import re
import sys
import threading
import time

import modules.canvas_danbooru_service as canvas_danbooru_service
import modules.vlm_system_prompt_templates as vlm_system_prompt_templates


ALLOWED_PROMPT_ACTIONS = {"set_prompt", "append_prompt", "refine_prompt", "describe_image_to_prompt", "text_to_prompt"}
GENERATION_ACTION_ALIASES = {
    "text_to_image",
    "generate_image",
    "image_generation",
    "create_image",
    "make_image",
    "draw_image",
}
IMAGE_GENERATION_TASKS = {
    "text_to_image",
    "image_edit",
    "multi_image_edit",
    "image_upscale",
    "image_restore",
    "image_detail_enhance",
    "image_background_removal",
    "image_object_removal",
    "image_outpaint",
    "image_relight",
    "image_style_transfer",
    "image_face_swap",
    "image_pose_transfer",
    "image_pose_extraction",
    "image_anime_to_real",
    "image_view_synthesis",
    "image_depth_estimation",
    "image_object_transfer",
    "image_expression_transfer",
}
IMAGE_INPUT_GENERATION_TASKS = IMAGE_GENERATION_TASKS - {"text_to_image"}
MULTI_IMAGE_GENERATION_TASKS = {
    "multi_image_edit",
    "image_style_transfer",
    "image_face_swap",
    "image_pose_transfer",
    "image_object_transfer",
    "image_expression_transfer",
}
GENERATION_TASK_ALIASES = {
    "t2i": "text_to_image",
    "generate": "text_to_image",
    "edit": "image_edit",
    "image_to_image": "image_edit",
    "multi_edit": "multi_image_edit",
    "multi_image": "multi_image_edit",
    "upscale": "image_upscale",
    "super_resolution": "image_upscale",
    "restore": "image_restore",
    "detail_enhance": "image_detail_enhance",
    "enhance_details": "image_detail_enhance",
    "remove_background": "image_background_removal",
    "background_removal": "image_background_removal",
    "remove_object": "image_object_removal",
    "object_removal": "image_object_removal",
    "outpaint": "image_outpaint",
    "relight": "image_relight",
    "style_transfer": "image_style_transfer",
    "face_swap": "image_face_swap",
    "pose_transfer": "image_pose_transfer",
    "pose_extraction": "image_pose_extraction",
    "anime_to_real": "image_anime_to_real",
    "view_synthesis": "image_view_synthesis",
    "depth_estimation": "image_depth_estimation",
    "feature_transfer": "image_object_transfer",
    "object_transfer": "image_object_transfer",
    "image_feature_transfer": "image_object_transfer",
    "expression_transfer": "image_expression_transfer",
}
PRESET_FAMILY_ALIASES = {
    "krea": ("Krea2-Turbo", "Krea2-ImageEdit"),
}
CREATIVE_ASPECT_RATIOS = {"auto", "1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "7:4", "4:7"}
_CANCEL_TTL_SECONDS = 1800
_CANCELLED_REQUESTS = {}
_CANCELLED_REQUESTS_LOCK = threading.Lock()


DESCRIBE_CHAT_BASE_SYSTEM = (
    "You are the SimpAI Describe Image VLM chat assistant. This chat is a standalone wrapper, not the infinite canvas. "
    "You can discuss images, prompts, model behavior, visual ideas, and ordinary user questions. "
    "You cannot operate canvas nodes. Creative mode may return a structured media-generation request that the UI executes according to the user's creative preference. "
    "Never claim that an image is queued, running, or finished before the UI reports that state. "
    "Answer naturally in the user's UI language unless the user asks for another language."
)

CREATIVE_ASSISTANT_SYSTEM = (
    "Creative mode for SimpAI Studio VLM chat. The UI may already show a session preference card for anime, realistic, automatic, or a specific Preset. "
    "When the user asks to draw, create, render, generate, or edit an image, determine the task type and write the complete executable image prompt, then return exactly one JSON object: "
    "{\"reply\":\"one short user-facing sentence\",\"actions\":[{\"type\":\"generate_image\",\"prompt\":\"complete executable generation prompt or editing instruction\","
    "\"task\":\"task id\",\"media_refs\":[],\"enhance_targets\":[],\"preset_hint\":\"exact Preset name only when the user explicitly named it\","
    "\"parameter_profile_hint\":\"exact private parameter profile name only when the user explicitly named it\","
    "\"aspect_ratio\":\"auto\",\"image_number\":1,\"outpaint\":{\"up\":0,\"down\":0,\"left\":15,\"right\":15}}]}. "
    "actions[0].prompt is the exact text shown in the generation card and sent to the selected workflow. It must not be a bare intent label, a short translation of the request, a completion notice, or a reference such as `same as the previous image`. "
    "For text_to_image, expand the request into a self-contained visual prompt with concrete subject design, composition, action, setting, camera, lighting, atmosphere, and texture while preserving every user constraint. "
    "For image editing tasks, write a complete and precise editing instruction that preserves the requested unchanged content; do not add unrelated visual changes. "
    "For follow-up requests such as `another one` or `continue with the next image`, carry the necessary visual details from conversation history into a self-contained prompt. "
    "Any language, minimum length, or format requested by the user applies to actions[0].prompt, not to reply. Keep reply short and never place the real prompt only in reply. "
    "If the user explicitly names a preferred style or Preset for this conversation, also return a set_creative_preference action before generate_image: "
    "{\"type\":\"set_creative_preference\",\"style\":\"anime|realistic|auto|custom\",\"preset\":\"exact Preset name when known\",\"parameter_profile\":\"exact private profile name when explicitly requested\",\"scope\":\"session\"}. "
    "An unqualified request such as `use Anima to generate it` counts as a session preference. "
    "Do not return that preference action only when the user explicitly says the choice is for this image or one time. "
    "The generate_image action is a task request, not an execution plan and not proof that generation has started. The application selects and validates the Preset, theme, task_method, models, input slots, and interaction requirements. "
    "For image work, include the exact attached media refs in visual input order. Use image_edit for a general one-image edit and multi_image_edit for a general edit using two or more images. "
    "For image_face_swap, when two attached inputs are available, include exactly two media refs in this order: the target/base image first, then the source face-identity image. Never invent missing refs; the application will request them. The application prefers the automatic QwenFaceSwap route when its models are ready; it does not require a painted mask. "
    "When the user explicitly requests Krea, describe the choice as the Krea family in the reply. The application maps text-to-image to Krea2-Turbo and image-input editing to Krea2-ImageEdit; do not promise the wrong family member. "
    "Krea2-Turbo and Krea2-ImageEdit use a multilingual Qwen3-VL 4B text encoder. For a Chinese request, write their executable prompt in fluent Chinese; for an English request, use English. Never translate a Chinese request to English merely because Krea or Krea2 was selected. "
    "Use image_detail_enhance for automatic face, hand, eye, or local detail repair through a Classic Preset Enhance workflow, and include enhance_targets using only face, hand, and eye. "
    "Use the matching specialized task when requested: image_upscale, image_restore, image_detail_enhance, image_background_removal, image_object_removal, image_object_transfer, image_outpaint, image_relight, image_style_transfer, image_face_swap, image_pose_transfer, image_pose_extraction, image_anime_to_real, image_view_synthesis, image_depth_estimation, or image_expression_transfer. "
    "When the user asks the character or person in image 1 to wear clothing or an outfit from image 2, use image_object_transfer with image 1 first as the target and image 2 second as the clothing reference. This is an image edit, never text_to_image. "
    "For image_outpaint, write prompt as a concise English natural-language FLUX/T5 outpaint instruction, and express the requested expansion as percentage intent in outpaint.up/down/left/right. Use 0 for directions the user excluded. "
    "Do not choose or invent a Preset, theme, task_method, input slot, model, API route, or canvas node. "
    "Do not choose or invent a parameter profile. Set preset_hint or parameter_profile_hint only when the user's latest message explicitly names it. Never invent media refs. "
    "Supported aspect_ratio values are auto, 1:1, 16:9, 9:16, 4:3, 3:4, 2:3, 3:2, 7:4, and 4:7. "
    "image_number must be an integer from 1 to 4. Do not invent API routes, canvas node IDs, run IDs, file paths, or completed image URLs. "
    "For ordinary conversation that does not request an image or prompt, answer normally without action JSON."
)

CREATIVE_DIRECTOR_SYSTEM = (
    "You are the independent visual director for SimpAI Studio Creative chat. "
    "The main assistant reply has already been shown, so do not continue the roleplay, answer the user, or rewrite that reply. "
    "Decide whether the latest exchange contains a newly established, visually distinctive story moment worth offering to illustrate. "
    "Strong reasons are scene_change, emotional_peak, climax, visual_reveal, and character_moment. "
    "Do not offer for greetings, setup questions, ordinary exposition, meta discussion, prompt/model settings, repeated scenes, or a direct image request that already received a generation card. "
    "Prefer false. Return true only when score is at least 0.72 and the image would add entertainment or story value. "
    "Return exactly one JSON object. For no offer: "
    "{\"offer\":false,\"score\":0.0,\"reason\":\"none\",\"scene_key\":\"\"}. "
    "For an offer: {\"offer\":true,\"score\":0.85,\"reason\":\"scene_change\","
    "\"scene_key\":\"short stable lowercase scene identity\",\"offer_text\":\"one short sentence offering to draw this moment\","
    "\"prompt\":\"complete image-generation prompt\","
    "\"aspect_ratio\":\"16:9\",\"image_number\":1}. "
    "Do not choose a Preset or theme. Never invent API routes, run IDs, files, completed images, or extra actions."
)

CREATIVE_OFFER_REASONS = {
    "scene_change",
    "emotional_peak",
    "climax",
    "visual_reveal",
    "character_moment",
}
CREATIVE_OFFER_MIN_SCORE = 0.72

PROMPT_ASSISTANT_SYSTEM = (
    "Prompt-writing mode for SimpAI Web Describe Image chat. This is the regular SimpAI web prompt helper, not the infinite canvas. "
    "There is no send/generate button in this chat. Its executable prompt action can only show a prompt card that writes text to the main prompt box. "
    "Allowed action types are set_prompt and append_prompt. "
    "When the user asks to create, refine, translate, rewrite, fill, replace, append, send, or prepare a generation prompt, return exactly one JSON object: "
    "{\"reply\":\"short user-facing reply\",\"actions\":[{\"type\":\"set_prompt\",\"prompt\":\"final prompt text\"}]}. "
    "Use append_prompt only when the user asks to add onto the current prompt. "
    "Follow-up prompt requests such as another version, Chinese/English rewrite, more detail, shorter text, or style changes must also return the same action JSON shape. "
    "If you write a usable prompt, put the complete prompt only in actions[0].prompt, not only in normal prose. "
    "Do not use canvas action schemas, markdown tool calls, or prose-only completion notices for prompt-writing requests in this mode. "
    "Write the prompt in the style requested by the user; otherwise use concise image-generation prompt language. "
    "The visible reply must be short; the full final prompt must be in actions[0].prompt so the chat UI can show it for review."
)

GUIDE_MODE_SYSTEM = """
SimpAI UI guide skill:
- You guide users to the most suitable SimpAI Studio main-interface workflow, preset, or mode based on their goal.
- Do not claim you can click buttons, operate the UI, queue jobs, or inspect hidden interface state. Recommend where to go and what to try.
- In Describe Image chat, Creative mode can run image Presets through Canvas Runner for text-to-image, single-image editing, and multi-image editing. Guide mode recommends workflows and Presets but does not start generation; direct users to Creative mode when they want the chat to generate or edit images.
- Text-to-image / first image:
  - For realistic / general text-to-image, recommend Z-image, Krea2-Turbo, Wan(T2I), Flux, or Qwen2512. These are mainly realistic/general-purpose routes, but can handle some simple anime or illustration requests.
  - For anime, illustration, 二次元, character art, or tag-style workflows, recommend Anima, Illustrious / 光辉, NoobAI, or SDXL-class anime presets first. Treat these as the dedicated anime-oriented choices.
  - Anima is a DiT anime model. It is slower than SDXL / Illustrious routes, but better for multi-character scenes, body structure, and limbs. Its style control is weaker; strict style direction normally needs targeted LoRA, so if Anima LoRA support is not yet available, recommend Illustrious / NoobAI / SDXL LoRA routes for strong artist/style control.
  - Illustrious / 光辉 and NoobAI are SDXL-branch anime models. They are fast, good with artist names and Danbooru-style prompts, and have a rich LoRA ecosystem. Their precision can be lower than heavier DiT routes, so users may need multiple samples plus hand/face repair to get a satisfying result.
  - FooocusSDXL is the native Fooocus-engine preset package. SimpAI now also relies heavily on specialized Comfy-engine presets to support more model families and directed workflows.
  - If the user says "realistic", "photo", "portrait", "product", "commercial", "写实", "真人", or "摄影", prefer Z-image / Krea2-Turbo / Flux / Qwen2512 / Wan(T2I) over anime presets.
  - If the user says "anime", "manga", "二次元", "插画", "动漫", "光辉", "Illustrious", "Danbooru", or wants tag-style prompting, prefer Anima / SDXL anime / Illustrious over realistic/general presets.
  - For general photo/realistic generation, recommend the main generation preset that matches the active style; if unsure, ask whether they want 写实向 or 动漫向 before choosing.
  - For prompt writing, prompt cleanup, translation, or Danbooru tags, recommend Prompt Assistant mode in this chat or the Prompt Helper Starter canvas.
- Prompt language / model routing:
  - Krea2-Turbo uses a multilingual Qwen3-VL 4B text encoder and accepts fluent Chinese or English natural-language prompts. Keep the user's request language; do not translate Chinese prompts to English just because Krea2 is selected.
  - For Chinese text rendering/output inside generated images, Qwen2512 is the strongest choice; other models are secondary.
  - Flux/T5 workflows may prefer English natural-language prompts when their workflow contract says so.
  - For Danbooru tag workflows, recommend SDXL, Illustrious / 光辉, NoobAI, Tile, SD1.5, or ChenkinXL.
  - For the Anima branch, use Danbooru tags plus lightweight English natural language; do not promise Anima LoRA/ControlNet support yet because it is planned for later.
  - For speed, SD1.5, Z-image, and SDXL-family routes are fast; Flux2-Klein is also fast and resource-light. Wan and Qwen models are heavier and need more VRAM.
  - LoRA and ControlNet are broadly supported across model families, with the Anima exception above.
- Input Image / reference controls:
  - Image Prompt is usually a style/reference semantic-vector input. Some model families hide it because they do not have the matching module.
  - For ControlNet choices, Canny / PyraCanny preserves line contours, Depth preserves spatial relationships, OpenPose preserves human pose, and FaceSwap converts a face into a conditioning vector. Mention that many newer model families no longer support the old FaceSwap module.
  - Vary (Subtle) and Vary (Strong) use the original image as the base, encode it into latent space, then lightly or strongly redraw it depending on prompt and denoise/redraw strength.
  - Upscale (Fast 2x) is a quick model upscale with lower quality and low resource cost. Upscale (1.5x) and Upscale (2x) encode into latent space for inference upscaling and expose redraw-strength control.
- Editing model boundaries:
  - Flux2-Klein is a fast, resource-light, 4-step distilled model with slightly lower precision. If it does not follow the instruction once, suggest trying again or using a more stable editor.
  - Krea2-Turbo is a Krea 2 Turbo text-to-image preset for realistic/general images from natural-language prompts. It is not an instruction-editing or reference-image route.
  - Bernini-ImageEdit is the Bernini-R still-image editing route for instruction edits, style conversion, replacement, inpainting, and color matching on an input image.
  - QwenEdit+ is heavier, slower, and more stable for image editing, with stronger reference consistency.
  - Nun/Nunchaku presets are 4-bit quantized variants that trade precision for speed and lower resource use. Use fp4 on RTX 50-series or newer GPUs; use int4 on older GPUs.
  - Directional Klein and Qwen presets are built for specific subjects or operations and usually include purpose-specific LoRAs.
  - QwenNSFW is a community-merged single-checkpoint route aimed at unlocking restricted editing cases that the original QwenEdit may filter.
- Image editing / retouching:
  - For instruction-based image editing, object add/remove/replace, text editing, style conversion, inpainting, or optional mask editing, recommend QwenEdit+ / Qwen-Edit-2511 first.
  - For image object transfer / item migration (图像物品迁移 / 物品替换 / 把一个物体迁移到另一张图), recommend Swap+ when the user wants strong painted-mask control. Swap+ uses the Flux1.Fill model and is suited for brush-mask-directed object migration or replacement. Flux2-Klein and QwenEdit are multimodal editors that can take multiple input images and replace objects by instruction, with optional brush masks; their mask function is useful but weaker than Swap+ for precise masked transfer.
  - For broad one-click commercial/product retouching, recommend OneKeyKontext. Rough submode guidance: product repair / 3C / home appliances / jewelry / metal for commercial product polish; face / body for portrait or figure cleanup; clothing / clothing extraction / take clothes for garment workflows; angle edit / IP 3-View / depth reference for view, structure, and multi-view control; remove anything / object insertion / clear background / composite / scene / pattern for local replacement, background, and layout work.
  - For manual detail repair of hands, faces, or eyes (修手 / 修脸 / 修眼 / 精修细节), recommend the inpaint/outpaint mode inside the relevant text-to-image model family: choose the detail-improvement option (提升细节), write the extra/additional prompt for the area, then tune redraw/denoise strength (重绘幅度) and feathering (羽化).
  - For automatic detail repair of hands, faces, or eyes, recommend Enhance / 增强修图. Explain that it can optionally upscale once, then run three region-recognition refinement passes; by default the regions are detected and processed in order: face, hands, eyes. It can be chained after text-to-image generation or used directly with an uploaded image.
  - For background removal / cutout, recommend Removebg.
  - For relighting or matching foreground/background lighting, recommend Relight or Flux2-AngleLight.
  - For anime-to-real or stylized-to-real character conversion, recommend Flux2-A2R.
  - For style transfer, recommend StyleTransfer+ with its 110 prompt-style presets. Do not recommend the older SDXL style-transfer preset route.
  - For erasing unwanted areas or cleanup, recommend Eraser or QwenEdit+ with a mask.
  - For seamless outpainting / image-edge expansion (无缝扩图 / 边缘拓展), recommend OneKey-Outpaint first. It uses the Flux1.Fill model for general-purpose image boundary extension across subjects, and is often used to change composition, change aspect ratio, or add missing surrounding elements.
- Face, body, pose, and camera:
  - For face swap on still images, recommend QwenFaceSwap first. It uses exactly two images in target/base then source-identity order and detects the target face without requiring a painted mask. Use Swapface as an alternative when its models are the available ready route.
  - For expression editing on still portraits, recommend LivePortrait Exp. It edits face rotation, eyes, mouth, smile, and optional reference-expression strength; treat it as an expression editor, not an identity face-swap route.
  - For pose transfer or pose-driven edits, recommend OneKeyPose, QwenPose, Flux2-KleinPose, or SDPose depending on the selected preset family.
  - For camera angle / multi-view control, recommend QwenMultiAngle; for product or character three-view sheets, recommend OneKeyKontext IP 3-View.
  - For Gaussian blur cleanup or detail-oriented Qwen edits, recommend QwenGaussian / QwenEdit+ when relevant.
- Image-to-video / video generation:
  - When the user asks for image-to-video or wants to animate a still image, recommend Wan image-to-video as the general/default route.
  - For anime, illustration, 二次元, 动漫向, manhua, cel-shaded, or character-art image-to-video requests, recommend Dasiwa image-to-video first.
  - For text-to-video, recommend Wan(T2V); for image-to-video, recommend Wan(I2V); for video extension, recommend Wan-Extent or Dasiwa-Extent for anime.
  - For video outpainting / expanding video frame boundaries, recommend Wan-Outpaint.
  - For video object/person/face replacement with masks, recommend Wan-Animate with SAM3; for video removal/inpainting, recommend Wan-Remover with SAM3.
  - For video face swap, recommend ReActor-FaceSwap / ReActor Face Swap for a direct source-face-index workflow with a reference face image and source video. Offer Wan-Swap / Wan-Animate Face Swap when the user wants the Animate-style multimodal face-replacement route.
  - For motion transfer, character replacement, pose-following, or reusing a reference motion, recommend Wan-SCAIL2 or Wan-Swap motion transfer depending on whether identity/face replacement is involved. Wan-SCAIL2 separates the modes into two themes: Character Motion Transfer and Character Replacement; use Wan-Swap / Wan-Animate Motion Transfer as the Animate-style alternative.
  - For Bernini-R video routes, recommend Bernini-MultiI2V for multi-reference image-to-video and Bernini-VideoEdit for video editing with optional image references and Duration limit.
  - For face replacement in video, recommend ReActor-FaceSwap first for the ReActor route, or Wan-Swap when the Animate-style route fits better.
  - Wan video routes have strong consistency, many specialized extensions, and strong directed workflows, but T2V/I2V duration is limited and VRAM requirements are high.
  - LTX2.3 is better when the user needs more flexible duration, dynamic VRAM use, or text/audio multimodal video input/output. It can still consume a lot of system RAM.
  - LTX-Outpaint is a specialized IC-LoRA-enhanced video outpaint route.
  - For LTX2.3 video restoration, HD enhancement, watermark removal, or subtitle removal, recommend LTX2.3(InsightTool). Its themes are Video Restore, Video Upscale, Remove Watermark, and Remove Subtitles; it requires a source video and uses task-specific IC-LoRA adapters.
  - Wan-Animate and Wan-Swap are directed presets based on Animate-style multimodal reference ability; they cover object replacement, pose/motion transfer, character or face replacement, with SAM3-mask and no-SAM3-mask variants.
  - For conventional video upscaling / super-resolution without restoration or cleanup goals, recommend Nvidia-VSR.
- Audio, speech, and talking video:
  - For text-to-speech, voice design, voice clone, custom voice, or multi-role dialogue, recommend Qwen TTS canvas templates.
  - For turning a portrait/image plus audio into lip-sync/talking video, recommend InfiniteTalk image+audio-to-video.
  - For adding sound effects or Foley to a video, recommend Hunyuan-Foley.
  - For mixing generated speech with video/audio timelines, recommend TTS Timeline or Timeline Composite templates in the infinite canvas.
- Infinite canvas / advanced workflow:
  - Recommend the main WebUI directly for a single simple generation, a one-off edit, or quick parameter experiments. Recommend the infinite canvas when the user needs multi-step composition, local edits, references, comparing generations, arranging assets, timelines, result reuse, or chaining image/video/audio nodes.
  - For learning canvas basics, recommend Canvas Quick Start; for Preset nodes, recommend Preset Node Basics; for queue/results, recommend Run Queue & Result Basics; for model download/status, recommend Model Readiness Basics.
  - For reusing an output as the next input, recommend Result Reuse Image Chain.
  - For batching or repeated reusable chains, suggest using canvas Preset nodes, Result nodes, user templates, and Timeline templates rather than asking the user to manually repeat main-UI steps.
- Model readiness:
  - If the user asks why a preset cannot run or models are missing, recommend checking the preset model status/download button and the Model Readiness Basics canvas.
  - If the issue is not model readiness, mention possible identity/permission state: guest users or unapproved identities may be unable to generate, download models, or manage personal resources; admins can manage downloads and user access.
- If several workflows could fit, give a short ranked recommendation and one reason for each.
- If critical information is missing, ask one concise clarifying question before recommending.
- Keep answers practical and concise in the user's UI language.
"""

SIMPAI_PRESET_GUIDE_SKILL_FILE = "simpai_preset_guide.md"
ANIMA_PROMPT_SKILL_FILE = "anima_prompting.md"


def _cancel_key(conversation_id="", request_id=""):
    return (str(conversation_id or "").strip(), str(request_id or "").strip())


def _prune_cancelled_requests(now=None):
    current = time.monotonic() if now is None else now
    expired = [key for key, stamp in _CANCELLED_REQUESTS.items() if current - stamp > _CANCEL_TTL_SECONDS]
    for key in expired:
        _CANCELLED_REQUESTS.pop(key, None)


def request_describe_vlm_chat_cancel(conversation_id="", request_id=""):
    key = _cancel_key(conversation_id, request_id)
    if not key[0] and not key[1]:
        return {"ok": True, "cancelled": True, "conversation_id": "", "request_id": ""}
    with _CANCELLED_REQUESTS_LOCK:
        _prune_cancelled_requests()
        _CANCELLED_REQUESTS[key] = time.monotonic()
    return {"ok": True, "cancelled": True, "conversation_id": key[0], "request_id": key[1]}


def clear_describe_vlm_chat_cancel(conversation_id="", request_id=""):
    key = _cancel_key(conversation_id, request_id)
    with _CANCELLED_REQUESTS_LOCK:
        _CANCELLED_REQUESTS.pop(key, None)


def is_describe_vlm_chat_cancelled(conversation_id="", request_id=""):
    key = _cancel_key(conversation_id, request_id)
    conversation_key = (key[0], "")
    with _CANCELLED_REQUESTS_LOCK:
        _prune_cancelled_requests()
        return key in _CANCELLED_REQUESTS or (bool(key[0]) and conversation_key in _CANCELLED_REQUESTS)

NATURAL_PROMPT_SKILL = """
Natural-language prompt skill for Describe Image chat:
- Expand a short request into one coherent visual moment, not a loose noun list.
- Preserve the user's subject, count, prop, action, mood, setting, and any negative constraint.
- Add concrete visible design: hairstyle, clothing, colors, accessories, hands, gaze, expression, body orientation, prop use, environment, time, weather, camera distance, angle, lighting, atmosphere, and texture.
- Match the latest request language: write fluent Chinese for a Chinese request and fluent English for an English request, unless the user explicitly asks for another language.
- Krea2 is a multilingual natural-language target backed by Qwen3-VL 4B. Keep Chinese Krea2 requests in Chinese; selecting Krea2 is not a reason to translate them to English.
- Avoid bare topic restatements and empty filler such as "高清细节", "艺术风格", "高质量", "beautiful woman" without visible design.
- Keep generation controls, seed, steps, CFG, size, model names, markdown, and comments out of the prompt.
- Example for "画美女撑伞图": "雨后的青石巷里，一位身穿淡青色汉服的年轻女子侧身撑着油纸伞缓步前行，长发被银簪挽起，宽袖被细雨和微风轻轻带起，伞面落着水珠，远处暖色灯笼映在湿润石板路上，半身到膝上的电影感构图，柔和逆光，朦胧水汽，古风插画质感。"
"""

DANBOORU_TAG_PROMPT_SKILL = """
Danbooru tag prompt skill for Describe Image chat:
- Use this when the Describe Image panel has Output with tags enabled.
- The final prompt must be comma-separated English Danbooru-style tags, not Chinese prose.
- Put important content first: subject count, identity, composition, action, prop, expression, clothing, setting, weather, lighting, rendering/style, quality.
- Use compact atom tags. Do not fabricate long prose tags by replacing spaces with underscores.
- Preserve explicit count, action, prop, setting, relationship, and composition. Do not add conflicting count tags.
- For named characters, include each character tag once. Do not create pseudo-character outfit tags such as klee_(genshin_impact_outfit) or nahida_(genshin_impact_outfit); use ordinary clothing tags only when needed.
- Avoid sentence punctuation, markdown, generation controls, negative phrases, comments, and translated Chinese tags.
- Example for "画美女撑伞图": "1girl, solo, holding_umbrella, umbrella, rain, walking, from_side, looking_to_the_side, long_hair, hair_ornament, hanfu, wide_sleeves, wet_pavement, stone_path, lantern, reflection, mist, depth_of_field, soft_lighting, backlighting, cinematic_composition, detailed_background"
"""

ANIMA_DESCRIBE_PROMPT_ADAPTER = """
Anima prompt skill adapter for SimpAI Web Describe Image chat:
- Use the Anima rules below to format only `actions[0].prompt`.
- The Web chat output JSON still must be `{"reply":"short reply","actions":[{"type":"set_prompt","prompt":"final Anima positive prompt"}]}`.
- Do not output top-level `generate_image`, `subject_counts`, `draft_prompt`, or canvas confirmation-card payloads in this Web prompt helper.
- The final prompt must be an English Anima positive prompt, not a generic natural-language paragraph and not Chinese prose.
"""
ANIMA_CREATIVE_PROMPT_ADAPTER = """
Anima prompt skill adapter for SimpAI Studio Creative chat:
- Use the Anima rules below to format only the `prompt` field in the active Creative JSON contract.
- Keep the outer `generate_image` or visual-director offer schema required by the active system prompt.
- The final prompt must be an English Anima positive prompt, not a generic natural-language paragraph and not Chinese prose.
"""
PROMPT_TARGET_OPTION_KEYS = (
    "preset",
    "preset_name",
    "selected_preset",
    "backend_engine",
    "engine",
    "engine_type",
    "task_method",
    "method",
    "prompt_format",
    "target_key",
    "prompt_target",
    "text_encoder",
    "clip_model",
    "clip",
    "base_model",
    "model",
    "checkpoint",
    "workflow",
    "workflow_name",
)

PROMPT_INTENT_RE = re.compile(
    r"("
    r"提示词|正向提示|反推|生图|图生文|文生图|出图|生成图|画一|画个|画张|画幅|画.{0,30}(图|画|插画|美女|人物|场景)|绘制|"
    r"整理.*图|整理.*prompt|整理.*tag|优化.*prompt|优化.*提示|改写.*prompt|改写.*提示|"
    r"\bprompt\b|\bprompts\b|\btag\b|\btags\b|\bdanbooru\b|"
    r"\bdraw\b|\bgenerate\b|\bcreate\b|\bmake\b.{0,24}\b(image|picture|illustration|artwork)\b|"
    r"\bimage prompt\b|\btext to image\b"
    r")",
    re.I,
)
CREATIVE_CONTINUATION_INTENT_RE = re.compile(
    r"(?:继续|再来|再生成|再画|换)(?:一|下)?(?:张|幅|个)|下一张|下一幅|"
    r"\b(?:another|next)\s+(?:one|image|picture|photo|illustration|artwork)\b",
    re.I,
)
CREATIVE_GENERATION_INTENT_RE = re.compile(
    r"("
    r"生图|出图|生成(?!提示词|prompt).{0,8}(?:图|图片|图像|照片|插画|画面)|"
    r"画(?:一|个|张|幅|出|成)|绘制|创作(?!提示词|prompt).{0,8}(?:图|图片|图像|照片|插画|画面)|"
    r"(?:继续|再来|再生成|再画|换)(?:一|下)?(?:张|幅|个)|下一张|下一幅|"
    r"\b(?:draw|render)\b|\b(?:generate|create|make)\b.{0,30}\b(?:image|picture|photo|illustration|artwork)\b|"
    r"\b(?:another|next)\s+(?:one|image|picture|photo|illustration|artwork)\b"
    r")",
    re.I,
)
CREATIVE_EDIT_INTENT_RE = re.compile(
    r"("
    r"修图|改图|编辑.{0,20}(?:图|图片|图像|照片)|修改.{0,30}(?:图|图片|图像|照片)|"
    r"(?:把|将|给).{0,50}(?:改|换|变|加|删|移除|替换|放大|超分|修复|抠图|扩图|打光|迁移)|"
    r"(?:^|[，。！？\s])(?:换成|改成|增加|删除|移除|替换|复刻|重绘|放大|超分|修复|抠图|扩图).{0,40}|"
    r"\b(?:edit|modify|change|replace|remove|add|upscale|restore|outpaint|relight)\b.{0,30}\b(?:image|picture|photo)\b"
    r")",
    re.I,
)
CREATIVE_RESPONSE_EXECUTION_RE = re.compile(
    r"(右侧卡片|生成卡片|确认(?:后|即可)?.{0,12}(?:生成|执行)|开始生成|"
    r"\b(?:review|confirm)\b.{0,30}\b(?:generate|generation|run|execute)\b)",
    re.I,
)
CREATIVE_RESPONSE_REFUSAL_RE = re.compile(
    r"(?:^|\n)\s*(?:抱歉|我(?:无法|不能)|无法为|不能为|不可以|拒绝|"
    r"(?:sorry|i\s+(?:cannot|can't|am unable)|unable to|i refuse)\b)",
    re.I | re.M,
)
CREATIVE_PROMPT_SECTION_HEADING_RE = re.compile(
    r"(?:整理出的?提示词|生成提示词|正向提示词|提示词(?:如下|内容)?|prompt|"
    r"生成指令|绘图指令|生图指令|视觉画面构想|画面构想)\s*[*_]*[:：]\s*",
    re.I,
)


def _clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _data_url_mime(data_url):
    match = re.match(r"^data:([^;,]+)", str(data_url or ""))
    return match.group(1) if match else "application/octet-stream"


def _normalize_lang(value):
    text = str(value or "").strip().lower()
    return "en" if text.startswith("en") else "cn"


def _requested_prompt_language(message, lang="cn"):
    text = str(message or "").strip()
    english_request = re.search(
        r"(?:用|使用|写成|输出|改成|翻译成|转换成)\s*(?:英文|英语)|英文\s*(?:提示词|prompt)|"
        r"\b(?:in|into)\s+english\b|\benglish\s+prompt\b",
        text,
        re.I,
    )
    chinese_request = re.search(
        r"(?:用|使用|写成|输出|改成|翻译成|转换成)\s*(?:中文|汉语)|中文\s*(?:提示词|prompt)|"
        r"\b(?:in|into)\s+chinese\b|\bchinese\s+prompt\b",
        text,
        re.I,
    )
    if english_request or chinese_request:
        english_pos = english_request.start() if english_request else -1
        chinese_pos = chinese_request.start() if chinese_request else -1
        return "en" if english_pos > chinese_pos else "cn"
    if re.search(r"[\u3400-\u9fff]", text):
        return "cn"
    if re.search(r"[A-Za-z]", text):
        return "en"
    return _normalize_lang(lang)


def _describe_vlm_skills_dir():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "vlm_skills")


def _describe_read_vlm_skill_file(filename, max_chars=24000):
    clean = str(filename or "").replace("\\", "/").strip()
    if not clean or clean.startswith("/") or ".." in clean.split("/"):
        return ""
    path = os.path.join(_describe_vlm_skills_dir(), clean)
    if not os.path.exists(path):
        return ""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            content = handle.read().strip()
    except Exception:
        return ""
    if max_chars and len(content) > int(max_chars):
        return content[: int(max_chars)].rstrip() + "\n..."
    return content


def _describe_preset_guide_skill():
    return _describe_read_vlm_skill_file(SIMPAI_PRESET_GUIDE_SKILL_FILE) or GUIDE_MODE_SYSTEM.strip()


def _describe_anima_prompt_skill(adapter=None):
    content = _describe_read_vlm_skill_file(ANIMA_PROMPT_SKILL_FILE, 16000)
    if content and "## Output Contract" in content and "## Positive Prompt Shape" in content:
        intro = content.split("## Output Contract", 1)[0].strip()
        body = "## Positive Prompt Shape\n" + content.split("## Positive Prompt Shape", 1)[1].strip()
        content = f"{intro}\n\n{body}".strip()
    prompt_adapter = ANIMA_DESCRIBE_PROMPT_ADAPTER if adapter is None else str(adapter or "")
    return "\n\n".join(part for part in (prompt_adapter.strip(), content) if part).strip()


def _normalize_chat_mode(value):
    text = str(value or "").strip().lower().replace("-", "_")
    if text in {"creative", "create", "creation", "creative_mode", "image_generation"}:
        return "creative"
    if text in {"prompt", "prompt_assistant", "assistant"}:
        return "prompt"
    if text in {"guide", "guide_mode", "wizard", "ui_guide", "workflow_guide"}:
        return "guide"
    if text in {"raw", "raw_model", "model"}:
        return "raw"
    return "chat"


def _clean_multiline_text(value, limit=4000):
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text[: max(200, int(limit or 4000))].strip()


def _localized_default_reply(action_type, lang):
    if _normalize_lang(lang) == "en":
        if action_type == "generate_image":
            return "I prepared an image-generation proposal. Review the options and confirm when ready."
        if action_type == "append_prompt":
            return "I prepared prompt text to append."
        return "I prepared prompt text for the main prompt box."
    if action_type == "generate_image":
        return "已准备生图方案，请检查选项后确认生成。"
    if action_type == "append_prompt":
        return "已整理可追加到主提示词框的内容。"
    return "已整理可写入主提示词框的内容。"


def _history_image_placeholder(item):
    image_count = item.get("image_count")
    if image_count is None and isinstance(item.get("images"), list):
        image_count = len(item.get("images") or [])
    try:
        image_count = int(image_count or 0)
    except Exception:
        image_count = 0
    if image_count <= 0:
        return ""
    return f"[{image_count} previous visual media reference(s); full media bytes omitted from history.]"


def _normalize_history(messages, limit=24, budget=6000):
    normalized = []
    for item in messages if isinstance(messages, list) else []:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip().lower()
        if role not in {"user", "assistant", "system"}:
            continue
        content = str(item.get("content") or item.get("reply") or "").strip()
        image_placeholder = _history_image_placeholder(item)
        if image_placeholder:
            content = f"{content}\n{image_placeholder}".strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content[:3000]})

    selected = []
    used = 0
    max_items = max(1, int(limit or 24))
    max_budget = max(1200, int(budget or 6000))
    for item in reversed(normalized):
        content = item["content"]
        max_one = max(500, min(1800, max_budget // 3))
        if len(content) > max_one:
            content = content[-max_one:].lstrip()
        cost = len(item["role"]) + len(content) + 16
        if len(selected) >= max_items or (selected and used + cost > max_budget):
            continue
        selected.append({"role": item["role"], "content": content})
        used += cost
    selected.reverse()
    return selected


def _media_source_from_payload(media, conversation_id, index=0):
    media = media if isinstance(media, dict) else {}
    data_url = str(media.get("data_url") or "").strip()
    if not data_url:
        return None
    mime = str(media.get("mime") or _data_url_mime(data_url)).strip().lower()
    media_type = "video" if mime.startswith("video/") else "image" if mime.startswith("image/") else ""
    if not media_type:
        return None
    asset_id = str(media.get("id") or f"describe_vlm_chat_{int(time.time() * 1000)}")
    return {
        "node_id": f"describe_vlm_chat:{conversation_id}:{media_type}:{index}",
        "type": media_type,
        "title": str(media.get("name") or f"Describe chat {media_type}"),
        "asset": {
            "kind": "browser_upload",
            "asset_id": asset_id,
            "mime": mime,
            "width": media.get("width") or None,
            "height": media.get("height") or None,
            "duration": media.get("duration") or None,
            "size": media.get("size") or None,
            "data_url": data_url,
            "thumb": media.get("thumb") or "",
        },
        "mask": None,
        "source": {"kind": "describe_vlm_chat"},
    }


def _media_sources_from_payload(payload, conversation_id, limit=5):
    raw_images = []
    if isinstance(payload.get("images"), list):
        raw_images.extend(payload.get("images") or [])
    elif isinstance(payload.get("image"), dict):
        raw_images.append(payload.get("image"))

    seen = set()
    sources = []
    for image in raw_images:
        if not isinstance(image, dict) or image.get("placeholder"):
            continue
        data_url = str(image.get("data_url") or "").strip()
        if not data_url:
            continue
        key = str(image.get("id") or data_url[:160])
        if key in seen:
            continue
        seen.add(key)
        source = _media_source_from_payload(image, conversation_id, len(sources))
        if source:
            sources.append(source)
        if len(sources) >= max(1, int(limit or 5)):
            break
    return sources


def _media_manifest_from_payload(payload, limit=5):
    raw_media = payload.get("images") if isinstance(payload.get("images"), list) else []
    if not raw_media and isinstance(payload.get("image"), dict):
        raw_media = [payload.get("image")]
    manifest = []
    seen = set()
    for item in raw_media:
        if not isinstance(item, dict) or item.get("placeholder"):
            continue
        data_url = str(item.get("data_url") or "").strip()
        mime = str(item.get("mime") or _data_url_mime(data_url)).strip().lower()
        media_type = "video" if mime.startswith("video/") else "image" if mime.startswith("image/") else ""
        ref = _clean_text(item.get("id"))[:160]
        if not ref or not media_type or ref in seen:
            continue
        seen.add(ref)
        manifest.append(
            {
                "ref": ref,
                "index": len(manifest) + 1,
                "type": media_type,
                "name": _clean_text(item.get("name"))[:160] or f"{media_type} {len(manifest) + 1}",
            }
        )
        if len(manifest) >= max(1, min(5, int(limit or 5))):
            break
    return manifest


def _normalize_preset_capabilities(value, limit=100):
    normalized = []
    seen = set()
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        name = re.sub(r"[\x00-\x1f\x7f]+", "", str(item.get("name") or "")).strip()[:120]
        key = name.lower()
        if not name or key in seen:
            continue
        seen.add(key)
        try:
            max_images = max(0, min(5, int(item.get("max_images") or 0)))
        except Exception:
            max_images = 0
        try:
            min_images = max(0, min(max_images, int(item.get("min_images") or 0)))
        except Exception:
            min_images = 0
        output_type = "video" if str(item.get("output_type") or "").strip().lower() == "video" else "image"
        supported_tasks = []
        for raw_task in item.get("supported_tasks") if isinstance(item.get("supported_tasks"), list) else []:
            task_key = str(raw_task or "").strip().lower().replace("-", "_").replace(" ", "_")
            task = GENERATION_TASK_ALIASES.get(task_key, task_key)
            if task in IMAGE_GENERATION_TASKS and task not in supported_tasks:
                supported_tasks.append(task)
        if output_type == "video":
            supported_tasks = []
        elif not supported_tasks:
            descriptor = " ".join(
                _clean_text(item.get(key)).lower()
                for key in ("name", "task_method", "purpose")
            )
            edit_markers = (
                "image edit", "image-edit", "image_edit", "editing", "qwenedit", "qwen_edit",
                "kleinedit", "klein_edit", "flux2_9b_edit", "kontext", "inpaint", "outpaint",
                "retouch", "imagerepair", "image repair", "pose editor", "a2r",
            )
            if max_images > 0 and any(marker in descriptor for marker in edit_markers):
                supported_tasks = ["image_edit"]
                if max_images > 1:
                    supported_tasks.append("multi_image_edit")
            else:
                supported_tasks = ["text_to_image"]
        supported_tasks = [
            task for task in supported_tasks
            if task == "text_to_image"
            or (task in IMAGE_INPUT_GENERATION_TASKS and max_images >= 1)
            and (task not in MULTI_IMAGE_GENERATION_TASKS or max_images >= 2)
        ]
        interaction_requirements = []
        for raw_requirement in item.get("interaction_requirements") if isinstance(item.get("interaction_requirements"), list) else []:
            requirement = str(raw_requirement or "").strip().lower().replace("-", "_").replace(" ", "_")
            if re.fullmatch(r"[a-z][a-z0-9_]{1,63}", requirement or "") and requirement not in interaction_requirements:
                interaction_requirements.append(requirement)
        model_status = str(item.get("model_status") or "").strip().lower()
        if model_status not in {"ready", "missing", "unknown"}:
            if item.get("missing") is True:
                model_status = "missing"
            elif item.get("has_model_probe") is True:
                model_status = "ready"
            else:
                model_status = "unknown"
        raw_slots = item.get("image_slots") if isinstance(item.get("image_slots"), list) else []
        allowed_slots = (
            "enhance_image",
            "scene_canvas_image",
            "scene_input_image1",
            "scene_input_image2",
            "scene_input_image3",
            "scene_input_image4",
        )
        image_slots = []
        for raw_slot in raw_slots:
            slot = str(raw_slot or "").strip()
            if slot in allowed_slots and slot not in image_slots:
                image_slots.append(slot)
        image_slots = image_slots[:max_images]
        raw_task_modes = item.get("task_modes") if isinstance(item.get("task_modes"), dict) else {}
        task_modes = {}
        for raw_task, raw_mode in raw_task_modes.items():
            task_key = str(raw_task or "").strip().lower().replace("-", "_").replace(" ", "_")
            task = GENERATION_TASK_ALIASES.get(task_key, task_key)
            mode = str(raw_mode or "").strip().lower()
            if task in IMAGE_GENERATION_TASKS and mode in {"enhance"}:
                task_modes[task] = mode
        raw_themes = item.get("themes") if isinstance(item.get("themes"), list) else []
        themes = []
        for raw_theme in raw_themes:
            theme = re.sub(r"[\x00-\x1f\x7f]+", "", str(raw_theme or "")).strip()[:120]
            if theme and theme not in themes:
                themes.append(theme)
        themes = themes[:40]
        default_theme = re.sub(r"[\x00-\x1f\x7f]+", "", str(item.get("default_theme") or "")).strip()[:120]
        if default_theme not in themes:
            default_theme = themes[0] if themes else ""
        raw_per_theme = item.get("per_theme") if isinstance(item.get("per_theme"), dict) else {}
        per_theme = {}
        for theme in themes:
            theme_info = raw_per_theme.get(theme) if isinstance(raw_per_theme.get(theme), dict) else {}
            theme_method = _clean_text(theme_info.get("task_method"))[:120]
            theme_tasks = []
            for raw_task in theme_info.get("supported_tasks") if isinstance(theme_info.get("supported_tasks"), list) else []:
                task_key = str(raw_task or "").strip().lower().replace("-", "_").replace(" ", "_")
                task = GENERATION_TASK_ALIASES.get(task_key, task_key)
                if task in IMAGE_GENERATION_TASKS and task not in theme_tasks:
                    theme_tasks.append(task)
            per_theme[theme] = {"task_method": theme_method, "supported_tasks": theme_tasks}
        normalized.append(
            {
                "name": name,
                "min_images": min_images,
                "max_images": max_images,
                "output_type": output_type,
                "supported_tasks": supported_tasks,
                "interaction_requirements": interaction_requirements,
                "model_status": model_status,
                "backend_engine": _clean_text(item.get("backend_engine"))[:80],
                "task_method": _clean_text(item.get("task_method"))[:120],
                "purpose": _clean_text(item.get("purpose"))[:240],
                "image_slots": image_slots,
                "task_modes": task_modes,
                "themes": themes,
                "default_theme": default_theme,
                "per_theme": per_theme,
            }
        )
        if len(normalized) >= max(1, min(200, int(limit or 100))):
            break
    return normalized


def _preset_capability_map(capabilities):
    return {
        str(item.get("name") or "").strip().lower(): item
        for item in (capabilities if isinstance(capabilities, list) else [])
        if isinstance(item, dict) and str(item.get("name") or "").strip()
    }


def _normalize_parameter_profiles(value, limit=100):
    normalized = []
    seen = set()
    for item in value if isinstance(value, list) else []:
        if not isinstance(item, dict):
            continue
        name = re.sub(r"[\x00-\x1f\x7f]+", "", str(item.get("name") or "")).strip()[:120]
        preset = re.sub(r"[\x00-\x1f\x7f]+", "", str(item.get("preset") or item.get("preset_name") or "")).strip()[:120]
        if not name or not preset:
            continue
        key = (preset.casefold(), name.casefold())
        if key in seen:
            continue
        seen.add(key)
        normalized.append({
            "name": name,
            "preset": preset,
            "scene_theme": _clean_text(item.get("scene_theme"))[:120],
            "task_method": _clean_text(item.get("task_method"))[:120],
        })
        if len(normalized) >= max(1, min(200, int(limit or 100))):
            break
    return normalized


def _truthy(value, default=False):
    if value is None:
        return bool(default)
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on", "支持", "是"}


def _runtime_default_prompt_target_options():
    config = sys.modules.get("modules.config")
    if config is None:
        return {}

    preset = str(getattr(config, "preset", "") or "").strip()
    preset_content = {}
    if preset:
        try:
            preset_content = config.try_get_preset_content(preset) or {}
        except (Exception, SystemExit):
            preset_content = {}
    if not isinstance(preset_content, dict):
        preset_content = {}

    default_engine = preset_content.get("default_engine")
    if not isinstance(default_engine, dict):
        default_engine = getattr(config, "default_engine", {})
    if not isinstance(default_engine, dict):
        default_engine = {}
    backend_params = default_engine.get("backend_params", {})
    if not isinstance(backend_params, dict):
        backend_params = {}

    return {
        "preset": preset,
        "backend_engine": default_engine.get("backend_engine") or getattr(config, "backend_engine", ""),
        "task_method": backend_params.get("task_method") or "",
        "prompt_format": backend_params.get("prompt_format") or "",
        "text_encoder": (
            backend_params.get("text_encoder")
            or backend_params.get("clip_model")
            or preset_content.get("default_clip_model")
            or getattr(config, "default_clip_model", "")
        ),
        "base_model": (
            preset_content.get("default_model")
            or getattr(config, "default_base_model_name", "")
            or getattr(config, "default_model", "")
        ),
    }


def _has_prompt_target_options(options):
    if not isinstance(options, dict):
        return False
    return any(str(options.get(key) or "").strip() for key in PROMPT_TARGET_OPTION_KEYS)


def _merge_prompt_target_options(options, use_runtime_defaults=False):
    merged = _runtime_default_prompt_target_options() if use_runtime_defaults and not _has_prompt_target_options(options) else {}
    for key, value in (options if isinstance(options, dict) else {}).items():
        if value is None:
            continue
        if isinstance(value, bool):
            merged[key] = value
            continue
        if str(value or "").strip():
            merged[key] = value
    return merged


def _prompt_target_field(options, *names):
    for name in names:
        value = options.get(name) if isinstance(options, dict) else None
        if value is None:
            continue
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _prompt_target_haystack(options):
    options = options if isinstance(options, dict) else {}
    fields = [
        _prompt_target_field(options, "preset", "preset_name", "selected_preset"),
        _prompt_target_field(options, "backend_engine", "engine", "engine_type"),
        _prompt_target_field(options, "task_method", "method"),
        _prompt_target_field(options, "prompt_format", "target_key", "prompt_target"),
        _prompt_target_field(options, "text_encoder", "clip_model", "clip"),
        _prompt_target_field(options, "base_model", "model", "checkpoint", "workflow", "workflow_name"),
    ]
    return " ".join(field for field in fields if field).lower()


def _is_anima_prompt_target(options):
    haystack = _prompt_target_haystack(options)
    if not haystack:
        return False
    return bool(
        re.search(r"(^|[^a-z0-9])anima([^a-z0-9]|$)", haystack)
        or "anima_aio" in haystack
        or "anima-base" in haystack
        or "anima_base" in haystack
    )


def _prompt_mode_from_options(options):
    options = options if isinstance(options, dict) else {}
    if _is_anima_prompt_target(options):
        return "anima"
    return "danbooru_tags" if options.get("output_tags") else "natural"


def _prompt_options_from_payload(payload, lang):
    raw_options = payload.get("prompt_options") if isinstance(payload.get("prompt_options"), dict) else {}
    chat_mode = _normalize_chat_mode(payload.get("chat_mode") or payload.get("describe_chat_mode"))
    options = _merge_prompt_target_options(raw_options, use_runtime_defaults=chat_mode == "prompt")
    output_tags = _truthy(options.get("output_tags", payload.get("output_tags")), False)
    output_chinese = _truthy(options.get("output_chinese", payload.get("output_chinese")), _normalize_lang(lang) != "en")
    output_artist = _truthy(options.get("output_artist", payload.get("output_artist")), False)
    message = str(payload.get("message") or payload.get("prompt") or "")
    prompt_intent = _truthy(payload.get("prompt_intent"), False) or bool(PROMPT_INTENT_RE.search(message))
    include_current_prompt = chat_mode == "prompt"
    normalized_options = dict(options)
    normalized_options.update({"output_tags": output_tags, "output_chinese": output_chinese, "output_artist": output_artist})
    mode = _prompt_mode_from_options(normalized_options)
    system_prompt_template_id = _clean_text(
        payload.get("system_prompt_template_id")
        or payload.get("vlm_system_prompt_template_id")
        or payload.get("template_id")
        or ""
    )
    custom_system_prompt = _clean_multiline_text(
        payload.get("custom_system_prompt")
        or payload.get("user_system_prompt")
        or payload.get("system_prompt")
        or ""
    )
    if system_prompt_template_id and not custom_system_prompt:
        custom_system_prompt = _clean_multiline_text(
            vlm_system_prompt_templates.resolve_vlm_system_prompt_template(system_prompt_template_id)
        )
    creative_preferences = _normalize_creative_preferences(payload.get("creative_preferences"))
    return {
        "chat_mode": chat_mode,
        "mode": mode,
        "output_tags": output_tags,
        "output_chinese": output_chinese,
        "output_artist": output_artist,
        "target_preset": _prompt_target_field(options, "preset", "preset_name", "selected_preset"),
        "target_backend_engine": _prompt_target_field(options, "backend_engine", "engine", "engine_type"),
        "target_task_method": _prompt_target_field(options, "task_method", "method"),
        "target_text_encoder": _prompt_target_field(options, "text_encoder", "clip_model", "clip"),
        "target_base_model": _prompt_target_field(options, "base_model", "model", "checkpoint"),
        "custom_system_prompt": custom_system_prompt,
        "system_prompt_template_id": system_prompt_template_id,
        "prompt_intent": prompt_intent,
        "request_prompt_language": _requested_prompt_language(message, lang),
        "include_current_prompt": include_current_prompt,
        "enable_prompt_skills": chat_mode == "prompt" or (chat_mode == "chat" and prompt_intent),
        "enable_generation_actions": chat_mode == "creative",
        "creative_preferences": creative_preferences,
        "media_manifest": _media_manifest_from_payload(payload),
        "preset_capabilities": _normalize_preset_capabilities(payload.get("preset_capabilities")),
        "parameter_profiles": _normalize_parameter_profiles(payload.get("parameter_profiles")),
    }


def _normalize_creative_preferences(value):
    source = value if isinstance(value, dict) else {}
    style = str(source.get("style") or "").strip().lower()
    if style not in {"anime", "realistic", "auto", "custom"}:
        style = ""
    preset = re.sub(r"[\x00-\x1f\x7f]+", "", str(source.get("preset") or "")).strip()[:120]
    parameter_profile = re.sub(
        r"[\x00-\x1f\x7f]+", "", str(source.get("parameter_profile") or source.get("profile") or "")
    ).strip()[:120]
    return {
        "prompted": _truthy(source.get("prompted"), False),
        "style": style,
        "preset": preset,
        "parameter_profile": parameter_profile,
        "auto_generate": _truthy(source.get("auto_generate"), False),
    }


def _prompt_skill_section(options, lang):
    options = options if isinstance(options, dict) else {}
    mode = options.get("mode") or _prompt_mode_from_options(options)
    prompt_lang = "Chinese" if options.get("output_chinese") else "English"
    if mode == "anima":
        target = (
            "Prompt target: Anima hybrid prompt for the active SimpAI preset. "
            "The action prompt must be English Anima-compatible positive prompt text with compact Danbooru/Anima anchors and short `nltags` when useful."
        )
        skill = _describe_anima_prompt_skill()
    elif mode == "danbooru_tags":
        target = "Prompt target: Danbooru tags. The action prompt must be English comma-separated tags."
        skill = DANBOORU_TAG_PROMPT_SKILL
    else:
        target = f"Prompt target: natural-language image prompt. The action prompt should use {prompt_lang} unless the user explicitly asks otherwise."
        skill = NATURAL_PROMPT_SKILL
    artist_note = (
        "If Artist is enabled, include a few style/artist-direction cues only when they help the prompt; never invent a specific living artist name. "
        if options.get("output_artist")
        else ""
    )
    target_context = (
        f"Active target context: preset={options.get('target_preset') or 'unknown'}, "
        f"backend_engine={options.get('target_backend_engine') or 'unknown'}, "
        f"task_method={options.get('target_task_method') or 'unknown'}, "
        f"text_encoder={options.get('target_text_encoder') or 'unknown'}, "
        f"base_model={options.get('target_base_model') or 'unknown'}.\n"
        if any(options.get(key) for key in ("target_preset", "target_backend_engine", "target_task_method", "target_text_encoder", "target_base_model"))
        else ""
    )
    return (
        f"{PROMPT_ASSISTANT_SYSTEM}\n"
        f"{target}\n"
        f"{target_context}"
        f"{artist_note}"
        "Do not hide the real prompt in prose, and do not return only a completion notice.\n\n"
        f"{skill.strip()}"
    )


def _describe_chat_system_prompt(options, lang):
    options = options if isinstance(options, dict) else {}
    chat_mode = _normalize_chat_mode(options.get("chat_mode"))
    custom_system_prompt = _clean_multiline_text(options.get("custom_system_prompt"))
    reply_lang = "English" if _normalize_lang(lang) == "en" else "Chinese"

    if chat_mode == "raw":
        sections = []
        if custom_system_prompt:
            sections.append(custom_system_prompt)
        else:
            sections.append("You are a helpful multimodal chat model. Answer the user directly.")
        sections.append(
            "Runtime note: this is a standalone Describe Image chat wrapper with no canvas tools. "
            "Keep answers in the user's UI language unless the user asks otherwise."
        )
        return "\n\n".join(section for section in sections if section).strip()

    sections = [
        DESCRIBE_CHAT_BASE_SYSTEM,
        f"UI language: {_normalize_lang(lang)}. Reply language: {reply_lang}.",
    ]
    if chat_mode == "chat":
        sections.append(
            "Default chat mode: normal conversation is allowed. "
            "Do not force every answer into prompt-writing. "
            "Only use prompt actions when the user clearly asks you to write, refine, append, or prepare an image-generation prompt. "
            "This mode cannot start image generation or editing. When the user asks to generate or edit an image, tell them to switch to Creative mode."
        )
    elif chat_mode == "creative":
        sections.append(CREATIVE_ASSISTANT_SYSTEM)
        preference = options.get("creative_preferences") if isinstance(options.get("creative_preferences"), dict) else {}
        preferred_style = str(preference.get("style") or "").strip()
        preferred_preset = str(preference.get("preset") or "").strip()
        preferred_parameter_profile = str(preference.get("parameter_profile") or "").strip()
        automatic_preset_selection = preferred_style == "auto" and not preferred_preset
        auto_generate = bool(preference.get("auto_generate"))
        sections.append(
            "The UI will start valid generate_image actions immediately; keep the reply short and do not ask the user to confirm."
            if auto_generate
            else "The UI will show a review card before execution; tell the user they can review and confirm the request."
        )
        request_prompt_language = options.get("request_prompt_language") or _normalize_lang(lang)
        prompt_language_name = "English" if request_prompt_language == "en" else "Chinese"
        sections.append(
            f"Latest request prompt language: {prompt_language_name}. For multilingual natural-language targets, including Krea2, "
            f"actions[0].prompt must be written in {prompt_language_name}. Only an explicit user language request or a workflow-specific "
            "English-only prompt contract such as Anima or Flux/T5 outpaint may override this instruction."
        )
        media_manifest = options.get("media_manifest") if isinstance(options.get("media_manifest"), list) else []
        if media_manifest:
            manifest_text = ", ".join(
                f"visual input {item.get('index')} ref={item.get('ref')} type={item.get('type')}"
                for item in media_manifest if isinstance(item, dict)
            )
            sections.append(
                f"Attached media manifest, in the exact order seen by the VLM: {manifest_text}. "
                "Use only these refs in media_refs."
            )
        if preferred_style or preferred_preset or preferred_parameter_profile:
            sections.append(
                "Active session creative preference: "
                f"style={preferred_style or 'unspecified'}, preset={preferred_preset or 'application-selected'}, "
                f"parameter_profile={preferred_parameter_profile or 'none'}. "
                "Use the style as prompt context. The application applies and validates the concrete Preset."
            )
        else:
            sections.append(
                "No session creative preference is selected. The UI preference card already lets the user choose, so do not repeat that question. "
                "If the user names a style or Preset now, record it with set_creative_preference."
            )
        private_profiles = options.get("parameter_profiles") if isinstance(options.get("parameter_profiles"), list) else []
        if private_profiles:
            profile_catalog = [
                {
                    "name": item.get("name"),
                    "preset": item.get("preset"),
                    "scene_theme": item.get("scene_theme") or "",
                }
                for item in private_profiles
                if isinstance(item, dict)
            ]
            sections.append(
                "Private parameter profile catalog (data only): "
                f"{json.dumps(profile_catalog, ensure_ascii=False, separators=(',', ':'))}. "
                "Use an exact profile name only when the latest user message explicitly asks to use it. "
                "Do not infer a profile from style similarity, and never describe or invent its hidden parameter values."
            )
        else:
            sections.append(
                "No private parameter profiles are available for this user. Do not invent a parameter profile name."
            )
        if automatic_preset_selection:
            sections.append(
                "Automatic Preset selection is active in the application. Return only the task request; do not make a per-request Preset choice. "
                "The session preference must remain automatic unless the user explicitly asks to make a style or Preset their ongoing preference."
            )
        creative_target = {"preset": preferred_preset or options.get("target_preset")}
        sections.append(
            _describe_anima_prompt_skill(ANIMA_CREATIVE_PROMPT_ADAPTER)
            if _is_anima_prompt_target(creative_target)
            else NATURAL_PROMPT_SKILL.strip()
        )
    elif chat_mode == "guide":
        sections.append(
            "Guide mode: focus on helping the user choose SimpAI Studio main-interface workflows and presets. "
            "Do not return prompt-action JSON or start generation in this mode. "
            "Creative mode can run image Presets through Canvas Runner for text-to-image, single-image editing, and multi-image editing; "
            "recommend switching there when the user wants the chat to generate or edit images directly."
        )
        sections.append(_describe_preset_guide_skill())
    else:
        sections.append(
            "Prompt assistant mode: focus on turning the user's request and any attached image into a strong image-generation prompt, "
            "while still answering direct non-prompt questions normally."
        )
    if custom_system_prompt:
        sections.append(
            "User custom system prompt. Follow it for role, tone, and constraints unless it conflicts with the active mode's action contract:\n"
            f"{custom_system_prompt}"
        )
    if chat_mode != "guide" and options.get("enable_prompt_skills"):
        sections.append(_prompt_skill_section(options, lang))
    elif chat_mode == "guide":
        sections.append(
            "Return practical workflow guidance only. If the user needs prompt text, suggest switching to Prompt Assistant mode."
        )
    elif chat_mode != "creative":
        sections.append(
            "Prompt-writing skill is available, but it is not active for this turn. "
            "Return plain conversational text and no action JSON unless the user's next message asks for prompt text."
        )
    return "\n\n".join(section for section in sections if section).strip()


def _custom_runtime_params(payload):
    custom = payload.get("custom_api") if isinstance(payload.get("custom_api"), dict) else {}
    version = str(payload.get("version") or "").strip()
    custom_requested = bool(
        version == "Custom"
        or re.search(r"(^|\s)Custom($|\s)", version)
        or custom.get("base_url")
        or custom.get("model")
        or custom.get("api_key")
    )
    if not custom_requested:
        return version, {}

    base_url = str(custom.get("base_url") or custom.get("custom_base_url") or "").strip()
    model = str(custom.get("model") or custom.get("custom_model") or "").strip()
    api_key = str(custom.get("api_key") or custom.get("custom_api_key") or "").strip()
    params = {
        "version": "Custom",
        "custom_api_name": str(custom.get("api_name") or custom.get("custom_api_name") or "Custom").strip() or "Custom",
        "custom_provider": str(custom.get("provider") or custom.get("custom_provider") or "custom").strip() or "custom",
        "custom_api_format": str(custom.get("api_format") or custom.get("custom_api_format") or "openai_compatible").strip() or "openai_compatible",
        "custom_base_url": base_url,
        "custom_model": model,
        "custom_api_key": api_key,
        "custom_supports_images": _truthy(custom.get("supports_images", custom.get("custom_supports_images")), True),
    }
    return "Custom", params


def _prompt_for_runtime(message, current_prompt, include_current_prompt=False):
    message = str(message or "").strip()
    if not include_current_prompt:
        return message
    current_prompt = str(current_prompt or "").strip()
    if not current_prompt:
        return message
    return (
        f"{message}\n\n"
        "Current main prompt box content, for context only unless the user asks to refine or append:\n"
        f"{current_prompt[:4000]}"
    )


def build_runtime_payload(payload):
    payload = payload if isinstance(payload, dict) else {}
    message = str(payload.get("message") or payload.get("prompt") or "").strip()
    if not message:
        return {"ok": False, "error": "Message is empty."}

    conversation_id = _clean_text(payload.get("conversation_id")) or f"describe_vlm_chat:{int(time.time() * 1000)}"
    lang = _normalize_lang(payload.get("lang") or payload.get("__lang"))
    current_prompt = str(payload.get("current_prompt") or "")
    media_sources = _media_sources_from_payload(payload, conversation_id)
    prompt_options = _prompt_options_from_payload(payload, lang)
    unload_after_chat = _truthy(payload.get("unload_after_chat", payload.get("free_after")), False)
    prompt_actions_enabled = bool(prompt_options.get("enable_prompt_skills") and prompt_options.get("chat_mode") not in {"raw", "guide"})
    generation_actions_enabled = bool(prompt_options.get("enable_generation_actions"))
    prompt_mode_active = prompt_options.get("chat_mode") in {"prompt", "guide", "creative"} or prompt_actions_enabled
    params = {
        "mode": "chat",
        "agent_mode": "raw",
        "agent_use_skills": False,
        "agent_use_canvas_context": False,
        "agent_action_hints": False,
        "compact_agent_prompt": True,
        "disable_llm_draft_retry": True,
        "prompt": _prompt_for_runtime(message, current_prompt, include_current_prompt=prompt_options["include_current_prompt"]),
        "user_system_prompt": _describe_chat_system_prompt(prompt_options, lang),
        "describe_chat_mode": prompt_options["chat_mode"],
        "describe_prompt_mode": prompt_options["mode"],
        "describe_prompt_intent": prompt_options["prompt_intent"],
        "describe_prompt_actions_enabled": prompt_actions_enabled,
        "describe_generation_actions_enabled": generation_actions_enabled,
        "describe_actions_enabled": prompt_actions_enabled or generation_actions_enabled,
        "describe_prompt_target_preset": prompt_options["target_preset"],
        "describe_prompt_target_backend_engine": prompt_options["target_backend_engine"],
        "describe_prompt_target_task_method": prompt_options["target_task_method"],
        "describe_prompt_target_text_encoder": prompt_options["target_text_encoder"],
        "describe_prompt_target_base_model": prompt_options["target_base_model"],
        "describe_current_prompt_included": bool(prompt_options["include_current_prompt"] and str(current_prompt or "").strip()),
        "describe_custom_system_prompt": bool(prompt_options["custom_system_prompt"]),
        "describe_system_prompt_template_id": prompt_options["system_prompt_template_id"],
        "describe_output_tags": prompt_options["output_tags"],
        "describe_output_chinese": prompt_options["output_chinese"],
        "describe_output_artist": prompt_options["output_artist"],
        "describe_unload_after_chat": unload_after_chat,
        "describe_creative_preference_style": prompt_options["creative_preferences"]["style"],
        "describe_creative_preference_preset": prompt_options["creative_preferences"]["preset"],
        "describe_creative_preference_parameter_profile": prompt_options["creative_preferences"]["parameter_profile"],
        "describe_creative_auto_generate": prompt_options["creative_preferences"]["auto_generate"],
        "describe_media_manifest": prompt_options["media_manifest"],
        "describe_preset_capabilities": prompt_options["preset_capabilities"],
        "describe_parameter_profiles": prompt_options["parameter_profiles"],
        "free_after": unload_after_chat,
        "conversation_id": conversation_id,
        "save_context": True,
        "max_history": 16,
        "context_chars": 6000,
        "max_tokens": 1400 if prompt_mode_active else 1800,
        "temperature": 0.45 if prompt_mode_active else 0.7,
        "top_p": 0.85 if prompt_mode_active else 0.9,
        "top_k": 40,
        "repetition_penalty": 1.05,
    }
    version, custom_params = _custom_runtime_params(payload)
    if version:
        params["version"] = version
    if custom_params:
        params.update(custom_params)

    runtime_payload = {
        "project_id": "describe_image_chat",
        "node_id": "describe_vlm_chat",
        "conversation_id": conversation_id,
        "asset_sources": media_sources,
        "chat_messages": _normalize_history(payload.get("history"), limit=18, budget=6000),
        "chat_messages_full": _normalize_history(payload.get("history_full") or payload.get("history"), limit=32, budget=9000),
        "context": payload.get("context") if isinstance(payload.get("context"), dict) else {},
        "agent_context": None,
        "params": params,
    }
    if params.get("custom_api_key"):
        runtime_payload["api_key"] = params.get("custom_api_key")

    return {
        "ok": True,
        "runtime_payload": runtime_payload,
    }


def _creative_director_system_prompt(payload, lang):
    preference = _normalize_creative_preferences(payload.get("creative_preferences"))
    preset = preference.get("preset") or ""
    style = preference.get("style") or "auto"
    previous_scene_key = _clean_text(payload.get("last_scene_key"))[:160]
    reply_lang = "English" if _normalize_lang(lang) == "en" else "Chinese"
    prompt_skill = (
        _describe_anima_prompt_skill(ANIMA_CREATIVE_PROMPT_ADAPTER)
        if _is_anima_prompt_target({"preset": preset})
        else NATURAL_PROMPT_SKILL
    )
    return (
        f"{CREATIVE_DIRECTOR_SYSTEM}\n\n"
        f"UI reply language: {reply_lang}. Session preference: style={style}, preset={preset or 'agent chooses'}. "
        f"Previously offered scene_key={previous_scene_key or 'none'}; do not offer the same scene again. "
        "The offer_text must use the UI reply language. The image prompt must follow the preferred Preset's prompt format.\n\n"
        f"{prompt_skill.strip()}"
    )


def build_creative_offer_runtime_payload(payload):
    payload = payload if isinstance(payload, dict) else {}
    conversation_id = _clean_text(payload.get("conversation_id")) or f"describe_vlm_chat:{int(time.time() * 1000)}"
    request_id = _clean_text(payload.get("request_id")) or f"director:{int(time.time() * 1000)}"
    lang = _normalize_lang(payload.get("lang") or payload.get("__lang"))
    user_message = _clean_multiline_text(payload.get("message"), limit=3000)
    assistant_reply = _clean_multiline_text(payload.get("assistant_reply"), limit=5000)
    if not user_message or not assistant_reply:
        return {"ok": False, "error": "Creative director context is incomplete."}
    prompt = (
        "Evaluate the latest exchange for a proactive image offer.\n\n"
        f"Latest user message:\n{user_message}\n\n"
        f"Main assistant reply already shown:\n{assistant_reply}"
    )
    params = {
        "mode": "chat",
        "agent_mode": "raw",
        "agent_use_skills": False,
        "agent_use_canvas_context": False,
        "agent_action_hints": False,
        "compact_agent_prompt": True,
        "disable_llm_draft_retry": True,
        "prompt": prompt,
        "user_system_prompt": _creative_director_system_prompt(payload, lang),
        "describe_chat_mode": "creative_director",
        "describe_actions_enabled": False,
        "free_after": _truthy(payload.get("unload_after_chat", payload.get("free_after")), False),
        "conversation_id": f"{conversation_id}:visual_director:{request_id}",
        "save_context": False,
        "max_history": 14,
        "context_chars": 6500,
        "max_tokens": 800,
        "temperature": 0.25,
        "top_p": 0.8,
        "top_k": 30,
        "repetition_penalty": 1.03,
    }
    version, custom_params = _custom_runtime_params(payload)
    if version:
        params["version"] = version
    if custom_params:
        params.update(custom_params)
    runtime_payload = {
        "project_id": "describe_image_chat_director",
        "node_id": "describe_vlm_chat_visual_director",
        "conversation_id": params["conversation_id"],
        "asset_sources": [],
        "chat_messages": _normalize_history(payload.get("history"), limit=14, budget=6500),
        "chat_messages_full": _normalize_history(payload.get("history_full") or payload.get("history"), limit=20, budget=8000),
        "context": {"request_kind": "creative_offer"},
        "agent_context": None,
        "params": params,
    }
    if params.get("custom_api_key"):
        runtime_payload["api_key"] = params.get("custom_api_key")
    return {"ok": True, "runtime_payload": runtime_payload, "conversation_id": conversation_id}


def _extract_json_object(text):
    source = str(text or "").strip()
    if not source:
        return None
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", source, re.I)
    if fenced:
        source = fenced.group(1).strip()
    decoder = json.JSONDecoder()
    for index, char in enumerate(source):
        if char != "{":
            continue
        try:
            value, _ = decoder.raw_decode(source[index:])
            if isinstance(value, dict):
                return value
        except Exception:
            continue
    return None


def parse_creative_offer_response(text, lang="cn", default_generation_preset="Z-imageT"):
    data = _extract_json_object(text)
    if not isinstance(data, dict) or not _truthy(data.get("offer"), False):
        return {"offer": False}
    try:
        score = max(0.0, min(1.0, float(data.get("score") or 0.0)))
    except Exception:
        score = 0.0
    reason = str(data.get("reason") or "").strip().lower().replace("-", "_")
    prompt = str(data.get("prompt") or data.get("positive_prompt") or "").strip()
    if score < CREATIVE_OFFER_MIN_SCORE or reason not in CREATIVE_OFFER_REASONS or not prompt:
        return {"offer": False}
    prompt = sanitize_danbooru_character_outfit_tags(prompt)
    prompt = canvas_danbooru_service._canvas_prompt_safe_danbooru_text(prompt)
    scene_key = re.sub(r"[^a-z0-9:_-]+", "-", str(data.get("scene_key") or "").strip().lower()).strip("-")[:160]
    if not scene_key:
        scene_key = re.sub(r"[^a-z0-9:_-]+", "-", prompt.lower()).strip("-")[:160]
    preset = re.sub(
        r"[\x00-\x1f\x7f]+",
        "",
        str(data.get("preset") or data.get("preset_name") or default_generation_preset or "Z-imageT"),
    ).strip()[:120]
    offer_text = _clean_multiline_text(data.get("offer_text") or data.get("reply"), limit=240)
    if not offer_text:
        offer_text = "I want to draw this moment." if _normalize_lang(lang) == "en" else "我想画下这一幕。"
    return {
        "offer": True,
        "score": score,
        "reason": reason,
        "scene_key": scene_key,
        "offer_text": offer_text,
        "prompt": prompt,
        "preset": preset or "Z-imageT",
        "aspect_ratio": _normalize_creative_aspect_ratio(data.get("aspect_ratio") or data.get("aspect") or data.get("ratio")),
        "image_number": _normalize_creative_image_number(data.get("image_number") or data.get("count") or 1),
    }


_DANBOORU_CHARACTER_TAG_RE = re.compile(r"^(?P<name>[a-z0-9][a-z0-9_]*?)_\((?P<context>[^)]*)\)$", re.I)


def sanitize_danbooru_character_outfit_tags(prompt_text):
    source = str(prompt_text or "").strip()
    if "," not in source:
        return source

    tags = [tag.strip() for tag in source.split(",")]
    character_prefixes = set()
    for tag in tags:
        match = _DANBOORU_CHARACTER_TAG_RE.match(tag)
        if not match:
            continue
        context = match.group("context").lower()
        if "outfit" in context:
            continue
        character_prefixes.add(match.group("name").lower())

    if not character_prefixes:
        return source

    cleaned = []
    changed = False
    seen = set()
    for tag in tags:
        if not tag:
            continue
        match = _DANBOORU_CHARACTER_TAG_RE.match(tag)
        if match and match.group("name").lower() in character_prefixes and "outfit" in match.group("context").lower():
            changed = True
            continue
        tag_key = tag.lower()
        if tag_key in seen:
            changed = True
            continue
        seen.add(tag_key)
        cleaned.append(tag)

    return ", ".join(cleaned) if changed else source


def _normalize_creative_aspect_ratio(value):
    text = str(value or "auto").strip().lower().replace("：", ":").replace("x", ":").replace("*", ":")
    aliases = {
        "square": "1:1",
        "landscape": "16:9",
        "horizontal": "16:9",
        "portrait": "9:16",
        "vertical": "9:16",
    }
    text = aliases.get(text, text)
    return text if text in CREATIVE_ASPECT_RATIOS else "auto"


def _normalize_creative_image_number(value):
    try:
        number = int(float(value))
    except Exception:
        number = 1
    return max(1, min(4, number))


def _normalize_generation_media_refs(value, available_media_refs=None):
    available = []
    for item in available_media_refs if isinstance(available_media_refs, list) else []:
        ref = _clean_text(item.get("ref") if isinstance(item, dict) else item)[:160]
        media_type = str(item.get("type") or "image").strip().lower() if isinstance(item, dict) else "image"
        if ref and media_type == "image" and ref not in available:
            available.append(ref)
    allowed = set(available)
    normalized = []
    raw_refs = value if isinstance(value, list) else []
    for item in raw_refs:
        ref = _clean_text(item.get("ref") if isinstance(item, dict) else item)[:160]
        if ref and ref in allowed and ref not in normalized:
            normalized.append(ref)
    return normalized, available


SPECIALIZED_IMAGE_TASK_PATTERNS = (
    ("image_detail_enhance", re.compile(r"(?:修手|修脸|修眼|精修.{0,4}(?:手|脸|眼|细节)|修(?!改|图)(?:一下)?.{0,12}(?:手部|手指|手|面部|脸部|脸|五官|眼睛|眼部|眼)|(?:修复|改善|优化).{0,6}(?:手部|手指|面部|脸部|五官|眼睛|眼部)|(?:手部|手指|面部|脸部|五官|眼睛|眼部).{0,6}(?:修复|改善|优化)|(?:fix|repair|enhance).{0,10}(?:hand|finger|face|eye)|detail enhancement)", re.I)),
    ("image_background_removal", re.compile(r"(?:\u53bb(?:\u6389)?|\u79fb\u9664|\u5220\u9664).{0,8}(?:\u80cc\u666f|\u5e95\u8272)|\u62a0\u56fe|remov(?:e|ing).{0,12}background", re.I)),
    ("image_outpaint", re.compile(r"\u6269\u56fe|\u6269\u5c55.{0,6}(?:\u753b\u5e03|\u753b\u9762|\u8fb9\u7f18)|outpaint", re.I)),
    ("image_upscale", re.compile(r"\u8d85\u5206|\u9ad8\u6e05\u5316|(?:\u653e\u5927|\u63d0\u9ad8|\u63d0\u5347).{0,8}(?:\u5206\u8fa8\u7387|\u6e05\u6670\u5ea6|\u50cf\u7d20)|upscal|super[-_ ]?resolution", re.I)),
    ("image_restore", re.compile(r"\u8001\u7167\u7247|(?:\u4fee\u590d|\u590d\u539f).{0,8}(?:\u7167\u7247|\u56fe\u7247|\u56fe\u50cf)|\u53bb\u5212\u75d5|photo restoration|restore.{0,8}(?:photo|image)", re.I)),
    ("image_relight", re.compile(r"\u91cd(?:\u65b0)?\u6253\u5149|\u6362.{0,4}\u5149|\u6539.{0,4}\u5149\u7167|relight|change.{0,8}light", re.I)),
    ("image_style_transfer", re.compile(r"\u98ce\u683c\u8fc1\u79fb|\u8fc1\u79fb.{0,6}\u98ce\u683c|style transfer", re.I)),
    ("image_face_swap", re.compile(r"\u6362\u8138|(?:\u6362\u6210|\u66ff\u6362).{0,12}(?:\u8138|\u4eba\u8138)|face[-_ ]?swap", re.I)),
    ("image_pose_extraction", re.compile(r"\u63d0\u53d6.{0,6}(?:\u59ff\u52bf|\u9aa8\u9abc)|(?:\u59ff\u52bf|\u9aa8\u9abc).{0,6}\u63d0\u53d6|pose extraction|skeleton", re.I)),
    ("image_pose_transfer", re.compile(r"\u59ff\u52bf\u8fc1\u79fb|\u52a8\u4f5c\u8fc1\u79fb|\u53c2\u8003.{0,6}\u59ff\u52bf|pose transfer|copy.{0,8}pose", re.I)),
    ("image_anime_to_real", re.compile(r"(?:\u52a8\u6f2b|\u4e8c\u6b21\u5143).{0,8}(?:\u771f\u4eba|\u5199\u5b9e)|anime[-_ ]?to[-_ ]?real", re.I)),
    ("image_view_synthesis", re.compile(r"\u591a\u89d2\u5ea6|\u591a\u89c6\u89d2|\u4e09\u89c6\u56fe|\u6362.{0,4}\u89d2\u5ea6|multi[-_ ]?angle|multi[-_ ]?view", re.I)),
    ("image_depth_estimation", re.compile(r"\u6df1\u5ea6\u56fe|\u4f30\u8ba1.{0,6}\u6df1\u5ea6|depth map|depth estimation", re.I)),
    ("image_expression_transfer", re.compile(r"\u8868\u60c5\u8fc1\u79fb|\u53c2\u8003.{0,6}\u8868\u60c5|expression transfer", re.I)),
    ("image_object_transfer", re.compile(r"\u7269\u4f53\u8fc1\u79fb|\u7279\u5f81\u8fc1\u79fb|\u6362\u88c5|\u670d\u88c5\u8fc1\u79fb|\u6750\u8d28\u8fc1\u79fb|(?=[\s\S]*(?:\u56fe\s*[\u4e001]|\u7b2c\u4e00\u5f20(?:\u56fe)?))(?=[\s\S]*(?:\u56fe\s*[\u4e8c2]|\u7b2c\u4e8c\u5f20(?:\u56fe)?))(?=[\s\S]*(?:\u8863\u670d|\u670d\u88c5|\u7a7f\u642d|\u9020\u578b))(?=[\s\S]*(?:\u7a7f\u4e0a|\u6362\u4e0a|\u6539\u7a7f|\u7a7f\u5230|\u6362\u5230|\u5957\u7528|\u8fc1\u79fb))|object transfer|feature transfer|clothing transfer|(?=[\s\S]*(?:(?:image|photo)\s*(?:1|one)|first\s+(?:image|photo)))(?=[\s\S]*(?:(?:image|photo)\s*(?:2|two)|second\s+(?:image|photo)))(?=[\s\S]*(?:outfit|clothes|clothing|dress))(?=[\s\S]*(?:wear|use|apply|transfer|put\s+on))", re.I)),
    ("image_object_removal", re.compile(r"(?:\u53bb(?:\u6389)?|\u79fb\u9664|\u5220\u9664|\u64e6\u9664).{0,10}(?:\u7269\u4f53|\u4eba\u7269|\u8def\u4eba|\u5bf9\u8c61|\u4e1c\u897f|\u6c34\u5370|\u5b57\u5e55)|object removal|remove.{0,10}(?:object|person|watermark|subtitle)", re.I)),
)


def _infer_specialized_generation_task(text):
    source = str(text or "").strip()
    if not source:
        return ""
    for task, pattern in SPECIALIZED_IMAGE_TASK_PATTERNS:
        if pattern.search(source):
            return task
    return ""


def _normalize_generation_task(value, media_refs, intent_text=""):
    task_key = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    task = GENERATION_TASK_ALIASES.get(task_key, task_key)
    inferred_task = _infer_specialized_generation_task(intent_text)
    if task not in IMAGE_GENERATION_TASKS:
        task = inferred_task or ("multi_image_edit" if len(media_refs) > 1 else "image_edit" if media_refs else "text_to_image")
    elif inferred_task and task in {"text_to_image", "image_edit", "multi_image_edit"}:
        task = inferred_task
    if not media_refs:
        return task
    if task == "text_to_image":
        return "multi_image_edit" if len(media_refs) > 1 else "image_edit"
    if task == "image_edit" and len(media_refs) > 1:
        return "multi_image_edit"
    if task == "multi_image_edit" and len(media_refs) == 1:
        return "image_edit"
    return task


def _generation_media_limit(preset, preset_capabilities, default=5):
    capability = _preset_capability_map(preset_capabilities).get(str(preset or "").strip().lower())
    if not capability:
        return max(0, min(5, int(default or 5)))
    try:
        return max(0, min(5, int(capability.get("max_images") or 0)))
    except Exception:
        return 0


def _preset_supports_generation_task(preset, task, image_count, preset_capabilities):
    capability = _preset_capability_map(preset_capabilities).get(str(preset or "").strip().lower())
    if not capability or capability.get("output_type") != "image":
        return False
    normalized_task = str(task or "").strip().lower().replace("-", "_")
    supported_tasks = capability.get("supported_tasks") if isinstance(capability.get("supported_tasks"), list) else []
    if normalized_task not in supported_tasks:
        return False
    try:
        min_images = max(0, int(capability.get("min_images") or 0))
        max_images = max(0, int(capability.get("max_images") or 0))
        count = max(0, int(image_count or 0))
    except Exception:
        return False
    if normalized_task == "text_to_image":
        return count == 0
    required = max(1, min_images)
    if normalized_task in MULTI_IMAGE_GENERATION_TASKS:
        required = max(2, required)
    return required <= count <= max_images


def _preset_model_status(capability):
    status = str(capability.get("model_status") or "").strip().lower() if isinstance(capability, dict) else ""
    return status if status in {"ready", "missing", "unknown"} else "unknown"


def _preset_requires_manual_interaction(capability):
    requirements = capability.get("interaction_requirements") if isinstance(capability, dict) else []
    return bool(requirements) if isinstance(requirements, list) else False


GENERATION_PRESET_PRIORITIES = {
    "image_upscale": ("Z-TTP", "Wan-TTP"),
    "image_restore": ("Imagerepair+", "OneKeyKontext"),
    "image_detail_enhance": ("Z-imageT", "Anima", "Flux2-Klein", "Qwen2512", "Wan(T2I)", "Flux1-dev", "NunFlux_fp4", "NunFlux_int4", "Illustrious(OB)", "Illustrious(MiaoKa)", "ChenkinXL", "SD1.5"),
    "image_background_removal": ("Removebg", "OneKeyKontext"),
    "image_object_removal": ("Flux2-KleinEdit", "Krea2-ImageEdit", "OneKeyKontext", "Eraser"),
    "image_object_transfer": ("QwenEdit+", "NunQwenEdit+_fp4", "NunQwenEdit+_int4", "Flux2-KleinEdit", "Krea2-ImageEdit", "Bernini-ImageEdit", "OneKeyKontext", "Swap+", "NunSwap_fp4", "NunSwap_int4"),
    "image_outpaint": ("OneKey-Outpaint",),
    "image_relight": ("Relight", "Flux2-AngleLight", "OneKeyKontext"),
    "image_style_transfer": ("StyleTransfer+",),
    "image_face_swap": ("QwenFaceSwap", "Swapface"),
    "image_pose_transfer": ("Flux2-KleinPose", "QwenPose"),
    "image_pose_extraction": ("OneKeyPose",),
    "image_anime_to_real": ("Flux2-A2R", "QwenA2R"),
    "image_view_synthesis": ("QwenMultiAngle", "OneKeyKontext"),
    "image_depth_estimation": ("Depthstatue", "OneKeyKontext"),
    "image_expression_transfer": ("LivePortrait Exp",),
}


def _generation_preset_priorities(task):
    return GENERATION_PRESET_PRIORITIES.get(task) or (
        ("Flux2-KleinEdit", "Krea2-ImageEdit", "QwenEdit+", "NunQwenEdit+_fp4", "NunQwenEdit+_int4", "Bernini-ImageEdit", "OneKeyKontext")
        if task in {"image_edit", "multi_image_edit"}
        else ("Z-imageT", "Anima")
    )


def _capability_route_rows(capability, task):
    if not isinstance(capability, dict) or capability.get("output_type") != "image":
        return []
    preset_tasks = capability.get("supported_tasks") if isinstance(capability.get("supported_tasks"), list) else []
    themes = capability.get("themes") if isinstance(capability.get("themes"), list) else []
    per_theme = capability.get("per_theme") if isinstance(capability.get("per_theme"), dict) else {}
    default_theme = str(capability.get("default_theme") or (themes[0] if themes else "")).strip()
    rows = []
    for theme in themes:
        info = per_theme.get(theme) if isinstance(per_theme.get(theme), dict) else {}
        theme_tasks = info.get("supported_tasks") if isinstance(info.get("supported_tasks"), list) else []
        if theme_tasks and task in theme_tasks:
            rows.append({"theme": theme, "task_method": str(info.get("task_method") or "").strip(), "classic_mode": "", "specialized": True})
    if rows:
        return rows
    if task not in preset_tasks:
        return []
    info = per_theme.get(default_theme) if isinstance(per_theme.get(default_theme), dict) else {}
    task_modes = capability.get("task_modes") if isinstance(capability.get("task_modes"), dict) else {}
    return [{
        "theme": default_theme,
        "task_method": str(info.get("task_method") or capability.get("task_method") or "").strip(),
        "classic_mode": str(task_modes.get(task) or "").strip(),
        "specialized": False,
    }]


def _capability_accepts_image_count(capability, task, image_count):
    try:
        min_images = max(0, int(capability.get("min_images") or 0))
        max_images = max(0, int(capability.get("max_images") or 0))
        count = max(0, int(image_count or 0))
    except Exception:
        return False
    if task == "text_to_image":
        return count == 0 and min_images == 0
    required = max(1, min_images)
    if task in MULTI_IMAGE_GENERATION_TASKS:
        required = max(2, required)
    return required <= count <= max_images


def _explicit_preset_family(message):
    source = str(message or "")
    for alias in PRESET_FAMILY_ALIASES:
        escaped = re.escape(alias)
        patterns = (
            rf"(?:用|使用|选用|选择|改用|换用|通过)\s*{escaped}(?:\s*2)?(?:\b|(?=[\u3400-\u9fff]))",
            rf"(?<![a-z0-9]){escaped}(?:\s*2)?\s*(?:生成|生图|画|制作|创建|修改|编辑|修图|处理)",
            rf"\b(?:use|using|with|via|choose|select|switch\s+to)\s+(?:the\s+)?{escaped}(?:\s*2)?\b",
        )
        if any(re.search(pattern, source, re.I) for pattern in patterns):
            return alias
    return ""


def _preset_family_names(preset):
    wanted = str(preset or "").strip().lower()
    for names in PRESET_FAMILY_ALIASES.values():
        if wanted in {name.lower() for name in names}:
            return names
    return ()


def _explicit_preset_hint(value, user_message, preset_capabilities, task="", image_count=0):
    hint = re.sub(r"[\x00-\x1f\x7f]+", "", str(value or "")).strip()[:120]
    message = str(user_message or "").lower()
    capability_map = _preset_capability_map(preset_capabilities)
    capability = capability_map.get(hint.lower())
    if capability and hint.lower() in message:
        return str(capability.get("name") or hint).strip()

    family = _explicit_preset_family(user_message)
    if not family:
        return ""
    candidates = [
        capability_map.get(name.lower())
        for name in PRESET_FAMILY_ALIASES.get(family, ())
    ]
    candidates = [item for item in candidates if isinstance(item, dict)]
    if task:
        matching = [
            item for item in candidates
            if _preset_supports_generation_task(
                item.get("name"), task, image_count, preset_capabilities
            )
        ]
        if matching:
            candidates = matching
    return str(candidates[0].get("name") or "").strip() if candidates else ""


def _parameter_profile_by_name(value, parameter_profiles, preset=""):
    name = re.sub(r"[\x00-\x1f\x7f]+", "", str(value or "")).strip()[:120]
    wanted_preset = str(preset or "").strip().casefold()
    if not name:
        return None
    matches = [
        item for item in (parameter_profiles if isinstance(parameter_profiles, list) else [])
        if isinstance(item, dict)
        and str(item.get("name") or "").strip().casefold() == name.casefold()
        and (not wanted_preset or str(item.get("preset") or "").strip().casefold() == wanted_preset)
    ]
    return dict(matches[0]) if len(matches) == 1 else None


def _task_method_key(value):
    text = str(value or "").strip().lower()
    return text[len("scene_"):] if text.startswith("scene_") else text


def _message_explicitly_uses_parameter_profile(name, user_message):
    profile_name = str(name or "").strip()
    message = str(user_message or "")
    if not profile_name or profile_name.casefold() not in message.casefold():
        return False
    escaped = re.escape(profile_name)
    patterns = (
        rf"(?:用|使用|采用|调用|选用|选择|改用|换用|按照|按|设为|固定为|继续用).{{0,8}}{escaped}",
        rf"{escaped}.{{0,8}}(?:参数|配置|预设|方案|生成|生图|修图|编辑)",
        rf"\b(?:use|using|with|apply|choose|select|switch\s+to).{{0,12}}{escaped}\b",
        rf"\b{escaped}\s+(?:profile|preset|settings?)\b",
    )
    return any(re.search(pattern, message, re.I) for pattern in patterns)


def _explicit_parameter_profile_hint(value, user_message, parameter_profiles, preset=""):
    profiles = [item for item in (parameter_profiles or []) if isinstance(item, dict)]
    hinted_name = re.sub(r"[\x00-\x1f\x7f]+", "", str(value or "")).strip()[:120]
    if hinted_name and _message_explicitly_uses_parameter_profile(hinted_name, user_message):
        match = _parameter_profile_by_name(hinted_name, profiles, preset)
        return match, hinted_name, "" if match else "parameter_profile_missing"
    named = [
        item for item in profiles
        if _message_explicitly_uses_parameter_profile(item.get("name"), user_message)
        and (not preset or str(item.get("preset") or "").strip().casefold() == str(preset).strip().casefold())
    ]
    named.sort(key=lambda item: len(str(item.get("name") or "")), reverse=True)
    if not named:
        return None, "", ""
    longest = len(str(named[0].get("name") or ""))
    longest_matches = [item for item in named if len(str(item.get("name") or "")) == longest]
    if len(longest_matches) != 1:
        return None, str(longest_matches[0].get("name") or ""), "parameter_profile_ambiguous"
    return dict(longest_matches[0]), str(longest_matches[0].get("name") or ""), ""


def _explicit_creative_style(value, user_message, has_explicit_preset=False):
    style = str(value or "").strip().lower()
    if style not in {"anime", "realistic", "auto", "custom"}:
        return ""
    if has_explicit_preset:
        return style or "custom"
    message = str(user_message or "")
    patterns = {
        "anime": r"(?:anime|动漫|二次元|动画风)",
        "realistic": r"(?:realistic|photoreal|写实|真人|摄影风)",
        "auto": r"(?:agent.{0,8}(?:decide|选择|决定)|自动选择|你来决定|交给\s*agent)",
    }
    return style if style in patterns and re.search(patterns[style], message, re.I) else ""


OUTPAINT_DEFAULT_PERCENT = 15
OUTPAINT_DIRECTIONS = ("up", "down", "left", "right")
OUTPAINT_DIRECTION_PATTERNS = {
    "up": r"(?:向?上(?:方|边|侧)?|顶部|top|up(?:ward)?)",
    "down": r"(?:向?下(?:方|边|侧)?|底部|bottom|down(?:ward)?)",
    "left": r"(?:向?左(?:方|边|侧)?|left)",
    "right": r"(?:向?右(?:方|边|侧)?|right)",
}


def _outpaint_percent(value):
    try:
        return max(0, min(100, int(round(float(value)))))
    except Exception:
        return 0


def _normalize_outpaint_intent(value, intent_text=""):
    source = value if isinstance(value, dict) else {}
    normalized = {direction: _outpaint_percent(source.get(direction)) for direction in OUTPAINT_DIRECTIONS}
    text = str(intent_text or "")
    selected = set()
    if re.search(r"(?:左右|横向|两侧|both sides|horizontal)", text, re.I):
        selected.update(("left", "right"))
    if re.search(r"(?:上下|纵向|顶部和底部|top and bottom|vertical)", text, re.I):
        selected.update(("up", "down"))
    for direction, pattern in OUTPAINT_DIRECTION_PATTERNS.items():
        if re.search(pattern, text, re.I):
            selected.add(direction)
    if re.search(r"(?:四周|四边|周围|所有方向|all directions|all sides)", text, re.I):
        selected.update(OUTPAINT_DIRECTIONS)
    if any(normalized.values()) and not selected:
        return normalized
    if not selected:
        selected.update(OUTPAINT_DIRECTIONS)

    generic_match = re.search(r"(?:扩图|外扩|扩展|outpaint|extend).{0,12}?(\d{1,3}(?:\.\d+)?)\s*%", text, re.I)
    generic_percent = _outpaint_percent(generic_match.group(1)) if generic_match else OUTPAINT_DEFAULT_PERCENT
    for direction in selected:
        pattern = OUTPAINT_DIRECTION_PATTERNS[direction]
        directional_match = re.search(
            rf"(?:{pattern}).{{0,12}}?(\d{{1,3}}(?:\.\d+)?)\s*%|(\d{{1,3}}(?:\.\d+)?)\s*%.{{0,12}}?(?:{pattern})",
            text,
            re.I,
        )
        explicit = next((group for group in directional_match.groups() if group is not None), None) if directional_match else None
        normalized[direction] = _outpaint_percent(explicit) if explicit is not None else normalized[direction] or generic_percent
    for direction in set(OUTPAINT_DIRECTIONS) - selected:
        normalized[direction] = 0
    if not any(normalized.values()):
        normalized = {direction: OUTPAINT_DEFAULT_PERCENT for direction in OUTPAINT_DIRECTIONS}
    return normalized


ENHANCE_TARGET_PATTERNS = {
    "face": re.compile(r"(?:脸|面部|脸部|五官|face)", re.I),
    "hand": re.compile(r"(?:手|手部|手指|hand|finger)", re.I),
    "eye": re.compile(r"(?:眼|眼睛|眼部|eye)", re.I),
}


def _normalize_enhance_targets(value, intent_text=""):
    source = value if isinstance(value, (list, tuple)) else [value] if isinstance(value, str) else []
    aliases = {
        "face": "face", "facial": "face", "脸": "face", "面部": "face", "脸部": "face", "五官": "face",
        "hand": "hand", "hands": "hand", "finger": "hand", "fingers": "hand", "手": "hand", "手部": "hand", "手指": "hand",
        "eye": "eye", "eyes": "eye", "眼": "eye", "眼睛": "eye", "眼部": "eye",
    }
    targets = []
    for raw in source:
        target = aliases.get(str(raw or "").strip().lower())
        if target and target not in targets:
            targets.append(target)
    text = str(intent_text or "")
    for target, pattern in ENHANCE_TARGET_PATTERNS.items():
        if pattern.search(text) and target not in targets:
            targets.append(target)
    return targets or ["face", "hand", "eye"]


def normalize_creative_task_request(item, available_media_refs=None, user_message=""):
    source = item if isinstance(item, dict) else {}
    instruction = str(
        source.get("instruction")
        or source.get("prompt")
        or source.get("text")
        or source.get("positive_prompt")
        or ""
    ).strip()
    refs, available = _normalize_generation_media_refs(
        source.get("media_refs") or source.get("input_refs"),
        available_media_refs,
    )
    task = _normalize_generation_task(
        source.get("task") or source.get("task_type"),
        refs,
        "\n".join(part for part in (user_message, instruction) if part),
    )
    if task != "text_to_image" and not refs:
        refs = available[:5]
        task = _normalize_generation_task(task, refs, user_message or instruction)
    outpaint = _normalize_outpaint_intent(
        source.get("outpaint") or source.get("outpaint_percentages"),
        "\n".join(part for part in (user_message, instruction) if part),
    ) if task == "image_outpaint" else {}
    request = {
        "task": task,
        "media_refs": refs,
        "instruction": instruction,
        "preset_hint": str(source.get("preset_hint") or source.get("preset") or source.get("preset_name") or "").strip()[:120],
        "aspect_ratio": _normalize_creative_aspect_ratio(source.get("aspect_ratio") or source.get("aspect") or source.get("ratio")),
        "image_number": _normalize_creative_image_number(source.get("image_number") or source.get("count") or source.get("images")),
    }
    parameter_profile_hint = str(
        source.get("parameter_profile_hint") or source.get("parameter_profile") or source.get("profile") or ""
    ).strip()[:120]
    if parameter_profile_hint:
        request["parameter_profile_hint"] = parameter_profile_hint
    if outpaint:
        request["outpaint"] = outpaint
    if task == "image_detail_enhance":
        request["enhance_targets"] = _normalize_enhance_targets(
            source.get("enhance_targets") or source.get("targets"),
            "\n".join(part for part in (user_message, instruction) if part),
        )
    return request


def compile_creative_execution_plan(
    task_request,
    preset_capabilities=None,
    available_media_refs=None,
    preferred_preset="",
    user_message="",
    parameter_profiles=None,
    preferred_parameter_profile="",
):
    request = normalize_creative_task_request(task_request, available_media_refs, user_message)
    capabilities = [item for item in (preset_capabilities or []) if isinstance(item, dict)]
    refs = request["media_refs"]
    task = request["task"]
    route_rows = []
    for order, capability in enumerate(capabilities):
        for route in _capability_route_rows(capability, task):
            route_rows.append({"capability": capability, "order": order, **route})

    required_count = 0 if task == "text_to_image" else 2 if task in MULTI_IMAGE_GENERATION_TASKS else 1
    count_compatible = [
        route for route in route_rows
        if _capability_accepts_image_count(route["capability"], task, len(refs))
    ]
    status = "ready"
    candidates = count_compatible
    if not refs and required_count:
        status = "needs_media"
        candidates = [
            route for route in route_rows
            if int(route["capability"].get("max_images") or 0) >= required_count
        ]

    preferred = str(preferred_preset or "").strip()
    hint = _explicit_preset_hint(
        request.get("preset_hint"), user_message, capabilities, task, len(refs)
    )
    explicit_profile, requested_profile_name, profile_error = _explicit_parameter_profile_hint(
        request.get("parameter_profile_hint"),
        user_message,
        parameter_profiles,
        hint,
    )
    session_profile = None
    if not explicit_profile and not requested_profile_name and preferred_parameter_profile:
        session_profile = _parameter_profile_by_name(
            preferred_parameter_profile,
            parameter_profiles,
            preferred,
        )
        if not session_profile:
            requested_profile_name = str(preferred_parameter_profile or "").strip()[:120]
            profile_error = "parameter_profile_missing"
    selected_profile = explicit_profile or session_profile
    parameter_profile_source = "request_hint" if explicit_profile else "session_preference" if session_profile else ""
    requested_preset = str((selected_profile or {}).get("preset") or hint or preferred).strip()

    if profile_error:
        return {
            "schema": "simpai.execution_plan.v1",
            "status": "parameter_profile_missing",
            "task": task,
            "preset": requested_preset,
            "theme": "",
            "task_method": "",
            "media_bindings": [],
            "interaction_requirements": [],
            "model_status": "unknown",
            "preset_source": "request_hint" if request.get("parameter_profile_hint") else "session_preference",
            "parameter_profile": requested_profile_name,
            "parameter_profile_source": "request_hint" if request.get("parameter_profile_hint") else "session_preference",
            "parameter_overrides": {},
        }
    if not candidates:
        unavailable_plan = {
            "schema": "simpai.execution_plan.v1",
            "status": "parameter_profile_incompatible" if selected_profile else "needs_media" if route_rows and len(refs) < required_count else "no_compatible_route",
            "task": task,
            "preset": requested_preset if selected_profile else "",
            "theme": "",
            "task_method": "",
            "media_bindings": [],
            "interaction_requirements": [],
            "model_status": "unknown",
            "preset_source": "request_hint" if explicit_profile else "session_preference" if session_profile else "automatic",
            "parameter_overrides": {},
        }
        if selected_profile:
            unavailable_plan["parameter_profile"] = str(selected_profile.get("name") or "")
            unavailable_plan["parameter_profile_source"] = parameter_profile_source
        return unavailable_plan

    explicit_candidates = [
        route for route in candidates
        if str(route["capability"].get("name") or "").strip().lower() == requested_preset.lower()
    ] if requested_preset else []
    if not explicit_candidates and requested_preset:
        family_names = {name.lower() for name in _preset_family_names(requested_preset)}
        explicit_candidates = [
            route for route in candidates
            if str(route["capability"].get("name") or "").strip().lower() in family_names
        ]
    if selected_profile and explicit_candidates:
        saved_theme = str(selected_profile.get("scene_theme") or "").strip()
        saved_method = _task_method_key(selected_profile.get("task_method"))
        explicit_candidates = [
            route for route in explicit_candidates
            if (not saved_theme or not route.get("theme") or str(route.get("theme") or "").strip() == saved_theme)
            and (
                not saved_method
                or not route.get("task_method")
                or _task_method_key(route.get("task_method")) == saved_method
            )
        ]
    if selected_profile and not explicit_candidates:
        return {
            "schema": "simpai.execution_plan.v1",
            "status": "parameter_profile_incompatible",
            "task": task,
            "preset": requested_preset,
            "theme": str(selected_profile.get("scene_theme") or ""),
            "task_method": str(selected_profile.get("task_method") or ""),
            "media_bindings": [],
            "interaction_requirements": [],
            "model_status": "unknown",
            "preset_source": "request_hint" if explicit_profile else "session_preference",
            "parameter_profile": str(selected_profile.get("name") or ""),
            "parameter_profile_source": parameter_profile_source,
            "parameter_overrides": {},
        }
    if explicit_candidates:
        candidates = explicit_candidates
        preset_source = "request_hint" if hint or explicit_profile else "session_preference"
    else:
        preset_source = "automatic"

    priorities = {name.lower(): index for index, name in enumerate(_generation_preset_priorities(task))}
    readiness_rank = {"ready": 0, "unknown": 1, "missing": 2}
    candidates.sort(key=lambda route: (
        1 if _preset_requires_manual_interaction(route["capability"]) else 0,
        readiness_rank[_preset_model_status(route["capability"])],
        priorities.get(str(route["capability"].get("name") or "").strip().lower(), len(priorities)),
        0 if route.get("specialized") else 1,
        route["order"],
    ))
    selected = candidates[0]
    capability = selected["capability"]
    requirements = capability.get("interaction_requirements") if isinstance(capability.get("interaction_requirements"), list) else []
    model_status = _preset_model_status(capability)
    if status == "ready" and requirements:
        status = "needs_mask" if "mask" in requirements else "needs_interaction"
    if status == "ready" and model_status == "missing":
        status = "models_missing"
    slots = capability.get("image_slots") if isinstance(capability.get("image_slots"), list) else []
    bindings = [
        {"ref": ref, "slot": slots[index]}
        for index, ref in enumerate(refs)
        if index < len(slots)
    ]
    parameter_overrides = {}
    if task == "image_outpaint":
        outpaint = request.get("outpaint") if isinstance(request.get("outpaint"), dict) else {}
        parameter_overrides = {
            "scene_var_number7": _outpaint_percent(outpaint.get("up")),
            "scene_var_number8": _outpaint_percent(outpaint.get("down")),
            "scene_var_number9": _outpaint_percent(outpaint.get("left")),
            "scene_var_number10": _outpaint_percent(outpaint.get("right")),
        }
    plan = {
        "schema": "simpai.execution_plan.v1",
        "status": status,
        "task": task,
        "preset": str(capability.get("name") or "").strip(),
        "theme": selected.get("theme") or "",
        "task_method": selected.get("task_method") or "",
        "media_bindings": bindings,
        "interaction_requirements": list(requirements),
        "model_status": model_status,
        "preset_source": preset_source,
        "parameter_overrides": parameter_overrides,
    }
    if selected_profile:
        plan["parameter_profile"] = str(selected_profile.get("name") or "")
        plan["parameter_profile_source"] = parameter_profile_source
    classic_mode = str(selected.get("classic_mode") or "").strip()
    if classic_mode:
        plan["classic_mode"] = classic_mode
    if task == "image_detail_enhance":
        plan["enhance_targets"] = list(request.get("enhance_targets") or ["face", "hand", "eye"])
    return plan


def _compatible_generation_preset(preset, task, image_count, preset_capabilities):
    current = str(preset or "").strip()
    capabilities = [item for item in (preset_capabilities or []) if isinstance(item, dict)]
    compatible = [
        item for item in capabilities
        if _preset_supports_generation_task(item.get("name"), task, image_count, capabilities)
    ]
    priorities = _generation_preset_priorities(task)
    priority_map = {name.lower(): index for index, name in enumerate(priorities)}
    readiness_rank = {"ready": 0, "unknown": 1, "missing": 2}
    compatible.sort(
        key=lambda item: (
            1 if _preset_requires_manual_interaction(item) else 0,
            readiness_rank[_preset_model_status(item)],
            priority_map.get(str(item.get("name") or "").strip().lower(), len(priority_map)),
        )
    )
    current_capability = _preset_capability_map(capabilities).get(current.lower())
    current_is_compatible = _preset_supports_generation_task(current, task, image_count, capabilities)
    if current_is_compatible:
        automatic_choice = next((item for item in compatible if not _preset_requires_manual_interaction(item)), None)
        if _preset_requires_manual_interaction(current_capability) and automatic_choice:
            return str(automatic_choice.get("name") or "").strip()
        ready_choice = next(
            (item for item in compatible if not _preset_requires_manual_interaction(item) and _preset_model_status(item) == "ready"),
            None,
        )
        if _preset_model_status(current_capability) != "ready" and ready_choice:
            return str(ready_choice.get("name") or "").strip()
        return current
    return str(compatible[0].get("name") or "").strip() if compatible else current


def _apply_generation_media_limits(actions, available_media_refs=None, preset_capabilities=None):
    normalized = []
    _, available = _normalize_generation_media_refs([], available_media_refs)
    for action in actions or []:
        if not isinstance(action, dict) or action.get("type") != "generate_image":
            normalized.append(action)
            continue
        item = dict(action)
        refs, _ = _normalize_generation_media_refs(item.get("media_refs"), available_media_refs)
        task = _normalize_generation_task(item.get("task"), refs, item.get("prompt"))
        if task != "text_to_image" and not refs:
            refs = available[:5]
            task = _normalize_generation_task(task, refs)
        item["preset"] = _compatible_generation_preset(
            item.get("preset"), task, len(refs), preset_capabilities
        )
        limit = _generation_media_limit(item.get("preset"), preset_capabilities)
        refs = refs[:limit]
        item["media_refs"] = refs
        item["task"] = _normalize_generation_task(task, refs)
        normalized.append(item)
    return normalized


def compile_creative_action_plans(
    actions,
    available_media_refs=None,
    preset_capabilities=None,
    preferred_preset="",
    user_message="",
    parameter_profiles=None,
    preferred_parameter_profile="",
):
    effective_preference = str(preferred_preset or "").strip()
    effective_parameter_profile = str(preferred_parameter_profile or "").strip()
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict) or action.get("type") != "set_creative_preference":
            continue
        candidate = _explicit_preset_hint(action.get("preset"), user_message, preset_capabilities)
        if candidate:
            effective_preference = candidate
        profile = _parameter_profile_by_name(
            action.get("parameter_profile"),
            parameter_profiles,
            action.get("preset") or candidate,
        )
        if profile:
            effective_parameter_profile = str(profile.get("name") or "").strip()
            effective_preference = str(profile.get("preset") or effective_preference).strip()
    compiled = []
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict) or action.get("type") != "generate_image":
            compiled.append(action)
            continue
        item = dict(action)
        request_source = item.get("task_request") if isinstance(item.get("task_request"), dict) else item
        request = normalize_creative_task_request(request_source, available_media_refs, user_message)
        plan = compile_creative_execution_plan(
            request,
            preset_capabilities,
            available_media_refs,
            effective_preference,
            user_message,
            parameter_profiles,
            effective_parameter_profile,
        )
        item.update({
            "task": request["task"],
            "media_refs": request["media_refs"],
            "task_request": request,
            "execution_plan": plan,
            "prompt": request["instruction"],
            "preset": plan.get("preset") or ("" if preset_capabilities else item.get("preset") or "Z-imageT"),
            "aspect_ratio": request["aspect_ratio"],
            "image_number": request["image_number"],
        })
        compiled.append(item)
    return compiled


def _creative_action_prompt_target(action, preset_capabilities=None):
    if not isinstance(action, dict) or action.get("type") != "generate_image":
        return ""
    plan = action.get("execution_plan") if isinstance(action.get("execution_plan"), dict) else {}
    task = str(plan.get("task") or action.get("task") or "").strip().lower()
    if task == "image_outpaint":
        return "outpaint_instruction"
    preset = str(plan.get("preset") or action.get("preset") or "").strip()
    capability = _preset_capability_map(preset_capabilities).get(preset.lower()) or {}
    descriptor = " ".join(
        str(value or "").strip().lower()
        for value in (
            preset,
            capability.get("backend_engine"),
            capability.get("task_method"),
            plan.get("task_method"),
            capability.get("purpose"),
        )
    )
    if re.search(r"(?:^|[^a-z0-9])krea2?(?:[^a-z0-9]|$)|krea2?[_-]", descriptor, re.I):
        return "krea2_multilingual"
    return "flux_t5_en" if re.search(r"(?:\bflux\b|flux\d|t5[-_ ]?xxl|\bt5\b)", descriptor, re.I) else ""


def _translate_creative_prompt_to_english(prompt):
    try:
        import enhanced.all_parameters as ads
        import enhanced.translator as translator

        method = ads.get_admin_default("translation_methods")
        return str(translator.convert(prompt, method, "en") or "").strip()
    except Exception:
        return str(prompt or "").strip()


def _translate_creative_prompt_to_chinese(prompt):
    try:
        from enhanced.vlm import vlm

        return str(vlm.translate_cn(prompt, method=None) or "").strip()
    except Exception:
        return str(prompt or "").strip()


def normalize_creative_action_prompt_languages(
    actions,
    preset_capabilities=None,
    translate_to_english=None,
    translate_to_chinese=None,
    request_prompt_language="",
):
    translate_en = translate_to_english or _translate_creative_prompt_to_english
    translate_cn = translate_to_chinese or _translate_creative_prompt_to_chinese
    requested_language = str(request_prompt_language or "").strip().lower()
    normalized = []
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict):
            normalized.append(action)
            continue
        item = dict(action)
        target = _creative_action_prompt_target(item, preset_capabilities)
        prompt = str(item.get("prompt") or "").strip()
        if target in {"outpaint_instruction", "flux_t5_en"} and re.search(r"[\u3400-\u9fff]", prompt):
            translated = str(translate_en(prompt) or "").strip()
            if translated and not re.search(r"[\u3400-\u9fff]", translated):
                item["prompt"] = translated
        elif target == "krea2_multilingual":
            translated = ""
            if requested_language == "cn" and prompt and not re.search(r"[\u3400-\u9fff]", prompt):
                translated = str(translate_cn(prompt) or "").strip()
                if translated and not re.search(r"[\u3400-\u9fff]", translated):
                    translated = ""
            elif requested_language == "en" and re.search(r"[\u3400-\u9fff]", prompt):
                translated = str(translate_en(prompt) or "").strip()
                if translated and re.search(r"[\u3400-\u9fff]", translated):
                    translated = ""
            if translated:
                item["prompt"] = translated
                if isinstance(item.get("task_request"), dict):
                    item["task_request"] = dict(item["task_request"])
                    item["task_request"]["instruction"] = translated
        normalized.append(item)
    return normalized


def normalize_limited_actions(
    actions,
    allow_generation=False,
    default_generation_preset="Z-imageT",
    available_media_refs=None,
    preset_capabilities=None,
    preferred_generation_preset="",
    user_message="",
    parameter_profiles=None,
    preferred_parameter_profile="",
):
    normalized = []
    for item in actions if isinstance(actions, list) else []:
        if not isinstance(item, dict):
            continue
        action_type = str(item.get("type") or item.get("action") or "").strip().lower().replace("-", "_")
        if action_type == "set_creative_preference":
            if not allow_generation or str(item.get("scope") or "session").strip().lower() != "session":
                continue
            preset = _explicit_preset_hint(
                item.get("preset") or item.get("preset_name"),
                user_message,
                preset_capabilities,
            )
            profile, _, _ = _explicit_parameter_profile_hint(
                item.get("parameter_profile") or item.get("profile"),
                user_message,
                parameter_profiles,
                preset,
            )
            if profile:
                preset = str(profile.get("preset") or preset).strip()
            style = _explicit_creative_style(item.get("style"), user_message, bool(preset or profile))
            if not style and not preset and not profile:
                continue
            preference_action = {
                "type": "set_creative_preference",
                "style": style or "custom",
                "preset": preset,
                "scope": "session",
            }
            if profile:
                preference_action["parameter_profile"] = str(profile.get("name") or "")
            normalized.append(preference_action)
            continue
        if action_type in GENERATION_ACTION_ALIASES:
            action_type = "generate_image" if allow_generation else "set_prompt"
        elif action_type in {
            "replace_prompt",
            "fill_prompt",
            "send_prompt",
            "write_prompt",
        }:
            action_type = "set_prompt"
        if action_type not in ALLOWED_PROMPT_ACTIONS and action_type != "generate_image":
            continue
        prompt_text = str(
            item.get("instruction")
            or item.get("prompt")
            or item.get("text")
            or item.get("value")
            or item.get("positive_prompt")
            or ""
        ).strip()
        if not prompt_text:
            continue
        prompt_text = sanitize_danbooru_character_outfit_tags(prompt_text)
        prompt_text = canvas_danbooru_service._canvas_prompt_safe_danbooru_text(prompt_text)
        if action_type == "generate_image":
            request = normalize_creative_task_request(
                {**item, "instruction": prompt_text},
                available_media_refs,
                user_message,
            )
            plan = compile_creative_execution_plan(
                request,
                preset_capabilities,
                available_media_refs,
                preferred_generation_preset,
                user_message,
                parameter_profiles,
                preferred_parameter_profile,
            )
            preset = plan.get("preset")
            if not preset and not preset_capabilities:
                preset = _compatible_generation_preset(
                    default_generation_preset,
                    request["task"],
                    len(request["media_refs"]),
                    preset_capabilities,
                )
            normalized.append(
                {
                    "type": "generate_image",
                    "target": "canvas_run",
                    "task": request["task"],
                    "media_refs": request["media_refs"],
                    "task_request": request,
                    "execution_plan": plan,
                    "prompt": prompt_text,
                    "preset": preset if preset_capabilities else (preset or default_generation_preset or "Z-imageT"),
                    "aspect_ratio": request["aspect_ratio"],
                    "image_number": request["image_number"],
                    "label": str(item.get("label") or "").strip()[:120],
                }
            )
            continue
        if action_type in {"refine_prompt", "describe_image_to_prompt", "text_to_prompt"}:
            action_type = "set_prompt"
        normalized.append(
            {
                "type": action_type,
                "target": "main_prompt",
                "prompt": prompt_text,
                "label": str(item.get("label") or "").strip(),
            }
        )
    return normalized[:3]


def parse_limited_response(
    text,
    lang="cn",
    allow_actions=True,
    allow_generation=False,
    default_generation_preset="Z-imageT",
    available_media_refs=None,
    preset_capabilities=None,
    preferred_generation_preset="",
    user_message="",
    parameter_profiles=None,
    preferred_parameter_profile="",
):
    if not allow_actions:
        return {"reply": str(text or "").strip(), "actions": [], "raw_json": None}
    data = _extract_json_object(text)
    if not isinstance(data, dict):
        return {"reply": str(text or "").strip(), "actions": [], "raw_json": None}
    actions = normalize_limited_actions(
        data.get("actions"),
        allow_generation=allow_generation,
        default_generation_preset=default_generation_preset,
        available_media_refs=available_media_refs,
        preset_capabilities=preset_capabilities,
        preferred_generation_preset=preferred_generation_preset,
        user_message=user_message,
        parameter_profiles=parameter_profiles,
        preferred_parameter_profile=preferred_parameter_profile,
    )
    if not actions and data.get("prompt"):
        action_type = str(data.get("action") or data.get("type") or "set_prompt").strip()
        actions = normalize_limited_actions(
            [{**data, "type": action_type, "prompt": data.get("prompt")}],
            allow_generation=allow_generation,
            default_generation_preset=default_generation_preset,
            available_media_refs=available_media_refs,
            preset_capabilities=preset_capabilities,
            preferred_generation_preset=preferred_generation_preset,
            user_message=user_message,
            parameter_profiles=parameter_profiles,
            preferred_parameter_profile=preferred_parameter_profile,
        )
    reply = str(data.get("reply") or data.get("message") or data.get("text") or "").strip()
    if not reply and actions:
        reply = _localized_default_reply(actions[0].get("type"), lang)
    return {"reply": reply or str(text or "").strip(), "actions": actions, "raw_json": data}


def _creative_prompt_sections(text):
    source = _clean_multiline_text(text, limit=12000)
    headings = list(CREATIVE_PROMPT_SECTION_HEADING_RE.finditer(source))
    sections = []
    for index, heading in enumerate(headings):
        end = headings[index + 1].start() if index + 1 < len(headings) else len(source)
        prompt = source[heading.end():end].strip()
        prompt = re.split(
            r"\n\s*(?:Preset|预设|比例|Aspect|数量|Images|请在.{0,16}(?:卡片|按钮)|请点击)\s*[:：]?",
            prompt,
            maxsplit=1,
            flags=re.I,
        )[0].strip()
        if prompt:
            sections.append(prompt)
    return sections


def _creative_prompt_information_size(text):
    return len(re.sub(r"[\s\W_]+", "", str(text or ""), flags=re.UNICODE))


def _best_creative_prompt_candidate(candidates):
    cleaned = []
    for candidate in candidates:
        prompt = _clean_multiline_text(candidate, limit=8000)
        if prompt and prompt not in cleaned:
            cleaned.append(prompt)
    return max(cleaned, key=_creative_prompt_information_size, default="")


def _extract_recoverable_creative_prompt(response_text, raw_json=None):
    data = raw_json if isinstance(raw_json, dict) else _extract_json_object(response_text)
    candidates = []
    if isinstance(data, dict):
        candidates.extend((data.get("prompt"), data.get("positive_prompt")))
        raw_actions = data.get("actions") if isinstance(data.get("actions"), list) else []
        candidates.extend(
            item.get("prompt") or item.get("instruction") or item.get("positive_prompt")
            for item in raw_actions if isinstance(item, dict)
        )
        candidates.extend(
            section
            for key in ("reply", "message", "text")
            for section in _creative_prompt_sections(data.get(key))
        )

    source = _clean_multiline_text(response_text, limit=12000)
    if not isinstance(data, dict):
        candidates.extend(_creative_prompt_sections(source))
    fenced = re.search(r"```(?!json\b)[^\n]*\n([\s\S]*?)```", source, re.I)
    if fenced:
        candidates.append(fenced.group(1))
    return _best_creative_prompt_candidate(candidates)


def _creative_prompt_references_prior_scene(prompt):
    return bool(re.search(
        r"\b(?:previous|prior|same|above)\b|上一(?:张|幅|个)?|刚才|之前|同样|延续|保持.{0,10}(?:风格|氛围|设定)",
        str(prompt or ""),
        re.I,
    ))


def _creative_prompt_is_substantially_richer(candidate, current):
    candidate_size = _creative_prompt_information_size(candidate)
    current_size = _creative_prompt_information_size(current)
    return candidate_size >= max(80, current_size + 48, int(current_size * 1.35))


def _upgrade_creative_action_prompts(actions, response_text, raw_json=None, user_message="", previous_prompt=""):
    response_candidate = _extract_recoverable_creative_prompt(response_text, raw_json)
    continuation = bool(CREATIVE_CONTINUATION_INTENT_RE.search(str(user_message or "")))
    upgraded = []
    for action in actions if isinstance(actions, list) else []:
        if not isinstance(action, dict) or action.get("type") != "generate_image":
            upgraded.append(action)
            continue
        item = dict(action)
        current = str(item.get("prompt") or "").strip()
        candidate = response_candidate
        use_previous_prompt = False
        if (
            continuation
            and previous_prompt
            and _creative_prompt_references_prior_scene(current)
            and _creative_prompt_information_size(previous_prompt) >= 60
            and _creative_prompt_information_size(previous_prompt) > _creative_prompt_information_size(current)
        ):
            candidate = previous_prompt
            use_previous_prompt = True
        if candidate and (use_previous_prompt or _creative_prompt_is_substantially_richer(candidate, current)):
            candidate = canvas_danbooru_service._canvas_prompt_safe_danbooru_text(
                sanitize_danbooru_character_outfit_tags(candidate)
            )
            item["prompt"] = candidate
            request = dict(item.get("task_request") or {})
            request["instruction"] = candidate
            item["task_request"] = request
        upgraded.append(item)
    return upgraded


def _latest_history_creative_prompt(messages):
    for item in reversed(messages if isinstance(messages, list) else []):
        if not isinstance(item, dict) or str(item.get("role") or "").lower() != "assistant":
            continue
        candidate = _best_creative_prompt_candidate(_creative_prompt_sections(item.get("content")))
        if candidate:
            return candidate
    return ""


def _creative_director_should_be_suppressed(message):
    text = str(message or "")
    return bool(
        CREATIVE_GENERATION_INTENT_RE.search(text)
        or CREATIVE_EDIT_INTENT_RE.search(text)
        or PROMPT_INTENT_RE.search(text)
    )


def recover_creative_generation_action(
    user_message,
    response_text,
    raw_json=None,
    available_media_refs=None,
    preset_capabilities=None,
    default_generation_preset="Z-imageT",
    parameter_profiles=None,
    preferred_parameter_profile="",
    previous_prompt="",
):
    message = _clean_multiline_text(user_message, limit=8000)
    response = _clean_multiline_text(response_text, limit=12000)
    if CREATIVE_RESPONSE_REFUSAL_RE.search(response):
        return None
    _, available_refs = _normalize_generation_media_refs([], available_media_refs)
    has_images = bool(available_refs)
    requested = bool(CREATIVE_GENERATION_INTENT_RE.search(message))
    requested = requested or bool(CREATIVE_EDIT_INTENT_RE.search(message))
    requested = requested or bool(CREATIVE_RESPONSE_EXECUTION_RE.search(response))
    if not requested:
        return None

    prompt = _extract_recoverable_creative_prompt(response, raw_json)
    if not prompt and previous_prompt and CREATIVE_CONTINUATION_INTENT_RE.search(message):
        prompt = previous_prompt
    prompt = prompt or message
    prompt = canvas_danbooru_service._canvas_prompt_safe_danbooru_text(
        sanitize_danbooru_character_outfit_tags(prompt)
    )
    if not prompt:
        return None
    refs = available_refs[:5]
    task = _normalize_generation_task(None, refs, message)
    preset = _compatible_generation_preset(
        default_generation_preset,
        task,
        len(refs),
        preset_capabilities,
    )
    actions = normalize_limited_actions(
        [
            {
                "type": "generate_image",
                "task": task,
                "media_refs": refs,
                "prompt": prompt,
                "preset": preset,
                "aspect_ratio": "auto",
                "image_number": 1,
            }
        ],
        allow_generation=True,
        default_generation_preset=default_generation_preset,
        available_media_refs=available_media_refs,
        preset_capabilities=preset_capabilities,
        user_message=message,
        parameter_profiles=parameter_profiles,
        preferred_parameter_profile=preferred_parameter_profile,
    )
    return next((action for action in actions if action.get("type") == "generate_image"), None)


_ANIMA_PROMPT_CJK_RE = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")
_ANIMA_QUALITY_RE = re.compile(r"(?:^|,\s*)(?:masterpiece|best quality|very[_ ]aesthetic|high quality)(?:\s*,|$)", re.I)
_ANIMA_PERIOD_RE = re.compile(r"(?:^|,\s*)(?:newest|recent|mid|early|old|year\s+\d{4})(?:\s*,|$)", re.I)
_ANIMA_RATING_RE = re.compile(r"(?:^|,\s*)(?:safe|sensitive|nsfw|explicit)(?:\s*,|$)", re.I)


def _is_anima_positive_prompt(prompt):
    source = str(prompt or "").strip()
    if not source or _ANIMA_PROMPT_CJK_RE.search(source) or source.count(",") < 4:
        return False
    return bool(
        _ANIMA_QUALITY_RE.search(source)
        and _ANIMA_PERIOD_RE.search(source)
        and _ANIMA_RATING_RE.search(source)
    )


def _repair_creative_anima_prompt(item, source_prompt=""):
    action = dict(item) if isinstance(item, dict) else {}
    prompt = str(action.get("prompt") or "").strip()
    if not prompt or not _is_anima_prompt_target({"preset": action.get("preset")}) or _is_anima_positive_prompt(prompt):
        return action

    from modules import canvas_vlm_agent

    effective_prompt = "\n".join(part for part in (str(source_prompt or "").strip(), prompt) if part)
    composed = canvas_vlm_agent._canvas_compose_anima_prompt(
        effective_prompt,
        {"type": "generate_image", "prompt": prompt},
    )
    repaired_prompt = str(composed.get("prompt") or "").strip()
    if repaired_prompt and not _ANIMA_PROMPT_CJK_RE.search(repaired_prompt):
        action["prompt"] = repaired_prompt
    return action


def _repair_creative_anima_actions(actions, source_prompt=""):
    return [
        _repair_creative_anima_prompt(action, source_prompt)
        if isinstance(action, dict) and action.get("type") == "generate_image"
        else action
        for action in (actions or [])
    ]


def _apply_creative_preference_preset(actions, active_preset="", preset_capabilities=None):
    preferred_preset = re.sub(r"[\x00-\x1f\x7f]+", "", str(active_preset or "")).strip()[:120]
    normalized = []
    for action in actions or []:
        if not isinstance(action, dict):
            normalized.append(action)
            continue
        item = dict(action)
        if item.get("type") == "set_creative_preference" and item.get("preset"):
            preferred_preset = str(item.get("preset") or "").strip()[:120]
        elif item.get("type") == "generate_image" and preferred_preset:
            refs = item.get("media_refs") if isinstance(item.get("media_refs"), list) else []
            task = _normalize_generation_task(item.get("task"), refs, item.get("prompt"))
            if _preset_supports_generation_task(preferred_preset, task, len(refs), preset_capabilities):
                item["preset"] = preferred_preset
        normalized.append(item)
    return normalized


def apply_prompt_action_payload(payload_text, current_prompt=""):
    try:
        data = json.loads(str(payload_text or "{}"))
    except Exception:
        return current_prompt
    actions = normalize_limited_actions([data])
    if not actions:
        actions = normalize_limited_actions(data.get("actions") if isinstance(data, dict) else [])
    if not actions:
        return current_prompt
    action = actions[0]
    prompt_text = str(action.get("prompt") or "").strip()
    if not prompt_text:
        return current_prompt
    if action.get("type") == "append_prompt":
        existing = str(current_prompt or "").strip()
        if not existing:
            return prompt_text
        separator = "\n" if "\n" in existing or "\n" in prompt_text else ", "
        return f"{existing.rstrip()}{separator}{prompt_text.lstrip()}"
    return prompt_text


def _describe_input_media_assets(payload, asset_refs):
    manifest = _media_manifest_from_payload(payload)
    refs = asset_refs if isinstance(asset_refs, list) else []
    allowed_asset_keys = (
        "kind",
        "asset_id",
        "mime",
        "size",
        "width",
        "height",
        "path",
        "output_path",
        "asset_relative_path",
        "relative_path",
        "preview_url",
    )
    refs_by_source_index = {}
    for position, asset_ref in enumerate(refs):
        if not isinstance(asset_ref, dict):
            continue
        match = re.search(r":(?:image|video):(\d+)$", str(asset_ref.get("node_id") or ""))
        source_index = int(match.group(1)) if match else position
        refs_by_source_index.setdefault(source_index, asset_ref)
    assets = []
    for index, item in enumerate(manifest):
        asset_ref = refs_by_source_index.get(index) or {}
        if not asset_ref:
            continue
        clean_asset = {
            key: asset_ref.get(key)
            for key in allowed_asset_keys
            if asset_ref.get(key) not in (None, "")
        }
        assets.append(
            {
                "ref": item.get("ref"),
                "index": item.get("index"),
                "type": item.get("type"),
                "name": item.get("name"),
                "asset": clean_asset,
            }
        )
    return assets


def run_describe_vlm_chat(payload):
    payload = payload if isinstance(payload, dict) else {}
    conversation_id = str(payload.get("conversation_id") or "").strip()
    request_id = str(payload.get("request_id") or "").strip()
    request_kind = str(payload.get("request_kind") or "").strip().lower()
    built = build_creative_offer_runtime_payload(payload) if request_kind == "creative_offer" else build_runtime_payload(payload)
    if not built.get("ok"):
        return built

    from modules import canvas_vlm_runtime

    runtime_payload = built["runtime_payload"]
    if is_describe_vlm_chat_cancelled(conversation_id, request_id):
        clear_describe_vlm_chat_cancel(conversation_id, request_id)
        return {
            "ok": False,
            "cancelled": True,
            "conversation_id": conversation_id,
            "request_id": request_id,
            "error": "Stopped.",
            "details": "Stopped by user.",
        }
    result = canvas_vlm_runtime.canvas_vlm_run(runtime_payload)
    if is_describe_vlm_chat_cancelled(conversation_id, request_id):
        clear_describe_vlm_chat_cancel(conversation_id, request_id)
        return {
            "ok": False,
            "cancelled": True,
            "conversation_id": conversation_id,
            "request_id": request_id,
            "error": "Stopped.",
            "details": "Stopped by user.",
        }
    if not isinstance(result, dict) or not result.get("ok"):
        return result if isinstance(result, dict) else {"ok": False, "error": "Invalid VLM response."}

    if request_kind == "creative_offer":
        preference = _normalize_creative_preferences(payload.get("creative_preferences"))
        offer = parse_creative_offer_response(
            result.get("text") or result.get("raw_text") or "",
            payload.get("lang"),
            default_generation_preset=preference.get("preset") or "Z-imageT",
        )
        if offer.get("offer"):
            if preference.get("preset"):
                offer["preset"] = preference["preset"]
            offer = _repair_creative_anima_prompt(offer, payload.get("message"))
        return {
            "ok": True,
            "conversation_id": conversation_id,
            "request_id": request_id,
            "creative_offer": offer,
        }

    params = runtime_payload.get("params") if isinstance(runtime_payload.get("params"), dict) else {}
    parsed = parse_limited_response(
        result.get("text") or result.get("raw_text") or "",
        (payload or {}).get("lang"),
        allow_actions=bool(params.get("describe_actions_enabled")),
        allow_generation=bool(params.get("describe_generation_actions_enabled")),
        default_generation_preset=params.get("describe_creative_preference_preset") or "Z-imageT",
        available_media_refs=runtime_payload.get("params", {}).get("describe_media_manifest"),
        preset_capabilities=runtime_payload.get("params", {}).get("describe_preset_capabilities"),
        preferred_generation_preset=params.get("describe_creative_preference_preset") or "",
        user_message=payload.get("message") or "",
        parameter_profiles=params.get("describe_parameter_profiles"),
        preferred_parameter_profile=params.get("describe_creative_preference_parameter_profile") or "",
    )
    if params.get("describe_generation_actions_enabled"):
        previous_prompt = _latest_history_creative_prompt(
            payload.get("history_full") or payload.get("history")
        )
        parsed_actions = parsed.get("actions") if isinstance(parsed.get("actions"), list) else []
        if not any(action.get("type") == "generate_image" for action in parsed_actions if isinstance(action, dict)):
            recovered_action = recover_creative_generation_action(
                payload.get("message"),
                result.get("text") or result.get("raw_text") or "",
                parsed.get("raw_json"),
                runtime_payload.get("params", {}).get("describe_media_manifest"),
                runtime_payload.get("params", {}).get("describe_preset_capabilities"),
                params.get("describe_creative_preference_preset") or "Z-imageT",
                params.get("describe_parameter_profiles"),
                params.get("describe_creative_preference_parameter_profile") or "",
                previous_prompt,
            )
            if recovered_action:
                parsed_actions = [
                    action for action in parsed_actions
                    if isinstance(action, dict) and action.get("type") == "set_creative_preference"
                ]
                parsed_actions.append(recovered_action)
                parsed["actions"] = parsed_actions
        parsed["actions"] = _upgrade_creative_action_prompts(
            parsed.get("actions"),
            result.get("text") or result.get("raw_text") or "",
            parsed.get("raw_json"),
            payload.get("message") or "",
            previous_prompt,
        )
        parsed["actions"] = compile_creative_action_plans(
            parsed.get("actions"),
            runtime_payload.get("params", {}).get("describe_media_manifest"),
            runtime_payload.get("params", {}).get("describe_preset_capabilities"),
            params.get("describe_creative_preference_preset") or "",
            payload.get("message") or "",
            params.get("describe_parameter_profiles"),
            params.get("describe_creative_preference_parameter_profile") or "",
        )
        parsed["actions"] = _repair_creative_anima_actions(parsed.get("actions"), payload.get("message"))
        parsed["actions"] = normalize_creative_action_prompt_languages(
            parsed.get("actions"),
            runtime_payload.get("params", {}).get("describe_preset_capabilities"),
            request_prompt_language=_requested_prompt_language(
                payload.get("message"),
                payload.get("lang") or payload.get("__lang"),
            ),
        )
    result = dict(result)
    original_text = str(result.get("text") or "")
    result["text"] = parsed.get("reply") or original_text
    if result["text"] != original_text and not result.get("raw_text"):
        result["raw_text"] = original_text
    result["limited_actions"] = parsed.get("actions") or []
    result["input_media_assets"] = _describe_input_media_assets(payload, result.get("asset_refs"))
    result["creative_director_suppressed"] = bool(
        params.get("describe_generation_actions_enabled")
        and _creative_director_should_be_suppressed(payload.get("message"))
    )
    result["agent_actions"] = []
    return result
