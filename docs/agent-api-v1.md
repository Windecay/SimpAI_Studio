# Studio Agent API v1

本接口供 Studio 内部 VLM 工具、社区 MCP、脚本和其他 Agent 共用。调用者提供预置 ID、素材 ID 和参数；服务端从当前用户的预置目录生成执行配置，沿用预置中的模型、LoRA、风格和默认值。

## 提示词规范、技能与 UTF-8 请求

选择预置后先读取 `GET /api/v1/prompts/guidance?preset_id=...&theme=...`，或预置详情中的 `prompt_guidance`。它返回最终提示词的语言、格式、图片编号规则、推荐技能、可用提示词工具和预置默认风格。不要将预置中的文本编码器名称直接当成提示词格式，也不要根据一次未复核的结果判定模型只适合人物或不适合风景。

| HTTP 接口 | 工具 | 用途 |
| --- | --- | --- |
| `GET /api/v1/skills` | `simpai.skills.list` | 查询内建规范、项目技能和当前身份自己的技能；带 `preset_id` 时优先列出推荐技能 |
| `GET /api/v1/skills/document` | `simpai.skills.read` | 使用发现到的 `skill_id` 阅读；长文通过 `next_read` 继续，版本变化时重新读取 |
| `GET /api/v1/prompts/guidance` | `simpai.prompts.guidance` | 查询指定预置及主题的提示词要求 |
| `POST /api/v1/prompts/tags` | `simpai.prompts.tags` | 使用已有的本地 Anima/Danbooru 标签与角色查询 |
| `POST /api/v1/prompts/validate` | `simpai.prompts.validate` | 使用已有提示词预检，无模型加载或生成 |

这些工具均需 `read` 权限，MCP 动态发现同一份 schema。技能按服务端实际身份读取，不接受用户目录或任意路径，不返回本地路径。内容属于参考资料，不能授权写入、下载、改变身份或执行文档中的代码。接口不会为提示词查询额外调用 LLM。

`instruction` 是用户原始需求；新增的 `prompt` 是实际用于模型生成的最终提示词。未提供 `prompt` 时保留原有行为，但选定模型的提示词检查仍执行。例如 Anima 可以保留中文 `instruction`，`prompt` 必须按规范使用英文标签及简短英文 nltags。请求同时传入 `prompt` 和 `parameters.prompt` 时，两者必须一致。预览返回 `source_instruction`、`prompt`、`prompt_guidance` 和 `plan.prompt_validation`；中文 Anima 提示词会返回 `needs_prompt`，不能直接提交。纯转换类任务仍可按预置要求使用空提示词。

JSON 请求以 UTF-8 字节发送，API JSON 响应明确使用 `application/json; charset=utf-8`，兼容 Windows PowerShell 5.1 的读取行为。若文字已全部变成问号或包含 Unicode 替换字符，返回 `text_encoding_error`，不启动生成。原文一旦在调用方丢失，服务端不能恢复，不能通过丢弃 `instruction` 继续提交。

Windows PowerShell 示例：先用编辑器或文件工具将请求保存为 UTF-8 `request.json`，复用私密连接层提供的 `$privateHeaders` 与发现到的 `$previewUrl`。

```powershell
$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path './request.json').Path)
$preview = Invoke-RestMethod -Method Post -Uri $previewUrl `
    -Headers $privateHeaders -ContentType 'application/json; charset=utf-8' `
    -Body $bytes -TimeoutSec 30
```

Python 示例也从 UTF-8 文件读取，而不是把中文 Python 代码经默认编码的 PowerShell 管道送入 stdin：

```python
import json
from pathlib import Path

payload = json.loads(Path('request.json').read_text(encoding='utf-8-sig'))
response = session.post(preview_url, json=payload, timeout=(5, 30))
response.raise_for_status()
preview = response.json()['data']
assert preview['source_instruction'] == payload.get('instruction', '')
if 'prompt' in payload:
    assert preview['prompt'] == payload['prompt']
```

这里的 `session` 是已经配对的私密 HTTP 会话，令牌不写入模型可见的示例、消息或日志。最终还应核对返回的提示词和 `ready_to_submit`，只在原始用户授权范围内提交。

2026-10-06 验证记录：相关回归 `326 passed, 1 deselected, 17 subtests passed`，新增提示词专项最终为 18 项通过，包含真实 Windows PowerShell 5.1 → HTTP API → 中文响应的字节往返、中文 Anima 提示词阻止提交、损坏文字拒绝、私有技能隔离及模型类别识别。真实 MCP stdio 发现 23 个工具，读取 Anima 规范成功；接入页 8 组浏览器场景与 9 项 Node 检查通过。排除的一项 H3 旧断言在恢复修改前的提示词目标函数后同样失败，未更改其测试或 H3 行为。记录位于 `outputs/agent_api_repair_20261006/`。

实际本地标签查询也执行了验证：完整中文长句可能没有索引匹配；改用 `scenery, landscape, mountain, fog, no_humans` 后返回 24 个候选，其中前 5 个是所查标签。工具明确要求仅使用符合用户意图的标签，查询无结果不代表模型不能绘制该内容。本次没有通过生产身份提交新的 GPU 生成，也没有把模拟任务返回值作为图像质量验收。

本文的接口与调用说明按 **2026-10-07 当前实现**维护。各“验证记录”保留对应阶段的执行范围和结果，不能将早期未执行的项目解释为当前仍未实现。真实单节点 GPU、只读 Harness 与后续下载交互的验收范围分别记录，不合并为完整端到端验收。

HTTP 基址是 **Studio 页面所在服务的 `/api/v1`**，不是 ComfyD 端口。首次连接查询公开的 `auth/discovery`；确认身份后访问基址获取能力发现信息。更新代码后需重启 Studio 才会注册当前路由。

可视接入指引位于当前服务的 `/api/v1/connect`，支持 `lang=cn|en` 和 `theme=light|dark`。Studio 底部“Agent / API 接入”及启动器 Studio 运行状态区域均可打开该页。页面提供当前地址、HTTP 调用说明、独立 MCP 环境安装和客户端配置，不包含用户身份、凭据或服务器绝对路径；页面公开可读不改变其他 API 的权限要求。

启动器 4.0.9 在取得实际服务地址后异步验证公开的 `auth/discovery` 与接入页面；两者均支持才显示区域。旧版、404、超时及未完成验证时保持隐藏，重启会重新检查。此探测不要求用户登录，也不向工具接口提交任务。

接入入口验证（2026-10-06）：API/启动配置相关 Python 检查 20 项通过，配置生成 Node 检查 3 项通过；实际 Gradio 页面在中文/英文、桌面/手机及根路径/部署前缀四组浏览器检查中通过，包含打开接入页、切换配置格式、已有 Python 环境和复制操作。启动器另有 48 项专项检查及实际 Qt 控件截图，进程事件由测试模拟。产物位于 `outputs/agent_connection_20261006`；没有重启当前 Studio/启动器，没有安装 MCP 依赖、修改用户客户端配置或构建启动器 exe。

## Agent 如何发现接口

根目录的 [AGENTS.md](../AGENTS.md) 提供仓库内 Agent 的入口，说明服务地址的来源、发现接口和任务调用顺序。Codex 默认识别的文件名是 `AGENTS.md`，普通 `agent.md` 不属于默认名称；其他 Agent 是否读取该文件，取决于各自的配置。新会话可用于检查仓库指导文件是否已被加载。

不同入口需要分别配置：

- **读取仓库的 Agent**：通过 `AGENTS.md` 找到本接口文档，再查询实际服务的能力和参数。
- **Studio 内置 VLM**：聊天、创作和向导模式已通过 `vlm_harness` 执行有界只读工具循环，工具目录按当前身份及权限过滤。工具结果传回模型供后续轮次使用，最终回复沿用已有创作任务与确认流程。生成、下载、上传和取消不由模型直接执行。
- **外部 Agent 或社区 MCP**：连接配置提供实际 Studio 服务地址，私密连接层查询 `/api/v1/auth/discovery`，按服务模式使用本地身份或浏览器配对凭据，并查询 `session` 核对身份。随后读取 `/api/v1/capabilities`；HTTP Agent 优先使用返回的 `tool_index_url` 搜索简短索引，再按所选工具的 `detail_url` 读取参数，无需预先完整阅读工具清单或 OpenAPI。旧服务未提供索引时使用其 `tools_url`。MCP 适配器继续使用原来的完整清单注册工具。凭据不传给模型。仓库已提供独立 [stdio MCP 适配器](agent-mcp.md)，动态转换工具目录并处理私密连接；Studio HTTP 服务本身不开放网络型 MCP 传输入口。

下面的启动说明可以提供给具备 HTTP 调用能力的外部 Agent，使用前替换服务地址：

```text
SimpAI Studio 服务地址：<实际 Studio 服务地址，包含部署前缀>。
处理用户的媒体创作任务时，使用该服务的统一 Agent API。
连接层首先 GET <服务地址>/api/v1/auth/discovery，确认服务、运行模式和 next_step。
若 next_step=use_local_endpoint 且 Agent 与 Studio 同机，读取 local_endpoint.discovery_url，
核对 service_id 与模式一致后，通过服务公布的回环入口继续配对。
未提供可用入口时才说明连接条件；不扫描端口、不猜测 HTTPS 地址、不读取凭据文件。
按需完成浏览器配对和私密凭据管理，
查询返回的 session_url 核对身份和权限，仅申请当前任务需要的权限。
随后 GET <服务地址>/api/v1/capabilities，读取响应 data 中的版本和发现入口，
优先使用 tool_index_url 按 query 或 category 搜索，只读取所选工具的 detail_url 获取参数，
再通过返回的 call_url 调用；无需在每个任务前读取完整清单或 OpenAPI。
当前页不足时才读取 next_url；旧服务未提供索引时使用其公布的 tools_url。
模型不能读取连接凭据。
查询预置详情与主题参数，上传输入素材，通过 routes/preview 检查任务条件。
在用户当前请求和已有自动生成设置的授权范围内提交生成，等待完成并读取结果。
每个请求设置超时，网络重试保留同一 request_id 和相同正文，避免重复生成。
```

预置、模型、主题和参数通过运行时接口查询，不在启动说明中固定维护一份清单。仅发布仓库指导文件不能使远程 Agent 自动获知服务地址或获得 HTTP 调用能力。

## HTTP 按需发现工具

`capabilities.tool_index_url` 指向 `/api/v1/tools/index`。该接口返回名称、完整简短说明、类别、只读声明和 `detail_url`，不生成或附带每个工具的参数 schema。它与完整工具清单使用同一份操作定义，不维护另一套功能名单。

- `query`：匹配工具名称或英文说明中的词，忽略大小写；多个词需全部匹配，不是模型语义搜索。
- `category`：使用响应 `categories` 中的类别，例如 `presets`、`prompts`、`runs`、`vlm`、`workflows`。空值不限制类别。
- `offset`、`limit`：默认从第 0 项开始返回 20 项，每页最多 100 项。响应包含 `total` 和 `next_url`；当前结果不足以完成任务时才继续查询，不必顺序阅读全部页面。

例如查询 `tool_index_url?category=presets`，选择 `simpai.presets.list` 后，读取该项返回的 `detail_url`。详情包含与完整清单一致的 `name`、`description`、`input_schema`、`read_only`，以及 `call_url`；按 schema 向 `call_url` 发送 `{"name":"simpai.presets.list","arguments":{"query":"Qwen"}}`。使用实际响应 URL，保留部署前缀。

无匹配时返回空列表，未知工具详情返回 `404 tool_not_found`；非法查询参数返回 `422 invalid_request`。索引与详情均要求原有身份和 `read` 权限，读取元数据不授予生成、下载或本地推理权限，也不执行这些操作。

`tools_url` 和原 `GET /api/v1/tools` 的完整返回格式保持不变，供 MCP/SDK 注册工具；OpenAPI 仍提供完整 HTTP 协议。旧服务没有 `tool_index_url` 时，读取其公布的原目录，不猜测新接口地址。

## 发现接口

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/v1/auth/discovery` | 公开的首次连接入口，返回服务、模式、授权与续期入口 |
| GET | `/api/v1/connect` | 公开的可视接入说明，包含 HTTP 入口及 stdio MCP 客户端配置 |
| GET | `/api/v1` | 能力发现入口，返回与 `capabilities` 相同的内容 |
| GET | `/api/v1/capabilities` | 版本、操作名称、支持的任务 ID、上传限制和发现入口 |
| GET | `/api/v1/openapi.json` | 此 API 的 OpenAPI 文档及请求 schema |
| GET | `/api/v1/tools/index` | HTTP Agent 优先读取的简短索引；支持 `query`、`category`、`offset`、`limit` |
| GET | `/api/v1/tools/{tool_name}` | 按索引中的 `detail_url` 读取单个工具的完整参数及调用地址 |
| GET | `/api/v1/tools` | 完整名称、描述、JSON Schema、只读声明；保留 MCP/SDK 兼容 |
| POST | `/api/v1/tools/call` | 按工具名称和参数调用相同服务 |
| GET | `/api/v1/session` | 当前身份、权限、存储范围及与浏览器界面的交互边界 |
| GET | `/api/v1/queue` | 可见的手动、Canvas、Agent 排队与执行中任务 |
| GET | `/api/v1/system/status` | 节点 worker、队列、GPU 和主机资源；需要 local/admin 权限 |
| GET | `/api/v1/presets` | 按 `query`、`task`、`output_type` 搜索；支持 `offset`、`limit` |
| GET | `/api/v1/presets/{preset_id}` | 主题、输入要求、蒙版要求、提示词标签格式、参数 schema 和默认值 |
| GET | `/api/v1/presets/{preset_id}/models/status` | 检查所需模型是否存在，返回缺少的模型名称；不下载、不加载模型 |
| POST | `/api/v1/presets/{preset_id}/models/download` | 经单独下载授权后请求缺失模型下载，返回进度查询入口 |
| GET | `/api/v1/models` | 模型目录；可传 `preset_id` 查询兼容目录，并按 `kind`、`query`、`offset`、`limit` 查询 |
| POST | `/api/v1/routes/preview` | 任务路由、参数校验、图片绑定和缺失条件；不提交 GPU 任务 |
| POST | `/api/v1/assets` | 上传媒体的 base64 data URL，返回可重复引用的 `asset_id` |
| GET | `/api/v1/assets/{asset_id}/content` | 读取当前用户拥有的素材或生成结果 |
| POST | `/api/v1/runs` | 提交生成任务，返回 HTTP 202 和 `run_id` |
| GET | `/api/v1/runs/{run_id}` | 查询进度、状态及输出素材 |
| POST | `/api/v1/runs/{run_id}/cancel` | 请求取消任务 |

路径中的预置 ID 和素材 ID 应做 URL 编码。响应中的 `content_url`、`status_url`、`details_url` 可以直接使用；经过反向代理的 `root_path` 会包含在这些 URL 中。

`capabilities` 返回的 `connection_guide_url` 指向可视接入页，包含相同的部署前缀。内置 Harness 直接调用共享工具服务，不通过 MCP；外部客户端是否使用 MCP，由其连接配置决定。

公开的 `auth/discovery` 也返回 `connection_guide_url`，以及针对**本次连接**计算的 `transport`、`pairing_available` 和 `next_step`。`transport` 包含 `requirement`、`scheme`、`loopback`、`satisfied`；`next_step` 为 `inspect_session`、`browser_pairing`、`use_local_endpoint` 或 `configure_https_or_loopback`。当前地址不能配对但服务已为同机客户端建立本机入口时，返回 `local_endpoint`，包含实际 `base_url`、`discovery_url`、`connection_guide_url`、`service_id` 和 `same_machine_only=true`。调用方核对同一服务后继续，不能只看到当前地址的 `pairing_available=false` 就结束。

当前启动流程保留选定的局域网地址，并为同一应用建立真实回环监听；不扩大到所有网卡。回环入口由实际绑定结果生成，停止时关闭。传输校验仍要求 HTTPS 或主机名及实际对端均为回环。外部电脑继续使用已配置的 HTTPS 入口，不能使用另一台电脑的 localhost。详细操作见 [MCP 文档](agent-mcp.md) 的“配对前检查地址”。

双监听验证（2026-10-06）：启动与监听检查 19 项、授权/MCP 检查 70 项、Node 检查 5 项及 8 组页面检查通过；最后的 MCP 连接层复查 15 项通过。实际 Gradio 双监听的完整 device → 浏览器批准 → token → session → capabilities/tools 流程通过，身份由隔离测试服务提供。当前运行实例重启后，局域网和回环的服务标识一致，MCP 从公布的入口选择回环；真实 device 请求返回 201，授权页面返回 200，实际接入页已生成可用的回环配置。本次未代用户批准生产授权，也未输出或保存设备密钥和令牌。报告为 `outputs/agent_connection_20261006/live-loopback-report.json` 和 `live-loopback-browser.json`。

本地模式使用服务器解析的本地工作区身份，不要求浏览器参与，也可通过配对获取受限凭据。多用户外部 Agent 使用浏览器批准的 Bearer 授权；Studio 浏览器内部沿用现有登录会话（`aitoken`，保持与登录时一致的 User-Agent）。私密连接层负责 access/refresh token 的保存、串行续期和撤销；v1 未提供长期机器 API Key。请求正文不能指定身份，任务权限沿用现有后端，素材与任务按用户隔离。

## 常见调用顺序

1. 查询公开的 `auth/discovery`，按服务模式获得身份，读取 `session` 核对权限和存储范围。
2. 查询 `capabilities` 和 `tools`，发现版本与功能。
3. 根据目标搜索预置，或调用 `routes/preview` 获取当前可用方案；读取所选预置与主题的参数 schema。
4. 上传输入图片、视频、音频，保留返回的素材 ID，重新预览实际任务条件。
5. 发现模型缺失时，单独获得下载授权并等待模型就绪，或检查无需下载的兼容方案；随后重新预览任务。
6. 在生成授权范围内提交带有唯一 `request_id` 的任务，查询状态，读取输出。
7. 后续编辑可以直接引用输出素材 ID。

`presets` 是摘要目录，模型状态为 `unchecked` 或缓存中已知的 `missing`。`models/status` 和 `routes/preview` 执行实际的模型可用性检查。全局 `models` 默认查询基础模型；返回的 `kinds` 列出可查询的类别。指定 `preset_id` 时，类别来自该预置的兼容模型目录。

路由使用现有任务能力和预置优先级，不额外调用 LLM。外部 Agent 可以自行比较查询结果，明确传入 `preset_id`；指定不兼容的预置会返回错误。自定义预置参数要求明确选择预置，避免同名参数在不同预置里具有不同含义。

## 参数与素材

预置详情返回 `parameter_schema` 和便于阅读的 `parameters`：参数 ID、名称、类型、默认值、范围、步长、可选值和只读属性。标签按 `lang=cn|en` 返回，未指定时使用当前状态语言。主题参数分别解析，不沿用其他主题的范围或默认值。

标准生成参数也通过该 schema 查询；例如 `overwrite_step` 表示采样步数。采样器与调度器选项来自对应后端。只有已列出且非只读的字段可以传给 `parameters`，未知字段、越界值、错误类型和不符合步长的值会被拒绝。`x-step` 表示从最小值开始计算的步长；适用的整数步长同时提供 JSON Schema `multipleOf`。少数旧预置声明的默认值超出滑杆范围时，schema 用 `anyOf` 明确保留该默认值，其他新值仍按范围与步长校验。

`inputs` 保留调用者的图片顺序，`ref` 可选，默认 `input_1`、`input_2` 等。每项包含 `type`（默认 `image`）和服务返回的 `asset_id`。上传与生成结果可能分别使用 `asset:<hash>` 或 `file:<hash>`，调用者应原样保留，不能自行改写 ID。蒙版通过对应画布图片的 `mask_asset_id` 提供。是否必需由所选预置声明。QwenPose 会按现有约定把人物图和姿势图绑定到正确的后端位置。

原图和蒙版分别上传，再把两者的 ID 放到同一输入项，例如 `{"inputs":[{"asset_id":"asset:<原图 hash>","mask_asset_id":"asset:<蒙版 hash>"}]}`；不要把蒙版作为第二张参考图加入 `inputs`。建议使用与原图同尺寸的黑白 PNG，白色指定编辑区域，黑色保留。已指定的蒙版无法读取时会停止提交，不会自动按未提供蒙版处理。蒙版文件保存在当前身份的 Studio 素材目录，生成时再作为对应画布图片的蒙版传给后端。

`output` 可指定 `count`（1–4）、`seed`（-1 为随机）、`aspect_ratio`（默认 `auto`），或成对指定 `width`、`height`。Auto 沿用输入比例和预置的尺寸处理规则。v1 不接受文件绝对路径、任意远端媒体 URL、Canvas 节点结构或模型/LoRA 覆盖字典。

上传限制为 80 MiB，支持的 MIME 列表由 `capabilities` 返回。结果包含尺寸、MIME、素材 ID 和受身份检查的下载地址，不返回服务器文件路径。当前通过预置目录执行的工作流范围与 Studio 一致；专用工具节点的独立协议不自动变成预置。

## Python 示例：擦除指定物体

以下代码在当前 API 已加载的本地模式 Studio 上执行真实生成。将环境变量 `SIMPAI_STUDIO_URL` 设为实际 Studio 地址（可含部署前缀），将图片路径改为输入文件。多用户模式应由私密连接层完成下文的浏览器配对，提供带 Bearer 的 Session，并在授权期限内管理续期；不要把凭据写进模型提示词或示例日志。

```python
import base64
import os
import time
import uuid
from pathlib import Path
from urllib.parse import quote, urljoin

import requests

BASE = os.environ["SIMPAI_STUDIO_URL"].rstrip("/") + "/"
session = requests.Session()


def call(method, path, **kwargs):
    response = session.request(method, urljoin(BASE, path), timeout=60, **kwargs)
    response.raise_for_status()
    result = response.json()
    if not result.get("ok"):
        raise RuntimeError(result.get("error"))
    return result["data"]


auth = call("GET", "api/v1/auth/discovery")
if auth["access_mode"] != "local":
    raise RuntimeError("Configure a browser-paired Session in the private connection layer.")
identity = call("GET", auth["session_url"])["identity"]
if identity["service_id"] != auth["service_id"] or identity["access_mode"] != "local":
    raise RuntimeError("identity_mismatch")

preset_id = "QwenEraser"
detail = call("GET", f"api/v1/presets/{quote(preset_id, safe='')}", params={"lang": "cn"})
print(detail["mask"], detail["parameter_schema"])

binary = Path("input.png").read_bytes()
asset = call("POST", "api/v1/assets", json={
    "name": "input.png",
    "data_url": "data:image/png;base64," + base64.b64encode(binary).decode(),
})
task = {
    "preset_id": preset_id,
    "instruction": "擦除图片右上角的气球，保持其他内容不变。",
    "inputs": [{"asset_id": asset["asset_id"]}],
    "output": {"aspect_ratio": "auto", "count": 1},
}
preview = call("POST", "api/v1/routes/preview", json=task)
if not preview["ready_to_submit"]:
    raise RuntimeError(preview)

# 网络重试时保留此 ID 和同一请求正文，避免重复提交。
request = {**task, "request_id": uuid.uuid4().hex}
run = call("POST", "api/v1/runs", json=request)
deadline = time.monotonic() + 900
while run["state"] in {"preparing", "queued", "running", "cancelling", "skipping"}:
    if time.monotonic() >= deadline:
        raise TimeoutError(run["run_id"])
    time.sleep(2)
    run = call("GET", run["status_url"])

if run["state"] != "finished" or not run["assets"]:
    raise RuntimeError(run)
result = session.get(urljoin(BASE, run["assets"][0]["content_url"]), timeout=60)
result.raise_for_status()
Path("result.png").write_bytes(result.content)
```

在任务记录保留期间，同一用户下相同 `request_id` 的相同正文会返回原任务；相同 ID 携带不同正文返回 409，不生成第二个任务。任务记录沿用现有 Studio 内存队列，v1 不提供记录过期或重启后的任务恢复保证。

## 内部 VLM 与社区 MCP

`simpai.capabilities`、`simpai.session.get`、`simpai.queue.get`、`simpai.system.status`、`simpai.presets.list/get`、`simpai.help.search/read`、`simpai.parameter_profiles.list/get`、`simpai.models.list/status/download`、`simpai.routes.preview`、`simpai.runs.submit/get/cancel`、`simpai.assets.upload` 均注册到现有 VLM ToolRegistry。HTTP 和内部工具使用同一请求模型、服务方法与参数校验。内部调用需要服务器创建的 `AgentContext`，不能从模型返回的 JSON 构造身份。工具注册不等于允许模型直接执行写操作：内置 Harness 只自动执行当前身份可用的只读工具。

MCP 适配器可以读取 `/api/v1/tools`，把 `input_schema` 作为工具参数定义，并将工具调用转发到 `/api/v1/tools/call`：

```json
{
  "name": "simpai.routes.preview",
  "arguments": {
    "instruction": "让图1穿上图2的衣服",
    "inputs": [{"type": "image"}, {"type": "image"}]
  }
}
```

此查询允许未上传的逻辑输入，返回候选预置、图片绑定和 `requires_upload`；它不会触发生成。MCP 工具的读写声明应沿用 `read_only`，任务提交、取消和上传由调用者的授权流程控制。

参考过社区项目 `lilesswoo-ai/simpai-doubao-MCP` 的 `simpai_mcp/server.py` 和 `client.py`。其实现中有直接连接 ComfyD、分别声明模型工具和参数的路径；本 API 使适配器能够动态查询 Studio 当前实际的预置与参数。内置 VLM Chat 已具备有界只读工具循环，独立 stdio MCP 适配器已提供；网络型 MCP 服务、供应商原生 tool-calling 适配和后台任务持久化尚未实现。

## 返回格式与验证

成功响应为 `{"ok": true, "api_version": "1.0", "data": ...}`。失败响应为 `{"ok": false, "api_version": "1.0", "error": {"code": ..., "message": ..., "details": ...}}`，并使用对应 HTTP 状态。常见错误包括 `invalid_request`、`invalid_parameter`、`preset_not_found`、`no_compatible_preset`、`task_not_ready`、`input_upload_required`、`asset_not_found` 和 `authentication_required`。

测试覆盖真实预置 schema、ASGI HTTP 路由、内部工具、实际素材存取与用户隔离；生成队列在专项测试中使用替身。初版 dry-run 报告位于 `outputs/agent_api_v1_20261005`。随后已通过实际 API 完成单节点图片生成、Qwen2.1 编辑、任务取消和素材复用，并通过真实本地模型验证只读工具循环与 SSE 恢复，报告位于 `outputs/agent_api_gpu_20261006`。下载确认与拒绝后的替代方案已有专项及浏览器组件检查，尚未完成真实下载到生成的完整 Studio 浏览器验收；多用户真实账号、视频/音频、远程模型、任务重启恢复和集群也不在已通过的 GPU 验收范围内。

## 2026-10-05：用户协作、队列与节点资源

本次增加三个只读入口，HTTP 和内部 VLM 工具仍使用同一协议：

| HTTP | 工具 | 用途 |
| --- | --- | --- |
| `GET /api/v1/session` | `simpai.session.get` | 当前用户身份、权限、语言，以及 API 与用户界面的交互范围 |
| `GET /api/v1/queue?scope=user` | `simpai.queue.get` | 当前用户在节点上的手动、Canvas、Agent 排队及执行中任务 |
| `GET /api/v1/queue?scope=node` | `simpai.queue.get` | 节点全部任务摘要，仅本地身份或管理员可查询 |
| `GET /api/v1/system/status` | `simpai.system.status` | worker、队列、GPU、显存、CPU、内存与调度能力，仅本地身份或管理员可查询 |

能力发现增加 `session_url`、`queue_url`、`system_status_url`，继续保留反向代理部署前缀。队列支持 `offset`、`limit`，默认返回当前用户任务；`counts` 是节点总数，`total` 是当前查询范围内的可见任务数。普通用户不能通过参数或工具正文改变权限，也看不到其他用户的任务 ID、提示词或路径。管理员能查询全局任务，不因此获得取消其他用户任务的权限。

### Agent 与用户界面的关系

手动、Canvas、Agent 生成使用同一现有 worker 队列。Agent 提交独立的 run，不修改用户正在编辑的提示词、预置、画布选择，也不自动将结果替换到当前浏览器画布。`session.interaction` 明确返回 `browser_session_attached=false`、`can_read_ui_state=false`、`can_modify_ui_state=false`。

HTTP 工作区身份不等于浏览器会话。当前 API 未读取聊天面板的自动生成选项，`automatic_generation_preference=null` 表示未知，不能解释为开启。确认流程由调用方管理：外部 Agent 按用户授权提交，内置 Agent 继续遵守界面已有的自动生成或确认设置。后续若增加“读取当前编辑内容”“向当前画布提出修改”“用户确认后应用”，需要带浏览器会话及项目版本的独立协议，不能仅凭用户 DID 选择某个浏览器窗口。

队列摘要用 `source=ui|canvas|agent_api` 标记来源，包含状态、排队位置、预置及是否请求取消；Agent run 附带 `status_url`。队列查询不消费任务的输出事件，不加载模型，不启动 worker。准备中的 Agent/Canvas 请求也会显示。异步 Cloud 任务计入执行中任务，因此 `running` 不等于正在使用 GPU 的本地任务数量。

取消排队任务现在只标记该任务，worker 取出后直接完成取消，不调用全局 Comfy 中断。只有当前正在执行且已经开始处理的任务会携带任务对象请求中断，发送中断期间不允许 worker 切换到其他任务。已完成输出仍优先发布，避免把完成的任务改成取消。

### 节点与集群调度

`node_id` 默认由主机名散列生成，可通过启动环境变量 `SIMPAI_AGENT_NODE_ID` 指定。每个 Studio 进程有独立 `instance_id`；调度器应区分进程重启前后的任务和快照。队列返回 UTC `sampled_at`，资源返回独立采样时间与 `age_seconds`，资源查询完成后缓存两秒。worker 未初始化时，计数为 `null`，不会假报空闲。

GPU 信息通过带三秒超时的 `nvidia-smi` CSV 查询提供，包括每张 NVIDIA GPU 的 UUID、名称、总显存、已用显存、空闲显存、GPU 利用率、显存控制器利用率；显存统一使用 bytes，利用率使用百分比。字段不受支持时返回 `null`；查询超时、工具未安装或失败时返回 `available=false` 和机器可读原因，不把未知状态写成零。此入口不安装依赖、不导入 Torch，也不初始化 CUDA。

`resources.scope=studio_host` 表示 Studio 所在主机，不表示远程 Comfy 后端的资源。`gpu_task_busy` 表示 Studio 共享 GPU 任务锁是否被占用，它与硬件利用率是两种不同信号。内存快照使用系统可用内存，不把 Torch 的缓存分配量当成机器剩余显存。

当前本地生成 worker 的执行容量为 1，Cloud 并发容量为 2；节点队列仍按现有 FIFO 处理。接口明确声明不支持按 GPU 指派任务、资源预留、集群成员管理。调度器可发现各节点的模型与资源并选择服务地址，但读取快照不会预留显存或队列位置，也不提供跨节点原子分配保证。

这次提供单节点调度观测基础。集群专用机器凭证、节点心跳注册、排空节点、任务租约、持久队列与重启恢复仍未实现；不能把这些只读接口当成完整集群调度器。

### 取消操作检查

界面停止、跳过与生成超时也改为按任务请求取消。worker 记录真正持有执行锁的任务，释放执行锁前清除该记录；旧任务正在完成清理时不会再中断后来获得 GPU 锁的工作。

UOV、Enhance、Scene 批量任务分别携带自己的取消事件，批量停止只取消持有同一事件的已登记任务；事件已停止后才进入队列的任务也会标记取消。批量停止不再中断节点上任意正在执行的 Agent 任务。这些改动不增加抢占优先级，也不改变用户的生成确认设置。

### 本次验证记录

- 专项与相关回归：`tests/test_agent_api.py`、`tests/test_agent_runtime.py`、`tests/test_canvas_workbench_runner.py`、`tests/test_async_worker_startup_contract.py`、`tests/test_async_worker_resolution_contract.py`、`tests/test_vlm_skill_tool_runtime.py`；最终结果 `121 passed, 7 subtests passed`，用时 33.33 秒。执行使用 `python -m pytest -q --tb=short -p no:cacheprovider`，外层设置 180 秒超时。
- 覆盖 HTTP/OpenAPI 与内部工具一致性、用户与管理员权限、队列分页和来源、未知资源状态、GPU 查询超时及 CSV、缓存时间、排队/执行中的任务取消、界面与批量停止、入队前已取消、异常清理后的计数。
- 生成队列与模型执行仍使用替身或独立 AST 函数测试；这不是浏览器、真实 GPU 生成或集群部署验收。中间一次新取消用例失败，修正了测试替身对 Python 父模块属性的替换后，最终回归通过。
- 独立进程只读采样成功取得本机 NVIDIA GeForce RTX 5090 的 GPU UUID、显存与利用率，以及 CPU、系统内存；没有加载模型或启动 worker。该进程的队列明确返回 `worker_not_initialized` 与未知计数，不代表运行中 Studio 的队列状态。
- 相关 Python 文件的 `py_compile`、已有文件的专项 `git diff --check`、新增 API 文件的空白与冲突标记检查通过。Git 的 LF/CRLF 提示不属于空白错误。
- 仍有 9 条第三方弃用告警，涉及 Triton、SciPy、SWIG、timm。最终专项没有失败；未执行完整仓库回归。
- 未启动或重启 Studio/ComfyD，未进行模型下载、真实生成、浏览器操作、多节点调度、E 盘同步、暂存、提交或推送。现有服务需在用户安排的重启后才能注册新接口。

## 2026-10-05：A 浏览器配对授权

新增 Harness 首次连接流程。身份、口令和二维码仍通过 Studio 原有身份页面验证；Harness 不获得浏览器 Cookie、身份口令或原生身份私钥。新授权入口属于连接层，不注册到 VLM 工具目录。

| 方法 | 路径 | 访问范围 |
| --- | --- | --- |
| GET | `/api/v1/auth/discovery` | 未登录可查询模式、服务标识、授权方式、期限与范围 |
| POST | `/api/v1/auth/device` | 创建配对请求，返回私密 `device_code`、可展示的 `user_code` 与授权页 |
| GET | `/api/v1/auth/authorize?user_code=...` | 浏览器查看当前 DID、角色、存储范围，选择权限 |
| POST | `/api/v1/auth/decision` | 已验证浏览器身份、同源及页面 CSRF 校验后批准或拒绝 |
| POST | `/api/v1/auth/token` | Harness 使用私密设备码查询状态；批准后单次领取 Bearer 凭据 |
| POST | `/api/v1/auth/refresh` | 私密连接层使用 refresh token 串行换取新凭据，不延长授权总期限 |
| GET | `/api/v1/auth/authorizations` | 浏览器查看并撤销自己的已授权 Agent |
| GET | `/api/v1/auth/credentials` | 浏览器读取自己的凭据元数据，不返回令牌 |
| POST | `/api/v1/auth/credentials/{id}/revoke` | 浏览器同源及 CSRF 校验后撤销自己的凭据 |
| POST | `/api/v1/auth/revoke` | Bearer 持有者撤销当前凭据 |

配对与专用凭据仅通过 HTTPS 使用；回环连接允许 HTTP。反向代理需要正确配置受信的 HTTPS 转发与部署前缀。本机原有免登录调用继续保留。未登录游客可查询身份发现信息，不能批准授权或访问媒体 API；已有有效游客会话现在也按 `is_guest(did)` 识别，避免误标为 user。

### 权限与存储绑定

支持 `read`、`assets.write`、`runs.submit`、`runs.cancel`、`node.read`、`models.download`，发现接口返回当前协议的范围名称。`read` 必须包含，其他权限可逐项选择。用户不能批准自己没有的权限；`node.read` 仅供 local 或 admin，`models.download` 还需要身份已有的模型下载权限，且不包含在默认申请范围内。待审批、停用、游客身份不能批准授权。角色由服务器验证，不接受请求正文指定角色、保存目录或实际执行身份。

凭据绑定服务 ID、模式、已确认 DID、角色与存储命名空间。每次使用都会重新检查身份、权限和目录映射；变化时返回 `identity_context_changed` 或 `account_not_allowed`，不转为游客或本机身份继续写入。`expected_did`、`expected_mode` 只用于核对，不能冒充身份。`session.identity.storage` 返回范围和不含实际路径的命名空间摘要。

配对请求有效十分钟，轮询间隔五秒。access token 最长有效一小时，授权默认有效 30 天，可选择 1 到 30 天；私密连接层在授权期限内使用轮换 refresh token 续期。刷新不延长授权总期限，旧 refresh token 重用会撤销整项授权。配对状态包括 `authorization_pending`、批准、拒绝、到期、已领取。设备码只能领取一次凭据；领取响应丢失后需重新配对。授权数据保存在节点私有 SQLite 中，只存设备码、CSRF、access token 和 refresh token 的哈希；数据库目录加入 Gradio `blocked_paths`。授权页和凭据响应禁止缓存，授权页禁止嵌入，身份修改需要同源请求。

### Harness 调用顺序

1. 使用实际 Studio 服务地址查询 `auth/discovery`，保留部署前缀，记录 `service_id` 和 `access_mode`。
2. local 可直接查询 `session`；需要专用受限凭据时也可使用配对流程。
3. 发送 `auth/device`，包含 `client_name`、`expected_mode`、可选 `expected_did` 和权限范围。只向用户展示 `verification_url` 与 `user_code`。
4. 用户在 Studio 页面验证身份，再访问授权页。页面提供当前 DID、角色、存储范围和逐项权限，用户批准或拒绝。
5. Harness 按返回的间隔查询 `auth/token`，设置总等待期限。仅私密连接层保留 `device_code` 及领取后的完整 access/refresh 凭据和到期时间，不写入模型提示词或普通日志。
6. 所有媒体 API 请求使用 `Authorization: Bearer <access_token>`。查询 `session`，核对实际身份与存储命名空间后再上传素材和提交任务。
7. access token 到期前由私密连接层串行调用 `refresh_url` 并原子保存新凭据。授权到期、撤销、身份环境变化或 refresh 重用时停止写入，重新请求授权，不自动改用浏览器 Cookie、guest 或 local。

这是 Studio 专用浏览器配对与续期协议，不声明为完整 OAuth 2.0 授权服务器。已实现轮换 refresh token；B 类长期机器 API Key 与集群统一身份发行方尚未实现。授权不改变聊天面板的自动生成偏好，也不增加读取或修改浏览器画布的能力。

### 私密连接层示例

以下函数供 Harness 的私密连接层使用，返回带凭据的 HTTP Session、已核对身份及完整私密凭据响应。调用方应在自己的私密凭据管理器中保存响应，以便续期；不要把函数内部变量、请求正文、Session 或凭据响应交给模型或普通日志。`base` 是实际 Studio 地址，可带部署前缀。`expected_did` 来自用户指定的公开 DID，仅用于核对。此例在 local 下也使用配对流程，以获得受限权限。

```python
import time
from urllib.parse import urljoin

import requests


def connect_agent(base, expected_did="", scopes=None):
    http = requests.Session()

    def call(method, url, **kwargs):
        response = http.request(method, urljoin(base.rstrip("/") + "/", url),
                                timeout=15, **kwargs)
        result = response.json()
        if not result.get("ok"):
            raise RuntimeError(result.get("error", {}).get("code", "connection_failed"))
        return result["data"]

    auth = call("GET", "api/v1/auth/discovery")
    device = call("POST", auth["device_url"], json={
        "client_name": "My Harness",
        "expected_did": expected_did,
        "expected_mode": auth["access_mode"],
        "scopes": scopes or ["read", "assets.write", "runs.submit", "runs.cancel"],
    })
    # 只展示授权链接和人类配对码，不打印 device_code。
    print(urljoin(base, device["verification_url"]), device["user_code"])
    deadline = time.monotonic() + device["expires_in"]
    while time.monotonic() < deadline:
        time.sleep(device["interval"])
        result = call("POST", auth["token_url"], json={"device_code": device["device_code"]})
        if result["state"] == "authorized":
            http.headers["Authorization"] = "Bearer " + result["access_token"]
            identity = call("GET", auth["session_url"])["identity"]
            if (identity["service_id"] != auth["service_id"]
                    or identity["access_mode"] != auth["access_mode"]
                    or (expected_did and identity["did"] != expected_did)):
                raise RuntimeError("identity_mismatch")
            return http, identity, result
    raise TimeoutError("authorization_timeout")
```

例子只展示首次配对，在拒绝、到期、限速或身份变化时停止。生产 Harness 可按照错误响应及轮询间隔实现有期限的重试，并由私密凭据管理器按下一节协议续期；不要自动重试已经使用过的 refresh token。浏览器退出登录不自动撤销已授予的专用凭据；可在授权管理页或通过持有者撤销接口主动撤销。

### A 开发验证记录

- 最终专项及相关回归：`182 passed, 7 subtests passed`，用时 41.15 秒。覆盖配对待确认、轮询限速、批准/拒绝、设备码单次领取与并发、存储中无明文密钥、重启后的凭据读取、到期、撤销、模式/DID/角色/目录变更、权限减少及拒绝游客授权。
- 实际 HTTP 素材上传、下载与跨用户访问验证通过。生成提交测试确认采用已批准的 DID 与存储绑定；模型执行仍使用替身，没有进行真实 GPU 生成。
- 验证原生 `is_pending()` 状态，即使用户访问记录为空，也不能授予权限。模式查询失败不会被授权模块解释为 local。之前复现的有效游客会话误标 user 已由身份专项覆盖并通过。
- 使用安装的 Gradio 6 文件路由，在允许父目录的情况下验证授权数据库目录仍返回 403。未读取真实身份数据库，也未创建正式授权数据库。
- Chrome/Playwright 检查六组页面：中文 1280/390、英文 1280/320、手机配对码输入页及授权管理页。Logo 加载、脚本、权限取消勾选、批准请求和撤销交互通过，无横向溢出或浏览器错误；已查看桌面与手机截图。页面 HTTP 与身份在浏览器检查中使用测试响应，不能视为真实 Studio 登录验收。
- 报告与截图位于 `outputs/agent_auth_A_20261005`；浏览器检查入口为 `tests/agent_auth_browser_smoke.cjs`，使用现有 Chrome 和 bundled Playwright，没有安装或下载新依赖。
- Python 编译、专项差异检查、授权文件空白与冲突标记检查通过。中间的一个旧测试身份替身和浏览器检查脚本导入路径失败已经修正，最终没有专项失败；仍有 9 条 Triton/SciPy/SWIG/timm 第三方弃用告警。
- 未重启 Studio/ComfyD，未执行真实身份登录、反向代理 HTTPS 部署、多节点授权、GPU 生成、完整仓库回归或 E 盘同步；未暂存、提交、推送。新路由及授权目录阻止规则需在用户安排的 Studio 重启后生效。

## 2026-10-05：授权续期与内置 Harness

配对有效十分钟，access token 最长有效一小时；浏览器批准的授权默认持续 **30 天**，不会因刷新无限延长。`POST /api/v1/auth/device` 可通过 `authorization_days` 请求 1 到 30 天，审批页面提供 1/7/30 天及请求的更短期限；用户只能缩短请求期限。审批正文也支持 `authorization_days`，未传时采用申请的期限。

### 续期协议

- `GET /api/v1/auth/discovery` 新增带部署前缀的 `refresh_url`、默认 `authorization_days` 与 `refresh_rotation: true`。
- 配对领取凭据时返回 `access_token`、`expires_in`、`refresh_token`、`refresh_expires_in`、`authorization_expires_at` 和稳定的 `credential_id`。
- 私密连接层在 access token 到期前调用 `POST /api/v1/auth/refresh`，正文为 `{"refresh_token":"<private secret>"}`，不需要浏览器 Cookie 或仍有效的 access token。响应返回新的 access token 和 refresh token；原 access token 和 refresh token 均失效。
- 刷新必须串行进行。保存新的整组凭据后才能发起后续业务请求；多个工作进程应共享私密凭据管理器及续期互斥。响应丢失、存储失败或旧 refresh token 重用时重新配对，不自动重试已使用的 refresh token。
- 旧 refresh token 重用返回 `refresh_token_reused`，同时撤销整项授权，包括刚换取的 access token 和 refresh token。无效、过期或已撤销的 refresh token 返回 `invalid_refresh_token`。
- 每次刷新重新验证服务、模式、DID、角色、存储绑定及账号状态；权限减少后不通过刷新恢复。身份或目录变化仍要求重新配对。授权末尾的 access token 期限不会超出剩余授权时间。
- 浏览器授权管理页显示整项授权的到期时间；撤销同时阻止 access 与 refresh。原有仅一小时的数据库记录按原到期时间迁移，不自动变成 30 天授权。
- 数据库仅保存 refresh token 的哈希；授权目录仍由 Gradio 文件路由阻止访问。凭据不会进入工具目录、模型输入或普通响应日志。保留 HTTPS/真实回环 HTTP 限制及禁止缓存响应。

前面的 `connect_agent` 示例只展示首次配对。长期连接需要保留批准响应中的完整私密凭据，再由 Harness 自身的连接层按上述协议自动续期；Studio 没有为任意第三方 Harness 安装客户端扩展，也没有实现长期机器 API Key 或集群统一身份发行方。

### 内置工具循环

内置聊天、创作和向导模式在 HTTP 层获得服务器身份后，进入 `modules/vlm_harness.py` 的执行循环：

1. 将现有聊天历史、当前素材、用户生成偏好和可用只读工具提供给当前模型。
2. 模型可返回 `{"tool_calls":[{"id":"call-1","name":"simpai.presets.list","arguments":{"query":"Qwen"}}]}`。控制消息必须是完整 JSON，同一个对象中不混合最终回复或界面动作。
3. 服务器执行已注册工具，将结果或结构化错误传回模型。模型可更正参数、继续查询或按原来的聊天协议给出最终回复。
4. 用户要求分次回复，或需要先给出进展再继续工作时，模型可返回 `{"assistant_message":{"text":"本次要显示的内容","continue":true}}`。服务器立即显示这一条，并带上已发送内容再次调用模型。连续回复开始后，最后一条使用 `continue=false` 或已有的 `reply/actions` 结构化最终格式；中途返回普通文本不会直接结束任务，会要求模型更正控制格式。普通单次对话仍可一次回答后结束，不增加额外的决策调用。
5. 最终回复继续经过原有动作解析与生成确认流程。工具循环自身不执行上传、提交或取消，也不修改自动生成设置；自动生成选项仍控制既有创作动作。

是否继续由模型根据任务和工具结果决定，Harness 负责执行工具并发起后续模型调用，不需要用户为每一步重新发送消息。界面的“思考”选项控制单次推理设置，与工具循环独立。当前工具范围是 Studio 已注册的能力，没有通用网页搜索或任意代码执行；会话图片复核提供建议，不自动反复生成。

工具目录根据身份及授权范围过滤。普通用户能查询自己的队列和任务；local/admin 才能获取节点 GPU、内存与全节点资源。HTTP 层覆盖客户端提交的身份、访问范围和 resolver；Bearer 连接的私有 skill 路径也采用实际授权 DID。每次模型轮次和工具调用前重新读取身份，身份或存储绑定变化时停止。

目录采用简短摘要，较大参数 schema 通过新增只读工具 `vlm.tool_schema` 按需读取。上下文会为工具结果预留空间；目录改为名称列表时仍保留 `vlm.tool_schema` 自身的参数定义。工具结果作为不可信数据，不能授予身份、路径或代码执行权限；大结果会标注截断并要求缩小查询，不因截断而变成查询失败。控制消息的字段或 JSON 格式错误会停止执行，不把原始请求 JSON 当作用户回复。已开始连续回复后，模型遗漏控制格式而返回普通文本时，最多更正两次；待更正的文本不显示、不记作已发送回复，重试仍受总调用次数与时间限制。失败时保留此前回复并返回 `continuation_protocol_failed`，不报告完成。

Responses API 的多个 assistant 输出消息保留原有边界，推理内容不作为公开回复。前置说明与随后独立的工具请求可以依次处理；一旦遇到继续回复或工具控制消息，就等待新的模型调用处理后续步骤。同次响应中提前生成的后续控制消息或结论不会充当新的模型调用，也不会替代实际工具结果。此行为仍采用 Studio 的 JSON 控制协议，不代表已经提供供应商原生 function-calling 适配。

默认上限为 **8 次模型调用、16 次工具请求、每批 4 个、180 秒**。取消及时间限制在轮次、调用和模型流事件处检查；GPU 等待和远程 HTTP 请求采用剩余时间。不能协作取消的本地非流式推理仍需等待当前推理返回，不声明所有后端都能立即强制停止。只读工具超时可能已开始执行，但不会导致后台生成、上传或取消。

同一工具调用 ID 的同参重试复用结果；不同参数重用 ID 会停止。没有调用 ID 时由服务器生成轮次内 ID，新的只读查询可取得新状态。执行过程通过 SSE 发送模型轮次、查询状态及独立的 `assistant_message` 事件，工具请求正文不作为聊天文本显示。已完成的中间回复也出现在最终响应的 `harness.messages` 中；前端按请求 ID 和消息 ID 去重。最终回复继续使用原有 `text` 与动作字段。工具循环内部交换不写入模型的持久聊天历史，下一条用户消息使用界面保存的公开回复历史。

沿用 `ChatStreamRegistry` 的同请求缓存及 owner/stage/token/cursor 校验。断线恢复读取同一次后台执行，不重新调用工具；事件队列压缩后的快照保留已发送的独立回复。停止、超时或后续调用失败时保留已收到的消息。凭据过期后可以续期，以同 DID 恢复已有流；浏览器刷新、后台重启、缓存过期或驱逐后仍无法恢复进行中的请求，已保存的公开消息可以重新显示。原始模型模式、提示词模式、角色扮演和专用图像选择/摘要/草稿请求不进入这一循环。

### 授权与执行状态的后续检查

已经开始的 Bearer 聊天由服务器保存经验证的授权 ID；后续工具轮次重新读取这项授权，而不重复使用请求中的旧 Bearer 字符串。这样，连接层轮换凭据不会打断同一项已开始的聊天。新 HTTP 请求仍需新 Bearer；撤销、到期、身份/目录变化或权限范围变化会阻止后续轮次。权限变化返回 `authorization_context_changed`，需要按当前权限重新发起请求，不复用此前缓存的高权限工具结果。

### 续期与 Harness 开发验证记录

- 扩展 Python 回归：`471 passed, 7 subtests passed, 1 deselected`，用时 53.94 秒；覆盖授权、API、队列/资源、内置工具循环、SSE、skill 隔离、聊天协议、Canvas 身份/任务及 worker 启动合同。
- 最后增加权限变化中断后复查：`134 passed, 1 deselected`，用时 8.11 秒。覆盖一小时 access 到期后的续期、期限缩短/总期限、旧 refresh 重用与并发撤销、原数据库迁移、明文密钥排除、同 DID 活跃聊天续期及撤销、工具结果回传、错误修正、格式拒绝、轮次/时间/取消限制、模型上下文预算与恢复不重复执行。
- 上述两次历史检查均排除了当时失败的 `test_api_fallback_to_local_waits_for_gpu`：自动角色路由采用界面模型，而旧用例期望先调用 Custom API。该用例已在后续“单节点任务保留修正与 GPU 验收”阶段明确配置路由，并包含在 216 项通过的回归中；这里保留原检查的排除记录，不代表当前仍有该失败。
- worker 的旧测试按固定缩进字符串检查锁内调用，已改为 AST 检查 `handler` 是否仍位于 `exclusive_task_lock` 中；实际 worker 行为未因该测试更新而修改。身份注入与 stateless system prompt 的旧合同检查已跟随新的可信身份 helper 和 Harness 请求更新，修正后相关测试通过。
- Node：`41 passed`，包含中英文 Harness 状态、请求排队、上下文用量、API 错误与断线恢复。可见状态使用 `state.__lang`；工具请求正文不作为聊天回复展示。
- 六组 Chrome/Playwright 页面检查通过：中文桌面/手机、英文桌面/手机、手机配对码输入及管理页。检查期限选为 7 天后提交正文、权限勾选、批准、撤销、Logo 加载及页面溢出；已查看中文手机和英文桌面截图。截图及报告位于 `outputs/agent_harness_refresh_20261005`，身份与 HTTP 回复使用测试响应，不等同真实用户登录验收。
- Python 编译、JavaScript 语法与专项差异检查通过。扩展 Python 回归仍有 9 条 Triton/SciPy/SWIG/timm 第三方弃用告警。
- 没有启动或重启 Studio/ComfyD，没有调用真实模型、执行 GPU 生成、测试真实 HTTPS 反向代理/多节点或同步 E 盘。内置 Harness 目前只自动执行只读工具，写操作继续采用原有界面确认与自动生成流程；未实现原生供应商 tool-calling 适配、后台持久化恢复或全功能集群调度器。
- 暂存区仍为空；所有此前与本次修改均保留在工作区，没有暂存、提交或推送。

## 2026-10-06：单节点任务保留修正与 GPU 验收

`_cleanup_runs` 现在只清理超过保留期限的终态记录。准备、排队、运行、停止中和跳过中的任务不因超过六小时未轮询而丢失查询、控制与同请求重试记录。终态保留时长和现有目录规则不变；服务重启后的持久化恢复仍是独立的后续工作。

新增专项覆盖过期的活动任务保留、各终态清理与时间边界、旧活动 Agent 请求重试不会创建第二个任务，以及同 ID 异参冲突。已有 `test_api_fallback_to_local_waits_for_gpu` 明确设置 API 路由及本地回退，避免把默认跟随界面模型的自动路由当作 API 优先路由。

单节点 GPU 验收使用真实 Studio/ComfyD、现有模型和独立验收用户目录。`tools/agent_api_acceptance_host.cjs` 提供有时限的 Windows 验收启动与关闭，Python 主进程限制为回环网络并阻止 pip 修改，禁用预置下载及可选依赖更新。验收结果在实际执行完成后追加。

首次真实 GPU 执行生成了图片，但 Agent API 把 worker 登记的 `file:<hash>` 素材过滤掉，导致 `state=finished` 同时返回空素材列表与 `asset_registration_failed`。已将读取结果、下载、后续输入与蒙版的素材 ID 校验对齐到现有 Canvas 的 `asset:<hash>` / `file:<hash>` 两种格式，继续采用当前身份的素材目录与文件哈希解析，不接受客户端文件路径。新增专项直接调用实际文件登记函数，验证输出下载、再次提交、蒙版复用与跨用户拒绝。首次失败报告保留为 `outputs/agent_api_gpu_20261006/first-attempt-failure.json`，不计入通过结果。

### 2026-10-06 单节点验收结果

- 最终专项回归为 `216 passed, 7 subtests passed`，用时 37.56 秒，无排除用例。包含任务保留、Agent API、授权、队列/资源、Canvas runner、GPU 等待、模型路由和 Harness；此前失败的 API 回退本地 GPU 用例已使用正确路由配置并通过。仍有 9 条第三方弃用告警，未执行完整仓库测试。
- 在本机 RTX 5090 上通过实际 Studio `/api/v1` 执行 `Z-imageT` 文生图（512x512、8 步）和 `Qwen2.1-Edit` 图像编辑（512x512、12 步）。前者输出红色杯子，后者按原图改为深蓝色；已查看两张图片，杯形、把手、视角与背景保持一致。输出参数记录的编辑指令、预置、模型和分辨率与提交一致。
- 生成主流程复测用时 42.33 秒：同 ID 同参重试返回原任务，同 ID 异参返回 409；第二个排队任务取消后，第一个任务仍完成；运行中任务在进度 0.41 时取消并进入 `canceled`，ComfyD 日志记录 `Processing interrupted`，后续编辑正常完成。
- 通过真实本地配对页面及审批 HTTP 路由获得受限 Bearer，生成期间轮换 access/refresh 后仍使用同 DID 与存储范围；旧 Bearer 返回 401。只读授权提交生成返回 403。测试结束已撤销本次创建的授权，没有把明文凭据写入验收报告。
- 实际生成结果通过受保护的内容接口下载，重新上传得到可用素材 ID，编辑输出又通过下一次编辑的预览校验。结果保存到独立验收用户目录；客户端取得的元数据不包含服务端文件路径。
- 内置 Harness 使用运行时目录中已安装的 `Qwen3.5-9B-abliterated-Q6_K`，实际完成三轮模型调用：`simpai.session.get`、`simpai.queue.get`、中文最终回复。llama.cpp 日志确认 32/32 层在 GPU，CPU 层为 0。用时 19.15 秒，主动关闭初始 SSE 连接后恢复同一会话，两个工具均只执行一次，没有生成或修改操作。
- 生成验收脚本为 `tools/agent_api_gpu_acceptance.py`；真实模型及 SSE 恢复脚本为 `tools/agent_harness_gpu_acceptance.py`。两者按实际服务地址与发现结果执行并输出 UTF-8 报告。验收宿主保留现有 `path_LLM` 等模型目录配置，没有下载模型或变更已安装依赖。
- 最终报告：`outputs/agent_api_gpu_20261006/acceptance-report.json`、`harness-gpu-report.json`；图片为 `text-to-image.jpg` 和 `image-edit.png`，启动/推理日志为同目录 `studio.stdout.log` 与 `studio.stderr.log`。首次失败报告单独保留，最终两份验收报告均为通过。
- 关闭临时服务前确认队列为零、GPU 任务锁空闲；关闭后确认 8186/8187 无监听。未保留测试服务或模型进程。Python/Node 语法与专项差异检查通过，未暂存、提交或推送。
- 验收范围为 local 单节点图片生成、图像编辑及本地 Harness。多用户真实登录与跨账号实际目录隔离、视频/音频生成、远程 API 提供商、真实浏览器聊天交互、服务重启后的任务恢复尚未验收；集群继续后置。启动日志中原有不存在的 G 盘模型路径告警仍存在，不影响本次所选模型。

## 2026-10-06：Agent 触发缺失模型下载

新增写工具 `simpai.models.download` 和 `POST /api/v1/presets/{preset_id}/models/download`，复用 Canvas 的缺失模型检查、下载队列及模型目录配置。此接口仅处理当前身份可见预置所需的缺失文件，不接受客户端提供的 URL、保存路径、用户身份或自定义模型清单。它不下载已经齐全的模型，不启动模型推理，也不自动提交生成。

### 权限与存储

- 使用已有的 `user_can_download_models` 权限检查，与管理界面的“模型下载”设置一致；不新建另一套管理员下载开关。`session.permissions.can_download_models` 表示当前连接是否具有下载权限。
- Bearer 连接另外需要浏览器明确批准 `models.download` scope。发现接口发布该 scope，授权页提供中英文下载选项；没有模型下载权限的用户无法勾选或批准它。默认申请范围保持不变，现有凭据和 refresh 不会自动获得下载权限。
- 模型下载权限独立于生成权限、节点资源读取权限和界面的自动生成偏好。权限在请求时重新检查，共享下载服务在入队前再次检查；后续撤销权限会阻止新的下载请求，但不会撤销已经启动的共享下载。
- 模型写入服务器配置的节点共享模型目录，返回 `download_scope="node_shared"`；用户素材及生成结果仍使用原身份目录。接口不公开实际模型目录、下载源凭据或底层异常路径。
- 多用户 guest 仍只能使用公开发现和授权入口。内置 Harness 继续只自动执行只读工具，不能因为发现了缺失模型或开启自动生成就调用下载写工具。内置创作任务卡已提供“确认下载并继续”，由用户点击授权后执行下载与原任务生成；拒绝下载后检查无需下载的兼容方案，具体交互见后文。

### 调用与等待

1. 调用 `simpai.models.status` 或读取路由预览的 `models`，核对缺失文件、大小、`can_download`、主题及 `download_scope`。`can_download=false` 时检查当前用户权限与已批准 scope，不自动更换身份。
2. 在用户明确授权下载的范围内，向返回的 `download_url` 提交 `theme`，并携带所批准状态的 `identity_binding` 与 `model_fingerprint`，对应请求字段为 `expected_identity_binding` 和 `expected_model_fingerprint`。条件不符返回 409，需要重新检查并确认。内部工具还需提供 `preset_id`。协议兼容未提供摘要的调用，内置确认流程始终提供；本接口不要求生成任务的 `request_id`。
3. HTTP 202 仅表示请求被接受。`queued_count` 是本次交给共享下载器的文件数，包含已在下载的同名任务，不代表新建任务数；模型已经齐全时为 0。相同缺失文件的重复调用复用当前活动下载，失败后的新调用可以重新尝试。没有任何文件被接受且模型仍缺失时返回 `model_download_not_started`，不会报告下载完成。
4. 轮询返回的 `status_url`，保留服务前缀和主题。`missing_models[].download_status` 提供 `state`、`downloaded_bytes`、`total_bytes` 和百分比 `percent`。状态包括 `not_started`、`queued`、`downloading`、`verifying`、`failed`、`canceled`；未知总大小和百分比为 `null`。失败使用结构化错误，不透传可能含私密 URL 或本地路径的异常文本。
5. 只有模型状态的 `ready=true` 才表示文件检查通过。下载完成后重新执行路由预览，确认素材、参数及 `ready_to_submit` 后，按生成授权单独提交任务。为轮询设置等待期限，不把下载时间计作 GPU 生成时间。

当前没有新增全局下载列表、共享模型删除或共享下载取消权限。状态查询仅返回当前可见预置需要的文件；下载任务恢复及错误处理继续沿用现有下载器，本功能不承诺服务重启后的 Agent 任务恢复。

### 下载接口验证记录

- 最终相关回归：`180 passed`，用时 49.63 秒。覆盖 Agent API、配对/续期授权、只读 Harness、Canvas 模型状态、身份下载权限和现有下载目录规则；七个专项文件完整执行，没有使用 `-k` 或排除用例。Python 编译检查通过。
- 验证 HTTP 与内部工具使用相同预置及可信身份；客户端 URL、路径、身份、任意模型清单被拒绝；不可见预置、未知主题、后端禁用、权限不足、没有任务启动均返回结构化错误。模型状态和路由预览查询不触发下载，服务前缀与主题保留。
- 使用实际 `StudioBackend`、Canvas 下载入口、`download_model_entry` 和共享下载器完成重复请求检查，仅替换后台执行器并使用临时模型目录：连续两次请求只登记一次下载；进度、失败状态及文件齐全后不再下载的行为通过。没有执行下载函数或访问模型源，不等同网络下载验收。
- 授权测试覆盖独立 `models.download` scope、管理员只读授权不能下载、中英文选项、已有下载权限关闭、权限实时减少、续期不恢复已移除范围、旧授权不自动扩大权限。内置 Harness 在自动生成开关两种状态下均拒绝隐式调用下载工具。
- 首次新增测试中有一项因测试身份尚未初始化而在配置导入阶段失败，调整测试初始化后复查通过。扩展检查当时记录 `191 passed, 1 failed`：`test_outfit_swap_preset_and_model_package_use_uploaded_modelscope_main_file` 仍按单一来源检查，模型包已经增加 Hugging Face，而预置尚未同步。该差异已在下文“下载源与当前说明校正”中修复并复查通过。这里保留历史结果；当时最终 180 项不包含该文件，不能据此声明完整仓库测试通过。
- pytest 仍有第三方弃用告警。未启动 Studio/ComfyD、GPU 或真实模型下载，未做浏览器真实账号操作、网络中断/续传及磁盘空间验收；没有新增长期进程，未暂存、提交或推送。

## 2026-10-06：内置创作任务确认下载后继续生成

本节对应“Agent 提醒模型缺失，用户确认下载，最后完成模型调用与输出”的交互要求。内置创作任务沿用原生成卡的素材、提示词、主题、比例、数量和参数，在模型缺失时显示文件清单、大小，以及“确认下载并继续”和“不下载，寻找替代方案”两个操作。不需要用户离开对话手工安装后重新描述任务。

- 自动生成关闭时，已发现模型缺失的创作提议可以只检查下载条件，不提交生成。点击“确认下载并继续”明确批准当前任务的模型下载及后续生成；不会改变会话的自动生成设置。其他写工具仍不向模型开放无确认执行。
- 下载复用 Agent API 和已有模型下载权限，文件列表以服务端当前可见预置为准。若原任务采用的模型配置与预置下载清单不同，不使用另一组默认模型代替。无下载权限时显示管理员安装提示。
- 用户批准后，界面查询下载进度；文件检查返回就绪后，再检查原生成节点的素材绑定、参数和模型状态，沿用已有生成队列提交，持续查询并在原聊天卡中展示最终输出。下载接受、进度达到 100% 或生成入队都不等同任务完成。
- 原有自动选图保持不变：下载等待不重新调用图片选择，不改用另一张历史图片。生成完成的结果仍登记在原任务，后续对话可由已有选图流程再次引用。
- 确认绑定原任务、身份/存储摘要和所需模型清单；模型状态增加 `identity_binding`、`user_id`、`model_fingerprint` 和稳定的 `preset_fingerprint`。下载接口接受可选的 `expected_identity_binding`、`expected_model_fingerprint`，不匹配返回 409；Canvas 生成接口对下载续传提交携带的身份摘要再次检查。
- 更换提示词、素材、参数、身份或预置模型配置、撤销权限、删除任务、下载失败和取消等待都会停止自动继续。重复确认不会重复提交下载或生成。停止当前任务不取消已启动的节点共享下载，界面会明确说明。
- 下载确认有效期为 10 分钟，界面等待下载最长 30 分钟，每个 Agent API 请求最多等待 20 秒。超时保留原任务供重新检查。浏览器刷新不会自动恢复下载确认或提交生成；继续操作需要重新检查并确认，避免旧会话恢复后意外执行。
- 本次按用户澄清聚焦上述创作流程；Comfy 工作流上传、转换为预置/接口工作流及任意工作流执行尚未开发，也未扩大到服务器文件编辑或系统命令。

### 内置确认流程验证记录

- Python 相关回归 `212 passed`，56.66 秒，另有 8 条第三方弃用告警；覆盖 API、授权、Harness、创作素材、自动选图与生成身份绑定。创作前端合同与缺失预置保留专项另为 `5 passed`；最后对路由预览与下载接口摘要一致性追加断言并复查通过。
- Node `67 passed`：确认前零下载/零生成、拒绝下载、重复点击、原图/提示词/数量保留、下载就绪后单次提交、输出在下一轮可选、模型再次检查、任务/身份/模型配置变化、权限减少、失败与取消、部署前缀、跨源请求拒绝及自动生成关闭时的只读检查均通过。下载网络和模型推理使用测试响应，不代表真实下载或 GPU 验收。
- Playwright 四组组件检查通过：中文/英文、1280x900 桌面与 360x800 手机；确认及拒绝点击正确，图标字体加载、长文件名换行、按钮和页面无横向溢出。已查看中文手机和英文桌面截图。脚本为 `tests/vlm_model_download_playwright.mjs`，报告与截图在 `outputs/vlm_agent_download_confirmation_20261006`。此处为真实浏览器中的组件和事件检查，不等同完整 Studio 浏览器交互验收。
- JavaScript 语法、Python 编译和已跟踪改动的差异检查通过。一次 Node 结果摘要打印遇到 Windows GBK 编码错误，改用 UTF-8 后重新验证为 67 项通过，没有将打印失败计作功能成功。
- 此阶段未启动 Studio/ComfyD、未实际下载模型或调用 GPU、未执行完整仓库测试。下载源专项在这一阶段未重复执行，后续修复结果见“下载源与当前说明校正”。没有保留测试服务或浏览器进程，未暂存、提交或推送。

## 2026-10-06：拒绝下载后继续检查替代方案

内置创作任务的下载拒绝不再等同取消整个任务。用户选择“不下载，寻找替代方案”后，保留当前任务、素材和参数，检查当前已加载预置目录中的兼容预置及主题；不会触发模型下载、上传素材或提交生成。停止按钮仍结束当前操作，不继续查找。

- 候选排序复用现有预置选择逻辑，不增加另一份固定模型清单。候选需要匹配原任务类型、媒体数量和输入要求；图像编辑不能降级为纯文生图，已有图片不能被丢弃或换成其他历史图片，需要额外蒙版或交互的路线不会直接执行。
- 逐项调用只读 `routes/preview`，使用逻辑素材引用验证任务、参数、绑定与服务端模型状态，不重新上传图片。候选还必须通过实际生成节点的模型检查，包括当前参数预设带来的模型要求。不能将预览通过当作 GPU 生成成功。
- 同一处理方式继续保留参数；跨处理方式不擅自套用语义不同的预置专用参数，也不截短用户要求的视频时长来制造可用方案。无法保持这些条件的候选会被排除。
- 找到模型就绪且兼容的方案后，更新原任务卡并在聊天中说明所选预置，等待用户确认生成。即使会话通常自动生成，本次替代选择仍需确认；不会修改全局自动生成或默认预置设置。后续目录刷新不能把当前替代方案改回此前拒绝下载的默认预置。
- 拒绝下载作为任务级状态保存，刷新或重新检查后也不会再次要求该任务下载模型。用户确认替代生成后仍使用原素材及数量等条件，提交时继续校验原身份摘要。模型在确认前再次不可用时重新检查替代方案，不自动下载。
- 当前兼容候选均已检查且无可用方案时，在聊天中明确返回“当前无法执行”，并说明是在不下载模型、保留当前素材和参数的条件下无法完成；没有提交生成。查询失败、身份变化、超时或检查上限不能被解释为“全部不可用”。
- 每次检查最多验证 64 个预置/主题组合，总等待上限 90 秒。达到上限但仍有候选未检查时返回“检查尚未完成”；普通查询失败可以继续尝试后面的候选，认证或身份变化则停止。原任务被删除、修改、取消或替换后，旧回复不会应用新方案。重复点击不会重复开始检查。

### 替代方案验证记录

- Node `117 passed`，覆盖拒绝后找到替代、候选全部不可用、查询失败但后续候选可用、检查超时/上限、重复点击、停止与迟到回复、身份变化、两图绑定、参数保护、确认后提交、状态保存及默认预置不覆盖替代选择。模型检查请求新增可取消信号，已有 Canvas API 和模型状态控制器检查通过。
- Python `116 passed`，48.80 秒；覆盖 Agent API、Harness 与 Canvas 模型状态合同，另有创作前端与指定预置保留专项 `5 passed`。新增实际 HTTP 预览检查证明：逻辑图片引用可验证替代路线，同时仍返回需要上传的提示，不产生上传或生成任务。pytest 有 8 条第三方弃用告警。
- 中英文桌面/手机四组 Playwright 组件检查通过，确认与拒绝按钮分别绑定下载继续与查找替代操作，长文件名及按钮无溢出。报告与截图继续位于 `outputs/vlm_agent_download_confirmation_20261006`；浏览器事件处理使用替身，不等同完整 Studio/GPU 验收。
- 此阶段未实际下载模型、调用 GPU、启动或重启 Studio/ComfyD，也未执行完整仓库回归。下载源专项在这一阶段未重复执行，后续修复结果见“下载源与当前说明校正”。未暂存、提交或推送。

## 2026-10-06：下载源与当前说明校正

保留模型包中新增的 Hugging Face 来源，将 QwenOutfitSwap 预置同步为 ModelScope 优先、Hugging Face 第二来源；Hugging Face 地址使用文件下载路径 `resolve/main`，不再使用预览路径 `blob/main`。文件名、声明大小、共享 Qwen 模型包 ID、换装行为和服装参考图尺寸设置保持现有配置。

下载源测试改为与其他 Qwen LoRA 共用双源检查，分别验证预置和模型包一致、两种来源的选择，以及 Studio 的尝试顺序。另保留默认 LoRA 与共享模型包身份检查。修复前同一专项结果为 `12 passed, 1 failed`；修复后该专项 17 项全部通过，包含在 Agent API、授权及 Harness 共四个文件的 `177 passed` 中，用时 69.39 秒，无排除用例，另有 8 条第三方弃用告警。报告位于 `outputs/agent_api_docs_sources_20261006`。

根目录指引与本文的发现顺序已统一为授权发现、身份核对、能力与工具查询。前文同步更新了 refresh token、内置工具循环、下载确认及替代方案的当前状态；旧测试记录明确标为历史范围。生成示例保留服务的部署前缀，配对示例返回完整私密凭据以供续期，避免只保存 access token。

文档检查通过：30 条表格接口均与当前路由定义对应，6 个本地文件链接有效；两个 Python 示例分别在根路径和带部署前缀的模拟 HTTP 环境执行，共 4 组通过，配对响应保留 refresh token。示例检查不连接真实服务或写入输入、输出文件。结果记录在上述目录的 `validation.json`。

网络检查只发送 HEAD：ModelScope 返回 200；本机直连 Hugging Face 超时，未验证其文件可达性。没有下载模型、启动或重启 Studio/ComfyD、执行 GPU 生成或完整浏览器验收，也没有暂存、提交或推送。上述专项通过不等同网络下载验收。

## 2026-10-06：复用恢复、会话图片复核与 stdio MCP

模型清单结构保持现状。新增功能复用当前会话、生成队列和 API，不引入另一套预置导航或任务提交协议。

### 状态恢复

- 聊天与图片复核继续使用现有 `ChatStreamRegistry`、请求身份及 SSE 游标。临时断连恢复同一次后台执行，不重复调用模型或工具。
- 生成任务沿用会话中保存的 `run_id` 和状态查询。修正连续三次网络错误就将生成标为失败的行为：现改为“等待恢复任务状态”，保留原任务与进度，使用有上限的退避重试，并提供“恢复任务状态”按钮。
- 每次状态查询最多等待 20 秒，最多自动重试 12 次，间隔最多 30 秒；认证失败或任务不存在时停止自动重试。按钮及会话重新打开只恢复查询，不提交新生成。并发恢复不会重复发出同一任务的在途查询，身份变化后的迟到结果不应用。
- 这些改动不增加服务重启后的持久任务恢复。SSE 缓存及生成记录仍在内存中；浏览器刷新可重新查询还存在的生成记录，但不自动重用下载确认，也不自动重新调用未完成的复核。

### 会话级图片复核

创作偏好增加“在本会话中复核生成图片”，默认关闭，与自动生成开关独立。开启后，对随后完成的图片任务自动复核一次；新建会话仍默认关闭，恢复已有会话保留其选项。该设置不代表其他会话或外部 Agent 获得自动复核授权。

复核使用当前会话选择的 VLM，结合原用户请求、生成指令、原图和全部输出。批量输出合并到一次视觉推理；同一会话已提交的生成任务结束后再处理待复核结果，减少本地模型与生成模型交替加载。界面明确提示本地视觉模型可能需要重新加载，沿用现有“聊天后卸载”偏好。

复核使用独立、非持久的模型上下文，返回“符合要求”“建议调整”或“暂无法判断”及文字说明，不修改正常聊天历史，不执行工具，也不自动再次生成。关闭选项或停止会话会取消等待及当前复核；不能即时中断的本地推理仍需等待当前调用返回，迟到结果不会应用。浏览器刷新将未完成的复核标为中断，不自动重复调用。

当前只支持图片，输入与结果合计最多 9 张。超出范围或包含视频/音频时明确跳过，不丢弃部分素材后假装完整复核；图片未能全部送入运行时时也拒绝执行。模型不支持图片或返回无效结构时提示不可用，不报告“通过”。这不是确定性的图像质量保证。

### MCP 与验证记录

独立 stdio 适配器、私密配对、续期和媒体资源的配置见 [MCP 文档](agent-mcp.md)。工具定义从现有 API 动态读取；MCP SDK 安装到独立环境，不修改 Studio 的依赖版本。

- Python 专项与相关回归：`262 passed`，15.39 秒，8 条第三方弃用告警，无排除用例；包含复核、私密连接、SSE 恢复、Harness、创作素材与聊天协议。
- 最后完善连接返回地址与参数错误处理后，MCP 连接层单独复查为 `13 passed`，0.34 秒；拒绝 URL 内嵌身份信息，保留业务参数错误的公开详情并隐藏 Bearer，不将授权端点的私密响应传给模型。
- Node：`114 passed`，覆盖默认关闭、会话恢复与新会话隔离、一次复核全部结果、停止、断连恢复、身份变化、在途请求去重、已有下载流程与历史编辑保护。扩展检查发现旧会话测试环境遗漏 `normalizeConversationContextUsage`，完善测试依赖后全部通过，没有修改该功能的生产行为。
- 实际 MCP SDK 子进程的 stdio 握手、该次验证的 14 个工具及完整 schema、权限标注、调用、受保护媒体资源读取、结构化权限错误与资源模板通过；测试 HTTP 服务使用替身，未提交真实生成或下载。
- Playwright 中英文桌面/手机四组组件检查通过；开关启停与恢复按钮事件正确，无横向溢出。已查看中文手机及英文桌面截图，界面事件的后端调用使用测试响应，不能替代完整 Studio 交互验收。
- 报告和截图位于 `outputs/agent_mcp_review_20261006`。未启动或重启 Studio/ComfyD，没有下载模型、执行真实复核推理或 GPU 生成；未验证远程 HTTPS 多用户 MCP 配对及复核质量。没有暂存、提交或推送。

### 创作偏好开关误收起修正

浏览器复现了展开创作偏好后，点击“无需确认，直接生成”或图片复核开关会保存选项、随后错误收起面板的问题：展开按钮只修改界面状态，会话仍保存旧的收起状态。展开与收起现在同时更新会话并保存，选项重绘也保留面板滚动位置；明确选择预置后的收起行为保持原样。

新增 `tests/vlm_preference_popover_playwright.mjs` 使用实际展开、保存、重绘和指针事件逻辑，覆盖复选框、文字、行内空白、相邻间隙、滚动、键盘、重新展开及真实背景点击。修改前成功复现面板错误收起；修改后中英文桌面/手机四组通过，84 项相关 Node 检查通过。报告位于 `outputs/vlm_preference_popover_20261006`。此前的组件检查替换了保存函数，没有覆盖该状态交互；本次未启动完整 Studio 或执行 GPU 任务。

## 2026-10-06：连续回复与输入区留白

思考按钮和上下文指示器保留在输入框右下角，文字使用输入框全宽，底部预留按钮空间。窄屏保留可用的文字高度；没有把两个控件移到工具栏。

新增 `tests/vlm_continuation_playwright.mjs` 与隔离 HTTP 测试宿主，加载完整聊天前端及实际聊天、Harness、SSE 路由代码。可控模型的 7 组浏览器检查覆盖中文/英文、1280/360/320 像素窗口、四条连续回复、工具查询、压缩快照重连、停止、普通单次回复以及完成后刷新恢复消息。断线测试只有一次初始提交，恢复时没有重新执行模型或工具。

真实模型验收通过现有 GPT-6 / `gpt-6-luna` API 配置执行，凭据仅由测试宿主私下读取。诗句测试记录 **4 次模型请求、4 条独立消息**；工具测试记录 **4 次模型请求、2 条公开消息、2 次成功只读调用**，实际调用为 `vlm.tool_schema` 和 `simpai.queue.get`。队列状态来自隔离宿主，明确报告工作进程未初始化；不是正在运行的 Studio 的队列验收。测试发现并修正了多个 Responses 消息被拼接、工具目录占满结果上下文和截断摘要错误标记失败的问题。最终报告和截图位于 `outputs/vlm_continuation_20261006/real-model`，可控模型报告位于同级 `scripted` 目录。

Python 专项与相关回归 **424 项通过**，有 4 条原有第三方弃用告警；Node 相关检查 **103 项通过**。真实 API 验收使用生产提示词/历史构建及 API 请求工具，独立适配器调用远程模型；未启动完整 Studio 的模型/GPU 生命周期。当前 Studio/ComfyD 未重启，没有 GPU 生成或模型下载。应用这些 Python 改动需要重启 Studio，前端需要刷新页面。

## 2026-10-06：用户参数预设查询与选择

统一 API、内置只读工具循环和 MCP 现在共用用户参数预设能力。保存文件继续使用现有 `generation_params`，模型清单结构不变。这里只提供查询与应用，不通过模型返回值重建保存的 LoRA 组合。

| 操作 | HTTP | 工具 |
| --- | --- | --- |
| 列表 | `GET /api/v1/parameter-profiles` | `simpai.parameter_profiles.list` |
| 详情 | `GET /api/v1/parameter-profiles/detail` | `simpai.parameter_profiles.get` |

列表支持 `preset_id`、`query`、`offset`、`limit`，只列出当前身份拥有且所属 preset 当前可见的项目。详情使用 `preset_id` 和 `name`；名称放在查询参数中，支持中文、空格和斜杠。使用返回的 `detail_url`，保留服务部署前缀。

详情的 `settings` 包含底模、CLIP/VAE/PE 等模型、传统 LoRA 槽、LoRA 堆栈、MODEL/CLIP 权重、启用状态与作用范围，以及生成、尺寸、样式和其他保存参数。它不返回原始元数据、服务端文件路径或无关字段。读取不会下载或加载模型，也不会生成。

### 先查询、让用户选择，再执行

1. 调用列表工具；需要说明或比较组合时再读取详情。用户要求自己选择时，展示实际返回的选项并等待，不按风格相似度自动替用户选择。
2. 对已经明确的任务，可先调用 `routes.preview`，保留原提示词、素材，并传入 `parameter_profile_selection_required=true`。响应为 `plan.status=needs_parameter_profile`、`ready_to_submit=false`，并带 `parameter_profile_options`。此时 `runs.submit` 返回 409，不检查默认组合后抢先生成。
3. 用户选择 A 后，把该条目的 `selection` 合并到原请求。它包含 `preset_id`、`parameter_profile` 和 `expected_parameter_profile_fingerprint`。再次预览，确认素材、模型等条件齐全后，按原有授权规则提交。

例如，等待选择的预览请求可以是：

```json
{
  "preset_id": "Anima",
  "instruction": "画一个放在木桌上的蓝色花瓶",
  "parameter_profile_selection_required": true
}
```

选择后，`parameter_profile` 使用确切名称，版本字段使用列表或详情实际返回的值。`parameter_profile_selection_required` 可以保留为 true；已经提供选择后会正常验证并执行。无论是否显式要求等待选择，参数预设引用都必须指定所属 `preset_id`。

内置创作模式会显示参数预设下拉框，保留同一任务卡的提示词与素材。选择前不自动提交；选择后，关闭自动生成的会话保留“确认生成”，已开启自动生成的会话执行一次。单纯请求查询列表不会创建生成任务。外部 MCP 客户端负责自己的选择界面，通过同一组 API 继续原请求，不附着或修改 Studio 浏览器偏好。

### 应用与版本检查

- 后端按当前认证身份读取完整组合，保留 LoRA 堆栈与启用状态。缺失模型保留原选择并进入模型检查，不静默换成默认底模或停用 LoRA。
- 保存参数作为默认值；请求明确提供的 `parameters`、`negative_prompt` 和 `output` 字段可以覆盖对应项。需要继承保存的数量、种子或尺寸时，省略这些 `output` 字段。保存组合仍受 Agent API 的数量和尺寸上限约束，超限时要求明确覆盖。
- 列表、详情和所选节点均包含内容指纹；保存内容变化返回 `parameter_profile_changed`，删除或不属于当前用户返回不可用。生成执行层再次校验指纹，防止预览和提交之间更换组合。浏览器刷新参数目录也不会替换已经选择的版本；版本变化后重新选择。
- 保存的处理方式与当前 preset 路由不兼容时返回 `parameter_profile_incompatible`，在旧参数适配前检查，不把旧组合自动套到已变更的流程。
- `models.status` 与模型下载接受同样的参数预设引用，返回的 `status_url` 和 `download_parameters` 保留所选名称及版本。下载权限和确认规则不变。

验收记录位于 `outputs/agent_parameter_profiles_20261006`。HTTP 专项使用真实参数预设文件、读取/应用逻辑和 ASGI 路由，覆盖用户隔离、分页、30 项 LoRA 堆栈、选择前禁止提交、显式覆盖、版本变化、处理方式变更及缺失模型；生成后端使用测试响应。最后的 API、参数预设与执行层回归 126 项通过，另有 7 个 subtest 通过；相关 Node 检查 98 项通过。中英文桌面/手机四组完整前端交互通过，实际提交了所选名称与指纹一次，模型和生成接口使用测试响应。独立 MCP SDK stdio 握手发现 16 个工具，新列表/详情调用、原有媒体资源读取与权限错误均通过；HTTP 服务为隔离测试响应。没有进行 GPU 生成、模型下载或重启当前 Studio。

## 2026-10-06：按需阅读使用帮助

内置 Agent 与外部 API/MCP 使用相同的只读帮助工具。遇到使用问题时搜索相关主题，再读取需要的文档；不自动把整本帮助放入模型上下文。capabilities 的 `help_url` 指向搜索入口，`presets.get` 的 `help_url` 直接指向该预置、主题及当前语言的简介。

| 操作 | HTTP | 工具 |
| --- | --- | --- |
| 搜索／目录 | `GET /api/v1/help` | `simpai.help.search` |
| 分段读取 | `GET /api/v1/help/document` | `simpai.help.read` |

搜索支持 `query`、`preset_id`、`theme`、`lang`、`offset`、`limit`。默认返回 5 条，最多 30 条，每条包含 `document_id`、标题、来源、短摘录与 `read_url`。空关键词用于查看目录。指定 `preset_id` 时只包含该用户当前可见的对应预置简介，通用使用主题和工作流章节仍可搜索；`theme` 必须与 preset 一起提供。

现有内容来自：

- `studio_help`：界面的使用指引及预置包简介，按 `lang` 或当前身份的 `__lang` 选择中英文。文字仍在 `javascript/studio_help_content.js` 维护，标记区域为浏览器和 Python 共用的严格 JSON。后端只解析该数据区，不执行 JavaScript，也不需要 Node.js。
- `preset_workflow_guide`：`docs/vlm_skills/simpai_preset_guide.md` 的现有章节，保留原文，`language=original`。章节 ID 来自标题，正文修改不改变 ID。模型按用户语言解释，不把原文语言当成界面设置。
- `preset_html`：当前可见预置已有的专属 HTML 说明。返回可读纯文本，忽略脚本、样式、隐藏内容与 iframe；不访问其中的远程资源，不提供任意文件读取入口。

例如，先搜索蒙版使用问题：

```json
{
  "name": "simpai.help.search",
  "arguments": {"query": "蒙版", "preset_id": "Qwen2.1-Edit", "lang": "cn", "limit": 5}
}
```

随后使用搜索结果的 `document_id` 调用 `simpai.help.read`。读取默认最多返回 2000 个字符，可用 `max_chars` 调整为 256–8000；优先在换行处结束。`has_more=true` 时，直接将 `next_read` 作为下一次工具参数，或访问 `next_url`。它保留文档 ID、语言、位置和内容版本；翻页期间文件变化返回 `help_document_changed`，需要重新开始阅读。完整文字不会因返回长度限制而不可访问。

两个工具沿用 `read` scope 和当前身份；预置专属说明遵守已有的预置可见范围。阅读不会加载或下载模型，也不提交生成。返回的 `reference_only=true` 表示文档是参考内容，不能赋予权限或改变自动生成偏好；输入要求、参数范围、模型就绪状态以当前 `presets.get`、`models.status` 和 `routes.preview` 为准。预置说明还提供 `runtime_spec_url` 便于交叉检查。

验证：API 的搜索、分页、来源、语言、权限、部署前缀及版本变化检查通过；所有已发布预置的中英文简介与浏览器生成内容逐项对比通过。内置聊天、创作和向导模式使用真实工具服务完成“搜索 → 阅读 → 继续回答”的可控模型测试；增加工具后发现的长输入上下文问题已修正，最终 Harness/SSE 检查 77 项通过。相关 Node 检查 46 项通过，中英文桌面／手机四组帮助窗口浏览器检查通过。实际 MCP SDK stdio 发现 18 个工具，并成功搜索和读取现有帮助；HTTP 宿主隔离，未连接真实模型。报告与截图位于 `outputs/agent_help_20261006`。未重启当前 Studio、下载模型或执行 GPU 任务；生效需要重启 Studio 并刷新页面。

## 2026-10-06：短指令连续回复提前结束

实际服务日志 `app_simpleai_20261006131211.log` 中，13:13:18 开始的静夜思请求只调用模型两次；第二次返回 6 个字符后，以成功状态结束。此前验收使用了更长的“第一条后自行继续调用”指令和独立请求适配器，不能代表这条短指令已通过。更换为同一保存的 GPT-6 / `gpt-6-luna` API 配置和生产 `canvas_custom_llm_run` 后，用原句“你分4次回复静夜思的四句诗。一次只能回复其中一句。”复现为三次调用后停在第三句。

当时模型先返回 `continue=true`，随后改回普通文本；Harness 将任何普通文本当作最终回复，因而提前报告完成。现在连续回复开始后要求明确的续答／结束状态：普通文本进入有上限的格式更正，不直接显示，也不结束任务；要求重新提交同一段未发送内容，避免跳过或重复。真正完成时仍使用 `continue=false` 或原有的结构化最终回复。未新增针对诗句或特定数字的规则，生成、下载及取消权限不变。

修正后的原句真实 API 复测三组通过，包含重复提交及先有一条普通聊天历史的会话；每组均为 4 次模型调用、4 条独立回复。后两组使用与现场相同的 8192 输出 token 上限，第一组为 3072；采样参数来自生产请求构建流程。真实模型的“进展回复 → 查询工具 schema → 查询队列 → 最终回复”也通过，为 4 次模型调用、2 次成功工具调用、2 条公开消息。队列来自隔离宿主并如实返回未初始化，不是当前生产队列的验收。

专项与相关 Python 回归 261 项通过，Node 状态／重连检查 19 项通过，可控模型的 7 组浏览器检查通过，覆盖中英文、桌面／手机、停止、断连恢复及普通单次回答。确定性测试另外重放了“第一句带续答标记、第二句突然变成普通文本”的情况，验证更正、不重复、停止和重试上限。记录分别位于 `outputs/vlm_continuation_20261006/short-before`、`short-after`、`short-after-repeat`、`short-after-history`、`tools-after` 和 `scripted-after`。这些浏览器使用隔离测试页面及生产聊天／SSE／模型 HTTP 调用代码；当前 Studio/ComfyD 未重启，应用修正仍需重启 Studio 并刷新页面。

## 2026-10-06：A 专用身份登录与原配对继续

采用 A 范围：只调整 Agent 的浏览器登录流程，完整 Studio 根入口和局域网／回环监听不变。原 `verification_url` 继续有效，Harness 或 MCP 无需修改配对配置。

- 未登录的多用户浏览器打开待处理的配对链接后，以 303 转到 `/api/v1/auth/login`。专用 HTML 只加载品牌图片和自身脚本、样式，不加载 Gradio 前端、画布或图库。已登录用户仍直接进入授权确认。
- 专用页提供“输入身份”和“身份二维码”两个选项。输入已有昵称、必要的旧电话信息或导入二维码后，使用既有 `get_user_context_with_phrase` 验证口令；会话沿用 `get_user_sstoken`、`resolve_session` 和 `aitoken` 契约。二维码只在内存中解析，接受 PNG/JPEG/WebP/BMP，最多 4 MiB、1600 万像素，不读取任意路径、外部 URL 或 SVG，也不保存上传文件。
- 登录成功的 JSON 只返回服务端构造的原授权页地址；浏览器 Cookie 由响应设置，口令、会话令牌及二维码内容不返回给 Agent。随后重新读取实际 DID、角色和存储范围，仍需要用户单独批准权限。登录不创建身份、不切换服务模式、不改变生成或下载偏好。
- 授权页的“更换身份”进入同一请求的专用页；页面保留可选的“打开 Studio”链接。拒绝、过期或已处理的配对不能继续登录；游客、待批准、被禁用及不符合请求 DID 的身份不能获得授权。角色和目录不能由登录请求指定。
- 登录和二维码解析是浏览器专用端点，不注册模型工具或 OpenAPI。要求 HTTPS 或真实回环、同源 Origin 和 CSRF；短期确认绑定浏览器 Cookie、User-Agent、服务、模式和配对码。成功后一次使用，不重复执行并发登录；每个来源每分钟最多 10 次登录，浏览器请求等待上限 30 秒。
- 配对期限、身份权限或存储范围在登录期间变化时停止，不写入新 Cookie；验证后创建但未交付的会话撤销。口令错误可以重试，不清除原 Cookie、不撤销其他浏览器会话，也不通过复制局域网 Cookie 来建立回环登录。
- 中英文依据当前 `state.__lang`，配对链接的有效 `lang` 可覆盖显示语言；登录完成保留语言与部署前缀。回环仍按多用户 DID 使用用户私有素材／输出目录，不自动切换 local。

### 专用页验收与边界

开发环境 `I:/dev2/New_SimpAI/SimpAI_win_dev/python_embeded/python.exe` 的 API、授权、登录、MCP 连接、实际 Gradio 回环监听和身份会话专项共 **214 passed**，用时 59.39 秒，有 4 条既有第三方弃用告警，无排除用例。覆盖原配对继续、真实生成路径的原有权限契约、角色／目录伪造、身份版本变化、CSRF、同源请求、过期、并发、尝试次数、中文、部署前缀和二维码像素解码。生成与下载沿用既有测试响应，没有执行真实 GPU 任务或网络下载。

`tests/agent_login_playwright.mjs` 使用生产登录／授权路由和真实 HTTP 页面，身份及二维码导入后端使用隔离替身。中英文、桌面／320–360 像素手机四组通过，验证未加载完整 Studio、错误口令后可重试、二维码选择、键盘切换、语言保持、登录不自动批准和后续授权。原授权、配对码输入、授权管理页面另有六组浏览器检查通过。已查看中文手机和英文桌面截图，没有横向溢出或控件重叠；报告与截图在 `outputs/agent_login_20261006/browser` 和 `consent`。

`tests/helpers/agent_login_native_probe.py` 将原生包的身份目录及入口目录限制在新建测试目录，以真实 `simpleai_base 0.3.57` 和生产 ASGI 路由验证已有管理员身份登录、错误口令拒绝、独立授权、Bearer 与浏览器 DID／存储范围一致、既有浏览器会话继续有效。该原生验收只覆盖输入身份登录，未验证用户实际导出的二维码；HTTPS 在 TestClient 中模拟，不代表远程 TLS 验收。结果位于 `outputs/agent_login_20261006/native-0357/results.json`，子进程退出后已确认隔离身份服务关闭，没有读取生产凭据或更换安装包。

早期检查曾使用默认命令指向的另一份 E 盘 `simpleai_base 0.3.56`，真实验收在再次登录使既有会话失效处失败，记录保留在 `outputs/agent_login_20261006/native/native.log`。确认当前开发解释器的包元数据和原生版本均为 `0.3.57` 后才完成上述成功验收；没有将 `0.3.56` 的失败记为通过，也没有修改该环境。第一次专项调用因启动命令引号错误未执行；第一次浏览器检查也因把前组的既有授权当作新授权而失败，修正测试比较方式后四组通过。旧游客授权页检查已按新的跳转行为更新。

Python 语法检查通过。所有临时测试进程已经结束；当前 Studio/ComfyD 未启动或重启，没有模型加载、下载、GPU 生成、外部 Agent 内建浏览器或真实远程多用户 HTTPS 验收。没有暂存、提交、推送或同步其他安装目录。应用 Python 改动及已有 `0.3.57` 身份库修正需要重启当前开发 Studio，前端需要重新打开配对页面。

## 2026-10-06：0.3.57 发布配置更新

用户告知身份库 `0.3.57` 已上传后，已核对现有发布仓库的六个 CP312／CP313 Windows、macOS arm64 和 Linux x86_64 wheel 的 HEAD 元数据。Studio 的 `launch.py` 现在要求至少 `0.3.57`，并保存六条对应的远端 SHA256；旧版由原有经过完整性校验的升级流程处理，兼容的新版本不降级。版本选择、下载校验和既有身份持久化专项共 `85 passed, 26 subtests passed`，详细记录见 [身份开发记录](identity-session-development.md) 末尾。

这次没有下载、安装或替换公开 wheel，也没有重启当前服务。此前专用页的 `0.3.57` 原生验收针对已经安装的开发构建，不自动等同于此次公开包的运行时验收。旧 E 盘 `0.3.56` 的再次登录失效仍未在其运行环境中修复；本次更新的是 Studio 启动发布配置，不会修改另一份安装或已在运行的进程。

## 2026-10-06：单图换装的任务分类修正

用户提供的 HTTP 请求为 `task=image_edit`，携带一张已经上传的图片，原始 `instruction` 为“用这个把女孩的衣服换成黑白条纹比基尼”。实际运行服务的只读预览在 Qwen2.1-Edit 和 Krea2-ImageEdit 上均复现为 `task=image_object_transfer`、`status=needs_media`。两次响应同时显示模型 ready、图片绑定到 `scene_canvas_image`、`requires_upload=[]`、`unbound_inputs=[]`；任务没有缺少已上传的原图，而是共享分类器将换衣关键词解释为双图服装迁移，要求额外参考图。

现场发现接口的模式为 local，使用日志公布的 `http://127.0.0.1:8186` 入口，仅调用公开发现、预置详情和路由预览，没有使用生产 Cookie 或 Bearer，也没有提交生成、读取私密连接文件或重新上传素材。OneKeyKontext 的 Clothing 详情显示单图槽，蒙版不可用；它的 FLUX 最终提示词另有英文要求，不能因为修正分类就取消该语言检查。

### 当前规则

- API 显式提供合法 `task` 时，预览、提交和候选模型替代均保留这个任务 ID，只按该任务验证输入、预置、主题和权限；不再由原始需求的关键词悄悄改为别的任务。不兼容的任务／预置仍拒绝，未知 ID 仍返回参数错误。请求工具 schema 已说明该语义。
- API 省略 `task`、内置 Agent 需要自动判断时，单图加文字描述的换衣请求使用 `image_edit`，不要求生成不存在的服装参考图。双图换装继续使用 `image_object_transfer`，保留人物／底图和服装参考图的角色与顺序。
- 原始需求明确提到图 2、第二张／另一张或参考图时，即使目前只收到一张图片，自动分类仍保留迁移任务并返回 `needs_media`。明确的 `image_object_transfer` 也仍需目标和参考图，不能借本次修正跳过第二张图。
- `instruction` 和 `prompt` 继续分离：自动判断读取用户原始需求；最终提示词使用预置的规范。更换最终 `prompt` 的措辞不能修正仍相同的 `instruction` 所触发的旧分类。不要通过修改用户原文、假造第二张图、反复更换 Cookie 或直接提交未就绪请求来处理这种错误。
- 身份、存储目录、提示词语言、素材类型、蒙版、模型下载与生成权限、自动生成偏好均保持原有检查。此次没有增加模型写工具或自动生成授权。

### 分类与请求验证

新增专项使用实际预置 JSON、参数／能力 schema、生产 HTTP 路由和素材上传／读取逻辑，在隔离目录上传测试图片。Qwen2.1-Edit、Krea2-ImageEdit、OneKeyKontext 的 Clothing 分别验证显式 `image_edit` 和省略任务的单图请求：预览 ready、原始需求保留、最终提示词保留、恰好一个图片绑定；随后提交到测试生成后端，确认同一素材 ID、当前身份、提示词及画布槽完整传入。OneKey 的测试按规范提供英文最终提示词；中文最终提示词另有检查，仍返回 `needs_prompt`。

缺失第二张服装参考图的显式及自动迁移请求仍拒绝提交；现有双图服装迁移、姿势角色、内置自动路由、API 私有素材隔离和执行层相关回归保持通过。专项初次为 `8 passed, 2 failed`，两项 OneKey 失败来自测试传入不符合 FLUX 规范的中文最终提示词；按其规范改用英文并保留该语言拒绝用例后，新增专项为 `11 passed`。未把该测试输入问题当作通过，也未放宽生产提示词检查。

完整相关 Python 验证覆盖 Agent API、聊天协议、内置 Harness、Canvas VLM 和执行层五个文件，为 `372 passed, 7 subtests passed`，65.51 秒，7 条第三方弃用告警，无排除用例。生成后端为测试响应，没有执行 GPU 生成；只读现场复现显示的是重启前的旧行为，不等于修正已在运行进程中生效。当前 Studio/ComfyD 未重启，没有加载模型、下载文件、改变用户图片、暂存、提交、推送或同步其他安装。加载后端修正需要重启 Studio，再使用原始 `image_edit` 请求预览；实际用户图片的生成与输出验收仍未执行。

公开工具 schema 增加显式 `task` 与省略后自动判断的说明后，上述五个文件再次完整验证为 `372 passed, 7 subtests passed`，67.19 秒，7 条相同第三方弃用告警。不是额外的 372 个用例；最终没有专项失败。Python 语法检查通过。

## 2026-10-06：OneKeyKontext 的固定功能与自动路由限制

用户说明 OneKeyKontext 是旧的针对性单图功能集合，题材及用途有限，主题提示词固定，不应由 Agent 自由撰写或作为常规编辑候选。核对当前预置：Clothing 的固定内容为衣服精修、去皱、保留面料纹理和光影过渡，不是按任意指令更换服装。本节更正前一节将 OneKey 当作通用自由编辑器参与换装提交测试的理解；单图换装分类修正本身继续适用于 Qwen2.1-Edit、Krea2-ImageEdit 等通用编辑预置。

- Python 共享编译器及兼容候选不再自动选择 OneKeyKontext；内置创作前端的自动选择及拒绝下载后的候选列表也排除它。即使它已安装并就绪，也不会覆盖其他通用编辑预置的路由或作为唯一自动替代。用户明确指定、会话手动选择或已选参数预设仍可保留该旧预置。
- 预置发现返回 `automatic_routing=false`、`prompt_mode=preset_fixed`；详情和提示词规范提供 `prompt_policy`，含不可改写标记、显式主题要求及当前主题的固定值。其规范不再要求 Agent 撰写最终提示词或读取通用写作技能，内置说明也不再推荐它做常规产品精修或三视图。
- API 生成预览要求显式 `theme`，或使用用户所选参数预设保存的主题。缺少主题返回 `preset_theme_required`，参数预设选择等待仍可继续。任意 `prompt`／`parameters.prompt` 覆盖返回 `preset_prompt_fixed`；省略提示词时使用当前主题模板，保留 `source_instruction`。直接提示词校验也拒绝与固定模板不同的文本。
- 共享 Canvas 执行层和任务预览按该主题的 schema 默认提示词执行，聊天参数、已有快照及其他提示词覆盖不能改变它；模板缺失时停止，不使用随意生成的文本替代。固定约束仅限 OneKeyKontext，其他预置的提示词、身份、素材、模型参数和权限检查不变。没有修改旧预置 JSON、删除模型、隐藏原界面手动入口或同步 F／E 盘副本。

修正后的针对性 Python 检查 `10 passed`，前端素材／下载／替代检查 `70 passed`。完整相关 Python 六文件为 `390 passed, 7 subtests passed`，69.07 秒，7 条第三方弃用告警；相关 Node 检查均通过，覆盖自动排除、只剩旧预置时不自动选用、原手动入口、固定主题发现、覆盖拒绝、原始需求保留及执行层模板。API 提交使用隔离测试生成后端，没有真实 GPU 生成。此前的补丁匹配失败没有写入任何文件；隔离读取曾因缺少工作区模块路径失败，修正检查路径后完成验证。

开发记录按追加顺序保留前面的历史检查，其中 OneKey 自由换装的旧用例已改为明确功能的固定模板验证。当前 Studio/ComfyD 未重启，没有下载或安装依赖、操作用户图片、暂存、提交、推送或覆盖其他目录；现场服务尚未加载本节及前节后端修正，加载需重启 Studio 并刷新聊天前端。实际用户图片的模型输出与外部 Agent 重试仍未验收。

## 2026-10-06：导入用户工作流，返回图片和视频

本节新增工作流导入／检查／修改／执行能力，更新前面“任意工作流执行尚未开发”的历史状态；并不开放任意节点或服务器文件操作。用户可以通过 HTTP／MCP Agent 逐步调整自己的图，保留每个版本，不必提前制作 preset。

### 发现和权限

capabilities 新增 `workflows_url`、`workflow_import` 能力说明。工具通过原有 `/tools` 和 MCP 动态发现，不需要新的适配器依赖。身份、授权续期、部署前缀和私有素材规则不变。

| 工具 | HTTP | 权限 |
| --- | --- | --- |
| `simpai.workflows.import` | `POST /workflows` | `assets.write` |
| `simpai.workflows.get` | `GET /workflows/{workflow_id}?offset=0&limit=20` | `read` |
| `simpai.workflows.node_types` | `POST /workflows/node-types` | `read` |
| `simpai.workflows.update` | `POST /workflows/{workflow_id}/update` | `assets.write` |
| `simpai.workflows.preview` | `POST /workflows/{workflow_id}/preview` | `read` |
| `simpai.workflows.submit` | `POST /workflows/{workflow_id}/runs` | `runs.submit`，且当前身份允许生成 |

表内路径相对于发现到的 API base，实际调用使用响应 URL，并对路径中的 ID 编码。`GET /workflows/{workflow_id}/content` 返回该身份保存的原始 JSON 内容，供下载或进一步修改；不是可任意读取路径的文件接口。工具正文始终包含 `workflow_id`，HTTP 路径与正文必须一致。用户不能通过正文指定 DID、目录或其他身份。

### JSON 与 PNG

导入 JSON 的正文：

```json
{
  "json_text": "{\"1\":{\"class_type\":\"EmptyImage\",\"inputs\":{\"width\":64,\"height\":64,\"batch_size\":1,\"color\":0}},\"2\":{\"class_type\":\"SaveImage\",\"inputs\":{\"images\":[\"1\",0],\"filename_prefix\":\"example\"}}}",
  "name": "My workflow"
}
```

`json_text` 是用户提供的文件内容，单行、多行和 UTF-8 BOM 都可以；拒绝重复 JSON key、非有限数字、非法 Unicode、过深结构及无效节点。文件最多 2 MiB、512 个节点；未安装节点可以保存供检查，但不能执行。识别原生 API graph、`prompt`／`output` 包装，以及含 `nodes`／`links` 的 UI graph。

PNG 使用原有素材上传接口，之后：

```json
{
  "asset_id": "asset:<uploaded-png-id>",
  "metadata_key": "auto",
  "name": "Workflow from PNG"
}
```

`json_text` 和 `asset_id` 必须二选一。PNG 只读取 `prompt` 与 `workflow` 文本元数据，不执行图片中的指令或其他元数据。`auto` 优先使用实际执行的 `prompt`；只有 `workflow` 时使用 UI graph，两份有效内容同时保留。返回 `origin`，含当前素材 ID、所选 key、可用 key，以及无效的另一份 key。用户可以显式选择 `prompt`／`workflow`；默认选中的内容损坏时返回错误，不悄悄更换来源。没有 Comfy graph 的普通 PNG、只有 Fooocus 参数的图片及其他图片格式不能自动还原工作流。不会修改、重编码或删除原 PNG。

导入保存为当前身份的不可变版本，返回 `workflow_id`、`fingerprint`、节点数量、来源和阅读／预览／修改／提交 URL。JSON 空白排版不改变版本；名称、来源及父版本是记录的一部分。原稿在用户的素材命名空间下独立保存，完整性不符时拒绝继续。Studio 重启后导入文件仍可读取；运行记录继续沿用当前内存生命周期，没有新增重启后的任务恢复能力。

### 检查和逐步调整

`workflows.get` 按节点分页，`workflows.node_types` 接受最多 32 个 `class_types`，返回当前安装的输入、输出 schema 及 `execution_supported`。不会调用上传文件里的代码。`workflows.update` 例子：

```json
{
  "workflow_id": "workflow:<current-version-sha256>",
  "expected_fingerprint": "<current-version-sha256>",
  "edits": [
    {"node_id": "6", "input": "text", "value": "User-selected revised prompt"},
    {"node_id": "3", "input": "seed", "value": 123}
  ]
}
```

只修改当前节点 schema 中存在的命名输入，每次最多 64 项；生成新的 API workflow 版本，原稿不覆盖。字段或连线仍须通过下一次预览；保存修改不意味着已可生成。拓扑修改通过完整 JSON 重新导入，携带自己拥有的 `parent_workflow_id`，保留修改链。无权读取父版本时不能创建关联版本。

UI 转换采用当前 Comfy 的 `input_order`、输入类型及标准控件规则，明确处理 seed 的 `control_after_generate`，再根据六字段连线重建 API inputs。仅支持已明确处理的标准节点控件；它不是完整前端 `graphToPrompt` 的替代。虚拟节点、子图、自定义控件序列化、不同 widget 数量、旁路／禁用模式及不支持的连线格式返回 `needs_api_export`，不静默删除节点、分支或猜测扩展的控件行为。普通 JSON 的单行／多行不是格式判断依据。

预览正文：

```json
{
  "workflow_id": "workflow:<version-sha256>",
  "bindings": [
    {"node_id": "10", "input": "image", "asset_id": "asset:<owned-image-id>"}
  ],
  "include_api_prompt": false
}
```

返回 `ready_to_submit`、状态、问题列表、模型缺失、输入绑定、图片／视频输出节点、规范化记录、身份摘要和 `preview_fingerprint`。默认不包含大图正文，需要时显式 `include_api_prompt=true`；这不会改变预览摘要。当前状态包括 `ready`、`needs_nodes`、`needs_api_export`、`unsupported_nodes`、`needs_models`、`needs_media` 和 `invalid_workflow`。

输入检查包括必需字段、枚举／数值范围、链接存在与输出类型、图循环和隐式／多余字段。模型路径不接受绝对地址、父目录或 URL；兼容路径分隔符使用现有枚举规范化，原稿不改变。文件读取节点必须重新绑定当前身份的素材，不能直接复用 JSON／PNG 中的 Comfy 文件名。PNG 中的输出图不自动当作原工作流的输入图，Agent 应保留素材角色并请用户提供缺失输入。

执行使用服务端审阅节点清单，当前涵盖标准模型加载、采样、编码、常见图像处理，以及受管理的 `LoadImage`／`LoadImageMask`／`LoadVideo`、`SaveImage`／`PreviewImage`／`SaveWEBM`／`SaveVideo`。安装了某个 custom node、在帮助里读到它或属于管理员身份均不扩大此清单。未开放的脚本、网络、任意文件读写和其他节点停止在预览；不自动安装插件。API 支持视频不意味着任意 H3／Wan 私有节点图都已经开放执行。

缺模型只报告所需文件，预览／导入／修改不会自动下载。现有 `models.download` 仍只处理可见 preset 的受管理模型，需已有下载权限和用户确认；本接口不接受自定义下载 URL，也不为任意工作流生成下载清单。批量输入 `batch_size` 不超过 64，最多 16 个受支持输出节点；执行结果最多收集 64 个文件、单个文件不超过 512 MiB。

### 确认、共享队列和输出

用户确认后提交：

```json
{
  "workflow_id": "workflow:<version-sha256>",
  "bindings": [],
  "preview_fingerprint": "<ready-preview-fingerprint>",
  "request_id": "user-workflow-run-001",
  "instruction": "User's original request",
  "timeout_seconds": 1800
}
```

预览摘要绑定版本、当前身份／存储、输入素材及当时的节点 schema。提交时重新检查；后台准备期间在上传素材、验证及提交前再次检查权限和身份。发生变化时要求重新预览和确认，不改成 guest／local，也不自动换模型。原始 `instruction` 保存在任务预览中，不覆盖图里的实际提示词。

任务通过原有 `AsyncTask`、共享 GPU 任务锁、run ownership 和队列遥测执行，不另建一条不受 Studio 管理的 Comfy 队列。输入按内容摘要上传到配置中的后端；输出前缀由服务生成，不接受原图指定的绝对保存位置。Comfy 的新内部只读验证入口与严格提交标记要求所有输出分支都有效，避免普通 `/prompt` 的“部分分支有效仍可执行”行为导致结果缺失；旧 Comfy 调用默认行为保持不变。实际后端验证在素材上传完成后执行，所以预览明确返回 `validation=node_schema` 和 `backend_validation_required=true`，schema 就绪仍不能保证真实生成成功。

复用既有 `GET /runs/{run_id}`、取消和输出素材接口，成功状态为 `data.state=finished`。图片、视频及混合输出按 MIME 登记在提交者的素材命名空间。少了任一要求的输出节点、模型执行错误、空输出或下载失败均不报告完成。后续对话可以引用输出 `asset_id`。

同一 `request_id` 和正文重试返回原 run，正文变化返回冲突；后端模型条件后来变化也不会让已提交请求再次入队。Comfy 提交响应丢失时查询同一 prompt ID，不重新 POST 图。执行等待默认 30 分钟，范围 30 秒至 2 小时，包括准备阶段；超时／用户停止只删除或中断当前 prompt，停止确认最多再等待 30 秒。无法确认后端终止时返回 `workflow_state_unknown`，不得当作取消成功或重新提交。

### 本次验证范围

新增 `tests/test_agent_workflows.py` 专项当前 `60 passed`，9.60 秒，8 条第三方弃用告警。覆盖 JSON 包装／排版、私有不可变版本、分段读取、命名修改、完整图修订、PNG 两种元数据及来源选择、缺失／损坏元数据、跨身份素材拒绝、标准 widget 与 seed 控件、未知节点／模型／隐藏字段／循环／输出槽拒绝、预览摘要变化、权限减少、重试去重、超时定向取消及图片＋视频结果登记。

队列测试调用生产 run 记录和轮询逻辑，工作线程为隔离测试对象。PNG 测试使用真实 PNG 文本元数据及生产上传／读取逻辑。后端严格验证使用从生产文件提取的处理函数和测试验证响应，检查零排队及旧调用行为保留；执行请求与生成内容为测试响应，其中测试 MP4 仅用于文件／MIME／权限检查，不代表真实视频编码或模型推理验收。

初次执行层文件修改因格式校验失败，没有写入；之后专项扩大检查曾为 `48 passed, 2 failed`，两项失败是隔离测试没有为共享执行层初始化身份对象，调整测试初始化后为 `50 passed`，再增加 PNG 和权限复核后为上述 `60 passed`。没有省略失败用例或把测试身份问题作为实际 GPU 修复。

HTTP／MCP 已具备完整工具调用路径；内置只读 Harness 可以检查已导入的图，仍不能自行执行写工具。内置聊天 JSON 附件入口、工作流生成确认卡、保存为 preset、任意扩展／虚拟节点的前端转换、插件安装及任意工作流的模型下载尚未实现。现有 Studio／Comfy 未重启，没有加载 GPU 模型、下载文件、安装依赖、修改用户 PNG／JSON、暂存、提交、推送或同步其他安装。运行中的服务尚未加载新增接口，需要重启更新后的 Studio 和 Comfy 后端；实际用户工作流、浏览器聊天和 GPU 生成验收未执行。

### 最终兼容性检查

扩大检查首次为 `382 passed, 7 subtests passed, 1 failed`：新增错误处理把普通测试任务对象的动态属性当作工作流错误，影响已有“结束后收到停止请求”的行为。修正为仅处理 `ImportedWorkflow` 的结构化错误，没有修改或排除原有停止测试。随后十三文件综合检查为 `585 passed, 7 subtests passed`，82.26 秒，9 条第三方弃用告警，覆盖 Agent API／授权／MCP／Harness、执行层、身份、后端请求协议、遥测、兼容参数、图片编辑路由及提示词规范。

最后检查进一步限制 HTTP 执行：不传入浏览器 `client_id`，避免触发现有后端的单连接重新绑定；下载失败仅清理本次新建的临时结果，不删除已存在文件。绑定素材后，文件选择器中的共享文件名和默认值不参与预览摘要，其他用户上传不会因此让已确认任务失效。节点 schema 查询隐藏共享输入文件名和凭据字段的默认值，未开放节点不返回默认值或枚举内容；读取用户自己提供的原始工作流内容仍是单独的授权操作。

最终工作流专项已增加至 64 项；与生产执行层、Comfy 请求合同一同重新检查为 `103 passed, 7 subtests passed`，10.94 秒，9 条相同第三方告警，无排除用例、无剩余测试失败。这是上述综合检查相关部分的再次验证，不是额外的 103 个独立测试。九个 Python 文件语法检查通过，任务范围的差异及未跟踪文件空白检查通过；Git 的 LF／CRLF 提示不是空白错误。真实浏览器、实际用户工作流、视频编码和 GPU 推理仍未执行，运行中的旧服务未自动重启。

最后增加了命名节点的格式识别检查：API graph 中名称为 `prompt`／`output` 的普通节点不能被误认成外层包装，先识别完整节点图再处理包装字段。工作流专项最终为 65 项，相关三文件再次验证为 `104 passed, 7 subtests passed`，11.71 秒，9 条相同第三方告警，无失败及排除项。以上均为逐次验证记录，不累计为独立用例数量；未验收项目和服务加载要求不变。

## 2026-10-06：WD14 图片标签反推

新增只读工具与 HTTP 入口：

| 工具 | HTTP | 用途 |
| --- | --- | --- |
| `simpai.prompts.wd14_status` | `GET /api/v1/prompts/wd14/status` | 检查已安装的模型与 CSV，不加载模型或下载 |
| `simpai.prompts.wd14` | `POST /api/v1/prompts/wd14` | 从当前身份可读的图片反推标签 |

capabilities 返回 `image_tagging_url` 和 `image_tagging_status_url`，保留部署前缀；工具目录和 OpenAPI 同步暴露 schema。HTTP、MCP 和内置只读 Harness 均复用同一服务。Bearer 连接只需 `read` scope，guest 不可调用；`asset_id` 不授予跨身份读取权限。

请求示例：

```json
{
  "asset_id": "asset:<uploaded-image-id>",
  "threshold": 0.35,
  "character_threshold": 0.85,
  "exclude_tags": "text, watermark",
  "limit": 64
}
```

两个阈值范围均为 0～1；`limit` 范围为 1～256，默认 64；排除标签采用逗号分隔，空格与下划线等价。不接受任意文件路径、外部 URL、身份或下载参数。素材必须是图片，超过 64 百万像素拒绝推理。后端修正 EXIF 方向并转为 RGB，调用已有 WD14 预处理和模型实现。

返回 `tags` 数组，每项包含规范名称 `tag`、`category`（general／character）和 `confidence`，同时返回 `prompt`、`model_id`、实际 `providers`、完整候选数量 `total` 和 `truncated`。`prompt` 与截断后的标签一致，保留原有下划线转空格与括号转义格式。没有启动生成；`automatic_download=false`、`generation_started=false`。

Agent 路径固定使用 `CPUExecutionProvider` 与四个推理线程，不申请 GPU。UI 原有四参数调用和 provider 选择仍保留；共享模型缓存按模型与 CPU／GPU 模式区分，互斥执行避免并发修改缓存。CSV 使用类别字段选择一般与角色标签，不依赖标签表中的排列位置。

状态检查按既有兼容顺序选择已完整安装的 ONNX＋CSV；不会因首选模型缺失而下载它。没有完整模型返回 `409 wd14_model_missing`，附带状态及缺失文件；忙碌返回 `409 wd14_busy`，推理错误返回 `502 wd14_inference_failed`，不暴露服务器路径。当前没有独立 WD14 下载入口；Agent 不得调用原界面来绕过权限或下载确认。

反推标签仅用于提示词候选，不能作为真实身份、年龄或图片中内容的确定证明。生成前仍按所选 preset 的 `prompts.guidance`／技能调整格式，必要时使用 `prompts.tags` 检索、`prompts.validate` 校验；调用反推不构成生成授权。

### 验证记录

WD14、既有预处理／provider 合同及 Windows 打包安全专项合计 `56 passed`，12.57 秒。覆盖素材所有权、guest／scope、参数边界、HTTP／内置工具一致性、部署前缀、缺模型不下载、CPU provider、缓存模式、类别与排除标签、旧四参数调用；ONNX 推理采用测试响应，没有加载真实模型。

首测的三项 WD14 失败来自测试身份没有提供既有素材存储状态，以及把原始 OpenAPI 当成业务响应；调整测试后通过。Windows 安装测试还暴露了 Windows PowerShell 5.1 环境中 `Get-FileHash` 不可用的问题，安装脚本改用 .NET SHA256；错误输出编码、测试进程退出判断及恶意 ZIP 构造中的路径自动规范化也已修正。没有删除失败用例或降低校验要求。

API／授权／MCP 连接层／Harness／提示词规范五文件回归为 `249 passed`，70.52 秒，四条既有 Triton 弃用告警。Windows 接入配置五项 Node 测试、八项中英文桌面／移动浏览器检查通过；独立运行环境离线安装与真实 stdio 握手通过，动态发现 31 个工具，包含 WD14 状态与标签调用。stdio 的服务端为隔离 HTTP 测试响应，不能据此宣称真实 WD14 推理或生产服务验收完成。

没有重启 Studio／Comfy、加载 GPU 模型、下载或安装依赖、上传魔搭、暂存或提交。新接口须加载更新后的 Studio；真实 WD14 输出、魔搭在线下载、Linux／macOS 安装和外部 Agent 客户端中的配置加载尚未验收。Windows 发布包说明与 SHA256 见 `agent-mcp.md` 末尾。

### 最终联合检查

合并上述专项、五文件回归与工作流检查后，十文件联合验证为 `370 passed`，85.77 秒，八条既有 Triton／SciPy／SWIG 弃用告警，没有剩余测试失败。13 个 Python 文件语法及安装脚本语法检查通过；已跟踪改动和 19 个相关未跟踪文件空白检查通过。第一次新增文件检查误把 `git diff --no-index` 的差异退出码 1 当成失败，调整为检查实际空白诊断后通过；LF／CRLF 提示不属于空白错误。非图片输入错误提示也按服务端 `state.__lang` 提供中英文。

最终发布目录的两个 ZIP 与离线验收使用相同 SHA256；正式目录再次验证安装、SDK 隔离导入、重复安装和实际 stdio 工具调用均通过，报告位于 `outputs/mcp_windows_release_acceptance_20261006`。本段联合结果包含前面重复执行的用例，不累计为新增测试数量；线上发布、真实模型及生产服务加载的未验收范围不变。

## 2026-10-07：MCP 根目录发布与本地 VLM 接口讨论

用户已上传两个 Windows MCP ZIP 到魔搭仓库根目录。构建与安装源改为完整根目录文件名，生成 1.0.1 适配器小包；运行环境 SHA256 不变。公开文件元数据、33 项专项和离线 stdio 验收通过；线上仍需替换带旧 `libs/mcp` 地址的初版小包，没有执行实际在线下载、上传或生产服务重启。文件与 SHA256 见 `agent-mcp.md` 最新根目录发布节。

### 本地 VLM 方案，尚未实现

现有 `enhanced/llamacpp_vlm.py` 已提供文本／图片推理、聊天、流式输出及模型互斥；`enhanced/vlm.py` 和 Canvas／内置聊天已有模型准备与调用路径。Agent API 的当前 31 个操作尚未包含本地 VLM 推理工具，也没有提供通用外部聊天 completion 路由。浏览器内部聊天接口不能直接作为已完成的公共 LLM API。

两种候选入口可以共用服务：HTTP／MCP 的图片分析、提示词整理、生成结果复核工具；以及兼容常见 LLM 客户端的模型列表与聊天 completion API。既有聊天支持流式输出不等于外部 API 已支持多模态、标准 `messages`／`usage`／错误格式或工具调用协议；这些需单独实现与验收。

候选方案应限定已安装的本地 llama.cpp 模型，不因界面选择了 Custom／P2P 而将图片转发给远端，也不自行下载模型、改变其他用户的聊天设置或读取任意路径。工具使用当前身份的素材 ID；会话与请求按身份隔离，推理授权与普通资料读取权限应分别管理。

推理服务需要复用既有 GPU 任务互斥、等待和取消，不主动中止生图；纯 CPU 驻留设置与显式卸载语义继续保留。不能直接把当前全局 VLM 设置作为多用户独立请求配置；共享模型切换、运行状态、时间／token／素材限制和取消应独立检查。VLM 工具只做一次受限推理，不递归启动内置 Harness。

本地分析工具应仅返回分析文本或结构化建议，不修改、删除原图或自行生成。外部 Agent 是否接受返回结果、是否删除它在自身环境中的副本，仍由该客户端的模型与文件权限决定；不能承诺换用本地 VLM 就消除全部误判。避免向外部 Agent 提供 Studio 文件系统删除权限与通过本地模型看图是两项独立措施。

本段只记录技术可行性与候选约束。用户尚未选择“工具＋兼容聊天 API”或“仅工具”，本次没有注册新 VLM schema、scope、HTTP 路由或 MCP 工具，也没有加载模型执行推理。

## 2026-10-07：A 本地 VLM 工具与 Chat Completions API

用户选择 A 后新增共享本地推理服务，替代上一节的待选状态。仅使用 Studio 已安装的 llama.cpp 模型，不启动第二个模型服务，不经过界面模型选择、Custom／P2P 或 Harness 的再次执行。界面 VLM 选项与缓存的文本会话不由 API 修改。

| 工具 | HTTP | 权限 |
| --- | --- | --- |
| `simpai.vlm.models` | `GET /api/v1/vlm/models` | `read` |
| `simpai.vlm.status` | `GET /api/v1/vlm/status?model=ID` | `read` |
| `simpai.vlm.analyze` | `POST /api/v1/vlm/analyze` | `vlm.infer`＋当前身份生成权限 |
| `simpai.vlm.chat` | `POST /api/v1/vlm/chat` | 同上 |

工具目录、OpenAPI 和内置只读 Harness 同步提供这些操作。`vlm.models` 默认只列已安装模型，可按 query／installed_only／offset／limit 查询；不返回模型绝对路径、下载 URL 或云端 API 配置。`vlm.status` 表示文件／projector 就绪情况，实际加载及 vision handler 在执行时再次验证。缺文件、未知模型、文本模型接收图片或无法加载均返回明确错误，不自动换模型或下载。

看图例子：

```json
{
  "model": "<ID returned by vlm.models>",
  "asset_ids": ["asset:<owned-image-id>"],
  "instruction": "描述图片里的服装、姿势和背景，不修改图片。",
  "max_tokens": 1024,
  "timeout_seconds": 120
}
```

返回分析文本、素材引用、finish_reason、usage（运行时未提供时为 null）与 local_only／media_modified 等标志。`media_modified=false`、`generation_started=false`、`automatic_download=false`；原图不重编码覆盖或删除。图片按 EXIF 校正、透明区域合成白色背景并限制输入尺寸，仅在内存准备。需要多张参考图的 Qwen hybrid handler 复用已有编号拼图规则，保留各图引用与消息顺序，不静默丢弃其他图片。

### 兼容入口

capabilities 的 `local_llm.api_base` 为 `/api/v1/llm`，`models_url` 和 `completion_url` 给出具体入口并保留反向代理前缀。客户端 Base URL 使用实际 Studio 地址加这个路径：

- `GET /api/v1/llm/models` 返回 `{object:"list",data:[...]}`，要求已授权的 `read`。
- `POST /api/v1/llm/chat/completions` 返回 `chat.completion` 或 SSE `chat.completion.chunk`，不带 Agent `ok/data` 外层。

```json
{
  "model": "<installed local model ID>",
  "messages": [
    {"role": "system", "content": "只回答用户的问题。"},
    {"role": "user", "content": [
      {"type": "text", "text": "这张图的服装是什么？"},
      {"type": "image_url", "image_url": {"url": "asset:<owned-image-id>"}}
    ]}
  ],
  "stream": true,
  "stream_options": {"include_usage": true},
  "max_completion_tokens": 1024
}
```

支持 system／developer／user／assistant／tool 消息；developer 在本地适配为 system。服务不保存外部会话，后续调用方提供完整的有界历史，并重新提供要继续看见的图片。普通兼容客户端可发送 PNG／JPEG／WebP 的 base64 data URL；素材 ID 是 Studio 扩展。拒绝任意远端 URL、服务器路径和没有当前身份读取权的素材。

支持 temperature、top_p、seed、stop、n=1、max_tokens 或 max_completion_tokens，以及 text／json_object response_format。支持声明 function tools、tool_choice 与 assistant/tool 历史；函数调用由客户端处理，Studio 不执行，输出在结束前校验声明名称、ID、JSON 参数及完成状态。具体模型／handler 不支持函数格式时明确报错，不声称所有 GGUF 都已经具备工具能力。strict function schema、JSON schema response_format、多 choice、音频／视频及 Responses API 尚未支持，未知字段不静默忽略。

服务扩展参数：vram_policy 为 cpu／relaxed／standard／extreme，默认 standard；n_ctx 默认 8192，范围 1024～32768 且不能超过模型公布限制；timeout_seconds 默认 120，范围 1～600。输出 token 上限 8192、消息上限 64、文本与工具 schema／历史参数合计 64000 字符、图片最多 4 张。兼容请求正文上限 16 MiB，单张内联图片解码最多 8 MiB、64 百万像素；素材文件最多 80 MiB。图像解码并发 2，请求等待／执行位置最多 4，过载返回 429。

SSE 返回 assistant role、可见文本／函数 delta、finish_reason，以及运行时可提供的 usage 末块，最后为 `[DONE]`。等待时每 10 秒发送 SSE keepalive 注释，不把等待当成模型结果。隐藏 reasoning 字段及分段 think／Harmony 思考频道不发送。中途错误返回 error 事件，不追加成功 finish；非流式错误使用标准 error 外层。`length` 与 `content_filter` 不应当成完整创作结果。

### 身份与执行

`vlm.infer` 不是默认配对权限，read／runs.submit 均不能代替它；账号仍须有既有生成权限，guest 不可调用。接入页新增独立权限选项及本地 LLM Base URL。普通浏览器／local 身份沿用已有授权方式；Bearer 由私密连接层保管，兼容接口不提供免授权口令或第二套身份。

请求绑定身份、角色与存储范围，排队前、取得 GPU 位置后、输出期间及结束前再次验证。正常 refresh 使用稳定授权 ID 复核已开始的请求，旧 Bearer 仍不能开始新请求；撤销、权限减少、账号禁用、服务模式或身份／目录变化停止输出。队列中模型配置／文件版本变化要求重查。

推理复用 GPU 互斥，等待／取消不停止其他人的生图。模型 load 与采样保持运行时锁；CPU 请求也取得共享位置以避免在生图中更换模型。没有新增 UI 自动卸载／停止 Comfy 逻辑。取消和超时为协作式：等待和 token 边界可停止，正在执行的原生模型加载／单 token 计算必须先到安全返回点，不能报告它已被强制中断。连接断开与 MCP 工具超时传播停止信号，不重新提交生成。

### 验证记录

十文件联合回归 `422 passed`，107.29 秒，八条已有 Triton／SciPy／SWIG 弃用告警。专项覆盖 HTTP／工具共享服务、图片所有权、原图字节保留、guest／scope／账号权限、普通与 SSE、错误而非假成功、函数返回而不执行、编号多图、CPU 参数、目录不改 UI 设置、授权续期与撤销、GPU 等待／取消／超时及模型版本变化。推理、native 模型加载及 HTTP stub 的生成内容是测试响应，没有真实 GPU 模型验收。

初次测试收集发生循环导入，改为按需创建服务后恢复；随后一项用例误用 download_url，已改为实际 content_url。扩大检查曾为 260 通过／1 失败，旧工具白名单遗漏此前已实现的三项工作流写操作，显式更新合同后联合检查通过，没有把 VLM 工具标成写操作或移除权限检查。开发过程中一处追加定位不匹配没有写入，已按当前文件重新应用。

五项 Node 配置与八项中英文桌面／移动浏览器检查通过，截图在 `outputs/agent_connection_vlm_20261007`。Windows 1.0.2 包再次验证安装、重复安装、独立 SDK 与实际 stdio 35 工具发现、本地模型查询和分析调用；报告在 `outputs/mcp_windows_vlm_acceptance_final_20261007`。安装曾连续出现 PowerShell 目录移动拒绝，定位在探测之后的 Move-Item，改为验证路径后的 .NET 目录移动及有期限重试后通过；失败记录没有当作成功。

没有启动或重启 Studio／Comfy、下载模型、安装依赖、执行真实推理、暂存或提交。当前运行服务尚需加载更新；真实 GGUF／mmproj、GPU／CPU 性能、外部 Agent 实际调用、远程 HTTPS 和 OpenAI SDK 客户端尚未验收。当前环境没有 OpenAI SDK，未安装它来代替实际验收。MCP 新小包未上传，已上传的 1.0.1 包与根目录元数据一致，不再含此前旧下载地址问题。

### 最终文件检查

最后保留 assistant 函数历史中的 `content:null`，避免因省略字段影响原生聊天格式；VLM 专项再次为 `40 passed`，17.78 秒。16 个相关 Python 文件与安装脚本语法检查通过，已跟踪差异及 23 个相关未跟踪文件空白检查通过。没有新增未解决的测试失败；LF／CRLF 提示与八条既有依赖告警不作失败处理。该专项属于前述 422 项的相关复测，不累计数量，真实模型和生产服务未验收范围不变。

## 2026-10-07：重启后的首次真实服务检查

实际启动日志和进程监听确认 Studio 地址为 `http://127.0.0.1:8186`，运行模式为 local。公开发现、session、35 工具目录及主机状态查询成功，当前身份拥有 `vlm.infer`，队列空闲，资源查询识别 RTX 5090。没有改变身份、下载模型或重启服务。

真实服务的 VLM 模型发现未通过：界面目录显示多个 llama.cpp 模型已安装，但 `/api/v1/vlm/models` 返回空列表，包含未安装项的查询也将这些模型全部标为未就绪。公开目录有意移除 `resolved_files`，新推理服务错误地依赖该字段。已改为通过既有模型目录查询函数解析目录里的 `expected_files`，逐一检查 GGUF 分片与 projector，不把缺文件视为已就绪；缺失列表只包含实际不存在的文件。动态模型的上下文使用模型公布限制，并受接口 32768 上限约束，不再将默认加载长度当作模型上限。

测试数据改为真实公开目录格式，不再伪造未公开的磁盘路径；新增多模型目录、缺分片、projector 删除和版本摘要变化检查。专项与真实目录复核结果随后追加。当前运行进程尚未加载这项修正，文字、图片、多轮、SSE 及 GPU 推理仍未验收，不能把接口发现成功写成推理验收通过。

### 本次修正的验证结果

VLM 与模型目录专项联合为 `69 passed`，18.22 秒。初次两项用例因测试环境尚未初始化身份对象而无法导入完整配置，改用隔离的配置对象后全部通过；没有修改实际服务配置来解决测试环境的问题。相关文件空白检查无错误，Git 的 LF／CRLF 提示以及 no-index 差异退出码不当作空白错误。

用当前服务的公开模型目录快照和用户配置的模型目录，在独立进程中执行修正后的文件查询：9 个已安装 llama.cpp 模型全部就绪，Qwen Q4 仅缺主模型文件，不再错误地报告已安装的 projector 缺失。动态模型返回接口支持的 32768 上限。该检查使用真实文件，但替代了目录与配置加载入口，没有加载 GGUF、启动第二个模型服务或执行推理，不能归类为 GPU 验收。第一次独立检查缺少项目导入路径，第二次只用了默认目录而未包含用户配置的其他磁盘；按实际配置重新检查后通过，先前失败不计为通过。

当前进程的兼容模型列表仍为空，对已安装 Qwen Q6 的有效聊天请求返回 HTTP 409／`vlm_model_missing`。这是旧查询代码在真实服务中的已知失败，尚未通过重启复测。真实文字、图片、多轮、函数返回、SSE、CPU／GPU性能与等待取消仍未执行；需要服务加载本次修正后继续验收。本次没有自动重启、下载、安装依赖、上传验收素材、暂存或提交。

## 本地 VLM 再次重启后的真实 GPU 验收

用户再次重启后，服务实例 ID 已变化，服务 ID、local 身份和存储命名空间保持不变。真实 `/api/v1/vlm/models` 与兼容模型目录均可查询，9 个已安装模型就绪，先前全被误报缺失的问题已通过运行服务复测。

使用已安装的 `Qwen3.5-9B-abliterated-Q6_K`、`standard`、4096 上下文执行首次真实文字推理，HTTP 200、`finish_reason=stop`，17＋25 的结果为 42，耗时 9.411 秒（包含模型加载）。服务日志明确记录 `loaded_gpu_layers=32/32`、`cpu_layers=0`，未启用 MTP；这是实际 GPU 执行证据，没有把文件就绪或 CPU 回退当成 GPU 通过。运行时未提供 usage，接口如约定返回 null。

新增 `tools/agent_vlm_acceptance.py`，用于有期限的真实 local 服务验收：检查发现和空闲状态，使用调用方提供的消息历史、自己的测试图片素材与图片 data URL，检查分析工具、SSE、函数返回及调用方工具结果、无效请求，以及本次自有推理占用期间另一请求超时和客户端断连取消。保存响应、耗时和主机资源采样，核对原图 SHA256、身份与队列。多用户模式拒绝执行此本地脚本，不自动配对、切换身份或读取已有凭据。当前仅开始专项执行，结果和失败随后追加；不下载模型、不安装依赖、不重启服务，也不提交生图。

### 第一组真实调用结果与函数流式转换修正

报告位于 `outputs/agent_vlm_live_acceptance_746c9a23/acceptance-report.json`。11 项检查中 10 项通过，函数返回及工具历史检查未通过；没有将此次报告标为全部通过。热文字调用 0.362 秒，多轮历史两次调用合计 0.299 秒，素材 ID 图片分析工具 2.547 秒、图片 data URL 兼容调用 0.675 秒，均识别出左侧红色圆形和右侧蓝色方形。SSE 1.269 秒完成，首次可见文本 0.767 秒，具有多个文本片段、正常结束状态和 `[DONE]`；usage 保持 null。

真实边界检查通过：未知模型 404、不支持多 choice 400、外部图片地址 422、无效 Bearer 401。本次自有长推理持有 GPU 位置时，另一个 1 秒期限的请求于 1.007 秒返回 504／`vlm_timeout`，未停止持有者。断开本次持有者的 SSE 后 GPU 位置释放，再次文字推理成功；身份和原素材 SHA256 一致，队列恢复空闲。该测试没有占用或取消其他用户的生成任务，也没有验证生图中的等待、纯 CPU、其他模型或多用户生产配对。

函数请求返回 HTTP 502／`vlm_inference_failed`。再次真实 SSE 查询收到 12 个函数参数片段，每个片段都重复同一完整 call ID 与 `record_value` 名称，随后返回错误事件。已安装 llama.cpp 的通用转换器确实逐片段重复完整元数据，Agent 层原先按标准增量直接拼接，导致名称和 ID 被重复拼接后校验失败。已在本地推理转换入口处理重复完整元数据：ID／type 和已声明的完整函数名仅发送一次，参数片段保持不变，未声明的名称片段仍按增量处理；请求取消时关闭原始流。新增重复参数内容、原事件不变、名称片段及取消清理专项。

当前服务仍运行修正前的转换逻辑，函数能力尚未通过重新加载后的真实复测。其他真实通过项保留。验收脚本不再将完整 SSE 片段输出到终端，完整数据仍保存在报告中，避免大片段遮盖后续失败。

### 工具历史及调用方 system 消息检查

重复元数据修正的专项联合为 `71 passed`，18.65 秒。附加探针通过修正代码离线整理真实函数片段，得到 `record_value`、JSON 对象 `{"value":42}` 和一个有效 call ID，但当前服务接收调用方工具结果历史后仍返回 502，记录在同一目录的 `native-function-probe.json`；不能把离线格式整理当作服务函数验收通过。探针首次因 PowerShell 引用造成语法错误，未发送请求；改用 `json.dumps` 后执行到真实接口，历史错误是单独发现的真实失败。

已安装 Qwen35 模板对历史 `function.arguments` 使用映射的 `items`，API 历史则采用标准 JSON 字符串。已在 Qwen hybrid 的本地运行时入口转换为 JSON 对象，不改变调用方消息、HTTP schema、其他 handler 或输出格式。额外真实调用中，调用方自带 system 消息也返回 502：API 运行时此前又插入一个 system，Qwen 模板要求 system 只能位于开头。已将非思考约束合并到已有首个 system，保留调用方文字及文本 parts；没有首个 system 时保持原来的插入方式。developer 仍沿用已有的 system 映射。验收脚本新增 system／developer 检查，对这些修正仍需重新加载后真实复测。

### 本次结束时的验证范围

最终 VLM 和目录联合专项为 `74 passed`，19.96 秒；包含既有首个 system 的文字／parts 保留、调用方消息不变、Qwen 历史对象转换、原生重复字段、参数增量及取消清理。直接使用已安装 llama.cpp 的 `Qwen35ChatHandler.CHAT_FORMAT` 与 `Jinja2ChatFormatter` 检查转换后的工具历史，模板渲染通过，保留 caller system、参数 value=42 和工具结果内容，调用方 JSON 字符串未变；该检查只渲染模板，没有加载模型或执行额外 GPU 推理。

第一组报告的 7 次资源采样中，显存使用峰值为 11521753088 字节，GPU 利用率峰值为 49%；日志的 32/32 GPU 层提供实际模型加载证据。结束时 worker 就绪，GPU 任务位置未占用，队列数量为 0。没有自动重启、下载、安装依赖、暂存或提交，测试素材仅为本次生成的红圆／蓝方形 PNG，原素材内容保持不变。

整体验收尚未完成：首次报告仍是 10 项通过／1 项失败；追加的工具历史和调用方 system 请求也在当前进程返回 502。三类格式转换已修改，但现有进程未加载，需要重启 Studio 后再执行新脚本的真实复测。没有把专项或模板检查替代这几项 GPU／HTTP 验收。纯 CPU、其他本地模型、生产多用户／权限续期、其他客户端的真实 MCP／OpenAI SDK，以及与实际生图并行等待仍未执行。

## 2026-10-07：local Qwen Q6 单节点 GPU 复测通过

用户继续验收时，服务实例已更新为 `90e0c78fc60745b78e28b1ae515d38ea`，服务 ID、local 身份和存储命名空间未变。发现和会话检查通过，当前 Qwen Q6 文件就绪、worker 就绪、队列空闲。实际服务已加载此前三类格式转换修正，本节更新前文在该运行范围内的未完成状态，原始失败记录保留。

使用 `Qwen3.5-9B-abliterated-Q6_K`、`standard`、4096 上下文执行带 caller system 的冷启动请求，HTTP 200、`finish_reason=stop`，返回正确结果 42，耗时 9.450 秒（包含模型加载）。本次启动日志记录 `loaded_gpu_layers=32/32`、`cpu_layers=0`、MTP 未启用，确认使用真实 GPU。

随后执行 `tools/agent_vlm_acceptance.py`，12 项检查全部通过、0 项失败。报告为 `outputs/agent_vlm_live_acceptance_90e0c78f/acceptance-report.json`：

- 发现、35 工具、9 个就绪模型与兼容模型列表正常。
- 热文字 0.201 秒，多轮调用方历史合计 0.316 秒；system／developer 两项合计 0.299 秒，均返回正确答案。
- 素材 ID 图片分析 1.067 秒，图片 data URL 兼容调用 0.764 秒，正确识别红色圆形和蓝色方形；原素材 SHA256、身份和存储范围不变。
- 文本 SSE 1.314 秒完成，首次可见文本 0.814 秒，有多个文本片段、正常 finish 和 `[DONE]`。
- 函数返回与调用方工具结果继续对话合计 0.884 秒。返回 `record_value` 与 `{"value":42}`，finish 为 `tool_calls`；调用方提供 `{"recorded":42}` 后，模型正常回答 42、finish 为 `stop`。Studio 没有执行该函数。
- 未知模型、非法 choice 数、外部图片来源、无效 Bearer 均按约定拒绝。自有长推理占用 GPU 时，另一请求于 1.003 秒返回等待超时；断开自有 SSE 后 GPU 位置释放，再次文字调用成功。

另行验证带 system 的函数 SSE，0.758 秒通过，call ID 和完整函数名各出现一次，拼接后的参数为 `{"value":42}`，finish 为 `tool_calls`、末尾为 `[DONE]`，无错误事件。完整片段保存为同目录 `function-sse-report.json`。此前函数流式字段重复、工具历史 JSON 字符串与 Qwen 模板不兼容、重复 system 导致的三类 502 均已通过当前运行服务复测。

资源采样 7 次，显存使用峰值 11537481728 字节，GPU 利用率峰值 57%。这些是本次受控请求的采样值，不代表通用性能保证。usage 仍由运行时决定，本次非流式返回 null，没有估算 token 数。结束时 worker 就绪，GPU 任务位置未占用、队列为 0。

本次没有修改功能代码、自动重启、下载模型、安装依赖、暂存或提交，仅追加验收记录并保存测试结果。此前 `74 passed` 是代码修正的专项结果，不与本次 12 项真实服务检查累计。本地 Qwen Q6 的上述 GPU 验收已完成，无本次范围内未解决失败；纯 CPU、其他模型、生产多用户／授权续期、外部客户端实际 MCP／OpenAI SDK，以及与真实生图并行等待仍未验收，不能扩大为整个 Agent API 或全部部署方式均已验收。

## 2026-10-07：外部 HTTP 按需读取工具参数

新增简短工具索引、关键词／类别查询、分页和单项详情，具体协议见前文“HTTP 按需发现工具”。capabilities、仓库 Agent 指南、网页接入说明和启动器的复制说明均引导 HTTP Agent 按需读取；旧服务没有索引入口时使用其公布的完整目录。工具注册表、调用权限、内置 Harness 与 MCP 的完整工具发现格式不变。

当前 35 项工具的紧凑 UTF-8 JSON 响应：原完整清单 36,800 字节；全部简短索引 9,667 字节；默认首屏 20 项为 5,819 字节；只查询 `category=presets` 为 751 字节。索引不生成各工具的参数 schema，详情只生成所选工具的 schema。此测量针对工具发现响应，不是完整对话的 token 计数。

验证结果：Agent API／授权／MCP 客户端／Harness 联合测试 `239 passed`，4 条原有第三方弃用告警；Node 接入和语言检查 9 项通过；启动器接入与状态页 63 项通过。增加旧服务说明后重新执行启动器复制用例，1 项通过，是上述 63 项中的复查，不累计计数。

隔离 FastAPI／Gradio 宿主上的实际 Chromium 检查 8 组通过，覆盖中英文、1280／360 像素窗口、根路径／部署前缀、local 和 multi-user 配对可用／不可用状态。检查了索引链接、复制说明、语言和原 MCP 配置流程，没有替代生产浏览器配对或第三方 Agent 验收。新接口测试另覆盖搜索、分页、详情与原完整 schema 一致、查询后调用、未知工具、非法参数、游客拒绝及部署前缀。

记录位于 `outputs/tool_discovery_20261007/`，启动器检查记录位于其工作区 `tmp/tool_discovery_20261007/`。本次没有重启现有 Studio、执行 GPU 生成、重建 MCP 小包或启动器 exe，也没有暂存、提交或上传。Studio 需加载更新后的代码才能提供新接口；启动器复制说明随后续 4.0.9 打包交付，网页版指引随 Studio 更新。
