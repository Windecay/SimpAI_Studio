# Anima 参考生图提示词规范

适用于 Anima-Reference 的两个 theme。沿用 Anima 文生图的 Rust 标签检索，
Agent 负责筛选检索结果、组织场景句子，不能凭记忆自造 tag。

## 标签来源

1. 从原始需求提取人数、动作、姿势、表情、场景等短概念，使用 Studio 现有
   本地检索服务。界面“提示工具”读取同一服务注入的候选；外部 Agent 调用
   `simpai.prompts.tags`，不要另外联网查标签或维护自选标签表。
2. 查询使用短词，如 `sleeping`、`closed eyes`、`on bed`。中文长句没有合适结果时，
   改用对应的简短英文概念检索；翻译后的短语不能直接当作已验证标签。
3. 只选择符合用户需求、类别正确的候选，使用返回的 `prompt_tag`，保留转义。
   返回结果不等于适用；不能把词形相似的作品、角色或画师名当作动作、时间或光线。
4. 除 Anima Base 固定的质量、评分、评级控制词外，场景标签须有本地检索依据。
   不把中文直译、图片文件名或整句下划线拼接结果冒充 tag；不批量复制全部候选。
   查不到的复杂关系、时间和光线用英文 nltags 表达。检索失败时不得声称标签已校验。

## 参考图与 theme

- 主参考图上传到“主体图片(1)”；“参考图片(2)”可留空，用于同一角色的其他视角或服装细节。
  两个不同角色使用一张合照或左右拼图，上传到“主体图片(1)”，不能把“参考图片(2)”当作第二个人。
- “角色参考”（`char`）参考外观，画风可由文字控制；“角色与画风参考”（`cs`）
  同时参考画风。模式由 theme 决定，不能用提示词里的 `char`、`cs` 切换。
- 默认只写目标场景，不重复角色名、发色、眼色、衣服或画师。用户明确要求改变
  某项外观或画风时才写该项；需要身份或画师标签时仍须检索，不能根据图片猜名称。
- 新动作、表情、机位与背景按用户要求描述，避免同时要求保留原姿势。
  这是整幅场景重新生成，不承诺未编辑区域逐像素保留，不使用蒙版。

## 最终提示词

顺序为“质量与评级前缀，人数，检索确认的动作／姿态／表情／场景标签。
2 至 4 句简短英文 nltags”。句子描述人物位置、相互关系、时间、光线等具体要求。
单人和多人不混用人数标签；多人删除 `solo`；闭眼睡觉不同时写睁眼、看镜头。
评分标签保留 `score_7` 等原文，普通标签直接采用 `prompt_tag` 的显示写法。
不要自动添加画师、年代、额外人物或与需求无关的内容。

输入框只写最终英文正文，不写解释、JSON、Markdown、图片编号、尺寸、CFG 或 seed。
API 的 `instruction` 保留原始需求，`prompt` 保存最终正文；其他参数使用独立字段。
SnapRef 由工作流加载，不添加 `<lora:snapref_v2a:...>`。

## 午睡示例

以下是写法示例；实际任务的人数和标签仍按当前检索结果选择，不自动加入午睡内容。
时间和光线写在 nltags 中，不把 `afternoon` 检索出的作品名当作时间标签。

单人，按实际人物选择人数与性别标签：

```text
masterpiece, best quality, score_7, safe, 1girl, solo, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
She is taking an afternoon nap on her side, with her eyes closed and her head resting on a pillow.
A light blanket covers her lower body, and soft window light fills the bedroom.
```

双人，主参考图包含两个角色：

```text
masterpiece, best quality, score_7, safe, 2girls, sleeping, closed eyes, lying, on bed, pillow, blanket, bedroom.
Both characters are taking an afternoon nap side by side, with their eyes closed and their heads resting on separate pillows.
The character on the left lies on her left side, and the character on the right lies on her right side.
Soft window light fills the bedroom.
```

## 检查与调整

检查人数、闭眼、姿势、左右关系和外观要求有无冲突。外部 Agent 使用
`simpai.prompts.validate`，再预览生成条件；不跳过现有 Anima 校验。
检索或校验报错时说明实际状态，不能声称已通过。未匹配的复杂描述改写为句子。
默认负面词保留，不把低质量等负面标签写入正面提示词。

首次使用保留预置默认值。参考图过度限制新动作时可降低“参考保真度”，双参考
使用两项权重调整影响。“参考图像素量（MP）”控制输入细节，输出尺寸另行设置。
参数写进控件或字段；生成后检查画面，规范本身不保证人物和姿态完全一致。
