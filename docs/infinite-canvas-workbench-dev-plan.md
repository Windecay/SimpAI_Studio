# Infinite Canvas Workbench 开发规划

本文档规划把现有“图片中转站”升级为无限画布工作台。新的方向是：**每一个 preset 都可以成为画布里的一个可运行节点**，节点内部展示并保存该 preset 原本呈现给用户的参数；节点之间的连线表示“把上游图片上传到下游 preset 的某个输入槽”；节点运行后直接进入后端 `AsyncTask` 队列，并立刻在画布上生成一个结果占位节点，用来展示排队、步数、百分比、生成预览和最终结果。

这意味着无限画布不是当前 Web UI 的一个快捷浮窗，而是一个独立的任务编排层。它可以读取 preset 定义和复用现有后端能力，但运行时不依赖当前页面选中的 preset、当前可见输入组件或当前全局 UI 状态。

## 1. 核心结论

### 1.1 产品模型

- 图片节点：代表用户导入、粘贴、历史输出或已经完成的生成结果图片。
- Preset 节点：代表一个完整 preset。节点内显示该 preset 原本给用户使用的参数。
- 连线：代表 upload 操作，即把一个图片节点绑定到 preset 节点的某个输入槽。
- 运行：点击 preset 节点 Run 后，由后端根据节点自己的 preset snapshot、参数值和输入连线直接创建 `worker.AsyncTask` 并入队。
- 输出占位节点：Run 触发时立即创建，先显示 pending/running 状态、步数、百分比和预览；任务完成后同一个节点转为最终图片/视频结果，并保留运行记录、输出路径和 Regen manifest。

### 1.2 架构原则

- 不依赖当前激活 preset 状态。
- 不通过向当前 Gradio 输入框写文件再点击 Generate 来运行。
- 不把所有画布逻辑塞进 `javascript/status_monitor.js`。
- 不重写 Comfy / task method 后端，优先复用现有 `AsyncTask`、`modules.async_worker`、preset parser、Resolution preprocessing 和 Regen manifest。
- Preset 节点应保存自己的参数快照；全局 UI 后续变化不能影响已经放在画布上的节点，除非用户主动刷新节点定义。

## 2. 当前基础

当前“图片中转站”位于 `javascript/status_monitor.js`，通过 `modules/ui_gradio_extensions.py` 注入到 Gradio 页面。它已经具备适合作为画布入口的能力：

- 图片 `Blob/File/dataUrl/url` 导入、缩略图生成、粘贴、拖放、清空、选择。
- `BroadcastChannel('simpleai-transfer-station-v1')` 跨标签同步。
- 可将中转图片转为 `File`，已有 `DataTransfer` 写入文件输入的工具逻辑。
- 已有 LayerForge iframe 拖放绕行判断，可复用其事件边界经验。

后端侧现状：

- `webui.py::get_task_with_resolution_multiplier()` 当前通过 `api_params.normalization(...)` 把 UI 参数归一化，再构造 `worker.AsyncTask(args=args)`。
- `webui.py::generate_clicked()` 当前负责 UI 生成按钮路径：调用 `worker.add_task(task)`，轮询 `task.yields/task.results`，再把进度和结果映射回 Gradio 组件。
- `modules.async_worker.AsyncTask` 仍是位置参数构造方式；真正影响后端工作流的是 `params_backend` 中的 `backend_engine`、`preset`、`task_method`、`scene_frontend`、`scene_input_image1/2`、`scene_canvas_image` 等字段。
- `enhanced.topbar.process_before_generation()` 负责把 scene UI 值装配成后端参数，并注入 Regen manifest。

画布后端化的关键不是新造一条生成链，而是新增：

```text
canvas preset node payload
-> 前端立即创建 result placeholder node
-> 参数归一化 / 上传输入解析 / preset defaults 补齐
-> AsyncTask args 构建
-> worker.add_task(task)
-> run registry 轮询 task.yields/task.results
-> 持续更新占位节点进度 / 预览 / 状态
-> 完成时把占位节点固化为输出节点
```

## 3. 文件拆分建议

### 3.1 前端

- `javascript/status_monitor.js`
  - 保留状态监控和轻量图片中转站。
  - 增加“打开画布工作台”入口。
  - 暴露 `window.SimpAITransferStation`，供画布读取中转图片。
- `javascript/infinite_canvas_workbench.js`
  - 新画布控件主体。
  - 管理画布视口、节点、连线、参数面板、运行状态、项目保存。
- `css/infinite_canvas_workbench.css`
  - 独立样式，避免继续膨胀 `css/style.css`。

### 3.2 后端

- `ui/layout/canvas_workbench.py`
  - 声明隐藏 bridge 组件或轻量入口组件。
- `ui/events/canvas_workbench.py`
  - 绑定画布项目保存、preset catalog 查询、asset 上传、节点运行、运行轮询、停止/跳过等事件。
- `ui/services/canvas_workbench.py`
  - 核心服务层：
    - preset catalog 解析。
    - preset 节点 schema 生成。
    - 节点 payload 到 `AsyncTask` args 的转换。
    - 运行注册表和结果读取。
- `modules/canvas_workbench_project.py`
  - 项目文件保存/读取。
  - 默认保存到用户目录下的 `canvas_workbench/projects/`。
- `modules/canvas_workbench_assets.py`
  - 浏览器上传资源、输出资源引用、临时文件清理、缩略图生成。

## 4. 数据模型

### 4.1 项目结构

```json
{
  "schema": "simpai.canvas.workbench.v1",
  "title": "Untitled Canvas",
  "created_at": "2026-04-30T00:00:00Z",
  "updated_at": "2026-04-30T00:00:00Z",
  "viewport": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "nodes": [],
  "edges": [],
  "runs": []
}
```

### 4.2 图片节点

```json
{
  "id": "img_001",
  "type": "image",
  "x": 120,
  "y": 80,
  "w": 220,
  "h": 220,
  "title": "input.png",
  "asset": {
    "kind": "browser_upload",
    "asset_id": "asset_001",
    "mime": "image/png",
    "width": 1024,
    "height": 1024,
    "thumb": "data:image/jpeg;base64,..."
  },
  "source": {
    "kind": "imported",
    "output_path": null,
    "regen_manifest": null
  }
}
```

`asset.kind` 建议支持：

- `browser_upload`: 从浏览器导入，原图先存 IndexedDB，运行时上传到后端 asset service。
- `output_file`: 来自生成输出，只保存受控输出引用。
- `temp_backend_file`: 当前会话上传到后端的临时文件。

### 4.3 Preset 节点

Preset 节点是画布的核心。它不是“当前 preset 的快捷方式”，而是一份自包含的可运行任务定义。

```json
{
  "id": "preset_001",
  "type": "preset",
  "x": 520,
  "y": 120,
  "w": 360,
  "h": 480,
  "title": "QwenEdit+",
  "preset": {
    "name": "QwenEdit+.json",
    "display_name": "Qwen Edit",
    "snapshot_hash": "sha256:...",
    "snapshot": {}
  },
  "runtime": {
    "backend_engine": "Qwen",
    "engine_type": "image",
    "scene_frontend": "m1.1",
    "scene_theme": "Edit-2511-1024px",
    "task_method": "scene_qwen_editplus_cn"
  },
  "upload_slots": {
    "scene_input_image1": null,
    "scene_input_image2": null,
    "scene_canvas_image": null
  },
  "params": {
    "prompt": "",
    "negative_prompt": "",
    "scene_additional_prompt": "",
    "scene_steps": 8,
    "scene_image_number": 1,
    "resolution": {
      "scene_aspect_ratio": "1024|1:1",
      "overwrite_width": 1024,
      "overwrite_height": 1024,
      "resolution_multiplier": 1.0,
      "resolution_quantize_step": 8,
      "resolution_edit_mode": "scale"
    },
    "models": {},
    "loras": [],
    "advanced": {}
  },
  "status": "idle"
}
```

### 4.4 连线

```json
{
  "id": "edge_001",
  "type": "upload",
  "from": "img_001",
  "to": "preset_001",
  "slot": "scene_input_image1"
}
```

连线语义：

- `from` 必须是图片/视频/音频等资产节点。
- `to` 必须是 preset 节点。
- `slot` 是 preset 节点暴露的 upload 槽。
- 运行时，连线被解析成“把上游资产注入到下游 payload 对应字段”。

第一阶段支持：

- `scene_input_image1`
- `scene_input_image2`
- `scene_canvas_image`

第二阶段扩展：

- `scene_video`
- `scene_audio`
- `sam3_input_video`
- `sam3_mask_video`

### 4.5 结果占位节点与运行记录

结果节点不是任务完成后才创建。点击 preset 节点 Run 时，前端应先在画布上创建一个 `result_placeholder` 节点，并立即从 preset 节点连出一条生成边。这个节点在任务生命周期内逐步变化：

```text
queued -> running -> previewing -> finishing -> finished
                 \-> failed / canceled / skipped
```

占位节点的数据形态：

```json
{
  "id": "result_001",
  "type": "result",
  "x": 960,
  "y": 140,
  "w": 220,
  "h": 220,
  "title": "Generating...",
  "producer": {
    "preset_node_id": "preset_001",
    "run_id": "run_001",
    "task_id": "async-task-uuid"
  },
  "status": {
    "state": "running",
    "queue_position": 1,
    "step": 8,
    "total_steps": 28,
    "percent": 0.29,
    "message": "Sampling 8/28"
  },
  "preview": {
    "kind": "image",
    "data_url": "data:image/jpeg;base64,...",
    "updated_at": "2026-04-30T00:00:20Z"
  },
  "asset": null,
  "source": {
    "kind": "generated",
    "output_path": null,
    "regen_manifest": null
  }
}
```

完成后不再创建另一个新节点，而是把同一个节点更新为：

```json
{
  "id": "result_001",
  "type": "result",
  "title": "example.png",
  "status": {
    "state": "finished",
    "step": 28,
    "total_steps": 28,
    "percent": 1,
    "message": "Finished"
  },
  "preview": null,
  "asset": {
    "kind": "output_file",
    "path": "outputs/ComfyUI/260430/example.png",
    "mime": "image/png",
    "thumb": "data:image/jpeg;base64,..."
  },
  "source": {
    "kind": "generated",
    "output_path": "outputs/ComfyUI/260430/example.png",
    "regen_manifest": {}
  }
}
```

运行记录记录任务和占位节点的绑定关系：

```json
{
  "id": "run_001",
  "preset_node_id": "preset_001",
  "placeholder_node_id": "result_001",
  "task_id": "async-task-uuid",
  "status": "finished",
  "started_at": "2026-04-30T00:00:00Z",
  "finished_at": "2026-04-30T00:01:00Z",
  "progress": {
    "step": 28,
    "total_steps": 28,
    "percent": 1,
    "last_preview_at": "2026-04-30T00:00:40Z"
  },
  "output": {
    "node_id": "result_001",
    "path": "outputs/ComfyUI/260430/example.png",
    "thumb": "data:image/jpeg;base64,...",
    "regen_manifest": {}
  },
  "extra_outputs": [
    {
      "node_id": "result_001_b",
      "path": "outputs/ComfyUI/260430/example_2.png"
    }
  ]
}
```

占位节点应在创建时自动连回产生它的 preset 节点，形成可读的版本链。若一次任务产生多张结果，第一张复用原占位节点，其余结果可以在完成时追加 sibling result 节点，或在占位节点内显示一个 result stack。第一版建议：第一张占位固化，其余追加 sibling 节点。

## 5. Preset 节点 schema

每个 preset 节点应由后端生成 schema，而不是前端猜字段。

### 5.1 Catalog 接口

建议新增 `canvas_list_presets`：

```json
{
  "presets": [
    {
      "name": "QwenEdit+.json",
      "title": "Qwen Edit",
      "backend_engine": "Qwen",
      "engine_type": "image",
      "is_scene": true,
      "themes": [
        {
          "name": "Edit-2511-1024px",
          "task_method": "scene_qwen_editplus_cn",
          "title": "Qwen-Edit-2511 Image Editing [Optional mask]"
        }
      ],
      "upload_slots": [
        {
          "name": "scene_input_image1",
          "type": "image",
          "required": true,
          "label": "Image 1"
        }
      ],
      "params_schema": []
    }
  ]
}
```

### 5.2 参数来源

Preset 节点内显示的参数来自：

- preset JSON 根部默认值：模型、LoRA、style、resolution、steps、prompt 等。
- `default_engine.backend_params`。
- `default_engine.scene_frontend`。
- `scene_frontend.theme` 和 theme-specific 字段。
- `disvisible/disinteractive`：决定节点参数是否显示或禁用。
- `resolution_control`：生成 Resolution 子面板 schema。

### 5.3 参数显示策略

节点卡片内只显示高频参数：

- 输入槽状态。
- theme / task method。
- prompt / additional prompt。
- Resolution 摘要。
- Run / Stop / status。

完整参数放在 Inspector：

- Models。
- LoRA。
- Scene variable numbers。
- Scene switch options。
- Steps / image number。
- Resolution。
- Advanced flags。

这样节点不会变成巨型表单，也保留“preset 参数都在节点里”的目标。

## 6. 后端运行设计

### 6.1 不走当前 UI 生成链

画布运行不调用当前页面 Generate 按钮，不写当前页面 upload 组件，不读取当前 `state_topbar` 的 preset 选择作为任务来源。

当前 UI 生成链仍可保留：

```text
Generate button
-> topbar.process_before_generation()
-> get_task_with_resolution_multiplier()
-> generate_clicked()
-> worker.add_task()
```

画布新增一条并行后端链：

```text
canvas_create_result_placeholder(preset_node_id, provisional_run_id)
-> canvas_run_node(payload + placeholder_node_id)
-> canvas_workbench.build_task_args(payload)
-> worker.AsyncTask(args=args)
-> worker.add_task(task)
-> CanvasRunRegistry stores task + placeholder_node_id
-> canvas_poll_run(run_id)
-> canvas_update_result_placeholder(progress/preview/status)
-> canvas_finalize_result_placeholder(output refs / manifest)
```

占位节点应由前端在用户点击 Run 的同一交互里先创建，带一个 provisional `run_id` 和 `placeholder_node_id`。`canvas_run_node` 接收这个 `placeholder_node_id`，成功入队后返回正式 `run_id/task_id` 并更新同一个占位节点；如果后端参数构建或入队失败，也在同一个占位节点上显示 `failed` 状态，而不是悄悄消失。

### 6.2 AsyncTask args 构建器

当前 `AsyncTask` 使用位置参数，因此需要一个稳定构建器：

```python
def build_canvas_async_task(payload, user_context):
    args_map = build_default_args_map(payload.preset_snapshot)
    apply_node_params(args_map, payload.params)
    apply_upload_edges(args_map, payload.resolved_assets)
    backend_params = build_backend_params(payload, user_context)
    args_map["params_backend"] = backend_params
    args = args_from_api_params_order(args_map)
    args = api_params.normalization(
        args,
        modules.config.default_max_lora_number,
        modules.config.default_controlnet_image_count,
        modules.config.default_enhance_tabs,
    )
    return worker.AsyncTask(args=args)
```

关键要求：

- 不手写魔法下标。
- 以 `simpleai_base.api_params.all_args` 或现有 normalization 协议为准。
- 缺失参数必须从 preset defaults 或系统 defaults 补齐。
- `params_backend` 必须包含 `nickname`、`user_did`、`preset`、`engine_type`、`backend_engine`、`task_method`。

### 6.3 Scene 后端参数装配

`topbar.process_before_generation()` 目前既做 UI 更新，又做 scene 参数装配。画布需要把其中的纯业务部分抽出来：

```python
def build_scene_backend_params_from_node(
    state_params,
    node_params,
    resolved_assets,
    resolution_values,
):
    ...
```

该函数应负责：

- 根据 preset snapshot 和 theme 解析 `scene_frontend`。
- 写入 `task_method=f"scene_{raw_task_method}"`。
- 写入 `scene_frontend=version`。
- 写入 `scene_input_image1/2`、`scene_canvas_image`、`video`、`audio` 等输入。
- 应用 Resolution preprocessing。
- 应用 scene aspect ratio 映射。
- 构建 Regen manifest。

普通 Generate 链后续也可以复用这个函数，逐步减少 `process_before_generation()` 的职责。

### 6.4 Asset 上传与连线解析

运行前，前端只提交 asset id 和连线关系，不提交超大 dataUrl。

推荐流程：

1. 图片节点导入后存浏览器 IndexedDB。
2. 用户点击 Run。
3. 前端检查所有必需 upload slot 是否有连线。
4. 前端把本次运行需要的资产上传到后端，获得 `asset_ref`。
5. payload 中的 edge 只引用 `asset_ref`。
6. 后端将 `asset_ref` 解码为 numpy/PIL/path，并写入对应 `params_backend` 或 args slot。

### 6.5 运行注册表

新增 `CanvasRunRegistry`：

- `run_id -> task`
- `task_id -> run_id`
- `run_id -> preset_node_id`
- `run_id -> placeholder_node_id`
- `run_id -> started_at/status/progress/output_refs`

轮询接口读取：

- `task.processing`
- `task.yields`
- `task.results`
- `worker.get_processing_id()`
- `worker.get_task_size()`

不要复用 `generate_clicked()` 直接 yield Gradio UI，因为它输出的是 Gradio 组件更新，不适合作为画布 API。画布需要把 `task.yields` 转换成结构化状态：

```json
{
  "run_id": "run_001",
  "placeholder_node_id": "result_001",
  "state": "running",
  "queue_position": 0,
  "step": 8,
  "total_steps": 28,
  "percent": 0.29,
  "message": "Sampling 8/28",
  "preview": {
    "kind": "image",
    "data_url": "data:image/jpeg;base64,..."
  },
  "final_output": null
}
```

完成时返回：

```json
{
  "run_id": "run_001",
  "placeholder_node_id": "result_001",
  "state": "finished",
  "percent": 1,
  "preview": null,
  "final_output": {
    "path": "outputs/ComfyUI/260430/example.png",
    "thumb": "data:image/jpeg;base64,...",
    "regen_manifest": {}
  }
}
```

前端只做一件事：用这个结构化状态更新同一个占位节点。

### 6.6 停止与跳过

画布需要后端接口：

- `canvas_stop_run(run_id)`
- `canvas_skip_run(run_id)`

内部可复用当前任务对象上的 `last_stop` / `user_cancel_action` 机制，或调用已有停止逻辑。具体实现时需要对照 `stop_clicked()`、`skip_clicked()`。

## 7. 开发路线

### P0. 文档与接口边界

- 确认每个 preset 都是可实例化节点。
- 确认连线语义为 upload slot binding。
- 确认运行不依赖当前 preset 状态。
- 确认第一阶段后端运行直接进入 `worker.AsyncTask`。

验收：

- 本文档与后续任务拆分一致。

### P1. 中转站 API 化与画布外壳

目标：保留现有中转站行为，同时增加画布入口。

改动：

- `status_monitor.js` 暴露 `window.SimpAITransferStation`：
  - `addBlob(blob, name)`
  - `getSelected()`
  - `getItem(id)`
  - `list()`
  - `subscribe(listener)`
  - `open()`
- 新增 `javascript/infinite_canvas_workbench.js`。
- 新增 `css/infinite_canvas_workbench.css`。
- `modules/ui_gradio_extensions.py` 注入新 JS/CSS。

验收：

- 原中转站粘贴、拖放、清空、跨标签同步不回归。
- 画布能打开、关闭、缩放、平移。
- 能把中转站图片拖入画布生成图片节点。

### P2. Preset catalog 与节点 schema

目标：后端向前端输出所有可用 preset 节点定义。

改动：

- 新增 `ui/services/canvas_workbench.py::list_preset_nodes()`。
- 解析 `presets/*.json` 和用户 preset。
- 输出 preset 节点 schema：
  - title。
  - backend engine。
  - engine type。
  - themes。
  - task methods。
  - upload slots。
  - params schema。
  - defaults。

验收：

- 画布左侧能列出所有 preset。
- 拖一个 preset 到画布即可生成 preset 节点。
- 节点显示该 preset 的主题、输入槽和主要参数。

### P3. 节点参数面板与连线

目标：让 preset 节点真正自包含。

改动：

- 图片节点、preset 节点、结果占位/结果节点三类节点。
- 连线 editor：图片节点拖线到 preset upload slot。
- Inspector 展示完整 preset 参数。
- 参数修改写入节点自己的 `params`，不写全局 UI。

验收：

- 同一个 preset 可在画布上放多个节点，每个节点参数不同。
- 修改一个节点不影响另一个节点，也不影响当前页面 UI。
- 连线能准确绑定到 `scene_input_image1/2`。

### P4. 后端资产与项目保存

目标：支持刷新后继续编辑，并为后端运行准备资产。

改动：

- IndexedDB 保存浏览器导入资产。
- 后端 asset service 保存运行需要的临时上传。
- `modules/canvas_workbench_project.py` 保存项目 JSON。
- 输出文件节点记录受控输出路径，不复制输出原图。

验收：

- 页面刷新后恢复项目。
- 已导入图片仍能用于运行。
- 输出节点保留输出路径和缩略图。

### P5. Direct AsyncTask Runner

目标：preset 节点直接进入后端任务队列，并在运行开始时立刻创建结果占位节点。

改动：

- 新增 `canvas_run_node(payload)`。
- 新增 `build_canvas_async_task(payload, user_context)`。
- 新增 `CanvasRunRegistry`。
- 新增 `canvas_poll_run(run_id)`。
- 新增 `canvas_create_result_placeholder(...)` / `canvas_update_result_placeholder(...)` / `canvas_finalize_result_placeholder(...)` 前端状态动作。
- 抽出 scene backend params 构建函数，供画布运行使用。

验收：

- 当前 UI 选中 `default.json` 时，也能运行画布里的 `QwenEdit+.json` 节点。
- 不需要切换全局 preset。
- 不需要向 Gradio upload 组件写入文件。
- 任务进入 `modules.async_worker.async_tasks` 队列。
- 点击 Run 后立即出现结果占位节点，显示 queued/running 状态。
- 采样过程中占位节点更新步数、百分比、状态消息和预览图。
- 任务完成后同一个占位节点变成最终结果节点，不额外替换用户正在看的节点。

### P6. Regen manifest 与结果追踪

目标：占位节点固化后的结果可解释、可恢复、可继续编辑。

改动：

- 结果节点记录：
  - 输出路径。
  - backend engine。
  - task method。
  - preset node id。
  - run id / async task id。
  - Regen manifest。
- 支持从结果节点创建新的图片输入节点。
- 支持从结果节点恢复原 preset 节点参数。

验收：

- 结果节点能继续连到另一个 preset 节点。
- 有 manifest 的旧输出能恢复为一个 preset 节点。

### P7. 视频、mask 和高级编排

后续扩展：

- 视频节点。
- 音频节点。
- `scene_canvas_image` 的 image+mask 复合输入。
- LayerForge / custom sketch 双击编辑。
- 批量运行。
- 分支版本树。
- 输出 gallery 直接拖入画布。

## 8. 技术风险与规避

### 8.1 AsyncTask 位置参数脆弱

风险：`AsyncTask` 依赖位置参数，手工拼列表容易错位。

规避：

- 必须用 `api_params.all_args` / normalization 协议构建。
- 新增单测验证关键 preset 的 args 映射。
- 禁止在画布服务里硬编码长下标。

### 8.2 process\_before\_generation 职责过重

风险：它混合 UI 更新、scene 业务、Resolution preprocessing、manifest 构建，画布不能直接调用整函数。

规避：

- 抽出纯业务函数。
- 普通 Generate 和画布 runner 共用纯业务函数。
- `process_before_generation()` 保留 UI update 包装职责。

### 8.3 资产生命周期

风险：浏览器大图、后端临时文件和输出文件引用容易混乱。

规避：

- 导入资产、临时运行资产、输出资产分三类。
- 项目 JSON 只保存 asset refs，不内嵌大图 dataUrl。
- 临时资产按 run/project 引用计数或定期清理。

### 8.4 队列与 UI 生成并发

风险：画布任务和普通 Generate 共用 worker 队列，停止/跳过/进度显示可能互相影响。

规避：

- 画布 runner 独立 run registry。
- 停止/跳过只作用于指定 run\_id/task\_id。
- 画布状态栏显示全局队列信息，但不强行更新当前 Gradio result UI。

### 8.5 Preset schema 演进

风险：preset JSON 字段很多，且有 theme-specific 值、隐藏/禁用规则和历史兼容。

规避：

- 第一版只覆盖 scene 图片编辑类 preset。
- Catalog 输出 raw preset snapshot hash。
- 节点保存 snapshot，避免 preset 文件更新后旧项目不可解释。
- 提供“刷新节点到最新 preset 定义”动作。

## 9. 首批验收场景

1. Preset 节点创建：
   - 左侧列出所有 preset。
   - 拖入 `QwenEdit+.json` 生成一个 preset 节点。
   - 节点内显示 theme、task method、upload slot 和主要参数。
2. 独立参数：
   - 同时放两个 `QwenEdit+.json` 节点。
   - 修改各自 prompt / Resolution。
   - 两个节点互不影响。
3. 连线上传：
   - 图片节点连接到 `scene_input_image1`。
   - 另一张图片连接到 `scene_input_image2`。
   - 运行 payload 能正确解析两个 upload slot。
4. 后端运行：
   - 当前页面保持任意 preset。
   - 运行画布中的 Qwen Edit 节点。
   - 任务直接进入 `AsyncTask` 队列。
   - Run 后立即出现结果占位节点。
   - 占位节点持续显示队列、步数、百分比和生成预览。
   - 完成后占位节点变成最终小图。
5. 继续编辑：
   - 结果小图连到第二个 preset 节点。
   - 第二个节点运行后生成下一代结果。

## 10. 第一轮任务清单

建议第一轮就按后端化目标铺路，但先不一次性覆盖所有 preset：

1. 新增画布 JS/CSS 外壳和中转站 API。
2. 新增 preset catalog service，先覆盖 scene 图片 preset。
3. 实现图片节点、preset 节点、连线和 Inspector。
4. 实现项目 JSON 保存/恢复。
5. 新增 asset upload service。
6. 实现 `canvas_run_node` 的最小 Direct AsyncTask Runner。
7. 用 `QwenEdit+.json` 或 `Imagerepair+.json` 跑通闭环。

## 11. 无限画布交互设计参考

### 11.1 可借鉴的成熟模式

参考方向：

- FigJam/Figma 的画布导航模式：明确区分 Select 和 Hand，支持按住 Space 临时平移，提供 Zoom to fit / Zoom to selection 等视图命令。
- Miro 的画布控制条：底右集中放置缩放、小地图、适配屏幕、全屏等导航能力，同时提供鼠标/触控板导航偏好。
- tldraw 的菜单体系：主菜单、右键菜单、工具栏、动作菜单、帮助菜单、快捷键面板、导航面板、样式面板、缩放菜单分层清楚，适合做可扩展工作台。

参考链接：

- FigJam pan/zoom: <https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam>
- Miro mouse/trackpad/touch navigation: <https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen>
- Miro toolbar/navigation controls: <https://help.miro.com/hc/en-us/articles/360017730553-Toolbars>
- tldraw menus: <https://tldraw.dev/examples/custom-menus>
- tldraw actions/shortcuts: <https://tldraw.dev/sdk-features/actions>
- tldraw accessibility preferences: <https://tldraw.dev/sdk-features/accessibility>

### 11.2 SimpAI 画布主控件布局

建议采用固定四区布局：

- 左上：项目栏
  - 项目名。
  - 保存。
  - 另存。
  - 打开项目。
  - 导入资源。
  - 导出项目。
  - 设置。
  - 关闭工作台。
- 左侧：创建工具栏
  - Select。
  - Hand / Pan。
  - Add Image。
  - Add Preset Node。
  - Connect。
  - Frame / Group。
  - Comment / Note，后置。
- 右侧：Inspector
  - 选中图片节点：预览、尺寸、来源、替换资源、发送到中转站。
  - 选中 preset 节点：theme、upload slots、prompt、Resolution、Models、LoRA、Advanced。
  - 选中结果占位节点：run id、task id、状态、步数、百分比、预览、日志、停止/跳过。
  - 选中连线：from、to、slot、重新绑定、断开。
- 右下：导航控制条
  - Zoom out。
  - Zoom percentage。
  - Zoom in。
  - Fit all。
  - Fit selection。
  - Center / Home。
  - Minimap toggle。
  - Fullscreen。

### 11.3 必备按钮

第一版建议必须具备：

- 画布级：
  - Save Project。
  - Undo / Redo。
  - Clear Canvas。
  - Import Images。
  - Add Preset。
  - Command Palette。
  - Settings。
- 视图级：
  - Zoom In。
  - Zoom Out。
  - Reset Zoom 100%。
  - Fit All。
  - Fit Selection。
  - Center Origin / Home。
  - Toggle Minimap。
  - Toggle Grid。
- 节点级：
  - Run preset node。
  - Stop / Skip running node。
  - Duplicate node。
  - Delete node。
  - Lock node。
  - Open Inspector。
  - Refresh preset schema。
  - Reset node params。
- 连线级：
  - Rebind slot。
  - Disconnect。
  - Delete edge。

### 11.4 右键菜单

空白画布右键：

- Paste image。
- Add Preset Node here。
- Add Image here。
- Add Note。
- Fit all。
- Center view here。
- Toggle grid。
- Clear canvas。
- Canvas settings。

图片节点右键：

- Preview large。
- Use as input to selected preset。
- Send to transfer station。
- Replace image。
- Copy image。
- Export image。
- Duplicate。
- Lock。
- Delete node。
- Delete source file，单独危险操作，默认不显示或二次确认。

Preset 节点右键：

- Run。
- Run with new placeholder。
- Stop / Skip，运行中显示。
- Duplicate preset node。
- Reset params to preset defaults。
- Refresh schema from latest preset。
- Disconnect all inputs。
- Open logs。
- Open Inspector。
- Delete node。

结果占位节点右键：

- Pin preview。
- Stop / Skip。
- Retry from same params，失败后显示。
- Convert to image input，完成后显示。
- Open output in gallery，完成后显示。
- Open output folder，本地访问时显示。
- Copy output path。
- Delete node。
- Delete output file，单独危险操作，二次确认。

连线右键：

- Rebind to another slot。
- Disconnect。
- Insert preset node between。
- Highlight source and target。
- Delete edge。

多选右键：

- Group。
- Ungroup。
- Align left / center / right。
- Align top / middle / bottom。
- Distribute horizontal / vertical。
- Duplicate。
- Lock / Unlock。
- Delete selection。

### 11.5 设置项

画布设置建议包括：

- Navigation
  - Mouse mode / Trackpad mode。
  - Scroll wheel zoom。
  - Right-drag to pan。
  - Space-drag to pan。
  - Invert wheel direction。
- View
  - Grid on/off。
  - Snap to grid。
  - Show minimap。
  - Show edge labels。
  - Show node status badges。
  - Reduced motion。
- Run
  - Placeholder position: right of preset / below preset / nearest free space。
  - Preview update interval。
  - Max live previews retained。
  - Multi-output strategy: first placeholder + siblings / stacked results。
  - Concurrent canvas runs，第一版建议固定 1，后续可配置。
  - Auto-focus running placeholder。
  - Run selected chain：从一个或多个起点 preset 沿 generate/upload 边串联运行。
  - Chain scheduling mode：第一版固定顺序执行，只有上游 finished 后才 materialize 下游输入。
  - Chain failure policy：默认失败即停；后续可增加 skip failed branch / continue independent branch。
- Project
  - Autosave interval。
  - Save imported assets into project。
  - Keep output refs only / copy outputs into project。
  - Clear temporary backend assets on close。
- Accessibility
  - Enable single-key shortcuts。
  - Show button labels。
  - Larger hit targets。
  - High contrast node status。

### 11.6 快捷键建议

第一版建议：

| Action                     | Shortcut               |
| -------------------------- | ---------------------- |
| Select tool                | `V`                    |
| Hand tool                  | `H`                    |
| Temporary pan              | `Space` + drag         |
| Connect tool               | `C`                    |
| Add preset command         | `P`                    |
| Command palette            | `Ctrl/Cmd+K`           |
| Save project               | `Ctrl/Cmd+S`           |
| Undo                       | `Ctrl/Cmd+Z`           |
| Redo                       | `Ctrl/Cmd+Shift+Z`     |
| Duplicate selection        | `Ctrl/Cmd+D`           |
| Delete selection           | `Delete` / `Backspace` |
| Zoom in                    | `Ctrl/Cmd++`           |
| Zoom out                   | `Ctrl/Cmd+-`           |
| Reset zoom                 | `Ctrl/Cmd+0`           |
| Fit all                    | `Shift+1`              |
| Fit selection              | `Shift+2`              |
| Run selected preset node   | `Ctrl/Cmd+Enter`       |
| Stop selected running node | `Shift+Escape`         |
| Cancel current interaction | `Escape`               |

快捷键必须在文本输入、prompt 编辑、数值输入时自动失效，避免打字时误触发画布动作。

### 11.7 命令面板

由于 preset 数量会越来越多，建议第一版就加入 Command Palette。入口为 `Ctrl/Cmd+K`，支持：

- 搜索并添加 preset 节点。
- 搜索画布命令，如 Fit all、Clear failed placeholders、Toggle minimap。
- 搜索当前项目节点。
- 搜索最近输出。
- 执行 Run selected preset。

命令面板比把所有 preset 都堆在左侧列表更耐用，也适合后续接用户 preset、收藏 preset 和最近使用。

### 11.8 危险操作规则

- Delete node 只删除画布节点，不删除输出文件，可 Undo。
- Clear canvas 必须二次确认，并保留 Undo 或项目历史快照。
- Delete output file 必须与 Delete node 分开，是危险操作，需要二次确认。
- Stop running node 只影响该 `run_id/task_id`，不能误停全局 UI 正在跑的任务。
- Refresh preset schema 不能悄悄覆盖用户改过的参数，应显示 diff 或保留旧值。

### 11.9 SimpAI 专属交互

- Preset 节点左侧放 input handles，右侧放 output handle。
- Upload slot handle 上显示 slot 名称和是否必填。
- 缺少必填输入时，Run 按钮可见但禁用，并在节点状态显示 Missing input。
- Run 后立即在 output handle 右侧创建结果占位节点。
- 结果占位节点顶部显示状态条：Queued / Running / Previewing / Finished / Failed。
- 结果占位节点中部显示最新预览图；没有预览时显示进度环和当前消息。
- 结果占位节点底部显示 `step/total` 与百分比。
- 失败节点保留在画布上，允许 Retry / Inspect error / Delete。
- 多输出任务第一张结果固化原占位节点，其余结果按 sibling 节点排列在右侧。

## 12. 开放问题

- Preset 节点参数是否首轮显示所有参数，还是节点摘要 + Inspector 全量？
- 用户 preset 是否和内置 preset 一样直接进入 catalog？
- 输出节点恢复 preset 时，是恢复创建时 snapshot，还是按当前最新 preset 文件迁移？
- `scene_canvas_image` 的 mask 输入首轮是否必须支持？建议首轮先支持普通 image slot，mask 放到第二阶段。
- Direct runner 是否先只支持 scene preset？建议是，non-scene AIO 节点等 scene 跑通后再接。

## 13. 实施记录（压缩版，2026-05-20）

> 本节压缩了 2026-04-30 至 2026-05-13 的逐条实现记录。旧日志包含大量短修、命令输出、试验回滚和阶段性 UI 调整；压缩后只保留可继续指导开发的结果、边界和风险。

### 13.1 阶段总览

- 2026-04-30：完成无限画布前端壳子、Transfer Station API 化、Preset catalog、项目保存/加载桥接、图片/结果/preset/config 节点、连线和基础运行流。
- 2026-04-30 至 2026-05-02：接入 Asset Service、Args Preview、Direct AsyncTask Runner、Run History、Log 面板、Minimap、结果栈、Undo/Redo、ComfyUI 风格复制粘贴、拖接口新建节点、锁定/跳过/对齐/分布、多选编辑、Asset Manager 和 Text/Prompt/WD14/VLM 任务节点。
- 2026-05-02 至 2026-05-05：推进 Classic Preset Node、Resolution/Models Config、TagCart、LayerForge/Image Mask、Video/Audio asset nodes、preset media input slots、model check/download、SketchAdapter、UOV/Enhance/Inpaint 接入。
- 2026-05-06 至 2026-05-07：集中建设 Media Timeline、裁剪/合成/Mask/关键帧/比较帧/几何 payload/音频波形/Image Compare，并修正 FFmpeg 与前端像素几何误差。
- 2026-05-07 至 2026-05-08：画布性能与交互收口，包含连线缓存、Minimap 联动、平移/缩放闪烁、吸附网格、低频虚拟化、发布前提示贴、区域分组、响应式覆盖、Result metadata popover、RAM/VRAM chip、性能仪表盘和折叠悬停展开。
- 2026-05-09 至 2026-05-10：SAM3 / SAM3.1、视频 reload、资产去重、低显存降分辨率、hidden bridge 清理、JS 模块拆分、template library、transfer-station 入口、Agent preset 扫描性能和 Thinking prompt trimming。
- 2026-05-11 至 2026-05-13：Canvas Agent 媒体路由、VLM 视频设置、紧凑工具栏、outpaint overlay、工作流节点布局、手动/视频蒙版、删除 Result 中断任务、Audio Action、Qwen TTS mode nodes、Audio Workflow Bridge、保存/刷新恢复。

### 13.2 当前稳定能力

- 工作台支持无限画布节点化生成：图片、视频、音频、文本、prompt、Classic preset、模型配置、分辨率配置、Result、Timeline、Mask/Sketch/Compare 等节点可以组合运行。
- 项目保存/加载已包含节点、连线、资产引用、配置状态和部分运行结果；刷新恢复曾做专项修复。
- Direct runner 可以绕开主 UI 生成链装配 AsyncTask 参数，支持 seed、多图、gallery refresh、失败详情和 run history。
- 顶部运行队列控件和详情面板可以汇总 Selected Chain 调度状态、活动/最近任务、后端队列位置，并提供定位、停止、跳过、重试和历史入口。
- 画布交互已具备缩放/平移、框选、多选、复制粘贴、Alt 拖拽复制、对齐/分布、锁定/跳过、右键菜单、拖接口自动连线、节点折叠/展开、Minimap 和性能仪表盘。
- 媒体链路支持图片/视频/音频资产节点、Timeline 合成、关键帧、Mask path、当前帧比较、Image Compare、视频裁剪预览和结果回传。
- Agent 链路支持媒体引用、工作流节点生成、手动/视频蒙版、TTS/audio workflow、result 中断和紧凑操作 UI。

### 13.3 持久约束

- 画布运行不能依赖主 UI 隐式状态；preset 参数必须从节点、连线和项目快照显式装配。
- AsyncTask 位置参数脆弱，所有装配逻辑都要保留 dry-run/args preview/失败详情，避免静默错位。
- 节点折叠态是“少渲染但仍占位”，不能通过改变窗口真实尺寸换性能；ComfyUI 节点大小必须稳定。
- Textarea、Prompt、Negative Prompt、聊天框等可编辑区域需要稳定 selection、scrollHeight 和 resize 行为；传参刷新不应重置用户调整过的高度。
- 画布内快捷键要阻断主 UI 的 Generate / tab hotkey 等全局快捷键，特别是 Ctrl+Enter。
- 图像/视频/图库浏览器默认只浏览，不应自动变成资产；只有拖入画布、生成节点或显式导入时才建立资产节点。
- 在线图库、生成结果、视频和本地资产的 metadata 格式不同，提取逻辑要以 provider adapter 分层，不能硬写单一格式。

### 13.4 仍需跟进

- Result stack 拖出、资产管理器批量整理、失败复现入口、项目版本迁移和工作台内媒体浏览器还需要继续打磨。
- Timeline 几何、Mask path、SAM3 视频和低显存策略已经有多轮修复，但仍应用小样本像素/帧对齐测试守住回归。
- 画布 UI 的折叠态、展开态、textarea selection、Autocomplete popup 和主 UI 共享自动补全仍是近期风险区。

### 13.5 增量记录（2026-05-23）

- 模板库 / 新手引导 V1 已产品化：新增 `starter` 分类，Quick Start demo 从占位内容替换为正式教学画布，模板 manifest 支持 Starter、Built-in/User、模型依赖卡片、搜索和从模板新建。
- Starter 模板已覆盖基础上手、提示词辅助、运行队列与结果、Preset 节点基础、模型就绪基础；每个模板使用独立 checklist，不再共用同一组泛化步骤。Checklist 位置调整到左上角，避免和 Canvas Agent 面板冲突。
- 用户模板能力补齐保存与删除：用户保存模板进入同一模板库，但左侧单独显示 `User` 标签；卡片保留原媒体分类和 User 标记，删除使用工作台内确认弹窗，避免浏览器原生 confirm 的割裂感。
- 画布运行队列从左侧小图标改为顶部紧凑进度控件，降低和右侧 Inspector 抽屉层级冲突；详情面板仍保留 Selected Chain、Live Runs、Recent Runs、Retry、History 等入口。
- Classic / Preset 节点补齐主 UI 对齐项：Advanced Config、Resolution Config、Models Config、prompt/default_prompt 读取、negative prompt 默认值、wildcards/translation 控件和 Inspector 参数编辑。取消 textarea 双击打开中央文本编辑器，保留通过标题打开编辑窗口的路线。
- Runnable Image 模板已加入 `Anima Text to Image` 和 `Flux2-A2R Image Edit`：包含 prompt 文本节点、模型/分辨率/高级配置节点、结果占位、模型依赖说明和运行队列引导。
- Runnable Video 模板已加入 `Wan T2V Basic`、`Wan I2V Basic` 和 `Wan Video Extend`：T2V/I2V 覆盖文本/首帧/尾帧基础流程；Wan-Extent 使用 `scene_video` 源视频槽，用于延长已生成或导入的视频，并复用 Wan I2V 主模型加 SVI extend LoRA。
- Runnable Audio / TTS 模板已加入 `Qwen TTS Voice Design`、`Qwen TTS Voice Clone`、`Qwen TTS Custom Voice`、`Qwen TTS Dialogue`：使用 `qwen_tts_*` 节点、`generate` 边连接音频 Result；Voice Clone 和 Dialogue 明确需要替换参考音频，Dialogue 需要脚本角色对应的 Role Bank/参考音色。
- 可运行模板 V2 已加入 `LTX2.3 Text+Audio to Video`、`InfiniteTalk AI2V Lip Sync`、`Hunyuan-Foley Video Audio`、`Result Reuse Image Chain`，并加入 model-free `Timeline Composite Basics`：覆盖 `scene_audio`、`scene_video`、图片+音频口型、视频拟音、Timeline 渲染和 Result 作为下游输入复用。
- 可运行模板 V3 已加入 `Wan-Animate SAM3 Object Replace`、`Wan-Animate SAM3 Face Swap`、`Wan-Remover SAM3 Video Removal`、`Wan Video Outpaint`、`TTS Timeline Voiceover Mix`：覆盖 SAM3 视频遮罩接入 Wan 局部编辑、源视频/参考图/遮罩多输入、视频扩图，以及 Qwen TTS 音频 Result 接入 Timeline 混剪后渲染视频 Result。
- 可运行模板 V4 已加入 `Wan-Animate SAM3 Person Replace`、`Wan-SCAIL Motion Transfer`、`Wan-Swap Face Basic`、`Wan-Swap Motion Transfer`、`Nvidia-VSR Video Upscale`：继续覆盖人物替换、动作迁移、非 SAM3 换脸/姿态迁移和视频超分；需要素材的输入节点统一引用 `presets/input_reserved/` 中的可替换预占位资源，不内嵌 base64。
- 模板维护文档已更新：说明 `starter/image/video/audio` 媒体分类、用户模板独立 `User` 侧栏标签、`.canvas.json` 最小结构、Runnable Preset 模板规则、音频/视频输入模板规则、Timeline 模板规则、Result 复用链路规则、Qwen TTS 模板规则、用户模板删除规则和验收清单。
- 本轮静态验证：`node --check javascript\infinite_canvas_workbench.js`、`node --check javascript\canvas_workbench\api.js`、`python -m py_compile modules\canvas_workbench_project.py modules\canvas_workbench_runner.py modules\canvas_workbench_qwen_tts.py webui.py` 通过；模板 manifest 当前 29 项，新增 V2/V3/V4 模板 JSON、slot/edge/Result producer 和预占位资源存在性校验通过。

近期继续关注：

- 为模板库补真实 preview 图或轻量截图缓存，替代 fallback 卡片，避免大段文字和依赖说明互相挤压。
- Qwen TTS 目前运行前才暴露模型缺失；后续可做专门的 Qwen TTS model readiness/check/download 行，与 Preset 模型检查体验对齐。
- 可运行模板后续可继续扩展到 Wan-TTP、LTX-Outpaint、Nvidia-VSR/SeedVR 组合增强、更多多段 Timeline 交付链路，并补充真实 preview 图。

### 13.6 Style Config 迁入记录（2026-05-23）

- 主 WebUI 的 Styles 面板已从临时兼容路径迁入无限画布配置链路：新增 `Styles Config`，作为 `models / styles / resolution / advanced` 四类 Preset Config 的正式成员。
- Preset / Classic 节点右键菜单、节点端口、Inspector 快捷按钮均可创建或选择 `Styles Config`；节点内提供 Style 搜索、勾选、Reset 和 Clear，Style 名称优先从主 UI 样式面板读取，缺省时使用常见 Fooocus style fallback。
- 项目数据新增 `styles_config`：结构继续沿用 `{ mode, defaults, overrides, source_node_id, updated_at }`，不改变 `.canvas.json` schema；旧模板和旧项目中保留的 `generation_config.style_selections` 仍作为后向兼容兜底。
- Runner 装配顺序改为：节点参数中的 `style_selections` 优先，其次 `styles_config`，再 fallback 到旧 `generation_config.style_selections`、preset snapshot/defaults 和全局默认 styles。`styles_config.style_selections: []` 会被视为显式清空，不再误回落到默认 Style。
- 模板维护文档已要求新可运行模板使用 `styles_config` 暴露 Style 面板控制，不再只把 Style 选择塞进 Advanced/generation 配置。

### 13.7 指引贴条与悬浮预览记录（2026-05-24）

- 提示贴新增 Pointer Tail：可在节点标题按钮或右键菜单开启/关闭小尾巴，尾端锚点可拖到固定画布位置，用于把教学说明指向按钮、端口、结果占位或配置区域；保存/复制/粘贴会保留并平移 tail target。
- 画布新增通用 hover preview helper：统一处理固定浮层、图片探测、位置避让和文本摘要，其他节点后续只需挂载 `data-hover-preview-*` 或 model preview 数据属性。
- `Styles Config` 已接入主 UI 的 style sample 预览规则：优先读取主 UI `data-style-data` 中的 prompt/negative prompt，悬浮时按 `sdxl_styles/samples/<style>.jpg` 探测预览图，缺失时回退到默认 style 图。
- `Models Config` 已把 Base/Refiner/Upscale 与 LoRA 行接入同一悬浮预览 helper；CLIP/VAE 仍保留为普通下拉，避免低频模型项产生过多悬浮层。悬浮下拉时显示当前选择；打开下拉会使用画布内自绘选项菜单，悬浮每个候选项时实时显示模型/LoRA 预览图，图片按主 UI 同名图片规则从 checkpoint/lora/model root 路径探测，缺失时回退到 noimage。

### 13.8 Pose Studio 节点计划（2026-05-26）

- Pose Studio 将作为 Infinite Canvas 的正式节点类型接入，复用 `docs/pose-studio-webui-dev-log.md` 规划的共享 WebUI editor/service，而不是只作为主 UI Scene Preset 浮窗。
- 节点类型建议为 `pose_studio`：输入可接 `reference_image`，双击节点或点击节点动作按钮打开 Pose Studio 编辑器；确认后导出 `pose_image` 资产，并可选保存 `pose_json` 用于后续高级连接。
- 节点状态需要随 `.canvas.json` 保存：参考资产引用、导出资产引用、pose/editor JSON、body/camera/export 参数和缩略图。项目加载时恢复状态，不依赖当前主 UI 选中的 preset。
- 下游 Preset 节点通过普通 canvas asset/upload-slot 路由消费 `pose_image`，例如连到 Scene Preset 的姿势图、参考图或任意兼容图片输入槽。
- SAM3D 参考图解析必须由用户显式触发，不能在项目加载或画布重绘时自动跑模型；参考图变化后可提示重新解析。
- 不迁入原 VNCCS 右侧 Lighting 模块：`Keeping Original Lighting`、Scene Lights、灯光管理和 lighting prompt 都不属于画布 Pose Studio 节点。Prompt/lighting 仍由 Preset、Prompt 节点或后续专门配置节点负责。

落地记录：

- 已新增 `pose_studio` canvas 节点、共享 `Pose Studio` modal shell、`/pose-studio/*` 后端接口和本地 `PoseLibrary` 列表读取。
- 节点已接入侧栏、节点搜索/添加菜单、overview、Inspector、右键菜单、双击打开、参考图输入端口、参考图资产序列化、PNG 导出资产、普通图片输出端口、复制粘贴关系修复，以及下游 preset image slot 兼容。
- WebUI 已接入显式 SAM3D 参考图解析接口：`/pose-studio/import/reference-image` 复用 canvas asset materialize，调用 VNCCS `process_image_to_pose_json(image_tensor)`，并通过 `/pose-studio/import/status` 暴露 progress tracker 状态。项目加载和画布重绘仍不会自动跑解析。
- 姿势库已开始用户化：列表优先显示 SimpAI 用户目录保存的姿势，再显示 VNCCS 插件自带 `PoseLibrary`；modal 可把当前 pose 保存到用户库，后端删除接口只允许删除用户库条目。
- 已增加只读 `/pose-studio/vendor/...` 资源代理，仅允许访问 VNCCS `web/` 下的前端文件，供后续真实 `PoseViewerCore` 接入使用。
- 已增加 `/pose-studio/character/update-preview`，复用保留的 MakeHuman 资源生成 `PoseViewerCore.loadData()` 需要的 mesh、骨骼、权重和 landmarks。
- Modal 已从单纯 2D scaffold 推进为优先挂载真实 VNCCS `PoseViewerCore`：姿势库 pose 走 `setPose()`，SAM3D 解析结果走 `applySAM3DImport()`，SAM3D 对照 mesh 走 `setSAMMeshOverlayData()`，导出走 `viewer.capture()`；真实 viewer 初始化失败时才回退到 2D scaffold。
- 主 UI Scene Preset 已有首版 bridge：`pose_studio` 打开共享 modal，确认后通过隐藏 Gradio 桥把 PNG 写回 `scene_input_image2`，后端继续按普通图片输入消费。
- Shared modal 已补 SAM3D frame-fit：解析参考图后使用 `computeSAM3DFrameCameraParams()` 计算导出 zoom/offset，默认以 bbox frame + 逆向 model rotation 对齐 VNCCS `applySAM3DFrameCameraParams()` 的非投影模式。
- SAM3D frame-fit 适配已抽到 `applySAM3DFrameFitToViewer()`，并加入 browser smoke：默认分支验证 `bbox_inverse_model_rotation`、强制 bbox fallback、反向 model rotation 和导出 camera yaw/pitch 归零；开启 SAM camera 分支验证 `sam_projection` 与 projection camera frame。
- 用户姿势库已露出重命名/删除入口；只允许操作 SimpAI 用户库条目，内置 VNCCS PoseLibrary 保持只读。
- 已新增 `tools/pose_studio_browser_smoke.mjs`：在真实 WebUI 上打开 Scene Preset Pose Studio，验证桌面/窄屏 canvas 非空且未裁切、确认导出写回 `scene_input_image2`，并切换 preset 验证 modal 与隐藏桥接 state 清理；脚本也会打开 Infinite Canvas，运行 Pose Studio canvas smoke，确认 `pose_studio` 输出可接入下游 preset 的 `scene_input_image1`。该脚本不触发生成。
- Infinite Canvas workbench API 已暴露 `addPoseStudioNode()` 与 `connectUploadEdge()`；内部 `__runPoseStudioCanvasSmoke()` 会临时创建内存项目、连接 pose 输出到 preset 图片槽、读取 DOM/项目状态，然后恢复原画布项目，避免污染本地草稿。
- 2026-05-26 已在 live 8190 WebUI 实跑通过：`reports/pose-studio-browser-smoke-current.json` 记录 5/5 pass，覆盖 SAM3D frame-fit 两个分支、Scene Preset 导出桥、窄屏 modal、preset 切换清理和 Infinite Canvas 临时 Pose Studio 节点连接下游 preset `scene_input_image1`。
- 首版 schema 决策：Scene Preset 继续复用 `scene_input_image2` 作为 Pose Studio 图片桥；专用 `pose_studio_image` 槽位等 preset schema 需要区分 pose/reference 时再加。
- 如后续需要逐像素对齐，可再补一个指定 VNCCS 样例 workflow 的视觉对照 fixture。
- 本次明确不接 Lighting 模块；画布节点不产生 `lighting_prompt`，也不显示 Scene Lights 或 Pose Studio prompt box。

### 13.9 X/Y/Z Plot、批量生成与对比脚本规划（2026-06-03）

- 兼容基准明确为 `forge_neo/webui/scripts/xyz_grid.py`：画布版保留 `X/Y/Z plot` 的三轴类型、轴值解析、dropdown/text 两种输入、轴交换、seed 规则、legend、sub images、sub grids、row count、grid margins 和 grid 大小限制，不只复刻截图外观。
- 新增画布 X/Y/Z 作业入口：Preset / Classic 节点头部、节点内容按钮、Inspector 动作区和右键菜单都能打开同一个 X/Y/Z Plot 面板。面板从后端读取 Axis choices，当前没有 choices 时使用本地常用轴列表。
- Axis 注册表按 `AxisOption(label/type/apply/format/confirm/cost/choices/prepare)` 思路建模，后端模块为 `modules/canvas_workbench_xyz.py`。UI、预览、CLI 和后续真实队列共用这份轴定义，首批只覆盖画布节点面板可见字段：`Prompt`、`Negative Prompt`、`Seed`、Models Config 的模型字段、Styles Config、Resolution Config 的尺寸字段，以及 Advanced Config 的 Guidance、Forced Sampling Steps、Sampler、Scheduler。
- X/Y/Z 类型不再直接继承 `forge_neo/webui/scripts/xyz_grid.py` 的完整轴列表；`Hires steps`、`Prompt S/R`、`Checkpoint name`、`RNG source`、Sigma/Beta/Eta 等不属于当前画布面板字段的项不显示。
- 轴值解析对齐原脚本：CSV 支持引号，int 支持 `1-10(2)` 与 `1-10[5]`，float 支持 `0.1-1.0(0.1)` 与 `0.1-1.0[5]`，`Prompt order` 展开 permutations，`批量提示词文件` 支持目录展开为 `.txt` 文件列表。
- seed 行为对齐原脚本：默认把 `-1` 固定成实际 seed；`Keep -1 for seeds` 保留随机 seed；`Vary seeds for X/Y/Z` 根据 `ix / iy / iz` 递增 seed；预览 variants 记录原始轴值、axis labels、`resolved_seed` 和节点参数变更。
- 成本排序对齐原脚本：`Checkpoint name`、`Refiner checkpoint`、`VAE`、`UniPC Order` 等高 cost 轴优先进入外层调度信息，后续真实队列可按此减少重复模型切换。
- `.canvas.json` 增加可选 `batch_jobs[]`，每项包含 `script: "X/Y/Z plot"`、`source_node_id`、`axes[]`、`options`、`variants[]`、`run_ids[]`、`matrix_node_id` 和 `status`。旧项目加载时自动补齐空数组，不需要迁移文件。
- Result 节点预留可选字段：`batch_job_id`、`variant_id`、`axis_values`、`axis_labels`、`resolved_seed`、`grid_role: "main_grid"|"z_sub_grid"|"cell"`。当前 V1 先写 Matrix 预览节点，真实生成写回 Result 时使用这些字段。
- 新增后端接口规划并接入路由：`POST /canvas-workbench/xyz/axis-options`、`/preview`、`/run`、`/poll`、`/control`、`/render-grid`。其中 `/preview` 可用；`/run` 必须设置 `SIMPAI_CANVAS_XYZ_ALLOW_GENERATE=1`，当前仍返回安全提示，避免普通验证消耗模型时间。
- 结果展示新增 `xy_matrix` / `xyz_matrix` 节点：Z 轴会显示多个 sub grid，主节点展示所有 Z 分组；`Include Sub Images` 与 `Include Sub Grids` 作为作业选项保存；点击格子会选中对应 variant，后续真实 Result 写回 `result_node_id` 后可定位单格 Result，并支持选两格创建现有 Compare 节点。
- 新增脚本 `tools/canvas_workbench_xyz_plot.mjs`，支持 `--project`、`--node-id`、`--job`、`--dry-run`、`--out`、`--base-url`。dry-run 输出 `job.json`、`summary.md` 和 `matrix.html`；真实生成仍需要 `SIMPAI_CANVAS_XYZ_ALLOW_GENERATE=1`。
- 测试计划已加入 `tests/test_canvas_workbench_xyz.py`：覆盖 CSV、int/float range、count range、Prompt order、批量提示词目录展开、txt2img/img2img 轴可见性、confirm/cost、seed 固定化、Keep -1、Vary seeds、路由/前端/CLI/文档合同。
- Infinite Canvas 的 X/Y/Z Plot 使用画布 Direct runner 数据结构，不调用主 UI Generate，不读取主 UI 隐式状态；`xyz_grid.py` 依赖 Forge 全局对象的部分，在画布里转成显式 job payload。
- 视频和音频暂时只进入批量任务列表，不做图片矩阵。

### 13.10 Batch Any 独立批量运行规划（2026-06-04）

- 结论：画布批量运行不能只依赖 X/Y/Z Plot。X/Y/Z 负责参数轴、seed、矩阵和对比；`Batch Any` 负责把一组素材按顺序送入同一个 Preset / Classic 的输入槽，逐项调用画布 Direct runner。
- 新增节点类型 `batch_any`，显示为 `Batch Any / 批量素材`。节点保存 `items[]`、`current_index`、`media_kind`、`params.stop_on_error`、`batch.state`、`batch.run_ids` 和当前 active `asset`。
- 类型规则：空 Batch Any 显示 Any 输出口，允许先连接目标；导入第一批素材后，按第一个可用文件确定 `media_kind`。文本批次输出 text，图片批次输出 image，视频批次输出 video，音频批次输出 audio；同一节点后续导入只接受同类型素材，类型不一致的文件会被跳过。
- 连接规则：Batch Any 可作为 text 或 upload source 接入 Preset / Classic 输入槽。连接兼容性由 `media_kind` 和输入槽类型决定：文本只接 Prompt / Negative Prompt，图片只接图片槽，视频只接视频槽，音频只接音频槽。
- 执行规则：节点动作提供 `Run current` 与 `Run all`。运行全部时，Batch Any 逐个切换 active item，复用现有 `runPresetNode()` / Direct runner，每个结果节点记录 `batch_job_id`、`batch_node_id`、`batch_item_id`、`batch_index`、`batch_item_name`。
- 项目记录：执行时写入 `project.batch_jobs[]`，`script: "Batch Any"`，包含 source node、target preset、target slot、item ids、run ids 和 status，和 X/Y/Z 作业记录共享同一项目级批量容器。
- 素材入库：导入文件会先用于节点预览，然后异步写入 canvas asset storage；写入成功后 item 的 asset 引用替换为 asset_ref，避免 `.canvas.json` 长期保存大体积 data URL。
- 当前 V1 不混合素材类型，不做跨 slot 多输入组合，也不做视频/音频矩阵。后续可扩展为多 Batch Any 节点笛卡尔积、多输入槽同步推进、失败后继续/重试和批量 Result 排列。

### 13.11 Batch Any 网格、画布素材输入与 X/Y/Z choices（2026-06-04）

- Batch Any 节点内素材列表改为缩略图网格。图片和视频优先显示缩略图，音频显示波形预览；节点正文最多先展示 36 项，剩余数量以网格占位提示，避免长文件名把节点内容挤压成窄列表。
- Batch Any 新增左侧素材输入口，空状态标记为 `data-batch-any-in="any"`。画布内文本、`image`、`video`、`audio`、`result`、`mask`、`pose_studio`、`gaussian_studio` 等已有素材节点可以通过拉线加入 Batch Any，右侧输出口仍负责把当前素材接到 Preset / Classic 输入槽。
- 新增 `batch_input` 连线类型。连线从来源素材节点指向 Batch Any，item 记录 `source_node_id`、`source_node_type` 和 `source_edge_id`；断开该连线会移除对应 item，并自动更新当前 active asset。
- 通过从素材输出口拖到空白处再创建 Batch Any 时，pending connection 会自动把该来源素材加入新 Batch Any，减少“先建节点再导入/连接”的步骤。
- Batch Any 的类型规则保持“第一个接入素材决定 media kind”：空节点可接任意支持素材，也可先连接任意兼容目标；一旦已有 text / image / video / audio 类型，后续只接受同类型来源，避免同一输出口在运行中改变类型。
- X/Y/Z Axis choices 不读取 Forge 运行时全局列表；Forge 的 `xyz_grid.py` 只作为语义兼容参考。画布侧 choices 以 SimpAI 主 UI 和 Direct runner 使用的内部值为准。
- 首批 fallback Sampler 使用 SimpAI/Comfy 内部值，如 `dpmpp_2m`、`dpmpp_2m_sde`、`euler`、`lcm`、`uni_pc`、`er_sde` 等，确保 X/Y/Z 面板的 dropdown 与“填入全部可选项”按钮不再空白。
- 测试计划扩展：固定 Sampler/Scheduler choices 非空、Batch Any 网格样式、`batch_input` 前端契约、输入口 selector、断开连线移除 item、文档 EOF 记录。真实生成仍保持手动触发，普通验证只覆盖 preview、契约和 dry-run。

### 13.12 X/Y/Z choices 数据源修正（2026-06-04）

- 修正 choices 数据源边界：`forge_neo/webui/scripts/xyz_grid.py` 仍作为轴语义、解析规则、seed 和 grid 行为参考，但 dropdown values 不从 Forge 运行时全局对象读取。
- Sampler / Scheduler 读取 `modules.flags.comfy_sampler_list` 与 `modules.flags.comfy_scheduler_list`，并加入当前 source node 中已有的 sampler/scheduler 值。前端本地 fallback 也使用 `ADVANCED_SAMPLER_CHOICES` 和 `ADVANCED_SCHEDULER_CHOICES`。
- Base Model / Refiner / CLIP / VAE / Upscale Model 读取画布自己的 `modules.canvas_workbench_models.get_model_catalog_for_preset()` 与 `modules.config` 当前文件列表，和 Models Config 面板保持同一来源。
- Styles 读取 `modules.sdxl_styles.legal_style_names`，不使用 Forge 的 `shared.prompt_styles`。
- 新增测试固定 `modules.canvas_workbench_xyz` 不再出现 `modules.sd_samplers`、`modules.sd_schedulers`、`modules.sd_models` 这类 Forge 运行时依赖；Sampler/Scheduler choices 断言改为 `dpmpp_2m`、`euler`、`uni_pc`、`karras` 这类 SimpAI 内部值。
- Forge 只作为语义兼容参考，不作为 choices 的运行时来源。

### 13.13 Batch Any 文本批次、端点颜色与节点预览修正（2026-06-04）

- Batch Any 输入类型扩展到 `text`：Text、Translation、Tag Cart、WD14、VLM、Wildcards Helper、Style Selector 等文本输出可以通过左侧输入口加入 Batch Any。
- Batch Any 输出为 `text` 时可连接 Preset / Classic 的 `prompt` 或 `negative_prompt` 文本输入。运行全部时会逐项切换当前文本，再调用目标 Preset / Classic。
- 文件导入扩展到 `.txt` / `.md` / `text/*`。第一批文本文件会把 Batch Any 类型确定为 `text`，同一节点后续只接收文本来源。
- Batch Any 左侧输入口的 `data-batch-any-in` 按当前类型写为 `any` / `text` / `image` / `video` / `audio`；`any` 使用透明端口，确定类型后再按 text/image/video/audio 上色。右侧输出口继续按 `data-handle-out` 上色，空状态同样标记为 `any`。
- 节点内取消大尺寸当前素材预览区，只保留元信息、素材网格和运行按钮。图片/视频/音频用网格缩略图展示，文本用文本片段卡片展示，避免大图裁成半张图造成误导。
- 项目加载时同步恢复 text 批次的当前 `node.text.value`，保证保存后重新打开仍能把当前文本输出给下游。
- 交互修正：Batch Any 输入连线支持端口右键断开来源，左键拖拽当前素材来源重新连接；素材网格和 Inspector 支持单项删除、Ctrl/Command 多选、Shift 范围选择和删除选中素材。
- 测试计划扩展：固定 `batchAnySourceText`、Any 端口、文本目标、动态 `data-batch-any-in`、文本文件导入、左侧端点颜色、文本卡片样式、Batch Any 连线命中、输入端口菜单、素材单删/多删和大预览区不再出现在 Batch Any 节点模板。

### 13.14 SAM3 视频裁剪区间与缓存帧读取（2026-06-07）

- SAM3 Video Mask 节点生成遮罩时，前端会读取源视频节点的当前裁剪区间，并把 `trim_start`、`trim_end`、`duration` 作为 `source_edit` 放进请求。
- 上传蒙版再匹配源视频时也传递同一个 `source_edit`，保证手动上传的遮罩和生成遮罩都按当前剪辑区间处理。
- 后端 Canvas SAM3 生成和上传匹配入口会把 `source_edit` 写入 `asset.edit`，继续复用 `materialize_node_asset()` 里的 ffmpeg 裁剪流程。
- SAM3 源视频会再走一次专用精确裁剪，强制重编码，避免通用 `-c copy` 按关键帧复制后仍保留原视频帧数。
- SAM3.1 缓存帧读取增加中文路径兼容：`cv2.imread()` 失败时改用 `np.fromfile()` 读取字节，再用 `cv2.imdecode()` 解码。
- 新增 `tests/test_sam3_video_mask_contract.py`，固定 SAM3 请求字段和中文路径缓存帧读取行为；验证命令见 `docs/gradio6-native-migration-plan.md` 第 254 节。

### 13.15 VLM Chat 停止当前回复（2026-06-07）

- VLM chat 节点 busy 时，输入区右侧按钮从发送变为停止；节点头部、Inspector 和右键菜单也提供停止当前回复入口。
- 每次 chat 发送都会带 `request_id`，前端用 `AbortController` 取消 `/canvas-workbench/vlm-run` 等待，并调用 `/canvas-workbench/vlm-cancel` 标记旧请求。
- 停止后 pending 气泡改为“已停止”，节点状态回到 idle；旧请求之后返回不会覆盖新的聊天状态。
- 清空 VLM chat 记录时也会取消当前等待中的回复，但清空后不保留停止气泡。
- 后端 `modules/canvas_vlm_runtime.py` 增加 request 级取消记录；custom API、主推理、draft retry 和 action repair 返回后都会检查取消状态。
- 新增 `tests/test_canvas_vlm_chat_input_contract.py` 覆盖停止按钮、AbortController、cancel endpoint、后端取消记录和样式；验证命令见 `docs/gradio6-native-migration-plan.md` 第 261 节。

### 13.16 Classic preset 布尔参数解析修正（2026-06-14）

- 无限画布 Classic preset 的 Direct runner 只保留一个 `_bool_value(value, default=False)`，避免同名 helper 后定义覆盖前定义。
- 布尔解析同时支持默认值参数、数字布尔值、`true/false`、`on/off`、`enabled/disabled`，覆盖 Classic 参数和 scene schema 两类输入。
- Classic preset 的文生图、图生图、inpaint、enhance 参数组装会继续进入 `build_canvas_task_args_preview()` 和 `build_canvas_async_args_dry_run()`，不再因为 `_bool_value()` 参数数量错误返回 Bad Request。
- 新增 `tests/test_canvas_workbench_runner.py` 覆盖 `_bool_value` 默认值、scene 字符串，以及 `Anima` Classic 节点 dry-run；验证命令见 `docs/gradio6-native-migration-plan.md` 第 344 节。

### 13.17 Scene 通用生成参数归一第一阶段（2026-06-15）

- Canvas Scene runner 优先读取生成配置节点里的 `image_number`、`overwrite_step`、`guidance_scale`，旧项目保存的 `scene_image_number`、`scene_steps` 继续作为兼容输入。
- Canvas 新建 Scene 节点不再把 `scene_image_number` 和 `scene_steps` 放进 Scene 参数列表，生成数量和 steps 交给生成配置节点。
- Scene preset 的默认 `image_number` 与 `scene_steps` 会写入标准生成配置默认值，避免节点新建后默认数量或 steps 变化。
- `params_backend` 会带上标准 `steps`、`cfg`、`negative_prompt`，方便 Comfy 工作流从通用键读取 Scene 参数。
- 主 WebUI Scene 模式隐藏并自动取消 Quick Enhance，避免已勾选状态继续影响 Scene 任务。
- XYZ 布尔解析同步支持 `_bool_value(value, default=False)` 和 `enabled/disabled`，减少画布不同入口的解析差异。
- 新增/调整 `tests/test_canvas_workbench_runner.py`、`tests/test_canvas_workbench_xyz.py`、`tests/test_preset_defaults_dry_run.py` 覆盖 Scene 通用生成配置、XYZ 布尔默认值和新 Scene schema；验证命令见 `docs/gradio6-native-migration-plan.md` 第 347 节。

### 13.18 Scene CFG var_number 取消（2026-06-15）

- Canvas 新建 Scene 节点继续从标准生成配置读取 `guidance_scale`，Scene 面板不再显示专门表示 CFG 的 `scene_var_number3` / `scene_var_number5`。
- 受影响预设的 CFG 默认值放回标准 `default_cfg_scale`；`Wan(T2V)`、`Wan-Extent`、`Dasiwa-Extent`、`Hunyuan-Foley` 等保留原 Scene CFG 默认值。
- Scene API workflow 的采样器 CFG / guidance_scale 改为读取 `SceneInput.cfg` 或 `GeneralInput.cfg`，画布执行时使用同一套标准 CFG 参数。
- 新增/调整 `tests/test_scene_input_workflows.py`、`tests/test_preset_defaults_dry_run.py`、`tests/test_canvas_workbench_xyz.py` 固定 CFG 不再回到 Scene var_number；验证命令见 `docs/gradio6-native-migration-plan.md` 第 348 节。

### 13.19 Scene 通用采样参数接入（2026-06-15）

- Canvas Scene preview 会把 `generation_config.sampler_name` / `scheduler_name` 写入 `params_backend.sampler` / `scheduler`，和主 WebUI Scene 任务使用同一套普通高级面板参数。
- `SceneInput` 新增 `negative_prompt`、`sampler`、`scheduler` 输出，旧的 Scene 图片输出编号保持不变。
- Wan2.2 / Wan-SCAIL / Hunyuan-Foley 相关 API workflow 改为从 `SceneInput` 或 `GeneralInput` 读取负向提示词、采样器、调度器。
- 运行时 simpleai_base 映射通过 `enhanced/comfy_task.py` 追加；`L:\dev2\simpleai_base\src\utils\params_mapper.rs` 同步默认映射，后续重建 simpleai_base 时使用同一规则。
- 新增/调整 `tests/test_scene_input_workflows.py`、`tests/test_canvas_workbench_runner.py` 固定 SceneInput 输出、workflow 接线和 Canvas preview 参数；验证命令见 `docs/gradio6-native-migration-plan.md` 第 354 节。

### 13.20 Scene preset steps 与剩余 workflow 对齐（2026-06-15）

- Canvas Scene schema 的 theme 默认值改用标准 `overwrite_step`，并同时写出旧 `scene_steps` 名称供历史项目读取。
- Canvas Scene runner 读取 steps 时优先使用 `generation_config.overwrite_step`，再读取 schema 默认值里的 `overwrite_step` / `scene_steps`。
- `QwenA2R` 这类多 theme preset 使用 `scene_frontend.overwrite_step` 表示 theme steps 差异，切换到 lite theme 后生成配置里的 steps 会变为 4。
- 剩余非风格化 Scene workflow 已按兼容范围读取 `negative_prompt`、`sampler`、`scheduler`；风格化旧 workflow 保持原状。
- 新增/调整 `tests/test_preset_defaults_dry_run.py`、`tests/test_scene_input_workflows.py` 固定 theme steps、root preset 字段和剩余 workflow 接线；验证命令见 `docs/gradio6-native-migration-plan.md` 第 355 节。

### 13.21 Scene steps 范围同步（2026-06-15）

- Canvas Scene schema 增加 `generation_config_props.overwrite_step`，每个 theme 都会携带标准 steps 的 `min`、`max`、`step`。
- 旧 preset 的 `scene_steps_min` / `scene_steps_max` 迁移为 `scene_frontend.overwrite_step_min` / `scene_frontend.overwrite_step_max`；旧字段不再写入 root Scene preset。
- Advanced Config 节点连接到 Scene preset 后，会按目标 preset 当前 theme 调整 `Forced Sampling Steps` 的 range 和 number 输入范围；没有 Scene 范围时使用全局 `-1..200`。
- 新增/调整 `tests/test_preset_defaults_dry_run.py` 固定 Canvas schema 的 steps 范围；验证命令见 `docs/gradio6-native-migration-plan.md` 第 356 节。

### 13.22 CLIP Skip 隐藏占位（2026-06-15）

- Advanced Config 不再显示 CLIP Skip，也不再把 `clip_skip` 写入 `generation_config`。
- X/Y/Z 轴选项移除 CLIP Skip，默认 Canvas 模板不再保存 `clip_skip`。
- Canvas runner 不再接受 `generation_config.clip_skip` 覆盖；异步参数只保留值为 1 的兼容占位。
- `GeneralInput` 保持原输入和输出编号不变，workflow 中固定 `clip_skip=-1` 作为节点兼容字段保留。
- 新增/调整 `tests/test_preset_defaults_dry_run.py`、`tests/test_canvas_workbench_xyz.py` 固定 Canvas 不再显示或保存 CLIP Skip；验证命令见 `docs/scene-parameter-normalization-plan.md`。

### 13.23 Models Config 缺失模型门控与画布下载面板（2026-06-17）

- 无限画布 Preset / Classic 的“检查/下载模型”入口只打开画布内的缺失模型面板，不再调用主 WebUI 的全局缺失模型浮窗，也不再改写主界面和画布的 z-index。
- 缺失模型面板挂在 Infinite Canvas workbench 根节点下，和节点、Inspector、运行队列处在同一画布浮层里；按钮、标题、提示和下载文案按 `state.__lang` 显示中文或英文。
- 当 Models Config 以 `external_override` 连接到 Preset / Classic 时，`/canvas-workbench/preset-model-status` 会检查实际提交的 Base Model、Refiner、CLIP、VAE、Upscale Model 和启用的 LoRA。本地文件可用时返回 `model_config_gate=true` 与 `ready=true`，即使 preset 默认 `model_list` 仍有缺失项，也允许执行。
- 如果 Models Config 里用户选择的文件本身缺失，接口会返回 `source=models_config` 的缺失行，并禁用下载按钮，避免把没有下载 URL 的用户自选文件误交给 preset 下载器。
- 无外部 Models Config 时继续使用原 preset `model_list` / `model_loader` 检查路径，保持模板库与主 preset 缺失提示一致。
- 新增 `tests/test_canvas_workbench_models.py` 固定 Models Config 可用、Models Config 缺失、preset 默认检查三种路径；`tests/test_canvas_workbench_xyz.py` 同步固定本节文档合同、画布入口不再调用主弹窗、面板挂载到 workbench 根节点。验证命令见 `docs/gradio6-native-migration-plan.md` 第 376 节。

### 13.24 音频节点重新上传改为替换资产（2026-06-21）

- 无限画布音频节点的“重新上传音频资产”改为打开本地音频文件选择器，和视频节点一样替换节点资产，不再只是刷新已有媒体 URL。
- 空音频节点的右键菜单保留重新上传入口；Qwen TTS 音色克隆模板里的 Reference Audio 节点即使显示“无音频”，也可以直接选择新的参考音频。
- 音频节点标题栏和 Inspector 增加重新上传按钮，用户不用只依赖右键菜单。
- 媒体替换成功提示按音频/视频分别显示，音频替换后显示“音频资产已替换”，不再出现“媒体已重载”或视频替换文案。
- 新增 `tests/test_canvas_audio_node_reupload_contract.py` 固定音频文件选择器、空音频菜单入口、音频节点按钮和音频替换提示。

### 13.25 加节点菜单图像对比图标对齐（2026-06-23）

- 无限画布右键“添加节点”菜单里，`添加图像对比节点` 使用自绘 `sai-compare-glyph`，之前没有进入上下文菜单的图标列样式，图标会占用文字列并把中文标题挤到下一行。
- 上下文菜单图标列现在同时识别 `sai-compare-glyph`，搜索结果模式也使用同一规则；菜单文字样式排除图标 span，避免图标和文字抢同一列。
- 影响范围只限无限画布上下文菜单展示，不改节点创建、节点标题和运行逻辑。

### 13.26 画布输入节点、快捷工具、项目缓存和 Director 节点修正（2026-06-24）

- Quick Start 模板改为单个空白 `Image Input` 上传节点，移除入门清单和模板内置引导卡。内置模板文件清理掉用户保存时写入的画布状态参数，避免默认模板携带本地项目尺寸、视口、运行检查清单等临时数据。
- 图像节点默认使用无边界模式。空白图像区域点击可直接打开文件选择器；图片替换后会刷新节点资产引用、显示状态和尺寸约束，避免出现 toast 提示已替换但画布仍显示“无图像”的状态。上传后的图像节点会按既定范围调整尺寸，不再被原图尺寸直接撑开。
- 空白视频节点和空白音频节点的媒体区域也改为上传入口，重新上传会替换节点资产。视频、音频右键菜单同步改成快捷工具入口；视频编辑默认走 `Bernini Video Edit`，只有用户选择 Animate 类工具时才创建 SAM3 蒙版流程。
- 图像节点右键菜单拆成标题区域节点菜单和图片区域媒体菜单。图片区域菜单直接提供查看媒体、Sketch、替换、遮罩、时间线、风格转换、扩图、放大等媒体工具，不再把节点布局、对齐、删除等操作混在一起。
- 快捷工具创建 preset 工作流时读取 preset 自身的 `default_prompt` 或 `prompt` 默认值，不再为 Swap、扩图等工具写死一套提示词。扩图使用 Flux 英文提示词路径；Swap+ 只建工作流和参考图输入，不自动运行需要第二张参考图的任务。
- 风格转换、Swap+、扩图等快捷工具会把生成的节点放进工作流分组，并在需要参考图时创建空白图像输入节点。Style Selector 的“应用风格”按钮会直接运行已连接的 StyleTransfer+ 节点。
- Canvas Agent 处于悬浮球状态时，快捷工具卡片会先恢复 Agent 面板再打开；避免用户点击工具后没有任何可见反馈。Note 节点 Inspector 文本编辑改为实时同步到画布节点。
- 浏览器缓存改为按画布项目区分。打开项目时优先使用当前浏览器里的未保存项目版本，并清理旧项目残留的节点、连线和分组 DOM，避免切换项目后显示上一个画布的 group 或连线。
- 图像结果节点可以作为后续图像编辑来源使用，结果预览和重试中的结果媒体会按当前项目资产根目录解析。LayerForge 编辑入口保持在画布内打开，不再跳到外层页面。
- 画布缩放后的文字虚化处理改为在缩放停止后刷新节点渲染状态；节点端点、连线和缩放后的命中区域同步刷新，减少缩小后再放大时文字持续发虚和连线错位。
- Media Timeline 的“swap size”按钮标题改为专用翻译，避免被前端翻译成“换装”。Timeline 播放头竖线限制在时间标尺内，不再向下穿出节点内容区。
- `Director Timeline` 独立脚本加入 `/canvas-workbench/app` 独立页资源列表，修复独立页遇到导演节点时报 `WORKBENCH_DIRECTOR_TIMELINE_NODE.renderNodeHtml is not a function` 后中断渲染的问题。
- `Director Timeline` 节点内容区域允许端点显示在节点边界外，避免素材池左侧端点被裁掉。图片素材槽改为固定正方形缩略框，图片居中 `contain` 显示；视频素材槽保持较高预览区，音频素材槽保持紧凑显示。
- 无边界图像节点标题栏去掉半透明深蓝底色，只保留标题文字阴影和按钮自身背景，避免图片上方出现不属于内容的色块。
- 新增/调整 contract 覆盖：`test_canvas_quick_start_template_contract.py`、`test_canvas_onboarding_cleanup_contract.py`、`test_canvas_template_settings_contract.py`、`test_canvas_image_node_empty_upload_contract.py`、`test_canvas_audio_node_reupload_contract.py`、`test_canvas_agent_quick_tools_contract.py`、`test_canvas_browser_cache_contract.py`、`test_canvas_note_inspector_live_sync_contract.py`、`test_canvas_media_timeline_text_contract.py`、`test_canvas_standalone_page_contract.py`、`test_scene_director_webui_contract.py`。
- 本节已验证的专项命令包括 `node --check javascript/infinite_canvas_workbench.js`、`node --check javascript/canvas_workbench/nodes/director_timeline_node.js`，以及 `python -m pytest tests/test_canvas_standalone_page_contract.py tests/test_canvas_image_node_empty_upload_contract.py tests/test_scene_director_webui_contract.py::test_canvas_director_segmented_run_contract -q -p no:cacheprovider --basetemp=.pytest_tmp_canvas_director_square_20260624`，结果为 `17 passed`。完整 Director 测试当前仍受系统临时目录权限和缺失历史模板文件影响，需要分开处理。

### 13.27 Anima 模板 CLIP 默认值对齐（2026-06-27）

- `Anima 文生图` 和 `Result Reuse Image Chain` 里的 Anima Classic 节点现在使用 `presets/Anima.json` 的 `default_clip_model=qwen_3_06b_base.safetensors`，不再保存为 `Default (model)`。
- 模板合约新增 Preset 对照：当内置模板引用的 preset 明确声明 `default_clip_model` 时，模板节点和连接的 Models Config 节点里的 `clip_model` 必须一致。
- 影响范围只限内置画布模板的模型默认值；运行、队列、下载面板和普通 `Default (model)` 模板规则不变。

### 13.28 Relight 节点光源方向控件（2026-07-01）

- Relight Preset 节点在 Infinite Canvas 里识别 `relight_fc_*` 的 `scene_var_number` 参数，节点卡片和 Inspector 都改用光源方向九宫格，不再显示 1-10 数字滑条。
- 控件仍保存为 `scene_var_number=1..10`，不改变项目文件、X/Y/Z 参数、运行提交和 workflow 参数名。
- 随机光源按钮使用横向图标加文字，视觉上和主 Scene 面板的 Relight 控件保持一致。
- 新增 `tests/test_canvas_relight_light_control_contract.py` 固定画布 Relight 控件渲染、点击事件和 CSS 类；验证命令见 `docs/gradio6-native-migration-plan.md` 第 521 节。

### 13.29 模板库与模型浏览器搜索输入保持焦点（2026-07-02）

- 无限画布模板库搜索输入不再在每次输入后替换整个弹窗；分类按钮、标题和模板列表改为局部刷新，连续输入 `wan` 会按原顺序保留在搜索框内。
- Model Browser 搜索触发查询时记录搜索框和光标位置，加载态和结果重绘后恢复到同一输入位置，用户可以连续输入筛选词。
- 新增 `tests/test_search_input_focus_contract.py` 固定模板库搜索局部刷新和 Model Browser 搜索焦点恢复；本次验证通过 `node --check javascript/infinite_canvas_workbench.js`、`node --check javascript/model_browser.js`、`python -m pytest tests/test_search_input_focus_contract.py -q -p no:cacheprovider --basetemp=.pytest_tmp_search_focus`、`python -m pytest tests/test_canvas_template_settings_contract.py -q -p no:cacheprovider --basetemp=.pytest_tmp_canvas_template_settings`、`python -m pytest tests/test_ui_compat_dataset.py::TestUiCompatDataset::test_model_browser_wheel_containment_blocks_background_scroll -q -p no:cacheprovider --basetemp=.pytest_tmp_model_browser_focus`。
- 本机 7860 当前运行的是 Forge Neo 页面，不含这次修改的无限画布独立页和新版 Model Browser 入口，因此没有把该服务作为实时页面验证来源。

## 13.30 Infinite Canvas multi-text merge node（2026-07-10）

2026-07-10
- 完成：无限画布新增 `text_merge` 多文本合并节点，可从左侧工具栏或“文本 / 提示词”节点菜单创建；节点默认提供两个有序文本输入，可动态增加或删除输入，最多 16 路。
- 完成：合并结果按输入端口顺序生成，未连接和空文本不会产生多余分隔符；分隔符为可选文本，留空时直接拼接，并支持 `\\n`、`\\t`、`\\r` 转义。输出继续作为标准 Text output 连接到 Text、Translation、Tag Cart、Preset / Classic 提示词和其他文本合并节点，循环连接会被拒绝。
- 完成：节点卡片、折叠概览、属性面板、连线删除、节点删除、复制粘贴和公开 Workbench API 均已登记；可见文本使用现有 `t()` 双语路径，由语言状态中的 `__lang` 决定显示语言。
- 修改文件：`javascript\infinite_canvas_workbench.js`、`javascript\canvas_workbench\registry.js`、`javascript\canvas_workbench\project_store.js`、`javascript\canvas_workbench\node_browser.js`、`css\infinite_canvas_workbench.css`、`tests\test_canvas_text_merge_contract.py`、`tests\test_gradio6_migration_plan_contract.py`、`docs\gradio6-native-migration-plan.md`。
- 新增/调整测试：新增 Infinite Canvas 文本合并合同，固定 `text_merge` 注册、`textMergeInputSlots()` 动态端口、`decodeTextMergeSeparator()` 可选分隔符、标准文本连线、循环检查、节点与属性面板渲染；migration plan 合同登记本节关键词。
- 验证：执行 `node --check` 检查 Infinite Canvas 主脚本、registry、project store 和 node browser；Node VM smoke 装入真实 Workbench 脚本，验证 `alpha`、空文本、`beta` 使用 `\\n` 后输出 `alpha\nbeta`；执行文本合并与 migration plan 聚焦 pytest；执行 `git diff --check`。
- 剩余风险：本节没有增加浏览器自动化拖线用例；动态端口的视觉位置仍需在实际无限画布中覆盖 2 路、4 路和 16 路输入进行人工确认。

## 13.31 Infinite Canvas input-port creation matrix（2026-07-11）

2026-07-11
- 完成：无限画布把所有现有输入端点统一登记到 `INPUT_PORT_HANDLE_SELECTOR` 与 `inputTargetCreationOptions()`。双击空输入端点会创建该类型的默认前置节点；右键输入端点会显示需要的输入类型、可创建的前置节点和已连接来源；已连接的单输入端点双击会定位来源节点。
- 完成：空输入端点现在通过 `startInputConnection()` 向外拖出临时连线，移动超过阈值后松开会打开与该端点匹配的节点菜单；普通单击不会触发菜单，保留双击识别。Batch Any、Timeline 和 Director media pool 等多输入端点可以重复创建来源。
- 完成：文本输入统一提供 Text 与 Multi-text Merge；图片、视频、音频、Config、Result generation、VLM、SAM3、Pose / Gaussian / LivePortrait、Qwen TTS、Director Timeline、Compare、Batch Any 和 Timeline 都登记了默认项与适用选项。空 Video / Audio 节点可先表达连接类型，再通过节点内重新上传按钮选择素材；Timeline 同样允许先连接空的类型节点。
- 完成：公开 Workbench API 增加 `getInputPortCreationOptions()` 和 `createDefaultInputSource()`，便于浏览器 smoke 验证端点矩阵；Preset 选择器可以保留目标输入并在选中 preset 后自动连接。
- 修改文件：`javascript\infinite_canvas_workbench.js`、`javascript\canvas_workbench\media_timeline.js`、`tests\test_canvas_input_port_creation_contract.py`、`tests\test_gradio6_migration_plan_contract.py`、`docs\gradio6-native-migration-plan.md`。
- 新增/调整测试：新增端点创建矩阵合同，覆盖全部输入 handle family、双击默认创建、空端点反向拖线、右键类型菜单、文本合并选项、媒体占位节点、Timeline 类型占位和公开 smoke API；migration plan 合同登记本节关键词。
- 验证：分别执行 `node --check javascript\infinite_canvas_workbench.js` 与 `node --check javascript\canvas_workbench\media_timeline.js` 通过；端点矩阵、文本合并、Standalone、节点外观、文本编辑层、模板和 migration plan 聚焦测试共 `39 passed`；Node VM smoke 验证文本输入提供 `text` / `text_merge` 两项并能创建 Text 后自动连入目标端点；在运行中的 Infinite Canvas 独立页面实测文本输入端点双击、右键和反向拖拽，均得到预期创建或兼容节点菜单，随后删除测试节点；`git diff --check` 无空白错误。
- 剩余风险：真实浏览器已覆盖文本端点，但尚未逐一手工操作全部 22 类 handle；扩展测试包含 `tests\test_canvas_audio_node_reupload_contract.py` 时有一个当前工作区既有的 Canvas Agent video-edit quick-tool 断言失败，与本节端点矩阵无关。

## 13.32 Wan / Dasiwa SVI 延长支持可选目标尾帧（2026-08-02）

2026-08-02
- 完成：`Wan-Extent` 与 `Dasiwa-Extent` 从仅接收源视频改为“源视频必需、目标尾帧可选”。普通 Scene 使用 `scene_input_image1` 上传目标尾帧；Director capability 使用 `image_modes=["none", "last_frame"]`，单张图片在 Prompt 资源和分镜运行数据中标记为 `last_frame`。
- 完成：两套 Comfy workflow 将基础 `WanImageToVideoSVIPro` 替换为 `WanSVIProAdvancedI2V`。源视频首帧继续作为 start anchor，源视频末尾 latent 继续传递运动；上传目标尾帧时写入 `end_image` 并启用强度为 1.0 的低噪声结束帧条件。
- 完成：工作流根据 `SceneInput.ip_image1` 是否为 `None` 选择无目标帧或有目标帧的惰性分支。无目标帧时不会读取占位图；高噪声采样使用 `positive_high`，低噪声采样使用 `positive_low`，两阶段共用高级节点输出的 negative conditioning。
- 完成：Wan Video Extend 无限画布模板增加可选目标尾帧图像节点、`scene_input_image1` 上传连接与双语可见文本；模板库说明同步注明目标尾帧可选。界面既有上传控件继续依据 `state.__lang` 使用中文或英文，本模板新增文本同时提供中英文。
- 新增/调整测试：`tests/test_scene_input_workflows.py` 固定两套高级 SVI 分支和采样连接；`tests/test_prompt_actions.py` 固定单张目标图的 `last_frame` 角色；`tests/test_canvas_workbench_director.py`、`tests/test_scene_director_webui_contract.py` 固定 capability；`tests/test_canvas_workbench_template_scene_slots.py` 固定画布上传槽。
- 剩余风险：本节不启动 GPU 模型，尚未对人物大幅位移、跨场景目标图和 0.1 秒短续写进行画质比较。目标图差异较大时可能出现尾段动作过快或形变，需要真实生成样本后再决定是否开放结束帧强度参数。

## 13.33 Wan / Dasiwa SVI 延长目标帧改用主画布（2026-08-02）

2026-08-02
- 修正：`Wan-Extent` 与 `Dasiwa-Extent` 的可选目标尾帧从 `scene_input_image1` 改为 `scene_canvas_image`，额外图片槽保持隐藏；两套 workflow 相应改读 `SceneInput` 的 Canvas 图片输出。
- 修正：两个 preset 设置 `disable_canvas_mask=true`，目标尾帧只接收画布图片，不开放遮罩编辑；Wan Video Extend 模板的上传连接、可见槽和 schema 同步更新。
- 修正：`theme_title` 只保存英文 key，中文标题登记在 `language/cn.json`，界面继续依据 `state.__lang` 选择语言，不再把中英文拼进同一个标题。
- 验证范围：preset 槽位与 mask 契约、中文标题映射、两套 workflow 的 Canvas 输出连接、Prompt 资源角色和无限画布模板连接。
- 验证：Scene、Director、Prompt、无限画布与双语专项测试为 `113 passed, 1 skipped`；预设提示词专项与 Dasiwa preset capability 专项另有 `4 passed`；JSON、Python 语法和 `git diff --check` 均通过。
- 已知失败：完整 `tests/test_preset_agent_prompts.py` 为 `3 passed, 1 failed`，失败项是 LTX2.3 音频输入提示词仍要求“输入首帧”，与本次 Wan / Dasiwa 槽位修正无关。

## 13.34 MiniMax H3 分镜台与真实 LLM 测试稳定性（2026-08-04）

2026-08-04
- 完成：MiniMax H3 分镜台已接入 Studio Scene 和 Infinite Canvas 的 T2VA、I2VA、FL2VA、L2VA、Ref2VA 状态；分镜、主体定义、参考媒体 token、提示词编译和应用状态可以继续编辑并写回当前 Prompt。
- 完成：分镜台的整体优化和单格修改都保留原有镜头数量、时间点、参考媒体字段和 Ref2VA 的一对一主体绑定；单格修改不再要求先通过整段 H3 compiler 校验，用户可以连续修改多个字段后再应用。
- 完成：分镜台可见文本继续从 `state.__lang` 读取语言状态，中文和英文标签、按钮、placeholder、状态提示均使用双语路径；媒体参考只读取当前 H3 preset 已连接的图像和视频，音频只作为 token 和元数据参与 prompt 优化。
- 完成：Custom API 请求增加有限瞬时失败重试，覆盖连接超时、408、425、429 和 5xx，并尊重数值形式的 `Retry-After`；401、403、参数错误和非瞬时响应不会重复请求。响应解析补充 `choices[].text`，减少不同 OpenAI-compatible 服务返回结构造成的空结果。
- 完成：H3 Custom LLM 优化和 Custom API 连通性测试显式关闭思考输出，避免短字段优化的 token 被 reasoning 消耗；Responses API 仍按原有转换规则提交，Chat Completions 才携带 `chat_template_kwargs`。
- 新增：`tests/test_minimax_h3_live_llm.py` 提供真实外部 LLM 合约测试。只有同时设置 `SIMP_AI_RUN_LIVE_LLM_TESTS=1`、`SIMP_AI_LLM_BASE_URL` 和 `SIMP_AI_LLM_MODEL` 时才执行；请求固定 `temperature=0`、`seed=17`、关闭思考并使用 H3 compiler 校验最终结构，普通测试不会访问外部网络。
- 新增/调整测试：Custom API 重试、认证错误不重试、legacy completion text 解析、H3 关闭思考参数和真实 LLM opt-in 入口均有专项覆盖。
- 验证：H3 分镜、prompt compiler、VLM prompt action 和 timeout 专项为 `62 passed`；Custom API、H3 VLM reference contract 与 live test 入口为 `23 passed, 1 skipped`；Node.js 语法检查和 Python `py_compile` 通过。
- 未执行：本机没有可用的 `.vlm_api_profiles.json`、远程 API 环境变量或可确认的 Base URL / Model，因此本次没有发送真实外部 LLM 请求；配置后可单独运行 `tests/test_minimax_h3_live_llm.py`。

## 13.35 MiniMax H3 分镜台视觉参考缩略图（2026-08-04）

2026-08-04
- 调整：H3 分镜台通过 Canvas Custom LLM 做整体优化或单格修改时，视觉参考图会以最长边 512px 的 JPEG 发送；视频参考仍先生成视觉联系表，再按同一 512px 限制发送。
- 保持：普通 Canvas VLM、普通图片编辑和主 Studio Custom VLM 的图片编码策略不变；H3 的音频参考仍只作为 token 和元数据参与，不解码音频内容。
- 目的：H3 分镜优化只需要主体、动作、构图和参考关系，不需要生成级细节；512px 可减少 base64 请求体和外部 LLM 图片处理成本。
- 验证：`tests/test_infinite_canvas_h3_vlm_reference_contract.py` 增加前端参数、后端参数和真实 JPEG 尺寸检查；本次执行 `25 passed`，H3 分镜与 prompt action 稳定性专项为 `62 passed`，Node.js 与 Python 语法检查通过。

## 13.36 MiniMax H3 分镜台便捷性增强路线（规划，2026-08-04）

- 规划背景：当前分镜表主要保存每个镜头的开始时间，镜头时长由下一个镜头的时间点或全片时长间接得到；用户调整一个镜头时，往往还要重新计算后续时间点。MiniMax H3 使用手册中的示例直接采用 `0-3 秒`、`3-8 秒`、`8-12 秒` 的区间写法，因此后续界面应优先使用开始、结束、时长三种可互相换算的显示方式。
- P0 时长编辑：增加可视化时间轴和时间刻度，镜头行显示开始、结束、时长；支持拖动相邻镜头边界、直接输入时长、`+0.5s` / `-0.5s` 快速调整、平均分配剩余时长。默认调整一个镜头时让后续镜头顺延，片尾保持在总时长位置；删除或新增镜头时重新分配相邻区间，减少手算。
- P0 H3 规则提示：H3 分镜台显示当前总时长和 `24 FPS`；H3 总时长按手册限制为 4-15 秒，超出范围时在分镜台内提示。时间轴以秒为主，提供按帧对齐选项；提示词输出改为包含明确起止区间，同时继续解析历史的 `At 00:00.000` 格式。
- P1 镜头编辑效率：增加镜头复制、拆分、合并、拖动排序、连续编号和镜头结构模板；模板至少包含一镜到底、三段叙事和产品展示。桌面端采用“紧凑时间轴 + 当前镜头详情”，减少横向滚动；窄屏保留卡片编辑。所有可见标签、按钮、提示和占位文本继续从 `state.__lang` 读取中英文。
- P1 内容填写辅助：把景别、主体、动作、运镜、对白/画面文字、声音作为可快速聚焦的字段；增加对白长度与镜头时长的提示，支持标记画内声、画外声以及跨镜头对白，明确表达 J-cut / L-cut。保留当前单格 LLM 修改，并增加“压缩到当前时长”“保持主体不变”“补充可见动作”等常用操作。
- P2 参考素材管理：当前参考 token 以插入文本为主，后续增加按镜头绑定参考图、视频和音频的方式，并为每个素材标注人物、场景、动作、运镜、风格、关键帧、音色或音频复用等用途。显示已使用和未使用素材，按当前 H3 模式提示图片、视频、音频数量及组合限制；Ref2VA 继续保持主体与图片的一对一关系。
- P2 连贯性检查：增加跨镜头主体、服装、场景和参考素材的连续性提示；检查指定文字、Logo、对白、背景音乐禁用说明是否写入对应镜头或全局字段。生成前把问题分为阻止提交的规则错误和允许继续的内容建议，避免用户只看到一条笼统提示。
- P3 预览与回退：增加原始 Prompt、当前分镜 Prompt、LLM 优化结果的对照预览；支持分镜表内撤销/重做、恢复上一个版本、自动保存草稿和重新打开后继续编辑。生成后可按镜头时间点抽取结果帧，回看提示词规划与实际画面的差异。
- 范围边界：H3 分镜表的时间轴表示单个 H3 视频内部的镜头节奏；Director Timeline 的时间轴表示多个生成片段的运行与合成时长，两者先保持独立。第一阶段只优化 H3 分镜表，不把两套时间控制合并成一个控件。
- 验证计划：新增时长换算、相邻边界调整、4-15 秒校验、24 FPS 对齐、对白时长提示、镜头拆分/合并、旧 Prompt 解析、双语文本和参考素材角色校验；完成 P0 后再做浏览器交互检查。当前本节仅为规划，未改变源码行为。

## 13.37 MiniMax H3 分镜台 P0 时长编辑实现（2026-08-04）

- 完成：分镜表时间单元格增加开始、结束、时长三个可见值；内部继续保存原有 `start` 字段，旧草稿和现有状态结构不需要迁移。
- 完成：新增分镜时间轴，镜头片段按实际区间显示；相邻边界支持拖动，镜头时长输入会让后续镜头顺延，并限制边界不超过片尾。新增“平均分配”和可选的 24 FPS 按帧对齐。
- 完成：MiniMax H3 分镜台显示总时长和 `24 FPS`，编辑器与 prompt compiler 都校验 H3 输出时长 4-15 秒；超出范围会在分镜台提示并进入生成前校验结果。
- 完成：Prompt 时间标记改为 `[Shot N] start-end s` 区间写法，例如 `[Shot 2] 1.5-3.25s`；编辑器和 compiler 继续解析旧的 `[Shot N] At 00:01.500` 格式，Ref2VA 的主体绑定和媒体 token 不变。
- 完成：compiler 会校验区间起点递增、相邻区间连续、末段结束时间等于目标时长；rewrite request 会保留区间标记，LLM 重写不会丢失镜头时间信息。
- 新增/调整测试：分镜台区间输出、时长重排、按帧结果、4-15 秒校验、时间轴控件合同；compiler 区间解析、区间连续性和总时长校验。
- 验证：`tests/test_minimax_h3_storyboard_editor_contract.py` 为 `21 passed`；`tests/test_minimax_h3_prompt_compiler.py` 为 `16 passed`；JavaScript `node --check`、Python `py_compile` 通过。未启动完整 Studio、GPU 模型或真实 LLM 请求。

## 13.38 MiniMax H3 分镜台新增镜头区间分配（2026-08-04）

- 调整：新增镜头时选择当前最长的时间区间，在中点插入空白镜头；原有总时长、片尾位置和其他镜头顺序保持不变。
- 验证：分镜台合同新增插入区间断言，专项测试继续为 `21 passed`。

## 13.39 MiniMax H3 分镜台对白时长提示（2026-08-04）

- 参考：`I:\dev2\ComfyUI-PromptRelay` 的 Smart Prompt 会把每段文本转换成相对权重，再映射到完整视频区间；该项目没有语音识别或对白语速判断，因此当前分镜台只复用它的“内容权重分配时间”思路，不把 Prompt token 数当作实际对白时长。
- 完成：对白 / 画面文字输入下方显示估算结果。中文按字符、英文及其他单词按词数、数字按独立单位估算，并加入标点停顿和少量开口余量；`无`、`None`、`N/A`、`Silence` 等空对白不会产生时长。明确标注为画面文字的内容不参与说话时长估算。
- 完成：每个镜头新增对白状态提示，可区分无对白、可容纳、时间偏紧和镜头时长不足；镜头操作区增加按建议对白时长调整当前镜头，后续镜头会按原有时间轴规则顺延，片尾位置保持不变。
- 完成：工具栏新增按对白长度分配镜头时长。带对白的镜头按“预计说话时长 + 余量”计算相对权重，没有对白的镜头保留基础节拍；可继续使用 24 FPS 对齐。
- 保持：对白估算只服务于 H3 单视频内部的分镜时间轴，不改变 Director Timeline、媒体引用、Ref2VA 主体绑定或 Prompt 的时间区间格式。
- 新增/调整测试：固定中英文估算、空对白、画面文字排除、超时状态、对白权重分配后的连续区间和双语界面入口。
- 验证：`tests\test_minimax_h3_storyboard_editor_contract.py` 为 `23 passed`；`node --check javascript\minimax_h3_storyboard_editor.js` 通过，`git diff --check` 通过。
- 已知范围：这是规划提示，不等同于 TTS 或真人演讲时长。语速、停顿、多人抢话、唱词和跨镜头 J-cut / L-cut 仍需后续按角色、音频或用户指定语速继续增强。

## 13.40 MiniMax H3 对白比例分配保留非整数片尾（2026-08-04）

- 修正：开启 24 FPS 对齐后，只对镜头之间的边界使用帧单位；当总时长不是完整帧数时，最后一个镜头仍以用户设置的片尾结束，不再因为四舍五入缩短或产生空隙。
- 验证：补充 5.1 秒总时长和 20 镜头的连续区间检查，分镜台专项继续为 `23 passed`。

## 13.41 MiniMax H3 分镜台镜头结构快捷操作（2026-08-04）

- 完成：镜头行增加复制、拆分、合并按钮。复制会保留当前镜头内容并平分当前区间；拆分会保留前半镜头并新增空白后半镜头；合并会把当前镜头与下一个镜头的画面、运镜、对白和声音合并。
- 保持：三种操作都沿用相邻区间规则，片尾和后续镜头时间点保持连续；拆分后的空白镜头需要用户继续填写，未改变生成前校验。
- 新增/调整测试：固定复制、拆分、合并后的镜头数量、内容保留、片尾位置和操作入口。
- 验证：分镜台专项为 `24 passed`；`node --check javascript\minimax_h3_storyboard_editor.js` 通过。

## 13.42 分镜台开发文档 EOF 合同更新（2026-08-04）

- 调整：旧的 Infinite Canvas 文档合同不再把更早的 Models Config 章节作为文档末尾，改为检查当前最新的 H3 分镜台结构操作章节；后续开发记录继续追加到文档最后。
- 验证：`tests\test_canvas_workbench_xyz.py` 为 `8 passed`。

## 13.43 分镜台文档 EOF 合同跟随最新章节（2026-08-04）

- 调整：EOF 合同测试改为检查 13.42 文档章节的最后验证行，避免每次新增开发记录后仍指向旧章节。
- 验证：文档合同与 H3 相关专项复跑时使用最新章节末尾。

## 13.44 分镜台文档合同改为章节存在性检查（2026-08-04）

- 调整：文档合同不再把某一行永久固定为文件末尾，改为检查最新 H3 章节和对应验证记录，后续追加开发记录不会造成无意义的合同改写。
- 验证：`tests\test_canvas_workbench_xyz.py` 继续覆盖文档内容和章节顺序。

## 13.45 MiniMax H3 分镜台撤销与重做（2026-08-05）

- 完成：分镜弹窗顶部增加撤销、重做图标按钮；按钮根据当前历史栈状态启用或禁用，按钮标题和辅助文本依据 `state.__lang` 提供中英文。
- 完成：支持 `Ctrl/Cmd+Z` 撤销、`Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` 重做。撤销或重做后会同时刷新镜头表、时间轴、结束时间、对白时长提示和操作按钮状态。
- 完成：镜头文本和全局文本采用一次编辑一次记录的方式，连续输入不会为每个字符建立历史项；失焦、字段切换、应用和其他操作前会提交当前文本编辑。
- 完成：时长输入、时间轴边界拖动、平均分配、对白比例分配、对白时长调整、增加、删除、复制、拆分、合并、排序、重置和 LLM 编辑均纳入历史记录。时间轴拖动在松开或取消时只记录一次。
- 保持：历史记录只存在于当前分镜弹窗，关闭后不写入 Prompt；取消不会改变外部状态，只有应用时才写回当前 Prompt。
- 新增/调整测试：增加历史栈撤销、重做和新编辑清空 redo 的合同测试，并固定双语按钮、快捷键、文本编辑提交和时间轴拖动入口。
- 验证：`tests\test_minimax_h3_storyboard_editor_contract.py` 为 `25 passed`；`node --check javascript\minimax_h3_storyboard_editor.js`、`python -m py_compile tests\test_minimax_h3_storyboard_editor_contract.py` 通过。
- 已知环境提示：pytest 报告了工作区 `.pytest_cache` 无法写入的权限警告，不影响本次测试结果；未启动完整 Studio、GPU 模型或浏览器交互验证。

## 13.46 MiniMax H3 分镜台结构模板与拖动排序（2026-08-05）

- 完成：增加“一镜到底”“三段叙事”“产品展示”三个镜头结构模板。模板会按当前界面语言生成可编辑草稿，已有镜头内容优先保留；目标镜头数减少时，尾部内容合并到最后一个镜头，不直接丢弃已有文字。
- 完成：镜头表第一列增加拖动手柄，支持把镜头移动到任意位置；排序只交换镜头内容和原有时间槽，开始时间、片尾位置和相邻区间仍保持连续。原有上移、下移按钮继续保留。
- 保持：模板应用和拖动排序都写入当前分镜弹窗的撤销/重做历史；取消弹窗不会改变外部 Prompt，应用时仍由原有 H3 校验统一检查。
- 新增/调整测试：模板数量、双语草稿、已有内容保留、任意位置排序、时间槽保持和拖动控件合同测试。
- 验证：`tests\\test_minimax_h3_storyboard_editor_contract.py` 为 `27 passed`；`node --check javascript\\minimax_h3_storyboard_editor.js`、Python 语法检查和 `git diff --check` 通过。
- 未完成：按镜头绑定参考图/视频/音频、跨镜头连续性提示、Prompt 对照预览、自动保存和生成结果帧预览；完整 Studio、GPU、真实 LLM 和浏览器交互仍未执行。

## 13.47 MiniMax H3 分镜台表格越界修正（2026-08-05）

- 修正：重新分配分镜表七列宽度，使桌面弹窗内容区内可以完整容纳首列、时间、画面、运镜、对白、声音和操作列，减少无意义的横向滚动。
- 修正：弹窗、正文、表格容器和 AI 编辑输入增加 `min-width: 0`；首列镜头名称允许换行，操作按钮固定为三列网格，避免图标按钮把操作列撑出边界。
- 保持：窄屏仍允许表格在独立容器内横向查看，不改变镜头字段、时间轴和操作行为。
- 新增/调整测试：固定桌面列宽合计、容器最小宽度、首列换行和操作按钮网格规则。
- 验证：分镜台专项为 `28 passed`；`node --check javascript\\minimax_h3_storyboard_editor.js` 和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.48 MiniMax H3 分镜台前两列紧凑布局（2026-08-05）

- 调整：镜头列改为拖动手柄加两行编号显示，避免图标、文字和编号挤在同一行。
- 调整：时间列改为两行结构，第一行显示开始—结束区间，第二行显示可编辑的镜头时长；保留原有 `start`、`end`、`duration` 数据和时间轴行为。
- 调整：前两列宽度分别收缩到 `92px` 和 `150px`，释放空间给画面、运镜、对白和声音字段。
- 新增/调整测试：固定两行时间控件、两行镜头编号、列宽总和和旧时间字段选择器兼容性。
- 验证：分镜台专项为 `28 passed`；Node 语法检查、时间区间运行检查和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.49 MiniMax H3 分镜台前两列视觉密度调整（2026-08-05）

- 调整：镜头编号区域去掉重复的场记板图标，改为拖动手柄、镜头标题和两位编号，减少视觉噪声。
- 调整：时间区域去掉左侧“区间”标签，顶部直接显示开始—结束输入，底部显示时长输入；输入高度统一为 `28px`，前两列宽度收缩为 `88px` 和 `142px`。
- 保持：开始时间、结束时间、镜头时长的 `data-h3sb-shot-field` 和时间轴刷新逻辑不变。
- 验证：分镜台专项为 `28 passed`；Node 语法检查和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.51 MiniMax H3 分镜台编号居中（2026-08-05）

- 调整：第一列编号块占满单元格内容宽度，`01`、`02`、`03` 在第一列中线位置居中。
- 保持：拖动手柄绝对定位在第一列左侧，不再参与编号的水平排版；镜头标题仍显示在编号上方。
- 验证：分镜台专项为 `28 passed`；Node 语法检查和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.50 MiniMax H3 分镜台编号换行与时间文本显示（2026-08-05）

- 修正：镜头列通过更高优先级样式强制“镜头标题 / 两位编号”上下排列，避免通用 `span` 样式把编号重新排回同一行。
- 修正：开始时间和镜头时长改为带 decimal 输入模式的文本框，去掉浏览器数字微调箭头，完整显示 `1.667` 等小数值；原有字段名和时间校验逻辑不变。
- 新增/调整测试：固定编号强制换行、时间文本输入模式和小数时间字段兼容性。
- 验证：分镜台专项为 `28 passed`；Node 语法检查和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.52 MiniMax H3 分镜台编号定位与 Ref2VA 绑定显示（2026-08-05）

- 修正：第一列编号块相对第一列单元格居中，拖动手柄独立固定在左侧，不再参与编号排版。
- 调整：Ref2VA 自动生成的 `<Subject N> (<Picture N>)` 保留在生成 Prompt 中，但在表格里改为单独的素材绑定标记，画面 / 动作输入框只显示正文。
- 修正：只有素材绑定标记的空镜头仍会被判定为空，必须填写画面、运镜、对白或声音后才能通过校验。
- 新增/调整测试：固定第一列居中样式、绑定标记独立显示和空镜头校验；分镜台专项为 `29 passed`。
- 验证：Node 语法检查和 `git diff --check` 通过。

## 13.53 MiniMax H3 分镜台参考绑定可编辑（2026-08-05）

- 完成：素材绑定从只读“自动”标记改为可编辑选择框，提供“自动”“不绑定”和具体 `<Subject N> (<Picture N>)` 绑定。
- 完成：切换绑定后会清除旧主体标记，只在当前镜头保留一个绑定；不绑定时从该镜头移除主体 / 图片绑定。
- 修正：模板应用、旧 Prompt 解析和镜头整理不会再把其他镜头的主体标记合并进当前镜头。
- 调整：Ref2VA 画面 / 动作占位提示不再固定展示 `<Subject 1>`，避免和当前绑定选择冲突。
- 新增/调整测试：固定绑定切换、取消绑定、旧标记清理和 Prompt 输出；分镜台专项为 `30 passed`，其他相关专项为 `35 passed`。
- 验证：Node 语法检查和 `git diff --check` 通过。

## 13.54 MiniMax H3 Prompt 镜头字段完整输出（2026-08-05）

- 修正：每个镜头固定输出 `Camera:`、`Dialogue and visible text:`、`Synchronized sound:`，不再因为用户留空而省略字段。
- 调整：中文空字段使用“无”“静音”；英文空字段使用 `None`、`Silence`；空运镜使用明确的固定机位描述。用户已填写的内容保持原样。
- 保持：字段顺序、镜头时间区间、主体与图片绑定和六段 Ref2VA 章节顺序不变；Prompt 重新解析后镜头数量和起始时间保持一致。
- 新增/调整测试：覆盖中英文默认字段、字段顺序、实际 `formatPrompt()` 输出交给 `validate_prompt()` 检查，以及三主体四镜头示例的解析、重新生成和主体编号隔离。
- 验证：分镜台与 MiniMax H3 compiler 专项共 `47 passed`；用户提供的三主体四镜头 Prompt 实际生成、解析、重新生成和 compiler 校验通过；Node/Python 语法检查通过。
- 已知环境提示：pytest 仍报告工作区 `.pytest_cache` 无法写入的权限警告，不影响测试结果。

## 13.55 MiniMax H3 分镜台时间轴状态可视化（2026-08-05）

- 完成：时间轴镜头段显示镜头编号、时间区间、主体/图片绑定和四个镜头字段的填写进度，不再只显示“镜头 1 / 镜头 2”。
- 完成：时间轴按内容状态区分颜色；有画面描述的镜头显示已填写，只有运镜或其他字段的镜头提示待填画面，完全没有内容的镜头显示为空镜头。
- 完成：点击时间轴镜头段会高亮对应表格行并滚动到该镜头；聚焦表格字段、调整时间边界和执行镜头操作时，时间轴同步更新当前镜头高亮。
- 保持：时间边界拖动、镜头排序、主体绑定和撤销/重做逻辑不变；窄屏仍由表格容器独立滚动。
- 新增/调整测试：固定时间轴状态分类、主体绑定摘要、字段进度图标、镜头行同步高亮和点击定位入口。
- 验证：分镜台与 MiniMax H3 compiler 专项共 `48 passed`；Node 语法检查和 `git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.56 分镜表输入屏蔽 Canvas S 快捷键（2026-08-05）

- 修正：在分镜弹窗输入文字时，外层 Canvas 的 `KeyS` 全屏/适配快捷键不再响应，避免输入字母 `S` 时放大或全屏显示外部图片。
- 调整：`zoom.js` 和自定义 Canvas 编辑器在分镜弹窗存在时跳过 Canvas 快捷键；分镜弹窗键盘事件停止继续传播，但不阻止文字输入本身。
- 新增/调整测试：固定两套 Canvas 快捷键入口和分镜弹窗键盘事件的屏蔽规则。
- 验证：分镜台专项为 `33 passed`；`node --check` 检查分镜台、`zoom.js` 和自定义 Canvas 编辑器通过；`git diff --check` 通过。

## 13.57 分镜时间轴状态输入后即时刷新（2026-08-05）

- 修正：分镜表输入画面、运镜、对白或声音后，时间轴立即重新计算字段进度和“已填写 / 待填画面 / 空镜头”状态。
- 修正：避免表格内容已经更新，但时间轴仍显示旧的 `0/4 · 空镜头`，造成后续镜头检测失败的误判。
- 新增/调整测试：固定镜头字段输入处理顺序，确保状态写入后调用时间轴刷新。
- 验证：分镜台与 MiniMax H3 compiler 专项共 `50 passed`；Node 语法检查通过。

## 13.58 分镜时间轴多图片缩略图（2026-08-05）

- 完成：时间轴按镜头正文中的全部 `<Picture N>` 收集图片引用，同一镜头引用多张图片时同时显示多张缩略图。
- 完成：缩略图优先读取素材清单里的预览地址；没有预览地址时显示图片占位图标，并保留图片编号提示。
- 修正：Ref2VA 的自动 / 手动主绑定只在镜头没有明确图片引用时作为单图回退；切换主绑定不会清除同镜头的其他主体—图片引用。
- 新增/调整测试：覆盖多图片引用保留、缩略图预览地址、自动回退和不绑定行为；分镜台与 MiniMax H3 compiler 专项共 `51 passed`。

## 13.59 Ref2VA 保留分析结构化编辑（2026-08-05）

- 完成：`retention_analysis` 改为按每个 Picture / Video / Audio 显示独立的“保留方式”和“参考内容”选择器。
- 完成：图片参考内容提供身份外观、面容发型、服装配色、姿态动作、场景构图、产品设计等预设；选择“自定义”后才显示自定义输入框。
- 调整：默认生成内容不再只有 `fully_preserved`，图片会明确写出身份、面容、发型、服装、配色和饰品等参考范围；下方只读区域显示最终 Prompt 文本。
- 修正：读取旧的 `<Picture N>: fully_preserved` 行时自动补充默认参考内容；已有自定义说明的行保持原文。
- 保持：旧的手写 retention 文本仍能解析；LLM 修改、撤销 / 重做和编译器所需的标准保留方式不变。
- 新增/调整测试：覆盖选择器字段、预设内容解析、自定义内容、默认输出和旧格式兼容；分镜台与 MiniMax H3 compiler 专项共 `52 passed`。

## 13.60 Ref2VA 镜头直接引用图片与运镜快捷选项（2026-08-05）

- 完成：Camera 单元格增加固定机位、缓慢 / 快速推进、缓慢 / 快速后拉、缓慢 / 快速横移、中景跟拍、环绕主体等快捷选项；选中后写入文本框，用户仍可继续手工修改，修改后回到“自定义运镜”。
- 调整：移除分镜行内的 Subject 绑定选择器和自动绑定逻辑；`reference_binding` 默认记录为 `none`，不再因为镜头顺序自动插入 `<Subject N> (<Picture N>)`。
- 调整：Ref2VA 镜头直接保留 `<Picture N>`，同一镜头可以使用多个图片引用；时间轴摘要和缩略图显示 `P1 + P2`，不再显示 `S1/P1`。
- 兼容：旧 Prompt 中的 `<Subject N> (<Picture N>)` 会转换为对应的 `<Picture N>`；重复图片标签会去重，旧的主体保护套话不会继续留在镜头正文中。
- 调整：Prompt compiler 将 Subject 与 Picture 的对应关系限制在 `subject_definitions`，允许镜头直接写一个或多个 `<Picture N>`，只有用户明确要求时才在镜头内使用 Subject 标签。
- 新增/调整测试：覆盖 Camera 快捷项和自定义识别、旧 Subject 格式清理、多图片同镜头保留、无绑定时间轴状态和新版 compiler 提示；相关专项共 `80 passed`。
- 验证：Node/Python 语法检查和指定文件 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。

## 13.61 Camera 下拉选项深色主题可读性修正（2026-08-05）

- 修正：Camera 快捷下拉和镜头结构下拉的原生选项改用浅色文字、深色背景，避免选项文字变成黑色后无法阅读。
- 调整：两个下拉开启 `color-scheme: dark`，保持系统原生高亮状态与编辑器深色界面一致。
- 验证：分镜台专项 `37 passed`，Node 语法检查通过。

## 13.62 MiniMax H3 Ref2VA 参考图保留原始输入（2026-08-06）

- 修正：`MiniMax-H3(R2V)` 参考图不再经过 Scene 入口默认的 1MP 通用缩放；预设使用 `-normalization` 保留上传图的输入尺寸和宽高比。
- 修正：H3 Ref2VA 工作流的参考图尺寸策略从 `match` 改为 `max`，不再按视频输出面积缩小参考图；视频画布仍使用 Resolution 控件选择的目标宽高。
- 保持：参考图仍受 MiniMax H3 参考编码自身的尺寸上限约束，超过上限时按模型限制缩小；R2V 仍是参考条件，不等同于 I2V 的首帧像素复现。
- 新增/调整测试：固定 R2V 预设跳过通用参考图缩放，并固定实际 Scene 工作流使用 `ref_image_size=max`。

## 13.63 Creative 对话裸命令触发生图卡片（2026-08-06）

- 修正：Creative 模式下用户单独输入“生成”时，意图识别不再等待“生成图片 / 生成画面”等完整短语，继续走 `generate_image` 动作恢复，不再误进入普通文本回复流程。
- 修正：模型只返回完整画面描述、没有返回动作 JSON 时，系统会把足够完整的文本直接作为生图卡片 Prompt，避免卡片缺失或只得到“生成”两个字的无效 Prompt。
- 新增测试：覆盖“生成”裸命令、普通文本画面描述、`generate_image` 恢复及视觉导演跳过条件。

## 13.64 VLM 对话支持用户级系统提示词文档（2026-08-06）

- 新增：VLM 对话弹窗增加用户文档选择、名称、内容编辑、保存和删除入口；用户文档按服务端识别的用户 DID 保存为个人 Markdown 文件，访客使用独立的 guest 目录。
- 调整：内置系统提示词文档与用户文档分开管理；未手动修改合并结果时，发送给模型的 system prompt 按“内置文档 + 用户级系统提示词”顺序拼接，并使用固定的中英双语分隔标记。
- 保持：原有 system prompt 编辑框继续可用；用户手动修改合并结果后按手动内容发送，不会再次自动覆盖。
- 调整：对话设置和导入导出数据保存内置文档、用户文档、模板 ID 与手动覆盖状态，兼容旧版只保存一段自定义 system prompt 的数据。
- 新增接口：`/vlm-user-system-prompt-templates/save`、`/vlm-user-system-prompt-templates/delete`；模板文件名经过限制，保存使用临时文件替换，避免写入用户目录之外。
- 新增/调整测试：覆盖用户文档创建、读取、删除、路径限制、内置文档与用户文档的合并顺序、手动覆盖、前端控件和接口合同。

## 13.65 VLM 用户项目入口恢复为紧凑下拉布局（2026-08-06）

- 调整：恢复 VLM 对话原有的模式、模板和 system prompt 三列主界面，不再在主界面常驻用户项目名称和内容编辑区。
- 调整：用户项目追加到原模板下拉框的后部，使用独立的“用户项目”选项组；方形文件夹按钮只负责打开用户项目管理弹窗。
- 新增：用户项目管理弹窗承载已有项目选择、名称、内容、保存和删除操作，保存后主下拉框自动显示新项目，原 system prompt 合并逻辑保持不变。
- 新增/调整测试：固定主界面行数、下拉选项组、方形入口、弹窗字段和保存接口合同。

## 13.65 MiniMax H3 三套 Scene workflow 增加十组 LoRA 输入（2026-08-06）

- 修正：`scene_minimax_h3_i2v_cn_api.json`、`scene_minimax_h3_r2v_cn_api.json` 和 `scene_minimax_h3_t2v_cn_api.json` 都增加 `lora_1` 到 `lora_10` 十个 `LoraLoaderModelOnly` 输入。
- 调整：十组 LoRA 按顺序串联在 H3 `EasyCache` 后，默认使用 `placeholder.safetensors` 和 `strength_model=0`；采样器与 Guider 改用 `lora_10` 输出。
- 保持：三套 workflow 原有的视频生成模式、H3 模型选择、缓存设置和 R2V 参考图尺寸策略不变。
- 新增测试：`tests/test_minimax_h3_lora_workflows.py` 固定三套 workflow 的十组 LoRA 标题、默认值、串联顺序和采样连接。
- 验证：专项测试 `1 passed`；三套 workflow JSON 解析通过；`git diff --check` 通过。pytest 仍有既有 `.pytest_cache` 无法写入的权限警告。

## 13.66 VLM 用户项目管理弹窗独立顶层层级（2026-08-06）

- 修正：用户项目管理弹窗从 VLM 主对话弹窗内部移到 `simpleai_floating_host` 的独立顶层节点，不再受到主对话暗色覆盖层影响。
- 调整：管理弹窗使用高于主对话层的固定层级，卡片明确保持正常不透明度和滤镜；关闭主对话时同步关闭管理弹窗，避免留下独立遮罩。
- 保持：项目选择、名称和内容编辑、保存、删除、主模板下拉框同步及内置文档与用户文档拼接逻辑不变。
- 新增/调整测试：固定管理弹窗独立宿主、弹窗层级和前端字段同步合同。

## 13.67 修正用户项目管理弹窗透明背景（2026-08-06）

- 修正：用户项目管理弹窗移到 `simpleai_floating_host` 后，补回原 VLM 面板使用的背景、文字、边框和按钮颜色变量，卡片不再透出后方暗色覆盖层。
- 保持：弹窗独立顶层宿主、方形入口、原下拉列表和用户项目保存/删除流程不变。
- 新增/调整测试：固定独立弹窗根节点必须提供深色面板和文字变量，避免后续节点移动再次造成背景声明失效。

## 13.68 MiniMax H3 视频初始 latent 编码提速（2026-08-07）

- 调整：源视频已经符合目标尺寸时跳过缩放；需要缩放时改用批量 `bicubic`，不再逐帧经过 PIL `lanczos` 转换。
- 调整：MiniMax H3 视频 VAE 编码优先关闭空间分块，减少高分辨率视频的空间块编码次数；显存不足时自动恢复原有分块路径并清理缓存。
- 保持：节点输入、输出、旧 workflow 连接、H3 时序分块规则和音频 latent 编码不变；已有 `source_latent` 路径不受影响。
- 新增测试：覆盖同尺寸跳过缩放、批量 `bicubic` 参数，以及 H3 VAE 非分块编码失败后的分块回退。
- 验证：`tests/test_minimax_h3_video_upscale_node.py` 共 `9 passed`；目标节点和专项测试文件 `py_compile` 通过。pytest 仍有既有 `.pytest_cache` 无权限警告，以及依赖库弃用警告。

## 13.69 MiniMax H3 整帧编码索引限制回退（2026-08-07）

- 修正：整帧 H3 VAE 编码遇到 PyTorch `input tensor must fit into 32-bit index math` 时，不再直接终止节点，自动恢复空间分块编码。
- 保持：普通非 OOM 编码异常继续直接抛出，不会把未知错误静默改为分块路径。
- 新增测试：覆盖显存 OOM 和 32-bit index math 两种整帧编码失败后的回退。

## 13.70 回退 MiniMax H3 视频初始 latent 编码提速尝试（2026-08-07）

- 回退：移除源视频批量 `bicubic` 缩放、同尺寸跳过缩放、整帧 H3 VAE 编码和异常回退逻辑，恢复原有 `lanczos` 缩放及 VAE 空间分块行为。
- 回退：删除对应专项测试改动，节点接口、workflow 连接和原始编码路径恢复到本次提速尝试之前。
- 说明：前两次提速尝试没有带来可接受的稳定性或速度改善，后续需要基于实际设备和 workflow 单独测量后再制定方案。

## 13.71 MiniMax H3 Turbo custom node 更新合并（2026-08-07）

- 合并：将外部 `ComfyUI-MiniMax-H3-Turbo` `v1.2.3` 的 `ModelSamplingAV` 采样适配和 int8 fused `fc2` LoRA 处理并入项目内 custom node。
- 保持：项目本地对 H3 `layout/refs` 条件段、视觉 / 音频噪声增强时间和现有节点名称、workflow 连接的处理不变。
- 调整：新 ComfyUI 使用普通单调度 Euler 更新，旧版本继续使用视频 / 音频双调度；int8 fused `fc2` 改走 merge 路径，其余模块继续按原有 bypass / low VRAM 模式处理。
- 更新：custom node 元数据版本提升到 `1.2.3`，README 增加跨 ComfyUI 版本的采样行为说明；许可证、模型包和示例 workflow 与外部版本一致，无需重复更新。

## 13.73 采样预览按批次循环并在新帧到达时切换（2026-08-07）

- 调整：同一采样步骤的预览帧进入当前批次后持续循环播放；新步骤的第一张预览帧到达时清空旧批次，播放索引从第 1 帧开始。
- 修正：后端使用稳定的采样步 key 归并帧，不再因为 ETA 或状态文字变化误清空当前批次。
- 修正：Canvas 空轮询和带旧 `response.preview` 的响应不会改变当前播放批次；只有 `frames_delta` 中出现新帧时才切换。
- 新增/调整测试：覆盖同一步累计帧、下一步替换批次、空响应保持原批次和 Gradio / Canvas 的批次切换合同。

## 13.74 MiniMax H3 R2I 图编 preset 与 Agent 路由（2026-08-08）

- 新增：`MiniMax-H3(R2I)` preset、`scene_minimax_h3_r2i_cn_api.json` workflow 和 `MiniMaxH3ReferenceToImage` 节点；R2I 只接收 1-5 张有序图片参考，输出图片，不接收视频和音频。
- 调整：Canvas Agent 图片编辑队列在 `Flux2-KleinEdit` 后加入 `MiniMax-H3(R2I)`；R2I 使用独立的 `minimax_h3_image_edit` 提示词目标，保留源图身份、构图、姿态、光照和未请求修改的内容。
- 调整：VLM Chat 支持 `r2i`、`ref_to_image`、`reference_to_image`，H3 preset family 和图片编辑 / 物体迁移优先级加入 R2I。
- 新增：`docs/vlm_skills/image_editing.md`，按 `stage.__lang` 选择语言状态，规定源图依据、`<Picture N>` 参考标签、编辑范围、确认边界和 R2I 专用规则；skill index、README、Agent companion、preset calling 和 preset guide 同步追加说明。
- 调整：中文 preset 名称改为 `MiniMax-H3图编`，缺失模型标记同步更新；Reference-to-Image 标题翻译改为图像编辑 / 图编。
- 新增/调整测试：覆盖 R2I preset 任务、五组图片参考连接、图片输出节点、无音视频节点、Canvas Agent skill 注入、语言状态、Agent 队列、VLM Chat 路由和中文名；专项测试 `169 passed`。pytest 仍有既有 `.pytest_cache` 权限警告和 Triton 弃用警告。

## 13.75 MiniMax H3 图编固定五帧（2026-08-08）

- 修正：`scene_minimax_h3_r2i_cn_api.json` 的 `MiniMaxH3ReferenceToImage.length` 固定为 5 帧，不再把隐藏的 `video_duration=5` 按 24 fps 换算成约 5 秒的视频长度。
- 保持：R2I 继续只输出图片，`ImageFromBatch` 仍取生成结果的第一帧；隐藏的 `video_duration` 仅保留给 `SceneInput` 兼容，不参与 R2I 帧数计算。
- 新增/调整测试：固定 R2I workflow 的 5 帧输入，并确认不存在秒数换算节点。

## 13.76 MiniMax H3 图编默认分辨率调整（2026-08-08）

- 调整：`MiniMax-H3(R2I)` 的默认比例改为 `1024*1024`，Resolution 控件基础宽高和 R2I workflow 的 `SceneInput` 同步为 `1024×1024`。
- 保持：原有 R2I 可选比例继续保留，同时将 `1024|1:1` 作为首个默认比例选项；固定 5 帧的生成长度不变。
- 新增/调整测试：固定预设默认比例、Resolution 基础尺寸和 workflow 默认宽高均为 1024。

## 13.77 MiniMax H3 图编推荐提示词指引（2026-08-08）

- 新增：presets/scene_prompt_recommendations/MiniMax-H3(R2I).csv，提供 8 组图编推荐，包括局部编辑、移除物体、换背景、服装迁移、风格与光照迁移、姿态迁移、商品合成和多人物合成。
- 调整：推荐内容按 H3 Ref2VA 的六段式结构组织：subject_definitions、summary、retention_analysis、detailed_description、overall_soundscape、non_diegetic_music；R2I 示例只使用图片参考，不加入视频或音频参考。
- 调整：推荐 CSV 支持 prompt_en / prompt_cn，服务端按前端 state.__lang 对应的语言返回内容；旧的单一 prompt 字段继续兼容。
- 调整：推荐提示弹窗保留结构化 prompt 的换行，用户点击 推荐提示 后可以直接查看完整段落并写入提示词框。
- 新增/调整测试：覆盖 R2I 推荐文件发现、8 组推荐、六段式字段、中英文 prompt 选择、图片参考限制和弹窗换行样式。

## 13.78 MiniMax H3 图编节点移入 SimpAINodes（2026-08-08）

- 调整：移除 `comfy/comfy_extras/nodes_minimax_h3.py` 中的 `MiniMaxH3ReferenceToImage` 类和核心扩展注册，不再修改 ComfyUI 内核节点文件。
- 新增：`comfy/custom_nodes/SimpAINodes/SimpAIMiniMaxH3ReferenceToImage.py`，在 SimpAINodes 中注册同名 `MiniMaxH3ReferenceToImage`，复用 H3 参考条件执行逻辑。
- 保持：R2I workflow 的 `class_type`、1024×1024 默认分辨率、固定 5 帧、最多 5 张图片参考、无视频和音频输入均不变；节点显示名使用“MiniMax H3 图编”。
- 新增测试：检查核心扩展不再包含 R2I，SimpAINodes 模块和聚合入口均完成注册，并确认 workflow 节点名仍与注册名一致。
- 修正：R2I 预设隐藏 `scene_var_number4` 音频位移控件，使界面与音频禁用策略一致。

## 13.79 MiniMax H3 参考音频编码兼容修正（2026-08-23）

- 修正：Comfyd 0.33.0 将 `_encode_ref_audio` 从 `MiniMaxH3ReferenceToVideo` 类方法调整为 `comfy_extras.nodes_minimax_h3` 模块函数后，SimpAI H3 自适应参考节点仍调用旧类方法，导致带参考音频的 R2V/R2C 在生成前报 `AttributeError`。
- 调整：自适应参考节点改为直接复用当前 H3 模块级音频编码函数，保留采样率转换、audio VAE 编码和 `ref_audio_t` 计算逻辑；图片参考、视频参考和无音频路径不变。
- 新增测试：自适应参考节点专项探针实际执行一条 standalone `ref_audios` 路径，检查新版本 H3 audio VAE 编码入口可用。
- 验证：已执行 H3 自适应参考专项测试；未启动完整 Studio、GPU 模型或真实浏览器生成。

## 13.80 MiniMax H3 续写布局补丁兼容 Comfyd 0.33.0（2026-08-23）

- 修正：Comfyd 0.33.0 的 `PackedLayout` 移除了 `frame_count` 参数，H3 续写的动作上下文布局补丁自检因此失败，随后节点报 `SimpAI H3 motion context layout patch is unavailable`。
- 调整：布局补丁根据当前 `PackedLayout.__init__` 签名决定是否传递旧版 `frame_count`；自检样本补充真实 keyframe latent，并使用浮点近似比较时间轴，兼容新版时间坐标计算。
- 保持：续写的上下文 latent、参考音频、keyframe 排列和输出裁剪逻辑不变；未修改 R2C preset 的图片数量配置。
- 验证：`tests/test_minimax_h3_motion_context.py` 为 `7 passed`，相关 H3 组合测试为 `21 passed`；组合测试另有 1 个工作区既有 preset 合同失败，当前 R2C 的 `max_images=9` 与测试期望 `5` 不一致。
- 补充验证：增加带图片参考、续写 keyframe 和时间轴音频参考的 `PackedLayout` 回归覆盖，确认 R2C 的实际参考媒体组合可以完成布局构造。
- 计数更正：加入上述回归后，`tests/test_minimax_h3_motion_context.py` 为 `8 passed`；H3 组合测试实际为 `22 passed, 1 failed`，唯一失败仍是 R2C `max_images=9` 与测试期望 `5` 的工作区预设合同不一致。

## 13.81 MiniMax H3 R2C 智能体续写语义校正（2026-08-23）

- 修正：R2C 不再复用 R2V 的 `attribute_transfer` 动作迁移语义；上一段 H3 视频明确作为续写来源，参考图片只负责身份和外观。
- 调整：系统提示和改写请求要求从上一段视频的精确结束状态继续，并在 `detailed_description` 中使用 `<Video N>`；使用身份图片时，要求与续写视频出现在同一镜头中。
- 校验：新增对摘要缺少 `video continuation`、`retention_analysis` 误用 `attribute_transfer`、详细描述缺少续写视频、图片身份未写入保留分析等情况的告警。
- 上下文：从任务的 `task_method`、`task_name`、`continuation_source` 和 `state.__lang` 读取 R2C 与语言状态，保留 R2V 的动作迁移规则。
- 测试：新增 R2C 上下文、提示规则、截图类错误文本和有效图片配对覆盖；prompt compiler 专项测试为 `34 passed`。

## 13.82 MiniMax H3 R2C 允许参考角色在续写段落中后续出现（2026-08-23）

- 修正：R2C 不再假定上一段视频最后一帧中的角色必须继续出现；上一段视频主要提供场景、时间、镜头、光线、动作方向和声音连续性。
- 调整：参考图片可作为后续角色的身份与外观依据，角色可以在上一段末尾未出现的情况下，于续写镜头中继续出现或进入画面；仍要求角色来自 `<Picture N>` 或用户明确意图。
- 保持：不允许无依据生成角色，也不允许无提示地替换上一段已有主体；R2V 的动作迁移规则不变。
- 测试：新增“上一段末尾为空走廊、续写段落中参考角色进入画面”的校验覆盖。

## 13.83 MiniMax H3 R2I 智能扩写改为静态图片提示词（2026-08-23）

- 修正：R2I 不再复用 Ref2VA 视频分镜编译器；参考图扩写只生成一段完整的静态图片生成或编辑提示词。
- 调整：R2I 使用独立 `image_reference` 路由，只允许 `<Picture N>`，不再要求 `subject_definitions`、`summary`、`retention_analysis`、时间轴、`[Shot N]`、对白、音效或视频参考字段。
- 调整：Canvas Agent 的 R2I 提示词改写只加载图像编辑规则，不再加载 H3 Ref2VA 分镜 skill；prompt action 仍按图片参考能力处理最多 9 张参考图。
- 校验：R2I 输出如果包含 H3 分段、分镜标记、时间戳、`Camera:`、`Dialogue and visible text:`、`Synchronized sound:` 或视频 / 音频标签，将给出错误提示。
- 测试：新增 R2I 路由、静态提示词合同、错误分镜校验、Canvas skill 选择和 prompt action 能力识别覆盖；专项测试通过。

## 13.84 MiniMax H3 R2I 推荐提示改为单段图像编辑指令（2026-08-23）

- 修正：R2I 推荐提示 CSV 不再生成六段式 H3 分镜内容，避免用户点击推荐提示后再次带入时间轴和音视频字段。
- 调整：8 组中英文推荐统一改为单段静态图片生成或编辑指令，继续保留 `<Picture N>` 的顺序和每张参考图的职责说明。
- 测试：推荐提示逐条通过 R2I 静态提示词校验，并确认不含 `[Shot N]`、`Camera:`、对白、同步音效、视频或音频标签。

## 13.85 右键菜单支持预设节点搜索（2026-09-06）

- 修正：右键添加节点的搜索源原先只有固定菜单项，不含预设目录；现在支持按预设原名、显示名、引擎、任务类型和主题搜索，输入 `z`、`Z`、`Z-imageT` 或 `zimage` 可找到对应预设。
- 交互：预设结果优先显示，点击后解析预设定义并在右键位置创建节点；未输入搜索词时保留原来的分类菜单，预设目录不会占据分类列表。
- 异步：打开菜单时复用预设目录刷新，完成后更新当前菜单结果，保留输入文本和输入元素；已关闭或被其他菜单替换时不再更新。定义不可用时显示中英文提示，不创建节点。
- 语言：复用现有 `t` 和 `localizeCanvasLabel`，沿用 `state.__lang` 对应的工作台语言选择；未增加 Gradio 3.x 适配。
- 验证：`node --test tests/canvas_context_menu_preset_search.test.cjs` 为 `6 passed`，覆盖双语大小写搜索、名称、菜单路径、创建位置、空目录、异步刷新、过期菜单和定义缺失。首次执行的空目录断言错误地要求无任何模糊匹配结果，已改为检查不出现无操作的预设分类，重新执行全部通过。
- 未执行：未启动完整 Studio、GPU 模型、长期服务或真实浏览器验证。
- 维护评估：修改前主文件为 48,488 行、2,655,871 字节；虽已使用 `canvas_workbench` 独立模块，主文件仍集中大量业务逻辑，并存在 `openAddNodeMenu` 提前返回后的旧菜单代码。建议后续分别迁移菜单与搜索、预设目录、Canvas Agent 等功能，每次迁移保留专项行为测试；本次未执行整体重构或删除无关旧代码。

## 13.86 右键预设搜索运行版本核对（2026-09-06）

- 用户反馈：搜索 `Z`、`Krea`、`h3` 仍没有预设结果；13.85 的测试通过不能视为安装版页面已修复。
- 实际运行：当前 7888 服务使用 E 盘 `E:/SimpleAI/SimpAI_Studio_win` 安装环境，开发修改位于 I 盘工作区。服务返回的画布脚本为 2,704,359 字节，与 E 盘安装文件大小一致，不含新增的 `searchOnly: true` 和菜单目录刷新逻辑，且与开发文件内容不同。
- 浏览器核对：现有服务的“添加预设”列表包含 `Z-imageT`、`Krea2-Turbo`、`Krea2-ImageEdit` 和多个 MiniMax H3 预设，预设目录可用。右键搜索所需的开发修改尚未进入该服务脚本。
- 测试：增加 `Z`、`Krea`、`h3` 在中英文模式下生成搜索结果 HTML 和可执行按钮路径的检查，避免只测试候选数组。
- 未执行：没有覆盖 E 盘压缩脚本、更新安装包或启动另一套 Studio。安装版仍需通过对应发布流程应用修复；刷新页面不能取得尚未发布到服务端的代码。

## 13.87 提示词优化关闭短预算 thinking（2026-09-06）

- 用户日志：Gemma4 提示词优化请求 `max_tokens=384`、`thinking=True`，完成 token 数为 384，但 `result_chars=0`，前端显示 `LLM refine returned no text`。这与 thinking 占满短输出预算、未生成正文相符；没有读取或展示模型思考内容。
- 修正：普通图像、图编和视频提示词优化统一发送 `disable_thinking: true`；此前只有 H3 请求关闭 thinking，其他请求的 `false` 被后端解释为明确启用 thinking。保留各类正文 token 预算，不修改普通聊天的 thinking 设置。
- 修正：复用已有纯文本模板构造逻辑，为 Gemma4 等具有 thinking 控制参数的非 Qwen 处理器创建明确关闭 thinking 的独立模板；保留原 thinking 模板、Qwen 专用模板及媒体处理器，不修改媒体处理器状态。
- 调整：空正文错误使用现有双语 `t` 提示重试或使用原提示词；两个模板均为空时，路由日志不再因 `None is None` 误报 thinking 模板。
- 验证：`python -m pytest tests/test_canvas_prompt_rewrite_thinking.py tests/test_llama_cpp_multimodal.py -q --tb=short -p no:cacheprovider` 为 `15 passed`，覆盖两种 thinking 模板参数、媒体处理器状态保留、无 thinking 控制时的默认路径和前端请求约定。
- 未执行：未启动完整 Studio、加载 GPU 模型或进行真实 Gemma4 优化。此次修改包含 Python 后端，开发版服务需重启并刷新画布后验证；不能把专项测试通过视为真实推理已通过。

## 13.88 Agent 文生图确认框使用完整预设目录（2026-09-06）

- 用户反馈：已有大量文生图预设和模型，但确认框仅显示 Z-imageT。原列表读取手动模型扫描结果；未扫描不等于缺少模型，却会使其他预设无法选择。
- 修正：文生图流程自动刷新预设目录，确认框按 `supported_tasks` / `media_capability.supported_tasks` 列出支持 `text_to_image` 的预设，不再依赖 ready 扫描结果或缺失模型标记；图编、视频和音频专用预设不会进入文生图列表。
- 修正：默认队列没有匹配项时，可以从目录中的文生图预设开始选择，不再因默认 Z-imageT 不存在而直接退出。其他任务的候选列表与设置页扫描逻辑未修改。
- 修正：确认后按精确名称解析所选预设；更换目标时重新执行提示词目标适配和 preflight，使用新目标创建节点及工作流标识，避免沿用 Z-image 的提示词检查结果。运行前模型检查保持不变。
- 验证：`node --test tests/canvas_agent_t2i_catalog.test.cjs tests/canvas_context_menu_preset_search.test.cjs` 为 `11 passed`，覆盖未扫描、缺失模型标记不隐藏选项、任务能力过滤、默认队列为空、更换目标实际提交以及不兼容选择和 preflight 阻止提交。
- 首次专项执行：测试环境遗漏 `canvasAgentPromptDecisionField`，导致三项流程测试中止；完善测试环境后全部通过，无剩余专项失败。
- 未执行：未启动完整 Studio、GPU 推理或真实浏览器生成。此次运行时代码仅修改前端，开发版画布需刷新以加载修改。

## 13.89 Gemma4 MTP 初始化失败后的资源释放顺序（2026-09-06）

- 用户反馈：VLM Chat 勾选 MTP 后显示已回退普通解码，但逐 token 输出明显慢于直接关闭 MTP。代码检查发现普通模型在 MTP 异常处理块内部加载，异常回溯仍可能引用失败的 Llama 实例；小型测试复现了失败实例晚于普通加载开始才释放的顺序。尚未用实际 GPU 推理证明这是降速的全部原因。
- 修正：普通解码重试移到 MTP 异常处理块之外，异常只保留字符串消息，等待失败实例回收后再加载普通模型；保留原 GPU 层数、K/V 类型、KQV offload 和上下文参数，不向普通加载传入 speculative 配置。
- 修正：本机绑定的 Llama 清理会关闭共享视觉处理器，因此回退时明确清理旧处理器并重新创建，更新普通模型的处理器引用；覆盖 MTP 初始化早期失败和已建立资源引用后失败两种情况。
- 日志：新增 `MTP fallback cleanup completed`，记录普通重试的 GPU 层数、KQV offload、KV 类型和上下文长度。成功 MTP 与直接关闭 MTP 的加载路径保持不变。
- 验证：`python -m pytest tests/test_llama_cpp_mtp_fallback.py tests/test_canvas_prompt_rewrite_thinking.py tests/test_llama_cpp_multimodal.py -q --tb=short -p no:cacheprovider` 为 `24 passed`。测试覆盖释放先于普通加载、视觉处理器重建、参数保留、成功/关闭 MTP、普通加载失败继续交由原分级加载处理、后续尝试不再启用 MTP，以及回退模型的复用条件。
- 首次测试：7 项通过，1 项重试状态测试因模拟卸载成功模型时关闭视觉处理器而失败；该用例改为纯文本以单独验证 MTP 状态，媒体资源生命周期仍由独立用例覆盖，重新执行全部通过。
- 未执行：未启动 Studio、加载 GPU 模型或测量真实逐 token 吞吐；实际速度恢复仍需验证。此次修改包含 Python 后端，需重启开发版服务以释放旧加载状态，再用相同模型、上下文和提示词比较。

## 13.90 主文件拆分与验收计划（2026-09-06）

- 新增：`docs/infinite-canvas-workbench-split-plan.md`，作为后续逐阶段迁移与验收的独立执行文档；本次不修改功能代码。
- 当前规模：工作区主文件为 48,547 行、2,659,560 字节。计划按菜单搜索、预设目录、Agent、文本/VLM、节点与 Inspector、Timeline、图编辑、项目、运行、渲染和入口分别安排，先建立测试基线。
- 约束：复用已有模块形式，明确项目状态、缓存和异步任务的归属；同步检查 Gradio 6 与独立页面加载入口，保持 `state.__lang` 双语、公开 API 和项目格式。
- 验收：每阶段记录专项测试、浏览器结果、未执行项与已知失败；源码提取测试逐步改为模块行为测试，并增加完整脚本组合检查。不能以开发目录测试通过代替安装版发布验证。
- 未执行：尚未拆分代码、运行功能测试、启动 Studio、执行 GPU 推理或发布。已有用户修改保持不变；旧开发日志本次不压缩。

## 13.91 P1 右键菜单与搜索模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/context_menu.js`，承载右键菜单搜索归一化、中文/英文 token 匹配、子菜单结果收集、HTML 渲染、搜索状态、键盘确认和关闭监听。
- 新增：`javascript/canvas_workbench/node_menus.js`，承载添加节点菜单和预设目录菜单项构建；节点创建 action 通过主入口注入，保留现有创建位置和预设精确解析行为。
- 调整：`javascript/infinite_canvas_workbench.js` 删除上述菜单构建、搜索渲染和菜单控制器实现，改为通过 `SimpAICanvasWorkbenchContextMenu` / `SimpAICanvasWorkbenchNodeMenus` 接入；主文件减少 386 行。
- 调整：`modules/ui_gradio_extensions.py` 和 `webui.py` 均在主脚本之前加载两个新模块；没有增加 Gradio 3.x 适配。
- 测试：`tests/canvas_context_menu_preset_search.test.cjs` 改为直接加载新模块，并保留 `openAddNodeMenu` 异步预设刷新、过期菜单和缺失定义覆盖；`tests/test_canvas_standalone_page_contract.py` 增加两个入口的加载顺序检查。
- 验证：两个新模块和主脚本 `node --check` 通过；`node --test tests/canvas_context_menu_preset_search.test.cjs tests/canvas_agent_t2i_catalog.test.cjs` 为 `11 passed`；`python -m pytest tests/test_canvas_standalone_page_contract.py tests/test_canvas_browser_cache_contract.py -q --tb=short -p no:cacheprovider` 为 `12 passed`。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。P1 代码迁移完成，浏览器与发布版仍待验收。

## 13.92 P2 预设目录服务拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/preset_catalog.js`，承载预设目录归一化、排序、本地元数据回退、权威目录缓存、并发刷新、失败状态和精确名称解析。
- 调整：`javascript/infinite_canvas_workbench.js` 删除目录缓存变量、刷新 Promise 和目录服务函数，通过 `SimpAICanvasWorkbenchPresetCatalog` 注入目录操作；场景节点定义修复仍由主文件回调执行。
- 调整：`modules/ui_gradio_extensions.py` 与 `webui.py` 在 `context_menu.js`、`node_menus.js` 和主脚本之前加入 `preset_catalog.js`；继续只适配 Gradio 6。
- 新增测试：`tests/canvas_preset_catalog_module.test.cjs` 覆盖元数据回退、排序、并发刷新、目录失败状态和精确解析；入口合同补充 `preset_catalog.js` 加载顺序。
- 验证：目录/菜单/Agent Node 专项 `14 passed`；入口与浏览器缓存合同 `12 passed`；`preset_catalog.js`、`context_menu.js`、`node_menus.js` 和主脚本 `node --check` 通过；相关 Python 文件 `py_compile` 通过。
- 已知未处理：跨模块回归仍有 Quick Start 节点数量合同失败，以及 MiniMax H3 默认比例合同失败，当前未修改相关功能；未执行完整 Studio、GPU、真实浏览器、安装版发布和性能比较。

## 13.93 P3a Agent 设置模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_settings.js`，承载 Agent 设置归一化、旧 `Wan-Animate` 默认迁移、模板来源例外、设置/布局写回、面板展开/停靠和改写模型选择。
- 调整：`javascript/infinite_canvas_workbench.js` 删除原 Agent 设置函数，改为注入 `SimpAICanvasWorkbenchCanvasAgentSettings`；项目、Agent 运行状态、历史、保存和渲染通过回调访问，Agent 引用与工作流仍留在主文件。
- 调整：`modules/ui_gradio_extensions.py` 和 `webui.py` 在主脚本前加载 `canvas_agent_settings.js`，位置在已有 `canvas_agent.js` 之后；没有增加 Gradio 3.x 适配。
- 新增测试：`tests/canvas_agent_settings_module.test.cjs` 覆盖归一化、模板迁移、设置写回、pending decision 取消、面板展开和停靠；原设置源码合同改为读取新模块。
- 验证：Agent 设置模块 `3 passed`；拆分 Node 专项 `14 passed`；设置相关专项 `2 passed`；入口与浏览器缓存合同 `12 passed`；新模块、主脚本和 Python 加载文件语法检查通过。
- 已知未处理：较宽 Agent 回归仍有 VLM alias 期望字符串和 video quick-tool `wantsReference` 合同失败，本次未修改相关功能；Quick Start 和 MiniMax H3 模板合同失败仍保留。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装版发布或性能比较。P3a 代码完成，浏览器与发布版仍待验收。

## 13.94 P3b Agent 参考媒体模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_references.js`，承载 Agent 引用归一化、去重、主图与附加图片、视频/音频/文本数量限制、引用增删和主图提升。
- 新增：媒体引用分组、主媒体查找、视频任务判断、任务双语标签和媒体事实摘要；模块只保存 Agent 引用状态，通过 `nodeId` 回查当前节点，不捕获旧项目对象。
- 调整：`javascript/infinite_canvas_workbench.js` 删除参考媒体管理函数，改为注入 `SimpAICanvasWorkbenchCanvasAgentReferences`；主入口继续保留目标节点判断、资源类型解析、VLM 参考源编译、引用面板 HTML 和工作流调用。
- 调整：音频桥接使用参考媒体模块的添加方法，保留音频上限提示、选择节点和面板消息行为；未改变 `state.__lang` 对应的 `t` 调用和 Gradio 6 适配范围。
- 加载：`modules/ui_gradio_extensions.py` 的 Gradio 6 lazy assets 和 `webui.py` 独立页面均在主脚本前加入 `canvas_agent_references.js`，并由入口合同固定顺序。
- 测试：新增 `tests/canvas_agent_references_module.test.cjs`，覆盖引用清理、重复引用、数量上限、选中节点添加、主图提升/删除、媒体分组、任务判断和显式目标优先级；模块专项 `4 passed`，菜单/目录/设置/参考媒体组合专项 `21 passed`。
- 验证：入口、浏览器缓存和音频相关 Python 合同 `17 passed`；VLM 预设指南合同 `21 passed`；主脚本和新模块 `node --check`、两个 Python 加载入口 `py_compile` 通过；`git diff --check` 无空白错误，仅有既有换行符提示。
- 已知未处理：`test_video_edit_quick_tool_defaults_to_bernini_and_masks_only_animate` 仍因既有 replace spec 含 `wantsReference: true` 失败；Quick Start 节点数量、MiniMax H3 默认比例和 VLM alias 合同问题仍未修改。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。P3b 代码和专项测试完成，P1/P2/P3a/P3b 的浏览器与发布版验收仍待执行。

## 13.95 P3c Agent 决策与 preflight 模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_decision.js`，承载预设候选过滤、图片/视频/音频容量判断、支持任务判断、队列候选选择和容量提示。
- 新增：提示词确认字段、preflight 请求、结果事实摘要、自动开始阻止和编辑/重新生成/取消流程；模块通过回调访问主入口的目录、状态查询、面板确认和提示词改写，不持有面板 DOM 或工作流状态。
- 调整：`javascript/infinite_canvas_workbench.js` 删除上述决策与 preflight 函数，接入 `SimpAICanvasWorkbenchCanvasAgentDecision`；保留 `askCanvasAgentDecision`、字段输入同步、面板渲染和具体生成工作流。
- 调整：T2I 合同测试改为加载真实决策模块 controller，避免继续从主脚本提取已迁移函数；修正当前 `disable_thinking: true` 行为的 H3 合同边界。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 在参考媒体模块之后、主脚本之前加入 `canvas_agent_decision.js`，继续只适配 Gradio 6。
- 测试：新增 `tests/canvas_agent_decision_module.test.cjs`，覆盖候选选项、声明/槽位容量、任务过滤、队列回退、preflight payload、阻止流程和确认字段；决策/参考媒体/设置/目录/菜单/T2I 组合 Node 测试 `25 passed`。
- 验证：P3c 相关 Python 合同 `59 passed`；主脚本和决策模块 `node --check`、两个 Python 加载入口 `py_compile` 通过。
- 已知未处理：`test_canvas_agent_vlm_preset_alias_intent_overrides_default_targets` 仍缺少既有 VLM alias 字符串；`test_video_edit_quick_tool_defaults_to_bernini_and_masks_only_animate` 仍发现既有 replace spec 含 `wantsReference: true`。Quick Start 节点数量、MiniMax H3 默认比例和安装版运行差异仍未处理。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。P3c 代码与专项测试完成，P1/P2/P3a/P3b/P3c 的浏览器与发布版验收仍待执行。

## 13.96 P3d Agent 提示词改写模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_prompt_rewrite.js`，承载 VLM 提示词改写请求、目标提示词构造、参考素材映射、H3 token 预算、超时参数、空正文错误和弱改写本地扩展。
- 调整：`javascript/infinite_canvas_workbench.js` 删除原提示词改写实现，改为创建 `SimpAICanvasWorkbenchCanvasAgentPromptRewrite` controller；`resolveCanvasAgentPrompt`、H3 分镜编辑器和其他调用继续使用同一公开函数别名。
- 调整：改写请求继续发送 `disable_thinking: true`；普通目标使用 384 token，H3 参考目标使用 1800 token，H3 视觉参考最长边保持 512；参考素材和原始 `userPrompt` 同时进入 VLM payload。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 在主脚本前加入 `canvas_agent_prompt_rewrite.js`，入口合同固定其位于决策模块之后、主脚本之前。
- 新增测试：`tests/canvas_agent_prompt_rewrite_module.test.cjs` 覆盖普通/H3 token 预算、关闭 thinking、超时双语文本、空正文双语错误、弱改写本地回退、参考素材和 `userPrompt` 传递。
- 调整测试：提示词 thinking、VLM 超时和 H3 参考合同改为读取新模块，不再从主文件提取已迁移函数。
- 验证：新模块专项 `4 passed`；相关 Python 合同 `16 passed`；新模块与主脚本 `node --check` 通过；加载顺序合同已加入新模块。
- 已知未处理：VLM alias 合同、video quick-tool replace spec、Quick Start 节点数量、MiniMax H3 默认比例和安装版运行差异仍未修改。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。P3d 代码与专项测试完成，后续继续 P3e。

## 13.97 P3d 合同同步（2026-09-06）

- 调整：VLM alias 合同不再从主文件寻找已迁移的 `canvasAgentVlmAgentContextPayload` 旧调用，改为读取 prompt rewrite 模块并检查 `userPrompt` 仍进入 agent context。
- 验证：P3 Python 合同中该既有失败已消除；video quick-tool replace spec 仍保留原有 `wantsReference: true` 失败，未修改功能代码。

## 13.98 P3e 图片工作流模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_image_workflows.js`，承载 Agent 文生图和图片编辑两个工作流入口，包括目标选择、预设确认、prompt target/preflight、节点创建、图片引用连线、运行信息和结果返回。
- 调整：`javascript/infinite_canvas_workbench.js` 删除两个图片工作流实现，改为创建图片工作流 controller；主入口保留生命周期、状态所有权和调用别名，视频、音频及快捷工具暂留主文件。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 在 prompt rewrite 模块之后、主脚本之前加入图片工作流模块。
- 测试：新增 `tests/canvas_agent_image_workflows_module.test.cjs`，覆盖图片编辑成功连线、额外图片引用、节点选中、运行参数和缺少图片目标；`tests/canvas_agent_t2i_catalog.test.cjs` 改为直接加载图片工作流模块。
- 验证：图片工作流与 P3 组合 Node 测试 `31 passed`；入口与浏览器缓存合同 `12 passed`；新模块、主脚本和两个 Python 入口语法检查通过。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。视频、音频/专用工具仍属于 P3e 未完成部分。

## 13.99 P3e 视频与音频工作流模块拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_video_workflows.js`，承载文生视频、音频/图片转视频、参考视频转视频和视频编辑；保留媒体容量判断、场景主题、参考素材连接、输入槽检查、确认框和运行信息。
- 新增：`javascript/canvas_workbench/canvas_agent_audio_workflows.js`，承载音频预设生成、Qwen TTS 音色设计和音频编辑；保留音频预设不可用提示、输入槽检查、音频/图片连线和 Qwen TTS 独立运行路径。
- 调整：`javascript/infinite_canvas_workbench.js` 删除五个视频工作流和四个音频工作流实现，主入口改为持有两个 controller 的公开函数别名；音频快捷工具、音频节点桥接和视频/图片专用快捷工具暂留主入口。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 按 prompt rewrite、image workflows、video workflows、audio workflows 的顺序加载新模块，再加载主脚本。
- 测试：新增 `tests/canvas_agent_video_workflows_module.test.cjs` 和 `tests/canvas_agent_audio_workflows_module.test.cjs`；视频/音频源码合同改为读取新模块；入口合同增加两份脚本的顺序检查。
- 验证：P3e 图片、视频、音频工作流组合 Node `37 passed`；受影响 Python 合同 `51 passed`，新模块和主脚本语法检查通过；`git diff --check` 通过。
- 已知未处理：`test_video_edit_quick_tool_defaults_to_bernini_and_masks_only_animate` 仍因既有 replace spec 含 `wantsReference: true` 失败；音频快捷工具、音频节点桥接、视频快捷工具、图片专用快捷工具仍待 P3e 专用工具子步骤。
- 未执行：未启动完整 Studio、GPU 推理、真实浏览器、安装目录发布或性能比较。P3e 工作流入口已完成，专用工具迁移和 P3f Agent 面板/协调仍未执行。

## 13.100 无限画布主文件拆分计划复核（2026-09-06）

- 本次只更新计划文档，没有继续修改业务代码。
- 当前参考：`javascript/infinite_canvas_workbench.js` 约 `44,055` 行；P1、P2、P3a-P3e 工作流入口已有模块和专项记录。
- 后续顺序：P3e 专用工具（音频、视频、图片及其他工具） -> P3f Agent 面板与协调 -> P4-P11 其余功能组。
- 每个子步骤都要同时记录模块边界、两个页面入口加载顺序、`state.__lang` 双语检查、专项测试、浏览器/性能/发布状态和已知失败。
- 未执行：本次未运行专项测试、浏览器、性能、完整 Studio、GPU 推理或安装版发布；后续以拆分计划文档末尾的第 14 节为当前执行参考。

## 13.101 P3e-S1 Agent 音频专用工具拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_audio_tools.js`，承载音频快捷工具、音频来源挂载和音频节点桥接。
- 调整：`javascript/infinite_canvas_workbench.js` 删除对应旧函数，通过 audio tools controller 保留原调用名称；`modules/ui_gradio_extensions.py` 与 `webui.py` 在音频工作流模块之后加载新文件。
- 新增测试：`tests/canvas_agent_audio_tools_module.test.cjs`；音频节点合同改为读取新模块，独立页面合同固定两套入口的加载顺序。
- 验证：音频工具模块 `4 passed`；P3e 图片/视频/音频工作流与音频工具组合 `12 passed`；独立页面合同 `9 passed`；新模块、主脚本和两个 Python 入口语法检查通过。
- 已知未处理：视频快捷工具合同仍因 replace spec 含 `wantsReference: true` 失败；本次没有修改视频行为。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；下一步为 P3e-S2 视频专用工具。

## 13.102 P3e-S2 Agent 视频专用工具拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_video_tools.js`，承载视频快捷工具规格、视频路由选择、视频引用图连接、LivePortrait 表情编辑和视频快捷工具运行。
- 调整：`javascript/infinite_canvas_workbench.js` 删除对应视频专用工具实现，通过 video tools controller 保留原调用名称；共享图片参考占位函数仍由主文件提供，供主入口和视频工具使用。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 均在视频工作流模块之后、主脚本之前加载 `canvas_agent_video_tools.js`；音频工具模块保持在视频工具之前。
- 测试：新增 `tests/canvas_agent_video_tools_module.test.cjs`；视频快捷工具合同改为读取新模块，独立页面合同继续检查两套入口的加载顺序。
- 验证：P3e 相关 Node 模块组合 `34 passed`；视频、音频节点和独立页面 Python 合同组合 `24 passed`；主脚本、新视频模块、新音频模块和两个 Python 入口语法检查通过；`git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- 已知未处理：本步骤没有新增失败；此前 video replace 合同失败在当前测试组合中未复现。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；P3e-S3 图片/其他工具与 P3e-S4 工具协调清理仍待执行。

## 13.103 P3e-S3 Agent 图片与其他专用工具拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_image_tools.js`，承载图片快捷工具规格、工具入口、preset 节点配置、蒙版保存后的自动运行、风格转换工作流和图片工具 dispatch。
- 调整：`javascript/infinite_canvas_workbench.js` 删除图片专用工具实现，通过 image tools controller 保留原调用名称；共享蒙版基础函数继续留在主文件，供图片蒙版和视频 SAM3 工作流共同使用。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 在视频工具之后、音频工作流之前加载 `canvas_agent_image_tools.js`，主脚本仍最后加载。
- 测试：新增 `tests/canvas_agent_image_tools_module.test.cjs`；图片快捷工具、图片节点、独立页面和 UI 兼容合同同步更新。
- 验证：图片工具模块 `5 passed`；P3e 相关 Node 模块组合 `39 passed`；受影响 Python 合同组合 `205 passed`；JavaScript、Python 语法检查和 `git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- 已知未处理：本步骤没有新增失败。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；P3e-S4 工具协调清理及后续 P3f-P11 尚未执行。

## 13.104 P3e-S4 Agent 工具协调清理（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_tool_dispatch.js`，统一处理当前媒体类型对应的快捷工具列表、工具族判断和 `video_`/`audio_` 前缀路由。
- 调整：`javascript/infinite_canvas_workbench.js` 删除媒体类型判断与工具动作分支，事件处理器通过 dispatch controller 调用图片、视频、音频专用 controller。
- 加载：`modules/ui_gradio_extensions.py` 与 `webui.py` 在音频工具之后、主脚本之前加载 dispatch 模块。
- 测试：新增 `tests/canvas_agent_tool_dispatch_module.test.cjs`；独立页面合同增加 dispatch 模块路径和加载顺序检查。
- 验证：dispatch 模块 `3 passed`；P3e 相关 Node 模块组合 `42 passed`；受影响 Python 合同组合 `29 passed`；JavaScript、Python 语法检查和 `git diff --check` 通过，仅有既有 LF/CRLF 转换提示。
- 已知未处理：本步骤没有新增失败。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；P3f Agent 面板与协调以及 P4-P11 尚未执行。

## 13.105 P3f Agent 面板视图拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_panel_views.js`，承载决策卡、运行信息、引用 chip/分组列表、快捷工具栏、分辨率控件、模型 chip 和模型选择器的 HTML 视图生成。
- 调整：`javascript/infinite_canvas_workbench.js` 删除上述视图的重复实现，保留 controller 别名和面板生命周期；面板组合、定位、拖动、决策 resolve 与字段同步暂未迁移。
- 入口：`modules/ui_gradio_extensions.py` 和 `webui.py` 在工具 dispatch 后、主脚本前加载面板视图模块；可见文本继续由传入的 `t` 使用当前语言状态生成。
- 测试：新增 `tests/canvas_agent_panel_views_module.test.cjs`；模型选择器合同与独立页面入口合同改为检查面板视图模块。
- 验证：Node 模块专项组合 `45 passed`；受影响 Python 合同 `36 passed`；相关 JavaScript/Python 语法检查通过；`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；下一组继续处理面板组合、定位/拖动、决策交互、运行信息状态和引用交互。

## 13.106 P3f Agent 面板状态与决策交互拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_panel_controller.js`，承载运行信息状态、面板提示消息、决策 Promise、保持打开的重试动作、字段编辑和预设提示词同步。
- 调整：`javascript/infinite_canvas_workbench.js` 删除对应状态与决策交互实现，保留原函数名转发到 controller；工作流调用方不需要改接口。
- 入口：Gradio 6 lazy assets 和独立页面均在面板视图模块之后加载面板 controller，再加载主脚本。
- 测试：新增 `tests/canvas_agent_panel_controller_module.test.cjs`；入口合同增加模块存在性和加载顺序检查。
- 验证：面板 controller 与既有 Agent 模块组合 `48 passed`；独立页面/模型选择器合同 `10 passed`；相关 JavaScript/Python 语法检查与 `git diff --check` 在本组结束时复核。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；面板 HTML 组合、定位/拖动和引用交互仍待迁移。

## 13.107 P3f 面板状态组合同步与验证（2026-09-06）

- 合同同步：`tests/test_canvas_agent_quick_tools_contract.py` 已改为从 `canvas_agent_panel_controller.js` 检查已迁移的确认卡、提示词字段和预设联动。
- 验证：P3f Node 组合 `48 passed`；受影响 Python 合同 `36 passed`；入口 Python 语法检查、JavaScript 语法检查和 `git diff --check` 通过，仅有既有换行符提示。
- 下一步：继续迁移面板 HTML 组合、定位/拖动与停靠状态；浏览器、完整 Studio、GPU、安装版和性能验收仍单独记录。

## 13.108 P3f Agent 面板定位与拖动拆分（2026-09-06）

- 调整：`javascript/canvas_agent_panel_controller.js` 新增节点旁定位、浮动面板/最小化气泡定位、视口边界限制和指针拖动处理。
- 调整：`javascript/infinite_canvas_workbench.js` 移除对应定位与拖动实现，保留原事件函数名作为转发；拖动后的 `attachPaused`、`panelPosition` 和 `bubblePosition` 写回行为保持不变。
- 测试：面板 controller 增加定位行为测试；模型选择器、快捷工具和入口合同改为从新模块读取已迁移实现。
- 验证：相关 Node 组合 `49 passed`；受影响 Python 合同 `36 passed`；JavaScript/Python 语法检查通过，`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器拖动、窗口缩放、完整 Studio、GPU、安装版发布和性能比较；下一组处理面板组合及引用/工具事件协调。

## 13.109 P3f Agent 面板组合拆分（2026-09-06）

- 调整：`javascript/canvas_workbench/canvas_agent_panel_controller.js` 新增完整面板组合渲染，统一处理启用/最小化、标题栏、模型入口、运行信息、决策卡、输入区、引用区、工具区和分辨率区的拼装。
- 调整：`javascript/infinite_canvas_workbench.js` 删除面板 HTML 组合实现，保留 `renderCanvasAgentPanel` 转发；原有视图模块和主入口 action 名称不变。
- 测试：面板 controller 增加 active shell 组合测试；模型选择器合同改为从 controller 检查组合调用。
- 验证：相关 Node 测试 `50 passed`；受影响 Python 合同 `36 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU、安装版发布和性能比较；引用、快捷工具、分辨率和模型事件协调仍待处理。

## 13.110 P3f Agent 面板 action 协调拆分（2026-09-06）

- 调整：`canvas_agent_panel_controller.js` 新增面板 action 分发，负责面板状态、引用、快捷工具、outpaint、模型/分辨率控件和确认卡操作。
- 调整：`infinite_canvas_workbench.js` 的总 action handler 先调用 panel controller；工作流生成、编辑和文本优化 action 继续保留在主入口。
- 测试：增加 panel action 行为测试，更新模型选择器、快捷工具合同以检查新 controller 和主入口转发。
- 验证：相关 Node 测试 `51 passed`；受影响 Python 合同 `36 passed`；JavaScript/Python 语法检查通过，`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器按钮/拖动/缩放验收、完整 Studio、GPU、安装版发布和性能比较；后续先做 P3f 浏览器验收，再评估 P4。

## 13.111 P4a Agent 指令规划拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_instruction_planner.js`，承载 JSON 解析、计划归一化、本地 fallback、preset alias 处理和 planner prompt 构造。
- 调整：`javascript/infinite_canvas_workbench.js` 删除对应旧实现，保留 planner controller 别名；工作流执行仍由主入口协调。
- 入口：两套页面入口在 panel controller 后加载 planner 模块，再加载主脚本。
- 测试：新增 planner 模块行为测试，更新 VLM/preset、快捷工具、音频桥接和入口合同的源码读取位置。
- 验证：Node 组合 `55 passed`；Python 合同组合 `73 passed`；JavaScript/Python 语法检查通过；`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU、安装版发布和性能比较；下一步处理 VLM planner 请求、取消、超时和迟到响应。

## 13.112 P4b VLM 指令请求生命周期拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_vlm_instruction.js`，承载 planner 请求参数、`agent_context`、request_id、超时、AbortController、后端取消、项目状态检查和迟到响应丢弃。
- 调整：`javascript/infinite_canvas_workbench.js` 保留 `runCanvasAgentVlmInstruction` 进行本地计划选择和 workflow 分派；请求失败允许本地计划继续，取消、项目变化和旧请求替代直接停止后续分派。
- 面板：`canvas_agent_panel_views.js` 展示 Stop/停止按钮，`canvas_agent_panel_controller.js` 在 Agent 忙碌时仍可处理 planner 取消 action。
- 入口：Gradio 6 lazy assets 与独立页面都在 planner 后加载 VLM instruction controller，再加载主脚本。
- 测试：新增 VLM instruction controller 模块测试和 Python 合同；覆盖正常请求、失败、取消、超时、项目对象变化、旧请求替代、面板 action 和双入口顺序。
- 验证：专项 Node `24 passed`；相关 Python `12 passed`；主脚本、新模块、面板模块和 Python 入口语法检查通过。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；pytest 运行有既有缓存目录权限警告，不影响用例结果。
- 下一步：继续处理 P4 后续 VLM 展示和 workflow 协调，暂不再扩大本次请求 controller 的职责。

## 13.113 P4c Text Agent workflow 拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_text_workflows.js`，承载 Text Agent refine 的目标检查、改写请求、失败重试、确认卡和文本写回。
- 调整：`javascript/infinite_canvas_workbench.js` 只保留 Text refine 转发；Text 节点读写、面板消息和 `mutate({ inspector: true })` 通过依赖回调提供。
- 入口：Gradio 6 lazy assets 与独立页面都在 prompt rewrite 模块后加载 Text workflow，再加载图片 workflow和主脚本。
- 测试：新增 Text workflow Node 模块测试和 Python 合同，覆盖目标无效、只读、空内容、重试、取消、异常和成功写回；相关图片/视频/音频 workflow 组合同步复核。
- 验证：Node `36 passed`；入口 Python 合同 `11 passed`；主文件、新模块和 Python 入口语法检查通过。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；pytest 仍有既有缓存目录权限警告。
- 下一步：继续迁移普通 Text 编辑/合并职责，再处理 VLM 节点展示和其余 P4 协调逻辑。

## 13.114 P4d Text 节点与 Text Merge 拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_agent_text_nodes.js`，承载 Text 节点和 Text Merge 的输入槽、来源解析、合并输出、分隔符解码及 HTML 渲染。
- 调整：`javascript/infinite_canvas_workbench.js` 删除对应实现，通过 Text nodes controller 保留原函数名转发；项目状态、节点查询、翻译文本和通用 textarea 渲染均由依赖回调提供。
- 入口：Gradio 6 lazy assets 与独立页面均在 Text workflow 之后、图片 workflow 之前加载 Text nodes 模块；不增加 Gradio 3.x 兼容路径。
- 测试：新增 `tests/canvas_agent_text_nodes_module.test.cjs`；Text workflow 合同和独立页面合同检查模块存在性、主入口转发以及两套入口加载顺序。
- 验证：Text 相关 Node 组合 `6 passed`；受影响 Python 合同 `12 passed`；JavaScript/Python 语法检查通过；`git diff --check` 无空白错误，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；pytest 的缓存目录权限警告仍存在，但不影响测试结果。
- 下一步：继续处理 P4 的 VLM 节点展示和结果回写协调，之后安排 Text/VLM 浏览器交互验收。

## 13.115 P4e VLM 节点视图拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_vlm_node.js`，承载 VLM single/chat 节点的 HTML 组合和控件展示。
- 调整：`javascript/infinite_canvas_workbench.js` 删除 `renderVlmNodeHtml` 的大段视图实现，通过 VLM node controller 保留原函数名转发；模型状态、聊天日志、输入槽和通用字段渲染通过依赖回调提供。
- 入口：Gradio 6 lazy assets 与独立页面均在 Text nodes 模块之后、图片 workflow 之前加载 VLM node 模块；不增加 Gradio 3.x 兼容路径。
- 测试：新增 `tests/canvas_vlm_node_module.test.cjs`；入口合同检查 VLM 模块、主文件转发和两套页面加载顺序。
- 验证：P4 文本/VLM Node 组合 `14 passed`；相关 Python 合同 `15 passed`；JavaScript/Python 语法检查通过；`git diff --check` 无空白错误，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；pytest 的缓存目录权限警告仍存在，但不影响测试结果。
- 下一步：继续处理 VLM helper 和结果回写协调，之后做 Text/VLM 浏览器交互验收。

## 13.116 P4f VLM 节点展示 helper 拆分（2026-09-06）

- 调整：`javascript/canvas_workbench/canvas_vlm_node.js` 接管 VLM 模型状态、图像输入槽、待发送图片和 Agent 模式选择的渲染 helper。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 `vlmModelStatusState`、`renderVlmModelStatusHtml`、`renderVlmInputRows`、`renderVlmPendingImages` 和 `renderVlmAgentModeSelect` 的转发，删除对应 HTML 实现。
- 保持：VLM system prompt 模板、Custom API、聊天日志和异步 DOM 状态继续由主入口管理，避免把存储和请求生命周期带入纯视图 controller。
- 测试：VLM 模块测试覆盖状态标签、输入端口、已连接/待发送图片和 Agent 模式；Python 合同检查主入口转发及双入口加载关系。
- 验证：P4 文本/VLM Node 组合 `15 passed`；Python 合同 `15 passed`；JavaScript/Python 语法检查通过；`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；VLM 结果读取/写回、模板和聊天 action 尚未做运行时验收。
- 下一步：继续处理 VLM 结果回写与聊天 action 协调，再安排 Text/VLM 浏览器验收。

## 13.117 P4g VLM chat 数据 helper 拆分（2026-09-06）

- 新增：`javascript/canvas_workbench/canvas_vlm_chat.js`，承载 VLM 聊天消息索引、文本归一化、工具状态、动作索引、聊天图片资产解析和结果节点图片 payload。
- 调整：`javascript/infinite_canvas_workbench.js` 通过 VLM chat controller 保留原 helper 名称转发；消息写回、滚动、图片预览、复制/引用和 action 执行暂留主入口。
- 入口：Gradio 6 lazy assets 与独立页面均按 Text nodes、VLM node、VLM chat、图片 workflow 的顺序加载；不增加 Gradio 3.x 兼容路径。
- 测试：新增 `tests/canvas_vlm_chat_module.test.cjs`；Python 合同检查 VLM chat controller、主入口转发和两套页面加载顺序。
- 验证：P4 文本/VLM Node 组合 `17 passed`；Python 合同 `16 passed`；JavaScript/Python 语法检查通过；`git diff --check` 通过，仅有既有换行符提示。
- 未执行：真实浏览器、完整 Studio、GPU 推理、安装版发布和性能比较；消息写回、聊天 action、滚动和结果生命周期仍待运行时验收。
- 下一步：继续处理 VLM 消息写回与聊天 action 协调，之后安排 Text/VLM 浏览器验收。

## 13.118 P4h VLM chat 状态与结果查找拆分（2026-09-06）

- 调整：`canvas_vlm_chat.js` 新增 `setVlmChatToolState`、`rememberVlmChatToolResult` 和 `latestVlmChatResultNode`，负责聊天工具状态更新、工作流结果索引和最近结果节点选择。
- 主入口：`infinite_canvas_workbench.js` 删除上述三个 helper 的具体实现，仅保留 controller 转发；项目对象、结果节点生成查询和输出状态通过依赖回调提供。
- 保持：消息追加仍在主入口执行，继续负责 `node.chat.messages`、`node.text`、VLM 状态、`mutate` 和滚动；本次没有改变 action 执行、图片预览或通用文本结果读取。
- 测试：VLM chat 模块覆盖直接结果、工作流归属结果、状态写回和时间戳；合同测试覆盖三个新转发函数。
- 验证：Node `12 passed`；Python 合同 `14 passed`；JavaScript/Python 语法检查通过；`git diff --check` 通过，保留既有 LF/CRLF 提示。
- 未执行：浏览器交互、完整 Studio、GPU 推理、安装版发布和性能比较；pytest 的 `.pytest_cache` 权限警告仍存在。
- 下一步：继续核对消息追加、输入回填和 action 执行之间的状态变化，再决定是否迁移带有重绘和滚动副作用的聊天写回逻辑。

## 13.119 P4i VLM chat 消息写回拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `appendVlmChatToolMessage`、`replaceVlmChatPendingMessage`、`lastVlmAssistantText`、`pendingVlmChatMessages` 和 `hasPendingVlmChatMessage`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除上述函数的具体实现，保留原调用接口；controller 通过回调触发项目重绘、聊天滚动和滚动位置标记。
- 保持：最多保留 40 条消息、结果图片 payload、pending 状态下的 `running` 状态、`node.text` 更新和停止消息替换行为不变。
- 测试：模块测试覆盖消息追加、结果图片、pending 状态、消息克隆和 pending 回复替换；合同测试覆盖新 controller 接口和主入口转发。
- 验证：Node P4 Text/VLM 组合 `9 passed`；Python 入口合同 `14 passed`；VLM chat 模块 `4 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器交互、完整 Studio、GPU、安装版发布和性能比较；输入回填、上下文编辑、图片预览和 action 执行仍未做运行时验收。
- 下一步：继续整理 VLM chat 输入回填/上下文编辑，再处理 action 执行协调和 `getNodeTextOutput` 结果读取。

## 13.120 P4j VLM chat 上下文编辑拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `applyVlmChatContextEdit`，承载消息过滤、pending 保留、conversation id、prompt、assistant 文本和 idle 状态写回。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除上下文编辑的具体实现，保留原函数转发；`uid`、锁定检查、历史记录、`mutate` 和滚动行为通过依赖回调注入。
- 保持：锁定节点不修改，消息最多保留 40 条，回退/删除/重试调用方仍使用原接口；输入框焦点和提示消息继续由主入口处理。
- 测试：VLM chat 模块增加上下文编辑成功、pending 回复保留、prompt 更新和锁定节点拒绝测试；合同测试检查新 controller 接口及主入口转发。
- 验证：Node `5 passed`；Python 合同 `5 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级输入焦点和消息菜单、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续评估回退/删除消息选择与输入回填的边界，再处理 VLM action 执行状态和通用文本结果读取。

## 13.121 P4k VLM chat 消息菜单拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `rollbackVlmChatToMessage` 和 `deleteVlmChatMessage`，承载消息索引检查、pending 保护、上下文编辑调用和双语提示。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除两个消息菜单函数的具体实现，保留原调用接口；输入框聚焦通过 `focusVlmChatPromptInput` 回调处理。
- 保持：回退用户消息时保留最多 4 个可用图片，普通回退保留 pending assistant，删除 pending 消息只显示提示，不修改上下文。
- 测试：VLM chat 模块覆盖回退成功、删除成功、pending 删除拒绝、焦点调度和提示回调；合同测试检查新增 controller 接口及主入口转发。
- 验证：Node `6 passed`；Python 合同 `5 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级消息菜单和输入焦点、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续整理 VLM action execution 写回，再检查 `getNodeTextOutput` 是否适合独立模块。

## 13.122 P4l VLM action 状态写回拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `setVlmAgentActionExecution` 和 `patchVlmAgentAction`，承载 action 执行状态、时间戳、prompt review 和 metadata 更新。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除两个状态写回函数的具体实现，保留原调用接口；历史记录和 inspector 重绘通过 controller 回调触发。
- 保持：忽略、重试、放行、action 预处理和具体图片生成仍在主入口；无效消息或 action 索引返回原有失败结果。
- 测试：VLM chat 模块覆盖执行状态写入、时间戳、prompt review patch、放行标记和无效索引；合同测试检查新 controller 接口及主入口转发。
- 验证：Node `7 passed`；Python 合同 `5 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 action 卡片、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续检查 `getNodeTextOutput` 的节点类型依赖和调用范围，决定是否单独建立 Text output controller。

## 13.123 P4m 通用文本输出解析拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_agent_text_nodes.js` 新增 `isTextOutputNode` 和 `getNodeTextOutput`，与 Text Merge 输入和渲染共用同一 controller。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应通用解析实现，保留原函数转发；Batch Any、Director Timeline、Style Selector 和 Wildcards helper 通过依赖回调注入。
- 保持：Text、Text Merge、Translation、Tag Cart、Wildcards、VLM、Style Selector、Director Timeline 和 Batch Any 文本输出规则不变，递归访问仍使用 visited 集合。
- 测试：Text nodes 模块覆盖支持的节点类型和非文本 Batch Any；更新 XYZ 合同以从 Text controller 检查 Batch Any 文本判断。
- 验证：Node Text nodes `3 passed`；Node Text/VLM 组合 `13 passed`；XYZ 合同 `8 passed`；入口合同 `14 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 Text/Batch Any/Timeline 交互、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续检查 Text output controller 的调用边界，评估后续主文件职责拆分。

## 13.124 P4n Text 输入来源与循环判断拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_agent_text_nodes.js` 新增 `getTextNodeInputSource` 和 `wouldCreateTextCycle`，与 Text output、Text Merge 逻辑共用 controller 内部函数。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除两项实现，保留原函数转发；Text controller 通过 project、node 和 edge 数据完成来源解析。
- 保持：自引用直接拒绝，Text Merge 递归检查输入来源，Text/Translation/Tag Cart 的输入 edge 规则不变。
- 测试：Text nodes 模块覆盖直接来源、无环连接、反向依赖和自引用；Text Merge 合同检查迁移后的 controller 实现与主入口接口。
- 验证：Node Text nodes `4 passed`；Text Merge 合同 `4 passed`；Text 合同 `5 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 edge 拖动、动态 Text Merge 输入、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续检查 Text controller 的调用边界，寻找下一个职责完整的主文件模块。

## 13.125 P4o Text prompt 来源解析拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_agent_text_nodes.js` 新增 `getPromptTextSourceNode`，承载 prompt/negative prompt 的 Text output 来源查找。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除原函数实现，保留 controller 转发；调用方无需改变。
- 保持：非法 slot 返回空来源，prompt 来源必须是可输出文本的节点，现有边连接和参数读取规则不变。
- 测试：Text nodes 模块覆盖正向、负向和非法 slot；合同测试检查新接口及主入口转发。
- 验证：Node Text nodes `4 passed`；Text 合同 `5 passed`；Text Merge 合同 `4 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 prompt edge 和 Inspector 交互、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续检查 Text controller 的调用边界，评估下一个独立职责。

## 13.126 P4p Wildcard 标签生成拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_agent_text_nodes.js` 新增 `wildcardHelperBuildTag`，承载 Wildcards 标签格式和参数归一化。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除原 helper 实现，保留 controller 转发；Batch Any 文本项和目录管理仍由主入口处理。
- 保持：Array batch、Single in prompt、Random Select、In order、固定/随机 seed、count、start 和 group size 格式不变。
- 测试：Text nodes 模块覆盖默认 array 标签和顺序 single 标签；合同测试检查新 controller 接口及主入口转发。
- 验证：Node Text nodes `4 passed`；Text 合同 `5 passed`；Text Merge 合同 `4 passed`；XYZ 合同 `8 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 Wildcards 编辑、Batch Any 联动、完整 Studio、GPU、安装版发布和性能比较。
- 下一步：继续检查 Text controller 的调用边界，评估后续独立职责。

## 13.127 P4q VLM chat action 摘要与折叠判断拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 action 执行状态、可见操作判断、状态标签、详情折叠判断和摘要渲染接口。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留对应转发，聊天日志继续组合消息内容、原始输出、通知和 action 详情容器。
- 保持：已完成 action 的详情默认折叠，失败/拦截/待确认 action 仍展示可操作内容；摘要保留状态、分辨率、审查分数和图片数量。
- 测试：VLM chat 模块增加 4 项 action summary 与折叠断言；入口合同增加五个 controller 接口检查。
- 验证：Node `8 passed`；Python 合同 `5 passed`；JavaScript 语法检查通过。
- 未执行：浏览器级 action 卡片、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.128 P4r VLM action 卡片渲染拆分（2026-09-07）

- 调整：`canvas_vlm_chat.js` 新增 `renderVlmAgentActions`，承载 action 卡片 HTML、prompt/审查/预检信息、生成参数摘要和 action 控件展示。
- 主入口：`infinite_canvas_workbench.js` 删除 action 卡片 HTML 具体实现，仅保留 controller 转发；action 执行、重试、放行和状态写回继续留在主入口。
- 依赖：通过 VLM chat controller context 注入 prompt target、预检信息和审查放行判断，未引入项目对象或 DOM。
- 测试：模块测试增加 action 卡片渲染断言；入口合同检查 `renderVlmAgentActions` 及五项依赖注入。
- 验证：Node `9 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 卡片按钮、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.129 P4s VLM chat 图片快照拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `snapshotVlmChatImages`，承载 pending 图片和连接输入的消息快照整理。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除快照实现，保留原函数转发；VLM workflow 仍负责提交和清理聊天状态。
- 保持：pending 图片先进入快照，最多保留 12 项，并沿用缩略图、尺寸、路径和相对路径字段过滤规则。
- 测试：VLM chat 模块增加 pending/connected 图片快照测试；入口合同增加快照接口和转发检查。
- 验证：Node `10 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级聊天图片提交、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.130 P4t VLM chat 上下文预算与滚动历史拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增上下文窗口、预算限制、参数默认值和 `buildVlmRollingHistoryMessages`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应计算实现，保留原函数转发；VLM node controller 继续通过这些接口读取上下文预算。
- 保持：默认模型版本、预算边界、最多 80 条历史、单条消息截断和 `save_context=false` 规则不变。
- 依赖：VLM context window 表和默认参数从主入口注入 controller，不让模块读取全局项目状态。
- 测试：VLM chat 模块增加预算和历史裁剪测试；入口合同检查五个新增转发接口。
- 验证：Node `11 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：不同 VLM 版本的真实请求、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.131 P4u VLM chat 日志渲染拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 assistant 展示文本清理和 `renderVlmChatLog`，承载聊天消息 HTML、操作按钮、图片 chip、原始输出和 action 详情。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应 HTML 实现，仅保留两个转发；VLM node controller 继续通过 `renderVlmChatLog` 回调使用聊天视图。
- 保持：最近 12 条消息、pending 标记、action 折叠规则、图片元数据和空日志提示不变。
- 测试：VLM chat 模块增加完整日志渲染测试；VLM chat input 合同将 VLM node HTML 检查放到 `canvas_vlm_node.js`，主入口继续检查请求和 Inspector 行为。
- 验证：Node `12 passed`；Python 合同 `9 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级聊天菜单、图片预览、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.132 P4v VLM chat pending 图片状态拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `addVlmPendingImageFromFile` 和 `removeVlmPendingImage`，承载 pending 图片数据更新、缩略图和锁定保护。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留文件选择、拖拽和提示消息，两个 pending 图片函数改为 controller 转发。
- 依赖：文件读取、尺寸读取、缩略图、时间和重绘函数从主入口注入；controller 不持有 DOM。
- 测试：VLM chat 模块增加图片添加、删除、缩略图和锁定节点测试；入口合同及图片上传合同同步复核。
- 验证：Node `13 passed`；Python 合同 `20 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级文件选择/拖拽、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.133 P4w VLM pending 图片 payload 序列化拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `serializeVlmPendingImageSource`，承载 pending 图片到运行 payload 的字段整理。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除序列化实现，保留转发；VLM 请求收集和提交流程不变。
- 保持：附件节点 ID、资产序列化字段、缩略图、尺寸、`mask` 和来源标记规则不变。
- 依赖：`serializeAssetForRun` 从主入口注入，controller 不持有项目状态。
- 测试：VLM chat 模块增加 payload 序列化测试；入口合同和图片上传合同同步复核。
- 验证：Node `14 passed`；Python 合同 `20 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级聊天提交、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.134 P4x VLM action 元数据判断拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 action 类型归一化、图片工具判断、用途映射、自动确认和 prompt review 判断接口。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应实现，保留原函数转发；`extractVlmAgentActionsFromText`、action 执行和执行计划暂留主入口。
- 保持：动作类型、图片工具集合、用途和审查安全码规则不变。
- 测试：VLM chat 模块增加连字符类型、用途、审查拦截、放行和自动确认测试；入口合同增加八个接口检查。
- 验证：Node `15 passed`；Python 合同 `20 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 解析和生成执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.135 P4y VLM action 文本解析拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `extractVlmAgentActionsFromText`，承载 fenced JSON、内嵌 JSON 和 plain text action 解析。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除解析实现，保留转发；action execution plan 和 workflow 启动仍留在主入口。
- 保持：action 类型过滤、嵌套对象处理、连字符归一化和最多 6 项结果限制不变。
- 测试：VLM chat 模块增加 JSON/plain text 解析测试；入口合同增加解析接口检查。
- 验证：Node `16 passed`；Python 合同 `20 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.152 P4ap VLM action 展示准备拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmAgentActionsForDisplay`，承载 action 合并、字段清理、preset/prompt 处理、Danbooru 修复和展示数据准备。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应实现，保留 prompt helper、target/preflight helper 和 workflow 调用的 context 注入。
- 保持：action 数量限制、prepared prompt、backend locked、Danbooru review guard 和 prompt 字段写回规则不变。
- 测试：VLM chat 模块增加 action 展示准备测试；入口合同检查新增 controller 接口。
- 验证：Node `33 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.151 P4ao VLM fallback action 构造拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmFallbackToolActionsForPrompt`，承载 fallback image action 的意图判断、prompt 选择、preset 清理和 action 构造。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除 fallback action 构造实现，保留 mode/preset 依赖注入和后续 action 展示。
- 依赖：通过 context 注入 `normalizeVlmAgentMode`、preset instruction override、preset name normalization 和 preset prompt stripping。
- 保持：raw mode、生成/编辑类型、frontend fallback 标记、confidence 和中英摘要规则不变。
- 测试：VLM chat 模块增加 fallback action 测试；入口合同检查新增 controller 接口。
- 验证：Node `32 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.150 P4an VLM Danbooru context wrapper 拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentDanbooruContextTextForPrompt`，承载 assistant context 启用判断和文本选择。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除 wrapper 具体实现，保留 Danbooru prompt 合并、规范化和 fallback action 构造。
- 依赖：通过 context 注入 `vlmAgentUserPromptHasAssistantPersonaImageIntent`，controller 不读取项目或 DOM 状态。
- 保持：persona image intent 判断和 user/assistant context 选择规则不变。
- 测试：VLM chat 模块增加 Danbooru context wrapper 测试；入口合同检查新增 controller 接口。
- 验证：Node `31 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.149 P4am VLM assistant 正向视觉上下文清理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentPositiveVisualContextText`，承载 assistant 正向视觉上下文清理和合并。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除清理实现，保留 Danbooru 意图判断、prompt 合并和 workflow 处理。
- 保持：代码块、negative prompt、负向质量词过滤和 user/assistant 文本拼接顺序不变。
- 测试：VLM chat 模块增加正向视觉上下文测试；入口合同检查新增 controller 接口。
- 验证：Node `30 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.148 P4al VLM fallback 图片意图判断拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `detectVlmImageGenerationIntent`、`vlmAssistantPretendsGenerationComplete` 和 `vlmVisualScenePromptHint`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除三类文本判断实现，保留 fallback action 的节点模式、预设解析和 action 构造。
- 保持：图片生成/编辑意图、assistant 已生成声明和视觉场景关键词规则不变。
- 测试：VLM chat 模块增加三类意图判断测试；入口合同检查三个新增 controller 接口。
- 验证：Node `29 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.147 P4ak VLM negative prompt 过滤拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `stripVlmAgentUnrequestedNegativePrompt`，承载 negative prompt 显式请求判断和字段过滤。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应过滤实现，保留 action 展示准备和 prompt 生成。
- 依赖：通过 context 注入 `canvasAgentUserExplicitNegativePrompt`，controller 不读取项目或 DOM 状态。
- 保持：negative prompt 字段别名和用户明确要求时保留原 action 的规则不变。
- 测试：VLM chat 模块增加 negative prompt 过滤测试；入口合同检查新增 controller 接口。
- 验证：Node `28 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.146 P4aj VLM 生成控制字段清理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `sanitizeVlmAgentGenerationControlFields`，承载 action 生成控制字段清理。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应字段处理实现，保留 action 展示准备和 workflow 调用。
- 依赖：通过 context 注入 `stripCanvasAgentInlineGenerationParams`，并复用 controller 内已有显式控制项判断。
- 保持：比例/数量、后端随机分辨率、放大、尺寸、steps、CFG 和 seed 规则不变。
- 测试：VLM chat 模块增加生成控制清理测试；入口合同检查新增 controller 接口。
- 验证：Node `27 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.145 P4ai VLM action 元数据访问拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentActionTargetId`、`vlmAgentActionNegativePrompt` 和 `vlmAgentSubjectCountHintFromAction`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除三类字段读取实现，保留目标节点查找、prompt 处理和 workflow 调用。
- 保持：目标 ID 优先级、negative prompt 别名和 subject count 汇总规则不变。
- 测试：VLM chat 模块增加 action 元数据测试；入口合同检查三个新增接口。
- 验证：Node `26 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.144 P4ah VLM action prompt 来源解析拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentActionPrompt`，承载 direct prompt、prepared prompt、user prompt 和历史消息回退。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除 prompt 来源解析实现，保留 prompt target、重写、preflight 和 workflow 执行。
- 依赖：通过 context 注入 `cleanVlmToolPrompt` 和 `extractVlmPreparedImagePrompt`，controller 不读取 DOM 或项目状态。
- 保持：prompt 来源优先级和旧有清理规则不变。
- 测试：VLM chat 模块增加 prompt 来源测试；入口合同检查新增 controller 接口。
- 验证：Node `25 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.143 P4ag VLM prompt review 执行门槛拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentPromptReviewGate`，承载 prompt review 拒绝、问题摘要和 bypass 判断。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除 review 门槛的具体实现，保留 action 状态写回、提示显示、提示词处理和 preflight。
- 保持：拒绝标记、最多 3 个问题、bypass 条件和中英提示规则不变。
- 测试：VLM chat 模块增加 prompt review gate 测试；入口合同检查新增 controller 接口。
- 验证：Node `24 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.142 P4af VLM action 执行门槛拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentActionExecutionGate`，承载 action 锁定状态、已处理状态和可执行状态判断。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应状态判断实现，保留锁集合、action 查找、状态写回和实际执行。
- 保持：可重试状态集合、重复执行提示及 `running` 状态写回规则不变。
- 测试：VLM chat 模块增加执行门槛测试；入口合同检查新增 controller 接口。
- 验证：Node `23 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.141 P4ae VLM 图片 action 结果消息整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `vlmAgentToolResultMessage`，承载图片 action 结果消息是否追加、提示文本和 state 判断。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应判断实现，保留结果节点查找和 `appendVlmChatToolMessage` 调用。
- 保持：结果节点存在条件、已有任务不重复追加失败消息、完成/失败提示和 state 规则不变。
- 测试：VLM chat 模块增加图片 action 结果消息测试；入口合同检查新增 controller 接口。
- 验证：Node `22 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.140 P4ad VLM action 结果状态分类拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `isVlmAgentRunAlreadyPreparingResult`、`vlmAgentActionResultState` 和 `vlmAgentActionResultMessage`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除已有任务识别和结果状态/提示选择实现，保留 action 执行、结果节点查找及聊天工具消息追加。
- 保持：已有任务识别文本、成功/失败/运行中状态转换和默认中英提示不变。
- 测试：VLM chat 模块增加结果分类测试；入口合同检查三个新增 controller 接口。
- 验证：Node `21 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.139 P4ac VLM 失败响应消息整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmChatFailureResponse`，承载失败 assistant 消息、pending 替换、历史裁剪、pending 图片恢复和输入恢复标记。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除失败响应消息整理实现，保留节点 chat/params 写回、失败状态、提示和滚动。
- 保持：错误文本优先级、40 条历史限制、当前输入和 pending 图片保留规则不变。
- 测试：VLM chat 模块增加失败响应测试；入口合同检查新增 controller 接口。
- 验证：Node `20 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.138 P4ab VLM 成功响应消息整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmChatAssistantResponse`，承载 assistant 消息构造、pending 回复替换、40 条历史裁剪、rolling context notice 和自动确认 action 排队标记。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除成功响应消息整理实现，保留 action 准备、节点 chat/params 写回、状态更新和自动执行调度。
- 保持：conversation id、`raw_text`、消息索引、自动确认条件和 queued execution 字段不变。
- 测试：VLM chat 模块增加成功响应消息测试；入口合同检查新增 controller 接口。
- 验证：Node `19 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.137 P4aa VLM 响应 action 合并与自动确认选择拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `mergeVlmImageGenerationActions` 和 `findVlmAutoConfirmActionIndex`，承载图片 action 合并和自动确认目标选择。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应响应处理实现，改为调用 controller；action 参数预处理、目标节点查找、执行状态写回和 workflow 启动仍留在主入口。
- 保持：非图片 action 顺序、prompt review 拒绝过滤、自动确认开关和既有响应消息整理行为不变。
- 测试：VLM chat 模块增加图片 action 合并与自动确认索引断言；入口合同检查两个新增 controller 接口。
- 验证：Node `18 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.136 P4z VLM action 执行计划整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 action 控制识别、图片数量提取、后端分辨率判断和 `vlmAgentActionExecutionPlan`。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除对应参数清理实现，保留转发；预检、节点目标和 workflow 执行继续留在主入口。
- 保持：显式比例/数量/放大/尺寸/steps/CFG/seed 规则及后端随机分辨率保留行为不变。
- 测试：VLM chat 模块增加 action plan 测试；入口合同增加四个 controller 接口检查。
- 验证：Node `17 passed`；Python 合同 `20 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.153 P4aq VLM action 执行前 prompt 准备拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmAgentActionExecution`，承载 action prompt 来源、target/purpose、qwen natural 回退、Danbooru 修复、wildcard preview 和 prompt preflight。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 prompt review、执行锁、状态写回、workflow 调用、异常处理和 DOM 更新。
- 保持：backend locked 快速路径、Danbooru review guard、local fast path、prompt override 和 block 状态规则不变。
- 测试：VLM chat 模块增加 action execution preparation 测试；入口合同检查 controller 转发。
- 验证：Node `34 passed`；Python 合同 `5 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.154 P4ar VLM 图片 action workflow 分发拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `executeVlmAgentImageAction`，承载图片 action 到 Canvas Agent 文生图、图片编辑和 quick tool workflow 的分发及参数组装。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 Canvas Agent 面板启动状态、action 执行锁、prompt review、最终状态写回、结果提示和异常处理；workflow 回调通过 context 注入。
- 保持：文生图、图片编辑、outpaint、erase、replace、upscale 的路由、prepared prompt、prompt preflight、workflow key、结果节点记录和双语提示规则不变。
- 测试：VLM chat 模块增加 workflow callback dispatch 测试；入口合同检查 controller 接口和 callback 注入。
- 验证：Node `35 passed`；专门 Python 合同 `6 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 交叉合同：`16 passed, 1 failed`；失败来自已有 quick-tools 合同要求旧的 `buildVlmAgentContext(...)` 文本，未涉及本次 action 分发逻辑。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.155 P4as VLM action 结果收尾拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `finalizeVlmAgentActionExecution`，承载 action 结果状态归一化、重复运行提示、图片结果工具消息追加和最终 toast 文案选择。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 action 执行循环、锁、prompt review、workflow 启动和异常捕获，结果收尾改为调用 controller。
- 保持：`running`、`finished`、`failed`、已有任务聚焦提示、结果节点图片写入聊天和双语提示规则不变。
- 测试：VLM chat 模块增加结果状态写回和图片工具消息测试；入口合同检查 controller 转发及主入口收尾实现已删除。
- 验证：Node `36 passed`；Python 合同 `7 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 已知交叉合同问题：`test_canvas_agent_quick_tools_contract.py` 仍有一项旧的 `buildVlmAgentContext(...)` 文本断言失败；未涉及本次 action 结果收尾。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.156 P4at VLM 非图片 action 路由拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `executeVlmAgentSafeAction`，承载 focus、select/explain、inspect status、find broken edges、advisory 和 unsupported action 路由。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留节点定位、画布选择、状态读取等副作用实现，通过 context callback 提供给 controller。
- 保持：目标 ID 传递、inspect 后聚焦结果节点、建议类 action 提示和 unsupported action 文案不变。
- 测试：VLM chat 模块增加非图片 action callback routing 测试；入口合同检查 controller 接口、callback 注入和主入口分支删除。
- 验证：Node `37 passed`；Python 合同 `8 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 交叉复验：同步更新旧的 quick-tools 模块归属断言后，三组交叉合同 `19 passed`；此前的 `buildVlmAgentContext(...)` 断言失败已消除。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.157 P4au VLM action 重试上下文整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmAgentRetryContext`，承载原始 user prompt、保留消息范围和待提交图片副本的重建。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留忙碌状态提示、聊天上下文写回、prompt/待提交图片写入和重新启动 VLM 节点。
- 保持：按 `actionIndex` 读取 action prompt 回退、最多 4 张输入图片、上下文截断范围和无原始请求提示不变。
- 测试：VLM chat 模块增加 retry context 测试；入口合同检查 controller 转发和主入口消息扫描逻辑删除。
- 验证：Node `38 passed`；Python 合同 `9 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.158 P4av VLM prompt review bypass 数据整理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmAgentPromptReviewBypass`，承载可绕过判断、review issue 追加、bypass 标记和 queued execution patch 生成。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留忙碌状态检查、patch 写回、重新执行和异常处理。
- 保持：安全拦截不可绕过、可选 review 放行、原 review issue 保留、双语 queued 提示和 action 执行入口不变。
- 测试：VLM chat 模块增加 bypass patch 测试；入口合同检查 controller 转发和主入口数据组装删除。
- 验证：Node `39 passed`；Python 合同 `10 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 交叉复验：三组相邻 Canvas Agent 合同 `21 passed`；Node VLM chat `39 passed`。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.160 P4ax VLM image action 锁生命周期拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `executeVlmAgentImageActionWithLock`，承载图片 action 的 add lock、`running` 状态写回、workflow 异常转失败结果和 finally 释放 lock。
- 主入口：`javascript/infinite_canvas_workbench.js` 只通过 context callback 操作锁集合，并继续负责 action gate、最终结果收尾和全局协调。
- 保持：lock key、自动确认/普通确认提示、异常消息、锁释放时机和 result finalization 规则不变。
- 测试：VLM chat 模块增加锁生命周期测试；入口合同检查 controller 接口、锁 callback 注入和主入口 add/delete 实现删除。
- 验证：Node `41 passed`；Python 合同 `12 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.159 P4aw VLM image action preparation gate 拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmAgentImageExecution`，承载 prompt review gate、prompt preparation 调用及 blocked execution patch 整理。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 blocked 状态写回、提示显示、运行锁、workflow 启动和异常处理。
- 保持：prompt review 拒绝时保留 review 对象，prompt preparation 失败时保留 preflight，状态均写为 `blocked`。
- 测试：VLM chat 模块增加 image execution gate 测试；入口合同检查 controller 转发和主入口重复 gate 逻辑删除。
- 验证：Node `40 passed`；Python 合同 `11 passed`；JavaScript 语法检查和定向 `git diff --check` 通过。
- 未执行：浏览器级 action 执行、完整 Studio、GPU、安装版发布和性能比较；pytest 缓存目录权限警告仍存在。

## 13.161 P4ay VLM action execution 协调层拆分（2026-09-07）

- 功能变化：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `executeVlmAgentAction`，统一承载 live node 刷新、执行 gate、自动确认设置写回、图片 action preparation、图片 workflow 调用、非图片 action 路由、结果收尾和异常失败处理。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `executeVlmAgentAction` 只转发到 controller；手动执行、prompt review bypass、自动确认和聊天响应后的自动执行入口不再各自重复失败状态写回与 toast 处理。
- 依赖：新增 `hasVlmAgentActionRunLock` callback，锁集合仍由主入口持有，controller 只读取执行中的锁状态。
- 保持：执行 gate、prompt block 状态、自动确认参数写回、图片锁释放、非图片 action 结果和最终 toast 行为不变。
- 测试变化：VLM chat 模块增加协调层成功执行和 safe action 异常转失败测试；入口合同改为检查 action execution 的 controller 归属。
- 验证：VLM chat Node `43 passed`；三组相关 Python 合同 `24 passed`；主脚本和 VLM chat 模块 JavaScript 语法检查通过。
- 未执行：真实浏览器 action 执行、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一未完成项：继续检查 action execution 迁移后主文件中仍保留的无调用 wrapper 和剩余项目级协调职责。

## 13.162 P4az VLM action execution 转发清理（2026-09-07）

- 功能变化：删除主文件中已没有调用方的 VLM action execution gate、safe action、图片 preparation 和图片 workflow 转发函数；这些职责现在只由 `canvas_vlm_chat.js` 的 controller 协调层持有。
- 主入口：保留 `executeVlmAgentAction` 单一转发入口，以及 retry、prompt review bypass、锁状态和画布副作用 callback；不再保留内部 action 子步骤的重复别名。
- 测试变化：合同测试改为检查 controller 的统一协调入口和主文件不再保留已迁移实现。
- 验证：VLM chat Node `43 passed`；三组相关 Python 合同 `24 passed`；主脚本和 VLM chat 模块 JavaScript 语法检查通过。
- 未执行：真实浏览器 action 执行、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一未完成项：继续检查 VLM 结果、聊天提交和项目级运行调度之间仍留在主文件的独立职责。

## 13.163 P4ba VLM node 响应结果整理拆分（2026-09-07）

- 功能变化：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `finalizeVlmNodeRunResponse`，承载 VLM chat 成功回复、失败恢复、停止状态、action 展示准备、自动 action 调度和节点结果状态写回。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 保留输入收集、上下文构建、模型检查和请求发送；请求完成后的聊天结果整理改为调用 controller。
- 保持：pending assistant 替换、滚动上下文提示、失败时 prompt 和图片恢复、auto-confirm action 延迟执行以及节点 `finished/failed/idle` 状态不变。
- 测试变化：VLM chat 模块增加成功回复、失败回复和 action 元数据保留测试；入口合同检查 `runVlmNode` 不再直接整理响应消息。
- 验证：VLM chat Node `45 passed`；三组相关 Python 合同 `25 passed`；主脚本和 VLM chat 模块 JavaScript 语法检查通过。
- 未执行：真实浏览器聊天提交、停止回复、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一未完成项：继续检查 VLM 请求发送、停止请求和项目级运行调度之间的边界。

## 13.164 P4bb VLM 请求 transport 拆分（2026-09-07）

- 功能变化：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 VLM run/cancel transport，统一处理 request timeout、AbortController、超时后的 backend cancel 和 cancel payload 构造。
- 主入口：`javascript/infinite_canvas_workbench.js` 只保留 run/cancel API 的 controller 转发；`runVlmNode` 的模型检查、active request 状态和停止按钮状态仍由主入口管理。
- 依赖：通过 `sendVlmRun`、`sendVlmCancel`、`scheduleTimeout` 和 `clearScheduledTimeout` callback 注入 API 与计时器。
- 保持：已有 timeout 文案、abort 后 cancel 请求、request/conversation/node 标识和普通 cancel API 返回规则不变。
- 测试变化：VLM chat 模块增加普通请求、cancel payload、timeout abort 和 backend cancel 测试；入口合同确认主文件不再持有 timeout 实现。
- 验证：VLM chat Node `47 passed`；三组相关 Python 合同 `26 passed`；主脚本和 VLM chat 模块 JavaScript 语法检查通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一未完成项：继续整理 active request 状态、停止按钮和 `runVlmNode` 项目级调度之间的职责边界。

## 13.165 P4bc VLM active request 生命周期拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 active request Map 和 `startVlmChatRequest`、`getVlmChatRequest`、`isVlmChatRequestActive`、`clearVlmChatRequest`、`abortVlmChatRequest`，负责 request id、conversation id、node id、project id 与 `AbortController` 生命周期。
- 主入口：`javascript/infinite_canvas_workbench.js` 删除 active request Map 和直接的 `AbortController` 创建；`runVlmNode`、`clearVlmChat`、`stopVlmChatNode` 改为调用 controller 接口。节点状态、聊天消息、滚动、停止按钮和 cancel payload 仍由主入口处理。
- 保持：按 request id 判断当前请求、过期请求不清理新请求、停止时先 abort 再清理、后端 cancel payload 和已有双语提示行为不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加请求状态创建、过期 request 保护、abort 和清理测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查 Map 与 `AbortController` 已归属 controller。
- 验证：VLM chat Node `48 passed`；相关 Python 合同 `30 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查停止后的节点状态写回、结果收尾和 `runVlmNode` 项目级协调是否还能分离。

## 13.166 P4bd VLM chat cancel 协调拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `cancelVlmChatRequest`，统一处理 active request abort、request Map 清理、cancel payload 构造和 `sendVlmCancelRequest`。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `clearVlmChat`、`stopVlmChatNode` 改为调用 `cancelCanvasVlmChatRequest`；主入口继续维护聊天内容、节点状态、滚动和双语提示。
- 保持：clear 与 stop 的 request/conversation/node/project 标识、过期 request 保护、停止时的本地状态更新和 cancel API 行为不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加 cancel 协调测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查 cancel payload 和取消实现不再位于主文件。
- 验证：VLM chat Node `49 passed`；相关 Python 合同 `30 passed`；JavaScript 语法检查通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查停止后的节点状态写回、结果收尾和 `runVlmNode` 项目级协调职责。

## 13.167 P4be VLM stop 节点处理拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `stopVlmChatNode`，承载 VLM chat 停止时的取消请求、pending assistant 替换、节点状态与最后响应写回、滚动和 toast。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `stopVlmChatNode` 只做 controller 转发，停止按钮和右键菜单仍调用同一个公开入口。
- 保持：非 chat 节点校验、停止文案、`idle` 状态、`aborted/cancelled` 标记、cancel 请求和双语提示行为不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加 controller-owned stop 测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查停止状态实现已移出主入口。
- 验证：VLM chat Node `50 passed`；相关 Python 合同 `30 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查 `runVlmNode` 的模型检查失败分支和请求结果收尾之间的职责边界。

## 13.168 P4bf VLM model gate 失败收尾拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `finalizeVlmNodeModelGateFailure`，处理模型检查失败后的 active request 清理、pending assistant 替换、prompt 和待发送图片恢复、节点状态、滚动和时间更新。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 只保留模型检查调用和失败结果转发；不再直接整理模型失败消息和状态。
- 保持：模型未就绪时的 `blocked` 状态、其他模型检查失败的 `failed` 状态、聊天输入恢复以及 request id 匹配规则不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加模型检查失败收尾测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查 controller 接口和主入口分支边界。
- 验证：VLM chat Node `51 passed`；相关 Python 合同 `31 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续整理 `runVlmNode` 请求前后的状态写回与结果收尾协调。

## 13.169 P4bg VLM run 起始状态拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmNodeRunState`，负责 VLM 运行开始时的 history、节点状态、聊天 user/pending assistant 消息、conversation id、输入清空、stick-to-bottom 和首次渲染。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 保留输入收集、rolling history、request state 和模型检查；运行开始状态改为调用 controller。
- 保持：聊天消息最多保留 40 条、图片数量和图片快照、pending assistant 文案、开始运行提示和非 chat 运行状态不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加起始状态测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查输入清空到首次渲染的调用顺序和 controller 归属。
- 验证：VLM chat Node `52 passed`；相关 Python 合同 `32 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续整理 `runVlmNode` 模型通过后的状态写回、request payload 和结果收尾协调。

## 13.170 P4bh VLM ready 状态与 request payload 拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmNodeRunRequest`，负责模型检查通过后的节点状态、Inspector 重绘和 VLM run payload 组装。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 保留输入、history 和 request state 准备，ready 状态与 payload 改由 controller 处理。
- 保持：chat/single 状态文案、request id、conversation id、agent context、rolling history、图片来源和 signal 传递行为不变。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加 ready/payload 测试；`tests/test_canvas_vlm_chat_input_contract.py` 检查主入口调用边界；更新 quick-tools 合同读取 controller 中的 agent context 调用。
- 验证：VLM chat Node `53 passed`；相关 Python 合同 `33 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续整理请求返回后的 active request 判断、清理和结果收尾协调。

## 13.171 P4bi VLM response settlement 拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `settleVlmNodeRunResponse`，统一当前 request 判断、过期 response 拒绝、active request 清理和结果 finalizer 调用。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 只保留 request 发送和 settlement 转发，不再直接清理 request 或调用 `finalizeVlmNodeRunResponse`。
- 保持：过期 response 不覆盖当前聊天，当前 request 才清理；aborted/cancelled response 和原有最终状态规则不变。
- 测试：模块测试增加 stale/current response settlement；Text/VLM 合同改为检查 settlement controller 归属。
- 验证：VLM chat Node `54 passed`；相关 Python 合同 `34 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器停止按钮、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查 `runVlmNode` 请求前后仍留在主入口的项目级协调职责。

## 13.172 P4bj VLM 请求前输入准备拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmNodeRunInput`，负责连接资产和聊天附件序列化、显示历史复制、rolling history、conversation id、active request state 以及 chat image snapshot 准备。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `runVlmNode` 保留空 prompt 检查和 DOM 输入清理，通过 controller 获取运行输入；主入口不再直接读取 `pending_images`、生成 conversation id 或创建 chat request。
- 保持：asset source 序列化、pending image source、聊天历史边界、request id、conversation id 和图片快照的现有行为。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加输入准备专项；`tests/test_canvas_vlm_chat_input_contract.py` 更新 `prepareVlmNodeRunState` 转发断言并增加 `prepareVlmNodeRunInput` 归属检查。
- 验证：VLM chat Node `55 passed`；VLM 输入 Python 合同 `9 passed`；JavaScript 语法检查、Python 合同编译和 `git diff --check` 通过。
- 未执行：真实浏览器聊天提交、停止回复、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查 `runVlmNode` 的模型检查协调和非 chat VLM 路径。

## 13.173 P4bk VLM model gate 拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `ensureVlmModelsBeforeRun`，承载缓存状态检查、模型状态查询、Custom API 未配置处理、缺失模型弹窗和 blocked 状态写回。
- 主入口：移除 `javascript/infinite_canvas_workbench.js` 中的 model gate 实现，通过 callback 注入模型查询、状态缓存、缺失模型弹窗和 `renderAll`。
- 保持：缓存命中、Custom API 提示、缺失模型状态和 Inspector 重绘规则不变。
- 测试：模块测试增加缓存命中与缺失模型测试；输入合同确认 model gate controller 归属。
- 验证：VLM chat Node `56 passed`；VLM 输入 Python 合同 `10 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器模型弹窗、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。

## 13.174 P4bl VLM node run 执行协调拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `executeVlmNodeRun`，统一调用 model gate、payload preparation、VLM transport 和 response settlement。
- 主入口：`runVlmNode` 仅保留节点门禁、连接输入筛选、空 prompt 检查、输入状态准备和执行 controller 调用；删除无调用方的 model gate、payload、settlement 和 response finalizer wrapper。
- 保持：request signal、过期 request 保护、模型失败恢复、response finalizer 以及 chat/single 运行规则不变。
- 测试：增加完整执行协调测试；更新 `tests/test_canvas_vlm_chat_input_contract.py`，检查执行细节已归属 controller。
- 验证：VLM chat Node `57 passed`；VLM 输入 Python 合同 `11 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器 VLM 提交、停止回复、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：评估连接输入筛选和非 chat 参数准备是否还能独立归入 controller。

## 13.175 P4bm VLM 运行上下文拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `prepareVlmNodeRunContext`，负责 VLM runtime params、chat/single 模式、连接槽位、媒体源筛选和 user prompt 整理。
- 主入口：`runVlmNode` 不再直接读取 `image_inputs`、遍历 `VLM_IMAGE_SLOTS` 或过滤连接资产；空 prompt 提示和 DOM 输入清理继续由主入口负责。
- 保持：chat 只使用首个图片槽位，single 使用全部 VLM 图片槽位，媒体类型和 source asset 过滤规则保持不变。
- 测试：模块测试增加运行上下文筛选测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加运行上下文 controller 归属检查。
- 验证：VLM chat Node `58 passed`；VLM 输入 Python 合同 `12 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器 VLM 提交、停止回复、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：检查 `runVlmNode` 剩余的节点门禁与空 prompt 界面行为，确认是否需要继续拆分。

## 13.176 P4bn VLM chat 清空流程拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `clearVlmChatNode`，负责确认、当前 request 取消、conversation id 重建、聊天消息清空、附件保留和节点状态更新。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `clearVlmChat` 只做 controller 转发；清空后的 prompt、agent tool state、文本输出和 toast 仍保持原行为。
- 保持：确认文案、附件和当前输入保留、history 记录、`idle` 状态和 conversation id 更新规则不变。
- 测试：模块测试增加清空聊天流程；`tests/test_canvas_vlm_chat_input_contract.py` 检查清空实现归属 controller。
- 验证：VLM chat Node `59 passed`；VLM 输入 Python 合同 `12 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器清空确认、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查 VLM 节点剩余的入口门禁和非 chat UI 协调职责。

## 13.177 P4bo VLM 模型操作拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `unloadVlmNodeModel` 和 `checkVlmModelAction`，负责模型卸载、手动模型检查、缺失模型提示和状态 toast。
- 主入口：`unloadVlmModel`、`handleVlmModelAction` 只做 controller 转发；删除只服务卸载 API 的 `sendCanvasVlmUnloadRequest`。
- 保持：卸载状态、Inspector 重绘、API payload、ready/custom/missing/error 提示行为不变。
- 测试：模块测试增加卸载成功/失败和手动模型检查测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加模型操作 controller 归属检查。
- 验证：VLM chat Node `61 passed`；VLM 输入 Python 合同 `12 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器模型检查、模型卸载、聊天提交、完整 Studio、GPU 推理、安装版发布和性能比较；工作区仍有既有 LF/CRLF 转换提示。
- 下一步：继续检查 VLM 模型下载和 Custom API 操作是否能按相同边界整理。

## 13.178 P4bp VLM 模型下载协调拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 `queueVlmModelDownloads`，统一处理下载排队前状态、下载响应、模型状态写回、toast 和缺失模型弹窗刷新。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 `sendCanvasVlmModelDownloadsRequest` 的 API payload 适配；下载排队入口改为 controller 转发，并注入 `applyVlmModelStatus` 与 `sendVlmModelDownloads`。
- 保持：单项下载的 `missingModel` 参数、全部下载路径、排队成功后的 `queued` 状态和失败提示保持原有行为。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加成功/失败两条下载协调测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加 controller 归属检查。
- 验证：VLM chat Node `63 passed`；VLM 输入 Python 合同 `13 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器下载按钮、网络下载、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.179 P4bq VLM Custom API 操作拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 Custom API 模型列表拉取、面板折叠和连通性测试协调。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 Custom API 请求适配和临时密钥保存；三个节点操作改为 controller 转发。
- 保持：模型列表返回后的首项选择、状态提示、测试请求参数、面板折叠状态以及 Agent 双向同步入口保持原有行为。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加三项操作测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加 controller 归属检查。
- 验证：VLM chat Node `66 passed`；VLM 输入 Python 合同 `14 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实 Custom API 网络请求、浏览器交互、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.180 P4br VLM Custom API 密钥与 Agent 同步拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_chat.js` 新增 Custom API 密钥保存、读取、删除和 Agent 双向同步协调。
- 主入口：`javascript/infinite_canvas_workbench.js` 保留 DOM、本地存储和 Agent 设置适配；五个 VLM Custom API 节点操作改为 controller 转发。
- 保持：provider 默认 Base URL、API Key 本地存储、密钥回填、模型状态重置、历史记录和 Agent 设置字段保持原有行为。
- 测试：`tests/canvas_vlm_chat_module.test.cjs` 增加密钥和同步测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加 controller 归属检查。
- 验证：VLM chat Node `68 passed`；VLM 输入 Python 合同 `15 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器密钥输入、浏览器本地存储、Agent 设置面板、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.181 P4bs VLM 参数更新拆分（2026-09-07）

- 调整：`javascript/canvas_workbench/canvas_vlm_node.js` 新增 `updateVlmParam`，负责参数类型转换、范围限制、Custom provider 默认值、模式尺寸和模型状态重置。
- 主入口：`javascript/infinite_canvas_workbench.js` 的 `updateVlmParam` 只转发 node controller；系统提示词模板查找、保存调度和局部 DOM 刷新仍通过主入口 callback 或原有流程完成。
- 保持：普通参数保存调度、特殊参数 Inspector 重绘、Custom provider 切换和 chat/single 尺寸规则保持原有行为。
- 测试：`tests/canvas_vlm_node_module.test.cjs` 增加参数更新测试；`tests/test_canvas_vlm_chat_input_contract.py` 增加参数实现归属检查。
- 验证：VLM node Node `4 passed`；VLM chat Node `68 passed`；VLM 输入 Python 合同 `16 passed`；JavaScript 语法检查和 Python 合同编译通过。
- 未执行：真实浏览器参数编辑、系统提示词模板交互、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.182 P4cd VLM Custom API runtime 参数解析拆分（2026-09-07）

- 调整：canvas_vlm_chat.js 新增 Custom API 密钥解析和 runtime 参数组装，优先读取当前输入框，空输入时读取本地 profile；未设置版本时使用默认 VLM 版本，并补齐 Custom provider 默认格式、Base URL 和图像支持字段。
- 主入口：infinite_canvas_workbench.js 的 getVlmCustomApiKey、getVlmCustomRuntimeParams 只做 controller 转发；getVlmCustomKeyInput 继续负责节点视图和 Inspector 的 DOM 查询，getVlmCustomApiProfile 继续供 VLM node 配置视图使用。
- 保持：Custom API 密钥优先级、profile 回退、runtime 参数默认值、模型状态与下载请求的参数内容，以及原参数对象不被写入 custom_api_key 的规则保持不变。
- 测试：canvas_vlm_chat_module.test.cjs 增加密钥和 runtime 参数测试；test_canvas_vlm_chat_input_contract.py 增加 controller 归属检查。
- 验证：VLM chat/node Node 81 passed；VLM 输入 Python 合同 23 passed；JavaScript 语法检查通过；git diff --check 通过。
- 未执行：真实浏览器 Custom API 输入、profile 回填和网络请求，完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.183 P4ce VLM Custom API Key DOM 适配拆分（2026-09-07）

- 调整：canvas_vlm_node.js 新增 Custom API Key 输入框查询、读取和写回方法，复用节点视图与 Inspector 的 UI 区域列表。
- 主入口：infinite_canvas_workbench.js 的 getVlmCustomKeyInput 只做 node controller 转发；chat controller 通过 node controller callback 获取和写回密钥。
- 保持：节点视图优先、选中节点 Inspector 次之的查找顺序，runtime 参数读取时的首尾空白处理，以及写回时的输入值保持不变。
- 测试：canvas_vlm_node_module.test.cjs 增加 Custom API Key DOM 适配测试；test_canvas_vlm_chat_input_contract.py 增加 controller 归属检查。
- 验证：VLM chat/node Node 82 passed；VLM 输入 Python 合同 24 passed；JavaScript 语法检查通过；git diff --check 通过。
- 未执行：真实浏览器节点视图与 Inspector 查找顺序、profile 回填和网络请求，完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.184 P4cf Agent Custom API runtime 参数拆分（2026-09-07）

- 调整：canvas_agent_settings.js 新增 Agent Custom API 参数组装和 runtime 参数接口，统一处理 provider 默认值、profile 密钥回退和当前输入密钥优先级。
- 主入口：infinite_canvas_workbench.js 的参数组装和 runtime 函数只做 settings controller 转发；prompt rewrite、VLM instruction、VLM chat 同步和 Agent Custom API 请求继续使用原有公开函数。
- 保持：Custom API 参数字段、未请求密钥时不写入密钥字段、当前输入优先和 profile 回退规则保持不变。
- 测试：canvas_agent_settings_module.test.cjs 增加 Custom API runtime 测试；新增 test_canvas_agent_custom_runtime_contract.py。
- 验证：Agent/VLM 相关 Node 96 passed；Python 合同 25 passed；JavaScript 语法检查通过；git diff --check 通过。
- 未执行：真实浏览器 Agent Custom API 配置、profile 回填和网络请求，完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.185 P4cg Agent Custom API 配置视图拆分（2026-09-07）

- 调整：`canvas_agent_panel_views.js` 新增 `renderCanvasAgentCustomApiSettings`，负责 Agent Custom API 配置区的 HTML 生成，包括 provider、格式、Base URL、密钥、模型、图像支持和操作按钮。
- 主入口：`infinite_canvas_workbench.js` 的同名函数改为 panel views controller 转发；Custom API 参数组装和 profile 读取通过注入 callback 提供，主入口不再保存该视图的详细 HTML。
- 保持：折叠状态、provider 默认值、模型选择、密钥回填、同步操作和双语界面文本保持原有行为。
- 测试：panel views 模块增加展开/折叠和 profile 密钥回填测试；新增 `test_canvas_agent_panel_views_contract.py`。
- 验证：panel views Node `4 passed`；Agent panel/settings/references/controller 组合 Node `19 passed`；Python 合同 `2 passed`；JavaScript 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器 Agent Custom API 配置编辑、profile 回填、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.186 P4ch Agent 设置页签视图拆分（2026-09-07）

- 调整：`canvas_agent_panel_views.js` 新增 `renderCanvasAgentSettingsTab`，负责 Agent Companion、Ready Presets、快捷工具 Preset、视频快捷工具 Preset 和 Fallback Rules 五个区块的 HTML 生成。
- 主入口：`renderCanvasSettingsPanel` 只保留外层面板、页签和 Canvas 页签；ready preset 扫描状态及各项选项通过注入 callback 传给 panel views controller。
- 保持：preset 状态提示、选择项、禁用规则、视频路线、Fallback 文案和事件属性保持不变。
- 测试：panel views 模块增加完整 Agent 设置页签测试；更新 `test_canvas_agent_panel_views_contract.py`，确认这些区块已归属 panel views controller。
- 验证：Agent panel/settings/references/controller 组合 Node `20 passed`；Python 合同 `2 passed`；JavaScript 语法检查通过。
- 未执行：真实浏览器设置页签交互、preset 扫描、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.187 P4ci Canvas 设置视图拆分（2026-09-07）

- 调整：新增 `canvas_settings_views.js`，提供 `renderCanvasSettingsGeneralTab` 和 `renderCanvasSettingsPanel`，负责 Canvas 设置页签、项目操作区和设置面板外壳 HTML。
- 主入口：`renderCanvasSettingsPanel` 只保留状态读取、视图调用、DOM 写入和 `ensureWorkbenchFormFieldNames`；`modules/ui_gradio_extensions.py` 与 `webui.py` 均在主入口前加载新模块。
- 保持：页签状态、Canvas 开关、项目操作按钮、Agent HTML 注入和双语文本保持不变。
- 测试：新增 `canvas_settings_views_module.test.cjs` 和 `test_canvas_settings_views_contract.py`，覆盖视图内容及两个入口加载顺序。
- 验证：设置视图与 Agent panel/settings/references/controller 组合 Node `22 passed`；Python 合同 `3 passed`；JavaScript/Python 语法检查通过。
- 未执行：真实浏览器设置面板交互、模板/缓存/项目操作、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.188 P4cj Agent 设置字段事件协调拆分（2026-09-07）

- 调整：`canvas_agent_settings.js` 新增 `handleCanvasAgentSettingInput`，统一处理字段值读取、数值限制、Custom provider 更新、视频路线解析和 preset 标记。
- 主入口：`infinite_canvas_workbench.js` 的同名入口改为 settings controller 引用；DOM 事件委托仍由主入口保留。
- 保持：设置 patch、保存、Agent/设置面板重绘和状态刷新顺序保持不变。
- 测试：settings 模块增加字段事件测试；新增 `test_canvas_agent_settings_input_contract.py`。
- 验证：Agent settings、设置视图和 Agent panel 相关 Node `23 passed`；Python 合同 `4 passed`；JavaScript 语法检查通过。
- 未执行：真实浏览器字段输入、provider 切换、视频路线选择、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.189 P4ck Canvas 设置 action 分派拆分（2026-09-07）

- 调整：新增 `canvas_settings_controller.js`，提供 `handleCanvasSettingsAction`，统一处理设置页签、preset、Custom API、Canvas 和项目操作分派。
- 主入口：`infinite_canvas_workbench.js` 只保留事件委托、设置状态、DOM 生命周期和副作用 callback；action 分支实现移出主文件。
- 保持：页签切换刷新、Custom API 操作、Canvas 开关、模板/缓存/项目操作的参数与顺序保持不变。
- 测试：新增 `canvas_settings_controller_module.test.cjs` 和 `test_canvas_settings_controller_contract.py`，覆盖 action 分派及入口加载顺序。
- 验证：设置 controller/views、Agent settings 和 Agent panel 相关 Node `25 passed`；Python 合同 `5 passed`；JavaScript/Python 语法检查通过。
- 未执行：真实浏览器事件委托、设置页签交互、模板/缓存/项目操作、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.190 P4cl Canvas 设置面板生命周期拆分（2026-09-07）

- 调整：`canvas_settings_controller.js` 新增 `openCanvasSettingsPanel` 和 `closeCanvasSettingsPanel`，负责面板可见性、页签状态、互斥面板关闭和首次 preset 刷新。
- 主入口：三个设置入口均改为 controller 导出引用，主入口不再保留对应生命周期实现。
- 保持：默认页签、面板隐藏状态、打开时关闭 Context menu/Run Queue/Run History，以及首次 Agent preset 刷新规则保持不变。
- 测试：settings controller 模块增加生命周期测试；更新 `test_canvas_settings_controller_contract.py`。
- 验证：设置 controller/views、Agent settings 和 Agent panel 相关 Node `26 passed`；Python 合同 `5 passed`；JavaScript 语法和 `git diff --check` 通过。
- 未执行：真实浏览器面板打开/关闭、互斥面板联动、preset 刷新、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.191 P4cm 模板库纯视图拆分（2026-09-07）

- 调整：新增 `canvas_template_library_views.js`，提供模板分类、搜索筛选、模板卡片、模型依赖标签和模板库 HTML 生成。
- 主入口：`infinite_canvas_workbench.js` 只保留模板数据、缓存、modal 生命周期、事件绑定和异步模板操作；纯 HTML 通过 views controller 调用。
- 保持：模板分类、搜索字段、用户模板按钮、依赖状态和双语界面文本保持不变。
- 测试：新增 `canvas_template_library_views_module.test.cjs` 和 `test_canvas_template_library_views_contract.py`，覆盖视图行为及两个入口加载顺序。
- 验证：模板库视图、设置 controller/views 和 Agent 相关 Node `17 passed`；Python 合同 `5 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板库搜索、分类切换、用户模板操作、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.192 P4cn 模板库 modal 事件绑定拆分（2026-09-07）

- 调整：新增 `canvas_template_library_controller.js`，负责模板库 modal 的关闭、保存当前画布、分类切换、搜索、用户模板删除和模板使用事件。
- 主入口：`infinite_canvas_workbench.js` 通过 controller 绑定 modal 事件，继续保留模板数据、缓存、视图刷新和异步模板操作。
- 保持：事件委托、搜索输入监听、模板项查找、分类查询和重新渲染后的监听恢复行为保持不变。
- 测试：新增 `canvas_template_library_controller_module.test.cjs` 和 `test_canvas_template_library_controller_contract.py`，覆盖事件回调、搜索输入和入口加载顺序。
- 验证：模板库 controller/views Node `4 passed`；Python 合同 `2 passed`；JavaScript 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板库交互、异步模板网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.193 P4co 模板库异步刷新协调拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增异步刷新方法，统一处理模板保存/删除后的缓存失效、强制取数、modal 状态保留、HTML 重建和事件重新绑定。
- 主入口：`deleteUserWorkbenchTemplate` 与 `saveCurrentCanvasAsTemplate` 保留确认、模板数据准备和 API 请求，成功后的刷新改由 controller 协调。
- 保持：保存后显示用户分类并清空搜索；删除后保留当前分类和搜索；modal 已关闭时只更新模板列表缓存，不操作 DOM。
- 测试：controller 模块测试增加异步刷新行为；更新 `test_canvas_template_library_controller_contract.py`，确认重复的 modal 重建逻辑已移出主入口。
- 验证：模板库 controller/views Node `5 passed`；Python 合同 `2 passed`；JavaScript 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板保存/删除、异步网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.194 P4cp 模板库数据服务拆分（2026-09-07）

- 调整：新增 `canvas_template_library_data.js`，负责模板项标准化、双语字段、模型依赖、预览路径、静态清单/用户模板合并和缓存。
- 主入口：保留 `getDefaultWorkbenchTemplateLibraryItems` 静态默认数据，列表获取改为调用 data controller；模板媒体分类从 data controller 提供。
- 保持：静态清单优先、用户模板合并、清单请求失败后的默认模板回退、强制刷新和缓存失效行为保持不变。
- 加载：更新 `modules/ui_gradio_extensions.py`、`webui.py` 的脚本声明和加载顺序，data 服务位于模板库视图、事件 controller 和主入口之前。
- 测试：新增 `canvas_template_library_data_module.test.cjs` 和 `test_canvas_template_library_data_contract.py`，覆盖标准化、依赖解析、清单合并、缓存和回退。
- 验证：模板库 data/controller/views Node `8 passed`；Python 合同 `3 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板库加载、网络模板列表请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.195 P4cq 模板创建对话框视图拆分（2026-09-07）

- 调整：`canvas_template_library_views.js` 新增保存模板信息和新建工作台 ID 两个对话框的 HTML 生成方法。
- 主入口：保留默认值计算，通过 views controller 生成表单内容。
- 保持：字段、分类选项、默认描述、标签和双语文本保持不变。
- 测试：views 模块测试增加两个对话框覆盖；更新 Python 合同，确认表单 HTML 已移出主入口。
- 验证：模板库 data/controller/views Node `9 passed`；Python 合同 `3 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板创建交互、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.196 P4cr 模板创建对话框交互拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增两个模板对话框的创建、取消、提交、字段清洗、焦点和清理逻辑。
- 主入口：`saveCurrentCanvasAsTemplate` 和 `createWorkbenchFromTemplate` 只准备业务参数并处理 API/项目状态，表单交互改由 controller 提供。
- 保持：模板 ID、分类、标题、描述、标签和新工作台 ID 的原有清洗与回退行为保持不变。
- 测试：controller 模块测试增加两个对话框提交流程；更新 Python 合同，确认旧对话框函数已移出主入口。
- 验证：模板库 data/controller/views Node `10 passed`；Python 合同 `3 passed`；JavaScript 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板创建/新建工作台交互、模板项目加载、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.197 P4cs 模板项目数据加载拆分（2026-09-07）

- 调整：`canvas_template_library_data.js` 新增模板项目加载方法，负责用户模板 API、内置模板静态文件、失败提示和默认项目回退。
- 主入口：`createWorkbenchFromTemplate` 保留新工作台 ID、当前项目保存、项目字段更新、画布状态清理和重绘协调，模板数据通过 data controller 获取。
- 保持：用户模板加载失败提示、内置模板请求、无路径模板回退和错误日志行为保持不变。
- 测试：data 模块测试增加用户/内置项目加载及失败回退；更新 Python 合同，确认模板项目加载函数已移出主入口。
- 验证：模板库 data/controller/views Node `11 passed`；Python 合同 `3 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板项目加载、新工作台创建、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.198 P4ct 新工作台应用阶段拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增 `applyTemplateWorkbenchProject`，负责加载后项目字段写入、模板设置、资源根、DOM、选择状态、历史、画布更新、模板库关闭和成功提示。
- 主入口：`createWorkbenchFromTemplate` 保留 ID 生成、当前项目保存、缓存项目切换和模板数据加载，加载完成后调用 controller 应用项目。
- 保持：缓存项目切换与项目存储写入顺序、资源根刷新顺序、状态清理和关闭模板库行为保持不变。
- 测试：controller 模块增加新工作台应用顺序测试；更新浏览器缓存、资源根和模板设置合同，检查迁移后的 controller 实现。
- 验证：模板库 data/controller/views Node `12 passed`；相关项目合同 `11 passed`；模板库 Python 合同 `3 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器新工作台创建、资源请求、画布重绘、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.199 P4cu 模板创建异步协调拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增模板创建操作序号、最新操作判断和取消方法。
- 主入口：`createWorkbenchFromTemplate` 在模板 ID、项目缓存保存和模板项目加载完成后检查操作序号；`closeTemplateLibrary` 会取消尚未完成的模板创建操作；缓存保存失败时停止后续项目切换。
- 保持：较早的模板加载结果不会覆盖后一次操作，模板库关闭后的迟到结果不会应用，原有项目保存和应用顺序保持不变。
- 测试：controller 模块增加操作序号测试；更新浏览器缓存合同和模板库 controller 合同，确认异步检查已接入。
- 验证：模板库 data/controller/views Node `13 passed`；模板库 Python 合同 `3 passed`；相关项目合同 `11 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器并发点击、迟到网络响应、创建失败恢复、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.200 P4cv 模板创建失败恢复拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增模板创建失败恢复方法，按操作序号恢复之前的活动缓存项目并显示错误提示。
- 主入口：`createWorkbenchFromTemplate` 捕获模板项目加载异常，传递之前项目 ID和存储作用域；旧操作的异常不会覆盖新操作。
- 保持：成功创建流程、保存失败停止、模板库保留和错误提示行为保持不变。
- 测试：controller 模块增加异常恢复测试；更新浏览器缓存合同和模板库 controller 合同，确认恢复调用已接入。
- 验证：模板库 data/controller/views Node `14 passed`；模板库 Python 合同 `3 passed`；相关项目合同 `11 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器异常恢复、网络失败、并发点击、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.201 P4cw 模板列表刷新生命周期拆分（2026-09-07）

- 调整：`canvas_template_library_controller.js` 新增模板列表刷新操作序号、最新结果判断和取消方法。
- 主入口：`closeTemplateLibrary` 在移除 modal 前取消未完成的模板列表刷新；模板保存/删除仍通过 controller 刷新列表。
- 保持：缓存失效、强制加载、分类/搜索状态恢复和断开 modal 不更新的行为不变。
- 测试：增加旧刷新结果、关闭后的取消结果测试；更新模板库 controller 合同。
- 验证：模板库 data/controller/views Node `15 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器保存/删除并发、modal 关闭重开、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.202 P4cx 模板 modal 局部刷新拆分（2026-09-07）

- 调整：`refreshTemplateLibraryModal` 从 `infinite_canvas_workbench.js` 迁移到 `canvas_template_library_controller.js`，分类和搜索事件改为调用 controller 内部方法。
- 主入口：保留 view helper 注入和 controller 方法转发，移除 modal 局部 DOM 更新实现。
- 保持：分类、搜索、空列表提示和卡片更新行为不变；异步保存/删除刷新继续使用原有完整列表渲染。
- 测试：更新 controller 模块测试和模板库 controller 合同。
- 验证：模板库 data/controller/views Node `15 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器分类切换、搜索输入、modal 关闭重开、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.203 P4cy 模板 modal 生命周期拆分（2026-09-07）

- 调整：`openTemplateLibrary`、`closeTemplateLibrary` 从 `infinite_canvas_workbench.js` 迁移到 `canvas_template_library_controller.js`。
- 主入口：改为转发 controller 方法，注入 context menu、设置面板、文档对象、模板数据和 view helper。
- 保持：旧 modal 清理、初始分类、主题、焦点和异步操作取消行为不变。
- 测试：增加 controller modal 生命周期测试；更新模板库 controller 合同。
- 验证：模板库 data/controller/views Node `16 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器打开/关闭、设置面板联动、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.204 P4cz 模板保存删除操作拆分（2026-09-07）

- 调整：用户模板保存、删除、确认、API 请求、项目压缩和保存后列表刷新迁移到 `canvas_template_library_controller.js`。
- 主入口：注入项目、缓存、API、确认对话框、模型依赖推断和默认设置，保留 controller 方法转发。
- 保持：内置模板保护、删除确认、保存后端返回项目的使用、错误提示和列表刷新行为不变。
- 测试：增加保存载荷、保存后项目替换、删除确认测试；更新模板库 controller 合同。
- 验证：模板库 data/controller/views Node `18 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器保存/删除、后端 API、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.205 P4da 模板模型依赖推断拆分（2026-09-07）

- 调整：`inferProjectTemplateModelDependency` 迁移到 `canvas_template_library_data.js`。
- 主入口：转发 data controller 方法，保存模板 controller 使用注入的推断接口。
- 保持：model-free、模型去重、依赖提示和 onboarding 示例排除行为不变。
- 测试：data 模块增加模型依赖推断覆盖；更新 data 合同。
- 验证：模板库 data/controller/views Node `19 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实模板保存、后端 API、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.206 P4db 模板设置应用拆分（2026-09-07）

- 调整：当前画布设置保留和模板设置合并迁移到 `canvas_template_library_controller.js`。
- 主入口：注入当前项目、默认设置和 `cloneRunValue`，移除设置合并实现。
- 保持：设置合并顺序、内部键过滤和 `__template_source` 写入行为不变。
- 测试：更新 controller 应用测试和模板设置合同。
- 验证：模板库 data/controller/views Node `19 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实新工作台创建、浏览器设置恢复、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.207 P4dc 新工作台创建协调拆分（2026-09-07）

- 调整：模板 ID、项目缓存保存、缓存项目切换、模板加载、异常恢复和新项目应用协调迁移到 `canvas_template_library_controller.js`。
- 主入口：转发 controller 创建方法，注入项目 ID、缓存作用域、缓存 key、保存、加载和切换依赖。
- 保持：保存失败、迟到请求、加载异常恢复、缓存作用域和应用顺序不变。
- 测试：增加 controller 完整创建流程测试；更新浏览器缓存合同和 controller 合同。
- 验证：模板库 data/controller/views Node `20 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器新工作台创建、缓存读写、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.208 P4dd 内置模板 fallback 拆分（2026-09-07）

- 调整：内置模板 fallback 清单迁移到 `canvas_template_library_defaults.js`，新增 defaults controller。
- 主入口：移除约 28KB 清单，注入 defaults controller；更新 Gradio lazy assets 和 standalone 脚本加载顺序。
- 保持：manifest 回退时的模板内容、路径、分类和模型依赖元数据不变。
- 测试：新增 defaults 模块测试；更新 data 加载合同。
- 验证：模板库 defaults/data/controller/views Node `21 passed`；相关模板库与项目 Python 合同 `14 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实 manifest 失败回退、浏览器模板库、网络请求、完整 Studio、GPU 推理、安装版发布和性能比较。

## 13.209 P4de 模板 API 适配与确认弹窗拆分（2026-09-07）

- 调整：新增 `canvas_template_library_api.js`，集中处理模板保存、列表、加载、删除请求和 `user_context` 注入。
- 调整：新增 `canvas_confirm_dialog.js`，移出模板删除确认弹窗；主入口只保留模块实例化和依赖注入。
- 保持：直接模板 API、Gradio bridge fallback、确认弹窗主题、键盘操作、遮罩点击和双语文案行为不变。
- 测试：新增 API/确认弹窗 Node 模块测试和支持模块加载合同。
- 验证：模板相关 Node `26 passed`；模板、缓存和 standalone Python 合同 `19 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实浏览器模板流程、模板后端网络请求、完整 Studio、GPU 推理和安装版验收。

## 13.210 P4df 模板库真实浏览器流程验收（2026-09-07）

- 新增：`tests/canvas_template_library_playwright.mjs` 使用 Playwright 加载实际模板库 views、API、确认弹窗和 controller 模块。
- 覆盖：模板库打开、当前画布保存、用户模板删除确认、分类切换和从内置模板新建工作台。
- 保持：模板 API 请求携带 `user_context.__lang`，确认弹窗和缓存项目切换行为保持不变。
- 验证：Playwright 浏览器流程通过；模板相关 Node `26 passed`；模板、缓存和 standalone Python 合同 `19 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.211 P4dg Canvas 项目操作拆分（2026-09-07）

- 调整：新增 `canvas_project_actions_controller.js`，接管浏览器缓存清理、项目文件清空、快速入门加载和项目切换。
- 主入口：改为注入存储、项目状态、后端清空、缓存切换和画布刷新回调，删除原四个项目操作函数。
- 保持：缓存 key 清理、确认流程、切换前保存、后端加载失败后的本地缓存保留和双语提示行为不变。
- 测试：新增项目操作 controller Node 测试；更新浏览器缓存合同和加载顺序合同。
- 验证：模板浏览器流程通过；相关 Node `34 passed`；模板、项目缓存、设置和 standalone Python 合同 `20 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。



## 13.212 P4dh Canvas 项目 JSON 导入拆分（2026-09-07）

- 调整：`importWorkbenchProjectFromFile` 迁移到 `canvas_project_actions_controller.js`，集中处理 JSON 解析、项目 ID 生成、项目清理、浏览器缓存切换、画布重绘和可选后端持久化。
- 主入口：注入 `readFileAsText` 并转发 controller 方法，移除导入实现。
- 保持：无效 JSON 的中英双语错误提示、当前项目先保存、同名项目改用新 ID 和导入后的缓存项目隔离行为不变。
- 测试：增加导入成功/失败 Node 覆盖；图片节点项目加载合同改为检查模板 controller 的项目替换实现。
- 验证：项目操作 controller Node `7 passed`；模板库相关 Node `33 passed`；模板、项目缓存、导入和 standalone Python 合同 `31 passed`；模板库 Playwright 浏览器流程通过；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.213 P4di Canvas 项目 ID 切换拆分（2026-09-07）

- 调整：`switchProjectById` 迁移到 `canvas_project_actions_controller.js`，项目管理面板改为使用 controller 方法。
- 主入口：注入选中状态、后端加载标记、缓存项目切换、项目加载和画布刷新回调，移除 ID 切换实现。
- 保持：当前项目先写入浏览器缓存、切换前清理状态、后端加载失败后恢复原项目和选中状态、重新加载当前项目的确认流程，以及缺失项目的本地缓存创建行为不变。
- 测试：新增成功切换和失败恢复 Node 覆盖；更新项目操作和浏览器缓存合同。
- 验证：项目操作与模板库 Node `35 passed`；模板、项目缓存、导入和 standalone Python 合同 `31 passed`；模板库 Playwright 浏览器流程通过；JavaScript/Python 语法检查通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.214 P4dj 活动项目删除处理拆分（2026-09-07）

- 调整：`handleProjectDeleted` 迁移到 `canvas_project_actions_controller.js`，项目管理面板继续调用注入的回调。
- 保持：活动项目文件删除后的磁盘状态标记、浏览器缓存保留、资源根刷新、后端加载标记清理和状态刷新行为不变；非活动项目删除不改当前画布。
- 测试：新增活动/非活动项目删除 Node 覆盖；更新项目操作和浏览器缓存合同。
- 验证：项目操作与模板库 Node `37 passed`；模板、项目缓存、导入和 standalone Python 合同 `31 passed`；模板库 Playwright 浏览器流程通过；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.215 P4dk 画布历史记录拆分（2026-09-07）

- 调整：新增 `canvas_history_controller.js`，集中处理撤销、重做、批量历史、历史内存限制、项目快照恢复和历史按钮状态。
- 主入口：注入项目快照、选中状态、项目恢复、画布重绘、保存和上下文菜单回调，移除历史栈与历史处理实现。
- 保持：历史快照、选中节点恢复、双语提示和撤销/重做按钮状态不变；更新 Gradio lazy assets 和 standalone 脚本加载顺序。
- 测试：新增历史 controller Node 模块测试和加载顺序合同。
- 验证：历史、项目操作和模板库 Node `40 passed`；模板、项目缓存、导入、历史和 standalone Python 合同 `32 passed`；模板库 Playwright 浏览器流程通过；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.216 P4dl Canvas 项目资产职责拆分（2026-09-07）

- 调整：新增 `canvas_project_assets_controller.js`，集中处理资产路径解析、安全显示 URL、资源根同步、资源目录刷新、项目引用标准化和内联媒体物化。
- 主入口：创建资产 controller 并通过依赖注入提供项目、缓存、后端请求、渲染和资产物化能力，删除资产目录状态及原实现。
- 保持：VLM chat 图片引用、结果预览、媒体节点预览和项目资产根切换行为不变；移除内联保存流程中无关的 VLM action 状态写入。
- 测试：新增资产 controller Node 模块测试、资产加载顺序合同，并更新资源预览合同以检查新模块。
- 验证：资产相关 Node 与既有 controller 专项 `43 passed`；Python 合同 `24 passed`；模板库 Playwright、JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.217 P4dm Canvas 后端请求适配拆分（2026-09-07）

- 调整：新增 `canvas_backend_request_controller.js`，集中处理 `user_context`、后端 API 请求适配、项目/资产/运行/VLM/翻译请求和项目 bridge fallback。
- 主入口：创建请求 controller 并注入 API、bridge、序列化、VLM runtime 参数和语言状态依赖，移除原请求 wrapper 与用户上下文实现。
- 保持：`user_context.__lang`、直接 API 优先、bridge fallback、VLM chat 请求委托和可选 API 不可用时的返回行为。
- 测试：新增请求 controller Node 模块测试和加载顺序合同；更新 VLM transport、资源预览、standalone 及相关请求合同。
- 验证：后端请求 controller Node `5 passed`；后端、资产、历史和项目操作 Node 专项 `22 passed`；相关 Python 合同 `23 passed`；JavaScript/Python 语法检查通过。
- 未执行：真实后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.218 P4dn Canvas 项目持久化职责拆分（2026-09-07）

- 调整：新增 `canvas_project_persistence_controller.js`，集中处理项目保存、浏览器缓存压缩写入、存储范围切换、版本决策和后端项目加载。
- 主入口：改为注入项目状态、存储状态、缓存、项目 store、资产根、渲染和后端请求能力，删除原保存/缓存/存储范围同步/后端加载实现。
- 保持：直接 API 优先、Canvas bridge fallback、浏览器缓存较新时保留本地项目、加载后的历史与选中状态清理和双语提示。
- 测试：新增 controller Node 模块测试与加载顺序合同；更新 Gradio6 lazy assets 和 standalone 脚本加载顺序。
- 验证：项目持久化 controller Node `7 passed`；加载合同 `1 passed`；JavaScript/Python 语法检查通过。
- 未执行：完整相关回归、真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.219 P4do Canvas bridge transport 拆分（2026-09-07）

- 调整：新增 `canvas_bridge_transport.js`，集中处理 bridge 可用性检查、响应监听、请求 ID、超时和 Gradio hidden textbox/button 交互。
- 主入口：注入 Gradio helper、`document`、`uid` 和定时器依赖，移除原 `bridgeRequests` 状态与三项 transport 实现。
- 保持：bridge 未连接、请求文本框缺失、按钮缺失、超时和响应输入/变更事件的返回行为。
- 测试：新增 bridge controller Node 模块测试和加载顺序合同；更新 Gradio6 lazy assets 与 standalone 脚本加载顺序。
- 验证：Bridge、后端请求、项目持久化和项目操作 Node `29 passed`；相关 Python 合同 `6 passed`；JavaScript 语法检查通过。
- 未执行：完整相关回归、真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.220 P4dp Qwen TTS style preset 数据职责拆分（2026-09-07）

- 调整：新增 `canvas_qwen_tts_presets_controller.js`，集中处理 preset 列表规范化、去重、请求刷新、loading/ready/empty/error 状态和 inspector 刷新通知。
- 主入口：移除 `qwenTtsStylePresetState` 及对应规范化/刷新实现，Qwen TTS 节点 context 改为读取 controller 列表。
- 测试：新增 controller Node 模块测试和加载顺序合同；更新 Gradio6 lazy assets 与 standalone 脚本加载顺序。
- 验证：Qwen TTS preset controller Node `5 passed`；加载合同 `1 passed`；JavaScript 语法检查通过。
- 未执行：完整相关回归、真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.221 P4dq VLM chat 图片预览职责拆分（2026-09-07）

- 调整：新增 `canvas_vlm_chat_image_preview_controller.js`，集中处理图片预览浮层的尺寸计算、创建、定位、显示/隐藏和 pointer 事件。
- 主入口：移除预览浮层状态及实现，注入 `document`、窗口尺寸、根节点、`escapeHtml` 和 tooltip 回调，保留现有事件绑定。
- 测试：新增 controller Node 模块测试和加载顺序合同；更新 Gradio6 lazy assets 与 standalone 脚本加载顺序。
- 验证：VLM chat 图片预览 controller Node `4 passed`；加载合同 `1 passed`；JavaScript 语法检查通过。
- 未执行：包含新增 controller 的完整回归、真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.222 P4dr Canvas tooltip controller 拆分（2026-09-07）

- 调整：新增 `canvas_tooltip_controller.js`，集中处理 tooltip 目标筛选、文案读取、浮层创建、边缘定位、原生 `title` 恢复和 pointer/focus 事件。
- 主入口：移除 tooltip 状态及原实现，改为注入根节点、窗口和 Canvas pointer gesture 查询；VLM chat 图片预览依赖 controller 提供的隐藏方法。
- 保持：Canvas agent、VLM chat 图片、模型/Lora hover preview 的排除规则，拖动画布时隐藏、窗口边缘定位和 title 恢复行为。
- 测试：新增 controller Node 模块测试和加载顺序合同；同步 Gradio6 lazy assets 与 standalone 脚本顺序。
- 验证：tooltip controller Node `4 passed`；加载合同 `1 passed`；JavaScript 语法检查和 `git diff --check` 通过。
- 未执行：包含新增 controller 的完整回归、真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.223 P4ds Canvas hover preview 拆分（2026-09-07）

- 调整：新增 `canvas_hover_preview_controller.js`，集中处理模型/Lora/风格预览路径、元数据、模型详情请求、图片探测、浮层渲染、定位和 pointer/focus 事件。
- 主入口：移除 hover preview 状态、缓存和实现，注入节点查询、系统参数、静态资源路径、图片/fetch 与 tooltip 隐藏回调；保留 `SimpAICanvasWorkbenchHoverPreview` 的 `hide/attrs` 接口。
- 保持：预览路径转换、异步结果过期检查、拖动画布时隐藏、窗口边缘定位和双语提示行为。
- 测试：新增 controller Node 模块测试和加载顺序合同；同步 Gradio6 lazy assets 与 standalone 脚本顺序。
- 验证：hover preview controller Node `4 passed`；加载合同 `1 passed`；最终相关 Node `71 passed`、Python 合同 `28 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.224 P4dt 模型预览 select 菜单拆分（2026-09-07）

- 调整：新增 `canvas_preview_select_controller.js`，集中处理模型/Lora select 自定义菜单、选项属性、定位、键盘导航、选择事件和关闭行为。
- 主入口：移除 select 菜单状态及实现，滚动监听改为调用 controller 的菜单状态查询；注入 DOM、窗口、根节点、转义、可断行文案和 hover preview 隐藏回调。
- 保持：`input`/`change` 事件顺序、Escape/方向键、菜单外点击关闭和预览 hover 属性行为。
- 测试：新增 controller Node 模块测试和加载顺序合同；同步 Gradio6 lazy assets 与 standalone 脚本顺序。
- 验证：preview select controller Node `3 passed`；加载合同 `1 passed`；最终相关 Node `71 passed`、Python 合同 `28 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.225 P4du Danbooru autocomplete controller 拆分（2026-09-07）

- 调整：新增 `canvas_danbooru_autocomplete_controller.js`，集中处理 autocomplete 启用判断、token 解析、下拉浮层、请求缓存、预热、键盘导航、标签插入和失焦关闭。
- 主入口：移除 Danbooru autocomplete 状态、缓存和交互实现；节点渲染使用 controller 提供的方法，运行时提示和文本输入事件通过依赖注入保留。
- 保持：token 边界、请求过期检查、缓存上限、标签分隔符、`input` 通知和双语展示行为。
- 测试：新增 controller Node 模块测试和加载顺序合同；同步 Gradio6 lazy assets 与 standalone 脚本顺序。
- 验证：Danbooru controller Node `4 passed`；最终 Canvas controller Node `75 passed`；相关 Python 合同 `29 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 已知：全量 `test_canvas_*_contract.py` 另有 `10` 条其他既有拆分区域的文本断言失败。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。

## 13.226 P4dv Canvas 状态展示 controller 拆分（2026-09-07）

- 调整：新增 `canvas_run_status_controller.js`，集中处理顶部运行队列控件摘要、standalone 状态请求与轮询、系统信息条和后端断开告警。
- 主入口：移除状态摘要、standalone fetch/定时器、系统信息和告警渲染实现；通过动态项目与 DOM getter 注入 controller，保留面板协调、打开/关闭生命周期和现有事件绑定。
- 保持：`get_start_timestamp` 失败后回退 `/gradio_api/run/predict`、状态广播事件、运行队列进度计算、后端告警清除和中英双语展示行为。
- 测试：新增状态 controller Node 模块测试和加载顺序 Python 合同；同步 Gradio6 lazy assets 和 standalone 脚本加载顺序。
- 验证：状态 controller Node `4 passed`；运行状态、历史和设置 Node 专项 `10 passed`；相关 Python 合同 `11 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 已知：pytest 受既有 `.pytest_cache` 权限限制产生缓存警告；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余的大职责，并安排 Canvas 浏览器级回归。

## 13.227 P4dw Canvas minimap controller 拆分（2026-09-07）

- 新增 `canvas_minimap_controller.js`，承接 minimap 静态数据缓存、视口矩形映射、节点缩略图渲染、拖动定位、延迟刷新、立即刷新和缓存重置。
- 主入口删除旧 minimap 渲染、拖动、定时器和缓存状态，通过依赖注入保留项目、viewport、选中状态、性能统计及渲染回调；原有调用入口和事件绑定保持不变。
- 保留 minimap 设置开关、Canvas 溢出判断、视口矩形跟随、点击定位、视口矩形拖动、viewport 保存和性能统计行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，controller 在主入口前加载。
- 测试：新增 minimap controller Node 模块测试和 Python 加载合同；minimap Node `3 passed`，全部 Canvas controller Node `253 passed`，minimap 合同 `2 passed`，相关 Python 合同 `14 passed`。
- JavaScript/Python 语法检查和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.239 P4ei Canvas timeline preview controller 拆分（2026-09-07）

- 新增 `canvas_timeline_preview_controller.js`，承接时间线预览区域的 move、scale、rotate、left/right/top/bottom crop 拖动状态、坐标换算、keyframe 同步、mask 几何更新、预览 DOM 刷新和保存。
- 主入口删除 `timelinePreviewDragState` 及旧的 preview pointer 函数，通过依赖注入保留 clip 选择、时间线数据更新和渲染回调；活动指针判断改用 controller 状态。
- 保留非 audio clip 过滤、锁定节点过滤、不同 pointer 过滤、`pointercancel`、pointer capture、各拖动模式的范围限制和释放后的 Inspector 刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，timeline preview controller 在主入口前加载。
- 测试：新增 timeline preview controller Node 模块测试和 Python 加载合同；timeline preview controller Node `3 passed`，全部 Canvas controller Node `289 passed`，全部 controller Python 合同 `35 passed`。
- JavaScript/Python 语法检查、旧 preview 状态/函数搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.238 P4eh Canvas timeline playhead controller 拆分（2026-09-07）

- 新增 `canvas_timeline_playhead_controller.js`，承接时间线 playhead 拖动状态、lane 百分比换算、历史记录、pointer capture、pointer 生命周期、playhead/preview DOM 刷新和保存。
- 主入口删除 `timelinePlayheadDragState` 及旧的 playhead pointer 函数，通过依赖注入保留时间线节点、历史、DOM 刷新和保存回调；活动指针判断改用 controller 状态。
- 保留时间线 playhead 拖动、锁定节点过滤、不同 pointer 过滤、`pointercancel`、范围限制、历史记录和释放后的自动保存行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，timeline playhead controller 在主入口前加载。
- 测试：新增 timeline playhead controller Node 模块测试和 Python 加载合同；timeline playhead controller Node `3 passed`，全部 Canvas controller Node `286 passed`，全部 controller Python 合同 `33 passed`。
- JavaScript/Python 语法检查、旧 playhead 状态/函数搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.237 P4eg Canvas text control pointer controller 拆分（2026-09-07）

- 新增 `canvas_text_control_pointer_controller.js`，承接文本控件 pointer selection 状态、pointer capture、跨元素移动拦截、`is-text-selecting` class 和取消清理。
- 主入口删除 `textControlPointerState` 及旧的 pointerdown/move/stop 函数，通过依赖注入保留可编辑控件查询和 editable 判断；原有 root pointerdown 事件入口保持不变。
- 保留隐藏 root、禁用控件、非主键过滤，文本控件跨元素拖选、控件脱离 DOM 后清理和中英双语界面现有行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，text control pointer controller 在主入口前加载。
- 测试：新增 text control pointer controller Node 模块测试和 Python 加载合同；text control pointer controller Node `3 passed`，全部 Canvas controller Node `283 passed`，全部 controller Python 合同 `31 passed`。
- JavaScript/Python 语法检查、旧文本控件 pointer 状态/函数搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.236 P4ef Canvas Compare drag controller 拆分（2026-09-07）

- 新增 `canvas_compare_drag_controller.js`，承接 Compare 分割线百分比计算、锁定判断、stage pointer capture、pointer 生命周期、DOM 刷新、保存和 Inspector 刷新。
- 主入口删除 `compareDragState` 及旧的 Compare pointer 函数，通过依赖注入保留节点选择、参数更新和渲染回调；活动指针判断改用 controller 状态。
- 保留 Compare stage 拖动、已选节点处理、不同 pointer 过滤、`pointercancel`、分割线范围限制和自动保存行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，Compare drag controller 在主入口前加载。
- 测试：新增 Compare drag controller Node 模块测试和 Python 加载合同；Compare drag controller Node `3 passed`，全部 Canvas controller Node `280 passed`，全部 controller Python 合同 `29 passed`。
- JavaScript/Python 语法检查、旧 Compare 状态/函数搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.235 P4ee Canvas note tail controller 拆分（2026-09-07）

- 新增 `canvas_note_tail_controller.js`，承接提示贴指向点拖动状态、锁定判断、缩放坐标换算、snap、历史记录、pointer 生命周期、保存和 Inspector 刷新。
- 主入口删除 `noteTailDragState` 及旧的 `startNoteTailDrag`、`onNoteTailDragMove`、`stopNoteTailDrag`，通过依赖注入保留选择、目标初始化、渲染、历史和保存回调；活动指针判断改用 controller 状态。
- 保留锁定提示的中英双语展示、不同 pointer 过滤、鼠标取消、指向目标持久化、选中状态更新和连线刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，note tail controller 在主入口前加载。
- 测试：新增 note tail controller Node 模块测试和 Python 加载合同；note tail controller Node `3 passed`，全部 Canvas controller Node `277 passed`，全部 controller Python 合同 `27 passed`。
- JavaScript/Python 语法检查、旧 note tail 状态/函数搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.234 P4ed Canvas connection controller 拆分（2026-09-07）

- 新增 `canvas_connection_controller.js`，承接输出端连线、输入端拖动创建端口、临时边、pointer 生命周期、目标吸附、连接失败后的 Add Node 菜单和取消逻辑。
- 主入口删除 `connectState` 及旧连线 pointer 函数和临时边实现，通过依赖注入保留目标查找、实际连接、菜单和渲染回调；连接入口和业务回调保持不变。
- 保留输出端连接到输入端、输入端拖动创建端口、未命中目标时打开 Add Node 菜单、连接取消、tooltip/preview/select menu 关闭和中英双语界面行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，connection controller 在主入口前加载。
- 测试：新增 connection controller Node 模块测试和 Python 加载合同；connection controller Node `4 passed`，相关 Python 合同 `2 passed`。
- JavaScript 语法检查和旧连线状态/函数搜索通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.230 P4dz Canvas node resize controller 拆分（2026-09-07）

- 新增 `canvas_node_resize_controller.js`，承接节点 resize 状态、尺寸约束、snap 计算、选中状态同步、collapsed prompt 高度处理及 pointer 生命周期。
- 主入口删除 `nodeResizeState` 和 resize 处理函数，通过依赖注入保留尺寸查询、选中状态、历史、连线、minimap、空间索引、保存和 inspector 回调；原有 node event 调用入口保持不变。
- 保留锁定节点忽略、最小/最大尺寸、snap、Note DOM 刷新、collapsed prompt 高度、历史记录和中英双语界面行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，controller 在主入口前加载。
- 测试：新增 node resize controller Node 模块测试和 Python 加载合同；node resize Node `3 passed`，全部 Canvas controller Node `262 passed`，相关 Python 合同 `20 passed`。
- JavaScript/Python 语法检查和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.229 P4dy Canvas run panels controller 拆分（2026-09-07）

- 新增 `canvas_run_panels_controller.js`，承接运行队列/历史 context 构造、侧栏互斥开关、布局 class 与宽度同步、面板渲染/操作转发和运行队列 widget 刷新。
- 主入口删除对应 context、布局和生命周期 wrapper，通过依赖注入保留项目、面板、选中节点、运行服务和动态回调；队列/历史具体服务继续由既有模块负责。
- 保留队列与历史面板互斥、结果定位、运行控制、侧栏宽度同步和中英双语展示行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，controller 在主入口前加载。
- 测试：新增 run panels controller Node 模块测试和 Python 加载合同；run panels Node `3 passed`，全部 Canvas controller Node `259 passed`，相关 Python 合同 `18 passed`。
- JavaScript/Python 语法检查和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.228 P4dx Canvas group interaction controller 拆分（2026-09-07）

- 新增 `canvas_group_interaction_controller.js`，承接分组选择、右键菜单、分组拖动、分组缩放、组内未锁定节点跟随、拖动历史记录和交互渲染协调。
- 主入口删除 group drag/resize 状态及事件处理，通过依赖注入保留项目、分组层、节点查询、历史、渲染和保存回调；全局 pointer 手势判断改为 controller 状态查询。
- 保留锁定分组提示、snap 设置、边缘渲染 LOD、minimap 刷新、节点空间索引、viewport 保存和 inspector 刷新行为，以及中英双语提示。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，controller 在主入口前加载。
- 测试：新增 group interaction controller Node 模块测试和 Python 加载合同；group Node `3 passed`，全部 Canvas controller Node `256 passed`，相关 Python 合同 `16 passed`。
- JavaScript/Python 语法检查和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条其他既有拆分区域文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.231 P4ea Canvas node drag controller 拆分（2026-09-07）

- 新增 `canvas_node_drag_controller.js`，承接多选节点拖动、锁定节点过滤、snap 坐标、历史记录、连线/minimap/空间索引刷新、拖动 LOD 和保存协调。
- 主入口删除旧的 `startNodeDrag`、`onNodeDragMove`、`stopNodeDrag` 及 `dragState`，通过依赖注入保留项目、选中节点、锁定判断、历史、渲染和保存回调；节点事件调用入口保持不变。
- 保留锁定节点提示、锁定节点原位、中英双语展示、pointer 生命周期和拖动结束后的渲染刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，node drag controller 在主入口前加载。
- 测试：新增 node drag controller Node 模块测试和 Python 加载合同；node drag Node `3 passed`，全部 Canvas controller Node `265 passed`，相关 Python 合同 `19 passed`。
- JavaScript/Python 语法检查、旧拖动逻辑搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.232 P4eb Canvas pan controller 拆分（2026-09-07）

- 新增 `canvas_pan_controller.js`，承接 viewport 平移状态、pointer 生命周期、viewport 坐标更新、minimap 跟随、节点预览刷新、边缘渲染 settle 和保存协调。
- 主入口删除旧的 `startPan`、`onPanMove`、`stopPan` 及 `panState`，通过依赖注入保留 viewport、项目、渲染、minimap 和保存回调；viewport 事件绑定和既有渲染调度入口保持不变。
- 保留平移过程的 SVG edge fallback、节点预览延迟渲染、minimap 更新、pointer capture 和拖动结束后的边缘/节点/minimap 刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，pan controller 在主入口前加载。
- 测试：新增 pan controller Node 模块测试和 Python 加载合同；pan Node `2 passed`，相关 Python 合同 `2 passed`。
- JavaScript/Python 语法检查和旧平移逻辑搜索通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.233 P4ec Canvas marquee controller 拆分（2026-09-07）

- 新增 `canvas_marquee_controller.js`，承接框选状态、pointer 生命周期、叠加选择、空间索引结果应用、框选 DOM、调试日志和结束后的 UI 刷新。
- 主入口删除旧的 `debugMarqueeEvent`、`startMarqueeSelection`、`onMarqueeMove`、`stopMarqueeSelection`、`cancelMarqueeSelection`、`updateMarqueeBox` 及 `marqueeState`，通过依赖注入保留空间索引查询、选中状态、minimap、Inspector 和 Agent 面板回调；框选入口保持不变。
- 保留非叠加/叠加选择、鼠标与触控 `pointercancel` 行为、选中链路刷新和中英双语界面行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，marquee controller 在主入口前加载。
- 测试：新增 marquee controller Node 模块测试和 Python 加载合同；marquee Node `3 passed`，全部 Canvas controller Node `270 passed`，相关 Python 合同 `23 passed`。
- JavaScript/Python 语法检查、旧 marquee 逻辑搜索和 `git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理和安装版验收。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.240 P4ej Canvas timeline keyframe controller 拆分（2026-09-07）

- 新增 `canvas_timeline_keyframe_controller.js`，承接关键帧拖动状态、关键帧定位、时间范围限制、排序、播放头同步、标记刷新和 pointer 生命周期。
- 主入口删除 `timelineKeyframeDragState` 及旧的 `startTimelineKeyframeDrag`、`updateTimelineKeyframeDragFromPointer`、`stopTimelineKeyframeDrag`，通过依赖注入保留关键帧标记、播放头、预览、历史、保存和 Inspector 回调；活动指针判断改用 controller 状态。
- 保留锁定节点和音频片段忽略、pointer capture、不同 pointer 过滤、`pointercancel`、关键帧拖动后的选中片段与播放头同步、自动保存和 Inspector 刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，timeline keyframe controller 在主入口前加载。
- 测试：新增 timeline keyframe controller Node 模块测试和 Python 加载合同；timeline keyframe Node `3 passed`，全量 Canvas Node `303 passed`，全部 controller Python 合同 `37 passed`。
- JavaScript/Python 语法检查、旧关键帧状态和 pointer 函数搜索、`git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.241 P4ek Canvas timeline clip controller 拆分（2026-09-07）

- 新增 `canvas_timeline_clip_controller.js`，承接普通 clip 的 move、trim-start、trim-end、跨 track 拖动状态、snap、媒体时长限制、track 高亮和 pointer 生命周期。
- 主入口删除 `timelineDragState` 及旧的 `startTimelineClipDrag`、`onTimelineClipDragMove`、`stopTimelineClipDrag`，通过依赖注入保留 clip 选择、时间计算、DOM 刷新、边缘刷新、保存和 Inspector 回调；活动指针判断改用 controller 状态。
- 保留 clip 选中、不同 pointer 过滤、pointer capture、`pointercancel`、Alt 键禁用 snap、音视频 track 兼容判断、播放头同步、自动保存和 Inspector 刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，timeline clip controller 在主入口前加载。
- 测试：新增 timeline clip controller Node 模块测试和 Python 加载合同；timeline clip Node `3 passed`，全量 Canvas Node `306 passed`，全部 controller Python 合同 `39 passed`。
- JavaScript/Python 语法检查、旧 clip 拖动状态和 pointer 函数搜索、`git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.242 P4el Canvas timeline mask controller 拆分（2026-09-07）

- 新增 `canvas_timeline_mask_controller.js`，承接 pen 加点/闭合、pen anchor 拖动、pending path 关闭、mask 导出、预览同步和 pointer 生命周期。
- 主入口删除 `timelineMaskDrawState`、`timelineMaskAnchorDragState` 及旧的 mask pointer 函数；活动指针判断改用 controller 状态。原有 `timelineMaskDrawState` 只有声明和清空，没有赋值，未调用的连续 pointer draw 清理函数一并移除。
- 保留锁定节点和 audio clip 过滤、不同 pointer 过滤、pointer capture、`pointercancel`、Alt 撤销最后一点、双击闭合、anchor 修改、mask 导出、自动保存和 Inspector 刷新行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，timeline mask controller 在主入口前加载。
- 测试：新增 timeline mask controller Node 模块测试和 Python 加载合同；timeline mask Node `3 passed`，全量 Canvas Node `309 passed`，全部 controller Python 合同 `41 passed`。
- JavaScript/Python 语法检查、旧 mask 状态和 pointer 函数搜索、`git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.243 P4em Director Timeline drag controller 拆分（2026-09-07）

- 新增 `canvas_director_timeline_drag_controller.js`，承接 Director Timeline clip 的 move、start trim、end trim、相邻 segment 边界计算、拖动高亮和 pointer 生命周期。
- 主入口删除 `directorTimelineDragState` 及旧的 `startDirectorTimelinePreviewDrag`、`onDirectorTimelinePreviewDragMove`、`stopDirectorTimelinePreviewDrag`，通过依赖注入保留时间约束、normalize、状态刷新、mutate 和保存回调；活动指针判断改用 controller 状态。
- 保留锁定节点忽略、相邻 segment 时间边界、最短时长、历史记录、不同 pointer 过滤、`pointercancel`、拖动高亮、Director 状态刷新、自动保存和 Inspector 传递行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，Director Timeline drag controller 在主入口前加载。
- 测试：新增 Director Timeline drag controller Node 模块测试和 Python 加载合同；Director Timeline drag Node `3 passed`，全量 Canvas Node `312 passed`，全部 controller Python 合同 `43 passed`。
- JavaScript/Python 语法检查、旧 Director Timeline 拖动状态和 pointer 函数搜索、`git diff --check` 通过；pytest 仍有既有 `.pytest_cache` 权限警告。
- 全量 `test_canvas_*_contract.py` 仍有 `10` 条涉及其他既有拆分区域的文本断言失败；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.244 P4en Canvas outpaint controller 拆分（2026-09-07）

- 新增 `canvas_outpaint_controller.js`，负责 outpaint overlay 边缘拖动、滑块同步、媒体尺寸换算、pointer 生命周期、设置写回和隐藏时的拖动清理。
- 主入口删除五个 outpaint 边缘交互函数，保留 overlay 显示、隐藏与几何布局；通过依赖注入提供活动状态、目标节点、媒体尺寸、viewport zoom、overlay 刷新和 Agent 设置回调。
- 保留四个边缘方向、0-100 限制、不同 pointer 过滤、`pointercancel`、滑块同步、静默设置保存和中英双语行为；Gradio6 lazy assets 与 standalone 脚本加载顺序已同步。
- 测试：新增 outpaint controller Node 模块测试和 Python 加载合同；outpaint Node `3 passed`，outpaint Python 合同 `2 passed`，全量 Canvas Node `315 passed`，全部 controller Python 合同 `45 passed`。
- JavaScript/Python 语法检查、旧 outpaint pointer 函数和拖动状态搜索、`git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 当前全量 `test_canvas_*_contract.py` 为 `206 passed, 15 failed`，失败仍集中在其他既有拆分区域的文本断言；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.245 P4eo Canvas resolution drag controller 拆分（2026-09-07）

- 新增 `canvas_resolution_drag_controller.js`，负责分辨率拖动起始、尺寸换算、quantize、比例锁定、预览 DOM 更新、pointer 生命周期和保存。
- 主入口删除 `startResolutionDrag`、`updateResolutionFromDrag`，通过依赖注入调用分辨率渲染值、预览计算、量化、Preset 应用和保存；修正起点坐标为 `0` 时的位移计算。
- 保留 interactive 锁定、random aspect ratio 禁止拖动、宽高范围、manual 标记、宽高输入同步、预览框更新、不同 pointer 过滤、`pointercancel` 和中英双语界面行为；Gradio6 lazy assets 与 standalone 脚本顺序已同步。
- 测试：新增 resolution drag controller Node 模块测试和 Python 加载合同；resolution Node `3 passed`，resolution Python 合同 `2 passed`，全量 Canvas Node `318 passed`，全部 controller Python 合同 `47 passed`。
- JavaScript/Python 语法检查、旧 resolution drag 函数和状态搜索、`git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 当前全量 `test_canvas_*_contract.py` 为 `208 passed, 15 failed`，失败仍集中在其他既有拆分区域的文本断言；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.246 P4ep Canvas media browser drag controller 拆分（2026-09-07）

- 新增 `canvas_media_browser_drag_controller.js`，负责媒体浏览器节点拖动 payload、MIME 数据读写、节点拖动事件绑定、拖动样式清理和内部 payload 生命周期。
- 主入口删除 `mediaBrowserDragPayload` 及旧 payload/drag 绑定函数，通过依赖注入读取媒体浏览器节点状态、运行时 items、状态序列化和 viewport 清理；保留 drop 后媒体导入及其他文件/URL drop 分支。
- 保留外部与内部 DataTransfer payload、选中媒体状态、drag image、节点/卡片样式、viewport drop-target 清理和中英双语行为；Gradio6 lazy assets 与 standalone 脚本顺序已同步。
- 测试：新增 media browser drag controller Node 模块测试和 Python 加载合同；media browser Node `3 passed`，media browser Python 合同 `2 passed`，全量 Canvas Node `321 passed`，全部 controller Python 合同 `49 passed`。
- JavaScript/Python 语法检查、旧 media browser drag payload 和绑定函数搜索、`git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 当前全量 `test_canvas_*_contract.py` 为 `210 passed, 15 failed`，失败仍集中在其他既有拆分区域的文本断言；未执行真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.247 P4eq Canvas input handle pointer controller 拆分（2026-09-07）

- 新增 `canvas_input_handle_controller.js`，负责 21 类输入 handle 的目标解析、已有连线断开、重新连线和特殊输入提示；主入口仅收集 DOM handle 并传入 controller。
- 主入口删除 `handleInputHandlePointerDown`、`getConnectionTargetFromHandle` 的实现，通过依赖注入保留 input connection、普通 connection、边删除、节点类型判断和提示回调；共享连线逻辑继续使用 controller 的目标解析 API。
- 保留 preset/classic upload、config、result、text、image、media、compare、Batch Any、Director Timeline、Timeline 输入行为；Timeline 提示改用 `t(en, cn)` 双语文本；Gradio6 lazy assets 与 standalone 脚本顺序已同步。
- 测试：新增 input handle controller Node 模块测试和 Python 加载合同；input handle Node `3 passed`，input handle Python 合同 `2 passed`，全量 Canvas Node `313 passed`，全部 controller Python 合同 `51 passed`。
- 验证：JavaScript/Python 语法检查、`git diff --check` 和旧 input handle 函数搜索通过；全量 Canvas Python 合同为 `212 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.248 P4er Canvas viewport pointer controller 拆分（2026-09-07）

- 新增 `canvas_viewport_pointer_controller.js`，负责中键/hand 平移、edge 命中选择、节点选择与拖动、Agent 引用选择、空白区域取消和 marquee 入口；主入口仅保留事件绑定和依赖注入。
- 主入口删除 `onViewportPointerDown`、`handleViewportNodePointerDown` 实现，通过依赖注入调用既有 pan、marquee、node drag、edge selection 和 Agent 回调；`findCanvasNodeAtWorldPoint` 仍优先于 marquee。
- 保留中键和 Alt/hand 平移、edge 选择、Ctrl/Meta/Shift 多选、节点拖动、引用选择、空白区域取消、marquee、button 过滤和中英双语取消提示；Gradio6 lazy assets 与 standalone 脚本顺序已同步。
- 测试：新增 viewport pointer controller Node 模块测试和 Python 加载合同，并同步 node drag/marquee 合同到 controller 实现；viewport pointer Node `4 passed`，viewport pointer Python 合同 `2 passed`，全量 Canvas Node `317 passed`，全部 controller Python 合同 `53 passed`。
- 验证：JavaScript/Python 语法检查、`git diff --check` 和旧 viewport pointer 函数搜索通过；全量 Canvas Python 合同为 `214 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.249 P4es Canvas edge interaction controller 拆分（2026-09-07）

- 新增 `canvas_edge_interaction_controller.js`，负责 edge click 选择、contextmenu 菜单和 note tail anchor 的 pointerdown；主入口仅保留三个事件绑定和依赖注入。
- 主入口删除 `handleEdgeLayerClick`、`handleEdgeLayerContextMenu`、`handleEdgeLayerPointerDown` 实现，通过依赖注入复用 `selectEdge`、`openEdgeContextMenu` 和 note tail controller。
- 保留 edge 命中判断、事件阻止与传播停止、右键菜单坐标、note 节点过滤、主键过滤和已有 note tail 拖动行为；Gradio6 lazy assets 与 standalone 脚本顺序已同步。
- 测试：新增 edge interaction controller Node 模块测试和 Python 加载合同；edge interaction Node `3 passed`，edge interaction Python 合同 `2 passed`，全量 Canvas Node `320 passed`，全部 controller Python 合同 `55 passed`。
- 验证：JavaScript/Python 语法检查、`git diff --check` 和旧 edge layer 函数搜索通过；全量 Canvas Python 合同为 `216 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.250 P4et Canvas Agent pointer 绑定整理（2026-09-07）

- 主入口将 `canvasAgentPanel` 的 `pointerdown` 直接绑定到 `CANVAS_AGENT_PANEL_CONTROLLER.onCanvasAgentPointerDown`，删除 `onCanvasAgentPointerDown`、`onCanvasAgentPointerMove`、`onCanvasAgentPointerUp` 三个无状态转发 wrapper。
- Agent 拖动状态、document pointer 生命周期、普通面板与 bubble 拖动、边界限制、attach pause、位置保存、click 抑制和中英双语行为继续由 `canvas_agent_panel_controller.js` 负责。
- 测试：新增 Agent pointer 绑定 Python 合同；合同 `1 passed`，全量 Canvas Node `320 passed`。
- 验证：JavaScript/Python 语法检查、`git diff --check` 和旧 Agent pointer wrapper 搜索通过；全量 Canvas Python 合同为 `217 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.251 P4eu Canvas viewport double-click 职责拆分（2026-09-07）

- 将空白 viewport 的 double-click 处理加入既有 `canvas_viewport_pointer_controller.js`，主入口只保留 controller 依赖注入和 `dblclick` 事件绑定。
- 保留节点、edge 和已有 edge 命中时不打开菜单；空白区域记录 world 坐标，延迟打开 Add Node 菜单，并继续使用当前中英双语界面内容。
- 测试：viewport pointer controller Node `5 passed`，viewport pointer Python 合同 `2 passed`，全量 Canvas Node `332 passed`，全部 controller Python 合同 `55 passed`。
- 验证：JavaScript 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `217 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.252 P4ev Canvas viewport wheel 职责拆分（2026-09-07）

- 新增 `canvas_viewport_wheel_controller.js`，承接 viewport 缩放、可滚动子元素判断和 workbench wheel 边界拦截；主入口只保留 controller 创建和事件绑定。
- 保留内部可滚动区域的浏览器滚动、按指针位置缩放，以及节点拖动、平移、marquee、连线和短暂 wheel 抑制期间不缩放的行为。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步；新增 wheel controller Node 测试和 Python 加载合同。
- 测试：viewport wheel controller Node `4 passed`，viewport wheel Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `336 passed`，全部 controller Python 合同 `57 passed`。
- 验证：JavaScript 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `219 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.253 P4ew Canvas viewport drop 职责拆分（2026-09-07）

- 新增 `canvas_viewport_drop_controller.js`，承接画布 drop 入口和 DataTransfer 分流；主入口只保留 controller 创建、依赖注入和事件绑定。
- 保留媒体浏览器 payload、中转站 transfer id、工作台项目文件、媒体文件和 URL 的处理优先级；多个媒体文件继续按 28px 偏移创建节点，并清理 viewport drop 状态。
- 图像节点内部 drop 仍由主入口现有事件绑定负责，VLM chat drop 逻辑不并入本 controller；Gradio6 lazy assets 与 standalone 页面脚本顺序已同步。
- 测试：viewport drop controller Node `4 passed`，viewport drop Python 合同 `2 passed`，media browser drag Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `340 passed`，全部 controller Python 合同 `59 passed`。
- 验证：JavaScript 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `221 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.254 P4ex Canvas viewport contextmenu 职责拆分（2026-09-07）

- 新增 `canvas_viewport_context_controller.js`，承接 viewport 右键入口的目标过滤、edge 命中处理和空白区域 Add Node 菜单调用；主入口只保留 controller 创建、依赖注入和事件绑定。
- 保留节点/edge 元素上的右键不重复打开画布菜单，保留 edge 选择、edge context menu 坐标和空白区域 view actions。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步；新增 contextmenu controller Node 测试和 Python 加载合同。
- 测试：viewport context controller Node `3 passed`，viewport context Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `343 passed`，全部 controller Python 合同 `61 passed`。
- 验证：JavaScript 语法检查、`git diff --check` 和旧 `onViewportContextMenu` 搜索通过；全量 Canvas Python 合同为 `223 passed, 15 failed`，失败仍集中在其他既有拆分区域；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.255 P4ey Canvas keyboard controller 拆分（2026-09-07）

- 新增 `canvas_keyboard_controller.js`，承接 document `keydown`、Workbench 生成快捷键、画布运行、保存、撤销/重做、剪贴板、缩放、播放、对齐、删除、模式切换和 transfer 导入等快捷键；主入口只保留 controller 创建、依赖注入和 `keydown` 绑定。
- 保留 Agent 输入框、preset/classic 节点、textarea modal、outpaint、connection、preset palette、Timeline、音视频结果节点及 group shortcut 的既有行为；主入口继续使用当前 `state.__lang` 语言状态，未新增单语可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，keyboard controller 在主入口前加载。
- 测试：keyboard controller Node `4 passed`，keyboard Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `347 passed`，全部 controller Python 合同 `63 passed`。
- 验证：JavaScript 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `225 passed, 15 failed`，失败仍集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.256 P4ez Canvas document paste controller 拆分（2026-09-07）

- 新增 `canvas_document_paste_controller.js`，承接 document `paste` 的画布可见性判断、可编辑控件过滤、剪贴板图片筛选、文件提取和按 28px 偏移创建图像节点；主入口只保留 controller 创建、依赖注入和 document 监听。
- 保留隐藏画布、input/textarea/select/contenteditable 目标不拦截；非图片剪贴板内容不消费事件；多个图片按 viewport 中心依次创建，未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，document paste controller 在主入口前加载。
- 测试：document paste controller Node `4 passed`，document paste Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `351 passed`，全部 controller Python 合同 `65 passed`。
- 验证：JavaScript 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `227 passed, 15 failed`，失败仍集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.257 P4fa Canvas text control context menu 拆分（2026-09-07）

- 新增 `canvas_text_control_context_controller.js`，承接文本控件识别、只读判断、选择、复制、粘贴、剪切和双语右键菜单；主入口只保留 controller 创建、依赖注入和 contextmenu 绑定，`canvas_text_control_pointer_controller` 复用 controller 导出的文本控件解析函数。
- 保留 input、textarea、contenteditable 的文本类型过滤、只读/禁用状态、selection、clipboard fallback、input event 派发、菜单动作和中英双语提示；未新增单语可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，text control context controller 在主入口前加载。
- 测试：text control context controller Node `4 passed`，text control context Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `355 passed`，全部 controller Python 合同 `67 passed`。
- 验证：JavaScript/Python 语法检查、`git diff --check` 通过；旧文本控件辅助函数和菜单函数搜索无命中；全量 Canvas Python 合同为 `229 passed, 15 failed`，失败仍集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.258 P4fb Canvas viewport drop 拖动状态整理（2026-09-07）

- 调整既有 `canvas_viewport_drop_controller.js`，承接 viewport `dragover`/`dragleave` 的 drop-target 状态和默认行为；主入口改为直接绑定 controller handler。
- 保留 dragover 阻止浏览器默认处理、添加 `is-drop-target` class、dragleave 清理 class，以及 drop 完成后的清理和既有 DataTransfer 分流；未新增可见文本。
- 测试：viewport drop controller Node `5 passed`，viewport drop Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `356 passed`，全部 controller Python 合同 `67 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `229 passed, 15 failed`，失败仍集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.259 P4fc Canvas outpaint overlay 入口整理（2026-09-07）

- 调整既有 `canvas_outpaint_controller.js`，承接 overlay edge 的 `pointerdown`、背景点击传播处理和 outpaint slider 的 `input` 更新；主入口只保留 root input 转发和 overlay 事件绑定。
- 保留四边拖动、viewport zoom 换算、slider 数值写回、输出值同步、`pointercancel` 清理和中英双语界面行为；未新增可见文本。
- 测试：outpaint controller Node `5 passed`，outpaint Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `358 passed`，全部 controller Python 合同 `67 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；全量 Canvas Python 合同为 `229 passed, 15 failed`，失败仍集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。

下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.260 P4fd Canvas Agent input/change 事件分派拆分（2026-09-07）

- 新增 `canvas_agent_input_controller.js`，承接 Agent 输入框、分辨率 scale、决策 range/field、设置字段、模型模式和 Ctrl/Command+Enter 提交事件；主入口只保留 Danbooru 输入前置判断、controller 创建及绑定。
- 保留 outpaint slider 转发、决策范围输出值同步、设置字段的 input/change 过滤、分辨率面板关闭和当前 `state.__lang` 可见文本行为；未新增单语可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，Agent input controller 在主入口前加载。
- 测试：Agent input controller Node `4 passed`，Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `362 passed`，全部 controller Python 合同 `69 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.261 P4fe Canvas workbench scroll 事件分派拆分（2026-09-07）

- 新增 `canvas_scroll_controller.js`，承接预览菜单关闭、VLM 聊天跳转、媒体浏览器自动加载和 Danbooru 下拉框定位；主入口只保留带 capture 的 scroll 绑定。
- 保留媒体浏览器 `has_more`/`loadingMore` 判断、异步加载失败日志和当前界面行为；未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，scroll controller 在主入口前加载。
- 测试：scroll controller Node `4 passed`，Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `366 passed`，全部 controller Python 合同 `71 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.262 P4ff Canvas workbench click 事件分派拆分（2026-09-07）

- 新增 `canvas_click_controller.js`，承接 Agent action、运行历史/队列、设置、VLM 聊天跳转、工具栏 action、模式切换和 textarea 标题入口；主入口只保留 click 绑定。
- 保留 Agent 拖动后的点击抑制、VLM 聊天滚动到底部、各类 action 的 `preventDefault`/传播处理和当前界面行为；未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，click controller 在主入口前加载。
- 测试：click controller Node `4 passed`，Python 合同 `2 passed`，standalone 页面加载合同 `9 passed`，全量 Canvas Node `370 passed`，全部 controller Python 合同 `73 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；controller Python 合同仍有既有 `.pytest_cache` 权限警告。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.263 P4fg Canvas toolbar action 分派拆分（2026-09-07）

- 新增 `canvas_action_controller.js`，承接保存、项目导入、撤销/重做、节点创建、运行链路、面板、删除清空和视图缩放等 `data-canvas-action` 分支；主入口只保留 controller 创建、依赖注入及 click controller 转发。
- 保留 standalone close 提示、viewport center 参数、compare/timeline selected source 过滤、zoom reset 渲染与保存，以及当前 `state.__lang` 双语可见文本行为；未新增单语可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，action controller 在 click controller 和主入口前加载。
- 测试：action controller Node `4 passed`，action controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `363 passed`，全量 Canvas Node `374 passed`，全部 controller Python 合同 `75 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.264 P4fh Canvas mode 切换职责拆分（2026-09-07）

- 新增 `canvas_mode_controller.js`，承接 `select`、`hand`、`connect`、`preset` 模式校验、Preset palette 入口和模式界面刷新；主入口只保留 mode state 注入和 controller 导出。
- 保留不支持模式回退到 `select`、Preset palette 使用 viewport 中心坐标、打开后回到 `select`、click/keyboard/viewport pointer 的既有行为；未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，mode controller 在主入口前加载。
- 测试：mode controller Node `3 passed`，mode controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `366 passed`，全量 Canvas Node `377 passed`，全部 controller Python 合同 `77 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.265 P4fi Canvas workbench 生命周期职责拆分（2026-09-07）

- 新增 `canvas_lifecycle_controller.js`，承接工作台打开时的项目同步、初始项目、主题/网格、渲染、Preset catalog、性能 HUD、standalone 状态监视和 viewport 聚焦，以及关闭时的面板清理、拖动任务取消和运行监视停止。
- 主入口只保留生命周期 controller 创建、依赖注入和 `openWorkbench`/`closeWorkbench` 导出；保留打开/关闭顺序、异步刷新后的 Preset catalog 更新和当前界面行为，未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，lifecycle controller 在主入口前加载。
- 测试：lifecycle controller Node `4 passed`，lifecycle controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `370 passed`，全量 Canvas Node `381 passed`，全部 controller Python 合同 `79 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.266 P4fj Canvas mode DOM 刷新职责归属整理（2026-09-07）

- 调整 `canvas_mode_controller.js`，承接工具栏 mode 按钮 active 状态、viewport `is-hand-mode`/`is-connect-mode` class 刷新；主入口不再保留 `renderMode` 实现，只保留 controller 导出。
- 保留 `select`、`hand`、`connect`、`preset` 的状态切换、Preset palette 入口、非法模式回退和现有 DOM class 行为；未新增可见文本。
- 测试：mode controller Node `4 passed`，mode controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `371 passed`，全量 Canvas Node `382 passed`，全部 controller Python 合同 `79 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.267 P4fk Canvas status 刷新职责拆分（2026-09-07）

- 新增 `canvas_status_controller.js`，承接画布标题、节点/连线状态、队列状态、storage 提示、zoom、网格/动效/Inspector class、Inspector 按钮和历史/系统/运行队列刷新；主入口不再保留 `renderStatus` 实现。
- 保留现有 `t` 语言选择、双语可见文本、storage bridge 状态、scheduler 错误提示和 Inspector 交互行为；未新增单语可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，status controller 在主入口前加载。
- 测试：status controller Node `2 passed`，status controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `373 passed`，全量 Canvas Node `384 passed`，全部 controller Python 合同 `81 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.268 P4fl Canvas renderAll 刷新编排拆分（2026-09-07）

- 新增 `canvas_render_controller.js`，承接 `renderAll` 的刷新编排、拖动状态清理、选择同步、主题/viewport、节点/边/Inspector/Agent/Minimap/队列渲染、历史面板条件、性能统计和 edge warmup；主入口不再保留 `renderAll` 实现。
- 保留 `inspector: false` 选项、运行历史 hidden 判断、拖动期间的 LOD 清理条件、`perfStats.renderTotalMs` 更新和当前渲染顺序；未新增可见文本。
- Gradio6 lazy assets 与 standalone 页面脚本顺序已同步，render controller 在主入口前加载。
- 测试：render controller Node `3 passed`，render controller Python 合同 `2 passed`，standalone 页面合同 `9 passed`，全部 controller Node `376 passed`，全量 Canvas Node `387 passed`，全部 controller Python 合同 `83 passed`。
- 验证：JavaScript/Python 语法检查和 `git diff --check` 通过；`git diff --check` 仅输出既有 LF/CRLF 警告，没有错误。
- 未重跑：全量 Canvas Python 合同；上一节已知结果为 `229 passed, 15 failed`，失败集中在其他既有 VLM、minimap、resize、quick tools 和 textarea 文本合同。
- 未执行：真实项目后端网络 API、完整 Studio、GPU 推理、安装版验收和 Canvas 浏览器级回归。
- 下一未完成项：继续检查主入口剩余职责，并安排 Canvas 浏览器级回归。

## 13.269 P4fm 节点 DOM 渲染编排拆分（2026-09-08）

- 新增 `canvas_node_render_controller.js`，承接节点 DOM 生命周期、渲染缓存、布局测量、overview/full 显示、特殊 Preset iframe 保留和项目替换清理；节点模板、Inspector、参数写回和媒体请求仍由原模块负责。
- 节点 DOM 表、布局表和覆盖区域由新 controller 管理，主入口使用查询方法；两套页面入口均在主脚本前加载新模块。没有新增界面文本，项目数据和公开 API 保持不变。
- 完整脚本初始化测试发现并处理 6 处函数别名提前引用，以及图片预览常量和 Agent 面板 controller 的声明顺序；未调整业务参数。
- 验证：新增 Node `12 passed`，全量 Canvas Node `399 passed`，相关 Python 合同 `30 passed`；JavaScript/Python 语法和空白检查通过。
- 全量 Canvas Python 合同：迁移前 `244 passed, 16 failed`，迁移后 `247 passed, 15 failed`，无新增失败；既有失败详情见拆分计划第 194 节。图片项目加载合同已按实际职责更新，折叠节点合同已更新本次迁移的渲染断言。
- Chromium 专项在 `1280x800`、`390x844` 下通过，覆盖 iframe 身份、滚动、缓存复用、overview/full 转换和同 ID 项目替换，无 pageerror；截图已查看，存于 `artifacts/canvas-node-render/`。
- 未执行：完整 Studio、真实后端媒体请求和迟到结果写回、GPU 生成、安装包验收、性能对比。浏览器专项使用受控页面和回调。
- 下一项：P4fn 节点展示总分派。完整 Canvas 浏览器回归仍待执行。

## 13.270 P4fn 节点展示总分派拆分（2026-09-08）

- 新增 `canvas_node_renderer.js`，迁移节点类型分派、overview 展示、通用端口标题、配置口、节点标记和运行状态页脚，共 27 个函数；原有专用节点 renderer 继续复用。
- 新模块不保存项目或语言状态，不绑定 DOM 事件或写入参数。节点 DOM 生命周期与缓存仍由 P4fm controller 管理；Classic/Preset HTML、参数控件、Inspector 和参数写回保留原位置。
- 保留端口属性与顺序、缩略图选择与长度限制、文本转义、折叠配置口、失败/取消提示和当前语言回调。未新增或改写界面文案；Gradio 6 与 standalone 的加载清单已同步。
- 验证：新增 Node `12 passed`，展示与 DOM controller 合计 `24 passed`，全量 Canvas Node `411 passed`；相关 Python 合同 `30 passed`；完整脚本初始化和缺失新模块检查通过。
- 全量 Canvas Python 合同为 `249 passed, 15 failed`，比 P4fm 增加 2 个通过项，无新增失败；既有失败分类见拆分计划第 195 节，另有 4 条既有 Triton 弃用警告。
- 迁移前后 `172` 项输出对比通过，覆盖 31 种类型、full/overview、中英文、配置口和提示文本，保留 HTML 空白。JavaScript/Python 语法和修改内容空白检查通过。
- Chromium 新专项在 `1280x800`、`390x844` 下通过，覆盖实际模块的端口解析与位置、PNG 缩略图、语言刷新、显示模式转换及同 ID 项目替换，无 pageerror；四张截图已查看，存于 `artifacts/canvas-node-renderer/`。P4fm iframe/滚动/缓存专项也再次通过。
- 未执行：完整 Studio、真实后端/API、GPU 生成、安装版验收和性能对比；浏览器专项使用生产 CSS、受控页面及回调。
- 下一项：P5a Classic 与 Preset 节点视图。完整 Canvas 浏览器回归仍待执行。

## 13.271 P5a Classic 与 Preset 节点视图拆分（2026-09-08）

- 新增 `canvas_preset_node_renderer.js`，承接 Classic 的五种模式节点展示、上传槽和增强区域，以及 Preset 可见参数筛选、配置口/上传槽展示和特殊视图状态/提示词展示。
- 主入口保留 `renderPresetParamControl`、`renderClassicInspector`、`renderPresetInspector`、`ensurePresetSpecialControllerState`、字段事件和项目写回；renderer 不绑定 DOM 事件、不直接修改 project。
- 保留 Classic 默认值、上传槽顺序、Preset schema/theme/task metadata、resolution 参数过滤、随机种子显示条件、Qwen Multi Angle/Flux Anglelight viewer 和当前 `state.__lang` 行为；没有新增中英混合可见文案。
- Gradio 6 lazy assets 与 standalone 页面脚本顺序已同步，新 renderer 在主入口前加载；主入口通过 context 创建 renderer，并以别名供节点总分派和既有业务调用。
- 测试：P5a renderer Node `5 passed`；P5a 与节点展示/DOM controller 相关 Node `29 passed`；全量 Canvas Node `416 passed`；P5a Python 加载合同 `11 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 新增 Chromium 专项 `tests/canvas_preset_node_renderer_playwright.mjs`，在 `1280x800`、`390x844` 下检查 Classic/Preset DOM、参数筛选、特殊 viewer、中文刷新和节点数据只读展示，无 pageerror；截图存于 `artifacts/canvas-preset-node-renderer/`，已查看。
- 全量 Canvas Python 合同当前为 `326 passed, 17 failed`，失败属于已有 Agent/VLM、quick tools、minimap、resize、输入口、textarea、Quick Start、H3 模板和 Batch Any 合同；P5a 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 推理、安装版验收、完整 Canvas 浏览器回归和实际媒体质量检查。
- 下一项：P5b Preset 参数控件与文字编辑入口。

## 13.272 P5b Preset 参数控件与文字编辑入口拆分（2026-09-08）

- 新增 `canvas_preset_param_renderer.js`，迁移 Preset 参数控件、可翻译 textarea HTML、wildcard 预览事实、relight 九宫格、Preset 参数标签本地化和数值步长推断。
- 主入口保留翻译缓存、textarea modal、字段事件、Danbooru autocomplete 事件、wildcard preview 请求和参数写回；新 renderer 不绑定 DOM、不读取或修改 `project`。
- 保留 prompt/negative prompt 输入口、wildcard/tag cart/翻译按钮、禁用与 reset 状态、choice/range/checkbox/number 控件、relight 方向选择和当前 `state.__lang` 行为；未新增中英混合可见文案。
- 初始化：主入口为 P5a renderer 注入延迟的参数控件回调，再在 Danbooru controller 就绪后创建参数 renderer；两套页面入口均在 P5a renderer 前加载新脚本。
- 测试：参数 renderer Node `5 passed`；参数/P5a/P4fn/P4fm 相关 Node `34 passed`；全量 Canvas Node `421 passed`；P5b Python 合同 `16 passed`；JavaScript/Python 语法和 `git diff --check` 通过。
- 新增 Chromium 专项 `tests/canvas_preset_param_renderer_playwright.mjs`，在 `1280x800`、`390x844` 下通过，检查参数工具、翻译状态、relight 九宫格、中文刷新和节点数据只读展示，无 pageerror；截图存于 `artifacts/canvas-preset-param-renderer/`，已查看。
- 全量 Canvas Python 合同当前为 `328 passed, 17 failed`，失败属于已有 Agent/VLM、quick tools、minimap、resize、输入口、textarea、Quick Start、H3 模板和 Batch Any 合同；P5b 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 推理、安装版验收、完整 Canvas 浏览器回归和实际媒体质量检查。
- 下一项：P5c 资产与复合节点视图。

### 13.273 P5c 资产与复合节点视图拆分（2026-09-08）

- 新增 `canvas_asset_node_renderer.js`，迁移资产媒体、音频 waveform、Batch Any、Result 预览和 Media Browser 节点/面板的展示 HTML。
- 主入口保留异步 preview stream、播放器和媒体事件、滚动恢复、资产导入及项目写回；renderer 不绑定 DOM，不直接读取或修改 `project`。
- 保留 image/video/audio 类型判断、尺寸比例、空资产、音频播放位置、Batch Any 多媒体条目和端口、Result 当前资产与运行预览、Media Browser 选中项/错误/加载更多以及调用时语言读取。
- Gradio 6 lazy assets 与 standalone 的新脚本加载顺序已同步，主入口通过 context 创建 renderer，并把展示函数转发给节点总分派。
- Chromium 专项发现并修正 390px Media Browser 控件挤压：窄屏下图片/视频筛选按钮、目录和搜索控件分行，节点与浮动面板均覆盖响应式规则。
- 测试：资产 renderer Node `7 passed`；P5c 定向 Python 合同 `9 passed`；全量 Canvas Node `428 passed`；JavaScript/Python 语法和修改内容空白检查通过。
- 新增浏览器专项 `tests/canvas_asset_node_renderer_playwright.mjs`，在 `1280x900` 与 `390x844` 下通过，检查媒体元素、waveform、Result preview stream 切换、Batch Any 选择态、Media Browser 节点/浮动面板、中文刷新、加载更多和控件不重叠；截图存于 `artifacts/canvas-asset-node-renderer/`，已查看。
- 未执行：完整 Studio、真实后端/API 媒体请求、真实音频播放质量、GPU 生成、安装版验收、完整 Canvas 浏览器回归和远端环境验收。
- 下一项：P5d 文本与 VLM 节点展示。

## 13.274 P5d 文本与 VLM 节点展示拆分（2026-09-08）

- 新增 `canvas_text_node_renderer.js`，承接 Text、Text Merge、Translation、Tag Cart、WD14 节点展示；新增 `canvas_vlm_node_view.js`，承接 VLM 节点、Inspector、模型状态、Custom API、图片输入、pending images 和 Agent mode 展示。
- `canvas_agent_text_nodes.js` 只保留文本数据处理和 Text Merge 图连接辅助；`canvas_vlm_node.js` 只保留 VLM 参数更新、系统提示词模板状态和可读性 DOM 刷新；VLM chat 纯数据、请求和响应收尾仍由 `canvas_vlm_chat.js` 管理。
- 主入口通过 renderer/view 转发展示函数，移除 VLM 参数 controller 中未使用的展示依赖及传参；两套页面入口都在主入口前加载新模块。未新增混合语言界面文字，语言按调用时 `state.__lang` 选择。
- 保持 Text Merge 输入顺序/分隔符/输出端口、文本节点输入来源、VLM single/chat 节点、Inspector、Custom API、图片输入、pending images、Agent mode、系统提示词模板、停止状态和当前事件调用关系。
- 更新旧合同对模块路径、展示 helper、VLM chat 响应收尾和 H3 容量说明的归属判断，使合同与当前代码边界一致。
- 测试：文本 renderer 与 VLM node 相关 Node `14 passed`；全量 Canvas Node `464 passed`；P5d 相关 Python 合同 `203 passed`，有 4 条既有 Triton 弃用警告。
- 全量 Canvas Python 合同为 `265 passed, 10 failed`；10 条失败仍属于前序 quick tools、视频编辑、折叠 Preset、输入口、minimap、Quick Start、resize 和 textarea 合同，P5d 定向合同没有失败。
- 验证：JavaScript 语法、主入口初始化、Node 全量和修改内容空白检查已执行；`git diff --check` 只有既有 LF/CRLF 提示。
- 未执行：完整 Studio、真实后端/API、GPU 生成、P5d 浏览器专项、完整 Canvas 浏览器回归、安装版发布和远端环境验收。
- 下一项：继续处理主入口剩余职责并安排完整 Canvas 浏览器回归；前序合同失败保持单独记录。

### 13.275 P5e Inspector 总分派与通用区块拆分（2026-09-08）

- 新增 `canvas_inspector_controller.js`，迁移 Inspector 空状态、单选/多选、节点外观、分组、连线和节点类型分派。主入口保留参数控件、字段事件、`bindInspectorEvents` 和项目字段写回。
- 新 controller 只通过注入 context 读取当前项目、选择集、节点、分组和语言，不持有主入口闭包，不绑定 DOM 事件，不执行参数写回；专用节点 Inspector 继续复用已有 renderer。
- 保留空画布、缺失节点、锁定/跳过/折叠、多选批处理、分组尺寸与外观、连线说明、节点外观颜色和专用 Inspector 的现有分派顺序；语言在调用时读取 `state.__lang`。
- Gradio 6 lazy assets 与 standalone 的脚本顺序已同步，新 controller 在主入口前加载，主入口通过别名转发 `renderInspector` 等公开调用。
- 测试：Inspector controller Node `4 passed`；P5e 定向及受影响 Python 合同 `50 passed`；Canvas Node 全量 `432 passed`；JavaScript/Python 语法与 `git diff --check` 通过。
- 全量 Canvas Python 合同为 `344 passed, 11 failed`。剩余失败集中在 Agent quick tools、视频编辑快捷工具、折叠 Preset、输入口、minimap、Quick Start、resize、textarea overlay 和 MiniMax H3 模板合同；P5e 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。
- 下一项：P5f 字段事件与节点参数写回协调。

### 13.276 P5f 通用参数写回与 Inspector 参数监听拆分（2026-09-08）

- 新增 `canvas_node_param_controller.js`，迁移 `updateNodeParam`、`handleNodeParamFieldChange` 和 Inspector `data-inspector-param` 的 input/change 监听，覆盖数字、复选框、文本、Classic 特殊参数、Qwen TTS、outpaint 与 `seed_random` 刷新。
- controller 只通过注入 context 访问节点、选择状态和既有专用回调；锁定判断、历史批次、保存、Inspector 刷新和参数类型转换保持原行为。媒体、Timeline、Config 等专用字段事件仍在 `bindNodeEvents`。
- 主入口删除两个通用写回函数，实现 controller 别名，并把 Inspector 参数监听转发给新模块；两套页面入口均已在 Inspector controller 前加载新脚本。
- 测试：参数 controller Node `4 passed`；P5f 定向及受影响 Python 合同 `13 passed`；Canvas Node 全量 `436 passed`；JavaScript/Python 语法与 `git diff --check` 通过。
- 全量 Canvas Python 合同为 `346 passed, 11 failed`。剩余失败集中在 Agent quick tools、视频编辑快捷工具、折叠 Preset、输入口、minimap、Quick Start、resize、textarea overlay 和 MiniMax H3 模板合同；P5f 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。
- 下一项：继续迁移 `bindNodeEvents` 中的专用字段事件协调。

### 13.277 P5f 专用字段事件协调拆分（2026-09-08）

- `canvas_node_param_controller.js` 新增节点级 `input/change` 事件分派，承接文本、翻译、Tag Cart、WD14、VLM、Mask、SAM3、Camera Motion、Director Timeline、Classic IP 和 Qwen TTS 字段；主入口仍负责媒体、配置和 Media Timeline 的专用交互。
- 保留双输入同步、Classic IP 数量与特殊参数、锁定节点、历史记录、保存时机、`seed_random`、既有专用参数写回和当前语言读取；没有新增界面文案。
- 两套页面入口的加载顺序保持不变，主入口通过参数 controller 的 `handleNodeParamEvent` 别名接收节点事件，Inspector 参数监听继续由该 controller 处理。
- 测试：P5f 相关 Node `25 passed`，相关 Python 合同 `11 passed`，全量 Canvas Node `436 passed`；JavaScript/Python 语法检查通过。
- 全量 Canvas Python 合同为 `346 passed, 11 failed`，另有 `9` 条既有弃用警告；失败类别与前序记录一致，P5f 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。
- 下一项：P6a Media Timeline 参数字段协调，新增独立 Timeline 参数 controller；现有 clip、keyframe、mask、playhead 和 preview 指针 controller 继续复用。

### 13.278 P6a Media Timeline 参数字段协调拆分（2026-09-08）

- 新增 `canvas_timeline_param_controller.js`，迁移 Media Timeline 画布参数、片段参数、参数默认值/重置和 Inspector 字段监听；主入口继续负责点击命令、预览/轨道交互及其他媒体事件。
- 保留尺寸与帧率 preset 联动、数值约束、素材范围校正、遮罩几何重映射、关键帧同步、mask feather 刷新、保存和 Inspector 刷新时机；未新增界面文案。
- 主入口移除对应 Timeline 更新与重置实现，节点/Inspector 字段通过 controller 别名调用；clip、keyframe、mask、playhead、preview 指针 controller 未调整。
- Gradio 6 lazy assets 与 standalone 页面均已在现有 Timeline controller 后加载新脚本，并在主入口前注册。
- 测试：P6a 模块 Node `5 passed`，Timeline/参数/Inspector Python 合同 `19 passed`，全量 Canvas Node `441 passed`；JavaScript/Python 语法检查和 `git diff --check` 通过。
- 全量 Canvas Python 合同为 `348 passed, 11 failed`，另有 `9` 条既有弃用警告；失败类别与前序记录一致，没有新增失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。
- 下一项：P6b Timeline 轨道/片段命令与点击事件协调；继续复用现有 pointer controller，不改变 Timeline 数据格式。

### 13.279 P6b Timeline 轨道/片段命令与点击事件协调拆分（2026-09-08）

- 新增 `canvas_timeline_command_controller.js`，迁移 Timeline 自定义选择、工具模式、片段选择、关键帧跳转、参数/片段重置、轨道上下移和节点级点击事件分派。
- controller 通过明确 context 调用既有参数更新、历史、保存、选择和刷新方法；clip、keyframe、mask、playhead、preview pointer controller 未改动，Timeline 数据格式未改动。
- 保留自定义选择互斥、片段选择时播放头校正、锁定节点和轨道边界检查、工具/遮罩模式写回、关键帧 marker 跳转、片段选择和事件阻止行为；没有新增界面文案。
- 主入口删除对应命令与点击分派实现，保留 `handleTimelineClick`、`selectTimelineClip` 和 `moveTimelineTrack` 转发别名；Gradio 6 lazy assets 与 standalone 页面均在主入口前加载新脚本。
- 测试：P6b 命令 controller Node `4 passed`；相关 Python 合同 `21 passed`；全量 Canvas Node `445 passed`；JavaScript/Python 语法检查通过。
- 全量 Canvas Python 合同：`350 passed, 11 failed`，另有 `9` 条既有弃用警告；失败类别与前序记录一致，P6b 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。
- 下一项：P6c Timeline 关键帧/遮罩命令协调，继续复用现有 Timeline DOM 与 pointer controller，不改变 Timeline 数据格式。

### 13.280 P6c Timeline 关键帧/遮罩命令协调拆分（2026-09-08）

- 扩展 `canvas_timeline_command_controller.js`，迁移关键帧新增/更新、删除、前后跳转、marker 跳转、easing 菜单、Timeline 激活工具重置和 Inspector/节点 action 分派。
- 共享的关键帧计算、transform keyframe 同步、遮罩几何和导出 helper 仍由主入口提供给参数、预览和 pointer controller；新命令逻辑通过明确 context 调用，不持有项目状态。
- 保留锁定节点/音频片段限制、时间容差、历史批次、播放头与片段选择同步、关键帧排序、transform/crop/mask 重置、遮罩字段清理和 Inspector 刷新；提示语通过当前 `t` 回调读取，没有新增界面文案。
- 主入口删除关键帧命令、激活工具重置和关键帧 context menu 实现，节点/Inspector action 统一转发到 `handleTimelineAction`；clip、keyframe、mask、playhead、preview pointer controller 未改动。
- 测试：P6c command controller Node `7 passed`；Timeline 相关 Python 合同 `14 passed`；全量 Canvas Node `448 passed`；JavaScript/Python 语法检查和 `py_compile` 通过。
- 全量 Canvas Python 合同：`350 passed, 11 failed`，另有 `9` 条既有弃用警告；失败类别与 P6b 一致，P6c 定向合同没有失败。
- 未执行：完整 Studio、真实后端/API、GPU 生成、完整 Canvas 浏览器回归、安装版发布、实际媒体质量和远端环境验收。`git diff --check` 只有既有 LF/CRLF 提示。
- 下一项：P6d Timeline 时长/画布尺寸命令与片段右键菜单协调，继续保留 render、播放和 pointer controller 的边界。

### 13.281 P6d Timeline 时长/画布尺寸命令与片段右键菜单协调执行记录（2026-09-08）

- 功能变化：扩展 `canvas_timeline_command_controller.js`，负责 Timeline 时长按播放头/内容调整、画布宽高交换、遮罩几何重映射、片段删除、连线断开、源节点跳转和片段右键菜单。
- 状态边界：新命令通过明确 context 调用规范化、历史、保存、选择、连线和视口定位方法，不保存主入口状态；Timeline render、播放、播放头拖动、预览拖动和数据格式没有迁移或改写。
- 保持：时长和播放头约束、锁定节点限制、`width`/`height`/`aspect`/`size_preset` 同步、遮罩重映射、删除片段后的选中状态、Timeline 边清理、源节点定位以及当前语言菜单文案行为保持不变。
- 主入口：增加时长、尺寸和片段菜单的转发别名；节点/Inspector action 继续由 command controller 统一分派。Gradio 6 lazy assets 与 standalone 加载顺序已同步。
- 测试：Timeline command controller Node `8 passed`；Timeline 加载/归属 Python 合同 `2 passed`；全量 Canvas Node `449 passed`；JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过。
- 全量 Python：Canvas 合同 `350 passed, 11 failed`，失败属于前序 Agent quick tools、视频编辑、折叠 Preset、输入口、minimap、Quick Start、resize、textarea 和 MiniMax H3 模板合同；P6d 定向合同无失败。
- 未执行：完整 Studio、浏览器、真实后端/API、GPU 生成、安装版验收和实际媒体质量检查；工作树已有的 LF/CRLF 提示继续保留。
- 下一项：P6e Timeline 播放状态与后端合成命令协调，复用当前帧导出 helper，拆分播放生命周期和整段 Timeline 合成命令。

### 13.282 P6e Timeline 播放状态与后端合成命令协调执行记录（2026-09-08）

- 功能变化：新增 `canvas_timeline_playback_controller.js`，管理 Timeline 播放状态、动画帧循环、播放头推进、循环/结束处理、播放按钮刷新和状态清理；新增 `canvas_timeline_render_controller.js`，管理 Result 承接节点、Timeline 后端合成、当前帧预览回退、结果状态和运行 fingerprint。
- 状态边界：当前帧 Canvas 绘制、preview DOM 刷新、视频同步和 backend API transport 仍由主入口或既有 controller 提供；新增 controller 通过 context 调用这些入口，不保存主入口项目状态，也没有改动 Timeline 数据格式。
- 保持：播放/暂停、从头播放、非循环到时停止、循环播放、Result asset/preview 写回、后端失败时保留当前帧、gallery 刷新、fingerprint 和原调用返回值保持一致。
- 生命周期：关闭、清空和替换项目，以及性能测试载入新项目时，都会调用 `stopTimelinePlayback` 清理活动动画帧；`canvas_lifecycle_controller.js` 关闭画布时也会执行相同清理。
- 加载：Gradio 6 lazy assets 和 standalone 页面在主入口前加载 playback/render controller；`canvas_backend_request_controller.js` 的职责仍是 Timeline 请求转发。
- 测试：playback/render Node 各 `3 passed`；Timeline/lifecycle 加载与归属 Python 合同 `4 passed`；全量 Canvas Node `455 passed`；JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过。
- 全量 Python：Canvas 合同 `352 passed, 11 failed`，11 条失败与前序基线相同；P6e 定向合同无失败。
- 未执行：完整 Studio、浏览器、真实后端/API、GPU 生成、安装版验收和实际媒体质量检查；`git diff --check` 的 LF/CRLF 提示来自工作树已有文件。
- 下一项：继续处理剩余主入口职责并安排完整 Canvas 浏览器回归；前序 Python 合同失败保持单独记录。

### 13.283 P6f Timeline 当前帧渲染与差异计算拆分（2026-09-08）

- 新增 `javascript/canvas_workbench/canvas_timeline_frame_controller.js`，集中管理活动视觉片段排序、视频帧等待与定位、Canvas 当前帧合成、图层遮罩和前后端帧差异统计。
- 主入口新增 frame controller 的创建、依赖注入和公开转发；`compareTimelineFrameWithBackend` 仍保留项目状态更新、后端请求、比较 Result 节点和 Inspector 刷新，避免把 project 写回放入帧处理模块。
- 保留 Timeline 当前帧的几何 payload 优先规则、clip 编辑起点回退、crop/rotate/opacity、mask `destination-in` 合成、bounds 差异、阈值统计和 heatmap 输出；未新增可见文案。
- 两套页面入口新增并同步加载 `canvas_timeline_frame_controller.js`，顺序位于 `infinite_canvas_workbench.js` 之前，并与现有 Timeline controller 顺序一致。
- 测试：新增 Node 模块测试 `3 passed`；P6f 相关 Node `9 passed`；全量 Canvas Node `509 passed`；P6f 相关 Python 合同 `12 passed`；JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过。
- 全量 Canvas Python 合同当前为 `363 passed, 11 failed`，失败均为此前已有的 Agent quick tools、视频编辑、折叠 Preset、输入口、minimap、Quick Start、resize、textarea 和 MiniMax H3 模板合同；另有 `9` 条既有弃用警告。
- 未执行：完整 Studio、Canvas 浏览器专项/完整回归、真实后端/API 帧合成、GPU 生成、实际媒体质量、安装版和远端环境验收。
- 下一项：继续处理主入口剩余运行职责，优先评估 Timeline 帧比较流程或项目/选择操作边界；既有 Python 合同失败继续单独记录。

### 13.284 P6g Timeline 前后端帧比较职责拆分（2026-09-08）

- 新增 `javascript/canvas_workbench/canvas_timeline_compare_controller.js`，集中管理比较 Result 节点、整体/分层/geometry payload、后端当前帧请求、差异结果资产和 `timeline_debug` 记录。
- 主入口新增 compare controller 的创建、依赖注入和公开转发；`canvas_timeline_frame_controller.js` 继续负责帧绘制与差异算法，项目选择、Result 写回和 Inspector 刷新由 compare controller 统一协调。
- 保留整体帧与活动视觉片段的处理顺序、payload 音频清除、geometry probe、Result 资产顺序、diff/bounds 指标、选中状态、诊断输出和当前语言提示；未新增可见文案。
- 两套页面入口新增并同步加载 `canvas_timeline_compare_controller.js`，位置在 Timeline frame/render controller 之后、`infinite_canvas_workbench.js` 之前。
- 测试：新增 compare controller Node `3 passed`；P6g 相关 Node `9 passed`；全量 Canvas Node `512 passed`；P6g 相关 Python 合同 `13 passed`；JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过。
- 全量 Canvas Python 合同当前为 `364 passed, 11 failed`，失败均为此前已有的 Agent quick tools、视频编辑、折叠 Preset、输入口、minimap、Quick Start、resize、textarea 和 MiniMax H3 模板合同；另有 `9` 条既有弃用警告。
- 未执行：完整 Studio、Canvas 浏览器专项/完整回归、真实后端/API 帧比较、GPU 生成、实际媒体质量、安装版和远端环境验收。
- 下一项：继续处理主入口剩余运行职责，优先评估项目/选择操作或 Timeline 剩余命令边界；既有 Python 合同失败继续单独记录。

### 13.285 P7a 选择与对齐命令拆分（2026-09-08）

- 新增 `javascript/canvas_workbench/canvas_selection_controller.js`，迁移节点单选/多选、轻量选择、边/组选择、选择 DOM 刷新、选择节点列表、多选锁定/跳过/折叠、对齐和分布命令。
- controller 不保存主入口项目对象；选择通过 `getSelectionState`/`setSelectionState` 回调读写，渲染、历史、保存和项目变更仍由主入口协调。删除、剪贴板和复制粘贴未在本步骤迁移。
- 保留完整选择与轻量选择的刷新路径、焦点节点、多选互斥、锁定节点提示、对齐/分布尺寸计算、snap 和现有公开函数名；提示通过当前语言回调选择文本。
- 主入口增加 selection controller 初始化和别名，移除原选择刷新、选择命令、对齐/分布和 `getSelectedNodeIdList` 实现。marquee、connection、group、keyboard、resize 和 node drag 的注入点继续调用这些别名。
- Gradio 6 lazy assets 与 standalone 页面均在主入口前加载 `canvas_selection_controller.js`，位置在 history controller 后。
- 测试：选择 controller Node `4 passed`；连接、框选、分组、历史和键盘相关 Node `17 passed`；Canvas Node 全量 `516 passed`；新增 Python 合同 `2 passed`；完整 Canvas Python 合同 `356 passed, 11 failed`。
- 既有失败：11 条仍为 Agent quick tools、视频快捷工具、折叠 Preset、输入口、minimap、Quick Start、resize、textarea 和 MiniMax H3 模板合同；本步骤没有修改这些模块。
- 验证：JavaScript `node --check`、`modules/ui_gradio_extensions.py` 与 `webui.py` 的 `py_compile`、相关 Node/Python 合同和 `git diff --check` 通过。
- 未执行：完整 Studio、真实浏览器页面、完整 Canvas 浏览器回归、真实后端/API、GPU 生成、安装版发布、实际媒体质量和远端环境验收。
- 下一项：P7b 图节点删除与关系清理；随后处理剪贴板和复制粘贴，保持 Timeline 片段删除与节点删除的边界。

### 13.286 P7b 图节点删除与关系清理迁移（2026-09-08）

- 新增 `canvas_graph_delete_controller.js`，承接 `deleteSelection`、`deleteEdge` 和 `deleteUploadSlot`；主入口保留 controller 创建、依赖注入和公开函数别名。
- controller 通过 context 访问 project、选择状态、节点查询、锁定判断、历史、运行/预览停止、Agent 删除通知、引用清理、保存和 UI 刷新，不持有主入口项目状态。
- 保留 Timeline 选中片段优先删除、分组/边/节点删除分派、锁定节点规则、结果运行清理、outpaint 与 Inline Tag Cart 状态清理，以及各类节点输入引用、Preset/Classic 上传口和配置引用的清理。
- Gradio 6 lazy assets 与 standalone 页面均在 selection controller 后、主入口前加载新 controller；文本合并合同同步读取新模块，覆盖迁移后的 `text_merge` edge 清理路径。
- 测试：删除 controller Node `4 passed`；P7b 相关 Python 合同 `6 passed`；全量 Canvas Node `520 passed`；全量 Canvas Python `358 passed, 11 failed, 9 warnings`。
- 既有失败：11 条仍属于 Agent quick tools、视频编辑快捷工具、折叠 Preset、输入口创建、minimap、Quick Start、resize snap、textarea overlay 和 MiniMax H3 模板合同；P7b 没有新增失败。
- 验证边界：JavaScript `node --check`、两个 Python 入口 `py_compile` 和相关合同已通过；未执行完整 Studio、真实浏览器、后端/API、GPU、安装版和远端环境验收。
- 下一项：P7c 剪贴板与复制粘贴迁移，继续验证节点 ID、内部边、可选输入连接和 Timeline 片段边界。

### 13.287 P7bk-P7bq 配置与能力边界清理记录同步（2026-09-08 至 2026-09-09）

- 已同步前序记录：Agent Settings 默认配置 getter、图编辑/Viewport/Selection project getter、Run Status/Input Handle/Note Tail/VLM Chat project getter、Run Panels project getter、Backend/Danbooru/Template Library API 能力字段注入，以及 Run Panels 旧 project 字段兼容读取移除。
- 这些步骤的专项 Node、Python 合同、`node --check` 和 `git diff --check` 结果以 split-plan 第 271 至 277 条为准；已知失败仍为 H3 custom LLM thinking、LivePortrait/video face motion quick tools、upscale preset candidates。
- P7bq 暂停记录中的下一项已完成：Status storage scope getter 清理和 Template Library Data/Controller 配置边界审查。

### 13.288 P7br Status storage scope getter 边界清理（2026-09-09）

- `canvas_status_controller.js` 移除 `scope.storageScope` fallback，状态栏只通过 `getStorageScope()` 读取当前 storage scope；Status 合同增加旧字段扫描。
- 保留节点/连线计数、队列状态、storage label、cache key、zoom、Inspector 折叠和系统信息刷新行为，没有新增界面文字。
- 测试：Status controller Node `2 passed`；Status Python 合同 `2 passed`；主入口与 Status controller `node --check` 通过。
- 未执行：完整 Canvas Python、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收。

### 13.289 P7bs Template Library 配置边界审查（2026-09-09）

- 审查确认 `canvas_template_library_data.js` 与 `canvas_template_library_controller.js` 使用具名方法、getter 和独立字段，不读取 `scope.project`、`scope.api`、`scope.config` 或 `scope.settings`。
- Data/Controller Python 合同增加旧整体对象字段的负向检查；模板 manifest、用户模板、模板加载/保存/删除、新建工作台、缓存恢复和项目设置合并逻辑未改动。
- 测试：Template Library Data/Controller Node 合计 `17 passed`；相关 Python 合同 `2 passed`；主入口、Data、Controller `node --check` 通过。
- 下一项：检查仍保留整体 `viewport` fallback 或其他聚合配置入口的 controller，优先处理 Mode 与 Viewport Drop 边界。

### 13.290 P7bt Mode controller viewport getter 边界清理（2026-09-09）

- `canvas_mode_controller.js` 移除 `scope.viewport` fallback，模式 UI 刷新只通过 `getViewport()` 读取 viewport；缺少 getter 时继续安全跳过 viewport class 更新。
- 保留 select/hand/connect/preset 模式切换、Preset palette 中心定位、返回 select、工具栏 active 状态和 viewport class 行为，没有新增界面文字。
- 测试：Mode controller Node `4 passed`；Mode Python 合同 `2 passed`；主入口与 Mode controller `node --check` 通过。

### 13.291 P7bu Viewport Drop controller viewport getter 边界清理（2026-09-09）

- `canvas_viewport_drop_controller.js` 移除 `scope.viewport` fallback，dragover、dragleave 和 drop 清理只通过 `getViewport()` 读取 viewport；缺少 getter 时继续安全跳过 drop-target class 更新。
- 保留媒体浏览器 payload、中转站 transfer id、工作台项目文件、媒体文件和 URL 的处理优先级，多个媒体文件的偏移创建、世界坐标更新和 drop-target 清理行为，没有新增界面文字。
- 测试：Viewport Drop controller Node `5 passed`；Viewport Drop Python 合同 `2 passed`；主入口与 Viewport Drop controller `node --check` 通过。
- 下一项：继续检查剩余 controller 的聚合配置 fallback 和主入口初始化对象，优先处理已有 getter 或独立能力字段但仍保留整体字段读取的模块。

### 13.292 P7bv 多 controller root getter 边界清理（2026-09-09）

- Document Paste、Keyboard、Lifecycle、Render、Status、Viewport Context 和 Viewport Wheel 七个 controller 移除 `scope.root` fallback，DOM root 只通过 `getRoot()` 读取；缺少 getter 时继续安全跳过依赖 root 的处理。
- 保留文档粘贴、快捷键、工作台生命周期、画布渲染、状态栏、viewport 右键菜单和滚轮缩放行为，没有新增界面文字。
- 测试：七个 controller Node 合计 `24 passed`；对应 Python 合同合计 `14 passed`；主入口及七个 controller 的 `node --check` 通过。
- 下一项：继续检查 `getMode`、`getPerfStats`、`getStorageKey` 和 `getZoomLabel` 等仍保留独立字段 fallback 的 controller。

### 13.293 P7bw 独立状态 getter 边界清理（2026-09-09）

- Mode、Render 和 Status controller 移除 `scope.mode`、`scope.perfStats`、`scope.storageKey` 与 `scope.zoomLabel` fallback；这些状态只通过对应 getter 读取。
- 保留模式切换、画布渲染性能统计、状态栏 storage 信息和 zoom 显示行为，没有新增界面文字。
- 测试：Mode、Render、Status controller Node 合计 `9 passed`；对应 Python 合同 `6 passed`；主入口与三个 controller 的 `node --check` 通过。
- 下一项：继续扫描剩余 controller 的整体字段 fallback；若只剩外部运行时标识或合法的 `projectId` 读取，则保留并记录边界。

### 13.294 P7bx Mode controller root getter 补充清理（2026-09-09）

- 补充移除 `canvas_mode_controller.js` 的 `scope.root` fallback；Mode controller 的 root、viewport 和 mode 状态均只通过注入 getter 读取。
- 保留工具栏模式状态、Preset palette 定位和 viewport class 刷新行为，没有新增界面文字。
- 测试：Mode controller Node `4 passed`；Mode Python 合同 `2 passed`；Mode controller `node --check` 通过。
- 下一项：配置 getter fallback 扫描已只剩项目标识和具名能力函数，继续检查主入口初始化对象是否还有可收窄的整体字段入口。

### 13.295 P7by Agent panel views 独立配置 getter 清理（2026-09-09）

- Agent panel views 不再直接读取容量、宽高比选项和 Custom API provider 字段，改为通过 5 个 getter 获取；主入口只注入对应 getter。
- 保留图片/视频/音频引用容量提示、宽高比按钮、Custom API provider 下拉、双语文字和现有默认值，没有新增界面文字。
- 测试：Agent panel views Node `5 passed`；Python 合同 `3 passed`；主入口与 panel views `node --check` 通过。
- 下一项：继续检查 Template Library、Node renderer 和其他初始化 context 中仍直接注入的独立数组或配置常量。

### 13.296 P7bz Template/Renderer/Clipboard 静态配置 getter 清理（2026-09-09）

- Template Library、Node renderer、Preset renderer 和 Clipboard controller 的静态分类、端口配置、slot label、VLM slots 与 Director Timeline media groups 改为 getter 注入。
- 保留模板分类、节点端口、VLM 输入口、时间线素材组、剪贴板连接判断和现有双语显示，没有新增界面文字。
- 测试：相关 Node 合计 `32 passed`；Python 合同合计 `16 passed`；主入口及四个模块 `node --check` 通过。
- 下一项：继续扫描其他 context 中直接注入的静态数组、映射和运行时选项，优先处理已有 getter 或 resolver 能力的模块。

### 13.297 P7ca Agent 引用容量 getter 边界清理（2026-09-09）

- Agent references、Image tools、Audio tools、Panel controller 和 Panel views 的 `max*References` 改为 getter 注入；主入口的容量配置按 controller 分别传递，并修正 Panel views getter 的注入位置。
- 保留引用数量限制、容量提示、额外图片参考截取、音频桥接上限和双语显示，没有新增界面文字。
- 测试：相关 Node 合计 `25 passed`；容量 context Python 合同 `2 passed`；Panel views 合同 `3 passed`；VLM 引用容量合同 `21 passed`。
- 验证：主入口及四个 controller `node --check` 通过；旧容量字段读取无命中；`git diff --check` 通过。
- 下一项：继续检查 Agent 相关 context 中直接注入的运行时选项和能力映射，优先处理已有 resolver 或 getter 的 controller。

### 13.298 P7cb Agent workflow 容量 getter 清理（2026-09-09）

- Image workflow 和 Video workflow 的图片容量改为 getter 注入，主入口按 workflow 分别传递容量 getter。
- 保留图片编辑、图片转视频、视频媒体组合和连接逻辑，没有新增界面文字。
- 测试：相关 Node 合计 `9 passed`；容量 context `2 passed`；VLM 引用容量合同 `21 passed`。
- 验证：主入口及两个 workflow controller `node --check` 通过；旧大写容量字段读取无命中；`git diff --check` 通过。
- 下一项：继续整理 Agent context 中的静态 preset、队列和运行时选项。

### 13.299 P7cc Video quick tool 默认配置 getter 清理（2026-09-09）

- Video quick tools 的 8 个默认 preset/theme 字段改为 getter，主入口只在 Video Tools context 注入 getter。
- 保留视频快捷工具默认选择、route 处理和双语显示，没有新增界面文字。
- 测试：相关 Node 合计 `9 passed`；Panel views 合同 `3 passed`；容量 context `2 passed`。
- 验证：主入口和 Video Tools `node --check` 通过；旧默认配置字段读取无命中；`git diff --check` 通过。
- 下一项：继续整理 Image tools 和 Settings 的静态队列、尺寸和选项配置。

### 13.300 P7cd Image tools/Settings 静态配置 getter 清理（2026-09-09）

- Image tools 的默认 T2I 队列、折叠节点高度、classic outpaint 方向和 Settings 的 VLM 版本列表改为 getter 注入。
- 保留快捷工具、经典 outpaint、折叠节点和 rewrite model 默认行为，没有新增界面文字。
- 测试：Image tools、Settings Node 合计 `10 passed`；配置 getter合同 `1 passed`；初始化别名合同 `10 passed`。
- 验证：主入口、Image tools 和 Settings `node --check` 通过；相关旧字段读取无命中；`git diff --check` 通过。
- 下一项：继续检查 Agent VLM instruction、prompt rewrite 和剩余 workflow context 的运行时选项。

### 13.301 P7ce Agent VLM runtime getter 清理（2026-09-09）

- Prompt rewrite timeout、VLM planner timeout 和 Prompt context 的 `SLOT_ORDER` 改为 getter 注入，主入口按 controller 分别传递配置。
- 保留 prompt rewrite、planner 超时取消、项目切换判断、引用 slot 排序和 VLM context 行为，没有新增界面文字。
- 测试：相关 Node 合计 `18 passed`；runtime config getter 合同 `2 passed`；VLM instruction、rewrite timeout、VLM context 合同合计 `4 passed`。
- 验证：主入口及三个模块 `node --check` 通过；旧 timeout 和 `SLOT_ORDER` 字段读取无命中；`git diff --check` 通过。
- 下一项：复查 Agent context 是否只剩合法的项目标识和函数能力注入，再处理其他非 Agent controller 的独立配置入口。

### 13.302 P7cf VLM node/chat 静态配置 getter 清理（2026-09-09）

- VLM node、VLM node view 和 VLM chat 的版本、图片槽位、聊天默认值、上下文窗口、节点尺寸、Agent 模式和 Custom API provider 改为按名称 getter 注入；`PROJECT_ID` 保留为运行时标识。
- 保留 VLM 节点尺寸、版本选择、图片输入、聊天默认参数、上下文预算和 Custom API 配置行为，没有新增界面文字。
- 测试：相关 Node 合计 `83 passed`；配置 getter 合同 `3 passed`；主入口及三个 VLM 模块 `node --check` 通过。
- 下一项：继续检查 VLM image preview、History controller 和其他非 Agent controller 的独立配置入口。

### 13.303 P7cg History/preview 标量配置 getter 清理（2026-09-09）

- History controller 的历史条目数量、内存预算和 VLM image preview 目标像素数改为 getter 注入，保留撤销/重做裁剪与预览尺寸、定位行为，没有新增界面文字。
- 测试：History 与 VLM image preview Node 合计 `7 passed`；配置及现有结构合同合计 `4 passed`；主入口和两个 controller `node --check` 通过。
- 下一项：继续扫描 Template Library Data 的静态路径配置及其他 controller 中仍直接注入的标量选项。

### 13.304 P7ch Template Library Data 静态路径 getter 清理（2026-09-09）

- Template Library Data 的 manifest 路径和 preview 根路径改为 getter 注入，保留模板读取、预览路径解析和 fallback 行为，没有新增界面文字。
- 测试：Template Library Data Node `5 passed`；对应 Python 合同 `2 passed`；主入口和 Data controller `node --check` 通过。
- 下一项：清理 VLM context 中残留的 `lang`、`selectedNodeId` 和旧 `projectId` fallback。

### 13.305 P7ci VLM context 旧状态 fallback 清理（2026-09-09）

- VLM Agent context 移除旧的选中节点、语言和小写项目标识 fallback，保留 `PROJECT_ID` 运行时标识以及现有 getter、`runtimeUiLang()` 和项目数据来源。
- 测试：VLM Agent context、VLM chat Node 合计 `76 passed`；对应 Python 合同 `1 passed`；主入口和 chat controller `node --check` 通过。
- 下一项：继续扫描非 Agent controller 的运行时标量和能力字段，优先检查 Media、Node renderer 和 Timeline 配置。

### 13.306 P7cj Classic renderer 配置 getter 清理（2026-09-09）

- Preset Node renderer 和 Node Param controller 的 Classic 配置改为 getter 注入，保留模式、outpaint/inpaint/enhance、IP 数量上限和端口显示行为，没有新增界面文字。
- 测试：Node Param 与 Node renderer Node 合计 `16 passed`；对应 Python 合同合计 `5 passed`；主入口及两个 controller `node --check` 通过。
- 下一项：继续扫描 Timeline、Media 和其他 renderer 中仍直接注入的运行时配置。

### 13.307 P7ck 面板与特殊节点项目 getter 边界清理（2026-09-09）

- Asset Manager、Node Search、Project Manager，以及 SAM3、Camera Motion、Pose Studio、Gaussian Studio、LivePortrait、Qwen TTS、Director Timeline 的 context 改为动态 `getProject()` / `getProjectId()`；Style Selector 移除未使用的项目入口。
- 保留资产引用统计、节点搜索、项目切换、特殊节点创建、API `project_id`、Timeline 媒体来源和现有双语界面行为，没有改变项目数据格式。
- 测试：相关 Node 合计 `17 passed`；Python 合同合计 `7 passed`；相关模块和主入口 `node --check`、`git diff --check` 通过。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 中既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 未执行：完整 Canvas Python、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收。
- 下一项：继续检查剩余 renderer/controller 的聚合 project、运行时选项和能力映射，优先处理仍能明确改为 getter 的入口。

### 13.308 P7cl Agent 项目标识 getter 边界清理（2026-09-09）

- Prompt rewrite 和 VLM instruction controller 的默认项目标识改为 `getDefaultProjectId()` getter，移除 `scope.projectId` 兼容读取；当前项目继续由 `getProject()` 提供。
- 保留提示词改写、VLM 计划请求、取消 payload、项目变更判断和双语显示，没有新增界面文字。
- 测试：相关 Node 合计 `17 passed`；Agent 配置及 VLM instruction Python 合同合计 `5 passed`；新增 project 缺少 `id` 的默认值行为测试通过。
- 验证：主入口及两个 Agent controller `node --check` 通过；目标模块不再读取 `scope.projectId`，context 不再直接注入 `projectId: PROJECT_ID`；`git diff --check` 通过。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 中既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 未执行：完整 Canvas Python、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收。
- 下一项：清理 Media Browser Drag controller 的 `dragMime` 普通字段，改为命名 getter，并保留媒体拖拽协议行为。

### 13.309 P7cm Media Browser Drag MIME getter 清理（2026-09-09）

- Media Browser Drag controller 的 MIME 协议改为 `getDragMime()` getter，主入口按 getter 注入 `MEDIA_BROWSER_DRAG_MIME`，移除 `scope.dragMime` 读取。
- 保留媒体 payload、外部 MIME 读取、内部 fallback、拖拽样式和 viewport 清理行为，没有新增界面文字。
- 测试：Media Browser Drag Node `3 passed`；Media Browser Drag 与 Viewport Drop Python 合同合计 `4 passed`。
- 验证：主入口和 Drag controller `node --check` 通过；旧 MIME 普通字段无命中；`git diff --check` 通过。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 中既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 未执行：完整 Canvas Python、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收。
- 下一项：继续扫描非 Agent controller 的独立运行时标量和能力字段，优先检查 Timeline、Media viewer 和 renderer context。

### 13.310 P7cn VLM chat 项目标识 getter 清理（2026-09-09）

- VLM Agent context 和 VLM chat controller 的默认项目标识改为 `getDefaultProjectId()` getter，移除 `scope.PROJECT_ID` 读取；主入口按 getter 注入默认项目 ID。
- 保留 VLM context、聊天请求/取消、模型卸载、Custom API 测试、会话标识和 `project_id` fallback 行为，没有新增界面文字。
- 测试：VLM Agent context 与 VLM chat Node 合计 `76 passed`；相关 Python 合同合计 `28 passed`。
- 验证：主入口和 VLM chat `node --check` 通过；旧 `scope.PROJECT_ID` 与普通字段无命中；`git diff --check` 通过。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 中既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 未执行：完整 Canvas Python、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收。
- 下一项：继续检查 Timeline、Media viewer 和 renderer context，区分环境对象、函数能力与仍可 getter 化的运行时配置。

### 13.311 P7co Timeline keyframe helper 迁移（2026-09-09）

- 媒体时间线模块现在负责选中视觉剪辑、关键帧定位、变换值归一化、播放头取值和关键帧同步；主入口改为 alias 转发，并通过现有 `uid` 生成新关键帧 ID。
- 保留时间线拖拽、参数编辑、关键帧跳转/重置、插值、遮罩 feather 和渲染行为，没有新增界面文字。
- 测试：时间线相关 Node `44 passed`；Python 合同 `11 passed`；主入口与时间线模块 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续检查 Media viewer、Timeline DOM helper 和 renderer context 中仍留在主入口的可独立迁移函数。

### 13.312 P7cp Timeline preview geometry 迁移（2026-09-09）

- 媒体时间线模块现在负责预览图层的 fit、缩放、位置和像素几何；主入口与 Timeline frame controller 通过同一个 geometry alias 使用这套结果。
- 保留预览定位、裁剪、旋转、遮罩合成、geometry probe 和帧导出行为，没有新增界面文字。
- 测试：时间线相关 Node `45 passed`；Python 合同 `11 passed`；主入口与时间线模块 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续迁移 Timeline DOM 刷新 helper，并复查 Media viewer 和 renderer context 的主入口残留逻辑。

### 13.313 P7cq Timeline DOM helper 迁移（2026-09-09）

- 新增 `canvas_timeline_dom.js`，负责时间线轨道信息、行高、剪辑位置、播放头和关键帧标记刷新；主入口通过 controller alias 向现有 Timeline controllers 提供这些方法。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载新模块；时间线拖拽、播放头、关键帧、轨道布局和双语界面保持不变。
- 测试：时间线相关 Node `49 passed`；Python 合同 `21 passed`；DOM controller、`media_timeline.js` 和主入口 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续检查 Media viewer 和 renderer context，并迁移仍留在主入口且能独立验证的媒体或渲染逻辑。

### 13.314 P7cr Timeline clip logic 迁移（2026-09-09）

- 媒体时间线模块现在负责剪辑结束时间、轨道兼容性、媒体可用时长、边界约束和时间吸附；主入口保留 alias 与 `getNode`、媒体资产和 trim range 能力转发。
- 保留剪辑拖拽、轨道切换、trim 边界、时间吸附、Timeline 参数和连接判断，没有新增界面文字。
- 测试：时间线及 Media viewer Node `52 passed`；Python 合同 `22 passed`；主入口与时间线模块 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续复查 Media viewer 和 renderer context 的主入口残留逻辑，优先迁移能独立验证的纯媒体或渲染函数。

### 13.315 P7cs Media viewer 特殊节点图片来源迁移（2026-09-09）

- Media viewer 模块现在统一解析普通 image asset，以及 Pose Studio、Gaussian Studio、LivePortrait 的输出图片资产；主入口直接使用 `getNodeImageSrc` alias。
- 保留图片查看、Sketch/LayerForge 图片来源判断、特殊节点右键菜单和输出资产优先级，没有新增界面文字。
- 测试：Media viewer Node `3 passed`；图片节点、Node context 和 Media viewer Python 合同合计 `22 passed`；主入口和 Media viewer `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续检查结果预览播放器与 renderer context 中仍留在主入口的独立媒体逻辑。

### 13.316 P7ct Result preview controller 迁移（2026-09-09）

- 新增 `canvas_result_preview.js`，负责运行中结果的帧缓存、serial 去重、step batch 切换、预览播放、媒体宽高比和预览 DOM；主入口只保留 controller 创建与 alias。
- Standalone `webui.py` 和 lazy assets 已在 `canvas_asset_node_renderer.js` 后加载新模块，再加载主入口；最终媒体替换、轮询 serial、重试预览和删除节点停止播放器保持不变。
- 测试：Result preview、asset renderer、Node render、Graph delete Node 合计 `26 passed`；相关 Python 合同合计 `25 passed`；主入口与 Result preview `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描 renderer context 和剩余独立媒体 helper，优先处理仍留在主入口且可单独验证的来源选择或尺寸计算。

### 13.317 P7cu Media viewer 可显示图片判断迁移（2026-09-09）

- Media viewer 模块现在负责 image 与 result 节点的可显示图片资产判断；主入口仅转发 `getSelectedResultAsset` 和 `safeAssetDisplaySrc`，Canvas Agent 目标判断行为保持。
- 测试：Media viewer 与 Result preview Node 合计 `7 passed`；相关 Python 合同合计 `38 passed`；Media viewer、Result preview 和主入口 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描 renderer context 和剩余独立媒体 helper，优先处理来源尺寸与节点布局计算。

### 13.318 P7cv 节点布局纯尺寸函数迁移（2026-09-09）

- 新增 `canvas_node_layout.js`，负责结果节点默认尺寸、图片节点尺寸约束、按资产尺寸适配和结果节点可读尺寸修正；主入口通过 Node Layout controller alias 调用。
- 保留结果节点宽高比判断、图片节点边界、居中保持、`card` 显示模式和资产字段 fallback，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载新模块；`getNodeLayoutSize` 和 Media Browser 节点尺寸修正暂留主入口，继续使用运行时测量和 DOM 相关能力。
- 测试：Node Layout Node `4 passed`；相关 Node `42 passed`；Python 合同 `29 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续处理 `ensureMediaBrowserNodeReadableSize` 及 `getNodeLayoutSize` 的依赖边界，区分纯尺寸逻辑和运行时测量逻辑。

### 13.319 P7cw Node Layout 运行时尺寸依赖迁移（2026-09-09）

- Node Layout controller 现在负责 `minResizableNodeSize`、Media Browser 节点可读尺寸修正和 `getNodeLayoutSize`；折叠提示高度、测量缓存和 `scheduleSave` 通过 context 注入。
- 保留普通节点、VLM chat、Media Browser、折叠 preset/classic 的最小尺寸规则，以及 group fallback、测量值和保存行为，没有新增界面文字。
- 主入口移除三个运行时布局函数实现，保留 alias；Node Resize、Node Render、Viewport 和 Minimap 的调用接口保持。
- 测试：Node Layout 及相关 Node `48 passed`；Python 合同 `32 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 已复查通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描节点创建、Viewport 几何和 renderer context 中仍留在主入口的布局辅助函数。

### 13.320 P7cx Node Layout 节点放置辅助迁移（2026-09-09）

- Node Layout controller 现在负责 `placeNodeAvoidingOverlap`，调用注入的 Viewport 位置计算，更新节点坐标并记录 reserved rect。
- 保留节点尺寸来源、可见区域约束、排布结果和节点创建入口接口，没有新增界面文字。
- 主入口移除该函数实现，保留 alias；`getNodeRect` 与 `findOpenNodePosition` 继续作为 Viewport 适配层。
- 测试：Node Layout 及相关 Node `42 passed`；Python 合同 `21 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 已复查通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描剩余 Viewport 适配、节点创建和 renderer context 中仍留在主入口的布局辅助函数。

### 13.321 P7cy Node Layout Viewport 适配迁移（2026-09-09）

- Node Layout controller 现在负责 `getNodeRect` 和 `findOpenNodePosition`，调用注入的 Viewport 实现，并接收项目节点、可见区域、布局测量和默认尺寸能力。
- 保留节点尺寸 fallback、可见区域 margin、`keepVisible` 处理、项目节点传递及 Minimap、Node Resize、Node Render、节点创建调用接口，没有新增界面文字。
- 主入口移除两个 Viewport 适配函数实现，保留 alias；Viewport 原始几何算法继续由 `viewport.js` 负责。
- 测试：Node Layout 及相关 Node `43 passed`；Minimap/Viewport 辅助 Node `29 passed`；Python 合同 `21 passed` 与 `24 passed`；主入口与 Node Layout `node --check` 通过。
- `git diff --check` 已复查通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描节点创建和 renderer context 中仍留在主入口的布局辅助函数。

### 13.322 P7cz Viewport Render helper 迁移（2026-09-09）

- 新增 `canvas_viewport_render_controller.js`，负责可见世界范围、节点/边渲染范围、节点/边 viewport 判断和边 SVG 范围；主入口改为 alias 转发。
- 保留节点 overscan、边数量阈值、选中/连接/运行状态的强制显示和 `viewport.js` 纯几何算法，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载新模块。
- 测试：Viewport Render、Node Layout、Node Render、Minimap、Pan 相关 Node `29 passed`；Python 合同 `14 passed`；Edge Canvas/Edge Point Cache 合同 `2 passed`；主入口与新模块 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；完整 Gradio 6 可见性合同仍有 `6 failed, 16 passed` 的既有非本项失败，真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查节点空间索引和 renderer context 中仍留在主入口的几何或状态 helper，节点创建入口暂不整体迁移。

### 13.323 P7d0 Node Spatial Index 核心迁移（2026-09-09）

- 新增 `canvas_node_spatial_index.js`，负责空间索引失效、建索引、记录刷新、强制显示节点收集和矩形候选查询；主入口保留 marquee、命中点和可见节点结果的上层状态处理。
- 保留节点阈值、cell size、记录顺序、运行/刷新节点保留和选中/连接/拖动/缩放/标签编辑节点强制加入候选，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载新模块。
- 测试：相关 Node `29 passed`；Python 合同 `15 passed`；主入口与新模块 `node --check` 通过；完整 Gradio 6 可见性合同 `17 passed, 5 failed`，剩余失败与本项无关。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 `getMarqueeNodeRecords`、`findCanvasNodeAtWorldPoint` 和 `getVisibleNodeRecords` 的状态边界，之后再评估节点创建入口。

### 13.324 P7d1 Node Spatial Query 状态迁移（2026-09-09）

- Node Spatial Index controller 现在负责 marquee 候选、节点命中、可见节点筛选和可见节点计数；主入口保留 pan 延迟和渲染覆盖范围状态。
- 保留命中点 padding、倒序命中、marquee overlap、perf 统计、项目 ID 集合和渲染筛选，没有新增界面文字。
- 测试：相关 Node `30 passed`；Python 合同 `16 passed`；完整 Gradio 6 可见性合同 `17 passed, 5 failed`，失败仍为本项之外的既有 LOD、滚动隔离和 gallery health 合同；主入口与新模块 `node --check` 通过。
- 本次修改范围 `git diff --check` 通过，只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 `shouldDeferPanNodeRender` 与节点覆盖范围状态，之后再评估节点创建入口。

### 13.325 P7d2 Pan 延迟渲染状态迁移（2026-09-09）

- Node Spatial Index controller 现在负责 pan 期间的可见节点预算判断和渲染覆盖范围扩展；主入口只提供 panning 状态、预算、overscan、coverage setter 等运行时能力。
- 保留超出 pan 预览预算时延后节点完整渲染、按 zoom 计算 coverage padding，以及正常预算下不扩展覆盖范围的行为，没有新增界面文字。
- 测试：Node 相关 `33 passed`；Python 合同 `16 passed`；完整可见性合同 `17 passed, 5 failed`，剩余失败仍位于 Drag Edge LOD、Pan Edge settle、滚动隔离、Wheel Preview LOD 和 gallery health；主入口与 Node Spatial Index `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。

### 13.326 P7d3 Node Factory 节点创建迁移（2026-09-09）

- 新增 `canvas_node_factory.js`，统一创建 classic 和 scene preset 节点；`addClassicNode`、`addPresetNode` 保留类型路由、历史记录、位置处理、项目写入、连接、渲染和提示，只通过 factory 获取节点对象。
- 保留主题默认参数、prompt/style snapshot、上传槽、模型状态、特殊 preset 控制器尺寸、collapsed/source 字段和双语界面行为，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 都在主入口前加载 Node Factory；Node Factory Node `3 passed`、Python 合同 `2 passed`，相关 Node 回归 `29 passed`、Python 合同 `7 passed`；主入口与 Node Factory `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查其他独立节点创建函数，优先处理已有节点模块可直接承接的纯对象构造部分。

### 13.327 P7d4 Text Node Factory 节点创建迁移（2026-09-09）

- 新增 `canvas_text_node_factory.js`，统一创建 text、text merge、translation、Tag Cart 和 WD14 节点；主入口保留历史记录、排布、项目写入、连接、选择、异步刷新、Tag Cart 打开和提示行为。
- 保留文本输入槽顺序、separator 默认值、翻译参数、Tag Cart 参数、WD14 阈值、状态消息、默认尺寸和 `stage.__lang` 对应的标题，没有新增界面文字或拼接双语文本。
- Standalone `webui.py` 与 lazy assets 都在主入口前加载 Text Node Factory；Text Node Factory Node `3 passed`、相关文本 Node `7 passed`、Python 合同 `25 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 Media Browser、Note 和其他仍在主入口中直接创建对象的节点，优先选择已有 controller 能承接的字段构造。

### 13.328 P7d5 Auxiliary Node Factory 节点创建迁移（2026-09-09）

- 新增 `canvas_aux_node_factory.js`，统一创建 Wildcards Helper、Media Browser 和 Note 节点；主入口保留历史记录、排布、项目写入、连接、选中、Media Browser 刷新、Wildcards catalog 刷新和提示行为。
- 保留 Media Browser 状态序列化、初始位置、默认尺寸、Wildcards 参数、Note 样式、双语标题和 `keepVisible` 排布参数，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 都在主入口前加载 Auxiliary Node Factory；Auxiliary Node Factory Node `3 passed`、相关 Node 回归 `18 passed`、Python 合同 `5 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 Style Selector、Batch Any 和仍在主入口直接创建对象的专业节点，优先沿用已有节点模块的 context 边界。

### 13.329 P7d6 Style Selector 节点创建迁移（2026-09-09）

- `style_selector_node.js` 现在负责创建 Style Selector 节点对象；主入口保留已选风格初始化、preset 连接、排布、选择、刷新和提示行为。
- 保留节点尺寸、标题、target preset、source、时间戳、双语 context、风格选择状态和已有 `STYLE_SELECTOR_NODE_CONTEXT_SOURCE` 调用，没有新增界面文字。
- Style Selector context 现在提供 `defaultNodeSize`、`uid` 和 `createNode`；Style Selector 及相关 factory Node `9 passed`、Python 合同 `6 passed`；主入口与节点模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 Batch Any 和其他仍在主入口直接创建对象的专业节点，优先沿用已有节点模块的 context 边界。

### 13.330 P7d7 Batch Any 节点创建迁移（2026-09-09）

- 新增 `canvas_batch_any_node_factory.js`，负责创建 Batch Any 节点对象；主入口保留历史记录、位置避让、项目写入、待完成连接、选中、渲染和提示行为。
- 保留 Batch Any 默认尺寸、标题、素材类型、批量项状态、停止策略、运行状态、资产字段和 source 字段，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载 Batch Any Node Factory；Batch Any factory Node `2 passed`、相关 factory Node `14 passed`、Python 合同 `10 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入；完整可见性合同的既有失败保持不变。
- 下一项：继续检查仍在主入口直接构造对象的专业节点，优先选择可以独立验证的纯对象构造部分。

### 13.331 P7d8 Compare 与 Media Timeline 节点创建迁移（2026-09-09）

- Compare 节点对象创建迁入 `nodes/compare_node.js`，Media Timeline 节点对象创建迁入 `media_timeline.js`；主入口继续负责历史记录、位置避让、项目写入、连接、选中、Timeline normalize、渲染和提示。
- 保持 Compare 输入与 position/mode 默认值、Timeline 画布参数、默认轨道、空 clips、source 字段和节点尺寸，没有新增界面文字。
- Compare/Timeline 相关 Node `55 passed`、Python 合同 `13 passed`；主入口、Compare 模块和 Media Timeline `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。

### 13.332 P7d9 Advanced Masking 节点创建迁移（2026-09-09）

- 新增 `canvas_mask_node_factory.js`，负责创建 Advanced Masking 节点对象；主入口保留历史记录、位置避让、项目写入、选中、渲染和提示行为。
- 保持遮罩节点尺寸、双语标题、输入节点、模型参数、asset、source 和初始状态，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载 Mask Node Factory；Mask factory Node `2 passed`、Canvas module Node 合计 `543 passed`、选定 Python 合同 `23 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 VLM、Manual Output 和其他仍在主入口直接构造对象的节点，优先沿用现有模块的 context 边界。

### 13.333 P7d10 Manual Output 节点创建迁移（2026-09-09）

- 新增 `canvas_result_node_factory.js`，负责创建 Manual Output Result 节点对象；主入口保留历史记录、位置避让、项目写入、连接、选中、渲染和提示行为。
- 保持 Result 节点尺寸、`Manual Output` 双语标题、producer、manual 状态、提示信息、preview、asset 和 source 字段，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 已在主入口前加载 Result Node Factory；Result factory Node `2 passed`、Canvas module Node 合计 `545 passed`、选定 Python 合同 `25 passed`；主入口与新模块 `node --check` 通过。
- `git diff --check` 通过，检查中只有既有 LF/CRLF 提示；真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 下一项：继续检查 VLM 和其他仍在主入口直接构造对象的节点，优先沿用现有模块的 context 边界。

### 13.334 P7d11 VLM 节点创建迁移（2026-09-09）

- 现有 `canvas_vlm_node.js` 新增 VLM 节点 builder，负责尺寸、Agent 默认参数、调用方参数、图像输入、文本、状态和 source 对象；主入口只保留节点加入画布后的流程。
- 保留 single/chat 尺寸、默认 params 与 `options.params` 的合并顺序、`text`、`status`、`source` 和已有状态文本，没有新增界面文字。
- Standalone `webui.py` 与 lazy assets 继续在主入口前加载 `canvas_vlm_node.js`，本项不改变脚本顺序。
- 已新增 VLM Node builder Node/Python 合同；VLM Node、Chat、Agent 相关 Node 合计 `87 passed`，Python 合同 `2 passed`；主入口与 VLM 模块 `node --check` 通过，真实 Studio、浏览器、后端/API、GPU、安装版和远端环境未执行。
- 已知失败：`test_canvas_agent_quick_tools_contract.py` 的既有 VLM context 旧函数边界断言仍失败，未由本项改动引入。
- 下一项：继续扫描仍在主入口直接构造对象的专业节点，优先处理已有节点模块可以独立验证的对象字段。

### 13.335 P7d52 SAM3 临时媒体编辑资产边界拆分（2026-09-10）

- 扩展 `canvas_asset_factory.js`，新增 `buildMediaEditAsset`；SAM3 Video Mask 的 source trim 请求和 mask upload 请求改由 Asset Factory 生成请求资产副本，保留完整 `edit` 信息中的 `duration`。
- SAM3 node 继续计算媒体范围、组织请求、处理后端响应和刷新界面；项目资产与请求副本分离，原有资产及其嵌套 `edit` 不被临时请求字段修改，没有新增界面文字。
- 主入口新增 `buildMediaEditAsset` alias，并注入 SAM3 context；Asset Factory 的加载顺序不变。
- Asset Factory、特殊 node context、SAM3 合同已同步，覆盖 builder delegate、`duration` 和嵌套对象复制，以及 SAM3 不直接合并 `payload.asset`。
- Node 专项 `12 passed`；Python 合同 `32 passed`；Asset Factory、SAM3 node、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查 SAM3 及其他特殊节点剩余的项目持久化字段，区分请求临时数据、编辑器缓存和节点资产状态。

### 13.336 P7d53 SAM3 source 与输入节点关系 patch 拆分（2026-09-10）

- 扩展 `canvas_special_node_patch_factory.js`，新增 `buildSam3SourcePatch`；SAM3 生成、上传和卸载流程改由该 builder 更新 `source` 与 `input_node_id`。
- SAM3 node 保留来源判断、请求、后端资产响应、运行状态和界面协调；source patch 会复制原有嵌套数据，不再由 node 直接赋值 source 或输入节点关系。
- 主入口新增 `buildSam3SourcePatch` alias，并注入 SAM3 context；Special Node Patch Factory 的加载顺序不变。
- Special Node Patch Factory、特殊 node context、SAM3 合同已同步，覆盖生成、上传、卸载路径和嵌套 source 数据复制。
- Node 专项 `10 passed`；Python 合同 `28 passed`；Special Node Patch Factory、SAM3 node、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查 SAM3 状态字段以及其他特殊节点剩余的项目持久化字段，区分运行状态、编辑器缓存和节点资产状态。

### 13.337 P7d54 SAM3 运行状态 builder 拆分（2026-09-10）

- SAM3 Video Mask 的生成、上传、停止和卸载状态对象改由现有 `buildCanvasRunStatus` 生成，保留状态时机和消息内容；节点创建默认状态不纳入本项。
- SAM3 node 继续负责状态选择、请求生命周期、取消、回调和界面协调；生成、上传、停止、卸载路径不再直接构造状态对象，没有新增界面文字。
- 主入口把 `buildCanvasRunStatus` 注入 SAM3 context，Run Status Controller 的加载顺序不变。
- 更新 SAM3 与特殊 node context 合同，覆盖状态 builder delegate 和四条生命周期路径。
- Node 专项 `10 passed`；Python 合同 `30 passed`；SAM3 node、Special Node Patch Factory、主入口 `node --check` 通过。
- `git diff --check` 已在本项记录前复查并通过；未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查其他特殊节点的运行状态和清理状态，优先处理已有状态 builder 能直接承接的字段。

### 13.338 P7d55 Camera Motion 运行状态 builder 拆分（2026-09-10）

- Camera Motion 的参数变化、生成、失败和清理状态改由现有 `buildCanvasRunStatus` 生成，保留状态时机和消息内容；节点创建默认状态不纳入本项。
- Camera Motion node 继续负责参数校正、请求生命周期、资产响应、source 设置和界面协调；相关路径不再直接构造状态对象，没有新增界面文字。
- 主入口把 `buildCanvasRunStatus` 注入 Camera Motion context，Run Status Controller 的加载顺序不变。
- 更新 Camera Motion context 合同，覆盖参数变化、生成、失败和清理路径。
- Node 专项 `10 passed`；Python 合同 `31 passed`；Camera Motion node、Special Node Patch Factory、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查 Camera Motion 生成结果的 source 设置和其他特殊节点剩余的项目持久化字段。

### 13.339 P7d56 Camera Motion source 设置 patch 拆分（2026-09-10）

- 扩展 `canvas_special_node_patch_factory.js`，新增 `buildCameraMotionSourcePatch`；Camera Motion 生成成功后的 `source.settings` 改由该 builder 生成。
- Camera Motion node 继续负责参数校正、请求、资产响应和界面协调；source settings 复制后写入节点状态，其他 source 字段保持，没有新增界面文字。
- 主入口新增 `buildCameraMotionSourcePatch` alias，并注入 Camera Motion context；Special Node Patch Factory 的加载顺序不变。
- 更新 Special Node Patch Factory、特殊 node context 和 Camera Motion 合同，覆盖 source settings 的嵌套对象复制以及 node 不直接合并 source。
- Node 专项 `11 passed`；Python 合同 `31 passed`；Camera Motion node、Special Node Patch Factory、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的项目持久化字段，优先处理已有 patch 或状态 builder 能直接承接的字段。

### 13.340 P7d57 Camera Motion 参数 patch 拆分（2026-09-10）

- 扩展 `canvas_special_node_patch_factory.js`，新增 `buildCameraMotionParamsPatch`；Camera Motion 的参数编辑和生成响应设置改由该 builder 生成独立的 `params` patch。
- Camera Motion node 保留参数校正、默认参数合并、旧资产清理、请求生命周期、资产响应、source settings、状态消息和界面协调；节点创建默认参数不纳入本项。
- Patch Factory 负责复制并合并参数对象；参数编辑与成功响应不再由 Camera Motion node 直接赋值 `params`，没有新增界面文字。
- 主入口新增 `buildCameraMotionParamsPatch` alias，并注入 Camera Motion context；Special Node Patch Factory 的加载顺序不变。
- 更新 Special Node Patch Factory、特殊 node context 和 Camera Motion 合同，覆盖参数编辑、生成响应、嵌套参数独立复制以及 alias/context 加载。
- Node 专项 `12 passed`；Python 合同 `4 passed`；Special Node Patch Factory、Camera Motion node、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查 Pose Studio、LivePortrait、Gaussian Studio 以及 Canvas VLM 的剩余项目持久化字段，区分状态初始化、临时聊天数据和项目状态。

### 13.341 P7d58 特殊节点连接关系 patch 拆分（2026-09-10）

- 扩展 `canvas_special_node_patch_factory.js`，新增 `buildSpecialNodeConnectionPatch`；主入口中 Pose Studio、Gaussian Studio 和 LivePortrait 的图像连接分支改由该 builder 更新输入节点关系。
- 保留自动连接、Result bridge、直接连接、连接边替换、状态提示、历史记录、静默调用和选择行为；LivePortrait 的顶层输入/参考节点与嵌套状态字段继续同步。
- Patch Factory 负责复制并组合 `input_node_id`、`reference_node_id` 和 LivePortrait 来源字段；主入口继续负责连接类型判断、边管理、状态生成和界面提示，没有新增界面文字。
- 主入口新增 `buildSpecialNodeConnectionPatch` alias；Special Node Patch Factory 的加载顺序不变，未增加特殊 node context 依赖。
- 更新 Special Node Patch Factory 模块测试和主入口合同，覆盖自动连接、Result bridge、直接连接和嵌套字段独立复制。
- Node 专项 `13 passed`；Python 合同 `5 passed`；Special Node Patch Factory、主入口 `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查图删除、边删除和剪贴板恢复中的特殊节点输入关系与清理状态，随后处理 SAM3 工作流来源清理字段。

### 13.342 P7d59 特殊节点删除与剪贴板关系 patch 拆分（2026-09-10）

- 功能变化：图删除、边删除和剪贴板恢复中的 Pose Studio、Gaussian Studio、LivePortrait 输入关系改由 `buildSpecialNodeConnectionPatch` 生成；剪贴板中的 SAM3 输入关系改由 `buildSam3SourcePatch` 生成。
- 保持：节点删除、连线删除、锁定判断、历史记录、Agent 删除通知、状态提示、选择状态、Pose/Gaussian 输出保留和 LivePortrait 顶层/嵌套来源同步保持；复制、粘贴、重复节点和外部输入连线恢复保持；没有新增界面文字。
- 边界：Graph Delete 与 Clipboard controller 继续负责删除/复制/粘贴流程、边筛选、状态时机和界面协调；Special Node Patch Factory 负责输入节点关系对象的复制与组合；特殊节点清理状态沿用 `mergeCanvasRunStatus`。
- 加载：主入口向 Graph Delete 与 Clipboard controller 注入 `buildSpecialNodeConnectionPatch`、`buildSam3SourcePatch` 和 `mergeCanvasRunStatus`；现有脚本加载顺序不变。
- 合同：更新 Graph Delete、Clipboard controller 合同，覆盖特殊节点删除、断开、粘贴关系恢复和 builder 注入；模块夹具覆盖 LivePortrait 参考关系清理及 Pose/Gaussian/LivePortrait/SAM3 粘贴恢复。
- 测试：Graph Delete、Clipboard、Special Node Patch Factory Node 合计 `17 passed`；Graph Delete 与 Clipboard Python 合同 `4 passed`。
- 验证：相关 controller、Special Node Patch Factory、主入口 `node --check` 通过；涉及文件 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Studio、真实浏览器页面、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：处理 SAM3 Agent 工作流删除源视频时的 `input_node_id` 与嵌套 `source` 清理字段。

### 13.343 P7d60 SAM3 Agent 工作流来源删除 patch 拆分（2026-09-10）

- 功能变化：SAM3 Agent 工作流删除源视频时，`input_node_id` 与 `source.agent_video_mask_workflow` 的清理更新改由 `buildSam3SourcePatch` 生成。
- 保持：工作流自动运行关闭、`source_node_id` 清空、删除原因记录、分组标题更新、节点 idle 状态、Agent 提示和后续重新连接行为保持；没有新增界面文字。
- 边界：主入口继续负责工作流删除判断、错误状态、分组标题和界面提示；Special Node Patch Factory 负责复制并组合 SAM3 节点输入与 source patch。
- 合同：新增 SAM3 工作流来源删除合同，确认删除分支调用 `buildSam3SourcePatch`，且不再直接赋值 `node.input_node_id` 或整体合并 `node.source`。
- 测试：SAM3 Agent、Graph Delete、Clipboard Python 合同合计 `14 passed`；Graph Delete、Clipboard、Special Node Patch Factory Node 合计 `17 passed`。
- 验证：主入口、相关 controller 和 Special Node Patch Factory `node --check` 通过；涉及文件 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Studio、真实浏览器页面、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查 SAM3 断开连线、普通 SAM3 节点清理以及其他特殊节点剩余的 source 状态字段。

### 13.344 P7d61 SAM3 来源关系与 Agent 状态 patch 拆分（2026-09-10）

- 图删除、SAM3 媒体边删除和 SAM3 主动连线中的 `input_node_id` 与 `source.source_node_id` 更新改由 `buildSam3SourcePatch` 生成；`setCanvasAgentSam3WorkflowState` 继续通过同一 builder 更新嵌套 workflow。
- 源视频删除、媒体边断开、重新连接、状态提示、历史记录和 Agent workflow 分组更新保持；WD14 与 Advanced Masking 的普通图像连线仍只更新自身输入关系，不会写入 SAM3 的 `source` 字段，没有新增界面文字。
- Graph Delete 继续负责节点/边删除和状态时机；主入口继续负责 SAM3 连线校验、Agent workflow 状态和界面协调；Special Node Patch Factory 负责复制并组合 SAM3 输入与 source patch。
- 更新 Graph Delete、Agent quick tools 和 SAM3 连接合同，覆盖节点删除、媒体边断开、Agent workflow 状态更新以及 SAM3/WD14/Advanced Masking 连线边界；模块夹具覆盖 SAM3 来源清理和断开后的嵌套 source 保留。
- 相关 Node `19 passed`；Graph Delete、Agent quick tools 和特殊 node context Python 合同 `19 passed`；主入口、Graph Delete 和 Special Node Patch Factory `node --check` 通过；`git diff --check` 通过。
- 未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；工作区既有的 VLM context 合同失败与 `test_wan_reference_video_contract.py` 的 2 个无关断言失败仍未处理；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的 source、输入关系和状态字段，优先处理仍由主入口直接维护且已有 builder 可承接的路径。

### 13.345 P7d62 Agent 创建标记与工作流归属 patch 拆分（2026-09-10）

- 新增 `canvas_agent_patch_factory.js`，负责 Agent 创建标记、折叠字段、创建时间和工作流归属元数据；主入口保留空节点处理、应用 patch 和返回原节点，现有 workflow context 不变。
- 重复标记保留原创建时间，空选项沿用旧工作流值，其他 source 数据独立复制；节点参数、资产、运行状态、媒体连接、历史记录和提交行为保持，没有新增界面文字。
- Factory 仅依赖 `nowIso`、`cloneRunValue`；Standalone 与 Gradio lazy assets 均在主入口前加载一次，初始化早于 Agent 工作流 controller。
- 新增 factory Node 测试和加载/调用合同；图片编辑工作流测试使用真实新模块，覆盖创建标记、归属字段、媒体连接及提交参数。
- 验证：修改前相关 Node `17 passed`、Python 合同 `17 passed`；修改后 Node 专项 `25 passed`，全部 132 个 Node 模块测试文件 `622 passed`，Python 合同 `20 passed`；相关 `node --check`、`py_compile` 和已跟踪改动的 `git diff --check` 通过。
- 历史状态：Agent quick tools 当前全部通过，包括此前记录失败的 VLM context 断言；本项未修改对应实现或旧断言。Wan reference video 历史失败本次未复测。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：检查 Agent SAM3 工作流创建、分组绑定和删除成员时剩余的 source 更新，区分 SAM3 与 Result 数据归属，再继续其他特殊节点字段。

### 13.346 P7d63 Agent SAM3 工作流 source 归属拆分（2026-09-10）

- Agent SAM3 workflow 创建、分组绑定和删除成员时的 source 更新按 SAM3 节点与 Result 节点分流到各自 builder；相关 Node 与 Python 合同通过，未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收。

### 13.347 P7d64 Agent 参考图占位 source patch 拆分（2026-09-10）

- Agent 参考图占位节点的 source 元数据改由 Agent Patch Factory 生成；占位创建与连接行为保持，相关 Node 与 Python 合同通过，未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收。

### 13.348 P7d65 预留 Result 创建 source builder 拆分（2026-09-10）

- 预留 Result 的 source 元数据改由 Result Node Factory 生成；SAM3 workflow source 仍由 Special Node Patch Factory 维护，相关 Node 与 Python 合同通过，未执行真实 Studio、浏览器、后端/API、GPU、安装版和远端验收。

### 13.349 P7d66 Agent 创建 source 专用字段 patch 拆分（2026-09-10）

- `buildAgentCreatedNodePatch` 新增 `sourcePatch`，统一生成 Agent 音频/视频模式和工具标识；Qwen TTS 不再直接写回 `node.source`，相关 Agent Node `27 passed`、Python 合同 `19 passed`，主入口及相关模块 `node --check`、`git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Agent workflow 状态、分组清理、Canvas VLM `agent_tool_state` 和其他特殊节点项目字段。

### 13.350 P7d67 Agent workflow 分组字段 patch 拆分（2026-09-10）

- Agent workflow 分组的边界、复用标题和 SAM3 状态/删除标题更新改由现有 `buildGroupFieldPatch` 生成；相关 Node `30 passed`、Python 合同 `23 passed`，主入口与 Group Factory `node --check`、`git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Canvas VLM `agent_tool_state` 的项目状态更新及其他特殊节点项目字段。

### 13.351 P7d68 Canvas VLM agent_tool_state patch 拆分（2026-09-10）

- 新增 `canvas_vlm_chat_state_factory.js`，由 `buildVlmChatToolStatePatch` 负责复制并合并 VLM Chat 的 `agent_tool_state`；工具结果关联仍保留 workflow、preset 和 result 字段。
- 聊天消息、待发送图片、conversation id、清空聊天、运行状态、结果节点查找和提示行为保持；没有新增界面文字。
- VLM Chat State Factory 只负责 `agent_tool_state` patch；VLM chat controller 继续负责工具结果收集、更新时间、写入时机和项目刷新，不迁移消息历史结构。
- Standalone `webui.py` 与 Gradio lazy assets 在 VLM node/chat controller 前各加载一次；主入口初始化 factory 并注入 builder。
- 新增 State Factory Node 模块测试和 Python 合同，覆盖独立复制、已有字段保留、异常输入和 builder 注入；VLM Chat 模块夹具改用真实 factory。
- VLM Chat 与 State Factory Node 合计 `77 passed`；相关 Python 合同 `26 passed`；相关 JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过，仅有工作区既有的 LF/CRLF 转换提示。
- 未执行：完整 Canvas Python 合同、完整 Studio、真实浏览器、后端/API、GPU 生成、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的项目状态、清理字段和项目持久化字段。

### 13.352 P7d69 Pose Studio、LivePortrait、Gaussian Studio 默认状态 patch 拆分（2026-09-10）

- Pose Studio、LivePortrait、Gaussian Studio 的默认项目状态初始化、已有状态合并和嵌套复制改由 Special Node Patch Factory 负责，三个 node module 通过 context 使用对应 builder；Gaussian `precision` 归一化和默认焦距 `30mm` 保持。
- 节点创建、编辑器读写、输出确认、缓存更新、输入关系、资产和状态提示保持；LivePortrait 的状态节点查找补齐 context 传递，没有新增界面文字。
- 更新三个 node context、主入口 context source、Special Node Patch Factory Node 测试和特殊 node context Python 合同；Node `17 passed`，Python `5 passed`，相关 `node --check`、`py_compile`、`git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的项目状态、清理字段和项目持久化字段。

### 13.353 P7d70 Style Selector 状态 patch 拆分（2026-09-10）

- 现有 `canvas_special_node_patch_factory.js` 新增 `buildStyleSelectorStatePatch`，统一复制并合并 Style Selector 的默认状态、已有状态、`statePatch`、`text` 和时间字段；Style Selector node、剪贴板 controller、Graph Delete controller 的相关写回改为调用 builder。
- 风格卡片选择、提示词文本输出、搜索、Style Transfer+ 目标绑定、复制后的连线、删除文本边后的目标清理、历史/刷新和双语界面行为保持；没有新增界面文字。
- Special Node Patch Factory 负责 `style_selector`/`text` 状态 patch；Style Selector node 保留目录、渲染和选择逻辑；剪贴板保留复制与边重建；Graph Delete 保留边删除和项目状态协调。
- 更新 Style Selector context、Special Node Patch Factory、剪贴板和 Graph Delete 的 Node/Python 合同，覆盖 builder 注入、独立复制、复制重连和断开连接路径。
- 相关 Node `29 passed`；Python 合同 `12 passed`；相关 JavaScript `node --check`、Python `py_compile`、直接写回扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查 Batch Any、Qwen TTS 及其他特殊节点剩余的项目状态、清理字段和持久化写回路径。

### 13.354 P7d71 Batch Any 状态 patch 拆分（2026-09-10）

- Batch Any 的 `items`、`media_kind`、`current_index`、`params`、`batch`、`asset`、`source` 和可选 `text` 状态写回统一经过 `buildBatchAnyStatePatch`；素材持久化后的当前素材同步也使用该 patch。
- 素材选择、当前项切换、删除、来源节点加入、文件导入、批量运行、结果节点关联、保存、刷新和双语界面行为保持；没有新增界面文字。
- Batch Any State Factory 负责独立复制、嵌套合并和字段归一化，主入口继续负责素材、边关系、运行调度、结果节点和保存/刷新时机。
- 更新 Batch Any factory Node/Python 合同，覆盖 builder 注入、嵌套状态复制、主入口写回和素材持久化；相关 Node `8 passed`，资产渲染与 scheduler Node `9 passed`，Python 合同 `7 passed`，回归合同 `5 passed`。
- 相关 JavaScript `node --check`、Python `py_compile`、`git diff --check` 和目标字段边界扫描通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Qwen TTS 及其他特殊节点的状态、清理字段和项目持久化字段。

### 13.355 P7d72 Qwen TTS 状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildQwenTtsStatePatch`，统一复制并合并 Qwen TTS 的 `params`、`audio_inputs`、`source`、`qwen_tts_run` 和 `status`；新任务使用完整 `runState` 清除旧任务字段。
- Qwen TTS node 创建流程、参数编辑、音频连接、预检查、运行开始、轮询状态和停止请求均使用该 builder；四种模式、Run Record Factory、Result 关联、保存/刷新和双语界面行为保持，没有新增界面文字。
- 更新 Special Node Patch Factory、Qwen TTS node、主入口 Node/Python 合同；相关 Qwen/Special Node/Run Record/Agent workflow Node `29 passed`，Python 合同 `11 passed`。
- 同步修正 Qwen preset 合同以匹配当前 `getQwenTtsStylePresets` getter；相关 JavaScript `node --check`、Python `py_compile`、`git diff --check` 和生命周期边界扫描通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化字段。

### 13.356 P7d73 Camera Motion 状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildCameraMotionStatePatch`，统一处理 Camera Motion 的 `params`、`asset`、`source` 和 `status`；创建、参数变化、运行开始、成功/失败和清除流程均改用该 builder。
- 运镜参数校正、参数变化后清除旧参考视频、视频资产构造、`source.settings`、运行提示、历史/保存/刷新、节点选择和双语界面行为保持；没有新增界面文字。
- 状态 factory 负责默认状态合并、嵌套复制、资产复制和 source settings 合并；Camera Motion node 保留参数归一化、请求、资产响应和界面协调，原有参数/source builder 保留。
- 更新 Camera Motion context、主入口 alias、Special Node Patch Factory 和 WAN reference video 合同；相关 Node `20 passed`，资产/渲染/Inspector Node `23 passed`，Python 合同 `5 passed`。
- 相关 JavaScript `node --check`、Python 合同、字段边界扫描和 `git diff --check` 通过；WAN reference video 合同仍有语言默认值和旧 camera slot 文本两项既有失败。
- 未执行真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查 Director Timeline、SAM3 及其他特殊节点剩余的项目状态、清理字段和持久化写回路径。

### 13.357 P7d74 Director Timeline 状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildDirectorTimelineStatePatch`，统一复制并合并 Director Timeline 的 `director`、`media_inputs`、`source` 和 `status`；创建、全局/分镜编辑、拖动、媒体连接、分镜运行状态、剪贴板重连和图删除清理均使用该 builder。
- 时间线规范化、分镜约束、媒体槽位、prompt_override、历史/保存、选择、渲染、复制粘贴、断开连接和双语界面行为保持；编辑提交前使用独立时间线副本，没有新增界面文字。
- State Factory 负责四类项目字段的默认合并、独立复制和 patch；Director Timeline node 保留规范化、渲染和序列化；主入口保留媒体判断、边关系、能力判断和运行协调；分镜 Result 数据继续归 Result Node Factory。
- 更新 Director Timeline context、拖动、剪贴板、Graph Delete 的 Node/Python 合同；同步更新上一段尾帧合同中的当前 checkbox 取值表达式。相关 Node `61 passed`，Python 合同 `50 passed`。
- 相关 JavaScript `node --check`、Python `py_compile`、`git diff --check` 和状态字段边界扫描通过；Python 仅报告既有 Triton、SciPy、SWIG 弃用警告。
- 未执行真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续处理 SAM3 的完整项目状态 patch，再检查其他特殊节点剩余的状态、清理字段和持久化写回路径。

### 13.358 P7d75 SAM3 完整项目状态 patch 拆分（2026-09-10）

- 新增 `buildSam3StatePatch`，统一复制并合并 SAM3 的 `params`、`asset`、`source`、`status`；节点创建、参数/点选编辑、生成、上传、停止和卸载均通过该 builder 更新状态。Agent SAM3 创建提示词、普通连线 ready 状态、源视频删除和 Graph Delete 状态清理同步改用该 builder。
- `input_node_id`、`source_node_id`、Agent workflow source 和其他来源关系继续由 `buildSam3SourcePatch` 负责；请求、媒体编辑、资产构造、回调、历史/保存和双语界面行为保持，没有新增界面文字。
- 主入口新增 alias 并注入 SAM3 node、Graph Delete context；Special Node Patch Factory 加载顺序不变。
- 更新 Special Node、SAM3 context、Graph Delete、Agent quick tools 和 SAM3 合同；全部 Node 模块 `647 passed`，相关 Python 合同 `47 passed`，目标状态字段扫描、`node --check` 和 `git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的项目状态、清理字段和持久化写回路径。

### 13.359 P7d76 Translation、Tag Cart、WD14 状态 patch 拆分（2026-09-10）

- Text Node Factory 新增 Translation、Tag Cart、WD14 的完整状态 patch，统一处理参数、文本输出、输入节点关系、来源信息，以及 Translation 的 `translation_cache`、WD14 的 `last_response` 和运行状态；节点创建复用对应 builder。
- 主入口的文本编辑、翻译缓存、Tag Cart 输出、WD14 参数和请求响应、自动连线、文本边和 WD14 图像边写回均使用 state builder；Graph Delete 和 Clipboard 的删除清理、复制状态重置及边恢复同步使用 builder。
- 保留翻译与标签工作流、WD14 参数限制、历史/保存/刷新、状态提示、复制粘贴、连线、删除和双语界面行为，没有新增界面文字。
- 更新 Text Node Factory、Graph Delete、Clipboard、Agent quick tools 的 Node/Python 合同；Text Node Factory、Graph Delete、Clipboard Node 合计 `23 passed`，相关 Python 合同 `21 passed`，全量 Node `762 passed`。
- 相关 JavaScript `node --check`、目标字段边界扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化写回路径。

### 13.382 P7d99 Result 自动连接状态 patch 拆分（2026-09-10）

- Result 节点新建后的自动连接和手动 generate 边创建，统一通过 `buildResultStatusPatch` 写回状态；保留状态合并、`ready`/`reserved` 判断、Preset/Timeline/Qwen TTS 文案和 producer 关系。
- Result Node Factory 负责状态对象复制与合并，主入口继续负责自动连接、边关系、producer 字段、选择、保存和提示，没有新增界面文字。
- 更新主入口自动连接合同，确认两个入口不直接赋值 Result `status`；Result/Clipboard/Graph Delete 相关 Node `48 passed`，相关 Python 合同 `25 passed`。
- 目标 JavaScript `node --check`、Result 状态写回扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查 VLM 图像连接和其他仍直接写入的运行状态。

### 13.383 P7d100 VLM 图像连接状态 patch 拆分（2026-09-10）

- VLM 图像连接创建时，`status` 写回改用 `buildVlmRunStatusPatch`；保留图像槽位、旧边替换、`image_inputs`、静默模式和状态文本行为，没有新增界面文字。
- VLM Node Factory 负责运行状态复制与局部更新，主入口继续负责连接校验、边关系、槽位关联、选择、保存和提示。
- 增加 VLM 图像连接合同，确认 `image_inputs` 仍在主入口维护且不直接赋值 `to.status`；VLM Node 专项 `15 passed`，相关 Python 合同合计 `25 passed`。
- 目标 JavaScript `node --check` 和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查普通节点运行生命周期状态和特殊节点仍未归属的项目字段。

### 13.384 P7d101 普通节点运行状态 patch 拆分（2026-09-10）

- Run Status Controller 新增 `buildCanvasNodeStatusPatch`，统一复制、完整替换、局部合并和字段删除普通节点的 `status`；Preset/Classic 的等待、排队、失败、完成、模型缺失、上游等待和 dry-run 状态均改用该 patch。
- 保留运行状态、进度文案、模型检查、Director 校验、Result 刷新等待、Scheduler 数据、选择/渲染/保存时机和双语界面行为；VLM、Result、特殊节点继续由各自 builder 负责，没有新增界面文字。
- 更新 Run Status Controller Node/Python 合同，覆盖状态替换、局部更新、字段删除、嵌套值独立复制及普通生命周期不直接赋值节点 `status`。
- Run Status、Result、VLM 相关 Node `39 passed`；相关 Python 合同 `26 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查特殊节点剩余的项目字段、清理字段和持久化写回路径。

### 13.376 P7d93 预设特殊控制器状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildPresetSpecialControllerStatePatch`，统一生成多视角和角度打光预设的 `special_ui` 状态；初始化、Viewer 相机视图切换以及角度/灯光更新均使用该 builder。
- 保留特殊状态归一化、提示词派生、Viewer 同步、锁定判断、保存时机和双语界面行为；`params.scene_additional_prompt_2` 仍由主入口控制器负责，没有新增界面文字。
- Special Node Patch Factory 负责 `special_ui` 的默认值、已有状态、局部 patch、`kind`、`updated_at` 和嵌套复制；主入口继续负责 Viewer 消息、DOM 刷新、提示词写回与保存协调。
- 更新 Special Node Patch Factory 合同，覆盖 builder alias、三个特殊控制器写回位置、时间覆盖、嵌套独立复制和直接赋值边界；相关 Node `24 passed`，Python 合同 `7 passed`，全量 Canvas Node `682 passed`。
- 目标 JavaScript 与主入口 `node --check`、`special_ui` 直接写回扫描和 `git diff --check` 通过；仅有既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 `liveportrait_video_expression`、`ltx23_guides`、`h3_storyboard` 及其他特殊节点的状态、清理字段和持久化写回路径。

### 13.360 P7d77 Wildcards Helper、Media Browser 状态 patch 拆分（2026-09-10）

- `canvas_aux_node_factory.js` 新增 Wildcards Helper 与 Media Browser 状态 patch，统一复制并合并通配符参数、文本输出、来源、目录缓存，以及媒体浏览器状态的序列化；两类节点创建复用对应 builder。
- 主入口的通配符目录刷新、Helper 参数和输出写回、Media Browser 筛选/选中/分页状态保存均使用 state builder；Clipboard 清除复制节点目录缓存时也使用 builder。
- 保留通配符目录与个人通配符面板、媒体浏览器导入/删除/刷新、运行时媒体数据、历史/保存、渲染和双语界面行为，没有新增界面文字。
- 更新 Auxiliary Node Factory、Clipboard、Text Node Factory 的 Node/Python 合同；相关 Node `18 passed`，Studio 内置 Python 合同 `6 passed`，全量 Node `764 passed`。
- 修正 WD14 在没有 `lastResponsePatch` 时保留显式 `last_response: null` 的边界；相关 JavaScript `node --check`、状态字段边界扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化写回路径。

### 13.361 P7d78 VLM Chat chat 状态 patch 拆分（2026-09-10）

- `canvas_vlm_chat_state_factory.js` 新增 `buildVlmChatStatePatch`，统一处理 VLM Chat 的消息、待发送图片、会话编号、工具状态和更新时间；聊天回复、上下文编辑、附件增删、动作状态、运行准备、失败恢复、清空聊天及 Agent 重试均改用该 builder。
- 复制后的 VLM 节点通过同一 builder 清空聊天状态和图片关系；Clipboard 不再注入未使用的 `buildMediaBrowserStatePatch`。参数、`text`、`status` 和 `vlm_model_status` 仍由原控制器维护。
- 更新 VLM Chat State Factory、VLM chat、Clipboard 的 Node/Python 合同；全量 Node `656 passed`，相关 Python 合同 `30 passed`，相关 `node --check`、状态字段扫描和 `git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 VLM 节点的 `vlm_model_status`、参数/状态持久化和其他特殊节点剩余字段。

### 13.362 P7d79 VLM 模型状态 patch 拆分（2026-09-10）

- VLM Node Factory 新增 `buildVlmModelStatusPatch`，集中处理模型检查响应、错误、检查中、下载排队和 Custom API 同步后的 `vlm_model_status`；`applyVlmModelStatus` 保留为兼容入口并复用该 builder。
- VLM chat controller 与主入口不再直接写入 `vlm_model_status`，模型下载排队、检查准备、Custom API 同步和版本变更均通过状态 patch 更新；模型缺失提示、视觉模型状态和检查时间字段保持原行为。
- 保留现有 VLM 请求、缓存判断、缺失模型弹窗、保存/刷新和双语界面行为，没有新增界面文字；builder 对响应数组和状态 patch 做独立复制。
- 主入口新增 builder alias，并向 VLM chat controller 注入；现有页面脚本加载顺序不变。
- 更新 VLM Node Factory、VLM chat 的 Node/Python 合同；全量 Node `768 passed`，VLM 相关 Python 合同 `27 passed`。
- 相关 `node --check`、`vlm_model_status` 直接写回扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 VLM 其他持久化字段（参数、普通 `status`）以及其他特殊节点剩余的状态、清理字段和持久化写回路径。

### 13.363 P7d80 VLM 参数 patch 拆分（2026-09-10）

- VLM Node Factory 新增 `buildVlmParamsPatch`，统一处理完整 `params`、局部 `paramsPatch` 和 `deleteKeys`，并通过 `cloneRunValue` 独立复制嵌套参数；VLM 参数编辑和系统提示词模板应用改为复用该 builder。
- 聊天会话编号、提示词、Custom API、自动确认、引用消息、Agent 重试，以及 Clipboard 复制后的会话编号重置均使用参数 patch；保留原有参数合并顺序、字段删除、请求编排、复制清理和双语界面行为，没有新增界面文字。
- VLM Node Factory 负责参数默认合并、局部更新、删除字段和独立复制；VLM chat controller 继续负责消息/动作/请求协调，Clipboard 继续负责复制节点状态清理；普通运行 `status` 不在本项范围内。
- 更新 VLM Node Factory、VLM chat、Clipboard 的 Node/Python 合同，覆盖完整参数、局部参数、删除字段、系统提示词、Custom API、自动确认、引用消息、Agent 重试和复制清理。
- 全量 Node 模块测试 `769 passed`；VLM Node、VLM Chat Input、Clipboard 相关 Python 合同 `30 passed`。相关 JavaScript `node --check`、Python 合同和 `git diff --check` 通过；全量 Node 测试使用实际 `*.test.cjs`、`*.test.mjs`、`*.test.js` 文件列表执行。
- 未执行完整 Canvas Python 合同、普通运行 `status` 迁移、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查 VLM 普通 `status` 以及其他特殊节点剩余的状态、清理字段和项目持久化字段。

### 13.364 P7d81 VLM 普通运行状态 patch 拆分（2026-09-10）

- VLM Node Factory 新增 `buildVlmRunStatusPatch`，统一处理普通 `status` 的完整替换、局部更新、字段删除和嵌套值独立复制；VLM Chat 的停止、运行、成功/失败、模型卸载、Custom API 请求、上下文清理和模型缺失提示均改用该 patch。
- VLM 连线、Clipboard 复制后的状态重置，以及 Graph Delete 删除输入和断开边后的状态清理同步经过该 builder；保留原有状态、状态文本、字段保留、复制/删除行为和双语界面行为，没有新增界面文字。
- VLM Node Factory 负责普通 `status` patch 的复制、替换、合并和字段删除；VLM chat controller 继续负责请求/消息协调，主入口继续负责连线协调，Clipboard 和 Graph Delete 继续负责关系清理与保存时机。
- 更新 VLM Node Factory、VLM Chat、Clipboard、Graph Delete 的 Node/Python 合同，覆盖状态 builder 注入、VLM 生命周期、连线状态、复制重置和删除清理路径。
- 相关 VLM Node、VLM Chat、Clipboard、Graph Delete Node `109 passed`；相关 Python 合同 `32 passed`；全量 Node 模块 `771 passed`。目标 JavaScript `node --check`、Python `py_compile`、状态直接写回扫描和 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端环境验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化字段。

### 13.365 P7d82 Config Node 状态 patch 拆分（2026-09-10）

- `canvas_config_node_factory.js` 新增 `buildConfigStatePatch`，统一处理 Config Node 的完整配置替换、局部 `configPatch`/`defaultsPatch`/`valuesPatch`、字段删除、`updated_at` 更新时间以及目标 Preset/Region 绑定；节点创建、参数编辑、模型目录刷新、复制粘贴、连线重绑定、分辨率同步和删除清理均使用该 builder。
- 保留 Advanced、Styles、Models、Resolution、Detection 等 Config 行为，Preset 应用、模型目录刷新、检测区域绑定、保存/刷新、历史、复制粘贴、连线删除和双语界面行为保持；没有新增界面文字。
- Config Node Factory 负责 `config` 对象的默认合并、嵌套独立复制、局部 patch、字段删除和时间/目标字段更新；主入口继续负责配置值归一化、Preset 应用、请求和渲染；Clipboard 与 Graph Delete 只通过 builder 做复制清理和关系删除。
- Standalone `webui.py` 与 Gradio lazy assets 先加载 `canvas_config_node_factory.js`，再加载 `infinite_canvas_workbench.js`；主入口提供 `buildConfigStatePatch` alias，并向 Clipboard、Graph Delete 注入对应 builder。
- 更新 Config Node Factory 合同，修正直接赋值扫描断言，使其区分单等号写回和 `===` 比较；覆盖创建、完整/局部更新、字段删除、更新时间、目标 Preset/Region、Clipboard 和 Graph Delete 边界。
- 相关 Config、Clipboard、Graph Delete Node `26 passed`；Studio 内置 Python 合同 `7 passed`；前一阶段全量 Node 模块 `775 passed`。
- 相关 JavaScript `node --check`、Python 合同、Config 状态字段直接写回扫描和 `git diff --check` 通过；仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查其他节点的项目状态、清理字段和持久化写回路径。

### 13.366 P7d83 通用节点参数 patch 拆分（2026-09-10）

- Node Factory 新增 `buildNodeParamsPatch`，统一处理普通节点 `params` 的完整替换、局部 `paramsPatch`、字段删除和嵌套值独立复制；Node Param controller 的通用参数编辑、Classic Outpaint 选择以及 Inspector 参数写回均使用该 builder。
- 保留 Classic/Preset 常规参数类型转换、`seed_random` 即时刷新、`outpaint_selections` 同步、锁定节点、历史、保存、Inspector 事件和双语界面行为；专用节点参数入口继续使用各自 builder，没有新增界面文字。
- Node Factory 负责 `params` patch 的复制、替换、局部合并和字段删除；Node Param controller 负责输入值转换、Outpaint 派生值和事件分发；主入口只负责 alias 与依赖注入。
- 沿用现有 Node Factory 与 Node Param controller 的双入口加载顺序，不增加页面脚本；主入口提供 `buildNodeParamsPatch` alias 并注入 Node Param controller。
- 更新 Node Factory、Node Param controller 及其测试夹具，覆盖完整替换、局部更新、字段删除、嵌套独立复制、参数类型转换、Outpaint 选择和 builder 注入；控制器内不再直接写入 `node.params`。
- 相关 Node `9 passed`；Studio 内置 Python 合同 `4 passed`。
- 两个新增/修改模块及主入口分别通过 `node --check`；参数控制器直接写回扫描和 `git diff --check` 通过，仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查其他节点的状态、资产和来源字段写回路径。

### 13.367 P7d84 Result Node 状态 patch 拆分（2026-09-10）

- Result Node Factory 新增 `buildResultStatusPatch`，统一处理 Result 状态的完整替换、局部字段更新、字段删除和嵌套值独立复制；Preset、Qwen TTS、Director 分镜、刷新恢复和 dry-run 的 Result 状态写回均改用该 builder。
- Clipboard 复制 Result 节点、Graph Delete 断开 Preset/Timeline/Qwen TTS 生成边时，状态清理同步通过 Result status builder；`mergeCanvasRunStatus` 仍由调用方先生成完整状态，状态字段保留行为不变。
- 保留队列/进度、失败恢复、预览和资产处理、producer 连接、复制粘贴、生成边删除、保存/刷新和双语界面行为，没有新增界面文字。
- 主入口新增 builder alias，并向 Clipboard、Graph Delete controller 注入；Result Node Factory 的页面加载顺序不变。
- 更新 Result Node Factory、Clipboard、Graph Delete 的 Node/Python 合同；相关 Node `37 passed`，相关 Python 合同 `8 passed`，全量 Node `779 passed`。
- 相关 JavaScript `node --check`、Result 状态直接写回扫描和 `git diff --check` 通过；仅有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Result Node 剩余的资产、来源和项目持久化字段写回路径。

### 13.368 P7d85 Result Node 资产 patch 拆分（2026-09-10）

- Result Node Factory 新增 `buildResultAssetPatch`，统一处理 Result 的 `asset`、`assets` 和 `selected_asset_index` 写回，并对资产集合做独立复制；Batch Any、Qwen TTS、普通 Canvas 运行结果、Timeline Result/Compare 和 Result 资产选择均改用该 builder。
- 保留多资产选择、批量结果追加、Qwen TTS 与普通生成结果的资产同步、Timeline 比较结果、预览流切换、缓存物化、保存/刷新和双语界面行为，没有新增界面文字。
- Result Node Factory 负责资产字段的复制和字段映射；主入口继续负责响应解析、项目资产索引同步、预览清理和保存时机；Result 的 `preview`、`source` 及其他项目字段暂未纳入本项。
- 更新 Result Node Factory 合同、Result Preview/Asset Renderer 合同和 XYZ 相关合同；修正直接赋值扫描对 `===` 比较的误判，并同步当前 Batch Any job factory 调用边界。
- 相关 Result/Preview/Asset Renderer/Batch Any Node `30 passed`；相关 Python 合同 `17 passed`。Result Node Factory、Batch Any Node Factory、Batch Job Factory、主入口 `node --check`，两份 Python 合同 `py_compile` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续处理 Result Node 的 `preview`、`source` 和项目持久化字段写回路径。

### 13.369 P7d86 Result Node 预览 patch 拆分（2026-09-10）

- Result Node Factory 新增 `buildResultPreviewPatch`，统一处理 Result 的 `preview`、`preview_frames` 和 `preview_step_key`；预览 stream controller 只负责帧去重、批次切换和播放状态计算，项目字段写回通过注入的 builder 完成。
- Qwen TTS、普通 Canvas 运行结果、结果复用、最终资产到达和刷新失败清理路径均改用预览 patch；Timeline Result patch 同步复用该 builder，预览流播放、最近帧显示、最终资产切换和清理行为保持。
- Result Node Factory 负责预览字段的复制、数组独立化、字段名转换和显式清空；预览 controller 继续负责内存中的播放帧和 DOM 更新，主入口继续负责运行协调、停止播放器、保存和重绘时机，没有新增界面文字。
- 更新 Result Node Factory、Result Preview controller、主入口及相关 Python/Node 合同，覆盖预览帧独立复制、步骤批次重置、显式清空、builder 注入和 Result 预览字段直接写回边界。
- 相关 Result Node Factory/Result Preview Node `18 passed`；相关 Python 合同 `14 passed`；全量 Node 模块 `781 passed`。Result Node Factory、Result Preview、主入口 `node --check`，相关 Python `py_compile` 和 `git diff --check` 通过。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续处理 Result Node 的 `source` 和项目持久化字段写回路径。

### 13.370 P7d87 Result Node source 与存储清理 patch 拆分（2026-09-10）

- Result Node Factory 的 source/producer patch 现在会深度复制已有嵌套字段；Timeline Result 的 `sourcePatch` 统一经过 `buildResultSourcePatch`。`project_store.js` 在压缩项目时同步移除临时 `preview_frames` 和 `preview_step_key`。
- 保留 Result source/producer、刷新指纹、Timeline 输出、预览保留和存储行为；没有新增界面文字。Result Factory 负责 source/producer 复制合并，项目 store 负责临时预览字段清理，主入口继续负责运行和保存协调。
- 更新 Result Node Factory 与 Project Store Node 合同，覆盖 source/producer 嵌套对象独立复制、预览帧/步骤标识清理、原项目对象不被修改；相关 Result、Preview、Timeline、Asset Renderer、Project Store Node `33 passed`。
- 相关 JavaScript `node --check`、Python `py_compile` 和 `git diff --check` 通过；相关 Python 合同 `6 passed`，另有 1 个既有 `assetNodeMediaEditRange` alias 旧断言失败。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Result 的批次关联、标题/布局和其他仍直接写入的项目字段，区分运行结果元数据与界面临时状态。

### 13.371 P7d88 Result Node 批次元数据 patch 拆分（2026-09-10）

- Result Node Factory 新增 `buildResultBatchMetadataPatch`，统一处理 Batch Any Result 的标题、批次任务/节点/项目编号、项目名称、索引和 `grid_role`；Batch Any 运行流程改用该 patch 更新 Result。
- 保留 Batch Any 的逐项运行、资产追加、项目选择、网格角色和停止策略；没有新增界面文字。Result Factory 负责字段映射和索引归一，Batch Any 主流程继续负责运行请求、资产集合和 job 状态。
- 更新 Result Node Factory、Batch Any、XYZ 合同，覆盖批次字段写回、索引转换、旧节点不变和主入口不再逐字段直接写入；相关 Node `22 passed`，Python 合同 `12 passed`。
- 相关 JavaScript `node --check`、Python `py_compile`、批次字段扫描和 `git diff --check` 通过；未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续处理 Result 的标题、位置尺寸、折叠状态及其他仍直接写入的项目字段，区分持久化元数据和布局协调。

### 13.372 P7d89 Result Node 布局 patch 拆分（2026-09-10）

- Result Node Factory 新增 `buildResultLayoutPatch`，统一生成 Result 标题、位置、尺寸和折叠状态 patch；Result 图片替换、Agent 视频蒙版流程、Qwen TTS/普通 Preset 的结果展开，以及 Result 尺寸自适应均通过该 builder 更新。
- 保持标题更新、位置计算、尺寸下限、Agent workflow 分组、结果复用、图片替换和双语界面行为；Node Layout 继续负责尺寸计算，主入口继续负责位置计算、界面协调和保存时机，没有新增界面文字。
- Result Node Factory 负责布局字段映射、标题文本和折叠值；Node Layout 负责尺寸判断并调用 layout patch；主入口负责位置/状态计算和写回时机。
- 沿用 Result Factory 与 Node Layout 的现有加载顺序；主入口增加 builder alias，并将其注入 Node Layout。
- 更新 Result Node Factory、Node Layout 和主入口合同，覆盖标题/位置/尺寸/折叠字段、Result 图片替换、Agent 视频蒙版位置、结果展开状态和尺寸写回边界。
- 相关 Node `28 passed`；相关 Python 合同 `7 passed`。Result Factory、Node Layout 和主入口 `node --check` 通过；Result 目标字段直接写回扫描无结果；`git diff --check` 通过，仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Result 其他仍直接写入的项目字段，以及特殊节点的清理和持久化路径。

### 13.373 P7d90 Result Node 手动替换与 Clipboard producer patch 拆分（2026-09-10）

- Result 图片手动替换时，`asset`、`mask` 和 `status` 改由 Result Node Factory 的 patch 生成；Clipboard 复制清理和 generate 关系恢复改用 `buildResultProducerPatch`。
- 保留图片节点上传、Result 标题/source、复制后的运行状态、generate 边重建、原节点数据和双语界面行为，没有新增界面文字。主入口继续负责文件读取、资产构造、状态合并、保存和界面协调。
- 更新 Result Node Factory、Clipboard 和主入口合同，覆盖手动替换资产/状态、producer 清理、generate 关系重建和嵌套数据独立复制；相关 Node `30 passed`，Python 合同 `7 passed`。
- 相关 JavaScript `node --check`、Canvas Node 模块套件 `673 passed`、Result 字段写回扫描和 `git diff --check` 通过；后者只有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查其他特殊节点的清理、状态字段和项目持久化写回路径。

### 13.374 P7d91 Qwen TTS 音频关系状态 patch 拆分（2026-09-10）

- Qwen TTS 音频槽位和状态在主入口创建音频边、Clipboard 粘贴恢复、Graph Delete 删除来源节点及断开音频边时，统一使用 `buildQwenTtsStatePatch`。
- 保留音频槽位选择、重复槽位替换、来源删除后的空槽、状态文本、其他 Qwen TTS 状态字段、保存和双语界面行为，没有新增界面文字。Special Node Patch Factory 负责 `audio_inputs` 与 `status` 的复制合并。
- 更新 Qwen TTS、Clipboard 和 Graph Delete 合同，覆盖音频边重建、来源删除、边断开、状态保留和直接写回边界；相关 Node `28 passed`，Python 合同 `7 passed`。
- 相关 JavaScript `node --check`、Canvas Node 模块套件 `676 passed`、额外 Result/Batch/Layout Python 合同 `10 passed`、Qwen 音频字段直接写回扫描和 `git diff --check` 通过；后者只有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
- 下一项：继续检查 Pose Studio、Gaussian Studio 和 LivePortrait 的复制清理及特殊状态字段写回路径。

### 13.375 P7d92 Pose Studio、Gaussian Studio、LivePortrait 复制清理 patch 拆分（2026-09-10）

- Special Node Patch Factory 的 Pose Studio、Gaussian Studio、LivePortrait state builder 支持 `statePatch` 覆盖并独立复制嵌套状态；Clipboard 粘贴时通过对应 builder 清理参考资产、源节点和参考节点字段。
- 保留三个节点的输出资产、编辑数据、Gaussian 相机/PLY 数据、LivePortrait 参数、复制后的状态提示、输入边重建、保存和双语界面行为；没有新增界面文字。主入口仅增加 builder alias 与 Clipboard 依赖注入。
- 更新 Special Node Patch Factory、Clipboard 和主入口合同，覆盖 `statePatch` 覆盖、嵌套对象独立复制、三个节点复制清理和 builder 注入；新增三个节点的 Clipboard Node 用例。
 - Special Node Factory 与 Clipboard 相关 Node `32 passed`；全量 Canvas Node 模块 `678 passed`；相关 Python 合同 `8 passed`。目标模块和主入口 `node --check`、目标字段扫描及 `git diff --check` 通过，仅有工作区既有 LF/CRLF 转换提示。
 - 未执行完整 Canvas Python 合同、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
 - 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化写回路径。

### 13.377 P7d94 LivePortrait Video 表情状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildLivePortraitVideoExpressionStatePatch`，统一处理 `liveportrait_video_expression` 的默认状态、已有状态、局部 patch、`source_asset` 和 `updated_at`；LivePortrait Video 编辑器的草稿更新和确认保存均复用该 builder。
- 保留表情参数、确认表达式、源视频首帧尺寸、人脸选择、源/参考人脸框、预览编辑、状态提示、保存和双语界面行为；没有新增界面文字。Clipboard 复制时清理源视频关系、首帧缓存、人脸选择、人脸框和草稿，同时保留已确认表达式与参数。
- Special Node Patch Factory 负责内部状态的默认合并、局部覆盖和嵌套资产复制；主入口继续负责编辑器回调、`params.scene_additional_prompt_2` 和顶层运行状态；Clipboard 继续负责复制状态清理与节点编号前的归一化。
- 更新 Special Node Patch Factory、Clipboard 和主入口合同，覆盖 builder alias、两处编辑器写回、复制清理、确认表达式保留、资产独立复制以及状态字段直接写回边界。
- 相关 Node `35 passed`；全量 Canvas Node `681 passed`；相关 Python 合同 `10 passed`。
- 目标 JavaScript 与主入口 `node --check`、LivePortrait Video 状态字段直接写回扫描和 `git diff --check` 通过；仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
 - 下一项：继续处理 `ltx23_guides`、`h3_storyboard` 及其他特殊节点的状态、清理字段和项目持久化写回路径。

### 13.378 P7d95 LTX guide 状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildLtx23GuidesStatePatch`，统一处理 `ltx23_guides` 的默认状态、已有配置、局部 patch 和 `updated_at`；LTX 关键帧/续写引导编辑器的确认保存复用该 builder。
- 保留 keyframes 与 `video_extent` 模式、配置归一化、`scene_additional_prompt` JSON、首帧/中间/尾帧与五组引导参数、状态提示、保存和双语界面行为；没有新增界面文字。`ltx_guide_editor.js` 继续负责数值归一化和编辑器界面。
- Special Node Patch Factory 负责内部 guide 状态的默认合并、局部覆盖和嵌套数组复制；主入口继续负责提示词参数、顶层运行状态、编辑器回调和保存协调。
- 更新 Special Node Patch Factory 与主入口合同，覆盖 builder alias、编辑器确认写回、`updated_at`、嵌套独立复制以及状态字段直接写回边界。
- 相关 Node `26 passed`；全量 Canvas Node `682 passed`；专项 Python 合同 `9 passed`。LTX 现有工作流合同为 `58 passed, 2 failed`，两条失败属于未修改示例 workflow 的旧节点编号断言。
- 目标 JavaScript 与主入口 `node --check`、LTX guide 状态字段直接写回扫描和 `git diff --check` 通过；仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端环境验收；未提交 Git。
 - 下一项：继续处理 `h3_storyboard` 及其他特殊节点的状态、清理字段和项目持久化写回路径。

### 13.379 P7d96 H3 storyboard 状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildH3StoryboardStatePatch`，统一处理 `h3_storyboard` 的默认状态、已有状态、局部 patch、镜头数组和 `updated_at`；MiniMax H3 分镜编辑器确认保存复用该 builder。
- 保留 T2VA/I2VA/FL2VA/L2VA/Ref2VA 模式、镜头时间轴、镜头内容、整体环境声、非叙事音乐、主体定义、摘要、参考保留分析、LLM 优化回调、状态提示、保存和双语界面行为；没有新增界面文字。`minimax_h3_storyboard_editor.js` 继续负责状态归一化、提示词生成、LLM 编辑与校验。
- Special Node Patch Factory 负责分镜状态的默认合并、局部覆盖和嵌套镜头数组复制；主入口继续负责媒体引用、请求协调、`params.prompt`、`prompt_snapshot` 和顶层运行状态。
- 更新 Special Node Patch Factory、主入口和 H3 编辑器合同，覆盖 builder alias、确认回调的 `prompt_snapshot`、镜头数组独立复制以及状态字段直接写回边界。
- 相关 Node `22 passed`；全量 Canvas Node `683 passed`；Special Node Python 合同 `10 passed`；H3 编辑器 Python 合同 `41 passed`。
- 目标 JavaScript 与主入口 `node --check`、H3 storyboard 状态字段直接写回扫描和 `git diff --check` 通过；仅有工作区既有的 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端验收；未提交 Git。
- 下一项：继续检查其他特殊节点剩余的状态、清理字段和项目持久化写回路径。

### 13.380 P7d97 特殊编辑器顶层 params patch 拆分（2026-09-10）

- LivePortrait Video、LTX guide 和 MiniMax H3 storyboard 编辑器确认保存时，顶层 `params` 改用现有 `buildNodeParamsPatch` 的局部 patch；保留 `scene_additional_prompt_2`、`scene_additional_prompt` 和 `prompt` 的原有写回行为。
- 三个编辑器继续负责响应整理、内部状态、提示词校验、状态提示和保存协调；Node Factory 负责参数对象复制与局部字段合并，没有新增界面文字。
- 更新特殊节点、H3 storyboard 和 LTX guide 合同，确认确认回调使用 `buildNodeParamsPatch`，不直接赋值 `current.params`。
- 验证：Special Node Context 合同 `11 passed`；H3 storyboard 合同 `41 passed`；LTX guide 相关测试 `49 passed, 2 deselected`；Node Factory 合同 `2 passed`；Node 专项 `32 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过。
- 已知未处理：LTX workflow 中原有的 2 条旧节点编号断言仍失败，未由本项引入；真实 Studio、浏览器、后端/API、GPU、安装版和远端验收未执行，未提交 Git。
- 下一项：继续检查其他特殊节点剩余的运行状态、连接字段和项目持久化写回路径。

### 13.381 P7d98 特殊节点状态 patch 拆分（2026-09-10）

- Special Node Patch Factory 新增 `buildSpecialNodeStatusPatch`，统一复制、完整替换、局部合并和字段删除特殊节点的顶层 `status`；Pose Studio、Gaussian Studio、LivePortrait 的连接处理及 LivePortrait Video/LTX/H3 编辑器确认保存均复用该 builder。
- 保留连接关系、Result 桥接、编辑器保存时机、状态附加字段、复制粘贴清理、删除来源后的提示、保存和双语界面行为，没有新增界面文字。主入口继续负责连接和编辑器协调，Clipboard/Graph Delete 继续负责关系清理。
- 更新 Special Node Factory、主入口、Clipboard、Graph Delete 及对应合同，覆盖 builder alias、特殊状态写回、复制清理和删除关系路径；Node `53 passed`，相关 Python 合同 `15 passed`。
- 目标 JavaScript `node --check`、特殊状态字段直接写回扫描和 `git diff --check` 通过；后者只有工作区既有 LF/CRLF 转换提示。
- 未执行完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他仍直接写入的运行状态、Result 自动连接状态和特殊节点项目持久化字段。

### 13.385 P7d102 VLM image_inputs patch 迁移（2026-09-10）

- VLM Node Factory 新增 `buildVlmImageInputsPatch`，统一处理 `image_inputs` 的完整替换、局部槽位更新、字段删除和独立复制；主入口自动连接、手动连接、断开和替换路径，以及 Clipboard、Graph Delete 的复制清理和关系恢复均改用该 builder。
- 保留 VLM 图像槽位选择、聊天模式限制、旧边替换、媒体连接状态、复制后的输入清理、来源删除和边断开行为；没有新增界面文字。连接校验、边关系、选择状态、保存和界面提示仍由原控制器负责。
- 更新 VLM Node Factory、Clipboard、Graph Delete 与主入口合同，覆盖 builder alias、两个关系控制器的依赖注入、完整替换/局部更新/删除和直接写回边界。
- 测试：VLM Node Factory `16 passed`；Clipboard `16 passed`；Graph Delete `16 passed`；相关 Python 合同 `6 passed`。目标 JavaScript `node --check`、直接写回扫描和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查 VLM chat/pending images 及其他仍直接写入的项目字段和持久化路径。

### 13.386 P7d103 VLM chat 状态入口迁移（2026-09-10）

- VLM chat controller 对外提供 `applyVlmChatState`；主入口 Agent 重试路径改用该接口，消息、pending images、会话编号、工具状态和更新时间继续由 Chat State Factory 生成并写回。
- 保留 Agent 重试上下文、pending images、提示词恢复、运行调度、历史记录、界面刷新和双语行为，没有新增界面文字。主入口继续负责重试协调、参数更新和运行调度。
- 更新 VLM chat 与主入口合同，确认 controller 转发存在，重试路径不再直接写入 `liveNode.chat`；VLM chat Node `75 passed`，相关 Python 合同 `26 passed`，目标 JavaScript `node --check` 和直接写回扫描通过。
- 未执行：完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU 生成、安装版和远端验收；未提交 Git。
- 下一项：继续检查 VLM chat 持久化压缩及其他仍直接维护的项目字段。

### 13.387 P7d104 VLM chat 持久化压缩 patch 迁移（2026-09-10）

- VLM chat state factory 新增 `buildVlmChatStoragePatch`，统一复制 chat 状态并处理 `pending_images` 和消息图片；Project Store 通过注入的 builder 调用，保留通用资产压缩规则。
- 浏览器缓存、后端保存、模板保存和历史快照继续使用同一套压缩入口；消息、会话、工具状态、图片引用及原项目对象保持不变，没有新增界面文字。
- 更新 VLM chat、Project Store/Asset Nodes 合同，确认 builder alias、主入口注入和 Project Store 的直接 chat 字段访问边界。
- 测试：VLM chat 与 Project Store Node `78 passed`；新增存储 patch 合同 `1 passed`；VLM chat state、Project Persistence 和 VLM Node 相关 Python 合同 `4 passed`。
- 验证：目标 JavaScript `node --check`、存储 patch 直接写回扫描和 `git diff --check` 通过；Project Store/Asset Nodes 合同中的 `assetNodeMediaEditRange` alias 旧断言仍失败，属于既有问题。
- 未执行：完整 Canvas Python 合同、真实 Studio、真实浏览器、真实后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他特殊节点的项目持久化字段和主入口临时状态。

### 13.388 P7d105 Inspector 通用节点字段 patch 拆分（2026-09-11）

- Node Factory 新增 `buildNodeFieldPatch`；Inspector 通用节点字段事件和写回移入 Node Param Controller，主入口只保留 alias 与依赖注入。
- 保留节点标题编辑、锁定节点恢复、历史记录、保存、节点/连线刷新和双语提示行为；字段 patch 不修改原节点，非法字段名不生成 patch。
- 更新 Node Factory、Node Param Controller、主入口及测试夹具/合同，确认 `data-inspector-node-field` 事件由 Node Param Controller 负责，主文件不再直接执行动态节点字段赋值。
- 验证：Node 专项合计 `24 passed`；Python 合同合计 `12 passed`；目标 JavaScript `node --check`、限定写回扫描和 `git diff --check` 通过，仅有既有 LF/CRLF 提示。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Agent prompt target 临时对象和其他 controller 的未归属对象字段写回，区分运行 payload、测试返回对象与项目/节点持久化字段。

### 13.389 P7d106 媒体 metadata 写回 patch 迁移（2026-09-11）

- `handleNodeMediaMetadataLoaded` 的视频/音频 metadata 写回统一使用 Media Node Factory 和 Result Factory patch；普通媒体节点与 Result 多资产选中项分别处理，主入口保留字段计算、媒体定位和渲染副作用。
- Agent prompt target 已确认属于 planner 请求临时对象，不进入项目或节点持久化状态，因此没有为它增加 patch 层。
- 更新 Result Factory、主入口和相关模块合同；同步一条媒体节点合同的旧 Project nodes 断言。
- 验证：Result、Asset、Media Node 模块合计 `31 passed`；相关 Python 合同合计 `11 passed`；目标 JavaScript `node --check`、直接写回扫描和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查其他未归属的节点对象字段和项目持久化字段，同时评估将入口 wiring 集中到独立 bootstrap/context 模块的可行性。

### 13.390 P7d107 交互 controller runtime context 初始化（2026-09-11）

- `canvas_runtime_context.js` 统一创建 Selection、Graph Delete、Clipboard controller；主入口改为读取 context alias，Factory 依赖从 `getFactoryContext()` 获取。
- 保留选择、删除、复制粘贴、历史、渲染、保存和双语行为；没有新增界面文字。相关 controller 仍负责交互副作用和状态 patch，主入口继续提供项目与 UI 回调。
- 更新 runtime context、Factory context、主入口及合同，覆盖 controller 创建、alias 暴露、加载顺序和旧 Status 边界断言清理。
- 验证：runtime context Node `2 passed`；Selection、Graph Delete、Clipboard Node `4/20/20 passed`；相关 Python 合同 `12 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续迁移后续交互 controller 的初始化，并使用延迟 alias 保持初始化顺序。

### 13.391 P7d108 交互 controller bootstrap context 迁移（2026-09-11）

- runtime context 新增 Group Interaction、Run Panels、Node Resize、Node Drag、Pan 五个 controller 的创建与 alias；主入口删除对应实例化区块。
- 保留分组交互、运行面板、节点拖动/缩放、画布平移、吸附、锁定提示、历史、Minimap、连线刷新、保存和双语行为；没有新增界面文字。
- runtime context 负责依赖组装和选择状态回调，各 controller 继续负责指针生命周期、面板协调和渲染调度；主入口只保留运行时回调提供。
- 将 `isNodeDragging`、`isGroupDragging`、运行面板 alias 等提前引用改为调用时读取，避免初始化阶段访问未完成的绑定。
- 验证：相关 Python 合同 `21 passed`；runtime context、Group Interaction、Run Panels、Node Resize、Node Drag、Pan Node 合计 `16 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过；主文件降至 `29,731` 行。
- 未执行完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序继续迁移 Marquee、Viewport Pointer、Connection 及相邻画布交互 controller。

### 13.392 P7d109 输入交互 controller context 迁移（2026-09-11）

- 新增 `canvas_input_context.js`，统一创建 Viewport Wheel、Viewport Drop、Viewport Context、Keyboard、Document Paste、Input Handle、Note Tail、Edge Interaction 八个 controller；主入口只读取 context alias。
- 保留滚轮缩放、拖放导入、空白画布菜单、快捷键、图片粘贴、输入端重连、Note 指引点拖动、边交互和双语行为；没有新增界面文字。
- Input Context 负责初始化、依赖传递和 alias 导出，各 controller 继续负责事件生命周期；主入口保留项目状态、UI 回调和事件绑定。
- 两套页面新增 Input Context 加载项，放在八个 controller 之后、主入口之前。
- 更新八个 controller 合同和 Input Context 合同，覆盖创建顺序、共享回调、Note Tail 到 Edge Interaction 的委托以及两套页面加载顺序。
- 验证：相关 Node 专项合计 `31 passed`；Python 合同合计 `24 passed`；Input Context 与主入口 `node --check`、相关文件 `git diff --check` 通过；主文件为 `29,637` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续迁移 Text Control Context、Compare Drag、Text Control Pointer 以及后续 Timeline 交互 controller。

### 13.393 P7d110 Text Control/Compare 输入 context 迁移（2026-09-11）

- `canvas_input_context.js` 现在统一创建 Viewport、Keyboard、Paste、Input Handle、Note Tail、Edge Interaction 以及 Text Control Context、Compare Drag、Text Control Pointer 共 11 个输入交互 controller；主入口只读取 context alias。
- 保留文本菜单、文本选择、Compare 分割线、滚轮、拖放、快捷键、连接、边交互、历史、保存和双语行为，没有新增界面文字。
- 更新 Text Control Pointer Python 合同，使 `getEditableTextControl` 的边界检查落在 Input Context；主入口仍只负责 context 创建和页面事件绑定。
- 验证：相关 Node 专项 `41 passed`；Python 合同 `26 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过。
- 规模观察：主入口当前 `29,618` 行，较上一条 `29,637` 行减少 `19` 行；相对 Git 基线 `30,074` 行减少 `455` 行。局部迁移仍会增加依赖表和公开 alias，Runtime Context 当前 `1,301` 行，下一步先整理 bootstrap/context wiring，控制新增集中代码。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：整理 Runtime/Input Context 的依赖入口和重复 alias，然后继续 Timeline DOM、Playhead、Preview controller。

### 13.394 P7d111 Timeline DOM/Playhead/Preview context 迁移（2026-09-11）

- 新增 `canvas_timeline_context.js`，统一创建 Timeline DOM、Playhead、Preview controller；主入口只保留 Context 创建、业务回调和 alias 读取。
- 保留轨道/剪辑 DOM 刷新、关键帧标记、Playhead 拖动、Preview 拖动、裁剪/缩放/旋转、Mask 几何同步、历史、保存和双语行为，没有新增界面文字。
- 两套页面将 Timeline Context 放在三个依赖模块之后、主入口之前；相关 controller 合同改为检查新的 Context 边界。
- 验证：Timeline、Runtime Context、Input Context Node 专项合计 `47 passed`；对应 Python 合同合计 `30 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过；主文件当前 `29,608` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序继续迁移 Timeline Playback、Keyframe、Clip controller。

### 13.395 P7d112 Timeline Playback context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Playback controller 的创建和 alias；主入口保留 playback wrapper，删除直接实例化区块。
- 保留播放/暂停、从头播放、循环、结束停止、Playhead/Preview 刷新、视频同步、保存和双语行为，没有新增界面文字。
- 调整两套页面加载顺序，使 Playback 模块先于 Timeline Context，Context 先于主入口；更新 Context 与 Playback 合同。
- 验证：Timeline Context、Playback、DOM、Playhead、Preview Node 专项 `12 passed`；相关 Python 合同 `10 passed`；目标 JavaScript `node --check` 和 `git diff --check` 通过；主文件当前 `29,601` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序继续迁移 Timeline Keyframe、Clip controller。

### 13.396 P7d113 Timeline Keyframe/Clip context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Keyframe、Clip controller 的创建与 alias；主入口删除两组直接实例化，仅从 Context 读取拖动方法和状态 alias。
- 保留关键帧拖动、剪辑移动、起止裁剪、轨道切换、吸附、媒体范围限制、Playhead/Preview/轨道 DOM 刷新、连线刷新、历史、保存、锁定限制和双语行为，没有新增界面文字。
- Timeline Context 负责两组 controller 的依赖组装和初始化顺序；Keyframe、Clip controller 继续负责指针生命周期、patch 写回、刷新和保存；主入口只保留业务回调、状态读取和事件绑定。
- 两套页面将 Keyframe、Clip 模块放到 Timeline Context 之前，Context 放到主入口之前；修复 `modules/ui_gradio_extensions.py` Timeline 路径的误缩进，并通过 Python 语法编译。
- 验证：Timeline 全套 Node 专项 `43 passed`；Context、Keyframe、Clip Python 合同 `6 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,556` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序继续迁移 Timeline Mask controller，并评估相邻 Director Timeline Drag、Timeline Frame 的 Context 边界。

### 13.397 P7d114 Timeline Mask context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Mask controller 的创建与 alias；主入口删除 Mask 直接实例化，仅从 Context 读取锚点拖动、画笔绘制和指针状态 alias。
- 保留画笔点添加、闭合路径、锚点拖动、遮罩导出、预览视频同步、遮罩预览刷新、历史、保存、锁定限制和双语行为，没有新增界面文字。
- Timeline Context 负责 Mask controller 的依赖组装和初始化顺序；Mask controller 继续负责指针生命周期、遮罩 patch、导出和刷新；主入口只保留状态读取、业务回调和事件绑定。
- 两套页面将 Timeline Mask 模块放到 Timeline Context 之前，Context 放到主入口之前；更新 Context 与 Mask 合同。
- 验证：全套 Timeline Node 专项 `43 passed`；Context、Keyframe、Clip、Mask Python 合同 `8 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,541` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序继续评估 Director Timeline Drag、Timeline Frame 及其相邻 Timeline controller 的 Context 边界。

### 13.398 P7d115 Director Timeline Drag context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Director Timeline Drag controller 的创建与 alias；主入口删除直接实例化，仅从 Context 读取预览拖动和状态 alias。
- 保留 Director shot 移动、起止裁剪、相邻片段边界、状态更新、Inspector 刷新、历史、保存、锁定限制和双语行为，没有新增界面文字。
- Timeline Context 负责 Director Timeline Drag 的依赖组装和初始化顺序；controller 继续负责指针生命周期、时间边界计算和状态 patch；主入口只保留状态读取、业务回调和事件绑定。
- 两套页面将 Director Timeline Drag 模块放到 Timeline Context 之前，Context 放到主入口之前；Timeline Frame 暂未调整。
- 验证：全套 Timeline Node 专项及 Director Timeline Drag Node 专项 `46 passed`；Context、Keyframe、Clip、Mask、Director Python 合同 `10 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,532` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序评估 Timeline Frame controller；它依赖后面的 Backend Request controller，需要使用延迟回调保持初始化顺序。

### 13.399 P7d116 Timeline Frame context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Frame controller 的创建与 alias；主入口删除 Frame 直接实例化，保留现有 Frame wrapper，并在 Context 创建后写入 Frame controller。
- 保留活动视觉剪辑筛选、视频/图片帧准备、Canvas 预览帧导出、遮罩合成、几何探针、帧差异比较和热图生成，没有新增界面文字。
- Timeline Context 负责 Frame controller 的依赖组装和初始化顺序；Frame controller 继续负责媒体准备、Canvas 绘制和差异计算；主入口保留 Frame wrapper 与后续 Render/Compare 调用方式。
- 两套页面将 Timeline Frame 模块放到 Director Timeline Drag 之后、Timeline Context 之前；Frame 不直接调用 Backend Request。
- 验证：全套 Timeline Node 专项及 Director Timeline Drag Node 专项 `46 passed`；Context、Keyframe、Clip、Mask、Director、Frame Python 合同 `11 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,527` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序评估 Timeline Render controller；它依赖项目写回、Result Factory 和 Backend Request，需要继续检查延迟回调边界。

### 13.400 P7d117 Timeline Render context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Render controller 的创建与 alias；主入口删除 Render 直接实例化，保留现有 Render wrapper，并在 Context 创建后写入 Render controller。
- 保留 Timeline Result 节点创建/复用、项目节点与连线写回、Result Factory patch、预览帧生成、Backend Request、运行指纹、Gallery 刷新、状态提示、历史和双语行为，没有新增界面文字。
- Timeline Context 负责 Render controller 的依赖组装和初始化顺序；Render controller 继续负责 Result 创建、渲染请求和状态 patch；主入口通过延迟回调读取后面创建的 Backend Request。
- 两套页面将 Timeline Render 模块放到 Timeline Frame 之后、Timeline Context 之前；更新 Context 与 Render 合同。
- 验证：全套 Timeline Node 专项及 Director Timeline Drag Node 专项 `46 passed`；Context、Keyframe、Clip、Mask、Director、Frame、Render Python 合同 `12 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,518` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序评估 Timeline Compare controller，并检查它与已迁移 Frame、Render alias 的依赖边界。

### 13.401 P7d118 Timeline Compare context 迁移（2026-09-11）

- `canvas_timeline_context.js` 新增 Timeline Compare controller 的创建与 alias；主入口删除 Compare 直接实例化，保留现有 Compare wrapper，并在 Context 创建后写入 Compare controller。
- 保留当前帧与 Backend 帧比较、分层比较、几何探针、Compare Result 创建/复用、Result Factory patch、差异热图、调试信息写回、Inspector 刷新、状态提示和双语行为，没有新增界面文字。
- Timeline Context 负责 Compare controller 的依赖组装和初始化顺序；Compare controller 继续负责比较流程、Result 写回和调试数据；主入口通过延迟回调读取后面的 Backend Request。
- 两套页面将 Timeline Compare 模块放到 Frame、Render 之后、Timeline Context 之前；更新 Context 与 Compare 合同。
- 验证：全套 Timeline Node 专项及 Director Timeline Drag Node 专项 `46 passed`；Context、Keyframe、Clip、Mask、Director、Frame、Render、Compare Python 合同 `13 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `29,494` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序评估 Timeline Param、Command controller，注意二者存在相互调用和主入口状态 wrapper 依赖。

### 13.402 P7d119 Timeline Param、Command context 迁移（2026-09-11）

- `canvas_timeline_context.js` 现在创建 Timeline Param 和 Timeline Command controller，并返回 controller 与公开 alias；主入口删除两个 controller 的直接实例化，保留 wrapper 和 Context 接收。
- 保留 Timeline 参数/剪辑参数编辑、Inspector 事件、参数重置、剪辑选择、轨道移动、关键帧与时长/尺寸命令、剪辑菜单、历史、保存、遮罩几何处理和双语行为，没有新增界面文字。
- Context 负责依赖组装和初始化顺序；Param 负责参数写回与字段分发；Command 负责选择、点击分发和时间线命令；Command 调用 Param 使用延迟 wrapper。
- 两套页面将 Timeline Param、Command 放到 Timeline Context 之前，Context 仍早于主入口；更新 Context、Param、Command 合同。
- 验证：Timeline Context、Param、Command Node 专项 `14 passed`；Context、Param、Command Python 合同 `7 passed`；主入口和 Context `node --check` 通过；`ui_gradio_extensions.py`、`webui.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `28,150` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按 P7 顺序评估 Graph Delete、Resolution Drag 及相邻图编辑 controller 的 Context 边界，先确认节点/连线写回和历史依赖。

### 13.403 P7d120 Resolution Drag context 迁移（2026-09-11）

- `canvas_runtime_context.js` 的 Interaction Context 新增 Resolution Drag controller 创建与 alias；主入口删除 Resolution Drag 直接实例化，保留事件调用入口并从 Runtime Context 读取 controller。
- 保留分辨率拖拽的指针过滤、比例锁定、量化、范围限制、随机比例/非交互模式限制、预览 DOM 更新、Preset 同步、结束保存、取消拖拽和双语行为，没有新增界面文字。
- Runtime Interaction Context 负责依赖组装；Resolution Drag controller 负责坐标计算、config 更新和指针生命周期；Config Node Factory 继续提供 `buildConfigStatePatch`。
- 两套页面将 Resolution Drag 模块放到 Runtime Context 之前，Runtime Context 仍早于主入口；更新 Runtime Context、Resolution Drag 合同。
- 验证：Runtime Context、Resolution Drag 及 Timeline 相关 Node 专项合计 `21 passed`；相关 Python 合同 `11 passed`；主入口和 Runtime Context `node --check` 通过；`ui_gradio_extensions.py`、`webui.py` `py_compile` 通过；相关 `git diff --check` 通过；主文件当前 `28,150` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续评估主入口中仍直接创建的 Media Browser Drag controller，并检查它与 Input Context、Viewport Drop 的依赖边界。

### 13.404 P7d121 Media Browser Drag context 迁移（2026-09-11）

- `canvas_input_context.js` 现在创建 Media Browser Drag controller，并返回 payload、节点拖拽事件和清理状态 alias；主入口删除 Media Browser Drag 直接实例化，Viewport Drop 通过 Input Context 内部委托读取 payload 和清理状态。
- 保留媒体浏览器拖拽 payload、MIME、外部拖拽读取、内部 fallback、拖拽样式清理、drop-target 清理及 drop 优先级，没有新增界面文字。
- Input Context 负责 Media Browser Drag 与 Viewport Drop 的初始化顺序和 payload 委托；两个 controller 保持各自的拖拽生命周期与 drop 分发职责。
- 两套页面将 Media Browser Drag 放到 Input Context 之前，Input Context 仍早于主入口；相关合同已更新。
- 验证：相关 Python 合同 `9 passed`；Input Context、Media Browser Drag、Viewport Drop Node 专项 `10 passed`；主入口及三个相关模块 `node --check` 通过；相关 `git diff --check` 通过；当前主文件为 `29,453` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按入口初始化顺序迁移 Backend Request bootstrap，并保留 Timeline Context 对后置 Backend Request 的延迟调用边界。

### 13.405 P7d122 Backend Request、Qwen TTS Presets context 迁移（2026-09-11）

- 新增 `canvas_backend_context.js`，按 `Backend Request -> Qwen TTS Presets` 创建两个 controller；主入口删除两组直接实例化，改为读取 Context 的请求、用户上下文和 preset alias。
- 保留 API/Bridge 请求包装、用户上下文、VLM 延迟转发、项目/资产/时间线请求、Qwen TTS preset 刷新和双语行为，没有新增界面文字。
- Backend Context 负责依赖组装与创建顺序；两个 controller 保持各自的请求和 preset 状态职责。
- 两套页面将 Backend Request、Qwen TTS Presets 放到 Backend Context 之前，Context 仍早于主入口；Timeline Context 的后置 Backend Request 回调保持。
- 验证：Backend Context、Backend Request、Qwen TTS Presets Node 专项 `12 passed`；相关 Python 及受影响合同 `15 passed`；主入口和相关模块 `node --check`、Python 入口编译、`git diff --check` 通过；当前主文件为 `29,455` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按入口初始化顺序迁移 Tooltip controller，并保留 Hover Preview、Preview Select 对 Tooltip alias 的依赖关系。

### 13.406 P7d123 Tooltip context 迁移（2026-09-11）

- `canvas_input_context.js` 现在创建 Tooltip controller，并返回 controller 与 pointer/focus、隐藏 alias；主入口删除 Tooltip 直接实例化，Hover Preview、Preview Select、VLM chat 图片预览继续使用 Input Context 的 `hideCanvasTooltip`。
- 保留 Tooltip 目标筛选、原生 `title` 暂存/恢复、边缘定位、Canvas pointer gesture 时隐藏、预览排除关系和双语行为，没有新增界面文字。
- Input Context 负责 Tooltip 依赖组装和 alias 导出；Tooltip controller 继续负责浮层状态、定位和事件处理；主入口保留页面事件绑定与其他预览 controller 的组装。
- 两套页面保持 Tooltip 模块先于 Input Context，Input Context 先于主入口；Hover Preview、Preview Select、VLM Chat Image Preview 的相对加载顺序不变。
- 更新 Input Context、Tooltip 合同，覆盖创建顺序、document/window/root/gesture 回调、alias 和主入口不再直接创建 Tooltip。
- 测试：Input Context、Tooltip Node 专项 `6 passed`；相关 Python 合同 `7 passed`。
- 验证：主入口和 Input Context `node --check` 通过；相关 `git diff --check` 通过；主文件当前 `29,450` 行，Input Context 当前 `276` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：继续检查 Hover Preview、Preview Select 与 VLM Chat Image Preview 的 bootstrap，整理重复 alias 转发，控制主入口规模。

### 13.407 P7d124 Hover Preview、Preview Select、VLM Chat Image Preview context 迁移（2026-09-11）

- `canvas_input_context.js` 现在按 `Tooltip -> Hover Preview -> Preview Select -> VLM Chat Image Preview` 创建四个相邻 controller，并返回对应 controller、预览方法和状态 alias；主入口删除三个预览 controller 的直接实例化。
- 保留模型/Lora/Style hover preview、Preview Select 菜单、VLM chat 图片预览、Tooltip 隐藏联动、Preview Select 对 Hover Preview 的关闭行为、pointer/focus 事件和双语行为，没有新增界面文字。
- Input Context 负责四个 controller 的依赖组装、创建顺序和 alias 转发；各预览 controller 继续负责自己的 DOM、缓存、定位和事件状态；主入口保留页面事件绑定、Scroll controller 和业务回调。
- 两套页面保持四个模块先于 Input Context，Input Context 先于主入口；Tooltip、Hover Preview、Preview Select、VLM Chat Image Preview 的相对加载顺序不变。
- 更新 Input Context、Hover Preview、Preview Select、VLM Chat Image Preview 和 named getter 合同，覆盖创建顺序、共享 alias、依赖转发和主入口不再直接创建预览 controller。
- 测试：Input Context、Tooltip、Hover Preview、Preview Select、VLM Chat Image Preview Node 专项 `17 passed`；相关 Python 合同 `13 passed`。
- 验证：主入口和 Input Context `node --check` 通过；相关 `git diff --check` 通过；主文件当前 `29,426` 行，Input Context 当前 `347` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、真实浏览器、真实后端/API、GPU 生成、安装版发布和远端验收；未提交 Git。
- 下一项：继续检查 Danbooru Autocomplete、VLM Chat 输入和 Scroll controller 的初始化边界，优先合并已有 Input Context 依赖，减少主入口的重复组装。

### 13.408 P7d125 Danbooru Autocomplete、Scroll context 迁移（2026-09-11）

- `canvas_input_context.js` 按现有依赖顺序创建 Danbooru Autocomplete 和 Scroll controller；主入口删除两者直接实例化，改为读取 Input Context 的 controller 与 alias。
- 保留 Danbooru autocomplete 的输入/焦点/键盘选择、索引预热、运行时提示，以及根 scroll 分发、Preview Select 关闭、VLM chat 滚动按钮、Media Browser 自动加载和 Danbooru 下拉定位行为，没有新增界面文字。
- Input Context 负责两个 controller 的依赖组装和初始化顺序；Danbooru 通过 Text Control Context 延迟调用 `dispatchTextControlInput`；Scroll 通过 Preview Select、Danbooru 和 Media Browser 回调保留原有行为。
- 两套页面保证 Danbooru、Scroll 模块先于 Input Context，Input Context 先于主入口；更新 Input Context、Danbooru、Scroll 合同。
- 验证：Input Context Node 专项 `2 passed`；Input Context、Text Control Context、Danbooru、Scroll Python 合同 `13 passed`；主入口、Input Context、Danbooru、Scroll `node --check`，`webui.py` 与 `ui_gradio_extensions.py` `py_compile`，相关 `git diff --check` 均通过；主文件当前 `29,410` 行，Input Context 当前 `395` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序评估 VLM Chat Input controller，检查它与 Danbooru autocomplete、Text Control Context 及 VLM Chat 状态的依赖边界。

### 13.409 P7d126 VLM Chat Context 迁移（2026-09-11）

- 新增 `canvas_vlm_chat_context.js`，按 `VLM Agent Context -> VLM Chat controller` 创建顺序组装 VLM 聊天运行环境；主入口改为读取 Context 返回的两个 controller。
- 保留 VLM chat 输入、消息/图片状态、模型检查与下载、Custom API、Agent action、运行请求、停止/取消、重试和双语行为，没有新增界面文字。
- VLM Chat Context 负责 Agent Context、Chat controller 的初始化顺序和 `buildVlmAgentContext` 延迟转发；状态/持久化 patch 继续由 Factory Context 提供。
- 两套页面保证 VLM Chat、VLM Chat State Factory、VLM Chat Context 先于主入口，并保持 State Factory 在 Chat Context 之前。
- 更新 VLM Chat Context、VLM Chat Input、VLM Chat State Factory 和 Factory Context 合同，修正旧的主入口定位。
- 验证：VLM Chat、VLM Node、VLM Chat Context、VLM Chat State Factory、Factory Context Node 专项合计 `104 passed`；相关 Python 合同 `33 passed`；主入口及 VLM 相关 JavaScript `node --check`、`webui.py` 与 `ui_gradio_extensions.py` `py_compile`、相关 `git diff --check` 均通过；主文件当前 `29,416` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、真实 Studio 启动、浏览器、后端/API、GPU、安装版和远端验收；未提交 Git。
- 下一项：按初始化顺序迁移 VLM Chat Input controller，检查它与 Danbooru autocomplete、Text Control Context 及 VLM Chat 状态的依赖边界。

### 13.410 P7d127 Agent Target、Primary Action context 迁移（2026-09-12）

- 新增 `canvas_agent_target_context.js` 与 `canvas_agent_action_context.js`。Target controller 负责 Agent 目标节点选择和媒体类型判断；Action controller 负责根据目标、引用计数和提示词媒体意图选择主操作及双语标签。
- 主入口删除 Target 与 Primary Action 的内联业务实现，保留原有调用名称和初始化顺序；Action controller 通过动态 source 读取 Agent state、引用统计、提示词意图和 Target 分类能力，不复制项目或节点状态。
- 保留 Agent 目标筛选、媒体引用判断、图片/视频/音频/文本操作优先级、生成器兼容性和双语行为，没有新增界面文字。
- 两套页面在 Agent Context、Agent Decision 和主入口之前发布新脚本；同步修正 `modules/ui_gradio_extensions.py` 资源声明缩进，避免页面启动出现 `IndentationError`。
- 验证：相关 Node 专项 `29 passed`，Python 合同 `26 passed`；JavaScript `node --check`、页面 `py_compile` 和相关 `git diff --check` 通过。隔离夹具与重启后的 8186 真实独立页 Playwright 均通过，主页面无内嵌画布，独立页无 `pageerror`，Target/Action 工厂已加载。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、GPU、后端/API、安装版发布和远端验收；未提交 Git。
- 下一项：评估 Agent action 执行编排与剩余媒体 workflow 辅助逻辑的职责边界。

### 13.411 P7d128 Agent action execution controller 迁移（2026-09-12）

- 新增 `canvas_agent_action_execution.js`，负责 Agent action 的 Panel 拦截、空提示词提示、目标限制、`vlm_plan` 路由、本地 instruction plan 分派和失败后的现有 Agent UI 错误通道。
- 主入口删除 `handleCanvasAgentAction` 的业务主体，保留原函数名作为 controller alias；controller 解包 `actionExecutionSource`，继续通过动态依赖调用现有 workflow service，不保存项目、节点或 UI 状态副本。
- 保留文生图、图像编辑、文生视频、图生视频、视频编辑、音频路线和文本优化的调用优先级、plan options、双语消息和设置语义；没有新增界面文字，独立页入口保持不变。
- 两套页面在 `infinite_canvas_workbench.js` 之前加载 Action Execution 脚本；standalone 与 Gradio 6 资源声明同步，原有 Agent Target/Action 相对顺序保持。
- 更新 Action Execution Node/Python 合同和独立页 Playwright，覆盖 source 解包、资源顺序、工厂存在性、主页面无内嵌画布请求和独立页无 `pageerror`。
- 验证：相关 Node `9 passed`，Python 合同 `6 passed`；JavaScript `node --check`、页面和合同 `py_compile`、相关 `git diff --check` 通过；重启 `8186` 后真实独立页 Playwright 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、GPU、后端/API、安装版发布和远端验收；未提交 Git。
- 下一项：继续检查 Agent workflow 的 action 辅助逻辑和运行状态更新，只迁移职责明确且可独立验证的实现。

### 13.412 P7d129 Agent VLM plan execution controller 迁移（2026-09-12）

- `canvas_agent_action_execution.js` 现在负责 VLM plan 的 Thinking 状态、计划请求结果、取消/过期/项目变化分支、本地 fallback、requested action 修正和 workflow 分派。
- 主入口删除 `runCanvasAgentVlmInstruction` 的业务主体，保留同名 wrapper；Action Execution 通过 `actionExecutionSource` 使用既有 VLM Instruction request、Target/Media 分类、状态方法和 workflow service。
- `canvas_agent_vlm_instruction.js` 的边界保持为 VLM request 生命周期、取消、超时、项目有效性和 JSON plan 解析；没有新增界面文字，独立页入口不变。
- 更新 Action Execution 与 VLM Instruction 合同和 Node 测试，覆盖 `vlm_plan` 实际动作分派及主入口不再持有计划编排。
- 验证：相关 Node `16 passed`，Python 合同 `8 passed`；JavaScript `node --check`、页面和合同 `py_compile`、相关 `git diff --check` 通过；真实 `8186` 独立页 Playwright 通过。
- 当前规模：主文件 `28,100` 行，Action Execution controller `186` 行。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、GPU、后端/API、安装版发布和远端验收；未提交 Git。
- 下一项：继续检查 Agent 运行状态更新和媒体 workflow 辅助逻辑，只迁移职责明确且可独立验证的实现。

### 13.413 P7d130 Backend Request Controller 九组 source 归位（2026-09-13）

- `canvas_backend_request_controller.js` 改为按 API、Project、Storage、System、Language、Serialization、Bridge、VLM 和 Network 九组 source 读取依赖；后端请求 payload、用户上下文和 fallback 结果保持原有行为。
- Factory Context 继续创建 Backend Request controller；主入口的 `backendRequestSource` 改为九组 nested source，`state.__lang` 仍从 Language source 进入用户上下文，没有新增界面文字。
- 更新 Backend Request Controller、Factory Context 合同和 Node fixture，覆盖 source 分组、主入口嵌套传参与旧平面 callback 检查。
- 验证：Backend Request Controller 单测 `5 passed`；相关合并 Node `9 passed`、Python 合同 `5 passed`；主入口和相关模块 `node --check`、相关 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.414 P7d131 Confirm Dialog 四组 source 归位（2026-09-13）

- `canvas_confirm_dialog.js` 改为按 Language、Utility、DOM 和 UI 四组 source 读取双语文本、HTML 转义、`document` 和主题检测；确认弹窗交互与可见文本保持原有行为。
- Template Context 直接传递 `confirmSource` nested source，主入口同步使用四组依赖，没有新增界面文字。
- 更新 Confirm Dialog、Template Context 合同和 Node fixture，覆盖 source 分组、嵌套传参与旧平面 callback 检查。
- 验证：Confirm Dialog/Template Context Node `4 passed`；相关 Python 合同 `2 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.415 P7d132 Template Library Defaults 一组 source 归位（2026-09-13）

- `canvas_template_library_defaults.js` 改为从 Language source 读取 `t`；内置模板 fallback 的数量、元数据、模型依赖和双语结果保持原有行为。
- Template Context 直接传递 `defaultsSource` nested source，主入口使用 `languageSource` 提供语言依赖，没有新增界面文字。
- 更新 Defaults、Template Context、Template Library Data 合同和 Node fixture，覆盖 source 归属、`dataSource` getter 命名与旧平面 callback 检查。
- 验证：Template Library Defaults/Template Context Node `3 passed`；相关 Python 合同 `4 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.416 P7d133 Template Library API 三组 source 归位（2026-09-14）

- `canvas_template_library_api.js` 改为按 API、Bridge 和 User 三组 source 读取模板请求依赖；直接 API 优先、Bridge fallback、action、超时、用户上下文和不可用结果保持原有行为。
- Template Context 直接传递 `apiSource` nested source，主入口用 `getApiMethod`、`bridgeSource` 和 `userSource` 提供依赖，没有新增界面文字。
- 更新 Template Library API、Template Context support 合同和 Node fixture；同步 Template Library Playwright fixture，覆盖三组 source、嵌套传参与旧平面 callback 检查。
- 验证：Template Library API/Template Context Node 合计 `5 passed`；相关 Python 合同 `5 passed`、API alias 合同 `1 passed`；相关 JavaScript `node --check`、`py_compile` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.417 P7d134 Template Library Views 两组 source 归位（2026-09-14）

- `canvas_template_library_views.js` 改为按 Language 和 Utility 两组 source 读取 `t`、`escapeHtml`；分类、筛选、模板卡片、依赖信息和弹窗 HTML 保持原有行为。
- Template Context 直接传递 `viewsSource` nested source，主入口使用 `languageSource` 与 `utilitySource` 提供依赖，没有新增界面文字。
- 更新 Views、Template Context 合同和 Node fixture；同步 Template Library Playwright fixture，覆盖两组 source、嵌套传参与旧平面 callback 检查。
- 验证：Template Library Views/Template Context/API Node 合计 `8 passed`；相关 Python 合同 `6 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.418 P7d135 Template Library Data 九组 source 归位（2026-09-14）

- `canvas_template_library_data.js` 改为按 Language、Utility、Path、Network、API、Defaults、Project、UI 和 Diagnostics 九组 source 读取依赖；数据归一化、缓存、manifest fallback、用户模板加载和失败提示保持原有行为。
- Template Context 直接传递 `dataSource` nested source，并通过延迟方法提供 Template Library API 与 Defaults 的请求和默认模板数据，没有新增界面文字。
- 主入口同步提供九组 `dataSource` 依赖，保留命名路径 getter、Gradio 6 页面入口和语言状态路径；更新 Data、Template Context、Views 和 support 合同及 Node fixture。
- 验证：Template Library Data/Template Context/Views/API Node 合计 `13 passed`；相关 Python 合同 `6 passed`；相关 JavaScript `node --check`、合同 `py_compile` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.419 P7d136 Template Library Controller 十五组 source 归位（2026-09-14）

- `canvas_template_library_controller.js` 改为按 Language、DOM、View、Action、Data、API、Project、Storage、Persistence、UI、Dialog、Asset、State、Utility 和 Diagnostics 十五组 source 读取依赖；模板库打开、筛选、保存、删除、新建工作台、刷新和项目状态更新保持原有行为。
- Controller 用 `callbackSources` 将回调映射到对应职责组；Template Context 合并主入口 source 与 Views、Data、API、Confirm Dialog 的延迟方法，不再传递同一层平面 callback。
- 主入口的 `librarySource` 改为十五组 nested source，保留 Gradio 6 页面入口、独立页入口和现有双语路径，没有新增界面文字。
- 合同：Controller、Template Context 合同增加 source 分组、主入口嵌套 source 和旧平面 callback 检查；Node fixture 同步新的 source 结构。
- 验证：Template Library Controller/Template Context/Data/Views/API Node 合计 `25 passed`；相关 Python 合同 `7 passed`；相关 JavaScript `node --check`、合同 `py_compile` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.420 P7d137 Preset Catalog 十组 source 归位（2026-09-14）

- `preset_catalog.js` 改为按 Language、Utility、System、API、User、Palette、Node、State、UI 和 Diagnostics 十组 source 读取依赖；目录标准化、排序、并发刷新、节点定义同步和失败回退保持原有行为。
- Preset Context 直接传递 `presetCatalogSource` nested source，主入口同步提供十组依赖，没有新增界面文字。
- 更新 Preset Catalog Node fixture 和 Preset Context 合同，覆盖 source 分组、主入口嵌套传参与旧平面 callback 检查；Gradio 6 和独立页加载顺序保持。
- 验证：Preset Catalog/Context/菜单搜索 Node 合计 `11 passed`；相关 Python 合同 `22 passed`；相关 JavaScript `node --check`、合同 `py_compile` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.421 P7d138 Node Menu 八组 source 归位（2026-09-14）

- `node_menus.js` 改为按 Language、Utility、Catalog、Node、Import、Palette、View 和 UI 八组 source 读取依赖；菜单分类、双语搜索词、Preset Catalog 异步解析、节点创建参数和画布视图 action 保持原有结果。
- 主入口的 `NODE_MENU_CONTEXT_SOURCE.nodeMenusSource` 改为八组 nested source；Node Menu Context 继续负责 service 创建，Gradio 6 和独立页加载顺序保持，没有新增界面文字。
- 更新菜单搜索 Node fixture 与 Node Menu Context Python 合同，增加 source 分组和旧平面 callback 检查。
- 验证：Node Menu/Context Menu 搜索 Node 专项 `8 passed`；相关 Python 合同 `2 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.422 P7d139 Text Node Renderer 六组 source 归位（2026-09-14）

- `canvas_text_node_renderer.js` 改为按 Language、Utility、Node、Translation、Render 和 Autocomplete 六组 source 读取依赖；五类文本节点的 HTML、双语标签、连接信息和状态显示保持原有结果。
- 主入口的 `VLM_NODE_VIEW_CONTEXT_SOURCE.textNodeRendererSource` 改为六组 nested source；Node View Context 继续负责 renderer 创建，Gradio 6 和独立页加载顺序保持，没有新增界面文字。
- 更新文本节点、Node View Context fixture 与 renderer/Node View 合同，增加 source 分组和旧平面 callback 检查。
- 验证：Text Node、Node View Context、VLM Node 专项合计 `25 passed`；相关 Python 合同 `9 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；扩展合同集中已有 VLM workflow 断言失败；未提交 Git。

### 13.423 P7d140 Media Browser Drag 三组 source 归位（2026-09-14）

- `canvas_media_browser_drag_controller.js` 改为按 Config、Media 和 Viewport 三组 source 读取依赖；媒体浏览器节点拖拽 payload、MIME 写入、外部 payload 解析、内部 fallback 和清理行为保持原有结果。
- 主入口的 `mediaBrowserDragSource` 改为三组 nested source；Input Interaction Context 继续负责 controller 创建与 Viewport Drop 转发，Gradio 6 和独立页加载顺序保持，没有新增界面文字。
- 更新 Media Browser Drag fixture 与 Python 合同，覆盖 source 分组、旧平面 callback 检查和当前 Input Interaction Context 调用形式。
- 验证：Media Browser Drag、Input Interaction、Viewport Drop Node 专项 `10 passed`；相关 Python 合同 `6 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.424 P7d141 Project Store controller 十八组 source 归位（2026-09-14）

- `project_store.js` 新增可注入的 `createCanvasProjectStoreController`；项目配置、语言、工具、系统参数、存储、Registry、builder、Project Patch、Run Record、各类 Node/Group/Batch/VLM factory、Compare 和 Diagnostics 依赖按职责分为十八组，项目创建、规范化、加载、压缩和存储信息行为保持原有结果。
- `infinite_canvas_workbench.js` 改用 `PROJECT_STORE_SOURCE` 和 `WORKBENCH_PROJECT_STORE`，保留 `window.SimpAICanvasWorkbenchProject` 全局 API；Gradio 6 与独立页入口顺序和现有语言路径保持，没有新增界面文字。
- 更新 Project Store Node fixture 与 Python 合同，覆盖分组 source 注入、已加载 factory 优先级、非法 patch fallback、主入口嵌套传参与旧平面 callback 检查。
- 验证：Project Store Node `25 passed`；Project Store Python 合同 `28 passed`；项目、持久化和 Template Library 相关 Node 合计 `60 passed`；相关 `node --check`、`py_compile` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 仍为既有失败；JSON 错误日志来自既有加载失败 fallback 测试，测试本身通过，本项未新增失败。

### 13.425 P7d142 Project Manager 九组 source 归位（2026-09-14）

- `project_manager.js` 改为按 Language、Utility、DOM、Browser、Project、Request、View、UI 和 Time 九组 source 读取依赖；项目列表、刷新、新建、导入 JSON、保存当前项目、切换、删除确认、当前项目判断和双语文本保持原有结果。
- 项目列表面板、删除确认和隐藏文件导入使用注入的 DOM；新项目名称输入使用注入的 `prompt`，默认名称使用注入的时间值；模块不再直接读取全局 `UTILS`。
- 主入口的 `PROJECT_MANAGER_CONTEXT_SOURCE` 改为九组 nested source；Project Manager Context 继续负责 Context 创建与复用，Gradio 6 与独立页加载顺序保持，没有新增界面文字。
- 更新 Project Manager Node fixture 与 Python 合同，覆盖 source 分组、翻译、HTML 转义、DOM、prompt、时间依赖、主入口嵌套传参与旧全局依赖检查。
- 验证：Project Manager Node 专项 `3 passed`；Project Manager Python 合同 `2 passed`；Project Manager 与 Browser Cache 相关 Python 合计 `5 passed`；Project Manager、Project Manager Context 和主入口 `node --check` 通过；相关 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。

### 13.426 P7d143 Asset Manager 十组 source 归位（2026-09-14）

- `asset_manager.js` 改为按 Language、Utility、DOM、Browser、Project、Asset、Viewport、View、UI 和 State 十组 source 读取依赖；资产引用收集、目录扫描、未引用文件清理、定位、查看、复制和双语界面保持原有结果。
- 面板和异常提示使用注入的 DOM，复制操作使用注入的剪贴板，删除确认使用注入的确认函数；扫描得到的资产根目录通过现有 Project Assets setter 更新，Asset Manager 不再直接写入扫描结果全局变量。
- 主入口的 `ASSET_MANAGER_CONTEXT_SOURCE` 改为十组 nested source；Asset Manager Context 继续负责 Context 创建与复用，Gradio 6 与独立页加载顺序保持，没有新增界面文字。
- 更新 Asset Manager Node fixture 与 Python 合同，覆盖 source 分组、翻译、HTML 转义、clone、DOM、剪贴板、确认、资产根目录 setter、主入口嵌套传参与旧全局依赖检查。
- 验证：Asset Manager Node 专项 `3 passed`；Asset Manager 与 Project Assets 相关 Python 合计 `3 passed`；Asset Manager、Asset Manager Context 和主入口 `node --check` 通过；相关 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。

### 13.427 P7d144 Mask Editor 八组 source 归位（2026-09-14）

- `mask_editor.js` 改为按 Language、Utility、DOM、Media、Node、View、Runtime 和 UI 八组 source 读取依赖；图片替换、Mask 绘制、已有 Mask 回显、画布尺寸同步、保存和节点状态更新保持原有行为。
- `document`、`Image` 和 `setTimeout` 改由对应 source 提供，模块不再直接读取全局 `UTILS`；缺少可用 DOM 时保持静默返回，没有新增界面文字。
- 主入口的 `MASK_EDITOR_CONTEXT_SOURCE` 改为八组 nested source；Mask Editor Context、Gradio 6 lazy assets、standalone script order 和现有双语路径保持。
- 更新 Mask Editor module/context Node fixture 与 Python 合同，覆盖 source 分组、节点/视图/运行时映射、主入口嵌套传参与旧全局依赖检查。
- 验证：Mask Editor/Mask Editor Context Node `3 passed`；相关 Python 合同 `3 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。

### 13.428 P7d145 Media Viewers 九组 source 归位（2026-09-14）

- `media_viewers.js` 改为按 Language、Utility、DOM、Browser、Asset、Node、Compare、View 和 UI 九组 source 读取依赖；图片、音视频、视频全屏、Compare 全屏、缩放、滚动定位和拖动行为保持原有结果。
- `getNodeImageSrc` 优先使用注入的 `assetDisplaySrc`，无 Context 调用仍保留现有 Asset Nodes 兼容路径；DOM、`requestAnimationFrame`、窗口尺寸和全屏事件改由 source 提供。
- 主入口的 `MEDIA_VIEWER_CONTEXT_SOURCE` 改为九组 nested source；Media Viewer Context、Gradio 6 lazy assets、standalone script order 和现有双语路径保持，没有新增界面文字。
- 更新 Media Viewers module/context Node fixture 与 Python 合同，覆盖 source 分组、资产显示映射、DOM/浏览器运行时、Compare 依赖、主入口嵌套传参与旧全局依赖检查。
- 验证：Media Viewers/Media Viewer Context Node `5 passed`；相关 Python 合同 `3 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。

### 13.429 P7d146 Node Browser 八组 source 归位（2026-09-14）

- `node_browser.js` 改为按 Language、Utility、DOM、Browser、Project、Viewport、Asset 和 View 八组 source 读取依赖；Node Search 的筛选、定位、图标以及 Canvas Manual 的内容保持原有结果。
- 弹窗 DOM 和搜索框定时聚焦通过 source 提供；模块不再直接读取全局 `UTILS`，没有可用 DOM 时直接返回。
- 主入口的 `NODE_BROWSER_CONTEXT_SOURCE` 改为八组 nested source；Node Browser Context、Gradio 6 lazy assets 和独立页加载顺序保持，没有新增界面文字。
- 更新 Node Browser Node fixture 与 Python 合同，覆盖 source 分组、语言、HTML 转义、DOM、定时器、项目/视口/资产/视图回调、主入口嵌套传参与旧全局依赖检查。
- 验证：Node Browser/Node Browser Context Node `3 passed`；相关 Python 合同 `2 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过；两种入口加载顺序已复查。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。
- 下一项：继续检查 `group_list.js` 的平面 callback，并确认它的 Context 边界。

### 13.430 P7d147 Group List 七组 source 归位（2026-09-14）

- `group_list.js` 改为按 Language、Utility、DOM、Group、Action、Viewport 和 View 七组 source 读取依赖；分组列表展示、颜色、快捷键、跳转和添加分组行为保持原有结果。
- 新增 `canvas_group_list_context.js`；弹窗 DOM 通过 source 提供，模块不再直接读取全局 `UTILS`，没有可用 DOM 时直接返回。
- 主入口改用 `GROUP_LIST_CONTEXT_SOURCE` 和共享 Context；Gradio 6 lazy assets、独立页加载顺序和现有双语路径保持，没有新增界面文字。
- 更新 Group List Node/Context fixture 与 Python 合同，覆盖七组 source、语言、HTML 转义、DOM、分组/动作/视口/视图回调、主入口嵌套传参与旧全局依赖检查。
- 验证：Group List/Group List Context Node `3 passed`；相关 Python 合同 `12 passed`（含 Node factory 合同）；相关 JavaScript `node --check` 和 `git diff --check` 通过；两种入口加载顺序已复查。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。
- 下一项：继续检查 `run_history_panel.js` 的平面翻译、剪贴板和运行记录依赖。

### 13.431 P7d148 Run History Panel 运行依赖归位（2026-09-14）

- `run_history_panel.js` 的运行状态标签改用传入的 `t`，时长改用 Context 提供的日期解析，错误复制改用 Context 提供的剪贴板写入；模块不再直接读取全局 `t`、`Date.parse` 或 `navigator.clipboard`。
- `canvas_run_panels_controller.js` 为 Run History 增加 `timeSource` 和 `clipboardSource`，统一处理日期解析异常、异步剪贴板结果和失败状态；Run Queue 的现有行为保持不变。
- `infinite_canvas_workbench.js` 仅提供日期解析和剪贴板写入回调；没有新增模块，Gradio 6 与独立页的既有加载顺序保持。
- 更新 Run History Node fixture、Run Panels Node fixture 和 Python 合同，覆盖翻译、日期解析、复制成功/失败、Context 传参与旧全局依赖检查。
- 验证：Run History/Run Panels Node `5 passed`；Run Panels Python 合同 `2 passed`；双语专项 `1 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。
- 下一项：继续检查 `run_queue_panel.js` 及相邻运行面板是否还存在未注入的运行时依赖。

### 13.432 P7d149 Media Timeline 渲染与序列化依赖归位（2026-09-14）

- `media_timeline.js` 的语言、HTML 转义、数值限制、媒体范围、资源显示、缩略图、资产序列化、节点查询和时间生成依赖统一通过 Language、Utility、Asset、Node、Time 五组 source 提供；旧的平面 source 读取仍可兼容。
- Timeline 节点主体、项目参数、Inline Clip Editor、Clip Inspector、Timeline Inspector、尺标和预览文本改用 Context 翻译与转义；模块不再读取旧的全局 `UTILS`、`ASSETS`、翻译别名或 `Date.now()`。
- Timeline JSON 与 Render Payload 改用 Context 的 `serializeAssetForRun`、媒体范围和数值限制；剪辑 ID fallback 使用 Context 时间回调，现有节点和渲染结果结构保持。
- 主入口的 `TIMELINE_NODE_CONTEXT_SOURCE` 改为五组 nested source，增加缩略图、资产序列化、媒体范围和时间回调；两种页面入口的脚本加载顺序保持，没有新增界面文字。
- 更新 Timeline Context Node fixture 与 Python 合同，覆盖 source 分组、渲染/序列化调用和旧全局依赖检查。
- 验证：Timeline Context Node `12 passed`；相关 Python 合同 `7 passed`；相关 JavaScript `node --check` 和 `git diff --check` 通过。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实浏览器、后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：`test_canvas_project_getter_boundary_contract.py::test_project_readers_use_get_project_without_scope_project_fallback` 及扩展合同集中既有 VLM workflow 断言仍未处理，本项未新增失败。
- 下一项：继续检查时间线相邻的参数、命令和播放控制模块中仍保留的平面 callback。

### 13.433 P7d150 Wildcards V2 入口初始化修复（2026-09-15）

- 独立画布入口创建 Wildcards V2 Context 时直接读取尚未声明的 `escapeHtml`，触发 `ReferenceError: Cannot access 'escapeHtml' before initialization`，页面停在 `Loading Infinite Canvas`。
- 将 `WILDCARDS_V2_CONTEXT_SOURCE.utilitySource.escapeHtml` 改为延迟 wrapper，避免初始化阶段读取 TDZ 中的常量；Wildcards V2 controller source、公开动作、Gradio 6、独立页和双语路径保持不变。
- 验证：主入口 `node --check` 通过；Wildcards V2 controller Node `2 passed`；Python 合同 `2 passed`；真实 Chrome 独立页加载出完整画布（3 节点 / 2 连线）；`git diff --check` 无内容错误，仅有既有 LF/CRLF 提示。
- 未执行：完整 Canvas Python 合同、完整 Node 模块回归、完整 Studio、真实后端/API、GPU、安装版发布和远端验收；未提交 Git。
- 已知既有失败：项目 getter、Image 空上传、Audio 右键目标节点以及 Qwen 特殊节点 patch factory 合同仍未处理，本项未新增失败。
- 下一项：继续检查主入口剩余的 viewport/render 计时与 `Date.now`/`performance.now` 访问，按现有 controller 边界归属。

### 13.434 P7d151 独立页启动报错修复（2026-09-15）

- Runtime Service Context 同时暴露 Minimap 的 `isDragging` 和主入口使用的 `isMinimapDragging`，修复独立页运行时的 `isMinimapDragging is not a function`。
- Tag Cart 在独立画布页不再等待 `gradioApp()`，初始化完成后直接挂到 `document.body`；普通 Gradio 页面挂载行为保持不变。
- 用户确认中键拖动卡顿来自浏览器 F12 控制台打开，本项没有修改画布拖动性能逻辑。
- 验证：相关 Node 测试合计 `10 passed`；相关 Python 合同 `18 passed`，另有 2 个既有 Minimap realtime 合同仍按旧的 `call('applyViewport')` 字符串断言失败；主入口、Runtime Service Context、Tag Cart `node --check` 通过；live Playwright 独立页无 `pageerror`；`git diff --check` 通过。
- 下一项：继续检查主入口剩余的 viewport/render 计时与 `Date.now`/`performance.now` 访问，按现有 controller 边界归属。

### 13.435 P7d152 节点折叠状态写回修复（2026-09-15）

- Selection Context 的 `buildNodeLayoutPatch` 与 `buildNodeFlagPatch` 统一改由 `CANVAS_NODE_FACTORY_CONTROLLER` 提供，修复选择节点后折叠状态无法写回的问题。
- 单选和多选的折叠、展开及其他节点标记更新继续保留原有选择状态、历史记录、渲染刷新、提示和双语路径；没有新增界面文字。
- 新增节点折叠回归测试；Node 测试 `27 passed`，Python 合同 `17 passed`；主入口和相关模块 `node --check`、`git diff --check` 通过。
- Chrome 独立画布实测 Text 节点按钮可在“折叠节点”和“展开节点”之间切换，恢复测试状态后页面提示“已展开 1 个节点”。
- 未执行：完整 Canvas Python 合同、完整 Studio、真实后端/API、GPU 生成、安装版发布和远端验收；未提交 Git。项目 getter、Image 空上传、Audio 右键目标节点以及 Qwen 特殊节点 patch factory 等既有问题仍未处理。
- 下一项：继续检查主入口剩余的 viewport/render 时间与日期访问，按现有 controller 边界归属。

### 13.436 无限画布文本节点写回 action 注册修复（2026-09-22）

- 用户机器上的修复显示，文本框手动输入和 `Ctrl+Enter` 提交失败，是因为 `canvas_node_param_controller.js` 已经通过 `actionCall(...)` 分发文本写入事件，但开发端 `NODE_INTERACTION_CONTEXT_SOURCE.nodeParamSource.actionSource` 没有暴露对应函数。
- 主入口补充注册 `updateTextNodeValue`、`updateTextMergeSeparator`、`updateTranslationInput`、`updateTranslationParam`、`updateTagCartParam`、`updateWd14Param`、`updateWildcardsHelperParam`。文本节点、文本合并、翻译、Tag Cart、WD14 和 Wildcards 的字段事件现在可以调用已有写入逻辑，已有连接路径保持不变。
- 增加 Node 回归用例，覆盖 7 类文本字段从事件分发到注入 action 的调用；Python 合同测试锁定主入口注册，避免后续只保留函数实现却遗漏 source 映射。
- 验证：`node --test tests/canvas_node_param_controller_module.test.cjs` 通过，`7 passed`；`python -m pytest -q --tb=short tests/test_canvas_node_param_controller_contract.py` 通过，`2 passed`；`node --check javascript/infinite_canvas_workbench.js` 通过；相关 `git diff --check` 通过。
- 已知提示：pytest 报告 `.pytest_cache` 无写权限，但不影响测试结果。未执行完整 Studio、真实浏览器连接操作、后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.437 无限画布 VLM 指令输入写回修复（2026-09-25）

- VLM 参数字段事件已通过 `handleVlmParamFieldChange` 处理，但无限画布节点交互上下文的 `actionSource` 未注册该方法，导致未点击翻译按钮时，手动输入的指令没有写入节点参数，运行时继续使用默认指令。
- 在 `NODE_INTERACTION_CONTEXT_SOURCE.nodeParamSource.actionSource` 注册现有 VLM 字段处理方法。手动编辑、翻译后的值及运行读取现在共用节点参数状态。
- 增加主入口合同断言，防止 VLM 写回 action 再次遗漏。
- 验证：`python -m pytest -q --tb=short tests/test_canvas_node_param_controller_contract.py` 通过（2 passed）；`node --check javascript/infinite_canvas_workbench.js` 与相关 `git diff --check` 通过。pytest 有 `.pytest_cache` 无写权限警告，不影响结果。
- 未执行：完整 Studio、真实 VLM 后端/API、GPU、安装版发布和远端验收；未提交 Git。

### 13.438 无限画布遮罩编辑器初始化修复（2026-09-27）

- 浏览器现场发现遮罩窗口打开时出现 `TypeError: Illegal invocation`：原生 `setTimeout` 被作为普通回调传入，调用接收者错误，导致回退尺寸初始化没有执行，绘制层与图片显示尺寸不一致。
- 遮罩编辑器现在通过 `window.setTimeout` 安排尺寸初始化；图片加载回调仍保留原有行为。
- 增加主入口合同断言，防止遮罩编辑器再次收到未绑定的浏览器定时器。
- 验证：遮罩上下文合同 `2 passed`；`node --check javascript/infinite_canvas_workbench.js` 通过。
- 未刷新用户当前打开的遮罩页面，以保留页面状态；修复尚未在刷新后的现场页面复测。未运行完整测试套件。

### 13.439 Wildcards 目录与预览运行职责迁移（2026-09-28）

- 对应拆分日志第 1222 节。新增 `canvas_wildcards_runtime_controller.js`，管理目录刷新、缓存、Wildcards Helper 状态更新和 Classic/Preset 预览；主入口保留原函数代理，Wildcards V2 面板职责不变。
- 独立页和 Gradio 6 均在主 workbench 前加载新模块。缓存、强制刷新、保存与渲染分流、当前用户 context、预览参数优先级及 factory patch 写回保持原有行为，没有新增界面文案。
- 验证：相关 Node 专项 90 项通过（包括独立页完整脚本初始化及 Aux 创建旧夹具按新 controller 加载后的异步回归），Python 合同 29 项通过；相关 JavaScript 语法与 `git diff --check` 通过，仅有 LF/CRLF 提示。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项单独评估 Wildcards Helper 节点视图职责；P11 总验收未完成。

### 13.440 Wildcards Helper 节点视图迁移（2026-09-28）

- 对应拆分日志第 1223 节。节点 HTML 转入现有 Text Node renderer；主入口保留代理，选项和标签生成通过 context 注入，未增加页面脚本或改变 Wildcards V2 与目录运行模块。
- 保留原控件、动作、内部选项值、转义和项目格式；可见标签使用当前 `__lang`，没有新增界面文案。
- 验证：相关 Node 测试 106 项、Python 合同 44 项通过，含独立页真实脚本初始化后的主入口渲染与中英文切换；相关 JavaScript 语法及 `git diff --check` 通过，仅有 LF/CRLF 提示。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项评估 Wildcards V2 的标签插入与参数写入；P11 总验收未完成。

### 13.441 Wildcards V2 标签写入职责迁移（2026-09-28）

- 对应拆分日志第 1224 节。主文件不再实现标签追加；Wildcards V2 controller 在面板插入动作中通过注入的 `updateNodeParam` 写入当前提示词槽，保留既有历史记录、保存与 Inspector 刷新路径。两种页面入口均沿用已有脚本，没有新增界面文案。
- 验证：相关 Node 测试 142 项、Python 合同 49 项通过，覆盖锁定与空值、两种提示词槽、面板插入动作和独立页真实脚本顺序下的参数写入；相关 JavaScript 语法和 `git diff --check` 通过，仅有 LF/CRLF 提示。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项评估 Config 选项来源与值解析工具；P11 总验收未完成。

### 13.442 Config 数值与文本别名解析迁移（2026-09-28）

- 对应拆分日志第 1225 节。Config Values controller 负责别名扫描及数值、文本解析；主文件保留 Advanced Config renderer 所用的数值与文本代理，不再将自身解析函数注入 Config Values。无新增脚本、项目字段或界面文案，有界数值解析和 DOM 选项仍维持原职责。
- 验证：迁移前相关 Node 测试 23 项、Python 合同 5 项通过；迁移后相关 Node 测试 147 项、Python 合同 52 项通过，包含独立页完整脚本初始化、Advanced Config 渲染及空值、默认值和别名优先级。相关语法与 `git diff --check` 通过，仅有 LF/CRLF 提示。主文件为 18,536 行、940,672 字节。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项单独评估有界数值解析与 Config 选项来源；P11 总验收未完成。

### 13.443 Config 有界数值解析迁移（2026-09-28）

- 对应拆分日志第 1226 节。`boundedConfigNumberValue` 移入 Config Values controller，主文件保留 Advanced Config renderer 所需的同名代理；数值别名、无效边界和 schema 上下限行为不变。主文件为 18,530 行、940,455 字节。
- 验证：迁移前相关 Node 测试 25 项、Python 合同 5 项通过；迁移后 Node 测试 26 项、Python 合同 5 项通过，包含完整独立页脚本初始化和越界渲染；相关语法和 `git diff --check` 通过。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项评估 Advanced Config 的 DOM 下拉选项读取；P11 总验收未完成。

### 13.444 Advanced Config 下拉选项读取迁移（2026-09-28）

- 对应拆分日志第 1227 节。DOM 选项读取归属 Advanced Config renderer，通过主文件注入当前 document 和 Gradio 根节点；共享选项 HTML 与选项合并逻辑未变。主文件为 18,518 行、939,739 字节。
- 验证：迁移前相关 Node 测试 26 项、Python 合同 5 项通过；迁移后相邻 Node 测试 149 项、Python 合同 52 项通过，包括动态选项与独立页完整脚本初始化后的渲染；相关语法和 `git diff --check` 通过。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。下一项评估共享的 Config 选项 HTML 渲染；P11 总验收未完成。

### 13.445 Preset 特殊节点 DOM 同步迁移（2026-09-28）

- 对应拆分日志第 1228 节。共享 `optionHtml` 保留在主文件；Preset 特殊控制器、上传槽位和 viewer 的 DOM 更新归入现有 Viewer controller，主入口保留两个外部调用代理，不新增脚本或可见文案。主文件为 18,470 行、937,080 字节。
- 验证：迁移前相关 Node 测试 86 项、Python 合同 18 项通过；迁移后相关 Node 测试 161 项、Python 合同 46 项通过，覆盖真实模块行为和独立页完整脚本下的特殊 Preset 更新。误写的 Note Edit context 依赖已纠正并复测；相关语法和 `git diff --check` 通过。
- 未执行：真实浏览器、完整 Studio、全量测试、后端/API、GPU、性能比较和安装版发布验收。继续检查节点参数 DOM 写回及其他剩余职责；P11 总验收未完成。

### 13.446 画布全量测试与旧 Node 夹具同步（2026-09-28）

- 对应拆分日志第 1229 节。更新 Gallery、Batch Any、Mask、Note 和元数据按钮的旧测试环境，按当前模块接线执行原有行为断言；没有修改运行代码或页面脚本。全量 Node 首次 2,129 通过、55 失败，修正夹具后 338 个文件的 2,184 项全过。
- Python 全量首次 1,032 通过、44 失败、5 个临时目录权限错误；五个素材测试使用独立临时目录单独通过。已证实模板槽位和 VLM 构造合同仍检查迁移前的主文件位置；其余 44 项尚待逐项核对，没有进行完整 Python 复测。
- 未执行：真实浏览器、完整 Studio、后端/API、GPU、性能比较和安装版发布验收。继续核对 Python 合同与模块所有权，以及节点参数 DOM 写回；P11 总验收未完成。

### 13.447 画布 Python 合同复核与 R2V 模板默认尺寸修正（2026-09-28）

- 对应拆分日志第 1230 节。独立临时目录重测排除 5 个权限错误；44 项失败逐项核对，更新项目写入、节点创建、事件注册和视口等迁移后的 Python 合同，保留入口、加载顺序和调用顺序检查。
- `MiniMax-H3(R2V)` 预设在 2026-09-17 改为默认 `864*480`，模板仍使用旧的 `640*640`。已将 R2V 模板的初始画幅、宽高和 Preset 默认参数统一为 `864*480`、864×480，保留方形选项，并增加数据一致性断言；主 workbench 没有改动，仍为 18,470 行、937,080 字节。
- 验证：Node 全量 338 文件、2,184 项通过；Python 全量 328 文件、1,081 项通过，另有 9 条第三方弃用警告。R2V 模板专项 11 项通过，JSON 解析及 14 节点、12 连线检查通过；`git diff --check` 通过。
- 未执行：真实浏览器、完整 Studio、后端/API、GPU、性能比较和安装版发布验收。下一项评估节点参数 DOM 写回；P11 总验收仍未完成。

### 13.448 节点参数控件 DOM 同步迁移（2026-09-28）

- 对应拆分日志第 1231 节。`syncNodeParamControlDom` 归属 Node Param controller，主入口仅注入当前节点层与 `cssEscape`；WD14 写入仍由原代理发起，并保持历史记录、参数写入、页面控件同步及保存路径。两处入口继续使用已有脚本顺序，无新文案或项目字段。
- 验证：相邻 Node 专项 59 项、Python 合同 7 项通过；独立页完整脚本初始化后直接更新 WD14，参数和页面控件同步。画布 Node 全量 339 文件、2,186 项通过；Python 全量 328 文件、1,081 项通过，另有 9 条第三方弃用提示。相关语法及 `git diff --check` 通过；主文件为 18,457 行、936,468 字节。
- 未执行：真实浏览器、完整 Studio、后端/API、GPU、性能比较及安装版发布验收。下一项检查 `bindInspectorEvents` 剩余的内联 DOM 事件职责；P11 总验收仍未完成。

### 13.449 图像节点拖放替换迁移（2026-09-28）

- 对应拆分日志第 1232 节。`bindInspectorEvents` 已是纯调度函数，不再为它增加回调注入；实际将图像节点的拖放替换交给 Media Edit controller，主文件保留 Node Event 所用代理。Transfer Station 查询和本地文件回退仍按原有顺序处理，两处入口无新增脚本、文案或项目字段。
- 验证：迁移前相邻 Node 66 项、Python 21 项通过；迁移后相邻 Node 70 项、Python 22 项通过，包括直接拖放行为与独立页完整脚本调用。画布 Node 全量 340 文件、2,191 项通过；Python 全量 328 文件、1,082 项通过，另有 9 条第三方弃用提示。相关语法及 `git diff --check` 通过；主文件为 18,442 行、935,553 字节。
- 未执行：真实浏览器、完整 Studio、后端/API、GPU、性能比较及安装版发布验收。下一项评估设置菜单和 `toggleSetting` 的职责；P11 总验收仍未完成。

### 13.450 设置菜单与设置写入迁移（2026-09-28）

- 对应拆分日志第 1233 节。设置菜单与设置切换归属已有 Settings controller；主文件仅保留代理并注入当前项目、语言、历史记录、设置 patch、菜单和刷新服务。面板内的设置动作复用同一写入函数，菜单位置、顺序、文案和保存行为保持原样。两处入口没有新增脚本或项目字段。
- 验证：相邻 Node 22 项、Python 合同 16 项通过；画布 Node 全量 341 文件、2,194 项通过；Python 全量 328 文件、1,082 项通过，另有 9 条第三方弃用提示。独立页完整脚本测试覆盖菜单显示与点击后的项目设置变化；相关语法和目标文件 `git diff --check` 通过。主文件为 18,432 行、933,962 字节。
- 未执行：真实浏览器、完整 Studio、后端/API、GPU、性能比较及安装版发布验收。继续评估主文件剩余职责，选择可独立验证的迁移项；P11 总验收仍未完成。

### 13.451 LayerForge 未就绪时的资源加载修复（2026-09-28）

- 对应拆分日志第 1234 节，本项为功能修复，不计入主文件职责迁移。画布调用共享资源组加载器后如仍未获得 LayerForge 适配器，会按当前画布脚本路径重新加载所需资源；共享加载器缺失或抛错时也能尝试此路径。脚本请求失败可再次操作重试，其他资源组维持原行为；加载和失败提示按当前语言显示。
- 验证：LayerForge 缺少共享加载器、共享加载器未注册适配器、共享加载器抛错、脚本失败及执行后未注册适配器时的重试专项测试，与相邻 Media Edit 和独立页入口测试合计 25 项通过。7888 页面上的既有图片节点能打开 LayerForge，但该服务运行于 E 盘安装目录，所返回脚本仍是修改前版本，不能据此认定新代码的浏览器验收通过。
- 未执行：开发仓库对应的真实页面交互、完整 Studio、后端/API、GPU、性能比较和安装版发布验收；没有向 7888 运行副本写入。继续评估主文件剩余职责；P11 总验收仍未完成。

### 13.452 Tag Cart 内嵌编辑器重绘恢复迁移（2026-09-28）

- 对应拆分日志第 1235 节。节点重绘后恢复内嵌 Tag Cart 编辑器的判断移入已有 Tag Cart controller；主文件保留供 Node Render 调用的代理，并提供节点层状态。独立页和 Gradio 6 继续使用原有脚本顺序，没有新增项目字段或可见文案。
- 行为保留：仅活动节点仍为 Tag Cart、节点层与内嵌容器存在且编辑器未挂载时重新打开；节点失效时清除活动 ID，节点层尚未建立时不更改状态。恢复时不新增历史，也不额外刷新连线。
- 验证：Tag Cart、Node Render、节点签名及完整独立页入口专项 Node 33 项通过；相关 Python 合同 6 项通过。入口测试通过实际 controller 初始化与重绘回调代理恢复内嵌编辑器，并检查失效节点的清理。
- 未执行：开发仓库对应页面的真实浏览器操作、完整 Studio、后端/API、GPU、性能比较及安装版发布验收；7888 为另一份安装目录，不能代表本项代码。继续评估主文件剩余职责；P11 总验收仍未完成。

### 13.453 Overview 节点渲染签名迁移（2026-09-28）

- 对应拆分日志第 1236 节。Overview 节点的签名生成与端口摘要移入已有 Node Render Signature 模块；主文件保留调用代理，并向模块提供当前选中节点、节点状态、素材、端口和结果过期状态。独立页与 Gradio 6 沿用现有脚本顺序，没有更改项目字段、节点显示或可见文案。
- 行为保留：每次生成签名都读取当前语言生成的节点类型标签，以及当前选中、状态、素材路径、输入端口与输出类型；普通节点的完整签名和媒体资源签名继续使用原逻辑。Overview 渲染仍按已有位置调用该签名决定 DOM 是否刷新。
- 验证：Node Render 与 Node Render Signature 专项 26 项通过，含完整独立页脚本初始化后调用主文件代理；相关 Python 合同 9 项通过。语法检查和目标文件的 git diff --check 通过，仅有既有的行尾转换提示。
- 未执行：开发仓库对应页面的真实浏览器操作、完整 Studio、后端/API、GPU、性能比较及安装版发布验收；7888 仍是另一份安装目录。继续评估主文件剩余职责；P11 总验收未完成。

### 13.454 折叠提示词节点高度计算迁移（2026-09-28）

- 对应拆分日志第 1237 节。Preset/Classic 折叠节点的目标高度、连接端口行数和提示词编辑区判断，以及 VLM 聊天等动态节点的固定高度判断，移入已有 Node Layout 模块；主文件保留三个调用代理，通过现有 Node Layout context 提供项目、端口、参数及节点状态。独立页与 Gradio 6 不增加脚本、文案或项目字段。
- 行为保留：折叠高度仍采用保存值与所需高度的较大者，并约束在 220 至 520；连接行数最多计 10 行，Classic 继续保留提示词编辑区。项目尚未建立时不计算连接行数；展开状态下的 VLM 聊天、媒体浏览器及导演时间线仍使用固定高度。
- 验证：迁移前 Node Layout、Node Render 和 Resize 共 33 项通过；迁移后含连接端口、提示词编辑区、限制高度、动态状态和独立页完整脚本调用的 35 项通过，相关 Python 合同 13 项通过。相关 JavaScript 语法与目标文件 git diff --check 通过。
- 未执行：开发仓库对应页面的真实浏览器操作、完整 Studio、后端/API、GPU、性能比较和安装版验收；7888 为另一份安装目录，不能作为本项验收。继续评估主文件剩余职责；P11 总验收仍未完成。

### 13.455 Classic 上传槽可见性迁移（2026-09-28）

- 对应拆分日志第 1238 节。Classic t2i、ip、uov、inpaint 和 enhance 模式的可见上传槽生成移入 Config Values controller，与已有 IP 数量及引擎上限计算放在同一模块。主文件仅保留代理，两处入口脚本顺序不变，未新增界面文本或项目字段。
- 验证：相邻 Node 专项 43 项通过，含不同模式、IP 上限变化与独立页完整脚本代理调用；Python 合同 14 项通过，语法和目标文件 git diff --check 通过。测试未访问真实浏览器或后端。
- 未执行：开发仓库对应页面的真实浏览器操作、完整 Studio、后端/API、GPU、性能比较和安装版验收；7888 使用另一份安装目录。继续评估主文件剩余职责；P11 总验收未完成。

### 13.456 独立画布 LayerForge 备用加载修复（2026-09-28）

- 对应拆分日志第 1239 节。独立画布在没有共享懒加载器时，直接加载 `layerforge_integration.js` 注册适配器，不再因为不相关的 `umd.min.js` 加载失败而提前显示未就绪。失败时仍允许重试；Gradio 6 的共享资源清单未变，没有新增可见文案或项目字段。
- 验证：LayerForge、Media Edit 和独立页入口专项 Node 21 项通过，包含真实集成脚本执行、适配器注册、失败重试与共享资源加载器返回无适配器的情况。7888 提供的主脚本尚不包含开发仓库现有的新版加载流程，没有更改安装版文件，也未进行开发版真实浏览器验收。P11 总验收未完成。

### 13.457 VLM Chat 提示词快速判断迁移（2026-09-28）

- 对应拆分日志第 1240 节。将 Danbooru 强制修复判断、目标格式 fast path 判断和本地 preflight 结果结构移入 `canvas_vlm_chat.js`；主入口向 VLM Chat 注入现有 Agent 的格式判断、规范标签提取和多角色标签修复服务。原入口没有保留第二份实现，也未变更脚本加载、项目数据、接口请求或双语文案。
- 验证：相邻 VLM Chat、context 和独立页完整脚本入口 Node 93 项通过；Python 合同 36 项通过。测试覆盖空提示词、中文、Danbooru 和 Flux T5 目标、标签修复变化以及结果字段。相关 JavaScript 语法检查与目标文件 `git diff --check` 通过（仅有行尾转换提示）；没有进行开发仓库的真实浏览器操作、完整 Studio、后端/API、GPU、性能或安装版验收。P11 总验收未完成。

### 13.458 XYZ 图表弹窗交互迁移（2026-09-28）

- 对应拆分日志第 1241 节。XYZ 轴选项筛选、弹窗控件事件、打开和预览请求移入现有 Matrix Editor controller；主文件保留调用代理，继续使用原有 Modal Renderer、节点创建及语言服务。独立页与 Gradio 6 的资源加载顺序、项目字段和预览请求格式未改。
- 重绘弹窗不重复绑定背景关闭事件；关闭弹窗、并发旧请求或项目切换后不再处理迟到预览。接口异常时轴选项仍可用默认值，预览恢复按钮状态，错误提示随当前语言切换。矩阵节点创建、来源定位和单格选择仍留待后续整理。
- 验证：相关 Node 18 项通过，覆盖控件操作、创建、请求失败、迟到响应及独立页完整脚本；Python 合同 28 项通过。相关脚本语法检查和目标文件 `git diff --check` 通过，仅有行尾转换提示。未启动完整 Studio，也未进行开发版真实浏览器、后端/API、GPU、性能或安装版验收；P11 总验收未完成。

### 13.459 XYZ 矩阵创建与选择迁移（2026-09-28）

- 对应拆分日志第 1242 节。矩阵节点创建、批任务追加、来源定位和单格选择归入 Matrix Editor controller；主 workbench 保留节点动作调用的三个入口，并删除无调用的 XYZ 辅助代理。模块通过当前项目回调取得节点，使用既有节点/批任务工厂和存储 patch，不改变项目格式、历史顺序或双入口资源清单。
- 选择已有 Result 的单格继续直接定位和预选对应资源；计划中的单格仍最多保留两个选择并安排保存。对无效预览、创建失败以及已替换的来源或矩阵节点跳过写入，错误和成功提示继续依据当前语言生成。
- 验证：Node 35 项、Python 合同 26 项通过，覆盖创建顺序、项目和批任务写入、视口定位、资产选择、计划单格切换、旧项目引用和独立页完整脚本初始化；相关 JavaScript 语法和目标文件 `git diff --check` 通过，仅有行尾转换提示。未启动完整 Studio，未执行开发版真实浏览器、后端/API、GPU、性能或安装版验收；P11 总验收未完成。

### 13.460 7888 安装版 LayerForge 未就绪修复（2026-09-28）

- 对应拆分日志第 1243 节，本项不属于主文件职责迁移。7888 的运行副本尚停留在旧版 LayerForge 加载代码，先请求 404 的 UMD 脚本，阻止后续集成脚本注册适配器；现已只更新安装版主脚本的对应片段，按开发端现有流程加载集成脚本，并在共享加载器失败或未注册适配器时尝试恢复、允许再次点击重试。开发仓库的功能代码不变。
- 验证：安装版 JavaScript 语法通过，7888 HTTP 返回已更新脚本和可访问的集成脚本；相关 Node 24 项通过。在 7888 独立页从已有图片打开 LayerForge，编辑器显示图层和工具且状态为“就绪”。没有保存测试图片，也没有完成开发版/Gradio 6 双入口和 P11 总验收。

### 13.461 Preset 特殊控制器状态初始化迁移（2026-09-28）

- 对应拆分日志第 1244 节。Preset 特殊控制器初始状态和提示词参数更新现由 `canvas_preset_special_viewer_controller.js` 负责，主 workbench 仅保留现有调用代理；Node Factory 和参数编辑保持原入口，双入口脚本清单及项目格式未变。
- 原有控制器类型判断、已有更新时间、状态 kind 和 `scene_additional_prompt_2` 生成规则保持；不适用节点不会写入状态，没有新增界面文字。专项 Node 60 项、Python 合同 33 项通过，包含独立页完整脚本初始化调用；相关脚本语法和差异检查通过。未执行开发版真实浏览器、Gradio 6、完整 Studio、后端/API、GPU、性能或安装版验收；P11 总验收未完成。

### 13.462 折叠端口连接与高度判断迁移（2026-09-28）

- 对应拆分日志第 1245 节。折叠节点是否保留已连接端口及其所需高度，由 `canvas_node_layout.js` 根据当前项目连线统一判断；主 workbench 的渲染入口改为委托 Layout controller。原有端口 class、上传/配置槽计数与高度上限不变，项目字段、资源清单和中英文文案未改。
- 验证：Node 51 项和 Python 合同 17 项通过，包括独立页完整脚本中的连接状态与高度变化；JavaScript 语法和相关差异检查通过。未完成开发版真实浏览器、Gradio 6 双入口操作链、完整 Studio、后端/API、GPU、性能及安装版验收；P11 总验收未完成。

### 13.463 Preset 配置查询迁移（2026-09-28）

- 对应拆分日志第 1246 节。Preset schema、主题、主题数据、可见上传槽及槽位标签由 `canvas_config_values_controller.js` 读取；主 workbench 仅保留原有代理，Classic 上传槽继续共用该模块。槽位排序和默认标签来自既有注册表，主题覆盖、隐藏槽过滤、标签优先级与空槽默认值不变。未增加页面资源、项目字段或可见文字。
- 验证：相关 Node 44 项、Python 合同 15 项通过，关联布局/节点创建/运行/上传路径 Node 89 项、Python 合同 30 项通过，包含独立页完整脚本调用；脚本语法和目标文件差异检查通过。未执行开发版真实浏览器、Gradio 6 操作链、完整 Studio、后端/API、GPU、性能或安装版验收；P11 总验收未完成。

### 13.464 上传槽媒体类型判断迁移（2026-09-28）

- 对应拆分日志第 1247 节。上传槽媒体类型由 Connection Media controller 根据槽位名称判断，主文件的同名方法只保留代理；不再由该 controller 回调主文件判定类型。移除没有调用者的图标函数。大小写、audio 优先、未知槽位默认 image 和所有来源兼容规则不变，独立页及 Gradio 6 资源清单未改，没有新增中英文界面文字。
- 验证：专项 Node 57 项、Python 合同 19 项，其他共享路径 Node 41 项、Python 合同 44 项通过；独立页完整脚本覆盖三种媒体槽位。JavaScript 语法和相关差异检查通过，Python 关联测试仅出现 Triton 弃用警告。未完成开发版真实浏览器、Gradio 6 页面操作、完整 Studio、后端/API、GPU、性能与安装版验收；P11 总验收未完成。

### 13.465 配置类型与字段映射迁移（2026-09-29）

- 对应拆分日志第 1248 节。Preset 配置类型识别和存储字段映射现由 Config Values controller 负责，主 workbench 保留原调用入口，模块使用现有类型列表；配置查询不再依赖主入口回调。未改项目数据、双入口资源顺序和中英文界面文字。
- 验证：专项 Node 82 项，创建/连接/编辑/删除关联 Node 83 项，Python 合同 48 项通过；两处历史测试按迁移后的模块归属更新。脚本语法与目标文件差异检查通过；初次 pytest 的缓存目录拒绝访问警告不影响测试结果，关闭缓存后验证通过。开发版真实浏览器、Gradio 6 操作、完整 Studio、后端/API、GPU、性能和安装版验收未执行；P11 总验收未完成。

### 13.466 翻译方向标签迁入文本节点渲染模块（2026-09-29）

- 对应拆分日志第 1249 节。翻译节点与 Inspector 的方向选项文案由 Text Node renderer 根据当前 `__lang` 生成，主入口移除对应文案回调。方向取值、选择状态、翻译请求与项目存储未变；双入口无需新增页面资源。
- 验证：专项 Node 21 项、关联 Node 28 项、Python 合同 12 项通过；独立页完整脚本覆盖中英文切换，脚本语法和目标文件差异检查通过。尚未进行开发版真实浏览器、Gradio 6 页面、完整 Studio、后端/API、GPU、性能或安装版验收；P11 总验收未完成。

### 13.467 SAM3 与 Uni3C 参数事件修复（2026-09-28 UTC）

- 对应拆分日志第 1250 节。这是迁移检查发现的功能修复：SAM3 视频遮罩、Uni3C 运镜节点的参数输入现在会调用各自节点模块的更新动作，主入口中未使用的旧代理已移除。节点参数、历史与保存沿用原模块处理，双入口资源和中英文界面文字未变。前两节使用本地日期，本节使用 UTC 日期。
- 验证：独立页完整脚本从失败变为通过，相关 Node 53 项、Python 合同 20 项通过；语法与目标文件差异检查通过。扩展 SAM3 合同另有 2 项未通过，分别涉及已迁走的旧函数名和本项未改的后端视频裁剪断言，不属于已通过的验证。开发版真实浏览器、Gradio 6 页面、完整 Studio、后端/API、GPU、性能和安装版验收未执行；P11 总验收未完成。

### 13.468 主入口无调用辅助函数清理（2026-09-28 UTC）

- 对应拆分日志第 1251 节。主 workbench 删除已无调用者的模式按钮 HTML 辅助函数和节点编辑焦点判断函数；现用的 Shell renderer、Click controller 和输入编辑判断继续保持。合同测试更新文本定位边界，不再依赖已删除的函数。没有更改可见文字、项目字段或双入口资源。
- 验证：关联 Node 20 项、Python 合同 13 项通过；脚本语法和目标文件差异检查通过。上一节的 SAM3 扩展合同 2 项失败未在本节解决；开发版真实浏览器、Gradio 6 页面、完整 Studio、后端/API、GPU、性能和安装版验收未执行；P11 总验收未完成。

### 13.469 SAM3 裁剪合同更新（2026-09-28 UTC）

- 对应拆分日志第 1252 节。将先前失败的两项合同改为检查当前 context 参数和场景视频重建区间的裁剪保护；SAM3 与场景视频运行代码均未修改。原 SAM3 合同 26 项通过，相关合并验证 Python 合同 46 项通过；真实浏览器及后端推理未执行，P11 总验收未完成。

### 13.470 Asset Media 判断归入现有模块（2026-09-28 UTC）

- 对应拆分日志第 1253 节。主入口移除媒体类型和图标的重复实现，交由 Asset Media controller 唯一负责；Gradio 6 与独立页仍按原清单加载，项目数据、公开入口和中英文界面文字未变。
- 验证：专项 Node 19 项、关联 Node 76 项、Python 合同 46 项通过；独立页完整脚本覆盖三类媒体及缺少模块的失败路径，语法和目标文件差异检查通过。开发版真实浏览器、Gradio 6 页面、完整 Studio、后端/API、GPU、性能和安装版验收未执行；P11 总验收未完成。
- 追加验证：独立页入口的 12 个测试文件共 15 项通过；尚无开发版真实浏览器验收。

### 13.471 Qwen TTS 音频来源标签迁入节点模块（2026-09-28 UTC）

- 对应拆分日志第 1254 节。Qwen TTS 节点和 Inspector 的音频来源名称改由节点模块读取实时项目连线；主入口仅提供当前项目与节点查询，不再自己计算标签。音频输入字段优先、来源标题回退及 `state.__lang` 对应的中英文“未连接”提示保持，未改资源清单、公开 API 或项目结构。
- 验证：专项 Node 14 项、独立页完整入口 Node 16 项、Python 合同 10 项通过，语法与差异检查通过。开发版真实浏览器、Gradio 6 页面完整操作链、完整 Studio、后端/API、GPU、性能及安装版验收未执行；P11 总验收未完成。

### 13.472 节点状态与 Preset 模型状态统一由控制器提供（2026-09-28 UTC）

- 对应拆分日志第 1255 节。主入口不再重复计算节点锁定、忽略、折叠、图像无边框和 Preset 模型状态；前三类由已有 Node State / Run State 模块负责，模型状态由 Preset Model Status controller 负责。状态优先级、模型自动检查、教学示例及现有中英文文案保持，双入口资源和项目格式未变。
- 验证：状态专项 Node 9 项、独立页入口与关联渲染 Node 42 项、Python 合同 23 项通过，脚本语法和目标差异检查通过。开发版真实浏览器、Gradio 6 完整操作链、完整 Studio、后端/API、GPU、性能及安装版验收未执行；P11 总验收未完成。

### 13.473 入口路径与基础几何调用统一（2026-09-28 UTC）

- 对应拆分日志第 1256 节。主入口静态资源路径、默认节点尺寸与矩形相交判断只调用 Utils、Registry、Viewport 模块；两种页面入口仍按原顺序加载这些资源。没有新增界面文字，项目结构和公开 API 不变。
- 验证：完整独立页入口和相关模块 Node 30 项、Python 合同 9 项通过，语法及差异检查通过。初次扩展合同 2 项断言与既有页面加载方式不符，更新并重测通过。开发版真实浏览器、Gradio 6 完整操作链、完整 Studio、后端/API、GPU、性能和安装版验收未执行；P11 总验收未完成。

### 13.474 Result 轮询页面更新迁入状态控制器（2026-09-28 UTC）

- 对应拆分日志第 1257 节。主入口不再遍历 Result 节点和直接查找节点 DOM；Result Status DOM controller 负责状态及预览的轻量刷新，之后保持原顺序更新 Inspector、状态栏和运行队列面板。隐藏页面不刷新，未挂载节点不更新，页面资源与中英文文案均未改。
- 验证：相关 Node 45 项、Python 合同 16 项通过，独立页完整脚本覆盖 `pollUpdate` 实际调用；语法和差异检查通过。扩展合同中两项旧调用位置断言已调整并重测通过。开发版真实浏览器、Gradio 6 完整操作链、完整 Studio、后端/API、GPU、性能和安装版验收尚未执行；P11 总验收未完成。

### 13.475 项目修改后的持久化协调迁入控制器（2026-09-29 本地时间）

- 对应拆分日志第 1258 节。主入口 `mutate` 委托 Project Persistence controller 统一更新时间、失效缓存、自动保存和重绘；保留原有空时间戳处理，页面资源、项目格式和界面文字不变。
- 验证：专项 Node 35 项、扩大关联 Node 73 项、Python 合同 45 项通过，语法和差异检查通过。真实浏览器的该修改链、Gradio 6 页面完整操作链、完整 Studio、后端/GPU、性能和安装版资产尚未验收；P11 总验收未完成。

### 13.476 LayerForge 资源地址失败重试（2026-09-29 本地时间）

- 对应拆分日志第 1259 节。画布打开 LayerForge 时，资源组没有提供适配器会尝试加载独立脚本；推导路径不可用或没有注册适配器时，继续尝试 Gradio 6 文件地址。失败后仍允许再次打开重试，保留原中英双语提示。
- 验证：相关 Node 26 项、Python 合同 15 项通过，语法和差异检查通过；开发页刷新后打开已有图像的编辑器成功。用户遇到的原始失败未在当前开发页复现；Gradio 6 主页面、编辑保存及遮罩、完整 Studio、性能和安装版资产尚未验收，P11 总验收未完成。

### 13.477 LayerForge 加载流程由 Lazy Asset Runtime controller 管理（2026-09-29 本地时间）

- 对应拆分日志第 1260 节。主入口移除 LayerForge 脚本请求与加载状态，向既有 Lazy Asset Runtime controller 提供页面依赖；共享资源组异常、备用地址、并发请求与失败重试由控制器管理。双入口脚本顺序、项目字段和现有中英文文案不变。
- 验证：相关 Node 28 项、独立页完整入口 Node 10 项、Python 合同 27 项通过，语法与差异检查通过；开发页实际打开现有图像的编辑器成功。Gradio 6 主页面完整操作链、编辑保存与遮罩、完整 Studio、后端/GPU、性能和安装版资产未验收，P11 总验收未完成。

### 13.478 页面运行事件由 Lifecycle controller 管理（2026-09-29 本地时间）

- 对应拆分日志第 1261 节。主入口末尾的画布打开、系统参数、状态监控、VLM 目录、后端失败与首次页面 load 监听改由 Lifecycle controller 注册。隐藏页面仍不刷新状态，系统参数更新仍刷新作用域/主题/目录；后端失败提示在事件发生时使用当前 `state.__lang` 的中英文翻译。
- 验证：关联 Node 12 项、Python 合同 19 项通过，脚本语法和差异检查通过；扩大 Gradio 6 可见性合同 22 项中有 7 项失败（旧渲染与 Gallery 断言），未将其视为验收通过。先前 7888 的浏览器结果来自安装目录副本，不能算本开发工作树浏览器验收。Gradio 6 双入口完整操作链、重复打开关闭、性能和发布资产仍待验收；P11 总验收未完成。

### 13.479 Gradio 6 可见性合同与模块调用对齐（2026-09-29 本地时间）

- 对应拆分日志第 1262 节。上一节扩展合同的 7 项失败已逐一检查：画布边缓存、边索引、滚轮与拖动 LOD、滚动隔离的断言改为覆盖主入口注入、现有模块及调用方；Gallery 健康检查的真实生成比较受显式环境选项控制，普通 Visibility smoke 仍保持不触发生成。仅修改测试，运行代码和可见文本未变。
- 验证：关联 Python 合同 41 项、对应画布模块 Node 18 项、Gallery CLI 合同 6 项通过；相关语法及差异检查通过。本开发工作树尚未完成真实浏览器的 Gradio 6 双入口、性能、完整 Studio 和发布资产验收；P11 总验收未完成。

### 13.480 LayerForge 加载器旧注入接口清理（2026-09-29 本地时间）

- 对应拆分日志第 1263 节。复查五次 LayerForge 修复与一次加载流程迁移后，当前脚本加载逻辑已集中在 Lazy Asset Runtime controller；删除仍保留在控制器中、但页面已不再使用的两条旧注入分支，模块测试改为页面实际使用的资源组加载接口。没有撤销现有地址重试及失败后再次操作的能力，也没有新增界面文字。
- 验证：专项 Node 28 项、Python 合同 11 项通过，JavaScript 语法检查通过；Python 的 `.pytest_cache` 写入权限警告未影响断言。未在当前开发工作区启动 Studio 或执行真实浏览器验收，Gradio 6 双入口完整操作链、保存/遮罩、性能与发布资产仍未验收；P11 总验收未完成。

### 13.481 Edge Renderer 绘制依赖迁移记录（2026-09-29 本地时间）

- 对应拆分日志第 1264 节。此前未写入文档的 Edge Renderer 迁移已核对：边界、标签、端点缓存及统计由 Renderer 处理，入口只提供实时项目、视口、标签和性能依赖；SVG / Canvas 两种连线及提示贴尾线继续使用原渲染流程，没有新增可见文字或数据字段。
- 验证：Edge / Note 关联 Node 26 项，Gradio 6 可见性及 Edge / Note 合同 Python 29 项通过，相关脚本语法及目标差异检查通过。尚未在本开发工作区执行真实浏览器的双入口操作、连线与提示贴交互、性能比较或完整 Studio 验收；P11 总验收未完成。

### 13.482 临时连线 DOM 状态迁入 Edge Renderer（2026-09-29 本地时间）

- 对应拆分日志第 1265 节。临时 SVG 连线路径和重建状态由 Edge Renderer 管理，主入口继续向节点渲染提供清理委托；两个交互入口现在共用同一个临时连线绘制回调。Shell 首次路径、整层重绘后恢复和连接取消均有专项测试，未改资源加载项、数据字段或可见文案。
- 验证：关联 Node 72 项、Python 合同 44 项及脚本语法、目标差异检查通过。真实浏览器双入口的拖动/取消、完整 Studio、性能及发布资产仍待验收；P11 总验收未完成。

### 13.483 媒体浏览器条目元信息迁入 Asset Node Renderer（2026-09-29 本地时间）

- 对应拆分日志第 1266 节。列表、详情与画布媒体浏览器节点使用 Asset Node Renderer 的尺寸、分级、大小和时间格式化规则；主入口只传递 Utils 的大小格式化能力并向节点渲染提供模块调用。数据格式、加载清单和现有可见文案不变。
- 验证：关联 Node 61 项、Python 合同 19 项以及相关 JavaScript 语法、目标差异检查通过；尚未在当前开发工作区执行 Gradio 6 与独立页真实浏览器完整操作链、性能或发布资产验收；P11 总验收未完成。

### 13.484 Result 键盘媒体播放迁入 Media Playback controller（2026-09-29 本地时间）

- 对应拆分日志第 1267 节。选中 Result 后按空格的视频、音频播放切换由 Media Playback controller 管理；主入口 Keyboard context 只委托调用，并向控制器提供当前节点层及 CSS 转义。媒体缺失时仍不占用空格，播放失败继续沿用原有处理；Timeline 和普通媒体快捷键、双入口资源及中英文可见文字未变。
- 验证：相关 Node 14 项、独立页完整脚本 Node 1 项、Python 合同 28 项及两个运行脚本语法检查通过。未运行开发工作区 Studio；真实浏览器双入口、完整项目操作、性能及发布资产仍待验收，P11 总验收未完成。

### 13.485 画布主题环境读取迁入 Shell Renderer（2026-09-29 本地时间）

- 对应拆分日志第 1268 节。顶栏主题参数和 document 主题状态由 Shell Renderer 在调用时读取，主入口的主题查询函数只转发；顶栏、HTML、body 和暗色 class 的优先级，以及主题 class 应用均维持原状。无需增加 Gradio 6 或独立页资源，没有新增可见文字或项目字段。
- 验证：关联 Node 61 项、Python 合同 42 项和两个运行脚本语法检查通过；独立页完整脚本测试覆盖主题切换后重新读取。当前开发工作区未启动 Studio；真实浏览器双入口、完整操作链、性能与发布资产仍未验收，P11 总验收未完成。

### 13.486 Agent 选择状态迁入 Selection controller（2026-09-29 本地时间）

- 对应拆分日志第 1269 节。七处 Agent 来源的选择回调现在统一调用 Selection controller；节点集合、边选择、保留分组以及明确清除分组的行为不变。双入口无需新增资源，项目格式和中英文可见文字未改。
- 验证：关联 Node 48 项、Python 合同 24 项及独立页完整脚本七处回调测试通过；LayerForge 加载复查 Node 12 项通过，没有对该加载器再次改动。当前开发工作区未启动 Studio；真实浏览器双入口、完整操作链、性能和发布资产仍待验收，P11 总验收未完成。

### 13.487 悬浮预览属性归入 Hover Preview controller（2026-09-29 本地时间）

- 对应拆分日志第 1270 节。悬浮预览的 HTML 属性由 Hover Preview controller 统一生成；主入口只转发，样式配置节点和公开 `attrs` 方法继续保持原接口。空值过滤、属性名格式及属性值转义保持不变；没有新增双入口资源、项目字段或可见文案。
- 验证：关联 Node 14 项、Python 合同 29 项和改动 JavaScript 语法检查通过；完整独立页脚本覆盖样式节点 HTML 和公开 API。当前开发工作区未启动 Studio；真实浏览器双入口、完整项目操作链、性能和发布资产仍待验收，P11 总验收未完成。

### 13.488 配置选项去重归入 Config Values controller（2026-09-29 本地时间）

- 对应拆分日志第 1271 节。已写入 `HEAD` 的配置选项去重逻辑由 Config Values controller 负责，主入口只转发给 Advanced Config；分辨率编辑模式不再通过主入口回调去重。保持选项顺序、空值过滤和动态 DOM 选项更新，双入口资源、项目数据及中英文可见文字未变。
- 验证：工作区恢复访问后，关联 Node 33 项、Python 合同 27 项和相关脚本语法检查通过；完整独立页脚本覆盖 Advanced Config 选项重复处理。当前开发工作区未启动 Studio；真实浏览器双入口、完整项目操作链、性能和发布资产仍待验收，P11 总验收未完成。

### 13.489 Shell 挂载事件注册归入 Lifecycle controller（2026-09-29 本地时间）

- 对应拆分日志第 1272 节。工作台、分组、Edge、节点媒体、Agent 和 Bridge 的挂载事件由 Lifecycle controller 按原顺序注册；主入口只传入 Shell 返回的元素，继续负责首次渲染和异步预热。Agent 回调在实际挂载时获取，保留无面板、事件冒泡及 wheel passive 行为；未改双入口资源、项目格式或现有双语文案。
- 验证：模块关联 Node 41 项、独立页主入口 Node 29 项、Python 合同 19 项及相关脚本语法、目标差异检查通过。开发工作区 Studio 未启动，真实浏览器双入口、完整操作链、性能和发布资产仍待验收；P11 总验收未完成。

### 13.490 默认节点标题本地化归入 Utils（2026-09-29 本地时间）

- 对应拆分日志第 1273 节。Utils 负责默认节点标题翻译，主入口保留同名代理并按次提供当前 `__lang`；Asset Node 和 Text Node renderer 的接线不变。自定义标题保留原文和原有空白处理。
- 验证：Utils、独立页入口及 Asset/Text renderer 关联 Node 19 项，相关 Python 合同 12 项和 JavaScript 语法检查通过。未启动 Studio；真实浏览器双入口、完整操作链、性能及发布资产仍待验收；P11 总验收未完成。

### 13.491 手柄中心世界坐标换算归入 Viewport（2026-09-29 本地时间）

- 对应拆分日志第 1274 节。Viewport 模块现在负责从手柄 DOM 中心换算世界坐标；主入口只保留调用代理，连接与输入创建仍使用相同入口。平移、缩放和取整规则不变，双入口加载清单及项目格式未改。
- 验证：Viewport、独立页入口、连接及输入创建关联 Node 34 项，相关 Python 合同 16 项和 JavaScript 语法检查通过。未启动 Studio；真实浏览器双入口、完整操作链、性能及发布资产仍待验收；P11 总验收未完成。

### 13.492 LivePortrait Expression 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1275 节。`liveportrait_expression_node.js` 新增 `addNode` 管理创建后的待处理连线、重选节点、重绘和提示；主入口保留转发，context 沿用 Special Node factory 注入连线完成能力。
- 保持原有历史记录、节点坐标、连线完成后选择顺序、`render` / `toast` 选项及自动连接提示；普通创建提示通过当前 `state.__lang` 的 `t` 显示中英文。双入口加载清单、项目格式和 workbench 公开 API 未改。
- 验证：LivePortrait context 与创建、pending image connection 关联 Node 24 项，Special Node Python 合同 11 项和相关 JavaScript 语法检查通过；`.pytest_cache` 写入权限警告未影响断言。未启动 Studio，真实浏览器双入口、完整操作链、性能及发布资产仍待验收；P11 总验收未完成。

### 13.493 Uni3C Camera Motion 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1276 节。`camera_motion_node.js` 新增 `addNode` 负责创建后的 pending connection、重选、重绘与提示；主入口保留代理，并由 Camera Motion context 注入待连线回调。没有调整页面资源和项目格式。
- 保持节点创建、历史记录及坐标行为；连线完成后再次选中节点；`render` / `toast` 开关和当前 `state.__lang` 中英文提示保持原行为。WAN 合同同步改查实际承载摄像参考视频连接及输入菜单的模块。
- 验证：Special Node Node 25 项、Python 合同 11 项通过；WAN 合同 11 项通过，仍有 2 项无关失败：模型包编号期望 46、启动参数合同期望 `args_manager.py` 定义默认语言参数。JavaScript 语法及 `git diff --check` 通过（仅有 LF/CRLF 提示）。未启动 Studio；`.pytest_cache` 写入警告、真实浏览器及 Gradio 6 双入口验收、完整项目操作、性能和发布资产尚未完成；P11 总验收未完成。

### 13.494 Pose Studio 与 Gaussian Studio 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1277 节。Pose 与 Gaussian 节点模块新增 `addNode`，主入口保留代理；各自 context 通过 Special Node factory 获取待处理连线完成回调。
- 保持原节点创建、历史记录和数据写入；创建后完成 pending connection，再设置节点选择、按原选项重绘并提示。普通创建提示使用当前 `state.__lang` 中英文显示，自动连线提示保持原行为；双入口加载清单与项目格式未改。
- 验证：Special Node 与 pending image connection Node 26 项、Python 合同 11 项通过，相关 JavaScript 语法检查通过；`.pytest_cache` 权限警告未影响断言。未启动 Studio，真实浏览器和 Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.495 Qwen TTS 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1278 节。Qwen TTS 节点模块的 `addNode` 管理创建后的待处理连线、重选节点、重绘和提示；主入口保留模块检查、默认模式与视口中心坐标，context factory 提供连线完成回调。
- 保持节点创建、历史记录、`render` / `toast` 选项及连线后的选择顺序。普通提示读取当前 `state.__lang` 显示中英文；模块未加载时的双语提示继续由主入口显示。双入口资源、项目格式和 workbench 公开 API 未改。
- 验证：Qwen TTS context Node 8 项、Python 合同 4 项通过，主入口及节点模块语法检查通过。未启动 Studio；真实浏览器、Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.496 SAM3 Video Mask 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1279 节。SAM3 Video Mask 节点模块的 `addNode` 接管创建后的待处理连线、节点重选、重绘与提示；主入口保留代理，SAM3 context factory 提供现有连线完成能力。
- 节点数据、历史记录、位置、加入项目和默认标题继续由原创建逻辑处理；连线后再次设置节点选择，`render` / `toast` 选项不变。普通提示按当前 `state.__lang` 显示中英文；自动连线提示包含双语前缀。页面资源和项目格式未改。
- 验证：特殊节点 context Node 15 项、Python 合同 11 项通过，主入口、SAM3 模块和测试脚本语法检查通过。未启动 Studio；真实浏览器、Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.497 Director Timeline 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1280 节。Director Timeline 节点模块新增 `addNode` 管理创建后的待处理连线、重选、重绘与提示；时间轴创建控制器仍处理模块缺失提示及默认视口坐标，只转发选项和节点 context。
- 节点创建、历史记录、项目追加与初次选择沿用原逻辑；模块完成待处理连线后再次设置选择，按 `render` / `toast` 控制重绘和提示。普通提示使用当前 `state.__lang` 对应的中英文；双入口资源和项目格式未改。
- 验证：Director Timeline 节点与时间轴创建 Node 21 项、Python 合同 6 项通过，主入口、节点模块和创建控制器语法检查通过。未启动 Studio；真实浏览器、Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.498 Compare 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1281 节。Compare 节点模块的 `addNode` 接管普通节点创建的历史记录、布局、项目追加、待处理连线、重选、重绘和提示；创建控制器转发普通创建请求。
- 从所选图片创建 Compare 节点的筛选、位置计算、两条输入边和专用提示仍由控制器管理，并复用节点模块的创建入口。普通提示按当前 `state.__lang` 显示中英文；页面资源、项目字段和公开 API 未改。
- 验证：Compare 节点与创建控制器 Node 10 项、Python 合同 3 项通过，主入口、节点模块和创建控制器语法检查通过。未启动 Studio；真实浏览器、Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.499 Style Selector 节点创建收尾迁入节点模块（2026-09-29 本地时间）

- 对应拆分日志第 1282 节。Style Selector 节点模块接管普通创建生命周期，context 注入布局、项目追加、待处理连线和 `setSelectedStyle`；主入口直接转发，Aux controller 保留 preset 校验、已有 selector 复用及自动创建后的选择和提示流程。
- 保持风格设置、布局、项目追加、静默 preset 关联、连线完成、选择、重绘和提示的原有顺序。自动 preset 创建继续通过 `render:false`、`toast:false`、`select:false` 避免重复处理；语言由当前 `state.__lang` 对应的工具回调读取。
- 验证：关联 Node 43 项、Python 合同 15 项和 JavaScript 语法检查通过。完整独立页入口测试仍在已有 Compare context 初始化处因 `pushHistory` 暂时性死区失败；当前开发工作区未启动 Studio，真实浏览器、Gradio 6 双入口完整操作、性能、发布资产及 P11 总验收未完成。

### 13.500 Compare context 入口初始化顺序修复（2026-09-29 本地时间）

- 对应拆分日志第 1283 节。Compare context 的历史回调在实际调用时才读取 `pushHistory`，避免主入口初始化时提前访问 History controller；第 13.499 节记录的完整入口测试失败已消除。Compare 创建、项目数据、可见提示与加载清单未变。
- 验证：Compare、Style Selector、Aux controller 与完整入口 Node 54 项、相关 Python 合同 17 项、主入口语法检查通过；pytest 缓存权限警告不影响测试断言。未启动 Studio；真实浏览器的 Gradio 6 双入口完整操作、性能、发布资产与 P11 总验收仍未完成。

### 13.501 Styles Config 列表过滤迁入 Config Edit controller（2026-09-29 本地时间）

- 对应拆分日志第 1284 节。Style 搜索输入事件在 Config Edit controller 内直接过滤卡片；主入口移除旧过滤函数和回调注入。卡片名称优先、文字内容后备、去空格及不区分大小写的行为保留，空搜索恢复全部卡片；可见文案和项目格式未改。
- 验证：Config Edit 与完整入口 Node 20 项、Python 合同 6 项、相关 JavaScript 语法检查通过；pytest 缓存权限警告不影响断言。未启动开发版 Studio；Gradio 6 双入口真实浏览器、性能、发布资产与 P11 总验收仍待完成。

### 13.502 Batch Any 输入边合同更新（2026-09-29 本地时间）

- 对应拆分日志第 1285 节。XYZ 合同改查 Batch Any connection controller 的 `batch_input` 边构建及主入口转发，不再将迁移后的边类型实现归到主入口；本项没有运行行为和界面变化。
- 验证：相关 Python 合同 11 项、Batch Any Node 35 项及测试脚本语法检查通过，原有 XYZ 合同失败已消除。当前开发工作区未启动 Studio；真实浏览器 Gradio 6 双入口、性能、发布资产及 P11 总验收仍待完成。

### 13.503 Preset 上传槽位写回迁入 Node Factory（2026-09-30 本地时间）

- 对应拆分日志第 1286 节。Preset / Classic 上传槽位写回由 Node Factory 与已有的槽位变更构造函数共同管理，主入口仅转发；上传连线和媒体替换的调用入口不变，旧槽位对象保持独立。无效输入行为、项目数据、双入口资源和中英文可见文字未改。
- 验证：Factory、上传连线、待处理连接、媒体替换与完整独立页入口 Node 56 项，相关 Python 合同 23 项和脚本语法检查通过。当前开发工作区未启动 Studio；Gradio 6 双入口真实浏览器、完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.504 Classic 检测配置候选值迁入 Config Values controller（2026-09-30 本地时间）

- 对应拆分日志第 1287 节。Mask Model、Cloth Category 和 SAM Model 的候选值从主入口组装迁入 Config Values controller；主入口继续传入 Classic registry 并提供转发函数。默认值和空数组语义不变，Detection renderer 无需改动，双入口资源和中英文可见文案未变。
- 验证：Config Values、Detection renderer、完整入口 Node 31 项及专项 Python 合同 5 项、语法检查通过。扩大检查发现的 Compare 旧合同失败由第 13.505 节处理；当前开发工作区未启动 Studio，Gradio 6 双入口真实浏览器、性能、发布资产与 P11 总验收仍未完成。

### 13.505 Compare 创建别名合同更新（2026-09-30 本地时间）

- 对应拆分日志第 1288 节。Compare context 的 Python 合同改查现有 `addNode` 别名和创建转发，移除对旧 `createNode` 别名的期待。本项没有改变运行行为、项目数据或可见文案。
- 验证：Config Values / Detection / Compare 相关 Python 合同 18 项，Compare 与完整独立页入口 Node 11 项通过，先前扩展检查中的旧合同失败消除。当前开发工作区未启动 Studio；Gradio 6 双入口真实浏览器、完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.506 特殊节点静默选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1289 节。SAM3、Camera Motion、Pose Studio、Gaussian Studio、LivePortrait Expression 的五处选择回调现在交给 Selection controller 写入节点、边和分组选择；模块不会在写入时额外重绘。其他节点及 Agent 选择行为、项目格式、资源与中英文可见文字未改。
- 验证：专项 Node 38 项、Python 合同 18 项和脚本语法检查通过；完整独立页脚本覆盖五处真实回调与空 ID。开发工作区 Studio 未启动，Gradio 6 双入口真实浏览器、完整操作、性能、发布资产及 P11 总验收仍待完成。

### 13.507 设置页面板渲染迁入 Settings controller（2026-09-30 本地时间）

- 对应拆分日志第 1290 节。Settings controller 负责设置页可见性判断、Agent 状态与项目设置读取、现有视图渲染及表单字段命名；主入口只提供当前依赖并转发渲染调用。打开页面、切换页签与设置操作沿用原顺序，现有双语文字、页面资源和项目数据未变。
- 验证：相关 Node 17 项、Python 合同 8 项和语法检查通过；独立页完整脚本实际渲染可见设置页，并验证语言切换后标题更新。当前开发工作区未启动 Studio；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产和 P11 总验收仍待完成。

### 13.508 框选选择状态迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1291 节。框选的选择集合交由 Selection controller 写入当前节点、边与分组状态；主入口保留 Marquee 回调转发，框选过程中的 DOM、minimap 和面板更新顺序不变。最后一个选中 ID 继续作为当前节点，空集合清空选择，不增加重绘；双入口加载清单、项目数据及中英文可见文字未变。
- 验证：Marquee、Selection 与独立页联动 Node 16 项，相关 Python 合同 9 项、脚本语法检查通过。未启动当前开发工作区 Studio；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍未完成。

### 13.509 Compare 创建后的节点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1292 节。Compare 普通创建与从图片创建的选择回调不变，主入口 `setCompareNodeSelection` 现在委托 Selection controller 写入节点和边选择，分组选择与空 ID 行为保持原样；Agent 的同语义操作使用同一方法。没有新增可见文字，语言仍使用现有 `state.__lang` 路径；页面资源和项目数据未改。
- 验证：Compare、Selection、Agent 与独立页入口 Node 26 项、Python 合同 10 项和脚本语法检查通过。当前开发工作区 Studio 未启动；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产及 P11 总验收尚未完成。下一项需单独核对 Qwen TTS / Director Timeline 的空 ID 与分组行为。

### 13.510 Qwen TTS 与 Director Timeline 的节点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1293 节。两种节点 context 通过 Selection controller 更新单节点选择；空 ID（`null`）仍保留在选择集合中，同时清除边与分组，不额外重绘。Compare 保留分组和其他特殊节点清空集合的语义不变；创建、项目字段、双入口资源与现有中英文文字均未修改。
- 验证：相关 Node 31 项、Python 合同 17 项、脚本语法检查通过；独立页脚本实际调用两处回调并检查 `null` 行为。开发工作区 Studio 未启动，Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍待完成。

### 13.511 连线目标、生成元数据和图库节点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1294 节。三处回调现在复用 Selection controller 的单节点状态写入；连线目标的界面刷新仍在写入后执行。普通媒体导入仍只更改当前节点与边，不清除旧选择集合和分组。现有 `state.__lang` 双语文字、项目字段与两套页面资源清单未变。
- 验证：独立页脚本实际调用三处回调并检查刷新先后及普通导入的不同语义；媒体导入与生成元数据抽取式测试桩更新后重新通过，合并 Node 106 项、Python 合同 28 项及语法检查通过。开发工作区 Studio 未启动；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍未完成。

### 13.512 Style Selector 节点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1295 节。Style Selector context 通过 Selection controller 写入当前节点，`null` 时选择集合清空，边和分组选择清除；节点模块仍管理创建、风格应用与预设联动的调用顺序。双入口加载清单、项目结构和现有中英文显示未变。
- 验证：完整独立页脚本实际调用回调并覆盖 `null`，相关 Node 57 项、Python 合同 30 项及脚本语法检查通过。开发版 Studio 未启动；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍待完成。

### 13.513 Aux 创建时的选择状态迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1296 节。Aux controller 的创建选择按是否清除分组调用对应的 Selection 方法，仍按旧规则重建单节点集合、清除边并处理分组；Preset / Manual Output 继续只修改当前节点和边，保留原选择集合。创建流程、现有 `state.__lang` 双语显示、项目字段与两套页面资源清单均未改。
- 验证：Aux 测试桩使用真实 Selection controller，独立页脚本实际调用分组两种分支及未改的 Preset / Manual Output 回调。相关 Node 58 项、Python 合同 30 项及语法检查通过。开发工作区 Studio 未启动；Gradio 6 双入口真实浏览器、完整项目操作、性能、发布资产和 P11 总验收仍未完成。

### 13.514 Preset、Manual Output 与普通媒体导入的焦点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1297 节。三处回调通过 Selection controller 只改当前节点与边；原 `selectedNodeIds` Set 对象及分组保持不变，包括传入 `null` 的行为。状态接口按字段写入，其他创建和导入路径的集合选择仍沿用原方法；Gradio 6 与独立页资源、项目格式和当前 `state.__lang` 双语文字不变。
- 验证：模块与独立页完整脚本检查三处实际回调、集合身份和分组，相关 Node 112 项、Python 合同 33 项、脚本语法及 `git diff --check` 通过。开发工作区 Studio 未启动；真实浏览器双入口、完整项目操作、性能、发布资产和 P11 总验收仍待完成。

### 13.515 Timeline、Batch Any 与输入源创建复用 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1298 节。三个创建回调复用保留分组的单节点选择，仍清除边并重建选择集合；创建时序、`null` 成员、现有中英文显示、项目数据和 Gradio 6 / 独立页加载清单不变。主入口不再为这三处直接写入选择状态。
- 验证：完整独立页脚本调用实际回调，Batch Any 与 Mask 创建测试桩接入真实 Selection controller；Mask 测试旧桩缺少 `sam3AddNode` 的 6 项既有失败已通过绑定现有节点方法排除，未调整 SAM3 生产逻辑。同步 Timeline 的旧分组赋值合同后，合并 Node 188 项、Python 合同 47 项、语法和 `git diff --check` 通过。开发工作区 Studio 未启动，真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.516 运行与结果选择状态归入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1299 节。Scheduler、Qwen TTS、Batch Any、Preset 运行和结果媒体转换的五处选择回调共用可空节点规则：有节点则选中，空节点清空集合，同时清除边并保留分组；媒体转换的清除回调仍不更换集合。与创建类回调的空 ID 单成员规则保持区分，执行流程、项目字段、双入口加载资源和现有 `state.__lang` 双语显示均未改。
- 验证：控制器测试与独立页完整脚本覆盖节点缺失及分组、集合身份；相关 Node 215 项、Python 合同 59 项和脚本语法、`git diff --check` 通过。开发工作区 Studio 未启动；真实浏览器双入口、完整项目操作、性能、发布资产和 P11 总验收仍未完成。

### 13.517 媒体替换、Batch Any 连线与 Director 初始结果的选择归入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1300 节。三处回调复用保留分组的单节点选择，仍更换选择集合并清除边；Director 最终结果保留原边选择的特殊行为。没有改运行顺序、项目数据、双入口资源或现有 `state.__lang` 双语文字。
- 验证：完整独立页脚本调用四处实际回调，图片与媒体替换测试桩接入真实控制器，Python 合同区别两种 Director 结果。专项 Node 55 项、Python 26 项、相关语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍未完成。

### 13.518 Note、Result、媒体控件与 XYZ 选择回调迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1301 节。Note 尾部拖动和 Result 删除清除分组，媒体播放控件与 XYZ 编辑器保留分组；四处仍更新单节点集合并清除边，后续渲染、定位与删除顺序保持不变。双入口加载清单、项目结构和现有双语文字未改。
- 验证：独立页脚本调用实际回调，检查空 ID、集合对象与后续调用；Python 合同检查调用顺序。关联 Node 45 项、Python 22 项及语法、目标文件 `git diff --check` 通过。开发工作区 Studio 未启动；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.519 H3、LTX 2.3 与 LivePortrait 编辑器选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1302 节。三种编辑器复用已有的单节点选择接口，仍清除边和分组，空 ID 保留在选择集合中；编辑器执行流程、项目格式、双入口加载清单及中英文显示未变。
- 验证：独立页完整脚本调用三处真实回调并检查集合替换及 `null`；相关 Node 19 项、Python 合同 15 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.520 Node Browser 与 Asset Manager 定位选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1303 节。两个定位回调在有目标节点时复用保留分组的单节点选择；无目标时不修改选择，随后移动视口并重绘。页面加载清单、项目字段和现有双语文字不变。
- 验证：完整独立页脚本调用两个实际回调并检查集合身份和空节点；Python 合同检查视口定位与渲染顺序。相关 Node 7 项、Python 17 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.521 Director 最终结果与 Mask 结果的边选择保留规则迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1304 节。两处结果选择回调复用新方法，只更换节点集合，保留已有边和分组；空 ID 留在单成员集合中。Director 初始结果仍清除边，两种选择行为保持区别；页面加载、项目字段与现有双语文字不变。
- 验证：Selection 模块及完整独立页脚本实际调用两处回调，Director 与 Selection 源码合同同步；相关 Node 35 项、Python 17 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.522 指针、上传连线、特殊桥接与结果转换焦点选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1305 节。四处回调共用只更改当前节点与边的焦点方法，保留节点集合对象和分组；特殊桥接在 `select` 为假时仍只清边，指针选择后刷新顺序不变。双入口资源、项目结构与现有双语显示未修改。
- 验证：独立页完整脚本调用上传、桥接与结果转换回调；指针源码合同检查刷新顺序，旧上传和桥接合同同步。相关 Node 49 项、Python 合同 25 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.523 VLM Agent 目标选择迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1306 节。VLM 目标回调通过控制器写入当前节点、选择集合和边，按 `clearGroup` 决定是否清除分组；空字符串 ID 仍作为当前节点值保留而不进入集合。没有改运行调用、项目字段、双入口资源和现有双语显示。
- 验证：Selection 模块及独立页脚本验证有效 ID、`null`、空字符串和分组分支；相关 Node 108 项、Python 合同 79 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.524 模板、项目与性能诊断的选择重置迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1307 节。四处回调复用统一选择重置，仍将当前节点、边和分组设为空，并更换节点集合；项目加载、模板创建和性能诊断原执行顺序保持不变。双入口资源、项目字段及中英文显示未改。
- 验证：Selection 模块与独立页脚本测试重置和三处可直接访问的回调；模板回调由源码合同和模块专项覆盖。相关 Node 87 项、Python 合同 32 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.525 组交互选择状态迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1308 节。组交互回调使用无重绘的组选择方法，仍清除节点与边、更换空集合；`selectGroupLight` 保留重复选择判断及原有刷新时机。页面资源、项目结构和现有中英文显示未改。
- 验证：Selection 模块及独立页脚本检查有效组、空组和重复赋值；相关 Node 33 项、Python 合同 21 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.526 Agent 工作流组焦点与公开项目加载焦点清理迁入 Selection controller（2026-09-30 本地时间）

- 对应拆分日志第 1309 节。Agent 工作流布局只更新组焦点；公开 `loadProject` 只清当前节点与边，原集合对象及分组均保留，加载时序不变。双入口资源、项目字段与现有双语文字未修改。
- 验证：Selection 模块和独立页脚本调用组焦点回调，公开项目加载的接线由 Python 合同检查；专项 Node 29 项、Python 合同 24 项、语法及目标文件 `git diff --check` 通过。公开 `loadProject` 未在真实浏览器操作；Studio 双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.527 公开项目加载焦点选择的完整脚本验证（2026-09-30 本地时间）

- 对应拆分日志第 1310 节。完整独立页脚本现实际调用公开 `loadProject`，验证只清当前节点和边、保留原集合对象与分组。只改测试，不调整运行时代码、页面资源、项目格式或中英文显示。
- 验证：相关 Node 29 项、语法及目标文件 `git diff --check` 通过；公开入口仍未在真实浏览器验证，双入口完整操作、性能、发布资产和 P11 总验收待完成。

### 13.528 Director Timeline 无调用入口转发清理（2026-09-30 本地时间）

- 对应拆分日志第 1311 节。主脚本移除八个无局部调用的 Director Timeline 转发函数；编辑与拖动实现及 context 映射保持原位置，Inspector 的实际入口未变。项目格式、双入口资源和现有中英文文字未改。
- 验证：相关 Node 14 项、Python 合同 6 项、语法及目标文件 `git diff --check` 通过。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.529 Director 分段运行无调用入口转发清理（2026-09-30 本地时间）

- 对应拆分日志第 1312 节。七个主脚本无调用转发移除；能力校验、媒体整理、Timeline 查找及提示词编译仍由原 controller 完成，有调用的分段运行入口保持原状。项目格式、双入口资源及按 `state.__lang` 呈现的双语文字未改。
- 验证：Director Node 25 项、Python 合同 30 项及入口语法通过。旧合同中的布局类型判断和无调用转发检查已改为检查实际归属。未启动 Studio；真实浏览器双入口、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.530 独立页入口范围更新与 Director 无调用转发清理（2026-09-29 会话当前日期）

- 对应拆分日志第 1313 节。后续画布 P11 验收只针对 `webui.py` 的独立页面；以前的双入口说明是历史记录，不再要求验证 Gradio 内嵌画布。`modules/ui_gradio_extensions.py` 中尚存未被活跃配置引用的旧画布清单，其合同迁移和删除另行处理，共用 Studio 资源不在清理范围。
- 主入口移除五个无调用的 Director 转发，保留 controller 的行为实现。入口合同现在检查独立页加载顺序和 Gradio 活跃分组不含画布，不再将旧画布清单视作入口。相关 Node 19 项、Python 32 项及主入口语法通过；真实独立页浏览器、完整项目、性能和发布产物仍待验收。
- 编号接续 13.529，前序条目的日期保持历史原文。

### 13.531 Director 分段校验入口与独立页合同整理（2026-09-29 会话当前日期）

- 对应拆分日志第 1314 节。移除主脚本三个无调用的 Director 校验、媒体组合转发；实现保持在原有 controller 中。Director 加载合同改为只检查 `webui.py` 独立页的模块顺序与唯一加载，不再把停用的 Gradio 画布清单当作入口。业务行为、项目格式和按 `state.__lang` 显示的文字未改。
- 验证：相关 Node 19 项、Python 合同 32 项、主脚本和测试脚本语法通过；四条既有 Triton 弃用警告。浏览器操作、完整项目、性能、发布产物和旧 Gradio 清单的其余合同迁移未执行，P11 总验收仍待完成。

### 13.532 Director 片段计算 context 直连 validation controller（2026-09-29 会话当前日期）

- 对应拆分日志第 1315 节。媒体引用、片段和 Timeline 时长相关六类回调现在从 context 直接访问 validation controller，主入口不再保留同名纯转发函数；回调缺省值仍与之前一致。独立页加载清单、项目结构、API 请求和现有双语文字不变。
- 验证：独立页完整脚本覆盖六类回调的参数、返回值和方法不可用分支；Node 19 项、Python 合同 32 项及脚本语法通过。四条既有 Triton 弃用警告；真实浏览器、完整项目操作、性能与独立页发布资产未验证，P11 不标记完成。

### 13.533 Director 运行回调直连原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1316 节。九类能力、提示词、前序片段、结果资产与 payload 回调改由各 context 直接调用 Director controller，移除主入口纯转发；可选方法返回缺省值及原 payload 对象身份保持不变。独立页入口清单、项目格式、API 请求和中英文可见文字均未改。
- 验证：独立页完整脚本测试九类回调及方法缺失分支；Node 19 项、Python 合同 32 项、脚本语法通过。旧合同第一次因要求已移除函数而失败，调整检查对象后复测通过；Python 另有四条既有 Triton 弃用警告。真实独立页操作、完整项目、性能和发布产物未验证，P11 仍未完成。

### 13.534 媒体浏览器状态 context 直连原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1317 节。11 个无业务实现的媒体浏览器状态转发从主脚本移除，原有 factory、render、drag、interaction、data 和 panel context 直接访问状态 controller。独立页资源、项目结构、请求和双语显示均未修改；主入口当前 16,665 行，未增加模块。
- 验证：独立页完整脚本覆盖九类实际回调，控制器专项和源码合同覆盖全部 11 类；关联 Node 125 项、Python 33 项及语法检查通过。数据测试曾因旧测试桩导致超时，调整注入点后通过；五项合同旧断言也已复测通过。真实独立页操作、项目完整流程、性能、发布资产与遗留 Gradio 清单未验收，P11 保持未完成。

### 13.535 媒体浏览器数据 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1318 节。六个面板及节点的数据回调从主入口转发改为直接调用已有数据控制器；节点渲染、Aux 创建、交互、面板与滚动的运行时调用仍按原时机执行。主入口为 16,647 行，页面资源、请求、项目字段和中英文可见文字不变。
- 验证：独立页完整脚本调用六类实际回调；媒体浏览器、Aux、渲染和滚动 Node 专项通过，Python 合同 27 项、相关语法及目标文件 `git diff --check` 通过。旧测试桩和三条源码断言调整后复测通过；首次 Python 运行的 `.pytest_cache` 权限警告通过禁用缓存绕过。未启动 Studio；独立页真实浏览器、完整项目流程、性能、发布资产及 P11 总验收仍待完成，停用的 Gradio 画布清单未清理。

### 13.536 媒体浏览器交互 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1319 节。面板与节点字段读取、节点点击、修改和按键共五个转发从主入口移除；数据、面板及节点事件 context 访问现有交互控制器。主入口为 16,632 行，独立页资源、项目结构、请求和双语文字不变。
- 验证：独立页完整脚本覆盖五类实际回调，关联 Node 221 项、Python 合同 45 项、语法与目标文件 `git diff --check` 通过。扩大专项暴露三条媒体导入旧测试与一条源码合同仍指向旧状态函数，更新测试后复测通过；生产媒体导入未修改。没有启动 Studio；独立页真实浏览器、完整项目流程、性能、发布资产与 P11 总验收仍未执行，未使用的 Gradio 画布清单仍待整理。

### 13.537 媒体浏览器操作 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1320 节。复制提示词、应用提示词与删除本地条目的主入口转发移除；节点交互和面板 context 直接访问现有操作控制器。主入口为 16,623 行；资源、请求、项目字段和双语提示不变。
- 验证：独立页完整脚本调用三项操作回调，专项 Node 185 项、Python 合同 39 项、相关脚本语法及目标文件 `git diff --check` 通过。交互和面板用例改为替换实际控制器方法；未启动 Studio，真实独立页浏览器、完整项目流程、性能与发布资产仍待验收，P11 未完成；停用的 Gradio 画布清单本节未处理。

### 13.538 媒体浏览器面板 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1321 节。打开与渲染面板的两处主入口转发移除，交互、数据和早期创建的画面刷新 context 在调用时直接访问面板控制器。主入口为 16,617 行；独立页资源、项目结构、请求和双语显示不变。
- 验证：独立页完整脚本覆盖打开及两处渲染回调，关联 Node 203 项、Python 合同 45 项、语法与目标文件 `git diff --check` 通过；数据渲染失败用例替换实际控制器方法后仍通过。未启动 Studio，真实独立页浏览器、完整项目操作、性能、发布资产及 P11 总验收仍待完成；停用的 Gradio 画布清单本节未处理。

### 13.539 媒体浏览器导入 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1322 节。面板选中条目、节点单项及视口拖放载荷的三处导入回调直接调用媒体导入控制器，主入口不再保留这些转发。主入口为 16,608 行，独立页资源、项目格式、请求与中英文文字不变。
- 验证：独立页完整脚本覆盖三个 context，关联 Node 196 项、Python 合同 48 项、语法及目标文件 `git diff --check` 通过。文件分类旧测试桩第一次因缺少控制器失败，迁移注入点后复测通过；生产文件分类未改。未启动 Studio，真实独立页浏览器、完整项目操作、性能、发布资产和 P11 总验收仍未执行，停用的 Gradio 画布清单本节未处理。

### 13.540 画廊遮罩 context 直接调用原控制器（2026-09-29 会话当前日期）

- 对应拆分日志第 1323 节。五个纯转发从主入口移除，节点渲染、媒体浏览器、项目与模板、生命周期、性能诊断及公开加载继续调用现有画廊遮罩控制器，调用时机与行为未改。资源、项目数据和按 `state.__lang` 显示的中英文均未修改；旧 Gradio 画布资源清单及其 249 个历史合同文件留待单独整理。
- 验证：完整独立页脚本实际调用五类遮罩回调，关联 Node 172 项、Python 合同 15 项、相关语法和目标差异检查通过。初次扩大验证的五项 Node 与两项 Python 失败来自旧测试桩和源码断言，更新注入点后复测通过。本开发工作区 Studio 未启动，真实浏览器、完整项目操作、性能、发布资产和 P11 总验收待完成。

### 13.541 停用 Gradio 画布清单与独立页合同对齐（2026-09-29 会话当前日期）

- 对应拆分日志第 1324 节。删除 Gradio 扩展模块中没有进入活跃 `lazy_assets` 的画布资源清单及 330 个仅供该清单使用的脚本路径定义；共享 Canvas Utils、API 与画布 CSS 保留。原清单的全部脚本在独立页资源中存在，独立页入口与运行时代码未改；合同不再把已停用的 Gradio 清单当作画布加载证据，可见中英文及项目数据不变。
- 验证：独立页 Node 7 项、入口 Python 专项 29 项及 WAN 相机节点专项通过，语法和差异检查通过。扩大测试 1030 通过、15 失败（旧画布源码合同 4、Gradio 主界面合同 8、LTX 工作流 2、性能日志 1）；另外 WAN 全文件测试有 3 条非入口断言失败。这些失败没有作为本节的成功验收。本开发工作区 Studio 未启动，真实浏览器、完整项目流程、性能、发布资产及 P11 总验收仍未完成。

### 13.542 画布源码合同更新至当前控制器（2026-09-30 本地时间）

- 对应拆分日志第 1325 节。四份旧合同改查 XYZ 编辑器的批次任务 patch、Preset Runtime 的 Director Segment Payload 控制器、Preset Serialization 的 Director Preset Validation 控制器及 Config Values 自身的分辨率模式合并。仅修改测试；运行时代码、独立页入口、项目与接口、中英文显示均未更改。
- 验证：关联 Python 合同 23 项、Node 行为及入口测试 61 项、合同语法和目标差异检查通过。第 13.541 节记录的其余 11 条扩大测试失败和 WAN 全文件 3 条失败本节未复测；本开发工作区 Studio 未启动，独立页真实浏览器、完整项目操作、性能、发布资产和 P11 总验收仍待完成。

### 13.543 Preset Run 无调用主入口转发清理（2026-09-30 本地时间）

- 对应拆分日志第 1326 节。八个只在主入口定义、没有调用的 Preset Run 转发已移除；控制器中的实际运行能力未删，结果排序等仍有调用的转发保留。合同现检查旧入口缺席及现有控制器方法；运行路径、项目格式、独立页资源和按 `state.__lang` 显示的中英文没有修改。
- 验证：相关 Python 合同先后通过 20 项、19 项（两组有重复），Node 先后通过 18 项、12 项，脚本与合同语法及目标差异检查通过。此前记录的其他 11 条扩大测试失败及 WAN 全文件 3 条失败未复测。本开发工作区 Studio 未启动，独立页真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍未完成。

### 13.544 Result Staleness 回调直接使用控制器（2026-09-30 本地时间）

- 对应拆分日志第 1327 节。Scheduler Run、Qwen TTS 与 Preset Run 的三个回调在调用时直接访问原 Result Staleness controller；缺少方法时仍返回 `false`。主入口三个无其他调用的代理移除，控制器内部的指纹、过期判断与状态写回不变。独立页资源、项目、接口及 `state.__lang` 对应的可见文字未改。
- 验证：独立页完整脚本实际检查三个回调及缺失方法分支；Python 合同先后 11 项、21 项，Node 先后 20 项、6 项通过（两组均有重复），语法及目标差异检查通过。未启动开发工作区 Studio；原有其他 11 条扩大测试失败和 WAN 全文件 3 条失败未复测，独立页真实浏览器、完整项目操作、性能、发布资产和 P11 总验收仍待完成。

### 13.545 Preset 上传边及指纹直接使用已有控制器（2026-09-30 本地时间）

- 对应拆分日志第 1328 节。四处上传边回调与两处指纹回调直接访问原控制器，延迟取值与空数组、空字符串的原返回规则不变；主入口两个纯转发移除。H3、Agent、Preset Run 与 Result Staleness 使用的模块及可见双语文字没有修改。四条 H3 旧合同改查已迁移的数据模块及 Custom LLM 现行 thinking 参数处理，运行时代码未改。
- 验证：完整独立页脚本实际调用六处回调并检查方法缺失分支，Node 两组 21 项、27 项，相关 Python 21 项、H3 合同 4 项及 thinking helper 17 项通过；语法和目标差异检查通过。首次扩大 H3 全文件测试为 12 通过、4 失败，四条修正后单独复测通过；未重新执行依赖 E 盘运行环境的全文件测试。此前记录的其他 11 条扩大测试失败及 WAN 全文件 3 条失败未复测。本开发工作区 Studio 未启动，独立页真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍待完成。

### 13.546 Preset 与 Classic 运行序列化直接使用已有控制器（2026-09-30 本地时间）

- 对应拆分日志第 1329 节。模型配置、后端请求、Preset 指纹与运行、Wildcards 和 XYZ 编辑器的 11 处回调改为调用现有 Serialization controller；主入口三个无独立业务的代理移除。调用时序、缺少方法时返回空对象的规则、项目数据、独立页资源和可见中英文未改。
- 验证：完整独立页脚本覆盖五处 Classic 与六处 Preset 回调，Node 11 项、扩大 Node 55 项，相关 Python 14 项、23 项通过（各组有重复），语法和目标差异检查通过。本开发工作区 Studio 未启动；之前记录的其他 11 条扩大测试失败、WAN 全文件 3 条失败与依赖 E 盘的 H3 全文件复测仍未执行。独立页真实浏览器、完整项目操作、性能、发布资产及 P11 总验收待完成。

### 13.547 Result Asset 回调直接使用已有控制器（2026-09-30 本地时间）

- 对应拆分日志第 1330 节。Result 点击、元数据、媒体转换、菜单、XYZ 及节点双击的九处调用直接访问原控制器，主入口移除四个纯转发。调用时机、`null`／`false` 缺省值、独立页资源、项目数据与 `state.__lang` 对应的中英文未改；使用范围较广的 `getSelectedResultAsset` 保持原状。
- 验证：独立页完整脚本覆盖九处回调及空返回、方法缺失分支；关联 Node 41 项、Python 合同 10 项、脚本及合同语法、目标差异检查通过。开发工作区 Studio 未启动；先前的其他 11 条扩大测试失败、WAN 全文件 3 条失败及依赖 E 盘的 H3 全文件复测未处理。独立页真实浏览器、完整项目操作、性能、发布资产与 P11 总验收待完成。

### 13.548 Preset Run Runtime 回调直接使用原控制器（2026-09-30 本地时间）

- 对应拆分日志第 1331 节。VLM Chat、Agent Mask、Agent SAM3、Qwen TTS、Director Segment 和 Result Run Action 的七处调用改用原 Preset Run Runtime controller；主入口移除六个纯转发，保留跨多条运行路径的 `runPresetNode`。返回值、异步失败结果、独立页资源、项目数据及按 `state.__lang` 显示的中英文均未调整。
- 验证：完整独立页脚本覆盖七处回调、参数及方法缺失分支，关联 Node 38 项、Python 合同 56 项、语法与目标差异检查通过。测试扩充中两处引用错误已修正并复测；没有启动 Studio，先前其他 11 条扩大测试失败、WAN 全文件 3 条失败和依赖 E 盘的 H3 全文件复测未处理。独立页真实浏览器、完整项目操作、性能、发布资产及 P11 总验收仍待完成。

### 13.549 Qwen TTS Runtime 主入口代理整理（2026-09-30 本地时间）

- 对应拆分日志第 1332 节。主入口移除 12 个无调用和三个有调用的 Qwen TTS Runtime 纯转发；结果指纹、状态与轮询三个回调直接访问已有控制器，保留指纹空值及轮询异步失败结果。公开运行和停止入口、项目数据、独立页资源及按 `state.__lang` 显示的中英文没有变化。
- 验证：独立页完整脚本实际检查三处回调和中文、英文标签，关联 Node 18 项、Python 合同 8 项、语法和目标差异检查通过。没有启动 Studio；先前其他 11 条扩大测试失败、WAN 全文件 3 条失败及依赖 E 盘的 H3 全文件复测未处理。独立页真实浏览器、完整项目操作、性能、发布资产与 P11 总验收仍未完成。

### 13.550 独立页不再使用 Gradio 画布 bridge（2026-09-30 本地时间）

- 对应拆分日志第 1333 节。删除画布旧入口的隐藏 bridge 组件、脚本与 Python 请求分发，运行服务及挂载流程取消 bridge 接线；项目保存、读取、删除、清空和模板请求继续使用独立页直连 API。后端保存失败而浏览器缓存成功时维持缓存结果；两者均失败则返回失败并显示对应 `state.__lang` 的提示。其他 Studio Gradio 6 功能、项目字段及独立页资源的其余加载顺序未变。
- 验证：相关 Node 128 项、Python 69 项及脚本语法、目标差异检查通过。未启动开发工作区 Studio；旧记录中的其他 11 条扩大测试失败、WAN 全文件 3 条失败和 H3 全文件复测没有处理。真实独立页浏览器、完整项目操作、性能、发布资产、停用的 Gradio 画布清单及 P11 总验收仍待完成。
