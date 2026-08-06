# Canvas Workbench Template Library

Edit `template-library.json` to add workbench templates.

## Manifest Fields

- `id`: stable template id, using lowercase words joined with `_`.
- `title`: localized object such as `{ "en": "...", "zh": "..." }`, or a plain string.
- `description`: localized object or plain string shown on the template card.
- `category`: one of `starter`, `image`, `video`, or `audio`. `starter` is for model-free or teaching-only onboarding templates; runnable generation templates belong in the media category they produce.
- `tags`: short searchable keywords.
- `type_label`: localized type label shown as a card chip.
- `model_dependency`: optional object shown on the template card. Use `mode`, localized `label`, localized `note`, and optional `models`.
- `path`: path to the `.canvas.json` workbench template.
- `preview`: optional preview image path. Put custom preview images in `javascript/canvas_workbench/templates/previews/` and either use just the filename or a full relative path.
- If `preview` is empty, the browser uses the built-in fallback preview style.

## Canvas JSON Minimum

```json
{
  "schema": "simpai.canvas.workbench.v1",
  "id": "template_id",
  "title": "Template Title",
  "viewport": { "x": 80, "y": 80, "zoom": 1 },
  "settings": {
    "grid": true,
    "snap": false,
    "minimap": true,
    "edgeLabels": true
  },
  "groups": [],
  "nodes": [],
  "edges": [],
  "runs": []
}
```

## Recommended Starter Nodes

- Use `note` nodes for onboarding copy and area labels.
- Use `text`, `translation`, and `wildcards_helper` nodes for prompt-building examples.
- Use `result` nodes only as safe lifecycle examples unless the template is intended to run real presets.
- Avoid model-dependent `preset` or `classic` nodes in `starter` templates.
- If a starter needs to teach Preset behavior, use a skipped/static Preset node and explain that real runs require model readiness checks.
- If a starter teaches model readiness, use static Preset nodes with `source.kind: "onboarding_model_status_example"` so model checks stay instructional and do not contact the backend.

## Runnable Preset Templates

- Put runnable templates in `image`, `video`, or `audio`, not `starter`.
- Use real preset names and runtime values from `presets/*.json`; for example, Anima classic T2I uses `preset.name: "Anima"`, `runtime.backend_engine: "Comfy"`, and `runtime.task_method: "anima_aio"`.
- Do not connect `text` nodes to built-in scene/classic generation nodes (`preset` or `classic`) through `prompt` or `negative_prompt`. Store default prompt text in the generation node `params`; scene multi-theme nodes can also use `schema.per_theme.*.defaults`. External text edges override theme defaults.
- Include connected `models`, `styles`, `resolution`, and `advanced` config nodes when the workflow should expose those controls on canvas. Use `styles_config` for Style panel selections instead of storing `style_selections` only inside `generation_config`.
- Runnable templates may preload replaceable sample assets from `presets/input_reserved/` when an empty node would make the graph hard to understand. Reference these files by path on the node `asset`; do not copy them into templates or inline base64 data.
- Reserved input assets are teaching placeholders. The node `status`, `source.reserved_asset`, or note must tell users to replace or confirm them before production runs.
- Image-edit templates may include an empty `image` placeholder connected to the preset input; the card description or a canvas note must tell users to replace it before Run.
- Text-to-video templates should set `runtime.engine_type` and `schema.engine_type` to `video`; hide unused upload slots with `visible: false` entries instead of relying on the default image-slot fallback.
- Audio-driven video templates should expose `scene_audio` as a visible upload slot and use an `audio` placeholder or audio `result` node as the upstream source.
- Image+audio video templates should expose the required image through `scene_canvas_image` and audio through `scene_audio`; the card description or a canvas note must tell users which media must be replaced before Run.
- Video-to-audio/Foley templates should expose `scene_video`, keep audio slots hidden unless the preset actually consumes them, and explain whether original video audio is merged or replaced.
- Image-to-video templates should use `scene_canvas_image` for the required first frame and `scene_input_image1` for the optional last frame.
- Video-extend templates should include an empty `video` placeholder connected to `scene_video`, and should explain that a video Result from T2V/I2V can be chained into that slot.
- SAM3/Wan video-edit templates should include a `sam3_video_mask` node, a `media` edge from the source video to the SAM3 node with `slot: "source"`, and `upload` edges from source/mask nodes into `sam3_input_video` and `sam3_mask_video`.
- Wan-Animate replacement templates should connect a required `image` placeholder to `scene_canvas_image` for the object/face/person reference, and should keep unused scene media slots explicitly hidden in `schema.upload_slots`.
- Wan-Remover templates should use `sam3_input_video` plus `sam3_mask_video`.
- Wan-SCAIL2 and Wan-Swap templates should use `scene_video` plus `scene_canvas_image`; use `motion_signal.mp4` for motion examples, `example.mp4` for generic video examples, and the reserved portrait/reference images for replaceable image examples.
- Video enhancement templates such as Nvidia-VSR should expose `scene_video`, keep hidden media slots explicit, and document any optional model dependency such as RIFE interpolation.
- LTX2.3 Insight-style video restoration templates should expose `scene_video`, keep audio and unrelated media slots hidden, mirror all task themes in the Preset node schema, and keep task IC-LoRA files in `model_requirements.model_list`.
- For a multi-theme Preset node, keep `runtime.scene_theme`, `runtime.task_method`, and `params.prompt` aligned with `schema.default_theme` / `schema.per_theme`. Theme changes update prompt-like params only while their current value still matches the previous theme default.
- Result reuse templates may preconnect an upstream `result` node to a downstream upload slot. The downstream node's `upload_slots` map and the `upload` edge must both point to the same Result id.
- Keep `model_requirements.model_list` in sync with the source preset file so Check/download models can work before Run.
- Use `model_dependency.mode: "requires_models"` in the manifest and list the primary filenames in `models`.

## Timeline Templates

- Timeline teaching templates belong in `starter` when they are model-free.
- Use `video`, `image`, and/or `audio` placeholders as sources, `timeline` edges to attach clips, and a `result` placeholder with `producer.timeline_node_id`.
- Timeline clip ids should match the `edge.slot` values so deleting or replacing source nodes can keep clip bindings understandable.
- Starter checklist steps should focus users on replacing placeholder media, editing Timeline params/clips, and rendering to Result.
- Runnable mixed templates may put generated audio/video Results on Timeline; in that case the upstream `generate` Result and downstream `timeline` edge should both stay visible so the chain teaches Result reuse.

## Director Timeline Templates

- Director templates use `director_timeline` nodes for pre-generation shot planning. The existing `timeline` node remains the post-generation editor.
- Connect image/video/audio placeholders or Results to Director with `media` edges whose `slot` matches `image_1`, `audio_1`, or `video_1`. Also set the node `media_inputs` map to the same source ids.
- Connect Director to a runnable video preset with a `text` edge targeting `prompt`. Single-shot timelines send the Director `prompt_override` and `director_timeline` payload to the backend; multi-shot video presets run once per shot, create segment Results, and render them through the downstream Timeline.
- Audio-driven Director templates may reuse the same Qwen TTS Result for `audio_1` and for a video preset upload slot such as `scene_audio`.
- If a generated Director video is meant for post work, keep a visible video Result and a downstream Timeline node so Result reuse is obvious.
- `Director Result + Timeline Mix` is model-free: replace the segment Result placeholders with generated videos, then render the existing Timeline to publish the final video Result.

## Qwen TTS Templates

- Qwen TTS templates belong in the `audio` category and use `qwen_tts_voice_design`, `qwen_tts_voice_clone`, `qwen_tts_custom_voice`, or `qwen_tts_dialogue` nodes rather than `preset` nodes.
- Connect Qwen TTS nodes to `result` nodes with a `generate` edge and set the Result producer to `{ "qwen_tts_node_id": "..." }`.
- Voice Clone requires a real `audio` node or audio `result` connected with a `media` edge to `ref_audio`; placeholder audio nodes should clearly tell users to replace them before Run.
- Dialogue needs a Role Bank. Runnable Dialogue templates should connect `role_1_audio` through `role_4_audio` for every script role the template uses, or clearly mark the template as teaching-only.
- Qwen TTS model readiness is enforced by the run path, not the preset model checker. Use `model_dependency.mode: "requires_models"` and list Qwen3-TTS repo/model names such as `Qwen/Qwen3-TTS-12Hz-1.7B-Base`.
- Qwen TTS to Timeline templates may live in the `video` category when the final rendered Result is video; their manifest note should say that TTS needs models while Timeline rendering is model-free.

## Model Dependency Metadata

```json
{
  "model_dependency": {
    "mode": "model_free",
    "label": { "en": "Model-free", "zh": "无模型依赖" },
    "note": { "en": "Safe to browse and edit without installed models.", "zh": "无需安装模型即可浏览和编辑。" },
    "models": []
  }
}
```

- `mode` can be `model_free`, `teaching_only`, `requires_models`, or `unknown`.
- Starter templates should normally be `model_free` or `teaching_only`.
- Runnable V2/V3/V4 templates should use `requires_models` and list model filenames or requirement names in `models`.

## Starter Checklist

- Starter templates can set `settings.__onboarding_template: true` and define `settings.__onboarding_checklist_title` plus `settings.__onboarding_checklist_steps`.
- Do not set these fields on `image`, `video`, or `audio` templates; those categories should not show the runtime checklist panel.
- Each step supports `key`, `action`, `icon`, localized `title`, localized `detail`, and optional `target_node_id`.
- Common actions are `focus_node`, `select_node`, `inspect_node`, `template_library`, `add_text`, `run_queue`, and `check_models`.
- Use `target_node_id` with `focus_node` when a checklist item should select and center a specific teaching node.
- If no custom steps are provided, the workbench uses the generic Quick Start checklist.

## User Templates

- The in-app "Save current" flow stores user templates under the current user's `canvas_workbench/templates` directory.
- User templates are loaded into the same library UI, use `path: "user:<template_id>"` internally, and are shown under the separate `User` sidebar tab.
- User templates can be deleted from their template cards in the library; built-in templates are read-only.
- User-saved canvases should still follow the same schema and media category rules (`starter`, `image`, `video`, or `audio`); the `User` tab is derived from `source: "user"`, not from a manifest category value.
- When turning a user-saved canvas into a built-in template, replace the temporary user id/title/tags, remove user-only settings such as `settings.canvasAgent`, `settings.__template_source`, and `source: "user"`, and restore the manifest-style metadata used by `template-library.json`.

## Acceptance Checklist

- The manifest and every `.canvas.json` file parse as JSON.
- Starter templates open without installed models; runnable templates open without installed models but must clearly show `Requires models`.
- The template has at least one group and one note explaining the workflow.
- No fake active run requires Stop, Skip, or Retry to work.
- Runnable preset templates include real preset identity, model requirements, prompt defaults, and config defaults from the source preset.
- Runnable Qwen TTS templates include mode-specific params, any required audio input edges, and an audio Result placeholder.
- Search finds the template by title, description, and tags.
