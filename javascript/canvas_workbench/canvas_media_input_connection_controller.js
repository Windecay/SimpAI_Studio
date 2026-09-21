(function () {
    'use strict';

    function createCanvasMediaInputConnectionController(context) {
        const scope = context?.mediaInputConnectionSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const mediaSource = scope.mediaSource || {};
        const slotSource = scope.slotSource || {};
        const edgeSource = scope.edgeSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const buildWd14StatePatch = (...args) => call(patchSource, 'buildWd14StatePatch', {}, ...args);
        const buildVlmImageInputsPatch = (...args) => call(patchSource, 'buildVlmImageInputsPatch', {}, ...args);
        const buildVlmRunStatusPatch = (...args) => call(patchSource, 'buildVlmRunStatusPatch', {}, ...args);
        const buildMaskStatePatch = (...args) => call(patchSource, 'buildMaskStatePatch', {}, ...args);
        const buildSam3SourcePatch = (...args) => call(patchSource, 'buildSam3SourcePatch', {}, ...args);
        const buildSam3StatePatch = (...args) => call(patchSource, 'buildSam3StatePatch', {}, ...args);
        const buildQwenTtsStatePatch = (...args) => call(patchSource, 'buildQwenTtsStatePatch', {}, ...args);
        const buildCompareStatePatch = (...args) => call(patchSource, 'buildCompareStatePatch', {}, ...args);
        const mergeCanvasRunStatus = (...args) => call(patchSource, 'mergeCanvasRunStatus', {}, ...args);

        function replaceConnectionEdge(type, edge) {
            call(edgeSource, 'filterProjectEdges', undefined,
                item => !(item.type === type && item.to === edge.to && item.slot === edge.slot));
            call(edgeSource, 'appendProjectEdge', undefined, call(edgeSource, 'buildCanvasEdge', null, type, edge));
        }

        function beginConnection(from, to, type, edge, options, historyLabel) {
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定节点不能修改连接'));
                return false;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, historyLabel);
            replaceConnectionEdge(type, edge);
            return true;
        }

        function finishConnection(toId, options, en, cn) {
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            if (options && options.silent) return;
            call(renderSource, 'mutate', undefined);
            showToast(t(en, cn));
        }

        function writeWd14State(to, fromId) {
            Object.assign(to, buildWd14StatePatch(to, {
                inputNodeId: fromId,
                status: mergeCanvasRunStatus(to.status, 'ready', t('Image connected.', '图像已连接。'))
            }));
        }

        function writeVlmState(to, fromId, targetSlot, automatic) {
            Object.assign(to, buildVlmImageInputsPatch(to, {
                imageInputsPatch: { [targetSlot]: fromId }
            }));
            Object.assign(to, buildVlmRunStatusPatch(to, automatic
                ? { state: 'ready', message: t('Image connected.', '图像已连接。') }
                : { status: mergeCanvasRunStatus(to.status, 'ready', t('Media connected.', '媒体已连接。')) }));
        }

        function writeQwenState(to, fromId, targetSlot, label) {
            Object.assign(to, buildQwenTtsStatePatch(to, {
                audioInputsPatch: { [targetSlot]: fromId },
                status: mergeCanvasRunStatus(to.status, 'ready', t(`${label} connected.`, `${label} 已连接。`))
            }));
        }

        function writeCompareState(to, fromId, targetSlot) {
            Object.assign(to, buildCompareStatePatch(to, {
                inputsPatch: { [targetSlot]: fromId }
            }));
        }

        function createWd14ImageEdge(fromId, toId, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !['image', 'result'].includes(from.type) || to.type !== 'wd14') {
                showToast(t('WD14 image input only accepts image/result nodes', 'WD14 图像输入只接受图像 / 结果节点'));
                return;
            }
            if (!beginConnection(from, to, 'image', { from: fromId, to: toId, slot: 'image' }, options, 'Connect WD14 image')) return;
            writeWd14State(to, fromId);
            finishConnection(toId, options, 'WD14 image connected', 'WD14 图像已连接');
        }

        function createVlmImageEdge(fromId, toId, slot, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const chatMode = (to?.params?.mode || 'single') === 'chat';
            const slots = call(slotSource, 'getVlmImageSlots', []) || [];
            const targetSlot = chatMode ? 'image_1' : (slots.some(item => item.key === slot) ? slot : 'image_1');
            if (!from || !to || !call(mediaSource, 'isVlmMediaSource', false, from)
                || to.type !== 'vlm' || (chatMode && !['image', 'result'].includes(from.type))) {
                showToast(chatMode
                    ? t('VLM chat input only accepts image/result nodes', 'VLM 聊天输入只接受图像 / 结果节点')
                    : t('VLM media inputs only accept image/result/video nodes', 'VLM 媒体输入只接受图像 / 结果 / 视频节点'));
                return;
            }
            if (!beginConnection(from, to, 'image', { from: fromId, to: toId, slot: targetSlot }, options, 'Connect VLM image')) return;
            writeVlmState(to, fromId, targetSlot, false);
            finishConnection(toId, options, `${targetSlot} connected to VLM`, `${targetSlot} 已连接到 VLM`);
        }

        function createMaskImageEdge(fromId, toId, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !['image', 'result'].includes(from.type) || to.type !== 'mask') {
                showToast(t('Advanced Masking source only accepts image/result nodes', '高级遮罩来源只接受图像 / 结果节点'));
                return;
            }
            if (!beginConnection(from, to, 'image', { from: fromId, to: toId, slot: 'source' }, options, 'Connect mask source')) return;
            Object.assign(to, buildMaskStatePatch(to, {
                inputNodeId: fromId,
                status: mergeCanvasRunStatus(to.status, 'ready', t('Source image connected.', '源图已连接。'))
            }));
            finishConnection(toId, options, 'Advanced Masking source connected', '高级遮罩来源已连接');
        }

        function createSam3VideoMaskEdge(fromId, toId, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !call(mediaSource, 'isSam3VideoMaskSource', false, from) || to.type !== 'sam3_video_mask') {
                showToast(t('SAM3 Video Mask source only accepts video/result nodes', 'SAM3 视频遮罩来源只接受视频 / 结果节点'));
                return;
            }
            if (!beginConnection(from, to, 'media', { from: fromId, to: toId, slot: 'source' }, options, 'Connect SAM3 video source')) return;
            Object.assign(to, buildSam3SourcePatch(to, { inputNodeId: fromId }));
            Object.assign(to, buildSam3StatePatch(to, {
                status: mergeCanvasRunStatus(to.status, 'ready', t('Source video connected.', '源视频已连接。'))
            }));
            finishConnection(toId, options, 'SAM3 video source connected', 'SAM3 视频来源已连接');
        }

        function createQwenTtsAudioEdge(fromId, toId, slot, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const slots = call(slotSource, 'qwenTtsAudioInputSlots', [], to) || [];
            const targetSlot = slots.some(item => item.key === slot) ? slot : (slots[0]?.key || '');
            if (!from || !to || !call(mediaSource, 'isQwenTtsAudioSource', false, from)
                || !call(nodeSource, 'isQwenTtsNode', false, to) || !targetSlot) {
                showToast(t('Qwen TTS reference inputs only accept Audio nodes or audio Result nodes.', 'Qwen TTS 参考输入只接受音频节点或音频结果节点。'));
                return;
            }
            if (!beginConnection(from, to, 'media', { from: fromId, to: toId, slot: targetSlot }, options, 'Connect Qwen TTS reference audio')) return;
            writeQwenState(to, fromId, targetSlot, targetSlot);
            finishConnection(toId, options, 'Qwen TTS reference audio connected', 'Qwen TTS 参考音频已连接');
        }

        function createCompareImageEdge(fromId, toId, slot, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const targetSlot = ['a', 'b'].includes(slot) ? slot : 'a';
            if (!from || !to || !call(mediaSource, 'isImageCompareSource', false, from) || to.type !== 'compare') {
                showToast(t('Compare inputs only accept Image nodes or image Result nodes', '对比输入只接受图像节点或图像结果节点'));
                return;
            }
            if (!beginConnection(from, to, 'compare', { from: fromId, to: toId, slot: targetSlot }, options, 'Connect compare image')) return;
            writeCompareState(to, fromId, targetSlot);
            finishConnection(toId, options, `Compare Image ${targetSlot.toUpperCase()} connected`, `对比图像 ${targetSlot.toUpperCase()} 已连接`);
        }

        function connectPendingWd14Source(from, to) {
            if (!from || !to || !['image', 'result'].includes(from.type) || to.type !== 'wd14') return '';
            replaceConnectionEdge('image', { from: from.id, to: to.id, slot: 'image' });
            writeWd14State(to, from.id);
            return t('connected to WD14 image input', '已连接到 WD14 图像输入');
        }

        function connectPendingVlmSource(from, to) {
            if (!from || !to || to.type !== 'vlm' || !call(mediaSource, 'isVlmMediaSource', false, from)) return '';
            const chatMode = (to.params?.mode || 'single') === 'chat';
            if (chatMode && !['image', 'result'].includes(from.type)) return '';
            const slots = call(slotSource, 'getVlmImageSlots', []) || [];
            const slot = chatMode ? slots[0] : (slots.find(item => !to.image_inputs?.[item.key]) || slots[0]);
            if (!slot) return '';
            replaceConnectionEdge('image', { from: from.id, to: to.id, slot: slot.key });
            writeVlmState(to, from.id, slot.key, true);
            return chatMode ? t('connected to VLM chat input', '已接入 VLM 聊天输入')
                : t('connected to VLM {slot}', '已连接到 VLM {slot}').replace('{slot}', slot.label);
        }

        function connectPendingQwenSource(from, to) {
            if (!from || !to || !call(nodeSource, 'isQwenTtsNode', false, to)
                || !call(mediaSource, 'isQwenTtsAudioSource', false, from)) return '';
            const slots = call(slotSource, 'qwenTtsAudioInputSlots', [], to) || [];
            const slot = slots.find(item => !to.audio_inputs?.[item.key]) || slots[0];
            if (!slot) return '';
            const label = slot.label || slot.key;
            replaceConnectionEdge('media', { from: from.id, to: to.id, slot: slot.key });
            writeQwenState(to, from.id, slot.key, label);
            return t('connected to {slot}', '已连接到 {slot}').replace('{slot}', label);
        }

        function connectPendingCompareSource(from, to) {
            if (!from || !to || to.type !== 'compare' || !call(mediaSource, 'isImageCompareSource', false, from)) return '';
            const slot = !to.inputs?.a ? 'a' : 'b';
            replaceConnectionEdge('compare', { from: from.id, to: to.id, slot });
            writeCompareState(to, from.id, slot);
            return t('connected to Compare Image {slot}', '已连接到对比图像 {slot}').replace('{slot}', slot.toUpperCase());
        }

        return {
            createWd14ImageEdge, createVlmImageEdge, createMaskImageEdge, createSam3VideoMaskEdge,
            createQwenTtsAudioEdge, createCompareImageEdge,
            connectPendingWd14Source, connectPendingVlmSource, connectPendingQwenSource, connectPendingCompareSource
        };
    }

    window.SimpAICanvasWorkbenchMediaInputConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchMediaInputConnection || {}, { createCanvasMediaInputConnectionController }
    );
})();
