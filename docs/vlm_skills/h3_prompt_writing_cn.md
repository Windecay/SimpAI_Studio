# H3 提示词写作

## 模式

- `T2VA`：根据文字建立完整视听时间线。
- `I2VA`：从 `<Picture 1>` 作为首帧开始向后发展。
- `FL2VA`：描述首帧到末帧之间连续的变化。
- `L2VA`：推测开场状态，逐渐到达给定末帧。
- `Ref2VA`：处理有序的图片、视频和音频参考素材。

## 固定结构

基础模式按以下顺序输出：

```text
integrated_multimodal_description:

overall_soundscape:

non_diegetic_music:
```

`Ref2VA` 按以下顺序输出：

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

## 时间线

- `[Shot 1]` 先交代风格、构图、主体、环境和关键道具。
- 镜头按时间顺序推进；后续镜头的时间必须递增，并位于目标时长内。
- 每个镜头同时描述可见动作、主体状态、摄影机运动和可听事件。
- 小幅视角或距离变化写成摄影机运动，不要无意义地增加镜头切换。
- 使用明确的运动词，例如 `Push In`、`Pan Left`、`Tracking Shot`、`Static Shot`、`POV`。

## 声音与对白

- 说话或歌唱的声源使用稳定编号，例如 `(S1)`、`(S2)`。
- 只有实际说出的词句放进 `<d>[Language] ...</d>`。
- 用户提供的对白、歌词和画面文字必须保留原文。
- 环境声、动作声和非语言人声写入 `overall_soundscape` 或镜头内声音字段。
- `non_diegetic_music` 只写观众能听见的背景音乐；没有音乐时写 `N/A`。

## 参考素材与输出

- 只使用当前请求中真实存在的 `<Picture N>`、`<Video N>`、`<Audio N>`，不得翻译、重编号或凭空增加。
- `Ref2VA` 在 `summary` 前定义参考素材，在 `retention_analysis` 说明保留和转移内容，并在 `detailed_description` 标明它们出现的位置。
- 字段名、镜头标记、时间戳和媒体 token 保持英文；场景内容使用 `stage.__lang` 指定的语言。
- 只返回完成后的 H3 prompt，不要添加解释、JSON、Markdown 代码块或超出目标时长的时间信息。
