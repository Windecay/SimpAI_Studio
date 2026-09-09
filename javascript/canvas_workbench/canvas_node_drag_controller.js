(function () {
    'use strict';

    function createCanvasNodeDragController(context) {
        const scope = context || {};
        const getProject = () => typeof scope.getProject === 'function' ? (scope.getProject() || {}) : {};
        const getDocument = () => typeof scope.getDocument === 'function'
            ? scope.getDocument()
            : (typeof document !== 'undefined' ? document : null);
        const getNode = (id) => typeof scope.getNode === 'function' ? scope.getNode(id) : null;
        const getSelectedNodeIds = () => typeof scope.getSelectedNodeIds === 'function' ? (scope.getSelectedNodeIds() || new Set()) : new Set();
        const isNodeLocked = (node) => typeof scope.isNodeLocked === 'function' ? !!scope.isNodeLocked(node) : false;
        const t = typeof scope.t === 'function' ? scope.t : (en) => en;
        const getPerformanceNow = () => typeof scope.performanceNow === 'function'
            ? scope.performanceNow()
            : (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
        const call = (name, ...args) => typeof scope[name] === 'function' ? scope[name](...args) : undefined;
        const snapCanvasCoord = (value) => typeof scope.snapCanvasCoord === 'function' ? scope.snapCanvasCoord(value) : value;
        let dragState = null;

        function startNodeDrag(node, evt) {
            call('hideCanvasTooltip');
            call('hideHoverPreview');
            call('closePreviewSelectMenu');
            call('setSuppressWheelUntil', getPerformanceNow() + 420);
            const selectedNodeIds = getSelectedNodeIds();
            const initialIds = selectedNodeIds.has(node.id) ? Array.from(selectedNodeIds) : [node.id];
            const movableIds = initialIds.filter((id) => !isNodeLocked(getNode(id)));
            if (!movableIds.length) {
                call('showToast', t('Locked node cannot be moved', '节点已锁定，无法移动。'));
                return;
            }
            if (movableIds.length < initialIds.length) call('showToast', t('Locked nodes stayed in place', '锁定节点保持原位。'));
            try { evt.target?.setPointerCapture?.(evt.pointerId); } catch (err) {}
            dragState = {
                pointerId: evt.pointerId,
                nodeId: node.id,
                nodeIds: movableIds,
                historyPushed: false,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                starts: {}
            };
            dragState.nodeIds.forEach((id) => {
                const item = getNode(id);
                if (item) dragState.starts[id] = { x: item.x || 0, y: item.y || 0 };
            });
            call('beginDragEdgeLod');
            const doc = getDocument();
            doc?.addEventListener('pointermove', onNodeDragMove, true);
            doc?.addEventListener('pointerup', stopNodeDrag, true);
            doc?.addEventListener('pointercancel', stopNodeDrag, true);
        }

        function onNodeDragMove(evt) {
            if (!dragState || evt.pointerId !== dragState.pointerId) return;
            evt.preventDefault();
            const project = getProject();
            const zoom = project.viewport?.zoom || 1;
            const dx = (evt.clientX - dragState.startClientX) / zoom;
            const dy = (evt.clientY - dragState.startClientY) / zoom;
            if (!dragState.historyPushed && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
                call('pushHistory', 'Move node');
                dragState.historyPushed = true;
            }
            dragState.nodeIds.forEach((id) => {
                const node = getNode(id);
                const start = dragState.starts[id];
                if (!node || !start) return;
                let nextX = start.x + dx;
                let nextY = start.y + dy;
                if (project.settings?.snap) {
                    nextX = snapCanvasCoord(nextX);
                    nextY = snapCanvasCoord(nextY);
                }
                node.x = Math.round(nextX);
                node.y = Math.round(nextY);
            });
            const nodeIds = dragState.nodeIds.slice();
            call('updateNodePositionDom', nodeIds);
            call('scheduleInteractiveLinkRender', { nodeIds });
            call('invalidateMinimapStaticCache');
            call('invalidateNodeSpatialIndex');
            call('scheduleMinimapRender');
        }

        function stopNodeDrag(evt) {
            if (!dragState) return;
            if (evt && evt.pointerId !== dragState.pointerId) return;
            const useDragEdgeLod = !!call('isDragEdgeLodActive');
            dragState = null;
            const doc = getDocument();
            doc?.removeEventListener('pointermove', onNodeDragMove, true);
            doc?.removeEventListener('pointerup', stopNodeDrag, true);
            doc?.removeEventListener('pointercancel', stopNodeDrag, true);
            call('scheduleSave');
            if (useDragEdgeLod) call('scheduleDragEdgeSettleRender');
            else call('flushInteractiveLinkRender');
            call('flushMinimapRender');
        }

        return {
            startNodeDrag,
            onNodeDragMove,
            stopNodeDrag,
            isDragging: () => !!dragState,
            getDraggingNodeIds: () => dragState ? dragState.nodeIds.slice() : [],
            isDraggingNode: (nodeId) => !!dragState?.nodeIds?.includes?.(nodeId)
        };
    }

    window.SimpAICanvasWorkbenchNodeDrag = Object.assign({}, window.SimpAICanvasWorkbenchNodeDrag || {}, {
        createCanvasNodeDragController
    });
})();
