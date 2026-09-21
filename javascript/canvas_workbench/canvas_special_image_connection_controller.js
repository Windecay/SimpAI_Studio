(function () {
    'use strict';

    const POSE = {
        type: 'pose_studio', title: 'Pose Studio',
        predicate: 'isPoseStudioImageSource', bridge: 'createPresetToPoseStudioReferenceBridgeEdge'
    };
    const GAUSSIAN = {
        type: 'gaussian_studio', title: 'Gaussian Studio',
        predicate: 'isGaussianStudioImageSource', bridge: 'createPresetToGaussianStudioReferenceBridgeEdge'
    };
    const LIVE = {
        type: 'liveportrait_expression', title: 'LivePortrait Exp',
        predicate: 'isLivePortraitExpressionImageSource', bridge: 'createPresetToLivePortraitExpressionImageBridgeEdge'
    };

    function createCanvasSpecialImageConnectionController(context) {
        const scope = context?.specialImageConnectionSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const mediaSource = scope.mediaSource || {};
        const bridgeSource = scope.bridgeSource || {};
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
        const showToast = message => call(uiSource, 'showToast', undefined, message);

        function createPresetBridge(fromId, toId, targetSlot, options, spec) {
            return spec === LIVE
                ? call(bridgeSource, spec.bridge, undefined, fromId, toId, targetSlot, options)
                : call(bridgeSource, spec.bridge, undefined, fromId, toId, options);
        }

        function writeImageConnection(fromId, to, targetSlot, spec) {
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'image' && edge.to === to.id && edge.slot === targetSlot));
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'image', { from: fromId, to: to.id, slot: targetSlot }));
            const connectionPatch = spec === LIVE
                ? targetSlot === 'reference'
                    ? { referenceNodeId: fromId, livePortraitReferenceNodeId: fromId }
                    : { inputNodeId: fromId, livePortraitSourceNodeId: fromId }
                : { inputNodeId: fromId };
            Object.assign(to, call(patchSource, 'buildSpecialNodeConnectionPatch', {}, to, connectionPatch));
            const message = spec === LIVE
                ? targetSlot === 'reference'
                    ? t('Reference expression connected.', '参考表情已连接。')
                    : t('Source image connected.', '源图已连接。')
                : t('Reference image connected.', '参考图已连接。');
            Object.assign(to, call(patchSource, 'buildSpecialNodeStatusPatch', {}, to, {
                status: call(patchSource, 'mergeCanvasRunStatus', to.status, to.status, 'ready', message)
            }));
        }

        function createImageEdge(fromId, toId, slot, options, spec) {
            const from = call(nodeSource, 'getNode', null, fromId);
            const to = call(nodeSource, 'getNode', null, toId);
            const targetSlot = spec === LIVE && slot !== 'reference' ? 'source' : 'reference';
            if (from && to && ['preset', 'classic'].includes(from.type)) {
                return createPresetBridge(fromId, toId, targetSlot, options, spec);
            }
            if (!from || !to || !call(mediaSource, spec.predicate, false, from) || to.type !== spec.type) {
                showToast(spec === LIVE
                    ? t('LivePortrait Exp inputs only accept image/result nodes', 'LivePortrait Exp 输入只接受图像 / 结果节点')
                    : t('{title} reference only accepts image/result nodes', '{title} 参考图只接受图像 / 结果节点')
                        .replace('{title}', spec.title));
                return;
            }
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) {
                call(historySource, 'pushHistory', undefined,
                    spec === LIVE ? 'Connect LivePortrait Exp image input' : `Connect ${spec.title} reference`);
            }
            writeImageConnection(fromId, to, targetSlot, spec);
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            if (options && options.silent) return;
            call(renderSource, 'mutate', undefined);
            showToast(spec === LIVE
                ? targetSlot === 'reference'
                    ? t('LivePortrait Exp reference connected', 'LivePortrait Exp 参考表情已连接')
                    : t('LivePortrait Exp source connected', 'LivePortrait Exp 源图已连接')
                : t('{title} reference connected', '{title} 参考图已连接').replace('{title}', spec.title));
        }

        function connectPendingImageSource(from, to, spec) {
            if (!from || !to || to.type !== spec.type) return '';
            const slot = spec === LIVE ? 'source' : 'reference';
            if (spec !== GAUSSIAN && call(nodeSource, 'isImageProducingPresetNode', false, from)) {
                const result = createPresetBridge(from.id, to.id, slot,
                    { silent: true, render: false, select: false }, spec);
                if (!result) return '';
                return spec === LIVE
                    ? t('and inserted a Result bridge into LivePortrait Exp source', '并已插入 Result 桥接到 LivePortrait Exp 源图')
                    : t('and inserted a Result bridge into Pose Studio reference', '并已插入 Result 桥接到 Pose Studio 参考图');
            }
            if (!call(mediaSource, spec.predicate, false, from)) return '';
            writeImageConnection(from.id, to, slot, spec);
            return spec === LIVE
                ? t('connected to LivePortrait Exp source', '已连接到 LivePortrait Exp 源图')
                : t('connected to {title} reference', '已连接到 {title} 参考图').replace('{title}', spec.title);
        }

        function connectPendingPoseSource(from, to) {
            return connectPendingImageSource(from, to, POSE);
        }
        function connectPendingGaussianSource(from, to) {
            return connectPendingImageSource(from, to, GAUSSIAN);
        }
        function connectPendingLivePortraitSource(from, to) {
            return connectPendingImageSource(from, to, LIVE);
        }

        function createPoseStudioReferenceEdge(fromId, toId, options) {
            return createImageEdge(fromId, toId, 'reference', options, POSE);
        }
        function createGaussianStudioReferenceEdge(fromId, toId, options) {
            return createImageEdge(fromId, toId, 'reference', options, GAUSSIAN);
        }
        function createLivePortraitExpressionImageEdge(fromId, toId, slot, options) {
            return createImageEdge(fromId, toId, slot, options, LIVE);
        }

        return { createPoseStudioReferenceEdge, createGaussianStudioReferenceEdge, createLivePortraitExpressionImageEdge,
            connectPendingPoseSource, connectPendingGaussianSource, connectPendingLivePortraitSource };
    }

    window.SimpAICanvasWorkbenchSpecialImageConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchSpecialImageConnection || {}, { createCanvasSpecialImageConnectionController }
    );
})();
