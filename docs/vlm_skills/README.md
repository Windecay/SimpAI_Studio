# SimpAI VLM Skills

This directory contains built-in SimpAI knowledge used by the VLM Agent.

Agent actions are advisory until the frontend presents a confirmation card or a
local safe UI action. The Agent may prepare generation/edit prompts and suggest
whitelisted actions, but it must not claim that a project mutation has already
happened before the user confirms it.

Documents:
- `skill_index.json`: machine-readable ownership and edit-boundary index.
- `skill_ownership.md`: what the owner should write or review manually, and
  what Codex may generate.
- `canvas_operations.md`: canvas objects, nodes, edges, and workflows.
- `safe_actions.md`: low-risk JSON actions the model may suggest.
- `image_prompting.md`: how to write final image/video prompts for Z-image,
  Wan, FLUX, and SDXL/Danbooru-style targets, including local Danbooru tag
  lookup and SDXL weight syntax. For VLM Chat image actions, the current
  contract also requires structured `subject_counts` as
  `{girls,boys,others,total}`; use `others` for unnamed visible extra subjects
  and align SDXL/Danbooru prompt count tags such as `multiple_others` to that
  structure.
- `danbooru_tag_prompting.md`: first-pass SDXL/Danbooru tag-list prompt
  contract, kept separate from natural-language image prompting.
- `anima_prompting.md`: Anima-specific hybrid prompt contract for Anima
  presets, using English Danbooru/Anima anchors plus short `nltags` control
  sentences.
- `danbooru_prompt_review.md`: optional second-pass review rules for final
  SDXL/Danbooru prompts, including scoring, conflict checks, and narrow prompt
  fixes before confirmation or submission.
- `natural_prompt_refine.md`: optional second-pass Review/Refine Prompt rules
  for natural-language targets such as Qwen/Z-image, FLUX/T5XXL, and Wan/UMT5;
  preserve user intent first, then repair or enrich the prompt text.
- `h3_prompt_writing_en.md` / `h3_prompt_writing_cn.md`: localized MiniMax H3
  Prompt Writing guidance adapted from the official `h3-prompt-writing` skill.
  Canvas Agent loads exactly one file from `stage.__lang`; H3 field names,
  section names, shot markers, and media tokens remain English in both files.
- `tool_status.md`: how the Agent should interpret queued, running, failed,
  canceled, skipped, and no-output tool runs.
- `agent_companion.md`: behavior rules for the always-available canvas Agent
  panel and its confirmed generation/edit actions.
- `preset_tool_calling.md`: preset naming, alias matching, and how to interpret
  requests such as "use Zimage to generate ...".
- `simpai_preset_guide.md`: owner-authored SimpAI workflow and preset guide
  knowledge for realistic/anime generation, editing, retouching, video, audio,
  Qwen free-viewpoint / pose / Gaussian repair presets, model readiness, and
  when to recommend main WebUI versus infinite canvas.

Related acceptance checklist:
- `../vlm-agent-prompt-acceptance.md`: repeatable checks for prompt target
  recognition, final prompt quality, confirmation-card safety, and manual
  output matrix cases.

Image editing skill:
- `image_editing.md`: bilingual source-grounded editing rules, ordered
  `<Picture N>` references, unchanged-content preservation, and the
  `MiniMax-H3(R2I)` still-image route used by Canvas Agent and VLM Chat.
