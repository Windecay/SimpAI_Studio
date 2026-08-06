# H3 Ref2VA 专用规则

`Ref2VA` 用于把有序的图片、视频和音频参考素材组合成一段视频。它不使用基础模式的三个字段，必须严格输出以下六个字段，顺序固定：

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

## 参考素材编号

图片、视频、音频分别独立编号，只使用当前请求真实存在的 token：

- `<Subject N>`：可在多个镜头复用的角色、物体、环境或风格定义。
- `<Picture N>`：具体图片、外观、构图或首尾状态锚点。
- `<Video N>`：完整视频、运动方式、剪辑节奏或镜头结构参考。
- `<Audio N>`：独立音频、声音质感、对白或节奏参考。

不要翻译、改编号、删除或凭空增加这些 token。`subject_definitions` 在 `summary` 前定义可复用主体；每个主体写真实可见的外观或特征，不要用空泛的“完整保留”说明替代描述。

## 六个字段

- `summary` 使用适用的任务类型前缀：`keyframe completion`、`reference generation`、`video editing`、`video continuation`、`audio reuse`、`audio reference`。前缀后写简短任务概述，不要把主体时间线缩写成一句剧情梗概。
- `retention_analysis` 逐项说明每个参考的作用。视觉参考只使用 `fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`；音频参考只使用 `fully_copy`、`partially_copy`、`reference`、`weak_reference`。同时写清楚保留、转移或弱参考的具体属性。
- `detailed_description` 是主要制作说明。先写整体风格、画面基调和构图，再从 `[Shot 1]` 开始写按时间递增的可见动作、主体状态、摄影机运动和声音。把相关 `<Picture N>`、`<Video N>`、`<Audio N>` 放在它们实际影响的镜头中。
- `overall_soundscape` 只写画面内环境声、动作声、对白和被参考音频复制或转移的声音。
- `non_diegetic_music` 只写观众能听见但画面内没有声源的背景音乐，没有音乐写 `N/A`。

## 主体、说话人与时间线

主体定义是外观信息的唯一完整来源；镜头中直接使用相关图片 token，不要在每个镜头重复整段身份保护声明。除非用户明确说明，不要因为服装、性别、风格或场景相似就把不同图片合并成同一身份。

说话或歌唱的人物要保持 `<Subject N> (S1)`、`<Subject N> (S2)` 的稳定对应关系。只有实际说出的词句放在 `<d>[Language] ...</d>` 中；跨镜头持续的对白使用 `<scenetrans>`，视频结束时被截断的对白使用 `<cutoff>`。每个镜头按可见动作、`Camera:`、`Dialogue and visible text:`、`Synchronized sound:` 的顺序书写，时间不能超过目标时长。

