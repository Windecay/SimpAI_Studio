---
name: create-preset-workflow
description: Use when creating a new SimpAI_Studio preset tab, importing a ComfyUI workflow, or debugging "prompt_no_outputs" / workflow conversion errors. Covers the preset-to-workflow mapping, scene vs non-scene architecture, GeneralInput/SceneInput node conventions, and common pitfalls.
---

# Create Preset & Import Workflow

This is a project-level guide for coding agents that create SimpAI Studio
presets and backend ComfyUI API workflows. Keep it in repository docs; mirror it
into a tool-specific skill directory only when that tool requires one.

This guide has two audiences:

- User-facing agents should create portable extra content in the active user
  directory. This content should survive source updates and should not require
  changing tracked Studio files.
- Developer agents can change built-in presets, workflows, Canvas templates,
  Rust mappings, and tests in the repository.

## Architecture: 3-Layer Mapping

```
presets/{Name}.json  →  task_method  →  workflows/{task_method}_api.json
       (UI config)         (string key)       (ComfyUI API workflow JSON)
```

- **Preset JSON** (`presets/*.json`): defines UI visibility, default models, aspect ratios, and the `task_method` key.
- **Workflow JSON** (`workflows/{task_method}_api.json`): ComfyUI API-format workflow template with parameter placeholders.
- **Rust `convert2comfy(flow_name)`** (`simpleai_base` `.so`): at generation time, reads the workflow template, substitutes UI parameters into it, returns the final prompt dict sent to ComfyUI.

## Choose the Target Surface

### User Portable Content Boundaries

Use this path for content created by an end user or by a user-facing local
agent. The normal packaged launch uses arguments like:

```
--models-root ../../SimpleModels --userhome-path ../../users
```

That means user data is normally outside the `SimpAI_Studio` source tree. Use
the resolved `shared.path_userhome` / token user directory APIs when running
inside Studio, not a hard-coded repository path.

Portable user content belongs under the active userhome, commonly:

- private user presets: `{userhome}/{did}/presets/{Name}.json`
- user Canvas projects: `{userhome}/{did}/canvas_workbench/projects/{id}.canvas.json`
- user Canvas templates: `{userhome}/{did}/canvas_workbench/templates/{id}.canvas.json`
- user Canvas assets: `{userhome}/{did}/canvas_workbench/assets/{project_id}/...`
- user config and model paths: `{userhome}/config.txt`, usually pointing models
  at `../../SimpleModels`

Presets have two valid storage targets:

- public or built-in preset: `SimpAI_Studio/presets/{Name}.json`
- identity-private preset: `{userhome}/{did}/presets/{Name}.json`

Workflow API JSON is different. A preset's `task_method` is resolved through the
project workflow directory as `SimpAI_Studio/workflows/{task_method}_api.json`.
Do not assume a workflow API JSON stored only under `userhome` will be loaded by
`convert2comfy()` or Comfyd. Some user directory helpers may create a
`{userhome}/{did}/workflows/` folder, but that folder is not the backend API
workflow source for preset generation. If a user-authored preset needs a new
backend workflow, install that API file into `SimpAI_Studio/workflows/`; the
private user preset can reference it, but the workflow template itself is shared
by that Studio installation.

Keep private user content out of tracked built-in directories. The repository
already ignores `/users`, and the source update flow protects `users`, `outputs`,
`models`, `logs`, `cache`, and `tmp`. Public presets and workflow APIs are source
tree assets; they can be updated by `git pull` or source package updates.

User presets appear with a trailing dot in Studio navigation and preset-store
lists. For example, `MyPreset.json` in the user preset directory is displayed as
`MyPreset.`. User Canvas templates are listed with `source: "user"` and
`path: "user:{id}"`; keep that shape when generating metadata.

For user portable content, prefer using the Studio save APIs or UI flows. If a
local agent must write files directly, write private presets, Canvas content,
and user config under userhome. Write workflow API JSON under
`SimpAI_Studio/workflows/` only when the current Studio installation is meant to
receive that shared workflow.

### Developer Built-In Content

Use this path only when changing the shipped product. Built-in content is
tracked by git and can require coordinated edits across presets, workflows,
Canvas template metadata, model checks, Rust mapper rules, and tests.

## Workflow Naming and Chinese Prompt Support

Use `_cn` in the `task_method` and API workflow filename only when the workflow
can accept Chinese prompts directly:

```
backend_params.task_method = "wan_aio_cn"
workflows/wan_aio_cn_api.json
```

`_cn` is not just a language label for the UI. It tells Studio that the backend
workflow uses a Chinese-capable text encoder, typically Qwen, UMT5, or another
newer multilingual text encoder. In this mode, Studio does not run the
pre-generation automatic prompt translation that older English-only CLIP
workflows need.

If the workflow uses an older SD/SDXL-style CLIP text encoder that expects
English prompts, do not add `_cn` to the `task_method` or API filename. Keep a
name such as `sd15_aio` / `workflows/sd15_aio_api.json` so Chinese prompts can
still pass through the translation step before generation.

Keep these three values aligned:

- Preset `backend_params.task_method` or `scene_frontend.task_method` value.
- API workflow file stem under `workflows/`, without `_api.json`.
- Prompt-language capability of the actual text encoder nodes in the workflow.

## Cross-Platform Notes

- Run examples from the `SimpAI_Studio` repository root unless a command says
  otherwise.
- Pick the Python interpreter that owns the running Studio environment:
  - Windows packaged build: `..\python_embeded\python.exe`
  - Windows/Linux activated venv or Conda env: `python`
  - Linux Conda without activation: `/path/to/env/bin/python`
- A normal portable launch keeps models and users outside the source tree:
  `--models-root ../../SimpleModels --userhome-path ../../users`.
- Studio normally starts Comfyd at `http://127.0.0.1:8187`, but the port may
  change when it is occupied or when `--backend-port` is used. Use the actual
  backend address from the startup log. The examples below read
  `SIMPAI_COMFY_ENDPOINT` and default to `http://127.0.0.1:8187`.
- Use `pathlib.Path` in test scripts instead of hard-coded Linux paths such as
  `/home/user/SimpAI_Studio` or Windows paths such as `L:\...`.
- Do not blindly rewrite Comfy model enum values with subdirectories. Inputs
  such as `lora_name`, `vae_name`, `ckpt_name`, `unet_name`, and `clip_name`
  must match the current Comfy `/object_info` enum. Studio normalizes `/` and
  `\` separators for enum values before submitting prompts, but raw API JSON
  should still be verified against at least one real backend.

## Scene vs Non-Scene

| Feature | Non-scene (`_aio`) | Scene (`scene_`) |
|---|---|---|
| Preset key | `backend_params.task_method` | `scene_frontend` block |
| Input node | `GeneralInput` (14 outputs) | `SceneInput` (33 outputs) |
| UI | Clean T2I only (no panels) | Full scene panel (themes, canvas, inputs) |
| Example | Z-imageT, Flux, Playground | Wan(T2V), QwenEdit+ |

**Use non-scene** for simple text-to-image presets. **Use scene** when you need canvas, input images, video/audio, or themed multi-mode UI.

## Developer Built-In Preset/Workflow Change Scope

Do not use this section for user portable add-ons. For a built-in preset, do not
treat the API workflow JSON as the only source of truth. Keep these surfaces
aligned:

- `presets/{Name}.json`: UI visibility, defaults, `task_method`, model resource
  list, scene theme mapping, and optional media policy.
- `workflows/{task_method}_api.json`: ComfyUI API graph and placeholder inputs.
- `javascript/canvas_workbench/templates/template-library.json` and matching
  `.canvas.json` files, when the preset is exposed in Infinite Canvas templates.
  Built-in template files must keep stable template ids and manifest-style
  metadata; remove user-saved template fields such as `settings.canvasAgent`,
  `settings.__template_source`, `source: "user"`, temporary ids, and user-only
  tags before committing them.
- `docs/vlm_skills/simpai_preset_guide.md`, when Describe Chat or Canvas Agent
  should recommend the new preset for user workflow questions.
- `presets/scene_prompt_recommendations/*.csv`, when the scene theme should
  provide prompt suggestions.
- Tests that check preset defaults, workflow inputs, model paths, and canvas
  template metadata.

For multi-stage workflows, name internal helper loaders so they cannot be
confused with user-facing slots. Keep helper model roles separate from the
user-facing `clip_model` / `vae` slots.

## Creating a Non-Scene Preset

### 1. Preset JSON (`presets/MyPreset.json`)

Model after `presets/Z-imageT.json`:

```json
{
    "default_engine": {
        "backend_engine": "Comfy",
        "disvisible": ["input_image_checkbox", "prompt_panel_checkbox", "performance_selection", "refiner_model", "backend_selection"],
        "disinteractive": ["input_image_checkbox", "prompt_panel_checkbox", "performance_selection", "refiner_model"],
        "available_aspect_ratios_selection": "Custom",
        "custom_aspect_ratios": ["1024*1024", "1152*896", "896*1152"],
        "backend_params": {
            "task_method": "my_preset_aio"
        },
        "resolution_control": {
            "mode": "standard", "source": "none",
            "base_width": 1024, "base_height": 1024, "quantize": 16,
            "interactive": true, "frontend_preprocess": false,
            "preprocess_target": "none", "preprocess_fit": "scale"
        }
    },
    "default_model": "model-file.safetensors",
    "default_refiner": "None",
    "default_refiner_switch": 0.5,
    "default_cfg_scale": 4,
    "default_sample_sharpness": 2,
    "default_sampler": "euler",
    "default_scheduler": "simple",
    "default_performance": "Speed",
    "default_styles": [],
    "default_aspect_ratio": "1024*1024",
    "default_overwrite_step": 20,
    "checkpoint_downloads": {},
    "embeddings_downloads": {},
    "lora_downloads": {},
    "model_list": [
        "checkpoints,model-file.safetensors,13875718056,0,"
    ]
}
```

Key points:
- `backend_engine`: `"Comfy"` for standard ComfyUI, `"Z-image"` / `"Wan"` / `"Qwen"` for special engines.
- `backend_params.task_method` must match the workflow filename (without `_api.json`).
- `topbar.py` auto-scans `presets/*.json` to generate nav buttons. No manual registration needed.
- For scene keep-input-area presets that should open at source size, use
  `"origin|Original"` for both `default_aspect_ratio` and the first
  `scene_frontend.aspect_ratio` entry. The top-level default is still read by
  the older parameter loader.

#### Model Resources

Prefer `model_list` for new presets. It is read by missing-model checks,
download surfaces, and manual install guidance. The string format is:

```
category,path_file,size,hash10,url
```

- `category`: model directory category, for example `checkpoints`,
  `diffusion_models`, `text_encoders`, `vae`, `loras`, or a current Comfy model
  folder key used by this repo.
- `path_file`: filename or relative model subpath shown to users and checked by
  model status logic.
- `size`: exact byte size used for missing/download checks when available.
- `hash10`: preserved for compatibility; current checks do not depend on it.
- `url`: optional download URL.

For SD/SDXL-style checkpoint presets, the CLIP may be built into the checkpoint.
In that case, use `Default (model)` / `default` or follow an existing SD preset.
Do not force an external `default_clip_model` only because a text encoder file
is listed as a resource.

### 2. Workflow JSON (`workflows/my_preset_aio_api.json`)

#### GeneralInput Node (required)

Every non-scene workflow MUST have a `GeneralInput` node. Its outputs feed parameters to other nodes:

| Output idx | Name | Type |
|---|---|---|
| 0 | prompt | STRING |
| 1 | negative_prompt | STRING |
| 2 | width | INT |
| 3 | height | INT |
| 4 | cfg | FLOAT |
| 5 | steps | INT |
| 6 | refiner_step | INT |
| 7 | sampler | STRING |
| 8 | scheduler | STRING |
| 9 | denoise | FLOAT |
| 10 | clip_skip | INT |
| 11 | inpaint_disable_initial_latent | BOOLEAN |
| 12 | wavespeed_strength | FLOAT |
| 13 | save_final_enhanced_image_only | BOOLEAN |

GeneralInput node definition: `comfy/custom_nodes/params_input.py:13-31`.

#### SeedInput Node (required)

```json
"417": {
    "inputs": { "seed": 0 },
    "class_type": "SeedInput",
    "_meta": { "title": "SeedInput" }
}
```

Node IDs are NOT fixed across workflows. The Rust `convert2comfy()` finds nodes by `class_type`, not by ID. However, using conventional IDs (728 for GeneralInput, 417 for SeedInput) is recommended for consistency with other `_aio` workflows.

#### CRITICAL: Output Node Requirement

ComfyUI rejects prompts without at least one `OUTPUT_NODE = True` node. This is the most common pitfall.

| Node type | OUTPUT_NODE | Notes |
|---|---|---|
| `PreviewImage` | **True** | Always include at least one |
| `SaveImage` | **True** | Standard save |
| `SaveImageWebsocketLazy` | **False** | Pass-through, sends via websocket |
| `SaveImageWebsocket` | **True** | Terminal, but less common in `_aio` |

**Rule:** Every workflow must have at least one `PreviewImage` (or other `OUTPUT_NODE=True` node). `SaveImageWebsocketLazy` alone will cause `prompt_no_outputs` error.

Typical pattern (from working workflows):
```json
"381": {
    "inputs": {
        "images": ["8", 0],
        "format": "JPEG"
    },
    "class_type": "SaveImageWebsocketLazy",
    "_meta": { "title": "SaveImageWebsocketLazy" }
},
"348": {
    "inputs": {
        "images": ["381", 0]
    },
    "class_type": "PreviewImage",
    "_meta": { "title": "PreviewImage" }
}
```

Note: `SaveImageWebsocketLazy` requires `format` input (`"PNG"`, `"JPEG"`, or `"WEBP"`).

#### Model Loading

- **Checkpoint models** (SD1.5, SDXL, Playground): use `CheckpointLoaderSimple` (provides MODEL, CLIP, VAE).
- **Diffusion models** (Flux, Z-imageT): use `UNETLoader` + separate `DualCLIPLoader` + `VAELoader`.

The Rust code substitutes the `base_model` parameter into the loader node's `ckpt_name` or `unet_name` field.

#### Rust Mapper Notes

`simpleai_base` owns the final parameter-to-node mapping. In the `simpleai_base`
repository, the main mapping table is
`src/utils/params_mapper.rs::FOOO2NODE_DATA`, with rules in the form
`class_type:title:input`.

If a workflow introduces a new loader class or a new model input name, update
the Rust mapper as well as the Studio workflow. Common cases:

- new VAE loader input: map it to the `vae_model` parameter;
- new text encoder input: map it to `clip_model`;
- second text encoder input: add the companion `clip_model2` mapping, for
  inputs such as `clip_name2` or `text_encoder2`.

Changing only Studio Python or only the workflow file is not enough when
`convert2comfy()` does not know how to write the new node input.

#### Minimal Working T2I Workflow Example

```json
{
    "4": {
        "inputs": { "ckpt_name": "model.safetensors" },
        "class_type": "CheckpointLoaderSimple"
    },
    "417": {
        "inputs": { "seed": 0 },
        "class_type": "SeedInput"
    },
    "728": {
        "inputs": {
            "prompt": "", "negative_prompt": "",
            "width": 1024, "height": 1024,
            "cfg": 4.0, "steps": 20, "refiner_step": 999,
            "sampler": "euler", "scheduler": "simple", "denoise": 1.0,
            "clip_skip": -1, "inpaint_disable_initial_latent": false,
            "wavespeed_strength": 0, "save_final_enhanced_image_only": false
        },
        "class_type": "GeneralInput"
    },
    "6": {
        "inputs": { "text": ["728", 0], "clip": ["4", 1] },
        "class_type": "CLIPTextEncode"
    },
    "7": {
        "inputs": { "text": ["728", 1], "clip": ["4", 1] },
        "class_type": "CLIPTextEncode"
    },
    "5": {
        "inputs": { "width": ["728", 2], "height": ["728", 3], "batch_size": 1 },
        "class_type": "EmptyLatentImage"
    },
    "3": {
        "inputs": {
            "seed": ["417", 0], "steps": ["728", 5], "cfg": ["728", 4],
            "sampler_name": ["728", 7], "scheduler": ["728", 8],
            "denoise": 1.0, "model": ["MODEL_NODE", 0],
            "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]
        },
        "class_type": "KSampler"
    },
    "8": {
        "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
        "class_type": "VAEDecode"
    },
    "381": {
        "inputs": { "images": ["8", 0], "format": "JPEG" },
        "class_type": "SaveImageWebsocketLazy"
    },
    "348": {
        "inputs": { "images": ["381", 0] },
        "class_type": "PreviewImage"
    }
}
```

### 3. Verify Node Types

Before testing, verify all node `class_type` values exist in the running ComfyUI backend:

```python
# save as check_object_info.py in the SimpAI_Studio root, then delete it after testing
import json
import os
import urllib.request

endpoint = os.environ.get("SIMPAI_COMFY_ENDPOINT", "http://127.0.0.1:8187").rstrip("/")


def fetch_json(path):
    with urllib.request.urlopen(f"{endpoint}{path}", timeout=10) as response:
        return json.load(response)


object_info = fetch_json("/object_info")
for node_name in ["GeneralInput", "SeedInput", "PreviewImage", "SaveImageWebsocketLazy"]:
    print(f"{node_name}: {'OK' if node_name in object_info else 'MISSING'}")

lazy_info = fetch_json("/object_info/SaveImageWebsocketLazy")
print("SaveImageWebsocketLazy output_node:", lazy_info["SaveImageWebsocketLazy"]["output_node"])
```

### 4. Test convert2comfy

The Rust `convert2comfy()` uses `sys.argv[0]`'s directory as root. Must run from a `.py` file inside SimpAI_Studio (NOT `python -c`):

```python
# save as test_wf.py in the SimpAI_Studio root, then delete it after testing
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

root = Path(__file__).resolve().parent
os.chdir(root)
sys.path.insert(0, str(root))

from simpleai_base import simpleai_base
simpleai_base.init_local()
from simpleai_base.params_mapper import ComfyTaskParams

endpoint = os.environ.get("SIMPAI_COMFY_ENDPOINT", "http://127.0.0.1:8187").rstrip("/")

params = {
    'base_model': 'model.safetensors', 'prompt': 'test',
    'negative_prompt': '', 'width': 1024, 'height': 1024,
    'cfg_scale': 4, 'steps': 20, 'sampler': 'euler',
    'scheduler': 'simple', 'denoise': 1.0, 'seed': 1,
}
ctp = ComfyTaskParams(params)
prompt = ctp.convert2comfy('my_preset_aio')
print(f'Nodes: {len(prompt)}')

payload = json.dumps({'prompt': prompt, 'client_id': 'test'}).encode('utf-8')
request = urllib.request.Request(
    f"{endpoint}/prompt",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8", "replace")
        print(f"Status: {response.status} {body[:300]}")
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", "replace")
    print(f"Status: {exc.code} {body[:300]}")
```

Run with the same Python environment that runs Studio:

```powershell
# Windows packaged build
$env:SIMPAI_COMFY_ENDPOINT = "http://127.0.0.1:8187"
..\python_embeded\python.exe .\check_object_info.py
..\python_embeded\python.exe .\test_wf.py
```

```bash
# Linux or activated Conda/venv
export SIMPAI_COMFY_ENDPOINT=http://127.0.0.1:8187
python check_object_info.py
python test_wf.py
```

If Linux Conda is not activated, replace `python` with the env interpreter,
for example `/path/to/conda/env/bin/python`.

### 5. Restart & Test

Restart Studio through the entrypoint for the current package:

- Windows packaged build: use the package `.bat` launcher, or run the matching
  `entry_without_update.py` / `launch.py` command with `..\python_embeded\python.exe`.
- Linux server build: use its `start.sh`, service manager, or activated env
  command.

After restart, hard refresh the browser (Ctrl+Shift+R), switch to the new
preset, and generate.

## Creating a Scene Preset

For scene presets (canvas, input images, video/audio), model after `presets/Wan(T2V).json` or `presets/QwenEdit+.json`. Key differences:

1. Use `scene_frontend` block instead of `backend_params`
2. `task_method` inside `scene_frontend` maps theme names to workflow names
3. Workflow uses `SceneInput` node (33 outputs) instead of `GeneralInput`
4. Workflow filename starts with `scene_` prefix

SceneInput output mapping: 0=prompt, 1=additional_prompt, 6=width, 7=height, 8=cfg, 9=steps, 29=negative_prompt, 30=sampler, 31=scheduler.

SceneInput node definition: `comfy/custom_nodes/params_input.py:45-94`.

Scene-specific notes:

- Keep theme name, `task_method`, prompt defaults, and custom control defaults
  grouped by the same theme keys.
- Use `Additional Prompt` for the secondary scene prompt label; do not name it
  another `Prompt`.
- For Infinite Canvas scene templates, keep `runtime.scene_theme`,
  `runtime.task_method`, and `params.prompt` aligned with the default theme.
  `schema.per_theme.*.defaults.prompt` should contain the per-theme prompt text
  so Canvas theme changes can update the Preset node while leaving user-edited
  prompt text intact.
- Built-in Canvas templates must not connect `text` nodes to scene/classic
  generation nodes (`preset` or `classic`) via `prompt` or `negative_prompt`.
  Those text edges override theme defaults. Put default prompt text in the
  generation node `params`; scene multi-theme nodes can also use theme defaults.
- If a scene requires audio before generation, set the preset media policy such
  as `audio_policy: "required"` and let the UI block submission with a user
  message.
- Director/canvas templates need capability metadata in
  `javascript/canvas_workbench/templates/`, for example `director_supported`,
  `duration_strategy`, and `audio_output` when those flows apply.

### Structured Prompt Compilers

Use `scene_frontend.prompt_compiler` when a model requires a strict prompt
grammar that must be shared by Prompt Tools, Director, Infinite Canvas, and the
generation submit path. Keep creative content guidance in `agent_prompt`; do
not duplicate structural rules there.

MiniMax H3 uses these per-theme compiler ids:

- `minimax_h3_t2va` for text-to-video;
- `minimax_h3_frame_anchor` for one-image I2VA or two-image FL2VA;
- `minimax_h3_ref2va` for reference-to-video.

The shared implementation is `modules/minimax_h3_prompt_compiler.py`. Preset
Store copies the selected compiler into the Canvas schema. Prompt Tools may
compile after an explicit user action. Generation validates the final prompt
and blocks an invalid structure; it must not silently rewrite the prompt.

## Validation Checklist

Use the narrowest relevant checks for the target:

- For private user presets: save/load through Studio when possible, restart,
  confirm the preset still appears from the user directory with the trailing dot
  marker, and verify model paths resolve through the active `userhome/config.txt`
  and `../../SimpleModels` layout.
- For public presets: confirm the file is in `SimpAI_Studio/presets/`, appears
  without the trailing dot marker, and is treated as a shared source-tree asset.
- For workflow API JSON: confirm the file exists at
  `SimpAI_Studio/workflows/{task_method}_api.json`. A userhome-only workflow API
  file is not enough for the current loader path.
- For user Canvas templates written directly: confirm `source: "user"`,
  `path: "user:{id}"`, and assets under `canvas_workbench/assets`.

- Parse changed JSON files with `python -m json.tool`.
- Query `/object_info` from the target Comfy backend and confirm every
  `class_type` exists.
- Run the `convert2comfy()` test script above and submit once to `/prompt`
  against a real backend when possible.
- For scene workflows: `python -m pytest tests/test_scene_input_workflows.py -q`.
- For preset defaults and UI schema:
  `python -m pytest tests/test_preset_defaults_dry_run.py -q`.
- For Infinite Canvas templates:
  `python -m pytest tests/test_canvas_workbench_template_scene_slots.py -q`.
- For agent preset recommendations:
  `python -m pytest tests/test_canvas_vlm_agent_preset_guide_contract.py tests/test_describe_vlm_chat_contract.py -q`.
- For model path and backend launch contracts:
  `python -m pytest tests/test_comfyd_launch_args_contract.py tests/test_model_checker_paths.py -q`.
- For director-capable templates:
  `python -m pytest tests/test_scene_director_webui_contract.py tests/test_canvas_workbench_director.py tests/test_parameter_profiles.py -q`.
- If the preset affects VLM prompt routing or prompt skills, also run the
  focused VLM contract for that surface, such as
  `tests/test_canvas_vlm_agent_preset_guide_contract.py` or
  `tests/test_describe_vlm_chat_contract.py`.
- For MiniMax H3 prompt compilers:
  `python -m pytest tests/test_minimax_h3_prompt_compiler.py tests/test_vlm_prompt_actions.py -q`.

## Common Pitfalls

### 1. `prompt_no_outputs`
**Cause:** No `OUTPUT_NODE=True` node in workflow. `SaveImageWebsocketLazy` has `OUTPUT_NODE=False`.
**Fix:** Add a `PreviewImage` node.

### 2. Rust `convert2comfy` returns empty `{}`
**Cause:** Root directory not found. Rust uses `sys.argv[0]`'s dirname as root.
**Fix:** Run test from a `.py` file inside SimpAI_Studio, not `python -c`.

### 3. Missing `format` input on `SaveImageWebsocketLazy`
**Cause:** Node requires `format` field (`"PNG"`, `"JPEG"`, `"WEBP"`).
**Fix:** Add `"format": "JPEG"` to node inputs.

### 4. `topbar.py` KeyError after adding preset
**Cause:** Preset JSON missing required fields or has unexpected structure.
**Fix:** Ensure all fields match the Z-imageT template structure.

### 5. Model not found
**Cause:** `model_list` entry has wrong path or size.
**Format:** `"category,filename,size_bytes,0,download_url"` (download_url can be empty).

## Reference Files

| File | Purpose |
|---|---|
| `presets/Z-imageT.json` | Non-scene T2I preset template |
| `presets/Wan(T2V).json` | Scene video preset template |
| `presets/Playground.json` | Non-scene T2I preset (simplest) |
| `comfy/custom_nodes/params_input.py:13-31` | GeneralInput definition |
| `comfy/custom_nodes/params_input.py:45-94` | SceneInput definition |
| `comfy/custom_nodes/websocket_save.py:45-73` | SaveImageWebsocketLazy (OUTPUT_NODE=False) |
| `enhanced/comfy_task.py` | Task routing, mapping rules |
| `enhanced/topbar.py` | Preset scanning, scene schema builder |
| `modules/async_worker.py:2341-2375` | Parameter assembly for Comfy tasks |
| `{active Python env}/site-packages/simpleai_base/comfyclient_pipeline.py` | process_flow, queue_prompt, get_images |
| `{active Python env}/site-packages/simpleai_base/params_mapper.py` | ComfyTaskParams Python wrapper |

## Creative Agent Capability Contract

A Preset can work in the main UI and still be unavailable to VLM Chat or Canvas
Director. Built-in Presets must expose machine-readable capability data that
matches the workflow they actually execute.

### Responsibility Boundary

The VLM identifies the task and writes the executable prompt. Studio selects and
validates the Preset, theme, `task_method`, media slots, interaction
requirements, parameter profile, and model readiness.

Do not put routing policy into `agent_prompt` or `multimodal_prompt`. Those
fields rewrite prompts after a workflow is selected. Routing comes from the
Preset schema and the application priority tables.

### Supported Tasks

Every built-in `presets/*.json` must have a non-empty top-level
`supported_tasks` array. New built-in Presets must not depend on name-based
inference; inference in `modules/config.py` is compatibility behavior for older
user Presets.

Common image task ids are:

- generation/edit: `text_to_image`, `image_edit`, `multi_image_edit`;
- automatic enhancement: `image_detail_enhance`;
- specialized editing: `image_upscale`, `image_restore`,
  `image_background_removal`, `image_object_removal`, `image_object_transfer`,
  `image_outpaint`, `image_relight`, `image_style_transfer`,
  `image_face_swap`, `image_pose_transfer`, `image_pose_extraction`,
  `image_anime_to_real`, `image_view_synthesis`, `image_depth_estimation`, and
  `image_expression_transfer`.

Video and audio task ids are validated by
`tests/test_preset_supported_tasks_contract.py`. Use the ids already present in
that contract rather than creating a synonym in one Preset.

Declare only complete executable routes. A model family being theoretically
capable is not enough. A partial graph, hidden required input, missing output,
or UI-only control must not be advertised.

```json
{
  "supported_tasks": [
    "image_edit",
    "multi_image_edit",
    "image_object_transfer"
  ]
}
```

### Interaction Requirements

Use top-level `interaction_requirements` only when the workflow cannot start
from the prompt and attached media:

```json
{
  "supported_tasks": ["image_object_transfer"],
  "interaction_requirements": ["mask"]
}
```

Keep requirement ids in lowercase `snake_case`. Do not declare `mask` when a
painted mask is optional. Automatic AIO routes must be preferred to routes that
require manual painting.

### Scene Themes And Labels

When every Scene theme supports the same tasks, top-level `supported_tasks` is
enough. When themes implement different specialized routes, add
`scene_frontend.theme_supported_tasks`.

- Keys in `theme_supported_tasks` must exist in `scene_frontend.theme`.
- Its task ids must also appear in the Preset-wide `supported_tasks` union.
- `theme`, `task_method`, `prompt`, `agent_prompt`, defaults, and other
  per-theme dictionaries must use the same internal keys.
- Keep internal `theme` and `theme_title` keys in English.
- Put bilingual display names in `theme_labels` with non-empty `en` and `zh`.
- Frontend-visible text must select language from `state.__lang`.

```json
{
  "theme": ["General Edit", "Object insertion"],
  "theme_labels": {
    "General Edit": {"en": "General edit", "zh": "通用编辑"},
    "Object insertion": {"en": "Insert an object", "zh": "插入物体"}
  },
  "task_method": {
    "General Edit": "general_edit_cn",
    "Object insertion": "object_insert_cn"
  },
  "theme_supported_tasks": {
    "Object insertion": ["image_object_transfer"]
  }
}
```

### Media Slots And Counts

Creative mode reads Scene image inputs in this order:

1. `scene_canvas_image`
2. `scene_input_image1`
3. `scene_input_image2`
4. `scene_input_image3`
5. `scene_input_image4`

A slot in `scene_frontend.disvisible` is unavailable. Specialized image-input
tasks require at least one image; tasks in the multi-image set require at least
two. `director_capability.min_images` and `max_images` may narrow the visible
slot count but cannot create slots that the UI does not expose.

For identity or feature transfer, document image roles and keep binding order
unambiguous. For example, automatic face swap uses target/base first and the
source identity image second.

### Classic AIO Enhance

Declare `image_detail_enhance` only for a non-Scene Preset whose real local AIO
workflow performs automatic face, hand, or eye enhancement.

The workflow must contain `GeneralInput` and one complete implementation:

- modern: `SimpAIAIOEnhanceUOVConfig` plus a
  `SimpAIAIOImproveDetail*` node;
- legacy: `EnhanceUovInput` plus at least three `EnhanceRegionInput` nodes.

The Creative capability uses `enhance_image`,
`task_modes.image_detail_enhance = "enhance"`, and targets limited to `face`,
`hand`, and `eye`. Do not add the task for a half-built workflow that merely
contains an Enhance control or one incomplete region chain.

### Specialized Route Registration

Adding a specialized task to a Preset is only the first step. Keep route
selection synchronized in:

- server priorities: `GENERATION_PRESET_PRIORITIES` in
  `modules/describe_vlm_chat.py`;
- browser rebuild priorities: `taskPriorities` in
  `javascript/describe_vlm_chat.js`;
- Preset task declarations and capability tests.

Place complete automatic workflows before manual interaction workflows. For
clothing transfer, the current automatic family order is Qwen Edit (including
its Nunchaku variants), Flux2 Klein Edit, Krea2 Image Edit, Bernini Image Edit,
then OneKeyKontext. `Swap+` and its Nunchaku variants require a painted mask and
remain after the automatic routes.

Explicit Preset names and product-family aliases are resolved by Studio against
the live capability catalog. A model-provided hint is not trusted unless the
latest user message explicitly names that Preset or family.

### Prompt Language

The actual text encoder determines prompt language behavior:

- use a `_cn` `task_method` only when the workflow accepts Chinese directly;
- multilingual Qwen, UMT5, and Qwen3-VL encoders may keep Chinese requests in
  Chinese;
- older English-only CLIP or workflow-specific FLUX/T5 contracts should use an
  English-target route;
- do not infer prompt language from the Preset brand alone.

Keep this aligned with the earlier workflow naming section and verify the
encoder nodes in the imported API JSON.

### Capability Validation

For every new or changed built-in Preset:

```powershell
python -m json.tool presets\MyPreset.json > $null
python -m pytest tests\test_preset_supported_tasks_contract.py -q
python -m pytest tests\test_describe_vlm_chat_contract.py -q
node --check javascript\describe_vlm_chat.js
```

Also inspect the generated catalog and confirm:

- `supported_tasks` matches the real workflow;
- media slots and input counts match visible controls;
- theme routes resolve to the intended `task_method`;
- required interactions are accurate;
- bilingual labels follow `state.__lang`;
- automatic and manual route priorities agree between server and browser.
