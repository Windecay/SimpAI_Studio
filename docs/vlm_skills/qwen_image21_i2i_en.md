# Qwen Image 2.1 PE Image-Editing Prompt Skill

Use this skill for `Qwen2.1-Edit` when one or more input images are present.
It adapts the shared `image-prompt-i2i` skill to the SimpAI prompt-action
contract.

## Source and reference roles

- Inspect the supplied images before writing image-grounded facts. Do not
  infer visible details from filenames or from an unexamined reference.
- With one image, refer to it naturally in the prompt. Do not add an image
  label for a single-image edit.
- With multiple images, use `<image1>`, `<image2>`, and so on in upload order.
  State the role of every image: canvas, identity, clothing, object, material,
  style, or other user-requested source.
- The canvas image supplies the composition unless the request explicitly
  creates a new scene from reference subjects. Do not assume the first image
  is the canvas without reading the request.
- Never invent a missing image, mask, video, audio source, or reference role.

## Edit exactly what was requested

- Lead with the requested operation and make the changed attribute visible.
- Preserve every unrequested invariant: identity, subject count, pose, object
  design, accessories, composition, perspective, lighting, color relationships,
  medium, background, and readable text.
- Use one clear preservation clause instead of repainting the entire source
  image in prose. Describing preserved appearance too specifically can cause
  it to drift.
- Distinguish editing the existing picture from placing a referenced subject
  into a new scene. The latter may redesign the scene while retaining the
  requested identity or object details.
- Do not add cleanup, beautification, style changes, cropping, padding,
  resizing, warping, or other operations that the user did not request.

## Language and visible text

- The descriptive prose follows the user's request language: Chinese request
  produces Chinese prose, English request produces English prose, and other
  languages default to English.
- Text rendered into the image follows this priority: exact user text or
  requested target language, then the dominant language already visible in the
  source image, then the request language.
- Keep rendered text monolingual unless the user explicitly asks for a
  bilingual result. Quote every exact string with straight double quotes.
- Do not translate a brand, name, or visible label unless the user asks for it.

## Ratio and output boundary

- Decide whether the output follows a canvas image or uses an explicit user
  ratio. Outpainting and newly composed scenes may need a new ratio.
- Do not write pixel dimensions, resolution labels, `wh_ratio`, or
  `ratio_follow` into the final prompt. SimpAI keeps those values in its
  structured controls.
- In Canvas Agent requests, place the finished instruction in the runtime
  action's `prompt` field. Do not emit the shared skill's three-field JSON
  object; the runtime action JSON has priority.
- Return one self-contained prompt with no explanation, Markdown fence, model
  parameters, or internal planning.

## Final check

Verify the operation, changed region, preserved content, image roles, quoted
text, and composition choice. Make sure nothing was invented and all input
images are referenced in the required order.
