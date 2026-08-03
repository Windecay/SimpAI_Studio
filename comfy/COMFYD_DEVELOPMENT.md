# Comfyd 开发记录

本文件记录私有入口 `main_comfyd.py` 与上游 `main.py` 的同步情况。新记录按时间追加到文件末尾。

## 2026-08-02

- 合并 ComfyUI 上游 `origin/master` 至 `8084083d`。
- 同步新的控制台与文件日志级别配置，保留 Comfyd 日志前缀和毫秒时间。
- 同步 comfy-aimdo 的 NVML pressure 配置及 DETAIL 日志级别。
- 将 RAM inactive cache 自动上限从 96GB 更新为 128GB。
- 注册上游新增的 `datasets` 路径，同时保留 Comfyd 的可重置模型路径和私有模型目录。
