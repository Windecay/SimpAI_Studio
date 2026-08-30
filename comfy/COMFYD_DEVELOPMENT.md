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

## 2026-08-30 主项目入口依赖同步

- 将主项目与内置 Comfyd 的运行依赖统一到 `comfyui-frontend-package==1.51.9`、`comfyui-workflow-templates==0.11.50`、`comfy-aimdo==0.4.15` 和 `av>=17.0.0`。
- 同步 `launch.py` 与 `simpleai_update.py` 的固定版本；`entry_with_update.py`、`entry_without_update.py` 和 `launch_with_commit.py` 均继续通过 `launch.py` 使用同一份启动检查。
- 确认 `webui.py` 没有独立依赖版本，Forge Neo 入口仅固定本次未变化的 `comfy-kitchen==0.2.31`。
- 扩充启动契约测试，校验根依赖、内置 Comfyd 依赖、普通启动和独立更新入口保持一致。
