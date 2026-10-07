# SimpAI Studio Docs

This directory is split into two kinds of material:

- Project docs that can stay in the repository.
- Local/offline analysis artifacts that should stay on a developer machine and
  are ignored by git.

## Repository Docs

Keep these tracked:

- `agent-api-v1.md`: shared Agent API discovery, preset and model queries,
  parameter schemas, assets, generation tasks, and MCP integration.
- `agent-mcp.md`: standalone stdio MCP setup, private pairing and renewal,
  dynamic tools, protected media resources, and validation boundaries.
- `windows-launcher-zh.md`: Windows launcher package entry, screenshot,
  directory layout, startup options, and packaging limits.
- `agent_guides/create-preset-workflow.md`: coding-agent guide for creating
  SimpAI presets and backend ComfyUI API workflows.
- `director-workspace/README.md`: usage guide and test runbook for the
  Director Workspace and Director Timeline flows.
- `prompt-tools-development.md`: Main WebUI Prompt Tools registry, media and
  preset resource contracts, Director integration, Tag formatting, and tests.
- `describe-media-development.md`: Main WebUI image/video reverse-prompt input,
  adaptive video sampling, model requirements, UI behavior, and tests.
- `readme-showcase.md`: screenshot showcase used by the root README.
- `vlm_skills/`: runtime skill knowledge loaded by the VLM Agent.

Keep these runtime prompt-enrichment data files tracked unless the code is
changed to load them from a different resource directory:

- `sfw_trigger_slots.csv`
- `sfw_negative_conflicts.csv`
- `adult_trigger_slots.csv`
- `adult_negative_conflicts.csv`
- `adult_phrase_trigger_map.csv`
- `vlm_system_prompt_templates.csv`

## Local-Only Artifacts

Do not commit or release generated prompt-mining outputs:

- `adult_association_pairs.csv`
- `adult_branch_quality_cases.csv`
- `adult_branch_quality_samples.csv`
- `adult_association_*.md`
- `adult_branch_quality.md`
- `sfw_association_*.csv`
- `sfw_association_*.md`
- `*_samples.md`
- `*_scratch.md`
- `*_draft.md`
