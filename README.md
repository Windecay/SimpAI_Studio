# SimpAI Studio

SimpAI Studio 是面向本地创作的 AI 多媒体工作台。项目把面向普通用户的 SimpAI Studio WebUI、ComfyUI、Infinite Canvas 画布玩法和 Forge Neo WebUI后端整合于同一套工程里，覆盖图片生成、图像编辑、视频处理、音频/TTS、3D 姿态、模型管理和方便的更新工具。

- Wiki 入口：[SimpAI.cn](http://SimpAI.cn)
- 应用指南：[《SimpAI 创意生图集中营：应用指南全收录》](https://acnmokx5gwds.feishu.cn/wiki/QK3LwOp2oiRRaTkFRhYcO4LonGe)
- 用户交流：QQ 交流群 `1005085136`
- Agent 接入：[统一 API 文档](docs/agent-api-v1.md) · [MCP 配置](docs/agent-mcp.md) · [仓库 Agent 指南](AGENTS.md)

![SimpAI Studio 主 WebUI / Main WebUI](docs/image/readme/01-main-webui-overview.jpg)

<p align="center"><sub>主 WebUI / Main WebUI: 预置包、提示词、生成参数、图库和 VLM/LLM 助手集中在同一个创作界面。Preset, prompt, generation controls, gallery and VLM/LLM assistant are available in one workspace.</sub></p>

## 项目定位

SimpAI Studio 的目标是纵深整合，从快速起步的“预置包式创作”到“节点式复杂编排”放在同一个本地环境里，一路探索，步步是惊喜：

- SimpAI Studio WebUI 内置了许多通过大量调试验证，无需过多调节即可生成高质量媒体的预置包，工作中一键快速补全，立即生成，使用社区热门Lora对专用场景优化、生成结果快速浏览和再度编辑。
- Infinite Canvas 负责预置包编排、批量任务、素材复用、模板库、时间线编辑素材、X/Y/Z 对比、VLM Agent辅助和复杂工作流展示，是你贴心的工作区域。
- ComfyUI 是细粒度、原子化的图像、视频、音频等任务的节点界面，复杂度高，支持用户自定义节点加入进行进阶探索。
- Forge Neo 迁移至 Gradio 6 前端风格，兼容原后端、SDAPI/ControlNet 兼容接口、扩展运行和独立界面。

## 功能速览 / Feature Tour

完整截图图库见 [docs/readme-showcase.md](docs/readme-showcase.md)。

### Core Workspace / 核心工作区

| Preset Store / 预置包商店 | Preset Detail / 预置包详情 |
| --- | --- |
| ![Preset Store / 预置包商店](docs/image/readme/02-preset-store-overview.jpg) | ![Preset Detail / 预置包详情](docs/image/readme/03-preset-detail-and-models.jpg) |
| 分类浏览、搜索、安装状态和预置包入口集中展示。<br>Browse categories, search presets and check install status in one place. | 查看预置包说明、模型依赖和可用场景。<br>Review preset notes, model dependencies and supported scenarios. |

| Model Browser / 模型浏览器 | Gallery Tools / 结果图库工具 |
| --- | --- |
| ![Model Browser / 模型浏览器](docs/image/readme/04-model-browser-overview.jpg) | ![Gallery Tools / 结果图库工具](docs/image/readme/05-generation-gallery-tools.jpg) |
| 管理 LoRA、模型预览、筛选和当前选择。<br>Manage LoRA assets, previews, filters and current selections. | 浏览生成历史、媒体结果和继续编辑入口。<br>Browse generation history, media results and follow-up editing actions. |

### Canvas Workflows / 画布工作流

| Infinite Canvas / 无限画布 | Template Library / 模板库 |
| --- | --- |
| ![Infinite Canvas / 无限画布](docs/image/readme/06-infinite-canvas-overview.jpg) | ![Template Library / 模板库](docs/image/readme/07-canvas-template-library.jpg) |
| 把 WebUI 预置包、素材、结果节点和运行状态放进同一张画布。<br>Compose WebUI presets, assets, result nodes and run status on one canvas. | 内置图片、视频、音频、Timeline 和结果复用模板。<br>Use built-in templates for image, video, audio, timeline and result reuse workflows. |

| Canvas Agent / 画布助手 | Qwen TTS / 语音合成 |
| --- | --- |
| ![Canvas Agent / 画布助手](docs/image/readme/08-canvas-agent-vlm-chat.jpg) | ![Qwen TTS / 语音合成](docs/image/readme/11-tts.jpg) |
| VLM Chat 和 Canvas Agent 可以辅助提示词、素材理解和画布编排。<br>VLM Chat and Canvas Agent help with prompts, asset understanding and canvas planning. | 支持语音合成、角色音色和对白类工作流。<br>Support speech synthesis, character voices and dialogue workflows. |

### Image Input & Editing / 图像输入与编辑

| Image Prompt & ControlNet / 图像提示与控制 | Inpaint & Outpaint / 重绘与扩图 |
| --- | --- |
| ![Image Prompt and ControlNet / 图像提示与控制](docs/image/readme/11-image-prompt-controlnet.jpg) | ![Inpaint and Outpaint / 重绘与扩图](docs/image/readme/11-inpaint-outpaint.jpg) |
| 管理图像参考、ControlNet 和场景输入。<br>Manage image references, ControlNet and scene inputs. | 支持局部重绘、扩图、遮罩和图片编辑任务。<br>Use inpaint, outpaint, masks and image editing tasks. |

| Enhance+ / 增强修图 | Upscale & Variation / 放大与变化 |
| --- | --- |
| ![Enhance+ / 增强修图](docs/image/readme/11-enhanced.jpg) | ![Upscale and Variation / 放大与变化](docs/image/readme/11-upscale-vary.jpg) |
| 局部增强、细节修复和图片后续处理集中在同类入口。<br>Use one group of tools for local enhancement, detail repair and image follow-up work. | 放大、变化和继续生成放在相邻图片工具区。<br>Upscale, variation and continued generation stay near the image tools. |

### Specialized Modules / 特色模块

| Pose Studio / 姿态编辑 | Gaussian Studio / 高斯泼溅视角 |
| --- | --- |
| ![Pose Studio / 姿态编辑](docs/image/readme/10-pose-1.jpg) | ![Gaussian Studio / 高斯泼溅视角](docs/image/readme/10-gaussian.jpg) |
| 直接在 WebUI 中调整角色姿态并发送给场景预置包。<br>Edit character poses in WebUI and send them to scene presets. | 用可视化视角编辑器控制 3D/多视角素材。<br>Control 3D and multi-view assets with a visual camera editor. |

### Built-in Interfaces / 内置界面

| ComfyUI Bridge / ComfyUI 节点界面 | Forge Neo / Forge Neo 界面 |
| --- | --- |
| ![ComfyUI Built-in / ComfyUI 节点界面](docs/image/readme/12-comfyui-bridge.jpg) | ![Forge Neo Built-in / Forge Neo 界面](docs/image/readme/12-forge-neo-bridge.jpg) |
| 使用内置 ComfyUI 执行节点工作流，并与主 WebUI 共享资源。<br>Run node workflows with the built-in ComfyUI runtime and shared assets. | Gradio 6 风格的 Forge Neo 独立界面，与主 WebUI 共享模型目录。<br>Forge Neo provides a Gradio 6 interface and shares model folders with the main WebUI. |

## 能做什么

### SimpAI Studio (主 WebUI)

- 通过预置包快速使用 SDXL、Illustrious / NoobAI、Anima、Flux、Flux2-Klein、Qwen、Wan、LTX、Hunyuan Foley、Z-Image、Nvidia VSR 等热门模型，并不断新增迭代高价值项目。
- 支持文生图、图生图、重绘、扩图、变化、放大、局部增强、换脸、抠图、风格迁移、视频生成、视频编辑、音频驱动视频和 TTS。
- 提供 图像提示Image Prompt、Upscale / 放大与变化Variation、内外重绘Inpaint / Outpaint、增强修图Enhance+、反推提示词Describe Image、元数据Metadata、风格选择器Styles、Tags选择器、通配符助手Wildcards Helper等实用面板。
- 方便的图像浏览器、图片中转站、划像对比、预置包模型缺失提示和一键补全模型。
- 集成 SAM3 图像/视频遮罩、姿势编辑器Pose Studio、高斯泼溅角度编辑器Gaussian Studio、图层编辑器LayerForge、Qwen TTS、VLM/LLM 图片对话和提示词助手，支持LMStudio、Ollama等第三方API接入。

### SimpAI Infinite Canvas

- 在 WebUI 内打开节点画布，可将WebUI的固有预置包作为“超级节点”，辅以各种工具节点，方便快速组合常用工作流程。
- 模板库覆盖入门模板、可运行图片模板、Wan 视频模板、Qwen TTS 音频模板、Timeline 混剪模板和 Result 复用示例。
- 支持保存/读取画布项目、用户模板、运行队列、结果复用、素材浏览、Danbooru画廊、WD14标签器、在线双语翻译、VLM Chat聊天、Canvas Agent 和 X/Y/Z 对比。
- Batch Any 支持图片、文件和文本批次，适合多提示词、多素材、多参数对比批量任务。
- 画布Agent 内置Canvas Skill，根据素材和预置包知识辅助用户选择、编排工作流，还拥有专业的Prompt SKILL，分别对自然语言、Danbooru Tags类型提示词进行优化，生成符合用户意图的优秀提示词。

### Forge Neo Built-in

- `forge_neo/` 是从Gradio 4.40迁移到 Gradio 6.9 的 Forge 风格前端用户界面，运行独立于主 WebUI 的进程。
- 提供 `webui-forge-neo.py` 主入口，并实现 SDAPI、ControlNet、Extra Networks、Settings、Extensions、PNG Info、Extras、Checkpoint Merger 等接口和页面。
- 主动适配了 ControlNet、IPAdapter、MultiDiffusion、Regional Prompter、ADetailer-Neo、Qwen Vision Chat、SAM Matting、Trellis2、Tagcomplete 等扩展。
- 为喜欢A1111界面风格的用户提供了新的选择，与主WebUI共享模型目录，不需要另外部署一个Python环境。

### ComfyUI Built-in

- 从SimpAI Studio使用的comfyD后端进化而来，保留了所有功能和接口，并且专门优化了资源调度和性能。
- 集成了大量常用节点（多达140+），覆盖了图像、视频、音频等任务的大部分功能。
- 提供 ComfyUI 节点界面，负责图像、视频、音频等任务的实际执行基础。
- 支持自定义节点，用户可以根据需要添加新的节点类型，扩展工作流的功能。
- 提供丰富的内置工作流选项，支持一键跑通，与主WebUI共享模型目录。
- 为用户提供稳定的分享工作流平台，相同后端可复用性更高。

## 目录构成

| 路径                                       | 作用                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `webui.py`                               | 主 WebUI 页面、FastAPI 路由、Gradio 6 事件链和前端入口。                                 |
| `enhanced/`                              | 顶栏、预置包增强、Gallery、SAM3、Pose/Gaussian/LayerForge 桥、VLM、Qwen TTS 等功能模块。 |
| `modules/`                               | 生成任务、配置、模型管理、Canvas 后端、VLM Agent、项目存取、X/Y/Z、时间线等核心逻辑。    |
| `javascript/`                            | 主 WebUI 前端、Infinite Canvas、模型浏览、TagCart、编辑器和状态同步脚本。                |
| `css/`                                   | Gradio 6 页面样式、画布样式、编辑器样式和局部控件修正。                                  |
| `presets/`                               | WebUI 预置包、场景预置、模型依赖、简介页和预占位素材。                                   |
| `workflows/`                             | ComfyUI API 工作流，主 WebUI 预置和场景任务会读取这里。                                  |
| `javascript/canvas_workbench/templates/` | Infinite Canvas 内置模板库。                                                             |
| `comfy/`                                 | 内置 ComfyUI 与自定义节点集合。                                                          |
| `forge_neo/`                             | Forge Neo Gradio 6 迁移代码、API、设置、扩展适配和许可说明。                             |
| `docs/`                                  | VLM 技能、检索用文档。                                                                   |
| `users/`                                 | 本地用户工作区、输出、配置和运行时素材目录。                                             |
| `.ci/`                                   | Windows 打包环境使用的 bat 模板，包含主 WebUI、ComfyUI、Forge Neo、模型检测和更新入口。 |

## 安装与启动

### Windows 一键整合包

普通 Windows 用户建议使用一键整合包：

- 下载地址：[SimpAI_Studio_win.zip](https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpAI_Studio_win.zip)
- 用途：实际为[Windows版本启动器](https://pan.quark.cn/s/767d38736010)部署所使用的 Studio 运行包，包含 Windows embedded Python、Studio 代码和外层 bat 入口。
- 启动器说明：[Windows 版本启动器说明](docs/windows-launcher-zh.md)
- 解压位置：建议解压到空间充足、路径较短的目录，例如 `D:\SimpleAI\`。解压后常见入口类似 `G:\SimpleAI\SimpAI_Studio_win\run_SimpAI_常规启动.bat`。
- 启动方式：解压后使用 Launcher 管理，或直接运行外层 bat：`run_SimpAI_常规启动.bat`、`run_ComfyUI_工作流模式.bat`、`run_ForgeNeo_传统界面.bat`。

模型和用户数据仍建议放在外层 `SimpleModels/` 与 `users/`，这样更新 Studio 运行包时不需要移动已有模型和生成记录。

### 当前打包限制

- 目前一键整合包只提供 Windows + NVIDIA CUDA 版本。
- 打包版默认面向 RTX 20 系及以上 NVIDIA 显卡。更老的 NVIDIA 显卡未做测试和适配。
- Linux 目前提供源码启动和自建环境说明，但没有提供单独的一键整合包。
- AMD、Intel 显卡尚未提供一键整合包，也尚未完成直接适配和打包验证。相关用户需要自行配置 PyTorch / ROCm / DirectML / IPEX 等环境，并按实际节点兼容情况处理。
- 当前打包环境使用 Python `3.13`、PyTorch `2.9.1+cu130` 和 CUDA 13 路线。自建环境使用其他版本时，ONNX Runtime、bitsandbytes、视频节点和 3D 高斯节点可能需要额外调整。

### 推荐文件夹结构

Windows 打包版建议把代码、Python 环境、模型和用户数据分开放置。仓库内 `.ci` 目录里的 bat 模板，默认按下面的发布包结构工作：

```text
SimpleAI/
├─ SimpAI_Studio_win/
│  ├─ python_embeded/
│  ├─ SimpAI_Studio/
│  ├─ run_SimpAI_常规启动.bat
│  ├─ run_ComfyUI_工作流模式.bat
│  ├─ run_ForgeNeo_传统界面.bat
│  ├─ model_checker_模型检测.bat
│  └─ update_SimpAI_更新程序.bat
├─ SimpleModels/
└─ users/
```

- `SimpAI_Studio_win/`：Windows 发布包目录，外层 bat 放在这里。
- `SimpAI_Studio_win/SimpAI_Studio/`：本仓库代码。
- `SimpAI_Studio_win/python_embeded/`：Windows 打包版自带 Python，当前打包环境使用 Python `3.13` 与 PyTorch `2.9.1+cu130`。
- `SimpleModels/`：共享模型目录。主 WebUI、ComfyUI 和 Forge Neo 都会从这里读取模型。
- `users/`：用户配置、输出、工作区、Forge Neo 状态和 ComfyUI 独立输出目录。

这种结构下，更新或者重置 `SimpAI_Studio/` 时不需要移动模型和用户数据。模型目录的主要子目录包括 `checkpoints/`、`diffusion_models/`、`unet/`、`loras/`、`vae/`、`clip/`、`text_encoders/`、`controlnet/`、`clip_vision/`、`upscale_models/`、`LLM/`、`llms/`、`sam3/`、`qwen-tts/`、`hunyuan_foley/` 等。更多路径会从 `users/config.txt` 和 `comfy/extra_model_paths.yaml` 同步给 ComfyUI。

### Windows bat 启动

`.ci` 目录内的 bat 是模板。它们的相对路径假设 bat 文件位于 `SimpAI_Studio_win/`，并且同级存在 `python_embeded/` 和 `SimpAI_Studio/`。

| bat | 用途 |
| --- | --- |
| `run_SimpAI_常规启动.bat` | 启动主 WebUI，模型目录使用 `../../SimpleModels`，用户目录使用 `../../users`。 |
| `run_ComfyUI_工作流模式.bat` | 启动内置 ComfyUI 节点界面，输出目录使用 `../../users/ComfyUI`。 |
| `run_ForgeNeo_传统界面.bat` | 启动 Forge Neo 传统 WebUI，用户目录使用 `../../users`，主题为 dark。 |
| `model_checker_模型检测.bat` | 打开预置包模型检测和下载工具。 |
| `update_SimpAI_更新程序.bat` | 打开更新工具；没有 embedded Python 时会尝试使用系统 `python`。 |

主 WebUI 是普通用户的默认入口。ComfyUI 适合直接编辑节点工作流。Forge Neo 适合使用 A1111 / Forge 风格页面和 SDAPI 生态。

### Windows 命令行启动

以下命令在 `SimpAI_Studio_win/` 发布包目录执行：

```powershell
.\python_embeded\python.exe -s SimpAI_Studio\entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users
```

常用变体：

```powershell
# 指定端口和监听地址
.\python_embeded\python.exe -s SimpAI_Studio\entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --listen 127.0.0.1 --port 8186

# 局域网或服务器访问
.\python_embeded\python.exe -s SimpAI_Studio\entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --listen 0.0.0.0 --port 8186

# 指定后端 ComfyUI 端口
.\python_embeded\python.exe -s SimpAI_Studio\entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --backend-port 8188

# 只启动前端，不自动启动生成后端
.\python_embeded\python.exe -s SimpAI_Studio\entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --disable-comfyd

# 启动 Forge Neo
.\python_embeded\python.exe -s SimpAI_Studio\webui-forge-neo.py --theme dark --userhome-path ../../users --port 7860

# 启动 ComfyUI 节点界面
.\python_embeded\python.exe -s SimpAI_Studio\comfy\main_comfyd.py --windows-standalone-build --output-directory ../../users/ComfyUI --port 8188
```

常用参数：

| 参数 | 说明 |
| --- | --- |
| `--models-root PATH` | 指定共享模型根目录。打包结构推荐使用 `../../SimpleModels`。 |
| `--userhome-path PATH` | 指定用户目录。打包结构推荐使用 `../../users`。 |
| `--listen IP` | 指定监听地址。`127.0.0.1` 仅本机访问，`0.0.0.0` 允许外部访问。 |
| `--port PORT` | 指定主 WebUI 或 Forge Neo 前端端口。 |
| `--backend-port PORT` | 指定主 WebUI 自动启动的 ComfyUI 后端端口。 |
| `--preset NAME` | 指定启动时加载的预置包，默认是 `Z-imageT`。 |
| `--language cn|en` | 指定界面语言。国内环境默认会使用 `cn`。 |
| `--theme dark|light` | 指定 Gradio 主题。 |
| `--gpu-device-id ID` | 指定主 WebUI 使用的 GPU。 |
| `--disable-comfyd` | 主 WebUI 不自动启动内置 ComfyUI 后端。 |
| `--disable-backend` | 只启动界面和 API 层，不提供本地生成后端。 |
| `--share` | 使用 Gradio share。公开访问前请配置访问控制，不建议把本地生成服务直接暴露到公网。 |

### Linux 启动

Linux 没有 Windows embedded Python。建议使用 venv 或 Conda，并把当前工作目录放在 `SimpAI_Studio/`：

```bash
cd /data/SimpleAI/SimpAI_Studio_win/SimpAI_Studio
python -s entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --listen 127.0.0.1 --port 8186
```

Linux 服务器常用命令：

```bash
# 主 WebUI，允许内网访问
python -s entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users --listen 0.0.0.0 --port 8186

# Forge Neo
python -s webui-forge-neo.py --theme dark --userhome-path ../../users --listen 0.0.0.0 --port 7860

# ComfyUI 节点界面
python -s comfy/main_comfyd.py --output-directory ../../users/ComfyUI --listen 0.0.0.0 --port 8188
```

服务器对外使用时建议放在反向代理或 VPN 后面，并配置防火墙、账号验证和独立工作目录。模型下载量大，`SimpleModels/` 建议放在空间充足的 SSD 或高速盘。

### 自建 Python 环境

自建环境适合源码开发、Linux 服务器和需要自定义 CUDA / PyTorch 的用户。普通 Windows 用户建议使用打包版 `python_embeded/`。

基础流程：

```bash
cd /data/SimpleAI/SimpAI_Studio_win/SimpAI_Studio
python -m venv .venv
source .venv/bin/activate
python -m pip install -U pip wheel setuptools
python -m pip install torch==2.9.1+cu130 torchvision==0.24.1+cu130 torchaudio==2.9.1+cu130 --index-url https://download.pytorch.org/whl/cu130
python -m pip install -r requirements.txt
python -m pip install -r comfy/requirements.txt
python -s entry_without_update.py --models-root ../../SimpleModels --userhome-path ../../users
```

Windows PowerShell 对应写法：

```powershell
cd G:\SimpleAI\SimpAI_Studio_win\SimpAI_Studio
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -U pip wheel setuptools
python -m pip install torch==2.9.1+cu130 torchvision==0.24.1+cu130 torchaudio==2.9.1+cu130 --index-url https://download.pytorch.org/whl/cu130
python -m pip install -r requirements.txt
python -m pip install -r comfy\requirements.txt
python -s entry_without_update.py --models-root ..\..\SimpleModels --userhome-path ..\..\users
```

环境注意事项：

- 当前主启动流程面向 PyTorch `2.9.1+cu130`。使用其他 CUDA / PyTorch 组合时，ONNX Runtime、bitsandbytes、ComfyUI 节点和部分视频/3D 节点可能需要用户自行调整。
- `requirements.txt` 不直接安装 `onnxruntime` / `onnxruntime-gpu`。CUDA 13 环境会在启动时安装匹配的 ONNX Runtime GPU 包；自定义 CUDA 12.x 环境需要用户安装对应的 `onnxruntime-gpu`。
- `simpleai_base` 是必要组件。启动器会尝试从 `enhanced/libs/` 或 ModelScope 下载并安装匹配 wheel；离线环境需要提前准备对应平台的 wheel。
- 建议 NVIDIA 驱动支持 CUDA 13.0；低版本驱动会在启动时提示更新。
- 建议 RAM + SWAP 大于 64 GB，视频、3D 和大模型工作流还需要更大的显存和磁盘空间。
- 中国大陆网络环境可以设置 `HF_ENDPOINT=https://hf-mirror.com`，或使用启动参数 `--hf-mirror`。

## 预置包与模板

预置包是 SimpAI Studio 的主要使用入口。每个预置包描述模型、LoRA、采样参数、分辨率、工作流、输入槽、模型下载信息和简介页。

当前仓库里可以看到这些方向：

- 图片生成：`FooocusSDXL`、`Illustrious`、`Anima`、`Flux1-dev`、`Flux2-Klein`、`Z-imageT`。
- 图片编辑：`QwenEdit+`、`Imagerepair+`、`StyleTransfer+`、`Swap+`、`OneKeyKontext`、`OneKey-Outpaint`。
- 视角与姿态：`QwenMultiAngle`、`QwenGaussian`、`QwenPose`、`Flux2-KleinPose`。
- 视频：`Wan(T2V)`、`Wan(I2V)`、`Wan-Extent`、`Wan-Animate`、`Wan-Remover`、`Wan-Outpaint`、`Wan-SCAIL`、`Wan-TTP`、`LTX2.3`。
- 音频：`Qwen TTS` 画布节点、`Hunyuan-Foley`、`InfiniteTalk`、Timeline 配音混剪模板。
- 增强：`Nvidia-VSR`、`Removebg`、`Relight`、`Tile`、`Eraser`。

更多配置说明见 [presets/readme.md](presets/readme.md) 和 [javascript/canvas_workbench/templates/README.md](javascript/canvas_workbench/templates/README.md)。

## 对比旧版

- 更好看的用户界面，更直观的操作流程，清理旧版残留的所有痛点。
- 更流畅的界面，更快的响应速度，更少的资源占用。
- 更好的模型支持，更丰富的玩法。
- 完全按本地化用户管理模式，不再依赖云服务。

## 鸣谢与引用

SimpAI Studio 站在许多开源项目和节点作者的工作之上。这里列出 README 中直接提到或本工程重点集成的项目；完整许可、作者信息和使用限制以各子目录的 `LICENSE` / `README` 以及上游仓库为准。

### 底座项目与模型生态

| 项目                                                                                                                                                 | 贡献                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [Fooocus](https://github.com/lllyasviel/Fooocus)                                                                                                        | 早期易用生图体验、SDXL 工作流和部分图像处理思路来源。                                                  |
| [ComfyUI](https://github.com/Comfy-Org/ComfyUI)                                                                                                         | 节点式工作流执行基础和大量模型生态能力。                                                               |
| [sd-webui-forge-classic](https://github.com/Haoming02/sd-webui-forge-classic)                                                                           | Forge Neo 迁移参考项目；本仓库在 `html/forge_neo/NOTICE.md` 记录了 branch、commit 和 AGPL-3.0 说明。 |
| [AUTOMATIC1111 stable-diffusion-webui](https://github.com/AUTOMATIC1111/stable-diffusion-webui)                                                         | WebUI/SDAPI/脚本扩展生态的重要来源。                                                                   |
| [Stability AI Stable Diffusion](https://github.com/Stability-AI/stablediffusion) 与 [Generative Models](https://github.com/Stability-AI/generative-models) | SD1/SDXL 推理代码与模型生态。                                                                          |
| [Black Forest Labs Flux](https://github.com/black-forest-labs/flux) 与 [Flux2](https://github.com/black-forest-labs/flux2)                                 | Flux / Flux2-Klein 路线参考。                                                                          |
| [Qwen Image](https://github.com/QwenLM/Qwen-Image) 与 [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)                                                     | Qwen 图像编辑、视觉理解和 TTS 能力来源。                                                               |
| [Wan 2.2](https://github.com/Wan-Video/Wan2.2) 与 WanVideo 生态                                                                                         | 视频生成、视频编辑、动作迁移、视频扩图等路线来源。                                                     |
| [Hugging Face transformers](https://github.com/huggingface/transformers) 与 [diffusers](https://github.com/huggingface/diffusers)                          | 模型加载、推理组件和通用生态。                                                                         |
| [TAESD](https://github.com/madebyollin/taesd)                                                                                                           | 轻量实时预览编码器。                                                                                   |
| [InvokeAI](https://github.com/invoke-ai/InvokeAI) 与 [chaiNNer](https://github.com/chaiNNer-org/chaiNNer)                                                  | 部分兼容和图像处理参考。                                                                               |

### Forge / WebUI 扩展

| 扩展                                                                                         | 来源或鸣谢                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ControlNet / legacy preprocessors                                                            | [lllyasviel/ControlNet](https://github.com/lllyasviel/ControlNet)、相关 annotator 与 Forge 扩展生态。                                                                                                                                              |
| IPAdapter                                                                                    | [cubiq/ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) 以及 IP-Adapter 相关作者。                                                                                                                                         |
| MultiDiffusion / tiled diffusion                                                             | [pkuliyi2015/multidiffusion-upscaler-for-automatic1111](https://github.com/pkuliyi2015/multidiffusion-upscaler-for-automatic1111)、[shiimizu/ComfyUI-TiledDiffusion](https://github.com/shiimizu/ComfyUI-TiledDiffusion)、Mixture of Diffusers 思路。 |
| Regional Prompter                                                                            | [hako-mikan/sd-webui-regional-prompter](https://github.com/hako-mikan/sd-webui-regional-prompter)。                                                                                                                                                |
| ADetailer-Neo、Tagcomplete、Qwen Vision Chat、SAM Matting、Trellis2、Storyboard Assistant 等 | 来自 WebUI/Forge 扩展社区，本仓库保留各扩展目录内说明和许可文件。                                                                                                                                                                               |

### ComfyUI 自定义节点

收集节点众多，以下为部分代表（若未罗列节点均受同等致谢）：

| 节点或节点家族                                                                                                                                                                                                                                                                   | 用途                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager)                                                                                                                                                                                                                      | 节点管理与生态入口。                                                                           |
| [ComfyUI-Easy-Use](https://github.com/yolain/ComfyUI-Easy-Use)                                                                                                                                                                                                                      | Easy 系列实用节点、加载器、XYPlot、Fooocus Inpaint 等能力。                                    |
| [ComfyUI-Danbooru-Gallery](https://github.com/Aaalice233/ComfyUI-Danbooru-Gallery)                                                                                                                                                                                                  | Danbooru Gallery、提示词编辑、素材浏览和中文用户工作流辅助。                                   |
| [Comfyui-LayerForge](https://github.com/Azornes/Comfyui-LayerForge)                                                                                                                                                                                                                 | 图层式画布编辑器，SimpAI WebUI 中的 LayerForge 能力参考。                                      |
| [ComfyUI_VNCCS_Utils](https://github.com/AHEKOT/ComfyUI_VNCCS)                                                                                                                                                                                                                      | Pose Studio、视觉相机控制、Qwen Detailer、模型管理等。                                         |
| [ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper)                                                                                                                                                                                                         | WanVideo 相关视频生成和编辑包装节点。                                                          |
| [ComfyUI-KJNodes](https://github.com/kijai/ComfyUI-KJNodes) 与 [ComfyUI-VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite)                                                                                                                                     | 视频、批处理、辅助节点和工作流工具。                                                           |
| [ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)                                                                                                                                                                                                                              | GGUF 模型加载与量化模型路线。                                                                  |
| [ComfyUI-Florence2](https://github.com/kijai/ComfyUI-Florence2)、[ComfyUI-WD14-Tagger](https://github.com/pythongosssss/ComfyUI-WD14-Tagger)、[ComfyUI-llama-cpp](https://github.com/lihaoyun6/ComfyUI-llama-cpp)                                                                         | 视觉理解、标签反推、LLM/VLM 本地推理。                                                         |
| [ComfyUI-Qwen-TTS](comfy/custom_nodes/ComfyUI-Qwen-TTS/README_CN.md)                                                                                                                                                                                                                | 基于[Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) 的语音合成、音色设计、克隆和多角色对白节点。 |
| [ComfyUI-Easy-Sam3](comfy/custom_nodes/ComfyUI-Easy-Sam3/README_CN.md)                                                                                                                                                                                                              | 基于[SAM3](https://github.com/facebookresearch/sam3) 的图像/视频分割节点。                        |
| [ComfyUI-Impact-Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack)、[rgthree-comfy](https://github.com/rgthree/rgthree-comfy)、[comfyui_controlnet_aux](https://github.com/Fannovel16/comfyui_controlnet_aux)、[ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus) | 检测、细化、ControlNet 预处理、图像参考和节点工作流增强。                                      |

## 许可

仓库根目录保留 GPL-3.0 许可文本。Forge Neo 迁移代码包含来自 `sd-webui-forge-classic` 的 AGPL-3.0 说明，详见 [html/forge_neo/NOTICE.md](html/forge_neo/NOTICE.md)。第三方节点、模型、扩展和权重文件可能有各自许可证或使用限制，分发和商用前请查看对应来源。

## 社区

- B 站 （个人主页）： [冰華子](https://space.bilibili.com/627080)
- QQ 交流群：`1005085136`

如果这个项目帮到了你，欢迎 Star、反馈问题、分享预置包和工作流。
