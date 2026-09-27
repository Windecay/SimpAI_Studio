(function () {
    'use strict';

    function createCanvasPresetSpecialPanelRenderer(source) {
        const scope = source || {};

        function call(name, fallback, ...args) {
            const fn = scope[name];
            return typeof fn === 'function' ? fn(...args) : fallback;
        }

        function t(en, cn) {
            return call('t', cn || en, en, cn);
        }

        function escapeHtml(value) {
            return call('escapeHtml', String(value ?? ''), value);
        }

        function compactNumber(value) {
            return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
        }

        function renderStyleTransferPresetController(node) {
            if (!call('isStyleTransferPresetNode', false, node)) return '';
            const selector = call('findStyleSelectorForPreset', null, node);
            const selectedStyle = selector?.style_selector?.selected_name || '';
            return `<div class="sai-style-transfer-link-panel">
  <i class="fa-solid fa-palette"></i>
  <span><b>${escapeHtml(selector ? (selectedStyle || t('Style Selector linked', '已连接 Style Selector')) : t('Style Selector', '风格选择器'))}</b><span>${escapeHtml(selector ? t('Double-click this preset or use the button to focus it.', '双击此 preset 或用按钮定位。') : t('Create a linked style selector node for Style Transfer+.', '为 Style Transfer+ 创建已连接的风格选择器节点。'))}</span></span>
  <button type="button" data-node-action="add-style-selector"><i class="fa-solid ${selector ? 'fa-location-crosshairs' : 'fa-plus'}"></i><span>${escapeHtml(selector ? t('Focus', '定位') : t('Add', '添加'))}</span></button>
</div>`;
        }

        function renderLivePortraitVideoExpressionPresetController(node) {
            if (!call('isLivePortraitVideoExpressionPresetNode', false, node)) return '';
            const sourceInfo = call('livePortraitVideoExpressionSourceInfo', {}, node) || {};
            const sourceTitle = sourceInfo.sourceNode?.title || sourceInfo.asset?.filename || sourceInfo.asset?.name || '';
            const hasParams = !!String(node.params?.scene_additional_prompt_2 || '').trim();
            const message = sourceInfo.sourceNode
                ? (hasParams
                    ? t('Expression params saved. Edit from the source video first frame.', '表情参数已保存，可用源视频首帧继续编辑。')
                    : t('Edit using the source video first frame.', '使用源视频首帧编辑。'))
                : t('Connect a video to Scene Video first.', '请先连接场景视频。');
            return `<div class="sai-style-transfer-link-panel sai-liveportrait-video-expression-panel">
  <i class="fa-solid fa-face-smile"></i>
  <span><b>${escapeHtml(sourceTitle || t('LivePortrait Video', 'LivePortrait 视频表情'))}</b><span>${escapeHtml(message)}</span></span>
  <button type="button" data-node-action="edit-liveportrait-video-expression"><i class="fa-solid fa-sliders"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
</div>`;
        }

        function renderLtx23GuidePresetController(node) {
            if (!call('isLtx23MultiGuidePresetNode', false, node)) return '';
            const config = call('ltx23GuideConfigForPreset', null, node);
            if (!config) return '';
            if (config.mode === 'video_extent') {
                const guides = config.guides.map((item, index) => {
                    const frame = Number(item.frame_idx) === 0 ? t('Auto', '自动') : String(item.frame_idx);
                    return `${t(`G${index + 1}`, `图${index + 1}`)} ${frame}/${compactNumber(item.strength)}`;
                }).join(' · ');
                const summary = t(
                    `Context ${config.context_frames}/${compactNumber(config.source_strength)} | ${guides}`,
                    `上下文 ${config.context_frames}/${compactNumber(config.source_strength)} | ${guides}`
                );
                return `<div class="sai-style-transfer-link-panel sai-ltx23-guide-panel">
  <i class="fa-solid fa-sliders"></i>
  <span><b>${escapeHtml(t('LTX Extent Guides', 'LTX 续写引导'))}</b><span>${escapeHtml(summary)}</span></span>
  <button type="button" data-node-action="edit-ltx23-guides"><i class="fa-solid fa-pen-to-square"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
</div>`;
            }
            const middle = config.middle.map((item, index) => {
                const frame = Number(item.frame_idx) === 0 ? t('Auto', '自动') : String(item.frame_idx);
                return `${t(`M${index + 1}`, `中${index + 1}`)} ${frame}/${compactNumber(item.strength)}`;
            }).join(' · ');
            const summary = t(
                `First ${compactNumber(config.first_strength)} | ${middle} | Last ${compactNumber(config.last_strength)}`,
                `首帧 ${compactNumber(config.first_strength)} | ${middle} | 尾帧 ${compactNumber(config.last_strength)}`
            );
            return `<div class="sai-style-transfer-link-panel sai-ltx23-guide-panel">
  <i class="fa-solid fa-sliders"></i>
  <span><b>${escapeHtml(t('LTX Keyframe Guides', 'LTX 关键帧引导'))}</b><span>${escapeHtml(summary)}</span></span>
  <button type="button" data-node-action="edit-ltx23-guides"><i class="fa-solid fa-pen-to-square"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
</div>`;
        }

        function renderMiniMaxH3StoryboardPresetController(node) {
            if (!call('isMiniMaxH3PresetNode', false, node)) return '';
            const options = call('h3StoryboardOptionsForPreset', null, node);
            const state = call('h3StoryboardStateForPreset', null, node);
            if (!options || !state) return '';
            const editor = call('getH3StoryboardEditor', null);
            const summary = typeof editor?.statusText === 'function'
                ? editor.statusText(state, options, options.langState)
                : `${options.mode} · ${Math.max(1, state.shots?.length || 3)} ${t('shots', '镜头')} · ${options.duration.toFixed(1)}s · ${state.optimize ? t('LLM optimize', 'LLM 优化') : t('Direct', '直接写入')}`;
            return `<div class="sai-style-transfer-link-panel sai-h3-storyboard-panel">
  <i class="fa-solid fa-table-list"></i>
  <span><b>${escapeHtml(t('MiniMax H3 Storyboard', 'MiniMax H3 分镜表'))}</b><span>${escapeHtml(summary)}</span></span>
  <button type="button" data-node-action="edit-h3-storyboard"><i class="fa-solid fa-pen-to-square"></i><span>${escapeHtml(t('Edit', '编辑'))}</span></button>
</div>`;
        }

        return {
            renderStyleTransferPresetController,
            renderLivePortraitVideoExpressionPresetController,
            renderLtx23GuidePresetController,
            renderMiniMaxH3StoryboardPresetController
        };
    }

    window.SimpAICanvasWorkbenchPresetSpecialPanelRenderer = Object.assign(
        {},
        window.SimpAICanvasWorkbenchPresetSpecialPanelRenderer || {},
        { createCanvasPresetSpecialPanelRenderer }
    );
})();
