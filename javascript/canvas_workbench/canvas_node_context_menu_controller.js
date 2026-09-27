(function () {
    'use strict';

    function createCanvasNodeContextMenuController(context) {
        const scope = context?.nodeContextMenuSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const projectSource = scope.projectSource || {};
        const selectionSource = scope.selectionSource || {};
        const resultSource = scope.resultSource || {};
        const actionSource = scope.actionSource || {};
        const mediaSource = scope.mediaSource || {};
        const menuSource = scope.menuSource || {};
        const eventSource = scope.eventSource || {};
        const uiSource = scope.uiSource || {};
        const languageSource = scope.languageSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const nodeCall = (name, fallback, ...args) => call(nodeSource, name, fallback, ...args);
        const projectCall = (name, fallback, ...args) => call(projectSource, name, fallback, ...args);
        const selectionCall = (name, fallback, ...args) => call(selectionSource, name, fallback, ...args);
        const resultCall = (name, fallback, ...args) => call(resultSource, name, fallback, ...args);
        const actionCall = (name, fallback, ...args) => call(actionSource, name, fallback, ...args);
        const mediaCall = (name, fallback, ...args) => call(mediaSource, name, fallback, ...args);
        const menuCall = (name, fallback, ...args) => call(menuSource, name, fallback, ...args);
        const eventCall = (name, fallback, ...args) => call(eventSource, name, fallback, ...args);
        const uiCall = (name, fallback, ...args) => call(uiSource, name, fallback, ...args);
        const languageCall = (name, fallback, ...args) => call(languageSource, name, fallback, ...args);
        const getLanguageState = () => languageCall('getLanguageState', { __lang: 'en' });
        const t = (english, chinese) => languageCall('t', chinese || english, english, chinese, getLanguageState());

        function openNodeContextMenu(node, x, y) {
            const items = [];
            if (node.type === 'preset' || node.type === 'classic') {
                items.push({ label: t('Run', '运行'), icon: 'fa-play', action: () => actionCall('runPresetNodeFromUi', undefined, node) });
                if (nodeCall('isLivePortraitVideoExpressionPresetNode', false, node)) {
                    items.push({ label: t('Edit LivePortrait Video expression', '编辑 LivePortrait 视频表情'), icon: 'fa-face-smile', action: () => actionCall('openLivePortraitVideoExpressionPresetEditor', undefined, node) });
                }
                if (nodeCall('isLtx23MultiGuidePresetNode', false, node)) {
                    items.push({ label: t('Edit LTX keyframe guides', '编辑 LTX 关键帧引导'), icon: 'fa-sliders', action: () => actionCall('openLtx23GuidePresetEditor', undefined, node) });
                }
                items.push({ label: t('X/Y/Z Plot', 'X/Y/Z 对比生成'), icon: 'fa-table-cells-large', action: () => actionCall('openXyzPlotPanel', undefined, node) });
                items.push({ label: t('Check/download models', '检查/下载模型'), icon: 'fa-cloud-arrow-down', action: () => actionCall('handlePresetModelAction', undefined, node) });
                items.push({ label: t('Run upstream to here', '运行上游到这里'), icon: 'fa-arrow-turn-down', action: () => actionCall('runNodeChain', undefined, node, 'to-here') });
                items.push({ label: t('Run downstream from here', '从这里运行下游'), icon: 'fa-arrow-turn-up', action: () => actionCall('runNodeChain', undefined, node, 'from-here') });
                items.push({ label: t('Add Models Config', '添加模型配置'), icon: 'fa-cubes', action: () => actionCall('ensureConfigNode', undefined, node, 'models') });
                items.push({ label: t('Add Styles Config', '添加风格配置'), icon: 'fa-palette', action: () => actionCall('ensureConfigNode', undefined, node, 'styles') });
                items.push({ label: t('Add Resolution Config', '添加分辨率配置'), icon: 'fa-ruler-combined', action: () => actionCall('ensureConfigNode', undefined, node, 'resolution') });
                items.push({ label: t('Add Advanced Config', '添加高级配置'), icon: 'fa-sliders', action: () => actionCall('ensureConfigNode', undefined, node, 'advanced') });
            }
            if (node.type === 'translation') {
                items.push({ label: t('Translate', '翻译'), icon: 'fa-language', action: () => actionCall('runTranslationNode', undefined, node) });
                items.push({ label: t('Run upstream to here', '运行上游到这里'), icon: 'fa-arrow-turn-down', action: () => actionCall('runNodeChain', undefined, node, 'to-here') });
                items.push({ label: t('Run downstream from here', '从这里运行下游'), icon: 'fa-arrow-turn-up', action: () => actionCall('runNodeChain', undefined, node, 'from-here') });
            }
            if (node.type === 'tag_cart') {
                items.push({ label: t('Open Tag Cart', '打开标签选择器'), icon: 'sai-tag-cart-glyph', action: () => actionCall('openTagCartForNode', undefined, node) });
            }
            if (node.type === 'batch_any') {
                const selectedBatchItems = nodeCall('batchAnySelectedItemIds', [], node);
                items.push({ label: t('Import files', '导入文件'), icon: 'fa-folder-open', action: () => actionCall('openBatchAnyFilePicker', undefined, node) });
                items.push({ label: t('Delete selected items', '删除选中素材'), icon: 'fa-trash', danger: true, action: () => actionCall('deleteBatchAnyItems', undefined, node, selectedBatchItems), disabled: !selectedBatchItems.length });
                items.push({ label: t('Run current item', '运行当前素材'), icon: 'fa-play', action: () => actionCall('runBatchAnyNode', undefined, node, { currentOnly: true }), disabled: !nodeCall('batchAnyCurrentItem', null, node) || !nodeCall('batchAnyTargets', [], node).length });
                items.push({ label: t('Run all items', '运行全部素材'), icon: 'fa-forward', action: () => actionCall('runBatchAnyNode', undefined, node), disabled: !(Array.isArray(node.items) && node.items.length) || !nodeCall('batchAnyTargets', [], node).length });
            }
            if (node.type === 'wildcards_helper') {
                items.push({ label: t('Refresh wildcards', '刷新通配符'), icon: 'fa-arrows-rotate', action: () => actionCall('refreshWildcardsCatalog', undefined, node, { force: true }) });
                items.push({ label: t('Wildcards Manager', '通配符管理'), icon: 'fa-folder-tree', action: () => actionCall('openWildcardsManager', undefined, node) });
            }
            if (node.type === 'note') {
                items.push({
                    label: node.tail?.enabled ? t('Hide pointer tail', '隐藏指引尾巴') : t('Show pointer tail', '显示指引尾巴'),
                    icon: 'fa-location-dot',
                    action: () => actionCall('toggleNoteTail', undefined, node)
                });
                items.push({ label: t('Reset pointer target', '重置指向位置'), icon: 'fa-location-crosshairs', action: () => actionCall('resetNoteTail', undefined, node) });
            }
            if (node.type === 'pose_studio') {
                items.push({ label: t('Open Pose Studio', '打开 Pose Studio'), icon: 'fa-person', action: () => mediaCall('openPoseStudioEditor', undefined, node) });
                items.push({ label: t('View media', '查看媒体'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
            }
            if (node.type === 'gaussian_studio') {
                items.push({ label: t('Open Gaussian Studio', '打开 Gaussian Studio'), icon: 'fa-cube', action: () => mediaCall('openGaussianStudioEditor', undefined, node) });
                items.push({ label: t('View media', '查看媒体'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
            }
            if (node.type === 'liveportrait_expression') {
                items.push({ label: t('Open LivePortrait Exp', '打开 LivePortrait Exp'), icon: 'fa-face-smile', action: () => mediaCall('openLivePortraitExpressionEditor', undefined, node) });
                items.push({ label: t('View media', '查看媒体'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
            }
            if (node.type === 'camera_motion') {
                items.push({ label: t('Generate reference video', '生成参考视频'), icon: 'fa-camera-rotate', action: () => actionCall('runCameraMotionNode', undefined, node) });
                items.push({ label: t('Clear reference video', '清除参考视频'), icon: 'fa-eraser', action: () => actionCall('clearCameraMotionNode', undefined, node), disabled: !node.asset });
                items.push({ label: t('View video', '查看视频'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
            }
            if (node.type === 'result') {
                items.push({ label: t('View media', '查看媒体'), icon: 'fa-magnifying-glass-plus', action: () => node.type === 'result' ? mediaCall('openAssetViewer', undefined, resultCall('getSelectedResultAsset', null, node), node.title || 'Result') : mediaCall('openImageViewer', undefined, node), disabled: !(node.type === 'result' ? resultCall('getSelectedResultAsset', null, node) : node.asset) });
                if (nodeCall('isCanvasAgentImageTarget', false, node)) {
                    items.push({ label: t('Edit in Sketch', 'Sketch 编辑'), icon: 'fa-pen-ruler', action: () => mediaCall('openSketchForNode', undefined, node), disabled: !(node.type === 'result' ? resultCall('getSelectedResultAsset', null, node) : node.asset) });
                    items.push({ label: t('Replace image', '替换图片'), icon: 'fa-arrows-rotate', action: () => actionCall('replaceNodeImage', undefined, node) });
                }
            }
            if (node.type === 'result') {
                const state = String(node.status?.state || '').toLowerCase();
                const active = nodeCall('isCanvasRunActiveState', false, state);
                const isQwenResult = !!node.producer?.qwen_tts_node_id;
                if (active) {
                    items.push({ label: t('Stop run', '停止运行'), icon: 'fa-stop', action: () => resultCall('controlResultRun', undefined, node, 'stop') });
                    if (!isQwenResult) items.push({ label: t('Skip run', '跳过运行'), icon: 'fa-forward-step', action: () => resultCall('controlResultRun', undefined, node, 'skip') });
                }
                items.push({ label: t('Retry run', '重试运行'), icon: 'fa-rotate-right', action: () => resultCall('retryResultRun', undefined, node), disabled: !(node.producer?.preset_node_id || node.producer?.qwen_tts_node_id) });
                const asset = resultCall('getSelectedResultAsset', null, node);
                const kind = resultCall('assetMediaKind', 'image', asset || {});
                const label = kind === 'video' ? t('Create video node', '转为视频节点') : (kind === 'audio' ? t('Create audio node', '转为音频节点') : t('Create image node', '转为图像节点'));
                const icon = resultCall('assetMediaIcon', 'fa-image', asset || {});
                items.push({ label, icon, action: () => resultCall('convertResultToMediaNode', undefined, node), disabled: !asset });
                menuCall('appendAudioWorkflowBridgeMenuItems', undefined, items, node);
                items.push({ label: t('Expand outputs', '展开全部输出'), icon: 'fa-table-cells-large', action: () => resultCall('expandResultAssetsToMediaNodes', undefined, node), disabled: !(Array.isArray(node.assets) && node.assets.length > 1) });
            }
            if (node.type === 'xy_matrix' || node.type === 'xyz_matrix') {
                items.push({ label: t('Locate source', '定位来源'), icon: 'fa-location-crosshairs', action: () => actionCall('focusXyzMatrixSource', undefined, node) });
            }
            if (node.type === 'video') {
                items.push({ label: t('Re-upload video asset', '重新上传视频资产'), icon: 'fa-rotate', action: () => actionCall('reloadMediaNode', undefined, node) });
                items.push({ label: t('View video', '查看视频'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
            }
            if (node.type === 'audio') {
                items.push({ label: t('Re-upload audio asset', '重新上传音频资产'), icon: 'fa-rotate', action: () => actionCall('reloadMediaNode', undefined, node) });
                items.push({ label: t('Open audio', '打开音频'), icon: 'fa-magnifying-glass-plus', action: () => mediaCall('openMediaViewer', undefined, node), disabled: !node.asset });
                menuCall('appendAudioWorkflowBridgeMenuItems', undefined, items, node);
            }
            const compareSources = (selectionCall('getSelectedNodeIdList', [],) || []).map(id => projectCall('getNode', null, id)).filter(item => nodeCall('isImageCompareSource', false, item));
            if (compareSources.length >= 2) {
                items.push({ label: t('Create compare node', '创建对比节点'), icon: 'sai-compare-glyph', action: () => actionCall('createCompareNodeFromSources', undefined, compareSources.slice(0, 2)) });
            }
            const timelineSources = (selectionCall('getSelectedNodeIdList', [],) || []).map(id => projectCall('getNode', null, id)).filter(item => nodeCall('isTimelineSource', false, item));
            if (timelineSources.length) {
                items.push({ label: t('Create media timeline', '创建媒体时间线'), icon: 'fa-clapperboard', action: () => actionCall('createTimelineNodeFromSources', undefined, timelineSources) });
            }
            if (node.type === 'timeline') {
                items.push({ label: t('Add selected media to timeline', '添加选中媒体到 Timeline'), icon: 'fa-plus', action: () => actionCall('addSelectedMediaToTimeline', undefined, node) });
            }
            if (node.type === 'wd14') {
                items.push({ label: t('Run WD14', '运行 WD14'), icon: 'fa-tags', action: () => actionCall('runWd14Node', undefined, node) });
                items.push({ label: t('Run upstream to here', '运行上游到这里'), icon: 'fa-arrow-turn-down', action: () => actionCall('runNodeChain', undefined, node, 'to-here') });
                items.push({ label: t('Run downstream from here', '从这里运行下游'), icon: 'fa-arrow-turn-up', action: () => actionCall('runNodeChain', undefined, node, 'from-here') });
            }
            if (node.type === 'vlm') {
                const chatBusy = (node.params?.mode || 'single') === 'chat' && nodeCall('isVlmNodeBusy', false, node);
                items.push({ label: chatBusy ? t('Stop reply', '停止回答') : t('Run VLM', '运行 VLM'), icon: chatBusy ? 'fa-stop' : 'sai-vlm-glyph', action: () => chatBusy ? actionCall('stopVlmChatNode', undefined, node) : actionCall('runVlmNode', undefined, node) });
                items.push({ label: t('Run upstream to here', '运行上游到这里'), icon: 'fa-arrow-turn-down', action: () => actionCall('runNodeChain', undefined, node, 'to-here') });
                items.push({ label: t('Run downstream from here', '从这里运行下游'), icon: 'fa-arrow-turn-up', action: () => actionCall('runNodeChain', undefined, node, 'from-here') });
            }
            if (nodeCall('isQwenTtsNode', false, node)) {
                const running = nodeCall('isCanvasRunActiveState', false, nodeCall('nodeStatusState', '', node));
                items.push({ label: running ? t('Stop Qwen TTS', '停止 Qwen TTS') : t('Run Qwen TTS', '运行 Qwen TTS'), icon: running ? 'fa-stop' : 'fa-play', action: () => running ? actionCall('stopQwenTtsNode', undefined, node) : actionCall('runQwenTtsNode', undefined, node) });
                items.push({ label: t('Run upstream to here', '运行上游到这里'), icon: 'fa-arrow-turn-down', action: () => actionCall('runNodeChain', undefined, node, 'to-here') });
                items.push({ label: t('Run downstream from here', '从这里运行下游'), icon: 'fa-arrow-turn-up', action: () => actionCall('runNodeChain', undefined, node, 'from-here') });
            }
            items.push({ label: t('Duplicate', '复制'), icon: 'fa-copy', action: () => selectionCall('duplicateSelection', undefined) });
            items.push({ label: t('Delete nodes', '删除节点'), icon: 'fa-trash', danger: true, action: () => selectionCall('deleteSelection', undefined) });
            const selectedNodes = (selectionCall('getSelectedNodeIdList', [],) || []).map(id => projectCall('getNode', null, id)).filter(Boolean);
            const allLocked = selectedNodes.length > 0 && selectedNodes.every(item => nodeCall('isNodeLocked', false, item));
            const allIgnored = selectedNodes.length > 0 && selectedNodes.every(item => nodeCall('isNodeIgnored', false, item));
            const allCollapsed = selectedNodes.length > 0 && selectedNodes.every(item => nodeCall('isNodeCollapsed', false, item));
            items.splice(Math.max(0, items.length - 2), 0,
                { label: allLocked ? t('Unlock selected', '解锁选中节点') : t('Lock selected', '锁定选中节点'), icon: allLocked ? 'fa-lock-open' : 'fa-lock', action: () => selectionCall('toggleSelectedNodesFlag', undefined, 'locked') },
                { label: allIgnored ? t('Enable selected', '启用选中节点') : t('Skip selected', '跳过选中节点'), icon: 'fa-forward-step', action: () => selectionCall('toggleSelectedNodesFlag', undefined, 'ignored') },
                { label: allCollapsed ? t('Expand selected', '展开选中节点') : t('Collapse selected', '折叠选中节点'), icon: allCollapsed ? 'fa-up-right-and-down-left-from-center' : 'fa-down-left-and-up-right-to-center', action: () => selectionCall('toggleSelectedNodesFlag', undefined, 'collapsed') },
                { label: t('Align left', '左对齐'), icon: 'fa-align-left', action: () => selectionCall('alignSelectedNodes', undefined, 'left'), disabled: selectedNodes.length < 2 },
                { label: t('Align top', '顶对齐'), icon: 'fa-align-left', action: () => selectionCall('alignSelectedNodes', undefined, 'top'), disabled: selectedNodes.length < 2 },
                { label: t('Distribute horizontal', '水平分布'), icon: 'fa-arrows-left-right-to-line', action: () => selectionCall('distributeSelectedNodes', undefined, 'x'), disabled: selectedNodes.length < 3 },
                { label: t('Distribute vertical', '垂直分布'), icon: 'fa-arrows-up-down-to-line', action: () => selectionCall('distributeSelectedNodes', undefined, 'y'), disabled: selectedNodes.length < 3 }
            );
            uiCall('openContextMenu', undefined, x, y, items);
        }

        function bindNodeContextMenu(nodeEl, node) {
            nodeEl.addEventListener('contextmenu', (evt) => {
                evt.preventDefault();
                evt.stopPropagation();
                if (!(selectionCall('getSelectedNodeIdList', []) || []).includes(node.id)) {
                    selectionCall('selectNode', undefined, node.id);
                }
                const resultAsset = evt.target.closest('[data-result-asset-index]');
                if (resultAsset && node.type === 'result') {
                    const index = Number(resultAsset.getAttribute('data-result-asset-index')) || 0;
                    eventCall('selectResultAsset', undefined, node, index);
                    eventCall('openResultAssetContextMenu', undefined, node, index, evt.clientX, evt.clientY);
                    return;
                }
                const imageMedia = evt.target.closest('.sai-image-node-media,[data-image-drop-zone],.sai-result-media,.sai-pose-studio-media,.sai-gaussian-studio-media,.sai-liveportrait-expression-media');
                if (imageMedia && (node.type === 'image' || ['pose_studio', 'gaussian_studio', 'liveportrait_expression'].includes(node.type) || nodeCall('isCanvasAgentImageTarget', false, node)) && !evt.target.closest('.sai-node-head')) {
                    eventCall('openImageMediaContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const videoMedia = evt.target.closest('.sai-node-video-media,.sai-media-storyboard');
                if (videoMedia && node.type === 'video' && !evt.target.closest('.sai-node-head')) {
                    eventCall('openVideoMediaContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const audioMedia = evt.target.closest('.sai-node-audio-media,.sai-audio-waveform');
                if (audioMedia && node.type === 'audio' && !evt.target.closest('.sai-node-head')) {
                    eventCall('openAudioMediaContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const inputPortHandle = evt.target.closest(eventCall('getInputPortHandleSelector', ''));
                if (inputPortHandle) {
                    const target = eventCall('getConnectionTargetFromHandle', null, inputPortHandle);
                    if (target) {
                        eventCall('openInputPortContextMenu', undefined, target, evt.clientX, evt.clientY);
                        return;
                    }
                }
                const inHandle = evt.target.closest('[data-handle-in]');
                if (inHandle) {
                    eventCall('openInputHandleContextMenu', undefined, node, inHandle.getAttribute('data-handle-in'), evt.clientX, evt.clientY);
                    return;
                }
                const configInHandle = evt.target.closest('[data-config-in]');
                if (configInHandle) {
                    eventCall('openConfigHandleContextMenu', undefined, node, configInHandle.getAttribute('data-config-in'), evt.clientX, evt.clientY);
                    return;
                }
                const textInHandle = evt.target.closest('[data-text-in]');
                if (textInHandle) {
                    eventCall('openTextHandleContextMenu', undefined, node, textInHandle.getAttribute('data-text-in'), evt.clientX, evt.clientY);
                    return;
                }
                const textNodeInHandle = evt.target.closest('[data-text-node-in]');
                if (textNodeInHandle) {
                    eventCall('openTextNodeInputContextMenu', undefined, node, evt.clientX, evt.clientY, textNodeInHandle.getAttribute('data-text-node-in') || 'input');
                    return;
                }
                const translationTextInHandle = evt.target.closest('[data-translation-text-in]');
                if (translationTextInHandle) {
                    eventCall('openTextNodeInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const tagCartTextInHandle = evt.target.closest('[data-tagcart-text-in]');
                if (tagCartTextInHandle) {
                    eventCall('openTextNodeInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const resultInHandle = evt.target.closest('[data-handle-in-result]');
                if (resultInHandle) {
                    eventCall('openResultInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const compareImageInHandle = evt.target.closest('[data-compare-image-in]');
                if (compareImageInHandle) {
                    eventCall('openCompareImageInputContextMenu', undefined, node, compareImageInHandle.getAttribute('data-compare-image-in'), evt.clientX, evt.clientY);
                    return;
                }
                const wd14ImageInHandle = evt.target.closest('[data-wd14-image-in]');
                if (wd14ImageInHandle) {
                    eventCall('openWd14ImageInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const vlmImageInHandle = evt.target.closest('[data-vlm-image-in]');
                if (vlmImageInHandle) {
                    eventCall('openVlmImageInputContextMenu', undefined, node, vlmImageInHandle.getAttribute('data-vlm-image-in'), evt.clientX, evt.clientY);
                    return;
                }
                const maskSourceInHandle = evt.target.closest('[data-mask-source-in]');
                if (maskSourceInHandle) {
                    eventCall('openMaskSourceInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const poseReferenceInHandle = evt.target.closest('[data-pose-studio-reference-in]');
                if (poseReferenceInHandle) {
                    eventCall('openPoseStudioReferenceContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const gaussianReferenceInHandle = evt.target.closest('[data-gaussian-studio-reference-in]');
                if (gaussianReferenceInHandle) {
                    eventCall('openGaussianStudioReferenceContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const batchAnyInHandle = evt.target.closest('[data-batch-any-in]');
                if (batchAnyInHandle && node.type === 'batch_any') {
                    eventCall('openBatchAnyInputContextMenu', undefined, node, evt.clientX, evt.clientY);
                    return;
                }
                const timelineKeyframe = evt.target.closest('[data-timeline-keyframe-jump]');
                if (timelineKeyframe && node.type === 'timeline') {
                    eventCall('openTimelineKeyframeContextMenu', undefined, node, timelineKeyframe, evt.clientX, evt.clientY);
                    return;
                }
                const timelineClip = evt.target.closest('[data-timeline-clip-id]');
                if (timelineClip && node.type === 'timeline') {
                    eventCall('openTimelineClipContextMenu', undefined, node, timelineClip.getAttribute('data-timeline-clip-id'), evt.clientX, evt.clientY);
                    return;
                }
                const vlmChatMessage = evt.target.closest('[data-vlm-chat-message]');
                if (vlmChatMessage && node.type === 'vlm') {
                    eventCall('openVlmChatMessageContextMenu', undefined, node, Number(vlmChatMessage.getAttribute('data-vlm-chat-message')) || 0, evt.clientX, evt.clientY);
                    return;
                }
                openNodeContextMenu(node, evt.clientX, evt.clientY);
            });
        }

        return { openNodeContextMenu, bindNodeContextMenu };
    }

    window.SimpAICanvasWorkbenchNodeContextMenu = Object.assign({}, window.SimpAICanvasWorkbenchNodeContextMenu || {}, {
        createCanvasNodeContextMenuController
    });
})();
