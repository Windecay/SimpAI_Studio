(function () {
    'use strict';

    function createCanvasUploadConnectionController(context) {
        const scope = context?.uploadConnectionSource || context || {};
        const projectSource = scope.projectSource || {};
        const nodeSource = scope.nodeSource || {};
        const slotSource = scope.slotSource || {};
        const mediaSource = scope.mediaSource || {};
        const edgeSource = scope.edgeSource || {};
        const resultSource = scope.resultSource || {};
        const layoutSource = scope.layoutSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const renderSource = scope.renderSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const getProject = () => call(projectSource, 'getProject', {}) || {};
        const getNode = id => call(nodeSource, 'getNode', null, id);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const getSlotLabel = (node, slot) => call(slotSource, 'getSlotLabel', slot, node, slot);
        const buildReservedResultNode = options => call(resultSource, 'buildReservedResultNode', null, options);
        const visibleSlots = node => node ? call(slotSource,
            node.type === 'classic' ? 'getVisibleClassicUploadSlots' : 'getVisibleUploadSlots', [], node) : [];
        const allowedSlots = node => visibleSlots(node).map(item => item.key);
        const isLocked = node => !!call(nodeSource, 'isNodeLocked', false, node);

        function writeUploadConnection(fromId, to, slot, producerId) {
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'upload' && edge.to === to.id && edge.slot === slot));
            if (producerId) call(edgeSource, 'ensureGenerateEdge', undefined, producerId, fromId);
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'upload', { from: fromId, to: to.id, slot }));
            call(slotSource, 'applyPresetUploadSlotPatch', undefined, to, slot, fromId);
        }

        function findPendingUploadSlot(from, to, compatibility) {
            const slots = visibleSlots(to);
            const accepts = item => call(mediaSource, compatibility, false, from, item.key);
            return slots.find(item => !to.upload_slots?.[item.key] && accepts(item)) || slots.find(accepts);
        }

        function connectPendingUploadSource(from, to) {
            if (!from || !to || !['preset', 'classic'].includes(to.type)) return '';
            const slot = findPendingUploadSlot(from, to, 'canNodeConnectToUploadSlot');
            if (!slot) return '';
            writeUploadConnection(from.id, to, slot.key);
            call(renderSource, 'refreshPresetSpecialNodeDom', undefined, to, { syncViewer: true });
            return t('and connected to {slot} automatically', '并已自动连接到 {slot}')
                .replace('{slot}', getSlotLabel(to, slot.key));
        }

        function connectPendingPresetSource(from, to) {
            if (!from || !to || !['preset', 'classic'].includes(from.type)
                || !['preset', 'classic'].includes(to.type)) return '';
            const slot = findPendingUploadSlot(from, to, 'canPresetOutputConnectToUploadSlot');
            if (!slot) return '';
            const resultNode = findOrCreateBridgeResultNode(from, to, slot.key);
            if (!resultNode) {
                showToast(t('Could not create the result bridge.', '无法创建 Result 桥接节点。'));
                return '';
            }
            writeUploadConnection(resultNode.id, to, slot.key, from.id);
            call(slotSource, 'syncResolutionConfigForPresetInputs', undefined, to);
            return t('and inserted a result bridge into {slot}', '并已插入结果桥接到 {slot}')
                .replace('{slot}', getSlotLabel(to, slot.key));
        }

        function createUploadEdge(fromId, toId, slot, options) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !['preset', 'classic'].includes(to.type) || !allowedSlots(to).includes(slot)) {
                showToast(t('Can only connect to preset/classic input slots.', '只能连接到 preset/classic 输入槽'));
                return;
            }
            if (!call(mediaSource, 'canNodeConnectToUploadSlot', false, from, slot)) {
                showToast(t('The source media type does not match this preset slot.', '源媒体类型与当前 preset 槽位不匹配'));
                return;
            }
            if (isLocked(from) || isLocked(to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return;
            }
            if (!options || !options.silent) call(historySource, 'pushHistory', undefined, 'Connect upload edge');
            writeUploadConnection(fromId, to, slot);
            call(slotSource, 'syncResolutionConfigForPresetInputs', undefined, to);
            call(selectionSource, 'selectConnectionNode', undefined, toId);
            call(renderSource, 'refreshPresetSpecialNodeDom', undefined, to, { syncViewer: true });
            if (options && options.silent) return;
            call(renderSource, 'mutate', undefined);
            showToast(t('{slot} connected.', '{slot} 已连接').replace('{slot}', getSlotLabel(to, slot)));
        }

        function createPresetToPresetBridgeEdge(fromId, toId, slot) {
            const from = getNode(fromId);
            const to = getNode(toId);
            if (!from || !to || !['preset', 'classic'].includes(from.type)
                || !['preset', 'classic'].includes(to.type) || !allowedSlots(to).includes(slot)) {
                showToast(t('Preset/Classic output can only connect to a preset/classic input slot.',
                    'Preset/Classic 输出只能连接到 preset/classic 输入槽。'));
                return;
            }
            if (!call(mediaSource, 'canPresetOutputConnectToUploadSlot', false, from, slot)) {
                showToast(t('Preset output media type does not match this input slot.', 'Preset 输出媒体类型与当前输入槽不匹配。'));
                return;
            }
            if (isLocked(from) || isLocked(to)) {
                showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return;
            }
            call(historySource, 'pushHistory', undefined, 'Connect preset chain');
            const resultNode = findOrCreateBridgeResultNode(from, to, slot);
            if (!resultNode) {
                showToast(t('Could not create the result bridge.', '无法创建 Result 桥接节点。'));
                return;
            }
            writeUploadConnection(resultNode.id, to, slot, fromId);
            call(slotSource, 'syncResolutionConfigForPresetInputs', undefined, to);
            call(selectionSource, 'selectConnectionNode', undefined, resultNode.id);
            call(renderSource, 'refreshPresetSpecialNodeDom', undefined, to, { syncViewer: true });
            call(renderSource, 'mutate', undefined);
            showToast(t('Preset chain connected via {slot} result bridge.', 'Preset 链已通过 {slot} Result 桥接连接。')
                .replace('{slot}', getSlotLabel(to, slot)));
        }

        function findOrCreateBridgeResultNode(fromPreset, toPreset, slot) {
            const project = getProject();
            const edges = project.edges || [];
            const existing = edges
                .filter(edge => edge.type === 'generate' && edge.from === fromPreset.id)
                .map(edge => getNode(edge.to))
                .find(node => node?.type === 'result' && edges.some(edge => edge.type === 'upload'
                    && edge.from === node.id && edge.to === toPreset.id && edge.slot === slot));
            if (existing) return existing;
            const size = call(layoutSource, 'defaultNodeSize', null, 'result');
            const fromRect = call(layoutSource, 'getNodeRect', null, fromPreset);
            const toRect = call(layoutSource, 'getNodeRect', null, toPreset);
            if (!size || !fromRect || !toRect) return null;
            const mid = {
                x: Math.round((fromRect.x + fromRect.w + toRect.x) / 2 - size.w / 2),
                y: Math.round((fromRect.y + toRect.y) / 2)
            };
            const node = buildReservedResultNode({
                position: mid,
                size,
                title: t('{title} Output', '{title} 输出').replace('{title}', fromPreset.title || 'Preset'),
                producer: { preset_node_id: fromPreset.id, run_id: null, task_id: null },
                message: t('Auto bridge for {title} {slot}.', '为 {title} 的 {slot} 自动创建桥接。')
                    .replace('{title}', toPreset.title || t('downstream preset', '下游 preset'))
                    .replace('{slot}', getSlotLabel(toPreset, slot)),
                source: { kind: 'auto_bridge', downstream_preset_id: toPreset.id, downstream_slot: slot }
            });
            if (!node) return null;
            call(layoutSource, 'placeNodeAvoidingOverlap', undefined, node, mid, { excludeIds: [fromPreset.id, toPreset.id] });
            Object.assign(project, call(projectSource, 'buildProjectNodeAppendPatch', {}, project, node));
            return node;
        }

        return { createUploadEdge, createPresetToPresetBridgeEdge, findOrCreateBridgeResultNode,
            connectPendingUploadSource, connectPendingPresetSource };
    }

    window.SimpAICanvasWorkbenchUploadConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchUploadConnection || {}, { createCanvasUploadConnectionController }
    );
})();
