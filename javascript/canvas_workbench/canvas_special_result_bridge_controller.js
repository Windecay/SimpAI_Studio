(function () {
    'use strict';

    const POSE = { type: 'pose_studio', title: 'Pose Studio', downstreamKey: 'downstream_pose_studio_id' };
    const GAUSSIAN = { type: 'gaussian_studio', title: 'Gaussian Studio', downstreamKey: 'downstream_gaussian_studio_id' };
    const LIVE = { type: 'liveportrait_expression', title: 'LivePortrait Exp', downstreamKey: 'downstream_liveportrait_expression_id' };

    function createCanvasSpecialResultBridgeController(context) {
        const scope = context?.specialResultBridgeSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const edgeSource = scope.edgeSource || {};
        const resultSource = scope.resultSource || {};
        const layoutSource = scope.layoutSource || {};
        const patchSource = scope.patchSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const buildReservedResultNode = options => call(resultSource, 'buildReservedResultNode', null, options);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const targetSlotFor = (spec, slot) => spec === LIVE && slot !== 'reference' ? 'source' : 'reference';

        function findOrCreateBridgeResultNode(fromPreset, targetNode, slot, spec) {
            const targetSlot = targetSlotFor(spec, slot);
            const project = getProject();
            const edges = project.edges || [];
            const existing = edges.filter(edge => edge.type === 'generate' && edge.from === fromPreset.id)
                .map(edge => getNode(edge.to))
                .find(node => node?.type === 'result' && edges.some(edge => edge.type === 'image'
                    && edge.from === node.id && edge.to === targetNode.id && edge.slot === targetSlot));
            if (existing) return existing;
            const size = call(layoutSource, 'defaultNodeSize', null, 'result');
            const fromRect = call(layoutSource, 'getNodeRect', null, fromPreset);
            const toRect = call(layoutSource, 'getNodeRect', null, targetNode);
            if (!size || !fromRect || !toRect) return null;
            const mid = {
                x: Math.round((fromRect.x + fromRect.w + toRect.x) / 2 - size.w / 2),
                y: Math.round((fromRect.y + toRect.y) / 2)
            };
            const node = buildReservedResultNode({
                position: mid,
                size,
                title: t('{title} Output', '{title} 输出').replace('{title}', fromPreset.title || 'Preset'),
                producer: { preset_node_id: fromPreset.id, run_id: null, task_id: null, expected_media_kind: 'image' },
                message: t('Auto bridge for {title} {slot}.', '为 {title} 的{slot}自动创建桥接。')
                    .replace('{title}', targetNode.title || spec.title)
                    .replace('{slot}', targetSlot === 'reference' ? t('reference', '参考图') : t('source', '源图')),
                source: {
                    kind: 'auto_bridge',
                    [spec.downstreamKey]: targetNode.id,
                    downstream_slot: targetSlot,
                    expected_media_kind: 'image'
                }
            });
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, mid, { excludeIds: [fromPreset.id, targetNode.id] });
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            return node;
        }

        function createBridgeEdge(fromId, toId, slot, options, spec) {
            const from = getNode(fromId);
            const to = getNode(toId);
            const targetSlot = targetSlotFor(spec, slot);
            const opts = options || {};
            if (!from || !to || !call(nodeSource, 'isImageProducingPresetNode', false, from) || to.type !== spec.type) {
                showToast((spec === LIVE
                    ? t('Preset output media type does not match {title} input.', 'Preset 输出类型与 {title} 输入不匹配')
                    : t('Preset output media type does not match {title} reference.', 'Preset 输出类型与 {title} 参考图不匹配'))
                    .replace('{title}', spec.title));
                return null;
            }
            if (call(nodeSource, 'isNodeLocked', false, from) || call(nodeSource, 'isNodeLocked', false, to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return null;
            }
            if (!opts.silent) call(historySource, 'pushHistory', undefined, `Connect preset output to ${spec.title}`);
            const resultNode = findOrCreateBridgeResultNode(from, to, targetSlot, spec);
            if (!resultNode) {
                showToast(t('Could not create the result bridge.', '无法创建 Result 桥接节点。'));
                return null;
            }
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'image' && edge.to === toId && edge.slot === targetSlot));
            call(edgeSource, 'ensureGenerateEdge', undefined, fromId, resultNode.id);
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'image', { from: resultNode.id, to: toId, slot: targetSlot }));
            const connectionPatch = spec === LIVE
                ? targetSlot === 'reference'
                    ? { referenceNodeId: resultNode.id, livePortraitReferenceNodeId: resultNode.id }
                    : { inputNodeId: resultNode.id, livePortraitSourceNodeId: resultNode.id }
                : { inputNodeId: resultNode.id };
            Object.assign(to, call(patchSource, 'buildSpecialNodeConnectionPatch', {}, to, connectionPatch));
            Object.assign(to, call(patchSource, 'buildSpecialNodeStatusPatch', {}, to, {
                status: call(patchSource, 'mergeCanvasRunStatus', to.status, to.status, 'ready',
                    targetSlot === 'reference'
                        ? t('Reference result bridge connected.', '参考图 Result 桥接已连接。')
                        : t('Source result bridge connected.', '源图 Result 桥接已连接。'))
            }));
            call(selectionSource, 'selectBridgeResult', undefined, resultNode.id, opts.select !== false);
            if (opts.render === false || opts.silent) return resultNode;
            call(renderSource, 'mutate', undefined);
            showToast(t('Preset output connected to {title} via Result bridge.', 'Preset 输出已通过 Result 桥接到 {title}')
                .replace('{title}', spec.title));
            return resultNode;
        }

        function findOrCreatePoseStudioBridgeResultNode(fromPreset, poseNode) {
            return findOrCreateBridgeResultNode(fromPreset, poseNode, 'reference', POSE);
        }
        function findOrCreateGaussianStudioBridgeResultNode(fromPreset, gaussianNode) {
            return findOrCreateBridgeResultNode(fromPreset, gaussianNode, 'reference', GAUSSIAN);
        }
        function findOrCreateLivePortraitExpressionBridgeResultNode(fromPreset, liveNode, slot) {
            return findOrCreateBridgeResultNode(fromPreset, liveNode, slot, LIVE);
        }
        function createPresetToPoseStudioReferenceBridgeEdge(fromId, toId, options) {
            return createBridgeEdge(fromId, toId, 'reference', options, POSE);
        }
        function createPresetToGaussianStudioReferenceBridgeEdge(fromId, toId, options) {
            return createBridgeEdge(fromId, toId, 'reference', options, GAUSSIAN);
        }
        function createPresetToLivePortraitExpressionImageBridgeEdge(fromId, toId, slot, options) {
            return createBridgeEdge(fromId, toId, slot, options, LIVE);
        }

        return {
            findOrCreatePoseStudioBridgeResultNode,
            findOrCreateGaussianStudioBridgeResultNode,
            findOrCreateLivePortraitExpressionBridgeResultNode,
            createPresetToPoseStudioReferenceBridgeEdge,
            createPresetToGaussianStudioReferenceBridgeEdge,
            createPresetToLivePortraitExpressionImageBridgeEdge
        };
    }

    window.SimpAICanvasWorkbenchSpecialResultBridge = Object.assign(
        {}, window.SimpAICanvasWorkbenchSpecialResultBridge || {}, { createCanvasSpecialResultBridgeController }
    );
})();
