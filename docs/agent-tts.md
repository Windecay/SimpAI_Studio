# Qwen TTS Agent 接口

Qwen TTS 使用独立语音工具，不属于图像或视频 preset。HTTP、外部 MCP 和内置聊天使用同一服务。能力发现中的 `tts_url` 和 `speech` 提供实际入口，经过反向代理时保留部署前缀。

## 发现与调用

| HTTP | 工具 | 用途 |
| --- | --- | --- |
| `GET /api/v1/tts/capabilities` | `simpai.tts.capabilities` | 模式、语言、参数 schema、模型文件状态 |
| `GET /api/v1/tts/voices` | `simpai.tts.voices.list` | 内置 speaker、音色设计描述、当前身份保存的描述；支持搜索和分页 |
| `POST /api/v1/tts/preview` | `simpai.tts.preview` | 检查文本、音色、参考音频、角色和所需模型；不生成 |
| `POST /api/v1/tts/runs` | `simpai.tts.submit` | 提交语音任务，HTTP 202 返回 `run_id` 和 `status_url` |
| `GET /api/v1/runs/{run_id}` | `simpai.runs.get` | 查询语音任务与音频资产 |
| `POST /api/v1/runs/{run_id}/cancel` | `simpai.runs.cancel` | 停止当前身份拥有的语音任务 |

查询能力、音色和预览需要已有 `read` 权限。生成需要 `runs.submit` 和当前身份的生成权限；取消需要 `runs.cancel`。推理专用 API Key 不能调用这些工具。外部 Agent 继续使用统一 API 的授权与配对流程，无须额外申请语音专用权限。

从音色查询结果选择实际 speaker 后，可以预览以下请求。这里的 speaker 仅作参数示例，实际选项以运行时查询为准。

```json
{
  "mode": "custom_voice",
  "text": "欢迎使用语音生成。",
  "speaker": "Ryan",
  "parameters": {
    "language": "Chinese",
    "seed": -1
  }
}
```

检查返回的 `text`、`speaker`、`instruct`、`models` 和 `ready_to_submit`。就绪后在同一正文中加入唯一的 `request_id`，发送到返回的 `submit_url`。网络重试使用同一 ID 和完全相同的正文，不生成新 ID。返回任务成功提交不代表语音已生成；等待原 `status_url` 的 `state=finished`，读取 `assets` 中的音频。

`state=failed` 的任务仍可正常查询，HTTP 状态是 200；任务错误从响应 `data.state` 和 `data.error` 判断。已经结束的任务重试提交仍返回原结果，不重复执行。运行记录目前保存在内存中，结束后保留六小时，Studio 重启后的任务状态恢复尚不支持。音频资产按已有资产寿命策略管理。

## 四种模式

- `custom_voice`：提供 `text` 和查询返回的 `speaker`，或 speaker 类型的 `voice_id`。`instruct` 描述本次语气。
- `voice_design`：提供 `text`，通过 `instruct` 描述音色，或引用 description 类型的 `voice_id`。支持当前身份保存的音色描述；这些描述不是克隆音频或训练模型。仅支持 1.7B。默认启用分段音色保持，因此预览同时检查 VoiceDesign 和 Base 模型；明确关闭 `lock_timbre_with_first_segment` 时只需 VoiceDesign。
- `voice_clone`：`text` 是目标朗读内容；上传参考音频后提供 `ref_audio_asset_id`，`ref_text` 是参考录音的原文。仅明确设置 `parameters.x_vector_only=true` 时可以省略参考原文。
- `dialogue`：使用 `script`，每行格式为 `角色名: 台词`，支持中英文冒号。`roles` 最多四项，每项包含唯一 `name`、当前身份的 `audio_asset_id` 和参考原文 `ref_text`。每行必须绑定已有角色，未知角色或缺少台词会拒绝预览，不会忽略该行继续合成。对话输出合并为一个音频。

`text`／`script` 保存实际要说的话，保留原始语言和标点；`instruct` 保存音色或语气要求。不要把图像提示词、标签、模型说明混入朗读内容。所有 JSON 使用 UTF-8；文字已变成问号时修正调用方编码，不继续生成。

高级参数放在 `parameters`，以 `tts.capabilities` 返回的 schema 为准。`seed=-1` 随机生成；固定 seed 为 0～2147483647。接口不接受任意 `custom_model_path`、服务器音频路径、外部音频 URL 或卸载策略；生成结束沿用释放模型的设置。

## 模型与音频

能力和预览查询只检查本地文件，不导入推理包装器、不加载模型、不发出网络下载。检查覆盖选定模式的模型、共享 tokenizer 和模型目录内的 speech tokenizer。缺文件时返回 `models_missing`，提交返回 `tts_not_ready`。

语音生成执行期间也强制仅使用本地文件，跳过原界面加载器的远端文件检查。等待执行后会重新验证身份、生成权限及配对授权。模型下载需由用户另行批准并在现有模型管理流程完成；当前没有独立 TTS 下载工具。不能拿普通 `simpai.models.download` 的 preset 参数代替 TTS 模型。

参考音频通过现有 `simpai.assets.upload` 上传，只使用当前身份可读的音频 `asset_id`。结果同样返回音频 `asset_id` 和受权限保护的 `content_url`，可以继续作为克隆、对话或其他创作任务的输入。

MCP 动态发现新增工具，不需要更新适配器或 Python 依赖。结果带 `resource_uri`，支持资源的客户端通过 `resources/read` 获取音频；HTTP 客户端使用 `content_url`。`simpai.assets.read` 仍是图片工具，不能用来播放音频。当前没有新增原生 MCP AudioContent 返回，客户端是否能直接播放取决于其资源与音频支持。

## 内置聊天

创作模式的只读工具循环可以发现能力和音色。模型以 `generate_audio` 返回语音任务，由聊天界面预览，再按会话原有的确认／自动生成设置提交；工具循环本身不调用生成写工具。

普通朗读动作：

```json
{
  "type": "generate_audio",
  "tts": {
    "mode": "custom_voice",
    "text": "欢迎使用语音生成。",
    "speaker": "Ryan",
    "parameters": {"language": "Chinese"}
  }
}
```

克隆动作使用 `ref_audio_ref` 引用本次附件的实际音频 ref；对话角色使用 `audio_ref`。模型不得在动作中提供服务器路径或自行构造 asset ID。界面负责把附件 ref 转换成已上传的 asset ID，再请求预览和提交。

任务卡显示朗读文本、音色、进度、停止按钮与完成后的播放器。保存会话后保留原请求及 `run_id`，恢复时继续查询原任务。提交结果丢失时使用已保存的同 ID 同正文重试；不会自动建立另一项语音任务。状态查询中断不会被当作生成失败。
