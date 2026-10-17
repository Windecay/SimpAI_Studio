# Comfyd 开发记录

本文件记录私有入口 `main_comfyd.py` 与上游 `main.py` 的同步情况。新记录按时间追加到文件末尾。

## 2026-08-02

- 合并 ComfyUI 上游 `origin/master` 至 `8084083d`。
- 同步新的控制台与文件日志级别配置，保留 Comfyd 日志前缀和毫秒时间。
- 同步 comfy-aimdo 的 NVML pressure 配置及 DETAIL 日志级别。
- 将 RAM inactive cache 自动上限从 96GB 更新为 128GB。
- 注册上游新增的 `datasets` 路径，同时保留 Comfyd 的可重置模型路径和私有模型目录。

## 2026-08-22

- 合并上游 `origin/master` 的最新 21 个提交至当前分支。
- 同步 `main_comfyd.py` 的 Windows 多 GPU 可见性控制、`--cuda-device all` 和默认设备处理。
- 将私有 `comfy_version.py` 更新为上游 commit `783545f6`。

## 2026-08-23

- 合并上游最新 2 个提交至当前分支。
- 同步视频创建节点的颜色空间、位深选项和 Minimax-H3 特殊 token 支持。
- 将私有 `comfy_version.py` 更新为上游 commit `9db05e0e`。

## 2026-08-30

- 将上游新增 30 个提交合并到暂存区，保留本地私有文件。
- 解决 `comfy/model_management.py` 和 `execution.py` 的合并冲突，保留 cgroup 内存统计、NVML 显存日志和私有历史文件处理。
- 同步 `main_comfyd.py` 的 Windows 默认 CUDA 设备及启动提示。
- 将私有 `comfy_version.py` 更新为上游 commit `8a33128f`。

## 2026-09-08

- 同步上游至 `eb357862`，合并结果保留在暂存区，不创建提交。
- 解决启动参数和路径测试冲突，保留禁用 compiler 时禁用 CUDA graphs 的行为及测试参数恢复。
- 私有入口同步 Windows 默认单 GPU 的中英提示，保留已有私有启动逻辑；更新 `comfy_version.py`。
- 路径测试首次验证出现绝对路径断言不一致；调整测试以匹配既有私有输出目录规范化行为，不改变目录处理。

## 2026-09-11

- 同步上游至 `1d48d9cf`，合并结果保留在暂存区，不创建提交。
- VAE 解码保留本地 CUDA 同步、cuDNN 和缓存处理，同时保留上游模型加载及输出分配时暂停 Memory compiler 的修复。
- 私有入口同步 AMD Windows 4TB 虚拟地址配额和多节点目录的启动耗时统计；启动测试覆盖两个入口。
- 更新 `comfy_version.py`；依赖更新为 `comfy-aimdo==0.5.3` 和 `comfyui-workflow-templates==0.11.59`，未修改 Studio 的 compiler 默认开关。
- 从 Studio 同步 Comfyd 默认关闭 compiler 的参数处理、H3 VAE 分块融合修复，以及已被执行和服务代码引用的 `simpai_prompt_cleanup.py`、`simpai_ws_recovery.py`。

### 2026-09-11 Studio 更新入口依赖同步

- 检查 `90f70dcf`：两份 requirements、Studio 启动检查和独立更新器已统一到 workflow templates `0.11.59`、aimdo `0.5.3`，ComfyUI 版本为 `0.35.0`。
- 修正 Git / ZIP 更新覆盖源码后仍使用旧进程依赖列表的问题：源码同步成功后，以同一 Python 启动目标源码中的更新器 `--mode packages`，读取目标版本的包列表；保留 `-s` 用户包隔离设置。
- 依赖子进程失败返回实际退出码；无法启动或超过 30 分钟返回依赖更新失败状态。预览、跳过依赖和源码同步失败时不启动依赖更新。
- 添加更新入口专项测试，使用模拟进程验证，不安装依赖、不下载源码、不启动 Studio 或 GPU 模型。
- 验证：`python -m pytest -q --tb=short -p no:cacheprovider tests/test_simpleai_update.py tests/test_comfyd_launch_args_contract.py`，40 项测试及 7 项子测试通过。首次测试存在 pytest 缓存目录权限警告，关闭缓存后复测通过。
- 已经运行中的旧更新器无法自动获得这项修复；首次更新到此版本后，应重新打开更新器执行依赖更新。未执行实际联网安装或发布包重新打包。

## 2026-09-20 上游同步与风险检查

- 从官方 `origin/master` 获取并合并至 `96be9a13`（ComfyUI `0.36.0`），保留未提交 merge；Studio 仅暂存本次后端及相关测试、依赖声明，不暂存已有画布工作。
- 同步 Qwen-image 2.1、YuE2、MoGe 3、Marigold V2、通用循环、视频拼接，以及 H3 VAE、Wan attention 和文本编码器优化。Studio 的模型、用户目录、节点包和 blueprints 保持原样。
- 私有入口适配 AssetManager 的启动、扫描、输出登记及退出流程；保留异步模型列表刷新、缓存任务成功状态、提示词清理、cuDNN 策略和 H3 VAE 先纵向后横向融合。
- 将 Studio 的 H3 MLP 分块、人脸检测分批、额外模型目录映射和基础显存预留策略同步回集成仓库。compiler 仍默认关闭，禁用时同步禁用 CUDA graphs，不关闭 DynamicVRAM、aimdo 或 SLA。
- 两份 requirements、启动检查和独立更新器统一为 frontend `1.53.6`、workflow templates `0.11.65`、embedded docs `0.5.12`、Kitchen `0.2.35`、aimdo `0.5.5`；本次未安装依赖，当前嵌入式环境仍为旧版。
- **数据风险**：上游迁移 `0007_record_content_split` 会删除旧资产记录，文件重扫不能恢复手工标签、用户元数据、预览指定、重命名和 job_id 关联。启动前须独立备份数据库；上游的 `.bkp` 不能代替保留独立备份。本次不启动后端，不执行用户数据库迁移。
- **节点风险**：新的 `ModelPatcher.clone()` 向子类传入 `fast_disk`；当前 `ComfyUI-nunchaku/model_patcher/zimage.py` 的 `ZImageModelPatcher.__init__` 不接受此参数，克隆路径需要节点包另行适配。本次未修改节点包。
- **运行风险**：自动 fast-disk 策略改变内存驻留方式，DynamicVRAM 下文本编码器优先放到 GPU；显存峰值、长视频和具体硬件表现需实际工作流验证。静态与 CPU 测试不能替代 GPU 验证。

### 2026-09-20 验证结果

- 本次合入 53 个上游提交；已逐项校验 248 项源/目标后端清单，四项上游删除仅作用于已核对的旧资产查询及批量登记模块。Studio 独有文件及原有暂存边界保持不变。
- 在 Studio checkout、嵌入式 Python 中执行专项测试：启动/依赖/compiler 合同、模型刷新、目录映射、H3 MLP/VAE 和显存预留共 188 项及 11 项子测试通过；临时数据库迁移与事件日志 20 项通过；资产管理/生命周期/缓存输出登记 67 项通过；人脸分批/提示词/后端恢复 52 项通过。合计 327 项及 11 项子测试通过。
- H3 VAE 测试扩展为模拟三档可用内存，覆盖批量解码、不同尺寸与 dtype，并对比先纵后横融合结果；私有入口测试使用 Mock 验证同一 AssetManager 的传递及数据库占用行为，不启动后端。
- 实际 CPU 执行器测试 `tests/test_comfyd_cache_clear_on_finish.py` 在导入阶段失败：`ModuleNotFoundError: No module named 'comfy_aimdo.storage'`。当前 aimdo `0.5.3` 不满足新源码，须升级至声明的 `0.5.5`，并同步 Kitchen 等依赖后重新测试；没有通过伪造依赖使该项测试显示成功。
- 通过抽取当前生产 `ModelPatcher.clone()` 和 Nunchaku 构造方法，无模型复现 `ZImageModelPatcher.__init__() got an unexpected keyword argument 'fast_disk'`；该节点兼容失败未修复。
- 两仓库改动 Python 语法、JSON 与 Git whitespace 检查通过。测试警告为 37 条 Alembic 配置弃用提示和 4 条 Triton 参数弃用提示，未改动依赖环境。
- 未执行 GPU、浏览器、长视频和完整工作流验证；完整执行器/循环测试受旧依赖阻断，环境另缺少 pytest-asyncio、pytest-mock、pytest-aiohttp。资产测试只使用临时或内存数据库，无用户数据库迁移，无模型下载，无依赖安装。
- 首次 GitHub 直连及 HTTP/1.1 重试失败，随后使用系统已配置代理成功获取上游；未修改 Git 全局配置。技能已安装到个人 skills 目录，下次消息可调用。

### 2026-09-20 依赖安装后复测与镜像缺包处理

- 用户安装依赖后，核对嵌入式环境为 aimdo `0.5.5`、Kitchen `0.2.35`、frontend `1.53.6`、embedded docs `0.5.12`；`comfy_aimdo.storage` 可正常导入。workflow templates 仍为 `0.11.59`，不能视为全部依赖已完成更新。
- 查询安装索引：官方 PyPI 已于北京时间 2026-09-20 13:13 发布 workflow templates `0.11.65`；阿里镜像未列出主包，清华镜像虽有主包，但必需子包 `comfyui-workflow-templates-media-assets-02==0.1.2` 的 simple 索引返回 404。官方主包及该子包的版本 JSON 均返回 200，Python 要求均为 `>=3.9`，不是嵌入式 Python 版本不匹配。
- Studio 的 `launch.py` 和 `simpleai_update.py` 增加官方 PyPI 第三次重试；保留首选源、清华源的原顺序，重复源只尝试一次。仍固定指定版本、正常安装完整依赖，不使用 `--no-deps` 或混合额外索引；更新器的失败提示改为显示实际失败的源。
- 新增 `tests/test_package_index_retry.py`，模拟首个源成功、镜像失败后官方源成功、全部失败、重复源与空镜像设置，不执行真实 pip 安装。
- 本次测试：执行器及插件清理 71 项；通用/嵌套循环、执行重入、存储策略 58 项；视频拼接、透明通道、混合精度、预览 34 项；安装/更新/启动合同 56 项及 7 项子测试；数据库占用与迁移互斥 7 项；H3 control 生命周期、Sage patch 选择、文本编码缓存 28 项。合计 254 项及 7 项子测试通过。
- 数据库测试只访问独立临时数据库；导入上游入口时禁用自定义节点和 GPU，并隔离模型路径配置写入及日志配置。没有启动服务、加载 GPU 模型或触及用户数据库。
- 使用真实 CPU `ModelPatcher` 和当前节点类的构造/克隆方法，再次复现 Nunchaku Z-Image 的 `fast_disk` 参数 `TypeError`；构造失败后还会产生缺少 `pinned` 的析构异常。未修改该节点包，该问题仍需单独适配。
- workflow templates 未在本次实际安装，需重新执行更新器的依赖更新；三个 pytest 插件仍缺失，未运行依赖它们的测试。GPU、浏览器、长视频和完整工作流仍未验证；数据库迁移的数据丢失风险不因 CPU 测试通过而消除。所有新增修改仅暂存，不提交。

### 2026-09-20 Nunchaku Z-Image 克隆修复

- 经用户授权修改 Studio 内置 Nunchaku 节点：`ZImageModelPatcher` 接收并传递当前后端新增的 `fast_disk` 参数，保持普通及连续克隆的存储策略；保留 `weight_inplace_update=False` 和原有 `svdq_backup` 共享行为，不修改核心 ModelPatcher 或节点加载流程。
- 新增 `tests/test_nunchaku_zimage_patcher.py`，提取生产构造/克隆方法并使用真实 CPU ModelPatcher，覆盖默认加载、显式和 CLI 存储策略、连续克隆、LoRA 备份、独立 patch 列表及对象清理。修复前测试复现 `fast_disk` 参数错误及缺少 `pinned` 的析构警告；修复后 11 项回归测试通过，相关启动合同和存储测试合计 41 项通过，无上述异常。
- 本机五个主要运行依赖及 workflow templates 八个必需子包共 13 项版本校验通过，包括主包 `0.11.65` 和 `media-assets-02==0.1.2`；Nunchaku 已安装 `1.2.1+cu13.0torch2.9`。本次没有执行依赖安装。
- 仅作 CPU 合同验证，没有导入 Nunchaku CUDA 内核或加载真实量化模型，未验证 GPU 生成、显存表现及完整工作流。三个 pytest 插件仍缺失；测试只有 Triton 弃用提示，未出现新的失败。
- 节点修复和回归测试留在 Studio，集成仓库仅同步本条开发记录；改动加入暂存区，不提交、不重启服务。

## 2026-09-21 上游同步与 Studio 后端更新

- 合并上游至 `c194dd00`（ComfyUI `0.37.0`），保留未提交 merge；同步 Qwen Image 2.1、模型指定 attention、MiniMax Music 3 CUDA graph、fast-disk 参数和 Meshy 7.1 相关公共后端改动。
- 保留 Comfyd 私有入口、默认关闭 Memory compiler、`--disable-offload-from-vram` 不映射为 `--disable-smart-memory`，以及 Studio 私有的 Qwen 缓存和 pinned-memory 行为。
- Studio 后端依赖更新为 workflow templates `0.11.66`，其他 frontend、embedded docs、Kitchen 和 aimdo 版本保持当前声明；未安装依赖、未启动服务、未执行 GPU 或完整工作流验证。

## 2026-09-22 上游同步与 H3 VAE 分块融合

- 合并上游至 `e638023d`，保留未提交 merge；同步 fast-disk、音频解码、H3 VAE 分块融合及相关模型、节点改动。
- H3 VAE 采用上游的 `strip` 方案：下一行垂直融合时读取上一行已经完成横向融合的对应区域，保留官方对交叉重叠区域的处理；更新空间融合回归测试覆盖批量解码和不同尺寸。
- 核心 requirements 移除 `torchaudio`，改由 `comfy.audio` 提供音频重采样；Studio 启动器中 PyTorch 家族安装策略暂保留 `torchaudio`。
- 更新 Studio 嵌入式后端依赖声明和版本标记；未安装依赖、未启动服务、未执行 GPU 或完整工作流验证。

## 2026-10-03 上游同步与 H3 ControlNet 2.0

- 合并官方上游至 `3c169c2c`，新增 78 个提交；保留未提交 merge。同步 H3 ControlNet Union 2.0 的十层注入与 `inpaint_post_norm`，保留 Studio 已有的采样前 VAE 编码、LoRA 和失败清理流程。
- 私有入口采用上游后台扫描异常恢复、未启用资源库时不初始化数据库的策略，以及 `--disable-partner-nodes` 参数；保留默认关闭 compiler、cuDNN benchmark 管理和其他私有运行行为。
- 依赖声明统一为 frontend `1.53.10`、workflow templates `0.11.76`、embedded docs `0.5.13`、Kitchen `0.2.37`、aimdo `0.5.5`；Kitchen 同时核对 Forge 两个入口，不安装依赖。
- Studio 残留 Stability 文件是上游此前删除的旧文件，不恢复到集成仓库；Studio 专属文本缓存测试及节点包保持原样。音频保存同步到 `comfy.audio.resample`，不恢复旧 torchaudio 实现。
- **数据库提醒**：新增 `0008_drop_asset_meta` 会删除 `asset_meta` 表；上游当前元数据使用资产记录中的 JSON 字段。保留此前 `0007` 的数据风险提示，启用资源库或启动新后端前仍需独立备份数据库，本次不迁移用户数据库。

### 2026-10-03 验证与实际环境

- Studio checkout 已逐文件验证 190 项同步清单，包括删除旧 Sora 节点文件及旧 SeedVR2 VAE 测试；三个合并冲突均已解决，两仓库 HEAD 保持不变。

| 专项范围 | 最终结果 |
| --- | --- |
| 启动、依赖、资源库、更新器、Nunchaku 及三个指定 Forge 合同 | 116 passed、21 subtests passed；1 个既有 Forge 失败 |
| H3 ControlNet 2.0、生命周期、MLP、VAE 分块和 Motion | 181 passed |
| 区域重建、人脸跟踪、细化与音视频 CPU API | 282 passed |
| 上游 H3、SeedVR2 与冲突相关模型测试 | 76 passed、14 个 CUDA 专项 skipped |
| 任务线程、数据库锁与临时数据库迁移 | 45 passed |
| Python 语法、JSON、格式 | 194 个 Python、6 份 JSON 通过；Git whitespace 通过，Windows batch 按 CRLF 检查 |

- 合计 700 项及 21 项子测试通过，仅累计各组最后一次结果，不重复计入前期检查或单独复测。
- 修改前出现 36 个 VAE 分块参考算法失败和 2 个 Nunchaku 存储策略断言失败：生产 tiling 与 ModelPatcher 在本次升级前已采用当前行为，旧测试仍假定全部纵向融合优先、构造函数合并 CLI 标志。更新测试参考与断言，保留零误差比较和连续克隆检查；未为通过测试改写这两处生产算法。
- **既有失败**：Forge 的 `test_source_backend_streaming_progress_and_anima_defaults_contract` 仍期待 `livePreview.style.display = "block"`，Git HEAD 中对应页面已使用 `"flex"`。本次只更新该合同的 Kitchen 版本断言，没有修改 Forge 预览界面或掩盖此失败。
- **未通过的进程检查**：`test_db_lock_processes.py` 的三个真实入口用例在 CPU 隔离环境下因 Triton 报 `0 active drivers` 失败，未建立服务。其中一个后续步骤要求完整服务，因此不继续执行；45 项数据库与线程测试不包含这三个用例。它们的失败日志单独保留，不能称为进程级验证通过。
- 上述入口尝试重新生成了开发端忽略文件 `extra_model_paths.yaml`。当前内容与既有用户配置生成结果一致；用户配置修改时间仍为 `2026-08-31T13:19:32`，未改写用户配置或用户数据库。未记录测试前 YAML 哈希，不能承诺与此前内容逐字一致。
- 成功的 CPU 测试在进程内禁用可选 Triton 导入，保留真实 Kitchen eager 后端；区域等短 Python 子进程采用相同隔离。不修改已安装包，不用这些结果代替 GPU 或正常启动验证。

| 包 | 实际已安装 | 本次声明 |
| --- | --- | --- |
| comfyui-frontend-package | 1.53.6 | 1.53.10 |
| comfyui-workflow-templates | 0.11.66 | 0.11.76 |
| comfyui-embedded-docs | 0.5.12 | 0.5.13 |
| comfy-kitchen | 0.2.35 | 0.2.37 |
| comfy-aimdo | 0.5.5 | 0.5.5 |

- 未安装依赖、下载模型、重启服务、执行 GPU/浏览器/长视频对照、同步 E 盘、提交或推送。环境还缺少 pytest-asyncio、pytest-mock、pytest-aiohttp，没有执行依赖它们的测试。原有暂存和未暂存内容保持各自状态；同一区域无法独立暂存的 H3 内容保留原 index。

### 依赖源测速与低速下载换源

- 范围为 Studio `launch.py`、Comfyd 私有入口 `main_comfyd.py`、`simpleai_update.py`，共用 `modules/package_index_router.py`。不修改启动器程序、`build_launcher.py`、上游 `main.py` 或 ComfyUI 核心；没有新增后台联网、遥测或模型下载。仅在原安装入口确实需要安装依赖时检查镜像。
- 候选包含已配置的首选源、清华、华为、腾讯和官方 PyPI，重复 URL 只尝试一次。Huawei 使用 `https://repo.huaweicloud.com/repository/pypi/simple`，Tencent 使用 `https://mirrors.cloud.tencent.com/pypi/simple`。
- 检查目标包的 Simple API，支持 HTML 和 JSON、`Requires-Python`、wheel 平台/Python 标签、sdist 与 yanked 标记；精确指定版本时保留 pip 对 yanked 发布的处理。已知缺包、不兼容或版本过旧的源不参与当前版本安装；检查超时或网络失败的源仍可在测速源之后尝试。
- 同一目标版本的实际文件最多读取 256 KiB 测速，每次网络请求 socket timeout 为 3 秒；索引响应最多读取 8 MiB。索引检查最多三个并发请求，文件测速顺序执行，避免多个测速任务争用用户带宽。兼容版本一致后按观测下载速度排序，不承诺下载全程最快。
- 同一进程缓存索引和文件测速五分钟，失败结果缓存 30 秒；持续低速的源在一分钟内降低排序优先级。更新器按自身所在目录加载并缓存辅助模块，Comfyd 沿用已有的按文件加载方式，不依赖额外 `PYTHONPATH` 设置。
- 依赖解析、下载缓存、完整性检查和安装仍由 pip 负责，不使用 `--no-deps`。监测 pip 原始字节进度：默认 20 秒无进展或持续低速时结束当前 pip 下载进程及其子进程，改用后续源；每个源最多尝试一次。已测得网络本身较慢时，速度阈值下降至观测速度的四分之一，监测窗口适当延长，最多 120 秒。
- pip 输出进入 `Installing collected packages` 或卸载阶段后停止下载超时/低速判定；安装阶段报错不会自动换源重试，避免重复修改已经开始安装的环境。源码构建/metadata 阶段不使用字节速度判定。`COMFY_REQUIREMENTS_INSTALL_TIMEOUT` 保留为 Comfyd 安装前阶段的总时间限制，默认 300 秒；其他两个入口默认 1800 秒，不限制实际安装阶段。
- `SIMPAI_PIP_SLOW_SECONDS` 调整默认监测窗口，`SIMPAI_PIP_MIN_KIBPS` 调整默认速度上限（64 KiB/s）。pip 子进程隔离用户/site 配置的隐式索引以及继承的 `PIP_EXTRA_INDEX_URL`，通过命令指定单个当前源；不改写全局 pip 配置。显式环境中的代理/证书设置仍交给 pip 使用。
- 单包安装会固定选出的目标版本并保留 extras/markers。`-r requirements.txt` 仍由 pip 整体解析，以第一条适用的标准包要求作为初始测速对象，不手写依赖解析器；后续遇到 pip 明确报告的缺失依赖时，针对该依赖重新检查剩余源。已有 PyTorch CUDA、ONNX Runtime nightly、llama.cpp 和 ModelScope wheel 专用渠道保持原样。
- CLI 新增提示中英并列，没有新增 UI 文本或修改 `state.__lang` 的界面行为。
- 修改前专项基线为 57 passed、27 subtests passed，另有一个既有 Forge 失败：`test_forge_launch_skips_cuda_only_installs_in_compatibility_mode` 仍期待 Kitchen `0.2.33`，生产文件已经声明 `0.2.37`。本次不修改该 Forge 测试或生产文件。
- 最终专项验证为 135 passed、27 subtests passed，仍有上述 1 个既有 Forge 失败。覆盖 Simple API/平台/版本筛选、实际文件测速与缓存、环境隔离、三个入口、依赖缺包重新检查、慢网络阈值、真实子进程停滞/持续低速终止/换源与安装阶段保护，以及 llama.cpp/local base 回归。HTTP 测试仅使用自动关闭的本机临时服务器，子进程仅输出模拟下载进度，没有执行 pip 安装。
- 修改的 Python 文件语法检查通过，已跟踪文件及两个新增文件的 Git whitespace 检查通过。未执行互联网镜像测速、真实依赖安装、Studio/Comfyd 启动或重启、GPU/浏览器验证、E 盘同步、暂存、提交或推送；保留其他任务的现有改动。

## 2026-10-07 Studio 私有改动同步与上游合并

- 以用户已提交的 `bb29d84e` 为基准，从 Studio `72a1d0cb` 同步私有依赖安装换源、`/simpai/workflows/validate` 预检查、`simpai_require_all_outputs` 严格提交及 VOSR2 目录映射。1195 个共享文件内容一致；不同的 CI、说明文档、旧 Stability 文件和 Studio 专属测试不作为后端修复复制。
- 合并官方 `origin/master` 从 `3c169c2c` 到 `c9d8a6e6` 的 30 个提交，保留未提交 merge。本次只修改 ComfyUI2，不同步回 Studio、不安装依赖、不启动服务。
- 解决 H3 MLP、Linear 算子、服务端、依赖声明和入口测试的五处冲突。H3 VAE 全文件与本次官方版本一致；此前的 MLP 4096-token 分批属于 Transformer 显存优化，保留分批行为并改用新的 Linear `input_act` 接口。将原有 tensor subclass 绕过 FP16 快速路径的判断保留在 `linear_input_act` 的调度入口。
- Comfyd 私有入口同步工作流 WebSocket 元数据、队列空闲时立即恢复资源扫描、本地节点禁用配置及治理初始化顺序；继续默认关闭 Memory compiler，不改变 offload 参数契约。依赖路由仍由 Studio 的 `modules/package_index_router.py` 提供，不复制 Studio 模块目录到 ComfyUI 核心。

### 新增行为与依赖

- 更多模型采用统一 attention 容器和按模型配置的 attention 后端，新增 Kitchen SOL 配置；Linear 将激活、RMSNorm 和残差融合参数统一到层的调用接口。H3 VAE 空间融合算法未再次改动。
- Qwen 3.5 文本生成调整低显存权重驻留顺序，逐 token 解码时可从主机 embedding 表读取所需行。实际速度、显存和 GPU 内核表现尚未验证。
- 资源扫描使用较短的写事务，空闲时恢复扫描，支持跨磁盘上传；新增本地资产导出、视频元数据和统一 3D 输出。相机信息与相机角度节点、动态输入校验和懒执行调度同步上游。
- 新增 `--disabled-nodes-config`，以及默认关闭的本地签名治理策略；策略文件从本地读取，没有新增联网检查。付费节点同步 ElevenLabs v4、Nano Banana 2.1 等上游变化。
- 源码版本为 ComfyUI `0.39.0`，frontend 从 `1.53.10` 更新为 `1.55.14`，workflow templates 从 `0.11.76` 更新为 `0.11.77`，新增 `cryptography`。embedded docs `0.5.13`、Kitchen `0.2.37`、aimdo `0.5.5` 不变。当前嵌入式环境已安装 cryptography `46.0.5`，frontend/templates 尚为原版本，本次未安装任何包。

### 验证与 Studio 同步前事项

- 在 ComfyUI2 checkout 使用 Studio 嵌入式 Python 验证，CPU 测试进程关闭可选 Triton 导入，保留真实 Kitchen eager 运算。核心、H3/VAE、混合精度、compiler、预启动和工作流校验 170 项通过；治理、资源扫描、资产导出同步逻辑、临时数据库、相机、3D 和任务线程 366 项通过，共 536 项。GGUF 对照中的两个普通权重用例通过，累计 538 项。
- **已复现不兼容**：以本仓库新 `comfy.ops` 加载 Studio 现有 `ComfyUI-GGUF`，Q8_0、Q4_K、Q6_K 三项 CPU 用例均报 `GGMLOps.Linear.forward_ggml_cast_weights() got an unexpected keyword argument 'input_act'`。错误在普通 Linear 调用就会发生；部署前必须适配该节点对新激活/残差参数的处理，不能只忽略参数。本次没有修改 Studio 节点包。
- 六个治理子进程用例在嵌入式 Python 中报 `No module named 'app'` 或 `No module named 'helper'`，属于子解释器搜索路径隔离造成的测试失败，不能算通过；两个用例按自身条件跳过。环境缺少 pytest-asyncio、pytest-aiohttp、pytest-mock，67 个带 asyncio 标记的用例未执行，动态输入异步专项也未执行。
- 私有安装路由、compiler 和 pip 环境处理的四个函数与 Studio AST 一致；实际加载共享路由模块成功，使用模拟安装调用验证不适用的 marker 被跳过、缺包交给路由模块，无联网或 pip 安装。新增 H3 测试比较分批与完整计算结果，并检查分批大小和梯度；新增工作流与线程测试覆盖严格输出、元数据和扫描恢复。
- 以上测试不代表真实 GPU、长视频、浏览器、服务启动或完整工作流通过。Studio 内容和暂存区保持原样，本仓库结果仅暂存，不新增提交或推送。

## 2026-10-15 上游追加同步与 Flux3-image

- 在已有 `c9d8a6e6` 未提交合并和暂存内容上追加官方上游至 `20b46065`；保存原 index、暂存补丁和树快照，不更改 HEAD，不自动提交或同步 Studio。
- 上游新增 Flux3-image 模型检测、文本编码、LoRA 映射和条件节点；同步 MiniMax-H3 LightVAE、LoRA stack、资源预览及资源库启动错误处理。源码版本为 ComfyUI `0.40.0`。
- 处理 H3 MLP、LoRA、执行器和 requirements 四处冲突：保留 H3 4096-token 分批并使用当前 Linear wrapper；保留私有缓存清理和安静日志；关闭资源库时使用上游 NoAssets。
- 私有入口同步预览目录、资源库启动错误分类、依赖检查和新版 aimdo 初始化；保留 compiler 默认关闭、CUDA graphs 随 compiler 禁用及现有私有启动流程。
- 依赖声明更新为 frontend `1.55.17`、workflow templates `0.11.82`、embedded docs `0.5.14`、aimdo `0.5.6`；Kitchen 仍为 `0.2.37`，移除上游不再使用的 cryptography，保留私有依赖。本次不安装依赖、不下载模型、不启动服务或执行用户数据库迁移。

### 验证与未验证范围

- 本次追加 44 个上游提交。更新前比较 718 个共享 Python/requirements 文件，其中 67 处内容差异已检查分类；关键私有模型管理、路径和 `simpai_*.py` 辅助模块一致，Studio 的旧 attention/入口/服务代码不覆盖当前新接口。Studio index 及本次比较的差异文件哈希保持不变。
- Flux3 检测、打包权重宽度、6 个小尺寸 CPU 前向组合、条件预处理复用、布局提示词、LoRA 配置，以及 H3 MLP、compiler、私有数据库提示、预启动和线程专项共 77 项通过。
- 资源预览、数据库启动错误、独立临时数据库迁移、NoAssets 与 H3 VAE 专项共 29 项通过、5 项按平台条件跳过；两组合计 106 passed、5 skipped。194 个改动 Python 文件、1 份 JSON 和 requirements 语法检查通过。
- 首次 CPU 测试收集时 Kitchen 的 CUDA 能力探测报 `Invalid device id`；随后仅在测试进程禁用 CUDA 探测及可选 Triton 导入，保留真实 Kitchen CPU 运算。未修改生产探测代码或已安装包，CPU 结果不能证明正常 GPU 启动或真实 Flux3 模型生成已通过。
- 当前实际环境为 aimdo `0.5.5`、Kitchen `0.2.37`、frontend `1.53.10`、workflow templates `0.11.76`、embedded docs `0.5.13`；未安装新的依赖声明。pytest-asyncio、pytest-mock、pytest-aiohttp 仍缺失，没有执行依赖这些插件的专项。
- 未执行 Studio 部署、GPU、浏览器、真实模型、长视频或完整工作流验证；用户数据库未迁移。结果仅暂存，不提交、不推送，原暂存内容及未提交合并继续保留。

### Studio 开发端同步

- 按暂存清单核对 202 项后端运行、迁移、测试和说明文件，将其中 201 项内容更新复制到 Studio 的 `comfy` 目录。排除源仓库的 CI、AGENTS 和 Git 配置，不复制模型、预置、用户目录或 custom_nodes。
- Studio 根 requirements、启动器和更新器声明同步 frontend `1.55.17`、workflow templates `0.11.82`、embedded docs `0.5.14`、aimdo `0.5.6`；后端 requirements 同步源版本。保留 Studio 推理 Key 加密所需的 cryptography。
- Kitchen 仍为 `0.2.37`，两份 requirements、Studio 启动器、更新器与 Forge 两个入口均已核对，不为 Forge 添加 Comfy 前端或 aimdo 依赖。compiler 默认关闭及 offload 参数契约不变。
- 调整 Studio 的启动/依赖与资源库 AST 合同以匹配当前入口接口；不修改 Forge 预览界面。修改前基线为 86 passed、33 subtests passed，另有一个既有 Forge 合同失败；未因这次同步更改该 Forge 行为。
- 此阶段仅同步代码和依赖声明，不安装依赖、不启动或重启 Studio/Comfyd，不执行用户数据库迁移，不提交或推送。

### Studio 验证结果

- 在 Studio checkout 执行启动、依赖、更新器、资源库和三个指定 Forge 合同，86 passed、33 subtests passed，另有 1 个修改前已存在的 Forge 合同失败；模型/私有入口专项 77 passed，资源预览/临时数据库/H3 VAE 专项 29 passed、5 skipped。合计 192 passed、33 subtests passed、5 skipped，不重复累计基线和单独诊断。
- 既有失败为 `test_source_backend_streaming_progress_and_anima_defaults_contract`：测试期待 `elements.livePreview.style.display = "block"`，现有页面使用 `"flex"`。Forge 两个依赖入口、该合同文件和预览界面未修改，未把此失败计为通过。
- 202 项后端文件与源内容逐一一致；198 个 Python 文件、1 份 JSON、1 份 TOML 及依赖声明校验通过。两仓库 HEAD 不变，源仓库继续保留未提交合并；本次文件按明确清单暂存。
- 当前实际安装的 frontend/templates/docs/aimdo 仍为 `1.53.10` / `0.11.76` / `0.5.13` / `0.5.5`，Kitchen 为 `0.2.37`；新版本仅更新声明。测试使用 CPU 隔离，不代表真实 Flux3 权重、GPU、浏览器、长视频或完整工作流已通过。

### 2026-10-16 启动数据库产物忽略规则

- Studio 根 `.gitignore` 增加 `comfy/user` 下的 `*.db-wal`、`*.db-shm` 和 `*.db.bkp`，覆盖资源库运行状态与迁移备份文件，避免提交本机数据库数据。
- 规则不扩大到整个用户目录或全局备份后缀，保留工作流 JSON 和 Python 文件的正常跟踪；不删除或移动数据库、WAL、SHM 及备份文件。
- 本次仅调整忽略规则和开发记录，不改变 PE/MTP 开关、现有预置或放大流程，不安装依赖或下载模型。

### PE 与像素空间二采核查

- 忽略规则通过 7 项正反路径检查，SQLite 伴生文件被忽略，工作流 JSON、Python 和目录外 `.bkp` 仍可见。没有读取或删除用户数据库内容。
- 官方 PE-T2I/PE-I2I 当前公开索引各含 760 个张量，未包含 MTP/nextn 头；现有 PE 原生与 GGUF 路径显式关闭 MTP，目录筛选也排除带 MTP 标记的文件。GGUF 节点当前禁止媒体输入与 MTP 组合，不将普通 Qwen3.5 支持等同于现有 PE 已启用。
- H3 Upscale 已有 RTX 像素放大、视频 VAE 编码和 H3 重绘路径。LightVAE 解码后经 RTX 放大再编码可作为二采对照方案，需保留原编码器、音频和视频时间布局；本次不实现或切换该流程。
- PE/RTX 路径 CPU/Mock 专项为 105 passed、2 failed。失败分别是 PE 缓存测试 Mock 仍接受 3 参数而生产接口已为 4 参数，以及 H3 保存测试期待 CRF 18、当前 HEAD 工作流为 16。未修改这些测试或工作流，也未将失败计为通过；未执行模型下载或 GPU 测速。

## 2026-10-16 上游追加同步至 ComfyUI 0.41.0

- 官方 `origin/master` 从 `20b46065` 更新至 `bdc63e72`，新增 7 个提交；在原有未提交 merge 上继续合并，没有产生新的文件冲突，HEAD 仍为 `bb29d84e`。保存更新前的 index、树、合并记录和未暂存文档，保留此前 210 项暂存内容。
- 源码版本更新为 ComfyUI `0.41.0`，`comfy_version.py` 标记为 `bdc63e72`。同步 FLUX 3 Image 节点显示名称与量化格式说明；节点 ID 和工作流接口不变，新增专项检查布局节点的显示名称和原有 ID。
- workflow templates 声明从 `0.11.82` 更新为 `0.11.86`，frontend `1.55.17`、embedded docs `0.5.14`、Kitchen `0.2.37`、aimdo `0.5.6` 不变。当前环境已安装模板仍为 `0.11.82`，本次仅更新依赖声明，不执行安装。
- 这 7 个提交未修改上游 `main.py`，因此 `main_comfyd.py` 保持原样；继续默认关闭 Memory compiler、同时关闭 CUDA graphs，不改变 DynamicVRAM、aimdo、SLA 或 offload 参数策略。
- 按仓库“不新增联网请求”要求，不纳入新增 Krea 3 云端图片上传和生成节点；`comfy_api_nodes/apis/krea.py` 与 `comfy_api_nodes/nodes_krea.py` 保持本次更新前内容。该项属于明确排除的上游差异，不能宣称完整同步了该云端功能。
- 更新前比较 903 个共享文件，运行代码一致，仅 `.coderabbit.yaml` 不同；Studio 后续自定义节点改动不复制到核心仓库。本次不写入 Studio，保留其已有两份测试文件修改和暂存区。
- 从 ComfyUI2 源目录以 CPU 隔离执行 Flux3、H3 模型与 VAE、混合精度、设备管理、私有启动入口、预启动、任务线程和工作流校验，共 69 passed，无失败。测试关闭可选 Triton 和 CUDA 探测，不代表 GPU、真实权重、浏览器、长视频或完整服务已通过。
- 开发记录只在文档末尾追加；原有 41 行未暂存记录保持未暂存，本次记录单独暂存。未同步 Studio、安装依赖、下载模型、启动或重启服务、执行用户数据库迁移、创建提交或推送。
- 最终静态检查覆盖 195 个改动 Python 文件、1 份 JSON、pyproject 版本、requirements 语法和 Git whitespace，全部通过；原有无关 index 条目、Studio HEAD、暂存区及已比较文件哈希保持不变。

## 2026-10-16 提前集成 MOSS-Image PR 17095 并同步 Studio

- 按用户请求获取官方仓库 PR `#17095`，集成 `76d935d15c0f0cb577db7db5ab2d9b561290af30` 的 3 个提交、9 个文件。检查时 PR 尚未合入官方 master；基于此前 `bdc63e72` 的暂存树继续合并，无文件冲突、无新增提交，两仓库 HEAD 保持原样。
- 新增原生 MOSS-Image DiT 检测与加载、Qwen3.5-9B 最后一层文本条件、独立及融合 QKV 权重、融合权重的 LoRA 映射、模型预取和布局提示词节点。布局节点支持按对象、角色和文字描述建立中心原点像素坐标；没有新增依赖、联网逻辑或模型下载。
- 后端仍为 ComfyUI `0.41.0`，私有版本标记改为 PR 实际代码 `76d935d1`，不将其描述为官方已发布版本。`main.py` 和 `main_comfyd.py` 无需调整，compiler 默认关闭、CUDA graphs 禁用和现有 offload 策略保持不变；此前排除的 Krea 3 云端功能继续不纳入。
- 对比 903 个共享文件后，按暂存内容检查 207 个后端文件，只复制其中 19 个变化文件到 Studio 开发端，同时包含上次尚未部署的 0.41.0 更新。同步基于 index 版本，不将源文档中原有 41 行未暂存记录复制或一起暂存。
- Studio 两份 requirements、启动器、更新器与对应合同对齐 workflow templates `0.11.86`。frontend `1.55.17`、docs `0.5.14`、Kitchen `0.2.37`、aimdo `0.5.6` 不变，Kitchen 六处运行声明均核对；模板实际安装版本仍为 `0.11.82`，本次未安装依赖。
- 新增 19 项 MOSS 专项，覆盖打包权重检测、FP32/BF16 小模型前向、QKV 等价性、训练梯度、replace patch、LoRA、文本编码路由、提示词模板、布局坐标和节点注册。源仓库与 Studio 各 88 项 CPU 测试通过；新增 LoRA 用例首次因测试对象缺少 model_config 失败，调整测试对象后全部通过，未因此修改生产代码。
- Studio 同步前后专项均为 85 passed、26 subtests passed、1 failed。唯一失败仍为既有 Forge 预览合同期待 display 为 block、页面实际为 flex，没有新增失败；该页面与合同文件保持原样。
- 保留已有 moss-image 自定义节点、MOSS 预置、工作流和模型文件。现有预置继续使用原实现，不能据此视为测试了 PR；原生路径使用标准 UNETLoader、CLIPLoader 的 moss_image 类型和相应 FLUX.2 VAE，布局提示词节点为 MOSSImageLayoutPrompt。两种实现未自动替换或进行真实权重输出对比。
- 本次只同步开发代码和依赖声明，未安装包、下载模型、重启服务、执行用户数据库迁移、同步 E 盘应用、创建提交或推送。CPU 测试不能代替真实 GPU、量化权重、完整工作流或界面验收，加载新代码需要之后重新加载后端。

## 2026-10-17 官方优化更新与 Studio 同步

- 从干净的 `9aa838053` 合并官方 `origin/master` 至 `4d7b594592c0c4ff1b95c6dbb5783a308797bd90`，新增 5 个提交，保留未提交 merge；源码版本仍为 `0.41.0`，私有版本标记更新为 `4d7b59459`。Git 直连失败后，通过当前 Windows 系统代理完成拉取，没有修改全局 Git 配置。
- Moss 改用上游融合 SITU 激活与 INT8 线性计算；Qwen 3.x 更新小矩阵执行、固定及 INT8 KV cache、延迟提交的 DeltaNet 状态和 MTP 回退处理。Quiver 仅同步退役 Arrow 1.x 选项的移除，没有新增联网功能。
- 处理 Moss 文件和 Linear 调度的两处冲突，保留 GGUF/tensor subclass 的反量化路径，并保留 xformers、cuDNN、H3 分批、VAE、路径和任务服务的已有私有修正。上游本次未修改 `main.py`，私有入口保持原样；compiler 默认关闭及 CUDA graphs、DynamicVRAM、aimdo、offload 策略不变。
- Kitchen 声明升至 `0.2.38`；frontend `1.55.17`、workflow templates `0.11.86`、embedded docs `0.5.14`、aimdo `0.5.6` 不变。同步后端与 Studio 两份 requirements、启动器、更新器及对应合同；Forge 共用环境的两个启动入口只对齐同一个 Kitchen 版本，避免之后启动时降级。
- 更新前审计 1,283 个核心文件候选，共享运行代码一致，保留两边不同的 CI、说明、工作流文件和 Studio 独有内容。Studio 原有 24 项暂存及其他开发改动按 index 条目和文件哈希保护；不复制 custom_nodes、模型、素材、用户目录或 Studio 预置。

### 验证

- 更新前：源仓库核心与私有启动 CPU 基线 `67 passed`；Studio 启动、依赖与资源库基线 `87 passed, 26 subtests passed`。
- 使用官方 PyPI Kitchen `0.2.38` wheel 解压出的独立测试目录验证，不覆盖嵌入式 Python 的已安装包。wheel SHA256 为 `420364e48f5cad46c20948c668fe3befd8692a5f7baf25e8ddbd434ee3806e9c`。
- 合并后源仓库与 Studio 核心各 `90 passed`，覆盖 Moss、Qwen 解码/MTP/attention 配置、H3、compiler、私有启动和工作流预检查。Studio 集成检查为 `121 passed, 26 subtests passed, 6 skipped`，包括依赖、图像输入、Moss attention 和指定 Forge 合同；其中 6 项 CUDA 分支由 CPU 隔离主动跳过。
- 另外在真实 CUDA 环境执行 GGUF Q8_0/Q4_K/Q6_K 的 GELU/SITU 激活、残差与 FP16 调度检查，`14 passed`，覆盖前述跳过项。该检查使用小张量，不能代替真实 GGUF 模型的完整工作流验收。
- 使用 Studio 参数映射和当前保存的 Moss 工作流，在独立进程中以官方 INT8 DiT、W4A8 编码器、Flux2 VAE 完成两组 1024×1024、50 步、seed 42 的实际出图。PyTorch 与 Kitchen attention 均返回有限 latent 和非空图像；累计 8,300 次 SITU 调用全部采用融合路径，Kitchen 例的 4,350 次 attention 调用全部进入对应 CUDA 内核。
- 两组采样分别约 20.533 秒和 14.707 秒；两者都使用本次更新后的源码，只对比 attention 设置，不能据此宣称上游更新前后的加速比例。图片已人工检查，保留中文便签和厨房场景；这不是广泛画质或文字准确率评测。