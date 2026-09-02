# Image Editing Agent Skill / 图像编辑 Agent Skill（图编）

This skill applies when the user asks to edit, retouch, replace, erase, extend,
restyle, or otherwise transform an existing image. It is shared by Canvas
Agent and VLM Chat. Follow `stage.__lang` for visible labels and status text;
the editing rules below are bilingual so the model can keep the same contract
in English and Chinese stages.

## Source Grounding / 源图依据

- Treat the attached source image as the authority for visible facts. Preserve
  the source identity, subject count, composition, pose, camera angle, lighting,
  color relationships, and unchanged background content unless the user asks
  to change one of them.
- When no source image is attached, do not invent image-specific facts such as
  a person's face, clothing, exact background, or the current camera view.
  没有源图时，不要编造人物脸部、服装、背景或当前画面的具体事实。
- Keep the requested edit narrow and explicit. Do not add unrelated style,
  identity, subject, setting, camera, or lighting changes.

## Reference Labels / 参考图标签

- Refer to uploaded images only with labels that exist in the runtime inventory:
  `<Picture 1>`, `<Picture 2>`, and so on, in upload order.
- State what each reference contributes when more than one image is present,
  for example the target image, identity, clothing, object, material, or style.
  多图编辑时说明每张图提供的内容，例如目标图、身份、服装、物体、材质或风格。
- Never invent a missing picture label, reorder the user's references, or treat
  a video or audio reference as an image reference.

## Preserve And Change / 保留与修改

- First identify the source content that must remain unchanged. Then describe
  the requested change, its location, and the visible result.
- Use affirmative visual wording. Prefer “keep the original face and replace
  the jacket with ...” over a long list of generic negative prompts.
- Preserve identity and geometry during local edits: face, hands, body shape,
  pose, object boundaries, perspective, shadows, and contact with the scene.
- For outpaint, continue the existing composition, perspective, lighting,
  palette, texture, and depth across the new border.
- For object or clothing transfer, keep the target image as picture 1 and the
  source object or clothing as the next picture, unless the runtime inventory
  explicitly states another order or marks a masked canvas as an unnumbered
  source image.

## Prompt Output / 提示词输出

- Write one self-contained, generator-ready editing instruction. Include the
  source, requested operation, affected area or object, unchanged content, and
  the intended visible result.
- Do not return explanations, JSON, markdown, model names, API routes, or a
  completion claim when a prompt-only rewrite is requested.
- Do not put width, height, seed, steps, CFG, or preset defaults into the
  positive edit prompt unless the caller explicitly asks for them.
- Keep the user's language for multilingual natural-language image editors.
  For English-only targets, translate the requested intent into clear English.

## R2I / 图编路线

- Contract reviewed: 2026-09-01.
- `MiniMax-H3(R2I)` is a still-image generation and editing route. With no
  painted mask, the canvas and additional images are numbered `<Picture N>` in
  upload order. With a non-empty painted mask, the canvas becomes the
  unnumbered source image and additional references begin at `<Picture 1>`.
- The painted mask selects the edit branch automatically. Do not add a separate
  mask-mode option, and never describe the mask itself as a picture reference.
- In masked editing, describe only the requested change inside the mask and
  preserve all source content outside it. The workflow applies the mask to the
  initial H3 latent rather than compositing decoded output pixels.
- This route does not use video or audio references.
- Use the H3 R2I still-image compiler with `<Picture N>` labels, but do not
  create H3 storyboard sections, video shots, dialogue, synchronized sound,
  audio references, or video references for this route.
- `MiniMax-H3(R2I)` may be selected for `image_edit`, `multi_image_edit`, or
  `image_object_transfer` after the normal edit queue candidates. The result
  still needs the normal confirmation and model-readiness checks.

## Agent Boundary / Agent 边界

- Prepare the edit prompt and route suggestion only. Do not claim that a node
  was created or a generation started before the UI confirms it.
- Keep the source image and requested edit visible in the confirmation card.
  Ask for missing source media instead of guessing it.
