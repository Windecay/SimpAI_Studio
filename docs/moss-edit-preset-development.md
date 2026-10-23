# Moss-Edit 预置包准备

## 2026-10-22：项目调研与接入范围

状态：已核对上游源码、模型仓库元数据、示例工作流及 Studio 现有实现；尚未新增运行节点、正式预置、模型下载项或依赖。

### 1. 调研版本

- ComfyUI 插件：`Chenkin-x/ComfyUI-Moss-Image-Edit`，固定提交 `98a233e4b31dafce67a4e420fb71fb7feaf78907`，提交时间为 2026-10-22 18:41:56（北京时间）。
- 配套项目：`Chenkin-x/Moss-Image-Edit`，查询到提交 `1541d9af007ac96f37934166fe1ff2370af595a9`。
- 编辑权重：`chinoll/Moss-Image-Edit`，revision `2e6ecc52b6c773dcf02723834239d7e1ac807793`。
- 原始底模：`OpenMOSS-Team/MOSS-Image-SFT`，revision `f972bd4b4b9e3852133cc5da954d87bc32cd8fb9`。

上述版本是本次查询的快照，后续接入前应重新比较上游变化。

### 2. 可用功能和边界

| 项目 | 当前实现 | 预置准备意见 |
| --- | --- | --- |
| 单图编辑 | 一张必填参考图与文字指令 | 作为基本入口 |
| 多图编辑 | 最多四张独立参考图；用户在指令中说明角色 | 一个主图加三个参考位置，清楚显示实际编号 |
| 编辑内容 | 作者展示改色、服装、光照、季节和风格调整；示例指令也包含背景变化 | 作为使用示例，效果需实际验证 |
| 提示词 | 正向与负向文本；模型卡标注英文、中文 | 使用直接的编辑指令，单独编写中英文帮助 |
| 输出尺寸 | 宽高独立设置，16 对齐，节点范围 16～4096 | 首次验收从 512 起；4096 是参数上限，不是已验证能力 |
| 参考图尺寸 | 每张图分别按最长边上限缩小，再对齐 16；不把不同图片统一拉成同一比例 | 保留原图交给后端处理，避免 Studio 重复预处理 |
| 蒙版 | 没有 MASK 输入或局部回填流程 | 首版禁用蒙版，不声明局部像素保护 |
| 逐图强度 | 没有参考权重或结束位置参数 | 不沿用原 MOSS 图片提示中的这两项控件 |
| 采样 | 插件自己的 Euler / FlowMatch 采样，节点直接返回 IMAGE | 不直接拼入普通 KSampler 或现有 AIO 工作流 |
| 其他能力 | 当前节点不接受无参考图生成；未提供 ControlNet、Depth、ColorMap 或任意用户 LoRA 接口 | 首版只声明 `image_edit`、`multi_image_edit` |

插件自带单图和双图示例；第三、第四张图是源码中开放的可选输入。本次没有实际生成四图样本。

### 3. 与 Studio 现有 MOSS-Image 的区别

Studio 现有 `presets/MOSS-Image.json` 使用原生 Comfy MOSS 模型、W4A8 编码器、Flux2 VAE，以及文生图用的 DMD2 默认配置。现有视觉参考由 `SimpAIMossVision.py` 将图片交给 Qwen3.5 视觉编码器；Depth / ColorMap 使用单独控制权重。

本项目将参考图通过 VAE 变成 latent，加入专门的参考分支。参考分支固定使用 t=0，只关注参考 token；目标图与文字保留共同的采样时间，并可关注参考分支。参考 K/V 在一次采样中复用。

因此，添加普通 LoRA 或复用现有视觉参考节点都不足以实现该编辑方法。原生适配还需核对参考 token 的位置编码、注意力范围、模型权重名称、文本 conditioning 和 VAE 数值处理。现有原生 `MOSSImage._forward()` 未包含该参考分支。

编辑包使用自定义 `moss-edit-lora` 格式，`adapter_config.json` 声明 252 个目标模块，并带权重 SHA256；不能仅凭 `.safetensors` 扩展名认定可由现有 LoRA 节点直接加载。MOSS-Image 的 12 步、CFG 1、DMD2 0.75 也不能当作 Moss-Edit 的已验证配置。

### 4. 原版运行所需文件

插件默认从 `models/moss_image/` 下寻找两个目录：

```text
moss_image/
  MOSS-Image-SFT/
    pipeline_moss_image.py
    scheduler/
    text_encoder/
    tokenizer/
    transformer/
    vae/
  Moss-Image-Edit/
    adapter_config.json
    adapter_model.safetensors
```

按 Hugging Face 文件元数据统计，采用十进制 GB / MB：

| 文件集合 | 大小 | 说明 |
| --- | ---: | --- |
| 原始 SFT 权重 | 27,199,664,580 字节，约 27.20 GB | TE 四个分片、DiT 三个分片及 VAE |
| 静态整理的运行文件候选 | 18 个文件，共 27,219,797,168 字节，约 27.22 GB | 包括 tokenizer、索引、配置和根目录 pipeline；尚未做离线加载验收 |
| SFT 整个仓库 | 27,229,060,886 字节，约 27.23 GB | 含说明、演示资源等，不能将这些都计为必要权重 |
| 编辑权重 | 297,382,216 字节，约 297.38 MB | `adapter_model.safetensors` |
| 编辑配置 | 53,712 字节 | `adapter_config.json`，需与权重配套 |

编辑权重 SHA256：

```text
17a48b8c605dcffdedb92a2b887d18cf316505be90802717669fb6556098dcdf
```

原版加载器要求完整 Hugging Face 目录结构，并导入其中的 `pipeline_moss_image.py`。Studio 已有的 INT8 DiT、W4A8 TE 和独立 VAE 文件不能直接填入这两个目录参数。它们是否可以在原生适配后复用，需另做权重与数值一致性检查。

上游提供的下载说明以 Hugging Face 为准。本次没有核实编辑权重的可用 ModelScope 镜像；不能预先写入猜测的国内下载地址。发布清单应固定 revision、核对每个文件的大小与哈希，并保留代码和模型各自的来源及许可记录。插件代码标注 GPLv3；本次读取的编辑模型卡没有单独的 `license` 字段。

### 5. 依赖与运行方式

上游 `requirements.txt` 声明：

- `transformers==5.5.3`
- `accelerate>=1.13.0`
- `optimum-quanto==0.2.7`
- `safetensors>=0.8.0`
- `Pillow>=12.0.0`，另需 `numpy` 与 `packaging`。
- Diffusers 提交 `c943837899b16cbae2f619b8dd4f7bb6f07dd81a`。

Studio 根目录当前声明 `transformers==4.57.6`、`accelerate==1.10.1`、`diffusers>=0.36.0`。前两项存在明确版本冲突；上游 VAE 代码还明确要求 `diffusers>=0.38.0` 的非对称 Flux2 VAE 接口，Studio 的宽泛下限不能证明满足此要求。这里比较的是依赖文件，没有检查或改变已安装环境。

插件使用 PyTorch SDPA，requirements 未要求安装 FlashAttention。加载完整底模后，文本编码器与注入编辑权重后的 DiT 通过 Quanto 将 Linear 权重量化为 INT8；这不会减少首次下载的完整底模文件量。它有分阶段设备迁移、CPU 模型缓存、中断检查与 `finally` 清理；执行编辑前调用 Comfy 的 `unload_all_models()`。这不是 Studio 原生 ModelPatcher 的逐层卸载流程，不能据此承诺某档显存能够执行。缓存量、CPU 内存峰值、显存峰值和首次量化耗时都需实测。

### 6. 建议的首版预置

- 名称 `Moss-Edit`，分类 `MOSS`，新增独立 Scene 编辑预置。
- 拟新增 `presets/Moss-Edit.json` 和 `workflows/scene_moss_edit_cn_api.json`；现阶段仅记录文件计划。
- 第一张图必填，允许共四张图。画布与参考图按实际提交顺序连续编号，空位置不消耗编号；禁止用拼图代替独立参考输入。
- 只提供一个通用编辑主题。改色、换装、背景、光照、风格作为帮助示例；不把这些示例直接等同于经过验收的专用任务。
- 提示助手使用明确的编辑指令，说明改什么、保留什么、多图各自的用途。避免沿用文生图长描述、MOSS Layout JSON 或其他模型的特殊图片标签。
- 读取 `state.__lang` 选择中英文可见文案；沿用 Gradio 6，禁用蒙版、音频、视频及无对应能力的采样器和 LoRA 控件。
- 图像预处理由后端统一执行。输出比例可跟随主图，但输出分辨率与参考最长边分别设置。

建议初始参数以作者示例为对照：

| 参数 | 起始值 |
| --- | --- |
| 输出 | 512×512；正式界面可按主图比例调整并对齐 16 |
| 步数 | 30 |
| CFG | 4.0 |
| 参考最长边 | 512 |
| inference shift | 5.0 |
| 负向提示词 | 空字符串 |
| seed | 使用 Studio 现有种子设置 |

这些是调试起点，不代表最佳画质或推荐性能档位。

### 7. 接入顺序

1. **确定后端路径**：原版插件适合在隔离环境建立结果对照，但需要完整 SFT 文件和另一组依赖；正式 Studio 包优先评估原生适配，以复用已有模型管理。原生路径尚未证明兼容，不能先把现有模型登记成“就绪”。
2. **核对模型运算**：验证自定义 adapter 到原生权重的映射、参考分支、位置编码、CFG、时间步、文本编码及 VAE pack/BN；检查 INT8 / W4A8 量化差异。未验证前不启用 GGUF、DMD2 或已有控图组合。
3. **生成完整依赖清单**：最终文件格式确定后，在 `model_checker.py` 与预置 `model_list` 中登记相同依赖；目录模型需保留相对结构。缺模型时使用现有用户确认与下载入口。
4. **绑定界面与工作流**：覆盖主界面、Canvas、参数预设保存、实际图片顺序和生成结果元数据；按已选后端适配模型状态及取消行为。
5. **单独配置提示词规范**：检查 `modules/prompt_targets.py`，保证 Moss-Edit 不误用 `moss_image` 的文生图规范，也不因复用 Scene 容器而变成 Qwen 规则。登记中英文 skill 与帮助入口。
6. **验证完整生成路径**：从一图 512 开始，再验证两图、四图、不同长宽比、中文与英文指令、切换参考后的缓存、取消与连续任务；记录速度、内存、显存以及失败样本。验证后再扩展默认分辨率和 Agent 自动路由。

### 8. 本次检查与未完成内容

- 已完成：上游版本定位、README / 节点 / runtime 阅读、模型元数据与 adapter 配置核对、本地预置和原生模型路径比较。
- 已完成：单图 API 示例为 4 个节点、双图示例为 5 个节点；两者 JSON 可解析，所有输入节点引用存在，参数均为 512×512、30 步、CFG 4、参考最长边 512、shift 5。此检查没有执行工作流。
- 已知接入障碍：Transformers / Accelerate 版本冲突、特殊 Diffusers 要求、完整目录模型依赖、自定义编辑分支与现有模型加载器不直接兼容。
- 未执行：运行时导入、模型下载、依赖安装、Studio / Comfy 启动或重启、GPU 生成、浏览器操作、性能与画质验收、部署、暂存或提交。
- 工具查询曾遇到网页正文未返回、PowerShell 文件通配符解析失败和猜测文件不存在，均改用 GitHub API、明确文件路径或当前包定义继续完成；这些不作为模型运行失败记录。

### 9. 证据入口

- [插件 README](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/README.md)
- [节点输入与执行过程](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/nodes.py)
- [依赖固定版本](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/requirements.txt)
- [参考分支与缓存](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/moss_runtime/model.py)
- [编码器与底模加载](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/moss_runtime/components.py)
- [VAE 处理](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/moss_runtime/processing.py)
- [采样实现](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/moss_runtime/sampling.py)
- [运行时 INT8 量化](https://github.com/Chenkin-x/ComfyUI-Moss-Image-Edit/blob/98a233e4b31dafce67a4e420fb71fb7feaf78907/moss_runtime/quantization.py)
- [编辑权重元数据](https://huggingface.co/api/models/chinoll/Moss-Image-Edit?blobs=true)
- [SFT 文件元数据](https://huggingface.co/api/models/OpenMOSS-Team/MOSS-Image-SFT?blobs=true)
- [编辑模型卡](https://huggingface.co/chinoll/Moss-Image-Edit/blob/2e6ecc52b6c773dcf02723834239d7e1ac807793/README.md)
- 本地对照：`presets/MOSS-Image.json`、`presets/Flux3-KleinEdit.json`、`model_checker.py`、`modules/prompt_targets.py`、`comfy/comfy/ldm/moss_image/model.py`、`comfy/custom_nodes/SimpAINodes/SimpAIMossVision.py`。

后续实施、验证与参数变化追加到本文末尾。

## 2026-10-22：采用 Comfy 原生适配方向

用户进一步要求考虑原生 Comfy 方案。根据本次源码和 adapter 配置对照，该方向可行，作为后续 Moss-Edit 预置的优先实现方案。上一节的完整 HF 目录、Transformers 5.5.3 和特定 Diffusers 依赖，是直接运行原插件的要求，不是编辑模型必须使用的运行形式。

### 已核对的复用条件

| 部分 | 对照结果 | 原生方案 |
| --- | --- | --- |
| MOSS 主模型 | adapter 元数据的 42 层、3072 隐藏维、8192 FFN、24 heads、128 latent channels 与本地原生 MOSS 对应 | 使用 `UNETLoader` 和现有 `ModelPatcher`；优先评估已有 INT8 SFT 权重 |
| 编辑权重 | 252 个目标层全部对应 `layers.N.proj.{q,k,v,o,ffn_up_gate,ffn_down}`；名称与输入输出维度检查没有不匹配项 | 增加前缀映射与配置校验，使用现有 LoRA 权重处理；无需重新训练 |
| LoRA 格式 | 原作者使用常规 A/B 低秩增量，本权重 rank=64、alpha=64、dropout=0；本地适配器已支持无 `.weight` 后缀的 `.lora_A` / `.lora_B` | 例如映射为 `diffusion_model.layers.0.proj.q.lora_A`，显式保留 alpha；读取 config 中的完整性信息 |
| 融合 QKV | `comfy/comfy/lora.py` 已提供 MOSS 独立 q/k/v 到融合 qkv 的映射 | 复用该逻辑，后续验证量化权重上的实际应用结果 |
| 文本编码 | 原生 `moss_image` 路径与上游都使用 Qwen3.5-9B、末层 hidden state 和开启 thinking 的聊天模板 | 使用 `CLIPLoader(type=moss_image)`，优先评估已有 W4A8 TE；模板对应不代表量化数值完全相同 |
| VAE | 本地 VAE 已处理 Flux2 的 2×2 pack、BN 和不同宽度的 decoder | 使用 `VAELoader`、原生 encode/decode；不为此引入 Diffusers |

上述 252 项检查来自 adapter JSON 的名称和维度与原生类定义的比较，没有读取 adapter 大文件或执行真实权重前向。

### 仍需实现的编辑逻辑

1. 增加四张独立图片到 reference latent 的 conditioning，正向和负向均保留相同参考集合。
2. 在原生 MOSS 中支持参考分支：参考使用 t=0 和独立图片位置编号，参考之间互相关注，目标图与文字可关注参考。保持原模型无参考时的行为。
3. 对齐原生与上游的 token 排列、RoPE、时间步和 CFG；使用 Comfy Euler 采样器，必要时提供精确对应的 sigmas 节点。不能把所有 scheduler 都直接标为已经等价。
4. 参考 K/V 缓存与权重、图片、设备、dtype 和采样任务绑定，并计入显存预算。缓存失效、取消与卸载沿用 Comfy 生命周期；首次正确性对照可以不启用缓存。
5. 通过 `ModelPatcher` 管理编辑权重及模型操作，避免独立 `.to(cuda)` 绕过动态显存管理；验证普通 MOSS 任务与编辑任务往返后的状态。

建议工作流结构：标准模型 / CLIP / VAE 加载 → 编辑权重适配 → 文本与多图 conditioning → Comfy 采样 → VAE Decode → 保存图片。Studio Scene 预置只承担参数和素材绑定。

### 模型分发调整

正式原生包以复用现有 INT8 MOSS 和 W4A8 TE 为目标，新增编辑 adapter 及配套配置，不把约 27 GB 的完整 HF 底模目录作为默认下载要求。原始大权重只在需要精确数值对照时另行考虑。

VAE 不应仅按名称认定可直接复用：官方 SFT VAE 配置为 encoder 128/256/512/512、decoder 96/192/384/384；本地原生加载器已能推断不同 decoder 宽度，但已有 `flux2-vae.safetensors` 是否与官方文件等效尚未验证。可将官方 VAE 作为独立文件交给原生加载器，不需要保留整个 HF 目录。最终清单以权重核对和出图结果为准。

原生实现不计划引入上游 Transformers 5.5.3、Quanto 或 Diffusers 推理流程；已有依赖版本冲突不构成这条路线的必然障碍。

### 上游更新与验证状态

- 本次再次查询到上游 `7f592bc62726f9d9c7143eb6e09b7a2c18b6f978`，提交时间为 2026-10-22 19:17:53（北京时间）。GitHub compare 返回两个提交没有共同祖先，因此改按 Git tree blob 哈希比较；节点与 runtime 文件哈希相同，差异为两份 README。
- 新 README 明确支持 MOSS-Image-Base 或 MOSS-Image-SFT。Studio 预置仍优先使用现有 SFT，Base 不自动加入下载清单。
- 完成静态名称 / 维度检查和本地加载器路径对照，没有发现阻止原生移植的结构差异。参考分支及数值等价性尚未实现或验证，不能报告原生编辑已经可用。
- 本次仅追加方案文档；没有改动运行代码，没有模型下载、依赖安装、CPU 模型测试、GPU 生成、服务重启、暂存或提交。已知待处理项为参考分支实现、量化结果对照及 VAE 文件核对。

## 2026-10-22：原生实现与隔离测试

### 已完成的功能

- 新增 `Moss-Edit` Scene 预置及 `scene_moss_edit_cn_api.json`，接受一至四张独立图片。画布在前，随后为非空参考位置；输出与参考图分辨率分别控制，没有蒙版或局部回填。
- 使用原生 `UNETLoader`、`CLIPLoader(type=moss_image)`、`VAELoader`、ModelPatcher 和 Comfy Euler 采样。推理没有调用插件的 Diffusers / Quanto 流程，没有安装或升级依赖。
- 新增原生编辑 adapter、参考图 conditioning 和 SIGMAS 节点。adapter 校验配置、SHA256、目标层和 tensor 维度，并映射到现有 LoRA 处理；用户 LoRA 堆仍经过 `SimpAILoraStack`。
- 参考分支在 `BaseModel.extra_conds` 中预处理，各层 K/V 通过 conditioning 传递，生存期由本次采样管理，不保留在模型或全局对象中。CFG 分支各自取得参考缓存；显存估算包含参考图及缓存占用。
- 保留参考分支 t=0、独立图片坐标、参考之间的注意力范围和目标对参考的注意力。编辑分支使用上游的 float64 时间编码频率；原有无参考图路径维持原时间编码。
- 新增作者的 V2 最近训练网格采样时间表，避免再次应用 shift。默认 30 步、CFG 4、参考最长边 512、shift 5；普通 scheduler 控件隐藏。
- 新增模型包 51，清单与预置一致。复用当前 MOSS INT8 / W4A8 文件，使用已核对结构的 `moss_image_vae_bf16.safetensors`，另包含编辑权重和配置。编辑权重目前使用作者的固定 HF revision；没有编造或上传 ModelScope 镜像。
- 新增中英文界面标签与独立提示词指引，沿用读取语言状态的现有翻译入口。Moss-Edit 不使用文生图 Layout JSON 指引。
- 使用实际 `ComfyTaskParams` 验证并修正 Scene 参数映射，覆盖 CFG、宽高、参考最长边、shift、负向提示词与四个图片位置。

### 下载与运行环境

用户明确批准下载编辑权重并进行真实生成测试。adapter 与配置保存在本任务的
`artifacts/moss-edit-native-20261022/models/moss_edit/`，权重大小 297,382,216 字节，SHA256 与作者配置一致。下载曾在约 258 MB 处断流，续传后通过完整哈希校验；没有将不完整文件交给模型加载器。

本机验证使用 RTX 5090 32GB、PyTorch 2.9.1+cu130、Comfy Kitchen 0.2.39；已有 Transformers 4.57.6、Diffusers 0.36.0 均未升级。原生模型读取 `E:/SimpleAI/SimpleModels` 的既有文件，没有覆盖该目录中的模型或 E 盘应用文件。

检查的本地文件大小为 DiT 5,413,698,958 字节、TE 7,343,591,088 字节、VAE 124,774,710 字节，与新清单一致。VAE encoder 首层为 128 通道、decoder 首层为 384 通道，带 128 通道的 BN 参数；没有用普通 Flux2 VAE 文件替代它。

### 自动检查

- 相关原生 MOSS、控图、视觉参考、提示词、预置、参数映射和 LoRA 工作流检查：**286 passed**，2 条已有 Swig 弃用告警。日志为 `focused.log`。
- 与固定版本上游 tensor 模型的 CPU 数值对照：**18 组通过**，包括 1/2/4 张不同尺寸参考图、融合与独立 QKV、不同文本长度和时间步。最大绝对误差 `1.5497207641601562e-06`。这属于小模型 FP32 对照，不代表真实量化模型逐像素等价。
- 与上游 Scheduler 的 **4 组 SIGMAS 对照逐值一致**，涵盖 1/30/50/200 步及不同 shift。Diffusers 仅用于此测试对照，没有进入原生推理路径。
- Python / JSON 解析及 Git 空白检查通过。
- 检查并修正了 Windows 子目录分隔符、显存估算函数名称和参数形状、编辑时间编码精度、Scene CFG 映射。初始失败日志均保留；最终结果没有排除失败用例。

### 真实 GPU 结果与画面检查

三组任务通过隔离的 `PromptExecutor` 完成模型加载、实际采样、解码和 PNG 保存，没有通过当前 Studio 服务提交任务。均为 30 步、CFG 4、shift 5，参考最长边 512，seed 42。

| 测试 | 输出尺寸 | 任务耗时 | 进程峰值 allocated 显存 | 画面检查 |
| --- | --- | ---: | ---: | --- |
| 单图蓝色夹克改红色 | 384×512 | 22.522 秒 | 13,514.0 MiB | 改色符合要求，主要身份、姿势和构图保留；不承诺像素级保留 |
| 双图服装迁移 | 384×512 | 2.994 秒 | 14,649.9 MiB | 外套与高领上衣迁移，但也带入参考人物的眼镜、发辫，未满足身份保留要求 |
| 四图合照 | 768×512 | 3.752 秒 | 17,085.6 MiB | 实际只有三个人，身份与服装细节混用，未满足四人合照要求 |

第一组包含首次加载，后两组复用同进程的模型缓存；这些时间不是统一冷启动或纯采样基准。显存数值为本测试进程的 PyTorch allocated 峰值，不是最低显存配置承诺。

执行成功与画面符合要求分别记录：`gpu-report.json` 保存执行状态和耗时，`visual-review.json` 保存目视检查结论。多图失败样本保留，不能据这三次生成宣称多图编辑质量已通过，也不能据小模型数值对照断定所有偏差都来自上游模型。

证据目录：`artifacts/moss-edit-native-20261022/`，包含实际 API graph、history、PNG 元数据、原图、输出图、`contact-sheet.jpg`、测试日志及 CPU 对照结果。

### 未执行与使用条件

- 未启动或重启完整 Studio，没有同步 E 盘应用，没有暂存或提交。
- 未进行主界面浏览器操作、真实 Agent/MCP 请求、其他 GPU、GGUF、超大分辨率或大批量验收。
- 新预置需要加载更新后的 Studio / ComfyD 并刷新页面。adapter 仍在独立测试目录，正式模型目录尚未安装这两个文件；部署时应沿用模型管理器或显式复制匹配的权重与配置，不能只移动权重文件。
- 双图外观混用与四图漏人是已知测试失败，后续参数和质量评估应以这些样本继续比较，不删除或改写为成功记录。

## 2026-10-23：主界面提交时的 Shift 类型修正

- 用户日志中的 `shift, received_type(INT) mismatch input_type(FLOAT)` 来自 `SceneInput.var_number2` 的整数输出连接到 `MOSSImageEditScheduler.shift`。工作流校验在加载模型前拒绝任务；把默认值写成 `5.0` 不会改变端口类型。
- Shift 现在由 Moss-Edit 的参数映射直接写入调度节点的 FLOAT 输入，保留原有界面参数、默认值和用户保存的设置。没有修改共享 `SceneInput` 的类型，也没有改变采样计算。
- 参数映射检查从预置读取实际方法名，并按主界面的 `scene_` 前缀规则读取工作流，覆盖此前重复前缀导致找不到文件的情况。
- 新增实际 Comfy `validate_prompt` 检查：原连接可复现类型错误，修正后的完整工作流在 Shift 为 `5`、`5.3`、`0.1`、`20.0` 时通过校验且保留数值。仅模型文件清单使用模拟数据，没有加载权重或执行生成。
- `tests/test_moss_edit_preset.py`：**10 passed**，6 条第三方弃用告警。没有重启 Studio 或复验实际出图；需要重启 Studio 加载更新后的参数映射。

## 2026-10-23：迁移到官方编辑内核

- Studio 同步已审阅的 ComfyD `bef11fcbf`。参考分支、缓存、控制通道和 LoRA 映射采用官方实现，保留原作者时间编码精度与参考 KV 显存预算；原三个实验节点不再保留在核心。
- 编辑 adapter 使用标准 `LoraLoaderModelOnly`。`SimpAIMossEditReference` 保留原 UINT8/Lanczos 缩放，每张图片编码一次，向正负条件传递同一参考集合和官方 `Moss-Image-Edit` 方法；`SimpAIMossEditScheduler` 保留 V2 训练网格时间表。更新工作流、Shift 参数映射及隔离测试工具，不改变预置默认参数和既有素材路径。
- 已添加的 ChenkinLab 魔搭源继续优先，固定 HF revision 保留备用；adapter 和配置的尺寸、SHA256 与原文件一致。配置文件仍保留在模型包内，标准 LoRA 加载不再依赖旧的配置转换节点。
- Studio 中 18 组原作者 FP32 对照和 4 组 SIGMAS 对照通过，最大模型误差 `1.430511474609375e-06`；完整工作流校验与分数 Shift、参考图顺序及共享编码检查通过。没有重跑昨日的三组真实 GPU 任务，原有多图质量失败记录仍有效。
- 依赖声明已更新，但本次没有安装 Kitchen `0.2.40`、aimdo `0.6.0` 或模板 `0.11.96`，也没有重启 Studio/ComfyD。完整同步和测试范围见 `comfy/COMFYD_DEVELOPMENT.md` 的同日同步记录。

## 2026-10-23：仅开放单图，默认使用原图分辨率

- 用户实测及固定种子对照仍有双图人物、服装混用。Moss-Edit 现仅开放画布中的一张主图：移除额外参考入口、多图任务声明及工作流中的三个参考分支，更新中英文标题、提示指引和模型包说明。原有多图失败记录保留。
- 默认分辨率改为 `origin|Original`，并放在分辨率列表首项，使主界面和 Canvas 使用相同默认值。用户另选面积时，参考图按输出像素面积缩放，并在宽度对齐 16 后计算高度，避免宽高独立取整造成额外尺寸偏差；不裁剪或添加边缘。
- 参考长边参数默认仍为 `0`，代表自动匹配输出。非零值继续保留用户指定的手动上限，不覆盖保存的参数预设。
- 检查 11:07 的实际生成记录：1152×1920 原尺寸任务和 400×656 自动参考任务均已缩放参考图，人物混用不能仅归因于输入输出尺寸不同。
- 隔离 RTX 4090 D 实测：1152×1920 主图编码为 800×1312，输出同为 800×1312；服装改紫色成功，主要姿势和构图保留，衣服及饰品细节仍有变化。双图在尺寸匹配后依然没有保留准确人物和服装，不作为已支持能力开放。
- 相关节点、完整工作流校验、参数映射、Canvas/Agent 单图能力、默认分辨率、采样进度及分辨率处理检查：**98 passed**，6 条第三方弃用告警。证据在 `artifacts/moss-edit-size-20261023/`，包含 `report.json`、`visual-review.json`、`pytest.log` 和输出图。
- 修改留在 Studio 暂存区，没有提交、安装依赖或重启服务；需要重启 Studio/ComfyD 并刷新页面后验证主界面。
