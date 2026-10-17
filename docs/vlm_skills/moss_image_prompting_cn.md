# MOSS-Image 提示词指引

依据 OpenMOSS/MOSS-Image 官方 `skills/moss-image-prompt-enhancer/SKILL.md`
及 `references/layout.md` 整理（Apache-2.0）。Studio 区域 JSON 编辑器负责
坐标转换；指引本身不代表生成授权。

## 普通描述

普通场景、摄影和插画默认使用自然语言 Caption，细节丰富不等于必须使用 Layout。
描述具体可见内容：主体及数量、外观、动作、环境、构图、媒介、光线、材质、配色和氛围。
保留用户指定的关系、风格和排除项。描述正文默认英文，用户明确指定其他语言时遵从。
画面文字保留原文、标点、大小写和换行；指令中的引用不一定是需要显示的文字。
避免泛化质量词、固定字数要求、虚构活动信息、额外主体、名称、水印或画面文案。
简洁和极简要求应保留。普通扩写只返回最终自然语言描述。

## 区域布局

指定文字位置、多面板或精确主体关系时使用 Layout。结合图文安排阅读顺序、主次和
可读字号。区域表示连贯的可见单元，可以重叠；区域框本身不表示需要绘制边框。
caption 描述外观，不写坐标转换或 JSON 使用说明。

从 Studio 提示词框底部的“区域提示”按钮打开编辑器。编辑稿字段为 `width`、`height`、
`bbox_coord_space="abs"`、`bbox_format="xyxy"`、`summary` 和非空的扁平 `items`。
使用从左上角开始的实际像素坐标。宽高必须与出图尺寸一致，且均为 16 的正整数倍。
`summary.caption` 是可选的全图描述；已有区域时可以留空，不编造总结。
可选 `meta`、`palette` 为字符串数组，
`canvas` 为 `single`、`multi_panel` 或 `collage`。
区域包含 `label`（`object`、`character` 或 `text`）、非空 `caption` 和
`bbox=[左,上,右,下]`。文字区域另需 `text` 原文；`tags`、`palette` 可选，
均为字符串数组。坐标不能越界，不能添加 ID、父子关系、局部坐标或 `elements`。

编辑器将小数边缘向外取整，减去画布中心，导出一行整数坐标的
`abs_centralized` / `yxyx` JSON，并移除宽高。不要自行计算中心坐标，
不要把编辑稿直接用作正向提示词，应通过编辑器应用。
修改已有的最终 Layout 时，保留未要求改变的坐标、角色、文字原文及可选字段，
只返回修订后的最终 JSON。不能把 Layout 改写成普通段落，也不能擅自改变尺寸。
交付前检查主体数量、文字原文、可读字号和空间关系。
正向提示词只包含自然语言 Caption 或转换后的 Layout。
