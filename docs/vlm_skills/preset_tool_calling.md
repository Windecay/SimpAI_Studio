# Preset Tool Calling And Naming

This document teaches the VLM Agent how to interpret user requests that mention
SimpAI presets and when it may suggest or prepare generation.

## Current Execution Boundary

The compact Canvas Agent companion can programmatically create preset nodes,
fill prompts, connect image inputs, and submit runs after an in-panel user
confirmation.

The VLM Chat Agent action protocol may prepare generation and image-edit
actions when the user explicitly asks for them. It must put the final prompt in
the action JSON, and the frontend must show a payload confirmation card before
anything is created or run.

## Preset Name Matching

Preset names are user-facing and may be typed loosely. The Agent should treat
these forms as likely aliases when the preset catalog contains a matching name:

- Exact name: `Z-imageT`
- Compact spelling: `ZimageT`
- Short spelling: `Zimage`
- Case-insensitive spelling: `z-image`, `zimage`
- House aliases: `Z`, `Krea`, `Klein`, `Flux`, `Wan`, `Bernini`, `Anima`

For example, if the user says "使用Zimage生成一张美女图片", the intended preset is usually `Z-imageT` when that preset exists in the catalog or Agent queue.

When the user says "用/使用/采用/指定/选择" plus one of these aliases, treat it
as preset intent first. Resolve the catalog preset, remove the preset name from
the image prompt, and format the final prompt for that preset's target.

Do not invent a preset that is not in the catalog. If the requested preset cannot
be found, explain that the user should select or create the preset first.

## Prompt Format After Preset Selection

After resolving a preset, write the final prompt for that preset's actual text
encoder. See `image_prompting.md` for the full rules.

- `Z-imageT`, `Z-image`, `Krea2-Turbo`, `krea2`, and `qwen*` text encoders:
  natural language; Chinese is preferred for Chinese requests.
- `Wan`, `wan*_cn`, and `umt5-xxl`: natural language with motion and camera
  continuity for video tasks.
- `FLUX.1`, `flux_aio`, and `t5xxl`: English natural language only. Translate
  Chinese user intent into English in the final prompt.
- `SDXL`, `SD15`, `Illustrious`, `Noob`, and anime tag checkpoints:
  Danbooru-style English tags, comma separated.

The actual workflow/text encoder wins over the display name. For example, a
Flux-family edit preset that uses `qwen3_8b` should receive Qwen-style natural
language, not FLUX.1/t5xxl English-only prompting.

## Text-To-Image Requests

When the user asks for a new image and mentions a generation preset:

1. Resolve the preset name from the catalog or Agent preference queue.
2. Treat the rest of the user request as image intent.
3. Prepare one final prompt in the correct target format.
4. Ask whether to refine the prompt only when the Agent companion prompt
   strategy is configured to ask.
5. Before submitting, show a payload preview with preset, prompt source, model
   status, and final prompt.

Example request:

```text
使用Zimage生成一张美女图片
```

Likely interpretation:

- Action: text-to-image
- Preset: `Z-imageT`
- User image intent: `一张美女图片`
- Confirmation required before execution

## Image Edit Requests

When an image or image result is selected and the user asks to edit it, the
Agent should choose the image-edit queue or preferred edit preset. The default
first edit preset is `Flux2-KleinEdit`.

The Agent must connect the selected image to a compatible image input and show
the predicted input slot in the payload preview before running.

Image edit requests may include explicit composer references. Respect these
limits:

- Use at most one primary image.
- Use at most two additional image references.
- Do not silently add a fourth image. Ask the user to remove or replace a
  reference instead.

If the user provides video or audio references while asking for image editing,
treat them as advisory context unless the chosen preset explicitly supports
video or audio input slots and the frontend confirmation card shows that mapping.

## Resolution And Aspect

When the Agent companion includes a per-task aspect or resolution scale, treat it
as an execution parameter rather than prompt text.

- `Auto` means use the selected preset's default Resolution Config.
- Explicit aspect choices should be applied through Resolution Config overrides.
- Resolution scale defaults to `1.0x` and must not exceed `2.0x`.

The model may mention the chosen aspect in a recommended prompt only when it is
semantically useful, but the real source of truth is the structured execution
payload.

## Video And Audio References

Video references can support two future paths:

- VLM explanation: sample frames and describe or diagnose the video.
- Video post-processing: run a confirmed preset such as video repaint,
  restoration, outpaint, interpolation, background replacement, or stylization.

Audio references can support future transcription, rhythm analysis, voice,
lip-sync, or audio-driven video generation. Until a concrete preset/action is
whitelisted, the Agent should not claim that audio has been understood or used
for generation.

## Manual Review Required

Preset aliases and preferred presets depend on the project owner's naming
conventions. Keep this document updated when new house presets become the
default text-to-image or image-edit tools.

## 2026-08-08 MiniMax H3 图编 / R2I

- Treat `R2I`, `ref_to_image`, and `reference_to_image` as image-editing
  intent, not video generation intent.
- The exact preset is `MiniMax-H3(R2I)`, shown as `MiniMax-H3图编` in the
  Chinese preset store. Keep `MiniMax-H3(R2I)` as the English key.
- The route supports `image_edit`, `multi_image_edit`, and
  `image_object_transfer`, with one to nine ordered image references and no
  video or audio input.
- Follow `state.__lang` for all visible route and status labels.
