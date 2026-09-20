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
