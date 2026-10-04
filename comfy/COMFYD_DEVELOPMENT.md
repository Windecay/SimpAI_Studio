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
