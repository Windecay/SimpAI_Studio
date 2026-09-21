(function () {
    'use strict';

    function createCanvasBatchAnyConnectionController(context) {
        const scope = context?.batchAnyConnectionSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const batchSource = scope.batchSource || {};
        const patchSource = scope.patchSource || {};
        const edgeSource = scope.edgeSource || {};
        const historySource = scope.historySource || {};
        const selectionSource = scope.selectionSource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const timeSource = scope.timeSource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };
        const showToast = message => call(uiSource, 'showToast', undefined, message);
        const buildTextBatchItemFromSource = (...args) => call(patchSource, 'buildTextBatchItemFromSource', null, ...args);
        const buildMediaBatchItemFromSource = (...args) => call(patchSource, 'buildMediaBatchItemFromSource', null, ...args);
        const buildBatchAnyItemStatePatch = (...args) => call(patchSource, 'buildBatchAnyItemStatePatch', null, ...args);
        const applyBatchAnyStatePatch = (...args) => call(patchSource, 'applyBatchAnyStatePatch', undefined, ...args);

        function createBatchAnyItemFromSourceNode(source, kind) {
            if (kind === 'text') {
                const text = call(batchSource, 'batchAnySourceText', '', source);
                if (!source) return null;
                return buildTextBatchItemFromSource(source, text);
            }
            const asset = call(batchSource, 'batchAnySourceAsset', null, source);
            if (!source || !asset) return null;
            return buildMediaBatchItemFromSource(source, kind, asset);
        }

        function addSourceNodeToBatchAny(source, node, options) {
            const opts = options || {};
            if (!source || !node || node.type !== 'batch_any') return null;
            if (call(nodeSource, 'isNodeLocked', false, source) || call(nodeSource, 'isNodeLocked', false, node)) {
                if (opts.toast !== false) showToast(t('Locked nodes cannot change connections', '锁定的节点不能修改连接'));
                return null;
            }
            if (!call(batchSource, 'isBatchAnySourceNode', false, source)) {
                if (opts.toast !== false) showToast(t('Batch Any accepts text, image, video, audio, and result outputs.', 'Batch Any 可接入文本、图片、视频、音频和 Result 输出。'));
                return null;
            }
            const kind = call(batchSource, 'batchAnySourceMediaKind', '', source);
            if (!call(batchSource, 'batchAnyAcceptsMediaKind', false, node, kind)) {
                if (opts.toast !== false) showToast(t('This Batch Any already uses another media type.', '这个 Batch Any 已经使用另一种素材类型。'));
                return null;
            }
            let item = createBatchAnyItemFromSourceNode(source, kind);
            if (!item) {
                if (opts.toast !== false) showToast(t('No usable batch item found on source node.', '来源节点没有可用批量项。'));
                return null;
            }
            if (opts.history !== false) call(historySource, 'pushHistory', undefined, 'Add Batch Any source');
            const items = Array.isArray(node.items) ? node.items.slice() : [];
            const mediaKind = node.media_kind || kind;
            const edgeId = call(nodeSource, 'uid', '', 'edge');
            const itemWithEdge = buildBatchAnyItemStatePatch(item, { sourceEdgeId: edgeId });
            if (itemWithEdge && typeof itemWithEdge === 'object') item = itemWithEdge;
            items.push(item);
            call(edgeSource, 'appendProjectEdge', undefined,
                call(edgeSource, 'buildCanvasEdge', null, 'batch_input', {
                    id: edgeId, from: source.id, to: node.id, slot: item.id, media_kind: kind
                }));
            const patchOptions = {
                statePatch: { items, media_kind: mediaKind },
                batchPatch: { state: 'idle', last_error: '' }
            };
            if (items.length === 1) {
                patchOptions.statePatch.current_index = 0;
                patchOptions.statePatch.asset = item.asset || null;
                if (item.media_kind === 'text') {
                    patchOptions.textPatch = {
                        value: call(batchSource, 'batchAnyTextFromItem', '', item),
                        updated_at: item.added_at || call(timeSource, 'nowIso', '')
                    };
                }
            }
            applyBatchAnyStatePatch(node, patchOptions);
            if (opts.select !== false) call(selectionSource, 'selectBatchNode', undefined, node.id);
            if (opts.render === false) call(persistenceSource, 'scheduleSave', undefined);
            else call(renderSource, 'mutate', undefined, {
                inspector: call(selectionSource, 'getSelectedNodeId', null) === node.id
            });
            if (opts.toast !== false) {
                showToast(t('Added {name} to Batch Any.', '已加入 Batch Any：{name}').replace('{name}', item.name || source.id));
            }
            return item;
        }

        function createBatchAnyInputEdge(fromId, toId, options) {
            return addSourceNodeToBatchAny(call(nodeSource, 'getNode', null, fromId),
                call(nodeSource, 'getNode', null, toId), options);
        }

        function connectPendingBatchSource(from, node) {
            const item = addSourceNodeToBatchAny(from, node, { history: false, render: false, select: false, toast: false });
            return item ? t('and added {name} as a batch item', '并已把 {name} 加入批量素材').replace('{name}', item.name || from.id) : '';
        }

        return { createBatchAnyItemFromSourceNode, addSourceNodeToBatchAny, createBatchAnyInputEdge, connectPendingBatchSource };
    }

    window.SimpAICanvasWorkbenchBatchAnyConnection = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyConnection || {}, { createCanvasBatchAnyConnectionController }
    );
})();
