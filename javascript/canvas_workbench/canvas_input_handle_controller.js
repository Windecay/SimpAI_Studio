(function () {
    'use strict';

    function createCanvasInputHandleController(context) {
        const scope = context?.inputHandleSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const slotSource = scope.slotSource || {};
        const connectionSource = scope.connectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const sourceCall = (sourceObject, name, fallback, ...args) => typeof sourceObject[name] === 'function'
            ? sourceObject[name](...args)
            : fallback;
        const projectCall = (name, fallback, ...args) => sourceCall(projectSource, name, fallback, ...args);
        const nodeCall = (name, fallback, ...args) => sourceCall(nodeSource, name, fallback, ...args);
        const connectionCall = (name, ...args) => sourceCall(connectionSource, name, undefined, ...args);
        const renderCall = (name, ...args) => sourceCall(renderSource, name, undefined, ...args);
        const uiCall = (name, ...args) => sourceCall(uiSource, name, undefined, ...args);
        const getProject = () => projectCall('getProject', {}) || {};
        const getNode = (id) => nodeCall('getNode', null, id);
        const t = typeof languageSource.t === 'function' ? languageSource.t : (en) => en;
        const getSlotLabel = (node, slot) => nodeCall('getSlotLabel', slot, node, slot);
        const notConnectedText = () => uiCall('notConnectedText', '');

        function openInputHandleContextMenu(node, slot, x, y) {
            const fromId = node.upload_slots?.[slot];
            uiCall('openContextMenu', x, y, [
                {
                    label: fromId ? t('Disconnect {slot}', '断开 {slot}').replace('{slot}', getSlotLabel(node, slot)) : notConnectedText(),
                    icon: fromId ? 'fa-link-slash' : 'fa-circle',
                    disabled: !fromId,
                    action: () => connectionCall('deleteUploadSlot', node.id, slot)
                }
            ]);
        }

        function openConfigHandleContextMenu(node, kind, x, y) {
            const edge = findEdge(item => item.type === 'config' && item.to === node.id && item.slot === kind);
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect {kind} config', '断开 {kind} config').replace('{kind}', kind) : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openTextHandleContextMenu(node, slot, x, y) {
            const edge = findEdge(item => item.type === 'text' && item.to === node.id && item.slot === slot);
            const label = slot === 'negative_prompt' ? t('Negative Prompt', '负向提示词') : t('Prompt', '提示词');
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect {slot}', '断开 {slot}').replace('{slot}', label) : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openTextNodeInputContextMenu(node, x, y, slot) {
            const targetSlot = node?.type === 'text_merge' ? (slot || 'input_1') : 'input';
            const edge = findEdge(item => item.type === 'text' && item.to === node.id && item.slot === targetSlot);
            const connected = !!edge;
            const isMerge = node?.type === 'text_merge';
            uiCall('openContextMenu', x, y, [
                { label: connected ? t('Disconnect Text input', '断开文本输入') : (isMerge ? notConnectedText() : t('Manual text', '手动文本')),
                    icon: connected ? 'fa-link-slash' : (isMerge ? 'fa-circle' : 'fa-keyboard'),
                    disabled: !connected, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openWd14ImageInputContextMenu(node, x, y) {
            const edge = findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'image');
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect image input', '断开图片输入') : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openVlmImageInputContextMenu(node, slot, x, y) {
            const slots = typeof slotSource.getVlmImageSlots === 'function' ? slotSource.getVlmImageSlots() || [] : [];
            const targetSlot = slots.some(item => item.key === slot) ? slot : 'image_1';
            const edge = findEdge(item => item.type === 'image' && item.to === node.id && item.slot === targetSlot);
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect {slot}', '断开 {slot}').replace('{slot}', targetSlot) : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openMaskSourceInputContextMenu(node, x, y) {
            const edge = findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'source');
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect source image', '断开源图输入') : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openPoseStudioReferenceContextMenu(node, x, y) {
            const edge = findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'reference');
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect reference image', '断开参考图输入') : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function openCompareImageInputContextMenu(node, slot, x, y) {
            const targetSlot = ['a', 'b'].includes(slot) ? slot : 'a';
            const edge = findEdge(item => item.type === 'compare' && item.to === node.id && item.slot === targetSlot);
            uiCall('openContextMenu', x, y, [
                { label: edge ? t('Disconnect Image {slot}', '断开图像 {slot}').replace('{slot}', targetSlot.toUpperCase()) : notConnectedText(),
                    icon: edge ? 'fa-link-slash' : 'fa-circle', disabled: !edge, action: () => connectionCall('deleteEdge', edge.id) }
            ]);
        }

        function getEdges() {
            const project = getProject();
            return Array.isArray(project.edges) ? project.edges : [];
        }

        function findEdge(predicate) {
            return getEdges().find(predicate) || null;
        }

        function reconnectEdge(edge, evt) {
            if (!edge) return;
            const fromNode = getNode(edge.from);
            connectionCall('deleteEdge', edge.id, { render: false });
            if (fromNode) connectionCall('startConnection', fromNode, evt);
            else renderCall('renderAll');
        }

        function getConnectionTargetFromHandle(handle) {
            if (!handle) return null;
            const nodeEl = handle.closest?.('[data-node-id]');
            const toId = nodeEl ? nodeEl.getAttribute('data-node-id') : '';
            if (!toId) return null;
            if (handle.hasAttribute('data-handle-in')) return { kind: 'upload', toId, slot: handle.getAttribute('data-handle-in'), handle };
            if (handle.hasAttribute('data-config-in')) return { kind: 'config', toId, slot: handle.getAttribute('data-config-in'), handle };
            if (handle.hasAttribute('data-text-in')) return { kind: 'text', toId, slot: handle.getAttribute('data-text-in'), handle };
            if (handle.hasAttribute('data-text-node-in')) return { kind: 'text', toId, slot: handle.getAttribute('data-text-node-in') || 'input', handle };
            if (handle.hasAttribute('data-translation-text-in')) return { kind: 'text', toId, slot: 'input', handle };
            if (handle.hasAttribute('data-tagcart-text-in')) return { kind: 'text', toId, slot: 'input', handle };
            if (handle.hasAttribute('data-wd14-image-in')) return { kind: 'wd14', toId, slot: 'image', handle };
            if (handle.hasAttribute('data-vlm-image-in')) return { kind: 'vlm', toId, slot: handle.getAttribute('data-vlm-image-in'), handle };
            if (handle.hasAttribute('data-mask-source-in')) return { kind: 'mask_source', toId, slot: 'source', handle };
            if (handle.hasAttribute('data-sam3-video-in')) return { kind: 'sam3_video', toId, slot: 'source', handle };
            if (handle.hasAttribute('data-pose-studio-reference-in')) return { kind: 'pose_reference', toId, slot: 'reference', handle };
            if (handle.hasAttribute('data-gaussian-studio-reference-in')) return { kind: 'gaussian_reference', toId, slot: 'reference', handle };
            if (handle.hasAttribute('data-liveportrait-expression-source-in')) return { kind: 'liveportrait_source', toId, slot: 'source', handle };
            if (handle.hasAttribute('data-liveportrait-expression-reference-in')) return { kind: 'liveportrait_reference', toId, slot: 'reference', handle };
            if (handle.hasAttribute('data-qwen-tts-audio-in')) return { kind: 'qwen_tts_audio', toId, slot: handle.getAttribute('data-qwen-tts-audio-in') || '', handle };
            if (handle.hasAttribute('data-director-media-in')) return { kind: 'director_media', toId, slot: handle.getAttribute('data-director-media-in') || '', handle };
            if (handle.hasAttribute('data-director-media-group-in')) return { kind: 'director_media_group', toId, slot: handle.getAttribute('data-director-media-group-in') || '', handle };
            if (handle.hasAttribute('data-compare-image-in')) return { kind: 'compare', toId, slot: handle.getAttribute('data-compare-image-in') || 'a', handle };
            if (handle.hasAttribute('data-batch-any-in')) return { kind: 'batch_any', toId, slot: handle.getAttribute('data-batch-any-in') || 'items', handle };
            if (handle.hasAttribute('data-timeline-track-in')) return { kind: 'timeline', toId, slot: handle.getAttribute('data-timeline-track-in') || 'media', handle };
            if (handle.hasAttribute('data-timeline-media-in')) return { kind: 'timeline', toId, slot: 'media', handle };
            if (handle.hasAttribute('data-handle-in-result')) return { kind: 'generate', toId, slot: 'generate', handle };
            return null;
        }

        function handleInputHandlePointerDown(node, evt, handles) {
            if (!node) return;
            const inputHandles = handles || {};
            const activeHandle = Object.values(inputHandles).find(Boolean);
            const inputTarget = getConnectionTargetFromHandle(activeHandle);
            if (inputTarget) {
                connectionCall('startInputConnection', inputTarget, evt);
                return;
            }

            const inHandle = inputHandles.inHandle;
            const configInHandle = inputHandles.configInHandle;
            const resultInHandle = inputHandles.resultInHandle;
            const textInHandle = inputHandles.textInHandle;
            const textNodeInHandle = inputHandles.textNodeInHandle;
            const translationTextInHandle = inputHandles.translationTextInHandle;
            const tagCartTextInHandle = inputHandles.tagCartTextInHandle;
            const wd14ImageInHandle = inputHandles.wd14ImageInHandle;
            const vlmImageInHandle = inputHandles.vlmImageInHandle;
            const maskSourceInHandle = inputHandles.maskSourceInHandle;
            const sam3VideoInHandle = inputHandles.sam3VideoInHandle;
            const poseReferenceInHandle = inputHandles.poseReferenceInHandle;
            const gaussianReferenceInHandle = inputHandles.gaussianReferenceInHandle;
            const livePortraitSourceInHandle = inputHandles.livePortraitSourceInHandle;
            const livePortraitReferenceInHandle = inputHandles.livePortraitReferenceInHandle;
            const qwenTtsAudioInHandle = inputHandles.qwenTtsAudioInHandle;
            const directorMediaInHandle = inputHandles.directorMediaInHandle;
            const directorMediaGroupInHandle = inputHandles.directorMediaGroupInHandle;
            const compareImageInHandle = inputHandles.compareImageInHandle;
            const batchAnyInHandle = inputHandles.batchAnyInHandle;
            const timelineMediaInHandle = inputHandles.timelineMediaInHandle;

            if (inHandle && (node.type === 'preset' || node.type === 'classic')) {
                const slot = inHandle.getAttribute('data-handle-in');
                const fromId = node.upload_slots?.[slot];
                if (fromId) {
                    const fromNode = getNode(fromId);
                    connectionCall('deleteUploadSlot', node.id, slot, { render: false });
                    if (fromNode) connectionCall('startConnection', fromNode, evt);
                    else renderCall('renderAll');
                }
                return;
            }
            if (configInHandle && (node.type === 'preset' || node.type === 'classic')) {
                const kind = configInHandle.getAttribute('data-config-in');
                reconnectEdge(findEdge(item => item.type === 'config' && item.to === node.id && item.slot === kind), evt);
                return;
            }
            if (resultInHandle && node.type === 'result') {
                reconnectEdge(findEdge(item => item.type === 'generate' && item.to === node.id), evt);
                return;
            }
            if (textInHandle && (node.type === 'preset' || node.type === 'classic')) {
                const slot = textInHandle.getAttribute('data-text-in');
                reconnectEdge(findEdge(item => item.type === 'text' && item.to === node.id && item.slot === slot), evt);
                return;
            }
            if (textNodeInHandle && (node.type === 'text' || node.type === 'text_merge')) {
                const slot = node.type === 'text_merge' ? (textNodeInHandle.getAttribute('data-text-node-in') || 'input_1') : 'input';
                reconnectEdge(findEdge(item => item.type === 'text' && item.to === node.id && item.slot === slot), evt);
                return;
            }
            if (translationTextInHandle && node.type === 'translation') {
                reconnectEdge(findEdge(item => item.type === 'text' && item.to === node.id && item.slot === 'input'), evt);
                return;
            }
            if (tagCartTextInHandle && node.type === 'tag_cart') {
                reconnectEdge(findEdge(item => item.type === 'text' && item.to === node.id && item.slot === 'input'), evt);
                return;
            }
            if (wd14ImageInHandle && node.type === 'wd14') {
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'image'), evt);
                return;
            }
            if (vlmImageInHandle && node.type === 'vlm') {
                const slot = vlmImageInHandle.getAttribute('data-vlm-image-in') || 'image_1';
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === slot), evt);
            }
            if (maskSourceInHandle && node.type === 'mask') {
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'source'), evt);
            }
            if (sam3VideoInHandle && node.type === 'sam3_video_mask') {
                reconnectEdge(findEdge(item => item.type === 'media' && item.to === node.id && item.slot === 'source'), evt);
            }
            if (poseReferenceInHandle && node.type === 'pose_studio') {
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'reference'), evt);
            }
            if (gaussianReferenceInHandle && node.type === 'gaussian_studio') {
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === 'reference'), evt);
            }
            if ((livePortraitSourceInHandle || livePortraitReferenceInHandle) && node.type === 'liveportrait_expression') {
                const slot = livePortraitReferenceInHandle ? 'reference' : 'source';
                reconnectEdge(findEdge(item => item.type === 'image' && item.to === node.id && item.slot === slot), evt);
            }
            if (qwenTtsAudioInHandle && nodeCall('isQwenTtsNode', false, node)) {
                const slot = qwenTtsAudioInHandle.getAttribute('data-qwen-tts-audio-in') || '';
                reconnectEdge(findEdge(item => item.type === 'media' && item.to === node.id && item.slot === slot), evt);
            }
            if (directorMediaInHandle && nodeCall('isDirectorTimelineNode', false, node)) {
                const slot = directorMediaInHandle.getAttribute('data-director-media-in') || '';
                reconnectEdge(findEdge(item => item.type === 'media' && item.to === node.id && item.slot === slot), evt);
            }
            if (directorMediaGroupInHandle && nodeCall('isDirectorTimelineNode', false, node)) {
                const kind = directorMediaGroupInHandle.getAttribute('data-director-media-group-in') || '';
                const edge = findEdge(item => item.type === 'media'
                    && item.to === node.id
                    && nodeCall('directorMediaSourceKind', '', getNode(item.from)) === kind);
                if (edge) {
                    reconnectEdge(edge, evt);
                    return;
                }
                uiCall('showToast', t('Drop a matching media output onto this pool.', '把同类型媒体输出拖到这个素材池入口。'));
                return;
            }
            if (compareImageInHandle && node.type === 'compare') {
                const slot = compareImageInHandle.getAttribute('data-compare-image-in') || 'a';
                reconnectEdge(findEdge(item => item.type === 'compare' && item.to === node.id && item.slot === slot), evt);
            }
            if (batchAnyInHandle && node.type === 'batch_any') {
                const edge = nodeCall('batchAnyInputEdgeForDrag', null, node);
                if (edge) {
                    reconnectEdge(edge, evt);
                    return;
                }
                uiCall('showToast', t('Drag text, image, video, audio, or result outputs into Batch Any.', '可把文本、图片、视频、音频或 Result 输出拖入 Batch Any。'));
            }
            if (timelineMediaInHandle && node.type === 'timeline') {
                uiCall('showToast', t('Drag a media node output into this timeline input, or use Add selected media.', '将媒体节点输出拖到 Timeline 输入，或使用“添加选中媒体”。'));
            }
        }

        function handleInputHandlePointerDownFromEvent(node, evt) {
            const target = evt?.target;
            if (!target || typeof target.closest !== 'function') return false;
            const inputHandles = {
                inHandle: target.closest('[data-handle-in]'),
                configInHandle: target.closest('[data-config-in]'),
                resultInHandle: target.closest('[data-handle-in-result]'),
                textInHandle: target.closest('[data-text-in]'),
                textNodeInHandle: target.closest('[data-text-node-in]'),
                translationTextInHandle: target.closest('[data-translation-text-in]'),
                tagCartTextInHandle: target.closest('[data-tagcart-text-in]'),
                wd14ImageInHandle: target.closest('[data-wd14-image-in]'),
                vlmImageInHandle: target.closest('[data-vlm-image-in]'),
                maskSourceInHandle: target.closest('[data-mask-source-in]'),
                sam3VideoInHandle: target.closest('[data-sam3-video-in]'),
                poseReferenceInHandle: target.closest('[data-pose-studio-reference-in]'),
                gaussianReferenceInHandle: target.closest('[data-gaussian-studio-reference-in]'),
                livePortraitSourceInHandle: target.closest('[data-liveportrait-expression-source-in]'),
                livePortraitReferenceInHandle: target.closest('[data-liveportrait-expression-reference-in]'),
                qwenTtsAudioInHandle: target.closest('[data-qwen-tts-audio-in]'),
                directorMediaInHandle: target.closest('[data-director-media-in]'),
                directorMediaGroupInHandle: target.closest('[data-director-media-group-in]'),
                compareImageInHandle: target.closest('[data-compare-image-in]'),
                batchAnyInHandle: target.closest('[data-batch-any-in]'),
                timelineMediaInHandle: target.closest('[data-timeline-media-in], [data-timeline-track-in]')
            };
            if (!Object.values(inputHandles).some(Boolean)) return false;
            evt.preventDefault();
            handleInputHandlePointerDown(node, evt, inputHandles);
            return true;
        }

        return {
            getConnectionTargetFromHandle,
            handleInputHandlePointerDown,
            handleInputHandlePointerDownFromEvent,
            openInputHandleContextMenu,
            openConfigHandleContextMenu,
            openTextHandleContextMenu,
            openTextNodeInputContextMenu,
            openWd14ImageInputContextMenu,
            openVlmImageInputContextMenu,
            openMaskSourceInputContextMenu,
            openPoseStudioReferenceContextMenu,
            openCompareImageInputContextMenu
        };
    }

    window.SimpAICanvasWorkbenchInputHandle = Object.assign({}, window.SimpAICanvasWorkbenchInputHandle || {}, {
        createCanvasInputHandleController
    });
})();
