(function () {
    'use strict';

    function createCanvasBatchAnyEditController(context) {
        const scope = context?.batchAnyEditSource || context || {};
        const nodeSource = scope.nodeSource || {};
        const projectSource = scope.projectSource || {};
        const batchSource = scope.batchSource || {};
        const edgeSource = scope.edgeSource || {};
        const selectionSource = scope.selectionSource || {};
        const historySource = scope.historySource || {};
        const persistenceSource = scope.persistenceSource || {};
        const renderSource = scope.renderSource || {};
        const timeSource = scope.timeSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const uiSource = scope.uiSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const clamp = (value, min, max) => call(utilitySource, 'clamp', Math.max(min, Math.min(max, value)), value, min, max);
        const applyBatchAnyStatePatch = (node, options) => call(batchSource, 'applyBatchAnyStatePatch', undefined, node, options);
        const nowIso = () => call(timeSource, 'nowIso', '');
        const mutate = options => call(renderSource, 'mutate', undefined, options);
        const scheduleSave = () => call(persistenceSource, 'scheduleSave', undefined);
        const selectedNodeId = () => call(selectionSource, 'getSelectedNodeId', null);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function batchAnyCurrentItem(node) {
            const items = Array.isArray(node?.items) ? node.items : [];
            const index = clamp(Number(node?.current_index || 0), 0, Math.max(items.length - 1, 0));
            return items[index] || null;
        }

        function batchAnySelectedItemIds(node) {
            const items = Array.isArray(node?.items) ? node.items : [];
            const valid = new Set(items.map(item => item?.id).filter(Boolean));
            const selected = Array.isArray(node?.batch?.selected_item_ids) ? node.batch.selected_item_ids : [];
            return selected.filter(id => valid.has(id));
        }

        function setBatchAnySelectedItemIds(node, ids) {
            if (!node || node.type !== 'batch_any') return [];
            const items = Array.isArray(node.items) ? node.items : [];
            const valid = new Set(items.map(item => item?.id).filter(Boolean));
            const next = Array.from(new Set(ids || [])).filter(id => valid.has(id));
            applyBatchAnyStatePatch(node, { batchPatch: { selected_item_ids: next } });
            return next;
        }

        function refreshBatchAnyActiveItem(node) {
            if (!node || node.type !== 'batch_any') return null;
            const items = Array.isArray(node.items) ? node.items : [];
            const currentIndex = clamp(Number(node.current_index || 0), 0, Math.max(items.length - 1, 0));
            const current = items[currentIndex] || null;
            const statePatch = {
                current_index: currentIndex,
                asset: current?.asset || null,
                media_kind: items[0]?.media_kind || ''
            };
            const patchOptions = {
                statePatch,
                batchPatch: { selected_item_ids: batchAnySelectedItemIds(node) }
            };
            if (current?.media_kind === 'text') {
                patchOptions.textPatch = {
                    value: call(batchSource, 'batchAnyTextFromItem', '', current),
                    updated_at: current.added_at || nowIso()
                };
            } else if (node.text) {
                patchOptions.textPatch = { value: '', updated_at: nowIso() };
            }
            applyBatchAnyStatePatch(node, patchOptions);
            return current;
        }

        function setBatchAnyCurrentItem(node, index, options) {
            if (!node || node.type !== 'batch_any') return null;
            const items = Array.isArray(node.items) ? node.items : [];
            const nextIndex = clamp(Number(index || 0), 0, Math.max(items.length - 1, 0));
            const item = items[nextIndex] || null;
            const patchOptions = {
                statePatch: {
                    current_index: nextIndex,
                    asset: item?.asset || null,
                    media_kind: call(batchSource, 'batchAnyMediaKind', '', node) || item?.media_kind || ''
                },
                sourcePatch: {
                    kind: 'batch_any',
                    active_item_id: item?.id || '',
                    active_item_index: item ? nextIndex : -1,
                    active_item_name: item?.name || ''
                }
            };
            if (item?.media_kind === 'text') {
                patchOptions.textPatch = {
                    value: call(batchSource, 'batchAnyTextFromItem', '', item),
                    updated_at: item.added_at || nowIso()
                };
            }
            applyBatchAnyStatePatch(node, patchOptions);
            if (options?.render !== false) mutate({ inspector: true });
            else scheduleSave();
            return item;
        }

        function selectBatchAnyItem(node, index, options) {
            if (!node || node.type !== 'batch_any') return null;
            const opts = options || {};
            const items = Array.isArray(node.items) ? node.items : [];
            const nextIndex = clamp(Number(index || 0), 0, Math.max(items.length - 1, 0));
            const item = setBatchAnyCurrentItem(node, nextIndex, { render: false });
            if (!item) return null;
            const selected = new Set(batchAnySelectedItemIds(node));
            if (opts.shiftKey && selected.size) {
                const indexes = items
                    .map((entry, itemIndex) => selected.has(entry?.id) ? itemIndex : -1)
                    .filter(itemIndex => itemIndex >= 0);
                const anchor = indexes.length ? indexes[indexes.length - 1] : nextIndex;
                const start = Math.min(anchor, nextIndex);
                const end = Math.max(anchor, nextIndex);
                for (let i = start; i <= end; i += 1) {
                    if (items[i]?.id) selected.add(items[i].id);
                }
            } else if (opts.toggleKey) {
                if (selected.has(item.id)) selected.delete(item.id);
                else selected.add(item.id);
                if (!selected.size) selected.add(item.id);
            } else {
                selected.clear();
                selected.add(item.id);
            }
            setBatchAnySelectedItemIds(node, Array.from(selected));
            mutate({ inspector: selectedNodeId() === node.id });
            return item;
        }

        function batchAnyInputEdges(node) {
            if (!node || node.type !== 'batch_any') return [];
            const project = call(projectSource, 'getProject', {}) || {};
            return project.edges.filter(edge => edge.type === 'batch_input' && edge.to === node.id);
        }

        function batchAnyInputEdgeForDrag(node) {
            const current = batchAnyCurrentItem(node);
            const edges = batchAnyInputEdges(node);
            if (!edges.length) return null;
            if (current?.source_edge_id) {
                const edge = edges.find(item => item.id === current.source_edge_id);
                if (edge) return edge;
            }
            if (current?.id) {
                const edge = edges.find(item => item.slot === current.id);
                if (edge) return edge;
            }
            return edges[edges.length - 1] || null;
        }

        function deleteBatchAnyItems(node, itemIds, options) {
            const opts = options || {};
            if (!node || node.type !== 'batch_any') return false;
            if (call(nodeSource, 'isNodeLocked', false, node)) {
                if (opts.toast !== false) call(uiSource, 'showToast', undefined,
                    t('Locked node cannot be edited', '锁定节点不能编辑'));
                return false;
            }
            const ids = new Set((itemIds || []).filter(Boolean));
            if (!ids.size) return false;
            const items = Array.isArray(node.items) ? node.items : [];
            const removed = items.filter(item => ids.has(item?.id));
            if (!removed.length) return false;
            if (opts.history !== false) call(historySource, 'pushHistory', undefined,
                removed.length > 1 ? 'Delete Batch Any items' : 'Delete Batch Any item');
            const edgeIds = new Set(removed.map(item => item?.source_edge_id).filter(Boolean));
            applyBatchAnyStatePatch(node, {
                statePatch: { items: items.filter(item => !ids.has(item?.id)) }
            });
            call(edgeSource, 'filterProjectEdges', undefined,
                edge => !(edge.type === 'batch_input' && edge.to === node.id && (ids.has(edge.slot) || edgeIds.has(edge.id))));
            setBatchAnySelectedItemIds(node, batchAnySelectedItemIds(node).filter(id => !ids.has(id)));
            refreshBatchAnyActiveItem(node);
            if (opts.render === false) scheduleSave();
            else mutate({ inspector: selectedNodeId() === node.id });
            return true;
        }

        function openBatchAnyInputContextMenu(node, x, y) {
            const edges = batchAnyInputEdges(node);
            const items = Array.isArray(node?.items) ? node.items : [];
            const itemByEdgeId = new Map(items.map(item => [item?.source_edge_id, item]).filter(pair => pair[0]));
            const menuItems = edges.map(edge => {
                const item = itemByEdgeId.get(edge.id) || items.find(entry => entry?.id === edge.slot) || null;
                const source = call(nodeSource, 'getNode', null, edge.from);
                return {
                    label: t('Disconnect {name}', '断开 {name}').replace('{name}', item?.name || source?.title || source?.id || edge.from || t('source', '来源')),
                    icon: 'fa-link-slash',
                    action: () => call(edgeSource, 'deleteEdge', undefined, edge.id)
                };
            });
            menuItems.push({
                label: edges.length ? t('Disconnect all sources', '断开全部来源') : call(uiSource, 'notConnectedText', ''),
                icon: edges.length ? 'fa-link-slash' : 'fa-circle',
                disabled: !edges.length,
                danger: true,
                action: () => {
                    if (!edges.length) return;
                    call(historySource, 'pushHistory', undefined, 'Disconnect Batch Any sources');
                    edges.forEach(edge => call(edgeSource, 'deleteEdge', undefined, edge.id, { render: false, history: false }));
                    mutate({ inspector: selectedNodeId() === node.id });
                }
            });
            call(uiSource, 'openContextMenu', undefined, x, y, menuItems);
        }

        return {
            batchAnyCurrentItem, batchAnySelectedItemIds, setBatchAnySelectedItemIds, refreshBatchAnyActiveItem,
            setBatchAnyCurrentItem, selectBatchAnyItem, batchAnyInputEdges, batchAnyInputEdgeForDrag,
            deleteBatchAnyItems, openBatchAnyInputContextMenu
        };
    }

    window.SimpAICanvasWorkbenchBatchAnyEdit = Object.assign(
        {}, window.SimpAICanvasWorkbenchBatchAnyEdit || {}, { createCanvasBatchAnyEditController }
    );
})();
