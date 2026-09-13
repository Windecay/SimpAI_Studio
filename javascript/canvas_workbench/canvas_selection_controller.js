(function () {
    'use strict';

    function createCanvasSelectionController(context) {
        const scope = context || {};
        const sourceObject = (name) => {
            const value = scope[name];
            return value && typeof value === 'object' ? value : {};
        };
        const languageSource = sourceObject('languageSource');
        const languageCall = (name, fallback, ...args) => typeof languageSource[name] === 'function'
            ? languageSource[name](...args)
            : fallback;
        const getLanguageState = (...args) => languageCall('getLanguageState', { __lang: 'en' }, ...args);
        const t = (...args) => {
            const en = args[0] || '';
            const cn = args.length > 1 ? args[1] : en;
            const state = args.length > 2 ? args[2] : getLanguageState();
            return languageCall('t', cn || en, en, cn, state);
        };
        const projectSource = sourceObject('projectSource');
        const projectCall = (name, fallback, ...args) => typeof projectSource[name] === 'function'
            ? projectSource[name](...args)
            : fallback;
        const selectionSource = sourceObject('selectionSource');
        const selectionCall = (name, fallback, ...args) => typeof selectionSource[name] === 'function'
            ? selectionSource[name](...args)
            : fallback;
        const domSource = sourceObject('domSource');
        const domCall = (name, fallback, ...args) => typeof domSource[name] === 'function'
            ? domSource[name](...args)
            : fallback;
        const nodeSource = sourceObject('nodeSource');
        const nodeCall = (name, fallback, ...args) => typeof nodeSource[name] === 'function'
            ? nodeSource[name](...args)
            : fallback;
        const layoutSource = sourceObject('layoutSource');
        const layoutCall = (name, fallback, ...args) => typeof layoutSource[name] === 'function'
            ? layoutSource[name](...args)
            : fallback;
        const viewportSource = sourceObject('viewportSource');
        const viewportCall = (name, fallback, ...args) => typeof viewportSource[name] === 'function'
            ? viewportSource[name](...args)
            : fallback;
        const patchSource = sourceObject('patchSource');
        const patchCall = (name, fallback, ...args) => typeof patchSource[name] === 'function'
            ? patchSource[name](...args)
            : fallback;
        const renderSource = sourceObject('renderSource');
        const renderCall = (name, fallback, ...args) => typeof renderSource[name] === 'function'
            ? renderSource[name](...args)
            : fallback;
        const minimapSource = sourceObject('minimapSource');
        const minimapCall = (name, fallback, ...args) => typeof minimapSource[name] === 'function'
            ? minimapSource[name](...args)
            : fallback;
        const historySource = sourceObject('historySource');
        const historyCall = (name, fallback, ...args) => typeof historySource[name] === 'function'
            ? historySource[name](...args)
            : fallback;
        const uiStateSource = sourceObject('uiStateSource');
        const uiStateCall = (name, fallback, ...args) => typeof uiStateSource[name] === 'function'
            ? uiStateSource[name](...args)
            : fallback;
        const runtimeSource = sourceObject('runtimeSource');
        const getProject = () => projectCall('getProject', {}) || {};
        const getSelectionState = () => selectionCall('getSelectionState', selectionSource) || {};
        const setSelectionState = (next) => {
            if (typeof selectionSource.setSelectionState === 'function') selectionSource.setSelectionState(next);
            else Object.assign(selectionSource, next || {});
        };
        const getNode = (id) => nodeCall('getNode', null, id);
        const isNodeLocked = (node) => !!nodeCall('isNodeLocked', false, node);
        const getNodeRect = (node) => layoutCall('getNodeRect', { x: 0, y: 0, w: 0, h: 0 }, node);
        const snapCanvasCoord = (value) => viewportCall('snapCanvasCoord', value, value);
        const applyNodeLayoutPatch = (node, options) => {
            const patch = patchCall('buildNodeLayoutPatch', null, node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const applyNodeFlagPatch = (node, flag, value) => {
            if (flag === 'collapsed') {
                applyNodeLayoutPatch(node, { collapsed: value });
                return;
            }
            const patch = patchCall('buildNodeFlagPatch', null, node, { [flag]: value });
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, flag)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, { [flag]: !!value });
        };
        const setTimer = typeof runtimeSource.setTimeout === 'function'
            ? runtimeSource.setTimeout
            : (typeof setTimeout === 'function' ? setTimeout : (() => 0));

        function selectionState() {
            const state = getSelectionState();
            return {
                selectedNodeId: state.selectedNodeId || null,
                selectedNodeIds: state.selectedNodeIds instanceof Set
                    ? new Set(state.selectedNodeIds)
                    : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []),
                selectedEdgeId: state.selectedEdgeId || null,
                selectedGroupId: state.selectedGroupId || null
            };
        }

        function writeSelection(next) {
            const state = Object.assign(selectionState(), next || {});
            state.selectedNodeIds = state.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state.selectedNodeIds) ? state.selectedNodeIds : []);
            setSelectionState(state);
            return state;
        }

        function selectedNodeIds(state) {
            return state?.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state?.selectedNodeIds) ? state.selectedNodeIds : []);
        }

        function updateSelectionDomClasses() {
            const state = selectionState();
            const nodesLayer = domCall('getNodesLayer', null);
            if (nodesLayer) {
                Array.from(nodesLayer.querySelectorAll?.('[data-node-id]') || []).forEach((nodeEl) => {
                    const id = nodeEl.getAttribute?.('data-node-id');
                    nodeEl.classList?.toggle('is-selected', id === state.selectedNodeId || state.selectedNodeIds.has(id));
                    nodeEl.classList?.toggle('is-focused', id === state.selectedNodeId);
                });
            }
            const edgesLayer = domCall('getEdgesLayer', null);
            if (edgesLayer) {
                Array.from(edgesLayer.querySelectorAll?.('[data-edge-id]') || []).forEach((edgeEl) => {
                    edgeEl.classList?.toggle('is-selected', edgeEl.getAttribute?.('data-edge-id') === state.selectedEdgeId);
                });
            }
            const groupsLayer = domCall('getGroupsLayer', null);
            if (groupsLayer) {
                Array.from(groupsLayer.querySelectorAll?.('[data-group-id]') || []).forEach((groupEl) => {
                    groupEl.classList?.toggle('is-selected', groupEl.getAttribute?.('data-group-id') === state.selectedGroupId);
                });
            }
        }

        function refreshSelectionUi() {
            minimapCall('invalidateMinimapStaticCache', undefined);
            if ((viewportCall('getCanvasRenderMode', '') || '') === 'overview') renderCall('renderNodes', undefined);
            else updateSelectionDomClasses();
            renderCall('renderEdges', undefined);
            setTimer(() => renderCall('renderEdges', undefined), 140);
            renderCall('renderSelectedChainOverlay', undefined);
            renderCall('renderInspector', undefined);
            minimapCall('renderMinimap', undefined);
            uiStateCall('renderCanvasAgentPanel', undefined);
        }

        function selectNodeLight(id) {
            const state = selectionState();
            const nextId = id || null;
            if (state.selectedNodeId === nextId
                && state.selectedEdgeId === null
                && state.selectedNodeIds.size === (nextId ? 1 : 0)
                && (!nextId || state.selectedNodeIds.has(nextId))) return;
            writeSelection({
                selectedNodeId: nextId,
                selectedNodeIds: new Set(nextId ? [nextId] : []),
                selectedEdgeId: null,
                selectedGroupId: null
            });
            refreshSelectionUi();
        }

        function toggleNodeSelectionLight(id) {
            if (!id) return;
            const state = selectionState();
            const ids = selectedNodeIds(state);
            if (ids.has(id)) {
                ids.delete(id);
                if (state.selectedNodeId === id) state.selectedNodeId = Array.from(ids)[0] || null;
            } else {
                ids.add(id);
                state.selectedNodeId = id;
            }
            writeSelection({
                selectedNodeId: state.selectedNodeId,
                selectedNodeIds: ids,
                selectedEdgeId: null,
                selectedGroupId: null
            });
            refreshSelectionUi();
        }

        function selectGroupLight(id) {
            const state = selectionState();
            const nextId = id || null;
            if (state.selectedGroupId === nextId
                && !state.selectedNodeId
                && !state.selectedEdgeId
                && !state.selectedNodeIds.size) return;
            writeSelection({
                selectedGroupId: nextId,
                selectedNodeId: null,
                selectedNodeIds: new Set(),
                selectedEdgeId: null
            });
            refreshSelectionUi();
        }

        function selectNode(id) {
            const nextId = id || null;
            writeSelection({
                selectedNodeId: nextId,
                selectedNodeIds: new Set(nextId ? [nextId] : []),
                selectedEdgeId: null,
                selectedGroupId: null
            });
            renderCall('renderAll', undefined);
        }

        function toggleNodeSelection(id) {
            if (!id) return;
            const state = selectionState();
            const ids = selectedNodeIds(state);
            if (ids.has(id)) {
                ids.delete(id);
                if (state.selectedNodeId === id) state.selectedNodeId = Array.from(ids)[0] || null;
            } else {
                ids.add(id);
                state.selectedNodeId = id;
            }
            writeSelection({
                selectedNodeId: state.selectedNodeId,
                selectedNodeIds: ids,
                selectedEdgeId: null,
                selectedGroupId: null
            });
            renderCall('renderAll', undefined);
        }

        function getSelectedNodeIdList() {
            const state = selectionState();
            if (!state.selectedNodeIds.size) return [];
            return Array.from(state.selectedNodeIds).filter(id => getNode(id));
        }

        function toggleSelectedNodesFlag(flag) {
            if (!['locked', 'ignored', 'collapsed'].includes(flag)) return;
            const nodes = getSelectedNodeIdList().map(id => getNode(id)).filter(Boolean);
            if (!nodes.length) {
                uiStateCall('showToast', undefined, t('No selected nodes', '没有选中的节点'));
                return;
            }
            const nextValue = !nodes.every(node => !!node[flag]);
            historyCall('pushHistory', undefined, flag === 'locked'
                ? t('Toggle node lock', '切换节点锁定')
                : (flag === 'ignored' ? t('Toggle node skip', '切换节点跳过') : t('Toggle node collapse', '切换节点折叠')));
            nodes.forEach((node) => {
                applyNodeFlagPatch(node, flag, nextValue);
            });
            uiStateCall('mutate', undefined);
            const label = flag === 'locked'
                ? (nextValue ? t('Locked', '已锁定') : t('Unlocked', '已解锁'))
                : (flag === 'ignored'
                    ? (nextValue ? t('Skipped', '已跳过') : t('Enabled', '已启用'))
                    : (nextValue ? t('Collapsed', '已折叠') : t('Expanded', '已展开')));
            uiStateCall('showToast', undefined, `${label} ${nodes.length} ${t('node(s)', '个节点')}`);
        }

        function getEditableSelectedNodes(minCount) {
            const nodes = getSelectedNodeIdList().map(id => getNode(id)).filter(Boolean);
            const movable = nodes.filter(node => !isNodeLocked(node));
            if (movable.length < minCount) {
                uiStateCall('showToast', undefined, minCount > 2
                    ? t('Select at least 3 unlocked nodes', '请至少选择 3 个未锁定节点')
                    : t('Select at least 2 unlocked nodes', '请至少选择 2 个未锁定节点'));
                return [];
            }
            if (movable.length < nodes.length) uiStateCall('showToast', undefined, t('Locked nodes stayed in place', '已锁定节点保持原位'));
            return movable;
        }

        function applyPositionPatch(node, position) {
            const next = position || {};
            const layout = {};
            const hasX = Object.prototype.hasOwnProperty.call(next, 'x');
            const hasY = Object.prototype.hasOwnProperty.call(next, 'y');
            if (hasX) layout.x = next.x;
            if (hasY) layout.y = next.y;
            if (getProject().settings?.snap) {
                layout.x = snapCanvasCoord(hasX ? layout.x : node.x);
                layout.y = snapCanvasCoord(hasY ? layout.y : node.y);
            }
            applyNodeLayoutPatch(node, layout);
        }

        function alignSelectedNodes(kind) {
            const nodes = getEditableSelectedNodes(2);
            if (!nodes.length) return;
            const rects = nodes.map(node => ({ node, rect: getNodeRect(node) }));
            const minX = Math.min(...rects.map(item => item.rect.x));
            const maxX = Math.max(...rects.map(item => item.rect.x + item.rect.w));
            const minY = Math.min(...rects.map(item => item.rect.y));
            const maxY = Math.max(...rects.map(item => item.rect.y + item.rect.h));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            historyCall('pushHistory', undefined, t('Align nodes', '对齐节点'));
            rects.forEach(({ node, rect }) => {
                const next = {};
                if (kind === 'left') next.x = minX;
                else if (kind === 'right') next.x = maxX - rect.w;
                else if (kind === 'center-x') next.x = Math.round(centerX - rect.w / 2);
                else if (kind === 'top') next.y = minY;
                else if (kind === 'bottom') next.y = maxY - rect.h;
                else if (kind === 'center-y') next.y = Math.round(centerY - rect.h / 2);
                applyPositionPatch(node, next);
            });
            uiStateCall('mutate', undefined);
        }

        function distributeSelectedNodes(axis) {
            const nodes = getEditableSelectedNodes(3);
            if (!nodes.length) return;
            const items = nodes.map(node => ({ node, rect: getNodeRect(node) }))
                .sort((a, b) => axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);
            const first = items[0];
            const last = items[items.length - 1];
            const totalSize = items.reduce((sum, item) => sum + (axis === 'x' ? item.rect.w : item.rect.h), 0);
            const start = axis === 'x' ? first.rect.x : first.rect.y;
            const end = axis === 'x' ? last.rect.x + last.rect.w : last.rect.y + last.rect.h;
            const gap = (end - start - totalSize) / Math.max(1, items.length - 1);
            historyCall('pushHistory', undefined, t('Distribute nodes', '分布节点'));
            let cursor = start;
            items.forEach((item, index) => {
                if (index > 0) cursor += gap;
                applyPositionPatch(item.node, axis === 'x'
                    ? { x: Math.round(cursor) }
                    : { y: Math.round(cursor) });
                cursor += axis === 'x' ? item.rect.w : item.rect.h;
            });
            uiStateCall('mutate', undefined);
        }

        function selectEdge(id) {
            writeSelection({
                selectedEdgeId: id || null,
                selectedNodeId: null,
                selectedNodeIds: new Set(),
                selectedGroupId: null
            });
            renderCall('renderAll', undefined);
        }

        return {
            updateSelectionDomClasses,
            refreshSelectionUi,
            selectNodeLight,
            toggleNodeSelectionLight,
            selectGroupLight,
            selectNode,
            toggleNodeSelection,
            getSelectedNodeIdList,
            toggleSelectedNodesFlag,
            getEditableSelectedNodes,
            alignSelectedNodes,
            distributeSelectedNodes,
            selectEdge
        };
    }

    window.SimpAICanvasWorkbenchSelection = Object.assign({}, window.SimpAICanvasWorkbenchSelection || {}, {
        createCanvasSelectionController
    });
})();
