# Studio MCP 适配器

`tools/studio_mcp.py` 是独立的 stdio MCP 适配器，使用官方 Python SDK。它查询 Studio 当前的 `/api/v1/tools`，将工具名称、说明、JSON Schema 和只读属性提供给 MCP 客户端，再把调用交给 `/api/v1/tools/call`。预置、模型和参数继续来自现有 API，不另建清单。

HTTP Agent 可以通过 capabilities 返回的 `tool_index_url` 搜索简短索引，只读取所选工具的 `detail_url` 获取参数。完整 `/tools` 格式保持不变，MCP 适配器继续使用完整清单注册工具；本次索引优化无需重建 MCP 小包，不代表现有 MCP 客户端会自动按需加载参数。

提示词准备同样使用动态工具：先调用 `simpai.prompts.guidance` 查询所选预置，再用 `simpai.skills.read` 阅读推荐规范。Anima/Danbooru 可调用 `simpai.prompts.tags` 查询本地标签，通过 `simpai.prompts.validate` 检查后再预览与提交。`instruction` 保留用户原始需求，`prompt` 使用目标模型要求的格式和语言；Anima 的最终提示词要求英文。协议细节与 Windows UTF-8 示例见 `agent-api-v1.md`。

用户保存的参数预设也通过动态工具发现：`simpai.parameter_profiles.list` 返回当前用户的名称、所属 preset 与选择引用，`simpai.parameter_profiles.get` 读取保存的模型、LoRA 和参数。用户要求先选择时，由 MCP 客户端展示列表并等待用户选择，再把选项中的 `selection` 合并到 `simpai.routes.preview` / `simpai.runs.submit` 请求。列表查询不会生成，也不会改变 Studio 浏览器的会话偏好。详细字段见 `docs/agent-api-v1.md` 的“用户参数预设查询与选择”。

使用问题可调用 `simpai.help.search` 搜索界面帮助、预置包简介和工作流指南，调用 `simpai.help.read` 按需读取；长文档使用返回的 `next_read` 继续。两个工具只需要 `read` 权限，不加载模型或触发生成。帮助内容不能替代当前参数 schema、模型状态或用户授权。协议与示例见 `docs/agent-api-v1.md` 的“按需阅读使用帮助”。

## 从界面开始配置

Studio 底部的“Agent / API 接入”会打开当前服务的 `/api/v1/connect`。启动器 4.0.9 的运行状态页也提供“接入指引”和“复制接入说明”，仅在 Studio 启动且公开发现接口、接入页面均通过探测后显示；旧版或不可访问的服务不显示。服务地址来自 Studio 前端的启动日志，保留部署前缀。

接入页会显示实际服务地址、能力与工具入口，并根据用户填写的**客户端电脑上的 Studio 目录**生成安装命令、配对命令及 JSON / Codex TOML 配置。Python 路径留空时使用该目录下的 `.venv-mcp`；指定其他路径时应选择已有的独立环境。页面只生成文字，不执行安装或配对，也不读取服务器的私密路径或凭据。

内置 VLM Harness 直接调用 Studio 的 ToolRegistry / AgentService，**不经过 MCP**，无需为内置聊天配置适配器。MCP 用于外部 Agent：客户端启动 `tools/studio_mcp.py` 的 Python 子进程，通过 stdio 与它交换工具请求，再由适配器访问 Studio HTTP API。Studio 服务地址不能直接填入客户端的 HTTP MCP URL 字段。具备 HTTP 调用能力的 Agent 也可以直接使用统一 API，无需 MCP。

## 安装与配置

使用支持 Python 3.10 及以上版本的独立环境安装 `tools/requirements-mcp.txt`。不要安装到 Studio 主 Python 环境：MCP SDK 的依赖版本与 Studio 不完全一致。

例如，在仓库根目录用普通 Python 创建独立环境：

```powershell
py -3 -m venv .venv-mcp
.\.venv-mcp\Scripts\python.exe -m pip install --timeout 30 --retries 1 -r tools/requirements-mcp.txt
```

MCP 客户端配置示例，使用前替换两个绝对路径和 Studio 实际服务地址。`SIMPAI_STUDIO_URL` 指向 Studio 页面所在服务，可含反向代理部署前缀，不要包含末尾的 `/api/v1`。

```json
{
  "mcpServers": {
    "simpai": {
      "command": "C:/SimpAI/Studio/.venv-mcp/Scripts/python.exe",
      "args": ["C:/SimpAI/Studio/tools/studio_mcp.py"],
      "env": {"SIMPAI_STUDIO_URL": "http://127.0.0.1:8186"}
    }
  }
}
```

本地模式可直接调用；地址和端口以当前服务为准。适配器的标准输出只用于 MCP 协议，诊断信息发送到标准错误。不应把 access token、refresh token 或浏览器 Cookie 放入 MCP 工具参数。

Codex 使用 TOML 配置，将下列条目加入 `~/.codex/config.toml`，保留其他已有服务。也可在桌面应用的 Settings → MCP servers 中添加 STDIO 服务。目录均填写运行 MCP 客户端的电脑上的绝对路径，不能照抄示例路径：

```toml
[mcp_servers.simpai]
command = "C:/SimpAI/Studio/.venv-mcp/Scripts/python.exe"
args = ["C:/SimpAI/Studio/tools/studio_mcp.py"]

[mcp_servers.simpai.env]
SIMPAI_STUDIO_URL = "http://127.0.0.1:8186"
```

配置后在客户端重新加载 MCP 服务或重新打开会话，检查是否能发现 `simpai` 工具。可用“查询当前 Studio 可用的图像编辑预置，不生成图片”验证只读调用。MCP 客户端只启动适配器，Studio 本身仍需保持运行；连接多用户服务前按下节完成人工配对。

## 多用户配对与续期

### 配对前检查地址

先读取 `/api/v1/auth/discovery` 的 `authentication_required`、`pairing_available`、`transport` 和 `next_step`。当 `next_step=use_local_endpoint` 且 Agent 与 Studio 同机时，读取返回的 `local_endpoint.discovery_url`，核对两次发现的 `service_id` 与模式一致后，通过公布的本机入口继续配对。MCP 适配器会自动完成这一步；不会将原地址的凭据发往未经核对的服务。

当前网页地址的 `pairing_available=false` 不再直接代表无法接入：优先检查是否提供了上述可用入口。没有可用入口时才说明连接条件；不扫描相邻端口、不猜 HTTPS 地址、不读取浏览器 Cookie 或凭据文件。

Studio 网页目前允许 HTTP，外部授权接口另外要求 HTTPS 或真正的回环连接。**“同一台电脑”与“本地模式”是不同概念**：多用户模式下，即使 Agent 与 Studio 同机也需要配对；以局域网 IP 访问同机服务仍不满足现有回环条件。

- 当前 Studio 默认启动会保留选定的局域网监听，同时建立真实回环监听。两个入口使用同一个应用、事件循环、身份和任务状态，无需改为监听所有网卡。
- 优先复用相同端口；如回环端口被占用，由系统分配一个实际可用端口并通过发现接口公布，不使用猜测端口、不终止其他监听者。入口随 Studio 停止而关闭。
- 同机 Agent 可继续从原局域网地址发现服务，适配器会验证并使用服务公布的回环入口。接入页显示和复制实际本机地址；配对浏览器也通过该地址打开。回环请求绕过客户端的全局代理。
- 跨电脑：使用管理员配置的 HTTPS 入口。把 URL 中的 `http` 改成 `https` 不会给 Gradio 开启 TLS，也不能改用 ComfyD 或 Forge 端口。

旧版本只监听局域网 IP 时，仅替换 URL 为 `127.0.0.1` 会失败；需要更新并重启到包含双监听的实现。不要把 `local_endpoint` 当作跨电脑通用地址。没有可用入口时，接入页才显示配置说明并禁用配对命令复制。

使用豆包等外部 Agent 时，优先把接入页生成的配置交给其私密连接层或 MCP 客户端。日志中直接执行 curl/PowerShell 的过程属于 HTTP 调用，尚未使用本适配器管理授权；模型不得接收完整 device/token 响应中的设备密钥或令牌。按任务申请权限，`node.read` 和 `models.download` 不应默认全部申请。

### 执行配对

在与 MCP 客户端相同的操作系统账号下，从人工操作的终端执行一次配对：

```powershell
.\.venv-mcp\Scripts\python.exe tools/studio_mcp.py --base-url "https://your-studio.example/studio" --pair
```

终端只显示浏览器授权页和人类配对码。在 Studio 浏览器验证身份并批准权限后，适配器将凭据保存在私密连接目录。配对需要 HTTPS，真实回环地址允许 HTTP；不要把 `--pair` 放到 MCP 客户端的启动参数中。

默认申请 `read`、`assets.write`、`runs.submit`、`runs.cancel`。需要模型下载时显式申请该 scope，且当前身份必须已有下载权限：

```powershell
.\.venv-mcp\Scripts\python.exe tools/studio_mcp.py --base-url "https://your-studio.example/studio" --pair --scope read --scope assets.write --scope runs.submit --scope runs.cancel --scope models.download
```

可用 `--expected-did` 核对指定的公开 DID，用 `--days 7` 请求较短授权期限。下载权限不代表允许 Agent 自行下载，调用仍应遵守用户当前任务的下载授权。

Windows 使用当前系统用户的 DPAPI 加密，目录为 `%LOCALAPPDATA%/SimpAI/agent-connections`；其他系统使用用户配置目录下的私密文件（目录 0700、文件 0600）。文件名由服务地址生成，不存储在仓库或模型提示词中。撤销授权使用 Studio 浏览器授权管理页。

续期由私密连接层在 access token 到期前完成，线程和进程共享同一连接锁，原子替换整组凭据。刷新前保存处理中标记；请求结果丢失或保存失败后要求重新配对，不重用旧 refresh token。每次调用检查服务、模式、DID、角色和存储范围，变化时停止，不自动改用 local 或 guest。浏览器退出登录不等同撤销已批准的授权。

## 工具与结果

工具目录包含当前 API 注册的操作，实际调用权限由 Studio 再次校验。适配器保留结构化结果和 `isError`，调用者应检查错误码。网络错误不自动重试生成或下载；生成重试必须使用相同 `request_id` 与正文。

生成完成后，`simpai.runs.get` 的每个素材带有 `resource_uri`，例如 `simpai://assets/file%3A...`。MCP 客户端可通过 `resources/read` 获取原始媒体，Bearer 始终由私密连接层使用。资源模板为 `simpai://assets/{asset_id}`；只接受服务器素材 ID，不接受本地文件路径或任意远端 URL。单个资源读取上限为 80 MiB。

上传沿用 API 的 base64 data URL 协议。大型素材的编码应由调用方连接层完成，避免将完整文件的 base64 内容放进模型上下文。

常见连接错误：`pairing_required` 表示需人工配对；`identity_context_changed` 表示服务身份发生变化；`credentials_require_https` 表示连接不满足凭据传输要求；`authorization_scope_required` 表示缺少已批准权限。不要通过更换身份或扩大授权范围自动重试。

## 验证范围

连接层专项覆盖凭据加密、并发续期、刷新响应丢失、身份变化、URL 范围、媒体读取及写请求不自动重试。`tests/agent_mcp_stdio_smoke.py` 使用实际 SDK 子进程与 stdio 协议，验证初始化、动态工具、调用、权限错误和资源读取；HTTP 服务使用独立测试响应，没有启动 Studio 或模型。

当前交付 stdio 适配器。网络型 MCP 服务、MCP 客户端界面中的授权交互及真实远程多用户连接不在本次验收范围内。Studio 原有 HTTP API 的 GPU 验收与这些适配器测试分别记录。

## 2026-10-06：专用浏览器登录

`--pair` 和 `verification_url` 的使用方式不变。浏览器未登录时，授权链接自动进入专用身份登录页；使用已有昵称或身份二维码及口令登录后，自动返回同一个配对请求。登录不会批准权限，仍需要在授权页确认 DID、角色、存储范围、权限和期限。

已有有效浏览器身份时直接显示授权确认；需要另一身份时使用“更换身份”。完整 Studio 仍可由页面链接打开，但配对不再需要加载其画布、图库或 Gradio 前端。登录页只验证已有身份，不提供创建账号、切换运行模式或自动管理员批准。

身份口令、二维码和浏览器 Cookie 不由 MCP 客户端或模型接收；登录端点没有工具或 OpenAPI 注册。浏览器会话使用既有 `aitoken` 契约，HTTPS 设置 Secure，同机回环保留 HTTP 支持，不跨主机复制 Cookie。回环身份仍由多用户服务核实。

开发环境的 `simpleai_base 0.3.57` 已在隔离身份目录中验证专用登录与授权，以及新旧浏览器会话同时有效。另一份 E 盘 `0.3.56` 环境仍复现旧会话失效，不能把该失败归为通过，也不能用专用页绕过身份库检查。当前服务未重启，仍需重启加载 Python 改动及已有身份库修正；实际远程 HTTPS 与外部 Agent 内建浏览器仍未验收。

## 2026-10-06：Windows 小包与独立运行环境

Windows 默认采用本节的独立包方式；上文 `.venv-mcp` 命令保留为源码部署参考。支持 HTTP 的 Agent 直接连接 Agent API，不必部署 MCP；Studio 地址仍不是 HTTP MCP endpoint。Linux／macOS 按系统配置兼容的独立 Python，使用相同 stdio 适配器。

发布两个文件到 `windecay/SimpAI_dev` 的 `libs/mcp` 目录：

- `SimpAI_MCP_win.zip`：适配器、安装脚本、使用说明与固定运行环境 manifest，12,524 字节，约 12.5 KB。
- `SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip`：独立 Python 3.13.13 x64、MCP SDK 2.3.0 与依赖，24,749,235 字节，约 24.7 MB。

本次已构建并完成离线验收，**尚未上传这两个产物，也没有验收魔搭在线下载**。不要把以下预定地址当成已发布确认：

```text
https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/libs/mcp/SimpAI_MCP_win.zip
https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/libs/mcp/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip
```

本地发布文件：`outputs/mcp_windows_release_20261006`，同目录包含 `runtime-manifest.json` 与 `build-report.json`。适配器 SHA256：

```text
b7a63340b79b99b04adb2ed92c34059c2ec668c8f023de821bb25ad27fc0e749
```

运行环境 SHA256：

```text
bb470c93fc6542bd13f610062005a8d00c80665ca25fc0d3f6ad62952c1cce1e
```

### 用户安装与配置

在运行 MCP 客户端的电脑上，将小包解压到新的目录。安装脚本从包内 manifest 的指定魔搭地址下载环境，或接受同一运行环境 ZIP 的离线路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "C:/SimpAI-MCP/setup.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "C:/SimpAI-MCP/setup.ps1" -Archive "C:/Downloads/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip"
```

两条命令任选其一，不需要系统 Python、pip 安装、管理员权限或虚拟环境。英文输出使用 `-Lang en`。Agent 可以按用户的部署要求执行安装，但安装环境不等于用户已经授权 Studio 身份；多用户模式仍由用户在浏览器验证身份并批准权限：

```powershell
& "C:/SimpAI-MCP/runtime/python.exe" "C:/SimpAI-MCP/tools/studio_mcp.py" --base-url "ACTUAL_STUDIO_URL" --pair
```

local 模式不需要上述配对命令。配置使用实际解压目录的绝对路径和发现到的 Studio 地址，保留部署前缀：

```json
{
  "mcpServers": {
    "simpai": {
      "command": "C:/SimpAI-MCP/runtime/python.exe",
      "args": ["C:/SimpAI-MCP/tools/studio_mcp.py"],
      "env": {"SIMPAI_STUDIO_URL": "ACTUAL_STUDIO_URL"}
    }
  }
}
```

不要把 `--pair` 放进 MCP 启动参数，也不覆盖其他 MCP 服务。凭据仍加密保存于当前 Windows 用户的私密连接目录，不在小包／运行环境里，不提供给模型。

接入页的目录字段改为客户端 MCP 适配器目录；Windows 的 Python 留空默认 `runtime/python.exe`，生成 `setup.ps1` 安装命令；英文页面使用 `-Lang en`。其他系统留空仍生成独立 `.venv-mcp/bin/python` 与对应安装命令。显式填写解释器时仍可以使用已有的独立环境，不能选择 Studio 主 Python。

### 构建与安全检查

`tools/build_mcp_windows.py` 从已有的 Windows 嵌入式 Python 和**已经安装好的独立 SDK target**构建，不执行下载或 pip 安装，不复制 Studio `Lib/site-packages`。使用新的输出目录，已有非空目录拒绝覆盖：

```powershell
& "../python_embeded/python.exe" "tools/build_mcp_windows.py" --python-root "../python_embeded" --sdk-root "tmp/mcp-sdk-2.3.0" --output "outputs/new-mcp-release"
```

构建保留 Python 与依赖许可证，排除缓存、测试、文档、安装器及私密文件。manifest 固定地址、SDK、压缩与解压大小、文件数量、SHA256 和依赖版本。运行环境解压后 `_pth` 全部为相对路径，验证成功后才安装到 `runtime`。发布时保持文件名与 manifest 匹配，不替换为 Studio 大包，不关闭校验或自动换来源；不同环境使用新发布版本与新的客户端目录。

安装脚本验证指定魔搭来源、文件大小、SHA256、全部 ZIP 路径和解压总量，拒绝目录穿越、绝对路径、ADS、Windows 保留名、重复路径、符号链接及 reparse point。通过独立暂存目录解压，并验证 Python 架构和 SDK 导入；验证失败清理本次临时内容，不删除离线源 ZIP、不覆盖已有用户目录或不同版本的运行环境。同版本再次运行只验证，不重复下载。网络等待最长 300 秒，解释器验证最长 20 秒。

### 验收与未执行项

WD14 与打包安全专项 `56 passed`；API／授权／MCP／Harness／提示词规范回归 `249 passed`，四条既有第三方弃用告警。五项 Node 配置检查、八项中英文／桌面／移动浏览器检查通过，代理前缀、复制、显式解释器、本地免配对及多用户连接条件仍有效。

`tests/mcp_windows_smoke.py` 使用发布包，在含空格的新目录中完成离线安装、重复安装、`-I` 独立导入及 pywin32 导入。实际导入来自包内 Python，未使用 Studio 的 torch／Gradio／ONNX Runtime。随后使用该解释器和包内适配器完成真实 stdio 握手，动态发现 31 个工具，检查调用、素材读取、权限错误以及 WD14 状态与结构化标签。验收报告位于 `outputs/mcp_windows_release_acceptance_20261006`。

stdio 的 Studio HTTP 响应与 WD14 推理为隔离测试数据，没有启动真实 Studio 或模型。在线下载、魔搭上传、其他操作系统安装、生产多用户配对和各外部 Agent 客户端的实际配置加载尚未执行。曾失败的安装校验与测试配置问题已修正并保留专项用例，详细记录见 `agent-api-v1.md` 新增 WD14 节。当前服务未重启，新增 WD14 HTTP／内置工具尚需加载更新后的 Studio。

最终十文件联合回归为 `370 passed`，85.77 秒，八条既有依赖弃用告警，无剩余测试失败；这是前述专项与回归的联合复测，不累计数量。正式发布目录再次完成离线安装与 stdio 验收；13 个 Python 文件、安装脚本语法以及相关文件空白检查通过。线上发布和其他未验收项目保持不变。

## 2026-10-07：对齐根目录发布地址

用户已将两个压缩包上传至仓库根目录。公开文件元数据确认运行环境为 24,749,235 字节，SHA256 为 `bb470c93fc6542bd13f610062005a8d00c80665ca25fc0d3f6ad62952c1cce1e`；线上初版适配器为 12,524 字节，SHA256 为 `b7a63340b79b99b04adb2ed92c34059c2ec668c8f023de821bb25ad27fc0e749`，均与此前本地文件一致。

初版适配器的 manifest 仍记录 `libs/mcp`，直接把它放到根目录不能修正内置下载地址。现已将构建与安装规则改为根目录，并生成 **1.0.1 修正版小包**；需要用它替换线上 `SimpAI_MCP_win.zip`。运行环境字节与 SHA256 未改变，已上传的运行环境可以继续使用。

新地址：

```text
https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpAI_MCP_win.zip
https://www.modelscope.cn/models/windecay/SimpAI_dev/resolve/master/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip
```

修正版文件位于 `outputs/mcp_windows_release_20261007/SimpAI_MCP_win.zip`，12,631 字节，SHA256：

```text
bd3f0e025500552f18de00b47aec0df1d3797ff035a6f46c13528df8dd61d39b
```

安装脚本同时限定 HTTPS、仓库及完整文件路径，不因发布在根目录就允许其他同仓库压缩包。SHA256、大小、ZIP 路径、临时目录及已安装环境保护继续保留。重复安装同一运行环境无需下载；更换适配器不改变私密授权目录或自动批准身份。

`tests/test_mcp_windows_package.py` 为 `33 passed`，5.38 秒，新增同仓库其他 ZIP、旧目录及查询参数拒绝检查。新包再次通过离线安装、重复安装、SDK 隔离导入、pywin32 与实际 stdio 调用，发现 31 个工具；报告在 `outputs/mcp_windows_root_acceptance_20261007`。运行环境根目录 HEAD 请求返回 200；公开元数据与 HEAD 不是实际下载或在线安装验收。

本次没有下载远端压缩包正文、上传修正版、启动 Studio／GPU 模型、暂存或提交。**线上仍是带旧地址的初版小包，替换前不能报告线上安装通过**。原有 VLM 推理接口的外部开放是另一个待选开发方案，没有在本次修改中实现。

## 2026-10-07：本地 VLM 工具与 1.0.2 小包

用户已上传 1.0.1，公开根目录元数据确认为 12,631 字节、SHA256 `bd3f0e025500552f18de00b47aec0df1d3797ff035a6f46c13528df8dd61d39b`，上一节的待替换状态已解决；本次没有再次上传或下载压缩包正文。

选择 A 后，更新服务的动态目录包含 35 个工具，新增 `simpai.vlm.models/status/analyze/chat`。模型列表／文件状态只读，实际推理需要单独的 `vlm.infer` scope 与既有生成权限。接入页新增未默认勾选的推理权限选项；也可从私密终端显式申请：

```powershell
& "C:/SimpAI-MCP/runtime/python.exe" "C:/SimpAI-MCP/tools/studio_mcp.py" --base-url "ACTUAL_STUDIO_URL" --pair --scope read --scope assets.write --scope runs.submit --scope runs.cancel --scope vlm.infer
```

同一账号在浏览器批准后，MCP 查询模型 ID，以当前身份的图片 asset_ids 调用 analyze；调用 chat 时由调用方提供消息历史。结果为文字或函数调用数据，不修改原图、不自动生成，也不执行客户端声明的函数。内置 Harness 不需要 MCP，同样按权限查询共享工具。

已有 1.0.1 能动态发现新工具，但其 HTTP 读取超时仍为 30 秒。1.0.2 对本地 chat／analyze 使用请求 timeout_seconds＋10 秒的读取期限，服务器参数范围 1～600 秒；其他操作保持 30 秒，网络失败仍不自动重试。客户端自己的 MCP call timeout 也可能需要按任务调整，适配器不能替它更改设置。

1.0.2 小包位于 `outputs/mcp_windows_vlm_release_20261007/SimpAI_MCP_win.zip`，13,136 字节，SHA256：

```text
3613a1c8e5077dbf93aef8f50375dda7c1f4a2d5ecc7c34118a487bea6dd2785
```

运行环境文件名、字节与 SHA256 不变，根目录运行环境无需重新上传。新小包包含读取超时调整、安装失败行号与 Windows 目录移动修正，未执行远端发布。同一运行环境的已有目录继续可验证使用，不改变授权存储位置或审批权限。

1.0.2 验收最初连续三次在 PowerShell Move-Item 处出现访问拒绝，解压与 SDK probe 当时均已通过；没有将它们归为安装通过。改为每次检查绝对路径之后使用 .NET Directory.Move，并在目标不存在时有期限重试，最终离线安装、重复安装、隔离 Python／SDK／pywin32 和实际 stdio 通过。测试使用隔离 HTTP 响应，发现 35 工具，检查本地模型列表与分析调用；报告见 `outputs/mcp_windows_vlm_acceptance_final_20261007`。

API、VLM、授权、MCP、Harness、工作流、WD14、提示词及包安全联合为 `422 passed`，八条既有依赖弃用告警；五项配置与八项中英文桌面／移动浏览器检查通过。未启动真实服务／模型，未完成 GPU、本地模型质量、远程 HTTPS、OpenAI SDK 和第三方 MCP 客户端验收。支持 HTTP／Chat Completions 的 Agent 仍不需要部署 MCP，兼容 Base URL 及参数子集见 `agent-api-v1.md` 新增 A 节。

最后 VLM 相关 40 项再次通过；16 个 Python 文件、安装脚本语法与相关文件空白检查通过，无剩余测试失败。这些是联合测试相关部分的复测，不能另行累计；新包发布与真实客户端／模型的未验收状态不变。
