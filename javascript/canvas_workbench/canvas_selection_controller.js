(function () {
    'use strict';

    function createCanvasSelectionController(context) {
        const scope = context || {};
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const t = typeof scope.t === 'function' ? scope.t : ((en, cn) => cn || en);
        const applyNodeLayoutPatch = (node, options) => {
            const patch = call('buildNodeLayoutPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const applyNodeFlagPatch = (node, flag, value) => {
            if (flag === 'collapsed') {
                applyNodeLayoutPatch(node, { collapsed: value });
                return;
            }
            const patch = call('buildNodeFlagPatch', node, { [flag]: value });
            if (patch && typeof patch === 'object' && Object.prototype.hasOwnProperty.call(patch, flag)) {
                Object.assign(node, patch);
                return;
            }
            Object.assign(node, { [flag]: !!value });
        };
        const setTimer = typeof scope.setTimeout === 'function'
            ? scope.setTimeout
            : (typeof setTimeout === 'function' ? setTimeout : (() => 0));

        function selectionState() {
            const state = typeof scope.getSelectionState === 'function'
                ? (scope.getSelectionState() || {})
                : scope;
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
            if (typeof scope.setSelectionState === 'function') scope.setSelectionState(state);
            else Object.assign(scope, state);
            return state;
        }

        function selectedNodeIds(state) {
            return state?.selectedNodeIds instanceof Set
                ? new Set(state.selectedNodeIds)
                : new Set(Array.isArray(state?.selectedNodeIds) ? state.selectedNodeIds : []);
        }

        function updateSelectionDomClasses() {
            const state = selectionState();
            const nodesLayer = call('getNodesLayer');
            if (nodesLayer) {
                Array.from(nodesLayer.querySelectorAll?.('[data-node-id]') || []).forEach((nodeEl) => {
                    const id = nodeEl.getAttribute?.('data-node-id');
                    nodeEl.classList?.toggle('is-selected', id === state.selectedNodeId || state.selectedNodeIds.has(id));
                    nodeEl.classList?.toggle('is-focused', id === state.selectedNodeId);
                });
            }
            const edgesLayer = call('getEdgesLayer');
            if (edgesLayer) {
                Array.from(edgesLayer.querySelectorAll?.('[data-edge-id]') || []).forEach((edgeEl) => {
                    edgeEl.classList?.toggle('is-selected', edgeEl.getAttribute?.('data-edge-id') === state.selectedEdgeId);
                });
            }
            const groupsLayer = call('getGroupsLayer');
            if (groupsLayer) {
                Array.from(groupsLayer.querySelectorAll?.('[data-group-id]') || []).forEach((groupEl) => {
                    groupEl.classList?.toggle('is-selected', groupEl.getAttribute?.('data-group-id') === state.selectedGroupId);
                });
            }
        }

        function refreshSelectionUi() {
            call('invalidateMinimapStaticCache');
            if ((call('getCanvasRenderMode') || '') === 'overview') call('renderNodes');
            else updateSelectionDomClasses();
            call('renderEdges');
            setTimer(() => call('renderEdges'), 140);
            call('renderSelectedChainOverlay');
            call('renderInspector');
            call('renderMinimap');
            call('renderCanvasAgentPanel');
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
            call('renderAll');
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
            call('renderAll');
        }

        function getSelectedNodeIdList() {
            const state = selectionState();
            if (!state.selectedNodeIds.size) return [];
            return Array.from(state.selectedNodeIds).filter(id => call('getNode', id));
        }

        function toggleSelectedNodesFlag(flag) {
            if (!['locked', 'ignored', 'collapsed'].includes(flag)) return;
            const nodes = getSelectedNodeIdList().map(id => call('getNode', id)).filter(Boolean);
            if (!nodes.length) {
                call('showToast', t('No selected nodes', '没有选中的节点'));
                return;
            }
            const nextValue = !nodes.every(node => !!node[flag]);
            call('pushHistory', flag === 'locked'
                ? t('Toggle node lock', '切换节点锁定')
                : (flag === 'ignored' ? t('Toggle node skip', '切换节点跳过') : t('Toggle node collapse', '切换节点折叠')));
            nodes.forEach((node) => {
                applyNodeFlagPatch(node, flag, nextValue);
            });
            call('mutate');
            const label = flag === 'locked'
                ? (nextValue ? t('Locked', '已锁定') : t('Unlocked', '已解锁'))
                : (flag === 'ignored'
                    ? (nextValue ? t('Skipped', '已跳过') : t('Enabled', '已启用'))
                    : (nextValue ? t('Collapsed', '已折叠') : t('Expanded', '已展开')));
            call('showToast', `${label} ${nodes.length} ${t('node(s)', '个节点')}`);
        }

        function getEditableSelectedNodes(minCount) {
            const nodes = getSelectedNodeIdList().map(id => call('getNode', id)).filter(Boolean);
            const movable = nodes.filter(node => !call('isNodeLocked', node));
            if (movable.length < minCount) {
                call('showToast', minCount > 2
                    ? t('Select at least 3 unlocked nodes', '请至少选择 3 个未锁定节点')
                    : t('Select at least 2 unlocked nodes', '请至少选择 2 个未锁定节点'));
                return [];
            }
            if (movable.length < nodes.length) call('showToast', t('Locked nodes stayed in place', '已锁定节点保持原位'));
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
                layout.x = call('snapCanvasCoord', hasX ? layout.x : node.x);
                layout.y = call('snapCanvasCoord', hasY ? layout.y : node.y);
            }
            applyNodeLayoutPatch(node, layout);
        }

        function alignSelectedNodes(kind) {
            const nodes = getEditableSelectedNodes(2);
            if (!nodes.length) return;
            const rects = nodes.map(node => ({ node, rect: call('getNodeRect', node) }));
            const minX = Math.min(...rects.map(item => item.rect.x));
            const maxX = Math.max(...rects.map(item => item.rect.x + item.rect.w));
            const minY = Math.min(...rects.map(item => item.rect.y));
            const maxY = Math.max(...rects.map(item => item.rect.y + item.rect.h));
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            call('pushHistory', t('Align nodes', '对齐节点'));
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
            call('mutate');
        }

        function distributeSelectedNodes(axis) {
            const nodes = getEditableSelectedNodes(3);
            if (!nodes.length) return;
            const items = nodes.map(node => ({ node, rect: call('getNodeRect', node) }))
                .sort((a, b) => axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y);
            const first = items[0];
            const last = items[items.length - 1];
            const totalSize = items.reduce((sum, item) => sum + (axis === 'x' ? item.rect.w : item.rect.h), 0);
            const start = axis === 'x' ? first.rect.x : first.rect.y;
            const end = axis === 'x' ? last.rect.x + last.rect.w : last.rect.y + last.rect.h;
            const gap = (end - start - totalSize) / Math.max(1, items.length - 1);
            call('pushHistory', t('Distribute nodes', '分布节点'));
            let cursor = start;
            items.forEach((item, index) => {
                if (index > 0) cursor += gap;
                applyPositionPatch(item.node, axis === 'x'
                    ? { x: Math.round(cursor) }
                    : { y: Math.round(cursor) });
                cursor += axis === 'x' ? item.rect.w : item.rect.h;
            });
            call('mutate');
        }

        function selectEdge(id) {
            writeSelection({
                selectedEdgeId: id || null,
                selectedNodeId: null,
                selectedNodeIds: new Set(),
                selectedGroupId: null
            });
            call('renderAll');
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
