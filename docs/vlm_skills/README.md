# SimpAI VLM Skills

This directory contains built-in SimpAI knowledge used by the VLM Agent.

Custom `SKILL.md` mounting for VLM Chat:
- Project roots: `.agents/skills`, `.zcode/skills`, `.codex/skills`,
  `.claude/skills`, or `skills`, searched from the Studio directory and its
  ancestors.
- User roots: the same directory names under the current user's home
  directory.
- External roots: set `SIMPAI_SKILL_ROOTS` to one or more absolute paths. On
  Windows, separate multiple roots with `;`. `SIMPAI_SKILLS_DIR` and
  `SIMPAI_SKILL_ROOT` are accepted as single-root aliases.
- Each root can contain a `SKILL.md` directly or one level of skill folders.
  A normal file starts with YAML frontmatter containing `name` and
  `description`; a file without frontmatter uses its folder name.
- Skill bodies are read-only, capped at 100 KB per load, and never execute
  scripts. Earlier roots take precedence when two skills use the same name.
- In Describe Image Chat, open the top-right chat settings and use the
  `Custom skills` selector to choose which skill bodies are loaded for later
  requests. The chat sends the selected names in `skill_names`; the server
  loads only those names. Other clients can inspect `/describe-image/vlm-skills`
  and use the read-only registry at `/describe-image/vlm-tools`.

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
- `qwen_image21_t2i_en.md` / `qwen_image21_t2i_cn.md`: localized Qwen Image
  2.1 PE text-to-image structure. The final prompt stays plain text; preset
  controls own ratio and resolution.
- `qwen_image21_i2i_en.md` / `qwen_image21_i2i_cn.md`: localized Qwen Image
  2.1 PE image-editing structure, including ordered `<imageN>` roles and
  source preservation.
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
- `simpai_preset_guide_routes.json`: hierarchical route manifest for the shared
  Preset Guide. Describe Guide mode and Canvas Agent select one or two relevant
  guide sections from the current request and `state.__lang`; they do not load
  the complete guide into one model context.

Related acceptance checklist:
- `../vlm-agent-prompt-acceptance.md`: repeatable checks for prompt target
  recognition, final prompt quality, confirmation-card safety, and manual
  output matrix cases.

Image editing skill:
- `image_editing.md`: bilingual source-grounded editing rules, ordered
  `<Picture N>` references, unchanged-content preservation, and the
  `MiniMax-H3(R2I)` still-image route used by Canvas Agent and VLM Chat.

## VLM Chat installation guidance (2026-09-22)

When the VLM Chat skill scan returns no results, the selector collapses its
empty list automatically but keeps the install guidance and refresh button
visible. The user can expand the selector to inspect the paths.

Install a skill as `<skill-name>/SKILL.md` in any of these project roots:

- `skills`
- `.agents/skills`
- `.zcode/skills`
- `.codex/skills`
- `.claude/skills`

The same directory names are also searched below the current user's home
directory. For a separate absolute folder, set `SIMPAI_SKILL_ROOTS`; on
Windows, separate multiple folders with `;`. After copying a skill, click the
refresh button in the chat settings. Chat attachments are not registered as
skills.

## In-app skill creation and upload (2026-09-22)

The VLM Chat settings now provide `Create custom skill` and `Upload SKILL.md`
buttons. Creation and upload both open the same editor, where the user can
review the folder name, choose the project or user `skills` folder, and edit
the Markdown before saving.

Upload accepts one Markdown file and saves it as
`<skill-name>/SKILL.md`. A repeated folder name asks before overwriting the
existing file. The server limits the content to 100 KB and only writes to the
two controlled `skills` roots; the browser cannot supply an arbitrary path.

## Agent-authored skill drafts (2026-09-22)

The skill editor now has a requirements field and an `Agent draft` command.
It uses the currently selected VLM/LLM and API configuration. An existing
editor draft can be revised by supplying new requirements. The authoring
request is isolated from ordinary chat history, attachments and roleplay.

The model returns one explicit `vlm.prepare_skill_draft` tool call with
`name`, `description` and Markdown `body`. The registered read-only tool
validates the metadata, rejects paths and unsupported arguments, and builds
the YAML frontmatter. Invalid model output does not replace the editor text.
No tool in this authoring request may write files, execute code or enable a
skill. Saving and duplicate-file confirmation still use the existing editor.

The workflow draws on ZCode's `SkillsSection.tsx` new-task entry that mentions
`skill-creator`, and the local Codex skill-creator's requirements for clear
triggering descriptions, concise workflows, concrete examples and validation.
This is a bounded authoring request, not ZCode's general filesystem agent.
Studio currently loads instruction-only SKILL.md content; generated drafts
must not require bundled scripts, reference files or unavailable tools.

Limits: requirements up to 6,000 characters, existing draft up to 16,000
characters, generated skill up to 100 KB, lowercase hyphenated names up to
64 characters. Visible labels follow `state.__lang`. The stop command aborts
the browser request, signals backend cancellation and discards late results.
An inference already executing may finish before backend cancellation is
observed. Closing the editor or chat window also cancels draft generation.

Validation uses mocked inference and targeted Python/Node tests for tool
dispatch, context isolation, schema errors, size limits, cancellation and
late responses. Live model quality and full Studio visual acceptance are
separate checks; these tests do not start Studio or load GPU models.

## Multimedia authoring scope (2026-09-22)

Agent skill creation is explicitly scoped to image, video and audio creation:
prompt writing, storyboarding, supplied-media review, creative planning and
workflows using existing Studio Presets. The editor labels this scope in both
UI languages. The authoring prompt requires drafts to preserve these limits,
avoid invented tools/Presets and account for the selected model's media support.

General programming and system-administration requests, or tasks whose core
steps need arbitrary filesystem access, command execution or installation,
must return `skill_scope_unsupported`. This response leaves the editor draft
unchanged and displays a localized scope error. Mixed requests may describe
feasible multimedia work and explicitly user-performed prerequisites.

Scope classification is model-guided, not a semantic security filter. Actual
permissions remain enforced by the available application tools: loading a
skill never grants shell execution, arbitrary file access or elevated access.
The authoring tool remains read-only; reviewed SKILL.md saves are limited to
the existing managed roots. Media execution uses existing Studio actions and
their confirmation flow. Manual uploads remain unchanged and do not acquire
extra permissions either.

## Skill editor control styling (2026-09-22)

Skill toolbar and editor buttons now share the existing chat button theme,
including text color, background, border and hover state. The skill name
input shares the settings field theme, sizing and focus treatment instead
of using browser-default white styling. Keyboard focus, disabled states,
placeholder colors and the native dark color scheme are defined locally
for skill controls. This changes presentation only, not creation or saving.

## Skill draft response parsing (2026-09-22)

Draft authoring now decodes the complete raw model reply before inspecting
its tool envelope. Markdown fences inside the JSON body no longer divert
parsing to an example snippet. A single outer JSON fence, string-encoded
arguments and single serialized function-call envelopes are accepted.
This is text-protocol compatibility, not native provider tool registration.
Multiple calls, truncated JSON, arbitrary nested fragments, unexpected
tools and extra argument fields remain rejected. All accepted drafts still
pass the existing schema and content validation; no automatic saves or
additional model requests are introduced.

Failures identify `skill_draft_parse` or `skill_draft_validation`. Both UI
languages distinguish invalid model output from connection failures and
preserve the current editor contents. Parse diagnostics record request ID,
response length and output-limit status without logging generated content.
The reported production logs contain no response body, so their exact
response format cannot be reconstructed. Regression coverage uses synthetic
replies; live provider verification remains separate.

## Existing skill management (2026-09-23)

Skill rows now separate enablement from management. Expand a name to read
the full description, trigger notes and source path; use the edit icon to
load the complete SKILL.md, including frontmatter, into the existing editor.
Descriptions wrap in expanded details, and edit/delete icons use the chat
theme with fixed dimensions. All new messages follow `state.__lang`.

`inspect`, `update` and `delete` are UI endpoint operations, not agent tools.
Inspection resolves a discovered skill by name and returns its full UTF-8
content, bounded to 100 KB. Original folder identity and a revision hash
(resolved path plus bytes) accompany the editor session. Updates and deletes
require that revision, preventing ordinary stale-editor overwrites. This is
an optimistic check, not an OS-level lock against concurrent external writes.
Invalid edited frontmatter is rejected before replacement.

Only direct skill folders under Studio `skills` and the user's `~/skills`
are writable here; symlink/junction locations are excluded. Skills found in
other tools' roots or environment roots remain inspectable and can be saved
as copies in a managed root. Name precedence during discovery still applies.
Editing a managed skill preserves its folder and scope; the SKILL.md name
may be revised in the content. Enabled selection follows that updated name.

Deleting requires confirmation and removes only SKILL.md. Sibling files and
the directory remain untouched; enabled selection is cleared after success.
Unsaved content prompts before switching or closing the editor. File
operations disable competing editor actions, restore controls after errors,
and preserve drafts on revision conflicts. Browser newline normalization
is included in the unsaved-change baseline.

Generation remains one isolated model request with thinking disabled and a
JSON text-call protocol, followed by deterministic tool validation. It does
not autonomously write files and does not retry invalid output. This change
does not claim a measured small-model success rate or introduce paid repair
requests. Explicit model-aware generation/repair controls are future work.
Verification covers Python file operations and Node editor interactions;
full Studio visual acceptance and live model comparisons are not included.

## Studio-only mounts and account permissions (2026-09-23)

This section supersedes the historical root discovery and user-home rules
above. Custom multimedia skills now use only:

- Shared project storage: `<Studio>/skills/<skill-name>/SKILL.md`.
- Private account storage: the existing identity service's
  `token.get_path_in_user_dir(current_did, "skills")`, followed by
  `<skill-name>/SKILL.md`. This is a Studio account directory, not the
  server process's operating-system home directory.

There is no automatic scan of `.agents`, `.codex`, `.zcode`, `.claude`,
parent projects, `~/skills`, or `SIMPAI_SKILL_ROOT(S)`/`SIMPAI_SKILLS_DIR`.
Symlink and junction roots/folders are excluded. Personal skills take
precedence over project skills with the same metadata name, only for that
account. Built-in multimedia instruction documents are unchanged.

| Session | Read | Save, update and delete |
| --- | --- | --- |
| Local | Project and local workspace skills | Project or workspace account |
| Administrator | Project and own private skills | Project or own account |
| Allowed ordinary user | Project and own private skills | Own account only |
| Guest, unauthenticated, pending or blocked user | Project skills | Not allowed |

HTTP identity comes from the verified session via
`_get_request_identity_did`, never a payload DID, role or filesystem path.
Local mode resolves the native workspace DID. A missing private directory
service does not fall back to another account or to the server's home.
When no identity service exists in local-only execution, the private root
is `<Studio user-home>/local/skills` (default `<Studio>/users/local/skills`).
Administrators do not automatically mount other accounts' private skills.

The list endpoint returns writable scopes; the UI restricts save choices,
shows guest inspection as read-only, and hides unauthorized creation and
deletion controls. Project skills can be copied to a normal user's own
directory. Backend checks independently apply to save/upload/update/delete.
Read-only tool loading and both chat response routes use the same trusted
skill access context, so hidden private skills cannot be retrieved by name.
Catalog permissions are refreshed when opening the chat window.

No existing files are moved or deleted by this change. Previously saved
project skills remain available. Skills previously placed in OS-home or
third-party roots must be deliberately imported into an authorized Studio
location after checking multimedia suitability. Loading a skill continues
to grant no command execution, filesystem editing or additional tool rights.

Tests cover the role/write-scope matrix, forged request fields, cross-user
list/load/tool/chat isolation, legacy mount exclusion, local workspace
identity, shared-skill protection, guest controls and private-copy saving.
Live multi-account browser verification is separate; tests use temporary
directories and mocked identity services without starting Studio.

Validation on this change: 253 Python checks and 26 Node checks passed.
The previously recorded creative Canvas contract test still fails at
`"apiBuildPresetRunNode," in controller_context`; it is outside skill
storage/permissions and was not changed to hide that failure. JavaScript
syntax and tracked-file whitespace checks passed. No live identity session,
Studio instance, GPU model or automatic migration was started.

## Conversation-scoped manual skill enablement (2026-09-23)

Custom multimedia skill enablement now belongs to the active conversation.

- A newly created conversation starts with no enabled skills. The previous
  conversation selection is not copied into ordinary new, example, or blank
  conversations.
- Switching to a saved conversation restores its own `skill_names` selection.
  The selection is included in the conversation snapshot and is restored into
  the active runtime before controls are rendered.
- Creating a new conversation from a roleplay branch explicitly inherits the
  source conversation's enabled skills. This is the only copy path that
  currently inherits them.
- Checking or unchecking a skill, deleting a selected skill, renaming a
  selected skill, and catalog refreshes update the active conversation and
  schedule its persistence. Legacy global skill selections in chat settings
  are ignored.
- The collapsed skill header keeps a bilingual count such as `This
  conversation: 2 enabled` / `本对话已启用 2 个`, so the current selection is
  still visible without expanding the list.
- Chat requests send only the active runtime's `customSkillNames`. Agent
  automatic selection from skill summaries is not enabled in this stage;
  users select skills manually per conversation.

Regression coverage includes conversation runtime defaults, explicit branch
inheritance, snapshot restoration, request payload selection, and collapsed
header status. The focused Node skill suite has 30 passing tests, JavaScript
syntax validation passes, and the focused Python checks pass except for the
previously recorded unrelated Canvas contract assertion at
`apiBuildPresetRunNode`.

## Skill and system prompt budgets (2026-09-22)

Manual skill selection remains conversation-scoped; agent automatic skill
selection is not enabled. Skill count limits now follow the active chat mode:

| Mode | Maximum manually enabled skills |
| --- | ---: |
| Raw Model | 8 |
| Free Chat | 4 |
| Prompt Assistant | 3 |
| Guide Mode | 2 |
| Creative Mode | 2 |
| Roleplay | 1 |

The UI prevents adding a skill after the current mode reaches its limit. A
conversation restored from another mode is not silently reduced; if its
selection is over the new mode limit, the header shows the over-limit state
and sending is refused with a bilingual explanation.

Sending performs a `skill_budget_check` request before consuming the composer,
attachments or writing a pending message. The check reports the selected
skill count, full skill-body character total, user system prompt size and the
available local system-prompt budget. It does not load a model or call the VLM
runtime. The backend repeats the same validation for normal requests.

Skill loading no longer truncates a selected file to the remaining budget and
adds an ellipsis. Missing files, externally truncated files, total skill text
overruns and mode count overruns return structured failures. The selected
skill and user system-prompt content is placed in a marked user-extension
block so the local prompt compactor preserves it. If that block cannot fit
the local system-prompt budget, the request is refused and the user is told
to reduce enabled skills or shorten the system prompt. Built-in mode protocol
text may still use its existing internal compaction rules; user-provided
content is not silently discarded.

The current raw skill-body budget is 24,000 characters. Local llama.cpp
system-prompt budgets continue to depend on context size and mode; custom API
routes with no known local truncation budget are not given a fabricated local
limit, but still enforce skill-file and mode-count limits. The focused budget
tests cover all six mode limits, complete-body loading, preflight ordering,
system-prompt rejection and the no-runtime-call preflight path.

## Persistent conversation skill status (2026-09-22)

The chat header now keeps a bilingual, clickable skill status control visible
after the settings panel is closed. It shows whether the active conversation
has enabled skills, the current count, and the selected skill names when the
panel is wide enough. Selecting the control opens the chat settings and the
conversation-scoped skill list, so users can inspect or change the selection
without guessing whether the mount was applied.

The control follows the existing dark chat button theme, reduces to an icon and
count on narrow screens, and marks a restored over-limit selection as a warning.
The status reads from the same `customSkillNames` state used by request
payloads; it does not create a second skill selection or enable automatic
agent skill routing.
