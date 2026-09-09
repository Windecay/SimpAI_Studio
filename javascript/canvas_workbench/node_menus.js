(function () {
    'use strict';

    function createNodeMenuTools(context) {
        const scope = context || {};
        const t = scope.t || ((en, cn) => cn || en);
        const call = (name, fallback, ...args) => typeof scope[name] === 'function'
            ? scope[name](...args)
            : fallback;

        function buildAddNodeContextMenuItems(targetWorld, includeViewActions) {
            const items = [
                {
                    label: t('Presets', '预设'),
                    searchOnly: true,
                    children: (call('getPresetCatalog', [], []) || []).map(entry => ({
                        label: entry.display_name || entry.name,
                        icon: 'fa-square-plus',
                        search: [entry.name, entry.display_name, entry.backend_engine, entry.task_method, entry.engine_type,
                            ...(Array.isArray(entry.themes) ? entry.themes.map(value => call('localizeCanvasLabel', value, value)) : [])],
                        action: async () => {
                            const resolved = await call('resolvePresetCatalogEntry', null, entry.name);
                            if (!resolved) {
                                call('showToast', null, t('Preset definition is not ready. Please reopen the preset list.', 'Preset 定义尚未加载，请重新打开 Preset 列表。'));
                                return;
                            }
                            call('addPresetNode', null, resolved, targetWorld);
                        }
                    }))
                },
                {
                    label: t('Browser / Import', '浏览器 / 导入'),
                    icon: 'fa-photo-film',
                    search: 'browser import media gallery album local file transfer station 浏览器 导入 媒体 相册 文件 本地 中转站',
                    children: [
                        { label: t('Add Media Browser node', '添加媒体浏览器节点'), icon: 'fa-photo-film', search: 'media browser album gallery output browse 添加 媒体浏览器 相册 浏览 输出', action: () => call('addMediaBrowserNode', null, targetWorld) },
                        { label: t('Add Batch Any node', '添加 Batch Any 节点'), icon: 'fa-layer-group', search: 'batch any images videos audio queue preset 批量 素材 图片 视频 音频 队列', action: () => call('addBatchAnyNode', null, targetWorld) },
                        { label: t('Import all transfer-station images', '导入中转站全部图片'), icon: 'fa-images', search: 'import transfer station images all 添加 导入 中转站 全部 图片', action: () => call('importSelectedTransferAt', null, targetWorld) },
                        { label: t('Import image / video / audio', '导入图片 / 视频 / 音频'), icon: 'fa-folder-open', search: 'import image video audio file local upload 添加 导入 图片 视频 音频 文件 本地 上传', action: () => call('openImageFilePicker', null, targetWorld) }
                    ]
                },
                {
                    label: t('Generate', '生成'),
                    icon: 'fa-square-plus',
                    search: 'generate preset workflow output result 生成 出图 预设 工作流 输出 结果',
                    children: [
                        { label: t('Add preset node', '添加预设节点'), icon: 'fa-square-plus', search: 'preset workflow generate model 添加 预设 工作流 生成 模型', action: () => call('openPresetPalette', null, targetWorld) },
                        { label: t('Add output node', '添加输出节点'), icon: 'fa-circle-dot', search: 'output result generated target 添加 输出 结果 生成 目标', action: () => call('addManualOutputNode', null, targetWorld) }
                    ]
                },
                {
                    label: t('Text / Prompt', '文本 / 提示词'),
                    icon: 'fa-font',
                    search: 'text prompt translation translate wildcards tag cart 文本 提示词 翻译 通配符 标签',
                    children: [
                        { label: t('Add Style Selector node', '添加风格选择器节点'), icon: 'fa-palette', search: 'style selector transfer styletransfer prompt 添加 风格 选择器 转绘 风格转换', action: () => call('addStyleSelectorNode', null, targetWorld) },
                        { label: t('Add text node', '添加文本节点'), icon: 'fa-font', search: 'text prompt positive negative 添加 文本 提示词 正向 负向', action: () => call('addTextNode', null, targetWorld) },
                        { label: t('Add multi-text merge node', '添加多文本合并节点'), icon: 'fa-code-merge', search: 'text merge join concatenate separator prompt 添加 多文本 合并 拼接 分隔符 提示词', action: () => call('addTextMergeNode', null, targetWorld) },
                        { label: t('Add Wildcards Helper node', '添加通配符助手节点'), icon: 'fa-dice', search: 'wildcards wildcard random helper prompt 添加 通配符 随机 助手 提示词', action: () => call('addWildcardsHelperNode', null, targetWorld) },
                        { label: t('Add translation node', '添加翻译节点'), icon: 'fa-language', search: 'translation translate translator language 添加 翻译 语言', action: () => call('addTranslationNode', null, targetWorld) },
                        { label: t('Add Tag Cart node', '添加标签选择器节点'), icon: 'sai-tag-cart-glyph', search: 'tag cart tags prompt 添加 标签 购物车 提示词 标签选择器', action: () => call('addTagCartNode', null, targetWorld) }
                    ]
                },
                {
                    label: t('Vision / Media', '视觉 / 媒体'),
                    icon: 'fa-eye',
                    search: 'vision media image video mask compare timeline vlm wd14 视觉 媒体 图片 视频 遮罩 蒙版 对比 时间线',
                    children: [
                        { label: t('Add WD14 node', '添加 WD14 节点'), icon: 'sai-wd14-glyph', search: 'wd14 tagger interrogate image tags reverse prompt 添加 反推 打标 标签 图片', action: () => call('addWd14Node', null, targetWorld) },
                        { label: t('Add VLM node', '添加 VLM 节点'), icon: 'sai-vlm-glyph', search: 'vlm vision language model chat multimodal 添加 视觉模型 多模态 聊天', action: () => call('addVlmNode', null, targetWorld) },
                        { label: t('Add Advanced Masking node', '添加高级遮罩节点'), icon: 'fa-wand-magic-sparkles', search: 'advanced masking mask segment cutout 添加 高级遮罩 蒙版 抠图 分割', action: () => call('addMaskNode', null, targetWorld) },
                        { label: t('Add SAM3 Video Mask node', '添加 SAM3 视频遮罩节点'), icon: 'fa-film', search: 'sam3 video mask masking segment 添加 视频遮罩 视频蒙版 分割', action: () => call('addSam3VideoMaskNode', null, targetWorld) },
                        { label: t('Add Uni3C Camera Motion node', '添加 Uni3C 运镜节点'), icon: 'fa-camera-rotate', search: 'uni3c camera motion reference video orbit pan dolly 运镜 参考视频 环绕 推拉', action: () => call('addCameraMotionNode', null, targetWorld) },
                        { label: t('Add Pose Studio node', '添加 Pose Studio 节点'), icon: 'fa-person', search: 'pose studio openpose reference body posture 添加 姿势 姿态 骨架 参考图', action: () => call('addPoseStudioNode', null, targetWorld) },
                        { label: t('Add Gaussian Studio node', '添加 Gaussian Studio 节点'), icon: 'fa-cube', search: 'gaussian studio 3dgs sharp splat ply rotate view 添加 高斯 三维 视角', action: () => call('addGaussianStudioNode', null, targetWorld) },
                        { label: t('Add LivePortrait Exp node', '添加 LivePortrait Exp 节点'), icon: 'fa-face-smile', search: 'liveportrait expression face smile edit reference 添加 表情 编辑 参考表情', action: () => call('addLivePortraitExpressionNode', null, targetWorld) },
                        { label: t('Add image compare node', '添加图像对比节点'), icon: 'sai-compare-glyph', search: 'image compare comparison diff 添加 图像对比 比较 差异', action: () => call('addCompareNode', null, targetWorld) },
                        { label: t('Add Director Timeline', '添加导演时间轴'), icon: 'fa-timeline', search: 'director timeline easy media prompt_override shot storyboard 添加 导演 时间轴 分镜', action: () => call('addDirectorTimelineNode', null, targetWorld) },
                        { label: t('Add media timeline', '添加媒体时间线'), icon: 'fa-clapperboard', search: 'media timeline video edit clips 添加 媒体时间线 时间线 视频 剪辑', action: () => call('addTimelineNode', null, targetWorld) }
                    ]
                },
                {
                    label: 'Qwen TTS',
                    icon: 'fa-microphone-lines',
                    search: 'qwen tts audio voice speech dialogue clone custom 语音 音频 声音 对话 克隆',
                    children: [
                        { label: t('Add Qwen TTS Voice Design', '添加 Qwen TTS 音色设计'), icon: 'fa-microphone-lines', search: 'qwen tts voice design audio speech 添加 语音设计 音色设计 音频', action: () => call('addQwenTtsNode', null, 'voice_design', targetWorld) },
                        { label: t('Add Qwen TTS Voice Clone', '添加 Qwen TTS 音色克隆'), icon: 'fa-wave-square', search: 'qwen tts voice clone audio speech 添加 语音克隆 音色克隆 音频', action: () => call('addQwenTtsNode', null, 'voice_clone', targetWorld) },
                        { label: t('Add Qwen TTS Custom Voice', '添加 Qwen TTS 自定义音色'), icon: 'fa-user', search: 'qwen tts custom voice audio speech 添加 自定义语音 自定义音色 音频', action: () => call('addQwenTtsNode', null, 'custom_voice', targetWorld) },
                        { label: t('Add Qwen TTS Dialogue', '添加 Qwen TTS 对话'), icon: 'fa-comments', search: 'qwen tts dialogue conversation audio speech 添加 对话 语音 音频', action: () => call('addQwenTtsNode', null, 'dialogue', targetWorld) }
                    ]
                },
                {
                    label: t('Layout / Notes', '布局 / 备注'),
                    icon: 'fa-object-group',
                    search: 'layout notes note group area organize 布局 备注 笔记 分组 区域 整理',
                    children: [
                        { label: t('Add tip note', '添加提示贴'), icon: 'fa-note-sticky', search: 'tip note sticky notes memo 添加 提示贴 备注 笔记 便签', action: () => call('addNoteNode', null, targetWorld) },
                        { label: t('Add area group', '添加区域分组'), icon: 'fa-object-group', search: 'area group layout organize 添加 区域分组 分组 布局 整理', action: () => call('addAreaGroup', null, targetWorld, { ignoreSelection: true }) }
                    ]
                }
            ];
            if (includeViewActions) {
                items.push(
                    { separator: true },
                    { label: t('Center', '回中'), icon: 'fa-crosshairs', search: 'center recenter origin view 回中 居中 视图', action: () => call('centerCanvas', null) },
                    { label: t('Fit all', '适配全部'), icon: 'fa-expand', search: 'fit all zoom view overview 适配全部 缩放 全部视图', action: () => call('fitAll', null) },
                    { label: t('Clear canvas', '清空画布'), icon: 'fa-broom', danger: true, search: 'clear canvas delete all reset 清空画布 清除 全部 删除 重置', action: () => call('clearCanvasWithConfirm', null) }
                );
            }
            return items;
        }

        return { buildAddNodeContextMenuItems };
    }

    window.SimpAICanvasWorkbenchNodeMenus = Object.assign({}, window.SimpAICanvasWorkbenchNodeMenus || {}, {
        createNodeMenuTools
    });
})();
