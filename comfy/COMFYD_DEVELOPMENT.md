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
