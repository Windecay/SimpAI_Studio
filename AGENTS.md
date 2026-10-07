# SimpAI Studio Agent 指南

## 创作任务从 API 开始

Studio 已提供统一 Agent API，支持查询预置、模型、参数、路由，上传素材、提交生成任务和读取结果。处理用户的图片、视频、音频创作任务时，优先使用这些接口发现已有能力。完整协议和示例见 [Agent API v1](docs/agent-api-v1.md)。

1. 从用户提供的地址、启动配置或当前服务日志确认 Studio 服务地址，保留反向代理的部署前缀。API 位于 Studio 服务的 `/api/v1`；不要假定固定端口或使用 ComfyD 地址代替。
2. 首次连接请求公开的 `GET /api/v1/auth/discovery`，确认服务标识、运行模式、`pairing_available`、`transport` 和 `next_step`。若 `next_step=use_local_endpoint` 且 Agent 与 Studio 同机，读取服务公布的 `local_endpoint.discovery_url`，核对 `service_id` 一致后使用该入口继续配对。未公布可用入口时才说明连接条件，不扫描端口、不猜测 HTTPS 地址、不读取已有凭据文件。多用户连接通过浏览器配对授权；私密连接层保管和续期凭据，模型不能读取令牌或浏览器 Cookie。
3. 授权后查询返回的 `session_url`，核对身份、权限和存储范围；再请求 `GET /api/v1` 或 `GET /api/v1/capabilities`。优先通过返回的 `tool_index_url` 按 `query` 或 `category` 查询简短工具索引，只读取所选项的 `detail_url` 获取完整参数，再使用返回的 `call_url` 调用。无需在每个任务前完整阅读所有工具参数或 OpenAPI；当前页不足时才使用 `next_url`。旧服务未提供索引时，使用其公布的 `tools_url`，不猜测新接口地址。
4. 通过 `GET /api/v1/presets` 搜索预置，读取 `GET /api/v1/presets/{preset_id}` 的详情；选择主题时带上 `theme`。以返回的输入要求、蒙版要求、提示词标签、参数范围和默认值为准。
5. 上传所需素材，使用返回的 `asset_id`，通过 `POST /api/v1/routes/preview` 检查路由、模型和输入条件。根据返回的缺失条件处理后，重新检查 `ready_to_submit`。
6. 在用户当前请求和已有自动生成设置的授权范围内，通过 `POST /api/v1/runs` 提交任务。为一次任务保留唯一 `request_id`；网络重试时使用同一 ID 和相同正文。
7. 通过返回的 `status_url` 查询任务。成功完成后读取输出素材，再向用户交付结果；提交成功或参数预览通过不代表生成成功。后续编辑可以直接引用输出素材 ID。

为 HTTP 请求设置超时，为任务等待设置期限。预置 ID 和素材 ID 用于 URL 路径时应编码。使用服务返回的 URL，保留部署前缀。不要把固定的模型清单、预置优先级或参数选项复制到 Agent 提示词中，运行时查询服务。

## 开发入口

- [接口文档](docs/agent-api-v1.md)：发现流程、身份要求、调用示例和 MCP 适配方式。
- [HTTP 路由](modules/agent_api.py)：版本化 HTTP 接口与 OpenAPI。
- [共享服务](modules/agent_service.py)：预置、模型、素材、路由和生成任务。
- [请求与工具协议](modules/agent_api_contract.py)：HTTP 与内部 VLM 共用的请求 schema 和工具定义。
- [MCP 配置](docs/agent-mcp.md)：独立 stdio 适配器、浏览器配对、私密续期和媒体资源读取。

本文件供能够读取仓库指导文件的 Agent 使用。外部 Agent 需要通过连接配置获得 Studio 服务地址；内置 VLM 的工具发现与执行由运行时负责。具体接入方式见接口文档的“Agent 如何发现接口”。

需要人工配置外部 Agent 时，从 Studio 底部或启动器的 Studio 运行状态页打开“Agent / API 接入”；公开页面位于实际服务的 `/api/v1/connect`，可生成 HTTP 接入说明和 stdio MCP 配置。内置 Harness 直接调用共享工具，不经过 MCP，也不需要用户安装 MCP 适配器。

## 用户保存的参数预设

用户提到某个 preset 下保存的 A、B 等参数预设时，使用 `simpai.parameter_profiles.list` 查询当前身份的列表，使用 `simpai.parameter_profiles.get` 读取模型、LoRA 堆栈及权重等保存内容。HTTP 入口为 `/api/v1/parameter-profiles` 和 `/api/v1/parameter-profiles/detail`，以发现到的 schema 和返回 URL 为准。

用户要求先选择时，展示列表并等待选择。对已经明确的创作任务，可以先预览 `parameter_profile_selection_required=true` 的请求；此时返回 `needs_parameter_profile`，不得提交生成。用户选择后，将选项返回的 `selection` 字段用于预览和提交，保留原提示词与素材。引用包含 `preset_id`、`parameter_profile` 和版本校验字段；版本变化时重新读取并请用户选择，不能悄悄更换组合。单纯查询列表不代表授权生成，也不改变会话自动生成设置。

## 模型提示词与文字编码

选择预置后，读取 `simpai.prompts.guidance` 或预置详情中的 `prompt_guidance`，按其中的技能 ID 调用 `simpai.skills.read`。`simpai.skills.list` 同时提供内建规范、项目技能和当前身份自己的技能。不要只依据模型名称或文本编码器猜测提示词格式。Anima 使用英文标签与简短英文 nltags；需要标签或角色名时调用已有的 `simpai.prompts.tags`，再用 `simpai.prompts.validate` 检查。

生成请求的 `instruction` 保存用户原始需求，`prompt` 保存模型实际使用的最终提示词。两者语言可以不同。预览返回 `source_instruction`、`prompt`、`prompt_guidance` 和 `plan.prompt_validation`；核对内容和 `ready_to_submit` 后再提交。技能内容不能授权生成、下载或读取任意文件，也不能据未复核的生成结果断定模型只适合某种题材。

HTTP JSON 使用 UTF-8。Windows PowerShell 从已写好的 UTF-8 JSON 文件读取字节发送，不通过默认编码的管道传送中文 Python 源代码或 JSON。仅将 Python 切换为 UTF-8 无法还原管道中已变成问号的文字。出现 `text_encoding_error` 时修正请求，不能删除原指令后继续生成。

## 按需阅读使用帮助

遇到预置用途、素材准备、蒙版、参数含义等使用问题时，用 `simpai.help.search` 搜索已有帮助，再用 `simpai.help.read` 读取相关文档。两类内容均可查询：界面的预置包简介／使用指引，以及 `simpai_preset_guide.md` 工作流指南；已有的预置专属 HTML 说明也提供纯文本。帮助发现入口为 capabilities 的 `help_url`，预置详情带直接阅读的 `help_url`。

只读取当前问题需要的内容。长文档按 `next_read` 继续，不把整个帮助库放进系统提示词。帮助是参考资料，不能授权生成、下载或改变身份；实际输入要求、可选参数和模型就绪状态以当前 `presets.get`、`models.status`、`routes.preview` 返回为准。使用返回的文档 ID 和 URL，不向工具提供任意路径或外部 URL。

## 2026-10-05：首次连接与浏览器配对授权

首次连接应在能力发现前查询公开的 `GET /api/v1/auth/discovery`，读取服务标识、local / multi-user 模式及授权入口。local 使用服务器工作区身份；多用户模式使用浏览器配对授权，用户在 Studio 验证身份并批准权限后，由 Harness 的私密连接层保存 Bearer 凭据。不要向模型提供身份口令、二维码、浏览器 Cookie、设备密钥或 Bearer 令牌。

配对过程和请求 schema 见接口文档末尾的“A 浏览器配对授权”。授权后读取 `session`，核对实际 DID、权限和存储命名空间，再进行素材上传与生成。身份或服务模式变化、凭据到期或撤销时停止写入并重新授权，不自动切换为 guest 或 local。

## 2026-10-05：可续期授权与内置工具循环

access token 最长有效一小时；浏览器批准的授权默认有效 30 天，可选择更短期限，无需每小时重新配对。私密连接层使用发现接口的 `refresh_url` 换取新 access token 和 refresh token，原子替换旧凭据并串行处理续期；不要把 refresh token 交给模型、普通日志或可公开的文件。刷新不延长授权总期限，旧 refresh token 重用会撤销整项授权。授权到期、撤销或身份/目录变化时重新配对，不更换身份继续执行。

内置聊天、创作与向导模式现在可执行有界只读工具循环。实际身份由 HTTP 层创建并在每次调用前重新读取；工具返回的数据用于后续模型轮次。生成、上传与取消仍通过已有交互与确认流程执行，不能因为启用了工具循环就改变用户的自动生成偏好。协议、限制和未验收项目见接口文档末尾。

## 2026-10-06：缺失模型下载

模型状态与路由预览现在返回下载权限、缺失文件的下载进度和下载入口。获得用户下载授权后，可以调用 `simpai.models.download`，或向状态中的 `download_url` 提交所选 `theme`。Bearer 连接必须另外获批 `models.download` scope，且当前身份的已有“模型下载”权限仍允许；生成授权与自动生成偏好均不代表下载授权。

只能下载当前可见预置需要的缺失文件，不向接口提供自定义下载地址、保存路径或身份。模型存储在节点共享目录，素材和结果目录不变。通过返回的 `status_url` 等待 `ready=true`，然后重新预览生成条件；下载请求接受不代表下载完成，也不会自动开始生成。内置只读 Harness 尚不自动执行下载写工具。

## 2026-10-06：内置下载确认与原任务继续

内置创作任务现在可提醒缺失模型，并在原任务卡中提供“确认下载并继续”。此操作由用户点击批准，沿用已有模型下载权限；文件就绪后重新检查原任务，使用原素材、提示词和参数生成并展示输出。它不会打开会话自动生成，也不会允许模型自行执行任意写工具。多轮图片复用继续使用已有自动选图流程，下载期间不重新选图。

下载确认应绑定当前身份、所需文件和预置模型配置。使用模型状态返回的身份与模型摘要执行条件请求；身份、任务或模型配置变化时重新确认。下载失败、取消或超时不自动生成；停止创作任务不取消节点上的共享模型下载。刷新浏览器后重新检查并确认，不自动恢复过期的批准。

## 2026-10-06：拒绝下载后的替代方案

用户拒绝模型下载后，继续寻找无需下载、能保持当前任务与素材要求的兼容方案，不把拒绝下载当作放弃整个任务。使用只读路由预览和实际模型状态验证候选；找到后更新原任务并请用户确认生成，不更改会话默认预置或自动生成设置。拒绝记录保留在当前任务，不能重复要求同一任务下载模型。

只有当前候选都已检查且没有可用方案，才返回无法执行。查询失败、身份变化、时间或数量限制意味着检查未完成，不代表所有方案不可用；停止当前任务则不再寻找替代方案。保留素材角色与明确参数，不能用丢弃图片、改变任务类型或悄悄缩短输出条件来替代原请求。

## 2026-10-06：恢复复用、会话复核与 MCP

聊天与图片复核复用现有 SSE 请求缓存、身份校验和游标恢复；生成任务继续使用保存的 `run_id` 恢复状态查询。临时查询失败不代表生成失败，恢复操作不得重新提交生成。Studio 重启或内存记录过期后的任务恢复仍未实现，下载确认也不能因恢复连接而自动重用。

图片结果复核是会话创作偏好，默认关闭，不改变自动生成设置。开启后每个新完成的图片任务最多自动复核一次，批量结果合并到同次视觉推理，同会话已提交的生成任务完成后再开始。复核只返回建议，不自动再次生成；本地模型可能需要重新加载。关闭选项或停止会话会取消复核等待，刷新后不重复启动未完成的复核。临时网络断连继续恢复同一个 SSE 请求。

MCP 使用 `tools/studio_mcp.py` 的独立 stdio 适配器和独立 Python 依赖环境。模型清单结构不变，工具通过现有 API 动态发现；凭据由私密连接层保存和串行续期，不进入模型上下文。配置与验收范围见 `docs/agent-mcp.md`。

## 2026-10-06：Agent 专用身份登录页

多用户配对链接在浏览器未登录时进入 `/api/v1/auth/login` 专用页，不再要求打开完整 Studio。用户输入已有身份或导入身份二维码，再验证口令；成功后自动返回原配对请求，由用户单独批准 Agent 权限。已登录用户直接进入授权页，也可通过“更换身份”返回专用页。

登录不创建身份、不切换服务模式，也不直接授权 Agent。游客、待批准、被禁用及与请求 DID 不符的身份不能继续授权。完整 Studio 入口保留；回环仍是多用户身份和用户私有存储，不因 `127.0.0.1` 变为 local。登录只由浏览器执行，不能把口令、二维码或 Cookie 交给模型；这些端点不在工具目录或 OpenAPI 中。

回环与局域网 Cookie 分属不同主机，不复制共享。旧 `simpleai_base 0.3.56` 的再次登录使旧会话失效问题仍需已有的 `0.3.57` 修正，专用页不能代替身份库升级。开发环境原生验收及未执行范围见接口文档末尾。

## 2026-10-06：单图文字换装与双图服装迁移

用户只提供一张人物图，并用文字描述新的衣服时，使用 `image_edit`。用户明确要求把另一张图片里的服装迁移到人物图时，使用 `image_object_transfer` 并保留目标图与参考图两种角色；参考图缺失时等待素材，不丢弃该要求继续生成。

API 中显式的合法 `task` 不因原始需求里的关键词被改成其他任务；省略 `task` 时才自动判断。`instruction` 保留用户原文，`prompt` 使用所选模型需要的最终文本；只修改 `prompt` 不会改变自动分类所读取的原始 `instruction`。OneKeyKontext 的 FLUX 最终提示词仍要求英文，原始需求可以是中文。

遇到 `needs_media` 时核对实际任务及所需输入数量，再查看 `requires_upload`、`unbound_inputs` 和 `media_bindings`。已绑定的素材和空上传列表不能证明账号问题；local 模式使用同一服务器工作区，不需要通过 Cookie 更换身份。预览未就绪时不要通过提交生成来试探，也不要为修正分类反复上传、改写原始需求或改为丢失素材要求的任务。

## 2026-10-06：OneKeyKontext 仅保留明确选择的固定功能

OneKeyKontext 是旧的针对性单图功能集合，主题使用预置固定提示词；Clothing 是衣服精修，不是自由换装。不要自动推荐、路由或把它作为拒绝下载后的替代方案。只在用户明确选择该预置和具体功能时使用；API 返回 `automatic_routing=false`、`prompt_mode=preset_fixed` 和主题的 `prompt_policy`。

使用时显式提供功能 `theme`，或用户选择的参数预设中保存的主题；不写任意替代提示词。可以省略 `prompt`，服务使用当前主题模板；提供与模板不一致的 `prompt` 或 `parameters.prompt` 会被拒绝。`instruction` 仍保留用户原始需求，不替代固定模板。原界面手动入口和预置内容保留，其他预置的自由编辑与双图迁移规则不变。

## 2026-10-06：用户工作流与 PNG 元数据

用户提供 Comfy JSON 时，调用 `simpai.workflows.import`，通过 `json_text` 提供 UTF-8 文件正文，不提供服务器路径。单行、多行均可；API graph、`prompt`／`output` 包装和界面工作流按内容识别。用户提供带 Comfy 元数据的 PNG 时，先上传为当前身份的素材，再以 `asset_id` 导入；默认优先提取实际执行的 `prompt`，只有 `workflow` 时读取界面工作流。两份有效元数据均保留，可以明确指定 `metadata_key=workflow`；自动选中的元数据损坏时不得悄悄改用另一份。只有普通生成参数、没有工作流的图片不能据此还原完整图。

使用 `simpai.workflows.get` 分段读取节点，用 `simpai.workflows.node_types` 查询当前后端节点 schema，再用 `simpai.workflows.preview` 检查。默认预览不返回整张 API graph；需要转换内容时显式设置 `include_api_prompt=true`。标准控件可以转换，虚拟节点、子图、特殊序列化、旁路模式等无法安全处理时要求 Comfy 的 API export，不猜控件位置、不省略执行分支。

按用户需求修改命名输入时，调用 `simpai.workflows.update` 并携带当前 `expected_fingerprint`；修改会产生新 `workflow_id`，保留原稿和父版本。改变节点或拓扑时重新导入完整修订 JSON，并指定自己的 `parent_workflow_id`。修改后重新预览，不自动保存成 preset、不下载模型或安装插件。

文件加载节点必须通过 `bindings` 绑定当前身份可读的 `asset_id`，不接受工作流或 PNG 里的文件名作为读取服务器文件的授权。执行只开放服务端已审阅节点；已安装、在帮助里出现或属于管理员身份都不代表任意节点可以执行。缺模型仍沿用已有下载权限与用户确认要求，当前任意工作流没有自定义模型下载接口。

用户确认当前工作流后，用 `simpai.workflows.submit` 携带 ready 预览的 `preview_fingerprint` 和唯一 `request_id`，通过原有共享队列执行。运行中使用返回的 `status_url`／`simpai.runs.get` 查询，成功状态仍是 `finished`。同一工作流可以返回图片、视频及混合结果；缺少任一要求的输出、验证失败或无法确认停止时不能报告成功，也不能重新提交去试探。

HTTP 和 MCP 已提供这些工具。内置 Harness 可以只读检查已导入的工作流，仍不自动执行导入、修改和生成写工具；内置聊天的 JSON 附件入口及工作流确认卡尚未实现。使用新执行路径需要加载更新后的 Studio 和 Comfy 后端；开发时没有自动重启现有服务。具体协议、限制及验证范围见接口文档末尾。

## 2026-10-06：WD14 标签反推与 Windows MCP 独立包

用户要求图片标签反推时，调用 `simpai.prompts.wd14_status` 检查已有模型，再以当前身份可读的图片 `asset_id` 调用 `simpai.prompts.wd14`。返回规范标签、分类、置信度和提示词候选；之后仍需按目标预置读取提示词规范并检查。它使用 CPU，不自动生成，不接受任意路径或外部 URL。标签是候选，不能作为真实身份或年龄证明。

WD14 模型与 CSV 必须均已安装；缺文件返回 `wd14_model_missing`，不触发下载，也不通过旧界面绕过下载权限。当前没有独立 WD14 下载工具。HTTP、MCP 和内置只读 Harness 使用同一工具协议；调用新工具需要加载更新后的 Studio。

支持 HTTP 的 Agent 直接使用 Agent API，无需部署 MCP。Windows MCP 使用 `SimpAI_MCP_win.zip` 小适配器包，解压后运行 `setup.ps1`，从 `windecay/SimpAI_dev` 的指定 `libs/mcp` 文件下载独立运行环境。脚本按包内 manifest 校验 SHA256、大小与解压内容，然后使用 `runtime/python.exe`；不需要系统 Python、虚拟环境或向 Studio 环境安装依赖。其他系统使用兼容的独立 Python 环境。

在线安装需要发布者上传适配器 ZIP 和对应运行环境 ZIP；本次只完成本地构建与离线验收，没有上传魔搭或验收真实在线下载。不要用 Studio 大包代替运行环境，不关闭校验、不自动更换下载来源。MCP 配置仍使用客户端电脑上的绝对路径和实际 Studio 地址；多用户身份仍通过人工浏览器配对，凭据不进入包、模型上下文或普通日志。发布文件和验收范围见 `docs/agent-mcp.md` 末尾。

## 2026-10-07：MCP 包改为仓库根目录发布

两个 ZIP 已由用户上传到 `windecay/SimpAI_dev` 根目录，公开文件元数据中的大小和 SHA256 与此前本地发布文件一致。安装源改为 `resolve/master/SimpAI_MCP_runtime_win_x64_py313_2.3.0.zip`，不再使用 `libs/mcp`。安装脚本只接受这个明确的根目录运行环境文件，不接受同仓库的其他 ZIP。

已上传的初版小包仍含旧地址，需要替换为本地构建的适配器包 1.0.1；运行环境内容与 SHA256 不变，无需重新上传。当前新版小包尚未上传，不能宣称线上安装已经通过。新发布文件和离线验收记录见 `docs/agent-mcp.md` 末尾；本次没有执行远端写入或实际网络下载。

## 2026-10-07：本地 VLM 工具与兼容聊天 API

用户已上传根目录 1.0.1 小包，公开文件元数据与本地 SHA256 一致。用户选择 A：本地 VLM 工具和 Chat Completions 兼容 API 共用推理服务。服务更新后，调用 `simpai.vlm.models` 查询已安装的本地 llama.cpp 模型，使用明确的模型 ID，通过 `simpai.vlm.status` 检查文件与视觉能力；文件就绪不代表真实模型推理已验收。

用户要求看图、整理提示词或复核结果时，可用 `simpai.vlm.analyze`，传入当前身份的图片 `asset_ids` 与 `instruction`。需要多轮文本／图片上下文时用 `simpai.vlm.chat`，由调用方提供有界 `messages`；图片可以使用 `image_asset` 部件或 `image_url` 中的素材 ID。不会读取其他用户会话、任意服务器路径或外部图片 URL，不转发到 Custom／P2P，不修改原图或自动生成。

推理另需 `vlm.infer` scope，并且当前身份的生成权限仍允许。既有 `read`、生成授权和默认配对均不会自动增加该权限；通过接入页的“申请本地 VLM 推理权限”选项或显式 `--scope vlm.infer` 发起配对，由用户在浏览器批准。身份／目录／授权变化、撤销或超时停止输出；同一有效授权的正常续期不让已开始的推理失效。内置 Harness 同样按权限发现这些工具，执行时只调用单次本地模型，不递归启动 Harness。

支持 Chat Completions 的客户端使用 capabilities 返回的 `local_llm.api_base`，入口为实际 Studio 地址下的 `/api/v1/llm`，保留部署前缀。模型列表和聊天入口返回标准形状，没有 Agent 的 `data` 外层；支持普通回复、SSE、调用方历史、图片及函数调用结果。函数仅交回客户端，不由 Studio 执行；完整参数范围、格式限制与取消语义见接口文档末尾。凭据仍由私密连接层管理，不交给模型。

推理与生图共享 GPU 任务互斥，等待不会中止已有生成。CPU 策略沿用已有实现；由于共用模型，CPU 请求也串行取得任务位置，避免在生图期间替换已加载模型。服务不改变界面 VLM 选项，不自动下载或安装插件。原图留在 Studio；本地分析不能保证外部 Agent 不拒绝后续结果，也不能控制其自身文件删除权限。

MCP 动态目录增加到 35 个工具。Windows 1.0.2 小包扩展本地推理读取超时，运行环境 SHA256 不变；1.0.1 仍可发现工具，但较长调用建议使用新包并配置客户端自己的工具超时。开发与隔离协议验收通过，没有重启 Studio、加载真实模型或进行 GPU／第三方客户端验收；具体记录见 `docs/agent-api-v1.md` 与 `docs/agent-mcp.md` 最新章节。

## 2026-10-07：资产生命周期与空间管理

上传素材和结果副本现在有可配置的保留策略，默认未使用 30 天后清理。需要核对占用、期限或空间不足时，调用只读的 `simpai.assets.storage`，或使用 capabilities 返回的 `asset_storage_url`；以当前身份实际返回的策略为准。长期需要的素材应由用户保存到项目中或在管理页选择“保留”，不要假定素材 ID 永久有效。

遇到 `asset_storage_limit`，通过返回的管理页或 capabilities 的 `asset_management_url` 引导用户调整空间；不能自行删除目录、其他身份的素材、模型或生成作品。已有 Bearer 读取／生成权限不能修改清理策略或执行删除，管理操作由当前 Studio 浏览器身份完成。自动清理保护项目／模板／备份引用和手动保留的资产，正在生成时暂停，旧文件获得完整初始保留期。完整行为和验收范围见 `docs/asset-lifecycle.md`。
