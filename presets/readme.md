# SimpAI_Studio 预置说明

`presets` 目录保存 SimpAI_Studio 内置预置。一个预置通常由 JSON 配置、简介页、预览图和欢迎图组成。JSON 决定模型、默认参数、后端任务、场景界面和模型资源列表；其他文件负责在导航、预置池和欢迎区域展示。

当前预置已经不再只服务 SDXL。目录里同时包含 Flux、Qwen、Wan、Z-image、Comfy 视频/音频工作流、Fooocus/SDXL 兼容预置，以及 Canvas 工作台可用的场景预置。

## 目录

| 路径 | 用途 |
| --- | --- |
| `presets/*.json` | 内置预置 JSON。文件名就是预置名。 |
| `presets/html/*.inc.html` | 右侧简介页。文件名匹配预置名。 |
| `presets/samples/*.jpg` | 导航和预置池 hover 预览图。 |
| `presets/welcome/*` | 欢迎图。支持按预置名定制桌面图和移动端图。 |
| `presets/deprecated/` | 已不用的旧预置。 |

用户自己保存的预置在用户目录里，不写进这里。界面里用户预置名末尾可能带 `.`，用来区分内置预置。

## JSON 基本结构

当前预置推荐显式写 `default_engine`。旧兼容会把缺失的 `default_engine` 当成 Fooocus，但新预置不要依赖这个行为。

```json
{
  "default_engine": {
    "backend_engine": "Z-image",
    "disvisible": ["backend_selection", "performance_selection", "refiner_model"],
    "disinteractive": ["performance_selection", "refiner_model"],
    "available_aspect_ratios_selection": "SDXL",
    "backend_params": {
      "task_method": "z_image_turbo_aio_cn"
    },
    "resolution_control": {
      "mode": "standard",
      "source": "none",
      "base_width": 832,
      "base_height": 1216,
      "quantize": 16,
      "interactive": true,
      "frontend_preprocess": false,
      "preprocess_target": "none",
      "preprocess_fit": "scale"
    }
  },
  "default_model": "z_image_turbo_bf16.safetensors",
  "default_refiner": "None",
  "default_upscale_model": "4x-UltraSharp.pth",
  "default_vae": "ae.safetensors",
  "default_clip_model": "qwen_3_4b.safetensors",
  "default_loras": [
    ["None", 1.0],
    ["None", 1.0],
    ["None", 1.0],
    ["None", 1.0],
    ["None", 1.0]
  ],
  "default_cfg_scale": 1,
  "default_sample_sharpness": 2,
  "default_sampler": "euler_ancestral",
  "default_scheduler": "beta",
  "default_performance": "Speed",
  "default_aspect_ratio": "832*1216",
  "default_image_number": 1,
  "default_overwrite_step": 8,
  "default_prompt": "",
  "default_prompt_negative": "",
  "model_list": [
    "diffusion_models,z_image_turbo_bf16.safetensors,12309866400,0,https://modelscope.cn/models/example/repo/resolve/master/diffusion_models/z_image_turbo_bf16.safetensors",
    "text_encoders,qwen_3_4b.safetensors,8044982048,0,https://modelscope.cn/models/example/repo/resolve/master/text_encoders/qwen_3_4b.safetensors",
    "vae,ae.safetensors,335304388,0,"
  ]
}
```

## 顶层字段

| 字段 | 作用 |
| --- | --- |
| `default_engine` | 后端类型、任务方法、界面显示规则和分辨率控制。 |
| `default_model` | 主模型。可来自 `checkpoints`、`diffusion_models`、`unet` 等分类。 |
| `default_clip_model` | Text Encoder / CLIP。若使用模型内置编码器，可写 `Default (model)` 或按同类预置写法处理。 |
| `default_vae` | VAE。当前内置写法为具体文件名或 `None`。 |
| `default_loras` | LoRA 默认列表，当前内置预置通常保留 5 个槽位。 |
| `default_refiner` / `default_refiner_switch` | 精炼模型及启用比例。多数新预置写 `None`。 |
| `default_upscale_model` | 放大模型。没有特殊需求可写 `default`。 |
| `default_sampler` / `default_scheduler` | 采样器和调度器。取值必须是当前后端能识别的 sampler / scheduler 名称。 |
| `default_cfg_scale` | CFG / guidance。不同后端含义会有差异。 |
| `default_sample_sharpness` | 锐度参数。 |
| `default_overwrite_step` | 默认步数。场景预置也可以在 `scene_frontend` 中按主题设置。 |
| `default_image_number` | 默认生成数量。 |
| `default_prompt` / `default_prompt_negative` | 默认正向和负向提示词。 |
| `default_styles` | 样式列表。当前多数预置为空数组。 |
| `default_aspect_ratio` | 默认尺寸字符串，格式为 `宽*高`，例如 `832*1216`。 |
| `default_resolution_quantize_step` | 分辨率量化步长。当前代码接受 `1`、`8`、`16`、`32`、`64`，其他值会回到默认 `8`。 |
| `default_resolution_multiplier` | 分辨率倍率。 |
| `default_resolution_edit_mode` | 分辨率编辑模式。当前标准值为 `proportional`、`crop`、`scale`、`pad`。 |
| `default_save_metadata_to_images` | 是否把元数据写入输出图。 |
| `model_list` | 缺失模型检查和下载入口。新预置优先维护这个字段。 |
| `checkpoint_downloads` / `embeddings_downloads` / `lora_downloads` / `vae_downloads` | 旧下载字段，保留兼容。当前内置预置多为空对象。 |
| `previous_default_models` | 旧模型名迁移提示，只有少数预置需要。 |
| `previous_default_refiners` | 旧 refiner 模型名迁移提示，适合双模型或 high/low noise 预置。 |

## `default_engine`

`default_engine` 控制预置使用哪类后端、哪些控件显示、默认使用哪个 workflow。

| 字段 | 作用 |
| --- | --- |
| `backend_engine` | 后端名称。当前内置预置使用 `Flux`、`Qwen`、`Wan`、`LTX`、`Z-image`、`Comfy`、`SDXL`、`Fooocus`。 |
| `engine_type` | 可选。视频/音频类一般写 `"video"`，图片类通常不写。 |
| `disvisible` | 隐藏的主界面控件 id。 |
| `disinteractive` | 显示但不可编辑的主界面控件 id。 |
| `available_aspect_ratios_selection` | 尺寸模板。当前代码定义 `SDXL`、`Common`、`Flux`、`Wan`。 |
| `backend_params.task_method` | 后端任务名。普通非场景预置通常写在这里。 |
| `resolution_control` | 分辨率控制策略。普通预置写在 `default_engine` 下；场景预置通常写在 `scene_frontend` 下。 |
| `scene_frontend` | 场景界面配置。存在时会启用场景面板和 Canvas 预置节点的场景参数。 |

## 场景预置

带 `scene_frontend` 的预置用于图像编辑、视频、音频、商品修图、姿态、去背景、扩图等场景。字段可以写成固定值，也可以写成按主题分组的对象。`theme` 数组的第一项是默认主题。

```json
{
  "default_engine": {
    "backend_engine": "Flux",
    "disvisible": ["input_image_checkbox", "prompt_panel_checkbox", "performance_selection"],
    "disinteractive": ["input_image_checkbox", "prompt_panel_checkbox", "performance_selection"],
    "available_aspect_ratios_selection": "Flux",
    "scene_frontend": {
      "version": "m1.1",
      "theme": ["Edit", "Pose"],
      "theme_title": "Flux Image Editing",
      "task_method": {
        "Edit": "flux2_9b_edit_cn",
        "Pose": "flux2_pose_cn"
      },
      "prompt": {
        "Edit": "",
        "Pose": "Convert the second image to pose and apply it to the first image."
      },
      "disvisible": [
        "scene_additional_prompt_2",
        "scene_video",
        "scene_audio",
        "scene_var_number5",
        "scene_var_number6",
        "scene_switch_option3",
        "scene_switch_option4",
        "sam3_input_video",
        "sam3_mask_video"
      ],
      "aspect_ratio": ["1024|1:1", "1536|1:1", "origin|Original"],
      "resolution_control": {
        "mode": "image_keep_input_area",
        "source": "scene_canvas",
        "base_width": 1024,
        "base_height": 1024,
        "quantize": 16,
        "interactive": true,
        "frontend_preprocess": true,
        "preprocess_target": "image",
        "preprocess_fit": "proportional"
      },
      "var_number4_title": "Match original colors",
      "var_number4_min": 0,
      "var_number4_max": 1,
      "var_number4": {
        "Edit": 0.1,
        "Pose": 0
      },
      "switch_option2_title": "Convert Image 2 to pose",
      "switch_option2": {
        "Edit": false,
        "Pose": true
      },
      "overwrite_step_min": 4,
      "overwrite_step_max": 8
    }
  }
}
```

### 场景字段

| 字段 | 作用 |
| --- | --- |
| `version` | 场景 UI 版本。当前内置预置使用 `m1.1` 或 `v1.1`。 |
| `theme` | 主题列表。第一项为默认主题。 |
| `theme_title` | 主题栏标题。 |
| `task_method` | 每个主题对应的 workflow 任务名。 |
| `prompt` | 主题默认提示词。 |
| `additional_prompt` / `additional_prompt_2` | 场景面板里的额外文本输入默认值。 |
| `additional_prompt_title` / `additional_prompt_title_2` | 额外文本输入标题。 |
| `multimodal_prompt` | VLM 反推或改写提示词。 |
| `agent_prompt` | Canvas Agent / VLM 提示增强规则。 |
| `disvisible` | 隐藏的场景控件。 |
| `disinteractive` | 显示但不可编辑的场景控件。 |
| `image_preprocessor_method` | 输入图预处理规则。可按主题配置。 |
| `disable_canvas_mask` | 是否禁用 Canvas mask。 |
| `aspect_ratio` | 场景尺寸候选。支持 `1024|1:1`、`1536|1:1`、`origin|Original`。 |
| `aspect_ratio_select_mode` | 尺寸自动选择模式。需要自动候选时写 `auto_candidate`，只保留匹配项时写 `auto_match`。不写时使用列表第一项作为默认值。 |
| `resolution_control` | 场景分辨率控制。 |
| `overwrite_step` | 可按主题设置默认步数。 |
| `overwrite_step_min` / `overwrite_step_max` | 步数控件范围。 |
| `var_number` 到 `var_number10` | 场景数字控件。每个控件可配 `_title`、`_min`、`_max`、`_step`。 |
| `switch_option1` 到 `switch_option4` | 场景开关控件。每个控件可配 `_title`。 |

场景可用输入槽包括：

```text
scene_canvas_image
scene_input_image1
scene_input_image2
scene_input_image3
scene_input_image4
scene_video
scene_audio
sam3_input_video
sam3_mask_video
```

这些 id 放进 `disvisible` 后，对应上传槽会从场景面板和 Canvas 预置节点里隐藏。

## 分辨率控制

当前 `resolution_control.mode` 识别的值：

| mode | 用途 |
| --- | --- |
| `standard` | 使用预置默认宽高，不依赖输入素材。 |
| `image_keep_input_area` | 以输入图为参考，按面积和比例生成输出尺寸。 |
| `video_keep_input_area` | 以输入视频为参考，按面积和比例生成输出尺寸。 |
| `input_passthrough` | 使用输入素材尺寸。 |

字段和值：

| 字段 | 说明 |
| --- | --- |
| `source` | 尺寸来源。当前代码识别 `none`、`no_source`、`scene_canvas`、`scene_input_image1`、`scene_input_image2`、`scene_input_image3`、`scene_input_image4`、`scene_video`、`sam3_input_video`、`video_first_frame`、`scene_video_first_frame`。 |
| `base_width` / `base_height` | 基准宽高。 |
| `quantize` | 宽高量化步长。当前代码接受 `1`、`8`、`16`、`32`、`64`，其他值会回到默认 `8`。 |
| `interactive` | 是否允许用户在界面调整。 |
| `frontend_preprocess` | 是否在前端预处理素材。 |
| `preprocess_target` | 预处理目标。无固定枚举；当前代码只有 `video` 会进入视频预处理，其他值会进入图片预处理。内置预置使用 `image`、`video`、`none`。 |
| `preprocess_fit` | 预处理缩放方式。标准值为 `proportional`、`crop`、`scale`、`pad`。兼容别名：`keep` / `keep_ratio` -> `proportional`，`cover` -> `crop`，`fill` / `stretch` -> `scale`，`padding` / `letterbox` / `contain` -> `pad`。 |
| `preserve_audio` | 视频类预置可用，保留原视频音频。 |

`origin|Original` 是保留输入原尺寸的候选值，常用于编辑、视频和音频相关预置。

## 模型资源 `model_list`

`model_list` 用于判断模型是否齐全，也用于模型下载面板。每项可以写字符串，也可以写数组。字符串格式如下：

```text
category,path_file,size,hash10,url
```

示例：

```json
{
  "model_list": [
    "diffusion_models,Flux2-Klein-9B-True-V3-int8mixedrow.safetensors,9439884768,0,https://modelscope.cn/models/wikeeyang/Flux2-Klein-9B-True-V3/resolve/master/Flux2-Klein-9B-True-V3-int8mixedrow.safetensors",
    "text_encoders,qwen3_8b_abliterated_v2-fp8mixed.safetensors,8191194604,0,https://www.modelscope.cn/models/silveroxides/FLUX.2-dev-fp8_scaled/resolve/master/qwen3_8b_abliterated_v2-fp8mixed.safetensors",
    "vae,flux2-vae.safetensors,336211292,0,https://www.modelscope.cn/models/Comfy-Org/flux2-klein-4B/resolve/master/split_files/vae/flux2-vae.safetensors"
  ]
}
```

字段含义：

| 字段 | 说明 |
| --- | --- |
| `category` | 模型分类，对应模型目录和 `modelsinfo` 分类。它不是固定枚举，取决于本地模型目录注册；例如 `checkpoints`、`diffusion_models`、`text_encoders`、`clip`、`vae`、`loras`、`controlnet`、`upscale_models`。 |
| `path_file` | 文件名或分类目录下的相对路径，例如 `ltx/xxx.safetensors`。也支持 `[目录名]` 这种目录包写法。 |
| `size` | 普通文件时表示文件大小，单位字节；`path_file` 写成 `[目录名]` 时表示该目录下至少需要多少个模型文件。 |
| `hash10` | 仍按第五列前的字段读取为字符串并保存在内部数据里；当前缺失检查、下载队列和 Canvas 模型检查都不使用这个值，内置项通常写 `0`。 |
| `url` | 下载地址。为空时系统会按默认下载前缀生成地址。 |

`category` 可以带子目录，例如：

```json
{
  "model_list": [
    "controlnet/hr16/DWPose-TorchScript-BatchSize5,dw-ll_ucoco_384_bs5.torchscript.pt,135059124,0,https://modelscope.cn/models/svjack/DWPose-TorchScript-BatchSize5/resolve/master/dw-ll_ucoco_384_bs5.torchscript.pt"
  ]
}
```

目录包写法仍能参与缺失检查，但目录包 zip 自动下载已经不支持；缺失时需要用户手动安装目录内容。例子：

```json
{
  "model_list": [
    "diffusers,[example-diffusers-folder],12,0,"
  ]
}
```

## 展示资源

### 简介页

简介页放在 `presets/html`。查找次序如下：

```text
presets/html/<Preset>.<lang>.inc.html
presets/html/<Preset>.inc.<lang>.html
presets/html/<Preset>.inc.html
presets/html/blank.inc.html
```

示例：

```text
presets/html/Z-imageT.inc.html
presets/html/Wan(T2I).inc.html
presets/html/Flux2-Klein.inc.html
```

简介页会显示在预置说明区域。没有简介页时会使用 `blank.inc.html`。

### 导航预览图

导航和预置池 hover 预览图放在 `presets/samples`。前端会把预置名转成小写，并把空格改为 `_`：

```text
Z-imageT      -> presets/samples/z-imaget.jpg
Wan(T2I)      -> presets/samples/wan(t2i).jpg
Flux2-Klein   -> presets/samples/flux2-klein.jpg
QwenEdit+     -> presets/samples/qwenedit+.jpg
```

找不到对应图片时使用 `presets/samples/noimage.jpg`。

### 欢迎图

欢迎图放在 `presets/welcome`。按预置名查找时支持原名和小写下划线名：

```text
presets/welcome/welcome_<preset>_w.jpg
presets/welcome/welcome_<preset>_m.jpg
```

`_w` 是桌面图，`_m` 是移动端图。没有预置专属欢迎图时，使用通用欢迎图。

示例：

```text
presets/welcome/welcome_z-ttp_w.jpg
presets/welcome/welcome_z-ttp_m.jpg
```

## 制作和维护建议

1. 以同后端、同用途的现有预置为模板。例如文生图看 `Z-imageT.json`，图片编辑看 `Flux2-KleinEdit.json` 或 `QwenEdit+.json`，视频看 `Wan(T2V).json` 或 `LTX(TA2V).json`，音频看 `Hunyuan-Foley.json`。
2. 新预置优先维护 `model_list`，不要只写旧的 `*_downloads` 字段。
3. 场景预置的 `theme`、`task_method`、`prompt`、自定义控件默认值要成组维护。主题名不一致时，界面会拿不到对应值。
4. 需要自动尺寸候选时再写 `aspect_ratio_select_mode`。不需要时让第一项候选作为默认尺寸。
5. `disvisible` 和 `disinteractive` 只写真实控件 id。写错不会报错，但界面不会按预期变化。
6. 修改内置预置后，同时检查 `presets/samples`、`presets/html`、`presets/welcome` 是否需要同名展示资源。
7. 文件名、JSON 字段和模型文件名建议使用 UTF-8 保存。模型相对路径里的反斜杠建议写成 `/`。

## JSON 校验

在仓库根目录执行下面命令，可以检查 `presets` 下 JSON 是否能被正常读取：

```powershell
Get-ChildItem .\presets -Filter *.json | ForEach-Object {
    try {
        Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json | Out-Null
    } catch {
        Write-Error "$($_.Name): $($_.Exception.Message)"
    }
}
```

这只检查 JSON 格式，不检查模型文件是否存在。模型是否齐全由界面的模型检查和下载面板读取 `model_list` 后判断。
