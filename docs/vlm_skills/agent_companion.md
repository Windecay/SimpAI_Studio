# Canvas Agent Companion

The canvas Agent companion is a compact panel that follows the user's current
work target.

## Placement

- If one node is selected, the panel attaches near that node.
- If no node is selected, the panel appears as a small default window in the
  canvas viewport.
- The companion is not a replacement for the VLM Chat node. It is a quick action
  surface for the current target.
- The user can pause attachment from the panel header. While attachment is
  paused, the panel stays in its floating position but still uses the current
  selection as the action target.

## Confirmed Text-To-Image

When no node is selected, the companion chooses from the text-to-image preset
queue and runs the first available preset after user confirmation. The default
queue starts with `Z-imageT`.

When a `preset` or `classic` node is selected, the companion may write the
prompt into that generator and run it after confirmation.

The companion must not start generation without explicit user confirmation.

Before submitting, the companion asks whether the user wants LLM/VLM prompt
understanding and refinement. If the refinement fails, the user may fall back to the
original text.

## In-Panel Confirmation

The companion should ask for confirmation in its own canvas-styled decision card
near the current Agent panel instead of using browser-native `confirm()` dialogs.
This keeps the user's attention on the selected node or default Agent window.

The confirmation card currently covers:

- Whether to use LLM/VLM prompt refinement, use the original request, or cancel.
- Whether to accept the refined prompt, switch back to the original prompt, or
  cancel.
- Whether to start text-to-image with the selected preset and final prompt.
- Whether to start image editing with the selected edit preset, selected source
  image, and final prompt.

The start confirmation should include a compact payload preview. Text-to-image
shows the action, target preset or generator node, prompt source, and model gate
state. Image edit also shows the selected source image node and the predicted
image input slot.

## Confirmed Image Edit

When an `image` node or image `result` node is selected, the companion chooses
from the image-edit preset queue, connects the selected image to the first
compatible image input, writes the prompt, and runs generation after user
confirmation. The default queue starts with `Flux2-KleinEdit`.

The companion composer may also hold explicit references for the current task.
Image editing is intentionally capped at three image inputs:

- One `primary` image. This is the source image that the edit is grounded in.
- Up to two extra image references. These may be used for style, identity,
  background, object, or composition reference when the selected edit preset has
  compatible input slots.

If a primary image reference is present, it takes precedence over the currently
selected canvas node. Extra image references are connected only to remaining
compatible upload slots.

This is the first controlled image-edit path. More destructive editing modes,
such as inpaint with mask editing or prompt overwrite of an existing generator,
need a stronger payload preview before execution.

## Multimedia References

The composer uses a unified reference layer for image, video, audio, and Text
nodes. Current limits are:

- Images: one primary image plus two extra image references.
- Video: one video reference.
- Audio: one audio reference.
- Text: up to four prompt text references.

Video and audio references are context in the current Agent companion pass. A
video may be used for explanation through the VLM pipeline when frames are
sampled, or later as a primary source for video post-processing presets. Audio
may later be used for transcription, rhythm analysis, voice, lip-sync, or
audio-driven video presets. Any generation, post-processing, credit-spending, or
destructive media operation still requires a dedicated confirmation card.

## Quick Tool Shelf

The expanded composer reserves a compact quick tool shelf for future preset
shortcuts such as:

- `Outpaint`
- `Erase`
- `Replace`
- `Background`
- `Style`

These shortcuts are UI entry points only until a safe preset/action payload is
implemented. They must not bypass the normal confirmation flow.

## Per-Task Resolution

The companion composer exposes per-task resolution controls in both compact and
expanded modes.

- `Auto` keeps the selected preset's default aspect ratio.
- Explicit aspect choices such as `1:1`, `16:9`, `9:16`, `4:3`, and `3:4`
  write concrete Resolution Config dimensions before execution.
- Resolution scale defaults to `1.0x` and is capped at `2.0x`.

These values are temporary task overrides. They are written to the target
generator's `resolution_config.overrides` when the user confirms execution, and
they should appear in the confirmation payload.

## Preset Queues

The default queues are currently defined in code:

- Text-to-image: `CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE`
- Image edit: `CANVAS_AGENT_DEFAULT_EDIT_PRESET_QUEUE`

The companion also reads local browser overrides from
`simpai.canvas.agentPresetQueues.v1` with this shape:

```json
{
  "t2i": ["Z-imageT"],
  "edit": ["Flux2-KleinEdit"]
}
```

The Agent should treat these queues as user-maintained preference lists. It may
suggest a preset, but should ask for confirmation before using it.

Preset aliases and user wording are described in `preset_tool_calling.md`.
For example, `Zimage` should resolve to `Z-imageT` when that preset exists.

## Agent Settings

Canvas Settings now includes an Agent page. The user can:

- Show or hide the companion mini window.
- Choose the execution route:
  - `programmatic`: the companion uses local deterministic code to choose the
    action, preset, prompt handling, node creation, and run submission.
  - `vlm_plan` (`Thinking mode` / `Thinking 思考模式` in the UI): the companion
    first asks the VLM/LLM to understand the natural language instruction as a
    JSON execution plan, then validates that plan and runs the same confirmed
    execution path.
- Choose whether prompt handling always asks, always refines with LLM/VLM, or
  uses the original request directly.
- Pick the VLM/LLM version used for prompt refinement.
- Refresh the ready-preset list. The preset dropdowns only show presets whose
  model files pass the preset model status check.
- Set text-to-image and image-edit preset behavior to `auto` or `preferred`.
  When a ready preset is selected in the dropdown, the companion tries it before
  falling back to the normal queue.
- Allow a user instruction that names a preset to temporarily override the
  configured preference.

The companion panel should show the current Agent run stage, selected preset,
and LLM/VLM refine model when it is refining or submitting a task.

## Manual Review Required

The project owner should review:

- Button labels and Chinese wording.
- The text-to-image queue order.
- The image-edit queue order.
- Whether LLM refine should default to yes, no, or always ask in the Agent
  settings page.
- Whether the in-panel confirmation card should later show a richer payload
  preview, such as model status, target slot, seed, size, and cost.

## Hard Limits

The companion must not automatically delete nodes, delete edges, change API keys,
change model paths, upload files, or spend online API credits without a dedicated
confirmation flow.

## MiniMax H3 图编 / Image Editing

- `MiniMax-H3(R2I)` is a still-image edit fallback after the normal
  `Flux2-KleinEdit` queue candidate. It accepts one to nine ordered image
  references and does not accept video or audio references.
- The confirmation card should identify the source image, any additional
  picture references, the requested edit, and the selected input slot before
  submission.
- `state.__lang` selects visible labels: `Image editing` / `图像编辑` and
  `MiniMax-H3(R2I)` / `MiniMax-H3图编`.
