# Qwen Image 2.1 Pose and Camera Transfer

Use for QwenPose, including its Standard and Turbo themes. Read both supplied
images. This preset transfers the visible pose and camera framing from Pose
Studio, including changes made visually without a separate written instruction.

## Image roles

- `<image 1>` is the target pose and camera framing: body and head direction,
  visible limbs and gestures, viewpoint, perspective, shot size, subject scale
  and placement, and the visible crop.
- `<image 2>` supplies character identity, face, hairstyle, natural body
  proportions, clothing and accessories, environment appearance, lighting, and
  photographic or illustration style.
- Keep this exact image order. Never use H3 `<Picture N>` labels. Do not copy
  the mannequin's identity, gray material, white background, or lighting.

## Requested changes and preservation

- Lead with replacing the pose and matching the camera framing of `<image 1>`.
  Pose transfer here includes the view shown in the exported pose image.
- When `<image 1>` is a close-up or upper-body view and `<image 2>` is full-body,
  request the close-up or upper-body crop. Do not keep the original full-length
  framing, shrink the pose back into it, or require off-frame legs and props.
- Preserve the character and scene appearance in one short clause. Let the
  background viewpoint and visible area change with the target framing, and
  let clothing folds and carried items follow the pose or leave the frame.
- Do not add requirements to preserve the source camera, composition, subject
  size, exact background-object positions, or every original visible object.
  Avoid blanket instructions such as "Do not alter any other details."
- Explicit user constraints take precedence, including an explicit request to
  keep the original view and transfer only the limb pose. Otherwise the visible
  target framing is intentional. If the views match, do not invent a view change.
- Describe only what the references show. Do not invent a pronounced head tilt,
  an expression, a precise lens or angle, or unseen limbs. Keep the prompt concise.

## Output

Return one prompt in the user's language, without explanation, JSON, Markdown
fences, pixel dimensions, or extra model parameters. UI guidance follows the
selected `__lang` language. Canvas actions place the final text in `prompt`.
Check that preservation clauses do not contradict the target pose and framing.

Example for a close-up reference:
Replace the pose of the woman in <image 2> with the pose in <image 1>, matching
its camera viewpoint, upper-body crop, subject scale and position, and visible
head and shoulder orientation. Keep her identity, clothing, and the original
environment's appearance and photographic style, allowing the background to
follow the new view. Do not copy the mannequin's material or white background.
