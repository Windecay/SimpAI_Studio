(function () {
    'use strict';

    function createCanvasGroupInteractionController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getGroupsLayer = () => typeof scope.getGroupsLayer === 'function' ? scope.getGroupsLayer() : null;
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getGroup = (id) => typeof scope.getGroup === 'function' ? scope.getGroup(id) : null;
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const getNodesInsideGroup = (group) => typeof scope.getNodesInsideGroup === 'function'
            ? (scope.getNodesInsideGroup(group) || [])
            : [];
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const getSelectedGroupId = () => typeof scope.getSelectedGroupId === 'function' ? scope.getSelectedGroupId() : null;
        const t = typeof scope.t === 'function' ? scope.t : (en) => en;
        const showToast = (message) => {
            if (typeof scope.showToast === 'function') scope.showToast(message);
        };
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const applyNodeLayoutPatch = (node, options) => {
            const patch = call('buildNodeLayoutPatch', node, options || {});
            if (patch && typeof patch === 'object') Object.assign(node, patch);
        };
        const applyGroupFieldPatch = (group, key, value) => {
            const patch = call('buildGroupFieldPatch', group, key, value);
            if (patch && typeof patch === 'object') Object.assign(group, patch);
        };
        const snapCanvasCoord = (value) => typeof scope.snapCanvasCoord === 'function' ? scope.snapCanvasCoord(value) : value;
        const snapCanvasSizeFromOrigin = (origin, value, min, max) => typeof scope.snapCanvasSizeFromOrigin === 'function'
            ? scope.snapCanvasSizeFromOrigin(origin, value, min, max)
            : value;
        let groupDragState = null;
        let groupResizeState = null;

        function selectGroupLight(groupId) {
            call('selectGroupLight', groupId);
        }

        function openGroupContextMenu(group, clientX, clientY) {
            call('openGroupContextMenu', group, clientX, clientY);
        }

        function startGroupDrag(group, evt) {
            if (!group || group.locked) {
                showToast(t('Group position is locked.', '分组位置已锁定。'));
                return;
            }
            const insideNodes = getNodesInsideGroup(group).filter(node => !isNodeLocked(node));
            try { evt.target?.setPointerCapture?.(evt.pointerId); } catch (err) {}
            groupDragState = {
                pointerId: evt.pointerId,
                groupId: group.id,
                historyPushed: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: group.x || 0,
                startY: group.y || 0,
                nodes: insideNodes.map(node => ({ id: node.id, x: node.x || 0, y: node.y || 0 }))
            };
            call('beginDragEdgeLod');
            const doc = getDocument();
            doc?.addEventListener('pointermove', onGroupDragMove, true);
            doc?.addEventListener('pointerup', stopGroupDrag, true);
            doc?.addEventListener('pointercancel', stopGroupDrag, true);
        }

        function startGroupResize(group, evt) {
            if (!group || group.locked) {
                showToast(t('Group position is locked.', '分组位置已锁定。'));
                return;
            }
            groupResizeState = {
                groupId: group.id,
                pointerId: evt.pointerId,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startX: Number(group.x || 0),
                startY: Number(group.y || 0),
                startW: Number(group.w || 360),
                startH: Number(group.h || 240),
                historyPushed: false
            };
            evt.target?.setPointerCapture?.(evt.pointerId);
            const doc = getDocument();
            doc?.addEventListener('pointermove', onGroupResizeMove, true);
            doc?.addEventListener('pointerup', stopGroupResize, true);
            doc?.addEventListener('pointercancel', stopGroupResize, true);
        }

        function onGroupResizeMove(evt) {
            if (!groupResizeState || evt.pointerId !== groupResizeState.pointerId) return;
            const group = getGroup(groupResizeState.groupId);
            if (!group) return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const rawW = Math.max(180, Math.round(groupResizeState.startW + (evt.clientX - groupResizeState.startClientX) / zoom));
            const rawH = Math.max(120, Math.round(groupResizeState.startH + (evt.clientY - groupResizeState.startClientY) / zoom));
            const nextW = project.settings?.snap
                ? snapCanvasSizeFromOrigin(groupResizeState.startX, rawW, 180, Number.POSITIVE_INFINITY)
                : rawW;
            const nextH = project.settings?.snap
                ? snapCanvasSizeFromOrigin(groupResizeState.startY, rawH, 120, Number.POSITIVE_INFINITY)
                : rawH;
            if (!groupResizeState.historyPushed && (Math.abs(nextW - groupResizeState.startW) > 1 || Math.abs(nextH - groupResizeState.startH) > 1)) {
                call('pushHistory', 'Resize area group');
                groupResizeState.historyPushed = true;
            }
            applyGroupFieldPatch(group, 'w', nextW);
            applyGroupFieldPatch(group, 'h', nextH);
            call('updateGroupPositionDom', group.id);
            call('invalidateMinimapStaticCache');
            call('invalidateNodeSpatialIndex');
            call('scheduleMinimapRender');
        }

        function stopGroupResize(evt) {
            if (!groupResizeState) return;
            if (evt && evt.pointerId !== groupResizeState.pointerId) return;
            groupResizeState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onGroupResizeMove, true);
            doc?.removeEventListener('pointerup', stopGroupResize, true);
            doc?.removeEventListener('pointercancel', stopGroupResize, true);
            call('scheduleSave');
            call('flushMinimapRender');
            if (getSelectedGroupId()) call('renderInspector');
        }

        function onGroupDragMove(evt) {
            if (!groupDragState || evt.pointerId !== groupDragState.pointerId) return;
            evt.preventDefault();
            const group = getGroup(groupDragState.groupId);
            if (!group) return;
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            let nextX = groupDragState.startX + (evt.clientX - groupDragState.startClientX) / zoom;
            let nextY = groupDragState.startY + (evt.clientY - groupDragState.startClientY) / zoom;
            if (project.settings?.snap) {
                nextX = snapCanvasCoord(nextX);
                nextY = snapCanvasCoord(nextY);
            }
            const dx = Math.round(nextX) - groupDragState.startX;
            const dy = Math.round(nextY) - groupDragState.startY;
            if (!groupDragState.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                call('pushHistory', 'Move area group');
                groupDragState.historyPushed = true;
            }
            applyGroupFieldPatch(group, 'x', groupDragState.startX + dx);
            applyGroupFieldPatch(group, 'y', groupDragState.startY + dy);
            groupDragState.nodes.forEach((item) => {
                const node = getNode(item.id);
                if (!node) return;
                applyNodeLayoutPatch(node, {
                    x: Math.round(item.x + dx),
                    y: Math.round(item.y + dy)
                });
            });
            call('updateGroupPositionDom', group.id);
            const nodeIds = groupDragState.nodes.map(item => item.id);
            call('updateNodePositionDom', nodeIds);
            call('scheduleInteractiveLinkRender', { nodeIds });
            call('invalidateMinimapStaticCache');
            call('invalidateNodeSpatialIndex');
            call('scheduleMinimapRender');
        }

        function stopGroupDrag(evt) {
            if (!groupDragState) return;
            if (evt && evt.pointerId !== groupDragState.pointerId) return;
            const useDragEdgeLod = !!call('isDragEdgeLodActive');
            groupDragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onGroupDragMove, true);
            doc?.removeEventListener('pointerup', stopGroupDrag, true);
            doc?.removeEventListener('pointercancel', stopGroupDrag, true);
            call('scheduleSave');
            if (useDragEdgeLod) call('scheduleDragEdgeSettleRender');
            else call('flushInteractiveLinkRender');
            call('flushMinimapRender');
            call('renderInspector');
        }

        function bindGroupLayerEvents() {
            const groupsLayer = getGroupsLayer();
            if (!groupsLayer || groupsLayer.__simpaiGroupEventsBound) return;
            groupsLayer.__simpaiGroupEventsBound = true;
            groupsLayer.addEventListener('pointerdown', (evt) => {
                const target = evt.target;
                const resizeHandle = target?.closest?.('[data-group-resize-handle]');
                if (resizeHandle) {
                    if (evt.button !== 0) return;
                    const groupEl = target.closest('[data-group-id]');
                    const group = groupEl ? getGroup(groupEl.getAttribute('data-group-id')) : null;
                    if (!group) return;
                    evt.preventDefault();
                    evt.stopPropagation();
                    selectGroupLight(group.id);
                    startGroupResize(group, evt);
                    return;
                }
                const handle = target?.closest?.('[data-group-drag-handle]');
                const groupEl = target?.closest?.('[data-group-id]');
                if (!handle || !groupEl || evt.button !== 0) return;
                const group = getGroup(groupEl.getAttribute('data-group-id'));
                if (!group) return;
                evt.preventDefault();
                evt.stopPropagation();
                selectGroupLight(group.id);
                startGroupDrag(group, evt);
            });
            groupsLayer.addEventListener('click', (evt) => {
                const groupEl = evt.target?.closest?.('[data-group-id]');
                if (!groupEl) return;
                evt.preventDefault();
                evt.stopPropagation();
                selectGroupLight(groupEl.getAttribute('data-group-id'));
            });
            groupsLayer.addEventListener('contextmenu', (evt) => {
                const groupEl = evt.target?.closest?.('[data-group-id]');
                if (!groupEl) return;
                evt.preventDefault();
                evt.stopPropagation();
                const group = getGroup(groupEl.getAttribute('data-group-id'));
                if (group) openGroupContextMenu(group, evt.clientX, evt.clientY);
            });
        }

        return {
            bindGroupLayerEvents,
            isGroupDragging: () => !!groupDragState,
            isGroupResizing: () => !!groupResizeState
        };
    }

    window.SimpAICanvasWorkbenchGroupInteraction = Object.assign({}, window.SimpAICanvasWorkbenchGroupInteraction || {}, {
        createCanvasGroupInteractionController
    });
})();
