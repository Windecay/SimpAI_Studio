(function () {
    'use strict';

    function createCanvasMediaContextMenuController(context) {
        const scope = context?.mediaContextMenuSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const agentSource = scope.agentSource || {};
        const mediaSource = scope.mediaSource || {};
        const actionSource = scope.actionSource || {};
        const uiSource = scope.uiSource || {};
        const languageSource = scope.languageSource || {};
        const call = (sourceObject, name, fallback, ...args) => typeof sourceObject?.[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en) => en;
        const openContextMenu = (...args) => call(uiSource, 'openContextMenu', undefined, ...args);

        function appendAudioWorkflowBridgeMenuItems(items, node) {
            if (!call(nodeSource, 'isCanvasAgentAudioTarget', false, node)) return;
            items.push({ label: t('Attach audio to Agent', '挂载音频到 Agent'), icon: 'fa-paperclip', action: () => call(agentSource, 'setCanvasAgentAudioBridgeSource', undefined, node) });
            items.push({ label: t('Agent audio edit', 'Agent 音频编辑'), icon: 'fa-wave-square', action: () => call(agentSource, 'runCanvasAgentAudioBridgeFromNode', undefined, node, 'audio_edit') });
            items.push({ label: t('Agent audio to video', 'Agent 音频转视频'), icon: 'fa-film', action: () => call(agentSource, 'runCanvasAgentAudioBridgeFromNode', undefined, node, 'audio_to_video') });
        }

        function openImageMediaContextMenu(node, x, y) {
            const hasImage = node?.type === 'image'
                ? !!call(nodeSource, 'getNodeImageSrc', null, node)
                : call(nodeSource, 'isCanvasAgentImageTarget', false, node);
            const quickTools = (call(agentSource, 'canvasAgentQuickTools', []) || []).map(tool => ({
                label: tool.label,
                icon: tool.icon,
                action: () => call(agentSource, 'runCanvasAgentQuickTool', undefined, tool.key, { targetNodeId: node.id }),
                disabled: !hasImage
            }));
            const items = [
                ...quickTools,
                { separator: true },
                { label: t('View image', '查看图像'), icon: 'fa-magnifying-glass-plus', action: () => call(mediaSource, 'openAssetViewer', undefined, call(nodeSource, 'getNodeLayerForgeAsset', null, node), node?.title || 'Image'), disabled: !hasImage },
                { label: t('Edit in Sketch', 'Sketch 编辑'), icon: 'fa-pen-ruler', action: () => call(mediaSource, 'openSketchForNode', undefined, node), disabled: !hasImage }
            ];
            if (node?.type === 'pose_studio') {
                items.push({ label: t('Open Pose Studio', '打开 Pose Studio'), icon: 'fa-person', action: () => call(mediaSource, 'openPoseStudioEditor', undefined, node) });
            }
            if (node?.type === 'gaussian_studio') {
                items.push({ label: t('Open Gaussian Studio', '打开 Gaussian Studio'), icon: 'fa-cube', action: () => call(mediaSource, 'openGaussianStudioEditor', undefined, node) });
            }
            if (node?.type === 'liveportrait_expression') {
                items.push({ label: t('Open LivePortrait Exp', '打开 LivePortrait Exp'), icon: 'fa-face-smile', action: () => call(mediaSource, 'openLivePortraitExpressionEditor', undefined, node) });
            }
            if (['image', 'result'].includes(node?.type)) {
                items.push({ label: t('Replace image', '替换图片'), icon: 'fa-arrows-rotate', action: () => call(actionSource, 'replaceNodeImage', undefined, node) });
            }
            if (node?.type === 'image') {
                items.push({ label: t('Paint Mask', '绘制遮罩'), icon: 'fa-paintbrush', action: () => call(actionSource, 'openMaskEditor', undefined, node), disabled: !hasImage });
            }
            openContextMenu(x, y, items);
        }

        function openVideoMediaContextMenu(node, x, y) {
            const hasVideo = !!call(mediaSource, 'assetDisplaySrc', '', node?.asset || {});
            const quickTools = (call(agentSource, 'canvasAgentVideoQuickTools', []) || []).map(tool => {
                const key = String(tool.key || '').slice('video_'.length);
                const spec = call(agentSource, 'canvasAgentVideoQuickToolSpec', null, key);
                return {
                    label: spec?.label || tool.label,
                    icon: spec?.icon || tool.icon,
                    action: () => call(agentSource, 'runCanvasAgentVideoQuickTool', undefined, key, { targetNodeId: node.id }),
                    disabled: !hasVideo
                };
            });
            openContextMenu(x, y, [
                ...quickTools,
                { separator: true },
                { label: t('View video', '查看视频'), icon: 'fa-magnifying-glass-plus', action: () => call(mediaSource, 'openMediaViewer', undefined, node), disabled: !hasVideo },
                { label: t('Re-upload video asset', '重新上传视频资产'), icon: 'fa-rotate', action: () => call(actionSource, 'reloadMediaNode', undefined, node) },
                { label: t('Create media timeline', '创建媒体时间线'), icon: 'fa-clapperboard', action: () => call(actionSource, 'createTimelineNodeFromSources', undefined, [node]), disabled: !call(nodeSource, 'isTimelineSource', false, node) }
            ]);
        }

        function openAudioMediaContextMenu(node, x, y) {
            const hasAudio = !!call(mediaSource, 'assetDisplaySrc', '', node?.asset || {});
            const quickTools = (call(agentSource, 'canvasAgentAudioQuickTools', []) || []).map(tool => {
                const key = String(tool.key || '').slice('audio_'.length);
                const spec = call(agentSource, 'canvasAgentAudioQuickToolSpec', null, key);
                return {
                    label: spec?.label || tool.label,
                    icon: spec?.icon || tool.icon,
                    action: () => call(agentSource, 'runCanvasAgentAudioQuickTool', undefined, key, { targetNodeId: node.id }),
                    disabled: key === 'edit' && !hasAudio
                };
            });
            openContextMenu(x, y, [
                ...quickTools,
                { label: t('Audio to Video', '音频转视频'), icon: 'fa-film', action: () => call(agentSource, 'runCanvasAgentAudioBridgeFromNode', undefined, node, 'audio_to_video'), disabled: !hasAudio },
                { separator: true },
                { label: t('Open audio', '打开音频'), icon: 'fa-magnifying-glass-plus', action: () => call(mediaSource, 'openMediaViewer', undefined, node), disabled: !hasAudio },
                { label: t('Re-upload audio asset', '重新上传音频资产'), icon: 'fa-rotate', action: () => call(actionSource, 'reloadMediaNode', undefined, node) },
                { label: t('Create media timeline', '创建媒体时间线'), icon: 'fa-clapperboard', action: () => call(actionSource, 'createTimelineNodeFromSources', undefined, [node]), disabled: !call(nodeSource, 'isTimelineSource', false, node) }
            ]);
        }

        return {
            appendAudioWorkflowBridgeMenuItems,
            openImageMediaContextMenu,
            openVideoMediaContextMenu,
            openAudioMediaContextMenu
        };
    }

    window.SimpAICanvasWorkbenchMediaContextMenu = Object.assign({}, window.SimpAICanvasWorkbenchMediaContextMenu || {}, {
        createCanvasMediaContextMenuController
    });
})();
