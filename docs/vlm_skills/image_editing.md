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

## H3 Pose Source Retention / H3 姿势源图保留

- `MiniMax-H3(Pose)` uses exactly two pictures through the H3 R2I still-image
  route. `<Picture 1>` is the source image to edit, including its character
  and original scene. `<Picture 2>` is the Pose Editor output and supplies
  only the target body pose, orientation, and visible gestures.
  图 1 同时提供角色和原场景；图 2 只提供姿势，不能沿用人偶外观或纯色背景。
- Explicitly preserve the original background, surrounding people and objects,
  camera view, perspective, lighting, and visual style unless the user asks to
  change them. Reconstruct the original background where the moved body reveals
  it. Do not remove the environment-preservation instruction during rewriting.
  修改姿势时仍须保留图 1 的背景、人群、物体、视角和光照，并延续动作后露出的
  背景。不能因为要求改变姿势，就省略背景保留要求。
- Preserve the character identity, visible appearance, body proportions, clothing,
  and worn accessories from `<Picture 1>`. When writing an image-grounded prompt,
  describe only visible attributes needed for the requested edit; do not invent,
  enumerate, or name absent items.
  保留 `<Picture 1>` 中角色的身份、可见外观、身体比例、服装和穿戴配饰；只描述本次编辑需要的可见属性，不要臆造、罗列或命名源图中没有的物品。
- Apply the H3 skill's source-grounding and reference-retention principles.
  This preset still uses one self-contained R2I image-editing instruction, not
  the Ref2VA video timeline. Its two image labels remain unchanged, and it does
  not require a mask, video, audio, or an additional pose-specific LoRA.
  保留 10 步、权重 1.0 的 H3 Turbo 蒸馏设置；界面语言读取 `state.__lang`。
- Validation on 2026-09-13 used one actual source/pose pair, four candidate
  prompts, and two seeds per candidate. Explicit scene and worn-item retention
  kept the hall background and hat in both tested outputs. This is not a
  guarantee of pixel-identical backgrounds, exact anatomy, or success on other
  images. The fixed six-section Ref2VA format was also tested directly against
  the backend; that experiment does not change the Studio R2I format contract.
